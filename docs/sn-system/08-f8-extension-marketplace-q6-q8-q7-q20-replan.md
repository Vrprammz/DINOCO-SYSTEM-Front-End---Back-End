# 🎁 F#8 Extension Marketplace — Q6/Q7/Q8/Q20 Replan

**Date**: 2026-05-05
**Source**: `docs/sn-system/07-boss-decisions-log.md` Override #4 + #5 + Q7 + Q20
**Plan ref**: `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13 §F.8

ใน v2.13 เดิม F#8 ถูกวาง **Phase 5** (4wk separate decision gate). บอส override 4 ข้อ (Q6/Q7/Q8/Q20) → ย้ายเข้า **Phase 4 W12-13** + เปลี่ยน pricing model + simpler payment + no-refund.

---

## 🔄 Boss decisions (binding)

| # | Topic | v2.13 default | Boss override | Impact |
|---|---|---|---|---|
| **Q6** | Phase placement | Phase 5 (separate decision gate after stable launch) | **Phase 4 W12-13** + ทำให้ละเอียดที่สุด | -4wk timeline · merged ก่อน Phase 5 cut |
| **Q7** | Payment | LINE Pay + SCB + PromptPay multi-gateway | **เลขบัญชี + Slip2GO verify เท่านั้น** | -16h dev · ไม่ต้อง partnership LINE Pay/SCB |
| **Q8** | Pricing | % of retail (1y=10%, 2y=18%, 3y=25%) | **per-SKU manual** (admin กรอกราคาแต่ละ SKU ต่อปี) | NEW backend admin UI |
| **Q20** | Refund policy | A: 7-day refund | **B: ไม่คืน** | -4h dev · ⚠️ legal review pending |

---

## 📐 Updated F#8 Spec

### Phase 4 W12-W13 = 2 wk · ~50h (was 40h)

**Why merged ดีกว่าแยก Phase 5**:
- Boss "ทำให้ละเอียดที่สุด" → ต้องวางแผน UI/UX ทุกขั้นตอน รัดกุม
- Slip2Go verify reuse จาก B2B (existing) — ไม่มี new vendor partnership
- No payment gateway = ลด legal track ได้ทั้งหมด
- 12 features ของ v2.9 จบใน Phase 4 → cleaner cutover ก่อน Phase 5 (long-term strategic)

**Phase 4 schedule**:
- **W12** (~30h): Public API (F#15 — flag OFF Q22) + Forecast UI scaffold (F#16) + **F#8 schema + admin price UI**
- **W13** (~20h): F#8 customer LIFF flow + Slip2Go integration + admin invoice + acceptance test

---

## 💾 Schema additions

### `wp_dinoco_products` (ALTER) — per-SKU extension pricing

```sql
ALTER TABLE wp_dinoco_products
  ADD COLUMN sn_ext_price_1y DECIMAL(10,2) NULL DEFAULT NULL
    COMMENT 'Q8 manual: ราคาต่อประกัน 1 ปี (THB inc-VAT). NULL = ไม่เปิดต่อประกัน',
  ADD COLUMN sn_ext_price_2y DECIMAL(10,2) NULL DEFAULT NULL
    COMMENT 'Q8 manual: ราคาต่อประกัน 2 ปี (THB inc-VAT). NULL = ไม่เปิด 2y option',
  ADD COLUMN sn_ext_price_3y DECIMAL(10,2) NULL DEFAULT NULL
    COMMENT 'Q8 manual: ราคาต่อประกัน 3 ปี (THB inc-VAT). NULL = ไม่เปิด 3y option',
  ADD INDEX idx_sn_ext_enabled (sn_ext_price_1y);  -- query "SKUs with extension enabled"
```

**Decision rationale**:
- 3 columns (1y/2y/3y) instead of JSON or related table = simpler query + ALTER-friendly
- NULL = SKU ไม่เปิดต่อประกัน (admin opt-in per SKU)
- Inc-VAT (Q9: รวม VAT default) — ระบบ display split VAT 7% หลังจากนี้
- Idx on 1y enabled = index covers "show extension marketplace tab" filter

### `wp_dinoco_sn_warranty_extensions` (already in v2.11 schema)

ใช้ schema เดิม — เพิ่ม notes column ถ้าจำเป็น:

```sql
-- Already exists in [Admin System] DINOCO Production SN Manager schema
-- Just add Q7 simplification note in payment_method enum:
-- payment_method = 'manual' (default) | 'slip2go' (auto-verified)
-- Drop 'promptpay' / 'scb_card' / 'line_pay' enum values (Q7 override)
```

---

## 🛠 Helper stubs (Phase 1 NOW — wire callers in advance)

```php
/**
 * Get extension price for SKU + duration.
 * Returns NULL if SKU doesn't offer that extension duration.
 *
 * @param string $sku
 * @param int $years 1|2|3
 * @return float|null Price in THB inc-VAT, or null if not offered
 */
