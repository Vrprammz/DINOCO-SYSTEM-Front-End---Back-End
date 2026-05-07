# 🚨 Q12 Skip-Pilot Risk Acceptance

**Version**: 1.0 (2026-05-07)
**Boss decision date**: 2026-05-05 (Round 2)
**Boss verbatim**: "B — Skip pilot" (no canary phase, flip flag ON สำหรับทุกดีลเลอร์พร้อมกัน)

---

## 🎯 Context

S/N Management System v2.13 originally planned a **100-plate pilot batch** with 3 dealers (Q12). บอสตัดสินใจในรอบ 2 ของ Q&A ว่า:

> "B — Skip pilot. ส่งโรงงานจีน production batch ตอน Phase 2 W6 parallel ไปเลย"

ทีม dev ยอมรับ decision นี้พร้อม risk-mitigation plan ตามเอกสารนี้

---

## ⚠️ Blast Radius (ถ้าผิดพลาด)

| Domain | Worst-case impact | Probability |
|---|---|---|
| **Customer activation** | LIFF ลูกค้าใช้ไม่ได้ → claim flow ใช้ legacy fallback (V.31.0 W6.5 already supports) | LOW |
| **Warehouse receive** | Bulk receive 422 errors → manual fallback via admin tab | MED |
| **Claim sync** | Claim status update ไม่ flip sn_pool → Sentinel detect drift in 24 hr | LOW |
| **Transfer** | Member transfer race condition → REG-083 lock key prevents (verified) | VERY LOW |
| **Factory batch** | 1000+ plates รอ activation → revert means reprint OR plate-recall workflow | MED-HIGH |

**Highest-impact failure mode**: factory production batch มี 1000-2000 plates ค้างอยู่ใน `reserved` state ถ้า rollback. → **Mitigation**: factory print orders are *paused* until F1 flag observed stable T+24h.

---

## 🛡️ Mitigation Stack (5 layers)

### Layer 1 — Hard rollback < 30 sec
```bash
wp option update dinoco_sn_system_enabled 0
wp cache flush
```
ทุก endpoint จะ return 503 `feature_disabled` ทันที. Customer UI + admin UI fallback to legacy paths.

### Layer 2 — Sentry + Observability
- `dinoco_obs_capture()` wired to 5 sensitive ops (batch_create / receive / void / swap / activate)
- Sentry DSN configured Phase 0 W1 ✓
- Alert threshold: > 10 errors / 5 min in S/N namespace → page on-call

### Layer 3 — Atomic 5-step deploy
ดู `docs/sn-system/12-phase2-w7-deploy-runbook.md` — atomicity guarantee.

### Layer 4 — Telegram alerts (น้องกุ้ง)
- `BAT_RECEIVE_FAIL` — bulk receive returns ≥ 5 errors per call
- `ACTIVATE_LOCK_CONFLICT` — REG-082 lock_version conflict observed
- `TRANSFER_LOCK_BUSY` — REG-083 mutual exclusion blocked > 3 times in 1 hr
- `FACTORY_BATCH_OVERFLOW` — > 5000 plates reserved without activation

### Layer 5 — KPI sentinel (T+24h)
Activation rate must be ≥ 30% within 24 hr of first batch reaching warehouse.
ถ้าน้อยกว่า → manual root-cause + ถ้าหา cause ไม่ได้ใน 1 hr → rollback Layer 1.

---

## 📋 Conditions ที่ต้องครบถึงจะ flip

ก่อน flip F1 ON:
- [ ] **Internal QA 50 test cases** ผ่านทั้งหมด (replacement สำหรับ pilot — see `docs/sn-system/11-phase1-w4-internal-qa-acceptance-test.md`)
- [ ] **Sentry DSN active** + alert rules configured
- [ ] **Telegram bot น้องกุ้ง** receives test alert
- [ ] **Factory batch hold** confirmed — no production print until T+24h post-flip
- [ ] **On-call schedule** 24×7 for first 7 days post-flip
- [ ] **Rollback drill** practiced once on staging (within 30 sec target)
- [ ] **บอส** confirms current week is OK to flip (no boss travel)

---

## 🎯 Acceptance Criteria

This doc is a **risk acceptance**, not a risk-elimination. Conditions:

1. ✓ Boss has read mitigation stack + understands worst-case scenarios.
2. ✓ Tech lead has executed all 7 pre-flip conditions.
3. ✓ Telegram alert wiring confirmed via test fire.
4. ✓ Sentry baseline snapshot (last 7 days error rate) recorded.
5. ✓ KPI baseline snapshot recorded (per `13-kpi-baseline-measurement-plan.md`).

---

## ⏪ Auto-rollback triggers

ระบบ rollback อัตโนมัติเมื่อ:
- Sentry error rate > 5× baseline ภายใน 15 นาที (cron monitor)
- Bulk receive failure rate > 30% ภายใน 1 ชั่วโมง
- Customer activation rate = 0% ภายใน 6 hr post-batch-receive

ทุก auto-rollback ต้องมี Telegram alert + email ไป tech lead + บอส.

---

## 📚 Related

- `docs/sn-system/07-boss-decisions-log.md` — Q12 boss decision record
- `docs/sn-system/10-go-live-gate-checklist.md` — F1 flip prerequisites
- `docs/sn-system/11-phase1-w4-internal-qa-acceptance-test.md` — 50 test cases replacing pilot

---

**Sign-off**:
- [ ] Tech Lead — risk-mitigation plan executable
- [ ] บอส — accepts residual risk per Q12 decision
- [ ] Date signed: __________
