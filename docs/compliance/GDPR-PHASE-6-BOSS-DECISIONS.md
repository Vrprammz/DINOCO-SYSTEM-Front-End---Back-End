# GDPR Phase 6 — Boss Decisions Log

[← Compliance docs](./PDPA-BASICS.md) · [← Phase 6 design doc](./GDPR-PHASE-6-DESIGN.md)

> **Status**: BINDING DECISIONS — boss answered 2026-05-18. Phase 6/7 implementation must honor these.
> **Audit trail**: คำตอบนี้แทน 7 open questions ที่ค้างใน `GDPR-PHASE-6-DESIGN.md` §"Boss Decisions Pending"

---

## Context

ก่อนรัน GDPR/PDPA Phase 7 admin review จริง บอสต้องตัดสินใจ 7 policy questions เกี่ยวกับ erasure decision matrix + customer rights. คำตอบเหล่านี้ binding ทั้งระบบ — code paths + UI labels + admin training materials ต้องอ้างอิงตามนี้

DINOCO operates as **non-VAT บัญชีบุคคล** (boss decision 2026-05-15) — ลดภาระทาง tax retention + cross-border compliance ลงมาก

---

## Decision Matrix

### Q1 — Tax records retention (ปกติบังคับเก็บ 5 ปี)

**Boss answer**: ❌ **ไม่ต้องเก็บ**

**Reasoning**:
- DINOCO **ไม่ได้จำหน่าย B2C ตรง** — ไม่มี POS / online checkout
- **B2B = non-VAT บัญชีบุคคล** — ไม่ได้รับ VAT, ไม่ออกใบกำกับภาษี
- กฎหมาย retention 5 ปี (รัฐประมวลรัษฎากร §83/4) ใช้กับ VAT registrant — DINOCO อยู่นอกขอบ

**Implementation**:
- Delete flow → orders ของลูกค้า hard-delete ได้ (ไม่ต้อง anonymize เก็บ 5y)
- ลบ "tax retention" warning จาก admin review UI
- Erasure decision matrix → orders cell = `delete` (ไม่ใช่ `anonymize_keep_5y`)
- Exception: ถ้า future-เปลี่ยนเป็น VAT registrant → re-evaluate

---

### Q2 — Warranty data preservation

**Boss answer**: ✅ **เก็บตลอดกาล** (forever — ไม่ลบแม้ประกันหมดอายุ)

**Reasoning**:
- ลูกค้าเก่าอาจกลับมาเคลม / ขอประวัติ / สอบถาม service history
- เพลท S/N + serial history ต้อง trace ได้เพื่อ anti-fraud (ตรวจของแท้)
- Warranty data = brand asset (อายุการใช้งานสินค้า, MTBF analytics)

**Implementation**:
- Delete flow → warranty CPT + claim CPT = **NEVER delete** ผ่าน erasure
- Anonymize เฉพาะ PII fields (line_uid, phone, address, email) — แต่ S/N + serial + product link เก็บ
- Erasure decision matrix → warranty/claim cell = `anonymize_keep_forever` (NEW status — extend ENUM)
- Admin review UI: warranty row แสดงสีเขียว "เก็บถาวร (สำหรับ service history)"

---

### Q3 — Cross-border GDPR (EU users — strict mode)

**Boss answer**: ⏭️ **Skip — ไม่ได้ใช้ใน EU**

**Reasoning**:
- DINOCO market = ไทย เป็นหลัก + อาจมีจีน (Maker B2F)
- ไม่มี EU user touchpoint
- GDPR Articles 15-17 strict-mode (30-day SLA, DPO requirement) = not applicable

**Implementation**:
- ลบ "EU strict mode" toggle จาก admin review UI
- Privacy policy ระบุ "PDPA Thailand only" — ตัด GDPR mention ที่ overpromise
- ถ้าตรวจพบ EU IP (future) → display generic privacy disclaimer ไม่ trigger strict flow
- Cookie consent banner: PDPA-style เพียงพอ (ไม่ต้อง GDPR-strict)

---

### Q4 — Appeal mechanism (ลูกค้าอุทธรณ์ delete decision)

**Boss answer**: 💬 **ให้ติดต่อ admin ผ่านแชท Facebook (DM)**

**Reasoning**:
- ไม่มี dedicated appeal portal — ทุก customer service ผ่าน FB OA
- Admin DM = single point of contact ลูกค้ารู้จัก
- ปริมาณ appeal คาดว่าน้อย — ไม่คุ้มสร้าง dedicated flow

**Implementation**:
- Admin reject UI → ส่ง LINE Flex หาลูกค้า + ปุ่ม **"💬 อุทธรณ์ผ่าน Facebook"** → deep-link FB messenger DM
- Email/LINE notification template: "หากต้องการอุทธรณ์ ติดต่อทาง Facebook DM ที่ m.me/dinoco"
- ไม่มี SLA appeal ใน code — manual handle ผ่าน FB
- Audit log บันทึก `appeal_directed_to_fb_dm` flag

---

### Q5 — Hard delete threshold (2nd admin approval สำหรับ user ที่มี data > X)

**Boss answer**: ❌ **ไม่มี 2nd approval** — admin คนเดียวอนุมัติได้ทุก case

**Reasoning**:
- ไม่ต้องการ workflow ซับซ้อน
- Admin = boss + trusted staff — ไว้ใจการตัดสินใจ
- Throughput สำคัญกว่า extra safeguard

