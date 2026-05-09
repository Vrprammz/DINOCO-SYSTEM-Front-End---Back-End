# 26 — Operations Pending Decisions (Boss-Ready Templates)

**Status**: 11 operational items NOT code-blocked. Each has a concrete template/runbook ready to use. Boss can rip-and-send / approve as-is.

**Why this doc**: After R5–R9 audit cycles closed every BLOCKER + drift detector locks the regression surface, the only remaining gates are operational decisions outside engineering's purview. This bundles them with copy-paste templates so nothing slips while engineering-side work continues.

**Audit cycle context**: PHPUnit 2,444 / 4,683 assertions PASS · Jest 51/51 suites · 2,069 tests · 0 regressions as of commit `2e3c615` (R10 P3 + flag-aware mechanical sweep).

---

## Quick Index — UPDATED 2026-05-09 with boss decisions

| #   | Item                              | Status (2026-05-09) | Action |
| --- | --------------------------------- | -------------------- | ------ |
| 1   | White-variant logo upload         | ✅ DONE — wired      | Snippet 10 V.31.1 + admin_init seed of `dinoco_brand_logo_url_white` |
| 2   | F#8 legal email send              | ✅ DONE — self-drafted | `28-refund-policy-warranty-extension.md` + `29-tax-invoice-format-vat7.md` (boss said no lawyer needed) |
| 3   | KPI baseline owner assignment     | ✅ DONE — boss runs   | `31-kpi-baseline-tools-for-boss.md` ready (30 min/day × 7 days) |
| 4   | Q12 skip-pilot risk acceptance    | ✅ DONE — by directive | Boss said "ทำไปเลยไม่ต้องเซ็น" → marked approved in this doc |
| 5   | CS Facebook intake script rollout | ✅ DONE — boss teaches | `32-cs-training-material-for-boss.md` (5 sessions × 1hr) |
| 6   | LINE Premium ฿1,500/mo verify     | ✅ DONE — auto-verify | NEW snippet "DINOCO LINE Quota Monitor" V.1.0 (daily cron + Telegram alert) |
| 7   | Schema migration window           | 🟡 RUNBOOK READY      | `27-schema-migration-go-live-runbook.md` — boss runs 3 commands when ready |
| 8   | Frequency cap policy (LINE Push)  | ✅ DONE — unlimited   | Push Gov V.1.6: caps flipped 1/3 → 0/0 per directive "ส่งได้ตลอด" |
| 9   | PDPA opt-out UI signoff           | ✅ DONE — self-drafted | `30-pdpa-opt-out-wording.md` (boss said no lawyer) |
| 10  | Brand CI tokens (color/font)      | ✅ DONE — accept current | Boss said "ได้หมด" — keep navy `#1f2937` + green `#10b981` |
| 11  | Photo OCR Gemini quota tier       | ✅ DONE — start free  | Default to free 60 req/min; auto-upgrade if hit |

### Status legend
- ✅ DONE = completed in this commit cycle (2026-05-09)
- 🟡 RUNBOOK READY = boss action pending (5-15 min execute)
- ⏳ awaiting = (no items at this status anymore)

---

## Boss Directive 2026-05-09 — All 11 Decisions

Boss responded to all 11 items in 1 conversation. Recorded for audit:

| # | Boss answer (verbatim) | Interpretation |
|---|---|---|
| 1 | logo URLs given (black + white) | wire white into invoice header — DONE |
| 2 | "ทำได้เลยไม่ต้องรอทนาย" | team drafts refund policy + tax invoice — DONE |
| 3 | "บอสเอง" | boss measures KPI baseline — tools READY |
| 4 | "ทำไปเลยไม่ต้องเซ็น" | skip Q12 risk acceptance form — approved by directive |
| 5 | "บอส" (จะคุยเอง) | boss teaches CS — training material READY |
| 6 | "เริ่มลย" (schema migration) | runbook READY for boss to run |
| 7 | "ส่งได้ตลอด" (LINE freq cap) | unlimited — DONE |
| 8 | (Photo OCR explained, no override) | start free → upgrade if needed — DONE config |
| 9 | "ระบบตรวจ" (LINE quota verify) | auto-verify daily cron — DONE |
| 10 | "ได้หมด" (Brand CI) | accept current — DONE no change |
| 11 | "ทำต่อไปไม่ต้องใคร" (PDPA wording) | team drafts — DONE |

**Outcome**: 0 BLOCKERs remaining for engineering side. Items 7 (schema) waits boss to run runbook. KPI baseline waits boss to spend 30min/day × 7 days.

---

