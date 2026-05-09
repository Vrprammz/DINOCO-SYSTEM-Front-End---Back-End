# 32 — CS Training Material (Boss-teaches, 5 sessions × 1 hr)

**Status**: Boss directive 2026-05-09 = "บอส" (จะคุยเอง) → ทีมเตรียม slide deck + role-play scenarios + sign-off form ให้บอสใช้สอน CS team.

**Audience**: CS team ที่รับ DM Facebook ของลูกค้า. หลัง F#8 Marketplace launch → CS ต้องรับ refund requests + escalate.

**Duration**: 5 sessions × 1 hr × 1 day apart (recommend 10:00-11:00 ทุกเช้า) — กระจาย material ให้ย่อยง่าย ไม่ overload.

---

## Session 1 — Overview + ทำไมต้องเรียน

**Goal**: ให้ CS เข้าใจ context — ทำไม DINOCO เปิดบริการต่อประกัน + ทำไม CS ต้องเรียน flow ใหม่.

### Slides (15 min)
1. **DINOCO Story** — บอสเล่าตัวเอง 5 นาที
2. **F#8 Warranty Extension คืออะไร** — ลูกค้าจ่ายเงิน → ขยายเวลาประกัน
3. **ทำไม CS ต้องรับเรื่อง refund**
   - 7 วัน cooling-off ตามกฎหมาย
   - กระบวนการต้องชัดเจน + เร็ว
   - ป้องกัน chargeback ที่เสียค่าธรรมเนียม

### Q&A (45 min)
- เปิดให้ถามทุกอย่างเกี่ยวกับ Marketplace
- บอสตอบหรือบันทึกคำถามที่ตอบไม่ได้ → ทีมหา answer

### Homework
- อ่าน `docs/sn-system/28-refund-policy-warranty-extension.md` ก่อน Session 2

---

## Session 2 — DM Intake Script (Verbatim)

**Goal**: CS ต้อง memorize 4 templates — เปิดประโยคแรกให้ถูก = customer trust ขึ้น 80%.

### Template A — เริ่มต้นรับเรื่อง

```
สวัสดีค่ะ คุณ [ชื่อ] 🙏

ขอบคุณที่ติดต่อมานะคะ เราได้รับข้อความเรื่องขอคืนเงิน
การต่อประกันแล้วค่ะ

เพื่อช่วยให้เราดำเนินการได้เร็วที่สุด ขอข้อมูล 3 อย่างค่ะ:

1. หมายเลข Extension ID (ดูได้จากใบเสร็จที่ DINOCO ส่ง
   ใน LINE — ขึ้นต้นด้วย "WX-")
2. สาเหตุที่อยากขอคืนเงิน
3. หลักฐาน (ถ้ามี — เช่น screenshot)

เรามีนโยบายคืนเงินภายใน 7 วัน หลังชำระเงินค่ะ
ทีมงานจะตรวจสอบและตอบกลับภายใน 24 ชม.
```

### Template B — ลูกค้าให้ข้อมูลครบ → escalate

```
ขอบคุณข้อมูลครบถ้วนค่ะ คุณ [ชื่อ] 🙏

ดิฉันได้บันทึกคำขอของคุณเข้าระบบเรียบร้อยแล้ว
หมายเลขเคส: REF-[YYYYMMDD-NNN]

ทีมงานจะตรวจสอบและติดต่อกลับภายใน 24 ชม.
ระหว่างนี้ ถ้ามีข้อมูลเพิ่มเติมส่งมาได้ค่ะ

ขอให้คุณไม่กังวลค่ะ เราจะดูแลให้ดีที่สุด
```

### Template C — เกิน 7 วัน (decline)

```
สวัสดีค่ะ คุณ [ชื่อ] 🙏

ขออภัยที่ต้องแจ้งให้ทราบค่ะ — ตามนโยบายคืนเงินของ DINOCO
ลูกค้าสามารถขอคืนเงินภายใน 7 วันหลังชำระเงิน

จากตรวจสอบ การชำระเงินของคุณคือเมื่อวันที่ [วันที่]
ซึ่งเกินกว่า 7 วันแล้ว ทำให้ไม่เข้าเงื่อนไขการคืนเงินค่ะ

แต่!! ถ้าคุณยังไม่เคยใช้สิทธิ์ extension เลย
ทีมเราอาจช่วยพิจารณาเป็นกรณีพิเศษได้
ขอติดต่อคุณกลับใน 24 ชม. ค่ะ
```