**Implementation**:
- Admin review UI → ปุ่ม "Hard Delete" enable เสมอ (no 2nd approval gate)
- ลบ "requires_second_approval" flag จาก request schema
- Q15 role matrix: `dinoco_sn_perm_admin` ทำได้ทันที (no `dinoco_sn_perm_approver` second-step)
- Hard delete logged ใน audit trail (immutable) — ตรวจสอบ post-hoc ได้

---

### Q6 — Anonymize email pattern

**Boss answer**: ✅ **OK ใช้** `anonymized-XXX@deleted.local`

**Reasoning**:
- Pattern มาตรฐาน — recognizable
- `.local` TLD = ไม่ใช่ public domain → ไม่ leak ออกนอก
- XXX = random hash 8-12 chars → ไม่ collide

**Implementation**:
- `dinoco_gdpr_anonymize_email($user_id)` ใช้ pattern `anonymized-{md5(user_id . random)}@deleted.local`
- บังคับ unique per user → md5 hash ป้องกัน collision
- `wp_users.user_login` เก็บ pattern เดียวกัน (login disabled แล้ว — flag user_activation_key = 'DELETED')
- ทุก wp_usermeta key ที่มี email → replace ด้วย pattern

---

### Q7 — Data subject rights response SLA

**Boss answer**: ✅ **อนุมัติแล้วใช้ตลอดไปจนกว่าจะยกเลิก** (no hard deadline + perpetual approval)

**Interpretation**: ไม่มี hard 30-day SLA. Admin review manually เมื่อมีเวลา. Approved request = effective ต่อเนื่อง (token download URL หมดอายุ 7 วัน แต่ user ขอใหม่ได้ที่ status='ready')

**Reasoning**:
- บอสต้องการความยืดหยุ่น — ไม่ต้องการ alarm clock 30-day countdown
- ลูกค้าจริงๆ ไม่ค่อยมี — high SLA = unnecessary stress
- PDPA Thailand จริงๆ ไม่บังคับ 30-day strict (GDPR EU strict 30d)

**Implementation**:
- ลบ "30-day SLA countdown" UI ใน admin review tab
- เก็บ `dinoco_gdpr_sla_reminder_cron` แต่ไม่ alert เร่งด่วน — แค่ digest weekly สำหรับ admin info
- Status='approved' = perpetual จนกว่า admin จะ revoke
- Download token expiry คงเดิม 7 วัน (ต่ออายุ token ได้ผ่าน admin re-issue)
- Customer-facing message: "DINOCO จะดำเนินการเร็วที่สุด ปกติภายใน 7-14 วัน" (soft guidance, no hard commit)

---

## Implementation impact summary

| Component | Change |
|---|---|
| Erasure decision matrix | Orders = `delete` (was `anonymize_keep_5y`), Warranty = `anonymize_keep_forever` (NEW status), Claims = `anonymize_keep_forever` |
| Admin review UI | Remove: EU strict toggle / 2nd approval gate / 30-day SLA countdown / tax retention warning |
| Admin review UI | Add: "💬 อุทธรณ์ผ่าน FB" button on reject + sn_ext "เก็บถาวร" green badge on warranty rows |
| Email/LINE templates | Remove GDPR-strict language, replace with PDPA + FB DM appeal info |
| Cron `sla_reminder` | Keep but downgrade to weekly digest only (no urgent alerts) |
| Schema (additive) | ENUM `wp_dinoco_gdpr_requests.action` extend with `anonymize_keep_forever` value |
| `dinoco_gdpr_anonymize_email()` | Implement with `anonymized-{md5}@deleted.local` pattern |
| Audit log | Add `appeal_directed_to_fb_dm` event type for reject + customer notification |

## What does NOT change

- Customer-facing endpoints `/my-data-export` + `/my-data-delete` — same flow
- Admin REST endpoints `/admin/request/{id}/approve|reject|undo|manual-export` — same routes
- Export ZIP format + contents — same
- Schema base (Phase 4 ALTER) — additive only
- Idempotency-Key support — unchanged
- LINE notification on completion — unchanged

## Open items (boss may revisit later)

| Item | Note |
|---|---|
| EU expansion | If DINOCO sells to EU in future → re-enable strict mode |
| VAT registration | If DINOCO VAT-registers in future → re-enable 5y retention for orders |
| Volume scaling | If GDPR requests > 50/month → consider dedicated appeal portal (instead of FB DM) |
| Compliance audit | If 3rd-party PDPA audit required → may need to add 30-day SLA back |

---

## Sign-off

- **Boss decisions captured**: 2026-05-18 (response to "8" — GDPR Phase 6 design questions)
- **Implementation deadline**: TBD (dependent on full Phase 7 admin review UI completion)
- **Next review**: หลังเริ่มใช้งานจริง 3 เดือน — re-evaluate ตัวเลือกที่ยืดหยุ่นได้

## Related files

- [`docs/compliance/GDPR-PHASE-6-DESIGN.md`](./GDPR-PHASE-6-DESIGN.md) — original design + open questions (now answered here)
- [`docs/compliance/PDPA-BASICS.md`](./PDPA-BASICS.md) — Thai PDPA §30-39 reference
- [`docs/runbooks/GDPR-PHASE-7-END-TO-END-TEST.md`](../runbooks/GDPR-PHASE-7-END-TO-END-TEST.md) — test plan with these decisions baked in
- [`[System] DINOCO GDPR Data Requests`](../../%5BSystem%5D%20DINOCO%20GDPR%20Data%20Requests) V.4.6+ — implementation (will update for these decisions in Phase 7 build)
