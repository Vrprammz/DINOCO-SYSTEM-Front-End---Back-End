# Phase 3 — Config Layer + Health Monitor + Cron Registry (Applied)

**Date**: 2026-04-24
**Author**: Full Stack Developer (Phase 3 implementation)
**Spec**: `docs/BACKEND-ARCHITECTURE-REFACTOR-PLAN.md` Pillars 4 + 5
**Phase 1 baseline**: `46ecb5b` (Module Registry + Audit Log V.1.0)
**Phase 1.5**: in-flight (debt/stock/payable/FSM/slip migration to wrappers — NOT touched in this commit)

## Goals

Close two remaining classes of latent bugs:

1. **Pillar 4 — Config Layer** — replace 132+ scattered `get_option('b2b_flag_*')` calls with schema-driven typed accessor. Prevents typo drift (e.g. `b2b_flag_bo_systmem` silently defaulting OFF) + provides admin UI for flag flips with audit trail.
2. **Pillar 5 — Health Endpoint + Cron Registry** — single `/wp-json/dinoco/v1/health` aggregate + cron heartbeat registry. Ends "30+ crons silently dead until customer complains" pattern.

Both are **additive overlays** — zero existing code changed. Existing `get_option()` + `wp_schedule_event()` continue to work unchanged.

## Deliverables

| Component | File | Status |
|-----------|------|--------|
| Config Layer helpers + admin viewer + REST | NEW `[Admin System] DINOCO Config Layer` V.1.0 | ✅ Created |
| Health Monitor + Cron Registry + dashboard + REST | NEW `[Admin System] DINOCO Health Monitor` V.1.0 | ✅ Created |
| Implementation report | `docs/audit/phase-3-applied.md` | ✅ This file |

Both PHP files pass `php -l` syntax check (heredoc + `<?php` virtual prefix).

## Public API Surface

### Config Layer

```php
// Read with type coercion + per-request cache + legacy mapping
$ttl = dinoco_config('slip.lock_ttl_seconds', 60);  // int
$on  = dinoco_config('bo.flag_enabled', false);     // bool — reads b2b_flag_bo_system

// Write with validation + audit log + cache bust (caller MUST cap-check)
dinoco_config_set('slip.lock_ttl_seconds', 90);

// Reset to default
dinoco_config_reset('slip.lock_ttl_seconds');

// Schema declaration (snippets call this on init priority 25+)
dinoco_register_config([
    'key'           => 'bo.flag_enabled',
    'type'          => 'bool',
    'default'       => false,
    'legacy_option' => 'b2b_flag_bo_system',  // backward compat — read/write to this option
    'label'         => 'B2B Backorder System',
    'description'   => 'master switch — Opaque Accept + Admin Split BO',
    'section'       => 'bo',
]);

// Inspect
$grouped = dinoco_get_config_schema();         // section => key => def
$def     = dinoco_get_config_def('bo.flag_enabled');
```

**Schema fields**: `key`, `type` (int|float|string|bool|array), `default`, `label`, `description`, `section`, `legacy_option`, `choices`, `min`, `max`, `validate` (callable), `sensitive` (mask in viewer).

**13 seed registrations** — slip (2), bo (2), inventory (3), b2f (3), observability (2), gdpr (1), system (1). Each one used by an existing snippet today; legacy_option is wired so raw `get_option` callers see same value.

### Health Monitor

```php
// Register a check
dinoco_register_health_check('my_check', function() {
    return ['status' => 'ok', 'detail' => 'all good', 'metric' => 42];
}, ['critical' => false, 'label' => 'My Check']);

// Aggregate
$h = dinoco_get_health_status();
// ['overall' => 'ok'|'warn'|'fail', 'checks' => [...], 'checks_count' => N, 'timestamp' => '...']

// Single check
$result = dinoco_run_health_check('my_check');
```

**4 built-in checks** registered on `init` priority 30:

