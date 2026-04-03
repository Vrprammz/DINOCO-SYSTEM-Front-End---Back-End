# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DINOCO System is a **WordPress-based motorcycle warranty management platform** serving B2C members and B2B distributors. All code is PHP executed within WordPress — there is no separate build step, no Node.js, and no modern JS framework.

## Architecture

- **Backend**: WordPress + Advanced Custom Fields (ACF). Data is stored in Custom Post Types (claims, registrations, B2B orders) and user metadata.
- **Frontend**: Vanilla HTML/CSS/JavaScript embedded inline in PHP files. UI is exposed via WordPress shortcodes.
- **Authentication**: LINE Login (OAuth2) creates/links WordPress users. Admin access uses `current_user_can('manage_options')`.
- **AI Module**: Google Gemini API with function calling (v22.0). The AI retrieves real data via PHP functions rather than generating answers from training data. Conversations capped at 12 messages, temperature 0.35.
- **Integrations**: LINE push notifications (B2B alerts), PDF generation (claims), CSV export (admin dashboards).

## Key Shortcodes (Entry Points)

| Shortcode | Purpose |
|---|---|
| `[dinoco_login_button]` | LINE Login gateway |
| `[dinoco_gateway]` | Warranty registration flow |
| `[dinoco_admin_dashboard]` | Admin analytics & CRM |
| `[b2b_admin_dashboard]` | B2B distributor portal |
| `[dinoco_admin_ai_control]` | AI assistant control panel |
| `[dinoco_admin_finance]` | Finance dashboard (debt, revenue, payments) |
| `[dinoco_brand_voice]` | Brand Voice Pool (social listening, brand sentiment) |
| `[b2f_maker_liff]` | B2F Maker LIFF pages (confirm PO, reschedule, PO list) |
| `[b2f_admin_orders_tab]` | B2F Orders tab (embedded in Admin Dashboard) |
| `[b2f_admin_makers_tab]` | B2F Makers management tab |
| `[b2f_admin_credit_tab]` | B2F Credit tracking tab |
| `[liff_ai_page]` | LIFF AI Command Center (Lead management for dealers + admin) |

## REST API Endpoints (B2B)

All under `/wp-json/b2b/v1/`: `confirm-order`, `flash-create`, `daily-summary`, `update-status`, `delete-ticket`, `recalculate-total`, `flash-label`, `flash-ready-to-ship`, `manual-flash-create`, `manual-shipments`, `manual-flash-cancel`.

## REST API Endpoints (B2F)

All under `/wp-json/b2f/v1/`: `makers`, `maker`, `maker-products`, `maker-product`, `create-po`, `po-detail`, `po-update`, `po-cancel`, `maker-confirm`, `maker-reject`, `maker-reschedule`, `maker-po-list`, `maker-deliver`, `approve-reschedule`, `receive-goods`, `record-payment`, `reject-lot`, `po-complete`, `dashboard-stats`, `po-history`.

## REST API Endpoints (LIFF AI)

All under `/wp-json/liff-ai/v1/`: `auth`, `dashboard`, `dealer-dashboard`, `leads`, `lead/{id}`, `lead/{id}/accept`, `lead/{id}/note`, `lead/{id}/status`, `claims`, `claim/{id}`, `claim/{id}/status`.

## REST API Endpoints (MCP Bridge)

All under `/wp-json/dinoco-mcp/v1/` (32 endpoints, V.2.0):
- **Core**: `product-lookup` (+stock_status), `dealer-lookup`, `warranty-check`, `kb-search`, `kb-export`, `catalog-full`, `distributor-notify`, `distributor-list`, `kb-suggest`, `brand-voice-submit`
- **Claims**: `claim-manual-create`, `claim-manual-update`, `claim-manual-status`, `claim-manual-list`, `claim-status`
- **Leads (P1)**: `lead-create`, `lead-update`, `lead-list`, `lead-get/{id}`, `lead-followup-schedule`
- **Phase 2**: `warranty-registered`, `member-motorcycle`, `member-assets`, `customer-link`, `dealer-sla-report`, `distributor-get/{id}`, `product-compatibility`
- **Phase 3**: `kb-updated`, `inventory-changed`, `moto-catalog`, `dashboard-inject-metrics`, `lead-attribution`

