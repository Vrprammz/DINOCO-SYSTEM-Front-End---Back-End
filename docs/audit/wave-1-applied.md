# Wave 1 Applied — Atomic + FSM Hardening

**Date**: 2026-04-28 (audit Round 2 remediation)
**Scope**: 8 fixes from `MASTER-FINDINGS-ROUND-2.md` (3 CRIT + 5 HIGH)
**Files**: 5 PHP snippets, all PHP-lint clean
**Approach**: Per `feedback_push_batch.md` — single batched commit

---

## Fixes Applied (8/8)

### CRIT-C1 — BO Nested Transaction Flattening (Snippet 16)

**Before** (3 sites — `bo-split` ~line 958, `bo-undo-split` ~1232, `bo-fulfill` ~1322):

```php
$wpdb->query('START TRANSACTION');
foreach ($items as $item) {
    $result = dinoco_stock_subtract(...);   // ← inner COMMIT flattens outer
    if (is_wp_error($result)) {
        $wpdb->query('ROLLBACK');           // ← no-op (already committed)
        return ...;
    }
    b2b_debt_add(...);                       // ← also nests + commits
}
$wpdb->query('COMMIT');
```

**After**:

```php
$lock_acquired = b2b_financial_lock($dist_id, 5);  // serialize per distributor
if (!$lock_acquired) return WP_Error('lock_busy', 429);

// PHASE 1: validate ALL splits/items (read-only)
foreach ($splits as $idx => $split) {
    // invariant + product_data + leaf resolve up-front
    $validated[] = [...];
}

// PHASE 2: mutate sequentially with compensation
$compensate = function() use (...) {
    foreach ($stock_subtractions as $sub) @dinoco_stock_add(...);  // restore
    if ($debt_added > 0) @b2b_debt_subtract(...);                  // reverse
    foreach ($bo_queue_ids as $bid) $wpdb->delete(...);            // remove
};
foreach ($validated as $v) {
    $r = dinoco_stock_subtract(...);
    if (is_wp_error($r)) { $compensate(); b2b_financial_unlock(); return ...; }
    $stock_subtractions[] = ...;
    // ... bo_queue insert + debt_add ...
}
b2b_financial_unlock();
```

**Files**: `[B2B] Snippet 16: Backorder System` V.1.15 → V.2.0
- `b2b_rest_bo_split()` (line 936) — validate-then-mutate + compensation closure
- `b2b_rest_bo_undo_split()` (line 1268) — fixed broken `b2b_debt_subtract` fallback (was wrapped in `function_exists` but never called the function — silent debt skip). Now requires `b2b_recalculate_debt()`; fail loud 503 if missing.
- `b2b_rest_bo_fulfill()` (line 1401) — validate-then-mutate, FOR UPDATE per row in mutation phase (short-held)

### CRIT-C2 — Duplicate `b2b_set_order_status` Fallbacks Bypass FSM

**Before**:
```php
// Snippet 5 line 49
if (!function_exists('b2b_set_order_status')) {
    function b2b_set_order_status($tid, $st) {
        update_field('order_status', $st, $tid);  // ← bypass FSM, no hooks
    }
}
// Manual Invoice line 60: similar fallback with history but no FSM
```

**After** — both files: removed fallback function definition. Replaced with admin_notice + b2b_log when canonical missing.
- `[B2B] Snippet 5: Admin Dashboard` V.32.5 → V.33.0
- `[Admin System] DINOCO Manual Invoice System` V.33.8 → V.34.0

### CRIT-C3 — 9 Direct `update_field('current_debt')` Mutations

| Site | Before | After |
|------|--------|-------|
| Snippet 1:702 | `update_field('current_debt', $total_debt, $dist_id)` | **kept** — this is canonical recalc inside `b2b_recalculate_debt()` itself |
| Snippet 2:1055 | confirm_bill fallback | refuse → reply customer + log CRITICAL + return |
| Snippet 2:1154 | cancel_approve fallback | chain via `b2b_debt_subtract()` first |
| Snippet 2:2063 | refund fallback | chain via `b2b_debt_subtract()` first |
| Snippet 2:3034 | slip_payment fallback | ABORT + push_to_admin alert + log |
| Snippet 2:4064 | BO cancel fallback | chain via `b2b_debt_subtract()` first |
| Snippet 3:3110 | LIFF combined slip fallback | refuse → push_to_admin |
| Snippet 3:3115 | LIFF combined slip fallback | refuse → push_to_admin |
| Manual Invoice:607 | reverse_debt fallback | chain → WP_Error 503 if missing |
| Manual Invoice:1433 | invoice_edit fallback | revert total_amount + WP_Error 503 |
| Manual Invoice:1525 | _do_issue fallback | refuse → WP_Error 503 (and reorder per H4) |
| Manual Invoice:1599 | record_payment fully-paid fallback | chain via `b2b_debt_subtract` first |

