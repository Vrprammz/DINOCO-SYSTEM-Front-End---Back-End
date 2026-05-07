<?php
/**
 * REG-095 — Canonical idempotency hash with ksort recursive normalization.
 *
 * Plan v2.13 §Phase 1 W4 R3 HIGH.
 *
 * Round 30+ canonical pattern: bodies that are LOGICALLY identical but key-order
 * different MUST hash the same. The base helper preserves key order intentionally
 * (Round 19 RFC compliance), but a NEW canonical wrapper exists for endpoints
 * where client-side key shuffling is expected (e.g. Set/Map serialization).
 *
 * Mirror function:
 *   dinoco_sn_canonical_idempotency_hash($body) — ksort recursive then SHA-256
 *
 * Tests focus on:
 *   - Top-level key order normalized
 *   - Nested array/object key order normalized recursively
 *   - Numeric keys preserved (list semantics)
 *   - Scalar / null body bypass
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\SnCanonicalIdempotencyHash;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\ksort_recursive' ) ) {
    function ksort_recursive( array &$arr ): void {
        foreach ( $arr as &$v ) {
            if ( is_array( $v ) ) {
                ksort_recursive( $v );
            }
        }
        // ksort by string keys (associative); list arrays passthrough naturally
        if ( ! array_is_list( $arr ) ) {
            ksort( $arr );
        }
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\canonical_hash' ) ) {
    function canonical_hash( $body ): string {
        if ( is_array( $body ) ) {
            ksort_recursive( $body );
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

class SnCanonicalIdempotencyHashTest extends TestCase {

    public function test_canonical_hash_top_level_key_order_normalized(): void {
        $a = canonical_hash( array( 'a' => 1, 'b' => 2, 'c' => 3 ) );
        $b = canonical_hash( array( 'c' => 3, 'a' => 1, 'b' => 2 ) );
        $this->assertSame( $a, $b );
    }

    public function test_canonical_hash_nested_array_normalized(): void {
        $a = canonical_hash( array( 'meta' => array( 'foo' => 1, 'bar' => 2 ) ) );
        $b = canonical_hash( array( 'meta' => array( 'bar' => 2, 'foo' => 1 ) ) );
        $this->assertSame( $a, $b );
    }

    public function test_canonical_hash_deep_nested_normalized(): void {
        $a = canonical_hash( array(
            'level1' => array( 'level2' => array( 'a' => 1, 'b' => 2 ) ),
        ) );
        $b = canonical_hash( array(
            'level1' => array( 'level2' => array( 'b' => 2, 'a' => 1 ) ),
        ) );
        $this->assertSame( $a, $b );
    }

    public function test_canonical_hash_list_semantics_preserved(): void {
        // Numeric-keyed lists are ORDER-SIGNIFICANT (don't sort)
        $a = canonical_hash( array( 'items' => array( 'apple', 'banana', 'cherry' ) ) );
        $b = canonical_hash( array( 'items' => array( 'cherry', 'apple', 'banana' ) ) );
        $this->assertNotSame(
            $a, $b,
            'List order MUST matter — sorting lists would silently corrupt cart contents'
        );
    }

    public function test_canonical_hash_scalar_passthrough_int(): void {
        $a = canonical_hash( 42 );
        $b = canonical_hash( '42' );
        $this->assertSame( $a, $b );
    }

    public function test_canonical_hash_null_is_empty(): void {
        $h = canonical_hash( null );
        $this->assertSame(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            $h
        );
    }

    public function test_canonical_hash_different_value_different_hash(): void {
        $a = canonical_hash( array( 'amount' => 1500 ) );
        $b = canonical_hash( array( 'amount' => 9999 ) );
        $this->assertNotSame( $a, $b );
    }

    public function test_canonical_hash_array_key_set_size_matters(): void {
        $a = canonical_hash( array( 'a' => 1, 'b' => 2 ) );
        $b = canonical_hash( array( 'a' => 1 ) );
        $this->assertNotSame( $a, $b );
    }

    public function test_canonical_hash_handles_mixed_assoc_and_list(): void {
        // Object with a list inside — list order preserved, object keys sorted
        $a = canonical_hash( array(
            'sn'    => 'DNCSS0001234',
            'items' => array( 'a', 'b', 'c' ),
        ) );
        $b = canonical_hash( array(
            'items' => array( 'a', 'b', 'c' ),
            'sn'    => 'DNCSS0001234',
        ) );
        $this->assertSame( $a, $b );
    }

    public function test_canonical_hash_64_hex(): void {
        $h = canonical_hash( array( 'x' => 1 ) );
        $this->assertSame( 64, strlen( $h ) );
        $this->assertMatchesRegularExpression( '/^[a-f0-9]{64}$/', $h );
    }
}
