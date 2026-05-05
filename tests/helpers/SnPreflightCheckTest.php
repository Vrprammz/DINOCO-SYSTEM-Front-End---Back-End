<?php
/**
 * SnPreflightCheckTest — Phase 1 W4 acceptance.
 *
 * Source: [Admin System] DINOCO Production SN Manager V.0.24+
 * Plan: docs/sn-system/11-phase1-w4-internal-qa-acceptance-test.md
 *
 * Helpers under test:
 *   dinoco_sn_compute_hierarchy_depth()   — pure-logic depth calc + DD-3 circular guard
 *   dinoco_sn_preflight_check_batch()     — full validation report (mocked deps)
 *
 * Pure-logic mirrors (no DB / no DINOCO_Catalog dep).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_compute_depth' ) ) {
    /**
     * Mirror of dinoco_sn_compute_hierarchy_depth — value-copy $visited per branch.
     */
    function sn_compute_depth( $sku, $relations, $visited = array(), $depth = 0 ): int {
        if ( $depth > 5 ) return $depth;
        $sku = strtoupper( trim( (string) $sku ) );
        if ( in_array( $sku, $visited, true ) ) return $depth;
        $visited[] = $sku;

        $children = isset( $relations[ $sku ] ) && is_array( $relations[ $sku ] )
            ? $relations[ $sku ]
            : array();

        if ( empty( $children ) ) return $depth;

        $max_child = $depth;
        foreach ( $children as $child ) {
            $child_depth = sn_compute_depth( $child, $relations, $visited, $depth + 1 );
            if ( $child_depth > $max_child ) $max_child = $child_depth;
        }
        return $max_child;
    }

    /**
     * Mirror of dinoco_sn_preflight_check_batch using fixture maps.
     *
     * @param array $skus_with_qty
     * @param int   $batch_qty
     * @param array $sku_attach_levels  Map sku => 'set'|'child'|'leaf'|'none'
     * @param array $sku_qty_per_unit   Map sku => int
     * @param array $relations          dinoco_sku_relations fixture
     * @return array
     */
    function sn_preflight_check( $skus_with_qty, $batch_qty, $sku_attach_levels, $sku_qty_per_unit, $relations ): array {
        $report = array(
            'ok'                    => true,
            'warnings'              => array(),
            'errors'                => array(),
            'plates_required_total' => 0,
            'plates_per_sku'        => array(),
        );

        if ( ! is_array( $skus_with_qty ) || empty( $skus_with_qty ) ) {
            $report['ok'] = false;
            $report['errors'][] = array( 'sku' => '', 'code' => 'no_skus', 'message' => 'ต้องระบุอย่างน้อย 1 SKU' );
            return $report;
        }

        $batch_qty = max( 1, (int) $batch_qty );
        $total = 0;

        foreach ( $skus_with_qty as $entry ) {
            $sku = isset( $entry['sku'] ) ? strtoupper( trim( (string) $entry['sku'] ) ) : '';
            $qty = isset( $entry['qty'] ) ? max( 1, (int) $entry['qty'] ) : 1;

            if ( $sku === '' ) {
                $report['errors'][] = array( 'sku' => '', 'code' => 'empty_sku', 'message' => 'SKU ว่าง' );
                $report['ok'] = false;
                continue;
            }

            $attach = $sku_attach_levels[ $sku ] ?? 'none';
            if ( $attach === 'none' || $attach === '' ) {
                $report['errors'][] = array(
                    'sku'     => $sku,
                    'code'    => 'sku_attach_level_none',
                    'message' => sprintf( 'SKU %s ตั้ง sn_attach_level=none', $sku ),
                );
                $report['ok'] = false;
                continue;
            }

            // Resolve plate count (simplified: SET=1 plate at level, others walk hierarchy)
            $sku_plates = 0;
            $hierarchy = array();
            $sn_qty = $sku_qty_per_unit[ $sku ] ?? 1;

            if ( $attach === 'set' ) {
                $sku_plates = $qty * max( 1, $sn_qty );
                $hierarchy[] = array( 'sku' => $sku, 'qty' => $sku_plates );
            } else {
                // Walk to leaf/child — count direct children
                $children = $relations[ $sku ] ?? array();
                if ( empty( $children ) ) {
                    $report['warnings'][] = array(
                        'sku'     => $sku,
                        'code'    => 'no_plates_resolved',
                        'message' => sprintf( 'SKU %s ไม่มีลูก/หลาน', $sku ),
                    );
                    continue;
                }
                $seen = array();
                foreach ( $children as $child ) {
                    if ( isset( $seen[ $child ] ) ) continue; // DD-3 dedup
                    $seen[ $child ] = true;
                    $sku_plates += $qty;
                    $hierarchy[] = array( 'sku' => $child, 'qty' => $qty );
                }
            }

            $total += $sku_plates;
            $report['plates_per_sku'][] = array(
                'sku'             => $sku,
                'qty_units'       => $qty,
                'attach_level'    => $attach,
                'plates_required' => $sku_plates,
                'hierarchy'       => $hierarchy,
            );

            // DD-4 max depth warning
            $depth = sn_compute_depth( $sku, $relations );
            if ( $depth > 3 ) {
                $report['warnings'][] = array(
                    'sku'     => $sku,
                    'code'    => 'depth_exceeds_max',
                    'message' => sprintf( 'SKU %s hierarchy depth=%d เกิน DD-4 max 3', $sku, $depth ),
                );
            }
        }

        $report['plates_required_total'] = $total;

        if ( $batch_qty < $total ) {
            $report['warnings'][] = array(
                'sku'     => '',
                'code'    => 'batch_qty_too_small',
                'message' => sprintf( 'batch_qty=%d < plates needed=%d', $batch_qty, $total ),
            );
        }

        return $report;
    }
}

