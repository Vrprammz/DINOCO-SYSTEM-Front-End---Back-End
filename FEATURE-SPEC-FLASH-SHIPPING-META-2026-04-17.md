# Feature Spec — Flash Shipping Metadata (Weight / Dimensions / Category / Vehicle)

> **Status**: Draft pending approval
> **Date**: 2026-04-17
> **Author**: Claude Opus 4.7 (via tech-lead orchestration)
> **Parent**: `CLAUDE.md`, `FEATURE-SPECS.md`
> **Related**: `FEATURE-SPEC-B2B-BACKORDER-2026-04-16.md`, Flash API docs, Flash Label condition 202411.pdf
> **Estimated Effort**: ~18-22 ชม. (5 phases)

---

## 1. Executive Summary

### 1.1 Problem
ระบบ DINOCO ปัจจุบัน **ไม่ได้ส่งข้อมูลน้ำหนัก / มิติ / ประเภทสินค้า / ขนาดพัสดุ** ไปให้ Flash Express API ตอนสร้าง PNO ทำให้:

1. Flash backend ไม่รู้ขนาด/น้ำหนัก → auto-dispatch **รถมอเตอร์ไซค์ทุกครั้ง** → ของใหญ่ส่งไม่ได้
2. ค่าส่งที่ Flash คำนวณใหม่ที่โกดังอาจต่างจากประมาณการ → บิลผิด
3. Admin ต้องติดต่อ Flash support ทุกครั้งที่ต้องการรถกระบะ (manual workflow)

### 1.2 Solution
เพิ่ม **shipping metadata layer** ครอบคลุม:
- **Master data**: `wp_dinoco_products` เก็บ weight / L×W×H / article_category / express_category ต่อ leaf SKU
- **Auto-compute**: ระบบ aggregate จาก order items (B2B) หรือ form input (Manual)
- **Vehicle routing**: ส่ง `expressCategory=4` เมื่อพัสดุใหญ่ → Flash auto-assign รถกระบะ
- **Scanner integration**: Manual-ship รองรับ barcode scan → auto-fill จาก catalog

### 1.3 Impact
- B2B ticket flow: PNO ใหม่จะมี weight/dims ครบ → Flash routing ถูก
- Manual-ship: admin กรอก/scan → PNO มีข้อมูลครบ
- Inventory: master data centralized (SKU-level shipping info)
- Backward compat: 100% — old orders ไม่กระทบ, fallback defaults ถ้า SKU ยังไม่ตั้ง

---

## 2. Scope — Systems Affected

### 2.1 Primary systems
| System | Snippet / File | Impact |
|---|---|---|
| Inventory DB schema | `[B2B] Snippet 15` V.7.6 → V.8.0 | **ADD** 6 columns to `wp_dinoco_products` |
| Inventory Admin UI | `[Admin System] DINOCO Global Inventory Database` V.42.x → V.43.0 | **ADD** edit modal section + bulk edit + CSV import |
| Core helpers | `[Admin System] DINOCO Global Inventory Database` | **ADD** `dinoco_get_sku_shipping()` + `dinoco_compute_order_shipping()` |
| B2B Flash create | `[B2B] Snippet 1` V.33.7 → V.34.0 | **REFACTOR** `b2b_flash_create_order` → auto-compute from items |
| B2B Admin UI | `[Admin System] DINOCO Admin Dashboard` V.32.6 → V.33.0 | **ADD** shipping preview panel + override |
| Manual-ship backend | `[B2B] Snippet 3` V.41.2 → V.42.0 | **ADD** accept dims/category params |
| Manual-ship frontend | `rpi-print-server/templates/manual_ship.html` V.41 → V.42 | **ADD** UI fields + SKU scanner |
| RPi dashboard | `rpi-print-server/dashboard.py` V.41.0 → V.42.0 | **ADD** `/api/sku-shipping/{sku}` proxy |

### 2.2 Secondary systems (touched indirectly)
| System | Change |
|---|---|
| Flash webhook handler (`[B2B] Snippet 3` `b2b_flash_manual_shipment_webhook` + `b2b_flash_webhook`) | **Read-only** — webhook updates status only, no shipping metadata change. Verify no regression |
| MCP Bridge (`[System] DINOCO MCP Bridge`) | `/product-lookup` endpoint **ADD** `shipping` object in response (weight/dims/category) |
| B2F PO flow | **NO CHANGE** — B2F ≠ Flash Express (ใช้ไปรับที่โรงงาน) |
| Regression Guard | **ADD** 3 scenarios (REG-028/029/030 — shipping metadata coverage) |

### 2.3 Docs / Wiki
| Doc | Update |
|---|---|
| `CLAUDE.md` | Section "Flash Shipping Metadata" (new) + update "Manual Flash Shipping" + "Box Calculation" |
| `SYSTEM-REFERENCE.md` | Snippet table version bumps + `wp_dinoco_products` schema |
| `WORKFLOW-REFERENCE.md` | Update B2B shipping flow + Manual-ship flow diagrams |
| `FEATURE-SPECS.md` | Add Section 6 — Flash Shipping Metadata |
| `rpi-print-server/CLAUDE.md` | Scanner integration + dashboard.py V.42 |
| `.second-brain/log.md` | FIX entry |
| `.second-brain/hot-cache.md` | Current Focus update |

---

## 3. Decisions (to be confirmed)

| # | Decision | Recommendation | Status |
|---|---|---|---|
| D1 | Shipping data level | **Leaf SKU only** (matches DD-2) — SET computed via aggregation | ✅ confirmed |
| D2 | `articleCategory` per SKU | **NOT needed** — DINOCO สินค้าทั้งหมด = อะไหล่มอเตอร์ไซค์ (type เดียว) → global constant `articleCategory=6` (อะไหล่รถยนต์) | ✅ confirmed |
| D3 | Vehicle selection UX | **C. Auto + Override** — pending user decision after Flash confirms behavior | ⏳ pending Flash Q4 |
| D4 | SKU scan behavior | **A+B**: lookup catalog → auto-fill, fallback to manual entry | ✅ confirmed |
| D5 | `expressCategory` threshold | `weight > 20000g OR any dim > 60cm` → category=4 (configurable) | ⏳ pending Flash Q4 |
| D6 | Existing box calc (`boxes_per_unit`) | **Keep separate** from new fields — both coexist | ✅ confirmed |

### Flash Enum (confirmed from Flash API docs)

**articleCategory** (Code → ความหมาย):
```
0=เอกสาร · 1=อาหารแห้ง · 2=ของใช้ · 3=อุปกรณ์ไอที · 4=เสื้อผ้า · 5=สื่อบันเทิง
6=อะไหล่รถยนต์ ← DINOCO ใช้ค่านี้
7=รองเท้า/กระเป๋า · 8=อุปกรณ์กีฬา · 9=เครื่องสำอางค์ · 10=เฟอร์นิเจอร์
11=ผลไม้ · 12=ต้นไม้ · 99=อื่นๆ
```

**expressCategory** (Code → ความหมาย):
```
1=ธรรมดา (มอเตอร์ไซค์ default)
2=On-Time Delivery
4=ราคาพิเศษสำหรับพัสดุขนาดใหญ่ ← DINOCO ใช้สำหรับของใหญ่
5=พัสดุผลไม้
6=Happy Return
7=Happy Return Bulky
9=พัสดุต้นไม้
```

**Error codes to handle** (Flash API Constants):
```
1003 = เลขแทรคกิ้งซ้ำ → regenerate outTradeNo + retry
1010 = pickup เรียกซ้ำ → treat as success (already handled in V.41.2)
1020 = Insured declare value ต้องมากกว่า 0 → validation if insured=1
1021 = รหัสไปรษณีย์ต้องเป็น 5 หลัก → frontend + backend validate
1022 = พื้นที่ต้นทางยังไม่เปิดให้บริการ → alert admin, cannot retry
```

---

## 4. Data Model

### 4.1 Schema — `wp_dinoco_products` (new columns)

```sql
ALTER TABLE wp_dinoco_products
  ADD COLUMN weight_grams INT UNSIGNED DEFAULT NULL
    COMMENT 'น้ำหนักต่อ 1 piece leaf SKU (g). NULL = use global default',
  ADD COLUMN length_cm SMALLINT UNSIGNED DEFAULT NULL
    COMMENT 'ความยาวกล่อง (cm)',
  ADD COLUMN width_cm SMALLINT UNSIGNED DEFAULT NULL
    COMMENT 'ความกว้างกล่อง (cm)',
  ADD COLUMN height_cm SMALLINT UNSIGNED DEFAULT NULL
    COMMENT 'ความสูงกล่อง (cm)',
  ADD COLUMN article_category TINYINT UNSIGNED DEFAULT 1
    COMMENT 'Flash articleCategory enum (1=general, 2=doc, 3=fragile, ...)',
  ADD COLUMN express_category TINYINT UNSIGNED DEFAULT 1
    COMMENT 'Flash expressCategory (1=standard-bike, 4=bulky-truck)';
```

**Convention**:
- เก็บที่ **leaf SKU เท่านั้น** (DD-2 pattern — ตัดสต็อกเฉพาะ leaf)
- SET / sub-SET / child node → NULL → compute on-the-fly จาก leaves
- Admin UI hide fields for non-leaf SKU (read-only display จาก computed)

### 4.2 Global defaults — `wp_option`

Key: `dinoco_shipping_defaults`
```json
{
  "weight_grams": 1000,
  "length_cm": 30,
  "width_cm": 20,
  "height_cm": 10,
  "article_category": 1,
  "express_category": 1,
  "vehicle_threshold": {
    "weight_g": 20000,
    "max_dim_cm": 60
  }
}
```

### 4.3 Per-ticket override (existing meta — keep)

- `_flash_weight_grams` — admin override per ticket
- `_flash_article_category` — admin override per ticket
- `_flash_express_category` — admin override per ticket
- **NEW**: `_flash_length_cm` / `_flash_width_cm` / `_flash_height_cm`

Priority chain: `ticket meta` > `auto-compute from items` > `global default`

### 4.4 Relation to existing box calc (DO NOT CONFUSE)

| Concept | Field | Meaning | Used for |
|---|---|---|---|
| **PNO count** | `boxes_per_unit` | สินค้า 1 ชิ้น = กี่กล่อง Flash | นับจำนวน PNO ใน `b2b_calculate_total_boxes` |
| **PNO count** | `units_per_box` | 1 กล่อง = สินค้ากี่ชิ้น | นับจำนวน PNO |
| **NEW — Shipping size** | `weight_grams` + `L×W×H` | ขนาดจริงของกล่อง 1 ใบ | ส่ง Flash API params |
| **NEW — Product type** | `article_category` | ประเภทสินค้า (Flash enum) | Flash routing |
| **NEW — Vehicle** | `express_category` | 1=bike / 4=truck | Flash dispatch vehicle |

**Interaction**: `b2b_calculate_box_manifest()` บอกว่าจะมี PNO กี่ใบ + SKU ไหนไปกล่องไหน → NEW fields บอกขนาด/น้ำหนักแต่ละกล่อง → compound ข้อมูลเข้า Flash API per PNO (subParcel หรือ main parcel)

---

## 5. API Contract

### 5.1 New REST endpoints — `dinoco-stock/v1/`

```
GET  /wp-json/dinoco-stock/v1/sku-shipping/{sku}
     Permission: manage_options OR X-Print-Key
     Response: {
       success: true,
       sku: "DNCL001",
       is_leaf: true,
       weight_grams: 1500,
       length_cm: 25,
       width_cm: 15,
       height_cm: 10,
       article_category: 1,
       express_category: 1,
       source: "product_catalog" | "computed" | "default"
     }

POST /wp-json/dinoco-stock/v1/product/shipping
     Permission: manage_options
     Body: { sku, weight_grams, length_cm, width_cm, height_cm,
             article_category, express_category }
     Response: { success, updated_fields[] }

POST /wp-json/dinoco-stock/v1/product/shipping/bulk
     Permission: manage_options
     Body: { items: [{sku, ...}, ...] }  // max 500/request

GET  /wp-json/dinoco-stock/v1/shipping-defaults
POST /wp-json/dinoco-stock/v1/shipping-defaults
     Manage wp_option 'dinoco_shipping_defaults'

POST /wp-json/dinoco-stock/v1/shipping-compute
     Body: { items: [{sku, qty}, ...] }
     Response: { weight_grams, length_cm, width_cm, height_cm,
                 article_category, express_category, details[] }
     // Used by manual-ship preview + B2B ticket preview
```

### 5.2 Updated `b2b_rest_manual_flash_create` accepts new params

```
POST /wp-json/b2b/v1/manual-flash-create (updated)
Body: {
  sender_key: 'dinoco' | 'foxrider',
  dst_name, dst_phone, ...,
  item_desc, remark, box_count,

  // V.42 NEW (all optional)
  weight: 1500,              // grams (existing)
  length: 25,                // cm NEW
  width: 15,                 // cm NEW
  height: 10,                // cm NEW
  article_category: 1,       // NEW (default 1)
  express_category: 1,       // 1 or 4 NEW (default 1)

  // V.42 NEW — auto-fill hint (if scanner used)
  sku_ref: 'DNCL001'         // optional — trace origin
}
```

### 5.3 Flash API request params (updated)

```php
// b2b_flash_create_order / b2b_rest_manual_flash_create
$params = array(
    ...existing...,
    'expressCategory' => $shipping['express_category'],  // 1 or 4
    'articleCategory' => $shipping['article_category'],
    'weight'          => $shipping['weight_grams'],
    // NEW (optional — only send if known, > 0)
    'length' => $shipping['length_cm'] ?: null,
    'width'  => $shipping['width_cm']  ?: null,
    'height' => $shipping['height_cm'] ?: null,
);
// Drop null values before sending (Flash ignores unknown params)
$params = array_filter($params, fn($v) => $v !== null && $v !== '');
```

### 5.4 Multi-box subParcel (for B2B tickets with total_boxes > 1)

```json
{
  "outTradeNo": "6267-1",
  "expressCategory": 4,
  "articleCategory": 1,
  "weight": 8000,
  "length": 60, "width": 40, "height": 30,
  "subParcel": [
    {"outTradeNo": "6267-1-1", "weight": 4000, "length": 40, "width": 30, "height": 20},
    {"outTradeNo": "6267-1-2", "weight": 4000, "length": 40, "width": 30, "height": 20}
  ]
}
```

---

## 6. Core Helpers (new)

### 6.1 `dinoco_get_sku_shipping($sku)` — Primary read
```php
function dinoco_get_sku_shipping(string $sku): array {
    // 1. Try custom table lookup (leaf SKU)
    // 2. If non-leaf → call dinoco_compute_set_shipping()
    // 3. If still missing → merge with global default
    // 4. Return array: weight_grams, length_cm, width_cm, height_cm,
    //    article_category, express_category, source
}
```

### 6.2 `dinoco_compute_set_shipping($sku, $qty = 1)` — SET aggregation
```php
function dinoco_compute_set_shipping(string $sku, int $qty = 1): array {
    // Walk leaves via dinoco_get_leaf_skus($sku)
    // weight: sum(leaf.weight * leaf_qty_per_set * $qty)
    // dims: max side per axis × stacking heuristic (configurable)
    // article_category: majority vote (most common) or highest priority
    // express_category: max (if any leaf = 4, overall = 4)
}
```

### 6.3 `dinoco_compute_order_shipping($items)` — Order-level aggregation
```php
function dinoco_compute_order_shipping(array $items): array {
    // items = [{sku, qty}, ...]
    // For each item → get_sku_shipping or compute_set_shipping
    // Aggregate across items (sum weight, stack dims, max express_cat)
    // Return per-order shipping + per-box breakdown
}
```

### 6.4 `dinoco_suggest_express_category($weight, $dims)` — Vehicle logic
```php
function dinoco_suggest_express_category(int $weight_g, array $dims): int {
    $defaults = get_option('dinoco_shipping_defaults', []);
    $w_threshold = $defaults['vehicle_threshold']['weight_g']    ?? 20000;
    $d_threshold = $defaults['vehicle_threshold']['max_dim_cm']  ?? 60;
    $max_dim = max($dims['L'] ?? 0, $dims['W'] ?? 0, $dims['H'] ?? 0);
    return ($weight_g > $w_threshold || $max_dim > $d_threshold) ? 4 : 1;
}
```

---

## 7. UI / UX Design

### 7.1 Inventory Admin — Edit Product Modal

เพิ่ม section "📦 ขนาดพัสดุ & Flash":

```
┌────────────────────────────────────────────────────────┐
│ 📦 ขนาดพัสดุ & Flash Shipping (Leaf SKU เท่านั้น)        │
├────────────────────────────────────────────────────────┤
│ น้ำหนัก [_____] g   (ต่อ 1 piece)                        │
│                                                        │
│ ขนาดกล่อง:                                              │
│  ยาว [__] cm  กว้าง [__] cm  สูง [__] cm                │
│                                                        │
│ ประเภทสินค้า: [1 - สินค้าทั่วไป ▼]                        │
│                                                        │
│ รถที่ใช้จัดส่ง:                                          │
│  ○ 🏍️ ปกติ — มอเตอร์ไซค์ (expressCategory=1)             │
│  ○ 🚚 ขนาดใหญ่ — รถกระบะ (expressCategory=4)             │
│  ● 🤖 Auto (system suggest based on weight/dims)         │
│                                                        │
│ ─────────────────────────────────────────              │
│ Preview จาก Flash API params:                          │
│   weight: 1500g, 25×15×10 cm                           │
│   articleCategory: 1 · expressCategory: 1 (bike)        │
└────────────────────────────────────────────────────────┘
```

**For non-leaf SKU** (SET / child with grandchildren) → แสดงเป็น read-only:
```
📦 ขนาดพัสดุ (คำนวณจาก leaves อัตโนมัติ)
น้ำหนักรวม: 6000g (= 1500g × 4 leaves)
ขนาดกล่องรวม: ~60×40×30 cm (max stacking)
[ดู leaves → คลิก ✏️ ที่ leaf แต่ละตัวเพื่อแก้]
```

### 7.2 Inventory Admin — Bulk Edit CSV

UI: "📋 Bulk Import Shipping" button → upload CSV → preview → apply

CSV format:
```csv
sku,weight_grams,length_cm,width_cm,height_cm,article_category,express_category
DNCL001,1500,25,15,10,1,1
DNCR001,1500,25,15,10,1,1
DNCSETX001,,,,,1,4
```

### 7.3 B2B Admin Dashboard — Ticket Shipping Panel

เพิ่มใน ticket detail view:

```
┌──────────────────────────────────────────────────┐
│ 📦 Flash Shipping (ticket #6267)                  │
├──────────────────────────────────────────────────┤
│ Computed from 1 item × 1 box:                    │
│   น้ำหนักรวม: 5,600 g  ·  60×40×30 cm            │
│   articleCategory: 1  ·  expressCategory: 4 🚚    │
│                                                  │
│ [Override] [Send to Flash]                       │
└──────────────────────────────────────────────────┘
```

### 7.4 Manual-ship Form (new layout)

```
┌─ SENDER ──────────────┐  ┌─ RECIPIENT ──────┐  ┌─ PARCEL (V.42) ──────────┐
│ DINOCO / FoxRider     │  │ Name / Phone     │  │ 🔍 Scan SKU: [________]  │
│ Pickup: รามอินทรา 14   │  │ Address / City   │  │  ↑ auto-fill below       │
│ Label: 21/106 ลาดพร้าว│  │                  │  │                          │
└───────────────────────┘  └──────────────────┘  │ หรือ: [Browse SKU ▼]     │
                                                  │                          │
                                                  │ น้ำหนัก [_____] g         │
                                                  │ กxยxส (cm) [_][_][_]     │
                                                  │ ประเภท: [ทั่วไป ▼]       │
                                                  │                          │
                                                  │ รถ: 🏍️ ปกติ / 🚚 ใหญ่     │
                                                  │  (auto suggest: ใหญ่)     │
                                                  │                          │
                                                  │ จำนวนกล่อง [_]            │
                                                  │ หมายเหตุ [_____]          │
                                                  └──────────────────────────┘
```

**Scanner integration**:
- Hidden input focused by default → scanner types + Enter
- On enter → `GET /api/sku-shipping/{sku}` → auto-fill
- Visual feedback: green flash on success, red + shake on not-found
- Fallback: "Browse SKU" dropdown → paginated list from catalog
- Manual override: user can edit auto-filled values

---

## 8. Phases & Agent Distribution

### 📋 Phase 0 — Research & Spec Finalization (1-2 ชม)

**Lead**: `tech-lead` (this file)
**Agents**:
- `api-specialist` → confirm Flash API spec (articleCategory enum, expressCategory semantics, multi-box subParcel behavior). Contact Flash via LINE group if needed.
- `data-research` → gather Thai e-commerce standards for parcel classification (JWD / Kerry / J&T) for comparison

**Deliverables**:
- Answer D1-D5 decisions
- Final Flash enum mapping (or "use 1 default, TBD later")
- Signed-off spec document

**Gate**: User approves decisions → proceed Phase 1

---