## Required WordPress Constants

- `DINOCO_LINE_CHANNEL_ID` — LINE OAuth app ID
- `DINOCO_LINE_REDIRECT_URI` — OAuth callback URL
- `B2B_LINE_ACCESS_TOKEN` — Bot token for LINE notifications
- `B2B_ADMIN_GROUP_ID` — Admin LINE group for alerts
- `DINOCO_GITHUB_TOKEN` — GitHub PAT for sync engine
- `DINOCO_GITHUB_REPO` — GitHub repo (e.g., `Vrprammz/DINOCO-SYSTEM-Front-End---Back-End`)
- `DINOCO_GITHUB_WEBHOOK_SECRET` — Webhook signature secret
- `B2F_LIFF_ID` — ใช้ตัวเดียวกับ `B2B_LIFF_ID` (auto-fallback ไม่ต้องตั้งแยก)

## File Organization

Files are named by feature area with bracket prefixes:
- `[System] *` — Member-facing features (dashboard, registration, claims, profile)
- `[Admin System] *` — Admin/management features (analytics, CRM, AI, knowledge base)
- `[B2B] Snippet N: *` — B2B distributor modules (versioned snippets)
- `[B2F] Snippet N: *` — B2F factory purchasing modules (Snippets 0-7)
- `[GitHub] *` — Webhook integration

Each file is a self-contained module with its own version number (e.g., V.32.x, V.34.x).

### DB_ID Header (V.32.0)

Every snippet file includes a `DB_ID: NNN` header in its comment block (first 1000 chars). This integer maps to the `id` column in the `wp_snippets` table. The GitHub Webhook Sync engine (`dinoco_extract_db_id()`) uses DB_ID as the **primary** matching key when syncing code from GitHub to WordPress. If a file has no DB_ID header, it falls back to normalized filename matching.

## Development Notes

