// @ts-check
/**
 * E2E — modal bridge.
 *
 * The modal module resolves at import time:
 *   - If window.dinocoModal exists → use it (production WP snippet)
 *   - Otherwise → native confirm/alert/console fallback
 *
 * Jest tests both paths via jsdom + isolateModules. Real Chromium adds:
 *   - Real native dialog handling (page.on('dialog') intercepts)
 *   - Verifies confirm() actually blocks UI thread until accepted
 *   - Catches differences between jsdom alert (no-op) and real browser
 *     alert (modal blocking)
 */

const { test, expect } = require("@playwright/test");

test.describe("Modal — fallback path (native dialogs)", () => {
    test("alert() invokes native window.alert with title + message", async ({
        page,
    }) => {
        const dialogs = [];
        page.on("dialog", async (dialog) => {
            dialogs.push({ type: dialog.type(), message: dialog.message() });
            await dialog.accept();
        });

        await page.goto("/tests/e2e/fixtures/modal.html#fallback");
        await expect(page.locator("#mode")).toHaveText("fallback");

        await page.click("#btn-alert");
        await expect(page.locator("#last")).toHaveText("alert called");

        expect(dialogs).toHaveLength(1);
        expect(dialogs[0].type).toBe("alert");
        expect(dialogs[0].message).toContain("Heads up");
        expect(dialogs[0].message).toContain("Something happened");
    });

    test("confirm() OK path triggers onConfirm callback", async ({ page }) => {
        page.on("dialog", async (dialog) => {
            await dialog.accept(); // user clicks OK
        });

        await page.goto("/tests/e2e/fixtures/modal.html#fallback");
        await page.click("#btn-confirm-yes");

        await expect(page.locator("#result")).toHaveText("user clicked OK");
    });

    test("confirm() Cancel path triggers onCancel callback", async ({
        page,
    }) => {
        page.on("dialog", async (dialog) => {
            await dialog.dismiss(); // user clicks Cancel
        });

        await page.goto("/tests/e2e/fixtures/modal.html#fallback");
        await page.click("#btn-confirm-no");

        await expect(page.locator("#result")).toHaveText("user clicked Cancel");
    });

    test("toast() falls back to console.log (no UI artifact)", async ({
        page,
    }) => {
        const consoleLogs = [];
        page.on("console", (msg) => {
            if (msg.type() === "log") consoleLogs.push(msg.text());
        });

        await page.goto("/tests/e2e/fixtures/modal.html#fallback");
        await page.click("#btn-toast");

        // Should have logged `[toast:success] Saved`
        expect(consoleLogs.some((l) => l.includes("[toast:success]"))).toBe(true);
        expect(consoleLogs.some((l) => l.includes("Saved"))).toBe(true);
    });
});

test.describe("Modal — production path (window.dinocoModal present)", () => {
    test("uses production API, no native dialogs", async ({ page }) => {
        const dialogs = [];
        page.on("dialog", (dialog) => {
            dialogs.push(dialog.type());
            dialog.dismiss();
        });

        await page.goto("/tests/e2e/fixtures/modal.html#production");
        await expect(page.locator("#mode")).toHaveText("production");

        await page.click("#btn-alert");
        await page.click("#btn-confirm-yes");
        await page.click("#btn-toast");

        // Production path should NOT trigger native dialogs
        expect(dialogs).toEqual([]);

        // Verify production API was called with correct payloads.
        // Note: page.evaluate() serializes via JSON — function refs
        // (onConfirm/onCancel) drop out. Use a separate evaluate for
        // structural checks vs callback presence.
        const calls = await page.evaluate(() => window.__productionCalls);
        expect(calls).toHaveLength(3);
        expect(calls[0].type).toBe("alert");
        expect(calls[0].opts.title).toBe("Heads up");
        expect(calls[1].type).toBe("confirm");
        expect(calls[1].opts.title).toBe("Delete?");
        expect(calls[2].type).toBe("toast");
        expect(calls[2].opts.message).toBe("Saved");

        // Callbacks are functions (not serializable) — check inside the page
        const hasOnConfirm = await page.evaluate(
            () => typeof window.__productionCalls[1].opts.onConfirm === "function"
        );
        expect(hasOnConfirm).toBe(true);
    });

    test("confirm onConfirm callback fires through bridge", async ({
        page,
    }) => {
        await page.goto("/tests/e2e/fixtures/modal.html#production");
        await page.click("#btn-confirm-yes");
        // Production fixture auto-invokes onConfirm — verify callback ran
        await expect(page.locator("#result")).toHaveText("user clicked OK");
    });
});
