# Phase 4f — Cron Registry Migration (Applied)

**Date**: 2026-04-24
**Author**: Full Stack Developer (Phase 4f implementation)
**Spec**: `docs/BACKEND-ARCHITECTURE-REFACTOR-PLAN.md` Pillar 5 (Phase 3 follow-up)
**Phase 3 baseline**: `2a5a466` (Health Monitor + `dinoco_register_cron` helper)

## Goals

Phase 3 deployed `dinoco_register_cron($hook, $schedule, $callback)` ใน `[Admin System] DINOCO Health Monitor` V.1.0 — registry helper that wraps a cron callback to write `_dinoco_cron_<hook>_last_run/status/duration_ms/error` options on every tick + auto `add_action` + idempotent `wp_schedule_event` fallback. Phase 4f migrates the existing fleet of recurring `wp_schedule_event` callers to use the registry so Health Monitor's `cron_heartbeat` check actually has data to watch.

**Scope**: recurring crons only. `wp_schedule_single_event` (one-shot scheduling) is **out of scope** per Phase 4f spec — those keep their plain `add_action` binding.

## Migration Pattern

Two patterns used depending on whether time-of-day specificity matters:

### Pattern A — Time-of-day–specific schedule (preserve via legacy + register for heartbeat)

```php
// Legacy schedule preserved (registry helper defaults to time()+60 — would lose 09:00 ICT etc.)
if ( ! wp_next_scheduled( 'b2b_dunning_cron_event' ) ) {
    $next = strtotime( 'today 02:00:00 UTC' );
    if ( $next < time() ) $next = strtotime( 'tomorrow 02:00:00 UTC' );
    wp_schedule_event( $next, 'daily_b2b', 'b2b_dunning_cron_event' );
}
// Heartbeat tracking via registry wrapper (idempotently no-ops the wp_schedule_event part)
if ( function_exists( 'dinoco_register_cron' ) ) {
    dinoco_register_cron( 'b2b_dunning_cron_event', 'daily_b2b', 'b2b_run_dunning_process' );
} else {
    // Legacy fallback — Health Monitor snippet missing
    add_action( 'b2b_dunning_cron_event', 'b2b_run_dunning_process' );
}
```

### Pattern B — Inline closure (hoist to named function or variable, then register)

```php
// OLD: add_action( 'flash_category_verify_cron', function() { ... } );
$flash_category_verify_handler = function() { ... };

if ( function_exists( 'dinoco_register_cron' ) ) {
    dinoco_register_cron( 'flash_category_verify_cron', 'fifteen_minutes', $flash_category_verify_handler );
} else {
    add_action( 'flash_category_verify_cron', $flash_category_verify_handler );
}
```

### Key invariant

For every migrated cron, the standalone `add_action( $hook, $primary_handler )` line elsewhere in the file is **removed** — the registry's wrapper installs the listener internally. Leaving both would cause the handler to fire **twice** per tick.

For multi-handler hooks (e.g. `b2f_cron_daily_summary` has two listeners — `b2f_run_daily_summary` + `b2f_run_monthly_check`), only the **primary** handler is passed to `dinoco_register_cron`. Other handlers retain their explicit `add_action` (WP fires both on the same tick, registry only wraps the primary).

## Migrated Crons (29 total)

