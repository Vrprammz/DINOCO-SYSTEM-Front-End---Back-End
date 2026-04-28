# Wave 2 Applied — Slip Pipeline Convergence

**Date**: 2026-04-28 (audit Round 2 remediation)
**Scope**: 9 fixes from `MASTER-FINDINGS-ROUND-2.md` (3 CRIT + 4 HIGH + 2 MED)
**Files**: 4 PHP snippets, all PHP-lint clean
**Approach**: Per `feedback_push_batch.md` — single batched commit
**Baseline**: Wave 1 commit `780e9c0` (debt mutation atomic helpers shipped)

---

## Fixes Applied (9/9)

### CRIT-C4 — Manual Invoice slip missing trans_ref dedup

**Before** (Manual Invoice V.34.0):
- `verify_slip` (line 1712-1753) and `verify_slip_combined` (1757-1907) both called Slip2Go → received `trans_ref` → went straight to `record_payment` without checking if the same `trans_ref` had been seen before.
- Snippet 2 V.34.11 had `b2b_slip_is_trans_ref_seen()` guard. Manual Invoice didn't call it.
- Replay window: a slip with status `awaiting_payment` could be re-verified against the same invoice → over-credit on partial payments.

**After** (Manual Invoice V.34.1):
- Both endpoints now check `b2b_slip_is_trans_ref_seen($ref)` BEFORE record_payment.
- On hit → `WP_Error('duplicate_slip', ..., 409)`.
- Helper missing → fail loud with `b2b_log('[CRITICAL] ... no_dedup_helper ...')`.

### CRIT-C5 — `record_payment` race condition (no FOR UPDATE)

**Before** (Manual Invoice V.34.0 line 1604):
```php
$paid_so_far = floatval(get_post_meta($id, '_inv_paid_amount', true)); // unlocked read
$new_paid = round($paid_so_far + $amount, 2);                          // unlocked compute
update_post_meta($id, '_inv_paid_amount', $new_paid);                  // unlocked write
```
Concurrent admin clicks → both read same `paid_so_far` → second overwrites first → lost payment.

**After** (Manual Invoice V.34.1):
```php
$wpdb->query('START TRANSACTION');
try {
    // FOR UPDATE locks (mirror record_refund pattern at line 1657+)
    $wpdb->get_row(... FOR UPDATE on _inv_paid_amount postmeta row ...);
    $wpdb->get_row(... FOR UPDATE on _inv_slip_ref postmeta row ...);
    $wpdb->get_row(... FOR UPDATE on wp_posts row ...);

    // re-check status under lock (caller may have raced)
    if (status !== 'awaiting_payment') ROLLBACK + return error
    // re-check overpayment under lock
    if (amount > remaining + 0.01) ROLLBACK + return error

    $new_paid = paid_so_far + amount
    update_post_meta(_inv_paid_amount)
    update_post_meta(_inv_partial_payments)  // M3: array_slice(-50)
    if (fully_paid) b2b_set_order_status('paid')
    COMMIT
} catch (Throwable) ROLLBACK + return WP_Error 500
```
Concurrent calls now serialize on the postmeta row lock.

### CRIT-C6 — `_inv_slip_ref` TOCTOU stamp before commit

**Before** (Manual Invoice V.34.0 lines 1740-1748 + 1853-1860):
```php
update_post_meta($id, '_inv_slip_ref', $ref);   // ← stamped
update_post_meta($id, '_inv_slip_verified_at', ...);
$fake_req = ...; dinoco_inv_rest_record_payment($fake_req);  // ← if THIS fails (e.g. status changed),
// stamp persists. Forensic dedup query meta_query(_inv_slip_ref) returns false-positive.
```

**After** (Manual Invoice V.34.1):
- `verify_slip`: stamps `_inv_slip_ref` + `_slip_trans_ref` inside its OWN transaction (FOR UPDATE on the meta row first), then calls `record_payment` (which itself uses FOR UPDATE on the same row → serializes correctly).
- `verify_slip_combined`: stamping is delegated to `b2b_slip_apply_to_invoices()` (Snippet 1 V.34.13) which performs stamp + payment write inside one atomic block per invoice.

