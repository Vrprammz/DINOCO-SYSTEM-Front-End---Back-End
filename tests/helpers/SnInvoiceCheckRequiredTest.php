<?php
/**
 * SnInvoiceCheckRequiredTest — Phase 2 W6.2 Manual Invoice SN allocation scan.
 *
 * Source: [Admin System] DINOCO Manual Invoice System V.35.0
 * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §B2 + Q15
 *
 * Helper under test: dinoco_inv_check_sn_required_items($invoice_id)
 *
 * Pure-logic mirror — no DB. Validates the scanning rules:
 *   - sn_attach_level === 'none' OR empty → skip
 *   - sn_required === 0 → skip
 *   - Both ON → include in pending list
 *   - plates_needed = qty * sn_qty_per_unit (when no hierarchy resolver)
 *   - DD-3 dedup deferred to dinoco_sn_required_plates_for_sku() helper
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_inv_check' ) ) {
    /**
     * Mirror of dinoco_inv_check_sn_required_items using fixture catalog.
     *
     * @param array $items   Array of {sku, qty}
     * @param array $catalog Map sku => { sn_attach_level, sn_required, sn_qty_per_unit }
     * @return array         Filtered list of pending items
     */
    function sn_inv_check( array $items, array $catalog ): array {
        if ( empty( $items ) ) return array();
        $pending = array();
        foreach ( $items as $item ) {
            $sku = isset( $item['sku'] ) ? strtoupper( trim( (string) $item['sku'] ) ) : '';
            $qty = isset( $item['qty'] ) ? max( 1, (int) $item['qty'] ) : 1;
            if ( $sku === '' ) continue;
            if ( ! isset( $catalog[ $sku ] ) ) continue;
            $row = $catalog[ $sku ];
            if ( empty( $row['sn_required'] ) ) continue;
            $level = $row['sn_attach_level'] ?? 'none';
            if ( $level === 'none' || $level === '' ) continue;

            $plates_needed = $qty * max( 1, (int) ( $row['sn_qty_per_unit'] ?? 1 ) );
            $pending[] = array(
                'sku'           => $sku,
                'qty'           => $qty,
                'level'         => $level,
                'qty_per_unit'  => (int) ( $row['sn_qty_per_unit'] ?? 1 ),
                'plates_needed' => $plates_needed,
            );
        }
        return $pending;
    }
}

class SnInvoiceCheckRequiredTest extends TestCase {

    private function fixture(): array {
        return array(
            // SKU needs plates (boss example DNCSETXL750)
            'SETXL750' => array(
                'sn_attach_level' => 'set',
                'sn_required'     => 1,
                'sn_qty_per_unit' => 1,
            ),
            // SKU needs plates × 2 per unit (NX500 child)
            'SETNX500' => array(
                'sn_attach_level' => 'child',
                'sn_required'     => 1,
                'sn_qty_per_unit' => 1,
            ),
            // SKU has plate but not required (optional)
            'OPTIONAL_SET' => array(
                'sn_attach_level' => 'set',
                'sn_required'     => 0,
                'sn_qty_per_unit' => 1,
            ),
            // SKU = single product, no plate
            'SINGLE_PROD' => array(
                'sn_attach_level' => 'none',
                'sn_required'     => 0,
                'sn_qty_per_unit' => 1,
            ),
            // SKU with sn_qty_per_unit = 2 (special — 2 plates per unit)
            'DUAL_PLATE_SKU' => array(
                'sn_attach_level' => 'set',
                'sn_required'     => 1,
                'sn_qty_per_unit' => 2,
            ),
            // SKU with empty attach_level (legacy migration edge case)
            'LEGACY_EMPTY' => array(
                'sn_attach_level' => '',
                'sn_required'     => 1,  // even if required, empty level → skip
                'sn_qty_per_unit' => 1,
            ),
        );
    }

    public function test_empty_invoice_items_returns_empty() {
        $result = sn_inv_check( array(), $this->fixture() );
        $this->assertSame( array(), $result );
    }

    public function test_single_set_required_returned() {
        $result = sn_inv_check(
            array( array( 'sku' => 'SETXL750', 'qty' => 1 ) ),
            $this->fixture()
        );
        $this->assertCount( 1, $result );
        $this->assertSame( 'SETXL750', $result[0]['sku'] );
        $this->assertSame( 1, $result[0]['plates_needed'] );
        $this->assertSame( 'set', $result[0]['level'] );
    }

    public function test_set_with_qty_5_needs_5_plates() {
        $result = sn_inv_check(
            array( array( 'sku' => 'SETXL750', 'qty' => 5 ) ),
            $this->fixture()
        );
        $this->assertSame( 5, $result[0]['plates_needed'] );
    }

