# DINOCO Regression Test Manifest — Master Index

> **Purpose**: Discoverability layer for the regression test scenarios scattered across multiple manifest files.
> **Status**: V.1.0 — 2026-04-29 (Round 16 doc consolidation).
> **Cap**: This index does NOT duplicate scenario content — each manifest remains the source of truth for its system. Update each file in place; this index gets a refresh only when a new manifest is added.

---

## TL;DR

DINOCO's regression scenarios are tracked across **3 manifests** covering 3 different surface areas:

| System | File | Scenarios | ID Prefix | Status |
|---|---|---|---|---|
| **B2B Backorder** | [`B2B-BACKORDER-REGRESSION-MANIFEST.md`](./B2B-BACKORDER-REGRESSION-MANIFEST.md) | 71 | `REG-BO-*` | Manual QA — automated suite future |
| **Flash Shipping V.42** | [`FLASH-SHIPPING-V42-REGRESSION-MANIFEST.md`](./FLASH-SHIPPING-V42-REGRESSION-MANIFEST.md) | 69 | `REG-*` (no prefix) + `REG-P*` + `REG-B*` + `REG-F-M*` | Manual QA |
| **OpenClaw Chatbot** | [`openclawminicrm/docs/regression-guard.md`](./openclawminicrm/docs/regression-guard.md) | 25 | `REG-001..025` | Automated via `node scripts/regression.js` (V.1.5+) |

**Total**: 165 scenarios across 3 systems. Only chatbot is currently automated; backend systems track for manual QA + future PHPUnit suite.

---

## When to Use Each Manifest

### Editing B2B order/BO logic

→ `B2B-BACKORDER-REGRESSION-MANIFEST.md`

Snippets in scope: Snippet 1 V.33.7+, Snippet 2 V.34.4+, Snippet 3 V.41.4+, Snippet 14 V.1.6+, Snippet 16 V.3.0+. Covers opaque accept flow, admin split, restock cycle, bulk operations, FSM transitions, enumeration defense, modal helpers integration, schema invariants.

### Editing Flash Shipping V.42 metadata or RPi label rendering

→ `FLASH-SHIPPING-V42-REGRESSION-MANIFEST.md`

Snippets in scope: Snippet 1 V.34.0+, Snippet 3 V.42.0+, Snippet 15 V.8.0+, Admin Inventory V.44.0+, RPi `dashboard.py` V.43.0+ + `manual_ship.html` V.44.0. Covers walk-in bypass, flag-OFF parity, bulk CSV, vehicle threshold, pack_mode resolvers (single_box / multi_box / bulk_pack / assembled_set / unknown), DD-3 memo, Round 4-8 post-ship hardening (DLQ, idempotency, audit retry).

### Editing OpenClaw chatbot prompt, tools, or claim flow

→ `openclawminicrm/docs/regression-guard.md`

Files in scope: `proxy/ai-chat.js` V.8.1+, `proxy/dinoco-tools.js` (11 tools), `proxy/claim-flow.js` V.3.0+, `proxy/lead-pipeline.js` V.2.0+, `proxy/shared.js` (prompt). Covers product knowledge rules (H2C ban / materials / Side Rack), false hallucination prevention, claim intent detection (strict 2-level), PII masking. **This one is automated** — pre-push hook + GitHub Actions + `deploy.sh` step 0 gate.

---

## Section Map per Manifest

### B2B Backorder System (`B2B-BACKORDER-REGRESSION-MANIFEST.md`)

| Range | Section | Coverage |
|---|---|---|
| REG-BO-001..010 | Core Opaque Accept Flow | place-order → confirm_order → pending_stock_review path, walk-in bypass, flag OFF parity, admin Flex bucket indicator, rate limits, unique-SKU/day cap, suspicious qty flagger |
| REG-BO-011..020 | Admin Split Flow | invariant validation, atomic compensation, financial GET_LOCK, per-SKU compound debt (M3 FIX), undo deadline + count, bo-confirm-full / bo-reject paths, customer combined Flex |
| REG-BO-021..030 | Restock + Fulfill Cycle | restock cron, reserved-aware availability, FOR UPDATE in bo-fulfill, Flash secondary order, print queue secondary label, customer BO-ready Flex |
| REG-BO-031..038 | Bulk Operations + Manual ETA (V.3.0) | bulk-fulfill / bulk-cancel endpoints, ETA update, restock-scan manual trigger |
| REG-BO-041..050 | FSM + State Transitions | 8 new transitions, legacy `checking_stock` backward compat, FSM violation rejection |
| REG-BO-051..058 | Security + Enumeration Defense | timing jitter (50-150ms), CSRF nonce gate, audit log XSS hardening, PII masking, admin-only meta gates |
| REG-BO-P01..P05 | Performance | static memo, batch helpers, polling pause |
| REG-BO-061..065 | Configuration + Flag Manager | beta whitelist, config keys, admin Flag Manager UI |
| REG-BO-071..075 | Modal Helpers Integration | confirm/alert dialogs in admin destructive actions |
| REG-BO-DB-01..05 | Database + Schema | dbDelta idempotency, indexes, cleanup cron |

### Flash Shipping V.42 (`FLASH-SHIPPING-V42-REGRESSION-MANIFEST.md`)

