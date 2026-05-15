<?php
/**
 * IdempotencyRound58Test — DRY contract tests for Round 58 batch 36 (1 endpoint).
 *
 * Source: Round 58 (2026-05-15) — 🎯 **90% MAJOR MILESTONE REACHED** (177/196 = 90.3%).
 *
 *   Batch 36 = micro-batch single-endpoint close-out for milestone:
 *     - POST /b2f/v1/settings — admin B2F shipping destination settings save.
 *       Bulk-shape {payload ksort-normalized, actor_user_id}.
 *
 * Milestone arc: 50% (R42) → 60% (R46) → 70% (R50) → 80% (R54) → 85% (R56) → **90% (R58)**
 * — 6 milestones crossed in 16 rounds.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound58Test extends IdempotencyTestFixture {

    public function test_b2f_settings_first_call_success(): void {
        $payload = array(
            'b2f_shipping_dest_land' => '21/106 Lat Phrao 15',
            'b2f_shipping_dest_sea'  => 'Bangkok Port Terminal A',
        );
        ksort( $payload );
        $body = array( 'payload' => $payload, 'actor_user_id' => 7 );
        $this->assertFirstCallSuccess( 'b2f/v1/settings', $body );
    }

    public function test_b2f_settings_replay_matches(): void {
        $payload = array( 'b2f_shipping_dest_land' => 'X', 'b2f_shipping_dest_sea' => 'Y' );
        ksort( $payload );
        $body = array( 'payload' => $payload, 'actor_user_id' => 7 );
        $this->assertReplayMatches( 'b2f/v1/settings', $body );
    }

    public function test_b2f_settings_payload_ksort_canonical(): void {
        // ksort produces order-stable hash regardless of admin form field order.
        $p1 = array( 'b2f_shipping_dest_sea' => 'Y', 'b2f_shipping_dest_land' => 'X' );
        $p2 = array( 'b2f_shipping_dest_land' => 'X', 'b2f_shipping_dest_sea' => 'Y' );
        ksort( $p1 ); ksort( $p2 );
        $b1 = array( 'payload' => $p1, 'actor_user_id' => 7 );
        $b2 = array( 'payload' => $p2, 'actor_user_id' => 7 );
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'payload ksort produces order-stable hash'
        );
    }

    public function test_b2f_settings_different_value_409(): void {
        // Admin re-evaluating shipping destination value mid-retry = different intent.
        $p1 = array( 'b2f_shipping_dest_land' => 'Bangkok' );
        $p2 = array( 'b2f_shipping_dest_land' => 'Chiang Mai' );
        ksort( $p1 ); ksort( $p2 );
        $b1 = array( 'payload' => $p1, 'actor_user_id' => 7 );
        $b2 = array( 'payload' => $p2, 'actor_user_id' => 7 );
        $this->assertDifferentBody( 'b2f/v1/settings', $b1, $b2,
            'shipping destination value mid-retry → 409 (admin re-evaluated)' );
    }

    public function test_milestone_90_pct_no_collision_with_r57(): void {
        // R58 b2f/settings must not collide with R57 dinoco/v1 settings bulk shapes.
        $h_b2f   = dinoco_idempotency_hash( array(
            'payload' => array( 'b2f_shipping_dest_land' => 'X' ),
            'actor_user_id' => 7,
        ) );
        $h_audit = dinoco_idempotency_hash( array(
            'action' => 'audit-retention-run', 'dry_run' => false, 'actor_user_id' => 7,
        ) );
        $this->assertNotSame( $h_b2f, $h_audit,
            'b2f/settings (bulk-shape) MUST NOT collide with audit-retention-run (constant-marker)' );
    }
}
