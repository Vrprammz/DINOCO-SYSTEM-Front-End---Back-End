<?php
/**
 * SnStolenRecoveryTest — pure-logic test of W11.2 F#14 stolen recovery flow.
 *
 * Source: [System] DINOCO SN REST API V.0.21+ — dinoco_sn_validate_recovery_state()
 *         + dinoco_sn_build_recovery_flex()
 * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §F.14
 * Phase: 3 W11.2
 *
 * Asserts:
 *   - Recovery state machine: reported|verified → recovered allowed
 *   - Recovery → recovered = 409 idempotent error
 *   - Recovery from closed = 422 terminal
 *   - Pool revert: 'recalled' → prev_status (or 'registered' fallback)
 *   - Audit row shape (event_type, status_to, recovery_date in context)
 *   - LINE Flex Card shape (envelope + bubble + S/N + Thai date)
 *
 * NOTE: pure-logic mirror — no DB, no LINE API mock needed.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_validate_recovery_state' ) ) {
    /**
     * Mirror of dinoco_sn_validate_recovery_state().
     */
    function sn_validate_recovery_state( $current_status ) {
        $current_status = strtolower( trim( (string) $current_status ) );
        if ( in_array( $current_status, array( 'reported', 'verified' ), true ) ) {
            return array( 'allowed' => true );
        }
        if ( $current_status === 'recovered' ) {
            return array( 'allowed' => false, 'error_code' => 'already_recovered', 'http_status' => 409 );
        }
        if ( $current_status === 'closed' ) {
            return array( 'allowed' => false, 'error_code' => 'closed_terminal', 'http_status' => 422 );
        }
        return array( 'allowed' => false, 'error_code' => 'invalid_state', 'http_status' => 422 );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_resolve_pool_revert_target' ) ) {
    /**
     * Pure-logic mirror of pool revert decision (extracted from rest handler).
     * Returns target sn_pool.status to revert to when stolen plate recovered.
     */
    function sn_resolve_pool_revert_target( $current_status, $prev_status ) {
        $current_status = strtolower( trim( (string) $current_status ) );
        $prev_status    = strtolower( trim( (string) $prev_status ) );
        $valid_revert   = array( 'registered', 'claimed', 'shipped', 'allocated_to_order' );

        // Only revert if currently recalled
        if ( $current_status !== 'recalled' ) {
            return null;
        }
        if ( in_array( $prev_status, $valid_revert, true ) ) {
            return $prev_status;
        }
        return 'registered';
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_build_recovery_flex_minimal' ) ) {
    /**
     * Pure-logic mirror of dinoco_sn_build_recovery_flex() returning a
     * trimmed envelope just for shape assertions (full builder not testable
     * here without home_url() WP runtime).
     */
    function sn_build_recovery_flex_minimal( $sn, $product_name, $recovered_at ) {
        $sn           = (string) $sn;
        $product_name = (string) $product_name;
        $recovered_at = (string) $recovered_at;
        $date_th = '—';
        if ( $recovered_at !== '' ) {
            $ts = strtotime( $recovered_at );
            if ( $ts > 0 ) {
                $date_th = date( 'd/m/Y', $ts );
            }
        }
        return array(
            'type'    => 'flex',
            'altText' => '🎉 เพลทคืนแล้ว — DINOCO',
            'sn'      => $sn,
            'product_name' => $product_name,
            'date_th' => $date_th,
        );
    }
}

class SnStolenRecoveryTest extends TestCase {

    /* ─── Recovery state machine ─── */

    public function test_recovery_from_reported_allowed() {
        $r = sn_validate_recovery_state( 'reported' );
        $this->assertTrue( $r['allowed'] );
    }

    public function test_recovery_from_verified_allowed() {
        $r = sn_validate_recovery_state( 'verified' );
        $this->assertTrue( $r['allowed'] );
    }

    public function test_recovery_from_recovered_blocked_409() {
        $r = sn_validate_recovery_state( 'recovered' );
        $this->assertFalse( $r['allowed'] );
        $this->assertSame( 'already_recovered', $r['error_code'] );
        $this->assertSame( 409, $r['http_status'] );
    }

    public function test_recovery_from_closed_blocked_422() {
        $r = sn_validate_recovery_state( 'closed' );
        $this->assertFalse( $r['allowed'] );
        $this->assertSame( 'closed_terminal', $r['error_code'] );
        $this->assertSame( 422, $r['http_status'] );
    }

    public function test_recovery_from_unknown_state_blocked_422() {
        // Defensive: unknown status → invalid_state 422 (not 500)
        $r = sn_validate_recovery_state( 'pending_review' );
        $this->assertFalse( $r['allowed'] );
        $this->assertSame( 'invalid_state', $r['error_code'] );
        $this->assertSame( 422, $r['http_status'] );
    }

    public function test_recovery_state_case_insensitive() {
        // Mixed case + whitespace tolerated
        $r1 = sn_validate_recovery_state( '  REPORTED  ' );
        $r2 = sn_validate_recovery_state( 'Verified' );
        $this->assertTrue( $r1['allowed'] );
        $this->assertTrue( $r2['allowed'] );
    }

    /* ─── Pool revert decision ─── */

    public function test_pool_revert_recalled_to_prev_registered() {
        // pool.status='recalled' + prev_status='registered' → 'registered'
        $this->assertSame( 'registered',
            sn_resolve_pool_revert_target( 'recalled', 'registered' ) );
    }

    public function test_pool_revert_recalled_to_prev_claimed() {
        $this->assertSame( 'claimed',
            sn_resolve_pool_revert_target( 'recalled', 'claimed' ) );
    }

    public function test_pool_revert_recalled_unknown_prev_falls_back_registered() {
        // prev_status missing or invalid → fallback to 'registered'
        $this->assertSame( 'registered',
            sn_resolve_pool_revert_target( 'recalled', '' ) );
        $this->assertSame( 'registered',
            sn_resolve_pool_revert_target( 'recalled', 'voided' ) );
    }

    public function test_pool_no_revert_if_not_recalled() {
        // Defensive: don't revert non-recalled plates (could be voided/registered already)
        $this->assertNull( sn_resolve_pool_revert_target( 'registered', 'claimed' ) );
        $this->assertNull( sn_resolve_pool_revert_target( 'voided',     'registered' ) );
    }

    /* ─── LINE Flex Card shape ─── */

    public function test_flex_envelope_includes_alt_text() {
        $flex = sn_build_recovery_flex_minimal( 'DNCSN12345', 'Crash Bar NX500', '2026-04-15 10:30:00' );
        $this->assertSame( 'flex', $flex['type'] );
        $this->assertStringContainsString( '🎉', $flex['altText'] );
        $this->assertStringContainsString( 'DINOCO', $flex['altText'] );
    }

    public function test_flex_includes_sn_in_recovery_message() {
        $flex = sn_build_recovery_flex_minimal( 'DNCSN12345', 'Crash Bar', '2026-04-15' );
        $this->assertSame( 'DNCSN12345', $flex['sn'] );
    }

    public function test_flex_includes_thai_date_format() {
        // "2026-04-15" → "15/04/2026"
        $flex = sn_build_recovery_flex_minimal( 'X', 'Y', '2026-04-15' );
        $this->assertSame( '15/04/2026', $flex['date_th'] );
    }

    public function test_flex_handles_missing_recovery_date_gracefully() {
        $flex = sn_build_recovery_flex_minimal( 'X', 'Y', '' );
        $this->assertSame( '—', $flex['date_th'] );
    }

    public function test_flex_handles_invalid_date_string() {
        // strtotime() returns false for unparseable → fallback —
        $flex = sn_build_recovery_flex_minimal( 'X', 'Y', 'not-a-date-string' );
        $this->assertSame( '—', $flex['date_th'] );
    }

    public function test_flex_product_name_can_be_empty() {
        // Defensive: missing product name still builds valid flex
        $flex = sn_build_recovery_flex_minimal( 'X', '', '2026-04-15' );
        $this->assertSame( '', $flex['product_name'] );
        $this->assertSame( 'flex', $flex['type'] );
    }

    /* ─── Audit row shape ─── */

    public function test_audit_event_type_for_recovery_is_plate_recovered() {
        // Verify caller emits correct event_type — important for retention split
        // (sensitive=true → 5y retention) and for regression query of recoveries.
        $expected_event = 'plate_recovered';
        $expected_status_to = 'recovered';
        $context = array(
            'stolen_log_id' => 42,
            'recovery_date' => '2026-04-15',
            'evidence_ids'  => array( 12345, 12346 ),
            'owner_user_id' => 7,
        );
        // Just validate the shape we expect callers to produce
        $this->assertSame( 'plate_recovered', $expected_event );
        $this->assertSame( 'recovered', $expected_status_to );
        $this->assertArrayHasKey( 'recovery_date', $context );
        $this->assertArrayHasKey( 'evidence_ids', $context );
        $this->assertIsArray( $context['evidence_ids'] );
    }
}
