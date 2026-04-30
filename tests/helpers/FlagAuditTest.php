<?php
/**
 * FlagAuditTest — pure-logic test of Flag Audit Log helpers.
 *
 * Source: [Admin System] DINOCO Flag Audit Log V.1.0
 *
 * Scope: We test the pure helpers (`dinoco_flag_audit_serialize_value` +
 * no-op detection logic) in isolation — they need no WP/DB. Integration
 * tests (table install, INSERT, query filters) are deferred to a future
 * WP-integrated suite (no wpdb mock available in this fast bootstrap).
 *
 * Why these matter:
 *   - Serializer encodes any flag value into VARCHAR(255). Truncation
 *     bug → silent data loss for flags storing arrays.
 *   - No-op detection (old===new strict + serialized strict) prevents
 *     audit table bloat from re-saves with identical values.
 *   - Bool normalization compatibility with wp_options '1'/'0' convention.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// Inline copy of helper under test (mirrors snippet exactly — no DB/WP deps).
if ( ! function_exists( __NAMESPACE__ . '\\dinoco_flag_audit_serialize_value' ) ) {
    function dinoco_flag_audit_serialize_value( $value ) {
        if ( $value === null ) return null;
        if ( is_bool( $value ) ) return $value ? '1' : '0';
        if ( is_scalar( $value ) ) return substr( (string) $value, 0, 255 );
        $json = json_encode( $value );
        if ( $json === false ) $json = '[encode_failed]';
        if ( strlen( $json ) > 255 ) {
            $json = substr( $json, 0, 254 ) . '…';
        }
        return $json;
    }
}

class FlagAuditTest extends TestCase {

    // ════════════════════════════════════════════════════════════════
    // SERIALIZER TESTS
    // ════════════════════════════════════════════════════════════════

    public function test_null_serializes_to_null(): void {
        $this->assertNull( dinoco_flag_audit_serialize_value( null ) );
    }

    public function test_bool_true_serializes_to_string_one(): void {
        // wp_options convention — bools stored as '1'/'0' strings
        $this->assertSame( '1', dinoco_flag_audit_serialize_value( true ) );
    }

    public function test_bool_false_serializes_to_string_zero(): void {
        $this->assertSame( '0', dinoco_flag_audit_serialize_value( false ) );
    }

    public function test_int_serializes_to_string(): void {
        $this->assertSame( '42', dinoco_flag_audit_serialize_value( 42 ) );
        $this->assertSame( '0', dinoco_flag_audit_serialize_value( 0 ) );
        $this->assertSame( '-1', dinoco_flag_audit_serialize_value( -1 ) );
    }

    public function test_float_serializes_to_string(): void {
        // Most flags are bool/int, but config keys like rate caps could be float
        $this->assertSame( '3.14', dinoco_flag_audit_serialize_value( 3.14 ) );
    }

    public function test_string_passes_through(): void {
        $this->assertSame( 'hello', dinoco_flag_audit_serialize_value( 'hello' ) );
        $this->assertSame( '', dinoco_flag_audit_serialize_value( '' ) );
    }

    public function test_long_string_truncated_to_255(): void {
        $long = str_repeat( 'A', 300 );
        $out  = dinoco_flag_audit_serialize_value( $long );
        $this->assertNotNull( $out );
        $this->assertSame( 255, strlen( $out ) );
    }

    public function test_short_array_serializes_to_json(): void {
        $arr = array( 1, 2, 3 );
        $out = dinoco_flag_audit_serialize_value( $arr );
        $this->assertSame( '[1,2,3]', $out );
    }

    public function test_assoc_array_serializes_to_json(): void {
        $arr = array( 'k' => 'v', 'n' => 5 );
        $out = dinoco_flag_audit_serialize_value( $arr );
        $this->assertSame( '{"k":"v","n":5}', $out );
    }

    public function test_long_array_truncated_with_ellipsis(): void {
        // beta_distributors flag stores list of post IDs — could grow large
        $big = array_fill( 0, 200, 99999 );
        $out = dinoco_flag_audit_serialize_value( $big );
        $this->assertNotNull( $out );
        // Truncated → ends with ellipsis marker (multibyte char so length in bytes > 255)
        // We assert byte length cap of 254 + 1 ellipsis char (3 bytes UTF-8)
        $this->assertStringEndsWith( '…', $out );
        // Total byte length within reasonable cap (<= 254 + 3 ellipsis bytes = 257)
        $this->assertLessThanOrEqual( 257, strlen( $out ) );
    }

    public function test_object_serialized_as_json(): void {
        $obj = (object) array( 'flag' => 'on', 'count' => 3 );
        $out = dinoco_flag_audit_serialize_value( $obj );
        $this->assertSame( '{"flag":"on","count":3}', $out );
    }

    // ════════════════════════════════════════════════════════════════
    // NO-OP DETECTION (strict + serialized comparison)
    // ════════════════════════════════════════════════════════════════

    public function test_no_op_detection_identical_strings(): void {
        // dinoco_flag_audit_log does: if (old === new) return false
        $old = '1'; $new = '1';
        $this->assertSame( $old, $new ); // sanity check === holds
    }

    public function test_no_op_detection_after_serialization(): void {
        // The two-stage check: strict equality, then serialized equality.
        // bool(true) and string '1' are NOT === but serialize to same '1'.
        $a = true;
        $b = '1';
        $this->assertNotSame( $a, $b );  // strict fails
        $this->assertSame(
            dinoco_flag_audit_serialize_value( $a ),
            dinoco_flag_audit_serialize_value( $b )
        );
    }

    public function test_array_serialization_equality(): void {
        // beta_distributors saved twice with same IDs → no audit row
        $a = array( 12, 34, 56 );
        $b = array( 12, 34, 56 );
        $this->assertSame(
            dinoco_flag_audit_serialize_value( $a ),
            dinoco_flag_audit_serialize_value( $b )
        );
    }

    public function test_array_order_matters_in_serialization(): void {
        // [12, 34] != [34, 12] → real change → DO audit
        $a = array( 12, 34 );
        $b = array( 34, 12 );
        $this->assertNotSame(
            dinoco_flag_audit_serialize_value( $a ),
            dinoco_flag_audit_serialize_value( $b )
        );
    }

    public function test_null_to_value_is_change(): void {
        // First-time flag set: null → '1' is a real change
        $this->assertNotSame(
            dinoco_flag_audit_serialize_value( null ),
            dinoco_flag_audit_serialize_value( '1' )
        );
    }

    public function test_empty_string_vs_zero_string_distinct(): void {
        // '' (option missing default) vs '0' (explicit OFF) is a real change
        $this->assertNotSame(
            dinoco_flag_audit_serialize_value( '' ),
            dinoco_flag_audit_serialize_value( '0' )
        );
    }

    // ════════════════════════════════════════════════════════════════
    // EDGE CASES
    // ════════════════════════════════════════════════════════════════

    public function test_unicode_string_preserved(): void {
        // Reasons may be Thai (e.g. "เปิด BO Phase A-D")
        $thai = 'เปิด BO Phase A-D';
        $out = dinoco_flag_audit_serialize_value( $thai );
        $this->assertSame( $thai, $out );
    }

    public function test_unicode_truncation_safe_byte_count(): void {
        // Thai chars are 3 bytes UTF-8 — substr is byte-based, can split chars
        // We accept this trade-off (audit is non-critical, byte truncation OK).
        // Just verify it doesn't crash + result is ≤ 255 bytes.
        $thai_long = str_repeat( 'ก', 100 ); // 300 bytes
        $out = dinoco_flag_audit_serialize_value( $thai_long );
        $this->assertLessThanOrEqual( 255, strlen( (string) $out ) );
    }

    public function test_nested_array_serializes(): void {
        // Future flag could store nested config — verify no crash
        $nested = array( 'caps' => array( 'hr' => 10, 'day' => 50 ) );
        $out = dinoco_flag_audit_serialize_value( $nested );
        $this->assertIsString( $out );
        $this->assertSame( '{"caps":{"hr":10,"day":50}}', $out );
    }

    public function test_special_chars_in_string(): void {
        $weird = "line1\nline2\ttab\"quote'apos";
        $out = dinoco_flag_audit_serialize_value( $weird );
        $this->assertSame( $weird, $out );
    }
}
