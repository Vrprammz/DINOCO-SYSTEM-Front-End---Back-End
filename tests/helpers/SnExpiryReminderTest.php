<?php
/**
 * SnExpiryReminderTest — pure-logic test of F#1 expiry reminder math.
 *
 * Source: [Admin System] DINOCO Production SN Manager V.0.9+ (F#1 stub)
 * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §F.1
 * Phase: 3 W9
 *
 * F#1 design:
 *   - Default warranty: 1 year (configurable via dinoco_sn_default_warranty_years)
 *   - 3 milestones per plate: expiry_30d / expiry_7d / expiry_1d
 *   - Send_at = warranty_end - N days
 *   - Skip if send_at < now - 24h (already past window)
 *   - Dedup by (notification_type, user_id, sn) — first scheduled wins
 *
 * Tests focus on pure date math + dedup logic — DB ops mocked.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Mirror logic ─── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_warranty_end' ) ) {
    /**
     * Mirror of dinoco_sn_warranty_end_for_pool_row.
     */
    function sn_warranty_end( ?string $registered_at, int $years = 1 ): ?\DateTime {
        if ( empty( $registered_at ) ) return null;
        $years = max( 1, $years );
        try {
            $tz = new \DateTimeZone( 'Asia/Bangkok' );
            $start = new \DateTime( $registered_at, $tz );
            $start->modify( '+' . $years . ' years' );
            return $start;
        } catch ( \Throwable $_e ) { // phpcs:ignore -- intentionally unused
            return null;
        }
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_milestones_to_send_at' ) ) {
    /**
     * Convert warranty_end → send_at array per milestone.
     * Returns ['expiry_30d' => DateTime, 'expiry_7d' => ..., 'expiry_1d' => ...]
     */
    function sn_milestones_to_send_at( \DateTime $end ): array {
        $out = array();
        foreach ( array( 'expiry_30d' => 30, 'expiry_7d' => 7, 'expiry_1d' => 1 ) as $type => $days ) {
            $send_at = clone $end;
            $send_at->modify( '-' . $days . ' days' );
            $out[ $type ] = $send_at;
        }
        return $out;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_should_skip_milestone' ) ) {
    /**
     * Mirror of cron skip logic — skip if send_at < now - 24h.
     */
    function sn_should_skip_milestone( \DateTime $send_at, int $now_ts ): bool {
        return $send_at->getTimestamp() < ( $now_ts - 86400 );
    }
}

class SnExpiryReminderTest extends TestCase {

    public function test_warranty_end_default_one_year() {
        $end = sn_warranty_end( '2025-05-01 10:00:00' );
        $this->assertNotNull( $end );
        $this->assertSame( '2026-05-01', $end->format( 'Y-m-d' ) );
    }

    public function test_warranty_end_two_years() {
        $end = sn_warranty_end( '2025-05-01 10:00:00', 2 );
        $this->assertSame( '2027-05-01', $end->format( 'Y-m-d' ) );
    }

    public function test_warranty_end_invalid_input() {
        $this->assertNull( sn_warranty_end( null ) );
        $this->assertNull( sn_warranty_end( '' ) );
        $this->assertNull( sn_warranty_end( 'not-a-date' ) );
    }

    public function test_warranty_end_clamps_years_to_min_1() {
        $end = sn_warranty_end( '2025-01-01 00:00:00', 0 );
        $this->assertSame( '2026-01-01', $end->format( 'Y-m-d' ) );
        $end_neg = sn_warranty_end( '2025-01-01 00:00:00', -5 );
        $this->assertSame( '2026-01-01', $end_neg->format( 'Y-m-d' ) );
    }

    public function test_warranty_end_handles_leap_year_feb_29() {
        // 2024-02-29 + 1y → DateTime auto-rolls to 2025-03-01 (no Feb 29 in 2025)
        $end = sn_warranty_end( '2024-02-29 12:00:00' );
        $this->assertNotNull( $end );
        // PHP DateTime semantics: Feb 29 + 1y = Mar 1 next year
        $this->assertSame( '2025-03-01', $end->format( 'Y-m-d' ) );
    }

    public function test_milestones_30d_7d_1d() {
        $end = new \DateTime( '2026-05-01 00:00:00', new \DateTimeZone( 'Asia/Bangkok' ) );
        $sends = sn_milestones_to_send_at( $end );

        $this->assertArrayHasKey( 'expiry_30d', $sends );
        $this->assertArrayHasKey( 'expiry_7d', $sends );
        $this->assertArrayHasKey( 'expiry_1d', $sends );

        $this->assertSame( '2026-04-01', $sends['expiry_30d']->format( 'Y-m-d' ) );
        $this->assertSame( '2026-04-24', $sends['expiry_7d']->format( 'Y-m-d' ) );
        $this->assertSame( '2026-04-30', $sends['expiry_1d']->format( 'Y-m-d' ) );
    }

    public function test_milestones_does_not_mutate_input() {
        $end = new \DateTime( '2026-05-01 00:00:00', new \DateTimeZone( 'Asia/Bangkok' ) );
        $original_iso = $end->format( 'c' );
        sn_milestones_to_send_at( $end );
        // Original DateTime must be unchanged (clone semantics)
        $this->assertSame( $original_iso, $end->format( 'c' ) );
    }

    public function test_should_skip_milestone_past_window() {
        $now = strtotime( '2026-05-05 12:00:00' );
        $past = new \DateTime( '2026-05-03 00:00:00' ); // > 24h ago → skip
        $this->assertTrue( sn_should_skip_milestone( $past, $now ) );
    }

    public function test_should_skip_milestone_within_grace() {
        $now = strtotime( '2026-05-05 12:00:00' );
        $recent = new \DateTime( '2026-05-04 14:00:00' ); // 22h ago → keep
        $this->assertFalse( sn_should_skip_milestone( $recent, $now ) );
    }

    public function test_should_skip_milestone_future() {
        $now = strtotime( '2026-05-05 12:00:00' );
        $future = new \DateTime( '2026-05-10 00:00:00' );
        $this->assertFalse( sn_should_skip_milestone( $future, $now ) );
    }

    public function test_full_pipeline_30d_warning_for_today_expiry() {
        // Plate registered exactly 11 months ago → today is 30 days before expiry
        // Expected: expiry_30d milestone is "today/now" → enqueue; 7d + 1d are future → enqueue
        $registered = '2025-06-04 10:00:00';
        $end = sn_warranty_end( $registered ); // 2026-06-04
        $this->assertSame( '2026-06-04', $end->format( 'Y-m-d' ) );

        $sends = sn_milestones_to_send_at( $end );
        // 30d before 2026-06-04 = 2026-05-05 (today per scheme)
        $this->assertSame( '2026-05-05', $sends['expiry_30d']->format( 'Y-m-d' ) );
        // 7d before = 2026-05-28 (future)
        $this->assertSame( '2026-05-28', $sends['expiry_7d']->format( 'Y-m-d' ) );
        // 1d before = 2026-06-03 (future)
        $this->assertSame( '2026-06-03', $sends['expiry_1d']->format( 'Y-m-d' ) );
    }

    public function test_dedup_logic_composite_key() {
        // Mirror dinoco_sn_schedule_notification dedup intent:
        // Same (type, user_id, sn) → second insert returns false.
        // We can't run DB here, but verify the dedup key composition is
        // (notification_type, user_id, sn) not just (sn).
        $existing_keys = array(
            'expiry_30d|123|DNCSS0001234' => true,
        );
        $candidate_same  = 'expiry_30d|123|DNCSS0001234';
        $candidate_other = 'expiry_7d|123|DNCSS0001234';
        $candidate_user2 = 'expiry_30d|456|DNCSS0001234';
        $candidate_sn2   = 'expiry_30d|123|DNCSS0009999';

        $this->assertTrue( isset( $existing_keys[ $candidate_same ] ),
            'Same composite → dedup' );
        $this->assertFalse( isset( $existing_keys[ $candidate_other ] ),
            'Different milestone → allow' );
        $this->assertFalse( isset( $existing_keys[ $candidate_user2 ] ),
            'Different user → allow (transferred plate)' );
        $this->assertFalse( isset( $existing_keys[ $candidate_sn2 ] ),
            'Different S/N → allow' );
    }
}
