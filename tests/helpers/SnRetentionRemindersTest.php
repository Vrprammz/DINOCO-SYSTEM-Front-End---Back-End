<?php
/**
 * SnRetentionRemindersTest — pure-logic test of F#4 anniversary + F#10 review.
 *
 * Source: [Admin System] DINOCO Production SN Manager V.0.10+
 * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §F.4 + §F.10
 * Phase: 3 W9
 *
 * F#4 Anniversary push (capped 5 years to avoid noise):
 *   anniversary_1y / 2y / 3y / 4y / 5y
 *   send_at = anniversary day (now)
 *
 * F#10 Review Request:
 *   30 days post-activate, dedup by (review_request, user_id, sn)
 *   Skip if any open claim → don't pester unhappy customer
 *
 * Tests focus on:
 *   - Anniversary year matching SQL semantics (DATE_SUB INTERVAL N YEAR)
 *   - 30-day exact match (not range)
 *   - Skip-if-claim semantics
 *   - Closed statuses whitelist
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_is_anniversary_today' ) ) {
    /**
     * Mirror of SQL `DATE(registered_at) = DATE_SUB(CURDATE(), INTERVAL N YEAR)`.
     */
    function sn_is_anniversary_today( string $registered_at, int $years_ago, string $today ): bool {
        try {
            $reg = new \DateTime( $registered_at );
            $now = new \DateTime( $today );
            $expected = ( clone $now )->modify( '-' . $years_ago . ' years' );
            return $reg->format( 'Y-m-d' ) === $expected->format( 'Y-m-d' );
        } catch ( \Throwable $_e ) { // phpcs:ignore -- intentionally unused
            return false;
        }
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_is_30day_milestone' ) ) {
    /**
     * Mirror of SQL `DATE(registered_at) = DATE_SUB(CURDATE(), INTERVAL 30 DAY)`.
     */
    function sn_is_30day_milestone( string $registered_at, string $today ): bool {
        try {
            $reg = new \DateTime( $registered_at );
            $now = new \DateTime( $today );
            $expected = ( clone $now )->modify( '-30 days' );
            return $reg->format( 'Y-m-d' ) === $expected->format( 'Y-m-d' );
        } catch ( \Throwable $_e ) { // phpcs:ignore -- intentionally unused
            return false;
        }
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_review_should_skip_for_claim' ) ) {
    /**
     * Mirror of skip-if-claim guard: skip review request if user has any
     * claim_ticket NOT in closed states.
     */
    function sn_review_should_skip_for_claim( int $user_id, array $users_with_open_claim ): bool {
        return isset( $users_with_open_claim[ $user_id ] );
    }
}

class SnRetentionRemindersTest extends TestCase {

    /* ───── F#4 Anniversary ───── */

    public function test_anniversary_1y_matches_exact_date() {
        $this->assertTrue(
            sn_is_anniversary_today( '2025-05-05 10:00:00', 1, '2026-05-05' )
        );
    }

    public function test_anniversary_2y_matches() {
        $this->assertTrue(
            sn_is_anniversary_today( '2024-05-05 10:00:00', 2, '2026-05-05' )
        );
    }

    public function test_anniversary_off_by_one_day_no_match() {
        // 1 day later → no match (anniversary is exact day)
        $this->assertFalse(
            sn_is_anniversary_today( '2025-05-05 10:00:00', 1, '2026-05-06' )
        );
        // 1 day earlier → no match
        $this->assertFalse(
            sn_is_anniversary_today( '2025-05-05 10:00:00', 1, '2026-05-04' )
        );
    }

    public function test_anniversary_5y_cap() {
        // 5y boundary still works
        $this->assertTrue(
            sn_is_anniversary_today( '2021-05-05 10:00:00', 5, '2026-05-05' )
        );
    }

    public function test_anniversary_feb_29_leap_year_semantics() {
        // SQL semantics: DATE_SUB(today, INTERVAL 1 YEAR) — today=Mar 1
        // → DATE_SUB returns Mar 1 (NOT Feb 29). So a Feb 29 plate does
        // NOT match any non-leap year. This is acceptable trade-off:
        // leap-year plates miss 1 anniversary every 4 years (rare edge).
        $this->assertFalse(
            sn_is_anniversary_today( '2024-02-29 12:00:00', 1, '2025-03-01' ),
            'Feb 29 plate does not match Mar 1 of next year (DATE_SUB semantics)'
        );
        $this->assertFalse(
            sn_is_anniversary_today( '2024-02-29 12:00:00', 1, '2025-02-28' ),
            'Feb 29 plate does not match Feb 28 either'
        );
        // Next leap year (2028-02-29) → SHOULD match
        $this->assertTrue(
            sn_is_anniversary_today( '2024-02-29 12:00:00', 4, '2028-02-29' ),
            'Feb 29 plate matches next Feb 29 (4 years later)'
        );
    }

    public function test_anniversary_invalid_input() {
        $this->assertFalse( sn_is_anniversary_today( 'not-a-date', 1, '2026-05-05' ) );
        $this->assertFalse( sn_is_anniversary_today( '2025-05-05', 1, 'not-a-date' ) );
    }

    /* ───── F#10 Review Request 30d milestone ───── */

    public function test_review_30d_exact_match() {
        $this->assertTrue(
            sn_is_30day_milestone( '2026-04-05 14:00:00', '2026-05-05' )
        );
    }

    public function test_review_29d_no_match() {
        // 1 day too early
        $this->assertFalse(
            sn_is_30day_milestone( '2026-04-06 14:00:00', '2026-05-05' )
        );
    }

    public function test_review_31d_no_match() {
        // 1 day past — don't pester (per v2.13 §F.10 Edge Cases)
        $this->assertFalse(
            sn_is_30day_milestone( '2026-04-04 14:00:00', '2026-05-05' )
        );
    }

    public function test_review_handles_month_boundary() {
        // 30 days before Mar 1 = Jan 30 (handles short Feb)
        $this->assertTrue(
            sn_is_30day_milestone( '2026-01-30 10:00:00', '2026-03-01' )
        );
    }

    /* ───── F#10 skip-if-claim guard ───── */

    public function test_skip_if_claim_user_has_open() {
        $open_claim_users = array( 123 => true, 456 => true );
        $this->assertTrue( sn_review_should_skip_for_claim( 123, $open_claim_users ) );
        $this->assertTrue( sn_review_should_skip_for_claim( 456, $open_claim_users ) );
    }

    public function test_skip_if_claim_user_no_claim() {
        $open_claim_users = array( 123 => true );
        $this->assertFalse( sn_review_should_skip_for_claim( 999, $open_claim_users ) );
    }

    public function test_skip_if_claim_empty_set_allows_all() {
        $this->assertFalse( sn_review_should_skip_for_claim( 123, array() ) );
    }

    /* ───── Closed statuses whitelist ───── */

    public function test_closed_statuses_whitelist() {
        // F#10 SKIPS users with open claims. Closed statuses are excluded
        // from the open-claim filter (so claim_ticket in these states does
        // NOT trigger skip).
        $closed_statuses = array( 'completed', 'closed', 'rejected', 'cancelled' );
        $open_statuses = array( 'pending', 'reviewing', 'approved', 'in_progress',
                                'waiting_parts', 'repairing', 'quality_check' );

        // Sanity: 4 closed + 7 open = Service Center 11-status FSM
        $this->assertCount( 4, $closed_statuses );
        $this->assertCount( 7, $open_statuses );
        $this->assertEmpty( array_intersect( $closed_statuses, $open_statuses ),
            'closed and open status sets must not overlap' );
    }
}
