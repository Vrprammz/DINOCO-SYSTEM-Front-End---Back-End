<?php
/**
 * GdprLineExportTest — pure-logic tests for V.4.0 LINE messages export
 * helper response normalization.
 *
 * Source: [System] DINOCO GDPR Data Requests V.4.0 (Round 26, 2026-04-30)
 *
 * Scope: We test the RESPONSE NORMALIZATION logic of
 * `dinoco_gdpr_export_line_messages($line_uid, $request_id)` — specifically
 * how it handles various agent response shapes:
 *
 *   1. Valid 200 response → returns full structure unchanged
 *   2. Missing line_uid → returns empty (no agent call attempted)
 *   3. 429 rate limit → unavailable=true (caller adds placeholder note)
 *   4. 500 server error → unavailable=true
 *   5. 4xx client error → empty (no data, but not unavailable)
 *   6. Malformed JSON → empty (defensive)
 *   7. Missing ok=true field → empty
 *
 * NOTE: These are PURE-LOGIC tests — we mirror the response-handling
 * branch of the helper in a testable form. The actual HTTP call layer
 * (wp_remote_request) is WordPress-specific and tested via integration
 * tests when WP environment available.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// Mirror the response-shape normalization logic from V.4.0 helper
if ( ! function_exists( __NAMESPACE__ . '\\gdpr_line_normalize_response' ) ) {
    function gdpr_line_normalize_response( int $code, string $body_str ): array {
        $empty = array(
            'messages'     => array(),
            'claims'       => array(),
            'leads'        => array(),
            'total_count'  => 0,
            'generated_at' => '',
            'unavailable'  => false,
        );

        // 429 rate limited
        if ( $code === 429 ) {
            $empty['unavailable'] = true;
            return $empty;
        }
        // 5xx → unavailable (transient)
        if ( $code >= 500 ) {
            $empty['unavailable'] = true;
            return $empty;
        }
        // 4xx → empty (caller-side problem, not transient)
        if ( $code >= 400 ) {
            return $empty;
        }

        $data = json_decode( $body_str, true );
        if ( ! is_array( $data ) || empty( $data['ok'] ) ) {
            return $empty;
        }

        return array(
            'messages'     => isset( $data['messages'] ) && is_array( $data['messages'] ) ? $data['messages'] : array(),
            'claims'       => isset( $data['claims'] ) && is_array( $data['claims'] ) ? $data['claims'] : array(),
            'leads'        => isset( $data['leads'] ) && is_array( $data['leads'] ) ? $data['leads'] : array(),
            'total_count'  => isset( $data['total_count'] ) ? (int) $data['total_count'] : 0,
            'generated_at' => isset( $data['generated_at'] ) ? (string) $data['generated_at'] : '',
            'unavailable'  => false,
        );
    }
}

class GdprLineExportTest extends TestCase {

    // ─── 200 OK valid response ────────────────────────────────────────

    public function test_200_response_returns_full_structure(): void {
        $body = json_encode( array(
            'ok' => true,
            'line_uid' => 'U1234567890abc',
            'messages' => array(
                array( 'timestamp' => '2026-04-29T10:00:00Z', 'direction' => 'user', 'text' => 'hello', 'type' => 'text' ),
            ),
            'claims' => array( array( 'created_at' => '2026-04-15', 'status' => 'closed', 'claim_id' => 'c001' ) ),
            'leads' => array(),
            'total_count' => 2,
            'generated_at' => '2026-04-30T09:00:00.000Z',
        ) );
        $result = gdpr_line_normalize_response( 200, $body );
        $this->assertCount( 1, $result['messages'] );
        $this->assertCount( 1, $result['claims'] );
        $this->assertCount( 0, $result['leads'] );
        $this->assertSame( 2, $result['total_count'] );
        $this->assertFalse( $result['unavailable'] );
        $this->assertSame( '2026-04-30T09:00:00.000Z', $result['generated_at'] );
    }

    public function test_200_empty_arrays_returned_unchanged(): void {
        $body = json_encode( array(
            'ok' => true,
            'messages' => array(),
            'claims' => array(),
            'leads' => array(),
            'total_count' => 0,
        ) );
        $result = gdpr_line_normalize_response( 200, $body );
        $this->assertSame( 0, $result['total_count'] );
        $this->assertFalse( $result['unavailable'] );
    }

    // ─── 429 rate limit ────────────────────────────────────────

    public function test_429_returns_unavailable_true(): void {
        $body = json_encode( array(
            'ok' => false,
            'error' => 'rate_limited',
            'message' => 'Recent export already issued',
        ) );
        $result = gdpr_line_normalize_response( 429, $body );
        $this->assertTrue( $result['unavailable'],
            '429 rate limit MUST set unavailable=true so caller adds placeholder note in ZIP'
        );
        $this->assertCount( 0, $result['messages'] );
    }

    // ─── 5xx server errors ────────────────────────────────────────

    public function test_500_returns_unavailable_true(): void {
        $result = gdpr_line_normalize_response( 500, '{"ok":false,"error":"internal"}' );
        $this->assertTrue( $result['unavailable'] );
    }

    public function test_503_db_unavailable_returns_unavailable_true(): void {
        $result = gdpr_line_normalize_response( 503, '{"ok":false,"error":"db_unavailable"}' );
        $this->assertTrue( $result['unavailable'] );
    }

    // ─── 4xx client errors ────────────────────────────────────────

    public function test_400_returns_empty_not_unavailable(): void {
        // 400 = malformed line_uid — caller-side problem, no data exists
        $result = gdpr_line_normalize_response( 400, '{"ok":false,"error":"missing_or_invalid_line_uid"}' );
        $this->assertFalse( $result['unavailable'],
            '400 should NOT trigger unavailable=true (not a transient agent failure)'
        );
        $this->assertCount( 0, $result['messages'] );
    }

    public function test_404_returns_empty(): void {
        $result = gdpr_line_normalize_response( 404, '{"ok":false}' );
        $this->assertCount( 0, $result['messages'] );
        $this->assertFalse( $result['unavailable'] );
    }

    // ─── Malformed responses ────────────────────────────────────────

    public function test_malformed_json_returns_empty(): void {
        $result = gdpr_line_normalize_response( 200, 'not-json{[}' );
        $this->assertCount( 0, $result['messages'] );
        $this->assertSame( 0, $result['total_count'] );
        $this->assertFalse( $result['unavailable'] );
    }

    public function test_missing_ok_field_returns_empty(): void {
        // Defensive: agent should always return ok=true on success — if missing, treat as failure
        $body = json_encode( array(
            'messages' => array( array( 'text' => 'should_not_be_returned' ) ),
        ) );
        $result = gdpr_line_normalize_response( 200, $body );
        $this->assertCount( 0, $result['messages'],
            'Missing ok=true field MUST return empty (defensive)'
        );
    }

    public function test_ok_false_returns_empty(): void {
        $body = json_encode( array(
            'ok' => false,
            'error' => 'something',
        ) );
        $result = gdpr_line_normalize_response( 200, $body );
        $this->assertCount( 0, $result['messages'] );
    }

    // ─── PII protection ────────────────────────────────────────

    public function test_messages_field_passthrough_does_not_modify_user_text(): void {
        // User's own messages MUST be preserved verbatim — they are the data subject's
        // own content and a key part of the export per PDPA §30
        $original_text = 'My phone is 081-234-5678 and address is 123 Main St';
        $body = json_encode( array(
            'ok' => true,
            'messages' => array(
                array( 'timestamp' => '2026-04-29T10:00:00Z', 'direction' => 'user', 'text' => $original_text, 'type' => 'text' ),
            ),
            'total_count' => 1,
        ) );
        $result = gdpr_line_normalize_response( 200, $body );
        $this->assertSame( $original_text, $result['messages'][0]['text'],
            "User's own messages MUST be passthrough — agent already filters 3rd-party PII"
        );
    }

    // ─── Field type coercion (defensive) ────────────────────────────────────────

    public function test_total_count_coerced_to_int(): void {
        $body = json_encode( array(
            'ok' => true,
            'messages' => array(),
            'total_count' => '42',  // string instead of int
        ) );
        $result = gdpr_line_normalize_response( 200, $body );
        $this->assertSame( 42, $result['total_count'] );
        $this->assertIsInt( $result['total_count'] );
    }

    public function test_non_array_messages_coerced_to_empty(): void {
        $body = json_encode( array(
            'ok' => true,
            'messages' => 'not-an-array',  // malformed
            'total_count' => 0,
        ) );
        $result = gdpr_line_normalize_response( 200, $body );
        $this->assertSame( array(), $result['messages'] );
    }
}
