<?php
/**
 * IdempotencyTestFixture — DRY base class for endpoint contract tests.
 *
 * Source: Round 29 (2026-04-30) — refactor of repetitive 3-assertion test pattern
 * (identical hash / different field different hash / no-collision). Each integrated
 * endpoint typically writes 3-9 contract tests with near-identical structure:
 *
 *   public function test_X_identical_body_same_hash(): void {
 *       $b1 = $this->X_body();
 *       $b2 = $this->X_body();
 *       $this->assertSame( hash($b1), hash($b2), 'message...' );
 *   }
 *   public function test_X_different_field_different_hash(): void {
 *       $b1 = $this->X_body();
 *       $b2 = $this->X_body( array( 'field' => 'other' ) );
 *       $this->assertNotSame( hash($b1), hash($b2), 'message...' );
 *   }
 *
 * The fixture extracts that into 3 helpers callable in 1 line:
 *
 *   $this->assertReplayMatches( 'place-order', $body );          // identical → same
 *   $this->assertDifferentBody( 'place-order', $body, $variant ); // different → different
 *   $this->assertFirstCallSuccess( 'place-order', $body );        // hash is valid SHA-256 hex
 *   $this->assertKeyTooShortRejected( 'place-order', $body, '' ); // key validation
 *
 * Round 29 contract tests use this fixture (~5 LOC each vs ~25 LOC inline before).
 *
 * Why a fixture (not a trait): PHPUnit assertion helpers + cumulative no-collision
 * tracking benefit from a base class with `setUpBeforeClass`/`tearDownAfterClass`
 * lifecycle hooks. Future expansions (e.g. Round 30+ may track replay TTL boundaries)
 * can attach state to the class without polluting per-endpoint tests.
 *
 * Tests should EITHER extend this fixture (new Round 29+ shapes) OR keep the legacy
 * inline pattern for already-shipped Round 19-28 tests (we don't refactor passing tests).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// Reuse hash helper from IdempotencyTest — same namespace
require_once __DIR__ . '/IdempotencyTest.php';

abstract class IdempotencyTestFixture extends TestCase {

    /**
     * Assert that running hash on the same body twice gives the same hash.
     * Replay safety = idempotency works.
     *
     * @param string $endpoint Human-readable name for failure messages.
     * @param array  $body    Canonical body shape under test.
     */
    protected function assertReplayMatches( string $endpoint, array $body ): void {
        $h1 = dinoco_idempotency_hash( $body );
        $h2 = dinoco_idempotency_hash( $body );
        $this->assertSame(
            $h1, $h2,
            "[{$endpoint}] Identical bodies MUST produce same hash for replay (got {$h1} vs {$h2})"
        );
    }

    /**
     * Assert that two bodies with semantically different content produce different hashes.
     * Discriminator validation = same key + different body MUST trigger 409.
     *
     * @param string $endpoint     Human-readable name for failure messages.
     * @param array  $body         Baseline canonical body.
     * @param array  $variant_body Variant body that differs in at least one semantic field.
     * @param string $field_label  Optional name of the changed field (for message clarity).
     */
    protected function assertDifferentBody(
        string $endpoint,
        array $body,
        array $variant_body,
        string $field_label = ''
    ): void {
        $h1 = dinoco_idempotency_hash( $body );
        $h2 = dinoco_idempotency_hash( $variant_body );
        $field_msg = $field_label !== '' ? " (field: {$field_label})" : '';
        $this->assertNotSame(
            $h1, $h2,
            "[{$endpoint}] Different bodies MUST produce different hashes{$field_msg} — collision = silent data corruption"
        );
    }

    /**
     * Assert that the hash output is a 64-char SHA-256 hex string for the body.
     * First-call success = the helper produces a usable hash for storage.
     *
     * @param string $endpoint Human-readable name for failure messages.
     * @param array  $body    Body to hash.
     */
    protected function assertFirstCallSuccess( string $endpoint, array $body ): void {
        $h = dinoco_idempotency_hash( $body );
        $this->assertSame(
            64, strlen( $h ),
            "[{$endpoint}] Hash MUST be 64-char SHA-256 hex (got " . strlen( $h ) . " chars)"
        );
        $this->assertMatchesRegularExpression(
            '/^[a-f0-9]{64}$/', $h,
            "[{$endpoint}] Hash MUST be hex-only (got: {$h})"
        );
    }

    /**
     * Assert that the extract_key_logic correctly rejects short/empty/invalid keys.
     * Key validation gate = malformed clients can't bypass replay checks.
     *
     * @param string $endpoint  Human-readable name for failure messages.
     * @param string $bad_key  Key value that should be rejected (empty / too long / bad chars).
     * @param string $reason   Why we expect rejection (for message clarity).
     */
    protected function assertKeyTooShortRejected(
        string $endpoint,
        string $bad_key,
        string $reason = ''
    ): void {
        $reason_msg = $reason !== '' ? " ({$reason})" : '';
        $result = dinoco_idempotency_extract_key_logic( $bad_key );
        $this->assertSame(
            '', $result,
            "[{$endpoint}] extract_key MUST reject malformed key{$reason_msg} — got: '{$result}'"
        );
    }

    /**
     * Assert that an array of body hashes contains no collisions.
     * Used for cumulative no-collision tests at end of each round.
     *
     * @param string $round_label Label for the round (e.g. "Round 29").
     * @param array  $body_map   ['endpoint_name' => $body_array, ...]
     */
    protected function assertNoCollisionsInRound( string $round_label, array $body_map ): void {
        $hashes = array();
        foreach ( $body_map as $name => $body ) {
            $hashes[ $name ] = dinoco_idempotency_hash( $body );
        }
        $unique_count = count( array_unique( $hashes ) );
        $expected = count( $body_map );
        $this->assertSame(
            $expected, $unique_count,
            "[{$round_label}] All {$expected} endpoint body shapes MUST hash differently. Got hashes: " . print_r( $hashes, true )
        );
    }
}
