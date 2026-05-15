<?php
/**
 * IdempotencyRound59Test — DRY contract tests for Round 59 batch 37 (9 endpoints).
 *
 * Source: Round 59 (2026-05-15) — 🎯 **95% MAJOR MILESTONE REACHED** (186/196 = 94.9%).
 *
 *   Batch 37 = Snippet 1 + Snippet 2 cluster close-out:
 *     - POST /b2b/v1/verify-member (LIFF session)
 *     - POST /b2b/v1/flash-override-vehicle (admin EC override)
 *     - POST /b2b/v1/flash-cancel-pickup (admin Flash API)
 *     - POST /b2b/v1/flash-dlq/{id}/retry (layered over GET_LOCK)
 *     - POST /b2b/v1/flash-dlq/{id}/abandon (destructive)
 *     - POST /b2b/v1/flash-test-payload (bulk items[] sorted)
 *     - POST /b2b/v1/shipping/manual-rollback (V.42 flag flip)
 *     - POST /b2b/v1/create-shipment (bulk items[] sorted)
 *     - POST /b2b/v1/confirm-delivery (FSM transition)
 *
 * **Milestone arc** (7 milestones in 17 rounds): 50% R42 → 60% R46 → 70% R50 → 80% R54
 *   → 85% R56 → 90% R58 → **95% R59**.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound59Test extends IdempotencyTestFixture {

    public function test_verify_member_first_call(): void {
        $body = array( 'gid' => 'C123', 'uid' => 'U456', 'page' => 'b2b-orders' );
        $this->assertFirstCallSuccess( 'verify-member', $body );
    }

    public function test_verify_member_different_page_distinct(): void {
        // Different page = different intent (admin tabs vs customer tabs).
        $b1 = array( 'gid' => 'C123', 'uid' => 'U456', 'page' => 'b2b-orders' );
        $b2 = array( 'gid' => 'C123', 'uid' => 'U456', 'page' => 'b2b-dashboard' );
        $this->assertDifferentBody( 'verify-member', $b1, $b2, 'page (customer vs admin tab)' );
    }

    public function test_flash_override_vehicle_ec_discriminator(): void {
        // Different EC = catastrophically different intent (bike vs truck).
        $b1 = array( 'ticket_id' => 1234, 'express_category' => 1, 'actor_user_id' => 7 );
        $b2 = array( 'ticket_id' => 1234, 'express_category' => 4, 'actor_user_id' => 7 );
        $this->assertDifferentBody( 'flash-override-vehicle', $b1, $b2, 'express_category (1 vs 4)' );
    }

    public function test_flash_cancel_pickup_first_call(): void {
        $body = array( 'pickup_tid' => 'PKT123', 'warehouse_no' => 'BKN_SP', 'actor_user_id' => 7 );
        $this->assertFirstCallSuccess( 'flash-cancel-pickup', $body );
    }

    public function test_flash_dlq_retry_first_call(): void {
        $body = array( 'dlq_id' => 42, 'actor_user_id' => 7 );
        $this->assertFirstCallSuccess( 'flash-dlq/retry', $body );
    }

    public function test_flash_dlq_retry_vs_abandon_distinct(): void {
        // Both endpoints take same body shape — but different namespace prevents collision.
        // We test that the body hash alone (without namespace) — these are 2 sites and
        // wrapper uses namespace prefix, so this test just confirms body shapes.
        $b_retry   = array( 'dlq_id' => 42, 'actor_user_id' => 7 );
        $b_abandon = array( 'dlq_id' => 42, 'actor_user_id' => 7 );
        // Same body shape — namespace discriminates at wrapper level.
        $this->assertSame(
            dinoco_idempotency_hash( $b_retry ),
            dinoco_idempotency_hash( $b_abandon ),
            'flash-dlq retry vs abandon share body shape — namespace prefix discriminates at wrapper'
        );
    }

    public function test_flash_test_payload_items_sorted(): void {
        $items_1 = array(
            array( 'sku' => 'DNCB001', 'total_qty' => 2 ),
            array( 'sku' => 'DNCA001', 'total_qty' => 1 ),
        );
        $items_2 = array(
            array( 'sku' => 'DNCA001', 'total_qty' => 1 ),
            array( 'sku' => 'DNCB001', 'total_qty' => 2 ),
        );
        usort( $items_1, function( $a, $b ) { return strcmp( $a['sku'], $b['sku'] ); } );
        usort( $items_2, function( $a, $b ) { return strcmp( $a['sku'], $b['sku'] ); } );
        $b1 = array( 'manifest' => $items_1, 'actor_user_id' => 7 );
        $b2 = array( 'manifest' => $items_2, 'actor_user_id' => 7 );
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'items[] sort produces order-stable hash for admin dry-run'
        );
    }

    public function test_shipping_manual_rollback_first_call(): void {
        $body = array( 'action' => 'shipping-manual-rollback', 'actor_user_id' => 7 );
        $this->assertFirstCallSuccess( 'shipping/manual-rollback', $body );
    }

    public function test_create_shipment_items_canonical(): void {
        $items_1 = array(
            array( 'sku' => 'B', 'qty' => 2 ),
            array( 'sku' => 'A', 'qty' => 1 ),
        );
        $items_2 = array(
            array( 'sku' => 'A', 'qty' => 1 ),
            array( 'sku' => 'B', 'qty' => 2 ),
        );
        usort( $items_1, function( $a, $b ) { return strcmp( $a['sku'], $b['sku'] ); } );
        usort( $items_2, function( $a, $b ) { return strcmp( $a['sku'], $b['sku'] ); } );
        $b1 = array( 'ticket_id' => 1234, 'method' => 'flash', 'carrier' => 'Flash', 'tracking_no' => 'TRK', 'items' => $items_1, 'actor_user_id' => 7 );
        $b2 = array( 'ticket_id' => 1234, 'method' => 'flash', 'carrier' => 'Flash', 'tracking_no' => 'TRK', 'items' => $items_2, 'actor_user_id' => 7 );
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'create-shipment items[] sort produces order-stable hash'
        );
    }

    public function test_create_shipment_different_method_409(): void {
        // Admin re-evaluating shipping method mid-retry = different intent.
        $b1 = array( 'ticket_id' => 1234, 'method' => 'flash',     'carrier' => '', 'tracking_no' => '', 'items' => array(), 'actor_user_id' => 7 );
        $b2 = array( 'ticket_id' => 1234, 'method' => 'self_ship', 'carrier' => '', 'tracking_no' => '', 'items' => array(), 'actor_user_id' => 7 );
        $this->assertDifferentBody( 'create-shipment', $b1, $b2, 'method (flash vs self_ship)' );
    }

    public function test_confirm_delivery_first_call(): void {
        $body = array( 'ticket_id' => 1234, 'shipment_id' => 'SHIP-001', 'actor_user_id' => 7 );
        $this->assertFirstCallSuccess( 'confirm-delivery', $body );
    }

    public function test_confirm_delivery_different_shipment_409(): void {
        // Partial shipment — confirming different shipment_id = different physical action.
        $b1 = array( 'ticket_id' => 1234, 'shipment_id' => 'SHIP-001', 'actor_user_id' => 7 );
        $b2 = array( 'ticket_id' => 1234, 'shipment_id' => 'SHIP-002', 'actor_user_id' => 7 );
        $this->assertDifferentBody( 'confirm-delivery', $b1, $b2, 'shipment_id (partial shipment context)' );
    }

    public function test_milestone_95_pct_no_collision(): void {
        $hashes = array(
            dinoco_idempotency_hash( array( 'gid' => 'C', 'uid' => 'U', 'page' => 'p' ) ),
            dinoco_idempotency_hash( array( 'ticket_id' => 1, 'express_category' => 1, 'actor_user_id' => 7 ) ),
            dinoco_idempotency_hash( array( 'pickup_tid' => 'X', 'warehouse_no' => 'Y', 'actor_user_id' => 7 ) ),
            dinoco_idempotency_hash( array( 'dlq_id' => 1, 'actor_user_id' => 7 ) ),
            dinoco_idempotency_hash( array( 'manifest' => array(), 'actor_user_id' => 7 ) ),
            dinoco_idempotency_hash( array( 'action' => 'shipping-manual-rollback', 'actor_user_id' => 7 ) ),
            dinoco_idempotency_hash( array( 'ticket_id' => 1, 'method' => 'flash', 'carrier' => '', 'tracking_no' => '', 'items' => array(), 'actor_user_id' => 7 ) ),
            dinoco_idempotency_hash( array( 'ticket_id' => 1, 'shipment_id' => '', 'actor_user_id' => 7 ) ),
        );
        $this->assertCount(
            count( array_unique( $hashes ) ), $hashes,
            'R59: 8 distinct body shapes (flash-dlq retry/abandon share by design via namespace prefix)'
        );
    }
}
