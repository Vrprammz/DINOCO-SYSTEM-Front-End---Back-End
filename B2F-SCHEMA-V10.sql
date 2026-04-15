-- =============================================================================
-- B2F SCHEMA V10.1 — Canonical Junction Table Design (Option F Hybrid Shadow-Write)
-- =============================================================================
--
-- วัตถุประสงค์ (Purpose):
--   แก้ root cause ของ dual source of truth ใน B2F module โดยสร้าง canonical
--   junction table `wp_dinoco_product_makers` ที่เก็บความสัมพันธ์
--   product × maker × ราคา/MOQ/shipping → แทนที่ b2f_maker_product CPT เดิม
--   ที่ drift จาก wp_dinoco_products (catalog canonical) จน stale/orphan/virtual SET
--   inject เป็น patterns ซ้ำๆ (V.9.11-V.9.19 = 8 commits ไล่แก้)
--
-- สถานะ Phase 1 (Current — DESIGN ONLY, NO MIGRATION):
--   ✋ ไฟล์นี้เป็น design doc เท่านั้น — ยังไม่ run CREATE TABLE
--   ✋ Phase 1 = observe-only: audit dashboard + dry-run CSV + feature flags (all false)
--   ✋ User review baseline data ก่อนอนุมัติ Phase 2 activation
--
-- Execution Plan (Phase 2 — ยังไม่เริ่ม):
--   1. Backup database snapshot (mysqldump ก่อน migrate)
--   2. Phase 2 snippet เรียก `dbDelta()` ผ่าน WordPress upgrade.php helper:
--      require_once ABSPATH . 'wp-admin/includes/upgrade.php';
--      dbDelta( file_get_contents(__DIR__ . '/B2F-SCHEMA-V10.sql') );
--      update_option('b2f_schema_version', '10.1');
--   3. Backfill script อ่าน b2f_maker_product CPT → INSERT เข้า junction table
--      (เก็บ `legacy_cpt_id` เป็น reverse lookup สำหรับ rollback)
--   4. Enable flag `b2f_flag_shadow_write` → dual-write mode (ทั้ง CPT + junction)
--   5. Phase 3: Enable `b2f_flag_read_from_junction` → cut-over read path
--   6. Phase 4: Drop CPT + `legacy_cpt_id` column
--
-- Rollback (Phase 1 → zero state):
--   DROP TABLE IF EXISTS `wp_dinoco_product_makers`;
--   DROP TABLE IF EXISTS `wp_dinoco_maker_product_observations`;
--   DELETE FROM wp_options WHERE option_name IN (
--     'b2f_flag_auto_sync_sets',
--     'b2f_flag_shadow_write',
--     'b2f_flag_read_from_junction',
--     'b2f_drift_history_7d',
--     'b2f_schema_version'
--   );
--
-- Review Notes (amended V10 → V10.1 after database-expert review):
--   ✅ `notes TEXT` — migrate ACF mp_notes (else data loss)
--   ✅ `created_by` / `updated_by` — audit trail (boss asks "ใครแก้ ฿666")
--   ✅ `deleted_at` — soft delete (preserve PO history references)
--   ✅ `idx_maker_status` composite — hot path: Snippet 2 list maker products
--   ✅ `idx_legacy_cpt` — rollback reverse lookup
--   ✅ `utf8mb4_bin` collation บน product_sku — case-sensitive match UPPER pattern
--   ✅ Observations TTL cron — 60-day retention (~50MB peak bloat guard)
--
-- Currency Semantics (CRITICAL):
--   unit_cost, shipping_land, shipping_sea = NATIVE currency ของ maker
--   เช่น maker_currency=CNY → unit_cost=290 (¥290)
--        maker_currency=THB → unit_cost=2925 (฿2925)
--   การคำนวณ THB total = JOIN wp_posts meta `maker_currency` +
--   multiply `po_exchange_rate` ณ create-po time (snapshot ใน poi_unit_cost_thb)
--
-- Hierarchy Compliance (V.6.0+):
--   junction table เก็บข้อมูล per-SKU (ทั้ง leaf + SET ได้) — ไม่เก็บ hierarchy
--   DD-2 leaf guard บังคับใน application layer (Snippet 15 `dinoco_stock_*`)
--   DD-3 shared child: 1 leaf อยู่ภายใต้ maker_id หลายตัวได้ (composite unique)
--   DD-7 auto-expand: create-po ทำที่ application layer ไม่เกี่ยวกับ schema
--
-- =============================================================================
-- TABLE 1: Canonical Junction — wp_dinoco_product_makers
-- =============================================================================