class SnPreflightCheckTest extends TestCase {

    public function test_empty_skus_returns_error() {
        $report = sn_preflight_check( array(), 100, array(), array(), array() );
        $this->assertFalse( $report['ok'] );
        $this->assertCount( 1, $report['errors'] );
        $this->assertSame( 'no_skus', $report['errors'][0]['code'] );
    }

    public function test_empty_sku_string_in_array() {
        $report = sn_preflight_check(
            array( array( 'sku' => '', 'qty' => 1 ) ),
            100,
            array(),
            array(),
            array()
        );
        $this->assertFalse( $report['ok'] );
        $this->assertSame( 'empty_sku', $report['errors'][0]['code'] );
    }

    public function test_attach_level_none_blocks_sku() {
        $report = sn_preflight_check(
            array( array( 'sku' => 'DNCRACK001', 'qty' => 5 ) ),
            10,
            array( 'DNCRACK001' => 'none' ),
            array(),
            array()
        );
        $this->assertFalse( $report['ok'] );
        $this->assertSame( 'sku_attach_level_none', $report['errors'][0]['code'] );
    }

    public function test_set_level_single_plate() {
        // DNCSETXXX (sn_attach_level=set) → 1 plate per unit × 5 = 5 plates
        $report = sn_preflight_check(
            array( array( 'sku' => 'DNCSET001', 'qty' => 5 ) ),
            10,
            array( 'DNCSET001' => 'set' ),
            array( 'DNCSET001' => 1 ),
            array()
        );
        $this->assertTrue( $report['ok'] );
        $this->assertSame( 5, $report['plates_required_total'] );
        $this->assertCount( 1, $report['plates_per_sku'] );
    }

    public function test_boss_example_4_leaf_set() {
        // DNC4537SETGNDPRO002 (leaf attach) → 4 plates per unit (4 leaves)
        $report = sn_preflight_check(
            array( array( 'sku' => 'DNC4537SETGNDPRO002', 'qty' => 25 ) ),
            100,
            array( 'DNC4537SETGNDPRO002' => 'leaf' ),
            array( 'DNC4537SETGNDPRO002' => 1 ),
            array(
                'DNC4537SETGNDPRO002' => array(
                    'DNCGND45L002', 'DNCGNDPROS500', 'DNCGNDPROT500', 'DNCGND37LS',
                ),
            )
        );
        $this->assertTrue( $report['ok'] );
        $this->assertSame( 100, $report['plates_required_total'] ); // 25 × 4 leaves
    }

