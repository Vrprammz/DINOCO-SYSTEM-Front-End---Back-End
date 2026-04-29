// @ts-check
/**
 * E2E — Vite-built LIFF bundle smoke test (Phase 7 V.0.5).
 *
 * โหลด `dist/liff/b2b-catalog.<hash>.js` จริงใน Chromium (+ WebKit
 * + mobile variants) ผ่าน manifest lookup → verify bundle bootstrap
 * + cart composition end-to-end.
 *
 * แตกต่างจาก source-module tests (cart-flow.spec.js, place-order.spec.js):
 *   - ทดสอบ minified + tree-shaken artifact ที่จะ deploy จริง
 *   - ผ่าน Vite's chunk splitting (api-client + modal เป็น shared chunks)
 *   - ใช้ `<script type="module">` + dynamic import (ตาม PHP enqueue path)
 *
 * Skip gracefully when dist/liff/.vite/manifest.json absent (run
 * `npm run build:liff` first). CI workflow ของ Frontend job build
 * ก่อน Jest แล้ว → manifest มีเสมอ.
 */

const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const REPO_ROOT = path.resolve(__dirname, "../..");
const MANIFEST = path.join(REPO_ROOT, "dist/liff/.vite/manifest.json");
const hasManifest = fs.existsSync(MANIFEST);

test.describe("Built Vite bundle — b2b-catalog smoke", () => {
    test.skip(!hasManifest, "Run `npm run build:liff` first");

    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/e2e/fixtures/built-bundle.html");
        // Wait for either ready or error
        await expect(page.locator("#stage")).toHaveText(/ready|error/, {
            timeout: 10_000,
        });
    });

    test("bundle loads + BOOT_MARKER + global exposed", async ({ page }) => {
        const stage = await page.locator("#stage").textContent();
        if (stage === "error") {
            const err = await page.locator("#error").textContent();
            throw new Error(`Bundle failed to load: ${err}`);
        }

        await expect(page.locator("#stage")).toHaveText("ready");
        await expect(page.locator("#marker-seen")).toHaveText("true");
        await expect(page.locator("#global-present")).toHaveText("true");

        // Bundle filename comes from manifest — assert it follows hashed
        // entry pattern (catches manifest corruption / wrong file)
        const file = await page.locator("#bundle-file").textContent();
        expect(file).toMatch(/^b2b-catalog\.[A-Za-z0-9_-]+\.js$/);
    });

    test("bootstrap returns cart facade + helpers wire correctly", async ({
        page,
    }) => {
        const stage = await page.locator("#stage").textContent();
        if (stage === "error") {
            const err = await page.locator("#error").textContent();
            throw new Error(`Bootstrap failed: ${err}`);
        }

        // Cart facade was exercised in fixture: add SKU-A×2 + SKU-B×1
        // → count 3, total 450 with priceMap
        const summary = await page.evaluate(() => window.__bootstrapResult);
        expect(summary).toBeTruthy();
        expect(summary.count).toBe(3);
        expect(summary.total).toBe(450);
        expect(summary.payload).toEqual([
            { sku: "SKU-A", qty: 2 },
            { sku: "SKU-B", qty: 1 },
        ]);
        expect(summary.version).toBe("V.0.1");
    });

    test("frozen DINOCO_B2B_CATALOG global has expected shape", async ({
        page,
    }) => {
        const shape = await page.evaluate(() => {
            const g = window.DINOCO_B2B_CATALOG;
            return {
                isFrozen: Object.isFrozen(g),
                hasBootstrap: typeof g.bootstrap === "function",
                helpers: Object.keys(g.helpers || {}),
                version: g.version,
            };
        });
        expect(shape.isFrozen).toBe(true);
        expect(shape.hasBootstrap).toBe(true);
        expect(shape.version).toBe("V.0.1");
        // Verify cart helpers are tree-shaken in correctly
        expect(shape.helpers).toEqual(
            expect.arrayContaining([
                "createCart",
                "addToCart",
                "setCartQty",
                "removeFromCart",
                "computeTotal",
                "computeItemCount",
                "toOrderItems",
            ])
        );
    });
});
