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

## REST API Endpoints (B2B)

All under `/wp-json/b2b/v1/`: `confirm-order`, `flash-create`, `daily-summary`, `update-status`, `delete-ticket`, `recalculate-total`, `flash-label`, `flash-ready-to-ship`.

## REST API Endpoints (B2F)

All under `/wp-json/b2f/v1/`: `makers`, `maker`, `maker-products`, `maker-product`, `create-po`, `po-detail`, `po-update`, `po-cancel`, `maker-confirm`, `maker-reject`, `maker-reschedule`, `maker-po-list`, `approve-reschedule`, `receive-goods`, `record-payment`, `dashboard-stats`, `po-history`.

## Required WordPress Constants

- `DINOCO_LINE_CHANNEL_ID` — LINE OAuth app ID
- `DINOCO_LINE_REDIRECT_URI` — OAuth callback URL
- `B2B_LINE_ACCESS_TOKEN` — Bot token for LINE notifications
- `B2B_ADMIN_GROUP_ID` — Admin LINE group for alerts
- `DINOCO_GITHUB_TOKEN` — GitHub PAT for sync engine
- `DINOCO_GITHUB_REPO` — GitHub repo (e.g., `Vrprammz/DINOCO-SYSTEM-Front-End---Back-End`)
- `DINOCO_GITHUB_WEBHOOK_SECRET` — Webhook signature secret
- `B2F_LIFF_ID` — LIFF app ID for B2F Maker pages
- `B2F_LIFF_URL` — LIFF base URL for B2F

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
- **B2F System**: Business to Factory — DINOCO สั่งซื้อสินค้าจากโรงงานผู้ผลิต (Maker). ใช้ LINE Bot เดียวกับ B2B, routing ตาม `group_id` (Distributor→B2B Flex, Maker→B2F Flex, Admin→ทั้งหมด). Kill switch: `define('B2F_DISABLED', true)`. Credit system ทิศทางกลับจาก B2B (DINOCO เป็นหนี้ Maker). Maker LIFF auth ใช้ Signed URL + JWT.
- **B2F Credit System**: Atomic payable operations via `b2f_payable_add/subtract()` ใน Snippet 7. ใช้ `FOR UPDATE` lock เหมือน B2B Debt System. `b2f_recalculate_payable()` เป็น single-SQL source of truth. Auto credit hold เมื่อเลยวงเงิน (reason=auto), Admin hold เอง (reason=manual) ต้อง Admin unhold เท่านั้น.
- **B2F FSM**: `B2F_Order_FSM` class ใน Snippet 6. 12 statuses: draft→submitted→confirmed→delivering→received→paid→completed. Terminal: completed, cancelled. ทุก transition ต้องผ่าน `b2f_transition_order()`.
