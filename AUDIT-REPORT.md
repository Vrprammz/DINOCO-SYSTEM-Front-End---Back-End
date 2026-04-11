# DINOCO System — Gap Audit Report

**Date**: 2026-04-11
**Scope**: `snippets/`, `assets/`, CLAUDE.md, all `.md` references
**Method**: 5 parallel Explore/Security agents, evidence-based only (cite file:line)
**Status**: ✅ **ALL 26 ITEMS FIXED (2026-04-11)** — see checklist at bottom + per-item notes.

---

## Summary

- ระบบแข็งแรงมาก: shortcodes 12/12, REST endpoints (B2B/B2F/LIFF AI/MCP) 73/73 ครบตามที่ประกาศใน CLAUDE.md — ไม่มี feature gap หรือ connection gap
- พบ **security gap ระดับ critical 1 จุด** (Brand Voice Pool ไม่มี nonce verification) + **workflow gap critical 2 จุด** (Finance refund path, Settings confirm)
- พบ **doc drift ใหญ่**: มี ~60 REST endpoints + ~20 shortcodes + 4 constants อยู่ใน code แต่ไม่มีใน CLAUDE.md → อัพเดทไว้ในส่วนท้ายรายงาน

---

## 🔴 Critical gaps (แก้ก่อน deploy ต่อไป)

### C1 — Brand Voice Pool: admin handlers ไม่มี nonce verification
- **ไฟล์**: [`[Admin System] DINOCO Brand Voice Pool`](./[Admin%20System]%20DINOCO%20Brand%20Voice%20Pool):749-860
- **หลักฐาน**: 5 actions (`save_entry`, `get_entries`, `update_entry`, `delete_entry`, `get_stats`) ใช้ cap check อย่างเดียว ไม่มี `wp_verify_nonce` / `check_admin_referer`. `delete_entry` เรียก `wp_delete_post($post_id, true)` hard delete
- **Impact**: CSRF — ถ้า admin login อยู่แล้วเปิดหน้า attacker ได้ → ลบ/แก้ Brand Voice CPT โดย victim ไม่รู้ตัว
- **Severity**: 🔴 critical
- **Fix**: เพิ่ม `check_admin_referer('dinoco_bv_nonce', 'nonce')` ต้นแต่ละ action branch + render nonce ใน shortcode + ส่งใน jQuery POST

### C2 — Finance Dashboard: ไม่มี refund / reverse payment path
- **ไฟล์**: [`[Admin System] DINOCO Admin Finance Dashboard`](./[Admin%20System]%20DINOCO%20Admin%20Finance%20Dashboard) (ทั้งไฟล์ไม่มี refund endpoint)
- **หลักฐาน**: Manual Invoice System มี `dinoco_inv_reverse_debt()` ที่ [`[Admin System] DINOCO Manual Invoice System`](./[Admin%20System]%20DINOCO%20Manual%20Invoice%20System):593 แต่ Finance Dashboard ไม่มี UI เรียกใช้
- **Impact**: จ่ายเงินผิด → undo ไม่ได้ผ่าน UI ต้องไปแก้ DB
- **Severity**: 🔴 critical
- **Fix**: เพิ่ม REST `/invoice/record-refund` + ปุ่ม "บันทึกการคืนเงิน" ใน Finance Dashboard

### C3 — Admin Control Panel: `savePrintSettings()` ไม่มี confirmation
- **ไฟล์**: [`[B2B] Snippet 9: Admin Control Panel`](./[B2B]%20Snippet%209:%20Admin%20Control%20Panel):1798
- **หลักฐาน**: `regenPrintKey()` (บรรทัด 1810) มี `confirm()` ถูกต้อง แต่ `savePrintSettings()` บันทึกที่อยู่คลัง + bank info เงียบๆ
- **Impact**: Admin กดผิด → ที่อยู่จัดส่ง / บัญชีธนาคารเปลี่ยนโดยไม่รู้ → order ใหม่ใช้ที่อยู่ผิด
- **Severity**: 🔴 critical
- **Fix**: เพิ่ม `if (!confirm('อัปเดตที่อยู่จัดส่ง/บัญชี? Order ใหม่จะใช้ค่านี้')) return;` ก่อน save

