-- =============================================================================
-- DINOCO Test Schema (Phase 5 — V.1.0)
-- =============================================================================
--
-- Source of truth for DINOCO custom tables in integration test runtime.
-- Mirrors production schema from:
--   * [B2B] Snippet 15 (lines 246-628) — products, stock_transactions, warehouses, slip_log, audit_log
--   * FEATURE-SPEC-B2B-BACKORDER-2026-04-16.md sec 4.4-4.5 — order_attempt_log, bo_queue
--   * B2F-SCHEMA-V11.sql — product_makers, maker_product_observations
--
-- Verification: scripts/verify-schema-parity.php diffs this file against
-- production sources on every CI run. Test fails if drift detected.
--
-- Conventions:
--   * `{PREFIX}` placeholder replaced at boot with `$wpdb->prefix`
--   * IF NOT EXISTS — idempotent re-run safe
--   * No CHECK constraints (test runtime may run on MySQL < 8.0.16)
--   * Indexes simplified vs prod where they don't affect correctness
--
-- Tables created (10):
--   1. dinoco_products              — product master
--   2. dinoco_stock_transactions    — stock change ledger
--   3. dinoco_warehouses            — warehouse list
--   4. dinoco_warehouse_stock       — per-warehouse stock
--   5. dinoco_slip_log              — slip processing audit
--   6. dinoco_audit_log             — unified forensic log (Pillar 3)
--   7. dinoco_order_attempt_log     — BO place-order audit
--   8. dinoco_bo_queue              — backorder tracking
--   9. dinoco_product_makers        — B2F canonical junction
--  10. dinoco_maker_product_observations — B2F shadow-write diff log
-- =============================================================================


