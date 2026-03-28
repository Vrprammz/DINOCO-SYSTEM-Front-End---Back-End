# DINOCO UX/UI Fix Plan — 24 Issues

> จาก UX/UI Expert Deep Review | 2026-03-28
> จัดลำดับ Must Have → Should Have → Nice to Have

---

## Phase 1: Must Have (6 ข้อ) — กระทบ user โดยตรง

### P19. ลบ Tailwind CDN จาก Transfer Page
- **ไฟล์**: `[System] Transfer Warranty Page` บรรทัด 702
- **ปัญหา**: โหลด `cdn.tailwindcss.com` (runtime compiler 300KB+) ทำให้หน้าช้ามาก
- **แนวทาง**:
  1. Grep หา Tailwind utility classes ที่ใช้จริง (`bg-green-500`, `animate-pulse`, `rounded-xl` ฯลฯ)
  2. เขียน CSS classes ทดแทน (ประมาณ 20-30 class)
  3. ลบ `<script src="https://cdn.tailwindcss.com"></script>` ออก
- **ผล**: ประหยัด 300KB+ bandwidth, หน้าโหลดเร็วขึ้น 2-3 วินาที

### P12. แทนที่ native alert/confirm ด้วย Custom Modal
- **ไฟล์**: Claim System, Edit Profile, Transfer, Dashboard Main
- **ปัญหา**: `alert()` / `confirm()` ไม่สวย + บาง LINE browser block
- **แนวทาง**:
  1. สร้าง `dinoco_toast(msg, type)` + `dinoco_confirm(msg, onYes)` ใน Global App Menu
  2. ใช้ pattern `.dinoco-modal-backdrop` ที่มีอยู่แล้วใน Header & Forms
  3. Replace ทุก `alert()` → `dinoco_toast()`, ทุก `confirm()` → `dinoco_confirm()`
- **จุดที่ต้องแก้**: Claim ~3 จุด, Edit Profile 1 จุด, Dashboard Main ~5 จุด

### P11. เพิ่ม Empty State เมื่อไม่มีสินค้า
- **ไฟล์**: `[System] Dashboard - Assets List`, `[System] Transfer Warranty Page`
- **ปัญหา**: ไม่มีสินค้า = หน้าว่างเปล่า ไม่มีคำแนะนำ
- **แนวทาง**:
  1. Assets List: เพิ่ม `<?php if (empty($all_assets)):?>` block พร้อม icon + "ยังไม่มีสินค้าลงทะเบียน" + ปุ่ม "สแกน QR"
  2. Transfer: เพิ่มเหมือนกันเมื่อไม่มีสินค้าให้โอน
- **Design**: ใช้ pattern เดียวกับ Claim empty state ที่แก้ไปแล้ว

### P05. PDPA ปุ่มยืนยัน Disabled จนกว่าเลือกครบ
- **ไฟล์**: `[System] Dashboard - Header & Forms` (PDPA section), `[System] Member Dashboard Main`
- **ปัญหา**: ปุ่มกดได้ตลอด → submit → error → user งง
- **แนวทาง**:
  1. ตั้ง initial state: `opacity:0.5; pointer-events:none;` เหมือน Claim step 1
  2. เพิ่ม JS listener บน radio buttons: เมื่อเลือกครบ 2 กลุ่ม → enable ปุ่ม
  3. ลบ server-side error handling เดิม (ไม่ต้องแล้ว เพราะ client validate ก่อน)

### P21. Edit Profile เพิ่ม Loading State ตอนบันทึก
- **ไฟล์**: `[System] DINOCO Edit Profile` บรรทัด 337
- **ปัญหา**: กดบันทึก → ไม่มี feedback → user กดซ้ำ
- **แนวทาง**:
  1. เพิ่ม `onsubmit` handler: disable ปุ่ม + เปลี่ยนข้อความเป็น "กำลังบันทึก..."
  2. แสดง Global Loader (dinoco-loader) ที่มีอยู่แล้ว
  ```javascript
  form.onsubmit = function() {
      var btn = this.querySelector('.d-btn-save');
      btn.disabled = true;
      btn.textContent = 'กำลังบันทึก...';
      document.getElementById('dinoco-loader').style.display = 'flex';
  };
  ```

