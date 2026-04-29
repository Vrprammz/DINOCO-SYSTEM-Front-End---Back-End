// @ts-check
/**
 * E2E — api-client roundtrip with mocked backends.
 *
 * Uses Playwright's `page.route()` to intercept fetch calls and return
 * canned responses. No real WordPress or LINE OAuth needed.
 *
 * Phase 7 V.1.0+ will add full request flows (LIFF auth → place order →
 * confirm) once Phase 2 Vite migration extracts real LIFF code.
 */

const { test, expect } = require("@playwright/test");

test.describe("API client (mocked fetch)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/e2e/fixtures/api-client.html");
        await expect(page.locator("#status")).toHaveText("idle");
    });

    test("GET /catalog returns JSON, headers include X-B2B-Session", async ({
        page,
    }) => {
        let capturedHeaders = null;
        await page.route("**/wp-json/b2b/v1/catalog", async (route) => {
            capturedHeaders = route.request().headers();
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    items: [
                        { sku: "SKU-A", price: 100 },
                        { sku: "SKU-B", price: 250 },
                    ],
                }),
            });
        });

        await page.click("#get-catalog");
        await expect(page.locator("#status")).toHaveText("getCatalog: ok");
        await expect(page.locator("#result")).toContainText("SKU-A");

        expect(capturedHeaders["x-b2b-session"]).toBe("test-session-99");
    });

    test("POST /place-order serializes body + content-type", async ({
        page,
    }) => {
        let capturedBody = null;
        let capturedMethod = null;
        await page.route("**/wp-json/b2b/v1/place-order", async (route) => {
            const req = route.request();
            capturedMethod = req.method();
            capturedBody = req.postData();
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ order_id: 12345 }),
            });
        });

        await page.click("#post-order");
        await expect(page.locator("#status")).toHaveText("placeOrder: ok");
        await expect(page.locator("#result")).toContainText("12345");

        expect(capturedMethod).toBe("POST");
        expect(JSON.parse(capturedBody)).toEqual({
            items: [{ sku: "SKU-A", qty: 2 }],
        });
    });

    test("401 surfaces error.status + error.body to caller", async ({
        page,
    }) => {
        await page.route("**/wp-json/b2b/v1/unauthorized", async (route) => {
            await route.fulfill({
                status: 401,
                contentType: "application/json",
                body: JSON.stringify({
                    code: "rest_cookie_invalid_nonce",
                    message: "Cookie check failed",
                }),
            });
        });

        await page.click("#trigger-401");
        await expect(page.locator("#status")).toHaveText("trigger401: error");
        const errText = await page.locator("#error").textContent();
        const err = JSON.parse(errText);
        expect(err.status).toBe(401);
        expect(err.message).toBe("Cookie check failed");
        expect(err.body.code).toBe("rest_cookie_invalid_nonce");
    });

    test("network failure surfaces as Error", async ({ page }) => {
        await page.route("**/wp-json/b2b/v1/catalog", async (route) => {
            await route.abort("failed");
        });

        await page.click("#get-catalog");
        await expect(page.locator("#status")).toHaveText("getCatalog: error");
        const errText = await page.locator("#error").textContent();
        const err = JSON.parse(errText);
        expect(err.message).toBeTruthy();
    });
});