| # | Hook | Schedule | Handler | File | Notes |
|---|------|----------|---------|------|-------|
| 1 | `b2b_dunning_cron_event` | daily_b2b (09:00 ICT) | `b2b_run_dunning_process` | Snippet 7 | Time-of-day |
| 2 | `b2b_daily_summary_cron` | daily_b2b (17:30 ICT) | `b2b_run_daily_summary` | Snippet 7 | Time-of-day |
| 3 | `b2b_bo_overdue_check` | daily_b2b (10:00 ICT) | `b2b_run_bo_overdue_check` | Snippet 7 | Time-of-day |
| 4 | `b2b_auto_complete_check` | daily_b2b (11:00 ICT) | `b2b_run_auto_complete` | Snippet 7 | Time-of-day |
| 5 | `b2b_oos_expiry_check` | daily_b2b (06:00 ICT +1) | `b2b_run_oos_expiry_check` | Snippet 7 | Time-of-day |
| 6 | `b2b_shipping_overdue_cron` | daily_b2b (15:00 ICT) | `b2b_run_shipping_overdue_summary` | Snippet 7 | Time-of-day |
| 7 | `b2b_rank_update_event` | daily_b2b (1st of month) | `b2b_run_rank_update` | Snippet 7 | Calendar-specific |
| 8 | `b2b_weekly_report_event` | weekly_b2b (Sun 17:30 ICT) | `b2b_run_weekly_report` | Snippet 7 | Calendar-specific |
| 9 | `b2b_rpi_heartbeat_check` | every_5min_b2b | `b2b_check_rpi_heartbeat` | Snippet 7 | Simple interval |
| 10 | `b2b_flash_tracking_cron` | every_2hr_b2b → everytwohours fallback | `b2b_run_flash_tracking_fallback` | Snippet 7 | Dynamic schedule resolution |
| 11 | `b2b_flex_retry_cron` | every_1min_b2b | `b2b_retry_pending_flex` | Snippet 7 | Simple interval |
| 12 | `b2b_slip_lock_cleanup_cron` | hourly | `b2b_slip_lock_cleanup_handler` | Snippet 2 | Inside `b2b_slip_register_crons` (init prio 20) |
| 13 | `b2b_slip_queue_recovery_cron` | twicedaily | `b2b_slip_queue_recovery_handler` | Snippet 2 | Inside same registrar |
| 14 | `flash_category_verify_cron` | fifteen_minutes | (closure → `$flash_category_verify_handler`) | Snippet 1 | Closure hoisted; preserves `update_option('dinoco_cron_flash_category_verify_last_run')` Go-Live Monitor compat |
| 15 | `dinoco_shipping_auto_rollback_cron` | ten_minutes | (closure → `$shipping_auto_rollback_handler`) | Snippet 1 | Closure hoisted |
| 16 | `dinoco_flash_dlq_cleanup_cron` | daily (03:00 BKK) | (closure → `$flash_dlq_cleanup_handler`) | Snippet 1 | Closure hoisted |
| 17 | `b2b_manual_flash_poll_cron` | everytwohours | `b2b_run_manual_flash_poll` | Snippet 3 | Simple interval |
| 18 | `dinoco_stock_low_alert_cron` | daily | `dinoco_run_stock_low_alert` | Snippet 15 | Simple interval |
| 19 | `dinoco_dip_stock_reminder_cron` | daily | `dinoco_run_dip_stock_reminder` | Snippet 15 | Closure hoisted to named function |
| 20 | `dinoco_dip_stock_expire_cron` | twicedaily | `dinoco_run_dip_stock_expire` | Snippet 15 | Closure hoisted to named function |
| 21 | `dinoco_stock_invariant_cron` | twicedaily | `dinoco_run_stock_invariant_check` | Snippet 15 | Simple interval |
| 22 | `dinoco_slip_pool_cleanup_cron` | daily (03:30 BKK) | `dinoco_run_slip_pool_cleanup` | Snippet 15 | Time-of-day |
| 23 | `b2b_bo_restock_scan_cron` | every_15min_b2b_bo | `b2b_bo_run_restock_scan` | Snippet 16 | Closure hoisted |
| 24 | `b2b_bo_eta_warn_cron` | daily (09:00) | `b2b_bo_run_eta_warn` | Snippet 16 | Closure hoisted |
| 25 | `b2b_bo_pending_review_expire_cron` | hourly | `b2b_bo_run_pending_review_expire` | Snippet 16 | Closure hoisted |
| 26 | `b2b_bo_enumeration_scan_cron` | hourly | `b2b_bo_run_enumeration_scan` | Snippet 16 | Closure hoisted |
| 27 | `b2b_bo_attempt_log_cleanup_cron` | daily (03:00) | `b2b_bo_run_attempt_log_cleanup` | Snippet 16 | Closure hoisted |
| 28 | `dinoco_inv_sync_missing_cron` | daily | `dinoco_inv_sync_missing_products` | Inventory DB | Simple interval |
| 29 | `dinoco_daily_auto_close_event` | daily | `dinoco_daily_auto_close_tickets` | Service Center & Claims | Simple interval |
| 30 | `dinoco_gdpr_retention_cron` | daily | `dinoco_gdpr_retention_cleanup` | GDPR Data Requests | Simple interval |
| 31 | `b2f_cron_delivery_reminder` | daily (08:30 ICT) | `b2f_run_delivery_reminder` | B2F Snippet 11 | Time-of-day |
| 32 | `b2f_cron_overdue_check` | daily (09:00 ICT) | `b2f_run_overdue_check` | B2F Snippet 11 | Time-of-day |
| 33 | `b2f_cron_maker_noresponse` | daily (09:30 ICT) | `b2f_run_maker_noresponse` | B2F Snippet 11 | Time-of-day |
| 34 | `b2f_cron_payment_reminder` | daily (10:00 ICT) | `b2f_run_payment_reminder` | B2F Snippet 11 | Time-of-day |
| 35 | `b2f_cron_daily_summary` | daily (18:00 ICT) | `b2f_run_daily_summary` | B2F Snippet 11 | **Multi-handler** — `b2f_run_monthly_check` retains explicit `add_action` |
| 36 | `b2f_cron_weekly_summary` | weekly (Mon 02:00 UTC) | `b2f_run_weekly_summary` | B2F Snippet 11 | Calendar-specific |
| 37 | `b2f_flex_retry_cron` | every_2min_b2f → every_1min_b2b → hourly fallback | `b2f_run_flex_retry` | B2F Snippet 11 | Dynamic schedule resolution |
| 38 | `b2f_diff_cron_hourly` | hourly | `b2f_run_diff_detection` | B2F Snippet 11 | Simple interval |
| 39 | `b2f_observations_ttl_cron` | daily (20:00 ICT) | `b2f_run_observations_ttl` | B2F Snippet 11 | Time-of-day |

