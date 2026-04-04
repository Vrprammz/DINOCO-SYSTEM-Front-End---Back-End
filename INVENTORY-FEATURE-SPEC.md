# Feature Spec: Central Inventory System

Version: 2.1 | Date: 2026-04-04 | Author: Feature Architect + Fullstack Review

---

## 1. Problem & Goal

### ปัญหา
1. **ไม่มีจำนวนสต็อกจริง** -- ระบบปัจจุบันมีแค่ toggle `in_stock/out_of_stock` บน `dinoco_products` table + `b2b_product` CPT ไม่มี `stock_qty` field
2. **B2F receive-goods ไม่เพิ่มสต็อก** -- รับของเข้ามาแค่ set `in_stock` (binary) ไม่มีจำนวน
3. **B2B shipped ไม่ตัดสต็อก** -- ส่งของออกแต่ไม่หักจำนวน ทำให้ไม่รู้ของเหลือเท่าไหร่
4. **ไม่มี audit trail** -- Admin ปรับสต็อกแต่ไม่มี log ว่าใคร ทำอะไร เมื่อไหร่
5. **ไม่มี physical count** -- ไม่มีระบบนับสต็อกจริง (Dip Stock) เทียบกับตัวเลขในระบบ
6. **ตัวแทนเห็นแค่ toggle** -- แต่ไม่มี "ใกล้หมด" warning

### ถ้าไม่ทำ
- Admin ต้อง manual toggle stock_status ทุกครั้ง → ลืม → ลูกค้าสั่งของที่หมดสต็อก
- ไม่รู้ต้นทุนสินค้าคงเหลือ (inventory valuation)
- ตรวจนับสต็อกต้องทำนอกระบบ (กระดาษ/Excel)
- ไม่มี low stock alert → หมดของก่อนสั่งผลิต

### Workaround ปัจจุบัน
- Admin toggle `stock_status` manual ใน `[dinoco_admin_inventory]` / B2B Admin Control Panel
- Cron `b2b_oos_expiry_check` auto-reset OOS เมื่อหมดเวลา
- B2F receive-goods set `in_stock` ถ้าเคย `out_of_stock`

### Success Metrics
| Metric | Target |
|--------|--------|
| สต็อกตรงกับของจริง (หลัง Dip Stock) | +-5% variance |
| เวลาตรวจนับ (Dip Stock) | < 2 ชม. / ครั้ง |
| Admin response time เมื่อสินค้าใกล้หมด | < 1 ชม. (alert → action) |
| จำนวนครั้งที่ลูกค้าสั่งของหมดสต็อก | ลดลง 80% |
| Auto stock_status accuracy | 100% (in_stock, low_stock, out_of_stock ถูกต้องตาม threshold) |

---

## 2. User Flows

### 2.1 Auto Stock Addition (B2F Receive Goods)

```
Trigger: Admin กด receive-goods ใน B2F Dashboard

Happy Path:
1. Admin กรอกจำนวนรับ per SKU (เหมือนเดิม)
2. POST /b2f/v1/receive-goods ทำงานเดิม +
3. [NEW] สำหรับแต่ละ SKU ที่รับ:
   a. ดึง current stock_qty จาก dinoco_products
   b. stock_qty += rcvi_qty_received
   c. UPDATE dinoco_products SET stock_qty = new_qty
   d. บันทึก stock_transaction record (type=b2f_receive)
   e. Auto-update stock_status ตาม threshold
4. → Return response เหมือนเดิม + inventory_changes array

Error Paths:
├── SKU ไม่อยู่ใน dinoco_products → log warning, skip (ไม่ block receive)
├── DB update fail → log error, continue (inventory update is non-blocking)
└── stock_qty overflow (>999999) → cap at 999999, alert admin
```

### 2.2 Auto Stock Deduction (B2B Shipped)

```
Trigger: Admin กด "จัดส่ง" (Flash หรือ Manual) → status = shipped

Happy Path:
1. B2B order transition to "shipped" (existing flow)
2. [NEW] Hook: b2b_order_status_changed (shipped)
   a. ดึง order_items
   b. สำหรับแต่ละ SKU:
      - stock_qty -= qty_ordered
      - ถ้า stock_qty < 0 → set เป็น 0 + log warning
      - บันทึก stock_transaction (type=b2b_shipped)
      - Auto-update stock_status ตาม threshold
3. → ส่ง low stock alert ถ้าถึง threshold

Error Paths:
├── stock_qty ไม่พอ (< order qty) → deduct ถึง 0, log warning, ไม่ block shipment
├── SKU ไม่มีใน catalog → log warning, skip
└── Walk-in order completed → ตัดสต็อกเหมือนกัน (hook on shipped OR completed for walk-in)

Edge Cases:
├── B2B order cancelled หลัง shipped → ไม่คืนสต็อก (ของส่งไปแล้ว)
├── Walk-in cancelled (admin cancel completed) → คืนสต็อก (type=b2b_cancel_return)
├── SKU relations (parent/child set) → ตัดสต็อก children ทุกตัว (parent เป็นแค่ bundle ไม่เก็บ stock)
└── order_items ไม่มี SKU (legacy data) → skip, log
```

### 2.3 Manual Stock Adjustment (Admin)

```
Trigger: Admin เปิดหน้า Inventory → กดปรับสต็อก

Happy Path:
1. Admin ค้นหาสินค้า → เลือก SKU
2. กรอก: adjustment type (เพิ่ม/ลด), จำนวน, เหตุผล
3. POST → validate + apply:
   a. stock_qty += หรือ -= จำนวน
   b. บันทึก stock_transaction (type=manual_add หรือ manual_subtract)
   c. Auto-update stock_status ตาม threshold
4. → แสดง success + stock ใหม่

Error Paths:
├── จำนวนลดเกิน stock_qty → ถาม confirm "สต็อกจะเป็น 0 ต้องการดำเนินการ?"
├── เหตุผลว่าง → validation error "กรุณาระบุเหตุผล"
└── Concurrent edit → ใช้ optimistic lock (check stock_qty before update)

Edge Cases:
├── stock_qty ถูก set เป็น 0 → auto out_of_stock
├── stock_qty เพิ่มจาก 0 → auto in_stock
└── Admin ปรับติดลบ → cap ที่ 0
```

### 2.4 Dip Stock (Physical Count)

```
Trigger: 
  - ครั้งแรก (Initial Import): Admin เปิดระบบใหม่ → Dip Stock เป็น "god mode" set สต็อกทั้งหมด
  - รายเดือน: Cron ทุก 30 วัน push alert Admin / Admin กดเริ่มนับเอง
  - Manual: Admin กดเริ่มนับเมื่อไหร่ก็ได้

ใช้ flow เดียวกันทั้ง initial import + นับรายเดือน:
  - ครั้งแรก: expected_qty = 0 ทุก SKU → Admin กรอก actual_qty จริง → approve → stock_qty = actual_qty
  - ครั้งถัดไป: expected_qty = stock_qty ปัจจุบัน → Admin นับจริง → เทียบ variance → approve

Happy Path:
1. Admin เปิดหน้า Dip Stock → กด "เริ่มนับสต็อก"
2. ระบบสร้าง dip_stock session:
   a. Snapshot stock_qty ปัจจุบันทุก SKU → expected_qty
   b. Status: in_progress
3. Admin กรอกจำนวนนับจริง (actual_qty) ทีละ SKU
   - UI: แสดง SKU + ชื่อ + รูป + expected_qty (ซ่อน/แสดงได้)
   - Admin กรอก actual_qty → ระบบคำนวณ variance ทันที
4. Admin กด "บันทึกผลนับ" (สามารถบันทึกทีละ batch ได้)
5. ระบบ:
   a. บันทึก actual_qty + variance per SKU
   b. ยังไม่ adjust stock อัตโนมัติ
6. Admin review variance report:
   - แสดง SKU ที่มี variance (sorted by % variance desc)
   - สีแดง: variance > 5%
   - สีเหลือง: variance 1-5%
   - สีเขียว: variance = 0
7. Admin กด "ปรับสต็อกตามผลนับ" (approve adjustment)
   a. stock_qty = actual_qty สำหรับ SKU ที่ approve
   b. บันทึก stock_transaction (type=dip_stock_adjust)
   c. Status: completed
8. → สรุปผล: จำนวน SKU ที่ปรับ, total variance

Error Paths:
├── Session ค้าง in_progress > 48 ชม. → auto expire + alert
├── Admin กรอก actual_qty < 0 → validation error
├── มี 2 session พร้อมกัน → block "มีการนับสต็อกค้างอยู่" + ปุ่ม "Force Close" สำหรับ admin
└── ระหว่างนับมี receive/ship เกิดขึ้น → variance note "มีการเคลื่อนไหวระหว่างนับ"

Edge Cases:
├── SKU ใหม่ที่ยังไม่อยู่ใน session → แสดงปุ่ม "เพิ่ม SKU" (expected_qty = 0)
├── Admin ปิด browser กลางทาง → session ยังอยู่ (resume ได้)
├── สินค้า inactive → ไม่รวมใน dip stock (filter เฉพาะ is_active=1)
└── Partial approve → เลือก approve บาง SKU ได้ (ส่วนที่เหลือ pending)
```

### 2.5 Distributor Stock View (B2B Catalog)

```
Trigger: ตัวแทนเปิด LIFF E-Catalog

Happy Path:
1. GET /b2b/v1/catalog (existing)
2. [MODIFIED] Response per product:
   - stock_display: "in_stock" | "low_stock" | "out_of_stock"
   - ไม่ส่ง stock_qty จริง
3. Frontend แสดง badge:
   - เขียว "มีสินค้า" → stock_display = in_stock
   - เหลือง "ใกล้หมด" → stock_display = low_stock
   - แดง "สินค้าหมด" → stock_display = out_of_stock
4. สินค้า out_of_stock → แสดง ETA ถ้ามี, ปุ่มสั่งซื้อ disabled

Edge Cases:
├── Low stock threshold = 0 (ไม่เคยตั้ง) → ไม่แสดง low_stock, ใช้แค่ in/out
├── Admin override stock_display manual → ใช้ค่า manual แทน auto
└── ETA หมดอายุแล้ว → ซ่อน ETA
```

