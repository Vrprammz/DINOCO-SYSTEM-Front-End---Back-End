/**
 * Customer-Facing UX Phase 8 Bundle A Drift Detector — 2026-05-08
 *
 * Boss approved BUNDLE A (highest ROI + lowest risk):
 *   S1 — Asset card actions overflow (1 state-driven CTA + ⋯ overflow)
 *   S4 — Already-registered anti-fraud trust signals (masked owner + red panel)
 *   S6 — Notification settings collapsed-default CSS guard
 *   S9 — Empty assets state hero CTA (first-time onboarding)
 *   S10 — lang="th" on dashboard wrapper (a11y free win)
 *
 * Drift detector pins each fix so future edits don't regress.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');

const FILES = {
    activation: '[System] DINOCO Warranty Activation LIFF',
    main:       '[System] Member Dashboard Main',
    header:     '[System] Dashboard - Header & Forms',
    assets:     '[System] Dashboard - Assets List',
};

const read = (key) => fs.readFileSync(path.join(REPO_ROOT, FILES[key]), 'utf8');

describe('Customer-facing UX Phase 8 Bundle A — 5 SHOULD-FIX closed', () => {

    test('S10 — Member Dashboard wrapper has lang="th" attribute', () => {
        const code = read('main');
        expect(code).toMatch(/V\.31\.4[\s\S]{0,400}?S10/);
        expect(code).toMatch(/<div class="dinoco-wrapper"\s+lang="th">/);
    });

    test('S6 — Notification settings has collapse CSS + smooth transition', () => {
        const code = read('header');
        // Version header marker
        expect(code).toMatch(/V\.31\.5[\s\S]{0,500}?S6/);
        // Body hidden by default (max-height:0)
        expect(code).toMatch(/\.dnc-sn-notif-settings \.dnc-sn-notif-body\s*\{[\s\S]{0,200}?max-height:\s*0/);
        // Body expanded when data-open="1"
        expect(code).toMatch(/\.dnc-sn-notif-settings\[data-open="1"\] \.dnc-sn-notif-body\s*\{[\s\S]{0,200}?max-height:\s*\d+/);
        // Toggle arrow rotates 180deg when open
        expect(code).toMatch(/\.dnc-sn-notif-settings\[data-open="1"\] \.dnc-sn-notif-toggle\s*\{[\s\S]{0,100}?transform:\s*rotate\(180deg\)/);
        // prefers-reduced-motion respected
        expect(code).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,300}?dnc-sn-notif/);
    });

    test('S4 — Already-registered state has masked owner + anti-fraud panel', () => {
        const code = read('activation');
        // Version header marker
        expect(code).toMatch(/V\.0\.14[\s\S]{0,600}?S4/);
        // Masked owner logic
        expect(code).toMatch(/owner_masked/);
        expect(code).toMatch(/mb_substr\(\s*\$first,\s*0,\s*1/);
        expect(code).toMatch(/mb_substr\(\s*\$last,\s*0,\s*1/);
        // Anti-fraud red panel copy
        expect(code).toMatch(/🚨 หากคุณเพิ่งซื้อสินค้าใหม่/);
        expect(code).toMatch(/ของปลอม.*ถูกขโมย/);
        // Red CTA "รายงานสินค้าน่าสงสัย" + LINE Admin deep-link
        expect(code).toMatch(/รายงานสินค้าน่าสงสัย/);
        expect(code).toMatch(/line\.me\/R\/oaMessage\/@dinoco[\s\S]{0,500}?รายงานสินค้าน่าสงสัย/);
        // Registration date formatting (Thai short month)
        expect(code).toMatch(/wp_date\(\s*['"]j M Y['"]/);
    });

    test('S9 — Empty assets state has prominent hero CTA (not small dashed box)', () => {
        const code = read('assets');
        // Version header marker
        expect(code).toMatch(/V\.31\.4[\s\S]{0,500}?S9/);
        // Green gradient hero with strong copy
        expect(code).toMatch(/linear-gradient\(135deg,\s*#06C755[\s\S]{0,400}?ลงทะเบียนสินค้าชิ้นแรก/);
        // Benefit copy
        expect(code).toMatch(/รับประกันฟรี 1 ปี/);
        // 30-second micro-copy
        expect(code).toMatch(/ใช้เวลา 30 วินาที/);
        // Secondary CTA for legacy plastic card holders
        expect(code).toMatch(/มีบัตรพลาสติก DINOCO เก่า/);
        expect(code).toMatch(/href="\/legacy-migration"/);
        // OLD small dashed box copy MUST be gone from active code
        const stripped = code
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        expect(stripped).not.toMatch(/border:2px dashed #cbd5e1[\s\S]{0,400}?ยังไม่มีสินค้าลงทะเบียน/);
    });

    test('S1 — Asset card has SINGLE state-driven primary CTA + unified overflow', () => {
        const code = read('assets');
        // Phase 8 S1 version header marker
        expect(code).toMatch(/Phase 8[\s\S]{0,400}?S1[\s\S]{0,400}?state-driven primary CTA/);
        // State→CTA mapping in PHP
        expect(code).toMatch(/\$primary_cta_label/);
        expect(code).toMatch(/\$primary_cta_href/);
        expect(code).toMatch(/\$primary_cta_onclick/);
        // 6 states handled (active/near_expiry/expired/claimed/stolen/pending_verification)
        expect(code).toMatch(/if\s*\(\s*\$is_stolen\s*\)[\s\S]{0,300}?ติดต่อแอดมิน/);
        expect(code).toMatch(/elseif\s*\(\s*\$is_claimed\s*\)[\s\S]{0,300}?ติดตามเคลม/);
        expect(code).toMatch(/elseif\s*\(\s*\$is_expired\s*\)[\s\S]{0,300}?ขอข้อมูลซ่อม/);
        expect(code).toMatch(/elseif\s*\(\s*\$card_state\s*===\s*['"]near_expiry['"]\s*\)[\s\S]{0,300}?ต่อประกันก่อนหมด/);
        expect(code).toMatch(/elseif\s*\(\s*\$card_state\s*===\s*['"]pending_verification['"]\s*\)/);
        // Primary CTA wrapper (single button, full-width)
        expect(code).toMatch(/dnc-sn-asset-card-primary-cta/);
        // Old 3-button row CSS class removed from active code (only in comments)
        const stripped = code
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        // The old `dnc-sn-asset-card-quick-actions-3` div wrapper should NOT be
        // rendered anymore. CSS class may still exist for backward-compat but
        // no active <div class="...quick-actions...> in render path.
        expect(stripped).not.toMatch(/<div class="dnc-sn-asset-card-quick-actions dnc-sn-asset-card-quick-actions-3"/);
        // Overflow menu now has more items including เปิดเคลม + โอนสิทธิ์ (used to be primary)
        expect(code).toMatch(/data-action="claim"[\s\S]{0,400}?เปิดเคลม/);
        expect(code).toMatch(/data-action="transfer"[\s\S]{0,400}?โอนสิทธิ์/);
        // Overflow toggle label updated
        expect(code).toMatch(/⋯ ตัวเลือกอื่นๆ/);
    });
});
