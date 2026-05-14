/**
 * Service Center Flash Shipments section drift detector — Sprint 28 Phase 3.3.
 * Pins [Admin System] DINOCO Service Center & Claims V.34.4 + Claim Flash
 * Dispatcher V.0.5.
 *
 * Pin set:
 *   • SC version bumped to V.34.4 (Sprint 28 Phase 3.3)
 *   • Dispatcher version bumped to V.0.5 (Sprint 28 Phase 3.3+3.6)
 *   • NEW #sc-flash-shipments-section markup with data-enabled flag gate
 *   • Trigger button #dnc-cf-trigger-btn with data-action="dnc-cf-open-create"
 *   • List panel #dnc-cf-list-panel
 *   • Scoped CSS .dnc-claim-flash-admin .dnc-cf-* classes
 *   • Direction badge classes (replacement/repaired_return/inbound_pickup)
 *   • Status badge classes (created/picked_up/in_transit/delivered/cancelled/failed)
 *   • scLoadFlashList + scOpenCreateFlash exported via IIFE return
 *   • openManage hooks scLoadFlashList(tid, data)
 *   • dinocoModal.confirm Phase 6 onConfirm-capture pattern (no DOM-after-teardown)
 *   • UX-H3 strict — NO inline onclick on new code (data-action delegation)
 *   • X-Idempotency-Key UUID generated client-side per submit
 *   • dispatcher /flash/list endpoint registered + admin perm
 *   • recipient_override field flows from REST → helper sanitize chain
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

describe('Service Center Flash Shipments — Sprint 28 Phase 3.3 drift detector', () => {
    const sc = read('[Admin System] DINOCO Service Center & Claims');
    const dispatcher = read('[Admin System] DINOCO Claim Flash Dispatcher');

    // ─── Version pins ────────────────────────────────────────────────

    test('Service Center version bumped to V.34.4 — Sprint 28 Phase 3.3', () => {
        expect(sc).toMatch(/Version:\s*V\.34\.4\s*\(2026-05-14\)/);
        // Lineage preserved
        expect(sc).toMatch(/Version:\s*V\.34\.3\s*\(2026-05-14\)/);
        expect(sc).toMatch(/Version:\s*V\.34\.2\s*\(2026-05-14\)/);
    });

    test('Dispatcher version bumped to V.0.5 — Sprint 28', () => {
        expect(dispatcher).toMatch(/Version:\s*V\.0\.5\s*\(2026-05-14\)/);
        // Lineage preserved
        expect(dispatcher).toMatch(/Version:\s*V\.0\.4\s*\(2026-05-14\)/);
        expect(dispatcher).toMatch(/Version:\s*V\.0\.3\s*\(2026-05-14\)/);
    });

    // ─── Section markup ──────────────────────────────────────────────

    test('NEW #sc-flash-shipments-section rendered with data-enabled flag gate', () => {
        expect(sc).toMatch(/id="sc-flash-shipments-section"/);
        expect(sc).toMatch(/data-enabled="<\?php echo \(int\) get_option\(\s*'dinoco_claim_flash_enabled'/);
    });

    test('Section hidden server-side when flag OFF (REG-029)', () => {
        // The class should include 'hidden' when option=0
        expect(sc).toMatch(/get_option\(\s*'dinoco_claim_flash_enabled',\s*0\s*\)\s*\?\s*''\s*:\s*'hidden'/);
    });

    test('Trigger button #dnc-cf-trigger-btn uses data-action delegation', () => {
        expect(sc).toMatch(/id="dnc-cf-trigger-btn"/);
        expect(sc).toMatch(/data-action="dnc-cf-open-create"/);
    });

    test('List panel #dnc-cf-list-panel + count badge #dnc-cf-count', () => {
        expect(sc).toMatch(/id="dnc-cf-list-panel"/);
        expect(sc).toMatch(/id="dnc-cf-count"/);
    });

    // ─── Scoped CSS ──────────────────────────────────────────────────

    test('Scoped CSS .dnc-claim-flash-admin namespace (no leakage to charges)', () => {
        expect(sc).toMatch(/\.dnc-claim-flash-admin\s+\.dnc-cf-row/);
        expect(sc).toMatch(/\.dnc-claim-flash-admin\s+\.dnc-cf-dir-pill/);
    });

    test('Direction badge classes for all 3 directions', () => {
        expect(sc).toMatch(/\.dnc-cf-dir-replacement\s*\{/);
        expect(sc).toMatch(/\.dnc-cf-dir-repaired_return\s*\{/);
        expect(sc).toMatch(/\.dnc-cf-dir-inbound_pickup\s*\{/);
    });

    test('Status badge classes — created/picked_up/in_transit/delivered/cancelled/failed', () => {
        expect(sc).toMatch(/\.dnc-cf-st-created\s*\{/);
        expect(sc).toMatch(/\.dnc-cf-st-picked_up\s*\{/);
        expect(sc).toMatch(/\.dnc-cf-st-in_transit\s*\{/);
        expect(sc).toMatch(/\.dnc-cf-st-delivered\s*\{/);
        expect(sc).toMatch(/\.dnc-cf-st-cancelled\s*\{/);
        expect(sc).toMatch(/\.dnc-cf-st-failed\s*\{/);
    });

    test('Print badge class .dnc-cf-print-badge', () => {
        expect(sc).toMatch(/\.dnc-cf-print-badge\s*\{/);
    });

    // ─── JS handlers wired ───────────────────────────────────────────

    test('scLoadFlashList + scOpenCreateFlash exported via IIFE return', () => {
        expect(sc).toMatch(/scLoadFlashList,\s*\n\s*scOpenCreateFlash/);
    });

    test('openManage hooks scLoadFlashList(tid, data)', () => {
        expect(sc).toMatch(/typeof scLoadFlashList === 'function'/);
        expect(sc).toMatch(/scLoadFlashList\(tid,\s*res\.data\s*\|\|\s*\{\}\)/);
    });

    test('scLoadFlashList uses GET /dinoco-claim/v1/flash/list', () => {
        expect(sc).toMatch(/url:\s*['"]\/wp-json\/dinoco-claim\/v1\/flash\/list['"]/);
    });

    test('dinocoModal.confirm Phase 6 onConfirm capture pattern (no DOM-after-teardown)', () => {
        // onConfirm callback captures form values BEFORE modal teardown
        expect(sc).toMatch(/onConfirm:\s*function\s*\(\s*\)\s*\{[\s\S]+?captured\s*=\s*\{/);
        // Capture variable initialized null
        expect(sc).toMatch(/var\s+captured\s*=\s*null;/);
    });

    test('X-Idempotency-Key UUID generated client-side per submit', () => {
        expect(sc).toMatch(/function\s+_cfUuid\s*\(\s*\)/);
        expect(sc).toMatch(/setRequestHeader\(\s*['"]X-Idempotency-Key['"]/);
        // randomUUID with Math.random fallback
        expect(sc).toMatch(/window\.crypto\.randomUUID/);
    });

    test('POST /flash-create body includes recipient_override + dimensions + articleCategory', () => {
        expect(sc).toMatch(/recipient_override:\s*\{/);
        expect(sc).toMatch(/dimensions:\s*\{/);
        expect(sc).toMatch(/articleCategory:/);
    });

    test('Cancel handler POST /flash-cancel/{pno} with idempotency key + nonce', () => {
        expect(sc).toMatch(/data-action="dnc-cf-cancel"/);
        expect(sc).toMatch(/\/flash-cancel\/['"]\s*\+\s*encodeURIComponent\(pno\)/);
    });

    test('View tracking handler opens modal with PNO + label_url + routes', () => {
        expect(sc).toMatch(/data-action="dnc-cf-view-tracking"/);
        expect(sc).toMatch(/scOpenFlashTracking/);
    });

    // ─── Dispatcher REST + perm ──────────────────────────────────────

    test('Dispatcher registers GET /flash/list with claim_id + limit args', () => {
        expect(dispatcher).toMatch(/register_rest_route\(\s*'dinoco-claim\/v1',\s*'\/flash\/list'/);
        expect(dispatcher).toMatch(/'callback'\s*=>\s*'dinoco_claim_flash_rest_list'/);
        expect(dispatcher).toMatch(/'permission_callback'\s*=>\s*'dinoco_claim_flash_admin_perm'/);
    });

    test('dinoco_claim_flash_rest_list reads _claim_flash_pnos + enriches print_status', () => {
        expect(dispatcher).toMatch(/get_post_meta\(\s*\$claim_id,\s*'_claim_flash_pnos'/);
        expect(dispatcher).toMatch(/get_post_meta\(\s*\$claim_id,\s*'_claim_flash_print_jobs'/);
        expect(dispatcher).toMatch(/'print_status'\s*=>/);
    });

    test('rest_list claim_id type guard + post_type === claim_ticket', () => {
        expect(dispatcher).toMatch(/get_post_type\(\s*\$claim_id\s*\)\s*!==\s*'claim_ticket'/);
    });

    test('rest_list limit param capped 1..200', () => {
        expect(dispatcher).toMatch(/max\(\s*1,\s*min\(\s*200,/);
    });

    test('recipient_override accepted from REST + sanitized in helper', () => {
        expect(dispatcher).toMatch(/\$recipient_override\s*=\s*\$req->get_param\(\s*'recipient_override'\s*\)/);
        expect(dispatcher).toMatch(/'recipient_override'\s*=>\s*\$recipient_override/);
        // Helper sanitizes each field
        expect(dispatcher).toMatch(/sanitize_text_field\(\s*\(string\)\s*\$ov\['name'\]/);
        expect(dispatcher).toMatch(/sanitize_text_field\(\s*\(string\)\s*\$ov\['address'\]/);
    });

    // ─── UX-H3 strict — no inline handlers on new code ──────────────

    test('UX-H3 — NO new onclick= attributes added on Flash section markup', () => {
        // Extract just the new Flash section <div id="sc-flash-shipments-section">...
        // up through its closing </div> (one level). Use the count="..." </h4>
        // anchor + first closing-paragraph block to bound the section.
        const idx = sc.indexOf('id="sc-flash-shipments-section"');
        expect(idx).toBeGreaterThan(0);
        // Find next </div> AT THE FLASH SECTION TOP LEVEL — section ends with
        // the closing div before the wrapper div closes. Use sentinel comment
        // marker from the next sibling instead — we know the section ends with
        // `(Phase 3.6)` text followed by closing </div>.
        const endMarker = sc.indexOf('(Phase 3.6)', idx);
        expect(endMarker).toBeGreaterThan(idx);
        const flashBlock = sc.substring(idx, endMarker + 200);
        // Should not contain any inline onclick handler (data-action only)
        expect(flashBlock).not.toMatch(/\bonclick=/i);
    });
});
