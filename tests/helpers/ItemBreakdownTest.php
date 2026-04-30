<?php
/**
 * ItemBreakdownTest — pure-logic test of `b2f_get_item_breakdown()`.
 *
 * Source: [B2F] Snippet 1: Core Utilities & Flex Builders V.6.4+ §511.
 * Parses `poi_parent_breakdown` JSON from a PO item and returns
 * normalized `[{parent_sku, parent_name, qty}, ...]` array.
 *
 * Critical for V.6.3 DD-3 Shared Child support — a leaf SKU that's part
 * of multiple SETs must record per-SET qty distribution. Sum invariant:
 *   sum(breakdown[i].qty) === poi_qty_ordered
 *
 * Behavior:
 *   1. If `poi_parent_breakdown` JSON is valid array AND sum invariant holds
 *      → return parsed breakdown.
 *   2. If JSON sum mismatch (data corruption) → fall through to fallback.
 *   3. Fallback (PO เก่า / no JSON / invalid):
 *      - parent_sku = `poi_parent_sku` if non-empty, else '__standalone__'
 *      - qty = `poi_qty_ordered`
 *
 * Invariants this test locks in:
 *   - Empty input → empty array
 *   - Non-array input → empty array
 *   - Missing `poi_qty_ordered` → 0 (intval guard)
 *   - JSON parse fail → fallback (no exception)
 *   - Negative qty values handled by intval (not silently dropped)
 *
 * Source-of-truth fidelity: this test re-implements `b2f_get_item_breakdown`
 * inline, mirroring the snippet body modulo the `b2f_log()` call (which
 * is a no-op when not in WP context — matched here by skipping the log).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\b2f_get_item_breakdown' ) ) {
    function b2f_get_item_breakdown( $item ) {
        if ( empty( $item ) || ! is_array( $item ) ) return array();
        $qty_ordered = intval( $item['poi_qty_ordered'] ?? 0 );

        // Try parse JSON first
        $raw = $item['poi_parent_breakdown'] ?? '';
        if ( ! empty( $raw ) ) {
            $parsed = json_decode( $raw, true );
            if ( is_array( $parsed ) && ! empty( $parsed ) ) {
                $sum = 0;
                foreach ( $parsed as $b ) { $sum += intval( $b['qty'] ?? 0 ); }
                if ( $sum === $qty_ordered ) {
                    return $parsed;
                }
                // Sum mismatch → fallback. (snippet calls b2f_log here)
            }
        }

        // Fallback: PO เก่า / JSON invalid → ใช้ poi_parent_sku เดี่ยว
        $parent_sku  = trim( $item['poi_parent_sku'] ?? '' );
        $parent_name = $item['poi_parent_name'] ?? '';
        return array(
            array(
                'parent_sku'  => ! empty( $parent_sku ) ? $parent_sku : '__standalone__',
                'parent_name' => $parent_name,
                'qty'         => $qty_ordered,
            ),
        );
    }
}

class ItemBreakdownTest extends TestCase {

    // ─── Defensive: degenerate inputs ──────────────────────────────
    public function test_empty_input_returns_empty_array(): void {
        $this->assertSame( array(), b2f_get_item_breakdown( array() ) );
    }

    public function test_null_input_returns_empty_array(): void {
        $this->assertSame( array(), b2f_get_item_breakdown( null ) );
    }

    public function test_string_input_returns_empty_array(): void {
        $this->assertSame( array(), b2f_get_item_breakdown( 'not-an-array' ) );
    }

    // ─── Fallback path (no breakdown JSON) ─────────────────────────
    public function test_fallback_uses_poi_parent_sku_when_no_json(): void {
        $item = array(
            'poi_qty_ordered'        => 5,
            'poi_parent_sku'         => 'SET_A',
            'poi_parent_name'        => 'Crash Bar Set A',
            'poi_parent_breakdown'   => '',
        );
        $result = b2f_get_item_breakdown( $item );
        $this->assertCount( 1, $result );
        $this->assertSame( 'SET_A', $result[0]['parent_sku'] );
        $this->assertSame( 'Crash Bar Set A', $result[0]['parent_name'] );
        $this->assertSame( 5, $result[0]['qty'] );
    }

    public function test_fallback_uses_standalone_marker_when_no_parent(): void {
        $item = array(
            'poi_qty_ordered' => 3,
            'poi_parent_sku'  => '',
        );
        $result = b2f_get_item_breakdown( $item );
        $this->assertCount( 1, $result );
        $this->assertSame( '__standalone__', $result[0]['parent_sku'] );
        $this->assertSame( 3, $result[0]['qty'] );
    }

    public function test_fallback_trims_whitespace_in_parent_sku(): void {
        $item = array(
            'poi_qty_ordered' => 2,
            'poi_parent_sku'  => '   SET_X   ',
        );
        $result = b2f_get_item_breakdown( $item );
        $this->assertSame( 'SET_X', $result[0]['parent_sku'] );
    }

    public function test_fallback_when_no_qty_returns_zero(): void {
        $item = array(
            'poi_parent_sku' => 'SET_Y',
        );
        $result = b2f_get_item_breakdown( $item );
        $this->assertSame( 0, $result[0]['qty'] );
    }

    // ─── Happy path: valid JSON breakdown ──────────────────────────
    public function test_valid_json_breakdown_returned_unchanged(): void {
        $breakdown = array(
            array( 'parent_sku' => 'SET_A', 'parent_name' => 'A', 'qty' => 2 ),
            array( 'parent_sku' => 'SET_B', 'parent_name' => 'B', 'qty' => 3 ),
        );
        $item = array(
            'poi_qty_ordered'      => 5,
            'poi_parent_breakdown' => json_encode( $breakdown ),
        );
        $this->assertSame( $breakdown, b2f_get_item_breakdown( $item ) );
    }

    public function test_valid_json_three_parents(): void {
        $breakdown = array(
            array( 'parent_sku' => 'SET_A', 'parent_name' => 'A', 'qty' => 1 ),
            array( 'parent_sku' => 'SET_B', 'parent_name' => 'B', 'qty' => 1 ),
            array( 'parent_sku' => 'SET_C', 'parent_name' => 'C', 'qty' => 1 ),
        );
        $item = array(
            'poi_qty_ordered'      => 3,
            'poi_parent_breakdown' => json_encode( $breakdown ),
        );
        $this->assertSame( $breakdown, b2f_get_item_breakdown( $item ) );
    }

    public function test_standalone_marker_preserved_in_breakdown(): void {
        $breakdown = array(
            array( 'parent_sku' => 'SET_A', 'parent_name' => 'A', 'qty' => 2 ),
            array( 'parent_sku' => '__standalone__', 'parent_name' => '', 'qty' => 1 ),
        );
        $item = array(
            'poi_qty_ordered'      => 3,
            'poi_parent_breakdown' => json_encode( $breakdown ),
        );
        $this->assertSame( $breakdown, b2f_get_item_breakdown( $item ) );
    }

    // ─── Sum-invariant violation → fallback ────────────────────────
    public function test_sum_mismatch_falls_through_to_fallback(): void {
        // Breakdown sums to 5 but poi_qty_ordered is 10 → invariant fail
        $bad_breakdown = array(
            array( 'parent_sku' => 'SET_A', 'parent_name' => 'A', 'qty' => 2 ),
            array( 'parent_sku' => 'SET_B', 'parent_name' => 'B', 'qty' => 3 ),
        );
        $item = array(
            'poi_qty_ordered'      => 10,
            'poi_parent_sku'       => 'LEGACY_SET',
            'poi_parent_name'      => 'Legacy fallback',
            'poi_parent_breakdown' => json_encode( $bad_breakdown ),
        );
        $result = b2f_get_item_breakdown( $item );
        // Fallback used: 1 entry, parent_sku=LEGACY_SET, qty=10
        $this->assertCount( 1, $result );
        $this->assertSame( 'LEGACY_SET', $result[0]['parent_sku'] );
        $this->assertSame( 10, $result[0]['qty'] );
    }

    public function test_sum_too_high_falls_through_to_fallback(): void {
        // Breakdown sums to 10 but poi_qty_ordered is 5
        $bad_breakdown = array(
            array( 'parent_sku' => 'SET_A', 'parent_name' => 'A', 'qty' => 4 ),
            array( 'parent_sku' => 'SET_B', 'parent_name' => 'B', 'qty' => 6 ),
        );
        $item = array(
            'poi_qty_ordered'      => 5,
            'poi_parent_sku'       => 'FALLBACK_SET',
            'poi_parent_breakdown' => json_encode( $bad_breakdown ),
        );
        $result = b2f_get_item_breakdown( $item );
        $this->assertSame( 'FALLBACK_SET', $result[0]['parent_sku'] );
        $this->assertSame( 5, $result[0]['qty'] );
    }

    // ─── Malformed JSON → fallback ─────────────────────────────────
    public function test_invalid_json_falls_through_to_fallback(): void {
        $item = array(
            'poi_qty_ordered'      => 4,
            'poi_parent_sku'       => 'SET_Z',
            'poi_parent_breakdown' => '{not valid json',
        );
        $result = b2f_get_item_breakdown( $item );
        $this->assertCount( 1, $result );
        $this->assertSame( 'SET_Z', $result[0]['parent_sku'] );
        $this->assertSame( 4, $result[0]['qty'] );
    }

    public function test_json_object_not_array_falls_through(): void {
        // json_decode of '{"key":"val"}' returns assoc array, but it's
        // not a list-of-breakdown-entries shape. Each entry has no
        // `qty` so sum=0, invariant fails → fallback.
        $item = array(
            'poi_qty_ordered'      => 2,
            'poi_parent_sku'       => 'SET_W',
            'poi_parent_breakdown' => '{"key":"val"}',
        );
        $result = b2f_get_item_breakdown( $item );
        $this->assertSame( 'SET_W', $result[0]['parent_sku'] );
        $this->assertSame( 2, $result[0]['qty'] );
    }

    public function test_empty_array_json_falls_through_to_fallback(): void {
        // '[]' parses to [] which is_array but empty() is true → skip JSON path
        $item = array(
            'poi_qty_ordered'      => 1,
            'poi_parent_sku'       => 'SET_V',
            'poi_parent_breakdown' => '[]',
        );
        $result = b2f_get_item_breakdown( $item );
        $this->assertSame( 'SET_V', $result[0]['parent_sku'] );
    }

    // ─── intval coercion ───────────────────────────────────────────
    public function test_string_qty_in_breakdown_coerced_via_intval(): void {
        // PHP intval('3') === 3, sum invariant holds
        $breakdown_str_qty = array(
            array( 'parent_sku' => 'SET_A', 'parent_name' => 'A', 'qty' => '2' ),
            array( 'parent_sku' => 'SET_B', 'parent_name' => 'B', 'qty' => '3' ),
        );
        $item = array(
            'poi_qty_ordered'      => 5,
            'poi_parent_breakdown' => json_encode( $breakdown_str_qty ),
        );
        $result = b2f_get_item_breakdown( $item );
        // Returns parsed (string qty preserved in the entries)
        $this->assertCount( 2, $result );
        $this->assertSame( '2', $result[0]['qty'] );
    }

    public function test_negative_qty_in_breakdown_handled(): void {
        // sum: 5 + (-2) = 3 — matches poi_qty_ordered=3, accepted as valid
        $breakdown = array(
            array( 'parent_sku' => 'SET_A', 'parent_name' => 'A', 'qty' => 5 ),
            array( 'parent_sku' => 'SET_B', 'parent_name' => 'B', 'qty' => -2 ),
        );
        $item = array(
            'poi_qty_ordered'      => 3,
            'poi_parent_breakdown' => json_encode( $breakdown ),
        );
        $result = b2f_get_item_breakdown( $item );
        $this->assertCount( 2, $result );
    }
}