### 2.6 Backorder (BO) System — ETA คำนวณจาก B2F PO

```
Problem: เมื่อสินค้าหมดสต็อก ตัวแทนต้องรู้ว่า "กี่วันจะมีของ"
ปัจจุบัน admin ต้องกรอก oos_eta_date manual ทุกครั้ง

Solution: คำนวณ ETA อัตโนมัติจาก B2F PO ที่สั่งโรงงานไว้ + Admin สามารถ override manual ได้

Happy Path:
1. สินค้า SKU-001 หมดสต็อก (stock_qty = 0)
2. ระบบตรวจอัตโนมัติ: มี B2F PO ที่สั่ง SKU-001 อยู่ไหม?
   ├── ถ้ามี PO status=confirmed → ETA = po_expected_date
   ├── ถ้ามี PO status=delivering → ETA = po_expected_date (กำลังส่ง)
   ├── ถ้ามี PO status=submitted → ETA = วันสั่ง + maker.mp_lead_time_days
   └── ถ้าไม่มี PO → ETA = NULL (ยังไม่ได้สั่ง)
3. Admin กดปุ่ม "+ เพิ่มวัน" เพื่อ buffer (เช่น +3 วัน ขนส่ง + ตรวจรับ)
   → bo_eta_buffer_days (manual override per SKU)
   → ETA สุดท้าย = po_expected_date + bo_eta_buffer_days
4. ตัวแทนเห็น: "สินค้าหมด — คาดว่าจะมีของ DD/MM/YYYY"

Admin Override:
├── Admin กรอก bo_eta_override (date) ตรงๆ → ใช้ค่านี้แทนการคำนวณ
├── Admin ลบ override → กลับมาใช้ค่าคำนวณจาก PO
└── Admin กรอก bo_note → "รอของจากจีน ล็อต 2"

คำนวณ ETA Priority:
1. bo_eta_override (Admin กำหนดเอง)     → ใช้ทันที
2. po_expected_date + bo_eta_buffer_days → คำนวณจาก PO
3. oos_eta_date (legacy, ถ้ามี)           → fallback
4. NULL                                   → "ยังไม่ทราบ"

Edge Cases:
├── มีหลาย PO ที่สั่ง SKU เดียวกัน → ใช้ PO ที่ expected_date เร็วที่สุด
├── PO ถูก cancel หลัง ETA คำนวณ → recalculate ทันที
├── Maker ขอเลื่อนวัน (reschedule) → ETA update อัตโนมัติ
├── PO receive partial → ETA ยังคงจนกว่า stock_qty > 0
├── หลาย SKU หมดพร้อมกัน → คำนวณ ETA แยกแต่ละ SKU
└── Buffer days = 0 (default) → ใช้ po_expected_date ตรงๆ
```

### 2.7 BO Display สำหรับตัวแทน

```
ตัวแทนเปิด E-Catalog เห็น:

┌──────────────────────────────────┐
│  SKU-001 Crash Bar Pro Rally     │
│  [แดง] สินค้าหมด                 │
│  คาดว่าจะมีของ: 15/04/2026       │
│  [ปุ่มสั่งซื้อ disabled/ซ่อน]    │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│  SKU-002 การ์ดน้ำมัน             │
│  [แดง] สินค้าหมด                 │
│  รอสั่งผลิต (ยังไม่ทราบกำหนด)    │
│  [ปุ่มสั่งซื้อ disabled/ซ่อน]    │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│  SKU-003 Engine Guard            │
│  [เหลือง] ใกล้หมด — สั่งก่อนหมด │
│  [สั่งซื้อ]                      │
└──────────────────────────────────┘

Rules:
├── ETA มี → "คาดว่าจะมีของ: DD/MM/YYYY"
├── ETA ไม่มี + BO note มี → แสดง bo_note (เช่น "รอสั่งผลิต")
├── ETA ไม่มี + BO note ไม่มี → "ยังไม่ทราบกำหนด"
├── ตัวแทนไม่เห็นชื่อโรงงาน / PO number (ข้อมูลภายใน)
└── ตัวแทนไม่เห็น stock_qty (เห็นแค่ badge สี)
```

---

## 3. Data Model

### 3.1 ALTER TABLE `dinoco_products` (ไม่สร้าง table ใหม่)

เพิ่ม columns ใน `wp_dinoco_products` ที่มีอยู่แล้ว (Snippet 15):

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `stock_qty` | INT UNSIGNED | 0 | จำนวนสต็อกจริง |
| `low_stock_threshold` | INT UNSIGNED | 10 | Threshold แสดง "ใกล้หมด" |
| `reorder_point` | INT UNSIGNED | 5 | จุดสั่งซื้อใหม่ (สำหรับ alert) |
| `last_dip_stock_date` | DATE | NULL | วันนับสต็อกล่าสุด |
| `last_dip_stock_qty` | INT UNSIGNED | NULL | จำนวนนับสต็อกล่าสุด |
| `bo_eta_buffer_days` | TINYINT UNSIGNED | 0 | Admin กำหนด buffer วันเพิ่มจาก PO ETA |
| `bo_eta_override` | DATE | NULL | Admin override ETA ตรงๆ (ใช้แทนคำนวณ) |
| `bo_note` | VARCHAR(255) | NULL | หมายเหตุ BO ("รอของจากจีน ล็อต 2") |
| `manual_hold` | TINYINT(1) | 0 | Admin ล็อกสต็อกแม้ qty > 0 (เช่น ของเสีย/รอ QC) |
| `manual_hold_reason` | VARCHAR(255) | NULL | เหตุผล manual hold |
| `manual_hold_by` | INT UNSIGNED | NULL | Admin user ID ที่กด hold |

```sql
ALTER TABLE wp_dinoco_products
  ADD COLUMN stock_qty INT UNSIGNED NOT NULL DEFAULT 0 AFTER stock_status,
  ADD COLUMN low_stock_threshold INT UNSIGNED NOT NULL DEFAULT 10 AFTER stock_qty,
  ADD COLUMN reorder_point INT UNSIGNED NOT NULL DEFAULT 5 AFTER low_stock_threshold,
  ADD COLUMN last_dip_stock_date DATE DEFAULT NULL AFTER reorder_point,
  ADD COLUMN last_dip_stock_qty INT UNSIGNED DEFAULT NULL AFTER last_dip_stock_date,
  ADD COLUMN bo_eta_buffer_days TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER last_dip_stock_qty,
  ADD COLUMN bo_eta_override DATE DEFAULT NULL AFTER bo_eta_buffer_days,
  ADD COLUMN bo_note VARCHAR(255) DEFAULT NULL AFTER bo_eta_override,
  ADD COLUMN manual_hold TINYINT(1) NOT NULL DEFAULT 0 AFTER bo_note,
  ADD COLUMN manual_hold_reason VARCHAR(255) DEFAULT NULL AFTER manual_hold,
  ADD COLUMN manual_hold_by INT UNSIGNED DEFAULT NULL AFTER manual_hold_reason;
```

