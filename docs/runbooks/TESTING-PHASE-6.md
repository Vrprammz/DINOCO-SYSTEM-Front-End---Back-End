# Phase 6 — Jest Frontend Tests (Runbook)

**Status**: Applied 2026-04-28
**Scope**: `liff-src/shared/*` pure-function modules + LIFF page JS

---

## What's covered

| Module | Tests | Notes |
|---|---|---|
| `liff-src/shared/cart.js` | 38 | All 13 exports — pure-function cart state machine |
| `liff-src/shared/api-client.js` | 33 | `createApi` factory + `createB2BApi` wrapper, fetch mocked |

Total: **71 tests, < 1s**.

---

## Local development

```bash
# One-time install (Jest + jsdom + Babel)
npm install

# Run all tests
npm test                       # alias for `jest`
npm run test:jest              # explicit
npm run test:jest:watch        # watch mode
npm run test:jest:coverage     # generate coverage/jest/

# Run a specific file
npx jest tests/jest/cart.test.js
```

Test files live in `tests/jest/*.test.js`. The Jest matcher is configured in `jest.config.js`:

```js
testMatch: ["<rootDir>/tests/jest/**/*.test.js"]
```

---

## Stack decisions

| Concern | Choice | Why |
|---|---|---|
| Test runner | **Jest 29** | Mature ecosystem, jsdom built-in, JUnit reporter for CI |
| Module system | ES modules via Babel | `liff-src/` source uses `import/export`; Babel transforms for CommonJS Jest |
| DOM environment | **jsdom** | `cart.js` persistence helpers touch `window.localStorage` |
| Network | `global.fetch` mock | `api-client.test.js` swaps fetch per-test; no real network |

**Why Jest, not Vitest?**
Vitest is the natural pair for our Vite build setup, but Jest has zero conflict with our existing Vite config (different binaries, different configs) and ships with `jest-environment-jsdom` + `jest-junit` already battle-tested in CI. Migration to Vitest is a future option once the LIFF Vite migration lands (Phase 2).

**Why Babel preset-env, not @babel/preset-typescript?**
`liff-src/` is plain JS (no TS). preset-env covers `import/export` transformation which is the only piece Jest's CommonJS require chain needs.

---

## CI integration

`.github/workflows/jest.yml` — runs on every push/PR that touches:
- `liff-src/**`
- `tests/jest/**`
- `package.json` / `package-lock.json` / `babel.config.json` / `jest.config.js`

Path-filtered so backend-only PRs don't trigger Jest. PHPUnit + Jest workflows run independently in parallel.

JUnit XML uploaded as artifact `junit-jest` (14-day retention).

---

## File inventory

```
NEW (4 files):
  jest.config.js                  Jest configuration
  babel.config.json               Babel preset-env config
  tests/jest/cart.test.js         Cart state machine tests (38 cases)
  tests/jest/api-client.test.js   REST client tests (33 cases)
  .github/workflows/jest.yml      CI workflow
  docs/runbooks/TESTING-PHASE-6.md   This runbook

MODIFIED (1 file):
  package.json                    + jest scripts, + 6 devDependencies
```

devDependencies added: `@babel/core`, `@babel/preset-env`, `babel-jest`, `jest`, `jest-environment-jsdom`, `jest-junit`.

---

## What's NOT covered (deferred)

### Inline LIFF JS in WP snippets
Files like `[B2B] Snippet 4: LIFF E-Catalog`, `[B2F] Snippet 8: Admin LIFF E-Catalog`, etc. embed JS inline within PHP shortcodes. Jest cannot parse PHP. These will become testable once the Vite LIFF migration (Phase 2 of `liff-src/`) extracts inline JS into ES module entry points.

### `liff-init.js`
LIFF SDK initialization touches `window.liff` global from LINE's CDN — needs end-to-end testing rather than unit testing. Excluded from coverage in `jest.config.js`.

### E2E flows
Customer place-order → confirm → pay covers Snippet 4 + Snippet 2 + Snippet 13 LINE webhooks. Requires Playwright + LIFF mocking (Phase 7).

---

## Adding a new test file

1. Create `tests/jest/your-module.test.js`
2. Use ES module import syntax — Babel handles it:
   ```js
   import { yourFn } from "../../liff-src/shared/your-module.js";
   ```
3. For DOM/localStorage tests: jsdom is the default environment, no setup needed.
4. For fetch mocking: `global.fetch = jest.fn(async () => ({ ok: true, ... }))` in `beforeEach`.
5. Run `npx jest tests/jest/your-module.test.js` to verify locally.
6. Commit + push — CI runs automatically.

---

## Troubleshooting

**`SyntaxError: Cannot use import statement outside a module`**
Make sure `babel.config.json` exists at repo root with `@babel/preset-env`. `package.json` has `"type": "commonjs"` — Babel transforms ES modules at test time.

**`Cannot find module 'jest-environment-jsdom'`**
Run `npm install`. Jest 28+ split jsdom into a separate package.

**`localStorage is not defined`**
Confirm `jest.config.js` has `testEnvironment: "jsdom"` (not `node`).

**Tests pass locally but fail in CI**
Check the GitHub Actions log for `npm ci` errors. If `package-lock.json` drifts, the CI step `npm ci || npm install` will fall back to fresh install.

---

## Plan reference

Phase 6 was planned alongside Phase 5 in `docs/audit/phase-5-test-infrastructure-applied.md` §"Phase 6+ (future sprints)". Original target was Vitest after Vite migration; pulled forward as Jest because pure-function modules don't need Vite's build pipeline to test.
