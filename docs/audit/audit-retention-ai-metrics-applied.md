# Audit Retention + AI Accuracy Metrics — Applied 2026-04-24

## Context

**Phase 1.5 deploy (commit 9264de2)** shipped `wp_dinoco_audit_log` (Snippet 15
V.8.9) — unified forensic audit trail consumed by `dinoco_audit_log()` helper.
Pillar 3 architecture closes the "audit scattered across 6 places, 30-min
forensic queries" pain by writing a single index overlay row at every mutation
boundary (debt, credit, stock, slip, FSM, config).

**Two follow-up gaps** flagged by the orchestrator for backend remediation:

1. **No retention policy** — table grows unbounded. Estimated ~10K writes/day
   × ~200 bytes = ~2MB/day = ~700MB/year. Acceptable for Phase 1 observation,
   not for steady-state.
2. **No AI accuracy tracking** — V.34.17 AI Vision pre-classifier (Claude
   Haiku 4.5) ships without a way to measure precision/recall/F1 against
   ground truth (Slip2Go / admin Review Pool decisions). Cost saving claim
   "~50-100x cheaper" is unverified at runtime.

This change ships both:

- **Part A** — retention cron + Health Dashboard card + manual run
- **Part B** — schema additions to `wp_dinoco_slip_log` + helpers + 3
  hookups in Snippet 2 finally block + Health Dashboard card

## Files Changed

| File | Version | Purpose |
|------|---------|---------|
| **NEW** `[Admin System] DINOCO Audit Retention` | V.1.0 | Daily cron + REST + helpers |
| `[Admin System] DINOCO Health Monitor` | V.1.2 → **V.1.3** | 2 dashboard cards + JS run handler |
| `[B2B] Snippet 15: Custom Tables & JWT Session` | V.8.15 → **V.8.16** | +2 cols (`ai_correct`, `ai_correctness_source`) + `idx_ai_correct` |
| `[B2B] Snippet 1: Core Utilities & LINE Flex Builders` | V.34.19 → **V.34.20** | 3 helpers + log_insert schema-aware extension |
| `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator` | V.34.18 → **V.34.20** | Ground-truth derivation in finally block |

All 5 files pass `php -l` syntax check.

**NOT TOUCHED** (per orchestrator rule — Agent B parallel work):
- `[Admin System] DINOCO Slip Monitor` — `b2b_slip_ai_apply_review_correction()`
  helper is exported for them to call from review-decision endpoint when ready.

## Part A — Audit Log Retention

### Schema

No DB schema changes — pure read/archive/delete on existing
`wp_dinoco_audit_log` (Snippet 15 V.8.9).

### Policy (defaults)

```
audit.retention_days        90    — keep ALL events full fidelity
audit.archive_days          180   — non-critical events 90-180d → CSV.gz
audit.critical_retention_days 365 — debt/credit/slip/stock/FSM kept 1y minimum
audit.batch_size            5000  — rows per archive/delete batch
```

All 4 keys registered via Config Layer (visible in `[dinoco_admin_config_viewer]`).

### Critical event whitelist (long-retention)

```
debt_subtract, debt_add,
credit_subtract, credit_add, b2f_credit_add, b2f_credit_subtract,
slip_apply, slip_review_decision, manual_admin_paid,
stock_add, stock_subtract, stock_transfer,
fsm_transition,
po_create, po_complete, po_cancel,
config_change,
retention_run
```

Anything outside this list → eligible for deletion at `archive_days` (180).
Inside list → kept at least `critical_retention_days` (365).

### Archive format

`wp-content/uploads/audit-archive/YYYY-MM/audit_YYYY-MM_<unix>.csv.gz`

- gzip level 9 compression (CSV inside)
- UTF-8 BOM + CRLF line endings (Excel-friendly when un-gzipped)
- One file per (run, month) — easy to grep / restore
- Folder protected via `.htaccess` deny-all + `index.php` placeholder
- Plain CSV fallback if `gzopen()` unavailable

### REST endpoints

```
GET  /wp-json/dinoco/v1/audit/retention/status     (manage_options)
POST /wp-json/dinoco/v1/audit/retention/run        (manage_options + nonce + 3/min rate limit)
     body: { dry_run: bool }
```

### Cron

```
dinoco_audit_retention_cron     daily      dinoco_audit_retention_handler
```