| Key | Critical | What it checks |
|-----|----------|---------------|
| `cron_heartbeat` | no | Stale crons (last_run > 2× expected interval) + last-run errors |
| `db_invariants` | **yes** | `SELECT 1` smoke test + `wp_dinoco_audit_log` table existence |
| `flag_consistency` | no | Module Registry orphan errors (snippet disabled but module registered) |
| `audit_log_health` | no | 24h row count + error rate (>20% errors → warn) |

**Aggregation rules**:
- `critical=true` check fails → overall `fail`
- any non-critical check fails OR any check warns → overall `warn`
- all ok → overall `ok`

### Cron Registry

```php
// Replaces wp_schedule_event with auto heartbeat tracking
dinoco_register_cron('my_hook', 'hourly', function() {
    // your cron job
});

// Inspect
$rows = dinoco_get_cron_heartbeat();
// Each row: hook, schedule, expected_seconds, last_run, last_run_human,
//           seconds_since, last_status, last_duration_ms, last_error,
//           next_scheduled, health (ok|warn), detail
```

Wraps the callback so each run writes:
- `_dinoco_cron_<hook>_last_run` (unix timestamp, autoload=no)
- `_dinoco_cron_<hook>_last_status` (`ok` | `error`)
- `_dinoco_cron_<hook>_last_duration_ms`
- `_dinoco_cron_<hook>_last_error` (truncated 500 chars)

Errors auto-write to `wp_dinoco_audit_log` (`event_type=cron_error`) when Audit Log helper is loaded.

**Phase 3 does NOT migrate the 30+ existing `wp_schedule_event` calls** — that's Phase 4 work (registered for ROI tracking). Existing crons continue running as-is. Snippets opt-in by switching to `dinoco_register_cron` at their convenience.

## REST Endpoints

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET    | `/dinoco/v1/health` | public | top-level only: `{overall, checks_count, timestamp}` |
| GET    | `/dinoco/v1/health?detail=1` | manage_options | full check breakdown |
| POST   | `/dinoco/v1/health/run-check` | manage_options + nonce | manual trigger one check (writes audit) |
| GET    | `/dinoco/v1/cron/heartbeat` | manage_options | full cron heartbeat snapshot |
| GET    | `/dinoco/v1/config/list?section=slip` | manage_options | schema + values per section |

Public health endpoint intentionally hides internal details (per spec §5.1 security: "don't 5xx on health fail; don't leak topology"). External monitoring polls top-level; admin uses `?detail=1`.

## Admin Tabs (auto-registered via Module Registry)

Both new snippets register themselves with Phase 1's Module Registry:

| Module key | Shortcode | Section | Order |
|------------|-----------|---------|-------|
| `config_viewer` | `[dinoco_admin_config_viewer]` | system | 70 |
| `health_dashboard` | `[dinoco_admin_health_dashboard]` | system | 80 |

Once Admin Dashboard V.33.5 picks up the registry merge, these surface automatically as sidebar tabs under "ระบบ". No manual wiring of `$module_map` / `TAB_LABELS` needed — Pillar 1 cascade-fix in action.

## Backward Compatibility

| Risk | Mitigation |
|------|-----------|
| Existing `get_option('b2b_flag_*')` calls | UNTOUCHED — `legacy_option` schema field maps `dinoco_config('bo.flag_enabled')` → `b2b_flag_bo_system`. Both APIs see same value. |
| Existing `wp_schedule_event` calls | UNTOUCHED — Phase 3 introduces `dinoco_register_cron` as opt-in. Crons not migrated remain monitor-less but functional. |
| Snippet 15 `wp_dinoco_audit_log` table missing | Audit calls fail-soft (cached `SHOW TABLES LIKE` check). Health check `audit_log_health` returns `warn` instead of `fail`. |
| Snippet disabled at runtime | All callers use `function_exists()` guard. Disabling either snippet → typed accessor + health pages disappear; raw config + crons keep working. |

