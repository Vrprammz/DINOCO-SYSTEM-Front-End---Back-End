# Boss Final Decisions Log — 2026-05-15

[← SN System docs](./README.md)

> **Status**: BINDING — supersedes all earlier "pending boss decisions" in docs 04 / 06 / 14 / 16 / 19 / 20 / 26 / 28 / 29 / 30 / 31 / 32. All 6 open items closed in single conversation 2026-05-15.

## Summary

6 open items closed in one round of Q&A. **All items either DONE or ACTIONABLE within 1 dev day** — no more boss-blocked items remain in SN system roadmap.

| # | Question | Boss Answer | Action |
|---|---|---|---|
| 1 | F#8 Extension Marketplace — Legal workstream / VAT / tax invoice format? | **ใช้ non-VAT บัญชีบุคคล** | **CANCEL** legal workstream; **DROP** VAT calculation; **DROP** tax invoice format; simplify scope |
| 2 | F#1-F#5 SN notifications — when to flip flag ON? | **เปิดได้เลย** | Flip 5 flags ON immediately |
| 3 | SN pilot 100 plate? | **ยกเลิก** (v2.2 simplification — standalone system, dealers not involved) | DELETE pilot plan from docs; document v2.2 reality |
| 4 | Q15 Role Manager — how many admins to seed? | **2 admins, boss seeds himself** | Push Role Manager to production as-is |
| 5 | Q20 Manual Refund flow — train CS team first? | **ทำเลย** | Activate refund flow immediately |
| 6 | F#9 LTV Dashboard — who sees it? | **ใช้สิทธิ์ในระบบที่มีอยู่แล้ว** (role-based) | Standard `dinoco_sn_view_pii` capability gate — no special spec needed |

---

## #1 — F#8 Extension Marketplace SCOPE CHANGE

### Old scope (V.2.13 Phase 5 plan, ~80h dev + legal workstream 8-12wk)

- Bank: ต้องตั้งเลขที่บัญชีบริษัท (jurisdictional registered)
- VAT: คำนวณ VAT 7% บนยอดต่อประกัน
- Tax invoice: ออกใบกำกับภาษีตามรูปแบบกรมสรรพากร (header / number / address / VAT% / VAT amount / Watermark "ต้นฉบับ")
- Refund policy: ลงทะเบียนกับ พ.ร.บ.คุ้มครองผู้บริโภค (อาจต้อง)
- Legal review: payment gateway partnership / tax invoice format approval / refund SLA

### New scope (Boss 2026-05-15: "ใช้ non-VAT บัญชีบุคคล")

- Bank: ใช้บัญชีบุคคลธรรมดา (Slip2Go verify เท่านั้น — เหมือนระบบ B2B/Claim Payment ที่ใช้อยู่)
- VAT: ❌ ไม่มี
- Tax invoice: ❌ ออกแค่ใบเสร็จรับเงิน (ใบเสร็จธรรมดา — ไม่ใช่ใบกำกับภาษี)
- Refund policy: manual flow (Q20) — admin Facebook DM → CS team → admin ยืนยันคืน
- Legal review: ❌ ไม่ต้อง

### Effort impact

- **F#8 Phase 4 W12 effort: 80h → ~30h** (drop legal coordination + VAT calc + tax invoice generator)
- **Legal workstream T-16wk lead time: CANCELLED**
- Boss email template at `docs/sn-system/16-f8-legal-workstream-prephase1.md` = **DEAD CODE — do not send**

### Updated F#8 scope (lean MVP)

1. NEW snippet `[Admin System] DINOCO Warranty Extension Marketplace` (~30h instead of 80h)
2. REST endpoints: `/extension/quote` + `/extension/checkout` + `/extension/slip-upload` + `/extension/admin-verify` + `/extension/refund`
3. Customer LIFF flow:
   - View extension price (admin sets per-SKU manually — Q8 R2)
   - Show bank account (Slip2Go-verifiable account — same pattern as Claim Payment V.0.12)
   - Customer uploads slip → Slip2Go verify → admin manual confirm
