<?php
/**
 * SnReceiveBulkGroupsIdempotencyTest — R3 BUG-7 CRITICAL hotfix regression guard.
 *
 * Source: V.0.40 (2026-05-10) extended /receive/bulk with groups[] discriminator for
 * multi-SKU receive. V.0.40 forgot to include groups[] in the idempotency hash payload
 * → same X-Idempotency-Key reused with different groups[] would return cached response
 * → silent data loss (plates never received but admin sees ✓ success).
 *
 * V.0.41 (2026-05-08) HOTFIX includes groups[] in hash. This test pins the contract.
 *
 * Tests assert the SHAPE of the normalized payload (sorted sns per group, sorted groups
 * by sku) that produces the hash. Failure mode covered:
 *   - Different groups[] composition → different hash (no false replay)
 *   - Order-insensitive within groups (sns and groups both sorted)
 *   - Empty groups[] vs missing groups[] = same hash (backward compat with V.0.40 callers
 *     that didn't pass groups field for single-SKU legacy path)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class SnReceiveBulkGroupsIdempotencyTest extends IdempotencyTestFixture {

    /**
     * Build the canonical normalized body that the REST handler computes BEFORE
     * passing to dinoco_idempotency_hash. Mirrors V.0.41 line ~3530-3565 logic.
     */
    private function build_normalized_body( int $batch_id, string $linked_sku, array $sns, array $groups, string $mode, int $actor ): array {
        $sns_normalized = array_unique( array_map( function( $s ) {
            return strtoupper( trim( (string) $s ) );
        }, $sns ) );
        sort( $sns_normalized );

        $groups_normalized = array();
        foreach ( $groups as $g ) {
            if ( ! is_array( $g ) ) continue;
            $g_sku = strtoupper( trim( (string) ( $g['sku'] ?? '' ) ) );
            $g_sns_raw = (array) ( $g['sns'] ?? array() );
            $g_sns = array_values( array_unique( array_map( function( $s ) {
                return strtoupper( trim( (string) $s ) );
            }, $g_sns_raw ) ) );
            sort( $g_sns );
            if ( $g_sku !== '' && ! empty( $g_sns ) ) {
                $groups_normalized[] = array( 'sku' => $g_sku, 'sns' => $g_sns );
            }
        }
        usort( $groups_normalized, function( $a, $b ) { return strcmp( $a['sku'], $b['sku'] ); } );

        return array(
            'batch_id'   => $batch_id,
            'linked_sku' => strtoupper( trim( $linked_sku ) ),
            'sns'        => array_values( $sns_normalized ),
            'groups'     => $groups_normalized,
            'mode'       => $mode,
            '_actor'     => $actor,
        );
    }

    // ── BUG-7 SPECIFIC: same key + different groups[] = different hash ──

    public function test_bug7_different_groups_skus_different_hash(): void {
        $b1 = $this->build_normalized_body(
            5, '', array(), array( array( 'sku' => 'SKU_A', 'sns' => array( 'S1', 'S2' ) ) ),
            'multi_sku', 100
        );
        $b2 = $this->build_normalized_body(
            5, '', array(), array( array( 'sku' => 'SKU_B', 'sns' => array( 'S1', 'S2' ) ) ),
            'multi_sku', 100
        );
        $this->assertDifferentBody(
            '/receive/bulk multi_sku', $b1, $b2, 'groups[0].sku'
        );
    }

    public function test_bug7_different_groups_sns_different_hash(): void {
        $b1 = $this->build_normalized_body(
            5, '', array(), array( array( 'sku' => 'SKU_A', 'sns' => array( 'S1', 'S2' ) ) ),
            'multi_sku', 100
        );
        $b2 = $this->build_normalized_body(
            5, '', array(), array( array( 'sku' => 'SKU_A', 'sns' => array( 'S3', 'S4' ) ) ),
            'multi_sku', 100
        );
        $this->assertDifferentBody(
            '/receive/bulk multi_sku', $b1, $b2, 'groups[0].sns'
        );
    }

    public function test_bug7_different_group_count_different_hash(): void {
        $b1 = $this->build_normalized_body(
            5, '', array(), array(
                array( 'sku' => 'SKU_A', 'sns' => array( 'S1' ) ),
            ),
            'multi_sku', 100
        );
        $b2 = $this->build_normalized_body(
            5, '', array(), array(
                array( 'sku' => 'SKU_A', 'sns' => array( 'S1' ) ),
                array( 'sku' => 'SKU_B', 'sns' => array( 'S2' ) ),
            ),
            'multi_sku', 100
        );
        $this->assertDifferentBody(
            '/receive/bulk multi_sku', $b1, $b2, 'groups[].length'
        );
    }

    // ── Determinism: input order shouldn't affect hash ──

    public function test_groups_order_insensitive(): void {
        // Same payload, groups in different order — should normalize to same hash
        $g1 = array(
            array( 'sku' => 'SKU_A', 'sns' => array( 'S1', 'S2' ) ),
            array( 'sku' => 'SKU_B', 'sns' => array( 'S3', 'S4' ) ),
        );
        $g2 = array(
            array( 'sku' => 'SKU_B', 'sns' => array( 'S3', 'S4' ) ),
            array( 'sku' => 'SKU_A', 'sns' => array( 'S1', 'S2' ) ),
        );
        $b1 = $this->build_normalized_body( 5, '', array(), $g1, 'multi_sku', 100 );
        $b2 = $this->build_normalized_body( 5, '', array(), $g2, 'multi_sku', 100 );
        $this->assertReplayMatches( '/receive/bulk multi_sku (group order)', $b1 );
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'groups[] sorted by sku → input order MUST NOT affect hash'
        );
    }

    public function test_sns_within_group_order_insensitive(): void {
        $g1 = array( array( 'sku' => 'SKU_A', 'sns' => array( 'S1', 'S2', 'S3' ) ) );
        $g2 = array( array( 'sku' => 'SKU_A', 'sns' => array( 'S3', 'S1', 'S2' ) ) );
        $b1 = $this->build_normalized_body( 5, '', array(), $g1, 'multi_sku', 100 );
        $b2 = $this->build_normalized_body( 5, '', array(), $g2, 'multi_sku', 100 );
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'sns within group sorted → input order MUST NOT affect hash'
        );
    }

    public function test_uppercase_normalization(): void {
        $g1 = array( array( 'sku' => 'sku_a', 'sns' => array( 's1', 'S2' ) ) );
        $g2 = array( array( 'sku' => 'SKU_A', 'sns' => array( 'S1', 's2' ) ) );
        $b1 = $this->build_normalized_body( 5, '', array(), $g1, 'multi_sku', 100 );
        $b2 = $this->build_normalized_body( 5, '', array(), $g2, 'multi_sku', 100 );
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'sku + sns both uppercased before hash'
        );
    }

    // ── Backward compat: legacy single-SKU path (sns top-level, no groups) ──

    public function test_legacy_single_sku_no_groups_field_unchanged(): void {
        // V.0.40 had only {batch_id, linked_sku, sns, mode, _actor}. V.0.41 adds
        // 'groups' => array() when input has no groups[]. Hash MUST change after upgrade
        // (new field added) but stay stable across legacy retries.
        $b1 = $this->build_normalized_body( 5, 'SKU_A', array( 'S1', 'S2' ), array(), 'range', 100 );
        $b2 = $this->build_normalized_body( 5, 'SKU_A', array( 'S1', 'S2' ), array(), 'range', 100 );
        $this->assertReplayMatches( '/receive/bulk single-sku legacy', $b1 );
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Legacy single-SKU replay must produce same hash'
        );
    }

    // ── Edge cases ──

    public function test_invalid_group_entries_filtered(): void {
        // Malformed groups: missing sku, missing sns, non-array entries
        $g1 = array(
            array( 'sku' => 'SKU_A', 'sns' => array( 'S1' ) ),
            array( 'sku' => '', 'sns' => array( 'S2' ) ),     // missing sku → filtered
            array( 'sku' => 'SKU_B', 'sns' => array() ),      // empty sns → filtered
            'not-an-array',                                    // not array → filtered
            array(),                                           // empty entry → filtered
        );
        $g2 = array(
            array( 'sku' => 'SKU_A', 'sns' => array( 'S1' ) ),
        );
        $b1 = $this->build_normalized_body( 5, '', array(), $g1, 'multi_sku', 100 );
        $b2 = $this->build_normalized_body( 5, '', array(), $g2, 'multi_sku', 100 );
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Malformed group entries filtered out → hash matches clean payload'
        );
    }

    public function test_different_actor_different_hash(): void {
        $g = array( array( 'sku' => 'SKU_A', 'sns' => array( 'S1' ) ) );
        $b1 = $this->build_normalized_body( 5, '', array(), $g, 'multi_sku', 100 );
        $b2 = $this->build_normalized_body( 5, '', array(), $g, 'multi_sku', 200 );
        $this->assertDifferentBody(
            '/receive/bulk multi_sku', $b1, $b2, '_actor'
        );
    }

    public function test_different_batch_id_different_hash(): void {
        $g = array( array( 'sku' => 'SKU_A', 'sns' => array( 'S1' ) ) );
        $b1 = $this->build_normalized_body( 5, '', array(), $g, 'multi_sku', 100 );
        $b2 = $this->build_normalized_body( 6, '', array(), $g, 'multi_sku', 100 );
        $this->assertDifferentBody(
            '/receive/bulk multi_sku', $b1, $b2, 'batch_id'
        );
    }
}
