# 🐳 E2E Concurrent Test Infrastructure (Docker Compose Plan)

**Date**: 2026-05-07
**Source**: Plan v2.13 §Phase 1 W4 R3 BLOCKER (defer item D4)
**Status**: Design — implementation deferred to Phase 3+
**Owner**: Tech Lead

---

## 🎯 Purpose

Pure-logic PHPUnit + Jest tests cover state transitions + idempotency hash + HMAC + retention — **but cannot test real concurrent races** (e.g. 2 admin scan plate เดียวกันพร้อมกัน → SELECT FOR UPDATE work?). Need real MySQL + WP + Redis stack ใน Docker Compose.

R3 BLOCKER batch landed pure-logic mocks for these scenarios. ใช้ doc นี้เป็น blueprint สำหรับ Phase 3+ E2E suite.

---

## 🏗️ Stack architecture

```
┌────────────────────────────────────────────┐
│  Docker Compose (docker-compose.e2e.yml)   │
└────────────────────────────────────────────┘
       │
       ├── mysql:8.0 (port 3307 — avoid host conflict)
       │   ├── volume: e2e-mysql-data
       │   └── pre-seeded: wp_users + wp_dinoco_sn_pool fixtures
       │
       ├── redis:7 (port 6380 — for transient/cache)
       │   └── volume: e2e-redis-data
       │
       ├── wordpress:php8.2 (port 8081 — staging WP)
       │   ├── env: WP_DEBUG=1, DINOCO_E2E_MODE=1
       │   ├── mounts: /var/www/html/wp-content/snippets/
       │   └── plugins: WP Code Snippets + ACF + Idempotency Helper
       │
       ├── e2e-runner (Node 18)
       │   ├── jest + supertest + playwright
       │   └── concurrency control: p-limit + Promise.race
       │
       └── nginx (port 8080 — reverse proxy)
```

---

## 📋 5 Concurrent Test Scenarios

### Scenario 1 — Activate same SN simultaneously (race)

**Setup**:
- Pool fixture: `DNCSS0001234` status=`in_pool`
- 2 customer accounts (user_a, user_b) ทั้งคู่ logged in via LINE OAuth mock

**Steps** (parallel):
- T+0 ms: user_a → POST /activate with sn=DNCSS0001234
- T+0 ms: user_b → POST /activate with sn=DNCSS0001234

**Expected**:
- Exactly 1 succeeds (registered to user_a or user_b)
- Other gets HTTP 409 + code=`already_registered`
- ZERO double-charge / double-warranty
- Pool status= `registered` (not `in_pool`)
- Audit log = 2 rows (1 success + 1 conflict)
- Lock acquired/released cleanly (no orphan)

**Why E2E**: SELECT FOR UPDATE + GET_LOCK behavior under real MySQL concurrency — pure-logic mocks can't reproduce.

---

### Scenario 2 — Transfer + Claim race

**Setup**:
- Pool: `DNCSS0001234` registered to user_a
- Active claim ticket #999 for DNCSS0001234 status=in_progress

**Steps** (parallel):
- T+0 ms: user_a → POST /transfer to user_b
- T+50 ms: admin → POST /claim/999/status → completed

**Expected**:
- Both operations serialize via FOR UPDATE on pool row
- If transfer wins: claim status update either applies to user_b's pool row (consistent) OR fails with stale-lock error
- If claim wins: replacement_sent flag set first, then transfer flips ownership of NEW (replaced) plate
- No mixed state: pool.registered_user_id and claim.actor_user_id always consistent

**Why E2E**: Cross-system FSM atomicity (sn_pool ↔ claim_ticket).

---

### Scenario 3 — Bulk receive overlap

**Setup**:
- Batch: 1000 plates DNCSS0010000..DNCSS0010999 status=`reserved`
- 2 warehouse reps logged in

**Steps** (parallel):
- T+0 ms: warehouse_1 → POST /receive/bulk [DNCSS0010000..DNCSS0010499] (500 plates)
- T+10 ms: warehouse_2 → POST /receive/bulk [DNCSS0010400..DNCSS0010899] (overlapping 500 plates)

**Expected**:
- Per-row atomic — overlap range (0010400..0010499) handled gracefully
- warehouse_1 succeeds 500
- warehouse_2 succeeds 400 (skipped 100 already-received) + idempotency replay returns same response
- Total in_pool count = 900
- No deadlock — both batches complete < 30s

**Why E2E**: D4 contract validation under MySQL InnoDB row-level locks.

---

### Scenario 4 — Void + Activate race

