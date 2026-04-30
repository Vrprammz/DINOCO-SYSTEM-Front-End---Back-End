<?php
/**
 * OrderModeLabelTest — pure-logic test of `b2f_order_mode_label()`.
 *
 * Source: [B2F] Snippet 1: Core Utilities & Flex Builders V.7.0+ §100.5.
 * Thin wrapper over `b2f_t()` — returns localized display string for
 * each PO item `order_mode` (V.7.0 Order Intent System).
 *
 * Modes (V.7.0 official):
 *   - 'full_set'    → "ชุดเต็ม" / "Full Set" / "整套"
 *   - 'sub_unit'    → "แยกชุด" / "Sub-unit" / "分组"
 *   - 'single_leaf' → "ชิ้นเดี่ยว" / "Single" / "单件"
 *
 * Legacy display-only modes (inferred from pre-V.7.0 PO):
 *   - 'raw_parts'         → "ชิ้นส่วนดิบ" / "Raw Parts" / "原料"
 *   - 'partial_replenish' → "เติมบางส่วน" / "Partial" / "部分补货"
 *
 * Unknown mode → "—" (em-dash) per defensive default.
 *
 * Coverage rationale: this label feeds the V.7.0 Mode Badge UI in 5
 * places (Maker LIFF Snippet 4, PO Ticket Snippet 9, PO Image Snippet 10,
 * Admin LIFF Snippet 8 SET Detail, Admin Dashboard Orders tab Snippet 5).
 * Regression here = wrong language shown to factory + admin (silent UX
 * bug, no exception thrown). Critical to lock down per-currency switching.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// ─── Inline copy: b2f_t() (CurrencyTest already covers it but we need a
//     clean copy here so OrderModeLabelTest doesn't depend on test ordering) ───
if ( ! function_exists( __NAMESPACE__ . '\\b2f_t' ) ) {
    function b2f_t( $th, $en, $zh, $currency = 'THB' ) {
        if ( $currency === 'CNY' ) return ( $zh !== '' && $zh !== null ) ? $zh : $en;
        if ( $currency !== 'THB' ) return $en;
        return $th;
    }
}

// ─── Inline copy of b2f_order_mode_label (pure logic) ───
if ( ! function_exists( __NAMESPACE__ . '\\b2f_order_mode_label' ) ) {
    function b2f_order_mode_label( $mode, $currency = 'THB' ) {
        switch ( (string) $mode ) {
            case 'full_set':
                return b2f_t( 'ชุดเต็ม', 'Full Set', '整套', $currency );
            case 'sub_unit':
                return b2f_t( 'แยกชุด', 'Sub-unit', '分组', $currency );
            case 'single_leaf':
                return b2f_t( 'ชิ้นเดี่ยว', 'Single', '单件', $currency );
            // Legacy display-only labels (inferred from pre-V.7.0 PO)
            case 'raw_parts':
                return b2f_t( 'ชิ้นส่วนดิบ', 'Raw Parts', '原料', $currency );
            case 'partial_replenish':
                return b2f_t( 'เติมบางส่วน', 'Partial', '部分补货', $currency );
            default:
                return '—';
        }
    }
}

class OrderModeLabelTest extends TestCase {

    // ─── full_set across 3 currencies + edge ────────────────────────
    public function test_full_set_thb(): void {
        $this->assertSame( 'ชุดเต็ม', b2f_order_mode_label( 'full_set', 'THB' ) );
    }

    public function test_full_set_usd(): void {
        $this->assertSame( 'Full Set', b2f_order_mode_label( 'full_set', 'USD' ) );
    }

    public function test_full_set_cny(): void {
        $this->assertSame( '整套', b2f_order_mode_label( 'full_set', 'CNY' ) );
    }

    public function test_full_set_default_currency_is_thb(): void {
        $this->assertSame( 'ชุดเต็ม', b2f_order_mode_label( 'full_set' ) );
    }

    // ─── sub_unit ──────────────────────────────────────────────────
    public function test_sub_unit_thb(): void {
        $this->assertSame( 'แยกชุด', b2f_order_mode_label( 'sub_unit', 'THB' ) );
    }

    public function test_sub_unit_usd(): void {
        $this->assertSame( 'Sub-unit', b2f_order_mode_label( 'sub_unit', 'USD' ) );
    }

    public function test_sub_unit_cny(): void {
        $this->assertSame( '分组', b2f_order_mode_label( 'sub_unit', 'CNY' ) );
    }

    // ─── single_leaf ───────────────────────────────────────────────
    public function test_single_leaf_thb(): void {
        $this->assertSame( 'ชิ้นเดี่ยว', b2f_order_mode_label( 'single_leaf', 'THB' ) );
    }

    public function test_single_leaf_usd(): void {
        $this->assertSame( 'Single', b2f_order_mode_label( 'single_leaf', 'USD' ) );
    }

    public function test_single_leaf_cny(): void {
        $this->assertSame( '单件', b2f_order_mode_label( 'single_leaf', 'CNY' ) );
    }

    // ─── Legacy modes (raw_parts, partial_replenish) ───────────────
    public function test_raw_parts_thb(): void {
        $this->assertSame( 'ชิ้นส่วนดิบ', b2f_order_mode_label( 'raw_parts', 'THB' ) );
    }

    public function test_raw_parts_cny(): void {
        $this->assertSame( '原料', b2f_order_mode_label( 'raw_parts', 'CNY' ) );
    }

    public function test_partial_replenish_thb(): void {
        $this->assertSame( 'เติมบางส่วน', b2f_order_mode_label( 'partial_replenish', 'THB' ) );
    }

    public function test_partial_replenish_usd(): void {
        $this->assertSame( 'Partial', b2f_order_mode_label( 'partial_replenish', 'USD' ) );
    }

    public function test_partial_replenish_cny(): void {
        $this->assertSame( '部分补货', b2f_order_mode_label( 'partial_replenish', 'CNY' ) );
    }

    // ─── Defensive: unknown / empty / null mode ───────────────────
    public function test_unknown_mode_returns_em_dash(): void {
        $this->assertSame( '—', b2f_order_mode_label( 'gibberish', 'THB' ) );
    }

    public function test_empty_mode_returns_em_dash(): void {
        $this->assertSame( '—', b2f_order_mode_label( '', 'THB' ) );
    }

    public function test_null_mode_returns_em_dash(): void {
        // (string) null === '' which falls through to default
        $this->assertSame( '—', b2f_order_mode_label( null, 'THB' ) );
    }

    public function test_unknown_mode_em_dash_regardless_of_currency(): void {
        // The em-dash default does NOT pass through b2f_t — it's a
        // language-neutral character. Confirm same output for all 3.
        $this->assertSame( '—', b2f_order_mode_label( 'wrong', 'THB' ) );
        $this->assertSame( '—', b2f_order_mode_label( 'wrong', 'USD' ) );
        $this->assertSame( '—', b2f_order_mode_label( 'wrong', 'CNY' ) );
    }

    // ─── Defensive: numeric / boolean mode (cast via (string)) ────
    public function test_numeric_mode_cast_to_string_unknown(): void {
        // (string) 123 === '123' → no case match → em-dash
        $this->assertSame( '—', b2f_order_mode_label( 123, 'THB' ) );
    }

    public function test_boolean_true_becomes_one_string(): void {
        // (string) true === '1' → no case match → em-dash
        $this->assertSame( '—', b2f_order_mode_label( true, 'THB' ) );
    }

    // ─── Defensive: unknown currency falls back to English (b2f_t behavior) ─
    public function test_unknown_currency_falls_back_to_english(): void {
        // EUR is not THB/CNY → b2f_t returns $en (Full Set)
        $this->assertSame( 'Full Set', b2f_order_mode_label( 'full_set', 'EUR' ) );
    }
}
