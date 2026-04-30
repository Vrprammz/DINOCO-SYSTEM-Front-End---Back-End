<?php
/**
 * IdempotencyRound32Test — DRY contract tests for Round 32 batch 10 (5 endpoints).
 *
 * Source: Round 32 (2026-04-30) — push past 25.4% coverage milestone (49/193 — first
 * milestone past 1/4 of POST endpoints AGAINST AUTHORITATIVE Round 30 census denominator).
 *
 *   Batch 10 NEW (5 endpoints — retry-prone admin/maker hot paths):
 *     - POST /b2f/v1/maker-reschedule    — Maker LIFF retry slow LINE = 2x reschedule + 2x admin Flex
 *     - POST /b2b/v1/manual-flash-test   — admin retry = 2x Flash API quota burn + log spam
 *     - POST /b2b/v1/bo-update-eta       — admin retry double-appends "|" notes silently
 *     - POST /b2b/v1/bo-restock-scan     — admin double-click + cron concurrent run = 2x Telegram alert
 *     - POST /b2f/v1/reject-lot          — admin double-click = 2x Maker rejection Flex
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per endpoint
 * (first_call_success / replay_matches / different_field_409) + cumulative no-collision +
 * cross-namespace pair guard (BO update-eta vs restock-scan share `sku`-ish minimal shape but
 * different namespaces and different discriminators).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound32Test extends IdempotencyTestFixture {

    // ── BATCH 10: MAKER-RESCHEDULE ──

    public function test_maker_reschedule_first_call_success(): void {
        $body = array(
            'po_id'    => 4001,
            'maker_id' => 12,
            'new_date' => '2026-05-15',
            'reason'   => 'วัตถุดิบขาด',
        );
        $this->assertFirstCallSuccess( 'maker-reschedule', $body );
    }

    public function test_maker_reschedule_replay_matches(): void {
        $body = array(
            'po_id'    => 4001,
            'maker_id' => 12,
            'new_date' => '2026-05-15',
            'reason'   => 'วัตถุดิบขาด',
        );
        $this->assertReplayMatches( 'maker-reschedule', $body );
    }

    public function test_maker_reschedule_different_date_409(): void {
        // CRITICAL: maker editing reschedule date between retries = different intent.
        // Wrapper MUST surface 409 instead of replaying old date silently.
        $b1 = array(
            'po_id'    => 4001,
            'maker_id' => 12,
            'new_date' => '2026-05-15',
            'reason'   => 'วัตถุดิบขาด',
        );
        $b2 = array(
            'po_id'    => 4001,
            'maker_id' => 12,
            'new_date' => '2026-05-22',  // different new_date
            'reason'   => 'วัตถุดิบขาด',
        );
        $this->assertDifferentBody( 'maker-reschedule', $b1, $b2, 'new_date (2026-05-15 vs 2026-05-22)' );
    }

    // ── BATCH 10: MANUAL-FLASH-TEST ──

    public function test_manual_flash_test_first_call_success(): void {
        $body = array( 'action' => 'test' );
        $this->assertFirstCallSuccess( 'manual-flash-test', $body );
    }

    public function test_manual_flash_test_replay_matches(): void {
        $body = array( 'action' => 'test' );
        $this->assertReplayMatches( 'manual-flash-test', $body );
    }

    public function test_manual_flash_test_constant_marker_consistent(): void {
        // Endpoint has no body params → uses constant marker {action:'test'}. Different marker
        // would never naturally appear, but verify hash differs from empty body to confirm marker
        // discriminates from "any other endpoint with no body" (defense-in-depth).
        $b_marker = array( 'action' => 'test' );
        $b_empty  = array();
        $this->assertDifferentBody(
            'manual-flash-test',
            $b_marker,
            $b_empty,
            'marker {action:test} vs empty {} — hash collision risk if marker dropped'
        );
    }

    // ── BATCH 10: BO-UPDATE-ETA ──

    public function test_bo_update_eta_first_call_success(): void {
        $body = array(
            'bo_queue_id' => 555,
            'eta_days'    => 7,
            'notes'       => 'ผลิตเพิ่มจากโรงงาน B',
        );
        $this->assertFirstCallSuccess( 'bo-update-eta', $body );
    }

    public function test_bo_update_eta_replay_matches(): void {
        $body = array(
            'bo_queue_id' => 555,
            'eta_days'    => 7,
            'notes'       => 'ผลิตเพิ่มจากโรงงาน B',
        );
        $this->assertReplayMatches( 'bo-update-eta', $body );
    }

    public function test_bo_update_eta_different_notes_409(): void {
        // Notes append uses "|" separator → silent double-append on retry. Different notes between
        // retries = admin edited the message; wrapper MUST surface 409 instead of appending second.
        $b1 = array(
            'bo_queue_id' => 555,
            'eta_days'    => 7,
            'notes'       => 'ผลิตเพิ่มจากโรงงาน B',
        );
        $b2 = array(
            'bo_queue_id' => 555,
            'eta_days'    => 7,
            'notes'       => 'รอเรือเข้าเพิ่ม 3 วัน',  // edited message
        );
        $this->assertDifferentBody( 'bo-update-eta', $b1, $b2, 'notes (different message)' );
    }

    // ── BATCH 10: BO-RESTOCK-SCAN ──

    public function test_bo_restock_scan_first_call_success(): void {
        $body = array( 'sku' => 'DNCSETNX500EX001' );
        $this->assertFirstCallSuccess( 'bo-restock-scan', $body );
    }

    public function test_bo_restock_scan_replay_matches(): void {
        $body = array( 'sku' => 'DNCSETNX500EX001' );
        $this->assertReplayMatches( 'bo-restock-scan', $body );
    }

    public function test_bo_restock_scan_full_vs_specific_409(): void {
        // Full scan (sku='') + specific SKU scan have different cost profiles + different side
        // effects (full scan touches all pending rows, specific scan touches one). Wrapper MUST
        // hash differently — admin retry MUST NOT replay full-scan response when the new request
        // targets a specific SKU.
        $b_specific = array( 'sku' => 'DNCSETNX500EX001' );
        $b_full     = array( 'sku' => '' );
        $this->assertDifferentBody(
            'bo-restock-scan',
            $b_specific,
            $b_full,
            'sku target (specific vs full-scan)'
        );
    }

    // ── BATCH 10: REJECT-LOT ──

    public function test_reject_lot_first_call_success(): void {
        $body = array(
            'po_id'  => 4002,
            'reason' => 'งานไม่ผ่าน QC ทั้งล็อต ผิดสเปค',
        );
        $this->assertFirstCallSuccess( 'reject-lot', $body );
    }

    public function test_reject_lot_replay_matches(): void {
        $body = array(
            'po_id'  => 4002,
            'reason' => 'งานไม่ผ่าน QC ทั้งล็อต ผิดสเปค',
        );
        $this->assertReplayMatches( 'reject-lot', $body );
    }

    public function test_reject_lot_different_reason_409(): void {
        // Reject reason is the audit trail Maker reads. Admin editing reason between retries =
        // meaningful change in communication; wrapper MUST surface 409 not silent replay.
        $b1 = array(
            'po_id'  => 4002,
            'reason' => 'งานไม่ผ่าน QC ทั้งล็อต ผิดสเปค',
        );
        $b2 = array(
            'po_id'  => 4002,
            'reason' => 'พบสนิมที่จุดเชื่อม ต้องส่งใหม่',  // edited
        );
        $this->assertDifferentBody( 'reject-lot', $b1, $b2, 'reason' );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──
    // Verify all 5 Round 32 endpoint shapes hash uniquely + don't collide

    public function test_round_32_no_collision_via_fixture(): void {
        $body_map = array(
            'maker_reschedule' => array(
                'po_id'    => 1,
                'maker_id' => 1,
                'new_date' => '2026-05-15',
                'reason'   => 'r',
            ),
            'manual_flash_test' => array(
                'action' => 'test',
            ),
            'bo_update_eta' => array(
                'bo_queue_id' => 1,
                'eta_days'    => 7,
                'notes'       => 'n',
            ),
            'bo_restock_scan' => array(
                'sku' => 'DNCX',
            ),
            'reject_lot' => array(
                'po_id'  => 1,
                'reason' => 'r',
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 32', $body_map );
    }

    // ── CROSS-NAMESPACE PAIR GUARD ──
    // maker-reschedule + reject-lot both have `po_id` + `reason` shape. Defense-in-depth: even
    // when admin/maker accidentally reuse the same idempotency key across these 2 endpoints,
    // the schemas differ — maker-reschedule has `maker_id` int + `new_date` string, reject-lot
    // has only `po_id` + `reason`. Hash MUST differ.

    public function test_maker_reschedule_vs_reject_lot_no_collision(): void {
        $reschedule_body = array(
            'po_id'    => 100,
            'maker_id' => 5,
            'new_date' => '2026-05-15',
            'reason'   => 'วัตถุดิบขาด',
        );
        $reject_body = array(
            'po_id'  => 100,
            'reason' => 'วัตถุดิบขาด',
        );
        $this->assertDifferentBody(
            'maker-reschedule vs reject-lot',
            $reschedule_body,
            $reject_body,
            'schema shape (maker_id+new_date present in reschedule only)'
        );
    }
}
