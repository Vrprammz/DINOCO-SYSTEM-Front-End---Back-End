# Wave 3 — Operational + UX Fixes Applied

**Date**: 2026-04-24
**Scope**: 1 CRITICAL + 5 HIGH from `MASTER-FINDINGS-ROUND-2.md` Wave 3 lane
**Files touched**: 4 snippets, all PHP-lint clean.
**Commit**: single batch (Wave 1 ran in parallel — no file overlap)

## Summary Table

| ID | Severity | Title | File | Version Bump |
|----|----------|-------|------|--------------|
| C7 | CRIT | Manual Transfer dead (nonce missing) | `[Admin System] DINOCO Manual Transfer Tool` | V.30.2 → V.30.3 |
| H9 | HIGH | `warehouse_stock` subtract asymmetry (no auto-INSERT) | `[B2B] Snippet 15: Custom Tables & JWT Session` | V.8.6 → V.8.7 |
| H10 | HIGH | Transfer doesn't reconcile master `stock_qty` | `[B2B] Snippet 15: Custom Tables & JWT Session` | V.8.6 → V.8.7 |
| H11 | HIGH | Admin Dashboard mobile broken (1 `@media`) | `[Admin System] DINOCO Admin Dashboard` | V.33.3 → V.33.4 |
| H12 | HIGH | `[dinoco_admin_ai_control]` orphaned | `[Admin System] DINOCO Admin Dashboard` | V.33.3 → V.33.4 |
| H13 | HIGH | `mysqldump -p<password>` shell-arg leak | `[Admin System] B2F Migration Audit` | V.3.14 → V.3.15 |

## C7 — Manual Transfer Tool nonce wiring

**Root cause**: `$.post()` payload at lines 209-213 did not include `dinoco_admin_nonce` field. Backend at line 40 enforced `wp_verify_nonce($_POST['dinoco_admin_nonce'], 'dinoco_admin_action')` — every transfer responded "Security token invalid". Feature was non-functional in production despite the UI being reachable. Round-1 audit also flagged this; still unresolved until now.

**Fix**:
1. Generate nonce per shortcode render (`wp_create_nonce('dinoco_admin_action')`) — survives the 5-min `$cacheable_modules` TTL because WP nonces have a 12-24hr default lifetime, so the nonce baked into the cached HTML is always fresh enough.
2. Emit as inline `var DNC_TRANSFER_NONCE = '<?php echo esc_js(...) ?>'`.
3. Append to `$.post` payload as `dinoco_admin_nonce: DNC_TRANSFER_NONCE`.

**Test plan**: load page, click Transfer Now → expect success (not "Security token invalid"). Wait 5 min for cache TTL, click again → expect success.

## H9 — warehouse_stock subtract asymmetry

**Root cause**: `dinoco_stock_subtract()` only updated `wp_dinoco_warehouse_stock` if a row already existed. `dinoco_stock_add()` correctly INSERTs missing rows — asymmetry caused drift between the master `wp_dinoco_products.stock_qty` (which was always decremented) and `SUM(warehouse_stock.stock_qty)` (which stayed unchanged when row was missing).

**Fix**: Mirror INSERT branch from `add()`. When `wh_row` is missing inside the FOR UPDATE txn, INSERT a row with `stock_qty = (allow_negative ? -qty : 0)` — preserves walk-in DD-5 semantics (stock can go negative) for non-walk-in path stops at zero floor, and the next subtract on this SKU will resume normal UPDATE path.

## H10 — Transfer reconcile master stock_qty

**Root cause**: `dinoco_transfer_stock()` updated only `wp_dinoco_warehouse_stock` rows for both source + dest. Master `wp_dinoco_products.stock_qty` was untouched. While `dinoco_get_total_stock()` reads `SUM(warehouse_stock)` correctly, `dinoco_stock_auto_status()` reads `wp_dinoco_products.stock_qty` directly to compute stock_status — which became stale → status badge desync.

**Fix**: Inside the same transaction, after both warehouse rows committed, run `UPDATE wp_dinoco_products SET stock_qty = (SELECT SUM(stock_qty) FROM wp_dinoco_warehouse_stock WHERE sku=X) WHERE sku=X`. On failure → ROLLBACK + WP_Error. After COMMIT, invalidate `b2b_sku_data_map` transient and call `dinoco_stock_auto_status($sku)` (cascades to ancestors via DD-2).

## H11 — Admin Dashboard mobile responsive

**Root cause**: 5,042 LOC dashboard had only **1** `@media` rule (`(min-width: 1024px)` on `.mobile-blocker` to hide it on desktop). The mobile-blocker was a hard wall — admins literally could not access the dashboard from a phone or tablet.

