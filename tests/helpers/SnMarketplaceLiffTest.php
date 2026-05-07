<?php
/**
 * SnMarketplaceLiffTest — Phase 5 W15.2 Marketplace customer LIFF helpers.
 *
 * Source: [System] DINOCO Warranty Extension Marketplace V.0.1
 * Plan: docs/sn-system/22-phase5-w15-w18-prep.md §W15.2
 *
 * Pure-logic helpers under test (mirrored — no DB/WP deps):
 *   - dinoco_sn_mpx_check_ownership($registered_uid, $current_uid)
 *   - dinoco_sn_mpx_validate_status($status)
 *   - dinoco_sn_mpx_check_grace_period($warranty_until, $today, $grace_days)
 *   - dinoco_sn_mpx_compute_total($base_price, $discount, $vat_rate)
 *   - dinoco_sn_mpx_image_compress_target($file_size_bytes)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Pure-logic mirrors (no WP / no DB) ────────────────────────────────── */

if ( ! function_exists( __NAMESPACE__ . '\\mpx_check_ownership' ) ) {

    function mpx_check_ownership( $registered_user_id, $current_uid ): array {
        $registered_user_id = (int) $registered_user_id;
        $current_uid = (int) $current_uid;
        if ( $current_uid <= 0 ) {
            return array( 'ok' => false, 'reason' => 'not_logged_in' );
        }
        if ( $registered_user_id <= 0 ) {
            return array( 'ok' => false, 'reason' => 'not_registered' );
        }
        if ( $registered_user_id !== $current_uid ) {
            return array( 'ok' => false, 'reason' => 'ownership_mismatch' );
        }
        return array( 'ok' => true, 'reason' => '' );
    }

    function mpx_validate_status( $status ): array {
        $status = is_string( $status ) ? strtolower( trim( $status ) ) : '';
        if ( $status === 'registered' ) {
            return array( 'ok' => true, 'reason' => '', 'message' => '' );
        }
        $reason_map = array(
            'voided'              => array( 'voided',         'เพลทนี้อยู่ในสถานะพิเศษ — ไม่สามารถต่อประกันได้ กรุณาติดต่อทีมงาน' ),
            'recalled'            => array( 'recalled',       'เพลทนี้อยู่ในสถานะพิเศษ — ไม่สามารถต่อประกันได้ กรุณาติดต่อทีมงาน' ),
            'stolen'              => array( 'stolen',         'เพลทนี้อยู่ในสถานะพิเศษ — ไม่สามารถต่อประกันได้ กรุณาติดต่อทีมงาน' ),
            'claimed'             => array( 'claimed',        'เพลทกำลังเคลม — รอเคลมเสร็จก่อน' ),
            'transferred'         => array( 'transferred',    'เพลทเปลี่ยนเจ้าของ — ต่อประกันไม่ได้' ),
            'in_pool'             => array( 'not_registered', 'เพลทนี้ยังไม่ได้ลงทะเบียน — กรุณาลงทะเบียนก่อน' ),
            'reserved'            => array( 'not_shipped',    'เพลทนี้ยังไม่พร้อมใช้งาน' ),
            'replaced'            => array( 'replaced',       'เพลทนี้ถูกเปลี่ยนแล้ว — ใช้เพลทใหม่แทน' ),
            'cancelled_batch'     => array( 'cancelled',      'เพลทนี้ถูกยกเลิก' ),
            'reserved_for_legacy' => array( 'legacy',         'เพลทนี้สงวนสำหรับเคสเก่า' ),
            'shipped_legacy'      => array( 'legacy',         'เพลทนี้สงวนสำหรับเคสเก่า' ),
        );
        if ( isset( $reason_map[ $status ] ) ) {
            return array(
                'ok'      => false,
                'reason'  => $reason_map[ $status ][0],
                'message' => $reason_map[ $status ][1],
            );
        }
        return array(
            'ok'      => false,
            'reason'  => 'unknown_status',
            'message' => 'สถานะเพลทไม่ถูกต้อง — กรุณาติดต่อทีมงาน',
        );
    }

    function mpx_check_grace( $warranty_until, $today = null, $grace_days = 30 ): array {
        if ( $today === null ) {
            $today = date( 'Y-m-d' );
        }
        $grace_days = max( 0, (int) $grace_days );
        if ( empty( $warranty_until ) ) {
            return array( 'ok' => false, 'reason' => 'no_warranty_record', 'days_past_expiry' => 0 );
        }
        $w_ts = strtotime( $warranty_until );
        $t_ts = strtotime( $today );
        if ( $w_ts === false || $t_ts === false ) {
            return array( 'ok' => false, 'reason' => 'date_parse_error', 'days_past_expiry' => 0 );
        }
        $days_past = (int) floor( ( $t_ts - $w_ts ) / 86400 );
        if ( $days_past <= 0 ) {
            return array( 'ok' => true, 'reason' => '', 'days_past_expiry' => 0 );
        }
        if ( $days_past <= $grace_days ) {
            return array( 'ok' => true, 'reason' => 'within_grace', 'days_past_expiry' => $days_past );
        }
        return array( 'ok' => false, 'reason' => 'grace_exceeded', 'days_past_expiry' => $days_past );
    }

    function mpx_compute_total( $base_price, $discount = 0.0, $vat_rate = 0.07 ): array {
        $base = max( 0.0, (float) $base_price );
        $disc = max( 0.0, min( $base, (float) $discount ) );
        $vat_rate = max( 0.0, (float) $vat_rate );
        $subtotal_after_disc = $base - $disc;
        $vat = round( $subtotal_after_disc * $vat_rate, 2 );
        $total = round( $subtotal_after_disc + $vat, 2 );
        return array(
            'subtotal' => round( $base, 2 ),
            'discount' => round( $disc, 2 ),
            'vat'      => $vat,
            'total'    => $total,
        );
    }

    function mpx_compress_target( $file_size_bytes ): array {
        $size = max( 0, (int) $file_size_bytes );
        $threshold = 2 * 1024 * 1024;
        if ( $size <= $threshold ) {
            return array(
                'quality'        => 1.0,
                'max_dimension'  => 0,
                'should_compress'=> false,
            );
        }
        return array(
            'quality'        => 0.85,
            'max_dimension'  => 1600,
            'should_compress'=> true,
        );
    }
}

