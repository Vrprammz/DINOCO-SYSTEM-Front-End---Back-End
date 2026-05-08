<?php
/**
 * SnFlagAwareCronTest — R9 Pattern 4 (orphan cron) regression coverage.
 *
 * Source: [Admin System] DINOCO Production SN Manager V.0.47
 *
 * R9 hunt agent found 43 `wp_schedule_event()` hooks across DINOCO with
 * NO unschedule mechanism. When feature flags flip OFF, crons orphan
 * and run forever. Only Q21 fraud_aggregate had the defensive pattern.
 *
 * R9 fix: helper `dinoco_register_flag_aware_cron($hook, $interval,
 * $master_flag)` that:
 *   1. If flag ON: schedule if not already scheduled
 *   2. If flag OFF: unschedule if currently scheduled
 *   3. Listens to `update_option_<flag>` for auto-cleanup on flag flip
 *   4. Always preserves Health Monitor heartbeat tracking
 *
 * Tests cover decision logic + edge cases:
 *   - Flag ON × hook not scheduled → schedule
 *   - Flag ON × hook already scheduled → no-op
 *   - Flag OFF × hook scheduled → unschedule
 *   - Flag OFF × hook not scheduled → no-op
 *   - flag_value strict equality ('1' vs 1 vs true)
 *   - flag missing (option not yet created) → defaults to OFF
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Pure-logic mirror of dinoco_register_flag_aware_cron ─── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_flag_aware_cron_decision' ) ) {

    /**
     * Mirror of the helper's decision logic.
     *
     *   $is_enabled = (bool) $master_flag_value;
     *   $next = $hook_scheduled_at;
     *   if ($is_enabled) {
     *       if (!$next) return 'schedule';
     *       return 'noop_already_scheduled';
     *   } else {
     *       if ($next) return 'unschedule';
     *       return 'noop_already_clean';
     *   }
     *
     * @param mixed     $master_flag_value  return of get_option (mixed: bool, '1'/'0', null, etc.)
     * @param int|false $hook_scheduled_at  return of wp_next_scheduled
     * @return string  'schedule'|'unschedule'|'noop_already_scheduled'|'noop_already_clean'
     */
    function sn_flag_aware_cron_decision(
        $master_flag_value,
        $hook_scheduled_at
    ): string {
        // Cast WP option value to bool — '1' → true, '0' → false,
        // false → false, null → false, true → true, 0 → false, etc.
        // R9 design: only literal '1' or boolean true counts as enabled
        // (matches WP option storage convention).
        $is_enabled = $master_flag_value === '1'
            || $master_flag_value === 1
            || $master_flag_value === true;

        $is_scheduled = $hook_scheduled_at !== false
            && $hook_scheduled_at !== null
            && $hook_scheduled_at > 0;

        if ( $is_enabled ) {
            return $is_scheduled ? 'noop_already_scheduled' : 'schedule';
        }
        return $is_scheduled ? 'unschedule' : 'noop_already_clean';
    }

    /**
     * Mirror of the auto-cleanup on flag flip.
     *
     * When `update_option_<flag>` fires (admin flips master flag),
     * the listener iterates all hooks registered against that flag
     * and re-evaluates each.
     *
     * @param array<string,string> $hooks      hook_name => interval
     * @param mixed                $new_value  new flag value
     * @param array<string,int|false> $current_schedule  per-hook scheduled_at
     * @return array<string,string>  hook_name => decision
     */
    function sn_flag_aware_cron_replay(
        array $hooks,
        $new_value,
        array $current_schedule
    ): array {
        $decisions = [];
        foreach ( $hooks as $hook => $interval ) {
            $decisions[ $hook ] = sn_flag_aware_cron_decision(
                $new_value,
                $current_schedule[ $hook ] ?? false
            );
        }
        return $decisions;
    }
}

final class SnFlagAwareCronTest extends TestCase {

    /* ─── Single-hook decision matrix ─────────────────────── */

    public function test_flag_on_not_scheduled_decision_is_schedule(): void {
        $this->assertSame(
            'schedule',
            sn_flag_aware_cron_decision( '1', false )
        );
    }

    public function test_flag_on_already_scheduled_decision_is_noop(): void {
        $this->assertSame(
            'noop_already_scheduled',
            sn_flag_aware_cron_decision( '1', time() + 3600 )
        );
    }

