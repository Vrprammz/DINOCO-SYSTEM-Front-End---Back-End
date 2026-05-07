# 🎁 Phase 5 W15-W18 — F#8 Extension Marketplace (Q6 binding)

**Date**: 2026-05-07 (preparation)
**Plan**: v2.13 §Phase 5 W15-W18
**Boss bindings**: Q6 "B แต่ทำให้ละเอียดที่สุด" + Q7 reuse Slip2Go + Q8 per-SKU manual + Q20 manual refund

---

## 🎯 Phase 5 scope summary

Customer can **buy warranty extension** when warranty is near expiry or expired (≤30d grace).
4-stage LIFF flow: plan select → payment QR → upload slip → success.

**Boss bindings (binding):**
- **Q6**: "B" = original Phase 5 placement maintained, but "ทำให้ละเอียดที่สุด" — most detailed possible UX/spec
- **Q7**: Payment = bank transfer + Slip2Go verification ONLY (reuse `B2B_SLIP2GO_SECRET_KEY` + `B2B_BANK_*`). NO LINE Pay / SCB integration.
- **Q8**: Pricing = per-SKU manual (admin enters 1y/2y/3y price per SKU). NULL = option not offered.
- **Q20**: Refund = manual via Admin Facebook + Backend approve button + 4-eyes ฿5K threshold.

**Effective duration**: 4 wk · ~80h (W15: 40h schema+endpoints+UI / W16: 20h payment+slip / W17: 10h receipt+refund+lock / W18: 10h beta+launch)

---

## ✅ Status check (existing infrastructure)

**ALREADY DONE**:
- ✅ Schema `wp_dinoco_sn_warranty_extensions` (Phase 1 W2 — 13 cols) installed via Manager V.0.4 dbDelta
- ✅ ALTER `wp_dinoco_products` +`sn_ext_price_1y/2y/3y` (Q6 replan doc 08) — needs verification
- ✅ Helper stubs `dinoco_sn_get_extension_price($sku, $years)` + `dinoco_sn_extension_available($sku)` (REST API V.0.16)

**REMAINING TASKS** (Phase 5):

---

## 📐 W15 — Backend + Admin UI + Customer LIFF (~40h)

### W15.1 — Schema verification + admin pricing UI

ALTER `wp_dinoco_products` confirm 3 cols exist:
- `sn_ext_price_1y DECIMAL(10,2) NULL`
- `sn_ext_price_2y DECIMAL(10,2) NULL`
- `sn_ext_price_3y DECIMAL(10,2) NULL`
- INDEX `idx_sn_ext_enabled (sn_ext_price_1y)`

Manager NEW Tab 11 "💎 Marketplace" sub-tab "Pricing" — admin sets per-SKU 1y/2y/3y prices:
- Table: SKU, name, retail price, ext_price_1y input, ext_price_2y, ext_price_3y, status (active/disabled)
- "💾 บันทึก" inline save per row (debounced 500ms) → REST `POST /marketplace/pricing/{sku}`
- Filter: only show SKUs with `sn_attach_level != 'none'` (only plate-bearing SKUs eligible)
- Bulk action: copy from another SKU + apply formula (% of retail) shortcut
- Audit: log every price change (actor + old_price + new_price)

### W15.2 — Customer LIFF — `[dinoco_warranty_extend]` shortcode + LIFF route `/warranty/extend?sn=...`

NEW snippet `[System] DINOCO Warranty Extension Marketplace` V.0.1.

4-stage UI (mobile-first):

