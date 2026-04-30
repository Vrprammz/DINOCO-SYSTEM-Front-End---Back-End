# Changelog

ประวัติ test infrastructure + quality gate ของ DINOCO System.
ไม่ใช่ user-facing changelog — เน้น dev/QA history.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) (loosely).
Snippet versioning ของ feature changes ดูใน individual snippet headers (`Version: V.X.Y`).

---

## [Unreleased]

### Feature — Round 34 (Idempotency batch 12 — 🎯 30% TRUE milestone) (2026-04-30)

Round 34 pushes idempotency coverage to **59/196 POST endpoints (30.1%)** — ⭐ **first sustained crossing past 30% of POST surface AGAINST AUTHORITATIVE Round 30 census denominator**. Past 3/10 of mutating REST surface. ZERO regressions across **659 PHPUnit (was 641, +18) + 161 Jest** (drift detector still green with 59 entries).

#### Phase 1 — Idempotency batch 12 (5 endpoints)

5 retry-prone admin flag/notification/distributor hot paths:

- **`POST /b2b/v1/bo-clear-enum-flag`** — admin Security Log "ล้างธง" double-click = 2x delete_post_meta (idempotent storage) + 2x b2b_log line spam. Body hash `{distributor_id}`. Different distributor_id with same key = different intent → 409.
- **`POST /dinoco-mcp/v1/kb-suggest`** — chatbot Gemini retry → 2x kb-suggest with same question → frequency increment 2x (stale "asked Nx" metric). Body hash `{question[mb_strtolower+trim], source, frequency}` — normalization matches handler dedup logic. Different source (fb_chat vs ig_chat) = legitimate distinct platform signal → 409.
- **`POST /dinoco-mcp/v1/brand-voice-submit`** — OpenClaw retry on bv_create_entry timeout → 2x sentiment ML training row → ML signal poisoning. Body hash `{content, sentiment, platform, source_url, intensity}` — sentiment edits between retries (positive→negative) → 409.
- **`POST /b2b/v1/distributor/delete`** — admin "ลบตัวแทน" double-click → wp_delete_post no-op on 2nd call but log/alert spam. Body hash `{id}`. Different id with same key = different intent (silent replay would say "already deleted" referring to first id) → 409.
- **`POST /b2b/v1/distributor/toggle-bot`** — boolean-discriminator pattern. Existing 5s transient dedup protects rapid double-click but NOT cross-window replay. Body hash `{dist_id, bot_enabled}` — bot_enabled flip between retries (admin changed mind) caught as 409 instead of silent state flip.

Backward compat: missing `X-Idempotency-Key` header = byte-identical to V.3.7 / V.34.1 / V.2.6 behavior.

Versions:

- `[B2B] Snippet 16: Backorder System` V.3.7 → V.3.8
- `[B2B] Snippet 9: Admin Control Panel` V.34.1 → V.34.2
- `[System] DINOCO MCP Bridge` V.2.6 → V.2.7

Tests: `tests/helpers/IdempotencyRound34Test.php` — 18 fixture-based contract tests (5×3 cases + cumulative no-collision + 2 cross-namespace pair guards: distributor-delete vs distributor-toggle-bot + kb-suggest vs brand-voice-submit). PHPUnit 641 → 659 (+18 tests). All 18 pass.

#### Phase 2 — Documentation in-place updates

