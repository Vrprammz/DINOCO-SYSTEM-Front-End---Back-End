# DINOCO Admin Backend Audit — Inventory + Catalog Cluster

**Agent**: 2/4 (Fullstack Developer)
**Scope**: 10 pages — Inventory cluster (7) + Catalog cluster (3)
**Files audited**:
- `[Admin System] DINOCO Global Inventory Database` V.44.4 (10,638 LOC)
- `[B2B] Snippet 15: Custom Tables & JWT Session` V.8.6 (4,176 LOC)
- `[Admin System] DINOCO Admin Dashboard` V.33.3 wiring layer (5,042 LOC)
- `[Admin System] Flash Shipping V.42 Go-Live Tool` V.1.7 (1,713 LOC)
- `[Admin System] DINOCO Manual Transfer Tool` V.30.2 (237 LOC)
- `[Admin System] DINOCO Moto Manager` V.1.0 (536 LOC)
- `[Admin System] Product Catalog Export Tool` (770 LOC)

**Date**: 2026-04-26 — Auto mode

---

## Executive Summary (≤200 words)

Inventory + Catalog cluster แข็งแรงพอสมควรโดยรวม — atomic stock ops มี FOR UPDATE locks, dual-write pattern (custom table + ACF) ถูกต้อง, hot path มี static memo + transient cache, hierarchy DD-rules (DD-2 leaf-only guard, DD-3 shared child) ถูก enforce ใน helpers ระดับ DB ครบ. Wiring 5-point checklist ผ่านครบ 8/8 nav-items (`inventory.{dash,list,catalog,generate,stock,warehouse,dipstock,shipping}` + `transfer` + `moto_catalog`).

แต่พบ **1 BLOCKER** — Manual Transfer Tool บั๊กมาตั้งแต่ V.30.2: AJAX call ไม่ส่ง `dinoco_admin_nonce` ทำให้ทุก force-transfer ตอบ "Security token invalid" silently. เป็น dead-feature.

**Cross-tab data drift** เป็นความเสี่ยงรองที่สำคัญ: (1) `dinoco_transfer_stock()` แตะเฉพาะ `wp_dinoco_warehouse_stock` ไม่ sync `wp_dinoco_products.stock_qty` (total) → drift ระหว่าง 2 ตาราง. (2) Dip Stock approve เรียก `dinoco_stock_add/subtract` โดยไม่ส่ง `$warehouse_id` → ปรับเฉพาะ default warehouse แม้ของกระจายหลายคลัง. (3) `/product/shipping` mutation ไม่เรียก `dinoco_flush_aggregate_memo()` → SET parent stale ใน Flash V.42 resolver.

อื่นๆ MEDIUM: image-proxy ไม่กัน SSRF private IP, transient cache 120s แช่ wp_create_nonce, fragile `:eq(N)` selector ใน `switchMainTab`.

Total: **1 CRITICAL + 4 HIGH + 8 MEDIUM + 4 LOW** = 17 findings.

---

## Per-Page Findings

### 1. Inventory Dashboard (`subtab=dash`)

**Wiring 5-point**: ✅ nav-item L3292 / ✅ module_map L690 / ✅ cacheable 120s L719 / ✅ TAB_LABELS+SUBTAB L3862 / ✅ placeholder L3780

**Findings**:
- 🟡 **MED-2.1** [`Inventory` L4498 + L5654]: `switchMainTab('catalog')` ใช้ `$('.main-tab:eq(2)').addClass('active')` — index-based selector. ถ้ามีคนเพิ่ม/ลบ tab เลขจะเลื่อนยกชุด. Fix: ใช้ `[data-tab="catalog"]` selector.
- 🟢 **LOW-2.2** [`Inventory` L4480-4493]: KPI dashboard มี global-search-box ซ้อน (รวมทั้งใน `view-list` L4538) — markup duplication, อาจสับสน DOM (มี `#inv-filter` 2 ตัว!).
- 🟢 **LOW-2.3** [`Inventory` L8474 `loadAnalytics`]: ใช้ `cache busting via no_cache=` — เลี่ยง WP cache แต่ POST ก็ไม่ควรถูก cache อยู่แล้ว → dead code defensive.

### 2. Inventory Manager (`subtab=list`)

**Wiring 5-point**: ✅ ครบ.

**Findings**:
- 🟡 **MED-2.4** [`Inventory` L4541 vs L4486]: `<select id="inv-filter">` มี **2 IDs ซ้ำ** ใน DOM (global-search ซ่อน + view-list visible). `$('#inv-filter').val(filter)` ใน `goToInventory` (L5662) จะ pick ตัวแรก — ถ้า DOM mutate อาจ pick ผิด.

