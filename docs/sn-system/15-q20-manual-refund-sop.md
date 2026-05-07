# 💰 Q20 Manual Refund — Standard Operating Procedure

**Version**: 1.0 (2026-05-07)
**Boss decision**: Round 2 (2026-05-05) **REVERT** — ไม่ใช่ "ไม่คืน" → manual refund flow
**Boss verbatim**: "ลูกค้าติดต่อ Admin Facebook + Backend ปุ่มยืนยันคืน"

---

## 🎯 Goal

ระบบคืนเงิน F#8 Marketplace warranty extension เมื่อลูกค้าซื้อแล้วต้องการ refund. ไม่ทำ self-service refund เพราะ:

1. ป้องกัน abuse (ซื้อ → claim → refund loop)
2. ให้ Admin ทบทวน case-by-case
3. 4-eyes approval สำหรับ refund ≥ ฿5,000 (Q15 R2)

---

## 📞 Step 1 — Customer intake (Admin Facebook)

ลูกค้าส่งข้อความใน Facebook Inbox @DINOCOTH (หรือ LINE @dinoco):

### Admin script (Q&A template)
> ขอบคุณที่ติดต่อทีม DINOCO ครับ/ค่ะ 🙏
>
> **ขอข้อมูลดังนี้เพื่อตรวจสอบคำขอคืนเงิน**:
> 1. หมายเลขออเดอร์ (เริ่มต้นด้วย `INV-` หรือ `EXT-`)
> 2. หมายเลข S/N เพลทประกัน (รูปจากใต้สินค้า)
> 3. เหตุผลการขอคืนเงิน (เลือก 1):
>    - a) ซื้อผิดสินค้า / ผิดรุ่น
>    - b) ไม่ต้องการขยายประกันแล้ว
>    - c) ปัญหาคุณภาพสินค้า → จะแยกเป็นเคสเคลม
>    - d) อื่น ๆ (โปรดระบุ)
> 4. ช่องทางคืนเงิน:
>    - PromptPay เลขเดียวกับสลิปจ่าย หรือ
>    - บัญชีธนาคารชื่อตรงกับลูกค้า
>
> SLA: ทีมจะตอบกลับภายใน **48 ชั่วโมงทำการ** ครับ/ค่ะ

---

## 🔍 Step 2 — Admin verification (Backend)

Admin เปิด `[Admin System] DINOCO Manual Invoice System` shortcode → tab "💰 Refund Requests" (NEW UI per Q20 R2):

### Verification checklist
- [ ] หมายเลข INV/EXT ตรงกับฐานข้อมูล `wp_posts`
- [ ] S/N ตรงกับ `wp_dinoco_sn_pool` + ผูกกับ user เดียวกัน
- [ ] ยังไม่มี refund record อยู่แล้ว (ป้องกัน double-refund)
- [ ] Order status ไม่ใช่ `cancelled` หรือ `refunded` อยู่แล้ว
- [ ] เหตุผลที่ลูกค้าระบุ valid (case (c) ปัญหาคุณภาพ → redirect → claim flow แทน)

### Admin form fields
- หมายเลขอ้างอิง (INV/EXT)
- ยอดเงินขอคืน (THB, default = order total)
- ช่องทางคืนเงิน (PromptPay / bank account)
- หมายเหตุ
- เลือก approver (ถ้า ≥ ฿5,000)

---

## 🔐 Step 3 — 4-eyes approval (≥ ฿5,000)

ถ้ายอด refund **≥ ฿5,000** บังคับ 4-eyes:
1. Admin A กรอก request → กดปุ่ม "ส่งให้ผู้อนุมัติ"
2. ระบบ:
   - INSERT row ใน `wp_dinoco_sn_approval_queue` with `tier=urgent` (ถ้า > ฿20K) หรือ `tier=normal`
   - LINE Flex notification ถึง approver list (กำหนดผ่าน Q15 V.0.2 Role Manager UI)
   - Self-approval block: actor === approver → 422 (ดู REG-086)
