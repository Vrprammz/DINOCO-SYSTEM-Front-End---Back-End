# 📞 Customer Support Readiness Plan

**Date**: 2026-05-07
**Source**: Plan v2.13 §Phase 1 W4 R3 BLOCKER + Q20 manual refund flow
**Owner**: Customer Service Lead
**Audience**: CS reps + Tech Lead + บอส

---

## 🎯 Purpose

Pre-Phase 1 W4 → CS team ต้องพร้อมรับ inbound queries สำหรับ:
- Refund requests (Q20 manual flow)
- Voided plate inquiries
- Recalled plate inquiries
- Stolen plate reports
- Lost LINE OAuth (re-auth via DM)

ระบบ S/N v2.13 ทำให้ลูกค้าโทรเข้า Facebook DM / LINE มากขึ้น — CS team ต้องมี script + escalation chain + tooling พร้อม.

---

## 🗓️ Training Schedule

### Pre-launch training (Pre-Phase 1 W4 — 1 wk before F1 flip)

**Session 1: Refund flow + intake script** (Tech Lead delivers)
- Duration: 2 hr
- Material: `docs/sn-system/15-q20-manual-refund-sop.md` Section "CS Team Intake Script"
- Format: live demo + role-play + Q&A
- Output: CS reps sign off พร้อมรับงาน

**Session 2: Backend admin UI (refund + void + recall)** (Tech Lead delivers)
- Duration: 1 hr
- Material: live walkthrough Backend `/wp-admin/admin.php?page=dinoco-sn-refunds`
- Format: hands-on (CS rep operates UI in staging)
- Output: CS rep ผ่าน refund creation + 4-eyes simulation

**Session 3: LINE / Facebook DM tooling** (CS Lead delivers)
- Duration: 1 hr
- Material: company DM SOP + DINOCO Page admin access
- Format: existing CS doc refresh + S/N specific scenarios
- Output: CS reps ทดสอบ template responses

### Post-launch training (T+30d post F1 flip)

**Session 4: Real-case retrospective** (CS Lead + Tech Lead)
- Duration: 1.5 hr
- Material: 5-10 real cases จากเดือนแรก
- Format: case-by-case discussion + lessons learned
- Output: Update intake script + escalation rules

### Annual training (T+12 mo)

**Session 5: PDPA compliance refresh** (Legal counsel + CS Lead)
- Duration: 2 hr
- Material: `docs/compliance/PDPA-BASICS.md`
- Format: regulatory update + scenario review
- Output: PDPA awareness re-certification

---

## 📞 Facebook Intake Escalation Chain

ลูกค้า DM เข้า DINOCO Facebook page → CS rep รับ → flow ดังนี้:

```
[Customer DM]
    ↓
[CS Rep] — Step 1 intake (within 4 hr)
    ↓ (≥ ฿5,000 OR abuse pattern flag)
[CS Lead] — Step 2 verification + initial review
    ↓ (within 24 hr)
[Admin Senior] — Backend Manual Refund admin UI
    ↓ (4-eyes if ≥ ฿5K)
[Approver #2] — LIFF approval prompt
    ↓ (within 1 hr urgent / 24 hr normal)
[Cash-out execution]
    ↓
[Customer notification]
```

### Escalation rules

| Trigger | Action | Owner |
|---|---|---|
| ยอด < ฿5K + no flags | 1-eye admin approval | CS Lead |
| ยอด ≥ ฿5K | 4-eyes approval (LIFF) | Admin senior + Approver #2 |
| ยอด ≥ ฿20K | Telegram alert บอส + 4-eyes | Tech Lead notify |
| ≥ 3 refunds in 90d | Flag abuse + 4-eyes mandatory | Tech Lead review |
| Customer threatens legal action | Stop + escalate to Legal | บอส + Legal counsel |
| PDPA-related (data deletion request) | Route to GDPR queue | Tech Lead |

---

## 💰 Refund Reconciliation Owner

### Monthly reconciliation (วันที่ 25)

**Owner**: Accounting Lead (TBD — fill in pre-launch)
**Backup**: CS Lead (if Accounting Lead unavailable > 2 days)

**Steps**:
1. Export refund CSV: `GET /dinoco-sn/v1/refunds/export?from=YYYY-MM-01&to=YYYY-MM-31`
2. Reconcile against bank statement (PromptPay + bank transfer)
3. Match slip URL → bank reference number
4. VAT credit note ถ้า invoice เคยออก VAT
5. Flag discrepancies > ฿100 → Tech Lead review

**Output**: Monthly reconciliation report → บอส (15-min digest)

---

## 📝 Voided / Recalled / Stolen Response Templates

### Voided plate inquiry

