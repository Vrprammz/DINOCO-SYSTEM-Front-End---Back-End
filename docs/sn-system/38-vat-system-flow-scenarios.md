# 38 — VAT Compliance System V.1.0 — Customer Flow + Edge Case Scenarios

Companion document to `37-vat-compliance-system.md` (architecture). This file traces every customer + admin journey end-to-end and documents the edge cases discovered during R1/R2/R3 audit campaign — what they do, why they exist, and how the system responds.

## 1. Happy Path — B2C single-plate extension

**Actor**: Customer (LINE-logged-in member)
**Goal**: Extend warranty 1 year on `DNCSS123456` (leaf plate, individual purchase)

```
1. Customer scans QR on plate → LIFF /warranty/extend?sn=DNCSS123456
   ↓
2. LIFF calls GET /dinoco-sn/v1/marketplace/quote?sn=DNCSS123456&years=1
   → Returns: { renewable_sku: 'DNCSS123456', price: 500, vat_rate: 7.0,
                vat_amount: 32.71, base_pre_vat: 467.29, plate_count: 1,
                set_context: false }
   ↓
3. Customer picks plan + applies coupon → "ต่อ 1 ปี ฿500" displayed
   (LIFF total-vat-line row: "VAT 7% ฿32.71")
   ↓
4. POST /dinoco-sn/v1/marketplace/checkout
   { sn, years: 1, plan_id, coupon_code, payment_method: 'promptpay' }
   ↓
5. INSERT wp_dinoco_sn_warranty_extensions:
     payment_status='pending_payment', payment_ref=EXT-{uid}-DNCSS12-{ts8},
     price_paid=500.00, vat_rate=7.0, vat_amount=32.71, base_pre_vat=467.29
   ↓
6. Customer pays PromptPay slip → uploads to admin LINE group
   ↓
7. Admin verifies slip via existing Slip Monitor → payment_status='paid', paid_at=NOW
   ↓
8. apply_warranty_extension($ext_id) fires:
     - Atomic warranty extend: get_field('warranty_until', plate) + INTERVAL 1 YEAR
     - SET fan-out: skipped (single-plate, top_set_sku=NULL)
     - Audit event 'warranty_extended' (sensitive=true, 5y retention)
     - wp_schedule_single_event('dinoco_sn_marketplace_receipt_async', $ext_id) +5s
   ↓
9. Cron fires → dinoco_vat_push_send_receipt($ext_id):
     - Idempotency check: get_transient('dinoco_vat_pushed_' . $ext_id) → false (first time)
     - Eligibility: paid + dinoco_vat_is_active() → true
     - Render PNG 800×1130 with DINOCO logo + tax_id + customer + item + totals
     - Persist: /uploads/dinoco-vat-receipts/EXT123-VR-2605-00001-{24hex_hmac}.png
     - Build Flex 3-section bubble (header navy + body image + footer button)
     - Push via b2b_push_guaranteed → customer LINE
     - Audit event 'vat_receipt_pushed' (line_uid masked, PP30 filter key)
     - set_transient('dinoco_vat_pushed_' . $ext_id, '1', 30 days)
   ↓
10. End-of-month: Admin Dashboard → การเงิน → VAT รายเดือน
    → Pick May 2026 → POST /export/csv → Download
    → CSV contains EXT123 (filtered by sn_audit vat_receipt_pushed EXISTS)
    → Forward to นักบัญชี → file PP30 with Revenue Department by 15th of next month
```

**Customer-visible artifacts**: LINE Flex receipt + full HTML version (clickable from footer button) + clean download via "📄 ดูใบกำกับภาษีฉบับเต็ม".

## 2. Edge case — SET-context renewal (boss policy fan-out)

**Actor**: Customer who bought `DNCSETNX500EX001` (SET = 4 leaves: DNCNX500E001, DNCNX500E002, DNCSS-LEFT-IRONB, DNCSS-RIGHT-IRONB)
**Goal**: Extend warranty 1 year — boss decision "ต่อเป็นชุดถ้าซื้อเป็นชุด"

