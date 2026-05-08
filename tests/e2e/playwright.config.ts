/**
 * tests/e2e/playwright.config.ts — R4 BLOCKER #4 SN smoke gate
 *
 * Sprint 1 deliverable: 5 critical-path Playwright specs covering S/N
 * lifecycle (warranty activate / batch create / receive bulk / claim
 * autofill / extension checkout). Acts as smoke gate for atomic 5-step
 * deploy strategy (Phase 2 W7 — see docs/sn-system/15-phase2-w7-atomic-deploy-strategy.md).
 *
 * Distinct from root `playwright.config.js`:
 *   - Root config: Phase 7 LIFF foundation (Vite bundle smoke, port 4173).
 *   - This config: SN-system live-staging smoke (real WP staging URL).
 *   - Both can coexist — selected by passing --config flag.
 *
 * Run locally:
 *   npx playwright test --config=tests/e2e/playwright.config.ts
 *
 * Run on CI:
 *   E2E_BASE_URL=https://staging.dinoco.in.th \
 *   npx playwright test --config=tests/e2e/playwright.config.ts
 *
 * Browser projects:
 *   - chromium (Desktop Chrome) — admin flows (batch / receive bulk)
 *   - liff-mobile (iPhone 13 + LINE UA) — customer LIFF flows
 *     (warranty activate / claim autofill / extension checkout)
 *
 * Smoke tag convention:
 *   Specs tagged @smoke = blocking gate for deploys.
 *   Other tags reserved for future expansion (@regression, @perf, @visual).
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './specs',
    timeout: 30 * 1000,
    expect: {
        timeout: 5000,
    },
    // S/N flow has database state (sn_pool status transitions). Disable
    // parallel execution to prevent test pollution across specs.
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: process.env.CI
        ? [['github'], ['list'], ['junit', { outputFile: 'junit-e2e-sn.xml' }]]
        : 'list',

    use: {
        baseURL: process.env.E2E_BASE_URL || 'https://staging.dinoco.in.th',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        // R4 BLOCKER #4 — propagate test correlation ID for Sentry/observability
        extraHTTPHeaders: {
            'X-E2E-Test': 'sn-smoke',
            'X-Request-ID': `e2e-sn-${Date.now()}`,
        },
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            // LINE in-app browser emulation — LIFF on iOS uses Safari/WebKit
            // but reports a LINE-specific User-Agent. We override UA to pass
            // through LIFF SDK detection while keeping iPhone 13 viewport.
            name: 'liff-mobile',
            use: {
                ...devices['iPhone 13'],
                userAgent:
                    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.5.0',
            },
        },
    ],
});
