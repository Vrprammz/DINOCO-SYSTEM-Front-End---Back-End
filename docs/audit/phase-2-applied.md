# Phase 2 Applied — Transaction Wrapper Pattern (Pillar 2)

**Date**: 2026-04-24
**Phases context**: Phase 1 (`46ecb5b`) + Phase 1.5 (`9264de2`) + Phase 3 (`2a5a466`) deployed earlier — Phase 2 was deferred to land after Phase 3 since wrapper depends on Audit Log + Observability already-shipped helpers.
**Scope**: Pillar 2 of Backend Architecture Refactor Plan — standardize VALIDATE → LOCK → MUTATE → RECALCULATE → NOTIFY pattern across all financial mutations. This commit ships the wrapper + 2 showcase migrations (NOT bulk migration — Phase 4 will do that).

---

## Wrapper API Spec

### NEW snippet: `[Admin System] DINOCO Transaction Wrapper` V.1.0

```php
/**
 * Execute a transaction with 5-phase pattern + auto audit + auto lock release.
 *
 * @param string $name     Unique txn name (e.g. 'slip_apply', 'bo_split')
 * @param array  $phases   ['validate'=>fn, 'mutate'=>fn(req), 'recalculate'=>fn,
 *                          'notify'=>fn, 'compensate'=>fn]
 * @param array  $context  Initial context — see header for keys
 *
 * @return array|WP_Error  result from mutate phase (WP_Error or array)
 */
function dinoco_transaction( $name, array $phases, array $context = array() );
```

### Phase callbacks

| Phase | Required | Behavior |
|-------|----------|----------|
| `validate` | optional | Pre-checks, may enrich context. Return `WP_Error` to abort BEFORE lock acquire. Array return merged into context. |
| `mutate` | **required** | Atomic state changes via existing helpers (`b2b_debt_subtract`, `dinoco_stock_subtract`, etc). Wrapper does NOT do `START TRANSACTION` — those helpers manage their own atomicity. |
| `recalculate` | optional | Post-mutate source-of-truth recalc. Failure non-fatal but logged loudly. |
| `notify` | optional | Post-COMMIT side effects (LINE/Telegram pushes). Runs OUTSIDE the lock so it cannot block other admin actions. Failure non-fatal. |
| `compensate` | optional | Invoked on mutate `WP_Error` OR thrown exception. Best-effort cleanup; throws are swallowed. |

### Context keys consumed

| Key | Purpose |
|-----|---------|
| `lock_key` (string\|null) | MySQL `GET_LOCK` name. Empty/null = no DB-level lock. |
| `lock_timeout` (int) | seconds, default 5. |
| `audit_event_type` (string) | `dinoco_audit_log` event_type. Defaults to `txn_<name>`. |
| `actor_type` / `target_type` / `target_id` / `amount` | Audit row fields. |
| `audit_context` (array) | Extra payload for audit_log `context_json`. |

### Internal helpers

| Helper | Purpose |
|--------|---------|
| `_dinoco_txn_audit()` | Best-effort audit log emit; never throws. Skipped if `dinoco_audit_log` missing. |
| `_dinoco_txn_compensate_safe()` | Wraps caller's compensate fn in try/catch — error response chain unbroken even if cleanup fails. |
| `_dinoco_txn_log_error()` | Combines `b2b_log` + `dinoco_obs_capture_exception` (Sentry). |

### Design rules (Phase 2 invariants)

1. Wrapper is **ADDITIVE** — never breaks happy path of existing helpers
2. MUTATE composes existing atomic helpers — wrapper does NOT do `START TRANSACTION`
3. NOTIFY runs OUTSIDE the lock
4. Audit log is best-effort post-COMMIT (Phase 1.5 dual-write pattern preserved)
5. Lock release in `finally{}` — guaranteed even on uncaught throw
6. **Backward compat 100%** — `function_exists('dinoco_transaction')` guard in callers

---

## Showcase Migration 1: Slip Apply

**File**: `[B2B] Snippet 1: Core Utilities & LINE Flex Builders` V.34.14 → **V.34.15**

### Before (V.34.14)

`b2b_slip_apply_to_invoices()` was a single 200-line function:
- Pre-loop: amount > 0 + invoices not empty + dedup gate via `b2b_slip_is_trans_ref_seen()`
- Loop per invoice: `START TRANSACTION` + `FOR UPDATE` on 3 meta rows + status re-check + stamp + record_payment + FSM transition + `dinoco_audit_log` per ticket
- No outer correlation_id; audit was per-invoice only; failure paths had ad-hoc logging

