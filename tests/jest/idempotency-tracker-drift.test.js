/**
 * Idempotency tracker drift detector — IDEMPOTENCY-COVERAGE.md ↔ snippet wrappers.
 *
 * Round 29 drift sweep discovered F1 HIGH bug: tracker listed
 * `POST /b2b/v1/bo-fulfill` as "integrated" since Round 19, but actual code in
 * `[B2B] Snippet 16` had NO `dinoco_idempotency_check` wrapper. The tracker
 * lied — only the contract test existed (testing pure hash logic, not wrapper
 * presence). Round 30 fixed bo-fulfill, but the same drift could recur for any
 * future endpoint if tracker entry is committed before wrapper code lands
 * (or if a refactor accidentally removes a wrapper).
 *
 * This detector parses IDEMPOTENCY-COVERAGE.md "Integrated endpoints" table,
 * extracts (endpoint, snippet_filename) tuples, then asserts each snippet file
 * contains the idempotency wrapper signature (`dinoco_idempotency_check` call
 * site). One assertion per integrated endpoint.
 *
 * False positives (intentionally tolerated):
 *   • If 1 snippet file holds N integrated endpoints (typical), 1 wrapper
 *     occurrence is sufficient — we don't try to match per-endpoint scope
 *     (that would require AST parsing). Concentrating on file-level presence
 *     catches the F1 class (entirely-missing wrapper) without noise.
 *   • Historic tracker entries with non-existent snippet files would fail —
 *     enforced via fail-fast: file-not-found = test failure (forces tracker
 *     accuracy).
 *
 * Round 31 ITEM 3 (2026-04-30) — extends 8 → 9 drift detectors.
 *
 * Round 33 (2026-04-30) — 4 → 5 tests in this suite. Adds METHOD assertion:
 * every tracker row MUST have `POST` HTTP method. Read-only endpoints (GET)
 * accidentally added to the tracker = bug class — they don't need idempotency
 * wrappers (replay-safe by definition). DELETE/PUT/PATCH endpoints belong on
 * the tracker if the operation is mutational, but the tracker schema today
 * only documents POST endpoints. This guard prevents accidental scope creep.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const TRACKER_PATH = path.join(
    REPO_ROOT,
    "docs/audit/IDEMPOTENCY-COVERAGE.md"
);

/**
 * Parse the "Integrated endpoints" table out of IDEMPOTENCY-COVERAGE.md.
 *
 * Table format:
 *   | # | Endpoint | Snippet | Pattern | Round | Status |
 *   |---|----------|---------|---------|-------|--------|
 *   | 1 | `POST /b2b/v1/place-order` | `[B2B] Snippet 3` V.42.10 | ... |
 *
 * Returns array of {endpoint, snippet_basename} extracted from rows.
 */
function parseIntegratedEndpoints() {
    const content = fs.readFileSync(TRACKER_PATH, "utf8");
    const lines = content.split("\n");

    // Find the "Integrated endpoints" section header
    const startIdx = lines.findIndex((l) =>
        /^## Integrated endpoints/i.test(l)
    );
    if (startIdx === -1) {
        throw new Error(
            "IDEMPOTENCY-COVERAGE.md missing '## Integrated endpoints' section"
        );
    }

    // Find the next ## section to bound the table
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
        if (/^## /.test(lines[i])) {
            endIdx = i;
            break;
        }
    }

    const tableLines = lines.slice(startIdx, endIdx);
    const rows = [];

    for (const line of tableLines) {
        // Skip header + separator + non-table lines
        if (!line.startsWith("|")) continue;
        if (/^\|\s*#\s*\|/.test(line)) continue; // header
        if (/^\|\s*-+\s*\|/.test(line)) continue; // separator

        // Split cells (preserve backticks)
        const cells = line
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim());
        if (cells.length < 6) continue; // not a data row

        const [, endpointCell, snippetCell] = cells;
        if (!endpointCell || !snippetCell) continue;

        // Extract endpoint string from `POST /b2b/v1/...` backtick wrapper
        const endpointMatch = endpointCell.match(/`([^`]+)`/);
        if (!endpointMatch) continue;
        const endpoint = endpointMatch[1];

        // Extract snippet filename from `[B2B] Snippet 3` V.42.10 — first backtick group
        const snippetMatch = snippetCell.match(/`([^`]+)`/);
        if (!snippetMatch) continue;
        const snippet_basename = snippetMatch[1];

        rows.push({ endpoint, snippet_basename, raw_line: line });
    }

    return rows;
}