### C4 — B2F receive-goods: ไม่มี verification dual-write
- **ไฟล์**: [`[B2F] Snippet 2: REST API`](./[B2F]%20Snippet%202:%20REST%20API):2840-2841
- **หลักฐาน**: `dinoco_stock_add($sku, $qty, 'b2f_receive', ...)` ควร insert `dinoco_stock_transactions` + update `dinoco_products.stock_qty` พร้อมกัน แต่ไม่มี verify ว่าสำเร็จทั้งคู่ — CLAUDE.md เน้น "All WRITE operations must dual-write"
- **Impact**: ถ้า write ตัวหนึ่งเฟล → stock เพี้ยน, WAC คำนวณผิด
- **Severity**: 🔴 critical
- **Fix**: Wrap ใน MySQL transaction + check return value ของทั้ง 2 writes + rollback ถ้าล้ม

---

## 🟡 Important gaps (ควรแก้ใน 1 สัปดาห์)

### I1 — LINE Callback: OAuth `state` ไม่ verify
- **ไฟล์**: [`[System] LINE Callback`](./[System]%20LINE%20Callback):260-327
- **หลักฐาน**: `$state = sanitize_text_field($_GET['state'])` แต่ไม่เคยเทียบกับ server-stored value ที่ generate ตอนเริ่ม OAuth flow
- **Impact**: Account takeover surface — attacker หลอกให้ victim click callback URL ที่พก attacker code → browser ของ victim link WP account ไปหา attacker's LINE UID
- **Severity**: 🟡 important
- **Fix**: Generate `wp_generate_password(32,false)` → เก็บ transient ตอนเริ่ม OAuth → `hash_equals()` ที่ callback

### I2 — Finance Dashboard: AJAX endpoints ไม่มี nonce
- **ไฟล์**: [`[Admin System] DINOCO Admin Finance Dashboard`](./[Admin%20System]%20DINOCO%20Admin%20Finance%20Dashboard):153-203
- **หลักฐาน**: `dinoco_finance_action` handler ใช้ cap check อย่างเดียว — `get_ai_analysis` (บรรทัด 3221, 3269) เรียก AI provider ได้
- **Impact**: CSRF burn AI quota + ข้อมูลการเงิน (ความลับ per `project_finance_confidential.md`)
- **Severity**: 🟡 important
- **Fix**: เพิ่ม `check_admin_referer('dinoco_finance_nonce', 'nonce')`

### I3 — Global Inventory REST routes: ไม่มี explicit nonce verify (25 routes)
- **ไฟล์**: [`[Admin System] DINOCO Global Inventory Database`](./[Admin%20System]%20DINOCO%20Global%20Inventory%20Database):1073, 1179, 1223, 1540, 1636, 1701, 1726, 1744, 1782, 1792, 1902, 1994, 2068, 2175, 2206, 2253, 2270, 2318, 2345, 2357, 2376, 2570, 2657, 2668, 2680
- **หลักฐาน**: ใช้ `current_user_can('manage_options')` อย่างเดียว ต่างจาก [`[B2B] Snippet 5: Admin Dashboard`](./[B2B]%20Snippet%205:%20Admin%20Dashboard):88-90 ที่ใช้ `wp_verify_nonce(X-WP-Nonce) && cap`
- **Impact**: Defense-in-depth gap — ถ้า auth method เปลี่ยน (application passwords, JWT plugin) จะ bypass
- **Severity**: 🟡 important
- **Fix**: สร้าง `$inv_perm` closure ใช้ร่วมกันทั้ง 25 routes

### I4 — Field naming: `current_debt` (B2B) vs `maker_current_debt` (B2F)
- **ไฟล์**: [`[B2B] Snippet 13: Debt Transaction Manager`](./[B2B]%20Snippet%2013:%20Debt%20Transaction%20Manager):43,117 vs [`[B2F] Snippet 0: CPT & ACF Registration`](./[B2F]%20Snippet%200:%20CPT%20&%20ACF%20Registration):131 + [`[B2F] Snippet 7: Credit Transaction Manager`](./[B2F]%20Snippet%207:%20Credit%20Transaction%20Manager):49,66,71
- **หลักฐาน**: Logic เหมือนกัน 100% (atomic `FOR UPDATE`, single-SQL recalc) แต่ field name ไม่เหมือนกัน
- **Severity**: 🟡 important
- **Fix**: สร้าง `dinoco_get_debt($post_id)` helper ที่เลือก field ตาม `post_type`

