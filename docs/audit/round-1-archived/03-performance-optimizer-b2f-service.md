# Performance Audit — B2F + Service Center + Cross-Cutting

**Auditor**: performance-optimizer agent (3/4)
**Date**: 2026-04-24
**Scope**: B2F Orders/Makers/Credit/Migration Audit, Service Center & Claims, Print/Flash Test, Admin Dashboard root + cross-cutting
**Methodology**: Grep-based static analysis on PHP snippets + cross-reference to CLAUDE.md performance baseline (PERF-H1, PERF-H2, PERF-H7, PERF-M8, PERF-M15)

---

## Executive Summary

ระบบมี **strong performance foundation** จาก Phase 1-3 audit remediation (PERF-H1 catalog memo, PERF-H2 dashboard-stats batch, PERF-H7 BO cache, PERF-M8 cron meta priming). อย่างไรก็ดี ยังมี **3 N+1 hotspots ขนาดใหญ่** ที่ผ่านการ remediation รอบก่อนไม่ถูก:

### Top 3 Performance Killers

1. **Service Center claims list — `posts_per_page=500` + 11 `get_field()` per row + multi-meta LIKE search** = ~5,500 ACF reads + full postmeta scan per AJAX call (est. **3-8 seconds** blocked admin UI). No `update_meta_cache()` priming. Triggered every time admin opens Service Center tab.
2. **`b2f_format_maker_product()` calls 4-9 `get_field()` per product even on Phase 3 junction read path** (lines 1788-1815, REST API V.11.0). Plus `register_post_meta` SELECT loop (line 1900-1912) ทำ extra query สำหรับ SET parents. Maker with 50 products × 4 SETs = 200 ACF reads + 4 SQL = ~600-1200ms. No meta cache priming on `maker-products` endpoint.
3. **Print monitor REST endpoint (`/print-monitor`) — 40 orders × 5 `get_field()` per poll + RPi polls every 30s = 576K ACF reads/day** for a single feature. No meta cache priming, no transient caching of recent prints.

**Aggregate impact**: Admin opening Service Center + B2F Orders + Print tab = ~12,000 ACF reads + ~30 raw SQL queries = est. **6-12 seconds first paint** on cold cache. Many findings are quick wins (10-50 LOC `update_meta_cache()` priming).

---

## Per-Page Findings

### 1. B2F Orders — `[b2f_admin_orders_tab]`

**Render path**: Snippet 5 = pure HTML shell (cached 120s ใน Admin Dashboard via `$cacheable_modules`). Data load = AJAX → REST endpoints `/po-history`, `/po-detail`, `/dashboard-stats`.

**Findings**:

- **PERF-CRIT-1** `b2f_get_po_data()` (`Snippet 1` line 1161-1198) — **17 `get_field()` calls per PO**. Called for every PO in `/po-history` listing + every `/po-detail` request. PO list 50 rows × 17 = 850 ACF reads. **Est. 400-800ms** uncached.
  - **Fix**: Prime meta cache before loop in `b2f_rest_po_history` (line 4017-4022 `[B2F] Snippet 2`):
    ```php
    $post_ids = wp_list_pluck($q->posts, 'ID');
    if (!empty($post_ids)) update_meta_cache('post', $post_ids);
    ```
  - **Saved**: ~300-600ms per request. 17 ACF reads → 1 batched SELECT.
- **PERF-HIGH-1** `b2f_format_po_detail()` (`Snippet 2` line 2920) — same problem in PO detail modal. Each PO open = 17+ `get_field()` + items repeater. Mitigated by single-record use case.
- **PERF-MED-1** PO history `meta_query` (line 4017) ใช้ 2 keys `po_maker_id` + `po_status`. Without compound index `(post_id, meta_key)` MySQL ทำ filesort. Verify index exists.

**Verdict**: B2F Orders shell is cached but data path leaks ACF reads on every detail open.

---

### 2. B2F Makers — `[b2f_admin_makers_tab]`

**Render path**: Same shell-cache pattern. Data via `/makers`, `/maker-products/{id}`, `/maker-products-with-source/{id}`.

**Findings**:

