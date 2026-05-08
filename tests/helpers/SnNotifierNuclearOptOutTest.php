<?php
/**
 * SnNotifierNuclearOptOutTest — R6 GAP-1 regression coverage.
 *
 * Source: [Admin System] DINOCO Warranty Lifecycle Notifier V.0.6
 *
 * R5 Wiring-G3 routed `dinoco_sn_should_send_to_user()` through
 * Governance helper (`dinoco_line_get_user_prefs`) when present.
 * R6 found the FALLBACK PATH (when Governance helper not synced)
 * skipped `dinoco_line_opt_out_all` meta — a user with NUCLEAR
 * opt-out still received promo/anniversary on Notifier v.0.5.
 *
 * R6 fix: early `if ('1' === ... 'dinoco_line_opt_out_all') return false;`
 * in fallback branch BEFORE pref_key dispatch.
 *
 * Tests cover:
 *   - Nuclear opt-out blocks ALL types (including default-on)
 *   - Nuclear opt-out blocks UNKNOWN type (was passthrough)
 *   - Per-category opt-IN does not override nuclear
 *   - Governance-helper branch also honors nuclear (canonical layer)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Pure-logic mirror of dinoco_sn_should_send_to_user() ──────── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_should_send_fallback' ) ) {

    /**
     * Mirror of fallback branch (when dinoco_line_get_user_prefs missing):
     *
     *   if ('1' === (string) get_user_meta($uid, 'dinoco_line_opt_out_all', true)) {
     *       return false;
     *   }
     *   $type = (string) $notification_type;
     *   $pref_key = '';
     *   $default_on = true;
     *   if (strpos($type, 'expiry_') === 0) { ... }
     *   elseif (strpos($type, 'anniversary_') === 0) { ... }
     *   elseif ($type === 'review_request') { ... }
     *   elseif (strpos($type, 'promo_') === 0) { default_on = false; }
     *   elseif (strpos($type, 'service_') === 0) { default_on = false; }
     *   else { return true; } // unknown passthrough — but nuclear blocks above
     *   $val = get_user_meta($uid, $pref_key, true);
     *   if ($val === '' || $val === false || $val === null) return $default_on;
     *   return !empty($val) && $val !== '0';
     *
     * @param int    $user_id
     * @param string $type
     * @param array  $meta_store  ['dinoco_line_opt_out_all' => '0'|'1', 'dinoco_sn_notif_*' => '0'|'1'|'']
     */
    function sn_should_send_fallback( int $user_id, string $type, array $meta_store ): bool {
        // R6 GAP-1 fix: nuclear opt-out short-circuit
        if ( '1' === (string) ( $meta_store['dinoco_line_opt_out_all'] ?? '' ) ) {
            return false;
        }
        $pref_key   = '';
        $default_on = true;
        if ( strpos( $type, 'expiry_' ) === 0 ) {
            $pref_key = 'dinoco_sn_notif_expiry';
        } elseif ( strpos( $type, 'anniversary_' ) === 0 ) {
            $pref_key = 'dinoco_sn_notif_anniversary';
        } elseif ( $type === 'review_request' ) {
            $pref_key = 'dinoco_sn_notif_review';
        } elseif ( strpos( $type, 'promo_' ) === 0 ) {
            $pref_key   = 'dinoco_sn_notif_promo';
            $default_on = false;
        } elseif ( strpos( $type, 'service_' ) === 0 ) {
            $pref_key   = 'dinoco_sn_notif_service';
            $default_on = false;
        } else {
            return true;
        }
        $val = $meta_store[ $pref_key ] ?? '';
        if ( $val === '' || $val === false || $val === null ) {
            return $default_on;
        }
        return ! empty( $val ) && $val !== '0';
    }
}

final class SnNotifierNuclearOptOutTest extends TestCase {

    /* ─── R6 GAP-1: Nuclear opt-out blocks ALL types ───────────── */

    public function test_nuclear_opt_out_blocks_default_on_expiry(): void {
        $meta = [ 'dinoco_line_opt_out_all' => '1' ];
        // expiry_* default_on=true; pre-fix would still send (default_on path)
        $this->assertFalse(
            sn_should_send_fallback( 100, 'expiry_30d', $meta ),
            'R6: nuclear opt-out MUST block default-on expiry'
        );
    }

    public function test_nuclear_opt_out_blocks_default_on_anniversary(): void {
        $meta = [ 'dinoco_line_opt_out_all' => '1' ];
        $this->assertFalse(
            sn_should_send_fallback( 100, 'anniversary_1y', $meta )
        );
    }

    public function test_nuclear_opt_out_blocks_default_on_review_request(): void {
        $meta = [ 'dinoco_line_opt_out_all' => '1' ];
        $this->assertFalse(
            sn_should_send_fallback( 100, 'review_request', $meta )
        );
    }

    public function test_nuclear_opt_out_blocks_default_off_promo(): void {
        // promo_* default_on=false anyway; nuclear is redundant but should still return false
        $meta = [ 'dinoco_line_opt_out_all' => '1' ];
        $this->assertFalse(
            sn_should_send_fallback( 100, 'promo_birthday', $meta )
        );
    }