### After (V.34.15)

```php
function b2b_slip_apply_to_invoices( $slip_data, $invoices, $context = array() ) {
    if ( function_exists( 'dinoco_transaction' ) ) {
        $txn_ctx = array(
            'audit_event_type' => 'slip_apply',
            'actor_type'       => $context['source'] ?? 'system',
            'target_type'      => $context['dist_id'] ? 'distributor' : '',
            'target_id'        => (string) (int) $context['dist_id'],
            'amount'           => floatval( $slip_data['amount'] ?? 0 ),
            'audit_context'    => array(
                'trans_ref'     => $slip_data['trans_ref'] ?? '',
                'invoice_count' => count( $invoices ),
                'source'        => $context['source'] ?? 'unknown',
            ),
            'lock_key' => '',  // per-invoice FOR UPDATE is the lock primitive
        );
        $txn_phases = array(
            'mutate' => function( $ctx ) use ( $slip_data, $invoices, $context ) {
                return _b2b_slip_apply_to_invoices_inner( $slip_data, $invoices, $context );
            },
        );
        $res = dinoco_transaction( 'slip_apply', $txn_phases, $txn_ctx );
        if ( is_wp_error( $res ) ) {
            // Wrapper-level failure (lock_busy etc) — return shape parity with legacy
            return array(
                'success' => false, 'error_code' => $res->get_error_code(),
                'error_msg' => $res->get_error_message(),
                'paid_invoices' => array(),
                'remaining' => floatval( $slip_data['amount'] ?? 0 ),
                'overpaid' => 0.0,
            );
        }
        return $res;
    }
    return _b2b_slip_apply_to_invoices_inner( $slip_data, $invoices, $context );
}

// Inner extracted as private helper — body identical to V.34.14
function _b2b_slip_apply_to_invoices_inner( $slip_data, $invoices, $context = array() ) {
    // ... 200 lines unchanged ...
}
```

### Notes on Lock Strategy

No outer `GET_LOCK` is used (`lock_key=''`). The slip apply flow already uses **per-invoice FOR UPDATE** on `_inv_paid_amount` + `_inv_slip_ref` + posts row — this is the correct concurrency primitive (allows concurrent admins to settle DIFFERENT invoices in parallel; serializes only same-invoice contention). Adding outer `GET_LOCK` keyed on dist_id would block unrelated invoice payments unnecessarily.

The wrapper's added value here is:
- **Standardized audit row** at slip-apply level (event=`slip_apply`, target=`distributor:<id>`) — complements the per-invoice `event=slip_apply, target=order:<id>` rows from V.34.14
- **Correlation_id** propagated from `dinoco_obs_get_request_id()` — full chain traceable
- **Slow-path log** if elapsed > 2000ms
- **Uniform error code** for wrapper-level failures (currently only `txn_no_mutate` / `txn_lock_busy` / `txn_fatal`)

### Behavior parity

- ✅ Function signature unchanged
- ✅ Return shape unchanged (always `array` with `success/error_code/paid_invoices/remaining/overpaid` keys)
- ✅ Per-invoice FOR UPDATE atomic flow unchanged (still in `_b2b_slip_apply_to_invoices_inner`)
- ✅ V.34.14 per-ticket `dinoco_audit_log` emits unchanged (forensic chain on order_id still works)
- ✅ Manual Invoice + Snippet 2 callers unchanged

---

## Showcase Migration 2: BO Split

**File**: `[B2B] Snippet 16: Backorder System` V.2.1 → **V.2.2**

### Before (V.2.1)

`b2b_rest_bo_split()` had:
- Input validation + status check
- Inline `b2b_financial_lock($dist_id, 5)` acquire
- Phase 1: validate splits (read-only)
- Phase 2: mutate (stock subtract → bo_queue insert → debt_add → FSM transition → meta)
- Compensation closure (best-effort: stock restore + debt reverse + bo_queue delete)
- 8 separate `b2b_financial_unlock()` call sites on every exit branch (success, error, compensation)

### After (V.2.2)

