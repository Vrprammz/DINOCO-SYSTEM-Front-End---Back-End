<?php
/**
 * SnLiffSigDefenseTest — R7 C2 (CVSS 8.1) regression coverage.
 *
 * Source: [System] DINOCO Warranty Activation LIFF V.0.10
 *
 * R7 security-pentester audit found that `POST /activate` had
 *   permission_callback => is_user_logged_in()
 *
 * Any LINE-logged-in user could iterate `DNCSS00000001..N` and POST
 * /activate with their own user_id → register plates they don't own
 * → legitimate customer locked out (409 already_registered) → must
 * contact admin Manual Transfer to recover.
 *
 * R7 fix: Flag-gated 3-layer defense:
 *   1. STRICT mode (`dinoco_sn_hmac_required = '1'`):
 *      requires sig param + HMAC verify; reject 403 invalid_sig
 *   2. PERMISSIVE mode (flag OFF, default for legacy QR plates):
 *      logs unsigned activate attempts via error_log
 *      soft rate-limit 10/IP/hr (defense without blocking legit)
 *   3. OPPORTUNISTIC verify when sig present but flag OFF:
 *      verify the sig but don't reject if missing
 *
 * Tests cover the decision matrix:
 *   flag={ON,OFF} × sig={present_valid, present_invalid, absent}
 *   = 6 distinct scenarios, plus rate-limit + logging branches
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Pure-logic mirror of LIFF /activate sig defense ────────── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_liff_classify_sig_decision' ) ) {

    /**
     * Mirror of POST /activate sig defense logic.
     *
     *   if ($strict_mode) {
     *       if (!$sig) return ['reject', 'invalid_sig'];
     *       if (!verify($sn, $sig)) return ['reject', 'invalid_sig'];
     *       return ['proceed', 'sig_verified'];
     *   } else {
     *       if ($sig) {
     *           if (!verify($sn, $sig)) return ['log_warn_proceed', 'opportunistic_invalid'];
     *           return ['proceed', 'sig_verified'];
     *       }
     *       return ['log_unsigned_proceed', 'unsigned_attempt'];
     *   }
     *
     * Returns array [decision, reason]:
     *   - decision: 'proceed'|'reject'|'log_unsigned_proceed'|'log_warn_proceed'
     *   - reason: 'sig_verified'|'invalid_sig'|'unsigned_attempt'|'opportunistic_invalid'
     */
    function sn_liff_classify_sig_decision(
        bool $strict_mode,
        ?string $sig,
        callable $verify
    ): array {
        if ( $strict_mode ) {
            if ( $sig === null || $sig === '' ) {
                return [ 'reject', 'invalid_sig' ];
            }
            if ( ! $verify( $sig ) ) {
                return [ 'reject', 'invalid_sig' ];
            }
            return [ 'proceed', 'sig_verified' ];
        }
        // Permissive mode
        if ( $sig !== null && $sig !== '' ) {
            if ( ! $verify( $sig ) ) {
                return [ 'log_warn_proceed', 'opportunistic_invalid' ];
            }
            return [ 'proceed', 'sig_verified' ];
        }
        return [ 'log_unsigned_proceed', 'unsigned_attempt' ];
    }

    /**
     * Mirror of soft rate-limit pattern for unsigned attempts.
     *
     *   if (!$strict_mode && !$sig) {
     *       $count = $rate_check($ip);
     *       if ($count >= 10) return ['rate_limited', $count];
     *   }
     */
    function sn_liff_check_unsigned_rate(
        bool $strict_mode,
        ?string $sig,
        int $ip_attempts_in_window
    ): array {
        if ( $strict_mode ) {
            return [ 'no_rate_limit_in_strict', 0 ];
        }
        if ( $sig !== null && $sig !== '' ) {
            return [ 'no_rate_limit_signed', 0 ];
        }
        if ( $ip_attempts_in_window >= 10 ) {
            return [ 'rate_limited', $ip_attempts_in_window ];
        }
        return [ 'allowed', $ip_attempts_in_window ];
    }
}

final class SnLiffSigDefenseTest extends TestCase {