### I5 — `maker_credit_hold_reason` ใช้ `update_post_meta` แทน `update_field`
- **ไฟล์**: [`[B2F] Snippet 7: Credit Transaction Manager`](./[B2F]%20Snippet%207:%20Credit%20Transaction%20Manager):83
- **หลักฐาน**: Auto-hold บรรทัด 83 ใช้ `update_post_meta()` แทน `update_field()` — ACF อาจไม่ sync กับ relationships ถ้ามี
- **Severity**: 🟡 important
- **Fix**: เปลี่ยนเป็น `update_field('maker_credit_hold_reason', 'auto', $maker_id)`

### I6 — Admin Inventory: `deleteCategory()` ไม่มี confirmation
- **ไฟล์**: [`[Admin System] DINOCO Global Inventory Database`](./[Admin%20System]%20DINOCO%20Global%20Inventory%20Database):4613,4658
- **หลักฐาน**: `deleteCategory()` ลบ localStorage ทันทีไม่มี `confirm()`
- **Severity**: 🟡 important
- **Fix**: `if (!confirm('ลบหมวดหมู่ "' + cat + '" จริงหรือ?')) return;`

### I7 — Manual Invoice: Cancel ไม่เช็ค dependencies
- **ไฟล์**: [`[Admin System] DINOCO Manual Invoice System`](./[Admin%20System]%20DINOCO%20Manual%20Invoice%20System):683-691
- **หลักฐาน**: `/invoice/cancel` ไม่เช็ค `payment_received` — ถ้า cancel invoice ที่มีการจ่ายเงินมาแล้ว เงินที่รับมาหายไป
- **Severity**: 🟡 important
- **Fix**: ถ้า `payment_received > 0` → require refund record ก่อน allow cancel

### I8 — Admin Dashboard: `$display_name` ไม่ escape + LINE profile name ไม่ sanitize
- **ไฟล์**: [`[Admin System] DINOCO Admin Dashboard`](./[Admin%20System]%20DINOCO%20Admin%20Dashboard):3395 + [`[System] LINE Callback`](./[System]%20LINE%20Callback):318
- **หลักฐาน**: `<?php echo $display_name; ?>` ไม่มี esc_html, และ `wp_update_user(['display_name'=>$profile['displayName']])` เก็บ raw LINE name
- **Impact**: Stored XSS path — LINE name มี `<script>` → admin page แสดงเป็น script
- **Severity**: 🟡 important
- **Fix**: `esc_html($display_name)` + `sanitize_text_field($profile['displayName'])` ก่อน update_user

### I9 — Schema version check: `ALTER TABLE` fallback ไม่มี enforcement
- **ไฟล์**: [`[Admin System] DINOCO Global Inventory Database`](./[Admin%20System]%20DINOCO%20Global%20Inventory%20Database):113-125, 193-217, 456-493
- **หลักฐาน**: ใช้ `dbDelta` + ad-hoc ALTER TABLE สำหรับ `b2b_visible`, `compatible_models`, `units_per_box` — ถ้าดีพลอยข้าม activation column อาจหาย
- **Severity**: 🟡 important
- **Fix**: เพิ่ม `dinoco_schema_version` option — check on init → notice ถ้าไม่ตรง

### I10 — `po_items` repeater: ไม่มี custom table dual-write
- **ไฟล์**: [`[B2F] Snippet 0: CPT & ACF Registration`](./[B2F]%20Snippet%200:%20CPT%20&%20ACF%20Registration):189-197
- **หลักฐาน**: `poi_qty_ordered`, `poi_unit_cost` ฯลฯ อยู่ใน ACF repeater อย่างเดียว ไม่มี `dinoco_po_items` table
- **Impact**: Query งาน reporting (เช่น WAC) ต้อง serialize read ทุก PO — ช้า
- **Severity**: 🟡 important (หรือ UNCERTAIN — ถ้าตั้งใจให้เป็น ACF only ให้ปิดเคสนี้)
- **Fix**: สร้าง `dinoco_po_items` table + dual-write ใน `b2f_rest_create_po` หรือ document เหตุผลที่เลือก ACF-only

