# 📝 Boss Decisions Log — DINOCO S/N System v2.13

**Date**: 2026-05-05
**Source**: `docs/sn-system/04-open-questions-FOR-BOSS.md` (annotated by boss in-line)

ทุก decision ถือเป็น **binding** — ระบบต้อง implement ตามนี้ ไม่ใช่ recommendation อีกต่อไป

---

## ✅ Decisions Matrix (29 questions answered)

| # | Topic | Answer | Match Recommended? | Action |
|---|---|---|---|---|
| Q1 | S/N Format | **A** `DNCSS0000001` | ✅ Yes | ✅ Done |
| Q2 | Plate origin | **B** Warehouse ติดเอง | ✅ Yes | ✅ Done |
| Q3 | Gateway flow | **B** Unified | ✅ Yes | ⏸️ Phase 2 W6.1 (touch live) |
| Q4 | Schema split | **A** 2 tables | ✅ Yes | ✅ Done |
| Q5 | Phase 1 scope | **A** 3 wk minimal | ✅ Yes | ✅ Done |
| Q6 | F#8 placement | **B** ⚠️ ย้ายเข้า Phase 4 + ทำให้ละเอียด | 🔴 **Override** | ⚠️ Replan needed |
| Q7 | Payment gateway | **C+Slip2Go** เลขบัญชี + Slip2Go verify | 🔴 **Override** | ⚠️ Simpler than B |
| Q8 | Extension pricing | 🆕 **per-SKU manual** (backend admin กรอก) | 🔴 **Override** | ⚠️ NEW backend UI needed |
| Q9 | VAT | **A** รวม VAT | ✅ Yes | Phase 4 |
| Q10 | Slip OCR | **A** Slip2Go reuse | ✅ Yes | Phase 4 |
| Q11 | LINE Premium | **B** ฿1,500/mo เดี๋ยวจ่าย | ✅ Yes | ⏸️ F2 flag flip ready |
| Q12 | Fraud baseline | "ไม่ค่อยมีปลอม — ทำกันไว้เฉยๆ" | 🔴 **Override** | → Q21 ตัดออก |
| Q13 | HMAC URL signing | **A** Phase 1 | ✅ Yes | ⚠️ Pending implement |
| Q14 | 4-eyes scope | **B** 3-tier | ✅ Yes | ✅ Done |
| Q15 | Approver list | 🆕 **Backend UserAdmin Role** + role-based access | 🔴 **Override** | ⚠️ NEW snippet needed |
| Q16 | Customer transfer | **A** เพลทเดิม | ✅ Yes | ใช้ระบบเดิม `[System] Transfer Warranty Page` |
| Q17 | Multi-batch | **B** หลายล็อต per SKU mix | ✅ Yes | ✅ Done |
| Q18 | Invoice S/N column | **ไม่โชว์** (admin ไม่ได้ SN ตอนส่ง) | 🟡 Partial — ปิดถาวร | ✅ Confirmed default OFF |
| Q19 | Extension grace | **A** 30 วัน | ✅ Yes | Phase 4 |
| Q20 | Refund policy | **B** ไม่คืน | 🔴 **Override** | ⚠️ Legal review needed (consumer protection) |
| Q21 | Fraud threshold | **ตัดระบบของปลอมออกเลย** | 🔴 **Override** | ⚠️ **REMOVE F#12** |
| Q22 | Public API pricing | "ยังไม่มีแผนใช้" | 🔴 **Override** | ⚠️ **DEFER F#15** (keep code dormant) |
| Q23 | Stolen lookup | **Admin เท่านั้นก่อน** | 🔴 **Override** | ⚠️ **REMOVE public shortcode** |
| Q24 | Audit retention | **B** 3y operational + 5y sensitive | ✅ Yes | ✅ Done |
| Q25 | Banner limit | **A** 3 home + scrollable | ✅ Yes | Phase 2 W7 |
| Q26 | Notification opt-out | **A** per-type | ✅ Yes | Phase 2 W7 |
| Q27 | Tier badge | "มี Card Role อยู่แล้วไปอ่านระบบดีๆก่อน" | 🟡 Use existing | ⚠️ Read existing system first |
| Q28 | Asset card timeline | **B** Collapsible | ✅ Yes | Phase 2 W7 |
| Q29 | Scan vs Type first | **A** Scan first | ✅ Yes | Phase 2 W7 |

---

## 🔴 Critical Overrides (5 ข้อ — กระทบ scope significantly)

