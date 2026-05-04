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