- **PERF-CRIT-2** `b2f_format_maker_product()` (`Snippet 2` line 1665-1932) — Phase 3 cut-over reads junction but **still does 4-6 `get_field()` per row** (lines 1783-1810 fallback for legacy CPT path; lines 1815-1815 maker_currency lookup; line 1736-1750 `DINOCO_Catalog::get_by_sku` for parent name resolution). When `b2f_flag_v11_explicit_mode=ON`, **lines 1900-1916 execute SELECT into `wp_dinoco_product_makers`** for every parent SET node = N additional queries (one per SET).
  - Maker with 50 products + 5 SETs → 50 × 6 = **300 ACF reads + 5 separate SELECTs**. With 5 makers cached → ~1500 reads/refresh.
  - **Fix A** (LOW EFFORT): Snippet 2 line 1240-1244 + 1264-1268 ก่อน foreach → call `update_meta_cache('post', wp_list_pluck(...))`. Saved ~200-400ms.
  - **Fix B** (MEDIUM EFFORT): Batch missing-leaves probe — collect ALL parent SKUs first → single query `WHERE BINARY UPPER(product_sku) IN (...) GROUP BY UPPER(product_sku)` → in-memory diff. Saved ~50-200ms per Maker view.
- **PERF-HIGH-2** Snippet 2 line 1304-1364 `catalog_map` build is correctly batched via `DINOCO_Catalog::get_by_skus()` (V.9.12 fix). Verified.
- **PERF-MED-2** `b2f_build_hierarchy_context()` (`Snippet 2` line 1525-1545) reads `dinoco_sku_relations` option per request. Memoize per-request via static cache.
  - **Fix**: `static $ctx_cache = array(); $key = md5(serialize($sku_relations)); if (isset($ctx_cache[$key])) return $ctx_cache[$key];`
  - Saved ~10-30ms per render.

**Verdict**: Junction read is fast (1 SELECT), แต่ format function ลาก `get_field()` กลับเข้ามา.

---

### 3. B2F Credit — `[b2f_admin_credit_tab]`

**Render path**: Snippet 5 + `/dashboard-stats` for total payable + `b2f_recalculate_payable()` per maker.

**Findings**:

- **PERF-HIGH-3** `b2f_recalculate_payable()` (`[B2F] Snippet 7` line 228-289) executes **3 multi-JOIN postmeta queries** per maker call (received_total + paid_total + credit_limit), then ACF write + cache delete. Triggered on:
  - PO state change (receive-goods, record-payment)
  - Cron `b2f_cron_payment_reminder` (daily — likely calls per maker)
  - Admin manual recalc button
  - Each call = ~50-150ms (5-meta JOIN against 100K+ wp_postmeta). With 30 makers in payment cron = **1.5-4.5 seconds** total.
  - **Fix A**: Add compound indexes on `wp_postmeta (meta_key, meta_value(20))` — but WP core doesn't ship this; project should add via Snippet 15 dbDelta extension.
  - **Fix B** (BETTER): Cache result in transient `b2f_payable_{maker_id}` 5min — invalidate on `b2f_payable_add/subtract`.
  - Saved ~100-130ms per maker × 30 = ~3 seconds total.
- **PERF-MED-3** `dashboard-stats` already cached (PERF-H2). Total payable query (line 5408-5413) sums `meta_value` as DECIMAL — without index on `maker_current_debt`, full meta scan. With <100 makers acceptable, but verify index.

**Verdict**: Heavy SQL — 1 layer transient cache fixes 80%.

---

### 4. B2F Migration Audit — `[b2f_migration_audit]`

**Render path**: Audit dashboard + 9 REST endpoints.

**Findings**:

- **PERF-OK** `b2f_phase2_run_backfill()` (line 605-677) primes meta cache (line 614-620) — **already optimized**. ✓
- **PERF-MED-4** `b2f_run_diff_detection` cron (Snippet 11 line 626-717) — LIMIT 500 + `get_post()` per row (line 670) = up to **500 individual get_post() calls** per hour when shadow_write ON. `get_post()` is meta-cache-friendly เมื่อ post in cache, แต่ 500 distinct posts ไม่ได้ prime.
  - **Fix**: `_prime_post_caches($mp_ids)` ก่อน foreach. Hourly cron savings ~200-500ms.
