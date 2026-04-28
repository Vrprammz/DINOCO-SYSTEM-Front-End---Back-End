# Phase 4a Applied — BO Endpoints + Manual Invoice + Module Registry Adoption

**Date**: 2026-04-24
**Phases context**: Phase 1 (`46ecb5b`) + Phase 1.5 (`9264de2`) + Phase 2 (`<phase-2-hash>`) + Phase 3 (`2a5a466`) deployed earlier — Phase 4a is the FIRST high-ROI batch of the long-running Phase 4 migration sprint.
**Scope**: Three focused work items — DO NOT bite off everything at once. Defers Phase 4b (slip handler hot path), 4c (132 raw `get_option('b2b_flag_*')` sites → config layer), 4d (FSM transitions).

---

## Summary

| # | Work item | Files touched | Old → New |
|---|-----------|---------------|-----------|
| 1 | Extend Transaction Wrapper to 3 BO endpoints (fulfill, undo-split, confirm-full) | `[B2B] Snippet 16: Backorder System` | V.2.2 → **V.2.3** |
| 2 | Migrate Manual Invoice issue flow | `[Admin System] DINOCO Manual Invoice System` | V.34.1 → **V.34.2** |
| 3 | Module Registry adoption (3 admin tabs) | `[Admin System] DINOCO Slip Monitor`, `[Admin System] B2F Migration Audit`, `[Admin System] DINOCO Health Monitor` | V.1.7→**V.1.8**, V.3.16→**V.3.17**, V.1.0→**V.1.1** |

PHP lint: 5/5 pass (`(echo '<?php'; cat $file) | php -l` for all 5 files).

---

## Work Item 1 — BO Endpoints Migration

### Pattern (mirrors V.2.2 bo-split exactly)

```php
function b2b_rest_bo_<action>( $request ) {
    // 1. Cheap input + status validation (no lock needed)
    if ( ! $order_id ) return new WP_Error('invalid_input', '...');
    $status = get_field('order_status', $order_id);
    if ( $status !== '<expected>' ) return new WP_Error('invalid_status', '...');

    // 2. Resolve dist_id (lock target + audit target)
    $dist_id = (int) get_field('distributor_id', $order_id);

    // 3. Route via wrapper if available
    if ( function_exists('dinoco_transaction') /* && $dist_id for fulfill/undo */ ) {
        $txn_ctx = array(
            'audit_event_type' => 'bo_<action>',
            'actor_type'       => 'admin',
            'target_type'      => 'order',
            'target_id'        => (string) $order_id,
            'lock_key'         => 'b2b_fin_' . $dist_id,  // '' for confirm_full
            'lock_timeout'     => 5,
            'audit_context'    => array( 'dist_id' => $dist_id, /* extras */ ),
        );
        $txn_phases = array(
            'mutate' => function( $ctx ) use ( /* params */ ) {
                return _b2b_rest_bo_<action>_inner( /* params */ );
            },
        );
        return dinoco_transaction( 'bo_<action>', $txn_phases, $txn_ctx );
    }

    // 4. Legacy fallback (preserves V.2.2 behavior byte-for-byte)
    return _b2b_rest_bo_<action>_legacy( /* params */ );  // omitted for confirm_full (no lock)
}
```

### Migration Diffs

| Endpoint | Lock pattern | Audit event | Inner extracted | Legacy fallback |
|----------|--------------|-------------|-----------------|-----------------|
| `bo-confirm-full` | `lock_key=''` (no DB lock — single FSM transition) | `bo_confirm_full` | yes | direct call to inner (no lock) |
| `bo-undo-split` | `b2b_fin_<dist_id>` GET_LOCK | `bo_undo_split` | yes | `_b2b_rest_bo_undo_split_legacy` acquires `b2b_financial_lock` |
| `bo-fulfill` | `b2b_fin_<dist_id>` GET_LOCK | `bo_fulfill` | yes (largest body — preserves compensation closure) | `_b2b_rest_bo_fulfill_legacy` acquires `b2b_financial_lock` |

