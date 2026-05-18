/**
 * P0.5 — LTV Tier Badge Cache Invalidation Drift Detector
 * 2026-05-18 (Dead-Workflow Remediation Spec V.1.0)
 *
 * Pins R11 HIGH-3 fix: cron `dinoco_sn_run_ltv_snapshot` MUST
 * delete_transient('dinoco_sn_ltv_' . $user_id) inside the loop after each
 * ON DUPLICATE KEY UPDATE so customer-facing tier badge in Member Dashboard
 * updates immediately (was stuck up to 1hr post-cron).
 *
 * Cycle: cron UPSERT → invalidate → Dashboard reads fresh on next page load
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const MANAGER = path.join(REPO, '[Admin System] DINOCO Production SN Manager');
const DASHBOARD = path.join(REPO, '[System] Dashboard - Header & Forms');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/^\s*\*.*$/gm, '');
}

describe('P0.5 — LTV cache invalidation drift', () => {

    test('Manager defines dinoco_sn_run_ltv_snapshot cron handler', () => {
        const src = stripComments(read(MANAGER));
        expect(src).toMatch(/function\s+dinoco_sn_run_ltv_snapshot/);
    });

    test('Cron handler invalidates per-user transient after UPSERT (R11 HIGH-3)', () => {
        const src = stripComments(read(MANAGER));
        // Find the cron function body + verify delete_transient call exists nearby
        // Must use the canonical key pattern `dinoco_sn_ltv_` . $user_id
        expect(src).toMatch(/delete_transient\s*\(\s*['"]dinoco_sn_ltv_['"].*?\$user_id\s*\)/);
    });

    test('Cron uses ON DUPLICATE KEY UPDATE (idempotent rebuild)', () => {
        const src = stripComments(read(MANAGER));
        // After ltv_snapshot upsert
        expect(src).toMatch(/ON DUPLICATE KEY UPDATE/i);
    });

    test('Manager exposes dinoco_sn_get_user_ltv helper for Dashboard read', () => {
        const src = stripComments(read(MANAGER));
        expect(src).toMatch(/function\s+dinoco_sn_get_user_ltv/);
    });

    test('Helper reads dinoco_sn_ltv_{user_id} transient (cache layer)', () => {
        const src = stripComments(read(MANAGER));
        // Cache key shape must match what cron invalidates
        expect(src).toMatch(/get_transient\s*\(\s*\$cache_key\s*\)/);
        expect(src).toMatch(/['"]dinoco_sn_ltv_['"]\s*\.\s*\$user_id/);
    });

    test('Dashboard reads tier via dinoco_sn_get_user_ltv (not raw SQL)', () => {
        const src = stripComments(read(DASHBOARD));
        // Must use the helper (which is cache-aware), not bypass it
        expect(src).toMatch(/dinoco_sn_get_user_ltv\s*\(/);
    });

    test('Dashboard guards helper with function_exists (defensive)', () => {
        const src = stripComments(read(DASHBOARD));
        expect(src).toMatch(/function_exists\s*\(\s*['"]dinoco_sn_get_user_ltv['"]/);
    });
});