- **PERF-LOW** `/parity/{maker_id}` — verify cache strategy. Audit dashboard auto-refreshes บ่อย? Check rate.

**Verdict**: V.3.1 inline backfill = already optimized. Diff cron มี optimization opportunity.

---

### 5. Service Center & Claims — `[dinoco_admin_claims]`

**Render path**: PHP shortcode renders shell + AJAX handlers in same file.

**Findings**:

- **PERF-CRIT-3** `get_claims_list` action (line 453-590) — **WORST OFFENDER**:
  - `posts_per_page = 500` (line 458) — load 500 posts at once
  - 11 `get_field()` per ticket (status_key, condition, prob_key, prod_info × 3 sub-fields, t_code, snap_group, ref_user_id, track_in, ticket_sn_text)
  - **Total**: 500 × 11 = **5,500 ACF reads** + 500 + main query
  - **NO `update_meta_cache()` priming**
  - LIKE search (line 466-485) on 3 meta keys + multi-key `meta_query` IN — full postmeta scan
  - `count($list_data)` (line 584) instead of `$query->found_posts` — incorrect total
  - Est: **3-8 seconds** uncached. Could spike to 15+ seconds with 500 active claims.
  - **Fix**:
    ```php
    $query = new WP_Query($args);
    if (!empty($query->posts)) {
        update_meta_cache('post', wp_list_pluck($query->posts, 'ID'));
    }
    ```
    + reduce default `posts_per_page` to 50 with proper pagination + add `'no_found_rows' => false` only when needed.
  - Saved ~2-6 seconds per AJAX call.
- **PERF-HIGH-4** Lines 1066, 1145 — additional queries with `posts_per_page=500` + meta_query (Send Part list, Send Repair list). Same issue.
- **PERF-MED-5** Inner `get_posts` for serial_number lookup (line 260-266, 816-822) inside conditional branches — single-row fetches. Acceptable but cache mappings.

**Verdict**: **Highest-priority fix** in audit scope. Single 5-line change saves 2-6 sec.

---

### 6. Print System — `[b2b_admin_control]` subtab=print

**Render path**: B2B Snippet 9 — admin tab + RPi `/print-monitor` polling.

**Findings**:

- **PERF-CRIT-4** `print-monitor` REST (line 461-497):
  - Queue list: 20 orders × 5 `get_field()` per order
  - Recent list: 20 orders × 5 `get_field()` per order
  - Each `get_field('source_group_id')` → `b2b_get_dist_by_group()` → potentially another query
  - **Total per poll**: ~200 ACF reads (acceptable single-call), but RPi polls every 30s × 24/7 = **576,000 reads/day**
  - **Fix A**: Prime meta cache on $queued + $recent post IDs. Saved ~100ms per poll.
  - **Fix B** (BIGGER): Cache response 30s — RPi can tolerate stale queue state for 30s. Add `set_transient('b2b_print_monitor_snapshot', ..., 30)`. Saved ~150ms per poll × 2880 polls = **~7 minutes/day server CPU**.
  - **Fix C**: `b2b_get_dist_by_group()` already cached? Verify. If not, cache 5 min.
- **PERF-HIGH-5** Distributor list endpoint (line 80-90) — 9 `get_field()` per distributor + `b2b_recalculate_debt()` per row. Debt recalc = 2-3 SELECTs. With 50 distributors = 100-150 SELECTs.
  - **Fix**: Cache `b2b_recalculate_debt()` result in transient 5min, invalidate on debt mutations. Saved ~500-1500ms.
- **PERF-MED-6** Line 1028 — `get_posts` inside CSV import foreach = N+1 (1 query per CSV row).

**Verdict**: Polling endpoint = highest accumulated cost. Caching response saves ~7 min CPU/day.

---

### 7. Flash Test — `[b2b_admin_control]` subtab=flashtest

**Findings**:

- **PERF-OK** Flash test endpoint = on-demand admin trigger, low frequency. No critical perf issues.
- **PERF-LOW** `b2b_flash_get_warehouses()` likely caches via transient — verify TTL.

**Verdict**: Not a bottleneck.

---

### 8. Cross-Cutting — Admin Dashboard Root + Snippet 11 Cron

