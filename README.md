# DINOCO System

[![PHPUnit](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/phpunit.yml/badge.svg?branch=main)](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/phpunit.yml)
[![Jest](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/jest.yml/badge.svg?branch=main)](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/jest.yml)
[![Playwright](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/playwright.yml/badge.svg?branch=main)](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/playwright.yml)
[![Security Audit](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/security-audit.yml/badge.svg?branch=main)](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/security-audit.yml)
[![Regression Guard](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/regression-guard.yml/badge.svg?branch=main)](https://github.com/Vrprammz/DINOCO-SYSTEM-Front-End---Back-End/actions/workflows/regression-guard.yml)

WordPress-based motorcycle warranty management platform serving B2C members and B2B distributors.

## Architecture

- **Backend**: WordPress + Advanced Custom Fields (ACF). Custom Post Types for claims, registrations, B2B orders.
- **Frontend**: Vanilla HTML/CSS/JavaScript embedded inline in PHP files. UI exposed via WordPress shortcodes.
- **Authentication**: LINE Login (OAuth2) creates/links WordPress users.
- **AI Module**: Gemini Flash + Claude (chatbot) + Gemini (admin AI control panel).
- **Integrations**: LINE push notifications, Flash Express shipping, Slip2Go (Thai bank slip verification), Telegram alerts.

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
| PHPUnit Unit | 110 | < 5s | Pure-logic helpers (math/policy) |
| PHPUnit Integration | 51 | ~1 min | DB-coupled (FOR UPDATE, GET_LOCK, FSM, REST) |
| Jest | 136 | < 1s | LIFF foundation + OpenAPI + links + secrets + dangerous-APIs + PHP security + 6 drift detectors (api-contract / JSDoc / DB_ID / shortcode / constants / feature-flags) |
| Playwright E2E | 22 × 4 projects | ~17s | Cart + API client + place-order + modal + liff-init in chromium + mobile-chrome + webkit + mobile-safari |
| **Total** | **363** | | |

## Deployment

Code-Snippets-based — push to `main` triggers GitHub Webhook Sync engine which auto-syncs all snippets to WordPress via DB_ID matching. No build step.

See [CLAUDE.md](CLAUDE.md) "Development Notes" section for deployment details.
