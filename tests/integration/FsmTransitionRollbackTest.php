<?php
/**
 * FsmTransitionRollbackTest — Phase 5 M2 (B.2).
 *
 * Source under test: [B2B] Snippet 14: Order State Machine V.1.8
 *   - B2B_Order_FSM::transition($order_id, $new_status, $actor, $reason)
 *   - Routes through dinoco_transaction() wrapper when available (Phase 4d)
 *   - Falls back to _transition_legacy() when wrapper disabled
 *
 * Bug history:
 *   - V.1.8 (2026-04-24): wrapped to add per-order GET_LOCK + correlation_id
 *     audit chain. If wrapper's mutate phase fails, lock is released and no
 *     DB change persists (single update_field — no partial state possible).
 *
 * Scope of this M2 test:
 *   1. Valid transition succeeds + persists order_status
 *   2. Invalid transition rejected (returns WP_Error) + state preserved
 *   3. Role validation: actor not in allowed-list rejected
 *   4. Terminal state (cancelled) rejects all outbound transitions
 *   5. Audit log row written for both successful and rejected transitions
 *
 * Note: True rollback-on-hook-fail (post-mutate exception causes prior
 *       audit/stock changes to revert) is more complex — deferred to M4
 *       which adds the concurrent-worker harness needed to simulate it.
 */

declare( strict_types=1 );

namespace DinocoTests\Integration;

final class FsmTransitionRollbackTest extends DinocoIntegrationTestCase {

    /** @var int test order post ID */
    private int $order_id;

    public function set_up(): void {
        parent::set_up();
        $this->load_fixture( 'seed-distributors.sql' );

        try {
            // Audit Log loaded first (FSM emits audit rows on transition)
            $this->eval_snippet_inline( '[Admin System] DINOCO Audit Log' );
            $this->eval_snippet_inline( '[B2B] Snippet 14: Order State Machine' );
        } catch ( \Throwable $e ) {
            $this->markTestSkipped( 'FSM snippets cannot be loaded: ' . $e->getMessage() );
        }

        if ( ! class_exists( 'B2B_Order_FSM' ) ) {
            $this->markTestSkipped( 'B2B_Order_FSM class not defined after snippet eval' );
        }

        // Create a test order in draft state
        $this->order_id = $this->factory->post->create( array(
            'post_type'   => 'b2b_order',
            'post_status' => 'publish',
            'post_title'  => 'Test Order for FSM',
        ) );
        update_post_meta( $this->order_id, 'order_status', 'draft' );
    }

    /** Read current order_status. */
    private function current_status(): string {
        return (string) get_post_meta( $this->order_id, 'order_status', true );
    }

    /** Count audit_log rows for our test order. */
    private function audit_count( ?string $event_type = null, ?bool $success = null ): int {
        global $wpdb;
        $where  = array( "target_type = 'order'", $wpdb->prepare( "target_id = %s", (string) $this->order_id ) );
        if ( $event_type !== null ) {
            $where[] = $wpdb->prepare( 'event_type = %s', $event_type );
        }
        if ( $success !== null ) {
            $where[] = $wpdb->prepare( 'success = %d', $success ? 1 : 0 );
        }
        $sql = "SELECT COUNT(*) FROM {$wpdb->prefix}dinoco_audit_log WHERE " . implode( ' AND ', $where );
        return (int) $wpdb->get_var( $sql );
    }

    public function test_valid_transition_succeeds(): void {
        $this->assertSame( 'draft', $this->current_status() );

        $result = \B2B_Order_FSM::transition( $this->order_id, 'pending_stock_review', 'customer', 'opaque-accept' );
        $this->assertTrue( $result, 'Valid customer-initiated transition must succeed' );

        $this->assertSame( 'pending_stock_review', $this->current_status() );
    }

    public function test_invalid_transition_rejected_state_preserved(): void {
        $this->assertSame( 'draft', $this->current_status() );

        // draft → completed is NOT in the transitions table (must go via paid+packed+shipped first)
        $result = \B2B_Order_FSM::transition( $this->order_id, 'completed', 'admin', 'should-fail' );
        $this->assertDinocoWPError( $result, 'invalid_transition' );

        $this->assertSame(
            'draft',
            $this->current_status(),
            'Failed transition must NOT mutate order_status'
        );
    }

    public function test_role_validation_rejects_customer_admin_action(): void {
        update_post_meta( $this->order_id, 'order_status', 'pending_stock_review' );

        // pending_stock_review → awaiting_confirm is admin-only
        $result = \B2B_Order_FSM::transition( $this->order_id, 'awaiting_confirm', 'customer', 'wrong-role' );
        $this->assertDinocoWPError( $result );

        $this->assertSame(
            'pending_stock_review',
            $this->current_status(),
            'Role-violating transition must NOT mutate'
        );
    }

    public function test_terminal_state_rejects_outbound_transitions(): void {
        update_post_meta( $this->order_id, 'order_status', 'cancelled' );

        // cancelled is terminal (only completed→cancelled allowed for walk-in admin override)
        $result = \B2B_Order_FSM::transition( $this->order_id, 'paid', 'admin', 'attempt-revive' );
        $this->assertDinocoWPError( $result, 'terminal_state' );

        $this->assertSame( 'cancelled', $this->current_status() );
    }

    public function test_audit_log_records_successful_transition(): void {
        if ( ! function_exists( 'dinoco_audit_log' ) ) {
            $this->markTestSkipped( 'dinoco_audit_log helper not available' );
        }

        $before = $this->audit_count( 'fsm_transition', true );
        \B2B_Order_FSM::transition( $this->order_id, 'pending_stock_review', 'customer', 'audit-success-test' );
        $after = $this->audit_count( 'fsm_transition', true );

        $this->assertGreaterThan(
            $before,
            $after,
            'Successful transition must emit at least one fsm_transition audit row with success=1'
        );
    }

    public function test_audit_log_records_rejected_transition(): void {
        if ( ! function_exists( 'dinoco_audit_log' ) ) {
            $this->markTestSkipped( 'dinoco_audit_log helper not available' );
        }

        $before = $this->audit_count( 'fsm_transition', false );
        \B2B_Order_FSM::transition( $this->order_id, 'completed', 'admin', 'audit-fail-test' );
        $after = $this->audit_count( 'fsm_transition', false );

        $this->assertGreaterThan(
            $before,
            $after,
            'Rejected transition must emit at least one fsm_transition audit row with success=0'
        );
    }

    public function test_walkin_skip_to_awaiting_confirm(): void {
        // System actor can skip stock check for walk-in
        $result = \B2B_Order_FSM::transition( $this->order_id, 'awaiting_confirm', 'system', 'walkin-skip' );
        $this->assertTrue( $result );
        $this->assertSame( 'awaiting_confirm', $this->current_status() );
    }

    public function test_completed_to_cancelled_walkin_admin_override(): void {
        update_post_meta( $this->order_id, 'order_status', 'completed' );

        // Walk-in admin override: completed → cancelled allowed for admin (V.1.5)
        $result = \B2B_Order_FSM::transition( $this->order_id, 'cancelled', 'admin', 'walkin-revoke' );
        $this->assertTrue( $result );
        $this->assertSame( 'cancelled', $this->current_status() );
    }
}
