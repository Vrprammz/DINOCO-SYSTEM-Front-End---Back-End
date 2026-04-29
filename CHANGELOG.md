# Changelog

ประวัติ test infrastructure + quality gate ของ DINOCO System.
ไม่ใช่ user-facing changelog — เน้น dev/QA history.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) (loosely).
Snippet versioning ของ feature changes ดูใน individual snippet headers (`Version: V.X.Y`).

---

## [Unreleased]

### Fixed — Flash V.42 deep audit (2026-04-29) — 8 findings closed

api-specialist + feature-architect agents dispatched for full audit of Flash V.42
implementation vs `FEATURE-SPEC-FLASH-SHIPPING-META-2026-04-17.md`.

**P0 (commit `41ddc5d`)**:
- **G1** — admin "Flash Create" REST routed via `b2b_flash_dispatch_create_all()`
  instead of bypassing dispatcher (Snippet 5 V.33.2 + Snippet 9 V.34.0)
- **G2** — 1003 (duplicate outTradeNo) idempotent recovery via `mchPno` query +
  regenerate fallback (Snippet 1 V.34.21)

**P1 follow-ups (commit `0a28359`)**:
- **B5** — audit row trace fields `original_out_trade_no` + `g2_attempts` +
  `g2_outcome` for 1003 post-mortem
- **D3** — REG-069 + REG-070 regression scenarios

**P1 (commit `7f49c0d`)**:
- **G3** — removed broken BO secondary fallback that called
  `b2b_flash_create_order($order_id, array(...))` with array→int(1) coercion
  (Snippet 16 V.2.8)
- **G4** — async snapshot defer via `wp_schedule_single_event` (HIGH-2 closed
  from Round 4-8 audit; Snippet 1 V.34.23)

**Deep audit (commit `ae60b47`, Snippet 1 V.34.24)**:
- **BUG-2 CRITICAL** — `subParcel` JSON encoding (multi-box ticket signature
  mismatch). Pre-fix sent PHP nested array → `b2b_flash_sign()` cast `(string)$v`
  = literal `"Array"` while wp_remote_post serialized actual structure → Flash
  hash mismatch on every multi-box order. Fix: `wp_json_encode($sp_array)` per
  Flash spec line 209
- **BUG-1 CRITICAL** — `insureDeclareValue=''` undefined behavior. Fix: omit
  field when not insured (V.42 + V.41 paths)
- **ISSUE-5 HIGH** — V.41 path missing 7 returnXXX fields (walk-in tickets
  ตีกลับไปโกดังแทนบริษัท). Fix: added `b2b_registered_address` 7 fields
- **ISSUE-6 HIGH** — V.41 articleCategory default 99 → 6 (align V.42 default)

**Tests**: REG-069..079 added (11 new scenarios) in
FLASH-SHIPPING-V42-REGRESSION-MANIFEST.md.

### Documentation — Flag name drift fix (2026-04-29)

Synced `FEATURE-SPEC-FLASH-SHIPPING-META-2026-04-17.md` flag references from
incorrect `dinoco_flag_shipping_meta_enabled` to actual `dinoco_shipping_meta_enabled`
(matches code in CLAUDE.md line 318 + Snippet 1 + dispatcher). 10 occurrences
across spec sections §10/§17.2/§22.

### Added — OpenAPI spec coverage expansion (2026-04-28 → 2026-04-29)

ขยาย `docs/api/openapi.yaml` จาก ~50% → ~70% ของ 125+ production endpoints.

- **B2B Backorder family (+6)** — bo-cancel-item, bo-order-detail, bo-update-eta, bo-bulk-fulfill, bo-bulk-cancel, bo-clear-enum-flag
- **B2B Flash family (+5)** — flash-label, flash-ready-to-ship, flash-cancel, flash-ship-packed (RPi auth), flash-dashboard-stats
- **Inventory family (+6)** — stock/transfer, dip-stock/{start,current,count,approve,history}
- **B2F family (+5)** — approve-reschedule, reject-lot, reject-resolve, po-complete, po-history
- **LIFF AI family (+3)** — dealer-dashboard, lead/{id}/accept, lead/{id}/note

แต่ละ endpoint มี handler line ref + verified request/response shapes + error codes.

