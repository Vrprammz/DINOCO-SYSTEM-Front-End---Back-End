<?php
/**
 * SnGrayMarketTest — pure-logic test of F#13 gray market classifier.
 *
 * Source: [Admin System] DINOCO Production SN Manager V.0.28+
 * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §F#13
 * Phase: 3 W11.1
 *
 * Decision matrix:
 *   foreign country (CN/LA/KH/MY/MM)   → 'gray_market_suspect'
 *   TH + has dealer in province        → 'normal'
 *   TH + no dealer in province         → 'underserved_market'
 *   Unknown / empty country code       → 'normal' (defensive default)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_classify_gray_market' ) ) {
    /**
     * Mirror of dinoco_sn_classify_gray_market.
     */
    function sn_classify_gray_market( $country_code, $has_dealer ): string {
        $cc = strtoupper( trim( (string) $country_code ) );
        if ( $cc === '' ) return 'normal';

        $foreign = array( 'CN', 'LA', 'KH', 'MY', 'MM' );
        if ( in_array( $cc, $foreign, true ) ) {
            return 'gray_market_suspect';
        }
        if ( $cc === 'TH' && ! $has_dealer ) {
            return 'underserved_market';
        }
        return 'normal';
    }
}

class SnGrayMarketTest extends TestCase {

    /* ─── Foreign country (gray market suspects) ─── */

    public function test_china_returns_gray_market_suspect() {
        $this->assertSame( 'gray_market_suspect', sn_classify_gray_market( 'CN', false ) );
        $this->assertSame( 'gray_market_suspect', sn_classify_gray_market( 'CN', true ) );
    }

    public function test_laos_returns_gray_market_suspect() {
        $this->assertSame( 'gray_market_suspect', sn_classify_gray_market( 'LA', false ) );
    }

    public function test_cambodia_returns_gray_market_suspect() {
        $this->assertSame( 'gray_market_suspect', sn_classify_gray_market( 'KH', false ) );
    }

    public function test_malaysia_returns_gray_market_suspect() {
        $this->assertSame( 'gray_market_suspect', sn_classify_gray_market( 'MY', false ) );
    }

    public function test_myanmar_returns_gray_market_suspect() {
        $this->assertSame( 'gray_market_suspect', sn_classify_gray_market( 'MM', false ) );
    }

    /* ─── Thailand cases ─── */

    public function test_thailand_with_dealer_returns_normal() {
        $this->assertSame( 'normal', sn_classify_gray_market( 'TH', true ) );
    }

    public function test_thailand_without_dealer_returns_underserved() {
        $this->assertSame( 'underserved_market', sn_classify_gray_market( 'TH', false ) );
    }

    /* ─── Defensive defaults ─── */

    public function test_unknown_country_returns_normal() {
        $this->assertSame( 'normal', sn_classify_gray_market( 'XX', false ) );
        $this->assertSame( 'normal', sn_classify_gray_market( 'JP', false ) );
        $this->assertSame( 'normal', sn_classify_gray_market( 'US', true ) );
    }

    public function test_empty_country_returns_normal() {
        $this->assertSame( 'normal', sn_classify_gray_market( '', false ) );
        $this->assertSame( 'normal', sn_classify_gray_market( '', true ) );
    }

    public function test_whitespace_only_country_returns_normal() {
        $this->assertSame( 'normal', sn_classify_gray_market( '  ', false ) );
        $this->assertSame( 'normal', sn_classify_gray_market( "\t\n", true ) );
    }

    /* ─── Case insensitivity (uppercase normalization) ─── */

    public function test_lowercase_country_normalizes_to_uppercase() {
        $this->assertSame( 'gray_market_suspect', sn_classify_gray_market( 'cn', false ) );
        $this->assertSame( 'gray_market_suspect', sn_classify_gray_market( 'la', false ) );
        $this->assertSame( 'underserved_market', sn_classify_gray_market( 'th', false ) );
        $this->assertSame( 'normal', sn_classify_gray_market( 'th', true ) );
    }

    public function test_mixed_case_country_normalizes() {
        $this->assertSame( 'gray_market_suspect', sn_classify_gray_market( 'Cn', false ) );
        $this->assertSame( 'underserved_market', sn_classify_gray_market( 'Th', false ) );
    }

    /* ─── Whitespace trim ─── */

    public function test_country_code_with_whitespace_trims() {
        $this->assertSame( 'gray_market_suspect', sn_classify_gray_market( ' CN ', false ) );
        $this->assertSame( 'underserved_market', sn_classify_gray_market( "\tTH\n", false ) );
    }

    /* ─── Boolean coercion of has_dealer ─── */

    public function test_has_dealer_truthy_values_treated_as_true() {
        // PHP-style truthy: non-zero int, non-empty string
        $this->assertSame( 'normal', sn_classify_gray_market( 'TH', 1 ) );
        $this->assertSame( 'normal', sn_classify_gray_market( 'TH', 'yes' ) );
    }

    public function test_has_dealer_falsy_values_treated_as_false() {
        $this->assertSame( 'underserved_market', sn_classify_gray_market( 'TH', 0 ) );
        $this->assertSame( 'underserved_market', sn_classify_gray_market( 'TH', '' ) );
        $this->assertSame( 'underserved_market', sn_classify_gray_market( 'TH', null ) );
    }

    /* ─── Foreign country with dealer (still gray market — overrides has_dealer) ─── */

    public function test_foreign_country_with_dealer_still_gray_market() {
        // China activation even WITH a Chinese dealer = gray market for DINOCO Thailand
        // (DINOCO doesn't sell official channels in China — these would be re-imports)
        $this->assertSame( 'gray_market_suspect', sn_classify_gray_market( 'CN', true ) );
        $this->assertSame( 'gray_market_suspect', sn_classify_gray_market( 'LA', true ) );
    }

    /* ─── Return type guarantee ─── */

    public function test_return_value_is_always_string() {
        $this->assertIsString( sn_classify_gray_market( 'TH', true ) );
        $this->assertIsString( sn_classify_gray_market( 'CN', false ) );
        $this->assertIsString( sn_classify_gray_market( '', false ) );
        $this->assertIsString( sn_classify_gray_market( 'XX', true ) );
    }

    /* ─── Decision matrix completeness check ─── */

    public function test_all_foreign_countries_classified_consistently() {
        $foreign = array( 'CN', 'LA', 'KH', 'MY', 'MM' );
        foreach ( $foreign as $cc ) {
            $this->assertSame( 'gray_market_suspect', sn_classify_gray_market( $cc, false ),
                "Country $cc with no dealer should be gray_market_suspect" );
            $this->assertSame( 'gray_market_suspect', sn_classify_gray_market( $cc, true ),
                "Country $cc with dealer should still be gray_market_suspect" );
        }
    }
}
