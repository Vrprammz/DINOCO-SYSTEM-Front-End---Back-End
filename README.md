# DINOCO System

[![PHPUnit](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/phpunit.yml/badge.svg?branch=main)](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/phpunit.yml)
[![Jest](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/jest.yml/badge.svg?branch=main)](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/jest.yml)
[![Playwright](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/playwright.yml/badge.svg?branch=main)](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/playwright.yml)
[![Security Audit](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/security-audit.yml/badge.svg?branch=main)](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/security-audit.yml)
[![Regression Guard](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/regression-guard.yml/badge.svg?branch=main)](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/regression-guard.yml)
[![Coverage Lines](https://img.shields.io/badge/jest_coverage_lines-98.68%25-brightgreen)](coverage/jest/index.html)
[![Coverage Branches](https://img.shields.io/badge/jest_coverage_branches-85.09%25-green)](coverage/jest/index.html)
[![PHPUnit Tests](https://img.shields.io/badge/phpunit_tests-770_passing-brightgreen)](tests/helpers/)
[![Jest Tests](https://img.shields.io/badge/jest_tests-161_passing-brightgreen)](tests/jest/)
[![Idempotency](https://img.shields.io/badge/idempotency-45.4%25_(89%2F196)-brightgreen)](docs/audit/IDEMPOTENCY-COVERAGE.md)
[![Mermaid Diagrams](https://img.shields.io/badge/mermaid_diagrams-23-blue)](WORKFLOW-REFERENCE.md)

WordPress-based motorcycle warranty management platform serving B2C members and B2B distributors.

## Architecture

- **Backend**: WordPress + Advanced Custom Fields (ACF). Custom Post Types for claims, registrations, B2B orders.
- **Frontend**: Vanilla HTML/CSS/JavaScript embedded inline in PHP files. UI exposed via WordPress shortcodes.
- **Authentication**: LINE Login (OAuth2) creates/links WordPress users.
- **AI Module**: Gemini Flash + Claude (chatbot) + Gemini (admin AI control panel).
- **Integrations**: LINE push notifications, Flash Express shipping, Slip2Go (Thai bank slip verification), Telegram alerts.
- **Documentation**: 22 Mermaid diagrams (`WORKFLOW-REFERENCE.md`) cover B2B order, B2F PO sequence, Walk-in stateDiagram, MCP Bridge, Brand Voice, member warranty, etc.

## What's New (2026-04-30)

Idempotency-Key coverage: **🎯 45.4% (89/196 POST endpoints)** ⭐ — TRUE 45% milestone reached against authoritative Round 30 census denominator. Past 9/20 of mutating REST surface. See [`docs/audit/IDEMPOTENCY-COVERAGE.md`](docs/audit/IDEMPOTENCY-COVERAGE.md).

Recent infrastructure rounds (Rounds 13-40):

- **Round 40** ⭐ — Idempotency batch 18 +5 endpoints (84 → 89, **🎯 45.4% TRUE milestone**). Pivot from saturated B2B Flash admin cluster (Round 36-39) to mixed-namespace closure: 1 LIFF AI + 4 Inventory. claim/{id}/status (admin LIFF AI Command Center status dropdown → slow ACF save → 2× dinoco_set_claim_status() → 2× status_history + 2× admin_note + 2× hook chain LINE push potential; single `{claim_id, status, note, actor uid from JWT}` — JWT-scoped actor) + dip-stock/start (admin "เริ่มนับสต็อก" double-click race → 10K+ row snapshot DB storm; **constant-marker** `{action: 'start'}` — 4th instance after stock/initialize R30 + manual-flash-test R32 + daily-summary R39, pattern firmly proven across 4 rounds) + dip-stock/force-close (admin "ปิด session" double-click → 2× UPDATE + b2b_log fires twice audit noise; single `{session_id}` — 0 means close-any-in-progress) + stock/settings (admin "บันทึก" → 8 DB writes guard; **selective save** body hash — only fields PRESENT hashed; alert_enabled boolean discriminator) + shipping-defaults (admin "บันทึกค่าเริ่มต้น Flash" → 2× wp_dinoco_flash_audit INSERT + cache flush + update_option churn; bulk-shape with express_threshold ksort-normalized + flag_enabled **boolean discriminator** — V.42 enable/disable is single most consequential Flash admin action, ON↔OFF flip catches 409). +18 contract tests (329 → 347 cumulative). **Inventory namespace coverage 9 → 13 (+4)**. **LIFF AI namespace coverage 1 → 2 (+1)**. Pattern: 2× single + 1× constant-marker + 1× selective save + 1× bulk-shape with boolean discriminator.
- **Round 38** — Idempotency batch 16 +5 endpoints (74 → 79, 🎯 40.3% TRUE milestone). bo-notify (admin "ส่ง Flex แจ้งลูกค้า" double-click → LINE Flex spam guard; bulk-shape `{ticket_id, items sorted by sku}`) + rpi-command (admin spam-click "รีบูท RPi" → 2× cmd_id queue entries; bulk-shape `{command, params normalized via ksort}`) + rpi-flash-box-packed (RPi scanner double-trigger → manifest-completion 2× Flash /notify quota burn; single `{pno}` with 4 success store sites — reused_pickup / called / pending / partial-status) + flash-ship-packed (timeout dialog double-confirm → 2× courier /notify + admin LINE notification + hold_pending Flex push; single `{ticket_id}`) + flash-label (admin "ดาวน์โหลด Label" double-click → 2× Flash /open/v3/orders/printPdf quota burn; single `{pno}` — binary PDF cannot replay through cache, returns JSON marker). +19 contract tests (293 → 312 cumulative). Snippet 3 coverage 54% → 69% (14/26 → 18/26 POST routes). B2B namespace 57% → 66%. Pattern: 2× bulk-shape + 3× single + multi-success-site (rpi-flash-box-packed = 4 distinct success returns).
- **Round 37** — Idempotency batch 15 +5 endpoints (69 → 74, 37.8%). Snippet 3 RPi + customer LIFF retry-prone hot paths: print-test (constant-marker `{type}`) + print-requeue + rpi-accept-order + rpi-flash-ready + slip-upload (CRITICAL Slip2Go double-charge guard `{ticket_id, gid}` with image_base64 EXCLUDED). +20 contract tests.
- **Round 34** — Idempotency batch 12 +5 endpoints (54 → 59, **🎯 30.1% TRUE milestone**). bo-clear-enum-flag (admin Security Log false-positive flag reset — log/alert spam guard) + kb-suggest (chatbot Gemini retry → frequency double-increment) + brand-voice-submit (OpenClaw retry → ML signal poisoning) + distributor/delete (admin destructive guard) + distributor/toggle-bot (boolean-discriminator pattern — replay >5s silent flip without wrapper). +18 contract tests (218 → 236 cumulative). NEW `docs/patterns/IDEMPOTENCY-KEY.md` "Round 18-34 case study patterns" section crystallizing 5 distinct patterns observed across 17 rounds.
- **Round 33** — Idempotency batch 11 +5 endpoints (49 → 54, 27.6% — denominator refreshed Round 33 to 196 from 193, +3 natural growth). maker-product + maker + po-undo-submit (B2F CRUD/admin) + distributor-notify + customer-link (MCP OpenClaw retry-prone). +18 contract tests. Drift detector extended (4 → 5 tests) — POST-only assertion guards against scope creep.
- **Round 32** — Idempotency batch 10 +5 endpoints (44 → 49, 25.4% TRUE milestone). maker-reschedule (Maker LIFF retry guard) + manual-flash-test (Flash quota retry burn) + bo-update-eta (silent "|" notes double-append) + bo-restock-scan (admin click + cron concurrent) + reject-lot (Maker rejection Flex re-fire). +17 contract tests (183 → 200 cumulative).
- **Round 31** — Idempotency batch 9 +5 endpoints (39 → 44, 22.8%) + cron audit follow-ups + NEW F1-class drift regression guard (`tests/jest/idempotency-tracker-drift.test.js`). claim-update + lead-update (paired with Round 30 creates) + product/pricing + warehouse + maker-reject. +17 contract tests (166 → 183 cumulative).
- **Round 30** — Idempotency batch 8 +6 endpoints (incl. F1 HIGH drift fix for bo-fulfill listed integrated since Round 19 but had no wrapper) + REST endpoint census (75 → 193 authoritative POST denominator) + IdempotencyTestFixture DRY base class adoption. +21 contract tests (145 → 166).
- **Round 29** — Idempotency batch 7 +5 endpoints (28 → 33) + IdempotencyTestFixture introduction (~80% LOC saved per round file) + 4-finding drift sweep + README badge. +21 contract tests.
- **Round 28** — Idempotency batch 6 +5 endpoints (23 → 28, ~37% of POST surface) + cron audit (2 crons migrated to registry heartbeat = 100% coverage) + NEW `docs/audit/IDEMPOTENCY-COVERAGE.md` tracker. 3 admin B2B endpoints (admin-stock-unlock + admin-stock-mark-oos + admin-submit-tracking) + 2 B2F endpoints (approve-reschedule + reject-resolve). 2nd bulk-array endpoint (admin-submit-tracking entries[] sort by ticket_id) + bulk-of-targets pattern (admin-stock-unlock notify_tickets[]). +18 contract tests (88 → 106 cases).
- **Round 27** — Idempotency batch 5 +5 endpoints (18 → 23, ~31% of POST surface). 3 BO endpoints (bo-cancel-item / bo-bulk-fulfill / bo-bulk-cancel) + B2F po-complete + Inventory dip-stock/approve. First batch with 3 bulk-array endpoints — canonical sort pattern proven (admin row reorder ≠ different intent; qty/value field changes still surface 409). +16 contract tests.
- **Round 26** — Idempotency batch 4 +5 endpoints (13 → 18, ~24% of POST surface) + GDPR V.4.0 LINE messages export from OpenClaw MongoDB (closes deferred Phase 6.1 item from CLAUDE.md scope). +29 tests (16 contract + 13 LINE export normalization).
- **Round 25** — Idempotency expansion +5 (8 → 13 endpoints) + GDPR 25-day SLA reminder cron. +15 contract tests.
- **Round 24** — GDPR Phase 7 admin review UI + 6 admin REST endpoints. +28 admin permission tests.
- **Round 23** — Idempotency expansion (3 → 8) + GDPR Phase 6 deletion executor. +15 contract tests + 19 decision matrix tests.
- **Round 22** — B2F V.7.0 Order Intent Dashboard + filter persistence.
- **Round 21** — Patterns library + cron drift + inline handler regression. +1 drift detector (7 → 8).
- **Round 19** — Idempotency-Key integrated on 3 critical POST endpoints (place-order, manual-flash-create, create-po). +20 contract tests.
- **Round 18** — Idempotency Helper foundation V.1.0 (NEW snippet, 5 functions, 25 unit tests). +18 IsTopLevelSet test cases.
- **Cumulative**: 0 → 529 PHPUnit tests + 0 → 156 Jest tests + 0 → 23 Mermaid diagrams + 0 → 8 drift detectors. ZERO regressions.

See [docs/audit/ROUNDS-1-19-RETROSPECTIVE.md](docs/audit/ROUNDS-1-19-RETROSPECTIVE.md) for full retrospective.

## Documentation

| Doc | Purpose |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Workflow guide for contributors (local setup, hooks, quality gates) |
| [CHANGELOG.md](CHANGELOG.md) | Test infrastructure + quality gate history (dev/QA scope) |
| [CLAUDE.md](CLAUDE.md) | Architecture overview + conventions + ~7000 lines of accumulated wisdom for AI assistants |
| [SYSTEM-REFERENCE.md](SYSTEM-REFERENCE.md) | Snippet mapping, REST endpoints, DB schema, constants |
| [WORKFLOW-REFERENCE.md](WORKFLOW-REFERENCE.md) | Business workflows (B2B order, B2F PO, claims, inventory) |
| [FEATURE-SPECS.md](FEATURE-SPECS.md) | Feature specifications + implementation details |
| [docs/audit/ARCHITECTURE-STATUS.md](docs/audit/ARCHITECTURE-STATUS.md) | Refactor pillar deployment status |
| [docs/runbooks/TESTING-PHASE-5.md](docs/runbooks/TESTING-PHASE-5.md) | PHPUnit unit + integration test setup |
| [docs/runbooks/TESTING-PHASE-6.md](docs/runbooks/TESTING-PHASE-6.md) | Jest frontend test setup |
| [docs/runbooks/TESTING-PHASE-7.md](docs/runbooks/TESTING-PHASE-7.md) | Playwright E2E test setup |

## Testing

### Quick start — run everything locally

```bash
npm run test:all              # alias for ci:local
npm run test:all -- --skip-php   # frontend only (no PHP/MySQL needed)
```

Runs the same gates GitHub Actions runs (ESLint → typecheck → Jest → Vite build → bundle-size → npm audit → PHPUnit if available). Fail-fast, ~3s for frontend-only.

### Backend (PHP / WordPress)

```bash
# Pure-logic unit tests (no DB, < 5s, 110 tests)
composer test:unit

# Integration tests (real WP + MySQL, requires WP_TESTS_DIR + wordpress-develop)
composer test:integration

# Both
composer test:all
```

See [docs/runbooks/TESTING-PHASE-5.md](docs/runbooks/TESTING-PHASE-5.md) for setup.

### Frontend (LIFF / JavaScript)

```bash
# ESLint (catches undefined refs, unused vars, eq inconsistency)
npm run lint
npm run lint:fix             # auto-fix where possible

# Jest unit tests for liff-src/shared/ + OpenAPI spec validation (104 tests, < 1s)
npm test
npm run test:jest:coverage   # generate coverage/jest/

# Playwright E2E (real Chromium + mobile Chrome, ~6s)
npm run test:e2e
npm run test:e2e:ui          # interactive Playwright UI mode
```

Covers cart state machine, REST client, LIFF auth, modal bridge — all pure-function modules with mocked fetch + window.liff. ESLint also runs on every push via the same CI workflow. See [docs/runbooks/TESTING-PHASE-6.md](docs/runbooks/TESTING-PHASE-6.md) (Jest) and [docs/runbooks/TESTING-PHASE-7.md](docs/runbooks/TESTING-PHASE-7.md) (Playwright).

### Test counts

| Suite | Tests | Runtime | Surface |
|---|---|---|---|
| PHPUnit Unit | 529 | < 5s | Pure-logic helpers (math/policy) — 23+ test files (Currency, Hierarchy, IsTopLevelSet, IntentBreakdown, ValidateSkuHierarchy, V70SourceSku, FlashEcSuggester, DiscountTier, BoxCalc, BoQty, ShippingResolve, OrderSnapshot, FlashSign, FlagAudit, Idempotency, IdempotencyEndpointContract, GdprDeletionDecision, GdprAdminPermission, +5 more) |
| PHPUnit Integration | 51 | ~1 min | DB-coupled (FOR UPDATE, GET_LOCK, FSM, REST) |
| Jest | 156 | < 2s | LIFF foundation + OpenAPI + links + secrets + dangerous-APIs + PHP security + 8 drift detectors (api-contract / JSDoc / DB_ID / shortcode / constants / feature-flags / REST endpoints / cron) |
| Playwright E2E | 25 × 4 projects | ~9s | Cart + API client + place-order + modal + liff-init + Vite-built bundle smoke in 4 browsers |
| **Total** | **836** | | |

### Coverage (Jest)

Generated by `npm run test:jest:coverage` — output at `coverage/jest/index.html`.

| Metric | Coverage |
|---|---|
| Lines | 98.68% |
| Statements | 96.38% |
| Functions | 93.75% |
| Branches | 85.09% |

PHPUnit coverage requires XDebug or PCOV PHP extension (not currently installed in CI). Run `pecl install pcov` locally to enable `vendor/bin/phpunit --coverage-text`.

## Deployment

Code-Snippets-based — push to `main` triggers GitHub Webhook Sync engine which auto-syncs all snippets to WordPress via DB_ID matching. No build step.

See [CLAUDE.md](CLAUDE.md) "Development Notes" section for deployment details.