**Stage 1 — Plan select:**
- Verify ownership: sn_pool.registered_user_id === current uid (else 403 + "เพลทนี้ไม่ใช่ของคุณ")
- Verify status: `registered` only (claimed/voided/recalled/transferred → block + reason)
- Verify warranty period: not yet expired OR within grace (default 30d post-expiry)
- Show product info + current warranty end date
- Plan options: 1y / 2y / 3y (only if `sn_ext_price_Ny != NULL`)
- Highlight "🔥 แนะนำ" on best-value plan (most savings %)
- Show coupon code input (optional — links to existing F#1 promo system)
- Total breakdown: subtotal + VAT 7% + discount + final
- CTA "ดำเนินการชำระเงิน ▶"

**Stage 2 — Payment instructions:**
- PromptPay QR generation (reuse existing GD pattern from B2B Snippet 10) for amount due
- Bank transfer info: account number + holder name + bank logo
- Countdown 24-hour expiry timer (auto-cancel if no slip uploaded)
- "📤 อัพโหลดสลิป" CTA → file picker (image/* + max 5MB)

**Stage 3 — Slip upload + verification:**
- Upload to WP media library (logged-in user)
- POST `/marketplace/checkout/{extension_id}/upload-slip` → triggers Slip2Go verify (reuse `b2b_verify_slip_image` from B2B Snippet 1)
- Slip2Go response: amount match ±2% + bank match → auto-approve OR pending admin review
- "⏳ ตรวจสอบสลิป..." loading state + auto-poll every 10s

**Stage 4 — Success / pending:**
- Auto-approved: "✅ ต่อประกันสำเร็จ! ประกันใหม่ถึง <new_date>" + receipt download + LINE Flex push
- Pending review: "⏳ รอแอดมินตรวจสอบ 2-4 ชม." + LINE auto-notify when approved

### W15.3 — REST endpoints (4 customer + 4 admin)

Customer (require LINE OAuth + WP user):
- `GET /marketplace/quote?sn=...&years=1` — return `{base_price, vat, discount_if_any, total, current_warranty_end, new_warranty_end}` validated against ownership + status
- `POST /marketplace/checkout` — body `{sn, years, coupon_code}` → create extension row status=`pending_payment` + return PromptPay QR data + bank info + extension_id
- `POST /marketplace/checkout/{id}/upload-slip` — body `{slip_image_id}` → verify via Slip2Go + flip status `paid` (auto) or `pending_admin_review` + return current state
- `GET /marketplace/{id}/receipt` — return PDF download URL (gated to owner)

Admin (require `dinoco_sn_perm_admin`):
- `POST /marketplace/pricing/{sku}` — set/update 1y/2y/3y prices
- `GET /marketplace/pending-review` — list pending_admin_review extensions (paginated)
- `POST /marketplace/{id}/approve` — manual admin approve + flip status=paid + apply warranty extension
- `POST /marketplace/{id}/reject` — admin reject + reason + flip status=rejected + customer LINE notify

All POST endpoints wrapped with idempotency helper (Round 30+ pattern).

### W15.4 — Apply extension atomic transaction

When status flips to `paid`:
1. GET_LOCK `dinoco_sn_extend_{sn}` 5s
2. START TRANSACTION
3. SELECT FOR UPDATE on sn_pool[sn] — verify status=registered
4. SELECT FOR UPDATE on warranty_registration CPT — fetch current `warranty_until`
5. Compute `new_warranty_until = current + N years` (using months math for accuracy)
6. UPDATE warranty_registration.warranty_until = new
7. UPDATE sn_warranty_extensions row → paid_at + warranty_until_old + warranty_until_new
8. INSERT audit row (event_type='warranty_extended')
9. COMMIT
10. RELEASE_LOCK
11. Async: render receipt PDF + LINE Flex push

### W15.5 — Admin marketplace tab

Manager NEW Tab 11 "💎 Marketplace" sub-tabs:
- **Pricing** (W15.1) — per-SKU price config
- **Pending Review** — slip review queue with image preview + "✅ Approve" / "❌ Reject" buttons
- **All Transactions** — full history filterable (status, date range, SKU)
- **Refunds (W17)** — Q20 manual refund queue

### W15.6 — Admin Facebook bridge (Q20)

When customer DMs Admin Facebook asking for refund:
- Admin opens Manager Tab 11 → Refunds → "🔍 ค้นหา" by sn or extension_id
- Click row → modal "💸 คืนเงิน" with reason + refund amount input
- < ฿5K → single admin approve (audit log)
- ≥ ฿5K → 4-eyes (existing Approval Workflow snippet)
- On approve: flip status=refunded + revert warranty_until + LINE Flex notify customer + email

---

## 📐 W16 — Payment Integration (~20h)

### W16.1 — PromptPay QR generation

Reuse `b2b_generate_promptpay_qr($amount, $reference)` from B2B Snippet 1 (existing pattern). Store reference = `EXT-{extension_id}` for matching.

### W16.2 — Slip2Go verify integration

Reuse `b2b_verify_slip_image($image_url, $expected_amount)` from B2B Snippet 1. Slip2Go response checks:
- Amount match ±2%
- Bank account match (`B2B_BANK_*` constants)
- Date within 24h of QR generation
- Reference text contains EXT-{id} (best-effort, not strict)

If verify pass → auto-approve. Else → flag pending_admin_review.

### W16.3 — Pending payment timeout (15min auto-cancel for QR not yet uploaded)

NEW cron `dinoco_sn_marketplace_timeout_cron` (every 5 min):
- Query extensions where status=pending_payment + created_at > 24hr ago + slip_image_id IS NULL
- Flip status=expired + customer LINE notify
- Heartbeat: `dinoco_cron_sn_marketplace_timeout_last_run`

### W16.4 — Webhook handlers (defensive)

POST `/marketplace/webhook/slip-verify-callback` — accepts Slip2Go async callback IF Slip2Go supports it. Signature verify + idempotency. Falls back to polling if not supported.

---

## 📐 W17 — Receipt + Compliance + Refund + Concurrent Lock (~10h)

### W17.1 — Tax invoice PDF render

Extend `[B2B] Snippet 10` Invoice Image Generator V.30.x → V.31.x:
- NEW template `warranty_extension_receipt.html` — includes VAT 7% breakdown + tax invoice number (sequential `INV-EXT-YYYY-NNNNN`)
- Reuse GD font + RPi pattern
- Output PNG (admin) + PDF (customer download)
- Send via LINE Flex card on payment success

### W17.2 — Refund flow (Q20 manual)

Schema NEW field `wp_dinoco_sn_warranty_extensions.refund_*`:
- `refunded_at DATETIME NULL`
- `refund_reason VARCHAR(255) NULL`
- `refund_amount DECIMAL(10,2) NULL` (might be partial)
- `refunded_by BIGINT UNSIGNED NULL`
- `refund_approver BIGINT UNSIGNED NULL` (4-eyes if ≥ ฿5K)

Cascade: revert warranty_until from new → old + audit row + LINE customer notify.

### W17.3 — Concurrent extension lock per S/N

Already covered in W15.4 atomic transaction. Add test scenario for 2 admins approving same extension simultaneously → second one gets 409.

### W17.4 — Audit log every transaction

Use existing `dinoco_sn_audit_log()` pattern. Event types:
- `extension_created` (status=pending_payment)
- `extension_paid` (auto or admin approve)
- `extension_warranty_extended` (atomic apply success)
- `extension_refunded` (Q20)
- `extension_rejected` (admin reject)
- `extension_expired` (cron timeout)

---

## 📐 W18 — Beta + Launch + Monitor (~10h)

### W18.1 — 10-customer beta test

Boss handpick 10 customers with warranty near expiry → manually create extension records in Tab 11 staging mode → invite to test full flow.

### W18.2 — Bug fix + edge cases

Common edge cases:
- Customer changes phone mid-flow → session preserved via LINE OAuth state
- Network drop during slip upload → resume from extension_id (don't re-create row)
- Slip image too large → client-side compress before upload
- Slip2Go API outage → graceful fallback to admin manual review

### W18.3 — Public launch announcement

Tab 11 master toggle `dinoco_sn_marketplace_enabled` flag flip ON. LINE broadcast to all customers with active warranty.

### W18.4 — First-week monitor

Track in `dinoco_sn_phase5_kpi_baseline`:
- Total extensions sold
- Average ticket value
- Slip2Go auto-approve rate vs admin review rate
- Refund rate
- Conversion rate (LIFF visit → purchase)

---

## 📅 Phase 5 sprint summary

| Sub-task | Status |
|---|---|
| W15.1 Schema + admin pricing UI | ⏸️ Pending |
| W15.2 Customer LIFF 4-stage | ⏸️ Pending |
| W15.3 REST endpoints (4+4) | ⏸️ Pending |
| W15.4 Apply extension atomic txn | ⏸️ Pending |
| W15.5 Admin marketplace tab | ⏸️ Pending |
| W15.6 Admin Facebook bridge (Q20) | ⏸️ Pending |
| W16.1 PromptPay QR | ⏸️ Pending |
| W16.2 Slip2Go verify | ⏸️ Pending |
| W16.3 Pending payment timeout cron | ⏸️ Pending |
| W17.1 Tax invoice PDF | ⏸️ Pending |
| W17.2 Refund flow + cascade | ⏸️ Pending |
| W18 Beta + launch + monitor | ⏸️ Pending |

**Total Phase 5 effort**: ~80h dev + 4 wk timeline.

---

## 🔗 Cross-references

- `docs/sn-system/08-f8-extension-marketplace-q6-q8-q7-q20-replan.md` — original Q6 replan
- `docs/sn-system/07-boss-decisions-log.md` Q6/Q7/Q8/Q20
- `docs/sn-system/21-phase4-w14.5-acceptance-test.md` — Phase 4 closure
- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13 §Phase 5
- `[Admin System] DINOCO Production SN Manager` V.0.30 — schema + helpers
- `[System] DINOCO SN REST API` V.0.23 — extension price stubs
- `[B2B] Snippet 1` — Slip2Go + PromptPay reuse
- `[B2B] Snippet 10` — Invoice Image Generator extension target
- `[Admin System] DINOCO SN Approval Workflow` V.0.1 — 4-eyes for ≥฿5K refunds