### HIGH-H1 — Snippet 5 Shadow FSM (line 613-628)

**Before**: 14-state hardcoded `$valid_transitions` array — included non-existent `ready_to_ship` + `pending`, missing BO states `pending_stock_review` + `partial_fulfilled`.

**After**: defers to `B2B_Order_FSM::can_transition($tid, $st, 'admin')` (Snippet 14 canonical). Returns 503 if FSM class not loaded.

### HIGH-H2 — `b2b_rest_confirm_order` no whitelist (Snippet 5:217)

**After**: validates `$st` against `b2b_allowed_statuses()` AND checks `B2B_Order_FSM::can_transition()` before applying. Returns 400 if either check fails, 503 if FSM missing.

### HIGH-H4 — Manual Invoice `_dinoco_inv_do_issue` Race (line 1486-1513)

**Before order**:
```
b2b_set_order_status('awaiting_payment')
update_field('is_billed', true)
b2b_debt_add()  ← if fails, rollback both above
```

Race: between is_billed=true write and debt_add, another process could read stale debt + double-issue.

**After order**:
```
if (!function_exists('b2b_debt_add')) return WP_Error 503  // fail loud
$result = b2b_debt_add()  ← FIRST: atomic credit gate
if ($result === false) return WP_Error 'credit_exceeded'
update_field('is_billed', true)              // only after success
b2b_set_order_status('awaiting_payment')     // only after success
```

### HIGH-H5 — `dinoco_inv_reverse_debt` Direct Write Fallback (line 595-611)

**After**: 3-tier chain `b2b_recalculate_debt()` → `b2b_debt_subtract()` → `WP_Error('debt_helper_missing', 503)`. No silent corruption path.

### HIGH-H14 — Manual Invoice 4 Direct Debt Fallbacks

All replaced with same fail-loud pattern as H5. See table under CRIT-C3 for site-by-site summary.

---

## Files Touched + Versions

| File | Old | New |
|------|-----|-----|
| `[B2B] Snippet 16: Backorder System` | V.1.15 | **V.2.0** (major bump — atomic flow change) |
| `[B2B] Snippet 5: Admin Dashboard` | V.32.5 | **V.33.0** |
| `[Admin System] DINOCO Manual Invoice System` | V.33.8 | **V.34.0** |
| `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator` | V.34.11 | **V.34.12** |
| `[B2B] Snippet 3: LIFF E-Catalog REST API` | V.42.3 | **V.42.4** |

PHP lint pass: 5/5 files (verified with `php -l` after wrapping with `<?php`).

---

## Test Plan

### Unit / Manual

1. **bo-split happy path**: create order → place_order → admin opens BO modal → split SKU_A 5 fulfilled / 3 BO → submit
   - Expected: stock subtracted only for 5, bo_queue row inserted with qty_bo=3, debt added = 5 × dealer_price, status → partial_fulfilled, undo_deadline = now+10min
   - Verify: `SELECT current_debt FROM wp_postmeta WHERE post_id=<dist_id> AND meta_key='current_debt'` = previous + 5 × price

2. **bo-split failure mid-loop** (simulate by setting credit_limit < expected debt for last SKU):
   - Expected: `compensate()` runs → all stock returns + debt reversed + bo_queue rows deleted → 403 credit_exceeded
   - Verify: stock + debt unchanged from pre-call

3. **bo-undo-split**: split → undo within 10min
   - Expected: stock restored, bo_queue cleared, debt recalculated = 0, status → pending_stock_review

4. **bo-fulfill happy path**: split → restock → admin clicks fulfill on BO row
   - Expected: stock subtracted for BO qty, debt added = qty × dealer_price, bo_queue row → 'fulfilled', if all resolved → awaiting_confirm

