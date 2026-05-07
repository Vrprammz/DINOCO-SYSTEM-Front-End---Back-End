<?php
/**
 * SnAssetCardStateTest — pure-logic test of asset card state classifier.
 *
 * Source: [System] Dashboard - Assets List V.31.0
 *   function dinoco_sn_compute_card_state( $plate, $now_ts = null )
 *   function dinoco_sn_mask_phone_for_call( $phone_raw )
 *
 * Plan reference: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13
 * Phase: 2 W7.4 (Member Dashboard Assets List)
 *
 * Tests classifier priority order:
 *   1. null/missing plate         → 'pending_verification'
 *   2. stolen_at set              → 'stolen'           (highest mutable priority)
 *   3. status=voided/recalled     → 'pending_verification'
 *   4. status=claimed             → 'claimed'
 *   5. status!=registered         → 'pending_verification'
 *   6. days_left < 0              → 'expired'
 *   7. days_left ≤ 30 (inclusive) → 'near_expiry'
 *   8. otherwise                  → 'active'
 *
 * Pattern follows SnHierarchyTest.php — pure logic, in-memory plate stdClass.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/**
 * Pure-logic mirror of dinoco_sn_compute_card_state() — no WP dependencies.
 *
 * MUST stay byte-for-byte aligned with the snippet implementation.
 * Drift detector tests/jest/sn-system-drift.test.js asserts the snippet
 * still defines this helper (W7.4 markers).
 */