    public function test_dual_plate_sku_doubles_count() {
        // sn_qty_per_unit=2 × qty=3 = 6 plates
        $result = sn_inv_check(
            array( array( 'sku' => 'DUAL_PLATE_SKU', 'qty' => 3 ) ),
            $this->fixture()
        );
        $this->assertSame( 6, $result[0]['plates_needed'] );
        $this->assertSame( 2, $result[0]['qty_per_unit'] );
    }

    public function test_optional_sn_skipped() {
        // sn_required=0 → skip (admin chooses not to allocate)
        $result = sn_inv_check(
            array( array( 'sku' => 'OPTIONAL_SET', 'qty' => 10 ) ),
            $this->fixture()
        );
        $this->assertSame( array(), $result );
    }

    public function test_single_product_no_plate_skipped() {
        // sn_attach_level=none → skip
        $result = sn_inv_check(
            array( array( 'sku' => 'SINGLE_PROD', 'qty' => 100 ) ),
            $this->fixture()
        );
        $this->assertSame( array(), $result );
    }

    public function test_legacy_empty_level_skipped() {
        // sn_attach_level='' (migration edge) → skip
        $result = sn_inv_check(
            array( array( 'sku' => 'LEGACY_EMPTY', 'qty' => 1 ) ),
            $this->fixture()
        );
        $this->assertSame( array(), $result );
    }

    public function test_unknown_sku_skipped() {
        // SKU not in catalog → skip (defensive)
        $result = sn_inv_check(
            array( array( 'sku' => 'UNKNOWN_SKU', 'qty' => 1 ) ),
            $this->fixture()
        );
        $this->assertSame( array(), $result );
    }

    public function test_mixed_invoice_filters_correctly() {
        // 5 items, only 3 need plates
        $result = sn_inv_check(
            array(
                array( 'sku' => 'SETXL750',     'qty' => 2 ),    // 2 plates
                array( 'sku' => 'OPTIONAL_SET', 'qty' => 3 ),    // skipped (not required)
                array( 'sku' => 'SETNX500',     'qty' => 1 ),    // 1 plate (child level — actual plates depend on hierarchy)
                array( 'sku' => 'SINGLE_PROD',  'qty' => 5 ),    // skipped
                array( 'sku' => 'DUAL_PLATE_SKU', 'qty' => 4 ),  // 8 plates
            ),
            $this->fixture()
        );
        $this->assertCount( 3, $result );
        // Sum of plates_needed
        $total = array_sum( array_column( $result, 'plates_needed' ) );
        $this->assertSame( 11, $total ); // 2 + 1 + 8
    }

    public function test_lowercase_sku_normalize() {
        $result = sn_inv_check(
            array( array( 'sku' => 'setxl750', 'qty' => 1 ) ),
            $this->fixture()
        );
        $this->assertCount( 1, $result );
        $this->assertSame( 'SETXL750', $result[0]['sku'] );
    }

    public function test_qty_clamp_minimum_1() {
        $result = sn_inv_check(
            array( array( 'sku' => 'SETXL750', 'qty' => 0 ) ),
            $this->fixture()
        );
        $this->assertSame( 1, $result[0]['plates_needed'] ); // clamped to 1
    }

    public function test_negative_qty_clamped() {
        $result = sn_inv_check(
            array( array( 'sku' => 'SETXL750', 'qty' => -5 ) ),
            $this->fixture()
        );
        $this->assertSame( 1, $result[0]['plates_needed'] );
    }

    public function test_empty_sku_in_array_skipped() {
        $result = sn_inv_check(
            array(
                array( 'sku' => '',         'qty' => 5 ),
                array( 'sku' => 'SETXL750', 'qty' => 2 ),
            ),
            $this->fixture()
        );
        $this->assertCount( 1, $result );
        $this->assertSame( 'SETXL750', $result[0]['sku'] );
    }

    public function test_missing_qty_defaults_1() {
        $result = sn_inv_check(
            array( array( 'sku' => 'SETXL750' ) ), // no qty
            $this->fixture()
        );
        $this->assertSame( 1, $result[0]['plates_needed'] );
    }

    public function test_result_shape_complete() {
        $result = sn_inv_check(
            array( array( 'sku' => 'SETXL750', 'qty' => 7 ) ),
            $this->fixture()
        );
        // Must include all 5 keys for admin display
        $expected_keys = array( 'sku', 'qty', 'level', 'qty_per_unit', 'plates_needed' );
        foreach ( $expected_keys as $k ) {
            $this->assertArrayHasKey( $k, $result[0] );
        }
    }
}
