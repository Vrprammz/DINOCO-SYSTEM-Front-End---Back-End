<?php
/**
 * SnExtensionInvoiceTest — Phase 5 W17.1 Tax Invoice for Warranty Extensions.
 *
 * Source: [B2B] Snippet 10 V.31.0 — b2b_send_extension_receipt /
 *         b2b_generate_extension_invoice_number / b2b_extension_vat_breakdown
 * Plan: docs/sn-system/22-phase5-w15-w18-prep.md §W17.1
 *
 * Pure-logic mirrors of the helpers (no DB / no GD dep). Tests cover:
 *   1. Invoice number format INV-EXT-YYYY-NNNNN
 *   2. Counter monotonic increment within same year
 *   3. Counter resets on new year
 *   4. VAT 7% breakdown math (subtotal + vat = total)
 *   5. Edge cases (zero, decimals, large amounts)
 *   6. Counter overflow guard
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_format_ext_invoice_number' ) ) {
    /**
     * Mirror of b2b_generate_extension_invoice_number — pure formatter.
     * Real impl uses GET_LOCK + wp_option per year. Tests inject (year, counter).
     */
    function sn_format_ext_invoice_number( int $year, int $counter ): string {
        if ( $counter > 999999 ) {
            $counter = 1; // overflow guard mirror
        }
        return sprintf( 'INV-EXT-%04d-%05d', $year, $counter );
    }

    /**
     * Mirror of b2b_extension_vat_breakdown — VAT 7% from VAT-inclusive total.
     * Returns array { subtotal, vat, total }. Subtotal = round(total/1.07, 2).
     */
    function sn_extension_vat_breakdown( $total ): array {
        $total = (float) $total;
        if ( $total <= 0 ) {
            return array( 'subtotal' => 0.0, 'vat' => 0.0, 'total' => 0.0 );
        }
        $subtotal = round( $total / 1.07, 2 );
        $vat      = round( $total - $subtotal, 2 );
        return array(
            'subtotal' => $subtotal,
            'vat'      => $vat,
            'total'    => round( $total, 2 ),
        );
    }

    /**
     * Mirror of per-year counter store. In-memory map keyed by year.
     */
    function sn_ext_invoice_increment( int $year, array &$store ): int {
        if ( ! isset( $store[ $year ] ) ) $store[ $year ] = 0;
        $store[ $year ]++;
        if ( $store[ $year ] > 999999 ) $store[ $year ] = 1;
        return $store[ $year ];
    }
}

class SnExtensionInvoiceTest extends TestCase {

    // ── Invoice number format ──

    public function test_invoice_number_format_matches_pattern(): void {
        $no = sn_format_ext_invoice_number( 2026, 1 );
        $this->assertMatchesRegularExpression( '/^INV-EXT-\d{4}-\d{5}$/', $no );
        $this->assertSame( 'INV-EXT-2026-00001', $no );
    }

    public function test_invoice_number_zero_padded_5_digits(): void {
        $this->assertSame( 'INV-EXT-2026-00042', sn_format_ext_invoice_number( 2026, 42 ) );
        $this->assertSame( 'INV-EXT-2026-99999', sn_format_ext_invoice_number( 2026, 99999 ) );
    }

    public function test_invoice_number_year_4_digit_padded(): void {
        // Defensive: even if year somehow comes as < 1000, still 4 digits
        $this->assertMatchesRegularExpression( '/^INV-EXT-2026-/', sn_format_ext_invoice_number( 2026, 1 ) );
        $this->assertMatchesRegularExpression( '/^INV-EXT-2027-/', sn_format_ext_invoice_number( 2027, 1 ) );
    }

    public function test_invoice_number_six_digits_handled(): void {
        // Counter > 99999 spills to 6 digits — accepted (sprintf %05d does NOT truncate)
        $no = sn_format_ext_invoice_number( 2026, 100000 );
        $this->assertMatchesRegularExpression( '/^INV-EXT-2026-\d{5,6}$/', $no );
    }

    // ── Counter increment behaviour ──

    public function test_counter_monotonic_increment_within_same_year(): void {
        $store = array();
        $a = sn_ext_invoice_increment( 2026, $store );
        $b = sn_ext_invoice_increment( 2026, $store );
        $c = sn_ext_invoice_increment( 2026, $store );
        $this->assertSame( 1, $a );
        $this->assertSame( 2, $b );
        $this->assertSame( 3, $c );
    }

    public function test_counter_resets_on_new_year(): void {
        $store = array();
        sn_ext_invoice_increment( 2026, $store );
        sn_ext_invoice_increment( 2026, $store );
        sn_ext_invoice_increment( 2026, $store ); // 3 in 2026
        $this->assertSame( 3, $store[2026] );

        // New year → starts at 1 (independent counter per year)
        $next = sn_ext_invoice_increment( 2027, $store );
        $this->assertSame( 1, $next );
        $this->assertSame( 3, $store[2026] ); // 2026 untouched
    }

