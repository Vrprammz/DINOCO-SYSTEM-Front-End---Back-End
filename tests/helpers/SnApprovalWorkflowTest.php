<?php
/**
 * SnApprovalWorkflowTest — Phase 2 W5 Approval Workflow pure-logic tests.
 *
 * Source: [Admin System] DINOCO SN Approval Workflow V.0.1+
 *
 * Tests state machine transitions, self-approval block, SLA timing,
 * UUID generation, and validation helpers — all pure logic mirrors
 * (no DB / no WP runtime).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Pure-logic mirrors of Approval Workflow helpers ──────────── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_appr_can_transition' ) ) {

    /**
     * Mirror of dinoco_sn_approval_can_transition().
     *
     * Allowed transitions:
     *   pending → approved | rejected | expired | cancelled
     *   any other → (locked, terminal)
     */
    function sn_appr_can_transition( string $from, string $to ): bool {
        $from = strtolower( trim( $from ) );
        $to   = strtolower( trim( $to ) );
        if ( $from !== 'pending' ) return false;
        return in_array( $to, array( 'approved', 'rejected', 'expired', 'cancelled' ), true );
    }

    /**
     * Self-approval block: actor === approver returns true (BLOCK).
     */
    function sn_appr_is_self_approval( int $actor_id, int $approver_id ): bool {
        return $actor_id > 0 && $approver_id > 0 && $actor_id === $approver_id;
    }

    /**
     * Mirror of dinoco_sn_approval_valid_action().
     */
    function sn_appr_valid_action( $action ): bool {
        $allowed = array( 'swap', 'void', 'recall', 'relink', 'reissue' );
        return in_array( strtolower( trim( (string) $action ) ), $allowed, true );
    }

    /**
     * Mirror of dinoco_sn_approval_valid_urgency().
     */
    function sn_appr_valid_urgency( $urgency ): bool {
        $allowed = array( 'urgent', 'normal', 'low' );
        return in_array( strtolower( trim( (string) $urgency ) ), $allowed, true );
    }

    /**
     * Mirror of dinoco_sn_approval_is_valid_uuid().
     */
    function sn_appr_is_valid_uuid( $uuid ): bool {
        return is_string( $uuid ) && (bool) preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
            $uuid
        );
    }

    /**
     * Mirror of dinoco_sn_approval_generate_uuid() — RFC 4122 v4.
     */
    function sn_appr_generate_uuid(): string {
        $data = random_bytes( 16 );
        $data[6] = chr( ord( $data[6] ) & 0x0f | 0x40 ); // version 4
        $data[8] = chr( ord( $data[8] ) & 0x3f | 0x80 ); // variant
        return vsprintf( '%s%s-%s-%s-%s-%s%s%s', str_split( bin2hex( $data ), 4 ) );
    }

    /**
     * Compute SLA expiration timestamp given creation time + tier + urgency.
     * Mirrors integration of dinoco_sn_get_approval_sla_seconds with NOW.
     */
    function sn_appr_compute_expires_at( int $created_ts, string $tier, string $urgency = 'normal' ): int {
        if ( $tier === '4_eyes' ) {
            $map = array( 'urgent' => 3600, 'normal' => 86400, 'low' => 259200 );
            $sec = $map[ $urgency ] ?? 86400;
            return $created_ts + $sec;
        }
        if ( $tier === 'single_admin' ) return $created_ts + 86400;
        // 'auto' = 0 SLA seconds, but workflow uses safety floor of 24h
        return $created_ts + 86400;
    }
}

class SnApprovalWorkflowTest extends TestCase {

    // ─── State machine transitions ──────────────────────────────────────

    public function test_pending_to_approved_allowed() {
        $this->assertTrue( sn_appr_can_transition( 'pending', 'approved' ) );
    }

    public function test_pending_to_rejected_allowed() {
        $this->assertTrue( sn_appr_can_transition( 'pending', 'rejected' ) );
    }

    public function test_pending_to_expired_allowed() {
        $this->assertTrue( sn_appr_can_transition( 'pending', 'expired' ) );
    }

