<?php
/**
 * FormatDateThaiTest — pure-logic test of `b2f_format_date_thai()`.
 *
 * Source: [B2F] Snippet 1: Core Utilities & Flex Builders V.6.6+ line 1203.
 *
 * Function returns formatted date string `d/m/Y` from various input forms:
 *   - empty / null / 0      → '-'
 *   - invalid date string   → return as-is (passthrough)
 *   - valid date string     → 'DD/MM/YYYY' (zero-padded)
 *   - ISO timestamp         → 'DD/MM/YYYY'
 *   - already 'DD/MM/YYYY'  → re-parsed via strtotime (best-effort)
 *
 * Used in Flex builders + PO Image Generator + Maker LIFF for displaying
 * po_eta, po_delivered_at, po_paid_at fields. Wrong format = customer
 * confusion (e.g. "12/03" vs "03/12" ambiguity).
 *
 * NOTE: Function uses PHP's date() not wp_date(), so no WP timezone applied.
 * Server TZ assumed Asia/Bangkok per CLAUDE.md.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\b2f_format_date_thai' ) ) {
    function b2f_format_date_thai( $date_str ) {
        if ( empty( $date_str ) ) return '-';
        $ts = strtotime( $date_str );
        if ( ! $ts ) return $date_str;
        return date( 'd/m/Y', $ts );
    }
}

class FormatDateThaiTest extends TestCase {

    private string $original_tz;

    protected function setUp(): void {
        // Lock TZ to Bangkok per project convention so date() output is deterministic
        $this->original_tz = date_default_timezone_get();
        date_default_timezone_set( 'Asia/Bangkok' );
    }

    protected function tearDown(): void {
        date_default_timezone_set( $this->original_tz );
    }

    // ─── Empty / null / falsy inputs ─────────────────────────────
    public function test_empty_string_returns_dash(): void {
        $this->assertSame( '-', b2f_format_date_thai( '' ) );
    }

    public function test_null_returns_dash(): void {
        $this->assertSame( '-', b2f_format_date_thai( null ) );
    }

    public function test_zero_string_returns_dash(): void {
        // empty('0') === true in PHP — `'-'` expected
        $this->assertSame( '-', b2f_format_date_thai( '0' ) );
    }

    public function test_zero_int_returns_dash(): void {
        $this->assertSame( '-', b2f_format_date_thai( 0 ) );
    }

    public function test_false_returns_dash(): void {
        $this->assertSame( '-', b2f_format_date_thai( false ) );
    }

    // ─── Valid date inputs ───────────────────────────────────────
    public function test_iso_date_formats_correctly(): void {
        $this->assertSame( '15/03/2026', b2f_format_date_thai( '2026-03-15' ) );
    }

    public function test_iso_datetime_formats_correctly(): void {
        $this->assertSame( '15/03/2026', b2f_format_date_thai( '2026-03-15 14:30:00' ) );
    }

    public function test_year_first_month_padded(): void {
        // Single-digit month must zero-pad
        $this->assertSame( '05/01/2026', b2f_format_date_thai( '2026-01-05' ) );
    }

    public function test_full_iso_8601_timestamp(): void {
        $this->assertSame( '20/04/2026', b2f_format_date_thai( '2026-04-20T10:00:00+07:00' ) );
    }

    public function test_unix_timestamp_integer_via_at_prefix(): void {
        // strtotime('@1234567890') → epoch seconds. 1234567890 = 2009-02-13 23:31:30 UTC
        // In Bangkok TZ (+7) that's 2009-02-14 06:31:30
        $result = b2f_format_date_thai( '@1234567890' );
        $this->assertSame( '14/02/2009', $result );
    }

    // ─── Invalid date inputs (passthrough) ───────────────────────
    public function test_garbage_string_returns_as_is(): void {
        $this->assertSame( 'not-a-date', b2f_format_date_thai( 'not-a-date' ) );
    }

    public function test_garbage_with_dashes_returns_as_is(): void {
        $this->assertSame( 'abc-def-ghi', b2f_format_date_thai( 'abc-def-ghi' ) );
    }

    public function test_obviously_invalid_returns_as_is(): void {
        // 99-99-9999 cannot be parsed
        $result = b2f_format_date_thai( '99-99-9999' );
        // strtotime returns false for completely garbage; result is passthrough
        $this->assertSame( '99-99-9999', $result );
    }

    // ─── Edge cases ──────────────────────────────────────────────
    public function test_relative_date_today(): void {
        // strtotime('today') always parses, returns DD/MM/YYYY
        $result = b2f_format_date_thai( 'today' );
        $this->assertMatchesRegularExpression( '/^\d{2}\/\d{2}\/\d{4}$/', $result );
    }

    public function test_relative_date_now(): void {
        $result = b2f_format_date_thai( 'now' );
        $this->assertMatchesRegularExpression( '/^\d{2}\/\d{2}\/\d{4}$/', $result );
    }

    public function test_century_year(): void {
        $this->assertSame( '01/01/2100', b2f_format_date_thai( '2100-01-01' ) );
    }

    public function test_leap_day(): void {
        $this->assertSame( '29/02/2024', b2f_format_date_thai( '2024-02-29' ) );
    }

    public function test_dd_mm_yyyy_format_round_trip(): void {
        // Input already 'd/m/Y' — strtotime parses as US format (m/d/Y)
        // 15/03/2026 → strtotime → false (15 not valid month)
        // Function returns input as-is
        $result = b2f_format_date_thai( '15/03/2026' );
        $this->assertSame( '15/03/2026', $result );
    }

    public function test_ambiguous_us_format(): void {
        // 03/15/2026 (US) → strtotime parses → '15/03/2026' (Thai output)
        $this->assertSame( '15/03/2026', b2f_format_date_thai( '03/15/2026' ) );
    }
}
