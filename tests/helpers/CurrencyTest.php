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
}
