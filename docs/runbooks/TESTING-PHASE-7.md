# Phase 7 — Playwright E2E (Runbook)

**Status**: Foundation V.0.1 (2026-04-29)
**Scope**: LIFF foundation modules in real browser context (Chromium + mobile Chrome)

---

## What's covered

| Spec | Tests | Surface |
|---|---|---|
| `tests/e2e/cart-flow.spec.js` | 4 | Cart state machine in real Chromium DOM (add → set qty → clear → payload) |
| `tests/e2e/api-client.spec.js` | 4 | createB2BApi roundtrip with `page.route()` mocks (GET, POST body, 401 error surface, network failure) |

Total: **8 tests × 2 projects = 16 runs**, ~6s on M1 (1.6s mobile-chrome only).

---

## Why Phase 7 alongside Jest

Phase 6 Jest tests the same modules in jsdom. Phase 7 adds a real-browser layer:

| Concern | Jest jsdom | Playwright Chromium |
|---|---|---|
| Pure-function logic | ✓ | ✓ (redundant) |
| ES module resolution | partial (Babel CommonJS) | full native |
| Real DOM event dispatch | partial | full |
| localStorage quotas | mocked | real (5MB cap) |
| `fetch` + AbortController | jsdom polyfill | real Chromium fetch |
| LIFF SDK contracts | mocked window.liff | future: real LINE WebView |

Redundancy earns its keep when Phase 2 Vite migration starts moving real production code into `liff-src/` — Jest catches logic, Playwright catches integration.

---

## Local development

### One-time setup

```bash
npm install                                # Playwright + http-server etc.
npx playwright install chromium            # ~92MB browser binaries
```

### Run

```bash
npm run test:e2e                           # all projects (chromium + mobile-chrome)
npm run test:e2e:headed                    # see what the browser is doing
npm run test:e2e:ui                        # interactive Playwright UI mode
npx playwright test --project=chromium     # specific project
npx playwright test cart-flow              # specific spec by name
```

The `webServer` block in `playwright.config.js` auto-spawns `http-server` on port 4173 to serve fixture HTML pages. It detects existing servers via `reuseExistingServer: !process.env.CI`.

### Debug a failing test

```bash
npx playwright test --debug                # Playwright Inspector
npx playwright show-report                 # post-mortem HTML report
```

Failing tests automatically capture screenshot + video + trace under `test-results/`.

---

## Architecture decisions

**Why Chromium + mobile-chrome only (not WebKit/Firefox)?**
LINE LIFF runs inside a Chromium WebView on Android and Safari/WebKit on iOS. Mobile-chrome covers the Android side. WebKit is value-add but doubles CI time + browser binary install. Defer until concrete iOS-specific bugs surface.

**Why source modules, not Vite-built bundles?**
Bundle hashes change every build (`b2b-catalog.XP478u-U.js`). Stable test fixtures need stable URLs. Importing source modules directly via `<script type="module">` works because Chromium handles native ES module resolution. Phase 7 V.1.0+ will swap to bundles once a Vite manifest plugin emits `b2b-catalog.json` mapping entry → hashed file.

**Why `page.route()` not real WordPress?**
Playwright's request interception covers our REST contract surface deterministically. Real WordPress E2E (`wp-env` Docker) is a separate Phase 7 V.1.0+ item — necessary once production code paths exercise real DB state. Foundation V.0.1 doesn't need it.

**Why `http-server` (not Vite dev server)?**
Vite dev server transforms ES modules through its plugin chain — different from the runtime path tests should validate. Static file serving matches what production does (WP enqueue → CDN). 14KB http-server binary is a pin-light dep.

---

## CI integration

`.github/workflows/playwright.yml` runs on every push/PR that touches:
- `liff-src/**`, `tests/e2e/**`
- `playwright.config.js`, `package.json`, `package-lock.json`

Matrix: `chromium` + `mobile-chrome` (parallel). Browser binaries cached via `actions/cache` keyed on `package-lock.json` hash — saves ~30s per run after the first.

Reports + JUnit XML uploaded as artifacts (7-day retention for HTML, 14-day for JUnit).

---

## File inventory

```
NEW (5 files):
  playwright.config.js                 Playwright config + webServer
  tests/e2e/cart-flow.spec.js          4 tests
  tests/e2e/api-client.spec.js         4 tests
  tests/e2e/fixtures/cart-flow.html    Test page importing cart.js
  tests/e2e/fixtures/api-client.html   Test page importing api-client.js
  .github/workflows/playwright.yml     CI matrix workflow
  docs/runbooks/TESTING-PHASE-7.md     This runbook

MODIFIED (1 file):
  package.json                         + 2 devDeps (@playwright/test,
                                       http-server) + 3 scripts
                                       (test:e2e, test:e2e:ui, test:e2e:headed)
```

---

## Adding a new E2E test

1. **Create fixture page** under `tests/e2e/fixtures/<feature>.html`:
   - Import source module via `<script type="module">` from absolute `/liff-src/...` path
   - Expose state to tests via `window.__lastPayload` etc. (Playwright reads via `page.evaluate()`)
   - Render UI elements with stable `id=` attributes for selectors

2. **Create spec** under `tests/e2e/<feature>.spec.js`:
   - `await page.goto("/tests/e2e/fixtures/<feature>.html")`
   - Use `page.route()` to mock REST endpoints — see api-client.spec.js
   - Assert via `expect(page.locator("#status")).toHaveText("…")`

3. **Run** `npm run test:e2e -- <feature>`

4. **Push** — CI runs both projects automatically

---

## What's NOT covered (deferred)

### Phase 7 V.1.0+
- Real LIFF SDK initialization (currently mocked at HTML fixture level)
- Full place-order user flow once Phase 2 Vite migration extracts inline JS
- WebKit project for iOS/Safari coverage
- Visual regression (Playwright snapshots) — premature without stable UI

### Phase 8+ (future sprints)
- `wp-env` Docker for real WordPress backend
- LINE OAuth E2E (mock LINE Login server or real LIFF preview)
- Performance budgets (LCP < 2.5s on mobile-chrome throttled)

---

## Plan reference

Phase 7 was outlined in `docs/audit/phase-5-test-infrastructure-applied.md` §"Phase 6+ (future sprints)" and `tests/README.md`. Foundation V.0.1 unblocks future production-code E2E work without committing to a specific LIFF page until Phase 2 Vite migration lands.
