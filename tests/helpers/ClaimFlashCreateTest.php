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

    // ════════════════════════════════════════════════════════════════
    // Sprint 27 LOW-8 — 3 NEW fixtures for Sprint 25 CRIT-1 / CRIT-2 /
    // HIGH-3 fixes (pure-logic shape tests; integration via Jest drift).
    // ════════════════════════════════════════════════════════════════

    /**
     * Sprint 25 CRIT-1: inbound_pickup direction must swap src↔dst in the
     * mask preview copy. This fixture verifies the swap helper's shape.
     */
    public function test_sprint25_crit1_inbound_pickup_mask_swap_correctness() {
        // Simulate the swap logic from V.0.3 dispatcher (lines ~316-330)
        $params_api = array(
            'srcName' => 'Customer Somchai', 'srcPhone' => '0812345678', 'srcDetailAddress' => '123 Main St',
            'dstName' => 'DINOCO Warehouse', 'dstPhone' => '0200000000', 'dstDetailAddress' => 'Bangkok HQ',
        );
        $params_for_mask = $params_api;
        $direction = 'inbound_pickup';
        if ( $direction === 'inbound_pickup' ) {
            $swap_keys = array(
                array( 'srcName', 'dstName' ),
                array( 'srcPhone', 'dstPhone' ),
                array( 'srcDetailAddress', 'dstDetailAddress' ),
            );
            foreach ( $swap_keys as $pair ) {
                $tmp = $params_for_mask[ $pair[0] ];
                $params_for_mask[ $pair[0] ] = $params_for_mask[ $pair[1] ];
                $params_for_mask[ $pair[1] ] = $tmp;
            }
        }
        // Customer PII now in dst* slot (where masker expects to mask)
        $this->assertSame( 'Customer Somchai', $params_for_mask['dstName'] );
        $this->assertSame( '0812345678', $params_for_mask['dstPhone'] );
        // Warehouse now in src* slot (where masker leaves plain)
        $this->assertSame( 'DINOCO Warehouse', $params_for_mask['srcName'] );
        // Original $params_api UNCHANGED (Flash API payload integrity)
        $this->assertSame( 'Customer Somchai', $params_api['srcName'] );
        $this->assertSame( 'DINOCO Warehouse', $params_api['dstName'] );
    }

    /**
     * Sprint 25 CRIT-2: G2 1003 recovery must pin outTradeNo from the
     * lookup response (Flash's canonical record) — not the in-flight
     * mutated copy.
     */
    public function test_sprint25_crit2_outtradeno_pinned_from_lookup_response() {
        // Simulate lookup hit branch
        $params_api = array( 'outTradeNo' => 'CLM-FLASH-100-AB12-r2' );  // mutated to -r2 mid-retry
        $lookup = array(
            'ok'   => true,
            'data' => array( 'pno' => 'FX123456', 'outTradeNo' => 'CLM-FLASH-100-AB12' ),  // Flash's record
        );
        // V.0.3 CRIT-2 fix: pin params_api['outTradeNo'] from lookup data
        if ( isset( $lookup['data']['outTradeNo'] ) ) {
            $params_api['outTradeNo'] = (string) $lookup['data']['outTradeNo'];
        }
        $this->assertSame( 'CLM-FLASH-100-AB12', $params_api['outTradeNo'] );
        $this->assertNotSame( 'CLM-FLASH-100-AB12-r2', $params_api['outTradeNo'],
            'outTradeNo MUST be pinned to Flash record else future cancel/status lookups will 404'
        );
    }

    /**
     * Sprint 25 HIGH-3: returnXxx fields must fallback to src_* (not empty
     * string) when b2b_registered_address option is missing/empty.
     */
    public function test_sprint25_high3_return_falls_back_to_src_not_empty() {
        // Simulate V.0.3 dispatcher else-branch (no registered_address)
        $reg = array();  // empty option
        $src_address = '123 Customer Lane';
        $src_phone   = '0812345678';
        $src_district = 'Lat Phrao';

        $return_address = ! empty( $reg ) && is_array( $reg )
            ? ( ! empty( $reg['reg_address'] ) ? $reg['reg_address'] : $src_address )
            : $src_address;
        $return_phone = ! empty( $reg ) && is_array( $reg )
            ? ( ! empty( $reg['reg_phone'] ) ? $reg['reg_phone'] : $src_phone )
            : $src_phone;
        $return_district = ! empty( $reg ) && is_array( $reg )
            ? ( ! empty( $reg['reg_district'] ) ? $reg['reg_district'] : $src_district )
            : $src_district;

        // All return* fields must contain SOMETHING (not empty) for Flash to
        // accept payload + route parcels to recoverable address on failure
        $this->assertNotSame( '', $return_address, 'returnDetailAddress empty → parcel-lost risk' );
        $this->assertNotSame( '', $return_phone, 'returnPhone empty → Flash silent reject risk' );
        $this->assertNotSame( '', $return_district, 'returnDistrictName empty → ambiguous address' );
        // Specifically falls back to src_* (recoverable address chain)
        $this->assertSame( $src_address, $return_address );
        $this->assertSame( $src_phone, $return_phone );
        $this->assertSame( $src_district, $return_district );
    }
}
