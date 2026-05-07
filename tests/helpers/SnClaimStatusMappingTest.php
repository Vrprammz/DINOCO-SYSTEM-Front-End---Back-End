<?php
/**
 * SnClaimStatusMappingTest — pure-logic test of claim_ticket → sn_pool.status mapping.
 *
 * Source: [Admin System] DINOCO Service Center & Claims V.31.0
 *   function dinoco_sn_map_claim_to_pool_status()
 *
 * Plan reference: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.6 §Gap A
 * Phase: 2 W6.4 (Service Center sn_pool integration)
 *
 * Tests the 11-status FSM mapping matrix from v2.6 spec:
 *   - in-flight statuses (pending..repairing..quality_check)  → claimed (lock)
 *   - completed (Repaired Item Dispatched, no replacement)    → registered (revert)
 *   - completed + _b2b_replacement_sent                       → replaced
 *   - Replacement Shipped                                     → replaced
 *   - rejected/cancelled/Replacement Rejected by Company      → registered (revert)
 *   - closed                                                  → no_change (terminal)
 *   - unknown / empty status                                  → no_change (defensive)
 *   - prev_status preservation logic                          → revert via stored prev
 *
 * Pattern mirrors SnHierarchyTest.php — pure logic, no DB / no WP runtime.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/**
 * Mirror of dinoco_sn_map_claim_to_pool_status() — pure logic without WP deps.
 *
 * Replacement detection in real helper uses get_post_meta(); test stub takes
 * an explicit $replacement_sent flag to keep this 100% pure-logic.
 */
if ( ! function_exists( __NAMESPACE__ . '\\sn_map_claim_to_pool_status' ) ) {
    function sn_map_claim_to_pool_status( string $claim_status, bool $replacement_sent = false ): array {
        $cs = trim( $claim_status );

        // Closed = terminal, plate already in final state
        if ( $cs === 'closed' || $cs === 'Closed' ) {
            return array( 'action' => 'no_change', 'target' => '' );
        }

        // Rejected / Cancelled → revert plate
        if ( in_array( $cs, array(
            'rejected', 'Rejected',
            'Replacement Rejected by Company',
            'cancelled', 'Cancelled',
        ), true ) ) {
            return array( 'action' => 'revert', 'target' => 'registered' );
        }

        // Completed flows: depends on replacement flag
        if ( in_array( $cs, array(
            'completed', 'Completed',
            'Repaired Item Dispatched',
            'Maintenance Completed',
        ), true ) ) {
            if ( $replacement_sent ) {
                return array( 'action' => 'replace', 'target' => 'replaced' );
            }
            return array( 'action' => 'revert', 'target' => 'registered' );
        }

        if ( $cs === 'Replacement Shipped' ) {
            return array( 'action' => 'replace', 'target' => 'replaced' );
        }

        // All other in-flight statuses → lock plate as `claimed`
        $in_flight = array(
            'pending', 'Pending',
            'reviewing', 'Reviewing',
            'approved', 'Approved',
            'in_progress', 'In Progress',
            'waiting_parts', 'Waiting Parts',
            'repairing', 'Repairing',
            'quality_check', 'Quality Check',
            'Registered in System',
            'Pending Issue Verification',
            'Awaiting Customer Shipment',
            'In Transit to Company',
            'Received at Company',
            'Under Maintenance',
            'Replacement Approved',
        );
        if ( in_array( $cs, $in_flight, true ) ) {
            return array( 'action' => 'lock', 'target' => 'claimed' );
        }

        // Unknown → defensive no-op
        return array( 'action' => 'no_change', 'target' => '' );
    }
}

/**
 * Pure-logic mirror of prev_status preservation pattern from
 * dinoco_sn_claim_status_changed() — extracted for unit testing.
 *
 * Returns: [ 'new_status' => string, 'prev_status' => string|null ]
 *
 * Logic:
 *   - lock (→ claimed): preserve old_pool_status into prev_status
 *   - revert: use stored prev_status if non-empty; else default 'registered';
 *             clear prev_status after revert
 *   - replace (→ replaced): keep prev_status as-is (chain note)
 *   - no_change: passthrough
 */
