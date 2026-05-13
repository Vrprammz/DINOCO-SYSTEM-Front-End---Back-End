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
| **QW-5** | Refer-a-Friend Code | ✅ MVP + Member Dashboard UI LANDED 2026-05-13 (V.0.7 + Member Dashboard Main V.31.6) | 9/10h | Redemption hook at warranty extension checkout (final 1h) | Tech Lead |
| **QW-7** | Smart Service Reminder (1y check-up push) | 🟡 KB-BLOCKED | ~4h | Need product service interval data in KB | Tech Lead + KB team |

**QW-5 implementation status** (commit pending this batch):

- ✅ Schema reuse: existing `wp_dinoco_sn_promo_codes` table — `refer_a_friend` type added
- ✅ Helper: `dinoco_sn_get_or_create_referral_code($user_id)` — idempotent per-user (stored in user meta `dinoco_sn_referral_code`)
- ✅ Helper: `dinoco_sn_get_referral_stats($user_id)` — returns `{code, redeemed_count, reward_pending}`
- ✅ Auto-trigger: listens to `dinoco_sn_pool_status_changed_for_user` (R3 cache invalidation chain) → fires on first registration
- ✅ Defensive: try/catch + `dinoco_obs_capture_exception` (R11 signature)
- ✅ Drift detector: `tests/jest/sn-qw5-refer-a-friend-drift.test.js` (11+10 assertions Phase 6+7)
- ✅ Reward configurable via `wp_option dinoco_sn_referral_reward_thb` (default 100.0)
- ✅ **Member Dashboard UI** (Phase 7 P2 2026-05-13, V.31.6): green gradient card with code + copy-to-clipboard btn + LINE share deep link + stats row (when redeemed > 0). Renders only if user has plates registered.
- ⏳ TODO: Redemption hook (when friend uses code → mark referrer reward credit pending) — wire to Warranty Extension Marketplace checkout coupon flow
- ⏳ TODO: Admin approval flow for crediting referrer reward (manual review prevents abuse)

### RD (Revenue Drivers) — Analytics + ML

| ID | Feature | Status | Effort | Blocker | Owner |
| --- | --- | --- | --- | --- | --- |
| **RD-2** | CLV Dashboard cohort analysis (signup month / tier movement) | ✅ MVP LANDED 2026-05-13 (V.0.46) — `/ltv/cohorts` endpoint with 5-tier × N-month matrix + retention pct + monthly/tier/grand totals. Admin UI viewer deferred. | 3/6h | None | Tech Lead |
| **RD-4** | Smart Cross-Sell ML Recommendation | 🟡 DATA-BLOCKED | ~20h | Need ≥12 months of historical data + Gemini training budget | Boss decision |

### RM (Risk Mitigators) — Anti-fraud + Trust

| ID | Feature | Status | Effort | Blocker | Owner |
| --- | --- | --- | --- | --- | --- |
| **RM-3** | Stolen Plate (admin-only flow) | ✅ DONE 2026-05-13 (V.0.30 Manager Tab 9 + Member Dashboard form) — บอส clarified ไม่ต้อง MOU/public lookup. Existing flow เพียงพอ: ลูกค้าลงบันทึกประจำวันที่ตำรวจ → ถ่ายรูปอัพโหลดในระบบ → admin verify | done | None | Tech Lead |
| **RM-4** | Plate Authenticity Public API (paid tier) | ⚪ DEFERRED Q22 | ~16h | Boss deferred per Q22 (no use case yet) | บอส (flag flip when ready) |

### OP (Operational Excellence)

| ID | Feature | Status | Effort | Blocker | Owner |
| --- | --- | --- | --- | --- | --- |
| **OP-3** | Bulk Admin Actions Wizard (bulk relink / void / export / notify) | ✅ MVP LANDED 2026-05-13 (V.0.45) — 2/5 endpoints (`/bulk/void` + `/bulk/export`) | 5/12h | None — spec in plan §K.4 | Tech Lead |
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
- **RD-4 Cross-Sell ML** — needs 12mo+ of registration + purchase data (currently ~5mo since SN launch 2026-05-04). ✅ บอส OK
- **OP-4 Multi-Warehouse Transfer** — only when DINOCO opens 2nd warehouse. ✅ บอส OK
- ~~**RM-3 Stolen Public Lookup**~~ — CUT 2026-05-13 บอส clarified existing admin-only flow เพียงพอ (police report + photo upload). No MOU needed.

## ✂️ CUT items (no longer in scope)

- **Schema V.1.1 → V.1.2 migration runbook** — CUT 2026-05-13. Production server path `/var/www/dinoco.in.th` doesn't exist + `wp` CLI not installed. WordPress code snippets architecture auto-loads schema via `dinoco_sn_install_schema()` on first `admin_init` (lazy install) — no manual CLI migration needed. If future schema bump requires data backfill, will use direct SQL via phpMyAdmin or hosting panel SSH path verified at that time.

## ✅ Done outside Phase 6 backlog (FYI for context)

- **RPi V.42 restart** — DONE 2026-05-13 (boss confirmed)

---

## 📅 Re-review cadence

- **Monthly** — re-evaluate boss priorities + check if blockers cleared
- **Quarterly** — promote items from this backlog into Phase 7+ if business case crystallizes

---

## 🗣️ Boss Decisions 2026-05-13

ตอบจาก challenge "ที่ติด คือติดอะไร" — บอส clarify status ของ 11 blockers:

