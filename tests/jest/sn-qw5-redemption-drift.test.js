/**
 * Drift detector — QW-5 Refer-a-Friend redemption wiring (Phase 6 finish, 2026-05-14)
 *
 * Pins:
 *   1. dinoco_sn_redeem_referral_code() exists in Notifier V.0.10
 *   2. dinoco_sn_promo_codes_has_referrer_col() lazy ALTER helper exists
 *   3. Marketplace checkout (SN REST API V.0.47) reads template + commits via redeem helper
 *   4. dinoco_sn_get_referral_stats counts via referrer_user_id when column exists
 *   5. promo_codes schema (SN Manager V.0.60) has referrer_user_id + idx_referrer + VARCHAR(40)
 *   6. Self-referral block + per-friend dedup + expiry check in redeem helper
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const NOTIFIER = path.join(REPO, '[Admin System] DINOCO Warranty Lifecycle Notifier');
const REST = path.join(REPO, '[System] DINOCO SN REST API');
const MANAGER = path.join(REPO, '[Admin System] DINOCO Production SN Manager');

describe('QW-5 Refer-a-Friend redemption — Phase 6 finish drift detector', () => {
    const notifier = fs.readFileSync(NOTIFIER, 'utf8');
    const rest = fs.readFileSync(REST, 'utf8');
    const manager = fs.readFileSync(MANAGER, 'utf8');

    describe('1. Notifier V.0.10+ redemption helpers exist', () => {
        test('dinoco_sn_redeem_referral_code defined', () => {
            expect(notifier).toMatch(/function\s+dinoco_sn_redeem_referral_code\s*\(/);
        });

        test('dinoco_sn_promo_codes_has_referrer_col defined (lazy ALTER guard)', () => {
            expect(notifier).toMatch(/function\s+dinoco_sn_promo_codes_has_referrer_col\s*\(/);
        });

        test('Notifier version header bumped to V.0.10', () => {
            expect(notifier).toMatch(/Version:\s*V\.0\.10[\s\S]{0,400}QW-5 finish/);
        });
    });

    describe('2. Lazy ALTER triggers on first call', () => {
        test('Uses INFORMATION_SCHEMA.COLUMNS to detect referrer_user_id', () => {
            expect(notifier).toMatch(/INFORMATION_SCHEMA\.COLUMNS[\s\S]{0,300}referrer_user_id/);
        });

        test('ALTER TABLE adds referrer_user_id column', () => {
            expect(notifier).toMatch(/ALTER TABLE\s+\{?\$?tbl\}?\s+ADD COLUMN referrer_user_id/);
        });

        test('ALTER TABLE adds idx_referrer key', () => {
            expect(notifier).toMatch(/ADD KEY idx_referrer/);
        });

        test('ALTER TABLE widens code to VARCHAR(40)', () => {
            expect(notifier).toMatch(/MODIFY COLUMN code VARCHAR\(40\)/);
        });

        test('Static memo cache to avoid repeated INFORMATION_SCHEMA hits', () => {
            const fnBody = notifier.match(/function\s+dinoco_sn_promo_codes_has_referrer_col[\s\S]{0,1200}/);
            expect(fnBody).not.toBeNull();
            expect(fnBody[0]).toMatch(/static\s+\$cached/);
        });
    });

    describe('3. Redemption validation chain', () => {
        const redeemFn = notifier.match(/function\s+dinoco_sn_redeem_referral_code[\s\S]{0,9000}/)[0];

        test('Rejects empty/short codes', () => {
            expect(redeemFn).toMatch(/strlen\(\s*\$code\s*\)\s*<\s*8/);
            expect(redeemFn).toMatch(/'invalid_code'/);
        });

        test('Rejects unauthenticated users', () => {
            expect(redeemFn).toMatch(/'not_logged_in'/);
        });

        test('Rejects already-used codes (legacy 1-time-use safeguard)', () => {
            expect(redeemFn).toMatch(/'already_used'/);
        });

        test('Rejects expired codes', () => {
            expect(redeemFn).toMatch(/'expired'/);
            expect(redeemFn).toMatch(/strtotime[\s\S]{0,80}expires_at/);
        });

        test('Blocks self-referral', () => {
            expect(redeemFn).toMatch(/'self_referral'/);
            expect(redeemFn).toMatch(/\$row->user_id[\s\S]{0,80}===\s*\$friend_user_id/);
        });

        test('Per-friend dedup (modern path)', () => {
            expect(redeemFn).toMatch(/'already_redeemed_by_friend'/);
            expect(redeemFn).toMatch(/WHERE referrer_user_id\s*=\s*%d[\s\S]{0,80}AND user_id\s*=\s*%d/);
        });

        test('INSERT audit row with REF- prefix format', () => {
            expect(redeemFn).toMatch(/'REF-'\s*\.\s*\$referrer_user_id/);
            expect(redeemFn).toMatch(/\$wpdb->insert\(\s*\$tbl,/);
        });

        test('Legacy fallback path (UPDATE template used_at) for pre-V.0.10 schema', () => {
            expect(redeemFn).toMatch(/\$wpdb->update\(\s*\$tbl,[\s\S]{0,400}'used_at'\s*=>\s*\$now/);
        });

        test('Audit log fires on successful redemption', () => {
            expect(redeemFn).toMatch(/dinoco_sn_audit_log\([\s\S]{0,200}'referral_redeemed'/);
        });
    });

    describe('4. Marketplace checkout wires redemption (REST V.0.47+)', () => {
        test('SN REST API version header bumped to V.0.47', () => {
            expect(rest).toMatch(/Version:\s*V\.0\.47[\s\S]{0,300}QW-5 finish/);
        });

        test('Preview discount lookup queries template (used_at IS NULL)', () => {
            expect(rest).toMatch(/WHERE code = %s AND used_at IS NULL/);
        });

        test('Calls dinoco_sn_redeem_referral_code post-INSERT with extension_id', () => {
            expect(rest).toMatch(/dinoco_sn_redeem_referral_code\(\s*\$coupon_applied,\s*\$user_id,\s*\$extension_id/);
        });

        test('Soft-fails redemption (logs but does not block extension creation)', () => {
            expect(rest).toMatch(/sn_referral_redeem_post_insert_fail/);
        });

        test('Audit log includes coupon_meta + referral_redeemed flag', () => {
            expect(rest).toMatch(/'coupon_meta'\s*=>\s*\$coupon_meta/);
            expect(rest).toMatch(/'referral_redeemed'\s*=>/);
        });

        test('Throwable catch around redemption (R11 obs signature)', () => {
            expect(rest).toMatch(/catch\s*\(\s*\\Throwable\s+\$e\s*\)[\s\S]{0,200}sn_referral_redeem_throw/);
        });

        test('Defensive function_exists guard on redemption helper', () => {
            expect(rest).toMatch(/function_exists\(\s*'dinoco_sn_redeem_referral_code'\s*\)/);
        });
    });

    describe('5. Stats query uses referrer_user_id when column exists', () => {
        const statsFn = notifier.match(/function\s+dinoco_sn_get_referral_stats[\s\S]{0,2500}/)[0];

        test('Modern path queries WHERE referrer_user_id = %d', () => {
            expect(statsFn).toMatch(/WHERE referrer_user_id\s*=\s*%d AND used_at IS NOT NULL/);
        });

        test('Legacy fallback path (pre-V.0.10) preserved', () => {
            expect(statsFn).toMatch(/WHERE code = %s AND used_at IS NOT NULL/);
        });

        test('Uses has_referrer_col guard to switch paths', () => {
            expect(statsFn).toMatch(/dinoco_sn_promo_codes_has_referrer_col\(\)/);
        });
    });

    describe('6. Manager V.0.60 schema declares new columns', () => {
        test('Manager version header bumped to V.0.60', () => {
            expect(manager).toMatch(/Version:\s*V\.0\.60[\s\S]{0,300}QW-5 finish/);
        });

        test('promo_codes CREATE TABLE declares referrer_user_id', () => {
            const promoSchema = manager.match(/sql_promo\s*=\s*"CREATE TABLE[\s\S]{0,1500}/)[0];
            expect(promoSchema).toMatch(/referrer_user_id\s+BIGINT UNSIGNED DEFAULT NULL/);
        });

        test('promo_codes CREATE TABLE adds idx_referrer KEY', () => {
            const promoSchema = manager.match(/sql_promo\s*=\s*"CREATE TABLE[\s\S]{0,1500}/)[0];
            expect(promoSchema).toMatch(/KEY idx_referrer\s*\(referrer_user_id\)/);
        });

        test('promo_codes code column widened to VARCHAR(40) (audit-row format)', () => {
            const promoSchema = manager.match(/sql_promo\s*=\s*"CREATE TABLE[\s\S]{0,1500}/)[0];
            expect(promoSchema).toMatch(/code VARCHAR\(40\)\s+NOT NULL/);
        });
    });
});