### 🟢 Phase 1 — Inventory Schema + Helpers (4-5 ชม)

**Lead**: `database-expert`
**Agents**:
- `database-expert` → design ALTER TABLE migration, verify no lock issues on production table (~10k rows), plan backfill strategy
- `fullstack-developer` → implement:
  - `[B2B] Snippet 15` V.7.6 → V.8.0: schema migration + dbDelta + 3 helpers (`dinoco_get_sku_shipping`, `dinoco_compute_set_shipping`, `dinoco_compute_order_shipping`)
  - Global defaults wp_option management
- `code-reviewer` → review schema + helpers → block if SQL injection / missing indexes / race conditions

**Files**:
- `[B2B] Snippet 15: Custom Tables & JWT Session` V.7.6 → V.8.0 (DB_ID 1039)

**Testing**:
- PHP `php -l` syntax check
- Helper unit tests with mock SKU tree (leaf / child / SET / grandchild)
- Backward compat: old SKU without columns → returns default

**Deliverables**:
- Migration script + helpers deployed
- Global defaults seeded
- Helper return shape documented

---

### 🟡 Phase 2 — Inventory Admin UI + REST (4-5 ชม)

**Lead**: `fullstack-developer` (coordinated with `frontend-design`)
**Agents**:
- `frontend-design` → design modal section, bulk edit UI, CSV import flow, responsive layout
- `fullstack-developer` → implement:
  - Edit Product modal section (leaf vs non-leaf conditional rendering)
  - Bulk edit UI + CSV import/export
  - 5 new REST endpoints (`sku-shipping/{sku}`, `product/shipping`, `.../bulk`, `shipping-defaults`, `shipping-compute`)
- `ux-ui-expert` → review flow (non-leaf read-only, admin override clarity, preview accuracy)
- `code-reviewer` → review REST endpoints (permission_callback, nonce, input sanitization)
- `security-pentester` → audit bulk import (CSV injection / file upload / size limits)

**Files**:
- `[Admin System] DINOCO Global Inventory Database` V.42.x → V.43.0

**Testing**:
- Browser: test leaf SKU edit, SET SKU read-only display, CSV import 100 rows
- Security: malicious CSV (formula injection `=SUM()`, SQL in SKU, >10MB file)
- Accessibility: keyboard nav, screen reader labels

**Deliverables**:
- Admin can edit shipping info per SKU + bulk
- REST endpoints live + tested
- CSV import with validation report

---

### 🟠 Phase 3 — B2B Ticket Integration (2-3 ชม)

**Lead**: `fullstack-developer`
**Agents**:
- `api-specialist` → verify Flash API payload structure (multi-box subParcel edge cases)
- `fullstack-developer` → refactor:
  - `[B2B] Snippet 1` V.33.7 → V.34.0: `b2b_flash_create_order` auto-compute from items, `b2b_flash_create_all_boxes` add subParcel support
  - Admin Dashboard ticket view → shipping preview panel + override modal
- `code-reviewer` → regression check (backward compat with per-ticket meta override)
- `browser-tester` → create test plan for 5 scenarios (single leaf / SET / multi-box / admin override / no data → fallback)

**Files**:
- `[B2B] Snippet 1: Core Utilities & LINE Flex Builders` V.33.7 → V.34.0 (DB_ID 72)
- `[Admin System] DINOCO Admin Dashboard` V.32.6 → V.33.0

**Testing**:
- Create test ticket with known SKU → verify Flash API payload has weight/dims
- Multi-box order → subParcel array populated correctly
- Admin override → meta values take precedence
- Legacy ticket (no catalog data) → fallback to global default (no error)

**Deliverables**:
- B2B tickets auto-send shipping metadata to Flash
- Admin can preview + override per ticket

---

### 🔵 Phase 4 — Manual-ship Integration + Scanner (3-4 ชม)

**Lead**: `fullstack-developer` + `frontend-design` (equal)
**Agents**:
- `frontend-design` → design manual_ship.html V.42 UI (scanner input, fallback dropdown, live preview, mobile)
- `fullstack-developer` → implement:
  - `[B2B] Snippet 3` V.41.2 → V.42.0: accept new params in `b2b_rest_manual_flash_create` + validation
  - `rpi-print-server/dashboard.py` V.41 → V.42: proxy `/api/sku-shipping/{sku}` + scanner helpers
  - `rpi-print-server/templates/manual_ship.html` V.41 → V.42: SKU scan input + auto-fill + fallback dropdown
- `api-specialist` → verify scanner latency + concurrency (multiple scans)
- `browser-tester` → test scanner flow with real USB barcode gun simulation
- `ux-ui-expert` → review: does scanner feedback help boss understand what's happening? Is fallback clear?

**Files**:
- `[B2B] Snippet 3: LIFF E-Catalog REST API` V.41.2 → V.42.0 (DB_ID 52)
- `rpi-print-server/dashboard.py` V.41.0 → V.42.0
- `rpi-print-server/templates/manual_ship.html` V.41 → V.42

**Testing**:
- Scanner: scan known SKU → auto-fill correctly
- Unknown SKU → clear error + fallback to manual entry
- Mix scan + manual override → values saved correctly
- Mobile test: scanner on Pi4 touchscreen (480×320 kiosk)

**Deliverables**:
- Manual-ship form supports scanner
- Admin can manually enter/override dimensions
- Full shipping metadata sent to Flash

---

### 🟣 Phase 5 — Migration + Documentation + Monitoring (2-3 ชม)

**Lead**: `tech-lead`
**Agents**:
- `business-ops` → generate list of "SKUs without shipping data" report → prioritize top-selling SKUs for admin to fill first
- `fullstack-developer` → add dashboard widget "Shipping Data Coverage" (% of active SKUs with complete data)
- `diagram-generator` → update architecture diagrams (new data flow: Catalog → aggregation → Flash API)
- `skill-library` → create 3 regression scenarios:
  - REG-028 (CRITICAL): Large parcel without dims → old behavior (fallback to default small size)
  - REG-029 (HIGH): SET with mixed leaf dims → aggregate correctly
  - REG-030 (MEDIUM): Manual ship with scanner → auto-fill then override

**Files**:
- `.github/workflows/regression-guard.yml` (restore + add 3 scenarios)
- `openclawminicrm/scripts/seed-regression.js`
- `CLAUDE.md`, `SYSTEM-REFERENCE.md`, `WORKFLOW-REFERENCE.md`, `FEATURE-SPECS.md`
- `rpi-print-server/CLAUDE.md`
- `.second-brain/log.md`, `.second-brain/hot-cache.md`

**Deliverables**:
- Coverage report in Admin Dashboard
- Docs + wiki updated
- Regression scenarios seeded

---

## 9. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Flash rejects order (weight+dims contradict) | Low | Medium | Validation range + fallback to default if admin unsure |
| Legacy orders break | Very Low | High | Backward compat — null params dropped from payload |
| Bulk import corrupts data | Medium | High | Preview + rollback + CSV schema validation |
| Scanner mis-scans → wrong SKU | Medium | Low | Visual confirmation + manual override always available |
| Admin forgets to fill new fields | High | Low | Coverage dashboard + warning badge |
| SET aggregation math wrong | Medium | Medium | Unit tests + admin preview before Flash API call |
| Flash articleCategory enum changes | Low | Low | Default to 1 (safe) — config-driven mapping |
| Production deploy (10k SKUs) slow | Low | Medium | ALTER TABLE chunked + off-peak window |

---

## 10. Backward Compatibility & Rollback

### Compat (all changes additive)
- Old SKUs without shipping data → global default fallback
- Old tickets without `_flash_weight_grams` meta → auto-compute from current catalog (with default fallback)
- Manual-ship API accepts both old payload (no dims) and new (with dims) → `array_filter null` drops missing fields
- Flash API ignores unknown params → safe to send null dims

### Rollback plan
| Phase | Rollback Action | Time |
|---|---|---|
| 1 | No rollback needed (additive schema) — new columns remain NULL if unused | — |
| 2 | Disable Admin UI section via feature flag `dinoco_shipping_admin_ui` → hide | Instant |
| 3 | Revert Snippet 1 to V.33.7 via GitHub Webhook Sync | 2 min |
| 4 | Revert Snippet 3 + dashboard.py + manual_ship.html via git + RPi pull | 5 min |
| 5 | No rollback needed (docs/monitoring) | — |

### Feature flag (Phase 2-4 safety)
- `dinoco_shipping_meta_enabled` (wp_option, default `false` during beta)
- When `false`: helpers return default, Admin UI hidden, B2B/Manual use fallback behavior (current V.41 code path)
- When `true`: full new behavior active

---

## 11. Open Questions (to discuss)

1. **Shipping data required or optional per SKU?**
   - Optional (current proposal): Admin fills gradually, global default covers rest
   - Required (stricter): New SKU creation blocked until shipping fields filled

2. **Vehicle override audit trail?**
   - Should manual override log `_b2b_express_category_override` + user_id + timestamp for audit?
   - Recommendation: Yes (same pattern as other admin actions)

3. **CSV import for bulk edit — max rows per file?**
   - 500 (safe), 1000 (practical), 5000 (aggressive)?
   - Recommendation: 500 per request, paginated for larger jobs

4. **Scanner hardware support?**
   - USB HID mode (type like keyboard) — no driver needed
   - Bluetooth — needs pairing, battery
   - Recommendation: USB HID only for Phase 1, BT later

5. **Show shipping info to distributor?**
   - LIFF dealer view (b2b_orders) — show "พัสดุ 5kg 60×40×30 cm" before confirming?
   - Privacy: dealer doesn't need exact dims, just "ใหญ่/เล็ก"
   - Recommendation: NO — admin-only for now

---

## 12. Success Criteria

- ✅ 100% of new B2B tickets send `weight + dims + articleCategory + expressCategory` to Flash
- ✅ Admin can edit shipping per SKU + bulk CSV
- ✅ Manual-ship scanner works — 3-second scan-to-fill latency
- ✅ `expressCategory=4` tickets → Flash dispatches รถกระบะ (verified with 5 test orders)
- ✅ Coverage dashboard shows > 80% active SKUs with complete shipping data within 2 weeks
- ✅ Zero regression in B2B ticket flow (existing tests pass)
- ✅ Rollback tested (disable feature flag → old behavior restored)

---

## 13. Timeline (proposed sprint)

| Week | Phase | Delivery |
|---|---|---|
| Week 1 Day 1 | 0 — Research | Decisions confirmed |
| Week 1 Day 2-3 | 1 — Schema + Helpers | DB migration live |
| Week 1 Day 4-5 | 2 — Inventory UI | Admin can edit |
| Week 2 Day 1 | 3 — B2B integration | Tickets send metadata |
| Week 2 Day 2-3 | 4 — Manual-ship + Scanner | Full flow live |
| Week 2 Day 4 | 5 — Migration + Docs | Coverage tracking + rollout |
| Week 2 Day 5 | Canary + monitor | 10% traffic with flag ON |
| Week 3 | Full rollout | flag=ON for all |

Total: ~10 working days (flexible based on approval cycles)

---

## 14. Files Touched — Complete List

| File | Phase | Version | DB_ID |
|---|---|---|---|
| `[B2B] Snippet 15: Custom Tables & JWT Session` | 1 | V.7.6 → V.8.0 | 1039 |
| `[Admin System] DINOCO Global Inventory Database` | 1+2 | V.42.x → V.43.0 | — |
| `[B2B] Snippet 1: Core Utilities & LINE Flex Builders` | 3 | V.33.7 → V.34.0 | 72 |
| `[Admin System] DINOCO Admin Dashboard` | 3 | V.32.6 → V.33.0 | — |
| `[B2B] Snippet 3: LIFF E-Catalog REST API` | 4 | V.41.2 → V.42.0 | 52 |
| `rpi-print-server/dashboard.py` | 4 | V.41.0 → V.42.0 | — |
| `rpi-print-server/templates/manual_ship.html` | 4 | V.41 → V.42 | — |
| `[System] DINOCO MCP Bridge` (optional) | 5 | — → V.2.1 | — |
| `openclawminicrm/scripts/seed-regression.js` | 5 | — | — |
| `CLAUDE.md` | 5 | — | — |
| `SYSTEM-REFERENCE.md` | 5 | — | — |
| `WORKFLOW-REFERENCE.md` | 5 | — | — |
| `FEATURE-SPECS.md` | 5 | — | — |
| `rpi-print-server/CLAUDE.md` | 5 | — | — |
| `.second-brain/log.md` | 5 | — | — |
| `.second-brain/hot-cache.md` | 5 | — | — |

---

## 15. Agent Orchestration Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                    tech-lead (orchestrator)                     │
└────────────┬────────────────┬──────────────┬───────────────────┘
             │                │              │
    ┌────────▼────────┐ ┌────▼─────┐ ┌─────▼──────┐
    │  Phase 0        │ │ Phase 1  │ │  Phase 2   │
    │  Research       │ │ Schema   │ │  Admin UI  │
    ├─────────────────┤ ├──────────┤ ├────────────┤
    │ api-specialist  │ │ database-│ │ frontend-  │
    │ data-research   │ │ expert   │ │ design     │
    │                 │ │ fullstack│ │ fullstack  │
    │                 │ │ code-rev │ │ ux-ui      │
    │                 │ │          │ │ code-rev   │
    │                 │ │          │ │ security   │
    └─────────────────┘ └──────────┘ └────────────┘
             │                │              │
             └────────┬───────┴──────────────┘
                      │
        ┌─────────────▼─────────────┐
        │   Phase 3 — B2B Ticket    │
        ├───────────────────────────┤
        │ api-specialist            │
        │ fullstack-developer       │
        │ code-reviewer             │
        │ browser-tester            │
        └─────────────┬─────────────┘
                      │
        ┌─────────────▼─────────────┐
        │  Phase 4 — Manual-ship    │
        ├───────────────────────────┤
        │ frontend-design           │
        │ fullstack-developer       │
        │ api-specialist            │
        │ browser-tester            │
        │ ux-ui-expert              │
        └─────────────┬─────────────┘
                      │
        ┌─────────────▼─────────────┐
        │  Phase 5 — Docs + Monitor │
        ├───────────────────────────┤
        │ business-ops              │
        │ fullstack-developer       │
        │ diagram-generator         │
        │ skill-library             │
        └───────────────────────────┘
