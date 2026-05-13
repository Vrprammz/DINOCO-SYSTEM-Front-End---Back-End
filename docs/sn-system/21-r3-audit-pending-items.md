# 📌 R3 Audit — Pending Items + Deferred Findings

**Date**: 2026-05-07
**Source**: Plan v2.13 §Phase 1 W4 R3 Round 3 audit (tech-lead + fullstack-developer + code-reviewer parallel dispatch)
**Status**: Living document — update เมื่อ defer items resolved

---

## 🎯 Purpose

Round 3 audit เจอ findings 18 อัน (5 BLOCKER + 4 HIGH + 6 MED + 3 LOW) — BLOCKER + HIGH ทั้งหมด **ปิดใน R3 BLOCKER batch** (ดู REG-090..098 + drift detector + 4 doc updates). MED + LOW + future-phase items เก็บไว้ที่นี่ — ไม่ block Phase 1 W4 acceptance แต่ต้อง revisit ตามรอบ.

---

## 📋 Deferred Items

### D1 — HMAC kid versioning (Phase 5+)
**Severity**: MEDIUM
**Round**: R3 (newly raised)
**Source**: code-reviewer audit on `dinoco_sn_hmac_sign()`
**Issue**: ปัจจุบัน HMAC signing ใช้ secret เดียว (`LIFF_AI_SECRET_KEY` หรือ DINOCO_JWT) — ไม่มี key rotation. ถ้า secret leak จะต้อง rotate ทั้งระบบ + invalidate ทุก issued QR ที่อยู่ในมือลูกค้า.
**Why deferred**: Phase 5 marketplace launch จะแนะนำ public API (F#15) — at that time จะ design `kid` (key id) into HMAC payload + key rotation rotation playbook. Phase 1-4 secret rotation = ทำมือ + emergency.
**Owner**: Tech Lead (Phase 5)
**Track**: Plan v2.13 §F.15

### D2 — Section 15 vs Section 15.14 contradiction monitoring
**Severity**: LOW
**Round**: R3
**Issue**: `docs/sn-system/15-q20-manual-refund-sop.md` (refund SOP) อ้างถึง `15-phase2-w7-atomic-deploy-strategy.md` แต่ section 15.14 (intake script ที่เพิ่งเพิ่ม) ไม่ cross-ref สอดคล้องกัน — risk: ถ้า refund SOP edit แล้วลืม sync intake script.
**Mitigation**: Drift detector ตรวจ cross-ref ใน sn-system-drift.test.js R3 cross-cutting ('R3 — Section 15.14 cross-ref Section 15 base').
**Owner**: Tech Lead
**Re-review trigger**: ทุก quarterly review docs/sn-system/

### D3 — Customer Support training video recording
**Severity**: LOW
**Round**: R3
**Issue**: `docs/sn-system/22-customer-support-readiness-plan.md` plan training session 2hr but no video material yet. Hires ใหม่ในอนาคตจะต้องไป re-train onsite.
**Why deferred**: First training session จะ run pre-Phase 1 W4 → record session แล้วใช้ replay สำหรับ hires ใหม่. ไม่ block Phase 1 W4 launch.
**Owner**: CS Lead
**Action**: Record session (Zoom or LINE Meeting) + upload to internal Google Drive

### D4 — E2E concurrent test infrastructure (Docker Compose)
**Severity**: MEDIUM
**Round**: R3
**Issue**: pure-logic tests cover state machine + idempotency hash + HMAC + retention — แต่ไม่ครอบคลุม **real concurrent race** (เช่น 2 admin scan plate เดียวกันพร้อมกัน → SELECT FOR UPDATE work?). Plan แนะนำ Docker Compose stack (MySQL + WP + Redis) สำหรับ E2E.
**Why deferred**: Build cost > Phase 1 W4 timeline. Manual QA case B8 + C13 + R3-M7 cover well enough เป็น short-term.
**Owner**: Tech Lead
**Track**: `docs/sn-system/23-e2e-concurrent-test-infrastructure.md` — design doc landed R3 BLOCKER. Implementation Phase 3+

### D5 — F#15 Public API (Q22 deferred)
**Severity**: N/A (boss-deferred)
**Round**: R3 (verified flag-gate works)
**Issue**: F#15 Public API Gateway code retained but `dinoco_sn_pubapi_enabled` flag default OFF → all public endpoints return 503 `feature_disabled`. Awaiting boss "use case" decision.
**Owner**: บอส (when use case emerges)
**Track**: `docs/sn-system/19-phase4-w12-pubapi-deferred.md`

### D6 — F#12 Anti-Fraud Engine cleanup verification

**Severity**: LOW
**Round**: R3
**Status update 2026-05-13 (R13 audit verification)**: ✅ CODE SIDE COMPLETE
**Issue**: Q21 boss decision = remove F#12 entirely. Commit `8d97fdf` removed schema/routes/cron/JS/test surface — but defensive `wp_unschedule_event` runs ONLY at admin_init time. ระบบที่ deploy ก่อน commit + cron ที่ pre-register อยู่อาจ orphan run อยู่ background.
**Code-side verification (R13 grep)**:

- ✅ `dinoco_sn_install_schema()` does NOT create `wp_dinoco_sn_fraud_scores` table (`docs/sn-system/...` schema marker confirmed)
- ✅ REST routes for `/fraud/queue` + `/fraud/{id}/decision` + `/fraud/stats` NOT registered in `rest_api_init`
- ✅ `dinoco_sn_unschedule_orphan_crons()` clears `dinoco_sn_fraud_aggregate_cron` defensively at admin_init (SN Manager line 12265)
- ✅ Handler bodies `dinoco_sn_rest_fraud_queue/stats` (SN REST API line 8267-8330) are unreachable dead code archived for git history. Defensive: each checks `dinoco_sn_table_exists('fraud_scores')` first → returns empty response since table not installed. Q21 doc note: "Phase 4+ may delete entirely once schema migration drop confirmed".
**Remaining server-side verification** (boss/admin SSH):
- `wp cron event list | grep -i fraud` → expect empty
- `wp option get dinoco_sn_schema_version` → verify schema version absent fraud_scores key
**Mitigation**: Code-side defensive guards prevent any access. Production hotfix landed.
**Owner**: Tech Lead — verify pre-Phase 1 W4 launch (SSH-side cron verify pending boss)
**Track**: Plan v2.13 §Q21 + commit `8d97fdf` + R13 grep verification (2026-05-13)

### D7 — Admin LIFF approval UX accessibility (high-contrast mode)

**Severity**: LOW
**Round**: R3
**Status update 2026-05-13**: Standing — current contrast 5.9:1 passes WCAG AA. Phase 5 W18 axe-core/NVDA broader audit still pending.
**Issue**: 4-eyes approval LIFF prompt ใช้ amber color (#fef3c7 / #b45309). High-contrast Windows + Linux mode บาง edge case อาจให้ contrast ratio < 4.5:1 (WCAG AA fail).
**Mitigation**: Spot-checked in Phase 1 audit (UX-C3) — passed at 5.9:1. Round 3 didn't detect new regression. Re-audit Phase 5 with broader accessibility tools (axe-core, NVDA).
**R13 note (2026-05-13)**: BO V.4.0 all_backorder Flex builder uses same amber palette (#b45309 / #fef3c7) — inherits same WCAG AA pass. New customer-facing surface (LIFF Order page + customer split view) consistent with existing convention.
**Owner**: UX Lead
**Track**: Phase 5 W18 launch readiness

---

## ✅ Items closed in R3 BLOCKER batch (this commit)

| Item | Severity | REG | File |
|---|---|---|---|
| HMAC URL signing (24h replay window) | BLOCKER | REG-090 | SnHmacUrlSigningTest.php |
| 8 R2/R3 idempotency contract | BLOCKER | REG-091 | SnIdempotencyR2ContractTest.php |
| Pool status action fire (8 sites × 2 actions) | BLOCKER | REG-092 | SnPoolStatusActionFireTest.php |
| Claim FSM → sn_pool replacement edge | BLOCKER | REG-093 | SnClaimReplacementSyncEdgeTest.php |
| Schema 1.1 → 1.2 migration | BLOCKER | REG-094 | SnSchemaVersion12MigrationTest.php |
| Canonical idempotency hash | HIGH | REG-095 | SnCanonicalIdempotencyHashTest.php |
| Lock key collision rate | HIGH | REG-096 | SnLockKeyCollisionTest.php |
| Audit retention 90d/3y/5y | HIGH | REG-097 | SnAuditRetentionTest.php |
| HMAC replay window boundary | HIGH | REG-098 | SnHmacReplayWindowTest.php |

---

## 🔄 Re-review schedule

- **R4 review** — pre-F1 flag flip (after manual QA M1-M8 passed)
- **R5 review** — Phase 2 W7 deploy + 1 wk sentinel period
- **R6 review** — Phase 5 W18 launch readiness

---

## 📚 Related

- `docs/sn-system/07-boss-decisions-log.md` — Q1-Q29 boss decisions log
- `docs/sn-system/11-phase1-w4-internal-qa-acceptance-test.md` — manual QA matrix (extended R3)
- `docs/sn-system/22-customer-support-readiness-plan.md` — CS team training
- `docs/sn-system/23-e2e-concurrent-test-infrastructure.md` — Docker Compose plan
- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13
