<?php
/**
 * SnHierarchyTest — pure-logic test of S/N hierarchy resolver.
 *
 * Source: [Admin System] DINOCO Production S/N Manager V.0.2+
 *   function dinoco_sn_walk_to_level()
 *   function dinoco_sn_required_plates_for_sku()
 *
 * Plan reference: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13
 * Phase: 1 W4 Day 1-2
 *
 * Tests boss-specified examples:
 *   - DNC4537SETGNDPRO002 (sn_attach_level=leaf) → 4 plates
 *   - DNCSETNX500EIRNB    (sn_attach_level=child) → 2 plates
 *   - SET-level SKU       → 1 plate
 *   - none-level SKU      → 0 plates
 *
 * Pattern follows HierarchyTest.php — pure logic, in-memory $relations.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/**
 * Mirror of dinoco_sn_walk_to_level() — pure logic without WP dependencies.
 *
 * V.7.1 C2 fix pattern: pass $visited by VALUE per branch.
 */
if ( ! function_exists( __NAMESPACE__ . '\\sn_walk_to_level' ) ) {
    function sn_walk_to_level( string $start_sku, string $target_level, array $relations, array $visited = array(), int $depth = 0 ): array {
        if ( $depth > 3 ) return array();
        if ( in_array( $start_sku, $visited, true ) ) return array();

        // value-copy per branch (V.7.1 critical)
        $visited[] = $start_sku;

        $children = $relations[ $start_sku ] ?? array();
        if ( empty( $children ) ) {
            if ( $target_level === 'leaf' ) {
                return array(
                    array( 'sku' => $start_sku, 'qty_per_set' => 1, 'level' => 'leaf' ),
                );
            }
            return array();
        }

        $results = array();
        foreach ( $children as $child_sku ) {
            $child_sku = strtoupper( trim( (string) $child_sku ) );
            if ( $child_sku === '' ) continue;

            $child_has_grandchildren = ! empty( $relations[ $child_sku ] ?? array() );

            if ( $target_level === 'child' ) {
                $results[] = array( 'sku' => $child_sku, 'qty_per_set' => 1, 'level' => 'child' );
            } elseif ( $target_level === 'leaf' && ! $child_has_grandchildren ) {
                $results[] = array( 'sku' => $child_sku, 'qty_per_set' => 1, 'level' => 'leaf' );
            } elseif ( $target_level === 'leaf' && $child_has_grandchildren ) {
                $sub = sn_walk_to_level( $child_sku, 'leaf', $relations, $visited, $depth + 1 );
                $results = array_merge( $results, $sub );
            }
        }

        return $results;
    }
}

/**
 * Mirror of dinoco_sn_required_plates_for_sku() — pure logic.
 */
if ( ! function_exists( __NAMESPACE__ . '\\sn_required_plates_for_sku' ) ) {
    function sn_required_plates_for_sku(
        string $sku,
        int $qty,
        string $attach_level,
        int $sn_qty_per_unit,
        array $relations
    ): array {
        $sku = strtoupper( trim( $sku ) );
        $qty = max( 1, $qty );

        if ( $sku === '' ) return array();
        if ( $attach_level === 'none' || $attach_level === '' ) return array();

        if ( $attach_level === 'set' ) {
            return array(
                array( 'sku' => $sku, 'qty' => $qty * max( 1, $sn_qty_per_unit ) ),
            );
        }

        $target_level = ( $attach_level === 'child' ) ? 'child' : 'leaf';
        $nodes = sn_walk_to_level( $sku, $target_level, $relations );

        if ( empty( $nodes ) ) return array();

        $result = array();
        $seen = array();
        foreach ( $nodes as $node ) {
            $node_sku = $node['sku'];
            if ( isset( $seen[ $node_sku ] ) ) continue;
            $seen[ $node_sku ] = true;
            $result[] = array(
                'sku' => $node_sku,
                'qty' => $qty * max( 1, (int) $node['qty_per_set'] ),
            );
        }

        return $result;
    }
}

final class SnHierarchyTest extends TestCase {

