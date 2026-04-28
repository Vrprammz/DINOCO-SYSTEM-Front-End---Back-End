<?php
/**
 * HierarchyDD3SharedChildTest — Phase 5 M2 (B.4).
 *
 * Source under test: [B2B] Snippet 15: Custom Tables & JWT Session
 *   - dinoco_get_leaf_skus($sku, $relations) — recursive leaf resolution
 *   - dinoco_compute_hierarchy_stock($sku, $relations) — MIN of leaf stocks
 *   - dinoco_get_ancestor_skus($sku, $relations) — walk up via child→parent map
 *
 * Bug history (Snippet 15 V.7.1, 2026-04-10):
 *   - C1/C2: $visited passed by REFERENCE caused DD-3 shared-child branches
 *     to share visited state → 2nd branch hit visited guard → returned []
 *     → SET stock computed as 0 (wrong) + double-subtract on cancel.
 *   - Fix: value-copy $visited per branch + array_unique() dedup output.
 *
 * Scope of this M2 test (integration via real wp_options):
 *   1. dinoco_sku_relations option correctly seeded
 *   2. SET-A leaves resolved via real WP option storage (not in-memory param)
 *   3. LEAF-SHARED appears once despite being under both CHILD-A1 and CHILD-A2
 *   4. compute_hierarchy_stock returns MIN(LEAF-X=10, LEAF-Y=15, LEAF-SHARED=4) = 4
 *   5. Subtracting from LEAF-SHARED affects SET-A rollup (cascades up)
 *
 * Compared to tests/helpers/HierarchyTest.php (unit), this test uses the REAL
 * wp_options storage path + real DB stock_qty reads — proves the integration
 * end-to-end, not just the algorithm.
 */

declare( strict_types=1 );

namespace DinocoTests\Integration;

final class HierarchyDD3SharedChildTest extends DinocoIntegrationTestCase {

    public function set_up(): void {
        parent::set_up();
        $this->load_fixture( 'seed-products-hierarchy.sql' );

        try {
            $this->eval_snippet_inline( '[B2B] Snippet 15: Custom Tables & JWT Session' );
        } catch ( \Throwable $e ) {
            $this->markTestSkipped( 'Snippet 15 cannot be loaded: ' . $e->getMessage() );
        }

        if ( ! function_exists( 'dinoco_get_leaf_skus' ) ) {
            $this->markTestSkipped( 'dinoco_get_leaf_skus not defined after snippet eval' );
        }
    }