**Total: 39 recurring crons migrated** across 9 files.

## Single-event crons NOT migrated (out of scope)

Per Phase 4f spec, `wp_schedule_single_event` callers retain their plain `add_action`:

- `b2b_delivery_check_event`, `b2b_flash_courier_retry`, `b2b_flash_24hr_complete`, `b2b_sla_alert_event`, `b2b_auto_ship_flash_event`, `b2b_verify_slip_async`, `b2b_slip_drain_cron` (overflow path), `dinoco_inv_auto_cancel`, `b2f_replay_coverage_autosync`

These fire once per scheduling and aren't suitable for heartbeat tracking (no expected interval).

## Manual Invoice fallback note

`[Admin System] DINOCO Manual Invoice System` lines 832-843 contain **fallback** scheduling for `b2b_dunning_cron_event` + `b2b_bo_overdue_check`. These hooks are **owned** by Snippet 7 (which IS migrated) — the Manual Invoice block exists only to defensively schedule the cron if Snippet 7 happens to be inactive. Since the registry wrapper in Snippet 7 already handles heartbeat for these hooks, no migration is needed in Manual Invoice. Untouched.

## Files Touched + Version Bumps

| File | Old → New | Note |
|------|-----------|------|
| `[B2B] Snippet 1` | V.34.17 → V.34.18 | 3 Flash crons (closures hoisted to vars) |
| `[B2B] Snippet 2` | V.34.15 → V.34.16 | 2 slip crons inside `b2b_slip_register_crons` |
| `[B2B] Snippet 3` | V.42.4 → V.42.5 | `b2b_manual_flash_poll_cron` |
| `[B2B] Snippet 7` | V.30.9 → V.31.0 | 11 crons (largest delta) |
| `[B2B] Snippet 15` | V.8.12 → V.8.13 | 5 inventory crons + 2 closures hoisted |
| `[B2B] Snippet 16` | V.2.4 → V.2.5 | 5 BO crons (closures hoisted) |
| `[Admin System] DINOCO Global Inventory Database` | V.44.6 → V.44.7 | `dinoco_inv_sync_missing_cron` |
| `[Admin System] DINOCO Service Center & Claims` | V.30.7 → V.30.8 | `dinoco_daily_auto_close_event` |
| `[System] DINOCO GDPR Data Requests` | V.1.1 → V.1.2 | `dinoco_gdpr_retention_cron` |
| `[B2F] Snippet 11` | V.2.4 → V.2.5 | 9 B2F crons |

