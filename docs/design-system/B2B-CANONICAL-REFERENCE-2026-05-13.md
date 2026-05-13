# DINOCO Design System — B2B Canonical Reference

**Version:** V.1.0 (2026-05-13)
**Status:** Boss-approved canonical baseline
**Boss decision quote:** _"ฉันชอบ Design ของ B2B นะเอา B2B อิง"_ (2026-05-13)
**Purpose:** Single source of truth for cross-surface design consistency. All DINOCO surfaces (B2F, SN/Customer, LIFF AI, Service Center, Manual Invoice) align to **B2B family** patterns. Token spec V.1.0 (boss-approved R4 with `#1A3A5C`) is treated as **aspirational** — production reality (B2B family) is canonical.

---

## 1. Decision Log

Following the UX/Flex consistency audit 2026-05-13 (32 findings, score 5.5/10), boss authorized **Path B+** (Sprint A Quick Wins + Sprint B HIGH findings + Pattern Library) with B2B family as canonical reference.

### D1 — Canonical Navy/Charcoal

**Two-tier canonical** (matches B2B production reality):

| Token | Hex | Use case | B2B reference |
|---|---|---|---|
| `--dnc-brand-navy-flex` | `#1A3A5C` | LINE Flex headers (LINE bubble background) | `b2b_flex_logo_header($bg='#1A3A5C')` default — `[B2B] Snippet 1:3864` |
| `--dnc-brand-charcoal-ui` | `#1f2937` | Web/LIFF UI (cart bar, sidebar, modal headers) | `[B2B] Snippet 4:257` LIFF cart bar `background:#1f2937` |

**Deprecated** (sweep migrate to one of the above):
- `#1e3a8a` (BO Snippet 16 hardcoded × 20) → migrate to `#1A3A5C` (Flex) or `#1f2937` (UI)
- `#1a237e` (B2F `B2F_COLOR_NAVY` constant) → migrate to `#1A3A5C` (Flex)
- `#111827` (Tailwind gray-900 — only 1 occurrence) → migrate to `#1f2937`

### D2 — Canonical Green

**Single canonical** for ALL surfaces (customer LIFF + admin + Flex):

| Token | Hex | Use case |
|---|---|---|
| `--dnc-brand-green` | `#16a34a` (Tailwind green-600) | **Primary brand green** — B2B Snippet 1 uses 82× (dominant) |
| `--dnc-success-emerald` | `#10b981` | Success state secondary (Member Dashboard, Marketplace) |
| `--dnc-success-emerald-dark` | `#059669` | Hover/active states |

**Deprecated**:
- `#06C755` (LINE-native green — Member Dashboard × 10) → migrate to `#16a34a` per B2B canonical (boss explicitly chose B2B over LINE-native)

### D3 — Canonical Date Format

**B2B Snippet 11:659 pattern is canonical**: `b2b_date('d/m/Y')` (Gregorian, day-first, slash-separated).

| Context | Format | Example |
|---|---|---|
| Customer LIFF + Flex (incl. warranty Flex) | `d/m/Y` Gregorian | `13/05/2026` |
| Admin tables/lists | `d/m/Y H:i` Gregorian | `13/05/2026 14:32` |
| Audit logs / database | ISO `Y-m-d H:i:s` | `2026-05-13 14:32:00` |
| Print invoice/receipts | Existing per-snippet pattern | unchanged |

**Deprecated** (migrate to Gregorian):
- Buddhist year (`+ 543`) in SN warranty Flex (`[Admin] SN Manager:11515`)
- Mixed format in `dinoco_sn_format_thai_date($buddhist=true)` default

#### Sprint 3F Status (2026-05-13) — DEPRECATION DOCUMENTED, ACTUAL FLIP DEFERRED TO SPRINT 4

**6 live Buddhist year sites identified** (sites preserved as-is to avoid mid-sprint UX breaking change):