### Override #1: Q21 — ตัด F#12 Anti-Fraud Engine ออกทั้งหมด

**Boss reasoning**: "ไม่ค่อยมีคนปลอมหรอก ให้ทำกันไว้เฉยๆ" + "ตัดระบบของปลอมออกไปเลย เยอะเกิน ไม่ใช้แล้ว"

**สิ่งที่ต้องทำ**:
- ลบ Tab 7 "Fraud Queue" ใน Production SN Manager
- ลบ cron `dinoco_sn_fraud_aggregate_cron`
- ลบ helper `dinoco_sn_compute_fraud_score()`
- ลบ REST `/fraud/queue`, `/fraud/stats`, `/fraud/{id}/decision`
- ลบ schema `wp_dinoco_sn_fraud_scores` (drop table on uninstall, keep migration script)
- ลบ chatbot rules §15 references to F#12
- ลบ test file `tests/helpers/SnFraudScoreTest.php`
- Update OpenAPI spec — remove fraud paths
- Drift detector — remove F#12 assertions

**ผลกระทบ**: Phase 3 W10 W11 ลด ~30h dev work · WP plate fraud detection = manual review by admin

---

### Override #2: Q23 — ตัด Public Stolen Verify shortcode (Admin only)

**Boss reasoning**: "Admin เท่านั้นก่อน"

**สิ่งที่ต้องทำ**:
- ลบ snippet `[System] DINOCO Stolen Plate Public Verify` (DB_ID 1199)
- ลบ shortcode `[dinoco_stolen_check]`
- เปลี่ยน `GET /dinoco-sn/v1/stolen/verify/{sn}` permission จาก public → admin only (`dinoco_sn_perm_admin`)
- ตัด rate limit (admin = no rate limit needed)
- Update OpenAPI spec — change to admin auth
- Drift detector — remove `stolen_check` snippet from SN_SNIPPETS

**ผลกระทบ**: ตำรวจ/ประกัน/ดีลเลอร์ตรวจ stolen plate ผ่าน admin contact (manual) แทน self-service

---

### Override #3: Q22 — Defer F#15 Public API Gateway (keep code dormant)

**Boss reasoning**: "ยังไม่มีแผนใช้"

**สิ่งที่ต้องทำ**:
- ⚠️ Keep code (มี HMAC + AES-256-GCM ใน V.0.2 แล้ว) — ไม่ต้องลบ
- เปลี่ยน status: "ready but no partners" → master flag dormant
- ลบ Phase 4 W12 จาก active milestones
- ไม่ทำ Postman + sample code (Q12.3 — yank from autonomous batch)
- Documentation: เพิ่ม note "F#15 deferred per Q22 boss decision — activate when partners onboarded"

**ผลกระทบ**: code พร้อมใช้ ไม่ต้องลบ · งาน W12.3-W12.4 cancel · ทยอย onboard partner ทีหลังถ้ามีคำขอ

---

### Override #4: Q6 — F#8 Extension Marketplace → Phase 4 (ไม่ใช่ Phase 5)

**Boss reasoning**: "ทำให้ละเอียดที่สุด"

**สิ่งที่ต้องทำ**:
- ย้าย Phase 5 (4 wk) → Phase 4 (combine with W12-W14)
- เนื่องจาก F#15 cancel (Q22) → Phase 4 มี slot ว่าง 1 wk → ใช้สำหรับ F#8
- ⚠️ Q7 Override (Slip2Go verify only) → ไม่ต้องเซ็น LINE Pay/SCB → legal track ลดลง
- Q8 Override (per-SKU pricing) → ต้องสร้าง backend admin UI ใหม่
- Q20 Override (no refund) → consumer protection legal review needed

**Plan v2.13 update**:
- Phase 4 W12: F#8 schema + REST + admin UI per-SKU pricing (week 12)
- Phase 4 W13: F#8 customer LIFF + checkout + Slip2Go verify (week 13)
- Phase 4 W14: F#16 forecast (already done) + chatbot refactor + GDPR (already done)
- Phase 5: cancel — moved to Phase 4

**ผลกระทบ**: Phase 5 cancelled → 13.5 wk total instead of 17.5 wk · ต่อประกันใช้ได้สิ้นเดือน 4 (เร็วกว่าเดิม 1 เดือน)

---

### Override #5: Q8 — Per-SKU manual pricing (backend admin UI)