```

---

## 16. Approval Gate

**Before Phase 1 starts, user must approve**:
- [ ] D1: Leaf-only shipping data ✅/❌
- [ ] D2: Start with articleCategory=1, update later ✅/❌
- [ ] D3: Auto + admin override (C) ✅/❌
- [ ] D5: Vehicle threshold (20kg / 60cm) ✅/❌
- [ ] Total effort estimate OK ✅/❌
- [ ] Phase sequence OK ✅/❌
- [ ] Rollback plan OK ✅/❌

**User sign-off**: ___________ Date: _______

---

# PART II — EXHAUSTIVE APPENDIX (Sections 17-26)

> **Added**: 2026-04-17 by tech-lead orchestration (Phase 1 discovery).
> Purpose: production-ready spec covering EVERY touchpoint across 60+ files.
> Source of truth for decisions: Part I (Sections 1-16). Part II expands, does NOT contradict.

---

## 17. Complete Flash API Integration Map

ระบบปัจจุบันเรียก Flash API **15 endpoints** ผ่าน wrapper `b2b_flash_request()` (Snippet 1 line 4013). ทุก endpoint ใช้ HMAC sign (`b2b_flash_sign`) + nonceStr.

### 17.1 Flash API Helper Functions (Snippet 1 — DB_ID 72)

| # | Helper (line) | Flash endpoint | Current params | New params (V.42) | Files affected | Agent lead |
|---|---|---|---|---|---|---|
| 1 | `b2b_flash_request()` (4013) | — (generic wrapper) | mchId, nonceStr, sign | — (no change) | S1 | api-specialist |
| 2 | `b2b_flash_create_order()` (4132) | `open/v3/orders` | expressCategory(1), articleCategory, srcName, src*, dst*, weight, insured, codEnabled | +length, width, height (cm); expressCategory=auto(1 or 4) | S1 | fullstack-developer |
| 3 | `b2b_flash_cancel_order()` (4230) | `open/v1/orders/{pno}/cancel` | pno (path) | no change | S1 | — |
| 4 | `b2b_flash_get_label_pdf()` (4237) | `open/v1/orders/{pno}/pre_print` | pno | no change | S1 | — |
| 5 | `b2b_flash_get_small_label_pdf()` (4243) | `open/v1/orders/{pno}/small/pre_print` | pno | no change | S1 | — |
| 6 | `b2b_flash_notify_courier()` (4249) | `open/v1/notify` | (params incl warehouseNo TBD — Q1) | warehouseNo per Flash answer | S1 | api-specialist |
| 7 | `b2b_flash_cancel_notify()` (4255) | `open/v1/notify/{pickup_id}/cancel` | pickup_id | no change | S1 | — |
| 8 | `b2b_flash_get_notifications()` (4261) | `open/v1/notifications` | date (required) | no change | S1 | — |
| 9 | `b2b_flash_get_routes()` (4269) | `open/v1/orders/{pno}/routes` | pno | no change | S1 + S7 cron | — |
| 10 | `b2b_flash_get_routes_batch()` (4275) | `open/v1/orders/routesBatch` | pnos CSV | no change | S1 + S7 cron | — |
| 11 | `b2b_flash_get_pod()` (4281) | `open/v1/orders/{pno}/deliveredInfo` | pno | no change | S1 | — |
| 12 | `b2b_flash_estimate_rate()` (4287) | `open/v1/orders/estimate_rate` | — | NEW caller: preview cost with weight/dims | S1 + Admin Dashboard | fullstack-developer |
| 13 | `b2b_flash_modify_order()` (4293) | `open/v1/orders/modify` | — | potentially modify expressCategory post-creation (TBD Q5) | S1 | api-specialist |
| 14 | `b2b_flash_get_order_by_mch_pno()` (4299) | `open/v3/ordersByMchPno` | outTradeNo, mchPno | no change | S1 debug | — |
| 15 | `b2b_flash_get_warehouses()` (4308) | `open/v1/warehouses` | — | **CRITICAL — list warehouseNo for D9 routing** | S1 + S9 Admin Control | api-specialist |
| 16 | `b2b_flash_setup_webhook()` (4314) | `open/v1/setting/web_hook_service` | url, code | no change | S9 | — |
| 17 | `b2b_flash_get_webhook_info()` (4320) | `gw/fda/open/standard/webhook/setting/infos` | — | no change | S9 | — |
| 18 | `b2b_flash_address_lookup()` (4326) | `gw/fda/open/standard/address_core/url/query` | — | no change | — | — |
| 19 | `b2b_flash_verify_webhook()` (4341) | — (HMAC verify) | mchId, nonceStr, sign | no change | S3 webhook | — |
| 20 | `b2b_flash_notify_courier_from_warehouse()` (4743) | calls `b2b_flash_notify_courier()` | warehouse src_* + parcel_count | **ADD warehouseNo (D9 routing)** | S1 + all callers | api-specialist + fullstack-developer |
| 21 | `b2b_flash_create_all_boxes()` (4765) | loops `b2b_flash_create_order()` | box_num/total_boxes | **refactor to pass box-level weight/dims** (subParcel) | S1 + S3 | fullstack-developer |

### 17.2 REST Endpoints by Snippet (internal — /wp-json/b2b/v1/)

| Endpoint | Snippet | Function | Permission | Changes (V.42) |
|---|---|---|---|---|
| `/flash-create` | S5 (line 93) | `b2b_rest_flash_create` | admin ($ap) | **Auto-compute shipping from items** before calling `b2b_flash_create_all_boxes` |
| `/flash-label` | S5 (100) | `b2b_rest_flash_label` | admin | No change |
| `/flash-ready-to-ship` | S5 (101) | `b2b_rest_flash_ready_to_ship` | admin | Auto-call `b2b_flash_notify_courier_from_warehouse` — NEW: pass warehouseNo |
| `/flash-cancel` | S5 | `b2b_rest_flash_cancel` | admin | No change |
| `/flash-cancel-notify` | S5 (103) | `b2b_rest_flash_cancel_notify` | admin | No change |
| `/flash-switch-manual` | S5 (104) | `b2b_rest_flash_switch_manual` | admin | No change |
| `/debug-flash/{ticket_id}` | S5 (106) | inline | admin | **ADD shipping preview in response** |
| `/flash-webhook` | S3 (154) | `b2b_rest_flash_webhook` | public (HMAC verify) | No change — read-only from Flash |
| `/flash-webhook-setup` | S9 (55) | `b2b_rest_flash_webhook_setup` | admin | No change |
| `/flash-api-test` | S9 (56) | `b2b_rest_flash_api_test` | admin | **ADD warehouseNo list refresh button** |
| `/flash-tracking` | S5 | `b2b_rest_flash_tracking` | admin | No change |
| `/flash-dashboard-stats` | S5 | — | admin | No change |
| `/flash-ship-packed` | S5 | — | admin | No change |
| `/manual-flash-ready` | S3 (188) | `b2b_rest_manual_flash_ready` | print-key | **ADD warehouseNo** |
| `/manual-flash-create` | S3 (179) | `b2b_rest_manual_flash_create` | print-key | **V.42 adds 4 params: length, width, height, article_category, express_category, sku_ref** |
| `/manual-flash-cancel` | S3 (185) | `b2b_rest_manual_flash_cancel` | print-key | No change |
| `/manual-flash-label` | S3 (192) | `b2b_rest_manual_flash_label` | print-key | No change |
| `/manual-flash-status` | S3 (195) | `b2b_rest_manual_flash_status` | print-key | No change |
| `/manual-flash-test` | S3 (198) | `b2b_rest_manual_flash_test` | print-key | No change |
| `/manual-shipments` | S3 (183) | `b2b_rest_manual_shipments` | print-key | **ADD shipping filter** (e.g. "large parcels only") |
| `/manual-reprint` | S3 | — | print-key | No change — reprints from snapshot |
| `/flash-test/orders` | S9 (58) | `b2b_rest_flash_test_orders` | admin | No change |
| `/flash-test/run-step` | S9 (59) | `b2b_rest_flash_test_run_step` | admin | No change |
| `/flash-test/simulate-webhook` | S9 (60) | `b2b_rest_flash_test_simulate_webhook` | admin | No change |

### 17.3 RPi Proxy Routes (dashboard.py V.41 → V.42)

| Route | Upstream | Changes V.42 |
|---|---|---|
| `POST /api/manual-flash-create` (line 564) | WP `/manual-flash-create` | Pass new form fields |
| `POST /api/manual-flash-cancel` (684) | WP `/manual-flash-cancel` | No change |
| `POST /api/manual-flash-ready` (705) | WP `/manual-flash-ready` | No change |
| `POST /api/manual-flash-label` (726) | WP `/manual-flash-label` | No change |
| `POST /api/manual-flash-status` (763) | WP `/manual-flash-status` | No change |
| `POST /api/manual-flash-test` (784) | WP `/manual-flash-test` | No change |
| `GET /api/sku-shipping/<sku>` | **NEW** — proxy to WP `/dinoco-stock/v1/sku-shipping/{sku}` | Scanner support |
| `GET /api/manual-reprint` | WP | No change |

---

## 18. Complete Storage Inventory

### 18.1 `wp_dinoco_products` columns (current + new)

Current schema (Snippet 15 line 58-100, 27 columns):
```
id, sku, name, subtitle, category, image_url,
base_price, price_silver, price_gold, price_platinum, price_diamond,
warranty_years, stock_status, b2b_discount_percent,
boxes_per_unit, units_per_box, min_order_qty,
oos_eta_date, is_active, b2b_visible, stock_qty,
low_stock_threshold, reorder_point,
last_dip_stock_date, last_dip_stock_qty,
bo_eta_buffer_days, bo_eta_override, bo_note,
manual_hold, manual_hold_reason, manual_hold_by,
compatible_models, oos_timestamp, oos_duration_hours,
stock_updated_at, created_at, updated_at
```

**New columns (V.8.0)** — 6 columns:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `weight_grams` | INT UNSIGNED NULL | NULL | Per-piece leaf weight (g) — NULL = fallback to global default |
| `length_cm` | SMALLINT UNSIGNED NULL | NULL | Box length (cm) |
| `width_cm` | SMALLINT UNSIGNED NULL | NULL | Box width (cm) |
| `height_cm` | SMALLINT UNSIGNED NULL | NULL | Box height (cm) |
| `article_category` | TINYINT UNSIGNED | 6 | Flash enum (6=อะไหล่รถยนต์ default for DINOCO, per D2) |
| `express_category` | TINYINT UNSIGNED | 1 | Flash enum (1=bike, 4=truck/bulky) |

**Index**: `KEY idx_shipping_query (weight_grams, express_category)` — useful for forecast/coverage reports.

### 18.2 `wp_options` keys (shipping/flash/warehouse)

| Key | Type | New/Existing | Purpose |
|---|---|---|---|
| `b2b_warehouse_address` | array | existing (S9 line 363) | Pickup source — wh_name/phone/address/district/city/province/postcode + wh_default_weight + wh_article_category |
| `b2b_registered_address` | array | existing (S9 line 364) | Printed-on-label sender (reg_name/phone/address/district/province/postcode) |
| `b2b_shipping_mode` | string | existing (S9 line 400) | `manual` \| `flash` — master switch |
| `b2b_manual_shipments_YYYY_MM` | array | existing (S3 line 2549, 4496) | Monthly log of manual shipments (per-month partitioning) |
| `dinoco_shipping_defaults` | array (JSON) | **NEW** | Global fallback: weight_grams, L/W/H/cm, article_category, express_category, vehicle_threshold{weight_g, max_dim_cm} |
| `dinoco_shipping_meta_enabled` | bool | **NEW** | Feature flag (default=false during beta; true after canary) |
| `dinoco_flash_warehouse_map` | array | **NEW (D9)** | `{ "BKN_SP": {desc,address,vehicles:['bike']}, "5BKN_PDC": {desc,address,vehicles:['truck']} }` mapping expressCategory → warehouseNo |
| `dinoco_shipping_scanner_config` | array | **NEW** | Scanner preferences (beep, auto-focus, flash on success) |
| `dinoco_flash_vehicle_override_log` | array | **NEW** (optional Q2) | Audit of admin manual vehicle overrides |

### 18.3 Post meta keys (B2B ticket — CPT `b2b_order`)

| Meta key | New/Existing | Purpose |
|---|---|---|
| `tracking_number` (ACF) | existing | Primary PNO (CSV if multi-box) |
| `shipping_provider` (ACF) | existing | "Flash" / "Manual" / carrier name |
| `total_boxes` (ACF) | existing | Auto-calculated box count |
| `_flash_tracking_numbers` | existing | Array of PNOs (multi-box) |
| `_flash_pno_statuses` | existing | `{pno: {status, weight, ...}}` |
| `_flash_packing_status` | existing | FSM: none/flash_created/print_queued/print_done/ready_to_ship/courier_called/picked_up/in_transit/delivering/delivered/... |
| `_flash_status` | existing | Aggregate status |
| `_flash_pickup_id` | existing | Flash ticketPickupId |
| `_flash_tracking_events` | existing | Event log |
| `_flash_courier_info` | existing | Courier details |
| `_flash_shipping_cost` | existing | Actual cost from Flash webhook |
| `_flash_actual_weight` | existing | Weight reported by Flash at warehouse |
| `_flash_delivered_at` | existing | Delivery timestamp |
| `_flash_weight_grams` | existing | Admin override weight |
| `_flash_article_category` | existing | Admin override article |
| `_flash_express_category` | existing | Admin override vehicle |
| `_flash_insured_baht` | existing | Insurance declaration |
| `_flash_create_error` | existing | Last API error |
| `_flash_notify_error` | existing | Courier notify error |
| `_flash_pod_data` | existing | Proof of delivery JSON |
| `_stock_returned` | existing | Cancel restore guard (S5 V.31.7) |
| `_b2b_is_walkin` | existing | Walk-in bypass flag |
| `_flash_length_cm` | **NEW** | Per-ticket length override (cm) |
| `_flash_width_cm` | **NEW** | Per-ticket width override (cm) |
| `_flash_height_cm` | **NEW** | Per-ticket height override (cm) |
| `_flash_warehouse_no` | **NEW (D9)** | warehouseNo used (BKN_SP/5BKN_PDC) — audit |
| `_flash_vehicle_override` | **NEW** | `{by:user_id, from, to, at, reason}` — if admin overrode auto-suggestion |
| `_flash_shipping_source` | **NEW** | `computed` / `meta_override` / `default_fallback` — trace where data came from |

### 18.4 Transients

| Key | TTL | New/Existing | Purpose |
|---|---|---|---|
| `b2b_flash_active_pickup` | 4 HOUR_IN_SECONDS | existing (S3 line 2718) | Batched pickup state — multiple tickets share single Flash notify call |
| `manual_flash_status_{pno}` | variable | existing (S3 line 4558) | Cached status from webhook updates |
| `b2b_reserved_map_bulk` | — | existing | Stock reservation cache |
| `b2b_sku_data_map` | — | existing | Catalog cache |
| `dinoco_shipping_coverage_stats` | 1 HOUR_IN_SECONDS | **NEW** | Cached coverage % (Section 24 observability) |
| `dinoco_sku_shipping_{sku}` | 5 MINUTE_IN_SECONDS | **NEW** | Per-SKU helper cache (invalidated on product update) |

### 18.5 Indexes needed for new queries

```sql
-- Coverage report: SKUs missing shipping data
CREATE INDEX idx_shipping_coverage ON wp_dinoco_products (is_active, weight_grams);

-- Forecast by vehicle type
CREATE INDEX idx_express_cat ON wp_dinoco_products (is_active, express_category);
```

Verify: `EXPLAIN SELECT sku FROM wp_dinoco_products WHERE is_active=1 AND weight_grams IS NULL` should use idx_shipping_coverage (not full-table scan).

---

## 19. Complete UI Surfaces Audit

### 19.1 Admin-facing surfaces

| # | Surface | File | Lines | New elements | Agent |
|---|---|---|---|---|---|
| 1 | Inventory — Product Catalog grid | `[Admin System] DINOCO Global Inventory Database` | main shortcode | Badge 🚚 on items with expressCategory=4 | frontend-design |
| 2 | Inventory — Edit Product modal | same | `openEditCatalogModal` | **NEW section** "📦 ขนาดพัสดุ & Flash" (Part I §7.1) | frontend-design |
| 3 | Inventory — Bulk Edit | same | new | **NEW** "Bulk Shipping Import" CSV button (Part I §7.2) | frontend-design |
| 4 | Inventory — Coverage widget | same | new | **NEW** card "% SKUs ที่มีข้อมูล shipping ครบ" | business-ops |
| 5 | Inventory — Forecast tab | same | existing `/forecast` | ADD "รถที่ต้องใช้" column (bike/truck count) | business-ops |
| 6 | B2B Admin Dashboard — Ticket detail | `[Admin System] DINOCO Admin Dashboard` | ticket modal | **NEW** shipping preview + override (Part I §7.3) | frontend-design |
| 7 | B2B Admin Dashboard — Shipping tab | `[B2B] Snippet 12: Admin Dashboard LIFF` line 71 | tab='shipping' | ADD vehicle badge column (🏍️/🚚) | frontend-design |
| 8 | B2B Admin Dashboard — Flash tab | S12 line 76 | tab='flash' | ADD warehouseNo column + pickup vehicle type | frontend-design |
| 9 | B2B Admin Dashboard — Packing KPIs | `[B2B] Snippet 5: Admin Dashboard` | flash_packing_status queries | ADD KPI "รอรถกระบะ N" | business-ops |
| 10 | B2B Admin Control — Print Settings | `[B2B] Snippet 9: Admin Control Panel` line 1224-1242 | warehouse/registered address forms | **NEW** tab "Shipping Defaults" (wp_option `dinoco_shipping_defaults` editor) | frontend-design |
| 11 | B2B Admin Control — Flash tab | S9 new | — | **NEW** "Warehouse Mapping" viewer (expressCategory → warehouseNo) + refresh from Flash API | frontend-design |
| 12 | Manual-ship form | `rpi-print-server/templates/manual_ship.html` | ~196 | **NEW** fields: SKU scan, L/W/H, express category chips (Part I §7.4) | frontend-design |
| 13 | Manual-ship table | same | line 553 | ADD vehicle icon col (🏍️/🚚) | frontend-design |
| 14 | RPi Kiosk | `rpi-print-server/templates/kiosk.html` | line 879+ scan packing | ADD vehicle type in ticket preview | frontend-design |
| 15 | Dashboard HTML (dashboard.py) | `rpi-print-server/templates/dashboard.html` | — | ADD shipping metadata column in manual-ship list | frontend-design |
| 16 | Print Settings — Warehouse config | S9 line 1224-1233 | wh_* form | ADD `wh_default_weight` + `wh_article_category` UI (currently stored but no UI) | frontend-design |

### 19.2 Customer/Dealer-facing surfaces

| # | Surface | File | Lines | Decision | Agent |
|---|---|---|---|---|---|
| 17 | B2B LIFF customer — order list | `[B2B] Snippet 11: Customer LIFF Pages` | — | **NO shipping metadata shown** (privacy — see Open Q5) | — |
| 18 | B2B LIFF customer — tracking banner | `[B2B] Snippet 8: Distributor Ticket View` line 531-533 | `.flash-banner` | **NO change** — tracking display unchanged | — |
| 19 | LINE Flex — tracking notification | S1 `b2b_build_flex_flash_admin/status` (line 4511+, 4647+) | — | **NO change** — existing flex templates stay | — |
| 20 | Invoice PDF | `rpi-print-server/templates/invoice.html` | — | **NO weight/dims** on invoice (finance doc, not shipping) | — |
| 21 | Shipping label PDF | `rpi-print-server/templates/shipping_label.html` | — | Optional: add weight indicator (small footer — admin-only utility) | frontend-design |
| 22 | Manual shipping label | `rpi-print-server/templates/manual_shipping_label.html` | — | Same as above — optional weight indicator | frontend-design |
| 23 | Picking list | `rpi-print-server/templates/picking_list.html` line 74 | `item_boxes = qty * boxes_per_unit` | **NO change** — uses existing box calc | — |

### 19.3 Print templates impact (detailed)

| Template | Current | V.42 change | Notes |
|---|---|---|---|
| `invoice.html` | Finance doc (A4) | No change | Invoice is finance-scope, not shipping |
| `shipping_label.html` | 100×180mm thermal + barcode | Add small "น้ำหนัก: 5kg · 60×40×30" footer if admin-visible | WeasyPrint-rendered, not Flash PDF |
| `manual_shipping_label.html` | Same as above for manual-ship | Same addition | Uses `label_sender` from V.41.1 |
| `picking_list.html` / `_thermal.html` | Box count per item | No change | Uses `boxes_per_unit` only, independent of new fields |
| `kiosk.html` packing scan | FSM transitions | Optional: show expected vehicle on packing | Low priority |
| `dashboard.html` | Admin panel | Add shipping coverage card | Data from new REST `/shipping-coverage` |

---

## 20. Complete FSM Impact Matrix

### 20.1 B2B Order Status → Shipping Action → Vehicle

(Sources: `[B2B] Snippet 14: Order State Machine`, S5 `/flash-create`, S3 `/flash-ready-to-ship`, S7 `b2b_flash_tracking_cron`)

| B2B status | Shipping phase (`_flash_packing_status`) | Action | Vehicle decided | Code path |
|---|---|---|---|---|
| `draft` | — | — | — | S14 FSM |
| `checking_stock` | — | — | — | S14 |
| `pending_stock_review` (BO V.1.6) | — | Admin reviews | — | S16 |
| `partial_fulfilled` | — | Admin splits BO | — | S16 |
| `awaiting_confirm` | — | — | — | S14 |
| `confirmed` | `none` | — | — | S14 |
| `billed` | `none` | — | — | S14 |
| `paid` | `none` | Ready to ship (admin triggers flash-create) | **DECIDED HERE** — auto-compute from items → expressCategory=1 or 4 | S5 `/flash-create` → S1 `b2b_flash_create_order` |
| `packed` | `flash_created` → `print_queued` → `print_done` | Packing + print label (RPi) | — (already decided) | S5 + print_client.py |
| `packed` | `ready_to_ship` | Admin calls courier | **warehouseNo picked from D9 mapping** based on expressCategory | S5 `/flash-ready-to-ship` → S1 `b2b_flash_notify_courier_from_warehouse` |
| `packed` | `courier_called` | Pickup scheduled | Pickup upgrade logic: if second ticket on same day has expressCategory=4, a SECOND pickup for truck is called (D3) | S3 line 2764-2819 |
| `shipped` | `picked_up` | Flash picked up | — (transit) | Flash webhook |
| `shipped` | `in_transit` / `delivering` / `delivered` | — | — | Webhook or cron S7 line 1091-1226 |
| `completed` | `delivered` + 24h grace | Auto-close (S7 `b2b_flash_24hr_complete`) | — | — |
| `cancelled` | Any | Cancel PNO + restore stock + optionally cancel pickup | — | S5 flash-cancel/flash-cancel-notify |

### 20.2 FSM transitions that fire Flash actions

| Transition | Fires | New in V.42 |
|---|---|---|
| `paid → packed` | `b2b_flash_create_all_boxes()` | **auto-compute shipping from items BEFORE call** |
| `packed:print_done → packed:ready_to_ship` | nothing (admin scans) | — |
| `packed:ready_to_ship → packed:courier_called` | `b2b_flash_notify_courier_from_warehouse()` | **pass warehouseNo based on D9** |
| `any → cancelled` | `b2b_flash_cancel_order()` + `b2b_flash_cancel_notify()` | — |
| `bo-fulfill` (S16) | `b2b_flash_create_secondary()` (H5 Snippet 16 line 1361) | **secondary order ALSO gets auto-compute + vehicle detection** |

### 20.3 Walk-in bypass

Walk-in distributors (`_b2b_is_walkin=1`) skip Flash entirely (auto-completed per CLAUDE.md Walk-in section). **No impact** — V.42 only runs when shipping mode = `flash`.

---

## 21. Error Handling Matrix

| Flash error code | Meaning | User-facing message | Recovery action | Retry logic |
|---|---|---|---|---|
| 1003 | เลขแทรคกิ้งซ้ำ (outTradeNo conflict) | "ระบบสร้างเลขซ้ำ กำลังลองใหม่" | Regenerate `MAN-YYMMDDHHMMSS-NNN` suffix, retry once | 1 retry auto |
| 1010 | Pickup notify ซ้ำ | "มีการแจ้งรับของแล้ว" | Treat as success (already V.41.2) | Skip retry |
| 1020 | Insured declare value = 0 | "กรุณาระบุมูลค่าประกัน" | Validate `_flash_insured_baht > 0` before submit | Frontend guard |
| 1021 | Postcode ≠ 5 หลัก | "รหัสไปรษณีย์ไม่ถูกต้อง" | Frontend regex `/^\d{5}$/` + backend PHP validate | No retry |
| 1022 | Origin area not serviced | "พื้นที่ต้นทางยังไม่เปิดบริการ" | Alert admin via LINE Flex → `_flash_create_error` + suggest switch to Manual mode | Cannot retry — manual override |
| `expressCategory` mismatch (TBD Q4) | Flash rejects vehicle | "ไม่สามารถใช้รถประเภทนี้สำหรับพื้นที่นี้" | Fallback to expressCategory=1 + log `_flash_vehicle_override` | 1 retry with fallback |
| Invalid weight (> 100kg?) | Out of range | "น้ำหนักเกินกำหนด" | Frontend cap + backend validate (1g–100kg) | No retry |
| Dim out of range (TBD Q5) | Flash rejects dimensions | "ขนาดกล่องเกินกำหนด" | Alert + admin split into multiple boxes | No retry |
| warehouseNo invalid (D9) | Wrong warehouse code | "รหัสโกดังผิด" | Refresh warehouseNo list via `/flash-api-test` | 1 retry after refresh |
| Rate limit (429) | Too many requests | "ระบบคิวเต็ม" | Exponential backoff | 3 retries: 2s, 5s, 15s |
| Network timeout | Connection issue | "การเชื่อมต่อช้า" | Queue via wp-cron (existing `b2b_flash_courier_retry` hook S3 line 2855) | 3 retries via cron |

**Recovery UX**: All errors log to `_flash_create_error` / `_flash_notify_error` meta + Telegram alert for CRITICAL (1022, warehouseNo invalid).

---

## 22. Migration & Backfill Plan

### 22.1 Step-by-step migration order

```
Step 0 — Pre-flight (5 min)
├─ Backup wp_dinoco_products table (mysqldump)
├─ Verify row count (~10k expected)
└─ Snapshot current wp_options keys (b2b_warehouse_address, b2b_shipping_mode)

Step 1 — Schema migration (2 min, off-peak window)
├─ dbDelta adds 6 columns (ALTER TABLE)
├─ Add idx_shipping_coverage index
├─ Verify: SHOW COLUMNS FROM wp_dinoco_products LIKE 'weight_grams' returns 1 row
└─ Validate: no rows changed (ALTER TABLE is non-destructive)

Step 2 — Global defaults seed
├─ update_option('dinoco_shipping_defaults', {weight:1000, L:30, W:20, H:10, article:6, express:1, threshold:{w:20000, d:60}})
├─ update_option('dinoco_shipping_meta_enabled', false)  -- feature flag OFF
└─ update_option('dinoco_flash_warehouse_map', {BKN_SP:{...bike}, 5BKN_PDC:{...truck}})

Step 3 — Helper functions deploy
├─ Commit S1 V.8.0 (new helpers)
├─ Helpers return global default for all SKUs (flag OFF = existing behavior)
└─ Verify: b2b_flash_get_order_weight() unchanged for existing tickets

Step 4 — Admin UI deploy (flag still OFF)
├─ Inventory UI hides new section until flag ON
└─ Verify: no visible change to admin