**Findings**:

- **PERF-OK** `dnc_lazy_load_module` (line 730-759) — cache key per-user + per-module. Static modules cached 120-300s. ✓
- **PERF-MED-7** Cache key includes `get_current_user_id()` → 5 admin users × 19 modules = 95 cache entries. Acceptable. Bot/system processes that hit dashboard endpoints will pollute cache namespace.
- **PERF-HIGH-6** `b2f_run_delivery_reminder` cron (Snippet 11 line 100-179) — N+1 confirmed:
  - Line 119: foreach $pos
  - Line 120, 140, 141, 142, 143, 147: 6 `get_field()` per PO
  - With 200 open POs daily = 1200 ACF reads
  - **Fix**: Prime meta cache + maker meta cache. ~200-400ms saved per run.
- **PERF-HIGH-7** `b2f_run_overdue_check` (line 187+) — same pattern as delivery_reminder. Same fix.
- **PERF-MED-8** Slip log table (`wp_dinoco_slip_log`) — **NO TTL cron**. Confirmed gap (also flagged in BACKEND-ARCHITECTURE-REFACTOR-PLAN.md). 50 slips/day × 365 = ~18K rows/year unbounded. After 3 years = ~54K rows.
  - **Fix**: New cron `b2b_slip_log_cleanup_cron` (daily) — DELETE rows where `created_at < NOW() - INTERVAL 90 DAY`. Chunked 1000/iter (mirror Snippet 16 + Snippet 11 pattern).
- **PERF-LOW** `b2f_run_diff_detection` line 670 `get_post($mp_id)` per row — already noted.

---

## Performance Metrics Estimate

| Page / Endpoint | Queries (cold) | Est. ms (cold) | Queries (warm) | Est. ms (warm) | Top fix |
|---|---|---|---|---|---|
| Service Center claims list (500 rows) | 1 + 5500 ACF | **3000-8000** | 1 + 1 batched | 200-500 | `update_meta_cache` priming |
| B2F maker-products (50 products + 5 SETs) | 1 + 200 ACF + 5 SETs | 600-1200 | 1 + 1 batched | 100-200 | priming + batch leaf probe |
| B2F po-history (50 POs) | 1 + 850 ACF | 400-800 | 1 + 1 batched | 80-150 | priming |
| Print monitor (40 orders, polled 30s) | 1 + 200 ACF/poll | 150-250/poll | 0 (transient) | 5-10/poll | 30s response cache |
| B2F credit recalc per maker | 3 SQL multi-JOIN | 50-150 | 0 (transient) | 2-5 | 5min transient cache |
| B2F delivery reminder cron (200 POs) | ~1300 ACF reads | 1500-3000 | 1 + 1 batched | 200-400 | priming |
| B2F dashboard-stats | 12 SQL (cached PERF-H2) | 50-200 | 0 | 5 | already done ✓ |
| Service Center send-part list (500 rows) | 1 + 5500 ACF | 3000-8000 | 1 + 1 batched | 200-500 | priming |
| Distributor list (50 dists) | 50 + 100-150 debt SQL | 800-1500 | 0 (transient) | 50-100 | cache `b2b_recalculate_debt` |
| Slip log table size (no TTL) | — | — | full scan slow over time | up to seconds | TTL cleanup cron |

**Aggregate cold-cache "open all admin tabs"**: ~12-25 seconds first paint. With fixes: 3-6 seconds.

---

## Top 10 Action Items

