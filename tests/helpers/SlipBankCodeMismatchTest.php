<?php
/**
 * SlipBankCodeMismatchTest — pure-logic tests for Phase 2 V.2.2 B-5
 *
 * Source of truth: docs/feature-specs/FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md §6.4.1
 *
 * Threat closed by B-5:
 *   Customer transfers to attacker's bank account that has similar trailing
 *   digits (or fake claim page socially engineers customer). Slip2Go verifies
 *   amount + transaction reference + slip authenticity → slip is GENUINE →
 *   without bank_code mismatch enforcement, fraud succeeds.
 *
 * V.2.2 spec contract:
 *   1. Strict `===` bank_code comparison (no substring, no Levenshtein)
 *   2. Fail-fast on bank mismatch (no fall-through to amount/ref checks)
 *   3. Missing bank_code from Slip2Go → pending_review (NOT failed) for
 *      admin manual review (Slip2Go uncertainty, not necessarily fraud)
 *   4. Wrong account last4 treated atomically as bank_mismatch (same code)
 *   5. slip_ref_hash includes `bank_context` discriminator so a single slip
 *      can't be replayed across walk-in ↔ online namespaces
 *
 * 5 scenarios per V.2.2 spec lines 845-874:
 *
 * Test 1: Genuine slip to wrong bank → slip_bank_mismatch
 * Test 2: Right bank but wrong account last4 → slip_bank_mismatch atomic
 * Test 3: Bank code missing in Slip2Go → pending_review/slip_unknown_bank
 * Test 4: All fields match (positive) + matched_fields array correctness
 * Test 5: Replay across walk-in vs online claim — bank_context discriminator
 *
 * Pattern: pure-logic — extract classifier inline + assert decision shape.
 * No Slip2Go HTTP call, no wpdb. Models the strict comparator from §6.4.1.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\SlipBankCodeMismatch;

use PHPUnit\Framework\TestCase;

// ──────────────────────────────────────────────────────────────────────────
// Fixture: inline classifier matching dinoco_verify_slip_for_claim()
// strict bank-code contract (V.2.2 §6.4.1 lines 760-832).
//
// Returns: {status, error_code, matched_fields[], slip_ref_hash}
// ──────────────────────────────────────────────────────────────────────────

if ( ! function_exists( __NAMESPACE__ . '\\classify_slip_strict_bank' ) ) {
    function classify_slip_strict_bank(
        array $s2g_response,          // simulated Slip2Go API response
        string $expected_bank_code,   // SNAPSHOT from charge.bank_code (NOT current wp_options)
        string $expected_account_no,  // SNAPSHOT from charge.bank_account
        float $expected_amount,
        string $bank_context           // 'claim' | 'claim_walkin'
    ): array {
        $matched = array();

        // 1. Slip2Go reachable check
        if ( empty( $s2g_response['ok'] ) || empty( $s2g_response['receiver'] ) ) {
            return array(
                'status'        => 'failed',
                'error_code'    => 'slip_invalid',
                'matched_fields' => $matched,
                'slip_ref_hash' => null,
            );
        }

        // 2. Extract receiver bank_code
        $s2g_bank_code = isset( $s2g_response['receiver']['bank_code'] )
            ? (string) $s2g_response['receiver']['bank_code']
            : '';

        if ( $s2g_bank_code === '' ) {
            // Slip2Go could not extract — admin manual review
            return array(
                'status'        => 'pending_review',
                'error_code'    => 'slip_unknown_bank',
                'matched_fields' => $matched,
                'slip_ref_hash' => null,
            );
        }

        // 3. STRICT bank_code === expected (fail-fast)
        if ( $s2g_bank_code !== $expected_bank_code ) {
            return array(
                'status'        => 'failed',
                'error_code'    => 'slip_bank_mismatch',
                'matched_fields' => $matched,  // NO match yet
                'slip_ref_hash' => null,
            );
        }
        $matched[] = 'bank_code';

        // 4. Account last4 check — atomic decision with bank
        $s2g_acct = (string) ( $s2g_response['receiver']['account_no'] ?? '' );
        $s2g_acct_last4 = substr( preg_replace( '/[^0-9]/', '', $s2g_acct ), -4 );
        $exp_acct_last4 = substr( preg_replace( '/[^0-9]/', '', $expected_account_no ), -4 );
        if ( $s2g_acct_last4 !== $exp_acct_last4 ) {
            return array(
                'status'        => 'failed',
                'error_code'    => 'slip_bank_mismatch',  // SAME code (atomic with bank)
                'matched_fields' => $matched,             // only bank_code matched, not account
                'slip_ref_hash' => null,
            );
        }
        $matched[] = 'account_no';

        // 5. Amount tolerance ±2% (min ฿1)
        $s2g_amount = (float) ( $s2g_response['amount'] ?? 0 );
        $tolerance  = max( 1.0, $expected_amount * 0.02 );
        if ( abs( $s2g_amount - $expected_amount ) > $tolerance ) {
            return array(
                'status'        => 'failed',
                'error_code'    => 'slip_amount_mismatch',
                'matched_fields' => $matched,
                'slip_ref_hash' => null,
            );
        }
        $matched[] = 'amount';

        // 6. slip_ref_hash with bank_context discriminator (H-6 fix)
        //    Same slip cannot replay across 'claim' ↔ 'claim_walkin' namespaces.
        $ref_input = sprintf( '%s::%s::%s::%.2f::%s',
            $bank_context,
            $s2g_response['trans_ref'] ?? '',
            $s2g_response['datetime'] ?? '',
            $s2g_amount,
            substr( $s2g_bank_code, 0, 4 )
        );
        $slip_ref_hash = hash( 'sha256', $ref_input );
        $matched[] = 'trans_ref';

        return array(
            'status'        => 'verified',
            'error_code'    => null,
            'matched_fields' => $matched,
            'slip_ref_hash' => $slip_ref_hash,
        );
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Tests — 5 scenarios from V.2.2 §6.4.1 lines 845-874
// ──────────────────────────────────────────────────────────────────────────

class SlipBankCodeMismatchTest extends TestCase {

    /** Helper — build a valid Slip2Go-shaped response. */
    private function make_s2g(
        string $bank_code = '004',
        string $account = '1234567890',
        float $amount = 500.00,
        string $trans_ref = 'TXN-ABC-1234',
        string $datetime = '2026-05-13T14:32:00+07:00'
    ): array {
        return array(
            'ok'        => true,
            'amount'    => $amount,
            'trans_ref' => $trans_ref,
            'datetime'  => $datetime,
            'receiver'  => array(
                'bank_code'  => $bank_code,
                'account_no' => $account,
            ),
        );
    }

    // ─── Test 1: Genuine slip to wrong bank → slip_bank_mismatch ─────────

    public function test_slip_to_wrong_bank_returns_bank_mismatch(): void {
        // Customer transferred to SCB (014) but charge expected KBANK (004)
        $s2g    = $this->make_s2g( '014', '1234567890', 500.00 );
        $result = classify_slip_strict_bank( $s2g, '004', '123-4-56789-0', 500.00, 'claim' );

        $this->assertSame( 'failed',             $result['status'] );
        $this->assertSame( 'slip_bank_mismatch', $result['error_code'] );
        $this->assertNotContains( 'bank_code', $result['matched_fields'],
            'bank_code MUST NOT be in matched_fields on mismatch (fail-fast)' );
    }

    public function test_slip_bank_mismatch_does_not_fall_through_to_amount_check(): void {
        // Bank wrong AND amount also wrong — fail-fast on bank, never check amount
        $s2g    = $this->make_s2g( '014', '1234567890', 999.00 );  // wrong bank + wrong amount
        $result = classify_slip_strict_bank( $s2g, '004', '123-4-56789-0', 500.00, 'claim' );

        $this->assertSame( 'slip_bank_mismatch', $result['error_code'],
            'Bank mismatch fail-fast — must NOT fall through to amount even if amount also wrong' );
        $this->assertEmpty( $result['matched_fields'] );
    }

    // ─── Test 2: Right bank + wrong account last4 → bank_mismatch atomic ─

    public function test_right_bank_wrong_account_last4_atomic_bank_mismatch(): void {
        // Bank code correct (004) but account 9876 vs expected 1234
        $s2g    = $this->make_s2g( '004', '0000009876', 500.00 );
        $result = classify_slip_strict_bank( $s2g, '004', '123-4-56789-0', 500.00, 'claim' );

        // Last 4 of expected = "6789-0" stripped = "67890" → last 4 = "7890"
        // Last 4 of slip "9876" = "9876" → mismatch
        $this->assertSame( 'failed',             $result['status'] );
        $this->assertSame( 'slip_bank_mismatch', $result['error_code'],
            'Wrong account treated atomically as bank_mismatch (same error code)' );
        $this->assertContains( 'bank_code', $result['matched_fields'],
            'bank_code matched first, then account check fails — bank_code stays in matched' );
        $this->assertNotContains( 'account_no', $result['matched_fields'] );
    }

    public function test_right_bank_matching_account_last4_proceeds(): void {
        // Last 4 of "123-4-56789-0" = stripped "12345678 90" = last 4 = "7890"
        // Slip account ending in "7890" — should match
        $s2g    = $this->make_s2g( '004', '0000007890', 500.00 );
        $result = classify_slip_strict_bank( $s2g, '004', '123-4-56789-0', 500.00, 'claim' );

        $this->assertSame( 'verified', $result['status'] );
        $this->assertContains( 'account_no', $result['matched_fields'] );
    }

    // ─── Test 3: Bank code missing → pending_review/slip_unknown_bank ────

    public function test_missing_bank_code_yields_pending_review(): void {
        // Slip2Go could not extract receiver bank — uncertainty, NOT fraud
        $s2g = $this->make_s2g( '', '1234567890', 500.00 );
        $result = classify_slip_strict_bank( $s2g, '004', '123-4-56789-0', 500.00, 'claim' );

        $this->assertSame( 'pending_review',  $result['status'],
            'Missing bank_code → admin manual review, NOT failed' );
        $this->assertSame( 'slip_unknown_bank', $result['error_code'] );
    }

    public function test_missing_bank_code_distinct_from_wrong_bank(): void {
        // Different paths: '' → pending_review; '014' → failed
        $unknown = classify_slip_strict_bank(
            $this->make_s2g( '', '1234567890', 500.00 ),
            '004', '123-4-56789-0', 500.00, 'claim'
        );
        $wrong = classify_slip_strict_bank(
            $this->make_s2g( '014', '1234567890', 500.00 ),
            '004', '123-4-56789-0', 500.00, 'claim'
        );

        $this->assertSame( 'pending_review', $unknown['status'] );
        $this->assertSame( 'failed',         $wrong['status'] );
        $this->assertNotSame( $unknown['error_code'], $wrong['error_code'] );
    }

    // ─── Test 4: All fields match (positive) + matched_fields shape ──────

    public function test_full_match_returns_verified_with_all_4_matched_fields(): void {
        $s2g    = $this->make_s2g( '004', '0000007890', 500.00, 'TXN-XYZ-9999' );
        $result = classify_slip_strict_bank( $s2g, '004', '123-4-56789-0', 500.00, 'claim' );

        $this->assertSame( 'verified',  $result['status'] );
        $this->assertNull( $result['error_code'] );
        $this->assertSame(
            array( 'bank_code', 'account_no', 'amount', 'trans_ref' ),
            $result['matched_fields'],
            'matched_fields must contain all 4 checks in order'
        );
        $this->assertNotNull( $result['slip_ref_hash'] );
        $this->assertSame( 64, strlen( $result['slip_ref_hash'] ),
            'slip_ref_hash = sha256 hex = 64 chars' );
    }

    public function test_amount_within_2pct_tolerance_still_verifies(): void {
        // Expected ฿500, slip ฿509.99 (within 2% = ฿10 tolerance)
        $s2g    = $this->make_s2g( '004', '0000007890', 509.99 );
        $result = classify_slip_strict_bank( $s2g, '004', '123-4-56789-0', 500.00, 'claim' );

        $this->assertSame( 'verified', $result['status'] );
    }

    public function test_amount_outside_tolerance_fails_with_amount_mismatch_not_bank(): void {
        // Bank + account match BUT amount way off
        $s2g    = $this->make_s2g( '004', '0000007890', 1000.00 );  // double
        $result = classify_slip_strict_bank( $s2g, '004', '123-4-56789-0', 500.00, 'claim' );

        $this->assertSame( 'failed',                $result['status'] );
        $this->assertSame( 'slip_amount_mismatch',  $result['error_code'],
            'Amount fails AFTER bank+account succeed → distinct error code' );
        $this->assertContains( 'bank_code',  $result['matched_fields'] );
        $this->assertContains( 'account_no', $result['matched_fields'] );
        $this->assertNotContains( 'amount',  $result['matched_fields'] );
    }

    // ─── Test 5: Replay across walk-in vs online — bank_context discriminator ──

    public function test_same_slip_yields_different_ref_hash_in_walkin_vs_online(): void {
        // Same Slip2Go response (same trans_ref, same datetime, same amount)
        $s2g = $this->make_s2g( '004', '0000007890', 500.00, 'TXN-SAME-1234', '2026-05-13T14:32:00+07:00' );

        $online = classify_slip_strict_bank( $s2g, '004', '123-4-56789-0', 500.00, 'claim' );
        $walkin = classify_slip_strict_bank( $s2g, '004', '123-4-56789-0', 500.00, 'claim_walkin' );

        $this->assertSame( 'verified', $online['status'] );
        $this->assertSame( 'verified', $walkin['status'] );
        $this->assertNotSame( $online['slip_ref_hash'], $walkin['slip_ref_hash'],
            'bank_context discriminator must produce different hashes — no cross-namespace replay' );
    }

    public function test_ref_hash_deterministic_within_same_bank_context(): void {
        // Same context + same slip → same hash (idempotent identity for UNIQUE constraint)
        $s2g = $this->make_s2g( '004', '0000007890', 500.00, 'TXN-DET-5555', '2026-05-13T10:00:00+07:00' );

        $a = classify_slip_strict_bank( $s2g, '004', '123-4-56789-0', 500.00, 'claim' );
        $b = classify_slip_strict_bank( $s2g, '004', '123-4-56789-0', 500.00, 'claim' );

        $this->assertSame( $a['slip_ref_hash'], $b['slip_ref_hash'],
            'Same input must yield same slip_ref_hash (idempotency)' );
    }

    public function test_different_trans_ref_yields_different_hash(): void {
        $s2g1 = $this->make_s2g( '004', '0000007890', 500.00, 'TXN-A' );
        $s2g2 = $this->make_s2g( '004', '0000007890', 500.00, 'TXN-B' );

        $r1 = classify_slip_strict_bank( $s2g1, '004', '123-4-56789-0', 500.00, 'claim' );
        $r2 = classify_slip_strict_bank( $s2g2, '004', '123-4-56789-0', 500.00, 'claim' );

        $this->assertNotSame( $r1['slip_ref_hash'], $r2['slip_ref_hash'] );
    }

    // ─── Edge: empty Slip2Go response ────────────────────────────────────

    public function test_empty_response_returns_slip_invalid(): void {
        $result = classify_slip_strict_bank( array( 'ok' => false ), '004', '123-4-56789-0', 500.00, 'claim' );
        $this->assertSame( 'failed',       $result['status'] );
        $this->assertSame( 'slip_invalid', $result['error_code'] );
    }

    public function test_missing_receiver_block_returns_slip_invalid(): void {
        $result = classify_slip_strict_bank(
            array( 'ok' => true, 'amount' => 500.00 ),  // no 'receiver'
            '004', '123-4-56789-0', 500.00, 'claim'
        );
        $this->assertSame( 'failed',       $result['status'] );
        $this->assertSame( 'slip_invalid', $result['error_code'] );
    }
}