    public function test_pending_to_cancelled_allowed() {
        $this->assertTrue( sn_appr_can_transition( 'pending', 'cancelled' ) );
    }

    public function test_approved_to_anything_blocked() {
        $this->assertFalse( sn_appr_can_transition( 'approved', 'rejected' ) );
        $this->assertFalse( sn_appr_can_transition( 'approved', 'expired' ) );
        $this->assertFalse( sn_appr_can_transition( 'approved', 'cancelled' ) );
        $this->assertFalse( sn_appr_can_transition( 'approved', 'pending' ) );
    }

    public function test_rejected_to_anything_blocked() {
        $this->assertFalse( sn_appr_can_transition( 'rejected', 'approved' ) );
        $this->assertFalse( sn_appr_can_transition( 'rejected', 'pending' ) );
    }

    public function test_expired_to_anything_blocked() {
        $this->assertFalse( sn_appr_can_transition( 'expired', 'approved' ) );
        $this->assertFalse( sn_appr_can_transition( 'expired', 'pending' ) );
    }

    public function test_cancelled_to_anything_blocked() {
        $this->assertFalse( sn_appr_can_transition( 'cancelled', 'approved' ) );
        $this->assertFalse( sn_appr_can_transition( 'cancelled', 'pending' ) );
    }

    public function test_pending_to_invalid_blocked() {
        $this->assertFalse( sn_appr_can_transition( 'pending', 'unknown' ) );
        $this->assertFalse( sn_appr_can_transition( 'pending', 'pending' ) );
        $this->assertFalse( sn_appr_can_transition( 'pending', '' ) );
    }

    public function test_case_insensitive_transitions() {
        $this->assertTrue( sn_appr_can_transition( 'PENDING', 'APPROVED' ) );
        $this->assertTrue( sn_appr_can_transition( '  Pending  ', '  Approved  ' ) );
    }

    // ─── Self-approval block detection ──────────────────────────────────

    public function test_self_approval_blocked_when_same_user() {
        $this->assertTrue( sn_appr_is_self_approval( 42, 42 ) );
    }

    public function test_self_approval_allowed_when_different_users() {
        $this->assertFalse( sn_appr_is_self_approval( 42, 99 ) );
    }

    public function test_self_approval_zero_actor_not_blocked() {
        // Zero actor (e.g., system / not yet assigned) shouldn't trigger block
        $this->assertFalse( sn_appr_is_self_approval( 0, 42 ) );
        $this->assertFalse( sn_appr_is_self_approval( 42, 0 ) );
        $this->assertFalse( sn_appr_is_self_approval( 0, 0 ) );
    }

    // ─── Action validation ──────────────────────────────────────────────

    public function test_valid_actions_accepted() {
        $this->assertTrue( sn_appr_valid_action( 'swap' ) );
        $this->assertTrue( sn_appr_valid_action( 'void' ) );
        $this->assertTrue( sn_appr_valid_action( 'recall' ) );
        $this->assertTrue( sn_appr_valid_action( 'relink' ) );
        $this->assertTrue( sn_appr_valid_action( 'reissue' ) );
    }

    public function test_invalid_actions_rejected() {
        $this->assertFalse( sn_appr_valid_action( 'delete' ) );
        $this->assertFalse( sn_appr_valid_action( '' ) );
        $this->assertFalse( sn_appr_valid_action( 'SWAP_INVALID' ) );
        $this->assertFalse( sn_appr_valid_action( null ) );
    }

    public function test_action_case_insensitive() {
        $this->assertTrue( sn_appr_valid_action( 'SWAP' ) );
        $this->assertTrue( sn_appr_valid_action( ' Recall ' ) );
    }

    // ─── Urgency validation ─────────────────────────────────────────────

    public function test_valid_urgencies_accepted() {
        $this->assertTrue( sn_appr_valid_urgency( 'urgent' ) );
        $this->assertTrue( sn_appr_valid_urgency( 'normal' ) );
        $this->assertTrue( sn_appr_valid_urgency( 'low' ) );
    }