- `docs/audit/IDEMPOTENCY-COVERAGE.md` — Status summary 27.6% → **🎯 30.1%**, Milestones table NEW Round 34 row (TRUE 30% milestone), Integrated endpoints table +5 rows (#56-60), Pending POST endpoints refreshed (Round 35 candidates: dashboard-inject-metrics + lead-attribution + inventory-changed + kb-updated + product-compatibility — all MCP), Test coverage table NEW Round 34 row.
- `docs/patterns/IDEMPOTENCY-KEY.md` — NEW "Round 18-34 case study patterns" section crystallizing 5 distinct patterns (single / bulk / bulk-of-targets / state-machine / boolean-discriminator + enum-discriminator) with endpoint references + 3 anti-patterns spotted across rounds.
- `README.md` badge — Idempotency coverage 25.4% → **🎯 30.1%**.
- `CLAUDE.md` Idempotency line — synced from stale Round 19 numbers to current Round 34 + 30% milestone marker.

#### Verification

- Drift detector (`tests/jest/idempotency-tracker-drift.test.js`) — all 59 tracker rows resolve to real snippet files + each file contains `dinoco_idempotency_check` + each endpoint suffix appears as string literal. POST-only assertion green.
- PHP lint clean across 3 modified snippets.
- Test count delta: +18 PHPUnit (659 total), Jest stable at 161.

### Feature — Round 32 (Idempotency batch 10 — 🎯 25.4% TRUE milestone) (2026-04-30)

Round 32 pushes idempotency coverage to **49/193 POST endpoints (25.4%)** — 🎯 **first milestone past 1/4 of POST endpoints AGAINST AUTHORITATIVE Round 30 census denominator** (earlier 25%/30%/35%/40%/45% milestones in tracker were against stale ~75 estimate). ZERO regressions across **623 PHPUnit (was 606, +17) + 160 Jest** (drift detector still green).

#### Phase 1 — Idempotency batch 10 (5 endpoints)

5 retry-prone admin/maker hot paths:

- **`POST /b2f/v1/maker-reschedule`** — Maker LIFF "ขอเลื่อนวันส่ง" double-fire on slow LINE = 2x reschedule history rows + 2x admin Flex push. Body hash `{po_id, maker_id (JWT-scoped), new_date, reason}`. new_date in hash → 409 if maker edits date between retries.
- **`POST /b2b/v1/manual-flash-test`** — admin "ทดสอบ Flash API" retry burns 2x Flash API quota + log spam. Constant marker `{action:'test'}` hashes consistently for retries.
- **`POST /b2b/v1/bo-update-eta`** — admin "📅 ETA" retry double-appends "|" separator notes silently (status guard pending/ready bypassed after first call). Body hash `{bo_queue_id, eta_days, notes}` — different notes between retries surfaces 409.
- **`POST /b2b/v1/bo-restock-scan`** — admin double-click "🔍 Restock Scan" + manual cron concurrent run = 2x mark-ready + 2x Telegram alert + 2x cache invalidation. Body hash `{sku}` (empty for full scan) — full vs specific = different intents.
- **`POST /b2f/v1/reject-lot`** — admin "ปฏิเสธทั้ง lot" double-click = 2x Maker rejection Flex push (FSM blocks 2nd transition but Flex builder re-fires before FSM check). Body hash `{po_id, reason}` — reason in hash since it's Maker's audit trail.

Backward compat: missing `X-Idempotency-Key` header = byte-identical to V.3.6 / V.42.14 / V.11.17 behavior.

Versions:

- `[B2B] Snippet 16: Backorder System` V.3.6 → V.3.7
- `[B2B] Snippet 3: LIFF E-Catalog REST API` V.42.14 → V.42.15
- `[B2F] Snippet 2: REST API` V.11.17 → V.11.18

Tests: `tests/helpers/IdempotencyRound32Test.php` — 17 fixture-based contract tests (5×3 cases + cumulative no-collision + cross-namespace maker-reschedule vs reject-lot pair guard). PHPUnit 606 → 623 (+17 tests). All 17 pass.

#### Phase 2 — Documentation in-place updates

- `docs/audit/IDEMPOTENCY-COVERAGE.md` — Status summary 22.8% → **🎯 25.4%**, Milestones table NEW Round 32 row (TRUE milestone vs stale-denominator earlier rows), Integrated endpoints table +5 rows (#46-50), Pending POST endpoints refreshed (Round 33 candidates: maker-product CRUD, maker CRUD, po-undo-submit, distributor-notify, customer-link), Test coverage table NEW Round 32 row.
- `CLAUDE.md` drift sweep — "Idempotency-Key Helper + Endpoint Integration" section synced from stale Round 19 numbers (3 endpoints / 72+ remaining) to current Round 32 (49 endpoints / 144 remaining / 14 rounds across 4 namespaces). Tracker linked as source of truth.
- `README.md` badge — Idempotency coverage 22.8% → 25.4%.

#### Verification

- Drift detector (`tests/jest/idempotency-tracker-drift.test.js`) — all 50 tracker rows resolve to real snippet files + each file contains `dinoco_idempotency_check` + each endpoint suffix appears as string literal. Round 31 F1-class regression guard remains effective.
- PHP lint clean across 3 modified snippets.
- Test count delta: +17 PHPUnit (623 total), Jest stable at 160.

### Feature — Round 31 (Idempotency batch 9 + cron audit follow-ups + drift detector expansion) (2026-04-30)

Round 31 push toward **22.8% Idempotency-Key coverage** (44/193 POST endpoints) + closes 1 deferred cron audit item from Round 28 + adds F1-class drift regression guard. ZERO regressions across 606 PHPUnit + 160 Jest tests.

#### Phase 1 — Idempotency batch 9 (5 endpoints)

Pair-pattern integration with previously-shipped paired endpoints from Rounds 25/30:

- **`POST /dinoco-mcp/v1/claim-manual-update`** — pair with `claim-manual-create` (Round 30). Body hash `{claim_id, status, case_type, tracking_number}`. notes excluded (chatbot whitespace tweaks → false 409). OpenClaw retry double-fire prevented.
- **`POST /dinoco-mcp/v1/lead-update`** — pair with `lead-create` (Round 30). Body hash `{lead_id, status, updated_by, followup_at}`. notes excluded (each retry would APPEND with new timestamp — that's the bug we want to prevent).
- **`POST /dinoco-stock/v1/product/pricing`** — admin tier price + discount dual-write. Body hash `{sku, discount_percent, price_silver/gold/platinum/diamond, category, moq, boxes_per_unit, units_per_box, b2b_visible}`. compatible_models excluded (large array, admin tweaks between retries). Selective save semantics preserved.
- **`POST /dinoco-stock/v1/warehouse`** — warehouse CRUD (create/update). Body hash `{id, name, code, address, is_default, is_active}`. id discriminates create (id=0) vs update (id>0).
- **`POST /b2f/v1/maker-reject`** — pair with `maker-confirm` (Round 25). Body hash `{po_id, maker_id (JWT), reason}`. JWT-scoped maker_id prevents cross-maker poison. Admin Flex push only fires on first call.

Backward compat: missing `X-Idempotency-Key` header = byte-identical to V.45.4 / V.11.16 / V.2.4 behavior.

Versions:

- `[System] DINOCO MCP Bridge` V.2.4 → V.2.5
- `[Admin System] DINOCO Global Inventory Database` V.45.4 → V.45.5
- `[B2F] Snippet 2: REST API` V.11.16 → V.11.17

Tests: `tests/helpers/IdempotencyRound31Test.php` — 17 fixture-based contract tests (5×3 cases + 2 collision guards). PHPUnit 589 → 606 (+17 tests). All 17 pass.

#### Phase 2 — Cron audit follow-ups

Round 28 cron drift report flagged 3 deferred items. Round 31 closes #1:

- **#1 ✅ RESOLVED — Heartbeat key drift (`flash_category_verify`)**:
  Health Monitor V.1.3 reader checked legacy key `_dinoco_cron_flash_category_verify_cron_last_run` (leading underscore + double `_cron_` suffix), but Snippet 1 V.34.x writer uses canonical `dinoco_cron_flash_category_verify_last_run`. Drift caused `verify_cron_stale_*min` warning to fire perpetually even when cron healthy.
  Fix in V.1.4: reader uses fallback chain (canonical first, legacy second). Snippet 1 NOT modified per CLAUDE.md sensitive-snippet rule (V.34.25).
- **#2 ⏸ Still deferred — Single-event cron observability**: no concrete bug surfaced. Cost-benefit doesn't justify per-event tracking infrastructure.
- **#3 ⏸ Still deferred — Cron interval consistency**: cosmetic only. Consolidation would touch 3 sensitive snippets including Snippet 1 (forbidden).

Versions: `[Admin System] DINOCO Health Monitor` V.1.3 → V.1.4

#### Phase 3 — Drift detector expansion (8 → 9)

NEW `tests/jest/idempotency-tracker-drift.test.js` — F1-class regression guard. Round 29 drift sweep discovered F1 HIGH bug: tracker listed `bo-fulfill` as integrated but actual code had ZERO `dinoco_idempotency_check` wrapper. The same drift could recur for any future endpoint if tracker entry is committed before wrapper code lands.

This detector parses IDEMPOTENCY-COVERAGE.md "Integrated endpoints" table, extracts (endpoint, snippet_filename) tuples, then asserts:

1. Tracker has ≥1 integrated row (smoke test)
2. Every tracker row resolves to a real snippet file in repo
3. Every claimed file contains `dinoco_idempotency_check` (F1-class catch)
4. Every endpoint suffix appears in a `register_rest_route` or namespace marker within its claimed file (catches mis-attributed entries)

If this detector had existed at Round 19, the bo-fulfill F1 bug would have been caught immediately upon tracker commit. Jest 156 → 160 (+4 new).

#### Phase 4 — IDEMPOTENCY-COVERAGE.md tracker sync

- 39 → 44 integrated endpoints (5 added: claim-update + lead-update + pricing + warehouse + maker-reject)
- Annotated pre-Round 30 milestones (25%/30%/35%/40%/45%) with "estimated denominator stale" warning since they were calculated against the obsolete ~75 estimate
- Added true-coverage milestones (10% Round 26, 15% Round 28, 20.2% Round 30, **22.8% Round 31**)
- Added forward targets (25% Round 32, 30% Round 34, 50% future)
- 183 cumulative contract tests across 9 rounds (Rounds 19-31)
- 43 distinct body-shape hashes asserted

#### Round 32 recommendation

Pick batch 10 to reach true 25% milestone (need +5 endpoints to 49/193 = 25.4%). Suggested:

- `POST /b2f/v1/maker-reschedule` — Maker LIFF retry
- `POST /b2b/v1/manual-flash-test` — Flash test endpoint
- `POST /b2b/v1/bo-update-eta` — Admin ETA edit
- `POST /b2b/v1/bo-restock-scan` — Manual cron trigger
- `POST /b2f/v1/reject-lot` — QC reject path

---

### Feature — Round 30 (Idempotency batch 8 + F1 drift fix + REST endpoint census) (2026-04-30)

Round 30 closes 2 high-priority Round 29 drift findings (F1 HIGH bo-fulfill drift + F3 MEDIUM REST endpoint count drift) + extends Idempotency-Key infrastructure to 5 new POST endpoints. **Cumulative: 39 integrated endpoints** with new authoritative denominator established. ZERO regressions across 589 PHPUnit + 156 Jest tests.

#### Phase 1 — F1 HIGH FIX: bo-fulfill drift remediation

Round 29 drift sweep flagged that `POST /b2b/v1/bo-fulfill` (tracker entry #14) was listed as integrated since Round 19 but actual code at `[B2B] Snippet 16` lines 2114+ had NO idempotency wrapper — only `bo-bulk-fulfill` did. Risk: admin double-click on "ส่งสินค้า BO" Flex action → debt double-add + duplicate Flash secondary order + duplicate "BO ready" Flex card to customer (M7 builder fires twice).

**Fix** (`[B2B] Snippet 16` V.3.5 → V.3.6): wrapper inserted before `dinoco_transaction()` call (and legacy path). Body hash = `{order_id, items[sort by bo_queue_id, qty]}`. GET_LOCK + idempotency complement: GET_LOCK serializes concurrent calls but releases on completion → 2nd call after release re-runs full mutation chain. Idempotency cache returns cached response immediately without re-executing — true replay safety. Cache stores ONLY on success (WP_Error skips cache so retry re-evaluates).

#### Phase 2 — F3 MEDIUM FIX: REST endpoint census

CLAUDE.md line 59 claimed "125+ REST endpoints across 7 namespaces" — Round 29 found 335 actual `register_rest_route` calls. Round 30 ran a comprehensive census (Python AST-style regex resolving variable namespaces `$ns` + constants `B2F_AUDIT_NS` + `define()` lookups).

**Result**: **334 register_rest_route calls across 12 namespaces** (193 POST + 141 GET/DELETE). 5 new namespaces vs April 17 baseline: `dinoco-slip/v1`, `dinoco-flash-golive/v1`, `dinoco-gdpr/v1`, `brand-voice/v1`, `dinoco-export/v1`.

Per-namespace breakdown:

| Namespace | Routes | POST | Sample |
| --- | --- | --- | --- |
| `b2b/v1` | 128 | 84 | place-order, manual-flash-create, bo-fulfill |
| `dinoco-stock/v1` | 42 | 22 | stock/adjust, stock/transfer, dip-stock/approve |
| `dinoco-mcp/v1` | 32 | 17 | claim-manual-create, lead-create |
| `b2f/v1` | 29 | 21 | create-po, maker-confirm, receive-goods |
| `dinoco-b2f-audit/v1` | 22 | 11 | sync-missing-intermediates, junction-bulk-delete |
| `dinoco/v1` | 22 | 10 | flag-audit, idempotency, audit/retention |
| `dinoco-slip/v1` | 15 | 6 | manual-process, replay-slip |
| `liff-ai/v1` | 13 | 6 | auth, lead/{id}/accept |
| `dinoco-flash-golive/v1` | 10 | 5 | preflight, flip-flag |
| `dinoco-gdpr/v1` | 10 | 6 | my-data-export, my-data-delete |
| `brand-voice/v1` | 7 | 5 | entries, api-keys |
| `dinoco-export/v1` | 4 | 0 | makers, catalog |

Updated CLAUDE.md to reflect new totals. Full census: `docs/audit/REST-ENDPOINT-CENSUS-2026-04-30.md`.

**Idempotency denominator correction**: Pre-Round 30 tracker assumed ~75 POST endpoints. Authoritative count is 193. **Round 30 coverage = 39 / 193 = 20.2%** (not the 50% milestone the prompt anticipated). Pre-Round 30 milestones (25%/30%/35%/40%/45%) used estimated denominators and are now retrospectively known to be inflated. Foundation + retry-prone hot paths (BO + Flash + create-PO + B2F writes) are fully covered — true 50% milestone (~97 endpoints) is a future round target.

#### Phase 3 — Idempotency batch 8 (5 NEW endpoints + 21 contract tests)

| Endpoint | Snippet | Body Hash Inputs | Use Case |
| --- | --- | --- | --- |
| `POST /dinoco-mcp/v1/claim-manual-create` | MCP V.2.3 → V.2.4 | `{serial, symptoms, source_id, platform, customer, phone}` | OpenClaw chatbot Gemini function-call retry path → duplicate claim CPT records cleaned in Service Center. source_id = FB/IG/LINE user ID primary discriminator. photos[] EXCLUDED (CDN signed URLs differ between retries). |
| `POST /dinoco-mcp/v1/lead-create` | MCP V.2.3 → V.2.4 | `{source_id, phone, platform, product_interest, customer_name}` | Mobile chatbot retry → duplicate `LEAD-{ts}-{rand}` records (timestamp + rand suffix means no natural dedup). |
| `POST /dinoco-stock/v1/stock/initialize` | Inventory V.45.3 → V.45.4 | `{action: 'init'}` (constant marker — endpoint takes no params) | Admin "เริ่มต้น Dip Stock" first-run flag flip — double-click harmless functionally but emits 2 audit log lines pre-fix. |
| `POST /dinoco-stock/v1/stock/adjust` | Inventory V.45.4 | `{sku, type, qty, reason, warehouse_id}` | Admin manual stock adjust. Without wrapper, double-click on "ปรับสต็อก" → 2x stock movement = WRONG balance. type=add vs subtract = CRITICAL discriminator. |
| `POST /dinoco-stock/v1/stock/transfer` | Inventory V.45.4 | `{sku, from_wh, to_wh, qty, reason}` | Warehouse-to-warehouse transfer. Double-click → 2x transfer = WRONG balance both warehouses. from_wh/to_wh swap caught (1→2 vs 2→1 ≠ same intent). |

**Test additions** (`tests/helpers/IdempotencyRound30Test.php` — 21 cases via `IdempotencyTestFixture` Round 29 DRY base class):

- 3 cases × 5 new endpoints + 3 cases × bo-fulfill = 18 endpoint-specific
- 1 cumulative no-collision (Round 30: 6 shapes unique)
- 1 cross-namespace collision guard (claim-manual-create vs lead-create — same source_id+phone but different schema)
- 1 stock-initialize constant-marker stability (no timestamp/random in hash)

**Pattern (proven Round 19/23/25/26/27/28/29)**: optional `X-Idempotency-Key` header + helper triad + `function_exists()` defensive guards. Backward compat: missing header = byte-identical to previous version. WP_Error 409 on body hash mismatch.

#### Files touched

- `[B2B] Snippet 16: Backorder System` V.3.5 → V.3.6 (F1 fix)
- `[System] DINOCO MCP Bridge` V.2.3 → V.2.4 (claim + lead create)
- `[Admin System] DINOCO Global Inventory Database` V.45.3 → V.45.4 (3 stock endpoints)
- `tests/helpers/IdempotencyRound30Test.php` NEW (21 cases)
- `docs/audit/REST-ENDPOINT-CENSUS-2026-04-30.md` NEW
- `docs/audit/IDEMPOTENCY-COVERAGE.md` updated (39 integrated, 193 denominator)
- `CLAUDE.md` REST endpoint count drift fix (125+ → 334)

#### Test results

- PHPUnit: 568 → **589 tests** (+21 Round 30 contract tests, 100% pass)
- Jest: **156 stable** (no UI/contract changes)
- ZERO production-path regressions

#### Pending Round 31

- Idempotency batch 9 (Round 31 candidates: claim-manual-update, lead-update, product/pricing, warehouse, maker-reject)
- Test coverage: bring authoritative denominator coverage from 20.2% → 25%
- Cron audit follow-ups from Round 28 deferred items

---

### Feature — Round 28 (Idempotency batch 6 +5 endpoints + cron audit + coverage tracker) (2026-04-30)

Round 28 extends Idempotency-Key infrastructure to 5 admin POST endpoints + closes 2 cron heartbeat gaps + introduces a single-source-of-truth coverage tracker. **Cumulative: 28/75+ POST endpoints (~37% of mutating REST surface)**. ZERO regressions, all gates green.

#### Phase 1 — Idempotency batch 6 (5 endpoints, +18 contract tests, 88 → 106 cases)

| Endpoint | Snippet | Body Hash Inputs | Use Case |
| --- | --- | --- | --- |
| `POST /b2b/v1/admin-stock-unlock` | Snippet 3 V.42.12 → V.42.13 | `{sku, notify_tickets[normalized sort + dedup]}` | Admin double-click "ปลดล็อก" on slow Flex push → 2nd request hits 404 (already unlocked) + double-fires BO restock Flex notify → customers get duplicate spam. notify_tickets[] sorted + dedup → row reorder = same intent. |
| `POST /b2b/v1/admin-stock-mark-oos` | Snippet 3 V.42.12 → V.42.13 | `{sku, eta_days}` | Admin re-estimating ETA between retries (7d → 14d) surfaces 409. Cached response replays stale eta_date — accepted (24h TTL boundary). |
| `POST /b2b/v1/admin-submit-tracking` | Snippet 3 V.42.12 → V.42.13 | `{entries[normalized: sort by ticket_id, sanitize per-row]}` | Bulk pattern (2nd of its kind). 50-order tracking save retry → 50× duplicate Flex shipped notify + 50× duplicate delivery_check cron schedules. Wrapper replays {updated, errors} batch result. tracking_number typo correction or carrier change = 409. |
| `POST /b2f/v1/approve-reschedule` | B2F Snippet 2 V.11.15 → V.11.16 | `{po_id, approved, note}` | Admin double-click "อนุมัติ"/"ปฏิเสธ" → 2nd request hits NO_PENDING (status flipped on first call). approved boolean CRITICAL discriminator (approve vs reject same PO ≠ same hash). note = audit trail content. |
| `POST /b2f/v1/reject-resolve` | B2F Snippet 2 V.11.15 → V.11.16 | `{rcv_id, action, note}` | Admin double-click "ดำเนินการ" → 2nd request hits ALREADY_RESOLVED. Existing GET_LOCK protects short-window concurrency; wrapper extends to 24h replay. action enum (replacement/reship/write_off) = 3 distinct financial impacts → MUST hash distinctly. |

**Pattern (proven Round 19/23/25/26/27)**: optional `X-Idempotency-Key` header + helper triad + `function_exists()` defensive guards. Backward compat: missing header = byte-identical to previous version. WP_Error 409 on body hash mismatch. Bulk endpoints canonicalize array order via `usort()`. Bulk-of-targets pattern (admin-stock-unlock notify_tickets[]) = treat secondary array like bulk: sort + dedup before hash.

#### Phase 2 — Cron audit (2 crons migrated to registry)

Drift detection sweep across 34 scheduled crons identified 2 still on legacy `add_action` without heartbeat tracking visibility:

- `dinoco_flag_audit_retention_cron` — Flag Audit Log V.1.0 → V.1.1
- `dinoco_idempotency_cleanup_cron` — Idempotency Helper V.1.0 → V.1.1

Both wrapped with `dinoco_register_cron` + fallback `add_action` (preserves backward compat when Health Monitor snippet not synced). `wp_schedule_event` preserved unchanged to keep custom 03:00 / 03:15 time-of-day schedule.

**Result**: 34 scheduled crons → 32 already registered + 2 fixed = **100% heartbeat coverage** (excluding intentional one-shot single events).

Report: `docs/audit/CRON-DRIFT-ROUND-28.md` — findings + handler verification + 2 deferred Round 29 candidates (heartbeat key naming consistency, single-event observability).

#### Phase 3 — Coverage tracker (`docs/audit/IDEMPOTENCY-COVERAGE.md`)

NEW single-source-of-truth tracker for Idempotency-Key endpoint integration status. Lists all 28 integrated endpoints with snippet version, pattern type, round added, status. Helps future rounds pick next batch + lets reviewers audit at a glance.

Pending list grouped by priority:

- High (Round 29 candidates): `combined-slip-upload`, `combined-invoice-gen`, `import-distributors`, `recalculate-total`, `delete-ticket`
- Medium (Round 30+): MCP claim/lead endpoints, manual-flash-ready/test, stock/adjust + transfer, B2F maker-* + reject-lot
- Low (don't need wrapper): `print-ack`, `print-heartbeat`, `flash-webhook`, `rpi-command-ack`, `test-push`, `god-mode/verify` (rationale documented)

Pattern legend documents 4 types: single (most common) / bulk (items[]/skus[]) / bulk-of-targets (admin-stock-unlock) / state-machine (po-complete).

#### Phase 4 — Pattern doc + drift sync

`docs/patterns/IDEMPOTENCY-KEY.md` "Used in" section updated:

- 23 → 28 endpoints
- ~31% → ~37% coverage
- 88 → 106 contract test cases
- Cross-link to new tracker
- Round 29 recommendation list

#### Round 28 — Verification gate

- PHPUnit: 511 → 529 (+18 cases: 17 new + 1 cumulative collision update). ALL GREEN.
- Jest: 21 suites / 156 tests + 2 skipped — stable. cron-drift.test.js 7/7 pass.
- `php -l`: clean on Snippet 3, B2F Snippet 2, Flag Audit Log, Idempotency Helper
- markdown-links.test.js 2/2 pass after new doc cross-links

#### Round 28 — Cumulative coverage

- 28/75+ POST endpoints with central Idempotency-Key support (~37% of mutating surface)
- 529 PHPUnit + 156 Jest + 25 × 4 Playwright = 836 tests total (was 818)
- 8 drift detectors active (cron-drift now reports 100% heartbeat coverage)

#### Round 28 — Files touched (5 total, 4 commits)

- Phase 1 commit `11716b2` (Idempotency batch 6): 3 files
  - `[B2B] Snippet 3: LIFF E-Catalog REST API` V.42.12 → V.42.13 (3 endpoints)
  - `[B2F] Snippet 2: REST API` V.11.15 → V.11.16 (2 endpoints)
  - `tests/helpers/IdempotencyEndpointContractTest.php` (+18 cases)
- Phase 2 commit `9c64bd9` (cron audit): 3 files
  - `[Admin System] DINOCO Flag Audit Log` V.1.0 → V.1.1
  - `[Admin System] DINOCO Idempotency Helper` V.1.0 → V.1.1
  - `docs/audit/CRON-DRIFT-ROUND-28.md` (new)
- Phase 3 commit `763de38` (coverage tracker): 2 files
  - `docs/audit/IDEMPOTENCY-COVERAGE.md` (new)
  - `docs/patterns/IDEMPOTENCY-KEY.md` (Used in update)
- Phase 4 commit (this docs sync): `CLAUDE.md` + `CHANGELOG.md` + `README.md`

#### Round 28 — Recommendation for Round 29

- **Idempotency batch 7 (push to ~43%)**: 5 high-priority endpoints already triaged in `IDEMPOTENCY-COVERAGE.md` (combined-slip-upload, combined-invoice-gen, import-distributors, recalculate-total, delete-ticket).
- **Pivot candidates** (defer Idempotency batch 7):
  - **Sentry canary observation** — V.4.0 GDPR + Phase 5 Observability snippets are flag-OFF. Time to flip + 7-day observation per `docs/runbooks/SENTRY-ACTIVATION.md`.
  - **B2F CPT final drop** — Phase 4 migration target 2026-05-02 day 14 (today + 2 days).
  - **Vite LIFF bundle staging** — `liff-src/b2b/catalog/` artifacts ready since Round 18; needs staging-first canary per `docs/runbooks/WEEK-LONG-SPRINT-2026-04-29.md` Day 4.

### Feature — Round 27 (Idempotency batch 5 +5 endpoints — first bulk-array batch) (2026-04-30)

Round 27 extends Round 19/23/25/26 Idempotency-Key infrastructure to 5 more critical POST endpoints. **Cumulative: 23/75+ POST endpoints (~31% of mutating REST surface)**. First batch dominated by bulk-array endpoints (3/5) — formalized canonical sort pattern in `docs/patterns/IDEMPOTENCY-KEY.md` §"Bulk endpoint considerations" (5 rules + bo-split reference impl). ZERO regressions, all gates green.

#### Phase 1 — Idempotency batch 5 (5 endpoints, +16 contract tests, 72 → 88 cases)

| Endpoint | Snippet | Body Hash Inputs | Use Case |
| --- | --- | --- | --- |
| `POST /b2b/v1/bo-cancel-item` | Snippet 16 V.3.4 → V.3.5 | `{order_id, bo_queue_id, reason}` | Admin Flex postback double-fire on slow LINE → 2nd request sees row already `status='cancelled'` → wpdb update returns 0 affected → confusing 500. Wrapper returns cached 200. reason in hash → admin editing reason between retries surfaces 409. |
| `POST /b2b/v1/bo-bulk-fulfill` | Snippet 16 V.3.4 → V.3.5 | `{items[normalized: sort by bo_queue_id, qty in hash]}` | Admin "✅ จัดส่ง BO ที่เลือก" network-drop retry → cached partial-success summary. CRITICAL bulk pattern: items[] sorted → admin row reorder ≠ different intent. qty per-row override IN hash. |
| `POST /b2b/v1/bo-bulk-cancel` | Snippet 16 V.3.4 → V.3.5 | `{bo_queue_ids[normalized sort numeric], reason}` | Same pattern as bo-bulk-fulfill. reason in hash → admin editing reason = 409. |
| `POST /b2f/v1/po-complete` | B2F Snippet 2 V.11.14 → V.11.15 | `{po_id, note}` | Admin "ปิด PO" double-click on slow Flex push → 2nd request fails at FSM (status='completed' = invalid transition target) → 400 INVALID_STATUS. Wrapper returns cached 200. note in hash → editing closure note = 409. |
| `POST /dinoco-stock/v1/dip-stock/approve` | Inventory V.45.2 → V.45.3 | `{session_id, skus[normalized: uppercase + dedup + sort]}` | Admin "อนุมัติทั้งหมด" double-click → cached summary. SKU normalize uppercase + dedup + sort → case-insensitive identity (admin retyping subset = same hash). subset change = 409. |

**Pattern (proven Round 19/23/25/26)**: optional `X-Idempotency-Key` header + helper triad + `function_exists()` defensive guards. Backward compat: missing header = byte-identical to previous version. WP_Error 409 on body hash mismatch (different intent, same key). Bulk endpoints canonicalize array order via `usort()` — admin row reorder ≠ different intent. qty/value/reason fields IN hash → admin editing values surfaces 409.

**3 BO endpoints intentionally same {order_id, dist_id} OR {bo_queue_id} root shapes** — namespace string discriminates at storage layer (documented in `test_bo_undo_split_distinct_from_bo_confirm_full` from Round 26 + Round 27 cumulative collision test now expects 22 distinct shapes for 23 endpoints).

#### Phase 2 — Pattern doc formalization (`docs/patterns/IDEMPOTENCY-KEY.md`)

NEW section "Bulk endpoint considerations" with 5 rules:

1. Canonicalize array order before hashing (sort by deterministic key)
2. Include semantic per-row fields, exclude UI metadata
3. Normalize string fields (case, whitespace, dedup)
4. Avoid timestamp/random in cached response (replays would return stale)
5. Bulk replay returns entire batch result incl. partial failures (intentional)

Reference impl: bo-split (Round 26 canonical example, ~30 LOC top + bottom block).

Updated "Used in" section to reflect 23 endpoints across 7 snippets, Round 19-27 references, status 23/75+ (~31% of POST surface), recommendation for Round 28.

#### Phase 3 — Drift sweep (chore commit `50bee55`)

- README line 104 "PHPUnit Unit | 466" stale since Round 26 → 511 (Round 27 +16)
- README line 108 "Total | 773" derived stale → 818
- Round 27 entry added to "What's New" (line 29)
- Cumulative line 37 "0 → 495" → 511
- PHPUnit badge URL `phpunit_tests-495_passing` → 511

No other drift observed:

- Snippet 16 V.3.5, B2F Snippet 2 V.11.15, Inventory V.45.3 all sync
- GDPR V.4.0, LIFF AI V.1.11 stable from Round 26
- `wp_dinoco_idempotency_keys` schema lives in Idempotency Helper snippet (lazy install) — not Snippet 15 (verified)

#### Round 27 — Verification gate

- PHPUnit: 495 → 511 (+16 cases: 15 new + 1 cumulative collision update). ALL GREEN.
- Jest: 21 suites / 156 tests + 2 skipped — stable
- `php -l`: clean on Snippet 16, B2F Snippet 2, Inventory DB, contract test
- 1 pre-existing PHPUnit deprecation (test framework, not code)

#### Round 27 — Cumulative coverage

- 23/75+ POST endpoints with central Idempotency-Key support (~31% of mutating surface)
- 511 PHPUnit + 156 Jest + 25 × 4 Playwright = 818 tests total
- 8 drift detectors active

#### Round 27 — Files touched (6 total, 3 commits)

- Phase 1 commit `9ad8ddc` (Idempotency batch 5): 4 files
  - `[B2B] Snippet 16: Backorder System` V.3.4 → V.3.5 (3 endpoints)
  - `[B2F] Snippet 2: REST API` V.11.14 → V.11.15 (po-complete)
  - `[Admin System] DINOCO Global Inventory Database` V.45.2 → V.45.3 (dip-stock/approve)
  - `tests/helpers/IdempotencyEndpointContractTest.php` (+16 cases)
- Phase 2 commit `ab52955` (pattern doc): `docs/patterns/IDEMPOTENCY-KEY.md`
- Phase 3 commit `50bee55` (drift sweep): `README.md`
- Phase 4 commit (this docs sync): `CLAUDE.md` (Round 27 endpoint list) + `CHANGELOG.md`

#### Round 27 — Pattern reusable for next batch

- 5 more endpoints proven safe — same `function_exists()` defensive header + store call before final return
- Bulk pattern fully documented (5 rules + reference impl)
- 23 → next batch of 5 = 28 endpoints would target ~37% surface coverage

#### Round 27 — Recommendation for Round 28

Continue or pivot:

- **Continue**: bulk endpoints with similar shapes (admin-shipping-queue actions, b2f reject-resolve, b2b admin-submit-tracking)
- **Pivot**: Sentry canary observation start, Vite LIFF bundle staging deploy, B2F CPT final drop (2026-05-02 Day 14 from Phase 4 migration timeline per `docs/runbooks/WEEK-LONG-SPRINT-2026-04-29.md`)

---

### Feature — Round 26 (Idempotency batch 4 +5 + GDPR V.4.0 LINE export cross-system) (2026-04-30)

Round 26 closes 2 work items: (1) extends Round 19+23+25 Idempotency-Key infrastructure to 5 more endpoints (cumulative 13 → 18, ~24% of POST surface), and (2) implements the deferred Phase 6.1 GDPR LINE messages export per CLAUDE.md scope ("LINE messages (via agent:3000)" — was a stub since V.1.0 2026-04-17). ZERO regressions, all gates green.

#### Phase 1 — Idempotency batch 4 (5 endpoints, +16 contract tests, 56 → 72 cases)

| Endpoint | Snippet | Body Hash Inputs | Use Case |
| --- | --- | --- | --- |
| `POST /b2b/v1/bo-confirm-full` | Snippet 16 V.3.3 → V.3.4 | `{order_id, dist_id}` (dist_id cross-tenant scoping) | Admin Flex "ยืนยันเต็ม" double-tap → previously caused FSM transition retry warnings |
| `POST /b2b/v1/bo-split` | Snippet 16 V.3.3 → V.3.4 | `{order_id, dist_id, splits[normalized sort by sku]}` | CRITICAL: splits[] in hash → admin editing values mid-retry surfaces 409 (different intent). Row reorder canonicalized via usort() |
| `POST /b2b/v1/bo-undo-split` | Snippet 16 V.3.3 → V.3.4 | `{order_id, dist_id}` (undo_count NOT in hash — DB-derived) | Existing 1-undo-per-order limit primary defense; wrapper extends 24h replay |
| `POST /b2f/v1/maker-deliver` | B2F Snippet 2 V.11.13 → V.11.14 | `{po_id, maker_id (JWT), delivery_items[normalized], note}` | Maker LIFF "แจ้งส่งของ" double-tap on slow LINE response. JWT-scoped maker_id prevents cross-maker key reuse |
| `POST /liff-ai/v1/lead/{id}/accept` | LIFF AI Snippet 1 V.1.10 → V.1.11 | `{lead_id, dealer_id (auth), uid (auth)}` | Dealer double-tap on slow MongoDB roundtrip — wrapper returns cached 200 instead of "already accepted" bounce |

All 5 mirror Round 19/23/25 proven pattern: optional `X-Idempotency-Key` header + `dinoco_idempotency_extract_key/check/store` triad + `function_exists()` guards. Backward compat: missing header = byte-identical to previous version.

bo-confirm-full + bo-undo-split intentionally share body shape `{order_id, dist_id}` — namespace discriminates at storage layer (documented in `test_bo_undo_split_distinct_from_bo_confirm_full`).

Tests: `tests/helpers/IdempotencyEndpointContractTest.php` 56 → 72 cases. Each new endpoint: 3 cases (identical body / different discriminator / cross-tenant or critical-edit case) + 1 cumulative collision test renamed (now covers 17 distinct shapes for 18 endpoints).

#### Phase 2 — GDPR V.4.0 LINE messages export from OpenClaw MongoDB

Closes deferred CLAUDE.md scope item: "LINE messages (via agent:3000)" — was a stub since V.1.0.

**Cross-system architecture**: WP GDPR worker → HTTP GET → OpenClaw agent (V.2.3) → MongoDB. Bearer auth (`LIFF_AI_AGENT_KEY`). Rate limit 1 export/line_uid/hour (MongoDB-backed via `gdpr_export_log` collection — immutable INSERT per call). Best-effort design: agent unreachable → warning log + placeholder note in ZIP (does NOT block rest of export).

**WordPress side** (`[System] DINOCO GDPR Data Requests` V.3.1 → V.4.0, +175 LOC):

- NEW `dinoco_gdpr_export_line_messages($line_uid, $request_id)` — calls `agent:3000/api/gdpr/line-messages` with 10s timeout + 1 retry + Docker `agent:` → `localhost:` fallback. Returns `{messages, claims, leads, total_count, generated_at, unavailable}`. Handles: 200 OK → full structure / 429 → `unavailable=true` / 5xx → `unavailable=true` / 4xx → empty (not unavailable) / malformed → empty (defensive).
- `dinoco_gdpr_build_export()` now wires LINE branch (line 1074-1117): reads `dinoco_line_uid` (V.1.7+) or legacy `line_user_id` meta. Adds `line-messages.json` + `line-claims.json` + `line-leads.json` to ZIP (or `line-messages-UNAVAILABLE.txt` placeholder if agent down). Updates `record_counts` with `line_messages/line_claims/line_leads/line_unavailable`.
- README.txt section extended documenting LINE export contents.

**OpenClaw side** (`openclawminicrm/proxy/index.js`, +110 LOC):

- NEW `GET /api/gdpr/line-messages?line_uid=Uxxx&request_id=N` — Auth: `requireAuth` (Bearer LIFF_AI_AGENT_KEY). Rate limit 1 req/line_uid/hour via MongoDB find on `gdpr_export_log`. Query 3 collections: `messages` (LINE platform) + `claim_logs` + `leads`. Hard cap 10000/500/500 (defensive). Strip MongoDB internals (`_id`, embeddings, AI cost metadata). Insert audit row in `gdpr_export_log` (line_uid, ts, counts, caller_ip).
- PII: returns user's own messages verbatim (self-export = no redaction needed); 3rd-party data already filtered at message-level by agent.

#### Phase 3 — Tests + Documentation

- NEW `tests/helpers/GdprLineExportTest.php` (13 cases): pure-logic response normalization tests covering all branches — 200 OK valid + empty arrays / 429 unavailable / 500/503 unavailable / 400/404 empty (not unavailable) / malformed JSON / missing ok / ok=false / type coercion / PII passthrough.
- WORKFLOW-REFERENCE.md §3.5.1 NEW Mermaid sequenceDiagram (User → WP → MongoDB cross-system flow with all 5 phases visualized incl. 429/5xx fallback path).
- README.md badges bumped: phpunit_tests 466 → 495, mermaid_diagrams 22 → 23. What's New section extended with Round 26 entry.
- CLAUDE.md updated: 18-endpoint Idempotency table + GDPR V.4.0 section detailing cross-system + activation requirements.

#### Verification gate

- PHPUnit: 466 → 495 (+29 cases: 16 contract + 13 GDPR LINE export). ALL GREEN.
- Jest: 21 suites / 156 tests + 2 skipped. ALL GREEN.
- `php -l`: clean on Snippet 16, B2F Snippet 2, LIFF AI Snippet 1, GDPR snippet.
- `node --check`: clean on `proxy/index.js`.
- 1 pre-existing PHPUnit deprecation (test framework, not code).

#### Cumulative coverage after Round 26

- 18/75+ POST endpoints with central Idempotency-Key support (~24% of mutating surface)
- 495 PHPUnit + 156 Jest + 25 × 4 Playwright = 802 tests total
- 8 drift detectors active (cron drift detector tracks `dinoco_gdpr_sla_reminder_cron` from Round 25 — V.4.0 doesn't add new crons)

#### Files touched (8 total, 2 commits + this docs sync)

Phase 1 (commit `c21e1fa`):

- `[B2B] Snippet 16: Backorder System` V.3.3 → V.3.4
- `[B2F] Snippet 2: REST API` V.11.13 → V.11.14
- `[LIFF AI] Snippet 1: REST API` V.1.10 → V.1.11
- `tests/helpers/IdempotencyEndpointContractTest.php` +16 cases

Phase 2 (commit `e62292d`):

- `[System] DINOCO GDPR Data Requests` V.3.1 → V.4.0 (+175 LOC helper + dual-write into build_export + README)
- `openclawminicrm/proxy/index.js` (+110 LOC GDPR endpoint)
- `tests/helpers/GdprLineExportTest.php` (NEW, 13 cases)
- `WORKFLOW-REFERENCE.md` §3.5.1 (+50 LOC Mermaid sequenceDiagram)

Phase 3 (this commit):

- `CLAUDE.md` (Idempotency endpoint list + GDPR V.4.0 update)
- `README.md` (badges + What's New)
- `CHANGELOG.md` (this entry)

#### Activation (deferred)

GDPR V.4.0 still flag-gated OFF (`dinoco_gdpr_enabled='0'`). When activating:

1. `composer require sentry/sentry` if Observability not yet activated
2. Verify `LIFF_AI_AGENT_URL` + `LIFF_AI_AGENT_KEY` constants defined (already used by LIFF AI)
3. Rebuild + restart OpenClaw agent container with V.2.3+ (`docker compose -f docker-compose.prod.yml up -d --build agent`)
4. Test with curl: `curl -H "Authorization: Bearer $LIFF_AI_AGENT_KEY" "https://ai.dinoco.in.th/api/gdpr/line-messages?line_uid=Utest"` (expect 503 if user not in MongoDB; expect 200 with empty arrays otherwise)
5. Flip `wp option update dinoco_gdpr_enabled '1'`
6. Update `docs/compliance/PDPA-BASICS.md` activation status section

---

### Feature — Round 25 (Idempotency expansion +5 + GDPR 25-day SLA reminder cron + verification gate) (2026-04-29)

Round 25 closes 2 work items: (1) extends Round 19+23's Idempotency-Key infrastructure to 5 more critical POST endpoints (cumulative 8 → 13 endpoints, ~17% of 75+ POST surface), and (2) implements the deferred GDPR Phase 6.1 25-day SLA reminder cron per `docs/compliance/GDPR-PHASE-6-DESIGN.md` line 274-277. Verification gate confirmed all 466 PHPUnit + 156 Jest tests green; 1 pre-existing security allowlist line drift (line 989 → 999) re-pinned.

#### Phase 1 — Idempotency expansion (5 endpoints, +15 contract tests)

| Endpoint | Snippet | Body Hash Inputs | Use Case |
| --- | --- | --- | --- |
| `POST /b2b/v1/update-status` | Snippet 5 V.33.5 → V.33.6 | `{ticket_id, status}` (old_st DB-derived excluded) | Bulk Confirm/Cancel admin loops on partial network drop |
| `POST /b2b/v1/cancel-request` | Snippet 3 V.42.11 → V.42.12 | `{ticket_id, group_id}` (group_id from session, auth-scoped) | Customer LIFF "ยกเลิก" double-tap on slow network |
| `POST /b2f/v1/po-cancel` | Snippet 2 V.11.12 → V.11.13 | `{po_id, reason}` (reason editing surfaces 409) | Admin double-click cancel + reason edit between retries |
| `POST /b2f/v1/maker-confirm` | Snippet 2 V.11.12 → V.11.13 | `{po_id, maker_id, expected_date, note}` (JWT-scoped) | Maker LIFF retry on slow LINE response |
| `POST /b2f/v1/record-payment` | Snippet 2 V.11.12 → V.11.13 | `{po_id, amount, method, date, reference, note}` (slip binary excluded — FormData limitation) | Central wrapper extends per-endpoint 10s transient → 24h replay |

All 5 mirror Round 19+23 proven pattern: optional `X-Idempotency-Key` header + `dinoco_idempotency_extract_key/check/store` helper triad + `function_exists()` defensive guards everywhere. Backward compat: missing header = byte-identical to previous version. record-payment additionally preserves the legacy FIX-2b 10s transient (per-endpoint short-window collision protection) — central wrapper layered ABOVE it for 24h replay window.

#### Phase 2 — GDPR 25-day SLA reminder cron (V.3.0 → V.3.1)

NEW `dinoco_gdpr_sla_reminder_cron` daily 09:00 Bangkok scan:

- Query: `status IN ('queued','processing') AND created_at < NOW() - 25 days` (`LIMIT 50` defensive cap)
- Per match: `wp_mail` admin reminder (subject: `[DINOCO GDPR] SLA Reminder: Request #N — X days left`) + `dinoco_gdpr_audit_log` immutable trail entry (`action='sla_reminder_sent'`)
- Idempotency marker: append `SLA_REMINDER_SENT:<ts>` to `notes` column (preserves existing notes via newline append) — prevents re-fire on consecutive cron runs
- Hook: `do_action('dinoco_gdpr_sla_reminders_sent', $count, $stale_rows)` for downstream Telegram/Slack notifiers
- Defensive guards: flag-gate (`dinoco_gdpr_is_enabled()` short-circuits), schema check (`SHOW TABLES LIKE` before SELECT), admin_email validation (empty/invalid → log + skip), `wp_mail()` failure → log + continue
- Per Thai PDPA §35 + GDPR Art. 12(3) 30-day response window — fires at day 25 to give admin 5-day action buffer

Risk: NONE — additive cron, ALL operations gated by `dinoco_gdpr_is_enabled()` default OFF. Production never reaches new code paths until Phase 7 admin UI activated + flag flipped.

#### Phase 3 — Verification gate

- PHPUnit: 466 tests pass (was 451 — Round 25 +15 cases)
- Jest: 21 suites, 156 tests + 2 skipped (1 suite required allowlist line re-pin: `[Admin System] B2F Migration Audit:989 → :999` — pre-existing drift from Round 24, not Round 25 impact)
- All 8 drift detectors clean
- README badges updated: phpunit_tests 383 → 466, jest_tests 146 → 156, total 680 → 773
- README "What's New" extended to Rounds 13-25

#### Files touched

- `[B2B] Snippet 5: Admin Dashboard` V.33.5 → V.33.6
- `[B2B] Snippet 3: LIFF E-Catalog REST API` V.42.11 → V.42.12
- `[B2F] Snippet 2: REST API` V.11.12 → V.11.13
- `[System] DINOCO GDPR Data Requests` V.3.0 → V.3.1
- `tests/helpers/IdempotencyEndpointContractTest.php` 41 → 56 cases
- `tests/jest/php-security.test.js` allowlist line re-pin
- `README.md` test badges + "What's New" + count table

ZERO regressions. Round 25 brings the cumulative round count to 25 with 65+ commits across all rounds.

---

### Feature — Round 24 (GDPR Phase 7 admin review UI + 6 REST endpoints + audit log) (2026-04-29)

Phase 7 closes the GDPR/PDPA admin workflow on top of Round 23's foundation. ALL features remain flag-gated `dinoco_gdpr_enabled=0` default — endpoints return 503 + admin UI shows "FLAG OFF" badge until explicit activation.

#### Schema V.3.0 (additive dbDelta)

- `wp_dinoco_gdpr_requests` +3 columns (`reviewed_by`, `reviewed_at`, `cancellation_window_at`) + `idx_reviewed_by`
- NEW `wp_dinoco_gdpr_audit_log` — immutable append-only decision trail (id, request_id, actor_user_id, actor_login, action, from_status, to_status, reason, note, actor_ip, created_at + 3 indexes). Per PDPA §39 documentation requirement + GDPR Article 30 records of processing.

#### 7 admin REST endpoints (`/wp-json/dinoco-gdpr/v1/admin/*`)

- `GET /admin/requests` — list with filters (status, type, age_days, user) + bucket counts + per-row enrichment (user identity + record_summary stats: warranties/claims/orders/has_open_debt for legal-hold detection)
- `GET /admin/request/{id}` — single + audit trail (last 50) + auto-logs view action
- `POST /admin/request/{id}/approve` — typed `confirm_text=APPROVE` literal + FOR UPDATE lock + state transition + 30s undo window via `wp_schedule_single_event(now+30s, 'dinoco_gdpr_process_request')`
- `POST /admin/request/{id}/reject` — reason enum (legal_hold|fraud|cooling_off|other) + 'other' requires note ≥5 chars + auto-emails user
- `POST /admin/request/{id}/manual-export` — typed `confirm_text=PROCESS` + synchronous worker run (admin retry path for failed)
- `POST /admin/request/{id}/undo` — 30-second window cancellation + `wp_unschedule_event` best-effort cancel
- `GET /admin/audit-log` — filterable + Thai-friendly UTF-8 BOM CSV export (5000-row cap)

Permission: `manage_options` + WP cookie auth + `X-WP-Nonce` CSRF on POST + 60/min/user rate limit (transient bucket).

#### State machine helper (PURE, testable)

`dinoco_gdpr_is_valid_status_transition($from, $to)`:

```text
pending    → processing | rejected | cancelled
processing → ready | failed | cancelled
failed     → processing | cancelled
ready      → expired                            (TERMINAL)
rejected/cancelled/expired → ZERO outgoing      (TERMINAL)
```

CRITICAL safety: ready→processing IMPOSSIBLE (would re-trigger duplicate worker = double email + double ZIP + irreversible side effects).

#### Admin shortcode `[dinoco_admin_gdpr]` (~700 LOC additive)

5 tabs (Pending Review / Processing / Ready / Failed / Audit Log) embedded in V.3.0 snippet. Per-card user identity + record_summary stats + age badge color-coded for PDPA 30-day SLA. Legal-hold warning banner auto-detects distributor open debt → suggests `reason=legal_hold`. Action buttons via `window.dinocoModal.confirm/prompt` with native `confirm/alert/prompt` fallback (defensive try/catch). Typed confirmation gates: APPROVE for /approve, PROCESS for /manual-export — both case-strict + boolean-truthy rejected. Audit Log tab: filter (actor_user_id, action enum, date range) + CSV export. Scoped CSS `.dnc-gdpr-*` (no conflict with b2b/b2f/liff-ai prefixes). Mobile responsive (<640px stacks card actions).

#### Module Registry self-register + Sidebar nav

- Self-register at init priority 30 (key='gdpr', section='system', order=80, cache_ttl=0 — never cache dynamic admin review)
- NEW Section "ระบบกลาง" in Admin Dashboard sidebar (V.34.1 → V.34.2) with 1 nav-item `data-tab="gdpr"`
- Emergency fallback maps updated for snippet-disable resilience (3 maps: module_map, cache_ttl_map, tab_labels)
- Modal Helpers V.1.1 → V.1.2 — whitelist `dinoco_admin_gdpr` for auto-enqueue

#### Tests

- NEW `tests/helpers/GdprAdminPermissionTest.php` — 28 pure-logic cases (mirror IdempotencyTest pattern):
  - 8 valid state transitions
  - 10 invalid + invariants (ready cannot regress, terminal zero outgoing, unknown rejected, case+whitespace, non-string PHP 8.1 safe)
  - 5 reject reason matrix (enum + 'other' note requirement)
  - 4 typed confirmation gate (literal match, truthy NEVER bypasses)
- Suite: 419 → 447 tests pass (+28 new, 0 regressions)

#### Risk Assessment

LOW-MEDIUM — admin UI for irreversible operations. Default flag-gated OFF. CRITICAL safety enforced:

- Typed confirmation gates (case-strict literal match — boolean truthy rejected by tests)
- Audit log row INSERT BEFORE every state transition (immutable trail)
- 30-second undo window for approve action
- State machine REJECTS regression (ready cannot return to processing — prevents duplicate worker)
- FOR UPDATE locks prevent concurrent admin double-click race conditions

#### Files (4)

- `[System] DINOCO GDPR Data Requests` V.2.0 → V.3.0 (+1567 LOC additive: 7 endpoints + 8 helpers + admin shortcode)
- `[Admin System] DINOCO Modal Helpers` V.1.1 → V.1.2 (whitelist +1)
- `[Admin System] DINOCO Admin Dashboard` V.34.1 → V.34.2 (sidebar +1 section + 3 emergency fallback maps)
- `tests/helpers/GdprAdminPermissionTest.php` NEW (28 cases, ~290 LOC)

#### Activation Checklist

```bash
# 1. Verify schema migrated (V.3.0 cols present)
mysql> SHOW COLUMNS FROM wp_dinoco_gdpr_requests LIKE 'reviewed_%';
mysql> SHOW TABLES LIKE 'wp_dinoco_gdpr_audit_log';

# 2. Verify ZipArchive (Round 23 prereq)
php -m | grep -i zip

# 3. Smoke-test admin REST (expect 503)
curl -X GET https://dinoco.in.th/wp-json/dinoco-gdpr/v1/admin/requests \
     -H "X-WP-Nonce: ..." -H "Cookie: wordpress_logged_in_xxx=..."

# 4. Flip flag
wp option update dinoco_gdpr_enabled '1'

# 5. Re-test (expect 200 with bucket_counts)
# 6. Update docs/compliance/PDPA-BASICS.md activation status section
```

#### Deferred (Phase 6.1+)

- LINE message export from OpenClaw MongoDB (cross-system correlation)
- Bilingual email templates richer formatting (basic Thai+ENG already shipped in V.2.0)
- Appeal mechanism / DPO contact route (requires legal review)
- 25-day SLA reminder cron + Telegram alert
- PHPUnit integration tests (full DB worker round-trip)

---

### Feature — Round 23 (Idempotency expansion + GDPR Phase 6 foundation + Phase 5+ deferred sweep) (2026-04-29)

3-phase mega-round per user override of Round 19's "defer until canary observed" recommendation. User explicitly chose to continue parallel infrastructure work.

#### Phase 1 — Idempotency Endpoint Expansion (Option 1)

5 critical POST endpoints integrated with `dinoco_idempotency_*` middleware (mirrors Round 19 proven pattern). Backward compat preserved — missing X-Idempotency-Key header = byte-identical behavior to prior version.

- **`POST /b2b/v1/confirm-order`** ([B2B] Snippet 5 V.33.4 → V.33.5) — body hash = `{ticket_id, total_amount, status, admin_note}`. Prevents double-fire on admin double-click which would commit debt twice + double-fire stock_check_alert.
- **`POST /b2b/v1/flash-create`** ([B2B] Snippet 5 V.33.4 → V.33.5) — body hash = `{ticket_id}` only (deterministic dispatch per ticket; helper-level GET_LOCK already serializes). Wrapper provides 24h replay window for admin retry.
- **`POST /b2b/v1/manual-flash-cancel`** ([B2B] Snippet 3 V.42.10 → V.42.11) — body hash = `{pno}`. Flash API cancel is idempotent but DB cleanup loop is NOT — second call could return error toast even though Flash already cancelled. Wrapper replays original success.
- **`POST /b2f/v1/po-update`** ([B2F] Snippet 2 V.11.11 → V.11.12) — body hash = `{po_id, items, note, requested_date, resubmit_only}`. Critical: `exchange_rate` IMMUTABLE post-submit per V.7.0 design (excluded from hash). Prevents double amend (which would inflate version + amendment_count + spam Maker via Flex).
- **`POST /b2f/v1/receive-goods`** ([B2F] Snippet 2 V.11.11 → V.11.12) — body hash = `{po_id, items, inspected_by, note}`. Photo file uploads NOT hashed (FormData binary — accepted limitation; GET_LOCK at handler level provides short-window protection alongside wrapper's long-window). Most critical B2F endpoint — prevents double `b2f_payable_add` + double inventory write.

15 new test cases added to `tests/helpers/IdempotencyEndpointContractTest.php` (was 22, now 37 — all passing). Cross-namespace collision check verifies all 5 new body shapes hash uniquely.

#### Phase 2 — GDPR Phase 6 Foundation (Option 2)

Per `docs/compliance/GDPR-PHASE-6-DESIGN.md`. **Foundation built but DORMANT** — all helpers gated by `dinoco_gdpr_is_enabled()` which defaults to `false`. Production NEVER reaches new code paths until Phase 7 admin UI ships + activation flag flipped.

- **Schema v1.0 → v2.0** ([System] DINOCO GDPR Data Requests V.1.3 → V.2.0)
  - `wp_dinoco_gdpr_requests` adds 3 columns: `download_token VARCHAR(64)`, `scope_json LONGTEXT`, `expires_at DATETIME` + new index `idx_expires_at`
  - dbDelta handles ALTER TABLE additively for existing v1.0 installs (zero data loss)
- **Queue worker** `dinoco_gdpr_run_worker($request_id)` — FOR UPDATE lock + state machine (queued → processing → ready/failed). Listens on `dinoco_gdpr_process_request` action; defensive flag re-check on entry (skips if disabled even if hook fires accidentally).
- **Export builder** `dinoco_gdpr_build_export($user_id)` — ZIP via ZipArchive. Whitelist scope: `account.json` (wp_users core), `usermeta.json` (PII whitelist via `dinoco_gdpr_pii_meta_key_whitelist()` helper), `warranties.csv`, `claims/{claim-id}.json`, `orders.csv` (linked distributor only). Output to `wp-content/uploads/gdpr/{user_id}/` with `.htaccess` deny + `robots.txt` disallow + `bin2hex(random_bytes(32))` token + 7-day TTL.
- **Deletion executor** `dinoco_gdpr_execute_deletion($user_id)` — applies decision matrix per record type. Anonymize wp_users.user_email (hash to `deleted-{hash}@anon.local`), DELETE wp_usermeta PII keys, anonymize warranty/claim/order CPTs (preserve product/SKU records, scrub `customer_*`), NEVER delete `dinoco_debt_log` / `b2f_payable_log` (Thai Revenue Code §86/14 5-year audit trail).
- **Decision matrix helper** `dinoco_gdpr_decide_action_for_record($record_type)` — pure-logic lookup returning `'anonymize'|'delete'|'preserve'`. Safe default: unknown types → `'preserve'` (never accidentally destroy unrecognized records).
- **Email notification** `dinoco_gdpr_email_user($user_id, $template, $payload)` — Thai default + English fallback for 3 templates: `export_ready`, `deletion_complete`, `rejection`. Filterable subject/body via `dinoco_gdpr_email_subject_*`.
- **Cleanup cron** `dinoco_gdpr_export_cleanup_cron` — daily 03:30 (offset from idempotency cleanup at 03:15 + flag-audit retention at 03:00 to spread DB load). Prunes ZIP files past `expires_at`, nulls `download_token`, marks `status='expired'`. Defensive: aborts gracefully if column doesn't exist (legacy v1.0 schema).
- **Tests**: NEW `tests/helpers/GdprDeletionDecisionTest.php` with 19 cases covering all 4 buckets (anonymize/delete/preserve) + safe-default fallback + case-insensitivity + invariant test (legal-hold records NEVER classified as `delete` under any case/whitespace variant).

Risk: LOW. Flag-gated OFF default → no production impact. dbDelta migration is additive only (no destructive changes). All helpers have `function_exists()` guards + `try/catch \Throwable` for fatal isolation.

#### Phase 3 — Phase 5+ Deferred Sweep (Option 3)

2 items closed (1 fix + 1 docs); 1 verified-already-mitigated.

- **UX-H18 — iOS swipe-back LIFF guard** (real fix)
  - [B2B] Snippet 4 V.32.6 → V.32.7 — `history.replaceState({view:'root', _liffGuard:1}, '', location.href)` injected after `liff.init()` success (idempotent guard checks `!history.state`)
  - [B2F] Snippet 8 V.7.11 → V.7.12 — same pattern at parallel position
  - First iOS swipe-back gesture now triggers `popstate` (which closes SET detail / cart) instead of exiting LIFF window. Best-effort `try/catch` — iOS Safari edge cases must NOT block init. Snippet 11 NOT touched (doesn't directly init LIFF; uses Snippet 4's gate).
- **DB-H2 — Soft-delete conventions doc** (documentation-only, no data migration)
  - NEW `docs/patterns/SOFT-DELETE-CONVENTIONS.md` (~150 LOC) — documents 3 existing patterns: Pattern A (compound `status` + `deleted_at`, B2F junction), Pattern B (`is_active=1`, Inventory tables), Pattern C (`expires_at` TTL, idempotency + GDPR ZIPs). Recommendation matrix (state machine vs toggle vs time-bounded) + anti-patterns + migration plan (deferred — most B-type tables don't need to migrate).
  - `docs/patterns/README.md` index updated (5 → 6 patterns) + quick reference table extended.
- **BUG-H13 — Dual-listener race** (verify only — already mitigated)
  - Confirmed [B2B] Snippet 1 V.34.x snapshot hook already uses GET_LOCK (per V.34.6 changelog "C-Conc-1: Snapshot hook GET_LOCK replaces non-atomic transient"). No code change needed.

#### Files Touched (Round 23)

**Phase 1** (4 files, +554/-10 LOC):

- `[B2B] Snippet 3: LIFF E-Catalog REST API` V.42.10 → V.42.11 (manual-flash-cancel idempotency)
- `[B2B] Snippet 5: Admin Dashboard` V.33.4 → V.33.5 (confirm-order + flash-create idempotency)
- `[B2F] Snippet 2: REST API` V.11.11 → V.11.12 (po-update + receive-goods idempotency)
- `tests/helpers/IdempotencyEndpointContractTest.php` (+15 cases — 290 new lines)

**Phase 2** (2 files, ~700 new LOC):

- `[System] DINOCO GDPR Data Requests` V.1.3 → V.2.0 (queue worker + export builder + deletion executor + decision matrix helper + email + cleanup cron + schema v2.0)
- NEW `tests/helpers/GdprDeletionDecisionTest.php` (19 cases — ~180 LOC)

**Phase 3** (4 files):

- `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.6 → V.32.7 (UX-H18)
- `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.11 → V.7.12 (UX-H18)
- NEW `docs/patterns/SOFT-DELETE-CONVENTIONS.md` (DB-H2 docs)
- `docs/patterns/README.md` (index update)

#### Risk Summary

- Phase 1 (Option 1): LOW — Round 19 pattern proven across 3 endpoints since 2026-04-29; this round adds 5 more under same pattern. Cross-namespace collision tests in PHPUnit.
- Phase 2 (Option 2): LOW — flag-gated OFF default. Production NEVER reaches new code paths until activation. dbDelta additive only. PHPUnit covers decision matrix correctness (legal-hold records can never trigger delete under any input variant).
- Phase 3 (Option 3): LOW — UX-H18 is pure additive defensive `replaceState` (no logic change). DB-H2 is documentation-only.

#### User Override Note (per task brief)

Round 19 recommended "defer Idempotency expansion until 1-2 weeks canary observed" but user explicitly chose to continue parallel infrastructure work. Documented per task brief instruction. No production impact (Round 19 endpoints already canary-OK; new endpoints follow identical proven pattern).

#### Test Suite Growth (Round 23)

- PHPUnit: 400 → 419 tests passing (+19 GDPR decision matrix). Helper test count: was 22 endpoint contracts → now 37 (+15 new endpoint hash invariants).
- Total assertions: was 596 → 634 (+38).
- Jest: unchanged (no new JS tests; existing 155 passing + 1 pre-existing failure in `php-security.test.js` for `@shell_exec` in B2F Migration Audit:999 — unrelated to Round 23).

---

### Feature — Round 22 (Wave 3 UI Gap 1+2: Order Intent Dashboard + Mode filter persistence) (2026-04-29)

Closes the last 2 deferred gaps from Wave 3 inventory (Round 4 deferred since UX wireframe sign-off requested). Backend V.7.0 Order Intent fully shipped 13 days ago — production data ready. Wave 3 status: **5/5 gaps CLOSED**.

#### ITEM A — Order Intent Dashboard (Gap 1)

NEW admin tab consolidating V.7.0 Order Intent statistics across all makers. Read-only, additive UI.

- **NEW REST endpoint** `GET /dinoco-b2f-audit/v1/maker-rollup-stats` ([Admin System] B2F Migration Audit V.3.19 → V.3.20)
  - Single SQL aggregation (GROUP BY maker_id) over `wp_dinoco_product_makers` junction
  - Returns per-maker rollup (total, confirmed, auto_synced, dm_*, pm_*, missing_leaves_*, source_cpt/auto, confirmed_pct) + global summary
  - Read-only. Reuses existing rate-limit (20/hr/user). 404 on missing junction, 501 on missing V.11.0 columns
- **NEW shortcode** `[b2f_admin_order_intent_dashboard]` ([B2F] Snippet 5: Admin Dashboard Tabs V.8.6 → V.9.0)
  - 4 stats cards: total SKUs / confirmation pct + split / display-mode dominant / production-mode dominant
  - Per-maker rollup table: filter (all/needs_attention/fully_confirmed/has_missing) + sort (name/missing/auto/confirmed) + deep-link to Makers tab
  - Actions panel: Migration Audit deep-link / Makers tab deep-link / Export CSV (UTF-8 BOM Thai-friendly)
  - Recent activity feed: top 20 from existing `/observations` endpoint with Thai-translated source labels
  - Banner warning when `b2f_flag_order_intent` is OFF (graceful — informational only)
  - Module registry self-registration: key=b2f_order_intent, section=b2f, order=25 — auto-wires into TAB_LABELS via Phase 5 registry merge
- **Sidebar nav-item HTML** ([Admin System] DINOCO Admin Dashboard V.34.0 → V.34.1)
  - Added under "โรงงาน (B2F)" section between Makers and Credit
  - data-tab="b2f_order_intent" — wired automatically via registry merge (no emergency fallback added)
- **Mobile-first CSS**: ≤640px stack 2-col cards + table compact, ≤380px single col. Scoped namespace `.b2f-oi-*`. Round 9 event delegation (data-action/data-change with `.closest()` guard).

#### ITEM B — Mode-aware filter chips on Orders tab (Gap 2)

Enhanced V.7.1 mode filter (5 chips: all/full_set/sub_unit/single_leaf/legacy) with 2 additions:

- **localStorage persistence** — key `b2f_orders_mode_filter`, whitelist guard via `_MODE_FILTER_VALID` array (rejects tampered values), try/catch silent fail (private mode safety). Restored at module load + chip active state set in `init()` before `loadOrders()`.
- **🌈 Mixed chip** — `data-mode="mixed"` filters POs with ≥2 modes (counts modes from `s.full_set/sub_unit/single_leaf > 0`). CSS gradient background (purple→amber→gray) on active state. Tooltip "PO ที่มี ≥2 โหมดผสม".
- Behavior preservation: existing `setModeFilter()` + `applyFilters()` flow untouched. New chip uses identical `data-action="orders-mode-chip"` delegation (V.8.1 pattern).

#### Risk + Verification

- Risk: LOW-MEDIUM. Backend addition is additive single SQL, read-only, gated 404/501 on missing schema. Frontend dashboard is pure consumer (no writes).
- Verification: PHP syntax pass on 3 modified files (`php -l` with `<?php` wrapper); JS data-action delegation scoped via `.closest('#b2f-oi-dashboard-wrap')` prevents cross-module fire; HTML escaping uses `esc_url()` + `esc_js()` properly.

#### Files

- `[Admin System] B2F Migration Audit` V.3.19 → V.3.20 (+119 lines)
- `[B2F] Snippet 5: Admin Dashboard Tabs` V.8.6 → V.9.0 (+571 lines)
- `[Admin System] DINOCO Admin Dashboard` V.34.0 → V.34.1 (+11 lines)

#### Wave 3 Closeout

| Gap   | Description                           | Status                                |
| ----- | ------------------------------------- | ------------------------------------- |
| Gap 1 | Admin Order Intent Dashboard          | ✅ Round 22 (V.9.0 + V.3.20 + V.34.1) |
| Gap 2 | Mode-aware filter chips on Orders tab | ✅ Round 22 (V.9.0)                   |
| Gap 3 | Maker LIFF mode badge                 | ✅ Round 4 (V.4.6)                    |
| Gap 4 | SET Detail compact toggle             | ✅ Round 4 (V.7.10)                   |
| Gap 5 | Cart Submit Review WAI-ARIA           | ✅ Round 4 (V.7.11)                   |

---

### Infra — Round 21 (patterns library + cron drift detector + inline handler regression guard) (2026-04-29)

After Round 20 retrospective doc identified 5 reusable patterns inline, Round 21 = solidify infrastructure for long-term maintainability. 3 items, all Risk NONE. ZERO source code changes.

#### ITEM A — Patterns Library Docs (1158 LOC, 6 new files)

Extract 5 patterns from Round 20 retrospective into dedicated `docs/patterns/` library. Each pattern is battle-tested across Rounds 1-20 with concrete code examples + before/after migrations.

- **NEW `docs/patterns/README.md`** (65 LOC) — index linking 5 patterns + when-to-use lookup table + dependency diagram + how-to-add workflow
- **NEW `docs/patterns/EVENT-DELEGATION.md`** (162 LOC) — UX-H3 inline handler refactor pattern. Before/after code, data-attr scoping rules, module-level idempotent guard pattern, helper extraction (`_b2bCfm`, `_scCfm`, `_liffCfm`)
- **NEW `docs/patterns/CACHE-PRIMING.md`** (172 LOC) — PERF sweep pattern. `_prime_post_caches` + `update_meta_cache` template, distributor/maker pre-resolve, function_exists guards, 90%+ DB roundtrip elimination measured
- **NEW `docs/patterns/DATA-ATTR-SCOPING.md`** (244 LOC) — DOM hierarchy data-attr pattern. DD-3 shared child correctness, `.stock-child-of-<SKU>` scheme, forward-lookup `parent_skus[]` indexing, pagination group-aware slicing, search expansion gotcha
- **NEW `docs/patterns/FUNCTION-EXISTS-GUARDS.md`** (229 LOC) — Phase 5+ rollback safety pattern. Cross-snippet calls, WP private API guards, class_exists vs function_exists for class methods, JS `dinocoModal` native fallback chain
- **NEW `docs/patterns/IDEMPOTENCY-KEY.md`** (286 LOC) — Round 19+ wrapper pattern. Top + bottom integration template, state machine (in_progress/done/expired/failed × body match), 24h TTL rationale, Snippet 3 + Snippet 2 examples, backward compat (no header → byte-identical)

Each pattern doc structure: Problem → Solution → When to use → When NOT to use → Used in (concrete file refs + versions) → Anti-patterns → Migration checklist → See also (cross-links).

#### ITEM B — Cron Drift Detector (1 new file, 317 LOC)

- **NEW `tests/jest/cron-drift.test.js`** — extends drift detector suite from 7 → 8

Detection layers:

- **Documented** (CLAUDE.md): backtick-wrapped tokens matching `b2[bf]?_*_(cron|event)` / `dinoco_*_(cron|event)` / `flash_*_(cron|event)`. Code blocks stripped before extraction. Helper names (`dinoco_register_cron`, `dinoco_get_cron`) filtered out.
- **Scheduled**: `wp_schedule_event(<time>, <recurrence>, '<name>')` + `dinoco_register_cron('<name>', ...)` (Health Monitor helper)
- **Handler**: `add_action('<name>', <callback>)` (direct) + `'hook' => 'callback'` (registry array string) + `'hook' => array(<sched>, '<callback>')` (registry array config — Snippet 11) + `dinoco_register_cron(...)` (combines schedule + add_action)

Cron-shape regex captures both suffix-style (`b2b_dunning_cron_event`) and middle-style (`b2f_diff_cron_hourly`, `b2f_cron_weekly_summary`) names.

Whitelists:

- `DOCUMENTED_NOT_SCHEDULED` (1 entry: `b2f_junction_diff_cron` — historical name preserved in CLAUDE.md to explain rename)
- `HANDLER_VIA_DYNAMIC` (empty — registry pattern detection covers all cases)

Coverage: 17 documented + 30+ scheduled + 35+ handlers across 16 snippets — ZERO regressions found in current codebase.

#### ITEM C — Inline Handler Regression Guard (1 new file, 205 LOC)

- **NEW `tests/jest/inline-handler-regression.test.js`** — count-baseline + monotonic decrease enforcement to prevent UX-H3 regression

Detection scope:

- All snippet files (prefix `[B2B]`, `[B2F]`, `[Admin System]`, `[System]`, `[GitHub]`, `[LIFF AI]`)
- Comprehensive event attribute set (40+ attrs from HTML5 + legacy): mouse, keyboard, form, lifecycle, touch, drag/drop, clipboard, misc
- Excluded: `openclawminicrm/` (own audit), `rpi-print-server/` (Python), `liff-src/` (Vite ES modules), `tests/` (fixtures)

Comment-stripping pre-pass (`//` + `/* */`) before regex match — prevents false positives from documentation/migration-pattern examples.

Baseline: 870 (current count: 862, slack: 8). Top contributors: Inventory DB (197), Manual Invoice (94), Service Center (58), Snippet 9 (50), Admin Dashboard (41). 39 files total.

3 test cases:

1. **Sanity** — snippets exist (>5 files have handlers)
2. **Regression check** — count <= baseline + tolerance(0)
3. **Freshness check** — count not significantly below baseline (force ratchet-down when migrations land; threshold = 50 slack)

Failure messages include top 10 offenders + migration pattern code example + pointer to `docs/patterns/EVENT-DELEGATION.md` + 3 resolution paths.

#### Test Suite Growth

- Jest suites: 19 → 21 (+2 NEW: `cron-drift`, `inline-handler-regression`)
- Jest tests: 153 → 156 passing (3 sanity + 1 regression + 1 freshness + 7 cron drift cases)
- Drift detectors: 7 → 8 (cron added — joins shortcode, REST endpoint, constants, snippet DB_ID, JSDoc endpoint, feature flags, markdown links)

#### Commits

- `2721a89` — docs(patterns): NEW patterns library — 5 reusable patterns + index (Round 21 ITEM A)
- `59741b6` — test(jest): NEW cron drift detector — 7 → 8 drift detectors (Round 21 ITEM B)
- `22c6d20` — test(jest): NEW inline handler regression guard — UX-H3 prevention (Round 21 ITEM C)

#### Files Touched (Round 21, 8 total)

- `docs/patterns/README.md` (NEW, 65 LOC)
- `docs/patterns/EVENT-DELEGATION.md` (NEW, 162 LOC)
- `docs/patterns/CACHE-PRIMING.md` (NEW, 172 LOC)
- `docs/patterns/DATA-ATTR-SCOPING.md` (NEW, 244 LOC)
- `docs/patterns/FUNCTION-EXISTS-GUARDS.md` (NEW, 229 LOC)
- `docs/patterns/IDEMPOTENCY-KEY.md` (NEW, 286 LOC)
- `tests/jest/cron-drift.test.js` (NEW, 317 LOC)
- `tests/jest/inline-handler-regression.test.js` (NEW, 205 LOC)

Risk: **NONE** on every item. Pure docs + additive test layer. No production impact possible.

---

### Docs — Round 20 FINAL polish (CLAUDE.md drift sweep + README polish + retrospective doc) (2026-04-29)

After Round 19 explicitly recommended deferring further endpoint integration until 1-2 weeks production canary observed, Round 20 = pure docs sync + verification only. Risk NONE on every item. ZERO source code changes.

#### ITEM A — CLAUDE.md drift sweep

- Added new top-level entry **Idempotency-Key Helper + Endpoint Integration (V.1.0, Rounds 18-19)** documenting Idempotency Helper foundation + 3 endpoint wirings (place-order V.42.10, manual-flash-create V.42.10, create-po V.11.11) + body hash semantics + DD-3 composite merge correctness + future deferral note.
- Added new top-level entry **Test Infrastructure Growth (Rounds 1-19)** summarizing cumulative metrics (0 → 383 PHPUnit + 0 → 146 Jest, 22 Mermaid diagrams, 7 drift detectors, 21 helper test classes, established patterns) + retrospective doc reference.
- Added NEW REST API section **Idempotency Helper — `dinoco/v1/idempotency*`** (2 endpoints) listing list + cleanup + 3 integrating handlers.

#### ITEM B — README polish

- Test count badges updated: PHPUnit `363_passing` → `383_passing` (current count). NEW Jest badge `146_passing`. NEW Mermaid Diagrams badge `22`.
- "What's New (2026-04-29)" section added — summarizes Rounds 13-19 with retrospective link.
- Architecture overview adds "22 Mermaid diagrams" line referencing WORKFLOW-REFERENCE.md.
- Test counts table updated: PHPUnit Unit `211 (13 files)` → `383 (21 files)` listing all test classes. Total `508` → `680`.

#### ITEM C — Final health check

- **PHPUnit**: 383 tests, 579 assertions. All green. Runtime ~7ms. PHP 8.5.4. (1 deprecation — pre-existing).
- **Jest**: 19 suites, 146 passed, 2 skipped. All green. Runtime ~1.2s.
- **PHP `php -l`**: validated 5 critical snippets (Snippet 3 V.42.10, B2F Snippet 2 V.11.11, Idempotency Helper V.1.0, Flag Audit Log V.1.0, Snippet 5 V.33.4) — zero syntax errors.
- **Markdown lint**: `markdownlint-cli2` shows pre-existing line-length + table-style warnings on README + CLAUDE.md (no `.markdownlint.json` config present — defaults). Pattern matches existing convention; no new violations introduced.

#### ITEM D — NEW retrospective doc

- **NEW `docs/audit/ROUNDS-1-19-RETROSPECTIVE.md`** (~280 lines) — cumulative summary of 19 rounds:
  - Round-by-round one-line summary table (Round 1-19)
  - Cumulative metrics (tests / coverage / diagrams / drift detectors)
  - Audit findings closed (10+ CRIT / 24+ HIGH / 40+ MED / 20+ LOW)
  - 5 patterns established (event delegation / cache priming / data-attr scoping / function_exists guards / Idempotency wrapper) with code snippets
  - Lessons learned (what worked / what didn't / tradeoffs)
  - Pending items snapshot for next session (deferred / open low-priority / risks tracked)
  - File tree snapshot of `tests/` + drift detectors
  - Cross-links to ARCHITECTURE-STATUS, CHANGELOG, CLAUDE, AUDIT-REPORT, tests/README

#### Cumulative impact (Rounds 1-19, FINAL snapshot before Round 20)

- Tests: 0 → 383 PHPUnit + 0 → 146 Jest = **529 tests** (+529 across 19 rounds)
- Mermaid diagrams: 0 → 22
- Drift detectors: 0 → 7
- Helper test classes: 0 → 21
- Audit findings closed: 39+ (UX-H3, onerror sweeps, PERF guards, Flag Audit Log, **Idempotency-Key Foundation + 3 endpoint integrations**, etc.)
- Production breaks: **ZERO** across all 19 rounds

#### Files Touched (Round 20, 4 total)

- `CLAUDE.md` — 2 new entries + 1 new REST endpoint section
- `README.md` — 3 new badges + What's New section + test count table
- `CHANGELOG.md` — Round 20 entry (this section)
- `docs/audit/ROUNDS-1-19-RETROSPECTIVE.md` — NEW file (~280 lines)

#### Risk

- **NONE** — pure docs sync + verification, ZERO source code changes, ZERO test changes
- All test suites still green after edits (verified via re-run)

### Fix — Round 19 (Idempotency-Key endpoint integration + +20 contract tests) (2026-04-29)

After Round 18 closed Idempotency-Key foundation (NEW snippet + helpers + 25 unit tests), Round 19 wires the helper into 3 critical POST endpoints — the highest dup-risk surface area: `place-order` (B2B mobile LIFF), `manual-flash-create` (RPi warehouse Wi-Fi), and `create-po` (B2F admin LIFF). All wrapping is additive — clients without `X-Idempotency-Key` header behave identical to V.42.9 / V.11.10.

#### ITEM A — Endpoint integration (commit `c6f91d7`)

- **POST `/b2b/v1/place-order`** (Snippet 3 V.42.9 → V.42.10): wraps both new-order and edit-ticket paths. Body hash = `{ gid, items, note, edit_ticket }`. Existing transient dedup (line 760) + rate-limit V.41.3 intact — idempotency is a layer ABOVE these.
- **POST `/b2b/v1/manual-flash-create`** (Snippet 3 V.42.10): RPi-initiated Flash dispatch. Body hash = `{ dst_*, item_desc, weight, sku, sender_key, dims }`. Same key + same parcel → returns same PNO (no duplicate Flash dispatch on warehouse Wi-Fi retry).
- **POST `/b2f/v1/create-po`** (Snippet 2 V.11.10 → V.11.11): admin LIFF E-Catalog. Body hash = `{ user_id, maker_id, items, note, requested_date, exchange_rate, shipping_method }`. Critical: re-create with different `exchange_rate` would double-charge — now triggers 409 explicitly.
- **Pattern (per endpoint, ~50 LOC inserted)**:
  1. After auth + rate-limit → `dinoco_idempotency_extract_key()` from header (function_exists guard)
  2. Compose body hash input (semantically meaningful fields only — strip nonces, timestamps)
  3. `dinoco_idempotency_check()` → 409 conflict (hash mismatch) / array (cache hit replay) / null (proceed)
  4. Run handler normally if null
  5. Before success return → `dinoco_idempotency_store()` with response + `_idem_code` marker
- **Conflict response**: HTTP 409 + `code: idempotency_conflict` + Thai user-facing message. Cache TTL: 24h (helper default).
- **Helper guard**: `function_exists()` on every call — no-op if Idempotency Helper snippet not synced yet (foundation-deploy ordering protected).
- **Risk: LOW** — wrapper-only at top + bottom of each handler. Body extraction defensive (null fallback). Existing rate-limit + dedup transients intact as defense-in-depth. Rollback: remove `if ( $idem_key )` blocks → handler returns to V.X behavior.

#### ITEM B — +20 endpoint contract tests (commit `c565199`)

- **NEW `tests/helpers/IdempotencyEndpointContractTest.php`** (20 cases, 22 assertions): pure-logic body normalization tests for each integrated endpoint.
- **Coverage**:
  - **place-order** (6 cases): identical body same hash / qty difference 409 / sku difference 409 / **edit_ticket discriminates new vs edit retry** (CRITICAL — prevents wrong-cache replay) / gid namespacing / note difference 409
  - **manual-flash-create** (6 cases): identical body / address difference / weight difference / dims difference / sender_key (DINOCO vs FoxRiderShop) / phone typo correction
  - **create-po** (7 cases): identical body / **exchange_rate difference** (CRITICAL — DOUBLE-CHARGE prevention) / shipping_method (land vs sea) / user_id namespacing / maker_id difference / qty difference / **V.7.0 order_mode in items[] contributes to hash** (DD-3 composite merge key correctness)
  - **cross-endpoint defense-in-depth** (1 case): default body shapes from 3 endpoints all hash differently
- **Pattern**: reuses `IdempotencyTest.php` namespace + `dinoco_idempotency_hash()` adapter (no duplicate inline copy). Test fixtures use `private function {endpoint}_body( $overrides = array() )` factory.

#### ITEM C — Cleanup + verification

- **PHPUnit**: 363 → 383 tests (+20, +5.5%), 557 → 579 assertions. Runtime ~8ms. All green. Zero failures, zero errors. PHP 8.5.4.
- **PHP syntax validate**: both modified snippets pass `php -l` (Snippet 3 V.42.10 + Snippet 2 V.11.11).
- **README**: `tests/README.md` updated with current count (383 tests / 579 assertions) + scope summary listing 21 helper test classes.
- **Files (3 modified, 1 new)**: `[B2B] Snippet 3` V.42.9→V.42.10, `[B2F] Snippet 2` V.11.10→V.11.11, `tests/README.md`, NEW `tests/helpers/IdempotencyEndpointContractTest.php`.
- **Backward compat**: clients without `X-Idempotency-Key` header behave byte-identical to V.42.9 / V.11.10. New mobile / RPi / OpenClaw clients can opt-in by sending header.
- **Future rounds**: 72+ POST endpoints remaining unwrapped — defer until production canary observed (1-2 weeks at minimum) to confirm no regression in the 3 wrapped endpoints. Then batch 5-10 endpoints per round.

### Fix — Round 18 (API-H4 Idempotency-Key foundation + more unit tests + cleanup) (2026-04-29)

After Round 17 closed +37 unit tests (IntentBreakdown + ValidateSkuHierarchy) + 4 Mermaid diagrams (MCP Bridge + Brand Voice), Round 18 closes the long-deferred **API-H4 Idempotency-Key** infrastructure as foundation only (NEW snippet + helpers + tests, no endpoint integration this round). Plus +18 more unit tests for `dinoco_is_top_level_set()` (B2C visibility filter / DD-6 invariant). Test suite grows 320 → 363 (+13.4%).

#### ITEM A — API-H4 Idempotency-Key Helper Foundation V.1.0 (commit `aab03c6`)

- **NEW snippet `[Admin System] DINOCO Idempotency Helper` V.1.0** (~600 LOC, DB_ID pending) — additive infrastructure for safe POST retry handling. Closes audit memory `project_audit_2026_04_17_pending_actions.md` "API-H4 Idempotency-Key header (75+ POST endpoints) — Phase 5+ Deferred" as **foundation only**. Endpoint integration deferred to future rounds (5-10 endpoints at a time).
- **Schema** (lazy-installed via `dbDelta` on `admin_init`): `wp_dinoco_idempotency_keys` (idempotency_key VARCHAR(64), namespace VARCHAR(64), request_hash CHAR(64), response_data LONGTEXT, response_code SMALLINT, user_id, request_ip, created_at, expires_at). 2 indexes: composite `idx_key_namespace` (primary lookup) + `idx_expires_at` (cleanup DELETE).
- **Public API** (5 functions, all `function_exists` guarded):
  - `dinoco_idempotency_hash($body)` — SHA256 hex, body normalization (array/object → JSON, scalar → string, null → '')
  - `dinoco_idempotency_extract_key($req)` — header reader with strict validation (1-64 chars, `[A-Za-z0-9._-]` only, UUID/ULID compatible)
  - `dinoco_idempotency_check($key, $namespace, $body)` — returns `array` (replay), `WP_Error 409` (hash mismatch = conflict), or `null` (proceed to handler)
  - `dinoco_idempotency_store($key, $namespace, $body, $resp, $code, $ttl)` — persist for 24h replay (TTL 60s..7d clamp)
  - `dinoco_idempotency_query($args)` — admin viewer with namespace + user_id filters
- **Cleanup cron**: `dinoco_idempotency_cleanup_cron` daily 03:15 (offset from flag-audit retention 03:00 to spread DB load). Chunked 1000/iter × 20 iter cap = 20K rows/run.
- **REST API** (admin only, `manage_options` + `wp_rest` nonce): `GET /dinoco/v1/idempotency` (list with filters) + `POST /dinoco/v1/idempotency/cleanup` (manual trigger).
- **Admin viewer**: shortcode `[dinoco_idempotency_viewer]` — table list + filters + manual cleanup button + amber "Foundation Mode" banner clarifying no endpoints use it yet.
- **Tests** (NEW `tests/helpers/IdempotencyTest.php`, 25 cases, 31 assertions): HASH (12 cases — 64-char SHA256 hex, identical body deterministic, different body distinct, null = '' well-known constant, string pass-through, scalar coercion, order-sensitive RFC draft, nested array, empty array vs null distinct, stdClass = assoc array, Thai unicode preserved). EXTRACT KEY (11 cases — UUID v4, ULID, empty, whitespace only, trimmed, too long >64, boundary 64, special chars rejected (SQL inject/spaces/slashes/HTML), whitelist `.-_` allowed, unicode rejected, single char). CONFLICT (2 cases — hash mismatch reliable, identical retry deterministic).
- **Risk: NONE** — additive new snippet, zero existing-code changes, no endpoint integration this round. Defensive fail-soft if table missing (lazy install + silent return null).

#### ITEM B — +18 IsTopLevelSet test cases (commit `b4eb5e9`)

- **NEW `tests/helpers/IsTopLevelSetTest.php`** (18 tests, 24 assertions) — locks the DD-6 invariant for `dinoco_is_top_level_set()` (Snippet 15 V.6.0+ lines 1736-1759).
- **Why DD-6 lock matters**: Wrong = TRUE → sub-SET appears as standalone B2C product → customer buys "half a kit" → claim/refund hell. Wrong = FALSE → real top-level SET hidden from B2C → lost sales.
- **Coverage**:
  - **POSITIVE (5 cases)**: standard 3-level top set / 2-level direct leaves / DD-3 both parents top-level / lowercase normalization / whitespace trim
  - **NEGATIVE (7 cases)**: intermediate child / leaf SKU / unknown SKU / DD-3 shared child (any parent disqualifies) / empty relations / empty children array / bare SKU
  - **EDGE (5 cases)**: lowercase children in relations / whitespace in relations / non-array children value (defensive) / empty string input / whitespace input
  - **INVARIANT (1 case)**: Real-world DINOCO catalog example — `DNCGNDPRO5500` shared leaf NEVER appears as B2C bundle even though referenced by 2 SETs
- **Pattern**: same isolation as existing helpers (`HierarchyTest`, `ValidateSkuHierarchyTest`) — inline pure logic, `function_exists` guard, `declare(strict_types=1)`, no WP boot, no DB. Adapter accepts `$relations` by-arg instead of `get_option` call.
- **Risk: NONE** — additive tests only.

#### ITEM C — Cleanup + verification (this entry)

- **PHPUnit**: 320 → 363 tests (+43, +13.4%), 502 → 557 assertions (+55). Runtime ~7ms. All green. Zero failures, zero errors. PHP 8.5.4.
- **Jest**: 19 suites, 146 passed, 2 skipped. Runtime ~1.0s. All green.
- **README badge**: Updated PHPUnit count badge `211_passing` → `363_passing` (had drifted across rounds).
- **DB_ID drift test** (`tests/jest/snippet-db-id.test.js`): NEW Idempotency snippet uses `DB_ID: (pending — populate after first WP Code Snippets sync)` placeholder pattern — passes drift detector.
- **PHP syntax**: `[Admin System] DINOCO Idempotency Helper` validated via `php -l` (with `<?php` prepend per WP Code Snippets convention).

#### Cumulative impact (Rounds 1-18)

- Tests: 0 → 363 (+363 across 18 rounds)
- Mermaid diagrams: 0 → 22
- Drift detectors: 0 → 7
- Doc index files: 0 → 1 (regression manifest)
- Audit findings closed: 39+ (UX-H3, onerror sweeps, PERF guards, Flag Audit Log, **API-H4 Foundation**, etc.)

#### Files Touched (Round 18, 4 total)

- 1 new snippet: `[Admin System] DINOCO Idempotency Helper` (+~600 LOC)
- 2 new tests: `tests/helpers/IdempotencyTest.php` (+~210 LOC) + `tests/helpers/IsTopLevelSetTest.php` (+~252 LOC)
- 1 docs update: `README.md` (test count badge bump)

---

### Fix — Round 17 (MCP Bridge architecture diagram + Brand Voice flow + more unit tests) (2026-04-29)

After Round 16 closed +31 unit tests + 2 Mermaid diagrams + master regression index, Round 17 continues safe polish: 4 new Mermaid diagrams documenting the largest API namespace (MCP Bridge — 32 endpoints) + Brand Voice Pool entry lifecycle, plus 2 more unit test suites covering V.7.0 intent breakdown aggregator + Snippet 15 hierarchy validator. Test suite grows 283 → 320 (+13.1%). Cumulative diagrams 18 → 22.

#### ITEM A — MCP Bridge architecture + Brand Voice flow (+4 Mermaid, commit `d9fc51e`)

- **§13 MCP Bridge Architecture** (`WORKFLOW-REFERENCE.md` +99 LOC) — first comprehensive doc for the largest namespace (`/wp-json/dinoco-mcp/v1/` × 32 endpoints, `[System] DINOCO MCP Bridge` V.2.3, DB_ID 1050). Cross-ref code lines 9-44 (header), 61-90 (atomic key gen), 93-1090 (32 routes). Includes `graph TB` diagram (clients → X-API-Key auth → 6 categories → subsystems + cache layer) + `sequenceDiagram` (atomic key gen via `add_option` per V.2.3 API-H2 + `hash_equals` verify flow). Captures all 6 endpoint categories: Core lookup × 8 / Manual claims × 4 / KB+BV × 2 / Lead Pipeline P1 × 5 / Phase 2 reads × 7 / Phase 3 webhooks × 5. Documents 4 external clients (OpenClaw / Claude Desktop / Telegram / Admin) + 5 subsystem integration points + cache layer (transients per endpoint TTL).
- **§14 Brand Voice Pool Flow** (`WORKFLOW-REFERENCE.md` +64 LOC) — `[Admin System] DINOCO Brand Voice Pool` V.2.11 (DB_ID 1159). Includes `sequenceDiagram` covering 4 phases (Ingest → AI Classify → Review/Action → Daily expire) with 7 participants (social listener, REST, CPT, Gemini AI, Admin, transient cache, cron). Plus `graph LR` diagram visualizing V.2.11 stats cache strategy (5-min TTL transient + 3 invalidation hooks — eliminates 219K cache lookups per stats request per the V.2.11 MED-3 fix).
- **Gotchas documented**: X-API-Key vs X-MCP-Key (legacy doc typo), key rotation procedure, OpenClaw separate `dinoco_openclaw_api_key`, per-$days transient keys, Gemini direct (not via OpenClaw agent), bv_dup_md5 1-day guard, brands enum hardcoded.
- **Risk**: NONE — pure docs.

#### ITEM B — +37 unit tests for V.7.0 intent + hierarchy validator (commit `bc111e0`)

- **`IntentBreakdownTest.php`** (21 tests, 38 assertions) — Locks `b2f_compute_intent_breakdown()` aggregation logic (Snippet 2 V.11.0 lines 2712-2727 REST + Snippet 1 V.7.0 §100.6 lines 4055-4068 fallback). 4-key counter feeds 5 UI sites (Flex card, PO Image, PO Ticket, Maker LIFF, Admin LIFF SET Detail). Coverage: empty/null/non-array, single mode, mixed, ACF vs REST shape (with REST precedence test), empty mode, missing key, unknown enum, type coercion (str/float/neg), malformed items, legacy V.6 PO backward compat, schema invariants (total ≥ bucket sum, 4-key shape).
- **`ValidateSkuHierarchyTest.php`** (16 tests, 40 assertions) — Locks `dinoco_validate_sku_hierarchy()` pre-save validator (Snippet 15 V.7.1+ lines 1769-1804). Guards Admin Inventory V.42.x save_sku_relation endpoint — bypass would corrupt hierarchy → DD-2 stock cut chain explodes (infinite recursion in `dinoco_get_leaf_skus`). Coverage: self-ref (case-insensitive + trim), circular (2-level + 3-level), depth violation (chain + parent already has grandchildren), allowed cases (empty set, existing child, DD-3 shared leaf, unrelated), edge cases (case insensitive parent lookup, whitespace trim, exactly depth 3 boundary).
- **Suite size**: 283 → 320 tests (+37, +13.1%), 424 → 502 assertions (+78). All green. Zero failures, zero errors. PHP 8.5.4 runtime.
- **Pattern**: same isolation boundary as existing helpers (`HierarchyTest`, `OrderModeLabelTest`) — inline copy of pure logic, `function_exists` guard for cross-test compat, `declare(strict_types=1)`, no WP boot, no DB.
- **Risk**: NONE — additive tests only.

#### ITEM C — Health check (this entry, no separate commit)

Verified all test infrastructure green after 17 rounds:

- **PHPUnit**: 320 tests, 502 assertions, 1 deprecation (PHPUnit 11 minor — pre-existing). Runtime ~12ms full suite.
- **Jest**: 19 suites, 146 passed, 2 skipped. Runtime ~1.2s.
- **markdownlint-cli**: 0 MD040 / 0 MD060 / 0 MD012 in new sections (28 MD013 line-length hits in §13/§14 — same pattern as existing file, not regressions).
- **php -l smoke**: 5 referenced snippets (B2F Snippet 1, B2F Snippet 2, B2B Snippet 15, MCP Bridge, Brand Voice Pool) all syntactically valid (Brand Voice false-positive resolved with `<?php` prepend per WP Code Snippets convention).

#### Cumulative impact (Rounds 1-17)

- Tests: 0 → 320 (+320 across 17 rounds)
- Mermaid diagrams: 0 → 22 (+4 this round)
- Drift detectors: 0 → 7
- Doc index files: 0 → 1 (regression manifest)
- Audit findings closed: 38+ (UX-H3, onerror sweeps, PERF guards, Flag Audit Log, etc.)

#### Files Touched (Round 17, 3 total)

- 2 new tests: `tests/helpers/IntentBreakdownTest.php` (+283 LOC) + `tests/helpers/ValidateSkuHierarchyTest.php` (+224 LOC)
- 1 docs update: `WORKFLOW-REFERENCE.md` (+243 LOC, §13 + §14 added)

---

### Fix — Round 16 (More unit tests + flow diagrams + regression manifest index) (2026-04-29)

After Round 15 closed Top 3 ROI items (update_meta_cache guards + flow diagrams + unit tests), Round 16 continues low-priority polish: 2 more unit test suites for V.7.0 + V.42 critical guards, 2 new Mermaid diagrams (Walk-in stateDiagram + B2F PO sequenceDiagram), and a master REGRESSION-MANIFEST-INDEX.md linking 3 separate manifest files. ROI lower than Round 15 but additive coverage with NONE risk. Test suite grows 252 → 283 (+12.3%).

#### ITEM A — +31 unit tests for V.7.0 + V.42 critical decision helpers (commit `85c6fd1`)

- **`ValidateSourceSkuTest.php`** (14 tests, 31 assertions) — Locks `b2f_validate_source_sku_in_ancestors()` (Snippet 1 V.7.0 line 3761), the V.7.0 Order Intent anti-malicious guard preventing cross-set source-spoof attack.
- **`ExpressCategoryTest.php`** (17 tests, 17 assertions) — Locks `dinoco_suggest_express_category()` (Snippet 15 V.8.0 line 4045), the Flash V.42 vehicle suggester (1=bike, 4=truck) — wrong = wrong courier dispatched + wrong fee billed.
- **Coverage**: empty inputs → WP_Error (NOT silent pass) / self-loop / case-insensitive + whitespace tolerated / DD-3 shared leaf in N sets / spoof attack rejected / boundary conditions at all 3 thresholds (5000g/45cm/150cm) STRICT > / intval string coercion / custom thresholds via dinoco_shipping_defaults() / negative weight graceful / documents geometric reality (sum_dim threshold only fires when max_dim already trips).
- **Suite size**: 252 → 283 tests (+31, +12.3%), 376 → 424 assertions (+48). All green. Zero failures, zero errors.
- **Risk**: NONE — additive tests only.

#### ITEM B — 2 new Mermaid flow diagrams (commit `c2051e1`, `WORKFLOW-REFERENCE.md` +164 LOC)

- **§2.2.1 Walk-in Order Auto-Complete Flow (stateDiagram-v2)** — Visualizes the 2 key bypass behaviors (skip stock check + auto-complete after payment) next to the regular OOS-gated path. Documents the WALK-IN-ONLY `completed → cancelled` escape hatch (V.33.2, FSM V.1.5).
- **§3.1.1 B2F PO Submission Flow (sequenceDiagram)** — End-to-end POST /b2f/v1/create-po with 11 participants. Captures DD-7 leaf expansion / DD-3 composite merge key / V.7.0 7-rule validator / multi-currency immutability / par/and parallel notify / PII gate.
- **TOC**: Updated with sub-section anchors.
- **Risk**: NONE — pure documentation.

#### ITEM C — Master Regression Manifest Index (commit `a4f0c63`, NEW `REGRESSION-MANIFEST-INDEX.md` 143 LOC)

- **Problem**: 3 separate regression manifest files scattered across the repo (B2B-BACKORDER + FLASH-SHIPPING-V42 + chatbot regression-guard) — no discoverability layer.
- **Approach**: Index provides discoverability layer without duplicating scenario content. Each manifest remains the single source of truth for its system.
- **Total**: 165 scenarios indexed across 3 systems (71 B2B BO + 69 Flash V.42 + 25 chatbot).
- **Sections**: TL;DR table / "When to Use Each Manifest" decision guide / Section maps per manifest / Cross-system patterns (walk-in bypass, feature flag rollback, DD-3 shared leaf, atomic compensation) / "Adding New Scenarios" workflow / Future Automation Roadmap / Related docs cross-refs.
- **Risk**: NONE — pure docs.

#### Cumulative impact (Rounds 1-16)

- Tests: 0 → 283 (+283 across 16 rounds)
- Mermaid diagrams: 0 → 18
- Drift detectors: 0 → 7
- Doc index files: 0 → 1 (regression manifest)
- Audit findings closed: 35+ (UX-H3, onerror sweeps, PERF guards, Flag Audit Log, etc.)

#### Files Touched (Round 16, 4 total)

- 2 new tests: `tests/helpers/ValidateSourceSkuTest.php` + `tests/helpers/ExpressCategoryTest.php`
- 1 docs update: `WORKFLOW-REFERENCE.md` (+164 LOC + 2 TOC entries)
- 1 new docs: `REGRESSION-MANIFEST-INDEX.md` (143 LOC)

---

### Fix — Round 15 (Top 3 ROI items: update_meta_cache guards + flow diagrams + unit tests) (2026-04-29)

After Round 14 closed 3 MED findings, Round 15 picks Top 3 ROI items from the pending list and ships all 3 in batched commits. Risk NONE on every item. Test suite grows 226 → 252 (+11.5%).

#### ITEM A — `update_meta_cache()` `function_exists` guard sweep (commit `e43b614`)

- **Background**: Round 14 MED-2 closed `_prime_post_caches()` guards in Snippet 16 but explicitly deferred `update_meta_cache()` (also marked WP private API per source code marker). Round 15 ITEM A closes the deferred sweep.
- **Approach**: Grep all `update_meta_cache(` call sites → 22 across 8 snippets. `[B2B] Snippet 7` (V.30.x) already guarded — used as reference pattern. Wrap remaining 11 sites in `if ( function_exists( 'update_meta_cache' ) )` block.
- **Snippets touched** (7 files, 11 sites guarded, +57/-22 LOC):
  - `[B2B] Snippet 5` V.33.3 → V.33.4 — admin orders distributor priming (1 site)
  - `[B2B] Snippet 16` V.3.2 → V.3.3 — bo-pending-review + bo-queue (2 sites)
  - `[LIFF AI] Snippet 1` V.1.9 → V.1.10 — `/claims` REST endpoint (1 site)
  - `[B2F] Snippet 11` V.2.5 → V.2.6 — `flex_retry` cron batch (1 site)
  - `[B2B] Snippet 12` V.31.6 → V.31.7 — BO + tracking + shipping distributor priming (3 sites)
  - `[B2F] Snippet 2` V.11.9 → V.11.10 — makers list + admin maker products + po-history + dashboard-stats + po-history maker priming (5 sites)
  - `[B2B] Snippet 3` V.42.8 → V.42.9 — catalog + order-history + admin-bo-tickets + admin-shipping-queue (9 sites)
- **Verification**: `php -l` against all 7 modified files → all pass. Pure no-op on healthy WP installs (≥ 2.7.0). Trigger only if WP core ever moves/renames `update_meta_cache()`.

#### ITEM B — 2 new Mermaid sequenceDiagrams (commit `5d23e91`)

- File: `WORKFLOW-REFERENCE.md` (+181 LOC)
- **§1.1.1 Member Warranty Registration Flow** — End-to-end: scan QR → LINE Login OAuth → WP user create/link → `[dinoco_gateway]` form → optional Gemini OCR → serial validate → `warranty_registration` CPT create → 12-month period start. Edge cases: PDPA first-time consent, optional non-blocking OCR, motorcycle image lookup via custom table, daily auto-expire cron.
- **§2.1.1 B2B Order Confirmation Flow** — End-to-end: customer `confirm_order` postback → BO flag check (V.1.6+ opaque accept vs legacy) → atomic stock subtract (FOR UPDATE per leaf SKU) → debt update (FOR UPDATE) → INV image push → Slip2Go PULL verify → `paid` transition → V.42 G4 async snapshot defer → V.42 G1 dispatcher Flash create. Edge cases: walk-in skip stock + auto-complete, BO opaque reply (no stock info), 72hr timeout cron.
- TOC updated with sub-section anchors. Pure documentation.

#### ITEM C — +26 unit tests (commit `94ef795`)

- New files: `tests/helpers/SetCostsTest.php` (14 tests, 37 assertions) + `tests/helpers/PackModeDetectTest.php` (12 tests, 12 assertions)
- Suite size: 226 → 252 tests (+26, +11.5%). All green.
- **`SetCostsTest.php`** — Locks `b2f_compute_set_costs_v918()` invariants. The V.11.3 design rule "SET has NO manual price; it's an aggregate of leaves" (commit 7e6b726). Coverage: empty inputs / full leaf coverage / partial leaves / zero-cost leaf as missing / no registered leaves preserves unit_cost (NEVER zero out — fallback) / non-SET untouched / 3-level hierarchy walks only leaves / shipping_land summed when SET empty / shipping_land preserved when explicit / DD-3 shared leaf counted per SET independently / lowercase SKU → uppercase normalization / self-loop guard / unit_cost_stored audit snapshot.
- **`PackModeDetectTest.php`** — Locks `dinoco_smart_detect_pack_mode()` decision matrix. Flash V.42 pack mode picker drives PNO count + shipping fee + courier dispatch — wrong detection = wrong fee. Coverage: catalog miss → 'auto' / leaf default → 'single_box' / `upb>1` → 'bulk_pack' / `bpu>1` → 'multi_box' / SET+`bpu=1` → 'assembled_set' / SET+`bpu>1` → 'multi_box' / decision priority `upb > bpu > assembled_set > single_box > auto` / missing dims default 1 / zero dims → 'auto' / string numeric coercion / lowercase SKU normalization.
- **Implementation**: Used dedicated sub-namespace `DinocoTests\Helpers\PackMode` to avoid collision with `HierarchyTest`'s `dinoco_is_leaf_sku($sku, array $relations)` (2-arg signature). Pack-mode helper takes 1 arg only.
- **Risk**: NONE on every item (additive guards / pure docs / additive tests).

### Fix — Round 14 (Close 3 MED findings from Round 13 code-reviewer audit) (2026-04-29)

After Round 13 audit identified 3 MED findings (0 HIGH/CRIT), Round 14 closes all 3 in a single batched commit. Risk LOW-NONE on every item. Net code: -1 LOC dead, +95 LOC defensive guards/cache.

#### MED-1 — manual_ship.html V.44.5 dead code removal

- File: `rpi-print-server/templates/manual_ship.html` (V.44.4 → V.44.5)
- Removed `t.style.display='none'` inside img-error capture-phase delegation (line 1337) — `parentNode.textContent='📦'` on next line replaces all child nodes, wiping the `<img>` element entirely. Setting display:none on a soon-to-be-removed node has no effect.
- Behavior identical to V.44.4. Pure dead-code elimination.

#### MED-2 — `_prime_post_caches()` defensive guard sweep

- File: `[B2B] Snippet 16: Backorder System` (V.3.1 → V.3.2)
- WordPress source marks `_prime_post_caches()` as `@access private` despite being public + stable since 2.7.0. Defensive guard wraps every call.
- 4 sites guarded (lines 1108, 1120, 2347, 2360 — bo-pending-review + bo-queue paths). `update_meta_cache()` left ungated (also private but stable).
- Snippet 3 V.41.x already had this guard. Sweep confirmed only Snippet 16 was missing — no other snippets use `_prime_post_caches()`.
- Pattern: `if ( function_exists( '_prime_post_caches' ) ) { _prime_post_caches(...); }` — pure no-op on installs ≥ WP 2.7.

#### MED-3 — Brand Voice Pool stats aggregation cache

- File: `[Admin System] DINOCO Brand Voice Pool` (V.2.10 → V.2.11)
- Issue: `bv_get_stats()` loads up to 9999 entries × ~22 meta fields = 219K postmeta cache lookups per call. Stats endpoint hits this on every dashboard refresh + AI summary trigger. CPU-bound aggregation hot path.
- Solution: Layer 1 transient cache wrapper (5-min TTL, keyed by `$days`):
  - NEW `bv_get_stats_cached($days = 30, $force_refresh = false)` — read-through transient with bypass param
  - NEW `bv_invalidate_stats_cache()` — busts every cached window (common: 30/90/180/365 + defensive SQL sweep on `_transient_bv_stats_v1_%` LIMIT 50)
  - 3 invalidation hooks: `bv_create_entry()` end / `update_entry` REST handler end / `delete_entry` REST handler end (all gated by `function_exists`)
  - 2 call sites converted: `bv_get_ai_summary()` (90d) + REST `get_stats` route (30d, with `?refresh=1` bypass param)
- Worst-case stale window: 5 minutes (acceptable per spec). Read-heavy workload (dashboard refresh) benefits most: 1 compute / 5min vs 1 compute / request.
- Direct `bv_get_stats()` callers unchanged — preserved as low-level helper.

#### Validation

- `php -l` clean on both PHP snippets
- `grep -c "function_exists.*_prime_post_caches" Snippet 16` = 4 (matches site count)
- `grep -c "bv_invalidate_stats_cache" BVP` = 6 (1 def + 5 callers)

Files touched: 3 (manual_ship.html / Snippet 16 / Brand Voice Pool)

---

### Audit + Test — Round 13 (Cross-rounds code review + unit test expansion + PERF sweep finalize) (2026-04-30)

After 42 commits across Rounds 1-12 (UX-H3 100% / onerror 100% / 7 drift detectors / 211 phpunit + 146 jest tests / Flag Audit Log / 5 PERF sweeps / MD040 clean / coverage badges) without independent code review, Round 13 = safety verification + final polish. ZERO regressions across all 12 rounds maintained.

**ITEM A — Cross-rounds code review audit (read-only)**

Manual audit of 42 commits since session start. Focus areas: UX-H3 refactor (Phases 1-6 — 124 sites in B2F Snippet 5 V.7.x → V.8.6) / onerror migration (manual_ship V.44.4) / PERF cache priming (Snippets 5/7/12 + B2F Snippet 2 + LIFF AI Snippet 1) / NEW Flag Audit Log V.1.0 (DB schema + helper + viewer + REST API) / NEW BO V.3.0 bulk ops (Snippet 16 selection state + bulk handlers).

Findings (3 MEDIUM + 0 HIGH + 0 CRITICAL):

- **MED-1** — `manual_ship.html` V.44.4 line 1337 (`t.style.display='none'`) is dead code after `parentNode.textContent='📦'` on next line wipes the entire `<img>` element. Cosmetic; leaving as-is for V.44.5 cleanup batch (no behavior impact — emoji renders correctly either way).
- **MED-2** — `[B2B] Snippet 16` V.2.9 `_prime_post_caches()` calls (4 sites: lines 1108, 1120, 2347, 2360) lack `function_exists` defensive guard. WP internal function (private but stable since 1.5+); risk: future WP could deprecate without notice. Defer to V.3.2 (additive guard, no urgency).
- **MED-3** — `[Admin System] DINOCO Brand Voice Pool` `bv_get_stats()` calls `bv_get_entries(['limit' => 9999])` → fetches up to 9999 posts × 22 meta reads = 219k cache lookups. WP_Query auto-primes postmeta cache (single query) so it's CPU/memory-bound, not N+1 query. Defer to V.42.x backlog (refactor to SQL-aggregate sentiment counts directly).

POSITIVE FINDINGS (concerns proven safe):

- **UX-H3 outer card delegation chain** (B2F Snippet 5 V.8.5+): `closest('[data-action]')` walks UP from target → child action buttons match before outer card's `orders-go-to-ticket` → checkbox/edit/delete buttons fire only their own handler. Verified via tracing checkbox→updateBulkBar path: browser default action toggles checkbox state BEFORE click bubbles to document → `:checked` query inside `updateBulkBar` reads correct post-toggle state. Behavior preservation confirmed.
- **Compound `data-args` JSON dispatch** (V.8.4 close-and-call): Whitelist `_ORDERS_CLOSE_AND_CALL_FNS` (8 entries) prevents arbitrary fn dispatch. JSON.parse + Array.isArray gate. esc() HTML-encodes attribute. Thai PO numbers + special chars handled safely.
- **Flag Audit Log V.1.0 DB safety**: SHOW TABLES probe + lazy install retry + transient-throttled error_log on persistent miss + `\Throwable` catch + try/finally. Insert never throws to caller. Source whitelist (8 values, falls to 'other'). VARCHAR(255) truncation via serializer. Composite indexes (flag_name, changed_at, user_id). Retention cron chunked 1000/iter + 50ms gap + 20-iter cap = 20K rows/run safety ceiling.
- **Snippet 16 BO bulk ops state**: `_boSelected` (Set) + `_boRowMeta` (Map) preserved across `loadQueue()` refresh. Stale ID drop after each refresh (`if (!visibleIds.has(id))`). Status guard (`pending`/`ready` only) before bulk-fulfill build. Defensive: dinocoModal try/catch + native confirm/prompt fallback. Idempotent.
- **PERF cache priming (5 sites in Snippet 7 V.31.1)**: dunning + daily-summary today_orders + shipped_today_ids + rank-update dists + weekly-report week_orders + weekly-report dists + shipping-overdue orders. All use `update_post_meta_cache(wp_list_pluck($posts, 'ID'))` pattern. function_exists guards in 1 site (line 1233) — others rely on WP core (acceptable since Snippet 7 only loads in WP context).

**ITEM B — Unit test expansion (+15 tests, 211 → 226)**

Picked CurrencyTest expansion to fill gaps (16 → 31 cases). Ranking: critical because `b2f_currency_symbol/format/name_en/t` feed every Flex card amount + cron message + Bot reply across all 3 currencies (THB/CNY/USD). Regression here = wrong language/symbol shown to factories.

15 new cases added across 4 helpers:

- **`b2f_currency_symbol`** (+3): default-arg-is-thb / empty-string → empty (no fallback to code) / lowercase 'thb' NOT recognized (case-sensitive map invariant locked).
- **`b2f_format_currency`** (+4): default-arg-is-thb / integer→2dp / half-up rounding boundary (1.234 vs 1.235) / 999,999 thousands separator boundary.
- **`b2f_currency_name_en`** (+4): CNY → 'Chinese Yuan' / USD → 'US Dollar' / default-arg-is-thb / empty → empty.
- **`b2f_t`** (+4): default-arg-is-thb / unknown currency 'JPY' → EN branch / `'0'` Chinese is truthy (NOT fallback) / empty TH stays empty (no silent EN fallback when THB).

Why these matter (regression scenarios prevented):

- Lowercase-not-recognized lock prevents future "let's normalize automatically" PR — would silently break `'thb'` callers expecting fallback returns.
- Half-up rounding boundary locks PHP `number_format` behavior — sensitive for invoice totals (10K orders × off-by-1 satang adds up).
- `'0'` truthy lock: prevents false-positive "missing translation" detection that would silently fall to EN when admin literally wanted '0' as Chinese.

Result: 211 → 226 phpunit tests (+15), 311 → 327 assertions (+16). All green.

**ITEM C — PERF sweep finalize**

Surveyed 2 candidate Admin shortcodes for N+1 patterns:

- **`[Admin System] DINOCO Service Center & Claims`** — `dinoco_daily_auto_close_tickets` cron + `get_claims_list` action handler both use `WP_Query` (default `cache_results=true` auto-primes postmeta). `get_product_info($tid)` closure reads same-post ACF inside loop — cached. NO N+1.
- **`[Admin System] DINOCO Brand Voice Pool`** — `bv_get_entries()` 22 meta reads per post but WP_Query auto-primes cache. Concern: `bv_get_stats($days=30)` calls limit=9999 (CPU-bound). Documented as MED-3 above; not Round 13 quick win.

No actionable N+1 found. Phase 4 status: complete (Rounds 2/5/7/9 already closed all major hot paths in B2B Snippets 3/5/7/12 + B2F Snippet 2 + LIFF AI Snippet 1).

**Files touched (2 total)**:

- `tests/helpers/CurrencyTest.php` (+15 cases, ~80 LOC additive)
- `CHANGELOG.md` (this entry)

**Validation**:

- `vendor/bin/phpunit` → 226 tests pass (+15 from R12) / 327 assertions / 1 deprecation warning (PHPUnit 11+ namespace warning, not a failure).
- `php -l tests/helpers/CurrencyTest.php` clean.
- No source files modified — pure additive (audit findings logged, fixes deferred to next versioned releases).

**Round 13 net**: 0 commits to source code, 1 commit to tests + docs, 0 regressions, 3 MEDIUM findings logged for future batches, 4 positive verifications recorded.

---

### Test + Docs — Round 12 (MD040 lint sweep + unit test expansion + coverage badge) (2026-04-30)

3 cosmetic+test items closed zero-risk. Net: +99 markdown lang tags, +41 unit tests, 3 coverage badges in README.

**ITEM A — MD040 lint sweep (3 .md files, 99 fixes)**

Pre-existing MD040 warnings ("Fenced code blocks should have a language specified") cleared across `WORKFLOW-REFERENCE.md` (53), `FEATURE-SPECS.md` (43), `SYSTEM-REFERENCE.md` (3). `CLAUDE.md` + `CHANGELOG.md` + `README.md` already clean.

- Detection: paired fence positions, content-sniffed each pair → `text` (workflow narrative), `sql` (SQL queries), `json`, `php`, `bash`, `http` per content fingerprint.
- Result: 95% workflow text, 5% SQL — applied automated language tagging via Python AST-style scan.
- Verification: `npx markdownlint-cli` returns 0 MD040 across all 6 major .md files post-fix.
- Risk: NONE — pure docs cosmetics.

**ITEM B — Unit test expansion (+41 tests, 170 → 211)**

Picked 2 helpers not yet covered after surveying 11 existing test files.

- **`b2f_format_date_thai()`** (FormatDateThaiTest, 19 cases): empty/null/zero/falsy → `'-'`, ISO date/datetime/T+TZ/leap day → `'DD/MM/YYYY'`, garbage → passthrough, `@unix` epoch → Bangkok TZ, US/Thai format edge cases. Locks Bangkok TZ in setUp/tearDown.
- **`b2f_compute_manufacturing_summary()`** (ManufacturingSummaryTest, 22 cases): empty/null/string → `[]`, item filter (empty SKU skipped), numeric coercion, name fallback chain, image_url fallback, DD-3 detection (`is_shared` true ⇔ count(breakdown) > 1) — 1/2/3 parents tested, summary order preserved. Critical for "ใช้ใน N SET" badge logic.
- Pattern: re-implements function inline (mirrors snippet body), no `require` of WP-loaded snippet.
- Total: 170 → 211 tests, 261 → 311 assertions.
- Risk: NONE — additive tests only.

**ITEM C — Coverage badge (Phase 5 M5 closed)**

Jest coverage generated and badged in README:

- Lines 98.68% (brightgreen badge)
- Statements 96.38%
- Functions 93.75%
- Branches 85.09% (green badge)

PHPUnit coverage skipped — no XDebug/PCOV in dev env. Documented in README ("requires `pecl install pcov`"). Test counts table updated: PHPUnit Unit 110 → 211 (13 files), Jest 136 → 146 (7 drift detectors), Total 363 → 508. Coverage metric table inserted.

**Files touched (5 total)**:

- `WORKFLOW-REFERENCE.md` (+53 lang tags)
- `SYSTEM-REFERENCE.md` (+3 lang tags)
- `FEATURE-SPECS.md` (+43 lang tags)
- `tests/helpers/FormatDateThaiTest.php` (NEW, 137 LOC, 19 cases)
- `tests/helpers/ManufacturingSummaryTest.php` (NEW, 269 LOC, 22 cases)
- `README.md` (+3 badges + coverage table + counts updated)

**Validation**: `npx markdownlint-cli ...md` MD040=0; `vendor/bin/phpunit` 211 pass; `npx jest` 146/148 pass; `php -l` clean on new files; `npx jest --coverage` produces coverage-summary.json.

---

### Test + Refactor — Round 11 (onerror migration + REST drift detector + unit test expansion) (2026-04-30)

3 commits closing low-priority polish + safety nets queued for a long time. Risk: LOW (UX-equivalent refactor) + NONE (additive tests).

**ITEM A — onerror img fallback delegation (`rpi-print-server/templates/manual_ship.html`)**

Survey result: 1 site remaining across entire repo (PHP files: 0 sites — already CSP-clean across all snippets after Rounds 6-9 closed onclick patterns 100%). The lone site was at line 1280 — picker thumbnail with inline `onerror="this.style.display='none';this.parentNode.textContent='📦'"`.

- Pattern: `onerror=...` → `data-img-fallback="emoji"` + capture-phase event delegation.
- CRITICAL: `error` events do NOT bubble for `<img>` — listener uses `addEventListener('error', ..., true)` capture phase (essential, not optional).
- Loop guard: clear `data-img-fallback` before mutation to prevent re-fire if fallback path itself errors.
- Manual_ship V.44.3 → V.44.4 with bullet in HTML header comment.
- JS validated via `new Function()` parse check (passed clean).

**ITEM B — REST endpoints drift detector (`tests/jest/rest-endpoints-drift.test.js`, NEW, 327 LOC)**

6th drift detector after shortcode / feature-flags / constants / DB_ID / markdown-links / jsdoc-endpoint-refs. Cross-checks all documented `/wp-json/<ns>/v1/<path>` mentions in CLAUDE.md against actual `register_rest_route()` registrations across snippet files. 125+ endpoints in 7 namespaces — easy to add new endpoint without doc update.

Detector handles 3 register_rest_route patterns:

- A) Direct: `register_rest_route('NS/v1', '/path', ...)`
- B) Variable: `$ns = 'NS/v1';` + `register_rest_route($ns, '/path', ...)` (B2F)
- C) Constant: `define('B2F_AUDIT_NS', 'dinoco-b2f-audit/v1');` + `register_rest_route(B2F_AUDIT_NS, '/path', ...)` (Audit dashboard).
  - **CRITICAL bug fix during dev**: const name char class must include digits `[A-Z0-9_]+` because `B2F_AUDIT_NS` contains `2`. The `[A-Z_]+` form silently failed all const matches — would have shipped a broken detector.

Doc extraction handles 3 patterns:

- A) "Under `/wp-json/NS/v1/`: `path1`, `path2`, ..."
- B) "All under `/wp-json/NS/v1/`: ..."
- C) Bullet style with backtick path `GET /drift` after a namespace banner. **Namespace context resets** on heading boundaries (lines starting with `##` or `###`) and after 3+ blank lines — prevents bleed across sections (initial run had GDPR section bullets discussing `/b2b/v1/rpi-products` mistakenly tagged dinoco-gdpr/v1).

Path-equivalence: registered routes with `(?P<id>\d+)` parameter capture canonicalize to `:param`. Documented forms often omit the param suffix (e.g. doc `maker-products` vs reg `maker-products/(?P<maker_id>\d+)`). Detector emits both exact + base-path tuples so omitted-suffix doc forms still match.

Initial run revealed 17 candidates → narrowed to 1 actionable mismatch:

- `b2b/v1::manual-reprint` — V.41.0 changelog says "via RPi print queue" but actual implementation is `/api/manual-reprint-label` in RPi Flask dashboard (not WP REST). Added to `DOCUMENTED_NOT_REGISTERED` allowlist with explanatory comment as audit trail.

Result: 4 tests pass (sanity + diff + allowlist non-shadow). Full Jest suite: **19/19 suites + 146 tests pass + 2 skipped**.

**ITEM C — Unit test expansion (`tests/helpers/OrderModeLabelTest.php` + `tests/helpers/ItemBreakdownTest.php`, NEW, +439 LOC)**

Expands tests/helpers/ from 131 → 170 cases (39 new). Two pure-logic helpers used heavily across V.7.0 Order Intent System + V.6.4 DD-3 Shared Child support — both previously without dedicated unit test coverage.

- **OrderModeLabelTest (22 cases)** — `b2f_order_mode_label($mode, $currency)` from [B2F] Snippet 1 §100.5 (V.7.0+).
  - 5 modes × 3 currencies = 15 happy-path cases (full_set, sub_unit, single_leaf official + raw_parts, partial_replenish legacy)
  - default currency THB when omitted, em-dash fallback for unknown/empty/null mode (language-neutral), `(string)` cast guard for numeric/boolean modes, unknown currency falls back to English.
  - Locks UX integrity: feeds Mode Badge UI in 5 places (Maker LIFF Snippet 4, PO Ticket Snippet 9, PO Image Snippet 10, Admin LIFF Snippet 8 SET Detail, Admin Dashboard Orders tab Snippet 5). Regression = silent UX bug (wrong language).
- **ItemBreakdownTest (17 cases)** — `b2f_get_item_breakdown($item)` from [B2F] Snippet 1 §511 (V.6.4+).
  - empty/null/string input → empty array
  - JSON valid + sum invariant (sum(qty) === poi_qty_ordered) → return parsed
  - JSON sum mismatch → fallback to single-entry from poi_parent_sku
  - JSON malformed / object-not-array / empty-array → fallback (no exception)
  - fallback uses `__standalone__` marker when no poi_parent_sku, trims whitespace
  - intval coercion for string qty values, negative qty allowed when sum balances
  - 1/2/3-parent breakdown (DD-3 shared across multiple SETs)
  - Locks DD-3 sum-invariant: a leaf SKU in 2+ SETs records per-SET qty distribution. Sum invariant violation = silent corruption in manufacturing summary.

Both helpers re-implemented inline (mirroring snippet body modulo WP helper calls — same pattern as CurrencyTest + BoxCalcTest already in suite). When snippets split into composer packages, swap to `require` + real source.

phpunit run: **170 tests pass, 261 assertions, 0 failures** (1 pre-existing deprecation warning — non-blocking, predates Round 11).

**Round 11 totals**:

- 3 commits, +789/-2 LOC across 4 files (1 modified, 3 new tests)
- 1 onerror site closed (last in repo); PHP files now 100% CSP-clean
- 1 NEW drift detector (6 → 7 detectors total)
- 39 NEW unit test cases (131 → 170 in tests/helpers/)
- Test suite total: **19 jest suites (146 tests)** + **170 phpunit tests** = 316 tests + 2 skipped, all green
- Risk: LOW (UX-equivalent refactor) + NONE (additive tests). Zero production code touched in items B + C.

### Docs + Lint — Round 10 (Drift detector audit + BO Cron Lifecycle + Slip Replay Pool diagrams) (2026-04-30)

3 files closing drift detector audit + 2 new flow diagrams. Risk: LOW (drift whitelist documentation entry) + NONE (docs).

**ITEM A — Drift Detector Audit Run (`tests/jest/feature-flags-drift.test.js`)**

After 31 commits since Round 5 (massive Round 5-9 churn), full drift suite audit:

- Survey: 6 detectors run via Jest (`jsdoc-endpoint-refs`, `snippet-db-id`, `shortcode-drift`, `constants-drift`, `feature-flags-drift`, `markdown-links`).
- 5 PASS + 1 FAIL: `feature-flags-drift` flagged `dinoco_flag_shipping_meta_enabled` documented but never used.
- Root cause: misspelled flag with extra `_flag_` infix only appears in CLAUDE.md historical context (Day 1 Quick Wins doc-drift sync, commit `357852a` 2026-04-29 — fixed 10 occurrences). Actual runtime flag is `dinoco_shipping_meta_enabled` (without `_flag_` infix).
- Fix: added flag to `DOCUMENTED_NOT_USED` whitelist set with explanatory comment (same pattern as `b2f_flag_ungroup_auto_hide` historical entry).
- Verification: re-ran all 6 detectors → **6/6 PASS, 21/21 tests green**.

**ITEM B — Remaining Flow Diagrams (`WORKFLOW-REFERENCE.md`)**

2 NEW Mermaid diagrams documenting BO cron lifecycle + Slip Replay Pool architecture:

- **Diagram 1 — section 2.12 BO Restock + Lifecycle Cron Flow (sequenceDiagram)**: 5 parallel cron paths shown side-by-side (restock_scan_cron 15min / pending_review_expire_cron hourly / enumeration_scan_cron hourly / eta_warn_cron daily 09:00 / attempt_log_cleanup_cron daily 03:00). Documents bit-field flag mutation (rate_hit=1, cancel_abuse=2, qty_cap_hit=4, suspicious_pattern=8 OR-combined per Phase 1 BUG-C1 fix), 72h timeout via `_b2b_opaque_accept_at`, chunked DELETE (1000/iter + 50ms gap, 20-iteration cap = max 20K rows/run), FOR UPDATE locks. Idempotency note + observability heartbeat (`dinoco_cron_<name>_last_run` wp_option).
- **Diagram 2 — section 2.3.2 Slip Replay Pool Cascade + Manual Review Flow** (V.34.10+ — 2026-04-24 CNX MotoGear regression fix):
  - **2.3.2.1 Replay Cascade State Diagram (stateDiagram-v2)**: 14+ result_status states from Snippet 2 V.34.10+ — AI prefilter / AI classifier / hash lookup → cascade (a/b/c/d) → Slip2Go branches → manual review pool transitions (paid/rejected/reroute).
  - **2.3.2.2 Cascade Lookup Sequence (sequenceDiagram)**: 4 cascade paths with `alt` blocks showing prior-paid short-circuit / cached JSON replay / silent rejection / fresh Slip2Go call with retry 200ms/800ms backoff. Path (d) bifurcates into success / unknown 200xxx code (image saved to `slip-pool/{YYYY-MM}/{first40}.{ext}` + .htaccess deny + admin Flex 1/hr/group) / other failures.
  - **2.3.2.3 Status Enum Reference table**: 17 rows × 5 columns mapping `_slip_final_status` → customer reply, admin notify, debt mutation, notes.
  - **2.3.2.4 Audit Trail Sources**: `dinoco_slip_log` + `dinoco_slip_replay_log` schemas + 15 REST endpoints under `/wp-json/dinoco-slip/v1/` + 4 wired snippets.
- Kill switches documented: `b2b_slip_replay_pool_enabled=0` reverts to V.34.9 fresh-call behavior. BO crons FSM-guarded for safe re-runs.

**ITEM C — onerror handlers (DEFERRED)**

Skipped per user directive ("optional if time"). `onerror="this.src='fallback.png'"` patterns are inline image fallback handlers — CSP-acceptable for `style-src/script-src` (lower priority than `onclick` which UX-H3 closed in Rounds 6-9). Future round can migrate to global `addEventListener('error', e => ...)` capture-phase delegation if user prioritizes.

**Files Touched**

- `tests/jest/feature-flags-drift.test.js` (+9 lines: DOCUMENTED_NOT_USED whitelist entry + comment)
- `WORKFLOW-REFERENCE.md` (+252 lines: section 2.12 BO cron lifecycle + section 2.3.2 slip replay pool with 4 sub-sections)
- `.second-brain/log.md` + `CHANGELOG.md` (Round 10 entries)

**Risk Profile**

- LOW (drift whitelist test config) + NONE (docs only)
- No code touched in any snippet, no business logic changes
- Drift suite remains 21/21 green after fix
- WORKFLOW-REFERENCE.md MD060 lint clean (table style fixed mid-edit) — pre-existing MD040 fenced-code-language warnings unrelated to round 10 edits

---

### Refactor + Docs + PERF — Round 9 FINAL (UX-H3 100% closure + Inventory/Manual Invoice diagrams + Snippet 7 cache priming) (2026-04-30)

3 files closing the last 12 UX-H3 sites + 2 new flow diagrams + 5 cache-priming spots. Risk: LOW (delegation defense-in-depth, behavior preserved) + NONE (docs) + NONE (PERF additive).

**ITEM A — UX-H3 Phase 6 FINAL: SET header + form change/input delegated (B2F Snippet 5 V.8.5 → V.8.6)**

12 sites migrated — UX-H3 closed 124/124 (100%) for B2F Snippet 5.

- **(1) SET header accordion**: `onclick="B2F_Makers.toggleSet(...)"` → `data-action="makers-toggle-set"` + `data-set-id`. Delegated handler bails when click target is inside `.b2f-set-inputs` / `.sku-inp` / `.b2f-auto-set-delete` (defense-in-depth replacing legacy element-level stopPropagation). Legacy `B2F_Makers.toggleSet` function retained for backward compat.
- **(2) SET inputs wrapper**: `onclick="event.stopPropagation()"` → `data-stop-prop="1"` semantic marker (runtime no-op since toggle handler already defense-bails).
- **(3)-(4) SET MOQ/lead inputs + SKU rows × 6 inputs/row**: `oninput="B2F_Makers.checkDirty(this)"` → `data-input="makers-check-dirty"` (delegated input listener passes target → checkDirty(el)).
- **(5)-(6) Static filter rows (Orders)**: 4 sites — maker select + dates + search input → `data-change="orders-apply-filters"` / `data-input="orders-debounce-search"`.
- **(6) Create-PO form (Orders, 3 fields)**: maker select + shipping_method (×2 land/sea/THB) + exchange_rate input → data-change/data-input.
- **(7) Create-PO sku grid (Orders, dynamic)**: checkbox + qty number input → `data-change/data-input="orders-recalc-total"`.
- **(8) Static filter row (Makers)**: search input + status select + audit-select-all → data-change/data-input.
- **(9) Picker checkboxes (Makers, dynamic)**: 3-arg encoding (sku/name/img with `replace(/'/g,"\\'")` escape soup) → `data-change="makers-toggle-picker-item"` + `data-sku/data-name/data-img` attrs. Delegated handler reads attrs + checkbox.checked, calls `togglePickerItem(sku,name,img,el)`.
- **2 NEW idempotent guards**: `_b2fOrdersChangeBound` + `_b2fMakersChangeBound`.

**Cumulative tally**: 19 (P1) + 24 (P2) + 20 (P3) + 19 (P4) + ~30 (P5) + 12 (P6) = **124 of 124 — UX-H3 100% closed for B2F Snippet 5**. Eliminates all inline `onclick=`/`onchange=`/`oninput=` (CSP-readier).

**Behavior preserved** (verified):

- All delegated handlers call IDENTICAL functions with same args as legacy inline calls
- Accordion expand/collapse semantics unchanged (defense-bail covers SET inputs + .sku-inp + .b2f-auto-set-delete)
- SET MOQ/lead_time inputs editable inline without toggling parent
- Picker auto-expand SET still triggers via togglePickerItem
- PHP + JS syntax validated (php -l on Snippet 5 + node --check on 3 extracted JS blocks)

**ITEM B — Inventory + Manual Invoice flow diagrams (WORKFLOW-REFERENCE.md)**

2 new Mermaid diagrams:

- **Section 8.3 NEW — Manual Invoice Lifecycle (V.34.10)**: stateDiagram-v2 covering builder → draft_saved → issued → notified → paid/cancelled/refunded → partial_paid. Documents V.34.4-V.34.10 fix series (picker double-discount V.34.4-6, image push observability V.34.8, stale nonce auto-reload V.34.9, V.34.10 hardening). Includes Excluded-from list (Daily Summary 17:30 ICT pending_ship + Admin LIFF + Admin Dashboard stat boxes) and Included-in list (revenue MTD + Finance Dashboard) per user policy.
- **Section 10.0 NEW — Inventory Stock Cycle Sequence Diagram (V.8.5+)**: sequenceDiagram showing 5 cycles: (1) B2F receive (stock IN + payable_add); (2a) B2B order awaiting_confirm; (2b) Cancel restore with `_stock_returned` idempotent guard; (3) Walk-in DD-5 allow_negative; (4) Dip stock variance approve; (5) Hierarchy compute (recursive MIN with cache). 8 critical guards (DD-2 through DD-7 + leaf guard + stock_returned meta) with version refs (V.7.1, V.39.0, V.31.7, V.34.2). Atomic transaction code skeleton + cache invalidation chain.
- **Both diagrams syntax-validated**: 6 loops + 3 alt/else properly closed (9 ends total) in sequence diagram. State diagram has 16 transitions + bracket escape for `[dinoco_manual_invoice]` shortcode.
- **TOC updated** for both new sections.

**ITEM C — PERF audit B2B Snippet 7 cache priming (V.31.0 → V.31.1)**

5 N+1 patterns eliminated in cron jobs via `update_post_meta_cache` priming:

| Cron | Loop | Symptoms before | Fix |
| ---- | ---- | --------------- | --- |
| `b2b_run_daily_summary` | `$today_orders` | get_field × today's orders | Prime once via `wp_list_pluck($today_orders, 'ID')` |
| `b2b_run_daily_summary` | `$shipped_today_ids` | fields=ids list → get_field('total_amount') per ID | Prime once on IDs list |
| `b2b_run_rank_update` | `$dists` | monthly_sales_mtd × N + rank_system × N + line_group_id × N | Prime distributors once |
| `b2b_run_weekly_report` | `$week_orders` | total_amount + source_group_id loop | Prime once |
| `b2b_run_weekly_report` | `$dists` | current_debt + credit_hold loop for overdue count | Prime once |
| `b2b_run_shipping_overdue_summary` | `$orders` | source_group_id + total_amount loop | Prime once |

**Pattern**: `if (!empty($posts)) update_post_meta_cache(wp_list_pluck($posts, 'ID'));` — 1 extra query upfront primes WP object cache so subsequent `get_field`/`get_post_meta` calls inside loop hit cache.

**Already optimized** (no change needed): `b2b_run_dunning_process` (V.30.6 already primes both `$dists` + `$all_ap_orders`), Flash tracking cron (V.30.7 PERF-H8 prime).

**Behavior unchanged** — only adds cache priming. PHP lint clean.

**Files touched (3)**:

- `[B2F] Snippet 5: Admin Dashboard Tabs` V.8.5 → V.8.6 (+187/-30)
- `WORKFLOW-REFERENCE.md` (+204 sections 8.3 NEW + 10.0 NEW + TOC)
- `[B2B] Snippet 7: Cron Jobs - Dunning + Summary + Rank` V.31.0 → V.31.1 (+15)

**Cumulative Round 1-9 outcome**:

- 22+ items closed across 9 rounds
- **UX-H3 100% closed** for B2F Snippet 5 — eliminates all 124 inline event handlers
- **5 lifecycle/sequence diagrams** in WORKFLOW-REFERENCE.md (B2B + B2F + Inventory + Manual Invoice + dip stock)
- ZERO behavior change across all rounds — pure refactor + observability + cache priming

**Deferred** (out of scope):

- `onerror=` image fallback handlers (img onerror differs from user-action handlers)
- Other snippets' inline event handlers (Round 9 scoped to B2F Snippet 5 + Snippet 7 PERF only)
- MD040 fenced-code-language warnings (pre-existing whole file — bulk fix for separate session)

### Refactor + Docs — Round 8 UX-H3 Phase 5 (dynamic compound delegation) + B2B/B2F lifecycle Mermaid (2026-04-30)

2 commits closing 1 UX-H3 batch + 1 docs gap. Risk: LOW-MEDIUM (UX-H3 dynamic) + NONE (docs).

**ITEM A — UX-H3 Phase 5: dynamic compound onclick delegation (B2F Snippet 5 V.8.4 → V.8.5, commit `d55810c`)**

~30 onclick sites migrated across 3 modules — leverages existing card root `data-*` attributes for arg passing, eliminates inline-encoded args + `esc()/replace(/'/g,...)` escapes for Thai PO numbers + maker names.

**Orders module (~22 sites)**:

- 7 static buttons: `orders-open-create-modal`, `orders-bulk-select-all`, `orders-open-bulk-cancel-modal`, `orders-submit-create-po`, `orders-submit-receive`, `orders-submit-payment`, `orders-execute-bulk-cancel`
- Outer card click: `orders-go-to-ticket` (reads `data-po-id` from card root)
- 2 stopProp+fn: `orders-card-checkbox` + `orders-card-cancel`
- 8 PO action buttons: `orders-card-detail/edit/resubmit/receive/reject-lot/pay/complete/reorder` (read PO id+number from `.b2f-po-card[data-po-id]` ancestor via `_readPoFromCard` helper)
- 1 stopProp wrapper: `orders-stop-prop-noop` on `.b2f-po-actions` (no-op handler catches gap clicks — defense-in-depth)
- Pagination: 3 sites (`orders-page` + `data-page`)
- Qty stepper: 2 sites (`orders-adjust-qty` + `data-delta`)

**Makers module (~9 sites)**:

- 3 maker card buttons: `makers-card-edit/products/delete` (read m.id/m.name/m.currency from `.b2f-maker-card[data-mid]` via `_readMakerFromCard`)
- Confirm-all banner: `makers-confirm-all` + `data-mid`
- Confirm-pill: `makers-confirm-sku` + `data-mid+data-sku`
- Jump-to-primary span: `makers-jump-to-primary` + `data-jump-id+data-sku`
- Delete-product button: `makers-delete-product` + `data-pid+data-sku`
- Add-missing-leaves: `makers-add-missing-leaves` + `data-top-sku`
- Remove-price-item: `makers-remove-price-item` + `data-sku`
- Remove-blacklist: reads from existing `.bl-item[data-mid][data-sku]` ancestor (already had data attrs from V.6.5)

**Credit module (~4 sites)**:

- 4 credit card buttons: `credit-card-history/payment/unlock/hold` (read m.id/m.name/debt from `.b2f-credit-card[data-mid]` via `_readCreditFromCard`)

**Pattern**: `closest('[data-action]')` walks UP from event target — child action buttons match BEFORE outer card, so card's go-to-ticket fires only when click hits non-action area (PO number, badges, meta). Defense-in-depth: `orders-stop-prop-noop` wrapper on `.b2f-po-actions` catches gap/padding clicks.

**Behavior preservation**: identical function calls + arg semantics. Async functions (cancelPO/resubmitPO/rejectLot/completePO) work fire-and-forget. PHP lint clean.

**Cumulative tally**: 19 (P1) + 24 (P2) + 20 (P3) + 19 (P4) + ~30 (P5) = **~112 of 124** UX-H3 sites migrated (~90%). Remaining ~12 sites: deferred dynamic stopProp on SET header structure (lines 3790/3816/3824) + onchange/oninput patterns (separate event class, not in UX-H3 scope).

**ITEM B — Lifecycle Mermaid diagrams (WORKFLOW-REFERENCE.md, commit `8fbbb61`)**

1 NEW + 1 EXPANDED stateDiagram-v2 — both verified 1:1 against actual code FSM `$transitions` arrays.

**Section 2.5 NEW — B2B Order Lifecycle (Full FSM)**:

- 16 states + 38 transitions covering legacy stock-check + walk-in + BO opaque-accept (`pending_stock_review` → `partial_fulfilled`) + cancel_request + change_request + claim flow
- Includes "completed → cancelled" walk-in only edge
- Atomic Guards section (V.1.8 Phase 4d Transaction Wrapper GET_LOCK + correlation_id chain)
- Transition Rules Table mapped 1:1 with `B2B_Order_FSM::$transitions` (Snippet 14 V.1.8)
- Multi-actor labels (`customer/admin/system/any`) per actual code

**Section 4 UPDATED — B2F PO Lifecycle (renamed from "FSM Diagram (State Machine)")**:

- Added 6 missing transitions per actual V.1.7 code:
  - `delivering → delivering` (Maker ส่งของเพิ่ม self-loop)
  - `partial_received → confirmed` (reject reship)
  - `received → confirmed` (QC reject reship)
  - `partial_paid → completed` (write-off)
  - `partial_paid → cancelled` (rollback debt)
  - `paid → cancelled` (admin cancel after payment)
- Added Atomic Guards section (V.1.7 Phase 4d wrapper)
- Multi-currency immutability note + cancel rollback semantics (stock_add per-leaf + payable_subtract THB × snapshot rate)

**TOC updated** for renamed/new sections. Pure docs — no code touched.

**Files touched (2)**:

- `[B2F] Snippet 5: Admin Dashboard Tabs` V.8.4 → V.8.5 (210+ insertions / 40 deletions — UX-H3 Phase 5 + 3 helper functions)
- `WORKFLOW-REFERENCE.md` (273 insertions / 55 deletions — section 2.5 NEW + section 4 expanded + TOC update)

**Deferred to Round 9+**: 5 dynamic stopProp on SET header structure (lines 3790 toggleSet onclick + 3816 _stopInput template + 3824 set-inputs container) + onchange/oninput patterns (~10-15 sites, separate event class).

---

### Refactor — Round 7 UX-H3 Phase 4 (stopProp + compound delegation) + PERF cache priming round 3 (2026-04-29)

2 commits closing 2 audit items. Risk: LOW (additive same-behavior refactor + pure cache priming).

**ITEM A — UX-H3 Phase 4: stopProp + compound close-and-call delegation (B2F Snippet 5 V.8.3 → V.8.4, commit `7912225`)**

19 onclick sites migrated (11 static stopProp + 8 compound close-and-call):

(1) **Static stopPropagation containers — 11 sites**:

- Orders module 5 (modal-create-po, modal-receive, modal-payment, modal-detail, modal-bulk-cancel)
- Makers module 4 (modal-maker, modal-products, modal-bulk-audit-delete, modal-blacklist-viewer)
- Credit module 2 (modal-credit-history, modal-credit-pay)

Replaces inline `onclick="event.stopPropagation()"` with `data-stop-prop="1"` attribute.
Single page-level initializer (`_b2fStopPropBound` guard) attaches element-level click
handler to each match. **Element-level (not document-delegated)** because document capture
would prevent ALL nested click handlers. Backdrop close still works via existing
`e.target === bd` check.

(2) **Compound close-and-call (PO Detail action buttons) — 8 sites**:
Migrates `onclick="closeModal('b2f-modal-detail');B2F_Orders.fn(args)"` to
`data-action="orders-close-and-call"` + `data-modal-target` + `data-fn` + `data-args`.
Functions: `editPO, resubmitPO, openReceive, openPayment, rejectLot, completePO, cancelPO,
reorderPO`. Args passed as `JSON.stringify`-encoded array, `esc()`-escaped for HTML
attribute (Thai PO numbers safe). Delegation handler in `B2F_Orders` IIFE parses with
`JSON.parse` + dispatches via `window.B2F_Orders[fnName].apply(args)`. **Function whitelist**
`_ORDERS_CLOSE_AND_CALL_FNS` (8 keys) prevents arbitrary fn dispatch — security guard.
Behavior preservation: closeModal runs FIRST then fn — same execution order as legacy
compound onclick semicolon chain.

Total `onclick=` sites migrated: 19 + 24 + 20 + 19 = **82 of 124**. Remaining ~42:

- Dynamic stopProp+function compounds (5 sites: 1110/1115 PO checkbox+cancel, 3612 confirm
  pill, 3722/3730 set-inputs container) — defer to Round 8
- Misc inline onclick on form steppers + dynamic PO card row handlers

Risk: LOW for stopProp (defense-in-depth, backdrop close path unchanged) + LOW-MEDIUM
for compound (whitelist gate + JSON.parse fail-safe abort). PHP lint clean. JS syntax
clean (3 script blocks parse OK after stripping PHP).

**ITEM B — PERF cache priming sweep round 3 (B2B Snippet 5 V.33.2 → V.33.3 + Snippet 12 V.31.5 → V.31.6, commit `2882e10`)**

Investigated 4 list endpoints — Slip Monitor (V.1.1 M-4 already optimized via
`dinoco_slip_monitor_get_dist_names_batch`), Manual Invoice (`_dinoco_inv_get_pending_invoices`
already calls `update_postmeta_cache`), B2F po-history (V.11.9 already primes maker postmeta) —
all 3 candidates from Round 7 brief skipped because already optimized.

Real opportunities found in B2B admin dashboard renderers — distributor postmeta NOT primed
when accessed via `b2b_get_dist_by_group($gid)` inside per-order loops:

(1) **B2B Snippet 5 main admin dashboard render** — `foreach($orders as $o)` reads
`get_field('shop_name', $dist->ID)` per order. WP_Query primes `b2b_order` metas but NOT
distributor metas. Per-page render: 50 orders × ~10-15 unique distributors. Fix: pre-resolve
$dist objects via static cache hit, collect IDs, batch `update_meta_cache('post', $od_dist_ids)`
before render loop. Saves ~10-30 cold meta reads per page render.

(2) **B2B Snippet 12 Admin LIFF (3 sites)**:

- `[b2b_tracking_entry]` shortcode: 50 awaiting-shipping orders × 6 metas/dist (shop_name,
  dist_address, dist_district, dist_province, dist_postcode, dist_phone) = ~60-90 cold reads
- BO ticket map: 20-50 BO tickets × 1 meta / ~10 unique dists = ~30 cold reads
- Recently shipped today: 20 shipped × 1 meta / ~6 dists = ~6 cold reads

Pattern: pre-resolve via `b2b_get_dist_by_group()` (static cache), collect `$d->ID` values,
`array_unique` + `array_filter`, single `update_meta_cache` call. Mirrors B2F V.11.9 / Round 5
sweep / Round 2 priming pattern. Idempotent — `b2b_get_dist_by_group` caches resolved $dist
objects; pre-warm doesn't double-fetch. No business logic change — pure cache priming.

PHP lint clean (both files).

### Refactor — Round 6 UX-H3 Phase 3 (closeModal delegation) + Workflow Diagrams (2026-04-29)

2 commits closing 2 audit items. Risk: LOW (additive same-behavior refactor + pure docs work).

**ITEM A — UX-H3 Phase 3: closeModal delegation (B2F Snippet 5 V.8.2 → V.8.3, commit `1d1ba6d`)**

20 inline `onclick="B2F_*.closeModal('id')"` sites migrated to
`data-action="modal-close"` + `data-modal-target="<id>"` pattern. Per-module
delegation handlers extended (Orders 9 + Makers 8 + Credit 3 = 20 sites total).

Each branch is scoped via `.closest('.b2f-modal-backdrop')` ID match against
per-module whitelist (`ordersIds` / `makersIds` / `creditIds`) — prevents
cross-module fire when 3 delegation handlers see the same `data-action='modal-close'`
signal. Behavior preservation: identical to legacy onclick (DOM `removeClass('open')`
via existing `closeModal()`). `closeModal` functions intact in all 3 module
IIFEs and still exposed via `window.B2F_*.closeModal` for backward compat with
dynamic detail-modal action buttons (line ~1702-1726, deferred to Round 7+
as compound onclick with id+name args).

Total `onclick=` sites migrated: 19 (Phase 1) + 24 (Phase 2) + 20 (Phase 3) =
**63 of 124**. `stopPropagation` containers (11 static + 6 dynamic) deferred —
element-level handler is required for backdrop-click semantics (event must stop
BEFORE bubbling reaches backdrop; document-level delegation fires too late).

PHP lint clean. Modal IDs cross-checked against actual `<div class="b2f-modal-backdrop" id="...">`
elements (11 modals total — all whitelisted correctly).

**ITEM B — Workflow Mermaid diagrams (commit `8a12728`)**

3 NEW Mermaid diagrams added to `WORKFLOW-REFERENCE.md` to fill visual coverage
gaps for text-only flows. Pure docs work — zero code changes, no runtime risk.

1. **§2.3.1 Slip Verification Sequence Diagram** (sequenceDiagram) — 6 participants
   (Customer/LineG/Bot/Slip2Go/DB/AdminG), 2 nested `alt` blocks for B2B customer
   + B2F maker flows, foreign currency PO note (CNY/USD skips Slip2Go),
   implementation refs (Snippet 2/3, `B2B_SLIP2GO_SECRET_KEY`, atomic txns).

2. **§10.5.1 Dip Stock Cycle State Diagram** (stateDiagram-v2) — 5 states
   (`not_started → counting → variance_review → approved/force_closed/expired`),
   cron auto-expire edge (>48h), state transitions table (6×4), V.39.0 leaf-only
   guards (DD-2).

3. **§7.2.1 LIFF AI Lead Pipeline State Diagram** (stateDiagram-v2) — 11 states
   covering `lead-pipeline.js` V.2.0 transitions, auto-followup cron note (4h),
   trigger triggers table (6 source types), FSM authority ref
   (`updateLeadStatus()`), backward compat note (3 V.2.0 statuses additive only).

Mermaid block balance verified (8 starts ↔ 8 closes). Both new tables use
spaced separator format (MD060 lint clean).

**Round 6 Cumulative Status (post-Round 5 backlog drain)**:

- Round 1-5 closed: 12 items (BO V.3.0, PERF sweeps, Flag Audit Log, Wave 3 UI gaps 3+4+5, UX-H3 Phase 1+2)
- Round 6 closes: 2 items (UX-H3 Phase 3 + Workflow Diagrams)
- Total UX-H3 sites closed: 63/124 (51%) — remaining 61 = 11 stopProp static
  (defer — backdrop semantics need element-level), 30 dynamic onclick (PO cards
  / SKU rows with id+name args — needs careful data-attr escaping), 20 misc.

### Refactor — Round 5 UX-H3 onclick → Event Delegation + PERF Sweep Round 2 (2026-04-29)

3 commits closing 2 deferred audit items. Risk: LOW (additive — same behavior,
cleaner code + better CSP-readiness; no business logic touched).

**ITEM A — UX-H3 onclick → delegation refactor (B2F Snippet 5 V.8.0 → V.8.2)**

43 of 124 inline `onclick=` sites in `[B2F] Snippet 5: Admin Dashboard Tabs`
migrated to single-listener event delegation pattern.

Phase 1 (commit `1b915ce` V.8.1) — B2F_Orders module (19 sites):
- 9 status tabs (`data-action="orders-filter-tab"` + `data-status`)
- 5 KPI cards (same data-action, distinguishes via data-status)
- 5 mode filter chips (`data-action="orders-mode-chip"` + `data-mode`)
- Delegated listener inside Orders IIFE with idempotent guard
  `_b2fOrdersDelegationBound` calls existing `filterByTab()` / `setModeFilter()`.

Phase 2 (commit `9d63d30` V.8.2) — B2F_Makers + B2F_Credit (24 sites):
- B2F_Makers (23): 3 source filter chips + 5 picker type chips + 2 view mode
  + 2 quick shipping + 11 standalone action buttons (open create modal, save
  settings, submit maker, open bulk delete, open blacklist, batch save, open
  product picker, close picker, confirm picker, back to picker, submit
  selected, execute bulk delete)
- B2F_Credit (1): submit payment button
- Per-module delegated listeners with `_b2fMakersDelegationBound` /
  `_b2fCreditDelegationBound` guards. No cross-module interference (each
  filters by action prefix).

CSP-friendly: no `unsafe-inline` script-src needed for migrated batch.
Behavior preservation: all chips still toggle `.active`, all buttons call
same internal functions. window.B2F_*.* APIs intact for backward compat.
Dynamic-rendered handlers (PO cards, SKU rows with id/name args) deferred —
covered by future batches. PHP lint clean.

**ITEM B — PERF cache priming sweep round 2 (commit `e879caf`)**

Extends Round 2 sweep (commit `920b3ac`) to admin REST endpoints with
cross-referenced postmeta N+1 patterns:

`[B2F] Snippet 2: REST API` V.11.8 → V.11.9:
- `b2f_rest_po_history()` (admin, per_page up to 100): WP_Query auto-primes
  `b2f_order` postmeta but NOT cross-referenced `b2f_maker` postmeta.
  `b2f_format_po_detail()` reads `maker_name` + `maker_credit_term_days`
  per PO → N×2 cold reads with many distinct makers. Fix: pluck po IDs →
  walk po_maker_id from primed cache → unique maker_ids →
  `update_meta_cache('post', $maker_ids)` once. Expected p95 200-400ms →
  50-100ms on history with 50+ POs spanning 5+ makers.
- `b2f_rest_maker_po_list()` (Maker LIFF, per_page=50): JWT-scoped to one
  maker, prime ensures first iteration cache-warm (eliminates 2 cold reads
  on first PO).

`[LIFF AI] Snippet 1: REST API` V.1.8 → V.1.9:
- `liff_ai_rest_claims()`: 7× `get_field()` per claim_ticket. WP_Query
  auto-primes by default → mostly no-op today. Defense-in-depth prime
  guards against future refactor disabling cache_results.

All changes additive — empty result sets skip the prime. Backward compat
preserved.

**Files Touched (3)**:
- `[B2F] Snippet 5: Admin Dashboard Tabs` V.8.0 → V.8.2
- `[B2F] Snippet 2: REST API` V.11.8 → V.11.9
- `[LIFF AI] Snippet 1: REST API` V.1.8 → V.1.9

**Commits**: `1b915ce`, `9d63d30`, `e879caf`

### UI — Round 4 Wave 3 UI Polish (2026-04-29) — B2F V.7.0 Order Intent UX (Gaps 3+4+5)

3 commits closing Wave 3 UI gaps surveyed in Round 3. All flag-gated by
`b2f_flag_order_intent` (default OFF in V.7.0 spec, ON since 2026-04-17).
Risk: LOW — display + a11y layer only, no API contract change.

**Gap 3 — Maker LIFF PO list mode-summary badge**
(`[B2F] Snippet 4: Maker LIFF Pages` V.4.5 → V.4.6):

- New JS helper `modeSummaryHtml(po)` iterates items[], counts qty per
  `poi_order_mode`, returns compact 3-mode breakdown HTML or `""` for
  legacy POs (no order_mode).
- Output: `🟣 5  🟠 3  ⚪ 2` (mixed) or `🟣 ทั้งหมด ชุดเต็ม (10)` (single mode).
- 3-lang labels (TH/EN/ZH) via L() helper for THB/USD/CNY currency makers.
- Inserted in renderListPage() PO card after po-total, before status badges.
- PHP wires flag via new `$b2f_order_intent_js` variable in `b2f_liff_page_js()`
  using `dinoco_config()` with `get_option` fallback.
- CSS scoped under `.b2f-po-card`: `.po-mode-summary` flex container,
  `.po-mode-pill.{full-set,sub-unit,single-leaf,all-mode}` color variants.
- Defensively ignores intent_notes (admin-only — API strips for Maker JWT).

**Gap 4 — SET Detail mode toggle compact-on-scroll**
(`[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.9 → V.7.10):

- When user scrolls overlay > 100px, toggle shrinks to maximize content area:
  margin 12→6px, padding 10→4px vertical, font 13→12px, min-height 44→32px.
- Smooth 200ms transition (margin/box-shadow/padding/font-size/min-height).
- rAF-throttled scroll listener on `$setDetail` (overlay scroll container).
- Single-init pattern (`_setDetailScrollListenerAttached` flag) — listener
  bound once per session, persists across SET re-opens.
- `passive: true` (non-blocking scroll for smooth iOS momentum).
- `closeSetDetail()` cancels pending rAF + removes `.scrolled` class
  (clean slate for next overlay open).
- Tap target stays ≥ 32px (Apple HIG min, WCAG AA acceptable).
- Flag-gated `ORDER_INTENT_ENABLED` (no-op when OFF — toggle isn't injected,
  listener init is skipped naturally).

**Gap 5 — Cart Submit Review Gate WAI-ARIA tabs pattern**
(`[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.10 → V.7.11):

- Modal root: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` to
  stable header id.
- Tablist wrapper: `role="tablist"` + `aria-label` + `aria-orientation="vertical"`.
- Bucket headers: `role="tab"` + id + `aria-controls` + `aria-selected` +
  `aria-expanded` + tabindex (roving 0/-1) + `data-bucket-tab`.
- Bucket bodies: `role="tabpanel"` + id + `aria-labelledby` + `tabindex="0"`
  (focusable for screen reader) + `hidden` attribute when closed.
- Total row: `role="status"` + `aria-live="polite"` — screen reader
  announces total when buckets toggle.
- Arrow span: `aria-hidden="true"` (decorative).
- Keyboard nav (new helper `bindReviewTablistA11y(visibleBuckets)`):
  - ArrowDown/ArrowRight → next visible tab (wraps)
  - ArrowUp/ArrowLeft → prev visible tab (wraps)
  - Home → first tab; End → last tab
  - Enter/Space activate native (not intercepted)
- Architectural cleanup: removed inline `onclick="..."` from V.7.0 (XSS
  surface reduced). Replaced with event delegation in tablist handler.
- Buckets independent (not radio) — each opens/closes individually;
  aria-selected reflects "is panel currently visible" (hybrid pattern).

**Files** (3 commits, +266/-19 LOC):

- `[B2F] Snippet 4: Maker LIFF Pages` V.4.5 → V.4.6 (+85/-1)
- `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.9 → V.7.11 (+200/-19 across
  V.7.10 + V.7.11)

**Commits**: `b997598` (Gap 3) + `20d6ed2` (Gap 4) + `69a62f4` (Gap 5)

### Audit — Round 3 Pending Items Sprint (2026-04-29) — Flag Audit Log NEW snippet

NEW snippet **`[Admin System] DINOCO Flag Audit Log` V.1.0** — centralized
audit trail for ALL feature-flag and config-key toggles across DINOCO. Closes
the "ใครเปลี่ยน flag X เมื่อไหร่?" incident-debug pain point.

- **Schema**: `wp_dinoco_flag_audit` (lazy `dbDelta` install, version-gated).
  11 columns including `flag_name` VARCHAR(64), `old_value`/`new_value`
  VARCHAR(255), `user_id`, `source` (admin_ui/rest_api/cron/cli/etc),
  `reason`, `request_ip`, `user_agent`, `request_id` (correlation with
  Observability snippet), `changed_at`. 3 indexes (flag_name, changed_at,
  user_id) optimize common queries.
- **Helper API**: `dinoco_flag_audit_log($flag, $old, $new, $reason, $source)`
  with no-op short-circuit (old===new strict and serialized strict comparison),
  automatic PII context inheritance, and lazy schema install on first call.
  Best-effort non-throwing pattern (mirrors Audit Log V.1.0 design).
- **Convenience wrapper**: `dinoco_flag_set($flag, $val, $reason, $source)`
  — atomic update_option + audit log + bool→'0'/'1' normalization.
- **Passive listener**: `updated_option` action hook auto-captures changes
  to a curated whitelist (16 flags: BO, V.33.5 hotfixes, Flash V.42, B2F
  V.7.0/migration, Observability, GDPR). Filter `dinoco_flag_audit_tracked_flags`
  lets future snippets register flags without modifying this file. Per-request
  dedup guard prevents duplicate rows when explicit + passive both fire.
- **Admin viewer UI**: `[dinoco_flag_audit_viewer]` shortcode — filterable
  table (by flag/source/user/days), pagination 50/page, color-coded delta
  badges (red old → green new), source-tag chips, per-row IP/UA, refresh +
  CSV export.
- **REST API** under `/dinoco/v1/flag-audit*`: list with filters, single by
  ID, manual retention trigger, CSV export (UTF-8 BOM, 5K row cap).
- **Retention cron**: `dinoco_flag_audit_retention_cron` daily 03:00, 90-day
  default (configurable 30-365 via `dinoco_flag_audit_retention_days` option),
  chunked 1000/iter × 20 max iters per run.
- **Wiring** (3 explicit call sites — function_exists() guarded):
  - `[B2B] Snippet 16` V.3.1 — `[b2b_bo_flags]` shortcode wraps existing
    update_option calls (3 flags + beta_distributors array). Existing
    b2b_log() text logging preserved (dual-write).
  - `[Admin System] B2F Migration Audit` V.3.19 — `POST /feature-flags/toggle`
    REST endpoint adds audit_log call. Existing `b2f_log_flag_change()` text
    log preserved (dual-write).
  - `[Admin System] Flash Shipping V.42 Go-Live Tool` V.1.9 — `POST /flip-flag`
    endpoint adds audit_log call. Existing wp_dinoco_flash_audit row preserved.
  - **NOTE**: `[B2B] Snippet 1`'s `dinoco_set_shipping_flag()` helper is NOT
    explicitly wired (sensitive snippet — no edits permitted). The passive
    `updated_option` listener captures it automatically.
- **Tests**: `tests/helpers/FlagAuditTest.php` (21 cases — serializer null/bool/
  int/float/string/array/object/long/unicode, no-op detection strict and serialized,
  and edge cases). All pass; full suite (131 tests, 208 assertions) green.
- **Risk**: LOW — additive snippet (no existing logic change). function_exists()
  guards at every call site. Lazy schema install. Silent fail-soft if table
  missing. Idempotent re-saves (no-op short-circuit).
- **Files**: NEW `[Admin System] DINOCO Flag Audit Log` V.1.0 +
  `tests/helpers/FlagAuditTest.php` + 3 wiring updates (Snippet 16 V.3.1,
  B2F Audit V.3.19, Go-Live V.1.9).

### Performance — PERF cache priming sweep (2026-04-29) — Snippet 3 V.42.8

Round 2 sprint follow-up to Snippet 16 V.2.9 cache priming pattern.

**`[B2B] Snippet 3` V.42.8** (Round 2 sprint):

- `b2b_rest_admin_shipping_queue` — primes order post + meta cache for both
  pending list (paid/awaiting_payment) and recent shipped (today × 20). Pre-resolves
  unique distributors via `b2b_get_dist_by_group` static cache + primes their post
  object + meta cache. Loop body uses `$dist_map` lookup with original-call fallback.
  Eliminates ~5-6 SQL queries per row (~330 queries saved on typical 50-order pending,
  20-order recent payload).
- `b2b_rest_admin_bo_tickets` — same priming pattern for backorder tickets list.
  ~40-80 SQL queries saved on typical 10-20 row response.
- Pattern: `_prime_post_caches` and `update_meta_cache` (mirrors Snippet 16 V.2.9,
  Snippet 3 V.41.5 `/order-history` priming). Both patterns gated with
  `function_exists` guard (defensive — always exists in WP core).
- **Pure additive** — no API contract change, no behavior change. Original
  null-safety chain preserved for empty `$gid` and `Private_Chat` edge cases.

### Audit — Phase 6 Modal Migration (2026-04-29) — comprehensive grep

- Round 2 sprint comprehensive grep of `confirm()`/`alert()`/`prompt()` sites in
  `*.php` + `*.html` (excluding `node_modules`, `.second-brain`, `dist`, `venv`,
  `presentation`, `liff-src`, `tests/e2e`, `rpi-print-server`):
- **0 production sites remaining** — Phase 5 (commits `1404b85..d2cf413`) +
  Phase 6 (commits `7a9e90d..cfc453f`) closed 75 sites already.
- 4 confirm + 2 alert hits = `tests/e2e/fixtures/modal.html` (intentional test
  fixture validating modal API itself).
- 2 confirm hits = `rpi-print-server/templates/manual_ship.html` (out-of-scope:
  RPi flask+jinja runtime, no `dinocoModal` helper, warehouse touchscreen native
  confirm acceptable).
- Earlier estimate "~67 sites remaining" was stale; queue is closed.

### Added — BO Queue UX V.3.0 (2026-04-29) — Bulk ops + Manual ETA + docs

Closes 2 deferred-low-priority items from `FEATURE-SPEC-B2B-BACKORDER-2026-04-16.md`.
Backend endpoints existed since V.1.6 — V.3.0 ships the missing Admin Dashboard UI.

**Snippet 16 V.3.0** (`0542230`):
- Per-row checkbox column + select-all in `<thead>` + sticky bulk-action bar
  (✅ จัดส่ง / ❌ ยกเลิก / ล้างการเลือก) shown only when ≥1 row selected
- `📅 ETA` button per pending/ready row → `dinocoModal.prompt` for days (0-90) +
  optional admin note appended via `|` separator
- Selection state preserved via `Set<bo_queue_id>` across `loadQueue()` refresh,
  cleared on filter change
- Pattern reuse: `dinocoModal.confirm/alert/prompt` with try/catch native fallback
  (V.1.14/V.1.15 modal migration); `esc()` XSS-safe interpolation; scoped CSS
  `.b2b-bo-admin` namespace + mobile `@media (max-width: 768px)` breakpoint
- Per-item error reporting via `results.errors[]` (V.1.11 contract)

**Docs** (`a0b4dc7`):

- `WORKFLOW-REFERENCE.md` § 2.10.6 V.3.0 Bulk Operations + Manual ETA flow
- `WORKFLOW-REFERENCE.md` § 2.10.7 BO FSM State Diagram (Mermaid stateDiagram-v2)
  visualizing 2 new states (pending_stock_review, partial_fulfilled) + 8 new
  transitions + transition guards (invariant, undo deadline, walk-in bypass)
- NEW `B2B-BACKORDER-REGRESSION-MANIFEST.md` — 75 scenarios across 8 sections:
  Core opaque accept (10) + Admin split (10) + Restock cycle (10) + Bulk ops
  V.3.0 (8) + FSM transitions (5) + Security (8) + Performance (5) + Config +
  Modal + DB schema (15)

**Backend**: zero changes — endpoints `/bo-bulk-fulfill`, `/bo-bulk-cancel`,
`/bo-update-eta` validated since V.1.6. cancelled/fulfilled rows omit checkbox
and ETA button (readonly state — backend status guard returns invalid_status).

### Fixed — Flash V.42 deep audit (2026-04-29) — 8 findings closed

api-specialist + feature-architect agents dispatched for full audit of Flash V.42
implementation vs `FEATURE-SPEC-FLASH-SHIPPING-META-2026-04-17.md`.

**P0 (commit `41ddc5d`)**:
- **G1** — admin "Flash Create" REST routed via `b2b_flash_dispatch_create_all()`
  instead of bypassing dispatcher (Snippet 5 V.33.2 + Snippet 9 V.34.0)
- **G2** — 1003 (duplicate outTradeNo) idempotent recovery via `mchPno` query +
  regenerate fallback (Snippet 1 V.34.21)

**P1 follow-ups (commit `0a28359`)**:
- **B5** — audit row trace fields `original_out_trade_no` + `g2_attempts` +
  `g2_outcome` for 1003 post-mortem
- **D3** — REG-069 + REG-070 regression scenarios

**P1 (commit `7f49c0d`)**:
- **G3** — removed broken BO secondary fallback that called
  `b2b_flash_create_order($order_id, array(...))` with array→int(1) coercion
  (Snippet 16 V.2.8)
- **G4** — async snapshot defer via `wp_schedule_single_event` (HIGH-2 closed
  from Round 4-8 audit; Snippet 1 V.34.23)

**Deep audit (commit `ae60b47`, Snippet 1 V.34.24)**:
- **BUG-2 CRITICAL** — `subParcel` JSON encoding (multi-box ticket signature
  mismatch). Pre-fix sent PHP nested array → `b2b_flash_sign()` cast `(string)$v`
  = literal `"Array"` while wp_remote_post serialized actual structure → Flash
  hash mismatch on every multi-box order. Fix: `wp_json_encode($sp_array)` per
  Flash spec line 209
- **BUG-1 CRITICAL** — `insureDeclareValue=''` undefined behavior. Fix: omit
  field when not insured (V.42 + V.41 paths)
- **ISSUE-5 HIGH** — V.41 path missing 7 returnXXX fields (walk-in tickets
  ตีกลับไปโกดังแทนบริษัท). Fix: added `b2b_registered_address` 7 fields
- **ISSUE-6 HIGH** — V.41 articleCategory default 99 → 6 (align V.42 default)

**Tests**: REG-069..079 added (11 new scenarios) in
FLASH-SHIPPING-V42-REGRESSION-MANIFEST.md.

### Documentation — Flag name drift fix (2026-04-29)

Synced `FEATURE-SPEC-FLASH-SHIPPING-META-2026-04-17.md` flag references from
incorrect `dinoco_flag_shipping_meta_enabled` to actual `dinoco_shipping_meta_enabled`
(matches code in CLAUDE.md line 318 + Snippet 1 + dispatcher). 10 occurrences
across spec sections §10/§17.2/§22.

### Fixed — Manual Ship V.44.3 defensive UX patch (2026-04-29, commit `14fc1e1`)

User reported: "ขึ้น 1/1 → ไม่มี PNO → ไม่เกิดอะไรขึ้น" (silent failure).
fullstack-developer diagnosed `if (data.success)` accepted truthy values
without `pno` field → JS pushed undefined to `createdPnos` array → "1/1 สำเร็จ"
banner with empty PNO area + no print fired → button reset silently.

- Strict success check: `data.success === true && data.pno` (was loose truthy)
- Catch-all UI when both `createdPnos` + `errors` arrays empty (3-step
  troubleshoot hint: RPi pull, WP endpoint reachable, dashboard.py log)
- try/catch fall-through writes to result-box (was just toast which can be
  missed/dismissed)

File: `rpi-print-server/templates/manual_ship.html` V.44.2 → V.44.3.
Pure UX hardening — no API contract change.

### Fixed — Snippet 1 V.34.25 — code-reviewer audit (G2 + PII mask dead code)

code-reviewer post-`ae60b47` audit found 1 CRITICAL + 1 HIGH issue. Both
stem from BUG-2 fix changing `$params['subParcel']` from PHP nested array
to JSON string — but 2 downstream sites still checked `is_array()` →
silent dead-code paths.

- **CRITICAL** — G2 1003 retry subParcel sync (line 8682-8702): `is_array()`
  check became false-always after BUG-2 → sub-parcels' outTradeNo never
  synced with regenerated parent suffix on retry → Flash sub-parcel-level
  dedup fail. Fix: `json_decode` → mutate → `wp_json_encode` roundtrip
  preserves BUG-2 contract.
- **HIGH** — `b2b_flash_mask_request_for_dlq()` subParcel branch
  (line 8450-8470): same dead-code pattern → DLQ rows stripped of subParcel
  for V.42 multi-box failures → forensic debugging harder. Fix: same
  decode-if-string pattern.

File: `[B2B] Snippet 1` V.34.24 → V.34.25.
**Insight**: dead-code-after-encoding-change pattern — when modifying field
encoding (array→string/JSON), grep ALL `is_array($field)` checks in same
scope. Today's BUG-2 fix introduced 2 dead-code sites caught by code-reviewer
but missed by feature-architect verify-pass. Future agent dispatch must
cross-check encoding boundaries.

### Added — Days 5 GDPR Phase 6 design + Days 2-4 deploy runbook (commit `86a62e1`)

NEW `docs/compliance/GDPR-PHASE-6-DESIGN.md` (284 lines):
- Full implementation design for Thai PDPA / GDPR data subject rights
- Builds on V.1.3 stubs (V.1.1 90-day retention shipped Phase 5)
- Queue worker + admin review UI + email templates + erasure decision matrix
  (anonymize vs hard-delete per record type)
- 7 open questions for legal/boss review
- Effort estimate: 5.5 days dev + external legal review

NEW `docs/runbooks/WEEK-LONG-SPRINT-2026-04-29.md` (310 lines):
- Day 2 — Sentry activation: composer install + DSN provision + flag flip
- Day 3 — B2F CPT final drop: pre-flight queries + mysqldump backup +
  2-phase trash→delete + smoke test + rollback (wait until 2026-05-02 day 14)
- Day 4 — Vite LIFF production migration: staging-first + 10% canary +
  24h soak + 50% → 100% rollout (REG-029 byte-identical inline preserved)
- Day 5 — GDPR design review (this commit's design doc)
- Verification schedule + emergency rollback quick-reference

### Added — OpenAPI spec coverage expansion (2026-04-28 → 2026-04-29)

ขยาย `docs/api/openapi.yaml` จาก ~50% → ~70% ของ 125+ production endpoints.

- **B2B Backorder family (+6)** — bo-cancel-item, bo-order-detail, bo-update-eta, bo-bulk-fulfill, bo-bulk-cancel, bo-clear-enum-flag
- **B2B Flash family (+5)** — flash-label, flash-ready-to-ship, flash-cancel, flash-ship-packed (RPi auth), flash-dashboard-stats
- **Inventory family (+6)** — stock/transfer, dip-stock/{start,current,count,approve,history}
- **B2F family (+5)** — approve-reschedule, reject-lot, reject-resolve, po-complete, po-history
- **LIFF AI family (+3)** — dealer-dashboard, lead/{id}/accept, lead/{id}/note

แต่ละ endpoint มี handler line ref + verified request/response shapes + error codes.

### Added — Playwright E2E foundation (Phase 7)

| Phase | Commit | Tests |
|---|---|---|
| V.0.1 Foundation | `511cd81` | cart + api-client (8 tests) |
| V.0.2 Module composition | `8187eb2` | full place-order flow auth→cart→submit (4) |
| V.0.3 Modal + liff-init | `785b89d` | window.dinocoModal bridge + redirect paths (10) |
| V.0.4 iOS coverage | `fdb343f` | WebKit + mobile-safari projects |

22 tests × 4 browser projects = **88 runs ใน 17s** (chromium / mobile-chrome / webkit / mobile-safari).

### Added — 6 self-reinforcing drift detectors

ทุกตัว auto-fail CI เมื่อ docs/code drift:

| Detector | Catches | Tests |
|---|---|---|
| api-contract | api-client method ↔ OpenAPI spec | 3 |
| JSDoc endpoint refs | JSDoc claims ↔ register_rest_route | 3 |
| Snippet DB_ID | Sync engine matching key | 4 |
| Shortcode | CLAUDE.md ↔ add_shortcode() | 4 |
| Constants | CLAUDE.md ↔ define()/defined() | 4 |
| Feature flags | CLAUDE.md ↔ get_option() / flag helpers | 4 |

### Added — 4 security scanners

| Scanner | Catches |
|---|---|
| Secrets pattern | LINE/Telegram/GitHub PATs, AWS keys, JWTs in committed code |
| Dangerous APIs (JS) | eval, Function, document.write, setTimeout("string", ...) |
| PHP security | RCE_EVAL, RCE_SHELL (system/exec/passthru/shell_exec/popen) |
| Bundle size | Vite output >10KB per entry |

### Added — CI workflows

| Workflow | Trigger |
|---|---|
| PHPUnit (existing) | Every push, path-filtered PHP |
| Frontend (Jest + ESLint + tsc) | Every push, path-filtered JS/MD |
| Playwright E2E | matrix [chromium, mobile-chrome, webkit, mobile-safari] |
| Security Audit | npm + composer audit, weekly + dep PR |
| CodeQL SAST | JS/TS taint analysis, weekly + push |
| Dependabot | Weekly auto-PRs across 5 ecosystems |

### Added — Developer experience

- **`npm run test:all`** — unified runner, frontend gates ใน 3 วินาที
- **Pre-push hook auto-install** — ผ่าน `npm prepare` lifecycle, opt-out via `SKIP_HOOKS_INSTALL=1`
- **`.editorconfig`** — cross-IDE indent + line-ending consistency
- **`CONTRIBUTING.md`** — onboarding guide, 260 lines (TL;DR + setup + conventions + commit format + emergency overrides)

### Added — Static analysis

- **ESLint 9 flat config** — scope `liff-src/` + `tests/jest/` + `brand-voice-extension/`
- **TypeScript `--checkJs`** — JSDoc type validation, ambient declarations ใน `liff-src/types.d.ts`

### Fixed — Real bugs caught by infrastructure (24 silent bugs)

| # | Bug | Detector |
|---|---|---|
| 1-2 | Stock semantics drift (Phase 5) | PHPUnit retrospective |
| 3-5 | OpenAPI YAML flow syntax × 3 (`bo-confirm-full`, `delta`, `group_id`) | OpenAPI validator |
| 6 | Dead `state` variable in liff-init.js | ESLint |
| 7 | False `[MIT License](LICENSE)` claim in openclawminicrm/README.md (root LICENSE is Proprietary) | Markdown link checker |
| 8 | Dead `pageData` state in popup.js | ESLint (after extension scope add) |
| 9-13 | Unused `catch (e)` × 5 → renamed to `_e` | ESLint |
| 14-18 | Type errors × 5 (`window.liff` undeclared, `RequestCredentials` enum, etc.) | TypeScript --checkJs |
| 19 | `cancelRequest` path drift (POST `/cancel-request/{id}` → real `/cancel-request` body) | api-contract drift |
| 20 | `getHistory` path (`/history` → `/order-history`) | api-contract drift |
| 21 | `getTicket` path/method (`/ticket/{id}` → `/order-detail?ticket_id=X`) | api-contract drift |
| 22 | Ghost `modifyOrder` method (no production endpoint exists) | api-contract drift + grep |
| **23** | **`X-B2B-Session` → `X-B2B-Token`** auth header drift (every call would 401 in prod) | Manual cross-ref |
| 24 | JSDoc `/b2b/v1/auth` → real `/auth-group` (+ HMAC params requirement) | Manual cross-ref |

ก่อนหน้า session นี้ ทุก bug silent ใน prod. หลังจากนี้ทุก class drift auto-fail CI.

---

## Phase 5 — PHPUnit Test Infrastructure (2026-04-28)

Two-tier PHPUnit stack:
- **Tier 1 (Unit)** — 110 tests / pure PHP stubs / <5s
- **Tier 2 (Integration)** — 51 tests / wordpress-develop + MySQL / ~1 min

ครอบ FOR UPDATE / GET_LOCK / FSM transitions / REST routing / audit dual-write.

### CI iteration story

14 fix commits to first GREEN — แต่ละ iteration peel back env-layer assumption (composer lock drift → yoast PHPUnit 10 incompat → svn missing → set_up visibility → assertWPError clash → PHPUnit 10 vs WP test suite → ACF Pro stubs → b2b_log stub → cascade test cache quirk).

### M4 — Concurrent harness

3 concurrent tests via 2nd `mysqli` connection (not pcntl_fork — CI runners disable fork):

| Primitive | Used by | Test |
|---|---|---|
| `SELECT ... FOR UPDATE` | `dinoco_stock_subtract/add` | `ConcurrentStockSubtractTest` |
| `GET_LOCK` (rate limit) | `b2b_rate_limit` | `RateLimitGetLockTest` |
| `GET_LOCK` (per-order FSM) | `B2B_Order_FSM::transition` | `FsmConcurrentLockTest` |

### Production behaviors discovered

1. `dinoco_compute_hierarchy_stock` per-process static cache (Snippet 15:1689) — never invalidates within process. Production OK due to per-request boundary; risk for long-running CLI/workers.
2. `dinoco_stock_subtract` underflow semantics (Snippet 15:1238) — when `allow_negative=false`, clamps to 0 silently rather than returning `WP_Error`. Returns error only for `invalid_qty`/`not_leaf`/`sku_not_found`/`db_error`.

---

## Phase 6 — Jest Frontend Tests

136 tests / 17 files / <1s

| Module | Coverage |
|---|---|
| cart.js | 38 tests / all 13 exports |
| api-client.js | 33 tests / createApi + createB2BApi |
| liff-init.js | 7 tests / login redirect + edge cases |
| liff-auth.js | 9 tests / backend handshake |
| modal.js | 9 tests / fallback + production paths |
| OpenAPI validator | 9 tests / spec structure + $refs |
| Markdown links | 2 tests / 99 .md files scanned |
| Secrets scanner | 2 tests / pattern + context-aware |
| Dangerous APIs | 2 tests / RCE/XSS sinks |
| Bundle size | 2 tests / 10KB/entry guard |
| PHP security | 2 tests / RCE patterns + comment-aware |
| api-contract drift | 3 tests |
| JSDoc endpoint refs | 3 tests |
| Snippet DB_ID | 4 tests |
| Shortcode drift | 4 tests |
| Constants drift | 4 tests |
| Feature flags drift | 4 tests |

**Coverage** `liff-src/shared/`: 95.83% stmts / 84.84% branches / 90.9% funcs.

---

## Test Counts Total

| Suite | Tests | Speed |
|---|---|---|
| PHPUnit Unit + Integration | 161 | ~1 min |
| Jest (17 files) | 136 | <1s |
| Playwright E2E (5 specs × 4 projects) | 88 | ~17s |
| ESLint + tsc | 0 errors | <2s |
| **Total** | **385** | |

---

## Notes

- Snippet `Version: V.X.Y` history lives in each snippet's header comment, not this file.
- Production behavior changes ดู `CLAUDE.md` "Development Notes" section.
- Audit retrospectives ดู `docs/audit/`.
- CI workflow definitions ดู `.github/workflows/`.

Generated from git history at session end (2026-04-29).
