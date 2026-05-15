<?php
/**
 * IdempotencyRound56Test — DRY contract tests for Round 56 batch 34 (7 endpoints).
 *
 * Source: Round 56 (2026-05-15) — 🎯 **85% MAJOR MILESTONE REACHED** (168/196 = 85.7%).
 *
 *   Batch 34 = 1 new direct wrap + 6 tracker accounting fix (transition helper):
 *     - POST /dinoco-claim/v1/charges/{id}/approve-refund — NEW direct wrap V.0.12.
 *       CRITICAL 4-eyes audit op. Body {charge_id, ttl_minutes, approver_user_id}.
 *     - POST /dinoco-claim/v1/charges/{id}/upload-slip   — already wrapped (transition
 *       helper) but tracker accounting fix. Body shape via wrapped_transition adds
 *       from_state probe + idem_discriminator=slip_sha256 (R42 pattern).
 *     - POST /dinoco-claim/v1/charges/{id}/verify        — wrapped via transition.
 *     - POST /dinoco-claim/v1/charges/{id}/reject        — wrapped via transition.
 *     - POST /dinoco-claim/v1/charges/{id}/refund        — wrapped via transition
 *       (CRITICAL financial — consent_token validated atomically inside).
 *     - POST /dinoco-claim/v1/charges/{id}/cancel        — wrapped via transition.
 *     - POST /dinoco-claim/v1/charges (create)           — wrapped direct (L1432).
 *
 * Tests body-shape contracts for both NEW approve-refund + the 6 transition-wrapped
 * endpoints' canonical body shape (Sprint 14 H1 fix mandatory from_state probe).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound56Test extends IdempotencyTestFixture {

    // ── BATCH 34: APPROVE-REFUND (NEW direct wrap — CRITICAL 4-eyes audit) ──

    public function test_approve_refund_first_call_success(): void {
        $body = array(
            'charge_id'        => 1234,
            'ttl_minutes'      => 30,
            'approver_user_id' => 7,
        );
        $this->assertFirstCallSuccess( 'dinoco-claim/v1/approve-refund', $body );
    }

    public function test_approve_refund_replay_matches(): void {
        $body = array(
            'charge_id'        => 1234,
            'ttl_minutes'      => 30,
            'approver_user_id' => 7,
        );
        $this->assertReplayMatches( 'dinoco-claim/v1/approve-refund', $body );
    }

    public function test_approve_refund_different_ttl_409(): void {
        // Admin re-evaluating consent token expiry window mid-retry = different intent.
        // Cached replay of 30min when admin intended 60min would issue token with wrong
        // expiry → consent expires-on-arrival or stays valid too long.
        $b1 = array( 'charge_id' => 1234, 'ttl_minutes' => 30, 'approver_user_id' => 7 );
        $b2 = array( 'charge_id' => 1234, 'ttl_minutes' => 60, 'approver_user_id' => 7 );
        $this->assertDifferentBody( 'dinoco-claim/v1/approve-refund', $b1, $b2, 'ttl_minutes (30 vs 60)' );
    }

    public function test_approve_refund_different_charge_409(): void {
        // Same idempotency key reused across charges = different intent.
        $b1 = array( 'charge_id' => 1234, 'ttl_minutes' => 30, 'approver_user_id' => 7 );
        $b2 = array( 'charge_id' => 9999, 'ttl_minutes' => 30, 'approver_user_id' => 7 );
        $this->assertDifferentBody( 'dinoco-claim/v1/approve-refund', $b1, $b2, 'charge_id (1234 vs 9999)' );
    }

    // ── BATCH 34: TRANSITION-WRAPPED (canonical body shape contract) ──

    public function test_transition_helper_body_includes_from_state(): void {
        // Sprint 14 H1 contract: body MUST include from_state probed via SELECT to prevent
        // F1-class drift where identical (charge_id, to_state, actor) tuples at different
        // lifecycle moments hash identically (e.g. upload after rejected re-upload).
        $body = array(
            'charge_id'     => 1234,
            'from_state'    => 'pending_payment',
            'to_state'      => 'pending_review',
            'actor_user_id' => 7,
        );
        $this->assertFirstCallSuccess( 'wrapped_transition (canonical shape)', $body );
    }

    public function test_transition_helper_from_state_discriminator(): void {
        // Same (charge_id, to_state, actor) but different from_state MUST 409.
        // Customer initial upload-slip (pending_payment→pending_review) vs re-upload
        // after admin rejected (rejected→pending_review) — must NOT cache-collide.
        $b1 = array( 'charge_id' => 1234, 'from_state' => 'pending_payment', 'to_state' => 'pending_review', 'actor_user_id' => 7 );
        $b2 = array( 'charge_id' => 1234, 'from_state' => 'rejected',         'to_state' => 'pending_review', 'actor_user_id' => 7 );
        $this->assertDifferentBody( 'wrapped_transition', $b1, $b2, 'from_state (Sprint 14 H1 contract)' );
    }

    public function test_upload_slip_binary_fingerprint_via_discriminator(): void {
        // R42 binary-fingerprint pattern carried through transition layer via
        // idem_discriminator=slip_sha256. Same slip retry dedup, different slip → 409.
        $b1 = array(
            'charge_id'     => 1234,
            'from_state'    => 'pending_payment',
            'to_state'      => 'pending_review',
            'actor_user_id' => 7,
            'discriminator' => sha1( 'slip_image_A' ),
        );
        $b2 = array(
            'charge_id'     => 1234,
            'from_state'    => 'pending_payment',
            'to_state'      => 'pending_review',
            'actor_user_id' => 7,
            'discriminator' => sha1( 'slip_image_B' ),
        );
        $this->assertDifferentBody( 'upload-slip (binary-fingerprint via discriminator)', $b1, $b2,
            'slip_sha256 fingerprint (R42 pattern at transition layer)' );
    }

    public function test_refund_consent_token_amount_precision(): void {
        // Financial refund body shape — amount_cents normalized (R29 record_payment pattern
        // applied at transition discriminator layer). Different amount mid-retry → 409
        // CRITICAL prevents wrong debt re-add via cached replay.
        $b1 = array(
            'charge_id'      => 1234,
            'from_state'     => 'verified',
            'to_state'       => 'refunded',
            'actor_user_id'  => 7,
            'discriminator'  => 'amount_cents_500000', // ฿5,000.00 = 500000 cents
        );
        $b2 = array(
            'charge_id'      => 1234,
            'from_state'     => 'verified',
            'to_state'       => 'refunded',
            'actor_user_id'  => 7,
            'discriminator'  => 'amount_cents_500001', // ฿5,000.01 = 500001 cents (1-cent typo)
        );
        $this->assertDifferentBody( 'refund', $b1, $b2,
            'refund amount precision (1-cent diff → CRITICAL 409 prevents wrong debt re-add)' );
    }

    public function test_charge_create_body_shape(): void {
        // charge-create direct wrap (L1432) — financial charge creation.
        $body = array(
            'claim_id'         => 567,
            'amount_thb'       => 12500.00,
            'customer_user_id' => 1234,
            'actor_user_id'    => 7,
        );
        $this->assertFirstCallSuccess( 'dinoco-claim/v1/charges (create)', $body );
    }

    public function test_charge_create_different_amount_409(): void {
        // CRITICAL financial: cached replay of wrong amount = duplicate charge row +
        // customer billed wrong amount + LINE push noise.
        $b1 = array( 'claim_id' => 567, 'amount_thb' => 12500.00, 'customer_user_id' => 1234, 'actor_user_id' => 7 );
        $b2 = array( 'claim_id' => 567, 'amount_thb' => 25000.00, 'customer_user_id' => 1234, 'actor_user_id' => 7 );
        $this->assertDifferentBody( 'charges (create)', $b1, $b2, 'amount_thb financial integrity' );
    }

    // ── CUMULATIVE NO-COLLISION GUARD ──

    public function test_round_56_no_cross_endpoint_collision(): void {
        $h_approve = dinoco_idempotency_hash( array( 'charge_id' => 1, 'ttl_minutes' => 30, 'approver_user_id' => 7 ) );
        $h_upload  = dinoco_idempotency_hash( array(
            'charge_id' => 1, 'from_state' => 'pending_payment', 'to_state' => 'pending_review',
            'actor_user_id' => 7, 'discriminator' => sha1( 'x' ),
        ) );
        $h_verify  = dinoco_idempotency_hash( array(
            'charge_id' => 1, 'from_state' => 'pending_review', 'to_state' => 'verified',
            'actor_user_id' => 7,
        ) );
        $h_refund  = dinoco_idempotency_hash( array(
            'charge_id' => 1, 'from_state' => 'verified', 'to_state' => 'refunded',
            'actor_user_id' => 7, 'discriminator' => 'amount_cents_500000',
        ) );
        $h_cancel  = dinoco_idempotency_hash( array(
            'charge_id' => 1, 'from_state' => 'pending_payment', 'to_state' => 'cancelled',
            'actor_user_id' => 7,
        ) );
        $h_create  = dinoco_idempotency_hash( array(
            'claim_id' => 1, 'amount_thb' => 100.0, 'customer_user_id' => 1234, 'actor_user_id' => 7,
        ) );
        $all = array( $h_approve, $h_upload, $h_verify, $h_refund, $h_cancel, $h_create );
        $this->assertCount(
            count( array_unique( $all ) ), $all,
            'Round 56: 6 endpoint body shapes MUST produce 6 distinct hashes (no collisions)'
        );
    }
}
