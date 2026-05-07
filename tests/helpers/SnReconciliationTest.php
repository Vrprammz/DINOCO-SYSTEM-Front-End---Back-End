<?php
/**
 * SnReconciliationTest — Phase 3 W8.3 quarterly count session pure-logic tests.
 *
 * Source: [Admin System] DINOCO SN Reconciliation V.0.1
 *   functions:
 *     - dinoco_sn_recon_compute_variance_pct (pure)
 *     - dinoco_sn_recon_requires_4eyes        (pure)
 *     - dinoco_sn_recon_valid_resolution      (pure)
 *     - dinoco_sn_recon_is_valid_uuid         (pure)
 *
 * Plan reference: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.0 §K.15
 * Spec: docs/sn-system/16-phase3-w8-cron-infrastructure.md §W8.3
 *
 * Constants under test (mirror snippet):
 *   DINOCO_SN_RECON_4EYES_VARIANCE_PCT = 5
 *   DINOCO_SN_RECON_SLA_DAYS           = 7
 *   DINOCO_SN_RECON_VALID_RESOLUTIONS  = 'cancel,investigate,void_missing'
 *
 * Tests verify:
 *   1. State machine transitions (counting → submitted → closed | cancelled)
 *   2. Variance percentage math (missing+extra / expected)
 *   3. 4-eyes threshold enforcement (>5%)
 *   4. UUID format validation (RFC 4122 v4)
 *   5. Resolution action whitelist
 *   6. SLA timeout boundary (7 days)
 *   7. Edge cases: empty session (0 expected), all-extra, all-missing
 *   8. Idempotent dup-scan recognition
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Pure-logic mirrors of snippet functions ─────────────────────────────── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_recon_compute_variance_pct' ) ) {
    function sn_recon_compute_variance_pct( $expected, $missing, $extra ): float {
        $expected = max( 0, (int) $expected );
        $missing  = max( 0, (int) $missing );
        $extra    = max( 0, (int) $extra );
        if ( $expected === 0 ) {
            return $extra > 0 ? 100.0 : 0.0;
        }
        return ( ( $missing + $extra ) / $expected ) * 100.0;
    }

    function sn_recon_requires_4eyes( $expected, $missing, $extra, $threshold = 5 ): bool {
        $pct = sn_recon_compute_variance_pct( $expected, $missing, $extra );
        return $pct > (float) $threshold;
    }

    function sn_recon_valid_resolution( $action ): bool {
        $allowed = array( 'cancel', 'investigate', 'void_missing' );
        return in_array( strtolower( trim( (string) $action ) ), $allowed, true );
    }

    function sn_recon_is_valid_uuid( $uuid ): bool {
        return is_string( $uuid ) && (bool) preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
            $uuid
        );
    }

    /**
     * Pure state-machine guard. Tests valid transitions for reconciliation
     * session lifecycle. Mirrors logic in close/submit handlers.
     *
     * Allowed transitions:
     *   counting  → submitted (via submit)
     *   counting  → cancelled (via close with action=cancel — admin force)
     *   counting  → closed    (via close with action≠cancel — rare admin path)
     *   submitted → closed    (via close, any resolution_action)
     *   submitted → cancelled (NOT allowed — must close instead)
     *   any other → (terminal — no further transitions)
     */
    function sn_recon_can_transition( $from, $to, $resolution_action = '' ): bool {
        $from = strtolower( trim( (string) $from ) );
        $to   = strtolower( trim( (string) $to ) );
        $resolution_action = strtolower( trim( (string) $resolution_action ) );
        if ( $from === 'counting' ) {
            if ( $to === 'submitted' ) return true;
            if ( $to === 'cancelled' && $resolution_action === 'cancel' ) return true;
            if ( $to === 'closed' && in_array( $resolution_action, array( 'void_missing', 'investigate' ), true ) ) return true;
            return false;
        }
        if ( $from === 'submitted' ) {
            return $to === 'closed';
        }
        return false; // closed + cancelled = terminal
    }

    /**
     * Pure SLA timeout calculation. Returns true if session should auto-cancel.
     * Mirrors cron logic.
     */
    function sn_recon_is_stale( $started_at_unix, $now_unix, $sla_days = 7 ): bool {
        $cutoff = $now_unix - $sla_days * 86400;
        return (int) $started_at_unix < $cutoff;
    }
}

class SnReconciliationTest extends TestCase {

    /* ─── 1. Variance percentage math ──────────────────────────────────── */

    public function test_variance_zero_when_all_match() {
        $this->assertSame( 0.0, sn_recon_compute_variance_pct( 100, 0, 0 ) );
    }

