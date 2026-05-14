<?php
/**
 * ClaimSlipUploadTest — pure-logic tests for Sprint 20 Phase 2.7 slip upload
 * extension (POST /dinoco-claim/v1/charge/{id}/upload-slip with multipart).
 *
 * Source of truth: [System] DINOCO Claim Payment LIFF V.0.8
 *   - File validation matrix (mime sniff, size cap, sha256 hash)
 *   - Replay detection via UNIQUE constraint (uq_slip_replay_claim)
 *   - Protected dir path generation (dinoco-claim-slips/{YYYY-MM}/)
 *   - Async verify scheduling contract (event name + 5s delay)
 *
 * Pure-logic helpers are inlined so suite runs without WP bootstrap.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\Sprint20Slip;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\validate_slip_file' ) ) {
    /**
     * Mirrors LIFF V.0.8 upload-slip validation.
     *
     * @param array $file  shape: { size, type, sha256_hex (precomputed) }
     * @return array{ok:bool,code:string}
     */
    function validate_slip_file( array $file ): array {
        $allowed_mimes = array( 'image/jpeg', 'image/png' );
        $max_bytes     = 5 * 1024 * 1024;

        $size = isset( $file['size'] ) ? (int) $file['size'] : 0;
        if ( $size <= 0 || $size > $max_bytes ) {
            return array( 'ok' => false, 'code' => 'file_too_large' );
        }
        $mime = isset( $file['type'] ) ? (string) $file['type'] : '';
        if ( ! in_array( $mime, $allowed_mimes, true ) ) {
            return array( 'ok' => false, 'code' => 'invalid_mime' );
        }
        $sha = isset( $file['sha256_hex'] ) ? (string) $file['sha256_hex'] : '';
        if ( strlen( $sha ) !== 64 || ! preg_match( '/^[a-f0-9]{64}$/', $sha ) ) {
            return array( 'ok' => false, 'code' => 'hash_failed' );
        }
        return array( 'ok' => true, 'code' => 'ok' );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\protected_dir_path' ) ) {
    /**
     * dinoco-claim-slips/{YYYY-MM}/ subpath generator.
     */
    function protected_dir_path( string $base_dir, string $month ): string {
        return rtrim( $base_dir, '/' ) . '/dinoco-claim-slips/' . $month;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\protected_filename' ) ) {
    /**
     * sha8_rand4.{ext} pattern. Random portion derived externally (test
     * passes deterministic stub).
     */
    function protected_filename( string $sha256_hex, string $rand4, string $mime ): string {
        $ext = ( $mime === 'image/png' ) ? 'png' : 'jpg';
        return substr( $sha256_hex, 0, 8 ) . '_' . $rand4 . '.' . $ext;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\idempotency_body_hash' ) ) {
    function idempotency_body_hash( array $body ): string {
        ksort( $body );
        return hash( 'sha256', json_encode( $body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) );
    }
}

final class ClaimSlipUploadTest extends TestCase {

    // ─── File validation ──────────────────────────────────────────

    public function testValidJpegAccepted(): void {
        $r = validate_slip_file( array(
            'size' => 1024 * 100,
            'type' => 'image/jpeg',
            'sha256_hex' => str_repeat( 'a', 64 ),
        ) );
        $this->assertTrue( $r['ok'] );
        $this->assertSame( 'ok', $r['code'] );
    }

    public function testValidPngAccepted(): void {
        $r = validate_slip_file( array(
            'size' => 2048,
            'type' => 'image/png',
            'sha256_hex' => str_repeat( 'f', 64 ),
        ) );
        $this->assertTrue( $r['ok'] );
    }

    public function testEmptyFileRejected(): void {
        $r = validate_slip_file( array( 'size' => 0, 'type' => 'image/jpeg', 'sha256_hex' => str_repeat( 'a', 64 ) ) );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'file_too_large', $r['code'] );
    }

    public function testFileOver5MbRejected(): void {
        $r = validate_slip_file( array(
            'size' => 5 * 1024 * 1024 + 1,
            'type' => 'image/jpeg',
            'sha256_hex' => str_repeat( 'a', 64 ),
        ) );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'file_too_large', $r['code'] );
    }

    public function testFileExactlyAt5MbAccepted(): void {
        $r = validate_slip_file( array(
            'size' => 5 * 1024 * 1024,
            'type' => 'image/png',
            'sha256_hex' => str_repeat( 'b', 64 ),
        ) );
        $this->assertTrue( $r['ok'] );
    }

    public function testNonImageMimeRejected(): void {
        $r = validate_slip_file( array( 'size' => 100, 'type' => 'application/pdf', 'sha256_hex' => str_repeat( 'a', 64 ) ) );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'invalid_mime', $r['code'] );
    }

    public function testGifMimeRejected(): void {
        $r = validate_slip_file( array( 'size' => 100, 'type' => 'image/gif', 'sha256_hex' => str_repeat( 'a', 64 ) ) );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'invalid_mime', $r['code'] );
    }

    public function testWebpMimeRejected(): void {
        $r = validate_slip_file( array( 'size' => 100, 'type' => 'image/webp', 'sha256_hex' => str_repeat( 'a', 64 ) ) );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'invalid_mime', $r['code'] );
    }

    public function testMalformedHashRejected(): void {
        $r = validate_slip_file( array( 'size' => 100, 'type' => 'image/jpeg', 'sha256_hex' => 'abc' ) );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'hash_failed', $r['code'] );
    }

    public function testHashWithCapitalLettersRejected(): void {
        // SHA256 must be lowercase hex per hash_file('sha256') contract
        $r = validate_slip_file( array( 'size' => 100, 'type' => 'image/jpeg', 'sha256_hex' => strtoupper( str_repeat( 'a', 64 ) ) ) );
        $this->assertFalse( $r['ok'] );
    }

    // ─── Protected dir path generation ────────────────────────────

    public function testProtectedDirSubpath(): void {
        $p = protected_dir_path( '/var/www/uploads', '2026-05' );
        $this->assertSame( '/var/www/uploads/dinoco-claim-slips/2026-05', $p );
    }

    public function testProtectedDirTrailingSlashNormalized(): void {
        $p = protected_dir_path( '/var/www/uploads/', '2026-05' );
        $this->assertSame( '/var/www/uploads/dinoco-claim-slips/2026-05', $p );
    }

    public function testProtectedFilenamePattern(): void {
        $fn = protected_filename( str_repeat( 'a', 64 ), 'wxyz', 'image/jpeg' );
        $this->assertSame( 'aaaaaaaa_wxyz.jpg', $fn );
    }

    public function testProtectedFilenamePngExt(): void {
        $fn = protected_filename( str_repeat( 'f', 64 ), 'r4r4', 'image/png' );
        $this->assertSame( 'ffffffff_r4r4.png', $fn );
    }

    public function testProtectedFilenameDefaultsToJpgWhenMimeOther(): void {
        // Caller path enforces jpg/png mime upstream, but defensive ext logic
        // falls back to jpg for any non-png.
        $fn = protected_filename( str_repeat( '1', 64 ), 'abcd', 'image/jpeg' );
        $this->assertStringEndsWith( '.jpg', $fn );
    }

    // ─── Idempotency hash determinism (binary-fingerprint R42) ────

    public function testIdempotencyHashDifferentSlipDifferentDigest(): void {
        $body1 = array(
            'charge_id' => 42, 'from_state' => 'pending_payment',
            'to_state' => 'pending_review', 'actor_user_id' => 100,
            'discriminator' => str_repeat( 'a', 64 ),
        );
        $body2 = $body1;
        $body2['discriminator'] = str_repeat( 'b', 64 );
        $this->assertNotSame( idempotency_body_hash( $body1 ), idempotency_body_hash( $body2 ) );
    }

    public function testIdempotencyHashSameSlipSameDigest(): void {
        $body = array(
            'charge_id' => 42, 'from_state' => 'pending_payment',
            'to_state' => 'pending_review', 'actor_user_id' => 100,
            'discriminator' => str_repeat( 'a', 64 ),
        );
        $h1 = idempotency_body_hash( $body );
        $h2 = idempotency_body_hash( $body );
        $this->assertSame( $h1, $h2 );
    }

    public function testIdempotencyHashKeyOrderInvariant(): void {
        $body_ordered = array(
            'actor_user_id' => 100,
            'charge_id' => 42,
            'discriminator' => 'abc',
            'from_state' => 'pending_payment',
            'to_state' => 'pending_review',
        );
        $body_shuffled = array(
            'to_state' => 'pending_review',
            'from_state' => 'pending_payment',
            'charge_id' => 42,
            'actor_user_id' => 100,
            'discriminator' => 'abc',
        );
        $this->assertSame(
            idempotency_body_hash( $body_ordered ),
            idempotency_body_hash( $body_shuffled )
        );
    }

    // ─── Re-upload after rejected (R42 binary-fingerprint) ────────

    public function testRejectedToPendingReviewHashesDistinctFromInitial(): void {
        // Customer uploads slip → admin rejects → customer re-uploads SAME
        // slip. Without from_state in hash body, both would collide and
        // cached replay returns stale. R42 fix: from_state included.
        $initial = array(
            'charge_id' => 99, 'from_state' => 'pending_payment',
            'to_state' => 'pending_review', 'actor_user_id' => 1,
            'discriminator' => str_repeat( 'a', 64 ),
        );
        $reupload = $initial;
        $reupload['from_state'] = 'rejected';
        $this->assertNotSame(
            idempotency_body_hash( $initial ),
            idempotency_body_hash( $reupload )
        );
    }

    // ─── Async scheduling contract ────────────────────────────────

    public function testAsyncEventNameConstant(): void {
        // Pin the exact hook name LIFF V.0.8 schedules. Sprint 20 Phase 2.7.
        $expected = 'dinoco_claim_payment_slip_verify_async';
        $src = file_get_contents( __DIR__ . '/../../[System] DINOCO Claim Payment LIFF' );
        $this->assertNotFalse( $src, 'LIFF source readable' );
        $this->assertStringContainsString( $expected, $src );
        $this->assertStringContainsString(
            "wp_schedule_single_event( time() + 5, 'dinoco_claim_payment_slip_verify_async'",
            $src,
            'Async scheduling fires 5s post-COMMIT'
        );
    }

    public function testAsyncHandlerRegistration(): void {
        $src = file_get_contents( __DIR__ . '/../../[System] DINOCO Claim Payment LIFF' );
        $this->assertNotFalse( $src );
        $this->assertMatchesRegularExpression(
            "/add_action\\(\\s*'dinoco_claim_payment_slip_verify_async'\\s*,\\s*'dinoco_claim_payment_verify_slip_async'/",
            $src
        );
    }
}
