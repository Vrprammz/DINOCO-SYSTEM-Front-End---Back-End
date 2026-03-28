# DINOCO System Architecture — Complete Reference

> Updated: 2026-03-28 | Version: V.34.1 | 38 files, ~50,000 lines

## Overview

DINOCO is a **WordPress-based motorcycle warranty + B2B distribution platform** serving:
- **B2C Members** — warranty registration, claims, transfers via LINE Login
- **B2B Distributors** — ordering, invoicing, payments via LINE Bot + LIFF
- **Admin** — command center dashboard with AI assistant

All code runs as **WordPress Code Snippets** (no build step). Frontend is vanilla HTML/CSS/JS inline in PHP. Communication with distributors/members is via **LINE Messaging API**.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    DINOCO WordPress                       │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  B2C System   │  │  B2B System   │  │ Admin System  │ │
│  │  (Members)    │  │ (Distributors)│  │ (Management)  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘ │
│         │                  │                  │          │
│  ┌──────┴──────────────────┴──────────────────┴───────┐ │
│  │              WordPress REST API + AJAX              │ │
│  └──────┬──────────────────┬──────────────────┬───────┘ │
│         │                  │                  │          │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐ │
│  │ ACF Fields    │  │ Custom Post  │  │ wp_options   │ │
│  │ (meta)        │  │ Types (CPT)  │  │ (settings)   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────────┬───────────────┬───────────────┬────────────┘
             │               │               │
     ┌───────┴──────┐ ┌─────┴──────┐ ┌─────┴──────────┐
     │ LINE Messaging│ │ Flash      │ │ Slip2Go        │
     │ API (Bot)     │ │ Express API│ │ (Slip Verify)  │
     └───────┬──────┘ └─────┬──────┘ └─────┬──────────┘
             │               │               │
     ┌───────┴──────┐ ┌─────┴──────┐ ┌─────┴──────────┐
     │ LINE LIFF    │ │ RPi Print  │ │ Google Gemini  │
     │ (Web Apps)   │ │ Server     │ │ AI (v22)       │
     └──────────────┘ └────────────┘ └────────────────┘