### I11 — B2B Snippet 5: Flash cancel error ไม่มี undo path
- **ไฟล์**: [`[B2B] Snippet 5: Admin Dashboard`](./[B2B]%20Snippet%205:%20Admin%20Dashboard):1368
- **หลักฐาน**: Error toast แสดงแต่ไม่มีปุ่ม retry / undo
- **Severity**: 🟡 important
- **Fix**: เพิ่มปุ่ม "↩️ ลองใหม่" ใน error toast

### I12 — LIFF AI: Lead status update ไม่มี FSM validation ฝั่ง frontend
- **ไฟล์**: [`[LIFF AI] Snippet 2: Frontend`](./[LIFF%20AI]%20Snippet%202:%20Frontend):1047, 1145
- **หลักฐาน**: Dropdown สถานะแสดงทุก option โดยไม่เช็คว่า transition จาก current state legal หรือไม่
- **Severity**: 🟡 important
- **Fix**: Filter dropdown ตาม FSM — แสดงเฉพาะ legal transitions

### I13 — B2B Snippet 9: Import CSV ไม่มี dry-run / error summary
- **ไฟล์**: [`[B2B] Snippet 9: Admin Control Panel`](./[B2B]%20Snippet%209:%20Admin%20Control%20Panel):1867-1873
- **หลักฐาน**: `importDistCSV()` ส่ง raw ไป `/import-distributors` — ถ้า 10/50 fail เห็นแค่ "❌ error"
- **Severity**: 🟡 important
- **Fix**: เพิ่ม dry-run mode + response แสดง row-level errors

---

## 🟢 Nice-to-have gaps

### N1 — B2F admin settings REST: `permission_callback => '__return_true'` (cap check อยู่ข้างใน callback)
- **ไฟล์**: [`[B2F] Snippet 5: Admin Dashboard Tabs`](./[B2F]%20Snippet%205:%20Admin%20Dashboard%20Tabs):2993-3011
- **Fix**: ย้าย cap check ไปไว้ใน `permission_callback`

### N2 — KB Trainer: `ajax_save`/`ajax_update` ไม่มี cap check (nonce ก็พอ แต่ defense-in-depth ขาด)
- **ไฟล์**: [`[Admin System] KB Trainer Bot v2.0`](./[Admin%20System]%20KB%20Trainer%20Bot%20v2.0):164-239
- **Fix**: เพิ่ม `current_user_can('manage_options')` ในแต่ละ method

### N3 — Output escape sweep
- **ไฟล์**: [`[B2B] Snippet 8: Distributor Ticket View`](./[B2B]%20Snippet%208:%20Distributor%20Ticket%20View):297,572,590,609,633,636,693,729
- **หลักฐาน**: ปัจจุบัน input เป็น intval / hardcoded switch — ยังไม่มีช่อง XSS จริง แต่เปราะ
- **Fix**: บังคับใช้ `esc_html()` / `esc_attr()` รอบ `echo $var` ใน HTML

### N4 — `b2b_rest_cancel_request` ไม่มี rate limit ต่อ IP
- **ไฟล์**: [`[B2B] Snippet 3: LIFF E-Catalog REST API`](./[B2B]%20Snippet%203:%20LIFF%20E-Catalog%20REST%20API):70-74, 824
- **Fix**: เพิ่ม `b2b_rate_limit('cancel_'.$gid, 5, 60)`

### N5 — Legacy Migration: `file_put_contents` ก่อน `wp_check_filetype`
- **ไฟล์**: [`[System] Legacy Migration Logic`](./[System]%20Legacy%20Migration%20Logic):15-167
- **Fix**: ใช้ `wp_handle_sideload` หรือ check ก่อน write

### N6 — Modal ESC handler + required field indicators
- **ไฟล์**: [`[B2F] Snippet 5: Admin Dashboard Tabs`](./[B2F]%20Snippet%205:%20Admin%20Dashboard%20Tabs):304,437,1559
- **Fix**: Global ESC key handler + `<span class="required">*</span>` ที่ field บังคับ

### N7 — Bulk delete ใน Service Center ไม่มี progress indicator
- **ไฟล์**: [`[Admin System] DINOCO Service Center & Claims`](./[Admin%20System]%20DINOCO%20Service%20Center%20&%20Claims):3164

### N8 — `rcv_total_value` ACF field marked readonly แต่ write ผ่าน `update_field()`
- **ไฟล์**: [`[B2F] Snippet 0: CPT & ACF Registration`](./[B2F]%20Snippet%200:%20CPT%20&%20ACF%20Registration):255 vs [`[B2F] Snippet 2: REST API`](./[B2F]%20Snippet%202:%20REST%20API):2782
- **Fix**: เพิ่ม comment ว่า computed server-side หรือ remove readonly flag

