# Audit Report — B2B Finance + Slip + Tools (Round 2 Agent 2/4)

**Date**: 2026-04-28 | **Agent**: code-reviewer

## Summary

5 pages audited (~16,141 LOC). Auth/permission posture is **strong** across all surfaces (uniform `manage_options` + nonce gates, uniform `$perm` callbacks). Critical issues concentrate in **Manual Invoice money-flow atomicity** and **slip dedup gaps in two parallel slip pipelines**. Slip Monitor (V.1.5) is a model implementation with `GET_LOCK` + in-lock dedup. Service Center & Claims and Finance Dashboard are clean.

**Findings**: 3 CRIT · 4 HIGH · 3 MED · 2 LOW = 12 total

## 🔴 CRITICAL (3)

### C1 — Manual Invoice slip verify has NO trans_ref dedup
- **File**: `[Admin System] DINOCO Manual Invoice System` lines 1712-1753 (`dinoco_inv_rest_verify_slip`) + 1757-1907 (`dinoco_inv_rest_verify_slip_combined`)
- **Problem**: Same Slip2Go ref can be replayed. After `awaiting_payment` → `paid` flip, replay is blocked, but during partial payments (`new_paid < total`) replay → over-credit + re-write `_inv_slip_ref`. Snippet 2 V.34.11 has `b2b_slip_is_trans_ref_seen()` guard (lines 2952-2964); Manual Invoice does not call it.
- **Impact**: Double-credit on partial payments; potential debt drift via multi-invoice combined flow.
- **Fix**: Before calling `record_payment`, gate with:
  ```php
  if ($slip_ref && function_exists('b2b_slip_is_trans_ref_seen') && b2b_slip_is_trans_ref_seen($slip_ref)) {
      return new WP_Error('duplicate_slip', 'สลิปนี้เคยใช้แล้ว ref=' . $slip_ref, ['status' => 409]);
  }
  ```
- **DINOCO Pattern**: `[B2B] Snippet 1` V.34.12 `b2b_slip_is_trans_ref_seen()` (existing, just not invoked by Manual Invoice path).

### C2 — `record_payment` race condition (no FOR UPDATE / GET_LOCK)
- **File**: `[Admin System] DINOCO Manual Invoice System` lines 1566-1611 (`dinoco_inv_rest_record_payment`)
- **Problem**: `update_post_meta($id, '_inv_paid_amount', $new_paid)` at line 1588 is non-atomic. Two concurrent admin clicks (or slip-verify + manual record) read same `$paid_so_far`, both compute `$new_paid = paid + amount`, both write — second overwrites first → lost payment record. Also `_inv_partial_payments` JSON gets clobbered. `record_refund` at line 1628 properly wraps in `START TRANSACTION` + FOR UPDATE; `record_payment` does not.
- **Impact**: Lost payment entries; debt recalc drift; combined slip auto-allocate especially exposed (line 1849-1860 loops `record_payment` per matched invoice).
- **Fix**: Mirror `record_refund` pattern — wrap meta read/write in `START TRANSACTION` + `SELECT ... FOR UPDATE` on `_inv_paid_amount` meta row.

### C3 — `_inv_slip_ref` write before dedup commit (TOCTOU)
- **File**: Same file lines 1740-1748 (`verify_slip`) + 1853-1860 (`verify_slip_combined`)
- **Problem**: `update_post_meta(_inv_slip_ref)` happens BEFORE `record_payment` — but `record_payment` itself can fail (e.g. status changed mid-call). Result: meta stamped, but no debt subtract → forensic inconsistency. Worse, no `wpdb` transaction wraps stamp+payment, so two simultaneous slip submits can both pass the `awaiting_payment` check and both stamp.
- **Impact**: Audit trail / forensic dedup query (`meta_query _inv_slip_ref`) returns false-positives.
- **Fix**: Stamp `_inv_slip_ref` INSIDE `record_payment`'s transaction (after FOR UPDATE acquired) + verify status under lock.

## 🟡 HIGH (4)

