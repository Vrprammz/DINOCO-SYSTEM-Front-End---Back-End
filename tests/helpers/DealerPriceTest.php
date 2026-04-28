<?php
/**
 * DealerPriceTest — pure-logic test of `b2b_compute_dealer_price`.
 *
 * Source: [B2B] Snippet 1: Core Utilities & LINE Flex Builders V.34.x line 1029.
 * This function is the canonical dealer-price computation used by:
 *   - GET /catalog (Snippet 3)
 *   - POST /place-order line-item pricing
 *   - Invoice generation
 *   - LINE Flex price cards
 *   - Manual Invoice picker (`invGetRankPriceInfo` JS port)
 *
 * Wrong math here = every order/invoice/Flex card mispriced. Critical
 * regression coverage.
 *
 * Tier values stored as % discount (0-100) since V.32.6 migration.
 * Pre-V.32.6 stored absolute prices — falls back to b2b_discount_percent.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\b2b_compute_dealer_price' ) ) {
    /**
     * Inline copy of b2b_compute_dealer_price (Snippet 1 line 1029+).
     */
    function b2b_compute_dealer_price( $base_price, string $rank, array $sku_data ) {
        $base = (float) $base_price;
        if ( $base <= 0 ) return 0;

        $rank_lower   = strtolower( $rank );
        $discount_pct = 0.0;

        if ( $rank_lower === 'standard' ) {
            $discount_pct = (float) ( $sku_data['discount_standard']
                ?? $sku_data['b2b_discount_percent']
                ?? $sku_data['discount']
                ?? 0 );
        } else {
            $tier_key = 'price_' . $rank_lower;
            $tier_val = isset( $sku_data[ $tier_key ] ) ? (float) $sku_data[ $tier_key ] : 0.0;

            if ( $tier_val > 0 && $tier_val <= 100 ) {
                $discount_pct = $tier_val;
            } else {
                $discount_pct = (float) ( $sku_data['b2b_discount_percent']
                    ?? $sku_data['discount']
                    ?? 0 );
            }
        }

        if ( $discount_pct > 0 && $discount_pct <= 100 ) {
            return round( $base * ( 1 - $discount_pct / 100 ), 2 );
        }
        return $base;
    }
}

class DealerPriceTest extends TestCase {

    public function test_zero_base_returns_zero(): void {
        $this->assertSame( 0, b2b_compute_dealer_price( 0, 'silver', array( 'price_silver' => 20 ) ) );
        $this->assertSame( 0, b2b_compute_dealer_price( -50, 'silver', array() ) );
    }

    public function test_silver_tier_20_pct_discount(): void {
        $price = b2b_compute_dealer_price( 8800, 'silver', array( 'price_silver' => 20 ) );
        $this->assertSame( 7040.0, $price );
    }

    public function test_gold_tier_30_pct_discount(): void {
        $price = b2b_compute_dealer_price( 1000, 'gold', array( 'price_gold' => 30 ) );
        $this->assertSame( 700.0, $price );
    }

    public function test_diamond_tier_50_pct_discount(): void {
        $price = b2b_compute_dealer_price( 1000, 'diamond', array( 'price_diamond' => 50 ) );
        $this->assertSame( 500.0, $price );
    }

    public function test_standard_uses_b2b_discount_percent(): void {
        $price = b2b_compute_dealer_price( 1000, 'standard', array( 'b2b_discount_percent' => 10 ) );
        $this->assertSame( 900.0, $price );
    }

    public function test_standard_prefers_discount_standard_over_legacy(): void {
        $price = b2b_compute_dealer_price( 1000, 'standard', array(
            'discount_standard'    => 15,
            'b2b_discount_percent' => 10, // should be ignored when discount_standard present
        ) );
        $this->assertSame( 850.0, $price );
    }

    public function test_unmigrated_tier_falls_back_to_b2b_discount_percent(): void {
        // Pre-V.32.6: price_silver stored as absolute (e.g. 7040 instead of 20%)
        // Logic should reject (>100) and fall back.
        $price = b2b_compute_dealer_price( 8800, 'silver', array(
            'price_silver'         => 7040, // absolute, invalid as %
            'b2b_discount_percent' => 5,    // fallback
        ) );
        $this->assertSame( 8360.0, $price ); // 8800 × 0.95
    }

    public function test_no_discount_returns_base(): void {
        $price = b2b_compute_dealer_price( 1000, 'silver', array() );
        $this->assertSame( 1000.0, $price );
    }

    public function test_zero_tier_falls_back_to_default(): void {
        // tier_val=0 → treated as "no tier price set" → fall back to b2b_discount_percent
        $price = b2b_compute_dealer_price( 1000, 'gold', array(
            'price_gold'           => 0,
            'b2b_discount_percent' => 8,
        ) );
        $this->assertSame( 920.0, $price );
    }

    public function test_100_pct_discount_floor_at_zero(): void {
        $price = b2b_compute_dealer_price( 1000, 'silver', array( 'price_silver' => 100 ) );
        $this->assertSame( 0.0, $price );
    }

    public function test_rank_case_insensitive(): void {
        $a = b2b_compute_dealer_price( 1000, 'SILVER', array( 'price_silver' => 20 ) );
        $b = b2b_compute_dealer_price( 1000, 'Silver', array( 'price_silver' => 20 ) );
        $c = b2b_compute_dealer_price( 1000, 'silver', array( 'price_silver' => 20 ) );
        $this->assertSame( 800.0, $a );
        $this->assertSame( 800.0, $b );
        $this->assertSame( 800.0, $c );
    }

    public function test_decimal_base_rounds_to_2dp(): void {
        // 1234.56 × 0.85 = 1049.376 → round to 1049.38
        $price = b2b_compute_dealer_price( 1234.56, 'silver', array( 'price_silver' => 15 ) );
        $this->assertSame( 1049.38, $price );
    }

    public function test_negative_discount_ignored(): void {
        // Discount must be 0 < d <= 100. Negative is treated as no discount.
        $price = b2b_compute_dealer_price( 1000, 'silver', array(
            'price_silver'         => -10,
            'b2b_discount_percent' => 0,
        ) );
        $this->assertSame( 1000.0, $price );
    }

    public function test_legacy_discount_field_alias(): void {
        // 'discount' is a legacy alias for b2b_discount_percent
        $price = b2b_compute_dealer_price( 1000, 'standard', array( 'discount' => 12 ) );
        $this->assertSame( 880.0, $price );
    }
}
