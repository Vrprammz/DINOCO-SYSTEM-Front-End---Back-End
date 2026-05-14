/**
 * Claim Pickup-at-Warehouse drift detector — Sprint 29 Phase 4 Batch B Item 7.
 *
 * Pins the surface shipped in:
 *   • [Admin System] DINOCO Claim Flash Dispatcher (V.0.6) — NEW REST endpoint
 *   • [Admin System] DINOCO Claim Lifecycle Notifier (V.0.8) — Flex builder + listener
 *   • [Admin System] DINOCO Service Center & Claims (V.34.6) — UI checkbox
 *
 * Verifies future edits do not regress:
 *   - NEW endpoint POST /pickup-at-warehouse registered
 *   - Idempotency wrap with body hash {claim_id, actor_user_id}
 *   - 3 postmeta keys written atomically: _claim_pickup_at_warehouse,
 *     _claim_pickup_status='ready_for_pickup', _claim_pickup_created_at
 *   - Action `dinoco/claim/pickup_ready` fired post-COMMIT
 *   - b2b_warehouse_address option read for warehouse info
 *   - Capability manage_options + wp_rest nonce
 *   - Returns 200/201 with pickup_id + warehouse object
 *   - NEW Flex builder `b2b_build_flex_claim_pickup_ready`
 *   - NEW listener `dinoco_claim_notify_pickup_ready` wired @ priority 20
 *   - Service Center checkbox + alternate submit branch
 *   - UX-H3 data-action delegation
 *
 * Spec source: FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md Phase 4 Item 7.
 */

const fs = require('fs');
const path = require('path');

const REPO        = path.resolve(__dirname, '../..');
const DISP_PATH   = path.join(REPO, '[Admin System] DINOCO Claim Flash Dispatcher');
const NOTIF_PATH  = path.join(REPO, '[Admin System] DINOCO Claim Lifecycle Notifier');
const SC_PATH     = path.join(REPO, '[Admin System] DINOCO Service Center & Claims');

const DISP_SRC  = fs.readFileSync(DISP_PATH, 'utf8');
const NOTIF_SRC = fs.readFileSync(NOTIF_PATH, 'utf8');
const SC_SRC    = fs.readFileSync(SC_PATH, 'utf8');

function stripPhpBlockComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '');
}
const DISP_CODE  = stripPhpBlockComments(DISP_SRC);
const NOTIF_CODE = stripPhpBlockComments(NOTIF_SRC);
const SC_CODE    = stripPhpBlockComments(SC_SRC);

