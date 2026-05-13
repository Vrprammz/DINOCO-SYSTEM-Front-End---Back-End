<?php
/**
 * ClaimNotifResponseShapeTest — pure-logic tests for the Notifier V.0.3
 * CRIT-1 + HIGH-1 + HIGH-3 fixes (Sprint 7 code-reviewer remediation).
 *
 * Verifies the BRANCH LOGIC of:
 *   1) b2b_line_push_raw response shape parsing (CRIT-1)
 *      - false                                → push_helper_unavailable
 *      - array('code'=>200, 'body'=>'')       → success, push_err=''
 *      - array('code'=>401, 'body'=>'unauth') → http_401:unauth
 *      - array('code'=>429, 'body'=>'rate')   → http_429:rate
 *      - array('code'=>500, 'body'=>'<long>') → http_500:<body trimmed to 200>
 *      - array('code'=>0,  'body'=>'')        → http_0: (network-error path)
 *      - 'string' / 42 / null                 → unknown_push_response_shape
 *   2) Push Gov reason truncation (HIGH-3)
 *      - mb_substr($push_err, 0, 60) keeps Thai-safe truncation
 *      - 200-char body preview is reduced to 60 chars at gov log boundary
 *   3) Idempotency hash unify (HIGH-1)
 *      - same logical status with case/whitespace variant produces SAME slug
 *      - same slug input + integer claim_id produces SAME hash via
 *        dinoco_idempotency_hash array shape — proves V.0.3 unified path is
 *        case-insensitive on $to_status while V.0.2 raw path was case-
 *        sensitive (false 409 risk).
 *
 * Source of truth: [Admin System] DINOCO Claim Lifecycle Notifier V.0.3
 * lines 342–369 (push parse) + 469–488 (idempotency).
 *
 * Pure-logic tests — re-implement the parser inline (mirror production
 * code path). When snippets split into composer packages, swap to require.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// ─── Inline copy of slug helper (same as ClaimNotifPureLogicTest) ───

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_claim_notif_status_to_slug' ) ) {
    function dinoco_claim_notif_status_to_slug( $status ) {
        $s = trim( (string) $status );
        if ( $s === '' ) return '';
        $slug = strtolower( $s );
        $slug = preg_replace( '/[\s\-]+/', '_', $slug );
        $slug = preg_replace( '/[^a-z0-9_]/', '', $slug );
        $slug = preg_replace( '/_+/', '_', $slug );
        return trim( $slug, '_' );
    }
}

/**
 * Pure-logic mirror of V.0.3 push response parser (Notifier lines 342-369).
 * Identical branch tree — when production code changes, this MUST update.
 *
 * @param mixed $resp Whatever b2b_line_push_raw returned
 * @return array{success:bool, push_err:string}
 */
function parse_push_response( $resp ): array {
    $push_err = '';
    if ( $resp === false ) {
        $push_err = 'push_helper_unavailable';
    } elseif ( is_array( $resp ) && isset( $resp['code'] ) ) {
        $code = (int) $resp['code'];
        if ( $code === 200 ) {
            // success
        } else {
            $body_preview = isset( $resp['body'] ) ? substr( (string) $resp['body'], 0, 200 ) : '';
            $push_err = 'http_' . $code . ( $body_preview !== '' ? ':' . $body_preview : '' );
        }
    } else {
        $push_err = 'unknown_push_response_shape';
    }
    return array(
        'success'  => ( $push_err === '' ),
        'push_err' => $push_err,
    );
}


final class ClaimNotifResponseShapeTest extends TestCase {

    // ════════════════════════════════════════════════════════════════════
    // CRIT-1 — push response shape parsing
    // ════════════════════════════════════════════════════════════════════

    public function test_false_response_means_helper_unavailable(): void {
        $r = parse_push_response( false );
        $this->assertFalse( $r['success'] );
        $this->assertSame( 'push_helper_unavailable', $r['push_err'] );
    }

    public function test_http_200_is_success(): void {
        $r = parse_push_response( array( 'code' => 200, 'body' => '' ) );
        $this->assertTrue( $r['success'] );
        $this->assertSame( '', $r['push_err'] );
    }

    public function test_http_401_records_error_with_body_preview(): void {
        $r = parse_push_response( array( 'code' => 401, 'body' => '{"message":"unauthorized"}' ) );
        $this->assertFalse( $r['success'] );
        $this->assertSame( 'http_401:{"message":"unauthorized"}', $r['push_err'] );
    }

    public function test_http_429_rate_limited(): void {
        $r = parse_push_response( array( 'code' => 429, 'body' => 'rate' ) );
        $this->assertFalse( $r['success'] );
        $this->assertSame( 'http_429:rate', $r['push_err'] );
    }

    public function test_http_500_long_body_truncated_to_200_chars(): void {
        $long = str_repeat( 'x', 500 );
        $r = parse_push_response( array( 'code' => 500, 'body' => $long ) );
        $this->assertFalse( $r['success'] );
        // Total length = 'http_500:' (9) + 200 chars = 209
        $this->assertSame( 209, strlen( $r['push_err'] ) );
        $this->assertStringStartsWith( 'http_500:', $r['push_err'] );
    }

    public function test_http_500_empty_body_omits_colon_separator(): void {
        $r = parse_push_response( array( 'code' => 500, 'body' => '' ) );
        $this->assertSame( 'http_500', $r['push_err'] );
    }

