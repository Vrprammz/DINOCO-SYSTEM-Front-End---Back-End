# Feature Spec: B2F (Business to Factory) — ระบบสั่งซื้อจากโรงงานผู้ผลิต

Version: 3.0 | Date: 2026-03-31 | Author: Feature Architect + UX Expert + Deep Review + Implementation

## Implementation Status (Phase 1 MVP)

| Component | Status | Notes |
|-----------|--------|-------|
| CPT & ACF (Snippet 0) | ✅ Done | 5 CPTs + ACF fields + helpers |
| Core Utilities & Flex (Snippet 1) | ⚠️ Partial | Flex builders มี แต่ `b2f_liff_url()` crash — ใช้ inline Flex ใน Snippet 3 แทน |
| REST API (Snippet 2) | ✅ Done | 19+ endpoints + debug endpoints (ชั่วคราว) |
| Webhook Handler (Snippet 3) | ✅ Done | Maker commands + Admin B2F commands + self-contained Flex menu |
| Maker LIFF (Snippet 4) | ✅ Done | Shortcode `[b2f_maker_liff]` page `/b2f-maker/` |
| Admin Dashboard Tabs (Snippet 5) | ✅ Done | Orders + Makers + Credit tabs + SKU picker (grid+multi-select) |
| Order FSM (Snippet 6) | ✅ Done | 12 statuses + transitions + labels + badges |
| Credit Manager (Snippet 7) | ✅ Done | Atomic payable ops + auto hold/unhold + audit |
| B2B Snippet 1 (Bubble 3) | ✅ Done | Admin Flex carousel 3 หน้า (ใช้ Dashboard URL แทน LIFF) |
| B2B Snippet 2 (Routing) | ✅ Done | B2F routing via function_exists guard |
| Admin Dashboard (Sidebar) | ✅ Done | B2F section + scrollable sidebar |
| Bot (Maker group) | ✅ Done | @mention + text commands (ส่งของ/ดูPO) |
| Bot (Admin group) | ✅ Done | B2F commands (สั่งโรงงาน/ดูPO/สรุปโรงงาน) |
| Sync | ✅ Done | 49 snippets, name LIKE filter includes [B2F] |
| WordPress Page | ✅ Done | `/b2f-maker/` with `[b2f_maker_liff]` |

### Known Issues (ต้อง fix ก่อน Phase 2)

| Issue | Severity | Description |
|-------|----------|-------------|
| `b2f_liff_url()` crash | Medium | Function error ทำให้ Flex ที่เรียกมันพังทั้ง function — ต้อง debug root cause |
| Debug endpoints ยังเปิดอยู่ | Low | `/debug-maker/`, `/debug-route/` เป็น public — ต้องลบ/ปิดหลัง debug |
| Maker LIFF ยังไม่ทดสอบ | Medium | Snippet 4 deploy แล้วแต่ยังไม่ได้ทดสอบ confirm PO flow จริง |
| B2F Orders tab ยังไม่ทดสอบ | Medium | สร้าง PO จาก Admin Dashboard ยังไม่ได้ทดสอบ |
| `b2f_format_maker()` N+1 query | Low | นับ product_count + po_count ต่อ maker — ช้าเมื่อ makers เยอะ |

> **สำคัญ — Architecture Decisions:**
> 1. **ใช้ LINE Bot ตัวเดียวกับ B2B** — routing ตาม `group_id` แยก Flex ให้แต่ละ role (Distributor ไม่เห็น B2F, Maker ไม่เห็น B2B)
> 2. **ทุกอย่างที่ทำใน LIFF/Flex ต้องทำบน PC ได้ด้วย** — เพิ่ม section "B2F System" ใน sidebar ของ `[Admin System] DINOCO Admin Dashboard`
> 3. **ไม่ sync กับ Zort** — ราคาทุนอยู่ในระบบ B2F ของเราเอง
> 4. **Maker LIFF ใช้ Signed URL + JWT** — ไม่ใช่แค่ group_id verify (reuse B2B Snippet 15 pattern)
> 5. **B2F Snippets แยกไฟล์ทั้งหมด** — Snippet 2 (Webhook) เรียกผ่าน `function_exists()` guard, Admin Dashboard ใช้ shortcode modules แยก
> 6. **group_id isolation** — Distributor เห็นแค่ B2B Flex, Maker เห็นแค่ B2F Flex, Admin เห็นทุกอย่าง ไม่ปนกัน

---

## 1. Problem & Goal

### ปัญหาคืออะไร

DINOCO สั่งซื้อสินค้าจากโรงงานผู้ผลิต (Maker) ผ่านช่องทางไม่เป็นระบบ — โทร, แชท LINE ส่วนตัว, จด memo — ทำให้:
- ไม่มี record ว่าสั่งอะไรไปเมื่อไหร่ ราคาทุนเท่าไหร่
- ติดตามสถานะยาก — โรงงานส่งของหรือยัง? ตรงตาม ETA ไหม?
- ตรวจรับของไม่มีหลักฐาน — ของมาครบไหม? คุณภาพผ่านไหม?
- ไม่มี data ราคาทุน (cost price) ต่อ SKU ต่อ Maker สำหรับวิเคราะห์ margin
- Inventory ไม่ update อัตโนมัติเมื่อรับของเข้าคลัง

### ใครมีปัญหา

- **Admin DINOCO**: ต้องจำว่าสั่งอะไรไป, ตามของ, ตรวจรับ, บันทึกค่าใช้จ่าย
- **โรงงาน Maker**: ไม่มีใบสั่งซื้อเป็นระบบ, ต้องจำว่าลูกค้าสั่งอะไร

### Success Metrics

| Metric | Target |
|--------|--------|
| ทุก PO มี digital record + ราคาทุน | 100% ภายใน 1 เดือน |
| เวลาเฉลี่ยในการสร้าง PO | < 2 นาที |
| อัตราติดตามของครบ | 100% มี delivery tracking |
| Inventory auto-update เมื่อรับของ | 100% |
| Maker response rate (กรอก ETA) | > 80% ภายใน 24 ชม. |

---

## 2. User Flows

### 2.1 Admin สร้าง Purchase Order (PO)

```
Happy Path
├── Admin @bot ในห้องแอดมิน DINOCO (หรือเปิด B2F Dashboard)
├── Bot ส่ง Flex menu → กดปุ่ม "สร้างใบสั่งซื้อ"
├── เปิด LIFF "สร้างใบสั่งซื้อ"
├── เลือกโรงงาน Maker จาก dropdown
│   └── แสดง SKU catalog ที่โรงงานนั้นผลิต + ราคาทุนต่อ SKU
├── เลือก SKU + กรอกจำนวน → คำนวณยอดรวมจากราคาทุน
├── กรอกหมายเหตุ + วันที่ต้องการรับ (optional)
├── กดยืนยัน → ระบบสร้าง PO
├── ส่ง Flex "ใบสั่งซื้อใหม่" → ห้อง LINE ของ Maker
├── ส่ง Flex "สร้าง PO สำเร็จ" → ห้อง Admin
└── PO status = "submitted"

Error Paths
├── ไม่เลือก Maker → "กรุณาเลือกโรงงาน"
├── ไม่เลือก SKU → "กรุณาเลือกสินค้าอย่างน้อย 1 รายการ"
├── จำนวน <= 0 → "จำนวนต้องมากกว่า 0"
├── LINE push ล้มเหลว → บันทึก PO สำเร็จ แต่แจ้ง "ส่งแจ้งเตือนไม่สำเร็จ"
└── Network timeout → retry 1 ครั้ง → แสดง error

Edge Cases
├── สั่ง SKU เดียวกันหลายบรรทัด → auto-merge รวมจำนวน
├── Maker ยังไม่มี LINE Group → สร้าง PO ได้ แต่แจ้ง warning
├── สั่งซ้ำ PO เดิมภายใน 5 นาที → แจ้ง "มี PO ที่เหมือนกัน ยืนยันสร้างใหม่?"
├── Admin เปิดหลาย tab → transient lock ป้องกัน duplicate
├── Draft ค้าง (Admin ปิด LIFF ไม่ส่ง) → auto-save draft แสดงตอนเปิดครั้งถัดไป
└── Admin กด back/refresh กลางทาง → draft ยังอยู่ใน localStorage
```

### 2.2 Maker ยืนยัน + กรอก Expected Delivery Date

```
Happy Path
├── Maker เห็น Flex message ในห้อง LINE
├── กดปุ่ม "ยืนยันวันส่งของ" → เปิด LIFF
├── เห็นรายการสินค้าที่สั่ง + จำนวน + ราคาทุน
├── กรอก expected delivery date (date picker)
├── กรอกหมายเหตุ (optional)
├── กด "ยืนยัน"
├── PO status → "confirmed"
├── ส่ง Flex แจ้ง Admin "Maker ยืนยันวันส่ง: DD/MM/YYYY"
└── ระบบตั้ง reminder cron

Error Paths
├── กรอกวันในอดีต → "วันส่งต้องเป็นวันในอนาคต"
├── LIFF เปิดนอก LINE → redirect
└── PO ถูกยกเลิกแล้ว → แจ้ง "ใบสั่งซื้อนี้ถูกยกเลิกแล้ว"

Edge Cases
├── Maker ไม่ตอบ 24 ชม. → reminder ซ้ำ
├── Maker ไม่ตอบ 48 ชม. → reminder อีกครั้ง
├── Maker ไม่ตอบ 72 ชม. → escalate แจ้ง Admin
├── Maker ต้องการเลื่อน ETA → กดปุ่ม "ขอเลื่อนวันส่ง" + กรอกเหตุผล → Admin approve
└── Maker ปฏิเสธ PO → กดปุ่ม "ปฏิเสธ" + ให้เหตุผล → Admin ได้รับ Flex
```