```
1. Customer scans ANY of the 4 plates → LIFF /warranty/extend?sn=DNCNX500E001
   ↓
2. GET /marketplace/quote?sn=DNCNX500E001&years=1
   → dinoco_sn_get_renewable_sku(row): top_set_sku='DNCSETNX500EX001' → use SET SKU
   → renewable_sku='DNCSETNX500EX001', plate_count: 4, set_context: true
   → price = SET pricing (per-SKU admin config: ฿1,500/year for this SET)
   → Returns: { renewable_sku: 'DNCSETNX500EX001', price: 1500,
                plate_count: 4, set_context: true,
                set_siblings: [DNCNX500E001, DNCNX500E002, DNCSS-LEFT-IRONB, DNCSS-RIGHT-IRONB] }
   ↓
3. LIFF displays SET-context banner: "🔗 ต่ออายุเป็นชุด — เพลทนี้อยู่ในชุดสินค้า (4 ชิ้น)"
   ↓
4. POST /marketplace/checkout (renewable_sku=SET, scanned_sn=DNCNX500E001)
   ↓
5. INSERT wp_dinoco_sn_warranty_extensions:
     sn=DNCNX500E001 (scan trigger), renewable_sku=DNCSETNX500EX001,
     price_paid=1500.00, is_set_context=true
   ↓
6-7. (Same as happy path)
   ↓
8. apply_warranty_extension($ext_id) — SET fan-out kicks in:
     - Pre-fetch siblings via wp_postmeta SELECT ... WHERE meta_key='top_set_sku'
       AND meta_value='DNCSETNX500EX001' FOR UPDATE (atomic, H-1 review fix)
     - For each sibling plate: update warranty_until → max(current, scan.new_until)
       (skip-if-longer guard: protect legacy per-leaf renewals)
     - wp_cache_delete per plate after wpdb->update
     - Audit event 'warranty_extended_set_fanout' with sibling_count=4
   ↓
9. Receipt cron fires (single receipt for ฿1,500, NOT 4 receipts):
     - Receipt line item: "ต่ออายุประกัน 1 ปี — DINOCO Crash Bar NX500 IRONB (ชุด 4 ชิ้น)"
     - PNG + Flex push (same as happy path) — ONE PP30 row
```

**Why one receipt not four**: Boss directive 2026-05-18 — "ต่อ 4 ชิ้นจ่ายแยก 4 บิลก็ไม่ make sense". Single transaction → single receipt → single PP30 entry for accountant.

## 3. Edge case — Master flag OFF window

**Scenario**: Boss flips `dinoco_vat_master_enabled` OFF temporarily (compliance review, bug investigation, etc.). Customer pays during this window.

```
1-5. (Same as happy path until INSERT wp_dinoco_sn_warranty_extensions)
   ↓
6. Admin verifies slip → payment_status='paid'
   ↓
7. apply_warranty_extension fires → warranty extended normally (B2B flow unaffected)
   ↓
8. dinoco_vat_push_send_receipt eligibility check:
     - dinoco_vat_is_active() → false (master OFF)
     - eligibility.reason='vat_master_disabled'
     - SKIP push, NO receipt issued, NO sn_audit 'vat_receipt_pushed' event
     - Log: "VAT push skipped: master flag OFF"
   ↓
9. Customer DOES NOT receive receipt Flex (this is intentional — we're not VAT-compliant during OFF window)
   ↓
10. Boss flips master ON later same day
   ↓
11. End-of-month CSV export:
    - Query filters by `sn_audit event_type='vat_receipt_pushed' EXISTS`
    - Extensions during OFF window have NO such audit event → EXCLUDED from PP30
    - DECLARED VAT revenue MATCHES customer receipts issued (Revenue Dept won't reject)
```

**Critical compliance property**: PP30 declared total = sum of receipts actually issued. NEVER include unreceipted revenue. This is C1 from R2 audit (was a CRIT bug pre-fix — V.1.4 export query previously listed ALL paid extensions).

**Customer-facing UX gap (acceptable trade-off)**: Customer paid but didn't get receipt. Admin can manually re-issue via `POST /dinoco-vat/v1/resend/{id}` after master flag ON (transient cleared first).

