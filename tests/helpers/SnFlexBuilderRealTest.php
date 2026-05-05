<?php
/**
 * SnFlexBuilderRealTest — load REAL Flex builder functions from
 * [Admin System] DINOCO Production SN Manager and verify their output
 * structure (not mirrors).
 *
 * Source: [Admin System] DINOCO Production SN Manager V.0.17+
 * Plan:   ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §F#1/F#4/F#10
 *
 * Strategy:
 *   1. Stub WordPress functions used by builders (esc_html / esc_url_raw)
 *   2. Extract function definitions from snippet via regex
 *   3. eval() the extracted definitions into test process
 *   4. Call builders + assert Flex JSON structure (LINE Flex schema)
 *
 * This complements SnFlexTemplateTest.php (which tests pure-logic mirrors).
 * Real-builder tests catch drift between mirror and actual implementation.
 *
 * Drift sentinel: tests/jest/sn-system-drift.test.js asserts the snippet
 * contains expected function names — keeps real-builder loading viable.
 */

// NOTE: cannot use `declare(strict_types=1)` together with bracketed
// namespace blocks below — declare must precede namespace, but here we
// need bracketed (multi-block) namespaces to inject WP function stubs
// into the global namespace where eval-loaded snippet code resolves
// unqualified function calls (esc_html / esc_url_raw).

// ─── WordPress function stubs MUST be in global namespace ───
namespace {
    if ( ! function_exists( 'esc_html' ) ) {
        function esc_html( $s ) { return htmlspecialchars( (string) $s, ENT_QUOTES, 'UTF-8' ); }
    }
    if ( ! function_exists( 'esc_url_raw' ) ) {
        function esc_url_raw( $url ) {
            $url = (string) $url;
            if ( $url === '' ) return '';
            if ( ! preg_match( '#^(https?://|tel:|mailto:)#i', $url ) ) return '';
            return $url;
        }
    }
}

namespace DinocoTests\Helpers {

use PHPUnit\Framework\TestCase;

/**
 * One-time loader: extract Flex builder functions from snippet + eval.
 * Returns true on success, false if snippet not found or extraction failed.
 * Static guard prevents re-loading + double-definition errors.
 */
function load_real_flex_builders_once(): bool {
    static $loaded = null;
    if ( $loaded !== null ) return $loaded;

    $snippet_path = dirname( __DIR__, 2 ) . '/[Admin System] DINOCO Production SN Manager';
    if ( ! file_exists( $snippet_path ) ) {
        $loaded = false;
        return false;
    }
    $code = file_get_contents( $snippet_path );
    if ( $code === false ) {
        $loaded = false;
        return false;
    }

    // Extract each Flex builder function (whole `if ( ! function_exists ... ) { function ... { ... } }`)
    $names = array(
        'dinoco_sn_format_thai_date',
        'dinoco_sn_pick_anniversary_emoji',
        'dinoco_sn_build_flex_expiry',
        'dinoco_sn_build_flex_anniversary',
        'dinoco_sn_build_flex_review_request',
        'dinoco_sn_build_flex_for_notification',
    );

    $combined = '';
    foreach ( $names as $name ) {
        // Match: if ( ! function_exists( 'NAME' ) ) { function NAME( ... ) { ... } }
        // Use balanced-brace matching via greedy regex anchored on the name.
        $pattern = '/if\s*\(\s*!\s*function_exists\(\s*[\'"]' . preg_quote( $name, '/' ) . '[\'"]\s*\)\s*\)\s*\{/';
        if ( ! preg_match( $pattern, $code, $m, PREG_OFFSET_CAPTURE ) ) {
            continue;
        }
        $start = $m[0][1] + strlen( $m[0][0] );
        // Walk forward counting braces until back to depth 0
        $depth = 1;
        $i = $start;
        $len = strlen( $code );
        while ( $i < $len && $depth > 0 ) {
            $ch = $code[ $i ];
            if ( $ch === '{' ) $depth++;
            elseif ( $ch === '}' ) $depth--;
            $i++;
        }
        // $i now points one char past the closing brace of the if-block
        $function_block = substr( $code, $start, $i - $start - 1 );
        $combined .= $function_block . "\n";
    }

    if ( $combined === '' ) {
        $loaded = false;
        return false;
    }

    // Skip if functions already loaded by another test in same process
    if ( function_exists( 'dinoco_sn_build_flex_expiry' ) ) {
        $loaded = true;
        return true;
    }

    try {
        @eval( $combined );  // phpcs:ignore -- explicit dev-only eval for test infra
    } catch ( \Throwable $e ) {
        $loaded = false;
        return false;
    }

    $loaded = function_exists( 'dinoco_sn_build_flex_expiry' );
    return $loaded;
}

class SnFlexBuilderRealTest extends TestCase {

