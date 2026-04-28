# Self-Test Suite Applied — Health Monitor V.1.2

**Date**: 2026-04-24
**Author**: Full Stack Developer
**Predecessor**: Health Monitor V.1.1 (Phase 4a registry-adoption pass, no functional change)
**File Touched**: `[Admin System] DINOCO Health Monitor` V.1.1 → **V.1.2** (single file, additive only)
**Goal**: Replace 7 manual smoke tests in `FINAL-QA-REPORT.md` with one-click admin verification suite

## Scope (Strictly Additive)

- Extend existing `[Admin System] DINOCO Health Monitor` snippet from 4 built-in health checks to **16** (4 existing + **12 new V.1.2**).
- Add `POST /dinoco/v1/smoke-test` REST endpoint with **5 integration probes** + **5 migration coverage metrics**.
- Add "🧪 Full System Self-Test" UI section at top of `[dinoco_admin_health_dashboard]` (gradient banner + button + drill-down result panel).
- Per-user **rate limit 5/min** (transient counter).
- **One** intentional side-effect per run: insert a single `event_type='smoke_test'` audit row as proof-of-write probe. All other probes are read-only.
- Backward compat 100% — 4 original checks unchanged, no atomic helpers touched, no Round 2 audit fixes reverted.

## Health Checks (16 total)

| # | Key | Critical | What it validates |
|---|-----|:-:|---|
| 1 | `cron_heartbeat` | no | Stale crons or last-run errors via Pillar 5 registry |
| 2 | `db_invariants` | **yes** | `SELECT 1` smoke + `wp_dinoco_audit_log` table existence |
| 3 | `flag_consistency` | no | Module Registry orphan errors |
| 4 | `audit_log_health` | no | 24h row count + error rate (>20% = warn) |
| 5 | `snippet_dependencies` | **yes** | 7 critical helpers loaded: `b2b_recalculate_debt`, `b2b_get_product_data*`, `dinoco_get_leaf_skus`, `dinoco_compute_hierarchy_stock`, `b2f_get_maker_by_group`, `b2f_currency_symbol` |
| 6 | `atomic_helpers` | **yes** | 8 financial primitives: `b2b_debt_add/subtract`, `b2b_recalculate_debt`, `b2f_payable_add/subtract`, `b2f_recalculate_payable`, `dinoco_stock_add/subtract` |
| 7 | `fsm_classes` | **yes** | `B2B_Order_FSM` + `B2F_Order_FSM` classes + `can_transition`/`transition` methods |
| 8 | `transaction_wrapper` | no | `dinoco_transaction()` (Pillar 2) loaded |
| 9 | `module_registry` | no | `dinoco_register_admin_module` loaded + ≥1 module registered |
| 10 | `config_layer` | no | `dinoco_config()` + `dinoco_get_config_schema()` (Pillar 4) loaded + ≥1 schema entry |
| 11 | `audit_log_dual_write` | no | ≥1 dual-write event_type in `wp_dinoco_audit_log` last 7d (debt/stock/payable/fsm/slip domains) |
| 12 | `slip_pipeline` | no | `b2b_slip_apply_to_invoices`, `b2b_slip_get_cached_response_by_url`, `b2b_verify_slip_image` loaded + replay-pool flag state |
| 13 | `line_api_health` | no | `B2B_LINE_ACCESS_TOKEN` defined + `_b2b_line_last_push_ts` within 7d (cosmetic if quiet period) |
| 14 | `flash_v42_health` | no | DLQ depth (≤20 backlog) + `flash_category_verify_cron` heartbeat (≤60min) when flag ON |
| 15 | `b2f_migration_health` | no | Junction table existence + row count + shadow_write/read_from_junction flag state |
| 16 | `ai_classifier_health` | no | `b2b_slip_ai_classify_image` loaded + `B2B_ANTHROPIC_API_KEY` defined |

Aggregation rules unchanged: critical-fail → overall `fail`; non-critical fail or any warn → `warn`; all ok → `ok`.

## Integration Probes (5 — exercised only on smoke test, not on health refresh)

| Probe | Side effect | What it does |
|-------|:-:|---|
| `audit_log_writable` | **yes** (1 audit row) | Calls `dinoco_audit_log()` with `event_type='smoke_test'`; returns `log_id` |
| `transaction_wrapper` | none | Runs no-op `dinoco_transaction()` with validate+mutate phases (read-only, returns `{ok:true,noop:true}`) |
| `module_registry_count` | none | Confirms `dinoco_get_registered_modules()` count + orphan errors |
| `config_layer_responsive` | none | Reads sentinel key via `dinoco_config('system.dummy_smoke_key', 'sentinel_default')` — must return scalar |
| `ai_classifier_ready` | none | Confirms helper + API key without spending tokens |

## Migration Coverage Metrics (read-only)

| Metric | Source |
|--------|--------|
| `audit_event_types_7d` | `SELECT DISTINCT event_type FROM wp_dinoco_audit_log WHERE created_at >= NOW()-INTERVAL 7 DAY` |
| `audit_event_type_list` | (array of distinct event_type strings) |
| `cron_registry_adoption` | `count( dinoco_get_cron_registry() )` |
| `module_registry_adoption` | `count( dinoco_get_registered_modules() )` |
| `config_registrations` | total entries across all sections of `dinoco_get_config_schema()` |

These provide a quantitative signal of Phase 4 migration progress — adoption goes up monotonically as snippets opt in.

## REST Endpoint Contract