- **Deployment**: Files are WordPress code snippets deployed via GitHub Webhook Sync (V.34.1). Push to `main` → webhook auto-syncs all snippets using DB_ID matching. Manual sync available via dashboard.
- **Debt System**: Atomic MySQL transactions (`b2b_debt_add/subtract` in Snippet 13) with `FOR UPDATE` lock. `b2b_recalculate_debt()` is single-SQL source of truth. All debt mutations go through Snippet 13 — direct `update_field('current_debt')` is blocked.
- **Timezone**: Hardcoded to `Asia/Bangkok` throughout.
- **Language**: UI text and code comments are primarily in Thai.
- **Security patterns**: WordPress nonce verification, honeypot fields, rate limiting via transients, `sanitize_text_field`/`esc_html`/`esc_url` for output.
- **CSS scoping**: Styles are inline within each PHP file. Recent work has focused on scoping CSS to avoid cross-module conflicts.
- **setTimeout gotcha**: Admin Dashboard overrides `window.setTimeout` to capture timers >= 3s for auto-refresh control. Toast/notification auto-dismiss must use `(window._dncAutoRefresh && window._dncAutoRefresh.origSetTimeout) || setTimeout` to bypass the override.
- **Modal pattern**: Modals use event delegation for dynamically created elements. Backdrop click-to-close is a common interaction pattern.
- **View/Edit toggle pattern**: Profile page uses Facebook-style view-mode cards. Info is read-only by default; tap "แก้ไข" to expand the form. Save button only appears when a section is in edit mode.
- **Motorcycle Catalog**: Brands/models/images/aliases stored in custom MySQL tables (`dinoco_moto_brands` + `dinoco_moto_models`) via `DINOCO_MotoDB` class in Snippet 15. Admin UI via `[dinoco_admin_moto]`. Consumer files use `dinoco_get_brands_list()`, `dinoco_get_model_image()`, `dinoco_get_moto_catalog_json()` with `class_exists` fallback.
- **Negative margin gotcha**: Elements with negative margin (e.g. cover photo `margin: -20px -20px 0`) cause horizontal scroll. Always add `overflow-x: hidden` on the parent wrapper.
- **B2F System**: Business to Factory — DINOCO สั่งซื้อสินค้าจากโรงงานผู้ผลิต (Maker). ใช้ LINE Bot เดียวกับ B2B + LIFF ID เดียวกัน. Kill switch: `define('B2F_DISABLED', true)`.
- **B2F Architecture**: Bot เดียว routing ตาม `group_id` — Distributor→B2B Flex, Maker→B2F Flex, Admin→ทั้งหมด (carousel 3 หน้า). B2F routing อยู่ใน B2B Snippet 2 (function_exists guard). B2F functions อยู่ใน Snippet 3.
- **B2F Credit System**: Atomic payable operations via `b2f_payable_add/subtract()` ใน Snippet 7. ใช้ `FOR UPDATE` lock เหมือน B2B Debt System. `b2f_recalculate_payable()` เป็น single-SQL source of truth. ทิศทางกลับจาก B2B (DINOCO เป็นหนี้ Maker). Auto credit hold เมื่อเลยวงเงิน (reason=auto), Admin hold เอง (reason=manual).
- **B2F Multi-Currency** (V.3.0/V.4.0/V.7.0): รองรับ THB/CNY/USD per Maker. `po_currency` + `po_exchange_rate` snapshot ตอนสร้าง PO (immutable หลัง submitted). `po_shipping_method` (land/sea) บังคับสำหรับ ≠THB. Helpers: `b2f_currency_symbol()`, `b2f_format_currency($amount, $currency)`, `b2f_currency_name_en()`. receive-goods คำนวณ rcv_total_value เป็น THB (x exchange_rate). record-payment ≠THB ข้าม slip verify (admin_approved). Rate ranges: THB=1, CNY=2-10, USD=25-50.
- **B2F FSM**: `B2F_Order_FSM` class ใน Snippet 6. 12 statuses: draft→submitted→confirmed→delivering→received→paid→completed. Terminal: completed, cancelled. ทุก transition ต้องผ่าน `b2f_transition_order()`.
- **B2F Snippets** (DB_ID 1160-1171):
  - Snippet 0 (1160): CPT & ACF Registration — 5 CPTs + helpers + `b2f_get_maker_by_group()` (cached 5min/1hr)
  - Snippet 1 (1163): Core Utilities & Flex Builders V.5.0 — LINE push + 18 Flex templates + `b2f_liff_url()` (HMAC sig) + i18n ENG/TH (currency != THB = ENG)
  - Snippet 2 (1165): REST API V.7.1 — 20+ endpoints namespace `/b2f/v1/` + `auth-admin` (LIFF auth for Admin) + concurrent locks (po-cancel, maker-deliver) + is_complete หัก rejected + payment fallback THB
  - Snippet 3 (1164): Webhook Handler & Bot Commands — Maker commands + Admin B2F commands + Flex menu (self-contained)
  - Snippet 4 (1167): Maker LIFF Pages V.4.0 — shortcode `[b2f_maker_liff]` route `/b2f-maker/` + LANG system (`_isEng` + `L()` for non-THB currency makers)
  - Snippet 5 (1166): Admin Dashboard Tabs V.3.1 — 3 shortcodes embedded ใน Admin Dashboard + Bulk Cancel PO (V.2.0) + Multi-Currency UI (V.3.0) + Settings REST endpoint + receive form remaining fix (shipped-received)
  - Snippet 6 (1161): Order State Machine — `B2F_Order_FSM` class
  - Snippet 7 (1162): Credit Transaction Manager — atomic `b2f_payable_add/subtract()`, credit เกิดตอน receive-goods เท่านั้น (ไม่หักตอน create-po), `b2f_recalculate_payable()` คำนวณจาก `rcv_total_value` ของ receiving records
  - Snippet 8 (1168): Admin LIFF E-Catalog — หน้าสั่งซื้อจาก LINE (LIFF auth V.2.0 ไม่ต้อง WP login) + Multi-Currency UI (V.3.0)
  - Snippet 9 (1169): PO Ticket View — หน้าดูรายละเอียด PO (status timeline, items, receiving, payment, credit)
  - Snippet 10 (1170): PO Image Generator — สร้างรูปใบสั่งซื้อ A4 ด้วย GD Library + REST `/b2f/v1/po-image`
  - Snippet 11 (1171): Cron Jobs & Reminders — 7 cron jobs (เตือนจัดส่ง/ล่าช้า/ชำระ/Maker ไม่ตอบ/สรุปวัน/สัปดาห์/เดือน)