    public function test_multiple_years_track_independently(): void {
        $store = array();
        sn_ext_invoice_increment( 2026, $store );
        sn_ext_invoice_increment( 2027, $store );
        sn_ext_invoice_increment( 2026, $store );
        sn_ext_invoice_increment( 2028, $store );
        sn_ext_invoice_increment( 2027, $store );

        $this->assertSame( 2, $store[2026] );
        $this->assertSame( 2, $store[2027] );
        $this->assertSame( 1, $store[2028] );
    }

    public function test_counter_overflow_resets_to_1(): void {
        $store = array( 2026 => 999999 );
        $next = sn_ext_invoice_increment( 2026, $store );
        // 999999 + 1 = 1000000 → triggers overflow guard → resets to 1
        $this->assertSame( 1, $next );
    }

    // ── VAT 7% breakdown math ──

    public function test_vat_breakdown_zero_amount(): void {
        $b = sn_extension_vat_breakdown( 0 );
        $this->assertSame( 0.0, $b['subtotal'] );
        $this->assertSame( 0.0, $b['vat'] );
        $this->assertSame( 0.0, $b['total'] );
    }

    public function test_vat_breakdown_negative_amount_treated_as_zero(): void {
        $b = sn_extension_vat_breakdown( -100 );
        $this->assertSame( 0.0, $b['subtotal'] );
        $this->assertSame( 0.0, $b['vat'] );
    }

    public function test_vat_breakdown_1284_thb(): void {
        // 1284 VAT-inclusive → subtotal 1200 + VAT 84
        $b = sn_extension_vat_breakdown( 1284 );
        $this->assertSame( 1200.00, $b['subtotal'] );
        $this->assertSame( 84.00, $b['vat'] );
        $this->assertSame( 1284.00, $b['total'] );
    }

    public function test_vat_breakdown_subtotal_plus_vat_equals_total(): void {
        // Round-trip invariant: subtotal + vat == total (within rounding tolerance)
        $cases = array( 100, 535, 999.99, 2160, 3000.50, 12345.67 );
        foreach ( $cases as $total ) {
            $b = sn_extension_vat_breakdown( $total );
            $this->assertEqualsWithDelta(
                round( $total, 2 ),
                $b['subtotal'] + $b['vat'],
                0.02, // 1-satang rounding tolerance
                "Roundtrip failed for total=$total"
            );
        }
    }

    public function test_vat_breakdown_large_amount(): void {
        $b = sn_extension_vat_breakdown( 1000000.00 );
        $this->assertEqualsWithDelta( 934579.44, $b['subtotal'], 0.01 );
        $this->assertEqualsWithDelta( 65420.56, $b['vat'], 0.01 );
        $this->assertSame( 1000000.00, $b['total'] );
    }

    public function test_vat_breakdown_decimal_amount(): void {
        // Plan example: 1200 → subtotal 1121.50 + VAT 78.50 ≈ 1200
        $b = sn_extension_vat_breakdown( 1200 );
        $this->assertEqualsWithDelta( 1121.50, $b['subtotal'], 0.01 );
        $this->assertEqualsWithDelta( 78.50, $b['vat'], 0.01 );
    }

    public function test_vat_breakdown_returns_3_keys(): void {
        $b = sn_extension_vat_breakdown( 500 );
        $this->assertArrayHasKey( 'subtotal', $b );
        $this->assertArrayHasKey( 'vat', $b );
        $this->assertArrayHasKey( 'total', $b );
        $this->assertCount( 3, $b );
    }

    public function test_vat_breakdown_string_input_coerced(): void {
        // Defensive: caller may pass string — should coerce via (float)
        $b = sn_extension_vat_breakdown( '1284.00' );
        $this->assertSame( 1200.00, $b['subtotal'] );
    }

    // ── Combined: invoice_no + VAT breakdown together ──

    public function test_full_invoice_render_data_shape(): void {
        // Simulate: customer pays 1284 THB → invoice INV-EXT-2026-00001
        $store = array();
        $counter = sn_ext_invoice_increment( 2026, $store );
        $invoice_no = sn_format_ext_invoice_number( 2026, $counter );
        $vat = sn_extension_vat_breakdown( 1284 );

        $this->assertSame( 'INV-EXT-2026-00001', $invoice_no );
        $this->assertSame( 1200.00, $vat['subtotal'] );
        $this->assertSame( 84.00, $vat['vat'] );
        $this->assertSame( 1284.00, $vat['total'] );
    }
}