### 2.3 ระบบติดตาม (Delivery Tracking)

```
Automated Reminders (Cron)
├── ETA - 3 วัน → Flex เตือน Maker + Admin "เหลืออีก 3 วัน"
├── ETA - 1 วัน → Flex เตือน Maker + Admin "พรุ่งนี้ครบกำหนด"
├── ETA วันนี้ → Flex เตือน "วันนี้ครบกำหนดส่ง PO #XXX"
├── ETA + 1 วัน → Flex แจ้ง Admin "PO #XXX ล่าช้า 1 วัน" (สีเหลือง)
├── ETA + 3 วัน → Flex แจ้ง Admin "PO #XXX ล่าช้า 3 วัน — กรุณาติดต่อ Maker" (สีแดง)
└── ETA + 7 วัน → Flex เตือนซ้ำทุก 3 วัน จนกว่าจะรับของหรือยกเลิก
```

### 2.4 Maker ส่งของ + Admin ตรวจรับ

```
Happy Path
├── Maker มาส่งของที่ DINOCO
├── Maker @bot ในห้อง Maker → พิมพ์ "ส่งของ"
│   หรือ Admin เปิด Dashboard → กดปุ่ม "ตรวจรับ" ที่ PO นั้น
├── เลือก PO ที่ต้องการ → เปิด LIFF "ตรวจรับสินค้า"
├── แสดงรายการ SKU ที่สั่ง + จำนวน
├── Admin กรอกจำนวนที่ได้รับจริง ต่อ SKU
├── Admin เลือก QC result ต่อ SKU: ผ่าน / ไม่ผ่าน
│   └── ถ้าไม่ผ่าน → กรอกเหตุผล + ถ่ายรูป (max 5 รูป/SKU)
├── กดยืนยัน
├── ถ้ารับครบ → PO status = "received"
│   ถ้ารับไม่ครบ → PO status = "partial_received"
├── ส่ง Flex "ใบรับของ" → ห้อง Maker (+ รูป receipt image)
├── ส่ง Flex สรุป → ห้อง Admin
└── อัพเดท Global Inventory (stock qty + log, source='b2f')

Edge Cases
├── Partial delivery: รับ 5 จาก 10 → partial_received + track remaining
├── ส่งของหลายครั้ง → หลาย receiving records ต่อ 1 PO
├── QC ไม่ผ่านบางรายการ → จำนวน pass เข้า inventory, reject แยก log
├── จำนวนรับ > จำนวนสั่ง → validation error "จำนวนรับไม่สามารถเกินจำนวนสั่ง"
├── Maker ส่งของโดยไม่แจ้งผ่านระบบ → Admin manual mark delivery ได้จาก Dashboard
├── 2 admin ตรวจรับ PO เดียวกันพร้อมกัน → transient lock 60s
└── Over-delivery → warning + confirm dialog
```

### 2.5 PO Modification & Cancellation

```
Admin แก้ไข PO (ก่อน Maker ยืนยัน)
├── Admin เปิด PO → กดแก้ไข → เปลี่ยนจำนวน/เพิ่ม SKU/ลบ SKU
├── PO status = "amended" → auto-resubmit
├── ส่ง Flex "ใบสั่งซื้อแก้ไข (ฉบับที่ N)" → ห้อง Maker
└── Maker ต้องยืนยันใหม่

Admin ยกเลิก PO
├── Admin กด "ยกเลิก PO" + ให้เหตุผล (confirm 2 ครั้ง)
├── PO status = "cancelled"
└── ส่ง Flex "ยกเลิกใบสั่งซื้อ" → ห้อง Maker

Maker ขอเลื่อนส่ง
├── Maker กดปุ่ม "ขอเลื่อนวันส่ง" → กรอกวันใหม่ + เหตุผล
├── ส่ง Flex แจ้ง Admin → Admin กด "อนุมัติ" หรือ "ไม่อนุมัติ"
├── ถ้าอนุมัติ → update ETA + Flex แจ้ง Maker
├── ถ้าไม่อนุมัติ → Flex แจ้ง Maker "กรุณาส่งตามกำหนดเดิม"
└── Track ประวัติการเลื่อน (ใช้สำหรับ Maker performance rating)
```

### 2.6 Payment Tracking (จ่ายเงินโรงงาน)

```
Happy Path
├── Admin เปิด PO ที่ status = "received"
├── กดปุ่ม "บันทึกการจ่ายเงิน"
├── กรอก: จำนวนเงิน, วันที่จ่าย, ช่องทาง (โอน/เช็ค/เงินสด), หมายเหตุ
├── แนบหลักฐานการจ่าย (สลิป) — optional
├── กดยืนยัน
├── PO payment_status = "paid" (ครบ) หรือ "partial_paid" (ยังไม่ครบ)
├── ส่ง Flex "แจ้งการจ่ายเงิน" → ห้อง Maker
└── PO completed เมื่อจ่ายครบ
```

---

## 3. Data Model

### 3.1 CPT: `b2f_maker` (โรงงานผู้ผลิต)

| ACF Field | Type | Validation | Description |
|-----------|------|------------|-------------|
| `maker_name` | text | required, unique | ชื่อโรงงาน |
| `maker_contact` | text | | ชื่อผู้ติดต่อ |
| `maker_phone` | text | | เบอร์โทร |
| `maker_email` | email | | อีเมล |
| `maker_address` | textarea | | ที่อยู่โรงงาน |
| `maker_line_group_id` | text | | LINE Group ID ที่ Bot อยู่ |
| `maker_tax_id` | text | | เลขผู้เสียภาษี |
| ~~`maker_payment_terms`~~ | — | — | *(ย้ายไปใช้ `maker_credit_term_days` ใน section 3.6 แทน — ไม่ซ้ำ)* |
| `maker_bank_name` | text | | ธนาคาร |
| `maker_bank_account` | text | | เลขบัญชี |
| `maker_bank_holder` | text | | ชื่อบัญชี |
| `maker_status` | select | active/inactive | สถานะ |
| `maker_notes` | textarea | | หมายเหตุภายใน |

### 3.2 CPT: `b2f_maker_product` (สินค้าที่โรงงานผลิต + ราคาทุน)

**สำคัญ: นี่คือตัวเก็บราคาทุน (cost price) ต่อ SKU ต่อ Maker**

| ACF Field | Type | Validation | Description |
|-----------|------|------------|-------------|
| `mp_maker_id` | post_object (b2f_maker) | required | FK → Maker |
| `mp_product_sku` | text | required | SKU (ตรงกับ b2b_product) |
| `mp_product_name` | text | | ชื่อสินค้า (snapshot จาก catalog) |
| `mp_unit_cost` | number | required, > 0 | **ราคาทุนต่อหน่วย (บาท)** |
| `mp_moq` | number | default: 1 | Minimum Order Quantity |
| `mp_lead_time_days` | number | default: 7 | ระยะเวลาผลิต (วัน) |
| `mp_last_order_date` | date | | สั่งล่าสุดเมื่อไหร่ |
| `mp_notes` | textarea | | หมายเหตุ (spec พิเศษ) |
| `mp_status` | select | active/discontinued | สถานะ |

> **หมายเหตุ**: SKU เดียวกันอาจผลิตได้หลาย Maker ราคาต่างกัน → ตอน Admin สั่งจะเห็นราคาทุนของ Maker ที่เลือก
> **ไม่ sync กับ Zort** — ข้อมูลราคาทุนอยู่ในระบบ B2F ของเราเอง

### 3.3 CPT: `b2f_order` (Purchase Order)

| ACF Field | Type | Validation | Description |
|-----------|------|------------|-------------|
| `po_number` | text | auto-gen, unique | PO-DNC-YYMMDD-NNN |
| `po_maker_id` | post_object (b2f_maker) | required | FK → Maker |
| `po_status` | select | see FSM | สถานะ PO |
| `po_items` | repeater | required, min 1 | รายการสินค้า |
| → `poi_sku` | text | required | SKU |
| → `poi_product_name` | text | | ชื่อสินค้า (snapshot) |
| → `poi_qty_ordered` | number | required, > 0 | จำนวนที่สั่ง |
| → `poi_unit_cost` | number | required | **ราคาทุนต่อหน่วย (snapshot ณ วันสั่ง)** |
| → `poi_qty_received` | number | default: 0 | จำนวนที่รับแล้ว (สะสม) |
| → `poi_qty_rejected` | number | default: 0 | จำนวนที่ reject |
| `po_total_amount` | number | auto-calc | **ยอดรวมราคาทุน** |
| `po_requested_date` | date | | วันที่ต้องการรับ (Admin กรอก) |
| `po_expected_date` | date | | วันที่คาดว่าจะส่ง (Maker กรอก) |
| `po_actual_date` | date | | วันที่ส่งจริง |
| `po_admin_note` | textarea | | หมายเหตุ Admin |
| `po_maker_note` | textarea | | หมายเหตุ Maker |
| `po_amendment_count` | number | default: 0 | จำนวนครั้งที่แก้ไข |
| `po_created_by` | text | | Admin ที่สร้าง (WP user ID) |
| `po_paid_amount` | number | default: 0, decimal: 2 | จำนวนเงินที่จ่ายแล้ว |
| `po_payment_status` | select | unpaid/partial/paid | สถานะการจ่ายเงิน |
| `po_cancelled_reason` | textarea | | เหตุผลที่ยกเลิก (ถ้ามี) |
| `po_cancelled_by` | text | | Admin ที่ยกเลิก |
| `po_cancelled_date` | date | | วันที่ยกเลิก |
| `po_rejected_reason` | textarea | | เหตุผลที่ Maker ปฏิเสธ (ถ้ามี) |
| `po_item_count` | number | auto-calc | จำนวนรายการ (denormalize สำหรับ list view) |
| `po_version` | number | default: 1 | Version ของ PO (เพิ่มทุกครั้งที่ amend) |
| `po_last_reminder_sent` | datetime | | วันเวลาที่ส่ง reminder ล่าสุด (ป้องกันซ้ำ) |