```

---

## Custom Post Types (CPT)

| CPT | Purpose | Key Fields |
|-----|---------|------------|
| `serial_number` | Product warranty registration | `serial_code`, `product_sku`, `owner_product`, `w_status`, `warranty_expiry` |
| `claim_ticket` | Warranty claim/service | `ticket_status`, `snapshot_serial_code`, `problem_type`, `evidence_images` |
| `legacy_request` | Legacy system migration | `request_status`, `dnc_old_code`, `legacy_items` |
| `b2b_order` | B2B orders + manual invoices | `order_status`, `total_amount`, `source_group_id`, `is_billed` |
| `b2b_product` | B2B product catalog | `product_sku`, `price_standard`, `stock_status`, `b2b_discount_percent` |
| `distributor` | B2B distributor/shop | `shop_name`, `line_group_id`, `credit_limit`, `current_debt`, `bot_enabled` |
| `ai_knowledge` | AI knowledge base entries | `training_phrases`, `core_facts`, `ai_action` |
| `product_bundle` | Product bundle recipes | Bundle children references |

---

## WordPress Constants (wp-config.php)

### LINE Integration
| Constant | Purpose |
|----------|---------|
| `DINOCO_LINE_CHANNEL_ID` | LINE Login OAuth app ID |
| `DINOCO_LINE_REDIRECT_URI` | OAuth callback URL |
| `B2B_LINE_ACCESS_TOKEN` | LINE Bot token for push/reply |
| `B2B_LINE_CHANNEL_SECRET` | Webhook signature verification |
| `B2B_ADMIN_GROUP_ID` | Admin LINE group for alerts |

### B2B LIFF
| Constant | Purpose |
|----------|---------|
| `B2B_LIFF_ID` | Customer LIFF app ID |
| `B2B_LIFF_ADMIN_DASHBOARD` | Admin dashboard LIFF ID |
| `B2B_LIFF_ADMIN_ID` | Admin tracking LIFF ID |
| `B2B_SITE_URL` | Base URL for LIFF links |

### Flash Express
| Constant | Purpose |
|----------|---------|
| `B2B_FLASH_MCH_ID` | Flash merchant ID |
| `B2B_FLASH_SECRET_KEY` | Flash API secret |
| `B2B_FLASH_API_URL` | Flash API base URL |

### Payment
| Constant | Purpose |
|----------|---------|
| `B2B_BANK_NAME` / `B2B_BANK_NAME_EN` | Bank name (Thai/English) |
| `B2B_BANK_ACCOUNT` | Account number |
| `B2B_BANK_HOLDER` | Account holder name |
| `B2B_BANK_CODE` | Bank code for PromptPay |
| `B2B_BANK_LOGO_URL` | Bank logo |
| `B2B_PROMPTPAY_ID` | PromptPay ID |
| `B2B_SLIP2GO_SECRET_KEY` | Slip verification API key |

### AI & Sync
| Constant | Purpose |
|----------|---------|
| `DINOCO_GEMINI_KEY` | Google Gemini API key |
| `DINOCO_GITHUB_WEBHOOK_SECRET` | GitHub sync HMAC secret |
| `DINOCO_GITHUB_TOKEN` | GitHub API token |
| `DINOCO_GITHUB_REPO` | Repository path |

---

## External API Integrations

| Service | Purpose | Auth Method |
|---------|---------|-------------|
| **LINE Messaging API** | Push/reply messages, Flex cards | Bearer token |
| **LINE Login** | OAuth2 user authentication | Channel ID + Secret |
| **LINE LIFF SDK** | In-app web pages | LIFF ID |
| **Flash Express** | Shipping: create, cancel, track | HMAC-SHA256 signature |
| **Slip2Go** | Bank slip verification (OCR) | Secret key header |
| **Google Gemini** | AI chatbot with function calling | API key |
| **GitHub API** | Code sync from repository | Personal access token |

---

## File Map (38 files)

### B2B System (15 files)

| File | Lines | Shortcode | Purpose |
|------|-------|-----------|---------|
| **Snippet 1**: Core Utilities | 3,965 | — | LINE API, Flex builders, utilities, shipment helpers |
| **Snippet 2**: Webhook Gateway | 3,263 | — | LINE webhook handler, order flow, slip payment, bot toggle |
| **Snippet 3**: LIFF REST API | 3,818 | — | 36+ REST endpoints for LIFF apps, print system, Flash |
| **Snippet 4**: LIFF Frontend | 871 | `/b2b-catalog/` | E-catalog ordering UI (customer LIFF) |
| **Snippet 5**: Admin Dashboard | 1,153 | `[b2b_admin_dashboard]` | B2B orders management dashboard |
| **Snippet 6**: Discount Mapping | 353 | `[b2b_discount_mapping]` | Product pricing per distributor rank |
| **Snippet 7**: Cron Jobs | 1,251 | — | 13 cron jobs: dunning, summary, rank, delivery, retry |
| **Snippet 8**: Ticket View | 1,542 | `/b2b-ticket/` | Order detail LIFF page for distributors |
| **Snippet 9**: Admin Control | 2,480 | `[b2b_admin_control]` | Distributor/product CRUD, bot toggle, settings |
| **Snippet 10**: Invoice Image | 1,040 | — | GD-based invoice PNG generation |
| **Snippet 11**: Customer LIFF | 947 | 4 shortcodes | Orders, account, commands LIFF pages |
| **Snippet 12**: Admin LIFF | 1,988 | 3 shortcodes | Dashboard, stock manager, tracking entry LIFF |
| **Snippet 13**: Debt Transaction | ~200 | — | Atomic MySQL transactions for debt (FOR UPDATE lock), `b2b_financial_lock()`, audit log, ACF cache sync |
| **Snippet 14**: Order State Machine | ~180 | — | FSM class: validates transitions + actor permissions |
| **Snippet 15**: Custom Tables & JWT | ~300 | — | Custom `dinoco_products` table + HMAC JWT session tokens |

### Admin System (11 files + 1 abstraction layer)

| File | Lines | Shortcode | Purpose |
|------|-------|-----------|---------|
| AI Control Module | 3,157 | `[dinoco_admin_ai_control]` | Gemini v22 AI chatbot with function calling |
| Admin Dashboard | 4,437 | `[dinoco_admin_dashboard]` | Command center: KPIs, pipeline, AI inbox |
| Global Inventory | 1,346 | `[dinoco_admin_inventory]` | Product catalog + SKU management |
| Legacy Migration | 2,102 | `[dinoco_legacy_requests_ui]` | Old system data migration |
| Manual Invoice | ~4,400 | `[dinoco_manual_invoice]` | Invoice creation, slip upload, dunning, distributor detail view |
| Manual Transfer | 236 | `[dinoco_admin_transfer]` | Admin force warranty transfer |
| Service & Claims | 3,223 | `[dinoco_admin_claims]` | Claim ticket management |
| User Management | 1,472 | `[dinoco_admin_users]` | User CRM + analytics |
| KB Trainer | 471 | WP Admin menu | AI knowledge base trainer |
| GitHub Sync | 1,179 | — | Code deployment from GitHub |
| AI Provider Abstraction | ~250 | — | Swap Gemini/GPT/Claude via config constant |

### System / Member-facing (12 files)

| File | Lines | Shortcode | Purpose |
|------|-------|-----------|---------|
| Gateway | 196 | `[dinoco_login_button]` | LINE Login entry point |
| LINE Callback | 325 | `[dinoco_gateway]` | OAuth callback + user creation |
| Member Dashboard | 737 | `[dinoco_member_dashboard]` | Main member hub |
| Dashboard Header | 1,450 | — | Header + registration forms |
| Dashboard Assets | 2,160 | — | Product inventory list |
| Claim System | 1,858 | `[dinoco_claim_page]` | Warranty claim submission |
| Edit Profile | 550 | `[dinoco_edit_profile]` | Profile hub: stats, PDPA, product timeline, moto photo, edit form |
| Transfer Warranty | 2,192 | `[dinoco_transfer_v3]` | Ownership transfer |
| Legacy Migration | 896 | — | Legacy data processing |
| Global App Menu | 730 | — | Bottom nav + QR scanner + design tokens + toast/confirm |
| Custom Header | 10 | — | Header styling |
| Author Profile | 18 | — | Profile display |

### RPi Print Server (Python)

| File | Lines | Purpose |
|------|-------|---------|
| `print_client.py` | 985 | Print daemon (Pusher WebSocket + polling fallback) |
| `dashboard.py` | 421 | Flask web dashboard |
| `printer.py` | 375 | CUPS printer wrapper |
| 6 templates | ~2,600 | Invoice, label, picking list HTML |

---

## B2B Order Flow (Complete)

```
สั่งของ (LIFF/LINE)
    │
    ▼
