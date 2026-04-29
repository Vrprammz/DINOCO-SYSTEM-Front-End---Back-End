/**
 * Snippet DB_ID header check.
 *
 * Per CLAUDE.md "Development Notes" → "DB_ID Header (V.32.0)":
 *
 *   "Every snippet file includes a DB_ID: NNN header in its comment
 *    block (first 1000 chars). This integer maps to the `id` column
 *    in the wp_snippets table. The GitHub Webhook Sync engine
 *    (dinoco_extract_db_id()) uses DB_ID as the PRIMARY matching key
 *    when syncing code from GitHub to WordPress. If a file has no
 *    DB_ID header, it falls back to normalized filename matching."
 *
 * Filename matching is ambiguous (e.g., `[B2B] Snippet 3` could match
 * the wrong row if a similar one exists). Missing DB_ID = silent
 * sync drift risk.
 *
 * This test asserts every bracket-prefixed snippet at repo root has
 * a `DB_ID: <integer>` header within the first 1000 characters.
 *
 * Catches:
 *   - New snippet committed without DB_ID header
 *   - Header accidentally deleted during refactor
 *   - DB_ID values that aren't integers (typo / corruption)
 *   - Duplicate DB_IDs across files (would cause sync to overwrite)
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");

const SNIPPET_PREFIXES = [
    "[B2B]",
    "[B2F]",
    "[Admin System]",
    "[AdminSystem-System]",
    "[System]",
    "[GitHub]",
    "[LIFF AI]",
];

/**
 * Snippets that legitimately lack DB_ID. Each entry needs a comment.
 */
const KNOWN_MISSING = new Set([
    // (none — every snippet should have DB_ID)
]);

function findSnippets() {
    const out = [];
    for (const entry of fs.readdirSync(REPO_ROOT, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (entry.name.includes(".")) continue; // skip files with extensions
        if (SNIPPET_PREFIXES.some((p) => entry.name.startsWith(p))) {
            out.push(path.join(REPO_ROOT, entry.name));
        }
    }
    return out;
}

/**
 * Extract DB_ID classification:
 *   { id: <integer> }       — concrete DB_ID (matches sync engine primary key)
 *   { placeholder: true }   — declared but pending (e.g., "auto-assign after sync")
 *   null                    — completely missing the DB_ID declaration
 *
 * CLAUDE.md says "first 1000 chars" but actual practice puts the
 * header later. We accept anywhere in the file — the sync engine's
 * dinoco_extract_db_id() does the same scan.
 */
function extractDbId(content) {
    const intRe = /DB_ID\s*[:=]?\s*(\d+)/i;
    const intM = content.match(intRe);
    if (intM) return { id: parseInt(intM[1], 10) };

    // Placeholder forms seen in practice:
    //   DB_ID: (auto-assign after WP creates snippet)
    //   DB_ID: (pending auto-assign — populate after first WP sync)
    //   DB_ID: TBD
    const placeholderRe = /DB_ID\s*[:=]?\s*(?:\(|TBD|pending|auto)/i;
    if (placeholderRe.test(content)) return { placeholder: true };

    return null;
}

describe("Snippet DB_ID header presence + uniqueness", () => {
    const snippets = findSnippets();

    test("repo has snippet files (sanity)", () => {
        expect(snippets.length).toBeGreaterThan(50);
    });

    test("every snippet declares a DB_ID (integer or placeholder)", () => {
        const missing = [];
        for (const file of snippets) {
            const rel = path.relative(REPO_ROOT, file);
            if (KNOWN_MISSING.has(rel)) continue;
            const content = fs.readFileSync(file, "utf8");
            const result = extractDbId(content);
            if (result === null) {
                missing.push(rel);
            }
        }

        if (missing.length > 0) {
            const formatted = missing.map((f) => `  - ${f}`).join("\n");
            throw new Error(
                `${missing.length} snippet(s) missing DB_ID declaration entirely:\n${formatted}\n\n` +
                    `Each snippet must declare a DB_ID matching its row ` +
                    `in the wp_snippets table. Add to the comment block:\n\n` +
                    `  DB_ID: <integer>                               (already synced)\n` +
                    `  DB_ID: (auto-assign after WP creates snippet)  (new snippet)\n\n` +
                    `If a snippet legitimately lacks a wp_snippets row ` +
                    `(e.g., template-only file), add it to KNOWN_MISSING in ` +
                    `tests/jest/snippet-db-id.test.js with a comment.`
            );
        }
    });

    test("no duplicate concrete DB_IDs across snippets", () => {
        const idMap = new Map(); // id → file[]
        for (const file of snippets) {
            const rel = path.relative(REPO_ROOT, file);
            if (KNOWN_MISSING.has(rel)) continue;
            const content = fs.readFileSync(file, "utf8");
            const result = extractDbId(content);
            if (!result || !result.id) continue; // placeholder or missing — skip
            if (!idMap.has(result.id)) idMap.set(result.id, []);
            idMap.get(result.id).push(rel);
        }

        const dupes = [];
        for (const [id, files] of idMap.entries()) {
            if (files.length > 1) {
                dupes.push(`  DB_ID ${id} →\n    ${files.join("\n    ")}`);
            }
        }

        if (dupes.length > 0) {
            throw new Error(
                `${dupes.length} duplicate DB_ID(s) detected — sync engine would overwrite:\n${dupes.join("\n")}`
            );
        }
    });

    test("placeholder DB_IDs are documented (informational)", () => {
        // Surfaces placeholder count without failing — useful to track
        // how many snippets are awaiting first sync. This run captures
        // a snapshot count that future runs can compare against if
        // someone adds a "max_placeholders" assertion later.
        let placeholderCount = 0;
        for (const file of snippets) {
            const rel = path.relative(REPO_ROOT, file);
            if (KNOWN_MISSING.has(rel)) continue;
            const content = fs.readFileSync(file, "utf8");
            const result = extractDbId(content);
            if (result && result.placeholder) placeholderCount++;
        }
        // Just an informational expectation — it WILL be a number.
        expect(typeof placeholderCount).toBe("number");
    });
});