    protected function setUp(): void {
        if ( ! load_real_flex_builders_once() ) {
            $this->markTestSkipped( 'Could not load real Flex builders from snippet' );
        }
    }

    /* ─── format_thai_date round-trip ─── */

    public function test_format_thai_date_real_buddhist_year(): void {
        $r = \dinoco_sn_format_thai_date( '2025-05-04 14:30:00' );
        $this->assertSame( '4 พ.ค. 2568', $r );
    }

    public function test_format_thai_date_real_empty_returns_empty(): void {
        $this->assertSame( '', \dinoco_sn_format_thai_date( '' ) );
    }

    public function test_format_thai_date_real_invalid_returns_empty(): void {
        $this->assertSame( '', \dinoco_sn_format_thai_date( 'not-a-date' ) );
    }

    /* ─── pick_anniversary_emoji round-trip ─── */

    public function test_pick_anniversary_emoji_real_3y_diamond(): void {
        $r = \dinoco_sn_pick_anniversary_emoji( 3 );
        $this->assertSame( '💎', $r['emoji'] );
        $this->assertSame( 'Diamond Loyalty', $r['label'] );
    }

    public function test_pick_anniversary_emoji_real_1y_celebration(): void {
        $r = \dinoco_sn_pick_anniversary_emoji( 1 );
        $this->assertSame( '🎉', $r['emoji'] );
    }

    /* ─── build_flex_expiry — full LINE Flex bubble ─── */

    public function test_expiry_returns_bubble_structure(): void {
        $b = \dinoco_sn_build_flex_expiry( array(
            'sn'           => 'DNCSS0001234',
            'product_name' => 'ชุดกันล้ม Honda XL750 PRO',
            'warranty_end' => '2026-06-04',
            'days_left'    => 30,
        ) );
        $this->assertSame( 'bubble', $b['type'] );
        $this->assertSame( 'kilo', $b['size'] );
        $this->assertArrayHasKey( 'header', $b );
        $this->assertArrayHasKey( 'body', $b );
    }

    public function test_expiry_severity_red_at_1d(): void {
        $b = \dinoco_sn_build_flex_expiry( array( 'sn' => 'X', 'product_name' => 'p', 'warranty_end' => '2025-01-01', 'days_left' => 1 ) );
        $this->assertSame( '#dc2626', $b['header']['backgroundColor'] );
    }

    public function test_expiry_severity_amber_at_7d(): void {
        $b = \dinoco_sn_build_flex_expiry( array( 'sn' => 'X', 'product_name' => 'p', 'warranty_end' => '2025-01-01', 'days_left' => 7 ) );
        $this->assertSame( '#f59e0b', $b['header']['backgroundColor'] );
    }

    public function test_expiry_severity_navy_at_30d(): void {
        $b = \dinoco_sn_build_flex_expiry( array( 'sn' => 'X', 'product_name' => 'p', 'warranty_end' => '2025-01-01', 'days_left' => 30 ) );
        $this->assertSame( '#1f2937', $b['header']['backgroundColor'] );
    }

    public function test_expiry_includes_promo_block_when_provided(): void {
        $b = \dinoco_sn_build_flex_expiry( array(
            'sn' => 'DNCSS0001234', 'product_name' => 'p',
            'warranty_end' => '2025-01-01', 'days_left' => 30,
            'promo_code' => 'WELCOMEBACK-XK31', 'promo_pct' => 10,
        ) );
        $body_json = json_encode( $b['body'] );
        $this->assertStringContainsString( 'WELCOMEBACK-XK31', $body_json );
        $this->assertStringContainsString( '10%', $body_json );
    }

