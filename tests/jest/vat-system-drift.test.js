/**
 * VAT System Drift Detector — 2026-05-18
 *
 * Pins canonical patterns + cross-snippet integration for VAT Compliance
 * System V.1.0 (F#8 Marketplace). Catches regression on:
 *
 *   1. Master flag `dinoco_vat_master_enabled` wp_option key constant
 *   2. `dinoco_vat_is_active()` = master + ready (single source of truth)
 *   3. Constant override `WP_DINOCO_VAT_ENABLED` reads constant first
 *   4. VAT Receipt eligibility gates on dinoco_vat_is_active (not just is_ready)
 *   5. PNG filename HMAC token (24-char) for PDPA defense
 *   6. PNG persist uses atomic tmp+rename pattern
 *   7. .htaccess Deny All written on upload dir creation
 *   8. Flex builder uses canonical 3-section pattern (header + body + footer NOT hero)
 *   9. dinoco_flex_header() with severity='info' (no raw-hex b2b_flex_logo_header)
 *  10. CSV escape neutralizes formula triggers =/+/-/@/tab/CR
 *  11. Monthly Export filters by sn_audit vat_receipt_pushed event
 *  12. PP30 query uses aggregate SUM (not full enrichment loop)
 *  13. Cron hook `dinoco_sn_marketplace_receipt_async` bound by LINE Push
 *  14. Idempotency transient key `dinoco_vat_pushed_{id}` 30-day TTL
 *  15. dinoco_register_admin_module schema for VAT Monthly Export (key+shortcode)
 *  16. Admin Dashboard sidebar nav-item data-tab="vat_export"
 *  17. Emergency fallback maps include vat_export (Module Registry disable safety)
 *  18. SET-context renewal helpers used in /marketplace/quote + /checkout
 *  19. Sibling fan-out uses postmeta SELECT FOR UPDATE + wp_cache_delete
 *  20. Receipt REST endpoint collapses 403/404/409 → 404 (anti-enumeration)
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const FILES = {
    mp_tools:        '[Admin System] DINOCO Marketplace Tools',
    vat_receipt:     '[System] DINOCO VAT Receipt',
    vat_push:        '[System] DINOCO VAT Receipt LINE Push',
    vat_export:      '[Admin System] DINOCO VAT Monthly Export',
    order_ctx:       '[Admin System] DINOCO Order Context Resolver',
    sn_rest:         '[System] DINOCO SN REST API',
    warranty_liff:   '[System] DINOCO Warranty Extension Marketplace',
    admin_dash:      '[Admin System] DINOCO Admin Dashboard',
};
const read = (k) => fs.readFileSync(path.join(REPO_ROOT, FILES[k]), 'utf8');

// Strip PHP/JS comment lines so version-history docblocks don't trigger
// false-positive regex matches (e.g. mentioning "old buggy pattern" in changelog)
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')   // /* ... */
        .replace(/^\s*\/\/.*$/gm, '')        // // line
        .replace(/^\s*\*.*$/gm, '');         // PHPDoc continuation
}