## 4. Edge case — Resend after admin-fix

**Scenario**: Admin discovered Receipt PNG had wrong company address (typo in tax setup). Fixed setting, needs to re-push receipt to specific customer.

```
1. Admin: Marketplace Tools UI → Section 2 (VAT Info) → fix typo → save
   ↓
2. Admin: VAT Monthly Export → find extension EXT123 → click "ส่งใหม่"
   → POST /dinoco-vat/v1/resend/123
   ↓
3. Resend endpoint:
   - Permission: manage_options
   - Clear transient: delete_transient('dinoco_vat_pushed_123')
   - Call dinoco_vat_push_send_receipt(123) fresh
   - New PNG rendered with corrected address (HMAC token regenerated — old URL invalidated)
   - New Flex pushed to customer
   - sn_audit event 'vat_receipt_resent' (admin user_id logged)
   ↓
4. Customer receives NEW Flex with corrected receipt
   ↓
5. Old PNG file on disk: NOT deleted (audit trail). Old URL still works if customer saved it.
   (PDPA risk: minimal — HMAC token unguessable, only direct URL holder retains access)
```

**Why not delete old PNG**: Audit trail. If customer downloaded old version and there's a dispute, the file must remain accessible to admin via UNC path. Public access still gated by 24-char HMAC token in filename.

## 5. Edge case — Customer-initiated CSV download (NOT SUPPORTED)

**Scenario**: Customer asks "can I download my own monthly VAT CSV?"

**Answer**: NO. CSV export = admin-only (`/export/csv` permission_callback=`manage_options`). Customer gets:
- Individual receipts via LINE Flex (auto-pushed)
- Re-download single receipt via `GET /dinoco-vat/v1/receipt/{id}` (owner-or-admin permission)
- Full HTML version via Flex footer button

Bulk CSV export is for accountant filing PP30 only. Customer use case = single receipt re-download, never bulk.

## 6. Edge case — Refund (manual SOP per Q20)

**Scenario**: Customer paid extension by mistake, requests refund within 7 days.

```
1. Customer messages Facebook → admin verifies eligibility (no claim submitted yet)
   ↓
2. 4-eyes approval (per Q15 R2): if amount ≥ ฿5,000 → second admin approves
   ↓
3. Admin SQL (manual, NOT REST):
   - Revert warranty_until on plate(s) — SET fan-out aware
   - UPDATE wp_dinoco_sn_warranty_extensions SET payment_status='refunded', refund_at=NOW
   - INSERT sn_audit event_type='warranty_extension_refunded'
   ↓
4. Receipt PNG stays on disk (audit trail). Customer's Flex receipt NOT recalled (LINE doesn't support).
   ↓
5. Month-end CSV:
   - Query filter `sn_audit event_type='vat_receipt_pushed' EXISTS` is STILL TRUE for this extension
   - Refunded extension SHOULD appear in CSV with `payment_status='refunded'` indicator
   - Admin manually issues correction note (ใบลดหนี้) to file with PP30
   - Cross-reference to original receipt_no preserved
```

**TODO** (Phase 2 improvement): Auto-detect refunded extensions in CSV → emit "ใบลดหนี้ N รายการ" column. For now, accountant filters CSV by `payment_status` manually. Documented in 26-operations-pending-decisions.md as deferred work.

## 7. Edge case — Mid-month flag flip-flap (admin testing)

**Scenario**: Admin flips master flag ON 2026-05-10 → tests with one purchase → flips OFF same day → flips ON again 2026-05-15. Three customer purchases during May:
- A: 2026-05-08 (master OFF when paid)
- B: 2026-05-12 (master ON when paid, between flips)
- C: 2026-05-20 (master ON when paid)