[draft] ─── ลูกค้ายืนยัน ──→ [checking_stock]
                                    │
                         ┌──────────┼──────────┐
                         ▼          ▼          ▼
                    [มีครบ]    [หมดบางส่วน]  [หมดทั้งหมด]
                         │          │          │
                         ▼          ▼          ▼
              [awaiting_confirm] [backorder]  [OOS notification]
                         │          │
              ลูกค้ายืนยันบิล    BO flow
                         │
                         ▼
              [awaiting_payment] ←── Flex แจ้งหนี้ + Invoice image
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
          [สลิป LINE]  [อัพโหลด]  [กรอกมือ]
              │          │          │
              ▼          ▼          ▼
           [paid] ──── Shipping Choice Flex ────→ Admin เลือกวิธีส่ง
                    │          │         │         │
                    ▼          ▼         ▼         ▼
              [Flash]    [ส่งเอง]   [Rider]   [มารับเอง]
                    │          │         │         │
                    ▼          ▼         ▼         ▼
              [packed]   [packed]  [shipped]  [completed]
                    │          │
                    ▼          ▼
              [shipped] ── Delivery check (1-3 วัน)
                    │
                    ▼
              [completed] ← ลูกค้ายืนยันรับ
```

---

## B2B Slip Payment Flow

```
ลูกค้าส่งสลิปใน LINE
    │
    ▼
Slip2Go API ตรวจ QR
    │
    ├── สลิปซ้ำ → แจ้ง "สลิปนี้เคยใช้แล้ว"
    ├── บัญชีไม่ตรง → แจ้ง "โอนไปบัญชีอื่น"
    ├── ไม่พบสลิป → เงียบ (อาจไม่ใช่สลิป)
    │
    └── สำเร็จ → ตัดหนี้ (current_debt)
                    │
                    ├── ยอดตรง (±2%) → auto-match → mark paid
                    │
                    └── ยอดไม่ตรง → ส่ง Flex "เลือกบิลที่ต้องการชำระ"
                                        │
                                        ├── ลูกค้ากดเลือก (postback)
                                        │
                                        └── หมดเวลา 30 นาที → ต้องส่งสลิปใหม่