> **หมายเหตุ ACF Config**: ทุก field ที่เป็นราคา (`poi_unit_cost`, `po_total_amount`, `po_paid_amount`, `pmt_amount`) ต้องตั้ง `decimal_places: 2, min: 0.01`

### 3.4 CPT: `b2f_receiving` (ใบรับสินค้า — หลายใบต่อ 1 PO ได้)

| ACF Field | Type | Validation | Description |
|-----------|------|------------|-------------|
| `rcv_po_id` | post_object (b2f_order) | required | FK → PO |
| `rcv_number` | text | auto-gen | RCV-YYMMDD-NNN |
| `rcv_date` | date | required | วันที่รับของ |
| `rcv_items` | repeater | required | รายการที่รับ |
| → `rcvi_sku` | text | | SKU |
| → `rcvi_qty_received` | number | | จำนวนรับ |
| → `rcvi_qty_rejected` | number | | จำนวน reject |
| → `rcvi_qc_status` | select | passed/failed/partial | ผล QC |
| → `rcvi_reject_reason` | textarea | | เหตุผล reject |
| → `rcvi_reject_photos` | gallery | max 5 | รูปสินค้า reject |
| `rcv_admin_note` | textarea | | หมายเหตุ |
| `rcv_inspected_by` | text | | ผู้ตรวจรับ |

### 3.5 CPT: `b2f_payment` (การจ่ายเงินโรงงาน)

| ACF Field | Type | Validation | Description |
|-----------|------|------------|-------------|
| `pmt_po_id` | post_object (b2f_order) | required | FK → PO |
| `pmt_maker_id` | post_object (b2f_maker) | required | FK → Maker |
| `pmt_amount` | number | required, > 0 | จำนวนเงินที่จ่าย |
| `pmt_date` | date | required | วันที่จ่าย |
| `pmt_method` | select | transfer/cheque/cash | วิธีจ่าย |
| `pmt_reference` | text | | เลขอ้างอิง |
| `pmt_slip_image` | image | | หลักฐานการจ่าย |
| `pmt_note` | textarea | | หมายเหตุ |

### 3.6 ระบบเครดิตระหว่าง DINOCO กับ Maker

**เหมือน B2B Debt System** (Snippet 13) — ทิศทางกลับด้าน:
- B2B: ตัวแทนเป็นหนี้ DINOCO (DINOCO เป็นเจ้าหนี้)
- B2F: DINOCO เป็นหนี้ Maker (DINOCO เป็นลูกหนี้)

**เพิ่ม fields ใน `b2f_maker` CPT:**

| ACF Field | Type | Validation | Description |
|-----------|------|------------|-------------|
| `maker_credit_limit` | number | default: 0 | วงเงินเครดิตที่ Maker ให้ DINOCO |
| `maker_current_debt` | number | default: 0 | ยอดค้างจ่าย Maker ปัจจุบัน (read-only ← recalculate) |
| `maker_credit_term_days` | number | default: 30 | เครดิตกี่วัน |
| `maker_credit_hold` | boolean | default: false | Maker ระงับเครดิต (สั่งซื้อเพิ่มไม่ได้) |
| `maker_credit_hold_reason` | select | auto/manual | auto = ระบบ hold เพราะเลยวงเงิน (auto-unhold เมื่อ debt ลดลง), manual = Admin hold เอง (ต้อง Admin unhold เท่านั้น) |

**B2F Debt Transaction Manager** (Snippet 6 — reuse B2B Snippet 13 pattern):

```php
// Atomic debt operations — FOR UPDATE lock เหมือน B2B
function b2f_debt_add($maker_id, $amount, $po_id, $note = '') {
    // เพิ่มหนี้ DINOCO → Maker เมื่อรับของเข้า
}

function b2f_debt_subtract($maker_id, $amount, $po_id, $note = '') {
    // ลดหนี้เมื่อจ่ายเงิน Maker
}

function b2f_recalculate_debt($maker_id) {
    // Single-SQL source of truth: sum(received) - sum(paid)
}
```

**Credit Flow:**
```
PO รับของเข้า (received)
├── b2f_debt_add(maker_id, po_total, po_id)
├── maker_current_debt += po_total
├── ถ้า current_debt >= credit_limit → แจ้ง Admin "ใกล้ถึงวงเงินเครดิต Maker XXX"
└── ถ้า credit_hold = true → block สร้าง PO ใหม่กับ Maker นี้

Admin จ่ายเงิน Maker
├── b2f_debt_subtract(maker_id, paid_amount, po_id)
├── maker_current_debt -= paid_amount
└── ถ้า credit_hold && current_debt < credit_limit → auto-unhold

Cron: b2f_credit_due_check (Weekly)
├── ตรวจ PO ที่รับของแล้วแต่ยังไม่จ่ายเงิน
├── ถ้าเลย credit_term_days → แจ้ง Admin "ค้างจ่าย Maker XXX เลยกำหนด N วัน"
└── แจ้ง friendly → official → final (เหมือน B2B dunning)
```

**B2F Credit Tab ใน Admin Dashboard:**
```
┌────────────────────────────────────────────┐
│  B2F Credit — เครดิตโรงงาน                   │
├────────────────────────────────────────────┤
│  สรุป                                       │
│  ┌────────────┐ ┌────────────┐             │
│  │ ค้างจ่ายรวม │ │ เลยกำหนด   │             │
│  │ ฿245,000   │ │ ฿32,000    │             │
│  └────────────┘ └────────────┘             │
├────────────────────────────────────────────┤
│  รายโรงงาน:                                 │
│  ┌──────────────────────────────────────┐  │
│  │ ABC Manufacturing                    │  │
│  │ วงเงิน: ฿500,000                    │  │
│  │ ค้างจ่าย: ฿120,000 (24%)            │  │
│  │ ████████░░░░░░░░░░░░░░ 24%           │  │
│  │ เครดิต: 30 วัน | ใกล้กำหนด: 2 PO     │  │
│  │ [ดูประวัติ] [บันทึกจ่ายเงิน]           │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │ XYZ Parts Co.         ⚠️ credit hold │  │
│  │ วงเงิน: ฿200,000                    │  │
│  │ ค้างจ่าย: ฿198,000 (99%)            │  │
│  │ ████████████████████░ 99%            │  │
│  │ ⚠️ เลยกำหนด 5 วัน                    │  │
│  │ [ดูประวัติ] [บันทึกจ่ายเงิน] [ปลดล็อก] │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

### 3.7 Relationships

```
b2f_maker ──1:N── b2f_maker_product  (Maker ผลิตอะไรบ้าง + ราคาทุนต่อ SKU)
b2f_maker ──1:N── b2f_order           (Maker มี PO กี่ใบ)
b2f_order ──1:N── b2f_receiving       (PO 1 ใบรับของได้หลายครั้ง)
b2f_order ──1:N── b2f_payment         (PO 1 ใบจ่ายเงินได้หลายครั้ง)
b2f_maker_product ──ref── b2b_product (SKU เดียวกับ B2B catalog)
b2f_receiving ──trigger── b2b_product (update stock เมื่อรับของเข้า)
```

---

## 4. Order State Machine (FSM)

```
                                ┌─────────────┐
                                │    draft     │ (Admin เพิ่งเริ่มกรอก)
                                └──────┬──────┘
                                       │ Admin submit
                                       v
                                ┌─────────────┐
                        ┌───── │  submitted   │ ─────┐
                        │      └──────┬──────┘       │
                        │             │               │
                   Admin cancel  Maker confirm   Maker reject
                        │             │               │
                        v             v               v
                 ┌──────────┐  ┌─────────────┐  ┌──────────┐
                 │ cancelled │  │  confirmed  │  │ rejected │
                 └──────────┘  └──────┬──────┘  └──────────┘
                                      │
                        ┌─────────────┼───────────────┐
                        │             │               │
                   Admin cancel  Maker deliver   Admin amend
                        │             │               │
                        v             v               v
                 ┌──────────┐  ┌─────────────┐  ┌──────────┐
                 │ cancelled │  │  delivering  │  │ amended  │→ resubmit
                 └──────────┘  └──────┬──────┘  └──────────┘
                                      │
                              Admin inspect
                                      │
                           ┌──────────┼──────────┐
                           │                     │
                           v                     v
                   ┌──────────────┐      ┌───────────────┐
                   │   received   │      │partial_received│
                   └──────┬──────┘      └───────┬───────┘
                          │                     │
                    payment flow          Maker ส่งเพิ่ม
                          │                     ↓
                   ┌──────┴──────┐        (กลับ delivering)
                   v             v
             ┌──────────┐ ┌──────────┐
             │   paid   │ │partial_paid│
             └──────┬───┘ └──────────┘
                    v
             ┌──────────┐
             │ completed │
             └──────────┘