| File:Line | Type | Currently shows | Boss visual review needed |
|---|---|---|---|
| `[System] Member Dashboard Main:178` | PHP helper default `$buddhist=true` | `13 พ.ค. 2569` (Thai month + Buddhist year) | Y — affects all asset cards |
| `[System] DINOCO SN REST API:969` | PHP helper default `$buddhist=true` | API responses | Y |
| `[Admin] DINOCO Warranty Lifecycle Notifier:217` | Inline `+ 543` in Flex date helper | Customer LINE Flex push | Y — customer-visible |
| `[System] DINOCO Warranty Activation LIFF:1000` | JS date picker helper `var buddhist = year + 543` with `พ.ศ.` prefix | "✓ พ.ศ. 2569 — 13 พ.ค. 2569" preview | N (input UX, prefix is explicit) |
| `[Admin] DINOCO Production SN Manager:11515` | Inline `+ 543` in S/N audit display | Admin S/N detail page | N (admin context) |
| `[B2B] Snippet 17 Warranty Check LIFF:418` | JS Thai date format `getFullYear() + 543` | Customer warranty check result | Y — customer-visible |

**Sprint 3F decision**: NEW code (Phase 1.3 Flex builders + future) MUST use `dinoco_format_date($ts, 'customer')` H5 helper (Gregorian). Existing 6 sites remain unchanged in Sprint 3 to avoid surprise visual breaking change. Sprint 4 reviews these with side-by-side mockups: keep พ.ศ. (Thai cultural norm) vs migrate to Gregorian (strict B2B canonical). Boss decides per-site.

**H5 helper guidance for new code**:

```php
// Customer-facing Flex / web — Gregorian per B2B canonical
$display = dinoco_format_date( $registered_at, 'customer' );  // → "13/05/2026"

// If Thai month abbreviation needed (warranty Flex etc.), use legacy
// dinoco_sn_format_thai_date($ts, false) explicitly passing false
// — DO NOT use $buddhist=true (defaults to true is deprecated)
$display = dinoco_sn_format_thai_date( $registered_at, false );  // → "13 พ.ค. 2026"
```

### D4 — Canonical Currency Decimal Rule

**Implicit B2B rule, now explicit:**

| Field type | Decimals | Example | B2B reference |
|---|---|---|---|
| Order total / grand total | 0 | `฿8,800` | `[B2B] Snippet 1:4048` `number_format($total_retail, 0)` |
| Line item amount (subtotal × qty) | 2 | `฿8,800.00` | `[B2B] Snippet 1:4560` `number_format($total_amount, 2)` |
| Line item with discount | 2 | `฿7,040.00` | Discount math precision required |
| Unit price (catalog/dealer) | 0 if integer, 2 if fraction | `฿8,800` or `฿100.50` | Common sense |
| Foreign currency (B2F land/sea shipping) | 2 always | `USD 35.00` / `CNY 5.50` | B2F multi-currency pattern |
| Discount percent | Integer % | `-20%` | Never decimal % |

**Locale:** `Intl.NumberFormat('th-TH')` for thousand separators in customer-facing. Admin OK with `en-US`.

---

## 2. Color Palette (B2B-Aligned Tokens V.1.2)

```css
:root {
  /* Brand primaries */
  --dnc-brand-navy-flex: #1A3A5C;    /* Flex header LINE bubbles */
  --dnc-brand-charcoal-ui: #1f2937;  /* Web/LIFF UI charcoal */
  --dnc-brand-green: #16a34a;        /* Primary brand green (B2B canonical) */

  /* Status colors */
  --dnc-success-emerald: #10b981;     /* Success secondary */
  --dnc-success-dark: #059669;        /* Hover/active */
  --dnc-warning-amber: #b45309;       /* Warning (UX-H3 contrast fixed) */
  --dnc-warning-amber-bg: #fef3c7;    /* Warning background */
  --dnc-danger-red: #dc2626;          /* Destructive primary */
  --dnc-danger-red-bg: #fee2e2;       /* Destructive background */
  --dnc-info-blue: #3b82f6;           /* Info primary */
  --dnc-info-blue-bg: #dbeafe;        /* Info background */

  /* Member dashboard accents (Phase 8 customer UX) */
  --dnc-gradient-fire-start: #FF416C; /* Red gradient buttons (เคลม) */
  --dnc-gradient-fire-end: #FF4B2B;
  --dnc-gradient-sky-start: #005c97;  /* Blue gradient buttons (ลงทะเบียน) */
  --dnc-gradient-sky-end: #363795;
  --dnc-gradient-emerald-start: #11998e; /* Green gradient (โอนสิทธิ์) */
  --dnc-gradient-emerald-end: #38ef7d;

  /* Tier badges (loyalty system - Member Dashboard) */
  --dnc-tier-bronze: #b45309;
  --dnc-tier-silver: #94a3b8;
  --dnc-tier-gold: #ca8a04;
  --dnc-tier-platinum: #4338ca;
  --dnc-tier-diamond-start: #6d28d9;
  --dnc-tier-diamond-end: #9333ea;

  /* Text */
  --dnc-text-primary: #111827;
  --dnc-text-secondary: #4b5563;
  --dnc-text-muted: #9ca3af;
  --dnc-text-inverse: #ffffff;

  /* Surface */
  --dnc-surface-card: #ffffff;
  --dnc-surface-page: #f9fafb;
  --dnc-surface-hover: #f3f4f6;
  --dnc-surface-divider: #e5e7eb;
}
```

