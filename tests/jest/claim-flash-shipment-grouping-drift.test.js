/**
 * Claim Flash Shipment Grouping drift detector — Sprint 29 Phase 4 Batch B Item 3.
 *
 * Pins the surface shipped in:
 *   • [Admin System] DINOCO Service Center & Claims (V.34.6) — _cfRenderList refactor
 *
 * Verifies future edits do not regress:
 *   - Direction grouping (replacement / repaired_return / inbound_pickup)
 *   - Group headers with Thai labels + count badges
 *   - Collapsible chevron data-action delegation
 *   - aria-expanded sync
 *   - Default state — first non-empty group expanded, others collapsed
 *   - Preserves existing per-row actions (cancel, view tracking)
 *   - UX-H3 strict (NO inline onclick on group header markup)
 *
 * Spec source: FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md Phase 4 Item 3.
 */

const fs = require('fs');
const path = require('path');

const REPO    = path.resolve(__dirname, '../..');
const SC_PATH = path.join(REPO, '[Admin System] DINOCO Service Center & Claims');
const SC_SRC  = fs.readFileSync(SC_PATH, 'utf8');

function stripPhpBlockComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '');
}
const SC_CODE = stripPhpBlockComments(SC_SRC);

// Isolate the _cfRenderList function body once.
const RENDER_MATCH = SC_CODE.match(/function\s+_cfRenderList\b[\s\S]+?\n\s*\$\(document\)\.on\(/);
const RENDER_BODY = RENDER_MATCH ? RENDER_MATCH[0] : '';

describe('Claim Flash Shipment Grouping — Phase 4 Batch B Item 3 drift detector', () => {

    test('Service Center version stamped V.34.6', () => {
        expect(SC_SRC).toMatch(/Version:\s*V\.34\.6\s*\(2026-05-14\)/);
    });

    test('_cfRenderList exists and is the entry point', () => {
        expect(RENDER_BODY).not.toBe('');
        expect(SC_CODE).toMatch(/function\s+_cfRenderList\s*\(\s*items\s*\)/);
    });

    test('_cfRenderList groups by 3 canonical directions in order', () => {
        // groupOrder array must list directions in deterministic order.
        const groupOrderMatch = RENDER_BODY.match(/var\s+groupOrder\s*=\s*\[([^\]]+)\]/);
        expect(groupOrderMatch).not.toBeNull();
        const arr = groupOrderMatch[1];
        // Order must be replacement → repaired_return → inbound_pickup
        const idxReplacement     = arr.indexOf('replacement');
        const idxRepairedReturn  = arr.indexOf('repaired_return');
        const idxInboundPickup   = arr.indexOf('inbound_pickup');
        expect(idxReplacement).toBeGreaterThanOrEqual(0);
        expect(idxRepairedReturn).toBeGreaterThan(idxReplacement);
        expect(idxInboundPickup).toBeGreaterThan(idxRepairedReturn);
    });

    test('_cfRenderList declares Thai group header labels for all 3 directions', () => {
        const labelMatch = RENDER_BODY.match(/var\s+groupHeaderLabel\s*=\s*\{[\s\S]+?\}/);
        expect(labelMatch).not.toBeNull();
        // Each direction has a 🟢/🔵/🟠 label
        expect(labelMatch[0]).toMatch(/replacement:/);
        expect(labelMatch[0]).toMatch(/repaired_return:/);
        expect(labelMatch[0]).toMatch(/inbound_pickup:/);
        // Thai words (any of the three should be present)
        expect(labelMatch[0]).toMatch(/ส่งของแทน|ส่งคืน|รับเข้าโกดัง/);
    });

    test('_cfRenderList renders count badge per group with scoped CSS class', () => {
        // Each group header must include a span.dnc-cf-group-count
        expect(RENDER_BODY).toMatch(/dnc-cf-group-count/);
    });

    test('_cfRenderList renders direction-specific count badge color class', () => {
        // Count badge variants follow .dnc-cf-group-count-<direction>
        expect(RENDER_BODY).toMatch(/dnc-cf-group-count-/);
    });

    test('_cfRenderList sets data-collapsed=0 for first non-empty group, 1 for others', () => {
        // The selection logic — "first non-empty group is expanded".
        expect(RENDER_BODY).toMatch(/firstNonEmpty/);
        expect(RENDER_BODY).toMatch(/data-collapsed="/);
    });

    test('_cfRenderList renders aria-expanded on group header button', () => {
        expect(RENDER_BODY).toMatch(/aria-expanded="/);
    });

    test('_cfRenderList preserves per-row Cancel button when status=created', () => {
        expect(RENDER_BODY).toMatch(/dnc-cf-btn-cancel/);
        expect(RENDER_BODY).toMatch(/data-action="dnc-cf-cancel"/);
    });

    test('_cfRenderList preserves per-row View tracking button', () => {
        expect(RENDER_BODY).toMatch(/dnc-cf-btn-view/);
        expect(RENDER_BODY).toMatch(/data-action="dnc-cf-view-tracking"/);
    });

    test('_cfRenderList renders group toggle button with data-action delegation (UX-H3)', () => {
        expect(RENDER_BODY).toMatch(/data-action="dnc-cf-toggle-group"/);
    });

    test('Group toggle handler wired via $(document).on event delegation', () => {
        expect(SC_CODE).toMatch(/\$\(document\)\.on\(\s*['"]click['"]\s*,\s*['"]\[data-action="dnc-cf-toggle-group"\]['"]/);
    });

    test('Group toggle handler flips data-collapsed attribute + aria-expanded', () => {
        const handlerBlock = SC_CODE.match(/\[data-action="dnc-cf-toggle-group"\][\s\S]+?\}\);/);
        expect(handlerBlock).not.toBeNull();
        expect(handlerBlock[0]).toMatch(/data-collapsed/);
        expect(handlerBlock[0]).toMatch(/aria-expanded/);
    });

    test('Group rendering uses NO inline onclick anywhere (UX-H3 strict)', () => {
        // The group header button block must NOT carry onclick=.
        const groupHeaderHtml = RENDER_BODY.match(/<button[^>]*data-action="dnc-cf-toggle-group"[\s\S]+?<\/button>/);
        expect(groupHeaderHtml).not.toBeNull();
        expect(groupHeaderHtml[0]).not.toMatch(/\bonclick\s*=/i);
    });

    test('CSS .dnc-cf-group + .dnc-cf-group-header declared (scoped)', () => {
        expect(SC_CODE).toMatch(/\.dnc-cf-group\s*\{/);
        expect(SC_CODE).toMatch(/\.dnc-cf-group-header\s*\{/);
    });

    test('CSS .dnc-cf-chev rotation rule present (visual cue)', () => {
        // transform: rotate(90deg) when expanded.
        expect(SC_CODE).toMatch(/\.dnc-cf-chev/);
        expect(SC_CODE).toMatch(/rotate\(90deg\)/);
    });

    test('CSS hides group body when data-collapsed=1', () => {
        expect(SC_CODE).toMatch(/data-collapsed="1"[\s\S]*?dnc-cf-group-body[\s\S]*?display:\s*none/);
    });

    test('CSS distinct count-badge backgrounds for 3 directions', () => {
        expect(SC_CODE).toMatch(/\.dnc-cf-group-count-replacement\s*\{/);
        expect(SC_CODE).toMatch(/\.dnc-cf-group-count-repaired_return\s*\{/);
        expect(SC_CODE).toMatch(/\.dnc-cf-group-count-inbound_pickup\s*\{/);
    });

    test('_cfRenderList still bails early when items is empty (preserves V.34.5 behavior)', () => {
        expect(RENDER_BODY).toMatch(/items\.length\s*===\s*0/);
        expect(RENDER_BODY).toMatch(/dnc-cf-empty/);
    });

    test('_cfRenderList row template still emits dnc-cf-row + data-pno (UX-H3 + delegation compat)', () => {
        expect(RENDER_BODY).toMatch(/dnc-cf-row/);
        expect(RENDER_BODY).toMatch(/data-pno=/);
    });

    test('_cfRenderList row template preserves print_status badge (V.34.4 Phase 3.6)', () => {
        expect(RENDER_BODY).toMatch(/print_status/);
        expect(RENDER_BODY).toMatch(/dnc-cf-print-badge/);
    });

    test('_cfRenderList collapsed header shows first PNO preview when collapsed', () => {
        // "PNO {first} …" hint when collapsed=1.
        expect(RENDER_BODY).toMatch(/firstPno/);
    });
});
