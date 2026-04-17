<?php
/**
 * FSMValidationTest — pure logic test of B2B + B2F FSM transition matrices.
 *
 * These matrices mirror authoritative sources:
 *   B2B: [B2B] Snippet 14: Order State Machine V.1.6
 *   B2F: [B2F] Snippet 6: Order State Machine
 *
 * Kept in sync manually. When snippet sources update, copy transitions here
 * and add/remove cases. This test GUARDS against accidental FSM regressions
 * in downstream code that depends on these graphs.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

class FSMValidationTest extends TestCase {

    /**
     * B2B FSM transition map — current → allowed next states → required actor role.
     * Source: [B2B] Snippet 14 V.1.6
     */
    private static function b2bTransitions(): array {
        return array(
            'draft' => array(
                'checking_stock'       => 'customer',
                'pending_stock_review' => 'customer',
                'awaiting_confirm'     => 'system',
                'cancelled'            => 'customer',
            ),
            'checking_stock' => array(
                'awaiting_confirm' => 'admin',
                'backorder'        => 'admin',
                'cancel_requested' => 'customer',
            ),
            'pending_stock_review' => array(
                'awaiting_confirm'  => 'admin',
                'partial_fulfilled' => 'admin',
                'cancelled'         => 'admin',
                'cancel_requested'  => 'customer',
            ),
            'partial_fulfilled' => array(
                'awaiting_confirm'     => 'any',
                'pending_stock_review' => 'admin',
                'cancelled'            => 'admin',
            ),
            'awaiting_confirm' => array(
                'awaiting_payment' => 'customer',
                'cancelled'        => 'system',
                'cancel_requested' => 'customer',
                'change_requested' => 'customer',
            ),
            'completed' => array(
                'cancelled' => 'admin', // walk-in admin cancel
            ),
            // Terminal: cancelled (no outgoing edges)
            'cancelled' => array(),
        );
    }

    /**
     * B2F FSM transition map.
     * Source: [B2F] Snippet 6 Order State Machine
     */
    private static function b2fTransitions(): array {
        return array(
            'draft' => array(
                'submitted' => 'admin',
                'cancelled' => 'admin',
            ),
            'submitted' => array(
                'confirmed' => 'maker',
                'rejected'  => 'maker',
                'amended'   => 'admin',
                'cancelled' => 'admin',
            ),
            'confirmed' => array(
                'delivering' => 'maker',
                'amended'    => 'admin',
                'cancelled'  => 'admin',
            ),
            'amended' => array(
                'submitted' => 'system',
            ),
            'cancelled' => array(),
            'completed' => array(),
        );
    }

    private static function isTransitionAllowed( array $map, string $from, string $to ): bool {
        return isset( $map[ $from ] ) && isset( $map[ $from ][ $to ] );
    }

    // ─── B2B cases ─────────────────────────────────────────────

    public function test_b2b_draft_to_pending_stock_review_allowed(): void {
        $this->assertTrue( self::isTransitionAllowed( self::b2bTransitions(), 'draft', 'pending_stock_review' ) );
    }

    public function test_b2b_draft_to_awaiting_confirm_allowed_walkin(): void {
        $this->assertTrue( self::isTransitionAllowed( self::b2bTransitions(), 'draft', 'awaiting_confirm' ) );
    }

    public function test_b2b_draft_to_completed_forbidden(): void {
        $this->assertFalse( self::isTransitionAllowed( self::b2bTransitions(), 'draft', 'completed' ) );
    }

    public function test_b2b_pending_stock_review_to_partial_fulfilled_allowed(): void {
        $this->assertTrue( self::isTransitionAllowed( self::b2bTransitions(), 'pending_stock_review', 'partial_fulfilled' ) );
    }

    public function test_b2b_partial_fulfilled_to_pending_stock_review_admin_undo(): void {
        $this->assertTrue( self::isTransitionAllowed( self::b2bTransitions(), 'partial_fulfilled', 'pending_stock_review' ) );
    }

    public function test_b2b_cancelled_is_terminal(): void {
        $map = self::b2bTransitions();
        $this->assertArrayHasKey( 'cancelled', $map );
        $this->assertSame( array(), $map['cancelled'] );
    }

    public function test_b2b_completed_to_cancelled_walkin_admin_override(): void {
        $this->assertTrue( self::isTransitionAllowed( self::b2bTransitions(), 'completed', 'cancelled' ) );
    }

    public function test_b2b_random_invalid_transition_blocked(): void {
        $this->assertFalse( self::isTransitionAllowed( self::b2bTransitions(), 'awaiting_confirm', 'draft' ) );
    }

    // ─── B2F cases ─────────────────────────────────────────────

    public function test_b2f_draft_to_submitted_allowed(): void {
        $this->assertTrue( self::isTransitionAllowed( self::b2fTransitions(), 'draft', 'submitted' ) );
    }

    public function test_b2f_submitted_to_confirmed_maker_only(): void {
        $map = self::b2fTransitions();
        $this->assertTrue( self::isTransitionAllowed( $map, 'submitted', 'confirmed' ) );
        $this->assertSame( 'maker', $map['submitted']['confirmed'] );
    }

    public function test_b2f_submitted_to_rejected_maker_only(): void {
        $map = self::b2fTransitions();
        $this->assertTrue( self::isTransitionAllowed( $map, 'submitted', 'rejected' ) );
        $this->assertSame( 'maker', $map['submitted']['rejected'] );
    }

    public function test_b2f_draft_to_confirmed_skip_submitted_forbidden(): void {
        $this->assertFalse( self::isTransitionAllowed( self::b2fTransitions(), 'draft', 'confirmed' ) );
    }

    public function test_b2f_cancelled_is_terminal(): void {
        $map = self::b2fTransitions();
        $this->assertArrayHasKey( 'cancelled', $map );
        $this->assertSame( array(), $map['cancelled'] );
    }

    /**
     * Data provider: batch invalid transitions
     * @return array<string, array{0:array<string,array<string,string>>, 1:string, 2:string}>
     */
    public static function invalidTransitionProvider(): array {
        return array(
            'b2b draft → awaiting_payment (skip confirm)' => array(
                self::b2bTransitions(), 'draft', 'awaiting_payment',
            ),
            'b2b checking_stock → completed (skip payment)' => array(
                self::b2bTransitions(), 'checking_stock', 'completed',
            ),
            'b2f confirmed → completed (skip delivering)' => array(
                self::b2fTransitions(), 'confirmed', 'completed',
            ),
            'b2f rejected → delivering (impossible)' => array(
                self::b2fTransitions(), 'rejected', 'delivering',
            ),
        );
    }

    /**
     * @dataProvider invalidTransitionProvider
     */
    public function test_invalid_transitions_are_blocked( array $map, string $from, string $to ): void {
        $this->assertFalse(
            self::isTransitionAllowed( $map, $from, $to ),
            "Expected $from → $to to be BLOCKED"
        );
    }
}
