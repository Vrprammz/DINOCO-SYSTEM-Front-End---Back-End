<?php
/**
 * IdempotencyTest — pure-logic test of Idempotency Helper foundation.
 *
 * Source: [Admin System] DINOCO Idempotency Helper V.1.0 (Round 18, 2026-04-29)
 *
 * Scope: We test the pure helpers (`dinoco_idempotency_hash` +
 * `dinoco_idempotency_extract_key`) in isolation — they need no WP/DB.
 * Integration tests for table install + check/store flow are deferred
 * to a future WP-integrated suite (no wpdb mock available here).
 *
 * Why these matter:
 *   - hash() is the FORENSIC primitive. If two retries with same key
 *     produce different hashes for IDENTICAL bodies → false 409 conflict
 *     → client gets stuck loop. If different bodies produce same hash →
 *     undetected mutation slip-through (silent data corruption).
 *   - extract_key() is the FIRST GATE. Bypass means caller skips replay
 *     entirely → idempotency is opt-out by accident.
 *   - 409 conflict semantics: same key + DIFFERENT body must surface to
 *     client (RFC draft compliance).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// Inline copy of helper under test (mirrors snippet — no DB/WP deps).
if ( ! function_exists( __NAMESPACE__ . '\\dinoco_idempotency_hash' ) ) {
    function dinoco_idempotency_hash( $body ) {
        if ( is_array( $body ) || is_object( $body ) ) {
            $serialized = json_encode( $body );
            if ( $serialized === false ) $serialized = '[encode_failed]';
        } elseif ( is_scalar( $body ) ) {
            $serialized = (string) $body;
        } else {
            $serialized = '';
        }
        return hash( 'sha256', $serialized );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_idempotency_extract_key_logic' ) ) {
    /**
     * Pure validation logic extracted from extract_key() — operates on the
     * raw header string, no WP_REST_Request dependency.
     */
    function dinoco_idempotency_extract_key_logic( $raw ) {
        $key = trim( (string) $raw );
        if ( $key === '' ) return '';
        if ( strlen( $key ) > 64 ) return '';
        if ( ! preg_match( '/^[A-Za-z0-9._-]+$/', $key ) ) return '';
        return $key;
    }
}

class IdempotencyTest extends TestCase {

    // ════════════════════════════════════════════════════════════════
    // HASH — body normalization + collision protection
    // ════════════════════════════════════════════════════════════════

    public function test_hash_produces_64_char_sha256_hex(): void {
        $h = dinoco_idempotency_hash( array( 'foo' => 'bar' ) );
        $this->assertSame( 64, strlen( $h ) );
        $this->assertMatchesRegularExpression( '/^[a-f0-9]{64}$/', $h );
    }

    public function test_hash_identical_body_produces_identical_hash(): void {
        // Foundation test — same body MUST produce same hash to enable replay
        $body = array( 'order_id' => 12345, 'qty' => 3 );
        $h1 = dinoco_idempotency_hash( $body );
        $h2 = dinoco_idempotency_hash( $body );
        $this->assertSame( $h1, $h2 );
    }

    public function test_hash_different_body_produces_different_hash(): void {
        // Critical security test — collision = silent data corruption
        $h1 = dinoco_idempotency_hash( array( 'qty' => 3 ) );
        $h2 = dinoco_idempotency_hash( array( 'qty' => 4 ) );
        $this->assertNotSame( $h1, $h2 );
    }

    public function test_hash_null_body_is_empty_string_hash(): void {
        // null → '' → SHA256('') is well-known constant
        // Documented constant: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        $h = dinoco_idempotency_hash( null );
        $this->assertSame(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            $h
        );
    }

    public function test_hash_string_body_passes_through(): void {
        // POST body as raw JSON string (common API pattern)
        $body = '{"order_id":12345}';
        $h_string = dinoco_idempotency_hash( $body );
        $h_raw    = hash( 'sha256', $body );
        $this->assertSame( $h_raw, $h_string );
    }

    public function test_hash_int_body_coerced_to_string(): void {
        // Scalar coercion — int 42 should hash same as "42" string
        $h_int = dinoco_idempotency_hash( 42 );
        $h_str = dinoco_idempotency_hash( '42' );
        $this->assertSame( $h_int, $h_str );
    }

    public function test_hash_bool_true_coerced_to_string_one(): void {
        // bool true → string "1"
        $h_bool = dinoco_idempotency_hash( true );
        $h_str  = dinoco_idempotency_hash( '1' );
        $this->assertSame( $h_bool, $h_str );
    }

    public function test_hash_array_key_order_matters(): void {
        // We do NOT alphabetize — same client should produce same byte
        // sequence on retry. Different key order = real client bug → 409.
        $h1 = dinoco_idempotency_hash( array( 'a' => 1, 'b' => 2 ) );
        $h2 = dinoco_idempotency_hash( array( 'b' => 2, 'a' => 1 ) );
        $this->assertNotSame( $h1, $h2,
            'Hash MUST be order-sensitive (RFC draft expects byte-equality)' );
    }

    public function test_hash_nested_array_serializes(): void {
        // PO body has nested items array — must hash without crashing
        $body = array(
            'items' => array(
                array( 'sku' => 'SET_A', 'qty' => 2 ),
                array( 'sku' => 'LEAF_B', 'qty' => 5 ),
            ),
            'tier' => 'gold',
        );
        $h = dinoco_idempotency_hash( $body );
        $this->assertSame( 64, strlen( $h ) );
    }

