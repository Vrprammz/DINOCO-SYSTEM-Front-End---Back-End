<?php
/**
 * SnTransferOwnerTest — pure-logic test of warranty owner transfer guard logic.
 *
 * Source: [Admin System] DINOCO Manual Transfer Tool V.31.0
 *         [System] Transfer Warranty Page V.31.0
 *
 *   function dinoco_sn_transfer_owner_by_sn( $sn, $old_owner_id, $new_owner_id )
 *   function dinoco_sn_transfer_owner( $warranty_id, $old_owner_id, $new_owner_id )
 *
 * Plan reference: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.6 §Gap E
 * Phase: 2 W6.6 + W6.7
 *
 * Boss decision Q16: Customer transfer = ใช้เพลทเดิม (no new plate, same SN).
 *
 * Tests pure-logic guard rules:
 *   - Block claimed plate (returns WP_Error 422)
 *   - Block voided / recalled / replaced (each separate case, returns WP_Error 422)
 *   - Block stolen + emit alert intent (returns WP_Error 422)
 *   - Allow registered plate transfer (returns true)
 *   - Allow in_pool transfer (edge — direct dealer transfer before customer activate)
 *   - Legacy plate with no sn_pool row (graceful no-op, returns true)
 *   - Same old/new owner (no-op edge case, returns true)
 *   - Empty SN / negative IDs (graceful)
 *
 * Pattern follows SnHierarchyTest.php / SnBulkReceiveContractTest.php — pure
 * logic, in-memory $plate_db; no WP / DB dependencies.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/**
 * Mirror of dinoco_sn_transfer_owner_by_sn() guard logic — pure logic without
 * WP / DB dependencies. Caller passes $plate_row (snapshot) to avoid mocking.
 *
 * Returns:
 *   true       — transfer allowed (writes happen elsewhere)
 *   ['blocked', $code, $msg, $http] — guard blocks transfer
 *   ['noop']  — graceful no-op (legacy SN, missing table, same owner, etc.)
 */
if ( ! function_exists( __NAMESPACE__ . '\\sn_transfer_guard' ) ) {
    function sn_transfer_guard(
        string $sn,
        int $old_owner_id,
        int $new_owner_id,
        ?array $plate_row,
        bool $table_exists = true
    ): array {
        $sn = strtoupper( trim( $sn ) );
        if ( $sn === '' ) {
            return array( 'blocked', 'sn_empty', 'Serial number is empty', 400 );
        }

        // Manual Transfer accepts username string — caller may have failed to
        // resolve. Fall through gracefully (legacy ACF logic still runs).
        if ( $new_owner_id <= 0 ) {
            return array( 'noop' );
        }

        if ( ! $table_exists ) {
            return array( 'noop' );
        }

        // Same owner → idempotent, no DB write
        if ( $old_owner_id > 0 && $old_owner_id === $new_owner_id ) {
            return array( 'noop' );
        }

        // Legacy SN without sn_pool row → graceful (caller falls through to ACF)
        if ( $plate_row === null ) {
            return array( 'noop' );
        }

        $blocked_states = array( 'claimed', 'voided', 'recalled', 'stolen', 'replaced' );
        if ( in_array( $plate_row['status'], $blocked_states, true ) ) {
            $msg_map = array(
                'claimed'  => 'เพลทกำลังเปิดเคลม โอนไม่ได้',
                'voided'   => 'เพลทถูกยกเลิก โอนไม่ได้',
                'recalled' => 'เพลทถูกเรียกคืน (Recall) โอนไม่ได้',
                'stolen'   => 'เพลท ' . $sn . ' ถูกแจ้งหาย/ระงับสิทธิ์ — โอนไม่ได้',
                'replaced' => 'เพลทถูกเปลี่ยนใหม่แล้ว โอนไม่ได้',
            );
            $code = $plate_row['status'] === 'stolen' ? 'plate_stolen' : 'plate_not_transferable';
            return array( 'blocked', $code, $msg_map[ $plate_row['status'] ], 422 );
        }

        return array( 'allowed' );
    }
}

final class SnTransferOwnerTest extends TestCase {

    /* ----- BLOCK STATES ----- */

    public function test_block_claimed_plate(): void {
        $r = sn_transfer_guard( 'DNC-001', 100, 200, array( 'status' => 'claimed' ) );
        $this->assertSame( 'blocked', $r[0] );
        $this->assertSame( 'plate_not_transferable', $r[1] );
        $this->assertSame( 422, $r[3] );
        $this->assertStringContainsString( 'เปิดเคลม', $r[2] );
    }

    public function test_block_voided_plate(): void {
        $r = sn_transfer_guard( 'DNC-002', 100, 200, array( 'status' => 'voided' ) );
        $this->assertSame( 'blocked', $r[0] );
        $this->assertSame( 'plate_not_transferable', $r[1] );
        $this->assertSame( 422, $r[3] );
        $this->assertStringContainsString( 'ยกเลิก', $r[2] );
    }

