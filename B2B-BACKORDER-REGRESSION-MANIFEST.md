# B2B Backorder System — Regression Test Manifest

> **Status**: Documentation only — DINOCO doesn't have PHPUnit yet. These scenarios are tracked for manual QA + future automated suite.
> **Related plan**: `FEATURE-SPEC-B2B-BACKORDER-2026-04-16.md` § Regression
> **Snippet under test**: `[B2B] Snippet 16: Backorder System` V.3.0 + Snippet 1 V.33.7 + Snippet 2 V.34.4 + Snippet 3 V.41.4 + Snippet 14 V.1.6

## Conventions

- **Severity**: CRITICAL = ship blocker, HIGH = data correctness, MEDIUM = UX/perf, LOW = polish
- **Pre-condition** unless otherwise stated: `b2b_flag_bo_system=1` ON (production state since 2026-04-17), beta whitelist empty (applies globally), one non-walk-in distributor logged into LIFF
- **Verify** column lists assertions to make manually (or in future automated runs)

## Core Opaque Accept Flow (REG-BO-001..010)

| ID | Sev | Scenario | Verify |
|---|---|---|---|
| REG-BO-001 | CRITICAL | Customer place-order → confirm_order → enters `pending_stock_review` not `awaiting_confirm` | `get_field('order_status', $oid) === 'pending_stock_review'` AND `_b2b_opaque_accept_at` set |
| REG-BO-002 | CRITICAL | Stock snapshot meta `_b2b_stock_snapshot` written at opaque accept; admin-only via `register_post_meta(show_in_rest=false, auth_callback=manage_options)` | Non-admin REST `GET /wp-json/wp/v2/b2b_order/<id>` does NOT expose `_b2b_stock_snapshot` |
| REG-BO-003 | CRITICAL | Customer reply is opaque text "✅ รับคำสั่งซื้อ รอ admin 2-4 ชม." — never reveals stock numbers | LINE webhook capture — text matches regex `^✅ รับคำสั่งซื้อ` |
| REG-BO-004 | HIGH | Walk-in distributor (`is_walkin=1`) bypasses opaque accept → direct to `awaiting_confirm` | Walk-in confirm_order skips Snippet 16 BO gate (b2b_bo_flag_enabled returns true but walk-in branch wins) |
| REG-BO-005 | HIGH | `b2b_flag_bo_system=0` (flag OFF) → legacy OOS check path → `checking_stock` (Snippet 1 V.33.7 hierarchy-aware) | Order goes through `b2b_check_order_oos()` not opaque accept |
| REG-BO-006 | HIGH | Admin Flex bucket indicator shows "✓ พอ" / "⚠️ ไม่พอ" / "⚠️ หมด" — NEVER exact qty (insider threat C1) | LINE Flex JSON inspected — no integer qty in admin group bucket bubble |
| REG-BO-007 | MEDIUM | Customer cannot enumerate stock via repeated cancel-place — `b2b_rate_limit()` GET_LOCK serializes (V.33.7) + 5min grace then 2/hr 10/day | After 11 cancels in <60min → 11th returns `rate_limited` 429 |
| REG-BO-008 | MEDIUM | Place-order rate limits enforced atomically — 11th place in 60 min returns 429 even with 2 concurrent workers | `b2b_rate_limit('place_order', $dist, 10, HOUR_IN_SECONDS)` MySQL `GET_LOCK` 2s timeout |
| REG-BO-009 | MEDIUM | Unique-SKU/day cap = 20 per distributor (Vector D defense H2) | 21st unique SKU in 24h returns 400 with `unique_sku_cap` rejection_code |
| REG-BO-010 | MEDIUM | Suspicious qty flagger 100/500/1000/2000 → Telegram `enumeration_attempt` alert | Cron `b2b_bo_enumeration_scan_cron` writes `_b2b_enumeration_flags` bit + Telegram fires |

## Admin Split Flow (REG-BO-011..020)