```

**Transition Rules:**

```php
$transitions = array(
    'draft'            => array('submitted' => 'admin', 'cancelled' => 'admin'),
    'submitted'        => array('confirmed' => 'maker', 'rejected' => 'maker',
                                'amended' => 'admin', 'cancelled' => 'admin'),
    'confirmed'        => array('delivering' => 'maker', 'amended' => 'admin',
                                'cancelled' => 'admin'),
    'amended'          => array('submitted' => 'system'), // auto-resubmit ทันที (transient state)
    'rejected'         => array('amended' => 'admin', 'cancelled' => 'admin',
                                'submitted' => 'admin'),  // ★ re-submit โดยไม่แก้ไข
    'delivering'       => array('received' => 'admin', 'partial_received' => 'admin',
                                'confirmed' => 'admin'),  // ★ reject ทั้ง lot → Maker ต้องส่งใหม่
    'partial_received' => array('delivering' => 'maker', 'received' => 'admin',
                                'cancelled' => 'admin'),   // ★ cancel หลัง partial → ต้อง rollback inventory+debt
    'received'         => array('paid' => 'admin', 'partial_paid' => 'admin',
                                'completed' => 'admin'),   // ★ completed โดยไม่จ่าย (sample/ของฟรี/is_sample=true)
    'partial_paid'     => array('paid' => 'admin'),
    'paid'             => array('completed' => 'system'),
);

// ★ Cancellation after partial receiving — ต้อง rollback:
// 1. reverse inventory entries (source='b2f_cancel')
// 2. b2f_debt_subtract → ลดหนี้ที่เพิ่มไปตอนรับของ
// 3. สร้าง audit log
// 4. confirm dialog แจ้ง Admin ว่ามี receiving records จะถูก reverse
```

---

## 5. API Design

### 5.1 REST Endpoints — `/wp-json/b2f/v1/`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| **Webhook** | | | |
| — | *(ใช้ `/wp-json/b2b/v1/webhook` ตัวเดิม — routing ตาม group_id)* | LINE signature | ไม่ต้องสร้าง endpoint ใหม่ |
| **Maker CRUD** | | | |
| GET | `/makers` | admin | รายชื่อ Maker ทั้งหมด |
| POST | `/maker` | admin | สร้าง/แก้ไข Maker |
| POST | `/maker/delete` | admin | ลบ Maker (soft delete → inactive) |
| GET | `/maker-products/{maker_id}` | admin | SKU ที่ Maker ผลิต + ราคาทุน |
| POST | `/maker-product` | admin | สร้าง/แก้ไข Maker-SKU mapping + ราคาทุน |
| POST | `/maker-product/delete` | admin | ลบ mapping |
| **PO Management** | | | |
| POST | `/create-po` | admin | สร้าง Purchase Order |
| GET | `/po-detail/{po_id}` | admin/maker | ดูรายละเอียด PO |
| POST | `/po-update` | admin | แก้ไข PO (ก่อน Maker confirm) |
| POST | `/po-cancel` | admin | ยกเลิก PO |
| **Maker Actions** | | | |
| POST | `/maker-confirm` | maker (LIFF) | Maker ยืนยัน PO + ETA |
| POST | `/maker-reject` | maker (LIFF) | Maker ปฏิเสธ PO |
| POST | `/maker-reschedule` | maker (LIFF) | Maker ขอเลื่อนวันส่ง |
| GET | `/maker-po-list` | maker (LIFF) | Maker ดู PO ของตัวเอง |
| **Receiving** | | | |
| POST | `/receive-goods` | admin | ตรวจรับสินค้า |
| **Payment** | | | |
| POST | `/record-payment` | admin | บันทึกการจ่ายเงิน |
| **Dashboard** | | | |
| GET | `/po-history` | admin | ประวัติ PO (filter by maker, status, date) |
| GET | `/dashboard-stats` | admin | KPI สำหรับ Dashboard |

### 5.2 Permission Model

| Role | Access | Auth Method |
|------|--------|-------------|
| **Admin** (`manage_options`) | ทุก endpoint | WordPress login / nonce |
| **Maker** | เฉพาะ PO ของตัวเอง: confirm, reject, reschedule, view | **Signed URL + JWT** (ดูด้านล่าง) |
| **System** (cron) | reminders, overdue alerts | Internal |

### 5.2.1 Maker LIFF Authentication — Signed URL + JWT

**ไม่ใช้แค่ group_id verify** — ใช้ Signed URL + JWT token (reuse B2B Snippet 15 pattern):

```
เมื่อส่ง Flex ให้ Maker:
├── สร้าง JWT token encode: {po_id, maker_id, action, exp}
├── Sign ด้วย wp_salt('auth')
├── LIFF URL: /b2f-maker/?token=<JWT>&_ts=<timestamp>
├── Token expire: 72 ชม.
└── One-time use สำหรับ action (confirm/reject)

เมื่อ Maker เปิด LIFF:
├── Validate JWT signature + expiry
├── liff.getProfile() → ได้ LINE userId
├── Cross-check: userId ต้องอยู่ใน maker group (optional เพิ่มความปลอดภัย)
├── ดึง PO จาก po_id ใน token → verify ว่า maker_id match
└── ถ้าไม่ match → แสดง "ไม่มีสิทธิ์เข้าถึง"
```

**ทำไมไม่ใช้แค่ group_id:**
- LIFF `liff.getContext().groupId` ได้เฉพาะเปิดในกลุ่ม ไม่ได้ถ้าเปิดจาก browser
- URL ที่มี `po_id=123` เดาได้ → Maker A อาจดู PO ของ Maker B
- Signed URL + JWT แก้ทั้ง 2 ปัญหา

### 5.2.2 Group ID Isolation Guarantee — B2B ไม่เห็น B2F, B2F ไม่เห็น B2B

```
Validation Rules:
├── สร้าง Maker ใหม่: group_id ต้องไม่ซ้ำกับ distributor.line_group_id
├── สร้าง Distributor ใหม่: group_id ต้องไม่ซ้ำกับ b2f_maker.maker_line_group_id
├── Cache: group_id → role mapping ใน transient (TTL 1 ชม.)
│
└── Routing Priority (ใน Snippet 2):
    1. ถ้า group_id = B2B_ADMIN_GROUP_ID → Admin (B2B + B2F)
    2. ถ้า group_id match distributor → B2B Flex เท่านั้น
    3. ถ้า group_id match b2f_maker → B2F Flex เท่านั้น
    4. ไม่ match → ignore

ผลลัพธ์:
├── Distributor พิมพ์ @bot → เห็นแค่ "สั่งของ / เช็คหนี้ / สถานะ"
├── Maker พิมพ์ @bot → เห็นแค่ "ดู PO / ส่งของ"
├── Admin พิมพ์ @bot → เห็น carousel 3 หน้า (B2B + B2F)
└── ไม่มีทาง cross กัน เพราะ group_id ต้อง unique ข้าม CPT
```

### 5.3 LINE Bot Architecture — Bot ตัวเดียว, routing ตาม group_id

**ใช้ LINE OA ตัวเดียวกับ B2B** — ไม่ต้องแยก OA เพราะมี `group_id` แยก role ได้อยู่แล้ว:

```
LINE Webhook → /wp-json/b2b/v1/webhook (Snippet 2 เดิม)
├── ตรวจ LINE signature
├── ดึง group_id จาก event
│
├── ★ ROUTING LOGIC (เพิ่มใหม่):
│   ├── ถ้า group_id = B2B_ADMIN_GROUP_ID
│   │   └── Admin commands ทั้ง B2B + B2F (Flex 3 หน้า)
│   │
│   ├── ถ้า group_id match distributor.line_group_id
│   │   └── B2B Distributor flow (เดิม) → Flex ตัวแทน
│   │
│   ├── ถ้า group_id match b2f_maker.maker_line_group_id
│   │   └── B2F Maker flow (ใหม่) → Flex โรงงาน เท่านั้น
│   │
│   └── ไม่ตรงกับอะไร → ignore
│
└── แต่ละ role เห็นแค่ Flex ของตัวเอง — ไม่ปนกัน
```

**ทำไมไม่ต้องแยก OA:**
- มี `group_id` แยก role ได้ชัดเจนอยู่แล้ว
- Maker เห็นแค่ Flex B2F (PO, ยืนยัน, ส่งของ) — ไม่เห็น B2B commands
- ตัวแทนเห็นแค่ Flex B2B (สั่งของ, เช็คหนี้) — ไม่เห็น B2F commands
- Admin เห็นทุกอย่าง (B2B + B2F ใน carousel 3 หน้า)
- ลดค่าใช้จ่าย LINE OA + ง่ายต่อการ maintain

**เพิ่มเมนู B2F ใน Admin Flex Menu — Bubble 3 (หน้า 3/3):**

ปัจจุบัน `b2b_build_flex_command_menu_admin()` มี 2 bubbles (หน้า 1/2 และ 2/2)
→ เพิ่ม **Bubble 3** สำหรับ B2F:

```php
// ── Bubble 3: B2F สั่งซื้อจากโรงงาน ──
$bubble3 = array('type'=>'bubble','size'=>'mega',
    'header'=>b2b_flex_header('🏭 B2F สั่งซื้อจากโรงงาน','Admin · หน้า 3/3','#111111'),
    'body'=>array('type'=>'box','layout'=>'vertical','paddingAll'=>'14px','spacing'=>'sm','contents'=>array(
        b2b_menu_section('🏭 สั่งซื้อ'),
        b2b_cmd_row_liff('📝','สร้างใบสั่งซื้อ (PO)',$url_b2f_create,'เลือกโรงงาน + SKU + ราคาทุน'),
        b2b_cmd_row_liff('📋','ดู PO ทั้งหมด',$url_b2f_list,'รายการ PO ทุกสถานะ'),
        b2b_menu_section('📦 รับของ'),
        b2b_cmd_row_liff('✅','ตรวจรับสินค้า',$url_b2f_receive,'QC + นับของ + ถ่ายรูป'),
        b2b_menu_section('💰 จ่ายเงินโรงงาน'),
        b2b_cmd_row_liff('💳','บันทึกจ่ายเงิน',$url_b2f_payment,'โอน/เช็ค/เงินสด'),
        b2b_menu_section('⚠️ ติดตาม'),
        b2b_cmd_row_liff('⏰','PO ใกล้กำหนดส่ง',$url_b2f_upcoming,'D-3, D-1, วันนี้'),
        b2b_cmd_row_liff('🔴','PO ล่าช้า',$url_b2f_overdue,'เลยกำหนดส่ง'))));