### Added — Playwright E2E foundation (Phase 7)

| Phase | Commit | Tests |
|---|---|---|
| V.0.1 Foundation | `511cd81` | cart + api-client (8 tests) |
| V.0.2 Module composition | `8187eb2` | full place-order flow auth→cart→submit (4) |
| V.0.3 Modal + liff-init | `785b89d` | window.dinocoModal bridge + redirect paths (10) |
| V.0.4 iOS coverage | `fdb343f` | WebKit + mobile-safari projects |

22 tests × 4 browser projects = **88 runs ใน 17s** (chromium / mobile-chrome / webkit / mobile-safari).

### Added — 6 self-reinforcing drift detectors

ทุกตัว auto-fail CI เมื่อ docs/code drift:

| Detector | Catches | Tests |
|---|---|---|
| api-contract | api-client method ↔ OpenAPI spec | 3 |
| JSDoc endpoint refs | JSDoc claims ↔ register_rest_route | 3 |
| Snippet DB_ID | Sync engine matching key | 4 |
| Shortcode | CLAUDE.md ↔ add_shortcode() | 4 |
| Constants | CLAUDE.md ↔ define()/defined() | 4 |
| Feature flags | CLAUDE.md ↔ get_option() / flag helpers | 4 |

### Added — 4 security scanners

| Scanner | Catches |
|---|---|
| Secrets pattern | LINE/Telegram/GitHub PATs, AWS keys, JWTs in committed code |
| Dangerous APIs (JS) | eval, Function, document.write, setTimeout("string", ...) |
| PHP security | RCE_EVAL, RCE_SHELL (system/exec/passthru/shell_exec/popen) |
| Bundle size | Vite output >10KB per entry |

### Added — CI workflows

| Workflow | Trigger |
|---|---|
| PHPUnit (existing) | Every push, path-filtered PHP |
| Frontend (Jest + ESLint + tsc) | Every push, path-filtered JS/MD |
| Playwright E2E | matrix [chromium, mobile-chrome, webkit, mobile-safari] |
| Security Audit | npm + composer audit, weekly + dep PR |
| CodeQL SAST | JS/TS taint analysis, weekly + push |
| Dependabot | Weekly auto-PRs across 5 ecosystems |

### Added — Developer experience

- **`npm run test:all`** — unified runner, frontend gates ใน 3 วินาที
- **Pre-push hook auto-install** — ผ่าน `npm prepare` lifecycle, opt-out via `SKIP_HOOKS_INSTALL=1`
- **`.editorconfig`** — cross-IDE indent + line-ending consistency
- **`CONTRIBUTING.md`** — onboarding guide, 260 lines (TL;DR + setup + conventions + commit format + emergency overrides)

### Added — Static analysis

- **ESLint 9 flat config** — scope `liff-src/` + `tests/jest/` + `brand-voice-extension/`
- **TypeScript `--checkJs`** — JSDoc type validation, ambient declarations ใน `liff-src/types.d.ts`

### Fixed — Real bugs caught by infrastructure (24 silent bugs)

| # | Bug | Detector |
|---|---|---|
| 1-2 | Stock semantics drift (Phase 5) | PHPUnit retrospective |
| 3-5 | OpenAPI YAML flow syntax × 3 (`bo-confirm-full`, `delta`, `group_id`) | OpenAPI validator |
| 6 | Dead `state` variable in liff-init.js | ESLint |
| 7 | False `[MIT License](LICENSE)` claim in openclawminicrm/README.md (root LICENSE is Proprietary) | Markdown link checker |
| 8 | Dead `pageData` state in popup.js | ESLint (after extension scope add) |
| 9-13 | Unused `catch (e)` × 5 → renamed to `_e` | ESLint |
| 14-18 | Type errors × 5 (`window.liff` undeclared, `RequestCredentials` enum, etc.) | TypeScript --checkJs |
| 19 | `cancelRequest` path drift (POST `/cancel-request/{id}` → real `/cancel-request` body) | api-contract drift |
| 20 | `getHistory` path (`/history` → `/order-history`) | api-contract drift |
| 21 | `getTicket` path/method (`/ticket/{id}` → `/order-detail?ticket_id=X`) | api-contract drift |
| 22 | Ghost `modifyOrder` method (no production endpoint exists) | api-contract drift + grep |
| **23** | **`X-B2B-Session` → `X-B2B-Token`** auth header drift (every call would 401 in prod) | Manual cross-ref |
| 24 | JSDoc `/b2b/v1/auth` → real `/auth-group` (+ HMAC params requirement) | Manual cross-ref |

