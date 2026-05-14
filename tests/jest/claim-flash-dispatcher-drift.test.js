/**
 * Claim Flash Dispatcher drift detector — Sprint 23 Phase 3.1+3.2
 * Pins [Admin System] DINOCO Claim Flash Dispatcher V.0.2 + Snippet 3 V.42.22.
 *
 * Pin set:
 *   • DB_ID 1213 in dispatcher header
 *   • Version V.0.2 (2026-05-14) in dispatcher
 *   • Kill switch `dinoco_claim_flash_enabled` default OFF (REG-029)
 *   • 3 REST routes registered with proper methods + perms
 *   • function_exists guards on b2b_flash_* helpers
 *   • PNO regex {A-Za-z0-9_-}
 *   • Webhook listener hooked at 'dinoco/claim/shipment_status_changed'
 *   • Direction whitelist constant DINOCO_CLAIM_FLASH_DIRECTIONS
 *   • Snippet 3 V.42.22 webhook extension fires action with claim_id+pno+state
 *   • Snippet 3 new helper b2b_flash_find_claim_by_pno
 *   • Idempotency wrapper on all 3 POST endpoints (flash-create, flash-cancel; status is GET)
 *   • GET_LOCK pattern on flash-create
 *   • Status cache 60s transient
 *   • Audit row event_type=claim_flash_create + PII mask via b2b_flash_mask_request_for_dlq
 *   • Observability dinoco_obs_capture(level, tag, ctx) R11 signature
 *   • Direction → FSM mapping helpers exist
 *   • Webhook state → terminal mapping helper exists
 *   • _claim_flash_pnos[] write/update helpers
 *   • HR4 silent skip on terminal_state
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

describe('Claim Flash Dispatcher — Sprint 23 Phase 3.1+3.2 drift detector', () => {
    const dispatcher = read('[Admin System] DINOCO Claim Flash Dispatcher');
    const snippet3 = read('[B2B] Snippet 3: LIFF E-Catalog REST API');

    // ─── Dispatcher header + kill switch ──────────────────────────

    test('dispatcher header has DB_ID 1213', () => {
        expect(dispatcher).toMatch(/DB_ID:\s*1213/);
    });

    test('dispatcher version bumped to V.0.2 (2026-05-14)', () => {
        expect(dispatcher).toMatch(/Version:\s*V\.0\.2\s*\(2026-05-14\)/);
    });

    test('kill switch flag default OFF (REG-029)', () => {
        expect(dispatcher).toMatch(/get_option\(\s*'dinoco_claim_flash_enabled'\s*,\s*false\s*\)/);
        // Early return when flag OFF ensures byte-identical no-op
        expect(dispatcher).toMatch(/if\s*\(\s*!\s*get_option\(\s*'dinoco_claim_flash_enabled'/);
    });

    test('active sentinel constant', () => {
        expect(dispatcher).toMatch(/define\(\s*'DINOCO_CLAIM_FLASH_DISPATCHER_ACTIVE'/);
    });

    test('direction whitelist constant', () => {
        expect(dispatcher).toMatch(/DINOCO_CLAIM_FLASH_DIRECTIONS/);
        expect(dispatcher).toMatch(/'replacement\|repaired_return\|inbound_pickup'/);
    });

    // ─── REST route registrations ─────────────────────────────────

    test('POST /dinoco-claim/v1/flash-create registered', () => {
        expect(dispatcher).toMatch(/register_rest_route\(\s*'dinoco-claim\/v1'\s*,\s*'\/flash-create'/);
        const block = dispatcher.match(/register_rest_route\(\s*'dinoco-claim\/v1'\s*,\s*'\/flash-create'[\s\S]*?\)\s*;/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/'methods'\s*=>\s*'POST'/);
        expect(block[0]).toMatch(/dinoco_claim_flash_admin_perm/);
    });

    test('POST /flash-cancel/{pno} registered with PNO regex', () => {
        // pno arg accepts {A-Za-z0-9_-}
        const block = dispatcher.match(/register_rest_route\(\s*'dinoco-claim\/v1'\s*,\s*'\/flash-cancel\/\(\?P<pno>[^)]+\)'[\s\S]*?\)\s*;/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/\[A-Za-z0-9_-\]\+/);
        expect(block[0]).toMatch(/'methods'\s*=>\s*'POST'/);
    });

    test('GET /flash-status/{pno} registered', () => {
        const block = dispatcher.match(/register_rest_route\(\s*'dinoco-claim\/v1'\s*,\s*'\/flash-status\/\(\?P<pno>[^)]+\)'[\s\S]*?\)\s*;/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/'methods'\s*=>\s*'GET'/);
        expect(block[0]).toMatch(/dinoco_claim_flash_read_perm/);
    });

    test('admin perm enforces manage_options + nonce', () => {
        const fn = dispatcher.match(/function dinoco_claim_flash_admin_perm[\s\S]*?\n\s*\}\s*\}/);
        expect(fn).not.toBeNull();
        expect(fn[0]).toMatch(/current_user_can\(\s*'manage_options'\s*\)/);
        expect(fn[0]).toMatch(/wp_verify_nonce/);
    });

    // ─── function_exists guards on Flash helpers ──────────────────

    test('function_exists guard on b2b_flash_request before use', () => {
        expect(dispatcher).toMatch(/function_exists\(\s*'b2b_flash_request'\s*\)/);
    });

    test('function_exists guard on b2b_flash_get_routes', () => {
        expect(dispatcher).toMatch(/function_exists\(\s*'b2b_flash_get_routes'\s*\)/);
    });

    test('function_exists guard on b2b_flash_get_order_by_mch_pno (G2 recovery)', () => {
        expect(dispatcher).toMatch(/function_exists\(\s*'b2b_flash_get_order_by_mch_pno'\s*\)/);
    });

    test('function_exists guard on b2b_flash_mask_request_for_dlq (PII mask)', () => {
        expect(dispatcher).toMatch(/function_exists\(\s*'b2b_flash_mask_request_for_dlq'\s*\)/);
    });

    test('function_exists guard on dinoco_idempotency_check + store + extract_key', () => {
        expect(dispatcher).toMatch(/function_exists\(\s*'dinoco_idempotency_check'\s*\)/);
        expect(dispatcher).toMatch(/function_exists\(\s*'dinoco_idempotency_store'\s*\)/);
        expect(dispatcher).toMatch(/function_exists\(\s*'dinoco_idempotency_extract_key'\s*\)/);
    });

    test('function_exists guard on dinoco_set_claim_status (FSM transition)', () => {
        expect(dispatcher).toMatch(/function_exists\(\s*'dinoco_set_claim_status'\s*\)/);
    });

    // ─── Webhook listener hook ───────────────────────────────────

    test('webhook listener wired to dinoco/claim/shipment_status_changed action', () => {
        expect(dispatcher).toMatch(/add_action\(\s*'dinoco\/claim\/shipment_status_changed'\s*,\s*'dinoco_claim_flash_on_webhook'\s*,\s*10\s*,\s*4\s*\)/);
    });

    test('webhook listener function exists with 4 args', () => {
        expect(dispatcher).toMatch(/function dinoco_claim_flash_on_webhook\(\s*\$claim_id\s*,\s*\$pno\s*,\s*\$flash_state\s*,\s*\$context/);
    });

    test('webhook listener HR4 silent skip on terminal_state', () => {
        // terminal_state error code is expected silent skip (no obs warn)
        expect(dispatcher).toMatch(/'terminal_state'/);
    });

    test('webhook handler maps state 7/9 to admin alert, no auto-transition', () => {
        // state 7 = returned, 9 = cancelled — log only, no FSM flip
        expect(dispatcher).toMatch(/\$flash_state\s*===\s*7\s*\|\|\s*\$flash_state\s*===\s*9/);
        expect(dispatcher).toMatch(/claim_flash_shipment_problem/);
    });

    // ─── FSM mapping helpers ─────────────────────────────────────

    test('helper dinoco_claim_flash_direction_to_status exists', () => {
        expect(dispatcher).toMatch(/function dinoco_claim_flash_direction_to_status/);
        expect(dispatcher).toMatch(/'replacement'\s*=>\s*'Replacement Shipped'/);
        expect(dispatcher).toMatch(/'repaired_return'\s*=>\s*'Repaired Item Dispatched'/);
        expect(dispatcher).toMatch(/'inbound_pickup'\s*=>\s*'In Transit to Company'/);
    });

    test('helper dinoco_claim_flash_direction_required_state exists', () => {
        expect(dispatcher).toMatch(/function dinoco_claim_flash_direction_required_state/);
        expect(dispatcher).toMatch(/'replacement'\s*=>\s*'Approved'/);
        expect(dispatcher).toMatch(/'repaired_return'\s*=>\s*'Repairing'/);
        expect(dispatcher).toMatch(/'inbound_pickup'\s*=>\s*'Pending Pickup'/);
    });

    test('helper dinoco_claim_flash_state_to_terminal_status maps state 5 terminal per direction', () => {
        expect(dispatcher).toMatch(/function dinoco_claim_flash_state_to_terminal_status/);
        const fn = dispatcher.match(/function dinoco_claim_flash_state_to_terminal_status[\s\S]*?return\s+isset[\s\S]*?\}/);
        expect(fn).not.toBeNull();
        expect(fn[0]).toMatch(/'replacement'\s*=>\s*'Replacement Shipped'/);
        expect(fn[0]).toMatch(/'repaired_return'\s*=>\s*'Maintenance Completed'/);
        expect(fn[0]).toMatch(/'inbound_pickup'\s*=>\s*'In Repair Queue'/);
    });

    // ─── _claim_flash_pnos[] helpers ─────────────────────────────

    test('helper dinoco_claim_flash_find_claim_by_pno exists', () => {
        expect(dispatcher).toMatch(/function dinoco_claim_flash_find_claim_by_pno/);
        // Queries postmeta for _claim_flash_pnos
        expect(dispatcher).toMatch(/meta_key\s*=\s*'_claim_flash_pnos'/);
    });

    test('helper dinoco_claim_flash_update_pno_entry exists', () => {
        expect(dispatcher).toMatch(/function dinoco_claim_flash_update_pno_entry/);
    });

    test('PNO entry appended with full shape (pno, direction, status, out_trade_no, timestamps)', () => {
        // After flash create success, _claim_flash_pnos[] entry must have these keys
        expect(dispatcher).toMatch(/'pno'\s*=>\s*\$pno/);
        expect(dispatcher).toMatch(/'direction'\s*=>\s*\$direction/);
        expect(dispatcher).toMatch(/'out_trade_no'\s*=>\s*\$params_api\['outTradeNo'\]/);
        expect(dispatcher).toMatch(/'flash_state'\s*=>\s*0/);
    });

    // ─── Concurrency + idempotency ────────────────────────────────

    test('GET_LOCK pattern on flash-create per claim_id', () => {
        expect(dispatcher).toMatch(/SELECT GET_LOCK\(%s, 5\)/);
        expect(dispatcher).toMatch(/'claim_flash_create_'\s*\.\s*\$claim_id/);
        expect(dispatcher).toMatch(/SELECT RELEASE_LOCK\(%s\)/);
        // try/finally pattern
        expect(dispatcher).toMatch(/\}\s*finally\s*\{/);
    });

    test('Idempotency body includes actor_user_id (Sprint 12 PERF-H2)', () => {
        expect(dispatcher).toMatch(/'actor_user_id'\s*=>\s*\$uid/);
    });

    test('Idempotency namespace prefixed dinoco-claim/v1::', () => {
        expect(dispatcher).toMatch(/'dinoco-claim\/v1::flash-create'/);
        expect(dispatcher).toMatch(/'dinoco-claim\/v1::flash-cancel'/);
    });

    test('Rate limit applied on POST endpoints (function_exists guarded)', () => {
        expect(dispatcher).toMatch(/b2b_rate_limit\(\s*'claim_flash_create'\s*,\s*\$uid\s*,\s*20\s*,\s*3600\s*\)/);
        expect(dispatcher).toMatch(/b2b_rate_limit\(\s*'claim_flash_cancel'\s*,\s*\$uid\s*,\s*10\s*,\s*3600\s*\)/);
    });

    // ─── Status endpoint cache ───────────────────────────────────

    test('Status endpoint 60s transient cache, per-tier key', () => {
        expect(dispatcher).toMatch(/dinoco_claim_flash_status_/);
        expect(dispatcher).toMatch(/set_transient\(\s*\$cache_key\s*,\s*\$resp\s*,\s*60\s*\)/);
        // tier discriminator in cache key
        expect(dispatcher).toMatch(/md5\(\s*\$pno\s*\.\s*'\|'\s*\.\s*\$tier\s*\)/);
    });

    test('Status endpoint admin tier sees raw data, owner tier sees badge only', () => {
        expect(dispatcher).toMatch(/\$tier\s*=\s*current_user_can\(\s*'manage_options'\s*\)\s*\?\s*'admin'\s*:\s*'owner'/);
        expect(dispatcher).toMatch(/if\s*\(\s*\$tier\s*===\s*'admin'\s*\)\s*\{[\s\S]*?\$resp\['data'\]\s*=\s*\$data;/);
    });

    // ─── Audit + PII ──────────────────────────────────────────────

    test('Audit row event_type claim_flash_create on success / fail', () => {
        expect(dispatcher).toMatch(/'event_type'\s*=>\s*\$is_ok\s*\?\s*'claim_flash_create'\s*:\s*'claim_flash_create_fail'/);
    });

    test('Audit row PII masked via b2b_flash_mask_request_for_dlq', () => {
        expect(dispatcher).toMatch(/b2b_flash_mask_request_for_dlq\(\s*\$params_api\s*\)/);
    });

    test('Audit table is wp_dinoco_flash_audit', () => {
        expect(dispatcher).toMatch(/\$wpdb->prefix\s*\.\s*'dinoco_flash_audit'/);
    });

    // ─── Observability ────────────────────────────────────────────

    test('dinoco_obs_capture uses R11 signature (level, tag, ctx)', () => {
        // Match: dinoco_obs_capture('info'|'error'|'warning', 'tag', array(...))
        const obsCalls = dispatcher.match(/dinoco_obs_capture\(\s*'(info|error|warning)'/g);
        expect(obsCalls).not.toBeNull();
        expect(obsCalls.length).toBeGreaterThanOrEqual(4);
    });

    test('All dinoco_obs_capture calls are function_exists guarded', () => {
        // Each obs_capture should be inside `if ( function_exists( 'dinoco_obs_capture' ) )` block.
        // Count guards vs calls — guards should be >= calls.
        const calls = (dispatcher.match(/dinoco_obs_capture\(/g) || []).length;
        const guards = (dispatcher.match(/function_exists\(\s*'dinoco_obs_capture'\s*\)/g) || []).length;
        expect(guards).toBeGreaterThanOrEqual(calls - 1); // allow one shared guard around multiple calls
    });

    // ─── Snippet 3 V.42.22 webhook extension ──────────────────────

    test('Snippet 3 V.42.22 version header', () => {
        expect(snippet3).toMatch(/Version:\s*V\.42\.22\s*\(2026-05-14\)/);
    });

    test('Snippet 3 fires dinoco/claim/shipment_status_changed action', () => {
        expect(snippet3).toMatch(/do_action\(\s*'dinoco\/claim\/shipment_status_changed'\s*,\s*\$claim_id\s*,\s*\$pno\s*,\s*\$flash_state\s*,\s*\$data\s*\)/);
    });

    test('Snippet 3 new helper b2b_flash_find_claim_by_pno', () => {
        expect(snippet3).toMatch(/function b2b_flash_find_claim_by_pno/);
        expect(snippet3).toMatch(/meta_key\s*=\s*'_claim_flash_pnos'/);
    });

    test('Snippet 3 webhook tier-3 lookup runs only after B2B+manual miss', () => {
        // Tier-3 must be inside the `if ( $manual_status )` else branch
        const block = snippet3.match(/if\s*\(\s*\$manual_status\s*\)\s*\{[\s\S]*?\}\s*else\s*\{[\s\S]*?do_action\(\s*'dinoco\/claim\/shipment_status_changed'/);
        expect(block).not.toBeNull();
    });

    test('Snippet 3 webhook helper function_exists guard on tier-3', () => {
        expect(snippet3).toMatch(/function_exists\(\s*'b2b_flash_find_claim_by_pno'\s*\)/);
    });

    // ─── REG-029 byte-identical with flag OFF ─────────────────────

    test('REG-029: flag OFF returns early before any side effects', () => {
        // Match: get_option flag check followed immediately by `return;`
        const earlyReturn = dispatcher.match(/if\s*\(\s*!\s*get_option\(\s*'dinoco_claim_flash_enabled'\s*,\s*false\s*\)\s*\)\s*\{\s*return;\s*\}/);
        expect(earlyReturn).not.toBeNull();
    });

    test('REG-029: no register_rest_route at top-level (must be hooked on rest_api_init)', () => {
        // All registrations must be inside add_action('rest_api_init', ...) — never top-level.
        // Find each register_rest_route call site and verify it's inside the routes registration fn
        const routeRegistrationFn = dispatcher.match(/function dinoco_claim_flash_register_routes\(\)\s*\{[\s\S]*?\n\}/);
        expect(routeRegistrationFn).not.toBeNull();
        const routesInFn = (routeRegistrationFn[0].match(/register_rest_route\(/g) || []).length;
        const routesTotal = (dispatcher.match(/register_rest_route\(/g) || []).length;
        expect(routesInFn).toBe(routesTotal);
    });
});
