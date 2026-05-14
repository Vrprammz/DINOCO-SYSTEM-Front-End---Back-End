/**
 * Customer-Facing UX R3 Drift Detector — 2026-05-08
 *
 * Boss feedback "หน้า front end user แก้หรือยังไ" → ux-ui-expert audit caught
 * 5 CRITICAL bugs in customer flow that admin-side R3 hadn't covered. This
 * drift detector pins the fixes so future edits don't regress.
 *
 * Files audited + fixed:
 *   - [System] DINOCO Warranty Activation LIFF V.0.12 → V.0.13 (C1)
 *   - [System] Member Dashboard Main V.31.2 → V.31.3 (C2)
 *   - [System] Dashboard - Header & Forms V.31.3 → V.31.4 (C3 + C4 + C5)
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');

const FILES = {
    activation: '[System] DINOCO Warranty Activation LIFF',
    main:       '[System] Member Dashboard Main',
    header:     '[System] Dashboard - Header & Forms',
};

const read = (key) => fs.readFileSync(path.join(REPO_ROOT, FILES[key]), 'utf8');

describe('Customer-facing UX R3 fixes — 5 CRITICAL closed', () => {

    test('C1 — LIFF Activation: never expose PHP constant names to customer', () => {
        const code = read('activation');
        // Version header marker
        expect(code).toMatch(/V\.0\.13[\s\S]{0,200}?customer UX audit C1/);
        // Old technical error MUST be gone from code (only allowed in version-header
        // history annotation — strip comments to verify code path)
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');
        expect(stripped).not.toMatch(/Constant DINOCO_LINE_CHANNEL_ID/);
        expect(stripped).not.toMatch(/Constant DINOCO_LINE_REDIRECT_URI/);
        // NEW friendly card text
        expect(code).toMatch(/ระบบลงทะเบียนกำลังปรับปรุง/);
        // LINE Admin deep-link CTA
        expect(code).toMatch(/href="https:\/\/lin\.ee\/dinoco"/);
        expect(code).toMatch(/ส่ง S\/N ทาง LINE Admin/);
        // Server Telegram alert (defensive function_exists + Throwable)
        expect(code).toMatch(/function_exists\(\s*['"]b2b_tg_send_dedup['"]\s*\)/);
        expect(code).toMatch(/b2b_tg_send_dedup\(\s*['"]liff_constants_missing['"]/);
        expect(code).toMatch(/catch\s*\(\s*\\Throwable\s+\$tg_e\s*\)/);
        // Local vars used in alert payload match actual scope ($line_ch_id, $line_redir_uri)
        expect(code).toMatch(/empty\(\s*\$line_ch_id\s*\)/);
        expect(code).toMatch(/empty\(\s*\$line_redir_uri\s*\)/);
    });

    test('C2 — Member Dashboard register_serial DNCSS always routes to Activation', () => {
        const code = read('main');
        // V.31.3 version header marker
        expect(code).toMatch(/V\.31\.3[\s\S]{0,300}?C2/);
        // Flag-based skip pattern (replaces V.31.2 fall-through bug)
        expect(code).toMatch(/\$dinoco_skip_legacy_register_handler\s*=\s*false/);
        // Redirect to /warranty/activate happens for ALL non-current-owner DNCSS
        // (not gated by dinoco_sn_get_plate_data() returning object)
        expect(code).toMatch(/if\s*\(\s*!\s*\$dinoco_skip_legacy_register_handler\s*\)\s*\{[\s\S]{0,250}?warranty\/activate/);
        // Legacy block B respects the flag
        expect(code).toMatch(/empty\(\s*\$dinoco_skip_legacy_register_handler\s*\)/);
        // No `goto` jumps (clean control flow)
        expect(code).not.toMatch(/goto\s+end_register_serial_handler/);
    });

    test('C3 — Royal Warranty Upgrade hidden when user has no legacy CPT', () => {
        const code = read('header');
        // Version header marker
        expect(code).toMatch(/V\.31\.4[\s\S]{0,800}?C3/);
        // WP_Query detects legacy presence
        expect(code).toMatch(/\$has_legacy_warranty\s*=\s*false/);
        expect(code).toMatch(/'post_type'\s*=>\s*'serial_number'/);
        expect(code).toMatch(/'key'\s*=>\s*'owner_product'/);
        // Royal Upgrade is wrapped in conditional
        expect(code).toMatch(/<\?php if \(\s*\$has_legacy_warranty\s*\)\s*:\s*\?>[\s\S]{0,500}?royal-upgrade-btn[\s\S]{0,500}?<\?php endif;\s*\?>/);
    });

    test('C4 — 3-button quick action row REMOVED in V.31.10 (boss directive 2026-05-14)', () => {
        const code = read('header');
        // V.31.10 (2026-05-14): entire `.action-grid.dnc-sn-action-grid-4` div removed.
        // All 3 buttons (ลงทะเบียน/แจ้งเคลม/โอนสิทธิ์) duplicated bottom nav + green
        // scan CTA below. One scan path now lives in .search-box-wrap. Per-asset
        // claim/transfer in asset card overflow menu where they have plate context.
        const stripped = code
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        // Active markup MUST NOT contain the 3-button grid or its child handlers
        expect(stripped).not.toMatch(/<div class="action-grid dnc-sn-action-grid-4">/);
        expect(stripped).not.toMatch(/btn-claim-page[\s\S]{0,200}?window\.location\.href='\/claim-system\/'/);
        expect(stripped).not.toMatch(/btn-trans[\s\S]{0,200}?window\.location\.href='\/transfer-warranty'/);
        expect(stripped).not.toMatch(/window\.location\.href='\/claim'/);
        // Comments may still mention canonical URL for audit history
        expect(code).toMatch(/V\.31\.10[\s\S]{0,500}?3-button/);
    });

    test('C5 — Profile form has Thai-mobile-correct inputmode + autocomplete + pattern', () => {
        const code = read('header');
        // Phone field: tel inputmode + tel-national autocomplete + 10-digit pattern + maxlength
        expect(code).toMatch(/name="p_phone"[\s\S]{0,400}?inputmode="tel"[\s\S]{0,400}?autocomplete="tel-national"[\s\S]{0,400}?pattern="0\[0-9\]\{9\}"[\s\S]{0,400}?maxlength="10"/);
        // Zip field: numeric + postal-code + 5-digit pattern + maxlength
        expect(code).toMatch(/name="p_zip"[\s\S]{0,400}?inputmode="numeric"[\s\S]{0,400}?autocomplete="postal-code"[\s\S]{0,400}?pattern="\[0-9\]\{5\}"[\s\S]{0,400}?maxlength="5"/);
        // Name autocompletes
        expect(code).toMatch(/name="p_fname"[\s\S]{0,200}?autocomplete="given-name"/);
        expect(code).toMatch(/name="p_lname"[\s\S]{0,200}?autocomplete="family-name"/);
        // Address autocompletes
        expect(code).toMatch(/name="p_house"[\s\S]{0,200}?autocomplete="address-line1"/);
        expect(code).toMatch(/name="p_soi"[\s\S]{0,200}?autocomplete="address-line2"/);
        expect(code).toMatch(/name="p_province"[\s\S]{0,200}?autocomplete="address-level1"/);
        expect(code).toMatch(/name="p_district"[\s\S]{0,200}?autocomplete="address-level2"/);
        expect(code).toMatch(/name="p_subdist"[\s\S]{0,200}?autocomplete="address-level3"/);
        // Birth field has bday autocomplete
        expect(code).toMatch(/name="p_birth"[\s\S]{0,200}?autocomplete="bday"/);
        // S/N search input: inputmode=text + autocapitalize=characters + autocomplete=off
        expect(code).toMatch(/name="register_serial"[\s\S]{0,400}?inputmode="text"[\s\S]{0,400}?autocapitalize="characters"[\s\S]{0,400}?autocomplete="off"/);
        // S/N input pattern + maxlength
        expect(code).toMatch(/name="register_serial"[\s\S]{0,400}?pattern="\[A-Za-z0-9\]\{8,16\}"[\s\S]{0,400}?maxlength="16"/);
        // OLD pattern `[0-9]{9,10}` MUST be gone (allowed 9-digit which Thai mobiles never)
        const stripped = code
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        expect(stripped).not.toMatch(/pattern="\[0-9\]\{9,10\}"/);
    });
});