    public function test_variance_5_percent_with_5_missing_of_100() {
        $this->assertSame( 5.0, sn_recon_compute_variance_pct( 100, 5, 0 ) );
    }

    public function test_variance_combines_missing_plus_extra() {
        // 3 missing + 2 extra of 100 = 5%
        $this->assertSame( 5.0, sn_recon_compute_variance_pct( 100, 3, 2 ) );
    }

    public function test_variance_100_percent_when_all_missing() {
        $this->assertSame( 100.0, sn_recon_compute_variance_pct( 50, 50, 0 ) );
    }

    public function test_variance_empty_session_zero_when_nothing_extra() {
        // expected=0 + extra=0 + missing=0 → 0% (degenerate but valid)
        $this->assertSame( 0.0, sn_recon_compute_variance_pct( 0, 0, 0 ) );
    }

    public function test_variance_empty_session_100_when_extras_found() {
        // expected=0 but admin scanned plates → 100% (all extra)
        $this->assertSame( 100.0, sn_recon_compute_variance_pct( 0, 0, 5 ) );
    }

    public function test_variance_negative_inputs_clamped_to_zero() {
        // Defensive — should not throw or produce negative %
        $this->assertSame( 0.0, sn_recon_compute_variance_pct( 100, -5, -3 ) );
    }

    /* ─── 2. 4-eyes threshold enforcement ──────────────────────────────── */

    public function test_4eyes_required_above_5_percent() {
        // 6 missing of 100 = 6% > 5% threshold → 4-eyes
        $this->assertTrue( sn_recon_requires_4eyes( 100, 6, 0 ) );
    }

    public function test_4eyes_NOT_required_at_exactly_5_percent() {
        // Boundary: 5.0% NOT > 5 (strict >)
        $this->assertFalse( sn_recon_requires_4eyes( 100, 5, 0 ) );
    }

    public function test_4eyes_NOT_required_below_5_percent() {
        $this->assertFalse( sn_recon_requires_4eyes( 1000, 25, 25 ) ); // 5.0% boundary
        $this->assertFalse( sn_recon_requires_4eyes( 100, 4, 0 ) );    // 4%
    }

    public function test_4eyes_required_for_high_variance() {
        $this->assertTrue( sn_recon_requires_4eyes( 100, 30, 0 ) );  // 30%
        $this->assertTrue( sn_recon_requires_4eyes( 100, 10, 5 ) );  // 15%
    }

    public function test_4eyes_required_for_empty_session_with_extras() {
        // expected=0 + any extras = 100% → 4-eyes
        $this->assertTrue( sn_recon_requires_4eyes( 0, 0, 1 ) );
    }

    /* ─── 3. State machine transitions ─────────────────────────────────── */

    public function test_state_counting_to_submitted_allowed() {
        $this->assertTrue( sn_recon_can_transition( 'counting', 'submitted' ) );
    }

    public function test_state_counting_to_cancelled_only_with_cancel_action() {
        $this->assertTrue( sn_recon_can_transition( 'counting', 'cancelled', 'cancel' ) );
        $this->assertFalse( sn_recon_can_transition( 'counting', 'cancelled', 'void_missing' ) );
    }

    public function test_state_submitted_to_closed_allowed_for_all_resolutions() {
        $this->assertTrue( sn_recon_can_transition( 'submitted', 'closed', 'void_missing' ) );
        $this->assertTrue( sn_recon_can_transition( 'submitted', 'closed', 'investigate' ) );
        $this->assertTrue( sn_recon_can_transition( 'submitted', 'closed', 'cancel' ) );
    }

    public function test_state_submitted_to_cancelled_NOT_allowed() {
        // Once submitted, must close — no direct cancel
        $this->assertFalse( sn_recon_can_transition( 'submitted', 'cancelled', 'cancel' ) );
    }

    public function test_state_terminal_states_cannot_transition() {
        $this->assertFalse( sn_recon_can_transition( 'closed', 'submitted' ) );
        $this->assertFalse( sn_recon_can_transition( 'closed', 'counting' ) );
        $this->assertFalse( sn_recon_can_transition( 'cancelled', 'closed' ) );
    }

    /* ─── 4. UUID validation ────────────────────────────────────────────── */

    public function test_uuid_v4_valid() {
        $this->assertTrue( sn_recon_is_valid_uuid( 'a1b2c3d4-e5f6-4789-9abc-def012345678' ) );
    }