## 1. White-Variant Logo Upload

**Why blocking**: Manual Invoice + Flash V.42 label + LINE Flex header use white-on-dark variant for navy `#1f2937` backgrounds. Currently fall back to bw → invisible on dark headers (Snippet 10 V.30.7 admin notice surfaces this).

**Action**: บอสอัปโหลด logo สีขาว PNG transparent 800×200px → upload via WP admin → Media Library → set wp_option `b2b_logo_white_url`.

**Template path** (โพสต์ลง LINE หาบอส):

> 🎨 ขอ logo DINOCO **สีขาว** (พื้นโปร่งใส) ไฟล์ PNG 800×200px ครับ —
>
> ใช้สำหรับ:
> 1. ใบกำกับภาษี Manual Invoice (ตอนนี้ปรากฏดำบนพื้นดำ → เห็นไม่ชัด)
> 2. ใบปะหน้า Flash V.42 — header navy
> 3. LINE Flex bubble header (B2B + B2F)
>
> Upload ที่ `https://dinoco.in.th/wp-admin/media-new.php`

**Verify after upload**:
```bash
wp option update b2b_logo_white_url "<URL_FROM_MEDIA_LIBRARY>"
```

---

## 2. F#8 Extension Marketplace — Legal Email

**Why blocking**: Phase 4 W12 starts in 16 weeks. Legal review of 2 deliverables (refund policy + tax invoice format with VAT 7%) takes 8-12wk lead time per `docs/sn-system/16-f8-legal-workstream-prephase1.md`. **MUST send this week** to stay on schedule.

**Email template** (copy → ส่งทนาย):

```
Subject: [DINOCO ขออนุเคราะห์] Review เอกสาร 2 ฉบับสำหรับ Warranty Extension Marketplace

เรียน คุณทนาย [ชื่อ],

DINOCO กำลังจะเปิดบริการขายต่อประกัน (Warranty Extension) ให้ลูกค้า
ผ่านทาง LINE LIFF ในไตรมาส 4/2026 และต้องการขออนุเคราะห์ตรวจสอบ
เอกสาร 2 ฉบับ ก่อนเริ่มเขียนโค้ด:

1. Refund Policy v1.0 — นโยบายการคืนเงินกรณีลูกค้าเปลี่ยนใจ
   หรือผิดข้อกำหนดในการต่อประกัน
2. Tax Invoice Format — รูปแบบใบกำกับภาษีเต็มรูป (VAT 7%) สำหรับ
   ลูกค้าที่ขอใบกำกับภาษี + ส่ง LINE Flex receipt

ระยะเวลาที่ต้องการ: ~6-8 สัปดาห์ (ใช้ใน Phase 4 W12 ตามแผน 19wk)

แนบเอกสารร่างมาพร้อมนี้ — ดูที่:
- /docs/sn-system/16-f8-legal-workstream-prephase1.md (เนื้อหาเต็ม)
- /docs/compliance/PDPA-BASICS.md (compliance baseline)

ค่าตอบแทน: [ตามตกลงกับสำนักงาน]

ขอบคุณครับ
[บอสชื่อ]
DINOCO
```

**Action**: บอสคัดลอกแล้วส่งทนายภายในวันนี้ → จะ unblock Phase 4 W12 timeline.

---

## 3. KPI Baseline Measurement — Owner

**Why blocking**: Phase 1 W4 internal QA passed → ready to flip flag F1 ON ทุกดีลเลอร์. แต่ T-0 baseline ของ 5 KPIs ต้องวัดก่อน flip (ดู `13-kpi-baseline-measurement-plan.md`):

1. activate_within_30d_pct (target ≥85%)
2. claim_within_30d_pct (target ≤3%)
3. transfer_within_30d_pct (target ≤2%)
4. lookup_p95_ms (target <200ms)
5. activation_p95_ms (target <1.5s)

**Action**: บอสกำหนด owner 1 คน — วัด baseline + บันทึก wp_option `dinoco_sn_kpi_baseline_t0` (JSON {kpi: value, measured_at}).

**Template** (LINE หาทีม):

> 📊 ขอจิตอาสา 1 คน รับหน้าที่วัด T-0 baseline ของระบบ S/N ก่อน flip flag —
>
> งาน: รัน 5 SQL queries ทุกวัน × 7 วัน → คำนวณ baseline + log
> ใช้เวลา: ~30 นาที × 7 วัน = ~3.5 ชั่วโมงรวม
> เครื่องมือ: SSH + WP-CLI ที่เตรียมไว้ใน `13-kpi-baseline-measurement-plan.md`
> Deadline: ก่อนวันที่บอสอนุมัติ flip flag F1
>
> ใครรับ? 🙏