5. **bo-fulfill concurrent click** (open 2 admin tabs, click fulfill in both):
   - Expected: first wins, second gets 409 `invalid_bo_row_phase2` (FOR UPDATE detects already mutated)

6. **C2 fail-loud**: deactivate Snippet 1 → reload Admin Dashboard → expect admin_notice + b2b_log line

7. **H1/H2 FSM gate**: try POST `/b2b/v1/update-status` with `status='nonexistent_state'` → expect 400 (whitelist reject); try `status='completed'` from `awaiting_payment` (FSM rejects) → expect 400 (FSM block)

8. **H4 reorder**: create distributor with credit_limit=1000, debt=900 → issue manual invoice ฿200 → expect WP_Error 'credit_exceeded' BEFORE is_billed flip; verify `is_billed=false` and order_status='draft' post-call

9. **H5 fail-loud**: deactivate Snippet 13 → cancel a billed manual invoice → expect WP_Error 503 'debt_helper_missing'

### Regression Guards

- REG-026/027 (V.33.5 OOS gate hierarchy) — should still pass
- BO V.1.6 happy path (Phase A-D regression suite) — re-run

---

## Rollback Procedure

### Per-File Rollback (granular)

If a specific fix causes issue, revert single file via git:

```bash
git log --oneline "[B2B] Snippet 16: Backorder System"
git checkout <prev-hash> -- "[B2B] Snippet 16: Backorder System"
git commit -m "rollback: revert Snippet 16 V.2.0 → V.1.15"
git push origin main
```

WP Sync will re-deploy on push (DB_ID matching).

### Full Wave-1 Rollback

```bash
# Identify the wave-1 commit hash from `git log --oneline | head -5`
git revert -m 1 <wave-1-hash>
git push origin main
```

### Emergency Switch (no redeploy)

C1 BO endpoints have **no feature flag** — rollback requires code revert. C2/C3/H1/H2/H4/H5/H14 fixes are **fail-louder than before** but don't change happy-path behavior — if Snippet 1+13+14 are loaded (production assumption), zero functional difference. If incidents arise → check b2b_log for `[CRITICAL]` lines indicating canonical helper missing → re-activate snippets in correct order: Snippet 14 (FSM) → Snippet 13 (Debt) → Snippet 1 (Core) → others.

### Compensation Failure Recovery

If `bo-split` or `bo-fulfill` mid-mutation crashes AND compensation closure fails (network partition, DB deadlock during compensate), audit trail is in:
- `b2b_log` lines tagged `[BO] bo-split compensation triggered` / `[BO] bo-fulfill compensation triggered`
- `wp_postmeta._b2b_split_at` + `_b2b_split_undo_deadline` (split records)
- `wp_dinoco_bo_queue` table (BO records)
- `wp_postmeta._debt_audit_log` (debt mutations)
- `wp_dinoco_stock_transactions` table (stock changes)

Cross-reference these to manually reconcile.

---

## Out of Scope (deferred to Wave 2-4)

- **C4** Manual Invoice slip `trans_ref` dedup — Wave 2 (slip pipeline convergence)
- **C5** `record_payment` race (no FOR UPDATE) — Wave 2
- **C6** `_inv_slip_ref` TOCTOU — Wave 2
- **C7** Manual Transfer Tool nonce — Wave 3
- **H3** Slip Monitor `log_insert` post-unlock — Wave 2
- **H6** Slip pipeline drift consolidation — Wave 2
- **H7** `verify_slip_combined` `$slip_amount` underflow — Wave 2
- **H8** Slip2Go API idempotency — Wave 2
- **H9-H13** Inventory + Admin Dashboard mobile + audit — Wave 3
- All MEDIUM/LOW — Wave 4

---

## Constraints Honored

- ✅ Did not touch slip pipeline code paths (Wave 2 territory) except for Snippet 2:3034 + Snippet 3:3110/3115 fallback removal — these are debt mutation fallbacks, not slip-verify logic
- ✅ Did not touch `dinoco_stock_*` direct writes (Wave 3 territory)
- ✅ No architecture refactor — only fixes per audit findings
- ✅ All edits are backward compatible (pre-conditions stricter, success path unchanged)
- ✅ DB_ID + version headers preserved