// เปลี่ยน carousel จาก 2 bubbles เป็น 3
return array('type'=>'flex','altText'=>'⚙️ คำสั่ง DINOCO SYSTEM (Admin)',
    'contents'=>array('type'=>'carousel','contents'=>array($bubble1, $bubble2, $bubble3)));
```

**Admin Commands ใน Admin Group (เพิ่มใหม่):**
- `@bot` → Flex carousel 3 หน้า (B2B 2 หน้า + B2F 1 หน้า)
- `สั่งโรงงาน` / `สั่งซื้อโรงงาน` → เปิด LIFF สร้าง PO
- `ดูPO` / `po` → Flex สรุป PO ค้าง/ใกล้ส่ง/ล่าช้า

**Maker Commands (ในห้อง Maker — Bot ตัวเดียวกัน):**
- `@bot` → Flex menu: [ดู PO ที่รอ] [ส่งของ]
- `ส่งของ` → แสดง PO ที่ confirmed → เลือก PO → mark delivering

**ไฟล์ที่ต้องแก้:**
- `[B2B] Snippet 1` — เพิ่ม Bubble 3 ใน `b2b_build_flex_command_menu_admin()`
- `[B2B] Snippet 2` — เพิ่ม routing สำหรับ Maker group_id + B2F commands ใน Admin group

### 5.4 LINE Flex Messages ที่ต้องสร้าง

| Flex | Destination | Trigger |
|------|-------------|---------|
| PO ใหม่ (รายการ + ยอดรวม + ปุ่มยืนยัน/ปฏิเสธ) | Maker Group | Admin สร้าง PO |
| PO สร้างสำเร็จ (สรุป + link) | Admin Group | Admin สร้าง PO |
| Maker ยืนยัน + ETA | Admin Group | Maker confirm |
| Maker ปฏิเสธ + เหตุผล | Admin Group | Maker reject |
| ETA reminder (D-3, D-1, D-day) | Maker + Admin | Cron |
| Overdue alert (สีแดง) | Admin Group | Cron |
| Maker ขอเลื่อน + ปุ่ม approve/reject | Admin Group | Maker request |
| ใบรับของ (รายการ + QC + จำนวน) | Maker Group | Admin ตรวจรับ |
| แจ้งจ่ายเงิน | Maker Group | Admin จ่ายเงิน |
| PO ยกเลิก | Maker Group | Admin cancel |
| PO แก้ไข (ฉบับที่ N) | Maker Group | Admin amend |
| Daily summary (สรุปประจำวัน) | Admin Group | Cron 18:00 |
| Weekly summary (สรุปรายสัปดาห์) | Admin Group | Cron จันทร์ 09:00 |

### 5.5 Cron Jobs

| Schedule | Job | Description |
|----------|-----|-------------|
| Daily **08:30** | `b2f_delivery_reminder` | เตือน PO ใกล้ ETA (D-3, D-1, D-day) — query เฉพาะ status IN (confirmed, delivering) |
| Daily **09:00** | `b2f_overdue_check` | แจ้ง PO เลย ETA (D+1, D+3, D+7+) |
| Daily **09:30** | `b2f_maker_noresponse` | เตือน Maker ที่ไม่ตอบ 24h, 48h, escalate 72h (นับจาก `post_date` ของ PO) |
| Daily 18:00 | `b2f_daily_summary` | สรุปประจำวัน → Admin Group |
| Weekly Mon 09:00 | `b2f_payment_due_check` | PO รับของแล้วแต่ยังไม่จ่าย ใกล้ครบ credit term |
| Weekly Mon 09:00 | `b2f_weekly_summary` | สรุปรายสัปดาห์: PO ใหม่, outstanding payments, Maker performance |

> **หมายเหตุ**: แยกเวลา cron (08:30, 09:00, 09:30) เพื่อกระจาย DB load ไม่ spike พร้อมกัน
> **แนะนำ**: ใช้ real system crontab (`wp-cron.php`) แทน WP pseudo-cron เพราะ reminder ต้อง reliable
> **Query optimization**: ทุก cron filter เฉพาะ status + date range ที่เกี่ยวข้อง ไม่ scan ทุก PO

### 5.6 Rate Limiting

| Endpoint | Limit |
|----------|-------|
| `/create-po` | 10 req/min per admin |
| `/maker-confirm` | 5 req/min per group |
| `/receive-goods` | 5 req/min per admin |

---

## 6. UI Wireframes

### 6.1 B2F Admin Dashboard — `[b2f_admin_dashboard]`

```
┌────────────────────────────────────────────┐
│  DINOCO B2F — ระบบสั่งซื้อจากโรงงาน         │
│  [+ สร้าง PO ใหม่]                         │
├────────────────────────────────────────────┤
│  KPI Cards (2x2 grid)                       │
│  ┌────────────┐ ┌────────────┐             │
│  │ PO รอยืนยัน │ │ PO ใกล้ส่ง  │             │
│  │     5       │ │     3       │             │
│  └────────────┘ └────────────┘             │
│  ┌────────────┐ ┌────────────┐             │
│  │ PO ล่าช้า   │ │ ค้างจ่าย    │             │
│  │     2       │ │ ฿45,000    │             │
│  └────────────┘ └────────────┘             │
├────────────────────────────────────────────┤
│  Tabs:                                      │
│  [ทั้งหมด] [รอยืนยัน] [ยืนยันแล้ว]          │
│  [รอรับของ] [รอจ่ายเงิน] [เสร็จแล้ว]         │
├────────────────────────────────────────────┤
│  Filter: [โรงงาน v] [วันที่ v] [ค้นหา...]  │
├────────────────────────────────────────────┤
│  PO Card                                    │
│  ┌────────────────────────────────────┐    │
│  │ PO-DNC-260330-001       submitted  │    │
│  │ โรงงาน: ABC Manufacturing         │    │
│  │ 3 รายการ | ราคาทุนรวม: ฿15,000    │    │
│  │ กำหนดส่ง: 05/04/2026              │    │
│  │ [ดูรายละเอียด] [ตรวจรับ] [ยกเลิก]  │    │
│  └────────────────────────────────────┘    │
└────────────────────────────────────────────┘
```

### 6.2 สร้าง PO (LIFF Page)

```
┌────────────────────────────────────────────┐
│  สร้างใบสั่งซื้อใหม่                         │
├────────────────────────────────────────────┤
│  โรงงาน: [เลือกโรงงาน v]                   │
│  (เลือกแล้วแสดง catalog ของโรงงานนั้น)       │
├────────────────────────────────────────────┤
│  รายการสินค้า:                              │
│  ┌──────────────────────────────────────┐  │
│  │ DNCCB500X001IRONBR                   │  │
│  │ Crash Bar: ชุดบนซ้าย Pro Rally IRON  │  │
│  │ ราคาทุน: ฿1,462.50/ชิ้น              │  │
│  │ จำนวน: [ 10 ] [-] [+]               │  │
│  │ รวม: ฿14,625.00                     │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │ SKU-002 การ์ดน้ำมัน Rebel 500        │  │
│  │ ราคาทุน: ฿280/ชิ้น                   │  │
│  │ จำนวน: [ 20 ] [-] [+]               │  │
│  │ รวม: ฿5,600                         │  │
│  └──────────────────────────────────────┘  │
│  [+ เพิ่มสินค้า]                            │
├────────────────────────────────────────────┤
│  ยอดรวมราคาทุน: ฿20,225.00               │
│  ต้องการรับภายใน: [__/__/____]            │
│  หมายเหตุ: [________________________]     │
├────────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐  │
│  │         [ยืนยันสั่งซื้อ]              │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

### 6.3 Maker LIFF: ยืนยัน PO

