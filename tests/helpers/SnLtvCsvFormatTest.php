<?php
/**
 * SnLtvCsvFormatTest — pure-logic test of W10.3 LTV CSV row formatter.
 *
 * Source: [System] DINOCO SN REST API V.0.21+ — dinoco_sn_format_csv_row()
 *         + dinoco_sn_mask_phone_for_csv()
 * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §F.9
 * Phase: 3 W10.3
 *
 * Asserts RFC 4180 CSV escaping rules:
 *   - Standard cells (no special chars) → joined with comma
 *   - Cell with comma → escaped + quoted
 *   - Cell with newline → escaped + quoted
 *   - Cell with embedded quote → double-quote escape
 *   - Empty / null cells → empty string
 *   - Numeric cells → cast to string
 *   - Boolean cells → "1" / ""
 *   - Phone masking integration (last 4 digits visible)
 *
 * NOTE: pure-logic mirror — no DB, no WP runtime needed.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_format_csv_row' ) ) {
    /**
     * Mirror of dinoco_sn_format_csv_row().
     */
    function sn_format_csv_row( $cells ) {
        if ( ! is_array( $cells ) ) return '';
        $out = array();
        foreach ( $cells as $c ) {
            if ( $c === null ) {
                $out[] = '';
                continue;
            }
            if ( is_bool( $c ) ) {
                $c = $c ? '1' : '';
            } else {
                $c = (string) $c;
            }
            if ( strpbrk( $c, ",\"\n\r" ) !== false ) {
                $out[] = '"' . str_replace( '"', '""', $c ) . '"';
            } else {
                $out[] = $c;
            }
        }
        return implode( ',', $out );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_mask_phone_for_csv' ) ) {
    /**
     * Mirror of dinoco_sn_mask_phone_for_csv() inline-fallback path
     * (assumes outer dinoco_sn_mask_phone is unavailable in pure-logic test).
     */
    function sn_mask_phone_for_csv( $phone ) {
        $phone = trim( (string) $phone );
        if ( $phone === '' ) return '';
        $digits = preg_replace( '/\D+/', '', $phone );
        if ( strlen( $digits ) < 4 ) return str_repeat( 'x', strlen( $digits ) );
        return str_repeat( 'x', max( 0, strlen( $digits ) - 4 ) ) . substr( $digits, -4 );
    }
}

class SnLtvCsvFormatTest extends TestCase {

    /* ─── CSV formatter: simple cases ─── */

    public function test_standard_cells_comma_joined() {
        $row = sn_format_csv_row( array( 'abc', 'def', 'ghi' ) );
        $this->assertSame( 'abc,def,ghi', $row );
    }

    public function test_empty_array_returns_empty_string() {
        $this->assertSame( '', sn_format_csv_row( array() ) );
    }

    public function test_non_array_returns_empty_string() {
        $this->assertSame( '', sn_format_csv_row( 'not-array' ) );
        $this->assertSame( '', sn_format_csv_row( null ) );
    }

    /* ─── CSV formatter: RFC 4180 escaping ─── */

    public function test_cell_with_comma_quoted() {
        $row = sn_format_csv_row( array( 'a,b', 'c' ) );
        $this->assertSame( '"a,b",c', $row );
    }

    public function test_cell_with_double_quote_escaped() {
        $row = sn_format_csv_row( array( 'he said "hi"', 'ok' ) );
        $this->assertSame( '"he said ""hi""",ok', $row );
    }

    public function test_cell_with_newline_quoted() {
        $row = sn_format_csv_row( array( "line1\nline2", 'next' ) );
        $this->assertSame( "\"line1\nline2\",next", $row );
    }

    public function test_cell_with_carriage_return_quoted() {
        $row = sn_format_csv_row( array( "a\rb", 'c' ) );
        $this->assertSame( "\"a\rb\",c", $row );
    }

    public function test_cell_with_combined_special_chars() {
        // Comma + quote + newline all in one cell
        $row = sn_format_csv_row( array( "a,b\"c\nd", 'e' ) );
        $this->assertSame( "\"a,b\"\"c\nd\",e", $row );
    }

    /* ─── CSV formatter: type coercion ─── */

    public function test_null_cells_emit_empty() {
        $row = sn_format_csv_row( array( 'a', null, 'b' ) );
        $this->assertSame( 'a,,b', $row );
    }

    public function test_empty_string_emit_empty() {
        $row = sn_format_csv_row( array( 'a', '', 'b' ) );
        $this->assertSame( 'a,,b', $row );
    }

    public function test_integer_cells_coerced_to_string() {
        $row = sn_format_csv_row( array( 1, 2, 100 ) );
        $this->assertSame( '1,2,100', $row );
    }

    public function test_float_cells_coerced_to_string() {
        $row = sn_format_csv_row( array( 1.5, 2.0, 100.99 ) );
        // Note PHP float→string locale-independent ('1.5' not '1,5')
        $this->assertSame( '1.5,2,100.99', $row );
    }

    public function test_boolean_cells_coerced() {
        $row = sn_format_csv_row( array( true, false ) );
        $this->assertSame( '1,', $row );
    }

    /* ─── Phone masking integration ─── */

    public function test_mask_phone_keeps_last_4_digits() {
        $this->assertSame( 'xxxxxx5678', sn_mask_phone_for_csv( '0812345678' ) );
    }

    public function test_mask_phone_strips_separators_and_masks() {
        // dashes/spaces stripped → digits only
        $this->assertSame( 'xxxxxx5678', sn_mask_phone_for_csv( '081-234-5678' ) );
        $this->assertSame( 'xxxxxx5678', sn_mask_phone_for_csv( '081 234 5678' ) );
    }

    public function test_mask_phone_short_input_all_x() {
        // Less than 4 digits = mask all
        $this->assertSame( 'xxx', sn_mask_phone_for_csv( '123' ) );
    }

    public function test_mask_phone_empty_input_returns_empty() {
        $this->assertSame( '', sn_mask_phone_for_csv( '' ) );
        $this->assertSame( '', sn_mask_phone_for_csv( null ) );
    }

    public function test_full_row_with_masked_phone() {
        // Simulate one LTV CSV row — user_id, name, masked email, masked phone, tier, totals
        $masked_email = preg_replace( '/(.).*(@.*)/', '$1***$2', 'somchai.j@example.com' );
        $masked_phone = sn_mask_phone_for_csv( '081-234-5678' );
        $row = sn_format_csv_row( array(
            42,                         // user_id
            'Somchai J.',               // name
            $masked_email,              // s***@example.com
            $masked_phone,              // xxxxxx5678
            'gold',                     // tier
            5,                          // plates
            3,                          // active
            1,                          // claims
            '32500.00',                 // total spent
            '2024-03-15',               // first
            '2026-01-10',               // last
            '2.1',                      // member years
        ) );
        $this->assertStringContainsString( ',xxxxxx5678,', $row );
        $this->assertStringContainsString( 's***@example.com', $row );
        $this->assertStringContainsString( '32500.00', $row );
        $this->assertStringStartsWith( '42,Somchai J.,', $row );
    }

    public function test_full_row_with_unsafe_display_name_quoted() {
        // Display name with comma must be quoted
        $row = sn_format_csv_row( array(
            7,
            'Smith, John',  // contains comma — must quote
            'j***@x.com',
            'xxxxxx9999',
            'platinum',
        ) );
        $this->assertStringContainsString( '"Smith, John"', $row );
    }
}