    public function test_boss_example_2_child_set() {
        // DNCSETNX500EIRNB (child attach) → 2 plates per unit (2 children)
        $report = sn_preflight_check(
            array( array( 'sku' => 'DNCSETNX500EIRNB', 'qty' => 50 ) ),
            100,
            array( 'DNCSETNX500EIRNB' => 'child' ),
            array( 'DNCSETNX500EIRNB' => 1 ),
            array(
                'DNCSETNX500EIRNB' => array( 'DNCNX500E002IRONB', 'DNCNX500001IRONB' ),
            )
        );
        $this->assertTrue( $report['ok'] );
        $this->assertSame( 100, $report['plates_required_total'] ); // 50 × 2 children
    }

    public function test_dd3_shared_leaf_dedup() {
        // SET_A and SET_B both have child X and Y — 2 SETs ordered should dedup
        // duplicate child references within ONE SET (this test scope)
        $report = sn_preflight_check(
            array( array( 'sku' => 'SET_A', 'qty' => 1 ) ),
            10,
            array( 'SET_A' => 'leaf' ),
            array( 'SET_A' => 1 ),
            array(
                'SET_A' => array( 'X', 'Y', 'X' ), // 'X' duplicated — must dedup
            )
        );
        $this->assertTrue( $report['ok'] );
        $this->assertSame( 2, $report['plates_required_total'] ); // X + Y, dedup
    }

    public function test_no_children_warning() {
        $report = sn_preflight_check(
            array( array( 'sku' => 'EMPTY_SET', 'qty' => 1 ) ),
            10,
            array( 'EMPTY_SET' => 'leaf' ),
            array(),
            array() // EMPTY_SET has no children registered
        );
        $this->assertTrue( $report['ok'] ); // warning ≠ error
        $this->assertCount( 1, $report['warnings'] );
        $this->assertSame( 'no_plates_resolved', $report['warnings'][0]['code'] );
    }

    public function test_batch_qty_too_small_warning() {
        // 25 SETs × 4 leaves = 100 plates needed, but batch_qty = 50
        $report = sn_preflight_check(
            array( array( 'sku' => 'BIG_SET', 'qty' => 25 ) ),
            50, // too small
            array( 'BIG_SET' => 'leaf' ),
            array( 'BIG_SET' => 1 ),
            array( 'BIG_SET' => array( 'L1', 'L2', 'L3', 'L4' ) )
        );
        $this->assertTrue( $report['ok'] );
        $this->assertSame( 100, $report['plates_required_total'] );
        $codes = array_column( $report['warnings'], 'code' );
        $this->assertContains( 'batch_qty_too_small', $codes );
    }

    public function test_uppercase_normalize() {
        $report = sn_preflight_check(
            array( array( 'sku' => 'set_lower_case', 'qty' => 3 ) ),
            10,
            array( 'SET_LOWER_CASE' => 'set' ), // stored uppercase
            array( 'SET_LOWER_CASE' => 1 ),
            array()
        );
        $this->assertTrue( $report['ok'] );
        $this->assertSame( 3, $report['plates_required_total'] );
    }

    public function test_qty_per_unit_multiplier() {
        // SKU sn_qty_per_unit=2 → 5 units × 2 = 10 plates
        $report = sn_preflight_check(
            array( array( 'sku' => 'DUAL_PLATE_SKU', 'qty' => 5 ) ),
            20,
            array( 'DUAL_PLATE_SKU' => 'set' ),
            array( 'DUAL_PLATE_SKU' => 2 ),
            array()
        );
        $this->assertTrue( $report['ok'] );
        $this->assertSame( 10, $report['plates_required_total'] );
    }

