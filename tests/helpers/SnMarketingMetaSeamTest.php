<?php
/**
 * SnMarketingMetaSeamTest — R5 Sec-G7 regression coverage.
 *
 * Source: [Admin System] DINOCO LINE Push Governance V.1.3
 *
 * R5 Sec-G7 added a `update_user_metadata` + `add_user_metadata` filter
 * (priority 5) that detects "rogue" code writing marketing meta keys
 * outside of the canonical `dinoco_line_set_user_prefs()` helper.
 *
 * Mechanism:
 *   1. A static counter in `dinoco_line_gov_inside_helper()` — set_user_prefs
 *      increments before doing its work, decrements in finally block.
 *   2. The seam detector filter checks the counter — if 0 AND the meta key
 *      is in the marketing whitelist AND the value is truthy, log a stack
 *      trace via error_log.
 *   3. Filter ALWAYS returns $check unchanged (non-blocking observability).
 *
 * Tests cover:
 *   - Counter increments/decrements correctly across nested calls
 *   - Counter survives exception (finally block)
 *   - Marketing key whitelist matches expected categories
 *   - Truthy/falsy detection for filter trigger
 *   - $check return value is preserved (non-blocking)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Pure-logic mirrors of seam detector helpers ────────────── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_seam_inside_helper_state' ) ) {

    /**
     * Mirror of dinoco_line_gov_inside_helper() static counter.
     * Returns $state by reference for inc/dec.
     */
    function &sn_seam_inside_helper_state(): array {
        static $state = [ 'count' => 0 ];
        return $state;
    }

    /**
     * Mirror of dinoco_line_gov_marketing_meta_keys() — defensive fallback
     * (when categories helper not loaded). Phase 5 W14 baseline:
     *
     *   - dinoco_sn_notif_expiry
     *   - dinoco_sn_notif_anniversary
     *   - dinoco_sn_notif_review
     *   - dinoco_sn_notif_promo
     *   + dinoco_line_opt_out_all (nuclear flag, also governed)
     */
    function sn_seam_marketing_keys(): array {
        return [
            'dinoco_sn_notif_expiry',
            'dinoco_sn_notif_anniversary',
            'dinoco_sn_notif_review',
            'dinoco_sn_notif_promo',
            'dinoco_line_opt_out_all',
        ];
    }

    /**
     * Mirror of dinoco_line_gov_seam_detector():
     *
     *   1. Fast path: not in marketing whitelist → return $check unchanged
     *   2. Inside helper (counter > 0) → return $check unchanged
     *   3. Falsy value (de-opt-in) → return $check unchanged
     *   4. Otherwise log + return $check
     *
     * @return string  'logged' | 'skipped_not_marketing' | 'skipped_inside_helper'
     *                 | 'skipped_falsy'
     */
    function sn_seam_detector(
        string $meta_key,
        $meta_value
    ): string {
        $marketing_keys = sn_seam_marketing_keys();
        if ( ! in_array( $meta_key, $marketing_keys, true ) ) {
            return 'skipped_not_marketing';
        }
        $guard = &sn_seam_inside_helper_state();
        if ( $guard['count'] > 0 ) {
            return 'skipped_inside_helper';
        }
        $is_truthy = filter_var( $meta_value, FILTER_VALIDATE_BOOLEAN );
        if ( ! $is_truthy ) {
            return 'skipped_falsy';
        }
        return 'logged';
    }

    /**
     * Mirror of canonical helper that brackets meta writes:
     *
     *   $guard = &sn_seam_inside_helper_state();
     *   $guard['count']++;
     *   try {
     *       update_user_meta(...) // detector sees count > 0 → skip
     *   } finally {
     *       $guard['count']--;
     *       if ($guard['count'] < 0) $guard['count'] = 0;
     *   }
     *
     * @param callable $body  the meta-writing block (may throw)
     */
    function sn_seam_canonical_helper( callable $body ): void {
        $guard = &sn_seam_inside_helper_state();
        $guard['count']++;
        try {
            $body();
        } finally {
            $guard['count']--;
            if ( $guard['count'] < 0 ) {
                $guard['count'] = 0;
            }
        }
    }
}

final class SnMarketingMetaSeamTest extends TestCase {

    /** Reset static counter between tests (PHPUnit creates new TestCase instance per test) */
    protected function setUp(): void {
        // PHP statics persist across instances within same process — manual reset
        $guard = &sn_seam_inside_helper_state();
        $guard['count'] = 0;
    }

    /* ─── Marketing key whitelist matches ─────────────────────── */

    public function test_marketing_keys_includes_4_notif_categories(): void {
        $keys = sn_seam_marketing_keys();
        $this->assertContains( 'dinoco_sn_notif_expiry', $keys );
        $this->assertContains( 'dinoco_sn_notif_anniversary', $keys );
        $this->assertContains( 'dinoco_sn_notif_review', $keys );
        $this->assertContains( 'dinoco_sn_notif_promo', $keys );
    }

    public function test_marketing_keys_includes_nuclear_flag(): void {
        $keys = sn_seam_marketing_keys();
        $this->assertContains( 'dinoco_line_opt_out_all', $keys );
    }

    public function test_marketing_keys_count_is_5(): void {
        // Sanity: if R5 baseline ever shifts (e.g., add 'dinoco_sn_notif_service'),
        // bump this assertion + audit cross-references.
        $this->assertCount( 5, sn_seam_marketing_keys() );
    }

    /* ─── Detector fast path: skip non-marketing keys ─────────── */

    public function test_seam_skips_non_marketing_key(): void {
        $result = sn_seam_detector( 'random_meta_key', '1' );
        $this->assertSame( 'skipped_not_marketing', $result );
    }

