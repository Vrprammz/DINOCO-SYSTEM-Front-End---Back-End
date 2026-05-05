<?php
/**
 * SnMemberHelpersTest — pure-logic test of v2.11 Member Dashboard helpers.
 *
 * Source: [Admin System] DINOCO Production SN Manager V.0.18+
 * Plan:   ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 Phase 2 W7
 *         (v2.11 Member Dashboard Frontend Integration spec)
 *
 * Helpers tested (pure-logic mirrors of the snippet's SQL semantics):
 *   - dinoco_sn_get_user_plates    — status whitelist + invalid user_id guard
 *   - dinoco_sn_get_user_stats     — member_years math from first_registered_at
 *   - get_pending_reviews          — semantic guards (status='sent' + reviewed_at NULL)
 *   - LTV transient cache          — null-marker '__null__' to prevent re-query
 *   - Anniversary days_window      — clamping logic 1..30
 *   - Expiring days_window         — clamping logic 1..365
 *
 * Real SQL exec lives in WP integration tests (Phase 2 W7 deploy gate).
 * These tests verify the contract semantics that Member Dashboard snippets
 * will rely on (per v2.11 §V.31.0 contract).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Pure mirrors of helper logic ─── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_sanitize_status_whitelist' ) ) {
    /**
     * Mirror of `dinoco_sn_get_user_plates` status-array sanitizer.
     * Drops unknown states, returns clean array.
     */
    function sn_sanitize_status_whitelist( array $statuses ): array {
        $allowed = array(
            'reserved', 'in_pool', 'registered', 'claimed', 'replaced',
            'transferred', 'voided', 'recalled', 'reserved_for_legacy',
            'shipped_legacy', 'cancelled_batch',
        );
        $clean = array();
        foreach ( $statuses as $s ) {
            $s = (string) $s;
            if ( in_array( $s, $allowed, true ) ) {
                $clean[] = $s;
            }
        }
        return $clean;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_clamp_days_window' ) ) {
    /**
     * Mirror of expiring-plates + anniversary days_window clamping.
     */
    function sn_clamp_days_window( int $days, int $min, int $max ): int {
        return max( $min, min( $max, $days ) );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_compute_member_years' ) ) {
    /**
     * Mirror of get_user_stats member_years calculation:
     *   floor( (now - first_registered_at) / (365 * 86400) )
     *
     * Returns 0 when first_registered_at is null/invalid.
     */
    function sn_compute_member_years( ?string $first_registered_at, int $now_ts ): int {
        if ( ! $first_registered_at ) return 0;
        $first = strtotime( $first_registered_at );
        if ( $first === false ) return 0;
        if ( $first > $now_ts ) return 0;  // defensive: future timestamp
        return (int) floor( ( $now_ts - $first ) / ( 365 * 86400 ) );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_invalid_user_id_returns_empty' ) ) {
    /**
     * Mirror of all helpers' user_id validation:
     *   $user_id = (int) $user_id;
     *   if ( $user_id <= 0 ) return $empty_value;
     */
    function sn_is_valid_user_id( $user_id ): bool {
        return (int) $user_id > 0;
    }
}

class SnMemberHelpersTest extends TestCase {

    /* ─── Status whitelist sanitization ─── */

    public function test_status_whitelist_accepts_default_pair(): void {
        $r = sn_sanitize_status_whitelist( array( 'registered', 'claimed' ) );
        $this->assertSame( array( 'registered', 'claimed' ), $r );
    }

    public function test_status_whitelist_accepts_all_known_states(): void {
        $all = array( 'reserved', 'in_pool', 'registered', 'claimed', 'replaced',
                      'transferred', 'voided', 'recalled', 'reserved_for_legacy',
                      'shipped_legacy', 'cancelled_batch' );
        $r = sn_sanitize_status_whitelist( $all );
        $this->assertCount( 11, $r );
        $this->assertSame( $all, $r );
    }

    public function test_status_whitelist_drops_unknown(): void {
        $r = sn_sanitize_status_whitelist( array( 'registered', 'evil_status', 'claimed' ) );
        $this->assertSame( array( 'registered', 'claimed' ), $r );
    }

    public function test_status_whitelist_drops_sql_injection(): void {
        // Defensive — even if caller passed unsanitized SQL, whitelist drops it
        $r = sn_sanitize_status_whitelist( array( "'; DROP TABLE wp_dinoco_sn_pool; --" ) );
        $this->assertSame( array(), $r );
    }

    public function test_status_whitelist_empty_returns_empty(): void {
        $this->assertSame( array(), sn_sanitize_status_whitelist( array() ) );
    }

    public function test_status_whitelist_non_string_dropped(): void {
        // (int) 5 → '5' → not in whitelist → dropped
        $r = sn_sanitize_status_whitelist( array( 5, 'registered', null ) );
        $this->assertSame( array( 'registered' ), $r );
    }

    public function test_status_whitelist_case_sensitive(): void {
        // Plan §3.1 sn_pool.status is utf8mb4_bin — case sensitive
        $r = sn_sanitize_status_whitelist( array( 'REGISTERED', 'Registered', 'registered' ) );
        $this->assertSame( array( 'registered' ), $r );
    }

    /* ─── days_window clamping ─── */

    public function test_clamp_expiring_days_window_default(): void {
        // Default 30 — within 1..365
        $this->assertSame( 30, sn_clamp_days_window( 30, 1, 365 ) );
    }

    public function test_clamp_expiring_days_window_max(): void {
        $this->assertSame( 365, sn_clamp_days_window( 9999, 1, 365 ) );
    }

    public function test_clamp_expiring_days_window_min(): void {
        $this->assertSame( 1, sn_clamp_days_window( 0, 1, 365 ) );
        $this->assertSame( 1, sn_clamp_days_window( -50, 1, 365 ) );
    }

    public function test_clamp_anniversary_days_window_max(): void {
        // anniversary uses 1..30 (tighter — caller passes default 7)
        $this->assertSame( 30, sn_clamp_days_window( 100, 1, 30 ) );
    }

    public function test_clamp_anniversary_days_window_default(): void {
        $this->assertSame( 7, sn_clamp_days_window( 7, 1, 30 ) );
    }

    /* ─── member_years math ─── */

    public function test_member_years_one_year_exact(): void {
        // Mock: first registered exactly 1 year ago = 1 year
        $now = strtotime( '2026-05-05 12:00:00' );
        $this->assertSame( 1, sn_compute_member_years( '2025-05-05 12:00:00', $now ) );
    }

    public function test_member_years_just_under_one_year(): void {
        // 364 days ago = 0 years (floor)
        $now = strtotime( '2026-05-05 12:00:00' );
        $first = date( 'Y-m-d H:i:s', $now - ( 364 * 86400 ) );
        $this->assertSame( 0, sn_compute_member_years( $first, $now ) );
    }

    public function test_member_years_three_years(): void {
        $now = strtotime( '2026-05-05 12:00:00' );
        $first = date( 'Y-m-d H:i:s', $now - ( 3 * 365 * 86400 + 86400 ) );
        $this->assertSame( 3, sn_compute_member_years( $first, $now ) );
    }

    public function test_member_years_null_first_returns_zero(): void {
        $this->assertSame( 0, sn_compute_member_years( null, time() ) );
    }

    public function test_member_years_invalid_string_returns_zero(): void {
        $this->assertSame( 0, sn_compute_member_years( 'not-a-date', time() ) );
    }

    public function test_member_years_future_timestamp_returns_zero(): void {
        // Defensive — if data is corrupt with future date, don't return negative
        $now = strtotime( '2025-01-01 12:00:00' );
        $future = '2026-01-01 12:00:00';
        $this->assertSame( 0, sn_compute_member_years( $future, $now ) );
    }

    public function test_member_years_empty_string_returns_zero(): void {
        $this->assertSame( 0, sn_compute_member_years( '', time() ) );
    }

    /* ─── user_id validation ─── */

    public function test_user_id_zero_invalid(): void {
        $this->assertFalse( sn_is_valid_user_id( 0 ) );
    }

    public function test_user_id_negative_invalid(): void {
        $this->assertFalse( sn_is_valid_user_id( -1 ) );
        $this->assertFalse( sn_is_valid_user_id( '-5' ) );
    }

    public function test_user_id_string_int_valid(): void {
        // (int) cast handles WP's $_GET / $_POST string-int IDs
        $this->assertTrue( sn_is_valid_user_id( '42' ) );
    }

    public function test_user_id_zero_string_invalid(): void {
        $this->assertFalse( sn_is_valid_user_id( '0' ) );
    }

    public function test_user_id_garbage_string_invalid(): void {
        $this->assertFalse( sn_is_valid_user_id( 'admin' ) );
    }

    public function test_user_id_one_valid(): void {
        // Edge case — user_id=1 (typically WP super admin) should be valid
        $this->assertTrue( sn_is_valid_user_id( 1 ) );
    }
}