```php
function b2b_rest_bo_split( $request ) {
    $order_id = (int) $request->get_param( 'order_id' );
    $splits   = $request->get_param( 'splits' );
    if ( ! $order_id || ! is_array( $splits ) || empty( $splits ) ) {
        return new WP_Error( 'invalid_input', 'order_id + splits required', array( 'status' => 400 ) );
    }
    $status = get_field( 'order_status', $order_id );
    if ( $status !== 'pending_stock_review' ) {
        return new WP_Error( 'invalid_status', "...", array( 'status' => 400 ) );
    }
    $dist_id = (int) get_field( 'distributor_id', $order_id );

    if ( function_exists( 'dinoco_transaction' ) && $dist_id ) {
        $txn_ctx = array(
            'audit_event_type' => 'bo_split',
            'actor_type'       => 'admin',
            'target_type'      => 'order',
            'target_id'        => (string) $order_id,
            'lock_key'         => 'b2b_fin_' . $dist_id,  // mirrors b2b_financial_lock
            'lock_timeout'     => 5,
            'audit_context'    => array(
                'dist_id'     => $dist_id,
                'split_count' => count( $splits ),
            ),
        );
        $txn_phases = array(
            'mutate' => function( $ctx ) use ( $request, $order_id, $splits, $dist_id ) {
                return _b2b_rest_bo_split_inner( $request, $order_id, $splits, $dist_id );
            },
        );
        return dinoco_transaction( 'bo_split', $txn_phases, $txn_ctx );
    }
    return _b2b_rest_bo_split_legacy( $request, $order_id, $splits );
}

function _b2b_rest_bo_split_legacy( $request, $order_id, $splits ) {
    // V.2.1 behavior: acquire b2b_financial_lock manually, delegate to inner, release.
    $dist_id = (int) get_field( 'distributor_id', $order_id );
    $lock_acquired = false;
    if ( $dist_id && function_exists( 'b2b_financial_lock' ) ) {
        $lock_acquired = b2b_financial_lock( $dist_id, 5 );
        if ( ! $lock_acquired ) {
            return new WP_Error( 'lock_busy', '...', array( 'status' => 429 ) );
        }
    }
    $res = _b2b_rest_bo_split_inner( $request, $order_id, $splits, $dist_id );
    if ( $lock_acquired && function_exists( 'b2b_financial_unlock' ) ) {
        b2b_financial_unlock( $dist_id );
    }
    return $res;
}

function _b2b_rest_bo_split_inner( $request, $order_id, $splits, $dist_id ) {
    // ... 280 lines of V.2.1 body, with ONE change ...
    $lock_acquired = false;  // lock owned by caller — existing branches become no-ops
    // ... rest unchanged: parsed_items + validate phase + mutate phase + compensate ...
}
```

### Notes on Lock Strategy

**Wrapper acquires `GET_LOCK("b2b_fin_<dist_id>", 5)`** — identical primitive to `b2b_financial_lock()`, since:

```php
// Snippet 13 V.2.0:
$lock_name = 'b2b_fin_' . intval( $dist_id );
$wpdb->get_var( $wpdb->prepare( "SELECT GET_LOCK(%s, %d)", $lock_name, $timeout ) );

// dinoco_transaction wrapper:
$wpdb->get_var( $wpdb->prepare( "SELECT GET_LOCK(%s, %d)", $lock_key, $lock_timeout ) );
// where $lock_key = 'b2b_fin_' . $dist_id
```

A `bo_split` invocation and a parallel `slip_apply` from the same `dist_id` will serialize on the same lock name (both via wrapper-acquired GET_LOCK or legacy `b2b_financial_lock`). No semantics change.

### Behavior parity

- ✅ REST handler signature unchanged
- ✅ Response shape unchanged (`{success, order_id, status, fulfilled_total, bo_total, bo_queue_ids, undo_deadline}`)
- ✅ Compensation closure unchanged (stock restore + debt reverse + bo_queue delete)
- ✅ FSM transition (`pending_stock_review → partial_fulfilled`) unchanged
- ✅ Customer notify Flex (`b2b_bo_notify_customer_split`) called on success path
- ✅ Daily counter increment + `b2b_log_attempt` flow unchanged

---

## Test Scenarios