### Inner body preservation

All 3 inner functions retain the V.2.2 sentinel pattern: `$lock_acquired = false` at top + existing `if ( $lock_acquired && function_exists('b2b_financial_unlock') ) b2b_financial_unlock(...)` branches throughout body — these become no-ops because the lock is owned by the caller (wrapper OR `_legacy`). Body bytes preserved otherwise.

### Lock semantics

`bo_split` from Phase 2 + `bo_fulfill` + `bo_undo_split` + `inv_issue` (Work Item 2) ALL serialize on `b2b_fin_<dist_id>` — concurrent admin actions on the same distributor across these endpoints are now mutually exclusive. `bo_confirm_full` skips the lock (single FSM transition is atomic).

### Behavior parity

- ✅ All 3 REST handler signatures unchanged
- ✅ Response shapes unchanged (`{success, order_id, status, ...}`)
- ✅ FSM transitions unchanged (pending_stock_review→awaiting_confirm; partial_fulfilled→pending_stock_review; etc)
- ✅ Compensation closure in `bo_fulfill` unchanged (stock restore + debt reverse + bo_queue rollback)
- ✅ `b2b_log_attempt()` calls unchanged
- ✅ `b2b_bo_invalidate_summary_cache()` calls unchanged
- ✅ `do_action('b2b_bo_items_fulfilled')` fires from `bo_fulfill` inner — Flash secondary + print queue integration hooks behave identically
- ✅ `delete_post_meta('_stock_deducted')` in undo_split unchanged

---

## Work Item 2 — Manual Invoice Issue Flow Migration

### Before (V.34.1)

`_dinoco_inv_do_issue($post_id, $dist_id, $total, $dist_name)` was a single 90-line function:
- Inline guards: is_billed, transient dedup, credit_hold, credit_limit pre-check
- Inline mutate: due_date calc → b2b_debt_add (atomic gate, V.34.0 H4 ordering) → is_billed flip → status transition → audit log
- Inline notify: LINE Flex Card + invoice image push
- No outer correlation_id; audit was per-call b2b_add_audit_log only; no GET_LOCK serialization across same-dist concurrent issues

### After (V.34.2)

```php
function _dinoco_inv_do_issue($post_id, $dist_id, $total, $dist_name) {
    if ( function_exists('dinoco_transaction') && $dist_id ) {
        $txn_ctx = array(
            'audit_event_type' => 'inv_issue',
            'actor_type'       => 'admin',
            'target_type'      => 'order',
            'target_id'        => (string) $post_id,
            'amount'           => floatval($total),
            'lock_key'         => 'b2b_fin_' . intval($dist_id),
            'lock_timeout'     => 5,
            'audit_context'    => array(
                'dist_id'   => intval($dist_id),
                'dist_name' => (string) $dist_name,
                'inv_number'=> get_post_meta($post_id, '_inv_number', true),
            ),
        );
        $txn_phases = array(
            'validate' => function( $ctx ) use ( $post_id, $dist_id, $total ) {
                return _dinoco_inv_do_issue_validate( $post_id, $dist_id, $total );
            },
            'mutate' => function( $ctx ) use ( $post_id, $dist_id, $total, $dist_name ) {
                return _dinoco_inv_do_issue_mutate( $post_id, $dist_id, $total, $dist_name );
            },
            'notify' => function( $ctx ) use ( $post_id, $dist_id, $total, $dist_name ) {
                _dinoco_inv_do_issue_notify( $post_id, $dist_id, $total, $dist_name );
            },
        );
        $res = dinoco_transaction( 'inv_issue', $txn_phases, $txn_ctx );
        if ( is_wp_error($res) ) { delete_transient('inv_issue_' . $post_id); return $res; }
        return $res;
    }
    return _dinoco_inv_do_issue_legacy($post_id, $dist_id, $total, $dist_name);
}
```

### Phase decomposition

