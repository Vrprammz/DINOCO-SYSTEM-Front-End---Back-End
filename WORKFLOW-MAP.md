# DINOCO Workflow Map

> Updated: 2026-04-04
> ทุก workflow ของระบบ -- trigger, steps, end state
> Source: Deep code review of all snippet files

---

## 1. B2C Warranty Workflows

### 1.1 Warranty Registration

```
Trigger: ลูกค้าสแกน QR / เปิดลิงก์ลงทะเบียน

1. เข้าหน้า [dinoco_gateway] (LINE Callback)
2. กดปุ่ม "Login with LINE" → redirect LINE Login OAuth
3. LINE redirect กลับ → สร้าง/link WP user
4. หน้า Dashboard [dinoco_dashboard] → กดลงทะเบียน
5. กรอก Serial Number + เลือกรุ่นมอเตอร์ไซค์
6. อัพโหลดรูปสินค้า + ใบเสร็จ
7. กรอกที่อยู่ (ถ้ายังไม่มี) → ยืนยัน PDPA
8. สร้าง warranty_registration CPT
9. → แสดงหน้า Assets List

End State: warranty_registration สถานะ active
```

### 1.2 Warranty Claim

```
Trigger: ลูกค้ากด "แจ้งเคลม" ในหน้า Dashboard

1. เลือกสินค้าที่จะเคลม (จาก assets list)
2. เลือกประเภท: ซ่อม (repair) / ชิ้นส่วนทดแทน (parts)
3. อธิบายปัญหา + อัพโหลดรูปประกอบ
4. สร้าง claim_ticket CPT → status = "Registered in System"
5. (Admin) ตรวจสอบ → เปลี่ยนสถานะตามขั้นตอน

Claim Statuses:
  repair:  Registered → Awaiting Customer Shipment → In Transit → Received at Company
           → Under Maintenance → Maintenance Completed → Repaired Item Dispatched
  parts:   Registered → Pending Issue Verification
           → Replacement Approved → Replacement Shipped
           OR → Replacement Rejected by Company

Auto-close: Cron job (daily) ปิดอัตโนมัติถ้าเกินกำหนด
End State: claim_ticket สถานะ closed/resolved
```

### 1.3 Warranty Transfer

```
Trigger: ลูกค้ากด "โอนสินค้า" ในหน้า Dashboard

1. กรอกเบอร์โทรผู้รับ
2. ระบบค้นหาสมาชิกจากเบอร์โทร
3. ถ้าเจอ → แสดงชื่อ + ยืนยันโอน
4. โอน warranty_registration ไปยัง user ใหม่
5. → แสดงผลสำเร็จ

End State: warranty_registration เปลี่ยน owner
```

---

## 2. B2B Distributor Workflows

### 2.1 B2B Order (LINE Bot)

```
Trigger: ตัวแทนพิมพ์ "@DINOCO" หรือ "สั่งของ" ในกลุ่ม LINE

1. Bot ส่ง Flex Menu carousel → ลูกค้ากด "สั่งของ"
2. เปิด LIFF E-Catalog (/b2b-catalog/)
3. Auth: HMAC signed URL → POST /b2b/v1/auth-group → JWT token
4. แสดง catalog + ราคาตาม rank tier
5. ลูกค้าเลือกสินค้า + ใส่จำนวน → กดตะกร้า → Modal สรุป
6. กรอกหมายเหตุ (optional) → กดยืนยัน
7. POST /b2b/v1/place-order → สร้าง b2b_order (status: draft → checking_stock)
8. Bot ส่ง Flex "ออเดอร์ใหม่" → กลุ่ม Admin

------- Admin Flow -------

9.  Admin ดู Dashboard / LIFF → กด "ยืนยัน"
10. Status: checking_stock → awaiting_confirm
11. Bot ส่ง Flex "ยืนยันสต็อก" → กลุ่มลูกค้า

12. ลูกค้ากด "ยืนยันบิล" → awaiting_confirm → awaiting_payment
13. Bot ส่ง Flex Invoice + ข้อมูลธนาคาร → กลุ่มลูกค้า

14. ลูกค้าโอนเงิน → ส่งรูปสลิปในกลุ่ม
15. Bot จับรูป → Slip2Go verify → ถ้าผ่าน → paid
16. Bot ส่ง Flex ใบเสร็จ → กลุ่มลูกค้า

17. Admin Flash Create → packed → courier pickup → shipped
18. Cron: 3 วันหลัง shipped → ถามลูกค้า "ได้รับของไหม?"
19. ลูกค้ายืนยัน / Auto 7 วัน → completed

End State: b2b_order สถานะ completed
```

