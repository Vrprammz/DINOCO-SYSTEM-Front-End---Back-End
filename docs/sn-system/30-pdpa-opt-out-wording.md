# 30 — PDPA Opt-Out Wording (Customer-facing)

**Status**: Boss directive 2026-05-09 = "ทำต่อไปไม่ต้องใคร" — drafted by team without lawyer review. Ready for implementation.

**Scope**: ข้อความที่แสดงให้ลูกค้าตอนเก็บ consent + ตอน opt-out + ตอน export/erase data. Used by:
- Warranty Activation LIFF (`/warranty/activate`)
- Member Dashboard "Privacy Settings" tab
- GDPR/PDPA REST endpoints (`/dinoco-gdpr/v1/*`)

**Legal basis**: PDPA §19 (consent), §30 (right to access), §31 (right to rectification), §33 (right to erasure), §39 (record keeping).

**Bundling note**: Boss said "no lawyer needed" but I'd still recommend bundling with F#8 legal review when Phase 4 W12 starts (saves cost). For now this draft is sufficient to unblock engineering.

---

## 1. Consent Wording (ตอน customer activate warranty)

### 1.1 Display location
Activation LIFF page → กล่องข้อความก่อนปุ่ม "ลงทะเบียน" (last step, after form filled).

### 1.2 Verbatim text

```
─────────────────────────────────────────────────────
🔒 ความเป็นส่วนตัวของคุณ

DINOCO เก็บข้อมูลส่วนบุคคลของคุณ (ชื่อ, เบอร์โทร, LINE ID,
ที่อยู่จัดส่ง) เพื่อใช้ในกระบวนการรับประกันและบริการเท่านั้น

✓ เราจะไม่ส่งต่อข้อมูลให้บุคคลที่สาม
✓ คุณสามารถขอดู/แก้ไข/ลบข้อมูลได้ตลอดเวลา
✓ ข้อมูลภาษี (ใบกำกับภาษี) เก็บ 5 ปีตามกฎหมาย

[ ] ฉันยินยอมให้ DINOCO เก็บข้อมูลตามนโยบายความเป็นส่วนตัว
[ ] ฉันยินยอมรับข่าวสาร/โปรโมชันผ่าน LINE (ทางเลือก)

อ่านนโยบายเต็ม: dinoco.in.th/privacy
─────────────────────────────────────────────────────
```

### 1.3 Validation

- Checkbox 1 (PDPA consent) **required** — ปุ่ม "ลงทะเบียน" disabled จนกว่าจะติ๊ก
- Checkbox 2 (marketing consent) **optional** — เก็บแยกใน wp_usermeta `dinoco_consent_marketing`
- บันทึก timestamp + IP + user_agent ใน `wp_dinoco_pdpa_consent_log` (immutable)

---

## 2. Marketing Opt-Out Wording

### 2.1 Where shown
Member Dashboard → Privacy Settings tab → toggle switches.

### 2.2 Verbatim text

```
─────────────────────────────────────────────────────
📬 การติดต่อจาก DINOCO

[ ON ] รับข่าวสารและโปรโมชันสำหรับสินค้าใหม่
       (ส่งผ่าน LINE Push — ปิดได้ตลอดเวลา)

[ ON ] รับการแจ้งเตือนประกันใกล้หมด (30/7/1 วัน)
       (ทางเลือกแนะนำ — ช่วยให้คุณไม่พลาดสิทธิ์)

[ ON ] รับการเชิญให้รีวิวสินค้าหลังใช้งาน 30 วัน
       (ทางเลือก)

[ OFF ] ไม่รับ ข้อความใด ๆ จาก DINOCO ยกเว้นเรื่องเร่งด่วน
        (เช่น recall, ปัญหาด้านความปลอดภัย — บังคับตามกฎหมาย)

ปิดทุก toggle = nuclear opt-out (ยังได้รับข้อความเฉพาะที่บังคับ
ตามกฎหมายเท่านั้น เช่น recall + transactional confirmations)
─────────────────────────────────────────────────────
```

### 2.3 Toggle keys (engineering reference)

| Toggle | wp_usermeta key | Default |
|---|---|---|
| Marketing news | `dinoco_consent_marketing` | OFF (opt-in only) |
| Expiry reminders | `dinoco_consent_expiry` | ON (opt-out) |
| Review requests | `dinoco_consent_review` | ON (opt-out) |
| Nuclear opt-out | `dinoco_consent_nuclear` | OFF |