**Boss reasoning**: "ไม่ตายตัว — backend จะให้กรอกว่าแต่ละ SKU ต่อเท่าไหร่ต่อปี"

**สิ่งที่ต้องทำ**:
- NEW schema column: `wp_dinoco_products.extension_price_1y` + `extension_price_2y` + `extension_price_3y` (DECIMAL nullable)
- NEW admin UI: Inventory Database → Edit Product modal → "ราคาต่อประกัน" section (3 inputs per year)
- NEW REST endpoint: `GET /dinoco-sn/v1/extension/pricing/{sku}` — returns 3 tiers
- LIFF Extension page reads pricing per SKU (instead of % of base_price)
- Fallback: ถ้า extension_price_Ny IS NULL → ไม่ให้ต่อ (admin ต้องตั้งราคาก่อน)

**ผลกระทบ**: Admin งานเพิ่ม (กรอก 3 ราคา per SKU) แต่ flexibility สูง · ทำราคาตามต้นทุนจริง

---

## 🟡 Partial Overrides — ใช้ระบบเดิม

### Q15 — Backend UserAdmin Role-based Access Control (NEW work)

**Boss reasoning**: "ระบบ login backend `https://dinoco.in.th/admin-command-center/` ด้วย user wp อยู่ ซึ่งดี แต่ไม่ได้แยก role อาจจะต้องทำ Backend UserAdmin แบ่ง Role การเข้าถึงแต่ละหน้า"

**สิ่งที่ต้องทำ** (NEW snippet — งานใหญ่):
- NEW snippet `[Admin System] DINOCO User Role Manager`
- WP custom roles: `dinoco_admin_super` (boss), `dinoco_admin_warehouse`, `dinoco_admin_finance`, `dinoco_admin_service_center`, `dinoco_admin_marketing`
- NEW shortcode `[dinoco_admin_users_role]` — admin UI assign roles
- Per-tab visibility: each Admin Command Center tab declares required cap
- Replaces hardcoded approver list (Q15 original) → role-based tier matrix:
  - 🟢 auto: anyone with `dinoco_sn_*` cap
  - 🟡 single-admin: `dinoco_admin_super` OR `dinoco_admin_service_center`
  - 🔴 4-eyes: `dinoco_admin_super` × 2

**ผลกระทบ**: ใหม่งาน ~40h dev. ต้อง audit ทุก existing tab + add cap check. **อยู่นอก scope v2.13 SN เดิม** — เป็น meta-system improvement

---

### Q16 — ใช้ `[System] Transfer Warranty Page` เดิม (ไม่ทำใหม่)

**Boss reasoning**: "มันมีระบบ [System] Transfer Warranty Page ไม่ได้อ่านหรอ เลขเดิมโอนได้"

**สิ่งที่ต้องทำ**:
- อ่าน `[System] Transfer Warranty Page` V.30.2 + `[Admin System] DINOCO Manual Transfer Tool` V.30.2
- Phase 2 W6.6-7: hook sn_pool transfer (status='transferred' atomic + audit) เข้ากับ existing flow
- ไม่ต้องเปลี่ยน UX — ใช้หน้าเดิม + bug fix nonce (BUG-S2)

---

### Q27 — Card Role system existing → ใช้สำหรับ Tier badge

**Boss reasoning**: "มันมี Card Role อยู่แล้ว ไปอ่านระบบดีๆก่อน"

**Exploration result (2026-05-05 autonomous search)**:

ค้นทั่ว repo พบ 3 candidates ที่อาจเป็น "Card Role":

| Candidate | Snippet | Field/Schema | Match? |
|---|---|---|---|
| **B2B distributor `rank_system`** | `[B2B] Snippet 7` Cron + ACF on distributor CPT | `rank_system` ENUM (standard/silver/gold/platinum/diamond) — recomputed monthly จาก MTD sales | 🟡 Distributor-side only — ไม่ครอบ customer |
| **Legacy plastic card system** | `[System] Legacy Migration Logic` + `[Admin System] DINOCO Legacy Migration Requests` | `dnc_code` field (DNC/DNX format) — บัตรพลาสติกเก่าก่อนระบบดิจิตอล | 🔴 Not "Role" — เป็น migration only ไม่มี tier |
| **SN system `loyalty_tier`** | `[Admin System] DINOCO Production SN Manager` V.0.4 | `loyalty_tier` VARCHAR (bronze/silver/gold/platinum/diamond) ใน `wp_dinoco_sn_customer_ltv_snapshot` — recomputed daily จาก total_spent | 🟢 Customer-side — ใหม่ที่เพิ่งสร้าง |

