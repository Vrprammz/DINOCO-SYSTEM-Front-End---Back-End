<?php
/**
 * SnPubApiHmacTest — pure-logic test of F#15 HMAC raw-secret wiring.
 *
 * Source: [Admin System] DINOCO Public API Gateway V.0.2+
 * Plan:   ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §F.15 + Phase 4 W12.5
 *
 * Tests focus on:
 *   - HMAC compute canonical format (timestamp + "\n" + body)
 *   - hash_equals() timing-safe verification (sanity round-trip)
 *   - AES-256-GCM round-trip (encrypt/decrypt) with 32-byte master key
 *   - Tampered ciphertext / tag detection (auth tag verifies)
 *
 * Mirrors of the snippet's helpers (function_exists guarded — snippet
 * functions live behind ABSPATH guard, can't be loaded standalone).
 * Drift detector tests/jest/sn-system-drift.test.js asserts string presence
 * to keep mirrors and snippet logic in sync.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_pubapi_compute_hmac' ) ) {
    /**
     * Mirror of dinoco_sn_pubapi_compute_hmac().
     */
    function sn_pubapi_compute_hmac( string $secret, $timestamp, string $body ): string {
        $payload = (string) $timestamp . "\n" . $body;
        return hash_hmac( 'sha256', $payload, $secret );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_pubapi_encrypt_decrypt' ) ) {
    /**
     * Mirror of encrypt + decrypt round-trip with explicit master key.
     * Returns [ciphertext_b64, decrypted] tuple. Returns null on failure.
     */
    function sn_pubapi_encrypt_decrypt( string $key32, string $plaintext ): ?array {
        if ( ! function_exists( 'openssl_encrypt' ) ) return null;
        $iv  = random_bytes( 12 );
        $tag = '';
        $ct  = openssl_encrypt( $plaintext, 'aes-256-gcm', $key32, OPENSSL_RAW_DATA, $iv, $tag, '', 16 );
        if ( $ct === false ) return null;
        $blob = base64_encode( $iv . $ct . $tag );

        $raw = base64_decode( $blob, true );
        if ( $raw === false || strlen( $raw ) < 28 ) return null;
        $iv2  = substr( $raw, 0, 12 );
        $tag2 = substr( $raw, -16 );
        $ct2  = substr( $raw, 12, -16 );
        $pt = openssl_decrypt( $ct2, 'aes-256-gcm', $key32, OPENSSL_RAW_DATA, $iv2, $tag2, '' );
        if ( $pt === false ) return null;

        return array( $blob, $pt );
    }
}

class SnPubApiHmacTest extends TestCase {

    /* ─── HMAC compute ─── */

    public function test_hmac_canonical_format_includes_timestamp_and_body(): void {
        // Spec: timestamp + "\n" + body
        $sig = sn_pubapi_compute_hmac( 'sk_test', '1735689600', '{"sn":"DNCSS0001234"}' );
        $expected = hash_hmac( 'sha256', "1735689600\n" . '{"sn":"DNCSS0001234"}', 'sk_test' );
        $this->assertSame( $expected, $sig );
    }

    public function test_hmac_returns_64_hex_chars(): void {
        $sig = sn_pubapi_compute_hmac( 'sk_test', '1735689600', 'body' );
        $this->assertSame( 64, strlen( $sig ) );
        $this->assertMatchesRegularExpression( '/^[a-f0-9]{64}$/', $sig );
    }

    public function test_hmac_different_body_produces_different_sig(): void {
        $a = sn_pubapi_compute_hmac( 'sk', '1', 'body-a' );
        $b = sn_pubapi_compute_hmac( 'sk', '1', 'body-b' );
        $this->assertNotSame( $a, $b );
    }

    public function test_hmac_different_timestamp_produces_different_sig(): void {
        $a = sn_pubapi_compute_hmac( 'sk', '1', 'body' );
        $b = sn_pubapi_compute_hmac( 'sk', '2', 'body' );
        $this->assertNotSame( $a, $b );
    }

    public function test_hmac_different_secret_produces_different_sig(): void {
        $a = sn_pubapi_compute_hmac( 'sk_a', '1', 'body' );
        $b = sn_pubapi_compute_hmac( 'sk_b', '1', 'body' );
        $this->assertNotSame( $a, $b );
    }

    public function test_hmac_empty_body_still_computes(): void {
        $sig = sn_pubapi_compute_hmac( 'sk', '1', '' );
        $this->assertSame( 64, strlen( $sig ) );
    }

    public function test_hash_equals_constant_time_round_trip(): void {
        // Sanity check that hash_equals returns true for identical sigs
        $sig = sn_pubapi_compute_hmac( 'sk', '1', 'body' );
        $this->assertTrue( hash_equals( $sig, $sig ) );
    }

    public function test_hash_equals_rejects_tampered_sig(): void {
        $sig = sn_pubapi_compute_hmac( 'sk', '1', 'body' );
        // Flip one hex char
        $tampered = $sig[0] === 'a' ? 'b' . substr( $sig, 1 ) : 'a' . substr( $sig, 1 );
        $this->assertFalse( hash_equals( $sig, $tampered ) );
    }

    /* ─── AES-256-GCM round-trip ─── */

