<?php
/**
 * IdempotencyRound30Test — DRY contract tests for Round 30 batch 8 (6 endpoints).
 *
 * Source: Round 30 (2026-04-30) — 50% Idempotency coverage milestone.
 *
 *   F1 HIGH FIX: bo-fulfill drift remediation — Round 29 drift sweep flagged the
 *     tracker entry as "integrated" since Round 19 but actual code had NO wrapper.
 *     Now wrapped: body hash {order_id, items[sort by bo_queue_id, qty]}.
 *
 *   Batch 8 NEW (5 endpoints):
 *     - POST /dinoco-mcp/v1/claim-manual-create — chatbot retry
 *     - POST /dinoco-mcp/v1/lead-create — chatbot retry
 *     - POST /dinoco-stock/v1/stock/initialize — admin one-time setup
 *     - POST /dinoco-stock/v1/stock/adjust — admin manual stock adjust
 *     - POST /dinoco-stock/v1/stock/transfer — warehouse transfer
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). Each endpoint
 * gets 3 cases (first_call_success / replay_matches / different_field_409) +
 * cumulative no-collision check + cross-namespace check (bo-fulfill shape vs
 * stock-adjust shape).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound30Test extends IdempotencyTestFixture {

    // ── F1 FIX: BO-FULFILL (single — wrapper missing pre-V.3.6) ──

    public function test_bo_fulfill_first_call_success(): void {
        $body = array(
            'order_id' => 5001,
            'items'    => array(
                array( 'bo_queue_id' => 101, 'qty' => 5 ),
                array( 'bo_queue_id' => 102, 'qty' => 3 ),
            ),
        );
        $this->assertFirstCallSuccess( 'bo-fulfill', $body );
    }

    public function test_bo_fulfill_replay_matches(): void {
        $body = array(
            'order_id' => 5001,
            'items'    => array(
                array( 'bo_queue_id' => 101, 'qty' => 5 ),
                array( 'bo_queue_id' => 102, 'qty' => 3 ),
            ),
        );
        $this->assertReplayMatches( 'bo-fulfill', $body );
    }

    public function test_bo_fulfill_different_qty_409(): void {
        $b1 = array(
            'order_id' => 5001,
            'items'    => array( array( 'bo_queue_id' => 101, 'qty' => 5 ) ),
        );
        $b2 = array(
            'order_id' => 5001,
            'items'    => array( array( 'bo_queue_id' => 101, 'qty' => 6 ) ),
        );
        $this->assertDifferentBody( 'bo-fulfill', $b1, $b2, 'items[0].qty' );
    }

    // ── BATCH 8: CLAIM-MANUAL-CREATE ──

    public function test_claim_manual_create_first_call_success(): void {
        $body = array(
            'serial'    => 'SN-12345',
            'symptoms'  => 'หักเอนไม่ลง',
            'source_id' => 'fb_user_999',
            'platform'  => 'facebook',
            'customer'  => 'สมชาย',
            'phone'     => '0812345678',
        );
        $this->assertFirstCallSuccess( 'claim-manual-create', $body );
    }

    public function test_claim_manual_create_replay_matches(): void {
        $body = array(
            'serial'    => 'SN-12345',
            'symptoms'  => 'หักเอนไม่ลง',
            'source_id' => 'fb_user_999',
            'platform'  => 'facebook',
            'customer'  => 'สมชาย',
            'phone'     => '0812345678',
        );
        $this->assertReplayMatches( 'claim-manual-create', $body );
    }

    public function test_claim_manual_create_different_source_id_409(): void {
        $b1 = array(
            'serial'    => 'SN-12345',
            'symptoms'  => 'หักเอนไม่ลง',
            'source_id' => 'fb_user_999',
            'platform'  => 'facebook',
            'customer'  => 'สมชาย',
            'phone'     => '0812345678',
        );
        $b2 = array(
            'serial'    => 'SN-12345',
            'symptoms'  => 'หักเอนไม่ลง',
            'source_id' => 'fb_user_777',
            'platform'  => 'facebook',
            'customer'  => 'สมชาย',
            'phone'     => '0812345678',
        );
        $this->assertDifferentBody( 'claim-manual-create', $b1, $b2, 'source_id' );
    }

    // ── BATCH 8: LEAD-CREATE ──

    public function test_lead_create_first_call_success(): void {
        $body = array(
            'source_id'        => 'ig_user_123',
            'phone'            => '0998877665',
            'platform'         => 'instagram',
            'product_interest' => 'Top Box',
            'customer_name'    => 'สมหญิง',
        );
        $this->assertFirstCallSuccess( 'lead-create', $body );
    }

    public function test_lead_create_replay_matches(): void {
        $body = array(
            'source_id'        => 'ig_user_123',
            'phone'            => '0998877665',
            'platform'         => 'instagram',
            'product_interest' => 'Top Box',
            'customer_name'    => 'สมหญิง',
        );
        $this->assertReplayMatches( 'lead-create', $body );
    }

    public function test_lead_create_different_phone_409(): void {
        $b1 = array(
            'source_id'        => 'ig_user_123',
            'phone'            => '0998877665',
            'platform'         => 'instagram',
            'product_interest' => 'Top Box',
            'customer_name'    => 'สมหญิง',
        );
        $b2 = array(
            'source_id'        => 'ig_user_123',
            'phone'            => '0811112222',
            'platform'         => 'instagram',
            'product_interest' => 'Top Box',
            'customer_name'    => 'สมหญิง',
        );
        $this->assertDifferentBody( 'lead-create', $b1, $b2, 'phone' );
    }

    // ── BATCH 8: STOCK-INITIALIZE (constant-body marker) ──

    public function test_stock_initialize_first_call_success(): void {
        $this->assertFirstCallSuccess( 'stock-initialize', array( 'action' => 'init' ) );
    }

    public function test_stock_initialize_replay_matches(): void {
        $this->assertReplayMatches( 'stock-initialize', array( 'action' => 'init' ) );
    }

    public function test_stock_initialize_constant_marker_stable(): void {
        // Verify the constant-marker pattern produces stable hashes (not time-based)
        $b1 = array( 'action' => 'init' );
        $b2 = array( 'action' => 'init' );
        // Identical → same hash (replay safety even with no other params)
        $h1 = dinoco_idempotency_hash( $b1 );
        $h2 = dinoco_idempotency_hash( $b2 );
        $this->assertSame( $h1, $h2,
            "[stock-initialize] Constant-marker body MUST yield deterministic hash " .
            "(no timestamp/random in hash). Got: {$h1} vs {$h2}"
        );
    }

    // ── BATCH 8: STOCK-ADJUST ──

    public function test_stock_adjust_first_call_success(): void {
        $body = array(
            'sku'          => 'DNCXL7500X001H',
            'type'         => 'add',
            'qty'          => 50,
            'reason'       => 'Receive from B2F',
            'warehouse_id' => 1,
        );
        $this->assertFirstCallSuccess( 'stock-adjust', $body );
    }

    public function test_stock_adjust_replay_matches(): void {
        $body = array(
            'sku'          => 'DNCXL7500X001H',
            'type'         => 'add',
            'qty'          => 50,
            'reason'       => 'Receive from B2F',
            'warehouse_id' => 1,
        );
        $this->assertReplayMatches( 'stock-adjust', $body );
    }

    public function test_stock_adjust_add_vs_subtract_409(): void {
        // CRITICAL: type=add vs type=subtract on same SKU+qty would be silent disaster
        // — wrapper MUST distinguish via type field in hash
        $b_add = array(
            'sku'          => 'DNCXL7500X001H',
            'type'         => 'add',
            'qty'          => 50,
            'reason'       => 'Receive',
            'warehouse_id' => 1,
        );
        $b_sub = array(
            'sku'          => 'DNCXL7500X001H',
            'type'         => 'subtract',
            'qty'          => 50,
            'reason'       => 'Receive',
            'warehouse_id' => 1,
        );
        $this->assertDifferentBody( 'stock-adjust', $b_add, $b_sub, 'type (add vs subtract)' );
    }

    public function test_stock_adjust_different_qty_409(): void {
        $b1 = array(
            'sku'          => 'DNCXL7500X001H',
            'type'         => 'add',
            'qty'          => 50,
            'reason'       => 'Receive',
            'warehouse_id' => 1,
        );
        $b2 = array(
            'sku'          => 'DNCXL7500X001H',
            'type'         => 'add',
            'qty'          => 100,
            'reason'       => 'Receive',
            'warehouse_id' => 1,
        );
        $this->assertDifferentBody( 'stock-adjust', $b1, $b2, 'qty' );
    }

    // ── BATCH 8: STOCK-TRANSFER ──

    public function test_stock_transfer_first_call_success(): void {
        $body = array(
            'sku'     => 'DNCXL7500X001H',
            'from_wh' => 1,
            'to_wh'   => 2,
            'qty'     => 30,
            'reason'  => 'Rebalance to BKK warehouse',
        );
        $this->assertFirstCallSuccess( 'stock-transfer', $body );
    }

    public function test_stock_transfer_replay_matches(): void {
        $body = array(
            'sku'     => 'DNCXL7500X001H',
            'from_wh' => 1,
            'to_wh'   => 2,
            'qty'     => 30,
            'reason'  => 'Rebalance to BKK warehouse',
        );
        $this->assertReplayMatches( 'stock-transfer', $body );
    }

    public function test_stock_transfer_swap_warehouses_409(): void {
        // CRITICAL: from_wh=1→to_wh=2 is OPPOSITE of from_wh=2→to_wh=1
        // Wrapper MUST distinguish to prevent reversed transfer being treated as replay
        $b1 = array(
            'sku'     => 'DNCXL7500X001H',
            'from_wh' => 1,
            'to_wh'   => 2,
            'qty'     => 30,
            'reason'  => 'Rebalance',
        );
        $b2 = array(
            'sku'     => 'DNCXL7500X001H',
            'from_wh' => 2,
            'to_wh'   => 1,
            'qty'     => 30,
            'reason'  => 'Rebalance',
        );
        $this->assertDifferentBody( 'stock-transfer', $b1, $b2, 'from_wh/to_wh swap' );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──
    // Verify all 6 Round 30 endpoint shapes hash uniquely + don't collide with each other

    public function test_round_30_no_collision_via_fixture(): void {
        $body_map = array(
            'bo_fulfill' => array(
                'order_id' => 5001,
                'items'    => array( array( 'bo_queue_id' => 101, 'qty' => 5 ) ),
            ),
            'claim_manual_create' => array(
                'serial'    => 'SN-1',
                'symptoms'  => 's',
                'source_id' => 'fb1',
                'platform'  => 'facebook',
                'customer'  => 'A',
                'phone'     => '0800000000',
            ),
            'lead_create' => array(
                'source_id'        => 'fb1',
                'phone'            => '0800000000',
                'platform'         => 'facebook',
                'product_interest' => 'X',
                'customer_name'    => 'A',
            ),
            'stock_initialize' => array( 'action' => 'init' ),
            'stock_adjust' => array(
                'sku'          => 'DNCX',
                'type'         => 'add',
                'qty'          => 10,
                'reason'       => 'r',
                'warehouse_id' => 1,
            ),
            'stock_transfer' => array(
                'sku'     => 'DNCX',
                'from_wh' => 1,
                'to_wh'   => 2,
                'qty'     => 10,
                'reason'  => 'r',
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 30', $body_map );
    }

    // ── CROSS-NAMESPACE COLLISION GUARD ──
    // claim-manual-create + lead-create both have source_id + phone — but different shape;
    // verify they cannot accidentally match (defense against namespace-stripped collision).

    public function test_claim_create_vs_lead_create_no_collision(): void {
        // Even when source_id + phone happen to be identical for both, the body schemas
        // differ — claim has 'symptoms', lead has 'product_interest'. Hash MUST differ.
        $claim_body = array(
            'serial'    => '',
            'symptoms'  => 'noisy',
            'source_id' => 'shared_user',
            'platform'  => 'line',
            'customer'  => 'X',
            'phone'     => '0811111111',
        );
        $lead_body = array(
            'source_id'        => 'shared_user',
            'phone'            => '0811111111',
            'platform'         => 'line',
            'product_interest' => 'Top Box',
            'customer_name'    => 'X',
        );
        $this->assertDifferentBody(
            'claim-manual-create vs lead-create',
            $claim_body,
            $lead_body,
            'schema shape (symptoms vs product_interest)'
        );
    }
}