---

## 4. Q12 Skip-Pilot Risk Acceptance Form

**Why blocking**: บอส decision ใน Round 2 (`07-boss-decisions-log.md`) = **B Skip pilot** (flip flag ON ทุกดีลเลอร์พร้อมกัน). Risk mitigation has 5 layers but ต้องบอสเซ็นยอมรับเป็นทางการก่อน flip.

**Form template** (`14-q12-skip-pilot-risk-acceptance.md` — already drafted, ขาดลายเซ็น):

> หัวข้อ: ยอมรับความเสี่ยงการ skip pilot phase
>
> ผม [บอสชื่อ] ในฐานะเจ้าของบริษัท DINOCO ยอมรับว่า:
> 1. เข้าใจว่าการ flip flag dinoco_sn_system_enabled=1 ทุกดีลเลอร์
>    พร้อมกันโดยไม่ผ่าน pilot 100 plates มีความเสี่ยง
> 2. Risk mitigation 5 layers (hard rollback <30s + Sentry obs +
>    Telegram alert + Phase 2 W7 atomic deploy + drift detectors)
>    คุ้มครองในระดับ acceptable
> 3. ถ้ามี incident ในชั่วโมงแรก ทีมจะ rollback ทันที + analyze
>    ก่อน re-flip
>
> ลายเซ็น: ____________________  วันที่: __________
> พยาน: ____________________  วันที่: __________

**Action**: บอสเซ็น + scan + commit `docs/sn-system/q12-risk-accepted-signed.pdf`.

---

## 5. CS Facebook Intake Script — Rollout

**Why blocking**: Q20 R2 = manual refund flow ลูกค้าติดต่อ Admin Facebook. CS team need verbatim script + escalation L1-L6 (drafted in `15-q20-manual-refund-sop.md`). Need 5 training sessions.

**Template** (LINE หา CS lead):

> 🎯 ขอ CS lead รับหน้าที่ rollout intake script —
>
> ขั้นตอน:
> 1. อ่าน `docs/sn-system/15-q20-manual-refund-sop.md` (เน้น Section 3 Verbatim DM Templates)
> 2. จัด 5 training sessions × 1 ชม. (1 session/วัน × 5 วัน) ช่วง 10:00-11:00
> 3. หลัง training → admin Facebook ใหม่ทุกคนต้องผ่าน mock 3 scenarios
> 4. Sign-off form: `22-customer-support-readiness-plan.md` Section "Sign-Off Checklist"
>
> Deadline: ก่อน flag F1 flip (ประมาณ 5 วัน)

---

## 6. LINE Premium ฿1,500/mo Verify (PAID — verify only)

**Why blocking**: Round 2 บอสยืนยัน paid แล้ว แต่ยังไม่ได้ verify ว่า quota เปลี่ยนจริง.

**Verify command**:
```bash
curl -s -X POST "https://api.line.me/v2/bot/message/quota" \
  -H "Authorization: Bearer ${B2B_LINE_ACCESS_TOKEN}" | jq
# Expected: {"type":"limited","value":50000} (หรือสูงกว่านี้)
```

**Action**: รัน command ข้างบน → ถ้า value < 50k → escalate LINE business support.

---

## 7. Schema Migration Window

**Why blocking**: WP-CLI migration `wp dinoco-sn migrate-schema --version=1.2 --execute --online` ต้องการ window 1-2 ชั่วโมง (online ผ่าน pt-osc safe แต่ in-place block 15-30 นาที).

**Recommended window**: Sunday 02:00-04:00 ICT (low traffic) + maintenance banner via `wp option update dinoco_maintenance_banner 1`.

**Action**: บอสเลือกวันอาทิตย์ + ยืนยัน window. ทีมจะ:
1. Backup mysqldump 1 hr before
2. รัน `--online --auto-rollback` (pt-osc + auto-revert on fail)
3. Monitor Sentry + admin notice หลังเสร็จ
4. Smoke test 5 specs

**Pre-flight check** (รันก่อน เพื่อ confirm safe):
```bash
wp dinoco-sn migrate-schema --version=1.2 --dry-run
# Output: row count + estimated duration + collision report
```

---

## 8. Frequency Cap Policy (LINE Push Governance)

**Why blocking**: F#1 Expiry + F#4 Anniversary + F#10 Review = 3 cron jobs ที่ push LINE message. ลูกค้าได้รับ 3 message/วันได้ในกรณีเลวร้าย → spam complaint risk.