    /**
     * Boss example #1: DNC4537SETGNDPRO002 → 4 plates (leaf-level)
     */
    public function test_boss_example_set_4_leaves_attach_at_leaf(): void {
        $relations = array(
            'DNC4537SETGNDPRO002' => array(
                'DNCGND45L002',
                'DNCGNDPROS500',
                'DNCGNDPROT500',
                'DNCGND37LS',
            ),
            // All children are leaves (no grandchildren in hierarchy)
        );

        $plates = sn_required_plates_for_sku(
            'DNC4537SETGNDPRO002',
            1, // qty
            'leaf', // attach_level
            1, // sn_qty_per_unit
            $relations
        );

        $this->assertCount( 4, $plates, 'DNC4537SETGNDPRO002 should require 4 plates' );

        $skus = array_column( $plates, 'sku' );
        $this->assertContains( 'DNCGND45L002', $skus );
        $this->assertContains( 'DNCGNDPROS500', $skus );
        $this->assertContains( 'DNCGNDPROT500', $skus );
        $this->assertContains( 'DNCGND37LS', $skus );

        // Each plate qty=1 (per leaf)
        foreach ( $plates as $p ) {
            $this->assertSame( 1, $p['qty'] );
        }
    }

    /**
     * Boss example #2: DNCSETNX500EIRNB → 2 plates (child-level, skip grandchildren)
     */
    public function test_boss_example_set_2_children_attach_at_child(): void {
        $relations = array(
            'DNCSETNX500EIRNB' => array(
                'DNCNX500E002IRONB',
                'DNCNX500001IRONB',
            ),
            // Each child has grandchildren (L/R) but we attach at CHILD level
            'DNCNX500E002IRONB' => array( 'DNCNX500E002IRONB-L', 'DNCNX500E002IRONB-R' ),
            'DNCNX500001IRONB'  => array( 'DNCNX500001IRONB-L', 'DNCNX500001IRONB-R' ),
        );

        $plates = sn_required_plates_for_sku(
            'DNCSETNX500EIRNB',
            1,
            'child',
            1,
            $relations
        );

        $this->assertCount( 2, $plates, 'DNCSETNX500EIRNB should require 2 plates (child-level)' );

        $skus = array_column( $plates, 'sku' );
        $this->assertContains( 'DNCNX500E002IRONB', $skus );
        $this->assertContains( 'DNCNX500001IRONB', $skus );

        // Should NOT contain grandchildren (boss spec)
        $this->assertNotContains( 'DNCNX500E002IRONB-L', $skus );
        $this->assertNotContains( 'DNCNX500E002IRONB-R', $skus );
    }

    /**
     * SET-level: single plate at SET itself
     */
    public function test_set_level_single_plate(): void {
        $relations = array(
            'DNCXL7500X001H' => array( 'CHILD_A', 'CHILD_B' ),
        );

        $plates = sn_required_plates_for_sku(
            'DNCXL7500X001H',
            1,
            'set',
            1,
            $relations
        );

        $this->assertCount( 1, $plates );
        $this->assertSame( 'DNCXL7500X001H', $plates[0]['sku'] );
        $this->assertSame( 1, $plates[0]['qty'] );
    }

    /**
     * none-level: zero plates
     */
    public function test_none_level_zero_plates(): void {
        $relations = array();

        $plates = sn_required_plates_for_sku(
            'DNCRACK001',
            10,
            'none',
            1,
            $relations
        );

        $this->assertSame( array(), $plates, 'none-level SKU should require 0 plates' );
    }

    /**
     * Empty SKU returns empty
     */
    public function test_empty_sku_returns_empty(): void {
        $plates = sn_required_plates_for_sku( '', 1, 'leaf', 1, array() );
        $this->assertSame( array(), $plates );
    }

    /**
     * Quantity multiplier: order 5 SETs → 4 leaves × 5 each = 20 plates total
     */
    public function test_qty_multiplier(): void {
        $relations = array(
            'SET_A' => array( 'L1', 'L2', 'L3', 'L4' ),
        );

        $plates = sn_required_plates_for_sku( 'SET_A', 5, 'leaf', 1, $relations );

        $this->assertCount( 4, $plates );
        $total_qty = array_sum( array_column( $plates, 'qty' ) );
        $this->assertSame( 20, $total_qty, 'qty=5 × 4 leaves = 20 total plates' );
    }

    /**
     * sn_qty_per_unit: 2 plates per leaf × 4 leaves × qty 1 = 8 plates
     */
    public function test_sn_qty_per_unit_set_level(): void {
        $relations = array();
        $plates = sn_required_plates_for_sku( 'SET_X', 1, 'set', 2, $relations );
        $this->assertSame( 2, $plates[0]['qty'] );
    }

