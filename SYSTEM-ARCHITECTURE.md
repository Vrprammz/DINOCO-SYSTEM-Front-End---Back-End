# DINOCO System Architecture -- Complete Reference

> Updated: 2026-04-04 | Version: V.40.0 | 40+ files, ~55,000 lines
> Source: Deep code review by Tech Lead orchestrator

---

## 1. Technology Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **CMS / Backend** | WordPress 6.x | PHP 8.x, Code Snippets plugin (wp_snippets table) |
| **Database** | MySQL (MariaDB) | InnoDB, ACF fields stored in wp_postmeta |
| **Frontend** | Vanilla HTML/CSS/JS | Inline in PHP files, no build step, no framework |
| **Mobile UI** | LINE LIFF (LINE Front-end Framework) | SPA-like pages inside LINE app |
| **Authentication** | LINE Login OAuth2 | Creates/links WP users |
| **AI (WordPress)** | Google Gemini API + Claude API | Function calling (v22.0), AI Provider Abstraction Layer |
| **AI (Chatbot)** | OpenClaw Mini CRM | Node.js + Express, Gemini Flash + Claude Sonnet, MongoDB Atlas |
| **Messaging** | LINE Messaging API | Flex Messages, Push/Reply, Rich Menu |
| **Shipping** | Flash Express API | Create order, print label, track, notify courier |
| **Payment Verify** | Slip2Go API | Bank slip OCR verification |
| **PDF** | PHP GD Library | Invoice/PO images as PNG (A4 format) |
| **Deployment** | GitHub Webhook Sync | Push to main -> auto-sync to WordPress wp_snippets |
| **Timezone** | Asia/Bangkok (ICT) | Hardcoded throughout |
| **Language** | Thai (UI), English (technical) | B2F foreign makers use ENG labels |

---

## 2. Server Architecture

```
                    +-------------------+
                    |   LINE Platform   |
                    | (Messaging API)   |
                    +--------+----------+
                             |
                    Webhook POST /b2b/v1/webhook
                             |
                    +--------v----------+
                    |   WordPress       |
                    |   (dinoco.in.th)  |
                    |                   |
                    |  Code Snippets    |
                    |  (40+ modules)    |
                    |                   |
                    |  REST API:        |
                    |  /b2b/v1/*        |
                    |  /b2f/v1/*        |
                    |  /liff-ai/v1/*    |
                    |  /dinoco-mcp/v1/* |
                    |  /dinoco/v1/*     |
                    |  /dinoco-inv/v1/* |
                    +---+------+-------+
                        |      |
              +---------+      +----------+
              |                           |
    +---------v--------+       +----------v---------+
    | Flash Express    |       | OpenClaw Mini CRM  |
    | (Shipping API)   |       | (Node.js Agent)    |
    +------------------+       |                    |
                               | Gemini + Claude    |
    +------------------+       | MongoDB Atlas      |
    | Slip2Go          |       +--------------------+
    | (Payment Verify) |
    +------------------+       +--------------------+
                               | GitHub             |
    +------------------+       | (Webhook Sync)     |
    | Google Gemini    |       +--------------------+
    | (AI Control)     |
    +------------------+
```

---

## 3. Module Map -- All Snippet Files

### 3.1 [System] -- Member-Facing (B2C)

