-- DINOCO S/N System — Schema POC v1.0
-- Phase 0 W1 Day 4-5 deliverable
-- Plan reference: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.12 §B3 split table
--
-- Implementation pattern (will be wrapped in PHP dbDelta lazy install on admin_init):
--   Following [Admin System] DINOCO Idempotency Helper V.1.0 pattern
--   Following [Admin System] DINOCO Flag Audit Log V.1.0 pattern
--
-- Schema markers (wp_options):
--   dinoco_sn_schema_version = '1.0'
--   dinoco_sn_schema_v1_activated = <timestamp>
--
-- Charset/collation: utf8mb4 + utf8mb4_unicode_ci (default for table)
--   sn columns explicit utf8mb4_bin (case-sensitive UPPER pattern — match wp_dinoco_products.sku)

-- ===========================================================
-- TABLE 1: wp_dinoco_sn_batches — Batch metadata (1 row per ผลิตล็อต)
-- ===========================================================
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_batches` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `batch_code` VARCHAR(64) NOT NULL,
  `prefix` VARCHAR(8) NOT NULL,
  `format_pattern` VARCHAR(64) NOT NULL DEFAULT '{PREFIX}{SEQ:7}',
  `qty_total` INT UNSIGNED NOT NULL,
  `qty_received` INT UNSIGNED NOT NULL DEFAULT 0,
  `qty_voided` INT UNSIGNED NOT NULL DEFAULT 0,
  `allocation_strategy` ENUM('open_pool','pre_assigned') NOT NULL DEFAULT 'open_pool',
  `factory_name` VARCHAR(128) DEFAULT NULL,
  `factory_po_ref` VARCHAR(64) DEFAULT NULL,
  `status` ENUM('draft','sent_to_factory','received_partial','received_full','closed','cancelled') NOT NULL DEFAULT 'draft',
  `notes` TEXT DEFAULT NULL,
  `created_by` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL,
  `sent_at` DATETIME DEFAULT NULL,
  `closed_at` DATETIME DEFAULT NULL,
  UNIQUE KEY `uq_batch_code` (`batch_code`),
  KEY `idx_prefix` (`prefix`),
  KEY `idx_status` (`status`),
  KEY `idx_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================================