### Template D — ฉ้อโกง / impossible request

```
สวัสดีค่ะ คุณ [ชื่อ] 🙏

ขอบคุณที่ติดต่อมาค่ะ — กรณีของคุณเรามีข้อมูลที่ต้องตรวจ
สอบเพิ่มเติม

ดิฉันได้แจ้งให้หัวหน้าทีมเข้ามาดูแลแล้ว ทางทีมจะติดต่อ
กลับภายใน 48 ชม.

ขอความกรุณาเตรียมข้อมูลเพิ่มเติม:
• สำเนาบัตรประชาชน (ปกปิด ID หลัง 4 ตัว)
• สลิปโอนเงินต้นฉบับ

ขอบคุณที่ให้ความร่วมมือค่ะ
```

### Practice (40 min)
- บอสเป็นลูกค้า → CS ตอบ template A → B → repeat 3 รอบ
- บอสเปลี่ยนเป็น "ลูกค้าโกรธ" + "ลูกค้าเงียบ" + "ลูกค้าฉ้อโกง"

---

## Session 3 — Escalation Levels L1–L6

**Goal**: รู้ว่าเรื่องไหนต้อง escalate + ใคร + เมื่อไหร่.

### Escalation Matrix

| Level | Trigger | ผู้รับ | SLA |
|---|---|---|---|
| **L1** | ทุกเคสเริ่มต้น | CS handler | 24 hr |
| **L2** | ลูกค้าโกรธ + threat negative review | CS supervisor | 4 hr |
| **L3** | ยอดคืน ≥ ฿5,000 (ต้อง 4-eyes approval) | CS supervisor + finance admin | 24 hr |
| **L4** | สงสัยฉ้อโกง (chargeback abuse pattern) | บอส + นิติกร | 48 hr |
| **L5** | ปัญหาด้านกฎหมาย (ลูกค้าขู่ฟ้อง) | บอสโดยตรง | 4 hr |
| **L6** | ระบบฐานข้อมูลผิดพลาด (refund needed but data corrupt) | บอส + dev team | ทันที |

### Mock scenarios (40 min)
- บอสอ่าน scenario → CS เลือก L level → อธิบายเหตุผล
- 10 scenarios เตรียมไว้ (ดู Section ด้านล่าง)

---

## Session 4 — Manual Refund Tool (Backend)

**Goal**: CS supervisor ใช้ Manual Refund Tool ใน admin command center ได้.

### Slides + screen demo

1. Login → admin command center → "Refunds" tab (จะมีหลัง Phase 5 W17.2)
2. Search by Extension ID หรือ customer phone
3. Click "Initiate Refund" → fill form
4. ถ้ายอด ≥ ฿5,000 → ระบบ block + ขอ approver code
5. หลัง approve → CS โอนเงินผ่าน mobile banking → click "Mark refunded" + อัพโหลดสลิป

### Practice (30 min)
- Staging environment + 3 mock refund cases
- บอส approve mock cases ให้ดูตัวอย่าง

---

## Session 5 — Sign-off + Mock Test

**Goal**: ทุกคนผ่าน 3 mock scenarios ก่อนเริ่มงานจริง.

### Mock test (45 min)
- 3 scenarios แบบ random
- ใช้ rubric (ตัวอย่างด้านล่าง)
- ผ่าน 3/3 = sign-off
- ผ่าน 2/3 = ทบทวน + ทำใหม่
- ผ่าน 1/3 = retake training

### Sign-off form

