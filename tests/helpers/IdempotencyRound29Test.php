<?php
/**
 * IdempotencyRound29Test — DRY contract tests using IdempotencyTestFixture base class.
 *
 * Source: Round 29 (2026-04-30) — demonstration of fixture LOC savings vs legacy
 * inline pattern in IdempotencyEndpointContractTest.php.
 *
 * Per-test LOC comparison:
 *   Legacy (inline):  ~25 LOC per test (helper var setup + assertion + message)
 *   Fixture-based:    ~5 LOC per test (delegated to assertReplayMatches/assertDifferentBody)
 *
 * This file mirrors a subset of the Round 29 invariants from the legacy file
 * (combined-slip-upload + import-distributors + delete-ticket + recalculate-total +
 * manual-flash-ready) using the fixture API. The legacy file keeps the exhaustive
 * 4-case-per-endpoint coverage; this file keeps the 3-case core (replay / different /
 * first-call) per the Round 29 spec.
 *
 * Future Round 30+ tests SHOULD use this fixture pattern. We intentionally don't
 * refactor Rounds 19-28 to avoid touching passing tests (additive only).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound29Test extends IdempotencyTestFixture {

    // ── COMBINED-SLIP-UPLOAD (3 cases, ~5 LOC each) ──

    public function test_combined_slip_upload_first_call_success(): void {
        $body = array( 'ticket_ids' => array( 101, 102 ), 'gid' => 'C1' );
        $this->assertFirstCallSuccess( 'combined-slip-upload', $body );
    }

    public function test_combined_slip_upload_replay_matches(): void {
        $body = array( 'ticket_ids' => array( 101, 102 ), 'gid' => 'C1' );
        $this->assertReplayMatches( 'combined-slip-upload', $body );
    }

    public function test_combined_slip_upload_different_gid_409(): void {
        $b1 = array( 'ticket_ids' => array( 101 ), 'gid' => 'C1' );
        $b2 = array( 'ticket_ids' => array( 101 ), 'gid' => 'C2' );
        $this->assertDifferentBody( 'combined-slip-upload', $b1, $b2, 'gid' );
    }

    // ── IMPORT-DISTRIBUTORS (3 cases) ──

    public function test_import_distributors_first_call_success(): void {
        $body = array( 'rows' => array( array( 'shop_name' => 'A', 'line_group_id' => 'C1' ) ), 'dry_run' => 0 );
        $this->assertFirstCallSuccess( 'import-distributors', $body );
    }

    public function test_import_distributors_replay_matches(): void {
        $body = array( 'rows' => array( array( 'shop_name' => 'A', 'line_group_id' => 'C1' ) ), 'dry_run' => 0 );
        $this->assertReplayMatches( 'import-distributors', $body );
    }

    public function test_import_distributors_dry_vs_live_409(): void {
        $b_dry  = array( 'rows' => array( array( 'shop_name' => 'A', 'line_group_id' => 'C1' ) ), 'dry_run' => 1 );
        $b_live = array( 'rows' => array( array( 'shop_name' => 'A', 'line_group_id' => 'C1' ) ), 'dry_run' => 0 );
        $this->assertDifferentBody( 'import-distributors', $b_dry, $b_live, 'dry_run' );
    }

    // ── DELETE-TICKET (3 cases) ──

    public function test_delete_ticket_first_call_success(): void {
        $this->assertFirstCallSuccess( 'delete-ticket', array( 'ticket_id' => 4001 ) );
    }

    public function test_delete_ticket_replay_matches(): void {
        $this->assertReplayMatches( 'delete-ticket', array( 'ticket_id' => 4001 ) );
    }

    public function test_delete_ticket_different_id_409(): void {
        $this->assertDifferentBody(
            'delete-ticket',
            array( 'ticket_id' => 4001 ),
            array( 'ticket_id' => 4002 ),
            'ticket_id'
        );
    }

    // ── RECALCULATE-TOTAL (3 cases) ──

    public function test_recalculate_total_first_call_success(): void {
        $this->assertFirstCallSuccess( 'recalculate-total', array( 'ticket_id' => 5001 ) );
    }

    public function test_recalculate_total_replay_matches(): void {
        $this->assertReplayMatches( 'recalculate-total', array( 'ticket_id' => 5001 ) );
    }

    public function test_recalculate_total_different_id_409(): void {
        $this->assertDifferentBody(
            'recalculate-total',
            array( 'ticket_id' => 5001 ),
            array( 'ticket_id' => 5002 ),
            'ticket_id'
        );
    }

    // ── MANUAL-FLASH-READY (3 cases) ──

    public function test_manual_flash_ready_first_call_success(): void {
        $this->assertFirstCallSuccess(
            'manual-flash-ready',
            array( 'pno' => 'TH001', 'all_pnos' => array() )
        );
    }

    public function test_manual_flash_ready_replay_matches(): void {
        $this->assertReplayMatches(
            'manual-flash-ready',
            array( 'pno' => 'TH001', 'all_pnos' => array() )
        );
    }

    public function test_manual_flash_ready_different_pno_409(): void {
        $this->assertDifferentBody(
            'manual-flash-ready',
            array( 'pno' => 'TH001', 'all_pnos' => array() ),
            array( 'pno' => 'TH002', 'all_pnos' => array() ),
            'pno'
        );
    }

    // ── KEY VALIDATION (4 cases — covers extract_key_logic gate) ──

    public function test_empty_key_rejected(): void {
        $this->assertKeyTooShortRejected( 'combined-slip-upload', '', 'empty string' );
    }

    public function test_whitespace_key_rejected(): void {
        $this->assertKeyTooShortRejected( 'import-distributors', '   ', 'whitespace-only' );
    }

    public function test_too_long_key_rejected(): void {
        $this->assertKeyTooShortRejected(
            'delete-ticket',
            str_repeat( 'a', 65 ),
            'exceeds 64-char limit'
        );
    }

    public function test_invalid_chars_key_rejected(): void {
        $this->assertKeyTooShortRejected(
            'recalculate-total',
            'key with space',
            'spaces violate [A-Za-z0-9._-] alphabet'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_29_no_collision_via_fixture(): void {
        $body_map = array(
            'combined_slip_upload' => array( 'ticket_ids' => array( 1001 ), 'gid' => 'C1' ),
            'import_distributors'  => array( 'rows' => array( array( 'shop_name' => 'A' ) ), 'dry_run' => 0 ),
            'delete_ticket'        => array( 'ticket_id' => 4001 ),
            'recalculate_total'    => array( 'ticket_id' => 5001 ),
            'manual_flash_ready'   => array( 'pno' => 'TH001', 'all_pnos' => array() ),
        );
        $this->assertNoCollisionsInRound( 'Round 29', $body_map );
    }
}