### 3.2 NEW TABLE `dinoco_stock_transactions` (Transaction Log)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| `sku` | VARCHAR(50) NOT NULL | Product SKU |
| `type` | ENUM | Transaction type (see below) |
| `qty_change` | INT NOT NULL | +/- จำนวนที่เปลี่ยน (positive=เพิ่ม, negative=ลด) |
| `qty_before` | INT UNSIGNED NOT NULL | สต็อกก่อนทำรายการ |
| `qty_after` | INT UNSIGNED NOT NULL | สต็อกหลังทำรายการ |
| `reference_type` | VARCHAR(30) DEFAULT NULL | CPT type ที่อ้างอิง (b2f_receiving, b2b_order, etc.) |
| `reference_id` | BIGINT UNSIGNED DEFAULT NULL | Post ID อ้างอิง |
| `reason` | VARCHAR(500) DEFAULT '' | เหตุผล (สำหรับ manual) |
| `user_id` | BIGINT UNSIGNED DEFAULT NULL | WP User ID ที่ทำรายการ |
| `created_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | Timestamp |

**Transaction types:**
- `b2f_receive` -- รับของจาก B2F
- `b2b_shipped` -- ตัดสต็อกเมื่อจัดส่ง B2B
- `b2b_cancel_return` -- คืนสต็อกเมื่อยกเลิก walk-in
- `manual_add` -- Admin เพิ่มสต็อก manual
- `manual_subtract` -- Admin ลดสต็อก manual
- `dip_stock_adjust` -- ปรับจาก Dip Stock
- `initial_set` -- ตั้งค่าเริ่มต้น (migration)

```sql
CREATE TABLE IF NOT EXISTS wp_dinoco_stock_transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sku VARCHAR(50) NOT NULL,
    type ENUM('b2f_receive','b2b_shipped','b2b_cancel_return','manual_add','manual_subtract','dip_stock_adjust','initial_set') NOT NULL,
    qty_change INT NOT NULL,
    qty_before INT UNSIGNED NOT NULL DEFAULT 0,
    qty_after INT UNSIGNED NOT NULL DEFAULT 0,
    reference_type VARCHAR(30) DEFAULT NULL,
    reference_id BIGINT UNSIGNED DEFAULT NULL,
    reason VARCHAR(500) DEFAULT '',
    user_id BIGINT UNSIGNED DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_sku (sku),
    KEY idx_type (type),
    KEY idx_created (created_at),
    KEY idx_ref (reference_type, reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.3 NEW TABLE `dinoco_dip_stock` (Dip Stock Sessions)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| `session_date` | DATE NOT NULL | วันที่นับ |
| `status` | ENUM('in_progress','completed','expired') | สถานะ |
| `started_by` | BIGINT UNSIGNED | WP User ID |
| `completed_at` | DATETIME DEFAULT NULL | เวลาเสร็จ |
| `total_skus` | INT UNSIGNED DEFAULT 0 | จำนวน SKU ทั้งหมด |
| `counted_skus` | INT UNSIGNED DEFAULT 0 | จำนวน SKU ที่นับแล้ว |
| `adjusted_skus` | INT UNSIGNED DEFAULT 0 | จำนวน SKU ที่ปรับ |
| `notes` | TEXT DEFAULT NULL | หมายเหตุ |
| `created_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | |

### 3.4 NEW TABLE `dinoco_dip_stock_items` (Dip Stock per SKU)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| `dip_stock_id` | BIGINT UNSIGNED NOT NULL | FK → dinoco_dip_stock.id |
| `sku` | VARCHAR(50) NOT NULL | Product SKU |
| `expected_qty` | INT UNSIGNED NOT NULL | สต็อกในระบบ (snapshot) |
| `actual_qty` | INT UNSIGNED DEFAULT NULL | จำนวนนับจริง |
| `variance` | INT DEFAULT NULL | actual - expected |
| `variance_pct` | DECIMAL(5,2) DEFAULT NULL | % variance |
| `adjusted` | TINYINT(1) DEFAULT 0 | ปรับแล้ว? |
| `note` | VARCHAR(500) DEFAULT '' | หมายเหตุ per SKU |

```sql
CREATE TABLE IF NOT EXISTS wp_dinoco_dip_stock (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_date DATE NOT NULL,
    status ENUM('in_progress','completed','expired') DEFAULT 'in_progress',
    started_by BIGINT UNSIGNED DEFAULT NULL,
    completed_at DATETIME DEFAULT NULL,
    total_skus INT UNSIGNED DEFAULT 0,
    counted_skus INT UNSIGNED DEFAULT 0,
    adjusted_skus INT UNSIGNED DEFAULT 0,
    notes TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_status (status),
    KEY idx_date (session_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wp_dinoco_dip_stock_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    dip_stock_id BIGINT UNSIGNED NOT NULL,
    sku VARCHAR(50) NOT NULL,
    expected_qty INT UNSIGNED NOT NULL DEFAULT 0,
    actual_qty INT UNSIGNED DEFAULT NULL,
    variance INT DEFAULT NULL,
    variance_pct DECIMAL(5,2) DEFAULT NULL,
    adjusted TINYINT(1) DEFAULT 0,
    note VARCHAR(500) DEFAULT '',
    PRIMARY KEY (id),
    KEY idx_session (dip_stock_id),
    KEY idx_sku (sku),
    FOREIGN KEY (dip_stock_id) REFERENCES wp_dinoco_dip_stock(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.5 wp_options (Settings)

| Option Key | Type | Default | Description |
|------------|------|---------|-------------|
| `dinoco_inv_default_low_threshold` | int | 10 | Default low stock threshold |
| `dinoco_inv_default_reorder_point` | int | 5 | Default reorder point |
| `dinoco_inv_dip_stock_interval_days` | int | 30 | Dip Stock interval |
| `dinoco_inv_last_dip_stock_id` | int | 0 | Last dip stock session ID |
| `dinoco_inv_alert_enabled` | bool | true | Enable LINE alert |

### 3.6 ไม่สร้าง CPT ใหม่

ใช้ custom tables ทั้งหมด (เหมือน `dinoco_products`) เพราะ:
- Transaction log เป็น high-write → custom table performance ดีกว่า postmeta
- Dip stock เป็น tabular data → custom table เหมาะกว่า CPT
- ไม่ต้องการ WP admin UI สำหรับ data เหล่านี้

---

## 4. API Design

### 4.1 New REST Endpoints (namespace: `dinoco-inv/v1`)

> **หมายเหตุ**: ใช้ namespace `dinoco-inv/v1` ที่มีอยู่แล้ว (Manual Invoice System) ย้ายมาเป็น inventory namespace ใหม่ หรือสร้าง `dinoco-stock/v1` แยก

**แนะนำ: ใช้ namespace ใหม่ `dinoco-stock/v1`** เพื่อไม่ conflict กับ `dinoco-inv/v1` (Invoice)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/stock/list` | Admin | รายการสินค้า + stock_qty + status |
| GET | `/stock/detail/{sku}` | Admin | รายละเอียดสินค้า + transaction history |
| POST | `/stock/adjust` | Admin | Manual adjust (add/subtract) |
| POST | `/stock/bulk-adjust` | Admin | Bulk adjust หลาย SKU |
| GET | `/stock/transactions` | Admin | Transaction log (paginated, filterable) |
| POST | `/stock/settings` | Admin | Update settings (thresholds, alerts) |
| GET | `/stock/settings` | Admin | Get current settings |
| POST | `/dip-stock/start` | Admin | เริ่ม session นับสต็อก |
| GET | `/dip-stock/current` | Admin | ดึง session ที่กำลังนับ |
| POST | `/dip-stock/count` | Admin | บันทึกจำนวนนับ (batch) |
| POST | `/dip-stock/approve` | Admin | Approve adjustment |
| GET | `/dip-stock/history` | Admin | ประวัติ Dip Stock sessions |
| GET | `/dip-stock/report/{id}` | Admin | รายงาน variance |
| GET | `/stock/alerts` | Admin | Low stock + reorder alerts |
| GET | `/stock/export-csv` | Admin | Export stock data as CSV |
| **Backorder (BO)** | | | |
| GET | `/stock/bo-status` | Admin | สินค้าที่หมดสต็อก + ETA + PO ที่เกี่ยวข้อง |
| POST | `/stock/bo-update` | Admin | Update bo_eta_buffer_days / bo_eta_override / bo_note per SKU |
| GET | `/stock/bo-eta/{sku}` | Admin/Catalog | คำนวณ ETA จาก B2F PO (internal) |

### 4.2 Endpoint Details

#### `POST /dinoco-stock/v1/stock/adjust`
```
Request:
{
    "sku": "DNT-001",
    "type": "add" | "subtract",
    "qty": 50,
    "reason": "รับของจากซัพพลายเออร์รายย่อย"
}

Response (200):
{
    "success": true,
    "data": {
        "sku": "DNT-001",
        "qty_before": 100,
        "qty_after": 150,
        "stock_status": "in_stock",
        "transaction_id": 1234
    }
}

Error (400):
{
    "success": false,
    "message": "จำนวนลดเกินสต็อกปัจจุบัน (มี 30 ต้องการลด 50)",
    "data": { "current_qty": 30, "requested": 50 }
}
```

#### `GET /dinoco-stock/v1/stock/bo-status`
```
Response (200):
{
    "success": true,
    "data": [
        {
            "sku": "DNT-001",
            "product_name": "Crash Bar Pro Rally",
            "stock_qty": 0,
            "eta": "2026-04-15",          // คำนวณแล้ว (priority: override > PO+buffer > legacy > null)
            "eta_source": "po_calculated", // "manual_override" | "po_calculated" | "legacy_oos" | null
            "po_number": "PO-DNC-260401-001",
            "po_status": "confirmed",
            "po_expected_date": "2026-04-12",
            "bo_eta_buffer_days": 3,
            "bo_eta_override": null,
            "bo_note": "รอของจากจีน ล็อต 2",
            "days_out_of_stock": 5
        }
    ]
}
```

#### `POST /dinoco-stock/v1/stock/bo-update`
```
Request:
{
    "sku": "DNT-001",
    "bo_eta_buffer_days": 3,          // optional — วัน buffer เพิ่มจาก PO ETA
    "bo_eta_override": "2026-04-20",  // optional — override ETA ตรงๆ (null = ลบ override)
    "bo_note": "รอของจากจีน ล็อต 2"   // optional
}

Response (200):
{
    "success": true,
    "sku": "DNT-001",
    "new_eta": "2026-04-20",
    "eta_source": "manual_override"
}
```

#### **ETA Calculation Logic** (ใช้ภายใน — `dinoco_calculate_bo_eta($sku)`)
```php
function dinoco_calculate_bo_eta($sku) {
    $product = DINOCO_Catalog::get_by_sku($sku);
    
    // Priority 1: Admin override
    if (!empty($product['bo_eta_override'])) {
        return ['eta' => $product['bo_eta_override'], 'source' => 'manual_override'];
    }
    
    // Priority 2: คำนวณจาก B2F PO ที่ active
    // หา PO ที่มี SKU นี้ + status IN (submitted, confirmed, delivering, partial_received)
    // เรียง po_expected_date ASC → ใช้ PO ที่เร็วที่สุด
    $po = dinoco_find_earliest_po_for_sku($sku);
    if ($po && !empty($po['expected_date'])) {
        $buffer = intval($product['bo_eta_buffer_days'] ?: 0);
        $eta = date('Y-m-d', strtotime($po['expected_date'] . " +{$buffer} days"));
        return ['eta' => $eta, 'source' => 'po_calculated', 'po_number' => $po['po_number']];
    }
    
    // Priority 3: Legacy oos_eta_date (ถ้ามี)
    if (!empty($product['oos_eta_date'])) {
        return ['eta' => $product['oos_eta_date'], 'source' => 'legacy_oos'];
    }
    
    // Priority 4: ไม่มี ETA
    return ['eta' => null, 'source' => null];
}
```

#### `POST /dinoco-stock/v1/dip-stock/start`
```
Request: {} (no body needed)

Response (200):
{
    "success": true,
    "data": {
        "session_id": 5,
        "session_date": "2026-04-04",
        "total_skus": 45,
        "items": [
            { "sku": "DNT-001", "name": "...", "image": "...", "expected_qty": 150 },
            ...
        ]
    }
}

Error (409):
{
    "success": false,
    "message": "มีการนับสต็อกค้างอยู่ (เริ่ม 2026-04-02) กรุณาดำเนินการให้เสร็จก่อน"
}
```

#### `POST /dinoco-stock/v1/dip-stock/count`
```
Request:
{
    "session_id": 5,
    "items": [
        { "sku": "DNT-001", "actual_qty": 148, "note": "" },
        { "sku": "DNT-002", "actual_qty": 0, "note": "ไม่พบสินค้า" }
    ]
}

Response (200):
{
    "success": true,
    "data": {
        "counted": 2,
        "total_counted": 15,
        "remaining": 30,
        "variances": [
            { "sku": "DNT-001", "expected": 150, "actual": 148, "variance": -2, "pct": -1.33 },
            { "sku": "DNT-002", "expected": 25, "actual": 0, "variance": -25, "pct": -100 }
        ]
    }
}
```

### 4.3 Modified Existing Endpoints

#### `GET /b2b/v1/catalog` (Snippet 3)
**เพิ่ม** `stock_display` field ใน response:
```
{
    "sku": "DNT-001",
    "name": "...",
    "stock_status": "in_stock",        // เดิม (backward compat)
    "stock_display": "low_stock",       // NEW: in_stock | low_stock | out_of_stock
    "oos_eta": null,
    ...
}
```
Logic: ถ้า `stock_qty > low_stock_threshold` → `in_stock`, ถ้า `stock_qty > 0 && <= threshold` → `low_stock`, ถ้า `stock_qty = 0` → `out_of_stock`

**สำคัญ**: ห้ามส่ง `stock_qty` ใน distributor-facing endpoint

#### `POST /b2f/v1/receive-goods` (Snippet 2)
**เพิ่ม** stock update logic หลัง existing code (line ~2731):
```php
// [EXISTING] DINOCO_Catalog::set_stock_status( $sku, 'in_stock' );
// [NEW] dinoco_stock_add( $sku, $qty, 'b2f_receive', 'b2f_receiving', $rcv_id );
```

### 4.4 Internal PHP Functions (Core Library)

```php
// Stock Operations (atomic, logged)
dinoco_stock_add( $sku, $qty, $type, $ref_type = null, $ref_id = null, $reason = '' )
dinoco_stock_subtract( $sku, $qty, $type, $ref_type = null, $ref_id = null, $reason = '' )
dinoco_stock_set( $sku, $qty, $type, $ref_type = null, $ref_id = null, $reason = '' )
dinoco_stock_get( $sku )  // returns ['qty' => int, 'status' => string, 'threshold' => int]

// Auto status update
dinoco_stock_auto_status( $sku )  // recalculate stock_status from stock_qty + threshold

// Recalculate (source of truth)
dinoco_stock_recalculate( $sku )  // SUM all transactions for SKU
```

**Atomic operation pattern** (เหมือน `b2b_debt_add/subtract`):
```php
function dinoco_stock_add( $sku, $qty, $type, $ref_type = null, $ref_id = null, $reason = '' ) {
    global $wpdb;
    $table_products = $wpdb->prefix . 'dinoco_products';
    $table_txn      = $wpdb->prefix . 'dinoco_stock_transactions';

    $wpdb->query( 'START TRANSACTION' );
    
    // Lock row
    $current = $wpdb->get_row( $wpdb->prepare(
        "SELECT stock_qty FROM {$table_products} WHERE sku = %s FOR UPDATE", $sku
    ) );
    
    if ( ! $current ) {
        $wpdb->query( 'ROLLBACK' );
        return new WP_Error( 'sku_not_found', "SKU {$sku} not found" );
    }
    
    $qty_before = (int) $current->stock_qty;
    $qty_after  = $qty_before + (int) $qty;
    if ( $qty_after < 0 ) $qty_after = 0;
    
    // Update stock
    $wpdb->update( $table_products, 
        [ 'stock_qty' => $qty_after ], 
        [ 'sku' => $sku ] 
    );
    
    // Log transaction
    $wpdb->insert( $table_txn, [
        'sku'            => $sku,
        'type'           => $type,
        'qty_change'     => (int) $qty,
        'qty_before'     => $qty_before,
        'qty_after'      => $qty_after,
        'reference_type' => $ref_type,
        'reference_id'   => $ref_id,
        'reason'         => $reason,
        'user_id'        => get_current_user_id(),
    ] );
    
    $wpdb->query( 'COMMIT' );
    
    // Auto-update stock_status (outside transaction)
    dinoco_stock_auto_status( $sku );
    
    return [ 'qty_before' => $qty_before, 'qty_after' => $qty_after ];
}
```

### 4.5 Permissions

| Endpoint Group | Permission |
|----------------|------------|
| `/stock/*` | `current_user_can('manage_options')` (Admin WP) |
| `/dip-stock/*` | `current_user_can('manage_options')` (Admin WP) |
| B2F receive-goods stock update | Existing B2F admin auth |
| B2B shipped stock deduction | Hook (server-side, no auth needed) |

### 4.6 Rate Limiting

| Endpoint | Limit |
|----------|-------|
| `POST /stock/adjust` | 60 req/min per user |
| `POST /stock/bulk-adjust` | 10 req/min per user |
| `POST /dip-stock/count` | 30 req/min per user |
| `GET /stock/export-csv` | 5 req/min per user |

### 4.7 LINE Notifications

| Event | Target | Message |
|-------|--------|---------|
| Low stock alert | Admin Group | Flex: "สินค้าใกล้หมด" + SKU + จำนวนเหลือ + ปุ่มดูรายละเอียด |
| Out of stock | Admin Group | Flex: "สินค้าหมด!" + SKU + ปุ่มสั่งผลิต (link B2F) |
| Dip Stock reminder (30 วัน) | Admin Group | Text: "ครบกำหนดนับสต็อก กรุณานับสต็อกภายใน 3 วัน" |
| Dip Stock variance > 10% | Admin Group | Flex: "พบ variance สูง" + รายการ SKU + % |

### 4.8 Cron Jobs

| Hook | Schedule | Description |
|------|----------|-------------|
| `dinoco_stock_low_alert_cron` | Daily 08:00 | ตรวจ low stock + reorder point → alert |
| `dinoco_dip_stock_reminder_cron` | Daily 09:00 | เช็คว่าครบ 30 วันต้องนับ → alert |
| `dinoco_dip_stock_expire_cron` | Daily 00:00 | Expire sessions ค้าง > 48 ชม. |
| `dinoco_stock_auto_status_cron` | Every 6 hours | Reconcile stock_status กับ stock_qty ทุก SKU |

---

## 5. UI Wireframes

### 5.1 Inventory Dashboard Tab (เพิ่มใน Admin Dashboard)

**Location**: เพิ่มเป็น tab ใน `[dinoco_admin_dashboard]` sidebar (เหมือน B2F tabs)

**Layout** (mobile-first):
```
+------------------------------------------+
| [Inventory Icon] คลังสินค้า              |
+------------------------------------------+
| KPI Cards (2x2 grid)                     |
| +------------------+ +------------------+ |
| | สินค้าทั้งหมด    | | มีสต็อก          | |
| | 45 รายการ        | | 38 รายการ        | |
| +------------------+ +------------------+ |
| +------------------+ +------------------+ |
| | ใกล้หมด          | | หมดสต็อก         | |
| | 5 รายการ (เหลือง) | | 2 รายการ (แดง)   | |
| +------------------+ +------------------+ |
+------------------------------------------+
| [ค้นหา SKU / ชื่อสินค้า...] [ค้นหา]     |
| Filter: [ทั้งหมด|มีสต็อก|ใกล้หมด|หมด]   |
+------------------------------------------+
| Product Stock Table                      |
| +------+--------+------+--------+------+ |
| | รูป  | SKU    | ชื่อ | สต็อก  | สถานะ| |
| +------+--------+------+--------+------+ |
| | [img] | DNT-001| ...  | 150    | [OK] | |
| | [img] | DNT-002| ...  | 8      | [!!] | |
| | [img] | DNT-003| ...  | 0      | [X]  | |
| +------+--------+------+--------+------+ |
| [< 1 2 3 >]                             |
+------------------------------------------+
| Action Buttons (sticky bottom)           |
| [+ ปรับสต็อก] [นับสต็อก] [Export CSV]    |
+------------------------------------------+
```

**Status Badges**:
- `in_stock` → badge สีเขียว "มีสินค้า"
- `low_stock` → badge สีเหลือง "ใกล้หมด"
- `out_of_stock` → badge สีแดง "สินค้าหมด"

**Touch targets**: ปุ่มทั้งหมด min 44px height, table rows tappable เพื่อเปิด detail

### 5.2 Stock Adjustment Modal

```
+------------------------------------------+
| ปรับสต็อก                         [X]    |
+------------------------------------------+
| สินค้า: [Autocomplete SKU / ชื่อ]        |
|                                          |
| [img] DNT-001 - ชื่อสินค้า               |
| สต็อกปัจจุบัน: 150 ชิ้น                  |
|                                          |
| ประเภท: (o) เพิ่มสต็อก  ( ) ลดสต็อก     |
|                                          |
| จำนวน: [________] ชิ้น                   |
|                                          |
| สต็อกหลังปรับ: 200 ชิ้น  (คำนวณ realtime)|
|                                          |
| เหตุผล: [________________________]       |
|         (จำเป็น)                         |
|                                          |
| [ยกเลิก]              [บันทึก]          |
+------------------------------------------+
```

**States**:
- **Loading**: Skeleton placeholder สำหรับ product info
- **Error**: แถบแดงด้านบน modal พร้อมข้อความ
- **Success**: Toast "บันทึกสำเร็จ" + ปิด modal + refresh table
- **Confirm**: ถ้าลดจนเหลือ 0 → SweetAlert "สต็อกจะเป็น 0 สินค้าจะแสดงเป็นหมดสต็อก"

### 5.3 Stock Detail Panel (กดจาก table row)

```
+------------------------------------------+
| < กลับ         DNT-001                   |
+------------------------------------------+
| [product image]                          |
| ชื่อ: สินค้า XYZ                          |
| หมวด: Engine Parts                       |
+------------------------------------------+
| สต็อก          | Threshold               |
| 150 ชิ้น       | Low: 10 | Reorder: 5    |
| [แก้ไข Threshold]                        |
+------------------------------------------+
| ประวัติเคลื่อนไหว (ล่าสุด 20 รายการ)      |
| +------+------+-----+------+-----------+ |
| | วัน  | ประเภท| +/- | หลัง | อ้างอิง    | |
| +------+------+-----+------+-----------+ |
| | 4/4  | B2F   | +50 | 150  | RCV-0012  | |
| | 3/4  | B2B   | -5  | 100  | ORD-456   | |
| | 2/4  | Manual| +10 | 105  | Admin     | |
| +------+------+-----+------+-----------+ |
| [ดูทั้งหมด]                              |
+------------------------------------------+
| Dip Stock ล่าสุด                          |
| นับเมื่อ: 5 มี.ค. 2026                    |
| ผลนับ: 148 (variance: -2, -1.3%)         |
+------------------------------------------+
```

### 5.4 Dip Stock Page

```
+------------------------------------------+
| นับสต็อก (Dip Stock)                      |
+------------------------------------------+
| Session: 2026-04-04 | สถานะ: กำลังนับ     |
| นับแล้ว: 15/45 SKU                       |
| [=========>         ] 33%                |
+------------------------------------------+
| [ค้นหา SKU...]                           |
| Filter: [ทั้งหมด|ยังไม่นับ|นับแล้ว|มีส่วนต่าง] |
+------------------------------------------+
| SKU List (card layout, mobile-friendly)   |
|                                          |
| +--------------------------------------+ |
| | [img] DNT-001 - ชื่อสินค้า            | |
| | ในระบบ: 150                           | |
| | นับจริง: [_____] ชิ้น                  | |
| | [บันทึก]                              | |
| +--------------------------------------+ |
|                                          |
| +--------------------------------------+ |
| | [img] DNT-002 - ชื่อสินค้า (นับแล้ว)   | |
| | ในระบบ: 100 | นับจริง: 98             | |
| | ส่วนต่าง: -2 (-2.0%) [เหลือง]         | |
| | หมายเหตุ: [____________]              | |
| +--------------------------------------+ |
+------------------------------------------+
| [บันทึกทั้งหมด]                          |
+------------------------------------------+

--- After counting complete ---

+------------------------------------------+
| สรุปผลนับสต็อก                            |
+------------------------------------------+
| วันที่: 2026-04-04                        |
| นับทั้งหมด: 45 SKU                       |
+------------------------------------------+
| ส่วนต่างสูง (>5%)              3 รายการ   |
| [แดง] DNT-003: ระบบ 25, จริง 10 (-60%)  |
| [แดง] DNT-015: ระบบ 50, จริง 40 (-20%)  |
| [แดง] DNT-022: ระบบ 0, จริง 8 (+N/A%)   |
|                                          |
| ส่วนต่างเล็กน้อย (1-5%)        5 รายการ   |
| [เหลือง] DNT-001: ระบบ 150, จริง 148     |
| ...                                      |
|                                          |
| ตรงกัน (0%)                    37 รายการ  |
+------------------------------------------+
| [ ] เลือกทั้งหมดที่มีส่วนต่าง             |
| [ปรับสต็อกตามผลนับ]                      |
+------------------------------------------+
```

### 5.5 B2B Catalog Stock Badge (Distributor View)

```
Existing product card + NEW badge:

+----------------------------+
| [product image]            |
| ชื่อสินค้า XYZ              |
| ฿1,200                     |
| [มีสินค้า]  ← badge เขียว   |
|           หรือ              |
| [ใกล้หมด]  ← badge เหลือง   |
|           หรือ              |
| [สินค้าหมด] ← badge แดง    |
| คาดว่ามี: 15 เม.ย. 2026    |
| [ปุ่มสั่งซื้อ disabled]     |
+----------------------------+
```

---

## 6. Dependencies & Impact

### Files ที่ต้องแก้ไข

```
[B2B] Snippet 15: Custom Tables & JWT Session (DB_ID: 1039)
├── ALTER TABLE dinoco_products เพิ่ม stock_qty, low_stock_threshold, reorder_point columns
├── DINOCO_Catalog class: เพิ่ม method stock_add(), stock_subtract(), stock_get()
├── CREATE TABLE dinoco_stock_transactions, dinoco_dip_stock, dinoco_dip_stock_items
└── Migration: set stock_qty = 0 สำหรับ existing products

[B2F] Snippet 2: REST API (DB_ID: 1165)
├── b2f_rest_receive_goods(): เพิ่ม dinoco_stock_add() หลัง set_stock_status (line ~2731)
└── ยังคง set_stock_status เดิมไว้ (backward compat) + เพิ่ม qty logic

[B2B] Snippet 2: LINE Webhook Gateway & Order Creator (DB_ID: 51)
├── Hook b2b_order_status_changed: เพิ่ม stock deduction เมื่อ shipped
└── Walk-in cancel: เพิ่ม stock return

[B2B] Snippet 3: LIFF E-Catalog REST API (DB_ID: 52)
├── GET /catalog: เพิ่ม stock_display field (ไม่ส่ง qty)
└── stock_display logic based on stock_qty + threshold

[B2B] Snippet 4: LIFF E-Catalog Frontend (DB_ID: 53)
├── Product card: เพิ่ม stock badge UI (เขียว/เหลือง/แดง)
└── Out of stock: disable order button + แสดง ETA

[Admin System] DINOCO Global Inventory Database (DB_ID: 22)
├── เพิ่ม Stock Management tab (qty view, adjust, transaction log)
├── เพิ่ม Dip Stock page
└── แก้ไข existing stock toggle → integrate กับ qty system

[Admin System] DINOCO Admin Dashboard (DB_ID: 21)
├── Sidebar: เพิ่ม "คลังสินค้า" menu item (link ไป Inventory page)
└── KPI: เพิ่ม low stock count ใน overview (optional)

[System] DINOCO MCP Bridge (DB_ID: 1050)
├── /inventory-changed: implement logic (ส่ง stock update event)
└── /product-lookup: เพิ่ม stock_display (ไม่ส่ง qty)
```

### Files ที่ต้องสร้างใหม่

```
[Admin System] DINOCO Stock Manager (NEW, ต้อง assign DB_ID)
├── Shortcode: [dinoco_admin_stock]
├── REST endpoints: /dinoco-stock/v1/*
├── Stock core functions: dinoco_stock_add/subtract/set/get/recalculate
├── Dip Stock functions
├── Cron jobs: low alert, dip reminder, expire, reconcile
└── UI: Stock dashboard, adjust modal, dip stock page, transaction log
```

> **Alternative**: แทนที่จะสร้างไฟล์ใหม่ อาจเพิ่มลงใน `[Admin System] DINOCO Global Inventory Database` (DB_ID: 22) ที่มีอยู่แล้ว เพราะเป็น Inventory module อยู่แล้ว แต่ไฟล์จะใหญ่มาก
>
> **แนะนำ**: แยกเป็น 2 ไฟล์ใหม่:
> 1. `[Admin System] Stock Core Functions` -- PHP functions + REST API + Cron (backend only)
> 2. เพิ่ม UI ลงใน DB_ID: 22 (Inventory Database) ที่มีอยู่

### Dependencies ที่ต้องมีก่อน

```
1. ALTER TABLE dinoco_products ต้องรันก่อน (Phase 1 Task 1)
2. CREATE TABLE stock_transactions + dip_stock ต้องรันก่อน
3. Migration: set stock_qty = 0 ทุก existing product
4. ต้องมี stock_qty ก่อนแก้ B2F receive + B2B shipped hooks
```

### Side Effects ที่ต้องระวัง

```
Performance:
├── stock_transactions table จะโตเร็ว → ต้อง index ดี + archive policy (>1 ปี)
├── B2F receive-goods + B2B shipped เพิ่ม 2 queries (SELECT FOR UPDATE + INSERT txn)
│   → ยอมรับได้ (เหมือน debt system)
├── Dip stock snapshot ทุก SKU → 1 query ดี (batch insert)
└── Catalog endpoint เพิ่ม stock_qty lookup → ใช้ JOIN เดียวกับ existing query

CSS:
├── Stock badge styles ต้อง scope ด้วย .dinoco-stock-* prefix
├── ไม่ conflict กับ B2B/B2F/LIFF AI (ใช้ prefix)
└── Modal ใช้ SweetAlert2 เหมือน modules อื่น

JavaScript:
├── Global scope: ใช้ IIFE wrap ทุก function
├── setTimeout gotcha: ใช้ origSetTimeout ถ้าอยู่ใน Admin Dashboard
└── ไม่สร้าง global variable

LINE Push Quota:
├── Low stock alert: max ~5 msg/day (ถ้ามี 5 SKU low stock)
├── Dip stock reminder: 1 msg/30 วัน
└── ไม่กระทบ quota ปกติ (B2B+B2F ใช้ ~100-200 msg/day)

Database:
├── FOR UPDATE lock ใน stock operations → short lock duration (~10ms)
├── ไม่ block B2B/B2F transactions (คนละ table)
└── dinoco_stock_transactions: ~500-1000 rows/month (manageable)
```

---

## 7. Implementation Roadmap

### Phase 1: MVP -- Stock Quantity Foundation (5-7 วัน)

```
Task 1.1: Database Migration
├── ALTER TABLE dinoco_products เพิ่ม columns
├── CREATE TABLE dinoco_stock_transactions
├── Migration: set stock_qty = 0 ทุก product
├── ไฟล์: [B2B] Snippet 15
└── เวลา: 0.5 วัน

Task 1.2: Stock Core Functions
├── dinoco_stock_add(), dinoco_stock_subtract(), dinoco_stock_set()
├── dinoco_stock_get(), dinoco_stock_auto_status()
├── dinoco_stock_recalculate()
├── Atomic operations with FOR UPDATE lock
├── ไฟล์: NEW [Admin System] Stock Core Functions
└── เวลา: 1.5 วัน

Task 1.3: B2F Receive → Auto Stock Add
├── แก้ b2f_rest_receive_goods() เพิ่ม dinoco_stock_add()
├── ไฟล์: [B2F] Snippet 2
└── เวลา: 0.5 วัน

Task 1.4: B2B Shipped → Auto Stock Deduct
├── Hook b2b_order_status_changed → stock deduction
├── Walk-in cancel → stock return
├── ไฟล์: [B2B] Snippet 2
└── เวลา: 1 วัน

Task 1.5: Admin Stock View (Basic)
├── Stock list table + qty display
├── Manual adjust modal
├── Transaction log view
├── REST endpoints: /stock/list, /stock/adjust, /stock/transactions
├── ไฟล์: [Admin System] DINOCO Global Inventory Database (DB_ID: 22)
└── เวลา: 2 วัน

Task 1.6: Auto stock_status Update
├── stock_qty → auto set in_stock / low_stock / out_of_stock
├── Threshold settings (per product + global default)
├── ไฟล์: Stock Core Functions
└── เวลา: 0.5 วัน

Deploy Phase 1 → Test:
├── Admin สามารถดูจำนวนสต็อก + ปรับ manual ได้
├── B2F receive → สต็อกเพิ่มอัตโนมัติ
├── B2B shipped → สต็อกลดอัตโนมัติ
├── Transaction log บันทึกทุกการเคลื่อนไหว
└── stock_status auto-update ตาม threshold
```

### Phase 2: Distributor View + Alerts (3-4 วัน)

```
Task 2.1: B2B Catalog stock_display
├── แก้ GET /b2b/v1/catalog เพิ่ม stock_display
├── ไฟล์: [B2B] Snippet 3
└── เวลา: 0.5 วัน

Task 2.2: LIFF E-Catalog Stock Badge
├── Product card: เขียว/เหลือง/แดง badge
├── Out of stock: disable + ETA
├── ไฟล์: [B2B] Snippet 4
└── เวลา: 1 วัน

Task 2.3: LINE Low Stock Alerts
├── Cron job: ตรวจ low stock ทุกวัน 08:00
├── Flex message → Admin group
├── ไฟล์: Stock Core Functions (cron section)
└── เวลา: 1 วัน

Task 2.4: MCP Bridge Integration
├── /product-lookup: เพิ่ม stock_display
├── /inventory-changed: implement webhook logic
├── ไฟล์: [System] DINOCO MCP Bridge
└── เวลา: 0.5 วัน

Task 2.5: Stock Settings UI
├── Global threshold defaults
├── Per-product threshold override
├── Alert toggle
├── ไฟล์: [Admin System] DINOCO Global Inventory Database
└── เวลา: 1 วัน

Deploy Phase 2 → Test:
├── ตัวแทนเห็น badge เขียว/เหลือง/แดง (ไม่เห็น qty)
├── Admin ได้ LINE alert เมื่อสินค้าใกล้หมด
├── Chatbot ตอบสถานะสต็อกได้ (ผ่าน MCP)
└── Settings ปรับ threshold ได้
```

### Phase 3: Dip Stock + Polish (4-5 วัน)

```
Task 3.1: Dip Stock Database
├── CREATE TABLE dinoco_dip_stock + dinoco_dip_stock_items
├── ไฟล์: [B2B] Snippet 15
└── เวลา: 0.5 วัน

Task 3.2: Dip Stock REST API
├── /dip-stock/start, /current, /count, /approve, /history, /report
├── ไฟล์: Stock Core Functions
└── เวลา: 1.5 วัน

Task 3.3: Dip Stock UI
├── Start session → count form → variance report → approve
├── Card layout (mobile-friendly)
├── Progress bar + filter
├── ไฟล์: [Admin System] DINOCO Global Inventory Database
└── เวลา: 2 วัน

Task 3.4: Dip Stock Cron
├── 30-day reminder
├── Expire stuck sessions
├── ไฟล์: Stock Core Functions
└── เวลา: 0.5 วัน

Task 3.5: Export CSV + Bulk Operations
├── Stock export CSV
├── Bulk adjust (import CSV)
├── ไฟล์: Stock Core Functions + UI
└── เวลา: 1 วัน

Deploy Phase 3 → Test:
├── Admin นับสต็อกผ่านระบบได้
├── Variance report แสดงส่วนต่าง
├── Approve → ปรับสต็อกอัตโนมัติ
├── 30-day reminder ทำงาน
└── Export/Import CSV ทำงาน
```

### Phase 4: Reserved Qty + Reorder Alert + AI Stock Query (3-4 วัน)

```
Task 4.1: Reserved Quantity (computed — ไม่เก็บ field แยก)
├── SQL: SUM(order_items.qty) WHERE status IN 
│   (checking_stock, awaiting_confirm, awaiting_payment, paid, packed)
├── dinoco_get_reserved_qty($sku) → computed realtime
├── available_qty = stock_qty - reserved_qty
├── Distributor badge ใช้ available_qty แทน stock_qty
├── Admin เห็นทั้ง stock_qty + reserved_qty + available_qty
├── ไฟล์: Stock Core Functions + Catalog API
└── เวลา: 1 วัน

Task 4.2: Cancel → ปลด Reserve
├── Cancel ก่อน shipped → reserved_qty ลดลงอัตโนมัติ (computed, ไม่ต้องทำอะไร)
├── Cancel หลัง shipped (walk-in only) → dinoco_stock_add() คืนสต็อก
├── ไฟล์: [B2B] Snippet 2
└── เวลา: 0.5 วัน

Task 4.3: Reorder Point Alert + Suggest PO Link
├── Threshold: reorder_point field (per SKU, Admin ตั้งเอง)
├── Cron daily: ตรวจ available_qty <= reorder_point
├── LINE Flex → Admin group:
│   "⚠️ SKU-001 เหลือ 5 ชิ้น (reorder point: 10)"
│   [ปุ่ม: สั่งผลิต] → เปิด B2F catalog LIFF pre-filled SKU
├── ไม่ auto-create PO (ต้องมีคนตัดสินใจ)
├── ไฟล์: Stock Core + Cron + Flex Builder
└── เวลา: 1 วัน

Task 4.4: AI Chatbot Stock Query (OpenClaw integration)
├── เพิ่ม tool: "check_stock_status" ใน dinoco-tools.js
│   Input: { sku or product_name }
│   Output: { stock_display, eta, bo_note } (ไม่ส่ง stock_qty!)
├── AI ตอบได้:
│   "มีของไหม?" → "สินค้า X มีสินค้า / ใกล้หมด / หมด"
│   "เมื่อไหร่จะมี?" → "คาดว่าจะมีของ DD/MM/YYYY" (BO ETA)
│   "มีกี่ชิ้น?" → "ขออภัย ไม่สามารถแจ้งจำนวนสต็อกได้"
├── MCP Bridge /product-lookup เพิ่ม stock_display + eta
├── ไฟล์: openclawminicrm/proxy/dinoco-tools.js + [System] MCP Bridge
└── เวลา: 1 วัน

Deploy Phase 4 → Test:
├── สั่ง 8 จาก 10 → available = 2 → "ใกล้หมด"
├── Cancel → available กลับ 10
├── Reorder alert push LINE เมื่อถึง threshold
├── AI bot ตอบ stock + ETA ได้ ไม่หลุดตัวเลข
└── Walk-in cancel → คืนสต็อก
```

### Phase 5: Multi-Warehouse + Valuation + Forecasting (5-7 วัน)

```
Task 5.1: Multi-Warehouse Data Model
├── CREATE TABLE dinoco_warehouses
│   (id, name, code, address, is_default, is_active, created_at)
├── ALTER TABLE dinoco_stock_transactions ADD warehouse_id
├── CREATE TABLE dinoco_warehouse_stock
│   (id, warehouse_id, sku, stock_qty, reserved_qty,
│    low_stock_threshold, reorder_point, updated_at)
│   UNIQUE KEY (warehouse_id, sku)
├── Migration: สร้าง "โกดังหลัก" (default) + ย้าย stock_qty เข้า
├── ไฟล์: [B2B] Snippet 15
└── เวลา: 1 วัน

Task 5.2: Multi-Warehouse Core Functions
├── dinoco_stock_add/subtract() เพิ่ม $warehouse_id (default = primary)
├── dinoco_get_total_stock($sku) = SUM across warehouses
├── dinoco_get_warehouse_stock($sku, $warehouse_id)
├── dinoco_transfer_stock($sku, $from_wh, $to_wh, $qty)
│   → ตัด source + เพิ่ม dest + log 2 transactions
├── stock_display ใช้ total stock (รวมทุกคลัง)
├── B2B ship → ตัดจาก warehouse ที่ Admin เลือก (หรือ default)
├── B2F receive → เพิ่มที่ warehouse ที่ Admin เลือก (หรือ default)
├── ไฟล์: Stock Core Functions
└── เวลา: 1.5 วัน

Task 5.3: Multi-Warehouse Admin UI
├── Tab "คลังสินค้า" → CRUD (ชื่อ, code, ที่อยู่, สถานะ)
├── Stock table: filter by warehouse
├── Stock adjust: dropdown เลือก warehouse
├── Transfer modal: จาก [A] → ไป [B] จำนวน [__]
├── Dip Stock: เลือก warehouse ที่จะนับ
├── ไฟล์: [Admin System] DINOCO Global Inventory Database
└── เวลา: 2 วัน

Task 5.4: Inventory Valuation (Weighted Average)
├── เก็บ unit_cost ใน dinoco_stock_transactions (ตอน B2F receive)
├── weighted_avg_cost = total_cost / total_qty received
├── Multi-currency → ใช้ THB (B2F มี po_exchange_rate อยู่แล้ว)
├── Admin Dashboard card: "มูลค่าสินค้าคงเหลือ: ฿X,XXX,XXX"
├── Report: SKU | qty | avg_cost | total_value
├── ไฟล์: Stock Core + Finance Dashboard
└── เวลา: 1.5 วัน

Task 5.5: Stock Forecasting (Basic)
├── avg_daily_usage = SUM(shipped qty) / days (30/60/90 วัน)
├── Days of Stock = stock_qty / avg_daily_usage
├── Suggest: "ควรสั่ง X ชิ้น ภายใน Y วัน"
│   (buffer = stock_qty - lead_time_days × avg_daily_usage)
├── Dashboard card: "สินค้าที่จะหมดใน 7 วัน"
├── ต้องมี data อย่างน้อย 30 วันก่อน forecast ได้
├── ไฟล์: Stock Core + Cron
└── เวลา: 1 วัน

Task 5.6: Barcode / QR (Optional shortcut)
├── Admin scan barcode → lookup SKU → เปิดฟอร์ม stock adjust/dip stock
├── ใช้ camera API + JS barcode library (quagga2 / html5-qrcode)
├── ไม่บังคับ — manual input ยังใช้ได้เหมือนเดิม
├── ไฟล์: [Admin System] DINOCO Global Inventory Database
└── เวลา: 1 วัน (optional)

Deploy Phase 5 → Test:
├── สร้าง 2 warehouses → stock แยกคลัง
├── โอนสต็อกระหว่างคลัง → ตัวเลขถูกทั้ง 2 ฝั่ง
├── B2F receive เลือก warehouse → เข้าถูกคลัง
├── Valuation report มูลค่าถูกต้อง (THB)
├── Forecast "หมดใน X วัน" ตรง ± 20%
└── Barcode scan → เปิดฟอร์มถูก SKU
```

---

## 7.5 Design Decisions (จาก Code Review)

### DD-1: Single Source of Truth → Custom Table + Dual-Write Transition

**ตัดสินใจ**: `dinoco_products` custom table เป็น source of truth

**ปัญหาเดิม**: `stock_status` เก็บ 2 ที่ — custom table + ACF postmeta บน `b2b_product` CPT — ไม่ sync กัน

**วิธีแก้**:
```
Phase 1: Dual-write (เขียนทั้ง 2 ที่)
├── dinoco_stock_add/subtract() → update custom table + sync postmeta
├── b2b_mark_product_oos() → แก้ให้ update custom table ด้วย
├── b2b_unlock_product_oos() → แก้ให้ update custom table ด้วย
└── ทุกจุดที่อ่าน stock_status → อ่านจาก custom table เป็นหลัก

Phase 2+: ค่อยๆ ลบ postmeta reads
├── E-Catalog (Snippet 3:290) → ย้ายอ่าน custom table
├── Admin Control Panel (Snippet 9) → ย้ายอ่าน custom table
└── เมื่อ stable → deprecate postmeta stock_status (ไม่ลบ แค่ไม่อ่าน)
```

**Files ที่ต้องแก้** (Phase 1):
- `[B2B] Snippet 1` → `b2b_mark_product_oos()`, `b2b_unlock_product_oos()` เพิ่ม custom table write
- `[B2B] Snippet 3` → `b2b_get_sku_data_map()` เปลี่ยนอ่าน custom table
- `[B2B] Snippet 15` → `DINOCO_Catalog::set_stock_status()` เพิ่ม postmeta sync
- Stock Core Functions (ใหม่) → `dinoco_stock_add/subtract()` dual-write

### DD-2: OOS Memory → ยกเลิก ใช้ qty-based + Manual Hold Flag แทน

**ตัดสินใจ**: Deprecate OOS Memory System (oos_timestamp + oos_duration_hours + oos_eta_date)

**แทนที่ด้วย**:
```
stock_qty = 0              → auto out_of_stock
stock_qty > 0 + hold=false → auto in_stock (หรือ low_stock)
stock_qty > 0 + hold=true  → manual_hold (Admin ล็อกเอง เช่น ของเสีย/รอ QC)

Fields ใหม่ใน dinoco_products:
├── manual_hold (TINYINT 0/1) — Admin กดล็อก แม้ qty > 0
├── manual_hold_reason (VARCHAR 255) — เหตุผล เช่น "รอ QC" "ของชำรุด"
└── manual_hold_by (INT) — Admin user ID ที่กด

auto_status logic:
├── ถ้า manual_hold = 1 → stock_status = 'out_of_stock' (ข้ามทุกอย่าง)
├── ถ้า stock_qty = 0 → stock_status = 'out_of_stock'
├── ถ้า stock_qty <= threshold → stock_display = 'low_stock'
└── ถ้า stock_qty > threshold → stock_status = 'in_stock'

BO ETA:
├── เดิม: oos_eta_date (กรอก manual)
└── ใหม่: คำนวณจาก B2F PO + buffer days (DD ใน section 2.6)
```

**Migration**:
```
1. SKU ที่เป็น out_of_stock + oos_duration_hours > 0 → set manual_hold = 1 + reason = "migrated from OOS timer"
2. oos_eta_date → copy ไป bo_eta_override (ถ้ามี)
3. ปิด b2b_oos_expiry_check cron
4. ลบ inline auto-expire ใน Catalog endpoint (Snippet 3:422-433)
```

### DD-3: Deploy Safety → ปิด auto_status_cron จนกว่า Dip Stock แรกเสร็จ

**ตัดสินใจ**: ใช้ flag `dinoco_inv_initialized` (wp_option)

```
ขั้นตอน:
1. Deploy Phase 1: stock_qty = 0 ทุกตัว + auto_status_cron ตรวจ flag ก่อนรัน
2. ถ้า dinoco_inv_initialized = false → cron skip ไม่แก้ stock_status
3. Admin ทำ Dip Stock ครั้งแรก → stock_qty ถูกต้อง
4. Admin กดปุ่ม "เปิดระบบสต็อก" → set dinoco_inv_initialized = true
5. cron เริ่มทำงาน auto_status ปกติ

ระหว่างรอ: stock_status ยังใช้ค่าเดิม (ของจาก postmeta) ไม่เปลี่ยนแปลง
```

### DD-4: Walk-in Hook → ตัดสต็อกที่ completed ด้วย

**ตัดสินใจ**: Hook ทั้ง `shipped` + `completed` + dedup guard

```
เมื่อ status change:
├── → shipped (ปกติ B2B) → dinoco_stock_deduct_for_order()
├── → completed (walk-in skip shipped) → dinoco_stock_deduct_for_order()
└── dedup: ตรวจ post_meta '_stock_deducted' = 1 → ถ้ามีแล้วข้าม

function dinoco_on_order_status_change($order_id, $new_status, $old_status) {
    if (!in_array($new_status, ['shipped', 'completed'])) return;
    if (get_post_meta($order_id, '_stock_deducted', true)) return; // dedup
    dinoco_stock_deduct_for_order($order_id);
    update_post_meta($order_id, '_stock_deducted', 1);
}
```

---

## 8. Risk & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **stock_qty ไม่ตรง** (race condition) | สูง | ต่ำ | ใช้ `FOR UPDATE` lock เหมือน Debt System ที่พิสูจน์แล้ว |
| **B2F receive + B2B shipped ทำงานพร้อมกัน** | กลาง | ต่ำ | Lock per SKU (ไม่ lock ทั้ง table), คนละ row |
| **Migration ผิดพลาด** (ALTER TABLE) | สูง | ต่ำ | ใช้ `ADD COLUMN ... DEFAULT 0` ไม่มีข้อมูลหาย, test บน staging |
| **stock_qty เริ่มที่ 0 ทุกตัว** | กลาง | แน่นอน | Plan: หลัง deploy Phase 1 → Admin ทำ Dip Stock ครั้งแรก (initial count) |
| **Existing OOS cron conflict** | กลาง | กลาง | ปิด `b2b_oos_expiry_check` หลัง Phase 1 stable, ใช้ auto_status แทน |
| **Performance ลดลง** | กลาง | ต่ำ | Benchmark: 2 extra queries per ship/receive (~10ms), acceptable |
| **ตัวแทนเห็น stock_qty** | สูง | ต่ำ | Code review: ห้าม return `stock_qty` ใน distributor-facing endpoint |
| **Dip Stock ค้าง in_progress** | ต่ำ | กลาง | Expire cron 48 ชม. + manual expire button |

---

## 9. Testing Checklist

### Phase 1 Tests

- [ ] **ALTER TABLE**: `stock_qty` column exists, default 0
- [ ] **dinoco_stock_add()**: เพิ่ม qty + log transaction ถูกต้อง
- [ ] **dinoco_stock_subtract()**: ลด qty + log transaction ถูกต้อง
- [ ] **dinoco_stock_subtract()**: qty ไม่ติดลบ (cap at 0)
- [ ] **Concurrent**: 2 requests พร้อมกัน → qty ถูกต้อง (ไม่ lost update)
- [ ] **B2F receive-goods**: รับ 50 ชิ้น SKU "A" → stock_qty เพิ่ม 50
- [ ] **B2F receive-goods**: SKU ไม่อยู่ใน catalog → log warning, ไม่ error
- [ ] **B2B shipped**: ส่ง 5 ชิ้น SKU "A" → stock_qty ลด 5
- [ ] **B2B shipped**: stock_qty < order qty → cap at 0, log warning
- [ ] **Walk-in cancel**: คืนสต็อก qty ถูกต้อง
- [ ] **Auto status**: qty > threshold → in_stock
- [ ] **Auto status**: 0 < qty <= threshold → low_stock (ถ้า threshold > 0)
- [ ] **Auto status**: qty = 0 → out_of_stock
- [ ] **Manual adjust (add)**: เพิ่ม 10 → qty + 10, transaction logged
- [ ] **Manual adjust (subtract)**: ลด 5 → qty - 5, transaction logged
- [ ] **Manual adjust**: เหตุผลว่าง → validation error
- [ ] **Transaction log**: แสดงถูกต้อง, sorted by date desc
- [ ] **Transaction log**: reference link ไป B2F receiving / B2B order ได้

### Phase 2 Tests

- [ ] **B2B catalog**: stock_display = "in_stock" / "low_stock" / "out_of_stock" ถูกต้อง
- [ ] **B2B catalog**: ไม่มี stock_qty ใน response (security)
- [ ] **LIFF badge**: เขียว = มีสินค้า, เหลือง = ใกล้หมด, แดง = หมด
- [ ] **LIFF out of stock**: ปุ่มสั่งซื้อ disabled + แสดง ETA
- [ ] **LINE alert**: low stock → Flex message ถูกต้อง
- [ ] **LINE alert**: ไม่ซ้ำ (alert 1 ครั้ง/SKU/วัน)
- [ ] **MCP product-lookup**: มี stock_display, ไม่มี stock_qty

### Phase 3 Tests

- [ ] **Dip stock start**: สร้าง session + snapshot ทุก SKU
- [ ] **Dip stock start**: มี session ค้าง → error 409
- [ ] **Dip stock count**: บันทึก actual_qty + คำนวณ variance
- [ ] **Dip stock count**: partial save (ไม่ต้องครบทุก SKU)
- [ ] **Dip stock approve**: stock_qty = actual_qty + transaction logged
- [ ] **Dip stock approve**: selective (เลือกบาง SKU)
- [ ] **Dip stock expire**: session > 48 ชม. → auto expire
- [ ] **Dip stock reminder**: 30 วันหลังนับล่าสุด → LINE alert
- [ ] **Export CSV**: ดาวน์โหลดไฟล์ถูกต้อง + UTF-8 BOM
- [ ] **Variance report**: sorted by % variance desc
- [ ] **Variance report**: สี ถูกต้อง (แดง >5%, เหลือง 1-5%, เขียว 0%)

### Security Tests

- [ ] ทุก endpoint ต้อง `manage_options` permission
- [ ] stock_qty ไม่ถูกส่งไป distributor endpoint
- [ ] CSRF: nonce verify ทุก POST
- [ ] Rate limit ทำงาน
- [ ] SQL injection: ทุก input ผ่าน prepare/sanitize

---

## 10. Rollback Plan

### Phase 1 Rollback

```
ถ้ามีปัญหาหลัง deploy Phase 1:

1. Disable stock hooks:
   - Comment out dinoco_stock_add() call ใน B2F receive-goods
   - Comment out stock deduction hook ใน B2B Snippet 2
   → ผลกระทบ: กลับเป็น manual toggle เหมือนเดิม

2. ถ้า database มีปัญหา:
   - ALTER TABLE dinoco_products DROP COLUMN stock_qty, low_stock_threshold, ...
   - DROP TABLE dinoco_stock_transactions (ไม่มี data สำคัญ)
   → stock_status ยังทำงานเหมือนเดิม (ไม่มี qty)

3. ถ้า performance มีปัญหา:
   - Disable cron jobs (dinoco_stock_*)
   - Comment out transaction logging (เก็บแค่ stock_qty update)
```

### Phase 2 Rollback

```
1. B2B Catalog: ลบ stock_display, ใช้ stock_status เดิม
2. LIFF Frontend: ลบ badge code, กลับเป็น in_stock/out_of_stock
3. LINE alerts: ลบ cron → ไม่ส่ง alert (ไม่กระทบการใช้งาน)
```

### Phase 3 Rollback

```
1. Dip Stock: DROP TABLE dinoco_dip_stock + dinoco_dip_stock_items
2. ลบ REST endpoints /dip-stock/*
3. ลบ UI (Dip Stock page)
→ Phase 1 + 2 ยังทำงานได้ปกติ (Dip Stock เป็น standalone feature)
```

### Data Safety

- **ไม่ลบ column/table ที่มีอยู่เดิม** -- เพิ่มใหม่เท่านั้น
- `stock_status` (ENUM in_stock/out_of_stock) ยังอยู่ -- backward compatible
- `dinoco_product_catalog` wp_options ยังอยู่ (dual write)
- B2F receive-goods ยัง set_stock_status เดิม + เพิ่ม qty logic

---

## Appendix A: stock_status Auto-Update Logic

```
function dinoco_stock_auto_status( $sku ) {
    global $wpdb;
    $table = $wpdb->prefix . 'dinoco_products';
    $product = $wpdb->get_row( $wpdb->prepare(
        "SELECT stock_qty, low_stock_threshold FROM {$table} WHERE sku = %s", $sku
    ) );
    
    if ( ! $product ) return;
    
    $qty       = (int) $product->stock_qty;
    $threshold = (int) $product->low_stock_threshold;
    
    if ( $qty <= 0 ) {
        $new_status = 'out_of_stock';
    } elseif ( $threshold > 0 && $qty <= $threshold ) {
        // low_stock ยังเป็น in_stock ใน DB (backward compat)
        // แต่ API return stock_display = 'low_stock'
        $new_status = 'in_stock';
    } else {
        $new_status = 'in_stock';
    }
    
    $wpdb->update( $table, [ 'stock_status' => $new_status ], [ 'sku' => $sku ] );
    
    // Sync to b2b_product CPT (dual write)
    $b2b_post = get_posts([
        'post_type' => 'b2b_product',
        'meta_query' => [[ 'key' => 'product_sku', 'value' => $sku ]],
        'posts_per_page' => 1,
        'fields' => 'ids',
    ]);
    if ( ! empty( $b2b_post ) ) {
        update_field( 'stock_status', $new_status, $b2b_post[0] );
    }
}
```

> **หมายเหตุ**: `stock_status` ENUM ยังคงเป็น `in_stock/out_of_stock` (ไม่เพิ่ม `low_stock` เข้า ENUM) เพราะ backward compat กับ code ที่เช็ค `stock_status` อยู่แล้ว. `low_stock` เป็น computed value จาก `stock_qty <= low_stock_threshold` ใน API layer เท่านั้น.

## Appendix B: SKU Relations & Stock Deduction

สำหรับ SKU relations (parent-child set):
- **Parent SKU** = สินค้าเซ็ต (เช่น "SET-001") — **ไม่เก็บ stock_qty ของตัวเอง**
- **Child SKUs** = สินค้าแต่ละชิ้นในเซ็ต (เช่น "PART-A", "PART-B") — **เก็บ stock_qty จริง**
- ถ้าไม่มี child → เป็นสินค้าเดี่ยว ตัด parent SKU ตามปกติ

### กฎสำคัญ: Parent stock = MIN(children stock)

```
ตัวอย่าง: SET-001 มี 3 ชิ้น
  PART-A: stock_qty = 10
  PART-B: stock_qty = 7   ← คอขวด (bottleneck)
  PART-C: stock_qty = 12

→ SET-001 available = MIN(10, 7, 12) = 7 ชุด
→ ถ้า PART-B หมด (0) → SET-001 ก็หมด แม้ PART-A/C ยังเหลือ
```

### Stock Display สำหรับ Parent (Set)

```
dinoco_get_set_available_qty($parent_sku):
  1. ดึง children จาก dinoco_sku_relations
  2. ดึง stock_qty ของ children ทุกตัว
  3. return MIN(children.stock_qty)

stock_status ของ Parent:
  - available_qty > threshold  → "มีสินค้า" (เขียว)
  - available_qty > 0          → "ใกล้หมด" (เหลือง)  
  - available_qty = 0          → "สินค้าหมด" (แดง)
```

### Stock Deduction เมื่อสั่ง Set

```php
function dinoco_stock_deduct_for_order( $order_id ) {
    $items = get_field( 'order_items', $order_id );
    $relations = get_option( 'dinoco_sku_relations', [] );
    
    foreach ( $items as $item ) {
        $sku = $item['sku'] ?? '';
        $qty = intval( $item['qty'] ?? 0 );
        if ( ! $sku || $qty <= 0 ) continue;
        
        if ( isset( $relations[ $sku ] ) && ! empty( $relations[ $sku ] ) ) {
            // Set product: deduct each child (parent ไม่เก็บ stock)
            foreach ( $relations[ $sku ] as $child_sku ) {
                dinoco_stock_subtract( $child_sku, $qty, 'b2b_shipped', 'b2b_order', $order_id );
            }
        } else {
            // Single product: deduct directly
            dinoco_stock_subtract( $sku, $qty, 'b2b_shipped', 'b2b_order', $order_id );
        }
    }
}
```

### Stock Addition เมื่อรับของจากโรงงาน (B2F)

```
B2F receive-goods ได้ SKU = child SKU (ชิ้นส่วน)
→ dinoco_stock_add(child_sku, qty)
→ Parent set available อัพเดทอัตโนมัติ (computed จาก MIN children)
→ ไม่ต้อง add stock ให้ parent แยก
```

### BO ETA สำหรับ Set

```
ถ้า SET-001 หมดเพราะ PART-B หมด:
→ BO ETA ของ SET-001 = ETA ของ PART-B (child ที่เป็นคอขวด)
→ dinoco_calculate_bo_eta('SET-001'):
   1. หา children ทุกตัวที่ stock_qty = 0
   2. หา ETA ของ children ที่หมด (จาก B2F PO)
   3. ETA ของ Set = MAX(children ETA) — ต้องรอจนได้ครบทุกชิ้น
```

## Appendix C: Initial Stock Setup Plan

หลัง deploy Phase 1 ต้องทำ initial stock setup:

1. **Option A: Dip Stock ครั้งแรก** (แนะนำ)
   - Admin นับของจริงทุก SKU
   - ใช้ Dip Stock flow (Phase 3) หรือ bulk manual adjust (Phase 1)
   
2. **Option B: Bulk Import CSV**
   - Admin เตรียม CSV: SKU, stock_qty
   - Import via admin UI
   - ทุก row สร้าง transaction type=initial_set

3. **Option C: Admin Manual Adjust ทีละตัว**
   - เหมาะถ้ามี SKU น้อย (<20)

> **สำคัญ**: ก่อน initial setup ต้องแจ้ง Admin ว่า:
> - ทุก SKU จะเริ่มที่ 0
> - B2F receive และ B2B shipped จะเริ่ม track ทันทีหลัง deploy
> - ดังนั้นควรทำ initial count ให้เสร็จภายใน 1-2 วันหลัง deploy

---

## Checklist ก่อนส่งต่อให้ Dev

- [x] ทุก user flow มี error handling ครบ
- [x] ทุก form มี validation rules ชัดเจน (adjust: require reason, qty > 0)
- [x] ทุก API endpoint มี permission check (manage_options)
- [x] ทุก UI state ครบ (loading, empty, error, success)
- [x] ทุก text เป็นภาษาไทย
- [x] Mobile-first design (44px touch targets, card layout)
- [x] ไม่ conflict กับ feature อื่น (CSS prefix, IIFE, separate namespace)
- [x] Performance impact ประเมินแล้ว (~10ms per stock operation)
- [x] Security review: stock_qty ไม่ leak ไป distributor, nonce, rate limit
- [x] Rollback plan มีทุก phase