```
─────────────────────────────────────────────────────
DINOCO CS Training Sign-Off

ชื่อ: ________________________________
ตำแหน่ง: ____________________________
วันที่ training: ____ / ____ / 2026

✓ Session 1 — Overview                  [ ผ่าน ] [ ไม่ผ่าน ]
✓ Session 2 — DM templates              [ ผ่าน ] [ ไม่ผ่าน ]
✓ Session 3 — Escalation levels          [ ผ่าน ] [ ไม่ผ่าน ]
✓ Session 4 — Refund tool                [ ผ่าน ] [ ไม่ผ่าน ]
✓ Session 5 — Mock test (3/3 required)   [ ผ่าน ] [ ไม่ผ่าน ]

ลายเซ็น CS:        ____________________
ลายเซ็นบอส:       ____________________
วันที่:              _______________

หมายเหตุ:
_______________________________________________________
_______________________________________________________
─────────────────────────────────────────────────────
```

---

## Mock Scenarios (10 cases for practice)

### Scenario 1 — Cooling-off ปกติ
ลูกค้า: "เพิ่งซื้อต่อประกันเมื่อวานนี้ค่ะ แต่เปลี่ยนใจอยากคืน"
Expected: Template B → escalate L1 → process refund 100%

### Scenario 2 — เกิน 7 วัน
ลูกค้า: "ซื้อต่อประกันไป 2 อาทิตย์แล้ว ตอนนี้อยากคืน"
Expected: Template C → decline (ตาม policy)

### Scenario 3 — ลูกค้าโกรธ
ลูกค้า: "ระบบ DINOCO โกง! ผมจ่ายแล้ว 2 ครั้ง! ถ้าไม่คืนผมจะ post Facebook!"
Expected: Template B (เห็นใจ) → check duplicate charge → escalate L2

### Scenario 4 — ยอดเยอะ
ลูกค้า: "ต้องการคืนเงิน ฿8,000 ค่ะ"
Expected: Template B → escalate L3 (4-eyes ≥ ฿5,000)

### Scenario 5 — Fraud suspect
ลูกค้า: บัญชีใหม่ + chargeback record + เคสซ้ำ 3 ครั้งใน 1 เดือน
Expected: Template D → escalate L4

### Scenario 6 — Used extension แล้ว
ลูกค้า: "ขอคืนเงินค่ะ ใช้ไปเคลม 1 ครั้งแล้ว"
Expected: Template C → decline (ใช้สิทธิ์แล้ว ไม่ refund)

### Scenario 7 — ลูกค้าเงียบ
CS ส่ง template A → ลูกค้าเงียบ 24 ชม.
Expected: Follow-up message + ปิดเคสถ้าเงียบ 7 วัน

### Scenario 8 — ระบบ error
ลูกค้า: "จ่ายเงินแล้วแต่ยังไม่ได้ extension"
Expected: Template B → ตรวจ DB → escalate L6

### Scenario 9 — ภาษาอังกฤษ
ลูกค้า: "Hi, can I refund my warranty extension?"
Expected: Tempalte A but in English version (ทีมเตรียมแยก)

### Scenario 10 — Threat คดี
ลูกค้า: "ถ้าไม่คืนผมจะฟ้อง"
Expected: Template D → escalate L5 → notify บอส ทันที

---

## Rubric (CS evaluation)

| Criteria | Pass | Fail |
|---|---|---|
| ใช้ template ถูกตัว | ใช้ template ที่ตรงกับเคส | ใช้ผิด → ลูกค้าได้ข้อมูลผิด |
| ขอข้อมูลครบ | ครบ 3 (ID + reason + evidence) | ขาด 1+ |
| Escalate ถูก level | L level ตรง matrix | L ผิด |
| Tone | สุภาพ + เห็นใจ + เป็นทางการ | rude / dismissive |
| Time | ≤ 5 นาทีต่อเคส | > 10 นาที |

---

## Resources for boss

- Section 2 verbatim templates: print + พกในกระดาษระหว่าง training
- Section 7 mock scenarios: เตรียม index card 10 ใบ shuffle ก่อน practice
- Section 9 rubric: print แจกทุกคน + ใช้ self-eval หลัง mock

---

## After training — first 30 days

- Daily LINE check-in 1 ครั้ง: บอสถาม CS team "วันนี้มีเคสยากไหม"
- Weekly review: CS team รวมเคสยากแล้ว discuss
- Monthly retrospective: วัด refund success rate + customer NPS

---

_Drafted 2026-05-09 per boss directive "บอส" (จะสอนเอง)._
_File: docs/sn-system/32-cs-training-material-for-boss.md_