3. Approver B เปิด LIFF → กดยืนยัน
4. ระบบ:
   - SELECT FOR UPDATE on refund row
   - ตรวจสอบไม่ stale (lock_version match)
   - INSERT audit row + flip status=`approved`
   - Trigger Step 4 (cash-out)

ถ้ายอด < ฿5,000 → 2-eyes (admin คนเดียวอนุมัติได้) แต่ audit log ยัง mandatory

---

## 💳 Step 4 — Cash-out execution

### PromptPay path
1. Admin โอนเงินจากบัญชี DINOCO → PromptPay number ลูกค้า
2. ถ่ายภาพ slip
3. Upload slip ใน admin form → ระบบ:
   - บันทึก slip URL ใน `wp_dinoco_sn_refund_records.slip_image_url`
   - Verify ผ่าน `b2f_verify_slip_image()` (Slip2Go) ว่ายอดถูกต้อง ±2%
   - ถ้า verify fail → flag `slip_status=manual_review`

### Bank transfer path
1. Admin โอนผ่าน Mobile Banking → ถ่ายภาพ slip
2. Same upload + verify flow

### Both paths
- INSERT audit row `event_type=manual_refund` (5y retention per REG-087)
- Update refund row `status=completed` + `paid_at=NOW()`
- Flip sn_pool entry: `extension_active=0` (revert warranty extension)
- Send LINE Flex confirmation to customer + admin group

---

## 📒 Step 5 — Accounting reconciliation

ทุกวันที่ 25 ของเดือน:
- Export refund report CSV: `GET /dinoco-sn/v1/refunds/export?from=YYYY-MM-01&to=YYYY-MM-31`
- Columns: refund_id, customer_id, sn, original_invoice, refund_amount, paid_at, slip_url, approver_user_id, audit_log_id
- ส่งให้ทีมบัญชีลง book + handle VAT credit note (ถ้า invoice เคยออก VAT)

---

## 🛡️ Anti-abuse rules

- **Rate limit**: ลูกค้า 1 คน — refund ≥ 3 ครั้งใน 90 วัน → flag `flag_abuse_pattern=1` ต้อง 4-eyes ทุกครั้งหลังจากนั้น
- **Cool-down**: ขยายประกันแล้วซื้อภายใน 7 วัน หากขอ refund → admin discretion (default approved)
- **Cool-down >7 วัน**: ต้องหา reason valid + 4-eyes regardless of amount

---

## ⏱️ SLA + escalation

| Stage | SLA |
|---|---|
| Admin first response | ≤ 48 hr (working days) |
| 4-eyes approval (urgent ≥ ฿20K) | ≤ 1 hr |
| 4-eyes approval (normal ≥ ฿5K) | ≤ 24 hr |
| Cash-out execution | ≤ 48 hr after approval |
| Customer notification | < 5 min after cash-out |

หาก SLA breach → auto-escalate ถึงคนต่อใน delegation list (ดู REG-086)

---

## 📚 Related

- `docs/sn-system/07-boss-decisions-log.md` — Q20 R2 revert + Q15 R2 role-based access
- `docs/sn-system/19-q15-role-matrix-uat-plan.md` — 4-eyes UAT scenarios
- `docs/sn-system/16-f8-legal-workstream-prephase1.md` — refund policy legal kickoff
- `tests/helpers/SnApprovalEscalationTest.php` — REG-086 SLA logic verified
- `tests/helpers/SnApprovalTierTest.php` — existing tier mapping tests

---

**Sign-off**:
- [ ] Customer Service Lead — Facebook intake script approved
- [ ] Tech Lead — Backend UI design ตรงตาม SOP
- [ ] Accounting team — reconciliation flow OK
- [ ] บอส — final policy approval

---

## 📞 CS Team Intake Script — Facebook DM (R3 BLOCKER)