| ID | Sev | Scenario | Verify |
|---|---|---|---|
| REG-BO-011 | CRITICAL | bo-split with invariant violation (qty_fulfill + qty_bo ≠ order_qty) → reject with 400 | `splits=[{sku:A, qty_fulfill:5, qty_bo:6}]` for order_qty=10 → `invariant_violation` |
| REG-BO-012 | CRITICAL | bo-split atomic — mid-loop dinoco_stock_subtract fail → compensation closure restores prior splits + rolls back debt + deletes bo_queue rows | Force fail SKU#2 → SKU#1 `dinoco_stock_transactions` shows insert + reverse insert; bo_queue row count unchanged |
| REG-BO-013 | CRITICAL | bo-split uses `b2b_financial_lock(dist_id, 5)` GET_LOCK — concurrent split same order = 2nd waits/fails | 2 admins click Split simultaneously → 2nd gets `lock_timeout` 503 or success after wait |
| REG-BO-014 | HIGH | Per-SKU compound debt = `Σ(price × qty_fulfill)` (M3 FIX) NOT ratio approximation | Order has SKU A (qty=10 @ ฿100) + SKU B (qty=5 @ ฿200), split A=8/2, B=5/0 → debt = 8×100 + 5×200 = ฿1800 (NOT 13×avg) |
| REG-BO-015 | HIGH | bo-split sets `_b2b_split_undo_deadline = now() + 10min` + `_b2b_undo_count = 0` | Postmeta inspect — both fields present after Split confirm |
| REG-BO-016 | HIGH | bo-undo-split rejected after 10 min OR if `_b2b_undo_count >= 1` (H5) | Wait 11min → undo returns `undo_window_expired` OR after 1st undo→split→undo → 2nd undo returns `undo_limit_reached` |
| REG-BO-017 | HIGH | bo-undo-split reverses debt + restores stock + deletes bo_queue rows + transitions back to `pending_stock_review` | All 4 mutations rolled back atomically (compensation closure) |
| REG-BO-018 | HIGH | bo-confirm-full transitions to `awaiting_confirm` + full stock subtract + full debt add (no bo_queue rows) | `wp_dinoco_bo_queue` has 0 rows for this order_id |
| REG-BO-019 | HIGH | bo-reject transitions to `cancelled` + reverts daily counters + customer Flex notify | Counter `b2b_bo_daily_qty_<date>` decremented |
| REG-BO-020 | MEDIUM | Customer combined Flex post-split shows ✅ จัดส่งทันที N + ⏳ รอสต็อก M + ETA + footer [ยืนยันบิล] [ดูออเดอร์] (M6 FIX) | Flex JSON inspected — both sections present + 2-button footer |

## Restock + Fulfill Cycle (REG-BO-021..030)

| ID | Sev | Scenario | Verify |
|---|---|---|---|
| REG-BO-021 | HIGH | Cron `b2b_bo_restock_scan_cron` (15min) — pending row with `available >= qty_bo` → status='ready' + Telegram | Single SQL UPDATE; `bo_restock_ready` Telegram fired once |
| REG-BO-022 | HIGH | Restock scan considers reserved stock — `available = compute_hierarchy_stock(sku) - dinoco_get_reserved_qty(sku)` | Pending order reserving SKU keeps BO in pending until reservation released |
| REG-BO-023 | HIGH | bo-fulfill takes FOR UPDATE lock on bo_queue row (H4 race fix) — concurrent fulfill = 2nd serializes | 2 admin clicks simultaneously → 1 success, 1 returns `already_fulfilled` |
| REG-BO-024 | CRITICAL | bo-fulfill `b2b_bo_items_fulfilled` action fires Flash secondary order via `b2b_flash_create_secondary` (Snippet 1 V.34.0+) | `_flash_tracking_numbers_bo` postmeta has new tracking; Flash dashboard shows secondary order linked |
| REG-BO-025 | CRITICAL | If `b2b_flash_create_secondary` missing AND legacy fallback unsafe → V.2.8 sets `_flash_bo_pending` meta for admin manual intervention (NOT silent wrong PNO numbering) | Manual test: temporarily undefine helper → fulfill → meta set + admin Flex visible + no Flash order created |
| REG-BO-026 | HIGH | bo-fulfill on last unresolved BO row → FSM partial_fulfilled → awaiting_confirm | `b2b_bo_check_all_resolved` returns true → FSM transition |
| REG-BO-027 | HIGH | Customer BO ready Flex (M7 FIX) shows footer [ยืนยันบิล BO] [ดูออเดอร์] for billing continuation | Flex JSON inspected |
| REG-BO-028 | MEDIUM | bo-fulfill enqueues print job via `b2b_enqueue_print_job($order_id, source: 'bo_fulfill')` OR fallback meta `_print_queued_bo` | RPi dashboard shows secondary label print queued |
| REG-BO-029 | MEDIUM | Cron `b2b_bo_eta_warn_cron` (daily 09:00) → bo_queue ETA < +3d → admin Telegram reminder | Test row with ETA=tomorrow → cron triggers `bo_eta_warn` Telegram with row count |
| REG-BO-030 | MEDIUM | Cron `b2b_bo_pending_review_expire_cron` (hourly) — orders age > 72h → auto-cancel + revert counters | Test order with `_b2b_opaque_accept_at` = -73h → cron transitions to cancelled |