**Recommendation** (ตาม `17-line-quota-stress-test-plan.md` + LINE Push Governance V.1.5):
- Per-user cap: max 1 message/วัน (ทุก type รวมกัน)
- Per-channel cap: max 3 message/สัปดาห์
- Quiet hours: 21:00–08:00 ICT no push
- Marketing-meta seam (R5 Sec-G7): admin-only types skip cap

**Action**: บอสยืนยัน policy → ทีมตั้งใน wp_options:
```bash
wp option update dinoco_line_gov_freq_cap_per_user_day 1
wp option update dinoco_line_gov_freq_cap_per_user_week 3
wp option update dinoco_line_gov_quiet_hours_start 21
wp option update dinoco_line_gov_quiet_hours_end 8
```

---

## 9. PDPA Opt-Out UI Signoff

**Why blocking**: GDPR V.4.0 export endpoint แล้ว แต่ opt-out UI ยังเป็น stub (default `dinoco_gdpr_enabled=0`). Need ทนายตรวจ wording + signoff.

**3 wordings to review** (ใน `docs/compliance/PDPA-BASICS.md`):
1. Consent collection (ตอน customer activate warranty)
2. Right to access (export data)
3. Right to erasure (anonymize vs hard-delete)

**Action**: บอสส่ง section นี้ให้ทนายเดียวกับ F#8 → bundle review (saves cost).

---

## 10. Brand CI Tokens (Color + Font)

**Why blocking**: 4 LIFF surfaces (Activation + Marketplace + Member Dashboard + Sn Lookup) hardcode color values. Designer should provide:
- Primary navy (currently `#1f2937` — confirm?)
- Accent green (currently `#10b981`)
- Tier badge gradients (5 tiers — currently in `project_sn_management_system.md`)
- Thai font fallback chain

**Action**: Designer commit `docs/brand/tokens.json` → CI consumes for both LIFF + Flex Image.

---

## 11. Photo OCR Gemini Quota Tier

**Why blocking**: F#3 Auto-fill Claim uses Gemini Vision OCR. Free tier = 60 req/min. ถ้า claim volume > 60/min ในช่วง peak (ไม่น่ามีในตอนแรก แต่ Phase 4 W14.5 อาจมี) → throttle.

**Action**: บอสเลือก:
- **A**: Stay on free tier — monitor quota via `claim-flow.js` cache + escalate if hit (ฟรี)
- **B**: Upgrade Pay-as-you-go ~$0.0125/image — peace of mind (ประมาณ ฿100/เดือน)

**Recommendation**: Start A → upgrade B if monthly hit > 100 throttle events.

**Verify quota** (ทุกเดือน):
```bash
# Console quota dashboard
open "https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas"
```

---

## How to Use This Doc

**For บอส**: Scan the Quick Index — items marked ⏳ need your decision/signature this week. Items marked 💰 paid just need verify.

**For ทีม**: When a boss decision lands → update the row + cross-link to PR/commit. When the doc reaches all-✅, archive to `docs/sn-system/archive/` + remove from Memory.

**For audit trail**: Every decision should land as:
1. Wp_option update (where applicable)
2. Commit message reference in `07-boss-decisions-log.md` (Round N+1)
3. CHANGELOG entry

---

## Cross-Refs

- `07-boss-decisions-log.md` — full Q1-Q29 history + Round 2/3 overrides
- `10-go-live-gate-checklist.md` — pre-flip checklist gates
- `13-kpi-baseline-measurement-plan.md` — KPI #3 detail
- `14-q12-skip-pilot-risk-acceptance.md` — #4 form text
- `15-q20-manual-refund-sop.md` — #5 verbatim CS scripts
- `16-f8-legal-workstream-prephase1.md` — #2 + #9 legal scope
- `17-line-quota-stress-test-plan.md` — #6 + #8 quota math
- `25-schema-migration-runbook.md` — #7 step-by-step

---

_Last updated: 2026-05-09 (boss responded to all 11 items, all engineering work done same day) — Auto Mode Active_

## Cross-refs to new docs (2026-05-09 batch)

- `27-schema-migration-go-live-runbook.md` — Item 7 step-by-step
- `28-refund-policy-warranty-extension.md` — Item 2 deliverable 1/2
- `29-tax-invoice-format-vat7.md` — Item 2 deliverable 2/2
- `30-pdpa-opt-out-wording.md` — Item 9
- `31-kpi-baseline-tools-for-boss.md` — Item 3 (boss runs)
- `32-cs-training-material-for-boss.md` — Item 5 (boss teaches)
