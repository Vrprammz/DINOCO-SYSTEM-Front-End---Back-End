<?php
/**
 * InvoicePickerTest — pure-logic regression test for Manual Invoice picker
 * price extraction (`invGetRankPriceInfo` + `_invPickerVals`).
 *
 * Bug history (V.34.4 → V.34.5 → V.34.6):
 *   - V.34.4: Multi-Picker เลือก SET ฿8,800 -20% ออก ฿5,632 (ควร ฿7,040).
 *     4 call-sites ส่ง `unit_price = ราคาดีลเลอร์` (หักแล้ว) **พร้อม**
 *     `discount_raw = 20%` → `invRecalc` คิดส่วนลดซ้ำ 8800×0.80×0.80.
 *   - V.34.5 HIGH-1: Legacy unmigrated tier prices (price_silver=7040 absolute)
 *     → effective<base → derive implicit disc% from ratio.
 *
 * Source: [Admin System] DINOCO Manual Invoice System V.34.6 line 4434+ (JS).
 * The math is pure — port to PHP for testing. Source of truth is still JS;
 * if the JS rule changes, this test must mirror it.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/**
 * PHP port of `invGetRankPriceInfo(p)` (JS).
 * Returns ['base' => float, 'disc' => float, 'effective' => float].
 */
function invGetRankPriceInfo( array $p, string $rank = 'standard' ): array {
    $basePrice = (float) ( $p['catalog_price'] ?? $p['base_price'] ?? 0 );
    $discKey   = 'price_' . $rank;
    $discPct   = (float) ( $p[ $discKey ] ?? 0 );

    // tier values are % discount (0-100). If > 100 = unmigrated price, fallback.
    if ( ! ( $discPct > 0 && $discPct <= 100 ) ) {
        $discPct = (float) ( $p['b2b_discount_percent'] ?? $p['discount'] ?? 0 );
    }
    if ( ! ( $discPct > 0 && $discPct <= 100 ) ) {
        $discPct = 0.0;
    }

    if ( $discPct > 0 && $basePrice > 0 ) {
        $effective = round( $basePrice * ( 1 - $discPct / 100 ), 2 );
    } else {
        $effective = (float) ( $p['dealer_price'] ?? $basePrice );
        if ( $effective <= 0 ) {
            $effective = $basePrice;
        }
    }

    // HIGH-1 (V.34.5): derive implicit disc% for legacy unmigrated tier prices
    if ( $discPct === 0.0 && $basePrice > 0 && $effective > 0 && $effective < $basePrice ) {
        $discPct = round( ( 1 - $effective / $basePrice ) * 10000 ) / 100;
    }

    return array( 'base' => $basePrice, 'disc' => $discPct, 'effective' => $effective );
}

/**
 * PHP port of `_invPickerVals(p, fallback)` (JS).
 * Returns ['unit_price' => float, 'discount_raw' => string].
 */
function _invPickerVals( array $p, float $fallback = 0.0, string $rank = 'standard' ): array {
    $info = invGetRankPriceInfo( $p, $rank );
    if ( $info['base'] > 0 ) {
        return array(
            'unit_price'   => $info['base'],
            'discount_raw' => $info['disc'] > 0 ? $info['disc'] . '%' : '',
        );
    }
    return array(
        'unit_price'   => $info['effective'] > 0 ? $info['effective'] : $fallback,
        'discount_raw' => '',
    );
}

/**
 * Simulates `invRecalc` discount application on emitted picker values.
 * unit_price * (1 - disc%/100) = effective line price.
 */
function applyDiscount( float $unit_price, string $discount_raw ): float {
    if ( $discount_raw === '' ) {
        return $unit_price;
    }
    $pct = (float) rtrim( $discount_raw, '%' );
    return round( $unit_price * ( 1 - $pct / 100 ), 2 );
}

class InvoicePickerTest extends TestCase {

    /**
     * Standard case — catalog ฿8,800 with silver tier 20% discount.
     * V.34.4 regression: was producing ฿5,632 (8800×0.80×0.80) instead of ฿7,040.
     */
    public function test_standard_tier_discount_applies_once(): void {
        $product = array(
            'catalog_price'        => 8800,
            'price_silver'         => 20, // 20% off for silver
            'b2b_discount_percent' => 0,
        );
        $info = invGetRankPriceInfo( $product, 'silver' );
        $this->assertSame( 8800.0, $info['base'] );
        $this->assertSame( 20.0, $info['disc'] );
        $this->assertSame( 7040.0, $info['effective'] );

        $vals = _invPickerVals( $product, 0, 'silver' );
        $this->assertSame( 8800.0, $vals['unit_price'] );
        $this->assertSame( '20%', $vals['discount_raw'] );

        // Apply discount once → 7,040 ✓ (not 5,632)
        $this->assertSame( 7040.0, applyDiscount( $vals['unit_price'], $vals['discount_raw'] ) );
    }