| File | Version | DB_ID | Shortcode | Description |
|------|---------|-------|-----------|-------------|
| [System] DINOCO Gateway | V.30.2 | 9 | `[dinoco_login_button]` | LINE Login card UI |
| [System] LINE Callback | V.30.2 | 10 | `[dinoco_gateway]` | OAuth callback + warranty registration button |
| [System] Member Dashboard Main | V.30.2 | 11 | `[dinoco_dashboard]` | Main controller, routing, rate limiting |
| [System] author profile line | V.30.2 | 12 | -- | LINE profile picture for WP author |
| [System] Dinoco Custom Header | V.30.2 | 13 | -- | Hide admin bar for non-admin users |
| [System] Transfer Warranty Page | V.30.2 | 15 | `[dinoco_transfer_sys]` / `[dinoco_transfer_v3]` | Warranty ownership transfer |
| [System] DINOCO Claim System | V.30.2 | 16 | `[dinoco_claim_page]` | Claim submission + PDF generation |
| [System] DINOCO Global App Menu | V.31.1 | 17 | -- | Bottom navigation bar (native app style) |
| [System] DINOCO Edit Profile | V.34.2 | 18 | `[dinoco_edit_profile]` | User profile edit (Facebook-style view/edit toggle) |
| [System] Legacy Migration Logic | V.30.2 | 19 | `[dinoco_legacy_migration]` | Legacy warranty migration (admin-ajax) |
| [System] Dashboard - Header & Forms | V.30.3 | 28 | `[dinoco_dashboard_header]` | Sidebar, profile card, PDPA, registration forms |
| [System] Dashboard - Assets List | V.30.2 | 29 | `[dinoco_dashboard_assets]` | Assets list with bundle support |
| [System] DINOCO MCP Bridge | V.2.0 | 1050 | -- | REST API Bridge for OpenClaw (32 endpoints) |

### 3.2 [Admin System] -- Admin/Management

| File | Version | DB_ID | Shortcode | Description |
|------|---------|-------|-----------|-------------|
| [Admin System] DINOCO Admin Dashboard | V.30.5 | 21 | `[dinoco_admin_dashboard]` | Command Center: KPIs, charts, pipeline, AI Inbox |
| [Admin System] DINOCO Global Inventory Database | V.30.2 | 22 | `[dinoco_admin_inventory]` | Inventory Command Center |
| [Admin System] DINOCO Legacy Migration Requests | V.30.2 | 23 | `[dinoco_admin_legacy]` | Admin legacy migration manager |
| [Admin System] DINOCO User Management | V.30.2 | 25 | `[dinoco_admin_users]` | CRM + full analytics |
| [Admin System] DINOCO Manual Transfer Tool | V.30.2 | 26 | `[dinoco_admin_transfer]` | Force transfer warranty ownership |
| [Admin System] DINOCO Service Center & Claims | V.30.2 | 27 | `[dinoco_admin_claims]` | Claims management + auto-close cron |
| [Admin System] AI Control Module | V.30.2 | 35 | `[dinoco_admin_ai_control]` | AI Command Center (Gemini v22.0 function calling) |
| [Admin System] KB Trainer Bot v2.0 | V.30.2 | 62 | -- | Knowledge Base trainer (Gemini) |
| [Admin System] DINOCO Manual Invoice System | V.33.1 | 598 | `[dinoco_manual_invoice]` | Manual billing for B2B distributors |
| [Admin System] AI Provider Abstraction | V.1.2 | 1040 | -- | Multi-AI provider (Claude/Gemini/OpenAI) |
| [Admin System] DINOCO Moto Manager | V.1.0 | 1157 | `[dinoco_admin_moto]` | Motorcycle brands & models CRUD |
| [Admin System] DINOCO Admin Finance Dashboard | V.3.16 | 1158 | `[dinoco_admin_finance]` | Finance overview (debt, revenue, risk AI) |
| [Admin System] DINOCO Brand Voice Pool | V.2.5 | 1159 | `[dinoco_brand_voice]` | Social listening + brand sentiment analysis |

### 3.3 [AdminSystem-System] -- Infrastructure

| File | Version | DB_ID | Shortcode | Description |
|------|---------|-------|-----------|-------------|
| [AdminSystem-System] GitHub Webhook Sync | V.34.1 | 265 | `[dinoco_sync_dashboard]` | GitHub -> WordPress auto-deploy |

### 3.4 [B2B] -- Distributor System (15 Snippets)

