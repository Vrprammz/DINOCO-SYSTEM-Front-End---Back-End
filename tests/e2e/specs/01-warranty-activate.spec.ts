/**
 * tests/e2e/specs/01-warranty-activate.spec.ts — R4 BLOCKER #4 smoke
 *
 * Critical Path 1: Customer warranty activation flow.
 *
 * Snippet under test: `[System] DINOCO Warranty Activation LIFF` V.0.1+
 * REST endpoint: POST /wp-json/dinoco-sn/v1/activate
 * State machine: in_pool → registered (atomic GET_LOCK + FOR UPDATE)
 *
 * Why this is a smoke gate:
 *   - Customer-facing Day-1 surface (every new product activation hits this)
 *   - Touches sn_pool optimistic concurrency (lock_version)
 *   - Creates warranty_registration CPT + mirrors serial_code ACF
 *   - LINE Flex push deferred via wp_schedule_single_event
 *
 * Test scenarios:
 *   @smoke happy path — landing → form → submit → success
 *   @smoke already_registered guard — prior registration shows correct state
 *   @smoke not_yet_shipped guard — reserved status rejects activation attempt
 */

import { test, expect } from '@playwright/test';
import { injectLiffMockAndWait, DEFAULT_LIFF_PROFILE } from '../helpers/liff-mock';
import fixtures from '../fixtures/test-data.json';

const ACTIVATE_PATH = fixtures.endpoints.warranty_activate_page;

test.describe('Warranty Activation LIFF @smoke', () => {
    test.beforeEach(async ({ page }) => {
        await injectLiffMockAndWait(page, {
            profile: DEFAULT_LIFF_PROFILE,
        });
    });

    test('happy path — in_pool plate activates successfully', async ({ page }) => {
        const plate = fixtures.plates.activate_happy;
        const url = `${ACTIVATE_PATH}?sn=${plate.sn}&sig=${plate.sig}`;

        const startTime = Date.now();
        await page.goto(url);

        // State 1: landing — plate detail visible, "Activate" CTA enabled
        await expect(page.locator('[data-state="landing"]')).toBeVisible({
            timeout: fixtures.timing.activate_happy_ms,
        });
        await expect(page.getByText(plate.sn)).toBeVisible();

        // Click "เริ่มลงทะเบียน" / "Start Activation"
        await page
            .getByRole('button', { name: /เริ่มลงทะเบียน|Start Activation|Activate/i })
            .click();

        // State 2: form — owner_name + dealer_id pre-fill from LIFF profile
        await expect(page.locator('[data-state="form"]')).toBeVisible();

        // Submit form (assume sensible defaults pre-filled)
        await page
            .getByRole('button', { name: /ยืนยันลงทะเบียน|Confirm|Submit/i })
            .click();

        // State 3: success — warranty card + S/N badge
        await expect(page.locator('[data-state="success"]')).toBeVisible({
            timeout: fixtures.timing.activate_happy_ms,
        });
        await expect(page.locator('[data-sn-badge]')).toContainText(plate.sn);

        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeLessThan(fixtures.timing.activate_happy_ms);
    });

    test('already_registered — shows correct state, no double-activation', async ({
        page,
    }) => {
        const plate = fixtures.plates.activate_already_registered;
        await page.goto(`${ACTIVATE_PATH}?sn=${plate.sn}`);

        await expect(page.locator('[data-state="already_registered"]')).toBeVisible();
        // No activation CTA should be present
        const activateButton = page.getByRole('button', {
            name: /เริ่มลงทะเบียน|Start Activation/i,
        });
        await expect(activateButton).toHaveCount(0);
    });

    test('not_yet_shipped — reserved plates are blocked', async ({ page }) => {
        const plate = fixtures.plates.activate_not_yet_shipped;
        await page.goto(`${ACTIVATE_PATH}?sn=${plate.sn}`);

        await expect(page.locator('[data-state="not_yet_shipped"]')).toBeVisible();
        // Error messaging should be customer-friendly Thai
        await expect(page.locator('[data-state="not_yet_shipped"]')).toContainText(
            /ยังไม่จัดส่ง|ยังไม่พร้อม|รอการจัดส่ง/
        );
    });

    test('LIFF SDK initializes via mock shim', async ({ page }) => {
        const plate = fixtures.plates.activate_happy;
        await page.goto(`${ACTIVATE_PATH}?sn=${plate.sn}`);

        // Sanity check the mock landed
        const mockReady = await page.evaluate(
            () => (window as any).__liffMockInjected === true
        );
        expect(mockReady).toBe(true);

        // Production code should have called liff.init() — assert no
        // uncaught LIFF errors in console
        const consoleErrors: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error' && /liff/i.test(msg.text())) {
                consoleErrors.push(msg.text());
            }
        });
        await page.waitForLoadState('networkidle');
        expect(consoleErrors.length).toBe(0);
    });
});