```

---

## Bot Toggle (2 Systems)

| | Bot เปิด (B2B) | Bot ปิด (Manual Invoice) |
|---|---|---|
| **Text commands** | ✅ ตอบทุกคำสั่ง | ❌ block (ยกเว้น ขอไอดีกลุ่ม) |
| **สลิปใน LINE** | ✅ B2B Flex + LIFF buttons | ✅ Simple Flex ไม่มี LIFF |
| **Postback** | ✅ ทุก action | ❌ block (ยกเว้น slip_pay) |
| **Invoice Dashboard** | ✅ ทำงาน | ✅ ทำงาน (อิสระ) |
| **Cron notifications** | ✅ ส่ง LINE | ❌ ไม่ส่ง (เช็ค bot_enabled) |

---

## Cron Jobs (13 scheduled)

| Hook | Schedule | Purpose |
|------|----------|---------|
| `b2b_dunning_cron_event` | Daily 09:00 | Payment reminders + credit hold |
| `b2b_daily_summary_cron` | Daily 17:30 | Revenue summary + slip cleanup |
| `b2b_rank_update_event` | 1st of month | Distributor rank update |
| `b2b_bo_overdue_check` | Daily 10:00 | Backorder overdue alerts |
| `b2b_auto_complete_check` | Daily 11:00 | Auto-complete 7-day old deliveries |
| `b2b_oos_expiry_check` | Daily 06:00 | Clear expired OOS markers |
| `b2b_weekly_report_event` | Sunday 17:30 | Weekly summary report |
| `b2b_shipping_overdue_cron` | Daily 15:00 | Shipping delay alerts |
| `b2b_rpi_heartbeat_check` | Every 5 min | RPi printer status |
| `b2b_flash_tracking_cron` | Every 2 hrs | Flash tracking sync |
| `b2b_flash_courier_retry` | On-demand | Retry failed Flash courier |
| `b2b_flex_retry_cron` | Every 1 min | Retry failed Flex pushes |
| `b2b_auto_ship_flash_event` | 1hr after bill | Auto-fallback shipping choice |

---

## REST API Endpoints Summary

### B2B System (`/wp-json/b2b/v1/`)

**Public (webhook):** 1 endpoint
- `POST /webhook` — LINE webhook (HMAC verified)

**Session-authenticated (LIFF):** 12 endpoints
- `/auth-group`, `/catalog`, `/place-order`, `/distributor-info`
- `/order-history`, `/order-detail`, `/cancel-request`, `/bo-notify`
- `/invoice-gen`, `/slip-upload`, `/combined-slip-upload`, `/combined-invoice-gen`

**Admin-authenticated (nonce + manage_options):** 30+ endpoints
- Order management, Flash Express, print system, RPi control
- Distributor/product CRUD, settings, import/export

**Print-key authenticated (RPi):** 8 endpoints
- `/print-queue`, `/print-ack`, `/print-heartbeat`, `/rpi-command`

### Admin System (`/wp-json/dinoco/v1/`)
- `POST /github-sync` — GitHub webhook (HMAC verified)
- `POST /github-sync-manual` — Manual sync trigger
- `GET /sync-status` — Live sync progress (is_syncing, progress, current_file)

### Invoice System (inside Manual Invoice)
- 18 endpoints under `/invoice/` namespace (V.32.0: added `/distributor-detail`)

---

## ACF Field Groups

### Serial Number (warranty)
`serial_code`, `product_sku`, `owner_product`, `owner_sequence`, `w_status`, `warranty_expiry`, `warranty_duration_years`, `transfer_logs`, `repair_logs`

### B2B Order
`order_status`, `order_items`, `total_amount`, `source_group_id`, `is_billed`, `due_date`, `tracking_number`, `shipping_provider`, `shipped_date`, `customer_note`, `dist_name`, `dist_phone`, `dist_address`, `dist_district`, `dist_city`, `dist_province`, `dist_postcode`, `print_status`, `print_error`

### Distributor
`shop_name`, `shop_logo_url`, `line_group_id`, `rank_system`, `credit_limit`, `credit_term_days`, `current_debt`, `credit_hold`, `monthly_sales_mtd`, `bot_enabled`, `dist_phone`, `dist_address`, `dist_district`, `dist_city`, `dist_province`, `dist_postcode`, `recommended_skus`

### B2B Product
`product_sku`, `product_category`, `stock_status`, `b2b_discount_percent`, `price_standard`, `price_silver`, `price_gold`, `price_platinum`, `price_diamond`, `boxes_per_unit`, `min_order_qty`, `oos_timestamp`, `oos_duration_hours`, `oos_eta_date`

### Claim Ticket
`ticket_status`, `ticket_sn_text`, `snapshot_serial_code`, `snapshot_product_model`, `snapshot_product_sku`, `claim_condition`, `problem_type`, `customer_note`, `evidence_images`, `shipping_snap`, `tracking_inbound`, `tracking_outbound`, `courier_name`, `admin_internal_note`, `admin_parts_selected`

### AI Knowledge
`training_phrases`, `core_facts`, `ai_action`

---

## Warranty Status Flow (w_status)

```
warranty_available → warranty_on → (normal use)
        │                │
        ▼                ▼