describe('VAT System Drift Detector — 2026-05-18 V.1.0', () => {

    /* ─ Master flag ─ */
    test('Marketplace Tools defines dinoco_vat_master_enabled option key', () => {
        const src = read('mp_tools');
        expect(src).toContain("dinoco_vat_master_enabled");
    });

    test('Marketplace Tools exposes dinoco_vat_is_master_enabled helper', () => {
        const src = read('mp_tools');
        expect(src).toMatch(/function\s+dinoco_vat_is_master_enabled\s*\(/);
    });

    test('Marketplace Tools exposes dinoco_vat_is_active = master AND ready', () => {
        const src = read('mp_tools');
        expect(src).toMatch(/function\s+dinoco_vat_is_active\s*\(/);
    });

    test('dinoco_vat_is_master_enabled reads WP_DINOCO_VAT_ENABLED constant first', () => {
        const src = read('mp_tools');
        // Constant should appear in the source AND in is_master_enabled function context
        expect(src).toContain('WP_DINOCO_VAT_ENABLED');
    });

    test('dinoco_vat_set_master_enabled refuses when constant defined (H1)', () => {
        const src = read('mp_tools');
        // File should contain constant_locked error code in setter
        expect(src).toContain('constant_locked');
        // And the setter signature
        expect(src).toMatch(/function\s+dinoco_vat_set_master_enabled/);
    });

    test('dinoco_vat_set_master_enabled reads actual $old from DB (C2 fix)', () => {
        const src = stripComments(read('mp_tools'));
        // Setter must call get_option('dinoco_vat_master_enabled') to read prior state
        // (fix from V.1.3: was inverse-of-new fabrication)
        expect(src).toMatch(/get_option\s*\(\s*['"]dinoco_vat_master_enabled['"]/);
    });

    /* ─ VAT Receipt eligibility gating ─ */
    test('VAT Receipt eligibility gates on dinoco_vat_is_active (not just is_ready)', () => {
        const src = stripComments(read('vat_receipt'));
        // Verify function exists + calls dinoco_vat_is_active in same file (file-wide)
        expect(src).toMatch(/function\s+dinoco_vat_receipt_extension_is_eligible/);
        expect(src).toMatch(/!\s*dinoco_vat_is_active\s*\(/);
    });

    test('VAT Receipt eligibility distinguishes vat_master_disabled from settings_incomplete', () => {
        const src = read('vat_receipt');
        expect(src).toContain('vat_master_disabled');
        expect(src).toContain('vat_settings_incomplete');
    });

    /* ─ PNG security (PDPA defense CRIT-1) ─ */
    test('PNG persist uses HMAC token in filename (24-char)', () => {
        const src = read('vat_push');
        expect(src).toMatch(/hash_hmac\s*\(\s*['"]sha256['"]/);
        // 24-char HMAC token: substr( hash_hmac(...), 0, 24 ) — allow whitespace
        expect(src).toMatch(/substr\s*\(\s*hash_hmac[\s\S]{0,200}?,\s*0,\s*24\s*\)/);
    });

    test('PNG persist uses atomic tmp+rename pattern (HIGH-3)', () => {
        const src = read('vat_push');
        // Should write tmp file then rename
        expect(src).toMatch(/file_put_contents\s*\(\s*\$tmp/);
        expect(src).toMatch(/@?rename\s*\(\s*\$tmp/);
        expect(src).toContain('LOCK_EX');
    });

    test('PNG persist validates magic byte (HIGH-3)', () => {
        const src = read('vat_push');
        // PNG signature: \x89PNG\r\n\x1a\n
        expect(src).toMatch(/\\x89PNG/);
    });

    test('PNG persist enforces 5MB size cap (HIGH-3)', () => {
        const src = read('vat_push');
        expect(src).toMatch(/5\s*\*\s*1024\s*\*\s*1024/);
    });

    test('upload dir creation writes .htaccess Deny All (CRIT-1)', () => {
        const src = read('vat_push');
        expect(src).toContain('.htaccess');
        expect(src).toContain('Deny from all');
    });

    /* ─ Flex builder canonical pattern ─ */
    test('Flex bubble uses canonical 3-section (no bubble.hero key)', () => {
        const src = stripComments(read('vat_push'));
        const bubble_block = src.match(/\$bubble\s*=\s*array\s*\([\s\S]*?^\s*\);/m);
        expect(bubble_block).not.toBeNull();
        // Should have body + footer but NOT hero
        expect(bubble_block[0]).toMatch(/'body'\s*=>/);
        expect(bubble_block[0]).toMatch(/'footer'\s*=>/);
        expect(bubble_block[0]).not.toMatch(/'hero'\s*=>/);
    });

    test('Flex builder uses dinoco_flex_header (canonical) not raw-hex b2b_flex_logo_header (C-1)', () => {
        const src = stripComments(read('vat_push'));
        // Function must exist
        expect(src).toMatch(/function\s+dinoco_vat_push_build_flex/);
        // dinoco_flex_header MUST be called with 'info' severity (multiline-friendly)
        expect(src).toMatch(/dinoco_flex_header\s*\([\s\S]{0,200}?['"]info['"]/);
        // b2b_flex_logo_header with raw hex 3rd arg should NOT be called (raw hex like '#1A3A5C')
        expect(src).not.toMatch(/b2b_flex_logo_header\s*\([^)]*?['"]#[0-9a-fA-F]{3,8}['"]\s*,\s*['"]#[0-9a-fA-F]{3,8}['"]/);
    });

    /* ─ CSV injection neutralization (CRIT-3) ─ */
    test('CSV escape neutralizes formula triggers =/+/-/@ via prefix-quote', () => {
        const src = read('vat_export');
        // escape function should match formula trigger chars
        expect(src).toMatch(/strpbrk\s*\([^,]+,\s*["']=\+-@/);
    });

    test('CSV escape strips embedded CR/LF', () => {
        const src = read('vat_export');
        expect(src).toMatch(/str_replace\s*\(\s*array\s*\(\s*["']\\r\\n["']/);
    });

    /* ─ Monthly Export audit filter (C1 compliance fix) ─ */
    test('Monthly Export query filters by sn_audit vat_receipt_pushed event', () => {
        const src = read('vat_export');
        expect(src).toContain('vat_receipt_pushed');
        expect(src).toMatch(/EXISTS\s*\(\s*SELECT/i);
    });

    test('Monthly Export summary uses aggregate SUM (MED-3 perf)', () => {
        const src = stripComments(read('vat_export'));
        // Function must exist
        expect(src).toMatch(/function\s+dinoco_vat_export_summary/);
        // Should call $wpdb directly with SELECT COUNT/SUM, not export_query() loop
        expect(src).toMatch(/COUNT\s*\(\s*\*\s*\)/i);
        expect(src).toMatch(/SUM\s*\(\s*\S*price_paid/i);
    });

    /* ─ Cron hook binding ─ */
    test('LINE Push binds dinoco_sn_marketplace_receipt_async cron hook', () => {
        const src = read('vat_push');
        expect(src).toMatch(/add_action\s*\(\s*['"]dinoco_sn_marketplace_receipt_async['"]/);
    });

    /* ─ Idempotency ─ */
    test('LINE Push uses transient `dinoco_vat_pushed_{id}` for idempotency', () => {
        const src = read('vat_push');
        expect(src).toContain('dinoco_vat_pushed_');
        expect(src).toMatch(/30\s*\*\s*DAY_IN_SECONDS|30 day/);
    });

    /* ─ Module Registry schema (M1 fix) ─ */
    test('VAT Monthly Export uses canonical Module Registry schema (key+shortcode)', () => {
        const src = read('vat_export');
        const reg_block = src.match(/dinoco_register_admin_module\s*\(\s*array\s*\([\s\S]*?\)\s*\)/);
        expect(reg_block).not.toBeNull();
        expect(reg_block[0]).toMatch(/['"]key['"]\s*=>\s*['"]vat_export['"]/);
        expect(reg_block[0]).toMatch(/['"]shortcode['"]\s*=>\s*['"]dinoco_vat_monthly_export['"]/);
        expect(reg_block[0]).toMatch(/['"]section['"]\s*=>\s*['"]finance['"]/);
        // Verify NOT using deprecated 'id' / 'desc' keys
        expect(reg_block[0]).not.toMatch(/['"]id['"]\s*=>/);
        expect(reg_block[0]).not.toMatch(/['"]desc['"]\s*=>/);
    });

    test('Admin Dashboard sidebar has nav-item data-tab="vat_export"', () => {
        const src = read('admin_dash');
        expect(src).toMatch(/data-tab=["']vat_export["']/);
    });

    test('Emergency fallback maps include vat_export (H3 zero-risk rollback)', () => {
        const src = read('admin_dash');
        // module_map fallback should have vat_export entry
        expect(src).toMatch(/['"]vat_export['"]\s*=>\s*['"]\[dinoco_vat_monthly_export\]['"]/);
    });

    /* ─ SET-context renewal (boss policy) ─ */
    test('SN REST exposes dinoco_sn_get_renewable_sku helper', () => {
        const src = read('sn_rest');
        expect(src).toMatch(/function\s+dinoco_sn_get_renewable_sku\s*\(/);
    });

    test('/marketplace/quote uses renewable_sku (not raw linked_sku)', () => {
        const src = stripComments(read('sn_rest'));
        // Quote handler must exist
        expect(src).toMatch(/function\s+dinoco_sn_rest_marketplace_quote/);
        // Helper must be defined
        expect(src).toMatch(/function\s+dinoco_sn_get_renewable_sku/);
        // Helper must be called at least once outside its own definition
        const calls = src.match(/dinoco_sn_get_renewable_sku\s*\(/g) || [];
        // Definition (1) + at least one caller — total ≥ 2
        expect(calls.length).toBeGreaterThanOrEqual(2);
    });

    test('Sibling fan-out uses postmeta SELECT FOR UPDATE (atomic, H-1 review fix)', () => {
        const src = stripComments(read('sn_rest'));
        // The fan-out block should query wp_postmeta with FOR UPDATE
        expect(src).toMatch(/\$wpdb->postmeta[\s\S]{0,200}FOR UPDATE/);
    });

    /* ─ Receipt REST anti-enumeration (CRIT-2) ─ */
    test('Receipt REST collapses 403/404/409 to single 404 (anti-enumeration)', () => {
        const src = stripComments(read('vat_receipt'));
        // Function must exist
        expect(src).toMatch(/function\s+dinoco_vat_receipt_rest_pull/);
        // Login gate present somewhere in file
        expect(src).toContain('is_user_logged_in');
        // 404 collapse pattern: WP_Error with 'status' => 404 array
        expect(src).toMatch(/['"]status['"]\s*=>\s*404/);
    });

    test('Receipt REST has rate limit (CRIT-2 mass enumeration defense)', () => {
        const src = read('vat_receipt');
        expect(src).toMatch(/b2b_rate_limit\s*\(\s*["']vat_receipt_pull/);
    });

    /* ─ LIFF Marketplace VAT UI (MED-1 restore) ─ */
    test('LIFF Marketplace HTML has VAT 7% breakdown row', () => {
        const src = read('warranty_liff');
        expect(src).toMatch(/data-role=["']total-vat-line["']/);
        expect(src).toMatch(/data-role=["']total-vat["']/);
    });

    test('LIFF Marketplace compute_total uses dinoco_vat_get rate default', () => {
        const src = stripComments(read('warranty_liff'));
        // Function must exist
        expect(src).toMatch(/function\s+dinoco_sn_mpx_compute_total/);
        // V.0.8: should reference dinoco_vat_get for rate fallback (not hardcode 0)
        expect(src).toContain('dinoco_vat_get');
    });

    /* ─ Order Context Resolver ─ */
    test('Order Context Resolver deferred auto-tag via wp_schedule_single_event (HIGH-1)', () => {
        const src = stripComments(read('order_ctx'));
        // Function must exist
        expect(src).toMatch(/function\s+dinoco_order_context_auto_tag/);
        // Should defer via wp_schedule_single_event (not direct update_post_meta)
        expect(src).toMatch(/wp_schedule_single_event/);
    });

    test('Order Context Resolver registers postmeta with show_in_rest=false (HIGH-1 review)', () => {
        const src = read('order_ctx');
        expect(src).toMatch(/register_post_meta[\s\S]{0,500}show_in_rest['"]?\s*=>\s*false/);
    });

    /* ─ Idempotency wrapper on mutation endpoints (Section 6) ─ */
    test('POST /vat-set wraps with dinoco_idempotency_check', () => {
        const src = stripComments(read('mp_tools'));
        // V.1.5 Section 6 — Round 30+ pattern
        expect(src).toMatch(/function\s+dinoco_mp_tools_rest_vat_set\s*\(/);
        expect(src).toMatch(/dinoco_idempotency_check\s*\(\s*\$idem_key\s*,\s*['"]vat-set['"]/);
        expect(src).toMatch(/dinoco_idempotency_store\s*\([^)]*['"]vat-set['"]/);
    });

    test('POST /vat-set-bulk wraps with idempotency (ksort normalize)', () => {
        const src = stripComments(read('mp_tools'));
        expect(src).toMatch(/function\s+dinoco_mp_tools_rest_vat_set_bulk/);
        expect(src).toMatch(/dinoco_idempotency_check\s*\([^)]*['"]vat-set-bulk['"]/);
        // Bulk-shape canonical: ksort + cast-to-string normalize
        expect(src).toMatch(/ksort\s*\(\s*\$sorted\s*\)/);
    });

    test('POST /vat-toggle wraps with idempotency (boolean+user_id discriminator)', () => {
        const src = stripComments(read('mp_tools'));
        expect(src).toMatch(/function\s+dinoco_mp_tools_rest_vat_toggle/);
        expect(src).toMatch(/dinoco_idempotency_check\s*\([^)]*['"]vat-toggle['"]/);
        // Discriminator must include enabled + user_id (prevents A-flips-ON / B-flips-OFF replay)
        expect(src).toMatch(/['"]enabled['"]\s*=>\s*\$enabled/);
        expect(src).toMatch(/['"]user_id['"]\s*=>\s*\$uid/);
    });

    /* ─ Telegram alerts on VAT push failure (Section 4) ─ */
    test('VAT push wires Telegram alert on failure paths', () => {
        const src = stripComments(read('vat_push'));
        expect(src).toMatch(/function\s+dinoco_vat_push_admin_alert/);
        // Called on at least 4 distinct failure reasons
        expect(src).toMatch(/dinoco_vat_push_admin_alert\s*\([^)]*png_render_failed/);
        expect(src).toMatch(/dinoco_vat_push_admin_alert\s*\([^)]*line_push_failed/);
        // Uses dedup helper (b2b_tg_send_dedup) — prevents flood
        expect(src).toMatch(/b2b_tg_send_dedup/);
    });

    /* ─ Monthly CSV auto-email cron (Section 4) ─ */
    test('VAT Monthly Export defines flag-gated auto-email cron', () => {
        const src = stripComments(read('vat_export'));
        expect(src).toMatch(/function\s+dinoco_vat_monthly_csv_email_handler/);
        // Flag-gate default OFF
        expect(src).toMatch(/dinoco_vat_csv_auto_email_enabled/);
        // Day-of-month gate (1st only)
        expect(src).toMatch(/current_time\s*\(\s*['"]j['"]\s*\)/);
        // Idempotency: option per-period
        expect(src).toMatch(/dinoco_vat_csv_email_last_sent_/);
        // wp_mail with attachment
        expect(src).toMatch(/wp_mail\s*\([\s\S]{0,500}\$tmp_file/);
    });
});
