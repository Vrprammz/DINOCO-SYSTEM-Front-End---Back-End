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
    sc_lookup: '[System] DINOCO SN Quick Lookup', // Phase 3 W8.5
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

    test('Phase 3 W9 F#1 dedup uses composite key (type, user_id, sn)', () => {
        const code = readSnippet('manager');
        // Helper queries should check all 3 fields (no UNIQUE index — app-level dedup)
        expect(code).toMatch(/notification_type\s*=\s*%s[\s\S]*?user_id\s*=\s*%d[\s\S]*?sn\s*=\s*%s/);
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

    test('5 admin tabs declared in Production S/N Manager', () => {
        const code = readSnippet('manager');
        const expected_tabs = ['batches', 'receive', 'pool', 'manage', 'audit'];
        expected_tabs.forEach(tab => {
            // Check tab declaration in nav (data-tab="X")
            const navPattern = new RegExp(`data-tab="${tab}"`);
            expect(code).toMatch(navPattern);

            // Check panel declaration (data-tab-panel="X")
            const panelPattern = new RegExp(`data-tab-panel="${tab}"`);
            expect(code).toMatch(panelPattern);
        });
    });

    test('15 schema tables defined in Production S/N Manager', () => {
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
            'dinoco_sn_fraud_scores',
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