    private function alwaysValid(): callable {
        return static fn( $sig ) => true;
    }

    private function alwaysInvalid(): callable {
        return static fn( $sig ) => false;
    }

    /* ─── STRICT mode (flag = ON) — 3 sig states ───────────── */

    public function test_strict_mode_with_valid_sig_proceeds(): void {
        [ $decision, $reason ] = sn_liff_classify_sig_decision( true, 'GOODSIG123', $this->alwaysValid() );
        $this->assertSame( 'proceed', $decision );
        $this->assertSame( 'sig_verified', $reason );
    }

    public function test_strict_mode_with_invalid_sig_rejects(): void {
        [ $decision, $reason ] = sn_liff_classify_sig_decision( true, 'BADSIG456', $this->alwaysInvalid() );
        $this->assertSame( 'reject', $decision );
        $this->assertSame( 'invalid_sig', $reason );
    }

    public function test_strict_mode_with_no_sig_rejects(): void {
        // Squatting attack: customer with LINE login but no sig — MUST 403
        [ $decision, $reason ] = sn_liff_classify_sig_decision( true, null, $this->alwaysValid() );
        $this->assertSame( 'reject', $decision );
        $this->assertSame( 'invalid_sig', $reason );
    }

    public function test_strict_mode_with_empty_sig_rejects(): void {
        [ $decision, $reason ] = sn_liff_classify_sig_decision( true, '', $this->alwaysValid() );
        $this->assertSame( 'reject', $decision );
        $this->assertSame( 'invalid_sig', $reason );
    }

    /* ─── PERMISSIVE mode (flag = OFF) — 3 sig states ──────── */

    public function test_permissive_mode_with_valid_sig_proceeds(): void {
        [ $decision, $reason ] = sn_liff_classify_sig_decision( false, 'GOODSIG', $this->alwaysValid() );
        $this->assertSame( 'proceed', $decision );
        $this->assertSame( 'sig_verified', $reason );
    }

    public function test_permissive_mode_with_invalid_sig_logs_but_proceeds(): void {
        // R7 design: opportunistic verify — if sig is present but bad, log
        // warning but ALLOW activate (legacy QR plates without sigs co-exist
        // with new sigs during transition window)
        [ $decision, $reason ] = sn_liff_classify_sig_decision( false, 'TAMPERED', $this->alwaysInvalid() );
        $this->assertSame( 'log_warn_proceed', $decision );
        $this->assertSame( 'opportunistic_invalid', $reason );
    }

    public function test_permissive_mode_with_no_sig_logs_unsigned_proceeds(): void {
        // R7 design: legacy QR plates have no sig — log + allow + soft rate-limit
        [ $decision, $reason ] = sn_liff_classify_sig_decision( false, null, $this->alwaysValid() );
        $this->assertSame( 'log_unsigned_proceed', $decision );
        $this->assertSame( 'unsigned_attempt', $reason );
    }

    public function test_permissive_mode_with_empty_sig_logs_unsigned(): void {
        [ $decision, $reason ] = sn_liff_classify_sig_decision( false, '', $this->alwaysValid() );
        $this->assertSame( 'log_unsigned_proceed', $decision );
        $this->assertSame( 'unsigned_attempt', $reason );
    }

    /* ─── R7 BLOCKER scenario: SN squatting attack ──────────── */

    public function test_R7_C2_squatting_attack_blocked_in_strict_mode(): void {
        // Attacker iterates DNCSS00000001..N with LINE login but no sig
        // Strict mode MUST reject all → no plate gets registered to attacker
        for ( $i = 1; $i <= 100; $i++ ) {
            $sn = sprintf( 'DNCSS%08d', $i );
            [ $decision, $reason ] = sn_liff_classify_sig_decision(
                true, // strict mode
                null, // no sig
                $this->alwaysValid()
            );
            $this->assertSame( 'reject', $decision, "SN $sn must reject" );
            $this->assertSame( 'invalid_sig', $reason );
        }
    }

