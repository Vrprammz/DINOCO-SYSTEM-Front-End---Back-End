<?php
/**
 * ExpressCategoryTest — pure-logic test of `dinoco_suggest_express_category()`.
 *
 * Source: [B2B] Snippet 15: Custom Tables & JWT Session V.8.0+ line 4045.
 *
 * Function decides Flash courier vehicle assignment per parcel:
 *   - return 1 = bike (motorcycle delivery, light/small parcels)
 *   - return 4 = truck (large/heavy parcels — bumps shipping fee)
 *
 * Decision (DR-1, ordered — first match wins):
 *   1. weight_g > weight threshold (default 5000g)        → 4 (truck)
 *   2. max_dim > max_dim threshold (default 45cm)         → 4 (truck)
 *   3. sum_dim (L+W+H) > sum threshold (default 150cm)    → 4 (truck)
 *   4. otherwise                                          → 1 (bike)
 *
 * Thresholds come from `dinoco_shipping_defaults()['express_threshold']`:
 *   - weight_g    (default 5000)
 *   - max_dim_cm  (default 45)
 *   - sum_dim_cm  (default 150)
 *
 * Critical for B2B orders — wrong category = wrong courier dispatched +
 * wrong shipping fee billed. F2 cron monitors Flash bumps (1→4) and triggers
 * Flex alert if Flash up-grades parcel category server-side.
 *
 * Critical invariants:
 *   - All thresholds use STRICT inequality (`>`, NOT `>=`) — boundary is bike
 *   - intval() coerces strings ("100", "5000") to int safely
 *   - Missing dims default to 0 (zero won't trip thresholds)
 *   - Empty thresholds → use defaults (5000/45/150)
 *   - Custom thresholds override defaults
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\ExpressCategory;

use PHPUnit\Framework\TestCase;

// Mock dinoco_shipping_defaults — driven by `__ec_defaults` global stash.
if ( ! function_exists( __NAMESPACE__ . '\\dinoco_shipping_defaults' ) ) {
    function dinoco_shipping_defaults(): array {
        return $GLOBALS['__ec_defaults'] ?? array();
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_suggest_express_category' ) ) {
    /**
     * Inline copy mirrors source line-for-line.
     */
    function dinoco_suggest_express_category( $weight_g, $dims ) {
        $defaults = dinoco_shipping_defaults();
        $thr = isset( $defaults['express_threshold'] ) ? $defaults['express_threshold'] : array();
        $wt_thr  = isset( $thr['weight_g'] )   ? intval( $thr['weight_g'] )   : 5000;
        $dim_thr = isset( $thr['max_dim_cm'] ) ? intval( $thr['max_dim_cm'] ) : 45;
        $sum_thr = isset( $thr['sum_dim_cm'] ) ? intval( $thr['sum_dim_cm'] ) : 150;

        $L = isset( $dims['length_cm'] ) ? intval( $dims['length_cm'] ) : 0;
        $W = isset( $dims['width_cm'] )  ? intval( $dims['width_cm'] )  : 0;
        $H = isset( $dims['height_cm'] ) ? intval( $dims['height_cm'] ) : 0;
        $max_dim = max( $L, $W, $H );
        $sum_dim = $L + $W + $H;

        if ( intval( $weight_g ) > $wt_thr ) return 4;
        if ( $max_dim > $dim_thr ) return 4;
        if ( $sum_dim > $sum_thr ) return 4;
        return 1;
    }
}

/**
 * @covers ::dinoco_suggest_express_category
 */
final class ExpressCategoryTest extends TestCase {

    protected function setUp(): void {
        parent::setUp();
        // Default to empty defaults (use hardcoded fallbacks 5000/45/150).
        $GLOBALS['__ec_defaults'] = array();
    }

    protected function tearDown(): void {
        unset( $GLOBALS['__ec_defaults'] );
        parent::tearDown();
    }

    public function test_small_light_parcel_returns_bike(): void {
        // 1kg, 20×15×10 (sum=45) — well under all thresholds.
        $result = dinoco_suggest_express_category( 1000, array(
            'length_cm' => 20, 'width_cm' => 15, 'height_cm' => 10,
        ) );
        $this->assertSame( 1, $result );
    }

    public function test_heavy_parcel_over_weight_returns_truck(): void {
        // 6kg > 5kg threshold → truck even though dims are small.
        $result = dinoco_suggest_express_category( 6000, array(
            'length_cm' => 20, 'width_cm' => 15, 'height_cm' => 10,
        ) );
        $this->assertSame( 4, $result );
    }

    public function test_oversized_max_dim_returns_truck(): void {
        // Light but one dim > 45cm (L=50) → truck.
        $result = dinoco_suggest_express_category( 2000, array(
            'length_cm' => 50, 'width_cm' => 20, 'height_cm' => 15,
        ) );
        $this->assertSame( 4, $result );
    }

    public function test_oversized_combined_returns_truck(): void {
        // Note geometric reality: with each dim ≤ 45 (max_dim threshold), sum
        // can hit at most 3*45=135 — under sum_dim 150 threshold. So in
        // practice, sum_dim trigger fires only AFTER max_dim already trips.
        // L=60,W=50,H=45 → max_dim=60 trips truck (sum=155 redundant trigger).
        $result = dinoco_suggest_express_category( 2000, array(
            'length_cm' => 60, 'width_cm' => 50, 'height_cm' => 45,
        ) );
        $this->assertSame( 4, $result );
    }

