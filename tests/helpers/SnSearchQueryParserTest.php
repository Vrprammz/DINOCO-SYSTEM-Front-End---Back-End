<?php
/**
 * SnSearchQueryParserTest — pure-logic test of Tab 4 power-user query parser.
 *
 * Source: [Admin System] DINOCO Production SN Manager V.0.25+
 *   function dinoco_sn_parse_search_query()
 *
 * Plan reference: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §K.2.1
 * Phase: 2 W5.1 (Universal Search query syntax)
 *
 * Pattern follows SnHierarchyTest.php — pure logic mirror, in-memory.
 *
 * Coverage:
 *   - exact S/N detection
 *   - prefix / suffix / contains wildcard patterns
 *   - all 8 power-user filter prefixes (phone/line/order/sku/batch/status/since/actor)
 *   - free-text fallback
 *   - mixed multi-token queries
 *   - empty / whitespace / unknown prefix handling
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/**
 * Mirror of dinoco_sn_parse_search_query() — pure logic without WP dependencies.
 *
 * Must stay byte-equivalent in semantics with the live snippet helper.
 * If snippet helper changes, mirror MUST be updated and tests re-run.
 */
if ( ! function_exists( __NAMESPACE__ . '\\sn_parse_search_query' ) ) {
    function sn_parse_search_query( $q ): array {
        $q = is_string( $q ) ? trim( $q ) : '';
        $result = array(
            'exact_sn'      => null,
            'pattern'       => null,
            'pattern_value' => null,
            'filters'       => array(
                'phone'        => null,
                'line'         => null,
                'order_id'     => null,
                'sku'          => null,
                'batch_id'     => null,
                'status'       => null,
                'since'        => null,
                'actor_login'  => null,
            ),
            'free_text' => null,
            'raw'       => $q,
        );
        if ( $q === '' ) return $result;

        $tokens = preg_split( '/\s+/', $q );
        $free_words = array();

        foreach ( $tokens as $tok ) {
            if ( $tok === '' ) continue;
            $colon = strpos( $tok, ':' );
            if ( $colon !== false && $colon > 0 ) {
                $key = strtolower( substr( $tok, 0, $colon ) );
                $val = trim( substr( $tok, $colon + 1 ) );
                if ( $val === '' ) continue;
                switch ( $key ) {
                    case 'phone':
                        $result['filters']['phone'] = preg_replace( '/\D+/', '', $val );
                        break;
                    case 'line':
                    case 'line_name':
                        $result['filters']['line'] = $val;
                        break;
                    case 'order':
                    case 'order_id':
                        $result['filters']['order_id'] = (int) $val;
                        break;
                    case 'sku':
                        $result['filters']['sku'] = strtoupper( $val );
                        break;
                    case 'batch':
                    case 'batch_id':
                        $result['filters']['batch_id'] = (int) $val;
                        break;
                    case 'status':
                        $result['filters']['status'] = strtolower( $val );
                        break;
                    case 'since':
                        $result['filters']['since'] = $val;
                        break;
                    case 'actor':
                    case 'actor_login':
                        $result['filters']['actor_login'] = $val;
                        break;
                    default:
                        $free_words[] = $tok;
                }
                continue;
            }

            if ( strpos( $tok, '*' ) !== false ) {
                $upper = strtoupper( $tok );
                $first = $upper[0];
                $last  = substr( $upper, -1 );
                if ( $first === '*' && $last === '*' ) {
                    $result['pattern']       = 'contains';
                    $result['pattern_value'] = trim( $upper, '*' );
                } elseif ( $last === '*' ) {
                    $result['pattern']       = 'prefix';
                    $result['pattern_value'] = rtrim( $upper, '*' );
                } elseif ( $first === '*' ) {
                    $result['pattern']       = 'suffix';
                    $result['pattern_value'] = ltrim( $upper, '*' );
                } else {
                    $result['pattern']       = 'contains';
                    $result['pattern_value'] = str_replace( '*', '', $upper );
                }
                continue;
            }

            if ( $result['exact_sn'] === null
                && preg_match( '/^[A-Za-z0-9._-]{4,}$/', $tok )
                && preg_match( '/[A-Za-z]/', $tok )
                && strlen( $tok ) >= 6
            ) {
                $result['exact_sn'] = strtoupper( $tok );
                continue;
            }

            $free_words[] = $tok;
        }

        if ( $free_words ) {
            $result['free_text'] = implode( ' ', $free_words );
        }
        return $result;
    }
}

final class SnSearchQueryParserTest extends TestCase {

    public function test_empty_query_returns_struct_with_nulls(): void {
        $r = sn_parse_search_query( '' );
        $this->assertNull( $r['exact_sn'] );
        $this->assertNull( $r['pattern'] );
        $this->assertNull( $r['free_text'] );
        $this->assertSame( '', $r['raw'] );
    }