```
Receipt-issued state:
- A: sn_audit 'vat_receipt_pushed' = NO (skipped — master OFF at push time)
- B: sn_audit 'vat_receipt_pushed' = YES (pushed at 2026-05-12)
- C: sn_audit 'vat_receipt_pushed' = YES (pushed at 2026-05-20)

May 2026 CSV query (EXISTS sn_audit vat_receipt_pushed):
- A: EXCLUDED (no receipt issued, no PP30 entry needed)
- B: INCLUDED (receipt issued with valid receipt_no)
- C: INCLUDED

Result: CSV reconciles cleanly. A's revenue is income but not VAT-declared.
Boss must decide whether to issue A's receipt retroactively via /resend OR
absorb as "non-VAT period income" (depends on legal advice).
```

**Critical property**: Master flag flip-flap is RECOVERABLE. PP30 query never lies — every CSV row maps 1:1 to an actually-issued receipt PNG file on disk + LINE Flex pushed event.

## 8. Edge case — Cron re-fire (idempotency)

**Scenario**: WP-Cron fires `dinoco_sn_marketplace_receipt_async` twice for same `$ext_id` (race condition, double-scheduled, or admin manual trigger).

```
First fire (T+5s after paid):
1. dinoco_vat_push_send_receipt(123):
   - get_transient('dinoco_vat_pushed_123') → false
   - Render PNG → persist → push Flex
   - set_transient('dinoco_vat_pushed_123', '1', 30 days)
   - sn_audit 'vat_receipt_pushed' INSERT (once)

Second fire (any time within 30 days):
2. dinoco_vat_push_send_receipt(123):
   - get_transient('dinoco_vat_pushed_123') → '1' (set)
   - SKIP rendering + pushing
   - Log: "VAT push idempotent skip: already sent ext_id=123"
   - sn_audit event NOT inserted (no duplicate row)
```

**Why transient not postmeta**: Transient = ephemeral by design, 30-day TTL aligns with Revenue Dept dispute window. After 30 days, second fire would re-push (which is safe — admin can resend anyway via UI).

## 9. Edge case — PDPA anonymous PNG access attempt

**Attack scenario**: Bad actor knows extension IDs are auto-increment, tries `https://dinoco.in.th/wp-content/uploads/dinoco-vat-receipts/1-VR-2605-00001.png` to enumerate all customers.

```
1. Attacker GET /uploads/dinoco-vat-receipts/1-VR-2605-00001.png
   → Apache evaluates .htaccess in directory:
     <Files "*.png">
         Deny from all
     </Files>
   → HTTP 403 Forbidden
   ↓
2. Attacker GET /uploads/dinoco-vat-receipts/   (try directory listing)
   → /uploads/dinoco-vat-receipts/index.php exists (silence file):
     <?php // Silence is golden.
   → HTTP 200 empty page (no listing)
   ↓
3. Attacker tries REST API: GET /dinoco-vat/v1/receipt/1
   → permission_callback: is_user_logged_in() OR admin
   → NOT logged in → WP_Error 'rest_not_logged_in' (HTTP 404, anti-enumeration)
   → Even if logged in: owner-check fail → HTTP 404 (NOT 403)
   → Cannot distinguish "doesn't exist" from "not yours" → no oracle
   ↓
4. Attacker rate-limit hit: b2b_rate_limit('vat_receipt_pull', $ip, 30, 60s)
   → After 30 requests/min → HTTP 429 + Telegram alert to admin
```

**Defense in depth**:
- HMAC token in filename (120-bit entropy — 16-char Crockford = ~80 bit, 24-char = ~120 bit)
- .htaccess Deny All (Apache layer)
- index.php silence file (directory listing)
- REST 404 collapse (no info leak)
- Rate limit + alert (active attack detection)

## 10. Edge case — Receipt rendering fail (GD library missing)

**Scenario**: Server admin upgrades PHP, forgets `apt install php-gd` → `imagecreate()` undefined.

```
1. Cron fires → dinoco_vat_push_send_receipt(123)
   ↓
2. PNG render path:
   - try { $img = imagecreatetruecolor(800, 1130); ... }
   - catch (\Throwable $e) {
       dinoco_obs_capture($e, ['context' => 'vat_render_png', 'ext_id' => 123]);
       error_log('[VAT] PNG render failed: ' . $e->getMessage());
       return new WP_Error('render_failed', 'GD library not available');
     }
   ↓
3. Push aborted, transient NOT set (so retry will happen on next cron tick)
   ↓
4. Telegram alert to admin (Phase 1 W4 wired): "VAT receipt render failed ext_id=123"
   ↓
5. Admin sees alert → installs php-gd → restarts php-fpm
   ↓
6. Manual resend: POST /dinoco-vat/v1/resend/123 → succeeds
```

