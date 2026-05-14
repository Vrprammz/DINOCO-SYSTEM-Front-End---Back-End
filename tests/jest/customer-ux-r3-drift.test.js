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

    test('C3 — V.31.15 REVERTED: Royal Warranty Upgrade always visible (boss B)', () => {
        // V.31.3 R3 C3 gated the button behind $has_legacy_warranty WP_Query.
        // V.31.15 boss directive B: revert to always-visible (pre-V.31.4 behavior).
        // New users may still bring plastic cards in; gating caused confusion when
        // multi-user admin compared two accounts and saw inconsistent UI.
        const code = read('header');
        const stripped = code
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<\?php[\s\S]*?\?>/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        // Button markup always rendered (no conditional wrapper)
        expect(stripped).toMatch(/royal-upgrade-btn/);
        // Conditional + WP_Query GONE from active PHP
        expect(code).not.toMatch(/\$has_legacy_warranty\s*=\s*\$legacy_q->have_posts/);
        expect(code).not.toMatch(/<\?php if \(\s*\$has_legacy_warranty\s*\)\s*:/);
        // V.31.15 audit trail
        expect(code).toMatch(/V\.31\.15[\s\S]{0,500}?Royal Warranty/);
    });

    test('C4 — V.31.15 RESTORE 3-card action row (boss "แถบเมนูหายไปหมด")', () => {
        // V.31.14 Direction A deleted action row. V.31.15 restored FULL 3 cards
        // per boss: 📷 ลงทะเบียน + 🔧 แจ้งเคลม + 🤝 โอนสิทธิ์. ลงทะเบียน is intentionally
        // a visible duplicate of FAB SCAN (boss explicit). Search-box-wrap stays
        // deleted (manual S/N entry in FAB modal). Notif relocated to Profile.
        const code = read('header');
        const stripped = code
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<\?php[\s\S]*?\?>/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        // 3-card row markup
        expect(stripped).toMatch(/<div class="dnc-dash-quick-actions"/);
        expect(stripped).toMatch(/dnc-dash-quick-card--register/);
        expect(stripped).toMatch(/dnc-dash-quick-card--claim/);
        expect(stripped).toMatch(/dnc-dash-quick-card--transfer/);
        // UX-H3: no inline onclick (data-action delegation)
        expect(stripped).not.toMatch(/dnc-dash-quick-card[^>]*onclick=/);
        // Search-box-wrap + notif accordion stay DELETED
        expect(stripped).not.toMatch(/<div class="search-box-wrap">/);
        expect(stripped).not.toMatch(/<div class="dnc-sn-notif-settings"/);
        // V.31.16 — notif link REMOVED (settings ONLY in Profile via bottom nav)
        expect(stripped).not.toMatch(/<a[^>]*href="\/edit-profile\/#sec-notif"/);
        expect(code).toContain('dinocoScanFirstQr');
    });

    test('V.31.15 — Logo PNG further shrunk 50% (boss "เล็กกว่านี้ 50%")', () => {
        const code = read('header');
        const stripped = code
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<\?php[\s\S]*?\?>/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
        expect(stripped).toMatch(/<img[^>]*src="https:\/\/www\.dinoco\.in\.th\/wp-content\/uploads\/2026\/01\/sss\.png"[^>]*class="card-title-mark"/);
        expect(stripped).not.toMatch(/<span class="card-title-wordmark">/);
        // V.31.15 — half of V.31.14: height 7px / max-width 40px
        expect(code).toMatch(/\.card-title-mark[\s\S]*?height:\s*14px/);
        expect(code).toMatch(/\.card-title-mark[\s\S]*?max-width:\s*100px/);
        // <360px mobile responsive (V.31.16 selector chain — comma-separated)
        expect(code).toMatch(/@media \(max-width: 360px\)[\s\S]{0,500}?height:\s*12px/);
        expect(code).toMatch(/@media \(max-width: 360px\)[\s\S]{0,500}?max-width:\s*80px/);
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
