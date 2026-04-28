# Admin UX Enhancement Applied — Round 2 Journey A + D

**Date**: 2026-04-24
**Scope**: Closes 2 priority UX gaps flagged by Round 2 Agent 4 (UX Cross-System review).
**Files touched**: 3 (1 new + 2 modified)

## Summary

Round 2 audit identified two recurring admin pain points where a single
operational task forced page-swapping across 4 distinct admin screens. This
batch closes both with inline UX:

| Journey | Before (4 pages) | After (1 click) |
|---------|------------------|-----------------|
| **A — Refund overpayment** | Slip Monitor → Manual Invoice → Finance Dashboard → LINE bot manual | Slip Monitor row action → modal → done |
| **D — Onboard distributor** | CPT add → wire `line_group_id` → toggle bot → first test order | New shortcode `[dinoco_admin_onboard_distributor]` — 5-step wizard |

Both journeys reuse Phase 1-4 architecture pillars (Module Registry, Audit
Log, Modal Helpers, Transaction Wrapper) — not just bolt-on UI.

## Part A — Refund / Credit-Note Workflow

### Files

- `[B2B] Snippet 15: Custom Tables & JWT Session` V.8.14 → **V.8.15**
- `[Admin System] DINOCO Slip Monitor` V.1.12 → **V.1.13**

### Schema additions (Snippet 15 V.8.15 — applied via dbDelta + idempotent ALTER)

5 new columns on `wp_dinoco_slip_log` + 1 new index:

```sql
ALTER TABLE wp_dinoco_slip_log
  ADD COLUMN credit_note_amount    DECIMAL(14,2) NULL,
  ADD COLUMN credit_note_issued_at DATETIME NULL,
  ADD COLUMN credit_note_reason    VARCHAR(500) NULL,
  ADD COLUMN credit_note_by        BIGINT UNSIGNED NULL,
  ADD COLUMN credit_note_audit_id  BIGINT UNSIGNED NULL,
  ADD INDEX idx_credit_note_status (credit_note_issued_at);
```

Volume estimate: low (admin issues credit notes manually — < 5 per day in
typical operation). Reusing slip_log columns (vs separate `credit_notes`
table) keeps forensic chain intact (slip → credit note → audit).

### REST endpoints (NEW — 2)

#### `GET /dinoco-slip/v1/credit-note-eligible?log_id=N`

Eligibility probe + modal pre-fill data.

Returns `{ eligible, log_id, dist_id, dist_name, group_id, amount,
sender_name, trans_ref, current_debt, suggested_overpaid, already_issued,
issued_info? }`.

Eligibility rule: row exists + `result_status='paid_overpayment'` + not
already credited. Suggested overpaid = `slip_amount - max(0, current_debt)`
(admin clamps further).

#### `POST /dinoco-slip/v1/issue-credit-note`

Atomic credit issuance. Body `{ log_id, amount, reason, notify_dist? }`.

Pipeline (mirrors `manual-process` V.1.4 BUG-A/B/C fixes):

1. Pre-load eligibility row + validate
2. `GET_LOCK('dnc_cn_<log_id>', 3)` — prevents double-click double-issue
3. In-lock re-check `credit_note_issued_at IS NULL`
4. `b2b_debt_subtract($dist_id, $amount, 'credit_note:slip_log#<id>:u=<uid>:<reason>')`
5. `dinoco_audit_log({ event_type: 'credit_note_issued', ... })` — captures
   audit_id for slip_log link
6. `UPDATE slip_log SET credit_note_*` (preserves log row, dual-write to
   audit_log)
7. `b2b_recalculate_debt()` — source of truth refresh
8. `RELEASE_LOCK` BEFORE LINE side effects (idempotent network calls)
9. LINE Flex notify customer (gated by `notify_dist` flag) + admin push

Guards: `manage_options` + WP nonce + `b2b_rate_limit('slip_credit_note_u<uid>',
5, 60)` + status enum guard + amount ≤ slip_amount + reason ≥10 chars +
already-credited 409 + concurrent-lock 409 + schema-missing 501.

Audit: `event_type='credit_note_issued'` with `delta_before`/`delta_after`
(debt) + context `{ reason, slip_amount, trans_ref, sender_name, group_id }`.
Forensic chain: `slip_log` ↔ `audit_log.related_log_id` ↔ debt audit chain
via `b2b_debt_subtract` postmeta (Phase 1.5 pattern preserved).

### UI additions (Slip Monitor V.1.13)

- Recent 50 table: NEW Action column. `paid_overpayment` rows render purple
  💰 button. Already-credited rows render greyed `✓ credit_issued` badge with
  tooltip showing amount + timestamp.
- NEW modal `#dncSlipCreditNoteModal` — distributor summary auto-loaded from
  `/credit-note-eligible` + amount + reason + LINE notify checkbox.
- ESC + backdrop click + close button — all dismiss modal.
- Uses `window.dinocoModal.confirm/alert` with native `confirm()/alert()`
  fallback (consistent with Phase 6 pattern).

## Part B — Distributor Onboarding Wizard

### Files

- `[Admin System] DINOCO Distributor Onboarding Wizard` **V.1.0 (NEW)**

### Shortcode

`[dinoco_admin_onboard_distributor]` — registered via Module Registry at
`init` priority 30, auto-merges into Admin Dashboard sidebar (section: B2B,
icon: fa-user-plus, label: "เพิ่มตัวแทนใหม่").

### Wizard flow (5 steps)

1. **ข้อมูลพื้นฐาน** — shop name, tier (5 options), credit limit, credit term,
   default discount %, walk-in toggle. Tier hint updates live.
