// @ts-check
/**
 * E2E — full B2B place-order flow.
 *
 * Exercises module COMPOSITION that no individual Jest test catches:
 *   liffAuth → createB2BApi → cart state → toOrderItems → placeOrder
 *
 * Fixture provides a mocked window.liff (LINE SDK) BEFORE module import.
 * Playwright page.route() mocks REST endpoints. End-to-end: real
 * Chromium DOM, real ES module resolution, real fetch + AbortController,
 * real cart immutable updates, real API client error surface.
 *
 * Coverage:
 *   - Happy path (auth → cart × 2 → submit → success UI)
 *   - Auth backend failure (401) — error surfaces with status + body
 *   - Submit failure (500) — buttons stay re-clickable
 *   - Empty cart short-circuits gracefully (no submit if disabled)
 */

const { test, expect } = require("@playwright/test");

test.describe("B2B place-order full flow", () => {
    test("happy path: auth → add 2 items → submit → success", async ({
        page,
    }) => {
        // Mock auth endpoint
        await page.route("**/wp-json/b2b/v1/auth", async (route) => {
            const body = JSON.parse(route.request().postData() || "{}");
            // Verify liffAuth payload shape
            expect(body.id_token).toBe("mock-id-token-from-line");
            expect(body.line_user_id).toBe("U-mock-user-99");
            expect(body.distributor_id).toBe(42);

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    authorized: true,
                    token: "session-jwt-abc123",
                    distributor_id: 42,
                    rank: "gold",
                }),
            });
        });

        // Mock place-order endpoint
        let capturedHeaders = null;
        let capturedBody = null;
        await page.route("**/wp-json/b2b/v1/place-order", async (route) => {
            capturedHeaders = route.request().headers();
            capturedBody = JSON.parse(route.request().postData() || "{}");
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    order_id: 99001,
                    total: 450,
                    status: "draft",
                }),
            });
        });

        await page.goto("/tests/e2e/fixtures/place-order.html");
        await expect(page.locator("#stage")).toHaveText("idle");

        // Step 1: auth
        await page.click("#btn-auth");
        await expect(page.locator("#stage")).toHaveText("authenticated");
        await expect(page.locator("#session-token")).toHaveText(
            "session-jwt-abc123"
        );
        await expect(page.locator("#btn-add")).toBeEnabled();

        // Step 2: add items
        await page.click("#btn-add"); // SKU-A × 2
        await page.click("#btn-add-more"); // SKU-B × 1
        await expect(page.locator("#item-count")).toHaveText("3");
        await expect(page.locator("#total")).toHaveText("450");

        // Step 3: submit
        await page.click("#btn-submit");
        await expect(page.locator("#stage")).toHaveText("submitted");
        await expect(page.locator("#status")).toHaveText("ok");
        await expect(page.locator("#result")).toContainText("order_id=99001");

        // Verify session header propagated through createB2BApi.
        // Production b2b_verify_session_token reads X-B2B-Token (not Session).
        expect(capturedHeaders["x-b2b-token"]).toBe("session-jwt-abc123");

        // Verify cart payload made it intact through toOrderItems()
        expect(capturedBody).toEqual({
            items: [
                { sku: "SKU-A", qty: 2 },
                { sku: "SKU-B", qty: 1 },
            ],
            note: "E2E test order",
        });
    });

    test("auth 401 surfaces error.status + error.body to UI", async ({
        page,
    }) => {
        await page.route("**/wp-json/b2b/v1/auth", async (route) => {
            await route.fulfill({
                status: 401,
                contentType: "application/json",
                body: JSON.stringify({
                    code: "invalid_id_token",
                    message: "ID Token verification failed",
                }),
            });
        });

        await page.goto("/tests/e2e/fixtures/place-order.html");
        await page.click("#btn-auth");

        await expect(page.locator("#stage")).toHaveText("auth_failed");
        await expect(page.locator("#error")).toContainText("status=401");
        await expect(page.locator("#error")).toContainText(
            "ID Token verification failed"
        );

        // Cart buttons remain disabled — auth never succeeded
        await expect(page.locator("#btn-add")).toBeDisabled();
        await expect(page.locator("#btn-submit")).toBeDisabled();
    });

    test("submit 500 surfaces error, cart preserved, button re-enabled", async ({
        page,
    }) => {
        await page.route("**/wp-json/b2b/v1/auth", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ authorized: true, token: "tok" }),
            });
        });
        await page.route("**/wp-json/b2b/v1/place-order", async (route) => {
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({
                    code: "db_error",
                    message: "Internal server error",
                }),
            });
        });

        await page.goto("/tests/e2e/fixtures/place-order.html");
        await page.click("#btn-auth");
        await expect(page.locator("#stage")).toHaveText("authenticated");

        await page.click("#btn-add");
        await page.click("#btn-submit");

        await expect(page.locator("#stage")).toHaveText("submit_failed");
        await expect(page.locator("#error")).toContainText("status=500");
        await expect(page.locator("#error")).toContainText(
            "Internal server error"
        );

        // Cart should still show the items (state preserved across error)
        await expect(page.locator("#item-count")).toHaveText("2");

        // Submit button stays clickable for retry
        await expect(page.locator("#btn-submit")).toBeEnabled();
    });

    test("submit button disabled until cart has items", async ({ page }) => {
        await page.route("**/wp-json/b2b/v1/auth", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ authorized: true, token: "tok" }),
            });
        });

        await page.goto("/tests/e2e/fixtures/place-order.html");
        await page.click("#btn-auth");

        // After auth, add buttons enabled but submit still disabled
        await expect(page.locator("#btn-add")).toBeEnabled();
        await expect(page.locator("#btn-submit")).toBeDisabled();

        // Add an item — submit becomes enabled
        await page.click("#btn-add");
        await expect(page.locator("#btn-submit")).toBeEnabled();
    });
});