warranty_pending    claim_process → repaired
        │                          → refurbished
        ▼                          → modified
   old_warranty                    → void
                                   → stolen
```

---

## Distributor Rank System

| Rank | Min Monthly Sales | Discount |
|------|-------------------|----------|
| Standard | ฿0 | Base price |
| Silver | ฿50,000 | price_silver |
| Gold | ฿100,000 | price_gold |
| Platinum | ฿200,000 | price_platinum |
| Diamond | ฿500,000 | price_diamond |

Updated monthly by `b2b_rank_update_event` cron.

---

## Security Layers

1. **LINE Webhook** — HMAC-SHA256 signature verification
2. **LIFF Pages** — HMAC-signed URLs with expiry + LINE group membership check
3. **Admin REST** — WordPress nonce + `manage_options` capability
4. **Session Token** — HMAC-based JWT with expiry + refresh/revoke (Snippet 15)
5. **Print API** — Shared API key in header
6. **Flash Webhook** — Flash Express signature verification
7. **GitHub Sync** — HMAC-SHA256 webhook signature
8. **Rate Limiting** — Transient-based cooldown on forms
9. **Slip Dedup** — Transaction ref + md5 key prevents double-use
10. **Advisory Locks** — Transient locks on all state-changing actions

---

---

## Thai ↔ English Status Mappings

### B2B Order Status (`order_status`)
| English Key | Thai Label | Emoji | Color |
|------------|-----------|-------|-------|
| `draft` | Draft | 📝 | `#475569` |
| `checking_stock` | เช็คสต็อก | 🔍 | `#475569` |
| `awaiting_confirm` | รอยืนยันออเดอร์ | 📋 | `#2563eb` |
| `awaiting_payment` | รอชำระเงิน | 💳 | `#ea580c` |
| `paid` | ชำระแล้ว | ✅ | `#16a34a` |
| `packed` | แพ็คแล้ว | 📦 | `#7b1fa2` |
| `shipped` | จัดส่งแล้ว | 🚚 | `#2563eb` |
| `completed` | เสร็จสิ้น | 🏁 | `#15803d` |
| `backorder` | Backorder | 🚫 | `#d97706` |
| `cancel_requested` | ขอยกเลิก | ⚠️ | `#dc2626` |
| `cancelled` | ยกเลิกแล้ว | 🗑️ | `#dc2626` |
| `change_requested` | ขอแก้ไข | ✏️ | `#2563eb` |
| `claim_opened` | เคลม | ↩️ | `#ea580c` |
| `claim_resolved` | เคลมเสร็จ | ✅ | `#16a34a` |

### Warranty Status (`w_status`)
| English Key | Thai Label |
|------------|-----------|
| `warranty_available` | สามารถลงทะเบียนรับประกันได้ |
| `warranty_pending` | รอตรวจสอบประกัน ติดต่อแอดมิน |
| `old_warranty` | ระบบประกันเก่าไม่สามารถเช็คการซ่อมได้ |
| `warranty_on` | รับประกันสินค้าสินค้าใหม่สภาพสมบูรณ์ |
| `repaired` | ผ่านการซ่อมบำรุง |
| `refurbished` | สภาพพร้อมใช้งาน |
| `modified` | ดัดแปลงสภาพ |
| `claim_process` | อยู่ระหว่างดำเนินการซ่อมบำรุง |
| `warranty_expired` | หมดประกัน (Expired) |
| `stolen` | สินค้าถูกขโมยระงับสิทธิ์ |
| `void` | ตัดประกัน (Void) |