Step 5 — Canary (flag ON for 1 admin user via conditional)
├─ update_option('dinoco_shipping_meta_enabled_users', [1])  -- admin user ID 1
├─ Helpers check flag per user context
├─ Manual-ship test: scan 5 SKUs → verify Flash API accepts payload
└─ B2B test: create 3 test tickets → verify weight/dims sent

Step 6 — Full rollout
├─ update_option('dinoco_shipping_meta_enabled', true)
├─ Monitor Flash error rate (target: 0% increase)
└─ If error_rate > 5% within 1 hour → auto-rollback (flag OFF)

Step 7 — Backfill top 100 SKUs
├─ Business-ops generates list: SELECT sku, name FROM wp_dinoco_products WHERE is_active=1 ORDER BY stock_qty DESC LIMIT 100
├─ Admin fills weight/dims via Bulk CSV
└─ Coverage widget → target 80% in 2 weeks
```

### 22.2 Rollback triggers

| Trigger | Action | Recovery time |
|---|---|---|
| Flash error rate > 5% in 1 hour | Auto-flag OFF (cron check) | Instant |
| Admin reports wrong vehicle dispatch | Manual flag OFF via wp-cli | 1 min |
| Schema migration fails | Revert via mysqldump | 5 min |
| Helper function fatal error | GitHub revert V.7.6 | 2 min via webhook sync |

### 22.3 Data validation post-migration

```sql
-- No unexpected NULLs
SELECT COUNT(*) FROM wp_dinoco_products WHERE article_category IS NULL;  -- should be 0 (default=6)

-- Active SKUs coverage
SELECT
  COUNT(*) AS total,
  SUM(weight_grams IS NOT NULL) AS has_weight,
  ROUND(SUM(weight_grams IS NOT NULL) * 100.0 / COUNT(*), 1) AS coverage_pct
FROM wp_dinoco_products WHERE is_active=1;
```

---

## 23. Testing Matrix

| # | Scenario | Steps | Expected | Regression ID |
|---|---|---|---|---|
| T01 | Single leaf SKU with shipping data | Order 1 × DNCL001 → flash-create | Flash payload: weight=1500, L=25, W=15, H=10, express=1 | REG-028 |
| T02 | SET SKU aggregation | Order 1 × SET (contains L+R) → flash-create | Flash payload: weight = L.weight + R.weight | REG-029 |
| T03 | Multi-box (boxes_per_unit > 1) | Order 1 × DNCBIG (boxes=2) → flash-create | 2 PNOs created, each with per-box dims | REG-029 |
| T04 | Multi-box qty > units_per_box | Order 10 × DNCSMALL (units_per_box=5) → flash-create | ceil(10/5) = 2 PNOs | REG-029 |
| T05 | Admin override express=4 | Edit ticket meta → express=4 → flash-create | Flash uses 4 (meta takes precedence) | REG-030 |
| T06 | Large parcel auto-detect | Order 1 × DNCXL (weight=25kg) → flash-create | expressCategory=4 auto-computed | REG-028 |
| T07 | No shipping data (legacy SKU) | Order 1 × DNCLEGACY (no weight) → flash-create | Falls back to global default, payload succeeds | REG-028 |
| T08 | Manual-ship with scanner | Open /manual-ship → scan DNCL001 → submit | weight/L/W/H auto-filled, Flash accepts | REG-030 |
| T09 | Manual-ship unknown SKU | Scan INVALIDSKU | Red flash + fallback to manual entry | REG-030 |
| T10 | Manual-ship manual override | Scan DNCL001 → edit weight to 3000 → submit | 3000 wins (override) | REG-030 |
| T11 | Multi-pickup same day | Create ticket A (bike) → courier called → Create ticket B (truck) | 2 pickup notifications with different warehouseNo (D3) | REG-031 (new) |
| T12 | BO secondary order vehicle | Split BO → fulfill → verify H5 flash secondary | Secondary order re-evaluates vehicle (not copy from primary) | REG-032 (new) |
| T13 | Feature flag OFF | Disable flag → create ticket | Behavior = V.7.6 (default weight 1000g, no L/W/H) | REG-033 (new) |
| T14 | Bulk CSV import | Upload CSV with 100 rows | Preview shows 100 rows, apply updates all | REG-030 |
| T15 | CSV injection attempt | Upload row with `sku="=SUM(A1)"` | Sanitized, no formula execution | Security regression |
| T16 | Flash rejects (1022) | Simulate via test endpoint | Error Flex to admin, order stays at `paid` | Error matrix |
| T17 | Cancel ticket after pickup | Cancel after `courier_called` | cancel-order + cancel-notify both fire | Existing |
| T18 | Webhook updates weight | Flash webhook sends actual weight | `_flash_actual_weight` updated, no side effect on new fields | Existing |
| T19 | Rollback test | Flag OFF mid-session | Next ticket uses default, existing tickets unchanged | REG-033 |
| T20 | Coverage widget | 20 SKUs set, 80 missing | Widget shows 20% | REG-030 |

---

## 24. Observability Plan

### 24.1 Metrics to track

| Metric | Where logged | Dashboard | Alert threshold |
|---|---|---|---|
| Shipping data coverage % | `dinoco_shipping_coverage_stats` transient | Admin Dashboard new widget | < 50% after 2 weeks |
| Flash error rate (create) | `b2b_log` grep `[Flash] Create failed` | Admin Dashboard Flash tab | > 5% rolling 1hr |
| Auto-detected vehicle=4 count | Query `_flash_express_category=4` | Finance dashboard | Info only (for cost projections) |
| Admin override count | `dinoco_flash_vehicle_override_log` | Admin Dashboard | > 20% of orders = auto-suggest wrong |
| Scanner success rate | dashboard.py log | RPi Kiosk | < 90% = scanner needs tuning |
| warehouseNo mismatch | `_flash_warehouse_no` vs expected | Flash tab | Any = config review |
| Subparcel failure rate | Flash API response | Flash tab | > 1% |
| Pickup upgrade calls (D3) | Transient counter | Flash tab | Info only |
| CSV import errors | `b2b_log` + toast | Inventory UI | Per-batch |

### 24.2 Telegram alerts (n้องกุ้ง)

- **CRITICAL**: Flash error 1022 → alert CEO
- **WARN**: Coverage drops > 10pts week-over-week
- **INFO**: Daily summary — N orders, X auto-bike / Y auto-truck / Z admin-override

### 24.3 Admin Dashboard widgets (new)

1. **Coverage card**: % SKUs with complete shipping data (green/amber/red)
2. **Vehicle mix pie**: bike vs truck distribution last 7 days
3. **Top 10 missing SKUs**: by order frequency (prioritize backfill)
4. **Warehouse pickup heatmap**: calls per warehouseNo per day

---

## 25. Launch Checklist

### 25.1 Pre-launch (Phase 0-1)

- [ ] Flash answers received for Q1-Q11 (warehouseNo routing, multi-pickup)
- [ ] D1-D9 decisions signed off by user
- [ ] Feature flag `dinoco_shipping_meta_enabled` defined + default=false
- [ ] Backup wp_dinoco_products + wp_options snapshot
- [ ] Global defaults seeded in dev+staging
- [ ] Warehouse mapping seeded (BKN_SP, 5BKN_PDC)
- [ ] Regression scenarios REG-028/029/030/031/032/033 seeded in `seed-regression.js`
- [ ] Scanner hardware tested on RPi (USB HID mode)
- [ ] Smoke tests on staging: T01-T20 pass
- [ ] 100 top SKUs identified for priority backfill

### 25.2 Launch (Phase 2-4)

- [ ] Deploy S15 V.8.0 (schema + helpers) — verify dbDelta success
- [ ] Deploy Inventory UI V.43.0 — verify hidden UI (flag OFF)
- [ ] Deploy S1 V.34.0 — verify helpers load (PHP lint)
- [ ] Deploy S3 V.42.0 + dashboard.py V.42.0 + manual_ship.html V.42 (RPi pull)
- [ ] Enable flag for 1 admin user (canary) — 24 hours monitor
- [ ] Enable flag globally — monitor 1 hour error rate
- [ ] Telegram alert "V.42 live" → bossGung chat

### 25.3 Post-launch (Phase 5)

- [ ] Coverage widget visible in Admin Dashboard
- [ ] Daily cron: rebuild coverage stats + alert if < threshold
- [ ] Bulk import used by admin (verify 100+ SKUs filled in first 7 days)
- [ ] Regression suite passes weekly
- [ ] Documentation updated (CLAUDE.md, SYSTEM-REFERENCE.md, WORKFLOW-REFERENCE.md, FEATURE-SPECS.md, rpi-print-server/CLAUDE.md, .second-brain/log.md + hot-cache.md)
- [ ] CSV template downloadable from Admin UI
- [ ] Training video recorded for admin (manual-ship scanner + bulk edit)

### 25.4 Success metrics (2 weeks post-launch)

- Coverage ≥ 80% active SKUs
- Zero regression (T01-T20 all pass)
- Flash error rate unchanged or lower
- ≥ 1 real truck dispatch successful (5 test orders per §12)
- Admin override rate < 20% (auto-suggest is correct most of the time)

---

## 26. Agent Task Breakdown (Detailed per-phase, per-file)

### Phase 0 — Research (1-2 hrs)

| Agent | File | Task | Time | Dependencies |
|---|---|---|---|---|
| tech-lead | — | Aggregate Flash answers Q1-Q11 | 30 min | Flash response |
| api-specialist | Flash API docs | Confirm subParcel, warehouseNo behavior | 30 min | Flash contact |
| data-research | — | Compare JWD/Kerry/J&T parcel specs | 30 min | None |

### Phase 1 — Schema + Helpers (4-5 hrs)

| Agent | File | Task | Lines | Time | Deps |
|---|---|---|---|---|---|
| database-expert | S15 V.7.6 → V.8.0 | Design ALTER TABLE + idx_shipping_coverage | ~line 50-120 | 1 hr | Phase 0 |
| fullstack-developer | S15 | Implement 3 helpers: `dinoco_get_sku_shipping`, `dinoco_compute_set_shipping`, `dinoco_compute_order_shipping`, `dinoco_suggest_express_category` | new section | 2 hrs | DB expert |
| fullstack-developer | S15 | Global defaults option management | new | 30 min | — |
| code-reviewer | S15 | SQL injection / race / lint | — | 30 min | Implementation |
| database-expert | — | Verify on staging with 10k rows | — | 30 min | Deploy |

### Phase 2 — Inventory UI + REST (4-5 hrs)

| Agent | File | Task | Lines | Time | Deps |
|---|---|---|---|---|---|
| frontend-design | Global Inventory DB | Modal section design + CSS | Edit Modal | 1 hr | Phase 1 |
| fullstack-developer | same | Implement section (leaf vs non-leaf conditional) | same | 1.5 hrs | Design |
| fullstack-developer | same | Bulk CSV import UI + endpoint | new | 1 hr | — |
| fullstack-developer | same | 5 new REST endpoints (`sku-shipping/{sku}`, `product/shipping`, `/bulk`, `shipping-defaults`, `shipping-compute`) | new | 1 hr | — |
| ux-ui-expert | same | Review non-leaf read-only, override clarity | — | 30 min | Impl |
| code-reviewer | same | permission_callback, nonce, sanitize | — | 30 min | — |
| security-pentester | same | CSV injection, file upload | — | 30 min | Impl |

### Phase 3 — B2B Ticket Integration (2-3 hrs)

| Agent | File | Task | Lines | Time | Deps |
|---|---|---|---|---|---|
| api-specialist | Flash docs | Verify subParcel edge cases | — | 30 min | Phase 0 |
| fullstack-developer | S1 V.33.7 → V.34.0 | Refactor `b2b_flash_create_order` — auto-compute from items | 4132-4228 | 1.5 hrs | Phase 1 helpers |
| fullstack-developer | S1 | Refactor `b2b_flash_create_all_boxes` — subParcel support | 4765-4800 | 1 hr | — |
| fullstack-developer | S1 | Refactor `b2b_flash_notify_courier_from_warehouse` — warehouseNo D9 | 4743-4762 | 30 min | — |
| fullstack-developer | Admin Dashboard V.32.6 → V.33.0 | Shipping preview panel + override modal | new | 1 hr | — |
| code-reviewer | S1 + Admin Dashboard | Regression vs meta override | — | 30 min | — |
| browser-tester | — | T01-T07, T11-T13, T16 | — | 30 min | Deploy |

### Phase 4 — Manual-ship + Scanner (3-4 hrs)

| Agent | File | Task | Lines | Time | Deps |
|---|---|---|---|---|---|
| frontend-design | manual_ship.html V.42 | Scanner UI, fallback dropdown, preview | ~196+ | 1 hr | Phase 1 |
| fullstack-developer | S3 V.41.2 → V.42.0 | Accept new params + validation | 4369-4545 | 1 hr | — |
| fullstack-developer | dashboard.py V.42.0 | Proxy `/api/sku-shipping/{sku}` + scanner helpers | new | 1 hr | — |
| fullstack-developer | manual_ship.html | Scanner JS integration (hidden input, onsubmit) | new | 1 hr | Design |
| api-specialist | — | Verify scanner concurrency | — | 30 min | — |
| browser-tester | — | T08-T10, scanner simulation | — | 30 min | — |
| ux-ui-expert | manual_ship.html | Review scanner feedback clarity | — | 30 min | — |

### Phase 5 — Migration + Docs + Monitoring (2-3 hrs)

| Agent | File | Task | Time | Deps |
|---|---|---|---|---|
| business-ops | — | "Top 100 SKUs missing data" query | 30 min | Phase 1 |
| fullstack-developer | Admin Dashboard | Coverage widget + forecast vehicle col | 1 hr | — |
| diagram-generator | — | Update architecture diagrams (flow: Catalog → agg → Flash) | 30 min | — |
| skill-library | `openclawminicrm/scripts/seed-regression.js` | Seed REG-028..033 (6 scenarios) | 1 hr | — |
| tech-lead | CLAUDE.md + SYSTEM-REFERENCE.md + WORKFLOW-REFERENCE.md + FEATURE-SPECS.md + rpi-print-server/CLAUDE.md | Update all docs | 1 hr | All phases |
| tech-lead | .second-brain/log.md + hot-cache.md | Log FIX entry + update current focus | 15 min | — |

---

## ⚠️ CONTRADICTIONS WITH EXISTING SPEC

None found — Part II is purely additive.

**Note on `article_category` default**: Part I §4.1 uses `DEFAULT 1` (legacy), but §3 D2 + §4.2 global default + Flash enum map updated to `6` (อะไหล่รถยนต์). Part II resolves this: **use 6 as schema default** to match the product-line reality. Update Part I §4.1 schema CREATE TABLE default to 6 during Phase 1 implementation.

---

## 🚧 UNKNOWN / NEEDS FLASH ANSWER

Blocking Phase 3+4 until resolved:

1. **Q1**: Does Flash `/open/v1/notify` require `warehouseNo` param, or is it derived from `srcDetailAddress`? (D9 routing)
2. **Q2**: Can a single merchant have multiple concurrent pickups on same day with different warehouseNo? (D3 upgrade flow)
3. **Q3**: Does Flash accept `length/width/height` alongside `weight`, or only `weight`? (confirm API field names)
4. **Q4**: When `expressCategory=4` + `srcPostalCode` area doesn't support truck, does Flash return 1022 or silently assign bike? (error handling)
5. **Q5**: Can `b2b_flash_modify_order` change `expressCategory` post-creation? (admin correction after print)
6. **Q6**: subParcel — does each sub-parcel have its own expressCategory, or only master?
7. **Q7**: Max subParcel count per master (for multi-box orders with total_boxes > 10)?
8. **Q8**: Is `articleCategory=6` (อะไหล่รถยนต์) correct terminology for motorcycle parts, or is there a motorcycle-specific category?
9. **Q9**: For `BKN_SP` vs `5BKN_PDC` warehouseNo — are these "fulfillment center codes" or "pickup preference codes"? (D9 data model)
10. **Q10**: Does pickup API return an estimated arrival window, or is it always "within 4 hours"?
11. **Q11**: Grab threshold for on-demand — does Flash expose a separate product for Grab same-day, or is it handled via expressCategory?

---

## Sign-off Gate (consolidated)

**Before Phase 1 starts, user must approve ALL of**:

- [ ] Part I Section 16 items (D1-D5, effort, phases, rollback)
- [ ] Part II Section 18.1 — 6 new columns + default=6 for article_category
- [ ] Part II Section 18.3 — 5 new post meta keys
- [ ] Part II Section 20.2 — FSM hook points
- [ ] Part II Section 21 — error handling matrix
- [ ] Part II Section 22 — migration order + rollback triggers
- [ ] Part II Section 23 — T01-T20 test matrix
- [ ] Part II Section 26 — agent task breakdown accepted

**Blocking sign-off**:
- ❗ Flash Q1-Q11 answers (at least Q1, Q2, Q9 critical for Phase 3+4)
- ❗ Decision on Open Q2 (Part I §11) — vehicle override audit trail? (recommended YES)
- ❗ Decision on warehouseNo source — Flash `/open/v1/warehouses` fetch vs hardcode `dinoco_flash_warehouse_map`

**User sign-off (Part II)**: ___________ Date: _______

---

# PART III — DATABASE EXPERT DEEP REVIEW

## 27. DB Expert Deep Review (2026-04-17)

> **Reviewer**: `database-expert` agent (DINOCO DBA lens)
> **Scope**: Schema / indexes / atomicity / migration / performance / integration with existing atomic pattern
> **Method**: Cross-checked Spec §4/§17/§18/§22 against `[B2B] Snippet 15` current schema (DB version `5.16`), existing helpers (`b2b_flash_get_order_weight`, `b2b_flash_get_article_category`), atomic ops convention (`dinoco_stock_add/subtract` `FOR UPDATE` pattern), and transient invalidation chain.

---

### 🎯 27.1 Critical Findings (must fix before Phase 1)

**C1 — `article_category` schema default is contradictory (already flagged §26 "Contradictions")**
Part I §4.1 `DEFAULT 1`, Part II §18.1 `DEFAULT 6`, §22.1 Step 2 global default `article: 6`. dbDelta run with `DEFAULT 1` will set 10k rows to `1`, then any "fix later via ALTER" loses per-row history. **Decision required BEFORE Phase 1**: commit `DEFAULT 6` in CREATE TABLE statement. (Resolution path: Part II §26 note is correct.)

**C2 — Column type overkill risks bloat + wrong semantics**
- `INT UNSIGNED` for `weight_grams` = 4 bytes, max 4.3B grams (4,300 tonnes). **Recommend** `MEDIUMINT UNSIGNED` (3 bytes, max 16,777 kg). Motorcycle parts realistically ≤ 50 kg (50,000 g). Saves 10k × 1 byte = 10 KB (trivial) but signals intent + cap guards bad data (`65535 INT` ≤ 65 kg via SMALLINT UNSIGNED is even tighter and matches Flash max).
- `SMALLINT UNSIGNED` for `length_cm/width_cm/height_cm` = 2 bytes, max 65,535 cm (655 m). **Recommend** `TINYINT UNSIGNED` (1 byte, max 255 cm). Flash max parcel dimension = ~150 cm; 255 cm is more than enough. Saves 3 × 1 byte × 10k = 30 KB + clearer constraint. Any parcel > 255 cm needs special handling anyway (no bike/truck can ship it).
- **Final recommendation**: `weight_grams SMALLINT UNSIGNED` (0-65535 g = 0-65 kg) OR `MEDIUMINT UNSIGNED` if you want headroom. Dims = `TINYINT UNSIGNED`.

**C3 — Missing CHECK constraints leave garbage data door open**
MySQL 8.0.16+ supports enforced CHECK (DINOCO runs 8.x based on schema V.11.0 audit — verified via `b2f_audit_check_mysql_version()`). Recommended CHECKs (added idempotently in migration):
```sql
CHECK (weight_grams IS NULL OR (weight_grams > 0 AND weight_grams <= 60000))
CHECK (length_cm IS NULL OR (length_cm > 0 AND length_cm <= 200))
CHECK (width_cm  IS NULL OR (width_cm  > 0 AND width_cm  <= 200))
CHECK (height_cm IS NULL OR (height_cm > 0 AND height_cm <= 200))
CHECK (article_category BETWEEN 0 AND 99)
CHECK (express_category IN (1, 2, 4, 5, 6, 7, 9))
```
On MySQL < 8.0.16 these are parsed but not enforced — PHP validator becomes primary defense (mirror B2F V.11 pattern §V.7.0 Order Intent).

**C4 — Aggregation query will N+1 unless explicitly batched**
Spec §6.2 `dinoco_compute_set_shipping($sku, $qty)` walks `dinoco_get_leaf_skus()` then **per-leaf** reads `wp_dinoco_products`. For SET with 6 leaves × 3 items per PO = **18 queries** per Flash create. Must use `DINOCO_Catalog::get_by_skus($skus_array)` batch helper (V.7.3, already in Snippet 15 — confirmed line 231-240 contract). **Phase 1 acceptance test**: single PO with 10-item cart must issue ≤ 2 SELECT queries for shipping compute (1 for sku_relations, 1 for catalog batch).

**C5 — Transient invalidation graph is incomplete**
`delete_transient('b2b_sku_data_map')` currently covers pricing/stock_status (Snippet 3 V.32.6). New shipping columns are NOT read by `b2b_get_sku_data_map()` → if you add them there, the existing invalidation covers you. If you introduce a separate per-SKU cache `dinoco_sku_shipping_{sku}` (spec §18.4), you need a new hook. **Recommendation**: piggyback on `b2b_sku_data_map` (add shipping fields to the batch payload) — single invalidation point, zero new code paths. OR drop the per-SKU transient entirely (SELECT on unique sku index is ~0.1ms — caching hides issues rather than solves them at this scale).

---

### ⚠️ 27.2 Warnings (should consider)

**W1 — `express_category DEFAULT 1` vs `DEFAULT NULL` semantics**
Spec says `DEFAULT 1`. This makes "not yet evaluated" indistinguishable from "explicitly bike". Result: coverage widget cannot tell whether admin chose "1" or whether it's the seed default. **Recommend** `DEFAULT NULL` with PHP fallback to 1 in helper. Coverage dashboard can then `COUNT(express_category IS NOT NULL)` for real reviewed-SKU count. Same applies to `article_category` — but D2 decision says "all = 6" so `DEFAULT 6` is fine as a shared-reality signal.

**W2 — Proposed index `idx_shipping_coverage (is_active, weight_grams)` order is optimal, but `idx_express_cat` is marginal**
Cardinality of `express_category` = 2 values (1 and 4) in practice. MySQL's optimizer often prefers full scan over index on a 2-value column for a 10k-row table. **Recommend**: drop `idx_express_cat`. Keep `idx_shipping_coverage`. If you need "all bulky parcels" queries, add `WHERE is_active=1` and rely on `idx_active_visible_name` (existing) + filesort.

**W3 — SET aggregation atomicity (mid-write stale read)**
Flash create reads leaves NOW, PNO is generated immediately. If admin bulk-updates leaf dims mid-PO-creation, the PNO may have wrong dims. Risk is low (seconds-wide window) but non-zero. **Options**:
- (a) Do nothing — shipping is non-critical-path, Flash will overwrite weight on actual-scan anyway (`_flash_actual_weight`). **Recommended** — matches DINOCO's existing pattern (non-debt/non-stock = best-effort read).
- (b) `SELECT ... FOR SHARE` in `dinoco_compute_set_shipping`. Adds lock contention with zero practical benefit. Not recommended.

**W4 — Dual-write to ACF is NOT needed for these 6 columns**
No existing ACF fields for weight/dims/article_category exist; no consumer reads them. Skip the dual-write pattern. Add only to `wp_dinoco_products` + `b2b_sku_data_map` transient payload. Documented in helper contract: "source of truth = custom table only, no ACF mirror".

**W5 — `_flash_warehouse_no` meta adds per-ticket audit but needs index plan**
Spec §18.3 adds `_flash_warehouse_no` post meta. `wp_postmeta` meta_key index covers the lookup, but `meta_value` is TEXT — queries "list all tickets shipped from `5BKN_PDC`" need `meta_value(20)` prefix index. **Recommend** add note to deploy: `CREATE INDEX idx_postmeta_flash_wh ON wp_postmeta(meta_key, meta_value(20))` — OR skip if you only need per-ticket read (never list-by-warehouse).

**W6 — `b2b_flash_active_pickup` transient is 4-hour wp_options-backed**
WP transients without object cache = `wp_options` row `_transient_b2b_flash_active_pickup` (autoload = no by default since WP 5.5, but verify). Server restart does NOT clear — good for recovery. But long-running pickup state (stuck at "courier_called" for hours) can collect stale data. **Recommend**: add `last_updated` field in the transient payload + cleanup cron that purges pickups with no status-change for >24h.

**W7 — Archive manual_shipments data NOT backfilled**
`b2b_manual_shipments_2026_01` is a snapshot JSON. Backfilling shipping_category into archived records = high write cost, low value (already shipped). **Recommend**: leave as-is; add `schema_version: 'v41'` marker on new records so reports can distinguish.

---

### 💡 27.3 Recommendations (nice to have)

**R1 — Version the dbDelta migration properly**
Bump `$db_version = '5.17'` (from current `5.16`) in Snippet 15 init. Use explicit `ALTER TABLE ADD COLUMN IF NOT EXISTS` fallback (same pattern as V.5.5 line 106-119) for MySQL versions where dbDelta silently skips columns.

**R2 — Store `dinoco_shipping_defaults` as single JSON option, not individual keys**
Spec §4.2 shows JSON blob — confirmed correct. Single `wp_options` row autoloaded ONCE per request (vs 7 individual options × 7 autoload DB hits). Make sure `autoload='yes'`.

**R3 — Add a canonical read helper signature**
Return shape (contract for `dinoco_get_sku_shipping`):
```php
[
  'sku' => 'DNCL001',
  'is_leaf' => true,
  'weight_grams' => 1500,
  'length_cm' => 25, 'width_cm' => 15, 'height_cm' => 10,
  'article_category' => 6,
  'express_category' => 1,  // always populated, never null
  'source' => 'sku_catalog' | 'set_computed' | 'global_default',
  'missing_fields' => [],   // list of fields using default
]
```
Consumers (Flash create, Manual-ship, Admin preview) all get the same shape. Auto-suggest runs on top: if `missing_fields` is non-empty, admin sees a "⚠️ ใช้ค่า default" badge.

**R4 — Simple SET aggregation algorithm is sufficient**
Given 90% of DINOCO SETs have 2-6 leaves, **no need for 3D bin-packing**. Use:
- weight = `SUM(leaf.weight × leaf_qty_per_set × order_qty)`
- L = `MAX(leaf.L)` (parts lying side by side along longest axis)
- W = `MAX(leaf.W)`
- H = `SUM(leaf.H × leaf_qty)` capped at packaging-reality (stack height)
- `article_category` = majority vote, tie-break = max (more specialized wins)
- `express_category` = `MAX(leaf.express_category)` (if any leaf = 4, whole order = 4)

Document this heuristic inline + expose via option `dinoco_shipping_aggregation_strategy` for future override.

**R5 — Coverage query is fast even without index, but should be cached**
`SELECT COUNT(*) FROM wp_dinoco_products WHERE is_active=1 AND weight_grams IS NULL` on 10k rows = ~5ms full scan. With `idx_shipping_coverage (is_active, weight_grams)` = ~1ms. Cache the result in `dinoco_shipping_coverage_stats` transient 1h (already spec'd §18.4) — OK as-is.

**R6 — Refactor existing helpers rather than duplicate**
`b2b_flash_get_order_weight()` (Snippet 1 line 4118) currently reads post meta + warehouse config. In V.34.0:
```php
function b2b_flash_get_order_weight($ticket_id) {
    // 1. Per-ticket override (preserve existing)
    $override = get_post_meta($ticket_id, '_flash_weight_grams', true);
    if ($override && intval($override) > 0) return intval($override);
    // 2. V.34 NEW: auto-compute from items
    if (get_option('dinoco_shipping_meta_enabled')) {
        $items = b2b_get_order_items_structured($ticket_id);
        $ship = dinoco_compute_order_shipping($items);
        if (!empty($ship['weight_grams'])) return $ship['weight_grams'];
    }
    // 3. Legacy fallback (preserve)
    $wh = get_option('b2b_warehouse_address', []);
    return !empty($wh['wh_default_weight']) ? intval($wh['wh_default_weight']) : 1000;
}
```
Zero tech debt, feature flag is the switch. `b2b_flash_get_article_category()` follows same 3-tier pattern.

**R7 — Bulk CSV atomicity**
Wrap bulk import in single transaction:
```php
$wpdb->query('START TRANSACTION');
try { /* UPDATE per row */; $wpdb->query('COMMIT'); }
catch (Exception $e) { $wpdb->query('ROLLBACK'); }
```
500 rows × 1 UPDATE each = acceptable. For 5000+ rows, chunk into batches of 500 with separate transactions (idempotent because UPDATE by unique sku).

---

### 📊 27.4 Proposed Schema Adjustments (concrete SQL)

```sql
-- Final ALTER — Phase 1 migration (idempotent via SHOW COLUMNS guard)
ALTER TABLE wp_dinoco_products
  ADD COLUMN weight_grams  SMALLINT UNSIGNED DEFAULT NULL
     COMMENT 'Leaf-only net weight in grams (max 65kg). NULL = use dinoco_shipping_defaults',
  ADD COLUMN length_cm     TINYINT UNSIGNED DEFAULT NULL
     COMMENT 'Box length in cm (max 255). NULL = use default',
  ADD COLUMN width_cm      TINYINT UNSIGNED DEFAULT NULL
     COMMENT 'Box width in cm (max 255)',
  ADD COLUMN height_cm     TINYINT UNSIGNED DEFAULT NULL
     COMMENT 'Box height in cm (max 255)',
  ADD COLUMN article_category TINYINT UNSIGNED NOT NULL DEFAULT 6
     COMMENT 'Flash articleCategory (6=motorcycle parts default)',
  ADD COLUMN express_category TINYINT UNSIGNED DEFAULT NULL
     COMMENT 'Flash expressCategory (1=bike, 4=truck). NULL = auto-suggest from weight/dims';

