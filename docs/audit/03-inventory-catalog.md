# Round 2 Audit — Inventory + Catalog Cluster

**Auditor**: Agent 3/4 (Round 2 Deep Audit)
**Date**: 2026-04-24
**Scope**: 8 pages (Inventory Dashboard, Inventory Manager, Stock Management, คลังสินค้า, Dip Stock, Flash Shipping V.42, Transfer, Product Catalog/Production/Moto)
**Files audited**:
- `[Admin System] DINOCO Global Inventory Database` V.44.4 (10,638 LOC)
- `[B2B] Snippet 15: Custom Tables & JWT Session` V.8.6 (4,176 LOC)
- `[Admin System] Flash Shipping V.42 Go-Live Tool` V.1.7 (1,713 LOC)
- `[Admin System] DINOCO Manual Transfer Tool` V.30.2 (237 LOC)
- `[Admin System] DINOCO Moto Manager` V.1.0 (536 LOC)
- `[Admin System] DINOCO Admin Dashboard` V.33.2 (5,042 LOC) — wiring host

---

## Executive Summary

Inventory cluster is largely well-engineered (atomic FOR UPDATE, dbDelta with idempotent ALTER, central nonce, batch helpers). However, audit identified **1 CRITICAL functional regression** (Manual Transfer Tool nonce mismatch — feature is fully broken), **2 HIGH stock-invariant drifts** (warehouse_stock auto-create asymmetry between add/subtract; transfer doesn't reconcile master `wp_dinoco_products.stock_qty`), and **3 MEDIUM perf/correctness issues** (per-request `SHOW COLUMNS` thrashing on `get_catalog` hot path; in-PHP hierarchy walk for stock/list with O(n × depth); GD-3 `child_to_parent` "first-parent-wins" inconsistency vs JS in `dip-stock/current`). Wiring (5-point checklist) for all 8 subtabs **passes** — no orphaned tabs. Flash V.42 Go-Live tool is solid; deletion of Box Template + cache invalidation is wired through V.8.5 `dinoco_cache_flush_group()` helper.

---

## Per-Page Findings

### 1. Inventory Dashboard (`view-dash`)
- **Status**: GREEN. `loadAnalytics()` JS call only; no server-render of stat cards.
- **Note**: `MODULE_TRIGGERS.inventory` (Admin Dashboard L3882) calls `loadAnalytics()` — wired correctly.

### 2. Inventory Manager (`view-list`) — Warranty SN search
- **Status**: GREEN. Action key `search_inv` distinct, nonce-gated since V.42.0.
- **MED**: line 8255 — non-God admin can't search empty (intentional UX). Confirmed via UI text.

### 3. Stock Management (`view-stock`) — 3-level hierarchy
- **Status**: AMBER.
- **MED-1 [PERF]** `[Admin System] DINOCO Global Inventory Database:1620-1688` — `/stock/list` does in-PHP recursive MIN computation per row. With 500+ SKUs × 3-level relations, ~5-15ms PHP time. Acceptable for current load but should pre-compute on write (already done in V.43.7 PERF-H5 partially — auto-sync moved to write-trigger).
- **LOW** L2003 dead code `// We filter in PHP after fetch for correctness` — comment outdated; status filter still in PHP loop.

### 4. คลังสินค้า (`view-warehouses`) — Multi-warehouse
- **Status**: AMBER.
- **HIGH-1 [DATA INTEGRITY]** `[B2B] Snippet 15:1042-1046` — `dinoco_stock_subtract()` updates `wp_dinoco_warehouse_stock` only when row exists (`if ($wh_row)`). Missing-row case is silently skipped, causing drift between `wp_dinoco_products.stock_qty` (decremented) and SUM(warehouse_stock) (unchanged). `dinoco_stock_add()` at L922 correctly INSERTs missing row. **Fix**: mirror INSERT branch in subtract path:
```php
if ($wh_row) { /* existing */ } else {
    $wpdb->insert($whs_table, ['warehouse_id'=>$warehouse_id,'sku'=>$sku,'stock_qty'=>$allow_negative ? -intval($qty) : 0]);
}
```
- **HIGH-2 [DRIFT]** `[B2B] Snippet 15:1873-1892` — `dinoco_transfer_stock()` updates only `wp_dinoco_warehouse_stock` (per-warehouse). Master `wp_dinoco_products.stock_qty` is not touched. Since `dinoco_get_total_stock()` reads `SUM(warehouse_stock)`, totals stay correct, but `dinoco_stock_auto_status()` reads `wp_dinoco_products.stock_qty` directly (Snippet 15:1058 in `dinoco_stock_subtract`). After transfer, `stock_status` may not refresh. **Fix**: add reconciliation `UPDATE {$prod_table} SET stock_qty = (SELECT SUM(stock_qty) FROM {$whs_table} WHERE sku=...)` inside transfer transaction, then call `dinoco_stock_auto_status($sku)`.

### 5. Dip Stock (`view-dipstock`)
- **Status**: GREEN. JOIN-based query L2312-2319 avoids N+1. Pre-built maps L2327-2341 for hierarchy classification.
- **MED-2** L2338 comment "first parent wins" — `$dip_child_to_parent[$cu] = $p_upper` only saves first parent, not array. Diverges from `stock/list` V.42.23 which uses `parent_skus[]` array (DD-3 shared child). Functional impact: shared leaf in dip stock won't show DD-3 indicator, but classification (`product_type=grandchild`) still correct.

### 6. Flash Shipping V.42 (`view-shipping`)
- **Status**: GREEN. Go-Live Wizard V.1.7 has per-endpoint rate limit, in-flight Set, nonce reload guard.
- **Wiring**: sidebar nav `data-tab="inventory" data-subtab="shipping"` → `_applySubTab('inventory','shipping')` → `switchMainTab('shipping')` → `ShippingManager.init()`. All 5 wiring points pass.

### 7. Transfer (`tab-transfer`) — Manual Warranty Transfer
- **Status**: 🔴 **CRITICAL BROKEN**.
- **CRIT-1** `[Admin System] DINOCO Manual Transfer Tool:209-213` — frontend `$.post()` payload omits `dinoco_admin_nonce`. Backend at L40 does `wp_verify_nonce($_POST['dinoco_admin_nonce'], 'dinoco_admin_action')` → **always returns "Security token invalid"**. Feature is non-functional in production. (Already noted in Round-1 audit `docs/audit/round-1-archived/02-fullstack-developer-inventory-catalog.md` L92, still unresolved.) **Fix**: render `<?php wp_nonce_field('dinoco_admin_action','dinoco_admin_nonce'); ?>` (or JS-side `var DINOCO_TRANSFER_NONCE='<?php echo wp_create_nonce('dinoco_admin_action');?>'`) and append `dinoco_admin_nonce: DINOCO_TRANSFER_NONCE` to the POST data object.
- **NOTE**: `transfer` is in `$cacheable_modules` 5min — nonce **must** be JS-side var or rendered fresh; baked nonce in cached HTML will expire. Recommend JS var fetched via separate non-cached endpoint or output via `wp_localize_script` after cache layer.

### 8. Product Catalog / Production (Gen SN) / Moto Catalog
- **Status**: AMBER.
- **MED-3 [PERF]** `[Admin System] DINOCO Global Inventory Database:240-263` — `get_catalog` action runs 5-7 `SHOW COLUMNS` checks AND 4 inline `ALTER TABLE` per request despite `admin_init` schema migration at L69-137 already handling this. Adds ~10-30ms per call. **Fix**: gate with `if (get_option('dinoco_inventory_schema_version') >= DINOCO_INVENTORY_SCHEMA_VERSION) skip checks` or replace with single `INFORMATION_SCHEMA.COLUMNS` query.
- **MED-4 [XSS hardening]** Already addressed V.42.0 [C-4 FIX] — all dynamic values use `esc()` helper. ✓
- **Moto Manager**: GREEN. Action key `dinoco_moto_mgr_action` distinct, nonce `dinoco_moto_mgr` separate from admin nonce. Pattern correct.

---

## Wiring 5-Point Checklist Matrix

| Subtab | nav-item | module_map | cacheable | TAB/SUBTAB_LABELS | $modules / view-section | Status |
|---|---|---|---|---|---|---|
| Inventory Dashboard (`dash`) | ✓ L3292 | ✓ `inventory`→`[dinoco_admin_inventory]` | ✓ 120s | ✓ SUBTAB_LABELS.inventory.dash | ✓ `#view-dash` L4496 | **PASS** |
| Inventory Manager (`list`) | ✓ L3296 | ✓ same | ✓ same | ✓ list:'Inventory Manager' | ✓ `#view-list` L4536 | **PASS** |
| Stock Management (`stock`) | ✓ L3300 | ✓ same | ✓ same | ✓ stock:'Stock Management' | ✓ `#view-stock` | **PASS** |
| คลังสินค้า (`warehouse`) | ✓ L3304 | ✓ same | ✓ same | ✓ warehouse:'คลังสินค้า' (mapped to `warehouses` in `_applySubTab`) | ✓ `#view-warehouses` | **PASS** |
| Dip Stock (`dipstock`) | ✓ L3308 | ✓ same | ✓ same | ✓ dipstock | ✓ `#view-dipstock` | **PASS** |
| Flash Shipping V.42 (`shipping`) | ✓ L3312 | ✓ same | ✓ same | ✓ shipping:'Flash Shipping V.42' | ✓ `#view-shipping` | **PASS** |
| Transfer (`transfer`) | ✓ L3316 | ✓ `transfer`→`[dinoco_admin_transfer]` | ✓ 300s | ✓ TAB_LABELS.transfer | ✓ `#tab-transfer` | **PASS** (wiring only — feature broken via CRIT-1) |
| Moto Catalog (`moto_catalog`) | ✓ L3283 | ✓ `moto_catalog`→`[dinoco_admin_moto]` | ✓ 300s | ✓ TAB_LABELS.moto_catalog | ✓ rendered via shortcode | **PASS** |

**All 8 subtabs PASS wiring checklist.** No orphaned navigation.

---

## Cross-Cutting Issues

### Stock Invariant (CRITICAL — long-term)
The system has **two sources of truth** for stock per leaf SKU:
- `wp_dinoco_products.stock_qty` (single value, master)
- `wp_dinoco_warehouse_stock.stock_qty` (per-warehouse, summed)

**Invariant**: `wp_dinoco_products.stock_qty == SUM(wp_dinoco_warehouse_stock WHERE sku=X)`

**Drift sources**:
1. Subtract on SKU without warehouse_stock row (HIGH-1) — master decreases, sum unchanged.
2. Transfer doesn't reconcile master (HIGH-2).
3. Initial migration `[B2B] Snippet 15:339` "Copy stock_qty from dinoco_products to warehouse_stock" — happy path. New SKUs added after migration without explicit warehouse_stock row trigger drift.

**Recommendation**: Add weekly cron `dinoco_stock_invariant_check` that compares master vs sum, logs drift to `dinoco_stock_transactions` with `type='drift_detected'`, and surface in admin notice.

### Cache drift
- Inventory module is cached 120s in admin dashboard `$cacheable_modules`. Stock writes via REST do not invalidate this transient (`dnc_mod_inventory_*`). Admin sees stale shell HTML for 2min after stock change. Acceptable since live data uses REST polling, but breadcrumb/badge counts may lag.
- `delete_transient('b2b_sku_data_map')` is called on every stock add/subtract (Snippet 15:938, 1056) — good.
- Warehouse `dinoco_invalidate_box_template_cache()` wired V.8.5 ✓.

---

## Top 5 Priority Action Items

1. **CRIT — Fix Manual Transfer Tool nonce (CRIT-1)**
   File: `[Admin System] DINOCO Manual Transfer Tool` lines 142-176 + 209-213
   Effort: 15min. Add `var DNC_TRANSFER_NONCE = '<?php echo wp_create_nonce("dinoco_admin_action"); ?>';` before `<script>` block + append `dinoco_admin_nonce: DNC_TRANSFER_NONCE` to `$.post` payload. Test that 5min cache doesn't stale-bake.

2. **HIGH — Fix warehouse_stock subtract asymmetry (HIGH-1)**
   File: `[B2B] Snippet 15:1042-1046`
   Effort: 30min. Mirror INSERT branch from `dinoco_stock_add` (L922) into `dinoco_stock_subtract`. Add unit test for "subtract on uninitialized warehouse_stock row".

3. **HIGH — Reconcile transfer with master stock (HIGH-2)**
   File: `[B2B] Snippet 15:1847-1918`
   Effort: 45min. Inside transfer transaction, after both warehouse rows updated, run `UPDATE wp_dinoco_products SET stock_qty=(SELECT SUM(stock_qty) FROM wp_dinoco_warehouse_stock WHERE sku=%s) WHERE sku=%s` then `dinoco_stock_auto_status($sku)` outside txn.

4. **MED — Remove `SHOW COLUMNS` thrashing on `get_catalog` hot path (MED-3)**
   File: `[Admin System] DINOCO Global Inventory Database:240-263`
   Effort: 20min. Gate the inline SHOW/ALTER block with `if (intval(get_option('dinoco_inventory_schema_version',0)) < DINOCO_INVENTORY_SCHEMA_VERSION)` early-return path. Schema migration is already handled in `admin_init` hook (L69).

5. **MED — Stock invariant monitoring cron**
   File: NEW — append to `[B2B] Snippet 15` PART 1B
   Effort: 1hr. Weekly `wp_schedule_event('weekly','dinoco_stock_invariant_check')` running `SELECT p.sku, p.stock_qty AS master, COALESCE(SUM(w.stock_qty),0) AS total FROM wp_dinoco_products p LEFT JOIN wp_dinoco_warehouse_stock w ON p.sku=w.sku GROUP BY p.sku HAVING master != total`. Log to `dinoco_stock_transactions` with `type='drift_detected'`. Notify admin if >0 rows.

---

## Stats
- **Total findings**: 1 CRITICAL + 2 HIGH + 4 MEDIUM + 2 LOW
- **Wiring pass rate**: 8/8 (100%)
- **Atomic stock ops**: ✓ FOR UPDATE locks confirmed in add/subtract/transfer
- **DD-2 leaf-only guard**: ✓ V.7.1 H2 FIX active
- **DD-3 shared child**: ✓ stock/list V.42.23 (PHP) — but ⚠ `dip-stock/current` only stores first parent (MED-2)
- **REST endpoint count (dinoco-stock/v1)**: 39 routes verified
- **REST endpoint count (dinoco-flash-golive/v1)**: 10 routes verified

End of audit report.
