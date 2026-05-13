# 34 — Phase 6 Backlog Tracker (Q3 2026+)

**Date**: 2026-05-13
**Source**: Plan v2.13 §Phase 6 Backlog (deferred from v2.8/v2.9/v2.10)
**Status**: Living tracker — update เมื่อ items implemented / blocked / unblocked

---

## 🎯 Purpose

Phase 1-5 deliver complete S/N + warranty + marketplace stack. Phase 6 = strategic platform extensions (LT-1..LT-4) + quality-of-life backlog (QW/RD/OP items). This doc tracks the **9 backlog items** beyond LT-1..LT-4 strategic foundations.

LT-1..LT-4 tracked separately in `docs/sn-system/33-phase6-strategic-foundations.md`.

---

## 📋 Backlog Items (9 total)

### QW (Quick Wins) — Customer-facing growth/UX

| ID | Feature | Status | Effort | Blocker | Owner |
| --- | --- | --- | --- | --- | --- |
| **QW-2** | Digital Wallet Card (Apple Wallet `.pkpass` + Google Pay JWT) | 🔴 BLOCKED | ~12h | Apple Developer account + Google Wallet partnership | บอส (vendor decision) |
| **QW-5** | Refer-a-Friend Code | ✅ MVP LANDED 2026-05-13 (V.0.7) | 6/10h | Member dashboard UI surface pending | Tech Lead |
| **QW-7** | Smart Service Reminder (1y check-up push) | 🟡 KB-BLOCKED | ~4h | Need product service interval data in KB | Tech Lead + KB team |

**QW-5 implementation status** (commit pending this batch):

- ✅ Schema reuse: existing `wp_dinoco_sn_promo_codes` table — `refer_a_friend` type added
- ✅ Helper: `dinoco_sn_get_or_create_referral_code($user_id)` — idempotent per-user (stored in user meta `dinoco_sn_referral_code`)
- ✅ Helper: `dinoco_sn_get_referral_stats($user_id)` — returns `{code, redeemed_count, reward_pending}`
- ✅ Auto-trigger: listens to `dinoco_sn_pool_status_changed_for_user` (R3 cache invalidation chain) → fires on first registration
- ✅ Defensive: try/catch + `dinoco_obs_capture_exception` (R11 signature)
- ✅ Drift detector: `tests/jest/sn-qw5-refer-a-friend-drift.test.js` (11 assertions)
- ✅ Reward configurable via `wp_option dinoco_sn_referral_reward_thb` (default 100.0)
- ⏳ TODO: Member Dashboard UI section "Refer a Friend" (show code + redeemed count + share link)
- ⏳ TODO: Redemption hook (when friend uses code → mark referrer reward credit pending)
- ⏳ TODO: Admin approval flow for crediting referrer reward (manual review prevents abuse)

### RD (Revenue Drivers) — Analytics + ML

| ID | Feature | Status | Effort | Blocker | Owner |
| --- | --- | --- | --- | --- | --- |
| **RD-2** | CLV Dashboard cohort analysis (signup month / tier movement) | ⏳ TODO | ~6h | None (data exists in `sn_customer_ltv_snapshot`) | Tech Lead |
| **RD-4** | Smart Cross-Sell ML Recommendation | 🟡 DATA-BLOCKED | ~20h | Need ≥12 months of historical data + Gemini training budget | Boss decision |

### RM (Risk Mitigators) — Anti-fraud + Trust

| ID | Feature | Status | Effort | Blocker | Owner |
| --- | --- | --- | --- | --- | --- |
| **RM-3** | Stolen Plate Public Lookup | 🔴 PARTNERSHIP-BLOCKED | ~8h | Police partnership + legal framework | บอส |
| **RM-4** | Plate Authenticity Public API (paid tier) | ⚪ DEFERRED Q22 | ~16h | Boss deferred per Q22 (no use case yet) | บอส (flag flip when ready) |

### OP (Operational Excellence)

| ID | Feature | Status | Effort | Blocker | Owner |
| --- | --- | --- | --- | --- | --- |
| **OP-3** | Bulk Admin Actions Wizard (bulk relink / void / export / notify) | ⏳ TODO | ~12h | None — spec in plan §K.4 | Tech Lead |
| **OP-4** | Plate Inventory Multi-Warehouse Transfer | 🟡 BUSINESS-BLOCKED | ~10h | Only relevant if DINOCO operates 2+ warehouses | บอส |

---

## 🚦 Recommended Next Picks (by ROI + unblocked)

Priority order based on (1) clear scope, (2) no external blocker, (3) revenue/UX impact:

1. **OP-3 Bulk Admin Actions Wizard** (~12h) — admin productivity boost. Plan §K.4 has detailed spec including UI sketches + REST endpoint shapes + background job queue + undo window. Boss will use directly.
2. **QW-5 finish** (~4h remaining) — Member Dashboard UI + redemption hook + admin approval. Foundation already landed 2026-05-13.
3. **RD-2 CLV cohort analysis** (~6h) — extend existing Tab 6 LTV with cohort segmentation (signup month / tier movement over time). Data exists, no blocker.
4. **QW-7 Smart Service Reminder** — 4h coding + need product KB intervals first.

---

## ⚪ Long-blocked (revisit when external gate clears)

- **QW-2 Digital Wallet Card** — needs Apple Developer account ($99/yr) + Google Wallet API approval + asset design
- **RD-4 Cross-Sell ML** — needs 12mo+ of registration + purchase data (currently ~5mo since SN launch 2026-05-04)
- **RM-3 Stolen Public Lookup** — needs police partnership MOU
- **OP-4 Multi-Warehouse Transfer** — only when DINOCO opens 2nd warehouse

---

## 📅 Re-review cadence

- **Monthly** — re-evaluate boss priorities + check if blockers cleared
- **Quarterly** — promote items from this backlog into Phase 7+ if business case crystallizes

---

## 📚 Related

- `docs/sn-system/33-phase6-strategic-foundations.md` — LT-1..LT-4 strategic platform extensions
- `docs/sn-system/26-operations-pending-decisions.md` — boss operational items (mostly closed 2026-05-09)
- `docs/sn-system/21-r3-audit-pending-items.md` — R3 audit deferred items (D1-D7)
- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13 §Phase 6 Backlog
