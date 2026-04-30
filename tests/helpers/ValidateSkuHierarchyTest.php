<?php
/**
 * ValidateSkuHierarchyTest — pure-logic test of `dinoco_validate_sku_hierarchy()`.
 *
 * Source: [B2B] Snippet 15: Custom Tables & JWT Session V.7.1+ lines 1769-1804.
 *
 * Purpose: pre-save validator for `dinoco_sku_relations` mutations.
 * Returns `true` if `$child_sku` can safely be added under `$parent_sku`.
 * Returns `false` for:
 *   - self-reference (parent === child)
 *   - circular reference (child is ancestor of parent — DD-4 invariant)
 *   - depth violation (parent_depth + 1 + child_max_depth > 3 — DD-4)
 *
 * Allows:
 *   - DD-3 shared child (leaf can be child of multiple SETs — composite is fine)
 *   - case-insensitive comparison (uppercase normalize)
 *   - whitespace tolerance (trim)
 *
 * Critical defense: this guards Admin Inventory V.42.x save_sku_relation
 * endpoint. Bypass = corrupted hierarchy → DD-2 stock cut chain explodes
 * (infinite recursion in dinoco_get_leaf_skus, MIN() returns 0, etc.).
 *
 * Round 17 Phase 2 — UI safety guard (Inventory Admin save).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// ─── Inline copy: dinoco_get_ancestor_skus (HierarchyTest already declares
//     this in same namespace; guard to prevent redeclare on isolated runs) ───
if ( ! function_exists( __NAMESPACE__ . '\\dinoco_get_ancestor_skus' ) ) {
    function dinoco_get_ancestor_skus( $sku, array $relations ): array {
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

// ─── Inline copy: dinoco_validate_sku_hierarchy (lines 1770-1804) ───
if ( ! function_exists( __NAMESPACE__ . '\\dinoco_validate_sku_hierarchy' ) ) {
    function dinoco_validate_sku_hierarchy( $parent_sku, $child_sku, array $relations ): bool {
        $parent_upper = strtoupper( trim( (string) $parent_sku ) );
        $child_upper  = strtoupper( trim( (string) $child_sku ) );

        // self reference
        if ( $parent_upper === $child_upper ) return false;

        // circular: child must not be ancestor of parent
        $parent_ancestors = dinoco_get_ancestor_skus( $parent_upper, $relations );
        if ( in_array( $child_upper, $parent_ancestors, true ) ) return false;

        // depth: parent_depth + 1 (child) + child_max_depth must not exceed 3
        $parent_depth = count( dinoco_get_ancestor_skus( $parent_upper, $relations ) ) + 1;
        $child_max_depth = 0;
        if ( isset( $relations[ $child_upper ] ) && ! empty( $relations[ $child_upper ] ) ) {
            $child_max_depth = 1;
            foreach ( $relations[ $child_upper ] as $gc ) {
                $gc_upper = strtoupper( trim( (string) $gc ) );
                if ( isset( $relations[ $gc_upper ] ) && ! empty( $relations[ $gc_upper ] ) ) {
                    $child_max_depth = 2;
                    break;
                }
            }
        }

        if ( $parent_depth + 1 + $child_max_depth > 3 ) return false;

        return true;
    }
}

class ValidateSkuHierarchyTest extends TestCase {

    /**
     * Standard 3-level fixture:
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
     * 2-level fixture (set + leaves only):
     *   SET_B → [LEAF_X, LEAF_Y]
     */
    private function relations_2level(): array {
        return array(
            'SET_B' => array( 'LEAF_X', 'LEAF_Y' ),
        );
    }

    /**
     * DD-3 shared leaf:
     *   SET_A → [LEAF_S]
     *   SET_B → [LEAF_S]
     */
    private function relations_dd3_shared(): array {
        return array(
            'SET_A' => array( 'LEAF_S' ),
            'SET_B' => array( 'LEAF_S' ),
        );
    }

    // ─── Self-reference rejection ────────────────────────────────────

    public function test_self_reference_rejected(): void {
        $this->assertFalse( dinoco_validate_sku_hierarchy( 'SET_A', 'SET_A', array() ) );
    }

    public function test_self_reference_case_insensitive(): void {
        // 'set_a' uppercased to 'SET_A' === 'SET_A'
        $this->assertFalse( dinoco_validate_sku_hierarchy( 'SET_A', 'set_a', array() ) );
    }

    public function test_self_reference_whitespace_normalized(): void {
        // '  SET_A  ' trimmed to 'SET_A' === 'SET_A'
        $this->assertFalse( dinoco_validate_sku_hierarchy( '  SET_A  ', 'SET_A', array() ) );
    }

    // ─── Circular reference rejection ────────────────────────────────

    public function test_circular_2level_child_is_parent_of_parent(): void {
        // CHILD_A is parent of GC_A1 → cannot add CHILD_A under GC_A1
        $rel = $this->relations_3level();
        $this->assertFalse( dinoco_validate_sku_hierarchy( 'GC_A1', 'CHILD_A', $rel ) );
    }

    public function test_circular_3level_child_is_top_ancestor(): void {
        // SET_A is top ancestor of GC_A1 → cannot add SET_A under GC_A1
        $rel = $this->relations_3level();
        $this->assertFalse( dinoco_validate_sku_hierarchy( 'GC_A1', 'SET_A', $rel ) );
    }

    public function test_circular_case_insensitive(): void {
        $rel = $this->relations_3level();
        $this->assertFalse( dinoco_validate_sku_hierarchy( 'gc_a1', 'set_a', $rel ) );
    }

    // ─── Depth violation rejection ───────────────────────────────────

    public function test_depth_4_rejected_grandchild_to_grandchild(): void {
        // Adding GC_A1 (which has no children) under another grandchild GC_A2
        // GC_A2 is at depth 3 → depth 4 not allowed
        $rel = $this->relations_3level();
        $this->assertFalse( dinoco_validate_sku_hierarchy( 'GC_A2', 'GC_A1', $rel ) );
    }

    public function test_depth_violation_when_child_has_grandchildren(): void {
        // Adding CHILD_A (which already has GC_A1, GC_A2) under SET_B
        // SET_B (depth 1) + CHILD_A (depth 2) + GC_A1 (depth 3) = depth 3 → OK
        // But adding it under another existing CHILD makes total depth 4
        $rel = array(
            'SET_X'    => array( 'INTERMEDIATE' ),
            'CHILD_A'  => array( 'GC_A1' ),  // CHILD_A has 1 level of grandchildren
        );
        // Adding CHILD_A under INTERMEDIATE (depth 2) → INTERMEDIATE.CHILD_A.GC_A1 = depth 4
        $this->assertFalse( dinoco_validate_sku_hierarchy( 'INTERMEDIATE', 'CHILD_A', $rel ) );
    }

    // ─── Allowed cases ───────────────────────────────────────────────

    public function test_add_leaf_to_empty_set_allowed(): void {
        // Empty relations + adding NEW_LEAF under NEW_SET → depth 1+1+0 = 2 ≤ 3
        $this->assertTrue( dinoco_validate_sku_hierarchy( 'NEW_SET', 'NEW_LEAF', array() ) );
    }

    public function test_add_grandchild_to_existing_child_allowed(): void {
        // SET_B (depth 1) + LEAF_X (depth 2) → adding NEW_GC under LEAF_X = depth 3 OK
        $rel = $this->relations_2level();
        $this->assertTrue( dinoco_validate_sku_hierarchy( 'LEAF_X', 'NEW_GC', $rel ) );
    }

    public function test_dd3_shared_leaf_allowed(): void {
        // DD-3: same leaf (LEAF_S) already child of SET_A, adding under SET_B is OK
        $rel = $this->relations_dd3_shared();
        // Re-add LEAF_S under SET_A (already there) — should still pass validation
        // (uniqueness is enforced at storage layer, not validator)
        $this->assertTrue( dinoco_validate_sku_hierarchy( 'SET_A', 'LEAF_S', $rel ) );
    }

    public function test_unrelated_skus_can_be_linked(): void {
        // No prior relationship between FOO and BAR → can link
        $rel = $this->relations_3level();
        $this->assertTrue( dinoco_validate_sku_hierarchy( 'FOO', 'BAR', $rel ) );
    }

    // ─── Edge: case + whitespace normalization ──────────────────────

    public function test_case_insensitive_parent_lookup(): void {
        // Parent stored uppercase, lookup with lowercase
        $rel = $this->relations_3level();
        $this->assertTrue( dinoco_validate_sku_hierarchy( 'set_a', 'NEW_LEAF_2', $rel ) );
    }

    public function test_whitespace_around_skus_trimmed(): void {
        $rel = $this->relations_3level();
        $this->assertTrue( dinoco_validate_sku_hierarchy( '  SET_A  ', '  NEW_LEAF  ', $rel ) );
    }

    // ─── Boundary: exactly at depth limit ───────────────────────────

    public function test_exactly_depth_3_allowed(): void {
        // SET_A (depth 1) + CHILD_A (depth 2) + new GC (depth 3) = exactly 3 → OK
        $rel = $this->relations_3level();
        $this->assertTrue( dinoco_validate_sku_hierarchy( 'CHILD_A', 'NEW_GC', $rel ) );
    }

    public function test_top_level_to_child_when_parent_already_has_grandchildren(): void {
        // SET_A (depth 1) + adding CHILD_A_NEW with NO children = depth 2 → OK
        $rel = $this->relations_3level();
        $this->assertTrue( dinoco_validate_sku_hierarchy( 'SET_A', 'CHILD_A_NEW', $rel ) );
    }
}