| # | Item | บอส decision | Action |
| --- | --- | --- | --- |
| 1 | Schema V.1.2 migration runbook | **ตัดออก** (SSH path `/var/www/dinoco.in.th` ไม่มี + `wp` CLI ไม่ลง) | CUT — lazy install ของ snippet ทำงานอยู่แล้วบน `admin_init`. ถ้าต้อง backfill ใช้ phpMyAdmin หรือ SSH path ใหม่ตอน need |
| 2 | RM-3 Stolen Plate Public Lookup | **ไม่ต้อง MOU** — existing flow เพียงพอ (ลูกค้าลงบันทึกประจำวัน + ถ่ายภาพอัพโหลด → admin verify) | ✅ DONE (admin-only Tab 9 + Member Dashboard form). Public lookup CUT permanent |
| 3 | LT-1 Public Dealer Portal API | **REPLAN 2026-05-13**: ทุกร้านไม่มี POS → ไม่ต้องสร้าง public API. แทนที่ด้วย **Flex Scan เช็คประกัน @ บอท** (ตัวแทนกดในกลุ่ม → LIFF scan QR → ดู warranty) | 🆕 IMPLEMENTING — scope ~6h instead of 40h |
| 4 | LT-2 IoT/BLE Chip | **ตัดออก** (ยังไม่มีแผน + เยอะเกินไป) | CUT permanent |
| 5 | F#15 Public API (Q22) | DEFERRED | Flag stays OFF |
| 6 | RD-4 Smart Cross-Sell ML | **ok** | Wait for 12mo data (currently ~5mo) |
| 7 | QW-7 Smart Service Reminder | **ดี ทำ** | 🆕 IMPLEMENTING — KB data deferred, ใช้ generic checklist ก่อน (~4h) |
| 8 | OP-4 Multi-Warehouse Transfer | **ok** | Only when 2nd warehouse opens |
| 9 | Boss-deferred items | **ok** | Stay in this tracker — revisit monthly |
| 10 | Customer Support training/docs | (no input) | Continue per existing plan |
| 11 | RPi V.42 restart | **ทำไปแล้ว** | ✅ DONE |

## 📖 Feature Explanations (LT-1 / LT-2 / QW-7)

### LT-1 Flex Scan เช็คประกัน @ บอท (REPLAN 2026-05-13)

**Original LT-1 cut**: Public Dealer Portal API ตัดออก เพราะตัวแทนทุกร้านไม่มี POS

**New approach**: เพิ่มเมนู scan เช็คประกัน ใน Flex menu @ บอท (LINE group)

**User flow**:

1. ตัวแทนกด `@DINOCO` ในกลุ่ม LINE → Flex menu โผล่ขึ้นมา
2. กดเมนูใหม่ "🔍 เช็คประกัน" → เปิด LIFF page
3. LIFF เปิดกล้อง → scan QR เพลทลูกค้า (หรือพิมพ์ S/N เอง)
4. แสดง warranty status: ✓ active / ⛔ expired / ⚠️ stolen / ⚠️ recalled
5. แสดงข้อมูลย่อ: top_set_name + warranty_until + days_left + linked customer (masked phone)
6. กรณีเคลม → ปุ่ม "เปิดเคลมให้ลูกค้า" → redirect ไป claim form

**Scope**:

- Flex menu item ใหม่ ใน B2B Snippet 2 หรือ B2B Snippet 1 (Flex builders)
- NEW LIFF page: `/b2b-warranty-check?dealer_id=...` (B2B Snippet 12 หรือ snippet ใหม่)
- Reuse existing `/dinoco-sn/v1/lookup/{sn}` endpoint (ที่มี HMAC URL sign แล้ว)
- Add dealer-scoped permission check (ดีลเลอร์ดูได้แค่ลูกค้าของตัวเอง? หรือดูได้หมด? ต้องถาม)

**Effort**: ~6h (Flex menu + LIFF page + permission)

### LT-2 IoT / BLE Chip Integration — CUT 2026-05-13

ตัดออก. บอสตัดสินใจ "ยังไม่มีแผน + เยอะเกินไป" — ไม่ทำในระยะใกล้นี้.

### QW-7 Smart Service Reminder

**Purpose**: แจ้งเตือนลูกค้าให้ **ตรวจสภาพสินค้า** ตามรอบ (เช่น 1 ปี) — value-add ไม่ขายของ

**Example LINE Flex**:

```text
🔔 ครบ 1 ปีแล้ว!
ชุดกันล้ม Honda XL750 PRO ของคุณ
ใช้มาครบปี — ลองตรวจสภาพสักหน่อยไหม?

📋 Checklist
• เช็คน็อตขันแน่น
• ตรวจรอยขีดข่วน/รอยสนิม
• เช็คฟองน้ำ/ยาง

[ ดู Tips ฉบับเต็ม ]   [ ถามทีมงาน ]
```

**Different from F#4 Anniversary**: F#4 = "ขอบคุณ + coupon 5%" (sale-driven). QW-7 = "ดูแลสินค้า + checklist" (educational, no sale).

**Value**: Customer love + ลด claim rate + brand authority

**Blocker**: ต้องมี product service interval data ใน KB ก่อน (ทีม KB ทำ ~1 สัปดาห์) → coding 4h หลัง KB พร้อม

## 📚 Related

- `docs/sn-system/33-phase6-strategic-foundations.md` — LT-1..LT-4 strategic platform extensions
- `docs/sn-system/26-operations-pending-decisions.md` — boss operational items (mostly closed 2026-05-09)
- `docs/sn-system/21-r3-audit-pending-items.md` — R3 audit deferred items (D1-D7)
- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13 §Phase 6 Backlog