**Fix** (replace the hard wall with a functional layout):
1. New CSS: `.dnc-mobile-toggle` (hamburger button, hidden ≥1024px) + `.dnc-mobile-backdrop` (overlay).
2. `@media (max-width: 1024px)` block: hide `.mobile-blocker`, transform sidebar into slide-out drawer (`position: fixed; transform: translateX(-100%); width: 260px`), add `.mobile-open` class state, full-width content, show hamburger + backdrop. Even when "collapsed" class present, on mobile we still show full drawer.
3. `@media (max-width: 768px)` tightens content padding + suppresses keyboard hints.
4. New HTML: hamburger button in topbar-left + backdrop element after sidebar.
5. New JS: `window.dncToggleMobileSidebar()`, `window.dncCloseMobileSidebar()`, auto-close on nav-item click + auto-close on resize back to desktop.

**Backward compat**: ≥1024px is byte-identical (no CSS rule applies). All new CSS scoped to small viewports.

**Tested breakpoints (visual reasoning)**:
- ≥1025px: desktop unchanged.
- 1024px / 768px / 375px (LINE in-app): sidebar drawer + full-width content.

## H12 — AI Control wiring (5 points)

**Root cause**: `[dinoco_admin_ai_control]` shortcode existed as a separate page but was never wired into the unified Admin Dashboard. CLAUDE.md listed it as a Key Shortcode but it was unreachable from the sidebar.

**Fix** (5-point checklist mirroring `slip_monitor` V.33.3 pattern):
1. `$module_map['ai_control']` → `[dinoco_admin_ai_control]`
2. `$cacheable_modules['ai_control']` → 120s (pure HTML shell pattern)
3. `TAB_LABELS.ai_control` → `'AI Control'`
4. `$modules[]` → `'ai_control'` (generates the `tab-wrapper-ai_control` placeholder)
5. New sidebar section "AI" with nav-item `data-tab="ai_control"` + cyan microchip icon, placed between Marketing and the external AI Chat link.

## H13 — mysqldump password shell-arg leak

**Root cause**: `b2f_phase4_dump_snapshot()` passed DB_PASSWORD as `-p<password>` argument to mysqldump via shell_exec. Any system user could observe the password via `ps aux`, auditd, or shell history during the brief window mysqldump runs.

**Fix**: Switch to `--defaults-extra-file=` pattern.
1. `wp_tempnam('b2f-mysqldump-cred-{ts}')` to create temp credentials file.
2. Write `[client]\nuser=...\npassword=...\nhost=...\n` (and `port=` if DB_HOST has `:port`).
3. `chmod 0600` immediately after write.
4. `mysqldump --defaults-extra-file=<tmp> --single-transaction --skip-lock-tables <db> <tbl> > <out>`.
5. **try/finally** ensures the credential file is `unlink()`-ed even if `shell_exec` throws or filesystem op fails.

Result: password no longer visible in `ps`/auditd/shell history. Output dump file still chmod-0600 as before.

## Files Changed

```
[Admin System] DINOCO Manual Transfer Tool        V.30.2 → V.30.3
[Admin System] DINOCO Admin Dashboard             V.33.3 → V.33.4
[Admin System] B2F Migration Audit                V.3.14 → V.3.15
[B2B] Snippet 15: Custom Tables & JWT Session     V.8.6  → V.8.7
docs/audit/wave-3-applied.md                      NEW
```

## Validation

- `php -l` PASS for all 4 files (after prepending `<?php` for lint, verified no `<?php` tag at line 1 in actual snippet files).
- No overlap with Wave 1 files (Snippet 1/2/3/5/16, Manual Invoice).
- All atomic stock operations preserved (FOR UPDATE locks, transaction semantics).
- DD-2 leaf-only guard preserved (H9 fix only adds INSERT branch within existing logic).
- DD-5 walk-in negative-stock semantics preserved in H9 fix.
- WP nonce lifetime (12-24hr) >> module cache TTL (5min) — C7 fix is robust against cache staleness.

## Deferred / Not Touched

- **M1-M9** Medium findings — Wave 4 batch.
- **M5** DD-3 inconsistency in `dip-stock/current` — out of scope (operational drift, not safety).
- **M7** Stock invariant monitoring cron — separate hardening sprint.
- Wave 1 (atomic + FSM): C1/C2/C3/H1/H2 — handled by parallel agent.
- Wave 2 (slip pipeline convergence): C4/C5/C6/H6/H7/H8/H14 — handled by parallel agent.
