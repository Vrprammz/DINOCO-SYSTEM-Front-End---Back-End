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
    approval: '[Admin System] DINOCO SN Approval Workflow',  // Phase 2 W5 4-eyes queue
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
            "/batches/(?P<id>\\d+)/csv'",          // GET CSV (Round 3 +QR Content col)
            // qr-pdf REMOVED Round 3 — Huali factory generates QR from CSV URL
            "/receive'",                           // POST single
            "/receive/bulk'",                      // POST bulk
            "/lookup/(?P<sn>[A-Za-z0-9]+)'",       // GET public lookup
            "/required-plates'",                   // POST hierarchy
            "/version'",                           // GET health
        ];
        expected_endpoints.forEach(ep => {
            expect(code).toContain(ep);
        });
        // QR PDF endpoint deprecated to a sentinel route (kept as dead-code
        // archive for rollback if factory contract changes — Round 3 boss decision)
        expect(code).toContain('/qr-pdf-DEPRECATED-R3');
        expect(code).not.toMatch(/['"]\/batches\/\(\?P<id>\\d\+\)\/qr-pdf['"]/);
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

    test('Q22 OVERRIDE — F#15 Public API DEFERRED (flag-gated 503)', () => {
        // Boss decision (2026-05-05): "ยังไม่มีแผนใช้ — Phase 4 W12 ตัดออกชั่วคราว"
        const code = fs.readFileSync(path.join(REPO_ROOT, SN_SNIPPETS.public_api), 'utf8');
        // Flag default OFF
        expect(code).toMatch(/get_option\(\s*'dinoco_sn_pubapi_enabled'\s*,\s*'0'\s*\)/);
        // 503 feature_disabled response when flag OFF
        expect(code).toContain("'feature_disabled'");
        expect(code).toMatch(/'status'\s*=>\s*503/);
        // Q22 marker in header docblock
        expect(code).toMatch(/Q22 OVERRIDE/);
    });

    test('Phase 2 W5.4 — 3-tier approval classifier + SLA helper', () => {
        const code = readSnippet('rest');

        // Functions defined
        expect(code).toContain('function dinoco_sn_classify_approval_tier');
        expect(code).toContain('function dinoco_sn_get_approval_sla_seconds');

        // 3 tiers
        expect(code).toMatch(/return\s+'4_eyes'/);
        expect(code).toMatch(/return\s+'single_admin'/);
        expect(code).toMatch(/return\s+'auto'/);

        // 4-eyes triggers (boss decision rules per v2.13 §2.7)
        expect(code).toMatch(/'recall'/);  // recall always 4-eyes
        expect(code).toMatch(/'registered'/);  // swap/void registered
        expect(code).toMatch(/'claimed'/);  // swap/void claimed
        expect(code).toMatch(/\$bulk_count\s*>\s*100/);  // bulk threshold

        // SLA windows
        expect(code).toMatch(/3600/);     // 1h urgent
        expect(code).toMatch(/86400/);    // 24h normal
        expect(code).toMatch(/259200/);   // 72h low
    });

    test('Phase 2 W6.2 — Manual Invoice SN allocation scaffold', () => {
        const filepath = path.join(REPO_ROOT, '[Admin System] DINOCO Manual Invoice System');
        const code = fs.readFileSync(filepath, 'utf8');

        // V.35.0 marker present in version header
        expect(code).toMatch(/V\.35\.0.*Phase 2 W6\.2/);

        // Helper function defined
        expect(code).toContain('function dinoco_inv_check_sn_required_items');

        // Defensive column existence check
        expect(code).toMatch(/sn_attach_level/);
        expect(code).toMatch(/information_schema\.columns/);

        // Skip rules: none / empty / not-required
        expect(code).toMatch(/'none'/);
        expect(code).toMatch(/sn_required/);

        // Hooks called from notify phase
        expect(code).toContain("'_b2b_sn_pending_alloc'");
        expect(code).toMatch(/dinoco_inv_check_sn_required_items\(\s*\$post_id\s*\)/);

        // Defensive function_exists guards
        expect(code).toMatch(/function_exists\(\s*'dinoco_sn_required_plates_for_sku'\s*\)/);
        expect(code).toMatch(/function_exists\(\s*'dinoco_sn_obs_capture'\s*\)/);

        // Try/catch — never throws from notify phase
        expect(code).toMatch(/catch\s*\(\s*\\Throwable\s+\$e\s*\)/);

        // Companion test exists
        const testFile = path.join(REPO_ROOT, 'tests/helpers/SnInvoiceCheckRequiredTest.php');
        expect(fs.existsSync(testFile)).toBe(true);
    });

    test('Round 3 — Factory QR generation: CSV +QR Content URL column, QR PDF removed', () => {
        const rest = readSnippet('rest');
        const manager = readSnippet('manager');

        // CSV header must include "QR Content" column (boss decision Round 3 format B)
        expect(rest).toContain('"S/N,Prefix,Status,Created At,Batch Code,QR Content\\n"');

        // CSV row format includes URL form B
        expect(rest).toMatch(/home_url\(\s*'\/warranty\/activate\?sn='\s*\)/);
        expect(rest).toMatch(/rawurlencode\(\s*\$row->sn\s*\)/);

        // QR PDF route DEPRECATED (renamed to -DEPRECATED-R3 sentinel)
        expect(rest).toContain('/qr-pdf-DEPRECATED-R3');

        // Manager UI: QR PDF button removed (replaced with comment marker)
        expect(manager).not.toMatch(/onclick="dncSnDownloadQrPdf/);
        expect(manager).toContain('CSV (รวม QR URL)');

        // dncSnDownloadQrPdf function REMOVED (replaced with deprecation comment)
        expect(manager).not.toMatch(/window\.dncSnDownloadQrPdf\s*=\s*function/);
        expect(manager).toMatch(/dncSnDownloadQrPdf — REMOVED Round 3/);
    });

    test('Round 3 — First-time login flow uses LINE OAuth state-token system', () => {
        const liff = readSnippet('liff');
        const callback = fs.readFileSync(path.join(REPO_ROOT, '[System] LINE Callback'), 'utf8');

        // LIFF activation snippet uses LINE OAuth (not generic wp_login_url)
        expect(liff).toMatch(/access\.line\.me\/oauth2\/v2\.1\/authorize/);
        expect(liff).toContain('WARRANTY_ACTIVATE_SN');
        expect(liff).toContain('dinoco_line_state_');
        expect(liff).toMatch(/wp_generate_password\(\s*32/);
        expect(liff).toMatch(/set_transient/);

        // Constants used (defensive)
        expect(liff).toContain('DINOCO_LINE_CHANNEL_ID');
        expect(liff).toContain('DINOCO_LINE_REDIRECT_URI');

        // Big LINE-branded button (UX upgrade)
        expect(liff).toContain('#06C755'); // LINE green
        expect(liff).toMatch(/min-height:\s*48px/); // touch target ≥ 44px

        // LINE Callback handles WARRANTY_ACTIVATE_SN intent
        expect(callback).toContain('WARRANTY_ACTIVATE_SN');
        expect(callback).toMatch(/\/warranty\/activate\//);

        // Defensive guard: empty constants → red error (not broken button)
        expect(liff).toMatch(/ระบบ LINE Login ไม่พร้อมใช้งาน/);

        // Plan doc exists
        const planDoc = path.join(REPO_ROOT, 'docs/sn-system/14-first-time-login-flow.md');
        expect(fs.existsSync(planDoc)).toBe(true);
    });

    test('Phase 1 W4.2 — dinoco_sn_obs_capture wired into 4 sensitive ops', () => {
        const rest = readSnippet('rest');
        const liff = readSnippet('liff');

        // batch_create_attempt in REST handler
        expect(rest).toContain("'batch_create_attempt'");
        // receive_attempt in REST handler
        expect(rest).toContain("'receive_attempt'");
        // void_attempt in REST handler (sensitive 4-eyes op)
        expect(rest).toContain("'void_attempt'");
        // swap_attempt in REST handler (sensitive 4-eyes op)
        expect(rest).toContain("'swap_attempt'");
        // activate_attempt in LIFF (high-volume customer op)
        expect(liff).toContain("'activate_attempt'");

        // All wired with function_exists guard (defensive — never throw if obs not loaded)
        const guardCount = (rest.match(/function_exists\(\s*'dinoco_sn_obs_capture'\s*\)/g) || []).length;
        expect(guardCount).toBeGreaterThanOrEqual(4); // batch + receive + void + swap

        const liffGuardCount = (liff.match(/function_exists\(\s*'dinoco_sn_obs_capture'\s*\)/g) || []).length;
        expect(liffGuardCount).toBeGreaterThanOrEqual(1); // activate
    });

    test('Phase 1 W4 — Pre-flight check + observability helpers present', () => {
        const code = readSnippet('manager');

        // Pre-flight check function
        expect(code).toContain('function dinoco_sn_preflight_check_batch');
        expect(code).toContain('function dinoco_sn_compute_hierarchy_depth');

        // Returns structured report shape
        expect(code).toMatch(/'plates_required_total'\s*=>/);
        expect(code).toMatch(/'plates_per_sku'\s*=>/);
        expect(code).toMatch(/'warnings'\s*=>\s*array/);
        expect(code).toMatch(/'errors'\s*=>\s*array/);

        // Error codes catalog
        ['no_skus', 'empty_sku', 'sku_attach_level_none', 'no_plates_resolved',
         'depth_exceeds_max', 'batch_qty_too_small'].forEach(c => {
            expect(code).toContain(`'${c}'`);
        });

        // DD-3 + DD-4 guards
        expect(code).toMatch(/in_array\(\s*\$sku,\s*\$visited,\s*true\s*\)/); // circular ref
        expect(code).toMatch(/\$depth\s*>\s*5/); // safety cap

        // Observability wrapper
        expect(code).toContain('function dinoco_sn_obs_capture');
        expect(code).toMatch(/function_exists\(\s*'dinoco_obs_capture'\s*\)/); // defensive
        expect(code).toMatch(/catch\s*\(\s*\\Throwable\s+\$e\s*\)/); // never throw
    });

    test('Q15 OVERRIDE — User Role Manager snippet exists + 4 roles + 13 caps', () => {
        // Boss decision (2026-05-05): "ทำ Backend UserAdmin Role-based access control"
        const filepath = path.join(REPO_ROOT, '[Admin System] DINOCO User Role Manager');
        expect(fs.existsSync(filepath)).toBe(true);
        const code = fs.readFileSync(filepath, 'utf8');

        // 4 custom roles registered
        ['dinoco_sn_approver', 'dinoco_sn_warehouse', 'dinoco_sn_view_pii', 'dinoco_sn_readonly'].forEach(role => {
            expect(code).toContain(`add_role( '${role}'`);
        });

        // Capabilities catalog function exists
        expect(code).toContain('function dinoco_sn_caps_list');

        // Permission helper with backward compat fallback
        expect(code).toContain('function dinoco_sn_user_can');
        expect(code).toMatch(/get_option\(\s*'dinoco_sn_strict_role_check'\s*,\s*'0'\s*\)/);

        // 13 caps from Q15 spec
        const expected_caps = [
            'dinoco_sn_warehouse', 'dinoco_sn_approver',
            'dinoco_sn_approve_swap', 'dinoco_sn_approve_void', 'dinoco_sn_approve_recall',
            'dinoco_sn_view_pii', 'dinoco_sn_view_pii_full', 'dinoco_sn_export_pii',
            'dinoco_sn_view_dashboard', 'dinoco_sn_view_audit', 'dinoco_sn_view_inventory',
            'dinoco_sn_manage_settings', 'dinoco_sn_manage_users',
        ];
        expected_caps.forEach(cap => {
            expect(code).toContain(`'${cap}'`);
        });

        // Idempotent registration via version marker
        expect(code).toMatch(/dinoco_sn_roles_registered_version/);

        // Module Registry self-registration
        expect(code).toContain('dinoco_register_admin_module');
        expect(code).toContain("'sn_roles'");
        expect(code).toContain("'dinoco_admin_user_roles'");

        // Q15 plan doc exists
        const planDoc = path.join(REPO_ROOT, 'docs/sn-system/09-q15-role-based-access-control.md');
        expect(fs.existsSync(planDoc)).toBe(true);
    });

    test('Q6+Q8 — F#8 extension price helper stubs present (Phase 4 W12 wiring)', () => {
        // Boss decisions (2026-05-05):
        //   Q6: F#8 Phase 5 → Phase 4 W12-13 + ทำให้ละเอียดที่สุด
        //   Q8: per-SKU manual pricing (admin กรอกราคาแต่ละ SKU ต่อปี)
        const code = readSnippet('rest');
        // Helper functions defined
        expect(code).toContain('function dinoco_sn_get_extension_price');
        expect(code).toContain('function dinoco_sn_extension_available');
        // Defensive guards (no DB access until Phase 4 W12 ALTER lands)
        expect(code).toMatch(/class_exists\(\s*'DINOCO_Catalog'\s*\)/);
        expect(code).toMatch(/sn_ext_price_\{?\$years\}?y/);
        // Years validation
        expect(code).toMatch(/in_array\(\s*\(int\)\s*\$years,\s*array\(\s*1,\s*2,\s*3\s*\)/);
        // Replan doc exists
        const planDoc = path.join(REPO_ROOT, 'docs/sn-system/08-f8-extension-marketplace-q6-q8-q7-q20-replan.md');
        expect(fs.existsSync(planDoc)).toBe(true);
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

    /* ═════════════════════════════════════════════════════════════════════
     * Phase 2 W5 — SN Approval Workflow drift assertions
     * Source: [Admin System] DINOCO SN Approval Workflow V.0.1+
     * ═════════════════════════════════════════════════════════════════════ */

    test('Phase 2 W5 SN Approval Workflow snippet exists', () => {
        const code = readSnippet('approval');
        expect(code).toMatch(/Version: V\.0\.[1-9]/);
        expect(code).toContain('[Admin System] DINOCO SN Approval Workflow');
    });

    test('Phase 2 W5 approval workflow registers 6 REST endpoints', () => {
        const code = readSnippet('approval');
        // POST /approval/request — actor creates
        expect(code).toContain("'/approval/request'");
        // POST /approval/{uuid}/approve
        expect(code).toMatch(/['"]\/approval\/\(\?P<uuid>\[a-f0-9\\\\-\]\{36\}\)\/approve['"]/);
        // POST /approval/{uuid}/reject
        expect(code).toMatch(/['"]\/approval\/\(\?P<uuid>\[a-f0-9\\\\-\]\{36\}\)\/reject['"]/);
        // POST /approval/{uuid}/cancel
        expect(code).toMatch(/['"]\/approval\/\(\?P<uuid>\[a-f0-9\\\\-\]\{36\}\)\/cancel['"]/);
        // GET /approval/pending
        expect(code).toContain("'/approval/pending'");
        // GET /approval/{uuid} — single
        expect(code).toMatch(/['"]\/approval\/\(\?P<uuid>\[a-f0-9\\\\-\]\{36\}\)['"]/);
    });

    test('Phase 2 W5 approval workflow uses idempotency wrapper for POST', () => {
        const code = readSnippet('approval');
        // All 4 write endpoints route through dinoco_sn_with_idempotency()
        expect(code).toMatch(/dinoco_sn_with_idempotency\([^)]*'approval-request'/);
        expect(code).toMatch(/dinoco_sn_with_idempotency\([^)]*'approval-approve'/);
        expect(code).toMatch(/dinoco_sn_with_idempotency\([^)]*'approval-reject'/);
        expect(code).toMatch(/dinoco_sn_with_idempotency\([^)]*'approval-cancel'/);
    });

    test('Phase 2 W5 approval workflow schema utf8mb4_bin on sn columns', () => {
        const code = readSnippet('approval');
        // Schema CREATE TABLE present
        expect(code).toContain('CREATE TABLE');
        expect(code).toContain('dinoco_sn_approval_requests');
        // Required columns
        expect(code).toContain('request_uuid CHAR(36)');
        expect(code).toContain("status VARCHAR(20) NOT NULL DEFAULT 'pending'");
        expect(code).toContain('expires_at DATETIME NOT NULL');
        expect(code).toContain('actor_user_id BIGINT');
        // Composite index for status+expires (cron hot path)
        expect(code).toContain('KEY idx_status_expires (status, expires_at)');
        // utf8mb4_bin enforced via ALTER post-create (case-sensitive S/N)
        expect(code).toMatch(/MODIFY sn VARCHAR\(40\) COLLATE utf8mb4_bin NOT NULL/);
    });

    test('Phase 2 W5 self-approval block logic present', () => {
        const code = readSnippet('approval');
        // Helper function exists
        expect(code).toContain('function dinoco_sn_check_self_approval_block');
        // Block enforced inside atomic_transition() for approve/reject paths
        expect(code).toMatch(/self_approval_blocked/);
        expect(code).toMatch(/actor_user_id.*===.*approver_id|approver_id.*===.*actor_user_id/);
    });

    test('Phase 2 W5 approval cron registered with heartbeat option', () => {
        const code = readSnippet('approval');
        // Cron hook name
        expect(code).toContain('dinoco_sn_approval_sla_cron');
        // SLA runner function
        expect(code).toContain('function dinoco_sn_run_approval_sla');
        // Heartbeat write (Round 28+ pattern)
        expect(code).toContain('dinoco_cron_sn_approval_sla_last_run');
        // Prefer registry pattern with fallback
        expect(code).toContain('dinoco_register_cron');
    });

    test('Phase 2 W5 approval workflow Telegram alert defensive', () => {
        const code = readSnippet('approval');
        // Telegram helper called via function_exists guard
        expect(code).toMatch(/function_exists\(\s*['"]b2b_tg_send_dedup['"]/);
        expect(code).toMatch(/function_exists\(\s*['"]sendTelegramAlert['"]/);
        // Both urgent-on-create + expire branches integrate
        expect(code).toContain('dinoco_sn_approval_notify_telegram_urgent');
    });

    test('Phase 2 W5 approval workflow fires action hooks for executors', () => {
        const code = readSnippet('approval');
        // Hooks consumed by executor snippets (REST API listens to do actual swap/void/...)
        expect(code).toContain("do_action( 'dinoco_sn_approval_approved'");
        expect(code).toContain("do_action( 'dinoco_sn_approval_rejected'");
        expect(code).toContain("do_action( 'dinoco_sn_approval_cancelled'");
        expect(code).toContain("do_action( 'dinoco_sn_approval_expired'");
    });

    test('Phase 2 W5 approval workflow atomic transitions GET_LOCK + transaction', () => {
        const code = readSnippet('approval');
        // Lock acquisition
        expect(code).toMatch(/SELECT GET_LOCK/);
        // Transaction wrap
        expect(code).toContain("'START TRANSACTION'");
        expect(code).toContain("'COMMIT'");
        expect(code).toContain("'ROLLBACK'");
        // FOR UPDATE on read-modify-write row
        expect(code).toMatch(/FOR UPDATE/);
        // Lock always released (try/finally)
        expect(code).toMatch(/RELEASE_LOCK/);
    });

    test('Phase 2 W5 approval state machine valid transitions only', () => {
        const code = readSnippet('approval');
        // dinoco_sn_approval_can_transition() exists + asserts pending source only
        expect(code).toContain('function dinoco_sn_approval_can_transition');
        expect(code).toMatch(/\$from\s*!==\s*['"]pending['"]/);
        // 4 valid targets
        expect(code).toMatch(/['"]approved['"]\s*,\s*['"]rejected['"]\s*,\s*['"]expired['"]\s*,\s*['"]cancelled['"]/);
    });

    test('Phase 2 W5 SnApprovalWorkflowTest exists with state-machine + UUID coverage', () => {
        const filepath = path.join(REPO_ROOT, 'tests/helpers/SnApprovalWorkflowTest.php');
        expect(fs.existsSync(filepath)).toBe(true);
        const content = fs.readFileSync(filepath, 'utf8');
        // State machine
        expect(content).toContain('test_pending_to_approved_allowed');
        expect(content).toContain('test_approved_to_anything_blocked');
        // Self-approval
        expect(content).toContain('test_self_approval_blocked_when_same_user');
        // UUID
        expect(content).toContain('test_uuid_format_v4_compliant');
        expect(content).toContain('test_uuid_uniqueness_across_invocations');
        // SLA
        expect(content).toContain('test_sla_4eyes_urgent_1_hour');
    });

    /* ════════════════════════════════════════════════════════════════
     * Phase 2 W5.1+W5.2 — Tab 4 Universal Search + Investigation Timeline
     * Manager V.0.25 (this round's deliverable)
     * ════════════════════════════════════════════════════════════════ */

    test('Phase 2 W5.1 Tab 4 search bar + power-user query input present', () => {
        const code = readSnippet('manager');
        expect(code).toContain('id="dnc-sn-tab-manage-q"');
        expect(code).toContain('class="dnc-sn-input dnc-sn-tab-manage-q"');
        expect(code).toContain('id="dnc-sn-tab-manage-results"');
        expect(code).toContain('Power-user query');
    });

    test('Phase 2 W5.1 Tab 4 syntax hint lists all 7 filter prefixes', () => {
        const code = readSnippet('manager');
        const prefixes = ['phone:', 'line:', 'sku:', 'batch:', 'status:', 'since:', 'actor:'];
        prefixes.forEach(p => {
            expect(code).toContain(p);
        });
    });

    test('Phase 2 W5.1 Tab 4 quick filter chips present (5+ chips)', () => {
        const code = readSnippet('manager');
        const chips = [
            'data-chip="active"',
            'data-chip="claim"',
            'data-chip="voided"',
            'data-chip="recent_shipped"',
            'data-chip="recent_activated"',
        ];
        chips.forEach(c => expect(code).toContain(c));
        expect(code).toContain('pending_approval');
    });

    test('Phase 2 W5.2 Tab 4 investigation timeline modal markup', () => {
        const code = readSnippet('manager');
        expect(code).toContain('id="dnc-sn-tab-manage-modal-overlay"');
        expect(code).toContain('id="dnc-sn-tab-manage-modal-body"');
        expect(code).toContain('id="dnc-sn-tab-manage-modal-sn"');
        expect(code).toContain('dnc-sn-tab-manage-timeline');
    });

    test('Phase 2 W5.2 Tab 4 has 4 modal action buttons (swap/void/recall/close)', () => {
        const code = readSnippet('manager');
        expect(code).toMatch(/dncSnTabManageRequestAction\(['"]swap['"]\)/);
        expect(code).toMatch(/dncSnTabManageRequestAction\(['"]void['"]\)/);
        expect(code).toMatch(/dncSnTabManageRequestAction\(['"]recall['"]\)/);
        expect(code).toMatch(/dncSnTabManageCloseModal\(\)/);
    });

    test('Phase 2 W5.2 Tab 4 sub-modal action confirm w/ urgency + reason', () => {
        const code = readSnippet('manager');
        expect(code).toContain('id="dnc-sn-tab-manage-action-overlay"');
        expect(code).toContain('id="dnc-sn-tab-manage-action-urgency"');
        expect(code).toContain('id="dnc-sn-tab-manage-action-reason"');
        expect(code).toContain('value="urgent"');
        expect(code).toContain('value="normal"');
        expect(code).toContain('value="low"');
        expect(code).toMatch(/reason\.length\s*<\s*10/);
    });

    test('Phase 2 W5.2 Tab 4 approver pending panel conditional render', () => {
        const code = readSnippet('manager');
        expect(code).toMatch(/current_user_can\(\s*['"]dinoco_sn_approver['"]/);
        expect(code).toContain('id="dnc-sn-tab-manage-approvals"');
        expect(code).toContain('id="dnc-sn-tab-manage-approvals-body"');
        expect(code).toContain('id="dnc-sn-tab-manage-approvals-count"');
    });

    test('Phase 2 W5.2 Tab 4 PHP helper functions defined in manager', () => {
        const code = readSnippet('manager');
        expect(code).toContain('function dinoco_sn_parse_search_query');
        expect(code).toContain('function dinoco_sn_search_plates');
        expect(code).toContain('function dinoco_sn_get_timeline_for_sn');
        expect(code).toContain('function dinoco_sn_mask_phone_for_display');
    });

    test('Phase 2 W5.2 Tab 4 JS handlers wired (search/timeline/action)', () => {
        const code = readSnippet('manager');
        const handlers = [
            'dncSnTabManageSearch',
            'dncSnTabManageOpenTimeline',
            'dncSnTabManageCloseModal',
            'dncSnTabManageRequestAction',
            'dncSnTabManageSubmitAction',
            'dncSnTabManageCloseActionModal',
            'dncSnTabManageQuickChip',
            'dncSnTabManageLoadPendingApprovals',
            'dncSnTabManageApprove',
            'dncSnTabManageReject',
        ];
        handlers.forEach(h => {
            expect(code).toContain('window.' + h);
        });
    });

    test('Phase 2 W5.2 Tab 4 modal helpers fallback pattern (try/catch + native)', () => {
        const code = readSnippet('manager');
        expect(code).toContain('window.dinocoModal');
        expect(code).toContain('_dncSnTabManageCfm');
        expect(code).toContain('_dncSnTabManageAlert');
        expect(code).toMatch(/window\.confirm\(/);
        expect(code).toMatch(/window\.alert\(/);
    });

    test('Phase 2 W5.2 Tab 4 POST calls include X-WP-Nonce + X-Idempotency-Key', () => {
        const code = readSnippet('manager');
        const submitFn = code.split('window.dncSnTabManageSubmitAction')[1] || '';
        const submitBlock = submitFn.split('window.dncSnTabManageLoadPendingApprovals')[0];
        expect(submitBlock).toContain("'X-WP-Nonce'");
        expect(submitBlock).toContain("'X-Idempotency-Key'");
        // Decide helper is the function block (skip past the call sites)
        const decideFn = code.split('function _dncSnTabManageDecide')[1] || '';
        expect(decideFn).toContain("'X-WP-Nonce'");
        expect(decideFn).toContain("'X-Idempotency-Key'");
    });

    test('Phase 2 W5.2 Tab 4 uses crypto.randomUUID for idempotency keys', () => {
        const code = readSnippet('manager');
        expect(code).toContain('window.crypto');
        expect(code).toContain('randomUUID');
    });

    test('Phase 2 W5.2 Tab 4 PII masking helper enforced for phone', () => {
        const code = readSnippet('manager');
        expect(code).toContain('function dinoco_sn_mask_phone_for_display');
        expect(code).toContain("'dinoco_sn_view_pii'");
    });

    test('Phase 2 W5.2 Tab 4 search uses prepared SQL (no raw interpolation)', () => {
        const code = readSnippet('manager');
        const searchFn = code.split('function dinoco_sn_search_plates')[1] || '';
        const block = searchFn.split('function dinoco_sn_get_timeline_for_sn')[0];
        expect(block).toContain('$wpdb->prepare');
        expect(block).toContain('%s');
        expect(block).toContain('esc_like');
        expect(block).toContain('in_array');
    });

    test('Phase 2 W5.2 Tab 4 status filter has whitelist for safety', () => {
        const code = readSnippet('manager');
        const searchFn = code.split('function dinoco_sn_search_plates')[1] || '';
        ['reserved', 'in_pool', 'registered', 'claimed', 'voided', 'recalled'].forEach(s => {
            expect(searchFn).toContain(`'${s}'`);
        });
    });

    test('Phase 2 W5.2 Tab 4 V.0.25 version bump in header', () => {
        const code = readSnippet('manager');
        expect(code).toMatch(/Version: V\.0\.25/);
        expect(code).toContain('Phase 2 W5.1+W5.2 Tab 4');
    });

    test('Phase 2 W5.2 Tab 4 SnSearchQueryParserTest exists', () => {
        const filepath = path.join(REPO_ROOT, 'tests/helpers/SnSearchQueryParserTest.php');
        expect(fs.existsSync(filepath)).toBe(true);
        const content = fs.readFileSync(filepath, 'utf8');
        expect(content).toContain('test_exact_sn_detected_for_long_alnum_token');
        expect(content).toContain('test_phone_filter_strips_non_digits');
        expect(content).toContain('test_combined_sku_and_status_filters');
        expect(content).toContain('sn_parse_search_query');
    });

    test('Phase 2 W5.2 Tab 4 modal accessibility (role + aria-modal)', () => {
        const code = readSnippet('manager');
        expect(code).toContain('role="dialog"');
        expect(code).toContain('aria-modal="true"');
        expect(code).toContain('aria-labelledby');
    });

    test('Phase 2 W5.2 Tab 4 touch target >=44px enforced on action buttons', () => {
        const code = readSnippet('manager');
        const matches = (code.match(/min-height:\s*44px/g) || []).length;
        expect(matches).toBeGreaterThanOrEqual(4);
    });

    test('Phase 2 W5.2 Tab 4 calls approval workflow REST routes', () => {
        const code = readSnippet('manager');
        expect(code).toContain('/approval/request');
        expect(code).toContain('/approval/pending');
        // Approve/reject is called via dynamic decision arg, not literal path
        expect(code).toContain("/approval/' + encodeURIComponent(uuid) + '/' + decision");
        expect(code).toContain("'approve'");
        expect(code).toContain("'reject'");
    });

    test('Phase 2 W5.2 Tab 4 defensive — degrades when approval workflow missing', () => {
        const code = readSnippet('manager');
        expect(code).toContain('Approval workflow ยังไม่ active');
    });

    /* ──────────────────────────────────────────────────────────────────
     * Phase 2 W6.1 — [System] DINOCO Gateway Unified Flow Option B
     * Plan ref: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.7 §B1
     * Boss decision Q3: scan-first primary, type S/N secondary,
     *                   legacy fallback tertiary.
     * Boss R3 (2026-05-07): QR Content format = B (URL with sn= param).
     * ────────────────────────────────────────────────────────────────── */
    describe('Phase 2 W6.1 — Gateway Unified Flow Option B (boss Q3)', () => {

        const GATEWAY_FILE = '[System] DINOCO Gateway';
        const readGateway = () => {
            const filepath = path.join(REPO_ROOT, GATEWAY_FILE);
            if (!fs.existsSync(filepath)) {
                throw new Error(`Gateway snippet not found: ${GATEWAY_FILE}`);
            }
            return fs.readFileSync(filepath, 'utf8');
        };

        test('Gateway snippet exists', () => {
            const filepath = path.join(REPO_ROOT, GATEWAY_FILE);
            expect(fs.existsSync(filepath)).toBe(true);
        });

        test('Gateway version bumped to V.31.0+ (Phase 2 W6.1)', () => {
            const code = readGateway();
            expect(code).toMatch(/Version:\s*V\.3[1-9]\.\d+/);
        });

        test('Section heading "หรือ ลงทะเบียนสินค้าใหม่" present', () => {
            const code = readGateway();
            expect(code).toContain('หรือ ลงทะเบียนสินค้าใหม่');
        });

        test('Scan QR primary CTA present (📷 + "สแกน QR เพลทบนสินค้า")', () => {
            const code = readGateway();
            expect(code).toContain('📷');
            expect(code).toContain('สแกน QR เพลทบนสินค้า');
            expect(code).toContain('id="dnc-gateway-sn-scan-btn"');
        });

        test('Helper text "เร็วที่สุด — 5 วินาที" present', () => {
            const code = readGateway();
            expect(code).toContain('เร็วที่สุด');
            expect(code).toContain('5 วินาที');
        });

        test('Type S/N input + ⌨️ icon + DNCSS placeholder present', () => {
            const code = readGateway();
            expect(code).toContain('⌨️');
            expect(code).toContain('id="dnc-gateway-sn-input"');
            expect(code).toContain('DNCSS0000000');
            expect(code).toContain('id="dnc-gateway-sn-submit"');
        });

        test('Legacy migration tertiary link present', () => {
            const code = readGateway();
            expect(code).toContain('สินค้าเก่าที่ไม่มี plate');
            expect(code).toContain('/legacy-migration/');
            expect(code).toMatch(/dnc-gateway-sn-legacy/);
        });

        test('CSS scope prefix .dnc-gateway-sn-* used (not leaking to .dinoco-app-screen)', () => {
            const code = readGateway();
            // Must declare scoped namespace
            expect(code).toMatch(/\.dnc-gateway-sn-section/);
            expect(code).toMatch(/\.dnc-gateway-sn-scan-btn/);
            expect(code).toMatch(/\.dnc-gateway-sn-input/);
            // Existing surface preserved
            expect(code).toContain('.dinoco-app-screen');
        });

        test('html5-qrcode lazy-load pattern (CDN load on first scan click)', () => {
            const code = readGateway();
            // Lazy load on click — script element appended, not <script src> on page load
            expect(code).toContain('html5-qrcode');
            expect(code).toContain('cdn.jsdelivr.net');
            // Cache flag (so re-clicks reuse the cached library)
            expect(code).toContain('_html5QrcodeLoaded');
            // Defensive optional override hook for snippet authors
            expect(code).toContain('html5_qrcode_lazy_load');
        });

        test('QR parser function dinoco_gateway_qr_parse defined inline', () => {
            const code = readGateway();
            expect(code).toContain('dinoco_gateway_qr_parse');
            // Exposed on window for sharing/debug
            expect(code).toContain('dinocoGatewayQrParse');
        });

        test('Boss R3 — QR Content format B (URL ?sn= parsing) present', () => {
            const code = readGateway();
            // Must parse https?:// URLs and extract `sn` query param
            expect(code).toMatch(/searchParams\.get\(\s*['"]sn['"]\s*\)/);
            expect(code).toMatch(/\/\^https\?:\\\/\\\//);
        });

        test('Defensive — graceful camera deny handling (fallback to typed input)', () => {
            const code = readGateway();
            // Camera-error path should highlight typed input + show fallback message
            expect(code).toContain('ไม่สามารถเปิดกล้อง');
            expect(code).toContain('พิมพ์ S/N เอง');
            // Catch on .start() promise (camera permission denied)
            expect(code).toMatch(/\.catch\(\s*function\s*\(/);
        });

        test('Activate URL points to /warranty/activate?sn=', () => {
            const code = readGateway();
            expect(code).toContain('/warranty/activate');
            expect(code).toContain("'?sn='");
            expect(code).toContain('encodeURIComponent');
        });

        test('Existing LINE OAuth flow preserved (additive only)', () => {
            const code = readGateway();
            // Must keep V.30.3 OAuth state-token nonce logic intact
            expect(code).toContain('dinoco_line_state_');
            expect(code).toContain('GENERAL_LOGIN');
            expect(code).toContain('scope=profile%20openid');
            // Original LINE login button still rendered for guests
            expect(code).toContain('เข้าสู่ระบบ / สมัครสมาชิก');
        });

        test('Touch targets ≥44px on input + scan button + close button', () => {
            const code = readGateway();
            // min-height: 60px scan button, 44px input/submit/close
            expect(code).toMatch(/\.dnc-gateway-sn-scan-btn[^}]*min-height:\s*60px/s);
            expect(code).toMatch(/\.dnc-gateway-sn-input[^}]*min-height:\s*44px/s);
            expect(code).toMatch(/\.dnc-gateway-sn-submit[^}]*min-height:\s*44px/s);
            expect(code).toMatch(/\.dnc-gateway-sn-qr-close[^}]*min-height:\s*44px/s);
        });

        test('Mobile-first responsive (≤640px media query present)', () => {
            const code = readGateway();
            expect(code).toMatch(/@media\s*\(\s*max-width:\s*640px\s*\)/);
        });

        test('Defensive obs hook (dinoco_sn_obs_capture) — guarded with typeof', () => {
            const code = readGateway();
            expect(code).toContain('dinoco_sn_obs_capture');
            expect(code).toContain('gateway_scan_success');
            // Must be defensive — typeof check before call
            expect(code).toMatch(/typeof\s+window\.dinoco_sn_obs_capture\s*===\s*['"]function['"]/);
        });

        test('New section is guest-only (renders inside is_logged_in else branch)', () => {
            const code = readGateway();
            // Drift guard: rendered scan-button element (id=) must appear AFTER
            // the guest LINE login CTA literal and BEFORE the closing endif of
            // the guest branch. We match the rendered DOM marker, not CSS rules.
            const scanIdx  = code.indexOf('id="dnc-gateway-sn-scan-btn"');
            const lineIdx  = code.indexOf('เข้าสู่ระบบ / สมัครสมาชิก');
            const endifIdx = code.lastIndexOf('endif;');
            expect(scanIdx).toBeGreaterThan(-1);
            expect(lineIdx).toBeGreaterThan(-1);
            expect(scanIdx).toBeGreaterThan(lineIdx);
            expect(endifIdx).toBeGreaterThan(scanIdx);
        });

        test('PHPUnit pure-logic test SnGatewayQrParserTest.php exists', () => {
            const filepath = path.join(REPO_ROOT, 'tests', 'helpers', 'SnGatewayQrParserTest.php');
            expect(fs.existsSync(filepath)).toBe(true);
            const content = fs.readFileSync(filepath, 'utf8');
            expect(content).toContain('class SnGatewayQrParserTest');
            expect(content).toContain('dinoco_gateway_qr_parse');
        });

        test('ESC key closes QR overlay (a11y)', () => {
            const code = readGateway();
            expect(code).toMatch(/e\.key\s*===\s*['"]Escape['"]/);
            expect(code).toContain('closeQrOverlay');
        });

        test('ARIA — overlay role=dialog + aria-hidden toggling', () => {
            const code = readGateway();
            expect(code).toContain('role="dialog"');
            expect(code).toContain('aria-hidden');
            expect(code).toMatch(/aria-label\s*=/);
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // Phase 2 W6.4 + W6.5 — Service Center + Claim System sn_pool integration
    // ─────────────────────────────────────────────────────────────────────

    describe('Phase 2 W6.4 + W6.5 — Service Center + Claim System sn_pool integration', () => {

        const readRepoFile = (relPath) => {
            const filepath = path.join(REPO_ROOT, relPath);
            if (!fs.existsSync(filepath)) {
                throw new Error(`File not found: ${relPath}`);
            }
            return fs.readFileSync(filepath, 'utf8');
        };

        test('Service Center bumped to V.31.0', () => {
            const code = readRepoFile('[Admin System] DINOCO Service Center & Claims');
            expect(code).toMatch(/Version: V\.31\.0/);
            expect(code).toContain('Phase 2 W6.4 sn_pool integration');
        });

        test('Service Center listener function defined', () => {
            const code = readRepoFile('[Admin System] DINOCO Service Center & Claims');
            expect(code).toContain('function dinoco_sn_claim_status_changed');
            expect(code).toContain("add_action( 'dinoco/claim/state_changed', 'dinoco_sn_claim_status_changed'");
        });

        test('Service Center mapping function defined', () => {
            const code = readRepoFile('[Admin System] DINOCO Service Center & Claims');
            expect(code).toContain('function dinoco_sn_map_claim_to_pool_status');
        });

        test('lookup helper dinoco_sn_lookup_by_warranty_id defined with defensive guards', () => {
            const code = readRepoFile('[Admin System] DINOCO Service Center & Claims');
            expect(code).toContain('function dinoco_sn_lookup_by_warranty_id');
            expect(code).toContain('information_schema.tables');
            expect(code).toContain('registered_warranty_id');
        });

        test('11 claim FSM statuses mapped to sn_pool', () => {
            const code = readRepoFile('[Admin System] DINOCO Service Center & Claims');
            const statuses = [
                'pending',
                'reviewing',
                'approved',
                'in_progress',
                'waiting_parts',
                'repairing',
                'quality_check',
                'completed',
                'rejected',
                'cancelled',
                'closed',
            ];
            statuses.forEach((s) => {
                expect(code).toContain(`'${s}'`);
            });
        });

        test('Long-form claim labels mapped (Repaired Item Dispatched, Replacement Shipped)', () => {
            const code = readRepoFile('[Admin System] DINOCO Service Center & Claims');
            expect(code).toContain("'Repaired Item Dispatched'");
            expect(code).toContain("'Replacement Shipped'");
            expect(code).toContain("'Replacement Rejected by Company'");
            expect(code).toContain("'Replacement Approved'");
            expect(code).toContain("'Pending Issue Verification'");
            expect(code).toContain("'Awaiting Customer Shipment'");
        });

        test('Replacement-flow scaffold writes _sn_replacement_pending meta', () => {
            const code = readRepoFile('[Admin System] DINOCO Service Center & Claims');
            expect(code).toContain('_sn_replacement_pending');
            expect(code).toContain('_b2b_replacement_sent');
        });

        test('Atomic SQL: GET_LOCK + START TRANSACTION + RELEASE_LOCK + FOR UPDATE', () => {
            const code = readRepoFile('[Admin System] DINOCO Service Center & Claims');
            const fnBlock = code.split('function dinoco_sn_claim_status_changed')[1] || '';
            const block = fnBlock.split('function dinoco_sn_map_claim_to_pool_status')[0];
            expect(block).toContain('GET_LOCK');
            expect(block).toContain('RELEASE_LOCK');
            expect(block).toContain('START TRANSACTION');
            expect(block).toContain('ROLLBACK');
            expect(block).toContain('COMMIT');
            expect(block).toContain('FOR UPDATE');
        });

        test('Defensive guards: function_exists + dinoco_sn_table_exists + dinoco_sn_is_enabled', () => {
            const code = readRepoFile('[Admin System] DINOCO Service Center & Claims');
            const fnBlock = code.split('function dinoco_sn_claim_status_changed')[1] || '';
            const block = fnBlock.split('function dinoco_sn_map_claim_to_pool_status')[0];
            expect(block).toContain("function_exists( 'dinoco_sn_table_exists' )");
            expect(block).toContain("dinoco_sn_table_exists( 'pool' )");
            expect(block).toContain("function_exists( 'dinoco_sn_is_enabled' )");
            expect(block).toContain('dinoco_sn_is_enabled()');
        });

        test('Audit log via dinoco_sn_audit_log defensive call', () => {
            const code = readRepoFile('[Admin System] DINOCO Service Center & Claims');
            const fnBlock = code.split('function dinoco_sn_claim_status_changed')[1] || '';
            expect(fnBlock).toContain("function_exists( 'dinoco_sn_audit_log' )");
            expect(fnBlock).toContain('dinoco_sn_audit_log(');
            expect(fnBlock).toContain("'claim_status_synced'");
        });

        test('Replacement-pending admin banner hook registered', () => {
            const code = readRepoFile('[Admin System] DINOCO Service Center & Claims');
            expect(code).toContain("add_action( 'edit_form_after_title', 'dinoco_sn_render_replacement_pending_banner' )");
            expect(code).toContain('Allocate new plate for replacement');
        });

        test('Claim System bumped to V.31.0', () => {
            const code = readRepoFile('[System] DINOCO Claim System');
            expect(code).toMatch(/Version: V\.31\.0/);
            expect(code).toContain('Phase 2 W6.5 sn_pool source-of-truth');
        });

        test('Claim System prefers sn_pool with ACF fallback', () => {
            const code = readRepoFile('[System] DINOCO Claim System');
            expect(code).toContain("function_exists( 'dinoco_sn_lookup_by_warranty_id' )");
            expect(code).toContain('dinoco_sn_lookup_by_warranty_id( $prod_id )');
            expect(code).toContain("get_field( 'serial_code', $prod_id )");
        });

        test('Claim System validates plate.status === registered', () => {
            const code = readRepoFile('[System] DINOCO Claim System');
            expect(code).toContain("(string) $plate_row->status !== 'registered'");
            expect(code).toContain('เพลทไม่อยู่ในสถานะลงทะเบียน');
        });

        test('Claim System validates registered_user_id === current user', () => {
            const code = readRepoFile('[System] DINOCO Claim System');
            expect(code).toContain('$plate_row->registered_user_id');
            expect(code).toContain('!== (int) $uid');
            expect(code).toContain('เพลทนี้ไม่ใช่ของคุณ');
        });

        test('Claim System validation guarded by sn_pool table check', () => {
            const code = readRepoFile('[System] DINOCO Claim System');
            expect(code).toContain("function_exists( 'dinoco_sn_table_exists' )");
            expect(code).toContain("dinoco_sn_table_exists( 'pool' )");
            expect(code).toContain('dinoco_sn_is_enabled()');
        });

        test('PHPUnit SnClaimStatusMappingTest.php exists with key cases', () => {
            const filepath = path.join(REPO_ROOT, 'tests/helpers/SnClaimStatusMappingTest.php');
            expect(fs.existsSync(filepath)).toBe(true);
            const content = fs.readFileSync(filepath, 'utf8');
            expect(content).toContain('test_pending_locks_plate');
            expect(content).toContain('test_completed_with_replacement_flag_marks_replaced');
            expect(content).toContain('test_replacement_shipped_marks_replaced');
            expect(content).toContain('test_rejected_reverts_to_registered');
            expect(content).toContain('test_closed_is_no_change');
            expect(content).toContain('test_lock_preserves_old_status_into_prev');
            expect(content).toContain('test_revert_uses_stored_prev_status');
        });
    });

    /* ────────────────────────────────────────────────────────────────────
     * Phase 2 W6.6 + W6.7 — Manual Transfer + Member Transfer sn_pool integration
     *
     * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.6 §Gap E
     * Boss decision Q16: Customer transfer = ใช้เพลทเดิม (no new plate, same SN).
     *
     * Files:
     *   • [Admin System] DINOCO Manual Transfer Tool   V.30.4 → V.31.0
     *   • [System] Transfer Warranty Page              V.30.2 → V.31.0
     *
     * Asserts: V.31.0 markers + helper signatures + atomic transaction pattern
     * + 5 block conditions + LINE notify both parties + audit log call + BUG-S2
     * nonce verification fix + cross-snippet defensive guards.
     * ──────────────────────────────────────────────────────────────────── */
    describe('Phase 2 W6.6 + W6.7 — Manual Transfer + Member Transfer sn_pool integration', () => {

        const readByPath = (relPath) => {
            const filepath = path.join(REPO_ROOT, relPath);
            if (!fs.existsSync(filepath)) {
                throw new Error(`File not found: ${relPath}`);
            }
            return fs.readFileSync(filepath, 'utf8');
        };

        test('W6.6 Manual Transfer Tool bumped to V.31.0', () => {
            const code = readByPath('[Admin System] DINOCO Manual Transfer Tool');
            expect(code).toMatch(/Version:\s*V\.31\.0/);
            expect(code).toContain('Phase 2 W6.6');
        });

        test('W6.7 Transfer Warranty Page bumped to V.31.0', () => {
            const code = readByPath('[System] Transfer Warranty Page');
            expect(code).toMatch(/Version:\s*V\.31\.0/);
            expect(code).toContain('Phase 2 W6.7');
        });

        test('W6.6 dinoco_sn_transfer_owner_by_sn helper defined with function_exists guard', () => {
            const code = readByPath('[Admin System] DINOCO Manual Transfer Tool');
            expect(code).toContain("function_exists( 'dinoco_sn_transfer_owner_by_sn' )");
            expect(code).toContain('function dinoco_sn_transfer_owner_by_sn(');
        });

        test('W6.6 dinoco_sn_transfer_owner warranty_id wrapper defined', () => {
            const code = readByPath('[Admin System] DINOCO Manual Transfer Tool');
            expect(code).toContain("function_exists( 'dinoco_sn_transfer_owner' )");
            expect(code).toContain('function dinoco_sn_transfer_owner(');
        });

        test('W6.6 atomic transaction pattern — GET_LOCK + START TRANSACTION + FOR UPDATE', () => {
            const code = readByPath('[Admin System] DINOCO Manual Transfer Tool');
            expect(code).toContain('SELECT GET_LOCK');
            expect(code).toContain('START TRANSACTION');
            expect(code).toContain('FOR UPDATE');
            expect(code).toContain('COMMIT');
            expect(code).toContain('ROLLBACK');
            expect(code).toContain('SELECT RELEASE_LOCK');
        });

        test('W6.6 try/catch/finally ensures lock release', () => {
            const code = readByPath('[Admin System] DINOCO Manual Transfer Tool');
            expect(code).toMatch(/try\s*{[\s\S]*?catch\s*\(\s*\\Throwable[\s\S]*?finally\s*{/);
        });

        test('W6.6 blocks all 5 forbidden states (claimed/voided/recalled/stolen/replaced)', () => {
            const code = readByPath('[Admin System] DINOCO Manual Transfer Tool');
            ['claimed', 'voided', 'recalled', 'stolen', 'replaced'].forEach((state) => {
                expect(code).toContain(`'${state}'`);
            });
            expect(code).toContain('blocked_states');
        });

        test('W6.6 stolen plate triggers LINE alert to admin group', () => {
            const code = readByPath('[Admin System] DINOCO Manual Transfer Tool');
            expect(code).toContain('B2B_ADMIN_GROUP_ID');
            expect(code).toContain('STOLEN');
            expect(code).toContain('plate_stolen');
        });

        test('W6.6 audit log via function_exists guard', () => {
            const code = readByPath('[Admin System] DINOCO Manual Transfer Tool');
            expect(code).toContain("function_exists( 'dinoco_sn_audit_log' )");
            expect(code).toContain("'plate_transferred'");
        });

        test('W6.6 BUG-S2 nonce action consistency hardened', () => {
            const code = readByPath('[Admin System] DINOCO Manual Transfer Tool');
            expect(code).toContain("wp_create_nonce( 'dinoco_admin_action' )");
            expect(code).toContain("wp_verify_nonce( $nonce_received, 'dinoco_admin_action' )");
            expect(code).toContain('BUG-S2');
            expect(code).toContain("error_log( '[ManualTransfer] BUG-S2");
        });

        test('W6.6 graceful no-op when sn_pool table missing', () => {
            const code = readByPath('[Admin System] DINOCO Manual Transfer Tool');
            expect(code).toContain('information_schema.tables');
            expect(code).toContain('graceful no-op');
        });

        test('W6.6 sn normalized to uppercase before lookup', () => {
            const code = readByPath('[Admin System] DINOCO Manual Transfer Tool');
            expect(code).toContain('strtoupper( trim( (string) $sn )');
        });

        test('W6.7 Transfer Warranty Page sn_pool pre-flight extends w_status check', () => {
            const code = readByPath('[System] Transfer Warranty Page');
            expect(code).toContain('$dnc_sn_preflight');
            expect(code).toContain("function_exists( 'dinoco_sn_transfer_owner_by_sn' )");
            expect(code).toContain("'claim_process'");
        });

        test('W6.7 sn_pool flip + LINE notify wired into both bundle + single paths', () => {
            const code = readByPath('[System] Transfer Warranty Page');
            expect(code).toContain('$dnc_sn_sync_and_notify');
            // Closure invoked from BOTH bundle path and single-product path
            // (definition uses `=` so doesn't match `\(` after name).
            const invocations = (code.match(/\$dnc_sn_sync_and_notify\(/g) || []).length;
            expect(invocations).toBeGreaterThanOrEqual(2);
            // Both bundle + single product code-paths exist
            expect(code).toContain('Transfer (Bundle) by');
            expect(code).toMatch(/:\s*Transfer by/);
        });

        test('W6.7 LINE notify uses b2b_line_push to both old + new owner', () => {
            const code = readByPath('[System] Transfer Warranty Page');
            expect(code).toContain("function_exists( 'b2b_line_push' )");
            expect(code).toContain('owner_line_id');
            expect(code).toContain('ไม่ใช่ของคุณแล้ว');
            expect(code).toContain('ยินดีต้อนรับ');
            expect(code).toContain('ระยะประกันคงเดิม');
        });

        test('W6.7 sn_pool pre-flight blocks claimed/voided/recalled/stolen/replaced', () => {
            const code = readByPath('[System] Transfer Warranty Page');
            // Locate the closure body and assert all 5 blocked states are listed
            const preflightSection = code.split('$dnc_sn_preflight')[1] || '';
            ['claimed', 'voided', 'recalled', 'stolen', 'replaced'].forEach((state) => {
                expect(preflightSection).toContain(`'${state}'`);
            });
        });

        test('W6.6 + W6.7 both use shared dinoco_sn_transfer_owner_by_sn helper', () => {
            const mt = readByPath('[Admin System] DINOCO Manual Transfer Tool');
            const tw = readByPath('[System] Transfer Warranty Page');
            expect(mt).toContain("'plate_transferred'");
            expect(mt).toContain('dinoco_sn_transfer_owner_by_sn');
            expect(tw).toContain('dinoco_sn_transfer_owner_by_sn');
        });

        test('W6.6 helper defensive — every cross-snippet call has function_exists guard', () => {
            const code = readByPath('[Admin System] DINOCO Manual Transfer Tool');
            ['dinoco_sn_audit_log', 'dinoco_obs_capture', 'b2b_line_push'].forEach((fn) => {
                const guards = (code.match(new RegExp(`function_exists\\(\\s*'${fn}'`, 'g')) || []).length;
                expect(guards).toBeGreaterThan(0);
            });
        });

        test('W6.7 helper defensive — every cross-snippet call has function_exists guard', () => {
            const code = readByPath('[System] Transfer Warranty Page');
            ['dinoco_sn_transfer_owner_by_sn', 'b2b_line_push'].forEach((fn) => {
                const guards = (code.match(new RegExp(`function_exists\\(\\s*'${fn}'`, 'g')) || []).length;
                expect(guards).toBeGreaterThan(0);
            });
        });

        test('W6.6 + W6.7 SnTransferOwnerTest helper test exists with required cases', () => {
            const filepath = path.join(REPO_ROOT, 'tests/helpers/SnTransferOwnerTest.php');
            expect(fs.existsSync(filepath)).toBe(true);
            const content = fs.readFileSync(filepath, 'utf8');
            expect(content).toContain('test_block_claimed_plate');
            expect(content).toContain('test_block_voided_plate');
            expect(content).toContain('test_block_recalled_plate');
            expect(content).toContain('test_block_replaced_plate');
            expect(content).toContain('test_block_stolen_uses_dedicated_code');
            expect(content).toContain('test_allow_registered_plate');
            expect(content).toContain('test_legacy_plate_no_sn_pool_row_is_noop');
            expect(content).toContain('test_same_old_new_owner_is_noop');
            expect(content).toContain('test_missing_sn_pool_table_is_noop');
            expect(content).toContain('test_zero_new_owner_is_noop');
            expect(content).toContain('test_empty_sn_returns_400');
            expect(content).toContain('sn_transfer_guard');
        });
    });
});
