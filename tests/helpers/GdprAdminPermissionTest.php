<?php
/**
 * GdprAdminPermissionTest — pure-logic tests for V.3.0 Phase 7 admin workflow.
 *
 * Source: [System] DINOCO GDPR Data Requests V.3.0 (Round 24, 2026-04-29)
 *
 * Scope: We test the PURE helpers used in the admin review workflow:
 *   - dinoco_gdpr_is_valid_status_transition($from, $to) — state machine guard
 *   - reason validation matrix (admin reject reasons enum)
 *   - typed confirmation gate (APPROVE / PROCESS literals)
 *
 * Why these matter:
 *   - State machine drift → admin could approve a "ready" request and
 *     trigger a duplicate worker run (irreversible: double email, double ZIP, double delete)
 *   - Reject reason enum drift → admin notes garbage / non-PDPA-compliant audit trail
 *   - Typed confirmation drift → bypass safety net for irreversible operations
 *
 * NOTE: Pure-logic tests — no DB, no WP. Helpers mirrored locally for isolation
 * (same pattern as IdempotencyTest + GdprDeletionDecisionTest). Snippet remains
 * the source of truth — these tests lock the contract per Round 24 design.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// ─────────────────────────────────────────────────────────────────────
// Inline mirrors — keep IDENTICAL to snippet helpers.
// ─────────────────────────────────────────────────────────────────────

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_gdpr_is_valid_status_transition' ) ) {
    function dinoco_gdpr_is_valid_status_transition( $from, $to ) {
        $from = is_string( $from ) ? strtolower( trim( $from ) ) : '';
        $to   = is_string( $to ) ? strtolower( trim( $to ) ) : '';

        $graph = array(
            'pending'    => array( 'processing', 'rejected', 'cancelled' ),
            'processing' => array( 'ready', 'failed', 'cancelled' ),
            'failed'     => array( 'processing', 'cancelled' ),
            'ready'      => array( 'expired' ),
            'rejected'   => array(),
            'cancelled'  => array(),
            'expired'    => array(),
        );
        if ( ! isset( $graph[ $from ] ) ) return false;
        return in_array( $to, $graph[ $from ], true );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_gdpr_admin_valid_reject_reason' ) ) {
    /**
     * Pure validator — mirrors the enum check inside dinoco_gdpr_rest_admin_reject().
     * Returns true if reason+note combo is acceptable per the admin contract.
     *
     * @param string $reason
     * @param string $note
     * @return bool
     */
    function dinoco_gdpr_admin_valid_reject_reason( $reason, $note = '' ) {
        $valid_reasons = array( 'legal_hold', 'fraud', 'cooling_off', 'other' );
        if ( ! in_array( $reason, $valid_reasons, true ) ) {
            return false;
        }
        // 'other' requires a note >= 5 chars (admin must justify free-text rejections)
        if ( $reason === 'other' && strlen( trim( (string) $note ) ) < 5 ) {
            return false;
        }
        return true;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_gdpr_admin_typed_confirmation_ok' ) ) {
    /**
     * Pure check — mirrors the typed confirmation gate inside
     * dinoco_gdpr_rest_admin_approve / manual_export. The action-specific
     * literal is REQUIRED (not just any truthy value).
     *
     * @param string $action 'approve' | 'manual_export'
     * @param string $confirm_text
     * @return bool
     */
    function dinoco_gdpr_admin_typed_confirmation_ok( $action, $confirm_text ) {
        $literals = array(
            'approve'        => 'APPROVE',
            'manual_export'  => 'PROCESS',
        );
        $action = strtolower( trim( (string) $action ) );
        if ( ! isset( $literals[ $action ] ) ) return false;
        return (string) $confirm_text === $literals[ $action ];
    }
}


class GdprAdminPermissionTest extends TestCase {

    // ════════════════════════════════════════════════════════════════
    // 1. STATE MACHINE — valid transitions
    // ════════════════════════════════════════════════════════════════

    public function test_pending_to_processing_via_approve(): void {
        // Admin clicks Approve → pending → processing
        $this->assertTrue( dinoco_gdpr_is_valid_status_transition( 'pending', 'processing' ) );
    }

    public function test_pending_to_rejected_via_reject(): void {
        $this->assertTrue( dinoco_gdpr_is_valid_status_transition( 'pending', 'rejected' ) );
    }

    public function test_pending_to_cancelled_via_undo(): void {
        // User-initiated cancel before admin review (future feature)
        $this->assertTrue( dinoco_gdpr_is_valid_status_transition( 'pending', 'cancelled' ) );
    }

