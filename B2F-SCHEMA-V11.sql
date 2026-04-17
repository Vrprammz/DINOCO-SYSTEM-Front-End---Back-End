-- =============================================================================
-- B2F SCHEMA V11.0 — V.7.0 Order Intent + Admin Display Mode (Phase 4 Classification)
-- =============================================================================
--
-- วัตถุประสงค์ (Purpose):
--   ขยาย canonical junction `wp_dinoco_product_makers` (V10.1) ให้เก็บ
--   production_mode + admin_display_mode + confirmation_status สำหรับ V.7.0
--   LIFF B2F E-Catalog Admin Ordering UX Rework
--
--   3 ระดับการสั่ง (admin-chosen via LIFF card tap):
--     - full_set     (🟣 ชุดเต็ม)       → SKU production_mode = set_assembled
--     - sub_unit     (🟠 แยกชุด)        → SKU production_mode = sub_unit
--     - single_leaf  (⚪ ชิ้นเดี่ยว)     → SKU production_mode = single
--     - hidden       (🟠 DINOCO ประกอบ) → SKU production_mode = cross_factory_assembly
--                                          + admin_display_mode = as_parts (auto-hide)
--
-- สถานะ Phase 4 (Current — V.7.0 IMPLEMENTATION):
--   ✋ ไฟล์นี้ = spec reference สำหรับ ALTER statements
--   ✋ Actual DDL ทำงานผ่าน Audit snippet V.3.3 (inline — WP Code Snippets ไม่ sync scripts/)
--   ✋ Idempotent re-run: audit snippet ใช้ INFORMATION_SCHEMA เช็คก่อน ALTER ทุก column
--
-- Execution Flow (ผ่าน Audit V.3.3 inline):
--   1. b2f_audit_check_mysql_version() → log warning ถ้า < 8.0.16 (non-blocking)
--   2. update_option('b2f_phase4_migration_in_progress', true)  ← CRIT-4 lock flag
--   3. mysqldump wp_dinoco_product_makers → wp-content/b2f-backups/ (chmod 0700 + .htaccess deny)
--   4. STEP 0: ALTER observations.source ENUM (add 'classification_change')
--   5. STEP 1: ALTER junction — 6 new columns + 2 composite indexes
--   6. STEP 2: ALTER ADD CONSTRAINT (MySQL 8.0.16+ only — silently ignored on lower)
--   7. STEP 3: Update schema version markers
--   8. Phase 4 classification loop (b2f_phase4_run_classification_migration)
--   9. delete_option('b2f_phase4_migration_in_progress') + schedule replay cron
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DESIGN DECISIONS (audit findings)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ✅ ไม่มี `pair_rule` / `pair_expected_qty` column
--     → ใช้ `production_mode` ENUM แทน (simpler) — `sub_unit` ครอบคลุม pair case
--     → sub_unit จะคำนวณ expected_qty ที่ app layer จาก sku_relations (L+R = 2)
--
--  ✅ ไม่มี `dinoco_cross_factory_assembly` table แยก
--     → cross_factory_assembly = ENUM value ของ `production_mode`
--     → admin จัดการผ่าน `admin_display_mode` = 'as_parts' (auto-hide SET parent)
--     → DD-2 stock system (compute_hierarchy_stock = MIN of leaves) assemble SET ให้เองอยู่แล้ว
--
--  ✅ `missing_leaves_count` denormalize (MED-3)
--     → avoid N × O(walk sku_relations) per request
--     → update on CPT save hook + sku_relations change (Snippet 15 V.7.0+)
--
--  ✅ Composite index `idx_maker_prod_display` (HIGH-5)
--     → replaces low-selectivity single-column indexes (3 ENUM values + 95% default)
--     → covers 2 hot query patterns: filter by mode + filter by display
--
--  ✅ CHECK constraints (MED-2 + CRIT-2)
--     → MySQL 8.0.16+ enforces at DB layer
--     → Lower versions silently ignored — PHP validator (Snippet 2 V.11.0) = primary defense
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Rollback (V11 → V10.1):
--   DROP COLUMN = **destructive** (loses data). Prefer soft rollback:
--     1. Flip feature flag: update_option('b2f_flag_read_from_junction', false);
--     2. update_option('b2f_schema_version', '10.1');  -- marker rollback
--     3. LIFF/Admin code reads CPT (V.10.5-compatible path)
--     4. New columns ยังคงอยู่ใน DB (harmless — ไม่มีใครอ่าน)
--   ถ้าต้อง DROP COLUMN จริงๆ:
--     ALTER TABLE wp_dinoco_product_makers
--       DROP CONSTRAINT chk_mode_display,
--       DROP CONSTRAINT chk_confirmed_consistency,
--       DROP INDEX idx_maker_prod_display,
--       DROP INDEX idx_maker_confirmation,
--       DROP COLUMN production_mode,
--       DROP COLUMN confirmation_status,
--       DROP COLUMN admin_display_mode,
--       DROP COLUMN missing_leaves_count,
--       DROP COLUMN confirmed_by,
--       DROP COLUMN confirmed_at;
--     ALTER TABLE wp_dinoco_maker_product_observations
--       MODIFY COLUMN source ENUM('cpt','junction','diff') NOT NULL;
--     update_option('b2f_schema_version', '10.1');
--     delete_option('b2f_schema_v11_activated');
-- =============================================================================


