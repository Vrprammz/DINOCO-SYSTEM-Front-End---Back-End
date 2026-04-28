# Phase 4d Applied — FSM Transitions Through Transaction Wrapper

**Date**: 2026-04-24
**Phases context**: Phase 1 (`46ecb5b`) + Phase 1.5 (`9264de2`) + Phase 2 (`4553e61`) + Phase 3 (`2a5a466`) + Phase 4a/e/f deployed earlier.
**Scope**: Pillar 2 continuation — Wave-style migration of B2B + B2F FSM transitions to route through `dinoco_transaction()` wrapper. Adds parent audit row + per-target GET_LOCK + correlation_id linkage on top of existing Phase 1.5 in-body audit hooks.

---

## Summary

| # | Work item | File touched | Old → New |
|---|-----------|--------------|-----------|
| 1 | B2B FSM `B2B_Order_FSM::transition()` wrapped | `[B2B] Snippet 14: Order State Machine` | V.1.7 → **V.1.8** |
| 2 | B2F FSM `B2F_Order_FSM::transition()` wrapped | `[B2F] Snippet 6: Order State Machine`   | V.1.6 → **V.1.7** |

PHP lint: 2/2 pass.

---

## Pattern (B2B FSM as canonical example)

### Before (V.1.7)

`B2B_Order_FSM::transition()` was a single ~100-line method:
- Read current status via `get_field('order_status', $order_id)`
- 3 reject paths (terminal, invalid, permission_denied) — each with Phase 1.5 audit_log emit
- Success path: `update_field('order_status', ...)` + status_history postmeta + Phase 1.5 audit_log + `do_action('b2b_order_status_changed', ...)`
- No outer lock — concurrent admin clicks on same order could race

### After (V.1.8)

```php
public static function transition( $order_id, $new_status, $actor = 'system', $reason = '' ) {
    if ( function_exists( 'dinoco_transaction' ) && (int) $order_id > 0 ) {
        return self::_transition_via_wrapper( $order_id, $new_status, $actor, $reason );
    }
    return self::_transition_legacy( $order_id, $new_status, $actor, $reason );
}

private static function _transition_via_wrapper( $order_id, $new_status, $actor, $reason ) {
    $txn_ctx = array(
        'audit_event_type' => 'b2b_fsm_transition',
        'actor_type'       => (string) $actor,
        'target_type'      => 'order',
        'target_id'        => (string) $order_id,
        'lock_key'         => 'b2b_fsm_order_' . (int) $order_id,
        'lock_timeout'     => 3,
        'audit_context'    => array(
            'new_status' => (string) $new_status,
            'reason'     => (string) $reason,
        ),
    );
    $txn_phases = array(
        'mutate' => function( $ctx ) use ( $order_id, $new_status, $actor, $reason ) {
            $res = self::_transition_legacy( $order_id, $new_status, $actor, $reason );
            if ( $res === true ) {
                return array( 'ok' => true, 'order_id' => (int) $order_id, 'new_status' => (string) $new_status );
            }
            return $res; // WP_Error passthrough
        },
    );
    $result = dinoco_transaction( 'b2f_fsm_transition', $txn_phases, $txn_ctx );
    return is_wp_error( $result ) ? $result : true;
}

private static function _transition_legacy( $order_id, $new_status, $actor = 'system', $reason = '' ) {
    // V.1.7 body unchanged — Phase 1.5 audit_log calls preserved inside
    // ... ~95 LOC of validation + reject paths + update_field + history + audit + do_action
}
```

B2F FSM (`B2F_Order_FSM::transition()`) follows the identical pattern — only the lock key (`b2f_fsm_po_<id>`), audit event type (`b2f_fsm_transition`), and context flag (`fsm => 'b2f'`) differ.

---

## Lock Strategy

| FSM | Lock key | Timeout | Granularity rationale |
|-----|----------|---------|------------------------|
| B2B | `b2b_fsm_order_<order_id>` | 3s | Per-order. Concurrent admin clicks on same order serialize; unrelated orders proceed in parallel. Does NOT block `b2b_fin_<dist_id>` financial mutations (BO split/fulfill use that namespace). |
| B2F | `b2f_fsm_po_<po_id>` | 3s | Per-PO. Same reasoning — Maker LIFF + Admin LIFF can act on different POs simultaneously. |

3-second timeout matches the typical FSM transition latency budget (single `update_field` + 2 audit rows + 1 do_action). Longer timeout would be wasteful since FSM mutations are O(1) DB writes.

---

## Why No Compensation Closure