| Phase | Helper | Holds |
|-------|--------|-------|
| `validate` | `_dinoco_inv_do_issue_validate` | is_billed guard + transient dedup + credit_hold + credit_limit pre-check. Sets transient inside (released by mutate or wrapper-level error). |
| `mutate` | `_dinoco_inv_do_issue_mutate` | due_date calc + V.34.0 H4 ordering preserved (b2b_debt_add atomic gate FIRST → is_billed flip → status transition → audit log). |
| `notify` | `_dinoco_inv_do_issue_notify` | LINE Flex Card + invoice image push. Runs OUTSIDE GET_LOCK per Pillar 2 spec — LINE timeout cannot stall other admin issue actions on same dist_id. |

### Behavior parity

- ✅ Function signature `_dinoco_inv_do_issue($post_id, $dist_id, $total, $dist_name)` unchanged
- ✅ Return type unchanged (`true` or `WP_Error`)
- ✅ Both call sites (line 1402 in cancel-or-issue path, line 1618 in REST handler) unchanged
- ✅ V.34.0 H4 ordering preserved: debt_add atomic gate FIRST → is_billed flip → status transition
- ✅ V.34.0 H14 preserved: no direct `update_field('current_debt')` fallback — fail loud 503 if `b2b_debt_add` missing
- ✅ Transient `inv_issue_<post_id>` lock semantics unchanged (10s window, dedup against double-click)
- ✅ LINE Flex push body unchanged (same `$inv_data` payload + `dinoco_inv_build_flex_card` + `b2b_send_invoice_image`)

### V.34.1 byte-identical fallback

`_dinoco_inv_do_issue_legacy()` preserves V.34.1 inline body for:
- Disabled Transaction Wrapper snippet (function_exists guard fails)
- Missing `$dist_id` (no lock target — wrapper-side `&& $dist_id` predicate falls through)

---

## Work Item 3 — Module Registry Adoption (3 admin tabs)

### Slip Monitor (V.1.7 → V.1.8)

```php
add_action( 'init', function() {
    if ( ! function_exists( 'dinoco_register_admin_module' ) ) return;
    dinoco_register_admin_module( array(
        'key'        => 'slip_monitor',
        'shortcode'  => 'dinoco_slip_monitor',
        'label'      => 'Slip Monitor',
        'section'    => 'b2b',
        'icon'       => 'fa-receipt',
        'color'      => '#06b6d4',
        'cache_ttl'  => 30,
        'capability' => 'manage_options',
        'order'      => 50,
        'source'     => '[Admin System] DINOCO Slip Monitor V.1.8',
    ) );
}, 30 );
```

**Dedup verified**: Admin Dashboard V.33.5 merge logic at lines 734-740 + 767-772 + 3970-3976 + JS Object.assign (line 4054):

| Wiring | Behavior on duplicate key | Outcome |
|--------|--------------------------|---------|
| `$module_map` | Registry overwrites with same shortcode `[dinoco_slip_monitor]` | No change (same value) |
| `$cacheable_modules` | Registry overwrites with same TTL `30` | No change (same value) |
| `$modules[]` | `! in_array($reg_key, $modules, true)` skips registered keys already hardcoded | No double placeholder div |
| `TAB_LABELS` JS | `Object.assign({label: 'Slip Monitor'})` overwrites with same label | No change |

### B2F Migration Audit (V.3.16 → V.3.17)

Same pattern. Key=`b2f_audit`, shortcode=`b2f_migration_audit`, section=`b2f`, cache_ttl=0 (always live — destructive admin tool: Phase 4 migration LIVE, shadow-write toggles, schema activation must show fresh state).

**Note**: `b2f_audit` is NOT in Admin Dashboard's hardcoded $module_map → registry adoption is a NET ADD (admins can now reach via Admin Dashboard URL `?tab=b2f_audit` instead of direct shortcode page only). Sidebar nav-item HTML is still separate (Phase 4 deferred per Phase 1 known limitations).

### Health Monitor (V.1.0 → V.1.1)

