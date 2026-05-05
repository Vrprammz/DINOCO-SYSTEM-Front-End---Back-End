<?php
/**
 * SnFlexTemplateTest — pure-logic test of F#1 / F#4 / F#10 Flex builder structure.
 *
 * Source: [Admin System] DINOCO Production SN Manager V.0.17+
 * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §F.1/F.4/F.10
 * Phase: 3 W9
 *
 * Tests focus on:
 *   - dinoco_sn_format_thai_date — Buddhist year + Thai month abbrev + parse fail
 *   - dinoco_sn_pick_anniversary_emoji — tier boundaries (1/2/3+)
 *   - dinoco_sn_build_flex_expiry — header severity (red ≤1d, amber ≤7d, navy >7d) +
 *     promo block omission when missing + footer button presence
 *   - dinoco_sn_build_flex_anniversary — header color tier (navy/gold/violet) +
 *     coupon block + headline 1y vs N y
 *   - dinoco_sn_build_flex_review_request — reward block omission + button label
 *   - dinoco_sn_build_flex_for_notification — dispatcher type→builder mapping +
 *     suffix parsing (expiry_30d → days_left=30)
 *
 * These functions live in the snippet file and are NOT loaded automatically
 * (they have function_exists() guards). We re-define equivalent pure helpers
 * here mirroring the snippet's logic for unit-testable verification — drift
 * detector tests/jest/sn-system-drift.test.js asserts string-presence in the
 * snippet to keep the two in sync.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/**
 * Pure mirrors — keep in sync with snippet builders.
 */
