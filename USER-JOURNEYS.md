# DINOCO System -- User Journeys

> Updated: 2026-04-04 | Based on deep code review of 40+ snippet files
> ทุก role, ทุกช่องทาง, ทุก LIFF page, ทุก Dashboard tab

---

## 1. Member (B2C End User)

### ช่องทางเข้า
- QR Code สแกนจากสินค้า → เปิดเว็บ dinoco.in.th
- LINE Official Account → Rich Menu → เว็บไซต์
- Direct link → dinoco.in.th/dashboard/

### สิ่งที่ทำได้

| Action | Entry Point | Shortcode/Page | Description |
|--------|------------|----------------|-------------|
| Login | `/login/` | `[dinoco_login_button]` | LINE Login OAuth |
| ลงทะเบียนประกัน | `/warranty/` | `[dinoco_gateway]` | Serial + รุ่นมอเตอร์ไซค์ + รูป |
| ดู Dashboard | `/dashboard/` | `[dinoco_dashboard]` | Main controller page |
| ดู Profile | `/dashboard/` sidebar | `[dinoco_dashboard_header]` | Profile card + PDPA |
| แก้ไข Profile | `/edit-profile/` | `[dinoco_edit_profile]` | Facebook-style view/edit |
| ดูสินค้าประกัน | `/dashboard/` | `[dinoco_dashboard_assets]` | Assets list + bundle |
| แจ้งเคลม | `/claim/` | `[dinoco_claim_page]` | เลือกสินค้า + อธิบายปัญหา + รูป |
| โอนสินค้า | `/transfer/` | `[dinoco_transfer_sys]` | กรอกเบอร์ผู้รับ |
| Legacy Migration | `/legacy/` | `[dinoco_legacy_migration]` | ย้ายข้อมูลจากระบบเก่า |

### ข้อจำกัด
- ต้อง Login ผ่าน LINE เท่านั้น (ไม่มี email/password)
- ต้องยอมรับ PDPA ก่อนใช้งาน
- Rate limit: 1 action ต่อ 2 วินาที
- ดูได้เฉพาะสินค้าของตัวเอง

### Global App Menu (Bottom Nav)
- Home (Dashboard)
- สินค้าของฉัน (Assets)
- แจ้งเคลม (Claim)
- โปรไฟล์ (Profile)

---

## 2. Admin (DINOCO Staff)

### ช่องทางเข้า
- WordPress Admin Panel → Code Snippets shortcode pages
- LINE Admin Group → Bot commands
- LIFF Apps (B2B Dashboard LIFF, B2F Catalog LIFF, AI Center LIFF)

### WordPress Dashboard Pages

| Page | Shortcode | Description |
|------|-----------|-------------|
| Admin Dashboard | `[dinoco_admin_dashboard]` | Command Center -- KPIs, pipeline, charts |
| User Management | `[dinoco_admin_users]` | CRM + analytics |
| Service Center | `[dinoco_admin_claims]` | Claims management |
| Inventory | `[dinoco_admin_inventory]` | Global Inventory Database |
| Legacy Requests | `[dinoco_admin_legacy]` | Legacy migration approvals |
| Transfer Tool | `[dinoco_admin_transfer]` | Force transfer warranty |
| AI Control | `[dinoco_admin_ai_control]` | AI Command Center (Gemini) |
| KB Trainer | (WP Admin menu) | Knowledge Base trainer bot |
| Moto Manager | `[dinoco_admin_moto]` | Motorcycle brands/models CRUD |
| Finance Dashboard | `[dinoco_admin_finance]` | Debt, revenue, AI Risk |
| Brand Voice | `[dinoco_brand_voice]` | Social listening |
| Manual Invoice | `[dinoco_manual_invoice]` | Manual billing system |
| GitHub Sync | `[dinoco_sync_dashboard]` | Deploy status |

### Admin Dashboard Sidebar Tabs

**B2B Section:**
| Tab | Shortcode | Description |
|-----|-----------|-------------|
| B2B Dashboard | `[b2b_admin_dashboard]` | Order management + Flash |
| B2B Control Panel | `[b2b_admin_control]` | Distributors, products, settings |
| Discount Mapping | `[b2b_discount_mapping]` | SKU pricing + rank tiers |

**B2F Section:**
| Tab | Shortcode | Description |
|-----|-----------|-------------|
| B2F Orders | `[b2f_admin_orders_tab]` | PO management |
| B2F Makers | `[b2f_admin_makers_tab]` | Maker/product management |
| B2F Credit | `[b2f_admin_credit_tab]` | Credit/payment tracking |

### LIFF Pages (Admin)