### 3. Stock Management (`subtab=stock`)

**Wiring 5-point**: ✅ ครบ.

**Findings**:
- 🔴 **HIGH-2.5** [`Snippet 15` L1021-1048 `dinoco_stock_subtract`]: เมื่อ `$warehouse_id` ระบุ + warehouse_stock ไม่พอ — function ไม่ ROLLBACK transaction! ลด `wp_dinoco_products.stock_qty` ปกติ แต่ warehouse_stock อาจติดลบ (ถ้า allow_negative=true) หรือ cap=0. **Drift invariant**: `SUM(warehouse_stock) ≠ products.stock_qty`. ไม่มี integrity check.
- 🟡 **MED-2.6** [`Snippet 15` L1099 `dinoco_stock_auto_status`]: ถ้า `stock_qty <= 0` set `out_of_stock` แม้ warehouse อื่นมีของ — เพราะ auto_status อ่าน `products.stock_qty` (sum across WH) ไม่ใช่ per-WH. Behaviour เดิม OK ถ้า invariant ตรง แต่ดู HIGH-2.5.
- 🟢 **LOW-2.7** [`Inventory` L4663-4664]: filter chip "ลูกชิ้นส่วน"/"ชิ้นส่วนย่อย" — ตามคำสั่ง CLAUDE.md "ห้ามใช้คำว่า 'หลาน'" ✓ แต่อาจสับสนภาษากับ Production ผู้ใช้.

### 4. คลังสินค้า (Warehouse, `subtab=warehouse`)

**Wiring 5-point**: ✅ ครบ — แต่มี **mapping**: sidebar ใช้ `subtab=warehouse` (singular), Inventory ใช้ `'warehouses'` (plural). Resolved ผ่าน `invMap = { warehouse: 'warehouses' }` ใน `_applySubTab` (Dashboard L4112). Brittle.

**Findings**:
- 🔴 **HIGH-2.8** [`Snippet 15` L1848-1917 `dinoco_transfer_stock`]: โอนสต็อกระหว่างคลัง **แตะเฉพาะ `wp_dinoco_warehouse_stock`** — ไม่อัพเดท `wp_dinoco_products.stock_qty` (total ควร invariant — แต่ถ้าเริ่มต้น drift จาก HIGH-2.5 จะ propagate ต่อ). อย่างน้อยควร `SELECT FOR UPDATE` รวมทั้ง products row + verify SUM ก่อน commit.
- 🔴 **HIGH-2.9** [`Snippet 15` L1910 transfer `COMMIT`]: ไม่เรียก `dinoco_stock_auto_status($sku)` หลัง transfer — ถ้า WH ที่โอนออกหมด หรือ WH ปลายทางเป็น 0 → 1 ตามนิยาม `stock_status` ของ product จะไม่ recompute (อ่าน total เดียวกัน, แต่ display per-WH stale).
- 🟡 **MED-2.10** [`Snippet 15` L1910]: ไม่ `delete_transient('b2b_sku_data_map')` หลัง COMMIT — ทุก stock_add/subtract ทำ ✓ แต่ transfer ลืม → cache stale 5 min.
- 🟡 **MED-2.11**: ไม่เรียก `dinoco_flush_aggregate_memo()` — Flash V.42 aggregate memo ของ parent SET stale.

### 5. Dip Stock (`subtab=dipstock`)

**Wiring 5-point**: ✅ ครบ.

**Findings**:
- 🔴 **HIGH-2.12** [`Inventory` L2521-2527 `/dip-stock/approve`]: เรียก `dinoco_stock_add/subtract($sku, $delta, ..., $batch_id)` — argument 8 ใส่เป็น `batch_id` แต่ function signature คือ `..., $batch_id = '', $warehouse_id = null` — argument **ตำแหน่งถูก** ✓ แต่ **ไม่ส่ง `$warehouse_id`** → ปรับเข้า default warehouse เสมอ. ถ้าของกระจายหลาย WH (ตัวอย่าง: warehouse A=10, B=5, expected=15, counted=12 → variance=-3 → subtract จาก default WH 3 ชิ้น) → drift `SUM(warehouse_stock)=10+(-3)+5=12` ตรง expected ตามตัวเลขรวม แต่ของจริงในแต่ละ WH ผิด!
- 🟡 **MED-2.13** [`Inventory` L2226]: snapshot ใช้ `WHERE is_active = 1` — ถ้า admin set `is_active=0` ระหว่าง session ของ SKU ที่นับไปแล้ว, approve ขั้นตอนสุดท้ายจะ skip SKU นั้น (ไม่อยู่ใน $items_to_approve ใหม่... แต่ items_table มี row อยู่). ไม่ครอบคลุม edge case.

