<?php
/**
 * SnMarketplacePricingTest — Phase 5 W15 F#8 Marketplace pure-logic helpers.
 *
 * Source: [Admin System] DINOCO Production SN Manager V.0.31+
 * Plan:   docs/sn-system/22-phase5-w15-w18-prep.md §W15.1
 *
 * Boss bindings (2026-05-05):
 *   Q6  : "B แต่ทำให้ละเอียดที่สุด" — Phase 5 W15 (was W12)
 *   Q7  : Reuse Slip2Go เช็คสลิป + B2B_BANK_*
 *   Q8  : per-SKU manual pricing (admin sets each SKU/year price)
 *   Q20 : Manual refund flow (≥฿5K = 4-eyes)
 *
 * Helpers under test (4 pure-logic functions in Manager snippet):
 *   dinoco_sn_marketplace_format_price( $price )                         : string
 *   dinoco_sn_marketplace_classify_status( $status )                     : array
 *   dinoco_sn_marketplace_compute_savings( $base_1y, $multi, $years )    : float|null
 *   dinoco_sn_marketplace_validate_pricing( $prices )                    : array
 *
 * Strategy: pure-logic mirror — no DB, no WordPress dep. Tests substitute
 * their own inputs and assert on output structure.
 *
 * Coverage target: 18+ tests / 40+ assertions across 4 helpers + edge cases.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_mp_format_price' ) ) {
    /**
     * Mirror of dinoco_sn_marketplace_format_price.
     */
    function sn_mp_format_price( $price ): string {
        if ( $price === null || $price === '' ) return 'ไม่เปิด';
        if ( ! is_numeric( $price ) ) return 'ไม่เปิด';
        $val = (float) $price;
        if ( $val < 0 ) return 'ไม่เปิด';
        if ( $val == 0 ) return '฿0 (free)';
        return '฿' . number_format( $val, 0, '.', ',' );
    }

    /**
     * Mirror of dinoco_sn_marketplace_classify_status.
     */
    function sn_mp_classify_status( $status ): array {
        $status = is_string( $status ) ? strtolower( trim( $status ) ) : '';
        $map = array(
            'pending_payment'      => array( 'label' => 'รอชำระ',          'emoji' => '⏳', 'color' => '#f59e0b', 'css_class' => 'dnc-sn-mp-status-pending-payment' ),
            'pending_admin_review' => array( 'label' => 'รอ Admin ตรวจ',   'emoji' => '🔍', 'color' => '#3b82f6', 'css_class' => 'dnc-sn-mp-status-pending-review' ),
            'paid'                 => array( 'label' => 'จ่ายแล้ว',         'emoji' => '✅', 'color' => '#10b981', 'css_class' => 'dnc-sn-mp-status-paid' ),
            'expired'              => array( 'label' => 'หมดอายุ',         'emoji' => '⌛', 'color' => '#9ca3af', 'css_class' => 'dnc-sn-mp-status-expired' ),
            'refunded'             => array( 'label' => 'คืนเงินแล้ว',       'emoji' => '💸', 'color' => '#8b5cf6', 'css_class' => 'dnc-sn-mp-status-refunded' ),
            'rejected'             => array( 'label' => 'ปฏิเสธ',           'emoji' => '❌', 'color' => '#dc2626', 'css_class' => 'dnc-sn-mp-status-rejected' ),
            'cancelled'            => array( 'label' => 'ยกเลิก',           'emoji' => '🚫', 'color' => '#6b7280', 'css_class' => 'dnc-sn-mp-status-cancelled' ),
        );
        if ( isset( $map[ $status ] ) ) return $map[ $status ];
        return array( 'label' => 'ไม่ทราบ', 'emoji' => '❓', 'color' => '#9ca3af', 'css_class' => 'dnc-sn-mp-status-unknown' );
    }

    /**
     * Mirror of dinoco_sn_marketplace_compute_savings.
     */
    function sn_mp_compute_savings( $base_1y, $multi_year_price, $years ) {
        $years = (int) $years;
        if ( ! in_array( $years, array( 2, 3 ), true ) ) return null;
        if ( $base_1y === null || $base_1y === '' ) return null;
        if ( $multi_year_price === null || $multi_year_price === '' ) return null;
        $base = (float) $base_1y;
        $multi = (float) $multi_year_price;
        if ( $base <= 0 ) return null;
        if ( $multi < 0 ) return null;
        $naive = $base * $years;
        if ( $naive <= 0 ) return null;
        $saving_ratio = 1 - ( $multi / $naive );
        if ( $saving_ratio < 0 ) return 0.0;
        if ( $saving_ratio > 1 ) return 100.0;
        return round( $saving_ratio * 100, 1 );
    }

    /**
     * Mirror of dinoco_sn_marketplace_validate_pricing.
     */
    function sn_mp_validate_pricing( $prices ): array {
        $errors = array();
        if ( ! is_array( $prices ) ) {
            return array( 'ok' => false, 'errors' => array( 'invalid_payload' ) );
        }
        $normalized = array();
        foreach ( array( 'price_1y', 'price_2y', 'price_3y' ) as $key ) {
            $val = isset( $prices[ $key ] ) ? $prices[ $key ] : null;
            if ( $val === null || $val === '' ) {
                $normalized[ $key ] = null;
                continue;
            }
            if ( ! is_numeric( $val ) ) {
                $errors[] = "{$key}_not_numeric";
                $normalized[ $key ] = null;
                continue;
            }
            $f = (float) $val;
            if ( $f < 0 ) $errors[] = "{$key}_negative";
            if ( $f > 1000000 ) $errors[] = "{$key}_too_high";
            $normalized[ $key ] = $f;
        }
        if ( $normalized['price_1y'] !== null && $normalized['price_2y'] !== null ) {
            if ( $normalized['price_2y'] < $normalized['price_1y'] ) {
                $errors[] = 'price_2y_below_1y';
            }
        }
        if ( $normalized['price_2y'] !== null && $normalized['price_3y'] !== null ) {
            if ( $normalized['price_3y'] < $normalized['price_2y'] ) {
                $errors[] = 'price_3y_below_2y';
            }
        }
        if ( $normalized['price_1y'] !== null && $normalized['price_3y'] !== null && $normalized['price_2y'] === null ) {
            if ( $normalized['price_3y'] < $normalized['price_1y'] ) {
                $errors[] = 'price_3y_below_1y';
            }
        }
        return array(
            'ok'         => empty( $errors ),
            'errors'     => $errors,
            'normalized' => $normalized,
        );
    }
}

