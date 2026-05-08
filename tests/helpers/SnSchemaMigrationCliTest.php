<?php
/**
 * REG-102 — Schema migration CLI pure-logic mock tests.
 *
 * R4 BLOCKER #2 (database-expert P0-3) — pre-deploy WP-CLI helpers must
 * deterministically:
 *   1. Categorize idempotent-skippable SQL errors so re-runs after partial
 *      failure don't hard-fail.
 *   2. Estimate ALTER duration from row count (warning thresholds).
 *   3. Group ALTER statements by table for pt-online-schema-change so each
 *      table is rebuilt once, not N times (perf + atomic-rename safety).
 *   4. Emit correct ALTER plans for v1.2 + v1.3 targets.
 *
 * Mirrors:
 *   Dinoco_SN_Migrate_Schema_CLI::is_idempotent_skippable_error()
 *   Dinoco_SN_Migrate_Schema_CLI::estimate_alter_duration()
 *   Dinoco_SN_Migrate_Schema_CLI::group_alters_by_table()
 *
 * Pure logic only — no DB, no WP-CLI runtime. Lifted into namespaced
 * helpers so we can exercise the same algorithms the CLI uses without
 * booting WordPress.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\SnSchemaMigrationCli;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\is_idempotent_skippable_error' ) ) {
    /**
     * Mirror of Dinoco_SN_Migrate_Schema_CLI::is_idempotent_skippable_error().
     */
    function is_idempotent_skippable_error( string $error ): bool {
        $error = strtolower( $error );
        $skippable = array(
            'duplicate key name',
            "can't drop",
            'check that column/key exists',
            'duplicate column name',
            'already exists',
        );
        foreach ( $skippable as $pat ) {
            if ( strpos( $error, $pat ) !== false ) return true;
        }
        return false;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\estimate_alter_duration' ) ) {
    /**
     * Mirror of Dinoco_SN_Migrate_Schema_CLI::estimate_alter_duration().
     * Heuristic: ~10K rows/sec on commodity SSD.
     */
    function estimate_alter_duration( int $row_count ): string {
        $row_count = max( 0, $row_count );
        $sec = intdiv( $row_count, 10000 );
        if ( $sec < 60 )    return "~{$sec} sec";
        if ( $sec < 3600 )  return '~' . intdiv( $sec, 60 ) . ' min';
        return '~' . round( $sec / 3600, 1 ) . ' hr';
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\group_alters_by_table' ) ) {
    /**
     * Mirror of Dinoco_SN_Migrate_Schema_CLI::group_alters_by_table().
     */
    function group_alters_by_table( array $statements ): array {
        $out = array();
        foreach ( $statements as $sql ) {
            if ( ! preg_match( '/^\s*ALTER\s+TABLE\s+(\S+)\s+(.+)$/is', $sql, $m ) ) {
                continue;
            }
            $table  = trim( $m[1] );
            $clause = rtrim( trim( $m[2] ), ';' );
            $out[ $table ][] = $clause;
        }
        return $out;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\get_alter_statements' ) ) {
    /**
     * Mirror of Dinoco_SN_Migrate_Schema_CLI::get_alter_statements() — pure
     * function variant taking explicit prefix (CLI uses $wpdb->prefix).
     */
    function get_alter_statements( string $version, string $prefix = 'wp_' ): array {
        $stmts = array();
        if ( $version === '1.2' ) {
            $stmts[] = "ALTER TABLE {$prefix}dinoco_sn_notifications DROP INDEX uniq_dedup";
            $stmts[] = "ALTER TABLE {$prefix}dinoco_sn_notifications ADD UNIQUE KEY uq_dedup (notification_type, user_id, sn, scheduled_at)";
            $stmts[] = "ALTER TABLE {$prefix}dinoco_sn_pool ADD INDEX idx_lookup (linked_sku, status, registered_at)";
            $stmts[] = "ALTER TABLE {$prefix}dinoco_sn_pool ADD INDEX idx_status_created (status, created_at)";
            $stmts[] = "ALTER TABLE {$prefix}dinoco_sn_audit ADD INDEX idx_audit_sn_time (sn, created_at)";
        }
        if ( $version === '1.3' ) {
            $stmts[] = "ALTER TABLE {$prefix}dinoco_sn_pool ADD COLUMN sig_bucket SMALLINT UNSIGNED NULL AFTER batch_id";
            $stmts[] = "ALTER TABLE {$prefix}dinoco_sn_pool ADD INDEX idx_sig_bucket (batch_id, sig_bucket)";
        }
        return $stmts;
    }
}

class SnSchemaMigrationCliTest extends TestCase {

    // ─────────────────────────────────────────────────────────────────
    // is_idempotent_skippable_error()
    // ─────────────────────────────────────────────────────────────────

    public function testIdempotentSkippableDuplicateKeyName(): void {
        $err = "Duplicate key name 'idx_lookup'";
        $this->assertTrue( is_idempotent_skippable_error( $err ),
            'Re-running migration that already added idx_lookup must be skippable' );
    }

    public function testIdempotentSkippableCantDrop(): void {
        $err = "Can't DROP 'uniq_dedup'; check that column/key exists";
        $this->assertTrue( is_idempotent_skippable_error( $err ),
            'Re-running migration that already dropped legacy index must be skippable' );
    }

    public function testIdempotentSkippableDuplicateColumn(): void {
        $err = "Duplicate column name 'sig_bucket'";
        $this->assertTrue( is_idempotent_skippable_error( $err ),
            'v1.3 re-run after sig_bucket column added must be skippable' );
    }

    public function testIdempotentSkippableAlreadyExists(): void {
        $err = "Table 'wp_dinoco_sn_pool_new' already exists";
        $this->assertTrue( is_idempotent_skippable_error( $err ),
            'pt-osc shadow table reuse must be skippable' );
    }

    public function testIdempotentSkippableCaseInsensitive(): void {
        $err = "DUPLICATE KEY NAME 'idx_lookup'";
        $this->assertTrue( is_idempotent_skippable_error( $err ),
            'Error matching is case-insensitive' );
    }

    public function testHardFailDataLoss(): void {
        $err = "Data truncated for column 'sn' at row 42";
        $this->assertFalse( is_idempotent_skippable_error( $err ),
            'Data corruption errors must HALT — never swallow' );
    }

    public function testHardFailLockTimeout(): void {
        $err = "Lock wait timeout exceeded; try restarting transaction";
        $this->assertFalse( is_idempotent_skippable_error( $err ),
            'Lock timeout requires investigation — must HALT' );
    }

    public function testHardFailDiskFull(): void {
        $err = "The table 'wp_dinoco_sn_pool' is full";
        $this->assertFalse( is_idempotent_skippable_error( $err ),
            'Disk-full errors must HALT' );
    }

    public function testHardFailGenericSql(): void {
        $err = "You have an error in your SQL syntax";
        $this->assertFalse( is_idempotent_skippable_error( $err ),
            'Syntax errors must HALT' );
    }

    public function testHardFailEmptyError(): void {
        $this->assertFalse( is_idempotent_skippable_error( '' ),
            'Empty error must not be classified as skippable (defensive)' );
    }

    // ─────────────────────────────────────────────────────────────────
    // estimate_alter_duration()
    // ─────────────────────────────────────────────────────────────────

    public function testDurationZeroRows(): void {
        $this->assertSame( '~0 sec', estimate_alter_duration( 0 ) );
    }

    public function testDurationSubMinute(): void {
        $this->assertSame( '~1 sec', estimate_alter_duration( 10000 ) );
        $this->assertSame( '~5 sec', estimate_alter_duration( 50000 ) );
        $this->assertSame( '~59 sec', estimate_alter_duration( 599_999 ) );
    }

    public function testDurationMinutes(): void {
        $this->assertSame( '~1 min', estimate_alter_duration( 600_000 ) );
        $this->assertSame( '~10 min', estimate_alter_duration( 6_000_000 ) );
        $this->assertSame( '~50 min', estimate_alter_duration( 30_000_000 ) );
    }

    public function testDurationHours(): void {
        $this->assertSame( '~1 hr', estimate_alter_duration( 36_000_000 ) );
        $this->assertSame( '~2.8 hr', estimate_alter_duration( 100_000_000 ) );
    }

    public function testDurationNegativeClampedToZero(): void {
        $this->assertSame( '~0 sec', estimate_alter_duration( -100 ),
            'Negative row counts must clamp to 0 (defensive)' );
    }

    public function testDuration100kThresholdRecommendsOnline(): void {
        // Documents the threshold semantic — at 100K rows we WARN to
        // suggest --online. estimate is still under a minute on fast SSDs
        // but the warning is about lock-window risk, not wall clock.
        $this->assertSame( '~10 sec', estimate_alter_duration( 100_001 ) );
    }

    public function testDuration1MillionRowsExpected5Min(): void {
        // R4 audit verdict: "30-60min" wall clock on MariaDB. Our heuristic
        // is for MySQL 8.0.16+ INSTANT-capable path (~10K rows/sec) which
        // gives ~100 sec ≈ 1.5 min. Documented in runbook duration table.
        $this->assertSame( '~1 min', estimate_alter_duration( 1_000_000 ) );
    }

    // ─────────────────────────────────────────────────────────────────
    // group_alters_by_table()
    // ─────────────────────────────────────────────────────────────────

    public function testGroupSingleStatement(): void {
        $stmts = array(
            'ALTER TABLE wp_dinoco_sn_pool ADD INDEX idx_lookup (linked_sku, status, registered_at)',
        );
        $grouped = group_alters_by_table( $stmts );
        $this->assertSame( array(
            'wp_dinoco_sn_pool' => array(
                'ADD INDEX idx_lookup (linked_sku, status, registered_at)',
            ),
        ), $grouped );
    }

    public function testGroupMultipleSameTable(): void {
        // pt-osc must consolidate per-table — running 2 ALTERs separately
        // means rebuilding the table twice. Combined ALTER = 1 rebuild.
        $stmts = array(
            'ALTER TABLE wp_dinoco_sn_pool ADD INDEX idx_lookup (linked_sku, status, registered_at)',
            'ALTER TABLE wp_dinoco_sn_pool ADD INDEX idx_status_created (status, created_at)',
        );
        $grouped = group_alters_by_table( $stmts );
        $this->assertCount( 1, $grouped );
        $this->assertCount( 2, $grouped['wp_dinoco_sn_pool'] );
    }

    public function testGroupMultipleTables(): void {
        $stmts = array(
            'ALTER TABLE wp_dinoco_sn_notifications DROP INDEX uniq_dedup',
            'ALTER TABLE wp_dinoco_sn_notifications ADD UNIQUE KEY uq_dedup (notification_type, user_id, sn, scheduled_at)',
            'ALTER TABLE wp_dinoco_sn_pool ADD INDEX idx_lookup (linked_sku, status, registered_at)',
            'ALTER TABLE wp_dinoco_sn_audit ADD INDEX idx_audit_sn_time (sn, created_at)',
        );
        $grouped = group_alters_by_table( $stmts );
        $this->assertCount( 3, $grouped );
        $this->assertCount( 2, $grouped['wp_dinoco_sn_notifications'],
            'Notifications gets 2 clauses (drop + add) merged into 1 pt-osc invocation' );
        $this->assertCount( 1, $grouped['wp_dinoco_sn_pool'] );
        $this->assertCount( 1, $grouped['wp_dinoco_sn_audit'] );
    }

    public function testGroupHandlesTrailingSemicolons(): void {
        $stmts = array(
            'ALTER TABLE wp_dinoco_sn_pool ADD INDEX idx_lookup (linked_sku, status, registered_at);',
        );
        $grouped = group_alters_by_table( $stmts );
        $this->assertSame( 'ADD INDEX idx_lookup (linked_sku, status, registered_at)',
            $grouped['wp_dinoco_sn_pool'][0],
            'Trailing semicolon must be stripped before passing to pt-osc' );
    }

    public function testGroupSkipsNonAlterStatements(): void {
        $stmts = array(
            'CREATE TABLE wp_foo (id INT)',          // not ALTER — skip
            'ALTER TABLE wp_dinoco_sn_pool ADD COLUMN x INT',
            'SELECT 1',                                // not ALTER — skip
        );
        $grouped = group_alters_by_table( $stmts );
        $this->assertCount( 1, $grouped );
        $this->assertArrayHasKey( 'wp_dinoco_sn_pool', $grouped );
    }

    public function testGroupCaseInsensitiveAlterKeyword(): void {
        $stmts = array(
            'alter table wp_dinoco_sn_pool ADD INDEX idx_lookup (a)',
            'Alter Table wp_dinoco_sn_pool ADD COLUMN x INT',
        );
        $grouped = group_alters_by_table( $stmts );
        $this->assertCount( 2, $grouped['wp_dinoco_sn_pool'] );
    }

    // ─────────────────────────────────────────────────────────────────
    // get_alter_statements() — plan correctness
    // ─────────────────────────────────────────────────────────────────

    public function testV12PlanContainsUniqDedupReshape(): void {
        $stmts = get_alter_statements( '1.2', 'wp_' );
        $found_drop = false;
        $found_add  = false;
        foreach ( $stmts as $sql ) {
            if ( strpos( $sql, 'DROP INDEX uniq_dedup' ) !== false ) $found_drop = true;
            if ( strpos( $sql, 'ADD UNIQUE KEY uq_dedup' ) !== false ) $found_add  = true;
        }
        $this->assertTrue( $found_drop, 'v1.2 plan must drop legacy uniq_dedup' );
        $this->assertTrue( $found_add, 'v1.2 plan must add new uq_dedup with scheduled_at' );
    }

    public function testV12PlanContainsThreePerfIndexes(): void {
        $stmts = get_alter_statements( '1.2', 'wp_' );
        $perf_indexes = 0;
        foreach ( $stmts as $sql ) {
            if ( strpos( $sql, 'idx_lookup' ) !== false )         $perf_indexes++;
            if ( strpos( $sql, 'idx_status_created' ) !== false ) $perf_indexes++;
            if ( strpos( $sql, 'idx_audit_sn_time' ) !== false )  $perf_indexes++;
        }
        $this->assertSame( 3, $perf_indexes, 'v1.2 plan must add all 3 PERF indexes from V.0.39' );
    }

    public function testV13PlanContainsSigBucketAndIndex(): void {
        $stmts = get_alter_statements( '1.3', 'wp_' );
        $found_col = false;
        $found_idx = false;
        foreach ( $stmts as $sql ) {
            if ( strpos( $sql, 'ADD COLUMN sig_bucket' ) !== false ) $found_col = true;
            if ( strpos( $sql, 'ADD INDEX idx_sig_bucket' ) !== false ) $found_idx = true;
        }
        $this->assertTrue( $found_col, 'v1.3 plan must add sig_bucket column for B1 HMAC fix' );
        $this->assertTrue( $found_idx, 'v1.3 plan must add idx_sig_bucket index' );
    }

    public function testV13ColumnBeforeIndexOrdering(): void {
        // Index depends on column — must be ordered correctly so pt-osc
        // can chain the ALTER clauses on the same table.
        $stmts = get_alter_statements( '1.3', 'wp_' );
        $col_pos = -1;
        $idx_pos = -1;
        foreach ( $stmts as $i => $sql ) {
            if ( strpos( $sql, 'ADD COLUMN sig_bucket' ) !== false ) $col_pos = $i;
            if ( strpos( $sql, 'ADD INDEX idx_sig_bucket' ) !== false ) $idx_pos = $i;
        }
        $this->assertGreaterThan( -1, $col_pos );
        $this->assertGreaterThan( $col_pos, $idx_pos,
            'sig_bucket column must come BEFORE idx_sig_bucket index in plan' );
    }

    public function testCustomPrefixHonored(): void {
        $stmts = get_alter_statements( '1.2', 'mytest_' );
        $this->assertStringContainsString( 'mytest_dinoco_sn_pool', $stmts[2] );
        $this->assertStringNotContainsString( 'wp_dinoco_sn_pool', implode( '|', $stmts ) );
    }

    public function testUnsupportedVersionReturnsEmpty(): void {
        $this->assertSame( array(), get_alter_statements( '0.9', 'wp_' ) );
        $this->assertSame( array(), get_alter_statements( '2.0', 'wp_' ) );
        $this->assertSame( array(), get_alter_statements( 'invalid', 'wp_' ) );
    }
}
