# DINOCO Feature Specs -- Complete Wiki

**Date:** 2026-04-07

> Consolidated from: B2F-FEATURE-SPEC.md, INVENTORY-FEATURE-SPEC.md, FINANCE-DASHBOARD.md, BRAND-VOICE.md, MASTER-PLAN.md

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
| GET | `/maker-products/{maker_id}` | admin | SKU ที่ Maker ผลิต + ราคาทุน |
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
