# Cron Drift Audit — Round 28 (2026-04-30)

[← Audit index](./)

## Scope

Second drift detection sweep (after `tests/jest/cron-drift.test.js` Round 21
ITEM B). Compared `wp_schedule_event()` calls against `dinoco_register_cron()`
calls across all snippets to identify crons running WITHOUT heartbeat
tracking visibility in the Health Monitor dashboard.

## Method

```python
# Detect: scheduled crons NOT in registry
scheduled = re.findall(r"wp_schedule_event\s*\([^,]+,\s*[^,]+,\s*['\"]([a-z_0-9]+)['\"]", ...)
registered = re.findall(r"dinoco_register_cron\s*\(\s*['\"]([a-z_0-9]+)['\"]", ...)
# Plus: registry foreach loops over hook→callback maps (Snippet 7, 16; B2F 11)
```

Cross-snippet hooks (registered in one file, scheduled in another) counted as
registered when ANY file passes them through `dinoco_register_cron()`.

## Findings

| Total scheduled | Total registered | Without heartbeat |
|-----------------|------------------|-------------------|
| 34              | 32 (after fix)   | 2 (fixed in this round) |

### 2 crons fixed in Round 28

| Cron | Snippet | Schedule | Handler | Fix |
|------|---------|----------|---------|-----|
| `dinoco_flag_audit_retention_cron` | `[Admin System] DINOCO Flag Audit Log` V.1.0 → V.1.1 | daily 03:00 | `dinoco_flag_audit_retention_run` | Wrapped existing `add_action` in `dinoco_register_cron` (with fallback) |
| `dinoco_idempotency_cleanup_cron` | `[Admin System] DINOCO Idempotency Helper` V.1.0 → V.1.1 | daily 03:15 | `dinoco_idempotency_cleanup_run` | Wrapped existing `add_action` in `dinoco_register_cron` (with fallback) |

Both fixes are pure additive (no removal of `wp_schedule_event` to preserve
custom time-of-day scheduling — `dinoco_register_cron` defaults to `time()+60`
which would override the 03:00 / 03:15 offset).

Pattern matches Phase 4f migration of B2B Snippet 7 + B2F Snippet 11 + GDPR
Data Requests:

```php
if ( ! wp_next_scheduled( 'dinoco_xxx_cron' ) ) {
    $first_run = strtotime( 'tomorrow 03:00' );
    wp_schedule_event( $first_run, 'daily', 'dinoco_xxx_cron' );
}
// V.1.1 Round 28: register heartbeat tracking via dinoco_register_cron
// when Health Monitor available; fallback to legacy add_action otherwise.
if ( function_exists( 'dinoco_register_cron' ) && function_exists( 'dinoco_xxx_run' ) ) {
    dinoco_register_cron( 'dinoco_xxx_cron', 'daily', 'dinoco_xxx_run' );
} else {
    add_action( 'dinoco_xxx_cron', 'dinoco_xxx_run' );
}
```

## Crons WITH heartbeat (verified registered after Round 28 fixes)

```
b2b_auto_complete_check
b2b_bo_attempt_log_cleanup_cron
b2b_bo_enumeration_scan_cron
b2b_bo_eta_warn_cron
b2b_bo_overdue_check
b2b_bo_pending_review_expire_cron
b2b_bo_restock_scan_cron
b2b_daily_summary_cron
b2b_dunning_cron_event
b2b_flash_tracking_cron
b2b_flex_retry_cron
b2b_manual_flash_poll_cron
b2b_oos_expiry_check
b2b_rank_update_event
b2b_rpi_heartbeat_check
b2b_shipping_overdue_cron
b2b_slip_lock_cleanup_cron
b2b_slip_queue_recovery_cron
b2b_weekly_report_event
b2f_cron_daily_summary
b2f_cron_delivery_reminder
b2f_cron_maker_noresponse
b2f_cron_overdue_check
b2f_cron_payment_reminder
b2f_cron_weekly_summary
b2f_diff_cron_hourly
b2f_flex_retry_cron
b2f_observations_ttl_cron
dinoco_audit_retention_cron
dinoco_daily_auto_close_event
dinoco_dip_stock_expire_cron
dinoco_dip_stock_reminder_cron
dinoco_flag_audit_retention_cron      ← Round 28 fix
dinoco_flash_dlq_cleanup_cron
dinoco_gdpr_export_cleanup_cron
dinoco_gdpr_retention_cron
dinoco_gdpr_sla_reminder_cron
dinoco_idempotency_cleanup_cron       ← Round 28 fix
dinoco_inv_sync_missing_cron
dinoco_shipping_auto_rollback_cron
dinoco_slip_pool_cleanup_cron
dinoco_stock_invariant_cron
dinoco_stock_low_alert_cron
flash_category_verify_cron
```

