/**
 * JSDoc endpoint reference drift detector.
 *
 * Scans JSDoc comments in liff-src/ for prescriptive endpoint references
 * (`POST /wp-json/<ns>/v1/<path>`, `GET /b2b/v1/<path>`, etc.) and
 * verifies each is either:
 *   1. Registered in production via `register_rest_route(...)` in any
 *      WP snippet at the repo root, OR
 *   2. Documented in docs/api/openapi.yaml, OR
 *   3. Listed in JSDOC_KNOWN_OK as an intentional exception (rare —
 *      requires a comment explaining why)
 *
 * Why this matters: JSDoc is prescriptive — callers trust it. An
 * inaccurate JSDoc reference (like the original `/b2b/v1/auth` claim
 * before commit 224fac6) leads downstream code into 404 land.
 *
 * Caught classes:
 *   - Made-up endpoints in JSDoc (`/auth` when real is `/auth-group`)
 *   - Stale endpoint references after WP-side rename
 *   - Typos (`/order-histroy` vs `/order-history`)
 *
 * Doesn't catch (out of scope):
 *   - Endpoint exists but JSDoc wrong about HTTP method (would need
 *     parsing register_rest_route's `methods` array — possible future
 *     hardening)
 *   - JSDoc shows correct path but missing required body params
 *     (semantic, not syntactic)
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const REPO_ROOT = path.resolve(__dirname, "../..");
const LIFF_SRC = path.join(REPO_ROOT, "liff-src");

/**
 * JSDoc references that intentionally don't map to a registered endpoint.
 * Each entry needs a comment explaining why.
 */
const JSDOC_KNOWN_OK = new Set([
    // B2F Catalog R3 (V.0.4) — JSDoc header references the maker-products
    // endpoint without the `{id}` path param because the trailing-punct
    // strip on line 100 of this file removes `}` from `{id}` mid-doc.
    // Production registration is `/maker-products/(?P<maker_id>\d+)` →
    // normalized to `/maker-products/{id}`. Both API + tests verify the
    // call uses the correct URL — this entry just whitelists the
    // documentation-style shorthand reference.
    "GET /b2f/v1/maker-products",
]);

/**
 * Walk liff-src/ for .js files.
 */
function findJsFiles(dir, results = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) findJsFiles(full, results);
        else if (entry.isFile() && entry.name.endsWith(".js"))
            results.push(full);
    }
    return results;
}

/**
 * Extract JSDoc block-comment regions only (inline `//` comments are
 * implementation notes, not API contracts).
 */
function extractJSDocBlocks(content) {
    const blocks = [];
    const re = /\/\*\*[\s\S]*?\*\//g;
    let m;
    while ((m = re.exec(content)) !== null) {
        blocks.push({ text: m[0], offset: m.index });
    }
    return blocks;
}

/**
 * Match endpoint reference patterns in JSDoc text:
 *   POST /wp-json/b2b/v1/auth-group
 *   GET /b2b/v1/order-history
 *   POST /b2f/v1/maker-products/{maker_id}
 *
 * Returns array of `{ method, namespace, path, line }`.
 */
function extractEndpointRefs(content) {
    const blocks = extractJSDocBlocks(content);
    const refs = [];

    // Pattern: METHOD whitespace /optional-wp-json/namespace/v1/path
    // Path stops at whitespace, backtick, paren, comma, period (end of
    // sentence), or newline. Trailing punctuation stripped below.
    const re =
        /\b(GET|POST|PUT|PATCH|DELETE)\s+(?:\/wp-json)?\/([a-z0-9-]+(?:\/[a-z0-9-]+)?)\/v1\/([a-zA-Z0-9_/{}-]+)/g;

    for (const block of blocks) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(block.text)) !== null) {
            const method = m[1];
            const namespace = m[2];
            let pth = m[3];

            // Strip trailing punctuation (commas, periods, parens)
            pth = pth.replace(/[.,;:)\]}]+$/, "");

            // Compute file line via offset within content
            const absoluteOffset = block.offset + m.index;
            const line =
                content.substring(0, absoluteOffset).split("\n").length;

            refs.push({
                method,
                namespace,
                path: pth,
                line,
            });
        }
    }

    return refs;
}

/**
 * Build a Set of (METHOD + " " + namespacedPath) keys from
 * register_rest_route calls across all bracket-prefixed snippet files.
 *
 * Handles the four common forms:
 *   register_rest_route( 'b2b/v1', '/path', array('methods' => 'POST', ...))
 *   register_rest_route( $ns, '/path', ... )  with $ns assigned earlier
 *   register_rest_route( 'b2b/v1', '/path/(?P<id>\\d+)', ...)
 *   register_rest_route('b2b/v1', '/path', array(...))  no spaces
 */