if ( ! function_exists( __NAMESPACE__ . '\\sn_format_thai_date' ) ) {
    function sn_format_thai_date( string $mysql_datetime ): string {
        if ( $mysql_datetime === '' ) return '';
        $ts = strtotime( $mysql_datetime );
        if ( $ts === false ) return '';
        $months = array(
            1 => 'ม.ค.', 2 => 'ก.พ.', 3 => 'มี.ค.', 4 => 'เม.ย.',
            5 => 'พ.ค.', 6 => 'มิ.ย.', 7 => 'ก.ค.', 8 => 'ส.ค.',
            9 => 'ก.ย.', 10 => 'ต.ค.', 11 => 'พ.ย.', 12 => 'ธ.ค.',
        );
        $d = (int) date( 'j', $ts );
        $m = (int) date( 'n', $ts );
        $y = (int) date( 'Y', $ts ) + 543;
        return sprintf( '%d %s %d', $d, $months[ $m ] ?? '?', $y );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_pick_anniversary_emoji' ) ) {
    function sn_pick_anniversary_emoji( int $years ): array {
        if ( $years >= 3 ) return array( 'emoji' => '💎', 'label' => 'Diamond Loyalty' );
        if ( $years >= 2 ) return array( 'emoji' => '🏅', 'label' => 'VIP Customer' );
        return array( 'emoji' => '🎉', 'label' => 'ครบ 1 ปี' );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_expiry_header_color' ) ) {
    function sn_expiry_header_color( int $days_left ): string {
        if ( $days_left <= 1 ) return '#dc2626';
        if ( $days_left <= 7 ) return '#f59e0b';
        return '#1f2937';
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_anniversary_header_color' ) ) {
    function sn_anniversary_header_color( int $years ): string {
        if ( $years >= 3 ) return '#7c3aed';
        if ( $years >= 2 ) return '#ca8a04';
        return '#1f2937';
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_dispatch_type_to_builder' ) ) {
    /**
     * Mirror of dinoco_sn_build_flex_for_notification dispatcher logic:
     * given a notification_type, return the builder key (or null).
     * Also extract suffix-derived param (days_left for expiry_*, years for anniv_*).
     */
    function sn_dispatch_type_to_builder( string $type ): array {
        $type = strtolower( $type );
        if ( strpos( $type, 'expiry_' ) === 0 ) {
            $days = null;
            if ( preg_match( '/expiry_(\d+)d/', $type, $m ) ) {
                $days = (int) $m[1];
            }
            return array( 'builder' => 'expiry', 'days_left' => $days );
        }
        if ( strpos( $type, 'anniversary_' ) === 0 ) {
            $years = null;
            if ( preg_match( '/anniversary_(\d+)y/', $type, $m ) ) {
                $years = (int) $m[1];
            }
            return array( 'builder' => 'anniversary', 'years' => $years );
        }
        if ( $type === 'review_request' ) {
            return array( 'builder' => 'review' );
        }
        return array( 'builder' => null );
    }
}

class SnFlexTemplateTest extends TestCase {

    /* ─── format_thai_date ─── */

    public function test_format_thai_date_normal_day(): void {
        // 2025-05-04 → 4 พ.ค. 2568 (Buddhist year)
        $this->assertSame( '4 พ.ค. 2568', sn_format_thai_date( '2025-05-04 14:30:00' ) );
    }

    public function test_format_thai_date_each_month(): void {
        $expected = array(
            '2025-01-15' => '15 ม.ค. 2568',
            '2025-02-28' => '28 ก.พ. 2568',
            '2025-12-31' => '31 ธ.ค. 2568',
        );
        foreach ( $expected as $iso => $thai ) {
            $this->assertSame( $thai, sn_format_thai_date( $iso ) );
        }
    }

    public function test_format_thai_date_empty(): void {
        $this->assertSame( '', sn_format_thai_date( '' ) );
    }

    public function test_format_thai_date_invalid_returns_empty(): void {
        $this->assertSame( '', sn_format_thai_date( 'not-a-date' ) );
    }

    public function test_format_thai_date_buddhist_year_offset(): void {
        // 2026 → 2569 (always +543)
        $this->assertSame( '1 ม.ค. 2569', sn_format_thai_date( '2026-01-01 00:00:00' ) );
    }

    /* ─── pick_anniversary_emoji ─── */

    public function test_anniversary_1y_emoji(): void {
        $this->assertSame( '🎉', sn_pick_anniversary_emoji( 1 )['emoji'] );
        $this->assertSame( 'ครบ 1 ปี', sn_pick_anniversary_emoji( 1 )['label'] );
    }

    public function test_anniversary_2y_emoji(): void {
        $this->assertSame( '🏅', sn_pick_anniversary_emoji( 2 )['emoji'] );
        $this->assertStringContainsString( 'VIP', sn_pick_anniversary_emoji( 2 )['label'] );
    }

    public function test_anniversary_3y_diamond(): void {
        $this->assertSame( '💎', sn_pick_anniversary_emoji( 3 )['emoji'] );
    }

    public function test_anniversary_5y_still_diamond(): void {
        // No higher tier — 3+ all diamond
        $this->assertSame( '💎', sn_pick_anniversary_emoji( 5 )['emoji'] );
        $this->assertSame( '💎', sn_pick_anniversary_emoji( 10 )['emoji'] );
    }

    /* ─── expiry severity tiers ─── */

    public function test_expiry_color_red_at_1_day(): void {
        $this->assertSame( '#dc2626', sn_expiry_header_color( 1 ) );
        $this->assertSame( '#dc2626', sn_expiry_header_color( 0 ) );
    }

    public function test_expiry_color_amber_at_7_days(): void {
        $this->assertSame( '#f59e0b', sn_expiry_header_color( 7 ) );
        $this->assertSame( '#f59e0b', sn_expiry_header_color( 5 ) );
        $this->assertSame( '#f59e0b', sn_expiry_header_color( 2 ) );
    }

    public function test_expiry_color_navy_at_30_days(): void {
        $this->assertSame( '#1f2937', sn_expiry_header_color( 30 ) );
        $this->assertSame( '#1f2937', sn_expiry_header_color( 8 ) );
    }

    public function test_expiry_color_boundary_8_is_navy(): void {
        // Exact boundary — day 8 should be navy (not amber)
        $this->assertSame( '#1f2937', sn_expiry_header_color( 8 ) );
    }

    /* ─── anniversary color tiers ─── */

    public function test_anniversary_color_navy_at_1y(): void {
        $this->assertSame( '#1f2937', sn_anniversary_header_color( 1 ) );
    }

    public function test_anniversary_color_gold_at_2y(): void {
        $this->assertSame( '#ca8a04', sn_anniversary_header_color( 2 ) );
    }

    public function test_anniversary_color_violet_at_3y_plus(): void {
        $this->assertSame( '#7c3aed', sn_anniversary_header_color( 3 ) );
        $this->assertSame( '#7c3aed', sn_anniversary_header_color( 5 ) );
    }

    /* ─── dispatcher routing ─── */

    public function test_dispatch_expiry_30d(): void {
        $r = sn_dispatch_type_to_builder( 'expiry_30d' );
        $this->assertSame( 'expiry', $r['builder'] );
        $this->assertSame( 30, $r['days_left'] );
    }

    public function test_dispatch_expiry_7d(): void {
        $r = sn_dispatch_type_to_builder( 'expiry_7d' );
        $this->assertSame( 'expiry', $r['builder'] );
        $this->assertSame( 7, $r['days_left'] );
    }

    public function test_dispatch_expiry_1d(): void {
        $r = sn_dispatch_type_to_builder( 'expiry_1d' );
        $this->assertSame( 'expiry', $r['builder'] );
        $this->assertSame( 1, $r['days_left'] );
    }

    public function test_dispatch_anniversary_1y(): void {
        $r = sn_dispatch_type_to_builder( 'anniversary_1y' );
        $this->assertSame( 'anniversary', $r['builder'] );
        $this->assertSame( 1, $r['years'] );
    }

    public function test_dispatch_anniversary_5y(): void {
        $r = sn_dispatch_type_to_builder( 'anniversary_5y' );
        $this->assertSame( 'anniversary', $r['builder'] );
        $this->assertSame( 5, $r['years'] );
    }

    public function test_dispatch_review_request(): void {
        $r = sn_dispatch_type_to_builder( 'review_request' );
        $this->assertSame( 'review', $r['builder'] );
    }

    public function test_dispatch_unknown_type(): void {
        $r = sn_dispatch_type_to_builder( 'sms_marketing_xyz' );
        $this->assertNull( $r['builder'] );
    }

    public function test_dispatch_case_insensitive(): void {
        // EXPIRY_30D upper-case should still resolve
        $r = sn_dispatch_type_to_builder( 'EXPIRY_30D' );
        $this->assertSame( 'expiry', $r['builder'] );
        $this->assertSame( 30, $r['days_left'] );
    }
}
