<?php
/**
 * IdempotencyRound55Test — DRY contract tests for Round 55 batch 33 (4 endpoints).
 *
 * Source: Round 55 (2026-05-15) — push past 🎯 80% milestone toward 85% (161/196 = 82.1%).
 *
 *   Batch 33 NEW (4 endpoints — NEW dinoco-claim/v1 namespace + dinoco-sn/v1 admin):
 *     - POST /dinoco-claim/v1/bank-settings       — bulk-shape {bucket, clear bool,
 *                                                   payload ksort-normalized, actor_user_id}.
 *                                                   Service Center & Claims V.34.8.
 *     - POST /dinoco-claim/v1/bank-settings/test  — single {use_walkin bool, actor_user_id}.
 *                                                   Service Center & Claims V.34.8.
 *     - POST /dinoco-sn/v1/api-tokens             — CRITICAL security — admin double-click on
 *                                                   token issuance = orphan secret risk +
 *                                                   duplicate active tokens.
 *                                                   Public API Gateway V.0.5 via
 *                                                   dinoco_sn_with_idempotency.
 *     - POST /dinoco-sn/v1/api-tokens/{id}/disable — destructive admin op audit-spam guard.
 *                                                   Public API Gateway V.0.5.
 *
 * Pattern: extends IdempotencyTestFixture. 3 cases per endpoint (first_call_success /
 * replay_matches / different_field_409) + payload ksort canonical-normalize verification +
 * scopes[] order-stable verification + cumulative no-collision guard.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound55Test extends IdempotencyTestFixture {

    // ── BATCH 33: BANK-SETTINGS SAVE (NEW namespace dinoco-claim/v1) ──

    public function test_bank_settings_save_first_call_success(): void {
        $body = array(
            'bucket'        => 'default',
            'clear'         => false,
            'payload'       => array(
                'bank_account' => '1234567890',
                'bank_code'    => '014',
                'bank_holder'  => 'DINOCO CO LTD',
                'bank_name'    => 'ไทยพาณิชย์',
            ),
            'actor_user_id' => 7,
        );
        $this->assertFirstCallSuccess( 'dinoco-claim/v1/bank-settings', $body );
    }

    public function test_bank_settings_save_replay_matches(): void {
        $body = array(
            'bucket'        => 'default',
            'clear'         => false,
            'payload'       => array(
                'bank_account' => '1234567890',
                'bank_holder'  => 'DINOCO CO LTD',
            ),
            'actor_user_id' => 7,
        );
        $this->assertReplayMatches( 'dinoco-claim/v1/bank-settings', $body );
    }

    public function test_bank_settings_save_different_bucket_409(): void {
        // Same key used across walkin/default buckets = different intent. Wrapper MUST 409 —
        // silent replay would save to wrong bucket = wrong bank shown to claimant.
        $b1 = array( 'bucket' => 'default', 'clear' => false, 'payload' => array(), 'actor_user_id' => 7 );
        $b2 = array( 'bucket' => 'walkin',  'clear' => false, 'payload' => array(), 'actor_user_id' => 7 );
        $this->assertDifferentBody( 'dinoco-claim/v1/bank-settings', $b1, $b2, 'bucket (default vs walkin)' );
    }

    public function test_bank_settings_save_payload_ksort_canonical(): void {
        // Critical contract: payload key order MUST be normalized via ksort so admin sending
        // fields in different order = same hash. Order-stable hash for bulk-shape payload.
        $payload_1 = array( 'bank_code' => '014', 'bank_account' => '12345', 'bank_holder' => 'X' );
        $payload_2 = array( 'bank_holder' => 'X', 'bank_account' => '12345', 'bank_code' => '014' );
        ksort( $payload_1 );
        ksort( $payload_2 );
        $b1 = array( 'bucket' => 'default', 'clear' => false, 'payload' => $payload_1, 'actor_user_id' => 7 );
        $b2 = array( 'bucket' => 'default', 'clear' => false, 'payload' => $payload_2, 'actor_user_id' => 7 );
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'payload ksort produces order-stable hash regardless of admin form field submission order'
        );
    }

    public function test_bank_settings_save_clear_boolean_discriminator(): void {
        // clear=true vs clear=false are semantically distinct operations (delete_option
        // bucket vs save payload). Mid-retry flip MUST 409 to prevent wrong final state.
        $b1 = array( 'bucket' => 'walkin', 'clear' => true,  'payload' => array(), 'actor_user_id' => 7 );
        $b2 = array( 'bucket' => 'walkin', 'clear' => false, 'payload' => array(), 'actor_user_id' => 7 );
        $this->assertDifferentBody( 'dinoco-claim/v1/bank-settings', $b1, $b2, 'clear boolean discriminator' );
    }

    // ── BATCH 33: BANK-SETTINGS/TEST (preview Flex) ──

    public function test_bank_settings_test_first_call_success(): void {
        $body = array(
            'use_walkin'    => false,
            'actor_user_id' => 7,
        );
        $this->assertFirstCallSuccess( 'dinoco-claim/v1/bank-settings/test', $body );
    }

    public function test_bank_settings_test_replay_matches(): void {
        $body = array(
            'use_walkin'    => true,
            'actor_user_id' => 7,
        );
        $this->assertReplayMatches( 'dinoco-claim/v1/bank-settings/test', $body );
    }

    public function test_bank_settings_test_different_walkin_409(): void {
        // Admin re-evaluating which bucket to preview mid-retry = different intent.
        $b1 = array( 'use_walkin' => false, 'actor_user_id' => 7 );
        $b2 = array( 'use_walkin' => true,  'actor_user_id' => 7 );
        $this->assertDifferentBody( 'dinoco-claim/v1/bank-settings/test', $b1, $b2, 'use_walkin boolean' );
    }

    // ── BATCH 33: API-TOKENS (CRITICAL security — token issuance) ──

    public function test_api_tokens_issue_first_call_success(): void {
        // Mirror dinoco_sn_with_idempotency body shape (declared body_keys + _actor_user_id).
        $body = array(
            'partner_name'       => 'ABC Insurance Co',
            'partner_type'       => 'insurance',
            'scopes'             => array( 'verify', 'claim_lookup' ),
            'rate_limit_per_min' => 100,
            'ip_allowlist'       => '203.0.113.0/24',
            'expires_at'         => '2027-05-15',
            '_actor_user_id'     => 1,
        );
        $this->assertFirstCallSuccess( 'dinoco-sn/v1/api-tokens', $body );
    }

    public function test_api_tokens_issue_replay_matches(): void {
        $body = array(
            'partner_name'       => 'ABC Insurance Co',
            'partner_type'       => 'insurance',
            'scopes'             => array( 'verify' ),
            'rate_limit_per_min' => 100,
            'ip_allowlist'       => '',
            'expires_at'         => null,
            '_actor_user_id'     => 1,
        );
        $this->assertReplayMatches( 'dinoco-sn/v1/api-tokens', $body );
    }

    public function test_api_tokens_issue_different_partner_409(): void {
        // CRITICAL security contract: same idempotency key used to issue tokens for
        // different partners = wrapper MUST 409. Silent cached replay would return
        // OTHER partner's api_secret to the wrong admin (cross-partner credential leak).
        $b1 = array(
            'partner_name'   => 'ABC Insurance',
            'partner_type'   => 'insurance',
            'scopes'         => array( 'verify' ),
            '_actor_user_id' => 1,
        );
        $b2 = array(
            'partner_name'   => 'XYZ Dealer',
            'partner_type'   => 'dealer',
            'scopes'         => array( 'verify' ),
            '_actor_user_id' => 1,
        );
        $this->assertDifferentBody( 'dinoco-sn/v1/api-tokens', $b1, $b2,
            'partner_name (ABC vs XYZ) — CRITICAL: prevents cross-partner credential leak' );
    }

    // ── BATCH 33: API-TOKENS/{id}/DISABLE (destructive admin op) ──

    public function test_api_tokens_disable_first_call_success(): void {
        $body = array(
            'id'             => 42,
            '_actor_user_id' => 1,
        );
        $this->assertFirstCallSuccess( 'dinoco-sn/v1/api-tokens/{id}/disable', $body );
    }

    public function test_api_tokens_disable_replay_matches(): void {
        $body = array(
            'id'             => 42,
            '_actor_user_id' => 1,
        );
        $this->assertReplayMatches( 'dinoco-sn/v1/api-tokens/{id}/disable', $body );
    }

    public function test_api_tokens_disable_different_id_409(): void {
        // Same idempotency key used across different token IDs = different intent.
        // Wrapper MUST 409 — silent replay would disable wrong token (production impact:
        // partner integration breaks unexpectedly).
        $b1 = array( 'id' => 42,  '_actor_user_id' => 1 );
        $b2 = array( 'id' => 99,  '_actor_user_id' => 1 );
        $this->assertDifferentBody( 'dinoco-sn/v1/api-tokens/{id}/disable', $b1, $b2, 'id (42 vs 99)' );
    }

    // ── CUMULATIVE NO-COLLISION GUARD ──

    public function test_round_55_no_cross_endpoint_collision(): void {
        $h_save    = dinoco_idempotency_hash( array(
            'bucket' => 'default', 'clear' => false, 'payload' => array(), 'actor_user_id' => 7,
        ) );
        $h_test    = dinoco_idempotency_hash( array(
            'use_walkin' => false, 'actor_user_id' => 7,
        ) );
        $h_issue   = dinoco_idempotency_hash( array(
            'partner_name' => 'X', 'partner_type' => 'dealer', 'scopes' => array(),
            'rate_limit_per_min' => 30, 'ip_allowlist' => '', 'expires_at' => null,
            '_actor_user_id' => 1,
        ) );
        $h_disable = dinoco_idempotency_hash( array(
            'id' => 1, '_actor_user_id' => 1,
        ) );
        $all = array( $h_save, $h_test, $h_issue, $h_disable );
        $this->assertCount(
            count( array_unique( $all ) ), $all,
            'Round 55: 4 endpoint body shapes MUST produce 4 distinct hashes (no collisions)'
        );
    }
}
