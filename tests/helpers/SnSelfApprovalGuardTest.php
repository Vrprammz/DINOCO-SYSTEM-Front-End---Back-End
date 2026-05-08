<?php
/**
 * SnSelfApprovalGuardTest — R6 BLOCKER regression coverage.
 *
 * Source: [System] DINOCO SN REST API V.0.35
 *
 * R5 introduced self-approval guard for /void /swap /recall /marketplace/refund.
 * R6 found the guard was broken: route arg `'default' => 0` for approver_user_id
 * + handler guard `if ($approver_raw !== null && $approver_raw !== '')` would
 * see int(0), enter guard body, then `user_can(0, 'manage_options')` returned
 * false → 422 approver_invalid_cap on EVERY legitimate call without approver.
 *
 * R6 fix:
 *   1. Drop 'default' => 0 from 3 route arg specs
 *   2. Strengthen handler guard to also reject 0:
 *      `!== null && !== '' && (int) $approver_raw > 0`
 *
 * Tests below validate the guard logic against the FULL input matrix:
 *   - null (param truly omitted)
 *   - '' (empty string from form post)
 *   - 0 (route default — R6 BLOCKER scenario)
 *   - negative ints (manipulated requests)
 *   - current user id (self-approval — must block)
 *   - valid different user with capability (must allow)
 *   - valid different user without capability (must reject 422)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Pure-logic mirror of the R6-fixed handler guard ──────────── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_self_approval_guard' ) ) {

    /**
     * Mirror of the guard pattern in dinoco_sn_rest_void / _swap / _recall:
     *
     *   if ( $approver_raw !== null && $approver_raw !== '' && (int) $approver_raw > 0 ) {
     *       $approver = (int) $approver_raw;
     *       if ( $approver === $current_user_id ) {
     *           return 'self_approval_blocked';
     *       }
     *       if ( ! $user_can_manage( $approver ) ) {
     *           return 'approver_invalid_cap';
     *       }
     *   }
     *   return 'pass';
     *
     * @param mixed     $approver_raw     value from get_param() — null|''|int
     * @param int       $current_user_id  caller user id
     * @param callable  $user_can_manage  takes int $uid, returns bool
     * @return string   'pass'|'self_approval_blocked'|'approver_invalid_cap'
     */
    function sn_self_approval_guard(
        $approver_raw,
        int $current_user_id,
        callable $user_can_manage
    ): string {
        if ( $approver_raw !== null && $approver_raw !== '' && (int) $approver_raw > 0 ) {
            $approver = (int) $approver_raw;
            if ( $approver === $current_user_id ) {
                return 'self_approval_blocked';
            }
            if ( ! $user_can_manage( $approver ) ) {
                return 'approver_invalid_cap';
            }
        }
        return 'pass';
    }
}

final class SnSelfApprovalGuardTest extends TestCase {

    /** Default user_can mock: only uid 100/200/300 have manage_options */
    private function manageMock(): callable {
        return static function ( int $uid ): bool {
            return in_array( $uid, [ 100, 200, 300 ], true );
        };
    }

    /* ─── R6 BLOCKER scenarios — must NOT enter guard body ──────── */

    public function test_null_skips_guard(): void {
        $result = sn_self_approval_guard( null, 100, $this->manageMock() );
        $this->assertSame( 'pass', $result, 'null approver = guard skipped' );
    }

    public function test_empty_string_skips_guard(): void {
        $result = sn_self_approval_guard( '', 100, $this->manageMock() );
        $this->assertSame( 'pass', $result, 'empty string approver = guard skipped' );
    }

    /**
     * R6 BLOCKER: route arg `default => 0` made get_param return int(0).
     * Pre-fix: guard entered body, user_can(0) = false → 422.
     * Post-fix: `(int) > 0` check rejects 0 as "not provided".
     */
    public function test_zero_int_skips_guard_R6_BLOCKER(): void {
        $result = sn_self_approval_guard( 0, 100, $this->manageMock() );
        $this->assertSame( 'pass', $result, 'R6 BLOCKER: int(0) MUST skip guard' );
    }

    public function test_zero_string_skips_guard(): void {
        $result = sn_self_approval_guard( '0', 100, $this->manageMock() );
        $this->assertSame( 'pass', $result, 'string "0" MUST skip guard' );
    }

    public function test_negative_int_skips_guard(): void {
        $result = sn_self_approval_guard( -1, 100, $this->manageMock() );
        $this->assertSame( 'pass', $result, 'negative int MUST skip guard' );
    }

    public function test_negative_string_skips_guard(): void {
        $result = sn_self_approval_guard( '-99', 100, $this->manageMock() );
        $this->assertSame( 'pass', $result, 'negative string MUST skip guard' );
    }

