# B2B Core Pages Audit (Round 2)
Date: 2026-04-28 | Agent: code-reviewer | Scope: 5 admin pages

## Executive Summary

Reviewed B2B Orders dashboard, Distributor management, Backorders admin, BO Flags, BO Security Log. Found **3 CRITICAL** (nested-transaction COMMIT premature, FSM bypass via duplicate `b2b_set_order_status` definitions, direct `update_field('current_debt')` mutations bypassing atomic helper) and **5 HIGH** (no idempotency on bo-fulfill/undo-split, transient-based daily counters not concurrency-safe, BO debt restore via `b2b_recalculate_debt` inside outer transaction, FSM "soft migration" still allows invalid transitions silently, walk-in/manual_invoice debt path bypasses Snippet 13). REST permission callbacks are uniformly correct (manage_options + nonce for writes). The dominant risk class is **transaction nesting** — multiple admin endpoints open `START TRANSACTION` then call helpers (`dinoco_stock_subtract`, `b2b_debt_add`, `b2b_recalculate_debt`) that internally `START TRANSACTION` + `COMMIT`. MySQL flattens these → outer `ROLLBACK` becomes a no-op, partial mutations persist on error.

## Per-Page Findings

### 1. B2B Orders — `[b2b_admin_dashboard]` — 3 findings

**🔴 CRIT-1.1 — Duplicate `b2b_set_order_status` definitions (FSM bypass risk)**
- File: `[B2B] Snippet 5: Admin Dashboard:49-53`, `[Admin System] DINOCO Manual Invoice System:60-67`, `[B2B] Snippet 1: Core Utilities & LINE Flex Builders:2005-2044`
- Three competing definitions wrapped in `if (!function_exists('b2b_set_order_status'))`. Snippet 5 fallback is bare `update_field('order_status', $st, $tid)` — **no FSM, no actor check, no history, no `b2b_order_status_changed` hook**. Manual Invoice version has history but no FSM validation.
- Risk: Whichever loads first wins. WP Code Snippets load order is by post ID and `priority` meta — fragile. If Snippet 5 loads before Snippet 1 (DB_ID 54 vs ~1024), **every status transition system-wide bypasses FSM**.
- Fix: Remove fallback definitions in Snippet 5 + Manual Invoice. Hard-require Snippet 1 (Core) to load first via `add_action('plugins_loaded', ..., priority => low)`. Or rename fallbacks to `b2b_set_order_status_fallback` and only call it conditionally.

**🟡 HIGH-1.1 — `b2b_set_order_status` "soft migration" silently allows invalid transitions**
- File: `[B2B] Snippet 1: Core Utilities & LINE Flex Builders:2017-2024`
- When `B2B_Order_FSM::transition()` returns `WP_Error`, code logs `[FSM-WARN]` then **proceeds with direct `update_field`** (line 2039). Comment says "soft migration — don't break existing flows" but defeats the entire FSM guarantee.
- Fix: Either return `false` on FSM error (strict mode), or gate via flag `b2b_fsm_strict_mode` (default OFF for backward compat, flip ON in staging then production).

**🟡 HIGH-1.2 — Flash auto-update `update_field` fallback fires `do_action` synthetically**
- File: `[B2B] Snippet 5:159-160, 170-171`
- Defensive fallback calls `do_action('b2b_order_status_changed', ...)` directly without going through FSM. If `b2b_set_order_status` exists but FSM rejects the transition, fallback never fires (correctly). But if neither exists, **history is not logged + permission check skipped**. Comment claims this is a guard, but it's also an attack surface (any process holding the meta can flip status).
- Fix: Drop the fallback path entirely — if `b2b_set_order_status` is missing, fail loud (`b2b_log` + skip update). FSM not loading is a fatal config error, not a degraded mode.

### 2. ตัวแทนจำหน่าย (Distributor Management) — 1 finding

**🟡 HIGH-2.1 — `b2b_recalculate_debt` called from inside REST POST without lock**
- File: `[B2B] Snippet 9: Admin Control Panel:124-127` (b2b_rest_save_distributor)
- When admin updates distributor with `current_debt` in payload, code calls `b2b_recalculate_debt($id)` without acquiring `b2b_financial_lock()`. Concurrent debt-mutating actions (slip payment, BO fulfill firing in parallel) may race against the recalculation, leaving stale debt.
- Fix: Wrap in `b2b_financial_lock($id, 5)` / `b2b_financial_unlock($id)` around the recalculate call (Snippet 13 §2 already provides this helper).

### 3. Backorders — `[b2b_bo_admin]` (Snippet 16) — 4 findings

