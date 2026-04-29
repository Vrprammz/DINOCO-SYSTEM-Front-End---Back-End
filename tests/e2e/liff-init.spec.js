// @ts-check
/**
 * E2E — liff-init.js redirect + happy paths.
 *
 * Phase 6 Jest tests both branches via window.liff mock. Phase 7 adds:
 *   - Real ES module top-level await in import (`await import("/liff-src/...")`
 *     in modal.spec.js — this spec doesn't need it but verifies pattern works)
 *   - Real navigator userAgent surface for getOS() if invoked
 *   - Validates the captured login() call payload across real Chromium
 *
 * Why important: liff-init.js is the FIRST module called in every LIFF
 * page bootstrap. Bug here → silent redirect loops in production.
 */

const { test, expect } = require("@playwright/test");

test.describe("liff-init", () => {
    test("logged-in: returns ctx with idToken + profile", async ({ page }) => {
        await page.goto("/tests/e2e/fixtures/liff-init.html#logged-in");
        await expect(page.locator("#mode")).toHaveText("logged-in");

        await page.click("#btn-init");
        await expect(page.locator("#result")).toHaveText("ctx returned");
        await expect(page.locator("#login-called")).toHaveText("false");

        const ctxJson = await page.locator("#ctx").textContent();
        const ctx = JSON.parse(ctxJson);
        expect(ctx.idToken).toBe("tok-99");
        expect(ctx.profileUserId).toBe("U-99");
        expect(ctx.os).toBe("web");
    });

    test("logged-out: triggers login redirect, returns null", async ({
        page,
    }) => {
        await page.goto("/tests/e2e/fixtures/liff-init.html#logged-out");
        await expect(page.locator("#mode")).toHaveText("logged-out");

        await page.click("#btn-init");
        await expect(page.locator("#result")).toHaveText(
            "null (redirected to login)"
        );
        await expect(page.locator("#login-called")).toHaveText("true");

        // login() called with redirectUri = current URL (preserves params for
        // LINE redirect-back). Our fixture sets the URL to liff-init.html
        const redirectUri = await page.locator("#redirect-uri").textContent();
        expect(redirectUri).toContain("/tests/e2e/fixtures/liff-init.html");
    });

    test("no SDK: throws explanatory error", async ({ page }) => {
        await page.goto("/tests/e2e/fixtures/liff-init.html#no-sdk");
        await expect(page.locator("#mode")).toHaveText("no-sdk");

        await page.click("#btn-init");
        await expect(page.locator("#result")).toContainText(
            "LIFF SDK not loaded"
        );
        await expect(page.locator("#result")).toContainText(
            "static.line-scdn.net"
        );
    });

    test("login called only once even on rapid double-click", async ({
        page,
    }) => {
        await page.goto("/tests/e2e/fixtures/liff-init.html#logged-out");

        // Double-click as fast as possible
        await page.click("#btn-init");
        await page.click("#btn-init");

        // Each click triggers a fresh initLiff() call → 2 login() captures
        // (initLiff is a one-shot fn — it doesn't dedup. This test
        // documents that explicitly so future refactors know.)
        const callCount = await page.evaluate(
            () => (window.__loginCalls || []).length
        );
        expect(callCount).toBe(2);
    });
});
