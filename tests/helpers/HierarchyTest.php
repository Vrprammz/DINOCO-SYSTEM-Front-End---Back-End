<?php
/**
 * HierarchyTest — pure-logic test of SKU hierarchy traversal.
 *
 * Source: [B2B] Snippet 15: Custom Tables & JWT Session V.7.1+ line 1567+.
 *
 * Bug history (Snippet 15 V.7.1, 2026-04-10):
 *   - C1/C2: `dinoco_get_leaf_skus` + `dinoco_compute_hierarchy_stock` passed
 *     `&$visited` as REFERENCE → DD-3 shared child (sibling branches sharing
 *     visited state) caused second branch to hit `in_array($visited)` → return
 *     empty → stock SET wrong + double-subtract on cancel.
 *   - Fix: value-copy `$visited` per branch + `array_unique()` dedup.
 *
 * DD-3 = "Shared child allowed: a leaf can be child of multiple SETs"
 * DD-4 = "Max depth = 3 (SET → child → grandchild)"
 *
 * Tests use in-memory `$relations` (no get_option call) so they're truly pure.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_get_leaf_skus' ) ) {
    function dinoco_get_leaf_skus( $sku, array $relations, int $depth = 0, array $visited = array() ): array {
        if ( $depth > 3 ) return array( strtoupper( trim( (string) $sku ) ) );

        $sku_upper = strtoupper( trim( (string) $sku ) );

        if ( in_array( $sku_upper, $visited, true ) ) return array();
        $visited[] = $sku_upper;

        if ( ! isset( $relations[ $sku_upper ] ) || empty( $relations[ $sku_upper ] ) ) {
            if ( ! isset( $relations[ $sku ] ) || empty( $relations[ $sku ] ) ) {
                return array( $sku_upper );
            }
            $children = $relations[ $sku ];
        } else {
            $children = $relations[ $sku_upper ];
        }

        if ( ! is_array( $children ) || empty( $children ) ) {
            return array( $sku_upper );
        }

        $leaves = array();
        foreach ( $children as $child ) {
            $child_leaves = dinoco_get_leaf_skus( $child, $relations, $depth + 1, $visited );
            $leaves = array_merge( $leaves, $child_leaves );
        }

        return array_values( array_unique( $leaves ) );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_is_leaf_sku' ) ) {
    function dinoco_is_leaf_sku( $sku, array $relations ): bool {
        $sku_upper = strtoupper( trim( (string) $sku ) );
        if ( isset( $relations[ $sku_upper ] ) && ! empty( $relations[ $sku_upper ] ) ) return false;
        if ( isset( $relations[ $sku ] ) && ! empty( $relations[ $sku ] ) ) return false;
        return true;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_get_ancestor_skus' ) ) {
    function dinoco_get_ancestor_skus( $sku, array $relations ): array {
        // Build child→parent map inline (instead of static cached version)
        $map = array();
        foreach ( $relations as $p => $ch ) {
            if ( ! is_array( $ch ) ) continue;
            $pu = strtoupper( trim( (string) $p ) );
            foreach ( $ch as $c ) {
                $map[ strtoupper( trim( (string) $c ) ) ] = $pu;
            }
        }
        $ancestors = array();
        $current = strtoupper( trim( (string) $sku ) );
        for ( $i = 0; $i < 3; $i++ ) {
            if ( ! isset( $map[ $current ] ) ) break;
            $p = $map[ $current ];
            if ( in_array( $p, $ancestors, true ) ) break;
            $ancestors[] = $p;
            $current = $p;
        }
        return $ancestors;
    }
}

class HierarchyTest extends TestCase {

    /**
     * Standard 3-level: SET → CHILD → GRANDCHILD (leaf)
     *   SET_A → [CHILD_A]
     *   CHILD_A → [GC_A1, GC_A2]
     */
    private function relations_3level(): array {
        return array(
            'SET_A'   => array( 'CHILD_A' ),
            'CHILD_A' => array( 'GC_A1', 'GC_A2' ),
        );
    }

    /**
     * DD-3 SHARED CHILD scenario:
     *   SET_X → [CHILD_X1, CHILD_X2]
     *   CHILD_X1 → [LEAF_S, LEAF_X1_ONLY]
     *   CHILD_X2 → [LEAF_S, LEAF_X2_ONLY]
     *   LEAF_S is shared between CHILD_X1 + CHILD_X2.
     */
    private function relations_dd3_shared(): array {
        return array(
            'SET_X'    => array( 'CHILD_X1', 'CHILD_X2' ),
            'CHILD_X1' => array( 'LEAF_S', 'LEAF_X1_ONLY' ),
            'CHILD_X2' => array( 'LEAF_S', 'LEAF_X2_ONLY' ),
        );
    }

    // ─── dinoco_get_leaf_skus ────────────────────────────────────

    public function test_leaf_returns_self_when_no_children(): void {
        $this->assertSame( array( 'LEAF_X' ), dinoco_get_leaf_skus( 'LEAF_X', array() ) );
    }

    public function test_leaf_resolves_3level_hierarchy(): void {
        $leaves = dinoco_get_leaf_skus( 'SET_A', $this->relations_3level() );
        $this->assertEqualsCanonicalizing( array( 'GC_A1', 'GC_A2' ), $leaves );
    }

    public function test_leaf_resolves_2level_hierarchy(): void {
        $relations = array( 'SET_B' => array( 'LEAF_B1', 'LEAF_B2' ) );
        $leaves = dinoco_get_leaf_skus( 'SET_B', $relations );
        $this->assertEqualsCanonicalizing( array( 'LEAF_B1', 'LEAF_B2' ), $leaves );
    }

    /**
     * V.7.1 C1/C2 regression: DD-3 shared leaf must appear in the result
     * regardless of which path reaches it. Pre-V.7.1, the second branch
     * found LEAF_S in $visited and returned [] — losing the SKU entirely.
     */
    public function test_dd3_shared_child_appears_in_leaves(): void {
        $leaves = dinoco_get_leaf_skus( 'SET_X', $this->relations_dd3_shared() );
        // Expect LEAF_S to appear (deduplicated to once even though shared)
        $this->assertContains( 'LEAF_S', $leaves );
        $this->assertContains( 'LEAF_X1_ONLY', $leaves );
        $this->assertContains( 'LEAF_X2_ONLY', $leaves );
    }

    /**
     * V.7.1 dedup: shared leaf reached via multiple paths must appear ONCE
     * (otherwise dinoco_stock_subtract gets called twice → double-subtract).
     */
    public function test_dd3_shared_child_dedupes_to_single_entry(): void {
        $leaves = dinoco_get_leaf_skus( 'SET_X', $this->relations_dd3_shared() );
        $this->assertCount(
            1,
            array_filter( $leaves, fn( $l ) => $l === 'LEAF_S' ),
            'LEAF_S must appear exactly once (no double-subtract risk)'
        );
    }

    public function test_uppercase_normalization(): void {
        $relations = array( 'SET_A' => array( 'leaf_a' ) ); // lowercase child
        $leaves = dinoco_get_leaf_skus( 'set_a', $relations );
        $this->assertSame( array( 'LEAF_A' ), $leaves );
    }

    public function test_circular_reference_does_not_loop_forever(): void {
        // SET_A → CHILD_A → SET_A (cycle)
        $relations = array(
            'SET_A'   => array( 'CHILD_A' ),
            'CHILD_A' => array( 'SET_A' ),
        );
        // Must terminate; result is implementation-defined but cannot hang
        $leaves = dinoco_get_leaf_skus( 'SET_A', $relations );
        $this->assertIsArray( $leaves );
    }

    public function test_max_depth_3_hard_limit(): void {
        // 5-level chain — must hit DD-4 cap and stop traversal
        $relations = array(
            'L0' => array( 'L1' ),
            'L1' => array( 'L2' ),
            'L2' => array( 'L3' ),
            'L3' => array( 'L4' ),
            'L4' => array( 'L5' ),
        );
        $leaves = dinoco_get_leaf_skus( 'L0', $relations );
        // Should not recurse to L5 — terminates around depth 3
        $this->assertNotEmpty( $leaves );
    }

    // ─── dinoco_is_leaf_sku ──────────────────────────────────────

    public function test_is_leaf_true_when_no_children(): void {
        $this->assertTrue( dinoco_is_leaf_sku( 'GC_A1', $this->relations_3level() ) );
    }

    public function test_is_leaf_false_when_has_children(): void {
        $this->assertFalse( dinoco_is_leaf_sku( 'SET_A', $this->relations_3level() ) );
        $this->assertFalse( dinoco_is_leaf_sku( 'CHILD_A', $this->relations_3level() ) );
    }

    public function test_is_leaf_unknown_sku_treated_as_leaf(): void {
        // Unknown SKU not in relations — treated as leaf (defensive default)
        $this->assertTrue( dinoco_is_leaf_sku( 'UNKNOWN_SKU', array() ) );
    }

    // ─── dinoco_get_ancestor_skus ────────────────────────────────

    public function test_ancestors_returns_chain_to_root(): void {
        $rel = $this->relations_3level();
        $this->assertSame( array( 'CHILD_A', 'SET_A' ), dinoco_get_ancestor_skus( 'GC_A1', $rel ) );
    }

    public function test_ancestors_empty_for_root(): void {
        $this->assertSame( array(), dinoco_get_ancestor_skus( 'SET_A', $this->relations_3level() ) );
    }

    public function test_ancestors_dd3_shared_picks_one_path(): void {
        // LEAF_S has 2 parents (CHILD_X1 + CHILD_X2). The map only keeps the LAST
        // parent encountered during build — but ancestor walk produces a valid chain.
        $ancestors = dinoco_get_ancestor_skus( 'LEAF_S', $this->relations_dd3_shared() );
        $this->assertNotEmpty( $ancestors );
        $this->assertContains( 'SET_X', $ancestors );
    }

    public function test_ancestors_terminates_on_cycle(): void {
        $relations = array(
            'A' => array( 'B' ),
            'B' => array( 'A' ),
        );
        $ancestors = dinoco_get_ancestor_skus( 'B', $relations );
        // Must terminate — cycle guard prevents infinite loop
        $this->assertIsArray( $ancestors );
    }
}