-- Single index sufficient (covers coverage widget + forecast)
ALTER TABLE wp_dinoco_products
  ADD INDEX idx_shipping_coverage (is_active, weight_grams);

-- Optional CHECK (MySQL 8.0.16+, parsed-only on older versions)
ALTER TABLE wp_dinoco_products
  ADD CONSTRAINT chk_weight CHECK (weight_grams IS NULL OR weight_grams BETWEEN 1 AND 60000),
  ADD CONSTRAINT chk_length CHECK (length_cm    IS NULL OR length_cm    BETWEEN 1 AND 200),
  ADD CONSTRAINT chk_width  CHECK (width_cm     IS NULL OR width_cm     BETWEEN 1 AND 200),
  ADD CONSTRAINT chk_height CHECK (height_cm    IS NULL OR height_cm    BETWEEN 1 AND 200),
  ADD CONSTRAINT chk_article CHECK (article_category BETWEEN 0 AND 99),
  ADD CONSTRAINT chk_express CHECK (express_category IS NULL OR express_category IN (1,2,4,5,6,7,9));
```

**Deltas from Spec §18.1**:
- `weight_grams` INT → **SMALLINT** (sufficient + self-documenting bound)
- `length_cm/width_cm/height_cm` SMALLINT → **TINYINT** (max 255 ≫ Flash cap)
- `express_category` DEFAULT 1 → **DEFAULT NULL** (distinguishes "unreviewed" from "reviewed bike")
- `idx_express_cat` — **REMOVED** (low cardinality, not worth the write overhead)
- Added 6 CHECK constraints for integrity (no-op on MySQL 5.7, enforced on 8.0.16+)

---

### 🔧 27.5 Proposed New Configs (beyond spec §4.2 / §18.2)

```php
// Already spec'd — OK as-is
'dinoco_shipping_defaults'        => [...],     // §4.2 JSON blob
'dinoco_shipping_meta_enabled' => false,   // §10 feature flag
'dinoco_flash_warehouse_map'      => [...],     // §18.2 D9 routing
'dinoco_shipping_scanner_config'  => [...],     // §18.2 scanner prefs

// NEW — recommended add-ons
'dinoco_shipping_aggregation_strategy' => 'max_stacking',  // R4 — allow future swap to 'bin_packing'
'dinoco_shipping_coverage_threshold'   => ['green'=>80, 'amber'=>50],  // dashboard color thresholds
'dinoco_flash_bulky_thresholds' => [   // replace nested vehicle_threshold — single source
    'weight_g'   => 20000,
    'max_dim_cm' => 60,
    'grab_weight_g' => 5000,    // already decided per spec intro
    'grab_sum_dim_cm' => 45,
],
'dinoco_shipping_bulk_csv_max_rows' => 500,     // open Q3 resolution
'dinoco_shipping_audit_log_enabled' => true,    // open Q2 resolution (recommend ON)
```

**Constants (wp-config.php) — NOT options**:
- None needed. All tunables should be options for admin editability. Scanner latency / HMAC keys already use constants.

---

### 🚦 27.6 Pre-Phase 1 Checklist (verify on production DB first)

- [ ] `SELECT COUNT(*) FROM wp_dinoco_products` — confirm row count (spec says ~10k, verify actual)
- [ ] `SELECT VERSION()` — confirm MySQL 8.0.16+ (for CHECK enforcement)
- [ ] `SHOW TABLE STATUS WHERE Name='wp_dinoco_products'` — check `Data_length` + `Engine` (should be InnoDB)
- [ ] `SHOW INDEX FROM wp_dinoco_products` — verify no conflict with existing indexes (`idx_sku`, `idx_category`, `idx_active_stock`, `idx_active_visible_name`, `idx_active_category_name`)
- [ ] `SELECT _transient_b2b_flash_active_pickup FROM wp_options WHERE option_name LIKE '%flash_active_pickup%'` — verify transient storage pattern before new transients added
- [ ] Test ALTER on staging clone: measure elapsed (<5s for 10k rows expected on MySQL 8.x with fast DDL)
- [ ] Backup: `mysqldump wp_dinoco_products > backup-pre-v8.sql` (< 5MB at 10k rows)
- [ ] Confirm dbDelta runs at `init` priority — verify no conflict with other snippets bumping DB version in parallel
- [ ] Verify `DINOCO_Catalog::get_by_skus()` batch exists + returns expected shape (V.7.3 helper — critical for C4)
- [ ] Test `delete_transient('b2b_sku_data_map')` flow with new fields — confirm LIFF + B2B order read-after-write consistency

---

### ✅ 27.7 What Spec Got RIGHT

- **Leaf-only storage + SET compute** (§4.1 D1) matches existing DD-2 atomic pattern perfectly — no architectural deviation.
- **Feature flag default OFF + canary rollout** (§10) — textbook DINOCO rollout pattern (mirrors B2F shadow-write Phase 2/3).
- **Priority chain** (§4.3: ticket meta > auto-compute > global default) correctly matches existing `b2b_flash_get_order_weight()` override priority.
- **NULL-default migration** is non-destructive — zero backfill risk, zero rollback data loss (R1's additive schema).
- **Backward-compat via `array_filter null`** (§10) — Flash API accepts unknown-param drop, safe.
- **Per-ticket meta keys** (§18.3 `_flash_length_cm`, `_flash_width_cm`, `_flash_height_cm`) follow existing `_flash_weight_grams` naming — zero learning curve.
- **Global default JSON** (§4.2) is a single autoloaded option — correct performance pattern.
- **Rollback path** (§10) via feature flag = instant revert, no schema rollback needed.
- **Index `idx_shipping_coverage`** (§18.5) uses correct column order (`is_active` first, high cardinality filter → `weight_grams IS NULL`).
- **Error matrix §21** correctly defers to existing retry mechanism (`b2b_flash_courier_retry` cron) — no new retry machinery needed.
- **Separation of `boxes_per_unit` (PNO count) from new shipping dims (PNO size)** (§4.4) — clean conceptual split, no double-counting risk.

---

**DB Expert Sign-off**: ✅ **Proceed to Phase 1 AFTER C1-C5 addressed**

**Critical blockers (must resolve first)**: C1 (DEFAULT 6), C2 (type narrowing), C4 (batch read for SET aggregation)
**Non-blocking improvements**: W1 (NULL express_category), R6 (refactor existing helpers), schema adjustments §27.4
**Estimate impact**: adjustments add ~30 min to Phase 1 (schema tweak + CHECK constraint migration), save ~2-3 hrs of Phase 3 debugging (N+1 queries caught early).

---

## 28. Admin Group Flex Card Coverage

> **Scope**: Comprehensive review of every event where `B2B_ADMIN_GROUP_ID` should receive Flex-card notification about shipping / vehicle / courier / pickup state. Source files: `[B2B] Snippet 1` (builders), `[B2B] Snippet 2` (webhook triggers), `[B2B] Snippet 3` (REST + pickup orchestration), `[B2B] Snippet 5` (admin REST triggers).
> **Status**: Spec-only — no code. Implementation allocated to Phase 3 / 4 / 5.

### 28.1 Existing Flex Card Audit

Builders that already push to admin group (push helpers: `b2b_push_to_admin` S1:869, `b2b_push_raw_to_admin` S1:872; both key off `B2B_ADMIN_GROUP_ID`).

| # | Builder / Push | File:Line | Scenarios currently covered |
|---|---|---|---|
| F1 | `b2b_build_flex_courier_pickup` | S1:4441 | New pickup created (shows courier, parcel count, PNO list, dashboard footer) |
| F2 | `b2b_build_flex_pickup_added` | S1:4844 | Ticket added to existing pickup (reuse path) |
| F3 | `b2b_build_flex_flash_admin` | S1:4558 | Events: `created`, `create_error`, `courier_ok`, `courier_fail`, `detained`, `returned`, `delivered`, `cancelled`, `auto_fallback`, `switch_manual`, `problem` (ad-hoc) |
| F4 | `b2b_build_flex_multi_box_status` | S1:4646 / 5023 | Per-PNO status on multi-box ticket |
| F5 | `b2b_build_flex_partial_cancel` | S1:4696 / 5072 | Partial PNO cancel |
| F6 | `b2b_build_flex_pack_incomplete` | S1:4925 | SLA timeout — not all boxes packed |
| F7 | `b2b_build_flex_box_hold` | S1:4980 | Packed partial shipment (some boxes held) |
| F8 | `b2b_build_flex_flash_status` | S1:4514 | Webhook status relay to admin (in_transit / delivering / delivered) |
| F9 | `b2b_build_flex_tracking_prompt` | S1:2256 | Manual tracking input prompt after switch_manual |
| F10 | `b2b_push_to_admin` text (no Flex) | S3:3945, S3:3974, S3:3992, S5:1385, S5:1478, S5:1518 | Plain-text pickup completion / rider pickup / customer self-pickup / customer received |

**Trigger summary table** (shipping-scoped only — omits claim/payment/order-status Flex):

| Event | Trigger file:line | Current notification |
|---|---|---|
| Flash create success (single-box) | S5:288 + S2:1607 (auto) | `flash_admin: created` ✅ |
| Flash create failure | S5:1154, S5:1230, S2:1624 | `flash_admin: create_error` ✅ |
| Flash create ALL boxes helper | S1:4834 `b2b_log` only | **no admin Flex** — caller (S2/S5) owns per S-6 fix comment |
| Ready-to-ship → pickup (new) | S3:2830 | `flex_courier_pickup` ✅ |
| Ready-to-ship → pickup reuse | S3:2738 | `flex_pickup_added` ✅ |
| Pickup call fails | S3:2861 | `flash_admin: courier_fail` ✅ |
| All-packed → pickup (S5 path) | S5 line ~3220 / 3256 | `flex_pickup_added` / `flex_courier_pickup` ✅ |
| Partial ship → pickup (hold boxes) | S3:3349-3373 | `push_to_admin` text + `flex_box_hold` ✅ |
| Flash webhook RECEIVED | S3:3945 | Plain text `✅ Flash รับพัสดุแล้ว` ⚠️ (no Flex) |
| Flash webhook pickup CANCELLED | S3:3974 | Plain text `⚠ คูเรียร์ยกเลิกงานรับ` ⚠️ (no Flex) |
| Flash webhook status → detained | S3:3726 | `flash_admin: detained` ✅ |
| Flash webhook status → returned | S3:3822 | `flash_admin: returned` ✅ |
| Flash webhook status → cancelled | S3:3837 | `flash_admin: cancelled` ✅ |
| Switch-to-manual (auto-fallback) | S5:564, S2:1624 | `flash_admin: switch_manual` / `auto_fallback` ✅ |

### 28.2 Missing Scenarios (V.42 Shipping Metadata)

Identified gaps mapped to Mission request list + new findings. Severity: **P0** ship-blocker / **P1** alert-fatigue risk / **P2** operational quality-of-life.

#### A. Pickup lifecycle (new events required by V.42 expressCategory=4 routing)

| ID | Scenario | Severity | Why missing |
|---|---|---|---|
| A1 | **New pickup called — motorcycle (expressCategory=1)** | P1 | Current F1 does not display vehicle type. V.42 splits pickup by vehicle → admin must see 🏍️ vs 🚚 badge |
| A2 | **New pickup called — truck (expressCategory=4)** | P0 | New `b2b_flash_notify_courier_from_warehouse()` call signature (pass warehouseNo=`5BKN_PDC`) has no announcement path |
| A3 | **Pickup UPGRADE — existing bike pickup + new truck parcel** | P0 | Transient `b2b_flash_active_pickup` stores single pickup only — V.42 needs composite `active_pickups{'bike':{}, 'truck':{}}` and each fires its own card |
| A4 | **Pickup reuse — small parcel added to truck pickup** | P2 | Dedup-worthy (F2 already fires, but needs vehicle indicator; admins currently cannot tell which vehicle is already en-route) |
| A5 | **Pickup cancelled by admin** (explicit cancel, not Flash webhook) | P1 | No current endpoint — admin has no in-LINE action to abort pickup |
| A6 | **Pickup failed — Flash API error (non-1010)** | P1 | F3 `courier_fail` partially covers but doesn't retry-with-backoff info (§21 says cron retries — admin is blind between attempts) |
| A7 | **Pickup timeout warning — 14:00 cut-off** | P1 | No cron + no Flex — packed-but-not-shipped boxes silently miss cut-off |
| A8 | **Duplicate-pickup rejection (Flash code 1010)** | P2 | Currently treated as success (V.41.2) + silent — admin should see "reused existing pickup #NNN" confirmation |
| A9 | **After-hours pickup** (>14:00, parcel arrives) | P2 | No explicit "will be picked up tomorrow" card — admin guess-and-check |

#### B. Order vehicle decisions

| ID | Scenario | Severity | Why missing |
|---|---|---|---|
| B10 | **Flash order created with expressCategory=4** | P0 | F3 `created` event does not display vehicle. Admin needs visual proof that V.42 auto-computed truck correctly |
| B11 | **Admin vehicle override (bike→truck or truck→bike)** | P1 | §11 Q2 open question — spec-approved: needs audit + Flex notify to admin group (not just log) |
| B12 | **Missing shipping data — fallback to default** | P1 | Silent fallback masks data-quality issue. Admin needs warning when coverage is low for this order |
| B13 | **Size mismatch — SKU-catalog dims vs actual packed box** (RPi kiosk weight-scan, future) | P2 | Outside V.42 core scope — defer to V.43 (scale integration). Flag as known future event |
| B14 | **Bulk order threshold — >10 boxes pre-pickup** | P1 | Truck capacity planning — warn admin before calling pickup so they can split if needed |

#### C. Operational / daily / coverage

| ID | Scenario | Severity | Why missing |
|---|---|---|---|
| C15 | **End-of-day shipping summary** (17:00 cron) | P2 | Today's pickup count / bike vs truck / SKUs missing shipping data. Mirror of existing daily summary Flex (S1:3767) |
| C16 | **Flash courier arrived (webhook RECEIVED)** | P1 | Currently plain text S3:3945 — upgrade to Flex with pickup_id, PNO list, courier name |
| C17 | **Coverage alert — weekly SKU shipping data %** | P2 | §24 metric exists but no Flex notifier. Weekly digest Mon 09:00 |
| C18 *(new)* | **Pickup split — one ticket with mixed bike + truck parcels** | P1 | Multi-PNO ticket where box A = small, box B = large → two pickups required for ONE order. Current code assumes single vehicle per ticket |
| C19 *(new)* | **warehouseNo config drift** | P1 | Flash API returns wrong warehouse → currently silent. Add Flex when `_flash_warehouse_no` differs from config |
| C20 *(new)* | **Subparcel rejection** (multi-box Flash API partial failure) | P0 | §24 tracks rate >1% but no Flex. Needs immediate admin visibility |
| C21 *(new)* | **Feature flag toggle audit** (`dinoco_shipping_meta_enabled` ON/OFF) | P2 | Security/audit — admin changes should fire confirmation Flex to group so all admins see it |

### 28.3 New Flex Card Designs

Template convention (follow existing S1 pattern — `b2b_flex_header($title, $subtitle, $color)` + body vertical + paddingAll 16px + footer buttons linking to Admin Dashboard tab=flash). All cards ≤10 body rows for LINE rendering budget.

#### 28.3.1 Vehicle-aware pickup card (replaces F1 for V.42) — A1 / A2 / A3

**Builder**: `b2b_build_flex_courier_pickup_v42($pickup_info, $vehicle='bike')`

Header color: `#3b82f6` (bike 🏍️) / `#f59e0b` (truck 🚚)