### Functional (manual QA after deploy)

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Slip apply normal flow (1 invoice) | Behavior identical to V.34.14. Audit log emits 2 rows: per-ticket (V.34.14) + slip_apply orchestration row (V.34.15). |
| T2 | Slip apply duplicate trans_ref | Returns `{success:false, error_code:'duplicate_slip'}` — NO mutation. NO audit row at slip-apply level (validation rejection is quiet). Per-invoice `record_payment` not called. |
| T3 | BO split normal flow | Behavior identical to V.2.1. Audit log row event=`bo_split` target=`order:<id>` actor=admin. |
| T4 | BO split lock contention (2 admin tabs click split) | First wins. Second gets `WP_Error('txn_lock_busy', 'ระบบกำลังประมวลผลรายการอื่น...')` → HTTP 429. Audit log row event=`bo_split` success=0 error_msg='lock_timeout'. |
| T5 | BO split with stock_subtract WP_Error mid-mutation | Compensation closure fires (stock restore + bo_queue delete). Wrapper returns the WP_Error from inner mutate. Audit row success=0 error_msg=mutate error. Lock released in finally{}. |
| T6 | BO split with thrown exception in inner | Wrapper catches, runs compensate, audit row success=0, returns `WP_Error('txn_fatal', ...)`. Lock released. |
| T7 | Disable Transaction Wrapper snippet → BO split | Falls through to `_b2b_rest_bo_split_legacy` which acquires `b2b_financial_lock` directly. V.2.1 behavior preserved. |
| T8 | Disable Transaction Wrapper snippet → slip apply | Falls through to `_b2b_slip_apply_to_invoices_inner` directly. V.34.14 behavior preserved. |
| T9 | Audit chain forensic query | `dinoco_audit_chain('order', $oid)` shows: slip_apply per-ticket (V.34.14) + bo_split (V.2.2) + FSM transitions (Phase 1.5). Same `request_id` in all rows from one HTTP request. |

### Backward compat regression

| # | Scenario | Expected |
|---|----------|----------|
| R1 | Phase 1.5 audit hookup `dinoco_audit_log` per-ticket | Still emits inside `_b2b_slip_apply_to_invoices_inner` — unchanged |
| R2 | Per-invoice FOR UPDATE atomic flow | Unchanged |
| R3 | `b2b_financial_lock` direct callers (Snippet 16 bo-fulfill, bo-undo-split) | Untouched in this commit — still call `b2b_financial_lock`/`b2b_financial_unlock` directly. Phase 4 will migrate. |
| R4 | Manual Invoice `verify_slip_combined` calling `b2b_slip_apply_to_invoices` | Unchanged — uses public function which now routes through wrapper |
| R5 | Snippet 2 LINE bot slip handler (line 3673 area) | Unchanged — does not yet use shared helper (Wave 4+ migration deferred) |

---

## Phase 4 Migration Template (future migrations)

Sites identified as good candidates for `dinoco_transaction()` migration in Phase 4:

| Site | Current Pattern | Wrapper Benefit |
|------|----------------|-----------------|
| `b2b_rest_bo_fulfill` (Snippet 16:1426) | manual `b2b_financial_lock` + try/catch + 5 unlock branches | Standardize lock + audit + correlation_id |
| `b2b_rest_bo_undo_split` (Snippet 16:1541) | manual lock + try/catch + 6 unlock branches + compensation | Same as above; reduce LOC by ~30% |
| `b2b_rest_bo_confirm_full` (Snippet 16:1310) | no lock currently — single FSM transition | Add audit row + correlation_id |
| `b2b_handle_slip_image` (Snippet 2 V.34.11+) | inline lock + dedup + per-invoice atomic | High value — currently has 200 LOC of lock/audit boilerplate |
| `b2b_debt_add` / `b2b_debt_subtract` (Snippet 13) | already atomic via `FOR UPDATE` | LOW value — already audit-hookable; skip |
| `dinoco_stock_add` / `dinoco_stock_subtract` (Snippet 15) | already atomic via `FOR UPDATE` per SKU | LOW value — already audit-hookable; skip |
| Manual Invoice `verify_slip_combined` | inline + delegates to `b2b_slip_apply_to_invoices` | Already covered transitively via slip_apply migration |
| Manual Invoice `_dinoco_inv_do_issue` | manual debt_add + status set + meta flip | Medium value — issue payable creation lifecycle |
| B2F Snippet 7 `b2f_payable_add/subtract` | atomic via FOR UPDATE | LOW value — already atomic; skip |

### Migration template