### P24. B2B LIFF Init เพิ่ม Timeout + Retry
- **ไฟล์**: `[B2B] Snippet 4: LIFF E-Catalog Frontend` บรรทัด 244-248
- **ปัญหา**: LIFF init ค้าง = loading ไม่รู้จบ
- **แนวทาง**:
  1. เพิ่ม `setTimeout` 15 วินาทีหลัง page load
  2. ถ้ายังไม่ authenticated → แสดง error + ปุ่ม "ลองใหม่" (reload page)
  ```javascript
  setTimeout(function() {
      if (!state.dist) {
          showAuthError('โหลดนานเกินไป', 'กรุณาปิดแล้วเปิดลิงก์ใหม่', true);
      }
  }, 15000);
  ```

---

## Phase 2: Should Have (7 ข้อ) — consistency

### P09. Standardize Button Component
- **ไฟล์**: ทุกไฟล์ที่มีปุ่ม
- **แนวทาง**: เพิ่ม CSS ใน Global App Menu:
  ```css
  .dnc-btn { min-height: 48px; border-radius: 12px; font-weight: 600; transition: all 0.2s; }
  .dnc-btn:active { transform: scale(0.97); }
  .dnc-btn-primary { background: var(--dnc-primary); color: #fff; }
  .dnc-btn-secondary { background: #f1f5f9; color: #374151; }
  .dnc-btn-danger { background: #dc2626; color: #fff; }
  ```
- ค่อยๆ migrate ทีละหน้า (ไม่ต้องแก้ทีเดียว)

### P13. เพิ่ม Tap Target ≥ 44px
- **จุดที่ต้องแก้**:
  - Nav label: `font-size: 9px` → `10px`
  - Filter chips: `min-height: 36px` → `44px`
  - History buttons: เพิ่ม `padding: 10px 16px`
  - Dealer cards (Claim): `font-size: 9px` → `11px`

### P17+P18. โหลด FontAwesome + Google Fonts ครั้งเดียว
- **แนวทาง**:
  1. เก็บ FontAwesome + Google Fonts ไว้ใน Global App Menu เท่านั้น (inject ทุกหน้า)
  2. ลบ `<link>` ซ้ำจาก Header & Forms, Claim System, Transfer Page, B2B Catalog
  3. ใช้ FontAwesome เวอร์ชันเดียว (6.5.x)

### P16. สร้าง Global Toast Component
- **แนวทาง**: เพิ่มใน Global App Menu
  ```javascript
  function dinoco_toast(msg, type='info', duration=3000) {
      // type: 'success' | 'error' | 'warning' | 'info'
      // สร้าง div fixed bottom, slide up, auto-dismiss
  }
  ```
- ใช้แทน native alert + custom error divs ที่กระจายทั่ว

### P02. รวม QR Scanner CSS เป็นจุดเดียว
- **แนวทาง**:
  1. ลบ QR CSS จาก Header & Forms (บรรทัด 864-996)
  2. เก็บไว้ใน Global App Menu เท่านั้น (บรรทัด 321-491)
  3. ใช้สี gold corners (`#c0a062`) เป็น standard

### P14. เพิ่ม Safe Area ทุกหน้า
- **แนวทาง**: เพิ่มใน Global App Menu (inject ทุกหน้า):
  ```css
  .dinoco-page-content {
      padding-top: max(20px, env(safe-area-inset-top));
      padding-bottom: calc(80px + env(safe-area-inset-bottom));
  }
  ```

### P06. เพิ่ม Step Progress ใน Onboarding
- **แนวทาง**: เพิ่ม HTML ด้านบน PDPA/Profile/Moto forms:
  ```html
  <div class="dnc-steps">
      <div class="dnc-step active">1. ความยินยอม</div>
      <div class="dnc-step">2. ข้อมูลส่วนตัว</div>
      <div class="dnc-step">3. ข้อมูลรถ</div>
  </div>
  ```

---

## Phase 3: Nice to Have (11 ข้อ) — polish