-- =============================================================================
-- STEP 0: Extend observations ENUM (MED-1)
-- =============================================================================
--
-- Purpose: เพิ่ม `classification_change` value เพื่อ log audit trail เมื่อ admin
--          เปลี่ยน production_mode / confirmation_status / admin_display_mode
--          ผ่าน 4 new endpoints ใน /dinoco-b2f-audit/v1/ (V.3.3)
--
-- Source values:
--   cpt                   — CPT save (Phase 2 dual-write)
--   junction              — Junction direct write (Phase 3 cut-over path)
--   diff                  — Hourly diff cron (Snippet 11 V.2.2 `b2f_junction_diff_cron`)
--   classification_change — NEW V11.0: admin manual classification update (V.7.0)
--
-- Idempotency: MODIFY COLUMN ENUM ต้องใส่ทุก value เดิม + value ใหม่
--              (ลำดับ string ต้องตรงกัน ห้ามสลับ)

ALTER TABLE `{$wpdb->prefix}dinoco_maker_product_observations`
  MODIFY COLUMN `source` ENUM(
      'cpt',
      'junction',
      'diff',
      'classification_change'
  ) NOT NULL
  COMMENT 'V11.0: Extended — classification_change = admin manual update (V.7.0)';


-- =============================================================================
-- STEP 1: Main junction ALTER — 6 new columns + 2 composite indexes
-- =============================================================================
--
-- Column order (AFTER clauses preserve readable layout after ALTER):
--   status → production_mode → confirmation_status → admin_display_mode
--   → missing_leaves_count → confirmed_by → confirmed_at → notes (existing)
--
-- Notes on each column:
--
--   production_mode ENUM:
--     - set_assembled         : 🟣 Maker ประกอบครบใน 1 โรงงาน (leaves ครบ)
--     - sub_unit              : 🟠 มีลูก + มีพ่อ (ชุดบน/ล่าง, Pannier L+R pair)
--     - single                : ⚪ leaf (ไม่มีลูก) — default สำหรับ migration fallback
--     - cross_factory_assembly: 🟠 DINOCO รวมหลายโรงงาน (missing leaves > 0)
--                               → auto set admin_display_mode = 'as_parts'
--
--   confirmation_status ENUM:
--     - confirmed    : admin review OK (legacy CPT migration / admin manual confirm)
--     - auto_synced  : orphan SET auto-added via Phase 2 backfill (รอ admin review)
--
--   admin_display_mode ENUM:
--     - auto     : ตาม production_mode (DEFAULT) — LIFF renders 🟣/🟠/⚪ ปกติ
--     - as_set   : บังคับโชว์เป็น SET (admin override — ต่อให้ missing leaves ก็โชว์)
--     - as_parts : ซ่อน SET → โชว์ children แทน (cross_factory auto + admin bulk ungroup)
--
--   missing_leaves_count SMALLINT:
--     - Denormalized cache (MED-3) — update on:
--       * CPT save hook (Snippet 0.5 V.1.2 dual-write)
--       * sku_relations change (Snippet 15 V.7.0 `b2f_recompute_missing_leaves`)
--       * Phase 4 migration run
--     - 0 = leaves ครบ, > 0 = cross-factory candidate

