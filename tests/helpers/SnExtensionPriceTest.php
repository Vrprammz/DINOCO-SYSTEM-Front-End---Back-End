<?php
/**
 * SnExtensionPriceTest — Q6 + Q8 F#8 extension price helpers.
 *
 * Source: [System] DINOCO SN REST API V.0.16+
 * Plan: docs/sn-system/08-f8-extension-marketplace-q6-q8-q7-q20-replan.md
 *
 * Boss decisions 2026-05-05:
 *   Q6: F#8 ย้ายเข้า Phase 4 W12-13 (was Phase 5)
 *   Q8: per-SKU manual pricing (admin กรอกราคาแต่ละ SKU ต่อปี)
 *
 * Helpers under test:
 *   dinoco_sn_get_extension_price($sku, $years) → float|null
 *   dinoco_sn_extension_available($sku) → array (years => price)
 *
 * Pure-logic mirror of helpers (no DB / no DINOCO_Catalog dep).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_get_ext_price' ) ) {
    /**
     * Mirror of dinoco_sn_get_extension_price using a fixture map
     * keyed by SKU. Tests substitute their own catalog map.
     */
    function sn_get_ext_price( $sku, $years, array $catalog ) {
        if ( ! in_array( (int) $years, array( 1, 2, 3 ), true ) ) return null;
        if ( empty( $sku ) ) return null;
        $sku = strtoupper( $sku );
        if ( ! isset( $catalog[ $sku ] ) ) return null;
        $product = $catalog[ $sku ];
        $col = "sn_ext_price_{$years}y";
        if ( ! array_key_exists( $col, $product ) ) return null;
        $price = $product[ $col ];
        if ( $price === null || $price === '' ) return null;
        $price = (float) $price;
        return $price >= 0 ? $price : null;
    }

    function sn_ext_available( $sku, array $catalog ): array {
        $available = array();
        foreach ( array( 1, 2, 3 ) as $years ) {
            $price = sn_get_ext_price( $sku, $years, $catalog );
            if ( $price !== null ) {
                $available[ $years ] = $price;
            }
        }
        return $available;
    }
}

class SnExtensionPriceTest extends TestCase {

    private function fixture(): array {
        return array(
            // SKU offers all 3 durations
            'DNCSS001' => array(
                'sn_ext_price_1y' => 1200.00,
                'sn_ext_price_2y' => 2160.00,
                'sn_ext_price_3y' => 3000.00,
            ),
            // SKU offers 1y + 2y only (3y NULL = not offered)
            'DNCSS002' => array(
                'sn_ext_price_1y' => 800.00,
                'sn_ext_price_2y' => 1500.00,
                'sn_ext_price_3y' => null,
            ),
            // SKU offers 1y only
            'DNCSS003' => array(
                'sn_ext_price_1y' => 500.00,
                'sn_ext_price_2y' => null,
                'sn_ext_price_3y' => null,
            ),
            // SKU not opted in (all NULL — no extension marketplace)
            'DNCSS004' => array(
                'sn_ext_price_1y' => null,
                'sn_ext_price_2y' => null,
                'sn_ext_price_3y' => null,
            ),
            // SKU with promo ฿0 (boss option — free extension)
            'DNCSS005' => array(
                'sn_ext_price_1y' => 0.00,
                'sn_ext_price_2y' => null,
                'sn_ext_price_3y' => null,
            ),
            // SKU with empty string price (legacy migration edge case)
            'DNCSS006' => array(
                'sn_ext_price_1y' => '',
                'sn_ext_price_2y' => '1000',  // string "1000" should coerce to float
                'sn_ext_price_3y' => null,
            ),
            // SKU with negative price (corrupted data — must reject)
            'DNCSS007' => array(
                'sn_ext_price_1y' => -100.00,
                'sn_ext_price_2y' => 1500.00,
                'sn_ext_price_3y' => null,
            ),
        );
    }

    public function test_get_price_3_durations_offered() {
        $cat = $this->fixture();
        $this->assertSame( 1200.00, sn_get_ext_price( 'DNCSS001', 1, $cat ) );
        $this->assertSame( 2160.00, sn_get_ext_price( 'DNCSS001', 2, $cat ) );
        $this->assertSame( 3000.00, sn_get_ext_price( 'DNCSS001', 3, $cat ) );
    }

