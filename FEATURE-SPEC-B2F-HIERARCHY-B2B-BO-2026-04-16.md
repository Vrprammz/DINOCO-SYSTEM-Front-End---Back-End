# Feature Spec: B2F Hierarchy Fix + B2B Backorder System

**Version**: 1.0
**Date**: 2026-04-16
**Author**: Feature Architect
**Status**: Draft — Ready for review
**Related**: [[3-Level SKU Hierarchy]] [[B2F PO Flow]] [[B2B Backorder]] [[Stock Overselling]]

---

## Executive Summary

รายงานฉบับนี้ครอบคลุม 3 ประเด็นใหญ่ที่ deep review แล้วในโค้ดจริง:

1. **Issue #1 — B2F PO Hierarchy Rendering**: `poi_parent_sku` เก็บ **top-level SET** เท่านั้น (ข้าม intermediate child) → Flex card, PO Image, และ Maker notification แสดงแค่ 2-level (SET → leaves) ขาดชั้น "ลูก" → user งงว่าสั่งอะไร
2. **Issue #2 — B2B Stock Overselling**: ระบบ Backorder มีอยู่แล้วแต่ relies on "OOS Memory" flag (not real-time qty check) → agent กดยืนยันได้เลยแม้ sku หมด + ไม่มีการป้องกัน enumeration attack + ไม่มี partial-fulfill
3. **Issue #3 — LIFF B2F SET Detail ขาดลูก**: `b2f_inject_virtual_sets_v919` inject เฉพาะ top-level SET → intermediate sub-SET หาย → UI loop ไม่เจอ → แสดงแค่ child ที่ Maker register ตรงๆ

**Severity & Order**:
- 🔴 **P0 Quick Fix** → Issue #3 (inject intermediate virtual SETs) — 2-4 ชม.
- 🟡 **P1 Medium** → Issue #1 (3-level rendering in Flex + PO Image) — 1-2 วัน
- 🟠 **P2 Large** → Issue #2 (BO system redesign + backend stock check) — 3-5 วัน

---

## 1. Problem & Goal

### Issue #1 — B2F PO Hierarchy Rendering

**ปัญหา**:
- `[B2F] Snippet 2: REST API` บรรทัด 1643-1734 (`create-po`) ใช้ `dinoco_get_leaf_skus($sku)` → resolve ลงไปถึง **leaf ทันที** ข้ามชั้น intermediate child
- `parent_sku` ที่เซฟลง `poi_parent_sku` = **top-level SET เสมอ** (บรรทัด 1709, 1717)
- `b2f_group_items_by_set()` (`[B2F] Snippet 1` บรรทัด 496) อ่าน `poi_parent_sku` → ได้แค่ 2 ระดับ (top SET → leaves flat)
- `b2f_build_flex_new_po()` (Snippet 1 บรรทัด 858) + `b2f_build_flex_po_created()` (บรรทัด 949) + PO Image (`Snippet 10` บรรทัด 298-314) ทั้งหมดสืบทอด bug นี้

**สิ่งที่ Maker เห็นตอนนี้** (screenshot 1):
```
■ ADV160 — 2ชุด
   DNCADV002-L  x2  @1,700
   DNCADV002-R  x2  @1,700
   DNCFORZA35001-R  x1  @1,775    ← เดี่ยว แต่ตั้งชื่อ "ADV160" ทำไม?
   DNCCB500X001-R  x1  @1,620
   DNCCB500X001B-L x1  @1,620
```

**สิ่งที่ Maker ควรเห็น**:
```
📦 DNCSETADV160 — ชุดครบ ADV160 (x2 ชุด, ฿6,800)
   └─ Crash Bar ADV160 (DNCADV002)
      ├─ DNCADV002-L  x2  @1,700
      └─ DNCADV002-R  x2  @1,700

📦 DNCFORZA35001 — Crash Bar FORZA350 (x1, ฿1,775)
   └─ DNCFORZA35001-R  x1  @1,775

📦 DNCSETCB500X — ชุดครบ CB500X (x1 ชุด, ฿3,240)
   └─ Crash Bar CB500X (DNCCB500X001)
      └─ DNCCB500X001-R  x1  @1,620
   └─ Top Rack CB500X (DNCCB500X001B)
      └─ DNCCB500X001B-L  x1  @1,620
```

**เป้าหมาย**:
- Maker, Admin, และ PO Image ทุกจุดแสดง hierarchy ครบ 3 ระดับ (SET → child → grandchild)
- Backward compat กับ PO เก่า (ไม่มี intermediate metadata) → fallback 2-level
- DD-3 shared child: ถ้า leaf ใช้ร่วม 2 SET → แสดงใต้ทุก SET ตาม breakdown

**Success metric**:
- PO ที่มี 3-level hierarchy → Flex + PO Image render 3 ชั้นถูกต้อง 100%
- Maker confirm rate (ยืนยันทันภายใน 6 ชม.) เพิ่มขึ้น ≥10% (เพราะเข้าใจง่าย)
- ข้อร้องเรียน "ไม่เข้าใจว่าสั่งอะไร" = 0

---

### Issue #2 — B2B Stock Overselling & Backorder

**สถานะปัจจุบัน** (จาก `[B2B] Snippet 2` บรรทัด 3628-3691):
- ตัดสต็อกตอน `awaiting_confirm` (หลัง admin กดยืนยันสต็อก) **ไม่ใช่ตอน place-order**
- Walk-in → skip stock check (`_b2b_is_walkin` → `$allow_neg=true`) stock ติดลบได้
- ตัวแทนสั่ง → ระบบเข้า `checking_stock` → admin ต้องกดยืนยัน → ถึงตัดสต็อก
- มี `backorder` status + OOS memory flag (`b2b_mark_product_oos`) — ถ้า SKU ติด OOS flag, action `confirm_order` จะไม่ไป `checking_stock` แต่เข้า `backorder` โดยตรง (บรรทัด 658-671)
- **ช่องโหว่**: OOS flag set ได้เฉพาะเมื่อ admin กด "หมด" (stock_oos action) — ระบบไม่ auto-detect "ของจะไม่พอ" ก่อนถึง admin