ALTER TABLE `{$wpdb->prefix}dinoco_product_makers`
  ADD COLUMN `production_mode` ENUM(
      'set_assembled',
      'sub_unit',
      'single',
      'cross_factory_assembly'
  ) NOT NULL DEFAULT 'single'
    COMMENT 'V11.0: การผลิตจริงของ maker (hierarchy-derived)'
    AFTER `status`,

  ADD COLUMN `confirmation_status` ENUM(
      'confirmed',
      'auto_synced'
  ) NOT NULL DEFAULT 'auto_synced'
    COMMENT 'V11.0: admin review status (confirmed = admin reviewed, auto = Phase 2 orphan)'
    AFTER `production_mode`,

  ADD COLUMN `admin_display_mode` ENUM(
      'auto',
      'as_set',
      'as_parts'
  ) NOT NULL DEFAULT 'auto'
    COMMENT 'V11.0: admin override — as_parts = ซ่อน SET โชว์ children แทน'
    AFTER `confirmation_status`,

  ADD COLUMN `missing_leaves_count` SMALLINT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'V11.0 MED-3: denormalized cache, updated on CPT save + sku_relations change'
    AFTER `admin_display_mode`,

  ADD COLUMN `confirmed_by` BIGINT UNSIGNED DEFAULT NULL
    COMMENT 'V11.0: wp_users.ID ของ admin ที่กด confirm (NULL = auto_synced)',

  ADD COLUMN `confirmed_at` DATETIME DEFAULT NULL
    COMMENT 'V11.0: timestamp admin confirmed (NULL = auto_synced)',

  -- === COMPOSITE INDEXES (HIGH-5: replace low-selectivity single-column indexes) ===
  ADD KEY `idx_maker_prod_display` (`maker_id`, `production_mode`, `admin_display_mode`)
    COMMENT 'V11.0 HOT PATH: LIFF filter by maker + production_mode + display_mode',

  ADD KEY `idx_maker_confirmation` (`maker_id`, `confirmation_status`)
    COMMENT 'V11.0: Admin Audit dashboard filter unconfirmed orphans per maker';


-- =============================================================================
-- STEP 2: CHECK constraints (MySQL 8.0.16+ enforces; lower silently ignored)
-- =============================================================================
--
-- CRIT-2 DECISION: User ไม่อัพ MySQL — PHP validator (Snippet 2 V.11.0) = primary defense
--
-- Guard rules:
--   chk_mode_display            — production_mode='single' ห้ามมี admin_display_mode='as_parts'
--                                 (logical: ไม่มี parts ให้ซ่อน SET)
--
--   chk_confirmed_consistency   — ถ้า confirmation_status='confirmed' ต้องมี
--                                 confirmed_by + confirmed_at ครบ
--                                 (auto_synced = ไม่ต้องมี)
--
-- PHP validator equivalent (Snippet 2 V.11.0 ใน `b2f_validate_junction_classification()`):
--   if ($production_mode === 'single' && $admin_display_mode === 'as_parts') {
--       return new WP_Error(B2F_ERR_CHECK_CONSTRAINT, 'single+as_parts invalid');
--   }
--   if ($confirmation_status === 'confirmed' && (!$confirmed_by || !$confirmed_at)) {
--       return new WP_Error(B2F_ERR_CHECK_CONSTRAINT, 'confirmed requires by+at');
--   }
--
-- Audit dashboard (Audit V.3.3) shows `b2f_audit_check_mysql_version()` result:
--   { "version": "8.0.27", "check_active": true }   ← constraints enforced
--   { "version": "5.7.42", "check_active": false }  ← PHP validator only (safe)