    public function test_R7_C2_legitimate_customer_with_QR_sig_proceeds_in_strict(): void {
        // Legit customer scans QR (which carries sig in URL)
        [ $decision, $reason ] = sn_liff_classify_sig_decision(
            true,
            'VALIDQRsig...',
            $this->alwaysValid()
        );
        $this->assertSame( 'proceed', $decision );
    }

    /* ─── Rate-limit scenarios for unsigned attempts ────────── */

    public function test_strict_mode_no_rate_limit_applied(): void {
        [ $status, $count ] = sn_liff_check_unsigned_rate( true, null, 100 );
        $this->assertSame( 'no_rate_limit_in_strict', $status, 'strict mode rejects directly, no rate-limit needed' );
    }

    public function test_signed_request_no_rate_limit_applied(): void {
        // Signed requests are pre-validated, don't burn the unsigned budget
        [ $status, $count ] = sn_liff_check_unsigned_rate( false, 'goodsig', 100 );
        $this->assertSame( 'no_rate_limit_signed', $status );
    }

    public function test_unsigned_under_threshold_allowed(): void {
        [ $status, $count ] = sn_liff_check_unsigned_rate( false, null, 9 );
        $this->assertSame( 'allowed', $status );
        $this->assertSame( 9, $count );
    }

    public function test_unsigned_at_threshold_rate_limited(): void {
        [ $status, $count ] = sn_liff_check_unsigned_rate( false, null, 10 );
        $this->assertSame( 'rate_limited', $status );
    }

    public function test_unsigned_above_threshold_rate_limited(): void {
        [ $status, $count ] = sn_liff_check_unsigned_rate( false, null, 50 );
        $this->assertSame( 'rate_limited', $status );
    }

    /* ─── Edge cases ───────────────────────────────────────── */

    public function test_whitespace_sig_treated_as_present(): void {
        // Real impl uses trim — but pure mirror test must reflect: ' '
        // is non-empty string. Real handler should trim before passing here.
        [ $decision, $reason ] = sn_liff_classify_sig_decision(
            false,
            ' ',
            $this->alwaysInvalid() // verify will fail because ' ' isn't valid
        );
        $this->assertSame( 'log_warn_proceed', $decision );
    }

    public function test_very_long_sig_passes_to_verify(): void {
        $long_sig = str_repeat( 'A', 1024 );
        [ $decision, $reason ] = sn_liff_classify_sig_decision(
            true,
            $long_sig,
            $this->alwaysValid()
        );
        $this->assertSame( 'proceed', $decision );
    }

    public function test_strict_mode_locks_out_BEFORE_user_id_check(): void {
        // Critical security property: sig check must come BEFORE
        // user_id binding check. Otherwise attacker could bind plate
        // to themselves first, then sig verify becomes moot.
        // This is enforced by handler order, not in this pure test —
        // but we assert the decision tree returns reject FIRST without
        // ever calling verify when sig is missing.
        $verify_called = false;
        $verify = static function( $sig ) use ( &$verify_called ) {
            $verify_called = true;
            return true;
        };
        sn_liff_classify_sig_decision( true, null, $verify );
        $this->assertFalse( $verify_called, 'verify should NOT be called when sig is null in strict mode' );
    }

    /* ─── Decision matrix completeness ─────────────────────── */

    public function test_all_6_decision_combinations_covered(): void {
        $matrix = [
            [ true,  'good', 'always_valid', 'proceed' ],
            [ true,  'bad',  'always_invalid', 'reject' ],
            [ true,  null,   'never_called', 'reject' ],
            [ false, 'good', 'always_valid', 'proceed' ],
            [ false, 'bad',  'always_invalid', 'log_warn_proceed' ],
            [ false, null,   'never_called', 'log_unsigned_proceed' ],
        ];
        foreach ( $matrix as [ $strict, $sig, $verify_kind, $expected_decision ] ) {
            $verify = $verify_kind === 'always_valid'
                ? $this->alwaysValid()
                : $this->alwaysInvalid();
            [ $decision, ] = sn_liff_classify_sig_decision( $strict, $sig, $verify );
            $this->assertSame(
                $expected_decision, $decision,
                "matrix: strict=$strict sig=" . var_export( $sig, true )
            );
        }
    }
}
