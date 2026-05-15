> ⚠️ **MERGED 2026-05-15** into [15-q20-manual-refund-sop.md](./15-q20-manual-refund-sop.md) per [35-boss-final-decisions-2026-05-15.md](./35-boss-final-decisions-2026-05-15.md). Boss decision: F#8 + Q20 share single manual refund flow (admin Facebook DM intake).

# 28 — Refund Policy: Warranty Extension Marketplace (F#8)

**Status**: Boss directive 2026-05-09 = "ทำได้เลยไม่ต้องรอทนาย" — written by team, ready for implementation. Phase 4 W12 unblocked.

**Scope**: นโยบายคืนเงินสำหรับลูกค้าที่ซื้อ Warranty Extension (ซื้อต่อประกัน) ผ่าน LIFF page `/warranty/extend`.

**Effective date**: ตั้งแต่วันที่บอส flip flag `dinoco_sn_marketplace_enabled` = ON ใน Phase 4 W12 (โดยประมาณ ส.ค. 2026).

**Legal note**: เอกสารนี้ทีมเขียนตามแนวปฏิบัติ e-commerce ทั่วไป + พ.ร.บ. คุ้มครองผู้บริโภค ฉ.4 พ.ศ. 2562. แนะนำให้ทนายตรวจก่อน publish — แต่ไม่ block engineering build per boss directive.

---

## 1. ขอบเขตของการคืนเงิน

นโยบายนี้ใช้กับ **การซื้อต่อประกัน (Warranty Extension)** ผ่านหน้า `dinoco.in.th/warranty/extend?sn=...` เท่านั้น

**ไม่ครอบคลุม**:
- การซื้อสินค้าใหม่ (ใช้นโยบาย B2B/B2C เดิม)
- การเคลมสินค้า (ใช้กระบวนการ Service Center)
- การโอนสิทธิ์ประกัน (ฟรี ไม่มีค่าธรรมเนียม)

---

## 2. กรณีที่ลูกค้าขอคืนเงินได้ (Eligible)

ลูกค้าสามารถขอคืนเงินเต็มจำนวนได้ ภายใน **7 วัน** นับจากวันชำระเงิน หากเข้าเงื่อนไขข้อใดข้อหนึ่ง:

| # | เหตุผล | ระยะเวลา | คืนเงินเต็ม? |
|---|---|---|---|
| 2.1 | ระบบมีปัญหา ทำให้ลูกค้าได้รับ extension ไม่ถูกต้อง | 7 วัน | ✅ 100% |
| 2.2 | ลูกค้าชำระซ้ำ (double charge — ระบบ idempotency บกพร่อง) | 7 วัน | ✅ 100% (รวมส่วนที่เกินทุกครั้ง) |
| 2.3 | สินค้าที่อ้างถึงถูก void / recall โดย DINOCO หลังลูกค้าจ่าย | ตลอดอายุ | ✅ 100% + ดำเนินการตาม Recall SOP |
| 2.4 | ลูกค้าเปลี่ยนใจ (cooling-off period) | 7 วัน + ต้องไม่เปิดเคลมเลย | ✅ 100% |

**กรณี 2.4** — Cooling-off period:
- ตั้งแต่ชำระเงินสำเร็จ → 7 วัน (168 ชั่วโมง)
- ถ้ามีการเปิดเคลมหรือใช้สิทธิ์ extension ภายในระยะเวลานี้ → สิทธิ์คืนเงินตกเป็นโมฆะ
- คืนเงินผ่านช่องทางเดิม (PromptPay / โอน) ภายใน 7 วันทำการ

---

## 3. กรณีที่ลูกค้าไม่สามารถขอคืนเงินได้ (Non-eligible)

| # | สถานการณ์ |
|---|---|
| 3.1 | เกิน 7 วัน cooling-off |
| 3.2 | ลูกค้าใช้สิทธิ์ extension ไปแล้ว (มีการเคลมในระยะเวลาที่ extension เพิ่มให้) |
| 3.3 | ลูกค้าโอนสิทธิ์ประกันให้คนอื่นไปแล้ว |
| 3.4 | ตรวจพบฉ้อโกง (fake purchase + chargeback abuse) |
| 3.5 | ลูกค้าใช้คูปองส่งเสริมการขาย (promo code) ที่ระบุ "no refund" |

---

## 4. กระบวนการขอคืนเงิน (Customer flow)

### 4.1 ช่องทางขอคืนเงิน

ลูกค้าติดต่อ DINOCO Customer Support ทาง:
- **Facebook DM**: `m.me/dinoco.thailand` (แนะนำ)
- **LINE**: `@dinoco` (Official Account)
- **Email**: `support@dinoco.in.th`

