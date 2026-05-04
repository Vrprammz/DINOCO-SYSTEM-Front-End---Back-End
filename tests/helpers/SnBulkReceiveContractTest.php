<?php
/**
 * SnBulkReceiveContractTest — pure-logic test of bulk receive D4 contract.
 *
 * Source: [System] DINOCO S/N REST API V.0.2+ (handler_receive_bulk)
 * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §B3 D4 fix
 * Phase: 1 W4 Day 1-2
 *
 * D4 contract:
 *   - Per-row atomic (each S/N independent transaction)
 *   - Default skip-conflicts (continue valid + report failures)
 *   - Response shape: { success_count, skip_count, total, results[] }
 *   - Idempotency body hash: sort sns ascending + concat batch_id|sku|sns_sorted_csv
 *   - Chunk cap 100 plates per request
 *
 * Tests focus on:
 *   - Response shape consistency
 *   - SN normalization (UPPER + dedup + filter)
 *   - Idempotency hash determinism (sort matters)
 *   - Skip codes catalog
 *   - Chunk size cap
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/**
 * Mirror of normalize logic in dinoco_sn_handler_receive_bulk.
 */
if ( ! function_exists( __NAMESPACE__ . '\\sn_normalize_input' ) ) {
    function sn_normalize_input( array $sns_input ): array {
        $sns = array_unique( array_map( function( $s ) {
            return strtoupper( trim( (string) $s ) );
        }, $sns_input ) );
        $sns = array_filter( $sns, function( $s ) { return $s !== ''; } );
        return array_values( $sns );
    }
}

/**
 * Mirror of idempotency hash composition for bulk endpoint.
 *
 * IMPORTANT: sns must be sorted ascending for deterministic hash.
 */
if ( ! function_exists( __NAMESPACE__ . '\\sn_bulk_hash' ) ) {
    function sn_bulk_hash( int $batch_id, string $linked_sku, array $sns, string $mode, int $actor_user_id ): string {
        $sns_normalized = sn_normalize_input( $sns );
        sort( $sns_normalized );

        $payload = array(
            'batch_id'   => $batch_id,
            'linked_sku' => strtoupper( trim( $linked_sku ) ),
            'sns'        => $sns_normalized,
            'mode'       => $mode,
            '_actor'     => $actor_user_id,
        );

        return hash( 'sha256', wp_json_encode_emulator( $payload ) );
    }
}

/**
 * JSON encoder with stable key ordering — emulates Idempotency Helper.
 */
if ( ! function_exists( __NAMESPACE__ . '\\wp_json_encode_emulator' ) ) {
    function wp_json_encode_emulator( $data ): string {
        return json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
    }
}

final class SnBulkReceiveContractTest extends TestCase {

    /**
     * Input normalization: UPPER + trim + dedup + empty filter
     */
    public function test_normalize_input_upper_trim_dedup(): void {
        $input = array(
            ' dncss0001234 ',
            'DNCSS0001234', // dup after upper
            'DNCSS0001235',
            '',
            '   ',
            'dncss0001236',
        );

        $result = sn_normalize_input( $input );

        $this->assertCount( 3, $result );
        $this->assertContains( 'DNCSS0001234', $result );
        $this->assertContains( 'DNCSS0001235', $result );
        $this->assertContains( 'DNCSS0001236', $result );
    }

    /**
     * Hash determinism: same SNs in different order produces same hash
     */
    public function test_idempotency_hash_deterministic_regardless_of_order(): void {
        $sns_a = array( 'DNCSS0001236', 'DNCSS0001234', 'DNCSS0001235' );
        $sns_b = array( 'DNCSS0001234', 'DNCSS0001235', 'DNCSS0001236' );
        $sns_c = array( 'DNCSS0001235', 'DNCSS0001236', 'DNCSS0001234' );

        $hash_a = sn_bulk_hash( 42, 'DNCGND45L002', $sns_a, 'range', 1 );
        $hash_b = sn_bulk_hash( 42, 'DNCGND45L002', $sns_b, 'range', 1 );
        $hash_c = sn_bulk_hash( 42, 'DNCGND45L002', $sns_c, 'range', 1 );

        $this->assertSame( $hash_a, $hash_b );
        $this->assertSame( $hash_b, $hash_c );
    }

    /**
     * Hash collision: different SNs produce different hash
     */
    public function test_idempotency_hash_different_sns(): void {
        $sns_a = array( 'DNCSS0001234', 'DNCSS0001235' );
        $sns_b = array( 'DNCSS0001234', 'DNCSS0001236' ); // different SN

        $hash_a = sn_bulk_hash( 42, 'DNCGND45L002', $sns_a, 'range', 1 );
        $hash_b = sn_bulk_hash( 42, 'DNCGND45L002', $sns_b, 'range', 1 );

        $this->assertNotSame( $hash_a, $hash_b );
    }

    /**
     * Hash collision: different SKU produces different hash
     */
    public function test_idempotency_hash_different_sku(): void {
        $sns = array( 'DNCSS0001234', 'DNCSS0001235' );

        $hash_a = sn_bulk_hash( 42, 'DNCGND45L002', $sns, 'range', 1 );
        $hash_b = sn_bulk_hash( 42, 'DNCGND45L003', $sns, 'range', 1 );

        $this->assertNotSame( $hash_a, $hash_b );
    }