**Scenario ที่เป็นปัญหา**:
1. ตัวแทน A สั่ง SKU X qty=10 → LIFF ส่งออเดอร์ → status=`draft`
2. กลุ่ม LINE ได้ Flex "ตรวจสอบ" → กดยืนยัน → status=`checking_stock`
3. Admin ยังไม่ทันเปิดดู ตัวแทน B สั่ง SKU X qty=10 → `checking_stock` อีกใบ
4. จริงๆ สต็อก = 8 → admin กดยืนยันทั้งคู่ → `awaiting_confirm` → `dinoco_stock_subtract` cap 0 → A ได้ 8, B ได้ 0 (หรือติดลบถ้าเป็น walk-in)
5. B ไม่รู้ว่า stock ไม่พอ — ออเดอร์ผ่านไปถึง shipping ก็ส่งไม่ได้ → drama

**ข้อกังวล Security**:
- **Enumeration**: ถ้า error message ระบุ "สต็อกเหลือ 8" → user สั่ง 10/20/40/80 แบบ binary → รู้ inventory
- **Abuse**: สั่ง qty สูงซ้ำๆ เพื่อทำให้ระบบ deplete

**เป้าหมาย**:
- ไม่ reveal stock count ต่อตัวแทนเลย (0 bit of info leakage)
- รับออเดอร์ได้เสมอ (partial-fulfill + BO ที่เหลือ) ลดแรงเสียดทาน
- Admin มี tool จัดการ BO อย่างมีประสิทธิภาพ
- ป้องกัน qty abuse (hard cap + rate limit)

**Success metric**:
- 0 ครั้งที่ error message เผยตัวเลขสต็อก
- BO resolve time ≤48 ชม. เฉลี่ย
- Admin reject rate BO ≤5%

---

### Issue #3 — LIFF B2F SET Detail ขาดชั้นลูก

**ปัญหา** (จาก `[B2F] Snippet 8` บรรทัด 1593-1705):
- `renderSetDetailItems()` ใช้ `skuRelations[parentSkuU]` forward lookup ได้ child SKUs → แต่ `productBySku[childSku]` ต้องมาจาก `products[]` array
- `products[]` = `res.data` จาก `/maker-products?include_virtual=1`
- `b2f_inject_virtual_sets_v919()` (`[B2F] Snippet 2` บรรทัด 4858-4987) inject **เฉพาะ top-level SETs** (ที่ไม่มี parent ใน `child_to_parents`)
- Intermediate sub-SETs (เช่น `DNCNX500001B` ที่เป็น parent ของ L/R แต่เป็น child ของ `DNCSETNX500E002`) **ไม่ถูก inject** ถ้า Maker ไม่ register เอง

**ผลลัพธ์**: SET Detail เห็น "ลูก 1 + หลาน 2" แทน "ลูก 2 + หลาน 4"

**เป้าหมาย**:
- Inject ทุก intermediate node ใน hierarchy (parent ที่ไม่ใช่ top-level) ที่มี leaf registered อย่างน้อย 1 ตัว
- Admin Makers tab (Snippet 5) ก็ต้องเห็นครบเพื่อ manage product tree
- Cart DD-7 expand ไม่กระทบ (ใช้ backend `dinoco_get_leaf_skus()` ที่ resolve ถึง leaf อยู่แล้ว)

**Success metric**:
- SET Detail render children + grandchildren ครบ 100% (test case: `DNCSETNX500E002` → 2 ลูก + 4 หลาน)
- 0 case ที่ cart expand (4 leaves) แต่ UI preview แสดง ≠ 4 leaves

---

## 2. User Flows

### 2.1 B2F Maker Receives PO (Issue #1)

**Happy Path (3-level hierarchy)**:
```
Admin LIFF E-Catalog → สั่ง DNCSETNX500E002 x1 (SET 3 ระดับ)
  ↓ /create-po
Backend expand: dinoco_get_leaf_skus(DNCSETNX500E002) → [L1, L2, L3, L4]
  ↓ build repeater with poi_parent_sku, poi_parent_name, poi_parent_breakdown
  ↓ NEW: save poi_parent_path = "DNCSETNX500E002/DNCNX500001B" (for L1, L2)
  ↓ NEW: save poi_parent_path = "DNCSETNX500E002/DNCNX500E002B" (for L3, L4)
  ↓ FSM draft→submitted
Maker LINE group ได้ Flex "ใบสั่งซื้อใหม่"
  ↓
├─ 📦 DNCSETNX500E002 — ชุด NX500 (x1, ฿XXXX)
│     └─ Crash Bar บน (DNCNX500001B)
│        ├─ L1 x1 @Y
│        └─ L2 x1 @Y
│     └─ Crash Bar ล่าง (DNCNX500E002B)
│        ├─ L3 x1 @Y
│        └─ L4 x1 @Y
  ↓ กด "✅ ยืนยัน + เลือกวันส่ง"
```

**Error Paths**:
- **Flex ใหญ่เกิน 10KB (LINE limit)**: ถ้า SET มี children >20 → fallback แสดงแบบสรุป (SET header + "N ลูก + M หลาน") + ลิงก์ LIFF "ดูรายละเอียด"
- **PO เก่า (ไม่มี poi_parent_path)**: fallback ใช้ `poi_parent_sku` เดิม (2-level grouping)
- **Shared leaf DD-3**: อ่านจาก `poi_parent_breakdown` → แสดงใต้ทุก SET ตาม breakdown qty