class SnMarketplacePricingTest extends TestCase {

    /* ─── format_price ─── */

    public function test_format_price_null_returns_disabled_label(): void {
        $this->assertSame( 'ไม่เปิด', sn_mp_format_price( null ) );
        $this->assertSame( 'ไม่เปิด', sn_mp_format_price( '' ) );
    }

    public function test_format_price_zero_returns_free_label(): void {
        $this->assertSame( '฿0 (free)', sn_mp_format_price( 0 ) );
        $this->assertSame( '฿0 (free)', sn_mp_format_price( '0' ) );
        $this->assertSame( '฿0 (free)', sn_mp_format_price( 0.0 ) );
    }

    public function test_format_price_positive_uses_thousands_separator(): void {
        $this->assertSame( '฿1,200',   sn_mp_format_price( 1200 ) );
        $this->assertSame( '฿1,500',   sn_mp_format_price( 1500.49 ) );  // rounds down
        $this->assertSame( '฿1,501',   sn_mp_format_price( 1500.50 ) );  // rounds up
        $this->assertSame( '฿100,000', sn_mp_format_price( 100000 ) );
        $this->assertSame( '฿1,234,567', sn_mp_format_price( 1234567 ) );
    }

    public function test_format_price_negative_returns_disabled(): void {
        // Negative is invalid → defensive "disabled" display
        $this->assertSame( 'ไม่เปิด', sn_mp_format_price( -100 ) );
        $this->assertSame( 'ไม่เปิด', sn_mp_format_price( -0.01 ) );
    }

    public function test_format_price_non_numeric_returns_disabled(): void {
        $this->assertSame( 'ไม่เปิด', sn_mp_format_price( 'abc' ) );
        $this->assertSame( 'ไม่เปิด', sn_mp_format_price( array( 1, 2 ) ) );
        // Numeric string IS accepted (PHP convention)
        $this->assertSame( '฿100', sn_mp_format_price( '100' ) );
    }

    /* ─── classify_status ─── */