| Range | Section | Coverage |
|---|---|---|
| REG-028..056 | Core Regression | Walk-in bypass, flag-OFF byte-identical, bulk CSV idempotency, SET aggregate math, CSV injection, vehicle threshold (weight/dim), pack_mode resolvers (5 modes), HappyTech assembled_set, missing data fallback, auto-rollback |
| REG-P01..P06 | Performance | Query count ceiling, bulk single-flush, box template propagation, DD-3 memo hit, scanner cache, flush_memo same-request |
| REG-B1..B5 | Blocker | Plain dims fallback, flag name convention, MySQL 8.0.16+ CHECK probe, dbDelta + CHECK split idempotency |
| REG-F-M1..M3 | Feature-Architect | Architecture-level invariants per spec |
| REG-057..068 | Additional | Edge cases discovered during V.42 development |
| Round 4-8 | Post-Ship Hardening (2026-04-21) | DLQ retry GET_LOCK, cron heartbeat, observation TTL, dispatcher race, BO meta search extension, F2 verify cron strict |

### OpenClaw Chatbot (`openclawminicrm/docs/regression-guard.md`)

| Range | Theme | Examples |
|---|---|---|
| REG-001..010 | Product Knowledge | H2C ban, material rules (กันล้ม=สแตนเลส, กล่อง=อลูมิเนียม), DINOCO Edition silver-only, Side Rack ≠ มือจับ |
| REG-011..017 | Anti-Hallucination | False alert prevention, intent pre-check, supervisor context-aware, PII masking |
| REG-018..025 | Lead + Claim Flow | Claim intent strict 2-level, "ตลอดชีพ" ban, "ยินดีให้บริการ" ban, dealer coordination append, lead auto-create from name+phone |

---

## Cross-System Patterns

These patterns repeat across multiple manifests — when adding a new feature, check ALL manifests for related coverage:

### Walk-in distributor bypass

- B2B BO: `REG-BO-004` (BO gate skipped when `is_walkin=1`)
- Flash V.42: `REG-028` (resolver entirely skipped, V.41 weight used)
- Implication: Walk-in flag is checked at multiple layers — modifying walk-in detection requires touching at least these 2 surfaces.

### Feature flag rollback

- B2B BO: `b2b_flag_bo_system` ON since 2026-04-17 (production)
- Flash V.42: `dinoco_shipping_meta_enabled` ON since 2026-04-20 (production)
- Both have **byte-identical flag-OFF parity** test (REG-BO-005, REG-029, REG-055) — instant revert without redeploy.

### DD-3 shared leaf in multiple parents

- B2B BO: stock subtract preserves separate accounting per SET origin
- Flash V.42: `REG-P04` static memo by `(leaves, parent)` key — same leaf in 2 SETs hits memo
- B2F (no manifest yet): composite merge key `sku|order_mode|source_sku` in V.7.0 Order Intent

### Atomic compensation on multi-step writes

- B2B BO: `REG-BO-012` (mid-loop fail → restore prior splits + rollback debt + delete bo_queue)
- Flash V.42: DLQ insertion on `retry_exhausted` / `retry_abandoned` (Round 4-8)
- Pattern: every multi-step backend operation needs a compensation closure — captured in audit reports + tested per system.

---

## Adding New Scenarios

1. **Pick the right file** — use the "When to Use Each Manifest" table above.
2. **Pick the next ID** — increment within the appropriate section (e.g., REG-BO-076 for B2B BO modal helpers extension).
3. **Severity** — CRITICAL = ship blocker, HIGH = data correctness, MEDIUM = UX/perf, LOW = polish.
4. **Verify column** — list specific assertions to make manually OR via future PHPUnit (e.g., "`get_field('order_status', $oid) === 'pending_stock_review'`" not "check the order is in BO state").
5. **Cross-link** — if the scenario touches another system (e.g., walk-in flag), reference the other manifest's REG-ID.
6. **Update this index** — only if a new section/manifest is added, not for individual scenarios within an existing section.

---

## Future: Automation Roadmap

Phase ordering (per `tests/README.md`):

1. **Phase 4 (DONE)**: Pure PHP unit tests — `tests/helpers/` covers ~283 tests across 18 helpers (V.7.0 Order Intent guards, Flash V.42 vehicle suggester, currency formatting, FSM validation, hierarchy DD-3, manufacturing summary, etc.)
2. **Phase 5 (M1 done, M2 next)**: Integration tests at `tests/integration/` boots wordpress-develop + real MySQL via `yoast/wp-test-utils`. M2 will pick first 5 from this index (stock atomic, FSM rollback, REST nonce, DD-3 hierarchy, audit dual-write).
3. **Phase 6**: Frontend JS tests (Jest) for LIFF pages.
4. **Phase 7**: End-to-end (Playwright) covering LIFF flows.

When a manifest scenario gets a passing automated test, mark it with `✅ Automated` in the Verify column to avoid double work.

---

## Related Documentation

- [`AUDIT-REPORT-2026-04-17.md`](./AUDIT-REPORT-2026-04-17.md) — Full repo audit (170+ findings, 70+ closed in Phases 1-6).
- [`CHANGELOG.md`](./CHANGELOG.md) — Per-snippet version history with regression IDs cross-referenced.
- [`SYSTEM-REFERENCE.md`](./SYSTEM-REFERENCE.md) — System architecture, snippet mapping, DB schema.
- [`WORKFLOW-REFERENCE.md`](./WORKFLOW-REFERENCE.md) — 18 Mermaid diagrams covering B2C/B2B/B2F flows.
- [`tests/README.md`](./tests/README.md) — PHPUnit setup + scope + Phase 5 integration runbook.