### 2.2 Walk-in Order Flow

```
Trigger: Walk-in distributor (is_walkin=1) สั่งของผ่าน LINE Bot/LIFF

1-7. เหมือน flow ปกติ
8.   Walk-in: draft → awaiting_confirm (ข้ามเช็คสต็อก)
9.   ลูกค้ายืนยันบิล → awaiting_payment
10.  จ่ายเงิน → paid
11.  Auto-complete ทันที (ข้ามเลือกวิธีส่ง)

Walk-in Cancel:
  - Admin สามารถยกเลิก completed walk-in order ได้
  - completed → cancelled (admin only, FSM V.1.3)
  - คืนหนี้อัตโนมัติ (is_billed check + b2b_recalculate_debt)

End State: b2b_order สถานะ completed หรือ cancelled
```

### 2.3 B2B Payment Flow

```
Trigger: ลูกค้าส่งรูปสลิปในกลุ่ม LINE

1. Bot จับรูปภาพ (image message)
2. Download รูปจาก LINE Content API
3. ส่งไป Slip2Go API verify
4. Match ยอดเงิน ±2% กับ order ค้างชำระ
5. ถ้าผ่าน:
   a. Status → paid
   b. หักหนี้ (b2b_debt_subtract)
   c. ส่ง Flex ใบเสร็จ → กลุ่มลูกค้า
   d. ส่ง Flex แจ้ง Admin
6. ถ้าไม่ผ่าน:
   a. ส่ง Flex "สลิปไม่ผ่าน" → กลุ่มลูกค้า
   b. แจ้ง Admin ตรวจสอบ

Walk-in Bank Account:
  - Walk-in orders ใช้บัญชี B2B_WALKIN_BANK_* (ถ้า define)
  - Slip verify accept ทั้ง 2 บัญชี (ปกติ + walk-in)

End State: Order paid, debt updated
```

### 2.4 B2B Shipping (Flash Express)

```
Trigger: Admin กด "จัดส่ง Flash" ใน Dashboard

1. POST /b2b/v1/flash-create → สร้าง Flash order
2. Flash API return pno (tracking number) + sort code
3. Generate label → print
4. Status: paid → packed
5. POST /b2b/v1/flash-ready-to-ship → เรียก courier pickup
6. Courier pickup → packed → shipped
7. Flash Tracking Cron (every 2 hours):
   a. Poll Flash API for status updates
   b. Update order status accordingly
   c. "Signed" → 24hr auto-complete
   d. "Detained" → alert admin

Manual Shipping:
  - Admin กด "จัดส่งเอง" → ใส่ tracking number → shipped
  - Manual Flash (/manual-ship): standalone (ไม่ต้องมี B2B order)

End State: Order shipped → completed
```

---

## 3. B2F Factory Purchasing Workflows

### 3.1 Create PO (Admin)

```
Trigger: Admin เปิด LIFF Catalog หรือ B2F Dashboard

1. เลือก Maker จาก dropdown
2. ระบบแสดง product catalog ของ Maker + ราคาทุน
3. เลือก SKU + จำนวน
4. ถ้า foreign (CNY/USD): เลือก shipping method (land/sea) + exchange rate
5. ระบบคำนวณ: total (สกุลโรงงาน), total_thb, shipping_total, grand_total_thb
6. กด Submit → POST /b2f/v1/create-po
7. สร้าง b2f_order (draft → submitted)
8. ส่ง Flex "New PO" → กลุ่ม Maker (ENG ถ้า non-THB)
9. ส่ง Flex "สร้าง PO สำเร็จ" → กลุ่ม Admin

End State: b2f_order สถานะ submitted
```

### 3.2 Maker Confirm/Reject PO

