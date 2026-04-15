-- =============================================================================
-- B2F AUDIT QUERIES V.1.0 — Reference SQL Patterns for Audit Snippet
-- =============================================================================
--
-- วัตถุประสงค์:
--   Document SQL query patterns ที่ fullstack-developer จะ implement ใน
--   `[Admin System] B2F Migration Audit` snippet (5 REST endpoints)
--
--   Phase 1 = observe-only — queries ทั้งหมด SELECT เท่านั้น (ห้าม write)
--
-- Baseline (verified from export dinoco-catalog-20260415-160556/):
--   - 154 products ใน wp_dinoco_products
--   - 62 SET parents (มี children ใน sku_relations)
--   - 43 top-level SETs (ไม่มี parent)
--   - 3 makers: Happy Tech Pro (91 regs), Test Fac2 (7, CNY), Test Fac3 (5)
--   - 103 total b2f_maker_product CPT records
--
-- Placeholders:
--   {prefix}     = $wpdb->prefix (usually "wp_")
--   {maker_id}   = BIGINT UNSIGNED (b2f_maker CPT post_id)
--   {threshold}  = DECIMAL (e.g. 100 THB — stale detection boundary)
--   {days}       = INT (e.g. 7 for weekly window)
--
-- Performance notes:
--   - postmeta JOIN พวกนี้ unavoidable หนัก — ใช้ LIMIT + cache transient
--   - Cache key pattern: `b2f_audit_{query_name}_{hash}` — TTL 5 min
--   - Invalidate cache เมื่อ save_post_b2f_maker_product fire
--
-- =============================================================================


-- =============================================================================
-- Q1: ORPHAN SETS per maker
-- =============================================================================
--
-- Endpoint: GET /dinoco-b2f-audit/v1/drift
-- Purpose:  List SETs ที่ leaves registered ครบ (ใน maker CPT) แต่ SET ยังไม่มี CPT
-- Expected: ~10-20 orphan SETs (HTP ยังไม่ sync SET NX500 family)
--
-- Approach (pseudo — pure SQL impossible เพราะ sku_relations เก็บใน wp_options):
--   1. PHP read get_option('dinoco_sku_relations') → walk ใน memory
--   2. SQL query ด้านล่างใช้สำหรับ fetch registered SKUs per maker
--
-- Expected row count: 3 makers × avg 35 regs = ~100 rows

SELECT
    pm_maker.meta_value    AS maker_id,
    pm_sku.meta_value      AS product_sku,
    pm_cost.meta_value     AS unit_cost,
    p.ID                   AS cpt_id,
    p.post_status
FROM {prefix}posts p
INNER JOIN {prefix}postmeta pm_maker
    ON pm_maker.post_id = p.ID AND pm_maker.meta_key = 'maker_id'
INNER JOIN {prefix}postmeta pm_sku
    ON pm_sku.post_id = p.ID AND pm_sku.meta_key = 'product_sku'
LEFT JOIN {prefix}postmeta pm_cost
    ON pm_cost.post_id = p.ID AND pm_cost.meta_key = 'unit_price'
WHERE p.post_type = 'b2f_maker_product'
  AND p.post_status IN ('publish', 'draft')
ORDER BY pm_maker.meta_value, pm_sku.meta_value;

-- EXPLAIN expected: Using index on post_type + joining via idx_post_id on postmeta
-- Index hint: postmeta(post_id, meta_key) composite จะช่วยเยอะ
--            (WordPress default มี PK on meta_id + KEY on post_id + KEY on meta_key)


-- =============================================================================
-- Q2: STALE RECORDS (unit_cost below threshold)
-- =============================================================================
--
-- Endpoint: GET /dinoco-b2f-audit/v1/stale
-- Purpose:  List CPTs ที่ mp_unit_cost < threshold (e.g. 100 THB) — likely orphan ฿666
-- Expected: ~4-8 rows (DNCSETNX500X001 = ฿666 flagged ใน V.9.15)
--
-- Logic (PHP post-filter):
--   1. Query ด้านล่าง fetch ทุก registration
--   2. PHP loop: compute sum_leaves_cost per SET (ใช้ dinoco_get_leaf_skus)
--   3. Flag ถ้า mp_unit_cost < sum_leaves × 0.1
--
-- Simpler SQL variant (absolute threshold, no hierarchy):

SELECT
    pm_maker.meta_value                    AS maker_id,
    maker.post_title                       AS maker_name,
    pm_sku.meta_value                      AS product_sku,
    CAST(pm_cost.meta_value AS DECIMAL(12,2)) AS unit_cost,
    p.ID                                   AS cpt_id,
    p.post_modified                        AS last_modified