    public function test_expiry_omits_promo_block_when_missing(): void {
        $b = \dinoco_sn_build_flex_expiry( array(
            'sn' => 'X', 'product_name' => 'p',
            'warranty_end' => '2025-01-01', 'days_left' => 30,
        ) );
        $body_json = json_encode( $b['body'] );
        // Should NOT contain WELCOMEBACK or any promo wording
        $this->assertStringNotContainsString( 'WELCOMEBACK', $body_json );
        $this->assertStringNotContainsString( 'ส่วนลด', $body_json );
    }

    public function test_expiry_footer_only_when_buttons_provided(): void {
        $b1 = \dinoco_sn_build_flex_expiry( array( 'sn' => 'X', 'product_name' => 'p', 'warranty_end' => '2025-01-01', 'days_left' => 30 ) );
        $this->assertArrayNotHasKey( 'footer', $b1 );

        $b2 = \dinoco_sn_build_flex_expiry( array(
            'sn' => 'X', 'product_name' => 'p',
            'warranty_end' => '2025-01-01', 'days_left' => 30,
            'extension_url' => 'https://dinoco.in.th/warranty/extend?sn=X',
        ) );
        $this->assertArrayHasKey( 'footer', $b2 );
    }

    public function test_expiry_xss_safe_via_esc_html(): void {
        $b = \dinoco_sn_build_flex_expiry( array(
            'sn' => 'X', 'product_name' => 'p',
            'warranty_end' => '2025-01-01', 'days_left' => 30,
            'promo_code' => '<script>alert(1)</script>',
            'promo_pct' => 10,
        ) );
        $j = json_encode( $b );
        $this->assertStringNotContainsString( '<script>', $j );
        // esc_html encodes the script tag — should appear as &lt;script&gt;
        $this->assertStringContainsString( '&lt;script&gt;', $j );
    }

    /* ─── build_flex_anniversary ─── */

    public function test_anniversary_diamond_violet_at_3y(): void {
        $b = \dinoco_sn_build_flex_anniversary( array(
            'sn' => 'X', 'product_name' => 'p', 'years' => 3,
        ) );
        $this->assertSame( '#7c3aed', $b['header']['backgroundColor'] );
    }

    public function test_anniversary_gold_at_2y(): void {
        $b = \dinoco_sn_build_flex_anniversary( array(
            'sn' => 'X', 'product_name' => 'p', 'years' => 2,
        ) );
        $this->assertSame( '#ca8a04', $b['header']['backgroundColor'] );
    }

    public function test_anniversary_navy_at_1y(): void {
        $b = \dinoco_sn_build_flex_anniversary( array(
            'sn' => 'X', 'product_name' => 'p', 'years' => 1,
        ) );
        $this->assertSame( '#1f2937', $b['header']['backgroundColor'] );
    }

    public function test_anniversary_includes_coupon_when_provided(): void {
        $b = \dinoco_sn_build_flex_anniversary( array(
            'sn' => 'X', 'product_name' => 'p', 'years' => 1,
            'coupon_code' => 'ANNIV-2026-XK31', 'coupon_pct' => 5,
        ) );
        $j = json_encode( $b['body'] );
        $this->assertStringContainsString( 'ANNIV-2026-XK31', $j );
    }

    /* ─── build_flex_review_request ─── */

    public function test_review_request_green_header(): void {
        $b = \dinoco_sn_build_flex_review_request( array(
            'sn' => 'DNCSS0001234',
            'product_name' => 'ชุดกันล้ม Honda XL750',
            'review_url' => 'https://dinoco.in.th/review?sn=X',
            'reward_amt' => 50,
        ) );
        $this->assertSame( '#10b981', $b['header']['backgroundColor'] );
    }

    public function test_review_request_button_label_with_reward(): void {
        $b = \dinoco_sn_build_flex_review_request( array(
            'sn' => 'X', 'product_name' => 'p',
            'review_url' => 'https://dinoco.in.th/review',
            'reward_amt' => 50,
        ) );
        // Use JSON_UNESCAPED_UNICODE so ฿ stays literal (default escapes to ฿)
        $j = json_encode( $b['footer'], JSON_UNESCAPED_UNICODE );
        $this->assertStringContainsString( '฿50', $j );
    }