    public function test_get_price_1y_2y_only() {
        $cat = $this->fixture();
        $this->assertSame( 800.00, sn_get_ext_price( 'DNCSS002', 1, $cat ) );
        $this->assertSame( 1500.00, sn_get_ext_price( 'DNCSS002', 2, $cat ) );
        $this->assertNull( sn_get_ext_price( 'DNCSS002', 3, $cat ) );
    }

    public function test_get_price_1y_only() {
        $cat = $this->fixture();
        $this->assertSame( 500.00, sn_get_ext_price( 'DNCSS003', 1, $cat ) );
        $this->assertNull( sn_get_ext_price( 'DNCSS003', 2, $cat ) );
        $this->assertNull( sn_get_ext_price( 'DNCSS003', 3, $cat ) );
    }

    public function test_get_price_sku_not_opted_in_returns_null() {
        $cat = $this->fixture();
        $this->assertNull( sn_get_ext_price( 'DNCSS004', 1, $cat ) );
        $this->assertNull( sn_get_ext_price( 'DNCSS004', 2, $cat ) );
        $this->assertNull( sn_get_ext_price( 'DNCSS004', 3, $cat ) );
    }

    public function test_get_price_zero_allowed_for_promo() {
        $cat = $this->fixture();
        $this->assertSame( 0.00, sn_get_ext_price( 'DNCSS005', 1, $cat ) );
    }

    public function test_get_price_invalid_years_returns_null() {
        $cat = $this->fixture();
        $this->assertNull( sn_get_ext_price( 'DNCSS001', 0, $cat ) );
        $this->assertNull( sn_get_ext_price( 'DNCSS001', 4, $cat ) );
        $this->assertNull( sn_get_ext_price( 'DNCSS001', -1, $cat ) );
        $this->assertNull( sn_get_ext_price( 'DNCSS001', 'two', $cat ) );
    }

    public function test_get_price_empty_sku_returns_null() {
        $cat = $this->fixture();
        $this->assertNull( sn_get_ext_price( '', 1, $cat ) );
    }

    public function test_get_price_unknown_sku_returns_null() {
        $cat = $this->fixture();
        $this->assertNull( sn_get_ext_price( 'DNCSS999', 1, $cat ) );
    }

    public function test_get_price_uppercase_normalize() {
        $cat = $this->fixture();
        // Lowercase input should resolve to uppercase key
        $this->assertSame( 1200.00, sn_get_ext_price( 'dncss001', 1, $cat ) );
        $this->assertSame( 1200.00, sn_get_ext_price( 'DnCsS001', 1, $cat ) );
    }

    public function test_get_price_empty_string_treated_as_null() {
        $cat = $this->fixture();
        $this->assertNull( sn_get_ext_price( 'DNCSS006', 1, $cat ) );
    }

    public function test_get_price_string_numeric_coerces_to_float() {
        $cat = $this->fixture();
        // "1000" string should coerce to float 1000.0
        $this->assertSame( 1000.0, sn_get_ext_price( 'DNCSS006', 2, $cat ) );
    }

    public function test_get_price_negative_rejected() {
        $cat = $this->fixture();
        // Defensive: corrupted -100 must return null (not allow refund-as-extension)
        $this->assertNull( sn_get_ext_price( 'DNCSS007', 1, $cat ) );
        // 2y on same SKU is valid — must still resolve
        $this->assertSame( 1500.00, sn_get_ext_price( 'DNCSS007', 2, $cat ) );
    }

    public function test_available_all_durations() {
        $cat = $this->fixture();
        $av = sn_ext_available( 'DNCSS001', $cat );
        $this->assertSame( array( 1 => 1200.00, 2 => 2160.00, 3 => 3000.00 ), $av );
    }

    public function test_available_1y_2y_only() {
        $cat = $this->fixture();
        $av = sn_ext_available( 'DNCSS002', $cat );
        $this->assertSame( array( 1 => 800.00, 2 => 1500.00 ), $av );
        $this->assertArrayNotHasKey( 3, $av );
    }

    public function test_available_empty_when_not_opted_in() {
        $cat = $this->fixture();
        $av = sn_ext_available( 'DNCSS004', $cat );
        $this->assertSame( array(), $av );
    }

    public function test_available_promo_zero_included() {
        $cat = $this->fixture();
        $av = sn_ext_available( 'DNCSS005', $cat );
        $this->assertSame( array( 1 => 0.00 ), $av );
    }

    public function test_available_unknown_sku_empty() {
        $cat = $this->fixture();
        $av = sn_ext_available( 'DNCSS999', $cat );
        $this->assertSame( array(), $av );
    }
}
