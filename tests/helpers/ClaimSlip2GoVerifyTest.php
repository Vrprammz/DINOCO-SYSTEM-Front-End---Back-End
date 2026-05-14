<?php
/**
 * ClaimSlip2GoVerifyTest — pure-logic tests for Sprint 20 Phase 2.7 async
 * Slip2Go verify wrapper (dinoco_claim_payment_verify_slip_async).
 *
 * Source of truth: [System] DINOCO Claim Payment LIFF V.0.8
 *   - Match decision matrix (amount + bank-receiver)
 *   - Slip2Go API code mapping (200000/200200 = success)
 *   - Timeout/HTTP error → leave pending_review (manual verify)
 *   - slip_verify_data persisted as JSON for audit trail
 *
 * Pure-logic only — no DB, no HTTP. Decision function inlined.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\Sprint20Slip2Go;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\classify_slip_verify_response' ) ) {
    /**
     * Mirrors LIFF V.0.8 decision logic for Slip2Go response.
     *
     * @param array{api_code:string,slip_amount:float} $resp
     * @param float $expected_amount
     * @return array{decision:string,reason:string}
     *   decision: verified | rejected | leave_pending
     */
    function classify_slip_verify_response( array $resp, float $expected_amount ): array {
        $api_code = (string) ( $resp['api_code'] ?? '' );
        $slip_amt = (float) ( $resp['slip_amount'] ?? 0 );

        $is_success   = in_array( $api_code, array( '200000', '200200' ), true );
        $amount_match = ( abs( $slip_amt - $expected_amount ) <= 0.01 );

        if ( $is_success && $amount_match ) {
            return array( 'decision' => 'verified', 'reason' => '' );
        }
        if ( $is_success && ! $amount_match ) {
            return array( 'decision' => 'rejected', 'reason' => 'amount_mismatch' );
        }
        // !$is_success — bank mismatch / duplicate / unparseable / etc.
        return array( 'decision' => 'rejected', 'reason' => 'slip2go_' . $api_code );
    }
}

final class ClaimSlip2GoVerifyTest extends TestCase {

    // ─── Success path ─────────────────────────────────────────────

    public function testMatchAmountAndBankReturnsVerified(): void {
        $r = classify_slip_verify_response(
            array( 'api_code' => '200000', 'slip_amount' => 1500.00 ),
            1500.00
        );
        $this->assertSame( 'verified', $r['decision'] );
        $this->assertSame( '', $r['reason'] );
    }

    public function testApiCode200200AlsoSuccess(): void {
        // Slip2Go partial-success code (no QR but slip readable)
        $r = classify_slip_verify_response(
            array( 'api_code' => '200200', 'slip_amount' => 99.50 ),
            99.50
        );
        $this->assertSame( 'verified', $r['decision'] );
    }

    public function testSatangTolerance(): void {
        // ±0.01 tolerance for float fuzz on cents arithmetic
        $r = classify_slip_verify_response(
            array( 'api_code' => '200000', 'slip_amount' => 5000.005 ),
            5000.00
        );
        $this->assertSame( 'verified', $r['decision'] );
    }

    // ─── Amount mismatch → rejected ───────────────────────────────

    public function testAmountMismatchHighReturnsRejected(): void {
        $r = classify_slip_verify_response(
            array( 'api_code' => '200000', 'slip_amount' => 1499.00 ),
            1500.00
        );
        $this->assertSame( 'rejected', $r['decision'] );
        $this->assertSame( 'amount_mismatch', $r['reason'] );
    }

    public function testAmountMismatchLowReturnsRejected(): void {
        $r = classify_slip_verify_response(
            array( 'api_code' => '200000', 'slip_amount' => 1500.50 ),
            1500.00
        );
        $this->assertSame( 'rejected', $r['decision'] );
        $this->assertSame( 'amount_mismatch', $r['reason'] );
    }

    public function testAmountMismatchByOneSatangRejected(): void {
        // 0.02 (2 satang) drift exceeds tolerance window
        $r = classify_slip_verify_response(
            array( 'api_code' => '200000', 'slip_amount' => 1500.02 ),
            1500.00
        );
        $this->assertSame( 'rejected', $r['decision'] );
    }

    // ─── Slip2Go non-success codes → rejected ─────────────────────

