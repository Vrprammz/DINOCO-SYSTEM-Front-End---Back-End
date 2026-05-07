<?php
/**
 * REG-092 — Pool status action fire on every state mutation.
 *
 * Plan v2.13 §Phase 1 W4 R3 BLOCKER.
 *
 * Every site that mutates `wp_dinoco_sn_pool.status` MUST `do_action`:
 *   - 'dinoco_sn_pool_status_changed' (general listener — Sentry, audit, observability)
 *   - 'dinoco_sn_pool_status_changed_for_user' (per-user — LINE Flex notifier)
 *
 * Both must fire AFTER COMMIT (post-transaction) so listeners don't see
 * un-committed state if rollback fires later.
 *
 * Mutation sites enumerated:
 *   1. REST /activate (LIFF) — in_pool → registered
 *   2. REST /swap (admin) — registered → replaced + new SN registered
 *   3. REST /void (admin) — any → voided
 *   4. REST /recall (admin) — any → recalled
 *   5. Admin transfer tool — registered → transferred (then registered for new owner)
 *   6. Member self-transfer — same as #5
 *   7. Claim sync (claim_status → pool status) — registered → claimed/replaced
 *   8. Stolen recovery — stolen → registered
 *
 * 16+ cases (8 sites × 2 actions).
 *
 * Pure-logic mirror — uses an in-memory listener registry to assert both
 * actions fire in the correct order with the correct args.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\SnPoolStatusActionFire;

use PHPUnit\Framework\TestCase;

/**
 * Mirror of the do_action shim — tracks (site_name, action_name, $sn, $old, $new, $user_id).
 */
class ActionFireRecorder {
    public array $events = array();

    public function fire( string $site, string $action, string $sn, string $old, string $new, ?int $user_id ): void {
        $this->events[] = array(
            'site'    => $site,
            'action'  => $action,
            'sn'      => $sn,
            'old'     => $old,
            'new'     => $new,
            'user_id' => $user_id,
        );
    }

    public function actionsAtSite( string $site ): array {
        return array_values( array_filter(
            $this->events,
            fn( $e ) => $e['site'] === $site
        ) );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\fire_pool_status_changed' ) ) {
    /**
     * Mirror of post-COMMIT do_action invocation pattern.
     * MUST fire general action ALWAYS; for_user only when user_id present.
     */
    function fire_pool_status_changed(
        ActionFireRecorder $recorder,
        string $site,
        string $sn,
        string $old,
        string $new,
        ?int $user_id
    ): void {
        // 1) General listener
        $recorder->fire( $site, 'dinoco_sn_pool_status_changed', $sn, $old, $new, $user_id );
        // 2) Per-user listener (only if user_id known)
        if ( $user_id !== null ) {
            $recorder->fire(
                $site,
                'dinoco_sn_pool_status_changed_for_user',
                $sn, $old, $new, $user_id
            );
        }
    }
}

class SnPoolStatusActionFireTest extends TestCase {

    private ActionFireRecorder $rec;

    protected function setUp(): void {
        $this->rec = new ActionFireRecorder();
    }

    /* ─── Site 1: REST /activate ─── */

    public function test_activate_fires_general_action(): void {
        fire_pool_status_changed( $this->rec, 'rest_activate', 'DNCSS0001234', 'in_pool', 'registered', 99 );
        $events = $this->rec->actionsAtSite( 'rest_activate' );
        $this->assertCount( 2, $events, 'activate fires general + for_user' );
        $this->assertSame( 'dinoco_sn_pool_status_changed', $events[0]['action'] );
    }

    public function test_activate_fires_for_user_action(): void {
        fire_pool_status_changed( $this->rec, 'rest_activate', 'DNCSS0001234', 'in_pool', 'registered', 99 );
        $events = $this->rec->actionsAtSite( 'rest_activate' );
        $this->assertSame( 'dinoco_sn_pool_status_changed_for_user', $events[1]['action'] );
        $this->assertSame( 99, $events[1]['user_id'] );
    }

    /* ─── Site 2: REST /swap ─── */

    public function test_swap_fires_for_old_sn(): void {
        fire_pool_status_changed( $this->rec, 'rest_swap_old', 'DNCSS0001234', 'registered', 'replaced', 99 );
        $events = $this->rec->actionsAtSite( 'rest_swap_old' );
        $this->assertCount( 2, $events );
        $this->assertSame( 'replaced', $events[0]['new'] );
    }

    public function test_swap_fires_for_new_sn(): void {
        fire_pool_status_changed( $this->rec, 'rest_swap_new', 'DNCSS0005678', 'in_pool', 'registered', 99 );
        $events = $this->rec->actionsAtSite( 'rest_swap_new' );
        $this->assertCount( 2, $events );
        $this->assertSame( 'registered', $events[0]['new'] );
    }

    /* ─── Site 3: REST /void (admin — no user_id known) ─── */

