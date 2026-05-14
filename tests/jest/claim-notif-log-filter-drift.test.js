/**
 * Claim Notif Log Filter/Search drift detector — Sprint 29 Phase 4 Batch A Item 4.
 *
 * Pins the surface shipped in:
 *   • [Admin System] DINOCO Claim Lifecycle Notifier (V.0.7) — REST endpoint
 *
 * Verifies future edits do not regress:
 *   - Endpoint registration (GET /notif-log)
 *   - manage_options + nonce permission (matches V.0.3 MED-2 discipline)
 *   - Filter params: type / status (success|fail) / from / to / charge_id
 *   - Pagination cap 1..200 default 50
 *   - Strict Y-m-d date validation
 *   - Outer claim window cap 500 (bounded query time)
 *   - Result shape: { rows[], meta{ total, pages, current_page, per_page, ... } }
 *   - Reads from `_claim_notif_log` postmeta (NOT new table)
 *   - Existing per-claim GET /notif/log preserved (V.0.3 MED-2 manage_options)
 *   - Version pin V.0.7
 *
 * Spec source: FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md Phase 4 Item 4.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const NOTIFIER_PATH = path.join(REPO, '[Admin System] DINOCO Claim Lifecycle Notifier');
const SRC = fs.readFileSync(NOTIFIER_PATH, 'utf8');
const SRC_CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '');

describe('Claim Notif Log Filter — Phase 4 Batch A Item 4 drift detector', () => {

    test('Notifier version stamped V.0.7 (Sprint 29 Phase 4 Batch A Item 4)', () => {
        expect(SRC).toMatch(/Version:\s*V\.0\.7\s*\(2026-05-14\)/);
    });

    test('Notifier registers GET /notif-log REST route (new aggregate endpoint)', () => {
        expect(SRC_CODE).toMatch(/register_rest_route\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/notif-log['"]/);
    });

    test('Notifier keeps existing per-claim GET /notif/log endpoint (V.0.3 MED-2 backward compat)', () => {
        // The original per-claim endpoint must still exist — Phase 4 Batch A is ADDITIVE.
        expect(SRC_CODE).toMatch(/register_rest_route\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/notif\/log['"]/);
    });

    test('Notif-log endpoint method is GET', () => {
        const block = SRC_CODE.match(/register_rest_route\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/notif-log['"][\s\S]+?\)\s*\)\s*;/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/['"]methods['"]\s*=>\s*['"]GET['"]/);
    });

    test('Notif-log endpoint gates on manage_options (matches V.0.3 MED-2 hardening)', () => {
        const block = SRC_CODE.match(/register_rest_route\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/notif-log['"][\s\S]+?\)\s*\)\s*;/);
        expect(block[0]).toMatch(/current_user_can\(\s*['"]manage_options['"]\s*\)/);
    });

    test('Notif-log endpoint declares all 7 filter params', () => {
        const block = SRC_CODE.match(/register_rest_route\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/notif-log['"][\s\S]+?\)\s*\)\s*;/);
        expect(block[0]).toMatch(/['"]type['"]\s*=>/);
        expect(block[0]).toMatch(/['"]status['"]\s*=>/);
        expect(block[0]).toMatch(/['"]from['"]\s*=>/);
        expect(block[0]).toMatch(/['"]to['"]\s*=>/);
        expect(block[0]).toMatch(/['"]charge_id['"]\s*=>/);
        expect(block[0]).toMatch(/['"]page['"]\s*=>/);
        expect(block[0]).toMatch(/['"]per_page['"]\s*=>/);
    });

    test('Notif-log per_page bounded 1..200 default 50', () => {
        const block = SRC_CODE.match(/register_rest_route\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/notif-log['"][\s\S]+?\)\s*\)\s*;/);
        // args declares maximum 200, minimum 1
        expect(block[0]).toMatch(/['"]per_page['"]\s*=>\s*array\([^)]*['"]maximum['"]\s*=>\s*200/);
        expect(block[0]).toMatch(/['"]per_page['"]\s*=>\s*array\([^)]*['"]minimum['"]\s*=>\s*1/);
        // Handler default 50 fallback
        const handler = SRC_CODE.match(/function\s+dinoco_claim_notif_rest_filter\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        expect(handler).not.toBeNull();
        expect(handler[0]).toMatch(/per_page\s*<\s*1\s*\|\|\s*\$per_page\s*>\s*200[\s\S]+?\$per_page\s*=\s*50/);
    });

    test('Notif-log validates from/to as strict Y-m-d', () => {
        const handler = SRC_CODE.match(/function\s+dinoco_claim_notif_rest_filter\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        expect(handler[0]).toMatch(/createFromFormat\(\s*['"]Y-m-d['"]/);
        expect(handler[0]).toMatch(/invalid_from/);
        expect(handler[0]).toMatch(/invalid_to/);
    });

    test('Notif-log status filter accepts only success|fail (whitelist)', () => {
        const handler = SRC_CODE.match(/function\s+dinoco_claim_notif_rest_filter\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        expect(handler[0]).toMatch(/in_array\(\s*\$status\s*,\s*array\(\s*['"]success['"]\s*,\s*['"]fail['"]/);
        expect(handler[0]).toMatch(/invalid_status/);
    });

    test('Notif-log outer claim window capped at 500 (bounded query time)', () => {
        const handler = SRC_CODE.match(/function\s+dinoco_claim_notif_rest_filter\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        expect(handler[0]).toMatch(/\$claim_cap\s*=\s*500/);
        // get_posts uses this cap
        expect(handler[0]).toMatch(/posts_per_page['"]\s*=>\s*\$claim_cap/);
    });

    test('Notif-log queries claim_ticket CPT with _claim_notif_log meta_exists', () => {
        const handler = SRC_CODE.match(/function\s+dinoco_claim_notif_rest_filter\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        expect(handler[0]).toMatch(/post_type['"]\s*=>\s*['"]claim_ticket['"]/);
        expect(handler[0]).toMatch(/['"]key['"]\s*=>\s*['"]_claim_notif_log['"]/);
        expect(handler[0]).toMatch(/['"]compare['"]\s*=>\s*['"]EXISTS['"]/);
    });

    test('Notif-log reads per-claim postmeta NOT a new table (additive design)', () => {
        const handler = SRC_CODE.match(/function\s+dinoco_claim_notif_rest_filter\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        // No CREATE TABLE or dbDelta in handler.
        expect(handler[0]).not.toMatch(/CREATE\s+TABLE/i);
        expect(handler[0]).not.toMatch(/dbDelta/);
        // Reads via get_post_meta postmeta key
        expect(handler[0]).toMatch(/get_post_meta\(\s*\$cid\s*,\s*['"]_claim_notif_log['"]/);
    });

    test('Notif-log returns rows[] + meta{} shape with required keys', () => {
        const handler = SRC_CODE.match(/function\s+dinoco_claim_notif_rest_filter\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        expect(handler[0]).toMatch(/['"]rows['"]\s*=>/);
        expect(handler[0]).toMatch(/['"]meta['"]\s*=>/);
        expect(handler[0]).toMatch(/['"]total['"]\s*=>/);
        expect(handler[0]).toMatch(/['"]pages['"]\s*=>/);
        expect(handler[0]).toMatch(/['"]current_page['"]\s*=>/);
        expect(handler[0]).toMatch(/['"]per_page['"]\s*=>/);
        expect(handler[0]).toMatch(/['"]claims_scanned['"]\s*=>/);
    });

    test('Notif-log entry shape includes claim_id + status slug + ts + success + msg_id + error', () => {
        const handler = SRC_CODE.match(/function\s+dinoco_claim_notif_rest_filter\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        expect(handler[0]).toMatch(/['"]claim_id['"]\s*=>/);
        expect(handler[0]).toMatch(/['"]status['"]\s*=>/);
        expect(handler[0]).toMatch(/['"]ts['"]\s*=>/);
        expect(handler[0]).toMatch(/['"]success['"]\s*=>/);
        expect(handler[0]).toMatch(/['"]msg_id['"]\s*=>/);
        expect(handler[0]).toMatch(/['"]error['"]\s*=>/);
    });

    test('Notif-log sorts result DESC by ts (newest first)', () => {
        const handler = SRC_CODE.match(/function\s+dinoco_claim_notif_rest_filter\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        expect(handler[0]).toMatch(/usort\(/);
        // DESC sort: tb < ta → -1
        expect(handler[0]).toMatch(/\$tb\s*<\s*\$ta[\s\S]+?-1/);
    });

    test('Notif-log handler is function_exists guarded (snippet conventions)', () => {
        expect(SRC_CODE).toMatch(/if\s*\(\s*!\s*function_exists\(\s*['"]dinoco_claim_notif_rest_filter['"]\s*\)\s*\)/);
    });

    test('Notif-log type filter does substring search via stripos (case-insensitive)', () => {
        const handler = SRC_CODE.match(/function\s+dinoco_claim_notif_rest_filter\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        expect(handler[0]).toMatch(/stripos\([^)]+\$type_lc/);
    });

    test('Notif-log charge_id filter does substring match on status/error fields', () => {
        const handler = SRC_CODE.match(/function\s+dinoco_claim_notif_rest_filter\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        // Matches stripos on $e_status_slug AND on $e_error
        expect(handler[0]).toMatch(/stripos\(\s*\$e_status_slug/);
        expect(handler[0]).toMatch(/stripos\(\s*\$e_error/);
    });

    test('Notifier rate limit NOT added on read-only filter endpoint (per spec — cheap admin read)', () => {
        // No b2b_rate_limit call inside dinoco_claim_notif_rest_filter handler.
        const handler = SRC_CODE.match(/function\s+dinoco_claim_notif_rest_filter\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        expect(handler[0]).not.toMatch(/b2b_rate_limit/);
    });

    test('Notifier preserves V.0.6 listener priority 20 (no drift)', () => {
        expect(SRC_CODE).toMatch(/add_action\(\s*['"]dinoco\/claim\/state_changed['"]\s*,\s*['"]dinoco_claim_notify_status_changed['"]\s*,\s*20\s*,\s*4\s*\)/);
    });

    test('Notifier preserves V.0.6 cron registration (regression guard)', () => {
        expect(SRC_CODE).toMatch(/wp_schedule_event\([^,]+,\s*['"]daily['"]\s*,\s*['"]dinoco_claim_charge_expire_cron['"]\s*\)/);
        expect(SRC_CODE).toMatch(/wp_schedule_event\([^,]+,\s*['"]hourly['"]\s*,\s*['"]dinoco_claim_charge_pending_review_sweep_cron['"]\s*\)/);
    });

    test('Notifier feature flag default OFF preserved (REG-029 byte-identical when OFF)', () => {
        expect(SRC_CODE).toMatch(/get_option\(\s*['"]dinoco_claim_notif_enabled['"]\s*,\s*false\s*\)/);
    });

    test('Per-page minimum is enforced (cannot pass 0 to disable cap)', () => {
        const block = SRC_CODE.match(/register_rest_route\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/notif-log['"][\s\S]+?\)\s*\)\s*;/);
        expect(block[0]).toMatch(/['"]per_page['"]\s*=>\s*array\([^)]*['"]minimum['"]\s*=>\s*1/);
    });

    test('Notifier handler does not leak claim_ticket post body (only meta log entries)', () => {
        // Pure handler reads only postmeta + emits entries[]; no get_the_content
        // or get_post objects passed into the result.
        const handler = SRC_CODE.match(/function\s+dinoco_claim_notif_rest_filter\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        expect(handler[0]).not.toMatch(/get_the_content/);
        expect(handler[0]).not.toMatch(/get_post\(/);
    });

    test('Page parameter clamped to 1+ on entry (prevents negative offset)', () => {
        const handler = SRC_CODE.match(/function\s+dinoco_claim_notif_rest_filter\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        expect(handler[0]).toMatch(/max\(\s*1\s*,\s*\(int\)\s*\$req->get_param\(\s*['"]page['"]/);
    });

    test('Notif-log endpoint registered inside the same dinoco_claim_notif_register_rest function (no separate hook)', () => {
        // Both endpoints share the rest_api_init wiring already gated by feature flag.
        const reg = SRC_CODE.match(/function\s+dinoco_claim_notif_register_rest\s*\(\s*\)[\s\S]+?\}\s*\}/);
        expect(reg).not.toBeNull();
        expect(reg[0]).toMatch(/\/notif\/log/);
        expect(reg[0]).toMatch(/\/notif-log/);
        expect(reg[0]).toMatch(/\/notif\/resend/);
    });
});