4. Admin Service Center "Extension Marketplace" tab
5. Receipt = plain receipt (ใบเสร็จ) generated via existing `b2b_send_invoice_image` pattern (Snippet 10) — NO tax-invoice header / NO VAT line
6. Refund: routes through Q20 manual SOP (admin Facebook DM → confirm in backend)

### Documents to update / cancel

| File | Action |
|---|---|
| `16-f8-legal-workstream-prephase1.md` | **MARK CANCELLED** at top — boss decision 2026-05-15: non-VAT บุคคล, no legal needed |
| `28-refund-policy-warranty-extension.md` | **MERGE INTO 15-q20-manual-refund-sop.md** — single refund flow |
| `29-tax-invoice-format-vat7.md` | **MARK CANCELLED** — no tax invoice for F#8 |
| Plan v2.13 Phase 5 W15-W18 | **REVISE effort**: 80h → 30h; **DROP**: legal track parallel since W1 |

---

## #2 — F#1-F#5 Notifications: FLIP ON

### Status before

5 SN notification flags shipped in code (Notifier V.0.8 + Manager V.0.59):

| Flag | Feature | Cron Schedule |
|---|---|---|
| `dinoco_sn_expiry_reminder_enabled` | F#1 ประกันใกล้หมด (30/7/1 วัน) | daily 02:00 ICT |
| `dinoco_sn_anniversary_enabled` | F#4 anniversary 1y/2y/3y+ | daily 02:05 ICT |
| `dinoco_sn_review_request_enabled` | F#10 ขอรีวิว 30 วันหลัง activate | daily 02:10 ICT |
| `dinoco_sn_cross_sell_enabled` | RD-4 cross-sell (currently scaffolded) | daily 02:15 ICT |
| `dinoco_sn_referral_enabled` | QW-5 refer-a-friend redemption | event-driven (on activate) |
| `dinoco_sn_service_reminder_enabled` | QW-7 smart service reminder (yearly) | daily 02:25 ICT |

All flags default `'0'` (OFF). Boss decision: **เปิดได้เลย**.

### Action — boss runs these wp-cli commands on production

```bash
# F#1 + F#4 + F#10 + QW-7 (4 cron-driven flags)
wp option update dinoco_sn_expiry_reminder_enabled 1
wp option update dinoco_sn_anniversary_enabled 1
wp option update dinoco_sn_review_request_enabled 1
wp option update dinoco_sn_service_reminder_enabled 1

# QW-5 referral (event-driven on activate)
wp option update dinoco_sn_referral_enabled 1

# RD-4 cross-sell — DEFERRED until F#9 LTV snapshot data >= 12mo per boss decision 2026-05-13
# Do NOT flip dinoco_sn_cross_sell_enabled yet — need data first.
```

### Verification after flip

```bash
# Check crons registered:
wp cron event list | grep dinoco_sn

# Expected output: 4 cron events scheduled
# - dinoco_sn_expiry_reminder_cron       02:00 ICT daily
# - dinoco_sn_anniversary_cron           02:05 ICT daily
# - dinoco_sn_review_request_cron        02:10 ICT daily
# - dinoco_sn_service_reminder_cron      02:25 ICT daily

# Monitor first run (~02:00 ICT tonight) via Health Monitor:
wp option get dinoco_cron_sn_expiry_reminder_last_run
wp option get dinoco_cron_sn_anniversary_last_run
wp option get dinoco_cron_sn_review_request_last_run
wp option get dinoco_cron_sn_service_reminder_last_run
```

### Rollback if production issues

```bash
# Instant kill — set all 5 flags back to 0
for f in dinoco_sn_expiry_reminder_enabled dinoco_sn_anniversary_enabled \
         dinoco_sn_review_request_enabled dinoco_sn_referral_enabled \
         dinoco_sn_service_reminder_enabled; do
    wp option update "$f" 0
done
```

