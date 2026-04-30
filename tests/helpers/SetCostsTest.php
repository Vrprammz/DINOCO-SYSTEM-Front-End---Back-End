<?php
/**
 * SetCostsTest — pure-logic test of `b2f_compute_set_costs_v918()`.
 *
 * Source: [B2F] Snippet 2: REST API V.10.0+ line 1458.
 *
 * Function aggregates leaf unit_costs (+ shipping) onto SET parents — the
 * design rule from V.11.3 (commit 7e6b726) — "SET has NO manual price; it's
 * an aggregate of its leaves." Stale junction `unit_cost` values become dead
 * data; LIFF/Admin always show the recomputed sum.
 *
 * Used by:
 *   - `b2f_rest_list_maker_products()` (Snippet 2 V.10.0+) — every API call
 *     that returns the maker's product catalog runs this AFTER junction read
 *     to override SET unit_cost with sum of leaves.
 *   - LIFF E-Catalog (Snippet 8) reads computed values via `unit_cost` field.
 *   - Admin Makers tab (Snippet 5 V.7.3) renders read-only badge with
 *     `unit_cost_complete` flag (green/amber/red).
 *
 * Critical invariants this test locks in:
 *   - SET with all leaves registered → unit_cost = sum, complete = true.
 *   - SET with partial leaves        → unit_cost = sum of registered,
 *                                       complete = false, missing[] populated.
 *   - SET with NO leaves registered  → unit_cost preserved (fallback) — does
 *                                       NOT override with 0 (would hide price).
 *   - Non-SET products               → untouched.
 *   - Empty inputs                    → return $products (no crash).
 *   - Self-loop guard                 → leaf == sku skipped.
 *   - 3-level hierarchy (SET→child→leaves) → only leaves counted, not the
 *                                       intermediate child.
 *   - Shipping land/sea               → summed only when SET has empty value
 *                                       (don't override explicit shipping).
 *   - DD-3 shared leaf                → not double-counted across SETs (each
 *                                       SET independently walks its tree;
 *                                       shared leaf counts once per SET).
 *   - `unit_cost_stored` snapshot    → preserves admin's original value for
 *                                       audit / future override.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\b2f_compute_set_costs_v918' ) ) {
    /**
     * Inline copy mirrors source line-for-line.
     * Behavioural diff is intentionally zero — tests verify the exact same logic.
     */
    function b2f_compute_set_costs_v918( $products, $rel_upper ) {
        if ( empty( $products ) || empty( $rel_upper ) ) return $products;

        // Build sku → product index (uppercase key).
        $by_sku = array();
        foreach ( $products as $idx => $p ) {
            $sku_u = strtoupper( $p['sku'] ?? '' );
            if ( $sku_u !== '' ) $by_sku[ $sku_u ] = $idx;
        }

        // Recursive leaf collector with cycle guard.
        $collect_leaves = function( $sku_u, &$visited ) use ( $rel_upper, &$collect_leaves ) {
            if ( isset( $visited[ $sku_u ] ) ) return array();
            $visited[ $sku_u ] = true;
            $children = isset( $rel_upper[ $sku_u ] ) ? $rel_upper[ $sku_u ] : array();
            if ( empty( $children ) ) return array( $sku_u ); // leaf
            $leaves = array();
            foreach ( $children as $ch ) {
                $leaves = array_merge( $leaves, $collect_leaves( $ch, $visited ) );
            }
            return $leaves;
        };

        foreach ( $products as $idx => $p ) {
            $is_set = ( ( $p['product_type'] ?? 'single' ) === 'set' );
            if ( ! $is_set ) continue;

            $sku_u = strtoupper( $p['sku'] ?? '' );
            if ( $sku_u === '' || empty( $rel_upper[ $sku_u ] ) ) continue;

            $visited = array();
            $leaves = $collect_leaves( $sku_u, $visited );

            $computed_cost  = 0.0;
            $computed_land  = 0.0;
            $computed_sea   = 0.0;
            $registered_cnt = 0;
            $missing_leaves = array();

            foreach ( $leaves as $leaf_u ) {
                if ( $leaf_u === $sku_u ) continue; // self-loop guard
                if ( isset( $by_sku[ $leaf_u ] ) ) {
                    $leaf_p = $products[ $by_sku[ $leaf_u ] ];
                    $lc = floatval( $leaf_p['unit_cost'] ?? 0 );
                    $ll = floatval( $leaf_p['shipping_land'] ?? 0 );
                    $ls = floatval( $leaf_p['shipping_sea'] ?? 0 );
                    if ( $lc > 0 ) {
                        $computed_cost  += $lc;
                        $computed_land  += $ll;
                        $computed_sea   += $ls;
                        $registered_cnt++;
                    } else {
                        $missing_leaves[] = $leaf_u;
                    }
                } else {
                    $missing_leaves[] = $leaf_u;
                }
            }

            if ( $registered_cnt > 0 && $computed_cost > 0 ) {
                $products[ $idx ]['unit_cost_stored']     = floatval( $p['unit_cost'] ?? 0 );
                $products[ $idx ]['unit_cost']            = $computed_cost;
                $products[ $idx ]['unit_cost_computed']   = true;
                $products[ $idx ]['unit_cost_complete']   = empty( $missing_leaves );
                $products[ $idx ]['unit_cost_leaf_count'] = $registered_cnt;
                $products[ $idx ]['unit_cost_missing']    = $missing_leaves;
                if ( $computed_land > 0 && empty( $p['shipping_land'] ) ) {
                    $products[ $idx ]['shipping_land'] = $computed_land;
                }
                if ( $computed_sea > 0 && empty( $p['shipping_sea'] ) ) {
                    $products[ $idx ]['shipping_sea'] = $computed_sea;
                }
            }
        }

        return $products;
    }
}