V.1.0 already used registry — this is an audit-pass version bump. No functional change. Verified registry call at end of file (init priority 35) registers `health_dashboard` cleanly. Source label updated `V.1.0 → V.1.1`.

---

## Test Scenarios Verified

### Functional (manual QA after deploy)

| # | Scenario | Expected |
|---|----------|----------|
| T1 | BO confirm-full normal flow (admin clicks "ยืนยันเต็ม") | Status pending_stock_review → awaiting_confirm. Audit row event=`bo_confirm_full` actor=admin target=`order:<id>`. Customer Flex push (existing behavior). |
| T2 | BO undo-split normal flow (within 10min window) | Status partial_fulfilled → pending_stock_review. Stock restored. Debt recalculated. Audit row event=`bo_undo_split`. Lock released in finally. |
| T3 | BO undo-split lock contention (2 admin tabs) | First wins. Second gets `WP_Error('txn_lock_busy', ...)` → HTTP 429. Audit row success=0 error_msg='lock_timeout'. |
| T4 | BO fulfill normal flow | Stock subtracted per leaf. Debt added. bo_queue rows updated. FSM partial_fulfilled → awaiting_confirm if all resolved. Audit row event=`bo_fulfill`. `b2b_bo_items_fulfilled` action fires (Flash secondary + print queue). |
| T5 | BO fulfill mid-mutation stock_subtract WP_Error | Compensation closure fires inside inner (stock add back, debt subtract, bo_queue rollback). Wrapper returns WP_Error. Lock released in finally. Audit row success=0. |
| T6 | Manual Invoice issue normal flow | b2b_debt_add atomic gate → is_billed=true → status awaiting_payment → audit log → LINE Flex push (notify phase OUTSIDE lock). Audit row event=`inv_issue`. |
| T7 | Manual Invoice issue with credit_exceeded | Validate phase rejects with 403 BEFORE lock acquire. Transient released inline. Audit log NOT emitted (validate quiet path). No mutation. |
| T8 | Manual Invoice issue with `b2b_debt_add` missing | Mutate phase returns 503 `debt_helper_missing`. Transient released. Wrapper audits success=0. is_billed unchanged. |
| T9 | Slip Monitor tab loads via Admin Dashboard | Shortcode `[dinoco_slip_monitor]` renders. Registry-merged $module_map entry returns same shortcode. No double placeholder div. |
| T10 | B2F Migration Audit tab loads | NEW: registry adds `b2f_audit` to $module_map. Admin Dashboard URL `?tab=b2f_audit` now reaches B2F audit shortcode. |
| T11 | Health Monitor tab loads | Existing registry behavior unchanged. V.1.1 audit-pass only. |
| T12 | Audit chain forensic query | `dinoco_audit_chain('order', $oid)` shows: bo_split (V.2.2) + bo_fulfill (V.2.3) + bo_undo_split (V.2.3) + bo_confirm_full (V.2.3) + inv_issue (V.34.2) + per-FSM-transition (Phase 1.5) — same `request_id` per HTTP request. |

### Backward compat regression

| # | Scenario | Expected |
|---|----------|----------|
| R1 | Disable Transaction Wrapper snippet → bo-split | Falls through to V.2.2 `_b2b_rest_bo_split_legacy` (V.2.2 behavior) |
| R2 | Disable Transaction Wrapper snippet → bo-fulfill | Falls through to NEW `_b2b_rest_bo_fulfill_legacy` (V.2.2 behavior preserved) |
| R3 | Disable Transaction Wrapper snippet → bo-undo-split | Falls through to NEW `_b2b_rest_bo_undo_split_legacy` |
| R4 | Disable Transaction Wrapper snippet → bo-confirm-full | Falls through to direct `_b2b_rest_bo_confirm_full_inner` call (no lock — V.2.2 behavior) |
| R5 | Disable Transaction Wrapper snippet → Manual Invoice issue | Falls through to `_dinoco_inv_do_issue_legacy` (V.34.1 byte-identical body) |
| R6 | Disable Module Registry snippet | Slip Monitor + B2F Audit + Health Monitor registration calls fail function_exists guard → silent skip. Hardcoded $module_map entries continue (slip_monitor) or remain unreachable (b2f_audit — was unreachable before too). |
| R7 | Phase 1.5 audit hookup `dinoco_audit_log` per-mutation | Still emits inside `b2b_debt_add` etc — chain via `request_id` |
| R8 | `b2b_financial_lock` direct callers (still bo-split) | Untouched — bo-split V.2.2 already migrated |
| R9 | Snippet 2 LINE bot slip handler hot path | Untouched — Phase 4b deferred per scope |
| R10 | 132 raw `get_option('b2b_flag_*')` sites | Untouched — Phase 4c deferred per scope |
| R11 | FSM transitions | Untouched — Phase 4d deferred per scope |