| File | Version | DB_ID | Description |
|------|---------|-------|-------------|
| Snippet 1: Core Utilities & LINE Flex Builders | V.32.0 | 72 | LINE push, Flex templates, HMAC URL, bank helpers |
| Snippet 2: LINE Webhook Gateway & Order Creator | V.31.9 | 51 | Webhook endpoint, order lifecycle, walk-in auto-complete |
| Snippet 3: LIFF E-Catalog REST API | V.38.6 | 52 | REST API (auth, catalog, orders, slip, flash) |
| Snippet 4: LIFF E-Catalog Frontend | V.30.7 | 53 | LIFF SPA for distributors (catalog, cart, history) |
| Snippet 5: Admin Dashboard | V.31.5 | 54 | `[b2b_admin_dashboard]` -- Admin order management + Flash |
| Snippet 6: Admin Discount Mapping | V.30.3 | 55 | `[b2b_discount_mapping]` -- SKU pricing + rank tiers |
| Snippet 7: Cron Jobs - Dunning + Summary + Rank | V.30.3 | 56 | 9 cron jobs (dunning, summary, rank, flash, shipping) |
| Snippet 8: Distributor Ticket View | V.30.3 | 57 | `/b2b-ticket/` -- Order detail page (admin/customer split) |
| Snippet 9: Admin Control Panel | V.31.7 | 58 | `[b2b_admin_control]` -- Distributors, products, settings, Flash |
| Snippet 10: Invoice Image Generator | V.30.3 | 61 | A4 invoice PNG (GD Library) |
| Snippet 11: Customer LIFF Pages | V.30.2 | 64 | `[b2b_commands]`, `[b2b_orders]`, `[b2b_account]` |
| Snippet 12: Admin Dashboard LIFF | V.31.2 | 65 | `[b2b_dashboard]`, `[b2b_stock_manager]`, `[b2b_tracking_entry]` |
| Snippet 13: Debt Transaction Manager | V.2.0 | 1036 | Atomic debt operations (MySQL transactions, FOR UPDATE) |
| Snippet 14: Order State Machine | V.1.4 | 1038 | B2B_Order_FSM class (14 statuses) |
| Snippet 15: Custom Tables & JWT Session | V.2.0 | 1039 | Product catalog table, JWT, DINOCO_MotoDB class |

### 3.5 [B2F] -- Factory Purchasing System (12 Snippets)

| File | Version | DB_ID | Description |
|------|---------|-------|-------------|
| Snippet 0: CPT & ACF Registration | V.3.0 | 1160 | 5 CPTs + ACF fields + helpers + group cache |
| Snippet 1: Core Utilities & Flex Builders | V.5.1 | 1163 | LINE push, 18 Flex templates, LIFF URL (HMAC), i18n ENG/TH |
| Snippet 2: REST API | V.7.3 | 1165 | 20+ endpoints `/b2f/v1/*` + auth-admin JWT |
| Snippet 3: Webhook Handler & Bot Commands | V.2.8 | 1164 | Maker/Admin bot commands (via B2B webhook routing) |
| Snippet 4: Maker LIFF Pages | V.4.0 | 1167 | `[b2f_maker_liff]` -- LANG system (ENG for non-THB) |
| Snippet 5: Admin Dashboard Tabs | V.3.3 | 1166 | `[b2f_admin_orders_tab]`, `[b2f_admin_makers_tab]`, `[b2f_admin_credit_tab]` |
| Snippet 6: Order State Machine | V.1.5 | 1161 | B2F_Order_FSM class (12 statuses) |
| Snippet 7: Credit Transaction Manager | V.1.4 | 1162 | Atomic payable ops (DINOCO owes Maker) |
| Snippet 8: Admin LIFF E-Catalog | V.3.0 | 1168 | LIFF ordering page (auth via JWT, no WP login) |
| Snippet 9: PO Ticket View | V.3.3 | 1169 | PO detail page (status timeline, items, receiving, payment) |
| Snippet 10: PO Image Generator | V.2.4 | 1170 | A4 PO PNG (GD Library), ENG template for CNY/USD |
| Snippet 11: Cron Jobs & Reminders | V.1.6 | 1171 | 7 cron jobs (delivery, overdue, payment, no-response, summary) |

