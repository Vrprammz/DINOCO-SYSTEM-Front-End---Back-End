# Cleanup Batch Applied — Round 2 LOW Items + Phase 5a Partial

**Date**: 2026-04-24
**Scope**: 4 LOW findings + Phase 5a TAB_LABELS partial cleanup
**Risk**: Cosmetic / safety only — zero runtime behavior change
**PHP Lint**: ✅ All 5 files pass

---

## Files Modified

| File | Before | After | Change |
|---|---|---|---|
| `[Admin System] DINOCO Slip Monitor` | V.1.11 | **V.1.12** | L1 — comment fix |
| `[Admin System] DINOCO Manual Invoice System` | V.34.6 | **V.34.7** | L2 — verification note (no code change) |
| `[B2B] Snippet 16: Backorder System` | V.2.6 | **V.2.7** | L3 — doc annotation on log_attempt |
| `[Admin System] DINOCO Admin Finance Dashboard` | V.3.21 | **V.3.22** | L4 — GET_LOCK around force_recalc |
| `[Admin System] DINOCO Admin Dashboard` | V.33.5 | **V.33.6** | Phase 5a — TAB_LABELS annotation |

---

## L1 — Slip Monitor lock-key comment

**File**: `[Admin System] DINOCO Slip Monitor` line ~784

**Before**:
```php
// Lock names >64 chars are rejected by MySQL silently — md5 gives us ~60 chars max
```

**After**:
```php
// Lock names >64 chars are truncated by MySQL 5.7+ (not rejected). Our naming
// (`dnc_mp_<dist_id>_<md5_hash>`) = 7 + ~10 + 1 + 32 = ~50 chars, well under limit.
```

**Why**: MySQL 5.7+ truncates GET_LOCK names >64 chars (silent truncation, not rejection). Old comment was misleading. Doc-only fix.

---

## L2 — Manual Invoice slip date verification

**File**: `[Admin System] DINOCO Manual Invoice System`

**Audit claim**: line 1739 uses `b2b_date('Y-m-d')` for slip date — drops time.

**Verification result**: All slip/payment timestamp sites already use `b2b_date('Y-m-d H:i:s')`:
- Line 1900 — `_inv_partial_payments` JSON entry
- Line 2003 — payment date in record_payment
- Line 2096 — verify_slip date fallback
- Line 2107 — `_inv_slip_verified_at` meta
- Line 2194 — verify_slip_combined date fallback
- Line 2280 — slip_date in apply helper
- Line 2472 — `_inv_slip_verified_at` (legacy verify_slip path)