**Source**: Plan v2.13 §Phase 1 W4 R3 BLOCKER + Q20 R2 manual refund flow
**Owner**: Customer Service Lead
**Audience**: CS reps responding to refund inquiries via DINOCO Facebook page

ใช้ template ตามลำดับเป็น verbatim — ปรับเฉพาะ customer name + plate ID:

---

### Step 1 — Initial response (within 4 hr business hours)

```
สวัสดีค่ะ คุณ [CUSTOMER_NAME] 🙏

ทีม DINOCO รับเรื่องขอคืนเงินสำหรับการขยายประกัน [SN: DNCSS....] แล้วค่ะ

เพื่อให้ทีมตรวจสอบได้รวดเร็ว รบกวนแจ้งข้อมูล:
1. เลขเพลท S/N ที่ขยายประกัน (เช่น DNCSS0001234)
2. วันที่ซื้อ Extension (ดูได้จาก LINE Flex confirmation)
3. ยอดเงิน (฿)
4. เหตุผลที่ขอคืน (เช่น ตัดสินใจคืนภายใน 7 วัน / สินค้าคุณภาพไม่ตรงกับที่คาด / โอนสิทธิ์ขายต่อแล้ว ฯลฯ)
5. PromptPay หรือเลขบัญชีธนาคารที่ต้องการรับเงินคืน (ของลูกค้าเองเท่านั้น)

ทีมจะตอบกลับภายใน 48 ชั่วโมงทำการค่ะ 🙏
```

### Step 2 — Verification (after customer provides info)

```
ขอบคุณค่ะ คุณ [CUSTOMER_NAME]

ทีมยืนยันข้อมูลแล้ว — Refund Request ถูกบันทึกในระบบ:
- Refund ID: REF-[YYYYMMDD]-[NNNN]
- ยอดที่จะคืน: ฿[AMOUNT]
- ช่องทาง: [PromptPay XXX-XXX-XXXX / Bank XXX-X-XXXXX-X]

ขั้นตอนต่อไป:
✅ ทีม Admin จะ review + approve (1-2 วันทำการ)
✅ หากยอด ≥ ฿5,000 จะมี approver ที่ 2 ตรวจซ้ำ (4-eyes review)
✅ เมื่อ approve แล้วจะโอนเงิน + แจ้ง slip ทาง DM นี้

⚠️ Note: Extension warranty จะถูก revoke พร้อมโอนคืน (ใช้สิทธิ์ไม่ได้แล้ว)

มีคำถามเพิ่มเติมแจ้งได้เลยค่ะ 🙏
```

### Step 3 — Edge cases — escalation rules

| Customer ผิดเงื่อนไข | Response |
|---|---|
| Extension ใช้ไปแล้วบางส่วน (claim already filed) | "ค่ะ — ทีมตรวจพบมีการเคลมในระยะ Extension แล้ว — case นี้ขอ escalate ไป Manager. ทีมจะติดต่อกลับภายใน 5 วันทำการ" |
| ขอ refund > 90 วันหลังซื้อ | "ตามนโยบายระบบ refund window = 90 วัน — case นี้ขอ escalate ไปบอส. ทีมจะติดต่อกลับ" |
| Suspicious abuse pattern (≥ 3 refunds ใน 90d) | "ค่ะ — case นี้ระบบ flag เป็น 4-eyes mandatory — ทีม Admin senior จะ review เพิ่มเติม" + alert Tech Lead |
| ยอด ≥ ฿20,000 (urgent tier SLA 1 hr) | Trigger Telegram alert บอส immediately + notify CS Lead |
| Customer claims บัตรเครดิต / ตัดผ่าน gateway อื่น | "ค่ะ — refund ของกระบวนการชำระอื่นต้อง process ผ่าน gateway โดยตรง — ขอเชื่อมต่อ Tech Lead" |

### Step 4 — After admin approval — confirmation message