LINE quota safety: each cron has max 50 push/run (Premium tier 1,500฿/mo paid per boss Q11 R2). If quota exceeded → check Health Monitor Telegram alert.

---

## #3 — SN Pilot 100 Plate: CANCELLED (was already obsolete)

### Why pilot was planned (v2.0 / v2.1 — superseded)

Old plan: send 100 plates to 5 hand-picked dealers × 20 plates each. Dealers attach plates to products → ship to customers → customers scan QR → activate via LIFF. Validate end-to-end flow before 1,000,000-plate factory batch.

### Why pilot is NOT NEEDED (v2.2 / v2.13 reality)

Boss decision 2026-05-04 (v2.2 simplification — recorded in `docs/sn-system/07-boss-decisions-log.md`):

> "ระบบ S/N ทำงาน standalone ไม่ผูกกับ B2B order flow เลย คลังทำงานเดิม 100%"

This means:
- **Dealers are NOT involved in SN system** — they sell products as usual
- DINOCO warehouse attaches plates to products (no allocate flow)
- Customer scans QR → activates via LIFF directly (no dealer notification)
- Source of truth = customer activate (NOT dealer ship event)

→ Pilot dealer concept is **vestigial from pre-v2.2 plans**

### What replaces pilot

**Internal QA Acceptance Test (`docs/sn-system/11-phase1-w4-internal-qa-acceptance-test.md`)** — 50 test scenarios run by DINOCO admin team on staging:

1. Generate small batch (10-50 plates) in admin panel
2. Print QR PDF + label
3. Attach plates to test products (5-10 SKUs covering set/child/leaf/none levels)
4. Admin scans QR on personal phone → activates via LIFF
5. Verify all flows: lookup / claim / transfer / recall / stolen report
6. Pass → flip flags ON in production

→ Then sั่งโรงงานทำ batch จริง (100k-1M plates) → คลังรับเพลท → ใช้งานจริง

### Documents to update

| File | Action |
|---|---|
| `14-q12-skip-pilot-risk-acceptance.md` | **MARK INFORMATIONAL ONLY** at top — pilot was obsolete after v2.2 simplification. No risk acceptance needed. Internal QA replaces. |
| Plan v2.13 §F.10 "Pilot dealer selection" | **REMOVE** from Phase 0 Pre-Validation week |
| `docs/sn-system/04-open-questions-FOR-BOSS.md` | Mark Q12 CLOSED — pilot cancelled by clarification |

---

## #4 — Q15 Role Manager: PUSH TO PROD (2 admin)

### Boss action

Boss seeds 2 admins via Role Manager matrix UI in WP admin panel:

1. Boss user (manage_options) — gets all 4 SN roles (approver / warehouse / view_pii / readonly)
2. 1 additional admin (boss chooses) — gets roles per business need

### Dev action — flip Role Manager flag

```bash
# Activate Role Manager
wp option update dinoco_sn_role_manager_enabled 1

# Verify
wp option get dinoco_sn_role_manager_enabled
```

### No code changes needed

Role Manager V.0.5 already shipped (`[Admin System] DINOCO User Role Manager`). Matrix UI accessible at admin panel. Boss self-seeds; no UAT script needed for 2-user seed.

### Documents to update

| File | Action |
|---|---|
| `19-q15-role-matrix-uat-plan.md` | **MARK SUPERSEDED** — 10-user UAT plan obsolete; boss seeds 2 admin self-service |

---

## #5 — Q20 Manual Refund SOP: ACTIVATE NOW

### Boss action

"ทำเลย" — activate refund flow immediately. CS team training can run in parallel.

### Dev action — flip refund SOP flag

```bash
# Activate manual refund admin button
wp option update dinoco_sn_manual_refund_enabled 1

# Verify
wp option get dinoco_sn_manual_refund_enabled
```

### CS team training

Documents already prepared:
- `docs/sn-system/15-q20-manual-refund-sop.md` — Facebook DM intake script + escalation L1-L6
- `docs/sn-system/32-cs-training-material-for-boss.md` — Training material for boss to share with CS