function dinoco_sn_get_extension_price( $sku, $years ) {
    if ( ! in_array( $years, array( 1, 2, 3 ), true ) ) return null;
    $col = "sn_ext_price_{$years}y";
    // Phase 4 W12: query wp_dinoco_products via DINOCO_Catalog::get_by_sku()
    // For now (Phase 1): return null = not offered yet
    if ( ! class_exists( 'DINOCO_Catalog' ) ) return null;
    $product = DINOCO_Catalog::get_by_sku( $sku );
    if ( ! $product || empty( $product->{$col} ) ) return null;
    return (float) $product->{$col};
}

/**
 * Check if any extension option is offered for SKU.
 */
function dinoco_sn_extension_available( $sku ) {
    foreach ( array( 1, 2, 3 ) as $years ) {
        if ( dinoco_sn_get_extension_price( $sku, $years ) !== null ) return true;
    }
    return false;
}
```

---

## 🎨 UX/UI (Phase 4 W12)

### Backend Admin — Product Catalog modal extension

`[Admin System] DINOCO Global Inventory Database` — Edit Product modal เพิ่ม section:

```
┌── 🛡 ต่อประกัน (Extension Pricing) ──────────────┐
│                                                   │
│  ☐ เปิดให้ลูกค้าต่อประกัน SKU นี้                  │
│                                                   │
│  ราคาต่อ 1 ปี:  [______] บาท (รวม VAT)            │
│  ราคาต่อ 2 ปี:  [______] บาท (NULL = ไม่เปิด 2y)  │
│  ราคาต่อ 3 ปี:  [______] บาท (NULL = ไม่เปิด 3y)  │
│                                                   │
│  💡 ลูกค้าจะเห็นตัวเลือกใน LIFF เฉพาะ              │
│     ราคาที่กรอก (ปล่อยว่าง = ไม่แสดง option นั้น)  │
│                                                   │
└───────────────────────────────────────────────────┘
```

**Validation**:
- ราคา >= 0 (allow ฿0 ถ้า boss อยาก promote ฟรี)
- ถ้า uncheck "เปิดให้ลูกค้าต่อประกัน" → set 3 columns = NULL
- Save handler dual-write custom table + cache invalidate

### Customer LIFF — Extension flow

```
1. ลูกค้าเปิด /warranty/extend?sn=DNCSS0001234
2. Backend: dinoco_sn_extension_available($linked_sku)?
   - false → "SKU นี้ยังไม่เปิดให้ต่อประกัน — ติดต่อร้าน"
   - true → render plan picker
3. Plan picker:
   ┌─────────────────────────────────┐
   │  ⏰ ปัจจุบัน: หมดประกัน 4 พ.ค. 2569 │
   │                                  │
   │  เลือกระยะเวลา:                  │
   │  ◉ 1 ปี  ฿1,200 (รวม VAT)        │
   │  ◯ 2 ปี  ฿2,160                  │
   │  (3 ปีไม่เปิดสำหรับ SKU นี้)       │
   │                                  │
   │  [ ดำเนินการชำระ ▶ ]              │
   └─────────────────────────────────┘
4. Payment (Q7 override — Slip2Go only):
   - แสดง QR PromptPay (ไม่ใช่ payment gateway — แค่ภาพ QR ของบัญชี)
   - หรือ เลขบัญชีธนาคาร DINOCO + ธนาคาร + ชื่อบัญชี (copy buttons)
   - ลูกค้าโอน → upload สลิป → Slip2Go verify
   - ระบบ verify ผ่าน → atomic INSERT warranty_extension + extend warranty_until
5. Success:
   - LINE Flex receipt + new warranty_until date
   - Admin Tab 11 marketplace tab เห็น row "paid" + can refund (ดู Q20 below)
