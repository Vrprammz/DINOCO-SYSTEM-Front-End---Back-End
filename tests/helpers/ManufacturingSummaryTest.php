<?php
/**
 * ManufacturingSummaryTest — pure-logic test of `b2f_compute_manufacturing_summary()`.
 *
 * Source: [B2F] Snippet 1: Core Utilities & Flex Builders V.6.4+ line 769.
 *
 * Function flattens PO items into a manufacturing summary array, attaching
 * DD-3 shared-leaf breakdown info. Used by:
 *   - PO Ticket View "ยอดรวมผลิต" toggle (Snippet 9 V.3.5)
 *   - Maker LIFF delivery tracking (Snippet 4 V.4.3)
 *   - PO Image Generator total qty calculation (Snippet 10)
 *
 * Critical for DD-3 (shared child) — `is_shared` flag drives "ใช้ใน N SET"
 * UI badge rendering. Wrong flag = misleading admin/maker on production qty.
 *
 * Returns array of:
 *   - sku        (uppercase recommended, but passthrough — caller-uppercased)
 *   - name       (poi_product_name fallback to sku)
 *   - qty_total  (intval poi_qty_ordered)
 *   - unit_cost  (floatval poi_unit_cost)
 *   - breakdown  (array from b2f_get_item_breakdown — multi-parent split)
 *   - is_shared  (bool, count(breakdown) > 1)
 *   - image_url  (poi_image_url fallback to image_url fallback to '')
 *
 * Invariants this test locks in:
 *   - Empty input          → empty array (no exception)
 *   - Non-array input      → empty array
 *   - Item with empty SKU  → skipped (continue)
 *   - DD-3 multi-breakdown → is_shared = true
 *   - Single breakdown     → is_shared = false
 *   - Numeric coercion     → qty_total int, unit_cost float
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// Helper dependency — inline copy
if ( ! function_exists( __NAMESPACE__ . '\\b2f_get_item_breakdown' ) ) {
    function b2f_get_item_breakdown( $item ) {
        if ( empty( $item ) || ! is_array( $item ) ) return array();
        $qty_ordered = intval( $item['poi_qty_ordered'] ?? 0 );

        $raw = $item['poi_parent_breakdown'] ?? '';
        if ( ! empty( $raw ) ) {
            $parsed = json_decode( $raw, true );
            if ( is_array( $parsed ) && ! empty( $parsed ) ) {
                $sum = 0;
                foreach ( $parsed as $b ) { $sum += intval( $b['qty'] ?? 0 ); }
                if ( $sum === $qty_ordered ) {
                    return $parsed;
                }
            }
        }

        // Fallback: legacy single-parent
        $parent_sku = $item['poi_parent_sku'] ?? '';
        return array( array(
            'parent_sku'  => empty( $parent_sku ) ? '__standalone__' : $parent_sku,
            'parent_name' => $item['poi_parent_name'] ?? '',
            'qty'         => $qty_ordered,
        ) );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\b2f_compute_manufacturing_summary' ) ) {
    function b2f_compute_manufacturing_summary( $items ) {
        if ( empty( $items ) || ! is_array( $items ) ) return array();
        $summary = array();
        foreach ( $items as $item ) {
            $sku = $item['poi_sku'] ?? '';
            if ( empty( $sku ) ) continue;
            $qty       = intval( $item['poi_qty_ordered'] ?? 0 );
            $breakdown = b2f_get_item_breakdown( $item );

            $summary[] = array(
                'sku'        => $sku,
                'name'       => $item['poi_product_name'] ?? $sku,
                'qty_total'  => $qty,
                'unit_cost'  => floatval( $item['poi_unit_cost'] ?? 0 ),
                'breakdown'  => $breakdown,
                'is_shared'  => count( $breakdown ) > 1,
                'image_url'  => $item['poi_image_url'] ?? $item['image_url'] ?? '',
            );
        }
        return $summary;
    }
}

class ManufacturingSummaryTest extends TestCase {

    // ─── Empty / invalid input ────────────────────────────────────
    public function test_empty_array_returns_empty(): void {
        $this->assertSame( array(), b2f_compute_manufacturing_summary( array() ) );
    }

    public function test_null_returns_empty(): void {
        $this->assertSame( array(), b2f_compute_manufacturing_summary( null ) );
    }

    public function test_string_returns_empty(): void {
        $this->assertSame( array(), b2f_compute_manufacturing_summary( 'not-an-array' ) );
    }

    public function test_int_returns_empty(): void {
        $this->assertSame( array(), b2f_compute_manufacturing_summary( 0 ) );
    }

    // ─── Item filter (empty SKU skipped) ──────────────────────────
    public function test_item_with_empty_sku_skipped(): void {
        $items = array(
            array( 'poi_sku' => '', 'poi_qty_ordered' => 5 ),
            array( 'poi_sku' => 'DNC100', 'poi_qty_ordered' => 3 ),
        );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertCount( 1, $result );
        $this->assertSame( 'DNC100', $result[0]['sku'] );
    }

    public function test_item_with_missing_sku_key_skipped(): void {
        $items = array(
            array( 'poi_qty_ordered' => 5 ),  // no poi_sku
            array( 'poi_sku' => 'DNC200', 'poi_qty_ordered' => 2 ),
        );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertCount( 1, $result );
        $this->assertSame( 'DNC200', $result[0]['sku'] );
    }

    public function test_all_empty_sku_returns_empty_array(): void {
        $items = array(
            array( 'poi_sku' => '' ),
            array( 'poi_qty_ordered' => 1 ),
        );
        $this->assertSame( array(), b2f_compute_manufacturing_summary( $items ) );
    }

    // ─── Numeric coercion ─────────────────────────────────────────
    public function test_qty_total_coerced_to_int(): void {
        $items = array( array(
            'poi_sku'         => 'DNC100',
            'poi_qty_ordered' => '15',  // string
        ) );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertSame( 15, $result[0]['qty_total'] );
    }

    public function test_unit_cost_coerced_to_float(): void {
        $items = array( array(
            'poi_sku'        => 'DNC100',
            'poi_unit_cost'  => '99.50',
        ) );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertSame( 99.5, $result[0]['unit_cost'] );
    }

    public function test_missing_qty_defaults_to_zero(): void {
        $items = array( array( 'poi_sku' => 'DNC100' ) );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertSame( 0, $result[0]['qty_total'] );
    }

    public function test_missing_unit_cost_defaults_to_zero(): void {
        $items = array( array( 'poi_sku' => 'DNC100', 'poi_qty_ordered' => 5 ) );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertSame( 0.0, $result[0]['unit_cost'] );
    }

    // ─── Name fallback ────────────────────────────────────────────
    public function test_name_falls_back_to_sku_when_missing(): void {
        $items = array( array( 'poi_sku' => 'DNC999', 'poi_qty_ordered' => 1 ) );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertSame( 'DNC999', $result[0]['name'] );
    }

    public function test_name_uses_poi_product_name_when_set(): void {
        $items = array( array(
            'poi_sku'          => 'DNC100',
            'poi_product_name' => 'กันล้ม Crash Bar',
            'poi_qty_ordered'  => 1,
        ) );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertSame( 'กันล้ม Crash Bar', $result[0]['name'] );
    }

    // ─── Image URL fallback chain ─────────────────────────────────
    public function test_image_url_uses_poi_image_url_first(): void {
        $items = array( array(
            'poi_sku'       => 'DNC100',
            'poi_image_url' => 'https://example.com/poi.jpg',
            'image_url'     => 'https://example.com/legacy.jpg',
        ) );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertSame( 'https://example.com/poi.jpg', $result[0]['image_url'] );
    }

    public function test_image_url_falls_back_to_image_url_key(): void {
        $items = array( array(
            'poi_sku'   => 'DNC100',
            'image_url' => 'https://example.com/legacy.jpg',
        ) );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertSame( 'https://example.com/legacy.jpg', $result[0]['image_url'] );
    }

    public function test_image_url_empty_when_neither_set(): void {
        $items = array( array( 'poi_sku' => 'DNC100' ) );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertSame( '', $result[0]['image_url'] );
    }

    // ─── DD-3 Shared child detection ──────────────────────────────
    public function test_is_shared_false_for_legacy_no_breakdown(): void {
        $items = array( array(
            'poi_sku'         => 'DNC100',
            'poi_qty_ordered' => 5,
            // no poi_parent_breakdown — falls back to single
        ) );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertFalse( $result[0]['is_shared'] );
        $this->assertCount( 1, $result[0]['breakdown'] );
    }

    public function test_is_shared_false_for_single_parent_breakdown(): void {
        $items = array( array(
            'poi_sku'                => 'DNC100',
            'poi_qty_ordered'        => 3,
            'poi_parent_breakdown'   => json_encode( array(
                array( 'parent_sku' => 'SET_A', 'parent_name' => 'Set A', 'qty' => 3 ),
            ) ),
        ) );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertFalse( $result[0]['is_shared'] );
    }

    public function test_is_shared_true_for_multi_parent_dd3(): void {
        // DD-3 shared child: 2 SET parents
        $items = array( array(
            'poi_sku'              => 'DNCGNDPRO5500',
            'poi_qty_ordered'      => 4,
            'poi_parent_breakdown' => json_encode( array(
                array( 'parent_sku' => 'SET_A', 'parent_name' => 'Set A', 'qty' => 2 ),
                array( 'parent_sku' => 'SET_B', 'parent_name' => 'Set B', 'qty' => 2 ),
            ) ),
        ) );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertTrue( $result[0]['is_shared'] );
        $this->assertCount( 2, $result[0]['breakdown'] );
    }

    public function test_is_shared_true_for_three_parents(): void {
        $items = array( array(
            'poi_sku'              => 'SHARED_LEAF',
            'poi_qty_ordered'      => 6,
            'poi_parent_breakdown' => json_encode( array(
                array( 'parent_sku' => 'SET_A', 'parent_name' => 'A', 'qty' => 2 ),
                array( 'parent_sku' => 'SET_B', 'parent_name' => 'B', 'qty' => 2 ),
                array( 'parent_sku' => 'SET_C', 'parent_name' => 'C', 'qty' => 2 ),
            ) ),
        ) );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertTrue( $result[0]['is_shared'] );
        $this->assertCount( 3, $result[0]['breakdown'] );
    }

    // ─── Multiple items in summary ────────────────────────────────
    public function test_multiple_items_returns_correct_count(): void {
        $items = array(
            array( 'poi_sku' => 'DNC100', 'poi_qty_ordered' => 1 ),
            array( 'poi_sku' => 'DNC200', 'poi_qty_ordered' => 2 ),
            array( 'poi_sku' => 'DNC300', 'poi_qty_ordered' => 3 ),
        );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertCount( 3, $result );
        $this->assertSame( 'DNC100', $result[0]['sku'] );
        $this->assertSame( 'DNC200', $result[1]['sku'] );
        $this->assertSame( 'DNC300', $result[2]['sku'] );
    }

    public function test_summary_preserves_order(): void {
        $items = array(
            array( 'poi_sku' => 'Z_LAST', 'poi_qty_ordered' => 1 ),
            array( 'poi_sku' => 'A_FIRST', 'poi_qty_ordered' => 1 ),
        );
        $result = b2f_compute_manufacturing_summary( $items );
        $this->assertSame( 'Z_LAST', $result[0]['sku'] );
        $this->assertSame( 'A_FIRST', $result[1]['sku'] );
    }
}