- **B2F Slip Verification**: `b2f_verify_slip_image()` (Snippet 1) เรียก Slip2Go API verify สลิปจ่ายเงินโรงงาน ใช้ `B2B_SLIP2GO_SECRET_KEY` เดียวกับ B2B. Maker ต้องมี `maker_bank_code` (ACF field) ถึงจะ verify ได้ ถ้าไม่มี → `slip_status=pending`. Bot รับรูปสลิปในกลุ่ม Maker อัตโนมัติ (Snippet 3 `b2f_handle_maker_slip_image`). `b2f_find_pending_po_for_slip()` match PO ค้างจ่าย ±2%.
- **B2F ENG Labels** (V.7.2/V.2.8/V.1.6): Maker-facing Flex/text ใช้ ENG เมื่อ `po_currency` (หรือ `maker_currency`) ไม่ใช่ THB. ใช้ `$is_eng = $po_currency !== 'THB'` + ternary. Admin group Flex ยังไทยเสมอ. Payment/Debt แสดง THB เสมอ แต่ ENG label "Outstanding (THB)". Snippet 2 (REST): po-cancel แยก `$cancel_body_maker`/`$cancel_body_admin`, maker-deliver + receive-goods ใช้ `$rcv_build_body()` closure สร้าง body แยก lang. Snippet 3 (Webhook): @mention menu, confirm/reject/deliver reply, New PO Flex, PO list, deliverable list, reschedule approve/reject. Snippet 11 (Cron): delivery reminder, overdue, no-response fallback text.
- **B2F Gotchas**:
  - `b2f_liff_url()` แก้แล้ว (V.1.2) ใช้ HMAC sig แทน JWT — B2B Admin Flex Bubble 3 ใช้ `b2b_liff_url()` ชี้ไป Admin Dashboard LIFF tab=b2f_overview; "สั่งโรงงาน" ใช้ `b2f_liff_url('b2f-catalog/')` เปิด LIFF ตรง (V.31.7)
  - B2F Admin LIFF (Snippet 8) auth ผ่าน `POST /b2f/v1/auth-admin` (HMAC sig + LINE ID Token + WP admin user check) → issue JWT session token → ใช้ `X-B2F-Token` header แทน WP nonce
  - LIFF Router (B2B Snippet 4 V.30.4) forward query params จาก `$_GET` เมื่อ redirect ตาม `liff.state` — แก้ปัญหา params หายเมื่อ LINE แยก query string ออกจาก path
  - Maker Flex menu URLs (B2F Snippet 1 V.1.3) ใช้ path `/b2f-maker/` + `page` param (list/deliver/reschedule) แทน path แยก `/b2f-maker-po/` ที่ไม่มี WP page
  - LINE ไม่ส่ง `mention.mentionees[].isSelf` ในบาง group — ตรวจ @mention จาก text pattern `/@DINOCO/i` แทน
  - Sync Engine ต้อง bump version เพื่อ force sync — ถ้า hash ตรง (Same) จะไม่ update แม้โค้ดจริงต่างกัน (เกิดจากสร้าง snippet ใน WP ก่อน sync)
  - Cache `b2f_get_maker_by_group()` negative result TTL 5 นาที — ถ้าเพิ่ม group_id ใน Maker แล้ว Bot เงียบ เรียก `/debug-maker/{group_id}` เพื่อ clear cache
  - Maker group_id ต้อง unique ข้าม distributor — validate ด้วย `b2f_validate_group_id()`
  - Maker LIFF LANG system (V.4.0): `_isEng = currency !== 'THB'` set จาก API response แรก. `L(th, en)` helper switch ทุก UI string. `formatDate()` + `fmtDateShort()` switch locale ตาม `_isEng`. PHP loading text เป็น neutral English ("Connecting...")
  - Admin Dashboard sidebar ต้องมี `<div class="sidebar-nav">` wrapper เพื่อ scroll ได้เมื่อเมนูเยอะ
  - B2F REST API nonce ต้องใช้ `wp_create_nonce('wp_rest')` ไม่ใช่ custom nonce name
  - B2F API response list ต้องใช้ key `data` ไม่ใช่ `makers`/`products` (frontend อ่าน `res.data`)
