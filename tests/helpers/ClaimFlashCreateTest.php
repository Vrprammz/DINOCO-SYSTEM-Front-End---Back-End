<?php
/**
 * ClaimFlashCreateTest — Sprint 23 Phase 3.1+3.2 pure-logic suite.
 *
 * Source of truth: [Admin System] DINOCO Claim Flash Dispatcher V.0.2
 *   - dinoco_claim_flash_direction_to_status()
 *   - dinoco_claim_flash_direction_required_state()
 *   - dinoco_claim_flash_state_to_terminal_status()
 *   - PNO out_trade_no format (CLM-FLASH-{claim_id}-{rand4})
 *   - Idempotency body hash determinism (Sprint 12 PERF-H2: includes actor_user_id)
 *   - Direction whitelist enforcement
 *
 * Pure-logic helpers inlined here so suite runs without WP bootstrap.
 * Race + DB + REST integration validated by Jest drift detector.
 */

use PHPUnit\Framework\TestCase;

// ─── Inline pure-logic helpers (mirror dispatcher V.0.2) ──────────

if ( ! function_exists( 'dinoco_claim_flash_direction_to_status' ) ) {
    function dinoco_claim_flash_direction_to_status( $direction ) {
        $map = array(
            'replacement'     => 'Replacement Shipped',
            'repaired_return' => 'Repaired Item Dispatched',
            'inbound_pickup'  => 'In Transit to Company',
        );
        $direction = is_string( $direction ) ? strtolower( trim( $direction ) ) : '';
        return isset( $map[ $direction ] ) ? $map[ $direction ] : '';
    }
}

if ( ! function_exists( 'dinoco_claim_flash_direction_required_state' ) ) {
    function dinoco_claim_flash_direction_required_state( $direction ) {
        $map = array(
            'replacement'     => 'Approved',
            'repaired_return' => 'Repairing',
            'inbound_pickup'  => 'Pending Pickup',
        );
        $direction = is_string( $direction ) ? strtolower( trim( $direction ) ) : '';
        return isset( $map[ $direction ] ) ? $map[ $direction ] : '';
    }
}

if ( ! function_exists( 'dinoco_claim_flash_state_to_terminal_status' ) ) {
    function dinoco_claim_flash_state_to_terminal_status( $flash_state, $direction ) {
        $flash_state = intval( $flash_state );
        $direction   = is_string( $direction ) ? strtolower( trim( $direction ) ) : '';
        if ( $flash_state !== 5 ) return '';
        $delivered_map = array(
            'replacement'     => 'Replacement Shipped',
            'repaired_return' => 'Maintenance Completed',
            'inbound_pickup'  => 'In Repair Queue',
        );
        return isset( $delivered_map[ $direction ] ) ? $delivered_map[ $direction ] : '';
    }
}

if ( ! function_exists( 'dinoco_claim_flash_build_out_trade_no' ) ) {
    /**
     * Test-friendly out_trade_no builder (production uses wp_generate_password).
     * Format must match `/^CLM-FLASH-\d+-[A-Z0-9]{4}$/`.
     */
    function dinoco_claim_flash_build_out_trade_no( $claim_id, $rand4 ) {
        return 'CLM-FLASH-' . intval( $claim_id ) . '-' . strtoupper( substr( $rand4 . 'XXXX', 0, 4 ) );
    }
}

if ( ! function_exists( 'dinoco_claim_flash_idem_body' ) ) {
    function dinoco_claim_flash_idem_body( $claim_id, $direction, $weight_grams, $actor_user_id ) {
        return array(
            'claim_id'      => intval( $claim_id ),
            'direction'     => strtolower( trim( (string) $direction ) ),
            'weight_grams'  => intval( $weight_grams ),
            'actor_user_id' => intval( $actor_user_id ),
        );
    }
}

class ClaimFlashCreateTest extends TestCase {

    // ─── Direction → status FSM mapping ──────────────────────────

    public function test_direction_replacement_maps_to_replacement_shipped() {
        $this->assertSame( 'Replacement Shipped', dinoco_claim_flash_direction_to_status( 'replacement' ) );
    }

    public function test_direction_repaired_return_maps_to_repaired_item_dispatched() {
        $this->assertSame( 'Repaired Item Dispatched', dinoco_claim_flash_direction_to_status( 'repaired_return' ) );
    }

    public function test_direction_inbound_pickup_maps_to_in_transit_to_company() {
        $this->assertSame( 'In Transit to Company', dinoco_claim_flash_direction_to_status( 'inbound_pickup' ) );
    }

    public function test_direction_case_insensitive() {
        $this->assertSame( 'Replacement Shipped', dinoco_claim_flash_direction_to_status( 'REPLACEMENT' ) );
        $this->assertSame( 'In Transit to Company', dinoco_claim_flash_direction_to_status( '  Inbound_Pickup  ' ) );
    }

    public function test_unknown_direction_returns_empty() {
        $this->assertSame( '', dinoco_claim_flash_direction_to_status( 'bogus' ) );
        $this->assertSame( '', dinoco_claim_flash_direction_to_status( '' ) );
        $this->assertSame( '', dinoco_claim_flash_direction_to_status( null ) );
    }

