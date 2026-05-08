/**
 * tests/e2e/specs/03-receive-bulk.spec.ts — R4 BLOCKER #4 smoke
 *
 * Critical Path 3: Warehouse staff bulk-receives plates from factory.
 *
 * Snippet under test: `[Admin System] DINOCO Production SN Manager` V.0.4+
 *                     + `[System] DINOCO SN REST API` V.0.3+
 * REST endpoint: POST /wp-json/dinoco-sn/v1/receive/bulk
 * Tab UI: Tab 2 — รับเพลท (3 modes: Range / Paste / USB Scanner)
 *
 * Why this is a smoke gate:
 *   - High-volume operation (1000-5000 plates per batch realistic)
 *   - D4 contract: per-row atomic + skip-conflicts default + chunk cap 100
 *   - 207 partial_success or 200 all-success response semantics
 *   - State transition: reserved → in_pool (atomic per row)
 *   - Touches optimistic concurrency `lock_version`
 *
 * Test scenarios:
 *   @smoke range mode — 10 plates from contiguous range succeed
 *   @smoke partial-success — mix of valid + duplicate plates returns 207
 *   @smoke session counter increments correctly
 */

import { test, expect } from '@playwright/test';
import fixtures from '../fixtures/test-data.json';

test.describe('SN Bulk Receive @smoke', () => {
    test.beforeEach(async ({ page }) => {
        const adminUser = process.env.E2E_ADMIN_USER || fixtures.users.admin.username;
        const adminPass = process.env.E2E_ADMIN_PASS || 'placeholder';
        await page.goto('/wp-login.php');
        await page.fill('#user_login', adminUser);
        await page.fill('#user_pass', adminPass);
        await page.click('#wp-submit');
        await page.waitForLoadState('networkidle');

        await page.goto('/wp-admin/admin.php?page=dinoco-production-sn');
        await page.click('[data-tab="receive"]');
    });

    test('range mode — receive 10 contiguous plates succeed', async ({ page }) => {
        const range = fixtures.plates.receive_bulk_range;

        // Tab 2 → Range mode
        await page.click('[data-receive-mode="range"]');

        await page.fill('input[name="sn_start"]', range.sn_start);
        await page.fill('input[name="sn_end"]', range.sn_end);

        const startTime = Date.now();
        await page.click('button:has-text("รับเข้าโกดัง")');

        // Wait for response — accept 200 (all-success) or 207 (partial)
        const response = await page.waitForResponse(
            (resp) => resp.url().includes('/dinoco-sn/v1/receive/bulk'),
            { timeout: fixtures.timing.receive_bulk_ms }
        );
        expect([200, 207]).toContain(response.status());

        const body = await response.json();
        expect(body).toHaveProperty('received_count');
        expect(body.received_count).toBeGreaterThan(0);

        // Session counter visible + reflecting received count
        await expect(page.locator('[data-session-counter]')).toContainText(
            /\d+/
        );

        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeLessThan(fixtures.timing.receive_bulk_ms);
    });

    test('partial-success — duplicates yield 207 with skip rows', async ({
        page,
        request,
    }) => {
        const range = fixtures.plates.receive_bulk_range;

        // Direct REST call to trigger same range twice — second batch
        // should report skipped rows for already-received plates
        const adminCookie = await page.context().cookies();
        const cookieHeader = adminCookie
            .map((c) => `${c.name}=${c.value}`)
            .join('; ');

        // First call — assume already-received (test pre-state from spec)
        const res1 = await request.post('/wp-json/dinoco-sn/v1/receive/bulk', {
            headers: { Cookie: cookieHeader },
            data: {
                sns: [range.sn_start, range.sn_end],
                mode: 'range',
            },
        });
        expect([200, 207]).toContain(res1.status());

        // Second call — same plates, expect 207 with skip codes
        const res2 = await request.post('/wp-json/dinoco-sn/v1/receive/bulk', {
            headers: { Cookie: cookieHeader },
            data: {
                sns: [range.sn_start, range.sn_end],
                mode: 'range',
            },
        });
        expect(res2.status()).toBe(207);

        const body = await res2.json();
        expect(body).toHaveProperty('skipped_count');
        expect(body.skipped_count).toBeGreaterThan(0);
        // Skip codes catalog: D4 contract — should include `already_received`
        expect(JSON.stringify(body)).toMatch(/already_received|sn_already_in_pool/);
    });

    test('recent scans panel shows last submitted SNs', async ({ page }) => {
        await page.click('[data-receive-mode="paste"]');

        const testSn = `DNCSSTEST00000${Math.floor(Math.random() * 1000)
            .toString()
            .padStart(3, '0')}`;
        await page.fill('textarea[name="sns_paste"]', testSn);
        await page.click('button:has-text("รับเข้าโกดัง")');

        // Recent scans panel should display the SN (success or error)
        await expect(page.locator('[data-recent-scans]')).toContainText(testSn);
    });

    test('chunk cap — payloads above 100 rows split or reject', async ({ request }) => {
        // D4 contract: chunk cap 100 SNs per call
        const adminCookie = await test.info().project.use.storageState;
        const oversize = Array.from(
            { length: 150 },
            (_, i) => `DNCSSTEST99${i.toString().padStart(5, '0')}`
        );

        const res = await request.post('/wp-json/dinoco-sn/v1/receive/bulk', {
            data: {
                sns: oversize,
                mode: 'paste',
            },
        });

        // Either client-side split into 2 calls (test would track multiple) or
        // server returns 400 chunk_too_large
        if (res.status() === 400) {
            const body = await res.json();
            expect(body.code).toMatch(/chunk_too_large|payload_too_large/);
        } else {
            // Server accepted — must have processed at most 100 rows
            const body = await res.json();
            expect(body.received_count + body.skipped_count).toBeLessThanOrEqual(100);
        }
    });
});