> **หมายเหตุ**: `$w_map_reverse` ใน Service Center & Claims (3 จุด) ใช้แปลง Thai → English กลับ ห้ามลบ!

### Claim Ticket Status (`ticket_status`)
| English Key | Thai Label |
|------------|-----------|
| `Registered in System` | แจ้งเข้าระบบ |
| `Awaiting Customer Shipment` | ลูกค้าส่งของ |
| `In Transit to Company` | รอรับของ |
| `Received at Company` | รับของแล้ว |
| `Under Maintenance` | กำลังซ่อม |
| `Maintenance Completed` | สำเร็จ |
| `Repaired Item Dispatched` | ส่งสินค้าซ่อมบำรุงคืนให้ขนส่ง |
| `Pending Issue Verification` | รอตรวจสอบปัญหา |
| `Replacement Approved` | อนุมัติสินค้าทดแทนให้ลูกค้า |
| `Replacement Shipped` | ส่งพัสดุสินค้าทดแทนแล้ว |
| `Replacement Rejected by Company` | บริษัทไม่อนุมัติสินค้าทดแทน |

### Flash Express Status (from webhook `state` code)
| Code | English | Thai | Emoji | Color |
|------|---------|------|-------|-------|
| 0 | Updated | อัปเดตสถานะ | ⚪ | `#94a3b8` |
| 1 | Picked up | รับพัสดุแล้ว | 🟡 | `#f59e0b` |
| 2 | In transit | ระหว่างขนส่ง | 🔵 | `#3b82f6` |
| 3 | Delivering | กำลังนำส่ง | 🟠 | `#f97316` |
| 4 | Detained | คงคลัง | ⚠️ | `#dc2626` |
| 5 | Delivered | เซ็นรับแล้ว | 🟢 | `#16a34a` |
| 6 | Problem | มีปัญหา | 🔴 | `#dc2626` |
| 7 | Returned | ตีกลับ | 🔴 | `#dc2626` |
| 8 | Closed | ปิดงาน(ปัญหา) | ⛔ | `#6b7280` |
| 9 | Cancelled | ยกเลิก | ❌ | `#6b7280` |

### Flash Packing Status (`_flash_packing_status`)
| English Key | Thai Label | Emoji |
|------------|-----------|-------|
| `flash_created` | สร้างแล้ว | 📦 |
| `print_queued` | รอปริ้น | 🖨️ |
| `print_done` | ปริ้นแล้ว | 🖨️ |
| `ready_to_ship` | พร้อมส่ง | ✅ |
| `courier_called` | เรียกรถ | 🚛 |
| `picked_up` | รอรับ | 🟡 |
| `flash_create_error` | สร้างล้มเหลว | ❌ |
| `notify_error` | เรียกรถล้มเหลว | ❌ |

### Distributor Rank Labels
| English Key | Thai/Display | Emoji |
|------------|-------------|-------|
| `standard` | Standard | ⭐ |
| `silver` | Silver | 🥈 |
| `gold` | Gold | 🥇 |
| `platinum` | Platinum | 💎 |
| `diamond` | Diamond | 💠 |

### Shipping Providers
| Key | Display Name |
|-----|-------------|
| `Flash Express` | Flash Express |
| `Kerry Express` | Kerry Express |
| `J&T Express` | J&T Express |
| `ไปรษณีย์ไทย` | ไปรษณีย์ไทย (Thailand Post) |
| `Rider` | 🏍️ Rider/Lalamove |
| `self_pickup` | 🏪 ลูกค้ามารับเอง |

---

## ACF Fields — Complete Reference

