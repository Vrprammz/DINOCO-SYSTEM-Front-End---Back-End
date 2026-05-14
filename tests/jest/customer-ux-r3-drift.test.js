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

    test('C4 — Direction A V.31.14: action row + S/N input + notif accordion all DELETED', () => {
        const code = read('header');
        // V.31.14 Sprint 36 (ux-ui-expert audit): Direction A consolidation.
        // Bottom nav (Global App Menu L624/631/640) is canonical surface for
        // claim/SCAN/transfer. Manual S/N entry lives in FAB SCAN modal.
        // Notification accordion moved to Edit Profile V.35.0 #sec-notif.
        const stripped = code
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<\?php[\s\S]*?\?>/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        // Active code MUST NOT contain any of the deleted blocks
        expect(stripped).not.toMatch(/<div class="dnc-dash-quick-actions"/);
        expect(stripped).not.toMatch(/dnc-dash-quick-card--claim/);
        expect(stripped).not.toMatch(/dnc-dash-quick-card--transfer/);
        expect(stripped).not.toMatch(/dnc-dash-quick-card--scan/);
        expect(stripped).not.toMatch(/<div class="search-box-wrap">/);
        expect(stripped).not.toMatch(/class="search-form-flex"/);
        expect(stripped).not.toMatch(/class="dinoco-input-search"/);
        expect(stripped).not.toMatch(/<div class="dnc-sn-notif-settings"/);
        expect(stripped).not.toMatch(/btn-reg/);
        // Notif relocated to Profile — thin link row replaces accordion
        expect(stripped).toMatch(/<a[^>]*href="\/edit-profile\/#sec-notif"[^>]*dnc-notif-link-row/);
        // SCAN delegation handler retained (FAB modal future surfaces)
        expect(code).toContain('dinocoScanFirstQr');
    });

    test('V.31.14 — Logo PNG RESTORED (wordmark pivot reverted per boss)', () => {
        const code = read('header');
        const stripped = code
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<\?php[\s\S]*?\?>/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
        // V.31.14 — PNG restored at canonical CDN URL with very small size cap
        expect(stripped).toMatch(/<img[^>]*src="https:\/\/www\.dinoco\.in\.th\/wp-content\/uploads\/2026\/01\/sss\.png"[^>]*class="card-title-mark"/);
        expect(stripped).toMatch(/alt="DINOCO"/);
        // Wordmark span GONE from active code
        expect(stripped).not.toMatch(/<span class="card-title-wordmark">/);
        // Final size: height 14px + max-width 80px abs cap
        expect(code).toMatch(/\.card-title-mark[\s\S]*?height:\s*14px/);
        expect(code).toMatch(/\.card-title-mark[\s\S]*?max-width:\s*80px/);
        // <360px: 12px / 65px
        expect(code).toMatch(/\.card-title-mark\s*\{\s*height:\s*12px;?\s*max-width:\s*65px/);
    });

    test('V.31.14 — Scan delegation handler retained (FAB modal future surfaces)', () => {
        const code = read('header');
        // Handler kept even after action row deletion — used by Global App Menu
        // bottom nav FAB SCAN modal + any future scan entry points
        expect(code).toContain('dinocoScanFirstQr');
        expect(code).toMatch(/__dncScanDelegationWired/);
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
        // V.31.14: S/N input form REMOVED from home dashboard (Direction A —
        // canonical surface = FAB SCAN modal manual entry in Global App Menu).
        // OLD pattern `[0-9]{9,10}` MUST be gone (allowed 9-digit which Thai mobiles never)
        const stripped = code
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<\?php[\s\S]*?\?>/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        expect(stripped).not.toMatch(/pattern="\[0-9\]\{9,10\}"/);
        // register_serial input MUST be gone (relocated to Global App Menu modal)
        expect(stripped).not.toMatch(/name="register_serial"/);
    });
});