```
┌──────────────────────────────────────────┐
│ 🚛 เรียกรถ Flash สำเร็จ   🏍️ มอเตอร์ไซค์ │  header
├──────────────────────────────────────────┤
│ 🏍️ ประเภทรถ: ปกติ (expressCategory=1)   │  NEW row
│ 🏢 โกดัง: BKN_SP (รามอินทรา)            │  NEW row
│ ────────────                             │
│ คูเรียร์: คุณสมชาย                        │
│ โทร: 099-xxx-xxxx                        │
│ มารับภายใน: 13:00                        │
│ Pickup ID: P-2026-0417-0012              │
│ จำนวนพัสดุ: 3 กล่อง                       │
│ ────────────                             │
│ รวมใน Pickup นี้:                         │
│   #6267 ร้าน A (2 กล่อง)                 │
│   #6270 ร้าน B (1 กล่อง)                 │
├──────────────────────────────────────────┤
│ [📋 เปิด Dashboard] [⚙️ จัดการกล่อง]      │  footer
└──────────────────────────────────────────┘
```

Altext: `🚛 เรียกรถ Flash 🏍️ — รามอินทรา — 3 กล่อง 2 ออเดอร์`

#### 28.3.2 Pickup upgrade card — A3

**Builder**: `b2b_build_flex_pickup_upgrade($old_pickup, $new_pickup, $upgrade_ticket)`

Header: `⚠️ เรียกรถเพิ่ม (กระบะ)` · color `#f59e0b`

```
┌──────────────────────────────────────────┐
│ ⚠️ เพิ่มรถกระบะ — ของใหญ่เกินมอไซค์       │
├──────────────────────────────────────────┤
│ #6275 ร้าน C: 1 กล่อง 60×40×30cm 25kg   │
│ → ตรวจพบเกินขนาดมอเตอร์ไซค์ (>20kg)       │
│ ────────────                             │
│ 🏍️ Pickup เดิม: P-0012 (รอรับ 13:00)    │
│    คูเรียร์ 1: สมชาย 099-xxx-xxxx        │
│ 🚚 Pickup ใหม่: P-0015 (รอรับ 14:30)    │
│    คูเรียร์ 2: สมหญิง 098-xxx-xxxx       │
│    Warehouse: 5BKN_PDC (กระบะ)           │
├──────────────────────────────────────────┤
│ [📋 เปิด Dashboard]                       │
└──────────────────────────────────────────┘
```

Altext: `⚠️ เพิ่มรถกระบะ — #6275 ของใหญ่ — คูเรียร์ 2 คัน`

#### 28.3.3 Flash order created — vehicle indicator (V.42 upgrade to F3 `created`)

Extend existing `b2b_build_flex_flash_admin` `created` event payload:

```
┌──────────────────────────────────────────┐
│ ✅ สร้างพัสดุสำเร็จ     Flash Express     │
├──────────────────────────────────────────┤
│ #6267 — ร้านปูแดง                        │
│ Tracking: TH00000000XX, YY                │
│ กล่อง: 2 กล่อง                            │
│ 🚚 รถกระบะ (expressCategory=4)            │  NEW row
│ น้ำหนักรวม: 28kg · 60×40×30cm            │  NEW row
│ 📦 จาก catalog · auto-detected            │  NEW row (source hint)
├──────────────────────────────────────────┤
│ [📋 ดูบิล]                                │
└──────────────────────────────────────────┘
```

Data additions to `$data`: `express_category`, `weight_total`, `dims`, `shipping_source` (`catalog`/`computed`/`default`).

#### 28.3.4 Admin vehicle override audit — B11

**Builder**: `b2b_build_flex_vehicle_override($ticket_id, $from, $to, $admin_name, $reason)`

Header: `🔧 Admin Override — เปลี่ยนรถ` · color `#7b1fa2`

```
#6267 — ร้านปูแดง
Admin: สมชาย (user_id 1)
เปลี่ยนจาก 🏍️ มอเตอร์ไซค์ → 🚚 รถกระบะ
เหตุผล: "กล่องใหญ่เกินมอไซค์"
บันทึกเวลา: 2026-04-17 14:32

[📋 ดูบิล]
```

Audit meta: `_b2b_express_category_override` + `_b2b_vehicle_override_by` + `_b2b_vehicle_override_reason`.

#### 28.3.5 Missing shipping data warning — B12

**Builder**: `b2b_build_flex_shipping_data_warn($ticket_id, $missing_skus)`

Header: `⚠️ ข้อมูลขนาดไม่ครบ` · color `#f59e0b`

```
#6267 — ร้าน A
3/5 SKU ไม่มีข้อมูลขนาด → ใช้ค่า default
(weight=1000g, 30×20×10cm)

Missing: DNCL001, DNCR001, DNCSETXXXX

⚠️ อาจส่งผิดรถ — กรุณาเติมข้อมูลใน Catalog

[📋 เปิด Inventory] [🚛 ส่งต่อ Flash]
```

Debounce: only fire when coverage < 50% on given order (per-order, not per-SKU).

#### 28.3.6 Bulk order pre-pickup warning — B14

**Builder**: `b2b_build_flex_bulk_pickup_warn($ticket_id, $box_count, $total_weight)`

Header: `📦 ออเดอร์ใหญ่` · color `#f59e0b`

```
#6267 — ร้าน A
12 กล่อง · 156 kg total
🚚 รถกระบะ (auto)

💡 แนะนำ: แยก 2 รอบหรือโทรแจ้ง Flash ล่วงหน้า

[📋 เปิด Dashboard] [🚛 เรียกรถ]
```

Threshold: `box_count > 10 OR weight > 100kg` (configurable `dinoco_shipping_defaults.bulk_threshold`).

#### 28.3.7 Daily shipping summary — C15

**Builder**: `b2b_build_flex_shipping_daily_summary($date, $stats)`

Reuse `b2b_build_flex_daily_summary` pattern (S1:3767) — add shipping section:

```
📊 สรุปวันที่ 17 เม.ย.
├ Pickups: 4 (🏍️ 3 · 🚚 1)
├ PNO created: 27
├ Vehicle breakdown: bike 18 · truck 9
├ Overrides: 2 (admin บังคับ)
├ Missing data: 5 orders used fallback
├ Coverage: 67% (↓ 3pts vs เมื่อวาน)
└ Top missing SKU: DNCL001 (8 ออเดอร์)

[📋 เปิดรายงานเต็ม]
```

Cron: `b2b_shipping_daily_summary_cron` at 17:30 Asia/Bangkok.

#### 28.3.8 Flash courier arrived (RECEIVED) — upgrade C16

**Builder**: `b2b_build_flex_courier_received($pickup_id, $ticket_ids, $courier_name)`

Replace plain text S3:3945. Green header `✅ คูเรียร์รับของแล้ว`, list PNO, footer Dashboard link.

#### 28.3.9 warehouseNo drift — C19

**Builder**: `b2b_build_flex_warehouse_drift($ticket_id, $expected, $actual)`

Header: `🔴 Config ผิด` · color `#dc2626`

One-time Flex (dedup per day per warehouseNo). Footer: `[🔄 Refresh warehouseNo list]` → calls `/flash-api-test`.

#### 28.3.10 Subparcel rejection — C20

**Builder**: `b2b_build_flex_subparcel_fail($ticket_id, $succeeded_pnos, $failed_box_info)`

Header: `🔴 กล่องบางใบสร้างไม่สำเร็จ`. Show per-box status (mirror F4 `multi_box_status`) + CTA `[🔄 สร้างใหม่เฉพาะกล่องที่ fail]`.

#### 28.3.11 Pickup timeout warning — A7

**Builder**: `b2b_build_flex_pickup_cutoff_warn($packed_tickets, $minutes_until_1400)`

Header: `⏰ เหลือเวลา <N> นาที — 14:00 cut-off` · color `#f59e0b`

Cron: every 30 min between 13:00-14:00, fires once per ticket bucket.

#### 28.3.12 Feature flag audit — C21

**Builder**: `b2b_build_flex_flag_toggle($flag_name, $old, $new, $admin_name)`

Generic — reusable for other flags (`b2b_flag_bo_system` etc.). Auto-triggers via `update_option` hook on whitelist keys.

### 28.4 Trigger Points + Dedup Strategy

| Card | Fired by | Hook / call site | Dedup key | TTL |
|---|---|---|---|---|
| 28.3.1 `courier_pickup_v42` | `b2b_flash_notify_courier_from_warehouse` success | S3:2830 (replace F1) | `pickup:{pid}` | 4h (pickup lifecycle) |
| 28.3.2 `pickup_upgrade` | New detection in notify flow when active `bike` pickup + incoming `truck` parcel | S3 new branch after §A3 logic | `upgrade:{old_pid}:{new_pid}` | 4h |
| 28.3.3 `flash_admin:created` (upgraded) | `b2b_flash_create_all_boxes` success | S2:288, S5 path | existing per-ticket dedup | n/a |
| 28.3.4 `vehicle_override` | Admin edits ticket meta | S5 new endpoint `/flash-override-vehicle` | `override:{ticket_id}:{timestamp}` | 1 event per override |
| 28.3.5 `shipping_data_warn` | `b2b_flash_create_order` when `missing_skus > 0` | S1:4766 pre-call hook | `warn:{ticket_id}` | once per ticket |
| 28.3.6 `bulk_pickup_warn` | `b2b_flash_create_all_boxes` if threshold hit | S1:4766 | `bulk:{ticket_id}` | once per ticket |
| 28.3.7 `shipping_daily_summary` | cron `b2b_shipping_daily_summary_cron` | Snippet 7 new cron | `daily:{YYYY-MM-DD}` | 24h |
| 28.3.8 `courier_received` | Flash webhook RECEIVED | S3:3945 (replace text) | `recv:{pickup_id}` | 24h |
| 28.3.9 `warehouse_drift` | Flash API response `warehouseNo` mismatch | S1:`b2b_flash_notify_courier` post-check | `drift:{warehouseNo}:{YYYY-MM-DD}` | 24h |
| 28.3.10 `subparcel_fail` | `b2b_flash_create_all_boxes` partial | S1:4834 replace `b2b_log`-only path | `subfail:{ticket_id}` | once per ticket |
| 28.3.11 `pickup_cutoff_warn` | cron every 30 min 13:00-14:00 | Snippet 7 new cron | `cutoff:{YYYY-MM-DD}:{bucket}` | 24h |
| 28.3.12 `flag_toggle` | `update_option` filter on whitelist keys | S9 new listener | `flag:{key}:{timestamp}` | per event |

**Dedup primitive**: `transient('b2b_flex_admin_dedup_' . md5($key))` with TTL. Push helper wraps: `b2b_push_admin_flex_dedup($key, $ttl, $flex)`.

**Rate limit global**: max 20 admin-group Flex messages per hour (LINE free-tier + alert-fatigue). Excess → batch into summary card next cron tick. Implemented via counter transient `b2b_admin_flex_hourly_count`.

### 28.5 Admin Notification Settings UI

New section in **B2B Admin → Notifications** (`[B2B] Snippet 9: Admin Control Panel`):

```
📢 Admin Group Notifications (B2B_ADMIN_GROUP_ID)
├─ Priority: always-on (cannot mute)
│   [x] Pickup called / upgrade / cancelled (A1-A5)
│   [x] Flash create errors / subparcel fail (C20, F3:create_error)
│   [x] warehouseNo drift (C19)
│
├─ Priority: configurable (default ON, can mute)
│   [x] Vehicle auto-detect (B10 — show vehicle badge on created)
│   [x] Admin vehicle override audit (B11)
│   [x] Pickup timeout 14:00 warning (A7)
│   [x] Bulk order pre-pickup warn (B14)
│   [ ] Missing shipping data warn (B12) — mute if >5/day
│
├─ Priority: opt-in (default OFF)
│   [ ] Pickup reuse announcement (A4)
│   [ ] After-hours pickup queued (A9)
│   [ ] Feature flag audit (C21)
│
├─ Digests (separate toggle)
│   [x] Daily shipping summary 17:30 (C15)
│   [ ] Weekly coverage report Mon 09:00 (C17)
│
└─ Channel mirror
    [ ] Also send to Telegram (น้องกุ้ง) — default OFF
    [ ] CRITICAL only → Telegram (error 1022, warehouseNo drift, subparcel fail)
```

Stored in `wp_option` `dinoco_shipping_admin_notif_prefs` (JSON). Per-admin overrides out of scope V.42 (all admins share group prefs).

### 28.6 Cross-Channel Consistency

| Event class | LINE Flex (admin group) | Telegram (น้องกุ้ง) | Dashboard badge | Rationale |
|---|---|---|---|---|
| CRITICAL (A2, B10-truck, C19, C20) | Always | Always (CEO) | Red toast + count | Money-impact / customer-visible |
| WARN (A7, B14, B12) | Per prefs | No by default | Amber badge | Operational |
| INFO (A4, A8, A9, C15, C17) | Per prefs | No | Silent update | Context only |
| AUDIT (B11, C21) | Always (compliance) | No | Log entry | Accountability |

**Rule**: Telegram alerts must never duplicate a LINE Flex without clear CRITICAL reason. Telegram is out-of-band escalation, not mirror. Dashboard is inventory — always updates regardless of notification prefs.

**Deep-link consistency**: All Flex footer buttons point to `b2b_liff_url('b2b-dashboard/', ['tab'=>'flash', 'ticket'=>$tid])` where applicable — single URL schema matching existing §19.1 row 7-8.

### 28.7 Agent Task Breakdown

Assign to existing phase agents in §8, additive — no new phases.

**Phase 3 — B2B Ticket Integration** (add to scope):
- `fullstack-developer`:
  - Build 28.3.3 (upgrade `flash_admin:created` with vehicle/weight/source rows)
  - Build 28.3.5 `shipping_data_warn` + wire into `b2b_flash_create_order` pre-call
  - Build 28.3.6 `bulk_pickup_warn`
  - Build 28.3.10 `subparcel_fail` (replace S1:4834 log-only)
  - Implement `b2b_push_admin_flex_dedup($key, $ttl, $flex)` helper in S1 V.34.0
- `code-reviewer`: verify dedup keys don't collide across cards

**Phase 4 — Manual-ship + Pickup lifecycle**:
- `fullstack-developer`:
  - Build 28.3.1 `courier_pickup_v42` (replace F1 — add vehicle badge + warehouseNo row)
  - Build 28.3.2 `pickup_upgrade` + modify transient schema to `active_pickups{bike,truck}` composite
  - Build 28.3.8 `courier_received` (replace S3:3945 text)
  - Build 28.3.4 `vehicle_override` + new REST `/flash-override-vehicle`
  - Build 28.3.9 `warehouse_drift` (post-check in `b2b_flash_notify_courier`)
  - Add A5 admin-cancel-pickup REST + Flex
- `api-specialist`: verify Flash `/notify` dual-pickup behavior (bike + truck same day, different warehouseNo) — Q4 follow-up to Flash
- `browser-tester`: scenario matrix — single bike / single truck / mixed upgrade / reuse / cancel / duplicate-rejected

**Phase 5 — Monitoring + Documentation**:
- `fullstack-developer`:
  - Build 28.3.7 `shipping_daily_summary` + cron (S7)
  - Build 28.3.11 `pickup_cutoff_warn` + cron
  - Build 28.3.12 `flag_toggle` + hook on `update_option`
  - Admin Notifications UI (§28.5) in S9
- `business-ops`: author weekly coverage digest copy + thresholds
- `skill-library`: add regression scenarios REG-034 (pickup upgrade triggers 2 Flex) / REG-035 (dedup prevents duplicate warehouse_drift per day) / REG-036 (rate limit kicks in at 20/hr — batch summary card fires)

### 28.8 Additional Findings Beyond Mission List

Flagged during audit — not in original 17-scenario list but equally important:

- **FIND-1 (C18)**: **Mixed-vehicle ticket** — a single order can have box A = small and box B = large. Current code assumes ONE vehicle per ticket. V.42 Phase 3 must handle split. Severity **P0**.
- **FIND-2 (C19)**: **warehouseNo config drift** — Flash may silently remap warehouseNo. Spec §20 mentions but no notification. Added as 28.3.9. Severity **P1**.
- **FIND-3 (C20)**: **Subparcel rejection** — Flash multi-box API can partial-fail. Currently logged only (S1:4834 comment "FIX S-6: no Flex from helper"). Admin only sees via `flash_create_error` generic which doesn't convey partial success. Severity **P0**.
- **FIND-4 (C21)**: **Feature-flag audit** — enabling `dinoco_shipping_meta_enabled` mid-day changes every Flash call immediately. Admins should see notification so they know why behavior changed. Severity **P2**.
- **FIND-5**: **Rate limit protection missing** — no cap on admin-group push volume. LINE free tier = 500 msg/month/group; at scale this overruns. Added global 20/hr cap + batch-into-summary fallback in §28.4. Severity **P1**.
- **FIND-6**: **No "cancel pickup" admin action from LINE** — admin can only cancel via Flash app directly. Added A5 + REST `/flash-cancel-pickup`. Severity **P2**.
- **FIND-7**: **Dedup helper not centralized** — each builder re-implements own transient dedup. Proposed `b2b_push_admin_flex_dedup()` helper unifies pattern + enforces rate limit. Severity **P2** (refactor).

---

## 29. Feature Architect Gap Analysis

> **Reviewer**: `feature-architect` agent (7-step protocol)
> **Date**: 2026-04-17
> **Method**: Cross-checked Part I + Part II + §27 (DB expert) + §28 (Flex cards) against 7-step Feature Architect protocol. Flagged gaps NOT covered by tech-lead (§17-26), database-expert (§27), fullstack-developer (§28).
> **Scope**: 55 gaps identified — 21 P0, 19 P1, 15 P2.