Registered via `dinoco_register_cron()` (Pillar 5 — Health Monitor heartbeat).
Falls back to vanilla `wp_schedule_event()` if Health Monitor not loaded.

### Self-audit

Every retention run writes a `retention_run` event_type row to the audit_log
itself (so retention runs are forensic-visible — ironic but useful).

### Health Dashboard card

`📦 Audit Log Retention` card displays:
- Total rows count
- Table size (data + index, INFORMATION_SCHEMA)
- Archive folder size + file count
- Last run timestamp + counts
- Manual buttons: 🧪 Dry-Run / ▶ Run Now (rate-limited 3/min)
- Inline result render

### Time budget

Each run capped at 30s wall clock with 20-iteration safety cap. If exceeded,
remaining rows roll over to next daily run.

## Part B — AI Accuracy Metrics

### Schema additions (Snippet 15 V.8.16)

```sql
ALTER TABLE wp_dinoco_slip_log
  ADD COLUMN ai_correct TINYINT(1) DEFAULT NULL AFTER credit_note_audit_id,
  ADD COLUMN ai_correctness_source VARCHAR(32) DEFAULT NULL AFTER ai_correct,
  ADD INDEX idx_ai_correct (ai_classifier_decision, ai_correct);
```

Idempotent ALTER pattern: `INFORMATION_SCHEMA.COLUMNS` probe + `ADD COLUMN`
on miss. `dbDelta()` handles fresh installs via the CREATE TABLE definition
update.

### Semantics

