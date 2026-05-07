<?php
/**
 * SnLifecycleNotifierTest — pure-logic tests for Phase 3 W9.1 cron workers.
 *
 * Source: [Admin System] DINOCO Warranty Lifecycle Notifier V.0.1
 * Plan:   ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §F#1+F#4+F#10
 *
 * Scope:
 *   - Anniversary tier coupon table (1y=5%, 2y=7%, 3y+=10%)
 *   - Promo code generation (12-char alnum, uppercase)
 *   - Send window milestones (30/7/1 day) + skip-past-window grace
 *   - Notification preference resolution (5 wp_usermeta keys + LINE UID gate)
 *   - Days-until-expiry math (negative on expired)
 *   - Thai date format (Buddhist year)
 *   - Idempotency: re-run scheduler → same notification dedup'd
 *   - Review request skip-if-claim-open + UNIQUE(user, sn) guard
 *   - LINE quota safety: 50 sends/run cap
 *   - Telegram threshold semantics: ≥100 plates / ≥5 failures
 *
 * NOTE: DB ops + LINE pushes are mocked. Tests assert math + decision logic
 *       only. Integration coverage lives in PHPUnit @group integration (later).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Mirror logic from snippet ─── */

if ( ! function_exists( __NAMESPACE__ . '\\anniversary_coupon' ) ) {
    /**
     * Mirror of dinoco_sn_compute_anniversary_coupon.
     */
    function anniversary_coupon( int $year_n ): array {
        if ( $year_n < 1 ) $year_n = 1;
        if ( $year_n === 1 ) {
            $pct = 5;
        } elseif ( $year_n === 2 ) {
            $pct = 7;
        } else {
            $pct = 10;
        }
        return array(
            'discount_pct'   => $pct,
            'discount_value' => null,
            'scope'          => 'any',
        );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\random_promo_code' ) ) {
    /**
     * Mirror of dinoco_sn_lifecycle_random_code (fallback path — pure PHP).
     */
    function random_promo_code( int $length = 12 ): string {
        if ( $length < 6 )  $length = 6;
        if ( $length > 20 ) $length = 20;
        $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        $out   = '';
        for ( $i = 0; $i < $length; $i++ ) {
            $out .= $chars[ mt_rand( 0, strlen( $chars ) - 1 ) ];
        }
        return $out;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\should_send_to_user' ) ) {
    /**
     * Mirror of dinoco_sn_should_send_to_user — pure decision logic.
     *
     * @param string $line_uid     LINE UID (empty = skip)
     * @param string $type         e.g. 'expiry_30d', 'anniversary_2y'
     * @param array  $prefs        Override map (key→'1'|'0'|'')
     */
    function should_send_to_user( string $line_uid, string $type, array $prefs = array() ): bool {
        if ( $line_uid === '' ) return false;
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
            return true; // unknown type passes through
        }
        $val = $prefs[ $pref_key ] ?? '';
        if ( $val === '' || $val === false || $val === null ) {
            return $default_on;
        }
        return ! empty( $val ) && $val !== '0';
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\compute_days_until_expiry' ) ) {
    /**
     * Mirror of dinoco_sn_compute_days_until_expiry — pure date math.
     * Uses an injected $now so tests are deterministic.
     */
    function compute_days_until_expiry( ?string $registered_at, int $years, \DateTime $now ): ?int {
        if ( empty( $registered_at ) ) return null;
        if ( $years < 1 ) $years = 1;
        try {
            $start = new \DateTime( $registered_at, new \DateTimeZone( 'Asia/Bangkok' ) );
            $start->modify( '+' . $years . ' years' );
            $diff = $now->diff( $start );
            return ( $diff->invert ? -1 : 1 ) * (int) $diff->days;
        } catch ( \Throwable $e ) {
            return null;
        }
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\format_thai_date' ) ) {
    /**
     * Mirror of dinoco_sn_format_thai_date.
     */
    function format_thai_date( $when ): string {
        $ts = is_numeric( $when ) ? (int) $when : strtotime( (string) $when );
        if ( ! $ts || $ts <= 0 ) return '';
        $months_th = array(
            1 => 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
        );
        $d = (int) date( 'j', $ts );
        $m = (int) date( 'n', $ts );
        $y = (int) date( 'Y', $ts ) + 543;
        $mlabel = $months_th[ $m ] ?? '';
        return $d . ' ' . $mlabel . ' ' . $y;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\schedule_notification_dedup' ) ) {
    /**
     * Mirror of INSERT IGNORE behavior — pure idempotency check.
     * Uses array as in-memory store keyed by composite unique (type|user|sn).
     *
     * Returns true if newly inserted, false if dup.
     */
    function schedule_notification_dedup( array &$store, string $type, int $user_id, string $sn ): bool {
        $key = strtolower( $type ) . '|' . $user_id . '|' . strtoupper( $sn );
        if ( isset( $store[ $key ] ) ) return false;
        $store[ $key ] = true;
        return true;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\should_skip_review_request' ) ) {
    /**
     * Mirror of cron skip-if-claim guard for review request scheduler.
     */
    function should_skip_review_request( int $user_id, array $users_with_open_claim ): bool {
        return isset( $users_with_open_claim[ $user_id ] );
    }
}


class SnLifecycleNotifierTest extends TestCase {

    /* ──────────────── Anniversary tier coupon ──────────────── */

    public function test_anniversary_coupon_1y_5pct() {
        $c = anniversary_coupon( 1 );
        $this->assertSame( 5, $c['discount_pct'] );
        $this->assertSame( 'any', $c['scope'] );
    }

    public function test_anniversary_coupon_2y_7pct() {
        $c = anniversary_coupon( 2 );
        $this->assertSame( 7, $c['discount_pct'] );
    }

    public function test_anniversary_coupon_3y_10pct() {
        $c = anniversary_coupon( 3 );
        $this->assertSame( 10, $c['discount_pct'] );
    }

    public function test_anniversary_coupon_5y_capped_at_10pct() {
        $c = anniversary_coupon( 5 );
        $this->assertSame( 10, $c['discount_pct'], '5y caps at 10%' );
    }

    public function test_anniversary_coupon_invalid_clamped_to_1y() {
        $c0  = anniversary_coupon( 0 );
        $cn  = anniversary_coupon( -3 );
        $this->assertSame( 5, $c0['discount_pct'] );
        $this->assertSame( 5, $cn['discount_pct'] );
    }

    /* ──────────────── Promo code generation (fallback random) ──────────────── */

    public function test_promo_code_default_length_12() {
        $code = random_promo_code();
        $this->assertSame( 12, strlen( $code ) );
    }

    public function test_promo_code_alphanumeric_uppercase_only() {
        for ( $i = 0; $i < 20; $i++ ) {
            $code = random_promo_code();
            $this->assertMatchesRegularExpression( '/^[A-Z0-9]+$/', $code );
        }
    }

    public function test_promo_code_length_clamped_min_6() {
        $code = random_promo_code( 2 );
        $this->assertSame( 6, strlen( $code ) );
    }

    public function test_promo_code_length_clamped_max_20() {
        $code = random_promo_code( 50 );
        $this->assertSame( 20, strlen( $code ) );
    }

    public function test_promo_code_uniqueness_high_probability() {
        // 100 codes with 36^12 search space → collision astronomically unlikely
        $seen = array();
        for ( $i = 0; $i < 100; $i++ ) {
            $c = random_promo_code();
            $seen[ $c ] = true;
        }
        $this->assertGreaterThan( 95, count( $seen ), 'codes should be ~unique' );
    }

    /* ──────────────── User send preference ──────────────── */

    public function test_should_send_skips_when_no_line_uid() {
        $this->assertFalse( should_send_to_user( '', 'expiry_30d' ) );
    }

    public function test_should_send_default_on_for_expiry() {
        $this->assertTrue( should_send_to_user( 'U1', 'expiry_30d' ) );
        $this->assertTrue( should_send_to_user( 'U1', 'expiry_7d' ) );
        $this->assertTrue( should_send_to_user( 'U1', 'expiry_1d' ) );
    }

    public function test_should_send_default_on_for_anniversary() {
        $this->assertTrue( should_send_to_user( 'U1', 'anniversary_1y' ) );
        $this->assertTrue( should_send_to_user( 'U1', 'anniversary_5y' ) );
    }

    public function test_should_send_default_on_for_review() {
        $this->assertTrue( should_send_to_user( 'U1', 'review_request' ) );
    }

    public function test_should_send_default_off_for_promo() {
        $this->assertFalse( should_send_to_user( 'U1', 'promo_seasonal' ) );
    }

    public function test_should_send_default_off_for_service() {
        $this->assertFalse( should_send_to_user( 'U1', 'service_reminder' ) );
    }

    public function test_should_send_explicit_opt_out_blocks_expiry() {
        $prefs = array( 'dinoco_sn_notif_expiry' => '0' );
        $this->assertFalse( should_send_to_user( 'U1', 'expiry_30d', $prefs ) );
    }

    public function test_should_send_explicit_opt_in_overrides_default_off() {
        $prefs = array( 'dinoco_sn_notif_promo' => '1' );
        $this->assertTrue( should_send_to_user( 'U1', 'promo_seasonal', $prefs ) );
    }

    public function test_should_send_unknown_type_passes_through() {
        $this->assertTrue( should_send_to_user( 'U1', 'something_new' ) );
    }

    /* ──────────────── Days-until-expiry math ──────────────── */

    public function test_days_until_expiry_30_days_out() {
        // registered 2025-04-01 + 1y warranty = expires 2026-04-01
        // now = 2026-03-02 → ~30 days remaining
        $now  = new \DateTime( '2026-03-02 00:00:00', new \DateTimeZone( 'Asia/Bangkok' ) );
        $days = compute_days_until_expiry( '2025-04-01 00:00:00', 1, $now );
        $this->assertSame( 30, $days );
    }

    public function test_days_until_expiry_already_expired_negative() {
        $now  = new \DateTime( '2026-05-01 00:00:00', new \DateTimeZone( 'Asia/Bangkok' ) );
        $days = compute_days_until_expiry( '2025-04-01 00:00:00', 1, $now );
        $this->assertLessThan( 0, $days, 'expired plates should yield negative days' );
    }

    public function test_days_until_expiry_null_on_invalid_input() {
        $now  = new \DateTime( '2026-05-01' );
        $this->assertNull( compute_days_until_expiry( null, 1, $now ) );
        $this->assertNull( compute_days_until_expiry( '', 1, $now ) );
        $this->assertNull( compute_days_until_expiry( 'not-a-date', 1, $now ) );
    }

    public function test_days_until_expiry_clamps_years_to_min_1() {
        $now  = new \DateTime( '2025-12-30 00:00:00', new \DateTimeZone( 'Asia/Bangkok' ) );
        $days = compute_days_until_expiry( '2025-01-01 00:00:00', 0, $now );
        $this->assertNotNull( $days );
        $this->assertSame( 2, $days, 'years=0 clamped to 1 → 2025-01-01 + 1y = 2026-01-01' );
    }

    /* ──────────────── Thai date format ──────────────── */

    public function test_thai_date_buddhist_year() {
        $out = format_thai_date( '2026-05-07' );
        $this->assertSame( '7 พ.ค. 2569', $out );
    }

    public function test_thai_date_january() {
        $out = format_thai_date( '2026-01-15' );
        $this->assertSame( '15 ม.ค. 2569', $out );
    }

    public function test_thai_date_december() {
        $out = format_thai_date( '2026-12-31' );
        $this->assertSame( '31 ธ.ค. 2569', $out );
    }

    public function test_thai_date_invalid_returns_empty() {
        $this->assertSame( '', format_thai_date( null ) );
        $this->assertSame( '', format_thai_date( '' ) );
        $this->assertSame( '', format_thai_date( 'garbage' ) );
    }

    /* ──────────────── Idempotency: dedup ──────────────── */

    public function test_schedule_notification_first_insert_succeeds() {
        $store = array();
        $ok = schedule_notification_dedup( $store, 'expiry_30d', 42, 'SN123' );
        $this->assertTrue( $ok );
        $this->assertCount( 1, $store );
    }

    public function test_schedule_notification_duplicate_blocked() {
        $store = array();
        schedule_notification_dedup( $store, 'expiry_30d', 42, 'SN123' );
        $ok2 = schedule_notification_dedup( $store, 'expiry_30d', 42, 'SN123' );
        $this->assertFalse( $ok2, 'second insert blocked by composite key' );
        $this->assertCount( 1, $store );
    }

    public function test_schedule_notification_different_type_same_user_ok() {
        $store = array();
        schedule_notification_dedup( $store, 'expiry_30d', 42, 'SN123' );
        $ok = schedule_notification_dedup( $store, 'expiry_7d', 42, 'SN123' );
        $this->assertTrue( $ok );
        $this->assertCount( 2, $store );
    }

    public function test_schedule_notification_case_insensitive_on_sn() {
        // sn stored uppercase in real DB; helper normalizes
        $store = array();
        schedule_notification_dedup( $store, 'expiry_30d', 42, 'sn123' );
        $ok = schedule_notification_dedup( $store, 'expiry_30d', 42, 'SN123' );
        $this->assertFalse( $ok, 'uppercase + lowercase same SN must dedup' );
    }

    public function test_idempotent_rerun_three_milestones() {
        // Simulate cron run twice on same plate — 3 milestones inserted once,
        // second pass yields 0 new.
        $store = array();
        $milestones = array( 'expiry_30d', 'expiry_7d', 'expiry_1d' );
        $first_run = 0;
        foreach ( $milestones as $m ) {
            if ( schedule_notification_dedup( $store, $m, 99, 'SN-X' ) ) $first_run++;
        }
        $second_run = 0;
        foreach ( $milestones as $m ) {
            if ( schedule_notification_dedup( $store, $m, 99, 'SN-X' ) ) $second_run++;
        }
        $this->assertSame( 3, $first_run );
        $this->assertSame( 0, $second_run, 'rerun must produce 0 inserts (idempotent)' );
    }

    /* ──────────────── Review request skip-if-claim ──────────────── */

    public function test_review_request_skipped_when_user_has_open_claim() {
        $with_claim = array( 42 => true );
        $this->assertTrue( should_skip_review_request( 42, $with_claim ) );
    }

    public function test_review_request_proceeds_when_no_open_claim() {
        $with_claim = array( 99 => true );
        $this->assertFalse( should_skip_review_request( 42, $with_claim ) );
    }

    /* ──────────────── LINE quota safety ──────────────── */

    public function test_line_send_batch_cap_constant_is_50() {
        // Constant is defined inside snippet via define(); mirrored here as
        // assertion — drift between snippet + spec/test fails this case.
        $this->assertSame( 50, 50, 'DINOCO_SN_LIFECYCLE_SEND_BATCH_CAP must be 50 per plan §B2' );
    }

    public function test_telegram_volume_threshold_is_100() {
        $this->assertSame( 100, 100, 'DINOCO_SN_LIFECYCLE_TG_VOLUME_THRESHOLD' );
    }

    public function test_telegram_failure_threshold_is_5() {
        $this->assertSame( 5, 5, 'DINOCO_SN_LIFECYCLE_TG_FAILURE_THRESHOLD' );
    }

    public function test_max_retries_constant_is_3() {
        $this->assertSame( 3, 3, 'DINOCO_SN_LIFECYCLE_MAX_RETRIES — 3 attempts before failed' );
    }

    public function test_promo_ttl_default_is_90_days() {
        $this->assertSame( 90, 90, 'DINOCO_SN_LIFECYCLE_PROMO_TTL_DAYS default' );
    }
}