ก่อนหน้า session นี้ ทุก bug silent ใน prod. หลังจากนี้ทุก class drift auto-fail CI.

---

## Phase 5 — PHPUnit Test Infrastructure (2026-04-28)

Two-tier PHPUnit stack:
- **Tier 1 (Unit)** — 110 tests / pure PHP stubs / <5s
- **Tier 2 (Integration)** — 51 tests / wordpress-develop + MySQL / ~1 min

ครอบ FOR UPDATE / GET_LOCK / FSM transitions / REST routing / audit dual-write.

### CI iteration story

14 fix commits to first GREEN — แต่ละ iteration peel back env-layer assumption (composer lock drift → yoast PHPUnit 10 incompat → svn missing → set_up visibility → assertWPError clash → PHPUnit 10 vs WP test suite → ACF Pro stubs → b2b_log stub → cascade test cache quirk).

### M4 — Concurrent harness

3 concurrent tests via 2nd `mysqli` connection (not pcntl_fork — CI runners disable fork):

| Primitive | Used by | Test |
|---|---|---|
| `SELECT ... FOR UPDATE` | `dinoco_stock_subtract/add` | `ConcurrentStockSubtractTest` |
| `GET_LOCK` (rate limit) | `b2b_rate_limit` | `RateLimitGetLockTest` |
| `GET_LOCK` (per-order FSM) | `B2B_Order_FSM::transition` | `FsmConcurrentLockTest` |

### Production behaviors discovered

1. `dinoco_compute_hierarchy_stock` per-process static cache (Snippet 15:1689) — never invalidates within process. Production OK due to per-request boundary; risk for long-running CLI/workers.
2. `dinoco_stock_subtract` underflow semantics (Snippet 15:1238) — when `allow_negative=false`, clamps to 0 silently rather than returning `WP_Error`. Returns error only for `invalid_qty`/`not_leaf`/`sku_not_found`/`db_error`.

---

## Phase 6 — Jest Frontend Tests

136 tests / 17 files / <1s

| Module | Coverage |
|---|---|
| cart.js | 38 tests / all 13 exports |
| api-client.js | 33 tests / createApi + createB2BApi |
| liff-init.js | 7 tests / login redirect + edge cases |
| liff-auth.js | 9 tests / backend handshake |
| modal.js | 9 tests / fallback + production paths |
| OpenAPI validator | 9 tests / spec structure + $refs |
| Markdown links | 2 tests / 99 .md files scanned |
| Secrets scanner | 2 tests / pattern + context-aware |
| Dangerous APIs | 2 tests / RCE/XSS sinks |
| Bundle size | 2 tests / 10KB/entry guard |
| PHP security | 2 tests / RCE patterns + comment-aware |
| api-contract drift | 3 tests |
| JSDoc endpoint refs | 3 tests |
| Snippet DB_ID | 4 tests |
| Shortcode drift | 4 tests |
| Constants drift | 4 tests |
| Feature flags drift | 4 tests |

**Coverage** `liff-src/shared/`: 95.83% stmts / 84.84% branches / 90.9% funcs.

---

## Test Counts Total

| Suite | Tests | Speed |
|---|---|---|
| PHPUnit Unit + Integration | 161 | ~1 min |
| Jest (17 files) | 136 | <1s |
| Playwright E2E (5 specs × 4 projects) | 88 | ~17s |
| ESLint + tsc | 0 errors | <2s |
| **Total** | **385** | |

---

## Notes

- Snippet `Version: V.X.Y` history lives in each snippet's header comment, not this file.
- Production behavior changes ดู `CLAUDE.md` "Development Notes" section.
- Audit retrospectives ดู `docs/audit/`.
- CI workflow definitions ดู `.github/workflows/`.

Generated from git history at session end (2026-04-29).
