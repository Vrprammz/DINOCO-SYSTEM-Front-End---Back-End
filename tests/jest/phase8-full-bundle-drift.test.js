/**
 * Phase 8 Full Bundle Drift Detector — 2026-05-08
 *
 * Boss approved "ทั้งหมด เลือกทางที่ดีที่สุด" → 4 commits shipped:
 *   Commit 1 — Customer Polish A: NH10 + NH4 + S3 + NH6 + NH9
 *   Commit 2 — Customer Polish B: S2 + NH3 + S7 + S8
 *   Commit 3 — Mission Control: M1 + M2
 *   Commit 4 — S5 Gateway consolidate
 *
 * This drift detector pins all Phase 8 fixes together so future edits don't
 * regress to redundant + buggy state.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const FILES = {
    activation: '[System] DINOCO Warranty Activation LIFF',
    main:       '[System] Member Dashboard Main',
    header:     '[System] Dashboard - Header & Forms',
    assets:     '[System] Dashboard - Assets List',
    admin:      '[Admin System] DINOCO Admin Dashboard',
};
const read = (key) => fs.readFileSync(path.join(REPO_ROOT, FILES[key]), 'utf8');

describe('Phase 8 Full Bundle — 13 items shipped (boss-approved auto mode)', () => {

    // ── Commit 1: Customer Polish A ──

    test('Commit 1 NH10 — Member Dashboard theme-color meta hooked on wp_head', () => {
        const code = read('main');
        expect(code).toContain('dinoco_dashboard_inject_theme_color');
        expect(code).toMatch(/add_action\(\s*['"]wp_head['"],\s*['"]dinoco_dashboard_inject_theme_color['"],\s*1\s*\)/);
        expect(code).toMatch(/meta name="theme-color" content="#06C755"/);
        expect(code).toMatch(/meta name="theme-color" content="#047857"/);
    });

    test('Commit 1 NH4 — Assets List dncSnExtendWarranty uses dinocoModal', () => {
        const code = read('assets');
        expect(code).toMatch(/window\.dinocoModal\s*&&\s*window\.dinocoModal\.alert[\s\S]{0,400}?title:\s*['"]🎁 ต่อประกัน/);
    });

    test('Commit 1 S3 — Banner carousel rendered when ≥2 banners', () => {
        const code = read('main');
        expect(code).toContain('dnc-sn-banners-carousel');
        expect(code).toContain('dnc-sn-banners-track');
        expect(code).toContain('dnc-sn-banners-dots');
        expect(code).toMatch(/scroll-snap-type:\s*x mandatory/);
        expect(code).toContain('dncSnBannerScrollTo');
        expect(code).toContain('setupBannerCarousel');
        // IntersectionObserver sync
        expect(code).toMatch(/new IntersectionObserver/);
    });

    test('Commit 1 NH6 — PDPA trust bar at bottom of dashboard', () => {
        const code = read('main');
        expect(code).toContain('dnc-trust-bar');
        expect(code).toMatch(/🛡️ ปกป้องด้วย PDPA/);
        expect(code).toMatch(/🔒 เข้ารหัสข้อมูล SSL/);
        expect(code).toMatch(/href="https:\/\/lin\.ee\/dinoco"/);
    });

    test('Commit 1 NH9 — Activation success state has CSS confetti animation', () => {
        const code = read('activation');
        expect(code).toContain('dnc-sn-confetti-container');
        expect(code).toContain('dnc-sn-confetti');
        expect(code).toMatch(/@keyframes dnc-sn-confetti-fall/);
        // 24 pieces
        expect(code).toMatch(/ci\s*<\s*24/);
        // 6-color palette
        expect(code).toMatch(/colors\s*=\s*\['#06C755'/);
        // Cleanup after 2.5s
        expect(code).toMatch(/setTimeout\([\s\S]{0,200}?confetti-container[\s\S]{0,100}?2500\)/);
        // prefers-reduced-motion respect
        expect(code).toMatch(/prefers-reduced-motion[\s\S]{0,200}?dnc-sn-confetti/);
    });

    // ── Commit 2: Customer Polish B ──

    test('Commit 2 S2 — Tier badge is button with aria-expanded + onclick toggle', () => {
        const code = read('header');
        expect(code).toMatch(/<button type="button" class="dnc-sn-tier-badge[\s\S]{0,200}?onclick="dncSnToggleTierTooltip\(this\)"/);
        expect(code).toContain('window.dncSnToggleTierTooltip');
    });

    test('Commit 2 NH3 — Tier ladder tooltip with progress bar + thresholds', () => {
        const code = read('header');
        expect(code).toContain('dnc-tier-tooltip');
        // Thresholds present
        expect(code).toMatch(/Bronze\s*<฿5K/);
        expect(code).toMatch(/Silver ฿5-20K/);
        expect(code).toMatch(/Gold ฿20-50K/);
        expect(code).toMatch(/Platinum ฿50-100K/);
        expect(code).toMatch(/Diamond ฿100K\+/);
        // Progress bar
        expect(code).toMatch(/linear-gradient\(90deg,#06C755,#10b981\)/);
        // "อีก ฿X ขึ้น" copy
        expect(code).toMatch(/อีก <strong[\s\S]{0,200}?ขึ้น <strong>/);
        // Diamond cap copy
        expect(code).toMatch(/คุณคือลูกค้า Diamond — สูงสุดแล้ว/);
        // Click-outside close
        expect(code).toMatch(/document\.addEventListener\('click'[\s\S]{0,300}?data-open[\s\S]{0,300}?'0'/);
    });

    test('Commit 2 S7 — Buddhist year helper on activation date picker', () => {
        const code = read('activation');
        expect(code).toMatch(/onchange="dncSnUpdateBuddhistYear\(this\)"/);
        expect(code).toContain('dncSnUpdateBuddhistYear');
        // 543-year offset
        expect(code).toMatch(/year \+ 543/);
        // Thai month abbreviations
        expect(code).toMatch(/thaiMonths\s*=\s*\['ม\.ค\.'/);
        // "✓ พ.ศ." confirmation prefix
        expect(code).toMatch(/✓ พ\.ศ\./);
    });

    test('Commit 2 S8 — Form abandonment recovery via localStorage', () => {
        const code = read('activation');
        // localStorage key with SN-scoped suffix
        expect(code).toMatch(/dnc_sn_activate_draft_/);
        // 1-day TTL
        expect(code).toMatch(/TTL_MS\s*=\s*24 \* 60 \* 60 \* 1000/);
        // Debounced auto-save
        expect(code).toMatch(/saveTimer\s*=\s*setTimeout\(saveDraft,\s*500\)/);
        // Restore banner copy
        expect(code).toMatch(/💾 คืนค่าที่กรอกไว้/);
        // Clear on success (already in V.0.15)
        expect(code).toMatch(/localStorage\.removeItem\(draftKey\)/);
    });

    // ── Commit 3: Mission Control M1 + M2 ──

    test('Commit 3 M1 — MTD revenue + trend % returned by extended endpoint', () => {
        const code = read('admin');
        expect(code).toContain('mtd_revenue_thb');
        expect(code).toContain('mtd_trend_pct');
        expect(code).toContain('last_mtd_revenue_thb');
        // Same-period last-month comparison
        expect(code).toMatch(/current_time\(\s*['"]j['"]\s*\)/);
        // _order_source manual_invoice exclusion (prevent double-count)
        expect(code).toMatch(/pm_src\.meta_value\s*!=\s*'manual_invoice'/);
    });

    test('Commit 3 M1 — Frontend Hero MTD trend renders with auto-color arrow', () => {
        const code = read('admin');
        // Trend arrow logic
        expect(code).toMatch(/trendArrow\s*=\s*trendPct\s*>\s*0\s*\?\s*['"]📈['"]/);
        // Color logic
        expect(code).toMatch(/trendColor\s*=\s*trendPct\s*>\s*0\s*\?\s*['"]#10b981['"]/);
        // Renders in #hero-revenue-mtd
        expect(code).toMatch(/\$\(['"]#hero-revenue-mtd['"]\)\.html\(/);
    });

    test('Commit 3 M2 — 7-day Sales Trend chart container replaces Inventory Pie', () => {
        const code = read('admin');
        // New chart container
        expect(code).toContain('chart-sales-trend');
        expect(code).toMatch(/ยอดขาย 7 วันล่าสุด/);
        // Render function
        expect(code).toContain('renderSalesTrend');
        // ApexCharts area chart
        expect(code).toMatch(/series:\s*\[\{\s*name:\s*['"]ยอดขาย['"]/);
        // Y-axis ฿k/m formatter
        expect(code).toMatch(/return\s*['"]฿['"]\s*\+\s*\(v\/1000000\)\.toFixed/);
        // Avg-line annotation
        expect(code).toMatch(/annotations:[\s\S]{0,400}?ค่าเฉลี่ย/);
        // Old chart-inv-pie container hidden (not removed — preserves render fn for future)
        expect(code).toMatch(/<div id="chart-inv-pie" style="display:none;"/);
    });

    test('Commit 3 M2 — Backend returns sales_trend_7d array', () => {
        const code = read('admin');
        expect(code).toContain('sales_trend_7d');
        // 7-day loop
        expect(code).toMatch(/\$i\s*=\s*6;\s*\$i\s*>=\s*0;\s*\$i--/);
        // Returns date + label + revenue per item
        expect(code).toMatch(/'date'[\s\S]{0,100}?'label'[\s\S]{0,100}?'revenue'/);
    });

    // ── Commit 4: S5 Gateway consolidate ──

    test('Commit 4 S5 — Activation LIFF redirects to Gateway when no SN + not logged in', () => {
        const code = read('activation');
        // V.0.17 marker
        expect(code).toMatch(/V\.0\.17[\s\S]{0,400}?S5 Gateway consolidate/);
        // Flag-controlled redirect
        expect(code).toMatch(/dinoco_sn_consolidate_with_gateway/);
        // Filter for opt-out (staging/testing)
        expect(code).toMatch(/apply_filters\(\s*['"]dinoco_sn_activate_no_sn_redirect['"]/);
        // Page existence check (no redirect to 404)
        expect(code).toMatch(/get_page_by_path\(\s*['"]gateway['"]\s*\)/);
        // wp_safe_redirect
        expect(code).toMatch(/wp_safe_redirect\(\s*\$gateway_url/);
    });
});