/**
 * @covers \DinocoTests\Helpers\b2f_compute_set_costs_v918
 */
final class SetCostsTest extends TestCase {

    /**
     * Helper to extract a row by SKU from the returned $products array.
     */
    private function findBySku( array $products, string $sku ): ?array {
        foreach ( $products as $p ) {
            if ( ( $p['sku'] ?? '' ) === $sku ) return $p;
        }
        return null;
    }

    public function test_empty_products_returns_unchanged(): void {
        $rel = array( 'SET1' => array( 'L1', 'L2' ) );
        $this->assertSame( array(), b2f_compute_set_costs_v918( array(), $rel ) );
    }

    public function test_empty_relations_returns_unchanged(): void {
        $products = array(
            array( 'sku' => 'SET1', 'product_type' => 'set', 'unit_cost' => 100.0 ),
        );
        // Empty relations → no SETs to compute → input passthrough.
        $this->assertSame( $products, b2f_compute_set_costs_v918( $products, array() ) );
    }

    public function test_set_with_all_leaves_registered_sums_costs(): void {
        $products = array(
            array( 'sku' => 'SET1', 'product_type' => 'set',  'unit_cost' => 999.0 ),
            array( 'sku' => 'L1',   'product_type' => 'single', 'unit_cost' => 100.0 ),
            array( 'sku' => 'L2',   'product_type' => 'single', 'unit_cost' => 200.0 ),
            array( 'sku' => 'L3',   'product_type' => 'single', 'unit_cost' => 50.0  ),
        );
        $rel = array( 'SET1' => array( 'L1', 'L2', 'L3' ) );

        $result = b2f_compute_set_costs_v918( $products, $rel );
        $set    = $this->findBySku( $result, 'SET1' );

        $this->assertNotNull( $set );
        $this->assertSame( 350.0, $set['unit_cost'] );           // 100 + 200 + 50
        $this->assertSame( 999.0, $set['unit_cost_stored'] );    // original preserved
        $this->assertTrue( $set['unit_cost_computed'] );
        $this->assertTrue( $set['unit_cost_complete'] );
        $this->assertSame( 3, $set['unit_cost_leaf_count'] );
        $this->assertSame( array(), $set['unit_cost_missing'] );
    }

    public function test_set_with_partial_leaves_marked_incomplete(): void {
        $products = array(
            array( 'sku' => 'SET1', 'product_type' => 'set',    'unit_cost' => 999.0 ),
            array( 'sku' => 'L1',   'product_type' => 'single', 'unit_cost' => 100.0 ),
            // L2 NOT in $products (not registered to this maker)
            array( 'sku' => 'L3',   'product_type' => 'single', 'unit_cost' => 50.0  ),
        );
        $rel = array( 'SET1' => array( 'L1', 'L2', 'L3' ) );

        $result = b2f_compute_set_costs_v918( $products, $rel );
        $set    = $this->findBySku( $result, 'SET1' );

        $this->assertSame( 150.0, $set['unit_cost'] );           // only L1 + L3
        $this->assertFalse( $set['unit_cost_complete'] );
        $this->assertSame( 2, $set['unit_cost_leaf_count'] );
        $this->assertSame( array( 'L2' ), $set['unit_cost_missing'] );
    }