FROM {prefix}posts p
INNER JOIN {prefix}postmeta pm_maker
    ON pm_maker.post_id = p.ID AND pm_maker.meta_key = 'maker_id'
INNER JOIN {prefix}postmeta pm_sku
    ON pm_sku.post_id = p.ID AND pm_sku.meta_key = 'product_sku'
INNER JOIN {prefix}postmeta pm_cost
    ON pm_cost.post_id = p.ID AND pm_cost.meta_key = 'unit_price'
LEFT JOIN {prefix}posts maker
    ON maker.ID = CAST(pm_maker.meta_value AS UNSIGNED)
WHERE p.post_type = 'b2f_maker_product'
  AND p.post_status = 'publish'
  AND CAST(pm_cost.meta_value AS DECIMAL(12,2)) < {threshold}
  AND CAST(pm_cost.meta_value AS DECIMAL(12,2)) > 0
ORDER BY CAST(pm_cost.meta_value AS DECIMAL(12,2)) ASC
LIMIT 200;

-- EXPLAIN: Using filesort on ORDER BY numeric cast — ok for small result set
-- Optimization hint: ถ้า postmeta โต > 1M rows, ย้าย unit_price ไป canonical column
-- (นั่นคือเหตุผลที่ Phase 2-4 สร้าง junction table)


-- =============================================================================
-- Q3: PER-MAKER PARITY CHECK
-- =============================================================================
--
-- Endpoint: GET /dinoco-b2f-audit/v1/parity/{maker_id}
-- Purpose:  Compare "registered count" vs "should-have count"
--           - registered = COUNT(b2f_maker_product WHERE maker_id=X)
--           - should-have = count(leaves registered) + count(top-level SETs ของ leaves)
-- Expected for baseline:
--   - HTP: registered=91, should-have=~104 (missing ~13 SET parents)
--   - Test Fac2: registered=7, should-have=7 (ok)
--   - Test Fac3: registered=5, should-have=5 (ok)

-- Step 1: Get registered SKUs for specific maker
SELECT
    pm_sku.meta_value                         AS sku,
    CAST(pm_cost.meta_value AS DECIMAL(12,2)) AS unit_cost,
    p.ID                                      AS cpt_id
FROM {prefix}posts p
INNER JOIN {prefix}postmeta pm_maker
    ON pm_maker.post_id = p.ID AND pm_maker.meta_key = 'maker_id'
INNER JOIN {prefix}postmeta pm_sku
    ON pm_sku.post_id = p.ID AND pm_sku.meta_key = 'product_sku'
LEFT JOIN {prefix}postmeta pm_cost
    ON pm_cost.post_id = p.ID AND pm_cost.meta_key = 'unit_price'
WHERE p.post_type = 'b2f_maker_product'
  AND p.post_status = 'publish'
  AND pm_maker.meta_value = CAST({maker_id} AS CHAR);

-- Step 2: Aggregate count only (quick summary)
SELECT
    pm_maker.meta_value                     AS maker_id,
    COUNT(DISTINCT p.ID)                    AS registered_count,
    COUNT(DISTINCT CASE
        WHEN CAST(pm_cost.meta_value AS DECIMAL(12,2)) < 100 THEN p.ID
    END)                                    AS stale_count_under_100,
    MIN(p.post_date)                        AS earliest_registration,
    MAX(p.post_modified)                    AS latest_modified
FROM {prefix}posts p
INNER JOIN {prefix}postmeta pm_maker
    ON pm_maker.post_id = p.ID AND pm_maker.meta_key = 'maker_id'
LEFT JOIN {prefix}postmeta pm_cost
    ON pm_cost.post_id = p.ID AND pm_cost.meta_key = 'unit_price'
WHERE p.post_type = 'b2f_maker_product'
  AND p.post_status = 'publish'
GROUP BY pm_maker.meta_value
ORDER BY registered_count DESC;

-- Expected output (3 rows for 3 makers):
--   maker_id=123 (HTP), registered=91, stale=~1 or 2
--   maker_id=456 (Test Fac2), registered=7, stale=0
--   maker_id=789 (Test Fac3), registered=5, stale=0