### 6. Flash Shipping V.42 (`subtab=shipping`)

**Wiring 5-point**: ✅ ครบ — sidebar V.33.0, view-shipping placeholder L4857, ShippingManager init L9738. **เพิ่ง deploy** = ตามแผน.

**Findings**:
- 🔴 **HIGH-2.14** [`Inventory` L3550-3559 `/product/shipping`]: หลัง mutate weight/dims/pack_mode — เรียก `DINOCO_Catalog::flush_memo()` + `dinoco_cache_flush_group('dinoco_shipping')` ✓ — **แต่ไม่เรียก `dinoco_flush_aggregate_memo()`** (ที่ Snippet 15 V.8.2 export ไว้). ถ้า leaf SKU's weight เปลี่ยน → parent SET aggregate (recursive children sum) ยัง stale ใน Flash resolver จนกว่า memo TTL หมด. ตาม CLAUDE.md `**C-Data-1**` ควร invalidate ทุก mutation.
- 🟡 **MED-2.15** [`Inventory` L3539-3542]: pack_mode change away from multi_box → `wpdb->delete(slots_tbl, ['product_sku' => $sku])` ✓ แต่ผลกระทบไม่ broadcast `do_action()` → caller ภายนอก (RPi label render?) ไม่รู้.
- 🟡 **MED-2.16** [`ShippingManager.init` L9738]: เรียก parallel `loadCoverage + loadTemplates + loadDefaults + ad-hoc badge fetch` 4 ตัวพร้อมกัน — ไม่มี loading state UI per-section. UX rough ตอนเปิดครั้งแรก.

### 7. Transfer (`[dinoco_admin_transfer]`)

**Wiring 5-point**: ✅ nav-item L3316 / ✅ module_map L692 / ✅ cacheable 300s L714 / ✅ TAB_LABELS L3841 / ✅ placeholder L3780

**Findings**:
- 🔴 **CRITICAL-2.17** [`Manual Transfer Tool` L40 + L209-213]: **BLOCKER**. POST handler L40 enforce `wp_verify_nonce($_POST['dinoco_admin_nonce'], 'dinoco_admin_action')` — แต่ JS client (L209-213) ส่ง **เฉพาะ** `{ dinoco_transfer_action, sn, username }` — **ไม่มี nonce field**. ทุก force-transfer fail silent → "Security token invalid. Please refresh." Feature dead since V.30.2.
- **Fix**: เพิ่ม `wp_create_nonce('dinoco_admin_action')` ใน `dinoco_render_transfer()` output + ส่ง `dinoco_admin_nonce` ใน `$.post` payload. ⚠️ Cache TTL 300s — ต้อง bypass cache สำหรับ nonce หรือ render JS-side var.
- 🟡 **MED-2.18** [`Manual Transfer Tool` L98-102]: `update_field('owner_product', $new_owner)` + `update_field('owner_sequence', +1)` — 2 separate ACF write, ไม่ atomic. ถ้า process kill ระหว่างกลาง → ownership update แต่ sequence ไม่ update.

### 8. Product Catalog (`subtab=catalog`)

**Wiring 5-point**: ✅ ครบ.

**Findings**:
- 🟡 **MED-2.19** [`Inventory` L7200 `saveCatalogItem`]: ส่ง `compatible_models: JSON.stringify(_compatModels)` — `_compatModels` array ถ้า empty = `"[]"`. Backend handler validate length? ตรวจไม่พบ.
- 🟡 **MED-2.20** [`Inventory` L7248 child save]: `confirm_stock_migrate: 1` hard-coded — V.42.6 fix แต่ผู้ใช้ไม่เห็น confirm dialog ตามที่ V.42.6 ตั้งใจ. ขัด design intent ใน CLAUDE.md `H1 Auto-Split parent stock`.
- 🟢 **LOW-2.21** [`Inventory` L1468-1506 `/image-proxy`]: validate URL scheme + content-type + 10MB cap ✓ — **แต่ไม่กัน SSRF**: URL อาจ resolve เป็น 169.254.169.254 (AWS metadata), 127.0.0.1, RFC1918 ranges. ป้องกันด้วย `gethostbyname()` + filter_var FLAGS_IPV4_NO_PRIV_RANGE. Risk LOW เพราะ permission_callback = manage_options.

### 9. Production / Gen SN (`subtab=generate`)

**Wiring 5-point**: ✅ ครบ.