    public function test_processing_to_ready_via_worker_success(): void {
        $this->assertTrue( dinoco_gdpr_is_valid_status_transition( 'processing', 'ready' ) );
    }

    public function test_processing_to_failed_via_worker_error(): void {
        $this->assertTrue( dinoco_gdpr_is_valid_status_transition( 'processing', 'failed' ) );
    }

    public function test_processing_to_cancelled_via_30s_undo(): void {
        // Admin clicks Undo within 30s window → cancel before worker fires
        $this->assertTrue( dinoco_gdpr_is_valid_status_transition( 'processing', 'cancelled' ) );
    }

    public function test_failed_to_processing_via_manual_retry(): void {
        $this->assertTrue( dinoco_gdpr_is_valid_status_transition( 'failed', 'processing' ) );
    }

    public function test_ready_to_expired_via_cleanup_cron(): void {
        $this->assertTrue( dinoco_gdpr_is_valid_status_transition( 'ready', 'expired' ) );
    }

    // ════════════════════════════════════════════════════════════════
    // 2. STATE MACHINE — INVALID transitions (regression guard)
    // ════════════════════════════════════════════════════════════════

    public function test_ready_cannot_go_back_to_processing(): void {
        // CRITICAL: prevents duplicate worker run on completed export.
        // Worker run is irreversible (sends email + creates ZIP + may delete).
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 'ready', 'processing' ) );
    }

    public function test_rejected_is_terminal_no_outgoing(): void {
        // Once admin rejects with reason, request is locked — must create new request to retry
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 'rejected', 'pending' ) );
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 'rejected', 'processing' ) );
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 'rejected', 'ready' ) );
    }

    public function test_cancelled_is_terminal(): void {
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 'cancelled', 'pending' ) );
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 'cancelled', 'processing' ) );
    }

    public function test_expired_is_terminal(): void {
        // Auto-pruned ZIP cannot be regenerated — user must resubmit request
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 'expired', 'ready' ) );
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 'expired', 'processing' ) );
    }

    public function test_unknown_from_status_rejected(): void {
        // Defensive — unknown current state must NEVER allow any transition
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 'mystery', 'ready' ) );
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( '', 'ready' ) );
    }

    public function test_unknown_to_status_rejected(): void {
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 'pending', 'wormhole' ) );
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 'pending', '' ) );
    }

    public function test_self_transition_rejected(): void {
        // pending → pending is a no-op that should not be allowed (avoid double-stamp audit)
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 'pending', 'pending' ) );
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 'ready', 'ready' ) );
    }

    public function test_input_normalization(): void {
        // Case + whitespace tolerance (defensive — callers may pass uppercase/padded values)
        $this->assertTrue( dinoco_gdpr_is_valid_status_transition( '  PENDING  ', 'processing' ) );
        $this->assertTrue( dinoco_gdpr_is_valid_status_transition( 'pending', 'PROCESSING' ) );
    }

    public function test_non_string_input_rejected_safely(): void {
        // Defensive — non-string inputs must NOT crash (would-be PHP 8.1 deprecation)
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( null, 'processing' ) );
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 123, 'processing' ) );
        $this->assertFalse( dinoco_gdpr_is_valid_status_transition( 'pending', null ) );
    }

    // ════════════════════════════════════════════════════════════════
    // 3. INVARIANTS — irreversible operation safety
    // ════════════════════════════════════════════════════════════════

    public function test_terminal_states_have_zero_outgoing(): void {
        // CRITICAL — terminal states must NEVER have outgoing transitions
        // (else admin could re-trigger expensive irreversible operations)
        $terminal = array( 'rejected', 'cancelled', 'expired' );
        $any_state = array( 'pending', 'processing', 'ready', 'failed', 'rejected', 'cancelled', 'expired' );
        foreach ( $terminal as $term ) {
            foreach ( $any_state as $other ) {
                $this->assertFalse(
                    dinoco_gdpr_is_valid_status_transition( $term, $other ),
                    "Terminal state '{$term}' must NEVER transition to '{$other}'"
                );
            }
        }
    }

    public function test_ready_only_transitions_to_expired(): void {
        // CRITICAL — once worker succeeded, the only valid next state is 'expired'
        // (cleanup cron). Re-running worker on ready would duplicate side effects.
        $this->assertTrue( dinoco_gdpr_is_valid_status_transition( 'ready', 'expired' ) );
        $bad = array( 'pending', 'processing', 'failed', 'rejected', 'cancelled' );
        foreach ( $bad as $to ) {
            $this->assertFalse(
                dinoco_gdpr_is_valid_status_transition( 'ready', $to ),
                "ready → {$to} would re-trigger irreversible worker"
            );
        }
    }

    // ════════════════════════════════════════════════════════════════
    // 4. REJECT REASON VALIDATION
    // ════════════════════════════════════════════════════════════════

    public function test_legal_hold_reason_accepted(): void {
        $this->assertTrue( dinoco_gdpr_admin_valid_reject_reason( 'legal_hold' ) );
    }

    public function test_fraud_reason_accepted(): void {
        $this->assertTrue( dinoco_gdpr_admin_valid_reject_reason( 'fraud' ) );
    }

    public function test_cooling_off_reason_accepted(): void {
        $this->assertTrue( dinoco_gdpr_admin_valid_reject_reason( 'cooling_off' ) );
    }

    public function test_other_reason_requires_note(): void {
        // 'other' is the catch-all — admin must justify with note >= 5 chars
        $this->assertFalse( dinoco_gdpr_admin_valid_reject_reason( 'other', '' ) );
        $this->assertFalse( dinoco_gdpr_admin_valid_reject_reason( 'other', '   ' ) );
        $this->assertFalse( dinoco_gdpr_admin_valid_reject_reason( 'other', 'no' ) );
        $this->assertTrue(  dinoco_gdpr_admin_valid_reject_reason( 'other', 'admin discretion' ) );
    }

    public function test_unknown_reason_rejected(): void {
        // Schema drift guard — adding new reason requires explicit code change + audit
        $this->assertFalse( dinoco_gdpr_admin_valid_reject_reason( 'because_i_said_so' ) );
        $this->assertFalse( dinoco_gdpr_admin_valid_reject_reason( '' ) );
        $this->assertFalse( dinoco_gdpr_admin_valid_reject_reason( 'LEGAL_HOLD' ) ); // case-strict by design
    }

    // ════════════════════════════════════════════════════════════════
    // 5. TYPED CONFIRMATION GATE (irreversible operation safety)
    // ════════════════════════════════════════════════════════════════

    public function test_approve_requires_literal_APPROVE(): void {
        $this->assertTrue(  dinoco_gdpr_admin_typed_confirmation_ok( 'approve', 'APPROVE' ) );
        $this->assertFalse( dinoco_gdpr_admin_typed_confirmation_ok( 'approve', 'approve' ) );  // case-strict
        $this->assertFalse( dinoco_gdpr_admin_typed_confirmation_ok( 'approve', 'OK' ) );
        $this->assertFalse( dinoco_gdpr_admin_typed_confirmation_ok( 'approve', '' ) );
        $this->assertFalse( dinoco_gdpr_admin_typed_confirmation_ok( 'approve', '1' ) );
        $this->assertFalse( dinoco_gdpr_admin_typed_confirmation_ok( 'approve', 'YES' ) );
    }

    public function test_manual_export_requires_literal_PROCESS(): void {
        $this->assertTrue(  dinoco_gdpr_admin_typed_confirmation_ok( 'manual_export', 'PROCESS' ) );
        $this->assertFalse( dinoco_gdpr_admin_typed_confirmation_ok( 'manual_export', 'process' ) );
        $this->assertFalse( dinoco_gdpr_admin_typed_confirmation_ok( 'manual_export', 'APPROVE' ) ); // wrong literal
        $this->assertFalse( dinoco_gdpr_admin_typed_confirmation_ok( 'manual_export', '' ) );
    }

    public function test_unknown_action_rejected(): void {
        // Adding new action requires explicit literal mapping — fail closed
        $this->assertFalse( dinoco_gdpr_admin_typed_confirmation_ok( 'delete_everything', 'YES' ) );
        $this->assertFalse( dinoco_gdpr_admin_typed_confirmation_ok( '', 'APPROVE' ) );
    }

    public function test_typed_confirmation_truthy_not_enough(): void {
        // CRITICAL — boolean true / "1" / "yes" must NEVER bypass typed gate
        // (else CSRF or careless caller could trigger irreversible op)
        $this->assertFalse( dinoco_gdpr_admin_typed_confirmation_ok( 'approve', '1' ) );
        $this->assertFalse( dinoco_gdpr_admin_typed_confirmation_ok( 'approve', 'true' ) );
        $this->assertFalse( dinoco_gdpr_admin_typed_confirmation_ok( 'approve', 'yes' ) );
        $this->assertFalse( dinoco_gdpr_admin_typed_confirmation_ok( 'manual_export', '1' ) );
    }
}