-- 1. dinoco_products ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `{PREFIX}dinoco_products` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `sku` VARCHAR(50) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `subtitle` VARCHAR(255) DEFAULT '',
    `category` VARCHAR(100) DEFAULT '',
    `image_url` VARCHAR(500) DEFAULT '',
    `base_price` DECIMAL(10,2) DEFAULT 0,
    `price_silver` DECIMAL(10,2) DEFAULT 0,
    `price_gold` DECIMAL(10,2) DEFAULT 0,
    `price_platinum` DECIMAL(10,2) DEFAULT 0,
    `price_diamond` DECIMAL(10,2) DEFAULT 0,
    `warranty_years` INT DEFAULT 2,
    `stock_status` ENUM('in_stock','out_of_stock') DEFAULT 'in_stock',
    `b2b_discount_percent` DECIMAL(5,2) DEFAULT 0,
    `boxes_per_unit` INT DEFAULT 1,
    `units_per_box` INT DEFAULT 1,
    `min_order_qty` INT DEFAULT 1,
    `oos_eta_date` DATE DEFAULT NULL,
    `is_active` TINYINT(1) DEFAULT 1,
    `b2b_visible` TINYINT(1) NOT NULL DEFAULT 1,
    `stock_qty` INT NOT NULL DEFAULT 0,
    `low_stock_threshold` INT UNSIGNED NOT NULL DEFAULT 10,
    `reorder_point` INT UNSIGNED NOT NULL DEFAULT 5,
    `manual_hold` TINYINT(1) NOT NULL DEFAULT 0,
    `manual_hold_reason` VARCHAR(255) DEFAULT NULL,
    `compatible_models` TEXT DEFAULT NULL,
    `oos_timestamp` INT DEFAULT NULL,
    `oos_duration_hours` INT DEFAULT NULL,
    `stock_updated_at` DATETIME DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `idx_sku` (`sku`),
    KEY `idx_category` (`category`),
    KEY `idx_active_stock` (`is_active`, `stock_status`, `stock_qty`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. dinoco_stock_transactions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS `{PREFIX}dinoco_stock_transactions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `sku` VARCHAR(50) NOT NULL,
    `type` VARCHAR(30) NOT NULL,
    `qty_change` INT NOT NULL,
    `qty_before` INT NOT NULL DEFAULT 0,
    `qty_after` INT NOT NULL DEFAULT 0,
    `reference_type` VARCHAR(30) DEFAULT NULL,
    `reference_id` BIGINT UNSIGNED DEFAULT NULL,
    `reason` VARCHAR(500) DEFAULT '',
    `user_id` BIGINT UNSIGNED DEFAULT NULL,
    `batch_id` VARCHAR(50) DEFAULT NULL,
    `warehouse_id` BIGINT UNSIGNED DEFAULT NULL,
    `unit_cost_thb` DECIMAL(12,2) DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_sku_created` (`sku`, `created_at`),
    KEY `idx_created` (`created_at`),
    KEY `idx_ref` (`reference_type`, `reference_id`),
    KEY `idx_type_sku` (`type`, `sku`, `unit_cost_thb`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. dinoco_warehouses ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `{PREFIX}dinoco_warehouses` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `address` TEXT DEFAULT NULL,
    `is_default` TINYINT(1) NOT NULL DEFAULT 0,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `idx_code` (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. dinoco_warehouse_stock ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS `{PREFIX}dinoco_warehouse_stock` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `warehouse_id` BIGINT UNSIGNED NOT NULL,
    `sku` VARCHAR(50) NOT NULL,
    `stock_qty` INT NOT NULL DEFAULT 0,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `idx_wh_sku` (`warehouse_id`, `sku`),
    KEY `idx_sku` (`sku`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 5. dinoco_slip_log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `{PREFIX}dinoco_slip_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `group_id` VARCHAR(100) NOT NULL DEFAULT '',
    `message_id` VARCHAR(64) NOT NULL DEFAULT '',
    `user_id` VARCHAR(64) NOT NULL DEFAULT '',
    `dist_id` BIGINT UNSIGNED DEFAULT NULL,
    `slip_code` VARCHAR(16) NOT NULL DEFAULT '',
    `amount` DECIMAL(12,2) DEFAULT NULL,
    `trans_ref` VARCHAR(100) NOT NULL DEFAULT '',
    `sender_name` VARCHAR(200) NOT NULL DEFAULT '',
    `result_status` VARCHAR(32) NOT NULL DEFAULT '',
    `error_code` VARCHAR(32) NOT NULL DEFAULT '',
    `error_msg` VARCHAR(500) NOT NULL DEFAULT '',
    `http_code` SMALLINT UNSIGNED DEFAULT NULL,
    `processing_time_ms` INT UNSIGNED DEFAULT NULL,
    `retry_count` TINYINT UNSIGNED DEFAULT 0,
    `image_hash` VARCHAR(64) DEFAULT NULL,
    `image_mime` VARCHAR(20) DEFAULT NULL,
    `slip2go_response` MEDIUMTEXT DEFAULT NULL,
    `replayed_from_log_id` BIGINT UNSIGNED DEFAULT NULL,
    `image_path` VARCHAR(255) DEFAULT NULL,
    `review_decision` VARCHAR(32) DEFAULT NULL,
    `reviewed_at` DATETIME DEFAULT NULL,
    `reviewed_by` BIGINT UNSIGNED DEFAULT NULL,
    `ai_classifier_decision` VARCHAR(16) DEFAULT NULL,
    `ai_classifier_confidence` FLOAT DEFAULT NULL,
    `ai_classifier_reason` VARCHAR(255) DEFAULT NULL,
    `ai_classifier_at` DATETIME DEFAULT NULL,
    `credit_note_amount` DECIMAL(14,2) DEFAULT NULL,
    `credit_note_issued_at` DATETIME DEFAULT NULL,
    `credit_note_reason` VARCHAR(500) DEFAULT NULL,
    `credit_note_by` BIGINT UNSIGNED DEFAULT NULL,
    `credit_note_audit_id` BIGINT UNSIGNED DEFAULT NULL,
    `ai_correct` TINYINT(1) DEFAULT NULL,
    `ai_correctness_source` VARCHAR(32) DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_group_created` (`group_id`, `created_at`),
    KEY `idx_created` (`created_at`),
    KEY `idx_result_created` (`result_status`, `created_at`),
    KEY `idx_transref` (`trans_ref`),
    KEY `idx_image_hash` (`image_hash`),
    KEY `idx_review` (`review_decision`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 6. dinoco_audit_log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `{PREFIX}dinoco_audit_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `event_type` VARCHAR(64) NOT NULL DEFAULT '',
    `actor_type` VARCHAR(32) NOT NULL DEFAULT '',
    `actor_id` VARCHAR(64) NOT NULL DEFAULT '',
    `target_type` VARCHAR(32) NOT NULL DEFAULT '',
    `target_id` VARCHAR(64) NOT NULL DEFAULT '',
    `amount` DECIMAL(14,2) DEFAULT NULL,
    `delta_before` VARCHAR(255) DEFAULT NULL,
    `delta_after` VARCHAR(255) DEFAULT NULL,
    `related_log_id` BIGINT UNSIGNED DEFAULT NULL,
    `context_json` TEXT DEFAULT NULL,
    `error_msg` VARCHAR(500) DEFAULT NULL,
    `success` TINYINT(1) NOT NULL DEFAULT 1,
    `request_id` VARCHAR(64) NOT NULL DEFAULT '',
    `ip` VARCHAR(45) NOT NULL DEFAULT '',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_event_created` (`event_type`, `created_at`),
    KEY `idx_target` (`target_type`, `target_id`, `created_at`),
    KEY `idx_actor` (`actor_type`, `actor_id`, `created_at`),
    KEY `idx_related` (`related_log_id`),
    KEY `idx_request` (`request_id`),
    KEY `idx_created` (`created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 7. dinoco_order_attempt_log ────────────────────────────────────
CREATE TABLE IF NOT EXISTS `{PREFIX}dinoco_order_attempt_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `distributor_id` BIGINT UNSIGNED NOT NULL,
    `group_id` VARCHAR(64) NOT NULL,
    `action` ENUM('place_order','cancel','split','undo_split','bo_fulfill') NOT NULL,
    `order_id` BIGINT UNSIGNED DEFAULT NULL,
    `items_hash` VARCHAR(64) DEFAULT NULL,
    `total_qty` INT UNSIGNED DEFAULT NULL,
    `total_value` DECIMAL(12,2) DEFAULT NULL,
    `result` ENUM('accepted','rejected','rate_limit','dup','error') NOT NULL,
    `rejection_code` VARCHAR(32) DEFAULT NULL,
    `ip` VARCHAR(45) DEFAULT NULL,
    `user_agent` VARCHAR(128) DEFAULT NULL,
    `created_at` DATETIME NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_dist_time` (`distributor_id`, `created_at`),
    KEY `idx_action` (`action`, `created_at`),
    KEY `idx_order` (`order_id`),
    KEY `idx_created` (`created_at`),
    KEY `idx_dist_action_time` (`distributor_id`, `action`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 8. dinoco_bo_queue ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `{PREFIX}dinoco_bo_queue` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_id` BIGINT UNSIGNED NOT NULL,
    `item_index` INT UNSIGNED NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `qty_bo` INT UNSIGNED NOT NULL,
    `eta` DATE DEFAULT NULL,
    `status` ENUM('pending','ready','fulfilled','cancelled') NOT NULL DEFAULT 'pending',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `resolved_at` DATETIME DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_order_item` (`order_id`, `item_index`),
    KEY `idx_sku_status` (`sku`, `status`),
    KEY `idx_status_created` (`status`, `created_at`),
    KEY `idx_status_resolved` (`status`, `resolved_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 9. dinoco_product_makers (B2F canonical junction, V11.0) ────────
CREATE TABLE IF NOT EXISTS `{PREFIX}dinoco_product_makers` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `product_sku` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `maker_id` BIGINT UNSIGNED NOT NULL,
    `unit_cost` DECIMAL(12,2) DEFAULT 0,
    `moq` INT UNSIGNED DEFAULT 1,
    `lead_time_days` INT UNSIGNED DEFAULT 0,
    `shipping_land` DECIMAL(10,2) DEFAULT 0,
    `shipping_sea` DECIMAL(10,2) DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `production_mode` ENUM('set_assembled','sub_unit','single','cross_factory_assembly') NOT NULL DEFAULT 'single',
    `confirmation_status` ENUM('confirmed','auto_synced') NOT NULL DEFAULT 'auto_synced',
    `admin_display_mode` ENUM('auto','as_set','as_parts') NOT NULL DEFAULT 'auto',
    `missing_leaves_count` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `confirmed_by` BIGINT UNSIGNED DEFAULT NULL,
    `confirmed_at` DATETIME DEFAULT NULL,
    `notes` TEXT DEFAULT NULL,
    `legacy_cpt_id` BIGINT UNSIGNED DEFAULT NULL,
    `created_by` BIGINT UNSIGNED DEFAULT NULL,
    `updated_by` BIGINT UNSIGNED DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted_at` DATETIME DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_sku_maker` (`product_sku`, `maker_id`),
    KEY `idx_maker` (`maker_id`),
    KEY `idx_sku` (`product_sku`),
    KEY `idx_status` (`status`),
    KEY `idx_maker_status` (`maker_id`, `status`),
    KEY `idx_legacy_cpt` (`legacy_cpt_id`),
    KEY `idx_deleted` (`deleted_at`),
    KEY `idx_maker_prod_display` (`maker_id`, `production_mode`, `admin_display_mode`),
    KEY `idx_maker_confirmation` (`maker_id`, `confirmation_status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 10. dinoco_maker_product_observations (shadow-write diff log) ──
CREATE TABLE IF NOT EXISTS `{PREFIX}dinoco_maker_product_observations` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `observed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `source` ENUM('cpt','junction','diff','classification_change') NOT NULL,
    `sku` VARCHAR(50) NOT NULL,
    `maker_id` BIGINT UNSIGNED NOT NULL,
    `field_name` VARCHAR(50) NOT NULL DEFAULT '',
    `cpt_value` VARCHAR(255) DEFAULT NULL,
    `junction_value` VARCHAR(255) DEFAULT NULL,
    `diff_detected` TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_observed` (`observed_at`),
    KEY `idx_sku_maker` (`sku`, `maker_id`),
    KEY `idx_diff` (`diff_detected`, `observed_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
