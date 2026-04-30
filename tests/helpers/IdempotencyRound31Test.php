<?php
/**
 * IdempotencyRound31Test — DRY contract tests for Round 31 batch 9 (5 endpoints).
 *
 * Source: Round 31 (2026-04-30) — push toward 22.8% coverage milestone (44/193).
 *
 *   Batch 9 NEW (5 endpoints — all status-update / pair partners):
 *     - POST /dinoco-mcp/v1/claim-manual-update — pair กับ claim-manual-create (Round 30)
 *     - POST /dinoco-mcp/v1/lead-update         — pair กับ lead-create (Round 30)
 *     - POST /dinoco-stock/v1/product/pricing   — admin tier price dual-write
 *     - POST /dinoco-stock/v1/warehouse         — warehouse CRUD (create/update)
 *     - POST /b2f/v1/maker-reject               — pair กับ maker-confirm (Round 25)
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per endpoint
 * (first_call_success / replay_matches / different_field_409) + cumulative no-collision +
 * cross-namespace pair guard (claim-update vs lead-update share status enum but different shape).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound31Test extends IdempotencyTestFixture {

    // ── BATCH 9: CLAIM-MANUAL-UPDATE ──

    public function test_claim_manual_update_first_call_success(): void {
        $body = array(
            'claim_id'        => 12345,
            'status'          => 'approved',
            'case_type'       => 'case_a',
            'tracking_number' => 'EX1234567890',
        );
        $this->assertFirstCallSuccess( 'claim-manual-update', $body );
    }

    public function test_claim_manual_update_replay_matches(): void {
        $body = array(
            'claim_id'        => 12345,
            'status'          => 'approved',
            'case_type'       => 'case_a',
            'tracking_number' => 'EX1234567890',
        );
        $this->assertReplayMatches( 'claim-manual-update', $body );
    }

    public function test_claim_manual_update_different_status_409(): void {
        // CRITICAL: different status = different transition (approved vs reject).
        // Wrapper MUST distinguish or admin retry could silently revert state.
        $b1 = array(
            'claim_id'        => 12345,
            'status'          => 'approved',
            'case_type'       => 'case_a',
            'tracking_number' => 'EX1234567890',
        );
        $b2 = array(
            'claim_id'        => 12345,
            'status'          => 'rejected',
            'case_type'       => 'case_a',
            'tracking_number' => 'EX1234567890',
        );
        $this->assertDifferentBody( 'claim-manual-update', $b1, $b2, 'status (approved vs rejected)' );
    }

    // ── BATCH 9: LEAD-UPDATE ──

    public function test_lead_update_first_call_success(): void {
        $body = array(
            'lead_id'     => 'LEAD-1735000000-abc',
            'status'      => 'qualified',
            'updated_by'  => 'agent_001',
            'followup_at' => '2026-05-15 14:00:00',
        );
        $this->assertFirstCallSuccess( 'lead-update', $body );
    }

    public function test_lead_update_replay_matches(): void {
        $body = array(
            'lead_id'     => 'LEAD-1735000000-abc',
            'status'      => 'qualified',
            'updated_by'  => 'agent_001',
            'followup_at' => '2026-05-15 14:00:00',
        );
        $this->assertReplayMatches( 'lead-update', $body );
    }

    public function test_lead_update_different_status_409(): void {
        // CRITICAL: qualified vs converted transition are very different (sales pipeline).
        $b1 = array(
            'lead_id'     => 'LEAD-1735000000-abc',
            'status'      => 'qualified',
            'updated_by'  => 'agent_001',
            'followup_at' => '2026-05-15 14:00:00',
        );
        $b2 = array(
            'lead_id'     => 'LEAD-1735000000-abc',
            'status'      => 'converted',
            'updated_by'  => 'agent_001',
            'followup_at' => '2026-05-15 14:00:00',
        );
        $this->assertDifferentBody( 'lead-update', $b1, $b2, 'status (qualified vs converted)' );
    }

    // ── BATCH 9: PRODUCT/PRICING ──

    public function test_product_pricing_first_call_success(): void {
        $body = array(
            'sku'              => 'DNCXL7500X001H',
            'discount_percent' => 20.0,
            'price_silver'     => 15.0,
            'price_gold'       => 25.0,
            'price_platinum'   => 35.0,
            'price_diamond'    => 45.0,
            'category'         => 'crash_bar',
            'moq'              => 1,
            'boxes_per_unit'   => 1,
            'units_per_box'    => 1,
            'b2b_visible'      => 1,
        );
        $this->assertFirstCallSuccess( 'product-pricing', $body );
    }

    public function test_product_pricing_replay_matches(): void {
        $body = array(
            'sku'              => 'DNCXL7500X001H',
            'discount_percent' => 20.0,
            'price_silver'     => 15.0,
            'price_gold'       => 25.0,
            'price_platinum'   => 35.0,
            'price_diamond'    => 45.0,
            'category'         => 'crash_bar',
            'moq'              => 1,
            'boxes_per_unit'   => 1,
            'units_per_box'    => 1,
            'b2b_visible'      => 1,
        );
        $this->assertReplayMatches( 'product-pricing', $body );
    }

    public function test_product_pricing_different_diamond_409(): void {
        // CRITICAL: changing top tier price by even small amount = different intent.
        // Same key + different diamond price = admin edited then re-clicked.
        $b1 = array(
            'sku'           => 'DNCXL7500X001H',
            'price_diamond' => 45.0,
            'b2b_visible'   => 1,
        );
        $b2 = array(
            'sku'           => 'DNCXL7500X001H',
            'price_diamond' => 50.0,
            'b2b_visible'   => 1,
        );
        $this->assertDifferentBody( 'product-pricing', $b1, $b2, 'price_diamond' );
    }

    // ── BATCH 9: WAREHOUSE ──

    public function test_warehouse_first_call_success(): void {
        $body = array(
            'id'         => 0,         // create new
            'name'       => 'โกดังลาดพร้าว',
            'code'       => 'BKK1',
            'address'    => '21/106 ลาดพร้าว 15 กรุงเทพ',
            'is_default' => 0,
            'is_active'  => 1,
        );
        $this->assertFirstCallSuccess( 'warehouse', $body );
    }

    public function test_warehouse_replay_matches(): void {
        $body = array(
            'id'         => 0,
            'name'       => 'โกดังลาดพร้าว',
            'code'       => 'BKK1',
            'address'    => '21/106 ลาดพร้าว 15 กรุงเทพ',
            'is_default' => 0,
            'is_active'  => 1,
        );
        $this->assertReplayMatches( 'warehouse', $body );
    }

    public function test_warehouse_create_vs_update_409(): void {
        // CRITICAL: id=0 (create) vs id=5 (update) on same code+name are completely different
        // operations. Wrapper MUST distinguish — same idempotency key on different intents
        // must return 409 to surface the bug to admin.
        $b_create = array(
            'id'         => 0,
            'name'       => 'โกดังหลัก',
            'code'       => 'MAIN',
            'address'    => 'addr',
            'is_default' => 1,
            'is_active'  => 1,
        );
        $b_update = array(
            'id'         => 5,
            'name'       => 'โกดังหลัก',
            'code'       => 'MAIN',
            'address'    => 'addr',
            'is_default' => 1,
            'is_active'  => 1,
        );
        $this->assertDifferentBody( 'warehouse', $b_create, $b_update, 'id (0 create vs 5 update)' );
    }

    // ── BATCH 9: MAKER-REJECT ──

    public function test_maker_reject_first_call_success(): void {
        $body = array(
            'po_id'    => 4001,
            'maker_id' => 12,
            'reason'   => 'วัตถุดิบขาด ส่งไม่ทัน',
        );
        $this->assertFirstCallSuccess( 'maker-reject', $body );
    }

    public function test_maker_reject_replay_matches(): void {
        $body = array(
            'po_id'    => 4001,
            'maker_id' => 12,
            'reason'   => 'วัตถุดิบขาด ส่งไม่ทัน',
        );
        $this->assertReplayMatches( 'maker-reject', $body );
    }

    public function test_maker_reject_different_reason_409(): void {
        // Different rejection reasons = different audit trail. Maker editing reason between
        // retries is a meaningful change — wrapper MUST surface 409 not silent replay.
        $b1 = array(
            'po_id'    => 4001,
            'maker_id' => 12,
            'reason'   => 'วัตถุดิบขาด ส่งไม่ทัน',
        );
        $b2 = array(
            'po_id'    => 4001,
            'maker_id' => 12,
            'reason'   => 'งานไม่ผ่าน QC',
        );
        $this->assertDifferentBody( 'maker-reject', $b1, $b2, 'reason' );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──
    // Verify all 5 Round 31 endpoint shapes hash uniquely + don't collide

    public function test_round_31_no_collision_via_fixture(): void {
        $body_map = array(
            'claim_manual_update' => array(
                'claim_id'        => 1,
                'status'          => 'approved',
                'case_type'       => 'case_a',
                'tracking_number' => '',
            ),
            'lead_update' => array(
                'lead_id'     => 'LEAD-1',
                'status'      => 'qualified',
                'updated_by'  => 'a',
                'followup_at' => '',
            ),
            'product_pricing' => array(
                'sku'           => 'DNCX',
                'price_diamond' => 45.0,
                'b2b_visible'   => 1,
            ),
            'warehouse' => array(
                'id'         => 0,
                'name'       => 'X',
                'code'       => 'X',
                'address'    => '',
                'is_default' => 0,
                'is_active'  => 1,
            ),
            'maker_reject' => array(
                'po_id'    => 1,
                'maker_id' => 1,
                'reason'   => 'r',
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 31', $body_map );
    }

    // ── CROSS-NAMESPACE PAIR GUARD ──
    // claim-manual-update + lead-update both have status field. Defense-in-depth: even when
    // status enum value happens to overlap (e.g. status='qualified' invalid for claim, but
    // wrapper hashes raw fields not validated values), the body schemas differ — claim has
    // 'claim_id' int + 'case_type'; lead has 'lead_id' string + 'updated_by'. Hash MUST differ.

    public function test_claim_update_vs_lead_update_no_collision(): void {
        $claim_body = array(
            'claim_id'        => 100,
            'status'          => 'approved',
            'case_type'       => 'case_a',
            'tracking_number' => 'EX1',
        );
        $lead_body = array(
            'lead_id'     => '100',
            'status'      => 'approved',  // hypothetically same string
            'updated_by'  => 'agent',
            'followup_at' => '',
        );
        $this->assertDifferentBody(
            'claim-update vs lead-update',
            $claim_body,
            $lead_body,
            'schema shape (claim_id int + case_type vs lead_id string + updated_by)'
        );
    }
}