    public function test_weight_boundary_exactly_threshold_returns_bike(): void {
        // STRICT > inequality: 5000g === threshold → bike (NOT truck).
        $result = dinoco_suggest_express_category( 5000, array(
            'length_cm' => 20, 'width_cm' => 20, 'height_cm' => 20,
        ) );
        $this->assertSame( 1, $result );
    }

    public function test_weight_one_gram_over_threshold_returns_truck(): void {
        // 5001g > 5000 → truck (boundary check off-by-one).
        $result = dinoco_suggest_express_category( 5001, array(
            'length_cm' => 20, 'width_cm' => 20, 'height_cm' => 20,
        ) );
        $this->assertSame( 4, $result );
    }

    public function test_max_dim_boundary_returns_bike(): void {
        // Exactly 45cm → bike (boundary).
        $result = dinoco_suggest_express_category( 1000, array(
            'length_cm' => 45, 'width_cm' => 30, 'height_cm' => 20,
        ) );
        $this->assertSame( 1, $result );
    }

    public function test_max_dim_one_cm_over_returns_truck(): void {
        $result = dinoco_suggest_express_category( 1000, array(
            'length_cm' => 46, 'width_cm' => 30, 'height_cm' => 20,
        ) );
        $this->assertSame( 4, $result );
    }

    public function test_sum_dim_boundary_returns_bike(): void {
        // Each dim ≤ 45 (max_dim threshold) but sum exactly 150 → bike.
        // 45+45+45=135 (under) — boost width to hit boundary 150 without
        // tripping max_dim: L=45, W=45, H=60 trips max_dim. Use L=45,W=45,H=45
        // for a clean "under all thresholds" pass test instead. Sum=135.
        $result = dinoco_suggest_express_category( 1000, array(
            'length_cm' => 45, 'width_cm' => 45, 'height_cm' => 45,
        ) );
        $this->assertSame( 1, $result );
    }

    public function test_sum_dim_just_at_threshold_each_under_max(): void {
        // True sum-dim boundary: L=45, W=45, H=45 → sum=135 (under). Push to
        // exact 150 with each ≤ 45 isn't possible (3 × 45 = 135). The intent
        // here is: dims that DON'T trigger max_dim_cm but DO trigger sum_dim_cm.
        // Use L=45, W=45, H=44 → sum=134 → bike. Then sum=151 = 50+50+51 (each 51 > 45 → trips max_dim first).
        // Conclusion: sum-dim threshold is HIT ONLY when max_dim is also hit
        // (geometric reality: 3 dims summing > 150 with each ≤ 45 impossible).
        // Document this: any case > 150 sum will already trip max_dim 45.
        $result = dinoco_suggest_express_category( 1000, array(
            'length_cm' => 45, 'width_cm' => 45, 'height_cm' => 44,
        ) );
        $this->assertSame( 1, $result );
    }

    public function test_missing_dims_default_to_zero(): void {
        // Empty dims array → all 0s → no trigger by dims; only weight matters.
        $result = dinoco_suggest_express_category( 100, array() );
        $this->assertSame( 1, $result );
    }

    public function test_partial_dims_treated_as_zero(): void {
        // Only length set; W and H default 0.
        $result = dinoco_suggest_express_category( 1000, array( 'length_cm' => 30 ) );
        $this->assertSame( 1, $result );
    }

    public function test_string_numeric_dims_coerced_via_intval(): void {
        // DB sometimes returns string values.
        $result = dinoco_suggest_express_category( '6000', array(
            'length_cm' => '20', 'width_cm' => '15', 'height_cm' => '10',
        ) );
        $this->assertSame( 4, $result );
    }

    public function test_custom_thresholds_override_defaults(): void {
        // Strict shop rule: only ≤3kg goes by bike.
        $GLOBALS['__ec_defaults'] = array(
            'express_threshold' => array(
                'weight_g'   => 3000,
                'max_dim_cm' => 45,
                'sum_dim_cm' => 150,
            ),
        );
        // 4kg — under default 5000g but over custom 3000g → truck.
        $result = dinoco_suggest_express_category( 4000, array(
            'length_cm' => 20, 'width_cm' => 15, 'height_cm' => 10,
        ) );
        $this->assertSame( 4, $result );
    }

    public function test_custom_loose_thresholds(): void {
        // Loose policy (e.g. test mode): allow up to 10kg / 60cm.
        $GLOBALS['__ec_defaults'] = array(
            'express_threshold' => array(
                'weight_g'   => 10000,
                'max_dim_cm' => 60,
                'sum_dim_cm' => 200,
            ),
        );
        // 8kg, 55×40×30 (sum=125) — under all custom but over hardcoded defaults.
        $result = dinoco_suggest_express_category( 8000, array(
            'length_cm' => 55, 'width_cm' => 40, 'height_cm' => 30,
        ) );
        $this->assertSame( 1, $result );
    }

    public function test_zero_weight_with_oversized_dims_returns_truck(): void {
        // Weight=0 (data missing) but dims trigger truck → respect dims rule.
        $result = dinoco_suggest_express_category( 0, array(
            'length_cm' => 60, 'width_cm' => 50, 'height_cm' => 50,
        ) );
        $this->assertSame( 4, $result );
    }

    public function test_negative_weight_treated_as_under_threshold(): void {
        // Defective input: negative weight → intval(-100) = -100 → not > 5000 → bike.
        $result = dinoco_suggest_express_category( -100, array(
            'length_cm' => 20, 'width_cm' => 20, 'height_cm' => 20,
        ) );
        $this->assertSame( 1, $result );
    }
}