The mutate phase in both FSMs is **single `update_field('order_status'/'po_status', ...)`** followed by sequential post-update writes (history postmeta, audit row, `do_action`). There is no multi-step state mutation that could leave a partial state on mid-failure:
- If `update_field` fails → no status change, no compensation needed
- If history postmeta write fails after status change → status update is the source of truth; postmeta is logging-only
- If `do_action` listener throws → wrapper's outer try/catch catches at MUTATE level → emits `success=0` audit + returns `WP_Error('txn_fatal')`. The transition still happened (irreversible by design — FSM transitions ARE the source of truth) but downstream listeners may be incomplete. This is identical to V.1.7 behavior — Phase 4d does not regress.

Compensation closure left empty (omitted from `$txn_phases`).

---

## Audit Chain Integrity

Before V.1.7 had ONE audit row per transition (event=`fsm_transition`, child level).
After V.1.8 has TWO rows per transition through the wrapper:

1. **Parent row** (wrapper-emitted by `_dinoco_txn_audit`):
   - `event_type='b2b_fsm_transition'` (or `b2f_fsm_transition`)
   - `target=order:<id>` / `target=po:<id>`
   - `actor_type=$actor`, `success=1` on happy path
   - `context={ txn_name, new_status, reason }`
   - Shares same `request_id` with child via `dinoco_obs_get_request_id()` injected by wrapper

2. **Child row** (in-body Phase 1.5 emit, unchanged from V.1.7):
   - `event_type='fsm_transition'`
   - `delta_before=$current_status`, `delta_after=$new_status`
   - `context={ actor_type, reason }`

Forensic queries continue to work the same way:
```sql
-- Child only (Phase 1.5 source of truth — preserved)
SELECT * FROM wp_dinoco_audit_log
 WHERE event_type='fsm_transition' AND target_id='6266' ORDER BY id ASC;

-- Parent + child for one transition (Phase 4d adds this dimension)
SELECT * FROM wp_dinoco_audit_log
 WHERE request_id='7a3f...' AND target_id='6266' ORDER BY id ASC;
```

Reject paths (terminal_state / invalid_transition / permission_denied) retain Phase 1.5 child-only emit — wrapper's mutate returns `WP_Error`, wrapper emits parent row with `success=0` + the same error code → 2 rows, both `success=0`, fully traceable.

---

## Behavior Parity

| Aspect | V.1.7 | V.1.8 (wrapper path) | V.1.8 (legacy fallback) |
|--------|-------|----------------------|-------------------------|
| `transition()` signature | unchanged | unchanged | unchanged |
| Return type (`true` on success) | `bool` | `bool` (mapped from `array`) | `bool` |
| Return type (rejection) | `WP_Error` | `WP_Error` | `WP_Error` |
| 3 reject paths | Phase 1.5 child audit | Phase 1.5 child audit + wrapper parent (success=0) | Phase 1.5 child audit (no wrapper) |
| `update_field` execution | direct | inside mutate closure | direct |
| `_b2b_status_history` postmeta | written | written | written |
| `do_action('b2b_order_status_changed')` | fires | fires (inside mutate, before wrapper notify) | fires |
| `b2b_log` debug line | written | written | written |
| Lock | NONE | `GET_LOCK('b2b_fsm_order_<id>', 3)` | NONE |
| Audit rows per transition | 1 child | 1 child + 1 parent | 1 child |

Callers (Snippet 2, 3, 5, 16, Manual Invoice, etc.) call `B2B_Order_FSM::transition()` or `b2b_transition_order()` — both unchanged contract.

---

## Test Plan

### Functional

| # | Scenario | Expected |
|---|----------|----------|
| T1 | B2B order `awaiting_confirm` → `awaiting_payment` (customer confirm bill) | Returns `true`. wp_dinoco_audit_log: 1 row event=`b2b_fsm_transition` (parent, success=1) + 1 row event=`fsm_transition` (Phase 1.5 child). Same `request_id`. `do_action` listeners fire. |
| T2 | B2F PO `confirmed` → `delivering` (maker confirm) | Returns `true`. Audit: 1 parent `b2f_fsm_transition` + 1 child `fsm_transition` (context.fsm='b2f'). |
| T3 | Concurrent transition same order (2 admin tabs click "ยืนยัน") | First wins → `true`. Second blocks ≤3s on `GET_LOCK('b2b_fsm_order_6266', 3)` then either succeeds (if first finished) OR gets `WP_Error('txn_lock_busy', '429')`. |
| T4 | Transition with permission_denied (customer tries paid→packed) | Returns `WP_Error('permission_denied')`. Audit: 1 parent `b2b_fsm_transition` (success=0, error_msg='permission_denied') + 1 child `fsm_transition` (success=0). |
| T5 | Invalid transition (e.g. cancelled→paid) | Returns `WP_Error('invalid_transition')`. Audit: 2 rows success=0. |
| T6 | Disable Transaction Wrapper snippet, run T1 again | Falls through to `_transition_legacy`. Returns `true`. Audit: only Phase 1.5 child row (parent missing — wrapper not loaded). |
| T7 | `transition($order_id=0, ...)` (defensive guard) | Routes to `_transition_legacy` (wrapper guard requires `(int) $order_id > 0`). Returns `WP_Error('invalid_transition')` from legacy validation. |
| T8 | B2F kill switch `define('B2F_DISABLED', true)` | Snippet 6 returns early at file load → `B2F_Order_FSM` undefined. Calls would fatal — same as V.1.6. No regression. |

