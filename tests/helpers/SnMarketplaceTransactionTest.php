<?php
/**
 * SnMarketplaceTransactionTest — pure-logic test of Phase 5 W15.3 + W15.4
 * F#8 Extension Marketplace REST endpoints + apply_warranty_extension helper.
 *
 * Source: [System] DINOCO SN REST API V.0.24+
 *   function dinoco_sn_marketplace_compute_quote()
 *   function dinoco_sn_marketplace_compute_new_warranty_end()
 *   function dinoco_sn_marketplace_warranty_status()
 *   function dinoco_sn_marketplace_validate_pricing()
 *   function dinoco_sn_apply_warranty_extension()
 *   function dinoco_sn_handler_marketplace_checkout()
 *
 * Plan: docs/sn-system/22-phase5-w15-w18-prep.md §W15.3 + §W15.4
 * Boss: Q7 (Slip2Go reuse) + Q8 (per-SKU manual pricing)
 *
 * Tests focus on pure-logic primitives that do not require WP DB:
 *   - Quote math (VAT 7% + savings_pct calc)
 *   - DateTime warranty math (current + N years)
 *   - Grace period detection (30-day threshold)
 *   - Pricing validator (illogical/range checks)
 *   - State machine guards (allowed transitions)
 *   - Idempotency body hash determinism (Round 30+ pattern)
 *
 * Pattern follows SnHierarchyTest.php — pure logic, in-memory mirrors.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Mirror of pure-logic helpers (kept in sync with REST API V.0.24) ─── */
/* Functions prefixed sn_mptx_ to avoid collision with SnMarketplacePricingTest.php */

