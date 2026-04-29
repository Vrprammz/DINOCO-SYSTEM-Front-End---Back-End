// @ts-check
/**
 * E2E — cart state machine in real Chromium.
 *
 * Mirrors what Jest validates in tests/jest/cart.test.js, but runs the
 * actual ES module in a real browser context (catches things JSDOM can't:
 * real DOM event dispatch, real localStorage quotas, real ES module
 * resolution). Adds redundancy that earns its keep when Phase 2 Vite
 * migration starts moving real production code into liff-src/.
 */

const { test, expect } = require("@playwright/test");

test.describe("Cart flow", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/e2e/fixtures/cart-flow.html");
        await expect(page.locator("#status")).toHaveText("ready");
    });

    test("add → adjust qty → compute total", async ({ page }) => {
        await page.click("#add-a"); // SKU-A × 2
        await expect(page.locator("#count")).toHaveText("2");
        await expect(page.locator("#total")).toHaveText("200");

        await page.click("#add-b"); // SKU-B × 1
        await expect(page.locator("#count")).toHaveText("3");
        await expect(page.locator("#total")).toHaveText("450");

        await page.click("#set-a-5"); // SKU-A → 5 (overrides accumulation)
        await expect(page.locator("#count")).toHaveText("6");
        await expect(page.locator("#total")).toHaveText("750");
    });

    test("missing-price flagging", async ({ page }) => {
        await page.click("#add-unknown");
        await expect(page.locator("#missing-skus")).toHaveText(
            "missing: UNKNOWN-SKU"
        );
        // Missing prices count as 0 in total
        await expect(page.locator("#total")).toHaveText("0");
    });

    test("clearCart resets state", async ({ page }) => {
        await page.click("#add-a");
        await page.click("#add-b");
        await expect(page.locator("#count")).toHaveText("3");

        await page.click("#clear");
        await expect(page.locator("#count")).toHaveText("0");
        await expect(page.locator("#total")).toHaveText("0");
        await expect(page.locator("#items li")).toHaveCount(0);
    });

    test("payload shape matches Jest contract", async ({ page }) => {
        await page.click("#add-a");
        await page.click("#add-b");

        // The fixture exposes `window.__lastPayload` after each render
        const payload = await page.evaluate(() => window.__lastPayload);
        expect(payload).toEqual([
            { sku: "SKU-A", qty: 2 },
            { sku: "SKU-B", qty: 1 },
        ]);
    });
});
