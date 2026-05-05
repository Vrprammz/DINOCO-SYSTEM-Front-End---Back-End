# 🚦 Go-Live Gate Checklist — F1-F5 Flag Flip Criteria

**Date**: 2026-05-05
**Source**: `docs/sn-system/07-boss-decisions-log.md` Round 2 — F1-F5 schedule

บอส (Round 2): "จะเริ่มเลยถ้าทุกอย่างเสร็จ"

ผมต้องระบุชัดเจนว่า **"ทุกอย่างเสร็จ" = อะไร** เพื่อ unambiguous criterion

---

## 🎯 Flag schedule (5 flags ของ Phase 1-2 features)

| Flag | Feature | Flip condition |
|---|---|---|
| **F1** `dinoco_sn_system_enabled` | Master kill switch (Phase 1 schema + REST + LIFF activate) | All Phase 1 W4 acceptance criteria pass |
| **F2** `dinoco_sn_block_legacy_serial_code` | Block direct edit of `serial_code` field (force sn_pool source of truth) | After Phase 2 W7 (member dashboard migrated) + 1 wk monitoring |
| **F3** `dinoco_sn_require_2sig_for_swap` | Force 4-eyes approval on swap registered | After Phase 2 W5 (Role Manager UI complete + boss assigns approvers) |
| **F4** `dinoco_sn_strict_role_check` | Disable manage_options fallback (require specific cap) | Phase 3 W8 (after 1 month observing role assignments work correctly) |
| **F5** `dinoco_sn_pubapi_enabled` | F#15 Public API (deferred Q22) | When boss approves partner use case |

---

## ✅ "ทุกอย่างเสร็จ" Definition (F1 master flag — primary gate)

### A. Code completeness (technical)

- [x] Phase 1 W2 — Schema + REST core (`Manager` V.0.4 + `REST API` V.0.3 + `LIFF` V.0.1)
- [x] Phase 1 W3 — Admin tabs + LIFF activate flow + F#3 auto-fill claim
- [ ] **Phase 1 W4** — Hierarchy resolver pre-flight check + observability `dinoco_obs_capture` + 100-plate pilot batch generated + tests + Wiki/CLAUDE.md docs final
- [ ] **Phase 2 W5** — Tab 4 จัดการ S/N + 3-tier Approval + delegate list (Role Manager V.0.2 ✅) + SLA timer + auto-escalation Telegram
- [ ] **Phase 2 W6** — Gateway/Manual Invoice/MCP/Service Center/Manual Transfer integration (existing snippets V.31.0)
- [ ] **Phase 2 W7** — Member Dashboard 3 snippets V.31.0 atomic deploy (5-step strategy)

### B. Operational readiness

- [x] **LINE Premium tier ฿1,500/mo activated** (Q11 — boss confirmed paid 2026-05-05 R2)
  - F#1 + F#4 + F#10 cron concurrent firing = OK (Premium quota unlimited / high-tier)
- [x] **Pilot decision: B — Skip pilot** (boss 2026-05-05 R2). Replace with internal QA test 50 cases (Phase 1 W4) + production batch sent to factory at Phase 2 W6 (parallel)
- [ ] **Approver delegate list assigned** (Q15 — boss assigns role via UI Q15 V.0.2 matrix)
- [ ] **Service Center role assigned** (`dinoco_sn_view_pii` role to staff)
- [ ] **Warehouse role assigned** (`dinoco_sn_warehouse` role to receiving team)

### C. Test coverage

- [x] PHPUnit ≥ 1217 tests (current 1217 ✅)
- [x] Jest ≥ 1493 tests (current 1493 ✅)
- [ ] **End-to-end flow test**:
  - [ ] Boss creates batch 100 plates → CSV/PDF downloads ทำงาน
  - [ ] Warehouse scans plate → status=in_pool ✓
  - [ ] Customer scans QR → activate flow → warranty_registration created + LINE Flex received
  - [ ] Service Center opens claim → S/N validation pass → status=claimed
  - [ ] Customer transfers warranty → atomic flip ✓
- [ ] **Telegram alert test** — บอสได้รับ test alert จาก SN system

### D. Risk mitigation