### 3.6 [LIFF AI] -- AI Command Center (2 Snippets)

| File | Version | DB_ID | Description |
|------|---------|-------|-------------|
| Snippet 1: REST API | V.1.1 | 1180 | Auth (LINE ID Token + JWT), Lead/Claim endpoints, Agent proxy |
| Snippet 2: Frontend | V.2.0 | 1181 | `[liff_ai_page]` -- SPA pages (dashboard, leads, claims, agent) |

### 3.7 OpenClaw Mini CRM (Chatbot Agent)

| File | Location | Description |
|------|----------|-------------|
| index.js | `proxy/` | Main Express server (~110K) |
| ai-chat.js | `proxy/modules/` | AI providers + claudeSupervisor |
| dinoco-tools.js | `proxy/modules/` | 8 function-calling tools |
| shared.js | `proxy/modules/` | Prompt templates + config |
| claim-flow.js | `proxy/modules/` | Claim workflow automation |
| lead-pipeline.js | `proxy/modules/` | Lead management (17 statuses) |
| dinoco-cache.js | `proxy/modules/` | Redis/memory cache layer |
| platform-response.js | `proxy/modules/` | Multi-platform response builder |
| auth.js | `proxy/middleware/` | Authentication middleware |

---

## 4. REST API Endpoints -- Complete Map

### 4.1 B2B (`/wp-json/b2b/v1/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/webhook` | LINE Signature | LINE webhook gateway |
| POST | `/auth-group` | Public | Distributor auth + JWT token |
| GET | `/catalog` | JWT | Product catalog + distributor prices |
| POST | `/place-order` | JWT | Create order |
| GET | `/distributor-info` | JWT | Shop info |
| GET | `/order-history` | JWT | Order list (paginated) |
| GET | `/order-detail` | JWT | Single order detail |
| POST | `/confirm-order` | Admin | Confirm stock |
| POST | `/flash-create` | Admin | Create Flash Express shipment |
| POST | `/flash-label` | Admin | Get Flash label |
| POST | `/flash-ready-to-ship` | Admin | Notify courier pickup |
| POST | `/flash-cancel` | Admin | Cancel Flash order |
| POST | `/flash-cancel-notify` | Admin | Cancel + notify |
| POST | `/flash-switch-manual` | Admin | Switch to manual shipping |
| POST | `/daily-summary` | Admin | Trigger daily summary |
| POST | `/update-status` | Admin | Change order status |
| POST | `/delete-ticket` | Admin | Delete order |
| POST | `/recalculate-total` | Admin | Recalculate order total |
| POST | `/create-shipment` | Admin | Manual shipment |
| POST | `/confirm-delivery` | Admin | Confirm delivery |
| POST | `/verify-member` | Admin | Verify LINE member |
| GET | `/discount-mapping` | Admin | Get/update discount data |
| GET | `/invoice-image` | Admin | Generate invoice PNG |
| GET | `/debug-flash/{id}` | Admin | Debug Flash tracking |
| POST | `/slip-upload` | JWT | Upload payment slip |
| POST | `/bo-notify` | Admin | Backorder notification |
| GET | `/invoice-gen` | Admin | Generate invoice link |