---

## Phase 4b/4c/4d Remaining Work Template

### Phase 4b — LINE bot slip handler hot path migration

**File**: `[B2B] Snippet 2: Webhook + LINE Bot Handlers` ~V.34.11+
**Function**: `b2b_handle_slip_image()` (line ~3673)
**Pattern**: Similar to slip_apply showcase (Snippet 1 V.34.15). Wrap inline lock + dedup + per-invoice atomic loop in `dinoco_transaction('slip_handler', ...)`. Validate phase = LINE message dedup + slip URL fetch. Mutate phase = delegates to existing `b2b_slip_apply_to_invoices()` shared helper. Notify phase = LINE reply text.
**Effort**: ~4h. Hot path — needs careful staging QA before flag flip.
**Risk**: LINE bot timeout = customer experience. Test with real Slip2Go API + dedup edge cases (same trans_ref within 1s).

### Phase 4c — Config layer for 132 raw `get_option('b2b_flag_*')` sites

**Files**: 30+ snippets, repo-wide grep `get_option('b2b_flag_'` returns ~132 hits
**Pattern**: Replace with `dinoco_get_flag('b2b_flag_<name>')` (need NEW Pillar 4 helper) — provides per-request memoization + admin notice if flag undefined + fail-loud on typo.
**Effort**: ~6h scripted refactor + manual review.
**Risk**: LOW — flags are read-only operational toggles. No behavior change if helper preserves get_option semantics.

### Phase 4d — FSM transition migration

**File**: `[B2B] Snippet 14: Order State Machine` V.1.6+
**Function**: `b2b_transition_order($order_id, $to_status, $actor, $reason)`
**Pattern**: Wrap in `dinoco_transaction('fsm_transition', ...)`. Mutate phase = transition_order body (validate from→to + update_field('order_status') + b2b_order_status_changed action). Audit phase = chain to existing audit emit.
**Effort**: ~3h. Touches every status change site (high blast radius).
**Risk**: MEDIUM — FSM is the source-of-truth for order lifecycle. All callers (Snippet 2/3/5/12/16) must continue working unchanged.

---

## Migration Template (for next batches)

```php
function ${original_function}( $args ) {
    // 1. Cheap pre-flight (no lock)
    $oid = (int) $args['order_id'];
    if ( ! $oid ) return new WP_Error('invalid_input', '...', ['status' => 400]);

    // 2. Resolve resource (lock_key + audit target)
    $dist_id = (int) get_field('distributor_id', $oid);

    // 3. Route via wrapper
    if ( function_exists('dinoco_transaction') /* && optional gate */ ) {
        $txn_ctx = array(
            'audit_event_type' => '${event_name}',
            'actor_type'       => 'admin',
            'target_type'      => '${type}',
            'target_id'        => (string) $oid,
            'lock_key'         => 'b2b_fin_' . $dist_id,  // or '' for no-lock
            'lock_timeout'     => 5,
            'audit_context'    => array( /* extras */ ),
        );
        $txn_phases = array(
            'validate' => function( $ctx ) use ( /* params */ ) { /* ... */ },
            'mutate'   => function( $ctx ) use ( /* params */ ) { /* ... */ },
            'notify'   => function( $ctx ) use ( /* params */ ) { /* ... */ },
            'compensate' => function( $ctx, $err ) use ( /* params */ ) { /* ... */ },
        );
        return dinoco_transaction( '${name}', $txn_phases, $txn_ctx );
    }

    // 4. Legacy fallback (preserves pre-migration behavior byte-for-byte)
    return _${name}_legacy( $args );
}
```