## Bulk Operations + Manual ETA (V.3.0 — REG-BO-031..038)

| ID | Sev | Scenario | Verify |
|---|---|---|---|
| REG-BO-031 | HIGH | Bulk fulfill 5 BO rows across 3 different orders → each order grouped + per-order FOR UPDATE lock + atomic | `results.success=5, failed=0` + 3 separate audit_log rows for `bo_fulfill` |
| REG-BO-032 | HIGH | Bulk cancel 5 rows with empty reason → `invalid_input` 400 (reason required) | Server-side guard — `sanitize_text_field('') === '' → defaults to 'bulk_cancel'` (V.1.6 default) but UI enforces non-empty via `required: true` prompt |
| REG-BO-033 | HIGH | Bulk fulfill mixed states (3 pending + 1 fulfilled + 1 cancelled in selection) → backend returns failed=2 with errors[] explaining `invalid_status` per item | `results.errors` array has 2 entries with bo_queue_id + reason |
| REG-BO-034 | MEDIUM | UI: cancelled/fulfilled rows have NO checkbox (selectable=false in render) — admin cannot select them | DOM inspect — `.bo-check-row` count = pending + ready rows only |
| REG-BO-035 | MEDIUM | UI: select-all in `<thead>` toggles only visible (filtered) rows — selection state preserved across loadQueue() refresh if rows still visible | Set<bo_queue_id> retains entries; stale removed when filter excludes them |
| REG-BO-036 | MEDIUM | UI: filter change (status/age/sku) calls `_boClearSelection()` first then loadQueue() — prevents accidental bulk-act on stale selection | Trace: change filter → checkbox count drops to 0 → bulk-bar hides |
| REG-BO-037 | HIGH | Manual ETA button — `eta_days=0` clears ETA (server sets `eta=null`) | DB inspect: `wp_dinoco_bo_queue.eta IS NULL` after submit |
| REG-BO-038 | MEDIUM | Manual ETA notes appended to existing notes via " \| " separator (preserves history) | `notes='legacy note \| 2026-04-29 reason'` after second update |

## FSM + State Transitions (REG-BO-041..050)

| ID | Sev | Scenario | Verify |
|---|---|---|---|
| REG-BO-041 | CRITICAL | FSM rejects invalid transitions — `pending_stock_review → paid` direct = `b2b_transition_order` returns WP_Error | Snippet 14 V.1.6 — only whitelisted transitions in `$transitions` map |
| REG-BO-042 | HIGH | `partial_fulfilled → awaiting_confirm` only when all bo_queue resolved — guard via `b2b_bo_check_all_resolved` | Order with 1 pending + 1 fulfilled BO → fulfill the pending → transitions; fulfill only 1 of 2 → stays partial_fulfilled |
| REG-BO-043 | HIGH | Cancel during partial_fulfilled — admin manual escalation only — customer cancel-request rejected | Snippet 3 cancel-request returns `invalid_state` for partial_fulfilled (admin-only path) |
| REG-BO-044 | HIGH | Walk-in path bypasses BO regardless of flag — `draft → awaiting_confirm` direct | Walk-in test even with flag ON |
| REG-BO-045 | MEDIUM | Legacy `checking_stock` state still works — backward compat for orders created before V.1.6 deploy OR for flag OFF distributors | Existing order in checking_stock can still transition to awaiting_confirm |