```
┌────────────────────────────────────────────┐
│  ใบสั่งซื้อจาก DINOCO                        │
│  PO-DNC-260330-001                          │
├────────────────────────────────────────────┤
│  รายการสินค้า:                              │
│  1. DNCCB500X001IRONBR                     │
│     Crash Bar ชุดบนซ้าย x10  ฿14,625      │
│  2. SKU-002 การ์ดน้ำมัน Rebel x20  ฿5,600  │
│  ───────────────────────                    │
│  ยอดรวม: ฿20,225.00                       │
├────────────────────────────────────────────┤
│  วันที่คาดว่าจะส่ง:                         │
│  [__/__/____] (date picker, min=tomorrow)  │
│  หมายเหตุ: [________________________]     │
├────────────────────────────────────────────┤
│  [ปฏิเสธ PO]            [ยืนยันวันส่ง]      │
└────────────────────────────────────────────┘
```

### 6.4 ตรวจรับสินค้า (LIFF)

```
┌────────────────────────────────────────────┐
│  ตรวจรับสินค้า — PO-DNC-260330-001         │
├────────────────────────────────────────────┤
│  DNCCB500X001IRONBR                        │
│  Crash Bar ชุดบนซ้าย Pro Rally IRON        │
│  สั่ง: 10 | ราคาทุน: ฿1,462.50/ชิ้น       │
│  รับแล้ว (สะสม): 0                         │
│  จำนวนรับครั้งนี้: [ 10 ]                   │
│  QC: (o) ผ่าน  ( ) ไม่ผ่าน                 │
├────────────────────────────────────────────┤
│  SKU-002 การ์ดน้ำมัน Rebel 500             │
│  สั่ง: 20 | ราคาทุน: ฿280/ชิ้น             │
│  จำนวนรับครั้งนี้: [ 15 ]                   │
│  QC: ( ) ผ่าน  (o) ไม่ผ่าน                 │
│  เหตุผล: [สีไม่ตรง spec__________]        │
│  [📷 ถ่ายรูป] img1.jpg img2.jpg           │
├────────────────────────────────────────────┤
│  ผู้ตรวจรับ: [ชื่อ Admin]                   │
│  หมายเหตุ: [________________________]     │
├────────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐  │
│  │          [ยืนยันรับของ]              │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

### 6.5 Maker Management (Admin Control Panel Tab)

```
┌────────────────────────────────────────────┐
│  จัดการโรงงาน                               │
│  [+ เพิ่มโรงงานใหม่] [Search...]            │
├────────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐  │
│  │ ABC Manufacturing          active    │  │
│  │ สินค้า: 12 SKU | PO: 45 ใบ           │  │
│  │ ค้างจ่าย: ฿32,000                    │  │
│  │ [แก้ไข] [จัดการสินค้า+ราคาทุน] [ประวัติ]│  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ XYZ Parts Co.              active    │  │
│  │ สินค้า: 8 SKU | PO: 23 ใบ            │  │
│  │ ค้างจ่าย: ฿0                         │  │
│  │ [แก้ไข] [จัดการสินค้า+ราคาทุน] [ประวัติ]│  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

### 6.6 Maker Product + ราคาทุน Management

```
┌────────────────────────────────────────────┐
│  สินค้าที่ผลิต — ABC Manufacturing          │
│  [+ เพิ่ม SKU]                              │
├────────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐  │
│  │ DNCCB500X001IRONBR                   │  │
│  │ Crash Bar ชุดบนซ้าย Pro Rally IRON   │  │
│  │ ราคาทุน: ฿1,462.50   MOQ: 5 ชิ้น    │  │
│  │ Lead time: 14 วัน                    │  │
│  │ สั่งล่าสุด: 15/03/2026               │  │
│  │ [แก้ไขราคาทุน] [ลบ]                  │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

### 6.7 Mobile-First UX Rules

- **Single-column layout** — ห้ามใช้ 2-column ใน LIFF
- **Sticky bottom action bar** — ปุ่ม "ยืนยัน" อยู่ล่างสุดเสมอ (`position: fixed; bottom: 0`)
- **Touch targets** — ปุ่มสูงอย่างน้อย 48px
- **Loading states** — ทุก API call มี skeleton/spinner
- **Double-press lock** — ปุ่มที่กดแล้ว disable + spinner (reuse B2B pattern)
- **Offline detection** — แสดง banner "ไม่มีอินเทอร์เน็ต" + save draft ลง localStorage
- **Date picker** — ใช้ native `<input type="date">` set min=tomorrow
- **Camera** — `<input type="file" accept="image/*" capture="environment">` + compress < 1MB

---

## 7. Dependencies & Impact

### Files ที่ต้องสร้างใหม่

| File | Purpose |
|------|---------|
| `[B2F] Snippet 0: CPT & ACF Registration` | **สร้างก่อนทุกอย่าง** — register_post_type + acf_add_local_field_group สำหรับ 5 CPTs |
| `[B2F] Snippet 1: Core Utilities & Flex Builders` | Helpers, B2F Flex templates (13 ตัว), LIFF URL builder, `b2f_build_flex_command_menu_maker()` |
| `[B2F] Snippet 2: REST API` | CRUD Maker, PO, Receiving, Payment, Credit endpoints (namespace `/b2f/v1/`) |
| `[B2F] Snippet 3: Webhook Handler & Bot Commands` | `b2f_route_maker_command()`, `b2f_handle_postback()` — เรียกจาก B2B Snippet 2 ผ่าน `function_exists()` |
| `[B2F] Snippet 4: Maker LIFF Pages` | ยืนยัน PO, ดูประวัติ, ขอเลื่อน (Signed URL + JWT auth) |
| `[B2F] Snippet 5: Admin Dashboard Tabs` | shortcode modules: `[b2f_admin_orders_tab]`, `[b2f_admin_makers_tab]`, `[b2f_admin_credit_tab]` |
| `[B2F] Snippet 6: Order State Machine` | FSM class (reuse B2B Snippet 14 pattern) |
| `[B2F] Snippet 7: Credit Transaction Manager` | Atomic `b2f_payable_add/subtract` (copy B2B Snippet 13 pattern, ชื่อแยก `payable` ไม่ใช่ `debt`) |
| `[B2F] Snippet 8: Cron Jobs` | Reminders (08:30), overdue (09:00), no-response (09:30), summary (18:00), weekly |

### Files ที่ต้องแก้ไข

| File | Change |
|------|--------|
| `[B2B] Snippet 1: Core Utilities` | เพิ่ม **Bubble 3 (B2F)** ใน `b2b_build_flex_command_menu_admin()` |
| `[B2B] Snippet 2: Webhook Gateway` | เพิ่ม routing สำหรับ Maker group_id + B2F admin commands |
| `[Admin System] DINOCO Admin Dashboard` | **เพิ่ม sidebar section "B2F System"** + tabs: B2F Orders, B2F Makers, B2F Credit |
| `[Admin System] DINOCO Global Inventory Database` | เพิ่ม `b2f_update_inventory()` เมื่อรับของ |
| `[Admin System] DINOCO Admin Finance Dashboard` | เพิ่ม section "ต้นทุนสินค้า" — ยอดจ่ายโรงงาน, margin, credit |
| `CLAUDE.md` | เพิ่ม B2F context, shortcodes, endpoints |

### Admin Dashboard — เพิ่ม Sidebar Section "B2F System"

เพิ่มหลัง section "B2B System" ใน sidebar ของ `[Admin System] DINOCO Admin Dashboard`:

```html
<!-- Section: B2F System (ใหม่) -->
<div class="nav-section">B2F System</div>
<div class="nav-item" data-tab="b2f_orders" onclick="switchTab('b2f_orders')">
    <i class="fa-solid fa-industry" style="color: #f59e0b;"></i>
    <span class="nav-text">B2F Orders</span>
    <span class="nav-badge" id="badge-b2f"></span>
</div>
<div class="nav-item" data-tab="b2f_makers" onclick="switchTab('b2f_makers')">
    <i class="fa-solid fa-building" style="color: #f59e0b;"></i>
    <span class="nav-text">Makers/โรงงาน</span>
</div>
<div class="nav-item" data-tab="b2f_credit" onclick="switchTab('b2f_credit')">
    <i class="fa-solid fa-hand-holding-dollar" style="color: #f59e0b;"></i>
    <span class="nav-text">B2F Credit</span>