    public function test_code_zero_network_error_path(): void {
        // wp_remote_post returned WP_Error internally — helper coerces to code=0
        $r = parse_push_response( array( 'code' => 0, 'body' => '' ) );
        $this->assertFalse( $r['success'] );
        $this->assertSame( 'http_0', $r['push_err'] );
    }

    public function test_unexpected_response_shapes(): void {
        foreach ( array( 'string', 42, null, array( 'no_code_key' => true ) ) as $bad ) {
            $r = parse_push_response( $bad );
            // null is intentionally treated as unknown (NOT push_helper_unavailable
            // which is reserved for the documented `false` return only)
            if ( $bad === null ) {
                $this->assertSame( 'unknown_push_response_shape', $r['push_err'],
                    'null response should be unknown_push_response_shape' );
            } else {
                $this->assertFalse( $r['success'] );
                $this->assertSame( 'unknown_push_response_shape', $r['push_err'] );
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // HIGH-3 — Push Gov reason truncation
    // ════════════════════════════════════════════════════════════════════

    public function test_truncates_push_err_to_60_chars_for_gov_log(): void {
        $r = parse_push_response( array(
            'code' => 500,
            'body' => str_repeat( 'A', 250 ),
        ) );
        // Production code calls: mb_substr( $push_err, 0, 60 )
        $reason = mb_substr( $r['push_err'], 0, 60 );
        $this->assertSame( 60, mb_strlen( $reason ) );
        $this->assertStringStartsWith( 'http_500:', $reason );
    }

    public function test_truncation_is_thai_safe(): void {
        // Push errors could in theory contain Thai HTTP body — verify mb_substr
        // doesn't split a UTF-8 codepoint.
        $thai = str_repeat( 'รายงานข้อผิดพลาด', 5 );  // multi-byte chars
        $err = 'http_500:' . $thai;
        $reason = mb_substr( $err, 0, 60 );
        // mb_substr counts characters, not bytes — output must be valid UTF-8
        $this->assertTrue( mb_check_encoding( $reason, 'UTF-8' ) );
        $this->assertSame( 60, mb_strlen( $reason ) );
    }

    // ════════════════════════════════════════════════════════════════════
    // HIGH-1 — Idempotency hash unify (slug-based identity)
    // ════════════════════════════════════════════════════════════════════

    public function test_case_variants_collapse_to_same_slug(): void {
        // V.0.2 bug: key used slug, body hash used raw → these would collide on
        // key but differ on body hash → false 409. V.0.3 fix: both use slug.
        $a = dinoco_claim_notif_status_to_slug( 'Under Maintenance' );
        $b = dinoco_claim_notif_status_to_slug( 'under maintenance' );
        $c = dinoco_claim_notif_status_to_slug( '  Under   Maintenance  ' );
        $this->assertSame( $a, $b );
        $this->assertSame( $a, $c );
        $this->assertSame( 'under_maintenance', $a );
    }

    public function test_body_for_hash_is_deterministic_for_same_logical_event(): void {
        // Simulate the V.0.3 unified body shape: array('claim_id', 'to_status' => slug)
        $body_a = array(
            'claim_id'  => 1001,
            'to_status' => dinoco_claim_notif_status_to_slug( 'Under Maintenance' ),
        );
        $body_b = array(
            'claim_id'  => 1001,
            'to_status' => dinoco_claim_notif_status_to_slug( 'under maintenance' ),
        );
        // Same logical event → same body → same hash input
        $this->assertSame( serialize( $body_a ), serialize( $body_b ) );
    }

    public function test_different_claims_produce_different_hash_input(): void {
        $body_a = array( 'claim_id' => 1001, 'to_status' => 'under_maintenance' );
        $body_b = array( 'claim_id' => 1002, 'to_status' => 'under_maintenance' );
        $this->assertNotSame( serialize( $body_a ), serialize( $body_b ) );
    }

    public function test_different_status_slugs_produce_different_hash_input(): void {
        $body_a = array( 'claim_id' => 1001, 'to_status' => 'under_maintenance' );
        $body_b = array( 'claim_id' => 1001, 'to_status' => 'maintenance_completed' );
        $this->assertNotSame( serialize( $body_a ), serialize( $body_b ) );
    }

    public function test_v02_asymmetry_demonstration_via_raw_status(): void {
        // Sanity check that V.0.2 raw-status approach WOULD have produced
        // different hash inputs for case variants — proving the HIGH-1 risk.
        $body_v02_a = array( 'cid' => 1001, 'to' => 'Under Maintenance' );
        $body_v02_b = array( 'cid' => 1001, 'to' => 'under maintenance' );
        // V.0.2 would have hashed these differently — false 409 risk.
        $this->assertNotSame( serialize( $body_v02_a ), serialize( $body_v02_b ) );

        // V.0.3 unified approach (using slug) produces same input for both.
        $body_v03_a = array(
            'claim_id'  => 1001,
            'to_status' => dinoco_claim_notif_status_to_slug( 'Under Maintenance' ),
        );
        $body_v03_b = array(
            'claim_id'  => 1001,
            'to_status' => dinoco_claim_notif_status_to_slug( 'under maintenance' ),
        );
        $this->assertSame( serialize( $body_v03_a ), serialize( $body_v03_b ) );
    }
}