**Edge Cases**:
- SET ไม่มี grandchildren (just 2-level) → แสดง SET → leaves ตามปกติ (ไม่แสดงชั้นว่าง)
- SET มี direct leaf + leaf ใต้ child (mixed) → แสดง SET → [direct leaf, child → grandchildren]
- Intermediate child name ยาว >25 chars → truncate + ellipsis

### 2.2 B2B Agent Orders with Insufficient Stock (Issue #2)

**Proposed Flow (Option E — Hybrid Opaque BO)**:
```
Agent LIFF → สั่ง SKU X qty=10 (stock จริง = 8)
  ↓ POST /place-order
Backend check stock (NEW): 
  ├─ qty > max_per_sku_per_order (100)? → reject "จำนวนเกินที่สั่งได้ต่อครั้ง"
  ├─ qty_today_per_sku > max_daily (500)? → rate limit "สั่งวันนี้เกินโควต้า"
  └─ else → accept ตามปกติ (ไม่เช็ค stock count)
  ↓ สถานะเดิม draft → checking_stock
Admin LINE group ได้ Flex "เช็คสต็อก" (เหมือนเดิม)
  ↓ NEW: Flex แสดง stock_delta preview ให้ admin
        "SKU X: สั่ง 10 | สต็อก 8 | ต่าง -2 (BO)"
Admin กดปุ่มใหม่ "📦 ยืนยัน + Split BO" (ถ้าสต็อกไม่พอ)
  ↓
Backend:
  ├─ สร้าง sub-order #BO-parent (status=backorder) qty=2
  ├─ ตัด parent order qty=8 → awaiting_confirm (ตัดสต็อก 8)
  └─ link: parent._backorder_child = BO-child.id
  ↓
Agent LINE group ได้ Flex รวม:
  "✅ ออเดอร์ยืนยันแล้ว (จัดส่ง 8 ชิ้น)
   📦 สินค้าบางรายการจะจัดส่งภายหลัง (ETA 3-5 วัน)
   🔗 ดูสถานะ: [LIFF ticket view]"
  (ไม่ระบุว่าเหลือ 8 — ระบุแค่ว่า "จะจัดส่งภายหลัง")
```

**Alternative Flow (Full Stock)**:
- Admin กด "✅ ยืนยันสต็อก" → ปกติ (stock พอ) → `awaiting_confirm`

**Error Paths**:
- **Full OOS (stock=0)**: Admin กด "❌ หมด" → สถานะ `backorder` ทั้งออเดอร์ (flow เดิม)
- **Partial fail**: parent ตัดสต็อกได้ 8 แต่ 2 item อื่นหมด → Admin ต้อง split หลายรอบ (phase 2)
- **Walk-in**: skip stock check (เดิม) — no BO flow
- **Rate-limit hit**: message "สั่งวันนี้เกินโควต้า (ติดต่อทีมงาน)" — ไม่ระบุ delta

**Edge Cases**:
- Agent แก้ order (edit_ticket) → reset stock_deducted flag + re-evaluate
- BO restock notification: เมื่อ `dinoco_stock_add` SKU X → scan orders ที่มี BO child → ส่ง Flex "มีของแล้ว พร้อมส่งต่อ"
- Multiple qty per order → split logic per-SKU (ไม่ใช่ทั้งออเดอร์)
- Concurrent orders (A สั่ง 5, B สั่ง 5, stock=8) → `FOR UPDATE` lock ใน `dinoco_stock_subtract` แก้อยู่แล้ว (V.6.0)

### 2.3 LIFF B2F SET Detail — Full Hierarchy (Issue #3)

**Happy Path**:
```
Agent กดดู SET DNCSETNX500E002 ใน LIFF E-Catalog
  ↓ renderSetDetail(product)
  ↓ GET /maker-products?include_virtual=1 (already loaded)
Backend ส่งกลับ:
  products: [
    {sku: 'DNCSETNX500E002', is_virtual: true, ...},        // top SET
    {sku: 'DNCNX500001B', is_virtual: true, ...},            // NEW: intermediate
    {sku: 'DNCNX500E002B', is_virtual: true, ...},           // NEW: intermediate
    {sku: 'L1', ...}, {sku: 'L2', ...}, {sku: 'L3', ...}, {sku: 'L4', ...}
  ]
  ↓ renderSetDetailItems()
skuRelations['DNCSETNX500E002'] = ['DNCNX500001B', 'DNCNX500E002B']
  ↓ loop → productBySku['DNCNX500001B'] FOUND → push to children[]
  ↓ productBySku['DNCNX500E002B'] FOUND → push to children[]
  ↓ loop grandchildren via skuRelations[child] forward lookup
  ↓ render UI: 2 children + 4 grandchildren
```

**Error Paths**:
- ถ้า intermediate มี leaf ที่ไม่ registered → display แต่ disable qty stepper + แสดง "❌ โรงงานนี้ไม่รับ"
- Maker มีแต่ top SET registered (ไม่มี leaf) → virtual injection ไม่ fire → แสดง "Maker ยังไม่ได้ลงทะเบียนชิ้นส่วน"

---

## 3. Data Model

### 3.1 Issue #1 — PO Items Repeater (Additive)

**File**: `[B2F] Snippet 0: CPT & ACF Registration` (V.3.4 bump)

เพิ่ม ACF sub-field:
```
poi_parent_path: text
  Description: "slash-separated ancestor path from top SET to immediate parent (e.g. DNCSETNX500E002/DNCNX500001B)"
  Default: empty (backward compat = fallback to poi_parent_sku)
  Max length: 255
```

**Migration**: ไม่ต้อง — เก่าอ่าน fallback ได้ ใหม่ populate อัตโนมัติตอน create-po