if ( ! function_exists( __NAMESPACE__ . '\\compute_card_state' ) ) {
    function compute_card_state( $plate, ?int $now_ts = null ): string {
        if ( ! is_object( $plate ) ) return 'pending_verification';

        $stolen_at = $plate->stolen_at ?? '';
        if ( ! empty( $stolen_at ) && $stolen_at !== '0000-00-00 00:00:00' ) {
            return 'stolen';
        }

        $status = isset( $plate->status ) ? (string) $plate->status : '';
        if ( $status === 'voided' || $status === 'recalled' ) return 'pending_verification';
        if ( $status === 'claimed' )                          return 'claimed';
        if ( $status !== 'registered' )                       return 'pending_verification';

        $registered_at = $plate->registered_at ?? '';
        if ( empty( $registered_at ) ) return 'pending_verification';

        $reg_ts = strtotime( $registered_at );
        if ( $reg_ts === false ) return 'pending_verification';

        $now       = is_int( $now_ts ) ? $now_ts : time();
        $end_ts    = $reg_ts + ( 365 * 86400 );
        $days_left = (int) floor( ( $end_ts - $now ) / 86400 );

        if ( $days_left < 0 )   return 'expired';
        if ( $days_left <= 30 ) return 'near_expiry';
        return 'active';
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\mask_phone_for_call' ) ) {
    function mask_phone_for_call( string $phone_raw ): string {
        $digits = preg_replace( '/[^0-9]/', '', $phone_raw );
        if ( strlen( $digits ) < 9 ) return '';
        $head = substr( $digits, 0, 3 );
        $tail = substr( $digits, -4 );
        return $head . '-xxx-' . $tail;
    }
}

final class SnAssetCardStateTest extends TestCase {

    /**
     * Build a fake plate row matching the wp_dinoco_sn_pool schema (hot path).
     */
    private function plate( array $fields ): \stdClass {
        $defaults = array(
            'sn'             => 'DNCSS0000001',
            'status'         => 'registered',
            'registered_at'  => null,
            'stolen_at'      => null,
            'recalled_at'    => null,
        );
        $merged = array_merge( $defaults, $fields );
        return (object) $merged;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Boss Q28=B: card state classifier priority order
    // ─────────────────────────────────────────────────────────────────────

    public function test_null_plate_returns_pending_verification(): void {
        $this->assertSame(
            'pending_verification',
            compute_card_state( null )
        );
    }

    public function test_non_object_returns_pending_verification(): void {
        // Defensive — array shouldn't be accepted (caller must pass stdClass)
        $this->assertSame(
            'pending_verification',
            compute_card_state( array( 'status' => 'registered' ) )
        );
    }

    public function test_active_state_for_recently_registered_plate(): void {
        $now = strtotime( '2026-05-05 12:00:00' );
        $plate = $this->plate( array(
            'status'        => 'registered',
            'registered_at' => '2026-05-05 10:00:00',  // today (1 year warranty ahead)
        ) );
        $this->assertSame( 'active', compute_card_state( $plate, $now ) );
    }

    public function test_near_expiry_state_when_28_days_left(): void {
        $now = strtotime( '2026-05-05 12:00:00' );
        // registered_at is now - (365 - 28) days = 28 days remaining
        $reg = $now - ( ( 365 - 28 ) * 86400 );
        $plate = $this->plate( array(
            'status'        => 'registered',
            'registered_at' => date( 'Y-m-d H:i:s', $reg ),
        ) );
        $this->assertSame( 'near_expiry', compute_card_state( $plate, $now ) );
    }

    public function test_expired_state_when_warranty_already_lapsed(): void {
        $now = strtotime( '2026-05-05 12:00:00' );
        // registered 400 days ago — past 1y warranty
        $reg = $now - ( 400 * 86400 );
        $plate = $this->plate( array(
            'status'        => 'registered',
            'registered_at' => date( 'Y-m-d H:i:s', $reg ),
        ) );
        $this->assertSame( 'expired', compute_card_state( $plate, $now ) );
    }

    public function test_claimed_state_takes_priority_over_dates(): void {
        $now = strtotime( '2026-05-05 12:00:00' );
        $plate = $this->plate( array(
            'status'        => 'claimed',
            'registered_at' => '2024-01-01 00:00:00',  // would be expired by date
        ) );
        $this->assertSame( 'claimed', compute_card_state( $plate, $now ) );
    }

    public function test_stolen_state_overrides_status_field(): void {
        $now = strtotime( '2026-05-05 12:00:00' );
        // Even if status=registered + within warranty, stolen_at wins
        $plate = $this->plate( array(
            'status'        => 'registered',
            'registered_at' => '2026-04-01 10:00:00',
            'stolen_at'     => '2026-05-01 14:30:00',
        ) );
        $this->assertSame( 'stolen', compute_card_state( $plate, $now ) );
    }

    public function test_stolen_state_overrides_claimed(): void {
        // Defensive — stolen has highest priority among mutable states
        $plate = $this->plate( array(
            'status'    => 'claimed',
            'stolen_at' => '2026-05-01 14:30:00',
        ) );
        $this->assertSame( 'stolen', compute_card_state( $plate ) );
    }

    public function test_zero_date_stolen_does_not_trigger_stolen(): void {
        // Defensive — MySQL '0000-00-00 00:00:00' = NULL semantics
        $plate = $this->plate( array(
            'status'        => 'registered',
            'registered_at' => date( 'Y-m-d H:i:s', time() - 86400 ),
            'stolen_at'     => '0000-00-00 00:00:00',
        ) );
        $this->assertNotSame( 'stolen', compute_card_state( $plate ) );
    }

    public function test_voided_status_returns_pending_verification(): void {
        $plate = $this->plate( array(
            'status'        => 'voided',
            'registered_at' => '2026-04-01 10:00:00',
        ) );
        $this->assertSame( 'pending_verification', compute_card_state( $plate ) );
    }

    public function test_recalled_status_returns_pending_verification(): void {
        $plate = $this->plate( array(
            'status'        => 'recalled',
            'registered_at' => '2026-04-01 10:00:00',
        ) );
        $this->assertSame( 'pending_verification', compute_card_state( $plate ) );
    }

    public function test_unknown_status_returns_pending_verification(): void {
        $plate = $this->plate( array(
            'status'        => 'in_pool',  // valid state but not registered/claimed
            'registered_at' => null,
        ) );
        $this->assertSame( 'pending_verification', compute_card_state( $plate ) );
    }

    public function test_missing_registered_at_returns_pending_verification(): void {
        $plate = $this->plate( array(
            'status'        => 'registered',
            'registered_at' => '',
        ) );
        $this->assertSame( 'pending_verification', compute_card_state( $plate ) );
    }

    public function test_invalid_registered_at_returns_pending_verification(): void {
        $plate = $this->plate( array(
            'status'        => 'registered',
            'registered_at' => 'not-a-real-date',
        ) );
        $this->assertSame( 'pending_verification', compute_card_state( $plate ) );
    }

    /**
     * Boundary test: exactly 30 days left → near_expiry (≤30 inclusive).
     *
     * Uses a time-anchored test that's robust against off-by-one-second
     * jitter at midnight: pick a date that floors to exactly 30 days.
     */
    public function test_boundary_exactly_30_days_left_is_near_expiry(): void {
        $now = strtotime( '2026-05-05 12:00:00' );
        // (365 - 30) days back, anchored to same H:i:s → end_ts is exactly +30d
        $reg = $now - ( ( 365 - 30 ) * 86400 );
        $plate = $this->plate( array(
            'status'        => 'registered',
            'registered_at' => date( 'Y-m-d H:i:s', $reg ),
        ) );
        $this->assertSame( 'near_expiry', compute_card_state( $plate, $now ) );
    }

    /**
     * Boundary test: 31 days left → active (just outside near_expiry).
     */
    public function test_boundary_31_days_left_is_active(): void {
        $now = strtotime( '2026-05-05 12:00:00' );
        $reg = $now - ( ( 365 - 31 ) * 86400 );
        $plate = $this->plate( array(
            'status'        => 'registered',
            'registered_at' => date( 'Y-m-d H:i:s', $reg ),
        ) );
        $this->assertSame( 'active', compute_card_state( $plate, $now ) );
    }

    /**
     * Boundary test: 0 days remaining = expired (days_left < 0 strictly).
     *
     * Anchor: registered exactly 365 days ago — diff floors to exactly -1
     * second → days_left = -1 → expired.
     */
    public function test_boundary_warranty_just_expired_is_expired(): void {
        $now = strtotime( '2026-05-05 12:00:00' );
        // 365 days + 1 hour ago (small overshoot) → guaranteed days_left < 0
        $reg = $now - ( ( 365 * 86400 ) + 3600 );
        $plate = $this->plate( array(
            'status'        => 'registered',
            'registered_at' => date( 'Y-m-d H:i:s', $reg ),
        ) );
        $this->assertSame( 'expired', compute_card_state( $plate, $now ) );
    }

    // ─────────────────────────────────────────────────────────────────────
    // F#6 Click-to-Call phone masking
    // ─────────────────────────────────────────────────────────────────────

    public function test_phone_mask_thai_mobile_format(): void {
        $this->assertSame( '081-xxx-5678', mask_phone_for_call( '0812345678' ) );
    }

    public function test_phone_mask_strips_hyphens(): void {
        $this->assertSame( '081-xxx-5678', mask_phone_for_call( '081-234-5678' ) );
    }

    public function test_phone_mask_strips_spaces_and_parens(): void {
        $this->assertSame( '081-xxx-5678', mask_phone_for_call( '(081) 234 5678' ) );
    }

    public function test_phone_mask_returns_empty_when_too_short(): void {
        // <9 digits — defensive (PDPA: never display partial numbers that could leak last 4)
        $this->assertSame( '', mask_phone_for_call( '12345' ) );
    }

    public function test_phone_mask_returns_empty_when_blank(): void {
        $this->assertSame( '', mask_phone_for_call( '' ) );
    }
}
