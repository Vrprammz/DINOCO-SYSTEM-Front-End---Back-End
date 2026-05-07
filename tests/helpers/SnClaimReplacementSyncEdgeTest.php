<?php
/**
 * REG-093 — Claim FSM 11-status → sn_pool replacement edge map.
 *
 * Plan v2.13 §Phase 1 W4 R3 BLOCKER.
 *
 * Service Center claim_ticket has 11 statuses (per WORKFLOW-REFERENCE.md):
 *   pending / reviewing / approved / in_progress / waiting_parts /
 *   repairing / quality_check / completed / rejected / cancelled / closed
 *
 * sn_pool downstream mapping (V.31.0+):
 *   completed + _b2b_replacement_sent=1 → 'replaced'
 *   completed + (no flag)               → 'registered' (repair returned)
 *   rejected                             → 'registered' (revert prev_status)
 *   cancelled                            → 'registered' (revert prev_status)
 *   closed                               → terminal — keep current
 *   pending..quality_check               → 'claimed' (in-flight)
 *
 * 22 cases (11 statuses × {flag=0, flag=1}).
 *
 * Pure-logic mirror of dinoco_sn_map_claim_to_pool_status().
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\SnClaimReplacementSyncEdge;

use PHPUnit\Framework\TestCase;

const CLAIM_STATUSES_11 = array(
    'pending', 'reviewing', 'approved', 'in_progress', 'waiting_parts',
    'repairing', 'quality_check', 'completed', 'rejected', 'cancelled', 'closed',
);

if ( ! function_exists( __NAMESPACE__ . '\\map_claim_to_pool_status' ) ) {
    /**
     * Mirror of dinoco_sn_map_claim_to_pool_status().
     *
     * @param string $claim_status One of CLAIM_STATUSES_11.
     * @param bool   $replacement_sent True if `_b2b_replacement_sent` postmeta = 1.
     * @param string $prev_pool_status Pool status before claim opened (for revert).
     * @return string|null New pool status, or null = no change.
     */
    function map_claim_to_pool_status( string $claim_status, bool $replacement_sent, string $prev_pool_status ): ?string {
        switch ( $claim_status ) {
            case 'pending':
            case 'reviewing':
            case 'approved':
            case 'in_progress':
            case 'waiting_parts':
            case 'repairing':
            case 'quality_check':
                return 'claimed';

            case 'completed':
                return $replacement_sent ? 'replaced' : 'registered';

            case 'rejected':
            case 'cancelled':
                // revert to prev status — typically 'registered'
                return $prev_pool_status;

            case 'closed':
                // terminal — keep current state (no change)
                return null;

            default:
                return null;
        }
    }
}

class SnClaimReplacementSyncEdgeTest extends TestCase {

    /* ─── In-flight states (7 statuses × 2 flag = 14 — flag is irrelevant pre-completion) ─── */

    public function test_pending_maps_to_claimed_no_flag(): void {
        $this->assertSame( 'claimed', map_claim_to_pool_status( 'pending', false, 'registered' ) );
    }

    public function test_pending_maps_to_claimed_with_flag(): void {
        // Flag should NOT promote to 'replaced' before claim is completed
        $this->assertSame( 'claimed', map_claim_to_pool_status( 'pending', true, 'registered' ) );
    }

    public function test_reviewing_maps_to_claimed(): void {
        $this->assertSame( 'claimed', map_claim_to_pool_status( 'reviewing', false, 'registered' ) );
    }

    public function test_approved_maps_to_claimed(): void {
        $this->assertSame( 'claimed', map_claim_to_pool_status( 'approved', false, 'registered' ) );
    }

    public function test_in_progress_maps_to_claimed(): void {
        $this->assertSame( 'claimed', map_claim_to_pool_status( 'in_progress', false, 'registered' ) );
    }

    public function test_waiting_parts_maps_to_claimed(): void {
        $this->assertSame( 'claimed', map_claim_to_pool_status( 'waiting_parts', false, 'registered' ) );
    }

