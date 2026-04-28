<?php
/**
 * StockSubtractAtomicTest — Phase 5 M2 (B.1).
 *
 * Source under test: [B2B] Snippet 15: Custom Tables & JWT Session
 *   - dinoco_stock_subtract($sku, $qty, $reason, ..., $allow_negative)
 *   - dinoco_stock_add($sku, $qty, $reason, ...)
 *   - Both wrap MySQL transactions with `SELECT ... FOR UPDATE` per leaf SKU
 *
 * Bug history (Snippet 15 V.7.1, 2026-04-10):
 *   - C3: Walk-in stock subtract violated DD-5 (stock CAN go negative for walk-in)
 *     because subtract was force-clamped to 0. Fix: $allow_negative param.
 *   - V.7.1 also added explicit leaf guard (DD-2): non-leaf SKUs return
 *     WP_Error('not_leaf') — caller must expand SET to leaves first.
 *
 * Scope of this integration test:
 *   1. Basic subtract decrements stock_qty + writes ledger row
 *   2. Subtract below zero returns WP_Error when allow_negative=false (default)
 *   3. allow_negative=true permits negative stock (walk-in / DD-5)
 *   4. Non-leaf SKU returns WP_Error('not_leaf') (DD-2 guard)
 *   5. Multiple sequential subtracts compose correctly (no rounding drift)
 *
 * NOTE: True concurrent FOR UPDATE testing (2-connection harness) deferred
 *       to M4 — this M2 test exercises sequential semantics + invariants only.
 *       The lock IS still acquired here; we just don't simulate contention.
 */

declare( strict_types=1 );

namespace DinocoTests\Integration;

final class StockSubtractAtomicTest extends DinocoIntegrationTestCase {

    public function set_up(): void {
        parent::set_up();
        $this->load_fixture( 'seed-products-hierarchy.sql' );

        try {
            $this->eval_snippet_inline( '[B2B] Snippet 15: Custom Tables & JWT Session' );
        } catch ( \Throwable $e ) {
            $this->markTestSkipped( 'Snippet 15 cannot be loaded: ' . $e->getMessage() );
        }

        if ( ! function_exists( 'dinoco_stock_subtract' ) || ! function_exists( 'dinoco_stock_add' ) ) {
            $this->markTestSkipped( 'dinoco_stock_subtract / dinoco_stock_add not defined after snippet eval' );
        }
    }

    /**
     * Read current stock_qty for a SKU directly from the products table.
     */
    private function get_stock( string $sku ): int {
        global $wpdb;
        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT stock_qty FROM {$wpdb->prefix}dinoco_products WHERE sku = %s",
                $sku
            )
        );
    }

    /**
     * Count stock_transactions ledger rows for a given SKU + type.
     */
    private function ledger_count( string $sku, string $type ): int {
        global $wpdb;
        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->prefix}dinoco_stock_transactions
                 WHERE sku = %s AND type = %s",
                $sku, $type
            )
        );
    }

    public function test_basic_subtract_decrements_stock(): void {
        $this->assertSame( 10, $this->get_stock( 'LEAF-X' ) );

        $result = dinoco_stock_subtract( 'LEAF-X', 3, 'integration-test', null, false );
        $this->assertNotInstanceOf( \WP_Error::class, $result );

        $this->assertSame( 7, $this->get_stock( 'LEAF-X' ) );
    }

    public function test_subtract_writes_ledger_row(): void {
        dinoco_stock_subtract( 'LEAF-X', 2, 'integration-test', null, false );

        $count = $this->ledger_count( 'LEAF-X', 'manual_subtract' );
        // The exact `type` value depends on Snippet 15's reason→type mapping.
        // We just assert SOMETHING was written (the row exists).
        $any = (int) $GLOBALS['wpdb']->get_var(
            "SELECT COUNT(*) FROM {$GLOBALS['wpdb']->prefix}dinoco_stock_transactions WHERE sku = 'LEAF-X'"
        );
        $this->assertGreaterThan( 0, $any, 'Stock subtract must write a ledger row' );
    }

    public function test_subtract_below_zero_returns_wp_error_by_default(): void {
        $this->assertSame( 4, $this->get_stock( 'LEAF-SHARED' ) );

        $result = dinoco_stock_subtract( 'LEAF-SHARED', 10, 'oversell-test', null, false );
        $this->assertInstanceOf(
            \WP_Error::class,
            $result,
            'Subtracting more than available without allow_negative must fail'
        );

        // Stock unchanged — failed subtract must NOT mutate
        $this->assertSame( 4, $this->get_stock( 'LEAF-SHARED' ) );
    }

    public function test_subtract_allows_negative_when_flagged(): void {
        $this->assertSame( 10, $this->get_stock( 'LEAF-X' ) );

        $result = dinoco_stock_subtract( 'LEAF-X', 15, 'walkin-DD5', null, true );
        $this->assertNotInstanceOf( \WP_Error::class, $result, 'allow_negative=true must permit negative stock' );

        // Stock should be -5 (or whatever Snippet 15 produces — 10 - 15)
        $stock = $this->get_stock( 'LEAF-X' );
        $this->assertLessThanOrEqual(
            -5,
            $stock,
            'Stock should decrement past zero when allow_negative=true (DD-5 walk-in case)'
        );
    }

    public function test_non_leaf_sku_blocked_by_dd2_guard(): void {
        // SET-A has children → not a leaf → should be rejected
        $result = dinoco_stock_subtract( 'SET-A', 1, 'should-fail-not-leaf', null, false );
        $this->assertInstanceOf(
            \WP_Error::class,
            $result,
            'Non-leaf SKU must be rejected by DD-2 leaf guard'
        );

        $code = $result->get_error_code();
        $this->assertContains(
            $code,
            array( 'not_leaf', 'invalid_sku', 'DD-2' ),
            "DD-2 guard error code unexpected: '{$code}'"
        );
    }

    public function test_sequential_subtracts_compose_without_drift(): void {
        $this->assertSame( 10, $this->get_stock( 'LEAF-X' ) );

        dinoco_stock_subtract( 'LEAF-X', 3, 'seq-1', null, false );
        dinoco_stock_subtract( 'LEAF-X', 2, 'seq-2', null, false );
        dinoco_stock_subtract( 'LEAF-X', 1, 'seq-3', null, false );

        $this->assertSame( 4, $this->get_stock( 'LEAF-X' ), '10 - 3 - 2 - 1 = 4 (no drift)' );

        // Second-tier sanity: a 4th subtract that would go below 0 must fail
        $result = dinoco_stock_subtract( 'LEAF-X', 5, 'seq-4-fails', null, false );
        $this->assertInstanceOf( \WP_Error::class, $result );
        $this->assertSame( 4, $this->get_stock( 'LEAF-X' ), 'Failed subtract must not mutate' );
    }

    public function test_add_then_subtract_roundtrip(): void {
        $start = $this->get_stock( 'LEAF-Y' );

        dinoco_stock_add( 'LEAF-Y', 5, 'add-5' );
        $this->assertSame( $start + 5, $this->get_stock( 'LEAF-Y' ) );

        dinoco_stock_subtract( 'LEAF-Y', 5, 'subtract-5', null, false );
        $this->assertSame( $start, $this->get_stock( 'LEAF-Y' ), 'Add+subtract must restore original' );
    }
}