```
Trigger: Maker เปิด LIFF จาก Flex Card

Path A — Confirm:
1. Maker เปิด LIFF confirm page
2. ดูรายการ + ราคา
3. กรอก ETA (expected delivery date)
4. กด Confirm → POST /b2f/v1/maker-confirm
5. Status: submitted → confirmed
6. ส่ง Flex → Admin + Maker groups

Path B — Reject:
1. Maker กด Reject → กรอกเหตุผล
2. POST /b2f/v1/maker-reject
3. Status: submitted → rejected
4. ส่ง Flex → Admin + Maker groups

Path C — Reschedule:
1. Maker กด Reschedule → เลือกวันใหม่ + เหตุผล
2. POST /b2f/v1/maker-reschedule
3. Admin ได้ Flex → Approve/Reject reschedule
4. ถ้า approve: อัพเดท expected_date
5. ถ้า reject: Maker ต้องส่งตามเดิม

End State: confirmed / rejected / reschedule pending
```

### 3.3 Maker Delivery

```
Trigger: Maker แจ้งส่งของ (LIFF หรือ Bot command)

1. Maker เลือก PO → กรอกจำนวนที่ส่งแต่ละ SKU
2. POST /b2f/v1/maker-deliver (concurrent lock)
3. อัพเดท poi_qty_shipped ใน po_items
4. บันทึก delivery record ใน po_deliveries repeater
5. Status: confirmed → delivering
6. ส่ง Flex → Admin + Maker groups

Partial Delivery:
  - ส่งไม่ครบ → delivering (ไม่เปลี่ยน)
  - Maker ส่งเพิ่มได้ (delivering → delivering)

End State: b2f_order สถานะ delivering
```

### 3.4 Receive Goods (Admin)

```
Trigger: Admin กด "ตรวจรับ" ใน B2F Dashboard

1. เลือก PO → กรอกจำนวนรับ + QC แต่ละ SKU
2. POST /b2f/v1/receive-goods
3. สร้าง b2f_receiving record
4. คำนวณ rcv_total_value (THB) = qty * unit_cost * exchange_rate
5. เพิ่มหนี้ (b2f_payable_add) → เครดิตเกิดตอน receive เท่านั้น
6. อัพเดท poi_qty_received ใน po_items
7. ถ้ารับครบ: delivering → received
8. ถ้ารับบางส่วน: delivering → partial_received
9. ถ้ามี reject: rcv_has_reject = true → Admin ต้อง resolve

Reject Resolution:
  - POST /b2f/v1/reject-lot → บันทึก reject
  - POST /b2f/v1/reject-resolve → เลือก action:
    a. "reship" → สร้าง replacement PO
    b. "credit" → หักเครดิต Maker
    c. "accept" → ยอมรับ (ไม่ทำอะไร)

End State: received / partial_received
```

### 3.5 Payment (Admin → Maker)

```
Trigger: Admin กด "บันทึกจ่ายเงิน" ใน B2F Dashboard

1. เลือก PO → กรอกจำนวนเงิน + วิธีจ่าย + slip
2. POST /b2f/v1/record-payment
3. สร้าง b2f_payment record
4. Slip verify:
   - THB: Slip2Go verify → pmt_slip_status
   - CNY/USD: ข้าม verify (admin_approved)
5. หักหนี้ (b2f_payable_subtract)
6. อัพเดท po_paid_amount
7. ถ้าจ่ายครบ: received → paid → completed (auto)
8. ถ้าจ่ายบางส่วน: → partial_paid
9. ส่ง Flex แจ้ง Maker

End State: paid → completed
```

---

## 4. Bot Commands per Group

### 4.1 Admin Group (B2B + B2F)

**B2B Commands:**
| Command | Action |
|---------|--------|
| @DINOCO / @mention | ส่ง Flex Menu carousel (3 หน้า) |
| สรุป / สรุปวัน | Trigger daily summary |
| รอยืนยัน | แสดง orders รอยืนยัน |
| ค้างส่ง | แสดง orders ค้างจัดส่ง |
| @admincancel #ID | ยกเลิก order (admin) |
| ดูหนี้ [ชื่อร้าน] | ดูยอดหนี้ตัวแทน |
| จัดส่ง #ID | เริ่ม Flash Create |

**B2F Commands:**
| Command | Action |
|---------|--------|
| สั่งโรงงาน | เปิด B2F Catalog LIFF |
| ดูPO / ดูpoโรงงาน | แสดง PO list |
| สรุปโรงงาน | สรุป B2F stats |
| po#NUMBER | แสดง PO detail |

### 4.2 Distributor Group (B2B Only)

