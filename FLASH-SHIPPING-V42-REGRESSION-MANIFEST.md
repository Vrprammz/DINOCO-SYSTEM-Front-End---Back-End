# Flash Shipping V.42 — Regression Test Manifest

> **Status**: Documentation only — DINOCO doesn't have PHPUnit. These scenarios are tracked for manual QA + future automated suite.
> **Seed location**: Not applicable (seed-regression.js seeds chatbot scenarios, not backend).
> **Related plan**: `.claude/plans/refactored-brewing-dream.md` § REG seeds

## Core Regression (REG-028..056)

| ID | Category | Scenario | Verify |
|---|---|---|---|
| REG-028 | Walk-in bypass | Walk-in order (is_walkin=1) skips V.42 resolver entirely | `dinoco_resolve_manifest_shipping` not called; Flash uses V.41 weight |
| REG-029 | Flag OFF parity | `dinoco_shipping_meta_enabled=0` → Flash payload byte-identical to V.41.2 | Diff Flash request params ON vs OFF |
| REG-030 | Bulk CSV idempotency | Same `X-Idempotency-Key` twice → 2nd returns cached result (no re-import) | `shipping_bulk_idem_*` transient hit |
| REG-031 | New SKU strict block | Create new SKU via modal without dims → blocked with Thai error | UI validation + server reject 400 |
| REG-033 | SET compute math | SET aggregate = sum(leaf content weight) + parent tare (once, not N×) | `dinoco_aggregate_children_shipping` memo |
| REG-036 | CSV injection | CSV with `=SUM(A1)` leading `=/+/-/@/\t/\r/\n` → prefix `'` added | Row inspected post-import |
| REG-037 | Vehicle threshold (weight) | Weight 5001g → expressCategory=4 | `dinoco_suggest_express_category` returns 4 |
| REG-038 | Vehicle threshold (dim) | Any dim 46cm OR sum 151cm → expressCategory=4 | suggest returns 4 |
| REG-040 | single_box resolve | pack_mode=single_box + box_template → dims from template + content_weight + tare | resolver source = `sku_single_box_tpl_{code}` |
| REG-041 | bulk_pack partial | upb=50, qty=10 → 1 PNO, weight = 10×wpu + tare (NOT 50×wpu) | per_pno[0]['weight_g'] ≈ 10×wpu+tare |
| REG-042 | bulk_pack multi | qty=60, upb=50 → 2 PNO, PNO1=50×wpu+tare, PNO2=10×wpu+tare | remaining qty tracker correct |
| REG-043 | Multi-PNO dims | 3 SKU → 2 PNO with different dims (not duplicated across PNO) | per_pno indices have distinct dims |
| REG-044 | ad-hoc fallback | pack_mode=unknown → uses plain_dims columns OR defaults + admin Flex | shipping_data_missing Flex fires |
| REG-045 | HappyTech assembled_set | warehouse-packed SET → box_template L + sum(leaves.wpu) + L.tare | source = `sku_assembled_set_tpl_L` |
| REG-050 | Missing data fallback | Leaf with no weight data → defaults + log (rate-limited 1/sku/hr) | `dinoco_log_missing_shipping_data` transient |
| REG-055 | Flag OFF byte-identical | Flash payload diff flag OFF vs V.41.2 = 0 bytes | Assert exact match |
| REG-056 | Auto-rollback triggers | 21 DLQ inserts + 5% error rate → flag auto-disabled + Telegram fires | `dinoco_shipping_meta_enabled='0'` after cron |

## Performance (REG-P01..P06)

| ID | Scenario | Verify |
|---|---|---|
| REG-P01 | Query count ≤ V.41+3 | 10-PNO order uses batch helper `dinoco_get_shipping_data_map` | Total queries ≤ V.41 baseline + 3 |
| REG-P02 | Bulk CSV single flush | Single `wp_cache_flush_group` + `flush_memo` AFTER loop (not per-row) | Cache write count = 1 per bulk |
| REG-P03 | Box template edit propagates | Admin edits template dims → SKU resolver returns new dims | Cache invalidation hooks fire |
| REG-P04 | DD-3 shared leaf memo | Same leaf resolved under 2 parent SETs → static $memo hits | Function called once per unique (leaves,parent) key |
| REG-P05 | Scanner warm cache | 2nd scan of same SKU within 5 min → <100ms response | `dinoco_get_shipping_data_map` cache hit |
| REG-P06 | flush_memo fresh read | Write then read within same request → returns new value | `DINOCO_Catalog::flush_memo()` effective |