/**
 * Map snippet basename (from tracker) → actual filename in repo.
 * Tracker uses `[B2B] Snippet 3` but the file is `[B2B] Snippet 3: ...`.
 * Walk the repo root directory once and build prefix → full-name map.
 */
function buildSnippetFileMap() {
    const entries = fs.readdirSync(REPO_ROOT, { withFileTypes: true });
    const map = {};
    for (const e of entries) {
        if (e.isFile() && e.name.startsWith("[")) {
            // Index by exact name AND by colon-stripped prefix
            map[e.name] = e.name;
            const colonIdx = e.name.indexOf(":");
            if (colonIdx > 0) {
                const prefix = e.name.substring(0, colonIdx);
                if (!map[prefix]) {
                    map[prefix] = e.name;
                }
            }
        }
    }
    return map;
}

describe("Idempotency tracker drift", () => {
    let integratedRows;
    let snippetMap;

    beforeAll(() => {
        integratedRows = parseIntegratedEndpoints();
        snippetMap = buildSnippetFileMap();
    });

    test("tracker has at least 1 integrated endpoint row", () => {
        expect(integratedRows.length).toBeGreaterThan(0);
    });

    test("every integrated tracker row resolves to a real snippet file", () => {
        const unresolved = [];
        for (const row of integratedRows) {
            const filename = snippetMap[row.snippet_basename];
            if (!filename) {
                unresolved.push({
                    endpoint: row.endpoint,
                    snippet: row.snippet_basename,
                });
            }
        }
        expect(unresolved).toEqual([]);
    });

    test("every integrated endpoint's snippet file contains dinoco_idempotency_check call site", () => {
        // Group endpoints by snippet file → 1 file read per snippet (perf)
        const byFile = {};
        for (const row of integratedRows) {
            const filename = snippetMap[row.snippet_basename];
            if (!filename) continue; // already caught by previous test
            byFile[filename] = byFile[filename] || [];
            byFile[filename].push(row.endpoint);
        }

        const drifted = [];
        for (const [filename, endpoints] of Object.entries(byFile)) {
            const filePath = path.join(REPO_ROOT, filename);
            const content = fs.readFileSync(filePath, "utf8");
            // F1 class detection: file lists N integrated endpoints but
            // contains ZERO wrapper call sites = pure drift.
            // Accept either the central helper `dinoco_idempotency_check` (direct
            // wrap pattern Rounds 19-54) OR the SN namespace wrapper
            // `dinoco_sn_with_idempotency` (Round 55+ — internally calls the central
            // helper after building body hash from declared keys + actor).
            const hasDirect = content.includes("dinoco_idempotency_check");
            const hasSnWrapper = content.includes("dinoco_sn_with_idempotency");
            if (!hasDirect && !hasSnWrapper) {
                drifted.push({
                    file: filename,
                    endpoints,
                    reason:
                        "tracker lists endpoints as integrated but file has 0 wrapper call sites",
                });
            }
        }

        // Helpful failure: list which files drifted + which endpoints are claimed
        if (drifted.length > 0) {
            const detail = drifted
                .map(
                    (d) =>
                        `  - ${d.file}: claimed integrated for [${d.endpoints.join(
                            ", "
                        )}] — ${d.reason}`
                )
                .join("\n");
            throw new Error(
                `Idempotency tracker drift detected (F1-class):\n${detail}\n\n` +
                    `Either add the wrapper to the snippet OR remove the row from ` +
                    `IDEMPOTENCY-COVERAGE.md "Integrated endpoints" table.`
            );
        }

        expect(drifted).toEqual([]);
    });

    test("every integrated tracker row uses POST HTTP method (not GET/DELETE/PUT/PATCH)", () => {
        // Round 33: defense against accidentally adding read-only endpoints to the tracker.
        // GET endpoints are replay-safe by definition (no side effects → idempotent for free).
        // DELETE/PUT/PATCH MAY warrant idempotency wrappers but the current tracker schema
        // documents POST only. This guard prevents scope creep + catches typos like accidentally
        // pasting "GET /b2b/v1/foo" into a row instead of "POST /b2b/v1/foo".
        const nonPostRows = [];
        for (const row of integratedRows) {
            // Endpoint format must start with HTTP method: "POST /b2b/v1/place-order"
            const methodMatch = row.endpoint.match(/^([A-Z]+)\s+\//);
            if (!methodMatch) {
                nonPostRows.push({
                    endpoint: row.endpoint,
                    reason: "endpoint string missing HTTP method prefix (expected: 'POST /...')",
                });
                continue;
            }
            const method = methodMatch[1];
            if (method !== "POST") {
                nonPostRows.push({
                    endpoint: row.endpoint,
                    reason: `tracker schema is POST-only, found method='${method}' — read-only endpoints don't need idempotency`,
                });
            }
        }

        if (nonPostRows.length > 0) {
            const detail = nonPostRows
                .map((r) => `  - ${r.endpoint}: ${r.reason}`)
                .join("\n");
            throw new Error(
                `Idempotency tracker has non-POST rows:\n${detail}\n\n` +
                    `Tracker schema documents POST endpoints only. Either:\n` +
                    `  1. Remove the row if it's a read-only endpoint (idempotent for free)\n` +
                    `  2. Fix the endpoint string to use POST if it's a mutation endpoint\n` +
                    `  3. Update tracker schema design if DELETE/PUT/PATCH support is intended.`
            );
        }

        expect(nonPostRows).toEqual([]);
    });

    test("every integrated endpoint's namespace appears in a wrapper namespace string", () => {
        // Stronger check: the wrapper uses a namespace like 'b2b/v1::place-order'.
        // Verify the tracker endpoint suffix matches at least one wrapper namespace
        // in its claimed file. This catches the case where wrapper exists for one
        // endpoint but tracker incorrectly attributes it to another endpoint.
        const byFile = {};
        for (const row of integratedRows) {
            const filename = snippetMap[row.snippet_basename];
            if (!filename) continue;
            byFile[filename] = byFile[filename] || [];
            byFile[filename].push(row);
        }

        const orphans = [];
        for (const [filename, rows] of Object.entries(byFile)) {
            const filePath = path.join(REPO_ROOT, filename);
            const content = fs.readFileSync(filePath, "utf8");

            for (const row of rows) {
                // Endpoint format: "POST /b2b/v1/place-order" → take last path segment.
                // For dynamic routes like "/lead/{id}/accept" we strip {placeholder}
                // segments and use the last non-placeholder segment.
                const segments = row.endpoint
                    .split("/")
                    .filter((s) => s && !s.startsWith("{") && !s.match(/^[A-Z]+$/));
                if (segments.length === 0) continue;
                const suffix = segments[segments.length - 1];

                // The suffix must appear in a register_rest_route URI
                // ('/suffix' or 'subgroup/suffix' or 'subgroup/suffix/(?P<placeholder>...)')
                // OR in a namespace marker ('::suffix' or '::group-suffix') from the wrapper.
                // Loose match — file-level only. R47: extended pattern 2 to permit
                // dynamic-route trailing regex segment (?P<placeholder>) after suffix +
                // pattern 4 hyphenated namespace marker (e.g. '::shipping-classify' covers
                // suffix 'classify' from endpoint '/shipping/classify/{sku}').
                const patterns = [
                    new RegExp(`::${escapeRegex(suffix)}\\b`),
                    new RegExp(`['"][^'"]*\\/${escapeRegex(suffix)}['"]`),
                    new RegExp(`['"]${escapeRegex(suffix)}['"]`),
                    new RegExp(`['"][^'"]*\\/${escapeRegex(suffix)}\\/`),
                    new RegExp(`::[\\w-]*${escapeRegex(suffix)}\\b`),
                ];

                const found = patterns.some((p) => p.test(content));
                if (!found) {
                    orphans.push({
                        endpoint: row.endpoint,
                        file: filename,
                        suffix,
                    });
                }
            }
        }

        if (orphans.length > 0) {
            const detail = orphans
                .map(
                    (o) =>
                        `  - ${o.endpoint} → ${o.file}: suffix '${o.suffix}' not found in file`
                )
                .join("\n");
            throw new Error(
                `Idempotency tracker drift — endpoint suffix not located in claimed file:\n${detail}`
            );
        }

        expect(orphans).toEqual([]);
    });
});

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