### 4.2 B2F (`/wp-json/b2f/v1/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/makers` | Admin | List all makers |
| POST | `/maker` | Admin | Create/update maker |
| POST | `/maker/delete` | Admin | Delete maker |
| POST | `/maker/toggle-bot` | Admin | Toggle maker bot on/off |
| GET | `/maker-products/{id}` | Admin | Maker products list |
| POST | `/maker-product` | Admin | Create/update product |
| POST | `/maker-product/delete` | Admin | Delete product |
| POST | `/create-po` | Admin | Create Purchase Order |
| GET | `/po-detail/{id}` | Admin | PO detail (admin) |
| GET | `/po-detail/jwt` | JWT | PO detail (maker via JWT) |
| POST | `/po-update` | Admin | Update PO |
| POST | `/po-cancel` | Admin | Cancel PO (concurrent lock) |
| POST | `/maker-confirm` | JWT | Maker confirm PO |
| POST | `/maker-reject` | JWT | Maker reject PO |
| POST | `/maker-reschedule` | JWT | Maker request reschedule |
| GET | `/maker-po-list` | JWT | Maker PO list |
| POST | `/maker-deliver` | JWT | Maker report delivery (concurrent lock) |
| POST | `/approve-reschedule` | Admin | Approve reschedule |
| POST | `/receive-goods` | Admin | Record goods received |
| POST | `/record-payment` | Admin | Record payment |
| POST | `/reject-lot` | Admin | Reject lot |
| POST | `/reject-resolve` | Admin | Resolve rejected lot |
| POST | `/po-complete` | Admin | Complete PO |
| GET | `/dashboard-stats` | Admin | Dashboard statistics |
| GET | `/po-history` | Admin | PO history (paginated) |
| POST | `/auth-admin` | HMAC+LINE | Admin LIFF auth -> JWT |
| GET | `/po-image` | Admin | Generate PO image PNG |
| GET | `/settings` | Admin | B2F settings (shipping dest) |

### 4.3 LIFF AI (`/wp-json/liff-ai/v1/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth` | LINE ID Token | Auth -> JWT |
| GET | `/dashboard` | JWT | Admin dashboard stats |
| GET | `/dealer-dashboard` | JWT | Dealer dashboard |
| GET | `/leads` | JWT | Lead list |
| GET | `/lead/{id}` | JWT | Lead detail |
| POST | `/lead/{id}/accept` | JWT | Accept lead |
| POST | `/lead/{id}/note` | JWT | Add lead note |
| POST | `/lead/{id}/status` | JWT | Update lead status |
| GET | `/claims` | JWT | Claim list |
| GET | `/claim/{id}` | JWT | Claim detail |
| POST | `/claim/{id}/status` | JWT | Update claim status |
| POST | `/agent-ask` | JWT | AI agent proxy |

### 4.4 MCP Bridge (`/wp-json/dinoco-mcp/v1/`) -- 32 endpoints

**Core:** product-lookup, dealer-lookup, warranty-check, kb-search, kb-export, catalog-full, distributor-notify, distributor-list, kb-suggest, brand-voice-submit

**Claims:** claim-manual-create, claim-manual-update, claim-manual-status, claim-manual-list, claim-status

**Leads (P1):** lead-create, lead-update, lead-list, lead-get/{id}, lead-followup-schedule

**Phase 2:** warranty-registered, member-motorcycle, member-assets, customer-link, dealer-sla-report, distributor-get/{id}, product-compatibility

**Phase 3:** kb-updated, inventory-changed, moto-catalog, dashboard-inject-metrics, lead-attribution

### 4.5 Manual Invoice (`/wp-json/dinoco-inv/v1/`)

invoice/list, invoice/get, invoice/init, invoice/create, invoice/update, invoice/issue, invoice/record-payment, invoice/verify-slip, invoice/verify-slip-combined, invoice/upload-slip, invoice/cancel, invoice/delete, invoice/send-reminder, invoice/send-overdue-notice, invoice/resend-line, invoice/pending-summary, invoice/send-summary, invoice/distributor-detail

### 4.6 Infrastructure (`/wp-json/dinoco/v1/`)

github-sync (webhook), github-sync-manual, sync-status

---

## 5. Authentication Flows

### 5.1 LINE Login (B2C Members)
1. User clicks "Login with LINE" -> redirect to LINE Login
2. LINE redirects back with `code` -> `[System] LINE Callback` exchanges for access token
3. WordPress user created/linked via `line_user_id` user meta
4. Session = WordPress login cookie