    public function test_set_with_zero_cost_leaf_is_missing(): void {
        // Leaf registered but unit_cost = 0 → counted as missing (no usable data).
        $products = array(
            array( 'sku' => 'SET1', 'product_type' => 'set',    'unit_cost' => 999.0 ),
            array( 'sku' => 'L1',   'product_type' => 'single', 'unit_cost' => 100.0 ),
            array( 'sku' => 'L2',   'product_type' => 'single', 'unit_cost' => 0.0 ),
        );
        $rel = array( 'SET1' => array( 'L1', 'L2' ) );

        $result = b2f_compute_set_costs_v918( $products, $rel );
        $set    = $this->findBySku( $result, 'SET1' );

        $this->assertSame( 100.0, $set['unit_cost'] );
        $this->assertFalse( $set['unit_cost_complete'] );
        $this->assertSame( array( 'L2' ), $set['unit_cost_missing'] );
    }

    public function test_set_with_no_registered_leaves_preserves_unit_cost(): void {
        // None of the leaves are registered for this maker → SET unit_cost
        // should NOT be overwritten with 0 (would hide price in LIFF).
        $products = array(
            array( 'sku' => 'SET1', 'product_type' => 'set', 'unit_cost' => 555.0 ),
        );
        $rel = array( 'SET1' => array( 'L1', 'L2' ) );

        $result = b2f_compute_set_costs_v918( $products, $rel );
        $set    = $this->findBySku( $result, 'SET1' );

        // unit_cost preserved (fallback design — Snippet 2 line 1531).
        $this->assertSame( 555.0, $set['unit_cost'] );
        // No computed flags set — admin sees stored value.
        $this->assertArrayNotHasKey( 'unit_cost_computed', $set );
        $this->assertArrayNotHasKey( 'unit_cost_complete', $set );
    }

    public function test_non_set_products_untouched(): void {
        $products = array(
            array( 'sku' => 'L1', 'product_type' => 'single', 'unit_cost' => 100.0 ),
            array( 'sku' => 'L2', 'product_type' => 'child',  'unit_cost' => 200.0 ),
        );
        $rel = array(); // even with empty rel, single + child untouched

        $result = b2f_compute_set_costs_v918( $products, $rel );

        $this->assertSame( 100.0, $result[0]['unit_cost'] );
        $this->assertSame( 200.0, $result[1]['unit_cost'] );
        $this->assertArrayNotHasKey( 'unit_cost_computed', $result[0] );
        $this->assertArrayNotHasKey( 'unit_cost_computed', $result[1] );
    }

    public function test_three_level_hierarchy_aggregates_only_leaves(): void {
        // SET → CHILD → [GC1, GC2]: should sum GC costs (NOT child),
        // because the recursive walker keeps descending until no children remain.
        $products = array(
            array( 'sku' => 'SET1', 'product_type' => 'set',    'unit_cost' => 999.0 ),
            array( 'sku' => 'CHILD', 'product_type' => 'set',   'unit_cost' => 888.0 ), // intermediate (also has children)
            array( 'sku' => 'GC1',  'product_type' => 'single', 'unit_cost' => 30.0 ),
            array( 'sku' => 'GC2',  'product_type' => 'single', 'unit_cost' => 70.0 ),
        );
        $rel = array(
            'SET1'  => array( 'CHILD' ),
            'CHILD' => array( 'GC1', 'GC2' ),
        );

        $result = b2f_compute_set_costs_v918( $products, $rel );
        $set    = $this->findBySku( $result, 'SET1' );
        $child  = $this->findBySku( $result, 'CHILD' );

        // SET1 = sum of leaves (GC1 + GC2) = 100, NOT including intermediate CHILD's stored 888.
        $this->assertSame( 100.0, $set['unit_cost'] );
        $this->assertTrue( $set['unit_cost_complete'] );
        $this->assertSame( 2, $set['unit_cost_leaf_count'] );

        // CHILD itself is also a SET → recomputed as sum of its own leaves.
        $this->assertSame( 100.0, $child['unit_cost'] );
        $this->assertTrue( $child['unit_cost_complete'] );
    }

    public function test_shipping_land_summed_when_set_empty(): void {
        $products = array(
            array(
                'sku' => 'SET1', 'product_type' => 'set',
                'unit_cost' => 999.0, 'shipping_land' => 0, // empty → will be filled
            ),
            array(
                'sku' => 'L1', 'product_type' => 'single',
                'unit_cost' => 100.0, 'shipping_land' => 25.0,
            ),
            array(
                'sku' => 'L2', 'product_type' => 'single',
                'unit_cost' => 200.0, 'shipping_land' => 50.0,
            ),
        );
        $rel = array( 'SET1' => array( 'L1', 'L2' ) );

        $result = b2f_compute_set_costs_v918( $products, $rel );
        $set    = $this->findBySku( $result, 'SET1' );

        $this->assertSame( 75.0, $set['shipping_land'] );
    }