CREATE TABLE IF NOT EXISTS `{$wpdb->prefix}dinoco_product_makers` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  -- Hierarchy key (case-sensitive match with dinoco_sku_relations UPPER pattern)
  `product_sku` VARCHAR(50) NOT NULL COLLATE utf8mb4_bin
    COMMENT 'Uppercase SKU — enforce UPPER() at app layer via b2b_get_product_data()',

  -- Maker link (wp_posts.ID ของ b2f_maker CPT)
  `maker_id` BIGINT UNSIGNED NOT NULL
    COMMENT 'FK to wp_posts.ID where post_type=b2f_maker',

  -- Pricing (NATIVE currency ของ maker — ดู maker_currency field บน b2f_maker CPT)
  `unit_cost` DECIMAL(12,2) NOT NULL DEFAULT 0
    COMMENT 'Unit price ในสกุลของ maker (THB/CNY/USD) — derive THB via exchange rate ตอน create-po',

  `moq` INT UNSIGNED NOT NULL DEFAULT 1
    COMMENT 'Minimum Order Quantity per SKU',

  `lead_time_days` INT UNSIGNED NOT NULL DEFAULT 7
    COMMENT 'Typical lead time from PO submission to delivery',

  -- Shipping costs (per unit, NATIVE currency — THB bypass ทั้งคู่)
  `shipping_land` DECIMAL(10,2) NOT NULL DEFAULT 0
    COMMENT 'Shipping by truck/land (THB per unit) — used for po_shipping_method=land',

  `shipping_sea` DECIMAL(10,2) NOT NULL DEFAULT 0
    COMMENT 'Shipping by sea freight (THB per unit) — used for po_shipping_method=sea',

  -- Lifecycle
  `status` VARCHAR(20) NOT NULL DEFAULT 'active'
    COMMENT 'Allowed: active | discontinued | pending',

  `notes` TEXT DEFAULT NULL
    COMMENT 'Migrated from ACF mp_notes (freetext admin notes)',

  -- Migration safety net (Phase 2-3 rollback support)
  `legacy_cpt_id` BIGINT UNSIGNED DEFAULT NULL
    COMMENT 'Original b2f_maker_product CPT post_id — drop เมื่อ Phase 4',

  -- Audit trail (answer "ใครแก้เมื่อไหร่")
  `created_by` BIGINT UNSIGNED DEFAULT NULL
    COMMENT 'wp_users.ID — creator',

  `updated_by` BIGINT UNSIGNED DEFAULT NULL
    COMMENT 'wp_users.ID — last editor',

  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Soft delete (preserve history for PO references)
  `deleted_at` DATETIME DEFAULT NULL
    COMMENT 'NULL = active row. Soft delete preserves PO integrity.',

  -- === INDEXES ===
  UNIQUE KEY `uq_sku_maker` (`product_sku`, `maker_id`)
    COMMENT '1 SKU × 1 maker × 1 record — composite unique (enforces DD-3 per maker)',

  KEY `idx_maker` (`maker_id`)
    COMMENT 'Filter by maker (Admin Makers tab)',

  KEY `idx_sku` (`product_sku`)
    COMMENT 'Filter by SKU (reverse lookup across makers)',

  KEY `idx_status` (`status`)
    COMMENT 'Filter active/discontinued/pending',

  KEY `idx_maker_status` (`maker_id`, `status`)
    COMMENT 'HOT PATH: Snippet 2 list maker products WHERE maker_id=X AND status=active',

  KEY `idx_legacy_cpt` (`legacy_cpt_id`)
    COMMENT 'Rollback: SELECT legacy_cpt_id for Phase 3 reverse',

  KEY `idx_deleted` (`deleted_at`)
    COMMENT 'Soft delete filter: WHERE deleted_at IS NULL'

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='B2F canonical junction: product × maker × pricing/MOQ/shipping (V10.1)';


-- =============================================================================
-- TABLE 2: Shadow-Write Observations — wp_dinoco_maker_product_observations
-- =============================================================================
--
-- วัตถุประสงค์: บันทึก diff ระหว่าง CPT (b2f_maker_product) กับ junction table
-- ช่วง Phase 2-3 (shadow-write mode) เพื่อ detect drift/race ก่อน cut-over
--
-- ขนาดประมาณการ: 103 records × 10 fields × 2 writes/day = ~2K rows/day
-- 60-day retention → peak ~110K rows = ~50MB (แถบ index)
-- TTL cleanup cron ทุกวัน → ป้องกัน bloat
--