```
สวัสดีค่ะ คุณ [CUSTOMER_NAME] 🎉

Refund ของคุณ approved + โอนเงินเรียบร้อยแล้วค่ะ:
- Refund ID: REF-[YYYYMMDD]-[NNNN]
- ยอด: ฿[AMOUNT]
- โอนเมื่อ: [DATE TIME]
- Slip: [URL_OR_ATTACHMENT]

✅ Extension warranty ถูก revoke แล้ว
✅ เพลท S/N กลับสู่สถานะ registered (ประกันเดิม) — ใช้สิทธิ์เคลมประกันต่อได้

ขอบคุณที่ไว้วางใจ DINOCO ค่ะ 🙏
หากต้องการสอบถามเพิ่มเติม DM กลับมาได้เสมอ
```

### Step 5 — Decline message (refund rejected)

```
สวัสดีค่ะ คุณ [CUSTOMER_NAME]

ทีม Admin review เรื่องขอคืนเงินแล้ว — ขออภัย case นี้ไม่ผ่านเงื่อนไข:

เหตุผล: [REASON — e.g. "เกินระยะ 90 วัน" / "เคลมในระยะ Extension แล้ว"]

หากต้องการ appeal ขอให้ส่ง:
1. ข้อมูล + หลักฐานเพิ่มเติม
2. เหตุผล appeal

ทีมจะ escalate ไปบอสภายใน 7 วันทำการค่ะ 🙏

(สำหรับ disputes ทางกฎหมาย — โปรดติดต่อ DINOCO Co Ltd. ที่ [LEGAL_EMAIL])
```

---

## 🚨 Escalation Chain

| Level | Timing | Owner | Action |
|---|---|---|---|
| L1 | T+0 (initial intake) | CS Rep | Step 1-2 verification + log refund row |
| L2 | T+24h (no response from customer) | CS Rep | Reminder DM ครั้งที่ 1 |
| L3 | T+48h (customer responded, awaiting admin) | CS Lead | Backend review + approve/deny |
| L4 | T+72h (≥ ฿5K, awaiting 4-eyes) | Admin senior | 4-eyes approval (LIFF prompt) |
| L5 | T+96h (no admin action) | Tech Lead | Telegram alert + manual escalate ไปบอส |
| L6 | T+1wk (boss escalation) | บอส | Override decision + close case |

---

## 📊 Reconciliation Owner

**ทุกวันที่ 25 ของเดือน** — Accounting team รัน CSV export:
```
GET /dinoco-sn/v1/refunds/export?from=YYYY-MM-01&to=YYYY-MM-31
```

Owner: **Accounting Lead** (ชื่อ + email + phone — fill in pre-launch)
- ลงบัญชี + handle VAT credit note
- Reconcile กับ slip + bank statement
- Flag discrepancies ส่ง Tech Lead

Backup owner: **CS Lead** ถ้า Accounting Lead unavailable > 2 วัน

---

## ✅ CS Team Pre-launch Training (R3 BLOCKER acceptance)

ก่อน F1 flag flip → CS team ต้องผ่าน training:
- [ ] อ่านครบ template Step 1-5
- [ ] Role-play 3 cases ด้วย Tech Lead (refund / decline / escalate)
- [ ] Test backend Manual Refund admin UI (staging — ดู `docs/sn-system/22-customer-support-readiness-plan.md`)
- [ ] Sign off ที่ section นี้

**Training session**:
- Owner: CS Lead + Tech Lead
- Duration: 2 hr
- Schedule: Pre-Phase 1 W4 (1 wk before F1 flip)
- Material: ตัว doc นี้ + recorded session

**Sign-off**:
- [ ] CS Lead — script approved + role-play passed
- [ ] CS Rep #1 (name): ____________
- [ ] CS Rep #2 (name): ____________
- [ ] Tech Lead — backend tooling demo verified
- [ ] บอส — refund policy + escalation chain approved