2. **เชื่อม LINE Group** — input + uniqueness check via
   `POST /onboard/check-group-id` (regex `^[A-Za-z0-9]{20,}$` + meta_query
   on `line_group_id`). Conflict shown with offending dist title + id.
3. **Bot Config** — `bot_enabled` toggle + warn banner explaining no-bot
   implication.
4. **Test Order** (optional) — `POST /onboard/test-bot` sends Thai welcome
   text via `b2b_line_push()`. Audit logged regardless of success.
5. **Review + Save** — summary table + confirm dialog → `POST /onboard/save`
   creates CPT + ACF meta in transaction wrapper.

### REST endpoints (NEW — 3, namespace `/wp-json/dinoco/v1/onboard/*`)

| Endpoint | Purpose | Rate limit |
|----------|---------|------------|
| `POST /check-group-id` | Uniqueness validate + format regex | none (read) |
| `POST /test-bot` | LINE Flex welcome push | 5/min/user |
| `POST /save` | Create distributor CPT + ACF | 10/min/user |

All endpoints: `manage_options` + WP nonce. Save endpoint additionally does
defense-in-depth uniqueness recheck inside the handler (frontend already
validated, but second admin in another tab could race).

### Architecture pillars used

- **Module Registry** (Phase 1) — self-registers, fail-loud notice if
  shortcode missing. Source: `'[Admin System] DINOCO Distributor Onboarding
  Wizard V.1.0'` recorded in registry for provenance.
- **Audit Log** (Phase 1.5) — every wizard action audited:
  `onboard_test_bot` (with sent/error context) + `onboard_distributor`
  (target=new dist_id + audit_context with shop_name/tier/credit/walkin/bot).
- **Modal Helpers** (Phase 5) — all confirm/alert via `window.dinocoModal.*`
  with native fallback.
- **Transaction Wrapper** (Phase 2) — final save wrapped in
  `dinoco_transaction('onboard_distributor', { mutate }, ctx)` with
  audit_event_type / actor_type / target_type — best-effort dual-write.
  Falls back to direct mutate + manual audit if wrapper unavailable.

### CSS

Scope `.dnc-onboard-*` — no conflict with existing prefixes. Mobile
breakpoint at 640px collapses 2-col grid → 1-col + reduces card padding.
Stepper renders horizontally with active/done states using gradient.

## PHP lint

All 3 files pass `php -l` (with synthetic `<?php` prepended for snippet
files).

## Test plan

### Credit Note workflow

1. Customer overpays (e.g. ฿5000 to clear ฿4500 debt) → row inserted with
   `result_status='paid_overpayment'`
2. Admin opens Slip Monitor → row shows 💰 button
3. Click → modal opens with summary + suggested overpaid amount pre-filled
4. Confirm → debt subtracted ฿500, slip_log row marked credit_issued, LINE
   message sent to dist group, badge updates to `✓ credit_issued`
5. Click 💰 again on same row → modal shows "ออกแล้ว" + Confirm disabled
6. Issue credit note > slip amount → 422 amount_exceeds_slip
7. Two admins click in parallel within 200ms → second receives 409
   concurrent_issue (GET_LOCK)

### Onboarding wizard

1. Walk through all 5 steps with valid data → CPT created, ACF meta
   correctly populated, `bot_enabled` post meta set, `_b2b_onboarded_via=
   wizard_v1` flag stamped
2. Step 2 — paste an existing distributor's group_id → step rejects with
   conflict_dist info
3. Step 4 — test bot → LINE group receives welcome text. If group_id wrong
   (bot not in group) → fail message shown, audit row written success=0
4. Step 5 — confirm dialog → save. Backend re-validates uniqueness (defense
   in depth)
5. Mobile (375px viewport) — wizard renders 1-column, stepper wraps,
   buttons stack
6. Reload mid-wizard → state lost (intentional — no localStorage; admin
   re-enters)

## Backward compat

- All schema additions on `wp_dinoco_slip_log` are nullable + indexed
  separately — no impact on existing inserts/reads.
- Slip Monitor `/recent` schema-aware probe gracefully degrades to empty
  cn_cols_select when V.8.15 not yet applied (pre-deploy installs).
- New REST endpoints all require `manage_options` — no public surface
  change.
- Onboarding wizard is additive — existing CPT add via `/wp-admin/post-new.php`
  still works as fallback.

## Rollback

| Surface | Disable method |
|---------|----------------|
| Credit note button | Disable Slip Monitor V.1.13 → reverts to V.1.12 (no button). Schema additions stay (orphaned columns, harmless). |
| Onboarding wizard | Disable wizard snippet → shortcode stops resolving → admin sidebar tab shows "shortcode not registered" yellow notice (Module Registry validator). |
| Schema rollback | DROP COLUMN credit_note_* in MySQL CLI — only if wizard not deployed. Not recommended (slip_log audit history stays cleaner with NULL columns). |

## Out of scope (deferred)

- Credit-note PDF receipt — current notification = LINE text only. PDF
  follow-up could reuse Snippet 10 invoice generator pattern.
- Onboarding wizard — bulk import from CSV (separate spec) + edit-existing
  mode (`?dist_id=N`). Edit mode partially supported via `/check-group-id`
  `exclude_id` param but UI doesn't expose yet.
- Audit log UI viewer for `event_type='credit_note_issued'` events — current
  implementation writes the audit, but a dedicated review screen would aid
  reconciliation. Defer to Phase 7.

## Commit

Single batched commit covering all 3 files. Pull immediately after push per
project workflow.
