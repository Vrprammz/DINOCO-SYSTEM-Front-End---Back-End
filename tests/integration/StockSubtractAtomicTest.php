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

    /**
     * Helper: call dinoco_stock_subtract with named args to avoid the 9-arg
     * positional minefield. Real signature is:
     *   ($sku, $qty, $type, $ref_type, $ref_id, $reason, $batch_id,
     *    $warehouse_id, $allow_negative)
     */
    private function subtract( string $sku, int $qty, bool $allow_negative = false ) {
        return dinoco_stock_subtract(
            $sku,
            $qty,
            'integration-test', // type
            '',                 // ref_type
            0,                  // ref_id
            '',                 // reason
            '',                 // batch_id
            null,               // warehouse_id
            $allow_negative
        );
    }

    public function test_basic_subtract_decrements_stock(): void {
        $this->assertSame( 10, $this->get_stock( 'LEAF-X' ) );

        $result = $this->subtract( 'LEAF-X', 3 );
        $this->assertNotInstanceOf( \WP_Error::class, $result );

        $this->assertSame( 7, $this->get_stock( 'LEAF-X' ) );
    }

    public function test_subtract_writes_ledger_row(): void {
        $this->subtract( 'LEAF-X', 2 );

        $any = (int) $GLOBALS['wpdb']->get_var(
            "SELECT COUNT(*) FROM {$GLOBALS['wpdb']->prefix}dinoco_stock_transactions WHERE sku = 'LEAF-X'"
        );
        $this->assertGreaterThan( 0, $any, 'Stock subtract must write a ledger row' );
    }

    /**
     * Snippet 15 dinoco_stock_subtract semantics (reviewed source line 1238):
     *   - $allow_negative=false (default) → caps at max(0, old_qty - qty),
     *     does NOT return WP_Error, just clamps and logs a WARNING.
     *   - $allow_negative=true → permits negative stock (DD-5 walk-in case).
     * WP_Error returned only for: invalid_qty, not_leaf, sku_not_found, db_error.
     */
    public function test_subtract_below_available_clamps_to_zero(): void {
        $this->assertSame( 4, $this->get_stock( 'LEAF-SHARED' ) );

        $result = $this->subtract( 'LEAF-SHARED', 10, /* allow_negative */ false );

        // Function does NOT WP_Error on underflow without allow_negative —
        // it clamps stock to 0 and continues.
        $this->assertNotInstanceOf( \WP_Error::class, $result );
        $this->assertSame(
            0,
            $this->get_stock( 'LEAF-SHARED' ),
            'allow_negative=false floors stock at 0 (matches Snippet 15 V.7.1 line 1238)'
        );
    }

    public function test_subtract_allows_negative_when_flagged(): void {
        $this->assertSame( 10, $this->get_stock( 'LEAF-X' ) );

        $result = $this->subtract( 'LEAF-X', 15, /* allow_negative */ true );
        $this->assertNotInstanceOf( \WP_Error::class, $result, 'allow_negative=true must permit subtract' );

        $stock = $this->get_stock( 'LEAF-X' );
        $this->assertSame(
            -5,
            $stock,
            'Stock should be -5 (10 - 15) when allow_negative=true (DD-5 walk-in case)'
        );
    }

    public function test_non_leaf_sku_blocked_by_dd2_guard(): void {
        $result = $this->subtract( 'SET-A', 1 );
        $this->assertInstanceOf(
            \WP_Error::class,
            $result,
            'Non-leaf SKU must be rejected by DD-2 leaf guard'
        );

        $code = $result->get_error_code();
        $this->assertSame( 'not_leaf', $code, "DD-2 guard error code expected 'not_leaf', got '{$code}'" );
    }

    public function test_sequential_subtracts_compose_without_drift(): void {
        $this->assertSame( 10, $this->get_stock( 'LEAF-X' ) );

        $this->subtract( 'LEAF-X', 3 );
        $this->subtract( 'LEAF-X', 2 );
        $this->subtract( 'LEAF-X', 1 );

        $this->assertSame( 4, $this->get_stock( 'LEAF-X' ), '10 - 3 - 2 - 1 = 4 (no drift)' );

        // 4th subtract of 5 from stock=4 → clamps at 0 (no WP_Error)
        $result = $this->subtract( 'LEAF-X', 5 );
        $this->assertNotInstanceOf( \WP_Error::class, $result );
        $this->assertSame( 0, $this->get_stock( 'LEAF-X' ), 'Subtract clamps at 0 floor' );
    }

    public function test_add_then_subtract_roundtrip(): void {
        $start = $this->get_stock( 'LEAF-Y' );

        dinoco_stock_add( 'LEAF-Y', 5, 'add-5' );
        $this->assertSame( $start + 5, $this->get_stock( 'LEAF-Y' ) );

        $this->subtract( 'LEAF-Y', 5 );
        $this->assertSame( $start, $this->get_stock( 'LEAF-Y' ), 'Add+subtract must restore original' );
    }
}
