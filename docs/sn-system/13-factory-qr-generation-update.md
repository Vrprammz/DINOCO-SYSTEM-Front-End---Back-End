# 🏭 Factory QR Generation Update — โรงงานจีนเป็นคน Gen QR

**Date**: 2026-05-07
**Source**: Boss chat กับ Huali Label (โรงงานเพลทจีน)
**Boss decision**: "QRCODE ที่ผลิตออกจากระบบไม่ต้อง Gen นะ เอาแค่ชุดตัวเลขให้ก็พอ"

---

## 📋 ข้อมูลจากโรงงาน (Huali Label)

> "If the QR code is showed numbers, then just need you provide the text, then the QR code will be generated according to numbers"

**แปล**: ถ้า QR แสดงเลข (text-based QR) — DINOCO แค่ส่ง CSV ตัวเลขมาให้ โรงงาน gen QR เอง

**ตัวอย่างที่โรงงานส่งมา**: เพลท DINOCO + warranty plate + serial `DNC2405001` + QR (ที่ encode คำนั้น)

---

## ✅ ผลกระทบกับ plan v2.13

### ที่ต้องตัดออก (ไม่ต้องทำแล้ว)

| ของเดิม | สถานะ |
|---|---|
| QR PDF generation chunked 5000/file | ❌ ตัด — โรงงานทำเอง |
| GD Library QR rendering | ❌ ตัด |
| `dinoco_sn_qr_render_chunk()` helper | ❌ ตัด |
| REST `/batches/{id}/qr-pdf?chunk=N` endpoint | ❌ ตัด |
| Tab 1 Batches "QR PDF" download button | ❌ ตัด |

**เวลาที่ประหยัด**: ~12-16h dev (Phase 1 W2 originally allocated for QR PDF)

### ที่เหลือ (ส่งโรงงาน)

✅ **CSV download** — column = `serial_number` text only
- Format: 1 row per S/N, simple list
- Header: `S/N`
- Body: `DNCSS0001234`, `DNCSS0001235`, ...

โรงงาน Huali parse CSV → gen QR text-based ทุกใบ → พิมพ์เพลท + QR

---

## ❓ คำถามใหม่ที่ต้องบอสตอบ — QR Content Format

**โรงงานจะ gen QR จาก text ที่เราให้** — text ต้องเป็นอะไร?

### Option A: S/N text เดี่ยวๆ
```
DNCSS0001234
```
- 👍 สั้น + กระชับ
- 👎 มือถือ scan QR → ได้ text "DNCSS0001234" → ต้องเปิด LINE หา OA + พิมพ์ check
- 👎 ลูกค้า scan ด้วย iPhone Camera → ไม่เปิด activate page อัตโนมัติ

### Option B: URL เต็ม (recommended)
```
https://dinoco.in.th/warranty/activate?sn=DNCSS0001234
```
- 👍 มือถือ scan QR ด้วย iPhone Camera / Android Camera ตรงๆ → เปิด link activate ทันที
- 👍 LINE bot scan QR ใน LIFF → เปิด activate page
- 👍 ใช้ฟีเจอร์ web auth (LINE OAuth) ได้เลย
- 👎 URL ยาว → QR หนาแน่นกว่า

### Option C: URL สั้น  
```
https://dinoco.in.th/sn/DNCSS0001234
```
- 👍 สั้นกว่า B + ทำงานเหมือน B
- 👎 ต้องตั้ง URL rewrite redirect → /warranty/activate?sn=...

---

## 💡 คำแนะนำ

**ผมแนะนำ Option B** (URL เต็ม):
- ลูกค้า scan ด้วยกล้องมือถือใดก็ได้ → activate ได้ทันที (UX ดีที่สุด)
- ไม่ต้องตั้ง URL rewrite (ลด config server)
- QR หนาแน่นนิดหน่อยแต่ภาพยังคมชัด (50×30mm plate รับได้)
- ตรงกับ Q6 ใน plan v2.13 §11 (Open Questions) ที่ตอบไว้

---

## 🎯 ตัวอย่าง CSV ที่ส่งโรงงาน

ถ้าบอสตอบ Option B:

```csv
S/N,QR Content
DNCSS0001234,https://dinoco.in.th/warranty/activate?sn=DNCSS0001234
DNCSS0001235,https://dinoco.in.th/warranty/activate?sn=DNCSS0001235
DNCSS0001236,https://dinoco.in.th/warranty/activate?sn=DNCSS0001236
...
```

หรือถ้าโรงงานต้องการ column เดียว — ส่งแค่ QR Content column

---

## 🛠 Code changes ที่ต้องทำ (รอ background agents เสร็จ)

ตอนนี้ background agents 2 ตัวกำลังทำ Phase 2 W5 — รอเสร็จแล้วผม integrate + ลบ QR PDF generation ออกจาก:

1. `[Admin System] DINOCO Production SN Manager` (Tab 1 Batches section)
   - ลบปุ่ม "📄 QR PDF" 
   - ลบ `dinoco_sn_qr_render_chunk()` function (ถ้ามี)
2. `[System] DINOCO SN REST API`
   - ลบ endpoint `/batches/{id}/qr-pdf`
   - แก้ CSV endpoint เพิ่ม "QR Content" column ตาม boss option
3. `tests/jest/sn-system-drift.test.js`
   - ลบ assertion เกี่ยวกับ QR PDF
   - เพิ่ม assertion CSV column "QR Content" ตรงตาม format
4. CLAUDE.md SN section — update scope

---

## 📊 Status

- ⏸️ **Pending boss decision**: QR Content format (A / B / C — ผมแนะนำ B)
- ⏸️ **Pending background agents complete** — Phase 2 W5 work in progress
- 🔄 **Once both above resolve**: ผม commit ทั้ง batch (W5 + QR removal) ครั้งเดียว

---

## 🔗 Cross-references

- `docs/sn-system/07-boss-decisions-log.md` — Q1 S/N format = `DNCSS0000001`
- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13 §11 Q6 (QR content)
- Original screenshot from Huali Label (LINE chat 2026-05-07 15:38)