    public function test_invalid_urgency_rejected() {
        $this->assertFalse( sn_appr_valid_urgency( 'critical' ) );
        $this->assertFalse( sn_appr_valid_urgency( 'high' ) );
        $this->assertFalse( sn_appr_valid_urgency( '' ) );
    }

    // ─── UUID generation + validation ───────────────────────────────────

    public function test_uuid_format_v4_compliant() {
        $uuid = sn_appr_generate_uuid();
        $this->assertTrue( sn_appr_is_valid_uuid( $uuid ) );
        // Version 4 marker on 13th char
        $this->assertSame( '4', $uuid[14] );
    }

    public function test_uuid_uniqueness_across_invocations() {
        // Generate 100 UUIDs — all should be unique (collision probability ~0)
        $set = array();
        for ( $i = 0; $i < 100; $i++ ) {
            $set[] = sn_appr_generate_uuid();
        }
        $this->assertCount( 100, array_unique( $set ) );
    }

    public function test_invalid_uuid_rejected() {
        $this->assertFalse( sn_appr_is_valid_uuid( '' ) );
        $this->assertFalse( sn_appr_is_valid_uuid( 'not-a-uuid' ) );
        $this->assertFalse( sn_appr_is_valid_uuid( '12345678-1234-1234-1234-123' ) ); // too short
        $this->assertFalse( sn_appr_is_valid_uuid( null ) );
        $this->assertFalse( sn_appr_is_valid_uuid( '12345678-1234-1234-1234-123456789012-extra' ) );
    }

    public function test_valid_uuid_uppercase_accepted() {
        $this->assertTrue( sn_appr_is_valid_uuid( 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890' ) );
    }

    // ─── SLA timing ─────────────────────────────────────────────────────

    public function test_sla_4eyes_urgent_1_hour() {
        $now = 1700000000;
        $exp = sn_appr_compute_expires_at( $now, '4_eyes', 'urgent' );
        $this->assertSame( $now + 3600, $exp );
    }

    public function test_sla_4eyes_normal_24_hours() {
        $now = 1700000000;
        $exp = sn_appr_compute_expires_at( $now, '4_eyes', 'normal' );
        $this->assertSame( $now + 86400, $exp );
    }

    public function test_sla_4eyes_low_72_hours() {
        $now = 1700000000;
        $exp = sn_appr_compute_expires_at( $now, '4_eyes', 'low' );
        $this->assertSame( $now + 259200, $exp );
    }

    public function test_sla_single_admin_24h() {
        $now = 1700000000;
        $exp = sn_appr_compute_expires_at( $now, 'single_admin', 'urgent' );
        $this->assertSame( $now + 86400, $exp );
    }

    public function test_sla_auto_safety_floor_24h() {
        // Auto tier has 0 SLA classifier output, but workflow enforces 24h floor
        // so cron has something to expire if action ends up queued.
        $now = 1700000000;
        $exp = sn_appr_compute_expires_at( $now, 'auto' );
        $this->assertSame( $now + 86400, $exp );
    }

    // ─── End-to-end state lifecycle ─────────────────────────────────────

    public function test_full_lifecycle_pending_approved_terminal() {
        // pending → approved
        $this->assertTrue( sn_appr_can_transition( 'pending', 'approved' ) );
        // approved → anything = blocked
        $this->assertFalse( sn_appr_can_transition( 'approved', 'rejected' ) );
        $this->assertFalse( sn_appr_can_transition( 'approved', 'cancelled' ) );
    }

    public function test_full_lifecycle_pending_rejected_terminal() {
        $this->assertTrue( sn_appr_can_transition( 'pending', 'rejected' ) );
        $this->assertFalse( sn_appr_can_transition( 'rejected', 'approved' ) );
    }

    public function test_full_lifecycle_pending_expired_terminal() {
        $this->assertTrue( sn_appr_can_transition( 'pending', 'expired' ) );
        $this->assertFalse( sn_appr_can_transition( 'expired', 'approved' ) );
    }

    public function test_full_lifecycle_pending_cancelled_terminal() {
        $this->assertTrue( sn_appr_can_transition( 'pending', 'cancelled' ) );
        $this->assertFalse( sn_appr_can_transition( 'cancelled', 'approved' ) );
    }
}