### HIGH-H3 — Slip Monitor log_insert post-unlock dedup hole

**Before** (Slip Monitor V.1.5 lines 700-735):
```php
} catch (Throwable $e) { ROLLBACK + RELEASE_LOCK + return error }
$wpdb->get_var(... RELEASE_LOCK ...);   // ← line 711, lock released
// log_insert HERE = AFTER release
$log_id = b2b_slip_log_insert([..., result_status='manual_admin_paid', trans_ref=>$ref]);
```
Window between RELEASE_LOCK (line 711) and INSERT commit (line 715-735): concurrent caller can probe `b2b_slip_is_trans_ref_seen()` → reads slip_log table → trans_ref not yet committed → dedup miss → double process.

**After** (Slip Monitor V.1.6):
- `$log_id = 0` declared before try-block (so post-release LINE notify still has access).
- `b2b_slip_log_insert()` block MOVED inside try-block, AFTER `b2b_recalculate_debt()` and BEFORE the try-block's implicit close.
- `RELEASE_LOCK` now executes AFTER the log_insert commits its own atomic INSERT.
- Catch-block still releases lock on Throwable.

### HIGH-H6 — Slip pipelines drift (extract shared helper)

**Before**: Two parallel slip-apply implementations:
1. Manual Invoice `verify_slip_combined` (lines 1849-1908): inline `foreach` + `update_post_meta(_inv_slip_ref)` + `record_payment` per invoice.
2. Snippet 2 `b2b_handle_slip_image` (V.34.12 lines 2887-3210): LINE-bot path with manual_mode/B2B mode Flex variants + `b2b_auto_mark_paid_after_slip` (group_id-based FIFO).

Drift: Manual Invoice missed CRIT-C4 dedup that Snippet 2 had. Logic divergence = security regressions slip into one path only.

**After**:
- NEW shared helper `b2b_slip_apply_to_invoices($slip_data, $invoices, $context)` in Snippet 1 V.34.13. Single dedup point, single atomic transaction wrapper, single record_payment pattern. Returns `{success, paid_invoices[], remaining, overpaid, error_code, error_msg}`.
- Manual Invoice `verify_slip_combined` REFACTORED to use shared helper (replaces 60-line inline foreach loop).
- Snippet 2 `b2b_auto_mark_paid_after_slip` retains its body in V.34.13 (annotated as Wave 4+ migration target). It already uses the shared dedup gate (`b2b_slip_is_trans_ref_seen`) and shared debt helper (`b2b_debt_subtract`) — drift is removed at the security-critical layer (dedup + debt mutation). LINE-bot specific Flex/LIFF UI logic remains in Snippet 2 to avoid disrupting bot UX in this batch.

### HIGH-H7 — `verify_slip_combined` `$slip_amount` underflow

**Before** (Manual Invoice V.34.0 lines 1849-1851):
```php
foreach ($matched as $inv) {
    $pay_amount = min($inv['remaining'], $slip_amount);
    $slip_amount -= $pay_amount;     // ← can drift to small negative on rounding
    update_post_meta(...); record_payment(...);
}
```
No `if ($slip_amount <= 0) break` — relies on `min()` to short-circuit but on rounding errors `$slip_amount` can become tiny negative → next iteration computes negative `$pay_amount`.

**After**:
- Inside `b2b_slip_apply_to_invoices()` helper: `if ($remaining_slip <= 0.01) break;` at top of loop AND after subtract.
- `$slip_amount0` preserved as immutable copy in caller for response payload.

### HIGH-H8 — Slip2Go API no idempotency key

**Before**: Both Manual Invoice endpoints called `wp_remote_post($api_url, ...)` with no idempotency token. WP retry on timeout = 2 verification credits for same slip + Slip2Go rate-limit risk.

**After**:
- NEW `b2b_slip_get_cached_response_by_url($slip_url)` and `b2b_slip_set_cached_response_by_url(...)` helpers in Snippet 1 V.34.13.
- 5-minute transient cache keyed on `SHA-256(slip_url)`.
- `verify_slip` + `verify_slip_combined` now check cache BEFORE wp_remote_post; populate cache on HTTP 200.
- `from_cache` flag exposed in response payload for observability.

### MED-M2 — `verify_slip_combined` ownership validation