## Security + Enumeration Defense (REG-BO-051..058)

| ID | Sev | Scenario | Verify |
|---|---|---|---|
| REG-BO-051 | CRITICAL | Stock snapshot leak — non-admin REST request CANNOT read `_b2b_stock_snapshot` | `register_post_meta` show_in_rest=false + auth_callback enforced |
| REG-BO-052 | CRITICAL | All BO REST POST endpoints require `X-WP-Nonce` (CSRF defense H1) — missing nonce → 403 | curl without nonce → `rest_cookie_invalid_nonce` |
| REG-BO-053 | HIGH | Artificial jitter 50-150ms on place-order (timing side-channel H3) — variance masks server-side stock check timing | Measure 100 place-orders — 95th percentile - 5th percentile ≥ 80ms |
| REG-BO-054 | HIGH | Cancel grace period — first 5 min after place = unlimited cancels — after grace = 2/hr + 10/day (H4) | Test sequence: cancel within 5min OK; 3rd cancel at 6min = rate_limited |
| REG-BO-055 | HIGH | Audit log XSS — Security Log viewer escapes user input (IP, UA, distributor name) — UA truncated 50 chars | Inject `<script>` in UA → renders as escaped text |
| REG-BO-056 | HIGH | Enumeration cron OR-combines flags bit field — `cancel_abuse=2` + `qty_cap_hit=4` → flag value = 6 (NOT overwrite to 4) | Trigger both within 24h → `_b2b_enumeration_flags = 6` |
| REG-BO-057 | MEDIUM | bo-clear-enum-flag clears bit field for distributor — admin review path | Flag = 6 before, cleared = 0 after |
| REG-BO-058 | MEDIUM | attempt_log cleanup cron (daily 03:00) — chunked 1000/iter + 50ms gap + 20 max iter — no transaction lock | 90 days of logs → cleanup runs in <30s without blocking other queries |

## Performance (REG-BO-P01..P05)

| ID | Scenario | Verify |
|---|---|---|
| REG-BO-P01 | `/bo-pending-review` with 200 orders uses `_prime_post_caches` + `update_meta_cache` once (V.2.9 PERF) | Total DB queries ≤ V.1.6 baseline (NOT 4×N pattern) |
| REG-BO-P02 | `/bo-queue` with 100 rows pre-caches order + distributor posts (V.1.9 PERF-H10) | Total queries reduced ≥ 50% vs unprimed |
| REG-BO-P03 | `/bo-summary` cached 30s via transient (V.1.9 PERF-H4) — repeated calls hit cache | 2nd call within 30s returns `cached=true` |
| REG-BO-P04 | `b2b_bo_atomic_incr_option` (V.2.1) — 100 concurrent place-orders = 100 counter increments (no race undercount) | Daily counter = exact qty submitted, no drift |
| REG-BO-P05 | bo-fulfill → Flash + print queue + customer notify dispatched in single PHP request (no cascade timeouts) | Total endpoint response ≤ 2s for typical 1-PNO order |

## Configuration + Flag Manager (REG-BO-061..065)

| ID | Sev | Scenario | Verify |
|---|---|---|---|
| REG-BO-061 | HIGH | `b2b_flag_bo_system=0` → instant rollback to Phase 0 (Snippet 1 V.33.7 hierarchy-aware OOS gate) | Set option → next place-order goes through legacy path; no re-deploy |
| REG-BO-062 | HIGH | Beta distributor whitelist `b2b_flag_bo_beta_distributors=[id1,id2]` → only those 2 get BO flow; others = legacy | dist_id NOT in whitelist + flag ON → still legacy path |
| REG-BO-063 | MEDIUM | `b2b_bo_get_config` reads from `dinoco_config()` if available, raw `get_option` fallback (V.2.6) | Disable Config Layer snippet → BO config still works |
| REG-BO-064 | MEDIUM | All 16 BO config keys reachable via Config Viewer UI (admin self-service tuning) | Browse Admin → ระบบ B2B → BO Flags → Config Viewer table |
| REG-BO-065 | LOW | Admin Dashboard sidebar "ระบบ B2B" lazy-loads BO tabs via `dnc_lazy_load_module` AJAX | Switch tab → AJAX request `module=backorders` |

