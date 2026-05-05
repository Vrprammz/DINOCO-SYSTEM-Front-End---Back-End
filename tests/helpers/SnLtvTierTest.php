<?php
/**
 * SnLtvTierTest — pure-logic test of F#9 LTV tier bucketing.
 *
 * Source: [Admin System] DINOCO Production SN Manager V.0.12+
 * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §F.9
 * Phase: 3 W10
 *
 * Tier thresholds (THB):
 *   diamond  ≥ ฿100,000
 *   platinum ≥ ฿50,000
 *   gold     ≥ ฿20,000
 *   silver   ≥ ฿5,000
 *   bronze   < ฿5,000 (default)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_compute_loyalty_tier' ) ) {
    /**
     * Mirror of dinoco_sn_compute_loyalty_tier.
     */
    function sn_compute_loyalty_tier( $total_spent ): string {
        $spent = (float) $total_spent;
        if ( $spent >= 100000 ) return 'diamond';
        if ( $spent >= 50000 )  return 'platinum';
        if ( $spent >= 20000 )  return 'gold';
        if ( $spent >= 5000 )   return 'silver';
        return 'bronze';
    }
}

class SnLtvTierTest extends TestCase {

    public function test_diamond_tier_threshold() {
        $this->assertSame( 'diamond', sn_compute_loyalty_tier( 100000 ) );
        $this->assertSame( 'diamond', sn_compute_loyalty_tier( 250000 ) );
        $this->assertSame( 'diamond', sn_compute_loyalty_tier( 1000000.50 ) );
    }

    public function test_platinum_tier_range() {
        $this->assertSame( 'platinum', sn_compute_loyalty_tier( 50000 ) );
        $this->assertSame( 'platinum', sn_compute_loyalty_tier( 75000 ) );
        $this->assertSame( 'platinum', sn_compute_loyalty_tier( 99999.99 ) );
    }

    public function test_gold_tier_range() {
        $this->assertSame( 'gold', sn_compute_loyalty_tier( 20000 ) );
        $this->assertSame( 'gold', sn_compute_loyalty_tier( 35000 ) );
        $this->assertSame( 'gold', sn_compute_loyalty_tier( 49999.99 ) );
    }

    public function test_silver_tier_range() {
        $this->assertSame( 'silver', sn_compute_loyalty_tier( 5000 ) );
        $this->assertSame( 'silver', sn_compute_loyalty_tier( 12500 ) );
        $this->assertSame( 'silver', sn_compute_loyalty_tier( 19999.99 ) );
    }

    public function test_bronze_tier_default() {
        $this->assertSame( 'bronze', sn_compute_loyalty_tier( 0 ) );
        $this->assertSame( 'bronze', sn_compute_loyalty_tier( 100 ) );
        $this->assertSame( 'bronze', sn_compute_loyalty_tier( 4999.99 ) );
    }

    public function test_negative_spend_falls_to_bronze() {
        // Refund could produce negative — should not crash, falls to bronze
        $this->assertSame( 'bronze', sn_compute_loyalty_tier( -5000 ) );
    }

    public function test_exact_boundaries_are_inclusive_lower() {
        // ฿5,000 exactly = silver (≥ comparison)
        $this->assertSame( 'silver', sn_compute_loyalty_tier( 5000 ) );
        // ฿20,000 exactly = gold
        $this->assertSame( 'gold', sn_compute_loyalty_tier( 20000 ) );
        // ฿50,000 exactly = platinum
        $this->assertSame( 'platinum', sn_compute_loyalty_tier( 50000 ) );
        // ฿100,000 exactly = diamond
        $this->assertSame( 'diamond', sn_compute_loyalty_tier( 100000 ) );
    }

    public function test_string_input_coerced() {
        // SQL might return DECIMAL as string — must accept
        $this->assertSame( 'diamond', sn_compute_loyalty_tier( '156000.00' ) );
        $this->assertSame( 'silver', sn_compute_loyalty_tier( '7500.50' ) );
    }

    public function test_null_treated_as_zero() {
        $this->assertSame( 'bronze', sn_compute_loyalty_tier( null ) );
    }

    public function test_tier_progression_monotonic() {
        // Higher spend should never yield lower tier
        $tiers_order = array( 'bronze', 'silver', 'gold', 'platinum', 'diamond' );
        $samples = array( 0, 4999, 5000, 19999, 20000, 49999, 50000, 99999, 100000, 500000 );

        $prev_idx = -1;
        foreach ( $samples as $spend ) {
            $tier = sn_compute_loyalty_tier( $spend );
            $idx = array_search( $tier, $tiers_order, true );
            $this->assertGreaterThanOrEqual( $prev_idx, $idx,
                "spend=$spend tier=$tier should not decrease from previous" );
            $prev_idx = $idx;
        }
    }
}