**Most likely interpretation**: Boss หมายถึง **B2B `rank_system`** (option 1) — DINOCO มีระบบ tier บน distributor อยู่แล้ว (badge icon/label) → boss อยาก reuse pattern เดียวกันสำหรับ customer (NOT reinvent).

**Decision**: Tier badge for customer (v2.11 Member Dashboard `[dinoco_dashboard_header]` `dinoco_sn_get_user_ltv()`) จะ:

1. **Render style copy จาก B2B distributor rank** — emoji + label + color (🥉/🥈/🥇/💜/💎)
2. **Data source** = `wp_dinoco_sn_customer_ltv_snapshot.loyalty_tier` (Q9 LTV ที่ผมสร้างแล้ว)
3. **Visual subtle** บนหน้าแรก (badge ข้างชื่อ + tooltip on tap → drill-down)
4. **No new "Card" entity** — ใช้ snapshot table ที่มี อยู่แล้ว — สอดคล้อง boss "อย่าสร้างใหม่"

**Status**: ⚠️ Pending boss confirmation — ถ้า boss หมายถึงระบบอื่น (มี customer-side tier system ที่ผมยังไม่เจอ) → boss ระบุชื่อ snippet/file ให้ผม explore ใหม่

---

## 🔄 Plan v2.13 Updated Roadmap

### Cancelled / Removed
- ❌ F#12 Anti-Fraud Engine (Q21) — entire Tab 7 + cron + REST + table + tests
- ❌ Public Stolen Verify shortcode (Q23) — admin-only via existing endpoints
- ❌ F#15 Public API active rollout (Q22) — code dormant, no Postman/samples
- ❌ Phase 5 separate marketplace (Q6) — merged into Phase 4

### Modified
- 🔄 F#8 Extension Marketplace → Phase 4 W12-13 (was Phase 5)
- 🔄 F#8 pricing model → per-SKU manual (Q8) instead of % retail
- 🔄 F#8 payment → Slip2Go verify only (Q7) instead of LINE Pay/SCB
- 🔄 F#8 refund policy → no refund (Q20) — needs legal review
- 🔄 Q15 approval workflow → role-based access via NEW User Role Manager snippet

### Added
- ➕ Backend UserAdmin Role Manager (Q15) — NEW snippet ~40h
- ➕ Extension per-SKU pricing schema + admin UI (Q8) — ~8h
- ➕ Read existing Card Role system (Q27) — exploration before tier badge implement

### Total scope change
- v2.13 original: 19 wk, ~620h
- v2.14 (post-overrides): ~14-15 wk total
  - F#12 cut (-30h)
  - F#15 active rollout cut (-20h)
  - Public stolen verify cut (-5h)
  - Phase 5 cut (-4 wk = -160h)
  - User Role Manager add (+40h)
  - Q8 per-SKU pricing add (+8h)
  - **Net**: -167h savings, faster timeline

---

## 📅 Next Actions (autonomous + boss confirmation gates)

### Immediate autonomous (ไม่ต้องรอ — additive cleanup)

1. **Cleanup F#12** (Q21) — remove Tab 7 + cron + REST + helpers + tests + drift assertions
2. **Cleanup public stolen verify** (Q23) — remove snippet + shortcode + flip endpoint to admin-only
3. **Update plan docs** — sync v2.13 → v2.14 in CLAUDE.md / README / docs/sn-system
4. **Backfill helper** (W2.5) — pure additive
5. **Forecast new-SKU fallback** (W13.3) — pure additive

### Pending boss confirmation (data + clarification)

- **Q15 Backend UserAdmin** — ใหญ่ ~40h ต้อง prioritize ก่อนหรือรอ Phase 4?
- **Q27 Card Role system** — ขอ pointer ว่ามันคือไฟล์ไหน / ฟังก์ชันอะไร / ที่ไหนต้องอ่าน?
- **C3 Pilot dealers** — ยังไม่ตอบ 5 ชื่อร้าน (ใช้ตอน Phase 1 W4 pilot)
- **Q20 No refund** — บอสยืนยันว่าผ่าน legal review แล้ว? (consumer protection law อาจขัดแย้ง)
- **F1-F5 Master flag flip timing** — เมื่อไหร่เปิด?
- **E1-E8 Touch live deploy gates** — ยืนยันแต่ละไฟล์ที่จะ touch
