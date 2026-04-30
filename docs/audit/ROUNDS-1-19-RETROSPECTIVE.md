[← Back to docs/audit/](.)

# Rounds 1-19 Retrospective (2026-04-29)

Cumulative test infrastructure + audit remediation across 19 incremental rounds.
Snapshot taken before Round 20 final consolidation polish.

## Executive Summary

- **Duration**: 1 working session (2026-04-29 to 2026-04-30, ~56 commits)
- **Findings closed**: 39+ (UX-H3, onerror, PERF, API-H4 foundation, Flag Audit, MED-1/2/3, etc.)
- **Tests added**: 0 → 383 PHPUnit + 0 → 146 Jest = **529 tests**
- **Diagrams added**: 0 → 22 Mermaid (WORKFLOW-REFERENCE.md)
- **Drift detectors**: 0 → 7 (api-contract / JSDoc / DB_ID / shortcode / constants / feature-flags / REST endpoints)
- **Doc index files**: 0 → 1 (regression manifest master)
- **Production breaks**: **ZERO** across all 19 rounds

## Round-by-Round Summary

| Round | Focus | Key Output |
|---|---|---|
| 1-2 | UX-H3 onclick → event delegation (Phase 1+2) | Snippet 16 + B2F Snippet 5 V.6.5 modal patterns |
| 3 | Flag Audit Log NEW snippet | `[Admin System] DINOCO Flag Audit Log` V.1.0 + 16-flag whitelist + REST + retention |
| 4 | Wave 3 UI polish (Order Intent gaps 3+4+5) | B2F V.7.0 closure |
| 5 | UX-H3 Phase 3 (closeModal delegation) + PERF | Workflow diagrams + cache priming |
| 6 | UX-H3 Phase 3 + workflow diagrams | More Mermaid |
| 7 | UX-H3 Phase 4 + PERF round 3 | stopProp + compound delegation |
| 8 | UX-H3 Phase 5 + B2B/B2F lifecycle Mermaid | dynamic compound delegation |
| 9 | UX-H3 100% closure + inventory/manual invoice diagrams | Snippet 7 cache priming + final UX-H3 closure |
| 10 | Drift detector audit + BO Cron Lifecycle + Slip Replay Pool diagrams | More drift detection |
| 11 | onerror migration + REST drift detector + unit test expansion | onerror sweep complete |
| 12 | MD040 lint sweep + unit test expansion + coverage badge | 211 PHPUnit / 146 Jest baseline |
| 13 | Cross-rounds code review + unit test expansion + PERF sweep finalize | Independent audit, ZERO regressions |
| 14 | Close 3 MED findings from Round 13 audit | manual_ship V.44.5 dead code + 2 more |
| 15 | Top 3 ROI items: `update_meta_cache` guards + flow diagrams + unit tests | 7 snippets, 11 call sites guarded |
| 16 | More unit tests + flow diagrams + regression manifest index | Walk-in stateDiagram + B2F PO sequenceDiagram |
| 17 | MCP Bridge architecture diagram + Brand Voice flow + more unit tests | +37 tests (intent breakdown + validate hierarchy) |
| 18 | API-H4 Idempotency-Key foundation + more unit tests + cleanup | NEW Idempotency Helper V.1.0 + 25 tests + 18 IsTopLevelSet tests |
| 19 | Idempotency-Key endpoint integration + +20 contract tests | 3 critical POST endpoints wrapped |

## Cumulative Metrics

### Tests

```
PHPUnit:  0 → 211 (Round 12 baseline) → 363 (Round 18) → 383 (Round 19)
Jest:     0 → 146 (Round 12 baseline)
Total:    0 → 529 tests across 21 PHPUnit helper test classes + 19 Jest suites
Runtime:  PHPUnit ~7ms / Jest ~1.2s
```

### Coverage (Jest)

| Metric | Coverage |
|---|---|
| Lines | 98.68% |
| Statements | 96.38% |
| Functions | 93.75% |
| Branches | 85.09% |

PHPUnit coverage requires PCOV/XDebug install — run `pecl install pcov` locally.