| # | ปัญหา | แนวทาง | ไฟล์ |
|---|-------|--------|------|
| P01 | CSS ซ้ำ Gateway/Callback | ย้าย shared CSS เป็น snippet แยก | Gateway, Callback |
| P07 | Loading overlay สีต่าง (white vs dark) | ใช้ dark ทุกที่ | Claim System |
| P08 | B2B ไม่มี gold accent | เพิ่ม `#c0a062` ใน rank badge/header | B2B Snippet 4 |
| P03 | Welcome popup ภาษาผสม | "Registration Complete!" → "ลงทะเบียนสำเร็จ!" | LINE Callback |
| P04 | Welcome popup ไม่มี backdrop close | เพิ่ม onclick + auto-dismiss 5s | LINE Callback |
| P22 | Placeholder avatar ใช้ external service | เปลี่ยนเป็น DINOCO logo URL | Edit Profile |
| P23 | Status color map ต่าง B2B Catalog vs Customer LIFF | สร้าง shared color config | Snippet 1, 4, 11 |
| P10 | Input border-radius ต่างกัน (8px vs 12px) | ใช้ 12px ทั้งระบบ | ทุกไฟล์ |
| P15 | Bottom nav padding ไม่พอบน iPhone | เพิ่ม safe-area calc | App Menu |
| P20 | html2canvas โหลดทุกครั้ง | Lazy load เมื่อกดปุ่ม | Transfer |
| P19+ | Design Token System | สร้าง `:root` CSS variables ใน App Menu | App Menu |

---

## แนวทาง Design Token (แนะนำทำก่อน Phase 2-3)

เพิ่มใน Global App Menu เป็น single source of truth:

```css
:root {
    --dnc-primary: #06C755;
    --dnc-dark: #0f172a;
    --dnc-gold: #c0a062;
    --dnc-danger: #dc2626;
    --dnc-warning: #f59e0b;
    --dnc-text: #1e293b;
    --dnc-text-muted: #64748b;
    --dnc-border: #e2e8f0;
    --dnc-bg: #f8fafc;
    --dnc-font: 'Noto Sans Thai', 'Prompt', sans-serif;
    --dnc-radius: 12px;
    --dnc-tap-min: 44px;
}
```

ทำให้เปลี่ยน design ทั้งระบบได้จากจุดเดียว

---

## ลำดับการทำงาน

## Status (2026-03-28)

| # | Issue | Status |
|---|-------|--------|
| P19 | Tailwind CDN pinned v3.4.17 (3 files) | ✅ commit 1e6679a |
| P21 | Edit Profile loading state | ✅ commit fd4a2c5 |
| P05 | PDPA button disabled until selection | ✅ commit fd4a2c5 |
| P12 | Custom toast + confirm (Global App Menu) | ✅ commit fd4a2c5 |
| P11 | Empty state Assets + Transfer | ✅ commit fd4a2c5 |
| P24 | B2B LIFF init timeout | ✅ commit fd4a2c5 |
| P09 | Design tokens (:root CSS variables) | ✅ commit fd4a2c5 |
| P13 | Nav label 9px → 10px | ✅ commit fd4a2c5 |
| P15 | Body padding safe-area aware | ✅ commit fd4a2c5 |
| P17 | FontAwesome dedup | ✅ commit fd4a2c5 |
| P03 | Welcome popup Thai language | ✅ commit fd4a2c5 |
| P04 | Welcome popup backdrop + auto-dismiss | ✅ commit fd4a2c5 |
| P07 | Claim loading dark overlay | ✅ commit fd4a2c5 |
| P22 | Placeholder avatar → DINOCO logo | ✅ commit fd4a2c5 |
| P02 | QR CSS dedup (130+ lines removed) | ✅ commit c2cbbb5 |
| P06 | Onboarding step progress dots | ✅ commit c2cbbb5 |
| P08 | B2B gold accent (#c0a062) | ✅ commit c2cbbb5 |
| P10 | Input border-radius → var(--dnc-radius) | ✅ commit c2cbbb5 |
| P14 | Safe area (tokens added, body padding fixed) | ✅ commit fd4a2c5 |
| P16 | Global toast component | ✅ (built into P12) |
| P18 | Google Fonts dedup (B2C pages) | ✅ in progress |
| P20 | Lazy load html2canvas | ✅ commit c2cbbb5 |
| P23 | Status color config shared | ✅ commit c2cbbb5 |
| P01 | CSS dedup Gateway/Callback | N/A (separate entry points) |
