<?php
/**
 * ClaimChargeReadTest — pure-logic tests for Sprint 17 Phase 2.6 tiered read
 * endpoint (GET /dinoco-claim/v1/charges/{id}).
 *
 * Source of truth: [System] DINOCO Claim Payment LIFF V.0.6
 *   - dinoco_claim_payment_rest_charge_read()
 *   - dinoco_claim_payment_mask_account()
 *
 * Coverage:
 *   • Tier resolution: admin (manage_options) / owner / other
 *   • bank_account masked for owner, unmasked for admin
 *   • Other-user tier → 404 (NOT 403 — anti-enumeration per R3 HIGH-5)
 *   • Pre-verify slip URL hidden from owner; admin always sees
 *   • Cache transient key pattern + TTL contract
 *   • PromptPay QR field nullable (Phase 2.7 placeholder)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// ─── Inlined helpers ──────────────────────────────────────────────────────
if ( ! function_exists( __NAMESPACE__ . '\\mask_account_for_read' ) ) {
    function mask_account_for_read( string $acct ): string {
        $len = mb_strlen( $acct );
        if ( $len <= 4 ) return str_repeat( '•', $len );
        return str_repeat( '•', $len - 4 ) . mb_substr( $acct, -4 );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\build_read_response' ) ) {
    /**
     * Mirrors the handler — given a charge row + tier, build the response
     * payload (no DB). Tier ∈ {admin, owner, other}.
     */
    function build_read_response( array $row, string $tier, int $current_uid ): array {
        if ( $tier === 'other' ) {
            return array( '__error' => 'charge_not_found', '__status' => 404 );
        }
        $is_admin = ( $tier === 'admin' );
        if ( ! $is_admin && (int) $row['user_id'] !== $current_uid ) {
            return array( '__error' => 'charge_not_found', '__status' => 404 );
        }
        $bank_snapshot = array(
            'bank_code'    => (string) $row['bank_code'],
            'bank_name'    => (string) $row['bank_name'],
            'bank_account' => $is_admin ? (string) $row['bank_account'] : mask_account_for_read( (string) $row['bank_account'] ),
            'bank_holder'  => (string) $row['bank_holder'],
            'bank_branch'  => (string) $row['bank_branch'],
        );
        $resp = array(
            'id'            => (int) $row['id'],
            'charge_id'     => (int) $row['id'],
            'claim_id'      => (int) $row['claim_id'],
            'user_id'       => (int) $row['user_id'],
            'amount_thb'    => (float) $row['amount_thb'],
            'status'        => (string) $row['status'],
            'payment_ref'   => (string) $row['payment_ref'],
            'bank_snapshot' => $bank_snapshot,
            'expires_at'    => (string) $row['expires_at'],
            'promptpay_qr'  => null,
        );
        if ( $is_admin ) {
            $resp['amount_thb_at_create'] = (float) $row['amount_thb_at_create'];
            $resp['slip_image_url']       = (string) $row['slip_image_url'];
            $resp['verified_at']          = (string) $row['verified_at'];
            $resp['refund_approver_id']   = (int) $row['refund_approver_id'];
        } else {
            $resp['slip_image_url'] = in_array( $row['status'], array( 'verified', 'refunded' ), true )
                ? (string) $row['slip_image_url']
                : '';
        }
        return $resp;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\transient_key_for_read' ) ) {
    function transient_key_for_read( int $charge_id, string $tier ): string {
        return 'dinoco_claim_charge_v1_' . $charge_id . '_' . $tier;
    }
}

// ─── Fixture row ──────────────────────────────────────────────────────────
function fixture_row(): array {
    return array(
        'id'                    => 42,
        'claim_id'              => 7,
        'user_id'               => 100,
        'amount_thb'            => 1500.00,
        'amount_thb_at_create'  => 1500.00,
        'reason'                => 'return_shipping',
        'reason_note'           => '',
        'status'                => 'pending_payment',
        'payment_ref'           => 'CLM-CHG-0042-AB23',
        'bank_code'             => '014',
        'bank_account'          => '1234567890',
        'bank_holder'           => 'DINOCO CO LTD',
        'bank_name'             => 'Siam Commercial Bank',
        'bank_branch'           => 'Phaholyothin',
        'bank_context'          => 'claim',
        'slip_image_url'        => 'https://cdn.example.com/slip-42.jpg',
        'slip_ref_hash'         => '',
        'verified_at'           => '',
        'verified_by'           => 0,
        'refund_reason'         => '',
        'refund_approver_id'    => 0,
        'refunded_at'           => '',
        'refunded_by'           => 0,
        'expires_at'            => '2026-05-21 10:00:00',
        'created_at'            => '2026-05-14 10:00:00',
        'created_by'            => 5,
    );
}

// ─── Tests ────────────────────────────────────────────────────────────────

final class ClaimChargeReadTest extends TestCase {