**Updated repeater shape**:
```php
[
  'poi_sku' => 'DNCNX500001B-L',
  'poi_product_name' => '...',
  'poi_qty_ordered' => 1,
  'poi_unit_cost' => 1700,
  'poi_parent_sku' => 'DNCSETNX500E002',          // TOP SET (unchanged)
  'poi_parent_name' => 'ชุด NX500',                 // TOP NAME (unchanged)
  'poi_parent_path' => 'DNCSETNX500E002/DNCNX500001B', // NEW (intermediate chain)
  'poi_parent_breakdown' => '[...json...]',       // V.9.9 DD-3 unchanged
]
```

### 3.2 Issue #2 — B2B Backorder (Additive to existing)

**File**: ไม่ต้องเพิ่ม ACF ใหม่ — ใช้ structure เดิม

**Add post_meta**:
```
_b2b_bo_parent_id: int    (บน BO child order)
_b2b_bo_child_ids: int[]  (บน parent order — array of split BO children)
_b2b_bo_split_at: datetime
_b2b_bo_split_reason: string ('insufficient_stock' | 'admin_manual')
```

**Add wp_options** (config):
```
b2b_order_max_qty_per_sku: 100 (default)
b2b_order_max_daily_qty_per_sku: 500 (default, per distributor)
b2b_order_rate_window_sec: 86400 (24h)
```

**Add transient (rate limiting)**:
```
b2b_order_qty_{distributor_id}_{sku}: running total (TTL = window_sec)
```

### 3.3 Issue #3 — Virtual Intermediate SETs (No DB changes)

Pure compute layer — ไม่ต้องแก้ schema, แค่ extend `b2f_inject_virtual_sets_v919` → `b2f_inject_virtual_all_sets_v920`

---

## 4. API Design

### 4.1 Issue #1 — No new endpoints

**Modified**:
- `POST /b2f/v1/create-po` (`Snippet 2` line 1643-1734) → populate `poi_parent_path` ตอน DD-7 expand
- `GET /b2f/v1/po-detail` (`Snippet 2` line 2100-2200) → return `parent_path` per item (for Snippet 9 UI)
- `GET /b2f/v1/po-image?po_id=X` (`Snippet 10`) → consume parent_path

### 4.2 Issue #2 — Backorder Endpoints

**New REST routes** (under `/wp-json/b2b/v1/`):

```
POST /bo-split
  Body: { ticket_id, splits: [{sku, qty_fulfill, qty_bo}] }
  Permission: manage_options OR admin LINE user
  Returns: { parent_order_id, bo_child_ids: [], new_total }
  Side effects:
    - สร้าง child post(s) post_type=b2b_order, status=backorder
    - ตัด order_items ของ parent (keep only qty_fulfill)
    - ตัดสต็อก parent = qty_fulfill
    - set meta _b2b_bo_parent_id on children, _b2b_bo_child_ids on parent
    - append _b2b_status_history "Split BO {N} ชิ้น"
    - send LINE Flex to customer group (combined fulfill + BO notice)

POST /bo-restock-scan
  Body: { sku }
  Permission: manage_options
  Returns: { matched_orders: int, notifications_sent: int }
  Side effect: scan BO orders containing SKU → push Flex "มีของแล้ว"

GET /bo-dashboard
  Query: ?status=backorder&age_gt=24h
  Returns: list of BO orders + parent link + oldest first
  UI consumer: Admin Dashboard new tab "Backorders"
```

**Modified**:
- `POST /place-order` (`Snippet 3` line 700+) — เพิ่ม qty validation:
  ```php
  if ( $item_qty > $max_per_sku ) return 400 {error: 'QTY_OVER_LIMIT'};
  // NO stock count check — accept regardless
  ```

### 4.3 Issue #3 — No endpoint change

Only response shape ของ `GET /maker-products?include_virtual=1` จะมี intermediate SETs เพิ่ม (transparent to consumer — UI already filters by `is_virtual`)

---

## 5. UI Wireframes

### 5.1 Issue #1 — PO Flex Card (3-level)

**Layout (LINE Flex Bubble size=mega)**:
```
┌─────────────────────────────────┐
│ ใบสั่งซื้อจาก DINOCO  PO-XXXX   │  ← header navy
├─────────────────────────────────┤
│ 🏭 รายการสินค้า                  │
│                                  │
│ 📦 ชุด NX500 (DNCSETNX500E002)  │  ← color #7c3aed, size=sm, bold
│   x1 ชุด · ฿6,800                │
│                                  │
│   ├─ Crash Bar บน               │  ← color #2563eb, size=xs, indent 8px
│   │  (DNCNX500001B)             │
│   │  1. L1  x1  @1,700  1,700   │  ← indent 20px, size=xxs
│   │  2. R1  x1  @1,700  1,700   │
│   │                              │
│   └─ Crash Bar ล่าง              │
│      (DNCNX500E002B)             │
│      3. L2  x1  @1,700  1,700   │
│      4. R2  x1  @1,700  1,700   │
│                                  │
│ 📦 FORZA (DNCFORZA35001)        │
│   x1 · ฿1,775                    │
│   5. DNCFORZA35001-R @1,775     │  ← standalone (2-level only)
├─────────────────────────────────┤
│ ยอดรวม                  ฿8,575  │
└─────────────────────────────────┘
[✅ ยืนยัน + เลือกวันส่ง]  [ปฏิเสธ]
```

**Fallback (size > 10KB)**:
```
📦 ชุด NX500 — x1 (2 ชนิดย่อย, 4 ชิ้น, ฿6,800)
📦 FORZA — x1 ชิ้น (฿1,775)
[🔗 ดูรายละเอียดครบ]  ← LIFF link
```

**States**:
- **Empty**: "(ไม่มีรายการ)" + icon
- **Loading**: N/A (built server-side)
- **Error**: fallback text "ติดต่อ admin เพื่อรับรายละเอียด"

### 5.2 Issue #1 — PO Image A4 Table

