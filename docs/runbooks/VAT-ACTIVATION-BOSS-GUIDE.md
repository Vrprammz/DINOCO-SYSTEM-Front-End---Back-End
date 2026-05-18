# VAT Activation — Boss Guide (B2C Marketplace, no-SSH path)

[← Runbooks index](../)

> **Status**: Ready · Boss approved Option A (2026-05-18) = ทำ VAT compliance ก่อนเปิด marketplace
> **Boss tax info provided**: 2026-05-18 (Tax ID 0105564033573)
> **Time to complete**: ~15 นาที (1 snippet run + verify)
> **Risk**: ต่ำ — constants definition + zero behavior change ถ้า marketplace ยังไม่เปิด

---

## Background

บอส revise VAT policy 2026-05-18:

- **B2C Marketplace (F#8 ขายต่อประกัน)** = **VAT 7%** (บริษัท พีพีที กรุ๊ป คอร์ปอเรชั่น จํากัด, Tax ID 0105564033573)
- **B2B Distributor + B2F + Manual Invoice** = **non-VAT** (บัญชีบุคคล, เดิม)

ก่อนเปิด marketplace ต้องตั้ง Tax info ใน WP constants → DINOCO snippets อ่านค่าตอน render receipt + Flex

## Step 1 — ตั้ง VAT constants ผ่าน Code Snippets (3 นาที)

WP admin → **Snippets** → Add New:

- **Title**: `🧾 DINOCO VAT Constants (B2C Marketplace)`
- **Type**: PHP Snippet
- **Run**: **Run snippet everywhere** ⚠️ (สำคัญ — ต้อง active ทุก request เพื่อ define constant)

Paste โค้ดนี้:

```php
// ════════════════════════════════════════════════════════════════
// DINOCO VAT Compliance — B2C Marketplace (F#8 Extension)
// Constants required for VAT-compliant receipt + LINE Flex push +
// monthly export for accountant. Boss provided 2026-05-18.
// ════════════════════════════════════════════════════════════════

if ( ! defined( 'WP_DINOCO_VAT_TAX_ID' ) ) {
    define( 'WP_DINOCO_VAT_TAX_ID',       '0105564033573' );
}
if ( ! defined( 'WP_DINOCO_VAT_COMPANY_NAME' ) ) {
    define( 'WP_DINOCO_VAT_COMPANY_NAME', 'บริษัท พีพีที กรุ๊ป คอร์ปอเรชั่น จํากัด' );
}
if ( ! defined( 'WP_DINOCO_VAT_COMPANY_NAME_EN' ) ) {
    define( 'WP_DINOCO_VAT_COMPANY_NAME_EN', 'PPT Group Corporation Co., Ltd.' );
}
if ( ! defined( 'WP_DINOCO_VAT_ADDRESS' ) ) {
    define( 'WP_DINOCO_VAT_ADDRESS',      '21/106 ซอยลาดพร้าว 15 แขวงจอมพล เขตจตุจักร กรุงเทพมหานคร 10900' );
}
if ( ! defined( 'WP_DINOCO_VAT_BRANCH_CODE' ) ) {
    define( 'WP_DINOCO_VAT_BRANCH_CODE',  '00000' );  // สำนักงานใหญ่
}
if ( ! defined( 'WP_DINOCO_VAT_BRANCH_NAME' ) ) {
    define( 'WP_DINOCO_VAT_BRANCH_NAME',  'สำนักงานใหญ่' );
}
if ( ! defined( 'WP_DINOCO_VAT_PHONE' ) ) {
    define( 'WP_DINOCO_VAT_PHONE',        '0616399994' );
}
if ( ! defined( 'WP_DINOCO_VAT_EMAIL' ) ) {
    define( 'WP_DINOCO_VAT_EMAIL',        'dinocothailand@gmail.com' );
}
if ( ! defined( 'WP_DINOCO_VAT_RATE' ) ) {
    define( 'WP_DINOCO_VAT_RATE',         0.07 );  // 7% Thai standard
}

// Logo (optional — สำหรับ receipt header)
if ( ! defined( 'WP_DINOCO_VAT_LOGO_URL' ) ) {
    define( 'WP_DINOCO_VAT_LOGO_URL',     home_url( '/wp-content/uploads/dinoco-logo.png' ) );
}
```

กด **Save Changes and Activate** (ไม่ใช่ Run Once — ต้อง Active ตลอด)

## Step 2 — Verify constants ตั้งสำเร็จ (1 นาที)

Snippets → Add New → ชื่อ `🔍 Verify VAT constants` → Type: PHP, Run: **Only run once**:

```php
$consts = array(
    'WP_DINOCO_VAT_TAX_ID',
    'WP_DINOCO_VAT_COMPANY_NAME',
    'WP_DINOCO_VAT_COMPANY_NAME_EN',
    'WP_DINOCO_VAT_ADDRESS',
    'WP_DINOCO_VAT_BRANCH_CODE',
    'WP_DINOCO_VAT_BRANCH_NAME',
    'WP_DINOCO_VAT_PHONE',
    'WP_DINOCO_VAT_EMAIL',
    'WP_DINOCO_VAT_RATE',
);
echo '<pre style="background:#000;color:#0f0;padding:10px;">';
foreach ( $consts as $c ) {
    $status = defined( $c ) ? '✅' : '❌';
    $val = defined( $c ) ? var_export( constant( $c ), true ) : '(not defined)';
    echo "$status $c = $val\n";
}
echo '</pre>';
```

→ Run Once → ลบ snippet

ทุก row ต้องเป็น ✅ → tax info พร้อมใช้

## Step 3 — รอ implementation ของ receipt + Flex + export (next session)

ตอนนี้ constants พร้อม แต่ feature ใช้งานจริงต้อง code เพิ่มอีก:

- ✅ VAT compute helper (มีอยู่แล้ว `[System] DINOCO SN REST API` line 9897 `dinoco_sn_marketplace_compute_quote()`)
- ⏳ Receipt template HTML + PDF (TODO — ต้อง render พร้อม Tax ID, company info)
- ⏳ LINE Flex receipt push helper (TODO — ส่ง PDF link หา customer หลัง slip verified)
- ⏳ Admin VAT export tool (TODO — CSV/PDF รายเดือนสำหรับบัญชี)
- ⏳ Order context flag (TODO — แยก B2C vs B2B ใน DB)

ผมจะ build ใน session ถัดไป — เมื่อพร้อม จะแจ้งบอสว่า "F#8 marketplace VAT พร้อมเปิดแล้ว"

## Step 4 — เปิด Marketplace flag (เมื่อ implementation ครบ)

(สำหรับอนาคต — ตอนนี้ยัง implementation ไม่ครบ ห้ามเปิดก่อน)

```php
update_option( 'dinoco_sn_marketplace_enabled', '1', false );
wp_cache_delete( 'alloptions', 'options' );
echo '✅ Marketplace ON';
```

## Rollback

ปิด snippet `🧾 DINOCO VAT Constants` → constants หาย → receipt code path graceful fallback (ใช้ placeholder text "ไม่มีข้อมูล VAT")

```php
update_option( 'dinoco_sn_marketplace_enabled', '0', false );
```

→ marketplace ปิด → ลูกค้าไม่เห็นใน LIFF

## Related files

- `docs/compliance/GDPR-PHASE-6-BOSS-DECISIONS.md` Q1 — revised retention policy
- `~/.claude/.../memory/project_vat_policy_split.md` — full policy memo
- `[System] DINOCO SN REST API` line 9897 — `dinoco_sn_marketplace_compute_quote()` VAT 7% logic

## Audit notes

V.1 (2026-05-18) — boss approved Option A "ทำ VAT compliance ทั้งหมดก่อนเปิด marketplace". Tax info provided same session. Constants snippet ready for boss to paste-run. Receipt + Flex + export = NEXT session implementation.