### serial_number (Product Warranty)
| Field | Type | Purpose |
|-------|------|---------|
| `serial_code` | Text | Unique serial number |
| `product_sku` | Text | Product SKU reference |
| `owner_product` | Text | Current owner (username or LINE ID) |
| `owner_sequence` | Number | Transfer count |
| `w_status` | Select | Warranty status (see mapping above) |
| `warranty_duration_years` | Number | Warranty period |
| `warranty_register_date` | Date | Registration date |
| `warranty_expiry` | Date | Expiry date |
| `transfer_logs` | Text | JSON transfer history |
| `repair_logs` | Text | JSON service history |

### b2b_order (Orders + Invoices)
| Field | Type | Purpose |
|-------|------|---------|
| `order_status` | Select | Status (see mapping above) |
| `order_items` | Text | Serialized items |
| `total_amount` | Number | Total in Baht |
| `source_group_id` | Text | LINE group ID |
| `is_billed` | True/False | Whether debt was added |
| `due_date` | Date | Payment due date |
| `tracking_number` | Text | Shipping tracking |
| `shipping_provider` | Text | Courier name |
| `shipped_date` | Date | Ship date |
| `customer_note` | Text | Customer message |
| `admin_note` | Text | Internal notes |
| `dist_name` | Text | Distributor name snapshot |
| `dist_phone/address/district/city/province/postcode` | Text | Address snapshot |
| `stock_checked_by` | Text | Admin who confirmed stock |
| `claimed_by_admin` | Text | Admin who claimed order |
| `cancel_prev_status` | Text | Status before cancel |
| `cancelled_by` | Text | Who cancelled |
| `bo_eta_date` | Date | Backorder ETA |
| `bo_customer_response` | Text | Customer's BO decision |
| `print_status` | Text | Print job state |
| `print_error` | Text | Print error message |
| `orderer_display_name` | Text | Person who placed order |
| `orderer_user_id` | Text | LINE user ID of orderer |

### distributor (B2B Shops)
| Field | Type | Purpose |
|-------|------|---------|
| `shop_name` | Text | Display name |
| `shop_logo_url` | URL | Logo image |
| `line_group_id` | Text | LINE group ID |
| `rank_system` | Select | standard/silver/gold/platinum/diamond |
| `credit_limit` | Number | Max credit (Baht) |
| `credit_term_days` | Number | Payment terms (days) |
| `current_debt` | Number | Outstanding debt |
| `credit_hold` | True/False | Payment blocked |
| `monthly_sales_mtd` | Number | Month-to-date sales |
| `bot_enabled` | Text | '0' = off, '1' = on |
| `dist_phone/address/district/city/province/postcode` | Text | Shop address |
| `recommended_skus` | Text | Comma-separated SKUs |

### b2b_product (Product Catalog)
| Field | Type | Purpose |
|-------|------|---------|
| `product_sku` | Text | SKU code |
| `product_category` | Text | Category |
| `stock_status` | Select | in_stock / out_of_stock |
| `b2b_discount_percent` | Number | Base discount % |
| `price_standard` | Number | Standard price |
| `price_silver` | Number | Silver rank price |
| `price_gold` | Number | Gold rank price |
| `price_platinum` | Number | Platinum rank price |
| `price_diamond` | Number | Diamond rank price |
| `boxes_per_unit` | Number | Boxes per product |
| `min_order_qty` | Number | Minimum order |
| `oos_eta_date` | Date | OOS return date |
| `oos_timestamp` | Timestamp | When went OOS |
| `oos_duration_hours` | Number | Expected OOS hours |

### claim_ticket (Warranty Claims)
| Field | Type | Purpose |
|-------|------|---------|
| `ticket_status` | Select | Claim status (see mapping) |
| `ticket_sn_text` | Text | Ticket code |
| `snapshot_serial_code` | Text | SN at claim time |
| `snapshot_product_model/sku` | Text | Product snapshot |
| `claim_condition` | Text | Physical condition |
| `problem_type` | Text | Issue description |
| `customer_note` | Text | Customer message |
| `evidence_images` | Gallery | Defect photos |
| `shipping_snap` | Text | JSON shipping details |
| `tracking_inbound/outbound` | Text | Tracking codes |
| `courier_name` | Text | Courier company |
| `admin_internal_note` | Text | Admin notes |
| `admin_parts_selected` | Text | Approved parts JSON |

---

## Non-ACF Post Meta (`_` prefix)