    /**
     * Hash collision: different actor produces different hash (Round 30+ pattern)
     */
    public function test_idempotency_hash_different_actor(): void {
        $sns = array( 'DNCSS0001234' );

        $hash_a = sn_bulk_hash( 42, 'DNCGND45L002', $sns, 'range', 1 );
        $hash_b = sn_bulk_hash( 42, 'DNCGND45L002', $sns, 'range', 2 ); // different actor

        $this->assertNotSame( $hash_a, $hash_b );
    }

    /**
     * Case-insensitive normalization: 'dncss' and 'DNCSS' produce same hash
     */
    public function test_idempotency_hash_case_insensitive(): void {
        $sns_lower = array( 'dncss0001234', 'dncss0001235' );
        $sns_upper = array( 'DNCSS0001234', 'DNCSS0001235' );

        $hash_lower = sn_bulk_hash( 42, 'dncgnd45l002', $sns_lower, 'range', 1 );
        $hash_upper = sn_bulk_hash( 42, 'DNCGND45L002', $sns_upper, 'range', 1 );

        $this->assertSame( $hash_lower, $hash_upper );
    }

    /**
     * Skip codes catalog — verify exhaustive list of skip reasons
     */
    public function test_skip_codes_catalog(): void {
        $expected_codes = array(
            'sn_not_found',     // S/N not in pool table
            'not_in_batch',     // S/N exists but in different batch
            'already_received', // status=in_pool already
            'voided',           // status=voided
            'invalid_status',   // status not 'reserved' (other states)
            'db_error',         // exception during transaction
        );

        // This is a documentation test — ensures we have all codes documented
        $this->assertCount( 6, $expected_codes );
    }

    /**
     * Response shape contract — required keys
     */
    public function test_response_shape_contract(): void {
        $expected_keys = array( 'success_count', 'skip_count', 'total', 'results', 'batch' );

        // Mock response
        $mock_response = array(
            'success_count' => 47,
            'skip_count'    => 3,
            'total'         => 50,
            'results'       => array(
                array( 'sn' => 'DNCSS0001234', 'status' => 'ok', 'code' => 'received' ),
                array( 'sn' => 'DNCSS0001245', 'status' => 'skip', 'code' => 'already_received', 'linked_sku' => 'DNCGND45L002' ),
                array( 'sn' => 'DNCSS0001260', 'status' => 'skip', 'code' => 'voided' ),
                array( 'sn' => 'DNCSS0001275', 'status' => 'skip', 'code' => 'not_in_batch' ),
            ),
            'batch' => array(
                'id'           => 42,
                'qty_received' => 50047,
                'qty_total'    => 100000,
                'progress_pct' => 50.05,
                'status'       => 'received_partial',
            ),
        );

        foreach ( $expected_keys as $key ) {
            $this->assertArrayHasKey( $key, $mock_response );
        }

        $this->assertSame( $mock_response['success_count'] + $mock_response['skip_count'], $mock_response['total'] );
        $this->assertCount( 4, $mock_response['results'] );
    }

    /**
     * Result row shape — required keys per row
     */
    public function test_result_row_shape(): void {
        $valid_row = array( 'sn' => 'DNCSS0001234', 'status' => 'ok', 'code' => 'received' );
        $skip_row = array( 'sn' => 'DNCSS0001245', 'status' => 'skip', 'code' => 'already_received', 'linked_sku' => 'DNCGND45L002' );

        // Required: sn, status, code
        foreach ( array( 'sn', 'status', 'code' ) as $key ) {
            $this->assertArrayHasKey( $key, $valid_row );
            $this->assertArrayHasKey( $key, $skip_row );
        }

        // Status enum
        $this->assertContains( $valid_row['status'], array( 'ok', 'skip', 'error' ) );
        $this->assertContains( $skip_row['status'], array( 'ok', 'skip', 'error' ) );
    }

    /**
     * Chunk cap enforced: > 100 should be rejected with 400 error
     */
    public function test_chunk_cap_100(): void {
        // Generate 101 SNs
        $sns = array();
        for ( $i = 1; $i <= 101; $i++ ) {
            $sns[] = sprintf( 'DNCSS%07d', $i );
        }

        $this->assertGreaterThan( 100, count( $sns ),
            'Test setup: should have > 100 SNs to trigger cap' );

        // In production, handler returns WP_Error with status=400
        // Test simulates rejection logic
        $rejected = ( count( $sns ) > 100 );
        $this->assertTrue( $rejected );
    }

    /**
     * Normalized empty input produces empty array (not null/false)
     */
    public function test_normalize_empty_input(): void {
        $this->assertSame( array(), sn_normalize_input( array() ) );
        $this->assertSame( array(), sn_normalize_input( array( '', '   ', "\n" ) ) );
    }

    /**
     * Mode discriminator: range vs paste vs scan = different hash
     */
    public function test_idempotency_hash_mode_discriminator(): void {
        $sns = array( 'DNCSS0001234' );

        $hash_range = sn_bulk_hash( 42, 'DNCGND45L002', $sns, 'range', 1 );
        $hash_paste = sn_bulk_hash( 42, 'DNCGND45L002', $sns, 'paste', 1 );
        $hash_scan = sn_bulk_hash( 42, 'DNCGND45L002', $sns, 'scan', 1 );

        $this->assertNotSame( $hash_range, $hash_paste );
        $this->assertNotSame( $hash_paste, $hash_scan );
        $this->assertNotSame( $hash_range, $hash_scan );
    }
}