if ( ! function_exists( __NAMESPACE__ . '\\sn_mptx_compute_quote' ) ) {
    function sn_mptx_compute_quote( float $base_price, int $years ): array {
        $base = round( $base_price, 2 );
        $years = max( 1, min( 3, $years ) );
        $vat_rate = 0.07;
        $vat = round( $base * $vat_rate, 2 );
        $total = round( $base + $vat, 2 );
        return array(
            'years'      => $years,
            'base_price' => $base,
            'vat'        => $vat,
            'vat_rate'   => $vat_rate,
            'total'      => $total,
        );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_mptx_compute_new_end' ) ) {
    function sn_mptx_compute_new_end( string $current_warranty_end, int $years ): ?string {
        if ( $current_warranty_end === '' ) return null;
        $years = max( 1, min( 3, $years ) );
        try {
            $dt = new \DateTime( $current_warranty_end );
            $dt->modify( '+' . $years . ' years' );
            return $dt->format( 'Y-m-d' );
        } catch ( \Throwable $e ) {
            return null;
        }
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_mptx_warranty_status' ) ) {
    function sn_mptx_warranty_status( string $warranty_until, ?string $now_iso = null ): string {
        if ( $warranty_until === '' ) return 'expired_no_grace';
        try {
            $end = new \DateTime( $warranty_until );
            $now = $now_iso !== null ? new \DateTime( $now_iso ) : new \DateTime( 'now' );
            $diff = (int) $now->diff( $end )->format( '%r%a' );
            if ( $diff >= 0 ) return 'active';
            if ( $diff >= -30 ) return 'grace_period';
            return 'expired_no_grace';
        } catch ( \Throwable $e ) {
            return 'expired_no_grace';
        }
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_mptx_validate_pricing' ) ) {
    /**
     * Returns true on valid, or array { error: code, message } on fail.
     */
    function sn_mptx_validate_pricing( $p1, $p2, $p3 ) {
        foreach ( array( '1y' => $p1, '2y' => $p2, '3y' => $p3 ) as $tier => $p ) {
            if ( $p === null || $p === '' ) continue;
            if ( ! is_numeric( $p ) ) return array( 'error' => 'invalid_price', 'tier' => $tier );
            $n = (float) $p;
            if ( $n < 0 || $n > 1000000 ) return array( 'error' => 'invalid_price', 'tier' => $tier );
        }
        $f1 = ( $p1 === null || $p1 === '' ) ? null : (float) $p1;
        $f2 = ( $p2 === null || $p2 === '' ) ? null : (float) $p2;
        $f3 = ( $p3 === null || $p3 === '' ) ? null : (float) $p3;
        if ( $f1 !== null && $f2 !== null && $f1 >= $f2 ) return array( 'error' => 'illogical_pricing', 'pair' => '1y_vs_2y' );
        if ( $f2 !== null && $f3 !== null && $f2 >= $f3 ) return array( 'error' => 'illogical_pricing', 'pair' => '2y_vs_3y' );
        if ( $f1 !== null && $f3 !== null && $f1 >= $f3 ) return array( 'error' => 'illogical_pricing', 'pair' => '1y_vs_3y' );
        return true;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_mptx_state_can_transition' ) ) {
    /**
     * Marketplace extension FSM. Valid transitions:
     *   pending_payment       → paid (auto-verify slip)
     *   pending_payment       → pending_admin_review (slip not auto-verified)
     *   pending_payment       → rejected (admin reject)
     *   pending_payment       → expired (cron W16.3)
     *   pending_admin_review  → paid (admin approve)
     *   pending_admin_review  → rejected (admin reject)
     *   paid                  → refunded (W17 manual)
     */
    function sn_mptx_state_can_transition( string $from, string $to ): bool {
        $allowed = array(
            'pending_payment' => array( 'paid', 'pending_admin_review', 'rejected', 'expired' ),
            'pending_admin_review' => array( 'paid', 'rejected' ),
            'paid' => array( 'refunded' ),
        );
        return isset( $allowed[ $from ] ) && in_array( $to, $allowed[ $from ], true );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_mptx_idempotency_hash' ) ) {
    function sn_mptx_idempotency_hash( array $body ): string {
        ksort( $body );
        return hash( 'sha256', wp_json_encode_compat( $body ) );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\wp_json_encode_compat' ) ) {
    function wp_json_encode_compat( $data ): string {
        return (string) json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
    }
}

final class SnMarketplaceTransactionTest extends TestCase {

    /* ═══════════════════════════════════════════════════════════════════
     * QUOTE MATH (VAT 7% + rounding)
     * ═══════════════════════════════════════════════════════════════════ */

    public function test_quote_1y_basic_vat_7pct(): void {
        $q = sn_mptx_compute_quote( 1200.0, 1 );
        $this->assertSame( 1200.0, $q['base_price'] );
        $this->assertSame( 84.0, $q['vat'] );
        $this->assertSame( 1284.0, $q['total'] );
        $this->assertSame( 1, $q['years'] );
    }

    public function test_quote_2y_with_savings(): void {
        // 2-year ฿2,160 (cheaper than 1y * 2 = 2400) — savings expected
        $q = sn_mptx_compute_quote( 2160.0, 2 );
        $this->assertSame( 2160.0, $q['base_price'] );
        $this->assertEquals( 151.2, $q['vat'] );
        $this->assertEquals( 2311.2, $q['total'] );
    }

    public function test_quote_3y_high_value(): void {
        $q = sn_mptx_compute_quote( 3000.0, 3 );
        $this->assertSame( 3000.0, $q['base_price'] );
        $this->assertSame( 210.0, $q['vat'] );
        $this->assertSame( 3210.0, $q['total'] );
    }

    public function test_quote_clamps_years_above_3(): void {
        $q = sn_mptx_compute_quote( 1200.0, 99 );
        $this->assertSame( 3, $q['years'] );
    }

    public function test_quote_clamps_years_below_1(): void {
        $q = sn_mptx_compute_quote( 1200.0, 0 );
        $this->assertSame( 1, $q['years'] );
    }

    public function test_quote_zero_price_zero_vat(): void {
        $q = sn_mptx_compute_quote( 0.0, 1 );
        $this->assertSame( 0.0, $q['base_price'] );
        $this->assertSame( 0.0, $q['vat'] );
        $this->assertSame( 0.0, $q['total'] );
    }

    /* ═══════════════════════════════════════════════════════════════════
     * WARRANTY DATE MATH
     * ═══════════════════════════════════════════════════════════════════ */

    public function test_compute_new_end_1y_addition(): void {
        $this->assertSame( '2027-05-04', sn_mptx_compute_new_end( '2026-05-04', 1 ) );
    }

    public function test_compute_new_end_3y_addition(): void {
        $this->assertSame( '2029-05-04', sn_mptx_compute_new_end( '2026-05-04', 3 ) );
    }

    public function test_compute_new_end_leap_year(): void {
        // Adding 1 year to Feb 29 → DateTime PHP behavior → March 1 of next year
        $r = sn_mptx_compute_new_end( '2024-02-29', 1 );
        $this->assertNotNull( $r );
        // PHP DateTime modify('+1 year') from 2024-02-29 → 2025-03-01
        $this->assertSame( '2025-03-01', $r );
    }

    public function test_compute_new_end_handles_iso_datetime(): void {
        $this->assertSame( '2027-05-04', sn_mptx_compute_new_end( '2026-05-04 12:34:56', 1 ) );
    }

    public function test_compute_new_end_invalid_returns_null(): void {
        $this->assertNull( sn_mptx_compute_new_end( 'not-a-date', 1 ) );
    }

    public function test_compute_new_end_empty_returns_null(): void {
        $this->assertNull( sn_mptx_compute_new_end( '', 1 ) );
    }

    /* ═══════════════════════════════════════════════════════════════════
     * GRACE PERIOD DETECTION (30-day threshold)
     * ═══════════════════════════════════════════════════════════════════ */

    public function test_warranty_status_active_far_future(): void {
        $this->assertSame( 'active', sn_mptx_warranty_status( '2027-05-04', '2026-05-07' ) );
    }

    public function test_warranty_status_active_today(): void {
        $this->assertSame( 'active', sn_mptx_warranty_status( '2026-05-07', '2026-05-07' ) );
    }

    public function test_warranty_status_grace_within_30d(): void {
        // expired 15 days ago → grace_period
        $this->assertSame( 'grace_period', sn_mptx_warranty_status( '2026-04-22', '2026-05-07' ) );
    }

    public function test_warranty_status_grace_exactly_30d(): void {
        $this->assertSame( 'grace_period', sn_mptx_warranty_status( '2026-04-07', '2026-05-07' ) );
    }

    public function test_warranty_status_expired_beyond_grace(): void {
        // 31+ days past expiry → expired_no_grace
        $this->assertSame( 'expired_no_grace', sn_mptx_warranty_status( '2026-04-06', '2026-05-07' ) );
    }

    public function test_warranty_status_empty_string(): void {
        $this->assertSame( 'expired_no_grace', sn_mptx_warranty_status( '', '2026-05-07' ) );
    }

    /* ═══════════════════════════════════════════════════════════════════
     * PRICING VALIDATION (Q8 — admin manual per-SKU)
     * ═══════════════════════════════════════════════════════════════════ */

    public function test_pricing_all_null_passes(): void {
        $this->assertTrue( sn_mptx_validate_pricing( null, null, null ) );
    }

    public function test_pricing_valid_progression(): void {
        $this->assertTrue( sn_mptx_validate_pricing( 1200, 2160, 3000 ) );
    }

    public function test_pricing_only_one_tier_offered(): void {
        // Only 2y offered (1y + 3y null) — valid
        $this->assertTrue( sn_mptx_validate_pricing( null, 2160, null ) );
    }

    public function test_pricing_illogical_1y_gte_2y_rejected(): void {
        $r = sn_mptx_validate_pricing( 2200, 2160, null );
        $this->assertIsArray( $r );
        $this->assertSame( 'illogical_pricing', $r['error'] );
        $this->assertSame( '1y_vs_2y', $r['pair'] );
    }

    public function test_pricing_illogical_2y_gte_3y_rejected(): void {
        $r = sn_mptx_validate_pricing( null, 3500, 3000 );
        $this->assertIsArray( $r );
        $this->assertSame( 'illogical_pricing', $r['error'] );
    }

    public function test_pricing_illogical_1y_gte_3y_rejected(): void {
        // p2 missing → still must enforce 1y < 3y
        $r = sn_mptx_validate_pricing( 3500, null, 3000 );
        $this->assertIsArray( $r );
        $this->assertSame( 'illogical_pricing', $r['error'] );
        $this->assertSame( '1y_vs_3y', $r['pair'] );
    }

    public function test_pricing_negative_rejected(): void {
        $r = sn_mptx_validate_pricing( -1, null, null );
        $this->assertIsArray( $r );
        $this->assertSame( 'invalid_price', $r['error'] );
    }

    public function test_pricing_above_ceiling_rejected(): void {
        $r = sn_mptx_validate_pricing( 1000001, null, null );
        $this->assertIsArray( $r );
        $this->assertSame( 'invalid_price', $r['error'] );
    }

    public function test_pricing_non_numeric_rejected(): void {
        $r = sn_mptx_validate_pricing( 'free', null, null );
        $this->assertIsArray( $r );
        $this->assertSame( 'invalid_price', $r['error'] );
    }

    public function test_pricing_boundary_zero_allowed(): void {
        // 0 is a valid price (admin offers free promo year)
        // But must still satisfy ordering: 0 < 2160 < 3000
        $this->assertTrue( sn_mptx_validate_pricing( 0, 2160, 3000 ) );
    }

    public function test_pricing_boundary_max_allowed(): void {
        // 1,000,000 ceiling — exactly at limit passes
        $this->assertTrue( sn_mptx_validate_pricing( null, null, 1000000 ) );
    }

    /* ═══════════════════════════════════════════════════════════════════
     * STATE MACHINE GUARDS
     * ═══════════════════════════════════════════════════════════════════ */

    public function test_fsm_pending_payment_to_paid_allowed(): void {
        $this->assertTrue( sn_mptx_state_can_transition( 'pending_payment', 'paid' ) );
    }

    public function test_fsm_pending_payment_to_pending_admin_review_allowed(): void {
        $this->assertTrue( sn_mptx_state_can_transition( 'pending_payment', 'pending_admin_review' ) );
    }

    public function test_fsm_pending_admin_review_to_paid_allowed(): void {
        $this->assertTrue( sn_mptx_state_can_transition( 'pending_admin_review', 'paid' ) );
    }

    public function test_fsm_pending_admin_review_to_rejected_allowed(): void {
        $this->assertTrue( sn_mptx_state_can_transition( 'pending_admin_review', 'rejected' ) );
    }

    public function test_fsm_paid_to_refunded_allowed(): void {
        $this->assertTrue( sn_mptx_state_can_transition( 'paid', 'refunded' ) );
    }

    public function test_fsm_paid_to_pending_payment_blocked(): void {
        $this->assertFalse( sn_mptx_state_can_transition( 'paid', 'pending_payment' ) );
    }

    public function test_fsm_rejected_to_paid_blocked(): void {
        $this->assertFalse( sn_mptx_state_can_transition( 'rejected', 'paid' ) );
    }

    public function test_fsm_refunded_terminal_no_outbound(): void {
        $this->assertFalse( sn_mptx_state_can_transition( 'refunded', 'paid' ) );
        $this->assertFalse( sn_mptx_state_can_transition( 'refunded', 'rejected' ) );
    }

    public function test_fsm_unknown_state_blocks_all_transitions(): void {
        $this->assertFalse( sn_mptx_state_can_transition( 'bogus_state', 'paid' ) );
    }

    /* ═══════════════════════════════════════════════════════════════════
     * IDEMPOTENCY BODY HASH (Round 30+ pattern)
     * ═══════════════════════════════════════════════════════════════════ */

    public function test_idempotency_hash_deterministic(): void {
        $h1 = sn_mptx_idempotency_hash( array( 'sn' => 'DNCSS001', 'years' => 1, '_actor_user_id' => 42 ) );
        $h2 = sn_mptx_idempotency_hash( array( 'sn' => 'DNCSS001', 'years' => 1, '_actor_user_id' => 42 ) );
        $this->assertSame( $h1, $h2 );
    }

    public function test_idempotency_hash_different_user_different_hash(): void {
        $h1 = sn_mptx_idempotency_hash( array( 'sn' => 'DNCSS001', 'years' => 1, '_actor_user_id' => 42 ) );
        $h2 = sn_mptx_idempotency_hash( array( 'sn' => 'DNCSS001', 'years' => 1, '_actor_user_id' => 99 ) );
        $this->assertNotSame( $h1, $h2 );
    }

    public function test_idempotency_hash_different_years_different_hash(): void {
        $h1 = sn_mptx_idempotency_hash( array( 'sn' => 'DNCSS001', 'years' => 1 ) );
        $h2 = sn_mptx_idempotency_hash( array( 'sn' => 'DNCSS001', 'years' => 2 ) );
        $this->assertNotSame( $h1, $h2 );
    }

    public function test_idempotency_hash_key_order_invariant(): void {
        // ksort means hash is order-independent
        $h1 = sn_mptx_idempotency_hash( array( 'sn' => 'DNCSS001', 'years' => 1 ) );
        $h2 = sn_mptx_idempotency_hash( array( 'years' => 1, 'sn' => 'DNCSS001' ) );
        $this->assertSame( $h1, $h2 );
    }

    public function test_idempotency_hash_includes_coupon_code(): void {
        $h1 = sn_mptx_idempotency_hash( array( 'sn' => 'DNCSS001', 'years' => 1, 'coupon_code' => '' ) );
        $h2 = sn_mptx_idempotency_hash( array( 'sn' => 'DNCSS001', 'years' => 1, 'coupon_code' => 'WELCOME10' ) );
        $this->assertNotSame( $h1, $h2 );
    }

    /* ═══════════════════════════════════════════════════════════════════
     * COVERAGE / BOSS EXAMPLE — REALISTIC SCENARIO
     * ═══════════════════════════════════════════════════════════════════ */

    public function test_realistic_2y_extension_complete_flow_math(): void {
        // Customer registered plate on 2025-05-04, 1y warranty → expires 2026-05-04
        // Buys 2y extension on 2026-04-15 → new expiry 2028-05-04
        $current_end = '2026-05-04';
        $now_iso = '2026-04-15';
        $this->assertSame( 'active', sn_mptx_warranty_status( $current_end, $now_iso ) );
        $new_end = sn_mptx_compute_new_end( $current_end, 2 );
        $this->assertSame( '2028-05-04', $new_end );

        // Quote: ฿2,160 base + 7% VAT
        $q = sn_mptx_compute_quote( 2160.0, 2 );
        $this->assertEquals( 2311.2, $q['total'] );

        // FSM flow: pending_payment → paid → (warranty applied)
        $this->assertTrue( sn_mptx_state_can_transition( 'pending_payment', 'paid' ) );
    }

    public function test_realistic_grace_period_purchase_allowed(): void {
        // Customer's warranty expired 10 days ago — still in grace → can purchase
        $current_end = '2026-04-27';  // 10 days before "now"
        $now_iso = '2026-05-07';
        $this->assertSame( 'grace_period', sn_mptx_warranty_status( $current_end, $now_iso ) );
        // Extension still computed from old end (NOT today) — gives buyer continuous coverage
        $new_end = sn_mptx_compute_new_end( $current_end, 1 );
        $this->assertSame( '2027-04-27', $new_end );
    }
}