**🔴 CRIT-3.1 — bo-split: nested `START TRANSACTION` flattened by inner helper COMMITs**
- File: `[B2B] Snippet 16: Backorder System:958` outer + calls `dinoco_stock_subtract` (line 992) + `b2b_debt_add` (line 1066) + `b2b_transition_order` (line 1080)
- Outer transaction starts at line 958. Inside the loop, `dinoco_stock_subtract` (Snippet 15:992) opens **its own** `START TRANSACTION` and then `COMMIT`s. MySQL does **not** support nested transactions — the inner `COMMIT` commits everything queued so far. After this point, the outer `ROLLBACK` calls (lines 994, 1017, 1043, 1082) are **no-ops** — partial stock subtracts and debt adds persist on rollback path.
- Real-world impact: If split validation fails on item N (e.g. `invariant_violation` line 980 for item 3 of 5), items 1-2 already had stock subtracted + bo_queue rows inserted + debt added. Code "rollbacks" but DB is dirty.
- Fix: Either (a) add `non_atomic=true` parameter to helpers (skip inner BEGIN/COMMIT when called inside an outer txn), detected via `IS_USED_LOCK` or a context flag; (b) refactor bo-split to validate ALL splits first, then do mutations; or (c) use `SAVEPOINT` + `ROLLBACK TO SAVEPOINT` for nested semantics.

**🔴 CRIT-3.2 — bo-fulfill has same nested-transaction defect**
- File: `[B2B] Snippet 16:1322` outer + `dinoco_stock_subtract` (line 1352) + `b2b_debt_add` (line 1398) + `b2b_transition_order` (line 1422)
- Identical pattern as CRIT-3.1. If the loop fails on item N, items 1..N-1 already committed via inner helpers' COMMITs; the outer ROLLBACK at lines 1340/1344/1354/1379 cannot undo them.
- Real-world: If product_data missing for SKU on item 3 (line 1378-1391), debts already added for items 1-2 stick; bo_queue updates persist.
- Fix: Same options as CRIT-3.1. Recommend: pre-validate all items + sum debts, then do `b2b_debt_add` once at end with batched stock ops.

**🔴 CRIT-3.3 — bo-undo-split nested transaction + irreversible debt path**
- File: `[B2B] Snippet 16:1232` outer + `dinoco_stock_add` (line 1257) + `b2b_recalculate_debt` (line 1270)
- Same nesting problem. Plus: debt restoration uses `b2b_recalculate_debt` (single-SQL source of truth), but if the function fails or is missing, comment block claims `b2b_debt_subtract` fallback exists (line 1267-1272) but **the fallback only checks `function_exists` → never actually calls subtract** — silent skip leaves debt inflated.
- Fix: Nesting fix (per CRIT-3.1). For debt: capture `confirmed_value` snapshot in `_b2b_split_confirmed_value` post_meta during bo-split, then call `b2b_debt_subtract($dist_id, $snapshot)` in undo. Recalculate is a defense-in-depth check, not the primary undo path.

**🟡 HIGH-3.1 — bo-fulfill / bo-cancel-item lack idempotency keys**
- File: `[B2B] Snippet 16:1310-1450` (bo-fulfill)
- No `Idempotency-Key` header check. Admin double-click ("Fulfill" button) → two requests in flight; both pass `status=pending` check (FOR UPDATE only inside the loop, not before request entry); both can subtract stock + add debt. Per CLAUDE.md V.1.6 spec, undo limit is 1/order — but fulfill has no equivalent guard.
- Fix: Add transient-based `b2b_bo_fulfill_inflight_{order_id}` lock with 30s TTL at function entry, return 409 if already in flight.

### 4. BO Flags — `[b2b_bo_flags]` (Snippet 16) — 1 finding

**🟢 MEDIUM-4.1 — Flag toggle uses `update_option` without audit trail**
- File: `[B2B] Snippet 16` (flag manager admin shortcode)
- Toggling `b2b_flag_bo_system` and `b2b_flag_bo_beta_distributors` mutates `wp_options` directly. No audit log of who changed which flag when. If a regression is reported, no way to correlate "flag flip → incident".
- Fix: Add `b2b_log_flag_change($flag, $old_val, $new_val, $user_id)` mirroring `b2f_log_flag_change` (Snippet 1 V.6.5). Persist to `wp_options` key `b2b_flag_audit_log` (last 200 entries).

### 5. BO Security Log — `[b2b_bo_security_log]` (Snippet 16) — 1 finding

