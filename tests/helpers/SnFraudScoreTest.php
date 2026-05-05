<?php
/**
 * SnFraudScoreTest — pure-logic test of F#12 6-factor fraud scoring.
 *
 * Source: [Admin System] DINOCO Production SN Manager V.0.14+
 * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §F.12
 * Phase: 3 W11
 *
 * 6 factors (max sum = 100):
 *   velocity      max 25
 *   geographic    max 20
 *   phone_pattern max 20
 *   time_pattern  max 15
 *   sequential    max 10
 *   receipt       max 10
 *
 * Tier classification:
 *   < 50    safe
 *   50-69   monitor
 *   ≥ 70    block
 *
 * Tests focus on:
 *   - Signal clamping [0, 1]
 *   - Weighted sum math
 *   - Tier boundaries
 *   - Empty / partial signals
 *   - Type coercion (string / null)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_compute_fraud' ) ) {
    /**
     * Mirror of dinoco_sn_compute_fraud_score (deterministic math only).
     */
    function sn_compute_fraud(
        array $signals,
        int $block_threshold = 70,
        int $monitor_threshold = 50
    ): array {
        $weights = array(
            'velocity'      => 25,
            'geographic'    => 20,
            'phone_pattern' => 20,
            'time_pattern'  => 15,
            'sequential'    => 10,
            'receipt'       => 10,
        );
        $total = 0;
        $factors = array();
        foreach ( $weights as $key => $max_weight ) {
            $signal = isset( $signals[ $key ] ) ? (float) $signals[ $key ] : 0.0;
            $signal = max( 0.0, min( 1.0, $signal ) );
            $weighted = (int) round( $signal * $max_weight );
            $factors[ $key ] = array(
                'signal' => $signal,
                'weight' => $max_weight,
                'weighted' => $weighted,
            );
            $total += $weighted;
        }
        $total = max( 0, min( 100, $total ) );
        $tier = 'safe';
        if ( $total >= $block_threshold ) $tier = 'block';
        elseif ( $total >= $monitor_threshold ) $tier = 'monitor';
        return array( 'score' => $total, 'tier' => $tier, 'factors' => $factors );
    }
}

class SnFraudScoreTest extends TestCase {

    /* ───── Score math ───── */

    public function test_zero_signals_returns_safe() {
        $r = sn_compute_fraud( array() );
        $this->assertSame( 0, $r['score'] );
        $this->assertSame( 'safe', $r['tier'] );
    }

    public function test_max_all_factors_equals_100() {
        $r = sn_compute_fraud( array(
            'velocity'      => 1.0,
            'geographic'    => 1.0,
            'phone_pattern' => 1.0,
            'time_pattern'  => 1.0,
            'sequential'    => 1.0,
            'receipt'       => 1.0,
        ) );
        $this->assertSame( 100, $r['score'] );
        $this->assertSame( 'block', $r['tier'] );
    }

    public function test_velocity_max_only() {
        $r = sn_compute_fraud( array( 'velocity' => 1.0 ) );
        $this->assertSame( 25, $r['score'] );
        $this->assertSame( 'safe', $r['tier'] );
    }

    public function test_sum_velocity_plus_geo_equals_45() {
        $r = sn_compute_fraud( array( 'velocity' => 1.0, 'geographic' => 1.0 ) );
        $this->assertSame( 45, $r['score'] );
        $this->assertSame( 'safe', $r['tier'] );
    }

    public function test_above_50_yields_monitor_tier() {
        $r = sn_compute_fraud( array(
            'velocity'      => 1.0,  // 25
            'geographic'    => 1.0,  // 20
            'phone_pattern' => 0.5,  // 10
        ) );
        $this->assertSame( 55, $r['score'] );
        $this->assertSame( 'monitor', $r['tier'] );
    }