| Command | Action |
|---------|--------|
| @DINOCO / @mention | ส่ง Flex Customer Menu |
| สั่งของ | เปิด LIFF Catalog |
| ดูออเดอร์ | ดูประวัติ order |
| ดูหนี้ | ดูยอดหนี้ตัวเอง |
| (ส่งรูปสลิป) | Auto verify + match payment |

### 4.3 Maker Group (B2F Only)

| Command | Action |
|---------|--------|
| @DINOCO / @mention | ส่ง Flex Maker Menu (ENG if non-THB) |
| ดูPO / View PO | แสดง PO list |
| ส่งของ / Deliver | เปิด LIFF delivery page |
| (ส่งรูปสลิป) | Auto match payment ±2% |

---

## 5. Cron Jobs Schedule

### 5.1 B2B Cron Jobs (Snippet 7, DB_ID: 56)

| Hook | Schedule | Time (ICT) | Description |
|------|----------|------------|-------------|
| `b2b_dunning_cron_event` | Daily | 09:00 | ทวงหนี้ (friendly → official → hold) |
| `b2b_daily_summary_cron` | Daily | 17:30 | สรุปยอดประจำวัน → Admin group |
| `b2b_rank_update_event` | Monthly | วันที่ 1, 00:05 | อัพเดท rank tier |
| `b2b_bo_overdue_check` | Daily | 10:00 | BO เกิน ETA |
| `b2b_auto_complete_check` | Daily | 11:00 | Auto complete 7 วันหลัง shipped |
| `b2b_oos_expiry_check` | Daily | 06:00 | OOS หมดอายุ |
| `b2b_weekly_report_event` | Weekly | Sun 17:30 | สรุปสัปดาห์ |
| `b2b_shipping_overdue_cron` | Daily | 15:00 | สรุปค้างจัดส่ง |
| `b2b_flash_tracking_cron` | Every 2 hours | -- | Poll Flash API tracking |
| `b2b_flex_retry_cron` | Every 1 min | -- | Retry failed Flex sends |
| `b2b_rpi_heartbeat_check` | Every 5 min | -- | RPi heartbeat check |

### 5.2 B2B Single Events (Dynamic)

| Hook | Trigger | Delay | Description |
|------|---------|-------|-------------|
| `b2b_delivery_check_event` | After shipped | 3 days | ถามลูกค้า "ได้รับของไหม?" |
| `b2b_sla_alert_event` | After order created | 10-60 min | SLA alert escalation |
| `b2b_auto_ship_flash_event` | After confirm | 1 hour | Auto Flash create |
| `b2b_flash_24hr_complete` | After Flash signed | 24 hours | Auto complete |
| `b2b_flash_courier_retry` | After Flash fail | Variable | Retry courier notify |
| `b2b_verify_slip_async` | After slip upload | Immediate | Async slip verification |

### 5.3 B2F Cron Jobs (Snippet 11, DB_ID: 1171)

| Hook | Schedule | Description |
|------|----------|-------------|
| `b2f_cron_delivery_reminder` | Daily 09:00 | เตือนจัดส่ง (D-3, D-1, D-day, D+1, D+3, D+7+) |
| `b2f_cron_overdue_check` | Daily 10:00 | เตือน overdue |
| `b2f_cron_maker_noresponse` | Daily 11:00 | Maker ไม่ตอบ (24h, 48h, escalate 72h) |
| `b2f_cron_payment_reminder` | Daily 09:30 | เตือนชำระ (term -7, -3, ครบ, +3, +7 auto hold) |
| `b2f_cron_daily_summary` | Daily 17:30 | สรุปประจำวัน |
| `b2f_cron_weekly_summary` | Weekly Mon | สรุปรายสัปดาห์ |
| `b2f_flex_retry_cron` | Every 1 min | Retry failed Flex sends |

### 5.4 System Cron Jobs

| Hook | Schedule | Source | Description |
|------|----------|--------|-------------|
| `dinoco_daily_auto_close_event` | Daily | Admin Service Center | Auto-close expired claim tickets |
| `b2b_cleanup_old_invoices` | Daily (on summary) | B2B Snippet 10 | Cleanup old invoice images |
| `b2b_cleanup_old_slips` | Daily (on summary) | B2B Snippet 3 | Cleanup old slip images |
| `dinoco_inv_cron_reminder` | Daily 09:00 | Manual Invoice | Invoice payment reminders |
| `dinoco_inv_cron_overdue` | Daily | Manual Invoice | Overdue invoice notices |

