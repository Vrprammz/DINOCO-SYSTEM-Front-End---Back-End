/**
 * S/N System drift detector — verify code matches plan v2.13 promises.
 *
 * Phase 1 W4 Day 3 deliverable.
 *
 * Asserts:
 *   1. 3 NEW snippets exist (Production S/N Manager + REST API + LIFF activate)
 *   2. REST namespace 'dinoco-sn/v1' registered in REST API snippet
 *   3. 11+ REST endpoints registered (batches CRUD + receive + lookup + activate)
 *   4. 5 admin tabs in Production S/N Manager (batches/receive/pool/manage/audit)
 *   5. 15 schema tables defined (batches/pool/pool_meta/audit + 11 supporting)
 *   6. Module Registry self-registration present (sidebar nav)
 *   7. Idempotency wrapper integrated for all POST endpoints
 *   8. Hierarchy resolver function exists (DD-3 array_unique pattern)
 *   9. Boss example test file exists (SnHierarchyTest.php)
 *  10. Bulk receive contract test exists (D4 contract)
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SN_SNIPPETS = {
    manager: '[Admin System] DINOCO Production SN Manager',
    rest: '[System] DINOCO SN REST API',
    liff: '[System] DINOCO Warranty Activation LIFF',
    sc_lookup: '[System] DINOCO SN Quick Lookup',  // Phase 3 W8.5
    public_api: '[Admin System] DINOCO Public API Gateway',  // Phase 4 W12 F#15 (deferred Q22)
    // stolen_check REMOVED Q23 (2026-05-05) — boss "Admin เท่านั้นก่อน"
    //   snippet [System] DINOCO Stolen Plate Public Verify deleted
    //   endpoint /stolen/verify/{sn} flipped to perm_admin (was perm_public)
};

const readSnippet = (key) => {
    const filepath = path.join(REPO_ROOT, SN_SNIPPETS[key]);
    if (!fs.existsSync(filepath)) {
        throw new Error(`S/N snippet not found: ${SN_SNIPPETS[key]}`);
    }
    return fs.readFileSync(filepath, 'utf8');
};

describe('S/N System v2.13 — Plan vs Code Drift', () => {

    test('3 NEW S/N snippets exist', () => {
        Object.values(SN_SNIPPETS).forEach((filename) => {
            const filepath = path.join(REPO_ROOT, filename);
            expect(fs.existsSync(filepath)).toBe(true);
        });
    });

    test('Production S/N Manager has version V.0.4+', () => {
        const code = readSnippet('manager');
        expect(code).toMatch(/Version: V\.0\.[4-9]/);
    });

    test('REST API has version V.0.3+', () => {
        const code = readSnippet('rest');
        expect(code).toMatch(/Version: V\.0\.[3-9]/);
    });

    test('LIFF Activation snippet has shortcode dinoco_warranty_activate', () => {
        const code = readSnippet('liff');
        expect(code).toContain("add_shortcode( 'dinoco_warranty_activate'");
    });

    test('REST namespace dinoco-sn/v1 registered', () => {
        const code = readSnippet('rest');
        expect(code).toMatch(/['"]dinoco-sn\/v1['"]/);
        expect(code).toMatch(/DINOCO_SN_REST_NAMESPACE/);
    });

    test('Phase 3 audit fix — public /lookup strips PII + cache-safe', () => {
        const code = readSnippet('rest');
        const handler = code.split('function dinoco_sn_rest_lookup')[1] || '';
        // Public response must contain only minimal status oracle
        expect(handler).toContain('public_status');
        expect(handler).toContain('is_registered');
        // Must NOT EMIT user-derived or PII fields in response array (key=>value)
        // Comments mentioning the stripped field are OK; emission is not.
        expect(handler).not.toMatch(/'is_owned_by_caller'\s*=>/);
        expect(handler.split('set_transient')[0]).not.toMatch(/'top_set_sku'\s*=>/);
        expect(handler.split('set_transient')[0]).not.toMatch(/'linked_sku'\s*=>/);
    });

    test('Phase 3 audit fix — /sc-lookup endpoint accepts warehouse cap', () => {
        const code = readSnippet('rest');
        // P0-1: SC Quick Lookup needs warehouse cap, not admin
        expect(code).toContain("'/sc-lookup/(?P<sn>[A-Za-z0-9]+)'");
        // Must use warehouse permission callback (not admin-only)
        const scBlock = code.split("'/sc-lookup/")[1] || '';
        expect(scBlock.split('register_rest_route')[0])
            .toContain("'permission_callback' => 'dinoco_sn_perm_warehouse'");
    });

    test('Phase 3 audit fix — notification UNIQUE index + INSERT IGNORE', () => {
        const code = readSnippet('manager');
        // P0-4: schema must have UNIQUE composite key
        expect(code).toContain('UNIQUE KEY uniq_dedup (notification_type, user_id, sn)');
        // Helper must use INSERT IGNORE (not SELECT-then-INSERT)
        expect(code).toContain('INSERT IGNORE INTO');
    });

    test('Phase 3 audit fix — review request claim guard uses placeholders', () => {
        const code = readSnippet('manager');
        // P0-3 + P1-4: closed_statuses must NOT be raw-interpolated
        // The variable $closed_in (raw SQL list) should NOT exist
        expect(code).not.toContain('$closed_in =');
        // Should use $status_ph + array_merge args pattern
        expect(code).toContain('$status_ph');
    });

    test('Phase 3 audit fix — pool-stats uses SUM(CASE WHEN) portable SQL', () => {
        const code = readSnippet('rest');
        const handler = code.split('function dinoco_sn_rest_pool_stats')[1] || '';
        // P1-3: portable SUM(CASE WHEN ... THEN 1 ELSE 0 END) instead of SUM(status='x')
        expect(handler).toContain('SUM(CASE WHEN status');
        // Capped flag for UI hint
        expect(handler).toContain('stats_capped');
    });

    test('Phase 3 audit fix — swap/reissue lock release in finally', () => {
        const code = readSnippet('rest');
        // P1-2: try/finally guarantees RELEASE_LOCK on every path
        const swap = code.split('function dinoco_sn_rest_swap')[1] || '';
        const reissue = code.split('function dinoco_sn_rest_reissue')[1] || '';
        // Both should have finally { ... RELEASE_LOCK }
        expect(swap).toMatch(/} finally \{[\s\S]*?RELEASE_LOCK[\s\S]*?\}/);
        expect(reissue).toMatch(/} finally \{[\s\S]*?RELEASE_LOCK[\s\S]*?\}/);
    });

    test('Phase 3 audit fix — swap NULLs old registered_user_id atomically', () => {
        const code = readSnippet('rest');
        const swap = code.split('function dinoco_sn_rest_swap')[1] || '';
        // P1-1: sn_old UPDATE must clear registered_user_id + registered_warranty_id
        const upd_old_block = swap.split('// sn_new → take')[0] || '';
        expect(upd_old_block).toMatch(/'registered_user_id'\s*=>\s*null/);
        expect(upd_old_block).toMatch(/'registered_warranty_id'\s*=>\s*null/);
    });

    test('REST API has all Phase 1 endpoints registered', () => {
        const code = readSnippet('rest');
        const expected_endpoints = [
            "/batches'",                           // POST + GET list
            "/batches/(?P<id>\\d+)'",              // GET detail
            "/batches/(?P<id>\\d+)/status'",       // POST status
            "/batches/(?P<id>\\d+)/csv'",          // GET CSV
            "/batches/(?P<id>\\d+)/qr-pdf'",       // GET QR PDF
            "/receive'",                           // POST single
            "/receive/bulk'",                      // POST bulk
            "/lookup/(?P<sn>[A-Za-z0-9]+)'",       // GET public lookup
            "/required-plates'",                   // POST hierarchy
            "/version'",                           // GET health
        ];
        expected_endpoints.forEach(ep => {
            expect(code).toContain(ep);
        });
    });

    test('Phase 2 W5 endpoints registered', () => {
        const code = readSnippet('rest');
        const expected_endpoints = [
            "/pool-stats'",                        // GET heatmap
            "/search'",                            // GET universal search
            "/sn/(?P<sn>[A-Za-z0-9]+)'",           // GET detail card
            "/audit'",                             // GET audit log
            "/void'",                              // POST void
            "/swap'",                              // POST swap
        ];
        expected_endpoints.forEach(ep => {
            expect(code).toContain(ep);
        });
    });

    test('Phase 2 W5 admin renders Pool/Manage/Audit tabs', () => {
        const code = readSnippet('manager');
        const renderers = [
            'dinoco_sn_render_tab_pool',
            'dinoco_sn_render_tab_manage',
            'dinoco_sn_render_tab_audit',
        ];
        renderers.forEach(fn => expect(code).toContain(fn));
    });

    test('Phase 2 W5 JS handlers wired', () => {
        const code = readSnippet('manager');
        const handlers = [
            'dncSnLoadPoolStats',
            'dncSnDoSearch',
            'dncSnOpenDetail',
            'dncSnCloseDetail',
            'dncSnVoidPrompt',
            'dncSnLoadAudit',
        ];
        handlers.forEach(h => expect(code).toContain(h));
    });

    test('Phase 2 W5 swap uses GET_LOCK + atomic transaction', () => {
        const code = readSnippet('rest');
        expect(code).toContain('GET_LOCK');
        expect(code).toContain('RELEASE_LOCK');
        expect(code).toContain("'START TRANSACTION'");
        expect(code).toContain("'ROLLBACK'");
        expect(code).toContain("'COMMIT'");
    });

    test('Phase 2 W5 void enforces auto-tier (in_pool/reserved only)', () => {
        const code = readSnippet('rest');
        // tier matrix should reject registered/claimed status with 422
        expect(code).toContain('requires_approval');
        expect(code).toContain("'in_pool'");
        expect(code).toContain("'reserved'");
    });

    test('Phase 2 W6.3 MCP /sn-lookup endpoint registered', () => {
        const mcpPath = path.join(REPO_ROOT, '[System] DINOCO MCP Bridge');
        if (!fs.existsSync(mcpPath)) {
            // MCP snippet not present in this repo (rare) — skip
            return;
        }
        const code = fs.readFileSync(mcpPath, 'utf8');
        expect(code).toContain("'/sn-lookup'");
        expect(code).toContain('dinoco_mcp_sn_lookup');
        // PII guard — must not return user_id / phone / email
        const handler = code.split('function dinoco_mcp_sn_lookup')[1] || '';
        expect(handler).not.toMatch(/registered_user_id\s*['"]?\s*=>\s*\$row/);
        expect(handler).not.toContain("'phone'");
        expect(handler).not.toContain("'email'");
    });

    test('Phase 3 W8 cron jobs scheduled with heartbeat', () => {
        const code = readSnippet('manager');
        const expected_crons = [
            'dinoco_sn_low_pool_alert_cron',
            'dinoco_sn_audit_retention_cron',
            'dinoco_sn_batch_reconcile_cron',
        ];
        expected_crons.forEach(c => {
            expect(code).toContain(c);
            // Heartbeat option follows pattern dinoco_cron_<short>_last_run
            // (cron name dinoco_sn_X_cron → heartbeat dinoco_cron_sn_X_last_run)
            const short = c.replace(/^dinoco_sn_/, '').replace(/_cron$/, '');
            const heartbeat = 'dinoco_cron_sn_' + short + '_last_run';
            expect(code).toContain(heartbeat);
        });
        // Functions exist
        expect(code).toContain('dinoco_sn_run_low_pool_alert');
        expect(code).toContain('dinoco_sn_run_audit_retention');
        expect(code).toContain('dinoco_sn_run_batch_reconcile');
    });

    test('Phase 3 W8 audit retention split sensitive 5y / non-sensitive 3y', () => {
        const code = readSnippet('manager');
        // PDPA §17 financial fraud retention split
        expect(code).toContain('5 * 365 * 86400');
        expect(code).toContain('3 * 365 * 86400');
        expect(code).toContain('is_sensitive');
    });

    test('Phase 3 W8.2 recall + reissue + reconcile-report endpoints', () => {
        const code = readSnippet('rest');
        const expected_endpoints = [
            "/recall'",
            "/reissue'",
            "/reconcile-report'",
        ];
        expected_endpoints.forEach(ep => expect(code).toContain(ep));
        // Handlers exist
        expect(code).toContain('dinoco_sn_rest_recall');
        expect(code).toContain('dinoco_sn_rest_reissue');
        expect(code).toContain('dinoco_sn_rest_reconcile_report');
    });

    test('Phase 3 W8 recall categories whitelist enforced', () => {
        const code = readSnippet('rest');
        // 5 recall categories per App K M14
        ['defect', 'safety', 'stolen', 'fraud', 'misship'].forEach(c => {
            expect(code).toContain(`'${c}'`);
        });
    });

    test('Phase 3 W8 recall/reissue audit rows are sensitive', () => {
        const code = readSnippet('rest');
        // Both /recall and /reissue handlers must pass is_sensitive=true
        // (5y PDPA retention via dinoco_sn_run_audit_retention cron).
        // Locate recall handler block + verify audit_log call has true arg.
        const recallStart = code.indexOf('function dinoco_sn_rest_recall');
        const reissueStart = code.indexOf('function dinoco_sn_rest_reissue');
        const reconcileStart = code.indexOf('function dinoco_sn_rest_reconcile_report');
        expect(recallStart).toBeGreaterThan(-1);
        expect(reissueStart).toBeGreaterThan(-1);
        expect(reconcileStart).toBeGreaterThan(recallStart);
        const recallBlock = code.substring(recallStart, reissueStart);
        const reissueBlock = code.substring(reissueStart, reconcileStart);
        // Both blocks call audit_log with is_sensitive=true (last `true` arg)
        expect(recallBlock).toContain('dinoco_sn_audit_log');
        expect(recallBlock).toMatch(/true\s*\);/);
        expect(reissueBlock).toContain('dinoco_sn_audit_log');
        expect(reissueBlock).toMatch(/true\s*\);/);
    });

    test('Phase 3 W8.3 reconcile UI mounted in audit tab', () => {
        const code = readSnippet('manager');
        expect(code).toContain('dnc-sn-reconcile-card');
        expect(code).toContain('dncSnLoadReconcileReport');
        // Lazy-load on tab activation
        expect(code).toContain('_dncSnReconcileLoaded');
    });

    test('Phase 3 W8 Recall button wired in search row + handler exists', () => {
        const code = readSnippet('manager');
        expect(code).toContain('dncSnRecallPrompt');
        expect(code).toContain('⚠️ Recall');
    });

    test('Phase 3 W8.4 Reissue button + handler in admin', () => {
        const code = readSnippet('manager');
        expect(code).toContain('dncSnReissuePrompt');
        expect(code).toContain('♻️ Reissue');
        // SKU mismatch guard surfaced to user via prompt copy
        expect(code).toContain('linked_sku');
    });

    test('Phase 3 W8.5 SC Quick Lookup snippet exists with shortcode', () => {
        const filepath = path.join(REPO_ROOT, SN_SNIPPETS.sc_lookup);
        expect(fs.existsSync(filepath)).toBe(true);
        const code = fs.readFileSync(filepath, 'utf8');
        // Shortcode registered
        expect(code).toContain("add_shortcode( 'dinoco_sc_quick_lookup'");
        // Permission gate (warehouse OR admin)
        expect(code).toContain('dinoco_sn_warehouse');
        expect(code).toContain('manage_options');
        // Reuses existing /sn/{sn} endpoint (no new endpoint needed)
        expect(code).toContain('/sn/');
        // Read-only — no POST methods + no mutation endpoint fetch calls
        expect(code).not.toMatch(/method:\s*['"]POST['"]/);
        expect(code).not.toMatch(/fetch\([^)]*\/swap/);
        expect(code).not.toMatch(/fetch\([^)]*\/void/);
        expect(code).not.toMatch(/fetch\([^)]*\/recall/);
        expect(code).not.toMatch(/fetch\([^)]*\/reissue/);
        expect(code).not.toMatch(/fetch\([^)]*\/activate/);
    });

    test('Phase 3 W9 F#1 expiry reminder cron + helpers exist', () => {
        const code = readSnippet('manager');
        // Cron names + heartbeat keys
        expect(code).toContain('dinoco_sn_expiry_schedule_cron');
        expect(code).toContain('dinoco_sn_notification_send_cron');
        expect(code).toContain('dinoco_cron_sn_expiry_schedule_last_run');
        expect(code).toContain('dinoco_cron_sn_notification_send_last_run');
        // Functions
        expect(code).toContain('dinoco_sn_run_expiry_schedule');
        expect(code).toContain('dinoco_sn_run_notification_send');
        expect(code).toContain('dinoco_sn_warranty_end_for_pool_row');
        expect(code).toContain('dinoco_sn_schedule_notification');
    });

    test('Phase 3 W9 F#1 send cron is gated by flag (default OFF)', () => {
        const code = readSnippet('manager');
        // Master flag default false until boss answers Q21 LINE Premium tier
        expect(code).toContain('dinoco_sn_notification_send_enabled');
        // Stub mode early-return when flag OFF
        expect(code).toMatch(/\$send_enabled[\s\S]*?return;/);
    });

    test('Phase 3 W9 F#1 schedules 3 milestones (30d/7d/1d)', () => {
        const code = readSnippet('manager');
        expect(code).toContain('expiry_30d');
        expect(code).toContain('expiry_7d');
        expect(code).toContain('expiry_1d');
    });

    test('Phase 3 W9 F#1 dedup uses INSERT IGNORE + UNIQUE index (P0-4 fixed)', () => {
        const code = readSnippet('manager');
        // After audit fix: dedup at DB layer via UNIQUE KEY uniq_dedup +
        // INSERT IGNORE in helper. Race-safe vs old SELECT-then-INSERT.
        expect(code).toContain('UNIQUE KEY uniq_dedup (notification_type, user_id, sn)');
        expect(code).toContain('INSERT IGNORE INTO');
        // Schedule notification helper must check rows === 1 to know if inserted vs dup
        const helper = code.split('function dinoco_sn_schedule_notification')[1] || '';
        expect(helper).toMatch(/\$rows\s*===\s*1/);
    });

    test('Phase 3 W9 F#4 Anniversary cron + types 1y..5y', () => {
        const code = readSnippet('manager');
        expect(code).toContain('dinoco_sn_anniversary_schedule_cron');
        expect(code).toContain('dinoco_sn_run_anniversary_schedule');
        expect(code).toContain('dinoco_cron_sn_anniversary_schedule_last_run');
        // Notification type prefix
        expect(code).toContain("'anniversary_'");
        // Loop bounds 1..5 years
        expect(code).toMatch(/\$years\s*=\s*1;\s*\$years\s*<=\s*5/);
    });

    test('Phase 3 W9 F#10 Review Request cron + claim guard', () => {
        const code = readSnippet('manager');
        expect(code).toContain('dinoco_sn_review_request_cron');
        expect(code).toContain('dinoco_sn_run_review_request_schedule');
        expect(code).toContain('dinoco_cron_sn_review_request_last_run');
        expect(code).toContain('review_request');
        // Skip-if-claim guard via claim_ticket CPT
        expect(code).toContain('claim_ticket');
        expect(code).toContain('ticket_status');
        // Should reference closed_statuses (don't pester completed claims)
        expect(code).toMatch(/'completed'[\s,]*'closed'[\s,]*'rejected'[\s,]*'cancelled'/);
    });

    test('Phase 3 W8.5 SC Quick Lookup is mobile-first', () => {
        const filepath = path.join(REPO_ROOT, SN_SNIPPETS.sc_lookup);
        const code = fs.readFileSync(filepath, 'utf8');
        // Touch targets >= 48px (iOS HIG)
        expect(code).toMatch(/min-height:\s*48px/);
        // Responsive breakpoint
        expect(code).toContain('@media (max-width: 480px)');
        // Auto-uppercase + autocapitalize for S/N input
        expect(code).toContain('autocapitalize="characters"');
    });

    test('LIFF activate registers POST /activate endpoint', () => {
        const code = readSnippet('liff');
        expect(code).toContain("'/activate'");
        expect(code).toContain("'methods'             => 'POST'");
    });

    test('8 admin tabs declared (Phase 3 W11 — fraud REMOVED Q21, geo/stolen kept)', () => {
        const code = readSnippet('manager');
        // Q21 (2026-05-05): 'fraud' tab REMOVED — boss "ตัดระบบของปลอมออกไปเลย"
        const expected_tabs = ['batches', 'receive', 'pool', 'manage', 'audit', 'ltv',
                                'geo', 'stolen'];
        expected_tabs.forEach(tab => {
            const navPattern = new RegExp(`data-tab="${tab}"`);
            expect(code).toMatch(navPattern);
            const panelPattern = new RegExp(`data-tab-panel="${tab}"`);
            expect(code).toMatch(panelPattern);
        });
        // Q21 OVERRIDE: fraud nav-item must NOT have data-tab
        expect(code).not.toMatch(/data-tab="fraud"/);
    });

    test('Phase 3 W11 admin tab render functions + lazy load wiring (geo/stolen — fraud REMOVED Q21)', () => {
        const code = readSnippet('manager');
        // Q21 (2026-05-05): fraud render function REMOVED — replaced with stub
        ['geo', 'stolen'].forEach(tab => {
            expect(code).toContain(`dinoco_sn_render_tab_${tab}`);
            // Lazy-load flag prevents double-fetch on re-activation
            expect(code).toContain(`_dncSn${tab.charAt(0).toUpperCase() + tab.slice(1)}Loaded`);
        });
        // Module Registry includes geo + stolen subtabs (fraud removed)
        ['geo', 'stolen'].forEach(tab => {
            expect(code).toMatch(new RegExp(`'${tab}'\\s*=>`));
        });
    });

    test('Phase 3 W11 geo/stolen JS handlers wired (fraud handlers REMOVED Q21)', () => {
        const code = readSnippet('manager');
        // Q21 (2026-05-05): Fraud Queue handlers REMOVED — boss "ตัดระบบของปลอมออกไปเลย"
        expect(code).not.toContain('dncSnLoadFraud');
        expect(code).not.toContain('dncSnLoadFraudStats');
        expect(code).not.toContain('dncSnFraudDecision');
        // Geo handlers — kept
        expect(code).toContain('dncSnLoadGeoHeatmap');
        expect(code).toContain('dncSnLoadGrayMarket');
        // Stolen handlers — kept (Q23 admin-only)
        expect(code).toContain('dncSnLoadStolen');
        expect(code).toContain('dncSnStolenDecision');
        // Idempotency-Key pattern on stolen decision posts
        expect(code).toMatch(/X-Idempotency-Key.*?stolen-/);
        // No fraud-* idempotency keys
        expect(code).not.toMatch(/X-Idempotency-Key.*?fraud-/);
    });

    test('Phase 3 W10 F#9 LTV endpoints + tier helper + cron', () => {
        const code = readSnippet('rest');
        const manager = readSnippet('manager');
        // REST endpoints
        expect(code).toContain("'/ltv/list'");
        expect(code).toContain("'/ltv/(?P<user_id>\\d+)'");
        expect(code).toContain('dinoco_sn_rest_ltv_list');
        expect(code).toContain('dinoco_sn_rest_ltv_detail');
        // Cron
        expect(manager).toContain('dinoco_sn_ltv_snapshot_cron');
        expect(manager).toContain('dinoco_sn_run_ltv_snapshot');
        expect(manager).toContain('dinoco_cron_sn_ltv_snapshot_last_run');
        // Tier helper + 5 tiers
        expect(manager).toContain('dinoco_sn_compute_loyalty_tier');
        ['diamond', 'platinum', 'gold', 'silver', 'bronze'].forEach(t => {
            expect(manager).toContain(`'${t}'`);
        });
    });

    test('Phase 3 W10 F#9 LTV admin tab + JS handlers', () => {
        const code = readSnippet('manager');
        // Render function
        expect(code).toContain('dinoco_sn_render_tab_ltv');
        // JS handlers (3 functions)
        expect(code).toContain('dncSnLoadLtv');
        expect(code).toContain('dncSnOpenLtvDetail');
        expect(code).toContain('dncSnCloseLtvDetail');
        // Lazy load on tab activation
        expect(code).toContain('_dncSnLtvLoaded');
        // Module Registry includes ltv subtab
        expect(code).toMatch(/'ltv'\s*=>\s*'ลูกค้า VIP'/);
    });

    test('Phase 3 W10 F#9 LTV uses INSERT ... ON DUPLICATE KEY UPDATE (idempotent)', () => {
        const code = readSnippet('manager');
        const cron = code.split('function dinoco_sn_run_ltv_snapshot')[1] || '';
        // Idempotent rebuild — safe to re-run same day
        expect(cron).toContain('ON DUPLICATE KEY UPDATE');
        // Chunked aggregation by user_id range (no OOM)
        expect(cron).toMatch(/LIMIT 500/);
        // Cap to prevent runaway
        expect(cron).toMatch(/\$cap\s*=\s*40/);
    });

    test('Phase 3 W11 F#14 Stolen Registry endpoints + permission tiers', () => {
        const code = readSnippet('rest');
        // 4 endpoints with different permission gates
        expect(code).toContain("'/stolen/report'");
        expect(code).toContain("'/stolen/list'");
        expect(code).toContain("'/stolen/(?P<id>\\d+)/decision'");
        expect(code).toContain("'/stolen/verify/(?P<sn>[A-Za-z0-9]+)'");
        // Handlers
        expect(code).toContain('dinoco_sn_rest_stolen_report');
        expect(code).toContain('dinoco_sn_rest_stolen_list');
        expect(code).toContain('dinoco_sn_rest_stolen_decision');
        expect(code).toContain('dinoco_sn_rest_stolen_verify');
    });

    test('Phase 3 W11 F#14 stolen ownership check (customer reports own only)', () => {
        const code = readSnippet('rest');
        const handler = code.split('function dinoco_sn_rest_stolen_report')[1] || '';
        // Customer can only report own plate; admin any
        expect(handler).toContain('manage_options');
        expect(handler).toMatch(/owner_id\s*!==\s*\$reporter/);
    });

    test('Phase 3 W11 F#14 stolen public verify is PII-stripped', () => {
        const code = readSnippet('rest');
        const handler = code.split('function dinoco_sn_rest_stolen_verify')[1] || '';
        // Public response must contain only boolean + date — no police info
        expect(handler).toContain('is_stolen');
        const respBlock = handler.split('set_transient')[0] || '';
        // Must NOT emit police_report_no / police_station / description / user_id
        expect(respBlock).not.toMatch(/'police_report_no'\s*=>/);
        expect(respBlock).not.toMatch(/'police_station'\s*=>/);
        expect(respBlock).not.toMatch(/'description'\s*=>/);
        expect(respBlock).not.toMatch(/'user_id'\s*=>/);
    });

    test('Phase 3 W11 F#14 audit rows are sensitive (5y retention)', () => {
        const code = readSnippet('rest');
        const report = code.split('function dinoco_sn_rest_stolen_report')[1] || '';
        const decision = code.split('function dinoco_sn_rest_stolen_decision')[1] || '';
        // Both audit log calls must pass is_sensitive=true
        expect(report).toContain('dinoco_sn_audit_log');
        expect(report).toMatch(/true\s*\);/);
        expect(decision).toContain('dinoco_sn_audit_log');
        expect(decision).toMatch(/true\s*\);/);
    });

    test('Phase 3 W11 F#14 recovered decision unlocks plate to prev_status', () => {
        const code = readSnippet('rest');
        const handler = code.split('function dinoco_sn_rest_stolen_decision')[1] || '';
        // 'recovered' branch must restore plate to prev_status (if registered/claimed)
        expect(handler).toMatch(/'recovered'/);
        expect(handler).toContain('prev_status');
        // Set stolen_at + recalled_at to null
        expect(handler).toMatch(/'stolen_at'\s*=>\s*null/);
    });

    test('Phase 3 W11 F#13 Geographic Heatmap endpoints + helper', () => {
        const code = readSnippet('rest');
        const manager = readSnippet('manager');
        // Endpoints
        expect(code).toContain("'/geo/heatmap'");
        expect(code).toContain("'/geo/gray-market'");
        expect(code).toContain('dinoco_sn_rest_geo_heatmap');
        expect(code).toContain('dinoco_sn_rest_geo_gray_market');
        // Public helper for activate flow (Phase 4 W12 wires it)
        expect(code).toContain('dinoco_sn_record_geo_activation');
        // Cron + helper
        expect(manager).toContain('dinoco_sn_gray_market_scan_cron');
        expect(manager).toContain('dinoco_sn_run_gray_market_scan');
        expect(manager).toContain('dinoco_cron_sn_gray_market_scan_last_run');
    });

    test('Phase 3 W11 F#13 heatmap accepts ISO date filter + sku join', () => {
        const code = readSnippet('rest');
        const handler = code.split('function dinoco_sn_rest_geo_heatmap')[1] || '';
        // Date validation against PHP-side regex literal
        expect(handler).toContain('preg_match');
        expect(handler).toContain('\\d{4}-\\d{2}-\\d{2}');
        // SKU optional inner join with pool table
        expect(handler).toContain('INNER JOIN');
        expect(handler).toContain('linked_sku');
    });

    test('Phase 3 W11 F#13 gray-market scan respects threshold + window', () => {
        const code = readSnippet('manager');
        const cron = code.split('function dinoco_sn_run_gray_market_scan')[1] || '';
        // Configurable via wp_options
        expect(cron).toContain('dinoco_sn_gray_market_window_days');
        expect(cron).toContain('dinoco_sn_gray_market_threshold');
        // Only consider rows OUTSIDE dealer territory
        expect(cron).toMatch(/is_in_dealer_territory\s*=\s*0/);
    });

    test('Q21 OVERRIDE — F#12 Anti-Fraud Engine REMOVED (no live routes)', () => {
        // Boss decision (2026-05-05): "ตัดระบบของปลอมออกไปเลย เยอะเกิน ไม่ใช้แล้ว"
        // Verify F#12 surface is fully unreachable:
        const code = readSnippet('rest');
        const manager = readSnippet('manager');

        // No active register_rest_route for fraud endpoints
        expect(code).not.toMatch(/register_rest_route\([^)]*\/fraud\/queue/);
        expect(code).not.toMatch(/register_rest_route\([^)]*\/fraud\/stats/);
        expect(code).not.toMatch(/register_rest_route\([^)]*\/fraud\/\(\?P<id>/);

        // No fraud_scores schema entry in DINOCO_SN_TABLES
        expect(manager).not.toMatch(/'fraud_scores'\s*=>\s*'dinoco_sn_fraud_scores'/);

        // No fraud cron registration
        expect(manager).not.toMatch(/dinoco_register_cron\(\s*'dinoco_sn_fraud_aggregate_cron'/);

        // Section heading documents removal
        expect(code).toMatch(/F#12 ANTI-FRAUD.*REMOVED/i);
    });

    test('Q23 OVERRIDE — public stolen verify shortcode REMOVED + endpoint admin-only', () => {
        // Boss decision (2026-05-05): "Admin เท่านั้นก่อน"
        // 1. Snippet file deleted
        const filepath = path.join(REPO_ROOT, '[System] DINOCO Stolen Plate Public Verify');
        expect(fs.existsSync(filepath)).toBe(false);

        // 2. Endpoint flipped from perm_public → perm_admin
        const code = readSnippet('rest');
        const block = code.split("'/stolen/verify/")[1] || '';
        const verifyBlock = block.split('register_rest_route')[0];
        expect(verifyBlock).toContain("'dinoco_sn_perm_admin'");
        expect(verifyBlock).not.toContain("'dinoco_sn_perm_public'");

        // 3. Q23 marker comment present
        expect(code).toMatch(/Q23 OVERRIDE/);
    });

    test('Phase 4 W12 F#15 Public API Gateway snippet exists', () => {
        const filepath = path.join(REPO_ROOT, SN_SNIPPETS.public_api);
        expect(fs.existsSync(filepath)).toBe(true);
        const code = fs.readFileSync(filepath, 'utf8');
        // Separate namespace prevents collision with admin /dinoco-sn/v1
        expect(code).toContain("'dinoco-sn-api/v1'");
        // 3 public endpoints + 3 admin token mgmt endpoints
        expect(code).toContain("'/verify'");
        expect(code).toContain("'/claim-status'");
        expect(code).toContain("'/stolen-check'");
        expect(code).toContain("'/api-tokens'");
        expect(code).toContain("'/api-tokens/(?P<id>\\d+)/disable'");
    });

    test('Phase 4 W12 F#15 token issue + verify + rate limit helpers', () => {
        const code = fs.readFileSync(path.join(REPO_ROOT, SN_SNIPPETS.public_api), 'utf8');
        expect(code).toContain('dinoco_sn_pubapi_issue_token');
        expect(code).toContain('dinoco_sn_pubapi_verify_request');
        expect(code).toContain('dinoco_sn_pubapi_check_rate_limit');
        expect(code).toContain('dinoco_sn_pubapi_log_request');
        // Token format: pk_/sk_ prefix
        expect(code).toContain("'pk_'");
        expect(code).toContain("'sk_'");
        // Scopes whitelist
        ['verify', 'claim_status', 'stolen_check', 'full'].forEach(scope => {
            expect(code).toContain(`'${scope}'`);
        });
    });

    test('Phase 4 W12 F#15 public endpoints PII-stripped', () => {
        const code = fs.readFileSync(path.join(REPO_ROOT, SN_SNIPPETS.public_api), 'utf8');
        const verify_handler = code.split('function dinoco_sn_pubapi_handle_verify')[1] || '';
        const claim_handler = code.split('function dinoco_sn_pubapi_handle_claim_status')[1] || '';
        const stolen_handler = code.split('function dinoco_sn_pubapi_handle_stolen_check')[1] || '';
        // None of the 3 handlers should emit user_id / phone / email / display_name
        [verify_handler, claim_handler, stolen_handler].forEach(handler => {
            expect(handler).not.toMatch(/'phone'\s*=>/);
            expect(handler).not.toMatch(/'email'\s*=>/);
            expect(handler).not.toMatch(/'display_name'\s*=>/);
            expect(handler).not.toMatch(/'registered_user_id'\s*=>/);
        });
    });

    test('Phase 4 W12 F#15 90-day cleanup cron + heartbeat', () => {
        const code = fs.readFileSync(path.join(REPO_ROOT, SN_SNIPPETS.public_api), 'utf8');
        expect(code).toContain('dinoco_sn_pubapi_log_cleanup_cron');
        expect(code).toContain('dinoco_sn_pubapi_run_log_cleanup');
        expect(code).toContain('dinoco_cron_sn_pubapi_log_cleanup_last_run');
        // 90-day cutoff
        expect(code).toMatch(/90\s*\*\s*86400/);
        // Chunked DELETE 500/iter × 10 cap
        expect(code).toMatch(/LIMIT 500/);
    });

    test('Phase 4 W12 F#15 admin list never exposes secret hash', () => {
        const code = fs.readFileSync(path.join(REPO_ROOT, SN_SNIPPETS.public_api), 'utf8');
        const handler = code.split('function dinoco_sn_pubapi_admin_list')[1] || '';
        // SELECT clause must NOT include api_secret_hash
        const select_block = handler.split('FROM')[0] || '';
        expect(select_block).not.toContain('api_secret_hash');
    });

    test('Phase 4 W13 F#16 forecast endpoints + cron + helper', () => {
        const code = readSnippet('rest');
        const manager = readSnippet('manager');
        // Endpoints
        expect(code).toContain("'/forecast/sku/(?P<sku>[A-Za-z0-9._-]+)'");
        expect(code).toContain("'/forecast/all'");
        expect(code).toContain('dinoco_sn_rest_forecast_sku');
        expect(code).toContain('dinoco_sn_rest_forecast_all');
        // Math helper
        expect(manager).toContain('dinoco_sn_compute_demand_forecast');
        expect(manager).toContain('dinoco_sn_run_demand_forecast');
        // Cron
        expect(manager).toContain('dinoco_sn_demand_forecast_cron');
        expect(manager).toContain('dinoco_cron_sn_demand_forecast_last_run');
    });

    test('Phase 4 W13 F#16 forecast uses idempotent UPSERT', () => {
        const manager = readSnippet('manager');
        const cron = manager.split('function dinoco_sn_run_demand_forecast')[1] || '';
        // Idempotent rebuild via UNIQUE KEY (sku, forecast_month)
        expect(cron).toContain('ON DUPLICATE KEY UPDATE');
        // Uses 12-month rolling history
        expect(cron).toMatch(/INTERVAL\s+12\s+MONTH/);
        // Min 3 months data threshold
        expect(cron).toMatch(/COUNT\(DISTINCT[\s\S]*?>=\s*3/);
    });

    test('Phase 4 W13 F#16 forecast math: blend MA + exp smoothing', () => {
        const manager = readSnippet('manager');
        const helper = manager.split('function dinoco_sn_compute_demand_forecast')[1] || '';
        // MA + ES blend
        expect(helper).toMatch(/\$ma\s*=/);
        expect(helper).toMatch(/\$level\s*=/);
        expect(helper).toMatch(/\$predicted_base\s*=\s*\(\s*\$ma\s*\+\s*\$level\s*\)/);
        // Confidence math (CV + sample penalty)
        expect(helper).toMatch(/cv_percent/);
        expect(helper).toContain('sample_penalty');
        // Predicted qty never negative
        expect(helper).toMatch(/max\(\s*0\s*,\s*\(int\)\s*round\s*\(\s*\$predicted_base/);
    });

    test('14 schema tables defined in Production S/N Manager (fraud_scores REMOVED Q21)', () => {
        const code = readSnippet('manager');
        const expected_tables = [
            'dinoco_sn_batches',
            'dinoco_sn_pool',
            'dinoco_sn_pool_meta',
            'dinoco_sn_audit',
            'dinoco_sn_notifications',
            'dinoco_sn_promo_codes',
            'dinoco_sn_customer_ltv_snapshot',
            'dinoco_sn_review_requests',
            // 'dinoco_sn_fraud_scores' — REMOVED Q21 (2026-05-05) boss "ตัดระบบของปลอมออกไปเลย"
            'dinoco_sn_geo_activations',
            'dinoco_sn_stolen_log',
            'dinoco_sn_api_tokens',
            'dinoco_sn_api_log',
            'dinoco_sn_demand_forecast',
            'dinoco_sn_warranty_extensions',
        ];
        expected_tables.forEach(table => {
            expect(code).toContain(table);
        });
        // Q21 OVERRIDE: fraud_scores must NOT be in DINOCO_SN_TABLES map
        expect(code).not.toMatch(/'fraud_scores'\s*=>\s*'dinoco_sn_fraud_scores'/);
    });

    test('Module Registry self-registration present', () => {
        const code = readSnippet('manager');
        expect(code).toContain('dinoco_register_admin_module');
        expect(code).toMatch(/['"]production_sn['"]/);
        expect(code).toMatch(/['"]inventory['"]/);  // section
    });

    test('Idempotency wrapper used in REST API', () => {
        const code = readSnippet('rest');
        expect(code).toContain('dinoco_sn_with_idempotency');
        expect(code).toContain('dinoco_idempotency_check');
        expect(code).toContain('dinoco_idempotency_store');
    });

    test('Hierarchy resolver function exists with DD-3 array_unique pattern', () => {
        const code = readSnippet('manager');
        expect(code).toContain('dinoco_sn_required_plates_for_sku');
        expect(code).toContain('dinoco_sn_walk_to_level');
        // V.7.1 pattern: $seen array dedup
        expect(code).toMatch(/\$seen\s*=\s*array\(\)/);
    });

    test('Schema split: pool 12 cols + pool_meta 7 cols (v2.12 §B3)', () => {
        const code = readSnippet('manager');
        // pool_meta table should exist (cold path)
        expect(code).toContain('CREATE TABLE {$prefix}dinoco_sn_pool_meta');
        // pool table should NOT have purchase_dealer_id (moved to pool_meta)
        const poolTableMatch = code.match(/CREATE TABLE \{\$prefix\}dinoco_sn_pool \(([\s\S]*?)\) \{\$charset_collate\}/);
        if (poolTableMatch) {
            expect(poolTableMatch[1]).not.toContain('purchase_dealer_id');
            expect(poolTableMatch[1]).not.toContain('stolen_at');
        }
    });

    test('utf8mb4_bin collation applied via dinoco_sn_apply_bin_collations', () => {
        const code = readSnippet('manager');
        expect(code).toContain('dinoco_sn_apply_bin_collations');
        expect(code).toContain('utf8mb4_bin');
    });

    test('5 feature flags initialized in init action', () => {
        const code = readSnippet('manager');
        const expected_flags = [
            'dinoco_sn_system_enabled',
            'dinoco_sn_block_legacy_serial_code',
            'dinoco_sn_require_2sig_for_swap',
            'dinoco_sn_dual_source_enabled',
            'dinoco_sn_oos_gate_hierarchy_compute',
        ];
        expected_flags.forEach(flag => {
            expect(code).toContain(flag);
        });
    });

    test('3 capabilities registered (warehouse + approver + view_pii)', () => {
        const code = readSnippet('rest');
        const expected_caps = [
            'dinoco_sn_warehouse',
            'dinoco_sn_approver',
            'dinoco_sn_view_pii',
        ];
        expected_caps.forEach(cap => {
            expect(code).toContain(cap);
        });
    });

    test('LIFF activate uses LINE OAuth + WP session (D11 fix, no JWT)', () => {
        const code = readSnippet('liff');
        // Should use is_user_logged_in() not custom JWT
        expect(code).toContain('is_user_logged_in()');
        // Should NOT define new JWT secret
        expect(code).not.toContain('LIFF_AI_JWT_SECRET');
        expect(code).not.toContain('SN_JWT_SECRET');
    });

    test('LIFF activate has 5 UX states (per v2.0 §B.4 Page 6)', () => {
        const code = readSnippet('liff');
        const expected_renderers = [
            'dinoco_sn_render_activate_landing',
            'dinoco_sn_render_activate_form',
            'dinoco_sn_render_state_already_registered',
            'dinoco_sn_render_state_not_yet_shipped',
            'dinoco_sn_render_activate_error',
        ];
        expected_renderers.forEach(fn => {
            expect(code).toContain(fn);
        });
    });

    test('REST API has correct permission callbacks', () => {
        const code = readSnippet('rest');
        const expected_perms = [
            'dinoco_sn_perm_admin',
            'dinoco_sn_perm_warehouse',
            'dinoco_sn_perm_logged_in',
            'dinoco_sn_perm_public',
        ];
        expected_perms.forEach(perm => {
            expect(code).toContain(`function ${perm}`);
        });
    });

    test('Bulk receive uses sort() for deterministic idempotency hash', () => {
        const code = readSnippet('rest');
        // Round 27 bulk-array pattern: sort SNs for hash determinism
        expect(code).toContain('sort( $sns_normalized )');
    });

    test('Atomic transaction pattern: START TRANSACTION + ROLLBACK + RELEASE_LOCK', () => {
        const code = readSnippet('rest');
        // Following Snippet 13 pattern
        expect(code).toContain('START TRANSACTION');
        expect(code).toContain('ROLLBACK');
        expect(code).toContain('RELEASE_LOCK');
        expect(code).toContain('GET_LOCK');
        // try/catch/finally pattern
        expect(code).toMatch(/catch\s*\(\s*\\Throwable/);
    });

    test('PHPUnit test files exist', () => {
        const test_files = [
            'tests/helpers/SnHierarchyTest.php',
            'tests/helpers/SnBulkReceiveContractTest.php',
        ];
        test_files.forEach(f => {
            const filepath = path.join(REPO_ROOT, f);
            expect(fs.existsSync(filepath)).toBe(true);
        });
    });

    test('Phase 3 W9 F#1/F#4/F#10 Flex template builders exist in manager', () => {
        const code = readSnippet('manager');
        // Pure helper functions (defensive function_exists guard pattern)
        expect(code).toContain('function dinoco_sn_format_thai_date');
        expect(code).toContain('function dinoco_sn_pick_anniversary_emoji');
        expect(code).toContain('function dinoco_sn_build_flex_expiry');
        expect(code).toContain('function dinoco_sn_build_flex_anniversary');
        expect(code).toContain('function dinoco_sn_build_flex_review_request');
        expect(code).toContain('function dinoco_sn_build_flex_for_notification');
    });

    test('Phase 3 W9 dispatcher routes 3 notification types', () => {
        const code = readSnippet('manager');
        const dispatcher = code.split('function dinoco_sn_build_flex_for_notification')[1] || '';
        // Type prefix matching for expiry_*/anniversary_*
        expect(dispatcher).toMatch(/strpos\(\s*\$type,\s*['"]expiry_['"]/);
        expect(dispatcher).toMatch(/strpos\(\s*\$type,\s*['"]anniversary_['"]/);
        // Exact match for review_request
        expect(dispatcher).toMatch(/\$type\s*===\s*['"]review_request['"]/);
        // Suffix parsing for days_left
        expect(dispatcher).toMatch(/expiry_\(\\d\+\)d/);
        expect(dispatcher).toMatch(/anniversary_\(\\d\+\)y/);
    });

    test('Phase 3 W9 expiry header severity colors per v2.10 §F#1 spec', () => {
        const code = readSnippet('manager');
        const handler = code.split('function dinoco_sn_build_flex_expiry')[1] || '';
        const block = handler.split('function dinoco_sn_build_flex_anniversary')[0];
        // 3-tier severity: red ≤1d, amber ≤7d, navy >7d
        expect(block).toContain('#dc2626'); // red urgent
        expect(block).toContain('#f59e0b'); // amber warning
        expect(block).toContain('#1f2937'); // navy normal
    });

    test('Phase 3 W9 anniversary tier colors per v2.10 §F#4 spec', () => {
        const code = readSnippet('manager');
        const handler = code.split('function dinoco_sn_build_flex_anniversary')[1] || '';
        const block = handler.split('function dinoco_sn_build_flex_review_request')[0];
        expect(block).toContain('#7c3aed'); // diamond/violet 3y+
        expect(block).toContain('#ca8a04'); // gold 2y
        expect(block).toContain('#1f2937'); // navy 1y
    });

    test('Phase 3 W9 SnFlexTemplateTest helper exists', () => {
        const filepath = path.join(REPO_ROOT, 'tests/helpers/SnFlexTemplateTest.php');
        expect(fs.existsSync(filepath)).toBe(true);
        const content = fs.readFileSync(filepath, 'utf8');
        // Sanity: covers all 3 builders
        expect(content).toContain('expiry');
        expect(content).toContain('anniversary');
        expect(content).toContain('review');
    });

    test('Phase 3 W8.6 Gap C Photo OCR validation chain endpoint', () => {
        const rest = readSnippet('rest');
        // REST endpoint registered
        expect(rest).toContain("'/photo-ocr/validate'");
        expect(rest).toContain('function dinoco_sn_rest_photo_ocr_validate');
        expect(rest).toContain('function dinoco_sn_photo_ocr_decide');

        // Decision matrix — 7 codes per chatbot-rules.md §15.8
        const decide = rest.split('function dinoco_sn_photo_ocr_decide')[1] || '';
        const block = decide.split('function dinoco_sn_rest_photo_ocr_validate')[0];
        const codes = ['proceed', 'not_yet_active', 'block_voided', 'block_recalled',
                       'block_stolen', 'block_other_owner', 'not_found'];
        codes.forEach(code => {
            expect(block).toContain(`'decision_code' => '${code}'`);
        });

        // REG-082 anti social-engineering: stolen reply NEVER says "ถูกแจ้งหาย"
        const stolenBranch = block.split("'block_stolen'")[1] || '';
        const stolenSection = stolenBranch.split('}')[0];
        expect(stolenSection).not.toMatch(/ถูกแจ้งหาย/);

        // Stolen check BEFORE registered routing (REG-082 precedence)
        const stolenCheckPos = block.indexOf("'block_stolen'");
        const registeredCheckPos = block.indexOf("'proceed'");
        expect(stolenCheckPos).toBeLessThan(registeredCheckPos);

        // PHPUnit test exists
        const testPath = path.join(REPO_ROOT, 'tests/helpers/SnPhotoOcrDecideTest.php');
        expect(fs.existsSync(testPath)).toBe(true);
    });

    test('Phase 3 W8 Gap D orphan-claim scan cron + REST endpoints', () => {
        // Production SN Manager has scan helper + cron registered
        const mgr = readSnippet('manager');
        expect(mgr).toContain('function dinoco_sn_run_orphan_claim_scan');
        // Scan logic: 2 alert categories per v2.6 §Gap D
        const scan = mgr.split('function dinoco_sn_run_orphan_claim_scan')[1] || '';
        const block = scan.split('function dinoco_sn_run_expiry_schedule')[0];
        expect(block).toContain("'stuck_claim'");
        expect(block).toContain("'plate_claimed_no_ticket'");
        // Threshold: 7 days for stuck-claim
        expect(block).toMatch(/7\s*\*\s*DAY_IN_SECONDS/);
        // Storage in wp_option (not DB write — admin reviews)
        expect(block).toContain("'dinoco_sn_orphan_claim_alerts'");
        // Action hook for downstream integrations
        expect(block).toContain('dinoco_sn_orphan_claim_alerts_detected');
        // Cron registered (both registry wrapper + add_action fallback)
        expect(mgr).toContain("'dinoco_sn_orphan_claim_scan_cron'");

        // REST API: 2 new endpoints
        const rest = readSnippet('rest');
        expect(rest).toContain("'/orphan-alerts'");
        expect(rest).toContain("'/orphan-alerts/dismiss'");
        expect(rest).toContain('function dinoco_sn_rest_orphan_alerts');
        expect(rest).toContain('function dinoco_sn_rest_orphan_alerts_dismiss');
    });

    test('Phase 4 W14.4 GDPR V.4.1 export extended with sn_* scope', () => {
        const filepath = path.join(REPO_ROOT, '[System] DINOCO GDPR Data Requests');
        expect(fs.existsSync(filepath)).toBe(true);
        const code = fs.readFileSync(filepath, 'utf8');

        // Version bump
        expect(code).toMatch(/Version:\s*V\.4\.1/);

        // 5 new record_counts keys initialized
        expect(code).toContain("'sn_plates'");
        expect(code).toContain("'sn_audit_events'");
        expect(code).toContain("'sn_notifications'");
        expect(code).toContain("'sn_review_requests'");
        expect(code).toContain("'sn_unavailable'");

        // Defensive function_exists guard
        expect(code).toMatch(/function_exists\(\s*['"]dinoco_sn_table_exists['"]/);
        expect(code).toMatch(/function_exists\(\s*['"]dinoco_sn_table['"]/);

        // ZIP entries added
        expect(code).toContain("'sn-plates.json'");
        expect(code).toContain("'sn-plates-meta.json'");
        expect(code).toContain("'sn-audit-events.json'");
        expect(code).toContain("'sn-notifications.json'");
        expect(code).toContain("'sn-review-requests.json'");

        // Row caps for memory defense
        expect(code).toMatch(/LIMIT 5000/);

        // Cold meta chunked at 500 (SQL placeholder limit)
        expect(code).toMatch(/array_chunk\(\s*\$sn_list,\s*500\s*\)/);

        // GdprSnExportTest exists
        const testPath = path.join(REPO_ROOT, 'tests/helpers/GdprSnExportTest.php');
        expect(fs.existsSync(testPath)).toBe(true);

        // Design doc updated
        const designPath = path.join(REPO_ROOT, 'docs/compliance/GDPR-PHASE-6-DESIGN.md');
        const designContent = fs.readFileSync(designPath, 'utf8');
        expect(designContent).toContain('sn-plates.json');
        expect(designContent).toContain('V.4.1');
    });

    test('Phase 2 W5 V.0.13 audit/export CSV endpoint registered', () => {
        const restCode = readSnippet('rest');
        // Endpoint registered
        expect(restCode).toContain("'/audit/export'");
        expect(restCode).toContain('function dinoco_sn_rest_audit_export');
        // CSV streaming with UTF-8 BOM (Excel detection)
        const handler = restCode.split('function dinoco_sn_rest_audit_export')[1] || '';
        const block = handler.split('function dinoco_sn_rest_void')[0];
        expect(block).toContain('"\\xEF\\xBB\\xBF"');  // UTF-8 BOM
        expect(block).toContain('fputcsv');
        expect(block).toContain('text/csv');
        expect(block).toContain('Content-Disposition');
        // Rate limit reuse (double-quoted because key uses {$uid} interpolation)
        expect(block).toMatch(/sn_audit_export_/);
        expect(block).toContain('b2b_rate_limit');
        // 5,000 row cap
        expect(block).toMatch(/min\(\s*5000/);
        // N+1 defense — batch user lookup
        expect(block).toContain('get_users');
        expect(block).toContain('array_unique');
        // X-Audit-Row-Count header for frontend to surface count
        expect(block).toContain('X-Audit-Row-Count');

        // Frontend wiring
        const fe = readSnippet('manager');
        expect(fe).toContain('window.dncSnExportAuditCsv = function');
        expect(fe).toContain('dncSnExportAuditCsv()');
        // Blob download (no anchor href navigation on error)
        const exportFn = fe.split('window.dncSnExportAuditCsv = function')[1] || '';
        const exBlock = exportFn.split('window.dncSnLoadLtv')[0];
        expect(exBlock).toContain('r.blob()');
        expect(exBlock).toContain('URL.createObjectURL');
        // 429 rate-limit message
        expect(exBlock).toMatch(/r\.status\s*===\s*429/);
    });

    test('Phase 3 W10 F#9 LTV detail drill-down extended (claims/reviews/cross-sell)', () => {
        const restCode = readSnippet('rest');
        // REST handler returns 3 new keys
        const handler = restCode.split('function dinoco_sn_rest_ltv_detail')[1] || '';
        const block = handler.split('function dinoco_sn_rest_stolen')[0];
        expect(block).toContain("'claims'");
        expect(block).toContain("'reviews'");
        expect(block).toContain("'cross_sell'");
        // claim_ticket integration via WP_Query + author filter
        expect(block).toContain("post_type'      => 'claim_ticket'");
        expect(block).toContain("'author'");
        // Round 15 ITEM A: meta cache priming for N+1 defense
        expect(block).toContain('update_meta_cache');
        // review_requests table query
        expect(block).toContain("dinoco_sn_table( 'review_requests' )");

        // Frontend renders 3 new sections
        const fe = readSnippet('manager');
        const detail = fe.split('window.dncSnOpenLtvDetail = function')[1] || '';
        const detailBlock = detail.split('window.dncSnCloseLtvDetail')[0];
        expect(detailBlock).toMatch(/Claim History/);
        expect(detailBlock).toMatch(/⭐ Reviews/);
        expect(detailBlock).toMatch(/Cross-Sell Suggestion/);
        // Status color coding for claims (green/red/amber)
        expect(detailBlock).toContain('#10b981');  // completed = green
        expect(detailBlock).toContain('#dc2626');  // rejected/cancelled = red
    });

    test('Phase 4 W13 F#16 Demand Forecast viewer panel in Tab 3 Pool', () => {
        const code = readSnippet('manager');
        // Render section IDs
        expect(code).toContain('dnc-sn-forecast-summary');
        expect(code).toContain('dnc-sn-forecast-critical');
        expect(code).toContain('dnc-sn-forecast-full');
        expect(code).toContain('dnc-sn-forecast-detail');
        // Section heading + heading
        expect(code).toMatch(/Demand Forecast.*F#16/);
        // 3 JS handlers
        expect(code).toContain('window.dncSnLoadForecast = function');
        expect(code).toContain('window.dncSnLoadForecastDetail = function');
        expect(code).toContain('window.dncSnCloseForecastDetail = function');
        // Wires to existing forecast/all + forecast/sku endpoints
        expect(code).toContain("'/forecast/all'");
        expect(code).toContain("'/forecast/sku/'");
        // Lazy-load on pool tab open
        expect(code).toMatch(/which === 'pool'[\s\S]{0,400}window\.dncSnLoadForecast/);
        // Critical threshold (≤60 days)
        expect(code).toMatch(/days_until_empty\s*<=\s*60/);
    });

    test('Phase 2 W7 v2.11 Member Dashboard helpers exist (read-only)', () => {
        const code = readSnippet('manager');
        // 6 read helpers per v2.11 §V.31.0 contract
        expect(code).toContain('function dinoco_sn_get_user_plates');
        expect(code).toContain('function dinoco_sn_get_user_expiring_plates');
        expect(code).toContain('function dinoco_sn_get_user_ltv');
        expect(code).toContain('function dinoco_sn_get_pending_reviews');
        expect(code).toContain('function dinoco_sn_get_user_anniversaries');
        expect(code).toContain('function dinoco_sn_get_user_stats');
    });

    test('Phase 2 W7 helpers use safe SQL patterns (no raw interpolation)', () => {
        const code = readSnippet('manager');
        // get_user_plates uses prepared statement with placeholders array
        const userPlates = code.split('function dinoco_sn_get_user_plates')[1] || '';
        const userPlatesBlock = userPlates.split('function dinoco_sn_get_user_expiring_plates')[0];
        // Must use $wpdb->prepare with %s/%d placeholders
        expect(userPlatesBlock).toMatch(/\$wpdb->prepare/);
        // Status whitelist sanitization (no raw $statuses → SQL)
        expect(userPlatesBlock).toContain('in_array');
    });

    test('Phase 2 W7 LTV helper has transient cache + null-marker guard', () => {
        const code = readSnippet('manager');
        const ltvBlock = code.split('function dinoco_sn_get_user_ltv')[1] || '';
        const block = ltvBlock.split('function dinoco_sn_get_pending_reviews')[0];
        expect(block).toContain('get_transient');
        expect(block).toContain('set_transient');
        // Null marker prevents repeated SELECT on no-snapshot users
        expect(block).toContain('__null__');
        expect(block).toContain('HOUR_IN_SECONDS');
    });

    test('Phase 2 W7 SnMemberHelpersTest exists', () => {
        const filepath = path.join(REPO_ROOT, 'tests/helpers/SnMemberHelpersTest.php');
        expect(fs.existsSync(filepath)).toBe(true);
        const content = fs.readFileSync(filepath, 'utf8');
        expect(content).toContain('sn_sanitize_status_whitelist');
        expect(content).toContain('sn_compute_member_years');
        expect(content).toContain('sn_clamp_days_window');
    });

    test('Phase 4 W12.5 F#15 HMAC raw-secret wiring (V.0.2)', () => {
        const code = readSnippet('public_api');
        // Crypto helpers exist
        expect(code).toContain('function dinoco_sn_pubapi_master_key');
        expect(code).toContain('function dinoco_sn_pubapi_encrypt');
        expect(code).toContain('function dinoco_sn_pubapi_decrypt');
        expect(code).toContain('function dinoco_sn_pubapi_compute_hmac');
        expect(code).toContain('function dinoco_sn_pubapi_ensure_secret_column');
        // AES-256-GCM specifically (not CBC/CTR)
        expect(code).toContain("'aes-256-gcm'");
        // Constant-time compare for timing-attack defense
        expect(code).toContain('hash_equals');
        // Master key 32 bytes
        expect(code).toMatch(/random_bytes\(\s*32\s*\)/);
        // IV 12 bytes (GCM standard)
        expect(code).toMatch(/random_bytes\(\s*12\s*\)/);
        // Lazy migrate hooks admin_init
        expect(code).toMatch(/add_action\(\s*['"]admin_init['"]\s*,\s*['"]dinoco_sn_pubapi_ensure_secret_column['"]/);
        // Canonical sign format: timestamp + "\n" + body
        const hmacFn = code.split('function dinoco_sn_pubapi_compute_hmac')[1] || '';
        const block = hmacFn.split('function dinoco_sn_pubapi_ensure_secret_column')[0];
        expect(block).toContain('"\\n"');
        // verify_request reads encrypted column + uses real HMAC
        expect(code).toContain('api_secret_encrypted');
        expect(code).toContain('legacy_token_no_hmac');
        // Placeholder removed
        expect(code).not.toContain('PLACEHOLDER per v2.13');
    });

    test('Phase 4 W12.5 SnPubApiHmacTest exists with crypto coverage', () => {
        const filepath = path.join(REPO_ROOT, 'tests/helpers/SnPubApiHmacTest.php');
        expect(fs.existsSync(filepath)).toBe(true);
        const content = fs.readFileSync(filepath, 'utf8');
        expect(content).toContain('test_hmac_canonical_format');
        expect(content).toContain('test_aes_round_trip');
        expect(content).toContain('test_aes_tampered_ciphertext_detected');
        expect(content).toContain('test_full_round_trip_partner_signs');
    });

    /* Q23 OVERRIDE (2026-05-05): public stolen_check shortcode REMOVED.
     * Test moved to Q23 override block above (line ~604). Snippet file
     * `[System] DINOCO Stolen Plate Public Verify` deleted from repo. */

    test('Phase 0 W1 docs deliverables exist', () => {
        const docs = [
            'docs/sn-system/README.md',
            'docs/sn-system/01-system-architecture.md',
            'docs/sn-system/02-state-machine.md',
            'docs/sn-system/03-cross-system-lifecycle.md',
            'docs/sn-system/04-open-questions.md',
            'docs/sn-system/05-schema-v1.sql',
        ];
        docs.forEach(d => {
            const filepath = path.join(REPO_ROOT, d);
            expect(fs.existsSync(filepath)).toBe(true);
        });
    });
});