    public function test_hash_empty_array_distinct_from_null(): void {
        // [] → '[]' (2 bytes) vs null → '' (0 bytes). Distinct hashes.
        $h_empty = dinoco_idempotency_hash( array() );
        $h_null  = dinoco_idempotency_hash( null );
        $this->assertNotSame( $h_empty, $h_null );
    }

    public function test_hash_object_serializes_via_json(): void {
        // (object) cast for stdClass → JSON encoded, hashed
        $obj = (object) array( 'flag' => 'on', 'count' => 3 );
        $h = dinoco_idempotency_hash( $obj );
        $this->assertSame( 64, strlen( $h ) );
        // Equivalent assoc array MUST produce SAME hash (json_encode treats
        // both as object literal {})
        $arr_h = dinoco_idempotency_hash( array( 'flag' => 'on', 'count' => 3 ) );
        $this->assertSame( $arr_h, $h );
    }

    public function test_hash_unicode_thai_string(): void {
        // Reasons may include Thai — must not crash + must produce deterministic hash
        $body = array( 'reason' => 'ยกเลิกตามคำขอลูกค้า' );
        $h1 = dinoco_idempotency_hash( $body );
        $h2 = dinoco_idempotency_hash( $body );
        $this->assertSame( $h1, $h2 );
        $this->assertSame( 64, strlen( $h1 ) );
    }

    // ════════════════════════════════════════════════════════════════
    // EXTRACT KEY — header validation
    // ════════════════════════════════════════════════════════════════

    public function test_extract_key_uuid_v4_passes(): void {
        // RFC 4122 UUID v4 (36 chars including dashes)
        $key = '550e8400-e29b-41d4-a716-446655440000';
        $this->assertSame( $key, dinoco_idempotency_extract_key_logic( $key ) );
    }

    public function test_extract_key_ulid_passes(): void {
        // ULID Crockford base32 (26 chars)
        $key = '01F8MECHZX3TBDSZ7XRADM79XE';
        $this->assertSame( $key, dinoco_idempotency_extract_key_logic( $key ) );
    }

    public function test_extract_key_empty_string_rejected(): void {
        $this->assertSame( '', dinoco_idempotency_extract_key_logic( '' ) );
    }

    public function test_extract_key_whitespace_only_rejected(): void {
        $this->assertSame( '', dinoco_idempotency_extract_key_logic( '   ' ) );
    }

    public function test_extract_key_whitespace_trimmed(): void {
        // Common HTTP client gotcha — trailing newline etc.
        $this->assertSame( 'abc-123', dinoco_idempotency_extract_key_logic( '  abc-123  ' ) );
    }

    public function test_extract_key_too_long_rejected(): void {
        // 65 chars (> 64 cap) — abuse vector, silent reject
        $key = str_repeat( 'a', 65 );
        $this->assertSame( '', dinoco_idempotency_extract_key_logic( $key ) );
    }

    public function test_extract_key_exactly_64_chars_passes(): void {
        // Boundary — 64 chars allowed (e.g. SHA256 hex)
        $key = str_repeat( 'a', 64 );
        $this->assertSame( $key, dinoco_idempotency_extract_key_logic( $key ) );
    }

    public function test_extract_key_special_chars_rejected(): void {
        // Injection vectors — quotes, semicolons, spaces, slashes
        $this->assertSame( '', dinoco_idempotency_extract_key_logic( "abc';DROP" ) );
        $this->assertSame( '', dinoco_idempotency_extract_key_logic( 'abc xyz' ) );
        $this->assertSame( '', dinoco_idempotency_extract_key_logic( 'abc/xyz' ) );
        $this->assertSame( '', dinoco_idempotency_extract_key_logic( 'abc<script>' ) );
    }

    public function test_extract_key_alphanumeric_dash_underscore_dot_allowed(): void {
        // Whitelist chars all pass
        $this->assertSame( 'ABC.123_xyz-foo', dinoco_idempotency_extract_key_logic( 'ABC.123_xyz-foo' ) );
    }

    public function test_extract_key_unicode_rejected(): void {
        // Non-ASCII chars → reject (forces clients to use safe encoding)
        $this->assertSame( '', dinoco_idempotency_extract_key_logic( 'คำสั่งซื้อ001' ) );
    }

    public function test_extract_key_single_char_passes(): void {
        // Boundary — 1 char allowed
        $this->assertSame( 'a', dinoco_idempotency_extract_key_logic( 'a' ) );
    }

    // ════════════════════════════════════════════════════════════════
    // CONFLICT DETECTION (hash mismatch logic)
    // ════════════════════════════════════════════════════════════════

    public function test_conflict_detection_via_hash_mismatch(): void {
        // Foundation test for 409 conflict path:
        // If old hash != new hash → check() returns WP_Error 409
        $original = array( 'qty' => 3 );
        $retry    = array( 'qty' => 4 );
        $h_orig   = dinoco_idempotency_hash( $original );
        $h_retry  = dinoco_idempotency_hash( $retry );
        $this->assertNotSame( $h_orig, $h_retry,
            'Hash mismatch is the ONLY signal for 409 conflict — must be reliable' );
    }

    public function test_no_conflict_for_identical_retry(): void {
        // Same body retry → same hash → cached replay (no 409)
        $body = array( 'order_id' => 12345, 'items' => array( array( 'sku' => 'A', 'qty' => 1 ) ) );
        $h1 = dinoco_idempotency_hash( $body );
        $h2 = dinoco_idempotency_hash( $body );
        $this->assertSame( $h1, $h2 );
    }
}