- [ ] **Backup script run** — full DB snapshot ก่อน F1 flip (rollback safety)
- [ ] **Rollback tested** — flip OFF → existing legacy `serial_code` flow ยังทำงาน
- [ ] **Observability deployed** — `dinoco_obs_capture` ทุก sensitive op + Sentry DSN ตั้งใน Phase 0 W1 ✅
- [ ] **Audit retention cron registered** — `dinoco_sn_audit_retention_cron` (3y/5y split) ✅

---

## ✅ F2 — Block legacy serial_code edits

**Flip when**:
- F1 ON for ≥ 1 wk + 0 critical bugs
- Member Dashboard 3 snippets V.31.0 deployed (Phase 2 W7)
- All Service Center / Claim / Transfer flows tested with sn_pool path
- Backfill 100% legacy `serial_code` → sn_pool (verified count parity)

---

## ✅ F3 — Force 4-eyes on swap registered

**Flip when**:
- F1 ON
- Phase 2 W5 — Role Manager UI deployed ✅ (V.0.2 done)
- Boss assigns ≥ 2 users to `dinoco_sn_approver` role
- Test 4-eyes flow: actor request → approver receives Flex → approve → execute → customer LINE notify

---

## ✅ F4 — Strict role check (disable manage_options fallback)

**Flip when**:
- F1+F3 ON for ≥ 1 month
- All admin/REST endpoints migrated to `dinoco_sn_user_can($cap)` (per snippet)
- 0 incidents of "permission denied" for legitimate admins
- Audit log shows all role assignments stable

---

## ✅ F5 — Public API enable (Q22 deferred)

**Flip when**:
- Boss confirms partner use case (insurance / dealer / police / other)
- HMAC raw-secret wiring tested with partner
- Rate limit + IP allowlist + audit log tested
- Postman/sample code published to partner

---

## 🚀 Recommended flip order (lowest risk first)

1. **Week now**: F1 OFF (current state, backward compat) — keep until Phase 1 W4 done
2. **Week 4** (after pilot 100 plates ok): F1 ON
3. **Week 5** (after Role Manager assignments): F3 ON
4. **Week 7** (after Member Dashboard atomic deploy): F2 ON
5. **Month 2**: F4 ON (strict mode after stable observation)
6. **Q3** (when boss has partner): F5 ON

---

## 🛑 Hard rollback procedure

ถ้ามี critical bug หลัง flip:

```sql
-- Soft kill switch (instant, no redeploy)
UPDATE wp_options SET option_value = '0' WHERE option_name = 'dinoco_sn_system_enabled';

-- หรือ admin command line (preferred):
wp option update dinoco_sn_system_enabled 0
```

หลังจากนั้น:
- ทุก REST endpoint return 503 `feature_disabled`
- Admin shortcode ขึ้น maintenance message
- Customer LIFF activate fallback ไปหน้าลงทะเบียนเดิม `[dinoco_gateway]`
- existing `serial_code` field + warranty_registration CPT ทำงานปกติ (ไม่ถูกแตะ)

**Recovery time**: < 30 วินาที — ทันที

---

## 📊 Current readiness score

| Phase | Status |
|---|---|
| Phase 1 W2 (Schema + REST) | ✅ Complete |
| Phase 1 W3 (Admin tabs + LIFF + claim) | ✅ Complete |
| Phase 1 W4 (Pilot + tests + docs) | ⚠️ ~60% (missing pilot + acceptance test) |
| Phase 2 W5 (Tab 4 + Approval + Role Manager) | ⚠️ ~30% (Role Manager V.0.2 ✅ / Tab 4 + workflow pending) |
| Phase 2 W6 (Existing system integration) | ⏸️ Not started |
| Phase 2 W7 (Member Dashboard 3 snippets) | ⏸️ Not started (helpers V.0.18 ready) |
| LINE Premium tier paid | ⏸️ Pending boss |
| Approver assignments | ⏸️ Pending boss (V.0.2 UI ready) |

**Overall F1 readiness**: ~50% — estimate 4-6 weeks ถึง F1 flip

---

## 🔗 Cross-references

- `docs/sn-system/07-boss-decisions-log.md` — F1-F5 boss schedule decision
- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13 §Phase 1-6 schedule
- Hard rollback procedure tested: ✅ kill switch in `[Admin System] DINOCO Production SN Manager` line ~860 (`get_option('dinoco_sn_system_enabled', '0')` gate everywhere)