    public function test_mixed_skus_aggregate_plates() {
        $report = sn_preflight_check(
            array(
                array( 'sku' => 'SET_A', 'qty' => 10 ), // 10 × 1 = 10
                array( 'sku' => 'SET_B', 'qty' => 5 ),  // 5 × 4 leaves = 20
            ),
            50,
            array( 'SET_A' => 'set', 'SET_B' => 'leaf' ),
            array( 'SET_A' => 1, 'SET_B' => 1 ),
            array(
                'SET_B' => array( 'X', 'Y', 'Z', 'W' ),
            )
        );
        $this->assertTrue( $report['ok'] );
        $this->assertSame( 30, $report['plates_required_total'] );
        $this->assertCount( 2, $report['plates_per_sku'] );
    }

    public function test_mixed_skus_partial_failure() {
        // SET_A ok, SET_B = none → SET_B fails but SET_A still counted
        $report = sn_preflight_check(
            array(
                array( 'sku' => 'SET_A', 'qty' => 10 ),
                array( 'sku' => 'SET_B', 'qty' => 5 ), // attach=none → error
            ),
            20,
            array( 'SET_A' => 'set', 'SET_B' => 'none' ),
            array( 'SET_A' => 1 ),
            array()
        );
        $this->assertFalse( $report['ok'] ); // any error → ok=false
        $this->assertCount( 1, $report['errors'] );
        $this->assertSame( 10, $report['plates_required_total'] ); // SET_A still counted
    }

    public function test_batch_qty_clamped_minimum_1() {
        $report = sn_preflight_check(
            array( array( 'sku' => 'SET_A', 'qty' => 1 ) ),
            -100, // negative clamped to 1
            array( 'SET_A' => 'set' ),
            array( 'SET_A' => 1 ),
            array()
        );
        $this->assertTrue( $report['ok'] );
        // batch_qty=1 (clamped) < plates=1 → no warning
        $codes = array_column( $report['warnings'], 'code' );
        $this->assertNotContains( 'batch_qty_too_small', $codes );
    }

    // ─── Hierarchy depth tests ──────────────────────────────────────────

    public function test_depth_no_children() {
        $relations = array();
        $this->assertSame( 0, sn_compute_depth( 'SOLO', $relations ) );
    }

    public function test_depth_single_level() {
        $relations = array( 'SET' => array( 'C1', 'C2' ) );
        $this->assertSame( 1, sn_compute_depth( 'SET', $relations ) );
    }

    public function test_depth_three_levels_dd4() {
        $relations = array(
            'SET' => array( 'CHILD_A', 'CHILD_B' ),
            'CHILD_A' => array( 'GRAND_A1', 'GRAND_A2' ),
            'CHILD_B' => array( 'GRAND_B1' ),
        );
        $this->assertSame( 2, sn_compute_depth( 'SET', $relations ) );
    }

    public function test_depth_dd4_violation_warns() {
        // 4 levels deep — exceeds DD-4
        $relations = array(
            'SET' => array( 'L1' ),
            'L1' => array( 'L2' ),
            'L2' => array( 'L3' ),
            'L3' => array( 'L4' ), // too deep
        );
        $this->assertSame( 4, sn_compute_depth( 'SET', $relations ) );
    }

    public function test_depth_circular_ref_guard() {
        // SET → A → B → SET (circular)
        $relations = array(
            'SET' => array( 'A' ),
            'A'   => array( 'B' ),
            'B'   => array( 'SET' ), // back to root
        );
        $depth = sn_compute_depth( 'SET', $relations );
        $this->assertLessThanOrEqual( 5, $depth ); // safety cap, no infinite loop
    }

    public function test_depth_dd3_shared_child_not_double_counted() {
        // SET_A and SET_B both have CHILD — depth should be 1 from each parent
        $relations = array(
            'SET_A' => array( 'SHARED' ),
            'SET_B' => array( 'SHARED' ),
            'SHARED' => array( 'LEAF1', 'LEAF2' ),
        );
        $this->assertSame( 2, sn_compute_depth( 'SET_A', $relations ) );
        $this->assertSame( 2, sn_compute_depth( 'SET_B', $relations ) );
    }

    public function test_depth_uppercase_normalize() {
        $relations = array( 'SET' => array( 'A', 'B' ) );
        $this->assertSame( 1, sn_compute_depth( 'set', $relations ) ); // lowercase input
    }
}
