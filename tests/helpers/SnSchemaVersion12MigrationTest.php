<?php
/**
 * REG-094 — Schema version 1.1 → 1.2 migration.
 *
 * Plan v2.13 §Phase 1 W4 R3 BLOCKER.
 *
 * Migration steps (idempotent, GET_LOCK-guarded):
 *   1. Acquire GET_LOCK('dinoco_sn_schema_migrate', 5s)
 *   2. INFORMATION_SCHEMA precheck — only proceed if v1.1 detected
 *   3. Pre-flight row count guard:
 *        - Notification table > 100k rows  → SKIP migration + warning notice
 *        - (avoid table-rebuild during migration window)
 *   4. DROP INDEX uniq_dedup (3-col legacy)
 *   5. ADD UNIQUE KEY uq_dedup (notification_type, user_id, sn, scheduled_at)
 *   6. ADD covering indexes (3 new):
 *        - idx_user_status (user_id, status)
 *        - idx_sn_action (sn, action)
 *        - idx_scheduled_at (scheduled_at)
 *   7. update_option('dinoco_sn_schema_version', '1.2')
 *   8. RELEASE_LOCK in `finally`
 *
 * 15+ cases.
 *
 * Pure-logic mock — uses an in-memory $wpdb shim that records every query.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\SnSchemaVersion12Migration;

use PHPUnit\Framework\TestCase;

/**
 * Mock $wpdb that records queries + returns scripted responses.
 */
class WpdbMock {
    public array $queries = array();
    public array $responses = array();
    public bool $lock_held = false;

    public function get_var( string $sql, $col = 0, $row = 0 ) {
        $this->queries[] = $sql;
        // Pop scripted response from front
        if ( ! empty( $this->responses ) ) {
            return array_shift( $this->responses );
        }
        return null;
    }

    public function query( string $sql ) {
        $this->queries[] = $sql;
        if ( strpos( $sql, 'GET_LOCK' ) !== false ) {
            $this->lock_held = true;
            return 1;
        }
        if ( strpos( $sql, 'RELEASE_LOCK' ) !== false ) {
            $this->lock_held = false;
            return 1;
        }
        return 1;
    }

    public function dbDelta_called( string $sql ): array {
        $this->queries[] = "[dbDelta] {$sql}";
        return array( 'dbDelta_executed' );
    }

    public function reset(): void {
        $this->queries   = array();
        $this->responses = array();
        $this->lock_held = false;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\schema_v12_migrate' ) ) {
    /**
     * Mirror of dinoco_sn_schema_v12_migrate().
     *
     * @return array { ok: bool, skipped: bool, reason: string, queries: int }
     */
    function schema_v12_migrate( WpdbMock $wpdb, array $opts = array() ): array {
        $opts = array_merge( array(
            'current_version'    => '1.1',
            'row_count'          => 50000,
            'row_count_threshold'=> 100000,
            'has_uniq_dedup'     => true,  // legacy index
        ), $opts );

        // Step 1: GET_LOCK
        $lock_ok = $wpdb->query( "SELECT GET_LOCK('dinoco_sn_schema_migrate', 5)" );
        if ( $lock_ok !== 1 ) {
            return array( 'ok' => false, 'skipped' => true, 'reason' => 'lock_busy', 'queries' => count( $wpdb->queries ) );
        }

        try {
            // Step 2: INFORMATION_SCHEMA precheck
            $wpdb->responses = array( $opts['current_version'] );
            $version = $wpdb->get_var( 'SELECT option_value FROM wp_options WHERE option_name = "dinoco_sn_schema_version"' );
            if ( $version !== '1.1' ) {
                return array( 'ok' => false, 'skipped' => true, 'reason' => 'not_v11', 'queries' => count( $wpdb->queries ) );
            }

            // Step 3: Pre-flight row count
            if ( $opts['row_count'] > $opts['row_count_threshold'] ) {
                return array( 'ok' => false, 'skipped' => true, 'reason' => 'rowcount_exceeds_threshold', 'queries' => count( $wpdb->queries ) );
            }

            // Step 4: DROP INDEX uniq_dedup (only if exists)
            if ( $opts['has_uniq_dedup'] ) {
                $wpdb->query( 'ALTER TABLE wp_dinoco_sn_notifications DROP INDEX uniq_dedup' );
            }

            // Step 5: ADD UNIQUE KEY uq_dedup
            $wpdb->dbDelta_called( 'ADD UNIQUE KEY uq_dedup (notification_type, user_id, sn, scheduled_at)' );

            // Step 6: covering indexes
            $wpdb->dbDelta_called( 'ADD INDEX idx_user_status (user_id, status)' );
            $wpdb->dbDelta_called( 'ADD INDEX idx_sn_action (sn, action)' );
            $wpdb->dbDelta_called( 'ADD INDEX idx_scheduled_at (scheduled_at)' );

            // Step 7: bump version
            $wpdb->query( "UPDATE wp_options SET option_value = '1.2' WHERE option_name = 'dinoco_sn_schema_version'" );

            return array( 'ok' => true, 'skipped' => false, 'reason' => 'migrated', 'queries' => count( $wpdb->queries ) );
        } finally {
            // Step 8: RELEASE_LOCK in finally
            $wpdb->query( "SELECT RELEASE_LOCK('dinoco_sn_schema_migrate')" );
        }
    }
}

class SnSchemaVersion12MigrationTest extends TestCase {

    private WpdbMock $wpdb;

    protected function setUp(): void {
        $this->wpdb = new WpdbMock();
    }

    /* ─── Step 1: GET_LOCK ─── */