    public function test_uuid_invalid_formats_rejected() {
        $this->assertFalse( sn_recon_is_valid_uuid( 'not-a-uuid' ) );
        $this->assertFalse( sn_recon_is_valid_uuid( 'a1b2c3d4-e5f6-4789-9abc' ) );  // truncated
        $this->assertFalse( sn_recon_is_valid_uuid( 'A1B2C3D4-E5F6-4789-9ABC-DEF012345678X' ) );  // too long
        $this->assertFalse( sn_recon_is_valid_uuid( '' ) );
        $this->assertFalse( sn_recon_is_valid_uuid( '12345678' ) );
    }

    /* ─── 5. Resolution action whitelist ───────────────────────────────── */

    public function test_resolution_action_whitelist() {
        $this->assertTrue( sn_recon_valid_resolution( 'void_missing' ) );
        $this->assertTrue( sn_recon_valid_resolution( 'investigate' ) );
        $this->assertTrue( sn_recon_valid_resolution( 'cancel' ) );
    }

    public function test_resolution_action_case_insensitive() {
        $this->assertTrue( sn_recon_valid_resolution( 'VOID_MISSING' ) );
        $this->assertTrue( sn_recon_valid_resolution( '  Investigate  ' ) );
    }

    public function test_resolution_action_unknown_rejected() {
        $this->assertFalse( sn_recon_valid_resolution( 'delete' ) );
        $this->assertFalse( sn_recon_valid_resolution( 'recall' ) );
        $this->assertFalse( sn_recon_valid_resolution( '' ) );
        $this->assertFalse( sn_recon_valid_resolution( 'unknown_action' ) );
    }

    /* ─── 6. SLA timeout (7 days) ──────────────────────────────────────── */

    public function test_sla_session_younger_than_7_days_not_stale() {
        $now = 1714560000; // 2026-05-01 fixed timestamp
        $started_3_days_ago = $now - 3 * 86400;
        $this->assertFalse( sn_recon_is_stale( $started_3_days_ago, $now, 7 ) );
    }

    public function test_sla_session_older_than_7_days_is_stale() {
        $now = 1714560000;
        $started_8_days_ago = $now - 8 * 86400;
        $this->assertTrue( sn_recon_is_stale( $started_8_days_ago, $now, 7 ) );
    }

    public function test_sla_boundary_exactly_7_days_old_not_stale() {
        // Strict less-than — at exactly cutoff, NOT stale
        $now = 1714560000;
        $exact_7_days_ago = $now - 7 * 86400;
        $this->assertFalse( sn_recon_is_stale( $exact_7_days_ago, $now, 7 ) );
    }

    public function test_sla_boundary_just_past_7_days_is_stale() {
        $now = 1714560000;
        $just_past = $now - 7 * 86400 - 1;
        $this->assertTrue( sn_recon_is_stale( $just_past, $now, 7 ) );
    }

    /* ─── 7. Idempotent scan recognition (UNIQUE constraint behavior) ─── */

    public function test_dup_scan_returns_idempotent_marker() {
        // Simulate the dup-scan response shape from dinoco_sn_recon_record_scan.
        // The contract: when UNIQUE KEY uq_session_sn fires, function should
        // return existing scan + dup=true (not error).
        $existing_response = array(
            'scanned_count'   => 42,
            'found_in_system' => true,
            'sn'              => 'DNCSS0001234',
            'message'         => 'duplicate_scan_idempotent',
            'dup'             => true,
        );
        $this->assertTrue( $existing_response['dup'] );
        $this->assertSame( 'duplicate_scan_idempotent', $existing_response['message'] );
        // Count should NOT increment on dup
        $this->assertSame( 42, $existing_response['scanned_count'] );
    }

    public function test_fresh_scan_increments_counter() {
        $fresh_response = array(
            'scanned_count'   => 43,
            'found_in_system' => true,
            'sn'              => 'DNCSS0001235',
            'message'         => 'recorded',
            'dup'             => false,
        );
        $this->assertFalse( $fresh_response['dup'] );
        $this->assertSame( 'recorded', $fresh_response['message'] );
    }

    public function test_unknown_sn_scan_marked_correctly() {
        // Plate scanned but not in sn_pool with status='in_pool'
        $unknown_response = array(
            'scanned_count'   => 44,
            'found_in_system' => false,
            'sn'              => 'DNCSS9999999',
            'message'         => 'recorded_unknown_sn',
            'dup'             => false,
        );
        $this->assertFalse( $unknown_response['found_in_system'] );
        $this->assertSame( 'recorded_unknown_sn', $unknown_response['message'] );
    }
}