โดยส่งข้อมูล:
1. หมายเลข Extension ID (รับจากใบเสร็จที่ DINOCO ส่งใน LINE)
2. เหตุผลการขอคืนเงิน (ตามข้อ 2)
3. หลักฐาน (ถ้ามี — เช่น screenshot error, ข้อความที่ถูกต้องของระบบ)

### 4.2 ระยะเวลาดำเนินการ

| ขั้นตอน | SLA |
|---|---|
| CS รับเรื่อง + ตอบกลับครั้งแรก | ภายใน 24 ชั่วโมง (วันทำการ) |
| ตรวจสอบเหตุผล + ตัดสินใจ | ภายใน 3 วันทำการ |
| โอนเงินคืนถ้าได้รับอนุมัติ | ภายใน 7 วันทำการ หลังอนุมัติ |
| **รวมทั้งกระบวนการ** | **สูงสุด 14 วันทำการ** |

### 4.3 4-eyes approval สำหรับยอด ≥ ฿5,000

ตาม R5 internal policy — ยอดคืนตั้งแต่ ฿5,000 ขึ้นไป ต้องมี admin 2 คนอนุมัติ (actor + approver) ภายในระบบ DINOCO Manual Refund Tool ก่อนโอนเงิน. ดู `15-q20-manual-refund-sop.md` Section 4 สำหรับ workflow ของ CS team.

---

## 5. การคำนวณยอดคืน

### 5.1 Full refund (เงินคืน 100%)
ลูกค้าได้คืนเต็มจำนวนที่ชำระมา **รวม VAT 7%** แต่ไม่รวมค่าธรรมเนียม payment gateway ที่หักไปแล้ว (ปกติ 1-2%).

**ตัวอย่าง**:
- ลูกค้าจ่าย ฿1,070 (subtotal ฿1,000 + VAT ฿70)
- ค่าธรรมเนียม payment gateway 2% = ฿21.40
- **ยอดคืน = ฿1,070 – ฿21.40 = ฿1,048.60**

### 5.2 Partial refund (กรณีเฉพาะ)
ไม่มีในนโยบายปัจจุบัน — refund แบบ all-or-nothing. ถ้าอนาคตเปิด tier-based extension ค่อยพิจารณา.

---

## 6. PDPA + การลบข้อมูล

หลังคืนเงินสำเร็จ:
1. รายการ extension ใน `wp_dinoco_sn_warranty_extensions` flag เป็น `refunded`
2. ใบเสร็จเดิมยังคงอยู่ในระบบ 5 ปี (Revenue Code §87/3 บังคับ — ไม่ลบได้แม้ลูกค้าขอ erasure ภายใต้ PDPA §17)
3. ข้อมูลส่วนบุคคลที่ไม่ใช่บัญชี/ภาษี (เช่น เบอร์โทร, LINE display name) ลบได้ตามคำขอ PDPA — ดู `docs/compliance/PDPA-BASICS.md`

---

## 7. Chargeback / Dispute

หากลูกค้า chargeback ผ่าน bank โดยไม่ผ่านขั้นตอนข้อ 4:
1. DINOCO มีสิทธิ์เก็บ digital evidence + นำเสนอ bank
2. Extension ตกเป็น void ทันที (ไม่คืนสิทธิ์ประกัน)
3. ถ้า chargeback ไม่ชนะ DINOCO → DINOCO รักษาสิทธิ์ดำเนินคดีตามกฎหมาย

---

## 8. การปรับปรุงนโยบาย

นโยบายนี้สามารถปรับปรุงได้โดย:
- DINOCO แจ้งล่วงหน้า ≥ 30 วัน ผ่าน LINE Official Account
- การปรับปรุงไม่กระทบ extension ที่ซื้อก่อนวันมีผลปรับปรุง

---

## 9. Implementation hooks (engineering reference)

| Code site | Behavior |
|---|---|
| Extension purchase flow (LIFF `/warranty/extend`) | Display TL;DR ของข้อ 2 ก่อน confirm |
| `POST /dinoco-sn/v1/extension/checkout` | Idempotency hash includes `amount_cents` (R3 financial replay defense) |
| `POST /dinoco-sn/v1/refund/issue` (Phase 5 W17.2) | 4-eyes ≥ ฿5,000 + status=refunded + cascade revert warranty_until |
| Manual Refund SOP CS Team | `15-q20-manual-refund-sop.md` |

---

_Drafted by team per boss directive 2026-05-09. Last updated: 2026-05-09._
_Recommend lawyer review before public launch (Phase 4 W12) — currently NOT blocking._