## Blocker (REG-B1..B5)

| ID | Scenario | Verify |
|---|---|---|
| REG-B1 | Plain dims when no template | SKU with `box_template_id=NULL` + `weight_grams` set → resolver uses plain_dims | pack_mode=unknown case, source=`plain_dims_unknown_mode` |
| REG-B2 | Flag name convention | Option name is `dinoco_shipping_meta_enabled` (not `dinoco_flag_*`) | `get_option('dinoco_shipping_meta_enabled')` exists |
| REG-B4 | MySQL 8.0.16+ CHECK | INFORMATION_SCHEMA probe verifies CHECK applied; older MySQL silently skipped | SHOW CREATE TABLE on 8.0+ shows CHECK |
| REG-B5 | dbDelta + CHECK split | Re-run schema migration is idempotent (no duplicate column/constraint errors) | Second install does nothing |

## Feature-Architect (REG-F-M1..M3)

| ID | Scenario | Verify |
|---|---|---|
| REG-F-M1 | Snapshot immutable | Snapshot at `confirm_bill` → admin flips pack_mode mid-order → Flash create uses snapshot (not live catalog) | `_flash_shipping_snapshot` meta wins over live resolve |
| REG-F-M2 | Ad-hoc review queue | `save_sku_data=1` from manual-ship → SKU pack_mode=unknown appears in `/shipping/ad-hoc-pending` | Admin classify modal resolves to non-unknown |
| REG-F-M3 | Smart auto-detect | bpu=3 SET → `dinoco_smart_detect_pack_mode` suggests `multi_box`; upb=50 → `bulk_pack` | Helper output matches decision tree |

## Additional (REG-057..068)

| ID | Scenario | Verify |
|---|---|---|
| REG-057 | Legacy `_flash_weight_grams` override | Admin sets ticket meta → all PNOs use override weight | priority chain: ticket_meta > SKU |
| REG-058 | pack_mode=unknown + plain dims | resolver uses plain dims (not defaults) | source=`plain_dims_unknown_mode` |
| REG-059 | bulk_pack partial box weight | qty=60, upb=50 → PNO2 weight = 10×wpu+tare | confirmed in REG-042 |
| REG-060 | Tare counted once | SET aggregate weight excludes N× tare | `dinoco_aggregate_children_shipping` returns content only |
| REG-061 | Slot override read | pack_slots.length_cm_override=30 takes precedence over template.length_cm=40 | multi_box resolver |
| REG-062 | Orphan slot cleanup | admin bpu=3→2 + save → slot_index=2 auto-deleted | C-B2 fix |
| REG-063 | Seed re-run | `INSERT IGNORE` on box_templates → no duplicate error, second run is no-op | `_dinoco_box_templates_seeded` flag |
| REG-064 | Soft-delete template fallback | `is_active=0` template → SKU resolver falls back + Flex alert | `shipping_data_missing` Flex fires |
| REG-065 | F2 verify cron | Send EC=1, Flash bumps to 4 → `flash_category_verify_cron` (15min) detects + alerts | Admin Flex `flash_category_bumped` |
| REG-066 | F4 warehouseNo fallback | Invalid warehouseNo → Flash 4xx → Method 1 (srcXXX) retry | Audit logs `warehouseNo_fallback` |
| REG-067 | F7 DLQ lifecycle | 3 retries fail → DLQ insert + Flex alert. Admin hits /retry → resolved/abandoned | Row status transitions |
| REG-068 | F7 DLQ 30-day cleanup | `dinoco_flash_dlq_cleanup_cron` daily 03:00 → rows > 30d deleted | Row count stable long-term |

## Round 4-7 Post-Ship Regression Scenarios (2026-04-21)

### Round 4 (commit dd66123)

| ID | Category | Scenario | Verify |
|---|---|---|---|
| REG-069 | Concurrency | Dispatcher double-click — 2 concurrent admin clicks on Flash Create button → GET_LOCK serializes → only 1 Flash order created | `b2b_flash_dispatch_create_all` uses `GET_LOCK` + only 1 PNO inserted |
| REG-070 | Concurrency | `_inflight` Set with SKU discriminator — Save SKU_A + Save SKU_B in parallel → both succeed (not blocked) | Go-Live Multi-Box save; SKU_A + SKU_B rows present |
| REG-071 | Validation | save-pack-slots count mismatch — Send 2 slots for bpu=3 SKU → 400 `slot_count_mismatch` | REST returns 400 + error code; no DB write |
| REG-072 | Coverage | `bulk_pack` SKU with `box_template_id=NOT NULL` + `weight_per_unit_g=0` → NOT counted complete | `/coverage` breakdown excludes row |