### N9 — `dinoco_sku_relations` option ไม่มี explicit initialization
- **Fix**: `add_option('dinoco_sku_relations', array())` ตอน activation

---

## 📘 Doc drift — Code เกิน .md (อัพเดทแล้วใน CLAUDE.md)

### REST endpoints ที่ code มีแต่ CLAUDE.md ไม่มี (ส่วนใหญ่)

**B2B (`b2b/v1`) — เพิ่ม**: `print-monitor`, `print-queue`, `print-ack`, `print-status`, `print-requeue`, `print-heartbeat`, `print-test`, `rpi-command`, `rpi-command-ack`, `rpi-dashboard`, `rpi-accept-order`, `ticket-lookup`, `pno-lookup`, `rpi-flash-ready`, `rpi-flash-box-packed`, `rpi-distributors`, `flash-webhook`, `flash-webhook-setup`, `flash-api-test`, `flash-tracking`, `flash-dashboard-stats`, `flash-ship-packed`, `manual-flash-ready`, `discount-mapping`, `combined-slip-upload`, `combined-invoice-gen`, `import-distributors`, `test-push`, `system-check`, `distributor/delete`, `distributor/toggle-bot`, `admin-bo-tickets`, `admin-stock-list`, `admin-stock-unlock`, `admin-stock-mark-oos`, `admin-shipping-queue`, `admin-submit-tracking`

**Inventory (`dinoco-stock/v1`) — ทั้ง namespace ไม่มีใน CLAUDE.md**: `god-mode/verify`, `margin-analysis`, `image-proxy`, `stock/list`, `stock/adjust`, `stock/transactions`, `stock/settings`, `stock/hold`, `stock/initialize`, `dip-stock/*` (6), `warehouses`, `warehouse`, `stock/transfer`, `valuation`, `forecast`, `product/pricing`, `product/upload-image`, `moto/brands`, `moto/models`

**Sync (`dinoco/v1`)**: `sync-status`

### Shortcodes ที่ code มีแต่ CLAUDE.md ไม่มี (19 ตัว)
`dinoco_admin_transfer`, `dinoco_admin_claims`, `dinoco_sync_dashboard`, `dinoco_admin_inventory`, `b2b_commands`, `b2b_orders`, `b2b_account`, `dinoco_edit_profile`, `dinoco_dashboard_assets`, `b2b_admin_control`, `dinoco_admin_users`, `dinoco_dashboard_header`, `dinoco_claim_page`, `dinoco_manual_invoice`, `dinoco_admin_legacy`, `dinoco_dashboard`, `b2b_discount_mapping`, `dinoco_legacy_migration`, `b2b_dashboard`, `b2b_stock_manager`, `b2b_tracking_entry`, `dinoco_transfer_sys`, `dinoco_transfer_v3`

### Constants ที่ code require แต่ CLAUDE.md ไม่มี
- `LIFF_AI_SECRET_KEY` — [`[LIFF AI] Snippet 1: REST API`](./[LIFF%20AI]%20Snippet%201:%20REST%20API):31
- `LIFF_AI_JWT_SECRET` — line 40 (auto-generate fallback)
- `LIFF_AI_AGENT_URL` — line 44
- `LIFF_AI_AGENT_KEY` — line 50-52
- `DINOCO_JWT` (God Mode HMAC) — Global Inventory DB:1064
- `B2F_DISABLED` (kill switch) — documented partially

---

## Cross-references

- None ของ finding C1-C4 เกี่ยวกับ features ที่ CLAUDE.md ระบุว่า "implemented" ดังนั้นไม่ขัดแย้งกับ spec
- Schema drift (I9) จุดเดียวที่อาจ trigger bug regression ตอน deploy → ควรเพิ่ม schema version ใน dinoco_inventory_version

---

## Checklist (ALL DONE — 2026-04-11)