    /**
     * V.34.5 HIGH-1: Legacy unmigrated tier price (absolute value, not %).
     * Pre-V.32.6 schema stored absolute prices in price_silver; if migration
     * never ran, picker fails silently. V.34.5 derives implicit disc% from ratio.
     */
    public function test_legacy_unmigrated_tier_derives_implicit_discount(): void {
        $product = array(
            'catalog_price'        => 8800,
            'price_silver'         => 7040, // ABSOLUTE price (>100 → forbidden as %)
            'b2b_discount_percent' => 0,
            'dealer_price'         => 7040,
        );
        $info = invGetRankPriceInfo( $product, 'silver' );
        $this->assertSame( 8800.0, $info['base'] );
        // discPct=7040 rejected (>100) → fallback b2b_discount_percent=0 → effective=dealer_price=7040
        // → ratio derive: (1 - 7040/8800) × 100 = 20%
        $this->assertSame( 20.0, $info['disc'] );
        $this->assertSame( 7040.0, $info['effective'] );

        $vals = _invPickerVals( $product, 0, 'silver' );
        $this->assertSame( 8800.0, $vals['unit_price'] );
        $this->assertSame( '20%', $vals['discount_raw'] );
        $this->assertSame( 7040.0, applyDiscount( $vals['unit_price'], $vals['discount_raw'] ) );
    }

    public function test_no_discount_emits_empty_disc(): void {
        $product = array(
            'catalog_price'        => 1000,
            'price_silver'         => 0,
            'b2b_discount_percent' => 0,
        );
        $vals = _invPickerVals( $product, 0, 'silver' );
        $this->assertSame( 1000.0, $vals['unit_price'] );
        $this->assertSame( '', $vals['discount_raw'] );
        $this->assertSame( 1000.0, applyDiscount( $vals['unit_price'], $vals['discount_raw'] ) );
    }

    public function test_dealer_only_no_catalog_emits_dealer_price_no_disc(): void {
        // base=0 (corrupted catalog), dealer_price=7040 → emit dealer + no disc
        // (we can't safely apply disc% on top of an already-discounted dealer price)
        $product = array(
            'catalog_price' => 0,
            'price_silver'  => 0,
            'dealer_price'  => 7040,
        );
        $vals = _invPickerVals( $product, 0, 'silver' );
        $this->assertSame( 7040.0, $vals['unit_price'] );
        $this->assertSame( '', $vals['discount_raw'] );
    }

    public function test_both_zero_falls_back_to_fallback_arg(): void {
        $product = array( 'catalog_price' => 0, 'price_silver' => 0 );
        $vals = _invPickerVals( $product, 999.5, 'silver' );
        $this->assertSame( 999.5, $vals['unit_price'] );
        $this->assertSame( '', $vals['discount_raw'] );
    }

    public function test_full_100_pct_discount(): void {
        $product = array( 'catalog_price' => 1000, 'price_silver' => 100 );
        $info = invGetRankPriceInfo( $product, 'silver' );
        $this->assertSame( 100.0, $info['disc'] );
        $this->assertSame( 0.0, $info['effective'] );

        $vals = _invPickerVals( $product, 0, 'silver' );
        $this->assertSame( 1000.0, $vals['unit_price'] );
        $this->assertSame( '100%', $vals['discount_raw'] );
        $this->assertSame( 0.0, applyDiscount( $vals['unit_price'], $vals['discount_raw'] ) );
    }

    public function test_b2b_discount_percent_used_when_tier_unset(): void {
        // Standard rank with no tier-specific discount → fallback to b2b_discount_percent
        $product = array(
            'catalog_price'        => 1000,
            'b2b_discount_percent' => 10,
        );
        $vals = _invPickerVals( $product, 0, 'standard' );
        $this->assertSame( 1000.0, $vals['unit_price'] );
        $this->assertSame( '10%', $vals['discount_raw'] );
        $this->assertSame( 900.0, applyDiscount( $vals['unit_price'], $vals['discount_raw'] ) );
    }

    public function test_tier_value_above_100_treated_as_invalid_falls_back(): void {
        // price_silver=150 is NOT a valid % → falls back to b2b_discount_percent=5
        $product = array(
            'catalog_price'        => 1000,
            'price_silver'         => 150, // invalid as %, ignored
            'b2b_discount_percent' => 5,
        );
        $info = invGetRankPriceInfo( $product, 'silver' );
        $this->assertSame( 5.0, $info['disc'] );
    }

    /**
     * Critical regression scenario from V.34.4 commit message:
     * "Multi-Picker เลือก SET catalog ฿8,800 -20% ออก ฿5,632 (ควร ฿7,040)".
     * If anyone modifies the picker to send unit_price=effective+disc=20%,
     * recalc would produce 7,040×0.80=5,632 — this test catches it.
     */
    public function test_v344_double_discount_regression(): void {
        $product = array(
            'catalog_price'        => 8800,
            'price_silver'         => 20,
            'b2b_discount_percent' => 0,
        );
        $vals = _invPickerVals( $product, 0, 'silver' );
        $line_total = applyDiscount( $vals['unit_price'], $vals['discount_raw'] );
        $this->assertNotEquals(
            5632.0, $line_total,
            'Double-discount regression: picker is emitting effective price + tier %, recalc applies discount twice'
        );
        $this->assertSame( 7040.0, $line_total );
    }
}