### Mermaid Diagrams (WORKFLOW-REFERENCE.md)

22 total covering:
- B2B order confirm sequence
- B2F PO sequence
- Walk-in stateDiagram
- MCP Bridge architecture
- Brand Voice flow
- Member warranty registration
- BO Cron Lifecycle
- Slip Replay Pool
- Inventory cycle
- Manual Invoice flow
- (12+ more)

### Drift Detectors (Jest, 7 detectors)

1. **api-contract** — REST endpoint signatures match docs
2. **JSDoc endpoint refs** — JS comments reference real endpoints
3. **DB_ID drift** — every snippet has DB_ID header (with `pending` placeholder allowed)
4. **shortcode drift** — all shortcodes documented
5. **constants drift** — required constants match `wp-config.php` template
6. **feature-flags drift** — flag whitelists in sync
7. **REST endpoints drift** — endpoint registry vs CLAUDE.md table

Auto-fail CI on every push if drift detected.

## Audit Findings Closed

### CRITICAL (10+)

- BUG-1/BUG-2: Flash V.42 `subParcel` array vs JSON (hash mismatch)
- BUG-C1..C7: BO stock double-subtract chain
- C-Conc-1/2: Snapshot + Dispatcher GET_LOCK
- C-Data-1/2/3: Aggregate memo / BO secondary / `_flash_weight_grams` semantics
- CRIT-1: Cron heartbeat option key mismatch

### HIGH (24+)

- H1-H6: BO admin (CSRF, undo, ETA, etc.)
- H-C1/C2/H-D1/H-D2/H-D4/H-R3: Auto-rollback / DLQ / coverage SQL / etc.
- HIGH-1/3 (Round 7): cache_flush_group fallback, DLQ PII masking
- ISSUE-5/6: V.41 returnXXX + articleCategory align
- API-H4 (foundation): Idempotency-Key helper

### MEDIUM (~40+)

- MED-1..6 (Round 8): F2 cron strict, JSON fallback, dinoco_set_shipping_flag wired, current_time('U'), heartbeat for legacy cron, per-endpoint rate limit
- MED-1/2/3 (Round 14): manual_ship dead code, log dedup, BV stats limit
- DB-C3, DB-H1/H4, DB-M (audit Round 2 + Round 3+ batch)
- UX-C2/C3, UX-H9/H10/H12/H19, UX a11y bundle

### LOW (~20+)

- LOW-1..3 (Round 8): DLQ retry status_code/error_code, chunked queries, X-WP-Nonce header
- LOW-1..5 (Round 17/19): doc clarification, edge case coverage

## Patterns Established

### 1. Event Delegation (UX-H3 closure)

Replace inline `onclick=` with parent-level event delegation using `data-action` attributes. Pattern:

```javascript
parent.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'delete-row') { /* ... */ }
});
```

Used in: Snippet 16 (BO admin), B2F Snippet 5 V.6.5 (Makers tab), Manual Invoice picker.

### 2. Cache Priming (PERF sweeps)

Pre-fix: loop calls `get_field` + 2× `get_post_meta` + `get_the_title` per order = 4 DB queries × N orders.
Post-fix: `_prime_post_caches` + `update_meta_cache` once after `get_posts` + distributor posts pre-cached separately = 90%+ DB roundtrip elimination.

Used in: Snippet 16 V.2.9 (`/bo-pending-review`), Snippet 7 (daily summary), B2F Snippet 2 (PO list), LIFF AI Snippet 1 V.1.10 (`/claims`).

Defense: `function_exists('update_meta_cache')` guard (Round 15 ITEM A) — graceful no-op on stripped WP installs.

### 3. data-attr Scoping (DOM hierarchy)

CSS classes `stock-child-of-<SKU>` + `stock-grandchild-of-<SKU>` (uppercase) tag DOM rows with parent class. Each row has `data-render-parent` + `data-render-grandparent` for accurate subtree scoping (DD-3 shared child correctness).

Used in: Inventory V.42.26+, B2F Snippet 5 (Makers accordion), Snippet 8 (LIFF E-Catalog).

