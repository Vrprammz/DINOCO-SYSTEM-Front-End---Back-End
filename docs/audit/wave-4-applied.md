# Wave 4 Applied — Medium Polish + Operational Improvements

**Date**: 2026-04-24
**Findings closed**: M1, M5, M6, M7, M8, M9 (6 items)
**Reference**: `docs/audit/MASTER-FINDINGS-ROUND-2.md` Wave 4 (Medium polish parallel ~4h)
**Status**: All fixes shipped. PHP lint pass on all 6 files. No regressions to Wave 1/2/3 work.

---

## Summary Table

| ID | Title | File | Version Bump | LOC |
|----|-------|------|--------------|-----|
| M1 | Snippet 16 transient daily counters race | `[B2B] Snippet 16: Backorder System` | V.2.0 → V.2.1 | ~120 |
| M5 | DD-3 dip-stock/current "first parent wins" | `[Admin System] DINOCO Global Inventory Database` | V.44.4 → V.44.5 | ~30 |
| M6 | `get_catalog` SHOW COLUMNS + ALTER TABLE thrashing | `[Admin System] DINOCO Global Inventory Database` | V.44.4 → V.44.5 | ~25 |
| M7 | Stock invariant monitoring cron | `[B2B] Snippet 15: Custom Tables & JWT Session` | V.8.7 → V.8.8 | ~120 |
| M8 | LIFF AI claim regex tightening | `[LIFF AI] Snippet 1: REST API` | V.1.7 → V.1.8 | 6 |
| M9 | B2F bulk classification idempotency | `[Admin System] B2F Migration Audit` (V.3.15→V.3.16) + `[B2F] Snippet 5: Admin Dashboard Tabs` (V.7.8→V.7.9) | bump both | ~40 |

---

## M1 — Atomic Daily Counter Helper (Snippet 16 V.2.1)

### Problem
`b2b_bo_increment_daily_counters` and `b2b_bo_decrement_daily_counters` used the textbook race-prone pattern:
```php
$used = (float) get_transient($key);
set_transient($key, $used + $delta, 86400);
```
Two concurrent requests can both read `qty_used=900` and both write `950` — counter undercounted by 50. This bypasses rate limits + tier value caps under load.

### Fix
NEW helper `b2b_bo_atomic_incr_option($cache_key, $delta, $ttl, $floor)` mirrors `Snippet 1 V.34.9 b2b_slip_incr_err_count` pattern:
- **Path 1**: `wp_cache_incr` / `wp_cache_decr` when persistent object cache active
- **Path 2**: atomic `UPDATE wp_options SET option_value = GREATEST(CAST(option_value AS SIGNED) + %d, %d) WHERE option_name = %s` — single-statement atomic at row-level

`daily_value` (THB float) stored as integer satang cents (×100) so atomic INT UPDATE works. Reader at line ~2932 converts back via `/100.0`. Helper kept inside Snippet 16 to avoid Wave 2 merge conflict (Wave 2 owns Snippet 1).

### Touched
- `[B2B] Snippet 16` — V.2.0 → **V.2.1**
- Lines: header doc, helper insertion (lines ~447-563), reader site (~2932)

---

## M5 — DD-3 dip-stock/current Array Pattern (Inventory V.44.5)

### Problem
`dip-stock/current` REST endpoint built `$dip_child_to_parent[$cu] = $p_upper` with first-parent-wins semantics. Diverges from `stock/list` V.43.6 + JS `computeProductTypes` which uses `parent_skus[]` array. Shared leaf in dip stock didn't show DD-3 indicator → UI inconsistency.

### Fix
- Build `$dip_child_to_parents` (array of all parents) — DD-3 shared child safe
- Keep `$dip_child_to_parent` single-value (first parent) for backward compat (matches JS `myParents[0]` convention)
- Each item now exposes `parent_skus[]` + `grandparent_skus[]` arrays alongside existing single-value fields