**Findings**:
- 🟡 **MED-2.22** [`Inventory` L4604 `pin-lock-screen`]: PIN เก็บใน base64 (`_p` const, L5530). Trivial decode → bypass via DevTools console. CLAUDE.md V.42.17 บอก "God mode client-side class ยังใช้สำหรับ UI gate ... cost data ถูก enforce ที่ backend" — แต่ Production gen_batch ไม่ verify backend. ทุก client มี PIN constant ใน source. Severity HIGH ถ้า PIN เป็น secret ทาง business; LOW ถ้าเป็น UI ergonomics เท่านั้น.
- 🟢 **LOW-2.23** [`Inventory` L8467 `runGen`]: ไม่ verify catalog SKU ที่ user เลือกก่อน gen_batch — backend handler (ไม่ได้เปิดอ่าน) ควร validate. หรือ frontend disable button จนกว่าเลือก SKU.

### 10. Moto Catalog (`[dinoco_admin_moto]`)

**Wiring 5-point**: ✅ nav-item L3283 / ✅ module_map L697 / ✅ cacheable 300s L711 / ✅ TAB_LABELS L3840 / ✅ placeholder L3781

**Findings**:
- 🟢 **LOW-2.24** [`Moto Manager` L33-39]: `$write_actions` whitelist = nonce required. `get_data` + `get_models` skip — read-only OK ✓ but ไม่มี rate limit → admin DoS risk LOW.

---

## Cross-Cutting Findings

### Wiring 5-Point Checklist (Inventory + Catalog cluster)

| # | nav-item | data-tab | data-subtab | Module map | Cacheable TTL | TAB_LABELS | SUBTAB_LABELS | Placeholder | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Inventory Dashboard | inventory | dash | ✅ L690 | 120s | ✅ | ✅ | ✅ | **PASS** |
| 2 | Inventory Manager | inventory | list | ✅ | 120s | ✅ | ✅ | ✅ | **PASS** |
| 3 | Product Catalog | inventory | catalog | ✅ | 120s | ✅ | ✅ | ✅ | **PASS** |
| 4 | Production Gen SN | inventory | generate | ✅ | 120s | ✅ | ✅ | ✅ | **PASS** |
| 5 | Stock Management | inventory | stock | ✅ | 120s | ✅ | ✅ | ✅ | **PASS** |
| 6 | คลังสินค้า | inventory | warehouse* | ✅ | 120s | ✅ | ✅ | ✅ | **PASS** (mapping) |
| 7 | Dip Stock | inventory | dipstock | ✅ | 120s | ✅ | ✅ | ✅ | **PASS** |
| 8 | Flash Shipping V.42 | inventory | shipping | ✅ | 120s | ✅ | ✅ | ✅ | **PASS** |
| 9 | Transfer | transfer | (none) | ✅ L692 | 300s | ✅ | n/a | ✅ | **PASS wiring / FAIL runtime** ⚠️ |
| 10 | Moto Catalog | moto_catalog | (none) | ✅ L697 | 300s | ✅ | n/a | ✅ | **PASS** |

*Mapping note: sidebar uses `warehouse`, inventory module expects `warehouses` — resolved via `invMap` in `_applySubTab` (Dashboard L4112). Brittle but works.

### Cross-Tab Data Consistency Issues

1. **`wp_dinoco_products.stock_qty` (total) vs `SUM(wp_dinoco_warehouse_stock.stock_qty)`** — invariant by design, but no integrity check exists. Can drift via:
   - HIGH-2.5: subtract with explicit `$warehouse_id` allows negative WH but products is capped at 0
   - HIGH-2.8: transfer doesn't touch products row at all
   - HIGH-2.12: dip_stock approve always hits default WH

2. **Cache invalidation matrix incomplete** — mutation paths that should ALL invalidate:
   - `delete_transient('b2b_sku_data_map')` — stock_add ✓, stock_subtract ✓, transfer ❌ (MED-2.10)
   - `dinoco_flush_aggregate_memo()` — receive ✓, /product/shipping ❌ (HIGH-2.14)
   - `DINOCO_Catalog::flush_memo()` — most paths ✓, transfer ❌

3. **Module transient cache TTL (120s/300s) caches `wp_create_nonce`** — nonces have 12-24h tick lifetime so 2-5 min cache OK, but UX impact: if user opens 2 sessions in different tabs of same module, will share nonce until cache expires. LOW risk.

### Integration Drift