    public function test_admin_tier_sees_unmasked_bank_account(): void {
        $row = fixture_row();
        $resp = build_read_response( $row, 'admin', 5 );
        $this->assertSame( '1234567890', $resp['bank_snapshot']['bank_account'] );
    }

    public function test_owner_tier_sees_masked_bank_account_last_4(): void {
        $row = fixture_row();
        $resp = build_read_response( $row, 'owner', 100 );
        $this->assertSame( '••••••7890', $resp['bank_snapshot']['bank_account'] );
    }

    public function test_other_user_returns_404_not_403(): void {
        $row = fixture_row();
        $resp = build_read_response( $row, 'other', 999 );
        $this->assertSame( 'charge_not_found', $resp['__error'] );
        $this->assertSame( 404, $resp['__status'] );
    }

    public function test_owner_mismatch_uid_returns_404(): void {
        $row = fixture_row();
        $resp = build_read_response( $row, 'owner', 999 );
        $this->assertSame( 'charge_not_found', $resp['__error'] );
        $this->assertSame( 404, $resp['__status'] );
    }

    public function test_admin_tier_includes_audit_columns(): void {
        $row = fixture_row();
        $resp = build_read_response( $row, 'admin', 5 );
        $this->assertArrayHasKey( 'amount_thb_at_create', $resp );
        $this->assertArrayHasKey( 'slip_image_url', $resp );
        $this->assertArrayHasKey( 'verified_at', $resp );
        $this->assertArrayHasKey( 'refund_approver_id', $resp );
    }

    public function test_owner_tier_excludes_audit_columns(): void {
        $row = fixture_row();
        $resp = build_read_response( $row, 'owner', 100 );
        $this->assertArrayNotHasKey( 'amount_thb_at_create', $resp );
        $this->assertArrayNotHasKey( 'verified_at', $resp );
        $this->assertArrayNotHasKey( 'refund_approver_id', $resp );
    }

    public function test_owner_pre_verify_slip_url_hidden(): void {
        $row = fixture_row();
        $row['status'] = 'pending_review';   // pre-verify
        $resp = build_read_response( $row, 'owner', 100 );
        $this->assertSame( '', $resp['slip_image_url'] );
    }

    public function test_owner_post_verified_sees_slip_url(): void {
        $row = fixture_row();
        $row['status'] = 'verified';
        $resp = build_read_response( $row, 'owner', 100 );
        $this->assertSame( 'https://cdn.example.com/slip-42.jpg', $resp['slip_image_url'] );
    }

    public function test_owner_refunded_sees_slip_url(): void {
        $row = fixture_row();
        $row['status'] = 'refunded';
        $resp = build_read_response( $row, 'owner', 100 );
        $this->assertSame( 'https://cdn.example.com/slip-42.jpg', $resp['slip_image_url'] );
    }

    public function test_response_includes_bank_snapshot_5_keys(): void {
        $row = fixture_row();
        $resp = build_read_response( $row, 'admin', 5 );
        $bank = $resp['bank_snapshot'];
        $this->assertArrayHasKey( 'bank_code', $bank );
        $this->assertArrayHasKey( 'bank_name', $bank );
        $this->assertArrayHasKey( 'bank_account', $bank );
        $this->assertArrayHasKey( 'bank_holder', $bank );
        $this->assertArrayHasKey( 'bank_branch', $bank );
        $this->assertCount( 5, $bank );
    }

    public function test_promptpay_qr_field_present_but_null(): void {
        $row = fixture_row();
        $resp = build_read_response( $row, 'admin', 5 );
        $this->assertArrayHasKey( 'promptpay_qr', $resp );
        $this->assertNull( $resp['promptpay_qr'] );
    }

    public function test_transient_cache_key_pattern(): void {
        $this->assertSame( 'dinoco_claim_charge_v1_42_admin', transient_key_for_read( 42, 'admin' ) );
        $this->assertSame( 'dinoco_claim_charge_v1_42_owner', transient_key_for_read( 42, 'owner' ) );
    }

    public function test_transient_key_distinct_per_tier(): void {
        $this->assertNotSame(
            transient_key_for_read( 1, 'admin' ),
            transient_key_for_read( 1, 'owner' )
        );
    }

    public function test_amount_thb_returned_as_float(): void {
        $row = fixture_row();
        $resp = build_read_response( $row, 'admin', 5 );
        $this->assertIsFloat( $resp['amount_thb'] );
        $this->assertEqualsWithDelta( 1500.00, $resp['amount_thb'], 0.001 );
    }

    public function test_payment_ref_pattern_in_response(): void {
        $row = fixture_row();
        $resp = build_read_response( $row, 'owner', 100 );
        $this->assertMatchesRegularExpression( '/^CLM-CHG-\d{4}-[A-Z0-9]{4}$/', $resp['payment_ref'] );
    }
}