ALTER TABLE `{$wpdb->prefix}dinoco_product_makers`
  ADD CONSTRAINT `chk_mode_display`
    CHECK (NOT (`production_mode` = 'single' AND `admin_display_mode` = 'as_parts')),
  ADD CONSTRAINT `chk_confirmed_consistency`
    CHECK (
      `confirmation_status` = 'auto_synced'
      OR (`confirmed_by` IS NOT NULL AND `confirmed_at` IS NOT NULL)
    );


-- =============================================================================
-- STEP 3: Schema version markers (update wp_options)
-- =============================================================================
--
-- Migration guard (Audit V.3.3):
--   if (version_compare(get_option('b2f_schema_version', '0'), '11.0', '>=')) return;
--
-- Rollback marker flip (see top rollback notes):
--   update_option('b2f_schema_version', '10.1');  -- soft rollback (columns remain)

UPDATE `{$wpdb->options}`
   SET `option_value` = '11.0'
 WHERE `option_name` = 'b2f_schema_version';

-- Insert activation timestamp (new marker for V11)
INSERT INTO `{$wpdb->options}` (`option_name`, `option_value`, `autoload`)
VALUES ('b2f_schema_v11_activated', CURRENT_TIMESTAMP, 'no')
ON DUPLICATE KEY UPDATE `option_value` = CURRENT_TIMESTAMP;


-- =============================================================================
-- POST-ALTER VALIDATION QUERIES (run manually after migration)
-- =============================================================================
--
-- 1. Verify columns exist:
--    DESCRIBE wp_dinoco_product_makers;
--    → expect 6 new columns (production_mode, confirmation_status,
--      admin_display_mode, missing_leaves_count, confirmed_by, confirmed_at)
--
-- 2. Verify indexes:
--    SHOW INDEX FROM wp_dinoco_product_makers
--    WHERE Key_name IN ('idx_maker_prod_display', 'idx_maker_confirmation');
--
-- 3. Verify CHECK constraints (MySQL 8.0.16+ only):
--    SELECT CONSTRAINT_NAME, CHECK_CLAUSE
--      FROM information_schema.CHECK_CONSTRAINTS
--     WHERE CONSTRAINT_SCHEMA = DATABASE()
--       AND TABLE_NAME = CONCAT(DATABASE(), '_dinoco_product_makers');
--
-- 4. Verify observations ENUM:
--    SHOW COLUMNS FROM wp_dinoco_maker_product_observations WHERE Field = 'source';
--    → Type should contain 'classification_change'
--
-- 5. Verify schema version:
--    SELECT option_value FROM wp_options WHERE option_name = 'b2f_schema_version';
--    → '11.0'


-- =============================================================================
-- MIGRATION CLASSIFICATION MATRIX (reference — executed by Phase 4 loop)
-- =============================================================================
--
-- Classification pseudocode (inline ใน Audit V.3.3 `b2f_phase4_run_classification_migration`):
--
--   FOR EACH junction row WHERE deleted_at IS NULL:
--     has_children   = count(sku_relations[sku]) > 0
--     has_parent     = sku ใน any parent's children array
--     legacy_cpt     = legacy_cpt_id > 0
--     missing_leaves = compute_missing_leaves(sku, maker_id)
--
--     ┌────────────────────────────────┬──────────────────────────┬────────────────────┬──────────────────┐
--     │ Condition                      │ production_mode          │ admin_display_mode │ confirmation     │
--     ├────────────────────────────────┼──────────────────────────┼────────────────────┼──────────────────┤
--     │ has_children AND missing > 0   │ cross_factory_assembly   │ as_parts (auto)    │ auto_synced      │
--     │ has_children AND has_parent    │ sub_unit                 │ auto               │ legacy?confirmed │
--     │ has_children AND NOT has_parent│ set_assembled            │ auto               │ legacy?confirmed │
--     │ NO children (leaf)             │ single                   │ auto               │ legacy?confirmed │
--     └────────────────────────────────┴──────────────────────────┴────────────────────┴──────────────────┘
--
--   Idempotent guard (preserve admin choice):
--     UPDATE junction SET ...
--     WHERE id=? AND
--           (confirmation_status='auto_synced' OR confirmed_at IS NULL)
--     -- admin-confirmed rows NOT overwritten


-- END OF B2F-SCHEMA-V11.sql