### 5.2 HMAC Signed URLs (B2B LIFF)
1. Server generates LIFF URL with `_sig` (HMAC-SHA256) + `_ts` (timestamp)
2. LIFF page verifies signature on load -> rejects if expired or invalid
3. Functions: `b2b_liff_url()`, `b2f_liff_url()`

### 5.3 JWT Tokens (B2B/B2F/LIFF AI)
1. Client authenticates (LINE ID Token or HMAC sig)
2. Server issues JWT via `DINOCO_JWT::encode()` (B2B Snippet 15)
3. Client sends `X-B2B-Token` / `X-B2F-Token` / `X-LIFF-AI-Token` header
4. Server verifies JWT on each request

### 5.4 WordPress Admin
- `current_user_can('manage_options')` for admin endpoints
- `wp_create_nonce('wp_rest')` for REST API from admin pages

### 5.5 MCP Bridge (Chatbot -> WordPress)
- Shared secret key (`DINOCO_MCP_SECRET`) in Authorization header
- HMAC signature verification

---

## 6. Integration Points

| From | To | Protocol | Purpose |
|------|----|----------|---------|
| LINE Platform | WordPress (B2B Snippet 2) | Webhook POST | Chat messages, postbacks |
| WordPress | LINE Platform | REST API (Push) | Flex messages, notifications |
| WordPress | Flash Express | REST API | Create shipment, labels, tracking |
| WordPress | Slip2Go | REST API | Bank slip verification |
| WordPress | Google Gemini | REST API | AI responses, KB training |
| WordPress | Claude API | REST API | AI Provider Abstraction |
| OpenClaw Agent | WordPress MCP Bridge | REST API | Product lookup, claims, leads |
| OpenClaw Agent | MongoDB Atlas | MongoDB Driver | Chat history, leads, analytics |
| OpenClaw Agent | LINE/Facebook/IG | Webhook | Multi-platform chatbot |
| GitHub | WordPress (Sync Engine) | Webhook POST | Auto-deploy code changes |
| WordPress | GD Library (local) | PHP function | Invoice/PO image generation |

---

## 7. Required Constants (wp-config.php)

### Core
| Constant | Description |
|----------|-------------|
| `DINOCO_LINE_CHANNEL_ID` | LINE OAuth app ID |
| `DINOCO_LINE_REDIRECT_URI` | OAuth callback URL |

### B2B
| Constant | Description |
|----------|-------------|
| `B2B_LINE_ACCESS_TOKEN` | LINE Bot token (shared B2B+B2F) |
| `B2B_ADMIN_GROUP_ID` | Admin LINE group for alerts |
| `B2B_LIFF_ID` | LIFF app ID (shared B2B+B2F) |
| `B2B_SLIP2GO_SECRET_KEY` | Slip2Go API key (shared B2B+B2F) |
| `B2B_BANK_*` | Default bank info (BANK_NAME, BANK_ACCOUNT, BANK_HOLDER, BANK_CODE, etc.) |
| `B2B_WALKIN_BANK_*` | Walk-in bank info override (optional, fallback to B2B_BANK_*) |

### B2F
| Constant | Description |
|----------|-------------|
| `B2F_LIFF_ID` | Auto-fallback to `B2B_LIFF_ID` |
| `B2F_DISABLED` | Kill switch -- set `true` to disable all B2F |

### GitHub Sync
| Constant | Description |
|----------|-------------|
| `DINOCO_GITHUB_TOKEN` | GitHub PAT |
| `DINOCO_GITHUB_REPO` | GitHub repo (owner/repo) |
| `DINOCO_GITHUB_WEBHOOK_SECRET` | Webhook HMAC secret |

### AI
| Constant | Description |
|----------|-------------|
| `DINOCO_AI_PROVIDER` | 'claude' (default) / 'gemini' / 'openai' |
| `DINOCO_CLAUDE_KEY` | Anthropic API key |
| `DINOCO_GEMINI_KEY` | Google Gemini API key |
| `DINOCO_OPENAI_KEY` | OpenAI API key |

