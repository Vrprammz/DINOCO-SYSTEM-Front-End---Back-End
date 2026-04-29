/**
 * Contract drift detector — api-client.js ↔ OpenAPI spec.
 *
 * Parses the api-client.js source, extracts each method's
 * `api(METHOD, PATH, ...)` call, and verifies each (METHOD, PATH)
 * tuple exists in docs/api/openapi.yaml.
 *
 * Why parse source not import the module:
 *   - Importing executes the IIFE and we'd need to mock fetch + decompose
 *     route patterns from runtime calls
 *   - Source-level extraction is deterministic and catches typos in
 *     literal strings (the actual risk surface)
 *
 * The OpenAPI spec is intentionally partial coverage (~50% of routes
 * per CLAUDE.md preamble). KNOWN_UNDOCUMENTED below holds api-client
 * methods that legitimately call un-spec'd endpoints. Adding a new
 * api-client method:
 *   1. Add the endpoint to docs/api/openapi.yaml (preferred), OR
 *   2. Add the (METHOD, PATH) to KNOWN_UNDOCUMENTED with a comment
 *
 * Catches:
 *   - Typo in api-client path (`/placeorder` vs `/place-order`)
 *   - HTTP method mismatch (GET in code, POST in spec)
 *   - Removed spec endpoint with stale api-client method
 *   - New api-client method silently undocumented (forces explicit
 *     decision via allowlist)
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const REPO_ROOT = path.resolve(__dirname, "../..");
const API_CLIENT = path.join(REPO_ROOT, "liff-src/shared/api-client.js");
const OPENAPI = path.join(REPO_ROOT, "docs/api/openapi.yaml");

/**
 * Known-undocumented (METHOD, namespace, PATH) tuples. Each entry should
 * point at a real WP `register_rest_route` call. The OpenAPI spec doesn't
 * cover these yet (spec is ~50% complete per CLAUDE.md preamble).
 *
 * If you remove an undocumented endpoint from api-client, drop the entry.
 * If you document it in openapi.yaml, drop the entry — the spec match
 * will satisfy the assertion.
 */
const KNOWN_UNDOCUMENTED = new Set([
    "GET /b2b/v1/history",
    "POST /b2b/v1/modify-order/{id}",
    "GET /b2b/v1/ticket/{id}",
]);

/**
 * Extract `api(METHOD, PATH, ...)` calls from api-client.js source.
 * Captures both literal strings and template literals; normalizes
 * `${encodeURIComponent(orderId)}` style placeholders to `{id}`.
 *
 * Returns array of `{ method, path, namespace, line }`.
 */
/**
 * Strip JS block comments + line comments, replacing with same-length
 * spaces so line numbers stay accurate. JSDoc usage examples are inside
 * block comments — without this, the regex matches them as if they were
 * real code.
 */
function stripJsComments(src) {
    let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
    out = out.replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
    return out;
}

function extractApiCalls() {
    const rawSrc = fs.readFileSync(API_CLIENT, "utf8");
    const src = stripJsComments(rawSrc);

    // Extract the namespace from createB2BApi default base
    // (`wpRestUrl("b2b/v1")` → namespace `b2b/v1`). Future factories
    // can be detected the same way.
    const namespaceRe = /wpRestUrl\(["']([^"']+)["']\)/g;
    const namespaces = [];
    let nm;
    while ((nm = namespaceRe.exec(src)) !== null) {
        namespaces.push(nm[1]);
    }

    // Match api("METHOD", "PATH"|`template`)
    // Captures everything inside matching quotes — for backticks this
    // includes `${...}` placeholders which we normalize to `{id}` below.
    const callRe =
        /\bapi\(\s*["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["']\s*,\s*([`"'])([^`"']+)\2/g;

    const calls = [];
    let m;
    while ((m = callRe.exec(src)) !== null) {
        const method = m[1];
        let pathStr = m[3];

        // Normalize template-literal placeholders to `{id}`.
        // `${encodeURIComponent(orderId)}` → `{id}`,
        // `${maker_id}` → `{id}`, etc. Repeated placeholders all collapse
        // to `{id}` so they match the OpenAPI spec normalization below.
        pathStr = pathStr.replace(/\$\{[^}]+\}/g, "{id}");

        // Strip query string + URL fragment + trailing whitespace
        pathStr = pathStr.split("?")[0].split("#")[0].trim();

        const line = rawSrc.substring(0, m.index).split("\n").length;
        calls.push({ method, path: pathStr, line });
    }

    return { namespaces, calls };
}

/**
 * Build a Set of (METHOD + " " + namespacedPath) keys from OpenAPI spec.
 * Path templating uses {var} OpenAPI style; we normalize all path
 * params to {id} so api-client's `${encodeURIComponent(orderId)}`
 * matches spec's `/{po_id}`.
 */
function buildSpecKeys() {
    const raw = fs.readFileSync(OPENAPI, "utf8");
    const spec = yaml.load(raw);
    const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
    const keys = new Set();

    for (const [pathTemplate, pathItem] of Object.entries(spec.paths || {})) {
        // Normalize path params: /b2b/v1/ticket/{order_id} → /b2b/v1/ticket/{id}
        const normalized = pathTemplate.replace(/\{[^}]+\}/g, "{id}");
        for (const m of HTTP_METHODS) {
            if (pathItem[m]) {
                keys.add(`${m.toUpperCase()} ${normalized}`);
            }
        }
    }
    return keys;
}

describe("api-client ↔ OpenAPI contract drift", () => {
    const { namespaces, calls } = extractApiCalls();
    const specKeys = buildSpecKeys();

    test("api-client.js parses cleanly", () => {
        expect(calls.length).toBeGreaterThan(0);
        expect(namespaces).toContain("b2b/v1");
    });

    test("every api-client call resolves to spec or known-undocumented", () => {
        // Currently only B2B factory exists; future factories can append
        // their namespace prefix logic here.
        const namespacePrefix = "/b2b/v1";

        const drift = [];
        for (const { method, path: p, line } of calls) {
            const fullPath = `${namespacePrefix}${p}`;
            const key = `${method} ${fullPath}`;

            if (specKeys.has(key)) continue;
            if (KNOWN_UNDOCUMENTED.has(key)) continue;

            drift.push({ method, fullPath, line });
        }

        if (drift.length > 0) {
            const formatted = drift
                .map((d) => `  [${d.method}] ${d.fullPath}  (api-client line ${d.line})`)
                .join("\n");
            throw new Error(
                `${drift.length} api-client method(s) drift from OpenAPI spec:\n${formatted}\n\n` +
                    `Either:\n` +
                    `  1. Add the endpoint to docs/api/openapi.yaml (preferred), OR\n` +
                    `  2. Add the (METHOD path) to KNOWN_UNDOCUMENTED in ` +
                    `tests/jest/api-contract.test.js with a comment.\n`
            );
        }
    });

    test("KNOWN_UNDOCUMENTED entries don't shadow real spec coverage", () => {
        // If someone documents an endpoint in openapi.yaml, the
        // KNOWN_UNDOCUMENTED entry becomes redundant. This test catches
        // that — forces deletion of stale allowlist entries.
        const stale = [];
        for (const key of KNOWN_UNDOCUMENTED) {
            if (specKeys.has(key)) {
                stale.push(key);
            }
        }
        expect(stale).toEqual([]);
    });
});
