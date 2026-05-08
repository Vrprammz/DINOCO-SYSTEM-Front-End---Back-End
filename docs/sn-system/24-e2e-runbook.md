# 24 — E2E + a11y Runbook (R4 BLOCKER #4 Sprint 1)

> Back: [README](README.md) · [10 Go-Live Gate](10-go-live-gate-checklist.md) · [12 Phase 2 W7 Deploy](12-phase2-w7-deploy-runbook.md)

## Purpose

Sprint 1 deliverable closing R4 BLOCKER #4: **E2E test absence + jest-axe missing → no smoke gate for atomic 5-step deploy**.

This runbook covers:

- Local dev setup (one-time + per-developer)
- Run command reference (smoke / full / single spec)
- CI integration (GitHub Actions matrix template)
- Cross-browser / cross-platform strategy (LINE WebView)
- Test data fixture management (staging-only)
- Failure debugging workflow

## Scope

| Surface | Coverage | Spec file |
|---|---|---|
| Customer warranty activation | happy + already_registered + not_yet_shipped + LIFF init | [`01-warranty-activate.spec.ts`](../../tests/e2e/specs/01-warranty-activate.spec.ts) |
| Admin batch creation | happy + duplicate 409 + unauthorized 403 | [`02-batch-create.spec.ts`](../../tests/e2e/specs/02-batch-create.spec.ts) |
| Warehouse bulk receive | range happy + partial 207 + recent scans + chunk cap | [`03-receive-bulk.spec.ts`](../../tests/e2e/specs/03-receive-bulk.spec.ts) |
| Claim auto-fill (F#3) | 8-field happy + not-owner 422 + unregistered 422 + rate limit | [`04-claim-autofill.spec.ts`](../../tests/e2e/specs/04-claim-autofill.spec.ts) |
| Extension marketplace (F#8) | 3-stage checkout + disabled SKU + not-owner + flag-gated 503 | [`05-extension-checkout.spec.ts`](../../tests/e2e/specs/05-extension-checkout.spec.ts) |
| LIFF a11y WCAG 2.1 AA | 5 surfaces + amber-contrast regression + Thai lang | [`liff-a11y.test.js`](../../tests/jest/a11y/liff-a11y.test.js) |

## Local dev setup (one-time)

### Step 1 — Install Playwright browsers

```bash
# Already declared in devDependencies — installs binary set
npx playwright install chromium webkit
```

### Step 2 — Install jest-axe (R4 BLOCKER #4 deps)

These are listed under `_devDependencies_pending_install` in `package.json` to avoid lockfile drift in the scaffolding commit:

```bash
npm install --save-dev jest-axe @axe-core/playwright
```

After install completes, manually move the keys from `_devDependencies_pending_install` into `devDependencies` in `package.json`. CI workflow handles this automatically.

### Step 3 — Configure E2E credentials (`.env.local` — gitignored)

```bash
# tests/e2e/.env.local
E2E_BASE_URL=https://staging.dinoco.in.th
E2E_ADMIN_USER=e2e-admin
E2E_ADMIN_PASS=<from 1Password / vault>
E2E_LIFF_ID=<staging LIFF id>
```

Production runs MUST use a dedicated `.env.prod-readonly` profile and NEVER write to live data.

## Run command reference

| Command | Purpose |
|---|---|
| `npm run test:e2e:sn` | Full SN smoke suite (chromium + liff-mobile, all specs) |
| `npm run test:e2e:smoke` | Only `@smoke` tagged tests — blocking gate for deploy |
| `npm run test:e2e:sn:ui` | Interactive UI runner — best for debugging failures |
| `npm run test:a11y` | jest-axe scan on LIFF surfaces (< 5s) |
| `npx playwright test --config=tests/e2e/playwright.config.ts --debug` | Step-through debugger |
| `npx playwright show-report` | View HTML report from previous run |

### Run a single spec

```bash
npx playwright test --config=tests/e2e/playwright.config.ts \
  tests/e2e/specs/01-warranty-activate.spec.ts
```

### Filter by browser

```bash
# Customer flows only (LINE in-app browser emulation)
npx playwright test --config=tests/e2e/playwright.config.ts \
  --project=liff-mobile

# Admin flows only (Desktop Chrome)
npx playwright test --config=tests/e2e/playwright.config.ts \
  --project=chromium
```

## CI integration

### GitHub Actions matrix (template — to be wired into existing `.github/workflows/`)

```yaml
name: E2E SN Smoke (R4 BLOCKER #4)

on:
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  e2e-sn-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm install --save-dev jest-axe @axe-core/playwright
      - run: npx playwright install --with-deps chromium webkit

      - name: Run jest-axe a11y gate
        run: npm run test:a11y

      - name: Run Playwright SN smoke
        env:
          E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
          E2E_ADMIN_USER: ${{ secrets.E2E_ADMIN_USER }}
          E2E_ADMIN_PASS: ${{ secrets.E2E_ADMIN_PASS }}
        run: npm run test:e2e:smoke

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

      - name: Upload trace files on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-traces
          path: test-results/
          retention-days: 7
```

### Pre-deploy hook (Phase 2 W7 atomic deploy gate)

Add to `scripts/predeploy.sh`:

```bash
# Block deploys until smoke + a11y pass
npm run test:a11y || { echo "FAIL: WCAG 2.1 AA violations"; exit 1; }
npm run test:e2e:smoke || { echo "FAIL: SN smoke regression"; exit 1; }
```

This wires into the [Phase 2 W7 Atomic Deploy Strategy](15-phase2-w7-atomic-deploy-strategy.md) — failed smoke = no flag flip.

## Cross-browser strategy

DINOCO LIFF surfaces run inside LINE in-app browser:

| Platform | Engine | Project name | Notes |
|---|---|---|---|
| LIFF iOS | Safari WebKit | `liff-mobile` | UA spoofed `Line/13.x` over iPhone 13 viewport |
| LIFF Android | Chromium WebView | (covered by `chromium`) | UA spoofing optional — most surfaces work in stock Chrome |
| Admin desktop | Chrome / Edge / Firefox | `chromium` | Admin Dashboard primary target |
| Future: Safari Desktop | WebKit | TODO | Add `webkit` project once root config pattern lands |

The LINE UA string is intentionally permissive — most LIFF SDK detection only checks for `Line/` substring. Real LINE app uses Safari/WebKit on iOS and Chromium WebView on Android, and our existing root [`playwright.config.js`](../../playwright.config.js) already has WebKit + mobile-safari projects we can borrow if needed.

## Test data fixtures

All E2E SNs use prefix `DNCSSTEST` or `DNCQA` — reserved by the schema spec ([`05-schema-v1.sql`](05-schema-v1.sql)) and excluded from production batch generation.

Fixture file: [`tests/e2e/fixtures/test-data.json`](../../tests/e2e/fixtures/test-data.json)

### Adding new fixtures

1. Reserve the SN range in `05-schema-v1.sql` reserved-prefix comment.
2. Add entry to `plates.<scenario>` in `test-data.json`.
3. Pre-seed staging DB via WP-CLI:

```bash
wp dinoco-sn seed-fixtures --file=tests/e2e/fixtures/test-data.json --env=staging
```

(WP-CLI command stub — implement under `[Admin System] DINOCO Production SN Manager` if scaling fixtures becomes painful.)

### Cleaning up after a run

E2E specs that create new state (Spec 2 batch / Spec 3 receive) MUST clean up via `afterEach` or use timestamp-suffixed identifiers to avoid duplicate-key conflicts. Spec 2 uses `Date.now()` suffix; Spec 3 currently relies on idempotency wrapper.

For periodic deep clean:

```bash
wp dinoco-sn cleanup-e2e --older-than=24h --env=staging
```

## Failure debugging workflow

1. **Trace zip** — Open `playwright-report/` HTML, click failing test, download trace
2. **Run with `--headed --debug`** — step through interactively
3. **Inspect page state** — `await page.pause()` opens Playwright Inspector
4. **Cross-reference Sentry** — every test sends `X-Request-ID: e2e-sn-{ts}`; find correlated server errors
5. **Check observability ledger** — `dinoco_sn_obs_capture()` calls in [Manager V.0.24](../sn-system/01-system-architecture.md) emit structured context

### Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `LIFF init failed (mock)` | `injectLiffMockAndWait` not called before `goto` | Move `injectLiffMockAndWait` into `beforeEach` |
| `429 rate_limited` on lookup | Spec 4 rate limit test polluted siblings | Run with `--workers=1` (already default) |
| `409 idempotency_conflict` on bulk | Repeat test runs without DB reset | Use timestamp-suffixed IDs OR add `afterEach` cleanup |
| `Stub fixture missing` warning | Fixture HTML file not created | Add to `tests/jest/a11y/fixtures/` (deferred Sprint 1.5) |
| WCAG color-contrast violation | CSS regression below 4.5:1 | Restore amber to #b45309 (audit BUG UX-C3) |

## Sprint 1 acceptance criteria

- [x] Playwright config exists at `tests/e2e/playwright.config.ts`
- [x] 5 spec files cover critical paths (warranty / batch / receive / claim / extension)
- [x] LIFF SDK mock helper supports profile injection + REST mocking
- [x] Test data fixtures use reserved `DNCSSTEST` prefix
- [x] jest-axe a11y gate covers ≥ 5 LIFF surfaces
- [x] `package.json` exposes `test:e2e:sn` / `test:e2e:smoke` / `test:a11y` scripts
- [x] Drift detector enforces all the above
- [ ] CI workflow `.github/workflows/e2e-sn-smoke.yml` wired (Sprint 1.5)
- [ ] Fixture HTML files generated from real LIFF surfaces (Sprint 1.5)
- [ ] WP-CLI `dinoco-sn seed-fixtures` command implemented (Sprint 2)

## Open follow-ups

| ID | Owner | Description |
|---|---|---|
| E2E-1 | TBD | Wire CI workflow file (`.github/workflows/e2e-sn-smoke.yml`) |
| E2E-2 | TBD | Generate fixture HTML snapshots from real WP rendering |
| E2E-3 | TBD | Add WP-CLI seed-fixtures + cleanup-e2e commands |
| E2E-4 | TBD | Add visual regression suite (`@visual` tag — Phase 4) |
| E2E-5 | TBD | Add perf budget assertions on critical paths (Phase 3) |

## References

- [`01-system-architecture.md`](01-system-architecture.md) — overall SN system topology
- [`12-phase2-w7-deploy-runbook.md`](12-phase2-w7-deploy-runbook.md) — atomic deploy strategy
- [`15-phase2-w7-atomic-deploy-strategy.md`](15-phase2-w7-atomic-deploy-strategy.md) — Sprint 1 gating context
- [Playwright config root](../../playwright.config.js) — Phase 7 LIFF foundation (separate config)
- [Drift detector](../../tests/jest/sn-system-drift.test.js) — enforces this scaffolding stays in place