**Setup**:
- Pool: `DNCSS0001234` status=`in_pool`
- Customer scanning at home, admin investigating in Backend

**Steps** (parallel):
- T+0 ms: admin → POST /void with sn=DNCSS0001234 reason=`admin_error`
- T+50 ms: customer → POST /activate with sn=DNCSS0001234

**Expected**:
- If void wins (likely — direct DB call):
  - Customer activate gets 410 gone + `voided_status`
  - LIFF UI shows "ติดต่อร้าน" + auto-create investigation
- If activate wins:
  - Plate status = registered to customer
  - Admin void gets 409 + `already_registered`
  - Admin notified via Telegram alert + audit row `event_type=void_conflict`
- Either way: state consistent, no orphan locks

**Why E2E**: Cross-actor concurrency (admin vs customer).

---

### Scenario 5 — Swap + Claim race (4-eyes critical)

**Setup**:
- Pool: `DNCSS0001234` registered to user_a, in claim flow #888 status=quality_check
- 2 admin accounts (admin_a, admin_b) for 4-eyes

**Steps** (parallel):
- T+0 ms: admin_a → POST /swap with sn_old=DNCSS0001234, sn_new=DNCSS0005678
- T+50 ms: admin_a → POST /claim/888/status → completed (with replacement_sent=1)

**Expected**:
- Swap requires 4-eyes — if admin_b not yet approved, swap returns 403 + `awaiting_approval`
- Claim completion picks up replacement_sent=1 → maps DNCSS0001234 → 'replaced'
- Once admin_b approves swap, sn_old=DNCSS0001234 already 'replaced' → swap re-runs idempotently OR returns 409 stale-state
- Final state: DNCSS0001234=replaced, DNCSS0005678=registered to user_a (post-swap)
- 4-eyes audit chain intact: 2 rows for swap (request + approval)

**Why E2E**: Multi-step + 4-eyes + cross-table mutation under concurrency.

---

## 🛠️ Implementation roadmap

### Phase 3 W8 (Backend foundation — 1 wk effort)

- [ ] Author `docker-compose.e2e.yml` with 5 services (mysql/redis/wp/nginx/runner)
- [ ] Bootstrap script: `scripts/e2e-bootstrap.sh` — install WP + activate snippets + seed fixtures
- [ ] WP fixture: 3 user accounts (admin_a, admin_b, warehouse_1) + 1k pool fixture batch
- [ ] Verify `php -l` + `wp eval` work inside container

### Phase 3 W9 (Test runner — 1 wk effort)

- [ ] Author `tests/e2e/setup.js` — Jest globalSetup spinning up Docker Compose
- [ ] Author `tests/e2e/concurrent.test.js` — 5 scenarios above using supertest + p-limit
- [ ] CI integration: `.github/workflows/e2e.yml` (only on `main` branch + nightly)

### Phase 3 W10 (Stabilization — 0.5 wk)

- [ ] Run nightly for 7 days — flake rate < 1%
- [ ] Fix race conditions surfaced by E2E (likely 2-3 bugs)
- [ ] Acceptance: each scenario asserts ZERO data corruption

### Phase 3+ continuous

- [ ] Add scenarios on demand when production bugs found
- [ ] Monthly review: deprecate scenarios that haven't fired in 6 months

---

## 💰 Cost estimate

| Item | Hours | Notes |
|---|---|---|
| docker-compose.e2e.yml authoring | 8 hr | Service config + volumes |
| Bootstrap script + fixtures | 12 hr | WP install + ACF + snippet sync |
| 5 test scenarios | 30 hr | 6 hr × 5 scenarios |
| CI integration | 6 hr | GitHub Actions + secret management |
| Stabilization debugging | 16 hr | Flake fixes + bug surfacing |
| **Total** | **72 hr** | ~9 working days for 1 dev |

Phase 3 W8-W10 capacity: 13.5 wk total = 540 hr → 13% allocation OK.

---

## 🧯 Out of scope

- Load testing (use k6 / Gatling — separate doc Phase 5)
- Browser-level UI testing (use Playwright — Phase 2 W7 LIFF QA)
- Performance regression (use APM — separate Phase 4)

---

## 📚 Related

- `docs/sn-system/21-r3-audit-pending-items.md` D4 — defer reason
- `docs/sn-system/11-phase1-w4-internal-qa-acceptance-test.md` Section "B8/C13/R3-M7" — manual stand-in
- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13 §Phase 3 W10
- Existing CI: `.github/workflows/php-lint.yml` + `jest.yml` (build on)
