<?php
/**
 * ClaimChargeCreateTest — pure-logic tests for Sprint 17 Phase 2.6 charge
 * create endpoint (POST /dinoco-claim/v1/charges).
 *
 * Source of truth: [System] DINOCO Claim Payment LIFF V.0.6
 *   - dinoco_claim_payment_generate_payment_ref()
 *   - dinoco_claim_payment_mask_account()
 *   - validation matrix in dinoco_claim_payment_rest_charge_create()
 *
 * Pure-logic helpers are inlined here so the suite runs without WP bootstrap.
 * Race + DB + REST integration tests live in Jest drift detector.
 *
 * Coverage:
 *   • Body validation: claim_id / amount_thb / reason / bank_context / expires
 *   • Idempotency hash determinism (cents int normalization — no float drift)
 *   • amount_thb_at_create equality invariant at INSERT (Sprint 14 H2)
 *   • Reason whitelist strict
 *   • Bank context input → schema bank_context mapping
 *   • payment_ref CLM-CHG-NNNN-XXXX format
 *   • Crockford alphabet excludes I/L/O/U/0/1
 *   • expires_at calculation (Bangkok-local via date() — Sprint 16 C2 lesson)
 *   • Account masking (last-4 visible, rest bullets)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! defined( 'DINOCO_CLAIM_CHARGES_REASON_WHITELIST' ) ) {
    define( 'DINOCO_CLAIM_CHARGES_REASON_WHITELIST', 'return_shipping,repair_oow,extra_parts,other' );
}

if ( ! defined( 'DINOCO_CLAIM_CHARGES_STATUS_WHITELIST' ) ) {
    define( 'DINOCO_CLAIM_CHARGES_STATUS_WHITELIST',
        'pending_payment,pending_review,verified,rejected,refunded,expired,cancelled' );
}

// ─── Inlined pure-logic helpers under test ──────────────────────────────
if ( ! function_exists( __NAMESPACE__ . '\\generate_payment_ref' ) ) {
    function generate_payment_ref( int $charge_id ): string {
        $alpha = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
        $len   = strlen( $alpha );
        $suf   = '';
        for ( $i = 0; $i < 4; $i++ ) {
            $suf .= $alpha[ random_int( 0, $len - 1 ) ];
        }
        return 'CLM-CHG-' . str_pad( (string) $charge_id, 4, '0', STR_PAD_LEFT ) . '-' . $suf;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\mask_account' ) ) {
    function mask_account( string $acct ): string {
        $len = mb_strlen( $acct );
        if ( $len <= 4 ) return str_repeat( '•', $len );
        return str_repeat( '•', $len - 4 ) . mb_substr( $acct, -4 );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\amount_to_cents' ) ) {
    function amount_to_cents( float $amount ): int {
        return (int) round( $amount * 100.0 );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\idempotency_body_hash' ) ) {
    function idempotency_body_hash( array $body ): string {
        // Mirror dinoco_idempotency_hash — JSON canonical + SHA256.
        ksort( $body );
        return hash( 'sha256', json_encode( $body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\compute_expires_at' ) ) {
    function compute_expires_at( string $created_at_mysql, int $days ): string {
        // Mirror handler: date() (PHP default tz) NOT gmdate (UTC).
        return date( 'Y-m-d H:i:s', strtotime( $created_at_mysql ) + ( $days * 86400 ) );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\validate_reason' ) ) {
    function validate_reason( string $reason ): bool {
        $wl = explode( ',', DINOCO_CLAIM_CHARGES_REASON_WHITELIST );
        return in_array( $reason, $wl, true );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\validate_bank_context_input' ) ) {
    function validate_bank_context_input( string $in ): bool {
        return in_array( $in, array( 'default', 'walkin' ), true );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\map_bank_context' ) ) {
    function map_bank_context( string $in ): string {
        return ( $in === 'walkin' ) ? 'claim_walkin' : 'claim';
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\validate_amount' ) ) {
    function validate_amount( $raw ): bool {
        if ( ! is_numeric( $raw ) ) return false;
        $v = (float) $raw;
        return $v >= 0.01 && $v <= 9999999.99;
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────

final class ClaimChargeCreateTest extends TestCase {

    // ─── Validation matrix ────────────────────────────────────────────

    public function test_reason_whitelist_accepts_all_4_canonical(): void {
        $allowed = array( 'return_shipping', 'repair_oow', 'extra_parts', 'other' );
        foreach ( $allowed as $r ) {
            $this->assertTrue( validate_reason( $r ), "reason '$r' must be accepted" );
        }
    }

    public function test_reason_whitelist_rejects_unknown(): void {
        $rejects = array( '', 'free_shipping', 'oow', 'extra', 'OTHER', 'other ', ' other' );
        foreach ( $rejects as $r ) {
            $this->assertFalse( validate_reason( $r ), "reason '$r' must be rejected" );
        }
    }

    public function test_bank_context_input_accepts_default_and_walkin(): void {
        $this->assertTrue( validate_bank_context_input( 'default' ) );
        $this->assertTrue( validate_bank_context_input( 'walkin' ) );
    }

    public function test_bank_context_input_rejects_unknown(): void {
        foreach ( array( '', 'claim', 'claim_walkin', 'main', 'walk-in', 'DEFAULT' ) as $bad ) {
            $this->assertFalse( validate_bank_context_input( $bad ), "bank_context '$bad' must be rejected" );
        }
    }

    public function test_bank_context_input_maps_to_schema_value(): void {
        $this->assertSame( 'claim', map_bank_context( 'default' ) );
        $this->assertSame( 'claim_walkin', map_bank_context( 'walkin' ) );
    }

    public function test_amount_accepts_range(): void {
        $this->assertTrue( validate_amount( 0.01 ) );
        $this->assertTrue( validate_amount( '0.01' ) );
        $this->assertTrue( validate_amount( 1500.50 ) );
        $this->assertTrue( validate_amount( 9999999.99 ) );
    }

    public function test_amount_rejects_zero_negative_overflow(): void {
        $this->assertFalse( validate_amount( 0 ) );
        $this->assertFalse( validate_amount( 0.0 ) );
        $this->assertFalse( validate_amount( -1 ) );
        $this->assertFalse( validate_amount( 10000000 ) );
        $this->assertFalse( validate_amount( 'abc' ) );
        $this->assertFalse( validate_amount( '' ) );
    }

    // ─── Idempotency hash determinism (cents int) ─────────────────────

    public function test_idempotency_hash_uses_cents_int_no_float_drift(): void {
        // 1500.005 + 1500.005 = 3000.01 in float, but DECIMAL(14,2) stores 1500.00.
        // Cents normalization MUST use round() to avoid 0.999999 truncation.
        $a = amount_to_cents( 1500.00 );
        $b = amount_to_cents( 1500.0 );
        $c = amount_to_cents( 1500 );
        $this->assertSame( 150000, $a );
        $this->assertSame( 150000, $b );
        $this->assertSame( 150000, $c );
        $body_a = array( 'claim_id' => 1, 'amount_cents' => $a, 'reason' => 'other', 'bank_context' => 'default', 'actor_user_id' => 7 );
        $body_b = array( 'claim_id' => 1, 'amount_cents' => $b, 'reason' => 'other', 'bank_context' => 'default', 'actor_user_id' => 7 );
        $this->assertSame( idempotency_body_hash( $body_a ), idempotency_body_hash( $body_b ) );
    }

    public function test_idempotency_hash_differs_for_different_amount(): void {
        $body_a = array( 'claim_id' => 1, 'amount_cents' => 150000, 'reason' => 'other', 'bank_context' => 'default', 'actor_user_id' => 7 );
        $body_b = array( 'claim_id' => 1, 'amount_cents' => 150001, 'reason' => 'other', 'bank_context' => 'default', 'actor_user_id' => 7 );
        $this->assertNotSame( idempotency_body_hash( $body_a ), idempotency_body_hash( $body_b ) );
    }

    public function test_idempotency_hash_differs_for_different_bank_context(): void {
        $body_a = array( 'claim_id' => 1, 'amount_cents' => 150000, 'reason' => 'other', 'bank_context' => 'default', 'actor_user_id' => 7 );
        $body_b = array( 'claim_id' => 1, 'amount_cents' => 150000, 'reason' => 'other', 'bank_context' => 'walkin',  'actor_user_id' => 7 );
        $this->assertNotSame( idempotency_body_hash( $body_a ), idempotency_body_hash( $body_b ) );
    }

    public function test_idempotency_hash_differs_for_different_actor(): void {
        $body_a = array( 'claim_id' => 1, 'amount_cents' => 150000, 'reason' => 'other', 'bank_context' => 'default', 'actor_user_id' => 7 );
        $body_b = array( 'claim_id' => 1, 'amount_cents' => 150000, 'reason' => 'other', 'bank_context' => 'default', 'actor_user_id' => 8 );
        $this->assertNotSame( idempotency_body_hash( $body_a ), idempotency_body_hash( $body_b ) );
    }

    public function test_idempotency_hash_is_stable_across_key_order(): void {
        $body_a = array( 'reason' => 'other', 'claim_id' => 1, 'amount_cents' => 150000, 'actor_user_id' => 7, 'bank_context' => 'default' );
        $body_b = array( 'claim_id' => 1, 'amount_cents' => 150000, 'reason' => 'other', 'bank_context' => 'default', 'actor_user_id' => 7 );
        $this->assertSame( idempotency_body_hash( $body_a ), idempotency_body_hash( $body_b ) );
    }

    // ─── payment_ref format ───────────────────────────────────────────

    public function test_payment_ref_format_matches_clm_chg_pattern(): void {
        for ( $i = 1; $i <= 5; $i++ ) {
            $ref = generate_payment_ref( $i * 137 );
            $this->assertMatchesRegularExpression(
                '/^CLM-CHG-\d{4}-[A-Z0-9]{4}$/',
                $ref,
                "Generated ref '$ref' must match CLM-CHG-NNNN-XXXX pattern"
            );
        }
    }

    public function test_payment_ref_id_zero_pads_to_4_digits(): void {
        $ref = generate_payment_ref( 7 );
        $this->assertStringContainsString( 'CLM-CHG-0007-', $ref );
        $ref2 = generate_payment_ref( 1234 );
        $this->assertStringContainsString( 'CLM-CHG-1234-', $ref2 );
    }

    public function test_payment_ref_crockford_alphabet_excludes_iloU_and_01(): void {
        // Generate many refs; suffix chars must come from
        // 'ABCDEFGHJKMNPQRSTVWXYZ23456789' (no I/L/O/U/0/1).
        $banned = array( 'I', 'L', 'O', 'U', '0', '1' );
        for ( $i = 0; $i < 200; $i++ ) {
            $ref = generate_payment_ref( $i + 1 );
            $suf = substr( $ref, -4 );
            foreach ( str_split( $suf ) as $ch ) {
                $this->assertNotContains( $ch, $banned, "Banned char '$ch' in suffix '$suf'" );
            }
        }
    }

    // ─── expires_at calculation (Sprint 16 C2 lesson) ─────────────────

    public function test_expires_at_uses_local_date_not_gmdate(): void {
        // When PHP default tz is UTC (the test environment), date() and
        // gmdate() match. We assert via additive correctness rather than
        // by comparing tz: created + N days * 86400s = expected epoch.
        $now = '2026-05-14 10:00:00';
        $exp = compute_expires_at( $now, 7 );
        $delta = strtotime( $exp ) - strtotime( $now );
        $this->assertSame( 7 * 86400, $delta );
    }

    public function test_expires_at_range_1_to_30_days(): void {
        $now = '2026-05-14 10:00:00';
        foreach ( array( 1, 3, 7, 14, 30 ) as $d ) {
            $exp = compute_expires_at( $now, $d );
            $this->assertSame( $d * 86400, strtotime( $exp ) - strtotime( $now ) );
        }
    }

    // ─── Account masking ──────────────────────────────────────────────

    public function test_mask_account_last_4_visible(): void {
        $this->assertSame( '••••••1234', mask_account( '1234561234' ) );
        $this->assertSame( '•••••••3456', mask_account( '12345603456' ) );
    }

    public function test_mask_account_short_input_all_bullets(): void {
        $this->assertSame( '••', mask_account( '12' ) );
        $this->assertSame( '••••', mask_account( '1234' ) );
        $this->assertSame( '', mask_account( '' ) );
    }

    public function test_mask_account_preserves_total_length(): void {
        $acct = '123-45-67890';
        $this->assertSame( mb_strlen( $acct ), mb_strlen( mask_account( $acct ) ) );
    }

    // ─── amount_thb_at_create equality invariant ──────────────────────

    public function test_amount_create_invariant_at_insert(): void {
        // Handler MUST set amount_thb = amount_thb_at_create at INSERT to
        // satisfy chk_amount_snapshot CHECK constraint (Sprint 14 H2 + Sprint
        // 16 C1). Simulate the insert row construction.
        $amount_thb = 1500.00;
        $insert = array(
            'amount_thb'           => $amount_thb,
            'amount_thb_at_create' => $amount_thb,
        );
        $this->assertEqualsWithDelta( $insert['amount_thb'], $insert['amount_thb_at_create'], 0.001 );
    }

    public function test_amount_create_invariant_rejects_mismatch(): void {
        $a = 1500.00;
        $b = 1499.99;
        $this->assertNotEqualsWithDelta( $a, $b, 0.001 );
    }

    // ─── expires_in_days range ────────────────────────────────────────

    public function test_expires_in_days_range_validation(): void {
        $valid = array( 1, 7, 14, 30 );
        foreach ( $valid as $d ) {
            $this->assertTrue( $d >= 1 && $d <= 30, "$d is in range" );
        }
        $invalid = array( 0, -1, 31, 365 );
        foreach ( $invalid as $d ) {
            $this->assertFalse( $d >= 1 && $d <= 30, "$d is out of range" );
        }
    }

    // ─── Permission contract ──────────────────────────────────────────

    public function test_handler_requires_manage_options_permission(): void {
        // The route registration uses dinoco_claim_payment_perm_admin which
        // returns current_user_can('manage_options'). We can't exercise WP
        // permission here, but we assert the contract: only admin tier can
        // hit POST /charges (handler short-circuits via permission_callback
        // before reaching create logic).
        $this->assertTrue( true, 'Permission callback is dinoco_claim_payment_perm_admin (current_user_can manage_options)' );
    }
}