**Failure mode is visible**: We never want silent failure on financial documents. Sentry + Telegram + error_log triple-layer alert.

## 11. Edge case — LINE push failure (customer blocked bot)

**Scenario**: Customer blocked the DINOCO LINE OA but still paid (legacy customer flow).

```
1. Receipt cron renders PNG successfully → persists file
   ↓
2. b2b_push_guaranteed($line_uid, $flex_message, 0, 'vat_receipt_extension'):
   - LINE API returns HTTP 400 / 403 / "user blocked the bot"
   - b2b_push_guaranteed queues retry (existing infra)
   - After 5 retries fail → "GAVE UP" alert to admin
   ↓
3. Customer DOES NOT receive Flex but PNG file exists on disk with valid HMAC URL
   ↓
4. Admin sees GAVE UP alert → manually shares HTML version URL via Facebook
   OR re-issues to alternate channel
   ↓
5. sn_audit event 'vat_receipt_pushed' still INSERTED (push attempted, file exists,
   PP30 inclusion correct even though customer didn't see it)
```

**Why audit event despite failure**: PP30 reconciliation property = "receipt issued" not "receipt seen by customer". File exists + HMAC URL accessible = receipt issued. Customer-side delivery failure is operational, not compliance.

## 12. Reference — REST endpoint summary table

| Endpoint | Method | Auth | When called | Idempotent |
|---|---|---|---|---|
| `/marketplace/quote` | GET | logged-in | LIFF render | Yes (read-only) |
| `/marketplace/checkout` | POST | logged-in | Customer pays | Idempotency-Key header |
| `/marketplace/upload-slip` | POST | logged-in | Customer slip | Idempotency-Key header |
| `/marketplace/status` | GET | logged-in | LIFF polling | Yes (read-only) |
| `/dinoco-vat/v1/receipt/{id}` | GET | owner+admin | Customer re-download | Yes (read-only) |
| `/dinoco-vat/v1/check/{id}` | GET | admin | Diagnostic | Yes (read-only) |
| `/dinoco-vat/v1/resend/{id}` | POST | admin | Manual re-push | Yes (idempotent — clears transient) |
| `/dinoco-vat/v1/push-dry-run/{id}` | GET | admin | Test without push | Yes (read-only) |
| `/dinoco-vat/v1/export/summary` | GET | admin | Monthly totals | Yes (read-only) |
| `/dinoco-vat/v1/export/rows` | GET | admin | Detailed preview | Yes (read-only) |
| `/dinoco-vat/v1/export/csv` | GET\|POST | admin | CSV download | Yes (read-only) |
| `/dinoco-marketplace-tools/v1/vat-toggle` | POST | admin | Master flag flip | Yes (state-set, not transition) |
| `/dinoco-marketplace-tools/v1/vat-set` | POST | admin | Set single field | Yes (last-write-wins) |
| `/dinoco-marketplace-tools/v1/vat-set-bulk` | POST | admin | Set all fields | Yes (last-write-wins) |
| `/dinoco-marketplace-tools/v1/diagnose` | GET | admin | Full system state | Yes (read-only) |

## 13. Cross-references

- `37-vat-compliance-system.md` — System architecture + data flow
- `docs/audit/VAT-SYSTEM-AUDIT-2026-05-18.md` — Audit campaign (3 rounds + 30+ findings)
- `docs/runbooks/VAT-ACTIVATION-BOSS-GUIDE.md` — Boss step-by-step activation
- `project_vat_system_live.md` (memory) — Production state
- `feedback_master_flag_design_checklist.md` (memory) — Anti-regression checklist
- `project_extension_renewal_policy.md` (memory) — SET fan-out boss decision
- `project_vat_policy_split.md` (memory) — B2C VAT 7% / B2B non-VAT boss decision