### Round 5 (commit e10ff0d)

| ID | Category | Scenario | Verify |
|---|---|---|---|
| REG-073 | Resilience | `\Throwable` catch — simulate TypeError in resolver → `snapshot_failure` audit row created | `wp_dinoco_flash_audit` row with source=`snapshot_failure` |
| REG-074 | Resilience | `error_log` fallback — audit INSERT fail scenario → PHP error log written | PHP error log grep `[flash-audit]` |
| REG-075 | Idempotency | Dispatcher BO meta check — ticket with only `_flash_tracking_numbers_bo` set → dispatcher returns `idempotent_bo_only` | Response code `idempotent_bo_only`; no duplicate Flash order |
| REG-076 | Concurrency | Lock timeout 15s — Worker A holds 10s, Worker B waits successfully | Both workers complete; no early `GET_LOCK=0` abort |
| REG-077 | Resilience | Zero-denominator rollback — audit table truncated + DLQ 25 rows → auto-rollback triggers on absolute count | Flag auto-flips OFF; Telegram fires |
| REG-078 | Observability | Cron heartbeats — each cron fires + writes `dinoco_cron_{name}_last_run` | 3 wp_options present with recent timestamps |
| REG-079 | Schema | DLQ UNIQUE migration — legacy DB without constraint → migration adds it + dedups | SHOW CREATE TABLE has UNIQUE KEY on `(ticket_id, action)` |
| REG-080 | XSS | jQuery DOM — slot_label with `<script>alert(1)</script>` → rendered as text, not executed | Browser DOM shows literal string; no alert fired |

### Round 6/7 (commit b3faa05)

| ID | Category | Scenario | Verify |
|---|---|---|---|
| REG-081 | Observability | Cron heartbeat key match — Go-Live Monitor reads correct option name → shows actual age | Monitor card shows "last run N min ago" (not "never") for all 3 crons |
| REG-082 | Resilience | `wp_cache_flush_group` guard — simulate old object cache (function_exists=false) → falls to `wp_cache_flush`, no fatal | No PHP fatal; cache clears fully (coarser grain) |
| REG-083 | Security | DLQ PII masking — INSERT row → `request_body` stored with masked `dstName` (first 3 + last 3 chars) | DLQ row `request_body.dstName` = `"สมช***นทร์"` not full name |
| REG-084 | Resilience | DLQ retry via dispatcher — retry endpoint → rebuilds params from ticket_id, not stored body | Flash request fresh (not stored body replay); uses current ticket state |

### Round 8 (if applicable — pending)

Rounds 8+ scenarios to be added as commits land.

## Running tests manually

**Backend logic tests** (until PHPUnit exists):
```bash
# WP REST endpoint smoke test
curl -X POST https://dinoco.in.th/wp-json/dinoco-stock/v1/shipping-compute \
  -H "X-WP-Nonce: ${NONCE}" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"sku":"DNCGND37LS","qty":1}]}'
```

**Coverage widget**:
```bash
curl -X GET https://dinoco.in.th/wp-json/dinoco-stock/v1/shipping-coverage \
  -H "X-WP-Nonce: ${NONCE}"
```

**DLQ inspection**:
```bash
curl -X GET https://dinoco.in.th/wp-json/b2b/v1/flash-dlq?status=pending \
  -H "X-WP-Nonce: ${NONCE}"
```

**Flag toggle (staging only)**:
```bash
curl -X POST https://dinoco.in.th/wp-json/dinoco-stock/v1/shipping-defaults \
  -H "X-WP-Nonce: ${NONCE}" \
  -H "Content-Type: application/json" \
  -d '{"flag_enabled": true}'
```

## Future automation roadmap (not V.42 scope)
- PHPUnit bootstrap for WordPress + MySQL fixtures
- CI job: seed test DB → run all REG scenarios → pass/fail matrix
- Integration with GitHub Actions similar to `regression-guard.yml` but for backend
