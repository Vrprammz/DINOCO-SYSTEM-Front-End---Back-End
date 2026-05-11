/**
 * Admin Dashboard Mission Control Drift Detector — V.35.0 (2026-05-08)
 *
 * Boss feedback "UX หน้า Home ก็ยังแย่" + "ออกแบบให้ดีอย่าให้ซ้ำซ้อน" →
 * ux-ui-expert agent audit 5 CRITICAL findings → unified Phase 7 redesign.
 *
 * This drift detector pins the anti-redundancy contract:
 *   • Hero strip (3 cards, no duplication with Today's Queue)
 *   • Today's Queue = single source of truth for ALL pending work
 *   • Quick Actions = non-duplicate shortcuts (NOT switchTab duplicates of sidebar)
 *   • Removed: 8-card KPI Grid + 3-card Stat Grid + Alert Bar + duplicate Quick Actions row
 *
 * Failure of any assertion = regression to redundant state. Update baseline + comment
 * explaining intentional design change before re-asserting.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DASHBOARD_FILE = path.join(REPO_ROOT, '[Admin System] DINOCO Admin Dashboard');

describe('Admin Dashboard — Mission Control Home Redesign V.35.0', () => {

    let code;
    beforeAll(() => {
        code = fs.readFileSync(DASHBOARD_FILE, 'utf8');
    });

    test('Version header bumped to V.35.0 with Mission Control marker', () => {
        expect(code).toMatch(/Version:\s+V\.35\.0.*Mission Control/);
    });

    // ── Hero Strip (3 cards) ──
    test('Hero strip has 3 cards: revenue, tasks, approvals', () => {
        expect(code).toContain('dnc-home-hero');
        expect(code).toContain('dnc-hero-revenue');
        expect(code).toContain('dnc-hero-tasks');
        expect(code).toContain('dnc-hero-approvals');
        // ID hooks for JS render
        expect(code).toContain('id="hero-revenue-today"');
        expect(code).toContain('id="hero-tasks-total"');
        expect(code).toContain('id="hero-approvals-total"');
    });

    test('Hero revenue card clicks to finance tab', () => {
        expect(code).toMatch(/dnc-hero-revenue.*onclick="switchTab\(['"]finance['"]\)/);
    });

    test('Hero pulse animation respects prefers-reduced-motion', () => {
        expect(code).toMatch(/@keyframes dnc-pulse/);
        expect(code).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    });

    // ── Today's Queue (extended Action Center) ──
    test('Today\'s Queue renders unified pending list with NEW V.35.0 sources', () => {
        // Existing pre-V.35.0 sources still there
        expect(code).toMatch(/d\.b2b_pending[\s\S]{0,400}?ออเดอร์ B2B รอกดรับ/);
        expect(code).toMatch(/d\.claims_pending[\s\S]{0,400}?เคลมรออนุมัติ/);
        expect(code).toMatch(/d\.legacy_pending[\s\S]{0,400}?Legacy/);
        // NEW V.35.0 — must appear in buildActionCenter
        expect(code).toMatch(/bo_pending_review/);
        expect(code).toMatch(/b2f_pending_confirm/);
        expect(code).toMatch(/b2f_pending_receive/);
        expect(code).toMatch(/b2f_pending_payment/);
        expect(code).toMatch(/sn_4eyes_pending/);
        expect(code).toMatch(/sn_batch_in_flight/);
        expect(code).toMatch(/slip_pending_review/);
    });

    test('Action Center has positive empty state (not blank)', () => {
        expect(code).toMatch(/ไม่มีงานค้าง — เก่งมาก/);
    });

    test('Each Today\'s Queue source has tab deep-link OR ext URL', () => {
        // Sample 5 new sources to verify tab field present in their items.push() entry
        const SOURCES = ['bo_pending_review', 'b2f_pending_confirm', 'sn_4eyes_pending', 'slip_pending_review', 'sn_batch_in_flight'];
        SOURCES.forEach(function(source) {
            // Find the items.push line for this source (looser regex — just look for items.push within 300 chars of source ref)
            const sourceIdx = code.indexOf('d.' + source + ' > 0');
            expect(sourceIdx).toBeGreaterThan(-1);
            // Look for tab: or ext: within next 500 chars
            const slice = code.substring(sourceIdx, sourceIdx + 500);
            expect(slice).toMatch(/tab:\s*'/);
        });
    });

    // ── Quick Actions (anti-redundancy) ──
    test('Quick Actions has 6 non-duplicate shortcuts (not sidebar dupes)', () => {
        const QUICK_ACTION_HANDLERS = [
            'dncHomeQuickInvoice',
            'dncHomeQuickSnBatch',
            'dncHomeQuickSnReceive',
            'dncHomeQuickB2fConfirm',
            'dncHomeQuickClaim',
            'dncHomeQuickSlipReview',
        ];
        QUICK_ACTION_HANDLERS.forEach(function(handler) {
            expect(code).toContain('window.' + handler);
            expect(code).toMatch(new RegExp('onclick="' + handler + '\\('));
        });
    });

    test('Quick Action handlers route via sessionStorage handoff (not just switchTab)', () => {
        // Boss directive "ออกแบบให้ดีอย่าให้ซ้ำซ้อน" — each handler MUST do >1 thing.
        // Counter-example would be `function() { switchTab('x'); }` alone.
        const handlers = ['dncHomeQuickInvoice', 'dncHomeQuickSnBatch', 'dncHomeQuickSnReceive',
                          'dncHomeQuickB2fConfirm', 'dncHomeQuickClaim', 'dncHomeQuickSlipReview'];
        handlers.forEach(function(name) {
            const fn = code.match(new RegExp('window\\.' + name + '\\s*=\\s*function\\(\\)\\s*\\{[\\s\\S]{0,400}?\\};'));
            expect(fn).not.toBeNull();
            // Each handler must include sessionStorage write (intra-tab handoff)
            expect(fn[0]).toMatch(/sessionStorage\.setItem/);
        });
    });

    test('Conditional disable: ✅ Confirm PO + 💸 Replay disabled when 0 pending', () => {
        expect(code).toContain('id="qa-b2f-confirm"');
        expect(code).toContain('id="qa-slip-review"');
        expect(code).toMatch(/\$\(['"]#qa-b2f-confirm['"]\)\.prop\(['"]disabled['"]/);
        expect(code).toMatch(/\$\(['"]#qa-slip-review['"]\)\.prop\(['"]disabled['"]/);
    });

    // ── Removed redundant rows ──
    test('OLD 8-card KPI Grid REMOVED (replaced by Hero strip)', () => {
        // The cc-kpi-grid container should not exist as a dashboard row anymore.
        // CSS class `.kpi-card` may still exist (used internally) but not the
        // grid container with all 8 cards on Home.
        expect(code).not.toMatch(/<div class="cc-kpi-grid" id="cc-kpi-grid">/);
        // Specific old KPI cards must NOT be rendered on Home anymore
        expect(code).not.toMatch(/onclick="switchTab\(['"]b2b_dnc['"]\)">[\s\S]{0,80}stat-b2b-pending/);
    });

    test('OLD 3-card Stat Grid REMOVED', () => {
        // <div class="stat-grid"> rendering 3 SN stat-cards on Home — should be gone
        expect(code).not.toMatch(/<div class="stat-grid">\s*<!-- รอลงทะเบียน -->/);
    });

    test('OLD Alert Bar REMOVED', () => {
        expect(code).not.toMatch(/<!-- ROW 4: Alert Banner -->/);
    });

    test('OLD Quick Actions duplicate row REMOVED (Recent Activity full-width)', () => {
        // Old layout had `<!-- ROW 7: Activity + Quick Actions -->` with both
        // cards in dash-grid-2. New layout has Quick Actions promoted up + Activity full-width.
        expect(code).not.toMatch(/<!-- ROW 7: Activity \+ Quick Actions -->/);
        // New layout marker
        expect(code).toMatch(/ROW 7: Recent Activity \(full-width/);
    });

    // ── Reference Stats (below-fold) ──
    test('Reference Stats row exists below-fold with 4 cards', () => {
        expect(code).toContain('dnc-home-refstats');
        expect(code).toMatch(/Reference Stats \(below-the-fold/);
        // Existing #id hooks preserved for legacy loadStats() updates
        expect(code).toContain('id="stat-users"');
        expect(code).toContain('id="stat-total-sn"');
        expect(code).toContain('id="stat-sn-available"');
        expect(code).toContain('id="stat-sn-active"');
    });

    // ── Backend extension ──
    test('Backend get_dashboard_stats returns 7 new V.35.0 aggregates', () => {
        const NEW_FIELDS = [
            'today_revenue_thb',
            'b2f_pending_confirm',
            'b2f_pending_receive',
            'b2f_pending_payment',
            'bo_pending_review',
            'sn_4eyes_pending',
            'sn_batch_in_flight',
            'slip_pending_review',
            'approvals_total',
        ];
        NEW_FIELDS.forEach(function(field) {
            expect(code).toContain("'" + field + "'");
        });
    });

    test('Backend SQL guards against missing tables (legacy install graceful)', () => {
        // Each SN/Slip table check pattern: $tbl = $wpdb->prefix . 'name';
        // then $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $tbl ) ) === $tbl
        // Verify all 3 tables referenced + each has a SHOW TABLES guard nearby
        expect(code).toMatch(/dinoco_sn_approvals/);
        expect(code).toMatch(/dinoco_sn_batches/);
        expect(code).toMatch(/b2b_slip_log/);
        // Count of SHOW TABLES LIKE checks ≥ 3 (one per guarded table)
        const showTablesMatches = code.match(/SHOW TABLES LIKE %s/g) || [];
        expect(showTablesMatches.length).toBeGreaterThanOrEqual(3);
        // post_type_exists check for B2F (kill switch defined → return 0)
        expect(code).toMatch(/post_type_exists\(\s*['"]b2f_po['"]\s*\)/);
    });

    test('Backend manual_invoice exclusion: today_revenue B2B query has _order_source NULL OR != manual_invoice', () => {
        // Prevent double-count between B2B query and Manual Invoice query
        expect(code).toMatch(/pm_src\.meta_value\s+IS\s+NULL\s+OR\s+pm_src\.meta_value\s*!=\s*'manual_invoice'/);
    });

    // ── Sidebar pin-5 default-open ──
    test('Sidebar first-visit pin-5 default-open policy implemented', () => {
        expect(code).toContain('DEFAULT_OPEN_SECTIONS');
        // 5 sections that should be open by default on first visit
        const EXPECTED_OPEN = ['ระบบ B2B', 'โรงงาน (B2F)', 'เคลม & ประกัน', 'การเงิน', 'สินค้า'];
        EXPECTED_OPEN.forEach(function(label) {
            expect(code).toContain("'" + label + "'");
        });
    });

    test('Sidebar respects saved localStorage on subsequent visits', () => {
        expect(code).toMatch(/dnc_sidebar_accordion/);
        expect(code).toMatch(/JSON\.parse\(saved\)/);
    });

    test('Sidebar auto-expand active tab wins over saved state', () => {
        // Auto-expand parent of `.nav-item.active` — fix for SN deep-link from Quick Action
        expect(code).toMatch(/activeItem\.closest\(['"]\.nav-section-items['"]\)/);
        expect(code).toMatch(/parentItems\.previousElementSibling\.classList\.remove\(['"]sec-collapsed['"]\)/);
    });
});
