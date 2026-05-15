> ⚠️ **CANCELLED 2026-05-15** by [35-boss-final-decisions-2026-05-15.md](./35-boss-final-decisions-2026-05-15.md). Boss decision: F#8 uses non-VAT บัญชีบุคคล. Plain receipt only (ใบเสร็จธรรมดา) — NO tax invoice (ใบกำกับภาษี). VAT 7% calculation REMOVED from F#8 scope.

# 29 — Tax Invoice Format VAT 7% (Warranty Extension)

**Status**: Boss directive 2026-05-09 = "ทำได้เลยไม่ต้องรอทนาย" — written by team, ready to implement. Phase 4 W12 unblocked.

**Scope**: รูปแบบใบกำกับภาษีเต็มรูป (full tax invoice) สำหรับ Warranty Extension Marketplace (F#8).

**Legal basis**: ประมวลรัษฎากร §86/4 + §86/5 + ประกาศกรมสรรพากร เรื่องกำหนดข้อความที่ต้องระบุในใบกำกับภาษี.

**Engineering target**: Phase 5 W17.1 (Snippet 10 V.31.0+ already has `b2b_send_extension_receipt()` — this doc finalizes the LAYOUT spec).

---

## 1. ข้อความบังคับ (Required by §86/4)

ใบกำกับภาษีเต็มรูปต้องระบุข้อความต่อไปนี้:

| # | ข้อความ | ตำแหน่ง | บังคับ |
|---|---|---|---|
| 1.1 | คำว่า "ใบกำกับภาษี" หรือ "Tax Invoice" | บนสุด (header band) | ✅ |
| 1.2 | ชื่อ + ที่อยู่ + เลขประจำตัวผู้เสียภาษี ของ DINOCO | header (ผู้ออก) | ✅ |
| 1.3 | ชื่อ + ที่อยู่ + เลขประจำตัวผู้เสียภาษี ของลูกค้า (ถ้ามี) | header (ผู้ซื้อ) | ✅ |
| 1.4 | เลขที่ใบกำกับภาษี | header right | ✅ |
| 1.5 | วัน/เดือน/ปี (ปี พ.ศ.) ที่ออกใบกำกับภาษี | header right | ✅ |
| 1.6 | ชื่อสินค้า/บริการ พร้อมรายละเอียด | body table | ✅ |
| 1.7 | จำนวน + ราคาต่อหน่วย | body table | ✅ |
| 1.8 | ราคาก่อน VAT (subtotal) | body footer | ✅ |
| 1.9 | จำนวน VAT 7% แยกออกมา | body footer | ✅ |
| 1.10 | ราคารวม (grand total) | body footer | ✅ |
| 1.11 | ลายเซ็นผู้ออก (digital signature image) | bottom right | ⚠️ มาตรฐานปัจจุบัน (e-Tax Invoice) |

---

## 2. ข้อมูล DINOCO (ผู้ออก)

| Field | Value | Source |
|---|---|---|
| ชื่อ | บริษัท พีพีที จำกัด | wp_option `b2b_company_name` (default constant `B2B_COMPANY_NAME`) |
| ที่อยู่ | 21/106 ลาดพร้าว 15 แขวงจอมพล เขตจตุจักร กรุงเทพมหานคร 10900 | wp_option `b2b_registered_address` |
| เลขประจำตัวผู้เสียภาษี | 0105566123456 (ตัวอย่าง 13 หลัก) | wp_option `b2b_company_tax_id` |
| สาขา | สำนักงานใหญ่ | constant |
| โทรศัพท์ | 02-XXX-XXXX | wp_option `b2b_company_phone` |
| อีเมล | invoice@dinoco.in.th | wp_option `b2b_company_email` |

> **Action item**: บอสตรวจค่าใน wp_options ข้างต้น ก่อน Phase 5 launch — ถ้าผิดต้องแก้ก่อน.

---

## 3. ข้อมูลลูกค้า (ผู้ซื้อ)

ลูกค้า B2C ทั่วไปตามกฎหมาย → **ไม่ต้องมีเลขประจำตัวผู้เสียภาษี** ก็ออกใบกำกับภาษีให้ได้ (full tax invoice เพื่อให้ลูกค้านำไปใช้ลดหย่อนภาษีได้)

| Field | Required | Source |
|---|---|---|
| ชื่อ-นามสกุล / ชื่อนิติบุคคล | ✅ | LINE display name (default) หรือกรอกใหม่ตอน checkout |
| ที่อยู่ | ✅ | wp_usermeta `dinoco_address` (จาก Member Profile) — หากไม่มี ให้ลูกค้ากรอกตอน checkout |
| เลขประจำตัวผู้เสียภาษี (TIN) | ⚠️ ทางเลือก | กรอกตอน checkout ถ้าต้องการ (ลูกค้านิติบุคคลมักต้อง) |
| สาขา (กรณีนิติบุคคล) | ⚠️ ทางเลือก | กรอกตอน checkout |
| อีเมล (ส่ง e-Tax Invoice) | ⚠️ แนะนำ | wp_usermeta `dinoco_email` |

**UX**: ใน LIFF checkout flow → เพิ่ม section "ข้อมูลใบกำกับภาษี (ทางเลือก)" — collapsible. ลูกค้าทั่วไปที่ไม่ต้องการ TIN ก็ skip ได้.

---

## 4. รายละเอียดสินค้า/บริการ (Body table)

### 4.1 รูปแบบบรรทัดสินค้า

```
+------+----------------------------------+----------+----------+----------+
| ลำดับ | รายการ                          | จำนวน    | ราคา/หน่วย | รวม      |
+------+----------------------------------+----------+----------+----------+
|  1   | บริการต่อประกัน 1 ปี              |   1      |   934.58  |   934.58 |
|      | สินค้า: ชุดกันล้ม Honda XL750 PRO |          |          |          |
|      | S/N: DNCSS0001234                |          |          |          |
|      | ครอบคลุม: 2026-06-01 → 2027-06-01 |          |          |          |
+------+----------------------------------+----------+----------+----------+
```

**คำอธิบายบริการ** (`product_description`):
> บริการต่อประกัน [N] ปี สำหรับสินค้า [TopSet name] ของ DINOCO โดยขยายเวลาประกันจาก [old_warranty_until] ไปจนถึง [new_warranty_until] รวมถึงสิทธิ์เคลมตามเงื่อนไขประกันมาตรฐาน DINOCO

---

## 5. Footer คำนวณ VAT (REQUIRED — §86/4)

VAT 7% **ต้อง** แยกออกจาก subtotal ชัดเจน — ไม่รวมในราคาเดียว.

### 5.1 สูตรคำนวณ (price_paid = VAT-inclusive)

ระบบตอนนี้เก็บ `price_paid` เป็น VAT-inclusive (ลูกค้าจ่ายตามราคารวม). ใบกำกับภาษีต้อง **คำนวณย้อนกลับ**:

```
subtotal = round(price_paid / 1.07, 2)
vat      = price_paid - subtotal
total    = price_paid
```

**ตัวอย่าง**:
- price_paid (ที่ลูกค้าจ่าย) = ฿1,000.00
- subtotal = round(1000 / 1.07, 2) = ฿934.58
- vat = 1000.00 - 934.58 = ฿65.42

### 5.2 รูปแบบ Footer

```
                                    ราคาก่อนภาษี (Subtotal)        ฿934.58
                                    ภาษีมูลค่าเพิ่ม 7% (VAT 7%)        ฿65.42
                                    ─────────────────────────────────────
                                    รวมเงินทั้งสิ้น (Grand Total)     ฿1,000.00
                                    
                                    (หนึ่งพันบาทถ้วน)              ← จำนวนเงินตัวอักษร
```

> **Note**: ถ้า `price_paid` มีทศนิยม 2 ตำแหน่ง คำนวณ subtotal ปัด 2 ตำแหน่ง vat = remainder (เพื่อ subtotal + vat = price_paid เป๊ะ ๆ ไม่มี rounding error 0.01).

---

## 6. หมายเลขใบกำกับภาษี (Invoice Number)

**Format**: `WX-YYYYMM-NNNNN`
- WX = Warranty Extension prefix
- YYYYMM = ปี/เดือน (พ.ศ. ก็ได้แต่แนะนำ ค.ศ. เพื่อ globally readable)
- NNNNN = sequence ภายในเดือน reset 1 ทุกเดือน

**ตัวอย่าง**: `WX-202608-00001` = ใบกำกับภาษีเดือน ส.ค. 2026 ใบที่ 1

**Source**: AUTO_INCREMENT column ใน `wp_dinoco_sn_warranty_extensions.invoice_number` (สร้างตอน checkout success).

---

## 7. ลายเซ็นดิจิทัล (Digital signature)

ตามมาตรฐานปัจจุบัน e-Tax Invoice ของกรมสรรพากร ภาพลายเซ็น + ตราประทับยังเป็น "soft requirement" — ไม่ต้อง crypto-signed (e-Tax Invoice & e-Receipt projectแยก).

**Implementation**:
- ภาพลายเซ็น: `/wp-content/uploads/dinoco-signature.png` (boss provides)
- ตราประทับ: `/wp-content/uploads/dinoco-stamp.png` (boss provides)
- Both rendered ที่ bottom-right ของหน้าใบกำกับภาษี (ดู Snippet 10 V.31.0)

> **Future enhancement (Phase 6)**: integrate กับระบบ e-Tax Invoice ของกรมสรรพากร (XML signing) ถ้ายอดขาย > ฿1,800,000/ปี (กฎ VAT registration mandatory).

---

## 8. ตัวอย่าง Layout (PNG render)

```
┌──────────────────────────────────────────────────────────────┐
│ [DINOCO LOGO]               ใบกำกับภาษี / Tax Invoice         │
│                                                              │
│ บริษัท พีพีที จำกัด          เลขที่: WX-202608-00001          │
│ 21/106 ลาดพร้าว 15           วันที่: 4 มิ.ย. 2026             │
│ จอมพล จตุจักร                สาขา: สำนักงานใหญ่               │
│ กรุงเทพฯ 10900                                                │
│ TIN: 0105566123456                                           │
│ โทร: 02-XXX-XXXX                                             │
├──────────────────────────────────────────────────────────────┤
│ ผู้ซื้อ:                                                       │
│ ชื่อ: คุณสมชาย ใจดี                                            │
│ ที่อยู่: 99/123 หมู่บ้านสุขสันต์ ลาดพร้าว                        │
│         แขวงพลับพลา เขตวังทองหลาง กรุงเทพฯ 10310               │
│ TIN: (ไม่มี)                                                  │
├──────────────────────────────────────────────────────────────┤
│ ลำดับ  รายการ                              จำนวน  ราคา   รวม │
│  1    บริการต่อประกัน 1 ปี                  1   934.58 934.58│
│       สินค้า: ชุดกันล้ม Honda XL750 PRO                        │
│       S/N: DNCSS0001234                                       │
│       ครอบคลุม: 2026-06-01 → 2027-06-01                       │
├──────────────────────────────────────────────────────────────┤
│                              ราคาก่อนภาษี           ฿  934.58 │
│                              ภาษีมูลค่าเพิ่ม 7%      ฿   65.42 │
│                              ──────────────────────────────── │
│                              รวมเงินทั้งสิ้น        ฿1,000.00 │
│                              (หนึ่งพันบาทถ้วน)                  │
├──────────────────────────────────────────────────────────────┤
│                                          [ลายเซ็น + ตรา]      │
│                                          ผู้ออกใบกำกับภาษี     │
└──────────────────────────────────────────────────────────────┘
```

---

## 9. การส่งให้ลูกค้า

| ช่องทาง | การส่ง | Format |
|---|---|---|
| LINE | ส่งภาพ PNG ทันทีหลังจ่ายสำเร็จ + ลิงก์ดาวน์โหลด PDF | Flex Message + image |
| Email (ถ้ามี) | ส่ง PDF + พร้อม subject "[DINOCO] ใบกำกับภาษีเลขที่ WX-..." | PDF attachment |
| Member Dashboard | แสดงในหน้า "My Receipts" + reprint button | PDF on-demand |

---

## 10. การเก็บรักษา + การส่งสรรพากร

ตามประมวลรัษฎากร DINOCO ต้อง:
1. เก็บสำเนาใบกำกับภาษีไว้ ≥ 5 ปี (ในระบบ — `wp_dinoco_sn_warranty_extensions` row immutable)
2. ส่งรายงานภาษีรายเดือน (ภ.พ.30) — ใช้ aggregate query บน DB
3. Future: integrate e-Tax Invoice & e-Receipt ของกรมสรรพากร (Phase 6+)

---

## 11. Implementation status

| Component | Snippet | Status |
|---|---|---|
| `b2b_send_extension_receipt($extension_id, $line_uid)` | Snippet 10 V.31.0 | ✅ มี |
| VAT 7% backward calculation | Snippet 10 V.31.0 | ✅ มี |
| Logo white on navy header | Snippet 10 V.31.1 | ✅ ทำวันนี้ (2026-05-09) |
| Sequential invoice number | Snippet 10 V.31.0 | ✅ มี |
| Customer TIN field in checkout LIFF | Phase 4 W12 | ⏳ รอ Phase 4 |
| LINE Flex template | Snippet 10 V.31.0 | ✅ มี |
| PDF generation | Phase 5 W17.1 | ⏳ รอ Phase 5 |

---

_Drafted by team per boss directive 2026-05-09. Last updated: 2026-05-09._
_Recommend tax accountant review before live VAT submission. Engineering can build to this spec NOW._