</div>
```

**B2F Tabs ที่ต้องสร้างใน Admin Dashboard:**

| Tab | Content |
|-----|---------|
| `b2f_orders` | PO list (filter by status/maker/date) + สร้าง PO + ตรวจรับ + จ่ายเงิน — **ทุกอย่างที่ทำใน LIFF ต้องทำได้ที่นี่** |
| `b2f_makers` | CRUD โรงงาน + จัดการ SKU + ราคาทุน + ข้อมูลติดต่อ/บัญชี |
| `b2f_credit` | เครดิตระหว่าง DINOCO กับ Maker — ยอดค้างจ่าย, วงเงิน, ประวัติการจ่าย |

### Prerequisites

| Dependency | Action |
|------------|--------|
| ใช้ LINE OA ตัวเดียวกับ B2B | ไม่ต้องสร้างใหม่ — routing ตาม group_id |
| LIFF App สำหรับ B2F | สร้าง LIFF endpoint ใหม่ (ใช้ LIFF ID เดียวกันกับ B2B ได้ หรือสร้างแยก) |
| WordPress constants | เพิ่ม `B2F_LIFF_URL` (endpoint path) |
| ACF Field Groups | สร้าง field groups สำหรับ 4 CPTs ใหม่ |
| WordPress pages | `/b2f-dashboard/`, `/b2f-maker/` |

### Side Effects

| Risk | Mitigation |
|------|------------|
| CSS conflict กับ B2B/Admin | Scope CSS ด้วย prefix `.b2f-*` |
| JavaScript global scope | IIFE pattern `(function(){ ... })()` |
| DB query performance | Index `po_status`, `po_maker_id`, `po_expected_date` |
| LINE push quota (500/day) | Batch notifications เป็น carousel |
| Concurrent receiving | Transient lock `b2f_recv_lock_{po_id}` TTL 60s |
| ข้อมูลราคาทุนเป็นความลับ | Admin-only access, ไม่ส่ง third-party |

---

## 8. Implementation Roadmap

### Phase 1: MVP — สั่งซื้อ + Maker ยืนยัน + ราคาทุน

| Task | Description |
|------|-------------|
| 1.1 | สร้าง LINE OA + LIFF App สำหรับ B2F |
| 1.2 | เพิ่ม WordPress constants (B2F_*) |
| 1.3 | สร้าง ACF Field Groups (4 CPTs) |
| 1.4 | Snippet 7: B2F Order FSM |
| 1.5 | Snippet 1: Core Utilities + 4 Flex (PO, confirm, reject, reminder) |
| 1.6 | Snippet 3: REST API (makers CRUD, maker-products + ราคาทุน, create-po, maker-confirm/reject) |
| 1.7 | Snippet 2: Webhook Gateway (admin + maker commands) |
| 1.8 | Snippet 4: Admin Dashboard (PO list + สร้าง PO + Maker management + ราคาทุน management) |
| 1.9 | Snippet 5: Maker LIFF (ยืนยัน PO page) |
| **Deploy & Test** | |

### Phase 2: ตรวจรับ + Inventory Update

| Task | Description |
|------|-------------|
| 2.1 | REST API: receive-goods endpoint |
| 2.2 | Admin Dashboard: ตรวจรับ UI (modal + QC form + photo upload) |
| 2.3 | Flex templates: ใบรับของ, partial received |
| 2.4 | Inventory integration: update stock เมื่อรับของ (source='b2f') |
| 2.5 | Receipt Image Generator (reuse B2B Snippet 10 pattern) |
| **Deploy & Test** | |

### Phase 3: Payment + Cron + Reporting

| Task | Description |
|------|-------------|
| 3.1 | REST API: record-payment, payment history |
| 3.2 | Admin Dashboard: payment UI + history |
| 3.3 | Snippet 6: Cron Jobs (reminder, overdue, daily summary, payment due) |
| 3.4 | Flex templates: payment, daily summary, overdue, weekly summary |
| 3.5 | Finance Dashboard: ต้นทุนสินค้า section + margin analysis |
| **Deploy & Test** | |

### Phase 4: Polish + Advanced

| Task | Description |
|------|-------------|
| 4.1 | PO Amendment flow (แก้ไข PO + Flex แจ้ง Maker) |
| 4.2 | Maker reschedule flow (ขอเลื่อน + Admin approve) |
| 4.3 | Maker LIFF: ดูประวัติ PO ของตัวเอง |
| 4.4 | Reorder (สั่งซ้ำจาก PO เก่า) |
| 4.5 | CSV export (PO history, payment history) |
| 4.6 | Maker performance report (on-time rate, reject rate) |
| 4.7 | Price history per SKU per Maker |
| 4.8 | AI integration: B2F data ให้ AI Assistant ตอบได้ |
| **Deploy & Test** | |

---

## 9. สิ่งที่คิดเพิ่มจากที่ User ไม่ได้ระบุ

| สิ่งที่เพิ่ม | เหตุผล |
|-------------|--------|
| **Maker CRUD** | ต้องมีฐานข้อมูลโรงงานก่อนจะสั่งซื้อได้ |
| **Maker Product mapping + ราคาทุน** | โรงงานแต่ละที่ผลิตต่างกัน ราคาทุนต่างกัน (เหมือน Zort) |
| **Quality Control (QC)** | ตรวจรับต้อง check คุณภาพ + ถ่ายรูป |
| **Partial delivery** | โรงงานอาจส่งไม่ครบรอบเดียว |
| **Payment tracking** | ต้องจ่ายเงินโรงงาน ต้องมี record |
| **PO amendment** | สั่งแล้วอาจต้องแก้ไข |
| **Maker reschedule** | โรงงานอาจเลื่อนส่ง ต้องมี approve flow |
| **Maker reject** | โรงงานอาจปฏิเสธ PO (สินค้าหมด, ราคาไม่ตรง) |
| **Delivery reminders (cron)** | ระบบต้อง proactive |
| **Overdue escalation** | ล่าช้าต้องแจ้งอัตโนมัติตามจำนวนวัน |
| **Maker no-response reminder** | 24h, 48h, 72h escalate |
| **Inventory auto-update** | รับของเข้าต้อง update stock ทันที |
| **Finance integration** | ราคาทุนสำหรับ margin analysis |
| **Receiving CPT แยก** | 1 PO รับของได้หลายครั้ง |
| **Payment CPT แยก** | 1 PO จ่ายเงินได้หลายครั้ง (partial) |
| **Kill switch** | `B2F_DISABLED` constant ปิดทั้งระบบทันที |
| **Dedup protection** | ป้องกัน PO ซ้ำ |
| **ระบบเครดิต Maker** | DINOCO เป็นหนี้ Maker — วงเงิน, ค้างจ่าย, credit hold, dunning (กลับด้านจาก B2B) |
| **B2F ใน Admin Dashboard** | เพิ่ม sidebar section B2F + 3 tabs (Orders, Makers, Credit) ทำได้ทุกอย่างบน PC |
| **เพิ่ม Bubble 3 ใน Flex menu** | ใช้ Bot เดียวกับ B2B — routing ตาม group_id แยก Flex ให้แต่ละ role |
| **Price snapshot** | PO บันทึกราคาทุน ณ วันสั่ง ไม่เปลี่ยนตามราคาปัจจุบัน |

---

## 10. Risk & Mitigation

| Risk | Mitigation |
|------|------------|
| Maker ไม่ถนัด LINE Bot | Flex ง่ายที่สุด, ปุ่มใหญ่ชัดเจน, fallback โทรแจ้ง |
| LINE push quota หมด | Batch notifications, carousel Flex |
| Admin สร้าง PO ซ้ำ | Dedup check: Maker+SKU+qty ภายใน 5 นาที |
| Inventory race condition กับ B2B | Transient lock, log ทุก mutation |
| ข้อมูลราคาทุนรั่ว | Admin-only, ข้อมูลเป็นความลับเหมือน Finance |
| LIFF ช้า (โรงงานนอกเมือง) | Lazy load, minimal JS, inline CSS |
| ราคาทุนเปลี่ยนระหว่าง PO | PO snapshot ราคา ณ วันสั่ง |

---

## 11. Rollback Plan

### Kill Switch

```php
define('B2F_DISABLED', true);
```
ทุก B2F snippet เช็ค `if (defined('B2F_DISABLED') && B2F_DISABLED) return;` บรรทัดแรก

### Phase Rollback

| Phase | Method |
|-------|--------|
| Phase 1 | Deactivate B2F snippets → ไม่กระทบ B2B |
| Phase 2 | Revert Snippet 3+4 กลับ Phase 1, ลบ receiving records |
| Phase 3 | Revert cron snippet, unschedule WP cron events |
| Phase 4 | Revert individual features |

### Data

- CPT data (b2f_*) เป็น WordPress posts → ลบได้ด้วย WP-CLI
- Inventory updates มี `source='b2f_receiving'` → trace back ได้
- ACF field groups ลบได้จาก ACF UI

---

## 12. API Request/Response Format (เพิ่มจาก Deep Review)

### `POST /wp-json/b2f/v1/create-po`
```
Request: {
  maker_id: 123,
  items: [
    { sku: "DNCCB500X001IRONBR", qty: 10 },
    { sku: "SKU-002", qty: 20 }
  ],
  requested_date: "2026-04-10",  // optional
  note: "ต้องการด่วน"             // optional
}

Response (success): {
  success: true,
  po_id: 456,
  po_number: "PO-DNC-260330-001",
  total_amount: 20225.00,
  items: [
    { sku: "DNCCB500X001IRONBR", qty: 10, unit_cost: 1462.50, subtotal: 14625.00 },
    { sku: "SKU-002", qty: 20, unit_cost: 280.00, subtotal: 5600.00 }
  ]
}

Response (error): {
  success: false,
  error: "Maker ถูกระงับเครดิต ไม่สามารถสร้าง PO ได้",
  code: "CREDIT_HOLD"
}

Error codes: CREDIT_HOLD, DUPLICATE_PO, INVALID_MAKER, INVALID_SKU, MISSING_ITEMS
```

### `POST /wp-json/b2f/v1/maker-confirm`
```
Request: {
  token: "<JWT>",           // จาก Signed URL
  expected_date: "2026-04-08",
  note: "ผลิตได้ตามกำหนด"    // optional
}

Response: { success: true, po_id: 456, status: "confirmed" }
Error: { success: false, error: "PO ถูกยกเลิกแล้ว", code: "PO_CANCELLED" }
```

### `POST /wp-json/b2f/v1/receive-goods`
```
Request: (FormData — multipart เพราะมี photo upload)
  po_id: 456
  items: JSON string [
    { sku: "DNCCB500X001IRONBR", qty_received: 10, qc_status: "passed" },
    { sku: "SKU-002", qty_received: 15, qc_status: "failed",
      reject_qty: 5, reject_reason: "สีไม่ตรง spec" }
  ]
  photos_SKU-002[]: <File>   // photo upload per rejected SKU
  inspected_by: "Admin Name"
  note: ""