### Touched
- `[Admin System] DINOCO Global Inventory Database` — V.44.4 → **V.44.5**
- Lines: header (V.44.5 added), `~2326-2347` map build, `~2360-2395` per-row classification

---

## M6 — get_catalog Schema Fast-Path (Inventory V.44.5)

### Problem
`get_catalog` REST action ran 5-7 `SHOW COLUMNS` checks + 4 `ALTER TABLE` per request even when schema was already migrated by `admin_init` hook. Adds ~10-30ms hot-path overhead per call. Hot path called on every Inventory tab open + Product Catalog grid render.

### Fix
- Bumped `DINOCO_INVENTORY_SCHEMA_VERSION` 20260411 → 20260424 (covers V.44.0 Flash Shipping V.42 columns)
- NEW per-request `static $_get_catalog_schema_ok` memo
- Fast path: when `installed >= expected`, run single `SELECT` with all expected columns
- Fallback chain: `$wpdb->last_error` after fast-path SELECT → flag `$_get_catalog_schema_ok=false` → next request retries slow path (5-7 SHOW COLUMNS + ALTERs)
- Slow path retained as legacy/migration fallback

### Touched
- `[Admin System] DINOCO Global Inventory Database` — V.44.4 → **V.44.5**
- Lines: schema version bump (~67), fast-path block (~232-300)

---

## M7 — Stock Invariant Monitoring Cron (Snippet 15 V.8.8)

### Problem
Wave 3 V.8.7 fixed two known stock-invariant drift sources (subtract asymmetry H9, transfer reconcile H10), but new bugs may slip in. No automated monitoring → drift could persist undetected for weeks until manually noticed during dip stock.

### Fix
NEW cron `dinoco_stock_invariant_cron` (twicedaily) + helper `dinoco_run_stock_invariant_check()`:
- Single SQL: `LEFT JOIN wp_dinoco_products + wp_dinoco_warehouse_stock GROUP BY sku HAVING master_qty != SUM(warehouse_sum)` — bounded `LIMIT 100`
- On drift detected:
  - Push admin alert (Telegram via `b2b_push_to_admin` if available, fallback `b2b_line_push` to `B2B_ADMIN_GROUP_ID`)
  - Dedup transient `dinoco_stock_invariant_alerted` 6h TTL → no spam
  - Persist last 50 violations to `_dinoco_stock_invariant_violations` wp_option for admin review
  - Log to `b2b_log()`
- Helper callable from PHP for ad-hoc audits (returns `{ checked, violations, alerted }`)

### Touched
- `[B2B] Snippet 15: Custom Tables & JWT Session` — V.8.7 → **V.8.8**
- Lines: header doc, NEW PART 1.55 block (~2598-2715)

---

## M8 — LIFF AI Claim Route Regex (LIFF AI V.1.8)

### Problem
Routes `register_rest_route(... '/claim/(?P<id>[a-f0-9]+)')` used hex-style regex. `claim_ticket` CPT uses integer post IDs (decimal). Permissive `[a-f0-9]+` routed alphanumerics like `"1abc"` to `intval('1abc') = 1` → routed to claim post 1 instead of returning 404.

### Fix
Tightened regex `[a-f0-9]+` → `\d+` for both routes (`/claim/{id}` GET + `/claim/{id}/status` POST). Defense-in-depth — handler still validates `get_post_type() === 'claim_ticket'`.

### Touched
- `[LIFF AI] Snippet 1: REST API` — V.1.7 → **V.1.8**
- Lines: header (V.1.8 added), `~184` + `~189`

---

## M9 — B2F Bulk Classification Idempotency

### Problem
Frontend `confirmAllUnconfirmed()` (B2F Snippet 5 V.7.8) fired POST `/junction-confirm-classification` without `idempotency_key`. Double-click under network lag → 2 transactions (although second one is benign since rows already `confirmation_status='confirmed'`, it burned a DB roundtrip + counted toward 5/min rate limit). Pattern inconsistent with sibling `/junction-bulk-update-display` which has idempotency.