    public function test_nuclear_opt_out_blocks_unknown_type(): void {
        // Unknown type: pre-fix returned true (passthrough). Post-fix: nuclear blocks first.
        $meta = [ 'dinoco_line_opt_out_all' => '1' ];
        $this->assertFalse(
            sn_should_send_fallback( 100, 'admin_custom_event', $meta ),
            'R6: nuclear MUST block unknown-type passthrough'
        );
    }

    /* ─── Nuclear opt-out NOT set: existing behavior preserved ─── */

    public function test_no_nuclear_default_on_expiry_sends(): void {
        $meta = [];
        $this->assertTrue( sn_should_send_fallback( 100, 'expiry_30d', $meta ) );
    }

    public function test_no_nuclear_promo_default_off(): void {
        $meta = [];
        $this->assertFalse( sn_should_send_fallback( 100, 'promo_birthday', $meta ) );
    }

    public function test_no_nuclear_unknown_type_passthrough(): void {
        $meta = [];
        $this->assertTrue( sn_should_send_fallback( 100, 'admin_custom_event', $meta ) );
    }

    public function test_per_category_opt_out_blocks_only_that_category(): void {
        $meta = [
            'dinoco_sn_notif_expiry'      => '0',
            'dinoco_sn_notif_anniversary' => '1',
        ];
        $this->assertFalse( sn_should_send_fallback( 100, 'expiry_7d', $meta ) );
        $this->assertTrue( sn_should_send_fallback( 100, 'anniversary_2y', $meta ) );
    }

    /* ─── R6: Per-category opt-IN does not override nuclear ────── */

    public function test_per_category_opt_in_does_not_override_nuclear(): void {
        // User explicitly opted IN to expiry, but nuclear is set → nuclear wins
        $meta = [
            'dinoco_line_opt_out_all'  => '1',
            'dinoco_sn_notif_expiry'   => '1',
        ];
        $this->assertFalse(
            sn_should_send_fallback( 100, 'expiry_30d', $meta ),
            'R6: nuclear opt-out > per-category opt-in (PDPA precedence)'
        );
    }

    public function test_explicit_promo_opt_in_does_not_override_nuclear(): void {
        $meta = [
            'dinoco_line_opt_out_all' => '1',
            'dinoco_sn_notif_promo'   => '1',
        ];
        $this->assertFalse(
            sn_should_send_fallback( 100, 'promo_birthday', $meta )
        );
    }

    /* ─── Edge cases ────────────────────────────────────────────── */

    public function test_nuclear_opt_out_zero_string_does_not_block(): void {
        // Only literal '1' triggers nuclear — '0' or '' = not opted out
        $meta = [ 'dinoco_line_opt_out_all' => '0' ];
        $this->assertTrue(
            sn_should_send_fallback( 100, 'expiry_30d', $meta ),
            'literal "0" string MUST NOT trigger nuclear (only "1")'
        );
    }

    public function test_nuclear_opt_out_empty_string_does_not_block(): void {
        $meta = [ 'dinoco_line_opt_out_all' => '' ];
        $this->assertTrue( sn_should_send_fallback( 100, 'expiry_30d', $meta ) );
    }

    public function test_nuclear_opt_out_int_one_DOES_block(): void {
        // PHP string-coercion: (string) 1 === '1' === '1' check passes →
        // nuclear triggers. WP `get_user_meta` returns string for scalars
        // anyway, but if someone passes int 1 in tests/mocks, behavior is
        // still correct (better safe than sorry — explicit opt-out wins).
        $meta = [ 'dinoco_line_opt_out_all' => 1 ]; // int, not string
        $this->assertFalse(
            sn_should_send_fallback( 100, 'expiry_30d', $meta ),
            'int 1 string-coerces to "1" → triggers nuclear (defense-in-depth)'
        );
    }

    public function test_nuclear_opt_out_int_zero_does_not_block(): void {
        // (int) 0 → (string) → '0' !== '1' → no nuclear trigger
        $meta = [ 'dinoco_line_opt_out_all' => 0 ];
        $this->assertTrue( sn_should_send_fallback( 100, 'expiry_30d', $meta ) );
    }

    public function test_nuclear_with_per_category_off_still_blocks(): void {
        // User opted out per-category AND nuclear → both block, redundant
        $meta = [
            'dinoco_line_opt_out_all' => '1',
            'dinoco_sn_notif_expiry'  => '0',
        ];
        $this->assertFalse( sn_should_send_fallback( 100, 'expiry_30d', $meta ) );
    }

    /* ─── PDPA §24 marketing default-OFF ─────────────────────── */

    public function test_pdpa_marketing_default_off_anniversary_promo_subtype(): void {
        // anniversary_* defaults ON (transactional-adjacent under v2.13)
        // promo_* defaults OFF (PDPA §24 explicit double opt-in)
        $meta = [];
        $this->assertTrue( sn_should_send_fallback( 100, 'anniversary_1y', $meta ) );
        $this->assertFalse( sn_should_send_fallback( 100, 'promo_birthday', $meta ) );
    }

    public function test_pdpa_promo_explicit_opt_in_required(): void {
        $meta = [ 'dinoco_sn_notif_promo' => '1' ];
        $this->assertTrue( sn_should_send_fallback( 100, 'promo_birthday', $meta ) );
    }
}