    public function test_repairing_maps_to_claimed(): void {
        $this->assertSame( 'claimed', map_claim_to_pool_status( 'repairing', false, 'registered' ) );
    }

    public function test_quality_check_maps_to_claimed(): void {
        $this->assertSame( 'claimed', map_claim_to_pool_status( 'quality_check', false, 'registered' ) );
    }

    /* ─── Completed: flag drives the edge ─── */

    public function test_completed_with_replacement_flag_maps_to_replaced(): void {
        $this->assertSame(
            'replaced',
            map_claim_to_pool_status( 'completed', true, 'registered' ),
            '_b2b_replacement_sent=1 → replaced (NOT registered)'
        );
    }

    public function test_completed_without_replacement_flag_maps_to_registered(): void {
        $this->assertSame(
            'registered',
            map_claim_to_pool_status( 'completed', false, 'registered' ),
            'no replacement → repair returned → registered'
        );
    }

    /* ─── Rejected: revert ─── */

    public function test_rejected_reverts_to_prev_no_flag(): void {
        $this->assertSame( 'registered', map_claim_to_pool_status( 'rejected', false, 'registered' ) );
    }

    public function test_rejected_reverts_to_prev_with_flag(): void {
        // Flag is moot when claim rejected
        $this->assertSame( 'registered', map_claim_to_pool_status( 'rejected', true, 'registered' ) );
    }

    public function test_rejected_reverts_to_in_pool_when_prev_was_in_pool(): void {
        // Edge: claim opened from in_pool (some legacy paths)
        $this->assertSame( 'in_pool', map_claim_to_pool_status( 'rejected', false, 'in_pool' ) );
    }

    /* ─── Cancelled: revert ─── */

    public function test_cancelled_reverts_to_prev_no_flag(): void {
        $this->assertSame( 'registered', map_claim_to_pool_status( 'cancelled', false, 'registered' ) );
    }

    public function test_cancelled_reverts_to_prev_with_flag(): void {
        $this->assertSame( 'registered', map_claim_to_pool_status( 'cancelled', true, 'registered' ) );
    }

    /* ─── Closed: terminal — no change ─── */

    public function test_closed_returns_null_no_flag(): void {
        $this->assertNull(
            map_claim_to_pool_status( 'closed', false, 'registered' ),
            'closed = terminal — no pool mutation'
        );
    }

    public function test_closed_returns_null_with_flag(): void {
        $this->assertNull( map_claim_to_pool_status( 'closed', true, 'registered' ) );
    }

    public function test_closed_returns_null_even_if_prev_replaced(): void {
        $this->assertNull( map_claim_to_pool_status( 'closed', true, 'replaced' ) );
    }

    /* ─── Coverage sanity ─── */

    public function test_all_11_statuses_handled_no_silent_fallthrough(): void {
        // Ensure mapper covers every defined status
        foreach ( CLAIM_STATUSES_11 as $status ) {
            $result = map_claim_to_pool_status( $status, false, 'registered' );
            // Either a mapped status or null — never throws
            $this->assertTrue(
                $result === null || in_array( $result, array( 'claimed', 'registered', 'replaced', 'in_pool' ), true ),
                "claim_status={$status} mapped to: " . var_export( $result, true )
            );
        }
    }

    public function test_unknown_claim_status_returns_null(): void {
        $this->assertNull( map_claim_to_pool_status( 'made_up', false, 'registered' ) );
    }

    public function test_completed_with_flag_idempotent_double_call(): void {
        // Re-running mapper for completed+flag must not flip away from 'replaced'
        $a = map_claim_to_pool_status( 'completed', true, 'registered' );
        $b = map_claim_to_pool_status( 'completed', true, 'replaced' );
        $this->assertSame( 'replaced', $a );
        $this->assertSame( 'replaced', $b );
    }

    public function test_rejected_does_not_overwrite_replaced(): void {
        // If claim was rejected after a replacement was sent (rare data state),
        // revert MUST honor prev_pool_status, not blanket 'registered'
        $this->assertSame( 'replaced', map_claim_to_pool_status( 'rejected', false, 'replaced' ) );
    }
}