| LIFF Page | URL Path | Description |
|-----------|----------|-------------|
| B2B Admin Dashboard | `/b2b-catalog/?view=dashboard` | Mobile admin dashboard |
| B2B Stock Manager | `/b2b-catalog/?view=stock` | Stock management LIFF |
| B2B Tracking Entry | `/b2b-catalog/?view=tracking` | Manual tracking entry |
| B2F E-Catalog | `/b2f-catalog/` | Order from factory LIFF (JWT auth) |
| AI Center | `/ai-center/` | Lead/claim management (4 tabs) |

### LINE Bot Commands (Admin Group)
(ดู WORKFLOW-MAP.md Section 4.1)

### ข้อจำกัด
- ต้องมี `manage_options` capability (WordPress admin)
- B2F admin LIFF: ต้อง auth ผ่าน LINE ID Token + HMAC + WP admin check

---

## 3. Distributor (B2B Dealer)

### ช่องทางเข้า
- LINE Group ที่มี DINOCO Bot → Bot commands
- LIFF Apps เปิดจาก Flex Cards
- Direct link `/b2b-catalog/` (ต้องมี signed URL)

### สิ่งที่ทำได้

| Action | Channel | Description |
|--------|---------|-------------|
| สั่งของ | LIFF Catalog | เลือกสินค้า + จำนวน → สร้าง order |
| ดูออเดอร์ | LIFF / Bot | ประวัติ orders + status |
| ยืนยันบิล | Flex Postback | กดปุ่มยืนยันใน Flex card |
| จ่ายเงิน | ส่งรูปสลิปในกลุ่ม | Bot auto-verify |
| ยืนยันรับของ | Flex Postback | กดปุ่มยืนยันรับ |
| ยกเลิก order | Flex Postback | กดปุ่มยกเลิก (ก่อน shipped) |
| ดูยอดหนี้ | Bot command | พิมพ์ "ดูหนี้" |
| ดูข้อมูลร้าน | LIFF Account | ข้อมูลร้าน + rank |

### LIFF Pages (Distributor)

| Page | URL Pattern | Description |
|------|-------------|-------------|
| Command Center | `/b2b-catalog/?view=commands` | Menu: สั่งของ, ออเดอร์, เคลม, จ่ายเงิน |
| Catalog | `/b2b-catalog/` | Product catalog + cart |
| Order History | `/b2b-catalog/?view=history` | Order list + filter |
| Ticket View | `/b2b-ticket/?ticket_id=X&_ts=X&_sig=X` | Order detail + actions |
| Account | `/b2b-catalog/?view=account` | Shop info + rank + debt |

### ข้อจำกัด
- ต้องอยู่ในกลุ่ม LINE ที่ register กับระบบ
- Auth ผ่าน HMAC signed URL (ไม่ต้อง LINE Login)
- ดูได้เฉพาะ orders ของร้านตัวเอง
- ราคาแสดงตาม rank tier ของร้าน
- Credit limit: ถ้าหนี้เกิน → hold (สั่งของไม่ได้)

---

## 4. Maker (B2F Factory)

### ช่องทางเข้า
- LINE Group ที่มี DINOCO Bot → Bot commands
- LIFF Apps เปิดจาก Flex Cards

### สิ่งที่ทำได้

| Action | Channel | Description |
|--------|---------|-------------|
| ดู PO | LIFF List / Bot | รายการ PO ทั้งหมด |
| ยืนยัน PO | LIFF Confirm | กรอก ETA + confirm |
| ปฏิเสธ PO | LIFF Confirm | กรอกเหตุผล + reject |
| ขอเลื่อนส่ง | LIFF Reschedule | เลือกวันใหม่ + เหตุผล |
| แจ้งส่งของ | LIFF Deliver / Bot | เลือก PO + จำนวนที่ส่ง |
| ส่งสลิป | ส่งรูปในกลุ่ม | Bot auto-match payment |

### LIFF Pages (Maker)

| Page | URL Pattern | Description |
|------|-------------|-------------|
| Confirm | `/b2f-maker/?page=confirm&po_id=X` | ยืนยัน/ปฏิเสธ PO |
| Detail | `/b2f-maker/?page=detail&po_id=X` | PO detail + timeline |
| Reschedule | `/b2f-maker/?page=reschedule&po_id=X` | ขอเลื่อนส่ง |
| PO List | `/b2f-maker/?page=list` | รายการ PO ทั้งหมด |
| Deliver | `/b2f-maker/?page=deliver` | แจ้งส่งของ |

### LANG System
- THB makers: ภาษาไทย
- CNY/USD makers: ภาษาอังกฤษ (ENG)
- `_isEng` flag set จาก API response
- `L(th, en)` helper switch ทุก UI string
- Dates, currency symbols, labels ทั้งหมด switch ตาม lang

### ข้อจำกัด
- ต้องอยู่ในกลุ่ม LINE ที่ register เป็น Maker
- Auth ผ่าน HMAC signed URL + JWT
- ดูได้เฉพาะ PO ของ Maker ตัวเอง
- Bot toggle: Admin ปิด bot ของ Maker ได้ (`maker_bot_enabled`)
- group_id ต้อง unique ข้าม distributor (validated by `b2f_validate_group_id()`)