    public function testApiCodeBankMismatchRejected(): void {
        $r = classify_slip_verify_response(
            array( 'api_code' => '300600', 'slip_amount' => 1500.00 ),
            1500.00
        );
        $this->assertSame( 'rejected', $r['decision'] );
        $this->assertSame( 'slip2go_300600', $r['reason'] );
    }

    public function testApiCodeDuplicateSlipRejected(): void {
        // 300700 = duplicate slip per Slip2Go conventions
        $r = classify_slip_verify_response(
            array( 'api_code' => '300700', 'slip_amount' => 500.00 ),
            500.00
        );
        $this->assertSame( 'rejected', $r['decision'] );
        $this->assertStringStartsWith( 'slip2go_', $r['reason'] );
    }

    public function testEmptyApiCodeRejected(): void {
        $r = classify_slip_verify_response(
            array( 'api_code' => '', 'slip_amount' => 0 ),
            500.00
        );
        $this->assertSame( 'rejected', $r['decision'] );
        $this->assertSame( 'slip2go_', $r['reason'] );
    }

    public function testGenericFailureCodeRejected(): void {
        $r = classify_slip_verify_response(
            array( 'api_code' => '500000', 'slip_amount' => 0 ),
            500.00
        );
        $this->assertSame( 'rejected', $r['decision'] );
    }

    // ─── Source of truth contracts ────────────────────────────────

    public function testAsyncTimeout10s(): void {
        // Verify LIFF V.0.8 uses 10s timeout per Sprint 20 contract.
        $src = file_get_contents( __DIR__ . '/../../[System] DINOCO Claim Payment LIFF' );
        $this->assertNotFalse( $src );
        $this->assertStringContainsString( "'timeout' => 10", $src,
            'Slip2Go API call must use 10s timeout' );
    }

    public function testAsyncRetryOnce(): void {
        // Verify retry contract: 1 retry on wp_remote_post is_wp_error.
        $src = file_get_contents( __DIR__ . '/../../[System] DINOCO Claim Payment LIFF' );
        $this->assertNotFalse( $src );
        // Look for retry pattern: sleep(1) then wp_remote_post again
        $this->assertMatchesRegularExpression(
            '/is_wp_error\\(\\s*\\$response\\s*\\)\\s*\\)\\s*\\{\\s*sleep\\(\\s*1\\s*\\)\\s*;\\s*\\$response\\s*=\\s*wp_remote_post/',
            $src,
            '1 retry on network error before falling back to manual verify'
        );
    }

    public function testSlipVerifyDataPersisted(): void {
        $src = file_get_contents( __DIR__ . '/../../[System] DINOCO Claim Payment LIFF' );
        $this->assertNotFalse( $src );
        $this->assertStringContainsString( "'slip_verify_data' => wp_json_encode", $src,
            'Slip2Go response persisted to slip_verify_data column for audit trail' );
    }

    public function testTelegramDedupOnUnreachable(): void {
        $src = file_get_contents( __DIR__ . '/../../[System] DINOCO Claim Payment LIFF' );
        $this->assertNotFalse( $src );
        $this->assertStringContainsString( "'claim_slip2go_down'", $src,
            'Telegram dedup alert on Slip2Go unreachable (1hr TTL prevents spam)' );
    }

    public function testStillPendingReviewOnNetworkError(): void {
        // On wp_remote_post is_wp_error after retry, handler returns without
        // calling dinoco_claim_charge_transition — state stays pending_review.
        $src = file_get_contents( __DIR__ . '/../../[System] DINOCO Claim Payment LIFF' );
        $this->assertNotFalse( $src );
        // Look for `claim_slip2go_down` Telegram dedup + subsequent `return;`
        // pattern. State stays pending_review because no transition() call.
        $down_pos = strpos( $src, "'claim_slip2go_down'" );
        $this->assertNotFalse( $down_pos, 'Telegram dedup tag present' );
        $next_return = strpos( $src, 'return;', $down_pos );
        $this->assertNotFalse( $next_return, 'return; follows the Telegram dedup' );
        $this->assertLessThan( 600, $next_return - $down_pos,
            'return; fires close after Telegram dedup — no transition call between' );
        // Defense: no transition() call between the Telegram dedup and the return
        $between = substr( $src, $down_pos, $next_return - $down_pos );
        $this->assertStringNotContainsString( 'dinoco_claim_charge_transition', $between,
            'No transition call inside the network-failure branch' );
    }
}