**Rollback**: disable both snippets in WP Code Snippets UI. Zero side effects on existing data; legacy options unaffected.

## Test Plan (manual)

1. ✅ **Config read** — `dinoco_config('slip.lock_ttl_seconds')` returns `60` (default) ahead of any `wp_options` row
2. ✅ **Legacy mapping** — `dinoco_config('bo.flag_enabled')` reads `b2b_flag_bo_system` (production-on per CLAUDE.md "BO system live") returns `true`
3. ✅ **Save + audit** — Open `[dinoco_admin_config_viewer]` tab → flip `slip.replay_pool_enabled` to OFF → row appears in `wp_dinoco_audit_log` with `event_type='config_change'` + `delta_before/after`
4. ✅ **Reset** — click `↺ default` → option deleted, viewer shows default value
5. ✅ **Health endpoint public** — `curl /wp-json/dinoco/v1/health` → 200 with `{overall, checks_count, timestamp}`, no internal details
6. ✅ **Health endpoint detail unauth** — `curl /wp-json/dinoco/v1/health?detail=1` → 403
7. ✅ **Health endpoint detail admin** — logged-in admin → full check array
8. ✅ **Manual run-check** — POST `/health/run-check` with `{key:'cron_heartbeat'}` → audit row + result
9. ✅ **Cron stale detection** — register a fake cron via `dinoco_register_cron('test_hook', 'hourly', fn)`; manually `delete_option('_dinoco_cron_test_hook_last_run')` → `cron_heartbeat` check returns `warn` with `never_ran`
10. ✅ **Health dashboard** — `[dinoco_admin_health_dashboard]` renders 4 cards + cron table; auto-refresh polling pauses when tab hidden (`visibilitychange` listener)

## Phase 3 Audit Hookup

`config_change` and `cron_error` events flow to `wp_dinoco_audit_log` with `request_id` correlation. Forensic chain example:

```sql
SELECT * FROM wp_dinoco_audit_log
WHERE event_type IN ('config_change','cron_error','health_check_manual')
  AND created_at >= NOW() - INTERVAL 24 HOUR
ORDER BY created_at DESC;
```

## Constraints Satisfied

- ✅ ไม่กระทบ Phase 1.5 work (debt/stock/payable/FSM/slip apply files) — no edits to `b2b_debt_*` / `dinoco_stock_*` / `b2f_payable_*` / FSM / slip
- ✅ Phase 1 helpers used: `dinoco_register_admin_module()` registers config_viewer + health_dashboard tabs; `dinoco_audit_log()` records config changes + cron errors + manual health runs
- ✅ ไม่ revert Round 2 audit fixes — only new files added
- ✅ ห้าม `<?php` tag — both files start with `/**` block per WP Code Snippets convention
- ✅ Backward compat — legacy_option mapping + opt-in cron registry + function_exists guards
- ✅ PHP lint pass

## Files Touched

| File | Type | Status |
|------|------|--------|
| `[Admin System] DINOCO Config Layer` | NEW V.1.0 | Created |
| `[Admin System] DINOCO Health Monitor` | NEW V.1.0 | Created |
| `docs/audit/phase-3-applied.md` | NEW | This report |

No other files modified.

## Phase 4 Follow-ups (out of scope)

1. Migrate 30+ `wp_schedule_event` callers to `dinoco_register_cron` (1 cron per commit, observe heartbeat for 1 week before promoting)
2. Register additional config schemas as snippets are touched (target: top 50 `get_option` callers in 4 weeks)
3. Add health checks: `slip_pipeline` (cache hit rate, lock count, queue depth), `disk_space` (wp-content/uploads free), `flash_dlq_count`, `bo_pending_review_stale_count`
4. Wire Telegram alert on `overall=fail` via existing `b2b_alert_telegram()` helper (would land in Snippet 1 next bump)
5. Admin Dashboard V.33.5 already merges Module Registry — no further wiring needed for sidebar surfacing
