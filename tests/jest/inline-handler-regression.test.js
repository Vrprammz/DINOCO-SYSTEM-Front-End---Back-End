/**
 * Inline handler regression guard — count baseline + monotonic decrease.
 *
 * UX-H3 (audit 2026-04-17) mandated migration of inline `onclick=` /
 * `onchange=` / `oninput=` / `onerror=` etc. handlers to event
 * delegation via `data-action` attributes. Phase 6 (Round 21 of audit
 * remediation) closed 75+ sites in 9 priority files.
 *
 * Many other snippets still contain inline handlers (873 total at
 * baseline). This test does NOT require all of them to be migrated —
 * instead it enforces a **monotonic decrease**: the count today must
 * not exceed the baseline. Any new feature that introduces an inline
 * handler will fail CI.
 *
 * Two safe paths to update the baseline:
 *   1. Migrate handlers (recommended) → count drops → update baseline
 *      DOWN to current count
 *   2. Add legitimate handlers (rare — only for accessibility-critical
 *      patterns like `<input type=file onchange=...>` where the form
 *      reset breaks event delegation) → discuss in PR review +
 *      update baseline UP with comment
 *
 * Detection scope:
 *   - All snippet files (prefix `[B2B]`, `[B2F]`, `[Admin System]`,
 *     `[System]`, `[GitHub]`, `[LIFF AI]`)
 *   - All HTML event attributes (full list from HTML spec):
 *     onclick / onchange / oninput / onsubmit / onreset / onload /
 *     onerror / onfocus / onblur / onkey* / onmouse* / etc.
 *
 * Excluded from scope:
 *   - openclawminicrm/ (own audit, separate codebase)
 *   - rpi-print-server/ (Python + minimal HTML)
 *   - liff-src/ (Vite-built, modern ES modules — no inline handlers
 *     by convention)
 *   - tests/ (test fixtures may have inline handlers as-is)
 *
 * Round 21 ITEM C (2026-04-29).
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
 * Baseline count locked at 2026-04-29 after Round 21 sweep.
 *
 * Current count: 862 (counted with comment-stripping pass).
 * Baseline:      870 (small slack for non-handler code mutations
 *                     that incidentally touch the regex).
 *
 * Top contributors at baseline (counts with comments stripped):
 *   [Admin System] DINOCO Global Inventory Database    197
 *   [Admin System] DINOCO Manual Invoice System         94
 *   [Admin System] DINOCO Service Center & Claims       58
 *   [B2B] Snippet 9: Admin Control Panel                50
 *   [Admin System] DINOCO Admin Dashboard               41
 *   ... 39 files total contributing
 *
 * Round 21 deliberately did NOT migrate the remaining ~862 — it
 * locks the count to prevent regression on future feature work.
 *
 * As migrations land in subsequent rounds, lower this baseline
 * (the freshness test below catches stale upper bounds when slack
 * exceeds 50).
 */
// Bumped 870→881 (2026-05-04): rename S/N→SN unblocked scanner from
// reading [Admin System] DINOCO Production SN Manager (was previously
// a macOS subdirectory, skipped by file scanner). 11 onclick handlers
// inside admin tabs (Batches/Receive/Pool/Manage/Audit) were authored
// in Phase 1 W2-W4 — pre-existing, not net-new code today. Migration
// to data-action delegation deferred to Phase 2 W5 polish sprint per
// v2.13 schedule.
const BASELINE_INLINE_HANDLER_COUNT = 881;

/**
 * Tolerance band for non-deterministic count fluctuation. Should be 0
 * — strict enforcement. If a legitimate refactor produces noise (e.g.
 * a generic .php file added with comment-out handler markup), tolerance
 * can be raised to 5-10 with explicit justification.
 */
const TOLERANCE = 0;

/**
 * Regex matching all standard HTML event attribute names. Captures
 * the full set defined by HTML5 + legacy attributes still parsed by
 * browsers. Case-insensitive (HTML attributes are case-insensitive).
 *
 * Match specifically `<eventname>=` to avoid false positives like
 *   const onclick = ...           (variable assignment in JS)
 *   button.onclick = function...  (DOM property in JS)
 * The leading `\s` or `<` boundary + literal `=` after the attribute
 * name reduces noise. Inside template literals or echoed HTML strings
 * (the actual UX-H3 sites), the pattern is `<button onclick="...">`.
 */
