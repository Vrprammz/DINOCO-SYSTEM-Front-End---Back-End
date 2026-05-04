# DINOCO S/N System Documentation

Phase 0 Week 1 deliverables (2026-05-04) — Production: Generate S/N Management System

## Plan Reference

Master plan file: `~/.claude/plans/wiki-doc-sequential-lantern.md` (v2.13 binding)

Total project: 19 weeks · ~620h continuous · Phase 0-6

## Documents

| File | Purpose | Status |
|---|---|---|
| [01-system-architecture.md](01-system-architecture.md) | Mermaid diagram of 11+ systems integration | ✅ Done |
| [02-state-machine.md](02-state-machine.md) | Unified state machine (post v2.12 simplification + v2.5/v2.6 integration) | ✅ Done |
| [03-cross-system-lifecycle.md](03-cross-system-lifecycle.md) | 7-path swimlane diagrams (B2C / Legacy / Claim / Transfer / Manual Invoice / Anti-Fraud / Stolen) | ✅ Done |
| [04-open-questions.md](04-open-questions.md) | Q1-Q29 boss decisions needed (12 BLOCKER + 12 IMPORTANT + 5 UX) | ✅ Done — รอบอสตอบ |
| [05-schema-v1.sql](05-schema-v1.sql) | Database schema POC (15 tables + ALTER) | ✅ Done |

## Phase 0 W1 Status

✅ **Day 3-4 Complete** — diagrams + open questions + schema POC

⏳ **Day 1-2 Pending** — รอบอสตอบ (Q1-Q12 BLOCKER):
- Q12: Fraud baseline 12-month audit data
- Q11: LINE Premium tier budget
- Q5/Q6: Phase 1 scope confirmation

⏳ **Day 4-5 Partial Complete** — infrastructure verified ✅:
- Idempotency Helper V.1.0+ ✅
- Modal Helpers V.1.0 ✅
- Flag Audit Log V.1.0 ✅
- Observability V.1.0 ✅
- `dinoco_register_cron` pattern (Round 28+) ✅

## Next Steps

1. **บอสตอบ Q1-Q29** ผ่าน [04-open-questions.md](04-open-questions.md) → ใช้ "Recommended ทั้งหมด" หรือ override per question
2. **Pre-Phase 1 sign-off** → start Phase 1 W2 (Schema dbDelta + Batch CRUD)
3. **Legal track parallel** เริ่มทันที (Q6 = Phase 5 ก็ตาม) — payment gateway agreement

## Phase 1 W2 Day 1-2 Planned

ทันทีที่ Q1-Q12 ตอบครบ:
- Day 1 AM: NEW snippet `[Admin System] DINOCO Production SN Manager` V.0.1 — header + DB_ID placeholder + `admin_init` schema lazy install
- Day 1 PM: NEW snippet `[System] DINOCO SN REST API` V.0.1 — namespace `/dinoco-sn/v1/` registration + permission helpers
- Day 2 AM: ALTER `wp_dinoco_products` (3 columns) idempotent + verify INFORMATION_SCHEMA gate
- Day 2 PM: Batch CRUD REST endpoints (4 endpoints) + Idempotency wrapper + integration test

## Files Touched in Phase 0 W1

```
docs/sn-system/
├── README.md (this file)
├── 01-system-architecture.md
├── 02-state-machine.md
├── 03-cross-system-lifecycle.md
├── 04-open-questions.md
└── 05-schema-v1.sql
```

No code files modified yet. Schema not yet deployed (pending Q4 split confirmation).

## Risk Notes (from v2.13 §⚠️ Sustained Execution Risks)

- 🔴 **Single dev × 19 wk** — burnout risk. Boss to monitor + consider hire contractor at Phase 3
- 🔴 **Scope creep** — v2.13 schedule = source of truth. ห้ามเพิ่ม feature โดยไม่ revise plan
- 🟡 **Phase 2 W7 Atomic Deploy** — 14 V.31.0 files ต้อง deploy พร้อมกัน (5-step strategy in plan)
- 🟡 **LINE quota burst** — Phase 3 W9 — F#1+F#4+F#10 cron พร้อมกัน — monitor day 1
- 🟡 **Phase 5 legal block** — Legal track ต้องเริ่ม parallel ตั้งแต่ Phase 1 ห้ามรอจน Phase 5

---

**Plan version**: v2.13 boss-approved 2026-05-04
**Next review**: After Q1-Q29 boss responses