describe('Claim Pickup-at-Warehouse — Phase 4 Batch B Item 7 drift detector', () => {

    // ─── Flash Dispatcher V.0.6 contract ────────────────────────────────

    test('Flash Dispatcher version stamped V.0.6', () => {
        expect(DISP_SRC).toMatch(/Version:\s*V\.0\.6\s*\(2026-05-14\)/);
    });

    test('Flash Dispatcher registers POST /pickup-at-warehouse route', () => {
        expect(DISP_CODE).toMatch(/register_rest_route\s*\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/pickup-at-warehouse['"]/);
    });

    test('Flash Dispatcher pickup route uses POST method', () => {
        const block = DISP_CODE.match(/register_rest_route\s*\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/pickup-at-warehouse['"][\s\S]+?\)\s*;/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/['"]methods['"]\s*=>\s*['"]POST['"]/);
    });

    test('Flash Dispatcher pickup route permission_callback admin_perm (manage_options + nonce)', () => {
        const block = DISP_CODE.match(/register_rest_route\s*\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/pickup-at-warehouse['"][\s\S]+?\)\s*;/);
        expect(block[0]).toMatch(/dinoco_claim_flash_admin_perm/);
    });

    test('Flash Dispatcher pickup handler exists', () => {
        expect(DISP_CODE).toMatch(/function\s+dinoco_claim_flash_rest_pickup_at_warehouse\s*\(/);
    });

    test('Flash Dispatcher warehouse info helper exists', () => {
        expect(DISP_CODE).toMatch(/function\s+dinoco_claim_flash_get_warehouse_info\s*\(/);
        // Reads b2b_warehouse_address option
        expect(DISP_CODE).toMatch(/get_option\(\s*['"]b2b_warehouse_address['"]/);
    });

    test('Flash Dispatcher atomic 3-key postmeta helper exists', () => {
        expect(DISP_CODE).toMatch(/function\s+dinoco_claim_persist_pickup_at_warehouse\s*\(/);
        // Writes all 3 canonical postmeta keys
        const helperBlock = DISP_CODE.match(/function\s+dinoco_claim_persist_pickup_at_warehouse\b[\s\S]+?\}\s*$/m);
        expect(helperBlock).not.toBeNull();
        expect(helperBlock[0]).toMatch(/_claim_pickup_at_warehouse/);
        expect(helperBlock[0]).toMatch(/_claim_pickup_status/);
        expect(helperBlock[0]).toMatch(/_claim_pickup_created_at/);
        expect(helperBlock[0]).toMatch(/ready_for_pickup/);
    });

    test('Flash Dispatcher pickup handler validates claim_id + post_type=claim_ticket', () => {
        const handlerBlock = DISP_CODE.match(/function\s+dinoco_claim_flash_rest_pickup_at_warehouse\b[\s\S]+/);
        expect(handlerBlock).not.toBeNull();
        expect(handlerBlock[0]).toMatch(/get_post_type\([^)]+\)\s*!==\s*['"]claim_ticket['"]/);
    });

    test('Flash Dispatcher pickup handler wraps with Idempotency-Key', () => {
        const handlerBlock = DISP_CODE.match(/function\s+dinoco_claim_flash_rest_pickup_at_warehouse\b[\s\S]+/);
        expect(handlerBlock[0]).toMatch(/dinoco_idempotency_extract_key/);
        expect(handlerBlock[0]).toMatch(/dinoco_idempotency_check/);
        expect(handlerBlock[0]).toMatch(/dinoco_idempotency_store/);
    });

    test('Flash Dispatcher pickup idempotency namespace is pickup-at-warehouse', () => {
        const handlerBlock = DISP_CODE.match(/function\s+dinoco_claim_flash_rest_pickup_at_warehouse\b[\s\S]+/);
        expect(handlerBlock[0]).toMatch(/dinoco-claim\/v1::pickup-at-warehouse/);
    });

    test('Flash Dispatcher pickup idempotency body hash includes claim_id + actor_user_id', () => {
        const handlerBlock = DISP_CODE.match(/function\s+dinoco_claim_flash_rest_pickup_at_warehouse\b[\s\S]+/);
        const idemBodyMatch = handlerBlock[0].match(/\$idem_body\s*=\s*array\(([^)]+)\)/);
        expect(idemBodyMatch).not.toBeNull();
        expect(idemBodyMatch[1]).toMatch(/['"]claim_id['"]/);
        expect(idemBodyMatch[1]).toMatch(/['"]actor_user_id['"]/);
    });

    test('Flash Dispatcher fires dinoco/claim/pickup_ready action post-COMMIT', () => {
        const handlerBlock = DISP_CODE.match(/function\s+dinoco_claim_flash_rest_pickup_at_warehouse\b[\s\S]+/);
        expect(handlerBlock[0]).toMatch(/do_action\(\s*['"]dinoco\/claim\/pickup_ready['"]/);
    });

    test('Flash Dispatcher returns 201 with pickup_id + warehouse + claim_id', () => {
        const handlerBlock = DISP_CODE.match(/function\s+dinoco_claim_flash_rest_pickup_at_warehouse\b[\s\S]+/);
        expect(handlerBlock[0]).toMatch(/['"]pickup_id['"]\s*=>/);
        expect(handlerBlock[0]).toMatch(/['"]warehouse['"]\s*=>/);
        expect(handlerBlock[0]).toMatch(/['"]claim_id['"]\s*=>/);
        expect(handlerBlock[0]).toMatch(/WP_REST_Response[\s\S]+?\)\s*,\s*201/);
    });

    test('Flash Dispatcher pickup obs_capture uses R11 3-arg signature', () => {
        expect(DISP_CODE).toMatch(/dinoco_obs_capture\(\s*['"]info['"]\s*,\s*['"]claim_pickup_at_warehouse_persisted['"]/);
        expect(DISP_CODE).toMatch(/dinoco_obs_capture\(\s*['"]error['"]\s*,\s*['"]claim_pickup_at_warehouse_exception['"]/);
    });

    // ─── Notifier V.0.8 contract ────────────────────────────────────────

    test('Notifier version stamped V.0.8', () => {
        expect(NOTIF_SRC).toMatch(/Version:\s*V\.0\.8\s*\(2026-05-14\)/);
    });

    test('Notifier defines b2b_build_flex_claim_pickup_ready Flex builder', () => {
        expect(NOTIF_CODE).toMatch(/function\s+b2b_build_flex_claim_pickup_ready\s*\(/);
    });

    test('Pickup Flex builder returns LINE Flex message shape (type:flex + altText + contents)', () => {
        const flexBlock = NOTIF_CODE.match(/function\s+b2b_build_flex_claim_pickup_ready\b[\s\S]+?\n\}\s*$/m);
        expect(flexBlock).not.toBeNull();
        expect(flexBlock[0]).toMatch(/['"]type['"]\s*=>\s*['"]flex['"]/);
        expect(flexBlock[0]).toMatch(/['"]altText['"]\s*=>/);
        expect(flexBlock[0]).toMatch(/['"]contents['"]\s*=>/);
    });

    test('Pickup Flex builder uses navy header tone (mirrors slip_received pattern)', () => {
        const flexBlock = NOTIF_CODE.match(/function\s+b2b_build_flex_claim_pickup_ready\b[\s\S]+?\n\}\s*$/m);
        // Navy header color #1A3A5C is the B2B canonical (Sprint 20 Design Tokens V.1.0).
        expect(flexBlock[0]).toMatch(/#1A3A5C/i);
    });

    test('Pickup Flex builder includes warehouse address + business hours + claim_id ref', () => {
        const flexBlock = NOTIF_CODE.match(/function\s+b2b_build_flex_claim_pickup_ready\b[\s\S]+?\n\}\s*$/m);
        expect(flexBlock[0]).toMatch(/warehouse/);
        // Thai business hours marker
        expect(flexBlock[0]).toMatch(/เวลาทำการ|09:00|18:00/);
        // ticket_number reference
        expect(flexBlock[0]).toMatch(/ticket_num/);
    });

    test('Pickup Flex builder has LINE deep-link "💬 สอบถามแอดมิน" CTA', () => {
        const flexBlock = NOTIF_CODE.match(/function\s+b2b_build_flex_claim_pickup_ready\b[\s\S]+?\n\}\s*$/m);
        expect(flexBlock[0]).toMatch(/line\.me\/R\/oaMessage/);
        expect(flexBlock[0]).toMatch(/สอบถามแอดมิน/);
    });

    test('Notifier listener function exists', () => {
        expect(NOTIF_CODE).toMatch(/function\s+dinoco_claim_notify_pickup_ready\s*\(/);
    });

    test('Notifier listener wired to dinoco/claim/pickup_ready at priority 20', () => {
        expect(NOTIF_CODE).toMatch(/add_action\(\s*['"]dinoco\/claim\/pickup_ready['"]\s*,\s*['"]dinoco_claim_notify_pickup_ready['"]\s*,\s*20/);
    });

    test('Notifier listener uses idempotency wrap (claim-pickup-notif namespace)', () => {
        const listenerBlock = NOTIF_CODE.match(/function\s+dinoco_claim_notify_pickup_ready\b[\s\S]+?\n\}\s*$/m);
        expect(listenerBlock).not.toBeNull();
        expect(listenerBlock[0]).toMatch(/claim-pickup-notif/);
        expect(listenerBlock[0]).toMatch(/dinoco_idempotency_hash/);
        expect(listenerBlock[0]).toMatch(/dinoco_idempotency_check/);
    });

    test('Notifier listener resolves LINE UID via claim_ticket.post_author', () => {
        const listenerBlock = NOTIF_CODE.match(/function\s+dinoco_claim_notify_pickup_ready\b[\s\S]+?\n\}\s*$/m);
        expect(listenerBlock[0]).toMatch(/post_author/);
        expect(listenerBlock[0]).toMatch(/dinoco_line_uid/);
    });

    test('Notifier listener governance-gates via claim_status bucket', () => {
        const listenerBlock = NOTIF_CODE.match(/function\s+dinoco_claim_notify_pickup_ready\b[\s\S]+?\n\}\s*$/m);
        expect(listenerBlock[0]).toMatch(/dinoco_line_can_push\(\s*\$line_uid\s*,\s*['"]claim_status['"]\s*\)/);
    });

    test('Notifier listener appends audit log with status=pickup_ready', () => {
        const listenerBlock = NOTIF_CODE.match(/function\s+dinoco_claim_notify_pickup_ready\b[\s\S]+?\n\}\s*$/m);
        expect(listenerBlock[0]).toMatch(/dinoco_claim_notif_append_log/);
        expect(listenerBlock[0]).toMatch(/['"]pickup_ready['"]/);
    });

    test('Notifier listener uses 60s dedup transient per claim', () => {
        const listenerBlock = NOTIF_CODE.match(/function\s+dinoco_claim_notify_pickup_ready\b[\s\S]+?\n\}\s*$/m);
        expect(listenerBlock[0]).toMatch(/dnc_claim_pickup_notif_dedup_/);
        expect(listenerBlock[0]).toMatch(/set_transient/);
    });

    // ─── Service Center V.34.6 UI contract ─────────────────────────────

    test('Service Center version stamped V.34.6', () => {
        expect(SC_SRC).toMatch(/Version:\s*V\.34\.6\s*\(2026-05-14\)/);
    });

    test('Service Center Flash modal renders pickup-at-warehouse checkbox', () => {
        expect(SC_CODE).toMatch(/id="dnc-cf-pickup-at-wh"/);
        // Thai label "ลูกค้ามารับเองที่โกดัง"
        expect(SC_CODE).toMatch(/ลูกค้ามารับเองที่โกดัง/);
    });

    test('Service Center pickup checkbox uses data-action delegation (UX-H3)', () => {
        expect(SC_CODE).toMatch(/data-action="dnc-cf-toggle-pickup"/);
    });

    test('Service Center pickup row markup has NO inline onclick (UX-H3 strict)', () => {
        const pickupRowMatch = SC_CODE.match(/<label\s+class="dnc-cf-pickup-row"[\s\S]+?<\/label>/);
        expect(pickupRowMatch).not.toBeNull();
        expect(pickupRowMatch[0]).not.toMatch(/\bonclick\s*=/i);
    });

    test('Service Center pickup toggle handler wired via $(document).on change delegation', () => {
        expect(SC_CODE).toMatch(/\$\(document\)\.on\(\s*['"]change['"]\s*,\s*['"]\[data-action="dnc-cf-toggle-pickup"\]['"]/);
    });

    test('Service Center submit branches to /pickup-at-warehouse when checkbox checked', () => {
        expect(SC_CODE).toMatch(/\/wp-json\/dinoco-claim\/v1\/pickup-at-warehouse/);
    });

    test('Service Center pickup submit captures pickup_at_warehouse flag from form', () => {
        // captured.pickup_at_warehouse is read off the checkbox
        expect(SC_CODE).toMatch(/pickup_at_warehouse:\s*!!\$\('#dnc-cf-pickup-at-wh'\)\.is\(['"]:checked['"]\)/);
    });

    test('Service Center pickup AJAX sends X-WP-Nonce + X-Idempotency-Key', () => {
        // Find the pickup-at-warehouse ajax call block.
        const pickupAjaxBlock = SC_CODE.match(/pickup-at-warehouse[\s\S]+?\.always\(/);
        expect(pickupAjaxBlock).not.toBeNull();
        expect(pickupAjaxBlock[0]).toMatch(/X-WP-Nonce/);
        expect(pickupAjaxBlock[0]).toMatch(/X-Idempotency-Key/);
        expect(pickupAjaxBlock[0]).toMatch(/_cfUuid/);
    });

    test('Service Center CSS scoped .dnc-cf-pickup-row declared', () => {
        expect(SC_CODE).toMatch(/\.dnc-cf-pickup-row\s*\{/);
    });

    test('Service Center pickup body sends ONLY claim_id (no dst/dims/weight)', () => {
        // The pickup branch builds pickupBody = { claim_id: submitTid }.
        // Extract a window around the pickup-at-warehouse URL and check
        // pickupBody contains claim_id only.
        const pickupAjaxBlock = SC_CODE.match(/var\s+pickupBody\s*=\s*\{[\s\S]+?\};/);
        expect(pickupAjaxBlock).not.toBeNull();
        expect(pickupAjaxBlock[0]).toMatch(/claim_id:\s*submitTid/);
        // Must NOT include direction / dimensions / weight_grams as keys.
        expect(pickupAjaxBlock[0]).not.toMatch(/\bdirection\s*:/);
        expect(pickupAjaxBlock[0]).not.toMatch(/\bdimensions\s*:/);
        expect(pickupAjaxBlock[0]).not.toMatch(/\bweight_grams\s*:/);
    });
});