**Table rows** (6 columns: # | SKU | Name | Qty | Unit | Total):
```
┌─────────────────────────────────────────────────────────┐
│ # │ SKU         │ Name          │ Qty │ Unit  │ Total  │
├───┼─────────────┼───────────────┼─────┼───────┼────────┤
│   │ [SET HEADER purple bg]  ■ ชุด NX500        ฿6,800  │  ← L1 background
│   │ [CHILD HEADER blue bg]    └ Crash Bar บน   ฿3,400  │  ← L2 background
│ 1 │ L1          │ Crash Bar L   │  1  │ 1,700 │ 1,700 │
│ 2 │ R1          │ Crash Bar R   │  1  │ 1,700 │ 1,700 │
│   │ [CHILD HEADER blue bg]    └ Crash Bar ล่าง ฿3,400  │
│ 3 │ L2          │ Crash Bar L   │  1  │ 1,700 │ 1,700 │
│ 4 │ R2          │ Crash Bar R   │  1  │ 1,700 │ 1,700 │
│   │ [SET HEADER purple bg]  ■ Crash Bar FORZA  ฿1,775  │
│ 5 │ DNCFORZA... │ FORZA350-R    │  1  │ 1,775 │ 1,775 │
└───┴─────────────┴───────────────┴─────┴───────┴────────┘
```

**Colors**:
- SET header: bg=#ede9fe, fg=#7c3aed (purple)
- Intermediate CHILD header: bg=#dbeafe, fg=#2563eb (blue)
- Leaf rows: normal zebra (#ffffff / #f8fafc)

### 5.3 Issue #2 — Backorder Agent View

**LINE Flex (customer group after split)**:
```
┌────────────────────────────────────┐
│ ✅ ออเดอร์ยืนยันแล้ว #12345          │
├────────────────────────────────────┤
│ 📦 จัดส่งทันที (8 ชิ้น)              │
│   • SKU A x8 ................ 1,600│
│                                    │
│ ⏳ สั่งจอง — รอสินค้า                │
│   • SKU A x2 (ETA: 3-5 วัน)        │
│                                    │
│ 💰 ยอดชำระ                  ฿2,000 │
│    (เรียกเก็บเมื่อของพร้อม BO)       │
├────────────────────────────────────┤
│ [ยืนยันบิล]  [ดูสถานะ BO]          │
└────────────────────────────────────┘
```

**Key rule**: ไม่เคยระบุ "สต็อกเหลือ X" — แค่ "จัดส่งทันที N ชิ้น" + "รอสินค้า M ชิ้น"

**Admin Dashboard** — new tab "Backorders":
```
┌─────────────────────────────────────────────┐
│ 📋 Backorders (12 รายการ)                    │
├─────────────────────────────────────────────┤
│ Age │ Ticket │ SKU │ Qty │ Parent │ Action  │
├─────┼────────┼─────┼─────┼────────┼─────────┤
│ 3d  │ #BO-12 │ X   │  2  │ #100   │ [ดู]    │
│ 1d  │ #BO-15 │ Y   │  5  │ #103   │ [ดู]    │
└─────────────────────────────────────────────┘
[Filter: อายุ >3d / ทั้งหมด]  [Export CSV]
```

### 5.4 Issue #3 — SET Detail (no wireframe change, just correctness)

Same layout as V.6.4 แต่แสดงครบ: 2 children + 4 grandchildren แทน 1 + 2

---

## 6. Dependencies & Impact

### Files affected

#### Issue #1 (Hierarchy rendering)
```
MUST EDIT:
├── [B2F] Snippet 0: CPT & ACF Registration
│     → V.3.4: add poi_parent_path sub-field
├── [B2F] Snippet 2: REST API
│     → V.10.2: create-po populate poi_parent_path, po-detail return it
├── [B2F] Snippet 1: Core Utilities & Flex Builders
│     → V.6.5: new b2f_group_items_by_path() (3-level grouping)
│     → Update b2f_flex_po_items_list() to use new grouping
│     → Update b2f_build_flex_new_po() + b2f_build_flex_po_created() (maker + admin)
├── [B2F] Snippet 10: PO Image Generator
│     → V.2.7: 3-level row rendering (SET header + CHILD subheader + leaf rows)
└── [B2F] Snippet 9: PO Ticket View
      → V.3.6: web display 3-level (already has toggle, just extend grouping helper)

NO CHANGE (backward compat):
- Snippet 4 (Maker LIFF) — already uses b2f_group_items_by_set
- Snippet 5 (Admin Makers tab) — separate product management
- Snippet 8 (LIFF E-Catalog) — consumer side, not PO rendering
```

#### Issue #2 (Backorder system)
```
MUST EDIT:
├── [B2B] Snippet 3: LIFF E-Catalog REST API
│     → Add qty hard cap + rate limit in /place-order
│     → New POST /bo-split, /bo-restock-scan, GET /bo-dashboard
├── [B2B] Snippet 2: LINE Webhook Gateway & Order Creator
│     → Modify b2b_action_stock_confirm to show split option (new Flex)
│     → Add b2b_action_stock_split handler
├── [B2B] Snippet 1: Core Utilities & LINE Flex Builders
│     → New b2f_build_flex_stock_split_admin() (for admin)
│     → New b2b_build_flex_bo_partial_customer() (for customer group)
├── [B2B] Snippet 14: Order State Machine
│     → Allow checking_stock → split transition (new pseudo-state)
├── [B2B] Snippet 5: Admin Dashboard
│     → New "Backorders" tab with table
└── [B2B] Snippet 15: Custom Tables & JWT Session (or reuse post_meta)
      → No table needed if using post_meta approach

Dependencies:
- dinoco_stock_subtract() already atomic (V.6.0) — OK
- b2b_recalculate_debt() — needs review: split order = debt split too?
- b2b_enqueue_print_job() — only enqueue for fulfilled parent, not BO child
```

#### Issue #3 (Virtual intermediate SETs)
```
MUST EDIT:
└── [B2F] Snippet 2: REST API
      → V.10.2: rename b2f_inject_virtual_sets_v919 → 
                   b2f_inject_virtual_all_sets_v920
                inject ALL non-leaf, non-registered parents
                (top-level + intermediates)

NO CHANGE:
- Snippet 8 (LIFF E-Catalog) — already renders correctly if products[] contains them
- Snippet 5 (Admin Makers) — consumer of same endpoint, benefits automatically
```

### Cross-system side effects

**Issue #1 side effects**:
- Backward compat: PO ก่อน V.10.2 ไม่มี `poi_parent_path` → fallback ใช้ `poi_parent_sku` (2-level grouping) ไม่กระทบ
- Shared child DD-3: `poi_parent_path` อาจ ambiguous ถ้า leaf ใช้ร่วมหลาย SET → เก็บ **path แรก** ตาม breakdown[0] + breakdown still authoritative
- Flex size risk: 3-level หนักกว่า 2-level → ต้องมี fallback mode

**Issue #2 side effects**:
- Debt system: split order ต้องแยก debt? **Decision**: ไม่แยก — parent รับทั้งหมด, BO child ไม่ append debt จน shipped
- Invoice: ออก invoice ตอน parent fulfill only; BO child ไม่ออก invoice จน ship
- Print job: parent print เลย, BO child wait
- Flash label: parent generate, BO wait

**Issue #3 side effects**:
- Admin Makers tab (Snippet 5) จะเห็น intermediate SETs ใน dropdown → ต้อง filter ออกเพราะ "set ไม่มีใน wp_b2f_makers_products junction" → product picker ต้อง gate ด้วย `is_virtual=false`
- Product count display: ต้องไม่นับ virtual SETs (show only real registered count)

---

## 7. Implementation Roadmap

### Phase 1: Quick Win — Issue #3 (2-4 ชม.)

```
Task 1.1: Extend b2f_inject_virtual_sets → inject all intermediates
  File: [B2F] Snippet 2 REST API V.10.2
  Est: 2 ชม.
  Details:
    - Rename function + mark V.9.19 deprecated
    - Collect ALL parent nodes (has children in rel_upper) that are 
      NOT leaves and NOT registered
    - For each, check has ≥1 registered leaf descendant → inject
    - Keep same virtual shape (is_virtual=true, auto_type='set')
Task 1.2: Gate in Admin Makers tab
  File: [B2F] Snippet 5 V.5.2
  Est: 30 นาที
  Details: product picker filter `!p.is_virtual` — exclude intermediate from "add product" dropdown
Task 1.3: Test
  - Manual: LIFF open DNCSETNX500E002 → verify 2 children + 4 grandchildren
  - Regression: Admin Makers product list count unchanged
Deploy: bump Snippet 2 version → push → webhook sync
```

### Phase 2: Medium — Issue #1 (1-2 วัน)

```
Task 2.1: ACF field add
  File: [B2F] Snippet 0 V.3.4
  Est: 30 นาที
  Details: register poi_parent_path (text)
Task 2.2: Populate on create-po
  File: [B2F] Snippet 2 V.10.3
  Est: 2 ชม.
  Details:
    - During DD-7 leaf expansion, track intermediate parent
    - Walk up: get_ancestor_skus(leaf) until reach top SET ordered
    - Build path = "TOP/MID" (or just "TOP" if 2-level)
    - Save poi_parent_path per repeater row
    - For shared child: take path from breakdown[0]
Task 2.3: New grouping helper
  File: [B2F] Snippet 1 V.6.5
  Est: 2 ชม.
  Details:
    - b2f_group_items_by_path($items) returns nested tree:
      { sets: { top_sku: { name, children_nodes: { mid_sku: { name, leaves: [] } }, 
                           direct_leaves: [] } }, 
        standalone: [] }
    - Fallback: if no poi_parent_path → call b2f_group_items_by_set (2-level)
Task 2.4: Flex builders update
  File: [B2F] Snippet 1 V.6.5
  Est: 3 ชม.
  Details:
    - Update b2f_flex_po_items_list (new 3-level rendering)
    - Update b2f_build_flex_new_po (to Maker) + b2f_build_flex_po_created (to Admin)
    - Size guard: if bubble >9KB → switch to summary mode
Task 2.5: PO Image update
  File: [B2F] Snippet 10 V.2.7
  Est: 3 ชม.
  Details: GD render SET header (purple) + CHILD sub-header (blue) + leaf rows
Task 2.6: PO Ticket web update (Snippet 9) — already has toggle, extend grouping
  File: [B2F] Snippet 9 V.3.6
  Est: 1 ชม.
Task 2.7: Tests
  - Create PO with 3-level SET → verify Flex + Image + Web all render 3 levels
  - Create PO with 2-level SET → verify backward compat
  - Create PO with shared child (DD-3) → verify correct grouping via breakdown
  - PO เก่า (no poi_parent_path) → verify fallback
Deploy: batched commit (Snippet 0, 1, 2, 9, 10)
```

### Phase 3: Large — Issue #2 (3-5 วัน)

```
Task 3.1: Hard cap + rate limit in place-order
  File: [B2B] Snippet 3 V.YY
  Est: 2 ชม.
  Details:
    - Add wp_options: max_qty_per_sku (default 100), max_daily_per_dist (default 500)
    - Validate qty in /place-order request (reject 400 if over)
    - Track daily running total via transient (increment atomic)
Task 3.2: FSM + split logic
  File: [B2B] Snippet 14 V.1.6, Snippet 2 V.XX
  Est: 4 ชม.
  Details:
    - Add split handler (create BO child posts, link via meta)
    - Update FSM to allow checking_stock → (awaiting_confirm + backorder) split
    - Atomic: all stock subtract in single transaction
Task 3.3: Admin Flex "Split" button
  File: [B2B] Snippet 1 V.XX, Snippet 2
  Est: 3 ชม.
  Details:
    - Modify b2b_build_flex_stock_check_alert → add "Split BO" postback
    - Handler: b2b_action_stock_split → prompt ETA → create children
Task 3.4: Customer combined Flex
  File: [B2B] Snippet 1 V.XX
  Est: 2 ชม.
  Details:
    - New b2b_build_flex_partial_fulfill_customer()
    - Shows "✅ จัดส่ง N ชิ้น + ⏳ BO M ชิ้น (ETA)"
    - NO stock count exposure
Task 3.5: BO dashboard + restock scan
  File: [B2B] Snippet 5 (Admin Dashboard), Snippet 3 (REST)
  Est: 4 ชม.
  Details:
    - New tab "Backorders" with sortable table
    - Age indicator (>3d = amber, >7d = red)
    - Bulk action: notify customers on restock
    - Cron: scan dinoco_stock_add events → match BO orders
Task 3.6: Debt/Invoice integration
  Est: 3 ชม.
  Details:
    - Parent order: debt + invoice at fulfill
    - BO child: no debt until shipped, separate invoice
Task 3.7: Tests
  - Unit: qty cap, rate limit, split atomic
  - Integration: concurrent orders on same SKU → no oversell
  - Security: try to enumerate stock via qty binary search → confirm 0 info leak
  - Edge: walk-in (skip), edit_ticket (reset), concurrent split (lock)
Deploy: phased rollout
  - Phase 3a: cap + rate limit (low risk, deploy first)
  - Phase 3b: split logic (behind feature flag b2b_bo_split_enabled)
  - Phase 3c: dashboard + restock (admin tool)
```

---

## 8. Risk & Mitigation

| Risk | Severity | Mitigation |
|---|---|---|
| **Flex >10KB** (Issue #1 3-level) | High | Size guard + summary fallback + LIFF link |
| **PO Image height overflow** | Medium | Pagination exists — ensure SET/CHILD headers don't split across pages |
| **Backward compat broken** | High | `poi_parent_path` default empty → fallback to `poi_parent_sku` everywhere |
| **Shared child ambiguity** (DD-3) | Medium | Use `poi_parent_breakdown[0]` for path; render under all SETs per breakdown |
| **Stock enumeration via error msg** | Critical | Generic error only: "สั่งเกินที่อนุญาต" — never expose qty delta to customer |
| **Admin split workflow complexity** | Medium | Pre-compute "needs split" Flex with delta visible to admin only |
| **Debt inconsistency** (BO split) | High | Freeze debt at parent level; BO child debt = 0 until shipped |
| **Intermediate SET in Makers picker** | Low | Filter `!p.is_virtual` in product picker dropdown (Snippet 5) |
| **Virtual SET perf** (N intermediates) | Low | In-memory walk, O(N) per request; already cached by WP object cache |
| **FSM double-transition race** | Medium | Advisory lock pattern (existing `b2b_lock_{id}` transient) |
| **BO child orphan** (parent cancelled) | Medium | On parent cancel → auto-cancel all BO children + restore stock |
| **LINE message quota hit** | Medium | Only push on state change, not heartbeat |

---

## 9. Testing Checklist

### Issue #1 — PO Hierarchy
- [ ] Create PO with 3-level SET (DNCSETNX500E002) → Flex Maker shows 3 levels
- [ ] Create PO with 3-level SET → Flex Admin (po_created) shows 3 levels
- [ ] Create PO with 3-level SET → PO Image A4 shows SET header + CHILD subheader + leaves
- [ ] Create PO with 3-level SET → Web Ticket View (Snippet 9) shows 3 levels
- [ ] Create PO with 2-level SET (no grandchildren) → renders correctly (2 levels, no empty layer)
- [ ] Create PO with shared child (DD-3) → appears under all 2 SETs with correct qty split
- [ ] Create PO standalone leaf (not in any SET) → renders as flat row
- [ ] Load old PO (no poi_parent_path) → renders 2-level via fallback
- [ ] Flex payload size check: 3-level SET with 10+ grandchildren → fallback to summary mode
- [ ] PO Image: 3-level SET spanning 2 pages → SET header repeats on page 2

### Issue #2 — Backorder System
- [ ] Agent orders qty=10 stock=8 → order accepted, no error shown
- [ ] Admin sees "needs split" Flex with qty delta visible
- [ ] Admin splits → parent=8 + BO child=2 → stock correct (reserved 8, no negative)
- [ ] Customer Flex shows "จัดส่ง 8 + BO 2" — NO stock count visible
- [ ] Agent tries qty=10000 → rejected "QTY_OVER_LIMIT"
- [ ] Agent spams qty=100 × 10 times same day → rate limit trips
- [ ] Concurrent A qty=5 + B qty=5 stock=8 → no oversell (locked)
- [ ] Walk-in distributor → skips BO flow (auto allow negative)
- [ ] Parent cancel → BO child auto-cancel + stock restore
- [ ] BO restock scan: dinoco_stock_add fires → BO child customer gets "มีของแล้ว" Flex
- [ ] BO age >3d → Admin dashboard amber indicator
- [ ] Debt calculation: parent debt += fulfilled amount only, BO child debt = 0 until ship
- [ ] Invoice: parent has invoice, BO child no invoice until ship
- [ ] Security test: try binary search via qty 1 → 100 → 50 → 75 → error messages all identical

### Issue #3 — SET Detail Full Hierarchy
- [ ] Open SET `DNCSETNX500E002` → shows 2 children (DNCNX500001B, DNCNX500E002B)
- [ ] Each child shows 2 grandchildren (L, R)
- [ ] Cart expand (DD-7) still produces 4 leaves (regression)
- [ ] Admin Makers product picker does NOT show virtual intermediate (filter works)
- [ ] Maker registers only top SET → intermediates still virtual-injected if leaves present
- [ ] Maker unregisters a leaf → intermediate sub-SET still shows (missing leaf warning)
- [ ] Product count display: show real registered count (excludes virtual)

---

## 10. Rollback Plan

### Issue #1 Rollback
- **Mechanism**: Version bump Snippet 0/1/2/9/10 → sync overrides with old
- **Quick revert**: Snippet 1 `b2f_group_items_by_path` — add feature flag `B2F_V3_HIERARCHY_ENABLED` (default true); if false, call old `b2f_group_items_by_set`
- **Data cleanup**: `poi_parent_path` can stay in ACF (ignored by old code) — no destructive rollback
- **Blast radius**: Only affects PO display. Core stock/debt/FSM unchanged.

### Issue #2 Rollback
- **Feature flag**: `define('B2B_BO_SPLIT_ENABLED', true)` — guards all split logic; false → behave as V.YY-1
- **Data**: `_b2b_bo_parent_id` / `_b2b_bo_child_ids` meta safe to leave
- **Stock**: If rollback mid-split → manually trigger `b2b_recalculate_stock(ticket_id)` (add utility)
- **Customer impact**: If rollback after split Flex sent → customer sees BO child "orphaned"; manual admin action needed
- **Blast radius**: High — affects order flow. Recommend 48hr staging test before prod.
- **Escape hatch**: Disable flag → admin still can manage existing split orders via dashboard; no new splits created

### Issue #3 Rollback
- **Mechanism**: Revert `b2f_inject_virtual_all_sets_v920` → call `b2f_inject_virtual_sets_v919` (rename back)
- **Blast radius**: Minimal — UI display only; no data persistence change
- **Customer impact**: SET Detail reverts to previous (incomplete) view

---

## Recommended Action Sequence

**คำแนะนำลำดับทำงาน** (ทำตามนี้จะ safe ที่สุด):

### Step 1 (วันนี้) — Ship Issue #3 immediately
- 2-4 ชม. dispatch ไปที่ **fullstack-developer**
- Scope: `[B2F] Snippet 2` rename + extend `b2f_inject_virtual_sets_v919` → all intermediates
- Scope: `[B2F] Snippet 5` filter `is_virtual` in Admin Makers product picker
- Test: open `DNCSETNX500E002` in LIFF → confirm 2 ลูก + 4 หลาน
- Deploy: bump Snippet 2 V.10.2, Snippet 5 V.5.2

### Step 2 (2-3 วันถัดไป) — Ship Issue #1
- Dispatch ไปที่ **database-expert** (ACF schema) + **fullstack-developer** (code)
- Phase 2.1-2.3 (ACF + backend): 1 วัน
- Phase 2.4-2.6 (Flex + Image + Web): 1 วัน
- Phase 2.7 (tests): 0.5 วัน
- Deploy ทีเดียว (batched) เพราะทุก snippet สัมพันธ์กัน

### Step 3 (สัปดาห์หน้า) — Plan Issue #2 carefully
- ก่อน implement: เขียน **Threat Model doc** ว่า enumeration vector ทุกช่องทางอุดครบมั้ย
  - Error messages must be constant-time + generic
  - Rate limit + hard cap + per-SKU + per-distributor + per-day
  - Admin Flex ต้องไม่ leak delta ไปช่องทางที่ customer เห็น
- Dispatch ไปที่ **security-pentester** review threat model ก่อน
- Then dispatch **database-expert** → **fullstack-developer**
- Phased deploy: 3a (cap) → 3b (split behind flag) → 3c (dashboard)
- Feature flag staged rollout: ทดสอบกับ 1 distributor ก่อน, ค่อย roll out ทั้งหมด

### Step 4 (ต่อเนื่อง) — Monitor
- Dashboard metric: % orders เข้า BO flow
- Alert: BO age >7d
- Weekly review: stock cap hit rate (สัญญาณว่า cap ต่ำไป/สูงไป)

---

## Reference Documentation

- `[B2F] Snippet 0: CPT & ACF Registration` (V.3.3 DB_ID 1160)
- `[B2F] Snippet 1: Core Utilities & Flex Builders` (V.6.4 DB_ID 1163) — lines 432-574 (helpers), 588-685 (flex items list), 857-1062 (new_po + po_created)
- `[B2F] Snippet 2: REST API` (V.9.10+V.10.0 DB_ID 1165) — lines 1643-1734 (DD-7 expand), 4848-4987 (virtual inject)
- `[B2F] Snippet 8: Admin LIFF E-Catalog` (V.6.4 DB_ID 1168) — lines 1593-1705 (renderSetDetailItems)
- `[B2F] Snippet 9: PO Ticket View` (V.3.5 DB_ID 1169) — uses `b2f_group_items_by_set` + breakdown already
- `[B2F] Snippet 10: PO Image Generator` (V.2.6 DB_ID 1170) — lines 284-314 (grouping), 455-500 (row rendering)
- `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator` — lines 658-687 (place-order flow), 3600-3729 (stock hook)
- `[B2B] Snippet 3: LIFF E-Catalog REST API` — lines 700-830 (place-order)
- `[B2B] Snippet 14: Order State Machine`
- `CLAUDE.md` — Inventory + B2F + B2B sections
- Screenshots 1-5 provided by user (2026-04-15)

## Related Wiki Topics

- [[3-Level SKU Hierarchy]]
- [[B2F PO Flow]]
- [[DD-3 Shared Child]]
- [[DD-7 Leaf Expansion]]
- [[B2B Backorder]]
- [[Stock Enumeration Attack]]
- [[LIFF E-Catalog]]
- [[Virtual SET Injection]]
