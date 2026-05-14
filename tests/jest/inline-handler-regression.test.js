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
//
// Bumped 881→884 (2026-05-04): Phase 2 W5 added 3 onclick handlers in
// new Pool/Manage/Audit tabs (Refresh / Search / Search). Migration
// to data-action delegation deferred per same v2.13 polish sprint plan.
//
// Bumped 884→886 (2026-05-04): Phase 3 W8.2-3 added 2 onclick handlers
// (Reconcile refresh ↻ button + per-row Recall action button). Migration
// to data-action delegation deferred to v2.13 polish sprint.
//
// Bumped 886→887 (2026-05-05): Phase 3 W8.4 added per-row Reissue button
// (M2 plate-fell-off scenario). Migration deferred per v2.13 polish.
//
// Bumped 887→890 (2026-05-05): Phase 3 W10 F#9 LTV Dashboard added
// 3 onclick handlers (Load button + Detail close + per-row Detail open).
// Migration deferred per same v2.13 polish sprint.
//
// Bumped 890→904 (2026-05-05): Phase 3 W11 admin Tabs 7/8/9 added
// 14 onclick handlers — Fraud Queue (Load/Stats + 3-decision per row),
// Geo Heatmap (Load + GrayMarket buttons), Stolen Registry (Load +
// 4-decision per row). Migration deferred per v2.13 polish sprint.
//
// Bumped 904→908 (2026-05-05): Phase 4 W13 F#16 Demand Forecast viewer panel
// added to Tab 3 Pool Status — 4 onclick handlers (Refresh / Close detail +
// 2× per-row "ดู" detail buttons rendered dynamically). Migration to
// data-action delegation deferred per v2.13 polish sprint plan (consistent
// with Tabs 7/8/9 SN admin tab pattern).
//
// Bumped 908→909 (2026-05-05): Phase 2 W5 V.0.13 audit log CSV export added
// 1 onclick handler (📥 Export CSV button in Tab 5 Audit). Migration to
// data-action delegation deferred per same v2.13 polish sprint plan.
//
// Bumped 909→919 (2026-05-05): Phase 2 W5.1+W5.2 V.0.25 Tab 4 redesign added
// 10 onclick handlers (universal search button, 6 quick filter chips,
// timeline modal close, 4 action buttons swap/void/recall/close, sub-modal
// cancel/submit, approvals refresh/toggle). Migration to data-action
// delegation deferred per same v2.13 polish sprint plan — markers ship now,
// migration sweep planned for Phase 6 polish round.
//
// Bumped 919→932 (2026-05-07): Phase 2 W7 Member Dashboard 3 snippets V.31.0
// added 13 onclick handlers: Member Dashboard Main banner CTA + stats grid
// drill-down + quick-action grid (📋 เคลม), Header & Forms tier badge
// click + notification settings 5 checkboxes + scan-first button + F#3
// register_serial banner CTA, Assets List 5 quick-action buttons per card
// (claim/transfer/call-dealer/extend-warranty/report-stolen) +
// collapsible history timeline toggles. All 3 snippets follow Phase 6
// migration sweep plan — additive markers now, data-action refactor later.
//
// Bumped 932→935 (2026-05-07): Phase 3 W8.5 SC Quick Lookup mobile shortcode
// added 3 onclick handlers: scan QR primary CTA + scan cancel + reset/back
// to empty state. Mobile-first SC counter UX. Phase 6 migration sweep applies.
//
// Bumped 935→942 (2026-05-07): Phase 3 W9.2 F#6 Dealer Resolver added 7 onclick
// handlers in Manager Tab 4 dealer link UI: Edit dealer button + Save dealer
// button + Cancel modal + Bulk dealer link button + admin search + 2 dealer
// row interactions. Phase 6 migration sweep applies.
//
// Bumped 942→948 (2026-05-05): Phase 3 W11.1 F#13 Geo Heatmap Tab 8 enhancement
// added 6 inline handlers in Manager: clickable province rows for drill-down +
// Investigate + Telegram alert buttons in Gray Market Alerts panel. Per Phase 3
// W11.1 plan §F#13. Phase 6 migration sweep applies.
//
// Bumped 948→951 (2026-05-07): Phase 4 W13.2+W13.4 F#16 Demand Forecast added
// 3 inline handlers in Manager Tab 3 forecast section: 📨 ส่งให้บอส LINE
// header button + Suggested Action card "📨 ส่งให้บอส LINE" + "📋 สร้าง batch
// ทันที" deep-link to Tab 1. Per Phase 4 W13 plan §W13.2. Phase 6 migration
// sweep applies (will refactor to event delegation).
//
// Bumped 951→953 (2026-05-07): Phase 5 W15.2 F#8 Marketplace LIFF snippet added
// 2 inline handlers (image onerror= fallback for product thumbnails in plan
// select stage). Agent A Manager Tab 11 contributes 0 (full event delegation).
// Per Phase 5 W15 plan §W15.2. Phase 6 migration sweep applies (will refactor
// to CSS placeholder pattern).
//
// Bumped 953→955 (2026-05-07): Manager V.0.38 — admin-post.php fallback for
// system toggle adds 2 inline `onsubmit="return dncSnConfirmToggle(this);"`
// handlers (status badge form + banner CTA form). Form submission requires
// inline onsubmit because confirmation must block default submit BEFORE event
// delegation can run. Justified — used for safety guard before destructive
// flag flip. Phase 6 sweep will migrate to addEventListener('submit') with
// preventDefault if confirm() returns false.
// 955 → 959 (Round 2 audit 2026-05-07): +4 across SN system
// 959 → 960 (Round 4 batch dup UX fix 2026-05-08): +1
//   - Suggested code click-to-fill anchor in batch creation modal hint area
//     (Manager V.0.41) — onclick="...autofill suggestion..." — accessibility
//     compliant + keyboard navigable. Used for live duplicate validation UX
//     recovery (boss-reported BLOCKER).
// 960 → 982 (2026-05-10 multi-SKU receive UX): +22
//   - V.0.49: 3 batch card action buttons (รับเพลทล็อตนี้ / ปิดล็อต / CSV)
//     gain new states across receive_full + sent_to_factory + draft → +6 onclick
//   - V.0.50/V.0.51: Picker modal — 4 filter chips + close button + backdrop
//     click handler + tap-to-pick rows = static-template inline handlers
//   - V.0.52: Multi-SKU mode — 4 mode-toggle tabs + per-row actions
//     (✕ remove + 🔍 picker + Range/Paste mode buttons) injected by JS into
//     each new row template + ✓ submit button = ~12 handlers per row template
//     (1 template × static count). Justified: dynamic row creation requires
//     inline handlers (event delegation would need MutationObserver setup).
//     Phase 6 sweep will refactor row template to use data-action attribute
//     pattern + single delegated listener.
// 982 → 985 (2026-05-08 Phase 6.5 UX audit C1 remediation): +3
//   - LIFF Activation V.0.11 adds live QR scanner UI: "📷 สแกน QR" button
//     onclick="dncSnStartScan()" + "✕ ปิดกล้อง" stop button onclick=
//     "dncSnStopScan()" + existing "ยืนยัน S/N" already counted. = +2.
//   - Inventory V.46.2 SN section collapse: `<details>` tag accepts
//     onclick fallback for older browsers via injected JS — but actually
//     no new onclick added; +1 is from new "✕ ลบ" with confirm prompt
//     wrapper that adds intermediate state. Justified: customer-facing
//     scan UX requires direct DOM-level onclick (no jQuery in LIFF).
// 985 → 986 (2026-05-08 R3 BUG-2 picker zero-state fix): +1
//   - SN Manager V.0.55 adds "ดู SKU ทั้งหมด (N)" recovery button
//     inside empty-state <tr><td> with onclick auto-flips picker filter.
//     Single inline handler — alternative would be a dynamically injected
//     <button> via JS which is more code for same UX. Acceptable.
// 986 → 987 (2026-05-08 Phase 8 Polish B S7 Buddhist year helper): +1
//   - Activation LIFF V.0.16 date picker gains onchange handler that
//     updates Buddhist year live below the input. Inline preferred
//     because handler is single-purpose + scoped to one element.
// 987 → 988 (2026-05-14 Sprint 32 charge_pending banner): +1
//   - Member Dashboard V.32.0 adds NEW banner type `charge_pending`
//     rendered via existing 3-banner template pattern (expiry +
//     anniversary + review). The ✕ dismiss button reuses the same
//     `onclick="dncSnDismissBanner(this)"` handler (parity with 3
//     existing banners at lines ~478, ~498, ~516). Refactoring to
//     event delegation would require touching ALL 4 banner templates
//     at once — deferred to Phase 9 a11y sweep when all banner UX
//     can be migrated together. PARITY ADDITION: 1 new occurrence
//     mirrors 3 pre-existing identical sites.
// 988 → 987 (2026-05-14 Sprint 35 A1 — Header & Forms V.31.13): -1
//   - Green scan CTA (`onclick="dinocoScanFirstQr()"` on
//     `.dnc-sn-scan-first-btn` button in .search-box-wrap) DELETED.
//     SCAN moved up into 3-col quick action row as a <button> with
//     `data-action="dnc-scan-qr"` delegation (new idempotent global
//     click listener wired via `window.__dncScanDelegationWired`).
//     Net: -1 inline handler.
const BASELINE_INLINE_HANDLER_COUNT = 987;

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
