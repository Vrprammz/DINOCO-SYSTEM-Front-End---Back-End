# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DINOCO System is a **WordPress-based motorcycle warranty management platform** serving B2C members and B2B distributors. All code is PHP executed within WordPress — there is no separate build step, no Node.js, and no modern JS framework.

## Architecture

- **Backend**: WordPress + Advanced Custom Fields (ACF). Data is stored in Custom Post Types (claims, registrations, B2B orders) and user metadata.
- **Frontend**: Vanilla HTML/CSS/JavaScript embedded inline in PHP files. UI is exposed via WordPress shortcodes.
- **Authentication**: LINE Login (OAuth2) creates/links WordPress users. Admin access uses `current_user_can('manage_options')`.
- **AI Module (WordPress)**: Google Gemini API with function calling (v22.0). The AI retrieves real data via PHP functions rather than generating answers from training data. Temperature 0.35.
- **AI Module (Chatbot)**: OpenClaw Mini CRM — Gemini 2.5 Flash (primary) + Claude Haiku 4.5 (fallback) + Claude Sonnet 4 (supervisor). ไม่มี message cap (context ใช้ 6-10 messages ล่าสุด). Temperature 0.3 (tools), 0.2 (Claude), 0.4 (claim questions).
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

### Secondary shortcodes (admin / member / LIFF sub-pages)

| Shortcode | Purpose |
|---|---|
| `[dinoco_admin_inventory]` | Global Inventory DB admin (stock, catalog, dip stock, warehouses, valuation, forecast) |
| `[dinoco_admin_claims]` | Service Center & Claims admin |
| `[dinoco_admin_users]` | User management |
| `[dinoco_admin_transfer]` | Manual Transfer Tool (warranty transfer) |
| `[dinoco_admin_legacy]` | Legacy migration requests admin |
| `[dinoco_manual_invoice]` | Manual invoice system admin |
| `[dinoco_sync_dashboard]` | GitHub Webhook Sync dashboard |
| `[b2b_admin_control]` | B2B Admin Control Panel (Snippet 9 — print settings, bot, sys-check) |
| `[b2b_discount_mapping]` | B2B discount tier mapping (read-only reference) |
| `[b2b_dashboard]` / `[b2b_stock_manager]` / `[b2b_tracking_entry]` | B2B Admin Dashboard LIFF sub-pages (Snippet 12) |
| `[b2b_commands]` / `[b2b_orders]` / `[b2b_account]` | Customer LIFF pages (Snippet 11) |
| `[dinoco_dashboard]` | Member dashboard (main) |
| `[dinoco_dashboard_header]` / `[dinoco_dashboard_assets]` | Member dashboard sub-components |
| `[dinoco_edit_profile]` | Member profile edit |
| `[dinoco_claim_page]` | Member claim submission |
| `[dinoco_transfer_sys]` / `[dinoco_transfer_v3]` | Member warranty transfer page |
| `[dinoco_legacy_migration]` | Member legacy migration form |

## REST API Endpoints (B2B)

### Core B2B (Snippet 3 + 5)
Under `/wp-json/b2b/v1/`: `confirm-order`, `flash-create`, `daily-summary`, `update-status`, `delete-ticket`, `recalculate-total`, `flash-label`, `flash-ready-to-ship`, `manual-flash-create`, `manual-shipments`, `manual-flash-cancel`, `manual-flash-label`, `manual-flash-status`, `manual-flash-test`, `manual-reprint`, `cancel-request`.

### Print / RPi (Snippet 3 + 9)
`print-monitor`, `print-queue`, `print-ack`, `print-status`, `print-requeue`, `print-heartbeat`, `print-test`, `rpi-command`, `rpi-command-ack`, `rpi-dashboard`, `rpi-accept-order`, `ticket-lookup`, `pno-lookup`, `rpi-flash-ready`, `rpi-flash-box-packed`, `rpi-distributors`.

### Flash logistics (Snippet 3 + 9)
`flash-webhook`, `flash-webhook-setup`, `flash-api-test`, `flash-tracking`, `flash-dashboard-stats`, `flash-ship-packed`, `manual-flash-ready`, `flash-test/orders`, `flash-test/run-step`, `flash-test/simulate-webhook`.

### Admin back-office (Snippet 3 + 6 + 9)
`admin-bo-tickets`, `admin-stock-list`, `admin-stock-unlock`, `admin-stock-mark-oos`, `admin-shipping-queue`, `admin-submit-tracking`, `discount-mapping`, `combined-slip-upload`, `combined-invoice-gen`, `import-distributors`, `test-push`, `system-check`, `distributor/delete`, `distributor/toggle-bot`.

## REST API Endpoints (B2F)

All under `/wp-json/b2f/v1/`: `makers`, `maker`, `maker-products`, `maker-product`, `create-po`, `po-detail`, `po-update`, `po-cancel`, `maker-confirm`, `maker-reject`, `maker-reschedule`, `maker-po-list`, `maker-deliver`, `approve-reschedule`, `receive-goods`, `record-payment`, `reject-lot`, `reject-resolve`, `po-complete`, `dashboard-stats`, `po-history`.

## REST API Endpoints (LIFF AI)

All under `/wp-json/liff-ai/v1/`: `auth`, `dashboard`, `dealer-dashboard`, `leads`, `lead/{id}`, `lead/{id}/accept`, `lead/{id}/note`, `lead/{id}/status`, `claims`, `claim/{id}`, `claim/{id}/status`, `agent-ask`.

## REST API Endpoints (Inventory — `dinoco-stock/v1`)

Registered in `[Admin System] DINOCO Global Inventory Database`:

- **God Mode / Margin**: `god-mode/verify`, `margin-analysis` (JWT-gated, V.42.17)
- **Stock**: `stock/list`, `stock/adjust`, `stock/transactions`, `stock/settings`, `stock/hold`, `stock/initialize`, `stock/transfer`
- **Dip Stock** (V.39.0): `dip-stock/start`, `dip-stock/current`, `dip-stock/count`, `dip-stock/approve`, `dip-stock/force-close`, `dip-stock/history`
- **Warehouses** (V.5.0): `warehouses`, `warehouse`
- **Analytics** (V.5.0): `valuation`, `forecast`
- **Products**: `product/pricing` (dual-write), `product/upload-image`, `image-proxy` (CORS)
- **Moto catalog**: `moto/brands`, `moto/models`

## REST API Endpoints (GitHub Sync — `dinoco/v1`)

- `sync-status` — sync engine status (registered in `[AdminSystem-System] GitHub Webhook Sync`)

## REST API Endpoints (MCP Bridge)

All under `/wp-json/dinoco-mcp/v1/` (32 endpoints, V.2.0):
- **Core**: `product-lookup` (+stock_status), `dealer-lookup`, `warranty-check`, `kb-search`, `kb-export`, `catalog-full`, `distributor-notify`, `distributor-list`, `kb-suggest`, `brand-voice-submit`
- **Claims**: `claim-manual-create`, `claim-manual-update`, `claim-manual-status`, `claim-manual-list`, `claim-status`
- **Leads (P1)**: `lead-create`, `lead-update`, `lead-list`, `lead-get/{id}`, `lead-followup-schedule`
- **Phase 2**: `warranty-registered`, `member-motorcycle`, `member-assets`, `customer-link`, `dealer-sla-report`, `distributor-get/{id}`, `product-compatibility`
- **Phase 3**: `kb-updated`, `inventory-changed`, `moto-catalog`, `dashboard-inject-metrics`, `lead-attribution`

## Required WordPress Constants

- `DINOCO_LINE_CHANNEL_ID` — LINE OAuth app ID
- `DINOCO_LINE_CHANNEL_SECRET` — LINE OAuth channel secret (required for ID Token verify)
- `DINOCO_LINE_REDIRECT_URI` — OAuth callback URL
- `B2B_LINE_ACCESS_TOKEN` — Bot token for LINE notifications
- `B2B_ADMIN_GROUP_ID` — Admin LINE group for alerts
- `DINOCO_GITHUB_TOKEN` — GitHub PAT for sync engine
- `DINOCO_GITHUB_REPO` — GitHub repo (e.g., `Vrprammz/DINOCO-SYSTEM-Front-End---Back-End`)
- `DINOCO_GITHUB_WEBHOOK_SECRET` — Webhook signature secret
- `B2F_LIFF_ID` — ใช้ตัวเดียวกับ `B2B_LIFF_ID` (auto-fallback ไม่ต้องตั้งแยก)
- `LIFF_AI_SECRET_KEY` — LIFF AI auth HMAC key (required)
- `LIFF_AI_JWT_SECRET` — LIFF AI JWT signing key (auto-generated to wp_option if undefined)
- `LIFF_AI_AGENT_URL` — OpenClaw agent proxy URL (default `http://agent:3000`)
- `LIFF_AI_AGENT_KEY` — agent proxy bearer token
- `DINOCO_JWT` — HMAC secret for God Mode margin-analysis JWT (V.42.17)
- `B2F_DISABLED` — kill switch for B2F module (optional boolean)
- `B2B_WALKIN_BANK_*` — optional walk-in bank override (BANK_NAME, BANK_NAME_EN, BANK_ACCOUNT, BANK_HOLDER, BANK_CODE, BANK_LOGO_URL, PROMPTPAY_ID) — falls back to `B2B_BANK_*` if undefined

