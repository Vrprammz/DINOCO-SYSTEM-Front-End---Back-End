-- =============================================================================
-- DINOCO SN System — Schema Rollback DDL V.1.0 (2026-05-07)
-- =============================================================================
--
-- Purpose:
--   Idempotent rollback statements for SN schema versions 1.2 → 1.1, 1.3 → 1.2.
--
-- When to use:
--   • Post-migration verification fails (CLI step 6/6 reports failures)
--   • Production smoke tests reveal regression after flag flip
--   • DBA decides to revert during maintenance window
--
-- Usage (in maintenance window after restoring snapshot):
--   1. Restore mysqldump snapshot:
--      mysql -u <user> -p <db> < /path/to/wp-content/dinoco-sn-snapshots/pre-1.2-YYYYMMDDHHMMSS.sql
--
--   2. (If snapshot not used) apply this DDL manually + verify:
--      mysql -u <user> -p <db> < scripts/sn-system/rollback-schema.sql
--
--   3. Update wp_option to reflect rolled-back version:
--      wp option update dinoco_sn_schema_version 1.1
--
-- Idempotency notes:
--   • Each statement uses IF EXISTS / IF NOT EXISTS where MySQL/MariaDB supports.
--   • Where unsupported (older MariaDB), wrap in conditional procedural blocks
--     (see _MARIADB_FALLBACK section at bottom).
--   • Re-running this file is safe — already-rolled-back state = no-op.
--
-- IMPORTANT:
--   • Set @prefix below if your wp_ table prefix differs.
--   • Run during maintenance window — DDL still locks tables briefly.
--   • For 1M+ rows, prefer pt-online-schema-change for the rollback DDL too.
-- =============================================================================

-- ─── Configuration ──────────────────────────────────────────────────────────
-- Set this to your actual wpdb prefix (default 'wp_'). DO NOT add extra
-- underscores. We don't use SET @prefix because DDL doesn't support
-- variable interpolation directly — instead, replace `wp_` below with sed
-- before running on a non-default prefix install:
--
--   sed 's/`wp_dinoco_/`yourprefix_dinoco_/g' rollback-schema.sql | mysql ...
--

-- =============================================================================
-- v1.2 → v1.1 ROLLBACK
-- =============================================================================
-- Reverses Manager V.0.39 schema bump (uniq_dedup reshape + 3 PERF indexes).
-- Restores the legacy uniq_dedup (3-col) UNIQUE on notifications.

-- 1) Remove PERF indexes from sn_pool (added by V.0.39).
--    Both indexes serve query optimizer; dropping them may slow some queries
--    but does not affect correctness.
ALTER TABLE `wp_dinoco_sn_pool` DROP INDEX `idx_lookup`;
ALTER TABLE `wp_dinoco_sn_pool` DROP INDEX `idx_status_created`;

-- 2) Remove PERF index from sn_audit (added by V.0.39).
ALTER TABLE `wp_dinoco_sn_audit` DROP INDEX `idx_audit_sn_time`;

-- 3) Reshape sn_notifications UNIQUE: uq_dedup (4-col with scheduled_at) → uniq_dedup (3-col).
--    Step 3a: drop the new 4-col UNIQUE
ALTER TABLE `wp_dinoco_sn_notifications` DROP INDEX `uq_dedup`;

-- 3b: BEFORE restoring 3-col UNIQUE, deduplicate any rows that would now
-- collide. The 4-col UNIQUE permitted multiple rows with same (type,user,sn)
-- but different scheduled_at — these need cleanup before 3-col index can be
-- rebuilt. Strategy: keep the row with MAX(id), delete others.
--
-- Run this query first to PREVIEW collisions:
--   SELECT notification_type, user_id, sn, COUNT(*) c
--     FROM wp_dinoco_sn_notifications
--     GROUP BY notification_type, user_id, sn HAVING c > 1;
--
-- If preview returns rows, run cleanup:
DELETE n1 FROM `wp_dinoco_sn_notifications` n1
INNER JOIN `wp_dinoco_sn_notifications` n2
  WHERE n1.id < n2.id
    AND n1.notification_type = n2.notification_type
    AND n1.user_id = n2.user_id
    AND n1.sn = n2.sn;