Response: {
  success: true,
  rcv_id: 789,
  rcv_number: "RCV-260408-001",
  po_status: "partial_received",  // or "received"
  inventory_updated: true,
  debt_added: 18425.00
}
```

### `POST /wp-json/b2f/v1/record-payment`
```
Request: (FormData)
  po_id: 456
  amount: 18425.00
  date: "2026-04-10"
  method: "transfer"          // transfer/cheque/cash
  reference: "SCB-20260410-xxx"
  slip_image: <File>          // optional
  note: ""

Response: {
  success: true,
  pmt_id: 101,
  payment_status: "paid",     // or "partial_paid"
  remaining: 0.00,
  po_status: "completed"      // auto-complete ถ้าจ่ายครบ
}

Validation: amount ต้อง <= (po_total - po_paid_amount), ถ้าเกิน → error OVERPAYMENT
```

### `POST /wp-json/b2f/v1/approve-reschedule` (เพิ่มใหม่)
```
Request: { po_id: 456, approved: true, note: "อนุมัติเลื่อนได้" }
Response: { success: true, new_eta: "2026-04-15", po_status: "confirmed" }
```

### `GET /wp-json/b2f/v1/dashboard-stats`
```
Response: {
  pending_confirm: 5,     // PO รอ Maker ยืนยัน
  confirmed: 8,           // ยืนยันแล้ว รอส่ง
  overdue: 2,             // เลยกำหนดส่ง
  total_payable: 245000,  // ค้างจ่ายรวม
  overdue_payable: 32000, // ค้างจ่ายเลยกำหนด
  po_this_month: 15,
  po_last_month: 12
}
```

---

## 13. Technical Specifications (เพิ่มจาก Deep Review)

### 13.1 CPT & ACF Registration — Snippet แรกสุดที่ต้องสร้าง

ต้องสร้าง `[B2F] Snippet 0: CPT & ACF Registration` ก่อนทุกอย่าง:

```php
// register_post_type('b2f_maker', [...]);
// register_post_type('b2f_order', [...]);
// register_post_type('b2f_receiving', [...]);
// register_post_type('b2f_payment', [...]);
// register_post_type('b2f_maker_product', [...]);
// + acf_add_local_field_group() สำหรับทุก CPT
```

### 13.2 PO Number Generation — Query-based (ไม่ใช้ transient)

```php
function b2f_generate_po_number() {
    global $wpdb;
    $today = date('ymd'); // e.g. "260330"
    $count = (int) $wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM {$wpdb->posts}
         WHERE post_type = 'b2f_order'
         AND DATE(post_date) = %s",
        date('Y-m-d')
    ));
    return sprintf('PO-DNC-%s-%03d', $today, $count + 1);
    // PO-DNC-260330-001, PO-DNC-260330-002, ...
}
```

### 13.3 LINE Keyword List — Collision Prevention

| Command (Admin Group) | Module | ห้ามซ้ำ |
|------------------------|--------|---------|
| `สั่งของ` / `order` | B2B | — |
| `เช็คหนี้` / `ดูบัญชี` | B2B | — |
| `สถานะ` / `status` | B2B | — |
| `สั่งโรงงาน` / `สั่ง maker` | **B2F** | ไม่ซ้ำ B2B |
| `ดูPO` / `po` | **B2F** | ไม่ซ้ำ B2B |
| `สรุปโรงงาน` | **B2F** | ไม่ซ้ำ `สรุป` ของ B2B |

| Command (Maker Group) | Module |
|-------------------------|--------|
| `@bot` | B2F Flex menu: [ดู PO ที่รอ] [ส่งของ] |
| `ส่งของ` / `deliver` | B2F: เลือก PO → mark delivering |
| `ดูPO` | B2F: แสดง PO list ของ Maker |

### 13.4 Maker Group Onboarding Flow

```
1. Admin invite Bot เข้ากลุ่ม LINE ของ Maker
2. Bot ได้ webhook event type = "join"
3. Bot ตอบในกลุ่ม: "สวัสดีครับ DINOCO B2F Bot พร้อมใช้งาน
   Group ID: Cxxxxxxxxx กรุณาแจ้ง Admin เพื่อเชื่อมต่อระบบ"
4. Admin เปิด B2F Dashboard → Makers → สร้าง/แก้ไข Maker → ใส่ Group ID
5. ระบบ validate: group_id ต้องไม่ซ้ำกับ distributor หรือ maker อื่น
6. เสร็จ → Maker พิมพ์ @bot ในกลุ่มจะเห็น B2F menu
```

### 13.5 LIFF ID Decision

**สร้าง LIFF ID ใหม่ 1 ตัวสำหรับ B2F** — ใช้ path routing (เหมือน B2B):
- `/b2f-maker/` — Maker pages (confirm, reject, reschedule, PO list)
- `/b2f-create-po/` — Admin สร้าง PO
- `/b2f-receive/` — Admin ตรวจรับ

### 13.6 Snippet แยก Strategy — ไม่ embed ใน B2B/Admin ตรง

```
Snippet 2 (Webhook Gateway — 3,400 บรรทัด):
├── เพิ่มแค่ routing logic (~30 บรรทัด):
│   if (function_exists('b2f_route_maker_command')) {
│       $maker = b2f_get_maker_by_group($group_id);
│       if ($maker) { b2f_route_maker_command($event, $maker); return; }
│   }
└── B2F logic ทั้งหมดอยู่ใน [B2F] Snippet แยก

Admin Dashboard (4,468 บรรทัด):
├── เพิ่มแค่ sidebar HTML + tab wrappers (~20 บรรทัด)
├── Tab content render ผ่าน shortcode modules:
│   <div id="tab-wrapper-b2f_orders" class="section-view">
│       <?php echo do_shortcode('[b2f_admin_orders_tab]'); ?>
│   </div>
└── B2F UI ทั้งหมดอยู่ใน [B2F] Snippet แยก (lazy load เมื่อ click tab)
```

### 13.7 Status Badge Color Map

| Status | สี | Badge Class | Thai Label |
|--------|-----|------------|------------|
| `draft` | Gray `#6b7280` | `.b2f-badge-gray` | แบบร่าง |
| `submitted` | Blue `#3b82f6` | `.b2f-badge-blue` | ส่งแล้ว |
| `confirmed` | Green `#22c55e` | `.b2f-badge-green` | ยืนยันแล้ว |
| `amended` | Purple `#a855f7` | `.b2f-badge-purple` | แก้ไขแล้ว |
| `rejected` | Red `#ef4444` | `.b2f-badge-red` | ปฏิเสธ |
| `delivering` | Cyan `#06b6d4` | `.b2f-badge-cyan` | กำลังส่ง |
| `received` | Emerald `#10b981` | `.b2f-badge-emerald` | รับครบแล้ว |
| `partial_received` | Amber `#f59e0b` | `.b2f-badge-amber` | รับบางส่วน |
| `paid` | Green `#22c55e` | `.b2f-badge-green` | จ่ายแล้ว |
| `partial_paid` | Amber `#f59e0b` | `.b2f-badge-amber` | จ่ายบางส่วน |
| `completed` | Slate `#64748b` | `.b2f-badge-slate` | เสร็จสิ้น |
| `cancelled` | Red `#ef4444` | `.b2f-badge-red` | ยกเลิก |

> **CSS accent color**: `--accent-b2f: #d97706` (amber-600 สำหรับ text ผ่าน WCAG AA contrast ratio)

---

## 14. Testing Checklist

### Maker Management
- [ ] สร้าง Maker + เพิ่ม SKU + ราคาทุน
- [ ] แก้ไขราคาทุน → PO ใหม่ใช้ราคาใหม่, PO เก่าไม่เปลี่ยน (snapshot)
- [ ] ลบ Maker ที่มี PO → soft delete (inactive)

### PO + ราคาทุน
- [ ] สร้าง PO → ราคาทุนดึงจาก maker_product ถูกต้อง
- [ ] ยอดรวม = sum(qty × unit_cost) คำนวณถูก
- [ ] Flex ส่งไป Maker Group สำเร็จ
- [ ] Duplicate check ทำงาน (สั่งซ้ำ 5 นาที)

### Maker Actions
- [ ] Maker ยืนยัน + ETA → status=confirmed, Flex แจ้ง Admin
- [ ] Maker ปฏิเสธ → status=rejected, Flex แจ้ง Admin
- [ ] Maker เปิด LIFF นอก LINE → redirect
- [ ] ETA วันในอดีต → blocked

### Receiving
- [ ] รับครบ → received, inventory updated
- [ ] รับบางส่วน → partial_received
- [ ] QC reject + รูป → logged correctly
- [ ] จำนวนรับ > สั่ง → blocked
- [ ] 2 admin ตรวจรับพร้อมกัน → transient lock

### Payment
- [ ] จ่ายครบ → paid → completed
- [ ] จ่ายบางส่วน → partial_paid
- [ ] จ่ายเกินยอด → blocked

### Cron
- [ ] ETA D-3, D-1, D-day → reminder ถูก
- [ ] Overdue D+1 → alert ถูก
- [ ] Maker ไม่ตอบ 72h → escalate Admin
- [ ] Daily summary → สรุปถูก

### Edge Cases
- [ ] Mobile LINE in-app browser ใช้ได้ทุกหน้า
- [ ] Offline → banner + draft saved
- [ ] กดปุ่มซ้ำ → ไม่ duplicate