    public function test_above_70_yields_block_tier() {
        $r = sn_compute_fraud( array(
            'velocity'      => 1.0,  // 25
            'geographic'    => 1.0,  // 20
            'phone_pattern' => 1.0,  // 20
            'time_pattern'  => 0.5,  // 8 (round)
        ) );
        // 25+20+20+8 = 73
        $this->assertGreaterThanOrEqual( 70, $r['score'] );
        $this->assertSame( 'block', $r['tier'] );
    }

    /* ───── Boundary tests ───── */

    public function test_exact_boundary_50_is_monitor() {
        // Need exactly 50 — phone+geo = 20+20+5(time half)→ no. velocity 1.0 + phone 1.0 = 45. + time .333 = 50
        $r = sn_compute_fraud( array(
            'velocity' => 1.0,        // 25
            'phone_pattern' => 1.0,   // 20
            'sequential' => 0.5,      // 5
        ) );
        $this->assertSame( 50, $r['score'] );
        $this->assertSame( 'monitor', $r['tier'] );
    }

    public function test_exact_boundary_70_is_block() {
        $r = sn_compute_fraud( array(
            'velocity'      => 1.0,  // 25
            'geographic'    => 1.0,  // 20
            'phone_pattern' => 1.0,  // 20
            'sequential'    => 0.5,  // 5
        ) );
        $this->assertSame( 70, $r['score'] );
        $this->assertSame( 'block', $r['tier'] );
    }

    /* ───── Signal clamping ───── */

    public function test_signal_above_1_is_clamped() {
        $r = sn_compute_fraud( array( 'velocity' => 5.0 ) );
        // Clamped to 1.0 × 25 = 25
        $this->assertSame( 25, $r['score'] );
    }

    public function test_negative_signal_clamped_to_zero() {
        $r = sn_compute_fraud( array( 'velocity' => -3.0, 'geographic' => 1.0 ) );
        // velocity → 0, geographic → 20
        $this->assertSame( 20, $r['score'] );
    }

    public function test_unknown_keys_ignored() {
        $r = sn_compute_fraud( array(
            'velocity'      => 1.0,
            'unknown_factor' => 1.0,
            'random_key'    => 0.5,
        ) );
        $this->assertSame( 25, $r['score'] );
    }

    public function test_string_signal_coerced() {
        $r = sn_compute_fraud( array( 'velocity' => '0.8' ) );
        // 0.8 × 25 = 20
        $this->assertSame( 20, $r['score'] );
    }

    /* ───── Configurable thresholds ───── */

    public function test_custom_block_threshold() {
        // Score 60 with custom block=60 → block tier
        $r = sn_compute_fraud(
            array( 'velocity' => 1.0, 'phone_pattern' => 1.0, 'sequential' => 1.0, 'receipt' => 0.5 ),
            60,  // block threshold
            40   // monitor threshold
        );
        // 25 + 20 + 10 + 5 = 60
        $this->assertSame( 60, $r['score'] );
        $this->assertSame( 'block', $r['tier'] );
    }

    public function test_factors_breakdown_returned() {
        $r = sn_compute_fraud( array( 'velocity' => 1.0, 'geographic' => 0.5 ) );
        $this->assertArrayHasKey( 'factors', $r );
        $this->assertCount( 6, $r['factors'] );
        $this->assertSame( 25, $r['factors']['velocity']['weighted'] );
        $this->assertSame( 10, $r['factors']['geographic']['weighted'] );
        $this->assertSame( 0, $r['factors']['phone_pattern']['weighted'] );
    }

    public function test_total_clamped_at_100_even_with_extreme_weights() {
        // All max signals → 25+20+20+15+10+10 = 100. Verify hard cap.
        $r = sn_compute_fraud( array(
            'velocity' => 999, 'geographic' => 999, 'phone_pattern' => 999,
            'time_pattern' => 999, 'sequential' => 999, 'receipt' => 999,
        ) );
        $this->assertSame( 100, $r['score'] );
        $this->assertSame( 'block', $r['tier'] );
    }
}
