<?php
/**
 * SnForecastTest — pure-logic test of Phase 4 W13 F#16 named helpers.
 *
 * Source: [Admin System] DINOCO Production SN Manager V.0.30
 * Plan: docs/sn-system/20-phase4-w13-w14-prep.md §W13.1
 * Phase: 4 W13.1 + W13.4
 *
 * Helpers under test (extracted from monolithic
 * `dinoco_sn_compute_demand_forecast` for testability + plan-conformance):
 *   - dinoco_sn_compute_moving_average($historical_data, $window=3)
 *   - dinoco_sn_compute_exponential_smoothing($historical_data, $alpha=0.3)
 *   - dinoco_sn_classify_confidence($months_of_data)
 *   - dinoco_sn_compute_safety_stock($avg_monthly, $pct=0.2)
 *
 * NOTE: Existing SnDemandForecastTest tests the monolithic
 * `sn_compute_forecast` blend function (kept for backward compat). This file
 * targets the W13.1 named helpers per plan §W13.1.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* Local copies of the helpers from
 * `[Admin System] DINOCO Production SN Manager` V.0.30 lines 6416-6510.
 * Pure-logic — no DB, no WP globals, no side effects. Mirrored in test
 * fixture so we can test without bootstrapping WP runtime.
 */
if ( ! function_exists( __NAMESPACE__ . '\\sn_moving_average' ) ) {
    function sn_moving_average( array $historical_data, int $window = 3 ): float {
        if ( empty( $historical_data ) ) return 0.0;
        usort( $historical_data, function( $a, $b ) {
            return strcmp( (string) ( $a['month'] ?? '' ), (string) ( $b['month'] ?? '' ) );
        } );
        $qtys = array_map( function( $r ) {
            return (float) ( $r['qty'] ?? 0 );
        }, $historical_data );
        $n = count( $qtys );
        $w = max( 1, min( $window, $n ) );
        $slice = array_slice( $qtys, -$w );
        return array_sum( $slice ) / max( 1, count( $slice ) );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_exponential_smoothing' ) ) {
    function sn_exponential_smoothing( array $historical_data, float $alpha = 0.3 ): float {
        if ( empty( $historical_data ) ) return 0.0;
        $alpha = max( 0.0, min( 1.0, $alpha ) );
        usort( $historical_data, function( $a, $b ) {
            return strcmp( (string) ( $a['month'] ?? '' ), (string) ( $b['month'] ?? '' ) );
        } );
        $qtys = array_map( function( $r ) {
            return (float) ( $r['qty'] ?? 0 );
        }, $historical_data );
        $n = count( $qtys );
        if ( $n === 0 ) return 0.0;
        $level = $qtys[0];
        for ( $i = 1; $i < $n; $i++ ) {
            $level = $alpha * $qtys[ $i ] + ( 1.0 - $alpha ) * $level;
        }
        return (float) $level;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_classify_confidence' ) ) {
    function sn_classify_confidence( int $months_of_data ): array {
        $m = max( 0, $months_of_data );
        if ( $m >= 12 ) return array( 'band' => 'high',         'pct' => 92, 'sufficient' => true );
        if ( $m >= 6 )  return array( 'band' => 'medium',       'pct' => 80, 'sufficient' => true );
        if ( $m >= 3 )  return array( 'band' => 'low',          'pct' => 65, 'sufficient' => true );
        return         array( 'band' => 'insufficient', 'pct' => 0,  'sufficient' => false );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_safety_stock' ) ) {
    function sn_safety_stock( float $avg_monthly, float $pct = 0.2 ): int {
        $avg_monthly = max( 0.0, $avg_monthly );
        $pct = max( 0.0, $pct );
        return (int) ceil( $avg_monthly * $pct );
    }
}

class SnForecastTest extends TestCase {

    /* ─── Moving Average ─── */

    public function test_moving_average_empty_returns_zero(): void {
        $this->assertSame( 0.0, sn_moving_average( array() ) );
    }

    public function test_moving_average_single_period(): void {
        $hist = array( array( 'month' => '2025-01-01', 'qty' => 50 ) );
        $this->assertSame( 50.0, sn_moving_average( $hist, 3 ) );
    }

    public function test_moving_average_3_month_window(): void {
        $hist = array(
            array( 'month' => '2025-01-01', 'qty' => 10 ),
            array( 'month' => '2025-02-01', 'qty' => 20 ),
            array( 'month' => '2025-03-01', 'qty' => 30 ),
            array( 'month' => '2025-04-01', 'qty' => 40 ),
            array( 'month' => '2025-05-01', 'qty' => 50 ),
        );
        // Last 3: 30+40+50 = 120 / 3 = 40
        $this->assertSame( 40.0, sn_moving_average( $hist, 3 ) );
    }

    public function test_moving_average_constant_demand(): void {
        $hist = array();
        for ( $i = 0; $i < 6; $i++ ) {
            $hist[] = array( 'month' => sprintf( '2025-%02d-01', $i + 1 ), 'qty' => 100 );
        }
        // All 100 → MA = 100
        $this->assertSame( 100.0, sn_moving_average( $hist, 3 ) );
    }

    public function test_moving_average_unsorted_input_handled(): void {
        // Reverse chronological — should auto-sort ascending then take last 3
        $hist = array(
            array( 'month' => '2025-05-01', 'qty' => 50 ),
            array( 'month' => '2025-03-01', 'qty' => 30 ),
            array( 'month' => '2025-04-01', 'qty' => 40 ),
            array( 'month' => '2025-01-01', 'qty' => 10 ),
            array( 'month' => '2025-02-01', 'qty' => 20 ),
        );
        // Sorted last 3 = mar(30) + apr(40) + may(50) = 40 avg
        $this->assertSame( 40.0, sn_moving_average( $hist, 3 ) );
    }

    public function test_moving_average_window_larger_than_data(): void {
        $hist = array(
            array( 'month' => '2025-01-01', 'qty' => 30 ),
            array( 'month' => '2025-02-01', 'qty' => 60 ),
        );
        // window=10 but n=2 → use min = 2 → (30+60)/2 = 45
        $this->assertSame( 45.0, sn_moving_average( $hist, 10 ) );
    }

    public function test_moving_average_zero_qty_safe(): void {
        $hist = array(
            array( 'month' => '2025-01-01', 'qty' => 0 ),
            array( 'month' => '2025-02-01', 'qty' => 0 ),
            array( 'month' => '2025-03-01', 'qty' => 0 ),
        );
        $this->assertSame( 0.0, sn_moving_average( $hist, 3 ) );
    }

    /* ─── Exponential Smoothing ─── */

    public function test_exp_smoothing_empty_returns_zero(): void {
        $this->assertSame( 0.0, sn_exponential_smoothing( array() ) );
    }

    public function test_exp_smoothing_single_period_returns_qty(): void {
        $hist = array( array( 'month' => '2025-01-01', 'qty' => 75 ) );
        $this->assertSame( 75.0, sn_exponential_smoothing( $hist, 0.3 ) );
    }

    public function test_exp_smoothing_constant_demand_stable(): void {
        $hist = array();
        for ( $i = 0; $i < 10; $i++ ) {
            $hist[] = array( 'month' => sprintf( '2025-%02d-01', $i + 1 ), 'qty' => 50 );
        }
        // Constant input → ES converges exactly to that value
        $this->assertSame( 50.0, sn_exponential_smoothing( $hist, 0.3 ) );
    }

    public function test_exp_smoothing_alpha_0_returns_initial(): void {
        // alpha=0 → never updates from initial → stays at first value
        $hist = array(
            array( 'month' => '2025-01-01', 'qty' => 10 ),
            array( 'month' => '2025-02-01', 'qty' => 100 ),
            array( 'month' => '2025-03-01', 'qty' => 200 ),
        );
        $this->assertSame( 10.0, sn_exponential_smoothing( $hist, 0.0 ) );
    }

    public function test_exp_smoothing_alpha_1_returns_last(): void {
        // alpha=1 → fully reactive → equals last observation
        $hist = array(
            array( 'month' => '2025-01-01', 'qty' => 10 ),
            array( 'month' => '2025-02-01', 'qty' => 100 ),
            array( 'month' => '2025-03-01', 'qty' => 200 ),
        );
        $this->assertSame( 200.0, sn_exponential_smoothing( $hist, 1.0 ) );
    }

    public function test_exp_smoothing_high_alpha_more_reactive_to_spike(): void {
        $hist = array(
            array( 'month' => '2025-01-01', 'qty' => 10 ),
            array( 'month' => '2025-02-01', 'qty' => 10 ),
            array( 'month' => '2025-03-01', 'qty' => 100 ),
        );
        $high = sn_exponential_smoothing( $hist, 0.9 );
        $low = sn_exponential_smoothing( $hist, 0.1 );
        $this->assertGreaterThan( $low, $high );
    }

    public function test_exp_smoothing_alpha_clamped(): void {
        $hist = array(
            array( 'month' => '2025-01-01', 'qty' => 10 ),
            array( 'month' => '2025-02-01', 'qty' => 100 ),
        );
        // alpha=2.0 (out of range) clamps to 1.0 → last value
        $this->assertSame( 100.0, sn_exponential_smoothing( $hist, 2.0 ) );
        // alpha=-1.0 clamps to 0.0 → first value
        $this->assertSame( 10.0, sn_exponential_smoothing( $hist, -1.0 ) );
    }

    /* ─── Classify Confidence ─── */

    public function test_classify_confidence_insufficient_below_3(): void {
        $r = sn_classify_confidence( 2 );
        $this->assertSame( 'insufficient', $r['band'] );
        $this->assertSame( 0, $r['pct'] );
        $this->assertFalse( $r['sufficient'] );
    }

    public function test_classify_confidence_low_3_to_5(): void {
        foreach ( array( 3, 4, 5 ) as $m ) {
            $r = sn_classify_confidence( $m );
            $this->assertSame( 'low', $r['band'] );
            $this->assertGreaterThanOrEqual( 60, $r['pct'] );
            $this->assertLessThanOrEqual( 70, $r['pct'] );
            $this->assertTrue( $r['sufficient'] );
        }
    }

    public function test_classify_confidence_medium_6_to_11(): void {
        foreach ( array( 6, 8, 11 ) as $m ) {
            $r = sn_classify_confidence( $m );
            $this->assertSame( 'medium', $r['band'] );
            $this->assertGreaterThanOrEqual( 75, $r['pct'] );
            $this->assertLessThanOrEqual( 85, $r['pct'] );
        }
    }

    public function test_classify_confidence_high_12_plus(): void {
        foreach ( array( 12, 24, 100 ) as $m ) {
            $r = sn_classify_confidence( $m );
            $this->assertSame( 'high', $r['band'] );
            $this->assertGreaterThanOrEqual( 90, $r['pct'] );
            $this->assertLessThanOrEqual( 95, $r['pct'] );
        }
    }

    public function test_classify_confidence_negative_safe(): void {
        $r = sn_classify_confidence( -5 );
        // Negative clamped to 0 → insufficient
        $this->assertSame( 'insufficient', $r['band'] );
    }

    public function test_classify_confidence_boundary_zero(): void {
        $r = sn_classify_confidence( 0 );
        $this->assertSame( 'insufficient', $r['band'] );
        $this->assertFalse( $r['sufficient'] );
    }

    /* ─── Safety Stock ─── */

    public function test_safety_stock_default_20_pct(): void {
        // 100/month × 0.2 = 20
        $this->assertSame( 20, sn_safety_stock( 100.0 ) );
    }

    public function test_safety_stock_custom_pct(): void {
        // 50/month × 0.5 = 25
        $this->assertSame( 25, sn_safety_stock( 50.0, 0.5 ) );
    }

    public function test_safety_stock_zero_input(): void {
        $this->assertSame( 0, sn_safety_stock( 0.0 ) );
    }

    public function test_safety_stock_ceil_rounding(): void {
        // 33 × 0.2 = 6.6 → ceil = 7
        $this->assertSame( 7, sn_safety_stock( 33.0, 0.2 ) );
    }

    public function test_safety_stock_negative_clamped(): void {
        // Negative inputs clamped to 0 → safe
        $this->assertSame( 0, sn_safety_stock( -100.0 ) );
        $this->assertSame( 0, sn_safety_stock( 100.0, -0.5 ) );
    }

    /* ─── Composite scenarios (insufficient data path) ─── */

    public function test_insufficient_data_path_2_months(): void {
        // 2 months → MA + ES still compute, but classify_confidence flags insufficient
        $hist = array(
            array( 'month' => '2025-04-01', 'qty' => 30 ),
            array( 'month' => '2025-05-01', 'qty' => 40 ),
        );
        $ma = sn_moving_average( $hist, 3 );
        $es = sn_exponential_smoothing( $hist, 0.3 );
        $cf = sn_classify_confidence( count( $hist ) );
        // MA = 35 (avg of 30+40), ES = 33 (alpha 0.3 from 30 → 33)
        $this->assertSame( 35.0, $ma );
        $this->assertSame( 'insufficient', $cf['band'] );
        $this->assertFalse( $cf['sufficient'] );
        // ES roughly 33
        $this->assertEqualsWithDelta( 33.0, $es, 0.1 );
    }

    public function test_full_year_high_confidence_path(): void {
        $hist = array();
        for ( $i = 0; $i < 12; $i++ ) {
            $hist[] = array( 'month' => sprintf( '2024-%02d-01', $i + 1 ), 'qty' => 60 );
        }
        $ma = sn_moving_average( $hist, 3 );
        $cf = sn_classify_confidence( count( $hist ) );
        $sf = sn_safety_stock( $ma );
        $this->assertSame( 60.0, $ma );
        $this->assertSame( 'high', $cf['band'] );
        $this->assertSame( 12, $sf ); // 60 × 0.2 = 12
    }
}
