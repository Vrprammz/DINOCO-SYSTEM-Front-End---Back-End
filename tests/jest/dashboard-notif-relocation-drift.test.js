/**
 * Notification Settings Relocation Drift Detector — Sprint 35 A2 D3 (2026-05-14)
 *
 * Boss directive: "ตั้งค่าการแจ้งเตือน มันควรไปอยู่ในโปรไฟล์ตั้งค่าไหมนะ"
 *
 * Notification preferences section moved FROM Home Dashboard (Header & Forms
 * accordion) TO Edit Profile V.35.0 as a canonical View/Edit toggle card.
 * Set-once-forget UX pattern (Facebook/LINE convention).
 *
 * This drift detector pins:
 *   • Edit Profile V.35.0 file + version + section marker
 *   • All 7 wp_usermeta keys read in PHP defaults block
 *   • 5 category toggle switches with role="switch" + aria-checked + data-meta
 *   • Quiet hours <input type="time"> × 2
 *   • Read-only §24 transactional notice
 *   • Danger zone with nuclear opt-out (red bg)
 *   • Save button uses data-action delegation (UX-H3 — NO inline onclick except
 *     the canonical View/Edit toggle pattern used by other sections)
 *   • AJAX action name + nonce name match canonical Header & Forms handler
 *   • URL hash #sec-notif auto-expand handler
 *   • View/Edit toggle reuses dinocoToggleEdit('notif')
 *   • Scoped CSS .d-notif-* defined
 *
 * Failure of any assertion = regression to old Home Dashboard accordion or
 * broken contract with the server-side dinoco_save_notif_prefs handler.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const EDIT_PROFILE_FILE = path.join(REPO_ROOT, '[System] DINOCO Edit Profile');

describe('Edit Profile V.35.0 — Notification Settings Relocation (Sprint 35 A2 D3)', () => {

    let code;
    beforeAll(() => {
        code = fs.readFileSync(EDIT_PROFILE_FILE, 'utf8');
    });

    test('Edit Profile file exists and is readable', () => {
        expect(code.length).toBeGreaterThan(1000);
    });

    test('Version header bumped to V.35.0 with D3 marker', () => {
        expect(code).toMatch(/\*\s*Version:\s*V\.35\.0\b/);
        expect(code).toMatch(/V\.35\.0\s*—\s*Sprint 35 A2 \(D3/);
    });

    test('Section card with id="sec-notif" exists', () => {
        expect(code).toMatch(/<div class="d-section-card" id="sec-notif">/);
    });

    test('Section header has 🔔 icon + label "การแจ้งเตือน" + edit button', () => {
        expect(code).toMatch(/<div class="d-section-label">การแจ้งเตือน<\/div>/);
        expect(code).toMatch(/onclick="dinocoToggleEdit\('notif'\)"/);
    });

    test('PHP reads all 5 category wp_usermeta keys', () => {
        const keys = [
            'dinoco_sn_notif_expiry',
            'dinoco_sn_notif_anniversary',
            'dinoco_sn_notif_review',
            'dinoco_sn_notif_service',
            'dinoco_sn_notif_promo',
        ];
        keys.forEach(k => {
            // Either as concat literal 'dinoco_sn_notif_' . $nk OR full string
            // Accept both patterns
            const suffix = k.replace('dinoco_sn_notif_', '');
            // We use prefix concat in PHP: 'dinoco_sn_notif_' . $nk
            // So check for both: full literal OR data-meta literal in HTML
            const fullLiteral = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            expect(code).toMatch(fullLiteral);
        });
    });

    test('PHP reads nuclear opt-out + quiet hours wp_usermeta keys', () => {
        expect(code).toMatch(/dinoco_line_opt_out_all/);
        expect(code).toMatch(/dinoco_sn_quiet_hours_start/);
        expect(code).toMatch(/dinoco_sn_quiet_hours_end/);
    });

    test('PHP fallback to admin defaults for quiet hours when user override empty', () => {
        expect(code).toMatch(/get_option\(\s*'dinoco_line_gov_quiet_start'/);
        expect(code).toMatch(/get_option\(\s*'dinoco_line_gov_quiet_end'/);
    });

    test('Defaults: review/anniversary/expiry ON; service/promo OFF', () => {
        // The defaults block has explicit '1' / '0' string defaults
        // We match the structure: 'expiry' => '1', 'service' => '0', 'promo' => '0'
        expect(code).toMatch(/'expiry'\s*=>\s*'1'/);
        expect(code).toMatch(/'anniversary'\s*=>\s*'1'/);
        expect(code).toMatch(/'review'\s*=>\s*'1'/);
        expect(code).toMatch(/'service'\s*=>\s*'0'/);
        expect(code).toMatch(/'promo'\s*=>\s*'0'/);
    });

    test('5 category switches with role="switch" + aria-checked + data-name + data-meta', () => {
        const categoryNames = [
            'notif_expiry',
            'notif_anniversary',
            'notif_review',
            'notif_service',
            'notif_promo',
        ];
        categoryNames.forEach(n => {
            const re = new RegExp(`data-name="${n}"`);
            expect(code).toMatch(re);
        });
        // Each switch has data-meta with the canonical wp_usermeta key
        expect(code).toMatch(/data-meta="dinoco_sn_notif_expiry"/);
        expect(code).toMatch(/data-meta="dinoco_sn_notif_anniversary"/);
        expect(code).toMatch(/data-meta="dinoco_sn_notif_review"/);
        expect(code).toMatch(/data-meta="dinoco_sn_notif_service"/);
        expect(code).toMatch(/data-meta="dinoco_sn_notif_promo"/);
        expect(code).toMatch(/data-meta="dinoco_line_opt_out_all"/);
    });

    test('All switches use role="switch" + aria-checked + aria-label', () => {
        // Count occurrences of role="switch" — should be 6 (5 categories + 1 nuclear)
        const matches = code.match(/role="switch"/g) || [];
        expect(matches.length).toBeGreaterThanOrEqual(6);
        // aria-checked present on switches
        expect(code).toMatch(/aria-checked="(true|false)"/);
    });

    test('Quiet hours uses <input type="time"> × 2 (not text + pattern)', () => {
        // Count <input type="time" ...> occurrences within the notif section
        // Should have 2 — quiet_start + quiet_end
        const timeInputs = code.match(/<input\s+type="time"/g) || [];
        expect(timeInputs.length).toBeGreaterThanOrEqual(2);
        expect(code).toMatch(/name="quiet_start"/);
        expect(code).toMatch(/name="quiet_end"/);
    });

    test('Read-only §24 transactional notice present', () => {
        expect(code).toMatch(/ข้อความที่ส่งเสมอ/);
        expect(code).toMatch(/PDPA §24/);
        expect(code).toMatch(/role="note"/);
    });

    test('Danger zone — nuclear opt-out with red styling + role="switch"', () => {
        expect(code).toMatch(/d-notif-danger/);
        expect(code).toMatch(/Danger zone/);
        expect(code).toMatch(/d-notif-switch-danger/);
        expect(code).toMatch(/data-type="nuclear"/);
        expect(code).toMatch(/หยุดการแจ้งเตือนทั้งหมด/);
    });

    test('Save button uses data-action delegation (UX-H3 compliant)', () => {
        expect(code).toMatch(/data-action="dnc-notif-save"/);
        expect(code).toMatch(/id="btn-save-notif"/);
        // No inline onclick on the save button (event delegation only)
        // Allow inline onclick for the dinocoToggleEdit row (canonical pattern)
        const saveBtnLine = code.match(/<button[^>]*id="btn-save-notif"[^>]*>/);
        expect(saveBtnLine).not.toBeNull();
        expect(saveBtnLine[0]).not.toMatch(/onclick=/);
    });

    test('AJAX uses canonical Header & Forms action + nonce names (no new endpoint)', () => {
        expect(code).toMatch(/dinoco_save_notif_prefs/);
        expect(code).toMatch(/wp_create_nonce\(\s*'dinoco_save_notif_prefs'/);
        expect(code).toMatch(/fd\.append\(\s*'action'\s*,\s*'dinoco_save_notif_prefs'\s*\)/);
        expect(code).toMatch(/_dnc_notif_nonce/);
    });

    test('AJAX submits via admin-ajax.php with same-origin credentials', () => {
        expect(code).toMatch(/admin_url\(\s*'admin-ajax\.php'\s*\)/);
        expect(code).toMatch(/credentials:\s*'same-origin'/);
    });

    test('URL hash #sec-notif auto-expand handler exists', () => {
        expect(code).toMatch(/window\.location\.hash\s*===\s*['"]#sec-notif['"]/);
        expect(code).toMatch(/scrollIntoView/);
        // Calls dinocoToggleEdit('notif') after delay
        expect(code).toMatch(/dinocoToggleEdit\(\s*['"]notif['"]\s*\)/);
        // Cleans hash from URL after expanding
        expect(code).toMatch(/history\.replaceState/);
    });

    test('View/Edit toggle reuses canonical dinocoToggleEdit("notif") pattern', () => {
        // Section markup must use the canonical onclick attr like other sections
        expect(code).toMatch(/onclick="dinocoToggleEdit\('notif'\)"/);
        // view-notif and edit-notif containers exist
        expect(code).toMatch(/id="view-notif"/);
        expect(code).toMatch(/id="edit-notif"/);
    });

    test('Nuclear cascade JS — disables category switches when opt-out ON', () => {
        expect(code).toMatch(/applyNuclearCascade/);
        expect(code).toMatch(/aria-disabled/);
        // Confirm modal before turning nuclear ON
        expect(code).toMatch(/window\.dinocoModal/);
        expect(code).toMatch(/dinocoModal\.confirm/);
    });

    test('Keyboard support: Space/Enter toggle switches', () => {
        // Handler checks ev.key against ' ' (Space) and 'Enter' to call .click() on switch
        expect(code).toMatch(/ev\.key[^\n]*' '/);
        expect(code).toMatch(/ev\.key[^\n]*'Enter'/);
        expect(code).toMatch(/'keydown'/);
    });

    test('Scoped CSS .d-notif-* tokens defined', () => {
        expect(code).toMatch(/\.d-notif-switch\b/);
        expect(code).toMatch(/\.d-notif-switch\[aria-checked="true"\]/);
        expect(code).toMatch(/\.d-notif-group\b/);
        expect(code).toMatch(/\.d-notif-danger\b/);
        expect(code).toMatch(/\.d-notif-notice\b/);
        expect(code).toMatch(/\.d-notif-time\b/);
    });

    test('iOS-style switch: 44×24 + 999px radius + ::after knob', () => {
        // Width 44px
        expect(code).toMatch(/\.d-notif-switch\b[\s\S]{0,400}width:\s*44px/);
        // Height 24px
        expect(code).toMatch(/\.d-notif-switch\b[\s\S]{0,400}height:\s*24px/);
        // Pill radius
        expect(code).toMatch(/border-radius:\s*999px/);
        // Knob via ::after
        expect(code).toMatch(/\.d-notif-switch::after/);
    });

    test('Touch target ≥44px enforced (min-height/min-width)', () => {
        // Switch min-width 44px declared
        expect(code).toMatch(/min-width:\s*44px/);
    });

    test('prefers-reduced-motion respected for switch transitions', () => {
        expect(code).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    });

    test('UX-H3: no inline onclick on switches themselves (event delegation)', () => {
        // Each switch button must NOT have an inline onclick — delegated via card.addEventListener
        // Match all .d-notif-switch buttons and ensure none have onclick attr
        const switchBlocks = code.match(/<button[^>]*class="d-notif-switch[^"]*"[^>]*>/g) || [];
        expect(switchBlocks.length).toBeGreaterThanOrEqual(6);
        switchBlocks.forEach(blk => {
            expect(blk).not.toMatch(/onclick=/);
        });
    });

    test('Status div uses role="status" + aria-live="polite"', () => {
        expect(code).toMatch(/id="d-notif-status"/);
        expect(code).toMatch(/role="status"/);
        expect(code).toMatch(/aria-live="polite"/);
    });

    test('Section placement: AFTER motorcycle section (sec-moto), BEFORE PDPA card', () => {
        // Use markup-only matches (skip header comment prose) by anchoring on
        // <div class="d-section-card" id="sec-...">
        const motoIdx = code.indexOf('<div class="d-section-card" id="sec-moto">');
        // Header comment also mentions the marker — use lastIndexOf to skip prose
        const notifIdx = code.lastIndexOf('<div class="d-section-card" id="sec-notif">');
        const pdpaIdx = code.indexOf('ความยินยอม (PDPA)');
        expect(motoIdx).toBeGreaterThan(-1);
        expect(notifIdx).toBeGreaterThan(motoIdx);
        expect(pdpaIdx).toBeGreaterThan(notifIdx);
    });

    test('Form contract: notif inputs do NOT carry profile-form fields (only AJAX)', () => {
        // The notif section's switches are <button>s, not <input name="...">,
        // so accidental submission of the outer profile form won't post them.
        // Only the quiet_start + quiet_end inputs exist as real inputs.
        // Verify: no <input name="notif_*"> inside the section
        const notifBlock = code.substring(
            code.indexOf('id="sec-notif"'),
            code.indexOf('<!-- ═══ SAVE BUTTON')
        );
        expect(notifBlock).not.toMatch(/<input[^>]+name="notif_[^"]+"/);
        // But quiet_start and quiet_end ARE inputs
        expect(notifBlock).toMatch(/<input[^>]+name="quiet_start"/);
        expect(notifBlock).toMatch(/<input[^>]+name="quiet_end"/);
    });

    test('JS submit collects only checked switches as form data', () => {
        // dinocoNotifSubmit walks switches and appends only those aria-checked=true
        expect(code).toMatch(/aria-checked['"]\s*\)\s*===\s*['"]true['"]/);
        expect(code).toMatch(/fd\.append\(\s*name\s*,\s*['"]1['"]\s*\)/);
    });

    test('Confirmation modal uses Modal Helpers fallback to native confirm', () => {
        expect(code).toMatch(/window\.dinocoModal/);
        // Try/catch wrapper present
        expect(code).toMatch(/try\s*\{[\s\S]*?window\.dinocoModal[\s\S]*?\}\s*catch/);
        // Native confirm fallback
        expect(code).toMatch(/window\.confirm/);
    });

    test('Save button has Thai label "บันทึกการแจ้งเตือน"', () => {
        expect(code).toMatch(/บันทึกการแจ้งเตือน/);
    });
});
