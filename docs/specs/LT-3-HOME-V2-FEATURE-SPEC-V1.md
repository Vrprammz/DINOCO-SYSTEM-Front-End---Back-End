# Feature Spec: LT-3 DINOCO Home V2 + Lead-Gen Site (Integration-Complete)
**Version**: V.1.0 · **Date**: 2026-05-18 · **Author**: Feature Architect
**Status**: PLAN (authoritative integration-complete spec — supersedes integration sections of mega-spec)
**Parent docs**: [`PHASE-6-LT-3-DINOCO-HOME-V2-AND-ECOMMERCE-WIDGET.md`](./PHASE-6-LT-3-DINOCO-HOME-V2-AND-ECOMMERCE-WIDGET.md) (1700+ line mega-spec) · [`LT-3-IMPLEMENTATION-PLAN.md`](./LT-3-IMPLEMENTATION-PLAN.md) (8-week staging-first phase plan)
**Boss-locked decisions** (immutable, source `~/.claude/plans/immutable-whistling-marshmallow.md` 2026-05-18):
- Timeline: 12-14 weeks / 480-560 dev hours
- Dealer locator in **TOP NAV** + Google Maps (3-5× conversion engine)
- **Prices visible to ALL anonymous visitors** (Thai consumer law — retail/MSRP transparency)
- Tracking widget LT-3.6 **CUT** (per pivot — focus on lead-gen)
- SLA dealer: **4hr acknowledge** + miss → **both auto-reassign + Telegram boss alert**
- Lead retention **12 months** + anonymize after `closed_*` state + 30d (PDPA §17 storage limitation)
- Dealer auto-suspend at **40% decline rate** → freeze 14 days

---

## 0. Why this spec exists (problem statement from user)

