<?php
/**
 * CurrencyTest — pure logic test of B2F currency formatting helpers.
 *
 * Mirrors functions from [B2F] Snippet 1: Core Utilities & Flex Builders:
 *   - b2f_currency_symbol($currency)
 *   - b2f_format_currency($amount, $currency)
 *   - b2f_currency_name_en($currency)
 *   - b2f_t($th, $en, $zh, $currency)
 *
 * We re-declare the helpers INLINE here (not `require`) because the snippet
 * contains WP-specific guards and is loaded at WP bootstrap. Copying the
 * pure-logic bodies into the test file is the cleanest isolation for now.
 * When snippets split into composer packages, swap to `require` + real source.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// ─── Inline copies of pure-logic helpers (source of truth: B2F Snippet 1) ───

if ( ! function_exists( __NAMESPACE__ . '\\b2f_currency_symbol' ) ) {
    function b2f_currency_symbol( $currency = 'THB' ) {
        $map = array( 'THB' => '฿', 'CNY' => '¥', 'USD' => '$' );
        return isset( $map[ $currency ] ) ? $map[ $currency ] : $currency;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\b2f_format_currency' ) ) {
    function b2f_format_currency( $amount, $currency = 'THB' ) {
        return b2f_currency_symbol( $currency ) . number_format( (float) $amount, 2 );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\b2f_currency_name_en' ) ) {
    function b2f_currency_name_en( $currency = 'THB' ) {
        $map = array( 'THB' => 'Thai Baht', 'CNY' => 'Chinese Yuan', 'USD' => 'US Dollar' );
        return isset( $map[ $currency ] ) ? $map[ $currency ] : $currency;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\b2f_t' ) ) {
    function b2f_t( $th, $en, $zh, $currency = 'THB' ) {
        if ( $currency === 'CNY' ) return ( $zh !== '' && $zh !== null ) ? $zh : $en;
        if ( $currency !== 'THB' ) return $en;
        return $th;
    }
}

class CurrencyTest extends TestCase {

    public function test_symbol_thb(): void {
        $this->assertSame( '฿', b2f_currency_symbol( 'THB' ) );
    }

    public function test_symbol_cny(): void {
        $this->assertSame( '¥', b2f_currency_symbol( 'CNY' ) );
    }

    public function test_symbol_usd(): void {
        $this->assertSame( '$', b2f_currency_symbol( 'USD' ) );
    }

    public function test_symbol_unknown_fallback_to_code(): void {
        $this->assertSame( 'EUR', b2f_currency_symbol( 'EUR' ) );
    }

    public function test_format_thb_basic(): void {
        $this->assertSame( '฿1,234.50', b2f_format_currency( 1234.5, 'THB' ) );
    }

    public function test_format_usd_zero(): void {
        $this->assertSame( '$0.00', b2f_format_currency( 0, 'USD' ) );
    }

    public function test_format_cny_negative(): void {
        $this->assertSame( '¥-100.00', b2f_format_currency( -100, 'CNY' ) );
    }

    public function test_format_thb_large_number(): void {
        $this->assertSame( '฿1,000,000.00', b2f_format_currency( 1000000, 'THB' ) );
    }

    public function test_format_coerces_string_amount(): void {
        // (float) '45.5' = 45.5 — defensive coercion
        $this->assertSame( '฿45.50', b2f_format_currency( '45.5', 'THB' ) );
    }

    public function test_name_en_thb(): void {
        $this->assertSame( 'Thai Baht', b2f_currency_name_en( 'THB' ) );
    }

    public function test_name_en_unknown_fallback(): void {
        $this->assertSame( 'JPY', b2f_currency_name_en( 'JPY' ) );
    }

    public function test_t_thb_picks_thai(): void {
        $this->assertSame( 'ไทย', b2f_t( 'ไทย', 'English', '中文', 'THB' ) );
    }

    public function test_t_usd_picks_english(): void {
        $this->assertSame( 'English', b2f_t( 'ไทย', 'English', '中文', 'USD' ) );
    }

    public function test_t_cny_picks_chinese(): void {
        $this->assertSame( '中文', b2f_t( 'ไทย', 'English', '中文', 'CNY' ) );
    }

    public function test_t_cny_empty_zh_falls_back_to_en(): void {
        $this->assertSame( 'English', b2f_t( 'ไทย', 'English', '', 'CNY' ) );
    }

    public function test_t_cny_null_zh_falls_back_to_en(): void {
        $this->assertSame( 'English', b2f_t( 'ไทย', 'English', null, 'CNY' ) );
    }

    // ─── Round 13 expansion (Apr 2026) — gap coverage ───────────────

    public function test_symbol_default_arg_is_thb(): void {
        // Many call sites omit the arg (PO with currency=null falls through to default).
        $this->assertSame( '฿', b2f_currency_symbol() );
    }

    public function test_symbol_empty_string_falls_back_to_empty(): void {
        // Defensive: PO with corrupted currency='' should not crash, returns ''.
        $this->assertSame( '', b2f_currency_symbol( '' ) );
    }

    public function test_symbol_lowercase_not_normalized(): void {
        // Spec is case-sensitive — admin must pass 'THB' uppercase. 'thb' falls
        // through map miss → returns input (locks invariant — prevents silent normalize regression).
        $this->assertSame( 'thb', b2f_currency_symbol( 'thb' ) );
    }

    public function test_format_default_currency_is_thb(): void {
        $this->assertSame( '฿500.00', b2f_format_currency( 500 ) );
    }

    public function test_format_integer_gets_two_decimals(): void {
        $this->assertSame( '$100.00', b2f_format_currency( 100, 'USD' ) );
    }

    public function test_format_rounding_half_up_at_5(): void {
        // PHP number_format: 1.234 → "1.23", 1.235 → "1.24" (half-up)
        $this->assertSame( '฿1.23', b2f_format_currency( 1.234, 'THB' ) );
        $this->assertSame( '฿1.24', b2f_format_currency( 1.235, 'THB' ) );
    }

    public function test_format_thousands_separator_for_999_999(): void {
        // Boundary: just under 1M
        $this->assertSame( '฿999,999.00', b2f_format_currency( 999999, 'THB' ) );
    }

    public function test_name_en_cny(): void {
        $this->assertSame( 'Chinese Yuan', b2f_currency_name_en( 'CNY' ) );
    }

    public function test_name_en_usd(): void {
        $this->assertSame( 'US Dollar', b2f_currency_name_en( 'USD' ) );
    }

    public function test_name_en_default_arg_is_thb(): void {
        $this->assertSame( 'Thai Baht', b2f_currency_name_en() );
    }

    public function test_name_en_empty_returns_empty(): void {
        $this->assertSame( '', b2f_currency_name_en( '' ) );
    }

    public function test_t_default_currency_arg_is_thb(): void {
        $this->assertSame( 'ไทย', b2f_t( 'ไทย', 'English', '中文' ) );
    }

    public function test_t_unknown_currency_treats_as_eng(): void {
        // 'JPY' not in (THB|CNY) → falls into "non-THB → EN" branch
        $this->assertSame( 'English', b2f_t( 'ไทย', 'English', '中文', 'JPY' ) );
    }

    public function test_t_cny_zero_string_is_truthy(): void {
        // '0' as Chinese should NOT trigger fallback (only '' and null fallback)
        $this->assertSame( '0', b2f_t( 'ศูนย์', 'Zero', '0', 'CNY' ) );
    }

    public function test_t_empty_thai_returns_empty_when_thb(): void {
        // Edge: caller passes empty TH — should NOT silently fall to EN
        $this->assertSame( '', b2f_t( '', 'English', '中文', 'THB' ) );
    }
}