    public function test_whitespace_only_query_returns_empty(): void {
        $r = sn_parse_search_query( "   \t  " );
        $this->assertNull( $r['exact_sn'] );
        $this->assertNull( $r['free_text'] );
    }

    public function test_exact_sn_detected_for_long_alnum_token(): void {
        $r = sn_parse_search_query( 'DNCSS0001234' );
        $this->assertSame( 'DNCSS0001234', $r['exact_sn'] );
        $this->assertNull( $r['pattern'] );
    }

    public function test_exact_sn_uppercased(): void {
        $r = sn_parse_search_query( 'dncss0001234' );
        $this->assertSame( 'DNCSS0001234', $r['exact_sn'] );
    }

    public function test_short_token_not_classified_as_sn(): void {
        // "abc" is too short (<6 chars) — falls to free_text
        $r = sn_parse_search_query( 'abc' );
        $this->assertNull( $r['exact_sn'] );
        $this->assertSame( 'abc', $r['free_text'] );
    }

    public function test_prefix_wildcard_pattern(): void {
        $r = sn_parse_search_query( 'DNCSS*' );
        $this->assertNull( $r['exact_sn'] );
        $this->assertSame( 'prefix', $r['pattern'] );
        $this->assertSame( 'DNCSS', $r['pattern_value'] );
    }

    public function test_suffix_wildcard_pattern(): void {
        $r = sn_parse_search_query( '*1234' );
        $this->assertSame( 'suffix', $r['pattern'] );
        $this->assertSame( '1234', $r['pattern_value'] );
    }

    public function test_contains_wildcard_both_sides(): void {
        $r = sn_parse_search_query( '*MID*' );
        $this->assertSame( 'contains', $r['pattern'] );
        $this->assertSame( 'MID', $r['pattern_value'] );
    }

    public function test_phone_filter_strips_non_digits(): void {
        $r = sn_parse_search_query( 'phone:081-234-5678' );
        $this->assertSame( '0812345678', $r['filters']['phone'] );
    }

    public function test_line_filter_preserves_case_and_underscore(): void {
        $r = sn_parse_search_query( 'line:Somchai_J' );
        $this->assertSame( 'Somchai_J', $r['filters']['line'] );
    }

    public function test_sku_filter_uppercased(): void {
        $r = sn_parse_search_query( 'sku:dncgnd45l002' );
        $this->assertSame( 'DNCGND45L002', $r['filters']['sku'] );
    }

    public function test_batch_filter_int_coerced(): void {
        $r = sn_parse_search_query( 'batch:42' );
        $this->assertSame( 42, $r['filters']['batch_id'] );
    }

    public function test_status_filter_lowercased(): void {
        $r = sn_parse_search_query( 'status:REGISTERED' );
        $this->assertSame( 'registered', $r['filters']['status'] );
    }

    public function test_since_filter_passes_through(): void {
        $r = sn_parse_search_query( 'since:2026-05-01' );
        $this->assertSame( '2026-05-01', $r['filters']['since'] );
    }

    public function test_actor_filter_preserved(): void {
        $r = sn_parse_search_query( 'actor:warehouse_admin_a' );
        $this->assertSame( 'warehouse_admin_a', $r['filters']['actor_login'] );
    }

    public function test_order_id_int_coerced(): void {
        $r = sn_parse_search_query( 'order:6789' );
        $this->assertSame( 6789, $r['filters']['order_id'] );
    }

    public function test_combined_sku_and_status_filters(): void {
        $r = sn_parse_search_query( 'sku:DNCGND45L002 status:in_pool' );
        $this->assertSame( 'DNCGND45L002', $r['filters']['sku'] );
        $this->assertSame( 'in_pool', $r['filters']['status'] );
        $this->assertNull( $r['exact_sn'] );
        $this->assertNull( $r['free_text'] );
    }

    public function test_mixed_query_with_sn_and_filter(): void {
        $r = sn_parse_search_query( 'DNCSS0001234 status:registered' );
        $this->assertSame( 'DNCSS0001234', $r['exact_sn'] );
        $this->assertSame( 'registered', $r['filters']['status'] );
    }

    public function test_unknown_prefix_falls_to_free_text(): void {
        $r = sn_parse_search_query( 'foo:bar' );
        $this->assertSame( 'foo:bar', $r['free_text'] );
    }

    public function test_empty_value_after_colon_skipped(): void {
        // "phone:" with empty value should NOT crash, value stays null
        $r = sn_parse_search_query( 'phone:' );
        $this->assertNull( $r['filters']['phone'] );
    }

    public function test_raw_query_preserved(): void {
        $q = 'sku:X status:registered some_text';
        $r = sn_parse_search_query( $q );
        $this->assertSame( $q, $r['raw'] );
    }
}