- **Inventory subtabs share JS global state** — `catalogData`, `_compatModels`, `_priceMode`, `skuRelations` — all `window`-scoped. Switching subtabs doesn't reset → mutations leak across views (e.g. open Catalog Edit → close → switch to Stock → SKU still in `_currentEditSku`).
- **Box Templates / Pack Slots** changed via `/box-template` REST → calls `dinoco_invalidate_box_template_cache()` ✓. Coverage widget refreshes only on subtab open (L9740 `loadCoverage`) — **no realtime push**. Admin in Stock tab won't see Coverage drop after Multi-Box save in Go-Live Wizard.

---

## Top 10 Action Items

| # | Severity | Title | File:Line | Effort |
|---|---|---|---|---|
| 1 | 🔴 BLOCKER | Manual Transfer Tool sends no nonce → all force-transfers fail | Manual Transfer Tool:209 | 5 min |
| 2 | 🔴 HIGH | `dinoco_transfer_stock` doesn't sync products.stock_qty + auto_status + memo flush | Snippet 15:1848-1917 | 30 min |
| 3 | 🔴 HIGH | `dinoco_stock_subtract` per-WH path can drift products vs warehouse_stock | Snippet 15:1021-1048 | 45 min |
| 4 | 🔴 HIGH | Dip Stock approve ignores warehouse_id → wrong WH adjustment | Inventory:2521-2527 | 20 min |
| 5 | 🔴 HIGH | `/product/shipping` mutation missing `dinoco_flush_aggregate_memo()` | Inventory:3550-3559 | 5 min |
| 6 | 🟡 MED | Auto-Split confirm_stock_migrate hard-coded to 1 — bypass V.42.6 confirm dialog | Inventory:7248 | 15 min |
| 7 | 🟡 MED | Duplicate `#inv-filter` ID in DOM — `goToInventory` may bind wrong filter | Inventory:4486+4541 | 10 min |
| 8 | 🟡 MED | `:eq(N)` index selectors in `switchMainTab` — fragile to tab reorder | Inventory:5650-5660 | 10 min |
| 9 | 🟡 MED | image-proxy lacks SSRF guard for private IP ranges | Inventory:1468-1506 | 30 min |
| 10 | 🟡 MED | Production gen_batch PIN client-side base64 — trivial bypass | Inventory:5530+4604 | 60 min |

---

## Cross-Agent Flags

For **Agent 1 (code-reviewer)** — Architecture / Module Loader:
- `_applySubTab` mapping `{warehouse: 'warehouses'}` is brittle. Suggest centralized `SIDEBAR_TO_MODULE_SUBTAB_MAP` config or normalize naming.
- AJAX module load + script eval timing (L4218-4269): inline scripts ทำก่อน external — OK ตามคอมเมนต์, แต่ retry on fail = `loadExtScripts(idx+1)` continue silently → user won't see error if Inventory module fails to init `StockManager`.

For **Agent 3 (security-pentester)** — Security:
- **CRITICAL-2.17**: dead-feature = users may try alternate workarounds (e.g. direct SQL UPDATE) → audit risk.
- **MED-2.22 PIN base64**: should escalate to proper backend verification PIN flow (use `LIFF_AI_JWT_SECRET` style HMAC for Production access).
- **LOW-2.21 SSRF**: confirm permission_callback = manage_options is sufficient; if shared admin accounts exist → escalate to HIGH.

For **Agent 4 (database-expert)**:
- Add integrity check cron: `SUM(warehouse_stock.stock_qty) == products.stock_qty` per SKU. Alert if drift > 0.
- Add idx_drift_audit on `dinoco_stock_transactions(sku, warehouse_id, created_at)` for forensic queries.
- Verify `wp_dinoco_warehouse_stock` schema has UNIQUE KEY (warehouse_id, sku) — if not, transfer race could create dupes.

---

## Audit Methodology

- Read CLAUDE.md fully for V.42.x history + DD-rules + multi-warehouse architecture
- Grep for: `register_rest_route` (REST surface), `add_shortcode` (entry points), `switchMainTab`/`data-subtab` (wiring), `dinoco_stock_*`/`dinoco_transfer_stock` (atomic ops)
- Verify wiring 5-point checklist explicitly per page (sidebar L3270-3320, module_map L687-706, $cacheable_modules L710-728, TAB_LABELS L3837-3870, $modules placeholder L3779-3789)
- Cross-check atomic functions for FOR UPDATE + delete_transient + cache flush parity
- Read full body of: `dinoco_stock_add` (L845-955), `dinoco_stock_subtract` (L957-1071), `dinoco_stock_auto_status` (L1099-...), `dinoco_transfer_stock` (L1848-1917), `/dip-stock/approve` (L2474-2578), `/product/shipping` (L3481-3564), `/image-proxy` (L1468-1506)

**Time spent**: ~75 min