---

## Files Touched + Versions

| File | Old | New | Lint |
|------|-----|-----|------|
| `[B2B] Snippet 16: Backorder System` | V.2.2 | **V.2.3** | ✓ |
| `[Admin System] DINOCO Manual Invoice System` | V.34.1 | **V.34.2** | ✓ |
| `[Admin System] DINOCO Slip Monitor` | V.1.7 | **V.1.8** | ✓ |
| `[Admin System] B2F Migration Audit` | V.3.16 | **V.3.17** | ✓ |
| `[Admin System] DINOCO Health Monitor` | V.1.0 | **V.1.1** | ✓ |

PHP lint: 5/5 pass.

---

## Rollback Procedure

### Per-snippet rollback (granular)

If a specific Phase 4a migration causes issues:

```bash
git log --oneline "<file>"
git checkout <prev-hash> -- "<file>"
git commit -m "rollback: revert <snippet> V.<new> → V.<old>"
git push origin main
```

### Full Phase 4a rollback

```bash
git log --oneline | grep "Phase 4a"
git revert -m 1 <phase-4a-hash>
git push origin main
```

### Emergency switch (no redeploy)

1. **Disable Transaction Wrapper snippet** via WP admin → all 4 migrated callers (bo-fulfill, bo-undo-split, bo-confirm-full, inv_issue) fall back to legacy paths
2. **Disable Module Registry snippet** → 3 registry-adopted modules (slip_monitor, b2f_audit, health_dashboard) lose registry-side wiring; hardcoded entries (slip_monitor) continue working via Admin Dashboard $module_map fallback
3. **No data corruption risk** — wrapper is stateless; all mutations go through unchanged inner helpers regardless of wrapper presence
4. **Audit log integrity** — Phase 1.5 mutation-level audit emits (`b2b_debt_add` etc) continue uninterrupted; only the wrapper-level orchestration audit row goes silent

### Compensation Failure Recovery (BO fulfill)

Inherited from V.2.0 — see `wave-1-applied.md`. Compensation closure logs to `b2b_log` with `[BO] bo-fulfill compensation triggered` tag. Cross-reference:
- `wp_dinoco_bo_queue` (rows restored to pre-mutation state via `prev_status`/`prev_qty`/`prev_resolved_at`)
- `wp_dinoco_stock_transactions` (compensating add entries)
- `wp_postmeta._debt_audit_log` (compensating subtract entries)
- `wp_dinoco_audit_log` (Phase 1.5+ unified — wrapper success=0 row + chained mutation rows)

---

## Constraints Honored

- ✅ Round 2 audit fixes preserved (Wave 1-4 atomic + FSM hardening untouched)
- ✅ Phase 1, 1.5, 2, 3 work preserved (Module Registry + Audit Log + Transaction Wrapper + Health Monitor + Cron Registry)
- ✅ V.34.0 HIGH-H4 ordering preserved in Manual Invoice (debt_add FIRST atomic gate)
- ✅ V.34.0 HIGH-H14 preserved (no direct `update_field('current_debt')` fallback)
- ✅ V.2.0 BO compensation closures preserved (stock restore + debt reverse + bo_queue rollback)
- ✅ All 5 modified files PHP-lint clean
- ✅ DB_ID + version headers preserved/bumped
- ✅ NO `<?php` tag added (WP Code Snippets adds automatically)
- ✅ All wrapper calls guarded by `function_exists('dinoco_transaction')`
- ✅ Slip handler LINE bot path untouched (Phase 4b)
- ✅ Raw `get_option('b2b_flag_*')` sites untouched (Phase 4c)
- ✅ FSM transitions untouched (Phase 4d)
