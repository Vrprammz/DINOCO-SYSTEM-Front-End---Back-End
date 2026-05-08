/**
 * tests/e2e/specs/04-claim-autofill.spec.ts — R4 BLOCKER #4 smoke
 *
 * Critical Path 4: Customer opens claim with `?sn=` query — F#3 auto-fill.
 *
 * Snippets under test:
 *   - `[System] DINOCO Claim System` V.31.0+ (sn_pool-preferred lookup)
 *   - `[Admin System] DINOCO Service Center & Claims` V.31.0+ (FSM sync)
 * REST endpoint: GET /wp-json/dinoco-sn/v1/lookup/{sn} (rate-limited 30/min/IP)
 *
 * Why this is a smoke gate:
 *   - F#3 (Auto-fill Claim) is one of 12 boss-approved features (v2.9)
 *   - Validates two-rule plate guard (status === 'registered' + owner check)
 *   - Touches Claim FSM 11-status mapping
 *   - 8 fields auto-fill: serial_code / sku / name / purchase_date /
 *     warranty_expiry / owner_name / owner_phone / dealer_name
 *
 * Test scenarios:
 *   @smoke happy path — pre-fill 8 form fields from sn_pool
 *   @smoke not-owner — registered_user_id mismatch returns 422
 *   @smoke unregistered — in_pool plate returns 422 "ยังไม่ลงทะเบียน"
 */

import { test, expect } from '@playwright/test';
import { injectLiffMockAndWait, DEFAULT_LIFF_PROFILE } from '../helpers/liff-mock';
import fixtures from '../fixtures/test-data.json';

const CLAIM_PATH = fixtures.endpoints.claim_page;

test.describe('Claim Auto-fill (F#3) @smoke', () => {
    test.beforeEach(async ({ page }) => {
        await injectLiffMockAndWait(page, {
            profile: {
                ...DEFAULT_LIFF_PROFILE,
                userId: DEFAULT_LIFF_PROFILE.userId,
            },
        });
    });

    test('happy path — 8 fields auto-fill from sn_pool', async ({ page }) => {
        const plate = fixtures.plates.claim_autofill;
        const url = `${CLAIM_PATH}?sn=${plate.sn}`;

        const startTime = Date.now();
        await page.goto(url);

        // Wait for auto-fill cascade — REST lookup → form populate
        await expect(page.locator('input[name="serial_code"]')).toHaveValue(plate.sn, {
            timeout: fixtures.timing.claim_autofill_ms,
        });

        // Assert all 8 expected fields are populated
        for (const fieldName of plate.expected_form_fields) {
            const input = page.locator(`[name="${fieldName}"]`).first();
            const value = await input.inputValue();
            expect(value, `Field "${fieldName}" should be auto-filled`).toBeTruthy();
        }

        // Specific value sanity checks
        await expect(page.locator('input[name="product_sku"]')).toHaveValue(plate.sku);

        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeLessThan(fixtures.timing.claim_autofill_ms);
    });

    test('not-owner — different LINE UID rejects with 422', async ({ page }) => {
        const plate = fixtures.plates.claim_autofill;

        // Inject a DIFFERENT profile — registered_user_id mismatch
        await injectLiffMockAndWait(page, {
            profile: {
                userId: 'Uadversary0000notowner000',
                displayName: 'Not The Owner',
            },
        });

        await page.goto(`${CLAIM_PATH}?sn=${plate.sn}`);

        // Should display error banner instead of pre-filled form
        await expect(
            page.locator('[data-error="not_plate_owner"], [data-error*="owner"]')
        ).toBeVisible({ timeout: fixtures.timing.claim_autofill_ms });
        await expect(page.locator('body')).toContainText(
            /ไม่ใช่ของคุณ|ติดต่อ Admin|not the owner/i
        );
    });

    test('unregistered plate — in_pool status returns 422', async ({ page }) => {
        const plate = fixtures.plates.activate_happy; // status=in_pool
        await page.goto(`${CLAIM_PATH}?sn=${plate.sn}`);

        await expect(
            page.locator('[data-error="not_registered"], [data-error*="registered"]')
        ).toBeVisible({ timeout: fixtures.timing.claim_autofill_ms });
        await expect(page.locator('body')).toContainText(
            /ยังไม่ลงทะเบียน|กรุณาลงทะเบียน/i
        );
    });

    test('rate limit — 31 lookups within 60s returns 429', async ({ request }) => {
        // Public endpoint — 30 req/min/IP rate limit
        const plate = fixtures.plates.claim_autofill;
        const responses: number[] = [];

        for (let i = 0; i < 35; i++) {
            const res = await request.get(`/wp-json/dinoco-sn/v1/lookup/${plate.sn}`);
            responses.push(res.status());
            if (res.status() === 429) break;
        }

        expect(responses).toContain(429);
    });
});