CREATE TABLE IF NOT EXISTS `{$wpdb->prefix}dinoco_maker_product_observations` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  `observed_at` DATETIME NOT NULL
    COMMENT 'Timestamp ของการ observe (diff check or dual-write)',

  `source` VARCHAR(20) NOT NULL
    COMMENT 'Allowed: cpt | junction | diff',

  `sku` VARCHAR(50) COLLATE utf8mb4_bin
    COMMENT 'Product SKU (uppercase enforced)',

  `maker_id` BIGINT UNSIGNED
    COMMENT 'Maker post_id',

  `field_name` VARCHAR(50)
    COMMENT 'Field ที่ observe (unit_cost, moq, shipping_land, ...)',

  `cpt_value` TEXT
    COMMENT 'Value from b2f_maker_product CPT (ACF)',

  `junction_value` TEXT
    COMMENT 'Value from junction table',

  `diff_detected` TINYINT(1) DEFAULT 0
    COMMENT '1 = cpt_value != junction_value (drift alert)',

  KEY `idx_observed` (`observed_at`)
    COMMENT 'Range scan for TTL cleanup + 7-day history queries',

  KEY `idx_diff` (`diff_detected`)
    COMMENT 'Filter rows with drift (WHERE diff_detected=1)',

  KEY `idx_maker_sku` (`maker_id`, `sku`)
    COMMENT 'Per-maker diff lookup (admin dashboard per-maker card)'

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='B2F shadow-write observations: detect CPT vs junction drift (TTL 60 days)';


-- =============================================================================
-- TTL CLEANUP CRON (schedule ใน Snippet 11 B2F Cron Jobs V.2.2+)
-- =============================================================================
--
-- Hook: `b2f_observations_ttl_cron` (daily, 03:00 Asia/Bangkok)
-- Purpose: ป้องกัน observations table bloat (60-day retention)
--
-- PHP equivalent (ใน Snippet 11):
--   add_action('b2f_observations_ttl_cron', function() {
--       global $wpdb;
--       $deleted = $wpdb->query(
--           "DELETE FROM {$wpdb->prefix}dinoco_maker_product_observations
--            WHERE observed_at < DATE_SUB(NOW(), INTERVAL 60 DAY)"
--       );
--       b2b_log("[B2F TTL] Purged {$deleted} observation rows older than 60 days");
--   });
--
-- SQL template (executed by cron):

-- DELETE FROM `{$wpdb->prefix}dinoco_maker_product_observations`
-- WHERE `observed_at` < DATE_SUB(NOW(), INTERVAL 60 DAY);


-- =============================================================================
-- 7-DAY DRIFT HISTORY AGGREGATION (stored in wp_options)
-- =============================================================================
--
-- Rolling bucket stored as wp_option key `b2f_drift_history_7d` (JSON)
-- Updated by audit cron (Snippet 11) — สำหรับ dashboard chart
--
-- Format: [
--   { "date": "2026-04-15", "orphan_count": 12, "stale_count": 4, "virtual_inject": 7 },
--   { "date": "2026-04-14", "orphan_count": 11, "stale_count": 4, "virtual_inject": 6 },
--   ...
-- ]
--
-- Aggregation query (daily rollup):

-- SELECT
--   DATE(`observed_at`) AS day,
--   COUNT(DISTINCT CASE WHEN `field_name` = 'orphan_set' THEN `sku` END) AS orphan_count,
--   COUNT(DISTINCT CASE WHEN `diff_detected` = 1 THEN CONCAT(`maker_id`, '-', `sku`) END) AS stale_count,
--   COUNT(CASE WHEN `source` = 'virtual_inject' THEN 1 END) AS virtual_inject
-- FROM `{$wpdb->prefix}dinoco_maker_product_observations`
-- WHERE `observed_at` >= DATE_SUB(NOW(), INTERVAL 7 DAY)
-- GROUP BY DATE(`observed_at`)
-- ORDER BY day DESC;


-- =============================================================================
-- SCHEMA VERSION MARKER
-- =============================================================================
--
-- เมื่อ migrate จริงให้ set version marker:
--   update_option('b2f_schema_version', '10.1');
--
-- ใช้ใน migration guard:
--   if (version_compare(get_option('b2f_schema_version', '0'), '10.1', '>=')) return;
--

-- END OF B2F-SCHEMA-V10.sql
