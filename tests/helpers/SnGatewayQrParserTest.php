<?php
/**
 * SnGatewayQrParserTest — pure-logic test of the gateway QR / S/N parser.
 *
 * Source of truth: [System] DINOCO Gateway V.31.0
 *   inline JS function `dinoco_gateway_qr_parse(raw)` exposed as
 *   `window.dinocoGatewayQrParse`.
 *
 * Plan reference: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.7
 * Phase: 2 W6.1 — Unified Flow Option B (boss decision Q3 binding)
 *
 * Boss R3 (2026-05-07) — QR Content format = B (URL with sn= param).
 *   Customer scans QR with phone camera → opens
 *   https://dinoco.in.th/warranty/activate?sn=DNCSS0001234
 *
 * Pattern: pure logic, no WP dependencies. We re-implement the JS
 * parsing rules in PHP to keep the contract testable in PHPUnit
 * alongside CurrencyTest / HierarchyTest / SnHierarchyTest.
 *
 * Contract:
 *   - URL form (boss R3 format B): extract `sn` query param → uppercase →
 *     validate against /^DNCSS\d{4,12}$/ (primary) or /^[A-Z0-9]{8,16}$/ (fallback)
 *   - Raw S/N text: uppercase → validate same regexes
 *   - Other domains/extra params: still extract sn= gracefully
 *   - Invalid input: return null (caller shows "รูปแบบ S/N ไม่ถูกต้อง")
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/**
 * PHP mirror of the JS `dinoco_gateway_qr_parse(raw)` function in
 * [System] DINOCO Gateway V.31.0.
 *
 * Returns the normalized uppercase S/N on success, null on rejection.
 */
if ( ! function_exists( __NAMESPACE__ . '\\dinoco_gateway_qr_parse' ) ) {
    function dinoco_gateway_qr_parse( $raw ) {
        if ( $raw === null ) return null;
        $s = trim( (string) $raw );
        if ( $s === '' ) return null;

        $primary  = '/^DNCSS\d{4,12}$/';
        $fallback = '/^[A-Z0-9]{8,16}$/';

        // URL form first (boss R3 format B).
        if ( preg_match( '/^https?:\/\//i', $s ) ) {
            $parts = parse_url( $s );
            if ( ! is_array( $parts ) || empty( $parts['query'] ) ) {
                return null;
            }
            $params = array();
            parse_str( $parts['query'], $params );
            if ( ! isset( $params['sn'] ) ) return null;
            $up = strtoupper( trim( (string) $params['sn'] ) );
            if ( preg_match( $primary, $up ) || preg_match( $fallback, $up ) ) {
                return $up;
            }
            return null;
        }

        // Raw S/N text path.
        $up2 = strtoupper( $s );
        if ( preg_match( $primary, $up2 ) || preg_match( $fallback, $up2 ) ) {
            return $up2;
        }
        return null;
    }
}

final class SnGatewayQrParserTest extends TestCase {

    public function test_url_form_canonical_dinoco_domain(): void {
        $url = 'https://dinoco.in.th/warranty/activate?sn=DNCSS0001234';
        $this->assertSame( 'DNCSS0001234', dinoco_gateway_qr_parse( $url ) );
    }

    public function test_url_form_with_extra_params_passthrough(): void {
        $url = 'https://dinoco.in.th/warranty/activate?sn=DNCSS0001234&utm_source=qr&utm_campaign=launch';
        $this->assertSame( 'DNCSS0001234', dinoco_gateway_qr_parse( $url ) );
    }

    public function test_url_form_other_domain_still_extracts_sn(): void {
        // Boss R3 format B is only authoritative on dinoco.in.th, but
        // we accept other hosts gracefully — we only care about ?sn=.
        $url = 'https://other.com/?sn=DNCSS0009999';
        $this->assertSame( 'DNCSS0009999', dinoco_gateway_qr_parse( $url ) );
    }

    public function test_url_form_lowercase_sn_normalized_to_upper(): void {
        $url = 'https://dinoco.in.th/warranty/activate?sn=dncss0001234';
        $this->assertSame( 'DNCSS0001234', dinoco_gateway_qr_parse( $url ) );
    }

    public function test_url_form_missing_sn_param_returns_null(): void {
        $url = 'https://dinoco.in.th/warranty/activate?utm_source=qr';
        $this->assertNull( dinoco_gateway_qr_parse( $url ) );
    }

    public function test_url_form_invalid_sn_param_returns_null(): void {
        // Has sn= but value fails both regexes (too short).
        $url = 'https://dinoco.in.th/warranty/activate?sn=ABC';
        $this->assertNull( dinoco_gateway_qr_parse( $url ) );
    }

    public function test_raw_sn_text_canonical(): void {
        $this->assertSame( 'DNCSS0001234', dinoco_gateway_qr_parse( 'DNCSS0001234' ) );
    }

    public function test_raw_sn_text_lowercase_normalized(): void {
        $this->assertSame( 'DNCSS0001234', dinoco_gateway_qr_parse( 'dncss0001234' ) );
    }

    public function test_raw_sn_text_with_whitespace_trimmed(): void {
        $this->assertSame( 'DNCSS0001234', dinoco_gateway_qr_parse( '  DNCSS0001234  ' ) );
    }

    public function test_raw_sn_fallback_regex_alphanumeric(): void {
        // Generic [A-Z0-9]{8,16} fallback (legacy or non-DNCSS format).
        $this->assertSame( 'ABC1234567', dinoco_gateway_qr_parse( 'ABC1234567' ) );
    }

    public function test_raw_sn_too_short_returns_null(): void {
        // 7 chars — fails both primary (DNCSS\d{4,12}) and fallback ({8,16}).
        $this->assertNull( dinoco_gateway_qr_parse( 'ABC1234' ) );
    }

    public function test_raw_sn_too_long_returns_null(): void {
        // 17 chars — fails fallback {8,16}.
        $this->assertNull( dinoco_gateway_qr_parse( 'ABCDEFGHIJ12345678' ) );
    }

    public function test_empty_string_returns_null(): void {
        $this->assertNull( dinoco_gateway_qr_parse( '' ) );
    }

    public function test_null_input_returns_null(): void {
        $this->assertNull( dinoco_gateway_qr_parse( null ) );
    }

    public function test_garbage_input_returns_null(): void {
        $this->assertNull( dinoco_gateway_qr_parse( 'random nonsense text 🚀' ) );
    }
}
