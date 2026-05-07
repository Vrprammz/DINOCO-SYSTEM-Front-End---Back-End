<?php
/**
 * REG-098 — HMAC replay window: 24h epoch bucket boundary precision.
 *
 * Plan v2.13 §Phase 1 W4 R3 HIGH.
 *
 * Verify accept rule:
 *   accept = bucket(sig) ∈ { bucket(now), bucket(now) - 1 }
 *   reject = bucket(sig) ∈ { bucket(now) - 2, ..., bucket(now) + 1, ... }
 *
 * Boundary scenarios stress-tested:
 *   - sig issued at second :00 of bucket N → accepted at end of bucket N+1
 *   - sig issued at second :86399 of bucket N → just-rejected at start of bucket N+2
 *   - clock skew: sig from bucket N+1 (future) at bucket N → reject
 *   - clock skew: sig from bucket N-1 at bucket N+10 → reject (way too old)
 *
 * Pure-logic mirror of bucket comparator.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\SnHmacReplayWindow;

use PHPUnit\Framework\TestCase;

const BUCKET_SECS = 86400;

if ( ! function_exists( __NAMESPACE__ . '\\bucket' ) ) {
    function bucket( int $epoch ): int {
        return intdiv( $epoch, BUCKET_SECS );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\replay_accepts' ) ) {
    /**
     * Mirror of the verify-window check.
     *
     * @return bool true if (sig_bucket === now_bucket) OR (sig_bucket === now_bucket - 1)
     */
    function replay_accepts( int $sig_epoch, int $now_epoch ): bool {
        $sig_bucket = bucket( $sig_epoch );
        $now_bucket = bucket( $now_epoch );
        return $sig_bucket === $now_bucket || $sig_bucket === $now_bucket - 1;
    }
}

class SnHmacReplayWindowTest extends TestCase {

    private const T0 = 1_800_000_000;

    /* ─── Within current bucket ─── */

    public function test_same_second_accept(): void {
        $this->assertTrue( replay_accepts( self::T0, self::T0 ) );
    }

    public function test_same_bucket_one_hour_ago_accept(): void {
        $this->assertTrue( replay_accepts( self::T0 - 3600, self::T0 ) );
    }

    public function test_same_bucket_first_second_accept(): void {
        $bucket_start = bucket( self::T0 ) * BUCKET_SECS;
        $this->assertTrue( replay_accepts( $bucket_start, $bucket_start + 86399 ) );
    }

    /* ─── Previous bucket window ─── */

    public function test_previous_bucket_first_second_accept(): void {
        $bucket_start = bucket( self::T0 ) * BUCKET_SECS;
        $prev_first   = $bucket_start - BUCKET_SECS;
        $this->assertTrue(
            replay_accepts( $prev_first, $bucket_start + 1 ),
            'sig at start of previous bucket → still accept early in current bucket'
        );
    }

    public function test_previous_bucket_last_second_accept(): void {
        $bucket_start = bucket( self::T0 ) * BUCKET_SECS;
        $prev_last    = $bucket_start - 1;
        $this->assertTrue( replay_accepts( $prev_last, $bucket_start ) );
    }

    public function test_previous_bucket_at_bucket_end_accept(): void {
        $bucket_start = bucket( self::T0 ) * BUCKET_SECS;
        $prev_first   = $bucket_start - BUCKET_SECS;
        $bucket_end   = $bucket_start + 86399;
        $this->assertTrue(
            replay_accepts( $prev_first, $bucket_end ),
            'previous bucket sig still accepted up to last second of current bucket (max 48h - 1s window)'
        );
    }

    /* ─── Beyond previous bucket → reject ─── */

    public function test_two_buckets_ago_reject(): void {
        $bucket_start = bucket( self::T0 ) * BUCKET_SECS;
        $two_ago      = $bucket_start - ( 2 * BUCKET_SECS );
        $this->assertFalse( replay_accepts( $two_ago, $bucket_start ) );
    }

    public function test_three_buckets_ago_reject(): void {
        $bucket_start = bucket( self::T0 ) * BUCKET_SECS;
        $three_ago    = $bucket_start - ( 3 * BUCKET_SECS );
        $this->assertFalse( replay_accepts( $three_ago, $bucket_start ) );
    }

    /* ─── Future bucket → reject (clock skew abuse) ─── */

    public function test_future_bucket_reject(): void {
        $bucket_start = bucket( self::T0 ) * BUCKET_SECS;
        $future       = $bucket_start + BUCKET_SECS;
        $this->assertFalse( replay_accepts( $future, $bucket_start ) );
    }

    public function test_far_future_bucket_reject(): void {
        $bucket_start = bucket( self::T0 ) * BUCKET_SECS;
        $far          = $bucket_start + ( 10 * BUCKET_SECS );
        $this->assertFalse( replay_accepts( $far, $bucket_start ) );
    }

    /* ─── 25-hour boundary edge ─── */

    public function test_25h_old_might_or_might_not_accept_depending_on_alignment(): void {
        // 25 hours = 90000 seconds
        // If issued at start of bucket N and now is start of bucket N+1, age=24h, sig_bucket=N, accept
        // If issued at start of bucket N and now is start of bucket N+1 + 1h, age=25h, sig_bucket=N, now_bucket=N+1, accept (still previous)
        // If issued at start of bucket N and now is bucket N+2, sig_bucket=N, now_bucket=N+2, reject
        $bucket_start = bucket( self::T0 ) * BUCKET_SECS;
        $issued       = $bucket_start;             // start of bucket N
        $now          = $bucket_start + 25 * 3600; // 25h later — bucket N+1 (since 25h > 24h crosses boundary)
        // Bucket N+1 starts at $bucket_start + 86400; 25h = 90000 > 86400 → now is in bucket N+1
        $this->assertTrue(
            replay_accepts( $issued, $now ),
            '25h-old sig still accepted (sig in bucket N, now in bucket N+1 — within previous-bucket window)'
        );
    }

    public function test_48h_plus_old_reject(): void {
        $issued = self::T0;
        $now    = self::T0 + ( 48 * 3600 + 1 ); // 48h + 1s = guaranteed bucket+2
        $this->assertFalse( replay_accepts( $issued, $now ) );
    }

    /* ─── Boundary precision ─── */

    public function test_bucket_helper_division(): void {
        $this->assertSame( 0, bucket( 0 ) );
        $this->assertSame( 0, bucket( 86399 ) );
        $this->assertSame( 1, bucket( 86400 ) );
        $this->assertSame( 100, bucket( 86400 * 100 ) );
    }
}