```

### Q20 No-Refund policy implementation

**Boss decision**: "ไม่คืนเงิน — ลูกค้าจ่ายแล้วผูกประกันใหม่เลย"

⚠️ **Legal review pending** — ตรงข้ามกับ Consumer Protection Act §44 (default 7-day return for digital services). Risk:
- กฎหมายไทย Consumer Protection Act 2019 — บางกรณี require refund window
- PDPA + กรมการค้าภายใน — ต้องประกาศชัดในหน้า checkout
- Recommendation: ทนายตรวจ Terms & Conditions ก่อน Phase 4 W13 launch

**Implementation in code**:
- Admin Tab 11 marketplace **NO refund button** (just "void" for fraud cases)
- Customer LIFF checkout page must show explicit policy:
  ```
  ⚠️ นโยบาย "ไม่คืนเงิน" — ก่อนชำระโปรดอ่าน:
  • การชำระเงินถือว่ายอมรับเงื่อนไขทั้งหมด
  • ไม่มีระยะเวลา cooling-off
  • ไม่สามารถขอคืนเงินได้ทุกกรณี
  ☐ ฉันอ่านและยอมรับเงื่อนไข (required checkbox)
  ```
- Force checkbox before "ดำเนินการชำระ" button enabled
- Save customer's acceptance timestamp + IP in `wp_dinoco_sn_warranty_extensions.meta_json`

**Edge case allowed**: Manual void (admin only) — กรณี fraud/system error/double-charge → admin manual handle ผ่าน Tab 11 + audit row + chat with customer

---

## 📋 Files to modify (Phase 4 W12-13)

| File | Action | Effort |
|---|---|---|
| `[Admin System] DINOCO Global Inventory Database` | ALTER TABLE + Edit Product modal section | 8h |
| `[Admin System] DINOCO Production SN Manager` | NEW Tab 11 Marketplace + analytics | 14h |
| `[System] DINOCO SN REST API` | NEW `/extension/quote`, `/extension/checkout`, `/extension/upload-slip`, `/extension/admin-list`, `/extension/void` (5 endpoints) + Slip2Go integration | 16h |
| `[System] DINOCO Warranty Activation LIFF` | NEW `/warranty/extend` route + plan picker + payment + success page | 10h |
| Helper stubs (Phase 1 now) | `dinoco_sn_get_extension_price()` + `dinoco_sn_extension_available()` | 2h ✅ done |

**Total Phase 4 W12-13 = ~50h** (was 40h baseline + 10h for Q8 per-SKU UI complexity)

---

## ⚠️ Pending boss inputs (block Phase 4 W12 kickoff)

1. **Q20 legal review** — ทนายยืนยันว่า "ไม่คืนเงิน" ใน T&C ผ่าน Consumer Protection Act
2. **Per-SKU price seeds** — ตอน admin กรอกครั้งแรก: บอสมีราคาต้นแบบไหน หรือกรอกตาม SKU จริงทีหลัง? (ขัดข้องไหมถ้า launch แล้วไม่มี SKU เปิด — return "ติดต่อร้าน")
3. **Slip2Go API key** — DINOCO ใช้ key ของ B2B `B2B_SLIP2GO_SECRET_KEY` constant (existing) ใช่ไหม? ใช้บัญชีเดียวกับ B2B หรือเปิดบัญชีใหม่ DINOCO Co.?
4. **Bank account display** — เลขบัญชีอันไหน? `B2B_BANK_*` constants (existing)? หรือบัญชีใหม่สำหรับ Extension?

---

## ✅ Status

- **Now (Phase 1 W3 deployed)**: Design doc landed (this file). Helper stubs to be added in next commit.
- **Phase 4 W12 kickoff** (~Week 12 from now per plan): Schema ALTER + Edit Product UI + admin Tab 11.
- **Phase 4 W13**: LIFF customer flow + Slip2Go integration + acceptance test.
- **Phase 5 cut**: F#8 launches end of Phase 4 (no more separate Phase 5 marketplace gate per Q6 override).

---

## 🔗 Cross-references

- `docs/sn-system/07-boss-decisions-log.md` Override #4 + #5 + Q7 + Q20
- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13 §F.8 (original spec — superseded by this replan)
- v2.9 schema `wp_dinoco_sn_warranty_extensions` (already created)
- B2B Slip2Go integration (existing — `b2b_verify_slip()` helper) — reuse pattern for F#8