**Code reference**: ตรวจ toggle ใน `dinoco_line_can_push_to_user($uid, $category)` (Push Governance V.1.6) ก่อน push.

---

## 3. Right to Access (Export Data) Wording

### 3.1 Where shown
Member Dashboard → Privacy Settings tab → ปุ่ม "ดาวน์โหลดข้อมูลของฉัน".

### 3.2 Verbatim text

```
─────────────────────────────────────────────────────
📥 ขอดูข้อมูลของคุณ

ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA) คุณมีสิทธิ์
ขอดูข้อมูลทั้งหมดที่ DINOCO เก็บเกี่ยวกับคุณ

ข้อมูลที่จะส่งให้:
  • ข้อมูลบัญชีผู้ใช้ (ชื่อ, เบอร์, ที่อยู่)
  • ประวัติการลงทะเบียนรับประกัน
  • ประวัติการเคลม
  • ประวัติการสนทนาผ่าน LINE
  • ประวัติคำสั่งซื้อ + ใบกำกับภาษี

ระบบจะเตรียมไฟล์ ZIP ภายใน 24-72 ชั่วโมง และส่งลิงก์ดาวน์โหลด
เข้าทาง LINE/Email ที่ลงทะเบียนไว้ ลิงก์มีอายุ 7 วัน

[ ขอดาวน์โหลดข้อมูล ]

หมายเหตุ: ขอได้ฟรี 1 ครั้งต่อ 6 เดือน หากเกินจำนวนอาจมี
ค่าธรรมเนียม ฿100 ต่อครั้ง (ตาม PDPA §31)
─────────────────────────────────────────────────────
```

---

## 4. Right to Erasure (Delete Account) Wording

### 4.1 Where shown
Member Dashboard → Privacy Settings tab → ส่วนล่างสุด (red destructive section).

### 4.2 Verbatim text

```
─────────────────────────────────────────────────────
⚠️ ลบบัญชีของคุณ

หากคุณต้องการให้ DINOCO ลบข้อมูลทั้งหมดของคุณ:

⚠️ สิ่งที่จะถูกลบ:
  • ข้อมูลส่วนตัว (ชื่อ, เบอร์, ที่อยู่)
  • ประวัติการสนทนาผ่าน LINE/Facebook
  • Member account + login

⚠️ สิ่งที่ DINOCO ต้องเก็บไว้ (กฎหมายบังคับ):
  • ใบกำกับภาษี — เก็บ 5 ปี (ประมวลรัษฎากร §87/3)
  • ประวัติการเคลม — เก็บ 3 ปี (กรณีคดีพิพาท)
  ข้อมูลเหล่านี้จะถูก anonymize (เปลี่ยนชื่อเป็น "Customer #N"
  + ลบเบอร์โทร) แต่ไม่สามารถลบทั้งหมดได้

ผลกระทบ:
  ✗ คุณจะไม่สามารถเคลมประกันที่เหลือได้อีก
  ✗ คุณจะไม่สามารถรับ extension warranty ที่ซื้อแล้วได้
  ✗ การโอนสิทธิ์ประกันให้ผู้อื่นจะถูกยกเลิก

[ ขอลบบัญชี (ต้องยืนยันอีกครั้ง) ]

หมายเหตุ: คำขอจะถูก review โดยทีมงาน + อาจติดต่อยืนยันตัวตน
ก่อนดำเนินการ ภายใน 30 วันตาม PDPA §30
─────────────────────────────────────────────────────
```

### 4.3 Confirmation modal (after click "ขอลบบัญชี")

```
🚨 ยืนยันการลบบัญชี

โปรดพิมพ์ "ลบบัญชี" เพื่อยืนยัน:
[________________________]

[ ยกเลิก ]   [ ส่งคำขอลบบัญชี (irreversible) ]
```

### 4.4 Engineering keys