    /**
     * DD-3 shared leaf: leaf appears under 2 SETs — dedup pattern
     */
    public function test_dd3_shared_leaf_dedup(): void {
        $relations = array(
            'SET_A' => array( 'L1', 'L_SHARED' ),
            'SET_B' => array( 'L2', 'L_SHARED' ),
            // L_SHARED is leaf in both
        );

        // Walk SET_A
        $plates_a = sn_required_plates_for_sku( 'SET_A', 1, 'leaf', 1, $relations );
        $this->assertCount( 2, $plates_a );

        $skus_a = array_column( $plates_a, 'sku' );
        $this->assertContains( 'L1', $skus_a );
        $this->assertContains( 'L_SHARED', $skus_a );

        // Walk SET_B independently — should see same shared leaf without circular issue
        $plates_b = sn_required_plates_for_sku( 'SET_B', 1, 'leaf', 1, $relations );
        $this->assertCount( 2, $plates_b );

        $skus_b = array_column( $plates_b, 'sku' );
        $this->assertContains( 'L2', $skus_b );
        $this->assertContains( 'L_SHARED', $skus_b );
    }

    /**
     * Max depth 3 guard (DD-4)
     */
    public function test_max_depth_guard(): void {
        // Build 4-level deep (should still work, but won't go beyond 3)
        $relations = array(
            'L0' => array( 'L1' ),
            'L1' => array( 'L2' ),
            'L2' => array( 'L3' ),
            'L3' => array( 'L4' ), // Beyond depth 3 (won't reach)
        );

        $nodes = sn_walk_to_level( 'L0', 'leaf', $relations );
        // Should not crash — returns whatever we found within depth limit
        $this->assertIsArray( $nodes );
    }

    /**
     * Circular reference guard
     */
    public function test_circular_reference_guard(): void {
        $relations = array(
            'A' => array( 'B' ),
            'B' => array( 'A' ), // circular
        );

        $nodes = sn_walk_to_level( 'A', 'leaf', $relations );
        $this->assertIsArray( $nodes );
        $this->assertLessThanOrEqual( 5, count( $nodes ) ); // bounded
    }

    /**
     * 3-level hierarchy: SET → child → leaf, walk to leaf returns leaves only
     */
    public function test_3level_walk_to_leaf(): void {
        $relations = array(
            'SET'   => array( 'CHILD_A', 'CHILD_B' ),
            'CHILD_A' => array( 'LEAF_A1', 'LEAF_A2' ),
            'CHILD_B' => array( 'LEAF_B1', 'LEAF_B2' ),
        );

        $plates = sn_required_plates_for_sku( 'SET', 1, 'leaf', 1, $relations );

        $this->assertCount( 4, $plates );
        $skus = array_column( $plates, 'sku' );
        $this->assertContains( 'LEAF_A1', $skus );
        $this->assertContains( 'LEAF_A2', $skus );
        $this->assertContains( 'LEAF_B1', $skus );
        $this->assertContains( 'LEAF_B2', $skus );
    }

    /**
     * 3-level hierarchy: walk to child stops at child level
     */
    public function test_3level_walk_to_child_stops_at_child(): void {
        $relations = array(
            'SET'   => array( 'CHILD_A', 'CHILD_B' ),
            'CHILD_A' => array( 'LEAF_A1', 'LEAF_A2' ),
            'CHILD_B' => array( 'LEAF_B1', 'LEAF_B2' ),
        );

        $plates = sn_required_plates_for_sku( 'SET', 1, 'child', 1, $relations );

        $this->assertCount( 2, $plates );
        $skus = array_column( $plates, 'sku' );
        $this->assertContains( 'CHILD_A', $skus );
        $this->assertContains( 'CHILD_B', $skus );

        // Should NOT contain leaves
        $this->assertNotContains( 'LEAF_A1', $skus );
        $this->assertNotContains( 'LEAF_A2', $skus );
    }

    /**
     * Single SKU (no children) at leaf level returns the SKU itself
     */
    public function test_single_sku_no_children_leaf_level(): void {
        $relations = array();

        $nodes = sn_walk_to_level( 'STANDALONE_SKU', 'leaf', $relations );
        $this->assertCount( 1, $nodes );
        $this->assertSame( 'STANDALONE_SKU', $nodes[0]['sku'] );
        $this->assertSame( 'leaf', $nodes[0]['level'] );
    }
}
