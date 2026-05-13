/**
 * QW-5 Refer-a-Friend Drift Detector — 2026-05-13
 *
 * Phase 6 backlog QW-5: customer activates plate → auto-generate referral code →
 * shares with friend → friend uses code at registration → both get reward.
 *
 * Locks the implementation in Warranty Lifecycle Notifier V.0.7:
 *   1. promo_codes helper recognizes 'refer_a_friend' type (10% / any / 180d TTL)
 *   2. dinoco_sn_get_or_create_referral_code() exists + idempotent (user meta cached)
 *   3. dinoco_sn_get_referral_stats() exists + queries promo_codes table
 *   4. Auto-trigger listener wired to dinoco_sn_pool_status_changed_for_user
 *      → fires only on $to='registered' (not voided/recalled/etc.)
 *   5. Reward amount configurable via wp_option
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const NOTIFIER = path.join(REPO_ROOT, "[Admin System] DINOCO Warranty Lifecycle Notifier");

function stripComments(src) {
    return src.split("\n").filter((l) => {
        const t = l.trim();
        if (t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/")) return false;
        if (t.startsWith("//")) return false;
        return true;
    }).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
}

describe("QW-5 Refer-a-Friend (Phase 6 backlog) drift detector", () => {
    let code;

    beforeAll(() => {
        code = stripComments(fs.readFileSync(NOTIFIER, "utf8"));
    });

    test("promo_codes helper recognizes refer_a_friend type", () => {
        expect(code).toMatch(/\$type\s*===\s*'refer_a_friend'/);
    });

    test("refer_a_friend defaults: 10% discount / scope=any / ttl=180d", () => {
        // Find the branch start, then read forward 30 lines (the elseif body is small).
        const idx = code.indexOf("$type === 'refer_a_friend'");
        expect(idx).toBeGreaterThan(-1);
        const branch = code.slice(idx, idx + 600);
        // Branch uses `$defaults['key'] = value;` assignments (not array literal `=> value`)
        expect(branch).toMatch(/discount_pct'\]\s*=\s*10/);
        expect(branch).toMatch(/scope'\]\s*=\s*'any'/);
        expect(branch).toMatch(/ttl_days'\]\s*=\s*180/);
    });

    test("dinoco_sn_get_or_create_referral_code function defined", () => {
        expect(code).toMatch(/function\s+dinoco_sn_get_or_create_referral_code\s*\(/);
    });

    test("get_or_create idempotent — returns existing user meta if length >= 8", () => {
        expect(code).toMatch(/get_user_meta\(\s*\$user_id,\s*'dinoco_sn_referral_code'/);
        // Length check ensures we don't return a stale partial value
        expect(code).toMatch(/strlen\(\s*\$existing\s*\)\s*>=\s*8/);
    });

    test("get_or_create stores new code in user meta", () => {
        expect(code).toMatch(/update_user_meta\(\s*\$user_id,\s*'dinoco_sn_referral_code',\s*\$code/);
    });

    test("dinoco_sn_get_referral_stats function defined", () => {
        expect(code).toMatch(/function\s+dinoco_sn_get_referral_stats\s*\(/);
    });

    test("stats query promo_codes table for used_at IS NOT NULL", () => {
        expect(code).toMatch(/SELECT COUNT\(\*\) FROM \{\$tbl\} WHERE code = %s AND used_at IS NOT NULL/);
    });

    test("reward per redemption configurable via wp_option", () => {
        expect(code).toMatch(/get_option\(\s*'dinoco_sn_referral_reward_thb',\s*100\.0\s*\)/);
    });

    test("auto-generate listener wired to dinoco_sn_pool_status_changed_for_user", () => {
        expect(code).toMatch(/add_action\(\s*'dinoco_sn_pool_status_changed_for_user',\s*'dinoco_sn_auto_generate_referral_on_register'/);
    });

    test("listener guard: only fires when status_to === 'registered'", () => {
        const idx = code.indexOf("function dinoco_sn_auto_generate_referral_on_register");
        expect(idx).toBeGreaterThan(-1);
        const listener = code.slice(idx, idx + 1000);
        expect(listener).toMatch(/\$to\s*!==\s*'registered'/);
    });

    test("listener defensive — wraps in try/catch + obs_capture_exception", () => {
        expect(code).toMatch(/dinoco_obs_capture_exception\(\s*\$e,\s*array\(\s*'context'\s*=>\s*'sn_referral_auto_generate'/);
    });
});

// Phase 7 P2 (2026-05-13) — Member Dashboard refer card drift detector
describe("QW-5 Member Dashboard refer card (Phase 7 P2)", () => {
    let dash;

    beforeAll(() => {
        const dashPath = path.join(REPO_ROOT, "[System] Member Dashboard Main");
        dash = fs.readFileSync(dashPath, "utf8");
        // Don't strip <style>/<script> blocks inside heredocs
    });

    test("dinoco_dashboard_refer_friend_card function defined", () => {
        expect(dash).toMatch(/function\s+dinoco_dashboard_refer_friend_card\s*\(/);
    });

    test("card uses dinoco_sn_get_or_create_referral_code (idempotent lazy)", () => {
        expect(dash).toMatch(/dinoco_sn_get_or_create_referral_code\(\s*\$user_id\s*\)/);
    });

    test("defensive — function_exists guard before calling Notifier helpers", () => {
        const idx = dash.indexOf("function dinoco_dashboard_refer_friend_card");
        const body = dash.slice(idx, idx + 6000);
        expect(body).toMatch(/function_exists\(\s*'dinoco_sn_get_or_create_referral_code'\s*\)/);
    });

    test("renders LINE share deep link (line.me/R/msg/text)", () => {
        expect(dash).toMatch(/line\.me\/R\/msg\/text\//);
    });

    test("renders copy-to-clipboard button with data-code attr", () => {
        expect(dash).toMatch(/dnc-sn-refer-copy-btn/);
        expect(dash).toMatch(/data-code=/);
    });

    test("shows redeemed_count + reward_pending when > 0", () => {
        const idx = dash.indexOf("function dinoco_dashboard_refer_friend_card");
        const body = dash.slice(idx, idx + 6000);
        expect(body).toMatch(/\$redeemed\s*>\s*0/);
        expect(body).toMatch(/redeemed_count/);
        expect(body).toMatch(/reward_pending/);
    });

    test("shortcode renders card only when user has plates", () => {
        // Wired inside shortcode body — guard with has_plates check
        expect(dash).toMatch(/dinoco_dashboard_refer_friend_card\(\s*\$current_user_id\s*\)/);
        // The guard nearby: $has_plates = is_array( $rf_stats ) && ( (int) ... > 0 )
        const callIdx = dash.indexOf("dinoco_dashboard_refer_friend_card( $current_user_id )");
        expect(callIdx).toBeGreaterThan(-1);
        const surrounding = dash.slice(Math.max(0, callIdx - 600), callIdx);
        expect(surrounding).toMatch(/\$has_plates/);
    });

    test("clipboard fallback — textarea + execCommand for older browsers", () => {
        expect(dash).toMatch(/execCommand\(\s*['"]copy['"]\s*\)/);
        expect(dash).toMatch(/document\.body\.appendChild/);
    });

    test("scoped CSS prefix .dnc-sn-refer-* (no global namespace bleed)", () => {
        expect(dash).toMatch(/\.dnc-sn-refer-friend-card/);
        expect(dash).toMatch(/\.dnc-sn-refer-code-box/);
        expect(dash).toMatch(/\.dnc-sn-refer-share-btn/);
    });

    test("a11y — share btn min-height 44px (WCAG AA touch target)", () => {
        expect(dash).toMatch(/\.dnc-sn-refer-share-btn[\s\S]{0,300}min-height\s*:\s*44px/);
    });
});

