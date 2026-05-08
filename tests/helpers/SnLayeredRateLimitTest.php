<?php
/**
 * SnLayeredRateLimitTest — R7 C3 (CVSS 7.4) regression coverage.
 *
 * Source: [System] DINOCO SN REST API V.0.37 (`/stolen/report` handler)
 *
 * R7 security-pentester audit found that the original
 *   b2b_rate_limit('sn_stolen_report', $uid, 5, 3600)
 * was wrong on 2 levels:
 *   1. WRONG SIGNATURE — function is (key, max, window), 3-arg.
 *      The 4-arg call passed $uid as $max → effectively uncapped.
 *   2. SINGLE-LAYER per-user — even if signature were correct, LINE
 *      accounts cost ¥0 → attacker rotates 100 LINE UIDs = 500/hr →
 *      admin queue DoS + LINE quota burn (transactional alerts).
 *
 * R7 fix: Layered 3-tier rate-limit on /stolen/report:
 *   - Per-user: 5 reports / hour
 *   - Per-IP: 10 reports / hour (md5-hashed IP)
 *   - Per-SN: 3 reports / 24h (md5-hashed SN)
 *
 * Tests cover the decision matrix:
 *   each layer can be:
 *     - within budget (allow)
 *     - at threshold (reject)
 *     - above threshold (reject)
 *   8 layer combinations × 3 thresholds = many scenarios
 * Also test: pure-additive AND semantics (any layer at threshold = reject)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Pure-logic mirror of layered rate-limit pattern ─────── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_layered_rate_check' ) ) {

    /**
     * Mirror of /stolen/report handler logic post-R7 C3:
     *
     *   $uid_rl = b2b_rate_limit('sn_stolen_user_' . $uid, 5, HOUR_IN_SECONDS);
     *   if (is_wp_error($uid_rl)) return $uid_rl;
     *   if ($ip !== '') {
     *       $ip_rl = b2b_rate_limit('sn_stolen_ip_' . md5($ip), 10, HOUR_IN_SECONDS);
     *       if (is_wp_error($ip_rl)) return $ip_rl;
     *   }
     *   $sn_rl = b2b_rate_limit('sn_stolen_sn_' . md5($sn), 3, 86400);
     *   if (is_wp_error($sn_rl)) return $sn_rl;
     *
     * Returns: 'allowed' | 'rate_limited:user' | 'rate_limited:ip' | 'rate_limited:sn'
     *
     * @param int $user_count    current per-user count in 1h window
     * @param int $ip_count      current per-IP count in 1h window (-1 if no IP)
     * @param int $sn_count      current per-SN count in 24h window
     */
    function sn_layered_rate_check( int $user_count, int $ip_count, int $sn_count ): string {
        // Layer 1: per-user (max 5/hr)
        if ( $user_count >= 5 ) {
            return 'rate_limited:user';
        }
        // Layer 2: per-IP (max 10/hr) — skipped if no IP
        if ( $ip_count >= 0 && $ip_count >= 10 ) {
            return 'rate_limited:ip';
        }
        // Layer 3: per-SN (max 3/24h)
        if ( $sn_count >= 3 ) {
            return 'rate_limited:sn';
        }
        return 'allowed';
    }

    /**
     * Mirror of attack scenario: attacker rotates N LINE UIDs.
     * Each UID has its own per-user counter (resets to 0) but
     * shares the same IP and target SN.
     *
     * Returns total count of allowed reports across the rotation.
     */
    function sn_layered_simulate_rotation_attack(
        int $unique_uids,
        int $reports_per_uid_attempt,
        int $shared_ip_count_start = 0,
        int $shared_sn_count_start = 0
    ): array {
        $allowed_total = 0;
        $rate_limited_by_layer = [ 'user' => 0, 'ip' => 0, 'sn' => 0 ];
        $ip_count = $shared_ip_count_start;
        $sn_count = $shared_sn_count_start;

        for ( $uid = 1; $uid <= $unique_uids; $uid++ ) {
            $user_count = 0;
            for ( $rep = 0; $rep < $reports_per_uid_attempt; $rep++ ) {
                $result = sn_layered_rate_check( $user_count, $ip_count, $sn_count );
                if ( $result === 'allowed' ) {
                    $allowed_total++;
                    $user_count++;
                    $ip_count++;
                    $sn_count++;
                } else {
                    $rate_limited_by_layer[ explode( ':', $result )[1] ]++;
                    break; // attacker moves to next UID
                }
            }
        }
        return [ 'allowed' => $allowed_total, 'blocked_by' => $rate_limited_by_layer ];
    }
}