## Heartbeat Verification Steps

1. **Pre-deploy lint**: every file passes `php -l` with virtual `<?php` prefix (WP Code Snippets convention).
2. **Post-deploy admin check** (after sync via GitHub Webhook):
   - Open WP admin → load any page that runs `init` (e.g. dashboard).
   - Visit `[dinoco_admin_health_dashboard]` → "Cron Heartbeat" section.
   - Each migrated hook should appear in the registry table with `health=warn (never_ran)` initially.
   - Wait for next scheduled tick (or manually trigger via admin).
   - After tick, `last_run` populates + `health=ok` + `last_status=ok`.
3. **REST snapshot**: `GET /wp-json/dinoco/v1/cron/heartbeat` (admin auth) returns full registry array.
4. **Forensic chain**: any `cron_error` writes to `wp_dinoco_audit_log` with `event_type=cron_error`, `actor_type=cron`, `actor_id=<hook>`, `error_msg=<truncated 500 chars>`.

## Test Plan (manual, post-sync)

1. ✅ All 9 files pass `php -l` (verified during apply).
2. ⏳ After sync: check `_dinoco_cron_<hook>_last_run` option populates after first tick of each migrated hook.
3. ⏳ Confirm `wp_get_schedules()` still includes all custom intervals (`daily_b2b`, `weekly_b2b`, `every_5min_b2b`, `every_2hr_b2b`, `every_1min_b2b`, `every_15min_b2b_bo`, `every_2min_b2f`).
4. ⏳ Disable `[Admin System] DINOCO Health Monitor` → reload admin page → confirm fallback `add_action` path runs (cron still ticks; just no heartbeat tracking).
5. ⏳ For multi-handler `b2f_cron_daily_summary`: verify both `b2f_run_daily_summary` AND `b2f_run_monthly_check` execute on the daily tick.
6. ⏳ Walk-in auto-cancel cron (`dinoco_inv_auto_cancel`): is single-event — confirm untouched (no heartbeat tracking expected).
7. ⏳ Flash V.42 auto-rollback cron: per-tick `update_option('dinoco_cron_shipping_auto_rollback_last_run', time())` Go-Live Monitor heartbeat **preserved** (separate option from registry's `_dinoco_cron_*_last_run`). Verify Go-Live UI still reads correctly.

## Rollback Procedure

Per-cron rollback is not granular — the migration moves `add_action` calls into the schedule block. Whole-file rollback options:

### Option A — Disable Health Monitor snippet
Set `[Admin System] DINOCO Health Monitor` to inactive in WP Code Snippets UI:
- All migrated crons fall back to legacy `add_action` path (the `else` branch).
- Existing schedules remain intact (registry's `wp_schedule_event` is idempotent — calling with already-scheduled hook is a no-op).
- Heartbeat data stops accumulating; admin dashboard `cron_heartbeat` shows registry empty.
- Cron tick handlers continue running normally.

### Option B — Per-file revert (git checkout)
For any individual file showing regression, revert via git:
```bash
git checkout HEAD~1 -- "[B2B] Snippet 7: Cron Jobs - Dunning + Summary + Rank"
```
Then push + sync. The reverted file's standalone `add_action` lines are restored; registry calls absent.

### Option C — Force schedule re-init
If a hook ends up unscheduled after migration (e.g. cron table corrupted):
```php
// Run once via wp-cli or admin diagnostic
delete_option( 'cron' );  // CAUTION: clears entire cron table
// Then visit admin page → init fires → all schedule blocks re-create events
```

## Post-Migration Cleanup (deferred)

These are out-of-scope for Phase 4f but documented for future sprints:

1. **Manual Invoice consolidation**: lines 832-843 fallback can be deleted once Snippet 7 active rate is 100% verified across all installs.
2. **Phase 5 — Health Check additions** (per Phase 3 §"Phase 4 Follow-ups"): `slip_pipeline`, `disk_space`, `flash_dlq_count`, `bo_pending_review_stale_count`.
3. **Phase 5 — Telegram alert wiring** on `overall=fail` via existing `b2b_alert_telegram()` helper.

## Constraints Satisfied

- ✅ ห้าม revert architecture phases 1-4a-4e (no edits to existing wrappers/helpers)
- ✅ ห้าม `<?php` tag — all files start with `/**` comment block per WP Code Snippets convention
- ✅ Backward compat 100% — `function_exists('dinoco_register_cron')` guard + legacy `add_action` fallback in every migrated site
- ✅ PHP lint pass — all 9 files
- ✅ Single-event crons (`wp_schedule_single_event`) untouched per spec
- ✅ Time-of-day scheduling preserved via legacy `wp_schedule_event` (registry wrapper would default to `time()+60` and lose 09:00 ICT specificity)
- ✅ Multi-handler hooks (e.g. `b2f_cron_daily_summary`) preserve secondary `add_action` listeners
- ✅ Walk-in auto-cancel cron (`dinoco_inv_auto_cancel`) verified single-event → untouched
- ✅ Flash V.42 auto-rollback cron Go-Live Monitor `update_option('dinoco_cron_*_last_run')` heartbeat preserved (separate from registry's `_dinoco_cron_*_last_run`)
- ✅ Phase 4e parallel work (admin shortcodes) — no file conflicts (Phase 4e edited `add_shortcode` regions; Phase 4f edited `wp_schedule_event` + cron handler `add_action` regions)

## Files Touched

| File | Type | Status |
|------|------|--------|
| `[B2B] Snippet 1: Core Utilities & LINE Flex Builders` | EDIT V.34.18 | 3 Flash crons migrated |
| `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator` | EDIT V.34.16 | 2 slip crons migrated |
| `[B2B] Snippet 3: LIFF E-Catalog REST API` | EDIT V.42.5 | 1 cron migrated |
| `[B2B] Snippet 7: Cron Jobs - Dunning + Summary + Rank` | EDIT V.31.0 | 11 crons migrated |
| `[B2B] Snippet 15: Custom Tables & JWT Session` | EDIT V.8.13 | 5 crons migrated, 2 closures hoisted |
| `[B2B] Snippet 16: Backorder System` | EDIT V.2.5 | 5 BO crons migrated |
| `[Admin System] DINOCO Global Inventory Database` | EDIT V.44.7 | 1 cron migrated |
| `[Admin System] DINOCO Service Center & Claims` | EDIT V.30.8 | 1 cron migrated |
| `[System] DINOCO GDPR Data Requests` | EDIT V.1.2 | 1 cron migrated |
| `[B2F] Snippet 11: Cron Jobs & Reminders` | EDIT V.2.5 | 9 B2F crons migrated |
| `docs/audit/phase-4f-applied.md` | NEW | This report |

**Net behavior change**: zero. Heartbeat tracking added; cron schedules unchanged; handlers unchanged; fallback paths preserve legacy behavior when Health Monitor snippet is inactive.
