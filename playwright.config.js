/**
 * Playwright config — Phase 7 LIFF E2E tests.
 *
 * Phase 7 scope (Foundation V.0.1):
 *   - Load Vite-built LIFF bundles (`dist/liff/*.js`) in real Chromium
 *   - Mock LIFF SDK + fetch via page.route — no live WP / LINE OAuth needed
 *   - Verify cart state machine + API client error paths in browser context
 *
 * Future expansion (Phase 7 V.1.0+):
 *   - Once Phase 2 Vite migration extracts inline JS from WP snippets,
 *     these tests gain real production code paths to assert against
 *   - Add per-LIFF-page user flows (B2B place-order, B2F PO confirm,
 *     LIFF AI lead update)
 *   - Optional: real WP env via wp-env Docker for full end-to-end
 *
 * Why Chromium-only at Phase 7:
 *   - LIFF runs inside LINE's WebView which is Chromium-based on Android
 *     and Safari/WebKit on iOS. WebKit coverage is value-add but doubles
 *     CI time + bin install. Defer until concrete iOS-specific bugs
 *     surface.
 *   - Firefox: zero LIFF user share, skip.
 */

const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "./tests/e2e",
    timeout: 30 * 1000,
    expect: {
        timeout: 5000,
    },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI
        ? [["list"], ["junit", { outputFile: "junit-playwright.xml" }]]
        : [["list"]],

    use: {
        // Static fixture pages live under tests/e2e/fixtures/; serve them
        // via Playwright's built-in static server. Tests use absolute paths
        // like `/tests/e2e/fixtures/b2b-catalog.html`.
        baseURL: "http://localhost:4173",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },

    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
        // Mobile Chrome — closer to LIFF (WebView on Android)
        {
            name: "mobile-chrome",
            use: { ...devices["Pixel 5"] },
        },
    ],

    // Run a static file server during tests so fixture HTML pages can
    // import dist/liff/*.js bundles via relative URLs.
    webServer: {
        command: "npx http-server -p 4173 -s --cors",
        url: "http://localhost:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 30 * 1000,
    },
});