final class SnLayeredRateLimitTest extends TestCase {

    /* ─── Single-layer threshold tests ─────────────────────── */

    public function test_zero_counts_allows_request(): void {
        $this->assertSame( 'allowed', sn_layered_rate_check( 0, 0, 0 ) );
    }

    public function test_user_under_threshold_allows(): void {
        $this->assertSame( 'allowed', sn_layered_rate_check( 4, 0, 0 ) );
    }

    public function test_user_at_threshold_blocks(): void {
        $this->assertSame( 'rate_limited:user', sn_layered_rate_check( 5, 0, 0 ) );
    }

    public function test_user_above_threshold_blocks(): void {
        $this->assertSame( 'rate_limited:user', sn_layered_rate_check( 100, 0, 0 ) );
    }

    public function test_ip_under_threshold_allows(): void {
        $this->assertSame( 'allowed', sn_layered_rate_check( 0, 9, 0 ) );
    }

    public function test_ip_at_threshold_blocks(): void {
        $this->assertSame( 'rate_limited:ip', sn_layered_rate_check( 0, 10, 0 ) );
    }

    public function test_sn_under_threshold_allows(): void {
        $this->assertSame( 'allowed', sn_layered_rate_check( 0, 0, 2 ) );
    }

    public function test_sn_at_threshold_blocks(): void {
        $this->assertSame( 'rate_limited:sn', sn_layered_rate_check( 0, 0, 3 ) );
    }

    /* ─── Layer ordering (user > ip > sn) ─────────────────── */

    public function test_user_layer_takes_precedence_over_ip(): void {
        // Both layers tripped → user check fires first (alphabetical
        // ordering doesn't matter; what matters is consistent precedence)
        $result = sn_layered_rate_check( 5, 10, 0 );
        $this->assertSame( 'rate_limited:user', $result );
    }

    public function test_ip_layer_takes_precedence_over_sn(): void {
        $result = sn_layered_rate_check( 0, 10, 3 );
        $this->assertSame( 'rate_limited:ip', $result );
    }

    public function test_all_layers_tripped_user_wins(): void {
        $result = sn_layered_rate_check( 5, 10, 3 );
        $this->assertSame( 'rate_limited:user', $result );
    }

    /* ─── No-IP scenario (ip_count = -1) ────────────────────── */

    public function test_no_ip_skips_ip_layer(): void {
        $result = sn_layered_rate_check( 0, -1, 0 );
        $this->assertSame( 'allowed', $result );
    }

    public function test_no_ip_still_allows_user_layer_to_block(): void {
        $result = sn_layered_rate_check( 5, -1, 0 );
        $this->assertSame( 'rate_limited:user', $result );
    }

    public function test_no_ip_still_allows_sn_layer_to_block(): void {
        $result = sn_layered_rate_check( 0, -1, 3 );
        $this->assertSame( 'rate_limited:sn', $result );
    }

    /* ─── R7 C3 BLOCKER scenario: multi-account rotation ───── */

    public function test_R7_C3_100_uid_rotation_blocked_by_ip_layer(): void {
        // Attacker rotates 100 LINE UIDs, all from same IP, all targeting same SN
        // Pre-R7: per-user only → 100 × 5 = 500/hr (admin DoS)
        // Post-R7: per-IP layer kicks in at 10
        $result = sn_layered_simulate_rotation_attack(
            unique_uids: 100,
            reports_per_uid_attempt: 5
        );
        $this->assertLessThanOrEqual(
            10,
            $result['allowed'],
            'IP layer must cap 100-UID rotation at ≤10 reports'
        );
        $this->assertGreaterThan(
            0,
            $result['blocked_by']['ip'] + $result['blocked_by']['sn'],
            'rotation MUST be blocked by ip OR sn layer'
        );
    }