### LIFF AI
| Constant | Description |
|----------|-------------|
| `LIFF_AI_SECRET_KEY` | Auth secret |
| `LIFF_AI_JWT_SECRET` | JWT secret (auto-generated) |
| `LIFF_AI_AGENT_URL` | Agent URL (default http://agent:3000) |
| `LIFF_AI_AGENT_KEY` | Agent API key |

### MCP Bridge
| Constant | Description |
|----------|-------------|
| `DINOCO_MCP_SECRET` | Shared secret for chatbot auth |

---

## 8. Kill Switches

| Switch | Scope | Effect |
|--------|-------|--------|
| `define('B2F_DISABLED', true)` | All B2F snippets (0-11) | Disables entire B2F system |
| `define('DISABLE_WP_CRON', true)` | WordPress Cron | Use external cron trigger instead |

---

## 9. Deployment Architecture

### GitHub Webhook Sync (V.34.1)
1. Developer pushes to `main` branch
2. GitHub sends webhook POST to `/wp-json/dinoco/v1/github-sync`
3. Webhook handler verifies HMAC signature
4. For each changed file:
   a. Extract `DB_ID` from file header (first 1000 chars)
   b. Match to `wp_snippets.id` column
   c. If no DB_ID, fallback to normalized filename matching
   d. Compare code hash -- if different, update `wp_snippets.code`
5. Manual sync available via `/wp-json/dinoco/v1/github-sync-manual` or `[dinoco_sync_dashboard]`
6. **Important:** Must bump version number to force sync when hash matches

### File Naming Convention
- `[System] *` -- B2C member features
- `[Admin System] *` -- Admin features
- `[B2B] Snippet N: *` -- B2B distributor modules
- `[B2F] Snippet N: *` -- B2F factory modules
- `[LIFF AI] Snippet N: *` -- AI Command Center
- `[AdminSystem-System] *` -- Infrastructure

### DB_ID Header Format
```php
/**
 * ...
 * DB_ID: 1160
 * ...
 */
```

---

## 10. Cross-Module Dependencies

### B2B Load Order (Critical)
1. Snippet 15 (Custom Tables + JWT) -- DINOCO_JWT class
2. Snippet 14 (FSM) -- B2B_Order_FSM class
3. Snippet 13 (Debt Manager) -- b2b_debt_add/subtract
4. Snippet 1 (Core Utilities) -- LINE push, Flex builders, helpers
5. Snippet 2 (Webhook) -- relies on all above
6. Snippet 3 (REST API) -- relies on 1, 13, 14, 15
7. Snippet 5 (Dashboard) -- relies on 1, 13, 14
8. Snippet 7 (Cron) -- relies on 1

### B2F Load Order (Critical)
1. B2F Snippet 0 (CPT + ACF) -- must load first (priority: 5)
2. B2F Snippet 6 (FSM) -- B2F_Order_FSM class
3. B2F Snippet 7 (Credit Manager) -- b2f_payable_add/subtract
4. B2F Snippet 1 (Core Utilities) -- depends on Snippet 0 + B2B Snippet 15 (JWT)
5. B2F Snippet 2 (REST API) -- depends on 0, 1, 6, 7
6. B2F Snippet 3 (Webhook) -- called from B2B Snippet 2 via function_exists()
7. B2F Snippet 5 (Dashboard) -- depends on 0, 2, 6, 7

### Shared Resources
- `B2B_LINE_ACCESS_TOKEN` -- used by both B2B and B2F for LINE push
- `B2B_LIFF_ID` -- shared LIFF app (routing by group_id)
- `B2B_SLIP2GO_SECRET_KEY` -- shared slip verification
- `DINOCO_JWT` class -- shared JWT implementation
- `b2b_log()` function -- shared logging
