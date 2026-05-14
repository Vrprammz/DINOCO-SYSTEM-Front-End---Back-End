/**
 * Claim Refund Consent — Sprint 15 H2 + M4 drift detector.
 *
 * Pins the Sprint 15 audit-deferred fixes shipped in:
 *   - [Admin System] DINOCO Claim Charges Schema V.0.4
 *   - [System] DINOCO Claim Payment LIFF V.0.4
 *
 * Verifies that future edits don't accidentally:
 *   H2 (amount snapshot bypass)
 *     - Drop amount_thb_at_create column
 *     - Drift schema version below 1.2 without re-bumping
 *     - Remove the immutable-snapshot CHECK constraint
 *     - Remove the drift-check assertion in transition handler
 *     - Switch 4-eyes gate back to reading mutable amount_thb
 *
 *   M4 (forgeable refund_approver_id)
 *     - Drop wp_dinoco_claim_refund_approvals table or any of its 8 columns
 *     - Drop UNIQUE consent_token + idx_charge_approver + idx_expires
 *     - Drop POST /charges/{id}/approve-refund route
 *     - Drop dinoco_claim_payment_rest_approve_refund handler
 *     - Drop the pre-lock token validation 5-error-code matrix
 *     - Drop the atomic UPDATE-affected-rows-1 invariant inside transition
 *     - Drop the actor != approver defense-in-depth assertion in transition
 *     - Drop the 7-day retention purge of refund_approvals
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const SCHEMA_PATH = path.join(REPO, '[Admin System] DINOCO Claim Charges Schema');
const LIFF_PATH   = path.join(REPO, '[System] DINOCO Claim Payment LIFF');

const SCHEMA = fs.readFileSync(SCHEMA_PATH, 'utf8');
const LIFF   = fs.readFileSync(LIFF_PATH, 'utf8');

describe('Sprint 15 Claim Refund Consent — H2 + M4 drift detector', () => {

    // ────────────────────────────────────────────────────────────────
    // SCHEMA — H2 amount snapshot + M4 refund_approvals table
    // ────────────────────────────────────────────────────────────────

    describe('Schema V.0.4', () => {
        test('schema version stamped V.0.4 (Sprint 15)', () => {
            expect(SCHEMA).toMatch(/Version:\s*V\.0\.5\s*\(2026-05-14\)/);
        });

        test('Sprint 16 — schema version constant bumped to 1.3 (CHECK constraint fix)', () => {
            expect(SCHEMA).toMatch(
                /define\(\s*'DINOCO_CLAIM_CHARGES_SCHEMA_VERSION'\s*,\s*'1\.3'\s*\)/
            );
        });

        // H2 — amount_thb_at_create immutable snapshot column
        test('H2 — declares amount_thb_at_create DECIMAL(14,2) NOT NULL', () => {
            expect(SCHEMA).toMatch(/amount_thb_at_create\s+DECIMAL\(14,2\)\s+NOT\s+NULL/);
        });

        test('H2 — declares chk_amount_snapshot CHECK constraint', () => {
            expect(SCHEMA).toMatch(
                /'chk_amount_snapshot'\s*=>\s*"\(amount_thb\s*=\s*amount_thb_at_create\)"/
            );
        });

        // M4 — refund_approvals table
        test('M4 — declares dinoco_claim_refund_approvals_table_name() helper', () => {
            expect(SCHEMA).toMatch(/function\s+dinoco_claim_refund_approvals_table_name\(\)/);
            expect(SCHEMA).toMatch(/return\s+\$wpdb->prefix\s*\.\s*'dinoco_claim_refund_approvals'/);
        });

        const approvalsColumns = [
            'id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT',
            'charge_id BIGINT(20) UNSIGNED NOT NULL',
            'approver_user_id BIGINT(20) UNSIGNED NOT NULL',
            'consent_token CHAR(64) COLLATE utf8mb4_bin NOT NULL',
            'created_at DATETIME NOT NULL',
            'expires_at DATETIME NOT NULL',
            'consumed_at DATETIME DEFAULT NULL',
            'consumed_by_user_id BIGINT(20) UNSIGNED DEFAULT NULL',
        ];

        test.each(approvalsColumns)(
            'M4 — refund_approvals DDL contains: %s',
            (col) => { expect(SCHEMA).toContain(col); }
        );

        test('M4 — refund_approvals declares UNIQUE consent_token', () => {
            expect(SCHEMA).toMatch(/UNIQUE KEY uq_consent_token \(consent_token\)/);
        });

        test('M4 — refund_approvals declares idx_charge_approver composite', () => {
            expect(SCHEMA).toMatch(/KEY idx_charge_approver \(charge_id, approver_user_id\)/);
        });

        test('M4 — refund_approvals declares idx_expires', () => {
            expect(SCHEMA).toMatch(/KEY idx_expires \(expires_at\)/);
        });

        test('M4 — dbDelta runs BOTH tables in same install transaction', () => {
            expect(SCHEMA).toMatch(
                /dbDelta\(\s*\$sql\s*\);\s*\n?\s*dbDelta\(\s*\$sql_approvals\s*\)/
            );
        });

        // Retention — refund_approvals 7-day purge
        test('M4 — cleanup_run purges refund_approvals expired > 7 days', () => {
            expect(SCHEMA).toMatch(
                /expires_at\s*<\s*DATE_SUB\(NOW\(\),\s*INTERVAL\s+7\s+DAY\)/
            );
        });

        test('M4 — cleanup_run uses ORDER BY id ASC + LIMIT 1000 for approvals', () => {
            expect(SCHEMA).toMatch(
                /DELETE\s+FROM\s+\{\$atable\}[\s\S]*?ORDER\s+BY\s+id\s+ASC[\s\S]*?LIMIT\s+1000/
            );
        });

        test('M4 — cleanup heartbeat array includes approvals_deleted key', () => {
            expect(SCHEMA).toContain("'approvals_deleted'");
        });
    });

    // ────────────────────────────────────────────────────────────────
    // LIFF — REST route + handler + transition extension
    // ────────────────────────────────────────────────────────────────

    describe('LIFF V.0.4 (lineage)', () => {
        test('liff V.0.4 header retained in lineage chain (Sprint 15)', () => {
            // V.0.4 lineage block still present in header chain even after
            // Sprint 16 (V.0.5) + Sprint 17 (V.0.6) bumps.
            expect(LIFF).toMatch(/Version:\s*V\.0\.4\s*\(2026-05-14\)/);
        });

        test('DINOCO_CLAIM_PAYMENT_LIFF_LOADED bumped to 0.8 (Sprint 20)', () => {
            // Sprint 17 bumped V.0.4 → 0.6; Sprint 20 bumped 0.6 → 0.8.
            // Constant is single source of truth — pin current value.
            expect(LIFF).toMatch(/'DINOCO_CLAIM_PAYMENT_LIFF_LOADED'\s*,\s*'0\.8'/);
        });

        // M4 — new REST route
        test('M4 — registers POST /charges/{id}/approve-refund', () => {
            // PHP source has escaped \\d+
            expect(LIFF).toMatch(/register_rest_route\([\s\S]{0,400}?\/charges\/\(\?P<id>\\\\d\+\)\/approve-refund/);
        });

        test('M4 — approve-refund callback wires to dinoco_claim_payment_rest_approve_refund', () => {
            expect(LIFF).toContain("'callback'            => 'dinoco_claim_payment_rest_approve_refund'");
        });

        test('M4 — approve-refund ttl_minutes range 5..60 default 15', () => {
            expect(LIFF).toMatch(/'minimum'\s*=>\s*5,\s*'maximum'\s*=>\s*60,\s*'default'\s*=>\s*15/);
        });

        test('M4 — approve-refund handler defined and admin-gated', () => {
            expect(LIFF).toMatch(/function\s+dinoco_claim_payment_rest_approve_refund\s*\(/);
            // Permission callback in route block
            expect(LIFF).toMatch(/'permission_callback'\s*=>\s*'dinoco_claim_payment_perm_admin',\s*\n\s*'args'\s*=>\s*array\(\s*\n\s*'id'\s*=>\s*array\([^\n]*?\)\s*,\s*\n\s*'ttl_minutes'/);
        });

        test('M4 — approve-refund clamps ttl 5..60', () => {
            expect(LIFF).toMatch(/if\s*\(\s*\$ttl_minutes\s*<\s*5\s*\)\s*\$ttl_minutes\s*=\s*5;/);
            expect(LIFF).toMatch(/if\s*\(\s*\$ttl_minutes\s*>\s*60\s*\)\s*\$ttl_minutes\s*=\s*60;/);
        });

        test('M4 — approve-refund rate-limited 20/hr per approver', () => {
            expect(LIFF).toMatch(
                /b2b_rate_limit\(\s*'claim_refund_approve_'\s*\.\s*\$uid\s*,\s*20\s*,\s*3600\s*\)/
            );
        });

        test('M4 — approve-refund rejects self-approval at issuance time', () => {
            expect(LIFF).toMatch(/\(int\)\s*\$charge\['verified_by'\]\s*===\s*\$uid/);
            expect(LIFF).toContain('four_eyes_self_approval');
        });

        test('M4 — approve-refund requires charge.status === verified', () => {
            expect(LIFF).toMatch(/\(string\)\s*\$charge\['status'\]\s*!==\s*'verified'/);
            expect(LIFF).toContain('charge_not_verified');
        });

        test('M4 — approve-refund generates 64-char alphanumeric token', () => {
            expect(LIFF).toMatch(/wp_generate_password\(\s*64\s*,\s*false\s*,\s*false\s*\)/);
        });

        // M4 — refund handler extensions
        test('M4 — refund handler enforces token format regex', () => {
            expect(LIFF).toContain("preg_match( '/^[A-Za-z0-9]{1,64}$/'");
            expect(LIFF).toContain('consent_token_invalid_format');
        });

        const refundErrorCodes = [
            'consent_token_required',
            'consent_token_not_found',
            'consent_token_already_consumed',
            'consent_token_expired',
            'consent_self_approval',
            'consent_approver_mismatch',
        ];

        test.each(refundErrorCodes)(
            'M4 — refund handler returns error code: %s',
            (code) => { expect(LIFF).toContain(code); }
        );

        test('M4 — refund passes consent_token_row_id to transition context', () => {
            expect(LIFF).toMatch(/'consent_token_row_id'\s*=>\s*\$consent_token_row_id/);
        });

        test('M4 — refund passes consent_token as idem_discriminator (R42 fingerprint)', () => {
            expect(LIFF).toMatch(/'idem_discriminator'\s*=>\s*\$consent_token/);
        });

        // H2 — transition handler must read amount_thb_at_create
        test('H2 — transition SELECT FOR UPDATE includes amount_thb_at_create', () => {
            expect(LIFF).toMatch(
                /SELECT\s+id,\s*claim_id,\s*user_id,\s*amount_thb,\s*amount_thb_at_create,\s*status,\s*verified_by\s+FROM\s+\{\$table\}\s+WHERE\s+id\s*=\s*%d\s+FOR\s+UPDATE/
            );
        });

        test('H2 — 4-eyes gate compares to amount_create not amount_now', () => {
            expect(LIFF).toMatch(/if\s*\(\s*\$amount_create\s*>=\s*5000\.0\s*\)/);
        });

        test('H2 — drift assertion with satang tolerance + ROLLBACK + amount_drift_detected', () => {
            expect(LIFF).toMatch(/abs\(\s*\$amount_now\s*-\s*\$amount_create\s*\)\s*>\s*0\.01/);
            expect(LIFF).toContain('amount_drift_detected');
        });

        test('H2 — explicit guard for legacy rows missing amount_thb_at_create', () => {
            expect(LIFF).toContain('amount_snapshot_missing');
        });

        // M4 — transition consumes token inside transaction
        test('M4 — transition UPDATE consumes token with affected_rows=1 invariant', () => {
            expect(LIFF).toMatch(
                /UPDATE\s+\{\$atable\}\s+SET\s+consumed_at\s*=\s*%s,\s*consumed_by_user_id\s*=\s*%d\s+WHERE\s+id\s*=\s*%d\s+AND\s+charge_id\s*=\s*%d\s+AND\s+consumed_at\s+IS\s+NULL\s+AND\s+expires_at\s*>=\s*%s/
            );
        });

        test('M4 — transition asserts (int) $consume_affected === 1 else ROLLBACK', () => {
            expect(LIFF).toMatch(/\(int\)\s*\$consume_affected\s*!==\s*1/);
            expect(LIFF).toContain('consent_already_consumed');
        });

        test('M4 — transition defense-in-depth: $approver === $actor_uid rejected', () => {
            expect(LIFF).toMatch(/\$approver\s*===\s*\$actor_uid/);
            expect(LIFF).toContain('four_eyes_actor_is_approver');
        });
    });
});