```
POST /wp-json/dinoco/v1/smoke-test
  Auth: current_user_can('manage_options') + X-WP-Nonce
  Rate limit: 5/min/user (transient counter; 429 on exceed)
  Body: {} (no params currently)
  Response 200:
    {
      "started_at": "2026-04-24 14:32:01",
      "ended_at":   "2026-04-24 14:32:02",
      "elapsed_ms": 845,
      "overall":    "ok" | "warn" | "fail",
      "checks": {
        "health":      { "overall": "...", "checks": [...], "checks_count": 16, "timestamp": "..." },
        "integration": { "audit_log_writable": {...}, "transaction_wrapper": {...}, ... },
        "migrations":  { "audit_event_types_7d": N, "audit_event_type_list": [...], "cron_registry_adoption": N, "module_registry_adoption": N, "config_registrations": N }
      },
      "summary": {
        "health_count":     16,
        "integration_count": 5,
        "cumulative_pass":  N
      }
    }
  Response 429:
    { "code": "rate_limit_exceeded", "message": "Smoke test rate limit (5/min/user). Please wait." }
```

Persisted state (autoload=no): `_dinoco_smoke_last_run_ts`, `_dinoco_smoke_last_run_overall`, `_dinoco_smoke_last_run_elapsed_ms`, `_dinoco_smoke_cumulative_pass`.

## UI Usage Guide

1. Open Admin Dashboard → sidebar **ระบบ** → **Health Monitor**, OR call shortcode `[dinoco_admin_health_dashboard]` directly.
2. Top of page now shows blue gradient banner **🧪 Full System Self-Test**.
3. Click **▶ Run Full System Test** — button disables; meta line shows "กำลังเช็คระบบทั้งหมด...".
4. Result drops down inside the banner with three tables (Health Checks · Integration Probes · Migration Coverage). Verdict pill (`ok`/`warn`/`fail`) shown beside meta.
5. Cumulative pass counter increments only when overall=`ok`.
6. Auto-runs `_dnchRefresh()` after smoke test to pull updated health (the smoke test inserted 1 audit row → `audit_log_health` may shift).

## Rollback Procedure

- **Soft revert**: open WP Code Snippets → toggle off `[Admin System] DINOCO Health Monitor` → all 16 checks + smoke endpoint disappear; existing dashboards using `function_exists('dinoco_get_health_status')` skip cleanly.
- **Restore V.1.1**: `git checkout HEAD~1 -- '[Admin System] DINOCO Health Monitor'` — strictly additive change, safe to revert.
- **Disable just smoke test**: comment out the `register_rest_route( 'dinoco/v1', '/smoke-test', ... )` block at line ~1182. Health checks #5–16 stay active; UI banner becomes a no-op (button does nothing).

## Backward Compatibility

- 4 original health checks: bytes-identical
- Cron Registry: untouched
- All 12 new checks defensive — wrap helper-existence with `function_exists()` / `class_exists()`; fall to `warn`/`fail` instead of fatal
- Integration probes use try/catch around `dinoco_transaction()` call
- Smoke test rate limit fails closed (returns 429 WP_Error instead of skipping)
- No new DB schema, no new options requiring autoload, no `wp_options` writes outside the 4 documented summary keys
- PHP lint: `php -l` pass (heredoc with `<?php` virtual prefix per WP Code Snippets convention)

## Test Plan Verification

| Step | Expected | How to verify |
|------|----------|--------------|
| 1. Click "Run Full System Test" with all snippets healthy | All checks `ok`, verdict `ok`, cumulative_pass +1 | Result table shows 16 health rows + 5 integration rows green |
| 2. Disable Module Registry snippet → smoke test | `module_registry_count` probe = `fail` | Integration row red `registry_not_loaded` |
| 3. Disable Audit Log snippet → smoke test | `audit_log_writable` probe = `fail`; `audit_log_dual_write` health check = `warn` | Probe row red `audit_helper_missing`; cumulative pass NOT incremented |
| 4. POST endpoint without nonce | 403 | `permission_callback` blocks pre-handler |
| 5. POST 6× in 1 min | 6th returns 429 | `dinoco_smoke_test_rate_limit()` transient hit |
| 6. Check audit table after run | 1 new row `event_type='smoke_test'` | `SELECT * FROM wp_dinoco_audit_log WHERE event_type='smoke_test' ORDER BY id DESC LIMIT 1` |
| 7. PHP lint | No syntax errors | `{ echo '<?php'; cat 'Health Monitor file'; } | php -l` |

## Constraints Honored

- ✅ No revert of architecture work — all V.1.1 + V.1.0 code preserved verbatim
- ✅ No touch to atomic helpers (Snippet 13 / Snippet 7 / Snippet 15 untouched)
- ✅ No touch to Round 2 audit fixes (`docs/audit/FINAL-QA-REPORT.md` 29/29 verified state preserved)
- ✅ Smoke test side effects limited to **1 audit row insert per run** + 4 wp_options summary writes (autoload=no)
- ✅ Rate limit 5/min/user enforced
- ✅ All checks defensive (try/catch wrapping in `dinoco_run_health_check()` already present; new probes use additional try/catch around `dinoco_transaction()`)

## File Stats

- File: `[Admin System] DINOCO Health Monitor`
- Pre-V.1.2 line count: 739
- Post-V.1.2 line count: 1569 (+830 lines: 12 health checks + 5 probes + 4 helpers + smoke endpoint + UI banner + JS handler)
- PHP lint: PASS (with `<?php` virtual prefix)

## Phase 4 Follow-ups (out of scope — natural next step)

1. Add `disk_space` check (wp-content/uploads free %) once `disk_free_space` poll is acceptable
2. Add `flash_v42_health` cron-based ratio (last 24h: `created` vs `failed_*` events) when V.42 cleanup audit table mature
3. Add Telegram alert hook on `overall=fail` via `b2b_alert_telegram()` (lands in Snippet 1 next bump)
4. Wire smoke test into Go-Live Wizard Step 5 "Monitor" (one-click pre-flip + post-flip)