class SnMarketplaceLiffTest extends TestCase {

    /* ─── Ownership check (5 tests) ─────────────────────────── */

    public function test_ownership_match_ok(): void {
        $r = mpx_check_ownership( 42, 42 );
        $this->assertTrue( $r['ok'] );
        $this->assertSame( '', $r['reason'] );
    }

    public function test_ownership_not_logged_in(): void {
        $r = mpx_check_ownership( 42, 0 );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'not_logged_in', $r['reason'] );
    }

    public function test_ownership_not_registered(): void {
        $r = mpx_check_ownership( 0, 42 );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'not_registered', $r['reason'] );
    }

    public function test_ownership_mismatch(): void {
        $r = mpx_check_ownership( 42, 99 );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'ownership_mismatch', $r['reason'] );
    }

    public function test_ownership_negative_uid_treated_as_invalid(): void {
        $r = mpx_check_ownership( -1, 42 );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'not_registered', $r['reason'] );
    }

    /* ─── Status validation (8 tests) ───────────────────────── */

    public function test_status_registered_allowed(): void {
        $r = mpx_validate_status( 'registered' );
        $this->assertTrue( $r['ok'] );
    }

    public function test_status_voided_blocked(): void {
        $r = mpx_validate_status( 'voided' );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'voided', $r['reason'] );
        $this->assertStringContainsString( 'ติดต่อทีมงาน', $r['message'] );
    }

    public function test_status_recalled_blocked(): void {
        $r = mpx_validate_status( 'recalled' );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'recalled', $r['reason'] );
    }

    public function test_status_stolen_blocked(): void {
        $r = mpx_validate_status( 'stolen' );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'stolen', $r['reason'] );
    }

    public function test_status_claimed_returns_specific_message(): void {
        $r = mpx_validate_status( 'claimed' );
        $this->assertFalse( $r['ok'] );
        $this->assertStringContainsString( 'รอเคลมเสร็จก่อน', $r['message'] );
    }

    public function test_status_transferred_returns_specific_message(): void {
        $r = mpx_validate_status( 'transferred' );
        $this->assertFalse( $r['ok'] );
        $this->assertStringContainsString( 'เปลี่ยนเจ้าของ', $r['message'] );
    }

    public function test_status_unknown_blocked_with_generic_msg(): void {
        $r = mpx_validate_status( 'foobar' );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'unknown_status', $r['reason'] );
    }

    public function test_status_uppercase_normalized(): void {
        $r = mpx_validate_status( 'REGISTERED' );
        $this->assertTrue( $r['ok'] );
    }

    /* ─── Grace period (6 tests) ────────────────────────────── */

    public function test_grace_warranty_not_yet_expired_eligible(): void {
        $r = mpx_check_grace( '2027-01-01', '2026-05-07', 30 );
        $this->assertTrue( $r['ok'] );
        $this->assertSame( 0, $r['days_past_expiry'] );
    }

    public function test_grace_within_grace_period_eligible(): void {
        // Expired 15 days ago, grace = 30
        $r = mpx_check_grace( '2026-04-22', '2026-05-07', 30 );
        $this->assertTrue( $r['ok'] );
        $this->assertSame( 'within_grace', $r['reason'] );
        $this->assertSame( 15, $r['days_past_expiry'] );
    }

    public function test_grace_exactly_at_grace_boundary_eligible(): void {
        // Expired exactly 30 days ago, grace = 30 → still eligible
        $r = mpx_check_grace( '2026-04-07', '2026-05-07', 30 );
        $this->assertTrue( $r['ok'] );
        $this->assertSame( 30, $r['days_past_expiry'] );
    }

    public function test_grace_exceeded_blocked(): void {
        // Expired 31 days ago, grace = 30 → blocked
        $r = mpx_check_grace( '2026-04-06', '2026-05-07', 30 );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'grace_exceeded', $r['reason'] );
        $this->assertSame( 31, $r['days_past_expiry'] );
    }

    public function test_grace_empty_warranty_blocked(): void {
        $r = mpx_check_grace( '', '2026-05-07', 30 );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'no_warranty_record', $r['reason'] );
    }

    public function test_grace_invalid_date_format_blocked(): void {
        $r = mpx_check_grace( 'invalid-date-string', '2026-05-07', 30 );
        $this->assertFalse( $r['ok'] );
        $this->assertSame( 'date_parse_error', $r['reason'] );
    }

    /* ─── Total computation (5 tests) ───────────────────────── */

    public function test_total_basic_with_vat(): void {
        $r = mpx_compute_total( 1000.00, 0, 0.07 );
        $this->assertSame( 1000.00, $r['subtotal'] );
        $this->assertSame( 0.00, $r['discount'] );
        $this->assertSame( 70.00, $r['vat'] );
        $this->assertSame( 1070.00, $r['total'] );
    }

    public function test_total_with_discount(): void {
        $r = mpx_compute_total( 1000.00, 100.00, 0.07 );
        $this->assertSame( 100.00, $r['discount'] );
        // (1000-100)*0.07 = 63
        $this->assertSame( 63.00, $r['vat'] );
        $this->assertSame( 963.00, $r['total'] );
    }

    public function test_total_discount_capped_at_subtotal(): void {
        // Discount 5000 on 1000 base → capped to 1000
        $r = mpx_compute_total( 1000.00, 5000.00, 0.07 );
        $this->assertSame( 1000.00, $r['discount'] );
        $this->assertSame( 0.00, $r['vat'] );
        $this->assertSame( 0.00, $r['total'] );
    }

    public function test_total_negative_inputs_clamped(): void {
        $r = mpx_compute_total( -500, -100, 0.07 );
        $this->assertSame( 0.00, $r['subtotal'] );
        $this->assertSame( 0.00, $r['total'] );
    }

    public function test_total_zero_vat(): void {
        $r = mpx_compute_total( 1500.00, 0, 0 );
        $this->assertSame( 0.00, $r['vat'] );
        $this->assertSame( 1500.00, $r['total'] );
    }

    /* ─── Image compression target (5 tests) ────────────────── */

    public function test_compress_under_2mb_no_compression(): void {
        $r = mpx_compress_target( 1024 * 1024 ); // 1MB
        $this->assertFalse( $r['should_compress'] );
        $this->assertSame( 1.0, $r['quality'] );
        $this->assertSame( 0, $r['max_dimension'] );
    }

    public function test_compress_exactly_2mb_no_compression(): void {
        $r = mpx_compress_target( 2 * 1024 * 1024 ); // exactly 2MB
        $this->assertFalse( $r['should_compress'] );
    }

    public function test_compress_over_2mb_target_quality_85(): void {
        $r = mpx_compress_target( 5 * 1024 * 1024 ); // 5MB
        $this->assertTrue( $r['should_compress'] );
        $this->assertSame( 0.85, $r['quality'] );
        $this->assertSame( 1600, $r['max_dimension'] );
    }

    public function test_compress_over_2mb_targets_under_2mb_after_compression(): void {
        // Property: result aim is < 2MB. Quality 0.85 + maxDim 1600 should
        // achieve this for typical phone slip photos (~3-5MB).
        $r = mpx_compress_target( 4 * 1024 * 1024 );
        $this->assertTrue( $r['should_compress'] );
        // Sanity bounds: quality between 0.7-0.95 inclusive, dim 1024-2048
        $this->assertGreaterThanOrEqual( 0.7, $r['quality'] );
        $this->assertLessThanOrEqual( 0.95, $r['quality'] );
        $this->assertGreaterThanOrEqual( 1024, $r['max_dimension'] );
        $this->assertLessThanOrEqual( 2048, $r['max_dimension'] );
    }

    public function test_compress_negative_size_treated_as_zero(): void {
        $r = mpx_compress_target( -100 );
        $this->assertFalse( $r['should_compress'] );
    }
}