    public function test_block_recalled_plate(): void {
        $r = sn_transfer_guard( 'DNC-003', 100, 200, array( 'status' => 'recalled' ) );
        $this->assertSame( 'blocked', $r[0] );
        $this->assertSame( 'plate_not_transferable', $r[1] );
        $this->assertSame( 422, $r[3] );
        $this->assertStringContainsString( 'เรียกคืน', $r[2] );
    }

    public function test_block_replaced_plate(): void {
        $r = sn_transfer_guard( 'DNC-004', 100, 200, array( 'status' => 'replaced' ) );
        $this->assertSame( 'blocked', $r[0] );
        $this->assertSame( 'plate_not_transferable', $r[1] );
        $this->assertStringContainsString( 'เปลี่ยนใหม่', $r[2] );
    }

    public function test_block_stolen_uses_dedicated_code(): void {
        // Stolen plate should use plate_stolen error code (admin alert hook)
        $r = sn_transfer_guard( 'DNC-005', 100, 200, array( 'status' => 'stolen' ) );
        $this->assertSame( 'blocked', $r[0] );
        $this->assertSame( 'plate_stolen', $r[1] );
        $this->assertSame( 422, $r[3] );
        $this->assertStringContainsString( 'แจ้งหาย', $r[2] );
        $this->assertStringContainsString( 'DNC-005', $r[2] );
    }

    /* ----- ALLOW STATES ----- */

    public function test_allow_registered_plate(): void {
        $r = sn_transfer_guard( 'DNC-006', 100, 200, array( 'status' => 'registered' ) );
        $this->assertSame( 'allowed', $r[0] );
    }

    public function test_allow_in_pool_plate(): void {
        // Edge: dealer-to-dealer transfer before customer activates
        $r = sn_transfer_guard( 'DNC-007', 100, 200, array( 'status' => 'in_pool' ) );
        $this->assertSame( 'allowed', $r[0] );
    }

    /* ----- GRACEFUL NO-OP ----- */

    public function test_legacy_plate_no_sn_pool_row_is_noop(): void {
        // Legacy serial_number CPT created before Phase 1 W2 sn_pool deploy.
        // No row in sn_pool → caller falls through to legacy ACF-only logic.
        $r = sn_transfer_guard( 'DNC-LEGACY', 100, 200, null );
        $this->assertSame( 'noop', $r[0] );
    }

    public function test_missing_sn_pool_table_is_noop(): void {
        // Phase 1 W2 not yet deployed → table absent → graceful.
        $r = sn_transfer_guard( 'DNC-008', 100, 200, array( 'status' => 'registered' ), false );
        $this->assertSame( 'noop', $r[0] );
    }

    public function test_same_old_new_owner_is_noop(): void {
        // Idempotent caller — nothing to do, no DB write needed.
        $r = sn_transfer_guard( 'DNC-009', 100, 100, array( 'status' => 'registered' ) );
        $this->assertSame( 'noop', $r[0] );
    }

    public function test_zero_new_owner_is_noop(): void {
        // Caller (e.g. Manual Transfer Tool) failed to resolve username → user_id.
        // Fall through to legacy ACF-only logic.
        $r = sn_transfer_guard( 'DNC-010', 100, 0, array( 'status' => 'registered' ) );
        $this->assertSame( 'noop', $r[0] );
    }

    public function test_negative_new_owner_is_noop(): void {
        $r = sn_transfer_guard( 'DNC-011', 100, -5, array( 'status' => 'registered' ) );
        $this->assertSame( 'noop', $r[0] );
    }

    public function test_zero_old_owner_with_new_owner_is_allowed(): void {
        // Old owner unknown / system / pre-existing — allow first transfer.
        $r = sn_transfer_guard( 'DNC-012', 0, 200, array( 'status' => 'registered' ) );
        $this->assertSame( 'allowed', $r[0] );
    }

    /* ----- INPUT VALIDATION ----- */

    public function test_empty_sn_returns_400(): void {
        $r = sn_transfer_guard( '', 100, 200, array( 'status' => 'registered' ) );
        $this->assertSame( 'blocked', $r[0] );
        $this->assertSame( 'sn_empty', $r[1] );
        $this->assertSame( 400, $r[3] );
    }

    public function test_whitespace_sn_returns_400(): void {
        $r = sn_transfer_guard( '   ', 100, 200, array( 'status' => 'registered' ) );
        $this->assertSame( 'blocked', $r[0] );
        $this->assertSame( 'sn_empty', $r[1] );
    }

    public function test_sn_normalized_to_uppercase(): void {
        // Same as registered case — verify lowercase SN doesn't cause mismatch.
        $r = sn_transfer_guard( 'dnc-013', 100, 200, array( 'status' => 'registered' ) );
        $this->assertSame( 'allowed', $r[0] );
    }
}