### 4. `function_exists` Guards (Phase 5+ pattern)

Every snippet that depends on a sibling snippet's helpers wraps calls with `function_exists()` check. Pattern:

```php
if ( function_exists( 'dinoco_idempotency_check' ) ) {
  $result = dinoco_idempotency_check( $key, $namespace, $body );
  // ...
}
```

Used in: All Phase 5+ snippets (Idempotency, Flag Audit Log, Modal Helpers, Observability, GDPR, Asset Loader).

Benefits: instant rollback (delete sensitive snippet → others gracefully no-op) + foundation-deploy ordering protection (deploy helper snippet before integrators).

### 5. Idempotency-Key Wrapper (Round 19 onwards)

Pattern (~50 LOC additive at top + bottom of POST handler):

```php
$idem_key = function_exists('dinoco_idempotency_extract_key') 
  ? dinoco_idempotency_extract_key($req) : null;

if ($idem_key) {
  $body_hash_input = ['gid' => $gid, 'items' => $items, /* semantic fields only */];
  $check = dinoco_idempotency_check($idem_key, 'place-order', $body_hash_input);
  if (is_wp_error($check)) return $check; // 409 conflict
  if (is_array($check)) return rest_ensure_response($check); // replay
}

// ... existing handler ...

if ($idem_key && function_exists('dinoco_idempotency_store')) {
  dinoco_idempotency_store($idem_key, 'place-order', $body_hash_input, $response, 200);
}
return rest_ensure_response($response);
```

Backward compat: clients without header behave byte-identical.
Endpoint integrations: 3/72+ (Round 19); defer rest until 1-2 weeks production canary.

## Lessons Learned

### What Worked

1. **Incremental rounds with explicit risk classification** — every round started with risk LOW/MED/NONE per item; high-risk items deferred to next round explicitly.
2. **Test-first additive infrastructure** — Idempotency Helper V.1.0 deployed with 25 tests + 0 endpoint changes (Round 18) before any handler integration (Round 19). Foundation-deploy-ordering protected.
3. **Drift detectors as guard rails** — 7 detectors caught doc/code drift on every push. Saved hours of manual review.
4. **`function_exists` guards everywhere** — graceful no-op pattern made every Phase 5+ snippet rollback-safe.
5. **Round 13 cross-rounds audit** — independent code-reviewer dispatch after 12 rounds caught 3 MED findings, validated 4 positive, ZERO CRIT/HIGH. Confirmed safety of incremental approach.

### What Didn't Work

1. **Premature endpoint integration** — Round 19 tempted to wrap 5+ endpoints; reduced to 3 critical based on canary recommendation. Defer broader integration until 1-2 weeks observed.
2. **DB_ID drift detector edge case** — needed `pending` placeholder pattern when adding NEW snippet (DB_ID assigned only after first WP Code Snippets sync).
3. **Test-suite mode tagging** — `phpunit --testsuite="Unit Tests"` didn't match config name (returned 0 tests). Default `vendor/bin/phpunit` ran all 383.

### Tradeoffs

1. **Wrapper-only Idempotency vs request-deduplication-at-rate-limit** — chose wrapper for additive simplicity. Existing transient dedup at line 760 of Snippet 3 = defense-in-depth.
2. **22 diagrams in 1 file vs separate files** — chose single-file (WORKFLOW-REFERENCE.md) for navigability. Trade-off: file size growth.
3. **Pure-logic helper tests vs DB integration** — 21 helper test classes (no DB, ~7ms) prioritized. Integration tests (51, ~1 min) maintained but not aggressively expanded.

## Pending Items Snapshot (for Round 20+)

### Deferred (per Round 19 recommendation)

