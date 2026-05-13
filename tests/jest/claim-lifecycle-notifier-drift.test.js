/**
 * Claim Lifecycle Notifier drift detector — Sprint 5 Phase 1.2 + 1.4
 * (FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md V.2.3).
 *
 * Pins:
 *   • LINE Push Governance V.1.7 — `claim_status` category registered
 *   • LINE Push Governance V.1.7 — resolver exact-match BEFORE generic claim_*
 *   • Claim Lifecycle Notifier V.0.2 — feature flag gate
 *   • Claim Lifecycle Notifier V.0.2 — sentinel constant
 *   • Claim Lifecycle Notifier V.0.2 — DB_ID 1211
 *   • Claim Lifecycle Notifier V.0.2 — 3 pure helpers
 *   • Claim Lifecycle Notifier V.0.2 — dispatcher
 *   • Claim Lifecycle Notifier V.0.2 — hook listener at priority 20
 *   • Claim Lifecycle Notifier V.0.2 — 2 REST routes
 *   • Claim Lifecycle Notifier V.0.2 — HR1 try/catch + observability
 *   • Claim Lifecycle Notifier V.0.2 — HR2 resend bypasses dedup
 *   • Claim Lifecycle Notifier V.0.2 — `_claim_notif_log` FIFO cap 50
 *   • Claim Lifecycle Notifier V.0.2 — fallback Flex when builder missing
 *   • Claim Lifecycle Notifier V.0.2 — uses Idempotency Helper (DB_ID 1194)
 *   • Claim Lifecycle Notifier V.0.2 — uses Push Governance (DB_ID 1203)
 *   • Spec doc V.2.3 file exists
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

describe('Claim Lifecycle Notifier — Sprint 5 drift detector', () => {

    // ─── LINE Push Governance V.1.7 (Sprint 5A) ─────────────────

    describe('LINE Push Governance V.1.7 — claim_status category', () => {
        const code = read('[Admin System] DINOCO LINE Push Governance');

        test('version bumped to V.1.7', () => {
            expect(code).toMatch(/Version: V\.1\.7 \(2026-05-13\)/);
        });

        test('claim_status appears in dinoco_line_gov_categories()', () => {
            // Match the category map block + locate the claim_status key
            const block = code.match(/function dinoco_line_gov_categories\(\)\s*\{[\s\S]*?return\s+array\s*\([\s\S]*?\);\s*\}/);
            expect(block).not.toBeNull();
            expect(block[0]).toMatch(/'claim_status'\s*=>\s*array/);
        });

        test('claim_status entry is transactional + has expected label', () => {
            // Pull the claim_status sub-array specifically
            const sub = code.match(/'claim_status'\s*=>\s*array\([\s\S]*?\)\s*,/);
            expect(sub).not.toBeNull();
            expect(sub[0]).toMatch(/'transactional'\s*=>\s*true/);
            expect(sub[0]).toMatch(/'default_pref'\s*=>\s*true/);
            expect(sub[0]).toMatch(/'label_th'\s*=>\s*'สถานะเคลม/);
        });

        test('resolver exact-matches claim_status BEFORE generic claim_*', () => {
            // The exact-match line MUST appear before the strpos('claim_') fallback
            const resolver = code.match(/function dinoco_line_gov_resolve_category\([^)]*\)\s*\{[\s\S]*?\}\s*\}/);
            expect(resolver).not.toBeNull();
            const exactIdx = resolver[0].indexOf("'claim_status' ) return 'claim_status'");
            const genericIdx = resolver[0].indexOf("strpos( $c, 'claim_' )");
            expect(exactIdx).toBeGreaterThan(-1);
            expect(genericIdx).toBeGreaterThan(-1);
            expect(exactIdx).toBeLessThan(genericIdx);
        });
    });

    // ─── Claim Lifecycle Notifier V.0.2 (Sprint 5B) ─────────────

    describe('Claim Lifecycle Notifier V.0.2 — listener + dispatcher', () => {
        const code = read('[Admin System] DINOCO Claim Lifecycle Notifier');

        test('version V.0.2 in header', () => {
            expect(code).toMatch(/Version: V\.0\.2 \(2026-05-13\)/);
        });

        test('DB_ID 1211 in header', () => {
            expect(code).toMatch(/DB_ID:\s*1211/);
        });

        test('sentinel constant defined', () => {
            expect(code).toMatch(/define\(\s*'DINOCO_CLAIM_LIFECYCLE_NOTIFIER_LOADED'/);
        });

        test('feature flag default OFF', () => {
            expect(code).toMatch(/get_option\(\s*'dinoco_claim_notif_enabled'\s*,\s*false\s*\)/);
        });

        test('3 pure helpers defined', () => {
            expect(code).toMatch(/function dinoco_claim_notif_status_to_slug\(/);
            expect(code).toMatch(/function dinoco_claim_notif_should_send\(/);
            expect(code).toMatch(/function dinoco_claim_notif_dedup_key\(/);
        });

        test('dispatcher function defined', () => {
            expect(code).toMatch(/function dinoco_claim_notif_dispatch\(/);
        });

        test('hook listener function defined', () => {
            expect(code).toMatch(/function dinoco_claim_notify_status_changed\(/);
        });

        test('listener registered at priority 20', () => {
            expect(code).toMatch(/add_action\(\s*'dinoco\/claim\/state_changed'\s*,\s*'dinoco_claim_notify_status_changed'\s*,\s*20\s*,\s*4\s*\)/);
        });

        test('HR1 — try/catch wrap on listener', () => {
            // Listener body must contain try/catch
            const listener = code.match(/function dinoco_claim_notify_status_changed\([\s\S]*?\n\}/);
            expect(listener).not.toBeNull();
            expect(listener[0]).toMatch(/try\s*\{/);
            expect(listener[0]).toMatch(/catch\s*\(\s*\\Throwable/);
        });

        test('HR1 — observability captured on listener exception', () => {
            expect(code).toMatch(/dinoco_obs_capture\(\s*'error'\s*,\s*'claim_notif_listener_threw'/);
        });

        test('HR2 — resend endpoint bypasses dedup transient', () => {
            const resend = code.match(/function dinoco_claim_notif_rest_resend\([\s\S]*?\n\}/);
            expect(resend).not.toBeNull();
            expect(resend[0]).toMatch(/delete_transient\(\s*dinoco_claim_notif_dedup_key\(/);
        });

        test('uses Push Governance via dinoco_line_can_push with claim_status bucket', () => {
            expect(code).toMatch(/dinoco_line_can_push\(\s*\$line_uid\s*,\s*'claim_status'\s*\)/);
        });

        test('uses Idempotency Helper namespace claim-notif', () => {
            expect(code).toMatch(/dinoco_idempotency_check\(\s*\$idem_key\s*,\s*'claim-notif'/);
            expect(code).toMatch(/dinoco_idempotency_store\(\s*\$idem_key\s*,\s*'claim-notif'/);
        });

        test('_claim_notif_log FIFO cap at 50', () => {
            expect(code).toMatch(/count\(\s*\$log\s*\)\s*>\s*50/);
            expect(code).toMatch(/array_slice\(\s*\$log\s*,\s*-50\s*\)/);
        });

        test('graceful Flex fallback function defined', () => {
            expect(code).toMatch(/function dinoco_claim_notif_build_fallback_flex\(/);
            // Fallback uses Sprint 4 canonical navy
            expect(code).toMatch(/#1A3A5C/);
        });

        test('builder lookup uses function_exists guard with status-keyed name', () => {
            expect(code).toMatch(/b2b_build_flex_claim_status_/);
            expect(code).toMatch(/function_exists\(\s*\$fn\s*\)/);
        });

        test('2 REST routes registered under dinoco-claim/v1', () => {
            expect(code).toMatch(/register_rest_route\(\s*'dinoco-claim\/v1'\s*,\s*'\/notif\/log'/);
            expect(code).toMatch(/register_rest_route\(\s*'dinoco-claim\/v1'\s*,\s*'\/notif\/resend'/);
        });

        test('REST routes wired only when flag enabled', () => {
            // Tail of file should gate registration on the flag
            expect(code).toMatch(/if\s*\(\s*\$dinoco_claim_notif_enabled\s*\)\s*\{[\s\S]*?add_action\(\s*'rest_api_init'/);
        });

        test('skip-by-design for "In Transit to Company"', () => {
            // Pure-logic decision documented in should_send
            expect(code).toMatch(/in_transit_to_company/);
            expect(code).toMatch(/skip_by_design/);
        });
    });

    // ─── Spec doc anchor ────────────────────────────────────────

    test('Spec doc V.2.3 file exists at expected path', () => {
        const p = path.join(REPO, 'docs/feature-specs/FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md');
        expect(fs.existsSync(p)).toBe(true);
        const txt = fs.readFileSync(p, 'utf8');
        expect(txt).toMatch(/V\.2\.3/);
        expect(txt).toMatch(/DB_ID.{0,50}1211/);
    });
});
