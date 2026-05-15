> ⚠️ **SUPERSEDED 2026-05-15** by [35-boss-final-decisions-2026-05-15.md](../35-boss-final-decisions-2026-05-15.md). Boss decision: F#8 uses non-VAT บัญชีบุคคล — NO legal workstream, NO VAT calculation, NO tax invoice. DO NOT send the email template in this doc.

# ⚖️ F#8 Legal Workstream — Pre-Phase 1 Kickoff

**Version**: 1.0 (2026-05-07)
**Boss decision (Q6)**: F#8 Extension Marketplace **Phase 5 → Phase 4** + "B แต่ทำให้ละเอียดที่สุด"
**Boss decision (Q7)**: Slip2GO + bank account only (no LINE Pay/SCB integration)
**Phase**: legal kicks off **NOW** (Pre-Phase 1) — runs parallel to Phase 1-3 development

---

## 🎯 Goal

Legal/regulatory readiness for warranty extension marketplace **before** Phase 4 W12 dev kicks off (~Week 12 of plan = +12 weeks from now). Legal has 8-12 wk lead time → must start immediately.

---

## 📋 Deliverables (8-12 wk timeline)

### Deliverable 1 — Terms & Conditions (T+0 to T+4 wk)
**Owner**: External legal counsel (ทนายภายนอก, recommend specialist e-commerce)
**Inputs**:
- Boss decisions Q6/Q7/Q8/Q20 (refund policy)
- Existing DINOCO warranty T&C (review + extend, don't replace)
- F#8 product spec (Phase 5 W15 spec to be drafted Week 4)

**Outputs**:
- `docs/legal/F8-TERMS-OF-SERVICE-V1.md` — customer-facing T&C
- `docs/legal/F8-PRIVACY-NOTICE-EXTENSION.md` — PDPA disclosure for extension purchase
- `docs/legal/F8-REFUND-POLICY.md` — formal refund policy (manual refund SOP must align)

### Deliverable 2 — Refund Policy Document (T+2 to T+5 wk)
**Owner**: Tech Lead + Customer Service + Legal counsel
**Inputs**: `docs/sn-system/15-q20-manual-refund-sop.md` (draft SOP)

**Outputs**:
- Customer-facing refund policy page (linked from LIFF cart)
- Admin SOP (already drafted) finalized + signed
- Standard email/Flex templates (refund approved / rejected / completed)

### Deliverable 3 — VAT Registration & Tax Compliance (T+4 to T+8 wk)
**Owner**: Accounting team + tax accountant
**Required if**: Annual marketplace revenue projected > ฿1.8M (VAT threshold)

**Outputs**:
- VAT registration certificate (or formal exemption assessment if under threshold)
- Tax invoice format approved by Revenue Department
- Reconciliation cycle documented (monthly close)

### Deliverable 4 — Tax Invoice Format (T+6 to T+8 wk)
**Owner**: Accounting + tech (PDF generator)

**Outputs**:
- Approved tax invoice template (Thai + English)
- Buddhist Era date display verified (ปี พ.ศ.)
- Withholding tax handling for B2B sales > ฿1,000
- PDF generator integration with `[Admin System] DINOCO Manual Invoice System`

### Deliverable 5 — Payment Compliance (T+5 to T+10 wk)
**Owner**: Tech Lead + Slip2Go integration partner

**Outputs**:
- Slip verification audit log retention spec (PDPA Art 17 + tax law 5y)
- Bank account ownership verification (must match DINOCO Co Ltd)
- PCI-DSS scope assessment (merchant-of-record handles card; we handle PromptPay/bank only — likely out of scope, confirm)

### Deliverable 6 — Marketing/Advertising Compliance (T+8 to T+12 wk)
**Owner**: Marketing + Legal

**Outputs**:
- LINE Flex marketing message templates approved (anti-spam compliance)
- F#1/F#4/F#10 cron message wording reviewed
- Promotional discount T&C aligned with Consumer Protection Act

---

## 🤝 Workstream coordination

### Weekly check-in
ทุกวันศุกร์ 10:00 — 30 min standup:
- Tech Lead — phase 1/2/3 development progress
- Legal — deliverable status (RAG status report)
- Accounting — VAT readiness
- บอส — escalation + decisions

### Blockers + dependencies

| Phase 1-3 dev work blocked by | Mitigation |
|---|---|
| F#8 schema design needs refund policy clarity | Use draft SOP `15-q20-manual-refund-sop.md` as starting point |
| Tax invoice format affects PDF generator | Reuse existing `b2b_send_invoice_image()` template; add F#8 line item type only |
| Slip2Go retention needs PDPA confirmation | PDPA pre-Phase 1 deliverable (`PDPA-BASICS.md` exists) |

### Deliverable T+12 wk gate

ก่อน Phase 4 W12 dev kicks off:
- [ ] Deliverables 1-3 signed off by external counsel
- [ ] VAT registration in flight (or exemption confirmed)
- [ ] Tax invoice template approved
- [ ] Payment compliance + bank account confirmed
- [ ] Marketing/advertising compliance review complete

ถ้าไม่พร้อม → Phase 4 W12 delayed → cascade to Phase 5 W15 (marketplace launch)

---

## 💰 Budget estimate

| Item | THB | Notes |
|---|---|---|
| External legal counsel | 80,000 - 150,000 | E-commerce specialist, 30-40 hr engagement |
| VAT registration + tax accountant | 30,000 | Annual retainer |
| Translation (Thai ↔ English) | 15,000 | T&C + invoice template |
| Slip2Go partnership review | 0 | existing contract sufficient |
| **Total** | **~125,000 - 195,000** | One-time + first-year |

---

## ⚠️ Risk

| Risk | Impact | Mitigation |
|---|---|---|
| Legal counsel unavailable in window | Phase 4 delayed | Engage 2 backup counsel candidates by Week 2 |
| VAT threshold crossed unexpectedly | Need urgent VAT registration | Monitor monthly revenue; alert at 70% threshold |
| Refund policy disputes go to court | Reputational + financial | Insurance: liability coverage for marketplace |
| PDPA enforcement (Section 39) | Fines up to ฿5M | Pre-Phase 1 PDPA work + 5y/3y retention split (REG-087) |

---

## 📚 Related

- `docs/sn-system/07-boss-decisions-log.md` — Q6/Q7/Q8 boss decisions
- `docs/compliance/PDPA-BASICS.md` — PDPA scaffold (existing)
- `docs/sn-system/15-q20-manual-refund-sop.md` — refund SOP draft
- `docs/sn-system/08-f8-extension-marketplace-q6-q8-q7-q20-replan.md` — F#8 phase replan

---

**Sign-off**:
- [ ] บอส — budget + timeline approved
- [ ] Tech Lead — workstream coordination plan OK
- [ ] Legal counsel selected — engagement letter signed
- [ ] Accounting — tax + VAT readiness owner identified

---

## ✉️ Boss Email Template (Urgency: This Week)

**Source**: Plan v2.13 §Phase 1 W4 R3 BLOCKER
**Action**: Tech Lead ส่ง email ภายใน 5 วันทำการนี้
**Recipient**: บอส (boss) — final budget + counsel selection approval

ใช้ template ด้านล่างเป็น verbatim — ปรับ name + amount + dates เท่านั้น:

---

> **From**: Tech Lead
> **To**: บอส (CEO)
> **Cc**: Tech Lead deputy
> **Subject**: 🚨 Phase 4 W12 Legal Engagement — ต้อง engage external counsel ภายในสัปดาห์นี้
>
> เรียน บอส
>
> **Summary**: Phase 4 W12 (F#8 Extension Marketplace launch) จะเริ่มเขียน code Week 12 (เริ่ม [DATE]) — ก่อนหน้านั้น **ต้อง engage external e-commerce counsel ให้ทำ deliverables 1-6 ใน docs/sn-system/16-f8-legal-workstream-prephase1.md**
>
> Timeline:
> - Phase 4 W12 dev kick-off: **[DATE_PHASE4_START]**
> - Legal engagement letter ต้องลงนามภายใน: **[DATE_PHASE4_START - 12 weeks]** = **[DATE_LEGAL_DEADLINE]** (ภายใน 5 วันทำการนี้)
> - หาก delay → Phase 4 W12 delayed → cascade impact ถึง Phase 5 marketplace launch (เลื่อน 2-4 wk)
>
> **Decisions ขออนุมัติ**:
> 1. ✅/❌ — Budget ฿125,000 - ฿195,000 (ดู `docs/sn-system/16-f8-legal-workstream-prephase1.md` §Budget) ครอบคลุม:
>    - External legal counsel ฿80K-150K (e-commerce specialist, 30-40 hr)
>    - VAT registration + tax accountant ฿30K (annual)
>    - Translation T&C (ไทย ↔ English) ฿15K
> 2. ✅/❌ — Counsel candidates ที่ Tech Lead screen ไว้:
>    - **Candidate A**: [NAME], [FIRM] — ฿4,500/hr, e-commerce + PDPA specialist, มี case แพ้ Lazada
>    - **Candidate B**: [NAME], [FIRM] — ฿3,800/hr, mass-market consumer law, มี client ใน Shopee
>    - **Candidate C**: [NAME], [FIRM] — ฿5,200/hr, payment compliance specialist (Slip2Go review), recommended ตามเรื่อง F#15 Public API + payment partnership
> 3. ✅/❌ — Refund policy direction (Q20 manual flow):
>    - Default = no automated refund; ติดต่อ Customer Support — ดู `docs/sn-system/15-q20-manual-refund-sop.md`
>    - Counsel จะ review SOP + suggest amendments
> 4. ✅/❌ — Payment gateway compliance scope:
>    - Slip2Go retention review (existing partnership) — counsel scope check
>    - PromptPay/bank transfer = merchant-of-record ต่อตัว (likely out of PCI scope, แต่ counsel confirm)
>
> **Risk if delayed**:
> - Phase 4 W12 marketplace launch delayed → revenue lost ~฿[ESTIMATE] from extension sales
> - PDPA enforcement risk ใน gap window (Section 39 fines up to ฿5M)
> - Counsel availability shrinks (Q4 = busy season, candidates booked solid)
>
> **Next steps after approval**:
> 1. Tech Lead schedule kickoff call กับ chosen counsel ภายใน 3 วันหลังบอส approve
> 2. Counsel เริ่ม deliverable 1-2 (T&C draft + refund policy review) week หน้า
> 3. Weekly Friday standup เริ่ม week หน้า — ดู `docs/sn-system/16-f8-legal-workstream-prephase1.md` §Weekly check-in
>
> ขอ reply หรือ verbal confirm ทาง LINE ภายใน [DATE+3] เพื่อให้ engagement letter ลงนามทันก่อน [DATE_LEGAL_DEADLINE]
>
> ขอบคุณครับ
> Tech Lead

---

### Email send checklist
- [ ] DATE placeholders replaced ด้วยค่าจริง
- [ ] Counsel candidates screened (A/B/C ที่กล่าวถึง — ส่ง CV link หรือ engagement letter sample)
- [ ] Budget ฿ ranges aligned กับ บอส accounting team แล้ว (no surprise)
- [ ] Cc Tech Lead deputy
- [ ] Sent date logged ใน `docs/sn-system/07-boss-decisions-log.md` Q6/Q7/Q8 row

### Follow-up cadence
- T+0d: ส่ง email
- T+3d: หากไม่มี reply → LINE follow-up บอส + standup mention
- T+5d: หากยังไม่ตอบ → escalate ทาง phone call (urgency = legal deadline)
- T+7d: หากยังไม่ลงนาม engagement → flag ใน Phase 4 W12 risk register