if ( ! function_exists( __NAMESPACE__ . '\\sn_resolve_pool_update' ) ) {
    function sn_resolve_pool_update( string $action, string $target, string $old_status, ?string $stored_prev ): array {
        if ( $action === 'lock' ) {
            return array(
                'new_status'  => $target,
                'prev_status' => ( $old_status === 'claimed' ) ? $stored_prev : $old_status,
            );
        }
        if ( $action === 'revert' ) {
            $resolved = ! empty( $stored_prev ) ? $stored_prev : 'registered';
            return array(
                'new_status'  => $resolved,
                'prev_status' => null,
            );
        }
        if ( $action === 'replace' ) {
            return array(
                'new_status'  => $target,
                'prev_status' => $stored_prev,
            );
        }
        // no_change
        return array(
            'new_status'  => $old_status,
            'prev_status' => $stored_prev,
        );
    }
}

class SnClaimStatusMappingTest extends TestCase {

    // ─────────────────────────────────────────────────────────────────────
    // 1. In-flight statuses → lock plate as `claimed`
    // ─────────────────────────────────────────────────────────────────────

    public function test_pending_locks_plate(): void {
        $r = sn_map_claim_to_pool_status( 'pending' );
        $this->assertSame( 'lock', $r['action'] );
        $this->assertSame( 'claimed', $r['target'] );
    }

    public function test_reviewing_locks_plate(): void {
        $r = sn_map_claim_to_pool_status( 'reviewing' );
        $this->assertSame( 'lock', $r['action'] );
        $this->assertSame( 'claimed', $r['target'] );
    }

    public function test_approved_locks_plate(): void {
        $r = sn_map_claim_to_pool_status( 'approved' );
        $this->assertSame( 'lock', $r['action'] );
    }

    public function test_in_progress_locks_plate(): void {
        $r = sn_map_claim_to_pool_status( 'in_progress' );
        $this->assertSame( 'lock', $r['action'] );
    }

    public function test_waiting_parts_locks_plate(): void {
        $r = sn_map_claim_to_pool_status( 'waiting_parts' );
        $this->assertSame( 'lock', $r['action'] );
    }

    public function test_repairing_locks_plate(): void {
        $r = sn_map_claim_to_pool_status( 'repairing' );
        $this->assertSame( 'lock', $r['action'] );
    }

    public function test_quality_check_locks_plate(): void {
        $r = sn_map_claim_to_pool_status( 'quality_check' );
        $this->assertSame( 'lock', $r['action'] );
    }

    public function test_long_form_pending_issue_verification_locks(): void {
        $r = sn_map_claim_to_pool_status( 'Pending Issue Verification' );
        $this->assertSame( 'lock', $r['action'] );
        $this->assertSame( 'claimed', $r['target'] );
    }

    public function test_long_form_awaiting_customer_shipment_locks(): void {
        $r = sn_map_claim_to_pool_status( 'Awaiting Customer Shipment' );
        $this->assertSame( 'lock', $r['action'] );
    }

    public function test_long_form_under_maintenance_locks(): void {
        $r = sn_map_claim_to_pool_status( 'Under Maintenance' );
        $this->assertSame( 'lock', $r['action'] );
    }

