<?php
/**
 * Phase 5 W17.2 + W17.4 — Q20 Manual Refund Flow pure-logic tests
 *
 * Tests pure-logic primitives behind dinoco_sn_apply_refund() +
 * dinoco_sn_handler_marketplace_refund() that don't require WP DB:
 *
 *   - Refund eligibility (paid only; refunded/pending/expired blocked)
 *   - refund_amount validation (≤ price_paid; > 0)
 *   - 4-eyes threshold logic (≥ ฿5,000 requires approver)
 *   - Self-approval blocked (actor === approver)
 *   - confirm_text strict match
 *   - warranty_until revert calc (use warranty_until_old if available;
 *     fallback to subtract years from current)
 *   - Idempotency body hash determinism (Round 30+ pattern)
 *
 * Source: [System] DINOCO SN REST API V.0.25
 *   function dinoco_sn_apply_refund()
 *   function dinoco_sn_handler_marketplace_refund()
 *   function dinoco_sn_rest_marketplace_refund()
 *
 * Plan: docs/sn-system/22-phase5-w15-w18-prep.md §W17.2 + §W17.4
 * Boss: Q20 R2 (manual refund flow + 4-eyes ≥฿5K threshold)
 *
 * Pattern follows SnMarketplaceTransactionTest — pure logic, in-memory mirrors.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\SnMarketplaceRefund;

use PHPUnit\Framework\TestCase;

/* ─── Pure-logic mirrors (kept in sync with REST API V.0.25) ─── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_refund_is_eligible' ) ) {
    /**
     * Mirrors `dinoco_sn_handler_marketplace_refund` state-machine guard.
     * Only payment_status='paid' rows are eligible for refund.
     */
    function sn_refund_is_eligible( string $payment_status ): bool {
        return $payment_status === 'paid';
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_refund_amount_valid' ) ) {
    /**
     * Validates refund_amount is in (0, price_paid] (with float tolerance).
     */
    function sn_refund_amount_valid( float $refund_amount, float $price_paid ): bool {
        if ( $refund_amount <= 0 ) return false;
        if ( $refund_amount > $price_paid + 0.001 ) return false;
        return true;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_refund_requires_four_eyes' ) ) {
    /**
     * 4-eyes threshold: refund_amount >= 5000 THB.
     */
    function sn_refund_requires_four_eyes( float $refund_amount ): bool {
        return $refund_amount >= 5000.0;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_refund_validate_approver' ) ) {
    /**
     * Returns null on valid approver, error code string on rejection.
     * Mirrors handler logic ordering: required → self-block → cap-check.
     *
     * @param float $refund_amount
     * @param int   $actor_user_id
     * @param int   $approver_user_id
     * @param bool  $approver_has_admin_cap
     */
    function sn_refund_validate_approver(
        float $refund_amount,
        int $actor_user_id,
        int $approver_user_id,
        bool $approver_has_admin_cap
    ): ?string {
        if ( ! sn_refund_requires_four_eyes( $refund_amount ) ) {
            return null; // < 5K — no approver needed
        }
        if ( $approver_user_id <= 0 ) return 'approver_required';
        if ( $approver_user_id === $actor_user_id ) return 'self_approval_blocked';
        if ( ! $approver_has_admin_cap ) return 'approver_not_admin';
        return null;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_refund_confirm_text_valid' ) ) {
    /**
     * Strict match: must equal 'REFUND CONFIRM' (after trim).
     */
    function sn_refund_confirm_text_valid( string $confirm_text ): bool {
        return trim( $confirm_text ) === 'REFUND CONFIRM';
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_refund_compute_revert_date' ) ) {
    /**
     * Mirrors warranty_until revert calc in dinoco_sn_apply_refund.
     *
     * Strategy:
     *   1. If warranty_until_old is non-empty + non-zero-date → use directly
     *   2. Fallback: subtract years (months/12 rounded) from current_warranty_end
     *
     * @param string $warranty_until_old   ext.warranty_until_old (may be '' or '0000-00-00')
     * @param string $current_warranty_end CPT meta warranty_until (current value)
     * @param int    $extension_months     ext.extension_months
     * @return string|null Reverted Y-m-d date or null on compute failure
     */
    function sn_refund_compute_revert_date(
        string $warranty_until_old,
        string $current_warranty_end,
        int $extension_months
    ): ?string {
        if ( $warranty_until_old !== ''
             && $warranty_until_old !== '0000-00-00'
             && strpos( $warranty_until_old, '0000-00-00' ) !== 0 ) {
            return $warranty_until_old;
        }
        // Defensive fallback for legacy pre-W15.4 rows
        if ( $current_warranty_end === '' ) return null;
        $years = max( 1, (int) round( $extension_months / 12 ) );
        try {
            $dt = new \DateTime( $current_warranty_end );
            $dt->modify( '-' . $years . ' years' );
            return $dt->format( 'Y-m-d' );
        } catch ( \Throwable $e ) {
            return null;
        }
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_refund_idempotency_body_hash' ) ) {
    /**
     * Mirrors body-hash composition for idempotency wrapper.
     * Round 30+ pattern: actor_user_id auto-included by wrapper; this fn
     * returns the deterministic SHA256 of normalized body fields only.
     */
    function sn_refund_idempotency_body_hash( array $body, array $fields ): string {
        $normalized = array();
        foreach ( $fields as $f ) {
            $v = $body[ $f ] ?? null;
            if ( is_string( $v ) ) $v = trim( $v );
            if ( is_float( $v ) ) $v = round( $v, 2 );
            $normalized[ $f ] = $v;
        }
        ksort( $normalized );
        return hash( 'sha256', wp_json_encode_fallback( $normalized ) );
    }
}
if ( ! function_exists( __NAMESPACE__ . '\\wp_json_encode_fallback' ) ) {
    function wp_json_encode_fallback( $data ): string {
        return (string) json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
    }
}

/* ─── Test class ─────────────────────────────────────────────────── */

final class SnMarketplaceRefundTest extends TestCase
{
    /* ── Eligibility (state machine) ── */

    public function test_eligibility_paid_returns_true(): void
    {
        $this->assertTrue( sn_refund_is_eligible( 'paid' ) );
    }

    public function test_eligibility_refunded_blocked(): void
    {
        $this->assertFalse( sn_refund_is_eligible( 'refunded' ) );
    }

    public function test_eligibility_pending_payment_blocked(): void
    {
        $this->assertFalse( sn_refund_is_eligible( 'pending_payment' ) );
    }

    public function test_eligibility_pending_admin_review_blocked(): void
    {
        $this->assertFalse( sn_refund_is_eligible( 'pending_admin_review' ) );
    }

    public function test_eligibility_rejected_blocked(): void
    {
        $this->assertFalse( sn_refund_is_eligible( 'rejected' ) );
    }

    public function test_eligibility_expired_blocked(): void
    {
        $this->assertFalse( sn_refund_is_eligible( 'expired' ) );
    }

    /* ── refund_amount validation ── */

    public function test_amount_zero_invalid(): void
    {
        $this->assertFalse( sn_refund_amount_valid( 0.0, 1000.0 ) );
    }

    public function test_amount_negative_invalid(): void
    {
        $this->assertFalse( sn_refund_amount_valid( -1.0, 1000.0 ) );
    }

    public function test_amount_full_refund_valid(): void
    {
        $this->assertTrue( sn_refund_amount_valid( 1000.0, 1000.0 ) );
    }

    public function test_amount_partial_refund_valid(): void
    {
        $this->assertTrue( sn_refund_amount_valid( 500.0, 1000.0 ) );
    }

    public function test_amount_exceeds_price_paid_invalid(): void
    {
        $this->assertFalse( sn_refund_amount_valid( 1500.0, 1000.0 ) );
    }

    public function test_amount_float_tolerance(): void
    {
        // Allow tiny floating-point creep at boundary
        $this->assertTrue( sn_refund_amount_valid( 1000.0005, 1000.0 ) );
    }

    /* ── 4-eyes threshold logic ── */

    public function test_four_eyes_below_threshold_not_required(): void
    {
        $this->assertFalse( sn_refund_requires_four_eyes( 4999.99 ) );
    }

    public function test_four_eyes_at_threshold_required(): void
    {
        $this->assertTrue( sn_refund_requires_four_eyes( 5000.0 ) );
    }

    public function test_four_eyes_above_threshold_required(): void
    {
        $this->assertTrue( sn_refund_requires_four_eyes( 8000.0 ) );
    }

    /* ── Approver validation (4-eyes integrity) ── */

    public function test_approver_below_threshold_no_approver_ok(): void
    {
        // < 5K, no approver → null (valid)
        $this->assertNull( sn_refund_validate_approver( 1000.0, 100, 0, false ) );
    }

    public function test_approver_required_when_threshold_met(): void
    {
        $err = sn_refund_validate_approver( 5000.0, 100, 0, false );
        $this->assertSame( 'approver_required', $err );
    }

    public function test_self_approval_blocked(): void
    {
        // actor === approver → blocked
        $err = sn_refund_validate_approver( 8000.0, 42, 42, true );
        $this->assertSame( 'self_approval_blocked', $err );
    }

    public function test_approver_without_admin_cap_blocked(): void
    {
        $err = sn_refund_validate_approver( 5000.0, 100, 200, false );
        $this->assertSame( 'approver_not_admin', $err );
    }

    public function test_approver_valid_path(): void
    {
        $err = sn_refund_validate_approver( 5000.0, 100, 200, true );
        $this->assertNull( $err );
    }

    /* ── confirm_text strict match ── */

    public function test_confirm_text_exact_match_valid(): void
    {
        $this->assertTrue( sn_refund_confirm_text_valid( 'REFUND CONFIRM' ) );
    }

    public function test_confirm_text_with_whitespace_valid(): void
    {
        $this->assertTrue( sn_refund_confirm_text_valid( '  REFUND CONFIRM  ' ) );
    }

    public function test_confirm_text_lowercase_invalid(): void
    {
        $this->assertFalse( sn_refund_confirm_text_valid( 'refund confirm' ) );
    }

    public function test_confirm_text_partial_invalid(): void
    {
        $this->assertFalse( sn_refund_confirm_text_valid( 'REFUND' ) );
    }

    public function test_confirm_text_empty_invalid(): void
    {
        $this->assertFalse( sn_refund_confirm_text_valid( '' ) );
    }

    /* ── warranty_until revert calculation ── */

    public function test_revert_uses_warranty_until_old_when_present(): void
    {
        $reverted = sn_refund_compute_revert_date( '2027-01-15', '2030-01-15', 36 );
        $this->assertSame( '2027-01-15', $reverted );
    }

    public function test_revert_falls_back_when_old_empty(): void
    {
        // Legacy row pre-W15.4 — warranty_until_old missing → subtract 1y from current
        $reverted = sn_refund_compute_revert_date( '', '2027-01-15', 12 );
        $this->assertSame( '2026-01-15', $reverted );
    }

    public function test_revert_falls_back_when_old_zero_date(): void
    {
        $reverted = sn_refund_compute_revert_date( '0000-00-00', '2027-01-15', 12 );
        $this->assertSame( '2026-01-15', $reverted );
    }

    public function test_revert_2_year_extension_fallback(): void
    {
        $reverted = sn_refund_compute_revert_date( '', '2028-06-30', 24 );
        $this->assertSame( '2026-06-30', $reverted );
    }

    public function test_revert_invalid_current_returns_null(): void
    {
        $reverted = sn_refund_compute_revert_date( '', '', 12 );
        $this->assertNull( $reverted );
    }

    /* ── Idempotency body hash determinism ── */

    public function test_idempotency_hash_deterministic(): void
    {
        $body = array(
            'id'            => 42,
            'refund_amount' => 1000.50,
            'reason'        => 'Customer requested refund',
        );
        $h1 = sn_refund_idempotency_body_hash( $body, array( 'id', 'refund_amount', 'reason' ) );
        $h2 = sn_refund_idempotency_body_hash( $body, array( 'id', 'refund_amount', 'reason' ) );
        $this->assertSame( $h1, $h2 );
        $this->assertSame( 64, strlen( $h1 ) ); // sha256 hex
    }

    public function test_idempotency_hash_differs_on_amount_change(): void
    {
        $body_a = array( 'id' => 42, 'refund_amount' => 1000.0, 'reason' => 'A' );
        $body_b = array( 'id' => 42, 'refund_amount' => 1500.0, 'reason' => 'A' );
        $h_a = sn_refund_idempotency_body_hash( $body_a, array( 'id', 'refund_amount', 'reason' ) );
        $h_b = sn_refund_idempotency_body_hash( $body_b, array( 'id', 'refund_amount', 'reason' ) );
        $this->assertNotSame( $h_a, $h_b );
    }

    public function test_idempotency_hash_differs_on_reason_change(): void
    {
        $body_a = array( 'id' => 42, 'refund_amount' => 1000.0, 'reason' => 'A' );
        $body_b = array( 'id' => 42, 'refund_amount' => 1000.0, 'reason' => 'B' );
        $h_a = sn_refund_idempotency_body_hash( $body_a, array( 'id', 'refund_amount', 'reason' ) );
        $h_b = sn_refund_idempotency_body_hash( $body_b, array( 'id', 'refund_amount', 'reason' ) );
        $this->assertNotSame( $h_a, $h_b );
    }

    public function test_idempotency_hash_normalizes_whitespace(): void
    {
        $body_a = array( 'id' => 42, 'refund_amount' => 1000.0, 'reason' => 'Refund' );
        $body_b = array( 'id' => 42, 'refund_amount' => 1000.0, 'reason' => '  Refund  ' );
        $h_a = sn_refund_idempotency_body_hash( $body_a, array( 'id', 'refund_amount', 'reason' ) );
        $h_b = sn_refund_idempotency_body_hash( $body_b, array( 'id', 'refund_amount', 'reason' ) );
        $this->assertSame( $h_a, $h_b );
    }

    /* ── End-to-end validation chain (integration of guards) ── */

    public function test_e2e_valid_small_refund_passes_all_gates(): void
    {
        // ฿1,000 refund (< 5K), no approver needed
        $this->assertTrue( sn_refund_is_eligible( 'paid' ) );
        $this->assertTrue( sn_refund_amount_valid( 1000.0, 5000.0 ) );
        $this->assertNull( sn_refund_validate_approver( 1000.0, 100, 0, false ) );
        $this->assertTrue( sn_refund_confirm_text_valid( 'REFUND CONFIRM' ) );
    }

    public function test_e2e_valid_large_refund_with_approver_passes(): void
    {
        // ฿8,000 refund (≥ 5K), approver=200 (different admin, has cap)
        $this->assertTrue( sn_refund_is_eligible( 'paid' ) );
        $this->assertTrue( sn_refund_amount_valid( 8000.0, 10000.0 ) );
        $this->assertNull( sn_refund_validate_approver( 8000.0, 100, 200, true ) );
        $this->assertTrue( sn_refund_confirm_text_valid( 'REFUND CONFIRM' ) );
    }

    public function test_e2e_self_approval_attempt_blocked(): void
    {
        // ฿8K refund + admin tries to self-approve → blocked
        $err = sn_refund_validate_approver( 8000.0, 100, 100, true );
        $this->assertSame( 'self_approval_blocked', $err );
    }
}