- **API-H4 endpoint expansion** — 72+ POST endpoints remaining unwrapped. Defer until 1-2 weeks production canary observed on the 3 wrapped endpoints (place-order, manual-flash-create, create-po).
- **GDPR Phase 6** — full implementation per `docs/compliance/GDPR-PHASE-6-DESIGN.md` (queue worker + admin UI + email templates + 7 boss decisions).
- **Sentry activation** — composer install + DSN + flag flip per `docs/runbooks/SENTRY-ACTIVATION.md` (Day 2 of week-long sprint).
- **B2F CPT final drop** — wait until 2026-05-02 (day 14) per `docs/runbooks/WEEK-LONG-SPRINT-2026-04-29.md` (Day 3).
- **Vite LIFF migration** — staging-first + 10% canary (Day 4 of sprint).

### Open (low priority)

- **MED-3 (Round 13)**: `bv_get_stats($days=30)` limit=9999 CPU-bound (Brand Voice). Documented for future PERF batch.
- **Bulk UI checkboxes** in Backorders tab (endpoints ready).
- **Manual ETA button UI** (endpoint ready).
- **Flag audit log UI** for B2F flags audit (existing `b2f_log_flag_change()` text log).
- **Beta distributor management UI** for BO whitelist.

### Risks Tracked

- **Stripped WP install** — `update_meta_cache` `function_exists` guard added Round 15 ITEM A. Defense in depth.
- **NEW snippet sync ordering** — Idempotency Helper must be synced BEFORE integrators (Snippet 3, B2F Snippet 2). `function_exists` guard catches if violated.
- **Production canary** — 3 Idempotency-wrapped endpoints in production from Round 19. Monitor for 1-2 weeks before further integration.

## File Tree Snapshot (test infrastructure)

```
tests/
├── helpers/                                      # 21 PHPUnit unit test classes
│   ├── BoxCalcTest.php
│   ├── BoQtyTest.php
│   ├── CurrencyTest.php
│   ├── DiscountTierTest.php
│   ├── FlagAuditTest.php                         # Round 3 (NEW snippet)
│   ├── FlashEcSuggesterTest.php                  # Round 16
│   ├── FlashSignTest.php
│   ├── HierarchyTest.php
│   ├── IdempotencyTest.php                       # Round 18 (NEW)
│   ├── IdempotencyEndpointContractTest.php       # Round 19 (NEW)
│   ├── IntentBreakdownTest.php                   # Round 17
│   ├── IsTopLevelSetTest.php                     # Round 18
│   ├── OrderSnapshotTest.php
│   ├── ShippingResolveTest.php
│   ├── ValidateSkuHierarchyTest.php              # Round 17
│   ├── V70SourceSkuTest.php                      # Round 16
│   └── ... (5 more)
├── jest/                                          # 19 Jest suites
│   ├── api-client.test.js
│   ├── api-contract.test.js                      # drift detector 1
│   ├── bundle-size.test.js
│   ├── cart.test.js
│   ├── constants-drift.test.js                   # drift detector 5
│   ├── dangerous-apis.test.js
│   ├── db-id-drift.test.js                       # drift detector 3
│   ├── feature-flags-drift.test.js               # drift detector 6
│   ├── jsdoc-endpoint-refs.test.js               # drift detector 2
│   ├── liff-auth.test.js
│   ├── liff-init.test.js
│   ├── markdown-links.test.js
│   ├── modal.test.js
│   ├── rest-endpoints-drift.test.js              # drift detector 7
│   ├── shortcode-drift.test.js                   # drift detector 4
│   ├── snippet-db-id.test.js
│   ├── vite-manifest.test.js
│   └── ... (2 more)
├── integration/                                   # 51 PHPUnit integration tests
└── README.md                                      # current count documented
```

## See Also

- [`docs/audit/ARCHITECTURE-STATUS.md`](ARCHITECTURE-STATUS.md) — Refactor pillar deployment status
- [`CHANGELOG.md`](../../CHANGELOG.md) — Per-round detailed changelog
- [`CLAUDE.md`](../../CLAUDE.md) — Development conventions + ~7000 lines accumulated wisdom
- [`AUDIT-REPORT-2026-04-17.md`](../../AUDIT-REPORT-2026-04-17.md) — Source audit findings (170+ unique)
- [`tests/README.md`](../../tests/README.md) — Test suite scope + run instructions
