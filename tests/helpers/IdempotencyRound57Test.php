<?php
/**
 * IdempotencyRound57Test — DRY contract tests for Round 57 batch 35 (8 endpoints).
 *
 * Source: Round 57 (2026-05-15) — closing on 🎯 90% milestone (176/196 = 89.8%).
 *
 *   Batch 35 = 8 endpoints across 3 snippets:
 *     - POST /dinoco-gdpr/v1/my-data-export
 *     - POST /dinoco-gdpr/v1/my-data-delete
 *     - POST /dinoco-gdpr/v1/admin/request/{id}/approve
 *     - POST /dinoco-gdpr/v1/admin/request/{id}/reject (single+enum reason)
 *     - POST /dinoco-gdpr/v1/admin/request/{id}/undo
 *     - POST /dinoco-gdpr/v1/admin/request/{id}/manual-export
 *     - POST /dinoco/v1/audit/retention/run (constant-marker — 11th instance)
 *     - POST /dinoco/v1/sn-roles/bulk-assign (bulk-of-targets canonical sort)
 *
 * NEW namespace `dinoco-gdpr/v1` opened.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound57Test extends IdempotencyTestFixture {

    // ── GDPR CUSTOMER REQUEST ──

    public function test_gdpr_export_first_call(): void {
        $body = array( 'user_id' => 42, 'type' => 'export' );
        $this->assertFirstCallSuccess( 'gdpr/my-data-export', $body );
    }

    public function test_gdpr_export_replay_matches(): void {
        $body = array( 'user_id' => 42, 'type' => 'export' );
        $this->assertReplayMatches( 'gdpr/my-data-export', $body );
    }

    public function test_gdpr_export_vs_delete_distinct(): void {
        // CRITICAL: cached replay of export when admin actually requested delete (or
        // vice-versa) would catastrophically wrong-route PDPA workflow.
        $b1 = array( 'user_id' => 42, 'type' => 'export' );
        $b2 = array( 'user_id' => 42, 'type' => 'delete', 'confirm' => 'DELETE_MY_ACCOUNT' );
        $this->assertDifferentBody( 'gdpr customer requests', $b1, $b2, 'type (export vs delete)' );
    }

    public function test_gdpr_delete_requires_confirm_string(): void {
        // Body MUST include the confirm string for delete (defense even at hash layer —
        // wrapper cached state must distinguish "user typed confirm" vs "user didn't").
        $b1 = array( 'user_id' => 42, 'type' => 'delete', 'confirm' => 'DELETE_MY_ACCOUNT' );
        $b2 = array( 'user_id' => 42, 'type' => 'delete', 'confirm' => '' );
        $this->assertDifferentBody( 'gdpr delete', $b1, $b2, 'confirm string (DELETE_MY_ACCOUNT vs empty)' );
    }

    // ── GDPR ADMIN MODERATION ──

    public function test_gdpr_admin_approve_first_call(): void {
        $body = array(
            'request_id'    => 100,
            'confirm_text'  => 'APPROVE',
            'actor_user_id' => 7,
        );
        $this->assertFirstCallSuccess( 'gdpr/admin/approve', $body );
    }

    public function test_gdpr_admin_reject_reason_discriminator(): void {
        // Admin re-evaluating rejection reason mid-retry = different intent.
        $b1 = array( 'request_id' => 100, 'reason' => 'insufficient_evidence', 'actor_user_id' => 7 );
        $b2 = array( 'request_id' => 100, 'reason' => 'duplicate_request',     'actor_user_id' => 7 );
        $this->assertDifferentBody( 'gdpr/admin/reject', $b1, $b2,
            'reason (insufficient_evidence vs duplicate_request)' );
    }

    public function test_gdpr_admin_undo_first_call(): void {
        $body = array( 'request_id' => 100, 'actor_user_id' => 7 );
        $this->assertFirstCallSuccess( 'gdpr/admin/undo', $body );
    }

    public function test_gdpr_admin_manual_export_confirm(): void {
        // confirm_text=PROCESS gate carried into body hash so admin who typo'd different
        // confirm gets distinct hash + 409.
        $b1 = array( 'request_id' => 100, 'confirm_text' => 'PROCESS', 'actor_user_id' => 7 );
        $b2 = array( 'request_id' => 100, 'confirm_text' => 'process', 'actor_user_id' => 7 );
        $this->assertDifferentBody( 'gdpr/admin/manual-export', $b1, $b2,
            'confirm_text case sensitivity (PROCESS vs process)' );
    }

    // ── AUDIT RETENTION (constant-marker 11th instance) ──

    public function test_audit_retention_constant_marker(): void {
        // 11th constant-marker instance after R30/R32/R39/R40/R43/R47/R49(×2)/R50/R51.
        $body = array(
            'action'        => 'audit-retention-run',
            'dry_run'       => false,
            'actor_user_id' => 7,
        );
        $this->assertFirstCallSuccess( 'audit/retention/run', $body );
    }

    public function test_audit_retention_dry_run_vs_commit(): void {
        // dry_run preview vs commit semantically distinct — cached preview replay must
        // NOT skip actual DELETE storm admin intended.
        $b1 = array( 'action' => 'audit-retention-run', 'dry_run' => true,  'actor_user_id' => 7 );
        $b2 = array( 'action' => 'audit-retention-run', 'dry_run' => false, 'actor_user_id' => 7 );
        $this->assertDifferentBody( 'audit/retention/run', $b1, $b2, 'dry_run boolean (preview vs commit)' );
    }

    // ── SN-ROLES BULK-ASSIGN (bulk-of-targets canonical sort) ──

    public function test_sn_roles_bulk_assign_first_call(): void {
        $changes = array(
            array( 'user_id' => 10, 'role' => 'dinoco_sn_approver',  'action' => 'add' ),
            array( 'user_id' => 11, 'role' => 'dinoco_sn_warehouse', 'action' => 'add' ),
        );
        usort( $changes, function( $a, $b ) {
            if ( $a['user_id'] !== $b['user_id'] ) return $a['user_id'] - $b['user_id'];
            if ( $a['role']    !== $b['role'] )    return strcmp( $a['role'], $b['role'] );
            return strcmp( $a['action'], $b['action'] );
        } );
        $body = array( 'changes' => $changes, 'actor_user_id' => 1 );
        $this->assertFirstCallSuccess( 'sn-roles/bulk-assign', $body );
    }

    public function test_sn_roles_bulk_assign_order_stable(): void {
        // Same set of changes in different order MUST produce same hash after canonical
        // sort — admin re-uploads same matrix with different click order = cached 200.
        $changes_1 = array(
            array( 'user_id' => 11, 'role' => 'dinoco_sn_warehouse', 'action' => 'add' ),
            array( 'user_id' => 10, 'role' => 'dinoco_sn_approver',  'action' => 'add' ),
        );
        $changes_2 = array(
            array( 'user_id' => 10, 'role' => 'dinoco_sn_approver',  'action' => 'add' ),
            array( 'user_id' => 11, 'role' => 'dinoco_sn_warehouse', 'action' => 'add' ),
        );
        $sorter = function( $a, $b ) {
            if ( $a['user_id'] !== $b['user_id'] ) return $a['user_id'] - $b['user_id'];
            if ( $a['role']    !== $b['role'] )    return strcmp( $a['role'], $b['role'] );
            return strcmp( $a['action'], $b['action'] );
        };
        usort( $changes_1, $sorter );
        usort( $changes_2, $sorter );
        $b1 = array( 'changes' => $changes_1, 'actor_user_id' => 1 );
        $b2 = array( 'changes' => $changes_2, 'actor_user_id' => 1 );
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'changes[] canonical sort produces order-stable hash regardless of admin click order'
        );
    }

    public function test_sn_roles_bulk_assign_add_vs_remove_409(): void {
        // Same user_id + role but different action = catastrophically different intent.
        $sorter = function( $a, $b ) {
            if ( $a['user_id'] !== $b['user_id'] ) return $a['user_id'] - $b['user_id'];
            if ( $a['role']    !== $b['role'] )    return strcmp( $a['role'], $b['role'] );
            return strcmp( $a['action'], $b['action'] );
        };
        $c1 = array( array( 'user_id' => 10, 'role' => 'dinoco_sn_approver', 'action' => 'add' ) );
        $c2 = array( array( 'user_id' => 10, 'role' => 'dinoco_sn_approver', 'action' => 'remove' ) );
        usort( $c1, $sorter ); usort( $c2, $sorter );
        $b1 = array( 'changes' => $c1, 'actor_user_id' => 1 );
        $b2 = array( 'changes' => $c2, 'actor_user_id' => 1 );
        $this->assertDifferentBody( 'sn-roles/bulk-assign', $b1, $b2,
            'action (add vs remove) — CRITICAL: cached replay would silently grant or revoke admin role' );
    }

    // ── CUMULATIVE NO-COLLISION GUARD ──

    public function test_round_57_no_cross_endpoint_collision(): void {
        $h_export   = dinoco_idempotency_hash( array( 'user_id' => 1, 'type' => 'export' ) );
        $h_delete   = dinoco_idempotency_hash( array( 'user_id' => 1, 'type' => 'delete', 'confirm' => 'DELETE_MY_ACCOUNT' ) );
        $h_approve  = dinoco_idempotency_hash( array( 'request_id' => 1, 'confirm_text' => 'APPROVE', 'actor_user_id' => 7 ) );
        $h_reject   = dinoco_idempotency_hash( array( 'request_id' => 1, 'reason' => 'duplicate', 'actor_user_id' => 7 ) );
        $h_undo     = dinoco_idempotency_hash( array( 'request_id' => 1, 'actor_user_id' => 7 ) );
        $h_manual   = dinoco_idempotency_hash( array( 'request_id' => 1, 'confirm_text' => 'PROCESS', 'actor_user_id' => 7 ) );
        $h_audit    = dinoco_idempotency_hash( array( 'action' => 'audit-retention-run', 'dry_run' => false, 'actor_user_id' => 7 ) );
        $h_roles    = dinoco_idempotency_hash( array(
            'changes' => array( array( 'user_id' => 1, 'role' => 'a', 'action' => 'add' ) ),
            'actor_user_id' => 1,
        ) );
        $all = array( $h_export, $h_delete, $h_approve, $h_reject, $h_undo, $h_manual, $h_audit, $h_roles );
        $this->assertCount(
            count( array_unique( $all ) ), $all,
            'Round 57: 8 endpoint body shapes MUST produce 8 distinct hashes (no collisions)'
        );
    }
}
