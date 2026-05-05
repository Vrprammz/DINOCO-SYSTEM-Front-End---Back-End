# 📋 DINOCO S/N System — รวมทุกอย่างที่ต้องบอสตอบ

**Status**: Awaiting boss decisions — 2026-05-05 (post 14-commit additive batch)

ทุกข้อมี **default recommendation** บอสแค่ตอบ "OK ทั้งหมด" หรือเปลี่ยนเฉพาะข้อที่ไม่ตรงใจ

---

## 🅰️ ส่วน A: Architecture & Format Decisions (12 ข้อ)

| # | คำถาม | Recommendation |
|---|---|---|
| **A1** | S/N Format ที่ส่งโรงงาน | `DNCSS0000001` (PREFIX + 7-digit) |
| **A2** | ใครติดเพลทกับสินค้า | DINOCO warehouse ติดเองตอนแพ็ค |
| **A3** | First-time registration flow | Unified Gateway (scan QR + type S/N + no-plate fallback) |
| **A4** | Schema split table | Split 2 tables (sn_pool 12 cols + sn_pool_meta 7 cols) ✅ ทำแล้ว |
| **A5** | Receipt OCR vendor | Slip2Go reuse (existing for B2B+B2F) |
| **A6** | 4-eyes approval scope | 3-tier (auto/single-admin/4-eyes ตาม risk) ✅ ทำแล้ว |
| **A7** | Customer transfer flow | ใช้เพลทเดิม (ไม่ออกใหม่) |
| **A8** | Multi-batch reorder | แบ่งหลาย batch ID per SKU mix |
| **A9** | Audit retention | 3 ปี operational + 5 ปี sensitive_op ✅ ทำแล้ว |
| **A10** | HMAC URL signing เฟส | Phase 2 (defer) — ทำตอน Q12 fraud audit เสร็จ |
| **A11** | Allow extension หลัง warranty หมดเกิน 30 วัน | Yes (30-day grace) |
| **A12** | Stolen plate public lookup | Authenticated only (partner API) ✅ ทำแล้วใน F#15 + public verify |

---

## 🅱️ ส่วน B: Business Decisions (8 ข้อ — ส่วนใหญ่ block Phase 5)