User feedback 2026-05-18: **"ฟีเจอร์ยังเชื่อมไม่ครบเลย"** — existing 2029-line mega-spec is content-rich but does NOT enumerate **every integration touchpoint** between Home V2 and the 30+ existing customer-facing surfaces (SN warranty / F#8 marketplace / VAT receipts / Member Dashboard / claims / transfer / LINE OAuth / Brand Voice / OpenClaw / Maps / GA4).

This spec is the **authoritative integration matrix**. It does NOT replace the mega-spec's UI/UX content, copywriting, or detailed REST request/response shapes. It **maps every section of Home V2 to its existing system touchpoint** and identifies the 10 integration gaps the mega-spec missed.

---

## 1. Problem & Goal

### 1.1 Problem
- Existing dinoco.in.th is static brochure → **0% conversion engine**
- Boss pivoted away from full e-commerce checkout 2026-05-18 → **lead-gen + dealer handoff** model
- 30+ existing customer surfaces (SN warranty / F#8 marketplace / VAT receipts / Member Dashboard) are **siloed** — no unified discovery entry point
- Customer cannot find products → product detail → ติดต่อตัวแทน → close sale **without going to LINE OA first**
- Anonymous visitor cannot browse catalog with prices (per Thai consumer law requirement)
- Brand Voice testimonials and KOL content sit unused — no surface to display

### 1.2 Goal
Build dinoco.in.th V2 as **single-source-of-truth discovery hub** that integrates ALL existing customer surfaces while preserving SEO + brand voice + dealer attribution + PDPA compliance.

### 1.3 Success metrics (90-day post-launch)
| Metric | Target | Critical? |
|---|---|---|
| Monthly unique visitors | 15,000 | No |
| "ติดต่อตัวแทน" form submit rate | 3% of visitors | **Yes (primary KPI)** |
| Dealer 4hr acknowledge rate | ≥ 80% | **Yes** |
| Lead → closed_won conversion | 10% | **Yes** |
| LCP mobile (3G) | ≤ 2.5s | **Yes** |
| Lighthouse score mobile | ≥ 90 | Yes |
| Warranty Check anonymous usage | 5,000/mo | No (signals discovery) |
| F#8 Marketplace deep-link conversions | 200 extensions/mo via Home V2 | **Yes (revenue link)** |

### 1.4 Out of scope
- E-commerce checkout (CUT — boss pivot)
- Real-time stock sync (5-min cache enough)
- Affiliate program (LT-4)
- Multi-vendor marketplace (boss controls catalog 100%)
- Customer self-service refund button (boss Q20 R2 — Facebook DM only)
- Tracking widget LT-3.6 (CUT per boss pivot)

---

## 2. User Flows

### 2.1 Anonymous Discovery → Lead (Happy Path)
```
1. Google search "กันล้ม Honda CB300" / direct visit dinoco.in.th
2. Home V2 LCP < 2.5s → see hero + featured products with PRICES VISIBLE
3. Scroll to "Shop by Motorcycle Model" → click NX500
4. Navigate /shop/model/nx500 → product cards with prices + "ดูรายละเอียด" CTA
5. Click product → /product/{sku} detail page (Vercel ISR)
6. See: gallery + spec + compatible models + price + 2 CTAs
   ├── "💬 ติดต่อตัวแทน" (primary green) → Lead Form Modal
   └── "🏍️ หาตัวแทนใกล้ฉัน" (secondary) → Dealer Locator (top nav)
7. Open Lead Form Modal (9 fields per mega-spec §19.2):
   ├── ชื่อ-เบอร์-LINE ID (required)
   ├── รุ่นรถ-รุ่นสินค้า (prefilled from product detail)
   ├── จังหวัด-อำเภอ (geocoded for dealer match)
   ├── ข้อความ (optional)
   └── PDPA consent checkbox (required, gates submit)
8. Submit → Cloudflare Turnstile invisible challenge passes
9. POST /wp-json/dinoco-leads/v1/dealer-coord (Idempotency-Key wrapped)
10. WP → OpenClaw POST /api/leads/dealer-coord (dealer match + LINE Flex push)
11. Confirmation screen: "✅ ส่งคำขอแล้ว — ตัวแทนจะติดต่อกลับใน 4 ชม."
12. Customer LINE Flex received (if LINE ID provided)
13. Dealer LINE Flex received (with 4hr SLA timer)
```

### 2.2 Returning Customer (LINE Login)
```
1. Visit dinoco.in.th (cookie session active from prior LINE OAuth)
2. Hero shows "👋 สวัสดี {name}" + personalized "ประกันของคุณ X รายการ" card
3. Header dropdown: Member Dashboard / Warranty Check / Marketplace / Logout
4. Deep-link to existing shortcodes (NO duplication in Home V2):
   ├── /dashboard → existing [dinoco_dashboard]
   ├── /warranty-check → existing [b2b_warranty_check] Snippet 17
   ├── /warranty/activate?sn=X → existing [dinoco_warranty_activate]
   ├── /warranty/extend → existing [dinoco_warranty_extend] F#8 Marketplace
   ├── /claim → existing [dinoco_claim_page]
   └── /transfer → existing [dinoco_transfer_v3]
```

### 2.3 Anonymous Warranty Check (no login)
```
1. Home V2 → "🔍 เช็คประกันด่วน" section OR top-nav button
2. Input S/N (or QR scan via html5-qrcode lazy-load)
3. POST /wp-json/dinoco-sn/v1/lookup/{sn} (public, 60s cached, rate-limit 30/min/IP)
4. Display PII-stripped result:
   ├── Status badge (registered/claimed/replaced/etc.)
   ├── Product name (NO owner name)
   ├── Anonymized expiry date (month/year only)
   └── CTA: "ลงทะเบียนรับประกัน" → LINE Login → /warranty/activate
5. Stolen/voided/recalled → 404 collapse (Section 15.3 anti-enumeration)
```

### 2.4 Dealer Locator (TOP NAV — boss 3-5× conversion lever)
```
1. Click "🏍️ ตัวแทนใกล้คุณ" in TOP NAV (sticky on every page)
2. Modal/full-screen with Google Maps embed
3. Browser geolocation prompt → if granted → center on user
4. If denied → ask "จังหวัดของคุณ?" dropdown
5. GET /wp-json/dinoco-home/v1/dealers/locator?lat=X&lng=Y&radius=50
6. Map shows up to 20 dealer pins (B2B distributor CPT with active=true + show_on_map=true)
7. Click pin → side panel:
   ├── ชื่อร้าน + ที่อยู่ + เบอร์ + LINE Add Friend
   ├── สินค้าที่มี (from distributor product carry meta)
   ├── เวลาทำการ (from ACF)
   ├── Google Maps "Get Directions" deep-link
   └── "ติดต่อร้านนี้" CTA (pre-fills Lead Form with `preferred_dealer_id`)
```

### 2.5 Error Paths
| Failure | Customer message | Recovery |
|---|---|---|
| Lead form submit network fail | "เครือข่ายขัดข้อง — ลองอีกครั้ง" + retry button | Idempotency-Key reused on retry |
| Cloudflare Turnstile fails | Fallback hCaptcha checkbox | Per Turnstile docs |
| OpenClaw `/api/leads/dealer-coord` 5xx | WP returns 202 + queues lead → cron retry every 15min × 24h | Lead doesn't lose, dealer match delayed |
| Dealer doesn't acknowledge in 4hr | Auto-reassign to next dealer in pool + Telegram alert to boss | SLA enforcement (boss-locked) |
| Warranty Check stolen/voided/recalled | Generic 404 "ไม่พบข้อมูล" | Anti-enumeration (R3 audit Section 15.3) |
| Google Maps quota burst | Fallback to text-list dealer view | Quota alerts at 80% |
| LINE Login callback fails | Friendly card "ระบบ Login ปรับปรุง" + LINE Admin deep-link | Server-side Telegram alert dedup 1hr |
| F#8 marketplace deep-link with stolen plate | Redirect to /support/contact + Telegram alert | Existing SN REST handles |
| VAT receipt PNG URL leak | HMAC-token filename + .htaccess Deny All | Existing VAT V.1.4 |

### 2.6 Edge Cases
- Customer opens 5 tabs of Lead Form → only ONE submit succeeds (Idempotency-Key dedup at OpenClaw)
- LINE in-app browser visits Home V2 → bypass LINE OAuth redirect loop (detect User-Agent → use liff-state)
- User clicks dealer pin then closes modal mid-form → form state preserved in sessionStorage 1hr
- Mobile keyboard covers input → scroll-into-view + safe-area-inset-bottom
- PDPA consent unchecked → submit button disabled with `aria-describedby="pdpa-required"` tooltip
- Browser back from Lead Form → confirm "ออกจากฟอร์ม? ข้อมูลจะหาย"
- Geolocation denied + no province dropdown → show "All Thailand" list paginated

---

## 3. Data Model

### 3.1 NEW Tables (3)
| Table | Purpose | Lifecycle | PDPA |
|---|---|---|---|
| `wp_dinoco_home_v2_leads` | Lead lifecycle audit (cross-system: WP + OpenClaw mirror) | 12-month retention → anonymize after `closed_*` + 30d | YES — PII (name/phone/LINE ID) anonymized via `dinoco_home_v2_anonymize_lead($id)` |
| `wp_dinoco_home_featured` | Curated featured products (admin tool) | Manual CRUD | NO |
| `wp_dinoco_home_dealer_service_area` | Dealer geo bounds + product carry (one row per dealer, joins distributor CPT) | Live (admin-managed) | NO |

#### 3.1.1 `wp_dinoco_home_v2_leads` columns
```sql
id              BIGINT PK AUTO_INCREMENT
lead_uid        VARCHAR(40) UNIQUE  -- ULID, used as Idempotency-Key
source          VARCHAR(40)         -- 'dinoco_home_v2' | 'dealer_locator' | 'product_detail'
product_sku     VARCHAR(64) NULL    -- nullable for general inquiry
preferred_dealer_id BIGINT NULL     -- if from dealer locator pin
matched_dealer_id   BIGINT NULL     -- after OpenClaw match
status          VARCHAR(32)         -- new/dealer_assigned/dealer_acknowledged/closed_won/closed_lost/closed_no_response
customer_name   VARCHAR(120)        -- ANONYMIZED after retention
customer_phone  VARCHAR(40)         -- masked first/last 3 chars
customer_line_id VARCHAR(60) NULL
customer_province VARCHAR(40)       -- kept post-anonymize (aggregate stats)
motorcycle_model VARCHAR(80)
message_text    TEXT NULL           -- 500 char cap
pdpa_consent_at DATETIME            -- timestamp customer ticked consent
ip_addr         VARCHAR(45)         -- anonymize last octet after 90d
user_agent      VARCHAR(128)
created_at      DATETIME
acknowledged_at DATETIME NULL       -- dealer 4hr SLA check
closed_at       DATETIME NULL
anonymized_at   DATETIME NULL       -- retention cron writes
INDEX idx_status_created
INDEX idx_dealer_status
INDEX idx_anonymize_due  -- (closed_at + 30d) for retention cron
```

### 3.2 Existing tables touched (READ-ONLY unless noted)
| Table | Access | Why |
|---|---|---|
| `wp_dinoco_products` | READ | Catalog + prices + hierarchy + compatible_models |
| `wp_dinoco_moto_brands` + `models` | READ | "Shop by Model" grid + product filter |
| `wp_dinoco_sn_pool` | READ via `/sn/v1/lookup` only (60s cached) | Anonymous warranty check |
| `wp_posts` (CPT `b2b_distributor`) | READ | Dealer locator |
| `wp_dinoco_warranty_extensions` | READ via existing `/marketplace/*` | F#8 deep-link only |
| `wp_dinoco_idempotency_keys` | WRITE (via helper) | Lead submit replay safety |
| `wp_dinoco_flag_audit` | WRITE (via helper) | Every Home V2 admin toggle |
| `wp_dinoco_sn_audit` | WRITE (read-only events: `home_v2_warranty_check`, `home_v2_marketplace_deeplink_clicked`) | Analytics |

### 3.3 ACF additions
- `b2b_distributor` CPT:
  - `show_on_map` boolean (default false — opt-in for public locator)
  - `service_area_provinces` repeater (province slugs)
  - `geo_lat` / `geo_lng` decimal(10,7)
  - `dealer_decline_rate` decimal(5,2) (computed by cron, read-only ACF)
  - `dealer_suspended_until` datetime (40% auto-suspend per boss decision)

### 3.4 wp_options
- `dinoco_home_v2_master_enabled` (default '0' — feature flag for full rollout)
- `dinoco_home_v2_featured_curation` (serialized array of {sku, sort_order, badge})
- `dinoco_home_v2_dealer_sla_hours` (default 4)
- `dinoco_home_v2_dealer_auto_suspend_threshold` (default 40)
- `dinoco_home_v2_lead_retention_months` (default 12)

### 3.5 Migration
- All schemas lazy-installed via `dbDelta()` in NEW snippet on `admin_init`
- Existing data: zero migration (additive only)
- ACF distributor extension: programmatic via `acf_add_local_field_group()` (NO admin manual edit)
- `wp_dinoco_home_v2_leads.anonymize_due_at` index built post-deploy via `wp eval` (avoids ALTER on live)

---

## 4. API & Backend Design

### 4.1 New REST namespaces (2)
- `/wp-json/dinoco-home/v1/` (~15 endpoints — public + admin)
- `/wp-json/dinoco-leads/v1/` (~5 endpoints — lead lifecycle)

### 4.2 Public endpoints (no auth)
| Method | Path | Purpose | Rate Limit | Idempotency | HMAC |
|---|---|---|---|---|---|
| GET | `/dinoco-home/v1/featured` | Curated featured products | 60/min/IP | N/A | N/A |
| GET | `/dinoco-home/v1/catalog/browse` | Product list with filters | 60/min/IP | N/A | N/A |
| GET | `/dinoco-home/v1/product/{sku}` | Product detail (with PRICES VISIBLE) | 120/min/IP | N/A | N/A |
| GET | `/dinoco-home/v1/dealers/locator` | Dealer search by geo + filters | 30/min/IP | N/A | N/A |
| GET | `/dinoco-home/v1/motorcycle-models` | Moto brand/model grid | 60/min/IP (24hr cached) | N/A | N/A |
| GET | `/dinoco-home/v1/testimonials` | Brand Voice top reviews | 60/min/IP | N/A | N/A |
| POST | `/dinoco-leads/v1/dealer-coord` | Lead submit | 5/hr/IP + 1/min/IP burst | **YES** | N/A |
| GET | `/dinoco-home/v1/health` | Public health check | 10/min/IP | N/A | N/A |
| GET | `/dinoco-home/v1/dealer/{id}` | Public dealer profile (if show_on_map=true) | 30/min/IP | N/A | N/A |

### 4.3 Authenticated endpoints (LINE OAuth session)
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/dinoco-home/v1/me/dashboard-summary` | Personalized hero card data | WP session cookie |
| POST | `/dinoco-leads/v1/track-event` | Funnel analytics events | WP session cookie |

### 4.4 Admin endpoints (`manage_options`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/dinoco-home/v1/admin/featured` | Curate featured products |
| GET/PATCH | `/dinoco-home/v1/admin/dealer/{id}/service-area` | Manage dealer geo bounds |
| GET | `/dinoco-leads/v1/admin/leads` | Admin lead list (filter/search) |
| GET | `/dinoco-leads/v1/admin/leads/{id}` | Lead detail |
| POST | `/dinoco-leads/v1/admin/leads/{id}/reassign` | Manual reassign (4-eyes for ≥฿X value lead) |
| POST | `/dinoco-home/v1/admin/master-flag/toggle` | V.1.0 master enable (per `feedback_master_flag_design_checklist.md`) |

### 4.5 WordPress hooks/actions
- Action `dinoco_home_v2_lead_submitted` priority 10 → fire on lead INSERT
  - Listener 10: forward to OpenClaw `/api/leads/dealer-coord` (try/catch + retry queue)
  - Listener 20: write `sn_audit` event `home_v2_lead_submitted`
  - Listener 30: increment GA4 server-side event (Measurement Protocol)
- Action `dinoco_home_v2_dealer_acknowledged` → fire on dealer LINE postback ack
- Action `dinoco_home_v2_dealer_sla_missed` → fire from cron when 4hr passes
- Filter `dinoco_home_v2_dealer_match_candidates` → allow custom match algorithm override
- Filter `dinoco_home_v2_featured_products` → allow runtime curation override

### 4.6 Cron jobs (5)
| Hook | Frequency | Purpose | Heartbeat |
|---|---|---|---|
| `dinoco_home_v2_sla_check_cron` | every 15min | Check leads >4hr unacknowledged → auto-reassign + Telegram | YES (finally block) |
| `dinoco_home_v2_dealer_decline_recalc_cron` | hourly | Compute dealer decline rate over 30-day window + auto-suspend ≥40% | YES |
| `dinoco_home_v2_lead_retention_cron` | daily 03:30 | Anonymize leads after `closed_*` + 30d (chunked 500/iter × 10) | YES |
| `dinoco_home_v2_dealer_geo_revalidate_cron` | daily 04:00 | Re-geocode dealers whose address changed (via Google Geocoding API) | YES |
| `dinoco_home_v2_vercel_isr_purge_cron` | every 5min | Purge Vercel ISR cache on product price/stock change (consumes pending queue) | YES |

### 4.7 LINE Messaging integration
- **Dealer Flex push** (lead matched): `b2b_send_flex_message($dealer_group_id, $flex_lead_assigned)`
- **Customer Flex push** (lead acknowledged): `b2b_send_flex_message($customer_uid, $flex_acknowledged)`
- **Boss Telegram alert** (SLA missed): `b2b_tg_send_dedup('dealer_sla_missed_lead_{id}', $msg, 4hr_TTL)`
- **Push quota**: respect existing `b2b_push_admin_flex_dedup` (1hr TTL, 20/hr cap)
- **PII masking**: customer phone first/last 3 chars only in admin LINE group Flex (per existing `b2b_flex_mask_phone`)

### 4.8 OpenClaw contract (NEW endpoint required — blocking dependency)
- `POST /api/leads/dealer-coord` (on `agent:3000`)
  - Bearer auth: `LIFF_AI_AGENT_KEY`
  - Body: full lead payload + `wp_lead_id` + `idempotency_key`
  - Response: `{ matched_dealer_id, match_reason, estimated_response_time, errors }`
  - Timeout 10s + 1 retry + Docker `agent:` → `localhost:` fallback
  - Failure mode: WP returns 202 + queue lead → cron retry every 15min × 24h

---

## 5. UI/UX Wireframes (mobile-first, LINE in-app safe)

### 5.1 TOP NAV (sticky, every page)
- 56px height, white bg with subtle bottom border
- Logo (left, 32px height)
- Center (mobile): hamburger | Center (desktop): inline nav
- Nav items (boss directive — TOP NAV dealer locator):
  - 🏍️ ตัวแทนใกล้คุณ (primary — orange pill on mobile, prominent on desktop)
  - 🛒 สินค้า (catalog)
  - 🔍 เช็คประกัน
  - 💬 ติดต่อเรา
  - (logged in) 👤 บัญชีของฉัน (dropdown → Member Dashboard / Marketplace / Logout)
  - (logged out) LINE Login button

### 5.2 HERO Section
- Mobile: full-bleed background (DINOCO product hero image, WebP) + dark overlay 40%
- Headline: "อุปกรณ์เสริมมอเตอร์ไซค์คุณภาพญี่ปุ่น"
- Sub: "รับประกันสินค้า · ตัวแทนทั่วประเทศ · ส่งจริงทุกวัน"
- 2 CTA buttons:
  - Primary green: "🛒 ดูสินค้าทั้งหมด" → /shop
  - Secondary outlined: "🏍️ หาตัวแทน" → opens dealer locator modal
- Below CTAs (returning customer ONLY, LINE Login active):
  - 1-line personalized "👋 สวัสดี {name} · ประกันของคุณ {N} รายการ → ดูแดชบอร์ด"

### 5.3 SECTION: Featured Products
- Horizontal carousel mobile (swipe), 3-col grid desktop
- Card: product image (lazy `loading=eager` for first 3, lazy rest), name, **PRICE VISIBLE**, "ดูรายละเอียด" CTA
- Curated by admin via NEW tool in Admin Dashboard sidebar

### 5.4 SECTION: Shop by Motorcycle Model
- 2-col mobile, 4-col desktop grid
- Motorcycle SVG/photo (NX500, CB300, etc.) per model
- Click → /shop/model/{slug}
- Source: `wp_dinoco_moto_brands` + `wp_dinoco_moto_models` (existing tables)

### 5.5 SECTION: Quick Warranty Check
- Card with input + "🔍 ตรวจสอบ" button + "📷 สแกน QR" button (lazy html5-qrcode)
- Result inline (no redirect): status badge + product name + expiry (PII-stripped if anonymous)
- Stolen/voided → generic 404 (R3 audit anti-enumeration)

### 5.6 SECTION: Dealer Locator preview
- 1-line CTA: "🏍️ หาตัวแทนใกล้คุณ — เปิดแผนที่"
- Click → full dealer locator modal (also reachable from top nav)

### 5.7 SECTION: Riders Tell Stories (UGC + KOL — NEW)
- 3-col grid of testimonial cards
- Source: `wp_brand_voice_reviews` (existing — must filter `is_published=true + customer_consented=true`)
- Click → expand modal with full review + photo

### 5.8 SECTION: F#8 Marketplace deep-link
- Banner: "💎 ต่ออายุประกันออนไลน์ — ส่วนลด 10% สำหรับลูกค้าเก่า"
- CTA → /warranty/extend (existing F#8 LIFF) — deep-link preserves session

### 5.9 SECTION: LINE OA prompt
- Card: "เพิ่มเพื่อนเพื่อรับโปรโมชั่น"
- QR code + "Add Friend" button (deep-link `https://lin.ee/dinoco`)

### 5.10 FOOTER
- 4-col grid desktop, accordion mobile
- Cols: เกี่ยวกับเรา / สินค้า / ลูกค้า / นโยบาย
- Bottom row: 🛡️ PDPA Compliant · 🔒 SSL · ©2026 DINOCO · [ขอข้อมูลส่วนตัว (GDPR)] → existing `[dinoco_gdpr_data_request]` shortcode page

### 5.11 LEAD FORM Modal
- Fullscreen mobile, centered card desktop (max 480px wide)
- Header: "💬 ติดต่อตัวแทน" + ✕ close
- Body: 9 fields with floating labels + inline validation
- PDPA consent (gated submit):
  - Checkbox + "ข้าพเจ้ายินยอมให้ DINOCO เก็บข้อมูลตามนโยบายความเป็นส่วนตัว [อ่าน]"
- Submit button: green full-width, disabled until valid + consent + Turnstile
- Loading state: button shows spinner + disable form
- Success state: "✅ ส่งคำขอแล้ว — ตัวแทน {name} จะติดต่อใน 4 ชม."

### 5.12 DEALER LOCATOR Modal
- Fullscreen mobile, fullscreen desktop (with backdrop click close)
- Top bar: search box + "📍 ใช้ตำแหน่งฉัน" button
- Body: Google Maps + pin clusters + side panel for selected pin
- Bottom (mobile): swipe-up sheet with dealer cards list
- Empty state: "ไม่พบตัวแทนในรัศมี 50 กม. → ดูทั่วประเทศ"

### 5.13 Touch targets / a11y
- ALL buttons ≥ 44×44 px (iOS HIG)
- `aria-label` on all icon-only buttons
- `role="dialog"` + `aria-modal="true"` on modals
- `aria-live="polite"` for inline form errors
- ESC closes modals + focus trap
- `prefers-reduced-motion` respected (animations disabled)
- Color contrast WCAG AA (text 4.5:1, large text 3:1)

### 5.14 Thai text (always primary)
- All UI strings in Thai
- ENG/中文 supported via next-intl (boss decision pending Q-LT-3-1 default lang)

---

## 6. Dependency & Impact Analysis (THE INTEGRATION MATRIX)

### 6.1 Integration Matrix per Home V2 section

| Home V2 Section | REST Endpoint | DB Tables (R/W) | Existing Shortcode | Cross-cutting Helpers | External Service | PDPA Touch |
|---|---|---|---|---|---|---|
| **Hero (anonymous)** | None | None | None | None | None | None |
| **Hero (logged in)** | `/dinoco-home/v1/me/dashboard-summary` | R: `wp_users`, `wp_usermeta`, `wp_dinoco_sn_pool_meta` | None | Cookie session | LINE OAuth | Profile display consented at login |
| **Featured products** | `/dinoco-home/v1/featured` | R: `wp_dinoco_products`, `wp_dinoco_home_featured` | None (deep-links to `/product/{sku}`) | Idempotency (admin curate) | Vercel ISR (24hr) | None |
| **Shop by Model grid** | `/dinoco-home/v1/motorcycle-models` | R: `wp_dinoco_moto_brands`, `wp_dinoco_moto_models` | None | Cache 24hr | None | None |
| **Product detail** | `/dinoco-home/v1/product/{sku}` | R: `wp_dinoco_products`, hierarchy, moto catalog | None — NEW Next.js page | Idempotency (for "add to lead" action) | Vercel ISR (revalidate-on-tag) | None |
| **Warranty Check (anonymous)** | EXISTING `/dinoco-sn/v1/lookup/{sn}` | R via existing endpoint | Optional iframe of `[b2b_warranty_check]` OR re-implement | Rate limit 30/min/IP (existing) + 60s cache | None | Anti-enumeration (R3 §15.3) + PII-strip |
| **Dealer Locator** | `/dinoco-home/v1/dealers/locator` | R: `wp_posts` (CPT), `wp_postmeta` (ACF geo) | None | Rate limit 30/min/IP | **Google Maps JS API** + **Geolocation API** | Geo permission UI consented at request |
| **Lead Form Modal** | `/dinoco-leads/v1/dealer-coord` | W: `wp_dinoco_home_v2_leads`, `wp_dinoco_idempotency_keys` · W: `wp_dinoco_sn_audit` (event) | None | **Idempotency Helper** (CRITICAL) + Rate limit 5/hr/IP + Sentry obs + Flag Audit (if admin tweaks config) | **Cloudflare Turnstile** + **OpenClaw `/api/leads/dealer-coord`** + **LINE push** (dealer Flex) | PDPA consent checkbox at submit + timestamp stored |
| **Riders Tell Stories (Brand Voice)** | `/dinoco-home/v1/testimonials` | R: `wp_brand_voice_reviews` | `[dinoco_brand_voice]` available | None | None | Filter `customer_consented=true` |
| **F#8 Marketplace deep-link** | NONE (deep-link only) | R via existing `/marketplace/quote` on click | `[dinoco_warranty_extend]` (existing LIFF) | None | LINE OAuth (existing) | Existing F#8 flow |
| **Customer Login deep-link** | `/dinoco-auth/v1/line-sync` (NEW for Next.js) | R: `wp_users`, `wp_usermeta` | `[dinoco_login_button]`, `[dinoco_gateway]` | None | LINE OAuth | LINE consent (existing) |
| **Footer GDPR link** | EXISTING `/dinoco-gdpr/v1/*` | Via existing snippet | `[dinoco_gdpr_data_request]` | None | None | Existing GDPR Phase 7 flow |

### 6.2 Files to MODIFY (existing)
1. `CLAUDE.md` — add Home V2 section + new constants (`DINOCO_HOME_V2_*`, `GOOGLE_MAPS_API_KEY_HOME_V2`, `CLOUDFLARE_TURNSTILE_SITE_KEY`, etc.)
2. `[System] DINOCO LINE Login` V.XX → bump for `/dinoco-auth/v1/line-sync` Next.js exchange
3. `[Admin System] DINOCO Admin Dashboard` → add sidebar nav-item "Home V2" under "Customer-facing"
4. `[Admin System] DINOCO Module Registry` → register new admin tools (`home_v2_featured`, `home_v2_leads`, `home_v2_dealer_geo`)
5. `[System] DINOCO MCP Bridge` → NEW `dinoco-mcp/v1/home-v2-lead-create` for AI ingest from chatbot path
6. `openclawminicrm/proxy/index.js` → NEW route `/api/leads/dealer-coord` (BLOCKING dep — Phase LT-3.4)
7. `openclawminicrm/proxy/modules/lead-pipeline.js` → support new `source=dinoco_home_v2` discriminator + dealer match algorithm
8. `[B2B] Snippet 5` (B2B Admin Dashboard) → add Home V2 lead tab (admin can review)
9. SYSTEM-REFERENCE.md + WORKFLOW-REFERENCE.md + FEATURE-SPECS.md docs update post-launch

### 6.3 Files to CREATE (new snippets — proposed DB_IDs, sequential after 1225)
| DB_ID | Snippet Name | Purpose |
|---|---|---|
| 1226 | `[System] DINOCO Home V2 REST API` | All `/dinoco-home/v1/*` endpoints + schemas (lazy install) + featured curation admin endpoint |
| 1227 | `[System] DINOCO Home V2 Leads` | `/dinoco-leads/v1/*` endpoints + lead CRUD + status FSM + OpenClaw dispatch + 5 cron jobs (SLA + decline recalc + retention + geo revalidate + ISR purge) |
| 1228 | `[Admin System] DINOCO Home V2 Featured Curation` | Admin UI for featured products (shortcode `[dinoco_admin_home_featured]`) |
| 1229 | `[Admin System] DINOCO Home V2 Dealer Geo Manager` | Admin UI for dealer service area + lat/lng + show_on_map toggle + decline rate viewer (shortcode `[dinoco_admin_home_dealer_geo]`) |
| 1230 | `[Admin System] DINOCO Home V2 Lead Inbox` | Admin lead viewer + filter + reassign + Telegram trigger (shortcode `[dinoco_admin_home_leads]`) |
| 1231 | `[System] DINOCO Home V2 Auth Bridge` | `/dinoco-auth/v1/line-sync` for Next.js LINE Login exchange + JWT session helper |

Plus NEW external repo: `dinoco-home-v2-nextjs` (Vercel-hosted, Next.js 14 App Router) — separate from WP monorepo per LT-3-IMPLEMENTATION-PLAN §4.5

### 6.4 Prerequisites (BLOCKING for LT-3 kickoff)
| Dep | Status | Owner | Blocks |
|---|---|---|---|
| Vercel account + project provisioned | ❌ | Boss | LT-3.1 |
| DNS: `staging.dinoco.in.th` CNAME to Vercel | ❌ | Boss (hosting) | LT-3.1 |
| Google Maps API key + billing enabled (quota ฿X/mo) | ❌ | Boss | LT-3.2 |
| Cloudflare Turnstile site key | ❌ | Boss | LT-3.4 |
| OpenClaw `/api/leads/dealer-coord` endpoint | ❌ | OpenClaw dev | **LT-3.4 BLOCKER** |
| GA4 property + Measurement Protocol API secret | ❌ | Boss | LT-3.2 |
| Facebook Pixel ID (optional) | ⚠️ Optional | Boss | LT-3.6 (CUT — defer) |
| Figma mockups approved | ❌ | Boss design review | LT-3.2 |
| VAT compliance fully shipped (F#8 surface stable) | ✅ Done 2026-05-18 | Self | None |
| Sentry activation | 🟡 Boss testing | Boss | None (deferred) |
| Boss decisions (10 Q-LT-3-* in mega-spec §16) | ❌ | Boss | Various |
| Dead-workflow remediation 60h Phase 1 (per `~/.claude/plans/`) | 🟡 In progress | Self | RECOMMENDED before kickoff (customer trust gaps) |

### 6.5 Side Effects to mitigate
- **CSS namespace**: Next.js Tailwind isolated by domain (staging vs prod). NO collision with WP CSS. But `liff-src/` design tokens reused (verify no global conflicts at build time)
- **JS bundle**: Next.js bundle should be < 200KB initial JS (per Lighthouse target). Lazy-load Google Maps + html5-qrcode + ApexCharts on demand
- **WP REST cache stampede**: Vercel ISR with stale-while-revalidate + cache tag invalidation (purge on `dinoco_product_updated` action via cron-driven webhook)
- **LINE push quota**: respect existing `b2b_push_admin_flex_dedup` (1hr TTL, 20/hr cap). Lead submit spam = rate-limited at 5/hr/IP BEFORE LINE push. Premium quota ฿1,500/mo already paid (per CLAUDE.md)
- **Google Maps quota burst**: alert at 80% daily quota → fallback to text-list dealer view
- **Lead form abuse**: Cloudflare Turnstile invisible + Idempotency-Key + IP rate limit + dealer 40% decline auto-suspend
- **Cookie consent**: required for GA4 + Facebook Pixel — banner with accept/reject (PDPA compliant, default OFF until accept)
- **Cross-domain LINE OAuth**: callback to `dinoco.in.th/wp-login.php?action=line_callback` (existing) — Next.js uses `iron-session` cookie with `Domain=.dinoco.in.th` for SSO
- **Dealer locator IP geolocation**: if browser geolocation denied → fallback to MaxMind GeoIP (server-side lookup via Vercel Edge Functions) → if both fail → manual province dropdown
- **PDPA Art. 5(1)(e) retention**: 12-month lead retention enforced by daily cron `dinoco_home_v2_lead_retention_cron` (chunked anonymize). Closed leads anonymized 30d after close

---

## 7. Implementation Roadmap (12-14 weeks / 480-560h per boss-locked)

### Phase LT-3.1 — Foundation + Auth (Week 1-2, ~80h)
- Vercel + Next.js 14 App Router scaffold
- DNS staging cutover
- LINE OAuth bridge (NEW Snippet 1231 + Next.js callback)
- WP REST proxy through Vercel Edge
- Design tokens + Tailwind setup
- i18n (next-intl)
- Deploy: blank Home with LINE Login working

### Phase LT-3.2 — Home + Catalog (Week 3-5, ~120h)
- Hero + Featured + Models + Brand Story + Brand Voice + LINE OA sections (all UI)
- Catalog browse + filters + Product detail page
- NEW Snippet 1226 (Home V2 REST API)
- NEW Snippet 1228 (Featured Curation Admin)
- All prices visible to anonymous (Thai consumer law)
- Lighthouse score ≥ 90 mobile
- Deploy: staging.dinoco.in.th browseable end-to-end

### Phase LT-3.3 — Dealer Locator TOP NAV (Week 6-7, ~80h)
- Google Maps integration
- NEW Snippet 1229 (Dealer Geo Manager)
- ACF distributor extension (geo_lat/geo_lng/service_area/show_on_map)
- One-time backfill script for existing distributors (admin runs once)
- Locator modal UI (search + pin + side panel)
- Deploy: dealer locator fully functional on staging

### Phase LT-3.4 — Lead-Gen Flow (Week 8-9, ~100h) **PRIMARY ROI ENGINE**
- NEW Snippet 1227 (Leads REST + cron jobs)
- Lead Form Modal UI (9 fields + PDPA + Turnstile)
- OpenClaw `/api/leads/dealer-coord` endpoint (OpenClaw dev — BLOCKER dep)
- Dealer matching algorithm (region + product carry + load balance + decline rate)
- LINE Flex templates (dealer assign + customer ack + boss SLA miss)
- 4hr SLA cron + auto-reassign + Telegram alert
- NEW Snippet 1230 (Admin Lead Inbox)
- Deploy: end-to-end lead flow working on staging (test dealers + test customer LINE)

### Phase LT-3.5 — Warranty Check Anonymous + F#8 Deep-link (Week 10, ~40h)
- Embed warranty check inline on Home (anonymous)
- F#8 Marketplace deep-link banner + session preservation
- Footer + GDPR link
- Cookie consent banner (PDPA compliant)
- Deploy: all customer surfaces integrated

### Phase LT-3.6 — Polish + SEO + Performance (Week 11, ~40h)
- Final SEO audit + sitemap.xml + robots.txt + structured data (JSON-LD product + LocalBusiness)
- Performance audit (Web Vitals)
- Cross-browser test (Chrome / Safari / Firefox / iOS / Android / LINE in-app)
- Load test (k6 — 100 concurrent users)
- Security audit (CSP + CORS + Turnstile)
- Vercel ISR cache strategy tuned

### Phase LT-3.7 — Production Cutover (Week 12, ~40h)
- Boss UAT sign-off
- Customer support team training
- DNS TTL pre-lower 24h before cutover
- Backup current WP (DINOCO COMMAND v6.8)
- Sunday 02:00 ICT cutover
- 5 smoke tests post-cutover (home / browse / contact dealer / warranty check / LINE login)
- 24hr monitoring
- LINE OA broadcast announcement + Facebook post

### Phase LT-3.8 — Buffer (Week 13-14, ~60h)
- Bug fixes from launch
- Boss-requested UX tweaks (boss-screenshot iteration loop expected)
- Performance tuning
- Documentation update (CLAUDE.md + SYSTEM-REFERENCE + WORKFLOW-REFERENCE + FEATURE-SPECS)

---

## 8. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OpenClaw `/api/leads/dealer-coord` not ready by Week 8 | Medium | **Critical** (blocks LT-3.4) | Start OpenClaw dev parallel from Week 1. Fallback: WP queues leads + sends raw text Flex to next available dealer |
| Google Maps API quota burst from bots | Medium | High (cost + UX) | Server-side proxy + 24hr cached locator results + Cloudflare bot detection + Turnstile on locator modal |
| Vercel cost spike from organic traffic | Medium | Medium | Monitor weekly + cache-heavy strategy + alert at ฿X/day + downgrade plan |
| LINE OA quota burn from lead Flex push | Medium | High | Rate limit 5/hr/IP + dedupe Flex per dealer 1hr window + Premium quota ฿1,500/mo already paid |
| DNS cutover breaks production | Low | **Critical** | TTL pre-lower 24h + tested rollback + Sunday low-traffic window + DINOCO COMMAND backup |
| Customer hits dead-end on existing surface (e.g. all_backorder customer view) | High pre-fix | Critical (lost trust at scale) | **Complete dead-workflow Phase 1 P0 fixes BEFORE LT-3 kickoff** (per `~/.claude/plans/immutable-whistling-marshmallow.md` — 60h, 8 items) |
| Stale WP REST cache returns wrong price | Medium | High (consumer law) | Vercel ISR revalidate-on-tag + admin price edit fires `dinoco_home_v2_vercel_isr_purge_cron` queue |
| LINE login session lost cross-tab | Low | Medium | httpOnly cookie + 30-day rolling refresh + `iron-session` cross-tab broadcast |
| Customer confusion (new UI) | High | Low | LINE OA tutorial broadcast + walk-through video + support team trained |
| Dealer 4hr SLA unrealistic | Medium | High (boss-locked) | First 2 weeks soft enforcement (warn only) → ramp to hard enforcement Week 3+ |
| GA4 + Facebook Pixel break cookie consent | Low | Medium (PDPA) | Default OFF until explicit accept + tag-loader gated by `dinoco_consent_state` cookie |
| Vercel ISR cache stampede on launch | Medium | Medium | Pre-warm cache 1hr before cutover via cron loop fetching top 50 product pages |
| Multiple customer Lead Form spam | Medium | Low | Idempotency-Key + 5/hr/IP rate limit + Turnstile + dealer 40% decline auto-suspend |

---

## 9. Testing Checklist

### 9.1 Customer flow tests (manual + Playwright)
- [ ] Anonymous visitor → home → /shop → /product/{sku} → ติดต่อตัวแทน → form → submit → confirmation
- [ ] Logged-in customer → home shows personalized hero → dropdown nav → all existing surfaces accessible
- [ ] Dealer locator: deny geolocation → fallback to province dropdown → result correct
- [ ] Warranty Check anonymous: stolen plate → generic 404 (no PII leak)
- [ ] Warranty Check anonymous: voided plate → generic 404
- [ ] Lead form: PDPA unchecked → submit disabled → tooltip explains
- [ ] Lead form: Turnstile fails → fallback hCaptcha
- [ ] Lead form: same form submitted 3× rapidly → only 1 lead created (Idempotency)
- [ ] Lead form: 6 submissions from same IP in 1hr → 6th returns 429
- [ ] F#8 marketplace deep-link from home → session preserved → /warranty/extend works
- [ ] LINE Login from home → returns to home with `?logged_in=1` → personalized hero

### 9.2 Dealer flow tests
- [ ] Dealer receives Flex on lead → click Accept → status → `dealer_acknowledged` within 4hr → no SLA breach
- [ ] Dealer ignores 4hr → auto-reassign + Telegram boss alert
- [ ] Dealer declines 40% over 30 days → auto-suspend 14 days
- [ ] Dealer suspended → removed from match pool but profile visible on locator

### 9.3 Admin flow tests
- [ ] Admin curates featured products → save → cache invalidated → home shows update within 5min
- [ ] Admin manages dealer geo → save → locator reflects within next geo revalidate cron
- [ ] Admin views lead inbox → reassign → lead transferred + audit logged
- [ ] Master flag toggle: `dinoco_home_v2_master_enabled=0` → home shows maintenance card

### 9.4 PDPA tests
- [ ] Lead aged 12 months → cron anonymizes name/phone/LINE ID (province preserved for aggregate)
- [ ] Customer requests data export via /privacy → all home V2 leads included in ZIP
- [ ] Customer requests deletion → anonymize fields immediately
- [ ] IP anonymized last octet after 90d

### 9.5 Performance tests
- [ ] Lighthouse mobile ≥ 90 on home + product detail
- [ ] LCP ≤ 2.5s on simulated 3G
- [ ] k6 load test: 100 concurrent users for 10min → no 5xx errors → p95 < 1s

### 9.6 Drift detectors (NEW Jest)
- `home-v2-rest-endpoint-drift.test.js` — verify all 15 endpoints exist + permission callbacks valid
- `home-v2-cron-heartbeat-drift.test.js` — all 5 crons have heartbeat in finally
- `home-v2-pdpa-anonymize-drift.test.js` — verify anonymize cron updates required columns
- `home-v2-integration-deeplink-drift.test.js` — verify all 8 existing shortcode deep-links resolve

---

## 10. Rollback Plan

### 10.1 Soft rollback (single feature)
- Master flag: `wp option update dinoco_home_v2_master_enabled 0` → home shows "ระบบกำลังปรับปรุง" + LINE Admin deep-link
- Per-feature flags can disable Lead Form / Dealer Locator / Warranty Check individually
- WP backend untouched — existing LIFF/shortcodes continue to work

### 10.2 Hard rollback (full DNS revert)
- DNS revert (TTL 60s pre-lowered): `dinoco.in.th` A record → old WordPress server
- Old WordPress theme files preserved during launch
- Recovery: ~10 minutes
- LINE OA broadcast: "ระบบกำลังปรับปรุง — กลับสู่หน้าเดิมชั่วคราว"
- Postmortem: 48-hour root cause analysis

### 10.3 Lead data preservation
- Even on hard rollback, leads in `wp_dinoco_home_v2_leads` are preserved
- Admin Lead Inbox shortcode works independently of Next.js home
- Dealers continue to receive Flex via existing LINE infra

---

## INTEGRATION GAPS IDENTIFIED (10 items the existing mega-spec missed)

These are the gaps that triggered user feedback "ฟีเจอร์ยังเชื่อมไม่ครบ" — the mega-spec describes content but not the wiring:

| # | Gap | Impact | Fix in this spec |
|---|---|---|---|
| **G1** | **VAT receipt URL deep-link from Home V2** | F#8 Marketplace purchases from Home V2 must preserve VAT receipt HMAC-token PNG flow. Mega-spec §19 doesn't mention VAT receipt download surface | §2.5 + §6.5 — VAT receipt URL never exposed on Home V2; F#8 deep-link redirects to existing F#8 LIFF which handles receipt download via existing `dinoco_vat_get_receipt_url()` HMAC chain |
| **G2** | **WP user session bridging from Next.js** | Next.js on Vercel cannot read WP `wordpress_logged_in_*` cookie directly (cross-domain). Mega-spec §5 sketches LINE OAuth but doesn't enumerate the SSO cookie strategy | §6.5 — NEW Snippet 1231 `/dinoco-auth/v1/line-sync` issues `iron-session` cookie with `Domain=.dinoco.in.th` for cross-subdomain SSO + 30-day rolling refresh |
| **G3** | **Dealer LINE health check on locator** | Mega-spec assumes dealer LINE OA bot always responds. Reality: ~5% dealer bots are offline. Locator shouldn't display offline dealers | §4.6 — `dinoco_home_v2_dealer_geo_revalidate_cron` extended to ping each dealer's LINE bot via `b2b_line_health_ping($group_id)` weekly + flag offline dealers `dealer_line_offline=true` ACF |
| **G4** | **KOL attribution chain on testimonials** | "Riders Tell Stories" pulls from Brand Voice — but mega-spec doesn't capture KOL attribution (who got the customer to dinoco.in.th — KOL post link, affiliate code?) | §3.1 — `wp_dinoco_home_v2_leads.referral_source` column added (`kol`/`organic`/`direct`/`affiliate_{id}`) + UTM param extracted from landing URL + Brand Voice review optionally linked via `kol_handle` ACF |
| **G5** | **Vercel ISR cache invalidation on stock change** | Prices visible to anonymous → if stock changes / price changes / product hidden, Vercel cache shows stale data. Mega-spec doesn't enumerate the purge chain | §4.6 — `dinoco_home_v2_vercel_isr_purge_cron` consumes queue of `{tag: 'product-{sku}', op: 'revalidate'}` events written by hook listeners on `dinoco_product_updated` / `dinoco_stock_changed` / `dinoco_product_hidden` |
| **G6** | **Member Dashboard banner deep-link from Home** | Logged-in user hero card "ประกันของคุณ X รายการ" must deep-link to existing Member Dashboard — but session must transfer + which tab? Mega-spec §6.3 vague | §2.2 + §6.1 — deep-link to `/dashboard` with hash param `#assets` to scroll to Assets List section; existing dashboard shortcode handles. Banner click counts as `home_v2_dashboard_deeplink` audit event |
| **G7** | **Lead form prefill from product page context** | Customer browses /product/{sku} → clicks ติดต่อตัวแทน → modal opens. Mega-spec §19.2 doesn't say modal prefills product_sku + motorcycle_model from page context | §2.1 — modal accepts `data-source-sku` + `data-source-model` from trigger button → prefills + locks those 2 fields (customer can still change). Lead row stores `source: 'product_detail'` with `product_sku` populated |
| **G8** | **OpenClaw lead ingest from Home V2 vs existing chatbot conversation** | Existing OpenClaw lead pipeline V.2.0 has auto-lead from chatbot text. Home V2 form is a separate ingest path. Both must coexist + dedupe | §4.8 — new `source=dinoco_home_v2` discriminator in OpenClaw `lead-pipeline.js`. Dedupe rule: same phone + same product_sku + within 24hr = merge into existing lead. WP idempotency-key chain ensures no duplicate `wp_dinoco_home_v2_leads` rows |
| **G9** | **Module Registry surfacing for 4 new admin tools** | Mega-spec creates 4 new admin shortcodes but doesn't say where they appear in Admin Dashboard sidebar | §6.2 — register all 4 in Module Registry section='customer-facing' with sort_order 30-33: Featured Curation / Dealer Geo / Lead Inbox / Master Flag. Update Admin Dashboard V.35.0 emergency-fallback map (`feedback_master_flag_design_checklist.md` axis 4) |
| **G10** | **Telegram alert flood control on SLA miss** | Boss-locked: "miss → both auto-reassign + Telegram boss alert". If 10 leads breach SLA in 1hr → 10 Telegram messages = noise. Mega-spec doesn't address dedup | §4.7 — `b2b_tg_send_dedup('dealer_sla_missed_dealer_{id}', $msg, 4hr_TTL)` per dealer (4hr window) + digest mode: ≥3 misses in 1hr coalesces into single "🚨 ดีลเลอร์ {id} miss SLA 3 leads ใน 1hr" message |

---

## Sign-off

- [ ] Boss approves this integration-complete spec as authoritative for LT-3
- [ ] Boss confirms 10 Q-LT-3-* decisions from mega-spec §16 (or accepts defaults)
- [ ] Boss approves prerequisites in §6.4 (Vercel + DNS + Maps key + Turnstile + GA4 + OpenClaw endpoint)
- [ ] Boss decides: complete dead-workflow Phase 1 P0 fixes (60h) BEFORE LT-3 kickoff?
- [ ] Boss confirms 12-14 week / 480-560h dev commitment
- [ ] Boss-locked decisions in this spec (SLA 4hr, retention 12mo, auto-suspend 40%, TOP NAV locator, prices visible) approved binding

**Next**: Boss sign-off → LT-3.1 Foundation kickoff → see [`LT-3-IMPLEMENTATION-PLAN.md`](./LT-3-IMPLEMENTATION-PLAN.md) for week-by-week execution + dependency tracker + sign-off blocks.