    public function test_classify_status_all_seven_canonical_statuses(): void {
        $statuses = array( 'pending_payment', 'pending_admin_review', 'paid', 'expired', 'refunded', 'rejected', 'cancelled' );
        foreach ( $statuses as $s ) {
            $info = sn_mp_classify_status( $s );
            $this->assertIsArray( $info, "status {$s} returns array" );
            $this->assertArrayHasKey( 'label', $info );
            $this->assertArrayHasKey( 'emoji', $info );
            $this->assertArrayHasKey( 'color', $info );
            $this->assertArrayHasKey( 'css_class', $info );
            $this->assertNotEmpty( $info['label'], "status {$s} has non-empty label" );
            $this->assertStringStartsWith( '#', $info['color'], "status {$s} has hex color" );
            $this->assertStringStartsWith( 'dnc-sn-mp-status-', $info['css_class'] );
        }
    }

    public function test_classify_status_paid_has_correct_metadata(): void {
        $info = sn_mp_classify_status( 'paid' );
        $this->assertSame( 'จ่ายแล้ว', $info['label'] );
        $this->assertSame( '✅', $info['emoji'] );
        $this->assertSame( '#10b981', $info['color'] );  // green
    }

    public function test_classify_status_unknown_returns_fallback(): void {
        $info = sn_mp_classify_status( 'bogus_status' );
        $this->assertSame( 'ไม่ทราบ', $info['label'] );
        $this->assertSame( '❓', $info['emoji'] );
        $this->assertSame( 'dnc-sn-mp-status-unknown', $info['css_class'] );
    }

    public function test_classify_status_handles_uppercase_and_whitespace(): void {
        $this->assertSame( 'จ่ายแล้ว', sn_mp_classify_status( 'PAID' )['label'] );
        $this->assertSame( 'จ่ายแล้ว', sn_mp_classify_status( '  paid  ' )['label'] );
    }

    public function test_classify_status_non_string_input_safe(): void {
        $info = sn_mp_classify_status( null );
        $this->assertSame( 'ไม่ทราบ', $info['label'] );
        $info = sn_mp_classify_status( 123 );
        $this->assertSame( 'ไม่ทราบ', $info['label'] );
    }

    /* ─── compute_savings ─── */

    public function test_compute_savings_2y_at_18pct(): void {
        // base 1000, multi 1640 → naive 2000 → 1 - 1640/2000 = 0.18 = 18%
        $this->assertSame( 18.0, sn_mp_compute_savings( 1000, 1640, 2 ) );
    }

    public function test_compute_savings_3y_at_25pct(): void {
        // base 1000, multi 2250 → naive 3000 → 1 - 2250/3000 = 0.25 = 25%
        $this->assertSame( 25.0, sn_mp_compute_savings( 1000, 2250, 3 ) );
    }

    public function test_compute_savings_no_savings_clamps_to_zero(): void {
        // 2y priced same as naive → 0%
        $this->assertSame( 0.0, sn_mp_compute_savings( 1000, 2000, 2 ) );
        // 2y priced HIGHER than naive (admin error?) → clamped to 0 not negative
        $this->assertSame( 0.0, sn_mp_compute_savings( 1000, 2500, 2 ) );
    }

    public function test_compute_savings_invalid_years(): void {
        $this->assertNull( sn_mp_compute_savings( 1000, 2000, 1 ) );  // 1y has no savings to itself
        $this->assertNull( sn_mp_compute_savings( 1000, 2000, 4 ) );  // out of range
        $this->assertNull( sn_mp_compute_savings( 1000, 2000, 0 ) );
    }

    public function test_compute_savings_null_inputs(): void {
        $this->assertNull( sn_mp_compute_savings( null, 2000, 2 ) );
        $this->assertNull( sn_mp_compute_savings( 1000, null, 2 ) );
        $this->assertNull( sn_mp_compute_savings( '', 2000, 2 ) );
        $this->assertNull( sn_mp_compute_savings( 1000, '', 3 ) );
    }

    public function test_compute_savings_zero_base_returns_null(): void {
        $this->assertNull( sn_mp_compute_savings( 0, 1000, 2 ) );
        $this->assertNull( sn_mp_compute_savings( -100, 1000, 2 ) );
    }

    public function test_compute_savings_negative_multi_returns_null(): void {
        $this->assertNull( sn_mp_compute_savings( 1000, -100, 2 ) );
    }

    /* ─── validate_pricing ─── */