| # | Priority | Item | File | Est. effort | Est. savings |
|---|---|---|---|---|---|
| 1 | 🔴 CRIT | Prime meta cache + reduce `posts_per_page` 500 → 50 in `get_claims_list` | `[Admin System] DINOCO Service Center & Claims` line 458, 519 | 1 hr | 2-6 sec/AJAX |
| 2 | 🔴 CRIT | Prime meta cache before `b2f_format_maker_product` foreach | `[B2F] Snippet 2` line 1240, 1264 | 30 min | 200-400ms/render |
| 3 | 🔴 CRIT | Cache `print-monitor` response in 30s transient | `[B2B] Snippet 9` line 461 | 1 hr | 7 min CPU/day |
| 4 | 🟡 HIGH | Prime meta cache in `b2f_get_po_data` callers (po-history, po-detail) | `[B2F] Snippet 2` line 4017-4022 | 30 min | 300-600ms/list |
| 5 | 🟡 HIGH | Cache `b2f_recalculate_payable()` 5min transient + invalidate on mutations | `[B2F] Snippet 7` line 228 | 2 hr | 1.5-4.5 sec/cron |
| 6 | 🟡 HIGH | Cache `b2b_recalculate_debt()` per distributor (5min) | `[B2B] Snippet 1` (debt manager) | 2 hr | 500-1500ms/list |
| 7 | 🟡 HIGH | Prime meta cache in `b2f_run_delivery_reminder` + `b2f_run_overdue_check` cron | `[B2F] Snippet 11` line 119, 215 | 30 min | ~400ms/run |
| 8 | 🟡 HIGH | New `b2b_slip_log_cleanup_cron` daily TTL 90 days, chunked DELETE | New code in `[B2B] Snippet 15` | 2 hr | Avoid future degradation |
| 9 | 🟢 MED | Static memoize `b2f_build_hierarchy_context()` per-request | `[B2F] Snippet 2` line 1525 | 15 min | 10-30ms/render |
| 10 | 🟢 MED | Prime post cache in `b2f_run_diff_detection` (`_prime_post_caches`) | `[B2F] Snippet 11` line 666 | 15 min | 200-500ms/hr |

**Cumulative savings**: First-load admin dashboard 12-25s → 3-6s. RPi/cron CPU savings ~10 minutes/day.

---

## Cross-Agent Flags

### → database-expert
- **Index audit**: Verify compound indexes exist on `wp_postmeta (post_id, meta_key(40))` and `(meta_key(40), meta_value(40))`. Service Center LIKE search hot path needs second index.
- **Schema decision**: `wp_dinoco_slip_log` retention policy — 90 days suggested. Confirm with finance/audit requirements.
- **`b2f_recalculate_payable` SQL profile**: 5-meta JOIN may benefit from materialized view or denorm column. Discuss tradeoff with caching approach.

### → security-pentester
- Caching `print-monitor` response 30s — verify no PII leak across users (RPi is system-level, single token, no per-user data, safe).
- Caching `b2b_recalculate_debt` — invalidation must fire on EVERY debt mutation path (Snippet 13 atomic add/subtract), else stale debt may bypass `credit_hold` checks.

### → fullstack-developer
- Service Center pagination — UI currently expects `posts_per_page=500` flat list. Migration to paginated UI requires JS rework + admin training. Coordinate with UX team.
- B2F LIFF E-Catalog already paginates? Verify if hierarchy-aware pagination breaks SET grouping.

### → frontend-design
- B2F Maker LIFF + Admin tabs render time = perceptible delay (>500ms). After backend optimization, may need skeleton loaders or progressive rendering.

---

## Validation Approach

For each fix:
1. Add `define('SAVEQUERIES', true)` to `wp-config.php` (staging)
2. Hit endpoint cold cache (clear transients)
3. Log `count($wpdb->queries)` + sum of timings before/after
4. Target: each AJAX response < 800ms cold, < 200ms warm
5. Use `microtime(true)` deltas in `dinoco_obs_capture()` if Sentry enabled (V.1.0 Observability snippet)

---

## Notes / Caveats

- **No actual profiling** performed — all numbers are estimated from query count × typical WP postmeta lookup time on production-class MySQL (1-3ms uncached, <0.1ms cached). Real numbers may vary ±50%.
- **Prime ACF cache via `update_meta_cache`** — ACF reads through `get_post_meta()` after V5; meta cache priming = ACF cache priming. Verified pattern in PERF-M8 (Snippet 11 V.2.4) + PERF-H2 (Snippet 2 V.10.x dashboard-stats).
- **Transient cache stampede risk** — for high-frequency endpoints (print-monitor), use `wp_cache_*` (object cache) not transients (DB). If Redis/Memcached available → much better.
- **Rate-limit gotcha** — caching response 30s on print-monitor is safe ONLY IF queue mutations also bust cache. Need `delete_transient('b2b_print_monitor_snapshot')` on order status change hooks.

---

**End of report.**