-- =============================================================================
-- Q4: VIRTUAL SET INJECT STATS (from wp_options tracker)
-- =============================================================================
--
-- Endpoint: part of GET /dinoco-b2f-audit/v1/drift
-- Purpose:  Count virtual SET injections per day — ดูว่า V.9.19 band-aid
--           ยังถูก trigger บ่อยแค่ไหน (high count = Phase 2 urgent)
--
-- Data source: wp_option `b2f_virtual_inject_stats` (JSON, appended by Snippet 2)
-- Format:     { "YYYY-MM-DD": { "count": N, "makers": { "M1": N, "M2": N } } }
--
-- SQL query จะเป็นการ read wp_options แล้ว PHP parse JSON:

SELECT
    option_name,
    option_value,
    LENGTH(option_value) AS payload_size
FROM {prefix}options
WHERE option_name = 'b2f_virtual_inject_stats';

-- Expected: 1 row, option_value = JSON ≤ 10KB
-- PHP parse:
--   $stats = json_decode(get_option('b2f_virtual_inject_stats', '{}'), true);
--   $last_7d = array_slice($stats, -7, 7, true);


-- =============================================================================
-- Q5: 7-DAY DRIFT HISTORY AGGREGATION
-- =============================================================================
--
-- Endpoint: part of dashboard chart (Parity Overview section)
-- Purpose:  Daily bucket ของ drift metrics (orphan/stale/virtual) ย้อน 7 วัน
--
-- Data source: wp_dinoco_maker_product_observations (Phase 2+ only, empty in Phase 1)
-- ใน Phase 1: query นี้จะ return empty (ตาราง observations ยังไม่สร้าง)
-- → Dashboard ต้อง fallback: แสดง "ยังไม่มีข้อมูล — รอ Phase 2 activation"

SELECT
    DATE(observed_at)                                         AS day,
    COUNT(DISTINCT CASE
        WHEN field_name = 'orphan_set' THEN CONCAT(maker_id, '|', sku)
    END)                                                       AS orphan_count,
    COUNT(DISTINCT CASE
        WHEN diff_detected = 1 THEN CONCAT(maker_id, '|', sku)
    END)                                                       AS stale_count,
    SUM(CASE WHEN source = 'virtual_inject' THEN 1 ELSE 0 END) AS virtual_inject_count,
    COUNT(*)                                                   AS total_observations
FROM {prefix}dinoco_maker_product_observations
WHERE observed_at >= DATE_SUB(NOW(), INTERVAL {days} DAY)
GROUP BY DATE(observed_at)
ORDER BY day DESC;

-- EXPLAIN: uses idx_observed range scan + idx_diff for conditional aggregation
-- Expected for {days}=7: ≤ 7 rows (1 row per day)
-- Storage: ~110K peak observation rows = <50MB InnoDB


-- =============================================================================
-- BONUS: ROW-COUNT SANITY CHECKS
-- =============================================================================
--
-- Run these regularly to verify dashboard numbers match DB truth:

-- Total b2f_maker_product records
SELECT COUNT(*) AS total_regs
FROM {prefix}posts
WHERE post_type = 'b2f_maker_product'
  AND post_status = 'publish';
-- Expected: 103 (matches baseline)

-- Total b2f_maker records
SELECT COUNT(*) AS total_makers
FROM {prefix}posts
WHERE post_type = 'b2f_maker'
  AND post_status = 'publish';
-- Expected: 3 (HTP, Test Fac2, Test Fac3)

-- Total products in canonical catalog
SELECT COUNT(*) AS total_products
FROM {prefix}dinoco_products;
-- Expected: 154 (matches baseline)

-- sku_relations size (wp_options blob)
SELECT
    option_name,
    LENGTH(option_value) AS size_bytes,
    CHAR_LENGTH(option_value) AS chars
FROM {prefix}options
WHERE option_name = 'dinoco_sku_relations';
-- Expected: ~5-15 KB JSON (62 parents × avg 3 children)


-- =============================================================================
-- CACHE INVALIDATION HOOKS (for dashboard implementation reference)
-- =============================================================================
--
-- ใช้ใน fullstack-developer snippet เพื่อ busting audit cache:
--
-- add_action('save_post_b2f_maker_product', function($post_id) {
--     delete_transient('b2f_audit_q1_orphan_sets');
--     delete_transient('b2f_audit_q2_stale_records');
--     delete_transient('b2f_audit_q3_parity_all');
-- });
--
-- add_action('updated_option', function($option_name) {
--     if ($option_name === 'dinoco_sku_relations') {
--         delete_transient('b2f_audit_q1_orphan_sets');
--         delete_transient('b2f_audit_q3_parity_all');
--     }
-- }, 10, 1);


-- END OF b2f-audit-queries.sql