    /* ─── Self-approval scenarios — must block ──────────────────── */

    public function test_self_approval_blocked_int(): void {
        $result = sn_self_approval_guard( 100, 100, $this->manageMock() );
        $this->assertSame( 'self_approval_blocked', $result );
    }

    public function test_self_approval_blocked_string(): void {
        $result = sn_self_approval_guard( '100', 100, $this->manageMock() );
        $this->assertSame( 'self_approval_blocked', $result );
    }

    /* ─── Capability check scenarios ────────────────────────────── */

    public function test_invalid_cap_returns_error(): void {
        // user 999 has no manage_options
        $result = sn_self_approval_guard( 999, 100, $this->manageMock() );
        $this->assertSame( 'approver_invalid_cap', $result );
    }

    public function test_valid_different_user_passes(): void {
        // user 200 has manage_options, different from caller 100
        $result = sn_self_approval_guard( 200, 100, $this->manageMock() );
        $this->assertSame( 'pass', $result );
    }

    public function test_valid_admin_string_passes(): void {
        $result = sn_self_approval_guard( '300', 100, $this->manageMock() );
        $this->assertSame( 'pass', $result );
    }

    /* ─── Edge cases that have surprised devs in the past ──────── */

    public function test_float_zero_skips_guard(): void {
        // PHP: (int) 0.0 === 0, > 0 = false → skip
        $result = sn_self_approval_guard( 0.0, 100, $this->manageMock() );
        $this->assertSame( 'pass', $result );
    }

    public function test_string_zero_decimal_skips_guard(): void {
        // (int) '0.5' === 0 → skip
        $result = sn_self_approval_guard( '0.5', 100, $this->manageMock() );
        $this->assertSame( 'pass', $result );
    }

    public function test_string_with_leading_zero_passes(): void {
        // (int) '0100' === 100 — PHP int cast strips leading zeros → matches uid 100
        $result = sn_self_approval_guard( '0100', 100, $this->manageMock() );
        $this->assertSame( 'self_approval_blocked', $result, 'string "0100" → int 100 → self' );
    }

    public function test_string_with_whitespace_acts_like_zero(): void {
        // (int) ' 100 ' === 100 in PHP — but our handler doesn't trim,
        // so `'!== null && !== ''` accepts it, `(int) > 0` accepts, then
        // self-approval check triggers because (int) === current uid.
        $result = sn_self_approval_guard( ' 100 ', 100, $this->manageMock() );
        $this->assertSame( 'self_approval_blocked', $result );
    }

    public function test_php_int_max_passes(): void {
        // huge int that's not in mock whitelist → invalid_cap (not crash)
        $result = sn_self_approval_guard( PHP_INT_MAX, 100, $this->manageMock() );
        $this->assertSame( 'approver_invalid_cap', $result );
    }

    /* ─── Boolean values (PHP type coercion footgun) ────────────── */

    public function test_false_skips_guard(): void {
        // (int) false === 0, > 0 = false → skip ✓
        $result = sn_self_approval_guard( false, 100, $this->manageMock() );
        $this->assertSame( 'pass', $result );
    }

    public function test_true_passes_to_cap_check(): void {
        // (int) true === 1, > 0 = true → enter guard, user 1 not in mock → invalid_cap
        // (intentional: true is malformed input but won't crash)
        $result = sn_self_approval_guard( true, 100, $this->manageMock() );
        $this->assertSame( 'approver_invalid_cap', $result );
    }

    /* ─── R6 regression: route arg default scenarios ─────────────── */

    public function test_R6_route_default_zero_does_not_break_legitimate_call(): void {
        // Simulate the R5→R6 regression: client did NOT pass approver_user_id,
        // route arg `default => 0` made get_param return int(0). Guard MUST skip.
        $route_default = 0;
        $result = sn_self_approval_guard( $route_default, 100, $this->manageMock() );
        $this->assertSame( 'pass', $result, 'R6: route default 0 = legitimate omission, NOT 422' );
    }

    public function test_R6_intentional_self_approval_still_blocked_after_fix(): void {
        // R6 fix did NOT relax self-approval block — verify it still triggers
        // when client DOES intentionally pass their own uid
        $result = sn_self_approval_guard( 100, 100, $this->manageMock() );
        $this->assertSame( 'self_approval_blocked', $result );
    }

    public function test_R6_4eyes_still_works_with_valid_approver(): void {
        // R6 fix did not break the 4-eyes happy path
        $result = sn_self_approval_guard( 200, 100, $this->manageMock() );
        $this->assertSame( 'pass', $result );
    }
}