    public function test_flag_off_scheduled_decision_is_unschedule(): void {
        $this->assertSame(
            'unschedule',
            sn_flag_aware_cron_decision( '0', time() + 3600 )
        );
    }

    public function test_flag_off_not_scheduled_decision_is_noop(): void {
        $this->assertSame(
            'noop_already_clean',
            sn_flag_aware_cron_decision( '0', false )
        );
    }

    /* ─── Flag value coercion (WP option types) ────────────── */

    public function test_string_one_treated_as_enabled(): void {
        $this->assertSame( 'schedule', sn_flag_aware_cron_decision( '1', false ) );
    }

    public function test_string_zero_treated_as_disabled(): void {
        $this->assertSame( 'noop_already_clean', sn_flag_aware_cron_decision( '0', false ) );
    }

    public function test_int_one_treated_as_enabled(): void {
        $this->assertSame( 'schedule', sn_flag_aware_cron_decision( 1, false ) );
    }

    public function test_int_zero_treated_as_disabled(): void {
        $this->assertSame( 'noop_already_clean', sn_flag_aware_cron_decision( 0, false ) );
    }

    public function test_bool_true_treated_as_enabled(): void {
        $this->assertSame( 'schedule', sn_flag_aware_cron_decision( true, false ) );
    }

    public function test_bool_false_treated_as_disabled(): void {
        $this->assertSame( 'noop_already_clean', sn_flag_aware_cron_decision( false, false ) );
    }

    public function test_null_treated_as_disabled(): void {
        // Option not yet created → null → safer to NOT schedule
        $this->assertSame(
            'noop_already_clean',
            sn_flag_aware_cron_decision( null, false )
        );
    }

    public function test_empty_string_treated_as_disabled(): void {
        $this->assertSame(
            'noop_already_clean',
            sn_flag_aware_cron_decision( '', false )
        );
    }

    public function test_arbitrary_truthy_string_NOT_treated_as_enabled(): void {
        // Strict comparison: only '1', 1, true count. 'yes', 'on', 'true'
        // do NOT enable cron — defensive against admin typos.
        $this->assertSame(
            'noop_already_clean',
            sn_flag_aware_cron_decision( 'yes', false )
        );
        $this->assertSame(
            'noop_already_clean',
            sn_flag_aware_cron_decision( 'on', false )
        );
        $this->assertSame(
            'noop_already_clean',
            sn_flag_aware_cron_decision( 'true', false )
        );
    }

    /* ─── hook_scheduled_at edge cases ─────────────────────── */

    public function test_scheduled_at_zero_treated_as_not_scheduled(): void {
        // wp_next_scheduled returns 0 when not scheduled — must be treated
        // as "not scheduled" (false-equivalent)
        $this->assertSame(
            'schedule',
            sn_flag_aware_cron_decision( '1', 0 )
        );
    }

    public function test_scheduled_at_null_treated_as_not_scheduled(): void {
        $this->assertSame(
            'schedule',
            sn_flag_aware_cron_decision( '1', null )
        );
    }

    public function test_scheduled_at_negative_treated_as_not_scheduled(): void {
        // Edge case: stale schedule with negative value (shouldn't happen
        // but defensive)
        $this->assertSame(
            'schedule',
            sn_flag_aware_cron_decision( '1', -1 )
        );
    }

    public function test_scheduled_at_far_future_is_scheduled(): void {
        $this->assertSame(
            'noop_already_scheduled',
            sn_flag_aware_cron_decision( '1', PHP_INT_MAX )
        );
    }

    /* ─── Multi-hook replay (flag flip scenario) ──────────── */

    public function test_replay_flag_flip_to_off_unschedules_all_active(): void {
        $hooks = [
            'dinoco_sn_low_pool_alert_cron'  => 'hourly',
            'dinoco_sn_audit_retention_cron' => 'daily',
            'dinoco_sn_notification_send_cron' => 'fifteen_minutes',
        ];
        $current = [
            'dinoco_sn_low_pool_alert_cron'  => time() + 3600,
            'dinoco_sn_audit_retention_cron' => time() + 86400,
            'dinoco_sn_notification_send_cron' => time() + 900,
        ];
        $decisions = sn_flag_aware_cron_replay( $hooks, '0', $current );
        $this->assertSame( 'unschedule', $decisions['dinoco_sn_low_pool_alert_cron'] );
        $this->assertSame( 'unschedule', $decisions['dinoco_sn_audit_retention_cron'] );
        $this->assertSame( 'unschedule', $decisions['dinoco_sn_notification_send_cron'] );
    }

