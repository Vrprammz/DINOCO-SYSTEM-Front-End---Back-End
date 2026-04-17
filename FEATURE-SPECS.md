# DINOCO Feature Specs -- Complete Wiki

**Date:** 2026-04-07 (original) / 2026-04-16 (B2B Backorder System Phase A-D complete)

> Consolidated from: B2F-FEATURE-SPEC.md, INVENTORY-FEATURE-SPEC.md, FINANCE-DASHBOARD.md, BRAND-VOICE.md, MASTER-PLAN.md
>
> **2026-04-16 update (Big Feature):** B2B Backorder System Phase A-D **complete** — implementation details ใน section 5 ด้านล่าง + full spec ใน `FEATURE-SPEC-B2B-BACKORDER-2026-04-16.md` (1876 lines). Phase 0 Hotfix (Snippet 1 V.33.7 + Snippet 15 V.7.5) ยังทำงานเป็น safety net. Master flag `b2b_flag_bo_system` default OFF.

---

## 5. B2B Backorder System (Phase A-D Complete)

**Version:** V.1.6 | **Snippet:** [B2B] Snippet 16 (~3497 LOC) | **Spec:** `FEATURE-SPEC-B2B-BACKORDER-2026-04-16.md`

**Philosophy shift:** "realtime stock check on order" → **"opaque accept + admin split review"**

### 5.1 Problem & Goal

**Problems solved:**

