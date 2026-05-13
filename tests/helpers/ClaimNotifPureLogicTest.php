<?php
/**
 * ClaimNotifPureLogicTest — pure-logic tests for Claim Lifecycle Notifier
 * (Phase 1 W1 Task 1.6 partial — Sprint 5C).
 *
 * Source of truth: [Admin System] DINOCO Claim Lifecycle Notifier V.0.2
 *   - dinoco_claim_notif_status_to_slug($status)
 *   - dinoco_claim_notif_should_send($from_status, $to_status)
 *   - dinoco_claim_notif_dedup_key($claim_id, $to_status)
 *
 * We re-declare helpers INLINE (no WP bootstrap, no DB, no HTTP) — same
 * pattern as CurrencyTest / HierarchyTest / FSMValidationTest. When the
 * snippets split into composer packages, swap to `require` + real source.
 *
 * Coverage:
 *   • slug normalization (boss spec §5.1 11 statuses, edge cases)
 *   • should-send decision table (skip "In Transit to Company", no-change,
 *     empty `to`, normal transitions)
 *   • dedup key uniqueness across (claim, status) pairs
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// ─── Inline pure-logic helpers (source: Claim Lifecycle Notifier V.0.2) ───

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_claim_notif_status_to_slug' ) ) {
    function dinoco_claim_notif_status_to_slug( $status ) {
        $s = trim( (string) $status );
        if ( $s === '' ) return '';
        $slug = strtolower( $s );
        $slug = preg_replace( '/[\s\-]+/', '_', $slug );
        $slug = preg_replace( '/[^a-z0-9_]/', '', $slug );
        $slug = preg_replace( '/_+/', '_', $slug );
        return trim( $slug, '_' );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_claim_notif_should_send' ) ) {
    function dinoco_claim_notif_should_send( $from_status, $to_status ) {
        $to = trim( (string) $to_status );
        if ( $to === '' ) {
            return array( 'should' => false, 'reason' => 'empty_to' );
        }
        if ( trim( (string) $from_status ) === $to ) {
            return array( 'should' => false, 'reason' => 'no_change' );
        }
        if ( dinoco_claim_notif_status_to_slug( $to ) === 'in_transit_to_company' ) {
            return array( 'should' => false, 'reason' => 'skip_by_design' );
        }
        return array( 'should' => true, 'reason' => 'ok' );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_claim_notif_dedup_key' ) ) {
    function dinoco_claim_notif_dedup_key( $claim_id, $to_status ) {
        $slug = dinoco_claim_notif_status_to_slug( $to_status );
        return 'dnc_claim_notif_dedup_' . (int) $claim_id . '_' . $slug;
    }
}


final class ClaimNotifPureLogicTest extends TestCase {

    // ════════════════════════════════════════════════════════════════════
    // Slug normalization — spec §5.1 11 canonical statuses
    // ════════════════════════════════════════════════════════════════════

    public function test_slug_for_11_canonical_statuses(): void {
        $cases = array(
            'Registered in System'             => 'registered_in_system',
            'Awaiting Customer Shipment'       => 'awaiting_customer_shipment',
            'In Transit to Company'            => 'in_transit_to_company',
            'Received at Company'              => 'received_at_company',
            'Under Maintenance'                => 'under_maintenance',
            'Maintenance Completed'            => 'maintenance_completed',
            'Repaired Item Dispatched'         => 'repaired_item_dispatched',
            'Pending Issue Verification'       => 'pending_issue_verification',
            'Replacement Approved'             => 'replacement_approved',
            'Replacement Shipped'              => 'replacement_shipped',
            'Replacement Rejected by Company'  => 'replacement_rejected_by_company',
        );
        foreach ( $cases as $input => $expected ) {
            $this->assertSame( $expected, dinoco_claim_notif_status_to_slug( $input ),
                "Slug for [$input] should be [$expected]" );
        }
    }

    public function test_slug_collapses_multiple_spaces(): void {
        $this->assertSame( 'under_maintenance',
            dinoco_claim_notif_status_to_slug( '  Under   Maintenance  ' ) );
    }

    public function test_slug_replaces_hyphen_with_underscore(): void {
        $this->assertSame( 'awaiting_customer',
            dinoco_claim_notif_status_to_slug( 'Awaiting-Customer' ) );
    }

    public function test_slug_strips_non_alphanumeric(): void {
        // Special chars (#, (, ), !) are stripped silently. Whitespace and
        // hyphens become underscores. Adjacent underscores collapse. So
        // 'Status #5 (active)!' → 'status_#5_(active)!' → 'status_5_active'.
        $this->assertSame( 'status_5_active',
            dinoco_claim_notif_status_to_slug( 'Status #5 (active)!' ) );
    }

    public function test_slug_empty_input_returns_empty(): void {
        $this->assertSame( '', dinoco_claim_notif_status_to_slug( '' ) );
        $this->assertSame( '', dinoco_claim_notif_status_to_slug( '   ' ) );
    }

    public function test_slug_handles_thai_label_gracefully(): void {
        // Thai chars are non-ASCII, expected to be stripped. Empty result is
        // acceptable — callers MUST pass long-form English status.
        $this->assertSame( '', dinoco_claim_notif_status_to_slug( 'รอตรวจสอบ' ) );
    }

    public function test_slug_idempotent_on_already_slugged_input(): void {
        $this->assertSame( 'under_maintenance',
            dinoco_claim_notif_status_to_slug( 'under_maintenance' ) );
    }

    public function test_slug_strips_leading_trailing_underscores(): void {
        $this->assertSame( 'under_maintenance',
            dinoco_claim_notif_status_to_slug( '__Under Maintenance__' ) );
    }

    // ════════════════════════════════════════════════════════════════════
    // Should-send decision table — spec §5.1 + HR4
    // ════════════════════════════════════════════════════════════════════

    public function test_send_for_normal_transition(): void {
        $r = dinoco_claim_notif_should_send( 'Pending', 'Under Maintenance' );
        $this->assertTrue( $r['should'] );
        $this->assertSame( 'ok', $r['reason'] );
    }

    public function test_skip_in_transit_to_company(): void {
        $r = dinoco_claim_notif_should_send( 'Awaiting Customer Shipment', 'In Transit to Company' );
        $this->assertFalse( $r['should'] );
        $this->assertSame( 'skip_by_design', $r['reason'] );
    }

    public function test_skip_no_change_terminal_idempotency(): void {
        $r = dinoco_claim_notif_should_send( 'Maintenance Completed', 'Maintenance Completed' );
        $this->assertFalse( $r['should'] );
        $this->assertSame( 'no_change', $r['reason'] );
    }

    public function test_skip_empty_to_status(): void {
        $r = dinoco_claim_notif_should_send( 'Pending', '' );
        $this->assertFalse( $r['should'] );
        $this->assertSame( 'empty_to', $r['reason'] );
    }

    public function test_skip_whitespace_only_to_status(): void {
        $r = dinoco_claim_notif_should_send( 'Pending', '   ' );
        $this->assertFalse( $r['should'] );
        $this->assertSame( 'empty_to', $r['reason'] );
    }

    public function test_send_from_empty_to_real_status_initial_transition(): void {
        // First-time status set: from='', to='Pending' — should still notify
        $r = dinoco_claim_notif_should_send( '', 'Registered in System' );
        $this->assertTrue( $r['should'] );
        $this->assertSame( 'ok', $r['reason'] );
    }

    public function test_send_all_10_notifiable_statuses(): void {
        $notifiable = array(
            'Registered in System',
            'Awaiting Customer Shipment',
            'Received at Company',
            'Under Maintenance',
            'Maintenance Completed',
            'Repaired Item Dispatched',
            'Pending Issue Verification',
            'Replacement Approved',
            'Replacement Shipped',
            'Replacement Rejected by Company',
        );
        foreach ( $notifiable as $s ) {
            $r = dinoco_claim_notif_should_send( 'Pending', $s );
            $this->assertTrue( $r['should'],
                "Status [$s] should trigger send" );
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // Dedup key uniqueness
    // ════════════════════════════════════════════════════════════════════

    public function test_dedup_key_unique_per_claim(): void {
        $k1 = dinoco_claim_notif_dedup_key( 1001, 'Under Maintenance' );
        $k2 = dinoco_claim_notif_dedup_key( 1002, 'Under Maintenance' );
        $this->assertNotSame( $k1, $k2 );
    }

    public function test_dedup_key_unique_per_status(): void {
        $k1 = dinoco_claim_notif_dedup_key( 1001, 'Under Maintenance' );
        $k2 = dinoco_claim_notif_dedup_key( 1001, 'Maintenance Completed' );
        $this->assertNotSame( $k1, $k2 );
    }

    public function test_dedup_key_format(): void {
        $k = dinoco_claim_notif_dedup_key( 1001, 'Under Maintenance' );
        $this->assertSame( 'dnc_claim_notif_dedup_1001_under_maintenance', $k );
    }

    public function test_dedup_key_within_wp_option_name_limit(): void {
        // WP option_name VARCHAR(191) — transient keys (with prefix) MUST stay under.
        // Worst-case status: longest from spec = "Replacement Rejected by Company"
        $k = dinoco_claim_notif_dedup_key( 999999999, 'Replacement Rejected by Company' );
        $this->assertLessThan( 172, strlen( $k ),
            'Dedup key must fit WP transient prefix budget' );
    }

    public function test_dedup_key_negative_claim_id_coerced_to_int(): void {
        $k = dinoco_claim_notif_dedup_key( -5, 'Under Maintenance' );
        // (int)-5 = -5 — key still deterministic + parseable
        $this->assertStringContainsString( '-5', $k );
    }
}
