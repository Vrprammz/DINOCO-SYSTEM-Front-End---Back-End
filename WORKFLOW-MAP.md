# DINOCO Workflow Map — ลูกค้ากดอะไร ไปอะไร / แอดมินกดอะไร ไปอะไร

> ทุกปุ่ม ทุก Flex card ทุกหน้า ทุก modal — ละเอียดระดับ "กดปุ่มนี้ → เกิดอะไร"

---

## สารบัญ

1. [B2C Member Flow](#b2c-member-flow) — สมาชิกทั่วไป
2. [B2B Distributor Flow (LINE)](#b2b-distributor-flow) — ตัวแทนจำหน่าย
3. [B2B Admin Flow (LINE)](#b2b-admin-flow-line) — แอดมิน B2B ใน LINE
4. [Admin Dashboard Flow](#admin-dashboard-flow) — แอดมิน Web Dashboard
5. [Flex Card Button Map](#flex-card-button-map) — ปุ่มทุกปุ่มใน Flex Card
6. [LIFF Page Map](#liff-page-map) — หน้า LIFF ทั้งหมด

---

## B2C Member Flow

### หน้า Login (`/warranty/` → `[dinoco_login_button]`)

```
ยังไม่ login:
  [เข้าสู่ระบบด้วย LINE] → LINE OAuth → callback → สร้าง/link user → redirect

login แล้ว:
  [เข้าสู่แดชบอร์ด] → /member-dashboard/

มี serial param (?serial=XXX):
  [เข้าสู่ระบบ] → LINE OAuth → callback → /member-dashboard/?register_serial=XXX

ปฏิเสธ LINE auth:
  → redirect /warranty/?login_error=denied → แสดงแถบแดง "ไม่สามารถเข้าสู่ระบบได้"
```

### หน้า Dashboard (`/member-dashboard/` → `[dinoco_dashboard]`)

```
ครั้งแรก (ยังไม่เลือก segment):
  ┌────────────────────────────┐
  │ [ลูกค้าบัตรสมาชิกเดิม]    │ → /legacy-migration
  │ [ลูกค้าระบบใหม่ QR]       │ → ต่อไป PDPA form
  └────────────────────────────┘

PDPA ยังไม่ยอมรับ:
  ┌────────────────────────────┐
  │ ○ ยินยอม / ○ ไม่ยินยอม   │ (Analytics)
  │ ○ ยินยอม / ○ ไม่ยินยอม   │ (Marketing)
  │ [ยืนยัน]                   │ → บันทึก consent → ต่อไป
  │ [ปฏิเสธและออกจากระบบ]      │ → logout
  └────────────────────────────┘

ยังไม่กรอก profile:
  ┌────────────────────────────┐
  │ ชื่อ*, นามสกุล*, วันเกิด* │
  │ เบอร์โทร*, ที่อยู่*       │
  │ จังหวัด → อำเภอ → ตำบล    │ (cascading dropdown)
  │ [ถัดไป]                    │ → บันทึก → หน้ารถ
  └────────────────────────────┘

ยังไม่กรอกข้อมูลรถ:
  ┌────────────────────────────┐
  │ [Honda] [ยี่ห้ออื่นๆ]     │ (brand cards)
  │ รุ่น (dropdown/text)       │
  │ ปี (2010-2026)             │
  │ [บันทึกข้อมูล]            │ → บันทึก → Dashboard พร้อมใช้
  └────────────────────────────┘

Dashboard พร้อมใช้:
  ┌────────────────────────────┐
  │ 🎫 MEMBER CARD             │ (QR code + ชื่อ)
  │ ─────────────────────────  │
  │ [📷 ลงทะเบียน] → QR Scanner modal
  │ [🔧 แจ้งเคลม]  → /claim-system/
  │ [🤝 โอนสิทธิ์]  → /transfer-warranty/
  │ ─────────────────────────  │
  │ 🔍 ค้นหา Serial [ค้นหา]   │ → ?register_serial=XXX
  │ ─────────────────────────  │
  │ 📦 รายการสินค้าของคุณ      │ (product cards grid)
  └────────────────────────────┘
```

### QR Scanner Modal

```
[📷 ลงทะเบียน] กดแล้ว:
  ┌────────────────────────────┐
  │ 📸 กล้อง (fullscreen)      │
  │ [🔦 Flash] [✕ ปิด]        │
  │ สแกน QR สำเร็จ → ?register_serial=<scanned>
  │ ──────────────────────────  │
  │ QR อ่านไม่ได้? พิมพ์รหัสเอง│
  │ [DNC-XXXXX____] [ยืนยัน]  │ → ?register_serial=<typed>
  └────────────────────────────┘
```

### Product Card (ขยาย)

```
กดที่ product card:
  ┌────────────────────────────┐
  │ รูปสินค้า                   │
  │ Model / SKU / Barcode       │
  │ ──────────────────────────  │
  │ 📋 ข้อมูลประกัน            │
  │ สถานะ: [badge สี]          │
  │ ลงทะเบียน: dd/mm/yyyy      │
  │ หมดอายุ: dd/mm/yyyy         │
  │ ──────────────────────────  │
  │ 🔧 ประวัติซ่อม            │ (timeline)
  │ ──────────────────────────  │
  │ 📦 Claim Timeline           │ (5 dots progress)
  │ ──────────────────────────  │
  │ (ถ้ารอส่งของ):             │
  │   เลข Tracking [____] [บันทึก] → AJAX save_track
  │ (ถ้าซ่อมเสร็จ):           │
  │   [✅ ยืนยันรับสินค้า]     │ → AJAX confirm_receipt
  └────────────────────────────┘
```

### หน้าเคลม (`/claim-system/` → `[dinoco_claim_page]`)

```
Step 1: เลือกสินค้า + ปัญหา
  ┌────────────────────────────┐
  │ 📦 เลือกสินค้า (grid)      │ → กดเลือก → highlight
  │ ──────────────────────────  │
  │ 🔧 เลือกปัญหา (grid)      │
  │  [โครงสร้างงอ] [สีหลุดลอก] │
  │  [อุปกรณ์ชำรุด] [อื่นๆ]    │
  │  [เปลี่ยนอะไหล่] [ซีลน้ำ]  │
  │ ──────────────────────────  │
  │ 📮 ผู้ส่ง                  │
  │  ○ ส่งเอง  ○ ฝากตัวแทน    │
  │  (ถ้าฝากตัวแทน → เลือกร้าน)│
  │ ──────────────────────────  │
  │ [ถัดไป]                    │
  └────────────────────────────┘

Step 2: อัพโหลดรูป
  ┌────────────────────────────┐
  │ [📸 ด้านหน้า] [📸 ด้านหลัง]│
  │ [📸 ด้านซ้าย] [📸 ด้านขวา]│
  │ [📸 จุดที่เสียหาย] *       │
  │ ──────────────────────────  │
  │ ที่อยู่ [____] (pre-filled) │
  │ หมายเหตุ [____]            │
  │ [กลับ] [ถัดไป]            │
  └────────────────────────────┘

Step 3: ยืนยัน
  ┌────────────────────────────┐
  │ สรุปข้อมูล (อ่านอย่างเดียว)│
  │ [กลับไปแก้ไข]             │
  │ [✅ ยืนยันการแจ้งเคลม]    │ → AJAX submit → สร้าง claim_ticket
  └────────────────────────────┘

Success:
  ┌────────────────────────────┐
  │ ✅ เลขเคลม: CLM-XXXXXXXX  │
  │ [🖨️ พิมพ์ใบเคลม]         │ → window.print()
  └────────────────────────────┘
```

### หน้าโอนประกัน (`/transfer-warranty/`)

```
  ┌────────────────────────────┐
  │ 👤 ข้อมูลผู้โอน           │ (LINE pic + ชื่อ)
  │ ──────────────────────────  │
  │ 📦 เลือกสินค้าที่จะโอน    │ (cards — กดเลือก)
  │ ──────────────────────────  │
  │ 🔍 ค้นหาผู้รับ            │
  │ เบอร์โทร/LINE ID: [____] [ค้นหา] │ → AJAX dinoco_v3_find
  │ (ค้นเบอร์ก่อน → fallback LINE ID) │
  │ ──────────────────────────  │
  │ 👤 ผู้รับ: [ชื่อ + รูป]    │ (แสดงหลัง search)
  │ ──────────────────────────  │
  │ ☑️ ยินยอมเงื่อนไข          │
  │ [ยืนยันโอนสิทธิ์]         │ → AJAX dinoco_v3_exec → reload
  └────────────────────────────┘
```

---

## B2B Distributor Flow

### LINE Chat Commands

```
ตัวแทนพิมพ์ในห้องไลน์:

"@DINOCO B2B System" (mention เฉยๆ)
  → Flex: Command Menu (สั่งของ / เช็คหนี้ / สถานะออเดอร์ / ขอไอดีกลุ่ม)

"สั่งของ" / "order"
  → Flex: ปุ่ม "เปิดแคตตาล็อก" → เปิด LIFF Catalog

"เช็คหนี้" / "ดูบัญชี"
  → Flex: สรุปบัญชี (หนี้ / วงเงิน / บิลค้าง)

"สถานะออเดอร์" / "เช็คสถานะ #1234"
  → Flex: รายละเอียด ticket

"ขอไอดีกลุ่ม" / "groupid"
  → ข้อความ: Group ID + ชื่อร้าน

ส่งรูปสลิป:
  → ตรวจ Slip2Go → auto-match หรือ ถามเลือกบิล → Flex ชำระสำเร็จ
```

### LIFF Catalog (สั่งของ)

```
  ┌────────────────────────────┐
  │ 🏪 [ชื่อร้าน] [Rank badge]│
  │ [สินค้า] [ประวัติสั่งซื้อ]│ (tabs)
  │ ──────────────────────────  │
  │ 🔍 ค้นหา SKU / ชื่อ       │
  │ [หมวดหมู่ chips]           │
  │ [⭐ แนะนำ chips]            │
  │ ──────────────────────────  │
  │ Product Grid (2 columns)    │
  │  [รูป] [ชื่อ] [ราคา]      │
  │  [-] [จำนวน] [+]           │
  │ ──────────────────────────  │
  │ 🛒 ตะกร้า (X รายการ ฿Y)   │ (sticky bottom)
  │ [ดูรายการ]                 │ → Cart Modal
  └────────────────────────────┘

Cart Modal:
  ┌────────────────────────────┐
  │ 📦 รายการสั่งซื้อ          │
  │ (items list with qty edit)  │
  │ ──────────────────────────  │
  │ รวม: ฿X,XXX                │
  │ หมายเหตุ: [____]           │
  │ [✅ ยืนยันสั่งซื้อ]       │ → POST /place-order → ส่งข้อความใน LINE
  └────────────────────────────┘
```

---

## B2B Admin Flow (LINE)

### เมื่อลูกค้าสั่งของ — Admin ได้รับ Flex:

```
📦 Stock Check Alert (Admin)
  ┌────────────────────────────┐
  │ ร้าน: XXX                  │
  │ รายการ: ...                │
  │ SLA: ตอบกลับภายใน 10 นาที │
  │ ──────────────────────────  │
  │ [✅ มีสินค้าครบ]          │ → stock_confirm → ส่ง Flex ยืนยันบิลให้ลูกค้า
  │ [🚫 สินค้าหมด]            │ → stock_oos → เลือก ETA
  │ [📋 มีบางรายการ]          │ → LIFF dashboard
  │ [📋 ดูรายละเอียด]         │ → LIFF ticket detail
  └────────────────────────────┘
```

### เมื่อลูกค้ายืนยันบิล — Admin เลือกวิธีส่ง:

```
📦 Shipping Choice (Admin)
  ┌────────────────────────────┐
  │ [⚡ Flash Express]         │ → สร้างพัสดุ Flash อัตโนมัติ + ปริ้น
  │ [📦 ส่งเอง]               │ → ส่ง sub-choice Flex
  └────────────────────────────┘

Sub-choice Flex (หลังกด "ส่งเอง"):
  ┌────────────────────────────┐
  │ [📬 กรอกเลข Tracking]     │ → เปิด LIFF tracking page
  │ [🏍️ Rider/Lalamove มารับ] │ → ship_rider → Flex แจ้งลูกค้า
  │ [🏪 ลูกค้ามารับเอง]      │ → ship_self_pickup → completed
  └────────────────────────────┘
```

### เมื่อลูกค้าขอยกเลิก:

```
⚠️ Cancel Request (Admin)
  ┌────────────────────────────┐
  │ [✅ อนุมัติยกเลิก]        │ → cancelled + คืนหนี้
  │ [❌ ปฏิเสธ (แพ็คแล้ว)]    │ → กลับสถานะเดิม
  │ [📋 ดูรายละเอียด]         │ → LIFF
  └────────────────────────────┘
```

### เมื่อลูกค้าเคลม:

```
↩️ Claim (Admin)
  ┌────────────────────────────┐
  │ [🔄 เปลี่ยนสินค้าใหม่]   │ → claim_exchange → ส่งของใหม่
  │ [💰 คืนเงิน]              │ → claim_refund → คืนหนี้
  │ [❌ ปฏิเสธเคลม]           │ → claim_reject → completed
  └────────────────────────────┘
```

### SLA Alert (ทุก 10 นาทีถ้าไม่กด):

```
🔔 SLA ALERT (Admin)
  ┌────────────────────────────┐
  │ ค้างมา X นาทีแล้ว!        │
  │ (ปุ่มเหมือน Flex เดิม)    │
  │ + [⏸️ เลื่อน 30 นาที]    │ → sla_snooze → reschedule
  └────────────────────────────┘
```

---

## Admin Dashboard Flow

### Command Center (`/admin-command-center/`)

```
  ┌─ Sidebar ─────────────────────────────────────────────┐
  │ MAIN                                                    │
  │  Dashboard ← default                                   │
  │  AI Chat                                                │
  │ OPERATIONS                                              │
  │  Legacy Migration                                       │
  │  Inventory                                              │
  │  Claims (badge)                                         │
  │  Users/CRM                                              │
  │  Transfer                                               │
  │ B2B SYSTEM                                              │
  │  B2B Orders (badge)                                     │
  │  B2B Admin                                              │
  │  ใบแจ้งหนี้/วางบิล                                     │
  └─────────────────────────────────────────────────────────┘

  แต่ละ tab lazy-load shortcode เมื่อคลิก
```

### B2B Orders Tab

```
KPI Cards (กดเพื่อ filter):
  [ทั้งหมด: 21] [เช็คสต็อก: 0] [รอยืนยัน: 1] [รอจัดส่ง: 15] [จัดส่งแล้ว: 0]

Flash Cards:
  [Flash รอแพ็ค: 0] [กำลังส่ง: 0] [ส่งถึง: 1] [ปัญหา: 0]

Filter chips + Search + Auto-refresh

Table:
  กด #ID → Ticket Modal:
  ┌────────────────────────────┐
  │ ✏️ Ticket #5687            │ [✕]
  │ สถานะ: paid               │
  │ ──────────────────────────  │
  │ 📦 รายการสินค้า            │
  │ (items text)               │
  │ ──────────────────────────  │
  │ ยอดรวม: [___] (editable)   │
  │ หมายเหตุ: [___]           │
  │ เปลี่ยนสถานะ: [dropdown]  │
  │ ──────────────────────────  │
  │ 🖨️ สถานะการปริ้น          │
  │ 📋 AUDIT LOG               │
  │ ──────────────────────────  │
  │ [ยกเลิก] [คำนวณใหม่]     │
  │ [⚡ สร้างพัสดุ Flash]      │
  │ [💾 บันทึก]               │
  └────────────────────────────┘
```

### ใบแจ้งหนี้/วางบิล Tab

```
List View:
  [ตรวจสลิปรวม] [ส่งสรุปบิลค้าง*] [+ สร้างใบแจ้งหนี้]
  * ส่งได้แม้ไม่มีบิลค้าง → จะส่ง Flex อัพเดทยอดบัญชี + เครดิตคงเหลือ
  Filter tabs: ทั้งหมด | รอชำระ(5) | เกินกำหนด | ชำระแล้ว | Draft | ยกเลิก

  Per-row buttons (ตามสถานะ):
    Draft:     [แก้ไข] [ออกบิล] [ลบ]
    รอชำระ:    [แก้ไข] [รับเงิน] [ส่ง LINE] [พิมพ์] [ยกเลิก]
    ชำระแล้ว:  [พิมพ์] [ส่ง LINE]

Builder View (สร้าง/แก้ไข):
  ┌────────────────────────────┐
  │ 📋 ข้อมูล                  │ 📋 ตัวแทนจำหน่าย
  │ เลขที่: INV-DNC-XXXXX     │ ชื่อตัวแทน: [search]
  │ วันที่: [date picker]      │ เครดิตคงเหลือ: ฿XX,XXX
  │ กำหนดชำระ: [date picker]   │
  │ อ้างอิง: [____]           │
  │ หมายเหตุ: [____]          │
  │ ──────────────────────────  │
  │ 🛒 สินค้า                  │
  │ [เลือกสินค้า] per row      │ → Product Picker Modal
  │ [+ เพิ่มรายการ]           │
  │ ──────────────────────────  │
  │ ราคาจำหน่าย: ฿X,XXX       │
  │ ส่วนลด: [___%] or [___฿]  │
  │ ค่าส่ง: [___]              │
  │ 💰 รวม: ฿X,XXX.XX         │
  │ ──────────────────────────  │
  │ [บันทึก Draft] [ออกบิล+ส่ง LINE]
  └────────────────────────────┘

Payment Modal (กด "รับเงิน"):
  ┌────────────────────────────┐
  │ [📎 อัพโหลดสลิป] [✏️ กรอกมือ] ← 2 tabs
  │ ──────────────────────────  │
  │ (Tab สลิป):               │
  │   [📎 เลือกไฟล์]          │ → verify Slip2Go → auto-fill
  │ (Tab กรอกมือ):            │
  │   (ช่อง amount/note เดียวกัน)
  │ ──────────────────────────  │
  │ ยอดรับชำระ: [___] *        │ (auto-fill จากยอดค้าง)
  │ หมายเหตุ: [___]           │
  │ [ยกเลิก] [บันทึก]        │
  └────────────────────────────┘
```

### B2B Admin Tab

```
7 sub-tabs:
  [ตัวแทน] [สินค้า] [Print] [ตั้งค่า] [ระบบ] [Flash Test] [คู่มือ]

ตัวแทน tab:
  [+ เพิ่มตัวแทน] [Export CSV] [Import CSV]
  Table: ID | ร้าน | Group ID | Rank | วงเงิน | หนี้ | สถานะ | BOT toggle
  Per-row: [✏️ แก้ไข] [🗑 ลบ] [🔘 Bot toggle]

  Modal เพิ่ม/แก้ไข:
    ชื่อร้าน*, Logo URL, LINE Group ID*, Rank, วงเงิน, เครดิตเทอม
    ยอดหนี้, Credit Hold, เบอร์โทร, ที่อยู่, SKU แนะนำ
    [ยกเลิก] [💾 บันทึก]

สินค้า tab:
  [+ เพิ่มสินค้า] [Export CSV] [Import CSV]
  Table: รูป | SKU | ชื่อ | ราคา | ส่วนลด | ราคาตัวแทน | สต็อก
  Per-row: [✏️ แก้ไข] [🗑 ลบ]

Print tab:
  RPi Status | คิวรอปริ้น | ปริ้นสำเร็จ | CPU Temp
  [Test Print] [รีสตาร์ท] [รีบูท] [อัปเดต] [ดึง Log]
  Warehouse address + Company address settings
```

---

## Flex Card Button Map (ทุกปุ่มใน B2B LINE)

### Order Creation Phase

| Flex Card | ปุ่ม | กดแล้ว → | ผล |
|-----------|------|---------|-----|
| **LIFF Catalog Link** | 🛍️ เปิดแคตตาล็อก | URI → LIFF catalog | เปิดหน้าสั่งของ |
| **Draft Confirm** | ✅ ส่งรายการเช็คสต็อก | postback confirm_order | draft → checking_stock + แจ้ง admin |
| | ❌ ยกเลิก/แก้ไข | postback cancel_draft | draft → cancelled |
| **Stock Check (Admin)** | ✅ มีสินค้าครบ | postback stock_confirm | → awaiting_confirm + Flex ยืนยันบิล |
| | 🚫 สินค้าหมด | postback stock_oos | → แสดง ETA selector |
| | 📋 มีบางรายการ | URI → LIFF dashboard | จัดการ partial |
| **Stock Confirmed** | ✅ ยืนยันบิล | postback confirm_bill | → awaiting_payment + เพิ่มหนี้ |
| | ❌ ยกเลิก | postback cancel_request | → ส่ง cancel request admin |

### Payment Phase

| Flex Card | ปุ่ม | กดแล้ว → | ผล |
|-----------|------|---------|-----|
| **Payment Invoice** | 📋 คัดลอกบัญชี | clipboard | copy เลขบัญชี |
| **Slip Result** | 📋 ดูออเดอร์ | URI → LIFF orders | เปิดประวัติ |
| | 💳 ดูบัญชี | URI → LIFF account | เปิดบัญชี |
| | 🛒 สั่งของ | URI → LIFF catalog | สั่งใหม่ |
| **Slip Question** | ชำระบิล INV-XXX | postback slip_pay | เลือกบิลที่จะจ่าย |

### Shipping Phase

| Flex Card | ปุ่ม | กดแล้ว → | ผล |
|-----------|------|---------|-----|
| **Shipping Choice (Admin)** | ⚡ Flash Express | postback ship_flash | สร้าง Flash + ปริ้น |
| | 📦 ส่งเอง | postback ship_manual | ปริ้น label + sub-choice |
| **Tracking Prompt (Admin)** | 📬 กรอกเลข Tracking | URI → LIFF tracking | เปิดหน้ากรอก |
| | 🏍️ Rider/Lalamove | postback ship_rider | → shipped (no tracking) |
| | 🏪 ลูกค้ามารับ | postback ship_self_pickup | → completed |
| **Shipped** | ✅ ได้รับแล้ว | postback confirm_received | → completed |
| | 📍 ติดตามพัสดุ | URI → carrier tracking | เปิด tracking website |
| **Delivery Ask (3 วัน)** | ✅ ได้รับแล้ว | postback delivery_ok | → completed |
| | ❌ ยังไม่ได้รับ | postback delivery_no | แจ้ง admin |

### Cancel & Claim

| Flex Card | ปุ่ม | กดแล้ว → | ผล |
|-----------|------|---------|-----|
| **Cancel (Admin)** | ✅ อนุมัติ | postback cancel_approve | → cancelled + คืนหนี้ (recalculate) + Flex card ลูกค้า |
| | ❌ ปฏิเสธ | postback cancel_reject | กลับสถานะเดิม + Flex card ลูกค้า |
| | 📋 ดูรายละเอียด | URI → LIFF ticket (HMAC signed) | เปิด ticket detail |
| **Claim (Admin)** | 🔄 เปลี่ยนสินค้า | postback claim_exchange | ส่งของใหม่ + Flex card ลูกค้า + delivery check 3 วัน |
| | 💰 คืนเงิน | postback claim_refund | คืนหนี้ (recalculate) + Flex card ยอดคืน |
| | ❌ ปฏิเสธ | postback claim_reject | → completed + Flex card แจ้งลูกค้า |
| **Claim Options (Customer)** | 💔 สินค้าเสียหาย | postback claim_open | → เปิดเคลม |
| | 🔄 สินค้าผิดรุ่น | postback claim_open | → เปิดเคลม |
| | 📦 สินค้าไม่ครบ | postback claim_open | → เปิดเคลม |

### Backorder

| Flex Card | ปุ่ม | กดแล้ว → | ผล |
|-----------|------|---------|-----|
| **OOS Customer** | ⏳ รอสินค้า | postback bo_wait | ยืนยันรอ |
| | ❌ ยกเลิก | postback cancel_request | ขอยกเลิก |
| **BO Restock** | 📋 ดำเนินการต่อ | postback bo_continue | → checking_stock |
| | ❌ ยกเลิก | postback cancel_request | ขอยกเลิก |
| **BO Partial (Customer)** | ✅ เอาที่มาก่อน | postback bo_accept_partial | สร้าง sub-ticket |
| | ⏳ รอจนครบ | postback bo_wait_full | รอต่อ |
| | ❌ ยกเลิกเลย | postback bo_cancel_all | → cancelled |
| **BO Overdue (Admin)** | ✅ ของมาแล้ว | postback bo_restock_admin | unlock OOS |
| | 📅 ขยาย ETA | postback bo_extend | เลือก ETA ใหม่ |
| | ❌ ยกเลิก | postback cancel_approve | → cancelled |

### Flash Express

| Flex Card | ปุ่ม | กดแล้ว → | ผล |
|-----------|------|---------|-----|
| **Pack Incomplete (Admin)** | 🚛 ส่งเฉพาะที่พร้อม | postback ship_packed_only | ส่งบางส่วน |
| | ⏸️ รอก่อน | postback postpone_pack | reset timeout |

### Dunning (ทวงหนี้อัตโนมัติ)

| Flex Card | ปุ่ม | กดแล้ว → | ผล |
|-----------|------|---------|-----|
| **Friendly / Official / Final** | 📋 คัดลอกบัญชี | clipboard | copy เลขบัญชี |

### SLA Alert (Admin)

| Flex Card | ปุ่ม | กดแล้ว → | ผล |
|-----------|------|---------|-----|
| **SLA Alert** | (ปุ่มตาม status เดิม) | postback ตาม status | ดำเนินการ |
| | ⏸️ เลื่อน 30 นาที | postback sla_snooze | เลื่อน alert |

---

## LIFF Page Map

| URL Path | Shortcode | ใครเห็น | จุดประสงค์ |
|----------|-----------|---------|----------|
| `/b2b-catalog/` | — (template_redirect) | ตัวแทน | สั่งของ + ประวัติ |
| `/b2b-orders/` | `[b2b_orders_page]` | ตัวแทน | ดูออเดอร์ทั้งหมด |
| `/b2b-account/` | `[b2b_account_page]` | ตัวแทน | ดูบัญชี/หนี้ |
| `/b2b-ticket/` | — (template_redirect) | ตัวแทน+Admin | รายละเอียด ticket |
| `/b2b-tracking/` | `[b2b_tracking_entry]` | Admin | กรอกเลข tracking |
| `/b2b-dashboard/` | `[b2b_dashboard]` | Admin | Dashboard + stock + orders |
| `/b2b-stock/` | `[b2b_stock_manager]` | Admin | จัดการ OOS/BO |
| `/b2b-commands/` | `[b2b_commands_page]` | ตัวแทน | Help/คำสั่ง |

---

## Navigation Gaps พบ (อัพเดท 2026-03-27)

> รายการด้านล่างเป็นสถานะล่าสุดหลังแก้ไข commit `a9ffba5`

1. ~~**Claim System ไม่มีปุ่มกลับ Dashboard**~~ — **ไม่เป็นปัญหา** มี Global App Menu (bottom nav) แสดงทุกหน้า
2. ~~**Transfer Warranty ไม่มีปุ่มกลับ**~~ — **ไม่เป็นปัญหา** มี Global App Menu (bottom nav) แสดงทุกหน้า
3. ~~**Edit Profile ไม่มี link จาก Dashboard**~~ — **ไม่เป็นปัญหา** Global App Menu มี tab "โปรไฟล์" ลิงก์ไป `/edit-profile/`
4. ~~**ไม่มีปุ่ม Logout บน Dashboard**~~ — **แก้แล้ว** เพิ่มปุ่ม "ออกจากระบบ" ในหน้า Edit Profile (+ มีที่ Assets List ด้านล่าง)
5. **B2B: ปิดบอทแล้ว postback ถูก block (ยกเว้น slip_pay)** — **ถูกต้องแล้ว** Manual Invoice mode ไม่มี shipping flow จึงไม่ต้อง whitelist confirm_received
6. ~~**Flash shipped ไม่มี delivery check**~~ — **แก้แล้ว** มี `b2b_delivery_check_event` schedule 3 วันหลังส่ง

### ปรับปรุงเพิ่มเติม (commit a9ffba5)
7. **QR Scanner มี Manual Entry แล้ว** — เพิ่มช่องพิมพ์ serial ด้านล่าง QR modal สำหรับกรณี QR อ่านไม่ได้
8. **Transfer ค้นหาด้วย LINE ID ได้แล้ว** — fallback search ด้วย `owner_line_id` ถ้าเบอร์โทรหาไม่เจอ
9. **LINE Auth ปฏิเสธมี error message แล้ว** — แสดงแถบแดง "ไม่สามารถเข้าสู่ระบบได้" บน Gateway
10. **Address Form มี save-draft แล้ว** — localStorage auto-save ข้อมูลฟอร์ม ปิดแล้วเปิดใหม่ข้อมูลยังอยู่

### UX/UI Audit Fixes (commit ล่าสุด)
11. **Claim empty state มี guidance แล้ว** — แสดงสาเหตุที่เป็นไปได้ + ลิงก์ไปลงทะเบียนสินค้า
12. **Claim reprint warning แก้ข้อความแล้ว** — ไม่พูดว่า "ดาวน์โหลดได้ครั้งเดียว" แล้ว (เพราะ reprint ได้จริง)
13. **html5-qrcode ไม่โหลดซ้ำแล้ว** — ลบออกจาก Dashboard Header, ใช้จาก Global App Menu ตัวเดียว
14. **Dashboard แสดง claim_process indicator** — badge สีส้ม "กำลังดำเนินการเคลม" เมื่อ w_status = claim_process
15. **Dashboard แสดง warranty expiry warning** — badge สีส้ม "ประกันเหลือ X วัน!" เมื่อเหลือ ≤30 วัน
16. **Slip 200404 ยังคง silent (ถูกต้อง)** — รูปในห้องอาจไม่ใช่สลิป (รูปสินค้า, ใบเสร็จ, etc.) ถ้า reply จะทำให้สับสน
17. **Claim "ถัดไป" มี disabled state แล้ว** — ปุ่มจะ disabled จนกว่าจะเลือกทั้งสินค้าและปัญหา
18. **Admin Claims มีปุ่ม PDF เคลม** — ลิงก์ reprint ใน claim card เปิดหน้า claim-system ในแท็บใหม่
19. **Transfer มี confirmation modal ครบแล้ว** — แสดงสินค้า + ผู้รับ + disclaimer + checkboxes ก่อน execute
20. **B2B Admin LIFF shortcode ถูกต้อง** — code ใช้ `[b2b_dashboard]` ตรงกับ WP page (doc อัพเดทแล้ว)

### Flex Card & LIFF Audit Fixes (commit aaa52c8 + e8a5962)
21. **ship_manual tracking URL แก้แล้ว** — ใช้ `b2b_build_flex_tracking_prompt()` จาก Snippet 1 แทน placeholder URL
22. **cancel_admin + packing_alert LIFF URL แก้แล้ว** — ใช้ `b2b_liff_url()` พร้อม HMAC signature + `ticket_id` param ถูกต้อง
23. **receipt "เลือก Ticket" แก้แล้ว** — link ไป Admin Dashboard search ด้วย tracking number
24. **Advisory lock เพิ่มใน bo_wait, bo_extend, delivery_no, bo_wait_full** — ป้องกัน double-tap
25. **cancel_approve, bo_cancel_all, claim_refund ใช้ b2b_recalculate_debt()** — ป้องกัน race condition หนี้ drift
26. **claim_exchange เพิ่ม delivery check 3 วัน** — schedule `b2b_delivery_check_event` หลังส่งสินค้าเปลี่ยน
27. **ลูกค้าเห็น Flex card ทุกจุดแล้ว** — claim_exchange, claim_refund, claim_reject, change_approve, change_reject, bo_restock ทั้งหมดเปลี่ยนจาก text → Flex card สวยงาม + push_guaranteed
28. **ไม่มี text push ถึงลูกค้าเหลืออยู่** — text เหลือเฉพาะ fallback ใน `else` branch กรณี `b2b_flex_header` ไม่มี

### Dunning & Invoice Fixes (commit 0235146–376d5a8)
29. **Dunning เปลี่ยนจาก text → Flex card** — สีตามความรุนแรง (amber/orange/red) + ปุ่มคัดลอกเลขบัญชี
30. **รวมหลายบิลเป็น 1 Flex ต่อ 1 ร้าน** — ไม่ส่งแยกรายบิลอีก (ประหยัด LINE credits)
31. **แสดงยอดค้าง (total - paid)** — ไม่ใช่ยอดเต็ม (กรณี partial payment)
32. **ไม่ทวงบิลที่เพิ่ง issue วันเดียวกัน** — ต้อง issue มาแล้วอย่างน้อย 24 ชม.
33. **Schedule dunning ที่ 09:00 ICT** — แก้ bug schedule ผิดเวลา (เคย schedule ตอน snippet load)
34. **Admin Flex แสดง INV-DNC-XXXXX** — ไม่แสดง Ticket # สำหรับ manual invoices

### Profile Redesign (commit 841b864–6991790)
35. **Edit Profile redesign** — premium app-style: dark hero header + avatar + stats grid
36. **Member Stats** — จำนวนสินค้า, เคลม, โอนสิทธิ์, อายุสมาชิก (query real data)
37. **PDPA & Consent card** — สถานะ PDPA, timestamp, analytics/marketing consent, segment
38. **Product Timeline** — ไทม์ไลน์การติดตั้งสินค้า DINOCO เรียงตามวันที่ลงทะเบียน พร้อมรูป + สถานะ
39. **Moto Photo** — อัพรูปรถ + แสดงในหน้า Profile
40. **Splash screen logo ขาว** — แก้ทุกหน้า (4 files) ให้ใช้ dark overlay + logofullwhite.webp
41. **FontAwesome preload** — ย้ายจาก wp_footer ไป wp_head (แก้ icon หาย)
42. **SCAN icon** — เปลี่ยน fa-expand → fa-qrcode
43. **Claim System async fix** — เพิ่ม async ให้ dnc_do_submit() (แก้ SyntaxError)

### หมายเหตุ
- **Claim status change (B2C member) ไม่ส่ง LINE notification** — เป็น platform limitation (LINE Login userId ≠ Bot userId ต่าง channel push ไม่ได้)
- **Edit Profile ใช้ full page reload** — ยังใช้ native form POST (ไม่เปลี่ยนเป็น AJAX เพื่อลดความเสี่ยง)
