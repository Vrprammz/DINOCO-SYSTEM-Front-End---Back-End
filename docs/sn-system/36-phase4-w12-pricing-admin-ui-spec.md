# 36 — Phase 4 W12 · Per-SKU Extension Pricing Admin UI Spec

[← SN System docs](./README.md)

> **Status**: SPEC · Boss-binding inputs locked (Q8 R2 + 2026-05-15 final decisions). Ready to dev when Phase 4 W12 starts.
> **Boss decisions referenced**: Q6 / Q7 / Q8 / Q15 / Q20 / 2026-05-15 #1 (non-VAT บัญชีบุคคล)
> **Effort estimate**: ~24-30h dev (UI + REST + DB ALTER + tests + drift detector)
> **Replaces / supersedes**: parts of `08-f8-extension-marketplace-q6-q8-q7-q20-replan.md` §"UX/UI (Phase 4 W12)" + `35-boss-final-decisions-2026-05-15.md` #1

---

## 1. Background

### 1.1 ทำไมต้องมีหน้านี้

บอส Q8 R2 (2026-05-05): "ไม่ตายตัว — backend จะให้กรอกว่าแต่ละ SKU ต่อเท่าไหร่ต่อปี"

→ ระบบ Extension Marketplace (F#8) ต้องให้ admin กรอกราคาต่อประกัน **per-SKU manual** (ไม่ใช่สูตรอัตโนมัติ % ของ retail) ปัจจุบันยังไม่มี UI ใด ๆ — schema column ใน `wp_dinoco_products` ยังไม่ได้ ALTER · LIFF customer flow read pricing ผ่าน helper stub `dinoco_sn_get_extension_price()` (Snippet 1 V.6.6+) ที่ return null เสมอ → **ไม่มี SKU ตัวไหนเปิดให้ต่อประกันได้เลย**

→ Phase 4 W12 = unblock customer-side flow (W13)

### 1.2 Boss decisions ที่ binding 100%

| # | Topic | Boss answer | Implication |
|---|---|---|---|
| Q8 R2 | Pricing model | per-SKU manual กรอกเอง (1y/2y/3y) | ต้องมี admin UI กรอก 3 ราคา per SKU |
| Q7 R2 | Payment | Slip2GO เช็คสลิป + เลขบัญชี (reuse `B2B_SLIP2GO_SECRET_KEY` + `B2B_BANK_*`) | ไม่ต้องมี payment gateway field ใน UI |
| Q20 R2 | Refund policy | manual flow (admin Facebook DM → Backend ปุ่มยืนยันคืน) | ไม่ต้องมี auto-refund settings |
| 2026-05-15 #1 | VAT / tax invoice | non-VAT บัญชีบุคคล — **ไม่มี VAT, ไม่มีใบกำกับภาษี** | ❌ ห้าม VAT field, ห้าม tax invoice header settings |
| Q15 R2 | Approver list | role-based access เดิม (Q15 Role Manager) | UI access gate = `dinoco_sn_perm_admin` capability (no per-page allowlist) |
| Q6 | Phase placement | Phase 4 W12-13 (ไม่ใช่ Phase 5) | **ต้อง ship ใน Phase 4** — กระทบ go-live timing |

### 1.3 What "manual per-SKU pricing" means in practice

ตัวอย่างจาก boss intent:

| SKU | สินค้า | retail | 1y price | 2y price | 3y price | เปิดต่อประกัน? |
|---|---|---|---|---|---|---|
| `DNCSETXL7500X001H` | Crash Bar Pro Rally | ฿8,800 | ฿1,200 | ฿2,160 | NULL | ✅ 1y + 2y only |
| `DNC4537SETGNDPRO002` | กันล้ม Pro 4537 | ฿12,500 | ฿1,500 | ฿2,800 | ฿3,900 | ✅ ครบ 3 ตัว |
| `DNCNX500001IRONB` | Iron child only | ฿2,500 | NULL | NULL | NULL | ❌ ปิด (not eligible) |
| `DNCSXSPACER001` | Spacer (อะไหล่เล็ก) | ฿250 | NULL | NULL | NULL | ❌ ปิดถาวร |

→ admin opt-in per SKU; raคา flexible ไม่ผูกกับ retail

---

## 2. Design Decisions ตอบคำถามบอส

### 2.1 (ก) UI อยู่ที่ไหน — A vs B vs C?

**Options analyzed**:

| Option | Where | Pros | Cons |
|---|---|---|---|
| **A** | Inventory → Edit Product modal → NEW section | ✅ ใช้ flow เดียวกับ pricing/SN config/shipping ที่ admin คุ้นมือ · ✅ atomic edit per SKU · ✅ inline กับ retail/dealer price → admin เห็นภาพ margin · ✅ reuse modal CSS + state mgmt + validation | ⚠️ admin ที่ดู extension อย่างเดียว ต้อง dig เข้า Inventory product modal · ⚠️ bulk edit ทำไม่ได้ |
| **B** | SN Manager → NEW Tab "💰 Extension Pricing" | ✅ admin Marketplace operator ไม่ต้องสลับไป Inventory · ✅ bulk edit table-style · ✅ filter "เปิดแล้วกี่ SKU" / "ยังไม่ตั้งราคา" | ❌ ห่างจากบริบท (retail, hierarchy, sn_attach_level) · ❌ duplicate save handler + cache invalidate · ❌ admin ต้องสลับ 2 หน้าเวลาแก้ราคา + แก้ retail พร้อมกัน |
| **C** | Hybrid — section เล็กใน Edit modal (single SKU) + Tab bulk view ใน SN Manager (read-only summary + jump link) | ✅ ครอบคลุม both per-SKU edit + admin overview · ✅ NO duplicate write path | ⚠️ effort สูงขึ้น (~+8h) · ⚠️ surface area กว้าง — drift detector ต้องครอบทั้ง 2 ที่ |

### 2.2 ✅ Recommendation: **Option C (Hybrid)** — ship in 2 sub-phases

**Sub-phase W12.A** (~16h): **Inventory Edit Product modal section** = canonical write path (boss seed ราคาแรก ๆ ผ่านที่นี่)

**Sub-phase W12.B** (~8h): **SN Manager Tab "💰 Extension Pricing"** = read-only overview table (filter / search / bulk action จะ deep-link กลับเข้า Inventory modal — NO duplicate write handler)

**Reasoning**:
1. Inventory modal = source of truth (existing `POST /dinoco-stock/v1/product/pricing` pattern — V.35.0 dual-write custom table + cache invalidate + idempotency wrapper)
2. SN Manager tab = operator's lens (Coverage widget + filter "ยังไม่ตั้งราคา" + jump-to-edit) — ไม่เพิ่ม write surface
3. Phase 5 ค่อยเพิ่ม Bulk CSV import ใน Tab ถ้า volume justifies (defer)

### 2.3 (ข) กรอกอะไร — แค่ 1 ปี / หรือ 1y/2y/3y/lifetime?

**Boss intent (Q8 R2 + 08-f8 design doc)**: ให้กรอก **1y / 2y / 3y** — `NULL` = ไม่เปิด option นั้นให้ลูกค้าเห็นใน LIFF

**Lifetime tier** (DEFERRED — ไม่ใน W12 scope):
- บอสไม่ได้พูดถึง lifetime ใน Q8 R2
- DINOCO ใช้คำว่า "ตลอดชีพ" ใน chatbot rules ห้ามใช้ (ban) → **ห้ามมี lifetime tier**
- ถ้าอนาคต business model เปลี่ยน → Phase 6+ ค่อย add column `sn_ext_price_lifetime`

**Final field set (locked W12 scope)**:

| Column | Type | Nullable | Meaning |
|---|---|---|---|
| `sn_ext_price_1y` | DECIMAL(10,2) | YES (NULL = not offered) | ราคาต่อ 1 ปี (THB, ไม่มี VAT — non-VAT บุคคล) |
| `sn_ext_price_2y` | DECIMAL(10,2) | YES | ราคาต่อ 2 ปี |
| `sn_ext_price_3y` | DECIMAL(10,2) | YES | ราคาต่อ 3 ปี |
| `sn_ext_grace_days` | TINYINT UNSIGNED | NO (default = global setting) | per-SKU override ของ grace period (Q19 = 30 วัน) — ส่วนใหญ่ใช้ global |
| `sn_ext_terms_url` | VARCHAR(255) | YES | optional T&C link per SKU (เช่น "ราคารวมเปลี่ยนกระจกหน้า/หลัง" ติดบนใบเสร็จ) |
| `sn_ext_updated_by` | BIGINT UNSIGNED | YES | wp_users.ID — audit |
| `sn_ext_updated_at` | DATETIME | YES | audit timestamp |

→ 7 columns ALTER บน `wp_dinoco_products` (3 prices + 1 grace + 1 terms + 2 audit)

---

## 3. DB Schema

### 3.1 ALTER on existing `wp_dinoco_products`

```sql
ALTER TABLE wp_dinoco_products
  ADD COLUMN sn_ext_price_1y DECIMAL(10,2) NULL DEFAULT NULL
    COMMENT 'Q8 manual: ราคาต่อประกัน 1 ปี (THB, non-VAT บุคคล). NULL = ไม่เปิดต่อประกัน',
  ADD COLUMN sn_ext_price_2y DECIMAL(10,2) NULL DEFAULT NULL
    COMMENT 'Q8 manual: ราคาต่อประกัน 2 ปี. NULL = ไม่เปิด 2y option',
  ADD COLUMN sn_ext_price_3y DECIMAL(10,2) NULL DEFAULT NULL
    COMMENT 'Q8 manual: ราคาต่อประกัน 3 ปี. NULL = ไม่เปิด 3y option',
  ADD COLUMN sn_ext_grace_days TINYINT UNSIGNED NULL DEFAULT NULL
    COMMENT 'Q19 grace period override per SKU (NULL = use global wp_option dinoco_sn_extension_grace_days, default 30)',
  ADD COLUMN sn_ext_terms_url VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'Optional per-SKU T&C link displayed on customer LIFF + receipt',
  ADD COLUMN sn_ext_updated_by BIGINT UNSIGNED NULL DEFAULT NULL
    COMMENT 'wp_users.ID who last edited extension pricing — audit',
  ADD COLUMN sn_ext_updated_at DATETIME NULL DEFAULT NULL
    COMMENT 'Last extension pricing edit timestamp — audit',
  ADD INDEX idx_sn_ext_enabled (sn_ext_price_1y);
```

**Notes**:
- 3 nullable columns (1y/2y/3y) instead of 1 JSON column → SARGable WHERE filters · ALTER-friendly · simpler validation
- `idx_sn_ext_enabled (sn_ext_price_1y)` — index covers "show only SKUs with extension enabled" query (filter SET 1y NOT NULL = baseline opt-in)
- `sn_ext_grace_days` per-SKU override — ส่วนใหญ่ NULL (ใช้ global) แต่บอสอาจอยากตั้ง premium SKU = 60 วัน
- All ALTER **idempotent** ผ่าน INFORMATION_SCHEMA precheck (pattern จาก SN system Phase 1 W2 + Inventory V.46.1 sn_attach_level ALTER)

### 3.2 Lazy ALTER guard helper (mirror Inventory V.46.1 sn_attach_level pattern)

```php
function dinoco_sn_ext_pricing_columns_exist() {
    static $cache = null;
    if ($cache !== null) return $cache;
    global $wpdb;
    $table = "{$wpdb->prefix}dinoco_products";
    $row = $wpdb->get_var(
        "SHOW COLUMNS FROM {$table} LIKE 'sn_ext_price_1y'"
    );
    return $cache = (bool) $row;
}
```

→ All UI code paths gate behind this check + render notice "⚠️ Schema migration ยังไม่รัน — ติดต่อ dev team" if false

### 3.3 Cache invalidation contract

| Trigger | Cache to invalidate |
|---|---|
| Save extension pricing for SKU | `delete_transient('b2b_sku_data_map')` (legacy ACF cache) · `DINOCO_Catalog::flush_memo($sku)` (per-SKU memo) · `wp_cache_delete($sku, 'dinoco_ext_pricing')` (NEW group) |
| LIFF customer query `GET /extension/pricing/{sku}` | wp_cache_get(group=dinoco_ext_pricing) → 5min TTL · invalidate via above |
| SN Manager Tab summary `GET /sn-ext-pricing/list` | per-request memo only (admin uses ⏱) |

→ NEW cache group `dinoco_ext_pricing` (separate from `b2b_sku_data_map`) prevents bloating bulk SKU map

---

## 4. REST API contracts

All under `/wp-json/dinoco-stock/v1/` namespace (existing) + `/wp-json/dinoco-sn/v1/` (read-only summary):

### 4.1 `POST /dinoco-stock/v1/product/sn-ext-pricing` — Save 3 prices + grace + terms

**Auth**: `manage_options` OR `dinoco_sn_perm_admin` capability + `X-WP-Nonce` (wp_rest)
**Idempotency**: Round 30+ pattern — `X-Idempotency-Key` header + body hash `{sku, price_1y, price_2y, price_3y, grace_days, terms_url}` — different prices mid-retry → 409 (prevent fat-finger override)
**Rate limit**: 30 req/min per user (admin-side, generous)

**Request body**:
```json
{
  "sku": "DNCSETXL7500X001H",
  "price_1y": 1200.00,
  "price_2y": 2160.00,
  "price_3y": null,
  "grace_days": null,
  "terms_url": "https://dinoco.in.th/extension-terms-crashbar"
}
```

**Validation rules**:
- `sku` required, must exist in `wp_dinoco_products` (BINARY UPPER lookup utf8mb4_bin)
- Each `price_*y` either `null` (= disable that tier) OR `>= 0.00` AND `<= 50000.00` (cap at 50k — sanity check, prevent fat-finger 6-digit typo)
- If ALL 3 prices = null → SKU effectively disabled (allowed — admin opt-out)
- `grace_days` either null (use global) OR `1..365`
- `terms_url` either null OR valid HTTPS URL (`esc_url_raw` + scheme check)
- Defensive `dinoco_sn_ext_pricing_columns_exist()` guard → 503 `schema_not_migrated` if false

**Response 200**:
```json
{
  "success": true,
  "sku": "DNCSETXL7500X001H",
  "saved": {
    "price_1y": 1200.00,
    "price_2y": 2160.00,
    "price_3y": null,
    "grace_days": null,
    "terms_url": "https://dinoco.in.th/extension-terms-crashbar",
    "updated_by": 1,
    "updated_at": "2026-05-XX 14:32:11"
  },
  "extension_enabled": true,
  "audit_id": 12345
}
```

**Response 409 (idempotency conflict)**:
```json
{
  "code": "idempotency_conflict",
  "message": "พบการบันทึกซ้ำด้วยข้อมูลที่ต่างกัน — กรุณาเช็คอีกครั้ง",
  "data": { "status": 409 }
}
```

**Response 422 (validation)**:
```json
{
  "code": "invalid_price",
  "message": "ราคาต้องอยู่ระหว่าง 0 ถึง 50,000",
  "data": { "field": "price_1y", "value": 999999, "status": 422 }
}
```

**Side effects**:
- UPDATE `wp_dinoco_products` SET 5 columns + audit (`sn_ext_updated_by` = current_user_id + `sn_ext_updated_at` = NOW)
- Cache invalidate (group `dinoco_ext_pricing` + `b2b_sku_data_map` transient + per-SKU memo)
- Audit row → `wp_dinoco_sn_audit` (event_type = `extension_pricing_changed`, payload = before/after diff)
- Hook `do_action('dinoco_sn_ext_pricing_changed', $sku, $before, $after, $user_id)` — Phase 5 listeners

### 4.2 `GET /dinoco-stock/v1/product/sn-ext-pricing/{sku}` — Read current pricing

**Auth**: `manage_options` OR public LIFF (with masking — see §4.7)
**Caching**: wp_cache_get group `dinoco_ext_pricing` 5min TTL

**Response 200**:
```json
{
  "sku": "DNCSETXL7500X001H",
  "price_1y": 1200.00,
  "price_2y": 2160.00,
  "price_3y": null,
  "grace_days": 30,
  "grace_source": "global",
  "terms_url": "https://dinoco.in.th/extension-terms-crashbar",
  "extension_enabled": true,
  "available_tiers": [1, 2],
  "updated_by_name": "บอส",
  "updated_at": "2026-05-XX 14:32:11",
  "currency": "THB",
  "vat_inclusive": false,
  "vat_note": "ราคา non-VAT (บัญชีบุคคล) — ไม่มีใบกำกับภาษี"
}
```

**Response 404**: SKU ไม่มีใน wp_dinoco_products
**Response 503**: schema migration not run

### 4.3 `GET /dinoco-sn/v1/ext-pricing/list` — Bulk overview (SN Manager Tab)

**Auth**: `manage_options` OR `dinoco_sn_perm_admin`
**Query params**:
- `status` = `enabled|disabled|missing|all` (default `all`)
  - `enabled` = WHERE `sn_ext_price_1y IS NOT NULL`
  - `disabled` = WHERE all 3 prices IS NULL AND audit shows admin explicitly opted-out (sn_ext_updated_at IS NOT NULL)
  - `missing` = WHERE all 3 prices IS NULL AND `sn_ext_updated_at IS NULL` (never touched — needs admin attention)
- `sn_attach_level` = `none|set|child|leaf|all` (filter SKUs with plate config)
- `q` = LIKE search on SKU + product title (esc_like)
- `limit` = 1..200 (default 50)
- `offset` = pagination

**Response 200**:
```json
{
  "items": [
    {
      "sku": "DNCSETXL7500X001H",
      "title": "Crash Bar Pro Rally Honda XL750",
      "image_url": "https://...",
      "retail_price": 8800.00,
      "sn_attach_level": "child",
      "sn_required": 1,
      "ext_pricing": {
        "price_1y": 1200.00,
        "price_2y": 2160.00,
        "price_3y": null,
        "available_tiers": [1, 2]
      },
      "extension_enabled": true,
      "ext_revenue_30d_thb": 45600.00,
      "ext_orders_30d_count": 38,
      "updated_by_name": "บอส",
      "updated_at": "2026-05-XX 14:32:11"
    }
  ],
  "summary": {
    "total_skus": 487,
    "enabled_count": 142,
    "missing_count": 298,
    "disabled_count": 47,
    "total_revenue_30d_thb": 287400.00,
    "total_orders_30d_count": 213
  },
  "meta": { "limit": 50, "offset": 0, "total": 487 }
}
```

### 4.4 `POST /dinoco-stock/v1/product/sn-ext-pricing/clear` — Disable extension for SKU (set all NULL)

**Auth + idempotency**: same as 4.1
**Body**: `{ "sku": "DNCXXX" }`
**Effect**: UPDATE 3 prices + grace_days + terms_url = NULL · audit row event_type = `extension_pricing_disabled` · cache invalidate
**UX**: separate endpoint (not "POST with all NULL") so audit trail clearly logs intentional disable vs accidental empty save

### 4.5 `POST /dinoco-stock/v1/product/sn-ext-pricing/bulk-set` — DEFERRED to Phase 5

CSV-based bulk import. Out of W12 scope (admin can edit ~50 SKUs/day via individual modal — bulk save only useful at >200 SKUs)

### 4.6 `GET /dinoco-stock/v1/product/sn-ext-pricing/audit/{sku}` — View edit history

**Auth**: `manage_options`
**Response**: rows from `wp_dinoco_sn_audit` WHERE event_type IN (`extension_pricing_changed`, `extension_pricing_disabled`) AND target_sku = ? ORDER BY created_at DESC LIMIT 50
**Use case**: investigate price discrepancy, prove timing for refund disputes

### 4.7 Public LIFF read endpoint — `GET /dinoco-sn/v1/extension/pricing/{sku}` (already exists per 08-f8 doc)

W12 = make sure this endpoint reads NEW columns + responds 404 if all NULL · masks `updated_by_name` (admin internal only)

---

## 5. UI Mockup

### 5.1 Inventory Edit Product modal — NEW section

Inserted **between** "Tier Pricing" section + "SN Plate Configuration" section (V.46.2):

```
┌── 🛡 ต่อประกัน (Extension Pricing) ─────────────────────────┐
│                                                             │
│  ☐ เปิดให้ลูกค้าต่อประกัน SKU นี้                            │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  💵 ราคาต่อประกัน (THB · non-VAT บัญชีบุคคล)                │
│                                                             │
│  ┌──────────────────────┬──────────────────────┐            │
│  │ 1 ปี                 │ ฿ [______1,200_____] │            │
│  ├──────────────────────┼──────────────────────┤            │
│  │ 2 ปี                 │ ฿ [______2,160_____] │            │
│  ├──────────────────────┼──────────────────────┤            │
│  │ 3 ปี (ไม่เปิด)        │ ฿ [_____________  ] │ ← ว่าง = ไม่แสดง │
│  └──────────────────────┴──────────────────────┘            │
│                                                             │
│  💡 ปล่อยช่องว่าง = ไม่แสดง option นั้นใน LIFF              │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ⚙️ ตั้งค่าเพิ่มเติม (optional)                              │
│                                                             │
│  Grace period (วัน):  [____] (ปล่อยว่าง = ใช้ global 30)    │
│                                                             │
│  T&C URL:  [https://________________________________]       │
│  └─ ลิงก์ T&C เฉพาะ SKU นี้ (เช่น "รวมเปลี่ยนกระจกหน้า/หลัง") │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📊 30 วันที่ผ่านมา                                          │
│  └─ ขาย: 38 รายการ · รายได้: ฿45,600                        │
│                                                             │
│  📝 แก้ไขล่าสุด: บอส · 12 พ.ค. 2569 14:32                    │
│  [📜 ดูประวัติการแก้ไข]                                      │
│                                                             │
│  ┌─ ❌ ปิดการขายต่อประกัน SKU นี้ (ลบราคาทั้งหมด) ─┐         │
│  │ (admin คลิก → confirm dialog → set 3 prices NULL) │       │
│  └────────────────────────────────────────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**State machine** (toggle `เปิดให้ลูกค้าต่อประกัน`):
- ☐ unchecked → 3 price inputs disabled + greyed + value preserved (so admin can re-check without retyping)
- ☑ checked → at least 1 price input must have value > 0 to save (frontend validation)
- Auto-collapse via `<details>` (default expanded if any price set, collapsed if all NULL — mirror V.46.2 SN section pattern)

**Validation messages (Thai)**:
- "ราคาต้องไม่ติดลบ"
- "ราคาเกิน ฿50,000 — ตรวจสอบอีกครั้ง"
- "Grace period ต้องอยู่ระหว่าง 1-365 วัน"
- "T&C URL ต้องเริ่มด้วย https://"

### 5.2 SN Manager — NEW Tab "💰 Extension Pricing"

Sidebar position: เพิ่มหลัง Tab "📊 Marketplace" (Tab 11)

```
┌─ 💰 Extension Pricing — ภาพรวมราคาต่อประกัน per SKU ─────────────────┐
│                                                                       │
│  📊 สรุป                                                              │
│  ┌─────────────┬──────────────┬─────────────┬──────────────┐          │
│  │ SKUs ทั้งหมด │ เปิดต่อประกัน│ ยังไม่ตั้ง   │ ปิดถาวร      │          │
│  │    487      │    142 ✅    │   298 ⚠️    │    47 🚫     │          │
│  └─────────────┴──────────────┴─────────────┴──────────────┘          │
│                                                                       │
│  💵 รายได้ extension 30 วัน: ฿287,400 · 213 รายการ                    │
│                                                                       │
│  ─────────────────────────────────────────────────────────────────    │
│                                                                       │
│  Filter:  [ทั้งหมด ▼] [ระดับเพลท: ทั้งหมด ▼]  Search: [___________] 🔍 │
│                                                                       │
│  Tabs: 🟢 เปิดแล้ว (142)  ⚠️ ยังไม่ตั้ง (298)  🚫 ปิด (47)            │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ SKU              │ Title           │ Retail │ 1y/2y/3y │ Action │  │
│  ├─────────────────────────────────────────────────────────────────┤  │
│  │ DNCSETXL7500...  │ Crash Bar Pro   │ ฿8,800 │ 1.2k/2.16k/—│ ✏️ │  │
│  │ DNC4537SETGND... │ กันล้ม Pro 4537  │ ฿12,500│ 1.5k/2.8k/3.9k│✏️│  │
│  │ DNCNX500001IRO...│ Iron child only │ ฿2,500 │ ⚠️ ยังไม่ตั้ง│✏️ │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  Pagination: 1 2 3 ... 10  · 50/page                                  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

**Click ✏️** → deep-link `[dinoco_admin_inventory]?focus=<sku>&tab=extension` → opens Inventory Edit modal scrolled to ต่อประกัน section (NO duplicate write path)

**Mobile**: Tab simplified to card list (1 SKU per card)

### 5.3 Customer LIFF preview (for context — not part of W12 build)

Customer flow lives in W13. W12 just needs to populate data so W13 has something to show:

```
┌─ ต่อประกัน — ชุดกันล้ม Honda XL750 ──────┐
│                                           │
│ 📅 ปัจจุบันหมดประกัน: 4 พ.ค. 2569         │
│                                           │
│ เลือกระยะเวลา:                            │
│  ◉ 1 ปี · ฿1,200                          │
│  ◯ 2 ปี · ฿2,160                          │
│  (3 ปีไม่เปิดให้สำหรับสินค้านี้)            │
│                                           │
│ 📋 เงื่อนไข: [ดู T&C เพิ่มเติม]            │
│                                           │
│ [ดำเนินการชำระเงิน ▶]                     │
└───────────────────────────────────────────┘
```

---

## 6. Edge cases ที่ต้องครอบ

| Case | Behavior | Test |
|---|---|---|
| **Hierarchy / DD-3 shared child** — leaf SKU `DNCGNDPRO5500` ถูกใช้ใน 9 SETs (Happy Tech Pro). Customer ต่อประกัน "ของชุด" — pricing อ้างอิง SKU ไหน? | ลูกค้าเปิด LIFF /warranty/extend?sn=... → backend lookup `sn_pool.top_set_sku` (SET ที่ลูกค้าซื้อจริง) → query pricing ของ **top_set_sku** ไม่ใช่ leaf. shared leaf ไม่กระทบ — pricing per SKU = per registered top SET | unit test: 1 leaf, 9 SETs, 9 different prices possible — verify lookup uses top_set_sku |
| **discontinued SKU** — admin ตั้งราคา ext แล้ว ทีหลัง remove SKU จาก catalog | LIFF query ส่ง 404 + "สินค้านี้ไม่มีในระบบแล้ว". Existing extension orders ไม่กระทบ (warranty_until ตั้งไว้แล้ว). Admin Inventory delete → cascade `dinoco_sn_ext_pricing_changed` action with audit `event_type=sku_removed_with_extension` | regression: delete SKU with active ext_price — verify audit row + LIFF 404 |
| **Cart-time-lock** — customer เริ่ม checkout → admin แก้ราคา ระหว่างนั้น | Snapshot price ตอน "เริ่ม checkout" ลง `wp_dinoco_sn_warranty_extensions.amount` (immutable). NEW field `price_snapshot_at` timestamp. ถ้า admin เพิ่มราคาก่อน customer อัพสลิป → customer ยังจ่ายราคาเดิม (snapshot wins). ป้องกันด้วย idempotency hash includes `price_snapshot` | acceptance: race condition test — admin save price during customer checkout → snapshot wins |
| **Negative scenario — admin set ฿0** | Allowed (boss may want free promotion). LIFF shows "฿0 — ฟรี!" + customer ยังต้องกด "ยืนยัน" + slip step ข้าม (skip Slip2Go for ฿0). Audit captures ฿0 explicitly | unit test: price=0 → ext_enabled=true |
| **Boss typo ฿120,000 (intended ฿1,200)** | Frontend validation: warn ถ้า > ฿50,000 → confirm dialog "ยืนยันราคา ฿120,000 บาท?" + typed-confirm "ยืนยัน". Backend cap = 50000 → 422 invalid_price | acceptance: 50001 → 422 |
| **Concurrent edit — 2 admins** | Idempotency hash + `sn_ext_updated_at` timestamp displayed in modal. ถ้า client เปิดหน้านาน → save → backend ตรวจ stale (received_updated_at < db_updated_at) → 409 `stale_write` + reload prompt | regression: 2 admin tabs, 2 save → 2nd one 409 |
| **Schema migration not yet run** | All UI gates behind `dinoco_sn_ext_pricing_columns_exist()` → red banner "⚠️ ระบบยัง migrate ไม่เสร็จ — ติดต่อ dev team" + section disabled. REST POST → 503 `schema_not_migrated` | smoke test: pre-ALTER environment |
| **Customer extension already active — ห้ามต่อซ้อน** | LIFF backend check `warranty_until > NOW + 30 days` → block "ประกันยังไม่ใกล้หมด ต่อได้เมื่อเหลือ ≤ 30 วัน" (Q19 grace). NOT W12 concern (W13 issue) | spec doc handoff to W13 |
| **Refund flow** (Q20) | When admin executes manual refund → Service Center "Manual Refund" button → atomic UPDATE warranty_until back + insert refund row. Pricing UI ไม่กระทบ — refund decoupled | spec doc handoff to W13/W14 |
| **TerminPay/SCB/etc** (Q7 deferred) | Form ไม่มีช่อง payment method — Slip2Go is the only path. Future tier (Phase 6+) ค่อย add field | N/A in W12 |
| **VAT field accidentally added** | ❌ binding constraint — code review must reject any VAT/tax-invoice field. Test: schema must NOT have `vat_amount`/`tax_invoice_no` columns | drift detector assertion |

---

## 7. Acceptance Criteria

### 7.1 Functional (must pass before W13 starts)

- [ ] **AC-1** Admin opens Inventory Edit Product modal → ต่อประกัน section visible (collapsed by default if all NULL, expanded if any set)
- [ ] **AC-2** Admin sets `price_1y=1200, price_2y=2160, price_3y=NULL` → save → REST 200 + DB row updated + cache invalidated
- [ ] **AC-3** Admin re-opens modal → values persist + audit shows "บอส · 12 พ.ค. 2569 14:32"
- [ ] **AC-4** Admin clicks ❌ "ปิดการขายต่อประกัน" → confirm modal → all 3 prices = NULL + audit event_type = `extension_pricing_disabled`
- [ ] **AC-5** Customer LIFF `GET /dinoco-sn/v1/extension/pricing/{sku}` → 200 with available_tiers=[1,2] + grace=30
- [ ] **AC-6** Customer LIFF for SKU with all NULL → 404 `extension_not_offered`
- [ ] **AC-7** SN Manager Tab "💰 Extension Pricing" → summary card shows correct counts (enabled/missing/disabled)
- [ ] **AC-8** SN Manager Tab → click ✏️ on row → deep-link opens Inventory modal at correct SKU + scrolled to ต่อประกัน section
- [ ] **AC-9** Idempotency-Key header replay → second identical save returns cached response + audit row count unchanged (Round 30+ pattern)
- [ ] **AC-10** Idempotency conflict — different price body with same key → 409 `idempotency_conflict`
- [ ] **AC-11** Schema not migrated → REST 503 + UI shows red banner "schema migration not run"

### 7.2 Security & Compliance

- [ ] **AC-12** Non-admin user → REST 403 (capability gate)
- [ ] **AC-13** Missing nonce → REST 403
- [ ] **AC-14** SQL injection attempt in `terms_url` → sanitized via `esc_url_raw` + scheme check
- [ ] **AC-15** Audit row written every save (event_type + before/after + user_id + IP)
- [ ] **AC-16** No VAT field anywhere (code review + drift detector enforces)
- [ ] **AC-17** No tax invoice generation triggered (regression: search code for `'tax_invoice'` returns no NEW occurrences in W12 scope)

### 7.3 Performance

- [ ] **AC-18** Single SKU save < 200ms p95 (small write + cache invalidate)
- [ ] **AC-19** SN Manager list endpoint with 500 SKUs < 1s p95 (single SQL with index)
- [ ] **AC-20** LIFF read endpoint < 50ms p95 with cache hit (5min TTL)

### 7.4 PHPUnit cases proposed (~15 tests)

**File**: `tests/helpers/SnExtensionPricingTest.php`

| # | Case | Type |
|---|---|---|
| 1 | `dinoco_sn_ext_pricing_columns_exist()` returns true post-ALTER | unit |
| 2 | `dinoco_sn_ext_pricing_columns_exist()` returns false pre-ALTER (mock) | unit |
| 3 | Save valid 3 prices → DB row updated correctly | integration |
| 4 | Save with 1 price NULL → only 2 tiers in available_tiers response | integration |
| 5 | Save with all NULL → extension_enabled=false | integration |
| 6 | Validation: price > 50000 → 422 | unit |
| 7 | Validation: price negative → 422 | unit |
| 8 | Validation: grace_days > 365 → 422 | unit |
| 9 | Validation: invalid terms_url scheme → 422 | unit |
| 10 | Idempotency replay → cached response | integration |
| 11 | Idempotency conflict (different body, same key) → 409 | integration |
| 12 | Audit row written on every save | integration |
| 13 | Cache invalidation fires after save (mock cache) | unit |
| 14 | DD-3 shared leaf — top_set_sku lookup wins for hierarchy | integration |
| 15 | Concurrent edit — stale_write detection → 409 | integration |

### 7.5 Drift detectors (Jest) — 1 NEW file

**File**: `tests/jest/sn-extension-pricing-drift.test.js`

Assertions (~12):
- [ ] Inventory snippet contains "ต่อประกัน" + "sn_ext_price_1y" string literals
- [ ] SN Manager snippet has Tab "Extension Pricing" entry
- [ ] REST endpoint `/product/sn-ext-pricing` registered (regex)
- [ ] Idempotency wrapper applied at endpoint
- [ ] No `vat_amount` / `tax_invoice` field added to wp_dinoco_products schema (negative assertion)
- [ ] Audit event_type constants `extension_pricing_changed` + `extension_pricing_disabled` present
- [ ] Lazy ALTER guard helper `dinoco_sn_ext_pricing_columns_exist` defined
- [ ] Cache group `dinoco_ext_pricing` referenced in invalidation hook
- [ ] LIFF read endpoint `/extension/pricing/{sku}` exists in SN REST snippet
- [ ] No raw `confirm()` in section JS (uses `dinocoModal.confirm`)
- [ ] No inline `onclick=` (UX-H3 compliant — event delegation only)
- [ ] Buddhist year toggle `dinoco_sn_format_thai_date` used for `updated_at` display

---

## 8. Effort breakdown

| Sub-task | Hours | Owner |
|---|---|---|
| **Schema** ALTER + lazy guard helper + dbDelta gate | 1.5 | dev |
| **REST POST `/sn-ext-pricing`** + validation + idempotency + audit + cache invalidate | 4 | dev |
| **REST GET `/sn-ext-pricing/{sku}`** + caching + masking | 1.5 | dev |
| **REST `/sn-ext-pricing/clear`** + audit | 1 | dev |
| **REST `/sn-ext-pricing/audit/{sku}`** + history viewer | 1 | dev |
| **REST `/dinoco-sn/v1/ext-pricing/list`** + filter + summary aggregates | 2 | dev |
| **Inventory Edit Modal section UI** (HTML + JS state mgmt + jQuery wiring + validation) | 5 | frontend |
| **SN Manager NEW Tab "💰 Extension Pricing"** + filter + table + deep-link | 4 | frontend |
| **Cache layer** (group register + invalidation hooks + transient compat) | 1 | dev |
| **PHPUnit ~15 cases** | 2.5 | QA |
| **Jest drift detector** (12 assertions) | 1 | QA |
| **Customer LIFF read integration test** (handoff to W13) | 0.5 | QA |
| **Boss UAT pass** (boss seeds 5-10 SKUs himself, verify happy path) | 1 | boss + dev |
| **Doc update** (CLAUDE.md + 08-f8 doc + 34-backlog tracker) | 1 | dev |
| **Buffer** for surprise issues + code review iteration | 3 | — |
| **TOTAL** | **~30h** | |

→ ลด margin จาก 50h เดิม (08-f8 doc) เพราะ scope ลดจาก legal + VAT + tax invoice (boss 2026-05-15 #1)

→ Phase 4 W12 (1 wk) มี slot ว่างหลัง F#15 cancel (Q22) → ใช้สำหรับ section นี้ทั้งสัปดาห์

---

## 9. Open questions for boss (final 5)

1. **Pricing cap** — ผม propose ฿50,000 ต่อ tier. ถ้าต้องการเปลี่ยน (เช่น ฿100,000 สำหรับ premium SKU) บอกก่อน implement
2. **T&C URL ต่อ SKU** — บอสจะใช้จริงไหม? ถ้าไม่ใช้เลย → ตัด field นี้ออก (ลด 1 column ใน schema + 1 input ใน UI)
3. **Per-SKU grace_days override** — ใช้จริงไหม? หรือทุก SKU ใช้ global 30 วัน? ถ้าใช้ global เพียงอย่างเดียว → ตัด column ออก
4. **Bulk CSV import** — defer ไป Phase 5 หรือเอาเลย Phase 4? ถ้าจะ seed 200+ SKU ทีเดียวก็ควรทำ
5. **Audit history limit** — ปัจจุบัน LIMIT 50 เพียงพอไหม? หรืออยากดู full history (1 SKU อาจมี 100+ edits ในรอบ 6 เดือน)?

→ default ถ้าบอสไม่ตอบ: cap = ฿50K · ตัด terms_url + grace_days override (ทำให้ scope เล็กลง 4h) · defer bulk · keep LIMIT 50

---

## 10. Files to touch (anticipated)

| File | Change | LOC est. |
|---|---|---|
| `[Admin System] DINOCO Global Inventory Database` | NEW section in Edit Product modal + JS handlers + lazy ALTER helper + 5 NEW REST endpoints | ~600 |
| `[Admin System] DINOCO Production SN Manager` | NEW Tab "💰 Extension Pricing" + table + filter + deep-link logic | ~400 |
| `[System] DINOCO SN REST API` | NEW endpoint `/dinoco-sn/v1/ext-pricing/list` + LIFF read enrichment | ~120 |
| `[B2B] Snippet 1` | Helper `dinoco_sn_get_extension_price()` (already stub V.6.6) — wire to read DB | ~20 |
| `tests/helpers/SnExtensionPricingTest.php` | NEW — 15 cases | ~250 |
| `tests/jest/sn-extension-pricing-drift.test.js` | NEW — 12 assertions | ~80 |
| `CLAUDE.md` | Append "Phase 4 W12 Extension Pricing" section + REST endpoint list update | ~30 |
| `docs/sn-system/34-phase6-backlog-tracker.md` | Mark "Phase 4 W12 admin UI" as DONE | ~5 |
| `docs/sn-system/08-f8-extension-marketplace-q6-q8-q7-q20-replan.md` | Cross-link to this spec | ~10 |

---

## 11. Rollout plan

### 11.1 Pre-flight checks

- [ ] Schema ALTER tested on staging (snapshot first)
- [ ] Inventory snippet syncs successfully via GitHub Webhook (DB_ID match)
- [ ] PHPUnit + Jest green on PR
- [ ] Boss seeds 1 SKU manually to verify happy path

### 11.2 Deploy sequence (atomic)

1. Push commit → GitHub Webhook → snippets sync → schema ALTER auto-runs via `admin_init` hook (lazy)
2. Verify `SHOW COLUMNS FROM wp_dinoco_products LIKE 'sn_ext_price_1y'` returns row
3. Boss opens any Inventory product → ต่อประกัน section visible
4. Save 1 SKU → verify REST 200 + audit row
5. Open SN Manager Tab → verify summary updates
6. Document in `.second-brain/log.md`

### 11.3 Rollback strategy

- ❌ DROP COLUMNS not needed — UI section gates behind lazy guard, can remain unused
- ✅ JS feature flag `dinoco_sn_ext_pricing_ui_enabled` (wp_option, default 1) → flip 0 to hide section without revert
- ✅ Revert commit (snippets ระบบ rollback ผ่าน WP Code Snippets version history)

### 11.4 Post-deploy validation

- [ ] Boss seeds top 20 best-seller SKUs with prices (1-2 hours work)
- [ ] Customer LIFF can fetch pricing for those 20 SKUs
- [ ] No alerts in Sentry / Telegram for 24h
- [ ] Hand off to W13 customer flow

---

## 12. Cross-references

- **Boss decisions canonical**: `docs/sn-system/07-boss-decisions-log.md` (Q6/Q7/Q8/Q20) + `docs/sn-system/35-boss-final-decisions-2026-05-15.md` (#1 non-VAT)
- **F#8 design parent**: `docs/sn-system/08-f8-extension-marketplace-q6-q8-q7-q20-replan.md`
- **Refund flow**: `docs/sn-system/15-q20-manual-refund-sop.md` (downstream Service Center handler)
- **Role gates**: Q15 Role Manager `[Admin System] DINOCO User Role Manager` V.0.5 (capability `dinoco_sn_perm_admin`)
- **Inventory current architecture**: `[Admin System] DINOCO Global Inventory Database` V.46.2 (Edit Product modal + REST namespace `dinoco-stock/v1`)
- **SN Manager**: `[Admin System] DINOCO Production SN Manager` V.0.60+
- **Cache pattern**: `dinoco_cache_flush_group()` helper Snippet 15 V.8.5 + Idempotency-Key Round 30+ pattern `docs/audit/IDEMPOTENCY-COVERAGE.md`

---

_Drafted 2026-05-15 by tech-lead orchestrator after parallel feature-architect timeouts. Boss inputs locked at 2026-05-15 final-decisions document. Ready to dev when Phase 4 W12 starts._