| ai_correct | meaning |
|------------|---------|
| 1          | AI prediction matched ground truth |
| 0          | AI prediction wrong (false positive or false negative) |
| NULL       | Unknown ground truth (system error, pending review, AI didn't run, heuristic-caught) |

### Source enum (32 chars)

```
slip2go_success           — AI predicted is_slip + Slip2Go OK (200000/200200)
slip2go_duplicate         — AI predicted is_slip + Slip2Go 200501 (was real slip)
slip2go_receiver_mismatch — AI predicted is_slip + Slip2Go 200401
slip2go_amount_mismatch   — AI predicted is_slip + Slip2Go 200402
slip2go_ocr_fail          — AI predicted is_slip but Slip2Go 200500/502/503 (OCR failed)
slip2go_not_slip          — AI predicted not_slip + Slip2Go 200404 confirmed
duplicate_detect          — replay_after_paid hit (image_hash matched prior payment)
admin_review_confirm      — admin Review Pool agreed with AI
admin_review_override     — admin Review Pool contradicted AI
manual_admin_paid         — admin Manual Process Tool path
```

### Helpers (Snippet 1 V.34.20)

```php
b2b_slip_ai_update_correctness( int $log_id, bool $correct, string $source ) : bool
b2b_slip_ai_get_accuracy( int $days = 7 ) : array
b2b_slip_ai_apply_review_correction( int $log_id ) : bool
```

All schema-aware (silent skip when columns missing — pre-V.8.16 install).

### Hookups (Snippet 2 V.34.20 — finally block)

The `_slip_final_status` switch derives `ai_correct + ai_correctness_source`
**before** `b2b_slip_log_insert()` is called. No new code paths — pure
read-only mapping based on terminal state already computed by the existing
slip pipeline.

```
paid / paid_overpayment              → ai_correct iff AI said is_slip
duplicate (Slip2Go 200501)           → ai_correct iff AI said is_slip
receiver_mismatch / amount_mismatch  → ai_correct iff AI said is_slip
amount_no_pending                    → ai_correct iff AI said is_slip
replay_after_paid / manual_admin_paid → ai_correct iff AI said is_slip
not_slip (Slip2Go 200404)            → ai_correct iff AI said not_slip
needs_review / unknown_slip_code     → if AI=is_slip → false positive (OCR fail)
                                       if AI=not_slip → leave NULL (admin will decide)
slip2go_error / fatal_exception / etc → leave NULL (no ground truth)
not_slip_heuristic / not_slip_ai     → leave NULL (no Slip2Go run)
```

### Slip Monitor integration (deferred)

`b2b_slip_ai_apply_review_correction()` is callable by Slip Monitor's
`/review-decision` REST endpoint when admin marks a previously-classified
log row as is_slip / not_slip / manual_process. Wiring is one line:

```php
// inside dinoco_slip_monitor_rest_review_decision after $wpdb->update:
if ( function_exists( 'b2b_slip_ai_apply_review_correction' ) ) {
    b2b_slip_ai_apply_review_correction( $log_id );
}
```

Per orchestrator rule (Agent B in parallel) — left unwired here. Helper is
idempotent + safe to call multiple times.

### Health Dashboard card

`🤖 AI Vision Accuracy (7d)` card displays:
- Precision / Recall / F1 / Accuracy (% with 1 decimal)
- Confusion matrix table (TP/TN/FP/FN with notes)
- "Pending (no ground truth)" row with total classified count
- Empty state: friendly amber banner if no rows have ground truth yet

Computed via 1 `GROUP BY` SQL (no N+1).

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Cron tick with 0 rows >90d | dry_run + run = 0 archived/deleted, no errors |
| 2 | Insert fake row dated 100d ago + run | row archived to CSV.gz + deleted |
| 3 | Insert fake row dated 200d ago + event_type=debt_subtract | NOT deleted (critical 365d) |
| 4 | Insert fake row dated 400d ago + event_type=cron_error | deleted (non-critical >180d) |
| 5 | Manual button "Dry-Run" | counts only, NO mutation |
| 6 | Manual button "Run Now" 4× rapid | 4th call returns 429 rate_limit |
| 7 | `b2b_slip_ai_get_accuracy(7)` with 0 rows having ground truth | total_with_ground_truth=0, all metrics 0.0 |
| 8 | Submit slip → AI=is_slip + Slip2Go 200200 | log row has ai_correct=1, source='slip2go_success' |
| 9 | Submit slip → AI=is_slip + Slip2Go 200500 | log row has ai_correct=0, source='slip2go_ocr_fail' |
| 10 | Submit slip → AI=not_slip (silent skip) | log row has ai_correct=NULL (no ground truth) |
| 11 | Slip Monitor admin marks log as is_slip when AI said not_slip | (when wired) ai_correct=0, source='admin_review_override' |
| 12 | Health Dashboard with 0 audit rows | "Audit Log Retention" card shows 0 rows + "ยังไม่เคยรัน" |
| 13 | Health Dashboard with cols missing | "AI Vision Accuracy" card shows amber "schema not synced" banner |

## Rollback

### Soft (instant)

```sql
-- Disable retention cron
DELETE FROM wp_options WHERE option_name = 'cron'
  AND option_value LIKE '%dinoco_audit_retention_cron%';
-- Or: WP Admin → Snippets → disable [Admin System] DINOCO Audit Retention
```

`wp_dinoco_audit_log` table grows unbounded again — pre-V.1.0 baseline.

### Hard (revert code)

```bash
git revert <this_commit_sha>
```

Schema columns (V.8.16) persist (nullable, no regression). Retention helper
calls fall through `function_exists()` guards.

### Schema rollback (extreme — manual SQL)

```sql
ALTER TABLE wp_dinoco_slip_log
  DROP INDEX idx_ai_correct,
  DROP COLUMN ai_correctness_source,
  DROP COLUMN ai_correct;
UPDATE wp_options SET option_value = '8.15'
  WHERE option_name = '_dinoco_catalog_table_version';
```

Not recommended — columns nullable + harmless.

## Backward Compat Guarantees

- All schema additions nullable → INSERT without these keys is fine
- All helpers behind `function_exists()` guards
- `b2b_slip_log_insert()` schema-aware — drops new keys if cols missing
- Retention cron silent if `wp_dinoco_audit_log` table doesn't exist
- Health Dashboard cards self-render gracefully when helpers absent
- No `<?php` tag in any snippet file
- No edit to Slip Monitor file (Agent B parallel work)

## Performance Budget

- Retention cron: 30s wall clock max, 20-iteration safety cap, 5000 rows/batch
- Archive write: gzip-9 ~50MB output for 200K rows → ~2-3s per file
- Health Dashboard card SQL: 4 queries (table size + 3 stats) — <50ms total
- AI accuracy SQL: 1 COUNT + 1 COUNT + 1 GROUP BY + 1 COUNT = ~4 queries — <30ms

## DB_ID Headers

NEW snippet `[Admin System] DINOCO Audit Retention` carries `DB_ID: (pending —
populate after first WP Code Snippets sync)` per project convention.
GitHub Webhook Sync engine will assign on first sync via filename matching
(no DB_ID header → falls back to normalized filename).