## File Organization

Files are named by feature area with bracket prefixes:
- `[System] *` — Member-facing features (dashboard, registration, claims, profile)
- `[Admin System] *` — Admin/management features (analytics, CRM, AI, knowledge base)
- `[B2B] Snippet N: *` — B2B distributor modules (versioned snippets)
- `[B2F] Snippet N: *` — B2F factory purchasing modules (Snippets 0-11)
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
- **Inventory System** (V.6.0): `dinoco_stock_add/subtract()` ใน Snippet 15 — atomic `FOR UPDATE` lock per SKU + warehouse sync. ตัดสต็อกตอน `awaiting_confirm` (ไม่ใช่ shipped) ผ่าน hook `b2b_order_status_changed` priority 5. Auto-cancel 30 นาทีถ้าตัวแทนไม่ confirm (`dinoco_inv_auto_cancel` cron + lazy check). `dinoco_stock_auto_status()` compute `stock_display` = in_stock/low_stock/out_of_stock (low_stock เป็น computed ไม่เก็บ DB) + **cascade update ancestor ทุกระดับ** (grandchild→child→parent). Flag `dinoco_inv_initialized` ต้อง true ก่อน auto_status ทำงาน (Admin ทำ Dip Stock ครั้งแรก). **3-Level SKU Hierarchy** (V.6.0): รองรับแม่→ลูก→ชิ้นส่วนย่อย (max depth 3). ตัดสต็อกเฉพาะ leaf nodes เท่านั้น (DD-2). Parent stock = MIN(children computed stock) recursive. B2F receive → `dinoco_stock_add()`. Cancel → `dinoco_stock_add()` คืน leaf.
- **3-Level SKU Hierarchy** (V.6.0 — Snippet 15 PART 1.35): เก็บใน `wp_options` key `dinoco_sku_relations` flat format `{ parent: [children], child: [grandchildren] }`. 7 Helper functions: `dinoco_get_leaf_skus($sku)` resolve leaf nodes, `dinoco_is_leaf_sku($sku)` check leaf, `dinoco_get_ancestor_skus($sku)` หา parent ทุกระดับ, `dinoco_compute_hierarchy_stock($sku)` recursive MIN, `dinoco_is_top_level_set($sku)` filter B2C, `dinoco_validate_sku_hierarchy($parent,$child)` circular ref guard, `dinoco_get_sku_tree($sku)` tree structure. กฎเหล็ก: ตัดสต็อกเฉพาะ leaf (DD-2), shared child = allow (DD-3), max depth 3 (DD-4), walk-in ติดลบได้ (DD-5), B2C ไม่เห็นชิ้นส่วนย่อย (DD-6), B2F auto-expand leaf ใน PO (DD-7). UI ห้ามใช้คำว่า "หลาน" → ใช้ "ชิ้นส่วนย่อย" หรือ "ซื้อแยกชิ้น".
- **Hierarchy Bug Fixes** (V.7.1 — Snippet 15, 2026-04-10): แก้ 3 CRITICAL + 2 HIGH bugs ในระบบ SKU hierarchy:
  - **C1/C2 — Shared child (DD-3) แตก**: `dinoco_get_leaf_skus`, `dinoco_compute_hierarchy_stock`, `dinoco_get_sku_tree` เคยส่ง `&$visited` เป็น reference → sibling branches share visited → รอบสองเจอ `in_array` → return 0/empty → stock SET เพี้ยนเป็น 0 + ตัด/คืนสต็อกไม่ครบ. **แก้**: เปลี่ยนเป็น value-copy ต่อ branch + `array_unique()` dedup ใน `get_leaf_skus` (ป้องกัน double-subtract)
  - **C3 — Walk-in stock ติดลบไม่ได้ (DD-5)**: `dinoco_stock_subtract` ใช้ `max(0, ...)` cap เสมอ → ขัด DD-5. **แก้**: เพิ่ม param `$allow_negative` (default false). Snippet 2 V.34.2 detect `_b2b_is_walkin` → ส่ง `allow_neg=true` ตอน awaiting_confirm subtract. warehouse_stock ก็ honor flag เดียวกัน
  - **H1 — Auto-Split parent stock หาย**: ถ้า parent เคยมี `stock_qty > 0` ก่อนกลายเป็น non-leaf → `compute_hierarchy_stock` ไม่อ่าน parent.stock_qty → stock หาย. **แก้**: `save_sku_relation` (Admin Inventory V.42.4) เช็ค parent becoming_parent + stock>0 → ต้องส่ง POST flag `confirm_stock_migrate=1` ถึงจะดำเนินการ. ถ้า confirm → โอน parent stock → leaf แรก + zero parent + audit trail (`hierarchy_migrate_out/in` ใน `dinoco_stock_transactions`). ถ้าไม่ confirm → return `success:false code:parent_has_stock`
  - **H2 — Leaf guard defensive**: `dinoco_stock_add/subtract` เพิ่ม DD-2 guard ต้น function. ถ้า `!dinoco_is_leaf_sku($sku)` → log CRITICAL + return `WP_Error('not_leaf')`. caller ทุกตัวต้อง expand leaf ก่อน (Snippet 2/5 + B2F Snippet 2 ทำถูกแล้ว)
  - **Admin UI (V.42.5-42.8)**: Auto-Split JS ส่ง `confirm_stock_migrate=1` auto (V.42.5) → Manual Edit Product modal ก็ส่งเหมือนกัน + inspect `relationResponse.success === false` แก้ silent fail (V.42.6) → Auto-Split resume from orphan detect (V.42.7) → Price Split Mode 4 แบบ (equal/percent/quantity/manual) + allow single type + debug console log (V.42.8)