    public function test_replacement_approved_locks(): void {
        $r = sn_map_claim_to_pool_status( 'Replacement Approved' );
        $this->assertSame( 'lock', $r['action'] );
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. Completed flows — depends on replacement flag
    // ─────────────────────────────────────────────────────────────────────

    public function test_completed_repair_reverts_to_registered(): void {
        $r = sn_map_claim_to_pool_status( 'completed', false );
        $this->assertSame( 'revert', $r['action'] );
        $this->assertSame( 'registered', $r['target'] );
    }

    public function test_completed_with_replacement_flag_marks_replaced(): void {
        $r = sn_map_claim_to_pool_status( 'completed', true );
        $this->assertSame( 'replace', $r['action'] );
        $this->assertSame( 'replaced', $r['target'] );
    }

    public function test_repaired_item_dispatched_no_replacement_reverts(): void {
        $r = sn_map_claim_to_pool_status( 'Repaired Item Dispatched', false );
        $this->assertSame( 'revert', $r['action'] );
        $this->assertSame( 'registered', $r['target'] );
    }

    public function test_replacement_shipped_marks_replaced(): void {
        $r = sn_map_claim_to_pool_status( 'Replacement Shipped' );
        $this->assertSame( 'replace', $r['action'] );
        $this->assertSame( 'replaced', $r['target'] );
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. Reject / Cancel → revert
    // ─────────────────────────────────────────────────────────────────────

    public function test_rejected_reverts_to_registered(): void {
        $r = sn_map_claim_to_pool_status( 'rejected' );
        $this->assertSame( 'revert', $r['action'] );
        $this->assertSame( 'registered', $r['target'] );
    }

    public function test_replacement_rejected_by_company_reverts(): void {
        $r = sn_map_claim_to_pool_status( 'Replacement Rejected by Company' );
        $this->assertSame( 'revert', $r['action'] );
    }

    public function test_cancelled_reverts(): void {
        $r = sn_map_claim_to_pool_status( 'cancelled' );
        $this->assertSame( 'revert', $r['action'] );
        $this->assertSame( 'registered', $r['target'] );
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4. Terminal states / unknown / edge cases
    // ─────────────────────────────────────────────────────────────────────

    public function test_closed_is_no_change(): void {
        $r = sn_map_claim_to_pool_status( 'closed' );
        $this->assertSame( 'no_change', $r['action'] );
        $this->assertSame( '', $r['target'] );
    }

    public function test_unknown_status_is_no_change(): void {
        $r = sn_map_claim_to_pool_status( 'foo_bar_baz' );
        $this->assertSame( 'no_change', $r['action'] );
    }

    public function test_empty_status_is_no_change(): void {
        $r = sn_map_claim_to_pool_status( '' );
        $this->assertSame( 'no_change', $r['action'] );
    }

    public function test_whitespace_status_is_no_change(): void {
        $r = sn_map_claim_to_pool_status( '   ' );
        $this->assertSame( 'no_change', $r['action'] );
    }

    // ─────────────────────────────────────────────────────────────────────
    // 5. prev_status preservation logic
    // ─────────────────────────────────────────────────────────────────────

    public function test_lock_preserves_old_status_into_prev(): void {
        // Old=registered → flip to claimed → prev_status=registered
        $r = sn_resolve_pool_update( 'lock', 'claimed', 'registered', null );
        $this->assertSame( 'claimed', $r['new_status'] );
        $this->assertSame( 'registered', $r['prev_status'] );
    }

    public function test_revert_uses_stored_prev_status(): void {
        // Old=claimed, prev=registered → revert → restore registered + clear prev
        $r = sn_resolve_pool_update( 'revert', 'registered', 'claimed', 'registered' );
        $this->assertSame( 'registered', $r['new_status'] );
        $this->assertNull( $r['prev_status'] );
    }

    public function test_revert_falls_back_to_registered_when_prev_empty(): void {
        // Defensive: prev_status not set → assume registered
        $r = sn_resolve_pool_update( 'revert', 'registered', 'claimed', null );
        $this->assertSame( 'registered', $r['new_status'] );
        $this->assertNull( $r['prev_status'] );
    }

    public function test_lock_does_not_overwrite_prev_when_already_claimed(): void {
        // Already claimed (idempotent re-lock) → keep stored prev
        $r = sn_resolve_pool_update( 'lock', 'claimed', 'claimed', 'registered' );
        $this->assertSame( 'claimed', $r['new_status'] );
        $this->assertSame( 'registered', $r['prev_status'] );
    }

    public function test_replace_keeps_prev_status(): void {
        $r = sn_resolve_pool_update( 'replace', 'replaced', 'claimed', 'registered' );
        $this->assertSame( 'replaced', $r['new_status'] );
        $this->assertSame( 'registered', $r['prev_status'] );
    }

    public function test_no_change_passes_through(): void {
        $r = sn_resolve_pool_update( 'no_change', '', 'closed', null );
        $this->assertSame( 'closed', $r['new_status'] );
        $this->assertNull( $r['prev_status'] );
    }
}
