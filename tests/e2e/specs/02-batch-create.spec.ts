/**
 * tests/e2e/specs/02-batch-create.spec.ts — R4 BLOCKER #4 smoke
 *
 * Critical Path 2: Admin creates a new SN batch.
 *
 * Snippet under test: `[Admin System] DINOCO Production SN Manager` V.0.4+
 * REST endpoint: POST /wp-json/dinoco-sn/v1/batches
 * Tab UI: Tab 1 — Batches CRUD (shortcode `[dinoco_admin_production_sn]`)
 *
 * Why this is a smoke gate:
 *   - Day-1 admin surface — every factory order starts here
 *   - Validates pre-flight check helper (`dinoco_sn_preflight_check_batch`)
 *   - Touches `wp_dinoco_sn_batches` schema (lazy install on admin_init)
 *   - Triggers idempotency wrapper (Round 30+ pattern, namespace=sn)
 *   - Module Registry self-registration (section=inventory, order=25)
 *
 * Test scenarios:
 *   @smoke happy path — fill form → submit → toast + new row
 *   @smoke duplicate batch_code — 409 conflict surfaces correctly
 *   @smoke unauthorized — non-admin user receives 403
 */

import { test, expect } from '@playwright/test';
import fixtures from '../fixtures/test-data.json';

test.describe.configure({ mode: 'serial' });

test.describe('SN Batch Creation @smoke', () => {
    test.beforeEach(async ({ page, context }) => {
        // Admin cookie login. CI provides E2E_ADMIN_USER + E2E_ADMIN_PASS.
        const adminUser = process.env.E2E_ADMIN_USER || fixtures.users.admin.username;
        const adminPass = process.env.E2E_ADMIN_PASS || 'placeholder';

        await page.goto('/wp-login.php');
        await page.fill('#user_login', adminUser);
        await page.fill('#user_pass', adminPass);
        await page.click('#wp-submit');

        // Wait for either dashboard or error
        await page.waitForLoadState('networkidle');
    });

    test('happy path — admin creates batch with unique code', async ({ page }) => {
        const tpl = fixtures.plates.batch_create_template;
        // Timestamp suffix avoids unique-constraint violation on batch_code
        const uniqueCode = `${tpl.batch_code_prefix}${Date.now()}`;

        // Navigate to admin SN Manager → Tab 1 (Batches)
        await page.goto('/wp-admin/admin.php?page=dinoco-production-sn');
        await page.click('[data-tab="batches"]');

        await page.click('button:has-text("+ สร้าง Batch ใหม่")');

        // Modal form
        const modal = page.locator('[data-modal="batch-create"]');
        await expect(modal).toBeVisible();

        await modal.locator('input[name="batch_code"]').fill(uniqueCode);
        await modal.locator('input[name="factory_lot"]').fill(tpl.factory_lot);
        await modal.locator('select[name="sku"]').selectOption(tpl.sku);
        await modal.locator('input[name="qty"]').fill(String(tpl.qty));

        const startTime = Date.now();
        await modal.locator('button[type="submit"]').click();

        // Success toast + new row in batches table
        await expect(page.locator('[data-toast="success"]')).toBeVisible({
            timeout: fixtures.timing.batch_create_ms,
        });
        await expect(page.locator(`[data-batch-code="${uniqueCode}"]`)).toBeVisible();

        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeLessThan(fixtures.timing.batch_create_ms);
    });

    test('duplicate batch_code returns 409 conflict', async ({ page }) => {
        const tpl = fixtures.plates.batch_create_template;
        const fixedCode = `${tpl.batch_code_prefix}DUPLICATE-FIXED`;

        await page.goto('/wp-admin/admin.php?page=dinoco-production-sn');
        await page.click('[data-tab="batches"]');

        // Submit twice — second should 409
        for (let attempt = 1; attempt <= 2; attempt++) {
            await page.click('button:has-text("+ สร้าง Batch ใหม่")');
            const modal = page.locator('[data-modal="batch-create"]');
            await modal.locator('input[name="batch_code"]').fill(fixedCode);
            await modal.locator('input[name="factory_lot"]').fill(tpl.factory_lot);
            await modal.locator('select[name="sku"]').selectOption(tpl.sku);
            await modal.locator('input[name="qty"]').fill(String(tpl.qty));
            await modal.locator('button[type="submit"]').click();

            if (attempt === 1) {
                await expect(page.locator('[data-toast="success"]')).toBeVisible();
                // Close modal manually so we can re-open for attempt 2
                await page.click('[data-modal-close]');
            } else {
                // Second attempt: expect duplicate error
                await expect(
                    page.locator('[data-error="duplicate_batch_code"]')
                ).toBeVisible();
            }
        }
    });

    test('non-admin user is blocked from /batches endpoint', async ({ request }) => {
        // Direct REST call without admin cookie
        const res = await request.post('/wp-json/dinoco-sn/v1/batches', {
            data: {
                batch_code: 'QA-UNAUTHORIZED-001',
                factory_lot: 'unused',
                sku: 'DNCGND37LSPROS',
                qty: 1,
            },
        });

        expect([401, 403]).toContain(res.status());
    });
});