---

## 3. Typography

```css
:root {
  --dnc-font-primary: 'Noto Sans Thai', 'Sarabun', -apple-system, sans-serif;
  --dnc-font-mono: 'JetBrains Mono', 'Roboto Mono', monospace;

  --dnc-text-xs: 11px;
  --dnc-text-sm: 13px;
  --dnc-text-base: 14px;
  --dnc-text-md: 15px;
  --dnc-text-lg: 17px;
  --dnc-text-xl: 20px;
  --dnc-text-2xl: 24px;
  --dnc-text-3xl: 30px;

  --dnc-leading-tight: 1.4;
  --dnc-leading-normal: 1.6;  /* Required for Thai */
  --dnc-leading-relaxed: 1.75;

  --dnc-weight-normal: 400;
  --dnc-weight-medium: 500;
  --dnc-weight-bold: 700;
}
```

**B2B canonical**: customer LIFFs use `'Noto Sans Thai'` first (B2B Snippet 4 + 11 pattern). Admin print may use Sarabun first.

---

## 4. Spacing + Sizing (4px grid)

```css
:root {
  /* Spacing 4px grid */
  --dnc-s1: 4px;
  --dnc-s2: 8px;
  --dnc-s3: 12px;
  --dnc-s4: 16px;
  --dnc-s5: 20px;
  --dnc-s6: 24px;
  --dnc-s7: 28px;
  --dnc-s8: 32px;
  --dnc-s10: 40px;
  --dnc-s12: 48px;
  --dnc-s16: 64px;

  /* Radius */
  --dnc-r-sm: 6px;
  --dnc-r-md: 12px;
  --dnc-r-lg: 16px;
  --dnc-r-xl: 20px;
  --dnc-r-full: 9999px;

  /* Shadow */
  --dnc-shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --dnc-shadow: 0 2px 8px rgba(0,0,0,0.06);
  --dnc-shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --dnc-shadow-lg: 0 8px 24px rgba(0,0,0,0.12);

  /* Touch targets */
  --dnc-touch-min: 44px;       /* iOS HIG mobile */
  --dnc-touch-comfort: 48px;
  --dnc-touch-desktop: 32px;   /* Admin desktop allows smaller */

  /* Breakpoints (use in @media queries) */
  /* sm: 480px (mobile portrait)
     md: 640px (mobile landscape)
     lg: 768px (tablet)
     xl: 1024px (desktop)
     2xl: 1280px (admin optimal) */
}
```

---

## 5. Component Patterns (B2B Canonical)

### 5.1 Filter Chips — `.dnc-filter-chip` base class (Sprint 2D)

Canonical dimensions extracted from `[B2B] Snippet 4:344` `.b2b-cat-filter-chip`:

```css
.dnc-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  min-height: 36px;
  border-radius: 16px;
  border: 1px solid var(--dnc-surface-divider);
  background: var(--dnc-surface-card);
  color: var(--dnc-text-secondary);
  font-size: var(--dnc-text-sm);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.dnc-filter-chip:hover { background: var(--dnc-surface-hover); }
.dnc-filter-chip.is-active {
  background: var(--dnc-brand-charcoal-ui);
  color: var(--dnc-text-inverse);
  border-color: var(--dnc-brand-charcoal-ui);
}
.dnc-filter-chip__count {
  background: rgba(255,255,255,0.2);
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 11px;
}
.dnc-filter-chip.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

Migration targets:
- `[B2B] Snippet 4` `.b2b-cat-filter-chip` → wrap class composition `class="dnc-filter-chip b2b-cat-filter-chip"`
- `[Admin] Inventory` `.stock-filter-pill` → migrate to `.dnc-filter-chip`
- `[B2F] Snippet 5` chips → migrate
- `[B2B] Snippet 16` BO modal chips → migrate

### 5.2 Status Badge — `dinoco_status_badge()` PHP helper (Sprint 2A)

**Pattern**: `b2b_get_status_labels()` + `b2b_get_status_colors()` is gold standard. Extract to shared registry.

```php
// Unified registry — all status systems route through here
dinoco_status_registry()         // returns array of all status definitions
dinoco_status_badge_html($status, $context='admin')  // returns HTML span
dinoco_status_badge_flex($status)                    // returns Flex box JSON for LINE bubbles
dinoco_status_label($status, $lang='th')             // returns label string
dinoco_status_color($status, $shade='primary')       // returns hex
```

Registries merged:
- B2B order statuses (14+) — from `b2b_get_status_labels()`
- B2F PO statuses (12) — from `B2F_Order_FSM` + `B2F_COLOR_*`
- Service Center claim statuses (11)
- SN/Warranty FSM statuses (12)
- Charge statuses (5 — pending_payment/verified/refunded/cancelled/failed)
- Flash shipment statuses (variable)

### 5.3 Flex Header — `dinoco_flex_header()` PHP helper (Sprint 2B)

**Severity-aware header** that wraps existing `b2b_flex_logo_header()`:

```php
dinoco_flex_header(
    string $title,
    string $subtitle = '',
    string $severity = 'info',   // info | warning | critical | success | brand
    array  $opts = []             // optional overrides: { logo_url, padding, height }
): array  // Flex box JSON
```

Severity → bg color mapping (CANONICAL — caller cannot override unless via `$opts` with explicit justification):

| Severity | bg hex | Source |
|---|---|---|
| `brand` (default for non-status Flex) | `#1A3A5C` | B2B canonical navy-flex |
| `info` | `#1A3A5C` | Same as brand (admin-internal informational) |
| `success` | `#16a34a` | B2B canonical green |
| `warning` | `#b45309` | B2B canonical amber |
| `critical` | `#dc2626` | B2B canonical red |

This **prevents** the B2B Snippet 16 BO pattern of 8 callers hardcoding `#1e3a8a`. Migration: all 8 sites become `dinoco_flex_header($title, $sub, 'info')` and inherit `#1A3A5C`.

### 5.4 Date Format — `dinoco_format_date()` helper (Sprint 2B)

```php
dinoco_format_date(
    int|string $ts,
    string $context = 'customer'  // customer | admin | iso | flex
): string
```

| Context | Format | Example |
|---|---|---|
| `customer` | `d/m/Y` | `13/05/2026` |
| `admin` | `d/m/Y H:i` | `13/05/2026 14:32` |
| `iso` | `Y-m-d H:i:s` | `2026-05-13 14:32:00` |
| `flex` | Alias for `customer` (for use in Flex JSON values) | `13/05/2026` |

JS variant in Design Tokens snippet:
```javascript
window.dinocoFormatDate(timestamp, context = 'customer')
```

### 5.5 Modal — `dinoco_modal_*` JS toolbox (Sprint 2C)

```javascript
dinoco_modal_alert(message, options = {})        // Promise<void>
dinoco_modal_confirm(message, options = {})      // Promise<bool>
dinoco_modal_prompt(message, options = {})       // Promise<string|null>
```

All wrap `window.dinocoModal.{alert,confirm,prompt}` from Modal Helpers V.1.2+, with:
- `message` field aliasing (backward compat for V.2.2 `content` field bug)
- Native fallback (graceful degradation if snippet not loaded)
- `options.severity` ('info'/'warning'/'critical') maps to modal accent color
- Deprecation console.log when per-file shim wrappers are called (`_b2bAlert`/`_scAlert`/...)

Phase 6 migrated 75 sites; Sprint 3 will migrate 21 remaining native `confirm/alert/prompt` sites.

---

## 6. Flex Card Standards

### 6.1 Bubble Size

| Context | Size | Justification |
|---|---|---|
| Customer-facing (status updates, payment, warranty) | `mega` | Visual prominence in LINE chat |
| Admin-internal (alerts, queues, action requests) | `kilo` | Compact for high-volume scanning |
| Carousels (3+ bubbles per push) | `kilo` per bubble | Fit screen width |

Drift detector (Sprint 2D): scan all `'size' => 'kilo'/'mega'/'giga'` declarations against context (customer vs admin) and fail on mismatch.

### 6.2 Header Pattern

All Flex builders MUST use `dinoco_flex_header()` (Sprint 2B helper). Pattern:

```
┌───────────────────────────────┐
│ [Logo] Title          [Right] │  ← bg = severity color, 32-40px height
│        Subtitle                │  ← optional, 14px, semi-transparent
└───────────────────────────────┘
```

### 6.3 Footer Buttons

| Button purpose | Color | Style |
|---|---|---|
| Primary CTA (confirm, pay, view) | `#16a34a` (brand-green) | filled, white text |
| Secondary CTA (cancel, back) | `transparent` | outlined, gray text |
| Destructive (delete, reject) | `#dc2626` (danger-red) | filled, white text |
| Warning action (approve risky) | `#b45309` (warning-amber) | filled, white text |

Max 3 buttons per Flex footer. 4+ → carousel or LIFF page.

### 6.4 Currency in Flex Bodies

Per D4 above:
- Total: `'฿' . number_format($amt, 0)` → `฿8,800`
- Line: `'฿' . number_format($amt, 2)` → `฿8,800.00`
- Foreign: per B2F multi-currency conventions

### 6.5 Date in Flex Bodies

Per D3 above: ALL customer-facing Flex bodies use `dinoco_format_date($ts, 'flex')` → `d/m/Y` Gregorian. No Buddhist year exception.

### 6.6 Phone Masking

Customer-facing Flex: `b2b_flex_mask_phone($phone)` → `08x-xxx-1234` (B2B Snippet 1:S18 pattern).
Admin LIFF: full phone OK (gated `manage_options`).

---

## 7. Admin Backend Shell

### 7.1 Sidebar Nav

Pattern: `dnc_lazy_load_module($section, $order, $shortcode_array)` registered via Module Registry (DB_ID 1186).

Sections (top-level groups):
- ระบบหลัก (Core admin)
- คลังสินค้า (Inventory)
- ระบบ B2B (B2B subsystem)
- ระบบ B2F (B2F subsystem)
- ระบบรับประกัน/SN (Warranty + S/N)
- ระบบเคลม (Claims)
- การเงิน (Finance)
- รายงาน (Reports)
- ตั้งค่าระบบ (System settings)

### 7.2 Form Patterns

- Inputs: `.dinoco-admin-input` class, 12px padding, `--dnc-r-sm` radius
- Buttons: matching `.dinoco-admin-btn` (primary/secondary/danger variants)
- Validation: red border + error message below field
- ARIA: `aria-invalid="true"` + `aria-describedby="error-id"`

### 7.3 Tables

- Header row: `--dnc-surface-hover` bg, `--dnc-text-primary` color
- Row hover: `--dnc-surface-hover`
- Pagination: `.dinoco-admin-paginator` class
- Empty state: friendly illustration + suggested action

### 7.4 Modals

All admin pages MUST use `dinoco_modal_*` (Sprint 2C) — no native `confirm/alert/prompt` allowed.

---

## 8. Customer LIFF (Mobile-First)

### 8.1 LIFF SDK Init

Canonical pattern (B2B Snippet 4 + 11 + 17):

```javascript
liff.init({ liffId: '<from_constant>' }).then(() => {
  if (!liff.isLoggedIn()) {
    liff.login();
    return;
  }
  // ... proceed
});
```

### 8.2 Cart Bar

B2B Snippet 4:257 + B2F Snippet 8:392 pattern:
- `position: fixed; bottom: 0;`
- `background: var(--dnc-brand-charcoal-ui)` (`#1f2937`)
- `min-height: 64px`
- `z-index: 600`
- Green CTA button: `background: var(--dnc-brand-green)` (`#16a34a`)

### 8.3 Asset Card 6-State Design

`[System] Dashboard - Assets List` V.31.5 pattern — keep scoped to Member Dashboard (do not generalize).

States: active / near_expiry / expired / claimed / stolen / pending_verification.

### 8.4 Back Button

`← กลับ` text button, 44×44 touch target, dark bg (`#1f2937`), white text. NOT `<` icon-only.

---

## 9. Helper Adoption Roadmap

### Sprint 2 (Pattern Library Foundation) — THIS WEEK

| # | Helper | File | Status |
|---|---|---|---|
| H1 | `dinoco_modal_*` JS toolbox | `[Admin] Modal Helpers` V.1.3 | Sprint 2C |
| H2 | `dinoco_status_registry` + `dinoco_status_badge_*` PHP | `[System] Design Tokens` V.1.2 | Sprint 2A |
| H3 | `dinoco_flex_header($title, $sub, $severity)` PHP | `[B2B] Snippet 1` V.34.33 | Sprint 2B |
| H4 | `.dnc-filter-chip` shared CSS | `[System] Design Tokens` V.1.2 | Sprint 2A |
| H5 | `dinoco_format_date($ts, $context)` PHP + JS | `[B2B] Snippet 1` V.34.33 + Design Tokens | Sprint 2B |