```php
function ${original_function}( $request ) {
    // 1. Cheap input validation (no lock needed)
    $oid = (int) $request->get_param('order_id');
    if ( ! $oid ) return new WP_Error('invalid_input', '...', ['status' => 400]);

    // 2. Resolve resource (for lock_key + audit target)
    $dist_id = (int) get_field('distributor_id', $oid);

    // 3. Route via wrapper if available
    if ( function_exists('dinoco_transaction') && $dist_id ) {
        $txn_ctx = array(
            'audit_event_type' => '${event_name}',
            'actor_type'       => 'admin',
            'target_type'      => '${type}',
            'target_id'        => (string) $oid,
            'lock_key'         => 'b2b_fin_' . $dist_id,  // or other resource lock
            'lock_timeout'     => 5,
            'audit_context'    => array( /* extra payload */ ),
        );
        $txn_phases = array(
            'validate' => function( $ctx ) use ( /* params */ ) { /* return WP_Error or array */ },
            'mutate'   => function( $ctx ) use ( /* params */ ) { /* return WP_Error or success array */ },
            'compensate' => function( $ctx, $err ) use ( /* params */ ) { /* best-effort restore */ },
            // 'recalculate' => optional — for source-of-truth recalc post-mutate
            // 'notify' => optional — for LINE/Telegram pushes (runs outside lock)
        );
        return dinoco_transaction( '${name}', $txn_phases, $txn_ctx );
    }

    // 4. Fallback: legacy path (preserves pre-Phase-2 behavior)
    return _${name}_legacy( $request );
}
```

### Phase 4 estimated effort

- bo-fulfill + bo-undo-split + bo-confirm-full: ~3h (similar to bo-split)
- b2b_handle_slip_image migration: ~4h (LINE bot path is hot — extra QA)
- Others: 1-2h each

---

## Files Touched + Versions

| File | Old | New | Lint |
|------|-----|-----|------|
| **NEW** `[Admin System] DINOCO Transaction Wrapper` | — | **V.1.0** | ✓ |
| `[B2B] Snippet 1: Core Utilities & LINE Flex Builders` | V.34.14 | **V.34.15** | ✓ |
| `[B2B] Snippet 16: Backorder System` | V.2.1 | **V.2.2** | ✓ |

PHP lint: 3/3 pass.

---

## Rollback Procedure

### Per-snippet rollback (granular)

If wrapper itself causes issues:
```bash
# Disable the wrapper snippet via WP admin (Code Snippets UI) — instant revert
# Both Snippet 1 V.34.15 and Snippet 16 V.2.2 detect dinoco_transaction missing
# and fall through to legacy paths (V.34.14 / V.2.1 behavior).
```

If a specific showcase migration causes issues:
```bash
git log --oneline "[B2B] Snippet 1: Core Utilities & LINE Flex Builders"
git checkout <prev-hash> -- "[B2B] Snippet 1: Core Utilities & LINE Flex Builders"
git commit -m "rollback: revert Snippet 1 V.34.15 → V.34.14"
git push origin main
```

### Full Phase 2 rollback

```bash
# Identify Phase 2 commit hash
git log --oneline | grep "Phase 2"
git revert -m 1 <phase-2-hash>
git push origin main
```

### Emergency switch (no redeploy)

1. **Disable Transaction Wrapper snippet** via WP admin → both showcase sites fall back to legacy paths
2. **No data corruption risk** — wrapper is stateless; all mutations go through unchanged inner helpers regardless of wrapper presence
3. **Audit log integrity** — `dinoco_audit_log` calls in Phase 1.5 (per-ticket, per-FSM-transition) continue uninterrupted; only the wrapper-level orchestration audit row goes silent

### Compensation Failure Recovery (BO split)

Inherited from V.2.0 — see `wave-1-applied.md`. Compensation closure logs to `b2b_log` with `[BO] bo-split compensation triggered` tag. Cross-reference:
- `wp_postmeta._b2b_split_at` + `_b2b_split_undo_deadline`
- `wp_dinoco_bo_queue` table
- `wp_postmeta._debt_audit_log`
- `wp_dinoco_stock_transactions` table
- `wp_dinoco_audit_log` table (Phase 1.5+ unified)

---

## Constraints Honored

- ✅ Round 2 audit fixes preserved (Wave 1-4 atomic + FSM hardening untouched)
- ✅ Phase 1, 1.5, 3 work preserved (Module Registry + Audit Log + Health Monitor + Cron Registry + Config Layer)
- ✅ 19 admin modules untouched
- ✅ Slip apply + BO split user-perspective behavior identical (signature + return shape + status codes)
- ✅ No refactor outside scope — Manual Invoice + Slip Monitor + Snippet 13 + Snippet 14 untouched
- ✅ `function_exists('dinoco_transaction')` guard in both showcase callers
- ✅ All 3 modified files PHP-lint clean
- ✅ DB_ID + version headers preserved/bumped