- **B2F Multi-Currency** (V.3.0+): Maker มี `maker_currency` (THB/CNY/USD). Product มี `mp_shipping_land` + `mp_shipping_sea` (THB/unit). PO มี `po_currency`, `po_exchange_rate`, `po_shipping_method` (land/sea), `po_total_amount_thb`, `po_shipping_total`, `po_grand_total_thb`. Frontend helpers: `b2f_currency_symbol()`, `b2f_format_currency()`, `b2f_currency_name_en()` (Snippet 1). Settings: `b2f_shipping_dest_land`, `b2f_shipping_dest_sea` (wp_options, REST `/b2f/v1/settings`). Exchange rate range: CNY 2-10, USD 25-50. Currency immutable หลัง submitted.
  - `b2f_get_po_data()` return `currency`, `exchange_rate`, `shipping_method` — Flex builders ทุกตัวใช้ `$po['currency']` แทน hardcode `'฿'`
  - PO Image (Snippet 10 V.2.4): CNY/USD PO ใช้ ENG template (PURCHASE ORDER, No., Date, Supplier, Item, Qty, Unit Price, Amount) + delivery address + shipping method (By Truck K / By Sea M) + ไม่แสดง baht_text
  - **3-Language Support** (V.6.0): `b2f_t($th, $en, $zh, $currency)` helper ใน Snippet 1. THB→ไทย, USD→English, CNY→中文 (fallback ถ้า $zh empty ใช้ $en). Snippet 1/2/3/11 ใช้ `b2f_t()` แทน `$is_eng ? 'EN' : 'TH'` ternary เดิม. `b2f_flex_status_badge($status, $currency)` เปลี่ยน signature จาก `$is_eng` เป็น `$currency` (backward compat: boolean → auto convert)
  - Maker LIFF (Snippet 4 V.3.18): `curSym(po)` helper ใช้ `po.currency_symbol` จาก API
  - PO Ticket (Snippet 9 V.3.3): Admin เห็น "ต้นทุนจริง" section (ยอดสกุลโรงงาน, exchange rate, THB total, ค่าส่ง, ต้นทุนรวม) สำหรับ foreign PO
  - Cron messages (Snippet 11 V.1.5): แสดง currency note สำหรับ foreign PO
  - Debt/credit/payment/outstanding = THB เสมอ (ไม่แปลงสกุล)
  - Flash cron `b2b_flash_tracking_cron` ใช้ fallback interval `everytwohours` (จาก WP Fastest Cache) เพราะ `every_2hr_b2b` ไม่ load ใน REST context + DISABLE_WP_CRON=true
  - Flash Webhook ต้องกดตั้งค่าใน B2B Admin → Flash → ตั้งค่า Webhook ทุกครั้งที่เปลี่ยน API key/domain
  - `/debug-flash/{ticket_id}` (admin only ใน B2B Snippet 5) — ดึง Flash Routes API + force update สถานะ + schedule cron