    public function test_shipping_land_preserved_when_explicitly_set(): void {
        // Admin set shipping explicitly → don't override even if leaves sum higher.
        $products = array(
            array(
                'sku' => 'SET1', 'product_type' => 'set',
                'unit_cost' => 999.0, 'shipping_land' => 100.0, // explicit value
            ),
            array(
                'sku' => 'L1', 'product_type' => 'single',
                'unit_cost' => 50.0, 'shipping_land' => 25.0,
            ),
            array(
                'sku' => 'L2', 'product_type' => 'single',
                'unit_cost' => 50.0, 'shipping_land' => 25.0,
            ),
        );
        $rel = array( 'SET1' => array( 'L1', 'L2' ) );

        $result = b2f_compute_set_costs_v918( $products, $rel );
        $set    = $this->findBySku( $result, 'SET1' );

        $this->assertSame( 100.0, $set['shipping_land'] );  // preserved
    }

    public function test_dd3_shared_leaf_counted_per_set_independently(): void {
        // L1 is shared between SET1 and SET2 (DD-3 — shared leaf allowed).
        // Each SET walks its own tree → L1's cost contributes to both — that's
        // correct because each SET represents a distinct order configuration.
        $products = array(
            array( 'sku' => 'SET1', 'product_type' => 'set',    'unit_cost' => 999.0 ),
            array( 'sku' => 'SET2', 'product_type' => 'set',    'unit_cost' => 888.0 ),
            array( 'sku' => 'L1',   'product_type' => 'single', 'unit_cost' => 100.0 ),
            array( 'sku' => 'L2',   'product_type' => 'single', 'unit_cost' => 200.0 ),
            array( 'sku' => 'L3',   'product_type' => 'single', 'unit_cost' => 300.0 ),
        );
        $rel = array(
            'SET1' => array( 'L1', 'L2' ),
            'SET2' => array( 'L1', 'L3' ),
        );

        $result = b2f_compute_set_costs_v918( $products, $rel );
        $set1   = $this->findBySku( $result, 'SET1' );
        $set2   = $this->findBySku( $result, 'SET2' );

        $this->assertSame( 300.0, $set1['unit_cost'] ); // 100 + 200
        $this->assertSame( 400.0, $set2['unit_cost'] ); // 100 + 300
    }

    public function test_lowercase_sku_normalized_via_uppercase_lookup(): void {
        // sku_relations key is uppercase ('set1' product matched via UPPER()).
        $products = array(
            array( 'sku' => 'set1', 'product_type' => 'set',    'unit_cost' => 999.0 ),
            array( 'sku' => 'l1',   'product_type' => 'single', 'unit_cost' => 100.0 ),
            array( 'sku' => 'l2',   'product_type' => 'single', 'unit_cost' => 200.0 ),
        );
        $rel = array( 'SET1' => array( 'L1', 'L2' ) );

        $result = b2f_compute_set_costs_v918( $products, $rel );
        $set    = $this->findBySku( $result, 'set1' );

        $this->assertSame( 300.0, $set['unit_cost'] );
        $this->assertTrue( $set['unit_cost_complete'] );
    }

    public function test_self_loop_in_relations_is_safely_skipped(): void {
        // Relation 'SET1' => ['SET1'] would infinite-loop without visited guard.
        $products = array(
            array( 'sku' => 'SET1', 'product_type' => 'set', 'unit_cost' => 555.0 ),
        );
        $rel = array( 'SET1' => array( 'SET1' ) );

        $result = b2f_compute_set_costs_v918( $products, $rel );
        $set    = $this->findBySku( $result, 'SET1' );

        // Visited guard returns empty → no leaves found → preserve original.
        $this->assertSame( 555.0, $set['unit_cost'] );
    }

    public function test_unit_cost_stored_snapshots_admin_value(): void {
        // The original `unit_cost` should be archived under `unit_cost_stored`
        // for audit / future override reference (e.g. price drift detection).
        $products = array(
            array( 'sku' => 'SET1', 'product_type' => 'set',    'unit_cost' => 9999.99 ),
            array( 'sku' => 'L1',   'product_type' => 'single', 'unit_cost' => 100.0 ),
        );
        $rel = array( 'SET1' => array( 'L1' ) );

        $result = b2f_compute_set_costs_v918( $products, $rel );
        $set    = $this->findBySku( $result, 'SET1' );

        $this->assertSame( 9999.99, $set['unit_cost_stored'] );
        $this->assertSame( 100.0,   $set['unit_cost'] ); // overridden by computed
    }
}
