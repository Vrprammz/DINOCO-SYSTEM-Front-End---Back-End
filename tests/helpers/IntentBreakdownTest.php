<?php
/**
 * IntentBreakdownTest — pure-logic test of V.7.0 Order Intent aggregation.
 *
 * Source: [B2F] Snippet 2: REST API V.11.0+ lines 2712-2727 (create-po
 * aggregate save). Mirrored fallback compute in [B2F] Snippet 1: Core
 * Utilities V.7.0+ §100.6 lines 4055-4068 (`b2f_flex_intent_summary`).
 *
 * The aggregate is a 4-key counter:
 *   { full_set_count, sub_unit_count, single_leaf_count, total_items }
 *
 * Saved to postmeta `_b2f_order_intent_summary` (JSON) for:
 *   - Flex intent summary card (Snippet 1 §100.6)
 *   - PO Image header box (Snippet 10 V.3.0+)
 *   - PO Ticket detail summary (Snippet 9 V.3.6+)
 *
 * Critical invariants:
 *   - total_items == sum(qty) for ALL items (regardless of mode validity)
 *   - mode counters only increment for valid modes (full_set / sub_unit / single_leaf)
 *   - unknown modes counted in total_items but NOT in any mode counter
 *   - empty items returns all zeros
 *   - non-int qty coerced via (int) cast
 *
 * V.7.0 design: order_mode is OPTIONAL on legacy PO -> empty mode silently
 * skipped from buckets but qty STILL counted in total_items (enables
 * "X items, Y mode-tagged" diagnostic).
 *
 * Wave 3 Gap 3 (V.7.0 Order Intent System) — UI-feeding helper.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// ─── Inline copy: pure aggregation logic ───
// Mirrors REST V.11.0 lines 2712-2727 + flex fallback lines 4055-4068.
// Diff: source REST iterates `$po_items` array-of-arrays; flex iterates
// `get_field('po_items')`. Logic identical — both use `order_mode` + `qty`.
if ( ! function_exists( __NAMESPACE__ . '\\b2f_compute_intent_breakdown' ) ) {
    function b2f_compute_intent_breakdown( $items ): array {
        $summary = array(
            'full_set_count'    => 0,
            'sub_unit_count'    => 0,
            'single_leaf_count' => 0,
            'total_items'       => 0,
        );
        if ( ! is_array( $items ) ) return $summary;

        foreach ( $items as $it ) {
            if ( ! is_array( $it ) ) continue;
            // Support both `order_mode` (REST shape) + `poi_order_mode` (ACF shape)
            $mode = '';
            if ( isset( $it['order_mode'] ) ) $mode = (string) $it['order_mode'];
            elseif ( isset( $it['poi_order_mode'] ) ) $mode = (string) $it['poi_order_mode'];

            // Support both `qty` (REST shape) + `poi_qty_ordered` (ACF shape)
            $qty = 0;
            if ( isset( $it['qty'] ) ) $qty = (int) $it['qty'];
            elseif ( isset( $it['poi_qty_ordered'] ) ) $qty = (int) $it['poi_qty_ordered'];

            $summary['total_items'] += $qty;
            if ( $mode === 'full_set' )         $summary['full_set_count']    += $qty;
            elseif ( $mode === 'sub_unit' )     $summary['sub_unit_count']    += $qty;
            elseif ( $mode === 'single_leaf' )  $summary['single_leaf_count'] += $qty;
        }
        return $summary;
    }
}

class IntentBreakdownTest extends TestCase {

    // ─── Empty / null / non-array ───────────────────────────────────

    public function test_empty_array_returns_all_zero(): void {
        $r = b2f_compute_intent_breakdown( array() );
        $this->assertSame( 0, $r['full_set_count'] );
        $this->assertSame( 0, $r['sub_unit_count'] );
        $this->assertSame( 0, $r['single_leaf_count'] );
        $this->assertSame( 0, $r['total_items'] );
    }

    public function test_non_array_returns_zeros(): void {
        $r = b2f_compute_intent_breakdown( 'not-array' );
        $this->assertSame( 0, $r['total_items'] );
    }

    public function test_null_returns_zeros(): void {
        $r = b2f_compute_intent_breakdown( null );
        $this->assertSame( 0, $r['total_items'] );
    }

    // ─── Single mode buckets ─────────────────────────────────────────

    public function test_single_full_set_item_counts_correctly(): void {
        $items = array(
            array( 'order_mode' => 'full_set', 'qty' => 5 ),
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 5, $r['full_set_count'] );
        $this->assertSame( 0, $r['sub_unit_count'] );
        $this->assertSame( 0, $r['single_leaf_count'] );
        $this->assertSame( 5, $r['total_items'] );
    }

    public function test_single_sub_unit_item_counts_correctly(): void {
        $items = array(
            array( 'order_mode' => 'sub_unit', 'qty' => 3 ),
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 0, $r['full_set_count'] );
        $this->assertSame( 3, $r['sub_unit_count'] );
        $this->assertSame( 0, $r['single_leaf_count'] );
        $this->assertSame( 3, $r['total_items'] );
    }

    public function test_single_single_leaf_item_counts_correctly(): void {
        $items = array(
            array( 'order_mode' => 'single_leaf', 'qty' => 7 ),
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 0, $r['full_set_count'] );
        $this->assertSame( 0, $r['sub_unit_count'] );
        $this->assertSame( 7, $r['single_leaf_count'] );
        $this->assertSame( 7, $r['total_items'] );
    }

    // ─── Mixed modes ─────────────────────────────────────────────────

    public function test_mixed_three_modes_sums_correctly(): void {
        $items = array(
            array( 'order_mode' => 'full_set',    'qty' => 2 ),
            array( 'order_mode' => 'sub_unit',    'qty' => 4 ),
            array( 'order_mode' => 'single_leaf', 'qty' => 6 ),
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 2,  $r['full_set_count'] );
        $this->assertSame( 4,  $r['sub_unit_count'] );
        $this->assertSame( 6,  $r['single_leaf_count'] );
        $this->assertSame( 12, $r['total_items'] );
    }

    public function test_multiple_full_set_items_aggregate(): void {
        $items = array(
            array( 'order_mode' => 'full_set', 'qty' => 1 ),
            array( 'order_mode' => 'full_set', 'qty' => 2 ),
            array( 'order_mode' => 'full_set', 'qty' => 5 ),
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 8, $r['full_set_count'] );
        $this->assertSame( 8, $r['total_items'] );
    }

    // ─── Edge: unknown / missing mode ────────────────────────────────

    public function test_empty_mode_counts_in_total_only(): void {
        // Legacy PO: order_mode missing -> qty counted in total but no bucket
        $items = array(
            array( 'order_mode' => '', 'qty' => 10 ),
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 0,  $r['full_set_count'] );
        $this->assertSame( 0,  $r['sub_unit_count'] );
        $this->assertSame( 0,  $r['single_leaf_count'] );
        $this->assertSame( 10, $r['total_items'] );
    }

    public function test_missing_mode_key_counts_in_total_only(): void {
        // Item has no order_mode key at all
        $items = array(
            array( 'qty' => 4 ),
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 0, $r['full_set_count'] );
        $this->assertSame( 4, $r['total_items'] );
    }

    public function test_unknown_mode_string_counts_in_total_only(): void {
        // Defensive: unrecognized mode (typo / future enum) -> total only
        $items = array(
            array( 'order_mode' => 'fullset', 'qty' => 3 ),    // typo missing _
            array( 'order_mode' => 'raw_parts', 'qty' => 2 ),  // legacy display-only
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 0, $r['full_set_count'] );
        $this->assertSame( 0, $r['sub_unit_count'] );
        $this->assertSame( 0, $r['single_leaf_count'] );
        $this->assertSame( 5, $r['total_items'] );
    }

    public function test_missing_qty_treated_as_zero(): void {
        $items = array(
            array( 'order_mode' => 'full_set' ),  // no qty key
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 0, $r['full_set_count'] );
        $this->assertSame( 0, $r['total_items'] );
    }

    // ─── Edge: ACF shape (poi_order_mode + poi_qty_ordered) ─────────

    public function test_acf_shape_supported(): void {
        // Snippet 1 §100.6 fallback compute reads ACF field names
        $items = array(
            array( 'poi_order_mode' => 'full_set',    'poi_qty_ordered' => 2 ),
            array( 'poi_order_mode' => 'sub_unit',    'poi_qty_ordered' => 3 ),
            array( 'poi_order_mode' => 'single_leaf', 'poi_qty_ordered' => 5 ),
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 2,  $r['full_set_count'] );
        $this->assertSame( 3,  $r['sub_unit_count'] );
        $this->assertSame( 5,  $r['single_leaf_count'] );
        $this->assertSame( 10, $r['total_items'] );
    }

    public function test_rest_shape_takes_precedence_over_acf(): void {
        // If both shapes present, REST shape (order_mode/qty) wins
        $items = array(
            array(
                'order_mode'      => 'full_set',
                'poi_order_mode'  => 'sub_unit',  // ignored
                'qty'             => 7,
                'poi_qty_ordered' => 99,           // ignored
            ),
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 7, $r['full_set_count'] );
        $this->assertSame( 0, $r['sub_unit_count'] );
        $this->assertSame( 7, $r['total_items'] );
    }

    // ─── Edge: type coercion ─────────────────────────────────────────

    public function test_string_qty_coerced_to_int(): void {
        $items = array(
            array( 'order_mode' => 'full_set', 'qty' => '5' ),  // string
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 5, $r['full_set_count'] );
    }

    public function test_float_qty_truncated_to_int(): void {
        $items = array(
            array( 'order_mode' => 'sub_unit', 'qty' => 3.7 ),  // float
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 3, $r['sub_unit_count'] );  // truncated, not rounded
    }

    public function test_negative_qty_passes_through(): void {
        // No defensive clamp — caller responsibility (REST rejects negatives upstream)
        $items = array(
            array( 'order_mode' => 'full_set', 'qty' => -2 ),
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( -2, $r['full_set_count'] );
        $this->assertSame( -2, $r['total_items'] );
    }

    // ─── Defensive: malformed items array ────────────────────────────

    public function test_non_array_item_skipped(): void {
        $items = array(
            'string-not-array',
            null,
            42,
            array( 'order_mode' => 'full_set', 'qty' => 5 ),
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 5, $r['full_set_count'] );
        $this->assertSame( 5, $r['total_items'] );
    }

    public function test_legacy_v6_po_with_no_mode_field_reports_total(): void {
        // Pre-V.7.0 PO (Wave 3 Gap 3 backward compat path)
        $items = array(
            array( 'qty' => 2 ),
            array( 'qty' => 3 ),
            array( 'qty' => 5 ),
        );
        $r = b2f_compute_intent_breakdown( $items );
        $this->assertSame( 0,  $r['full_set_count'] );
        $this->assertSame( 0,  $r['sub_unit_count'] );
        $this->assertSame( 0,  $r['single_leaf_count'] );
        $this->assertSame( 10, $r['total_items'] );
    }

    // ─── Invariant ───────────────────────────────────────────────────

    public function test_total_items_never_less_than_bucket_sum(): void {
        // total_items >= full_set + sub_unit + single_leaf (unknown modes pad)
        $items = array(
            array( 'order_mode' => 'full_set',    'qty' => 1 ),
            array( 'order_mode' => 'sub_unit',    'qty' => 2 ),
            array( 'order_mode' => 'single_leaf', 'qty' => 3 ),
            array( 'order_mode' => 'unknown',     'qty' => 4 ),  // pads total
        );
        $r = b2f_compute_intent_breakdown( $items );
        $bucket_sum = $r['full_set_count'] + $r['sub_unit_count'] + $r['single_leaf_count'];
        $this->assertGreaterThanOrEqual( $bucket_sum, $r['total_items'] );
        $this->assertSame( 6,  $bucket_sum );
        $this->assertSame( 10, $r['total_items'] );
    }

    public function test_result_shape_always_has_4_keys(): void {
        // Schema invariant — postmeta consumers depend on this contract
        $r = b2f_compute_intent_breakdown( array() );
        $this->assertArrayHasKey( 'full_set_count',    $r );
        $this->assertArrayHasKey( 'sub_unit_count',    $r );
        $this->assertArrayHasKey( 'single_leaf_count', $r );
        $this->assertArrayHasKey( 'total_items',       $r );
        $this->assertCount( 4, $r );
    }
}