---

### 29.1 Missing Problem Definitions (KPIs / Ownership / Integration)

| ID | Gap | Severity | Recommendation |
|---|---|---|---|
| G-PD1 | **Shipping error rate target** not defined. §12 says "zero regression" but no SLA on Flash rejection / mis-dispatch rate | 🔴 P0 | Add targets: Flash error rate < 0.5%, mis-dispatch rate < 2%, scan-to-Flash P95 < 5s |
| G-PD2 | **Data ownership** unclear — who's accountable for SKU shipping data quality? | 🔴 P0 | Assign: **Warehouse Manager** owns data entry; **Admin** owns audits; **Finance** reviews cost reconciliation monthly |
| G-PD3 | **Failure mode for new SKU without data** — silent default vs block vs prompt? §11 Open Q1 unresolved | 🔴 P0 | Default: **soft-block** — allow save but show warning banner + add to "SKUs pending review" queue |
| G-PD4 | **Financial reporting integration** — no revenue-per-vehicle-type or cost-per-parcel reports | 🟡 P1 | Extend Admin Finance dashboard with shipping cost breakdown + variance analysis |
| G-PD5 | **Seasonal considerations** — Songkran/New Year volume 3-5x not addressed | 🟡 P1 | Avoid launch Apr 10-18 + Dec 28-Jan 3. Preferred: late Apr-May |
| G-PD6 | **RMA / return flow** — Flash expressCategory=6/7 Happy Return not covered | 🟡 P1 | Reserve §30 for V.43 RMA flow |
| G-PD7 | **Complaint → shipping data link** — "พัสดุไม่ถึง/หาย/เสียหาย" feedback loop | 🟢 P2 | Add `_flash_complaint_ref` meta + quarterly review top-complaint SKUs |

---

### 29.2 Missing User Flows (Per Role / Edge Cases)

| ID | Gap | Severity | Recommendation |
|---|---|---|---|
| G-UF1 | **Warehouse staff role** not defined — kiosk user has no permission model | 🔴 P0 | Add role `warehouse_staff` — scan + submit only, no catalog edit. Auth via existing `X-Print-Key` |
| G-UF2 | **Scanner broken fallback** — §7.4 mentions dropdown but no hardware-broken flow | 🟡 P1 | Add "🔧 Scanner offline? Switch to manual" toggle + auto-detect heartbeat (no input 30s → prompt) |
| G-UF3 | **Damaged SKU label** — barcode unreadable | 🟡 P1 | Add text-search fallback — type 3 chars → autocomplete from catalog |
| G-UF4 | **Admin mobile LIFF** — no mobile-optimized view for V.42 columns | 🟡 P1 | Mobile breakpoint CSS for shipping tab — stack columns vertically < 600px |
| G-UF5 | **Bulk import from supplier CSV** — Chinese factory dim sheets with Chinese columns | 🟢 P2 | Column mapping UI + pre-defined templates |
| G-UF6 | **Concurrent edit** — 2 admins editing same SKU simultaneously. Not mentioned anywhere | 🔴 P0 | Optimistic locking via `updated_at` header check → 409 Conflict if stale |
| G-UF7 | **Dim change mid-flight** — admin changes dims AFTER PNO created | 🟡 P1 | UI warning "⚠️ ขนาดเปลี่ยน — PNO ใช้ขนาดเดิม" + "🔄 Re-create PNO" option |
| G-UF8 | **Partial pickup** — Flash arrived but not all boxes scanned | 🔴 P0 | Add FSM state `pickup_partial` + Flex "คูเรียร์มาถึงแล้ว แต่แพคไม่ครบ N/M กล่อง" + decision |
| G-UF9 | **Mix B2B + manual-ship in same pickup window** | 🟡 P1 | Extend `b2b_flash_active_pickup` transient to include manual-ship PNOs. Single Flex card shows both |
| G-UF10 | **Pi4 scanner offline** — no internet mid-scan | 🔴 P0 | IndexedDB queue + SW offline → sync on reconnect. Visible "📴 Offline: N items queued" badge |
| G-UF11 | **Scanner mis-scan** — user scans cart receipt instead of SKU | 🟡 P1 | SKU format regex `/^DNC[A-Z0-9]{3,20}$/` — reject non-DNC |
| G-UF12 | **SKU not in catalog** — create on-the-fly vs reject? | 🟡 P1 | Reject by default. Admin-only "➕ Create SKU" button (warehouse_staff hidden) |
| G-UF13 | **Dealer view shipping info** — §11 Open Q5 unresolved | 🟢 P2 | Show only coarse label ("ใหญ่"/"เล็ก") — hide exact dims |
| G-UF14 | **Flash courier acknowledgment** | 🟢 P2 | Defer to V.43 — out of scope |
| G-UF15 | **Post-delivery dim correction** — actual weight differs from catalog, no feedback loop | 🟡 P1 | `b2b_shipping_variance_cron` weekly — flag SKUs with >20% variance across ≥5 orders |

---

### 29.3 Missing Data Model Elements

| ID | Gap | Severity | Recommendation |
|---|---|---|---|
| G-DM1 | **Audit trail table** — who changed shipping data + when + old→new. Not in §4 or §27.4 | 🔴 P0 | Add `wp_dinoco_shipping_audit` (id, sku, field_name, old_value, new_value, changed_by, changed_at, source). 180-day retention |
| G-DM2 | **Version history** — packaging redesigned 2x/year | 🟡 P1 | Derive from audit table. Expose "shipping history" tab in Edit Product modal |
| G-DM3 | **Override reason log** — capture "why" per-ticket override | 🟡 P1 | Dropdown: "กล่องใหญ่เกินคาด" / "ลูกค้าขอส่งเร็ว" / "อื่นๆ". Required field |
| G-DM4 | **Vehicle cost tracking** — estimated vs actual Flash charge | 🟡 P1 | Add `_flash_estimated_cost` + `_flash_cost_variance_pct`. Monthly finance reconciliation |
| G-DM5 | **Rejection reason log** — 1020/1022 errors logged as text, not queryable | 🟢 P2 | Add `_flash_rejection_code` + `_flash_rejection_detail` structured meta |
| G-DM6 | **Performance metrics** — scan-to-print time SLA monitoring | 🟡 P1 | Add `_flash_scan_at` / `_flash_print_queued_at` / `_flash_print_done_at` timestamps |
| G-DM7 | **Shipping data freshness** — no `shipping_updated_at` column | 🟢 P2 | Add `shipping_updated_at TIMESTAMP NULL` — auto-set on field update |
| G-DM8 | **Box manifest persistence** — `b2b_calculate_box_manifest()` recomputed each view | 🟢 P2 | Add `_b2b_box_manifest_snapshot` meta captured at `paid → packed`. Immutable |
| G-DM9 | **Per-SKU aggregation strategy override** — some SETs stack, some side-by-side | 🟢 P2 | Optional column `shipping_aggregation_override` VARCHAR(20) NULL |

---

### 29.4 Missing API Endpoints + Cron Jobs

| ID | Gap | Severity | Recommendation |
|---|---|---|---|
| G-API1 | **Validation endpoint** `POST /sku-shipping/validate` dry-run | 🟡 P1 | Returns `{valid, warnings[], errors[]}` before submit |
| G-API2 | **Preview with cost estimate** — §5.1 `/shipping-compute` missing Flash `/estimate_rate` | 🟡 P1 | Extend to return expected Flash charge |
| G-API3 | **Coverage report** `GET /shipping-coverage` for dashboard widget | 🟡 P1 | Return `{total, complete, partial, missing, top_missing_skus[]}` |
| G-API4 | **Audit log** `GET /sku-shipping/{sku}/history` | 🟢 P2 | Depends on G-DM1. Paginated |
| G-API5 | **CSV export** `GET /sku-shipping/export.csv` | 🟢 P2 | Streaming. Nonce + admin only |
| G-API6 | **Batch prefill ML-assisted** `POST /shipping-prefill-similar` | 🟢 P2 | Heuristic from similar-category SKUs |
| G-API7 | **Warehouse sync** `POST /flash-warehouse-refresh` | 🟡 P1 | Admin-triggered refresh of `dinoco_flash_warehouse_map` from Flash API |
| G-API8 | **Scanner health** `GET /dashboard/scanner-health` | 🟢 P2 | Uptime + success rate for Telegram monitoring |
| G-CRON1 | **Daily coverage cron** | 🟡 P1 | `b2b_shipping_coverage_cron` 07:00 Asia/Bangkok |
| G-CRON2 | **Weekly coverage report** LINE Flex Mon 09:00 | 🟡 P1 | `b2b_shipping_weekly_report_cron` |
| G-CRON3 | **Monthly cost reconciliation** | 🟢 P2 | `b2b_shipping_cost_reconcile_cron` 1st of month |
| G-CRON4 | **Stale SKU review queue** — not updated > 180d | 🟢 P2 | `b2b_shipping_stale_review_cron` weekly |
| G-CRON5 | **Variance detection cron** — actual vs catalog divergence | 🟡 P1 | `b2b_shipping_variance_cron` weekly |

---

### 29.5 Missing UI/UX States

| ID | Gap | Severity | Recommendation |
|---|---|---|---|
| G-UI1 | **Scanner failure 3x retry** — auto-switch to manual | 🟡 P1 | Red flash + shake + counter, auto-fallback after 3 |
| G-UI2 | **Partial data state** — weight but no dims → amber badge | 🟡 P1 | Catalog grid filter chip "SKU ข้อมูลไม่ครบ" |
| G-UI3 | **Conflict state** — override differs from auto >30% | 🟡 P1 | Visual indicator + "fix at SKU level" CTA |
| G-UI4 | **Offline Pi4 banner** | 🔴 P0 | Persistent "📴 Offline — N items queued" |
| G-UI5 | **Expired pickup state** — after 14:00 cutoff | 🟡 P1 | Lock button + "สำหรับพรุ่งนี้" label |
| G-UI6 | **Loading states** — all async actions have spinner text | 🟡 P1 | Audit all V.42 buttons: "กำลังบันทึก..." / "กำลังสร้าง PNO..." |
| G-UI7 | **Empty state onboarding** — 0 SKUs filled | 🟡 P1 | Illustrated empty state + "Start with top 10 SKUs" |
| G-UI8 | **Mobile LIFF 360px** — progressive disclosure | 🟡 P1 | Hide advanced fields behind "+ แสดงรายละเอียด" |
| G-UI9 | **Pi4 kiosk 480×320 mode** | 🔴 P0 | Dedicated CSS — 80px tap targets, single-column, large font. Route `/kiosk/manual-ship` |
| G-UI10 | **Screen reader labels** — scanner hidden input no aria-label | 🟢 P2 | Add `aria-label` / `aria-describedby` |
| G-UI11 | **Keyboard-only nav** | 🟡 P1 | Tab/Enter/Esc + visible focus indicators |
| G-UI12 | **Color contrast WCAG AA** — #f59e0b on white = 3.2:1 FAIL | 🟢 P2 | Use #b45309 (existing B2B amber fix pattern) |
| G-UI13 | **Undo window for bulk import** — 5 min revert | 🟡 P1 | Staging table + confirm → undo (BO V.1.6 bo-undo-split pattern) |
| G-UI14 | **Preview diff in bulk import** — red/green per cell | 🟡 P1 | Side-by-side "current → new" + "only show changes" filter |

---

### 29.6 Missing Impact Analysis

| ID | Gap | Severity | Recommendation |
|---|---|---|---|
| G-IMP1 | **Webhook actual vehicle comparison** | 🟡 P1 | Store `_flash_actual_vehicle` + weekly "estimated bike but actual truck" report |
| G-IMP2 | **Invoice shipping line-item audit** | 🟡 P1 | §19.2 row 20 says "no change" but didn't verify if invoice uses Flash cost |
| G-IMP3 | **Dealer LIFF tracking impact** | 🟢 P2 | See G-UF13 — coarse label only |
| G-IMP4 | **RPi print template dimension on label?** | 🟡 P1 | Decide Yes/No; if Yes update both label templates |
| G-IMP5 | **Finance reports aggregation impact** | 🟡 P1 | Audit existing `dinoco_admin_finance` widgets — vehicle split may break assumptions |
| G-IMP6 | **`b2b_flash_tracking_cron` impact** | 🟢 P2 | If actual vehicle differs, log variance |
| G-IMP7 | **LIFF customer notification vehicle/size?** | 🟢 P2 | §19.2 says no change — confirm final decision |
| G-IMP8 | **CSS scoping** — new section must not pollute global | 🟡 P1 | Scope under `.inventory-shipping-section` |
| G-IMP9 | **JS global scope pollution** — scanner JS | 🟡 P1 | IIFE or `window.DINOCO_Shipping` namespace |
| G-IMP10 | **Permission audit** — new endpoints could expose data to wrong role | 🔴 P0 | Verify `X-Print-Key` scope doesn't leak cost/WAC info |
| G-IMP11 | **Chatbot MCP Bridge integration** | 🟢 P2 | Add `product-shipping-info` (public-safe, no WAC). Defer Phase 5.5 |
| G-IMP12 | **Brand Voice social listening** | 🟢 P2 | Future — tag complaints mentioning size |

---

### 29.7 Missing Phases

| ID | Gap | Severity | Recommendation |
|---|---|---|---|
| G-PH1 | **Phase 0.5 Shadow Mode** — log "would_send" without calling Flash for 48h | 🔴 P0 | Surface mismatches before flag flip. Insert between Phase 0 and Phase 1 |
| G-PH2 | **Phase 2.5 Beta rollout** — flag ON for top 100 fast-moving SKUs allowlist | 🟡 P1 | `dinoco_flag_shipping_meta_beta_skus` — more granular than single-admin canary |
| G-PH3 | **Phase 4.5 RPi hardware testing** — dedicated test day | 🟡 P1 | Procure 2 USB HID scanners, test latency on real Pi4 |
| G-PH4 | **Phase 5.5 Customer-facing enhancements** | 🟢 P2 | Placeholder only — defer |
| G-PH5 | **Phase 6 Post-launch metrics dashboard** | 🟡 P1 | "Shipping Ops" tab + 30-day trend charts |
| G-PH6 | **Emergency rollback playbook** — step-by-step runbook | 🔴 P0 | Add runbook: (1) flag OFF via wp-cli (2) revert via GitHub webhook (3) Telegram CEO (4) post-mortem 24h |
| G-PH7 | **Training phase** — video + in-app tour | 🟡 P1 | §25.3 mentions training video but not scheduled as phase |
| G-PH8 | **Data entry sprint** — 4 hrs/day allocated Week 2-3 | 🟡 P1 | §25.4 "80% in 2 weeks" unrealistic without allocated time |

---

### 29.8 Missing Risk & Mitigation

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| G-R1 | **Flash API contract change mid-rollout** | 🔴 P0 | Version-pinned SDK wrapper + weekly contract tests + unexpected-enum alert |
| G-R2 | **Scanner hardware compat** — some USB HID need drivers | 🟡 P1 | Document tested hardware in `rpi-print-server/CLAUDE.md`. Standardize Symbol DS2208 |
| G-R3 | **Data quality degradation over time** | 🟡 P1 | Soft-block (G-PD3) + Telegram alert for >5 SKUs/day without data |
| G-R4 | **Multi-warehouse dims vary** | 🟢 P2 | Assumes single spec globally. Flag for V.43 |
| G-R5 | **Thai charset in CSV export** | 🟡 P1 | UTF-8 BOM (existing Security Log pattern) |
| G-R6 | **Race condition in pickup upgrade** (§28 A3) | 🟡 P1 | `GET_LOCK` on `b2b_flash_active_pickup` mutation |
| G-R7 | **Coverage query cost at 100k SKUs** | 🟢 P2 | Incremental update on product save hook |
| G-R8 | **Backup restore drill** | 🟡 P1 | Dry-run restore on staging within 2 hrs |
| G-R9 | **LINE API rate limit with 12 new Flex types** | 🟡 P1 | Volume test: 100 orders/day → verify max 20/hr cap |

---

### 29.9 Missing Testing Scenarios

| ID | Test | Severity | Scope |
|---|---|---|---|
| G-T1 | **Stress test** — 100 concurrent Flash-create | 🟡 P1 | DB lock, cache hit, P99 latency |
| G-T2 | **Concurrency test** — 2 admins edit same SKU | 🔴 P0 | Playwright: verify 409 Conflict |
| G-T3 | **Accessibility** — keyboard + screen reader | 🟢 P2 | axe-core + NVDA/VoiceOver |
| G-T4 | **Offline Pi4 test** — unplug mid-scan | 🔴 P0 | Verify queue + auto-sync on reconnect |
| G-T5 | **Long-SKU test** — 50-leaf complex SET | 🟡 P1 | Aggregation < 100ms, no memory issue |
| G-T6 | **Charset edge** — Thai/emoji/special chars in CSV | 🟡 P1 | Round-trip survives |
| G-T7 | **Browser compat** — iPad Safari LIFF WebView | 🟡 P1 | Keyboard events differ from desktop |
| G-T8 | **Flash sandbox test** for T01-T20 | 🟡 P1 | Coordinate Flash staging merchant ID |
| G-T9 | **Regression — walk-in bypass** | 🔴 P0 | Walk-in orders skip Flash — V.42 must not regress |
| G-T10 | **Regression — flag OFF byte-identical to V.41.2** | 🔴 P0 | Diff payloads byte-by-byte |
| G-T11 | **Failure injection — Flash 500** | 🟡 P1 | Retry cron + admin Flex |
| G-T12 | **Flag toggle mid-order** | 🟡 P1 | Does order switch paths mid-flight? Document contract |

---

### 29.10 Missing Rollback Triggers

| ID | Trigger | Severity | Recommendation |
|---|---|---|---|
| G-RB1 | Flash error rate > 5% in 1hr | ✅ | Already in §22.2 |
| G-RB2 | **Auto-rollback cron infrastructure** | 🔴 P0 | `b2b_shipping_auto_rollback_cron` every 5 min — auto flag OFF + Telegram CRITICAL |
| G-RB3 | **Coverage drop > 20pts in 24h** | 🔴 P0 | Indicates data corruption — alert CEO + consider rollback |
| G-RB4 | **PHP fatal error rate spike** | 🟡 P1 | `b2b_log` grep `Fatal error` > 5 in 10 min → auto-rollback |
| G-RB5 | **Admin panic button** | 🔴 P0 | Big red "🚨 Rollback V.42 Shipping" in Admin Dashboard — instant flag OFF |
| G-RB6 | Customer complaint spike | 🟢 P2 | Out of scope — manual only |
| G-RB7 | **Scanner failure cluster** | 🟡 P1 | >10 failures/hr → auto-fallback to manual banner (partial degradation, no full rollback) |
| G-RB8 | **warehouseNo drift persistent** (>3 days) | 🟡 P1 | Auto-flag map as "stale" — force admin review |

---

### 29.11 Severity Summary

| Severity | Count |
|---|---|
| 🔴 P0 (must address before sign-off) | **21** |
| 🟡 P1 (should address before launch) | **19** |
| 🟢 P2 (nice-to-have post-launch) | **15** |
| **Total gaps** | **55** |

**P0 breakdown by category**: Problem (3) · User flows (4) · Data model (1) · UI states (2) · Impact (1) · Phases (2) · Risk (1) · Testing (4) · Rollback (3)

---

### 29.12 Recommended P0 Action Items (Top 10)

1. **Define ownership + SLAs** (G-PD1/2/3) — add §1.4 "Ownership & SLAs" subsection
2. **Add audit trail table** (G-DM1) — `wp_dinoco_shipping_audit` schema
3. **Shadow Mode Phase 0.5** (G-PH1) — insert between Phase 0 and Phase 1
4. **Optimistic locking** (G-UF6) — `updated_at` header check
5. **Offline Pi4 queue** (G-UF10/G-UI4) — IndexedDB + sync worker
6. **Kiosk mode CSS** (G-UI9) — 480×320 dedicated layout
7. **Permission audit** (G-IMP10) — verify X-Print-Key scope
8. **Emergency runbook** (G-PH6) — step-by-step in `rpi-print-server/CLAUDE.md`
9. **Auto-rollback + panic button** (G-RB2/3/5) — instant revert
10. **Regression walk-in + flag OFF** (G-T9/T10) — byte-identical to V.41.2

---

### 29.13 Feature Architect Sign-off

**Status**: ⚠️ **NOT READY for Phase 1** — 21 P0 items must resolve or explicitly defer with justification.

**Before Phase 1 sign-off**:
- [ ] Address all 21 P0 items
- [ ] User approves deferred P2 items for post-launch roadmap
- [ ] Spec updated with Ownership & SLAs (§1.4 new)
- [ ] Phase 0.5 Shadow Mode added to roadmap
- [ ] Emergency runbook drafted
- [ ] Auto-rollback infrastructure defined

**Feature Architect Sign-off**: _____________ Date: _______