## Modal Helpers Integration (REG-BO-071..075)

| ID | Sev | Scenario | Verify |
|---|---|---|---|
| REG-BO-071 | HIGH | All destructive admin actions use `dinocoModal.confirm/alert/prompt` — try/catch native fallback (V.1.14/V.1.15) | Disable Modal Helpers snippet → still works via native confirm/alert/prompt |
| REG-BO-072 | MEDIUM | Modal supports ESC + backdrop-click + focus-trap (V.1.10 UX-H7/H8) | Tab inside open modal stays trapped; ESC closes |
| REG-BO-073 | MEDIUM | Bulk fulfill prompt shows total qty + warns "ไม่สามารถ undo ได้" + danger=true (red CTA) | Visual inspect — confirm button class includes danger styling |
| REG-BO-074 | MEDIUM | Bulk cancel prompt requires reason (≥1 char) — empty submit blocked client + server | UI: required=true; Server: `sanitize_text_field` + length check |
| REG-BO-075 | LOW | ETA prompt validates 0-90 days range — 91+ rejected with toast | Submit days=100 → modal alert "จำนวนวันต้องอยู่ระหว่าง 0-90" |

## Database + Schema (REG-BO-DB-01..05)

| ID | Sev | Scenario | Verify |
|---|---|---|---|
| REG-BO-DB-01 | CRITICAL | dbDelta pattern correct — 2nd schema run idempotent (no duplicate column/index) | Re-run install → 0 ALTER statements executed |
| REG-BO-DB-02 | CRITICAL | `wp_dinoco_bo_queue` has UNIQUE (order_id, item_index) — prevents double bo_queue insert on retry | INSERT same (order_id, item_index) twice → 2nd fails ER_DUP_ENTRY |
| REG-BO-DB-03 | HIGH | `wp_dinoco_order_attempt_log` chunked cleanup (90d, 1000/iter) — no LONG transaction | LOCK/transaction state inspected during cron |
| REG-BO-DB-04 | HIGH | `sku` column utf8mb4_bin — case-sensitive UPPER pattern match | INSERT 'dncgnd...' fails uniqueness vs 'DNCGND...' (different case) |
| REG-BO-DB-05 | MEDIUM | `idx_status_resolved` composite index hits hot path queries | EXPLAIN on `WHERE status='pending' AND resolved_at IS NULL` shows `idx_status_resolved` used |

## Notes

- **Coverage gap**: BO flow involves 14 REST endpoints + 6 cron jobs + 5 FSM states + 3 atomic locks. Manual QA only covers happy path; concurrent + edge cases require dedicated automation effort.
- **Future automation**: When PHPUnit lands (Phase 7 deferred), prioritize REG-BO-001..030 (Core flow) + REG-BO-DB-01..05 (Schema) + REG-BO-051..058 (Security).
- **Test data setup**: Need fixture scripts to seed `wp_dinoco_bo_queue` + `wp_dinoco_order_attempt_log` + create 5 test distributors with varied tier/walk-in flags + create 10 test orders across all FSM states.
- **Production verification post-deploy**: Run `bo-summary` endpoint immediately after V.3.0 deploy → assert no schema/cache regression. Spot-check Backorders tab UI on mobile (768px) — bulk bar stacks vertically.

## Cross-references

- `WORKFLOW-REFERENCE.md` § 2.10 BO flow + § 2.11 Cron Schedule + § 2.10.7 FSM Diagram
- `FEATURE-SPEC-B2B-BACKORDER-2026-04-16.md` — Phase A-D design
- `CLAUDE.md` Development Notes § "B2B Backorder System V.1.6"
- `[B2B] Snippet 16: Backorder System` V.3.0 (current)
- `[B2B] Snippet 14` V.1.6 (FSM 2 new states)
- `[B2B] Snippet 1` V.33.7 (rate limit atomic + hierarchy-aware OOS)