---

## 5. AI Chatbot (OpenClaw)

### ช่องทางเข้า
- LINE Official Account (DM กับ bot)
- Facebook Page (Messenger)
- Instagram (DM)

### สิ่งที่ทำได้

| Action | Tool Used | Description |
|--------|-----------|-------------|
| ถามข้อมูลสินค้า | get_product | ค้นหา + แสดงข้อมูล + รูป |
| ถามร้านค้าใกล้ | get_dealer | ค้นหาตัวแทนตามพื้นที่ |
| เช็คประกัน | check_warranty | ดู status ประกัน |
| ถามคำถามทั่วไป | search_kb | ค้นหาจาก Knowledge Base |
| แจ้งเคลม | create_claim | สร้าง claim จาก chat |
| แจ้งความสนใจ | create_lead | สร้าง lead record |
| ขอคุยกับคน | escalate_to_admin | ส่งต่อ admin |
| ดูรุ่นมอเตอร์ไซค์ | get_moto_catalog | Catalog รุ่นรถ |

### ข้อจำกัด
- Max 12 messages per conversation
- Temperature 0.35 (conservative)
- Anti-hallucination: 3 layers (prompt, tool boundary, supervisor)
- Product data ต้องมาจาก function calling เท่านั้น (ไม่ generate)
- Prompt injection protection: 14 patterns
- PII masking

---

## 6. Dealer (LIFF AI)

### ช่องทางเข้า
- LIFF link `/ai-center/` เปิดจาก LINE

### สิ่งที่ทำได้

| Action | Tab | Description |
|--------|-----|-------------|
| ดู Dashboard | Dashboard | Lead stats, claim summary |
| ดู Leads | Leads | รายการ leads ที่ assign ให้ |
| Accept Lead | Lead Detail | รับ lead เข้าดูแล |
| Add Note | Lead Detail | เพิ่มหมายเหตุ |
| Update Status | Lead Detail | เปลี่ยนสถานะ lead |

### Auth Flow
1. เปิด LIFF → LINE SDK `liff.getIDToken()`
2. POST `/liff-ai/v1/auth` with id_token
3. Server verify LINE ID Token → ค้นหา distributor CPT (`owner_line_uid`)
4. หรือ WP user meta (`linked_distributor_id`)
5. Issue JWT → ใช้ `X-LIFF-AI-Token` header

### ข้อจำกัด
- ต้องมี `owner_line_uid` บน distributor CPT หรือ WP user meta
- Bottom nav: 2 tabs (Dashboard, Leads)
- Lead data อยู่ใน MongoDB (ผ่าน Agent proxy)
- Claim data อยู่ใน WordPress

---

## 7. LIFF Pages -- Complete URL Map

### B2B LIFF (via B2B Snippet 4, `/b2b-catalog/`)

| View | URL Parameter | Shortcode |
|------|--------------|-----------|
| Catalog (default) | -- | `[b2b_commands]` page routing |
| Commands | `?view=commands` | Customer command center |
| History | `?view=history` | Order history |
| Account | `?view=account` | Account info |
| Stock Manager | `?view=stock` | (Admin) Stock management |
| Dashboard | `?view=dashboard` | (Admin) LIFF dashboard |
| Tracking | `?view=tracking` | (Admin) Tracking entry |

### B2B Ticket View (`/b2b-ticket/`)

| Parameter | Description |
|-----------|-------------|
| `ticket_id` | Order post ID |
| `_ts` | Timestamp |
| `_sig` | HMAC signature |
| `token` | JWT token (fallback) |

### B2F Maker LIFF (`/b2f-maker/`)

| Page | URL Parameter | Description |
|------|--------------|-------------|
| Confirm | `?page=confirm&po_id=X` | Confirm/reject PO |
| Detail | `?page=detail&po_id=X` | PO detail view |
| Reschedule | `?page=reschedule&po_id=X` | Reschedule request |
| List | `?page=list` | All POs |
| Deliver | `?page=deliver` | Delivery report |

### B2F Admin Catalog LIFF (`/b2f-catalog/`)
- Standalone ordering page
- Auth: POST `/b2f/v1/auth-admin` (HMAC + LINE ID Token)

### B2F PO Ticket View (`/b2f-ticket/`)
- PO detail with timeline, items, receiving, payment
- Admin-only view

### LIFF AI Center (`/ai-center/`)

| Page | Description |
|------|-------------|
| Dashboard | Admin: 4 tabs overview |
| Dealer Dashboard | Dealer-specific stats |
| Lead Detail | Lead info + actions |
| Claim List | Claim overview |
| Claim Detail | Claim info + photos + status |
| Agent Chat | AI Agent (Phase 3 placeholder) |
