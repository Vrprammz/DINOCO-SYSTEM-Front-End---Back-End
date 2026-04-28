<?php
/**
 * BoxCalcTest — pure-logic test of `b2b_compute_boxes_for_qty`.
 *
 * Source: [B2B] Snippet 1 V.32.9+ line 3305.
 *
 * Box semantics (mutually exclusive, enforced at admin UI but logic must
 * still degrade gracefully if both > 1):
 *   - units_per_box > 1 → small items packed many-per-box (e.g. 6L bag = 20/box)
 *     formula: total_boxes = ceil(qty / units_per_box)
 *   - boxes_per_unit > 1 → bulky items requiring multiple boxes per unit
 *     formula: total_boxes = qty * boxes_per_unit
 *   - both = 1 → 1 box per unit (default)
 *
 * Used by Flash shipping PNO count + secondary shipping calculation.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\b2b_compute_boxes_for_qty' ) ) {
    function b2b_compute_boxes_for_qty( $qty, $bpu, $upb ): int {
        $qty = max( 0, (int) $qty );
        $bpu = max( 1, (int) $bpu );
        $upb = max( 1, (int) $upb );
        if ( $upb > 1 ) {
            return (int) ceil( $qty / $upb );
        }
        return $qty * $bpu;
    }
}

class BoxCalcTest extends TestCase {

    // ─── Default 1:1 ────────────────────────────────────────────
    public function test_default_one_to_one(): void {
        $this->assertSame( 5, b2b_compute_boxes_for_qty( 5, 1, 1 ) );
        $this->assertSame( 0, b2b_compute_boxes_for_qty( 0, 1, 1 ) );
        $this->assertSame( 1, b2b_compute_boxes_for_qty( 1, 1, 1 ) );
    }

    // ─── boxes_per_unit (bulky items) ───────────────────────────
    public function test_boxes_per_unit_multiplier(): void {
        // Each unit = 3 boxes
        $this->assertSame( 6, b2b_compute_boxes_for_qty( 2, 3, 1 ) );
        $this->assertSame( 30, b2b_compute_boxes_for_qty( 10, 3, 1 ) );
    }

    public function test_boxes_per_unit_zero_qty(): void {
        $this->assertSame( 0, b2b_compute_boxes_for_qty( 0, 5, 1 ) );
    }

    // ─── units_per_box (packed small items) ─────────────────────
    public function test_units_per_box_exact_division(): void {
        // 20 small bags / 20 per box = 1 box
        $this->assertSame( 1, b2b_compute_boxes_for_qty( 20, 1, 20 ) );
        // 40 small bags / 20 per box = 2 boxes
        $this->assertSame( 2, b2b_compute_boxes_for_qty( 40, 1, 20 ) );
    }

    public function test_units_per_box_partial_box_rounds_up(): void {
        // 21 bags @ 20 per box = ceil(21/20) = 2 boxes (1 full + 1 partial)
        $this->assertSame( 2, b2b_compute_boxes_for_qty( 21, 1, 20 ) );
        // 1 bag @ 20 per box = 1 partial box
        $this->assertSame( 1, b2b_compute_boxes_for_qty( 1, 1, 20 ) );
        // 19 bags @ 20 per box = still 1 box
        $this->assertSame( 1, b2b_compute_boxes_for_qty( 19, 1, 20 ) );
    }

    // ─── Mutual exclusivity: upb wins when both > 1 ─────────────
    /**
     * Admin UI enforces mutual exclusivity, but logic must degrade gracefully
     * if both fields somehow get set > 1 (data corruption, migration bug).
     * Current implementation: upb > 1 takes precedence over bpu (smaller box count
     * = safer for billing — over-charging is worse than under).
     */
    public function test_upb_wins_when_both_set(): void {
        $this->assertSame( 1, b2b_compute_boxes_for_qty( 10, 5, 20 ) ); // upb=20 wins → ceil(10/20)=1
        $this->assertSame( 2, b2b_compute_boxes_for_qty( 30, 5, 20 ) ); // upb=20 → ceil(30/20)=2
    }

    // ─── Defensive coercion ─────────────────────────────────────
    public function test_negative_qty_clamps_to_zero(): void {
        $this->assertSame( 0, b2b_compute_boxes_for_qty( -5, 1, 1 ) );
    }

    public function test_zero_bpu_promoted_to_one(): void {
        // bpu=0 should NOT produce 0 boxes (would lose all items)
        $this->assertSame( 5, b2b_compute_boxes_for_qty( 5, 0, 1 ) );
    }

    public function test_zero_upb_promoted_to_one(): void {
        // upb=0 falls back to bpu path with bpu also normalized to 1
        $this->assertSame( 5, b2b_compute_boxes_for_qty( 5, 1, 0 ) );
    }

    public function test_string_qty_coerced_to_int(): void {
        // CSV imports / form posts often pass strings
        $this->assertSame( 6, b2b_compute_boxes_for_qty( '6', 1, 1 ) );
        $this->assertSame( 1, b2b_compute_boxes_for_qty( '5', 1, 20 ) );
    }

    public function test_float_qty_truncates(): void {
        // qty = 5.7 → cast int = 5 (PHP int cast truncates)
        $this->assertSame( 5, b2b_compute_boxes_for_qty( 5.7, 1, 1 ) );
    }

    // ─── Real-world scenarios ────────────────────────────────────
    public function test_real_dnc_bag_6l_20_per_box(): void {
        // 6L bag = 20 per box (units_per_box=20)
        // Customer orders 50 → ceil(50/20) = 3 boxes
        $this->assertSame( 3, b2b_compute_boxes_for_qty( 50, 1, 20 ) );
    }

    public function test_real_bulky_set_2_boxes_per_unit(): void {
        // Top-case SET requires 2 shipping boxes per unit (boxes_per_unit=2)
        // Customer orders 3 → 6 boxes
        $this->assertSame( 6, b2b_compute_boxes_for_qty( 3, 2, 1 ) );
    }
}