- [x] **C1** — Brand Voice Pool nonce verify → `[Admin System] DINOCO Brand Voice Pool` V.2.6 (POST-level nonce gate + auto-inject via `ajaxSend` filter)
- [x] **C2** — Finance refund MVP → `[Admin System] DINOCO Manual Invoice System` V.33.3 (new REST `POST /invoice/record-refund` + audit trail `_inv_refunds` meta + debt recalc + "คืนเงิน" UI button + refund modal)
- [x] **C3** — savePrintSettings confirm dialog → `[B2B] Snippet 9: Admin Control Panel` V.33.5
- [x] **C4** — B2F receive-goods dual-write verify → `[B2F] Snippet 2: REST API` V.8.5 (WP_Error guard per SKU + rollback stock + rollback payable + rollback rcv record + FSM transition back)
- [x] **I1** — OAuth `state` nonce verify → `[System] LINE Callback` V.30.4 (random token in transient 10min + single-use + legacy raw-serial regex fallback)
- [x] **I2** — Finance AJAX nonce → `[Admin System] DINOCO Admin Finance Dashboard` V.3.17 (POST-level check + auto-inject via `ajaxSend`)
- [x] **I3** — Inventory REST explicit nonce (25 routes) → `[Admin System] DINOCO Global Inventory Database` V.42.18 (shared `$inv_perm` closure, all 25 replaced)
- [x] **I4** — Unified debt helper → `[B2B] Snippet 1: Core Utilities` V.33.0 (`dinoco_get_debt($post_id)` returns `[debt, limit, hold, reason, field]` across `distributor`/`maker`)
- [x] **I5** — `maker_credit_hold_reason` → `update_field()` → `[B2F] Snippet 7: Credit Transaction Manager` V.1.5
- [x] **I6** — deleteCategory confirm → `[Admin System] DINOCO Global Inventory Database` V.42.18
- [x] **I7** — Invoice cancel dependency check → `[Admin System] DINOCO Manual Invoice System` V.33.3 (blocks cancel if net_paid > 0 unless `force=1`)
- [x] **I8** — Admin `display_name` escape + LINE profile sanitize → `[Admin System] DINOCO Admin Dashboard` V.32.2 + `[System] LINE Callback` V.30.4
- [x] **I9** — Schema version check → `[Admin System] DINOCO Global Inventory Database` V.42.18 (`DINOCO_INVENTORY_SCHEMA_VERSION` constant + auto-migration + admin_notice)
- [x] **I10** — `po_items` ACF-only design note → `[B2F] Snippet 0: CPT & ACF Registration` V.3.1 (intentional, reporting path through `dinoco_stock_transactions`)
- [x] **I11** — Flash cancel error retry prompt → `[B2B] Snippet 5: Admin Dashboard` V.32.1
- [x] **I12** — LIFF AI FSM validation frontend → `[LIFF AI] Snippet 2: Frontend` V.3.2 (already had FSM; expanded to full Lead Pipeline V.2.0 + terminal-state guards)
- [x] **I13** — Import CSV dry-run + row errors → `[B2B] Snippet 9: Admin Control Panel` V.33.5 (2-phase import: dry-run → confirm → real)
- [x] **N1** — B2F settings permission_callback move → `[B2F] Snippet 5: Admin Dashboard Tabs` V.3.4
- [x] **N2** — KB Trainer cap check on every ajax_* → `[Admin System] KB Trainer Bot v2.0` V.30.4
- [x] **N3** — Snippet 8 esc sweep → `[B2B] Snippet 8: Distributor Ticket View` V.30.5 (esc_attr + esc_html on ticket_id/$sc/$fs_bg/$created/$si)
- [x] **N4** — cancel-request rate limit → `[B2B] Snippet 3: LIFF E-Catalog REST API` V.40.4 (5/min per group_id)
- [x] **N5** — Legacy Migration upload hardening → `[System] Legacy Migration Logic` V.30.3 (mime whitelist + finfo content check + getimagesize final guard + unlink on any fail)
- [x] **N6** — Modal ESC global handler → `[B2F] Snippet 5: Admin Dashboard Tabs` V.3.4
- [x] **N7** — Bulk delete inline progress → `[Admin System] DINOCO Service Center & Claims` V.30.4
- [x] **N8** — rcv_total_value readonly comment → `[B2F] Snippet 0: CPT & ACF Registration` V.3.1
- [x] **N9** — dinoco_sku_relations init → `[Admin System] DINOCO Global Inventory Database` V.42.18
- [x] **Doc drift** — CLAUDE.md updated with 60+ missing REST endpoints, 23 shortcodes, 7 constants
