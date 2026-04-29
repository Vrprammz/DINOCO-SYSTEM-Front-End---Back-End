/**
 * Shortcode drift detector — CLAUDE.md ↔ add_shortcode() registrations.
 *
 * CLAUDE.md "Key Shortcodes" + "Secondary shortcodes" tables list ~35
 * shortcodes as the entry points for member, admin, B2B, and B2F UIs.
 * Each documented shortcode must be registered via `add_shortcode()`
 * in some snippet — otherwise the docs lie and the user hits a blank
 * page.
 *
 * This test:
 *   1. Extracts documented shortcode names from CLAUDE.md tables
 *   2. Extracts registered shortcode names from all snippet files
 *      via add_shortcode( 'name', ... ) regex
 *   3. Asserts every documented shortcode is registered (the real bug
 *      class — broken doc claims)
 *
 * NOT asserted (intentional asymmetry):
 *   - Shortcodes registered but not in CLAUDE.md are fine — internal
 *     widgets, admin-only sub-shortcodes, etc.
 *   - Spec is "subset of code", never superset.
 *
 * Allowlist:
 *   - DOCUMENTED_NOT_REGISTERED for intentional exceptions (e.g., a
 *     shortcode declared in a not-yet-shipped snippet). Each entry needs
 *     a comment.
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

const DOCUMENTED_NOT_REGISTERED = new Set([
    // (none currently — every documented shortcode should be registered)
]);

/**
 * Pull shortcode names from CLAUDE.md table rows.
 * Pattern: `| `[shortcode_name]` | description |` — backticks +
 * brackets + lowercase name with underscores/digits.
 */
function extractDocumentedShortcodes() {
    const content = fs.readFileSync(path.join(REPO_ROOT, "CLAUDE.md"), "utf8");
    const set = new Set();
    const re = /^\|\s*`\[([a-z_0-9]+)\]`/gm;
    let m;
    while ((m = re.exec(content)) !== null) {
        set.add(m[1]);
    }
    return set;
}

/**
 * Pull all add_shortcode( 'name', ... ) registrations from snippet
 * files. Handles single + double quotes, optional whitespace.
 */
function extractRegisteredShortcodes() {
    const set = new Set();
    const re = /add_shortcode\s*\(\s*['"]([a-z_0-9]+)['"]/gi;

    for (const entry of fs.readdirSync(REPO_ROOT, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.includes(".")) continue;
        if (!SNIPPET_PREFIXES.some((p) => entry.name.startsWith(p))) continue;

        const content = fs.readFileSync(
            path.join(REPO_ROOT, entry.name),
            "utf8"
        );
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(content)) !== null) {
            set.add(m[1]);
        }
    }
    return set;
}

describe("Shortcode drift — CLAUDE.md ↔ add_shortcode()", () => {
    const documented = extractDocumentedShortcodes();
    const registered = extractRegisteredShortcodes();

    test("CLAUDE.md has shortcode table entries (sanity)", () => {
        expect(documented.size).toBeGreaterThan(20);
    });

    test("snippets register shortcodes (sanity)", () => {
        expect(registered.size).toBeGreaterThan(20);
    });

    test("every documented shortcode is registered in some snippet", () => {
        const missing = [];
        for (const name of documented) {
            if (DOCUMENTED_NOT_REGISTERED.has(name)) continue;
            if (!registered.has(name)) missing.push(name);
        }

        if (missing.length > 0) {
            const formatted = missing.map((n) => `  [${n}]`).join("\n");
            throw new Error(
                `${missing.length} shortcode(s) documented in CLAUDE.md but ` +
                    `not registered via add_shortcode():\n${formatted}\n\n` +
                    `Either:\n` +
                    `  1. Register the shortcode in a snippet (preferred), OR\n` +
                    `  2. Remove the entry from CLAUDE.md, OR\n` +
                    `  3. Add the name to DOCUMENTED_NOT_REGISTERED in ` +
                    `tests/jest/shortcode-drift.test.js with a comment ` +
                    `(rare — typically only when waiting on a snippet ship).`
            );
        }
    });

    test("DOCUMENTED_NOT_REGISTERED entries don't shadow real registrations", () => {
        // Forces cleanup of stale allowlist entries when the snippet
        // ships and the shortcode actually gets registered.
        const stale = [];
        for (const name of DOCUMENTED_NOT_REGISTERED) {
            if (registered.has(name)) stale.push(name);
        }
        expect(stale).toEqual([]);
    });
});