### Flash Express (`_flash_*` on b2b_order)
| Key | Purpose |
|-----|---------|
| `_flash_tracking_numbers` | Array of PNO tracking codes |
| `_flash_packing_status` | Current packing state |
| `_flash_pno_statuses` | Per-box status map |
| `_flash_create_error` | Error message |
| `_flash_sort_code` | Flash sorting code |
| `_flash_courier_info` | Courier JSON details |
| `_flash_courier_retry_count` | Retry counter |
| `_flash_pack_started` | Pack start timestamp |
| `_flash_tracking_events` | Status event log array |

### Shipment (`_b2b_*` on b2b_order)
| Key | Purpose |
|-----|---------|
| `_b2b_shipments` | Shipment records array |
| `_b2b_shipping_method` | rider / self_pickup / manual |
| `_b2b_shipping_status` | Overall shipping state |
| `_b2b_has_backorder` | Has unshipped items |

### Invoice (`_inv_*` on b2b_order)
| Key | Purpose |
|-----|---------|
| `_inv_number` | Invoice number (INV-DNC-XXXXX) |
| `_inv_date` | Invoice date (Y-m-d) |
| `_inv_paid_amount` | Cumulative paid amount |
| `_inv_partial_payments` | JSON payment records |
| `_inv_slip_ref` | Verified slip reference |
| `_order_source` | 'manual_invoice' or absent (B2B) |
| `_dist_post_id` | Distributor post ID |

### Other
| Key | Purpose |
|-----|---------|
| `_sla_nag_count` | SLA reminder counter |
| `_pending_flex` | Queued Flex for retry |
| `_ship_method` | 'manual' or 'flash' |
| `_b2b_audit_log` | Audit trail array |

---

## User Meta Keys

### LINE Integration
| Key | Purpose |
|-----|---------|
| `line_user_id` | LINE user ID |
| `owner_line_id` | LINE ID for display |
| `line_picture_url` | Profile picture URL |

### Personal Info
| Key | Purpose |
|-----|---------|
| `first_name` / `last_name` | Name |
| `phone_number` | Contact phone |
| `birth_date` | Date of birth |
| `user_moto_brand` / `model` / `year` | Motorcycle info |

### Thai Address
| Key | Purpose |
|-----|---------|
| `addr_house_no` | House/building number |
| `addr_soi` | Soi (lane) |
| `addr_subdistrict` | ตำบล/แขวง |
| `addr_district` | อำเภอ/เขต |
| `addr_province` | จังหวัด |
| `addr_zip` | รหัสไปรษณีย์ |

### Consent (PDPA)
| Key | Purpose |
|-----|---------|
| `dinoco_pdpa_consent` | 'accepted' or empty |
| `dinoco_pdpa_timestamp` | When accepted |
| `dinoco_pdpa_version` | Policy version |

---

## wp_options Keys

| Key | Type | Purpose |
|-----|------|---------|
| `dinoco_product_catalog` | JSON | Product definitions |
| `dinoco_sku_relations` | JSON | Bundle/SET recipes |
| `b2b_settings` | JSON | B2B system config |
| `b2b_cron_schedule_ver` | String | Cron version tracking |
| `b2b_auto_print_enabled` | Boolean | Auto-print toggle |
| `b2b_print_api_key` | String | RPi print API key |
| `b2b_shipping_mode` | String | 'auto' or 'manual' |
| `b2b_registered_address` | Text | Company address |
| `b2b_warehouse_address` | Text | Warehouse address |
| `b2b_bot_disabled_groups` | Array | Groups with bot OFF |
| `dinoco_sync_latest_sha` | String | Last synced commit |
| `dinoco_last_sync_result` | JSON | Sync dashboard data |

---

## Deployment

Code lives in GitHub → pushed via webhook → `[AdminSystem-System] GitHub Webhook Sync` (V.34.1) pulls to WordPress `wp_snippets` table → Code Snippets plugin executes.

**Sync Engine (V.34.1):**
- Single-pass sync in shutdown hook (no cron dependency)
- DB_ID matching primary, normalized name fallback
- Hash comparison (md5) before update — skip if identical
- Post-verify: read-back hash after write
- GitHub Contents API primary (no CDN cache)
- Live progress bar via `/sync-status` polling (3s)
- Auto-detect webhook-already-synced

**No build step.** No Node.js. No framework. Pure PHP + vanilla JS.

Timezone: `Asia/Bangkok` (UTC+7) hardcoded throughout.