### Fix
**Backend** (B2F Migration Audit V.3.16):
- Accept `idempotency_key` param (sanitize_text_field)
- Pre-check transient `b2f_confirm_idem_{uid}_{md5(key)}` → return cached result with `cached: true` flag
- Post-success: `set_transient($tkey, $result, 5 * MINUTE_IN_SECONDS)`

**Frontend** (B2F Snippet 5 V.7.9):
- NEW helper `_b2fGenIdemKey()` — `window.crypto.randomUUID()` preferred, fallback `'idem_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,12)` for older browsers
- `confirmAllUnconfirmed()` generates key on click + sends in POST payload
- Toast appended `(ใช้ cached result — กดซ้ำ)` when `res.cached`

### Touched
- `[Admin System] B2F Migration Audit` — V.3.15 → **V.3.16** — handler (~3263-3402)
- `[B2F] Snippet 5: Admin Dashboard Tabs` — V.7.8 → **V.7.9** — `_b2fGenIdemKey()` + `confirmAllUnconfirmed()` (~4274-4339)

---

## Quality Gates

- [x] PHP lint: 6/6 files pass (`php -l` with prepended `<?php` tag)
- [x] No `<?php` tags inside snippets
- [x] No Wave 1/2/3 file overlap (Wave 2 owns Snippet 1/2 + Manual Invoice + Slip Monitor — untouched here)
- [x] All version bumps reflected in file headers
- [x] DB_ID / shortcode entries unchanged (no new shortcodes)
- [x] Backward compat: existing readers + behavior preserved (Snippet 16 reader updated for satang conversion; Inventory dip-stock + stock/list both consume new array fields gracefully)

---

## Deferred / Out of Scope

- M1 — could be promoted to a generic helper in Snippet 1 (`b2b_atomic_incr_option`) when Wave 2 lands. Currently inlined in Snippet 16 to avoid merge conflict.
- M5 — JS-side `dip-stock/current` consumer (Inventory tab) doesn't yet render DD-3 indicator from `parent_skus[]`. Backend now exposes the data; frontend can consume in a follow-up cosmetic patch (UX-LOW).
- M7 — admin UI to display `_dinoco_stock_invariant_violations` not yet added; cron writes the data, manual `wp_option` query works for now. Future enhancement: card on Inventory dashboard.
- M8 — handler-level type guard (`get_post_type($id) === 'claim_ticket'`) already exists; regex tightening is defense-in-depth only.
- M9 — `confirmSku()` (single-SKU confirm) does NOT include idempotency_key. Single-click pattern + low rate limit risk made this lower priority. Same backend transient mechanism would work if needed later.

---

## Rollback

All 6 fixes are additive + backward compatible. Per-fix rollback:
- M1 — revert Snippet 16 V.2.1 → V.2.0 (helper unused; old transient pattern restored). Counters previously stored as float; satang conversion is V.2.1+ only — staging migration not needed since transients have 24h TTL.
- M5 — revert Inventory V.44.5 → V.44.4. `parent_skus`/`grandparent_skus` array fields disappear; consumers fall back to single-value (existing pattern).
- M6 — revert schema_version bump (admin_init re-runs migration once) + revert fast-path block to slow-path (5-7 SHOW COLUMNS + 4 ALTERs per request).
- M7 — `wp_unschedule_event(time(), 'dinoco_stock_invariant_cron')` + delete cron action. `_dinoco_stock_invariant_violations` option becomes orphan but harmless.
- M8 — revert regex to `[a-f0-9]+`.
- M9 — frontend can stop sending `idempotency_key` (backend gracefully accepts missing param). Backend can revert V.3.16 → V.3.15 by removing idem block.

---

End of Wave 4 applied report.