**Before** (Manual Invoice V.34.0 lines 1793-1798): `array_filter` filtered by `$pending` (already filtered by `$dist_id`), but if admin passed `manual_ids` from another distributor → silently dropped. Forensic audit gap.

**After**:
- Added explicit DB-level ownership check before filter:
```php
foreach ($manual_ids as $mid) {
    $owner = intval(get_post_meta($mid, '_dist_post_id', true));
    if ($owner !== $dist_id) {
        return WP_Error('invoice_not_owned', "พบใบแจ้งหนี้ที่ไม่ได้เป็นของตัวแทนนี้: #$mid", 400);
    }
}
```

### MED-M3 — `_inv_partial_payments` unbounded growth

**Before** (Manual Invoice V.34.0 line 1585-1589): `array_push` without cap.

**After**:
- `record_payment` (Manual Invoice V.34.1): `if (count($payments) > 50) $payments = array_slice($payments, -50);` — keep last 50 entries.
- `b2b_slip_apply_to_invoices` helper (Snippet 1 V.34.13): same cap inside helper.

---

## Files Touched + Versions

| File | Old | New |
|------|-----|-----|
| `[B2B] Snippet 1: Core Utilities & LINE Flex Builders` | V.34.12 | **V.34.13** (added 3 helpers: `b2b_slip_apply_to_invoices`, `b2b_slip_get_cached_response_by_url`, `b2b_slip_set_cached_response_by_url`) |
| `[Admin System] DINOCO Manual Invoice System` | V.34.0 | **V.34.1** (record_payment atomic + verify_slip + verify_slip_combined refactored to shared helper) |
| `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator` | V.34.12 | **V.34.13** (doc-only annotation — no behavior change) |
| `[Admin System] DINOCO Slip Monitor` | V.1.5 | **V.1.6** (log_insert moved inside lock window) |

PHP lint pass: 4/4 files (verified with `php -l` after wrapping with `<?php`).

---

## Test Plan

### Unit / Manual

#### CRIT-C4 dedup gate
1. Create manual invoice ฿1000 → admin verifies slip ref=`ABC123` → invoice → paid.
2. Replay same slip URL → expect `WP_Error('duplicate_slip', 409, 'สลิปนี้เคยใช้แล้ว ref=ABC123')`.
3. Verify slip with new trans_ref against same invoice → still works (status would be `paid` so different error path, but dedup gate not blocking).

#### CRIT-C5 record_payment race
1. Open 2 browser tabs as admin → both navigate to same draft manual invoice ฿1000 → both have status `awaiting_payment`.
2. Both tabs click "Record Payment ฿500" simultaneously.
3. Expected: first wins, second gets either:
   - `WP_Error 400 invalid` (status flipped to `paid` or transitional)
   - `WP_Error 400 overpayment` (FOR UPDATE serializes; second sees `paid_so_far=500` → `remaining=500` → if amount=฿500 OK, paid_so_far=1000, fully_paid=true)
4. Verify: `_inv_paid_amount` = correctly summed (NEVER 500 when both clicks succeeded; should be 1000).

#### CRIT-C6 stamp atomicity
1. Verify slip via `verify_slip` endpoint → mock `record_payment` to throw mid-transaction (e.g., set credit_limit=0).
2. Expected: `_inv_slip_ref` is NOT stamped post-rollback.
3. Forensic query `meta_query(_inv_slip_ref=ABC123)` returns 0 — no false-positive.

#### HIGH-H3 log_insert race
1. Open Slip Monitor admin tool with valid amount + trans_ref.
2. Click "Manual Process" twice rapidly (within 200ms).
3. Expected: first wins, second gets `409 transref_seen_inlock`.
4. With V.1.5 there was a window where second could pass — V.1.6 closes it.

#### HIGH-H6 shared helper backward compat
1. Snippet 2 `b2b_handle_slip_image` LINE-bot path: send slip image to bot → still creates `paid_tickets` array correctly via `b2b_auto_mark_paid_after_slip`.
2. Manual Invoice `verify_slip_combined` admin path: select 3 pending invoices + verify slip → `paid_invoices` matches helper return.
3. Both paths share dedup gate (verify by clearing slip_log + replaying → both reject as duplicate).