    // ─── Required source state (pre-transition guard) ────────────

    public function test_required_state_replacement_is_approved() {
        $this->assertSame( 'Approved', dinoco_claim_flash_direction_required_state( 'replacement' ) );
    }

    public function test_required_state_repaired_return_is_repairing() {
        $this->assertSame( 'Repairing', dinoco_claim_flash_direction_required_state( 'repaired_return' ) );
    }

    public function test_required_state_inbound_pickup_is_pending_pickup() {
        $this->assertSame( 'Pending Pickup', dinoco_claim_flash_direction_required_state( 'inbound_pickup' ) );
    }

    public function test_required_state_unknown_direction_empty() {
        $this->assertSame( '', dinoco_claim_flash_direction_required_state( 'bogus' ) );
    }

    // ─── Webhook state → terminal mapping ────────────────────────

    public function test_flash_state_5_replacement_to_replacement_shipped() {
        $this->assertSame( 'Replacement Shipped', dinoco_claim_flash_state_to_terminal_status( 5, 'replacement' ) );
    }

    public function test_flash_state_5_repaired_to_maintenance_completed() {
        $this->assertSame( 'Maintenance Completed', dinoco_claim_flash_state_to_terminal_status( 5, 'repaired_return' ) );
    }

    public function test_flash_state_5_inbound_to_in_repair_queue() {
        $this->assertSame( 'In Repair Queue', dinoco_claim_flash_state_to_terminal_status( 5, 'inbound_pickup' ) );
    }

    public function test_flash_state_non_terminal_returns_empty() {
        // Only state 5 (delivered) is terminal — 1-4, 6-9 should not auto-flip
        foreach ( array( 1, 2, 3, 4, 6, 7, 8, 9 ) as $state ) {
            $this->assertSame( '', dinoco_claim_flash_state_to_terminal_status( $state, 'replacement' ),
                "Flash state {$state} should not be terminal" );
        }
    }

    public function test_flash_state_5_unknown_direction_returns_empty() {
        $this->assertSame( '', dinoco_claim_flash_state_to_terminal_status( 5, '' ) );
        $this->assertSame( '', dinoco_claim_flash_state_to_terminal_status( 5, 'bogus' ) );
    }

    // ─── out_trade_no format ─────────────────────────────────────

    public function test_out_trade_no_format_strict() {
        $otn = dinoco_claim_flash_build_out_trade_no( 12345, 'AB12' );
        $this->assertMatchesRegularExpression( '/^CLM-FLASH-\d+-[A-Z0-9]{4}$/', $otn );
        $this->assertSame( 'CLM-FLASH-12345-AB12', $otn );
    }

    public function test_out_trade_no_uppercases_rand() {
        $otn = dinoco_claim_flash_build_out_trade_no( 1, 'ab12' );
        $this->assertSame( 'CLM-FLASH-1-AB12', $otn );
    }

    public function test_out_trade_no_pads_short_rand() {
        $otn = dinoco_claim_flash_build_out_trade_no( 1, 'A' );
        $this->assertSame( 'CLM-FLASH-1-AXXX', $otn );
    }

    // ─── Idempotency hash determinism ────────────────────────────

    public function test_idempotency_body_same_input_same_hash() {
        $a = dinoco_claim_flash_idem_body( 100, 'replacement', 500, 42 );
        $b = dinoco_claim_flash_idem_body( 100, 'replacement', 500, 42 );
        $this->assertSame( $a, $b );
        $this->assertSame( md5( serialize( $a ) ), md5( serialize( $b ) ) );
    }

    public function test_idempotency_body_different_direction_different_hash() {
        $a = dinoco_claim_flash_idem_body( 100, 'replacement', 500, 42 );
        $b = dinoco_claim_flash_idem_body( 100, 'repaired_return', 500, 42 );
        $this->assertNotEquals( md5( serialize( $a ) ), md5( serialize( $b ) ),
            'Different directions MUST produce different idempotency hash → prevent shipping wrong type via cached replay' );
    }

    public function test_idempotency_body_different_actor_different_hash() {
        // Sprint 12 PERF-H2: actor_user_id is part of body → admin A cannot replay admin B's request
        $a = dinoco_claim_flash_idem_body( 100, 'replacement', 500, 42 );
        $b = dinoco_claim_flash_idem_body( 100, 'replacement', 500, 99 );
        $this->assertNotEquals( md5( serialize( $a ) ), md5( serialize( $b ) ) );
    }

    public function test_idempotency_body_normalizes_direction_case() {
        $a = dinoco_claim_flash_idem_body( 100, 'REPLACEMENT', 500, 42 );
        $b = dinoco_claim_flash_idem_body( 100, 'replacement', 500, 42 );
        $this->assertSame( $a, $b, 'Direction case should be normalized in idem body' );
    }

    public function test_idempotency_body_int_coerce_claim_id_and_weight() {
        $a = dinoco_claim_flash_idem_body( '100', 'replacement', '500', '42' );
        $this->assertSame( 100, $a['claim_id'] );
        $this->assertSame( 500, $a['weight_grams'] );
        $this->assertSame( 42, $a['actor_user_id'] );
    }
}