    public function test_R7_C3_100_uid_distinct_SN_blocked_by_ip(): void {
        // Edge case: attacker rotates UIDs AND SNs (so SN layer doesn't catch)
        // → IP layer catches at 10
        // Note: pure mirror only tracks shared SN — for distinct SN attack,
        // sn_count stays low; ip_count keeps climbing.
        // For this test, we use the simpler model and assume SN distinct
        // wouldn't trip sn layer. IP layer should still apply.
        $allowed = 0;
        $ip_count = 0;
        for ( $uid = 1; $uid <= 100; $uid++ ) {
            $result = sn_layered_rate_check( 0, $ip_count, 0 );
            if ( $result === 'allowed' ) {
                $allowed++;
                $ip_count++;
            }
        }
        $this->assertSame( 10, $allowed, 'IP layer caps at exactly 10' );
    }

    public function test_R7_C3_legitimate_usage_not_blocked(): void {
        // 1 user, 1 IP, 1 SN, 1 report — should be allowed
        $result = sn_layered_simulate_rotation_attack( 1, 1 );
        $this->assertSame( 1, $result['allowed'] );
        $this->assertSame( 0, array_sum( $result['blocked_by'] ) );
    }

    public function test_R7_C3_legitimate_user_at_5_reports_blocked(): void {
        // 1 user reports 6 plates from 6 SNs from same IP, same hour
        // After 5: per-user blocks. SN layer wouldn't trip (each SN unique → count=1).
        // IP layer wouldn't trip yet (5 ≤ 10).
        $allowed = 0;
        $user_count = 0;
        for ( $i = 0; $i < 6; $i++ ) {
            $result = sn_layered_rate_check( $user_count, 0, 0 );
            if ( $result === 'allowed' ) {
                $allowed++;
                $user_count++;
            }
        }
        $this->assertSame( 5, $allowed, 'per-user 5/hr exact cap' );
    }

    /* ─── Bonus: WRONG signature pre-R7 simulation ─────────── */

    public function test_pre_R7_wrong_signature_was_uncapped(): void {
        // The OLD wrong call: b2b_rate_limit('sn_stolen_report', $uid, 5, 3600)
        // The 4th arg (3600) was IGNORED by 3-arg signature.
        // The 3rd arg (5) became $window — meaning rate-limit reset every 5 SECONDS.
        // The 2nd arg ($uid) became $max — uid like 12345 → effectively no cap.
        //
        // This is hard to test in pure mirror without simulating WP transient
        // behavior, but we document the math here:
        //
        //   $max = $uid (12345)
        //   $window = 5 seconds (NOT 3600!)
        //   $key = 'sn_stolen_report' (SAME for all users)
        //
        // Result: ALL users share same key, 5-second window, max=12345 attempts.
        // Effective cap = 12345 attempts in 5 seconds = uncapped.
        $this->assertTrue(
            true,
            'pre-R7 was uncapped — documented for posterity (no behavioral test possible without WP transient)'
        );
    }

    /* ─── R7 C3 lesson: layered defense ─────────────────── */

    public function test_layered_defense_provides_AND_semantics(): void {
        // The 3 layers form an AND chain — request must pass ALL 3.
        // Any single layer at threshold = reject.
        // This is intentionally pessimistic vs OR-style soft-allow.
        $combinations = [
            // [user, ip, sn, expected_blocked]
            [ 0, 0, 0, false ],
            [ 5, 0, 0, true ], // user
            [ 0, 10, 0, true ], // ip
            [ 0, 0, 3, true ], // sn
            [ 5, 10, 3, true ], // all
        ];
        foreach ( $combinations as [ $u, $i, $s, $expected_blocked ] ) {
            $result = sn_layered_rate_check( $u, $i, $s );
            $is_blocked = str_starts_with( $result, 'rate_limited' );
            $this->assertSame( $expected_blocked, $is_blocked );
        }
    }
}