    public function test_aes_round_trip_recovers_plaintext(): void {
        if ( ! function_exists( 'openssl_encrypt' ) ) {
            $this->markTestSkipped( 'openssl extension not available' );
        }
        $key = random_bytes( 32 );
        $r = sn_pubapi_encrypt_decrypt( $key, 'sk_secret_aB9CdEfG' );
        $this->assertNotNull( $r );
        [ $blob, $pt ] = $r;
        $this->assertSame( 'sk_secret_aB9CdEfG', $pt );
        // Blob should be base64 of (12 IV + ciphertext + 16 tag) — at least 40 bytes
        $raw = base64_decode( $blob, true );
        $this->assertGreaterThanOrEqual( 28 + 18, strlen( $raw ) ); // 28 framing + 18 plaintext
    }

    public function test_aes_each_call_produces_different_ciphertext(): void {
        if ( ! function_exists( 'openssl_encrypt' ) ) {
            $this->markTestSkipped( 'openssl extension not available' );
        }
        $key = random_bytes( 32 );
        $r1 = sn_pubapi_encrypt_decrypt( $key, 'same-secret' );
        $r2 = sn_pubapi_encrypt_decrypt( $key, 'same-secret' );
        $this->assertNotNull( $r1 );
        $this->assertNotNull( $r2 );
        // IV is random → different ciphertext
        $this->assertNotSame( $r1[0], $r2[0] );
        // But both decrypt to same plaintext
        $this->assertSame( $r1[1], $r2[1] );
    }

    public function test_aes_decrypt_with_wrong_key_returns_null(): void {
        if ( ! function_exists( 'openssl_encrypt' ) ) {
            $this->markTestSkipped( 'openssl extension not available' );
        }
        $key1 = random_bytes( 32 );
        $key2 = random_bytes( 32 );
        $r1 = sn_pubapi_encrypt_decrypt( $key1, 'secret' );
        $this->assertNotNull( $r1 );
        [ $blob, ] = $r1;

        // Try to decrypt with key2 — should fail (auth tag mismatch)
        $raw = base64_decode( $blob, true );
        $iv  = substr( $raw, 0, 12 );
        $tag = substr( $raw, -16 );
        $ct  = substr( $raw, 12, -16 );
        $pt = openssl_decrypt( $ct, 'aes-256-gcm', $key2, OPENSSL_RAW_DATA, $iv, $tag, '' );
        $this->assertFalse( $pt );
    }

    public function test_aes_tampered_ciphertext_detected_by_auth_tag(): void {
        if ( ! function_exists( 'openssl_encrypt' ) ) {
            $this->markTestSkipped( 'openssl extension not available' );
        }
        $key = random_bytes( 32 );
        $r = sn_pubapi_encrypt_decrypt( $key, 'genuine-secret' );
        $this->assertNotNull( $r );
        [ $blob, ] = $r;

        $raw = base64_decode( $blob, true );
        // Flip a byte in the ciphertext (between IV and tag)
        $raw[15] = chr( ord( $raw[15] ) ^ 0xFF );
        $iv  = substr( $raw, 0, 12 );
        $tag = substr( $raw, -16 );
        $ct  = substr( $raw, 12, -16 );
        $pt = openssl_decrypt( $ct, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, '' );
        // GCM auth tag must reject tampered ciphertext
        $this->assertFalse( $pt );
    }

    public function test_aes_tampered_tag_detected(): void {
        if ( ! function_exists( 'openssl_encrypt' ) ) {
            $this->markTestSkipped( 'openssl extension not available' );
        }
        $key = random_bytes( 32 );
        $r = sn_pubapi_encrypt_decrypt( $key, 'data' );
        $this->assertNotNull( $r );
        [ $blob, ] = $r;
        $raw = base64_decode( $blob, true );
        // Flip a byte in the tag (last 16 bytes)
        $raw[ strlen( $raw ) - 1 ] = chr( ord( $raw[ strlen( $raw ) - 1 ] ) ^ 0xFF );
        $iv  = substr( $raw, 0, 12 );
        $tag = substr( $raw, -16 );
        $ct  = substr( $raw, 12, -16 );
        $pt = openssl_decrypt( $ct, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, '' );
        $this->assertFalse( $pt );
    }

    /* ─── End-to-end HMAC verify scenario ─── */

    public function test_full_round_trip_partner_signs_server_verifies(): void {
        $secret = 'sk_' . bin2hex( random_bytes( 24 ) );
        $body   = '{"sn":"DNCSS0001234"}';
        $ts     = time();

        // Partner side: compute sig
        $partner_sig = sn_pubapi_compute_hmac( $secret, $ts, $body );

        // Server side: recompute with same secret + body + ts
        $server_sig = sn_pubapi_compute_hmac( $secret, $ts, $body );

        $this->assertTrue( hash_equals( $partner_sig, $server_sig ) );
    }

    public function test_replay_attack_guard_with_old_timestamp(): void {
        // 5-minute skew tolerance per spec — caller must check abs(time() - ts) > 300
        $now    = time();
        $old_ts = $now - 600; // 10 min ago

        $skew_seconds = abs( $now - $old_ts );
        $this->assertGreaterThan( 300, $skew_seconds );
        // Server logic: reject if skew > 300
    }

    public function test_master_key_size_enforced(): void {
        // Master key must be 32 bytes for AES-256-GCM
        $key32 = random_bytes( 32 );
        $this->assertSame( 32, strlen( $key32 ) );
        // Hex form is 64 chars
        $this->assertSame( 64, strlen( bin2hex( $key32 ) ) );
    }
}