- **Hierarchy Tag System V.42.9-42.14** (Admin Inventory, 2026-04-10): Product Catalog UI overhaul — 4 badge types + hybrid classification + image skeleton:
  - **V.42.9 CRITICAL**: `saveCatalogItem` เดิม `skipRelations = (ptype === 'child' || 'grandchild')` → admin เพิ่ม grandchild ใต้ child บันทึกไม่ได้ (blocker ตั้งแต่ V.40.5). แก้: skip เฉพาะ grandchild + ไม่มี children และไม่เคยมี
  - **V.42.10 CORS**: `POST /dinoco-stock/v1/image-proxy` server-side fetch + base64 → แก้ canvas tainted error เวลา `generateLabeledImage` โหลดรูปจาก external CDN (admin panel `akesa.ch` ↔ ​รูป `dinoco.in.th` = cross-origin). Fallback chain: direct `crossOrigin=anonymous` → direct ไม่ใช้ CORS → WP proxy data URL. Security: https only, 10MB limit, image/* check, admin only
  - **V.42.11 N-part Auto-Split**: Modal refactor จาก hardcoded 2 cols → dynamic 2-6 parts. Parts count chips (2/3/4/5/6) + pattern chips filter ตาม count (2-part: L/R, U/D, F/B, FR/RR — 3-part: L/R/U, L/R/T, F/L/R — 4-part: L/R/U/D, F/B/L/R — custom). `renderSplitColumns(n)` + `updateCustomSuffixInputs(n)` + `renderPriceModeInputs(n)` + `filterPatternChipsByCount(n)`. `executeAutoSplitV2` parallel save N SKUs ผ่าน `$.when.apply($, deferreds)`, `save_sku_relation` ส่ง `child_skus` = N items
  - **V.42.12 Badge Redesign + Case-Insensitive + Skeleton**:
    - **Badge 4 ประเภท**: purple "ชุดหลัก" (set) + blue "ชิ้นส่วน" (child) + green "ชิ้นส่วนย่อย" (grandchild) + gray "เดี่ยว" optional. ใช้ contrast AAA (>7:1) ทั้ง 4 แบบ. Icon Font Awesome: sitemap/puzzle-piece/gear/cube
    - **Breadcrumb**: child → "← {parent_name}" คลิกไปที่แม่ (reuse `searchCatalogItem`). grandchild → "← {gp_name} › {parent_name}" 2 ชั้นคลิกได้ทั้งคู่
    - **Counts**: set subtitle "N ชิ้นส่วน · M ชิ้นย่อย" (รวมหลานใต้ลูก). child subtitle "+N ชิ้นย่อย" ถ้าเป็น sub-SET. Shared child DD-3 → "+N ชุด" indicator
    - **Filter chips ใหม่**: ลำดับ `ทั้งหมด → สินค้าเดี่ยว → ชุดหลัก → └─ ชิ้นส่วน → └─ ชิ้นส่วนย่อย` (indent 18px + prefix `└─` visual hierarchy)
    - **Image Skeleton Loader**: `.cedit-thumb-wrap` + skeleton shimmer animation (1.2s) — `<img loading="lazy">` onload ซ่อน skeleton. แก้บัครูปแฟลช N/A ก่อนค่อยมา
    - **Case-Insensitive Lookup**: helper `cat(sku)` + uppercase cache → แก้บัค SKU case mismatch (relations keyed uppercase แต่ catalogData บางตัว mixed case) → `catalogData[child]` miss → N/A random. Invalidate cache ทุกครั้ง reload
    - `computeProductTypes` V.42.12 enriched: `direct_children_count`, `grandchildren_total` สำหรับ set + `grandchildren_count`, `parent_count` สำหรับ child/grandchild + `childToParents` เก็บเป็น array (support DD-3)
  - **V.42.13 Leaf-based Classification**: เปลี่ยนจาก depth-based → leaf-based
    - เดิม: `if (myParent && childToParent[myParent]) → 'grandchild'` (depth 3 เท่านั้น)
    - ใหม่: `if (myParent && isLeaf) → 'grandchild'` (leaf ใต้ parent เสมอ = แยกขายเป็นอะไหล่ได้)
    - **Case fix**: `SET → [L, R]` ตรงๆ (2 ชั้น) → L/R เดิม `child` ผิด → ใหม่ `grandchild` ถูก
    - **Breadcrumb 2 กรณี**: 3 ชั้น (`← gp › parent`) หรือ 2 ชั้น (`← parent` เดียว — เพิ่ม null check)
    - ไม่กระทบ DD-2 stock cut (backend `dinoco_get_leaf_skus()` leaf-aware อยู่แล้ว)
  - **V.42.14 Hybrid Override**: เพิ่ม `ui_role_override` column ใน `wp_dinoco_products` + auto-migration. Admin เลือก UI role เองใน Edit Product modal (radio chips: อัตโนมัติ/ชุดหลัก/ชิ้นส่วน/ชิ้นส่วนย่อย/เดี่ยว). Logic: ถ้า override ≠ 'auto' และ ≠ autoType → ใช้ override + `is_override=true` + badge มี icon ✋ indicator. `computeProductTypes` เก็บ `auto_type` ไว้เสมอเพื่อแสดง hint "อัตโนมัติ: {label}". Save handler whitelist 5 values + defensive ALTER TABLE ตอน save. **สำคัญ**: override เป็น UI layer เท่านั้น ไม่กระทบ backend logic (stock cut / orders / DD-2)
  - **V.42.15 Price Suggestion (Phase 2, superseded)**: `renderCatChildren` แสดง suggestion badge ข้าง child/grandchild — **deprecated ใน V.42.16** เพราะ equal-split /N เป็น math ที่ไม่สื่อ business reality สำหรับ SET ผสม (เช่น TopCase + Top Rack + Pannier Rack) ที่ราคาแต่ละตัวไม่เท่ากันอยู่แล้ว
  - **V.42.17 Margin Analysis (God Mode)**: Backend-enforced cost visibility — JWT gate (30 min, HMAC via `DINOCO_JWT`) + rate limit 30 req/min/user + cap `manage_options`. REST: `POST /dinoco-stock/v1/god-mode/verify` (PIN → JWT) + `GET /dinoco-stock/v1/margin-analysis?sku=X` (header `X-Dinoco-God: <token>` required). Backend: `dinoco_get_wac_for_skus($skus)` batch helper ใน Snippet 15 V.7.2 — 1 SQL query เดียว + per-SKU transient cache 1 ชม + invalidation hook `b2f_receive_completed`. Uses `dinoco_get_leaf_skus()` + `array_unique` (DD-3 shared child safe) + `b2b_compute_dealer_price()` (tier=0 fallback respected). Frontend: `fetchMarginAnalysis(sku)` ตอน `openEditCatalogModal` ถ้า god mode → prefetch `window._marginContext = { total_cost, retail, ... }` → `updateTierPreview` extend ด้วย profit line (`+Y฿ (+Z%)` สีเขียว/แดง) client-side math ไม่เรียก API ซ้ำ + header banner แสดงต้นทุน WAC + warning ถ้า incomplete (`is_incomplete=true` + `missing_wac_leaves[]`). God mode client-side class ยังใช้อยู่สำหรับ UI gate (ปุ่ม delete/edit) แต่ cost data ถูก enforce ที่ backend — DevTools manipulation เข้าไม่ถึง
  - **V.42.16 Sum Integrity Check (Phase 2 Redesign)**: เปลี่ยน concept จาก "แนะนำราคา" → "ตรวจความครบของราคา SET":
    - **Header card**: parent / sum(children effective) / margin พร้อม status
      * `ok` (|diff| < 1%) — เขียว "ราคาสมดุล"
      * `loss` (sum > parent) — แดง "แม่ถูกกว่าผลรวมลูก" (ขายแม่แล้วขาดทุน)
      * `profit` (sum < parent) — ฟ้า "แม่แพงกว่าผลรวมลูก" (มาร์จิ้นบวก)
    - **Effective cost**: ถ้า child เป็น sub-SET ใช้ `sum(grandchildren prices)` แทน child.price (ราคาจริง ไม่ใช่ sub-SET stale)
    - **Per-child badge**: `ราคาจริง X฿ · Y% ของแม่` (contribution % ไม่ใช่ suggestion)
    - **Sub-SET integrity**: ถ้า child มี grandchildren → เทียบ `sum(gc)` กับ `child.price` → แสดง warning ถ้าต่าง `|diff| >= 1%` (e.g. "ลูกรวมเกิน +2,250฿ (+41%)")
    - **Per-grandchild badge**: `ราคาจริง · Y% ของ sub-SET/แม่` (contribution %)
    - Helper `_priceOf(sku)` — case-insensitive price lookup ผ่าน `cat()`
    - Live update เหมือน V.42.15 (debounced 250ms)
    - Removed: equal-split "แนะนำ X฿" + diff% badges (concept ผิด)
- **Multi-Warehouse** (V.5.0 — Phase 5): Tables: `dinoco_warehouses` (id, name, code, address, is_default) + `dinoco_warehouse_stock` (warehouse_id, sku, stock_qty) ใน Snippet 15. Migration: auto-create "โกดังหลัก" (code=MAIN, is_default=1) + copy stock. Functions: `dinoco_get_default_warehouse_id()`, `dinoco_get_total_stock($sku)`, `dinoco_get_warehouse_stock($sku, $wh)`, `dinoco_transfer_stock($sku, $from, $to, $qty)`, `dinoco_get_warehouses()`. `dinoco_stock_add/subtract()` รับ `$warehouse_id` (default=primary). REST: `/warehouses`, `/warehouse` (CRUD), `/stock/transfer`, `/stock/list?warehouse_id=`, `/stock/adjust` (+warehouse_id). UI: tab "คลังสินค้า" + Transfer modal. Backward compat: ถ้ามี 1 warehouse ทำงานเหมือนเดิม.
- **Inventory Valuation** (V.5.0 — Phase 5): `unit_cost_thb` column ใน `dinoco_stock_transactions` — เก็บตอน B2F receive (unit_price * exchange_rate). `dinoco_get_inventory_valuation()` คำนวณ WAC (Weighted Average Cost) per SKU. REST: `/valuation`. Admin UI: "มูลค่าสินค้าคงเหลือ" card + table + CSV export. THB เสมอ.
- **Stock Forecasting** (V.5.0 — Phase 5): `dinoco_get_stock_forecast($sku, $days)` คำนวณ avg_daily_usage, days_of_stock, reorder_in_days, suggested_order_qty จาก outbound transactions (b2b_reserved, b2b_shipped, manual_subtract). `dinoco_get_stock_forecast_all()` sort by days_of_stock ASC. REST: `/forecast`. Admin UI: "สินค้าที่จะหมดเร็ว" table. Guard: ต้องมี data >= 30 วัน.
- **Dip Stock** (V.39.0 — Phase 3): ระบบนับสต็อกจริง. Tables: `dinoco_dip_stock` (sessions) + `dinoco_dip_stock_items` (per SKU per session) ใน Snippet 15. REST API ใน `[Admin System] DINOCO Global Inventory Database` namespace `dinoco-stock/v1`: `/dip-stock/start`, `/current`, `/count`, `/approve`, `/force-close`, `/history`. UI: tab "นับสต็อก" ใน Inventory shortcode — 3 states (no session, counting form, variance report). JS: `DipStockManager` object. Crons ใน Snippet 15: `dinoco_dip_stock_reminder_cron` (daily, 30-day interval configurable) + `dinoco_dip_stock_expire_cron` (twicedaily, auto-expire sessions >48h). Export CSV: Dip Stock report + Stock Management list. ใช้ได้ทั้ง Initial Import (expected=0) + นับรายเดือน. **V.39.0: snapshot เฉพาะ leaf nodes** ใช้ `dinoco_is_leaf_sku()` filter — ไม่นับ SET + sub-SET. **V.42.22: Dip Stock classification เปลี่ยนจาก depth-based เป็น leaf-based** ตรงกับ stock/list V.42.21 + JS computeProductTypes V.42.13. ใช้ pre-built maps (O(1) lookup) แทน nested O(n^2) loops.
- **Product Data Consolidation** (V.35.0): ราคา tier/ส่วนลด/category/MOQ/boxes_per_unit ย้ายมาจัดการที่ Product Catalog (Inventory DB) เพียงที่เดียว. REST: `POST /dinoco-stock/v1/product/pricing` (dual-write: `dinoco_products` custom table + `b2b_product` ACF postmeta + `delete_transient('b2b_sku_data_map')`). Snippet 6 (Discount Mapping) เปลี่ยนเป็น read-only reference table + banner link ไป Product Catalog. Snippet 9 (Admin Control Panel) ลบ Products tab + REST endpoints (`/products`, `/product`, `/product/delete`, `/import-products`) — functions kept as dead code.
- **setTimeout gotcha**: Admin Dashboard overrides `window.setTimeout` to capture timers >= 3s for auto-refresh control. Toast/notification auto-dismiss must use `(window._dncAutoRefresh && window._dncAutoRefresh.origSetTimeout) || setTimeout` to bypass the override.
- **Modal pattern**: Modals use event delegation for dynamically created elements. Backdrop click-to-close is a common interaction pattern.
- **View/Edit toggle pattern**: Profile page uses Facebook-style view-mode cards. Info is read-only by default; tap "แก้ไข" to expand the form. Save button only appears when a section is in edit mode.
- **Product Data Source of Truth** (V.32.6): Custom table `wp_dinoco_products` (Snippet 15) is the single source of truth for ALL product fields: pricing (base_price = retail, price_silver/gold/platinum/diamond = **% discount** per tier), stock_status, oos_timestamp, oos_duration_hours, oos_eta_date, b2b_discount_percent (Standard tier default), boxes_per_unit, units_per_box, min_order_qty, category, compatible_models, b2b_visible. Central helper `b2b_get_product_data($sku)` (Snippet 1) reads from custom table with ACF fallback. Batch helper `b2b_get_product_data_batch()` returns all products in 1 query. All WRITE operations must dual-write: custom table + ACF (for backward compat). All READ operations should use custom table helpers first, fallback ACF. `b2b_get_sku_data_map()` (Snippet 3) now batch-reads from custom table including pricing tiers.
- **Box Calculation** (V.32.9): `boxes_per_unit` = สินค้า 1 ชิ้นใช้กี่กล่อง (ของใหญ่, default 1). `units_per_box` = 1 กล่องใส่สินค้าได้กี่ชิ้น (ของเล็กแพ็ครวม, default 1). Mutual exclusive: ห้ามตั้งทั้งคู่ > 1. สูตร: `units_per_box > 1 → ceil(qty / upb)`, `boxes_per_unit > 1 → qty * bpu`, ทั้งคู่ = 1 → qty. Helpers: `b2b_get_units_per_box()`, `b2b_compute_boxes_for_qty()` (Snippet 1). ใช้ใน `b2b_calculate_total_boxes()` + `b2b_calculate_box_manifest()` สำหรับ Flash shipping PNO count.
- **Tier Pricing System** (V.32.6): Columns `price_silver`, `price_gold`, `price_platinum`, `price_diamond` store **% discount** (0-100) ไม่ใช่ราคาเลข. `b2b_discount_percent` = default discount สำหรับ Standard rank. Dealer price = `base_price * (1 - tier_discount% / 100)`. ถ้า tier = 0 → fallback ไป `b2b_discount_percent`. Helper: `b2b_compute_dealer_price($base_price, $rank, $sku_data)` (Snippet 1) ใช้ทุกจุด (GET /catalog, POST /place-order, Invoice, Flex cards). Migration: `DINOCO_Catalog::migrate_tier_to_percent()` auto-convert ค่าเก่า (value > 100 → คำนวณ % จาก base_price). Flag: `_dinoco_tier_pricing_migrated`.
- **Motorcycle Catalog**: Brands/models/images/aliases stored in custom MySQL tables (`dinoco_moto_brands` + `dinoco_moto_models`) via `DINOCO_MotoDB` class in Snippet 15. Admin UI via `[dinoco_admin_moto]`. Consumer files use `dinoco_get_brands_list()`, `dinoco_get_model_image()`, `dinoco_get_moto_catalog_json()` with `class_exists` fallback.
- **Negative margin gotcha**: Elements with negative margin (e.g. cover photo `margin: -20px -20px 0`) cause horizontal scroll. Always add `overflow-x: hidden` on the parent wrapper.
- **B2F System**: Business to Factory — DINOCO สั่งซื้อสินค้าจากโรงงานผู้ผลิต (Maker). ใช้ LINE Bot เดียวกับ B2B + LIFF ID เดียวกัน. Kill switch: `define('B2F_DISABLED', true)`.
- **B2F Architecture**: Bot เดียว routing ตาม `group_id` — Distributor→B2B Flex, Maker→B2F Flex, Admin→ทั้งหมด (carousel 3 หน้า). B2F routing อยู่ใน B2B Snippet 2 (function_exists guard). B2F functions อยู่ใน Snippet 3.
- **B2F Hierarchy Support** (Phase 1+2 Complete): ระบบ B2F รองรับ 3-Level SKU Hierarchy (แม่-ลูก-หลาน) ครบทุก UI. **Phase 1 (Data+Flex)**: `create-po` DD-7 auto-expand SET → leaf items พร้อม track `poi_parent_sku` + `poi_parent_name` snapshot ใน po_items repeater (Snippet 0 V.3.2). API `po-detail` return `parent_sku`/`parent_name` per item + `maker-products` enrich `is_set`/`product_type`/`children_count` (Snippet 2 V.9.5). `b2f_group_items_by_set()` helper ใน Snippet 1 V.6.2 — Flex cards 4 ตัว updated แสดง SET header สีม่วง 🟣. **Phase 2 (All UI)**: E-Catalog badges ม่วง/น้ำเงิน/เขียว (Snippet 8 V.4.1). Maker LIFF confirm/detail/delivery grouped (Snippet 4 V.4.2). PO Ticket View items grouped (Snippet 9 V.3.4). PO Image A4 SET header rows สีม่วง+subtotal (Snippet 10 V.2.6). PO เก่า backward compat: empty parent_sku = flat list เดิม. DD-3 shared child: เก็บ parent_sku ตัวแรก.
  - Snippet 2 V.9.9: `b2f_format_maker_product()` reuse stock/list classification + `auto_type` สำหรับ grouping + `ui_role_override` sync ทุก field (single override clear hierarchy). Return `compatible_models`, `category`, `moto_catalog`, `hierarchy_meta` (missing leaves + details), `top_parent_sku`/`top_parent_name`/`parent_name`/`grandparent_sku`/`parent_skus` (array, DD-3). `b2f_build_hierarchy_context()` pre-compute maps once, `b2f_compute_hierarchy_meta()` missing leaf detection + catalog name/img lookup. **V.9.9**: ส่ง `sku_relations` (rel_upper forward lookup map) ใน maker-products response สำหรับ frontend forward-lookup grouping.
  - Snippet 5 V.4.8: Admin Dashboard Makers tab — Accordion tree view (Stock Mgmt pattern): SET header สีม่วง ▼/▶ expand + children น้ำเงิน indent 28px + grandchildren อำพัน indent 52px. Smart product picker: hide SET + hide leaf ที่ ancestor อยู่แล้ว + hierarchy badges + per_page 500. Missing children warning + `addMissingLeaves()` quick-add. Currency-aware columns (THB ซ่อนค่าส่ง). Interleave child+grandchild order. **V.4.8**: JS-side `computeProductTypes` — derive product types from `sku_relations` only (no PHP `auto_type`/`product_type` dependency). Product picker also re-derives types from `sku_relations` in stock/list response.
  - Snippet 8 V.4.4: LIFF B2F E-Catalog redesign — SET Detail View (full-page overlay กดดูชุด+สั่งชุดเต็ม/เดี่ยว+grandchild "ซื้อแยกชิ้น"+missing leaves warning). Model filter row (horizontal scroll motorcycle cards จาก moto_catalog). Type filter chips: ชุด(แม่)/แยกชุด(ลูก)/แยกข้าง(หลาน). Cart hierarchy grouping + DD-7 leaf preview + duplicate detection. history.pushState back button. **V.4.4**: JS-side type derivation from `sku_relations` — same as Product Catalog `computeProductTypes()` (leaf-based, DD-3 safe).
- **B2F DD-3 Shared Child** (Phase 0-4 Complete, 2026-04-13): shared child/leaf ที่อยู่ใน 2+ SET (เช่น `DNCGNDPRO5500` เป็น leaf ของทั้ง `DNCSETXL7500X001H` + `DNCSETNX500E002` + `DNCSETNX500EX001`). DD-7 order rule = (c) — สั่ง SET_A×2 + SET_B×1 → shared leaf × 3 (ตามจำนวนจริง, ไม่ dedupe).
  - **Snippet 0 V.3.3**: ACF sub-field `poi_parent_breakdown` (textarea JSON) — format `[{parent_sku, parent_name, qty}, ...]`. Invariant: `sum(breakdown.qty) === poi_qty_ordered`.
  - **Snippet 1 V.6.4**: Helper `b2f_get_item_breakdown($item)` parse JSON + fallback สำหรับ PO เก่า (return single-entry จาก `poi_parent_sku`). `b2f_build_item_breakdown_json()` serialize. `b2f_group_items_by_set()` ใช้ breakdown → 1 item ปรากฏใต้หลาย SET (per-SET qty split). `b2f_compute_manufacturing_summary()` flat leaf qty + breakdown origins.
  - **Snippet 2 V.9.10**: DD-7 collect `breakdown[]` per leaf — รวม qty เข้า `poi_qty_ordered` แต่เก็บที่มาแยกใน breakdown (`__standalone__` marker สำหรับ leaf ที่สั่งตรง). `create-po` validate invariant + save JSON. `po-detail` return `parent_breakdown` per item.
  - **Snippet 5 V.5.0**: Admin Makers tab — Primary/Secondary lock UX. Primary SET = `sort(memberSets)[0]` (alphabetical, deterministic) = editable + 🟠 badge "ใช้ร่วม N SET". Secondary = readonly + 🔵 "🔒 แก้ไขที่ `<sku>`" click → `jumpToPrimary()` scroll+highlight. Dirty tracking skip readonly, batch save dedup by pid.
  - **Snippet 8 V.5.0**: LIFF E-Catalog — SET Detail rows badge "🔗 ใช้ใน N ชุด" (`countTopSetsForProduct` walk-up). Cart `renderCartManufacturingSummary()` เตือนเฉพาะเมื่อมี shared leaf: "⚠️ L1 ต้องผลิต 4 ชิ้น (SET_A×2 + SET_B×1 + เดี่ยว×1)".
  - **Snippet 8 V.5.1**: LIFF E-Catalog UI polish — `parseModels()` normalize object `{brand_name, name}` → string (แก้ "[object Object]" chip ใน model filter). Type tabs mutually exclusive (match Product Catalog V.42.13). `renderTypeChips()` count badges "(N)" + hide empty chips (count=0 ซ่อน). Relabel tabs ไม่ใช้คำ "แม่/ลูก/หลาน": "สินค้าเป็นชุด" / "แยกชุด (แยกบน-ล่าง)" / "แยกชิ้น (เป็นข้าง)". Internal keys (`_jsType`, `filterType`) คงเดิม — backend/API compat.
  - **Snippet 8 V.5.2**: Align type chips กับ Inventory Stock Management (source of truth). Labels ใหม่: "ชุด SET" / "เดี่ยว" / "ลูกชิ้นส่วน" / "ชิ้นส่วนย่อย". เพิ่ม chip **"เดี่ยว"** (type=`single`) — เดิม LIFF ไม่มี filter singles แยก. Filter logic รองรับ `filterType === 'single'`. Chip row แสดงเมื่อมี hierarchy หรือ singles (เดิมซ่อนถ้าไม่มี set).
  - **Snippet 8 V.5.3**: Model filter inherit descendants — แก้บัค "NX500 โชว์แค่ 1 SET" ทั้งที่ Maker มีหลาย SET. Root cause: admin ใส่ `compatible_models` ที่ **leaf** (L/R) เท่านั้น SET/child ไม่มี → pre-V.5.3 filter NX500 ตัด SETs ออกหมด. Fix: `collectModelsWithDescendants(p, hier)` walk `skuRelations` recursive รวม models ของ descendants ทั้งหมด + `productMatchesModel()` ใช้ใน filter. `renderModelFilter()` ก็ใช้ helper เดียวกัน → chip row แสดง union ของ models ที่เป็นไปได้ทั้งหมด.
  - **Snippet 9 V.3.5**: PO Ticket view toggle — "ตามชุด" (grouped by SET, shared leaf ปรากฏทุก group) vs "ยอดรวมผลิต" (flat leaf list + breakdown "แยกตาม: SET_A×2 + SET_B×1"). localStorage preserve preference (`b2f_po_view`).
  - **Backward compat**: PO เก่าไม่มี `poi_parent_breakdown` → fallback single-entry จาก `poi_parent_sku` โดย `b2f_get_item_breakdown()` ทำงานได้ปกติ.
  - **DD-3 Hotfixes** (2026-04-13):
    - **Inventory V.42.25** (Stock Management): `sortHierarchy` เดิมใช้ `placed{}` dedup → shared child render ใน DOM ครั้งเดียว (ใต้ parent แรก) → expand SET อื่นไม่เห็นแถว. แก้: allow duplicate DOM rows (push 1 row per parent SET) — CSS classes `stock-child-of-*` ยังใช้ได้. SET dedup preserved, orphan dedup ย้ายไปใช้ `placedSku` หลัง sets rendering.
    - **B2F Snippet 5 V.5.1** (Admin Makers): `resolveSetName` เดิม case-sensitive + เช็คแค่ 2 sources → SET SKU ไม่อยู่ใน `wp_dinoco_products` → hierarchyMeta fallback คืน raw SKU แทนชื่อ. แก้: 4-level fallback chain — (1) Maker products exact+uppercase, (2) hierarchy_meta case-insensitive+validate ≠ SKU, (3) walk products หา `top_parent_name`/`parent_name` match, (4) SKU (last resort).
  - **Stock Management UX Fix Series (V.42.26–V.43.6)** (2026-04-13): 9 commits แก้ UX/logic bugs ต่อเนื่องหลัง V.42.25 จน DOM + expand + pagination + search + DD-3 indexing ทำงานถูกหมด:
    - **V.42.26** (Cross-expand bug): shared child duplicates หลาย DOM rows ติด CSS class `stock-child-of-SET_A` + `stock-child-of-SET_B` ทั้งคู่ → expand SET_A → SET_B ก็เปิดด้วย. แก้: tag แต่ละ duplicate ด้วย `_renderParent` (1 row = 1 parent class) → `stock-child-of-SET_A` class เฉพาะตอน `_renderParent === SET_A`.
    - **V.42.27** (Toggle scope): `toggleStockChildren('SET_A')` เลือก `.stock-child-of-SET_A` ซึ่งรวมถึง grandchild ของ SET_A ด้วย → ถ้า grandchild เป็น shared (อยู่ใต้ SET_B ด้วย) → ขยาย SET_B cascade. แก้: ใช้ `.stock-grandchild-of-SET_A` subtree scope — ขยายเฉพาะ grandchild ภายใต้ child ของ SET นี้เท่านั้น.
    - **V.43.0** (P0 UX): 3 fixes รวด — (1) anchor scroll compensation: getBoundingClientRect ก่อน expand → offset-correct scroll หลัง slideDown (ไม่กระโดด). (2) `is-expanded` class on row → visual cue ▼/▶. (3) pagination scroll-to-top: `$('html,body').animate({scrollTop: topOffset}, 250)` เวลาเปลี่ยนหน้า.
    - **V.43.1** (Hint toast): detect SET ที่มี descendants อยู่หน้าอื่น → แสดง "ชิ้นส่วนย่อยอยู่หน้าอื่น" hint. **Superseded โดย V.43.3** (พอ pagination group-aware แล้ว hint ไม่จำเป็น).
    - **V.43.2** (Direct leaves in JS): `sortHierarchy` วน children แล้ว nested vg loop แต่ลืม direct leaves ที่ parent = SET (ไม่มี child ระดับกลาง). แก้: เก็บ `renderedGcUnder{}` tracker + วน `directGc` ของ SET หลัง child loop → render เฉพาะ gc ที่ยังไม่เคย render.
    - **V.43.3** (Group-aware pagination): pagination slice ด้วย `sortedArray.slice(start, end)` → SET + children ถูกตัดครึ่งได้ (ขึ้นคนละหน้า). แก้: build `$groups[]` = `[[SET, ...descendants], [SET2, ...], [single1], [single2]]` แล้ว pagination ต่อ group → SET + all descendants = 1 group never split.
    - **V.43.4** (Direct leaves in PHP `$sorted`): PHP loop สร้าง `$sorted` เดิม append direct gc ที่ end → ตัด pagination หาย. แก้: วน `direct_gcs` ของแต่ละ SET หลัง children + เช็ค `rendered_gc{}` เพื่อ dedup (gc ที่ render ใต้ child แล้ว ไม่ต้อง re-render).
    - **V.43.5** (Search expansion): search SQL match เฉพาะ SKU/name/category → ค้นหา SET SKU เจอ SET อย่างเดียว (ไม่มี children). แก้: ถ้า search matched includes SET → walk sku_relations recursive → include descendants (children + grandchildren) ใน SQL IN clause.
    - **V.43.6** (DD-3 parent_skus indexing): `child_map[$parent_sku][] = $row` เดิม index ด้วย single `$row->parent_sku` → shared child index ใต้ parent แรกเท่านั้น → expand SET อื่นไม่เห็น. แก้: ใช้ `$row->parent_skus` (array, all parents) iterate — shared child index ใต้ parents ทุกตัว. Forward lookup `sku_relations[parent]→children` ใน `$sorted` ใช้ uppercase key + parent_skus_u array ทุกที่.
    - **DOM/CSS pattern** ใช้ class naming scheme: `stock-child-of-<PARENT_SKU>` + `stock-grandchild-of-<PARENT_SKU>` (uppercase). Each row tagged ด้วย `_renderParent` (data-render-parent) + `_renderGrandparent` แทน implicit lookup → accurate subtree scoping.
- **B2F Credit System**: Atomic payable operations via `b2f_payable_add/subtract()` ใน Snippet 7. ใช้ `FOR UPDATE` lock เหมือน B2B Debt System. `b2f_recalculate_payable()` เป็น single-SQL source of truth. ทิศทางกลับจาก B2B (DINOCO เป็นหนี้ Maker). Auto credit hold เมื่อเลยวงเงิน (reason=auto), Admin hold เอง (reason=manual).
- **B2F Multi-Currency** (V.3.0/V.4.0/V.7.0): รองรับ THB/CNY/USD per Maker. `po_currency` + `po_exchange_rate` snapshot ตอนสร้าง PO (immutable หลัง submitted). `po_shipping_method` (land/sea) บังคับสำหรับ ≠THB. Helpers: `b2f_currency_symbol()`, `b2f_format_currency($amount, $currency)`, `b2f_currency_name_en()`. receive-goods คำนวณ rcv_total_value เป็น THB (x exchange_rate). record-payment ≠THB ข้าม slip verify (admin_approved). Rate ranges: THB=1, CNY=2-10, USD=25-50.
- **B2F FSM**: `B2F_Order_FSM` class ใน Snippet 6. 12 statuses: draft→submitted→confirmed→delivering→received→paid→completed. Terminal: completed, cancelled. ทุก transition ต้องผ่าน `b2f_transition_order()`.
- **B2F Snippets** (DB_ID 1160-1171):
  - Snippet 0 (1160): CPT & ACF Registration V.3.3 — 5 CPTs + helpers + `b2f_get_maker_by_group()` (cached 5min/1hr) + **V.3.3: ACF `poi_parent_breakdown` (textarea JSON) multi-parent tracking**
  - Snippet 1 (1163): Core Utilities & Flex Builders V.6.4 — LINE push + 22 Flex templates + `b2f_liff_url()` (HMAC sig) + i18n ENG/TH/ZH + **V.6.4: `b2f_get_item_breakdown($item)` parse JSON + fallback, `b2f_build_item_breakdown_json()` serialize, `b2f_group_items_by_set()` ใช้ breakdown → 1 item ปรากฏใต้หลาย SET (per-SET qty split), `b2f_compute_manufacturing_summary()` flat leaf qty + origins**
  - Snippet 2 (1165): REST API V.9.10 — 20+ endpoints namespace `/b2f/v1/` + `auth-admin` (LIFF auth for Admin) + concurrent locks (po-cancel, maker-deliver) + is_complete หัก rejected + payment fallback THB + `reject-resolve` endpoint + po-cancel ไม่ลบ PO (FSM transition + stock restore + audit trail) + V.9.2: `b2f_build_hierarchy_context()` + `auto_type` grouping + `hierarchy_meta` missing leaves + V.9.7: leaf-based classification + V.9.9: ส่ง `sku_relations` ใน maker-products response (forward-lookup) + **V.9.10: DD-3 collect `breakdown[]` per leaf → save `poi_parent_breakdown` JSON (`__standalone__` marker สำหรับ leaf ที่สั่งตรง) + validate invariant + `po-detail` return `parent_breakdown` per item**
  - Snippet 3 (1164): Webhook Handler & Bot Commands — Maker commands + Admin B2F commands + Flex menu (self-contained)
  - Snippet 4 (1167): Maker LIFF Pages V.4.0 — shortcode `[b2f_maker_liff]` route `/b2f-maker/` + LANG system (`_isEng` + `L()` for non-THB currency makers)
  - Snippet 5 (1166): Admin Dashboard Tabs V.5.1 — 3 shortcodes embedded ใน Admin Dashboard + Bulk Cancel PO (V.2.0) + Multi-Currency UI (V.3.0) + Settings REST endpoint + receive form remaining fix + V.4.8: JS-side `computeProductTypes` from `sku_relations` + **V.5.0: DD-3 Primary/Secondary lock UX — Primary SET (alphabetical sort, editable, 🟠 badge "ใช้ร่วม N SET") vs Secondary (readonly, 🔵 "🔒 แก้ไขที่ `<sku>`", `jumpToPrimary()` scroll+highlight)** + **V.5.1: `resolveSetName` 4-level fallback chain (case-insensitive + walk products) แก้ SET SKU ไม่อยู่ใน products → แสดง raw SKU**
  - Snippet 6 (1161): Order State Machine — `B2F_Order_FSM` class
  - Snippet 7 (1162): Credit Transaction Manager — atomic `b2f_payable_add/subtract()`, credit เกิดตอน receive-goods เท่านั้น (ไม่หักตอน create-po), `b2f_recalculate_payable()` คำนวณจาก `rcv_total_value` ของ receiving records
  - Snippet 8 (1168): Admin LIFF E-Catalog V.5.3 — หน้าสั่งซื้อจาก LINE (LIFF auth V.2.0 ไม่ต้อง WP login) + Multi-Currency UI (V.3.0) + V.4.4: JS-side type derivation from `sku_relations` + V.5.0: DD-3 shared badge ใน SET Detail "🔗 ใช้ใน N ชุด" + `renderCartManufacturingSummary()` + V.5.1: parseModels normalize + type tabs mutually exclusive + chip count badges + hide empty + V.5.2: type chips "ชุด SET"/"เดี่ยว"/"ลูกชิ้นส่วน"/"ชิ้นส่วนย่อย" + **V.5.3: Model filter inherit descendants (SET match ถ้า leaf มี model ตรง) — แก้บัค "NX500 โชว์แค่ 1 SET"**
  - Snippet 9 (1169): PO Ticket View V.3.5 — หน้าดูรายละเอียด PO (status timeline, items, receiving, payment, credit) + **V.3.5: DD-3 view toggle "ตามชุด" (grouped by SET, shared leaf ปรากฏทุก group) vs "ยอดรวมผลิต" (flat leaf list + breakdown "แยกตาม: SET_A×2 + SET_B×1") + localStorage preserve preference key `b2f_po_view`**
  - Snippet 10 (1170): PO Image Generator V.2.5 — สร้างรูปใบสั่งซื้อ A4 ด้วย GD Library + REST `/b2f/v1/po-image`
  - Snippet 11 (1171): Cron Jobs & Reminders V.2.1 — 8 cron jobs (เตือนจัดส่ง/ล่าช้า/ชำระ/Maker ไม่ตอบ/สรุปวัน/สัปดาห์/เดือน/rejected PO escalation 7 วัน)
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
  - `po-cancel` V.8.2 ไม่ลบ PO อีกต่อไป — ใช้ FSM transition เป็น `cancelled` + คืนสต็อกผ่าน `dinoco_stock_add()` + เก็บ audit trail (`_b2f_cancel_reason`, `_b2f_cancelled_by`, `_b2f_cancelled_at`)
  - Flex builders เพิ่มเป็น 22 ตัว (เดิม 18) ใน Snippet 1 V.6.0 — เพิ่ม reject-resolve, cancel confirmation, stock restore notification, escalation alert
  - `reject-resolve` endpoint สำหรับ resolve rejected lots — Admin ยืนยันว่า lot ที่ reject แล้วได้รับการแก้ไข (re-ship หรือ credit note)
- **B2F Multi-Currency** (V.3.0+): Maker มี `maker_currency` (THB/CNY/USD). Product มี `mp_shipping_land` + `mp_shipping_sea` (THB/unit). PO มี `po_currency`, `po_exchange_rate`, `po_shipping_method` (land/sea), `po_total_amount_thb`, `po_shipping_total`, `po_grand_total_thb`. Frontend helpers: `b2f_currency_symbol()`, `b2f_format_currency()`, `b2f_currency_name_en()` (Snippet 1). Settings: `b2f_shipping_dest_land`, `b2f_shipping_dest_sea` (wp_options, REST `/b2f/v1/settings`). Exchange rate range: CNY 2-10, USD 25-50. Currency immutable หลัง submitted.
  - `b2f_get_po_data()` return `currency`, `exchange_rate`, `shipping_method` — Flex builders ทุกตัวใช้ `$po['currency']` แทน hardcode `'฿'`
  - PO Image (Snippet 10 V.2.5): CNY/USD PO ใช้ ENG template (PURCHASE ORDER, No., Date, Supplier, Item, Qty, Unit Price, Amount) + delivery address + shipping method (By Truck K / By Sea M) + ไม่แสดง baht_text
  - **3-Language Support** (V.6.0): `b2f_t($th, $en, $zh, $currency)` helper ใน Snippet 1. THB→ไทย, USD→English, CNY→中文 (fallback ถ้า $zh empty ใช้ $en). Snippet 1/2/3/11 ใช้ `b2f_t()` แทน `$is_eng ? 'EN' : 'TH'` ternary เดิม. `b2f_flex_status_badge($status, $currency)` เปลี่ยน signature จาก `$is_eng` เป็น `$currency` (backward compat: boolean → auto convert)
  - Maker LIFF (Snippet 4 V.3.18): `curSym(po)` helper ใช้ `po.currency_symbol` จาก API
  - PO Ticket (Snippet 9 V.3.3): Admin เห็น "ต้นทุนจริง" section (ยอดสกุลโรงงาน, exchange rate, THB total, ค่าส่ง, ต้นทุนรวม) สำหรับ foreign PO
  - Cron messages (Snippet 11 V.2.1): แสดง currency note สำหรับ foreign PO + rejected PO escalation (7 วันไม่ resolve → แจ้ง admin)
  - Debt/credit/payment/outstanding = THB เสมอ (ไม่แปลงสกุล)
  - Flash cron `b2b_flash_tracking_cron` ใช้ fallback interval `everytwohours` (จาก WP Fastest Cache) เพราะ `every_2hr_b2b` ไม่ load ใน REST context + DISABLE_WP_CRON=true
  - Flash Webhook ต้องกดตั้งค่าใน B2B Admin → Flash → ตั้งค่า Webhook ทุกครั้งที่เปลี่ยน API key/domain
  - `/debug-flash/{ticket_id}` (admin only ใน B2B Snippet 5) — ดึง Flash Routes API + force update สถานะ + schedule cron
- **Manual Flash Shipping** (V.38.0→V.41.0): ระบบส่งพัสดุ standalone ไม่ต้องมี B2B order. เข้าผ่าน RPi Dashboard `/manual-ship` (Basic Auth). สร้าง Flash order ตรง + render label (ไม่มี LOGO/แถบดำ DINOCO) + print ผ่าน RPi. เก็บรายการใน `wp_options` key `b2b_manual_shipments_{YYYY_MM}`. Config: `manual_ship_user`, `manual_ship_pass`, `manual_ship_sender_*` ใน `config.json`. **Webhook Status Update** (V.40.8): `b2b_flash_manual_shipment_webhook()` ใน Snippet 3 — Flash webhook อัพเดท status ของ manual shipment ได้แล้ว (เดิมติดค้าง 'created' ตลอดเพราะ webhook handler ค้นเฉพาะ B2B tickets). **V.41.0 (9 features)**: 4 REST endpoints ใหม่ (`manual-flash-label`, `manual-flash-status`, `manual-flash-test`, `manual-reprint` via RPi print queue). `b2b_manual_shipment_months()` helper ดึงเดือนที่มีข้อมูล. Multi-box courier fix (all_pnos param). Status polling cron `b2b_manual_flash_poll_cron`. RPi proxy routes 4 ตัว (dashboard.py V.40.0). Frontend: Flash label button, check status modal, reprint, tracking links on PNO, export CSV, test Flash, Thai status labels.
- **Walk-in Distributor** (V.39.0): ร้านหน้าโกดัง — เปิด toggle `is_walkin` บน distributor CPT ใน Admin Panel. Flow: สั่งของ → ยืนยัน → **ข้ามเช็คสต็อก** (auto `awaiting_confirm`) → ยืนยันบิล → เพิ่มหนี้+INV เหมือนเดิม → จ่าย → **auto completed** (ข้ามเลือกวิธีส่ง). ระบบเครดิต/หนี้/สลิปชำระเหมือนเดิม 100%. Order stamp `_b2b_is_walkin=1`. Hook `b2b_order_status_changed` → `b2b_walkin_auto_complete()` ใน Snippet 2.
- **Walk-in Bank Account** (V.32.0): Walk-in orders ใช้บัญชีธนาคารแยกได้ผ่าน constants `B2B_WALKIN_BANK_*` (BANK_NAME, BANK_NAME_EN, BANK_ACCOUNT, BANK_HOLDER, BANK_CODE, BANK_LOGO_URL, PROMPTPAY_ID). ถ้าไม่ define จะ fallback เป็น `B2B_BANK_*` ปกติ. `b2b_get_bank_info($order_id)` / `b2b_get_bank_logo_url($order_id)` / `b2b_get_bank_copy_text($order_id)` รับ order_id เพื่อเช็ค walk-in. Slip verification (Snippet 2+3) accept ทั้ง 2 บัญชี. Walk-in confirm_order+confirm_bill ไม่ส่ง text ซ้ำ (Flex card เพียงพอ).
- **Walk-in Cancel** (V.33.2): Admin สามารถยกเลิก completed walk-in order ได้. FSM V.1.5 เพิ่ม `completed→cancelled` (admin only) + `cancel_request` transitions. `@admincancel` + Admin Dashboard dropdown รองรับ. คืนหนี้อัตโนมัติ (`is_billed` check + `b2b_recalculate_debt`). ส่ง Flex card ไปกลุ่มลูกค้า (แจ้งยกเลิก + แจ้งคืนเครดิต). Non-walk-in completed orders ยังคง terminal state.
- **B2B Cancel Request** (V.39.2): `cancel-request` ใน Snippet 3 ใช้ `b2b_set_order_status()` ผ่าน FSM แล้ว (เดิม bypass direct update). FSM V.1.5 เพิ่ม `cancel_request` transitions. ทุก status change ผ่าน FSM validation เสมอ.
- **B2B Stock Restore Guard** (V.31.7): Snippet 5 cancel stock restore มี `_stock_returned` meta guard ป้องกัน double restore เมื่อ cancel order. เช็ค flag ก่อน `dinoco_stock_add()` + set flag หลัง restore สำเร็จ.
- **LIFF AI Snippets** (DB_ID 1173-1174):
  - Snippet 1 (1173): REST API V.1.4 — Auth (LINE ID Token verify + JWT) + Lead/Claim endpoints + Agent proxy (`liff_ai_call_agent`) + `agent-ask` endpoint. Claims ใช้ CPT `claim_ticket` + field `ticket_status`. Claim detail returns photos (normalized URLs), ai_analysis, status_history. Claim status update logs history + supports 11 statuses (ตรงกับ Service Center).
  - Snippet 2 (1174): Frontend V.3.1 — shortcode `[liff_ai_page]` route `/ai-center/` + SPA-like pages (dashboard, dealer, lead detail, claim list, claim detail, agent chat). Bottom nav (Admin: 4 tabs, Dealer: 2 tabs). Photo lightbox with swipe. Claim status change modal (Admin). AI Agent chat (Phase 3).
- **LIFF AI Architecture**: ตัวแทน (dealer) เปิด LIFF → verify id_token → ค้นหา distributor CPT (`owner_line_uid` field) หรือ WP user (`linked_distributor_id` meta) → issue JWT → ใช้ `X-LIFF-AI-Token` header. Lead data อยู่ใน MongoDB (ผ่าน Agent proxy:3000). Claim data อยู่ใน WP (warranty_claim CPT).
- **LIFF AI Constants**: `LIFF_AI_SECRET_KEY`, `LIFF_AI_JWT_SECRET` (auto-generate เก็บ wp_options), `LIFF_AI_AGENT_URL` (default `http://agent:3000`), `LIFF_AI_AGENT_KEY`
- **LIFF AI Gotchas**:
  - Auth ใช้ LINE ID Token verify อย่างเดียว (ไม่ต้อง HMAC sig จาก client — secret key ฝัง JS ไม่ปลอดภัย)
  - Dealer ต้องมี ACF field `owner_line_uid` บน distributor CPT หรือ WP user meta `linked_distributor_id`
  - CSS prefix `.liff-ai-*` ทุก class (dark theme), scoped ไม่ conflict กับ B2B/B2F
  - Lead statuses ตรงกับ `LEAD_STATUSES` ใน `lead-pipeline.js` (17 statuses)
  - Claims ใช้ CPT `claim_ticket` + field `ticket_status` (แก้แล้ว V.1.4 — เดิมใช้ `warranty_claim` + `claim_status` ผิด)
  - Claim statuses ต้องตรงกับ Service Center (11 statuses: pending, reviewing, approved, in_progress, waiting_parts, repairing, quality_check, completed, rejected, cancelled, closed)
- **OpenClaw Mini CRM** (`openclawminicrm/`): Multi-platform AI chatbot (LINE + Facebook + Instagram + Telegram). ดู `openclawminicrm/CLAUDE.md` สำหรับรายละเอียด.
  - **Agent** (`proxy/`): Node.js + Express (V.2.1), Gemini Flash + Claude Sonnet (function calling), MongoDB Atlas
  - **Modules** (9 ไฟล์): `ai-chat.js` (V.8.1), `dinoco-tools.js` (11 tools), `shared.js` (prompt + config), `claim-flow.js`, `lead-pipeline.js` (V.2.0), `dinoco-cache.js`, `platform-response.js`, `telegram-alert.js` (V.2.0), `telegram-gung.js` (V.1.0)
  - **Tools** (11 ตัว): เดิม 8 + เพิ่ม `check_stock_status`, `dinoco_claim_status`, `dinoco_create_claim`. `dinoco_create_claim` platform detect จาก sourceId (ไม่ hardcode facebook อีกต่อไป)
  - **Claim Flow V.3.0**: auto-timeout 24h (เดิม 48h), isClaimIntent strict mode 2 ระดับ (explicit/symptoms+product), "สอบถามสินค้า" ไม่เข้า claim อีกต่อไป
  - **Lead Pipeline V.2.0**: เพิ่ม statuses `closed_won`, `waiting_decision`, `waiting_stock`. Auto-lead V.8.0: ชื่อ+เบอร์ → สร้าง lead ทันที + notify ตัวแทน LINE Flex. Postback handler ใช้ FSM (`updateLeadStatus`). `notifyDealerDirect()` centralized notify. 5 Flex builders: LeadNotify, FollowUp, StockBack, DealerReminder, Closed. `lookupProductForLead()` enrich lead ด้วยรูป+ราคา. Output-based dealer coordination: detect ร้าน+เบอร์ → append ข้อความประสาน.
  - **Dealer Management V.2.0**: MongoDB `dealers` collection + CRUD API (8 endpoints). Dashboard 2 pages (list + detail) + 5 API routes + sidebar menu "ตัวแทน". Import จาก WP `/distributor-list`. Direct LINE Flex card notification (ไม่ผ่าน WP). Feature flag: `USE_MONGODB_DEALERS=true`. Flex card: DINOCO CO DEALER header สีดำ + logo + รูปสินค้า + ราคา.
  - **AI Chat V.8.1**: ดัก Claude review text หลุดไปหาลูกค้า + PII masking ใน conversation history (ป้องกัน Gemini SAFETY block) + false hallucination alert fix (V.4.2) + detect ร้าน+เบอร์ → append ข้อความประสาน (V.6.3)
  - **Product Knowledge Rules**: ห้ามเอ่ย H2C, วัสดุตรงสินค้า (กันล้ม=สแตนเลส กล่อง=อลูมิเนียม), DINOCO Edition NX500 = SKU DNCGND37LSPROS สีเงินเท่านั้น, Side Rack ไม่ใช่มือจับ (มือจับเกี่ยวกับ Rear Rack เท่านั้น)
  - **Anti-Hallucination V.4.0**: 3 ชั้นป้องกัน + intent pre-check + context-aware supervisor, prompt restructure กฎสำคัญขึ้นบนสุด, conversation history 12 msgs, isClaimIntent strict 2 ระดับ, claim timeout 24h
  - **Security**: requireAuth ทุก API endpoint, prompt injection protection 14 patterns, PII masking, rate limiting
  - **Training Dashboard V.1.0**: หน้า `/dashboard/train` — บอสเทรน AI ผ่าน UI. Agent API `/api/train/*` (test, judge, kb, generate, stats, logs). KB จาก training มี `source: "training_dashboard"`. MongoDB collection `training_logs`.
  - **Telegram Bot V.1.0** (น้องกุ้ง): `telegram-gung.js` — Command Center ผ่าน @dinoco_alert_bot. 20+ commands (เคลม/ตอบลูกค้า/KB/Lead/สถิติ). `telegram-alert.js` V.2.0 — alert system (sendTelegramAlert/Reply/Photo + MongoDB logging). Webhook: `POST /webhook/telegram/{secret}`. Cron: daily summary 09:00, lead no contact ทุก 4 ชม., claim aging ทุก 4 ชม. Security: chat_id check (บอสเท่านั้น). Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `BASE_URL`. MongoDB: `telegram_alerts` (message_id <-> sourceId), `telegram_command_log` (audit trail).
  - **Docker Deploy**: `docker-compose.prod.yml` มี mongodb service + agent depends_on. Volume `mongo-data` (ไม่ใช่ `mongodb-data`). Nginx port 80 serve ตรง (Cloudflare Tunnel ไม่ redirect HTTPS). ทุก service ต้องอยู่ใน compose (ห้าม manual docker network connect). `LINE_CHANNEL_ACCESS_TOKEN` ใน .env = B2B bot token เดียวกับ WP.
  - **Regression Guard V.1.5** (11 เม.ย.): ระบบป้องกัน bug เก่ากลับมาเวลาแก้ feature ใหม่. 25 scenarios (REG-001..REG-025) จาก Fix History. 3-layer validation (regex + tool calls + Gemini judge). CLI: `node scripts/regression.js --mode=gate --severity=critical`. Seed: `node scripts/seed-regression.js`. **V.1.5 key fix**: `runRegressionTurn()` helper ใน `proxy/index.js` แก้ multi-turn context loss (save messages ระหว่าง turns → mirror `aiReplyToLine`). Test Mode Guard: `dinoco-tools.js` mock side effects เมื่อ `sourceId` ขึ้นต้น `reg_`. Deploy gates: pre-push hook V.2.0 + GitHub Actions + `deploy.sh` step 0. Dashboard tab "ระบบกันถอย" ใน `/dashboard/train`. Cron: 03:00 update `pass_rate_7d` + drift alert (< 90% × ≥3 runs → Telegram `regression_drift`). Override: `git push --no-verify` / `SKIP_REGRESSION=1`.
  - **Chatbot Canonical Brain**: `openclawminicrm/docs/chatbot-rules.md` — สมองกลางของ chatbot 14 sections + Fix History 22+ rows. **บังคับอ่านก่อนแก้ chatbot** (rules ห้ามเปลี่ยน ป้องกัน regression). Hard bans: H2C, "ยินดีให้บริการ", "ราคาพิเศษ", Side Rack + "มือจับ" ในประโยคเดียวกัน, "ตลอดชีพ". Fix History แต่ละ bug มี REG-NNN ที่ map ไป regression scenario.
  - **Dealer Management V.2.0** (8 เม.ย.): MongoDB `dealers` collection + 8 CRUD API + Dashboard 2 pages (list + detail) + Import จาก WP `/distributor-list` + LINE Flex card (DINOCO CO DEALER header สีดำ + logo + รูปสินค้า + ราคา). Feature flag: `USE_MONGODB_DEALERS=true`. Spec: `docs/dealer-management-spec.md` V.1.1.
  - **Lead Pipeline V.2.0** (8 เม.ย.): 3 statuses ใหม่ (`closed_won`, `waiting_decision`, `waiting_stock`) + Auto-lead V.8.0 (ชื่อ+เบอร์ → lead + Flex ไปตัวแทน) + `notifyDealerDirect()` centralized + `lookupProductForLead()` enrich รูป+ราคา + 5 Flex builders + postback ใช้ FSM (`updateLeadStatus`) + normalize field `history`.
  - **AI Chat V.8.1** (8 เม.ย.): Claude review text leak filter + PII masking in conversation history + FB image URL robust extraction + false hallucination alert fix + Product Knowledge Rules (H2C/materials/Side Rack/DINOCO Edition silver/BULK → ตัวแทน/"ยินดีให้บริการ" ban).
  - **Dashboard Critical Fixes** (8-10 เม.ย.): basepath fix (`dealer-sla`, `claims` → `/dashboard/api/proxy/*`), duplicate "ที่อยู่" removed, silent fallback → 503 error response (11 files), Claim actions Case A/B/Reject buttons + REST API `/api/proxy/claims/[id]/status`, Auth ใช้ `proxy.ts` ของ Next.js 16 (ลบ `middleware.ts` — conflict), TypeScript cast for MongoDB `$push`.

## Reference Documentation

- `SYSTEM-REFERENCE.md` — System architecture, snippet mapping, DB schema, constants reference
- `WORKFLOW-REFERENCE.md` — Business workflows (B2B order flow, B2F PO flow, claim flow, inventory flow)
- `FEATURE-SPECS.md` — Feature specifications and implementation details
- `openclawminicrm/docs/chatbot-rules.md` — **Canonical Chatbot Brain** — ทุก rule ที่แก้ไปแล้ว (บังคับอ่านก่อนแก้ chatbot)
- `openclawminicrm/docs/regression-guard.md` — Regression Guard System V.1.5 full design
- `openclawminicrm/docs/dealer-management-spec.md` — Dealer Management V.2.0 spec + Full Loop Workflow
- `openclawminicrm/docs/telegram-gung-spec.md` — น้องกุ้ง Telegram Command Center V.1.0 spec

---

## 🧠 Second Brain Integration

repo นี้เชื่อมกับ central knowledge wiki ที่ `.second-brain/`
(symlink ไปที่ `~/Projects/second-brain/wiki/`, gitignored)

### Startup — ทุก session ใหม่อ่านตามลำดับ

1. `.second-brain/hot-cache.md` — ~500 words, current focus + recent changes
2. `.second-brain/log.md` — entries บนสุด 3 อัน (ประวัติล่าสุด cross-session)
3. CLAUDE.md นี้ — DINOCO-specific conventions

### Post-fix — หลังแก้บัค/ฟีเจอร์ต้อง log 3 ที่

1. Git commit (เหมือนเดิม)
2. `.second-brain/log.md` — append entry บนสุด ตาม format ใน
   `.second-brain/../schemas/fix.template.md`
3. `.second-brain/hot-cache.md` — อัปเดต "Recent Changes" ถ้า change สำคัญ

### Workflow references

- Bug fix: `.second-brain/workflows/bug-fix.md`
- Ingest: `.second-brain/workflows/ingest.md`
- Query: `.second-brain/workflows/query.md`
- Decision: `.second-brain/workflows/decision.md`
- Lint: `.second-brain/workflows/lint.md`
- Research: `.second-brain/workflows/research.md`

### ⚠️ ห้าม

- อย่า `git add .second-brain` — เป็น symlink ออกนอก repo
- อย่าแก้ไฟล์ใน second-brain ที่ไม่เกี่ยวกับ DINOCO
  (concepts ทั่วไป, meta-knowledge) ถ้าไม่แน่ใจ ถาม user ก่อน
- ถ้า `.second-brain` หาย (ย้ายเครื่อง?) → แจ้ง user, อย่า assume