    public function test_validate_pricing_all_null_is_ok_extensions_disabled(): void {
        $res = sn_mp_validate_pricing( array(
            'price_1y' => null,
            'price_2y' => null,
            'price_3y' => null,
        ) );
        $this->assertTrue( $res['ok'] );
        $this->assertEmpty( $res['errors'] );
    }

    public function test_validate_pricing_partial_null_is_ok(): void {
        // Only 1y enabled
        $res = sn_mp_validate_pricing( array(
            'price_1y' => 1200,
            'price_2y' => null,
            'price_3y' => null,
        ) );
        $this->assertTrue( $res['ok'] );

        // 1y + 2y, no 3y
        $res2 = sn_mp_validate_pricing( array(
            'price_1y' => 1200,
            'price_2y' => 2000,
            'price_3y' => null,
        ) );
        $this->assertTrue( $res2['ok'] );
    }

    public function test_validate_pricing_negative_rejected(): void {
        $res = sn_mp_validate_pricing( array(
            'price_1y' => -100,
            'price_2y' => null,
            'price_3y' => null,
        ) );
        $this->assertFalse( $res['ok'] );
        $this->assertContains( 'price_1y_negative', $res['errors'] );
    }

    public function test_validate_pricing_too_high_rejected(): void {
        $res = sn_mp_validate_pricing( array(
            'price_1y' => 2000000,  // > 1M cap
            'price_2y' => null,
            'price_3y' => null,
        ) );
        $this->assertFalse( $res['ok'] );
        $this->assertContains( 'price_1y_too_high', $res['errors'] );
    }

    public function test_validate_pricing_2y_below_1y_rejected_illogical(): void {
        $res = sn_mp_validate_pricing( array(
            'price_1y' => 2000,
            'price_2y' => 1500,  // 2y package cheaper than 1y — admin error
            'price_3y' => null,
        ) );
        $this->assertFalse( $res['ok'] );
        $this->assertContains( 'price_2y_below_1y', $res['errors'] );
    }

    public function test_validate_pricing_3y_below_2y_rejected_illogical(): void {
        $res = sn_mp_validate_pricing( array(
            'price_1y' => 1000,
            'price_2y' => 2000,
            'price_3y' => 1800,  // 3y cheaper than 2y — illogical
        ) );
        $this->assertFalse( $res['ok'] );
        $this->assertContains( 'price_3y_below_2y', $res['errors'] );
    }

    public function test_validate_pricing_3y_below_1y_when_2y_skipped(): void {
        // Edge case: 1y=1000, no 2y, 3y=800 → still illogical
        $res = sn_mp_validate_pricing( array(
            'price_1y' => 1000,
            'price_2y' => null,
            'price_3y' => 800,
        ) );
        $this->assertFalse( $res['ok'] );
        $this->assertContains( 'price_3y_below_1y', $res['errors'] );
    }

    public function test_validate_pricing_non_numeric_rejected(): void {
        $res = sn_mp_validate_pricing( array(
            'price_1y' => 'abc',
            'price_2y' => null,
            'price_3y' => null,
        ) );
        $this->assertFalse( $res['ok'] );
        $this->assertContains( 'price_1y_not_numeric', $res['errors'] );
    }

    public function test_validate_pricing_invalid_payload_rejected(): void {
        $res = sn_mp_validate_pricing( 'not an array' );
        $this->assertFalse( $res['ok'] );
        $this->assertContains( 'invalid_payload', $res['errors'] );
    }

    public function test_validate_pricing_normalized_field_returns_floats(): void {
        $res = sn_mp_validate_pricing( array(
            'price_1y' => '1200',     // string numeric
            'price_2y' => 2000,        // int
            'price_3y' => null,
        ) );
        $this->assertTrue( $res['ok'] );
        $this->assertSame( 1200.0, $res['normalized']['price_1y'] );
        $this->assertSame( 2000.0, $res['normalized']['price_2y'] );
        $this->assertNull( $res['normalized']['price_3y'] );
    }

    public function test_validate_pricing_realistic_3tier_offer(): void {
        // typical: 1y=1200, 2y=2160 (10% off), 3y=3000 (17% off)
        $res = sn_mp_validate_pricing( array(
            'price_1y' => 1200,
            'price_2y' => 2160,
            'price_3y' => 3000,
        ) );
        $this->assertTrue( $res['ok'] );
        $this->assertEmpty( $res['errors'] );
    }
}