### Sprint 3 (Quick Wins — sweeps) — NEXT WEEK

1. Migrate 21 native modals → `dinoco_modal_*`
2. Sed sweep navy: `#1e3a8a` + `#1a237e` → `#1A3A5C` (Flex) or `#1f2937` (UI)
3. Pin customer LIFFs to `#16a34a` green (migrate `#06C755` × 10)
4. Rename Member Dashboard local CSS vars `--dnc-space-*` → `--mdash-space-*`
5. Force Flex header default — migrate BO Snippet 16 × 8 hardcoded overrides

### Sprint 4 (HIGH findings) — WEEK 3

6. Buddhist year → Gregorian sweep (SN warranty Flex + ~5 sites)
7. Sed sweep amber `#d97706` → `#b45309` (10 files)
8. Document + drift-detect Flex bubble size convention
9. Currency decimal rule rollout (~12 normalize sites)
10. Migrate `b2b_get_status_colors()` + `B2F_COLOR_*` → `dinoco_status_registry()`
11. Manual Invoice ARIA pass (0 → 30+ labels)
12. Filter chip migrations to `.dnc-filter-chip`
13. Service Center inline Tailwind → status badge registry

### Sprint 5-6 (Phase 1 W1-W3) — WEEK 4-5

Phase 1 Notifier + 16 NEW Flex builders inherit canonical foundation. ZERO new design drift.

---

## 10. Drift Detection

Sprint 2D ships 3 NEW Jest drift detectors:

1. `tests/jest/pattern-library-adoption.test.js` — every Phase 1.3 Flex builder MUST call `dinoco_flex_header()`, MUST NOT hardcode hex in bg/color fields
2. `tests/jest/dinoco-modal-api-usage.test.js` — count native `confirm/alert/prompt` per admin file, fail if count grows
3. `tests/jest/status-badge-registry.test.js` — verify B2B/B2F/SN status systems route through unified registry

Existing UX-H3 inline-handler regression detector + Member Dashboard scan-time detector unchanged.

---

## 11. Migration Order (Risk-Sorted, Lowest First)

1. ✅ B2B canonical reference doc (this file) — info-only, zero risk
2. Sprint 2A Design Tokens V.1.2 (additive — new tokens, no breaking change)
3. Sprint 2C Modal Helpers V.1.3 (additive — new JS functions, native fallback preserved)
4. Sprint 2B B2B Snippet 1 V.34.33 (additive — new PHP helpers, existing `b2b_flex_logo_header` unchanged)
5. Sprint 2D Jest drift detectors (test-only)
6. Sprint 3 sweeps (medium risk — sed across multiple files, drift detectors will catch breakage)
7. Sprint 4 HIGH migrations (medium-high risk — touches many files but with helpers already deployed)
8. Sprint 5-6 Phase 1 (low risk on canonical foundation)

---

## 12. Boss Pre-Approved Decisions

- ✅ B+ path (Sprint A + B + Pattern Library) — 2026-05-13
- ✅ B2B family canonical — 2026-05-13
- ✅ Token V.1.0 navy spec `#1A3A5C` retained for Flex but `#1f2937` for UI — derived from B2B production
- ✅ Member Dashboard `#06C755` LINE-green migrates to `#16a34a` brand-green — per B2B canonical
- ✅ Buddhist year DEPRECATED for customer-facing — Gregorian only

---

## 13. References

- Audit report basis: ux-ui-expert agent run 2026-05-13 (32 findings, score 5.5/10)
- Feature spec: `docs/feature-specs/FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md` V.2.3
- Token snippet: `[System] DINOCO Design Tokens` V.1.0 (DB_ID 1208) → V.1.2 after Sprint 2A
- Modal Helpers: `[Admin] DINOCO Modal Helpers` V.1.2 (DB_ID 1181) → V.1.3 after Sprint 2C
- B2B Snippet 1: `[B2B] Snippet 1: Core Utilities & LINE Flex Builders` V.34.32 (DB_ID 72) → V.34.33 after Sprint 2B
- Memory record: `feedback_b2b_design_canonical.md`
