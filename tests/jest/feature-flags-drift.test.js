/**
 * Feature flag drift detector — CLAUDE.md flag mentions ↔ snippet usage.
 *
 * CLAUDE.md describes feature flags throughout (b2b_flag_bo_system,
 * b2f_flag_shadow_write, dinoco_shipping_meta_enabled, etc.) — each
 * flag must be CHECKED in code via get_option() / b2f_is_flag_enabled()
 * / similar accessor. Otherwise the doc lies (flag removed but doc
 * unchanged, or flag never wired into runtime path).
 *
 * Detection:
 *   - Pattern in docs: `b2[bf]_flag_<name>` or `dinoco_<x>_enabled`
 *     wherever they appear in CLAUDE.md prose
 *   - Pattern in code: get_option('flag_name'), update_option(...),
 *     b2f_is_flag_enabled('name'), dinoco_config('flag_name'),
 *     'flag_name' string literals in flag arrays
 *
 * Asymmetry: docs is subset of code. Flags used in code but not
 * documented = OK (internal toggles). Documented but unused = bug.
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

const DOCUMENTED_NOT_USED = new Set([
    // Historical-context mention only. Removed from runtime in Phase 1
    // audit remediation 2026-04-17 (BUG-H8) — flag was declared +
    // UI-toggleable + dependency-checked but never consumed by business
    // logic. Auto-hide now driven by `admin_display_mode='as_parts'`
    // column set by Phase 4 migration when missing_leaves>0, not by a
    // runtime flag. CLAUDE.md keeps the mention for audit/historical
    // trail value (Phase 1 cleanup record). Verify removal: grep
    // returns 0 PHP refs as of 2026-04-29.
    "b2f_flag_ungroup_auto_hide",
    // Historical-context mention only. The actual runtime flag is
    // `dinoco_shipping_meta_enabled` (without the `_flag_` infix), wired
    // throughout Snippet 1 + Snippet 3 + Snippet 15 (V.42 Flash Shipping
    // Metadata system). The misspelled `dinoco_flag_shipping_meta_enabled`
    // appeared in early FEATURE-SPEC drafts + CHANGELOG; Day 1 Quick Wins
    // (commit `357852a`, 2026-04-29) sync'd 10 occurrences across docs.
    // CLAUDE.md preserves the mention as Day 1 Quick Wins audit trail —
    // explaining the doc-drift fix. Verify: grep returns 0 PHP refs.
    "dinoco_flag_shipping_meta_enabled",
    // Production S/N Management System v2.13 (Phase 1 W2-W4, 2026-05-04).
    // The flag IS wired in [Admin System] DINOCO Production S/N Manager
    // (function dinoco_sn_is_enabled() + dinoco_sn_init_flags()), but
    // the filesystem path uses a literal `/` in `S/N` which causes git
    // to track it under a subdirectory (`[Admin System] DINOCO Production S/`
    // → `N Manager`). The drift detector scans only top-level snippet
    // files at REPO_ROOT, so the wrapper code is invisible to this test.
    // Adding to whitelist as documented exception. Verify wired:
    //   grep -r "dinoco_sn_system_enabled" "[Admin System] DINOCO Production S/"
    "dinoco_sn_system_enabled",
]);

/**
 * Extract flag names from CLAUDE.md.
 * Patterns:
 *   - `b2b_flag_<name>` / `b2f_flag_<name>` (B2B/B2F gate flags)
 *   - `dinoco_<x>_enabled` (Dinoco system kill-switches)
 */
function extractDocumentedFlags() {
    const content = fs.readFileSync(path.join(REPO_ROOT, "CLAUDE.md"), "utf8");
    const flags = new Set();
    const re = /\b(b2[bf]_flag_[a-z_0-9]+|dinoco_[a-z_0-9]+_enabled)\b/g;
    let m;
    while ((m = re.exec(content)) !== null) {
        flags.add(m[1]);
    }
    return flags;
}

/**
 * Extract flags actually checked or set in snippet code.
 * Looks for the flag name as a literal string in calls like:
 *   get_option('flag_name')
 *   update_option('flag_name', ...)
 *   b2f_is_flag_enabled('flag_name')
 *   dinoco_config('flag_name')
 *   'flag_name' (in flag-array contexts)
 */
function extractUsedFlags() {
    const flags = new Set();
    // Match 'flag_name' or "flag_name" anywhere in code with the flag-naming
    // pattern. False positives unlikely since flag names are highly specific.
    const re = /['"](b2[bf]_flag_[a-z_0-9]+|dinoco_[a-z_0-9]+_enabled)['"]/g;

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
            flags.add(m[1]);
        }
    }
    return flags;
}

describe("Feature flag drift — CLAUDE.md ↔ snippet usage", () => {
    const documented = extractDocumentedFlags();
    const used = extractUsedFlags();

    test("CLAUDE.md mentions feature flags (sanity)", () => {
        expect(documented.size).toBeGreaterThan(5);
    });

    test("snippets use feature flags (sanity)", () => {
        expect(used.size).toBeGreaterThan(5);
    });

    test("every documented flag is referenced in code", () => {
        const missing = [];
        for (const flag of documented) {
            if (DOCUMENTED_NOT_USED.has(flag)) continue;
            if (!used.has(flag)) missing.push(flag);
        }

        if (missing.length > 0) {
            const formatted = missing.map((f) => `  ${f}`).join("\n");
            throw new Error(
                `${missing.length} flag(s) documented in CLAUDE.md but ` +
                    `never read/written in any snippet:\n${formatted}\n\n` +
                    `Either:\n` +
                    `  1. Wire the flag into runtime code (preferred), OR\n` +
                    `  2. Remove the entry from CLAUDE.md (doc cleanup), OR\n` +
                    `  3. Add the name to DOCUMENTED_NOT_USED in ` +
                    `tests/jest/feature-flags-drift.test.js with a comment.`
            );
        }
    });

    test("DOCUMENTED_NOT_USED entries don't shadow real refs", () => {
        const stale = [];
        for (const flag of DOCUMENTED_NOT_USED) {
            if (used.has(flag)) stale.push(flag);
        }
        expect(stale).toEqual([]);
    });
});
