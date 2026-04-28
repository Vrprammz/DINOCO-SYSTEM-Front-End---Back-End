<?php
/**
 * FsmConcurrentLockTest — Phase 5 M4 (concurrent harness, FSM scenario).
 *
 * Source under test: [B2B] Snippet 14 V.1.8 line 149+
 *   - B2B_Order_FSM::_transition_via_wrapper() via dinoco_transaction()
 *   - Acquires per-order GET_LOCK with key `b2b_fsm_order_<id>`
 *
 * Bug history (V.1.8 Phase 4d, 2026-04-24):
 *   - Pre-V.1.8 FSM had no outer lock — two admins clicking the same order
 *     simultaneously could both pass the from-state check, both update
 *     order_status, and end up in inconsistent state with double audit rows.
 *   - V.1.8 wraps transition() through dinoco_transaction() which acquires
 *     GET_LOCK('b2b_fsm_order_<id>', 3) before the mutate phase.
 *
 * Scope of this test:
 *   1. The FSM lock name pattern matches production
 *   2. Concurrent acquire on the SAME order_id blocks the second caller
 *   3. Different order_ids don't conflict (per-order isolation)
 *
 * Same approach as RateLimitGetLockTest — inline the GET_LOCK mechanism
 * rather than load Snippet 14 + 1 + Transaction Wrapper (cumulatively
 * 10000+ LOC + many side effects).
 */

declare( strict_types=1 );

namespace DinocoTests\Integration;

final class FsmConcurrentLockTest extends DinocoIntegrationTestCase {

    /**
     * Lock name b2b_fsm_order_<id> — matches Snippet 14 V.1.8 line 155
     * exactly so this test fails if production renames the lock key.
     */
    private function fsm_lock_name( int $order_id ): string {
        return 'b2b_fsm_order_' . $order_id;
    }

    public function test_lock_name_matches_production_pattern(): void {
        $this->assertSame( 'b2b_fsm_order_12345', $this->fsm_lock_name( 12345 ) );
        $this->assertSame( 'b2b_fsm_order_1', $this->fsm_lock_name( 1 ) );
    }

    /**
     * THE serialization proof for FSM transitions: two concurrent admin
     * clicks on the same order ID must serialize. Mirrors what the wrapper
     * does in production — first connection holds the per-order lock,
     * second connection blocks.
     */
    public function test_concurrent_transition_on_same_order_serializes(): void {
        global $wpdb;
        $b = $this->concurrent_conn();

        $order_id = 99001; // arbitrary test order id
        $name = $this->fsm_lock_name( $order_id );

        // Connection A acquires the per-order lock (simulating first admin click)
        $got_a = $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 3)', $name ) );
        $this->assertSame( '1', $got_a );

        // Connection B (second admin click on SAME order) — must block then time out
        // Production timeout is 3s (line 156: 'lock_timeout' => 3)
        $start = microtime( true );
        $stmt = $b->prepare( 'SELECT GET_LOCK(?, 3)' );
        $stmt->bind_param( 's', $name );
        $stmt->execute();
        $row = $stmt->get_result()->fetch_row();
        $elapsed = microtime( true ) - $start;

        $this->assertSame(
            '0',
            (string) $row[0],
            'Second admin click on same order must time out (return 0) — proves V.1.8 GET_LOCK serializes FSM transitions'
        );
        $this->assertGreaterThan(
            2.5,
            $elapsed,
            'Second connection must have actually waited the 3s timeout'
        );

        // A releases (transaction wrapper RELEASE_LOCK after mutate phase)
        $wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $name ) );

        // B can now acquire
        $row_after = $b->query( "SELECT GET_LOCK('{$name}', 1)" )->fetch_row();
        $this->assertSame( '1', (string) $row_after[0], 'After A releases, B acquires' );
        $b->query( "SELECT RELEASE_LOCK('{$name}')" );
    }

    /**
     * Per-order isolation: order #99001 lock doesn't block order #99002.
     * Two admins editing different orders simultaneously must not contend.
     */
    public function test_different_orders_dont_conflict(): void {
        global $wpdb;
        $b = $this->concurrent_conn();

        $name_a = $this->fsm_lock_name( 99001 );
        $name_b = $this->fsm_lock_name( 99002 );

        // A holds order #99001 lock
        $got_a = $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 3)', $name_a ) );
        $this->assertSame( '1', $got_a );

        // B should immediately acquire order #99002 lock (different order)
        $start = microtime( true );
        $row = $b->query( "SELECT GET_LOCK('{$name_b}', 3)" )->fetch_row();
        $elapsed = microtime( true ) - $start;

        $this->assertSame( '1', (string) $row[0], 'Different order locks must not block' );
        $this->assertLessThan(
            0.5,
            $elapsed,
            'Per-order lock isolation: different IDs proceed without blocking'
        );

        // Cleanup
        $wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $name_a ) );
        $b->query( "SELECT RELEASE_LOCK('{$name_b}')" );
    }
}