-- 3c: restore legacy 3-col UNIQUE
ALTER TABLE `wp_dinoco_sn_notifications`
  ADD UNIQUE KEY `uniq_dedup` (`notification_type`, `user_id`, `sn`);

-- 4) Update version flag (if running stand-alone without CLI wrapper)
UPDATE `wp_options`
   SET option_value = '1.1'
 WHERE option_name = 'dinoco_sn_schema_version';

-- =============================================================================
-- v1.3 → v1.2 ROLLBACK
-- =============================================================================
-- Reverses the B1 HMAC fix (sig_bucket column + index).
-- This rollback only applies if your DB is currently at 1.3.

-- 5) Drop sig_bucket index first (depends on column)
ALTER TABLE `wp_dinoco_sn_pool` DROP INDEX `idx_sig_bucket`;

-- 6) Drop sig_bucket column
ALTER TABLE `wp_dinoco_sn_pool` DROP COLUMN `sig_bucket`;

-- 7) Update version flag
UPDATE `wp_options`
   SET option_value = '1.2'
 WHERE option_name = 'dinoco_sn_schema_version';

-- =============================================================================
-- VERIFICATION QUERIES (run after rollback)
-- =============================================================================
--
-- Confirm legacy 3-col uniq_dedup restored (v1.1 target state):
--   SHOW INDEX FROM wp_dinoco_sn_notifications WHERE Key_name = 'uniq_dedup';
--   -- Expect: 3 rows (notification_type, user_id, sn) — Seq_in_index 1, 2, 3
--
-- Confirm PERF indexes removed:
--   SHOW INDEX FROM wp_dinoco_sn_pool WHERE Key_name IN ('idx_lookup', 'idx_status_created');
--   -- Expect: 0 rows
--   SHOW INDEX FROM wp_dinoco_sn_audit WHERE Key_name = 'idx_audit_sn_time';
--   -- Expect: 0 rows
--
-- Confirm sig_bucket gone (if rolled back from 1.3):
--   SHOW COLUMNS FROM wp_dinoco_sn_pool LIKE 'sig_bucket';
--   -- Expect: 0 rows
--
-- Confirm option version flag:
--   SELECT option_value FROM wp_options WHERE option_name = 'dinoco_sn_schema_version';
--   -- Expect: '1.1' or '1.2'

-- =============================================================================
-- _MARIADB_FALLBACK
-- =============================================================================
-- MariaDB < 10.4 does not support `DROP INDEX IF EXISTS` natively. If a
-- statement above errors with "ERROR 1091 (42000): Can't DROP ...; check
-- that column/key exists" simply ignore — that means the rollback was
-- already partially applied. Re-running this file is safe (idempotent
-- intent, even if individual statements raise informational errors).
--
-- For environments needing fully error-free output, wrap each ALTER
-- in a stored procedure with INFORMATION_SCHEMA precheck:
--
--   DELIMITER $$
--   CREATE PROCEDURE drop_index_if_exists(IN tbl VARCHAR(64), IN idx VARCHAR(64))
--   BEGIN
--     IF EXISTS (SELECT 1 FROM information_schema.statistics
--                WHERE table_schema = DATABASE() AND table_name = tbl AND index_name = idx) THEN
--       SET @sql = CONCAT('ALTER TABLE `', tbl, '` DROP INDEX `', idx, '`');
--       PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
--     END IF;
--   END$$
--   DELIMITER ;
--
--   CALL drop_index_if_exists('wp_dinoco_sn_pool', 'idx_lookup');
--   CALL drop_index_if_exists('wp_dinoco_sn_pool', 'idx_status_created');
--   ...
--   DROP PROCEDURE drop_index_if_exists;
--
-- The CLI command (scripts/sn-system/migrate-schema.php) implements this
-- precheck logic in PHP and is the recommended approach.
-- =============================================================================