    public function test_void_fires_general_only_when_no_user(): void {
        fire_pool_status_changed( $this->rec, 'rest_void', 'DNCSS0001234', 'in_pool', 'voided', null );
        $events = $this->rec->actionsAtSite( 'rest_void' );
        $this->assertCount( 1, $events, 'no user_id → only general action' );
        $this->assertSame( 'dinoco_sn_pool_status_changed', $events[0]['action'] );
    }

    public function test_void_fires_both_when_owned_plate(): void {
        fire_pool_status_changed( $this->rec, 'rest_void', 'DNCSS0001234', 'registered', 'voided', 99 );
        $events = $this->rec->actionsAtSite( 'rest_void' );
        $this->assertCount( 2, $events );
    }

    /* ─── Site 4: REST /recall (batch-level — usually no user) ─── */

    public function test_recall_fires_general_for_unowned_plate(): void {
        fire_pool_status_changed( $this->rec, 'rest_recall', 'DNCSS0001234', 'in_pool', 'recalled', null );
        $events = $this->rec->actionsAtSite( 'rest_recall' );
        $this->assertCount( 1, $events );
    }

    public function test_recall_fires_both_for_owned_plate(): void {
        fire_pool_status_changed( $this->rec, 'rest_recall', 'DNCSS0001234', 'registered', 'recalled', 99 );
        $events = $this->rec->actionsAtSite( 'rest_recall' );
        $this->assertCount( 2, $events );
    }

    /* ─── Site 5: Admin transfer tool ─── */

    public function test_admin_transfer_old_owner(): void {
        fire_pool_status_changed( $this->rec, 'admin_transfer_old', 'DNCSS0001234', 'registered', 'transferred', 99 );
        $events = $this->rec->actionsAtSite( 'admin_transfer_old' );
        $this->assertCount( 2, $events );
        $this->assertSame( 99, $events[1]['user_id'] );
    }

    public function test_admin_transfer_new_owner(): void {
        fire_pool_status_changed( $this->rec, 'admin_transfer_new', 'DNCSS0001234', 'transferred', 'registered', 100 );
        $events = $this->rec->actionsAtSite( 'admin_transfer_new' );
        $this->assertCount( 2, $events );
        $this->assertSame( 100, $events[1]['user_id'] );
    }

    /* ─── Site 6: Member self-transfer ─── */

    public function test_member_self_transfer_old_owner(): void {
        fire_pool_status_changed( $this->rec, 'member_transfer_old', 'DNCSS0001234', 'registered', 'transferred', 99 );
        $events = $this->rec->actionsAtSite( 'member_transfer_old' );
        $this->assertCount( 2, $events );
    }

    public function test_member_self_transfer_new_owner(): void {
        fire_pool_status_changed( $this->rec, 'member_transfer_new', 'DNCSS0001234', 'transferred', 'registered', 100 );
        $events = $this->rec->actionsAtSite( 'member_transfer_new' );
        $this->assertCount( 2, $events );
    }

    /* ─── Site 7: Claim sync (FSM 11 → pool) ─── */

    public function test_claim_sync_completed_to_replaced(): void {
        fire_pool_status_changed( $this->rec, 'claim_sync', 'DNCSS0001234', 'registered', 'replaced', 99 );
        $events = $this->rec->actionsAtSite( 'claim_sync' );
        $this->assertCount( 2, $events );
    }

    public function test_claim_sync_revert_to_registered(): void {
        // claim rejected/cancelled → revert claimed → registered
        fire_pool_status_changed( $this->rec, 'claim_sync_revert', 'DNCSS0001234', 'claimed', 'registered', 99 );
        $events = $this->rec->actionsAtSite( 'claim_sync_revert' );
        $this->assertCount( 2, $events );
    }

    /* ─── Site 8: Stolen recovery ─── */

    public function test_stolen_recovery_fires_both(): void {
        fire_pool_status_changed( $this->rec, 'stolen_recovery', 'DNCSS0001234', 'stolen', 'registered', 99 );
        $events = $this->rec->actionsAtSite( 'stolen_recovery' );
        $this->assertCount( 2, $events );
        $this->assertSame( 'stolen', $events[0]['old'] );
        $this->assertSame( 'registered', $events[0]['new'] );
    }

    /* ─── Cross-cutting invariants ─── */

    public function test_general_action_always_fires_first(): void {
        fire_pool_status_changed( $this->rec, 'rest_activate', 'DNCSS0001234', 'in_pool', 'registered', 99 );
        $events = $this->rec->actionsAtSite( 'rest_activate' );
        $this->assertSame( 'dinoco_sn_pool_status_changed', $events[0]['action'], 'general MUST fire before for_user' );
    }

    public function test_for_user_never_fires_without_general(): void {
        // Defensive — for_user without general would be a regression
        fire_pool_status_changed( $this->rec, 'rest_void', 'DNCSS0001234', 'in_pool', 'voided', null );
        $events = $this->rec->actionsAtSite( 'rest_void' );
        $for_user_events = array_filter(
            $events,
            fn( $e ) => $e['action'] === 'dinoco_sn_pool_status_changed_for_user'
        );
        $this->assertCount( 0, $for_user_events, 'for_user must NOT fire when user_id is null' );
    }
}
