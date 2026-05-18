/**
 * P0.1 — F#8 Marketplace Refund Request Backend Drift Detector
 * 2026-05-18 (Dead-Workflow Remediation Spec V.1.0)
 *
 * Pins V.0.56 customer-initiated refund REQUEST endpoint (distinct from
 * admin /refund processing endpoint at V.0.25+). Anti-regression for:
 *   - Route registration with logged-in permission (not admin)
 *   - Eligibility: paid + ≤7d + ownership + no double-submit
 *   - Idempotency wrapper (Round 30+ pattern)
 *   - Audit log + Telegram alert side effects
 *   - Anti-enumeration: 404 collapse on non-owner
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const SN_REST = path.join(REPO, '[System] DINOCO SN REST API');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/^\s*\*.*$/gm, '');
}

describe('P0.1 — F#8 refund-request backend drift', () => {
    const src = read(SN_REST);
    const stripped = stripComments(src);

    test('Route /marketplace/{id}/refund-request registered', () => {
        expect(stripped).toMatch(/register_rest_route\s*\([^)]*?['"]\/marketplace\/\(\?P<id>\\d\+\)\/refund-request['"]/);
    });

    test('Route permission is dinoco_sn_perm_logged_in (customer, NOT admin)', () => {
        // Find the route registration block
        const routeBlock = stripped.match(/['"]\/marketplace\/\(\?P<id>\\d\+\)\/refund-request['"][\s\S]{0,800}/);
        expect(routeBlock).not.toBeNull();
        expect(routeBlock[0]).toMatch(/permission_callback['"]?\s*=>\s*['"]dinoco_sn_perm_logged_in['"]/);
        // Must NOT be admin-only
        expect(routeBlock[0]).not.toMatch(/permission_callback['"]?\s*=>\s*['"]dinoco_sn_perm_admin['"]/);
    });

    test('refund_channel is restricted to promptpay|bank_transfer enum', () => {
        const routeBlock = stripped.match(/['"]\/marketplace\/\(\?P<id>\\d\+\)\/refund-request['"][\s\S]{0,1500}/);
        expect(routeBlock).not.toBeNull();
        expect(routeBlock[0]).toMatch(/in_array\s*\(\s*\$v\s*,\s*array\s*\(\s*['"]promptpay['"]\s*,\s*['"]bank_transfer['"]\s*\)/);
    });

    test('reason validation: 10-500 chars', () => {
        const routeBlock = stripped.match(/['"]\/marketplace\/\(\?P<id>\\d\+\)\/refund-request['"][\s\S]{0,1500}/);
        expect(routeBlock).not.toBeNull();
        // Length bounds
        expect(routeBlock[0]).toMatch(/\$len\s*>=\s*10\s*&&\s*\$len\s*<=\s*500/);
    });

    test('Handler dinoco_sn_rest_marketplace_refund_request defined', () => {
        expect(stripped).toMatch(/function\s+dinoco_sn_rest_marketplace_refund_request/);
    });

    test('Handler uses Round 30+ idempotency wrapper', () => {
        const fn = stripped.match(/function\s+dinoco_sn_rest_marketplace_refund_request[\s\S]{0,1500}/);
        expect(fn).not.toBeNull();
        expect(fn[0]).toMatch(/dinoco_sn_with_idempotency\s*\(/);
        expect(fn[0]).toMatch(/['"]marketplace-refund-request['"]/);
        // Body fields hashed for idempotency
        expect(fn[0]).toMatch(/array\s*\(\s*['"]id['"]\s*,\s*['"]reason['"]\s*,\s*['"]refund_channel['"]\s*\)/);
    });

    test('Handler enforces per-user rate limit 3/hr (anti-spam)', () => {
        const fn = stripped.match(/function\s+dinoco_sn_rest_marketplace_refund_request[\s\S]{0,1500}/);
        expect(fn).not.toBeNull();
        expect(fn[0]).toMatch(/b2b_rate_limit\s*\([^)]*sn_refund_request_[^)]*3\s*,\s*HOUR_IN_SECONDS/);
    });

    test('Actual handler dinoco_sn_handler_marketplace_refund_request defined', () => {
        expect(stripped).toMatch(/function\s+dinoco_sn_handler_marketplace_refund_request/);
    });

    test('Handler verifies extension ownership (anti-enumeration 404 collapse)', () => {
        const fn = stripped.match(/function\s+dinoco_sn_handler_marketplace_refund_request[\s\S]{0,10000}/);
        expect(fn).not.toBeNull();
        // Ownership check
        expect(fn[0]).toMatch(/\(int\)\s*\$ext->user_id\s*!==\s*\$actor_uid/);
        // Returns rest_not_found (NOT rest_forbidden) — no oracle
        expect(fn[0]).toMatch(/rest_not_found[\s\S]{0,100}404/);
    });

    test('Handler enforces 7-day paid_at window', () => {
        const fn = stripped.match(/function\s+dinoco_sn_handler_marketplace_refund_request[\s\S]{0,10000}/);
        expect(fn).not.toBeNull();
        expect(fn[0]).toMatch(/age_days\s*>\s*7/);
    });

    test('Handler rejects already-pending request (idempotent per extension)', () => {
        const fn = stripped.match(/function\s+dinoco_sn_handler_marketplace_refund_request[\s\S]{0,10000}/);
        expect(fn).not.toBeNull();
        expect(fn[0]).toMatch(/already_requested[\s\S]{0,300}409/);
    });

    test('Handler writes sn_audit refund_requested event (sensitive=true, 5y retention)', () => {
        const fn = stripped.match(/function\s+dinoco_sn_handler_marketplace_refund_request[\s\S]{0,10000}/);
        expect(fn).not.toBeNull();
        // Audit log call somewhere in handler
        expect(fn[0]).toMatch(/dinoco_sn_audit_log/);
        // With refund_requested event type
        expect(fn[0]).toMatch(/['"]refund_requested['"]/);
        // Marked sensitive
        expect(fn[0]).toMatch(/['"]marketplace_refund_request['"][\s\S]{0,50}true/);
    });

    test('Handler sends Telegram alert with dedup (1hr TTL)', () => {
        const fn = stripped.match(/function\s+dinoco_sn_handler_marketplace_refund_request[\s\S]{0,10000}/);
        expect(fn).not.toBeNull();
        expect(fn[0]).toMatch(/b2b_tg_send_dedup\s*\([^)]*refund_request_[^)]*,\s*\$tg_msg\s*,\s*3600/);
    });

    test('Handler eligibility: payment_status must be paid', () => {
        const fn = stripped.match(/function\s+dinoco_sn_handler_marketplace_refund_request[\s\S]{0,10000}/);
        expect(fn).not.toBeNull();
        // Match strtolower wrapping payment_status (nested parens — use [\s\S]{0,80} bounded)
        expect(fn[0]).toMatch(/strtolower\s*\([\s\S]{0,80}\$ext->payment_status[\s\S]{0,30}!==\s*['"]paid['"]/);
    });

    test('Handler stores pending request in wp_options with autoload=false', () => {
        const fn = stripped.match(/function\s+dinoco_sn_handler_marketplace_refund_request[\s\S]{0,10000}/);
        expect(fn).not.toBeNull();
        // autoload=false prevents alloptions bloat
        expect(fn[0]).toMatch(/update_option\s*\([^)]*,\s*wp_json_encode\s*\([\s\S]{0,300}\)\s*,\s*false\s*\)/);
    });

    test('Handler returns Thai customer-friendly message + request_id', () => {
        const fn = stripped.match(/function\s+dinoco_sn_handler_marketplace_refund_request[\s\S]{0,10000}/);
        expect(fn).not.toBeNull();
        expect(fn[0]).toMatch(/['"]ok['"]\s*=>\s*true/);
        expect(fn[0]).toMatch(/['"]status['"]\s*=>\s*['"]pending_admin_review['"]/);
        expect(fn[0]).toMatch(/คำขอคืนเงิน|รอแอดมินตรวจสอบ/);
    });
});