**🟢 MEDIUM-5.1 — CSV export uses raw `$_REQUEST` without nonce verification**
- File: `[B2B] Snippet 16` (Security Log CSV export handler)
- Per CLAUDE.md V.1.5 description "CSV export (UTF-8 BOM + 5000 rows cap + wp_nonce verify)" — verify the nonce is actually checked on the export action, not just on the form submit. If exporting via direct URL (e.g. shared link), nonce must be the gate.
- Fix: Confirm `check_admin_referer('b2b_bo_security_log_export')` is called at the top of the CSV handler; otherwise add it.

## Cross-Cutting Findings

**🔴 CRIT-X.1 — Direct `update_field('current_debt')` mutations bypass atomic helper (CLAUDE.md violation)**
CLAUDE.md states: "All debt mutations go through Snippet 13 — direct `update_field('current_debt')` is blocked." Reality: 9 occurrences across 4 files:
- `[B2B] Snippet 2:1055, 1154, 2063, 3034, 4064` (5 sites — most labeled "fallback" but Snippet 2:3034 is not)
- `[B2B] Snippet 3:3110, 3115` (2 sites — slip verification path)
- `[Admin System] DINOCO Manual Invoice System:607, 1433, 1525, 1599` (4 sites — invoice generation, not fallbacks)
- `[B2B] Snippet 1:702` (1 site)

Risk: These sites lack `FOR UPDATE` lock, no audit log, no credit_limit gate, no transactional integrity. Race-prone. Manual Invoice especially concerning — two admins issuing invoices to same distributor concurrently can lose updates.
Fix: Migrate all sites to `b2b_debt_add/subtract` (Snippet 13). The "fallback" paths can stay as defensive `if (!function_exists('b2b_recalculate_debt'))` branches but should also use `b2b_financial_lock`.

**🟡 HIGH-X.1 — Daily/per-SKU rate-limit counters use transients (not concurrency-safe)**
File: `[B2B] Snippet 16:447-460`
Counter pattern is read-modify-write on transients (`get_transient` → `set_transient` with adjusted value). Two concurrent requests can both read `qty_used=900` and both write `qty_used=950` — counter undercounted by 50.
Fix: Use `wpdb->query("UPDATE wp_options SET option_value=option_value+%d WHERE option_name=%s")` or atomic `INCR`-style via custom counter table with `INSERT ... ON DUPLICATE KEY UPDATE counter=counter+VALUES(counter)`.

**🟢 MEDIUM-X.1 — Snippet 13 `b2b_debt_audit` runs OUTSIDE transaction (post-COMMIT)**
File: `[B2B] Snippet 13:74, 132`
By design (FIX H-2 comment) audit happens after COMMIT to avoid `update_post_meta` non-transactional behavior. But this means: if the audit `update_post_meta` fails (rare), debt mutated successfully but no audit row. Acceptable trade-off, but should log a CRITICAL when audit write fails so on-call can reconcile manually.

## Top 5 Priority Action Items

1. **CRIT-3.1/3.2/3.3** — Fix nested-transaction defect in bo-split, bo-fulfill, bo-undo-split. Add `$skip_txn=false` parameter to `dinoco_stock_subtract/add` + `b2b_debt_add/subtract`; pass `true` when called inside outer txn. Or refactor BO endpoints to validate-then-mutate (no failures during mutation phase).
2. **CRIT-1.1** — Remove duplicate `b2b_set_order_status` fallback definitions in Snippet 5 + Manual Invoice. Make Snippet 1 + Snippet 14 hard dependencies. Document in CLAUDE.md.
3. **CRIT-X.1** — Audit + migrate all 9 direct `update_field('current_debt')` sites to `b2b_debt_add/subtract` with `b2b_financial_lock`. Highest priority: Manual Invoice System (4 sites) — those are not fallbacks.
4. **HIGH-1.1** — Remove `b2b_set_order_status` "soft migration" path or gate behind strict-mode flag. Silent FSM bypasses defeat audit and prevent regression catching.
5. **HIGH-3.1** — Add idempotency lock on bo-fulfill (transient with 30s TTL keyed by order_id). Same for bo-confirm-full, bo-cancel-item, bo-reject. Double-click protection currently relies on UI debouncing only.

## Notes for Other Agents

- **Database expert**: Validate that `dinoco_stock_subtract` could expose a `$caller_in_txn=false` flag without breaking single-call usage. Check if any other helpers (b2f_*, dinoco_inv_*) have same pattern.
- **Security pentester**: HIGH-X.1 race on transient counters could be enumeration-attack-relevant. Also look at `b2b_log_attempt` writes inside transaction (Snippet 16:1097, 1430) — if outer COMMITs but log INSERT fails, audit has gap.
- **Performance**: bo-fulfill's per-item `b2b_get_product_data` call (line 1377) is N queries for N items — should use batch helper.