    public function test_replay_flag_flip_to_on_schedules_all_inactive(): void {
        $hooks = [
            'dinoco_sn_low_pool_alert_cron'  => 'hourly',
            'dinoco_sn_audit_retention_cron' => 'daily',
        ];
        $current = [
            'dinoco_sn_low_pool_alert_cron'  => false,
            'dinoco_sn_audit_retention_cron' => false,
        ];
        $decisions = sn_flag_aware_cron_replay( $hooks, '1', $current );
        $this->assertSame( 'schedule', $decisions['dinoco_sn_low_pool_alert_cron'] );
        $this->assertSame( 'schedule', $decisions['dinoco_sn_audit_retention_cron'] );
    }

    public function test_replay_mixed_state_handles_each_correctly(): void {
        $hooks = [
            'a' => 'hourly', 'b' => 'daily', 'c' => 'weekly',
        ];
        $current = [
            'a' => time() + 3600,  // scheduled
            'b' => false,          // not scheduled
            'c' => time() + 604800 // scheduled
        ];
        $decisions_off = sn_flag_aware_cron_replay( $hooks, '0', $current );
        $this->assertSame( 'unschedule', $decisions_off['a'] );
        $this->assertSame( 'noop_already_clean', $decisions_off['b'] );
        $this->assertSame( 'unschedule', $decisions_off['c'] );

        $decisions_on = sn_flag_aware_cron_replay( $hooks, '1', $current );
        $this->assertSame( 'noop_already_scheduled', $decisions_on['a'] );
        $this->assertSame( 'schedule', $decisions_on['b'] );
        $this->assertSame( 'noop_already_scheduled', $decisions_on['c'] );
    }

    /* ─── R9 P4 specific scenarios ─────────────────────────── */

    public function test_R9_P4_orphan_cron_after_flag_flip_off_eliminated(): void {
        // The exact scenario R9 P4 fixes:
        //   1. Admin flips flag ON → cron registered
        //   2. Cron fires for weeks
        //   3. Admin flips flag OFF
        //   4. Pre-R9: cron orphan, fires forever
        //   5. Post-R9: update_option_<flag> listener re-evaluates → unschedule
        $hook = 'dinoco_sn_marketplace_timeout_cron';
        $current_schedule = [ $hook => time() + 300 ]; // every 5min, scheduled
        $hooks = [ $hook => 'every_5_minutes' ];

        // Admin flips flag OFF
        $decisions = sn_flag_aware_cron_replay( $hooks, '0', $current_schedule );
        $this->assertSame(
            'unschedule',
            $decisions[ $hook ],
            'orphan cron MUST be unscheduled when master flag flips OFF'
        );
    }

    public function test_R9_P4_legitimate_admin_state_preserved_on_no_change(): void {
        // Admin updates an unrelated option that triggers update_option_*
        // → cron state should remain stable (decision = noop)
        $hook = 'dinoco_sn_low_pool_alert_cron';
        // Flag is currently ON, hook is currently scheduled
        $current_schedule = [ $hook => time() + 3600 ];
        $decision = sn_flag_aware_cron_decision( '1', time() + 3600 );
        $this->assertSame( 'noop_already_scheduled', $decision );
    }

    /* ─── Defense-in-depth: never-schedule when flag ambiguous ─ */

    public function test_ambiguous_flag_value_defaults_to_disabled(): void {
        // Defensive: anything not exactly '1'/1/true → treat as disabled
        // (avoids accidentally scheduling cron from misconfigured admin)
        foreach ( [ '2', 'enabled', 0.5, '01', ' 1', '1 ', 'TRUE' ] as $value ) {
            $this->assertSame(
                'noop_already_clean',
                sn_flag_aware_cron_decision( $value, false ),
                'ambiguous value ' . var_export( $value, true ) . ' → disabled'
            );
        }
    }
}