    public function test_review_request_no_footer_when_url_missing(): void {
        $b = \dinoco_sn_build_flex_review_request( array(
            'sn' => 'X', 'product_name' => 'p',
        ) );
        $this->assertArrayNotHasKey( 'footer', $b );
    }

    /* ─── build_flex_for_notification dispatcher ─── */

    public function test_dispatcher_routes_expiry_with_suffix_parsing(): void {
        $b = \dinoco_sn_build_flex_for_notification( 'expiry_30d', array(
            'sn' => 'DNCSS0001234',
            'product_name' => 'p',
            'warranty_end' => '2025-01-01',
        ) );
        $this->assertNotNull( $b );
        // Should have routed to expiry builder — navy header (30d > 7)
        $this->assertSame( '#1f2937', $b['header']['backgroundColor'] );
    }

    public function test_dispatcher_routes_anniversary_with_year_parsing(): void {
        $b = \dinoco_sn_build_flex_for_notification( 'anniversary_3y', array(
            'sn' => 'X', 'product_name' => 'p',
        ) );
        $this->assertNotNull( $b );
        // Should have routed to anniversary builder — violet header (3y+)
        $this->assertSame( '#7c3aed', $b['header']['backgroundColor'] );
    }

    public function test_dispatcher_routes_review_request(): void {
        $b = \dinoco_sn_build_flex_for_notification( 'review_request', array(
            'sn' => 'X', 'product_name' => 'p',
            'review_url' => 'https://dinoco.in.th/review',
        ) );
        $this->assertNotNull( $b );
        $this->assertSame( '#10b981', $b['header']['backgroundColor'] );
    }

    public function test_dispatcher_unknown_type_returns_null(): void {
        $b = \dinoco_sn_build_flex_for_notification( 'sms_marketing_xyz', array() );
        $this->assertNull( $b );
    }

    public function test_dispatcher_accepts_meta_json_string(): void {
        $meta = json_encode( array(
            'sn' => 'DNCSS0001234',
            'product_name' => 'p',
            'warranty_end' => '2025-01-01',
        ) );
        $b = \dinoco_sn_build_flex_for_notification( 'expiry_7d', $meta );
        $this->assertNotNull( $b );
        // expiry_7d → amber
        $this->assertSame( '#f59e0b', $b['header']['backgroundColor'] );
    }

    public function test_dispatcher_extra_overrides_meta_json(): void {
        // Extra param wins when both provided
        $meta = json_encode( array( 'sn' => 'X1', 'product_name' => 'p', 'warranty_end' => '2025-01-01' ) );
        $extra = array( 'sn' => 'X2_OVERRIDE' );
        $b = \dinoco_sn_build_flex_for_notification( 'expiry_30d', $meta, $extra );
        $j = json_encode( $b );
        // Extra should override → look for X2_OVERRIDE not X1
        $this->assertStringContainsString( 'X2_OVERRIDE', $j );
        $this->assertStringNotContainsString( 'X1', $j );
    }

    /* ─── LINE Flex schema validation ─── */

    public function test_all_builders_produce_valid_kilo_bubble(): void {
        $b1 = \dinoco_sn_build_flex_expiry( array( 'sn' => 'X', 'product_name' => 'p', 'warranty_end' => '2025-01-01', 'days_left' => 30 ) );
        $b2 = \dinoco_sn_build_flex_anniversary( array( 'sn' => 'X', 'product_name' => 'p', 'years' => 1 ) );
        $b3 = \dinoco_sn_build_flex_review_request( array( 'sn' => 'X', 'product_name' => 'p' ) );

        foreach ( array( $b1, $b2, $b3 ) as $b ) {
            $this->assertSame( 'bubble', $b['type'] );
            $this->assertSame( 'kilo', $b['size'] );
            $this->assertSame( 'box', $b['header']['type'] );
            $this->assertSame( 'vertical', $b['header']['layout'] );
            $this->assertSame( 'box', $b['body']['type'] );
            $this->assertSame( 'vertical', $b['body']['layout'] );
        }
    }
}

}  // end namespace DinocoTests\Helpers