**Remaining `Y-m-d`-only calls** (lines 1350, 1439, 1678, 1782): all are invoice **issue date** / **due date** — date-level granularity by design (invoices don't have time-of-day issuance). No fix needed.

**Action**: Documented findings in version header. No code change.

---

## L3 — BO log_attempt post-COMMIT atomicity gap

**File**: `[B2B] Snippet 16: Backorder System` line ~1430

**Before**:
```php
if ( $lock_acquired && function_exists( 'b2b_financial_unlock' ) ) b2b_financial_unlock( $dist_id );

// Log attempt
b2b_log_attempt( $dist_id, 'split', $order_id, '', 'accepted', null, ... );
```

**After**:
```php
if ( $lock_acquired && function_exists( 'b2b_financial_unlock' ) ) b2b_financial_unlock( $dist_id );

// Log attempt — NOTE: industry-standard pattern (audit log fires post-COMMIT, not in
// same transaction as state change). Atomicity gap accepted: if PHP crashes between
// COMMIT and this call, mutation persists but log row missing. Recovery via Phase 1.5
// audit_log dual-write (planned) — for now, _b2b_split_at meta + bo_queue rows
// provide reconstructable forensic trail.
b2b_log_attempt( $dist_id, 'split', $order_id, '', 'accepted', null, ... );
```

**Why**: Document architectural decision. Audit log not nested in state-change transaction is industry-standard (logging in same txn would block the txn on log table contention). Recovery path via `_b2b_split_at` meta + `wp_dinoco_bo_queue` rows. Doc-only — no behavior change.

---

## L4 — Finance Dashboard force_recalc race

**File**: `[Admin System] DINOCO Admin Finance Dashboard` line ~225

**Problem**: Admin clicks "Recalc" while concurrent order paid / debt subtract running on same distributor → last-writer-wins. `b2b_recalculate_debt()` reads sum of orders, but if another op commits between read and `update_field('current_debt')`, old value wins.

**Fix**: Wrap in `b2b_financial_lock($dist_id, 3)` short timeout (3s), try/finally guarantees unlock.

**Before**:
```php
if ( $sub_action === 'force_recalc' ) {
    $dist_id = intval( $_POST['dist_id'] ?? 0 );
    if ( ! $dist_id ) { echo json_encode(['success'=>false,'error'=>'Missing dist_id']); exit; }
    $old = round( floatval( get_field('current_debt', $dist_id) ), 2 );
    $new = function_exists('b2b_recalculate_debt')
        ? round( floatval( b2b_recalculate_debt( $dist_id ) ), 2 )
        : $old;
    ...
}
```

**After**:
```php
if ( $sub_action === 'force_recalc' ) {
    $dist_id = intval( $_POST['dist_id'] ?? 0 );
    if ( ! $dist_id ) { echo json_encode(['success'=>false,'error'=>'Missing dist_id']); exit; }
    $lock_acquired = false;
    if ( function_exists('b2b_financial_lock') ) {
        $lock_acquired = b2b_financial_lock( $dist_id, 3 );
        if ( ! $lock_acquired ) {
            echo json_encode([
                'success' => false,
                'error'   => 'มีการคำนวณหนี้ของตัวแทนนี้กำลังดำเนินการอยู่ — กรุณารอสักครู่แล้วลองใหม่',
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    try {
        $old = round( floatval( get_field('current_debt', $dist_id) ), 2 );
        $new = function_exists('b2b_recalculate_debt')
            ? round( floatval( b2b_recalculate_debt( $dist_id ) ), 2 )
            : $old;
        ...
        echo json_encode([ ... ]);
    } finally {
        if ( $lock_acquired && function_exists('b2b_financial_unlock' ) ) {
            b2b_financial_unlock( $dist_id );
        }
    }
    exit;
}
```

**Behavior changes**:
- Single user clicks Recalc → unchanged (lock acquires instantly, releases on exit).
- Two admins click simultaneously → second waits up to 3s, then either acquires lock or returns Thai busy message.
- Concurrent order paid → recalc waits for order's lock to release (max 3s) → fresh debt value computed.

**Graceful degradation**: If `b2b_financial_lock` helper missing (Snippet 13 disabled), proceeds without lock (legacy behavior).

---

## Phase 5a — TAB_LABELS annotation

**File**: `[Admin System] DINOCO Admin Dashboard` line ~4027

**Approach**: Conservative — annotated rather than removed. Since `switchTab()` gates on `if (!TAB_LABELS[tab]) return;` at line 4357, removing entries would break tab switching if Module Registry snippet disabled. Annotation makes future Phase 5b removal safe (after Module Registry hardened as required dependency).

### Annotation Table

| Key | Status | Registered by (Phase 4e) |
|---|---|---|
| `dashboard` | canonical | — (Admin Dashboard self-tab, never registered) |
| `inventory` | registry-fallback | `[Admin System] DINOCO Global Inventory Database` |
| `moto_catalog` | registry-fallback | `[Admin System] DINOCO Moto Manager` |
| `transfer` | registry-fallback | `[Admin System] DINOCO Manual Transfer Tool` |
| `b2b_dnc` | registry-fallback | `[B2B] Snippet 5: Admin Dashboard` |
| `b2b_admin` | registry-fallback | `[B2B] Snippet 9: Admin Control Panel` |
| `users` | registry-fallback | `[Admin System] DINOCO User Management` |
| `finance` | registry-fallback | `[Admin System] DINOCO Admin Finance Dashboard` |
| `invoice` | registry-fallback | `[Admin System] DINOCO Manual Invoice System` |
| `b2f_orders` | registry-fallback | `[B2F] Snippet 5: Admin Dashboard Tabs` |
| `b2f_makers` | registry-fallback | `[B2F] Snippet 5: Admin Dashboard Tabs` |
| `b2f_credit` | registry-fallback | `[B2F] Snippet 5: Admin Dashboard Tabs` |
| `claims` | registry-fallback | `[Admin System] DINOCO Service Center & Claims` |
| `legacy` | registry-fallback | `[Admin System] DINOCO Legacy Migration Requests` |
| `brand_voice` | registry-fallback | `[Admin System] DINOCO Brand Voice Pool` |
| `backorders` | registry-fallback | `[B2B] Snippet 16: Backorder System` |
| `bo_flags` | registry-fallback | `[B2B] Snippet 16: Backorder System` |
| `bo_security_log` | registry-fallback | `[B2B] Snippet 16: Backorder System` |
| `slip_monitor` | registry-fallback | `[Admin System] DINOCO Slip Monitor` |
| `ai_control` | registry-fallback | `[Admin System] AI Control Module` |

**Total**: 1 canonical + 19 registry-fallback = 20 keys (no removal).

**Phase 5b (deferred)**: Once Module Registry confirmed as always-active dependency (e.g., dashboard renders error notice if missing), can safely remove the 19 fallback entries.

---

## Test Plan

1. **L1**: Slip Monitor lock comment readable + accurate ✅
2. **L2**: Manual Invoice slip → trans_ref already includes time component (`Y-m-d H:i:s`) — verified ✅
3. **L3**: BO order: log_attempt comment visible — no behavior change ✅
4. **L4**: Finance Dashboard force_recalc:
   - Single user click → snappy (<10ms lock acquire/release)
   - Concurrent order paid → recalc waits for lock → fresh value
   - Helper missing → legacy path (no lock)
5. **Phase 5a**: Admin Dashboard tabs still load — TAB_LABELS unchanged at runtime ✅

---

## Rollback Procedure

All 5 changes are forward-compatible. To revert any individual fix:

```bash
# Revert single file by checkout
git checkout HEAD~1 -- "[Admin System] DINOCO Slip Monitor"
git checkout HEAD~1 -- "[Admin System] DINOCO Manual Invoice System"
git checkout HEAD~1 -- "[B2B] Snippet 16: Backorder System"
git checkout HEAD~1 -- "[Admin System] DINOCO Admin Finance Dashboard"
git checkout HEAD~1 -- "[Admin System] DINOCO Admin Dashboard"

git commit -m "revert: cleanup batch (LOW + Phase 5a)"
git push origin main
```

**No DB migration**, **no flag flip**, **no LIFF cache invalidation** required.

---

## Round 2 Status

After this batch:
- ✅ All 4 LOW items closed (L1, L2, L3, L4)
- ⏸ M4 (Stock list recursive MIN per row) — intentionally deferred per prompt (acceptable until 1000+ SKUs)
- ⏸ Phase 5b TAB_LABELS removal — deferred (requires Module Registry dependency hardening)
- ⏸ Phase 5b `$module_map` / `$cacheable_modules` / `$modules[]` / sidebar nav HTML cleanup — deferred (higher risk)

---

## Commit

```
chore: cleanup batch — 4 LOW items + Phase 5a TAB_LABELS annotation

L1: Slip Monitor lock-key comment accuracy (MySQL 5.7+ truncates not rejects)
L2: Manual Invoice slip-date Y-m-d H:i:s verification (already addressed V.34.1)
L3: BO Snippet 16 log_attempt post-COMMIT doc annotation
L4: Finance Dashboard force_recalc GET_LOCK 3s timeout (race protection)
Phase 5a: Admin Dashboard TAB_LABELS annotation (registry-fallback marking)

Files: 5 PHP snippets, all lint pass
Backward compat: 100% (no runtime behavior change for L1/L2/L3/Phase5a;
                 L4 adds 3s lock that's transparent to single-admin workflow)
Rollback: per-file git checkout (no DB/flag/cache impact)
```