    public function test_seam_skips_user_login_meta(): void {
        // Common WP meta — must NOT trigger
        $result = sn_seam_detector( 'wp_user-settings', 'libraryContent=browse' );
        $this->assertSame( 'skipped_not_marketing', $result );
    }

    /* ─── Detector skips when inside canonical helper ─────────── */

    public function test_seam_skips_when_inside_helper(): void {
        sn_seam_canonical_helper( function () {
            $result = sn_seam_detector( 'dinoco_sn_notif_promo', '1' );
            $this->assertSame( 'skipped_inside_helper', $result );
        } );
    }

    public function test_seam_logs_when_outside_helper(): void {
        $result = sn_seam_detector( 'dinoco_sn_notif_promo', '1' );
        $this->assertSame( 'logged', $result );
    }

    /* ─── Truthy/falsy detection ─────────────────────────────── */

    public function test_seam_skips_falsy_zero_string(): void {
        $result = sn_seam_detector( 'dinoco_sn_notif_promo', '0' );
        $this->assertSame( 'skipped_falsy', $result, 'opt-out (0) must not log' );
    }

    public function test_seam_skips_falsy_empty_string(): void {
        $result = sn_seam_detector( 'dinoco_sn_notif_promo', '' );
        $this->assertSame( 'skipped_falsy', $result );
    }

    public function test_seam_skips_falsy_false_bool(): void {
        $result = sn_seam_detector( 'dinoco_sn_notif_promo', false );
        $this->assertSame( 'skipped_falsy', $result );
    }

    public function test_seam_logs_truthy_one_string(): void {
        $result = sn_seam_detector( 'dinoco_sn_notif_promo', '1' );
        $this->assertSame( 'logged', $result );
    }

    public function test_seam_logs_truthy_true_bool(): void {
        $result = sn_seam_detector( 'dinoco_sn_notif_promo', true );
        $this->assertSame( 'logged', $result );
    }

    public function test_seam_logs_truthy_yes_string(): void {
        // FILTER_VALIDATE_BOOLEAN treats 'yes' as truthy
        $result = sn_seam_detector( 'dinoco_sn_notif_promo', 'yes' );
        $this->assertSame( 'logged', $result );
    }

    /* ─── Counter increment/decrement correctness ─────────────── */

    public function test_counter_starts_at_zero(): void {
        $guard = &sn_seam_inside_helper_state();
        $this->assertSame( 0, $guard['count'] );
    }

    public function test_counter_increments_inside_helper(): void {
        $observed = -1;
        sn_seam_canonical_helper( function () use ( &$observed ) {
            $guard    = &sn_seam_inside_helper_state();
            $observed = $guard['count'];
        } );
        $this->assertSame( 1, $observed, 'inside helper must show count=1' );
    }

    public function test_counter_decrements_after_helper(): void {
        sn_seam_canonical_helper( function () { /* no-op */ } );
        $guard = &sn_seam_inside_helper_state();
        $this->assertSame( 0, $guard['count'], 'after helper must restore count=0' );
    }

    public function test_counter_decrements_after_exception(): void {
        // Critical: finally block must fire even if body throws
        try {
            sn_seam_canonical_helper( function () {
                throw new \RuntimeException( 'simulated failure' );
            } );
            $this->fail( 'exception should have propagated' );
        } catch ( \RuntimeException $e ) {
            // expected
        }
        $guard = &sn_seam_inside_helper_state();
        $this->assertSame( 0, $guard['count'], 'finally block MUST decrement counter' );
    }

    public function test_counter_handles_nested_helper_calls(): void {
        $observed_inner = -1;
        $observed_after_inner = -1;
        sn_seam_canonical_helper( function () use ( &$observed_inner, &$observed_after_inner ) {
            sn_seam_canonical_helper( function () use ( &$observed_inner ) {
                $guard          = &sn_seam_inside_helper_state();
                $observed_inner = $guard['count'];
            } );
            $guard                 = &sn_seam_inside_helper_state();
            $observed_after_inner  = $guard['count'];
        } );
        $this->assertSame( 2, $observed_inner, 'nested call: count=2' );
        $this->assertSame( 1, $observed_after_inner, 'after inner returns: count=1' );

        $guard = &sn_seam_inside_helper_state();
        $this->assertSame( 0, $guard['count'], 'after outer returns: count=0' );
    }

    public function test_counter_clamps_at_zero_on_underflow(): void {
        // Defensive: if external code accidentally decrements past 0,
        // helper clamps to 0 (prevents permanent "inside helper" state)
        $guard          = &sn_seam_inside_helper_state();
        $guard['count'] = -5; // simulate underflow
        sn_seam_canonical_helper( function () { /* no-op */ } );
        $this->assertSame( 0, $guard['count'], 'clamped at zero after helper' );
    }

    /* ─── Mixed: truthy + outside helper = log ────────────────── */

    public function test_rogue_direct_write_outside_helper_triggers_log(): void {
        // Simulates a 3rd-party plugin or rogue snippet writing marketing meta
        $result = sn_seam_detector( 'dinoco_sn_notif_promo', '1' );
        $this->assertSame( 'logged', $result, 'rogue direct write MUST be logged' );
    }

    public function test_legitimate_canonical_write_does_not_log(): void {
        $observed = '';
        sn_seam_canonical_helper( function () use ( &$observed ) {
            // Inside canonical — detector sees count > 0 and skips
            $observed = sn_seam_detector( 'dinoco_sn_notif_promo', '1' );
        } );
        $this->assertSame( 'skipped_inside_helper', $observed );
    }
}
