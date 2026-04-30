/**
 * REST endpoint drift detector — CLAUDE.md ↔ register_rest_route() registrations.
 *
 * CLAUDE.md "REST API Endpoints" section claims 125+ endpoints across 7
 * namespaces (b2b/v1, b2f/v1, dinoco/v1, dinoco-mcp/v1, dinoco-b2f-audit/v1,
 * dinoco-gdpr/v1, liff-ai/v1, dinoco-stock/v1, dinoco-flash-golive/v1, etc).
 * Each documented endpoint must be registered via `register_rest_route()`
 * in some snippet — otherwise the docs lie and clients hit 404.
 *
 * This test:
 *   1. Extracts documented endpoint paths from CLAUDE.md prose (under
 *      "Under `/wp-json/<ns>/`:" sections + inline `/wp-json/<ns>/<path>`
 *      mentions). Stores as `<namespace>::<path>` tuples.
 *   2. Extracts registered routes from snippet files via regex matching
 *      `register_rest_route( 'NS', '/PATH', ...)` AND the `$ns = 'NS';
 *      register_rest_route( $ns, '/PATH', ...)` pattern (B2F + B2B Snippet 3
 *      use `$ns` variable).
 *   3. Asserts every documented endpoint is registered (the real bug
 *      class — broken doc claims).
 *
 * NOT asserted (intentional asymmetry):
 *   - Routes registered but not in CLAUDE.md are fine — internal helpers,
 *     debug endpoints, etc.
 *   - Spec is "subset of code", never superset.
 *
 * Allowlists:
 *   - DOCUMENTED_NOT_REGISTERED for intentional doc-only mentions (e.g.,
 *     historical/deprecated paths kept in CLAUDE.md as audit trail).
 *   - PATH_NORMALIZE for path-pattern equivalence (CLAUDE.md may show
 *     `lead/{id}` but register_rest_route uses `lead/(?P<id>\d+)`).
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
 * Documented in CLAUDE.md but intentionally not registered (or registered
 * under a different actual path). Each entry needs a comment.
 *
 * Format: 'namespace::path' tuple.
 */
const DOCUMENTED_NOT_REGISTERED = new Set([
    // `manual-reprint` is documented in CLAUDE.md "REST API Endpoints
    // (B2B) → Core B2B" backtick list as a sibling of `manual-flash-*`
    // endpoints, but the actual implementation lives in the RPi dashboard
    // Flask app at `/api/manual-reprint-label` (not WP REST). The doc
    // mention reflects the user-perceived feature name "reprint via RPi
    // print queue" (V.41.0 changelog) — kept as audit trail. The WP-side
    // glue uses the existing `/print-queue` endpoint to dispatch reprint
    // jobs, so no dedicated `/wp-json/b2b/v1/manual-reprint` route exists.
    "b2b/v1::manual-reprint",
]);

/**
 * Normalize a path for comparison. CLAUDE.md uses `{id}` placeholders
 * while register_rest_route uses `(?P<id>\d+)`. Strip both to a canonical
 * form for diff.
 */
function normalizePath(p) {
    if (!p) return "";
    let s = String(p).trim();
    // Strip leading slash
    if (s.startsWith("/")) s = s.slice(1);
    // Strip trailing slash
    if (s.endsWith("/")) s = s.slice(0, -1);
    // Replace `{name}` and `(?P<name>regex)` with `:param`
    s = s.replace(/\{[a-z_]+\}/gi, ":param");
    s = s.replace(/\(\?P<[a-z_]+>[^)]+\)/gi, ":param");
    return s;
}

/**
 * Extract documented endpoints from CLAUDE.md.
 *
 * Two patterns:
 *  A) "Under `/wp-json/NS/v1/`:" block with backtick-listed paths:
 *     ```
 *     Under `/wp-json/b2b/v1/`: `confirm-order`, `flash-create`, ...
 *     ```
 *  B) Inline `/wp-json/NS/v1/PATH` mentions (e.g. in V.42 Flash docs).
 */