**Impact estimate**: Addressing 21 P0 items adds ~6-8 hrs total (mostly Phase 0.5 Shadow Mode + G-DM1 audit table + G-UI9 kiosk mode + G-RB* rollback infra + G-T9/T10 regression). Saves ~2-4 days production firefighting post-launch. Net-positive ROI.

---

# PART IV — Data Research Gaps

## 30. Data Research — External Integration & Compliance Gaps

> **Scope**: 23 new gaps (6 P0 / 11 P1 / 6 P2) — additive to prior 55 from §27-29.
> **Focus**: External integrations, compliance, monitoring, backup couriers — NOT covered by 4 previous agents.

### 30.1 Flash API features declared but UNUSED

| Endpoint | Helper Location | Status | Gap |
|---|---|---|---|
| `open/v1/orders/estimate_rate` | Snippet 1 L4288 | Never called | No pre-flight cost preview. P1 |
| `open/v1/orders/modify` | Snippet 1 L4294 | Never called | Cannot fix `expressCategory` post-print (Q5). P1 |
| `open/v1/warehouses` | Snippet 1 L4309 | Debug only | Multi-warehouse routing unwired. **P0** |
| `open/v1/new_sub_account` | Snippet 1 L4334 | Never called | Sub-account billing split. P2 |
| `returnName/returnPhone/returnProvince` | Not in create_order L4186 | Not sent | **Return-to-sender goes to Flash default, not DINOCO**. **P0 data-loss** |
| `opdInsureEnabled` | — | Not sent | On-premise delivery insurance. P2 |
| `deliveryNote` | — | Not sent | Driver notes ("call before arrival"). P2 |
| `expressCategory=6/7 Happy Return` | — | Never wired | **No RMA flow**. P1 |
| `dstHomePhone` | — | Not sent | Fallback contact reduces DIFFICULTY_HANDOVER. P2 |
| `expressCategory=2 On-Time Delivery` | — | Never offered | Premium SLA for urgent orders. P2 |

### 30.2 LINE API — Shipping-adjacent features unused

- **LIFF share tracking** — `[B2B] Snippet 11` no `liff.shareTargetPicker()`. Distributor can't forward tracking to end-buyer. P2
- **Admin group rich menu** — no shortcuts for Flash ops (cancel/modify/reprint). P2
- LINE Notify business shipping templates — already adequate via Flex. No gap.

### 30.3 MCP Bridge — Shipping endpoints missing (AI bot blind)

`[System] DINOCO MCP Bridge` registers 32 endpoints. **Zero shipping**. Chatbot cannot answer:
- "กล่องนี้ใหญ่แค่ไหน" — no SKU→dims lookup
- "ออเดอร์ #1234 ใช้รถอะไรส่ง" — no vehicle read-back
- "ค่าส่งประมาณเท่าไหร่" — no rate estimate

**Recommended (P1)**:
1. `GET /dinoco-mcp/v1/shipping-meta/{sku}` — read shipping_* columns
2. `GET /dinoco-mcp/v1/shipping-estimate/{order_id}` — wrap estimate_rate
3. `GET /dinoco-mcp/v1/tracking-status/{pno}` — wrap get_routes for chatbot FAQ

### 30.4 Config gaps (admin-tunable settings missing)

| Config | Purpose | Priority |
|---|---|---|
| `b2b_shipping_per_dist_override` | ร้านเฉพาะขอ expressCategory=2 หรือ =4 | P1 |
| `b2b_shipping_hazmat_skus` | Flash restricts (future-proof if catalog expands) | P2 |
| `b2b_shipping_insured_threshold_baht` (default 1000) | Auto-buy Flash Care when order > threshold | P1 |
| `b2b_shipping_disable_provinces` | 3 southernmost (Pattani/Yala/Narathiwat) have surcharge | P2 |
| `b2b_shipping_flash_webhook_max_retries` | Expose retry budget to admin | P2 |

### 30.5 Workflow gaps (business process)

**Gap A — Return/RMA flow (P0 business-critical)**
- Flash `expressCategory=6/7 Happy Return` unused. Warranty claim workflow exists but no integration.
- V.43+: `b2b_flash_create_return()` triggered by claim approval. Requires returnName/returnPhone/returnAddress params (currently not sent).

**Gap B — Multi-origin pickup (P0 operational)**
- CLAUDE.md confirms 2 warehouses (FoxRider รามอินทรา + PPT ลาดพร้าว). `b2b_warehouse_address` is single-valued. 
- Cross-warehouse transfers ship from wrong origin. V.42 doesn't address.
- V.43: migrate to `b2b_warehouses` table + `_warehouse_id` per order.

**Gap C — Partial shipment + BO secondary (P0)**
- BO secondary order via `b2b_flash_create_secondary()` — no check if uses same warehouseNo as primary.
- V.42: add REG-033 regression test + `_b2b_bo_warehouse_id` meta carrying origin.

**Gap D — Bulk cargo workflow (P1)**
- Flash `expressCategory=4` only handles standard truck. No 3rd-party cargo fallback (SCG/J&T Cargo) for > 100 box orders.
- V.43+: `b2b_shipping_bulk_threshold` config + manual non-Flash tracking UI.

**Gap E — International shipping (P2)**
- Flash supports PH/MY/LA. Not urgent — flag for roadmap.

### 30.6 PDPA / regulatory compliance

**Gap A — Shipping data retention (P0)**
- Spec §28 mentions "180-day audit" but PDPA §37 requires documented purpose + explicit retention. `dst_address/dst_phone` = personal data.
- Fix: `wp_b2b_shipping_audit_log.deletion_scheduled_at` + cron `b2b_shipping_pii_purge_cron` (day 181). Admin export before purge (CSV encrypted).

**Gap B — CSV export audit trail (P1)**
- Manual shipments CSV includes dst_address — no audit log. PDPA Art. 37 breach exposure.
- Fix: log every export to `wp_dinoco_pii_access_log` with user_id + IP + UA + filter + row_count.

**Gap C — Distributor consent (P1)**
- Distributor CPT has shipping addresses but no consent checkbox. Employee contact = personal data.
- Fix: `dist_pdpa_consent` ACF field + timestamp.

**Gap D — Thai consumer protection (P1)**
- พ.ร.บ.ขายตรง 2545: shipping delays > 7 days require proactive notification. ETA exists but no auto-notify on SLA breach.
- Low: สคบ. labeling (มอก.) — distributor-facing, low risk.

### 30.7 Industry benchmarks — Single-courier lock-in (P1)

DINOCO uses Flash only. No fallback if Flash API down → B2B ships **nothing**.

- **Shopee/Lazada** multi-courier: rule-based fallback (primary=Flash, secondary=Kerry, tertiary=J&T) by zone.
- **Kerry API**: `https://openapi.kerryexpress.com/v2/` — similar surface to Flash.
- **J&T Express**: `https://openapi.jtexpress.co.th/webopenplatformapi/api/`.
- **Thailand Post**: slower, govt-backed, good for low-value insured.

**V.44+**: courier abstraction layer — `b2b_courier_create_order($provider, ...)` dispatch. Start Flash + Kerry dual-wire for high-value tickets.

### 30.8 Monitoring & observability gaps

| Gap | Priority | Fix |
|---|---|---|
| Flash webhook replay defense has no alert on detection | P0 | Fire Telegram `enumeration_attempt` (reuse BO channel) |
| No Flash API outbound rate limit — bug loop can block mchId | P1 | `b2b_rate_limit('flash_api_out', 60/min)` |
| `b2b_flash_tracking_cron` silent fail — no dashboard card | P1 | S9 admin add "Flash API health" card (last-success + failure_count_24h) |
| No structured JSON logs — `b2b_log()` free-form only | P2 | Migrate to `wp_dinoco_log` with category/event/payload_json |
| Flash API version hardcoded — no deprecation monitor | P2 | Weekly `b2b_flash_api_version_check_cron` |
| No Sentry/Rollbar/Datadog integration | P2 | Out of V.42 scope — roadmap item |

### 30.9 Prioritized action list

**V.42 must-add (before flag ON)**:
- **P0-30.1a**: Wire `returnName/returnPhone/returnProvince` (1 hr) — data loss risk
- **P0-30.5c**: REG-033 + `_b2b_bo_warehouse_id` meta for partial ship (3 hr)
- **P0-30.6a**: Retention policy + `pii_purge_cron` (1 day incl. legal review)
- **P0-30.8a**: Telegram alert on Flash webhook replay (30 min)
- **P1-30.4a**: `b2b_shipping_insured_threshold_baht` config (2 hr)
- **P1-30.8b**: Flash API rate limit + health card (4 hr)

**V.43 scope**:
- P0-30.5a: Flash Happy Return integration
- P0-30.5b: Multi-warehouse migration
- P1-30.3: 3 MCP Bridge shipping endpoints
- P1-30.1b: Rate estimate preview
- P1-30.1c: `modify_order` callable

**V.44+**:
- P1-30.7: Courier abstraction (Flash + Kerry fallback)
- P1-30.5d: Bulk cargo threshold
- P2-30.5e: International expansion

---

**Total new gaps (Section 30 only)**: 23 (6 P0 / 11 P1 / 6 P2).
**Combined spec totals**: 78 gaps (27 P0 / 30 P1 / 21 P2).

---

# PART V — Final Sign-off & Simplifications

## 31. Final Decisions (2026-04-17)

**User sign-off**: ทั้ง 27 P0 approved with simplifications that reduce scope ~30%.

### 31.1 Scope simplifications (reduce Phase 1 work)

| P0 | Final Decision | Impact |
|---|---|---|
| P0-1 SLA | **Skip** — ไม่ตั้ง target formal, monitor actual | Remove §24 SLA table |
| P0-2 Ownership | **Skip** — admin group self-managed | Remove §29.1 ownership section |
| P0-3 New SKU without dims | **STRICT BLOCK** — ต้องกรอก dims ทุกครั้งตอนสร้าง | Force validation in Admin Inventory form |
| P0-4 Audit log | **SKIP** — ไม่เก็บ audit (offload via P0-3 strict block) | Drop `wp_dinoco_shipping_audit` table |
| P0-5 Concurrent edit | **"Last-write-wins"** — no optimistic locking (single admin in practice) | Drop 409 Conflict logic |
| P0-8 Kiosk mode | **Admin viewable only** — kiosk route + responsive | Same as recommend |
| P0-10 API key data exposure | **OK** — RPi internal, expose pricing/WAC | No redaction logic |
| P0-11 Shadow Mode | **SKIP** — ใช้จริงเลย (no dry-run phase) | Skip Phase 0.5 |
| P0-13 Panic button | **SKIP** — trust auto-rollback cron | No Admin Dashboard button |
| P0-16 Mixed-vehicle order | **Always truck** (simpler — no split) | Single pickup = truck if ANY large |
| P0-22 Happy Return | **Defer V.43** | Out of V.42 scope |
| P0-23 Multi-warehouse | **Defer V.43** | Keep single warehouse |
| P0-24 BO warehouse meta | **Defer V.43** | Out of V.42 scope |
| P0-25 PDPA retention | **SKIP** — keep data forever (user decision) | No purge cron |

### 31.2 Approved P0 items (proceed)

| P0 | Status |
|---|---|
| P0-6 Partial pickup FSM | ✅ Approved |
| P0-7 Pi4 offline queue | ✅ Approved — browser local + auto-sync |
| P0-9 warehouse_staff role | ✅ Approved |
| P0-12 Auto-rollback cron | ✅ Approved (5% error threshold) |
| P0-14 Walk-in regression | ✅ Approved |
| P0-15 Flag OFF byte-identical | ✅ Approved |
| P0-17 Multi-box partial fail Flex | ✅ Approved |
| P0-18 Truck pickup Flex | ✅ Approved |
| P0-19 Pickup upgrade Flex | ✅ Approved |
| P0-20 expressCategory=4 created Flex | ✅ Approved |
| P0-21 returnAddress = รามอินทรา 14 | ✅ Approved |
| P0-26 Webhook replay Telegram alert | ✅ Approved |
| P0-27 Partial ship recompute | ✅ Approved |

### 31.3 Revised Phase plan (after simplifications)

**Phase 1** (Schema + Helpers) — **3-4 ชม** (down from 4-5):
- Schema 6 cols + strict NOT NULL at product save (P0-3)
- 4 helpers per §27.4
- NO audit log
- NO optimistic locking

**Phase 2** (Admin UI) — **3-4 ชม** (down from 4-5):
- Edit Product modal + STRICT VALIDATION when creating new SKU
- Bulk CSV import
- Coverage widget
- Kiosk route for Pi4 view

**Phase 3** (B2B Ticket) — **2-3 ชม** — unchanged (still blocked on Flash Q1-Q11)

**Phase 4** (Manual-ship + Scanner) — **3-4 ชม** (down slightly):
- Browser local offline queue (P0-7)
- No Shadow Mode
- Mixed-vehicle = always truck (P0-16 simpler)

**Phase 5** (Launch + Monitor) — **1-2 ชม** (down from 2-3):
- Auto-rollback cron (P0-12)
- NO panic button
- Telegram replay alert (P0-26)
- 2 regression tests (P0-14/15)

**NEW Phase 3.5** (Flex Cards) — **2-3 ชม**:
- 4 new Flex templates (P0-17/18/19/20)
- Integrate with pickup upgrade logic
- Dedup + rate limit (§28.4)

**Total revised**: 12-17 ชม (down from 18-22)

### 31.4 Blocked items (still pending)

- ⏳ **Flash Q1-Q11** — blocks Phase 3+4 start (warehouseNo routing)
- ⏳ **User Flash answers** — needed before Phase 3 kick-off

### 31.5 V.43 backlog (deferred per user decision)

| Item | Source | Reason |
|---|---|---|
| Flash Happy Return (expressCategory=6/7) | P0-22 | V.43 |
| Multi-warehouse migration | P0-23 | V.43 — current single sufficient |
| BO secondary warehouse meta | P0-24 | V.43 — tied to multi-warehouse |
| Audit log table | P0-4 | Offloaded via strict block |
| PDPA purge cron | P0-25 | No retention policy |
| Panic button | P0-13 | Auto-rollback sufficient |
| Shadow Mode phase | P0-11 | Direct to production |

---

## 32. Green Light — Phase 1 Start

User approval: **2026-04-17**
Auto mode: **active** — agent proceeds with Phase 1 immediately
Target: complete Phase 1+2 before Flash answers arrive

# PART VI — Security & QA Review

## 34. Security Audit (security-pentester)

**Total**: 43 findings (12 P0 / 22 P1 / 9 P2)
**Verdict**: **Plan NOT secure-enough to proceed** — 12 P0 security items must resolve or explicit risk-accept before Phase 1

### 34.1 Top 12 P0 Security Items

| # | Finding | OWASP | Fix |
|---|---|---|---|
| S1 | `/sku-shipping/{sku}` enumeration via leaked X-Print-Key | A01 | Split into 2 endpoints: `/sku-shipping-scanner/{sku}` (warehouse_staff — stripped fields) vs `/sku-shipping/{sku}` (admin — full shape) |
| S2 | `warehouse_staff` role capability undefined → privilege escalation | A01 | Explicit allowlist: `read`, `b2b_warehouse_scan`, `b2b_warehouse_submit` only. Explicit deny `edit_*/delete_*/manage_*` |
| S3 | `/sync-scan-queue` has no device identity → fake scans | A07 | Device-HMAC: `sign = HMAC(device_secret, device_id \| batch_epoch \| SHA256(body))`. `device_secret` server-generated, rotated 24h |
| S4 | `/flash-override-vehicle` + `/flash-cancel-pickup` CSRF | A01+A08 | Require `X-WP-Nonce: wp_rest` on all write endpoints |
| S7 | 6 new DB columns + MySQL < 8.0.16 CHECK no-op | A03 | PHP validator primary defense: `absint()` + range check before `$wpdb->prepare()` |
| S8 | CSV formula injection (`=SUM/@+-`) → Excel macro → PDPA leak | A03 | Strip leading `=+-@\t\r\n` from every cell on IMPORT AND EXPORT |
| S14 | XSS in Flex card override reason text | A03 | Whitelist dropdown values OR `esc_html()` at render + `<>` strip at save |
| S15 | `/sku-shipping/{sku}` `source/missing_fields/is_leaf` info disclosure | A01+A03 | Scanner endpoint returns ONLY `{sku, weight, L, W, H, article, express}` stripped |
| S20 | `/sync-scan-queue` batch=10000 → memory DoS | A04 | Hard cap `batch.length <= 50`, 413 Payload Too Large, per-device quota 500/hr |
| S25 | Webhook replay → duplicate status update → stock double-restore | A08 | Order: (1) HMAC sig FIRST (2) replay nonce transient 24h (3) idempotent update with prev-status check |
| S29 | IndexedDB tampering → fake queue items on kiosk | A08+A01 | Sign queue items at scan time with device HMAC. Verify on sync — reject if mismatch or sig_at > 24h |
| S32 | No HTTPS on LAN `/sync-scan-queue` → MITM swap dst_address | A02 | MANDATORY HTTPS for sync-scan-queue + cert pinning in dashboard.py |
| S35 | Auto-rollback denial-of-feature attack (inject 5% errors) | A04 | Require rate% > 5% AND absolute count > 20/hr (both) |
| S39 | Bulk import CSRF | A05+A03 | `wp_nonce_field('shipping_bulk_import')` + `check_admin_referer()` OR `X-WP-Nonce` |

### 34.2 Minimum Gate Before Phase 1 Code
- [ ] S1/S15: Split scanner endpoint from admin endpoint
- [ ] S2: Define warehouse_staff capability allowlist in spec
- [ ] S4/S39: Nonce enforcement on all POST endpoints
- [ ] S7: PHP validator documented as primary defense in helpers
- [ ] S8: CSV injection strip helper in spec
- [ ] S25: Webhook replay order documented

### 34.3 Phase 4 Blocker — Offline Queue Security (S3/S29/S32)
Before manual-ship RPi code: ~300 LOC security primitives (device HMAC, sig verify, HTTPS enforcement)

---

## 35. QA Test Plan (browser-tester)

**Total**: 29 regression scenarios (3 existing + 26 new) · 11 Critical / 12 High / 6 Medium

### 35.1 Launch Blockers (7 must PASS before flag ON)
1. **REG-031** — New SKU strict block Thai error
2. **REG-033** — SET compute math correctness
3. **REG-036** — CSV formula injection rejection
4. **REG-037/038** — Vehicle threshold (5kg / 45cm) routing
5. **REG-055** — Flag OFF byte-identical V.41.2 payload
6. **REG-056** — Auto-rollback at 5% errors triggers

### 35.2 New Regression Scenarios
- **Catalog** (REG-031 to 036): new SKU block / edit OK / SET aggregation / DD-3 shared / bulk 500 / CSV injection
- **Flash API** (REG-037 to 043): small=bike / large=truck / mixed=truck / multi-box subparcel / partial fail Flex / 1003 retry / 1022 no-retry
- **Pickup** (REG-044 to 047): first bike / upgrade to truck / reuse truck / cancel from Flex
- **Scanner** (REG-048 to 052): auto-fill / fallback / offline queue / reconnect sync / TTL expire
- **Override** (REG-053 to 054): admin override + audit / last-write-wins
- **Flag** (REG-055 to 056): OFF byte-identical / auto-rollback

### 35.3 Performance Benchmarks
- Schema migration 10k SKUs < 2s
- `dinoco_compute_set_shipping` (20 leaves) < 50ms
- Bulk CSV 500 rows < 10s
- REST `/sku-shipping/{sku}` P95 < 100ms
- Flash API outbound < 3s (timeout 15s)

### 35.4 Edge Cases
- SKU weight=0 (free sample)
- 200cm bar exceeding Flash 150cm max
- NULL article_category → fallback 6
- Concurrent flag toggle mid-order
- Empty order (0 items)
- All-discontinued SKUs

### 35.5 CI/CD Integration
- Pre-push hook `scripts/git-hooks/pre-push` runs `--mode=gate --severity=critical`
- GitHub Actions `.github/workflows/regression-guard.yml`
- Deploy gate `scripts/deploy.sh` step 0
- Override: `git push --no-verify` / `SKIP_REGRESSION=1`
- Drift cron 03:00 alerts if pass_rate_7d < 90%

### 35.6 Manual Test Plan
- Real LINE Flex render visual review
- Kiosk Pi4 480×320 physical scan test
- Flash staging sandbox E2E with real tracking
- Thermal printer label render check
- Multi-admin concurrent edit (2 browser sessions)

---

## Consolidated P0 Count (across all reviews)

| Source | P0 Count |
|---|---|
| User approved (original 27) | 13 (after simplifications) |
| api-specialist (§33) | 12 |
| **security-pentester (§34)** | **12 NEW** |
| browser-tester (§35) | 7 launch blockers |
| **Grand total P0** | **~37 (after overlap consolidation)** |

**Effort impact**: +4-5 hrs to Sprint A for security P0s (S1/S15/S2/S4/S7/S8/S14/S39) + ~300 LOC to Phase 4 for offline queue security (S3/S29/S32)

**Revised total effort**: ~22-26 hrs (was 17-20)