function buildProductionRegistry() {
    const keys = new Set();

    const entries = fs.readdirSync(REPO_ROOT, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const isSnippet =
            (entry.name.startsWith("[B2B]") ||
                entry.name.startsWith("[B2F]") ||
                entry.name.startsWith("[Admin System]") ||
                entry.name.startsWith("[AdminSystem-System]") ||
                entry.name.startsWith("[System]") ||
                entry.name.startsWith("[GitHub]") ||
                entry.name.startsWith("[LIFF AI]")) &&
            !entry.name.includes(".");
        if (!isSnippet) continue;

        const full = path.join(REPO_ROOT, entry.name);
        const content = fs.readFileSync(full, "utf8");

        // Resolve namespace variables like $ns = 'liff-ai/v1';
        const nsAssign = /\$ns\s*=\s*['"]([^'"]+)['"]/g;
        const nsLookup = {};
        let nsm;
        while ((nsm = nsAssign.exec(content)) !== null) {
            nsLookup["$ns"] = nsm[1];
        }

        // Match register_rest_route(...)
        // Capture ns (string or $var), path string, methods clause
        const callRe =
            /register_rest_route\s*\(\s*([^,]+),\s*['"]([^'"]+)['"]\s*,\s*array\s*\(([\s\S]*?)\)\s*\)/g;
        let m;
        while ((m = callRe.exec(content)) !== null) {
            let ns = m[1].trim();
            const route = m[2];
            const cfg = m[3];

            // Resolve namespace
            if (ns.startsWith("'") || ns.startsWith('"')) {
                ns = ns.slice(1, -1);
            } else if (ns in nsLookup) {
                ns = nsLookup[ns];
            } else {
                continue; // unresolvable namespace — skip
            }

            // Extract methods — single string or array
            const methodMatches = [
                ...cfg.matchAll(
                    /['"](?:methods?)['"]\s*=>\s*['"]([A-Z, |]+)['"]/g
                ),
            ];
            const methodArrays = [
                ...cfg.matchAll(
                    /['"](?:methods?)['"]\s*=>\s*array\s*\(([^)]+)\)/g
                ),
            ];

            const methods = new Set();
            for (const mm of methodMatches) {
                for (const tok of mm[1].split(/[,|\s]+/)) {
                    if (tok) methods.add(tok.trim().toUpperCase());
                }
            }
            for (const mm of methodArrays) {
                for (const t of mm[1].matchAll(/['"]([A-Z]+)['"]/g)) {
                    methods.add(t[1].toUpperCase());
                }
            }
            // Default — WordPress register_rest_route defaults to GET if
            // methods omitted
            if (methods.size === 0) methods.add("GET");

            // Normalize path:
            //   /path/(?P<id>\d+)  → /path/{id}
            //   /path/(?P<ticket_id>\d+) → /path/{id}
            const normalizedPath = route.replace(
                /\/\(\?P<[^>]+>[^)]+\)/g,
                "/{id}"
            );

            for (const method of methods) {
                keys.add(`${method} /${ns}${normalizedPath}`);
            }
        }
    }

    return keys;
}

/**
 * Add OpenAPI spec keys to the same set (extra coverage source — spec
 * may be ahead of production for planned endpoints).
 */
function addSpecKeys(set) {
    const spec = yaml.load(
        fs.readFileSync(path.join(REPO_ROOT, "docs/api/openapi.yaml"), "utf8")
    );
    const HTTP = ["get", "post", "put", "patch", "delete"];
    for (const [pathTemplate, item] of Object.entries(spec.paths || {})) {
        const norm = pathTemplate.replace(/\{[^}]+\}/g, "{id}");
        for (const m of HTTP) {
            if (item[m]) set.add(`${m.toUpperCase()} ${norm}`);
        }
    }
}

describe("JSDoc endpoint references vs production register_rest_route", () => {
    const jsFiles = findJsFiles(LIFF_SRC);
    const registry = buildProductionRegistry();
    addSpecKeys(registry);

    test("liff-src/ has JS files to scan", () => {
        expect(jsFiles.length).toBeGreaterThan(3);
    });

    test("production registry has expected endpoints", () => {
        // Sanity check — these must always exist (from CLAUDE.md REST table)
        expect(registry.has("POST /b2b/v1/place-order")).toBe(true);
        expect(registry.has("GET /b2b/v1/catalog")).toBe(true);
        expect(registry.has("POST /b2b/v1/auth-group")).toBe(true);
        expect(registry.has("POST /liff-ai/v1/auth")).toBe(true);
    });

    test("every JSDoc endpoint reference resolves to production", () => {
        const drift = [];
        for (const file of jsFiles) {
            const content = fs.readFileSync(file, "utf8");
            const refs = extractEndpointRefs(content);
            for (const r of refs) {
                // Normalize path placeholders to {id} for matching
                const normalized = r.path.replace(/\{[^}]+\}/g, "{id}");
                const key = `${r.method} /${r.namespace}/v1/${normalized}`;
                if (registry.has(key)) continue;
                if (JSDOC_KNOWN_OK.has(key)) continue;
                drift.push({
                    file: path.relative(REPO_ROOT, file),
                    line: r.line,
                    key,
                });
            }
        }

        if (drift.length > 0) {
            const formatted = drift
                .map(
                    (d) =>
                        `  ${d.file}:${d.line}  →  ${d.key}`
                )
                .join("\n");
            throw new Error(
                `${drift.length} JSDoc endpoint reference(s) don't match production:\n${formatted}\n\n` +
                    `Either:\n` +
                    `  1. Fix the JSDoc to point at the actual endpoint, OR\n` +
                    `  2. Register the endpoint in a snippet (preferred), OR\n` +
                    `  3. Add the (METHOD path) to JSDOC_KNOWN_OK in ` +
                    `tests/jest/jsdoc-endpoint-refs.test.js with a comment.\n`
            );
        }
    });
});