---

## 6. AI Chatbot Workflow (OpenClaw Mini CRM)

```
Trigger: ลูกค้าส่งข้อความผ่าน LINE / Facebook / Instagram

1. Platform webhook → OpenClaw proxy/index.js
2. Auth middleware → ตรวจ platform token
3. Load conversation from MongoDB
4. AI Provider:
   a. Gemini Flash (primary) → function calling
   b. Claude Sonnet (supervisor) → quality check
5. Available Tools (8):
   - get_product → MCP Bridge → product-lookup
   - get_dealer → MCP Bridge → dealer-lookup
   - check_warranty → MCP Bridge → warranty-check
   - search_kb → MCP Bridge → kb-search
   - create_claim → MCP Bridge → claim-manual-create
   - create_lead → MCP Bridge → lead-create
   - escalate_to_admin → notify admin
   - get_moto_catalog → MCP Bridge → moto-catalog
6. Anti-hallucination:
   - Prompt layer: strict instructions
   - Tool boundary: only use tool results
   - Output sanitize: claudeSupervisor check
7. Response → platform-specific format → reply

Conversation Cap: 12 messages, Temperature: 0.35
```

---

## 7. Finance / Debt Workflow

### 7.1 B2B Debt Lifecycle

```
1. Admin ยืนยันบิล (confirm_bill):
   → b2b_debt_add(dist_id, amount, 'bill_issued')
   → distributor.current_debt += amount

2. ลูกค้าจ่ายเงิน (slip verified / manual):
   → b2b_debt_subtract(dist_id, amount, 'payment')
   → distributor.current_debt -= amount

3. Source of Truth:
   → b2b_recalculate_debt(dist_id) = Single SQL query
   → SUM(billed orders) - SUM(payments)

4. Credit Control:
   → ถ้า current_debt > credit_limit → credit_hold = true
   → Dunning cron: friendly (7d) → official (14d) → hold (30d)
```

### 7.2 B2F Credit Lifecycle (ทิศทางกลับจาก B2B)

```
1. Admin ตรวจรับของ (receive-goods):
   → b2f_payable_add(maker_id, rcv_total_value, 'goods_received')
   → maker.maker_current_debt += rcv_total_value (THB)
   → เครดิตเกิดตอน receive เท่านั้น (ไม่หักตอน create-po)

2. Admin จ่ายเงิน (record-payment):
   → b2f_payable_subtract(maker_id, amount, 'payment')
   → maker.maker_current_debt -= amount

3. Source of Truth:
   → b2f_recalculate_payable(maker_id) = Single SQL query
   → SUM(rcv_total_value ของ receiving records) - SUM(payments)

4. Auto Hold/Unhold:
   → ถ้า current_debt > credit_limit → auto hold (reason=auto)
   → ถ้า recalculate ลดลงต่ำกว่า → auto unhold
   → Admin hold เอง (reason=manual) → ไม่ auto unhold
```

---

## 8. Current Inventory Flow

### ที่มีอยู่ (Manual)

```
B2B Stock Management:
  - Admin ตั้ง stock_status = in_stock / out_of_stock (manual toggle)
  - Admin ตั้ง oos_eta_date เมื่อของหมด
  - Cron: b2b_oos_expiry_check → ถ้า OOS เกิน duration → auto reset เป็น in_stock
  - [dinoco_admin_inventory] → Inventory Command Center (manual CRUD)

B2F Goods Receiving:
  - Admin ตรวจรับของ → สร้าง b2f_receiving record
  - บันทึก qty ที่รับ per SKU
  - *** ไม่ auto-update B2B stock ***

MCP Bridge:
  - /inventory-changed endpoint (Phase 3) → ยังไม่ implement logic
```

### ที่ยังไม่มี (Gap)

```
- stock_qty field (จำนวนจริง) → ไม่มี
- Auto deduction เมื่อ B2B ship → ไม่มี
- Auto addition เมื่อ B2F receive → ไม่มี
- Low stock alert → ไม่มี
- Inventory valuation (FIFO/LIFO) → ไม่มี
- Warehouse management (multi-location) → ไม่มี
```