#### HIGH-H7 slip_amount underflow
1. Verify combined slip ฿1000.50 against 3 invoices summing ฿1000.50.
2. Expected: all 3 paid, no negative `pay_amount` on iteration 4 (loop breaks at iter 3).

#### HIGH-H8 Slip2Go cache
1. Verify slip URL `https://example.com/slip1.jpg` → Slip2Go API called → cache populated.
2. Within 5 min, verify same URL again → cache HIT (no API call) → response `from_cache=true`.
3. Wait 5 min → cache expires → next call hits API again.

#### MED-M2 ownership validation
1. Admin Dist A's invoice IDs `[1, 2, 3]`. Admin Dist B's invoice IDs `[4, 5]`.
2. POST to `/verify-slip-combined?dist_id=A&invoice_ids=[1,2,5]`
3. Expected: `WP_Error('invoice_not_owned', 400, 'พบใบแจ้งหนี้ที่ไม่ได้เป็นของตัวแทนนี้: #5')`.

#### MED-M3 partial_payments cap
1. Manual invoice with 60 partial payments recorded.
2. Inspect `_inv_partial_payments` → should have 50 entries (last 50, oldest 10 dropped).

### Regression Guards

- REG-026/027 (V.33.5 OOS gate hierarchy) — should still pass
- BO V.1.6 happy path (Phase A-D regression suite) — re-run
- LINE-bot slip happy path (Snippet 2 V.34.12) — byte-identical behavior expected (annotation only)

---

## Rollback Procedure

### Per-File Rollback (granular)

If a specific fix causes issue, revert single file via git:

```bash
git log --oneline "[Admin System] DINOCO Manual Invoice System"
git checkout <prev-hash> -- "[Admin System] DINOCO Manual Invoice System"
git commit -m "rollback: revert Manual Invoice V.34.1 → V.34.0"
git push origin main
```

WP Sync will re-deploy on push (DB_ID matching).

### Full Wave-2 Rollback

```bash
git revert -m 1 <wave-2-hash>
git push origin main
```

### Emergency Switch (no redeploy)

- Wave 2 fixes are **stricter** than V.34.0 (atomic locks + dedup gates) but happy-path behavior unchanged.
- If Snippet 1 V.34.13 fails to load → Manual Invoice falls through to `WP_Error('helper_missing')` per design. Restore Snippet 1 to V.34.13 sync via Sync Engine.
- If Slip2Go cache misbehaves → `delete_transient('b2b_s2g_url_<hash>')` per URL or wait 5min.
- If `record_payment` deadlocks under high concurrency → MySQL InnoDB will auto-detect + abort one txn; caller gets `WP_Error 500 record_failed` and can retry.

### Compensation Failure Recovery

- `wp_dinoco_slip_log` table is the audit trail. Cross-reference `trans_ref` + `result_status` to manually reconcile any inconsistencies.
- `_inv_slip_ref` postmeta = invoice-side stamp. Should always pair with a `wp_dinoco_slip_log` row of `result_status IN (paid, paid_overpayment, manual_admin_paid)`.

---

## Out of Scope (future waves)

- **Wave 4**: Snippet 2 `b2b_handle_slip_image` migration to shared helper (LINE-bot UI risk; deferred from this batch).
- **Wave 4**: Medium polish files: Snippet 16, Snippet 15, Inventory, LIFF AI, B2F Snippet 5.
- All LOW findings (L1-L4).

---

## Constraints Honored

- ✅ Wave 1 changes preserved — debt fallbacks remain replaced with atomic helper chain.
- ✅ PHP lint pass on all 4 files.
- ✅ No `<?php` tag in snippets.
- ✅ Backward compat — `b2b_auto_mark_paid_after_slip` unchanged in body, only doc annotation added.
- ✅ Atomic boundary preserved — slip → trans_ref dedup → debt subtract → mark_paid → recalc — order maintained.
- ✅ DB_ID + version headers preserved.
- ✅ Single batched commit per `feedback_push_batch.md`.
- ✅ Did not touch inventory atomic ops (Wave 3 territory).
- ✅ Did not touch ops/UX fixes (Wave 3 territory).