```
สวัสดีค่ะ คุณ [CUSTOMER_NAME]

ตรวจสอบเพลท [SN] ในระบบแล้วค่ะ — เพลทนี้อยู่สถานะ "voided" (ยกเลิกใช้งาน)

สาเหตุ:
[REASON — เช่น "พิมพ์ผิดที่โรงงาน — ทีม Admin ยกเลิกแทน + ออกเพลทใหม่ให้แล้ว"]

หากคุณซื้อสินค้าจากร้าน/Marketplace แล้วเจอ S/N นี้ — โปรดแจ้งกลับทันที พร้อม:
1. ใบเสร็จ (รูปถ่าย)
2. ชื่อร้านที่ซื้อ
3. วันที่ซื้อ

ทีมจะตรวจสอบ supply chain + เปลี่ยนเพลทใหม่ให้คุณค่ะ 🙏
```

### Recalled plate inquiry

```
สวัสดีค่ะ คุณ [CUSTOMER_NAME]

เพลท [SN] ของคุณอยู่ใน batch ที่ DINOCO เรียกคืน (recall) เนื่องจาก [REASON — manufacturing defect / supply chain investigation]

ขั้นตอนต่อไป:
✅ ส่งคืนเพลทพร้อมสินค้าให้ DINOCO (ฟรี, ค่าส่งทีมรับผิดชอบ)
✅ DINOCO จะส่งสินค้าเปลี่ยน + เพลทใหม่ภายใน [TIMELINE]
✅ ประกัน + extension ของคุณยังใช้สิทธิ์ได้กับเพลทใหม่

จะให้ทีมส่ง waybill + รายละเอียดทาง DM นี้ค่ะ 🙏
```

### Stolen plate report

```
สวัสดีค่ะ คุณ [CUSTOMER_NAME] 🙏

ทีมรับเรื่องแจ้งหายของเพลท [SN] แล้ว — ขอข้อมูลเพิ่มเติมเพื่อบันทึก:
1. หมายเลข police report (ถ้ามี)
2. วันที่หาย / วันที่รู้ตัว
3. สถานที่ (ร้านสะดวกซื้อ / กลับบ้าน / ซื้อสินค้า ฯลฯ)
4. รายละเอียดสถานการณ์

ระบบจะ flag เพลทนี้เป็น "stolen" — หากใครเอามา activate ระบบจะแจ้งบอสทันทีค่ะ

(สำหรับการเคลมประกัน — ติดต่อทีม Service Center พร้อม police report ค่ะ)
```

### Lost LINE OAuth (re-auth via DM)

```
สวัสดีค่ะ คุณ [CUSTOMER_NAME]

เข้าใจค่ะ — เปลี่ยนมือถือ/ลบ LINE → ไม่เห็นเพลทเดิมในระบบ

วิธีแก้:
1. Login LINE ใหม่ในเครื่องเดียวกับเก่า (ใช้ LINE ID เดิม)
2. เข้า DINOCO LIFF → ระบบจะดึงเพลททั้งหมดที่เคย activate

ถ้า LINE ID เปลี่ยน (เช่น เบอร์ใหม่ = LINE ID ใหม่):
✅ แจ้งเลขเพลท S/N + รูปบัตรประชาชน
✅ ทีม Admin โอนสิทธิ์ให้ใน 1-2 วันทำการ

ขอข้อมูล:
1. เลขเพลท (เห็นได้บนสินค้า)
2. รูปบัตรประชาชน (เพื่อ verify เป็นเจ้าของจริง)
3. LINE ID ใหม่ที่ต้องการให้สิทธิ์โอนไป
```

---

## ✅ Pre-launch Sign-off

ก่อน F1 flag flip → CS team ต้องผ่าน checklist:

- [ ] Session 1 (refund script) — ผ่าน 100% reps
- [ ] Session 2 (Backend admin UI) — ผ่าน 100% reps
- [ ] Session 3 (DM tooling) — ผ่าน 100% reps
- [ ] Reconciliation owner ระบุชัด (Accounting Lead name + email)
- [ ] Backup reconciliation owner ระบุชัด (CS Lead)
- [ ] Templates 4 ชุด (voided/recalled/stolen/re-auth) ทดสอบ + อนุมัติ
- [ ] Escalation chain เข้าใจครบ + role-play passed
- [ ] บอส approve refund policy (฿5K + ฿20K thresholds)

**Sign-off**:
- [ ] CS Lead — name: ____________ date: __________
- [ ] Tech Lead — verified tooling: __________
- [ ] Accounting Lead — reconciliation flow OK: __________
- [ ] บอส — final policy approved: __________

---

## 📚 Related

- `docs/sn-system/15-q20-manual-refund-sop.md` — refund SOP (intake script)
- `docs/sn-system/19-q15-role-matrix-uat-plan.md` — role assignment for CS team
- `docs/sn-system/16-f8-legal-workstream-prephase1.md` — legal context
- `docs/compliance/PDPA-BASICS.md` — PDPA scaffold