function extractDocumentedEndpoints() {
    const content = fs.readFileSync(path.join(REPO_ROOT, "CLAUDE.md"), "utf8");
    const set = new Set();

    // Pattern A: Under `/wp-json/NS/`: `path1`, `path2`, ...
    // Capture ns + the entire backtick-listed paths block (until newline or
    // sentence terminator). Multi-line block break on double newline.
    const blockRe = /Under\s+`\/wp-json\/([a-z0-9-]+\/v[0-9]+)\/?`:\s*((?:`[^`\n]+`(?:\s*[,.]\s*)?)+)/gi;
    let bm;
    while ((bm = blockRe.exec(content)) !== null) {
        const ns = bm[1];
        const block = bm[2];
        const pathRe = /`([a-z0-9_/{}-]+)`/gi;
        let pm;
        while ((pm = pathRe.exec(block)) !== null) {
            const p = normalizePath(pm[1]);
            if (p) set.add(`${ns}::${p}`);
        }
    }

    // Pattern B: All under `/wp-json/NS/v1/`: `path`, `path/{id}`, ...
    // (variant with "All under" prefix used by some sections)
    const altRe = /All\s+under\s+`\/wp-json\/([a-z0-9-]+\/v[0-9]+)\/?`:\s*((?:`[^`\n]+`(?:\s*[,.]\s*)?)+)/gi;
    let am;
    while ((am = altRe.exec(content)) !== null) {
        const ns = am[1];
        const block = am[2];
        const pathRe = /`([a-z0-9_/{}-]+)`/gi;
        let pm;
        while ((pm = pathRe.exec(block)) !== null) {
            const p = normalizePath(pm[1]);
            if (p) set.add(`${ns}::${p}`);
        }
    }

    // Pattern C: Bullet-style list after namespace banner. Some sections
    // use bullets like:
    //   - `GET /drift` — orphan SETs per maker
    //   - `POST /activate-schema` — dbDelta canonical tables
    // The namespace context comes from the most recent "Under `/wp-json/NS/v1/`"
    // mention. We do a single pass, tracking current namespace.
    //
    // CRITICAL: reset namespace context on heading boundaries (`## ` or `###`)
    // and on long whitespace gaps — otherwise bullets in unrelated sections
    // get attributed to the wrong namespace (e.g. GDPR section bullets
    // discussing `/b2b/v1/rpi-products` get tagged dinoco-gdpr/v1).
    const lines = content.split("\n");
    let currentNs = null;
    const nsBannerRe = /\/wp-json\/([a-z0-9-]+\/v[0-9]+)\/?/i;
    const bulletPathRe = /^\s*-\s*`(?:GET|POST|PUT|DELETE|PATCH)\s+(\/[a-z0-9_/{}-]+)`/i;
    const headingRe = /^#{1,6}\s+/;
    let blankCount = 0;
    for (const line of lines) {
        // Reset context on new heading (## or ###)
        if (headingRe.test(line)) {
            currentNs = null;
            blankCount = 0;
            continue;
        }
        // Reset context after 3+ consecutive blank lines (paragraph break)
        if (line.trim() === "") {
            blankCount++;
            if (blankCount >= 3) currentNs = null;
            continue;
        }
        blankCount = 0;

        const nm = line.match(nsBannerRe);
        if (nm) currentNs = nm[1];
        if (!currentNs) continue;
        const bm2 = line.match(bulletPathRe);
        if (bm2) {
            // Reject paths that themselves contain a /wp-json/ namespace —
            // those are cross-namespace references, not endpoints in
            // currentNs. Defensive guard.
            const inner = bm2[1];
            if (/\/wp-json\//.test(inner)) continue;
            // Also reject paths that look like a different ns prefix
            // (e.g. "/b2b/v1/foo" appearing in a GDPR section).
            if (/^\/[a-z0-9-]+\/v[0-9]+\//.test(inner)) continue;
            const p = normalizePath(inner);
            if (p) set.add(`${currentNs}::${p}`);
        }
    }

    return set;
}

/**
 * Extract registered REST routes from snippet files.
 *
 * Three patterns supported:
 *  A) Direct: `register_rest_route( 'NS', '/PATH', ...)`
 *  B) Variable: `$ns = 'NS';` ... `register_rest_route( $ns, '/PATH', ...)`
 *     in the same file. We resolve `$ns` from the most recent assignment.
 *  C) Constant: `define('NAME_NS', 'ns/v1');` ... `register_rest_route( NAME_NS, '/PATH', ...)`
 *     We collect const→namespace map per-file (constants are file-scoped
 *     in WP Code Snippets) then expand on register call.
 *
 * Returns Set of `<namespace>::<canonical_path>` tuples PLUS a parallel
 * "base path" Set: when registered path has a param suffix
 * (e.g. `maker-products/:param`), we also add the base form
 * (`maker-products`) so docs that omit the suffix match correctly.
 */
function extractRegisteredEndpoints() {
    const exact = new Set();
    const base = new Set();

    for (const entry of fs.readdirSync(REPO_ROOT, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.includes(".")) continue;
        if (!SNIPPET_PREFIXES.some((p) => entry.name.startsWith(p))) continue;

        const content = fs.readFileSync(
            path.join(REPO_ROOT, entry.name),
            "utf8"
        );

        const lines = content.split("\n");
        let currentNs = null;
        const constNs = new Map(); // CONST_NAME → 'ns/v1'

        const nsAssignRe = /\$ns\s*=\s*['"]([a-z0-9_-]+\/v[0-9]+)['"]/i;
        // Note: const name char class is [A-Z0-9_] (digits allowed e.g. B2F_AUDIT_NS).
        const constDefRe = /define\s*\(\s*['"]([A-Z0-9_]+(?:_NS|_NAMESPACE))['"]\s*,\s*['"]([a-z0-9_-]+\/v[0-9]+)['"]/i;
        const directRe = /register_rest_route\s*\(\s*['"]([a-z0-9_-]+\/v[0-9]+)['"]\s*,\s*['"]([^'"]+)['"]/i;
        const varRe = /register_rest_route\s*\(\s*\$ns\s*,\s*['"]([^'"]+)['"]/i;
        const constUseRe = /register_rest_route\s*\(\s*([A-Z0-9_]+(?:_NS|_NAMESPACE))\s*,\s*['"]([^'"]+)['"]/i;

        const recordRoute = (ns, rawPath) => {
            const canonical = normalizePath(rawPath);
            if (!canonical || !ns) return;
            exact.add(`${ns}::${canonical}`);
            // Also record "base" form (path without trailing :param segments).
            // This lets docs that say `maker-products` match a registration
            // that actually is `maker-products/:param`.
            const segments = canonical.split("/");
            // Find first segment that is `:param` and treat everything before
            // that as the "base path"
            const paramIdx = segments.indexOf(":param");
            if (paramIdx > 0) {
                const basePath = segments.slice(0, paramIdx).join("/");
                if (basePath) base.add(`${ns}::${basePath}`);
            }
        };

        for (const line of lines) {
            const am = line.match(nsAssignRe);
            if (am) currentNs = am[1];

            const cm = line.match(constDefRe);
            if (cm) constNs.set(cm[1], cm[2]);

            const dm = line.match(directRe);
            if (dm) {
                recordRoute(dm[1], dm[2]);
                continue;
            }

            const vm = line.match(varRe);
            if (vm && currentNs) {
                recordRoute(currentNs, vm[1]);
                continue;
            }

            const km = line.match(constUseRe);
            if (km) {
                const ns = constNs.get(km[1]);
                if (ns) recordRoute(ns, km[2]);
            }
        }
    }

    return { exact, base };
}

describe("REST endpoint drift — CLAUDE.md ↔ register_rest_route()", () => {
    const documented = extractDocumentedEndpoints();
    const { exact: registered, base: registeredBase } = extractRegisteredEndpoints();

    /** Helper: check whether `tuple` (ns::path) is registered, allowing
     * the registered route to have an extra `:param` suffix that the
     * documented form omitted. Examples:
     *   doc `b2f/v1::maker-products` matches reg `b2f/v1::maker-products/:param`
     */
    function isRegistered(tuple) {
        if (registered.has(tuple)) return true;
        if (registeredBase.has(tuple)) return true;
        return false;
    }

    test("CLAUDE.md mentions REST endpoints (sanity)", () => {
        expect(documented.size).toBeGreaterThan(50);
    });

    test("snippets register REST routes (sanity)", () => {
        expect(registered.size).toBeGreaterThan(80);
    });

    test("every documented endpoint is registered in some snippet", () => {
        const missing = [];
        for (const tuple of documented) {
            if (DOCUMENTED_NOT_REGISTERED.has(tuple)) continue;
            if (!isRegistered(tuple)) missing.push(tuple);
        }

        if (missing.length > 0) {
            const formatted = missing
                .map((t) => `  ${t}`)
                .sort()
                .join("\n");
            throw new Error(
                `${missing.length} endpoint(s) documented in CLAUDE.md but ` +
                    `not registered via register_rest_route():\n${formatted}\n\n` +
                    `Either:\n` +
                    `  1. Register the endpoint in a snippet (preferred), OR\n` +
                    `  2. Remove the entry from CLAUDE.md (doc cleanup), OR\n` +
                    `  3. Add the tuple to DOCUMENTED_NOT_REGISTERED in ` +
                    `tests/jest/rest-endpoints-drift.test.js with a comment ` +
                    `(rare — typically only for historical/deprecated paths ` +
                    `kept as audit trail).`
            );
        }
    });

    test("DOCUMENTED_NOT_REGISTERED entries don't shadow real registrations", () => {
        // Forces cleanup of stale allowlist entries when the route ships
        // and gets registered for real.
        const stale = [];
        for (const tuple of DOCUMENTED_NOT_REGISTERED) {
            if (isRegistered(tuple)) stale.push(tuple);
        }
        expect(stale).toEqual([]);
    });
});