### H1 — Slip pipelines drift (2 parallel implementations)
- **Files**: Auto bot path = `[B2B] Snippet 2` V.34.11 lines 2887-3210 (image upload via LINE); Admin path = `[Admin System] DINOCO Manual Invoice System` `verify_slip_combined`. Different dedup, different overpayment handling, different audit log structure.
- **Impact**: Logic drift = security regressions slip into one path only (e.g. C1 confirms Manual Invoice missed Snippet 2's V.H-5 fix).
- **Fix**: Extract shared helper `b2b_slip_apply_to_invoices($slip_data, $invoice_ids)` in Snippet 1 with single dedup + lock + record path. Refactor both call sites.

### H2 — Direct `update_field('current_debt')` fallbacks (FSM bypass)
- **File**: Manual Invoice lines 607, 1525, 1599, 1433, 2042
- **Problem**: Multiple `function_exists('b2b_recalculate_debt') ? ... : update_field('current_debt', ...)` fallbacks. If atomic helper is unloaded (sync race), code silently writes debt without lock → drift.
- **Impact**: Per CLAUDE.md "All debt mutations go through Snippet 13 — direct `update_field('current_debt')` is blocked." These fallbacks violate that contract.
- **Fix**: Replace fallback branches with `wp_die()` / `WP_Error('debt_helper_missing')` — fail loud rather than corrupt.

### H3 — `verify_slip_combined` inner loop reuses `$slip_amount` mutated variable
- **File**: lines 1849-1851
- **Problem**: `foreach ($matched as $inv) { $pay_amount = min($inv['remaining'], $slip_amount); $slip_amount -= $pay_amount; ... }` — but the response payload at line 1874 reads `$body['amount']` (original, OK) while audit log at line 1903 also re-reads `$body['amount']`. The mutated `$slip_amount` could go negative on rounding error → negative `$pay_amount` next iter possible only if `min($inv['remaining'], -X)` short-circuits. Edge case but not bounded by `if ($slip_amount <= 0) break;`.
- **Fix**: Add `if ($slip_amount <= 0.01) break;` after subtract.

### H4 — Slip2Go API call has no idempotency key
- **File**: lines 1725-1729 + 1768-1772
- **Problem**: `wp_remote_post` to Slip2Go without idempotency token. If WP retries on timeout, Slip2Go counts 2 verification credits for same slip.
- **Impact**: Cost/billing concern, not security. Slip2Go may also rate-limit.
- **Fix**: Use `slip_url` SHA256 as deterministic transient cache (TTL 5 min) — return cached `$body` on duplicate `slip_url` within window.

## 🟢 MEDIUM (3)

### M1 — `verify_slip_combined` does not validate distributor ownership of pre-selected `invoice_ids`
- **File**: lines 1793-1798
- **Problem**: Admin can pass `manual_ids` from another distributor; `array_filter` filters by `$pending` (already filtered by `$dist_id`), but if `$dist_id=0` (line 1789) → `_dinoco_inv_get_pending_invoices` not called → `$pending=[]` → no match → no payment. Safe by accident. But if `$dist_id` provided + `manual_ids` from another dist → silently drops them. Should error.
- **Fix**: Validate every `manual_ids` belongs to `$dist_id` and return error on mismatch.

### M2 — Service Center claim photo log uses `sanitize_text_field` on potentially HTML-bearing log
- **File**: Service Center line 865 — `$safe_log = sanitize_text_field($log_item)` then echoed somewhere downstream. Acceptable but if log carries Thai with emoji + multi-line history, `sanitize_text_field` strips newlines. Functional risk, not security.

### M3 — Manual Invoice `_inv_partial_payments` JSON can grow unbounded
- **File**: line 1585-1589 — array push without cap.
- **Fix**: `array_slice($payments, -50)` to keep last 50; archive older to a separate meta or compress.

## 🔵 LOW (2)

### L1 — Slip Monitor lock key truncation comment
- **File**: Slip Monitor line 644 — comment says ">64 chars rejected silently". Lock key `'dnc_mp_' . $dist_id . '_' . md5(...)` = 7+10+1+32 = ~50 chars. Fine. Comment misleading — lock keys >64 are allowed in MySQL 5.7+ (truncated to 64). Doc-only.

### L2 — Inconsistent timezone in `b2b_date()` calls
- All money flows use `b2b_date('Y-m-d H:i:s')`, fine. But `dinoco_inv_rest_verify_slip` line 1739 uses `b2b_date('Y-m-d')` for slip date — drops time. Audit forensic gap.

## ✅ What's Good

- Slip Monitor V.1.5 manual-process is a **gold-standard** atomic implementation: GET_LOCK + in-lock dedup + auto_mark_paid before recalc + lock release before LINE side-effects.
- `record_refund` (Manual Invoice) properly uses `START TRANSACTION` + FOR UPDATE on 3 rows + try/catch ROLLBACK.
- All REST endpoints across 5 surfaces have `permission_callback` with both `wp_verify_nonce('wp_rest')` AND `current_user_can('manage_options')`. Zero anonymous endpoints.
- Service Center & Claims uses both module-level + state-changing-action nonce verification (defense-in-depth).
- Finance Dashboard uses custom `dinoco_finance_nonce` + caps check on every AJAX action.
- All admin output uses `esc_html()` / `esc_attr()` consistently (random sample of 10 sites — all clean).
- Snippet 9 Admin Control Panel uses `$perm` shared closure for all 30+ REST endpoints — uniform contract.

## 📋 Action Items (Priority Order)

- [ ] **C1** Add `b2b_slip_is_trans_ref_seen()` gate in `verify_slip` + `verify_slip_combined` — 30 min
- [ ] **C2** Wrap `record_payment` in transaction + FOR UPDATE (mirror `record_refund`) — 1 hr
- [ ] **C3** Move `_inv_slip_ref` stamp inside `record_payment` transaction — 30 min
- [ ] **H1** Extract shared slip-apply helper to Snippet 1 — 3-4 hr (refactor)
- [ ] **H2** Replace direct `update_field('current_debt')` fallbacks with `WP_Error` — 30 min
- [ ] **H3** Add `$slip_amount <= 0.01` break guard — 5 min
- [ ] **H4** Add Slip2Go response cache transient (5-min TTL keyed on `slip_url` hash) — 30 min

## 🔗 Cross-Agent Flags

- ⚙️ **Fullstack Developer**: H1 slip-pipeline consolidation needs architecture decision (single helper vs adapter pattern)
- 🔒 **Security Pentester**: C1+C3 are forensic dedup gaps — please verify Slip2Go API does NOT itself dedup `slip_url` (we may be relying on assumed behavior)
- 💾 **Database Expert**: C2 wpdb transaction pattern + meta_id row-lock semantics — verify lock granularity sufficient under InnoDB default isolation (`REPEATABLE READ`)
- 🚀 **Performance Optimizer**: H4 cache transient + M3 partial_payments JSON growth — both performance-adjacent

## Files Reviewed (absolute paths)

- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Slip Monitor`
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Admin Finance Dashboard`
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Manual Invoice System`
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Service Center & Claims`
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[B2B] Snippet 9: Admin Control Panel`
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[B2B] Snippet 1: Core Utilities & LINE Flex Builders` (slip helpers)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[B2B] Snippet 2: LINE Webhook Gateway & Order Creator` (slip handler)
