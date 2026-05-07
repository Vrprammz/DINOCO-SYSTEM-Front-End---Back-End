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