| Field | Type | Behavior |
|---|---|---|
| `wp_users.display_name` | anonymize | "Customer #" + user_id |
| `wp_usermeta.dinoco_phone` | hard delete | NULL |
| `wp_usermeta.dinoco_address` | hard delete | NULL |
| `wp_usermeta.line_uid` | hard delete | NULL |
| `wp_dinoco_sn_pool.registered_user_id` | preserve + flag | row stays for tax/warranty audit |
| `wp_dinoco_sn_warranty_extensions.invoice_*` | preserve | required by tax law 5y |
| `wp_dinoco_claim_*` | preserve + anonymize customer info | required for dispute resolution 3y |
| LINE conversation log (MongoDB) | hard delete via OpenClaw `/api/gdpr/line-messages?delete=1` | per PDPA §33 |

---

## 5. Quiet Hours / Per-User Override

### 5.1 Where shown
Member Dashboard → Privacy Settings tab → "เวลาที่ไม่อยากรับ message".

### 5.2 Verbatim text

```
─────────────────────────────────────────────────────
🌙 ช่วงเวลาที่ไม่อยากรับข้อความ

ระบบจะไม่ส่ง LINE ในช่วงเวลานี้ของวัน:

ตั้งแต่: [21]:[00] นาฬิกา
ถึง:     [08]:[00] นาฬิกา (วันถัดไป)

* ค่าเริ่มต้นของระบบ: 21:00 → 08:00
* ข้อความเร่งด่วน (recall, ปัญหาความปลอดภัย) จะส่งทุกเวลา

[ บันทึก ]
─────────────────────────────────────────────────────
```

### 5.3 Engineering reference

- Save → wp_usermeta `dinoco_sn_quiet_hours_start` + `_end` (HH:MM format)
- Read by `dinoco_line_in_quiet_hours()` ใน Push Gov V.1.5+

---

## 6. Cookie Banner (สำหรับ public site)

### 6.1 Where shown
Bottom-fixed banner ทุกหน้าของ `dinoco.in.th` (ปกติ + LIFF) จนกว่าจะกด accept/decline.

### 6.2 Verbatim text

```
─────────────────────────────────────────────────────
🍪 เว็บไซต์นี้ใช้คุกกี้

DINOCO ใช้คุกกี้เพื่อ:
  • จำสถานะการล็อกอินของคุณ
  • วิเคราะห์การใช้งานเพื่อปรับปรุงเว็บ
  • ส่งโฆษณาที่ตรงกับความสนใจ (ทางเลือก)

[ ยอมรับทั้งหมด ]   [ ปรับแต่ง ]   [ ปฏิเสธทางเลือก ]

นโยบาย: dinoco.in.th/privacy
─────────────────────────────────────────────────────
```

### 6.3 Cookie categories

| Category | Default | wp_option key |
|---|---|---|
| Strictly necessary (login session) | ON (mandatory) | n/a |
| Functional (LIFF, language pref) | ON | `dinoco_cookie_functional` |
| Analytics (anonymous traffic) | OFF | `dinoco_cookie_analytics` |
| Marketing (FB pixel, retargeting) | OFF | `dinoco_cookie_marketing` |

---

## 7. Implementation status

| Item | Snippet/file | Status |
|---|---|---|
| Consent wording (Section 1) | Activation LIFF V.0.10+ | ⏳ ต้องแก้เพิ่ม checkbox + log |
| Marketing opt-out (Section 2) | Member Dashboard V.31.x + Push Gov V.1.6 | ⏳ ต้องสร้าง Privacy Settings tab |
| Export data (Section 3) | GDPR Snippet V.4.0 | ✅ endpoint พร้อม + ปิด flag |
| Erasure (Section 4) | GDPR Snippet V.4.0 + admin review tab | ✅ endpoint + preserve logic พร้อม |
| Quiet hours UI (Section 5) | Member Dashboard | ⏳ ต้องสร้าง UI |
| Cookie banner (Section 6) | Theme footer | ⏳ ต้องเพิ่ม |

---

## 8. Future enhancements

- ทนายตรวจ wording ก่อนเปิด GDPR endpoints (`dinoco_gdpr_enabled=1`) — ตอนนี้ default OFF + return 503
- Bundle review กับ F#8 legal (Phase 4 W12) — ประหยัดค่าใช้จ่าย
- Multi-language support (English version สำหรับลูกค้าต่างชาติ) — Phase 6+

---

_Drafted by team per boss directive 2026-05-09. Last updated: 2026-05-09._
_Recommend lawyer review before flag flip — currently NOT blocking engineering build._