| # | คำถาม | Recommendation | Block อะไร |
|---|---|---|---|
| **B1** | LINE quota tier | **Premium ฿1,500/mo** | F#1/F#4/F#10 cron flip ON |
| **B2** | Heatmap library (F#13) | **Leaflet** (open-source, no API key) | F#13 admin tab UI |
| **B3** | Fraud block threshold | **>= 70** (default) | F#12 production ON |
| **B4** | F#8 Extension Marketplace placement | **Phase 5** (4 wk separate post-launch) | Phase 5 timing |
| **B5** | Payment gateway (Phase 5) | **PromptPay + LINE Pay + SCB Card + Manual** | Phase 5 vendor selection |
| **B6** | Extension pricing model | **% ของ retail** (1y=10%, 2y=18%, 3y=25%) | Phase 5 pricing |
| **B7** | VAT handling | **VAT included** in displayed price | Phase 5 invoice |
| **B8** | Refund policy (extension) | **7-day refund window (full refund)** | Phase 5 legal |

---

## 🅲 ส่วน C: Operational Data Boss Must Provide (3 ข้อ)

| # | ข้อมูล | ใช้ทำอะไร |
|---|---|---|
| **C1** | **Fraud audit baseline** — % rejected claims เพราะ "ของปลอม"/"ลงทะเบียนซ้ำ" + มูลค่า fraud loss/เดือน (ย้อนหลัง 12 เดือน) | คำนวณ ROI F#12 + F#15 + ตัดสินใจ A10 |
| **C2** | **Approver delegation list** — ชื่อ admin 3+ คนที่จะ approve sensitive ops (กรณีบอสไม่อยู่) | 4-eyes workflow + SLA escalation |
| **C3** | **Pilot dealer selection** — 5 silver+gold tier dealers สำหรับ pilot 100 plates | Phase 1 W4.3 |

---

## 🅳 ส่วน D: UX Decisions (Member Dashboard V.31.0 — 5 ข้อ)

ใช้เมื่อ Phase 2 W7 deploy V.31.0 (touch live snippets)

| # | คำถาม | Recommendation |
|---|---|---|
| **D1** | Banner display limit ใน Member Dashboard | **3 banners on home + scrollable list ใน /notifications** |
| **D2** | Notification opt-out granularity | **Per-type opt-in** (expiry/anniversary/review/cross-sell/service) |
| **D3** | Tier badge display (Diamond/Platinum/Gold/Silver/Bronze) | **Prominent in header** ข้างชื่อ |
| **D4** | Asset card history timeline | **Collapsible (default collapsed)** |
| **D5** | Scan-first vs Type-first registration | **Default scan-first** |

---

## 🅴 ส่วน E: Touch Live Snippet Confirmations (8 deploy gates)

ทุกข้อต้องบอสยืนยันก่อนผมแก้ — กระทบลูกค้าจริง / ตัวแทนจริง:

### E1 — Phase 1 W3.4: F#3 Auto-fill Claim integration ⚠️ลูกค้าจริง

**Files**: `[System] DINOCO Claim System` V.30.2 → V.31.0

**ผลกระทบ**: ลูกค้าเปิดเคลม → สแกน QR plate → auto-fill 8 fields แทนกรอกเอง. ปลอดภัยสูง — สแกนผิดยังกรอก manual ได้ (fallback).

✅ ยืนยันให้ทำ? (Y/N)

### E2 — Phase 2 W6.1: Gateway Unified Flow ⚠️ลูกค้าจริง

**Files**: `[System] DINOCO Gateway` major refactor

**ผลกระทบ**: หน้าลงทะเบียน warranty เปลี่ยน UX — primary "📷 สแกน QR plate" + secondary "พิมพ์ S/N" + tertiary "ไม่มี plate". เสี่ยงปานกลาง — UX เปลี่ยนชัดเจน.

✅ ยืนยันให้ทำ? (Y/N) — **ขึ้นกับ A3 ว่าเลือก Unified ไหม**

### E3 — Phase 2 W6.2: Manual Invoice S/N Picker ⚠️แอดมินจริง

**Files**: `[Admin System] DINOCO Manual Invoice System` V.34.10 → V.35.0

**ผลกระทบ**: เพิ่มปุ่ม "🛡 Allocate plate" ใน picker modal สำหรับสินค้า sn_required=1. Optional — ไม่กระทบ existing flow.

✅ ยืนยันให้ทำ? (Y/N)

### E4 — Phase 2 W6.3: MCP /sn-lookup + /warranty-check extension

**Files**: `[System] DINOCO MCP Bridge` V.2.8 → V.2.9

**ผลกระทบ**: เพิ่ม endpoint ใหม่ + extend response shape (additive). กระทบ chatbot ที่ใช้ `/warranty-check` — ตอนนี้ return เพิ่ม `top_set_sku` + `plate_status`. Backward compat (เก่าจะไม่ break).

✅ ยืนยันให้ทำ? (Y/N)

### E5 — Phase 2 W6.4-5: Service Center Claim Sync (11 statuses) ⚠️แอดมินจริง

**Files**: `[Admin System] DINOCO Service Center & Claims` V.30.6 → V.31.0

**ผลกระทบ**: ทุกครั้ง claim_ticket เปลี่ยน status (11 states) → sync sn_pool.status อัตโนมัติ. กระทบ workflow Service Center มาก — pending → claimed lock plate, completed → released.

✅ ยืนยันให้ทำ? (Y/N) — **เสี่ยงสูง — แนะนำทำ canary 1 dealer ก่อน**

### E6 — Phase 2 W6.6-7: Manual Transfer + Member Transfer ⚠️ลูกค้าจริง

**Files**: 2 snippets V.30.2 → V.31.0
- `[Admin System] DINOCO Manual Transfer Tool`
- `[System] Transfer Warranty Page`

**ผลกระทบ**: ตอนโอนเจ้าของ plate → flip sn_pool.status='transferred' atomic + audit. แก้ nonce bug เก่าด้วย (BUG-S2 จาก Phase 1 audit).

✅ ยืนยันให้ทำ? (Y/N)

### E7 — Phase 2 W7: Member Dashboard Atomic V.31.0 Deploy ⚠️ลูกค้าทุกคน

**Files**: 3 snippets atomic deploy
- `[System] Member Dashboard Main` V.30.4 → V.31.0
- `[System] Dashboard - Header & Forms` V.30.3 → V.31.0
- `[System] Dashboard - Assets List` V.30.3 → V.31.0

**ผลกระทบ**: เปลี่ยน UI Member Dashboard ลูกค้าทั้งหมด — เพิ่ม banner + tier badge + stats grid + quick actions + click-to-call. **เสี่ยงสูงสุด** เพราะกระทบลูกค้าทุกคน.

**Strategy v2.12 §B4**: 5-step deploy:
1. Deploy 6 NEW snippets first (no existing dependency)
2. Backfill 100% legacy CPT → sn_pool + verify count parity
3. ตั้ง flag `dinoco_sn_dual_source_enabled=true` (read both, prefer sn_pool)
4. Deploy 3 dashboard snippets V.31.0 atomic GitHub push
5. Monitor 24h + flip flag false (sn_pool only)

✅ ยืนยันให้ทำ? (Y/N) — **ทำ 5-step strategy ใช่ไหม?**

### E8 — Phase 4 W14.1: OpenClaw Chatbot Tools Refactor ⚠️ลูกค้าทุกคน + Live Agent

**Files**: `openclawminicrm/proxy/modules/dinoco-tools.js` (Live Node.js Docker agent)

**ผลกระทบ**:
- `dinoco_warranty_check(serial, phone)` extend return `top_set_sku` + `plate_status`
- `dinoco_create_claim(serial, ...)` validate vs sn_pool ก่อน insert (block ถ้า S/N ไม่อยู่ในระบบ)
- NEW `dinoco_serial_lookup(serial)` canonical lookup tool

**เสี่ยงสูง**: chatbot คุยกับลูกค้าจริง → tool change กระทบ regression scenarios REG-001..025. Docker rebuild + deploy needed.

✅ ยืนยันให้ทำ? (Y/N) — **แนะนำรอ E5 Service Center sync ติดตั้งเสถียร 1 สัปดาห์ก่อน**

---

## 🅵 ส่วน F: Master Flag Flip Decisions (5 ข้อ)

ทุก flag default OFF — บอสตัดสินใจเปิดเมื่อพร้อม:

| # | Flag | เปิด = อะไรเกิด | Pre-condition |
|---|---|---|---|
| **F1** | `dinoco_sn_system_enabled` | Master switch — เปิด REST + cron + LIFF activate ทั้งหมด | C3 pilot dealer select + E1+E5+E7 deploy + 100-plate test pass |
| **F2** | `dinoco_sn_notification_send_enabled` | F#1/F#4/F#10 LINE Flex push ส่งจริง (ตอนนี้ stub mode mark pending_dispatch) | B1 LINE Premium tier confirmed |
| **F3** | `dinoco_sn_block_legacy_serial_code` | Block legacy direct edits to `serial_code` ACF | E7 Member Dashboard V.31.0 deployed + 1wk stable |
| **F4** | `dinoco_sn_pubapi_master_key` (constant) | F#15 partner HMAC verification ใช้งานจริง | C3 partner onboarding (1 insurance + 1 dealer test) |
| **F5** | `dinoco_gdpr_enabled` | GDPR scaffold V.4.1 endpoints ตอบ 200 (ปัจจุบัน 503) | Legal review Phase 6 launch checklist (PDPA Sec 30/31) |

---

## 🅶 ส่วน G: Pilot/Production Rollout Confirmations (4 ข้อ)

| # | Action | When | ต้องบอสยืนยัน |
|---|---|---|---|
| **G1** | 100-plate pilot batch | After E1+E7 deploy | จำนวน plates + 5 pilot dealers |
| **G2** | Phase 3 acceptance test (6-month KPI baseline) | After G1 stable 30d | KPIs (>60% activation rate, <฿80/cost, zero CS crisis) |
| **G3** | Partner onboarding | After F4 flag flip | 1 insurance partner + 1 dealer test |
| **G4** | Phase 4 acceptance | After G3 partners stable | API uptime, error rate, partner feedback |

---

## 📋 ตอบกลับสะดวก — Copy-paste template

```
ส่วน A: ✅ Recommended ทั้งหมด (หรือระบุข้อที่เปลี่ยน เช่น A1=B)
ส่วน B: ✅ Recommended ทั้งหมด (B1: confirm ฿1,500/mo Premium / B5: เลือก payment 4 ตัว)
ส่วน C:
  C1 fraud baseline: [ตัวเลข %, ฿/เดือน]
  C2 approvers: บอส + [ชื่อ 1] + [ชื่อ 2] + super_admin fallback
  C3 pilot dealers: [5 ชื่อร้าน]
ส่วน D: ✅ Recommended ทั้งหมด
ส่วน E:
  E1 Auto-fill claim: Y/N
  E2 Gateway: Y/N
  E3 Manual Invoice picker: Y/N
  E4 MCP extension: Y/N
  E5 Service Center sync: Y/N (canary 1 dealer first?)
  E6 Manual Transfer: Y/N
  E7 Member Dashboard atomic: Y/N
  E8 OpenClaw chatbot: Y/N (รอ E5 stable 1wk?)
ส่วน F:
  F1 master enabled: timing
  F2 notification send: timing
  F3 block legacy: timing
  F4 partner API: timing
  F5 GDPR: timing
ส่วน G:
  G1 pilot 100 plates: เริ่มเมื่อ?
  G2 Phase 3 acceptance: เมื่อ?
  G3 partner onboarding: เมื่อ?
  G4 Phase 4 acceptance: เมื่อ?
```

---

## 🚀 ถ้าบอสตอบ "Recommended ทั้งหมด" + ตอบ C1+C2+C3

ผมจะลุยต่อตามลำดับนี้ไม่ต้องถามอีก:
1. ทำ Backfill helper script (W2.5 additive)
2. ทำ Postman + sample code Python/Node/PHP (W12.3 additive)
3. ทำ Forecast new-SKU fallback (W13.3 additive)
4. ทำ MongoDB manual_claims migration script (W14.3 additive)
5. หลัง 4 ข้อนี้ → ขอบอสยืนยัน E1-E8 ทีละ deploy gate
