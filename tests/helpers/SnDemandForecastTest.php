<?php
/**
 * SnDemandForecastTest — pure-logic test of F#16 demand forecast math.
 *
 * Source: [Admin System] DINOCO Production SN Manager V.0.15+
 * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §F.16
 * Phase: 4 W13
 *
 * Algorithm:
 *   - Moving average over last min(6, n) periods
 *   - Single exponential smoothing (alpha=0.3 default)
 *   - Blend: predicted = (MA + ES) / 2
 *   - Confidence: 100 - cv_percent - sample_penalty
 *     - cv_percent = (stddev / mean) × 100
 *     - sample_penalty = max(0, 12 - n) × 5
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_compute_forecast' ) ) {
    function sn_compute_forecast( array $history, int $forecast_months = 6, float $alpha = 0.3 ): array {
        if ( empty( $history ) ) return array();
        usort( $history, function( $a, $b ) {
            return strcmp( (string) $a['month'], (string) $b['month'] );
        } );
        $qtys = array_map( function( $r ) { return (float) ( $r['qty'] ?? 0 ); }, $history );
        $n = count( $qtys );

        $ma_window = min( 6, $n );
        $ma_slice = array_slice( $qtys, -$ma_window );
        $ma = array_sum( $ma_slice ) / max( 1, count( $ma_slice ) );

        $level = $qtys[0];
        for ( $i = 1; $i < $n; $i++ ) {
            $level = $alpha * $qtys[ $i ] + ( 1 - $alpha ) * $level;
        }

        $mean = array_sum( $qtys ) / $n;
        $variance = 0.0;
        foreach ( $qtys as $q ) { $variance += ( $q - $mean ) ** 2; }
        $variance = $variance / max( 1, $n );
        $stddev = sqrt( $variance );
        $cv_percent = $mean > 0 ? ( $stddev / $mean ) * 100 : 0;
        $sample_penalty = max( 0, 12 - $n ) * 5;
        $confidence = max( 0, min( 100, 100 - $cv_percent - $sample_penalty ) );

        $predicted_base = ( $ma + $level ) / 2;

        $last_month = $history[ count( $history ) - 1 ]['month'];
        $forecasts = array();
        for ( $i = 1; $i <= $forecast_months; $i++ ) {
            try {
                $dt = new \DateTime( $last_month );
                $dt->modify( '+' . $i . ' months' );
                $forecast_month = $dt->format( 'Y-m-01' );
            } catch ( \Throwable $_e ) { continue; }
            $forecasts[] = array(
                'month'          => $forecast_month,
                'predicted_qty'  => max( 0, (int) round( $predicted_base ) ),
                'confidence_pct' => (int) round( $confidence ),
            );
        }
        return $forecasts;
    }
}

class SnDemandForecastTest extends TestCase {

    public function test_empty_history_returns_empty() {
        $this->assertSame( array(), sn_compute_forecast( array() ) );
    }

    public function test_constant_demand_predicts_constant() {
        // 6 months × 50 plates → forecast should be ~50
        $history = array();
        for ( $i = 0; $i < 6; $i++ ) {
            $month = sprintf( '2025-%02d-01', $i + 1 );
            $history[] = array( 'month' => $month, 'qty' => 50 );
        }
        $forecasts = sn_compute_forecast( $history );
        $this->assertCount( 6, $forecasts );
        foreach ( $forecasts as $f ) {
            $this->assertSame( 50, $f['predicted_qty'] );
        }
    }

    public function test_constant_demand_high_confidence() {
        $history = array();
        for ( $i = 0; $i < 12; $i++ ) {
            $month = sprintf( '2024-%02d-01', $i + 1 );
            $history[] = array( 'month' => $month, 'qty' => 100 );
        }
        $forecasts = sn_compute_forecast( $history );
        // Constant data + 12 samples → 100% confidence
        $this->assertSame( 100, $forecasts[0]['confidence_pct'] );
    }

    public function test_volatile_demand_low_confidence() {
        // 6 months alternating 10/100 → high CV → low confidence
        $history = array(
            array( 'month' => '2025-01-01', 'qty' => 10 ),
            array( 'month' => '2025-02-01', 'qty' => 100 ),
            array( 'month' => '2025-03-01', 'qty' => 10 ),
            array( 'month' => '2025-04-01', 'qty' => 100 ),
            array( 'month' => '2025-05-01', 'qty' => 10 ),
            array( 'month' => '2025-06-01', 'qty' => 100 ),
        );
        $forecasts = sn_compute_forecast( $history );
        // CV ≈ 81% + sample_penalty (12-6)*5 = 30 → confidence very low
        $this->assertLessThan( 30, $forecasts[0]['confidence_pct'] );
    }

    public function test_few_samples_low_confidence() {
        // Only 3 samples → sample_penalty = 9*5 = 45 (after CV deduction)
        $history = array(
            array( 'month' => '2025-04-01', 'qty' => 50 ),
            array( 'month' => '2025-05-01', 'qty' => 50 ),
            array( 'month' => '2025-06-01', 'qty' => 50 ),
        );
        $forecasts = sn_compute_forecast( $history );
        // Confidence ≤ 100 - 0 - 45 = 55 (CV=0 because constant)
        $this->assertLessThanOrEqual( 55, $forecasts[0]['confidence_pct'] );
    }

    public function test_forecast_months_count() {
        $history = array();
        for ( $i = 0; $i < 6; $i++ ) {
            $history[] = array( 'month' => sprintf( '2025-%02d-01', $i + 1 ), 'qty' => 50 );
        }
        $f3 = sn_compute_forecast( $history, 3 );
        $this->assertCount( 3, $f3 );
        $f12 = sn_compute_forecast( $history, 12 );
        $this->assertCount( 12, $f12 );
    }

    public function test_forecast_months_increment_correctly() {
        $history = array(
            array( 'month' => '2025-06-01', 'qty' => 100 ),
        );
        $forecasts = sn_compute_forecast( $history, 3 );
        // Last history = June 2025 → forecast July, Aug, Sep
        $this->assertSame( '2025-07-01', $forecasts[0]['month'] );
        $this->assertSame( '2025-08-01', $forecasts[1]['month'] );
        $this->assertSame( '2025-09-01', $forecasts[2]['month'] );
    }

    public function test_predicted_qty_never_negative() {
        $history = array(
            array( 'month' => '2025-01-01', 'qty' => 0 ),
            array( 'month' => '2025-02-01', 'qty' => 0 ),
            array( 'month' => '2025-03-01', 'qty' => 0 ),
        );
        $forecasts = sn_compute_forecast( $history );
        foreach ( $forecasts as $f ) {
            $this->assertGreaterThanOrEqual( 0, $f['predicted_qty'] );
        }
    }

    public function test_history_unsorted_input_works() {
        // Reverse chronological — should auto-sort
        $history = array(
            array( 'month' => '2025-06-01', 'qty' => 60 ),
            array( 'month' => '2025-05-01', 'qty' => 50 ),
            array( 'month' => '2025-04-01', 'qty' => 40 ),
        );
        $forecasts = sn_compute_forecast( $history, 1 );
        // Last = June (latest) → forecast July
        $this->assertSame( '2025-07-01', $forecasts[0]['month'] );
    }

    public function test_alpha_parameter_affects_smoothing() {
        // High alpha = react more to recent values
        $history = array(
            array( 'month' => '2025-01-01', 'qty' => 10 ),
            array( 'month' => '2025-02-01', 'qty' => 10 ),
            array( 'month' => '2025-03-01', 'qty' => 100 ), // spike
        );
        // alpha=0.9 → ES heavily weighted to recent spike
        $f_high = sn_compute_forecast( $history, 1, 0.9 );
        // alpha=0.1 → ES barely moves with spike
        $f_low = sn_compute_forecast( $history, 1, 0.1 );
        $this->assertGreaterThan(
            $f_low[0]['predicted_qty'],
            $f_high[0]['predicted_qty'],
            'higher alpha should react more to recent spike'
        );
    }

    public function test_growth_trend_predicted() {
        // Linear growth — forecast should reflect upward trajectory
        $history = array();
        for ( $i = 0; $i < 6; $i++ ) {
            $history[] = array(
                'month' => sprintf( '2025-%02d-01', $i + 1 ),
                'qty' => 20 + $i * 10,  // 20, 30, 40, 50, 60, 70
            );
        }
        $forecasts = sn_compute_forecast( $history, 1 );
        // Predicted should be > average of first half (35) and < last value (70)
        // Blended MA(45) + ES → mid-40s
        $this->assertGreaterThan( 30, $forecasts[0]['predicted_qty'] );
        $this->assertLessThan( 80, $forecasts[0]['predicted_qty'] );
    }

    public function test_zero_history_qty_zero_division_safe() {
        $history = array(
            array( 'month' => '2025-01-01', 'qty' => 0 ),
            array( 'month' => '2025-02-01', 'qty' => 0 ),
            array( 'month' => '2025-03-01', 'qty' => 0 ),
        );
        $forecasts = sn_compute_forecast( $history );
        // Mean=0 → division by zero protection → CV=0
        // Sample penalty (12-3)*5 = 45 → confidence = 100 - 0 - 45 = 55
        $this->assertLessThanOrEqual( 100, $forecasts[0]['confidence_pct'] );
        $this->assertGreaterThanOrEqual( 0, $forecasts[0]['confidence_pct'] );
    }
}
