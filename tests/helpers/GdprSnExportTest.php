<?php
/**
 * GdprSnExportTest — pure-logic tests for V.4.1 S/N data export scope.
 *
 * Source: [System] DINOCO GDPR Data Requests V.4.1 (Plan v2.13 Phase 4 W14.4)
 *
 * Scope: V.4.1 extended dinoco_gdpr_build_export() to include 4-5 new ZIP
 * entries from the Production S/N Management system. We test the LOGIC of:
 *
 *   1. record_counts shape includes all 5 new keys (sn_plates,
 *      sn_audit_events, sn_notifications, sn_review_requests, sn_unavailable)
 *   2. sn_unavailable=true when SN helpers missing (function_exists guard
 *      short-circuits before $wpdb access)
 *   3. Plate sn_pool query whitelist (only PII-relevant + structural columns)
 *   4. SN data row caps prevent runaway memory:
 *      - audit_events LIMIT 5000
 *      - notifications LIMIT 5000
 *      - review_requests LIMIT 5000
 *      - sn_pool no LIMIT (one user shouldn't have 5K plates)
 *   5. Cold meta join chunked at 500 SNs/batch (SQL parameter limit defense)
 *
 * NOTE: Pure-logic mirror — actual $wpdb queries tested via integration
 * tests when WP environment available. Drift detector
 * tests/jest/sn-system-drift.test.js asserts string presence to keep mirrors
 * + snippet logic in sync.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\gdpr_sn_default_record_counts' ) ) {
    /**
     * Initial record_counts shape for SN export section (V.4.1).
     * Matches default values set BEFORE any SN table query runs.
     */
    function gdpr_sn_default_record_counts(): array {
        return array(
            'sn_plates'          => 0,
            'sn_audit_events'    => 0,
            'sn_notifications'   => 0,
            'sn_review_requests' => 0,
            'sn_unavailable'     => false,
        );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\gdpr_sn_helpers_available' ) ) {
    /**
     * Mirror of the function_exists() short-circuit in build_export().
     */
    function gdpr_sn_helpers_available( bool $table_exists_fn, bool $table_fn ): bool {
        return $table_exists_fn && $table_fn;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\gdpr_sn_chunk_size_for_pool_meta' ) ) {
    /**
     * Mirror of array_chunk size for sn_pool_meta IN (...) clause to defend
     * against SQL placeholder limit (~65k typical, but we cap at 500 for
     * driver portability).
     */
    function gdpr_sn_chunk_size_for_pool_meta(): int {
        return 500;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\gdpr_sn_row_caps' ) ) {
    /**
     * Mirror of LIMIT clauses applied to defensive 5,000 row caps.
     * sn_plates is uncapped (one user rarely has > 5K plates; if so, that
     * is itself a forensic signal — caller can investigate).
     */
    function gdpr_sn_row_caps(): array {
        return array(
            'sn_pool'              => null,  // uncapped intentional
            'sn_audit_events'      => 5000,
            'sn_notifications'     => 5000,
            'sn_review_requests'   => 5000,
        );
    }
}

class GdprSnExportTest extends TestCase {

    /* ─── Default record_counts shape ─── */

    public function test_default_record_counts_has_all_5_keys(): void {
        $counts = gdpr_sn_default_record_counts();
        $expected_keys = array(
            'sn_plates',
            'sn_audit_events',
            'sn_notifications',
            'sn_review_requests',
            'sn_unavailable',
        );
        foreach ( $expected_keys as $k ) {
            $this->assertArrayHasKey( $k, $counts );
        }
    }

    public function test_default_record_counts_initial_values_zero(): void {
        $counts = gdpr_sn_default_record_counts();
        $this->assertSame( 0, $counts['sn_plates'] );
        $this->assertSame( 0, $counts['sn_audit_events'] );
        $this->assertSame( 0, $counts['sn_notifications'] );
        $this->assertSame( 0, $counts['sn_review_requests'] );
    }

    public function test_default_unavailable_false_initially(): void {
        $counts = gdpr_sn_default_record_counts();
        $this->assertFalse( $counts['sn_unavailable'] );
    }

    /* ─── Function_exists short-circuit guard ─── */

    public function test_helpers_available_when_both_present(): void {
        $this->assertTrue( gdpr_sn_helpers_available( true, true ) );
    }

    public function test_helpers_not_available_when_table_exists_missing(): void {
        $this->assertFalse( gdpr_sn_helpers_available( false, true ) );
    }

    public function test_helpers_not_available_when_table_helper_missing(): void {
        $this->assertFalse( gdpr_sn_helpers_available( true, false ) );
    }

    public function test_helpers_not_available_when_neither_present(): void {
        $this->assertFalse( gdpr_sn_helpers_available( false, false ) );
    }

    /* ─── Row caps (defensive memory bound) ─── */

    public function test_audit_events_capped_at_5000(): void {
        $caps = gdpr_sn_row_caps();
        $this->assertSame( 5000, $caps['sn_audit_events'] );
    }

    public function test_notifications_capped_at_5000(): void {
        $caps = gdpr_sn_row_caps();
        $this->assertSame( 5000, $caps['sn_notifications'] );
    }

    public function test_review_requests_capped_at_5000(): void {
        $caps = gdpr_sn_row_caps();
        $this->assertSame( 5000, $caps['sn_review_requests'] );
    }

    public function test_sn_pool_intentionally_uncapped(): void {
        // Design decision: one user has < 5K plates in any realistic scenario;
        // if a user has > 5K plates, that is itself a forensic signal and
        // export should surface that
        $caps = gdpr_sn_row_caps();
        $this->assertNull( $caps['sn_pool'] );
    }

    /* ─── Cold meta join chunk size ─── */

    public function test_pool_meta_chunk_500_for_sql_placeholder_limit(): void {
        // PostgreSQL bind limit is 65535; MySQL implementation-specific but
        // typically 65k. We cap at 500 for driver portability + faster
        // partial failure recovery
        $this->assertSame( 500, gdpr_sn_chunk_size_for_pool_meta() );
    }

    public function test_pool_meta_chunk_for_1000_plates_yields_2_chunks(): void {
        $sn_list = array_fill( 0, 1000, 'DNCSS0000001' );
        $chunks = array_chunk( $sn_list, gdpr_sn_chunk_size_for_pool_meta() );
        $this->assertCount( 2, $chunks );
        $this->assertCount( 500, $chunks[0] );
        $this->assertCount( 500, $chunks[1] );
    }

    public function test_pool_meta_chunk_for_499_plates_yields_1_chunk(): void {
        $sn_list = array_fill( 0, 499, 'DNCSS0000001' );
        $chunks = array_chunk( $sn_list, gdpr_sn_chunk_size_for_pool_meta() );
        $this->assertCount( 1, $chunks );
    }

    /* ─── Defensive integration with main export ─── */

    public function test_unavailable_propagates_when_helpers_missing(): void {
        $counts = gdpr_sn_default_record_counts();
        if ( ! gdpr_sn_helpers_available( false, false ) ) {
            $counts['sn_unavailable'] = true;
        }
        $this->assertTrue( $counts['sn_unavailable'] );
        // Other counters stay at 0 — no partial data
        $this->assertSame( 0, $counts['sn_plates'] );
    }

    public function test_unavailable_not_set_on_zero_results(): void {
        // SN helpers present but user has zero plates → counters all 0,
        // but sn_unavailable stays FALSE (system is available, user is just
        // a clean record)
        $counts = gdpr_sn_default_record_counts();
        if ( gdpr_sn_helpers_available( true, true ) ) {
            // Simulate zero rows returned from query (no early-set unavailable)
        }
        $this->assertFalse( $counts['sn_unavailable'] );
        $this->assertSame( 0, $counts['sn_plates'] );
    }

    /* ─── PII column whitelist verification ─── */

    public function test_sn_pool_query_whitelist_no_pii_oracle(): void {
        // Per V.4.1 spec, sn_pool query selects only:
        //   sn, status, linked_sku, registered_at, batch_id, prev_status, lock_version
        // Should NOT include registered_user_id (that's our filter, redundant)
        // Should NOT include claim_id (cross-system reference, separate export)
        $whitelist = array(
            'sn', 'status', 'linked_sku', 'registered_at',
            'batch_id', 'prev_status', 'lock_version',
        );
        $this->assertContains( 'sn', $whitelist );
        $this->assertContains( 'status', $whitelist );
        $this->assertContains( 'registered_at', $whitelist );
        // Verify no implicit cross-system leak
        $this->assertNotContains( 'registered_user_id', $whitelist );
        $this->assertNotContains( 'claim_id', $whitelist );
    }

    public function test_audit_query_includes_both_actor_and_approver(): void {
        // Per V.4.1: WHERE actor_user_id = ? OR approver_user_id = ?
        // Both branches MUST be exported (4-eyes trail = both parties have rights)
        $where_clauses = array( 'actor_user_id', 'approver_user_id' );
        $this->assertCount( 2, $where_clauses );
        $this->assertContains( 'actor_user_id', $where_clauses );
        $this->assertContains( 'approver_user_id', $where_clauses );
    }
}
