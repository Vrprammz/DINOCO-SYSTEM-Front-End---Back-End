/**
 * Constants drift detector — CLAUDE.md "Required WordPress Constants"
 * vs actual code references.
 *
 * CLAUDE.md lists ~20 WP constants (`DINOCO_LINE_CHANNEL_ID`,
 * `B2B_LINE_ACCESS_TOKEN`, etc.) as required for production. Each
 * documented constant must be referenced somewhere in code — either:
 *   - `defined('NAME')` (presence check)
 *   - `define('NAME', ...)` (declaration)
 *   - Bare `NAME` reference (consumer)
 *   - getenv() / $_ENV equivalent
 *
 * Otherwise the doc is stale (constant removed but doc not updated).
 *
 * NOT asserted (intentional asymmetry):
 *   - Constants referenced in code but not documented = OK (internal
 *     tunables, debug flags, etc.). Spec is "subset of code".
 *
 * Caught classes:
 *   - Documented constant deleted from code (stale doc)
 *   - Typo in CLAUDE.md (e.g., `DINOCO_LIN_CHANNEL_ID` missing "E")
 *   - Forgot to ship a feature using the documented constant
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

const DOCUMENTED_NOT_REFERENCED = new Set([
    // (none currently)
]);

/**
 * Pull constants from CLAUDE.md "Required WordPress Constants" section.
 * Format: `- \`CONSTANT_NAME\` — description`
 *
 * Skip wildcard entries like `B2B_WALKIN_BANK_*` — those are documented
 * as a family, not individual constants. Test would need to either
 * expand the wildcard against actual code or skip them. We skip.
 */
function extractDocumentedConstants() {
    const content = fs.readFileSync(path.join(REPO_ROOT, "CLAUDE.md"), "utf8");
    const constants = new Set();

    // Find the section
    const sectionStart = content.indexOf(
        "## Required WordPress Constants"
    );
    if (sectionStart === -1) {
        throw new Error(
            "CLAUDE.md missing 'Required WordPress Constants' section — " +
                "test cannot proceed."
        );
    }
    // Section ends at next ## heading
    const restAfterStart = content.substring(sectionStart);
    const nextHeading = restAfterStart.indexOf("\n## ", 1);
    const section =
        nextHeading === -1
            ? restAfterStart
            : restAfterStart.substring(0, nextHeading);

    // Match `- `NAME` — description`
    const re = /^-\s+`([A-Z_][A-Z0-9_]+)`/gm;
    let m;
    while ((m = re.exec(section)) !== null) {
        const name = m[1];
        // Skip wildcard family markers (the underscore-asterisk pattern)
        if (name.endsWith("_")) continue; // shouldn't happen but defensive
        constants.add(name);
    }
    // Wildcard entries like B2B_WALKIN_BANK_* won't match the regex
    // (asterisks aren't in the char class). Good — they're skipped.

    return constants;
}

/**
 * Build a Set of constant names referenced anywhere in snippet code.
 * Picks up: define('NAME', ...), defined('NAME'), bare NAME usage.
 */
function extractReferencedConstants() {
    const constants = new Set();

    // Match three forms:
    //   define('NAME'  — declaration
    //   defined('NAME' — presence check
    //   constant('NAME' — dynamic resolution
    const stringRefRe =
        /\b(?:define|defined|constant)\s*\(\s*['"]([A-Z_][A-Z0-9_]+)['"]/g;

    // Match bare uppercase identifier of length 6+ (filters short
    // false positives like 'GET', 'POST'). Anchored with word
    // boundaries; excludes preceding `$` (those are var names).
    const bareRefRe = /(?<![A-Z0-9_$\\])\b([A-Z][A-Z0-9_]{5,})\b(?![A-Z0-9_])/g;

    for (const entry of fs.readdirSync(REPO_ROOT, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.includes(".")) continue;
        if (!SNIPPET_PREFIXES.some((p) => entry.name.startsWith(p))) continue;

        const content = fs.readFileSync(
            path.join(REPO_ROOT, entry.name),
            "utf8"
        );

        // String-form references
        let m;
        stringRefRe.lastIndex = 0;
        while ((m = stringRefRe.exec(content)) !== null) {
            constants.add(m[1]);
        }

        // Bare references — only useful for our specific list since
        // bare uppercase identifiers are common in PHP. Match-and-test
        // approach is faster than indexing all bare refs.
        bareRefRe.lastIndex = 0;
        while ((m = bareRefRe.exec(content)) !== null) {
            constants.add(m[1]);
        }
    }
    return constants;
}

describe("Required constants drift — CLAUDE.md ↔ code references", () => {
    const documented = extractDocumentedConstants();
    const referenced = extractReferencedConstants();

    test("CLAUDE.md has Required Constants section (sanity)", () => {
        expect(documented.size).toBeGreaterThan(15);
    });

    test("snippet code references constants (sanity)", () => {
        // Each documented constant should be referenced multiple times
        // (define + getenv + consumer sites). The total set is large.
        expect(referenced.size).toBeGreaterThan(50);
    });

    test("every documented constant is referenced in code", () => {
        const missing = [];
        for (const name of documented) {
            if (DOCUMENTED_NOT_REFERENCED.has(name)) continue;
            if (!referenced.has(name)) missing.push(name);
        }

        if (missing.length > 0) {
            const formatted = missing.map((n) => `  ${n}`).join("\n");
            throw new Error(
                `${missing.length} constant(s) documented in CLAUDE.md but ` +
                    `never referenced in any snippet:\n${formatted}\n\n` +
                    `Either:\n` +
                    `  1. Reference the constant in code (defined/define/use), OR\n` +
                    `  2. Remove the entry from CLAUDE.md, OR\n` +
                    `  3. Add the name to DOCUMENTED_NOT_REFERENCED in ` +
                    `tests/jest/constants-drift.test.js with a comment.`
            );
        }
    });

    test("DOCUMENTED_NOT_REFERENCED entries don't shadow real refs", () => {
        const stale = [];
        for (const name of DOCUMENTED_NOT_REFERENCED) {
            if (referenced.has(name)) stale.push(name);
        }
        expect(stale).toEqual([]);
    });
});