### Backward Compat Regression

| # | Scenario | Expected |
|---|----------|----------|
| R1 | All Snippet 2/3/5/16 callers of `b2b_transition_order` | Unchanged — public API preserved |
| R2 | `B2B_Order_FSM::can_transition()` + `available_transitions()` + `is_terminal()` | Unchanged — Phase 4d only touched `transition()` |
| R3 | `_b2b_status_history` postmeta forensic queries | Unchanged — written by `_transition_legacy` body |
| R4 | Manual Invoice + BO Split callers (which themselves use wrapper for outer txn) | Nested wrapper calls — outer `bo_split` lock=`b2b_fin_<dist_id>` does NOT conflict with inner `b2b_fsm_order_<id>` lock (different lock namespaces). Both audit rows emit with same `request_id`. |
| R5 | Wrapper failure in mid-transition (e.g. lock_busy) | Wrapper returns `WP_Error('txn_lock_busy', 429)` to caller. No partial state — `update_field` never executed. |

---

## Files Touched + Versions

| File | Old | New | Lint |
|------|-----|-----|------|
| `[B2B] Snippet 14: Order State Machine` | V.1.7 | **V.1.8** | ✓ |
| `[B2F] Snippet 6: Order State Machine`   | V.1.6 | **V.1.7** | ✓ |

PHP lint: 2/2 pass via `(echo '<?php'; cat $file) | php -l`.

---

## Rollback Procedure

### Per-snippet (granular, no redeploy)

If wrapper-routing causes issues:
1. **Disable Transaction Wrapper snippet** via WP admin (Code Snippets UI)
2. Both V.1.8 / V.1.7 detect `dinoco_transaction` missing → fall through to `_transition_legacy`
3. Behavior identical to V.1.7 / V.1.6 — only audit chain loses parent rows; child rows continue

### Full Phase 4d rollback (git)

```bash
git log --oneline | grep "Phase 4d"
git revert -m 1 <phase-4d-hash>
git push origin main
```

### Emergency switch (no redeploy)

Disable Transaction Wrapper snippet → both FSMs fall back legacy. No data corruption risk — wrapper is stateless.

---

## Constraints Honored

- ✅ Round 2 audit fixes preserved (Wave 1-4 atomic + FSM hardening untouched in body)
- ✅ Phase 1, 1.5, 2, 3, 4a/e/f preserved (Module Registry + Audit Log + Health Monitor + Cron Registry + Config Layer + earlier wrapper migrations untouched)
- ✅ FSM transition tables (`self::$transitions`) unchanged — no new states, no new transitions
- ✅ Phase 1.5 in-body `dinoco_audit_log` calls preserved verbatim
- ✅ `_b2b_status_history` + `_b2f_status_history` postmeta dual-write preserved
- ✅ `do_action('b2b_order_status_changed')` + `do_action('b2f_order_status_changed')` fire timing preserved (inside mutate, before wrapper's optional notify)
- ✅ FSM caller signatures unchanged — Snippet 2/3/5/16, Manual Invoice, B2F Snippet 2/3/4 untouched
- ✅ `function_exists('dinoco_transaction')` guard + `(int) $id > 0` guard for safety
- ✅ Both files PHP-lint clean
- ✅ DB_ID + version headers preserved/bumped

---

## Phase 4d Status

✅ COMPLETE — Both FSM transition methods route through `dinoco_transaction()` wrapper when available. Parent + child audit chain operational with shared `request_id`. Per-target lock granularity prevents concurrent transition races without blocking unrelated transitions.

Next: Phase 4 sprint continues with remaining migration candidates (slip_image hot path, Manual Invoice issue lifecycle, B2F receive flow). FSM Wave (Phase 4d) closed.