→ Boss forwards both docs to CS team via Slack/LINE. No code-side training needed.

### Refund flow active states

1. Customer contacts CS via Facebook Admin → "ขอคืนเงินค่าต่อประกัน"
2. CS team uses intake script → collects: order_id, claim_id, reason, slip image
3. CS escalates to admin Telegram channel
4. Admin opens Service Center → "Manual Refund" action → typed-confirm + 4-eyes approver if ≥฿5K
5. `b2b_debt_subtract` reverses charge + LINE Flex to customer + audit row

---

## #6 — F#9 LTV Dashboard: USE EXISTING ROLE GATES

### Boss answer

> "ยุ่งอะไร มันไปกำหนดสิทธ์ในระบบได้อยู่แล้วนิ"

Translation: "Why ask? Permissions are already configurable in the system."

### Resolution

LTV Dashboard (`[Admin System] DINOCO Customer LTV Dashboard` V.0.46+) **already uses standard role gates**:

- View list of customers + tier badges = `manage_options` or `dinoco_sn_readonly`
- View customer PII (phone/email/lifetime spent) = `dinoco_sn_view_pii` capability gate
- Export CSV = `manage_options` only

Boss seeds roles via Q15 Role Manager — admins automatically get LTV access per their role assignment.

### No additional decision needed

F#9 LTV is **already shipped + already role-gated**. Boss's role-seeding (Q15) automatically controls who sees what.

### Documents to update

| File | Action |
|---|---|
| `20-f9-ltv-privacy-gate-spec.md` | **MARK CLOSED** — boss decision: use existing role gates, no extra spec |

---

## Operational Status After 2026-05-15

### ZERO boss-blocked items remain in SN roadmap

Before today (2026-05-15): 6 boss-blocked items
After today: **0 boss-blocked items**

### What's actionable today (no boss needed)

1. **F#1-F#5 flag flip** — 5 `wp option update` commands
2. **Q15 Role Manager flag flip** — 1 command
3. **Q20 Refund flag flip** — 1 command
4. **F#8 scope refactor** — drop legal/VAT/tax-invoice from F#8 plan (~30h dev — Phase 5)
5. **Doc cleanup** — mark 6 docs as superseded/cancelled

### What's actionable this week

1. Phase 3 W8-W11 SN features (cron infra + reconciliation + recall + F#1/F#4/F#6/F#10/F#12/F#13/F#14) — ~140h
2. Phase 4 W12 simplified F#8 (~30h instead of 80h)
3. Phase 4 W13 F#16 demand forecast — ~25h
4. Internal QA acceptance test 50 scenarios — ~16h boss + admin team time
5. Order factory batch (boss action) — ~1-2 month lead time China

### What's no longer in scope

- ❌ Pilot 100 plate × 5 dealers
- ❌ Legal workstream (payment gateway / VAT / tax invoice)
- ❌ Tax invoice format ใบกำกับภาษี
- ❌ Refund policy registration ระเบียบ พ.ร.บ. คุ้มครองผู้บริโภค
- ❌ 10-user Q15 role matrix UAT plan
- ❌ Customer Support team formal training (CS team trains themselves via docs)

---

## Memory updates

Boss feedback recorded:
- `feedback_non_vat_personal_bank.md` — DINOCO uses personal bank for F#8 marketplace, no VAT, plain receipt only
- `feedback_pilot_obsolete_v22.md` — Any pilot mentions in plans pre-v2.2 are obsolete; v2.2 standalone means no dealer involvement
- `feedback_existing_role_gates_suffice.md` — Don't propose new permission specs; existing role system handles it

## References

- `docs/sn-system/07-boss-decisions-log.md` — Full boss decision history (v2.0 → v2.13)
- Plan file: `~/.claude/plans/wiki-doc-sequential-lantern.md` (v2.13 boss-approved)
- Memory: `~/.claude/projects/-Users-pavornthavornchan-Projects-DINOCO-SYSTEM-Front-End---Back-End/memory/MEMORY.md`