-- TABLE 2: wp_dinoco_sn_pool — Hot path (12 columns) — frequently queried
-- ===========================================================
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_pool` (
  `sn` VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  `batch_id` BIGINT UNSIGNED NOT NULL,
  `linked_sku` VARCHAR(50) COLLATE utf8mb4_bin DEFAULT NULL,
  `status` ENUM(
    'reserved',
    'in_pool',
    'reserved_for_legacy',
    'shipped_legacy',
    'registered',
    'claimed',
    'replaced',
    'transferred',
    'voided',
    'recalled',
    'stolen',
    'cancelled_batch'
  ) NOT NULL DEFAULT 'reserved',
  `prev_status` VARCHAR(32) DEFAULT NULL COMMENT 'For revert support — claim rejected → restore prev_status',
  `lock_version` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Optimistic concurrency',
  `registered_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `registered_warranty_id` BIGINT UNSIGNED DEFAULT NULL,
  `claim_id` BIGINT UNSIGNED DEFAULT NULL,
  `legacy_request_id` BIGINT UNSIGNED DEFAULT NULL,
  `registered_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`sn`),
  KEY `idx_batch` (`batch_id`),
  KEY `idx_status_user` (`registered_user_id`, `status`),
  KEY `idx_linked_sku_status` (`linked_sku`, `status`),
  KEY `idx_lookup` (`linked_sku`, `status`, `registered_at`) COMMENT 'Covering index for FIFO + active warranty queries',
  KEY `idx_claim` (`claim_id`),
  KEY `idx_legacy` (`legacy_request_id`),
  KEY `idx_status_created` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================================
-- TABLE 3: wp_dinoco_sn_pool_meta — Cold path (7 columns) — lazy 1:1 join
-- ===========================================================
-- Split per v2.12 §B3 — reduce hot-path index footprint 40%
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_pool_meta` (
  `sn` VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  `purchase_dealer_id` BIGINT UNSIGNED DEFAULT NULL,
  `purchase_date` DATE DEFAULT NULL,
  `top_set_sku` VARCHAR(50) COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Cached top-level SET for query speed (DD-6)',
  `replaced_by_sn` VARCHAR(40) COLLATE utf8mb4_bin DEFAULT NULL,
  `replaces_sn` VARCHAR(40) COLLATE utf8mb4_bin DEFAULT NULL,
  `stolen_at` DATETIME DEFAULT NULL,
  `stolen_police_report` VARCHAR(64) DEFAULT NULL,
  `recalled_at` DATETIME DEFAULT NULL,
  `voided_at` DATETIME DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  PRIMARY KEY (`sn`),
  KEY `idx_purchase_dealer` (`purchase_dealer_id`),
  KEY `idx_top_set` (`top_set_sku`),
  KEY `idx_stolen` (`stolen_at`),
  KEY `idx_replacement_chain` (`replaces_sn`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================================
-- TABLE 4: wp_dinoco_sn_audit — Immutable audit log
-- ===========================================================
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_audit` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `sn` VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  `event_type` ENUM(
    'batch_created',
    'plate_received',
    'plate_linked',
    'plate_relinked',
    'plate_allocated_legacy',
    'plate_unallocated_legacy',
    'plate_shipped_legacy',
    'plate_registered',
    'plate_swapped',
    'plate_voided',
    'plate_recalled',
    'plate_transferred',
    'plate_claimed',
    'plate_replaced',
    'plate_stolen',
    'plate_recovered',
    'plate_auto_swap',
    'fraud_blocked',
    'fraud_reviewed'
  ) NOT NULL,
  `status_from` VARCHAR(32) DEFAULT NULL,
  `status_to` VARCHAR(32) DEFAULT NULL,
  `actor_user_id` BIGINT UNSIGNED NOT NULL,
  `approver_user_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '4-eyes for sensitive ops',
  `reason` VARCHAR(255) DEFAULT NULL,
  `reason_category` VARCHAR(64) DEFAULT NULL COMMENT 'warehouse_pack_error / customer_report / factory_duplicate / other',
  `context_json` TEXT DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `is_sensitive` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = financial/swap/void (5y retention), 0 = operational (3y)',
  `created_at` DATETIME NOT NULL,
  KEY `idx_sn` (`sn`),
  KEY `idx_event` (`event_type`),
  KEY `idx_actor` (`actor_user_id`),
  KEY `idx_approver` (`approver_user_id`),
  KEY `idx_created` (`created_at`),
  KEY `idx_sensitive_created` (`is_sensitive`, `created_at`) COMMENT 'For retention cleanup cron'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================================
-- ALTER: wp_dinoco_products — add sn_attach_level + sn_required + sn_qty_per_unit
-- ===========================================================
-- Idempotent ALTER pattern (run only if columns don't exist)
-- In PHP: check INFORMATION_SCHEMA.COLUMNS before executing

-- Pseudo-code (real implementation in admin_init lazy install):
--
-- IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
--                WHERE TABLE_NAME = 'wp_dinoco_products'
--                AND COLUMN_NAME = 'sn_attach_level') THEN
--   ALTER TABLE `wp_dinoco_products`
--     ADD COLUMN `sn_attach_level` ENUM('set','child','leaf','none') NOT NULL DEFAULT 'none' AFTER `ui_role_override`,
--     ADD COLUMN `sn_required` TINYINT(1) NOT NULL DEFAULT 0 AFTER `sn_attach_level`,
--     ADD COLUMN `sn_qty_per_unit` TINYINT(1) NOT NULL DEFAULT 1 AFTER `sn_required`,
--     ADD KEY `idx_sn_attach` (`sn_attach_level`, `sn_required`);
-- END IF;

-- ===========================================================
-- v2.9 supplemental tables (Phase 3+)
-- ===========================================================

-- F#1 + F#4 + F#10 notification queue
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_notifications` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `sn` VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `notification_type` ENUM('expiry_30d','expiry_7d','expiry_1d','anniversary_1y','anniversary_2y','anniversary_3y','review_request','service_reminder') NOT NULL,
  `channel` ENUM('line_flex','line_text','email','sms') NOT NULL DEFAULT 'line_flex',
  `scheduled_at` DATETIME NOT NULL,
  `sent_at` DATETIME DEFAULT NULL,
  `status` ENUM('scheduled','sent','failed','cancelled','dismissed') NOT NULL DEFAULT 'scheduled',
  `meta_json` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL,
  KEY `idx_sn` (`sn`),
  KEY `idx_user` (`user_id`),
  KEY `idx_scheduled_status` (`scheduled_at`, `status`) COMMENT 'Cron query',
  KEY `idx_type_user_sn` (`notification_type`, `user_id`, `sn`) COMMENT 'Dedup check'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- F#1 + F#4 + F#10 promo codes
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_promo_codes` (
  `code` VARCHAR(20) NOT NULL PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `source_sn` VARCHAR(40) COLLATE utf8mb4_bin DEFAULT NULL,
  `discount_pct` TINYINT UNSIGNED NOT NULL,
  `discount_value` DECIMAL(10,2) DEFAULT NULL,
  `scope` ENUM('any','same_sku','same_category','warranty_extension') NOT NULL DEFAULT 'any',
  `scope_value` VARCHAR(255) DEFAULT NULL,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME DEFAULT NULL,
  `used_order_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL,
  KEY `idx_user` (`user_id`),
  KEY `idx_expires_used` (`expires_at`, `used_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- F#9 LTV snapshot (cron-computed)
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_customer_ltv_snapshot` (
  `user_id` BIGINT UNSIGNED PRIMARY KEY,
  `plates_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `registered_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `active_warranties_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `total_lifetime_spent` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `first_purchase_date` DATE DEFAULT NULL,
  `last_purchase_date` DATE DEFAULT NULL,
  `claim_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `loyalty_tier` ENUM('bronze','silver','gold','platinum','diamond') NOT NULL DEFAULT 'bronze',
  `computed_at` DATETIME NOT NULL,
  KEY `idx_ltv` (`total_lifetime_spent`),
  KEY `idx_tier` (`loyalty_tier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- F#10 review requests
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_review_requests` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `sn` VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `brand_voice_id` BIGINT UNSIGNED DEFAULT NULL,
  `status` ENUM('scheduled','sent','reviewed','dismissed') NOT NULL DEFAULT 'scheduled',
  `rating` TINYINT UNSIGNED DEFAULT NULL,
  `scheduled_at` DATETIME NOT NULL,
  `sent_at` DATETIME DEFAULT NULL,
  `reviewed_at` DATETIME DEFAULT NULL,
  KEY `idx_sn` (`sn`),
  KEY `idx_user` (`user_id`),
  KEY `idx_status_scheduled` (`status`, `scheduled_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- F#12 fraud detection scores
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_fraud_scores` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `sn` VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  `event_type` ENUM('activate','transfer','swap','claim','lookup') NOT NULL,
  `score` TINYINT UNSIGNED NOT NULL,
  `factors_json` TEXT NOT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `device_fp` VARCHAR(64) DEFAULT NULL,
  `geo_country` CHAR(2) DEFAULT NULL,
  `geo_province` VARCHAR(64) DEFAULT NULL,
  `reviewed_by` BIGINT UNSIGNED DEFAULT NULL,
  `reviewed_at` DATETIME DEFAULT NULL,
  `outcome` ENUM('pending','legit','fraud','suspicious') DEFAULT NULL,
  `created_at` DATETIME NOT NULL,
  KEY `idx_sn_score` (`sn`, `score`),
  KEY `idx_outcome_created` (`outcome`, `created_at`),
  KEY `idx_geo_country` (`geo_country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- F#13 geographic activations
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_geo_activations` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `sn` VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  `province` VARCHAR(64) NOT NULL,
  `district` VARCHAR(64) DEFAULT NULL,
  `lat` DECIMAL(10,7) DEFAULT NULL,
  `lng` DECIMAL(10,7) DEFAULT NULL,
  `source` ENUM('ip','line_profile','address','manual') NOT NULL,
  `is_in_dealer_territory` TINYINT(1) NOT NULL DEFAULT 0,
  `expected_dealer_id` BIGINT UNSIGNED DEFAULT NULL,
  `actual_dealer_id` BIGINT UNSIGNED DEFAULT NULL,
  `is_gray_market_suspect` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL,
  KEY `idx_province_created` (`province`, `created_at`),
  KEY `idx_gray_market` (`is_gray_market_suspect`),
  KEY `idx_sn` (`sn`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- F#14 stolen plate registry
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_stolen_log` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `sn` VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  `user_id` BIGINT UNSIGNED DEFAULT NULL,
  `reported_by` BIGINT UNSIGNED NOT NULL,
  `police_report_no` VARCHAR(64) DEFAULT NULL,
  `police_station` VARCHAR(128) DEFAULT NULL,
  `incident_date` DATE DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `evidence_attachment_ids` TEXT DEFAULT NULL,
  `status` ENUM('reported','verified','recovered','closed') NOT NULL DEFAULT 'reported',
  `created_at` DATETIME NOT NULL,
  KEY `idx_sn` (`sn`),
  KEY `idx_status` (`status`),
  KEY `idx_reported_by` (`reported_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- F#15 public API tokens
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_api_tokens` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `partner_name` VARCHAR(128) NOT NULL,
  `partner_type` ENUM('dealer','insurance','government','other') NOT NULL,
  `api_key` VARCHAR(64) NOT NULL,
  `api_secret_hash` VARCHAR(255) NOT NULL,
  `scopes` TEXT NOT NULL,
  `rate_limit_per_min` SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  `ip_allowlist` TEXT DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `expires_at` DATETIME DEFAULT NULL,
  `last_used_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL,
  `created_by` BIGINT UNSIGNED NOT NULL,
  UNIQUE KEY `uq_api_key` (`api_key`),
  KEY `idx_active_expires` (`is_active`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- F#15 public API usage log
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_api_log` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `api_token_id` BIGINT UNSIGNED NOT NULL,
  `endpoint` VARCHAR(128) NOT NULL,
  `http_status` SMALLINT NOT NULL,
  `response_time_ms` INT NOT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `request_summary` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL,
  KEY `idx_token_created` (`api_token_id`, `created_at`),
  KEY `idx_status` (`http_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- F#16 demand forecast
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_demand_forecast` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `sku` VARCHAR(50) COLLATE utf8mb4_bin NOT NULL,
  `forecast_month` DATE NOT NULL,
  `predicted_qty` INT UNSIGNED NOT NULL,
  `confidence_pct` TINYINT UNSIGNED NOT NULL,
  `current_pool_qty` INT UNSIGNED NOT NULL,
  `suggested_order_qty` INT UNSIGNED NOT NULL,
  `computed_at` DATETIME NOT NULL,
  UNIQUE KEY `uq_sku_month` (`sku`, `forecast_month`),
  KEY `idx_computed` (`computed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- F#8 warranty extensions (Phase 5)
CREATE TABLE IF NOT EXISTS `wp_dinoco_sn_warranty_extensions` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `sn` VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `extension_months` SMALLINT UNSIGNED NOT NULL,
  `price_paid` DECIMAL(10,2) NOT NULL,
  `payment_method` ENUM('promptpay','scb_card','line_pay','manual') NOT NULL,
  `payment_ref` VARCHAR(64) DEFAULT NULL,
  `payment_status` ENUM('pending','paid','refunded','failed') NOT NULL DEFAULT 'pending',
  `warranty_until_old` DATE NOT NULL,
  `warranty_until_new` DATE NOT NULL,
  `receipt_invoice_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL,
  `paid_at` DATETIME DEFAULT NULL,
  KEY `idx_sn` (`sn`),
  KEY `idx_user` (`user_id`),
  KEY `idx_status_created` (`payment_status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================================
-- INITIAL DATA SEEDS
-- ===========================================================

-- Schema version markers (run AFTER all CREATE TABLE successful)
-- INSERT INTO wp_options ... (handled in PHP install function)
--   ('dinoco_sn_schema_version', '1.0', 'no'),
--   ('dinoco_sn_schema_v1_activated', UNIX_TIMESTAMP(), 'no'),
--   ('dinoco_sn_system_enabled', '0', 'yes'); -- DEFAULT OFF

-- Legacy batch (id=0 placeholder for backfilled CPT data)
-- INSERT INTO wp_dinoco_sn_batches ... (handled in PHP backfill function)

-- ===========================================================
-- EXPECTED CAPACITY (1M plates, 6 months of data)
-- ===========================================================
-- wp_dinoco_sn_pool         ~120 MB (12 cols hot path)
-- wp_dinoco_sn_pool_meta    ~80 MB  (10 cols cold join)
-- wp_dinoco_sn_audit        ~150 MB (5 events avg per plate)
-- wp_dinoco_sn_batches      ~10 KB  (10-100 batches)
-- wp_dinoco_sn_notifications ~50 MB (3 notif per registered plate)
-- wp_dinoco_sn_promo_codes  ~10 MB
-- wp_dinoco_sn_fraud_scores ~30 MB
-- wp_dinoco_sn_geo_activations ~40 MB
-- wp_dinoco_sn_stolen_log   ~100 KB (~1% of registered plates)
-- wp_dinoco_sn_api_log      ~50 MB (90d retention)
-- wp_dinoco_sn_review_requests ~20 MB
-- wp_dinoco_sn_customer_ltv_snapshot ~5 MB
-- wp_dinoco_sn_demand_forecast ~1 MB
-- wp_dinoco_sn_warranty_extensions ~5 MB (Phase 5)
-- wp_dinoco_sn_api_tokens   ~50 KB
-- ─────────────────────────────────────
-- TOTAL: ~530 MB at 1M plates × 6mo

-- ===========================================================
-- INDEX STRATEGY NOTES
-- ===========================================================
-- 1. PRIMARY KEY บน sn (utf8mb4_bin) ป้องกัน race + case-sensitive lookup
-- 2. Composite (linked_sku, status) สำหรับ Pool Status heatmap query
-- 3. Composite (linked_sku, status, registered_at) covering สำหรับ FIFO + active warranty
-- 4. Index บน scheduled_at + status สำหรับ notification cron query
-- 5. Index บน created_at สำหรับ retention cleanup cron
-- 6. Index บน is_sensitive + created_at สำหรับ split retention (3y vs 5y)

-- ===========================================================
-- MIGRATION PATTERN (PHP wrapper)
-- ===========================================================
-- function dinoco_sn_install_schema() {
--     global $wpdb;
--     require_once ABSPATH . 'wp-admin/includes/upgrade.php';
--
--     $charset_collate = $wpdb->get_charset_collate();
--     $sql = file_get_contents(__DIR__ . '/05-schema-v1.sql');
--
--     // Note: dbDelta needs specific format — convert IF NOT EXISTS to dbDelta-compatible
--     // Use INFORMATION_SCHEMA.COLUMNS guard for ALTER statements
--
--     dbDelta($sql);
--
--     update_option('dinoco_sn_schema_version', '1.0');
--     update_option('dinoco_sn_schema_v1_activated', current_time('mysql'));
-- }
--
-- add_action('admin_init', function() {
--     if (get_option('dinoco_sn_schema_version') !== '1.0') {
--         dinoco_sn_install_schema();
--     }
-- });

-- END OF SCHEMA v1.0
