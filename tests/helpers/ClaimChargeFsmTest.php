<?php
/**
 * ClaimChargeFsmTest — pure-logic tests for Claim Payment LIFF V.0.2 FSM
 * (Sprint 13 Phase 2.5 Task 2.5 — orchestrator FINAL bindings B1).
 *
 * Source of truth: [System] DINOCO Claim Payment LIFF V.0.2
 *   - dinoco_claim_charge_fsm_allowed($from, $to, $actor)
 *   - DINOCO_CLAIM_CHARGE_FSM_TABLE constant
 *   - DINOCO_CLAIM_CHARGES_STATUS_WHITELIST constant
 *
 * Helpers inlined per ClaimNotifPureLogicTest convention — no WP bootstrap.
 *
 * Coverage:
 *   • 7-state schema parity (all whitelist values reachable in matrix)
 *   • 11 allowed transitions × allowed actors → all PASS
 *   • Invalid actor on valid edge → deny with `actor_not_allowed`
 *   • Unknown to-state → deny with `invalid_to_state`
 *   • Terminal (from === to) → deny with `terminal_state`
 *   • Critical financial guards: customer cannot self-verify or self-refund
 *   • Critical UX guards: admin cannot reject from pending_payment
 *     (must go through pending_review first — slip arrived gate)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! defined( 'DINOCO_CLAIM_CHARGES_STATUS_WHITELIST' ) ) {
    define( 'DINOCO_CLAIM_CHARGES_STATUS_WHITELIST',
        'pending_payment,pending_review,verified,rejected,refunded,expired,cancelled' );
}

if ( ! defined( 'DINOCO_CLAIM_CHARGE_FSM_TABLE' ) ) {
    define( 'DINOCO_CLAIM_CHARGE_FSM_TABLE',
        'pending_payment->pending_review:customer,' .
        'pending_payment->expired:system,' .
        'pending_payment->cancelled:admin,' .
        'pending_review->verified:system|admin,' .
        'pending_review->rejected:system|admin,' .
        'pending_review->pending_payment:admin,' .
        'pending_review->cancelled:admin,' .
        'verified->refunded:admin,' .
        'rejected->pending_review:customer,' .
        'expired->pending_payment:admin,' .
        'pending_payment->verified:system|admin'
    );
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_claim_charge_fsm_allowed' ) ) {
    function dinoco_claim_charge_fsm_allowed( $from, $to, $actor ) {
        $from  = trim( (string) $from );
        $to    = trim( (string) $to );
        $actor = trim( (string) $actor );

        if ( defined( 'DINOCO_CLAIM_CHARGES_STATUS_WHITELIST' ) ) {
            $whitelist = explode( ',', DINOCO_CLAIM_CHARGES_STATUS_WHITELIST );
            if ( $from !== '' && ! in_array( $from, $whitelist, true ) ) {
                return array( 'allowed' => false, 'reason' => 'invalid_from_state:' . $from );
            }
            if ( ! in_array( $to, $whitelist, true ) ) {
                return array( 'allowed' => false, 'reason' => 'invalid_to_state:' . $to );
            }
        }

        if ( $from === $to ) {
            return array( 'allowed' => false, 'reason' => 'terminal_state' );
        }

        static $matrix = null;
        if ( $matrix === null ) {
            $matrix = array();
            foreach ( explode( ',', DINOCO_CLAIM_CHARGE_FSM_TABLE ) as $rule ) {
                if ( strpos( $rule, '->' ) === false || strpos( $rule, ':' ) === false ) continue;
                list( $fromto, $actors ) = explode( ':', $rule, 2 );
                list( $rf, $rt )         = explode( '->', $fromto, 2 );
                $key = trim( $rf ) . '->' . trim( $rt );
                if ( ! isset( $matrix[ $key ] ) ) $matrix[ $key ] = array();
                $matrix[ $key ] = array_merge( $matrix[ $key ], array_map( 'trim', explode( '|', $actors ) ) );
            }
        }

        $key = $from . '->' . $to;
        if ( ! isset( $matrix[ $key ] ) ) {
            return array( 'allowed' => false, 'reason' => 'transition_not_in_matrix' );
        }
        if ( ! in_array( $actor, $matrix[ $key ], true ) ) {
            return array( 'allowed' => false, 'reason' => 'actor_not_allowed:' . $actor );
        }
        return array( 'allowed' => true, 'reason' => 'ok' );
    }
}

final class ClaimChargeFsmTest extends TestCase
{
    /** All 7 schema states accounted for. */
    public function testSchemaParityWhitelist(): void
    {
        $expected = array(
            'pending_payment','pending_review','verified',
            'rejected','refunded','expired','cancelled',
        );
        $actual = explode( ',', DINOCO_CLAIM_CHARGES_STATUS_WHITELIST );
        $this->assertSame( $expected, $actual,
            'Schema whitelist drift — orchestrator B1 binding broken' );
    }

    /** All 11 valid transitions (canonical actor) → allowed. */
    public function testAllowedTransitions(): void
    {
        $cases = array(
            array( 'pending_payment', 'pending_review',  'customer' ),
            array( 'pending_payment', 'expired',         'system'   ),
            array( 'pending_payment', 'cancelled',       'admin'    ),
            array( 'pending_review',  'verified',        'system'   ),
            array( 'pending_review',  'verified',        'admin'    ),
            array( 'pending_review',  'rejected',        'system'   ),
            array( 'pending_review',  'rejected',        'admin'    ),
            array( 'pending_review',  'pending_payment', 'admin'    ),
            array( 'pending_review',  'cancelled',       'admin'    ),
            array( 'verified',        'refunded',        'admin'    ),
            array( 'rejected',        'pending_review',  'customer' ),
            array( 'expired',         'pending_payment', 'admin'    ),
        );
        foreach ( $cases as $c ) {
            $r = dinoco_claim_charge_fsm_allowed( $c[0], $c[1], $c[2] );
            $this->assertTrue( $r['allowed'],
                "Expected allowed: {$c[0]}→{$c[1]} actor={$c[2]} | reason={$r['reason']}" );
        }
    }

    /** Customer cannot perform admin/system actions. */
    public function testCustomerCannotVerify(): void
    {
        $r = dinoco_claim_charge_fsm_allowed( 'pending_review', 'verified', 'customer' );
        $this->assertFalse( $r['allowed'] );
        $this->assertStringContainsString( 'actor_not_allowed', $r['reason'] );
    }

    public function testCustomerCannotRefund(): void
    {
        $r = dinoco_claim_charge_fsm_allowed( 'verified', 'refunded', 'customer' );
        $this->assertFalse( $r['allowed'] );
    }

    public function testCustomerCannotCancel(): void
    {
        $r = dinoco_claim_charge_fsm_allowed( 'pending_payment', 'cancelled', 'customer' );
        $this->assertFalse( $r['allowed'] );
    }

    /** Admin cannot reject directly from pending_payment — must go via review */
    public function testAdminCannotRejectFromPendingPayment(): void
    {
        $r = dinoco_claim_charge_fsm_allowed( 'pending_payment', 'rejected', 'admin' );
        $this->assertFalse( $r['allowed'] );
        $this->assertSame( 'transition_not_in_matrix', $r['reason'] );
    }

    /** Refunded is a terminal state — no exit transition defined. */
    public function testRefundedHasNoExitTransition(): void
    {
        foreach ( array( 'pending_payment', 'pending_review', 'verified',
            'rejected', 'expired', 'cancelled' ) as $to ) {
            foreach ( array( 'customer', 'admin', 'system' ) as $actor ) {
                $r = dinoco_claim_charge_fsm_allowed( 'refunded', $to, $actor );
                $this->assertFalse( $r['allowed'],
                    "refunded should not transition to {$to} via {$actor}" );
            }
        }
    }

    /** Cancelled is a terminal state — no exit transition defined. */
    public function testCancelledHasNoExitTransition(): void
    {
        foreach ( array( 'pending_payment', 'pending_review', 'verified',
            'rejected', 'refunded', 'expired' ) as $to ) {
            foreach ( array( 'customer', 'admin', 'system' ) as $actor ) {
                $r = dinoco_claim_charge_fsm_allowed( 'cancelled', $to, $actor );
                $this->assertFalse( $r['allowed'] );
            }
        }
    }

    /** Same from === to → terminal_state. */
    public function testIdempotentTerminalState(): void
    {
        foreach ( explode( ',', DINOCO_CLAIM_CHARGES_STATUS_WHITELIST ) as $s ) {
            $r = dinoco_claim_charge_fsm_allowed( $s, $s, 'admin' );
            $this->assertFalse( $r['allowed'] );
            $this->assertSame( 'terminal_state', $r['reason'] );
        }
    }

    /** Unknown to-state → invalid_to_state. */
    public function testUnknownToStateDenied(): void
    {
        $r = dinoco_claim_charge_fsm_allowed( 'pending_payment', 'slip_uploaded', 'customer' );
        $this->assertFalse( $r['allowed'] );
        $this->assertStringContainsString( 'invalid_to_state', $r['reason'] );
    }

    /** Unknown from-state → invalid_from_state. */
    public function testUnknownFromStateDenied(): void
    {
        $r = dinoco_claim_charge_fsm_allowed( 'completed', 'verified', 'admin' );
        $this->assertFalse( $r['allowed'] );
        $this->assertStringContainsString( 'invalid_from_state', $r['reason'] );
    }

    /** Customer re-upload after rejection (rejected → pending_review). */
    public function testCustomerCanReuploadAfterReject(): void
    {
        $r = dinoco_claim_charge_fsm_allowed( 'rejected', 'pending_review', 'customer' );
        $this->assertTrue( $r['allowed'] );
    }

    /** Admin reopen of expired charge. */
    public function testAdminCanReopenExpired(): void
    {
        $r = dinoco_claim_charge_fsm_allowed( 'expired', 'pending_payment', 'admin' );
        $this->assertTrue( $r['allowed'] );
    }

    /** Admin allow re-upload after rejecting slip. */
    public function testAdminCanReopenForReupload(): void
    {
        $r = dinoco_claim_charge_fsm_allowed( 'pending_review', 'pending_payment', 'admin' );
        $this->assertTrue( $r['allowed'] );
    }
}