const INLINE_HANDLER_RE = new RegExp(
    "\\b(?:onclick|ondblclick|onchange|oninput|onsubmit|onreset|" +
        "onload|onunload|onerror|onfocus|onblur|onkeydown|onkeyup|" +
        "onkeypress|onmousedown|onmouseup|onmouseover|onmouseout|" +
        "onmousemove|onpaste|oncopy|oncut|ondrag|ondragend|ondragstart|" +
        "ondragover|ondragenter|ondragleave|ondrop|onwheel|onscroll|" +
        "ontouchstart|ontouchend|ontouchmove|ontouchcancel|onselect|" +
        "ontoggle|oncontextmenu)\\s*=",
    "gi"
);

/**
 * Count inline handler occurrences in a single file. Strips inline
 * comments (// ... and /* ... *\/) before counting to avoid noise
 * from documentation strings that quote the migration pattern.
 */
function countInlineHandlersInFile(content) {
    // Strip line comments  (// ... \n)
    let stripped = content.replace(/\/\/[^\n]*/g, "");
    // Strip block comments (/* ... */)
    stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, "");

    const matches = stripped.match(INLINE_HANDLER_RE);
    return matches ? matches.length : 0;
}

function countAllInlineHandlers() {
    let total = 0;
    const perFile = {};

    for (const entry of fs.readdirSync(REPO_ROOT, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.includes(".")) continue;
        if (!SNIPPET_PREFIXES.some((p) => entry.name.startsWith(p))) continue;

        const content = fs.readFileSync(
            path.join(REPO_ROOT, entry.name),
            "utf8"
        );
        const count = countInlineHandlersInFile(content);
        if (count > 0) {
            perFile[entry.name] = count;
            total += count;
        }
    }
    return { total, perFile };
}

describe("Inline handler regression guard (UX-H3)", () => {
    const { total, perFile } = countAllInlineHandlers();

    test("snippets exist (sanity)", () => {
        expect(Object.keys(perFile).length).toBeGreaterThan(5);
    });

    test("inline handler count is at or below baseline", () => {
        if (total > BASELINE_INLINE_HANDLER_COUNT + TOLERANCE) {
            const delta = total - BASELINE_INLINE_HANDLER_COUNT;
            const topOffenders = Object.entries(perFile)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([f, n]) => `  ${n.toString().padStart(4)} : ${f}`)
                .join("\n");

            throw new Error(
                `Inline handler count regressed: ${total} (baseline: ${BASELINE_INLINE_HANDLER_COUNT}, +${delta}).\n\n` +
                    `New inline handlers (onclick=, onchange=, etc.) were ` +
                    `introduced. Per UX-H3, migrate to event delegation:\n\n` +
                    `  // Bad\n` +
                    `  <button onclick="doThing(\${id})">Click</button>\n\n` +
                    `  // Good\n` +
                    `  <button data-action="do-thing" data-id="\${id}">Click</button>\n` +
                    `  // ... in delegated handler:\n` +
                    `  container.addEventListener("click", e => {\n` +
                    `    const t = e.target.closest("[data-action]");\n` +
                    `    if (t?.dataset.action === "do-thing") doThing(parseInt(t.dataset.id, 10));\n` +
                    `  });\n\n` +
                    `Pattern doc: docs/patterns/EVENT-DELEGATION.md\n\n` +
                    `Top offenders (current counts):\n${topOffenders}\n\n` +
                    `Either:\n` +
                    `  1. Refactor the new handlers to use data-action ` +
                    `delegation (preferred), OR\n` +
                    `  2. If the addition is justified (rare), update ` +
                    `BASELINE_INLINE_HANDLER_COUNT in ` +
                    `tests/jest/inline-handler-regression.test.js with a ` +
                    `comment explaining why.`
            );
        }
    });

    test("baseline is fresh (count not significantly below upper bound)", () => {
        // If the actual count drops more than 50 below baseline, it
        // means migrations have landed and the baseline is stale.
        // Force a baseline update via this test failure.
        const slack = BASELINE_INLINE_HANDLER_COUNT - total;
        if (slack > 50) {
            throw new Error(
                `Inline handler baseline is stale: ${BASELINE_INLINE_HANDLER_COUNT} ` +
                    `vs current ${total} (slack: ${slack}).\n\n` +
                    `Migrations have landed. Lower BASELINE_INLINE_HANDLER_COUNT ` +
                    `to ${total} in tests/jest/inline-handler-regression.test.js ` +
                    `to lock in the new floor.\n\n` +
                    `(Baseline is ratcheted DOWN as migrations land; this ` +
                    `prevents future regressions from creeping back to old levels.)`
            );
        }
    });
});