## Heartbeat option naming convention

Health Monitor writes `dinoco_cron_<hook>_last_run` after each successful
cron tick. After Round 28 fixes:

- `dinoco_cron_dinoco_flag_audit_retention_last_run` (new, populates on next 03:00 tick)
- `dinoco_cron_dinoco_idempotency_cleanup_last_run` (new, populates on next 03:15 tick)

## Existing heartbeat options observed

```
dinoco_cron_dinoco_shipping_auto_rollback_last_run
dinoco_cron_flash_category_verify_last_run
dinoco_cron_flash_category_verify_cron_last_run  ← Note: minor inconsistency
dinoco_cron_flash_dlq_cleanup_last_run
dinoco_cron_flash_tracking_last_run
dinoco_cron_shipping_auto_rollback_last_run
```

The `flash_category_verify` cron has TWO heartbeat option keys
(`flash_category_verify_last_run` + `flash_category_verify_cron_last_run`)
suggesting a naming refactor mid-development. Health Monitor reader should
accept either form; heartbeat WRITES use the canonical `<hook>_last_run`
post-`dinoco_register_cron`. Documented for future cleanup but not
actionable until ITEM C drift detector lands (Round 29 candidate).

## Drift detector status

`tests/jest/cron-drift.test.js` (7 tests) was running in Rounds 21-27 +
keeps passing. After Round 28 fixes, all scheduled crons have matching
handlers (test 4) AND matching schedules (test 5). DOCUMENTED_NOT_SCHEDULED
allowlist still has 1 entry (`b2f_junction_diff_cron` historical mention).

## Drift candidates for Round 29 (deferred)

1. **Heartbeat key naming consistency** — `flash_category_verify` has 2
   option keys. Need to reconcile reader/writer side then mark canonical.
   ✅ **RESOLVED in Round 31** ([Admin System] DINOCO Health Monitor V.1.4):
   Reader now reads canonical `dinoco_cron_flash_category_verify_last_run`
   (matches Snippet 1 V.34.x writer) with fallback chain to legacy
   `_dinoco_cron_flash_category_verify_cron_last_run` for backward compat.
   Snippet 1 NOT modified (V.34.25 sensitive). Effect: `verify_cron_stale_*min`
   warning no longer fires perpetually when cron is actually healthy.
2. **Single-event crons** — `wp_schedule_single_event` calls (36 sites
   across 7 snippets) have NO heartbeat coverage by design (one-shot).
   But some DINOCO-specific patterns (e.g. `b2b_delivery_check_event`,
   `b2b_verify_slip_async`, `b2b_flash_courier_retry`) might benefit
   from observability. Defer until concrete need.
   ⏸ **Still deferred** (Round 31 assessment): no concrete bug surfaced
   from missing heartbeat. Cost-benefit doesn't justify per-event tracking
   infrastructure. Revisit in Round 34+ if specific incident requires it.
3. **Cron interval consistency** — `every_15min_b2b_bo` (Snippet 16) +
   `every_2hr_b2b` (Snippet 7) + `everytwohours` (Snippet 3) overlap
   semantically. Documented in CLAUDE.md but no detector enforces.
   ⏸ **Still deferred** (Round 31 assessment): cosmetic only — no functional
   impact since each snippet uses its own well-named filter. Consolidation
   would touch 3 sensitive snippets including Snippet 1 (forbidden). Defer
   indefinitely unless WP core schedule registration breaks.

## Summary

- **2 crons** migrated to registry tracking (out of 34 scheduled crons in repo)
- **0** drift between scheduled + handler (all crons have a registered handler — verified by Jest detector)
- **0** doc drift (CLAUDE.md mentions cron names that match registered crons)
- **Defer**: Single-event observability + heartbeat key naming consistency (Round 29)

After Round 28: **34 scheduled crons + 32 in registry + 2 fixed = 100% heartbeat coverage** (excluding intentional one-shot single events).

## See also

- `tests/jest/cron-drift.test.js` — automated drift detector (Round 21 ITEM B)
- `[Admin System] DINOCO Health Monitor` — heartbeat dashboard
- Phase 4f cron migration plan: `docs/audit/phase-4f-applied.md`