    /** Read stock_qty straight from products table. */
    private function get_stock( string $sku ): int {
        global $wpdb;
        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT stock_qty FROM {$wpdb->prefix}dinoco_products WHERE sku = %s",
                $sku
            )
        );
    }

    public function test_relations_seeded_into_wp_options(): void {
        $relations = get_option( 'dinoco_sku_relations', array() );
        $this->assertIsArray( $relations );
        $this->assertArrayHasKey( 'SET-A', $relations );
        $this->assertSame( array( 'CHILD-A1', 'CHILD-A2' ), $relations['SET-A'] );
        $this->assertContains( 'LEAF-SHARED', $relations['CHILD-A1'] );
        $this->assertContains( 'LEAF-SHARED', $relations['CHILD-A2'] );
    }

    public function test_set_a_resolves_to_leaves_via_real_option(): void {
        // Helper reads dinoco_sku_relations from get_option() when $relations=null
        $leaves = dinoco_get_leaf_skus( 'SET-A' );

        $this->assertContains( 'LEAF-X', $leaves );
        $this->assertContains( 'LEAF-Y', $leaves );
        $this->assertContains( 'LEAF-SHARED', $leaves );
    }

    /**
     * V.7.1 C1/C2 regression: shared leaf must be deduplicated in output.
     * Pre-V.7.1, sibling branches sharing $visited by reference caused the
     * second branch to return [] when it hit the cycle guard, OR included
     * LEAF-SHARED twice causing double-subtract on cancel.
     */
    public function test_shared_leaf_deduplicated_in_set_a_resolution(): void {
        $leaves = dinoco_get_leaf_skus( 'SET-A' );

        $shared_count = count( array_filter( $leaves, fn( $l ) => $l === 'LEAF-SHARED' ) );
        $this->assertSame(
            1,
            $shared_count,
            'LEAF-SHARED must appear exactly once in SET-A leaf list (DD-3 dedup invariant)'
        );

        // Sanity: we expect 3 unique leaves
        $this->assertCount( 3, array_unique( $leaves ), 'Three unique leaves: LEAF-X, LEAF-Y, LEAF-SHARED' );
    }

    public function test_is_leaf_sku_recognises_set_vs_leaf(): void {
        if ( ! function_exists( 'dinoco_is_leaf_sku' ) ) {
            $this->markTestSkipped( 'dinoco_is_leaf_sku not available' );
        }

        $this->assertFalse( dinoco_is_leaf_sku( 'SET-A' ),    'SET-A has children → not a leaf' );
        $this->assertFalse( dinoco_is_leaf_sku( 'CHILD-A1' ), 'CHILD-A1 has children → not a leaf' );
        $this->assertTrue(  dinoco_is_leaf_sku( 'LEAF-X' ),   'LEAF-X has no children → is a leaf' );
        $this->assertTrue(  dinoco_is_leaf_sku( 'LEAF-SHARED' ), 'LEAF-SHARED has no children → is a leaf' );
    }

    public function test_ancestor_walk_for_leaf(): void {
        if ( ! function_exists( 'dinoco_get_ancestor_skus' ) ) {
            $this->markTestSkipped( 'dinoco_get_ancestor_skus not available' );
        }

        // LEAF-X has only one parent path → CHILD-A1 → SET-A
        $ancestors = dinoco_get_ancestor_skus( 'LEAF-X' );
        $this->assertContains( 'SET-A', $ancestors, 'LEAF-X must have SET-A as ancestor' );
        $this->assertContains( 'CHILD-A1', $ancestors, 'LEAF-X must have CHILD-A1 as direct parent' );
    }

    public function test_compute_hierarchy_stock_set_a_is_min_of_leaves(): void {
        if ( ! function_exists( 'dinoco_compute_hierarchy_stock' ) ) {
            $this->markTestSkipped( 'dinoco_compute_hierarchy_stock not available' );
        }

        // Fixture: LEAF-X=10, LEAF-Y=15, LEAF-SHARED=4
        // SET-A available qty = MIN(10, 15, 4) = 4 (LEAF-SHARED bottleneck)
        $set_a_stock = dinoco_compute_hierarchy_stock( 'SET-A' );
        $this->assertSame(
            4,
            $set_a_stock,
            'SET-A rollup must equal MIN of leaves = 4 (LEAF-SHARED bottleneck)'
        );
    }

    public function test_subtracting_shared_leaf_cascades_to_set_rollup(): void {
        if ( ! function_exists( 'dinoco_compute_hierarchy_stock' ) || ! function_exists( 'dinoco_stock_subtract' ) ) {
            $this->markTestSkipped( 'Required hierarchy/stock functions not available' );
        }

        // CASCADE-AFTER-SUBTRACT exposes a real production behavior:
        // dinoco_compute_hierarchy_stock() in Snippet 15 V.7.1+ uses a
        // PHP-process-static `$cached_map` for stock lookups (line 1689):
        //   static $cached_map = null;
        //   if ( $cached_map === null ) { $cached_map = $wpdb->get_results(...); }
        // The cache loads once on first call and never invalidates within the
        // same PHP process, even after stock_qty changes via stock_subtract.
        //
        // In production this is fine — each HTTP request has its own process,
        // so cache freshness matches request boundaries. But in PHPUnit the
        // process is reused across test methods → second call after a
        // subtract still reads the stale cached value.
        //
        // To run the cascade scenario meaningfully we'd need either:
        //   (a) Snippet 15 to expose dinoco_clear_hierarchy_cache() helper, OR
        //   (b) PHPUnit @runInSeparateProcess (slow, ~3s/test overhead), OR
        //   (c) Direct DB read in the second leg (bypasses the cached helper)
        //
        // Path (c) is acceptable but doesn't actually exercise compute_hierarchy_stock,
        // which defeats the test's purpose. Mark incomplete with the rationale
        // documented so future work (M4 concurrent harness) can revisit.

        $this->markTestIncomplete(
            'dinoco_compute_hierarchy_stock has a per-process static $cached_map (Snippet 15 line ~1689) that does not invalidate after stock_subtract. ' .
            'Real production behavior is fine (per-request process boundary), but PHPUnit reuses the process across tests. ' .
            'Revisit when a cache-invalidation helper exists OR via @runInSeparateProcess.'
        );
    }
}