- **Manual Flash Shipping** (V.38.0): ระบบส่งพัสดุ standalone ไม่ต้องมี B2B order. เข้าผ่าน RPi Dashboard `/manual-ship` (Basic Auth). สร้าง Flash order ตรง + render label (ไม่มี LOGO/แถบดำ DINOCO) + print ผ่าน RPi. เก็บรายการใน `wp_options` key `b2b_manual_shipments_{YYYY_MM}`. Config: `manual_ship_user`, `manual_ship_pass`, `manual_ship_sender_*` ใน `config.json`.
- **Walk-in Distributor** (V.39.0): ร้านหน้าโกดัง — เปิด toggle `is_walkin` บน distributor CPT ใน Admin Panel. Flow: สั่งของ → ยืนยัน → **ข้ามเช็คสต็อก** (auto `awaiting_confirm`) → ยืนยันบิล → เพิ่มหนี้+INV เหมือนเดิม → จ่าย → **auto completed** (ข้ามเลือกวิธีส่ง). ระบบเครดิต/หนี้/สลิปชำระเหมือนเดิม 100%. Order stamp `_b2b_is_walkin=1`. Hook `b2b_order_status_changed` → `b2b_walkin_auto_complete()` ใน Snippet 2.
- **Walk-in Bank Account** (V.32.0): Walk-in orders ใช้บัญชีธนาคารแยกได้ผ่าน constants `B2B_WALKIN_BANK_*` (BANK_NAME, BANK_NAME_EN, BANK_ACCOUNT, BANK_HOLDER, BANK_CODE, BANK_LOGO_URL, PROMPTPAY_ID). ถ้าไม่ define จะ fallback เป็น `B2B_BANK_*` ปกติ. `b2b_get_bank_info($order_id)` / `b2b_get_bank_logo_url($order_id)` / `b2b_get_bank_copy_text($order_id)` รับ order_id เพื่อเช็ค walk-in. Slip verification (Snippet 2+3) accept ทั้ง 2 บัญชี. Walk-in confirm_order+confirm_bill ไม่ส่ง text ซ้ำ (Flex card เพียงพอ).
- **Walk-in Cancel** (V.31.9): Admin สามารถยกเลิก completed walk-in order ได้. FSM V.1.3 เพิ่ม `completed→cancelled` (admin only). `@admincancel` + Admin Dashboard dropdown รองรับ. คืนหนี้อัตโนมัติ (`is_billed` check + `b2b_recalculate_debt`). ส่ง Flex card ไปกลุ่มลูกค้า (แจ้งยกเลิก + แจ้งคืนเครดิต). Non-walk-in completed orders ยังคง terminal state.
- **LIFF AI Snippets** (DB_ID 1180-1181):
  - Snippet 1 (1180): REST API V.1.1 — Auth (LINE ID Token verify + JWT) + Lead/Claim endpoints + Agent proxy (`liff_ai_call_agent`). Claim detail returns photos (normalized URLs), ai_analysis, status_history. Claim status update logs history + supports 13 statuses.
  - Snippet 2 (1181): Frontend V.2.0 — shortcode `[liff_ai_page]` route `/ai-center/` + SPA-like pages (dashboard, dealer, lead detail, claim list, claim detail, agent chat). Bottom nav (Admin: 4 tabs, Dealer: 2 tabs). Photo lightbox with swipe. Claim status change modal (Admin). AI Agent placeholder (Phase 3).
- **LIFF AI Architecture**: ตัวแทน (dealer) เปิด LIFF → verify id_token → ค้นหา distributor CPT (`owner_line_uid` field) หรือ WP user (`linked_distributor_id` meta) → issue JWT → ใช้ `X-LIFF-AI-Token` header. Lead data อยู่ใน MongoDB (ผ่าน Agent proxy:3000). Claim data อยู่ใน WP (warranty_claim CPT).
- **LIFF AI Constants**: `LIFF_AI_SECRET_KEY`, `LIFF_AI_JWT_SECRET` (auto-generate เก็บ wp_options), `LIFF_AI_AGENT_URL` (default `http://agent:3000`), `LIFF_AI_AGENT_KEY`
- **LIFF AI Gotchas**:
  - Auth ใช้ LINE ID Token verify อย่างเดียว (ไม่ต้อง HMAC sig จาก client — secret key ฝัง JS ไม่ปลอดภัย)
  - Dealer ต้องมี ACF field `owner_line_uid` บน distributor CPT หรือ WP user meta `linked_distributor_id`
  - CSS prefix `.liff-ai-*` ทุก class (dark theme), scoped ไม่ conflict กับ B2B/B2F
  - Lead statuses ตรงกับ `LEAD_STATUSES` ใน `lead-pipeline.js` (17 statuses)
- **OpenClaw Mini CRM** (`openclawminicrm/`): Multi-platform AI chatbot (LINE + Facebook + Instagram). ดู `openclawminicrm/CLAUDE.md` สำหรับรายละเอียด.
  - **Agent** (`proxy/`): Node.js + Express, Gemini Flash + Claude Sonnet (function calling), MongoDB Atlas
  - **Modules**: `ai-chat.js` (AI providers + supervisor), `dinoco-tools.js` (8 tools), `shared.js` (prompt + config), `claim-flow.js`, `lead-pipeline.js`, `dinoco-cache.js`
  - **Anti-Hallucination V.1.4**: 3 ชั้นป้องกัน (prompt → tool boundary → output sanitize), claudeSupervisor ตรวจทุก platform, product restrictions per model
  - **Security**: requireAuth ทุก API endpoint, prompt injection protection 14 patterns, PII masking, rate limiting