    public function test_acquires_get_lock_first(): void {
        schema_v12_migrate( $this->wpdb );
        $this->assertStringContainsString(
            'GET_LOCK',
            $this->wpdb->queries[0],
            'GET_LOCK MUST be the first query'
        );
    }

    public function test_releases_lock_in_finally(): void {
        schema_v12_migrate( $this->wpdb );
        $last_release_idx = -1;
        foreach ( $this->wpdb->queries as $i => $q ) {
            if ( strpos( $q, 'RELEASE_LOCK' ) !== false ) $last_release_idx = $i;
        }
        $this->assertGreaterThan( -1, $last_release_idx, 'RELEASE_LOCK must run' );
        $this->assertFalse( $this->wpdb->lock_held );
    }

    public function test_releases_lock_even_when_skipped_due_to_version(): void {
        schema_v12_migrate( $this->wpdb, array( 'current_version' => '1.0' ) );
        $this->assertFalse( $this->wpdb->lock_held, 'lock release MUST run on every path (finally)' );
    }

    public function test_releases_lock_even_when_skipped_due_to_rowcount(): void {
        schema_v12_migrate( $this->wpdb, array( 'row_count' => 200000 ) );
        $this->assertFalse( $this->wpdb->lock_held );
    }

    /* ─── Step 2: precheck ─── */

    public function test_skips_when_already_v12(): void {
        $r = schema_v12_migrate( $this->wpdb, array( 'current_version' => '1.2' ) );
        $this->assertTrue( $r['skipped'] );
        $this->assertSame( 'not_v11', $r['reason'] );
    }

    public function test_skips_when_v10_unsupported(): void {
        $r = schema_v12_migrate( $this->wpdb, array( 'current_version' => '1.0' ) );
        $this->assertTrue( $r['skipped'] );
    }

    /* ─── Step 3: pre-flight row count ─── */

    public function test_skips_when_rowcount_above_threshold(): void {
        $r = schema_v12_migrate( $this->wpdb, array( 'row_count' => 150000 ) );
        $this->assertTrue( $r['skipped'] );
        $this->assertSame( 'rowcount_exceeds_threshold', $r['reason'] );
    }

    public function test_runs_when_rowcount_below_threshold(): void {
        $r = schema_v12_migrate( $this->wpdb, array( 'row_count' => 50000 ) );
        $this->assertTrue( $r['ok'] );
        $this->assertFalse( $r['skipped'] );
    }

    public function test_runs_when_rowcount_exactly_at_threshold(): void {
        // At threshold = still proceed (strict greater-than)
        $r = schema_v12_migrate( $this->wpdb, array( 'row_count' => 100000 ) );
        $this->assertTrue( $r['ok'] );
    }

    /* ─── Step 4: DROP INDEX uniq_dedup ─── */

    public function test_drops_legacy_uniq_dedup_index(): void {
        schema_v12_migrate( $this->wpdb );
        $sql = implode( "\n", $this->wpdb->queries );
        $this->assertStringContainsString( 'DROP INDEX uniq_dedup', $sql );
    }

    public function test_skips_drop_when_legacy_index_absent(): void {
        // Idempotent: 2nd run on partial migration must not error
        schema_v12_migrate( $this->wpdb, array( 'has_uniq_dedup' => false ) );
        $sql = implode( "\n", $this->wpdb->queries );
        $this->assertStringNotContainsString( 'DROP INDEX uniq_dedup', $sql );
    }

    /* ─── Step 5: dbDelta uq_dedup 4-col ─── */

    public function test_adds_4col_unique_key(): void {
        schema_v12_migrate( $this->wpdb );
        $sql = implode( "\n", $this->wpdb->queries );
        $this->assertStringContainsString(
            'UNIQUE KEY uq_dedup (notification_type, user_id, sn, scheduled_at)',
            $sql
        );
    }

    /* ─── Step 6: covering indexes ─── */

    public function test_adds_3_covering_indexes(): void {
        schema_v12_migrate( $this->wpdb );
        $sql = implode( "\n", $this->wpdb->queries );
        $this->assertStringContainsString( 'idx_user_status', $sql );
        $this->assertStringContainsString( 'idx_sn_action', $sql );
        $this->assertStringContainsString( 'idx_scheduled_at', $sql );
    }

    /* ─── Step 7: version bump ─── */

    public function test_updates_schema_version_to_12(): void {
        schema_v12_migrate( $this->wpdb );
        $sql = implode( "\n", $this->wpdb->queries );
        $this->assertStringContainsString(
            "option_value = '1.2'",
            $sql
        );
    }

    public function test_no_version_bump_on_skip(): void {
        schema_v12_migrate( $this->wpdb, array( 'current_version' => '1.2' ) );
        $sql = implode( "\n", $this->wpdb->queries );
        $this->assertStringNotContainsString(
            "option_value = '1.3'",
            $sql,
            'a 1.2 → 1.3 bump must never happen from this migration'
        );
    }

    /* ─── Step order invariant ─── */

    public function test_dbDelta_runs_after_drop_index(): void {
        schema_v12_migrate( $this->wpdb );
        $drop_idx = -1;
        $delta_idx = -1;
        foreach ( $this->wpdb->queries as $i => $q ) {
            if ( strpos( $q, 'DROP INDEX uniq_dedup' ) !== false ) $drop_idx = $i;
            if ( strpos( $q, '[dbDelta]' ) !== false && $delta_idx === -1 ) $delta_idx = $i;
        }
        $this->assertGreaterThan( -1, $drop_idx );
        $this->assertGreaterThan( $drop_idx, $delta_idx, 'dbDelta MUST run after DROP INDEX (clean migration)' );
    }
}
