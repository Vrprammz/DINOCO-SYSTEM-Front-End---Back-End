<?php
/**
 * IsTopLevelSetTest — pure-logic test of `dinoco_is_top_level_set()`.
 *
 * Source: [B2B] Snippet 15: Custom Tables & JWT Session V.6.0+ lines 1736-1759
 *
 * Purpose: Locks the DD-6 invariant — "B2C does NOT see sub-SETs as
 * standalone bundles". Used to filter B2C member dashboards / catalogs /
 * top-level product listings so only TRUE top-level SETs (not children
 * of any other SET) appear as bundle products.
 *
 * Definition: SKU is "top-level SET" iff:
 *   1. It has children (is a parent in dinoco_sku_relations)
 *   2. It is NOT itself a child of any other SET
 *
 * Why this matters:
 *   - Wrong = TRUE → sub-SET appears as standalone B2C product →
 *     customer buys "half a kit" without realizing → claim/refund hell
 *   - Wrong = FALSE → real top-level SET hidden from B2C → lost sales,
 *     customer service tickets "ทำไมไม่มีกันล้มสำหรับรุ่นนี้?"
 *
 * Hierarchy depth invariant (DD-4): max 3 levels (SET → CHILD → GRANDCHILD).
 * For DD-3 shared child: a CHILD of multiple SETs is still NOT top-level
 * (it has parents) — this test suite covers that.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// Inline copy of helper under test (mirrors snippet exactly — no DB/WP deps).
// Adapter: $relations passed by-arg instead of via get_option('dinoco_sku_relations').
if ( ! function_exists( __NAMESPACE__ . '\\dinoco_is_top_level_set' ) ) {
    function dinoco_is_top_level_set( $sku, array $relations ): bool {
        $sku_upper = strtoupper( trim( (string) $sku ) );

        // Must be a parent (have children)
        $is_parent = ( isset( $relations[ $sku_upper ] ) && ! empty( $relations[ $sku_upper ] ) )
                  || ( isset( $relations[ $sku ] ) && ! empty( $relations[ $sku ] ) );
        if ( ! $is_parent ) return false;

        // Must NOT be a child of any other parent
        foreach ( $relations as $parent => $children ) {
            if ( ! is_array( $children ) ) continue;
            $children_upper = array_map( function( $c ) { return strtoupper( trim( (string) $c ) ); }, $children );
            if ( in_array( $sku_upper, $children_upper, true ) ) {
                return false; // child of $parent → not top-level
            }
        }
        return true;
    }
}

class IsTopLevelSetTest extends TestCase {

    /**
     * Standard hierarchy:
     *   SET_A → [CHILD_A1, CHILD_A2]   (top-level SET)
     *   CHILD_A1 → [LEAF_1, LEAF_2]    (intermediate, NOT top-level)
     */
    private function relations_3level(): array {
        return array(
            'SET_A'    => array( 'CHILD_A1', 'CHILD_A2' ),
            'CHILD_A1' => array( 'LEAF_1', 'LEAF_2' ),
        );
    }

    /**
     * DD-3 shared child scenario:
     *   SET_X → [CHILD_X1]
     *   SET_Y → [CHILD_X1]   ← CHILD_X1 shared between 2 top-level SETs
     *   CHILD_X1 → [LEAF_S]
     */
    private function relations_dd3_shared(): array {
        return array(
            'SET_X'    => array( 'CHILD_X1' ),
            'SET_Y'    => array( 'CHILD_X1' ),
            'CHILD_X1' => array( 'LEAF_S' ),
        );
    }

    // ════════════════════════════════════════════════════════════════
    // POSITIVE CASES — top-level SET should return true
    // ════════════════════════════════════════════════════════════════

    public function test_top_level_set_with_children_returns_true(): void {
        // SET_A has children + is not a child of anyone → top-level
        $this->assertTrue(
            dinoco_is_top_level_set( 'SET_A', $this->relations_3level() )
        );
    }

    public function test_two_level_top_set_returns_true(): void {
        // Simplest case: SET → leaves directly (no intermediate child)
        $relations = array( 'SET_B' => array( 'LEAF_B1', 'LEAF_B2' ) );
        $this->assertTrue( dinoco_is_top_level_set( 'SET_B', $relations ) );
    }

    public function test_dd3_both_parents_are_top_level(): void {
        // SET_X and SET_Y both share CHILD_X1, but each is a TOP-LEVEL SET
        // (neither appears as anyone's child).
        $rel = $this->relations_dd3_shared();
        $this->assertTrue( dinoco_is_top_level_set( 'SET_X', $rel ) );
        $this->assertTrue( dinoco_is_top_level_set( 'SET_Y', $rel ) );
    }

    public function test_lowercase_input_normalized_to_uppercase(): void {
        // Admin may type lowercase — case-insensitive match
        $rel = $this->relations_3level();
        $this->assertTrue( dinoco_is_top_level_set( 'set_a', $rel ) );
        $this->assertTrue( dinoco_is_top_level_set( 'Set_A', $rel ) );
    }

    public function test_whitespace_around_input_trimmed(): void {
        // CSV import + admin paste often introduces trailing whitespace
        $rel = $this->relations_3level();
        $this->assertTrue( dinoco_is_top_level_set( '  SET_A  ', $rel ) );
    }

    // ════════════════════════════════════════════════════════════════
    // NEGATIVE CASES — non-top-level should return false
    // ════════════════════════════════════════════════════════════════

    public function test_intermediate_child_is_not_top_level(): void {
        // CHILD_A1 has children (LEAF_1/LEAF_2) BUT is also a child of SET_A
        // → must NOT appear as standalone B2C bundle (DD-6)
        $this->assertFalse(
            dinoco_is_top_level_set( 'CHILD_A1', $this->relations_3level() )
        );
    }

    public function test_leaf_sku_is_not_top_level(): void {
        // LEAF_1 has no children → not a parent → not a SET at all
        $this->assertFalse(
            dinoco_is_top_level_set( 'LEAF_1', $this->relations_3level() )
        );
    }

    public function test_unknown_sku_is_not_top_level(): void {
        // Unknown SKU not in relations → no children → not a SET
        $this->assertFalse(
            dinoco_is_top_level_set( 'UNKNOWN_SKU', $this->relations_3level() )
        );
    }

    public function test_dd3_shared_child_is_not_top_level(): void {
        // CHILD_X1 has children + 2 parents → still not top-level
        // (has ANY parent disqualifies, regardless of count)
        $this->assertFalse(
            dinoco_is_top_level_set( 'CHILD_X1', $this->relations_dd3_shared() )
        );
    }

    public function test_empty_relations_returns_false(): void {
        // No relations at all → no SET can be top-level
        $this->assertFalse( dinoco_is_top_level_set( 'SET_A', array() ) );
    }

    public function test_empty_children_array_treated_as_not_parent(): void {
        // Edge case: SET registered but with empty children list (malformed)
        $relations = array( 'SET_X' => array() );
        $this->assertFalse( dinoco_is_top_level_set( 'SET_X', $relations ) );
    }

    public function test_single_leaf_sku_alone_is_not_top_level(): void {
        // No hierarchy at all — bare SKU never qualifies
        $relations = array();
        $this->assertFalse( dinoco_is_top_level_set( 'BARE_SKU', $relations ) );
    }

    // ════════════════════════════════════════════════════════════════
    // EDGE CASES — defensive behavior
    // ════════════════════════════════════════════════════════════════

    public function test_children_with_lowercase_in_relations_match(): void {
        // Admin saves child SKUs lowercase by mistake — must still detect
        // that SKU is a child (not top-level)
        $relations = array(
            'SET_Z' => array( 'child_z' ), // lowercase child
        );
        $this->assertFalse(
            dinoco_is_top_level_set( 'CHILD_Z', $relations ),
            'CHILD_Z should be detected as child of SET_Z despite case difference'
        );
    }

    public function test_children_with_whitespace_in_relations_match(): void {
        // CSV import bug — children list has whitespace around SKUs
        $relations = array(
            'SET_W' => array( '  CHILD_W  ' ),
        );
        $this->assertFalse(
            dinoco_is_top_level_set( 'CHILD_W', $relations ),
            'CHILD_W should be detected as child despite whitespace in relations'
        );
    }

    public function test_non_array_children_value_skipped_safely(): void {
        // Defensive — corrupted relations data has scalar instead of array
        // (e.g. legacy migration mishap). Must not crash.
        $relations = array(
            'SET_OK'      => array( 'CHILD_OK' ),
            'SET_BROKEN'  => 'not_an_array',  // ← broken
        );
        // SET_OK is still detectable
        $this->assertTrue( dinoco_is_top_level_set( 'SET_OK', $relations ) );
        // CHILD_OK still detected as child (not top-level)
        $this->assertFalse( dinoco_is_top_level_set( 'CHILD_OK', $relations ) );
    }

    public function test_empty_string_input_returns_false(): void {
        // Defensive — empty SKU input
        $this->assertFalse( dinoco_is_top_level_set( '', $this->relations_3level() ) );
    }

    public function test_whitespace_only_input_returns_false(): void {
        $this->assertFalse( dinoco_is_top_level_set( '   ', $this->relations_3level() ) );
    }

    // ════════════════════════════════════════════════════════════════
    // INVARIANT — DD-6 documentation lock
    // ════════════════════════════════════════════════════════════════

    public function test_dd6_invariant_b2c_filter_correctness(): void {
        // Real-world example matching DINOCO catalog:
        //   DNCSETXL7500X001H → top-level SET (gold tier)
        //   DNCSETNX500IRNB   → top-level SET (silver tier — orphan auto-sync test case)
        //   DNCGNDPRO5500     → shared LEAF (used in multiple SETs, not top-level)
        $catalog = array(
            'DNCSETXL7500X001H' => array( 'DNCXL7500UPPER', 'DNCGNDPRO5500' ),
            'DNCSETNX500IRNB'   => array( 'DNCNX500UPPER',  'DNCGNDPRO5500' ),
        );
        // Both SETs visible to B2C
        $this->assertTrue(
            dinoco_is_top_level_set( 'DNCSETXL7500X001H', $catalog )
        );
        $this->assertTrue(
            dinoco_is_top_level_set( 'DNCSETNX500IRNB', $catalog )
        );
        // Shared leaf NEVER appears as standalone B2C bundle
        $this->assertFalse(
            dinoco_is_top_level_set( 'DNCGNDPRO5500', $catalog ),
            'DD-3 shared leaf must not be flagged as top-level SET (B2C visibility)'
        );
        // Sub-component NEVER as B2C bundle
        $this->assertFalse(
            dinoco_is_top_level_set( 'DNCXL7500UPPER', $catalog )
        );
    }
}