1. **Stock enumeration attack** (CRITICAL security): ตัวแทนทุจริต probe inventory ผ่าน qty binary search (1000→500→250→... ~log₂(stock) attempts) — ปิดด้วย opaque accept + rate limits + jitter
2. **BO false positives** (Ticket #6266): `b2b_check_order_oos()` อ่าน stale `stock_status` column → ตอบลูกค้า "หมด" ผิด — ปิดด้วย elimination ของ realtime OOS gate
3. **No partial fulfillment**: ลูกค้าต้องรอทั้งออเดอร์ หรือ cancel — ปิดด้วย Admin Split BO workflow
4. **Data drift**: `manual_hold=1` ค้างจาก admin action เก่า ไม่มี auto-unlock — Phase 0 hotfix แก้ partial; Phase A-D eliminates call path entirely

### 5.2 Success Metrics (90 วัน)

- Stock info leak via error msg: **0** (constant generic responses)
- Enumeration attempts detected: **100% logged + alerted**
- BO resolve time (median): **≤48h**
- Partial-fulfill orders: **≥15%** of insufficient-stock orders
- Admin split clicks per split: **≤2**

### 5.3 Architecture

```
Customer LIFF → place-order
    ↓ (do_action 'b2b_place_order_post_process' — C1)
Snippet 3 V.41.4 stores order status=draft
    ↓
Customer confirms in LINE Flex → postback
    ↓ (Snippet 2 V.34.4 b2b_action_confirm_order — C2 FIX)
    ↓ if b2b_flag_bo_system=ON && !walkin:
        transition → pending_stock_review
        + _b2b_stock_snapshot meta (admin-only)
        + _b2b_opaque_accept_at
        + increment daily counters
        + b2b_log_attempt('place_order', accepted)
        + notify admin Flex (bucket indicator)
        + opaque customer reply
    ↓
Admin LINE Group receives Flex (bucket: พอ / ไม่พอ / หมด — no exact qty)
    ↓
    [✅ ยืนยันเต็ม] → POST /bo-confirm-full → awaiting_confirm (existing flow)
    [⚙️ Split BO]   → URI deep-link → Admin Dashboard → Backorders tab → Split Modal
    [❌ ปฏิเสธ]      → POST /bo-reject → cancelled (revert counters)
    ↓
(Split Modal) POST /bo-split → validate invariant + per-SKU leaf stock subtract
    + bo_queue insert (status=pending) + per-SKU compound debt + FSM partial_fulfilled
    + 10min undo window (_b2b_split_undo_deadline + _b2b_undo_count=0)
    + notify customer combined Flex "ส่งทันที N + รอสต็อก M + ETA"
    ↓
Cron b2b_bo_restock_scan_cron (15min)
    ↓ scan bo_queue status=pending + check dinoco_compute_hierarchy_stock - reserved ≥ qty_bo
    ↓ mark ready + Telegram alert
    ↓
Admin Backorders tab shows ready items → [ส่ง BO]
    ↓ POST /bo-fulfill
    ↓ FOR UPDATE lock bo_queue row + stock subtract + debt add + transition
    ↓ if all BO resolved → awaiting_confirm → billing flow
    ↓ do_action 'b2b_bo_items_fulfilled' → H5 Flash + H6 Print queue
    ↓ notify customer BO ready Flex [ยืนยันบิล BO]
```

### 5.4 14 REST Endpoints (namespace `/wp-json/b2b/v1/`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `bo-split` | Admin split order |
| POST | `bo-confirm-full` | Admin confirm all stock available |
| POST | `bo-reject` | Admin reject entire order |
| POST | `bo-undo-split` | Undo within 10min (1 max/order) |
| POST | `bo-fulfill` | Ship BO items after restock |
| POST | `bo-cancel-item` | Cancel BO line (discontinued) |
| POST | `bo-update-eta` | Admin extend ETA |
| POST | `bo-bulk-fulfill` | Batch fulfill |
| POST | `bo-bulk-cancel` | Batch cancel (discontinued SKU) |
| POST | `bo-restock-scan` | Manual trigger scan |
| POST | `bo-clear-enum-flag` | Clear false-positive |
| GET | `bo-queue` | List BO queue (filter) |
| GET | `bo-pending-review` | List pending_stock_review orders |
| GET | `bo-order-detail?order_id=N` | Single order + fresh_snapshot |
| GET | `bo-summary` | Badge counts |

**Permission:** `manage_options` OR admin LINE JWT session. POST requires `X-WP-Nonce` (CSRF H1).

### 5.5 Data Model

**2 Custom tables** (`[B2B] Snippet 16` dbDelta, `dinoco_*` prefix):

```sql
CREATE TABLE wp_dinoco_order_attempt_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  distributor_id BIGINT UNSIGNED NOT NULL,
  group_id VARCHAR(64) NOT NULL,
  action VARCHAR(20) NOT NULL,    -- place_order | cancel | split | undo_split | bo_fulfill
  order_id BIGINT UNSIGNED DEFAULT NULL,
  items_hash VARCHAR(64) DEFAULT NULL,
  total_qty INT UNSIGNED DEFAULT NULL,
  total_value DECIMAL(14,2) DEFAULT NULL,
  result VARCHAR(20) NOT NULL,    -- accepted | rejected | rate_limit | dup | error
  rejection_code VARCHAR(32) DEFAULT NULL,
  ip VARCHAR(45) DEFAULT NULL,
  user_agent VARCHAR(128) DEFAULT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_created (created_at),
  KEY idx_dist_action_time (distributor_id, action, created_at),
  KEY idx_action_time (action, created_at),
  KEY idx_order (order_id)
);
-- Retention: 90 days (chunked cleanup cron daily 03:00)

CREATE TABLE wp_dinoco_bo_queue (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  item_index INT UNSIGNED NOT NULL,
  sku VARCHAR(50) COLLATE utf8mb4_bin NOT NULL,
  qty_bo INT UNSIGNED NOT NULL,
  eta DATE DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | ready | fulfilled | cancelled
  notes TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL,
  resolved_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_order_item (order_id, item_index),
  KEY idx_sku_status (sku, status),
  KEY idx_status_created (status, created_at),
  KEY idx_status_resolved (status, resolved_at)
);
```

**Order post_meta (admin-only, filtered from non-admin REST):**

- `_b2b_stock_snapshot` — JSON {sku: {available, requested}} — snapshot at opaque accept time
- `_b2b_opaque_accept_at` — DATETIME
- `_b2b_split_at` / `_b2b_split_by` / `_b2b_split_undo_deadline` / `_b2b_undo_count` — split audit
- `_b2b_reject_reason` — text
- `_b2b_enumeration_flags` — bitfield (1=rate_hit, 2=cancel_abuse, 4=qty_cap_hit, 8=suspicious_pattern)
- `_print_queued_bo` — JSON {queued_at, job_id or items/meta} (H6)

All protected by `register_post_meta` + `show_in_rest: false` + `auth_callback: manage_options`.

### 5.6 Security Architecture (15 threats mitigated)

**Attack vectors addressed:**

- Vector A: Qty binary search → hard caps (≤500/item + ≤2000/SKU/day) + rate limits (10/hr + 50/day) + artificial jitter 50-150ms + enumeration detection
- Vector B: Cancel+retry probe → grace period 5min (legitimate UX) + after = 2/hr + 10/day (tighter) + attempt logging
- Vector C: Multi-order parallel → daily qty cap + detection cron + unique-SKU/day 20
- Vector D: Cross-SKU correlation → unique-SKU/day cap 20 + Telegram alert
- Vector E: Timing side-channel → artificial jitter (σ <100ms)
- Vector F: Walk-in negative stock leak → walk-in bypass opaque accept (existing flow isolated)
- Vector G: Admin Flex insider threat → bucket indicator (no exact qty in LINE group)
- Vector H: Undo oscillation → 1 max per order + 10min window
- Vector I: Cross-SKU enumeration → unique-SKU/day cap
- Vector J: Audit log XSS → esc_html + VARCHAR(128) UA truncation
- Vector K: ACF meta leak → register_post_meta show_in_rest=false + rest_prepare filter

**Hardening applied:**

- C2 Rate limit atomic via MySQL `GET_LOCK/RELEASE_LOCK` (Snippet 1 V.33.7)
- C3 Meta filter 2-layer defense (register_meta + rest_prepare)
- C4 XSS audit log viewer `esc_html` + UA truncation 50 chars
- H1 CSRF X-WP-Nonce + JWT session token dual auth
- H5 Undo count post_meta hard limit

### 5.7 Integration Points

| System | Hook | Behavior |
|--------|------|----------|
| **Debt System** (Snippet 13) | `b2b_debt_add` per split | per-SKU compound (M3 fix — spec §5.2) — `sum(price × qty_fulfill)` ไม่ใช่ ratio |
| **Flash Shipping** (Snippet 3/5) | Action `b2b_bo_items_fulfilled` priority 10 | Secondary Flash order on BO fulfill — prefer `b2b_flash_create_secondary()` helper |
| **Print Queue** (Snippet 9) | Action `b2b_bo_items_fulfilled` priority 20 | Secondary label job — fallback meta `_print_queued_bo` |
| **Inventory** (Snippet 15) | `dinoco_stock_subtract/add` with leaf expansion | Leaf-only subtract per DD-2 (3-level hierarchy) |
| **FSM** (Snippet 14 V.1.6) | New states + transitions | `pending_stock_review` + `partial_fulfilled` |
| **LINE Bot** (Snippet 2 V.34.4) | `b2b_action_confirm_order` BO gate + postback handlers | Short-circuit BEFORE OOS check |
| **Telegram Alerts** | `b2b_send_telegram_alert` | `enumeration_attempt`, `suspicious_qty`, `bo_eta_warn`, `bo_restock_ready` |
| **Customer LIFF** (Snippet 11 V.30.3) | Status badges + embed `[b2b_bo_customer_order_detail]` | Split view per order card |

### 5.8 Admin UI (ฝังใน Admin Dashboard V.32.5)

**Sidebar → ระบบ B2B** → 3 new tabs:

- **📋 Backorders** (`[b2b_bo_admin]`) — Pending Review + Backorders queue + Split Review modal live validation + Restock Scan + filter + age buckets
- **🚩 BO Flags** (`[b2b_bo_flags]`) — toggle 3 flags + config viewer
- **🛡️ Security Log** (`[b2b_bo_security_log]`) — attempt log + flagged distributors + CSV export + pagination

Badge updater `fetchBoBadge()` polls `/bo-summary` ทุก 60s — show action-needed count on Backorders tab.

### 5.9 Customer UI

**Snippet 11 V.30.3** `[b2b_orders]` customer LIFF:

- Status badges: "⏳ รอตรวจสอบ" (pending_stock_review) / "📦 บางส่วน + BO" (partial_fulfilled)
- Embed `[b2b_bo_customer_order_detail order_id="N"]` per order card (if BO-relevant status)
- Split view shows: ✅ จัดส่งทันที section + ⏳ รอสต็อก section with ETA + total breakdown (ชำระแล้ว / รอชำระ BO / ยอดรวม)
- Customer-safe: ไม่มี stock numbers

### 5.10 Feature Flags (wp_options)

```php
b2b_flag_bo_system: false                  // master — default OFF
b2b_flag_bo_beta_distributors: []          // whitelist IDs for canary
b2b_bo_max_qty_per_item: 500
b2b_bo_rate_place_per_hour: 10
b2b_bo_rate_place_per_day: 50
b2b_bo_rate_cancel_per_hour: 2
b2b_bo_rate_cancel_per_day: 10
b2b_bo_daily_qty_per_sku: 2000
b2b_bo_daily_unique_sku_cap: 20
b2b_bo_tier_value_caps: {standard:50000, silver:100000, gold:200000, platinum:500000, diamond:0}
b2b_bo_pending_review_timeout_hours: 72
b2b_bo_split_undo_window_minutes: 10
b2b_bo_eta_default_days: 7
b2b_bo_eta_warn_days: 14
b2b_bo_cancel_grace_minutes: 5
b2b_bo_anomaly_cancel_24h: 5
b2b_bo_anomaly_qty_cap_24h: 3
```

### 5.11 Rollback

**Instant rollback (no re-deploy):**

```bash
wp option update b2b_flag_bo_system 0
# OR via UI: Admin Dashboard → ระบบ B2B → BO Flags → กด "ปิด (OFF)"
```

→ Reverts to Phase 0 hotfix (Snippet 1 V.33.7 + Snippet 15 V.7.5) — `b2b_check_order_oos()` hierarchy-aware still protects against Ticket #6266.

**Per-tier rollback:** Remove distributor IDs จาก `b2b_flag_bo_beta_distributors` array.

### 5.12 Related Files (14 touched)

| File | Version | Purpose |
|------|---------|---------|
| `[B2B] Snippet 1` | V.33.7 | `b2b_rate_limit()` atomic GET_LOCK (C2) |
| `[B2B] Snippet 2` | V.34.4 | `confirm_order` BO gate (C2) |
| `[B2B] Snippet 3` | V.41.4 | `place-order` hook (C1) + cancel grace (H4) |
| `[B2B] Snippet 11` | V.30.3 | Customer LIFF BO status + embed split view |
| `[B2B] Snippet 14` | V.1.6 | FSM 2 new states + transitions |
| `[B2B] Snippet 16` | V.1.6 | Master BO system (3497 LOC) |
| `[Admin System] DINOCO Admin Dashboard` | V.32.5 | 3 tabs + badge updater |

### 5.13 Deferred (low priority, post-beta)

- Bulk UI checkboxes ใน Backorders tab (endpoints พร้อม)
- Manual ETA extend button UI (endpoint พร้อม)
- Flag audit log (ใครเปิด/ปิด flag เมื่อไหร่)
- Beta distributor management UI
- REG-028..034 regression scenarios
- WORKFLOW-REFERENCE.md BO flow diagram

### 5.14 Commit Trail (2026-04-16)

| Commit | Scope |
|--------|-------|
| `95b50f3` | Phase 0 hotfix (Ticket #6266) — Snippet 1 V.33.5 + Snippet 15 V.7.4 |
| `05d592a` | Phase 0 polish (V.33.6/V.7.5) |
| `14ce7b4` | Phase A-D foundation — Snippet 16 V.1.1 + Snippet 14 V.1.6 (~1958 LOC) |
| `b535b90` | V.1.2 admin UI shortcodes |
| `8f1ce76` | V.1.3 pending review bug fix (WP REST meta quirk) |
| `a0d3f82` | V.1.4 banner clarity |
| `c2565c3` | V.1.5 Security Log + C3 meta hardening + LIFF split view |
| `f35f059` | Architect CRITICAL fixes (C1-C4) |
| `d1a0e3e` | Architect HIGH/MEDIUM fixes (H1-H6 + M3 + M6/M7) |
| `51c3a53` + `6f51e6f` | Docs bumps |

---

---

## Table of Contents

- [1. B2F System (Business to Factory)](#1-b2f-system-business-to-factory)
  - [1.1 Implementation Status](#11-implementation-status)
  - [1.2 Architecture Decisions](#12-architecture-decisions)
  - [1.3 Known Issues](#13-known-issues)
  - [1.4 Problem & Goal](#14-problem--goal)
  - [1.5 User Flows](#15-user-flows)
  - [1.6 Data Model](#16-data-model)
  - [1.7 Order State Machine (FSM)](#17-order-state-machine-fsm)
  - [1.8 API Design](#18-api-design)
  - [1.9 UI Wireframes](#19-ui-wireframes)
  - [1.10 Dependencies & Impact](#110-dependencies--impact)
  - [1.11 Implementation Roadmap](#111-implementation-roadmap)
  - [1.12 Additional Specs from Deep Review](#112-additional-specs-from-deep-review)
  - [1.13 Technical Specifications](#113-technical-specifications)
  - [1.14 Testing Checklist](#114-testing-checklist)
  - [1.15 Risk & Mitigation](#115-risk--mitigation)
  - [1.16 Rollback Plan](#116-rollback-plan)
- [2. Central Inventory System](#2-central-inventory-system)
  - [2.1 Problem & Goal](#21-problem--goal)
  - [2.2 User Flows](#22-user-flows)
  - [2.3 Data Model](#23-data-model)
  - [2.4 API Design](#24-api-design)
  - [2.5 UI Wireframes](#25-ui-wireframes)
  - [2.6 Dependencies & Impact](#26-dependencies--impact)
  - [2.7 Implementation Roadmap](#27-implementation-roadmap)
  - [2.8 Design Decisions](#28-design-decisions)
  - [2.9 Performance Optimization](#29-performance-optimization)
  - [2.10 Risk & Mitigation](#210-risk--mitigation)
  - [2.11 Testing Checklist](#211-testing-checklist)
  - [2.12 Rollback Plan](#212-rollback-plan)
  - [2.13 Appendices (Inventory)](#213-appendices-inventory)
- [3. Finance Dashboard](#3-finance-dashboard)
  - [3.1 Version History](#31-version-history)
  - [3.2 Page Structure](#32-page-structure)
  - [3.3 Honda BigWing Data](#33-honda-bigwing-data)
  - [3.4 Business Criteria](#34-business-criteria)
  - [3.5 Related Files](#35-related-files)
  - [3.6 Backlog](#36-backlog)
- [4. Brand Voice Pool](#4-brand-voice-pool)
  - [4.1 Version History](#41-version-history)
  - [4.2 Brands Tracked](#42-brands-tracked)
  - [4.3 REST API](#43-rest-api)
  - [4.4 Chrome Extension](#44-chrome-extension)
  - [4.5 Tab Structure](#45-tab-structure)
  - [4.6 Data Model](#46-data-model)
  - [4.7 AI Collect](#47-ai-collect)
  - [4.8 Related Files](#48-related-files)
  - [4.9 Backlog](#49-backlog)
- [5. Master Integration Plan (DINOCO x OpenClaw)](#5-master-integration-plan-dinoco-x-openclaw)
  - [5.0 Phase 0](#50-phase-0)
  - [5.0.5 Platform Limitations](#505-platform-limitations)
  - [5.0.6 Cost Estimation](#506-cost-estimation)
  - [5.0.7 Missing Pieces (Fullstack Review)](#507-missing-pieces-fullstack-review)
  - [5.1 Vision](#51-vision)
  - [5.2 Architecture Diagram](#52-architecture-diagram)
  - [5.3 Feature List](#53-feature-list)
  - [5.4 Integration Points (MCP Bridge)](#54-integration-points-mcp-bridge)
  - [5.5 New Systems to Build](#55-new-systems-to-build)
  - [5.6 Code Changes Required](#56-code-changes-required)
  - [5.7 Phase Plan (Timeline)](#57-phase-plan-timeline)
  - [5.8 AI Agent Configuration](#58-ai-agent-configuration)
  - [5.9 Dashboard Plan](#59-dashboard-plan)
  - [5.10 Risk & Rollback](#510-risk--rollback)
  - [5.11 Appendices (Master Plan)](#511-appendices-master-plan)
- [6. น้องกุ้ง Telegram Command Center](#6-น้องกุ้ง-telegram-command-center)
  - [6.1 Overview](#61-overview)
  - [6.2 Commands Reference](#62-commands-reference)
  - [6.3 Cron Jobs](#63-cron-jobs)
  - [6.4 telegram-alert.js V.2.0](#64-telegram-alertjs-v20)
  - [6.5 Architecture](#65-architecture)
  - [6.6 Environment Variables](#66-environment-variables)
  - [6.7 MongoDB Collections](#67-mongodb-collections)
  - [6.8 Security](#68-security)
- [7. Dealer Management System V.2.0](#7-dealer-management-system-v20)
- [8. Lead Pipeline V.2.0](#8-lead-pipeline-v20)
- [9. AI Chat Fixes (V.8.1)](#9-ai-chat-fixes-v81)
- [10. Docker/Deploy Updates](#10-dockerdeploy-updates-2026-04-07)
- [11. Product Hierarchy 3 ระดับ (แม่-ลูก-หลาน)](#11-product-hierarchy-3-ระดับ-แม่-ลูก-หลาน)
  - [11.1 Problem & Goal](#111-problem--goal-1)
  - [11.2 Design Decisions](#112-design-decisions)
  - [11.3 Data Model](#113-data-model)
  - [11.4 Helper Functions (Snippet 15)](#114-helper-functions-snippet-15)
  - [11.5 User Flows](#115-user-flows)
  - [11.6 API & Backend Changes](#116-api--backend-changes)
  - [11.7 UI Changes](#117-ui-changes)
  - [11.8 Files Impact Map (16 ไฟล์)](#118-files-impact-map-16-ไฟล์)
  - [11.9 Implementation Roadmap (3 Phases)](#119-implementation-roadmap-3-phases)
  - [11.10 Edge Cases & Rules](#1110-edge-cases--rules)
  - [11.11 Risk & Mitigation](#1111-risk--mitigation)
  - [11.12 Testing Checklist](#1112-testing-checklist)
  - [11.13 Rollback Plan](#1113-rollback-plan)

---

# 1. B2F System (Business to Factory)

**Status:** ⚠️ Partial (Phase 1 MVP Done, Phase 2-4 Planned)

> Feature Spec: B2F (Business to Factory) -- ระบบสั่งซื้อจากโรงงานผู้ผลิต
> Version: 3.0 | Date: 2026-03-31 | Author: Feature Architect + UX Expert + Deep Review + Implementation

## 1.1 Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| CPT & ACF (Snippet 0) | Done | 5 CPTs + ACF fields + helpers |
| Core Utilities & Flex (Snippet 1) | Done | V.6.0 -- 22 Flex builders + `b2f_liff_url()` HMAC sig + `b2f_t()` 3-language helper |
| REST API (Snippet 2) | Done | V.8.2 -- 20+ endpoints, po-cancel ใช้ FSM transition (ไม่ลบ PO), concurrent locks |
| Webhook Handler (Snippet 3) | Done | Maker commands + Admin B2F commands + self-contained Flex menu |
| Maker LIFF (Snippet 4) | Done | Shortcode `[b2f_maker_liff]` page `/b2f-maker/` |
| Admin Dashboard Tabs (Snippet 5) | Done | Orders + Makers + Credit tabs + SKU picker (grid+multi-select) |
| Order FSM (Snippet 6) | Done | 12 statuses + transitions + labels + badges |
| Credit Manager (Snippet 7) | Done | Atomic payable ops + auto hold/unhold + audit |
| B2B Snippet 1 (Bubble 3) | Done | Admin Flex carousel 3 หน้า (ใช้ Dashboard URL แทน LIFF) |
| B2B Snippet 2 (Routing) | Done | B2F routing via function_exists guard |
| Admin Dashboard (Sidebar) | Done | B2F section + scrollable sidebar |
| Bot (Maker group) | Done | @mention + text commands (ส่งของ/ดูPO) |
| Bot (Admin group) | Done | B2F commands (สั่งโรงงาน/ดูPO/สรุปโรงงาน) |
| Sync | Done | 49 snippets, name LIKE filter includes [B2F] |
| WordPress Page | Done | `/b2f-maker/` with `[b2f_maker_liff]` |

## 1.2 Architecture Decisions

> 1. **ใช้ LINE Bot ตัวเดียวกับ B2B** -- routing ตาม `group_id` แยก Flex ให้แต่ละ role (Distributor ไม่เห็น B2F, Maker ไม่เห็น B2B)
> 2. **ทุกอย่างที่ทำใน LIFF/Flex ต้องทำบน PC ได้ด้วย** -- เพิ่ม section "B2F System" ใน sidebar ของ `[Admin System] DINOCO Admin Dashboard`
> 3. **ไม่ sync กับ Zort** -- ราคาทุนอยู่ในระบบ B2F ของเราเอง
> 4. **Maker LIFF ใช้ Signed URL + JWT** -- ไม่ใช่แค่ group_id verify (reuse B2B Snippet 15 pattern)
> 5. **B2F Snippets แยกไฟล์ทั้งหมด** -- Snippet 2 (Webhook) เรียกผ่าน `function_exists()` guard, Admin Dashboard ใช้ shortcode modules แยก
> 6. **group_id isolation** -- Distributor เห็นแค่ B2B Flex, Maker เห็นแค่ B2F Flex, Admin เห็นทุกอย่าง ไม่ปนกัน

## 1.3 Known Issues

| Issue | Severity | Description |
|-------|----------|-------------|
| ~~`b2f_liff_url()` crash~~ | ~~Medium~~ | **FIXED V.1.2** -- ใช้ HMAC sig แทน JWT |
| ~~po-cancel ลบ PO~~ | ~~High~~ | **FIXED V.8.2** -- ใช้ FSM transition ไม่ลบ PO อีกต่อไป, คืนสต็อก, เก็บ audit trail |
| Debug endpoints ยังเปิดอยู่ | Low | `/debug-maker/`, `/debug-route/` เป็น public -- ต้องลบ/ปิดหลัง debug |
| `b2f_format_maker()` N+1 query | Low | นับ product_count + po_count ต่อ maker -- ช้าเมื่อ makers เยอะ |

## 1.4 Problem & Goal

### ปัญหาคืออะไร

DINOCO สั่งซื้อสินค้าจากโรงงานผู้ผลิต (Maker) ผ่านช่องทางไม่เป็นระบบ -- โทร, แชท LINE ส่วนตัว, จด memo -- ทำให้:
- ไม่มี record ว่าสั่งอะไรไปเมื่อไหร่ ราคาทุนเท่าไหร่
- ติดตามสถานะยาก -- โรงงานส่งของหรือยัง? ตรงตาม ETA ไหม?
- ตรวจรับของไม่มีหลักฐาน -- ของมาครบไหม? คุณภาพผ่านไหม?
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

## 1.5 User Flows

### 1.5.1 Admin สร้าง Purchase Order (PO)

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

### 1.5.2 Maker ยืนยัน + กรอก Expected Delivery Date

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

### 1.5.3 ระบบติดตาม (Delivery Tracking)

```
Automated Reminders (Cron)
├── ETA - 3 วัน → Flex เตือน Maker + Admin "เหลืออีก 3 วัน"
├── ETA - 1 วัน → Flex เตือน Maker + Admin "พรุ่งนี้ครบกำหนด"
├── ETA วันนี้ → Flex เตือน "วันนี้ครบกำหนดส่ง PO #XXX"
├── ETA + 1 วัน → Flex แจ้ง Admin "PO #XXX ล่าช้า 1 วัน" (สีเหลือง)
├── ETA + 3 วัน → Flex แจ้ง Admin "PO #XXX ล่าช้า 3 วัน -- กรุณาติดต่อ Maker" (สีแดง)
└── ETA + 7 วัน → Flex เตือนซ้ำทุก 3 วัน จนกว่าจะรับของหรือยกเลิก
```

### 1.5.4 Maker ส่งของ + Admin ตรวจรับ

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

### 1.5.5 PO Modification & Cancellation

```
Admin แก้ไข PO (ก่อน Maker ยืนยัน)
├── Admin เปิด PO → กดแก้ไข → เปลี่ยนจำนวน/เพิ่ม SKU/ลบ SKU
├── PO status = "amended" → auto-resubmit
├── ส่ง Flex "ใบสั่งซื้อแก้ไข (ฉบับที่ N)" → ห้อง Maker
└── Maker ต้องยืนยันใหม่

Admin ยกเลิก PO (V.8.2)
├── Admin กด "ยกเลิก PO" + ให้เหตุผล (confirm 2 ครั้ง)
├── FSM transition → cancelled (ไม่ใช่ wp_delete_post)
├── คืนสต็อก: dinoco_stock_subtract() per received SKU
├── เก็บ receiving + payment records ทั้งหมด (audit trail)
├── บันทึก: po_cancelled_reason, po_cancelled_by, po_cancelled_date
├── PO status = "cancelled" (ยัง query ได้, ไม่หายจากระบบ)
└── ส่ง Flex "ยกเลิกใบสั่งซื้อ" → ห้อง Maker + Admin

Maker ขอเลื่อนส่ง
├── Maker กดปุ่ม "ขอเลื่อนวันส่ง" → กรอกวันใหม่ + เหตุผล
├── ส่ง Flex แจ้ง Admin → Admin กด "อนุมัติ" หรือ "ไม่อนุมัติ"
├── ถ้าอนุมัติ → update ETA + Flex แจ้ง Maker
├── ถ้าไม่อนุมัติ → Flex แจ้ง Maker "กรุณาส่งตามกำหนดเดิม"
└── Track ประวัติการเลื่อน (ใช้สำหรับ Maker performance rating)
```

### 1.5.6 Payment Tracking (จ่ายเงินโรงงาน)

```
Happy Path
├── Admin เปิด PO ที่ status = "received"
├── กดปุ่ม "บันทึกการจ่ายเงิน"
├── กรอก: จำนวนเงิน, วันที่จ่าย, ช่องทาง (โอน/เช็ค/เงินสด), หมายเหตุ
├── แนบหลักฐานการจ่าย (สลิป) -- optional
├── กดยืนยัน
├── PO payment_status = "paid" (ครบ) หรือ "partial_paid" (ยังไม่ครบ)
├── ส่ง Flex "แจ้งการจ่ายเงิน" → ห้อง Maker
└── PO completed เมื่อจ่ายครบ
```

## 1.6 Data Model

### 1.6.1 CPT: `b2f_maker` (โรงงานผู้ผลิต)

| ACF Field | Type | Validation | Description |
|-----------|------|------------|-------------|
| `maker_name` | text | required, unique | ชื่อโรงงาน |
| `maker_contact` | text | | ชื่อผู้ติดต่อ |
| `maker_phone` | text | | เบอร์โทร |
| `maker_email` | email | | อีเมล |
| `maker_address` | textarea | | ที่อยู่โรงงาน |
| `maker_line_group_id` | text | | LINE Group ID ที่ Bot อยู่ |
| `maker_tax_id` | text | | เลขผู้เสียภาษี |
| `maker_bank_name` | text | | ธนาคาร |
| `maker_bank_account` | text | | เลขบัญชี |
| `maker_bank_holder` | text | | ชื่อบัญชี |
| `maker_status` | select | active/inactive | สถานะ |
| `maker_notes` | textarea | | หมายเหตุภายใน |

### 1.6.2 CPT: `b2f_maker_product` (สินค้าที่โรงงานผลิต + ราคาทุน)

**สำคัญ: นี่คือตัวเก็บราคาทุน (cost price) ต่อ SKU ต่อ Maker**

| ACF Field | Type | Validation | Description |
|-----------|------|------------|-------------|
| `mp_maker_id` | post_object (b2f_maker) | required | FK -> Maker |
| `mp_product_sku` | text | required | SKU (ตรงกับ b2b_product) |
| `mp_product_name` | text | | ชื่อสินค้า (snapshot จาก catalog) |
| `mp_unit_cost` | number | required, > 0 | **ราคาทุนต่อหน่วย (บาท)** |
| `mp_moq` | number | default: 1 | Minimum Order Quantity |
| `mp_lead_time_days` | number | default: 7 | ระยะเวลาผลิต (วัน) |
| `mp_last_order_date` | date | | สั่งล่าสุดเมื่อไหร่ |
| `mp_notes` | textarea | | หมายเหตุ (spec พิเศษ) |
| `mp_status` | select | active/discontinued | สถานะ |

> **หมายเหตุ**: SKU เดียวกันอาจผลิตได้หลาย Maker ราคาต่างกัน -> ตอน Admin สั่งจะเห็นราคาทุนของ Maker ที่เลือก
> **ไม่ sync กับ Zort** -- ข้อมูลราคาทุนอยู่ในระบบ B2F ของเราเอง

### 1.6.3 CPT: `b2f_order` (Purchase Order)

| ACF Field | Type | Validation | Description |
|-----------|------|------------|-------------|
| `po_number` | text | auto-gen, unique | PO-DNC-YYMMDD-NNN |
| `po_maker_id` | post_object (b2f_maker) | required | FK -> Maker |
| `po_status` | select | see FSM | สถานะ PO |
| `po_items` | repeater | required, min 1 | รายการสินค้า |
| -> `poi_sku` | text | required | SKU |
| -> `poi_product_name` | text | | ชื่อสินค้า (snapshot) |
| -> `poi_qty_ordered` | number | required, > 0 | จำนวนที่สั่ง |
| -> `poi_unit_cost` | number | required | **ราคาทุนต่อหน่วย (snapshot ณ วันสั่ง)** |
| -> `poi_qty_received` | number | default: 0 | จำนวนที่รับแล้ว (สะสม) |
| -> `poi_qty_rejected` | number | default: 0 | จำนวนที่ reject |
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

### 1.6.4 CPT: `b2f_receiving` (ใบรับสินค้า)

| ACF Field | Type | Validation | Description |
|-----------|------|------------|-------------|
| `rcv_po_id` | post_object (b2f_order) | required | FK -> PO |
| `rcv_number` | text | auto-gen | RCV-YYMMDD-NNN |
| `rcv_date` | date | required | วันที่รับของ |
| `rcv_items` | repeater | required | รายการที่รับ |
| -> `rcvi_sku` | text | | SKU |
| -> `rcvi_qty_received` | number | | จำนวนรับ |
| -> `rcvi_qty_rejected` | number | | จำนวน reject |
| -> `rcvi_qc_status` | select | passed/failed/partial | ผล QC |
| -> `rcvi_reject_reason` | textarea | | เหตุผล reject |
| -> `rcvi_reject_photos` | gallery | max 5 | รูปสินค้า reject |
| `rcv_admin_note` | textarea | | หมายเหตุ |
| `rcv_inspected_by` | text | | ผู้ตรวจรับ |

### 1.6.5 CPT: `b2f_payment` (การจ่ายเงินโรงงาน)

| ACF Field | Type | Validation | Description |
|-----------|------|------------|-------------|
| `pmt_po_id` | post_object (b2f_order) | required | FK -> PO |
| `pmt_maker_id` | post_object (b2f_maker) | required | FK -> Maker |
| `pmt_amount` | number | required, > 0 | จำนวนเงินที่จ่าย |
| `pmt_date` | date | required | วันที่จ่าย |
| `pmt_method` | select | transfer/cheque/cash | วิธีจ่าย |
| `pmt_reference` | text | | เลขอ้างอิง |
| `pmt_slip_image` | image | | หลักฐานการจ่าย |
| `pmt_note` | textarea | | หมายเหตุ |

### 1.6.6 ระบบเครดิตระหว่าง DINOCO กับ Maker

**เหมือน B2B Debt System** (Snippet 13) -- ทิศทางกลับด้าน:
- B2B: ตัวแทนเป็นหนี้ DINOCO (DINOCO เป็นเจ้าหนี้)
- B2F: DINOCO เป็นหนี้ Maker (DINOCO เป็นลูกหนี้)

**เพิ่ม fields ใน `b2f_maker` CPT:**

| ACF Field | Type | Validation | Description |
|-----------|------|------------|-------------|
| `maker_credit_limit` | number | default: 0 | วงเงินเครดิตที่ Maker ให้ DINOCO |
| `maker_current_debt` | number | default: 0 | ยอดค้างจ่าย Maker ปัจจุบัน (read-only) |
| `maker_credit_term_days` | number | default: 30 | เครดิตกี่วัน |
| `maker_credit_hold` | boolean | default: false | Maker ระงับเครดิต |
| `maker_credit_hold_reason` | select | auto/manual | auto = ระบบ hold เพราะเลยวงเงิน, manual = Admin hold เอง |

```php
// Atomic debt operations -- FOR UPDATE lock เหมือน B2B
function b2f_debt_add($maker_id, $amount, $po_id, $note = '') {
    // เพิ่มหนี้ DINOCO -> Maker เมื่อรับของเข้า
}

function b2f_debt_subtract($maker_id, $amount, $po_id, $note = '') {
    // ลดหนี้เมื่อจ่ายเงิน Maker
}

function b2f_recalculate_debt($maker_id) {
    // Single-SQL source of truth: sum(received) - sum(paid)
}
```

### 1.6.7 Relationships

```
b2f_maker ──1:N── b2f_maker_product  (Maker ผลิตอะไรบ้าง + ราคาทุนต่อ SKU)
b2f_maker ──1:N── b2f_order           (Maker มี PO กี่ใบ)
b2f_order ──1:N── b2f_receiving       (PO 1 ใบรับของได้หลายครั้ง)
b2f_order ──1:N── b2f_payment         (PO 1 ใบจ่ายเงินได้หลายครั้ง)
b2f_maker_product ──ref── b2b_product (SKU เดียวกับ B2B catalog)
b2f_receiving ──trigger── b2b_product (update stock เมื่อรับของเข้า)
```

## 1.7 Order State Machine (FSM)

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
    'amended'          => array('submitted' => 'system'),
    'rejected'         => array('amended' => 'admin', 'cancelled' => 'admin',
                                'submitted' => 'admin'),
    'delivering'       => array('received' => 'admin', 'partial_received' => 'admin',
                                'confirmed' => 'admin'),
    'partial_received' => array('delivering' => 'maker', 'received' => 'admin',
                                'cancelled' => 'admin'),
    'received'         => array('paid' => 'admin', 'partial_paid' => 'admin',
                                'completed' => 'admin'),
    'partial_paid'     => array('paid' => 'admin'),
    'paid'             => array('completed' => 'system'),
);
```

## 1.8 API Design

### REST Endpoints -- `/wp-json/b2f/v1/`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/makers` | admin | รายชื่อ Maker ทั้งหมด |
| POST | `/maker` | admin | สร้าง/แก้ไข Maker |
| POST | `/maker/delete` | admin | ลบ Maker (soft delete) |
| GET | `/maker-products/{maker_id}` | admin | SKU ที่ Maker ผลิต + ราคาทุน + `hierarchy_meta` (V.9.2: missing leaves per SET) |
| POST | `/maker-product` | admin | สร้าง/แก้ไข Maker-SKU mapping |
| POST | `/maker-product/delete` | admin | ลบ mapping |
| POST | `/create-po` | admin | สร้าง Purchase Order |
| GET | `/po-detail/{po_id}` | admin/maker | ดูรายละเอียด PO |
| POST | `/po-update` | admin | แก้ไข PO |
| POST | `/po-cancel` | admin | ยกเลิก PO (V.8.2: FSM transition, คืนสต็อก, เก็บ audit trail) |
| POST | `/maker-confirm` | maker (LIFF) | Maker ยืนยัน PO + ETA |
| POST | `/maker-reject` | maker (LIFF) | Maker ปฏิเสธ PO |
| POST | `/maker-reschedule` | maker (LIFF) | Maker ขอเลื่อนวันส่ง |
| GET | `/maker-po-list` | maker (LIFF) | Maker ดู PO ของตัวเอง |
| POST | `/receive-goods` | admin | ตรวจรับสินค้า |
| POST | `/record-payment` | admin | บันทึกการจ่ายเงิน |
| GET | `/po-history` | admin | ประวัติ PO |
| GET | `/dashboard-stats` | admin | KPI สำหรับ Dashboard |

### Permission Model

| Role | Access | Auth Method |
|------|--------|-------------|
| **Admin** (`manage_options`) | ทุก endpoint | WordPress login / nonce |
| **Maker** | เฉพาะ PO ของตัวเอง | **Signed URL + JWT** |
| **System** (cron) | reminders, overdue alerts | Internal |

### Cron Jobs

| Schedule | Job | Description |
|----------|-----|-------------|
| Daily **08:30** | `b2f_delivery_reminder` | เตือน PO ใกล้ ETA (D-3, D-1, D-day) |
| Daily **09:00** | `b2f_overdue_check` | แจ้ง PO เลย ETA |
| Daily **09:30** | `b2f_maker_noresponse` | เตือน Maker ที่ไม่ตอบ 24h, 48h, escalate 72h |
| Daily 18:00 | `b2f_daily_summary` | สรุปประจำวัน -> Admin Group |
| Weekly Mon 09:00 | `b2f_payment_due_check` | PO ค้างจ่ายใกล้ครบ credit term |
| Weekly Mon 09:00 | `b2f_weekly_summary` | สรุปรายสัปดาห์ |

### Rate Limiting

| Endpoint | Limit |
|----------|-------|
| `/create-po` | 10 req/min per admin |
| `/maker-confirm` | 5 req/min per group |
| `/receive-goods` | 5 req/min per admin |

## 1.9 UI Wireframes

(See original B2F-FEATURE-SPEC.md sections 6.1-6.7 for full wireframe ASCII art: B2F Admin Dashboard, สร้าง PO LIFF, Maker LIFF ยืนยัน PO, ตรวจรับสินค้า LIFF, Maker Management, Maker Product Management)

### Mobile-First UX Rules

- **Single-column layout** -- ห้ามใช้ 2-column ใน LIFF
- **Sticky bottom action bar** -- ปุ่ม "ยืนยัน" อยู่ล่างสุดเสมอ
- **Touch targets** -- ปุ่มสูงอย่างน้อย 48px
- **Loading states** -- ทุก API call มี skeleton/spinner
- **Double-press lock** -- ปุ่มที่กดแล้ว disable + spinner
- **Offline detection** -- แสดง banner + save draft ลง localStorage
- **Date picker** -- native `<input type="date">` set min=tomorrow
- **Camera** -- `<input type="file" accept="image/*" capture="environment">` + compress < 1MB

## 1.10 Dependencies & Impact

### Files ที่ต้องสร้างใหม่

| File | Purpose |
|------|---------|
| `[B2F] Snippet 0: CPT & ACF Registration` | register_post_type + acf_add_local_field_group สำหรับ 5 CPTs |
| `[B2F] Snippet 1: Core Utilities & Flex Builders` | Helpers, Flex templates, LIFF URL builder |
| `[B2F] Snippet 2: REST API` | CRUD Maker, PO, Receiving, Payment endpoints |
| `[B2F] Snippet 3: Webhook Handler & Bot Commands` | Maker commands + Admin B2F commands |
| `[B2F] Snippet 4: Maker LIFF Pages` | ยืนยัน PO, ดูประวัติ, ขอเลื่อน |
| `[B2F] Snippet 5: Admin Dashboard Tabs` | shortcode modules |
| `[B2F] Snippet 6: Order State Machine` | FSM class |
| `[B2F] Snippet 7: Credit Transaction Manager` | Atomic payable operations |
| `[B2F] Snippet 11: Cron Jobs & Reminders` | V.2.1 -- Reminders, overdue, summaries + rejected PO escalation (7 days) |

### Side Effects

| Risk | Mitigation |
|------|------------|
| CSS conflict | Scope CSS ด้วย prefix `.b2f-*` |
| JavaScript global scope | IIFE pattern |
| DB query performance | Index `po_status`, `po_maker_id`, `po_expected_date` |
| LINE push quota | Batch notifications เป็น carousel |
| Concurrent receiving | Transient lock 60s |
| ข้อมูลราคาทุนเป็นความลับ | Admin-only access |

## 1.11 Implementation Roadmap

### Phase 1: MVP -- สั่งซื้อ + Maker ยืนยัน + ราคาทุน
### Phase 2: ตรวจรับ + Inventory Update
### Phase 3: Payment + Cron + Reporting
### Phase 4: Polish + Advanced (Amendment, Reschedule, Reorder, CSV, Performance Report, AI integration)

## 1.12 Additional Specs from Deep Review

### API Request/Response Examples

```
POST /wp-json/b2f/v1/create-po
Request: {
  maker_id: 123,
  items: [
    { sku: "DNCCB500X001IRONBR", qty: 10 },
    { sku: "SKU-002", qty: 20 }
  ],
  requested_date: "2026-04-10",
  note: "ต้องการด่วน"
}

Response (success): {
  success: true,
  po_id: 456,
  po_number: "PO-DNC-260330-001",
  total_amount: 20225.00,
  items: [...]
}

Error codes: CREDIT_HOLD, DUPLICATE_PO, INVALID_MAKER, INVALID_SKU, MISSING_ITEMS
```

## 1.13 Technical Specifications

### PO Number Generation

```php
function b2f_generate_po_number() {
    global $wpdb;
    $today = date('ymd');
    $count = (int) $wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM {$wpdb->posts}
         WHERE post_type = 'b2f_order'
         AND DATE(post_date) = %s",
        date('Y-m-d')
    ));
    return sprintf('PO-DNC-%s-%03d', $today, $count + 1);
}
```

### Status Badge Color Map

| Status | สี | Badge Class | Thai Label |
|--------|-----|------------|------------|
| `draft` | Gray #6b7280 | `.b2f-badge-gray` | แบบร่าง |
| `submitted` | Blue #3b82f6 | `.b2f-badge-blue` | ส่งแล้ว |
| `confirmed` | Green #22c55e | `.b2f-badge-green` | ยืนยันแล้ว |
| `amended` | Purple #a855f7 | `.b2f-badge-purple` | แก้ไขแล้ว |
| `rejected` | Red #ef4444 | `.b2f-badge-red` | ปฏิเสธ |
| `delivering` | Cyan #06b6d4 | `.b2f-badge-cyan` | กำลังส่ง |
| `received` | Emerald #10b981 | `.b2f-badge-emerald` | รับครบแล้ว |
| `partial_received` | Amber #f59e0b | `.b2f-badge-amber` | รับบางส่วน |
| `paid` | Green #22c55e | `.b2f-badge-green` | จ่ายแล้ว |
| `partial_paid` | Amber #f59e0b | `.b2f-badge-amber` | จ่ายบางส่วน |
| `completed` | Slate #64748b | `.b2f-badge-slate` | เสร็จสิ้น |
| `cancelled` | Red #ef4444 | `.b2f-badge-red` | ยกเลิก |

## 1.14 Testing Checklist

- [ ] สร้าง Maker + เพิ่ม SKU + ราคาทุน
- [ ] แก้ไขราคาทุน -> PO ใหม่ใช้ราคาใหม่, PO เก่าไม่เปลี่ยน (snapshot)
- [ ] ลบ Maker ที่มี PO -> soft delete (inactive)
- [ ] สร้าง PO -> ราคาทุนถูกต้อง, Flex ส่งสำเร็จ, Duplicate check ทำงาน
- [ ] Maker ยืนยัน/ปฏิเสธ -> status เปลี่ยนถูก, Flex แจ้ง Admin
- [ ] รับครบ/บางส่วน -> inventory updated, QC + รูป logged
- [ ] จ่ายครบ/บางส่วน -> paid/partial_paid, จ่ายเกิน blocked
- [ ] Cron reminders (D-3, D-1, D-day, overdue, no-response)
- [ ] Mobile LINE in-app browser ใช้ได้ทุกหน้า
- [ ] กดปุ่มซ้ำ -> ไม่ duplicate

## 1.15 Risk & Mitigation

| Risk | Mitigation |
|------|------------|
| Maker ไม่ถนัด LINE Bot | Flex ง่ายที่สุด, ปุ่มใหญ่ชัดเจน, fallback โทรแจ้ง |
| LINE push quota หมด | Batch notifications, carousel Flex |
| Admin สร้าง PO ซ้ำ | Dedup check: Maker+SKU+qty ภายใน 5 นาที |
| Inventory race condition กับ B2B | Transient lock, log ทุก mutation |
| ข้อมูลราคาทุนรั่ว | Admin-only, ข้อมูลเป็นความลับเหมือน Finance |

## 1.16 Rollback Plan

### Kill Switch

```php
define('B2F_DISABLED', true);
```

ทุก B2F snippet เช็ค `if (defined('B2F_DISABLED') && B2F_DISABLED) return;` บรรทัดแรก

| Phase | Method |
|-------|--------|
| Phase 1 | Deactivate B2F snippets -> ไม่กระทบ B2B |
| Phase 2 | Revert Snippet 3+4, ลบ receiving records |
| Phase 3 | Revert cron snippet, unschedule WP cron events |
| Phase 4 | Revert individual features |

---

# 2. Central Inventory System

**Status:** ⚠️ Partial (Phase 1-3 Done, Phase 4-5 In Progress)

> Feature Spec: Central Inventory System
> Version: 5.0 | Date: 2026-04-04 | Author: Feature Architect + Fullstack + Tech Lead + DB Expert + Production Safety + Final Sign-off

## 2.1 Problem & Goal

### ปัญหา
1. **ไม่มีจำนวนสต็อกจริง** -- ระบบปัจจุบันมีแค่ toggle `in_stock/out_of_stock`
2. **B2F receive-goods ไม่เพิ่มสต็อก** -- รับของเข้ามาแค่ set `in_stock` (binary)
3. **B2B shipped ไม่ตัดสต็อก** -- ส่งของออกแต่ไม่หักจำนวน
4. **ไม่มี audit trail** -- Admin ปรับสต็อกแต่ไม่มี log
5. **ไม่มี physical count** -- ไม่มีระบบนับสต็อกจริง (Dip Stock)
6. **ตัวแทนเห็นแค่ toggle** -- ไม่มี "ใกล้หมด" warning

### Success Metrics

| Metric | Target |
|--------|--------|
| สต็อกตรงกับของจริง (หลัง Dip Stock) | +-5% variance |
| เวลาตรวจนับ (Dip Stock) | < 2 ชม. / ครั้ง |
| Admin response time เมื่อสินค้าใกล้หมด | < 1 ชม. |
| จำนวนครั้งที่ลูกค้าสั่งของหมดสต็อก | ลดลง 80% |
| Auto stock_status accuracy | 100% |

## 2.2 User Flows

(See original INVENTORY-FEATURE-SPEC.md sections 2.1-2.7 for complete flows: Auto Stock Addition, Auto Stock Deduction, Manual Stock Adjustment, Dip Stock, Distributor Stock View, Backorder System, BO Display)

### Key Flow Summaries

- **B2F Receive -> Auto Stock Add**: `dinoco_stock_add()` per SKU after receive-goods
- **B2B awaiting_confirm -> Auto Stock Deduct (DD-4)**: Hook priority 5, auto-cancel 30 min
- **Manual Adjust**: Admin add/subtract with required reason
- **Dip Stock**: Session-based physical count, variance report, approve adjustment
- **Distributor View**: badge เขียว/เหลือง/แดง (ไม่เห็น stock_qty)
- **Backorder ETA**: คำนวณอัตโนมัติจาก B2F PO + buffer days

## 2.3 Data Model

### ALTER TABLE `dinoco_products`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `stock_qty` | INT UNSIGNED | 0 | จำนวนสต็อกจริง |
| `low_stock_threshold` | INT UNSIGNED | 10 | Threshold "ใกล้หมด" |
| `reorder_point` | INT UNSIGNED | 5 | จุดสั่งซื้อใหม่ |
| `last_dip_stock_date` | DATE | NULL | วันนับสต็อกล่าสุด |
| `bo_eta_buffer_days` | TINYINT UNSIGNED | 0 | Buffer วันเพิ่มจาก PO ETA |
| `bo_eta_override` | DATE | NULL | Admin override ETA |
| `bo_note` | VARCHAR(255) | NULL | หมายเหตุ BO |
| `manual_hold` | TINYINT(1) | 0 | Admin ล็อกสต็อก |
| `manual_hold_reason` | VARCHAR(255) | NULL | เหตุผล manual hold |
| `stock_updated_at` | DATETIME | NULL | แก้ล่าสุดเมื่อไหร่ |

### NEW TABLE `dinoco_stock_transactions`

Transaction types: `b2f_receive`, `b2b_reserved`, `b2b_shipped`, `b2b_cancel_return`, `manual_add`, `manual_subtract`, `dip_stock_adjust`, `initial_set`

### NEW TABLE `dinoco_dip_stock` + `dinoco_dip_stock_items`

(See original INVENTORY-FEATURE-SPEC.md sections 3.2-3.4 for complete CREATE TABLE statements)

## 2.4 API Design

### Namespace: `dinoco-stock/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stock/list` | รายการสินค้า + stock_qty + status |
| GET | `/stock/detail/{sku}` | รายละเอียด + transaction history |
| POST | `/stock/adjust` | Manual adjust (add/subtract) |
| POST | `/stock/bulk-adjust` | Bulk adjust หลาย SKU |
| GET | `/stock/transactions` | Transaction log |
| POST/GET | `/stock/settings` | Update/Get settings |
| POST | `/dip-stock/start` | เริ่ม session นับสต็อก |
| GET | `/dip-stock/current` | ดึง session ปัจจุบัน |
| POST | `/dip-stock/count` | บันทึกจำนวนนับ |
| POST | `/dip-stock/approve` | Approve adjustment |
| GET | `/dip-stock/history` | ประวัติ Dip Stock |
| GET | `/stock/bo-status` | สินค้าหมดสต็อก + ETA + PO |
| POST | `/stock/bo-update` | Update BO eta/buffer/note per SKU |

### Core PHP Functions

```php
dinoco_stock_add( $sku, $qty, $type, $ref_type, $ref_id, $reason )
dinoco_stock_subtract( $sku, $qty, $type, $ref_type, $ref_id, $reason )
dinoco_stock_set( $sku, $qty, $type, $ref_type, $ref_id, $reason )
dinoco_stock_get( $sku )
dinoco_stock_auto_status( $sku )
dinoco_stock_recalculate( $sku )
```

All use atomic `FOR UPDATE` lock pattern (same as debt system).

## 2.5 UI Wireframes

(See original INVENTORY-FEATURE-SPEC.md sections 5.1-5.5 for complete ASCII wireframes: Inventory Dashboard Tab, Stock Adjustment Modal, Stock Detail Panel, Dip Stock Page, B2B Catalog Stock Badge)

## 2.6 Dependencies & Impact

### Files ที่ต้องแก้ไข

- `[B2B] Snippet 15`: ALTER TABLE + CREATE TABLE
- `[B2F] Snippet 2`: เพิ่ม `dinoco_stock_add()` ใน receive-goods
- `[B2B] Snippet 2`: Hook stock deduction + auto-cancel
- `[B2B] Snippet 3`: เพิ่ม stock_display ใน catalog
- `[B2B] Snippet 4`: Stock badge UI
- `[Admin System] DINOCO Global Inventory Database`: Stock Management tab + Dip Stock page

### Production Deploy Order

Step 1: Database -> Step 2: FSM Update -> Step 3: OOS Migration -> Step 4: Deploy Stock Functions + Hooks -> Step 5: Initial Stock Count (Admin ทำ Dip Stock) -> Step 6: Auto-status เริ่มทำงาน

## 2.7 Implementation Roadmap

### Phase 1: MVP -- Stock Quantity Foundation (5-7 วัน) -- Done V.31.0
### Phase 2: Distributor View + Alerts (3-4 วัน)
### Phase 3: Dip Stock + Polish (4-5 วัน) -- Done
### Phase 4: Reserved Qty + Stock Conflict + Reorder Alert + AI (5-6 วัน) -- Done 2026-04-04
### Phase 5: Multi-Warehouse + Valuation + Forecasting (5-7 วัน) -- Done V.5.0

## 2.8 Design Decisions

### DD-1: Single Source of Truth -> Custom Table + Dual-Write
`dinoco_products` custom table เป็น source of truth, dual-write to ACF postmeta for backward compat.

### DD-2: OOS Memory -> Deprecate, ใช้ qty-based + Manual Hold Flag
Fields: `manual_hold`, `manual_hold_reason`, `manual_hold_by`. auto_status logic based on qty + threshold + hold flag.

### DD-3: Deploy Safety -> Flag `dinoco_inv_initialized`
Auto-status cron skip จนกว่า Admin ทำ Dip Stock ครั้งแรก.

### DD-4: Stock Deduction ตอน `awaiting_confirm` + Auto-cancel 30 นาที
Hook `b2b_order_status_changed` priority 5. Walk-in ไม่มี auto-cancel. SKU Set ตัด children ทุกตัว.

### DD-5: Cache Invalidation
`delete_transient('b2b_sku_data_map')` เมื่อ stock เปลี่ยน.

### DD-6: dbDelta Pattern ไม่ใช่ raw ALTER TABLE

## 2.9 Performance Optimization

- PO-1: Composite index `(is_active, stock_status, stock_qty)`
- PO-2: Single aggregate query แทน N+1 loop
- PO-3: Transient cache สำหรับ reserved_qty (1 min TTL)
- PO-4: Selective API response (`?fields=` parameter)
- PO-5: Pagination สำหรับ Stock List

## 2.10 Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| stock_qty ไม่ตรง (race condition) | สูง | `FOR UPDATE` lock |
| Migration ผิดพลาด | สูง | `ADD COLUMN ... DEFAULT 0` |
| stock_qty เริ่มที่ 0 ทุกตัว | กลาง | Dip Stock ครั้งแรก (initial count) |
| ตัวแทนเห็น stock_qty | สูง | Code review: ห้าม return ใน distributor endpoint |

## 2.11 Testing Checklist

(See original INVENTORY-FEATURE-SPEC.md section 9 for complete checklist: Phase 1 Tests 20+, Phase 2 Tests 7+, Phase 3 Tests 11+, Security Tests 5+)

## 2.12 Rollback Plan

- **Phase 1**: Disable stock hooks -> กลับเป็น manual toggle
- **Phase 2**: ลบ stock_display, ใช้ stock_status เดิม
- **Phase 3**: DROP dip_stock tables (standalone feature)
- **Data Safety**: ไม่ลบ column/table เดิม, backward compatible

## 2.13 Appendices (Inventory)

### Appendix A: stock_status Auto-Update Logic

```php
function dinoco_stock_auto_status( $sku ) {
    if ( ! get_option( 'dinoco_inv_initialized', false ) ) return;
    // ... query stock_qty, threshold, manual_hold
    // manual_hold=1 -> force out_of_stock
    // qty=0 -> out_of_stock
    // qty<=threshold -> in_stock (low_stock computed in API layer)
    // qty>threshold -> in_stock
    // Sync to b2b_product CPT (dual write)
    // delete_transient('b2b_sku_data_map')
}
```

### Appendix B: SKU Relations & Stock Deduction

- Parent SKU (set) ไม่เก็บ stock_qty ของตัวเอง
- Parent stock = MIN(children stock)
- Deduct children เมื่อสั่ง set, validate ครบก่อน deduct
- `dinoco_stock_deduct_for_order()` / `dinoco_stock_return_for_order()` with regex parse

---

# 3. Finance Dashboard

**Status:** ✅ Implemented (V.3.16)

> [Admin System] DINOCO Admin Finance Dashboard
> **Shortcode:** `[dinoco_admin_finance]` | **DB_ID:** 1158 | **Version:** V.3.16
> วันที่สร้าง: 2026-03-28 | อัพเดทล่าสุด: 2026-03-29

หน้า Finance Dashboard สำหรับแอดมินบัญชี/ผู้บริหาร DINOCO แสดงข้อมูลการเงิน หนี้ รายได้ ตัวแทนจำหน่าย แผนที่เครือข่าย และ AI วิเคราะห์ความเสี่ยง

เพิ่มเป็น tab "การเงิน" ใน Admin Dashboard (sidebar section B2B System)

## 3.1 Version History

| Version | Commit | สิ่งที่ทำ |
|---------|--------|----------|
| V.1.0 | `bbf5a29` | สร้างไฟล์ใหม่ -- KPI 8 กล่อง, กราฟ 3 ตัว, ตาราง 2 ตัว, Order Pipeline |
| V.2.0 | `ca830b3` | เพิ่มตารางรายได้ตัวแทน, แผนที่ภาค (SVG blob), AI Risk Assessment (Claude) |
| V.3.0 | `31abbf9` | Rewrite UI -- ลดขนาด KPI, เรียงลำดับหนี้ก่อนรายได้, AI return JSON, Honda BigWing context |
| V.3.2 | `42f879a` | เปลี่ยนเป็น Leaflet map + AI tips กระจายทั่วหน้า |
| V.3.3 | `f6fa1a1` | AI prompt rewrite -- ที่ปรึกษาบริหารธุรกิจอาวุโส, BigWing 22 สาขา 18 จังหวัดจริง |
| V.3.4 | `7607259` | แก้ bug 4 ตัว + Quick Wins 5 ตัว |
| V.3.5 | `81f8a9d` | SVG map ไทย 77 จังหวัดจริง (จาก GeoJSON) |
| V.3.6 | `0239487` | Region tabs zoom + stats panel ข้างแผนที่ |
| V.3.7 | `d17d58f` | ปรับขนาด SVG dynamic ตามภาค |
| V.3.8 | `7ad6e1b` | Map stats compact grid + AI API key check + debug info |
| V.3.9 | `659df60` | Province potential data ศักยภาพ BigBike + tooltip คำแนะนำ |
| V.3.10 | `5e9f45e` | Map layout 48:52 + AI timeout 60s + compact data |
| V.3.11 | `c53fe2a` | Province recs list + map fullscreen + AI tip overflow fix |
| V.3.12 | `0f341d5` | ตารางคู่แข่ง + Seasonal + tooltip fixed position |
| V.3.13 | `8d6ed41` | AI ไม่โหลดอัตโนมัติ -- ใช้ cache + กดปุ่มวิเคราะห์เอง |
| V.3.14 | `391234a` | ตาราง Brand Sentiment + max_tokens 8192 + cache fix |
| V.3.15 | `4f600e5` | Province recs ใช้ข้อมูลจริง + เกณฑ์ 20K + AI timeout 90s |
| V.3.16 | `4248994` | ลด AI prompt 70% แก้ timeout -- JSON schema กระชับ |

## 3.2 Page Structure

### 1. KPI Cards (10 กล่อง)

**Row 1 -- หนี้:**

| KPI | ข้อมูล |
|-----|--------|
| ยอดหนี้ค้างชำระรวม | SUM(current_debt) ทุก distributor |
| ยอดเกินกำหนด (Overdue) | บิลที่เลย due_date + จำนวนบิล |
| รอชำระ (ยังไม่เกินกำหนด) | บิลที่ยังไม่ถึงกำหนด |
| ระงับเครดิต (Credit Hold) | จำนวนร้านที่ถูก hold |
| อัตราเก็บหนี้ % | paid / (paid + overdue + awaiting) |

**Row 2 -- รายได้:**

| KPI | ข้อมูล |
|-----|--------|
| รายได้วันนี้ | ยอด order paid/shipped/completed วันนี้ |
| รายได้เดือนนี้ + MoM% | ยอดเดือน + badge % เปลี่ยนแปลง |
| รายได้รวมทั้งปี | ยอดสะสม YTD |
| เก็บเงินได้เดือนนี้ | actual collected |
| ยอดสั่งเฉลี่ย (AOV) | revenue_month / orders_month |

### 2. Debt Aging + ตัวแทนหนี้สูงสุด
### 3. Revenue Trend + การชำระล่าสุด
### 4. ตัวแทนเงียบ (Churn Warning)
### 5. Order Pipeline + Rank Revenue
### 6. รายได้ตัวแทนจำหน่าย (Full Width)
### 7. แผนที่เครือข่ายตัวแทน (SVG Map 77 จังหวัด)
### 8. คำแนะนำ AI + Province Coverage (7 ระดับ)
### 9. AI วิเคราะห์ความเสี่ยง & โอกาส (Claude Sonnet 4, cache 1 ชม., กดปุ่มวิเคราะห์เอง)

#### AI Output (6 sections):

| Section | แสดงอะไร |
|---------|----------|
| Overview | Score 0-100 + สถานะ |
| Expansion | จังหวัดควรขยาย + BigWing note |
| Risks | ตัวแทนเสี่ยง + severity + action |
| Strategy | กลยุทธ์ short/long-term + ROI |
| Competitors | เปรียบเทียบ SRC, F2MOTO, BMMOTO, MOTOSkill, H2C |
| Brand Sentiment | อันดับ 6 แบรนด์จากเสียงลูกค้า |

## 3.3 Honda BigWing Data

22 สาขา ใน 18 จังหวัด (อ้างอิง: thaihonda.co.th/hondabigbike/distributors, อัพเดท 2026-03-28)

| ภาค | สาขา |
|-----|------|
| กรุงเทพฯ | พระราม 3, ธนบุรี, รามอินทรา, ราชพฤกษ์ (4 สาขา) |
| เหนือ | เชียงใหม่, เชียงราย, นครสวรรค์, พิษณุโลก |
| อีสาน | ขอนแก่น, โคราช, อุดรธานี, อุบลฯ, บุรีรัมย์ |
| กลาง | ลพบุรี, อยุธยา |
| ตะวันออก | พัทยา (ชลบุรี), ระยอง |
| ตะวันตก | กาญจนบุรี, หัวหิน (เพชรบุรี) |
| ใต้ | ภูเก็ต, หาดใหญ่ (สงขลา), สุราษฎร์ธานี |

## 3.4 Business Criteria

| เกณฑ์ | ค่า | ใช้ที่ไหน |
|-------|-----|----------|
| ยอดสั่งขั้นต่ำ/เดือน | 20,000 B | Province recs -- ต่ำกว่า = flag |
| สินค้าเริ่มต้น | กล่องหลัง 5,300 B / กันล้ม 7,900 B | ~3-4 ชิ้น/เดือนขั้นต่ำ |

## 3.5 Related Files

| ไฟล์ | หน้าที่ |
|------|--------|
| `[Admin System] DINOCO Admin Finance Dashboard` (DB_ID: 1158) | Snippet หลัก |
| `[Admin System] DINOCO Admin Dashboard` (DB_ID: 21) | Parent -- tab "การเงิน" |
| `[Admin System] AI Provider Abstraction` (DB_ID: 1040) | Claude/Gemini API wrapper |
| `thailand-provinces.svg` | SVG แผนที่ 77 จังหวัด |
| `[Admin System] DINOCO Brand Voice Pool` (DB_ID: 1159) | Brand Voice -- เสียงลูกค้า |

## 3.6 Backlog

### Priority สูง
- Bookmarklet สำหรับเก็บเสียงลูกค้าจริงจาก Facebook
- เชื่อม Finance AI กับ Brand Voice data จริง
- ลบ test_ai endpoint

### Priority กลาง
- Product analytics (SKU/สินค้าขายดี)
- Cash flow forecast
- Export CSV/PDF
- Date range filter

### Priority ต่ำ
- Profit margin (ต้องเพิ่ม cost_price)
- Rank history tracking
- Auto-refresh
- Browser Extension (แทน Bookmarklet ถ้าไม่พอ)

---

# 4. Brand Voice Pool

**Status:** ✅ Implemented (V.2.2)

> [Admin System] DINOCO Brand Voice Pool
> **Shortcode:** `[dinoco_brand_voice]` | **DB_ID:** 1159 | **Version:** V.2.2
> วันที่สร้าง: 2026-03-29

ระบบเก็บเสียงลูกค้าจากโซเชียลมีเดีย เปรียบเทียบแบรนด์ DINOCO กับคู่แข่ง 5 ราย

เพิ่มเป็น tab "Brand Voice" ใน Admin Dashboard (sidebar section Marketing)

## 4.1 Version History

| Version | Commit | สิ่งที่ทำ |
|---------|--------|----------|
| V.1.0 | `1efde3f` | สร้าง CPT + form + list + stats + เพิ่ม tab ใน Dashboard |
| V.1.1 | `8b5c00b` | AI รวบรวมเสียงลูกค้าอัตโนมัติ -- กดปุ่มเดียว |
| V.1.2 | `329827d` | ระบุกลุ่ม Facebook/YouTube/TikTok ที่ติดตาม |
| V.1.3 | `26627c6` | แก้ PHP syntax error + ลด entries 25->10 + max_tokens fix |
| V.1.4 | `6d8b0fd` | UI ภาษาไทย + highlight DINOCO + เพิ่ม % เชิงลบ |
| V.1.5 | `f731d3e` | บังคับ categories จาก list + กราฟ top 8 |
| V.1.6 | `1030351` | Bookmarklet เก็บเสียงลูกค้าจากโซเชียลได้ทันที |
| V.1.7 | `3ee7e0f` | แก้ Bookmarklet hash ให้เปิด Brand Voice tab ถูกต้อง |
| V.2.0 | `52152c2` | REST API + Chrome Extension สำหรับเก็บข้อมูลจากโซเชียล |
| V.2.1 | `52ba15a` | One-click: AI วิเคราะห์ Post+Comments แยก entry อัตโนมัติ |
| V.2.2 | `8919e36` | Security fix: batch, sanitize, dedup, AI validation, API key revoke, timeout |
| V.2.3 | - | AI prompt upgrade + ผู้สนับสนุน + Negative Alert + categories เพิ่ม |

## 4.2 Brands Tracked

| แบรนด์ | คำอธิบาย |
|--------|---------|
| **DINOCO** | อะไหล่แต่ง Honda BigBike จำหน่ายผ่านตัวแทน+BigWing |
| **SRC** | Sriracha (Snowface Co.) -- ผู้นำตลาด |
| **F2MOTO** | กำลังโต เน้น online |
| **BMMOTO** | เน้น Honda CB/Rebel ราคากลาง |
| **MOTOSkill** | Premium เน้น touring |
| **H2C** | Honda 2 wheelers Customization -- ของ Honda เอง ขายใน BigWing |

## 4.3 REST API

Base: `/wp-json/brand-voice/v1/`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/entries` | API Key | สร้าง entry เดียว |
| POST | `/entries/batch` | API Key | สร้าง entries หลายอัน (max 50) |
| POST | `/entries/ai-bulk` | API Key | รับ post+comments -> AI วิเคราะห์แยก entry |
| GET | `/meta` | API Key | ดึง brands/categories/models/platforms |
| POST | `/api-keys/generate` | WP Admin | สร้าง API Key ใหม่ |

Auth header: `X-BV-API-Key: bvk_...`
Rate limit: 60 req/min per key

## 4.4 Chrome Extension

| File | Description |
|------|-------------|
| `manifest.json` | Manifest V3, permissions: activeTab + storage |
| `content.js` | ดึงข้อมูลจาก Facebook/YouTube/TikTok/Pantip/IG |
| `popup.html` | UI เลือก brand/sentiment/category |
| `popup.js` | Logic ส่งข้อมูลผ่าน REST API |

## 4.5 Tab Structure

### Tab 1: Dashboard (default)
- แหล่งที่ติดตาม, AI รวบรวม, KPI 4 กล่อง, เปรียบเทียบแบรนด์, แหล่งที่มา (Donut), หมวดที่พูดถึง (Bar top 8)

### Tab 2: เสียงลูกค้า
- ตาราง entries + Filter + Row เชิงลบ highlight สีแดง

### Tab 3: เพิ่ม Manual
- Form กรอกข้อมูลเอง + Auto-detect platform + Batch mode

### Tab 4: Bookmarklet
- ลาก -> เลือกข้อความ -> กด -> บันทึก, Auto-detect platform

## 4.6 Data Model

CPT: `brand_voice`

| Field | Type | คำอธิบาย |
|-------|------|---------|
| `bv_brands` | Array | แบรนด์ที่พูดถึง |
| `bv_content` | Text | ข้อความเต็ม |
| `bv_summary` | Text | สรุป 1 บรรทัด |
| `bv_sentiment` | Select | positive / neutral / negative / mixed |
| `bv_intensity` | Number 1-5 | ความรุนแรง |
| `bv_categories` | Array | หมวด (9 รายการ) |
| `bv_platform` | Select | facebook_group / youtube / tiktok / อื่นๆ |
| `bv_source_url` | URL | ลิงก์ต้นทาง |
| `bv_source_name` | Text | ชื่อกลุ่ม/ช่อง |
| `bv_post_date` | Date | วันที่โพสต์ |
| `bv_models` | Array | รุ่นรถ |
| `bv_entry_method` | Select | manual / ai_generated |

Categories (9): quality, price, design, fitment, service, shipping, warranty, availability, comparison

## 4.7 AI Collect

- กดปุ่ม -> Claude สร้าง 10 entries
- Cache 6 ชม., กด "รวบรวมใหม่" bypass cache
- **ข้อจำกัด**: ข้อมูลจาก AI = ประมาณการจาก knowledge ไม่ใช่ scrape จริง

## 4.8 Related Files

| ไฟล์ | หน้าที่ |
|------|--------|
| `[Admin System] DINOCO Brand Voice Pool` (DB_ID: 1159) | Snippet หลัก |
| `[Admin System] DINOCO Admin Dashboard` (DB_ID: 21) | Parent -- tab "Brand Voice" |
| `[Admin System] AI Provider Abstraction` (DB_ID: 1040) | Claude API wrapper |
| `brand-voice-extension/` | Chrome Extension (Manifest V3) |

## 4.9 Backlog

### Phase 2 (ต่อยอด)
1. ~~**Bookmarklet**~~ -- Done V.1.6
2. ~~**Browser Extension**~~ -- Done V.2.0
3. **เชื่อม Finance AI** -- ใช้ Brand Voice data จริงแทน knowledge
4. **Sentiment trend chart** -- แนวโน้มรายสัปดาห์/เดือน
5. **Word cloud** -- คำที่พูดถึงบ่อย
6. **LINE alert** -- แจ้งเมื่อ negative spike
7. **Response tracking** -- DINOCO ตอบกลับหรือยัง
8. **Influencer tagging** -- คน influence สูง weight มากกว่า

---

# 5. Master Integration Plan (DINOCO x OpenClaw)

**Status:** 📋 Planned (Phase 0 pending)

> Created: 2026-03-29 | Updated: 2026-03-30
> Status: FINAL -- Single source of truth for the entire integration project
> Supersedes: INTEGRATION-ARCHITECTURE.md, shimmering-floating-crane.md

## 5.0 Phase 0

> **Meta App Review เป็น Hard Blocker ที่ใช้เวลา 1-4 สัปดาห์**

### ทำทันที (วันที่ 1)

| # | งาน | รายละเอียด | เวลา |
|---|-----|-----------|------|
| 0.1 | **Submit Meta App Review** | ขอ permissions: `pages_messaging`, `pages_manage_metadata`, `instagram_manage_messages` | 0.5 วัน |
| 0.2 | **IG Business Account** | ตรวจว่า link กับ Facebook Page แล้ว | 0.5 วัน |
| 0.3 | **Setup Hetzner VPS** | 4GB RAM ขั้นต่ำ + Docker | 0.5 วัน |
| 0.4 | **Setup domain + SSL** | ai.dinoco.co.th -> Hetzner IP | 0.5 วัน |
| 0.5 | **API key exchange** | MCP Bridge API key + OpenClaw API_SECRET_KEY | 0.5 วัน |
| 0.6 | **Create Telegram Bot** | สำหรับ admin alerts + daily summary | 0.5 วัน |

### Hard Blockers

| Blocker | ผลกระทบ | วิธีรับมือ |
|---------|---------|-----------|
| **Meta App Review 1-4 สัปดาห์** | FB/IG webhook ใช้ไม่ได้จนกว่า approve | Submit วันแรก ระหว่างรอเขียนโค้ด |
| **IG DM ส่ง template/card ไม่ได้** | Instagram รองรับแค่ text + image + quick reply | ออกแบบ 2 แบบ: FB = Generic Template, IG = text+image fallback |
| **Meta 24hr Messaging Window** | ส่งข้อความหลัง 24 ชม. ไม่ได้ | **ต้องเก็บเบอร์โทร/LINE ลูกค้าตั้งแต่ต้น** |
| **LINE Push API เสียเงิน** | replyToken หมดอายุ 30 วิ -> ต้องใช้ Push | เช็ค LINE OA plan |

## 5.0.5 Platform Limitations

### Facebook Messenger vs Instagram DM

| ฟีเจอร์ | Facebook Messenger | Instagram DM |
|---------|-------------------|-------------|
| Text message | Yes | Yes |
| Image message | Yes | Yes |
| Generic Template (card+image+button) | Yes | **No** |
| Quick Reply buttons | Yes | Yes (max 13) |
| Persistent Menu | Yes | No |
| 24hr messaging window | Yes ต้องปฏิบัติ | Yes ต้องปฏิบัติ |
| Message Tags | Yes (จำกัด use case) | **No** |
| One-Time Notification | Yes (ต้อง App Review) | **No** |

### WF2 Follow-up Strategy (24hr window) -- COMPLETE DESIGN

(See original MASTER-PLAN.md sections A-I for complete follow-up strategy: contact collection timing, follow-up method selection, timeline, window management, OTN strategy, IG Plan B, Admin Fallback Dashboard, Lead Contact State Machine, Safety Rules)

### Safety Rules (ห้ามฝ่าฝืนเด็ดขาด)

```
1. ห้ามส่งข้อความ FB/IG หลัง window หมด (ยกเว้น OTN)
2. ห้ามใช้ Message Tags กับ lead follow-up
3. ห้ามส่ง > 2 ข้อความติดกันถ้าลูกค้าไม่ตอบ
4. ห้าม incentivize reply ("ตอบรับโปรโมชั่น")
5. ห้ามส่ง OTN opt-in ซ้ำ (ขอได้ 1 ครั้ง/session)
6. ทุก follow-up ต้องมี value จริง (ไม่ใช่ข้อความกลางๆ)
```

## 5.0.6 Cost Estimation

| รายการ | ต่อเดือน | หมายเหตุ |
|--------|---------|---------|
| **Hetzner VPS** (CX31 4GB RAM) | ~250 บาท | Agent + Dashboard + MongoDB + Nginx |
| **Gemini Flash** (chat primary) | 0 - 500 บาท | Free tier: 15 RPM, 1M tokens/day |
| **Claude Sonnet** (chat fallback) | 0 - 1,000 บาท | ใช้เมื่อ Gemini fail เท่านั้น |
| **MongoDB Atlas M0** | 0 บาท | 512MB จะเต็มใน 3-6 เดือน |
| **MongoDB Atlas M2** (ถ้า upgrade) | ~350 บาท | 2GB เพียงพอ 1-2 ปี |
| **รวมขั้นต่ำ** | **~250 บาท/เดือน** | VPS เท่านั้น |
| **รวมถ้า scale** | **~2,000-3,000 บาท/เดือน** | VPS + paid Gemini + MongoDB M2 |

## 5.0.7 Missing Pieces (Fullstack Review)

1. **Error Handling Strategy** -- Circuit breaker ทุก external call
2. **Logging Strategy** -- Structured logging (winston/pino)
3. **Monitoring** -- Uptime Robot + internal health checks
4. **Testing Strategy** -- Unit tests (AI format adapter, state machines, PII masking), integration tests, E2E tests Phase 3
5. **CI/CD** -- GitHub Actions: SSH to Hetzner, docker compose up, health check
6. **Development Environment** -- docker-compose.dev.yml + Mock MCP Bridge
7. **Database Migration Strategy** -- MongoDB schemaless + version tracking
8. **Graceful Degradation** -- Priority 1 (MVP): FB/IG chat + leads, Priority 2: Claims + Auto-reply, Priority 3: Follow-up + 14 agents + 3D Office (ตัดได้)

## 5.1 Vision

DINOCO จะมีระบบ AI-powered customer engagement ครบวงจร: ลูกค้าทักผ่าน Facebook Page หรือ Instagram DM ก็จะได้รับคำตอบจาก AI ที่ดึงข้อมูลสินค้า/ตัวแทนจริงจาก WordPress, ถูกส่งต่อให้ตัวแทนจำหน่ายผ่าน LINE push, มีน้องกุ้งมะยม (AI Agent #15) ติดตามทุกขั้นตอน, B2B ทั้งหมดยังอยู่ใน WordPress เหมือนเดิม 100%, ข้อมูลการเงิน/หนี้ไม่มีทางหลุดออกนอก WordPress.

## 5.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CUSTOMER CHANNELS                               │
│                                                                         │
│  Facebook Page        Instagram DM           LINE OA                    │
│      |                    |                     |                        │
│      v                    v                     v                        │
│  Meta Graph API      Meta Graph API       LINE Messaging API            │
│      |                    |                     |                        │
│      └────────┬───────────┘                     |                        │
│               |                                 |                        │
│               v                                 v                        │
│  ┌────────────────────────────┐   ┌─────────────────────────────────┐   │
│  │  OpenClaw Agent (Docker)   │   │  DINOCO WordPress               │   │
│  │  Hetzner VPS, port 3000    │   │  (Existing production server)   │   │
│  │                            │   │                                 │   │
│  │  * FB/IG webhook receiver  │   │  * B2B LINE Bot (Snippet 1-15) │   │
│  │  * AI Chat (Gemini Flash   │   │  * LIFF E-Catalog              │   │
│  │    + Claude Sonnet)        │   │  * Warranty Registration       │   │
│  │  * Lead Follow-up Pipeline │   │  * Finance Dashboard           │   │
│  │  * Manual Claim via Chat   │   │  * Brand Voice Pool            │   │
│  │  * 15+ AI Agents (cron)    │   │  * MCP Bridge (REST API)       │   │
│  └────────────┬───────────────┘   └──────────────┬──────────────────┘   │
│               |                                  |                       │
│               |     MCP Bridge REST API          |                       │
│               | <==============================> |                       │
│               |   /wp-json/dinoco-mcp/v1/*       |                       │
│               |   36 endpoints                   |                       │
│                                                                         │
│  KEY SEPARATION:                                                        │
│    LINE = WordPress 100%                                                │
│    FB/IG = OpenClaw 100%                                                │
│    Data bridge = MCP REST API only (no DB merge)                        │
│    Finance/Debt data = NEVER leaves WordPress                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## 5.3 Feature List

### 3.1 B2C Member System (11 features, most DONE)
### 3.2 B2B Distributor System (15 features, all DONE)
### 3.3 Chat & Communication (9 features, some TODO)
### 3.4 CRM & Customer Intelligence (9 features, some TODO)
### 3.5 AI & Analytics (12 features, some TODO)
### 3.6 Infrastructure (6 features, some TODO)

(See original MASTER-PLAN.md section 3 for complete feature tables with status)

## 5.4 Integration Points (MCP Bridge)

Base: `/wp-json/dinoco-mcp/v1/` | Auth: `X-API-Key` header

- **EXISTS (6 endpoints)**: product-lookup, dealer-lookup, warranty-check, kb-search, kb-export, catalog-full
- **NEW-P1 (11 endpoints)**: distributor-list, distributor-notify, lead-create/update/list, lead-followup-schedule, claim-manual-create/update/status, brand-voice-submit, kb-suggest
- **NEW-P2 (8 endpoints)**: warranty-registered, member-motorcycle/assets, claim-status, customer-link, dealer-sla-report, etc.

> **Note (LIFF AI V.1.4):** LIFF AI claim endpoints (`/liff-ai/v1/claim/*`) เคย broken เนื่องจากใช้ผิด CPT -- fixed แล้วใน V.1.4 (Snippet 1, DB_ID: 1180)
- **NEW-P3 (6 endpoints)**: kb-updated, inventory-changed, moto-catalog, dashboard-inject-metrics, lead-attribution
- **REMOVED (10 endpoints)**: All financial data endpoints (debt, pricing, payment, finance-summary, bank-info, invoice-image)

### Workflow Summaries (8 workflows)

1. **WF1**: ลูกค้าถามสินค้า FB/IG -> AI product-lookup -> แนะนำตัวแทน -> create lead
2. **WF2**: น้องกุ้งมะยมติดตาม Lead (18 statuses, ทั้งลูกค้าและตัวแทน)
3. **WF3**: เคลมแมนนวลผ่านแชท (16 states, Vision AI)
4. **WF4**: AI ตอบคำถามในกลุ่ม LINE ตัวแทน
5. **WF5**: Brand Voice Auto-Collection จาก FB comments
6. **WF6**: KB Self-Improvement Loop
7. **WF7**: Auto-Reply 5 นาที (Gemini + tools ดึงข้อมูลจริง)
8. **WF8**: Sentiment Alert -> Admin Intervention

### Data Confidentiality Rules

| ข้อมูล | ห้าม | ถ้าลูกค้าถาม |
|--------|------|-------------|
| ราคาต้นทุน / ราคา dealer tier | ห้ามบอกเด็ดขาด | "สอบถามกับตัวแทนจำหน่ายโดยตรงนะคะ" |
| ส่วนลด / โปรโมชั่น | ห้ามลด ห้ามสัญญา | "DINOCO เป็นนโยบาย One Price" |
| จำนวนสต็อก | ห้ามบอกตัวเลข | AI ใช้ stock_status ภายในเท่านั้น |
| หนี้ตัวแทน / credit | ห้ามบอก | ข้อมูลนี้ไม่ข้ามไป OpenClaw เลย |
| ยอดขายตัวแทน | ห้ามบอก | ข้อมูลภายในเท่านั้น |

### Deep Review Findings

**CRITICAL**:
- C0a: Meta webhook signature ใช้ `===` -> Timing Attack (แก้: timingSafeEqual)
- C0b: requireAuth ใช้ `!==` -> Timing Attack บน API Key
- C0c: warranty-check ส่ง PII + LIKE match
- C0d: PDPA consent ต้องมีก่อนเก็บข้อมูล
- C1-C5: dealer-lookup array index, free models ไม่มี tool calling, Meta 24hr window, MCP Bridge ไม่มี IP whitelist, Phase 1 ตึงเกิน

**IMPORTANT**: I0a-I12 (11 issues including API key in query string, upload access control, Docker network isolation, MongoDB indexes, Manual Claim states, prompt injection filter)

**SUGGESTIONS**: S1-S6 (conversational claim flow, contact method choice, opt-out, dashboard merge, cache TTL 15-30min, KB relevance threshold)

## 5.5 New Systems to Build

### 5.5.1 Manual Claim System (16 states)
### 5.5.2 Lead Follow-up Pipeline (18 statuses, 7 cron jobs)
### 5.5.3 Agent #15: Mayom (Lead Follow-up & Dealer SLA Tracker)

(See original MASTER-PLAN.md section 5 for complete specs)

## 5.6 Code Changes Required

### 6.1 DONE (11 items -- MCP Bridge, security, tools, KB sync, LINE forwarding)
### 6.2 BLOCKED (8 items -- aiReplyToMeta rewrite, postback handling, claim routing, Flex messages, cache, bot name, PDPA)
### 6.3 TODO (WordPress: 25 new MCP endpoints + Manual Claim CPT; OpenClaw: AI rewrite, lead pipeline, claim flow, dashboard views)

## 5.7 Phase Plan (Timeline)

### Timeline v3 -- Realistic (developer 1 คน, ~3 เดือน)

| Phase | สัปดาห์ | งานหลัก |
|-------|---------|--------|
| **Phase 0** | 0 (ทำทันที) | Submit Meta App Review + Setup VPS + API keys |
| **Phase 1A** | 1-2 | Rewrite AI + tools + cache + FB/IG chat ตอบได้ |
| **Phase 1B** | 3-4 | Lead Pipeline + Mayom + Flex + PDPA |
| **Phase 2** | 5-7 | Manual Claim + AI agents ทีละตัว |
| **Phase 3** | 8-12 | Advanced integration + Dashboard + Testing |

(See original MASTER-PLAN.md section 7 for complete Phase 1A/1B/2/3 deliverable tables)

## 5.8 AI Agent Configuration

20 agents total (14 existing + 6 new):

| # | Agent | Schedule | DINOCO Role |
|---|-------|----------|-------------|
| 1 | Problem Solver | Every 2 hr | Detect complaints, suggest solutions |
| 2 | Sales Hunter | Every 1 hr | Detect purchase intent, score leads |
| 3 | Sentiment Analyzer | Every 1 hr | Score sentiment 0-100, alert on red |
| 4 | Churn Predictor | Every 6 hr | Re-engagement triggers |
| 5-14 | (Various) | Various | Health, Content, Q&A, Performance, Lead Scoring, Tags, SLA, Reports, KB, CEO |
| **15** | **Mayom** | Every 30 min | **Lead Follow-up & Dealer SLA** (NEW BUILD) |
| 16 | Demand Forecaster | Weekly Mon 6AM | พยากรณ์ demand 2-4 สัปดาห์ |
| 17 | Compatibility Mapper | Every 12 hr | Flag รุ่นที่ถูกถามบ่อยแต่ไม่มีใน catalog |
| 18 | Warranty Intelligence | Daily 7AM | Pattern เคลม, ตรวจจับเคลมน่าสงสัย |
| 19 | Distributor Scorecard | Weekly Mon 8AM | เกรด A-D ตัวแทน |
| 20 | Price Shield | Every 4 hr | Scan marketplace ราคาผิด One Price Policy |

## 5.9 Dashboard Plan

### Phase 1-2: Two Separate URLs
- **OpenClaw Dashboard** (ai.dinoco.co.th/dashboard): Chat, CRM, Lead, Claim, AI Agents, Analytics
- **DINOCO Admin Dashboard** (dinoco.co.th/admin-dashboard): B2B, Finance, Warranty, Inventory, Brand Voice

### Phase 3: Merged Dashboard
- DINOCO Admin Dashboard becomes single entry point
- Embed OpenClaw metrics via `/dashboard-inject-metrics`
- New tab "FB/IG Chat & Leads"

## 5.10 Risk & Rollback

### Risk Matrix

| Risk | Impact | Mitigation |
|------|--------|------------|
| Meta webhook fails | Chat goes silent | Health Agent + Telegram alert + manual Meta Business Suite |
| MCP Bridge down | AI no data | Cache 1hr TTL + graceful fallback |
| AI hallucination | Wrong info | AI only uses MCP data, brand voice prompt |
| Dealer no response | Lead dies | Mayom escalates 24hr, SLA flag |
| Finance data exposure | Critical | 10 financial endpoints REMOVED. Never. |
| LINE B2B disruption | Critical | LINE stays 100% in WordPress. Zero risk. |

### Rollback Plan

- **Level 1 (30 sec)**: Change Meta webhook URL -> off
- **Level 2 (30 sec)**: Revert LINE webhook to WordPress
- **Level 3 (5 min)**: docker compose down, remove webhooks, re-activate WP AI Module
- **Key principle**: WordPress is never destructively modified. Rollback = turn off OpenClaw.

## 5.11 Appendices (Master Plan)

### Appendix 0: สิ่งที่ยังไม่มี Code (ต้อง Build ก่อน Go-Live)

| # | สิ่งที่ต้อง build | ระดับ | Phase |
|---|------------------|------|-------|
| 1 | **aiReplyToMeta rewrite** | CRITICAL | 1A |
| 2 | **PDPA consent flow** | CRITICAL | 1A |
| 3 | **24hr window + OTN implementation** | CRITICAL | 1B |
| 4 | **Meta App Review** | HIGH | 0 |
| 5 | **Prompt injection filter ภาษาไทย** | MEDIUM | 1A |
| 6 | **MongoDB indexes** | MEDIUM | 1B |
| 7 | **Data reconciliation script** | MEDIUM | 1B |
| 8 | **B2B Order -> Lead Link webhook** | HIGH | 1B |
| 9 | **Flash Express -> Lead webhook** | MEDIUM | 2 |

### Appendix A: Environment Variables

(See original MASTER-PLAN.md Appendix A for complete .env reference)

### Appendix B: Go-Live Checklist

12 sections: B1 Infrastructure, B2 Meta Platform, B3 AI Chat Engine, B4 MCP Bridge, B5 Lead Pipeline, B6 Meta 24hr Window Safety, B7 Safety Rules Enforcement, B8 Data & Privacy, B9 Security, B10 Branding & UX, B11 Existing Systems (No Regression), B12 Monitoring & Rollback Ready

(See original MASTER-PLAN.md Appendix B for complete checklist items)

### Appendix C: File Reference

**WordPress (modify):** `[System] DINOCO MCP Bridge` -- add 25 endpoints
**WordPress (new):** `[System] DINOCO Manual Claim System`
**OpenClaw (modify):** proxy/index.js (V.2.1), proxy/modules/telegram-alert.js (V.2.0), openclaw.json, cron/jobs.json, skills, dashboard CSS/layout, docker-compose, nginx
**OpenClaw (new):** proxy/modules/telegram-gung.js (V.1.0), Agent #15 Mayom skill, .env
**Documentation:** MASTER-PLAN.md (single source of truth), INTEGRATION-ARCHITECTURE.md (detailed specs)

---

# 6. น้องกุ้ง Telegram Command Center

**Status:** Implemented V.1.0

> Created: 2026-04-07
> Module: `proxy/modules/telegram-gung.js` (V.1.0) + `proxy/modules/telegram-alert.js` (V.2.0)
> Entry: `proxy/index.js` (V.2.1) -- webhook route `/webhook/telegram/{secret}`

## 6.1 Overview

น้องกุ้ง คือ Telegram Bot ที่ให้บอสจัดการระบบ DINOCO ผ่าน Telegram ได้โดยตรง: ดูเคลม/อนุมัติ/ปฏิเสธ, ตอบลูกค้าข้ามแพลตฟอร์ม, จัดการ KB, ดูสถิติ Lead/AI, และรับ daily summary อัตโนมัติ

- **Bot**: @dinoco_alert_bot
- **Security**: chat_id check (บอสเท่านั้น) + webhook secret path
- **Response format**: Plain text เสมอ (ป้องกัน Telegram Markdown parse error)

## 6.2 Commands Reference

### เคลม Commands

| Command | Description |
|---------|-------------|
| `เคลม MC-XXXXX` | ดึงรายละเอียดเคลม (สถานะ, ลูกค้า, สินค้า, รูป) |
| `อนุมัติ` | อนุมัติเคลมที่กำลังดูอยู่ (context จาก command ก่อนหน้า) |
| `ปฏิเสธ [เหตุผล]` | ปฏิเสธเคลมพร้อมเหตุผล |
| `เคลมรอตรวจ` | แสดงรายการเคลมรอ review (status: reviewing) |
| `เคลมวันนี้` | แสดงรายการเคลมที่เข้ามาวันนี้ |

### ตอบลูกค้า Commands

| Command | Description |
|---------|-------------|
| `ตอบ [ชื่อ]: [ข้อความ]` | ส่งข้อความกลับผ่าน platform เดิมของลูกค้า (LINE/FB/IG) |
| `ตอบล่าสุด` | ตอบ conversation ล่าสุดที่ alert เข้ามา |
| Reply alert message | ตอบกลับ conversation ที่ alert นั้น (Telegram reply feature) |

### ตัวแทน & Lead Commands

| Command | Description |
|---------|-------------|
| `ตัวแทน [จังหวัด]` | ค้นหาตัวแทนจำหน่ายตามจังหวัด |
| `Lead วันนี้` | สรุป lead ที่เข้ามาวันนี้ |
| `Lead รอติดต่อ` | แสดง leads ที่ยังไม่ได้ contact |

### Knowledge Base Commands

| Command | Description |
|---------|-------------|
| `KB เพิ่ม [หัวข้อ]: [เนื้อหา]` | เพิ่ม KB entry ใหม่ |
| `KB ค้นหา [คำค้น]` | ค้นหา KB |
| `KB ทั้งหมด` | แสดง KB ทั้งหมด |

### สถิติ & ระบบ Commands

| Command | Description |
|---------|-------------|
| `แชทวันนี้` | สถิติ chat วันนี้ (จำนวน, platform breakdown) |
| `สถิติ AI` | AI performance stats (accuracy, tool usage, fallback rate) |
| `เทรน [จำนวน]` | Generate training set สำหรับ AI |
| `สถานะ` | System status (uptime, connections, queue) |
| `ล้างแชท` | Clear command context |
| `/help` | แสดงรายการคำสั่งทั้งหมด |

## 6.3 Cron Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Daily Summary | 09:00 ICT | สรุปยอดวันก่อน: จำนวน chat, leads ใหม่, claims ใหม่, AI accuracy |
| Lead No Contact | ทุก 4 ชม. | แจ้ง leads ที่สร้างมาแล้วแต่ยังไม่มีใคร contact |
| Claim Aging | ทุก 4 ชม. | แจ้ง claims ที่ค้างนาน (reviewing > 48h, in_progress > 7d, etc.) |

## 6.4 telegram-alert.js V.2.0

อัพจาก V.1.0 -- เพิ่มฟังก์ชันใหม่:

| Function | Description |
|----------|-------------|
| `sendTelegramAlert(title, body)` | ส่ง text alert ไป Telegram (เดิม V.1.0) |
| `sendTelegramReply(chatId, replyToMsgId, text)` | Reply to specific message (NEW V.2.0) |
| `sendTelegramPhoto(chatId, photoUrl, caption)` | ส่งรูปภาพ (NEW V.2.0) |
| `escapeMarkdown(text)` | Escape Telegram MarkdownV2 special chars (NEW V.2.0) |
| `init({getDB})` | Initialize MongoDB connection for alert logging (NEW V.2.0) |

Alert records บันทึกลง MongoDB `telegram_alerts` collection -- mapping `message_id` กับ `sourceId` เพื่อให้บอส reply alert แล้วระบบส่งกลับถูก conversation

## 6.5 Architecture

```
Telegram Bot API
    |
    v
POST /webhook/telegram/{secret}  ← index.js V.2.1
    |
    ├─ chat_id check (บอสเท่านั้น)
    |
    ├─ Reply to alert? → ค้นหา telegram_alerts → ส่งกลับ platform เดิม
    |
    └─ Text command → telegram-gung.js command parser
         |
         ├─ เคลม commands → MCP Bridge → WordPress claim_ticket CPT
         ├─ ตอบ commands → platform-response.js → LINE/FB/IG
         ├─ Lead commands → MCP Bridge → lead-list/lead-get
         ├─ KB commands → MCP Bridge → kb-search/kb-suggest
         ├─ Stats commands → MongoDB aggregation
         └─ System commands → internal state
```

## 6.6 Environment Variables

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token (@dinoco_alert_bot) |
| `TELEGRAM_CHAT_ID` | Boss chat_id (security: only this chat_id can send commands) |
| `TELEGRAM_WEBHOOK_SECRET` | Secret path segment for webhook URL |
| `BASE_URL` | Server base URL (e.g., https://ai.dinoco.co.th) |

## 6.7 MongoDB Collections

| Collection | Indexes | Description |
|-----------|---------|-------------|
| `telegram_alerts` | `message_id`, `sourceId`, `created_at` | Alert message mapping (message_id <-> sourceId) สำหรับ reply routing |
| `telegram_command_log` | `chat_id`, `command`, `created_at` | Audit trail ทุก command ที่บอสใช้ |

## 6.8 Security

- **chat_id whitelist**: เฉพาะ `TELEGRAM_CHAT_ID` (บอส) เท่านั้นที่สั่งได้
- **Webhook secret**: URL path มี secret segment ป้องกัน unauthorized POST
- **Plain text response**: ไม่ใช้ Markdown เพื่อป้องกัน parse error กับ Thai text + special chars
- **Command logging**: ทุก command บันทึกลง MongoDB สำหรับ audit

---

# 7. Dealer Management System V.2.0

**Status:** Implemented V.2.0
> Created: 2026-04-07
> Module: `proxy/` (index.js API routes) + `dashboard/` (2 pages)

## 7.1 Overview

ระบบจัดการตัวแทนจำหน่ายใน MongoDB แทน WordPress — รองรับ CRUD, import จาก WP, และส่ง LINE Flex card notification ตรงไม่ผ่าน WP.

- **Feature flag**: `USE_MONGODB_DEALERS=true` ใน .env
- **MongoDB collection**: `dealers`
- **Dashboard**: 2 pages (list + detail) + sidebar menu "ตัวแทน"

## 7.2 API Endpoints (8)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dealers` | List all dealers (paginated, search, filter by province) |
| GET | `/api/dealers/:id` | Get dealer detail |
| POST | `/api/dealers` | Create dealer |
| PUT | `/api/dealers/:id` | Update dealer |
| DELETE | `/api/dealers/:id` | Delete dealer |
| POST | `/api/dealers/import` | Import dealers from WP `/distributor-list` |
| POST | `/api/dealers/:id/notify` | Send LINE Flex card to dealer |
| GET | `/api/dealers/provinces` | List distinct provinces |

## 7.3 Dashboard Pages

| Page | Path | Description |
|------|------|-------------|
| Dealer List | `/dashboard/dealers` | ตาราง + search + filter province + import button |
| Dealer Detail | `/dashboard/dealers/:id` | รายละเอียด + edit form + send notification |

## 7.4 LINE Flex Card

- Header: DINOCO CO DEALER สีดำ + logo
- Content: รูปสินค้า + ราคา + รายละเอียด
- ส่งผ่าน `LINE_CHANNEL_ACCESS_TOKEN` ตรง (ไม่ผ่าน WP MCP)

## 7.5 Data Model (MongoDB `dealers`)

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | Primary key |
| `name` | String | ชื่อร้าน |
| `owner_name` | String | ชื่อเจ้าของ |
| `province` | String | จังหวัด |
| `phone` | String | เบอร์โทร |
| `line_group_id` | String | LINE Group ID (for Flex push) |
| `owner_line_uid` | String | LINE User ID ของเจ้าของ |
| `wp_distributor_id` | Number | WordPress CPT post ID (if imported) |
| `rank` | String | Tier (Standard/Silver/Gold/Platinum/Diamond) |
| `is_active` | Boolean | สถานะ active |
| `created_at` | Date | วันที่สร้าง |
| `updated_at` | Date | วันที่อัพเดทล่าสุด |

---

# 8. Lead Pipeline V.2.0

**Status:** Implemented V.2.0
> Updated: 2026-04-07
> Module: `proxy/modules/lead-pipeline.js` (V.2.0)

## 8.1 New Statuses (เพิ่มจาก V.1.0)

| Status | Description |
|--------|-------------|
| `closed_won` | ปิดการขายสำเร็จ |
| `waiting_decision` | ลูกค้ากำลังตัดสินใจ |
| `waiting_stock` | รอสินค้าเข้า |

## 8.2 New Transitions

ทุก status มีทางไป `closed_lost`/`cancelled` แล้ว (ไม่มี dead-end). เพิ่ม:
- `dealer_notified` → `waiting_decision` / `waiting_stock`
- `waiting_decision` → `closed_won` / `closed_lost`
- `waiting_stock` → `dealer_notified` (สินค้าเข้าแล้ว แจ้งตัวแทน)
- `contacted` → `closed_won`

## 8.3 Auto-Lead V.8.0

Flow:
1. ลูกค้าพิมพ์ชื่อ+เบอร์ใน chat → AI detect
2. `create_lead` tool สร้าง lead ทันที
3. `lookupProductForLead()` enrich lead ด้วยรูป+ราคาจาก MCP product-lookup
4. `notifyDealerDirect()` ส่ง LINE Flex card ตรงไปตัวแทน (ไม่ผ่าน WP `/distributor-notify`)
5. Status → `dealer_notified`

## 8.4 Flex Builders (5 ตัว)

| Builder | Description |
|---------|-------------|
| `buildLeadNotifyFlex` | แจ้งตัวแทนว่ามี lead ใหม่ (รูป+ราคา+ข้อมูลลูกค้า) |
| `buildFollowUpFlex` | เตือนติดตาม lead |
| `buildStockBackFlex` | แจ้งสินค้ากลับมามีสต็อก |
| `buildDealerReminderFlex` | เตือนตัวแทนที่ไม่ตอบ |
| `buildClosedFlex` | สรุปผล lead (won/lost) |

## 8.5 Postback Handler

Postback ใช้ FSM (`updateLeadStatus`) แทน direct update เดิม — enforce valid transitions.

## 8.6 Output-Based Dealer Coordination (V.6.3)

`ai-chat.js` detect ร้าน+เบอร์ในคำตอบ AI → append ข้อความ "ทางเราจะประสานงานกับตัวแทนให้ครับ" อัตโนมัติ.

---

# 9. AI Chat Fixes (V.8.1)

**Status:** Implemented
> Updated: 2026-04-07
> Module: `proxy/modules/ai-chat.js` (V.8.1), `proxy/modules/shared.js`

## 9.1 Claude Review Guard (V.8.1)

ดัก Claude review/evaluation text ที่หลุดไปหาลูกค้า — ตรวจ output patterns เช่น "This response", "The answer" แล้ว strip ออกก่อนส่ง.

## 9.2 PII Masking in Conversation History

Mask เบอร์โทร/ชื่อจริงใน conversation history ก่อนส่ง Gemini — ป้องกัน SAFETY block จาก PII detection.

## 9.3 False Hallucination Alert Fix (V.4.2)

แก้ supervisor trigger false positive เมื่อ AI ตอบถูกต้องแต่ใช้คำที่คล้าย hallucination pattern.

## 9.4 Product Knowledge Rules (shared.js)

- ห้ามเอ่ย H2C (คู่แข่ง) — ใช้ "ตัวแต่งจากศูนย์" = DINOCO Edition
- วัสดุตรงสินค้า: กันล้ม = สแตนเลส, กล่อง = อลูมิเนียม
- DINOCO Edition NX500 = SKU DNCGND37LSPROS สีเงินเท่านั้น
- Side Rack ไม่ใช่มือจับ (มือจับเกี่ยวกับ Rear Rack เท่านั้น)
- **CONFIRM_SELECTION** (V.5.4): ลูกค้าตัดสินใจเลือกสินค้าแล้ว (ระบุ สี/รุ่น/ราคา) → บังคับเรียก product_lookup + แนบ URL รูปยืนยันก่อนถามจังหวัด
- **LIST_MANY_OPTIONS** (V.5.4): list สินค้า ≥3 ตัว → ปิดท้ายถาม "ลูกค้าสนใจตัวไหน จะส่งรูปให้ดู" (proactive image offer)

---

# 10. Docker/Deploy Updates (2026-04-07)

## 10.1 docker-compose.prod.yml

- เพิ่ม `mongodb` service ใน compose (ไม่ใช่ external container)
- Agent `depends_on: mongodb`
- Volume: `mongo-data` (ไม่ใช่ `mongodb-data` — ชื่อผิด = ข้อมูลหาย)
- MONGODB_URI hostname: `mongodb` (docker compose internal DNS)

## 10.2 Nginx

- Port 80 serve ตรง ไม่ redirect HTTPS (Cloudflare Tunnel จัดการ SSL)

## 10.3 Network Rules

- ทุก service ต้องอยู่ใน compose file เดียวกัน
- ห้ามใช้ `docker network connect` แก้ปัญหา (หลุดทุก rebuild)

## 10.4 Environment Variables

- `LINE_CHANNEL_ACCESS_TOKEN` ต้องใส่ใน .env (B2B bot token เดียวกับ WP `B2B_LINE_ACCESS_TOKEN`)

---

# 11. Product Hierarchy 3 ระดับ (แม่-ลูก-หลาน)

**Status:** 📋 Planned (ยังไม่ implement)
**Date:** 2026-04-09 | **Author:** Feature Architect + Tech Lead Review
**Reviewed:** APPROVE WITH CONDITIONS — patched 3 Critical + 2 Missing Files

> ระบบ SKU relations ปัจจุบันรองรับแค่ 2 ระดับ (แม่→ลูก) แต่สินค้าจริงมี 3 ระดับ
> หลาน (grandchild) แสดงเฉพาะ B2B + Admin หลังบ้าน ไม่กระทบลูกค้าหน้าบ้าน (B2C)

## 11.1 Problem & Goal

### ปัญหา

สินค้าบางตัว "ลูก" แยกได้อีก:

```
ชุดกันล้ม Honda Forza 350 (SET — แม่)
  ├── กันล้มบน (ลูก — ชิ้นเดียว ขายแยกได้)
  └── กันล้มล่าง ชุด (ลูก — ตัวเองก็เป็น sub-SET)
        ├── กันล้มล่าง ข้างซ้าย (หลาน)
        └── กันล้มล่าง ข้างขวา (หลาน)
```

ระบบ 2 ระดับจัดการไม่ได้ เพราะ stock computation, reserved qty, stock deduction ไม่รองรับ cascade 3 ชั้น

### ใครมีปัญหา

- **Admin**: สร้าง product hierarchy ครบไม่ได้ใน Product Catalog
- **B2B ตัวแทน**: สั่งซื้อหลาน (อะไหล่ย่อย เช่น กันล้มล่างข้างซ้าย) แยกไม่ได้
- **Inventory**: สต็อกคำนวณผิดเมื่อ child มี grandchildren

### ขอบเขต (Scope)

- **หลานแสดงเฉพาะ B2B + Admin** — ตัวแทนจำหน่ายซื้อหลานแยกเป็นอะไหล่ได้
- **ลูกค้าหน้าบ้าน (B2C) ไม่เกี่ยว** — หน้า Edit Profile, Assets List, Member Dashboard เห็นแค่ SET ระดับบนสุดเหมือนเดิม
- **B2F เห็นหลานได้** — สั่งโรงงานสั่ง SKU หลานแยกได้ (B2F ใช้ SKU ตรง + `dinoco_stock_add()` trigger cascade อัตโนมัติ ไม่ต้องแก้ B2F code)

### Success Metrics

1. Admin สร้าง hierarchy 3 ระดับได้ใน Product Catalog UI
2. Stock cascade ถูกต้อง: grandchild → child → parent
3. ตัวแทน (B2B) สั่ง grandchild แยกได้ใน E-Catalog LIFF
4. Reserved qty cascade 3 ระดับถูกต้อง
5. ลูกค้าหน้าบ้านไม่เห็นความเปลี่ยนแปลง
6. Backward compatible: product 2 ระดับเดิมทำงานเหมือนเดิม 100%

## 11.2 Design Decisions

### DD-1: Flat format ใน wp_options (ไม่เปลี่ยน data structure)

```php
// ปัจจุบัน:
{ "SET_A": ["CHILD_B", "CHILD_C"] }

// หลังอัพเกรด (เพิ่ม entry สำหรับ child ที่มี grandchildren):
{
  "SET_A":   ["CHILD_B", "CHILD_C"],
  "CHILD_B": ["GRAND_B1", "GRAND_B2"]    // ← เพิ่มใหม่
}
```

**เหตุผล**: code 17+ จุดอ่าน format `{ parent: [children] }` อยู่ — ถ้าเปลี่ยน format ต้องแก้ทุกจุดพร้อมกัน เสี่ยงพัง

### DD-2: Leaf-only stock deduction (กฎเหล็ก)

ตัดสต็อกเฉพาะ leaf nodes (SKU ที่ไม่มี children) เท่านั้น:
- สั่ง SET → ตัด leaf [child_A, grand_B1, grand_B2]
- สั่ง child_B (มี grandchildren) → ตัด leaf [grand_B1, grand_B2]
- สั่ง grand_B1 → ตัดตรง [grand_B1]

Non-leaf stock เป็น computed (MIN) เสมอ ไม่ตัดตรง

### DD-3: Shared child = Allow

สินค้า DINOCO มี child ที่ใช้ร่วมข้ามหลาย SET ได้ (เช่น กันล้มบน ใช้ได้กับหลายรุ่นรถ ไม่ได้แยก SKU) ดังนั้น:
- child/grandchild ตัวเดียว **อยู่ใน หลาย SET ได้**
- Reserved qty จะนับรวมจากทุก SET ที่มี child ตัวนั้น (ถูกต้อง)

### DD-4: Max depth = 3 (hard limit)

ไม่ recursive ไม่จำกัด — business case จริงไม่เคยเกิน 3 ระดับ

### DD-5: Walk-in ตัดสต็อกเกินได้ (ติดลบ)

Walk-in ข้าม stock check แต่ยังตัดสต็อก leaf nodes — ถ้าตัดเกินให้ติดลบในระบบ

### DD-6: หลานไม่กระทบลูกค้าหน้าบ้าน (B2C) แต่ B2B + B2F เห็น

- **B2C**: หน้า Edit Profile, Assets List, Member Dashboard เห็นแค่ top-level SET — ใช้ `dinoco_is_top_level_set()` filter sub-SET ออก
- **B2B + B2F**: เห็นหลานได้ สั่งซื้อ/สั่งโรงงาน SKU หลานแยกได้

### DD-7: B2F สั่งแม่ → Auto-expand leaf ทั้งหมด / B2B สั่งแม่ → แสดงแค่ลูก

- **B2F (สั่งโรงงาน)**: Admin สั่ง SET (แม่) → ระบบ auto list ลูก+ชิ้นส่วนย่อย (leaf nodes ทั้งหมด) ในใบสั่งซื้อ PO + Flex card เลย เพราะโรงงานต้องเห็นรายการจริงที่ผลิต/ส่ง
- **B2B (ตัวแทนสั่ง)**: สั่ง SET (แม่) → Flex/Invoice แสดงแค่ลูกชั้นเดียวเหมือนเดิม ไม่ขยายถึงชิ้นส่วนย่อย (แสดงเยอะเกินไปสำหรับตัวแทน)

**DD-7 Expansion Point — Option A (expand ตอน create-po)**:
- Expand เกิดที่ `b2f_rest_create_po()` ใน B2F Snippet 2 — ก่อน save items เข้า ACF repeater `po_items`
- ระบบ resolve SET SKU → leaf SKUs ด้วย `dinoco_get_leaf_skus()` แล้วเก็บ leaf items ใน PO ตรง
- **Leaf SKUs ต้องมี `b2f_maker_product` entries ด้วย** — ถ้าไม่มี → error "สินค้า X ยังไม่ได้ลงทะเบียนกับโรงงาน"
- ข้อดี: Flex builders / PO Image / PO Ticket / Admin Dashboard **ไม่ต้องแก้เลย** เพราะอ่าน `po_items` ที่ expanded แล้ว
- **B2F ต้องแก้แค่ Snippet 2 จุด `create-po` เท่านั้น** (ลดจาก 5 ไฟล์ เหลือ 1 ไฟล์)

## 11.3 Data Model

### Storage: `wp_options` key `dinoco_sku_relations`

ไม่สร้าง table ใหม่ — ใช้ flat format เดิม เพิ่มแค่ entries สำหรับ child ที่มี grandchildren

### Migration: ไม่ต้องทำ

format เดิม `{ parent: [children] }` compatible กับ format ใหม่ 100% — เพิ่ม entries ใหม่เมื่อ admin กำหนด grandchild ผ่าน UI

### Grandchild ต้องเป็น product ที่มีอยู่

grandchild SKU ต้องมี row ใน `dinoco_products` custom table อยู่แล้ว (Admin ต้องสร้าง product entry ก่อนเพิ่ม relation)

### Product delete cleanup

เมื่อ admin ลบ product จาก catalog → auto-remove SKU นั้นจาก `dinoco_sku_relations` ทุก entry ที่มีอยู่ (ทั้ง child และ grandchild) ป้องกัน stock compute query ไม่เจอ → return 0 → ทำให้ stock chain เป็น 0 ทั้งหมด

## 11.4 Helper Functions (Snippet 15)

สร้างใน `[B2B] Snippet 15` (centralized) wrapped ใน `function_exists` guard:

### `dinoco_get_leaf_skus($sku, $relations = null, $depth = 0, $visited = [])` **[V.7.1 FIX]**

Resolve leaf nodes recursive (max depth 3):
- ถ้า $sku ไม่มี children → return [$sku] (ตัวเองเป็น leaf)
- ถ้า $sku มี children → recursive ลง children
- Guard: circular ref ด้วย $visited set + depth limit
- **V.7.1**: `$visited` เปลี่ยนจาก reference (`&$visited`) เป็น **value-copy** + output ผ่าน `array_unique()` dedup

```
dinoco_get_leaf_skus('SET_A')   → ['CHILD_C', 'GRAND_B1', 'GRAND_B2']
dinoco_get_leaf_skus('CHILD_B') → ['GRAND_B1', 'GRAND_B2']
dinoco_get_leaf_skus('GRAND_B1') → ['GRAND_B1']
```

**บัคที่แก้ใน V.7.1 (C1/C2)**:
- เดิม `&$visited` reference → sibling branches share visited set → รอบสองเจอ `in_array` → return `[]` → leaf หาย
- ตัวอย่าง: `SET_A → [CHILD_B, CHILD_C]` + `CHILD_B → [LEAF_X]` + `CHILD_C → [LEAF_X]` (shared LEAF_X)
  - เดิม: รอบสอง LEAF_X ถูก visited ไปแล้ว → return `[]` → ได้แค่ `[LEAF_X]` รอบเดียว (หายไปครึ่ง)
  - ใหม่: value-copy → แต่ละ branch มี visited ของตัวเอง → cycle detection ทำงานเฉพาะใน path ปัจจุบัน → ได้ `[LEAF_X, LEAF_X]` → `array_unique` → `[LEAF_X]`
- Impact ก่อนแก้: ตัด/คืนสต็อก**ไม่ครบ** เมื่อมี shared leaf → stock drift ถาวร

### `dinoco_is_leaf_sku($sku, $relations = null)`

เช็คว่า SKU ไม่มี children (เป็น leaf node) — ใช้ filter Dip Stock snapshot

### `dinoco_get_ancestor_skus($sku, $relations = null)`

หา parent ทุกระดับ recursive:
```
dinoco_get_ancestor_skus('GRAND_B1') → ['CHILD_B', 'SET_A']
dinoco_get_ancestor_skus('CHILD_C')  → ['SET_A']
dinoco_get_ancestor_skus('SET_A')    → []
```

**[CRITICAL-3 FIX]** ใช้ใน `dinoco_get_reserved_qty()` + `dinoco_check_stock_conflict()` เพื่อ match ancestor ทุกระดับ

### `dinoco_compute_hierarchy_stock($sku, $relations = null, $depth = 0, $visited = [], $stock_map = null)` **[V.7.1 FIX]**

Recursive MIN stock:
- leaf → return stock_qty จาก DB (batch `$stock_map` O(1))
- non-leaf → return MIN(children computed stock)

**[MEDIUM-1 FIX]** ใช้แทน inline MIN(children) ที่ copy-paste 5+ จุด — centralize เป็น function เดียว

**[V.7.1 C1 FIX]**: `$visited` value-copy — shared child DD-3 คำนวณ MIN ถูก. เดิม reference → รอบสอง return 0 → `MIN(10, 0) = 0` ผิด → stock SET เพี้ยนเป็น 0

### `dinoco_is_top_level_set($sku, $relations = null)`

**[DD-6]** เช็คว่า SKU เป็น key ใน relations map **แต่ไม่เป็น child ของ key อื่น** → เป็น SET ระดับบนสุดจริงๆ

ใช้ใน B2C pages (Edit Profile, Assets List, Member Dashboard) เพื่อ filter sub-SET ออก

### `dinoco_validate_sku_hierarchy($parent_sku, $child_sku, $relations = null)`

Validate ก่อน save:
- ห้าม self reference (A→A)
- ห้าม circular ref (A→B→C→A)
- ห้าม depth > 3
- **Allow** shared child (child อยู่ใน หลาย parent ได้ — DD-3)

### `dinoco_get_sku_tree($sku, $relations = null, $depth = 0)`

Return hierarchy tree:
```php
['sku'=>'SET_A', 'children'=>[
    ['sku'=>'CHILD_B', 'children'=>[
        ['sku'=>'GRAND_B1', 'children'=>[]],
        ['sku'=>'GRAND_B2', 'children'=>[]]
    ]],
    ['sku'=>'CHILD_C', 'children'=>[]]
]]
```

ใช้ใน Admin UI render tree + B2B LIFF product detail

## 11.5 User Flows

### Flow A: Admin สร้าง 3-level hierarchy (Product Catalog)

```
Happy Path:
1. เปิด Product Catalog → กด Edit product ที่เป็น SET
2. เห็น "องค์ประกอบชุด" section
3. เพิ่ม child A (เดี่ยว) + child B (จะมี grandchild)
4. คลิกขยาย child B → "เพิ่มชิ้นส่วนย่อย"
5. Search + เลือก grandchild G1, G2
6. กด "บันทึก" → save product + relations
7. กลับหน้า catalog → เห็น SET badge + child count

Error Paths:
├── Circular ref → alert "พบ circular reference"
├── Max depth → alert "รองรับสูงสุด 3 ระดับ"
├── Save fail → Swal error
└── ลบ child ที่มี grandchildren → prompt ยืนยัน
```

### Flow B: B2B ตัวแทนซื้อ grandchild แยก (E-Catalog LIFF)

```
Happy Path:
1. เปิด E-Catalog → เห็น product grid
2. กดที่ SET product → เปิด product detail
3. เห็น: ซื้อชุดเต็ม / หรือเลือกซื้อรายชิ้น
4. กด [+] ที่ grandchild → เข้า cart
5. Checkout → order สร้างสำเร็จ

Error Paths:
├── grandchild หมดสต็อก → ปุ่ม disabled + badge "สินค้าหมด"
└── สั่งเกิน available → alert "ไม่เพียงพอ"
```

### Flow C: Stock Deduction Cascade (กฎ leaf-only)

```
สั่ง SET (แม่):
├── resolve leaf nodes: [child_A, grand_B1, grand_B2]
├── ตัดสต็อก leaf nodes ทั้งหมด
└── cascade update status: grand → child → parent

สั่ง child_B (มี grandchildren):
├── resolve leaf: [grand_B1, grand_B2]
├── ตัดสต็อก grand_B1 + grand_B2 (ไม่ตัด child_B)
└── cascade update: grand → child_B → parent (ถ้ามี)

สั่ง grand_B1 (leaf):
├── ตัดสต็อก grand_B1 ตรง
└── cascade update: grand_B1 → child_B → parent
```

### Flow D: Walk-in + 3-level

```
สั่ง SET → ข้าม stock check → ตัดสต็อก leaf nodes → ถ้าเกิน stock ให้ติดลบ
```

### Flow E: Dip Stock (นับสต็อก) กับ 3 ระดับ

```
1. เริ่ม session → snapshot เฉพาะ leaf nodes (filter non-leaf ออก)
2. Admin นับจำนวนจริง leaf nodes เท่านั้น
3. Approve → ปรับ stock leaf → cascade update child → parent
```

## 11.6 API & Backend Changes

### [CRITICAL-1 FIX] Stock Deduction — ใช้ `dinoco_get_leaf_skus()` แทน `$relations[$sku]`

**Snippet 2** `dinoco_inv_on_status_change()`:
```php
// เดิม (บรรทัด 3574-3587):
if (isset($relations[$sku]) && !empty($relations[$sku])) {
    foreach ($relations[$sku] as $child_sku) {
        dinoco_stock_subtract($child_sku, $qty, ...);  // ← แค่ 1 ระดับ
    }
}

// ใหม่:
$leaf_skus = dinoco_get_leaf_skus($sku, $relations);
foreach ($leaf_skus as $leaf) {
    dinoco_stock_subtract($leaf, $qty, ...);  // ← ตัด leaf เท่านั้น
}
```

เดียวกันกับ cancel stock return (บรรทัด 3620-3623) + **Snippet 5** admin cancel (บรรทัด 749-761)

### [CRITICAL-2 FIX] `dinoco_stock_auto_status()` — cascade ขึ้น grandparent

**Snippet 15** (บรรทัด 794-825):
```php
// เดิม: หา parent 1 ระดับ แล้วจบ
// ใหม่: หา ancestor ทุกระดับ แล้ว update ทุกตัว
$ancestors = dinoco_get_ancestor_skus($sku, $relations);
foreach ($ancestors as $ancestor_sku) {
    $ancestor_stock = dinoco_compute_hierarchy_stock($ancestor_sku, $relations);
    $ancestor_status = $ancestor_stock > 0 ? 'in_stock' : 'out_of_stock';
    // update $ancestor_sku status...
}
```

### [CRITICAL-3 FIX] `dinoco_get_reserved_qty()` — ancestor matching ทุกระดับ

**Snippet 15** (บรรทัด 903-912):
```php
// เดิม: หา parent 1 ระดับ
// ใหม่: หา ancestor ทุกระดับ
$match_skus = array($sku);
$ancestors = dinoco_get_ancestor_skus($sku, $relations);
$match_skus = array_merge($match_skus, $ancestors);
$match_skus = array_unique($match_skus);
```

### Inventory Database — save_sku_relation action

แก้ (บรรทัด 170-178) ให้รับ `grandchild_map`:
```
POST: { action: 'save_sku_relation', parent_sku: 'SET_A', child_skus: ['A', 'B'],
         grandchild_map: { 'B': ['G1', 'G2'] } }
```
PHP: save `relations[parent] = children` + save `relations[child] = grandchildren` + cleanup orphaned grandchild entries + validate hierarchy

### Inventory Database — get_catalog action

เพิ่ม flag ใน catalog data:
- `is_set` (เหมือนเดิม)
- `has_grandchildren` (ใหม่ — ถ้า child ตัวไหนมี entry ใน relations)
- `is_leaf` (ใหม่ — ไม่มี children)

### B2B Snippet 3 — GET /catalog

Return children + grandchildren data สำหรับ LIFF frontend:
```json
{
  "sku": "SET_A",
  "is_set": true,
  "children": ["CHILD_B", "CHILD_C"],
  "tree": { ... }  // จาก dinoco_get_sku_tree()
}
```

### B2B Snippet 3 — place-order

Validate + resolve leaf SKUs สำหรับ stock check ก่อนสร้าง order

### Product Delete Cleanup

เมื่อ admin ลบ product → scan `dinoco_sku_relations` ทุก entry → remove SKU ที่ถูกลบ → ถ้า children array เปล่า → ลบ entry ทั้ง row

## 11.7 UI Changes

### Thai Label Guide (ห้ามใช้คำว่า "หลาน" ใน UI)

| Context | Thai Label | หมายเหตุ |
|---------|-----------|---------|
| Admin: child ที่มี grandchildren | **ชุดย่อย** หรือ badge `[SUB-SET]` | ใน editor modal |
| Admin/B2B: grandchild | **ชิ้นส่วนย่อย** | ใช้ทุกที่แทนคำว่า "หลาน" |
| B2B: section header ใน detail | **ซื้อแยกชิ้น** | ใน product detail view |
| B2B: SET button | **เพิ่มชุดเต็มลงตะกร้า** | primary action |
| Admin: เพิ่ม grandchild | **เพิ่มชิ้นส่วนย่อย** | ปุ่มใน editor modal |
| Admin: section title | **องค์ประกอบชุด** | ใช้อยู่แล้วไม่ต้องเปลี่ยน |
| Admin: child count | **X ชิ้นในชุด** | ใน catalog card |
| Cart: duplicate warning | **มีสินค้าซ้ำกับชุด** | toast message |
| Cart: duplicate detail | **ซ้ำกับชุดด้านบน X ชิ้น** | ใน cart modal |
| Stock: computed stock | **(คำนวณ)** | ข้างตัวเลข stock ของ non-leaf |
| Dip Stock: filter info | **แสดงเฉพาะสินค้าที่นับได้** | info message |
| Admin: shared child info | **สินค้านี้อยู่ในชุดอื่นด้วย: [SET names]** | warning text |
| Error: circular ref | **ไม่สามารถเพิ่มได้ เนื่องจากจะเกิดการอ้างอิงวน** | |
| Error: max depth | **รองรับสูงสุด 3 ระดับ** | |
| Error: OOS | **สินค้าหมด** | badge เหมือนเดิม |

### Admin Product Catalog Card

SET badge เหมือนเดิม + child count ใน card:

```
Normal SET card:
┌─────────────────┐
│ [SET]  [Edit][X] │
│  [Product Image] │
│  ชุดกันล้ม Forza │
│  DNCSETXXX       │
│  1,990 THB       │
│  3 ชิ้นในชุด     │
└─────────────────┘

sub-SET card (child ที่มี grandchild):
┌─────────────────┐
│ [SET]  [Edit][X] │
│  [Product Image] │
│  กันล้มล่าง ชุด  │
│  DNCSUBXXX       │
│  890 THB         │
│  2 ชิ้นในชุด     │
│  [อยู่ใน: SETXXX]│  ← แสดง parent SET
└─────────────────┘
```

Admin catalog filter เพิ่ม: `ทั้งหมด | ชุด (SET) | เดี่ยว | ชิ้นส่วนย่อย` (ปัจจุบัน filter buttons ยังไม่มี HTML จริง ต้องสร้าง)

### Admin Product Catalog Editor Modal

แก้ section "องค์ประกอบชุด" — เพิ่ม grandchild + shared child warning:

```
┌─────────────────────────────────────────┐
│ องค์ประกอบชุด               SET ✓       │
├─────────────────────────────────────────┤
│ ┌─ [IMG] CHILD_A ──────────────── [X]  │
│ │   กันล้มบน | DNCXXX                   │
│ │   [ไม่มีชิ้นส่วนย่อย]                  │
│ │   [▶ เพิ่มชิ้นส่วนย่อย]                │  ← collapsed
│ └──────────────────────────────────────│
│                                         │
│ ┌─ [IMG] CHILD_B ─── [SUB-SET] ── [X]  │
│ │   กันล้มล่าง ชุด | DNCYYY              │
│ │   [▼ 2 ชิ้นส่วนย่อย]                   │  ← expanded
│ │  ┌────────────────────────────────┐   │
│ │  │ [IMG] กันล้มล่าง ซ้าย DNCZZZ [X]│   │
│ │  │ [IMG] กันล้มล่าง ขวา DNCWWW  [X]│   │
│ │  │ [🔍] ค้นหาเพิ่ม...              │   │  ← autocomplete
│ │  └────────────────────────────────┘   │
│ │  ⚠️ DNCZZZ อยู่ในชุดอื่นด้วย: SETYYY │  ← shared child warning
│ └──────────────────────────────────────│
│ [🔍 ค้นหาสินค้าเพื่อเพิ่ม...]            │
└─────────────────────────────────────────┘
```

Interaction spec:
- [▶]/[▼] toggle expand/collapse (animation 150ms)
- Autocomplete filter: circular ref + max depth 3
- ลบ child ที่มี grandchildren → prompt ยืนยัน "ลบจะเอาชิ้นส่วนย่อยออกด้วย ยืนยัน?"
- Shared child: แสดง warning text ใต้ child card (informational ไม่ block)
- Touch target [X] ลบ: min-width 44px

### B2B LIFF E-Catalog — Product Detail View (ใหม่ทั้งหมด)

**สำคัญ: ใช้ page view (ไม่ใช่ modal)** เพราะ LINE browser มีปัญหา scroll ใน modal + ต้องใช้ `history.pushState` ให้ browser back ทำงานถูก

**Loading state:**
```
┌──────────────────────────────────┐
│ ← กลับ                           │
│ ┌────────────────────────────┐   │
│ │  ░░░░░ skeleton ░░░░░       │   │
│ │  ░░░░ skeleton ░░░          │   │
│ └────────────────────────────┘   │
└──────────────────────────────────┘
```

**Error state:**
```
┌──────────────────────────────────┐
│ ← กลับ                           │
│  ไม่สามารถโหลดข้อมูลสินค้าได้     │
│  [ลองใหม่]                        │
└──────────────────────────────────┘
```

**Normal state (ขยาย):**
```
┌──────────────────────────────────┐
│ ← กลับ                           │
│ [Product Image - full width]      │
│                                   │
│ ชุดกันล้ม Honda Forza 350         │
│ SKU: DNCSETXXX                    │
│                                   │
│ ┌────────────────────────────┐   │
│ │ ราคาชุดเต็ม     ฿1,990      │   │
│ │ (ราคาปลีก ฿2,490 ลด 20%)    │   │  ← แสดง retail + tier discount
│ │ [+ เพิ่มชุดเต็มลงตะกร้า]    │   │  ← min-height 48px
│ └────────────────────────────┘   │
│                                   │
│ ────── ซื้อแยกชิ้น ──────         │
│                                   │
│ ┌────────────────────────────┐   │
│ │ [IMG] กันล้มบน              │   │
│ │ DNCXXX    ฿690   [- 0 +]   │   │  ← qty control inline
│ └────────────────────────────┘   │
│                                   │
│ ┌────────────────────────────┐   │
│ │ [IMG] กันล้มล่าง ชุด ฿890   │   │
│ │ DNCYYY         [- 0 +]     │   │
│ │ ┌──────────────────────┐   │   │
│ │ │ ซื้อแยกชิ้น:          │   │   │
│ │ │ กันล้มล่าง ซ้าย ฿490  │   │   │
│ │ │ [- 0 +]               │   │   │
│ │ │ กันล้มล่าง ขวา  ฿490  │   │   │
│ │ │ [- 0 +]               │   │   │
│ │ └──────────────────────┘   │   │
│ └────────────────────────────┘   │
│                                   │
│ OOS grandchild:                   │
│ ┌────────────────────────────┐   │
│ │ กันล้มล่าง ซ้าย  สินค้าหมด  │   │  ← disabled + grey
│ │ คาดว่ามีของ 15/05/2026      │   │  ← ETA ถ้ามี
│ └────────────────────────────┘   │
└──────────────────────────────────┘
```

Mobile UX notes:
- Grandchild ใช้ background สีต่าง (เช่น #f8fafc) + border-left แทน indent ลึก เพื่อประหยัด horizontal space ใน 375px
- ทุกปุ่ม [+] [-] ≥ 44px touch target
- Grandchild images เล็กกว่า (48x48px)
- `loading="lazy"` สำหรับ child/grandchild images
- `history.pushState` ให้ LINE browser back button กลับไป grid (ไม่ปิด LIFF)
- Scroll position preserved เมื่อกลับจาก detail

### B2B Cart — Duplicate Detection

**Timing**: แสดงตอนกด add grandchild ที่ซ้ำกับ SET ในตะกร้า (informational — ไม่ blocking)

**Toast notification (4 วินาที):**
```
┌──────────────────────────────────┐
│ ⚠️ "กันล้มล่าง ซ้าย" มีอยู่ใน   │
│ "ชุดกันล้ม Forza" ที่อยู่ในตะกร้า │
│ แล้ว — สั่งซ้ำหรือไม่?            │
│ [ยกเลิก]  [เพิ่มซ้ำ]              │
└──────────────────────────────────┘
```

**ใน Cart Modal:**
```
┌──────────────────────────────────┐
│ ⚠️ สินค้าซ้ำกับชุด               │
│ ────────────────────────          │
│ ชุดกันล้ม Forza x1     ฿1,990    │
│   (มี: กันล้มบน, ล่างซ้าย, ล่างขวา)│
│ กันล้มล่าง ซ้าย x2      ฿980    │  ← highlight ซ้ำ
│   ⚠️ ซ้ำกับชุดด้านบน 1 ชิ้น      │
│ ────────────────────────          │
│ รวม                     ฿2,970   │
│ [ยืนยันสั่งสินค้า]                 │
└──────────────────────────────────┘
```

### Inventory Manage Tab — Non-leaf Stock Display

```
┌──────┬───────────────┬────────┬─────────┬──────────┐
│ Img  │ SKU / Name    │ Stock  │ Status  │ Actions  │
├──────┼───────────────┼────────┼─────────┼──────────┤
│ [img]│ DNCSETXXX     │        │         │          │
│      │ ชุดกันล้ม Forza│ 5(คำนวณ)│ in_stock│ [expand] │
│      │ [SET] 3 ชิ้น  │        │         │ ไม่มี +/-│
├──────┼───────────────┼────────┼─────────┼──────────┤
│  ├── │ DNCXXX        │        │         │          │
│      │ กันล้มบน      │ 8      │ in_stock│ [+] [-]  │  ← leaf แก้ได้
├──────┼───────────────┼────────┼─────────┼──────────┤
│  ├── │ DNCYYY [SUB]  │ 5(คำนวณ)│ in_stock│ [expand] │
│      │ กันล้มล่าง ชุด │        │         │ ไม่มี +/-│
├──────┼───────────────┼────────┼─────────┼──────────┤
│  │├──│ DNCZZZ        │ 5      │ in_stock│ [+] [-]  │  ← leaf
│      │ กันล้มล่าง ซ้าย│        │         │          │
├──────┼───────────────┼────────┼─────────┼──────────┤
│  │└──│ DNCWWW        │ 7      │ in_stock│ [+] [-]  │  ← leaf
│      │ กันล้มล่าง ขวา │        │         │          │
└──────┴───────────────┴────────┴─────────┴──────────┘
```

- Non-leaf: stock แสดง "(คำนวณ)" ไม่มีปุ่มแก้สต็อกตรง
- Leaf: แก้สต็อกได้ปกติ [+] [-]
- Expand/collapse icon สำหรับ SET/SUB-SET

### Manual Invoice System + RPi Print Server

- Render grandchild names ใน invoice/picking list
- Row height calculation รองรับ nested children
- ใช้คำว่า "ชิ้นส่วนย่อย" ไม่ใช่ "หลาน"

## 11.8 Files Impact Map (16 ไฟล์)

### Phase 1: Core (ต้องเสร็จก่อน)

| # | ไฟล์ | DB_ID | สิ่งที่แก้ |
|---|------|-------|----------|
| 1 | `[B2B] Snippet 15: Custom Tables & JWT Session` | — | **สร้าง 7 helper functions** + แก้ `dinoco_stock_auto_status()` [C-2], `dinoco_stock_get()` [M-1], `dinoco_get_reserved_qty()` [C-3], `dinoco_check_stock_conflict()` [M-2], `dinoco_get_inventory_valuation()` [M-1] |
| 2 | `[B2B] Snippet 2: LINE Webhook Gateway` | — | แก้ stock deduct/return ใช้ `dinoco_get_leaf_skus()` [C-1] + cache invalidation cascade ancestors |
| 3 | `[Admin System] DINOCO Global Inventory Database` | 22 | แก้ `save_sku_relation` รับ grandchild_map + UI renderCatChildren 2 ระดับ + loadCatalog + Dip Stock filter non-leaf + Inventory Manage computed stock + product delete cleanup |
| 3.1 | `[Admin System] DINOCO Global Inventory Database` | 22 | V.39.1: Product Catalog hierarchy UI — filter bar (5 types: ทั้งหมด/SET/เดี่ยว/ลูกชิ้นส่วน/ชิ้นส่วนย่อย) + card type accents (border-left color) + hierarchy badges (child/grandchild) + context-aware modal (title + banner + set-section visibility) + `gotoParentSet()` navigate |

### Phase 2: B2B + Display

| # | ไฟล์ | DB_ID | สิ่งที่แก้ |
|---|------|-------|----------|
| 4 | `[B2B] Snippet 3: LIFF E-Catalog REST API` | 52 | GET /catalog return tree data + place-order resolve leaf SKUs |
| 5 | `[B2B] Snippet 4: LIFF E-Catalog Frontend` | 53 | V.32.0 DONE: SET badge + full-page detail view + children/grandchildren qty + cart duplicate detection |
| 6 | `[B2B] Snippet 1: Core Utilities & Flex Builders` | — | แก้ `b2b_calculate_box_manifest()` leaf resolution + Flex builders แสดง grandchild |
| 7 | `[B2B] Snippet 5: Admin Dashboard` | 54 | แก้ cancel stock restore ใช้ `dinoco_get_leaf_skus()` |
| 8 | `[B2B] Snippet 9: Admin Control Panel` | 58 | แก้ product list + save ส่ง grandchild relations |
| 9 | `[B2B] Snippet 10: Invoice Image Generator` | — | แก้ SET children display แสดง grandchild |
| 10 | `[Admin System] DINOCO Manual Invoice System` | — | **[MISSING-1]** Render grandchild ในใบแจ้งหนี้ (บรรทัด 1203, 3424-3441, 3544-3616, 4456-4506) |
| 11 | `rpi-print-server/` | — | **[MISSING-2]** Picking list + invoice template render nested children + row height calc (print_client.py:443,579, templates/*.html) |
| 12 | `[B2F] Snippet 2: REST API` | 1165 | **[DD-7]** `create-po`: สั่ง SET → auto-expand เป็น leaf items ก่อน save (Option A — expand ตอน create เท่านั้น) |

### Phase 3: B2C Guard + Polish

| # | ไฟล์ | DB_ID | สิ่งที่แก้ |
|---|------|-------|----------|
| 13 | `[System] DINOCO Edit Profile` | — | ใส่ `dinoco_is_top_level_set()` filter [DD-6] — ไม่ให้ sub-SET นับเป็น set bonus |
| 14 | `[System] Dashboard - Assets List` | — | ใส่ `dinoco_is_top_level_set()` filter [DD-6] — ไม่แสดง sub-SET เป็น bundle recipe |
| 15 | `[System] Member Dashboard Main` | — | ใส่ `dinoco_is_top_level_set()` filter [DD-6] — create_bundle เฉพาะ top-level SET |
| 16 | `[Admin System] DINOCO Legacy Migration Requests` | — | แก้ `expandSKUWithParent()` JS resolve 3 ระดับ |

### ไฟล์ที่ไม่ต้องแก้ code (แต่ได้ประโยชน์จาก Phase 1 อัตโนมัติ)

- **B2F Snippet 0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11** — ไม่ต้องแก้ code (DD-7 Option A: expand ตอน create-po แล้วเก็บ leaf items ตรง → Flex/PO Image/Ticket อ่าน expanded items อัตโนมัติ + `dinoco_stock_add()` cascade อัตโนมัติ)
- **B2F Snippet 2 (REST API)** — **ต้องแก้ 1 จุด**: `b2f_rest_create_po()` expand SET → leaf items ก่อน save
- **LIFF AI Snippet 1-2** — ไม่ใช้ SKU relations
- **MCP Bridge** — เรียก `dinoco_stock_get()` ซึ่งแก้ใน Phase 1 → downstream ถูกต้องอัตโนมัติ
- **OpenClaw dinoco-tools.js** — proxy ไป MCP Bridge → ถูกต้องอัตโนมัติ

## 11.9 Implementation Roadmap (3 Phases)

### Phase 1: MVP — Helpers + Stock Logic + Admin UI

```
Task 1.1: สร้าง 7 Helper Functions ใน Snippet 15
  → dinoco_get_leaf_skus, dinoco_is_leaf_sku, dinoco_get_ancestor_skus,
    dinoco_compute_hierarchy_stock, dinoco_is_top_level_set,
    dinoco_validate_sku_hierarchy, dinoco_get_sku_tree

Task 1.2: แก้ Stock Computation (Snippet 15)
  → dinoco_stock_auto_status() — cascade ขึ้น grandparent [C-2]
  → dinoco_stock_get() — ใช้ compute_hierarchy_stock [M-1]
  → dinoco_get_reserved_qty() — ancestor matching ทุกระดับ [C-3]
  → dinoco_check_stock_conflict() — ancestor matching [M-2]
  → dinoco_get_inventory_valuation() — computed stock [M-1]

Task 1.3: แก้ Stock Deduction/Return (Snippet 2 + Snippet 5)
  → ใช้ dinoco_get_leaf_skus() แทน $relations[$sku] [C-1]
  → cache invalidation cascade ancestors

Task 1.4: แก้ Product Catalog UI (Inventory Database)
  → save_sku_relation — รับ grandchild_map
  → renderCatChildren() — 2-level tree view
  → selectChildComponent() — support grandchild
  → saveCatalogItem() — ส่ง grandchild_map
  → filterChildOptions() — circular ref prevention
  → product delete → cleanup relations

Task 1.5: แก้ Inventory Manage + Dip Stock
  → Manage: computed stock สำหรับ non-leaf
  → Dip Stock: filter non-leaf (ใช้ dinoco_is_leaf_sku)

→ Deploy Phase 1 & Test
```

### Phase 2: B2B E-Catalog + Invoice + Print

```
Task 2.1: B2B REST API (Snippet 3) — catalog tree data + place-order leaf resolve
Task 2.2: B2B LIFF Frontend (Snippet 4) — product detail view + ซื้อ grandchild
Task 2.3: Flex Card Builders (Snippet 1) — grandchild display + box manifest
Task 2.4: Admin Dashboard cancel (Snippet 5) — leaf-only restore
Task 2.5: Admin Control Panel (Snippet 9) — product save + grandchild relations
Task 2.6: Invoice Image (Snippet 10) — grandchild display
Task 2.7: Manual Invoice System — nested children render [MISSING-1]
Task 2.8: RPi Print Server — picking list + invoice templates [MISSING-2]
Task 2.9: B2F Snippet 2 (REST API) — create-po auto-expand SET → leaf items (Option A) [DD-7]
        → Snippet 1/5/9/10 ไม่ต้องแก้ (อ่าน expanded po_items อัตโนมัติ)

→ Deploy Phase 2 & Test
```

### Phase 3: B2C Guard + Legacy + Docs

```
Task 3.1: Edit Profile — dinoco_is_top_level_set() filter [DD-6]
Task 3.2: Assets List — dinoco_is_top_level_set() filter [DD-6]
Task 3.3: Member Dashboard — dinoco_is_top_level_set() filter [DD-6]
Task 3.4: Legacy Migration — expandSKUWithParent() 3 ระดับ
Task 3.5: อัพเดท docs (CLAUDE.md, SYSTEM-REFERENCE, WORKFLOW-REFERENCE, FEATURE-SPECS)

→ Deploy Phase 3 & Test
```

## 11.10 Edge Cases & Rules

| Case | Rule |
|------|------|
| Shared child ข้าม SET | **Allow** — reserved qty นับรวมทุก SET (DD-3) |
| Circular reference (A→B→A) | **Block** — validate ก่อน save |
| Depth > 3 | **Block** — hard limit ไม่มีปุ่มเพิ่ม |
| ลบ product ที่เป็น grandchild | **Auto-cleanup** relations |
| Walk-in สั่ง SET 3 ระดับ | **ตัด leaf** + ถ้าเกินให้ **ติดลบ** (DD-5) |
| B2C เห็น sub-SET | **ไม่เห็น** — filter ด้วย `is_top_level_set()` (DD-6) |
| B2F receive-goods grandchild | **ไม่ต้องแก้ B2F** — `dinoco_stock_add()` trigger `auto_status()` cascade อัตโนมัติ |
| Dip Stock นับ sub-SET | **ไม่นับ** — filter non-leaf ออก (นับแค่ leaf) |
| Cart มีทั้ง SET + grandchild ของ SET เดียวกัน | **Frontend warn** — "มีสินค้าซ้ำกับชุด" |
| child/grandchild stock = 0 | parent stock **เป็น 0 ด้วย** (MIN cascade) |
| Shared child ถูกสั่งใน 2 SET ใน order เดียวกัน | deduct per-item loop (ไม่ flatten+unique) — A x qty(SET_X) + A x qty(SET_Y) |
| Admin ลบ child ที่เป็น sub-SET | cleanup ทั้ง child entry + grandchild entries ที่ orphan |
| B2F create-po สั่ง SET แต่ Maker ไม่มี leaf product | validate leaf SKUs มี `b2f_maker_product` → error "สินค้า X ยังไม่ลงทะเบียนกับโรงงาน" |

## 11.11 Risk & Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Stock double-deduction (ตัดทั้ง child + grandchild) | CRITICAL | Leaf-only rule + ใช้ `dinoco_get_leaf_skus()` ทุกจุด |
| Circular reference infinite loop | CRITICAL | `dinoco_validate_sku_hierarchy()` + depth guard + visited set |
| `auto_status()` ไม่ cascade ขึ้น grandparent | CRITICAL | ใช้ `dinoco_get_ancestor_skus()` + update ทุก ancestor |
| Reserved qty ไม่นับ order ที่สั่ง ancestor | CRITICAL | ใช้ `dinoco_get_ancestor_skus()` ใน match_skus |
| B2C เห็น sub-SET เป็น standalone bundle | HIGH | `dinoco_is_top_level_set()` filter ทุก B2C page |
| ลบ product ที่เป็น grandchild → stock chain = 0 | HIGH | Auto-cleanup relations on product delete |
| Performance 3-level query | LOW | `get_option()` cached + static cache ใน helpers + SKU < 200 |
| wp_options bloat | VERY LOW | SKU < 200, relations < 50 entries |

## 11.12 Testing Checklist

### Helper Functions

- [ ] `dinoco_get_leaf_skus('SET')` → returns [child_A, grand_1, grand_2]
- [ ] `dinoco_get_leaf_skus('CHILD_B')` → returns [grand_1, grand_2]
- [ ] `dinoco_get_leaf_skus('GRAND_1')` → returns [grand_1]
- [ ] `dinoco_get_leaf_skus('STANDALONE')` → returns [STANDALONE]
- [ ] `dinoco_is_leaf_sku('GRAND_1')` → true
- [ ] `dinoco_is_leaf_sku('CHILD_B')` → false
- [ ] `dinoco_get_ancestor_skus('GRAND_1')` → ['CHILD_B', 'SET']
- [ ] `dinoco_get_ancestor_skus('CHILD_A')` → ['SET']
- [ ] `dinoco_is_top_level_set('SET')` → true
- [ ] `dinoco_is_top_level_set('CHILD_B')` → false (เป็น child ของ SET)
- [ ] `dinoco_validate_sku_hierarchy('A', 'A')` → false (self ref)
- [ ] `dinoco_validate_sku_hierarchy('GRAND_1', 'SET')` → false (circular)

### Stock Deduction [C-1]

- [ ] สั่ง SET x2 → ตัด child_A x2, grand_1 x2, grand_2 x2
- [ ] สั่ง CHILD_B x1 → ตัด grand_1 x1, grand_2 x1 (ไม่ตัด CHILD_B)
- [ ] สั่ง GRAND_1 x3 → ตัด grand_1 x3 เท่านั้น
- [ ] Cancel SET → คืน leaf nodes ทุกตัว
- [ ] Walk-in SET → ตัด leaf + ติดลบได้

### Stock Status Cascade [C-2]

- [ ] grand_1 stock = 0 → child_B status = out_of_stock → parent status = out_of_stock
- [ ] B2F receive grand_1 stock +10 → child_B = in_stock → parent = in_stock (ถ้า child อื่นก็ in_stock)

### Reserved Qty [C-3]

- [ ] Order มี SET x1 → reserved ของ grand_1 = 1, grand_2 = 1, child_A = 1
- [ ] Order มี CHILD_B x2 → reserved ของ grand_1 = 2, grand_2 = 2
- [ ] Mixed: SET x1 + GRAND_1 x2 → grand_1 reserved = 3

### B2C Guard [DD-6]

- [ ] Edit Profile: sub-SET ไม่นับเป็น set bonus
- [ ] Assets List: sub-SET ไม่แสดงเป็น bundle recipe
- [ ] Member Dashboard: create_bundle เฉพาะ top-level SET

### Backward Compatibility

- [ ] Product 2 ระดับเดิม (ไม่มี grandchild) ทำงานเหมือนเดิม 100%
- [ ] Product เดี่ยว ทำงานเหมือนเดิม 100%
- [ ] Old orders ไม่กระทบ

### Admin UI

- [ ] สร้าง SET → เพิ่ม child → เพิ่ม grandchild → save → reload → verify
- [ ] ลบ grandchild → child กลับเป็น leaf
- [ ] ลบ product ที่เป็น grandchild → relations auto-cleanup
- [ ] Dip Stock: เห็นเฉพาะ leaf nodes

## 11.13 Rollback Plan

### Soft Rollback (~15 นาที)

1. ลบ grandchild entries จาก `dinoco_sku_relations` (entries ที่ child เป็น parent)
2. Helper functions ยังอยู่แต่จะ return 2-level อัตโนมัติ (เพราะไม่มี grandchild entries)
3. ลูกค้าหน้าบ้านไม่กระทบ

### Hard Rollback (~30 นาที)

1. Git revert commits ของ Phase 1-3
2. Push to main → GitHub Webhook auto-sync
3. Data format ไม่ต้อง rollback (format เดิมยัง compatible)

### ไม่กระทบ

- Orders เดิม (order_items เก็บ SKU text ตรง ไม่พึ่ง relations)
- Stock ตัวเลข (stock_qty เก็บ per SKU ไม่ว่าจะ leaf หรือ non-leaf)
- Debt/Invoice/Payment (ไม่เกี่ยวกับ SKU relations)
- B2F system + B2C member pages

---

## 11.14 Bug Fixes Batch (V.7.1 / V.42.4-42.8 — 2026-04-10)

### Summary

ระหว่าง audit ระบบ SKU hierarchy เจอ 3 CRITICAL + 2 HIGH bugs + เพิ่ม feature ใหม่ — รวมแก้ 7 commits

### 🔴 C1/C2 — Shared child (DD-3) แตก

**ไฟล์**: `[B2B] Snippet 15: Custom Tables & JWT Session` V.7.0 → **V.7.1**

**บัค**: `dinoco_get_leaf_skus`, `dinoco_compute_hierarchy_stock`, `dinoco_get_sku_tree` ส่ง `&$visited` เป็น reference → sibling branches ใช้ visited set เดียวกัน → รอบสอง `in_array` → return `0` / `[]` / empty tree

**Repro**: `SET_A → [CHILD_B, CHILD_C]` ทั้งคู่มี `LEAF_X` ลูก (DD-3 shared child), LEAF_X stock=10

- `compute_hierarchy_stock('SET_A')` → รอบแรก LEAF_X=10, รอบสอง LEAF_X=0 (visited) → `MIN(10,0)=0` ผิด → stock SET แสดง 0
- `get_leaf_skus('SET_A')` → คืน `[LEAF_X]` รอบเดียว → ตัดสต็อกไม่ครบ

**Fix**: เปลี่ยน `&$visited` → `$visited` (value-copy ต่อ branch) + `get_leaf_skus` return ผ่าน `array_values(array_unique($leaves))` dedup ป้องกัน double-subtract

### 🔴 C3 — Walk-in stock ติดลบไม่ได้ (DD-5)

**ไฟล์**: `[B2B] Snippet 15` V.7.1 + `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator` V.34.1 → **V.34.2**

**บัค**: `dinoco_stock_subtract` ใช้ `max(0, $old_qty - $qty)` cap → stock ติดลบไม่ได้ → ขัด DD-5 "walk-in order → stock ติดลบได้"

**Impact**: ร้าน walk-in สั่งเกิน stock → ตัดได้แค่เท่าที่มี → หนี้/INV ตัวเลข**ไม่ match** กับที่สั่งจริง

**Fix**:

- `dinoco_stock_subtract` เพิ่ม param `$allow_negative = false` — honor ทั้ง `dinoco_products.stock_qty` + `dinoco_warehouse_stock`
- Snippet 2 awaiting_confirm hook detect `_b2b_is_walkin` → ส่ง `allow_negative=true`

### 🟡 H1 — Auto-Split parent stock หาย

**ไฟล์**: `[Admin System] DINOCO Global Inventory Database` V.42.3 → **V.42.4**

**บัค**: ถ้า parent SKU เคยเป็น single (มี `stock_qty > 0`) แล้ว admin สร้าง children ผ่าน Auto-Split หรือ manual edit → parent กลายเป็น non-leaf → `dinoco_compute_hierarchy_stock()` ไม่อ่าน parent.stock_qty → stock หายจาก UI + reserved pool

**Fix (Backend)**: `save_sku_relation` ใน Admin Inventory
- เช็ค `$becoming_parent && !$had_children_before && $parent_stock > 0`
- ถ้าไม่มี POST flag `confirm_stock_migrate` → return `success:false code:parent_has_stock`
- ถ้ามี flag → โอน `stock_qty` ไปที่ leaf แรก + zero parent + insert 2 audit rows (`hierarchy_migrate_out` + `hierarchy_migrate_in`) ใน `dinoco_stock_transactions`

**Fix (Frontend V.42.5-V.42.6)**:

- Auto-Split modal → ส่ง `confirm_stock_migrate=1` auto
- Manual Edit Product modal → ส่ง `confirm_stock_migrate=1` auto + inspect `relationResponse.success === false` (เดิม HTTP 200 + body `success:false` → silent fail หลอกว่า "บันทึกสำเร็จ")

### 🟡 H2 — Defensive leaf guard

**ไฟล์**: `[B2B] Snippet 15` V.7.1

**Fix**: เพิ่ม guard ต้น `dinoco_stock_add/subtract`:
```php
if ( function_exists( 'dinoco_is_leaf_sku' ) && ! dinoco_is_leaf_sku( $sku ) ) {
    b2b_log( "[Stock] CRITICAL: (add|subtract) blocked — {$sku} ไม่ใช่ leaf (DD-2 violation)" );
    return new WP_Error( 'not_leaf', ... );
}
```
Caller ทุกตัวต้องเรียก `dinoco_get_leaf_skus()` expand ก่อน (Snippet 2/5 + B2F Snippet 2 ทำถูกแล้ว — ไม่มี regression)

### 🆕 V.42.7 — Auto-Split resume from orphan

**บัค**: ถ้า Auto-Split รอบก่อน fail ที่ step 4 → -L/-R orphan ค้างใน catalog → retry รอบใหม่โดน guard `"SKU มีอยู่แล้ว"` block → ติดลูป

**Fix**: `executeAutoSplitV2` detect orphan — ถ้า SKU มีใน catalog แต่ไม่ได้เป็น child ของ parent ไหน (no entry ใน `skuRelations[any_parent]`) → allow resume. `save_product` เป็น upsert (`DINOCO_Catalog::upsert()`) อยู่แล้ว → re-run ไม่ error

### 🆕 V.42.8 Phase 1 — Price Split Mode Selector (Auto-Split Modal)

4 modes สำหรับหารราคาแม่ → L/R อัตโนมัติ:

| Mode | พฤติกรรม | ตัวอย่าง |
|------|----------|----------|
| `equal` (default) | หาร /2 เท่ากัน | ลูก 1,750 → L=875 R=875 |
| `percent` | admin กำหนด % (ต้องรวม 100) | 60/40 → L=1050 R=700 |
| `quantity` | ตามสัดส่วนจำนวนชิ้น | L=1 R=2 → L=583 R=1167 |
| `manual` | กรอกเอง (ไม่แตะ) | — |

- ปุ่ม **"คำนวณ"** → auto-fill `split-col1-price` + `split-col2-price`
- Admin แก้ตัวเลขได้ทุกช่อง (suggestion + override)
- Reset กลับ `equal` ทุกครั้งเปิด modal
- Scope: **base_price เท่านั้น** — tier discount (Silver/Gold/Platinum/Diamond) copy จากแม่ผ่าน checkbox "คัดลอก tier"
- **ไม่แตะ** `moq` / `boxes_per_unit` / `units_per_box`

### 🆕 V.42.8 อื่นๆ

- Fix Auto-Split type check — `openAutoSplitDialog` เคย block `type !== 'child'` แต่ V.41.2 เพิ่มปุ่มให้ `single` แล้ว. V.42.8 allow `['single', 'child']`
- Debug console log ใน `saveCatalogItem` → payload + response ของ `save_sku_relation` + SKIPPED reason (ช่วย debug production)

### ✅ Phase 2 (V.42.15 → V.42.16 Redesign — Done 2026-04-10)

**V.42.15 (deprecated)**: เดิมแสดง equal-split suggestion `parent / N children` + `child_actual / M grandchildren` + diff% — **concept ผิด** เพราะ SET ผสม (TopCase + Top Rack + Pannier Rack) ราคาลูกไม่เท่ากันอยู่แล้ว → หารเท่าๆ กันไม่สื่ออะไร

**V.42.16 Sum Integrity Check** — เปลี่ยน concept จาก "แนะนำราคา" → "ตรวจความครบของราคา":

**Header card**: parent / sum(children effective) / margin + status:

- `ok` (|diff| < 1%) — เขียว "ราคาสมดุล"
- `loss` (sum > parent) — แดง "แม่ถูกกว่าผลรวมลูก" (ขาดทุน)
- `profit` (sum < parent) — ฟ้า "แม่แพงกว่าผลรวมลูก" (margin บวก)

**Effective cost**: ถ้า child เป็น sub-SET ใช้ `sum(grandchildren prices)` แทน child.price (ราคาจริง ไม่ใช่ sub-SET stale). แสดง note ถ้าใช้ effective != raw

**Per-child badge**: `ราคาจริง X฿ · Y% ของแม่` (contribution % ไม่ใช่ suggestion)

**Sub-SET integrity**: ถ้า child มี grandchildren → เทียบ `sum(gc)` กับ `child.price`:

- match → "✅ ชิ้นย่อยรวมตรงกับ sub-SET"
- mismatch → "⚠️ ลูกรวมเกิน +X฿ (+Y%)" หรือ "ℹ️ ลูกรวมต่ำกว่า -X฿ (-Y%)"

**Per-grandchild badge**: `ราคาจริง · Y% ของ sub-SET` (fallback "ของแม่" ถ้า child ไม่มีราคา)

**Helpers**:

- `_priceOf(sku)` — case-insensitive price lookup ผ่าน `cat()`
- `_parsePrice()` / `_fmtBaht()` เดิม

**Live update**: `input` handler บน `#cat-price` debounced 250ms (เหมือน V.42.15)

**Removed จาก V.42.15**: equal-split "แนะนำ X฿" badges + diff% comparisons (concept ผิด)

---

## 11.15 Hierarchy Tag System + UX Overhaul (V.42.9 → V.42.14 — 2026-04-10)

**Status**: Deployed 2026-04-10 | **File**: `[Admin System] DINOCO Global Inventory Database` | **Scope**: Product Catalog UI overhaul ใน Inventory Command Center

### 11.15.1 Problem & Goal

**ปัญหา**: Badge "SET" เก่าไม่สื่อโครงสร้าง 3 ระดับ + มีบัค blocker หลายจุดใน Edit Product modal + รูปโหลดบาง case มี CORS taint / random N/A / Auto-Split ทำได้แค่ 2 ชิ้น

**เป้าหมาย**:

1. Admin เห็น 4 ประเภทสินค้าชัดเจน: ชุดหลัก / ชิ้นส่วน / ชิ้นส่วนย่อย / เดี่ยว
2. Breadcrumb คลิกกลับไปที่ parent ได้ (navigation พื้นฐาน)
3. Save grandchild ได้ (เดิมมี blocker ตั้งแต่ V.40.5)
4. Auto-Split รองรับสินค้าที่แยกเป็นหลายชิ้น (ไม่ใช่แค่ L/R)
5. Admin override classification ได้เมื่อ auto-logic ไม่ตรงกับ business label

### 11.15.2 Version Matrix

| Version | Scope | Key Change |
|---------|-------|------------|
| **V.42.9** | CRITICAL bug | `skipRelations` condition wrong → grandchild ไม่บันทึก. แก้: skip เฉพาะ grandchild + ไม่เคยมี children |
| **V.42.10** | CORS Image Proxy | `POST /dinoco-stock/v1/image-proxy` — server-side fetch + base64 → แก้ canvas tainted (admin panel ↔ image cross-origin) |
| **V.42.11** | N-part Auto-Split | Dynamic 2-6 parts + parallel save ผ่าน `$.when.apply`. Count chip + pattern filter + renderSplitColumns(n) |
| **V.42.12** | Tag Redesign | 4 badge types (purple/blue/green/gray) + breadcrumbs + counts + image skeleton + case-insensitive lookup |
| **V.42.13** | Leaf-based Classification | เปลี่ยนจาก depth-based → leaf-based. แก้ `SET → [L, R]` ตรงๆ ที่ L/R classify ผิดเป็น child |
| **V.42.14** | Hybrid Override | `ui_role_override` column + radio chips + auto hint + badge indicator ✋ |

### 11.15.3 Badge System (V.42.12)

```text
┌──────────────────────────────────────────────────┐
│ 🟣 ชุดหลัก (set)        — purple #ede9fe/#6d28d9 │
│   └─ subtitle: "N ชิ้นส่วน · M ชิ้นย่อย"           │
│                                                   │
│ 🔵 ชิ้นส่วน (child)      — blue #dbeafe/#1e40af   │
│   └─ breadcrumb: ← {parent_name}                  │
│   └─ +N ชิ้นย่อย (ถ้าเป็น sub-SET)                 │
│   └─ +N ชุด (ถ้า shared child — DD-3)             │
│                                                   │
│ 🟢 ชิ้นส่วนย่อย (grandchild) — green #d1fae5/#065f46 │
│   └─ 3 ชั้น: ← {gp_name} › {parent_name}          │
│   └─ 2 ชั้น: ← {parent_name}                       │
│                                                   │
│ ⚪ เดี่ยว (single)      — gray (ไม่แสดง badge)    │
└──────────────────────────────────────────────────┘
```

**Accessibility**: ทุก badge color contrast > 7:1 (WCAG AAA). Touch target ≥ 44×44px สำหรับ breadcrumb click. Tooltip `title` attribute truncate fallback.

**Filter chips** (ลำดับใหม่): `ทั้งหมด → สินค้าเดี่ยว → ชุดหลัก → └─ ชิ้นส่วน → └─ ชิ้นส่วนย่อย` (indent 18px + prefix `└─` visual hierarchy)

### 11.15.4 Leaf-based Classification (V.42.13)

```javascript
// ใหม่ V.42.13 — leaf-based (แก้บัค SET → [L, R] flat)
if (myParent && isLeaf) → 'grandchild'   // leaf ใต้ parent เสมอ = แยกขายเป็นอะไหล่ได้
else if (myParent && isParent) → 'child'  // intermediate (sub-SET)
else if (isParent) → 'set'                // ชุดหลัก
else → 'single'
```

**Case matrix** (ทุก scenario):

| Structure | Expected |
|-----------|----------|
| `SET → [L, R]` (flat 2 ชั้น) | L/R = **grandchild** ✅ (เดิมผิดเป็น child) |
| `SET → [Upper → [L,R], Lower → [L,R]]` (3 ชั้นเต็ม) | Upper/Lower = child, L/R = grandchild ✅ |
| `SET → [Upper(leaf), Lower → [L,R]]` (ผสม) | Upper = grandchild, Lower = child, L/R = grandchild ✅ |

### 11.15.5 Hybrid Override (V.42.14)

**Backend**:

- Column `ui_role_override VARCHAR(20) DEFAULT 'auto'` ใน `wp_dinoco_products`
- Auto-migration ใน `get_catalog` handler (ALTER TABLE ถ้า column ยังไม่มี)
- `save_product` handler whitelist 5 values: `auto / set / child / grandchild / single`

**Frontend**:

- Radio chips ใน Edit Product modal (Section "แสดงเป็นหมวดหมู่" สีเหลือง)
- Hint badge "อัตโนมัติ: {label}" แสดง autoType ที่ leaf-based จะเดา
- Badge indicator ✋ (icon `fa-hand`) ต่อท้าย label ถ้า `is_override=true`
- `_productTypeMap[sku]` เก็บทั้ง `type` (final) และ `auto_type` (original)

**Logic**:

```javascript
var autoType = leafBasedClassify(sku);
var override = item.ui_role_override || 'auto';
if (override !== 'auto' && override !== autoType) {
    finalType = override;
    isOverride = true;
} else {
    finalType = autoType;
}
```

**Edge cases**:

- `override=child` บน single (ไม่มี parent) → ไม่ render breadcrumb
- `override=grandchild` บน single → badge อย่างเดียว
- `override=single` บน set/child/gc → แสดง badge "เดี่ยว" + ✋ (ปกติ single ไม่แสดง badge)

**สำคัญ**: Override เป็น **UI layer only** — ไม่กระทบ stock cut, orders, DD-2 (backend ใช้ structure จริงจาก `dinoco_sku_relations`)

### 11.15.6 Auto-Split N-part (V.42.11)

Refactor จาก hardcoded 2 columns → dynamic 2-6 parts:

**Parts count chips**: 2 / 3 / 4 / 5 / 6 ชิ้น (default 2)

**Pattern chips** (filter ตาม count):

- **2-part**: L|R, U|D, F|B, FR|RR
- **3-part**: L|R|U, L|R|T, F|L|R
- **4-part**: L|R|U|D, F|B|L|R
- **custom**: กำหนด suffix เอง (ทำงานทุก count)

**JS helpers**:

- `renderSplitColumns(n)` — สร้าง N columns พร้อม accent color
- `updateCustomSuffixInputs(n)` — N suffix input fields
- `renderPriceModeInputs(n)` — N percent/quantity inputs
- `filterPatternChipsByCount(n)` — hide/show chips ตรงตาม count
- `executeAutoSplitV2()` — parallel save N SKUs ผ่าน `$.when.apply($, deferreds)`
- `_splitState.col[1..N]` + `_splitState.sfx[N]`

**Price Split Modes** (ทำงานกับ N columns):

- **equal**: `floor(base/N)` + last column gets remainder
- **percent**: admin ใส่ % ทั้ง N ช่อง (validate sum = 100)
- **quantity**: `prices[i] = base * (qty[i] / total)`
- **manual**: admin กรอกเอง N ช่อง

### 11.15.7 Image System Fixes (V.42.10 + V.42.12)

**V.42.10 CORS Proxy**:

- New REST: `POST /dinoco-stock/v1/image-proxy`
- Body: `{ url: "https://..." }`
- Returns: `{ success, data_url: "data:image/jpeg;base64,...", size }`
- Security: https only, 10MB limit, image/* content-type, `current_user_can('manage_options')`
- Fallback chain ใน `generateLabeledImage`:
  1. `new Image()` + `crossOrigin='anonymous'` (best case)
  2. ถ้า canvas tainted → `new Image()` ไม่ใช้ CORS header
  3. ถ้ายังไม่ได้ → `POST /image-proxy` → data URL → canvas OK

**V.42.12 Image Skeleton**:

- `.cedit-thumb-wrap` wrapper + skeleton shimmer animation (1.2s)
- `<img loading="lazy">` onload → ซ่อน skeleton → smooth fade
- แก้บัครูปแฟลช N/A ก่อนค่อยมา

**V.42.12 Case-Insensitive Lookup**:

- Helper `cat(sku)` ใช้ uppercase cache
- Invalidate cache ทุกครั้ง `loadCatalog()` reload
- แก้บัค SKU case mismatch (relations uppercase แต่ `catalogData` บางตัว mixed case) → `catalogData[child]` miss → N/A random

### 11.15.8 Testing Checklist

- [x] บันทึก grandchild ผ่าน Manual Edit modal (V.42.9)
- [x] Auto-Split รูป overlay text ขึ้นถูกต้อง (V.42.10)
- [x] Auto-Split 3+ ชิ้น (V.42.11): L/R/T, F/B/L/R
- [x] Price mode ทั้ง 4 แบบทำงานกับ N cols (V.42.11)
- [x] Badge 4 ประเภทแสดงถูกต้อง (V.42.12)
- [x] Breadcrumb คลิกกลับไปที่ parent (V.42.12)
- [x] `SET → [L, R]` flat 2 ชั้น → L/R = grandchild (V.42.13)
- [x] Radio override → badge เปลี่ยน + ✋ indicator (V.42.14)
- [x] Manual Edit suggestion ราคาต่อหลาน (V.42.15 Phase 2 — deprecated V.42.16)
- [x] Sum Integrity Check (V.42.16): header card + contribution % + sub-SET check
- [x] Margin Analysis god mode (V.42.17): WAC banner + profit lines

---

## 11.16 Margin Analysis V.42.17 (God Mode)

**Status**: Deployed 2026-04-10 | **Files**: `[Admin System] DINOCO Global Inventory Database` V.42.17, `[B2B] Snippet 15: Custom Tables & JWT Session` V.7.2

### 11.16.1 Problem & Goal

**ปัญหา**: Admin ไม่รู้ว่าสินค้าแต่ละตัว + แต่ละ tier มี margin เท่าไหร่ → ตั้งราคาตาบอด + อาจขาดทุน Diamond tier ถ้า discount มากกว่า markup

**เป้าหมาย**:

1. Admin (god mode) เห็น WAC + profit per tier ใน Edit Product modal
2. Cost data = ความลับทาง business — ต้อง protect ที่ backend (ไม่ rely on client-side class)
3. SET ต้องคำนวณ cost จาก `sum(leaf_wac)` (ถูกหลัก DD-2 leaf-only)
4. Live update เมื่อแก้ราคา/ส่วนลด

### 11.16.2 Architecture

**5 Security Layers** (ทุกชั้นเช็คที่ `GET /margin-analysis`):

1. WP capability `manage_options` (`permission_callback`)
2. JWT token ใน header `X-Dinoco-God` (HMAC via `DINOCO_JWT::verify()`)
3. Scope check `payload.scope === 'god_cost'`
4. User match `payload.uid === current_user_id()`
5. Rate limit 30 req/min/user (transient)

**PIN → JWT flow**:

```text
1. Admin กด version badge ค้าง 2.5s → prompt PIN
2. checkPin(pin) — client gate (UI only — สำหรับเปิด body.god-mode class)
3. POST /dinoco-stock/v1/god-mode/verify { pin }
   → server verify DINOCO_GOD_MODE_PIN constant + rate limit 5 fail/5min
   → issue JWT 30 min via DINOCO_JWT::create({ uid, scope: 'god_cost' })
4. sessionStorage.setItem('dnc_god_token', jwt)
5. sessionStorage.setItem('dnc_god_token_exp', Date.now() + ttl*1000)
6. All margin-analysis calls ใช้ X-Dinoco-God: <token> header
```

**Brute-force protection**:

- verify endpoint: 5 fail/5 นาที lockout per user
- Counter **clear on success** (ไม่ให้ counter ค้างต่อเนื่อง)
- TTL **preserved across fails** (ไม่ reset → ไม่ sliding window)
- Check rate limit ก่อน `hash_equals` (ป้องกัน wasted cycles)

### 11.16.3 Backend: `dinoco_get_wac_for_skus()` Helper

สร้าง helper ใหม่ใน Snippet 15 V.7.2 แทน `dinoco_get_inventory_valuation()` ที่หนักเกิน:

| Source | Method | Notes |
|--------|--------|-------|
| **WAC** (preferred) | Single SQL query `dinoco_stock_transactions WHERE type='b2f_receive'` | weighted avg `SUM(cost × qty) / SUM(qty)` |
| **B2F maker_product** (fallback) | `get_posts()` + PHP post-filter case-insensitive | `mp_product_sku` ไม่ normalize uppercase → ต้อง filter PHP |
| **none** | Return 0 + `source='none'` | admin เห็น "ยังไม่มีต้นทุน WAC" |

**Cache**:

- Per-SKU: `dnc_wac_{md5(sku)}` TTL 1 ชม
- Maker exchange rate: `dnc_maker_rate_{maker_id}` TTL 10 นาที (shared)
- **Auto-invalidate**: hook ใน `dinoco_stock_add()` — ถ้า `$type === 'b2f_receive'` → clear cache SKU นั้น (defense in depth — ไม่ rely on `do_action`)

### 11.16.4 REST Endpoints

**`POST /dinoco-stock/v1/god-mode/verify`**:

Request: `{ "pin": "1234" }`

Response (success): `{ "success": true, "token": "<jwt>", "ttl": 1800 }`

Errors:

- `401 bad_pin`: PIN ผิด
- `429 rate_limited`: ผิดครบ 5 ครั้ง
- `500 jwt_unavailable`: `DINOCO_JWT` class missing

**`GET /dinoco-stock/v1/margin-analysis?sku=X`**:

Headers: `X-WP-Nonce: <nonce>`, `X-Dinoco-God: <jwt>`

Response:

```json
{
  "success": true,
  "data": {
    "sku": "DNCSET123",
    "is_set": true,
    "retail": 3190,
    "leaf_breakdown": [
      { "sku": "LEAF_A", "wac": 900, "source": "wac" },
      { "sku": "LEAF_B", "wac": 900, "source": "wac" }
    ],
    "total_cost": 1800,
    "cost_source": "complete",
    "is_incomplete": false,
    "missing_wac_leaves": []
  }
}
```

**Note**: ไม่มี `tiers` field — frontend คำนวณ profit client-side จาก `total_cost + retail + slider values` (ไม่เรียก API ซ้ำเมื่อ slider เปลี่ยน)

### 11.16.5 Frontend Implementation

**`fetchMarginAnalysis(sku)`** — called ใน `openEditCatalogModal()` ถ้า god mode:

1. Read JWT จาก sessionStorage
2. GET `/margin-analysis?sku=X` with `X-Dinoco-God` header
3. On success: `window._marginContext = data` + `renderMarginBanner(data)` + refresh all tier previews
4. On 403: clear sessionStorage token, hide banner
5. On 429: console warn

**`updateTierPreview(tid)` extend** — client-side profit calc:

```text
dealer = retail × (1 - discPct/100)   [V.38.6 existing]
profit = dealer - total_cost           [V.42.17 new]
margin% = profit / dealer × 100        [V.42.17 new]

color: profit > 0 → เขียว, profit < 0 → แดง, 0 → เทา
```

แสดงเป็น line ใต้ dealer price ในแต่ละ tier card (5 tiers รวม)

**`renderMarginBanner(data)`** — dark gradient card ใน Tier Pricing section:

- แสดง `ต้นทุนรวม: X฿` + source label ("รวมจาก N ชิ้นส่วนย่อย" หรือ "WAC")
- ถ้า `is_incomplete` → warning "ขาดต้นทุน N ชิ้น: ..." (list 3 ชื่อแรก)
- **XSS-safe**: SKU names ใช้ jQuery `$('<span>').text()` ไม่ใช่ `.html()`

**Live update**:

- `$(document).on('input', '#cat-price', ...)` — debounced 250ms
- Re-render children list (V.42.15) + refresh all tier previews (profit lines update ทันที)

### 11.16.6 Code Review Fixes Applied (5 HIGH + 2 MEDIUM)

จาก `code-reviewer` agent — ตรวจก่อน commit:

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | HIGH | Rate limit TTL reset sliding window | Check before `hash_equals` + preserve TTL + clear on success |
| 2 | HIGH | B2F fallback miss เพราะ `mp_product_sku` ไม่ normalize | PHP post-filter case-insensitive (แทน `meta_query IN`) |
| 3 | HIGH | `UPPER(sku)` prevent index use | ลบ `UPPER()` — txn table uppercase อยู่แล้ว |
| 4 | HIGH | `b2f_receive_completed` hook ไม่ fire → cache stale 1 ชม | Invalidate ใน `dinoco_stock_add` type=b2f_receive (defense in depth) |
| 5 | HIGH | Backend `tiers` field ไม่มี caller | Drop field — frontend client-side math only |
| 6 | MEDIUM | `missing_wac_leaves` ใน innerHTML = XSS risk | jQuery `.text()` escape |
| 8 | MEDIUM | `#cat-avg-cost` + banner ซ้ำ | Hide `#cat-avg-cost` เมื่อ god mode |

### 11.16.7 Testing Checklist

- [x] PIN verify issue JWT (server-side) + sessionStorage token
- [x] PIN ผิด 5 ครั้ง → 429 lockout + TTL ไม่ reset
- [x] PIN ถูก → counter clear
- [x] Edit SET single leaf → banner แสดง "ต้นทุนรวม" + "WAC" label
- [x] Edit SET 3 leaves → "รวมจาก 3 ชิ้นส่วนย่อย" label
- [x] Edit SET ที่ leaf บางตัวไม่มี WAC → `is_incomplete` + `missing_wac_leaves` list
- [x] แก้ `#cat-price` slider → profit line update ทันที (debounced 250ms)
- [x] แก้ tier discount → profit line update ทันที
- [x] Diamond discount สูงจนติดลบ → profit line แดง + `fa-triangle-exclamation`
- [x] สินค้าใหม่ไม่มี receive → banner "ยังไม่มีต้นทุน WAC"
- [x] DevTools remove `body.god-mode` class → ปุ่มหาย แต่ banner/data ยังอยู่ (backend enforce)
- [x] Token expire 30 min → fetchMarginAnalysis 403 → clear sessionStorage + hide banner
- [x] Audit log: `b2b_log('[Margin] uid=X accessed cost for sku=Y')` ทุก access
- [x] `#cat-avg-cost` hidden เมื่อ god mode (banner replaces)

### 11.16.8 Rollback Plan

**Soft**: remove `body.god-mode` class ใน DevTools → banner ไม่โผล่ตอน open modal (non-god modal flow ปกติ)

**Hard**: revert commit V.42.17 — Snippet 15 V.7.2 + Admin Inventory V.42.17 revert → ไม่มี backend helper + ไม่มี endpoint → frontend fetch 404 silent fail → banner hide

**Data integrity**: V.42.17 ไม่แก้ database schema เลย — rollback safe 100%. Cache transient หายเองใน 1 ชม

## 1.17 V.7.0 Order Intent System + Ungroup (2026-04-17 — Deployed)

**Status**: Deployed 2026-04-17 | **Commits**: `512542e` (UI) + `2a99e85` (backend+schema) + `2a15431` (docs) | **Plan**: `/Users/pavornthavornchan/.claude/plans/sunny-spinning-quill.md`

### 1.17.1 Problem & Goal

**ปัญหา**: LIFF B2F E-Catalog เดิม บังคับ SET-centric layout เดียว แต่ admin สั่งของจากโรงงานได้หลายระดับต่างกัน — ไม่แยกระดับให้ชัด → admin งง + Maker ไม่รู้ว่าสั่งอะไร

**เป้าหมาย**:
- Admin สั่งของได้ 3 ระดับชัดเจน: ชุดเต็ม / แยกชุด / ชิ้นเดี่ยว
- Backend tag intent per item (trace ได้ใน PO)
- Cross-factory SETs (ต้องใช้ parts หลายโรงงาน) auto-hide — admin จัดการผ่าน parts โดยตรง + stock DD-2 assemble ให้เอง
- Cart persist across reloads + undo submit window 30 วิ

### 1.17.2 Taxonomy (3 Cards + 1 Hidden)

| Card | production_mode | Color | ตัวอย่าง | จำนวนชิ้นต่อ order |
|------|-----------------|-------|----------|-------------------|
| 🟣 ชุดเต็ม | `set_assembled` | #7c3aed purple | DNCCBSET500X001 (กันล้ม) | 4+ ชิ้น |
| 🟠 แยกชุด | `sub_unit` | #f59e0b amber | DNCGNDPROS500 (Pannier L+R) | 2 ชิ้น |
| ⚪ ชิ้นเดี่ยว | `single` | #9ca3af gray | DNCGNDPROT500 (Top Rack) | 1 ชิ้น |
| 🟠 DINOCO ประกอบ (hidden) | `cross_factory_assembly` | amber dashed | DNCGNDSDPRO500S (box+rack) | ซ่อน default |

### 1.17.3 Data Model — 3 Axes Orthogonal

```
Axis 1 — production_mode (physical reality)
  4 values: set_assembled | sub_unit | single | cross_factory_assembly

Axis 2 — confirmation_status (admin review state)
  2 values: confirmed | auto_synced

Axis 3 — admin_display_mode (UI override)
  3 values: auto | as_set | as_parts
```

**Card variant decision** (frontend — no heuristic):

| production_mode | confirmation_status | admin_display_mode default | LIFF behavior |
|-----------------|---------------------|----------------------------|---------------|
| set_assembled | confirmed | auto | 🟣 ชุดเต็ม card |
| set_assembled | auto_synced | auto | 🟣 + ⚠️ "ยังไม่ยืนยัน" |
| sub_unit | — | auto | 🟠 แยกชุด card |
| single | — | — | ⚪ ชิ้นเดี่ยว card |
| cross_factory_assembly | — | `as_parts` (default!) | ซ่อน SET → parts เท่านั้น |
| any | — | `as_parts` (manual) | hide parent, render children flat |

### 1.17.4 Schema V.11.0

**File**: `B2F-SCHEMA-V11.sql` (root-level — reference spec, Audit V.3.3 inline DDL)

```sql
-- STEP 0: Extend observations ENUM
ALTER TABLE wp_dinoco_maker_product_observations
  MODIFY COLUMN source ENUM('cpt','junction','diff','classification_change') NOT NULL;

-- STEP 1: Junction +6 columns
ALTER TABLE wp_dinoco_product_makers
  ADD COLUMN production_mode ENUM(
      'set_assembled','sub_unit','single','cross_factory_assembly'
  ) NOT NULL DEFAULT 'single' AFTER status,
  ADD COLUMN confirmation_status ENUM('confirmed','auto_synced')
      NOT NULL DEFAULT 'auto_synced' AFTER production_mode,
  ADD COLUMN admin_display_mode ENUM('auto','as_set','as_parts')
      NOT NULL DEFAULT 'auto' AFTER confirmation_status,
  ADD COLUMN missing_leaves_count SMALLINT UNSIGNED NOT NULL DEFAULT 0
      AFTER admin_display_mode COMMENT 'denormalized cache',
  ADD COLUMN confirmed_by BIGINT UNSIGNED DEFAULT NULL,
  ADD COLUMN confirmed_at DATETIME DEFAULT NULL,
  ADD KEY idx_maker_prod_display (maker_id, production_mode, admin_display_mode),
  ADD KEY idx_maker_confirmation (maker_id, confirmation_status);

-- STEP 2: CHECK constraints (MySQL 8.0.16+ enforces; lower: PHP validator = primary)
ALTER TABLE wp_dinoco_product_makers
  ADD CONSTRAINT chk_mode_display
  CHECK (NOT (production_mode='single' AND admin_display_mode='as_parts')),
  ADD CONSTRAINT chk_confirmed_consistency
  CHECK (confirmation_status='auto_synced' OR 
         (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL));

-- STEP 3: Schema markers
UPDATE wp_options SET option_value='11.0' WHERE option_name='b2f_schema_version';
INSERT INTO wp_options (option_name, option_value) VALUES
  ('b2f_schema_v11_activated', CURRENT_TIMESTAMP);
```

### 1.17.5 ACF — Snippet 0 V.3.5

`po_items` repeater +4 sub-fields:

```
poi_order_mode: select ['full_set','sub_unit','single_leaf']  required
poi_intent_notes: textarea  optional (general note)  max 200 chars
poi_source_sku: text  optional (SKU ที่ admin click ก่อน DD-7 expand)
poi_production_mode_snapshot: text (snapshot — audit trail)
```

Postmeta PO-level:
```
_b2f_order_intent_summary: JSON
  { full_set_count, sub_unit_count, single_leaf_count, total_items }
  show_in_rest=false + auth_callback=manage_options
```

### 1.17.6 REST API — Snippet 2 V.11.0

**Enriched `GET /b2f/v1/maker-products/{maker_id}`** (flag-gated `b2f_flag_v11_explicit_mode`):

Per-product enriched fields: `production_mode`, `confirmation_status`, `admin_display_mode`, `missing_leaves[]`, `missing_leaves_count`

Response-level `maker_profile.stats`: `{set_count, sub_unit_count, single_count, cross_factory_count, unconfirmed_count, hidden_as_parts_count}`

Transient cache: `b2f_maker_products_v11_{maker_id}` 10min TTL + invalidation via `do_action('b2f_junction_updated', $maker_id)` central hook

**7-Rule Validator `POST /b2f/v1/create-po`**:
1. `order_mode` strict enum match (in_array strict)
2. `full_set` → SKU `production_mode` ∈ {set_assembled, cross_factory_assembly}
3. `sub_unit` → SKU `production_mode='sub_unit'`
4. `single_leaf` → SKU `production_mode='single'`
5. `source_sku` ใน ancestor chain (via `dinoco_get_ancestor_skus()`)
6. `intent_notes` sanitize + mb_substr max 200 chars
7. Rate limit `b2f_rate_limit($user_id, 5, 60)`

**DD-3 composite merge key**: `$merged["{$sku}|{$order_mode}|{$source_sku}"]` — same SKU + different mode preserved as separate PO items

**PII Callback Gate** `b2f_format_po_detail()`:
```php
$is_admin = current_user_can('manage_options') || 
            (b2f_verify_admin_token($req)['is_admin'] ?? false);
if (!$is_admin) {
    // Strip: poi_intent_notes, poi_production_mode_snapshot, order_intent_summary
}
```

**NEW `POST /b2f/v1/po-undo-submit`**:
- 30s DB-clock window (`post_date > NOW() - INTERVAL 30 SECOND`)
- Dual auth (WP nonce OR X-B2F-Token admin JWT)
- FOR UPDATE + GET_LOCK (concurrent safety)
- FSM draft→cancelled + stock restore + credit refund
- Errors: 410 undo_window_expired, 409 already_cancelled (idempotent)

**4 New Audit REST Endpoints** (namespace `/dinoco-b2f-audit/v1/`):
- `POST /junction-update-classification` — atomic single-row update
- `POST /junction-bulk-update-display` (max 200 SKUs + idempotency_key)
- `POST /junction-confirm-classification` (idempotent re-confirm)
- `POST /phase4-migration` (5/hr rate limit + CSV dry-run export)
- `GET /phase4-migration-state` (dashboard UI)

### 1.17.7 Migration — Phase 4 Inline

**Function**: `b2f_phase4_run_classification_migration($dry_run, $batch)` in Audit V.3.3

**7-step pipeline**:
```
STEP 0: Set lock flag (CRIT-4 — prevent dual-write race)
STEP 1: MySQL version check (non-blocking log)
STEP 2: Pre-migration mysqldump → wp-content/b2f-backups/b2f_v11_{ts}.sql (0700)
STEP 3: ALTER TABLE idempotent (INFORMATION_SCHEMA check per column)
STEP 4: Classification loop — batch 200 rows + 50ms gap
  IF has_children AND missing_leaves>0:
    production_mode = 'cross_factory_assembly'
    admin_display_mode = 'as_parts'
  ELIF has_children AND has_parent:
    production_mode = 'sub_unit'
  ELIF has_children:
    production_mode = 'set_assembled'
  ELSE:
    production_mode = 'single'
  
  # Idempotent guard — preserve admin choice
  UPDATE ... WHERE confirmation_status='auto_synced' OR confirmed_at IS NULL
STEP 5: Update progress state JSON
STEP 6: Clear lock flag
STEP 7: Enqueue replay queued dual-writes
```

**Expected HTP result** (from catalog CSV):
- 9 orphan SETs → `set_assembled` + `auto_synced` + `auto`
- 7+ cross-factory SETs (missing boxes) → `cross_factory_assembly` + `as_parts` auto-hidden
- Parts (PROS500, etc.) → `sub_unit`
- Leaves (PROT500) → `single`

### 1.17.8 Ungroup System (3 Ways)

**1. Auto-detect (migration default)**:
`missing_leaves > 0` → `admin_display_mode='as_parts'` (SET hidden)

**2. Bulk action (Admin Makers tab V.7.1)**:
- Filter "⚠️ ยังไม่ยืนยัน" → select 200+ SKUs
- `POST /junction-bulk-update-display` (max 200 + idempotency_key)
- Atomic START TRANSACTION + per-SKU FOR UPDATE

**3. Per-SKU manual**: edit modal radio `auto | as_set | as_parts`

### 1.17.9 Feature Flags

```
b2f_flag_v11_explicit_mode   — backend returns production_mode in API (default OFF)
b2f_flag_order_intent        — LIFF UI + order_mode validator (requires v11)
b2f_flag_ungroup_auto_hide   — migration missing_leaves → as_parts auto (requires Phase 4 finished_at)
```

**Dependency chain enforced** ใน flag setter (Audit V.3.3):
- `order_intent=ON` requires `v11_explicit_mode=ON`
- `ungroup_auto_hide=ON` requires `b2f_phase4_migration_state.finished_at`
- `v11_explicit_mode=OFF` requires `order_intent=OFF` (downstream safety)

**Rollback**: `update_option(flag, false)` → instant revert ไม่ต้อง re-deploy

### 1.17.10 Error Code Registry (Snippet 1 V.7.0)

```php
const B2F_ERR_INVALID_ORDER_MODE        = 'invalid_order_mode';         // 400
const B2F_ERR_SOURCE_SKU_NOT_ANCESTOR   = 'source_sku_not_ancestor';    // 400
const B2F_ERR_UNDO_WINDOW_EXPIRED       = 'undo_window_expired';        // 410
const B2F_ERR_CHECK_CONSTRAINT          = 'check_constraint_violation'; // 422
const B2F_ERR_STALE_JUNCTION_WRITE      = 'stale_junction_write';       // 409
const B2F_ERR_BULK_LIMIT_EXCEEDED       = 'bulk_limit_exceeded';        // 400
const B2F_ERR_MYSQL_VERSION_TOO_LOW     = 'mysql_version_too_low';      // warning log only
const B2F_ERR_MIGRATION_IN_PROGRESS     = 'migration_in_progress';      // 503
```

### 1.17.11 PII Protection

**`poi_intent_notes`** = admin-only (may contain PII like "คุณมานะ เคลม #1234")

**Defense layers**:
1. CPT `show_in_rest=false` (Snippet 0) — blocks `/wp/v2/b2f_order/{id}`
2. Postmeta `show_in_rest=false` + `auth_callback=manage_options` (Snippet 0)
3. `b2f_format_po_detail()` callback-level gate (Snippet 2) — strips for non-admin
4. Maker LIFF V.4.3 defensively ignores `poi_intent_notes`
5. PO Image V.3.0 does NOT read intent_notes (GD renderer)
6. Flex builders (Snippet 1 V.7.0) defensive `unset()` before render

### 1.17.12 Cart Persistence

**localStorage key**: `b2f_cart_v7_{maker_id}`

**Schema v7**:
```json
{
  "_schema": 7,
  "items": {
    "DNCCBSET500X001": {
      "qty": 5,
      "price": 3902,
      "name": "Crash Bar SET",
      "image": "https://...",
      "order_mode": "full_set",
      "source_sku": "DNCCBSET500X001",
      "intent_notes": null
    }
  },
  "updated_at": "2026-04-17T14:30:00+07:00"
}
```

**Lifecycle**:
- Save on every qty change (debounced)
- Restore on LIFF init
- Clear after successful submit
- Backward compat: V.6.6 code ignores new keys gracefully

### 1.17.13 Submit Flow

```
Cart (dual section) → Submit Review Gate (3-bucket accordion) → 
POST /create-po → Success Toast "ยกเลิกได้ 30 วิ" → 
[Optional] POST /po-undo-submit (FSM draft→cancelled)
```

**NO warn modal for mixed mode** (per user decision — สั่งผสม 3 โหมดได้เลย)

### 1.17.14 Rollout Plan (No Canary)

1. Deploy Snippet 0.5 V.1.2 + Snippet 1 V.7.0 (flag helpers + whitelist)
2. Schema ALTER + Phase 4 migration via Audit V.3.3 dashboard
3. Deploy Snippet 2 V.11.0 (enriched API)
4. Deploy Snippet 4/5/8/9/10 UI
5. Flip all 3 flags ON ทันที (testing phase — no canary per user decision)
6. Monitor 1 week → rollback instant ถ้าพบ issue

### 1.17.15 Regression Scenarios (REG-B2F-V7-01 to 08)

ต้องเพิ่มเข้า `openclawminicrm/docs/regression-guard.md`:

| ID | Scenario | Expected |
|----|----------|----------|
| REG-B2F-V7-01 | create-po `full_set` on SKU production_mode=`single` | 400 `invalid_order_mode` |
| REG-B2F-V7-02 | po-undo-submit after 31s | 410 `undo_window_expired` |
| REG-B2F-V7-03 | bulk-update-display 201 SKUs | 400 `bulk_limit_exceeded` |
| REG-B2F-V7-04 | CHECK constraint single→as_parts (MySQL 8.0.16+) OR PHP validator | 422 `check_constraint_violation` |
| REG-B2F-V7-05 | Flag `v11_explicit_mode=OFF` → API strips new fields | 200 V.10.5-compat shape |
| REG-B2F-V7-06 | Concurrent toggle + create-po race | FOR UPDATE prevents stale |
| REG-B2F-V7-07 | Legacy PO no `poi_order_mode` → display "—" | UI fallback per Decision #9 |
| REG-B2F-V7-08 | `intent_notes` 201 chars → auto-truncate | Stored 200 chars |

### 1.17.16 Files Changed (11 total + 2 docs)

| File | Version | LOC+ | Commit |
|------|---------|------|--------|
| B2F-SCHEMA-V11.sql | NEW | +299 | 2a99e85 |
| [B2F] Snippet 0 | V.3.4 → V.3.5 | +65 | 2a99e85 |
| [B2F] Snippet 0.5 | V.1.1 → V.1.2 | +183 | 2a99e85 |
| [B2F] Snippet 1 | V.6.6 → V.7.0 | +677 | 2a99e85 |
| [B2F] Snippet 2 | V.10.5 → V.11.0 | +683 | 2a99e85 |
| [B2F] Snippet 4 | V.4.2 → V.4.3 | +24 | 512542e |
| [B2F] Snippet 5 | V.6.6 → V.7.1 | +285 | 512542e |
| [B2F] Snippet 8 | V.6.6 → V.7.0 | +600 | 2a99e85 |
| [B2F] Snippet 9 | V.3.5 → V.3.6 | +157 | 512542e |
| [B2F] Snippet 10 | V.2.7 → V.3.0 | +93 | 512542e |
| Audit | V.3.2 → V.3.3 | +1664 | 2a99e85 |
| CLAUDE.md + SYSTEM-REFERENCE.md | — | +68 | 2a15431 |

**Total code**: ~4,730 LOC | **Total docs**: ~500 LOC

### 1.17.17 User Decisions Applied (14 total)

1. ✅ Cart persistence (localStorage)
2. ✅ Color raw_parts merged into 🟠 แยกชุด
3. ✅ Maker LIFF Tier 1 (show mode badge, no intent_notes)
4. ❌ No pair-derive helper (admin register L/R separately)
5. ❌ No canary (deploy all immediately)
6. ❌ No dry-run wait period
7. ✅ intent_notes optional general note
8. ❌ No warn modal mixed mode
9. ✅ Legacy PO = display "—"
10. ✅ Reuse observations table
11. ❌ No override chip (admin ลบ+สั่งใหม่)
12. ✅ Hide banner when unconfirmed=0
13. ❌ No MySQL upgrade (PHP validator primary)
14. ❌ No "เคลม/เติมสต็อก/อะไหล่" terminology

### 1.17.18 Multi-Agent Audit Resolved

**8 agents × 2 rounds = 48+ issues integrated**:
- ux-ui-expert: 7 priority fixes
- tech-lead × 2: 15 critical gaps + cross-system isolation verified
- fullstack-developer × 2: security + performance + helpers + code-level bugs
- database-expert × 2: schema refinements + migration idempotency
- api-specialist: endpoint specs + validator gaps
- security-pentester: PII filter + injection risks
- Explore: docs/wiki/config gaps

---

# 13. Regression Guard System V.1.5 (OpenClaw)

**Status**: Deployed 2026-04-11 | **Files**: `openclawminicrm/scripts/regression.js`, `seed-regression.js`, `proxy/index.js` (`runRegressionTurn`), `smltrackdashboard/src/app/train/components/RegressionTab.tsx` | **Spec**: `openclawminicrm/docs/regression-guard.md` | **Canonical Brain**: `openclawminicrm/docs/chatbot-rules.md`

## 13.1 Problem & Goal

**ปัญหา**: บอสแก้ bug chatbot ซ้ำๆ หลายรอบเพราะเวลาแก้ feature ใหม่ → rule เก่าหลุด → bug เดิมกลับมา เสียเวลา 8-16 ชม./เดือน

**เป้าหมาย**:
- Regression bug rate = 0% สำหรับ bugs ใน Fix History
- Block deploy ถ้า critical scenarios fail
- Scale ได้ — เจอ bug ใหม่ → เพิ่ม test (TDD for chatbots)

## 13.2 Architecture — 3 Layer Defense

```
Layer 1: Core Prompt (shared.js)      — rules ที่ไม่เปลี่ยน
Layer 2: Knowledge Base (MongoDB)     — dynamic rules, admin แก้ผ่าน Dashboard
Layer 3: Regression Guard (new) ★     — hardcoded scenarios, block deploy ถ้า fail
```

## 13.3 Scenarios (25 active, REG-001..REG-025)

| Category | Count | Examples |
|----------|-------|----------|
| product_knowledge | 8 | H2C ban, วัสดุ (กันล้ม=สแตนเลส, กล่อง=อลู), DINOCO Edition NX500 silver, X Travel Pro เลิกขาย, ADV160 ไม่มี, Side Rack ≠ มือจับ, ADV350 ไม่มีกล่องข้าง, ประกัน 5 ปี |
| tone | 2 | ห้าม "ดิฉัน/พี่/น้อง", ห้าม "ยินดีให้บริการ" |
| flow | 5 | Dealer coordination append, auto-lead, ราคาซ้ำเมื่อถามร้าน, "ตัวนี้" context, ขอรูปหลังคุยสินค้า |
| intent | 3 | BULK → ตัวแทน, "สอบถามสินค้า" ≠ claim, ADV catch-all |
| anti_hallucination | 4 | Claude review leak, AI reveal, PII masking, prompt injection |
| tool_calling | 3 | create_claim, claim_status, ไม่ hallucinate tool call |

## 13.4 Validation Layers (3-Layer)

1. **Regex patterns** (0 token, 0ms) — `forbidden_patterns` + `required_patterns`
   - Safe regex enforced by `safe-regex2` (ReDoS protection)
   - Pattern length max 200 chars
2. **Tool call check** — `expected_tools` + `forbidden_tools`
   - Reads `aiChat._lastToolResults` (Array per sourceId)
3. **Gemini semantic judge** (only if hard rules pass) — `expect_behavior` + `must_not_do`
   - JSON-wrapped envelope (SEC-C3 prompt injection protection)
   - Fail-closed on error (verdict "ERROR" = FAIL, not PASS)
   - Model: Gemini 2.0 Flash (free tier)

## 13.5 runRegressionTurn() Helper — V.1.5 Key Fix

**Problem (before V.1.5)**: `/api/test-ai` + `/api/regression/run` เรียก `callDinocoAI` ตรง ไม่ save messages ระหว่าง turns → multi-turn test ไม่มี history → Gemini turn 2 ไม่มี context → ตอบมั่ว

**Fix**: `runRegressionTurn(sourceId, message)` mirror `aiReplyToLine` core flow:
1. `saveMsg` user message (context for next turn)
2. Auto-lead pre-check (phone match + bot dealer cue → skip AI, return canned reply)
3. `callDinocoAI(DEFAULT_PROMPT, cleanForAI(message), sourceId)` — reads history
4. Dealer coordination append regex
5. `saveMsg` assistant reply

ทั้ง `/api/test-ai` + `/api/regression/run` loop ใช้ helper ใหม่ — cleanup messages หลัง run (`deleteMany({ sourceId })`).

## 13.6 Test Mode Guard — Side Effect Mocking

**File**: `dinoco-tools.js` V.5.1 — ก่อนทำ side effect ใน tools ที่เขียน DB จริง:

```js
const SIDE_EFFECT_TOOLS = new Set([
  "dinoco_create_lead",
  "dinoco_create_claim",
  "dinoco_claim_status",
]);
if (SIDE_EFFECT_TOOLS.has(toolName) && sourceId?.startsWith("reg_")) {
  return { success: true, mock: true, tool_called: toolName, params: args };
}
```

+ `notifyDealerDirect()` ใน `lead-pipeline.js` เช็ค `isRegressionMode(sourceId)` ก่อนส่ง LINE Flex จริง (ป้องกัน REG-005 ทำให้ dealer LINE group โดน spam ขณะ test)

## 13.7 Deploy Gates — Multi-Layer

**3 gates, fail fast near dev**:

1. **Pre-push hook** (`scripts/git-hooks/pre-push` V.2.0) — block local push ถ้า chatbot files เปลี่ยน + critical fail
   - Skip ถ้าไฟล์ chatbot ไม่เปลี่ยน (efficient)
   - Fail-closed ถ้า agent container ไม่รัน (override: `REGRESSION_REQUIRE_AGENT=0`)
   - Emergency: `git push --no-verify`

2. **GitHub Actions** (`.github/workflows/regression-guard.yml`) — CI gate (critical + high) + Telegram alert on fail

3. **Deploy script** (`scripts/deploy.sh` Step 0) — block production deploy
   - Override: `SKIP_REGRESSION=1 ./scripts/deploy.sh`

## 13.8 REST API (`/api/regression/*`)

10 endpoints ใน `proxy/index.js` (requireAuth + aiLimiter):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/scenarios` | List + filter (category, severity, search) |
| GET | `/scenarios/:bug_id` | Detail |
| POST | `/scenarios` | Create (validateScenarioInput + safe-regex2) |
| PATCH | `/scenarios/:bug_id` | Update (allowed fields only) |
| DELETE | `/scenarios/:bug_id` | Soft delete |
| POST | `/run` | Trigger regression run (in-memory lock) |
| GET | `/runs` | History (paginated) |
| GET | `/runs/:runId` | Run detail + all turn results |
| GET | `/stats` | Dashboard cards (total, critical, pass_rate_7d) |
| POST | `/auto-mine` | Gemini scan training_logs → draft scenarios (manual approve) |

## 13.9 Dashboard UI — Tab "ระบบกันถอย"

ใน `/dashboard/train` (new tab icon 🛡️):

- **Stats cards**: Total scenarios, Critical count, Last run, Pass rate 7d (trend arrow)
- **Filter**: category + severity + search box
- **Table**: ID, title, category badge, severity badge (color), status badge, action menu
- **Detail modal**: fields + last run results (turns + violations) + [Re-run] [Edit] [Delete]
- **Add form**: Quick mode (paste conversation → AI auto-suggest) + Advanced mode (JSON editor)

## 13.10 Cron Jobs (in `proxy/index.js` startup)

| Time | Job | Action |
|------|-----|--------|
| 03:00 daily | Update `pass_rate_7d` | Rolling 7d from `regression_runs` |
| 03:00 daily | Drift alert | ถ้า `pass_rate_7d < 0.9` × ≥3 runs → Telegram `regression_drift` |
| 03:30 daily | Cleanup stale | Delete messages where `sourceId ^= "reg_"` AND `createdAt < 1h` |
| Sun 04:00 | Archive inactive | Scenarios `active=false > 90 days` + summary to Telegram |

## 13.11 Security Fixes (V.1.5)

- **SEC-C1**: Dashboard proxy auth — ใช้ `proxy.ts` ของ Next.js 16 (ลบ conflicting `middleware.ts`)
- **SEC-C2**: ReDoS protection — `safe-regex2` + pattern length caps (200 chars)
- **SEC-C3**: Prompt injection — JSON-wrapped judge prompt + verdict allowlist + sanitize "ignore previous" patterns
- **H3**: Rate limit `/api/regression/run` (in-memory lock `__REGRESSION_RUNNING__`)
- **H5**: PII masking in auto-mine — `maskPII()` ก่อนส่ง Gemini
- **M1**: MongoDB regex injection — `escapeRegex()` + length cap ใน search query
- **M2**: Prototype pollution — `JSON.parse(JSON.stringify(body))` ใน POST/PATCH

## 13.12 Key Fix History → Regression Test Mapping

ดูใน `openclawminicrm/docs/chatbot-rules.md` Section 11 — Fix History table มี column **REG** ที่ map bug เดิมไป REG-NNN ที่ครอบคลุมแล้ว

## 13.13 Telegram Alert Types

เพิ่มใน `telegram-alert.js` V.2.0:
- `regression_drift` — pass_rate_7d drop detected (📉 icon)
- `regression_fail_gate` — deploy blocked (🚫 icon)

## 13.14 Override Mechanisms

| Gate | Override | Audit Log |
|------|----------|-----------|
| Pre-push hook | `git push --no-verify` | Git log (local) |
| Pre-push (no agent) | `REGRESSION_REQUIRE_AGENT=0 git push` | — |
| GitHub Actions | Merge directly via UI | GitHub audit |
| Deploy script | `SKIP_REGRESSION=1 ./deploy.sh` | Deploy log |
