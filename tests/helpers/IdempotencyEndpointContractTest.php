<?php
/**
 * IdempotencyEndpointContractTest — verify body normalization contracts
 * for Round 19 endpoint integrations.
 *
 * Source: [B2B] Snippet 3 V.42.10 (place-order, manual-flash-create)
 *         [B2F] Snippet 2 V.11.11 (create-po)
 *
 * Scope: Pure-logic tests of the BODY HASH INPUT shape used by each endpoint.
 * We don't test WP_REST_Request handling (that's WP), we test that the
 * specific field set chosen for hashing produces the expected behaviors:
 *
 *   1. Same semantic request → same hash (replay works)
 *   2. Different semantic request → different hash (409 fires)
 *   3. Cosmetic differences (whitespace, casing per-field) → handled by
 *      sanitize_text_field at integration time (we only test post-sanitize shape)
 *
 * Why these matter:
 *   - place-order: forgetting `edit_ticket` in hash → edit retry collides
 *     with new-order retry → wrong cached response replayed
 *   - manual-flash-create: forgetting `weight` in hash → wrong cached PNO
 *     replayed for different parcel size
 *   - create-po: forgetting `exchange_rate` in hash → THB-only PO and
 *     CNY PO with same items would collide (DOUBLE-CHARGE risk)
 *
 * NOTE: These are CONTRACT tests — if hash input field set changes, expected
 * hash values will change, but invariants (same → same, different → different)
 * stay constant.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// Reuse hash helper from IdempotencyTest (same namespace)
require_once __DIR__ . '/IdempotencyTest.php';

class IdempotencyEndpointContractTest extends TestCase {

    // ════════════════════════════════════════════════════════════════
    // PLACE-ORDER body shape (V.42.10)
    //   { gid, items[], note, edit_ticket }
    // ════════════════════════════════════════════════════════════════

    /** @return array{gid: string, items: array, note: string, edit_ticket: int} */
    private function place_order_body( array $overrides = array() ): array {
        return array_merge( array(
            'gid'         => 'C1234567890',
            'items'       => array( array( 'sku' => 'DNCS500', 'qty' => 2 ) ),
            'note'        => '',
            'edit_ticket' => 0,
        ), $overrides );
    }

    public function test_place_order_identical_body_same_hash(): void {
        $body1 = $this->place_order_body();
        $body2 = $this->place_order_body();
        $this->assertSame(
            dinoco_idempotency_hash( $body1 ),
            dinoco_idempotency_hash( $body2 ),
            'Identical place-order bodies MUST produce same hash for replay'
        );
    }

    public function test_place_order_different_qty_different_hash(): void {
        $body1 = $this->place_order_body();
        $body2 = $this->place_order_body( array(
            'items' => array( array( 'sku' => 'DNCS500', 'qty' => 99 ) ),
        ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $body1 ),
            dinoco_idempotency_hash( $body2 ),
            'Different qty MUST trigger 409 conflict (prevents wrong replay)'
        );
    }

    public function test_place_order_different_sku_different_hash(): void {
        $body1 = $this->place_order_body();
        $body2 = $this->place_order_body( array(
            'items' => array( array( 'sku' => 'DNCS999', 'qty' => 2 ) ),
        ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $body1 ),
            dinoco_idempotency_hash( $body2 )
        );
    }

    public function test_place_order_edit_vs_new_must_be_distinct(): void {
        // CRITICAL: same key reused for new vs edit → MUST be 409
        // (otherwise editor sees new-order response or vice versa)
        $body_new  = $this->place_order_body( array( 'edit_ticket' => 0 ) );
        $body_edit = $this->place_order_body( array( 'edit_ticket' => 7777 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $body_new ),
            dinoco_idempotency_hash( $body_edit ),
            'edit_ticket field is REQUIRED in hash to discriminate new vs edit retry'
        );
    }

    public function test_place_order_different_gid_different_hash(): void {
        // Two distributors with same key (collision via separate clients)
        $body1 = $this->place_order_body( array( 'gid' => 'C111' ) );
        $body2 = $this->place_order_body( array( 'gid' => 'C222' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $body1 ),
            dinoco_idempotency_hash( $body2 ),
            'gid in hash prevents cross-distributor cache poisoning'
        );
    }

    public function test_place_order_note_difference_triggers_conflict(): void {
        // User edits note between retry — MUST surface as 409 (client bug or intentional)
        $body1 = $this->place_order_body( array( 'note' => 'ส่งด่วน' ) );
        $body2 = $this->place_order_body( array( 'note' => 'ส่งปกติ' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $body1 ),
            dinoco_idempotency_hash( $body2 )
        );
    }

    // ════════════════════════════════════════════════════════════════
    // MANUAL-FLASH-CREATE body shape (V.42.10)
    //   { dst_*, item_desc, weight, sku, sender_key, length_cm, width_cm, height_cm }
    // ════════════════════════════════════════════════════════════════

    /** @return array */
    private function manual_flash_body( array $overrides = array() ): array {
        return array_merge( array(
            'dst_name'     => 'นาย ทดสอบ',
            'dst_phone'    => '0812345678',
            'dst_address'  => '21/106 ลาดพร้าว',
            'dst_district' => 'จอมพล',
            'dst_city'     => 'จตุจักร',
            'dst_province' => 'กรุงเทพ',
            'dst_postcode' => '10900',
            'item_desc'    => 'DINOCO Products',
            'weight'       => 1500,
            'sku'          => 'DNCS500',
            'sender_key'   => 'dinoco',
            'length_cm'    => 30,
            'width_cm'     => 20,
            'height_cm'    => 15,
        ), $overrides );
    }

    public function test_manual_flash_identical_body_same_hash(): void {
        $b1 = $this->manual_flash_body();
        $b2 = $this->manual_flash_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_manual_flash_different_address_different_hash(): void {
        // Different recipient → MUST be different (else wrong PNO replayed)
        $b1 = $this->manual_flash_body( array( 'dst_address' => 'ที่อยู่ A' ) );
        $b2 = $this->manual_flash_body( array( 'dst_address' => 'ที่อยู่ B' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_manual_flash_different_weight_different_hash(): void {
        // Same recipient + different weight → 409
        // (Otherwise replay would return PNO computed for wrong weight)
        $b1 = $this->manual_flash_body( array( 'weight' => 1000 ) );
        $b2 = $this->manual_flash_body( array( 'weight' => 5000 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_manual_flash_different_dims_different_hash(): void {
        // Same recipient + different parcel size → 409 (Flash dispatch differs)
        $b1 = $this->manual_flash_body( array( 'length_cm' => 30 ) );
        $b2 = $this->manual_flash_body( array( 'length_cm' => 60 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_manual_flash_different_sender_different_hash(): void {
        // Sender override (DINOCO PPT vs FoxRiderShop) MUST surface in hash
        $b1 = $this->manual_flash_body( array( 'sender_key' => 'dinoco' ) );
        $b2 = $this->manual_flash_body( array( 'sender_key' => 'foxrider' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_manual_flash_phone_difference_triggers_conflict(): void {
        // Typo correction on retry → MUST be 409 (client probably forgot to refresh key)
        $b1 = $this->manual_flash_body( array( 'dst_phone' => '0812345678' ) );
        $b2 = $this->manual_flash_body( array( 'dst_phone' => '0899999999' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    // ════════════════════════════════════════════════════════════════
    // CREATE-PO body shape (V.11.11)
    //   { user_id, maker_id, items[], note, requested_date, exchange_rate, shipping_method }
    // ════════════════════════════════════════════════════════════════

    /** @return array */
    private function create_po_body( array $overrides = array() ): array {
        return array_merge( array(
            'user_id'         => 1,
            'maker_id'        => 1234,
            'items'           => array(
                array( 'sku' => 'DNCSETSTD500', 'qty' => 5 ),
            ),
            'note'            => '',
            'requested_date'  => '2026-05-15',
            'exchange_rate'   => 1.0,
            'shipping_method' => '',
        ), $overrides );
    }

    public function test_create_po_identical_body_same_hash(): void {
        $b1 = $this->create_po_body();
        $b2 = $this->create_po_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_create_po_different_exchange_rate_different_hash(): void {
        // CRITICAL — DOUBLE-CHARGE prevention test
        // If client retries with refreshed CNY rate (e.g. 5.0 → 5.5), MUST be 409
        // (otherwise replay locks in stale rate but client thinks it's the new one)
        $b1 = $this->create_po_body( array(
            'exchange_rate' => 5.0,
            'shipping_method' => 'land',
        ) );
        $b2 = $this->create_po_body( array(
            'exchange_rate' => 5.5,
            'shipping_method' => 'land',
        ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'exchange_rate MUST be in hash to prevent stale-rate replay (double-charge)'
        );
    }

    public function test_create_po_different_shipping_method_different_hash(): void {
        // land vs sea = different cost calculation → 409
        $b1 = $this->create_po_body( array(
            'exchange_rate' => 5.0,
            'shipping_method' => 'land',
        ) );
        $b2 = $this->create_po_body( array(
            'exchange_rate' => 5.0,
            'shipping_method' => 'sea',
        ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_create_po_different_user_different_hash(): void {
        // Two admins with same key (collision risk) → 409
        $b1 = $this->create_po_body( array( 'user_id' => 5 ) );
        $b2 = $this->create_po_body( array( 'user_id' => 12 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'user_id namespacing prevents cross-admin cache poisoning'
        );
    }

    public function test_create_po_different_maker_different_hash(): void {
        // Same items but different maker = different PO → 409
        $b1 = $this->create_po_body( array( 'maker_id' => 1234 ) );
        $b2 = $this->create_po_body( array( 'maker_id' => 5678 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_create_po_different_qty_different_hash(): void {
        $b1 = $this->create_po_body();
        $b2 = $this->create_po_body( array(
            'items' => array(
                array( 'sku' => 'DNCSETSTD500', 'qty' => 999 ),
            ),
        ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_create_po_v7_order_intent_intent_notes_in_items_different_hash(): void {
        // V.7.0: order_mode/source_sku/intent_notes are PART of items[] array,
        // so different intent in same items → different hash
        $items_a = array(
            array( 'sku' => 'DNCSETSTD500', 'qty' => 5, 'order_mode' => 'full_set', 'source_sku' => 'DNCSETSTD500' ),
        );
        $items_b = array(
            array( 'sku' => 'DNCSETSTD500', 'qty' => 5, 'order_mode' => 'sub_unit',  'source_sku' => 'DNCSETSTD500' ),
        );
        $b1 = $this->create_po_body( array( 'items' => $items_a ) );
        $b2 = $this->create_po_body( array( 'items' => $items_b ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'V.7.0 order_mode in items[] MUST contribute to hash (DD-3 composite merge key correctness)'
        );
    }

    // ════════════════════════════════════════════════════════════════
    // CROSS-NAMESPACE COLLISION SAFETY
    //   Same key + same body shape from different namespaces should
    //   live in separate cache slots — namespace string is part of
    //   storage key (table composite UNIQUE), not the hash itself.
    //   This is enforced at storage layer (Round 18) — but the per-
    //   endpoint body shape MUST be different enough that even if
    //   namespace was bypassed, collision is unlikely.
    // ════════════════════════════════════════════════════════════════

    public function test_cross_endpoint_body_shapes_dont_collide(): void {
        // place-order body shape vs create-po body shape vs manual-flash body shape
        // MUST hash differently even with default values, as a safety net.
        $place_order   = $this->place_order_body();
        $create_po     = $this->create_po_body();
        $manual_flash  = $this->manual_flash_body();

        $h1 = dinoco_idempotency_hash( $place_order );
        $h2 = dinoco_idempotency_hash( $create_po );
        $h3 = dinoco_idempotency_hash( $manual_flash );

        $this->assertNotSame( $h1, $h2 );
        $this->assertNotSame( $h2, $h3 );
        $this->assertNotSame( $h1, $h3 );
    }

    // ════════════════════════════════════════════════════════════════
    // ROUND 23 — 5 NEW ENDPOINT INTEGRATIONS
    //
    // Each block:
    //   1. body factory → returns the canonical hash input shape
    //   2. happy-path (identical body → same hash → replay works)
    //   3. critical-discriminator tests (each hash field MUST contribute)
    //   4. cross-endpoint collision check at end
    // ════════════════════════════════════════════════════════════════

    // ────────────────────────────────────────────────────────────────
    // confirm-order body shape (Snippet 5 V.33.5)
    //   { ticket_id, total_amount, status, admin_note }
    // ────────────────────────────────────────────────────────────────

    private function confirm_order_body( array $overrides = array() ): array {
        return array_merge( array(
            'ticket_id'    => 12345,
            'total_amount' => 5000.0,
            'status'       => 'awaiting_confirm',
            'admin_note'   => '',
        ), $overrides );
    }

    public function test_confirm_order_identical_body_same_hash(): void {
        $b1 = $this->confirm_order_body();
        $b2 = $this->confirm_order_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Identical confirm-order body → same hash (admin double-click safe replay)'
        );
    }

    public function test_confirm_order_different_total_different_hash(): void {
        // Admin edits total between retries → MUST surface as 409
        // (otherwise wrong cached debt-add response replayed)
        $b1 = $this->confirm_order_body( array( 'total_amount' => 5000.0 ) );
        $b2 = $this->confirm_order_body( array( 'total_amount' => 7500.0 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'total_amount in hash prevents stale-amount replay (debt-side double charge)'
        );
    }

    public function test_confirm_order_different_status_different_hash(): void {
        // FSM target state changes (awaiting_confirm vs cancelled) → different action → 409
        $b1 = $this->confirm_order_body( array( 'status' => 'awaiting_confirm' ) );
        $b2 = $this->confirm_order_body( array( 'status' => 'cancelled' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_confirm_order_different_ticket_different_hash(): void {
        // Cross-ticket key reuse (admin tab confusion) → 409
        $b1 = $this->confirm_order_body( array( 'ticket_id' => 12345 ) );
        $b2 = $this->confirm_order_body( array( 'ticket_id' => 99999 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'ticket_id namespacing prevents cross-ticket cache poisoning'
        );
    }

    // ────────────────────────────────────────────────────────────────
    // flash-create body shape (Snippet 5 V.33.5)
    //   { ticket_id }   — deterministic per ticket; dispatcher locks at helper level
    // ────────────────────────────────────────────────────────────────

    private function flash_create_body( array $overrides = array() ): array {
        return array_merge( array(
            'ticket_id' => 12345,
        ), $overrides );
    }

    public function test_flash_create_identical_body_same_hash(): void {
        $b1 = $this->flash_create_body();
        $b2 = $this->flash_create_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Same ticket → same hash (Flash retry returns cached PNO list)'
        );
    }

    public function test_flash_create_different_ticket_different_hash(): void {
        $b1 = $this->flash_create_body( array( 'ticket_id' => 12345 ) );
        $b2 = $this->flash_create_body( array( 'ticket_id' => 67890 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Different ticket = different Flash dispatch → different cache slot'
        );
    }

    // ────────────────────────────────────────────────────────────────
    // manual-flash-cancel body shape (Snippet 3 V.42.11)
    //   { pno }
    // ────────────────────────────────────────────────────────────────

    private function manual_flash_cancel_body( array $overrides = array() ): array {
        return array_merge( array(
            'pno' => 'TH9999XXXXXX',
        ), $overrides );
    }

    public function test_manual_flash_cancel_identical_body_same_hash(): void {
        $b1 = $this->manual_flash_cancel_body();
        $b2 = $this->manual_flash_cancel_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_manual_flash_cancel_different_pno_different_hash(): void {
        // CRITICAL — wrong PNO cancellation cache replay would invalidate the wrong package
        $b1 = $this->manual_flash_cancel_body( array( 'pno' => 'TH1111ABCDEF' ) );
        $b2 = $this->manual_flash_cancel_body( array( 'pno' => 'TH2222ZYXWVU' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Different PNO = different package → MUST be different hash'
        );
    }

    // ────────────────────────────────────────────────────────────────
    // po-update body shape (B2F Snippet 2 V.11.12)
    //   { po_id, items, note, requested_date, resubmit_only }
    //   exchange_rate IMMUTABLE post-submit — excluded from hash by design
    // ────────────────────────────────────────────────────────────────

    private function po_update_body( array $overrides = array() ): array {
        return array_merge( array(
            'po_id'          => 5555,
            'items'          => array(
                array( 'sku' => 'DNCSETSTD500', 'qty' => 5 ),
            ),
            'note'           => '',
            'requested_date' => '2026-05-15',
            'resubmit_only'  => 0,
        ), $overrides );
    }

    public function test_po_update_identical_body_same_hash(): void {
        $b1 = $this->po_update_body();
        $b2 = $this->po_update_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Same po-update body → same hash (admin double-click safe)'
        );
    }

    public function test_po_update_different_qty_different_hash(): void {
        // PO quantity change between retries → 409 (prevents wrong total cache replay)
        $b1 = $this->po_update_body();
        $b2 = $this->po_update_body( array(
            'items' => array( array( 'sku' => 'DNCSETSTD500', 'qty' => 100 ) ),
        ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'qty change MUST trigger 409 — prevents cached old total replay'
        );
    }

    public function test_po_update_resubmit_vs_amend_must_differ(): void {
        // CRITICAL: resubmit_only=1 path SKIPS items rebuild; resubmit_only=0 ALWAYS rebuilds.
        // Same key for both = wrong cached response replayed (e.g. resubmit response on amend).
        $b_resubmit = $this->po_update_body( array( 'resubmit_only' => 1 ) );
        $b_amend    = $this->po_update_body( array( 'resubmit_only' => 0 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b_resubmit ),
            dinoco_idempotency_hash( $b_amend ),
            'resubmit_only flag MUST be in hash to discriminate resubmit vs amend retry'
        );
    }

    public function test_po_update_different_po_different_hash(): void {
        $b1 = $this->po_update_body( array( 'po_id' => 5555 ) );
        $b2 = $this->po_update_body( array( 'po_id' => 7777 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'po_id namespacing prevents cross-PO cache poisoning'
        );
    }

    // ────────────────────────────────────────────────────────────────
    // receive-goods body shape (B2F Snippet 2 V.11.12)
    //   { po_id, items, inspected_by, note }
    //   Photo uploads NOT hashed (FormData binary — accepted limitation)
    // ────────────────────────────────────────────────────────────────

    private function receive_goods_body( array $overrides = array() ): array {
        return array_merge( array(
            'po_id'        => 5555,
            'items'        => array(
                array( 'sku' => 'DNCSETSTD500', 'qty_received' => 5, 'qc_status' => 'passed' ),
            ),
            'inspected_by' => 'Admin Pavorn',
            'note'         => '',
        ), $overrides );
    }

    public function test_receive_goods_identical_body_same_hash(): void {
        $b1 = $this->receive_goods_body();
        $b2 = $this->receive_goods_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Same receive body → same hash (admin retry safe; debt-add not double-fired)'
        );
    }

    public function test_receive_goods_different_qty_received_different_hash(): void {
        // CRITICAL: qty_received drives the debt-add amount. Wrong cache replay = wrong debt.
        $b1 = $this->receive_goods_body();
        $b2 = $this->receive_goods_body( array(
            'items' => array(
                array( 'sku' => 'DNCSETSTD500', 'qty_received' => 999, 'qc_status' => 'passed' ),
            ),
        ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'qty_received drives debt amount — MUST be in hash to prevent under/over-debt replay'
        );
    }

    public function test_receive_goods_qc_status_passed_vs_failed_different_hash(): void {
        // QC fail → reject_qty + reject_reason path; pass → accept full qty.
        // Different qc_status = different debt + different reject_photos workflow.
        $b1 = $this->receive_goods_body( array(
            'items' => array(
                array( 'sku' => 'DNCSETSTD500', 'qty_received' => 5, 'qc_status' => 'passed' ),
            ),
        ) );
        $b2 = $this->receive_goods_body( array(
            'items' => array(
                array( 'sku' => 'DNCSETSTD500', 'qty_received' => 5, 'qc_status' => 'failed', 'reject_qty' => 5 ),
            ),
        ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'qc_status pass vs fail = entirely different ledger impact'
        );
    }

    public function test_receive_goods_different_po_different_hash(): void {
        $b1 = $this->receive_goods_body( array( 'po_id' => 5555 ) );
        $b2 = $this->receive_goods_body( array( 'po_id' => 7777 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'po_id namespacing prevents cross-PO cache poisoning'
        );
    }

    // ────────────────────────────────────────────────────────────────
    // ROUND 23 cross-endpoint collision sanity (5 new shapes)
    // ────────────────────────────────────────────────────────────────

    public function test_round23_endpoint_body_shapes_dont_collide(): void {
        $confirm_order      = $this->confirm_order_body();
        $flash_create       = $this->flash_create_body();
        $manual_flash_cancel = $this->manual_flash_cancel_body();
        $po_update          = $this->po_update_body();
        $receive_goods      = $this->receive_goods_body();

        $hashes = array(
            'confirm_order'       => dinoco_idempotency_hash( $confirm_order ),
            'flash_create'        => dinoco_idempotency_hash( $flash_create ),
            'manual_flash_cancel' => dinoco_idempotency_hash( $manual_flash_cancel ),
            'po_update'           => dinoco_idempotency_hash( $po_update ),
            'receive_goods'       => dinoco_idempotency_hash( $receive_goods ),
        );

        // All 5 hashes MUST be unique — namespace string is also part of storage key
        // but body-shape uniqueness is a defense-in-depth layer.
        $this->assertSame( 5, count( array_unique( $hashes ) ),
            'Round 23 endpoint body shapes MUST all hash differently. Got: ' . print_r( $hashes, true )
        );
    }

    // ════════════════════════════════════════════════════════════════
    // ROUND 25 — 5 NEW ENDPOINT INTEGRATIONS
    //   B2B: update-status (Snippet 5 V.33.6) + cancel-request (Snippet 3 V.42.12)
    //   B2F: po-cancel + maker-confirm + record-payment (Snippet 2 V.11.13)
    // ════════════════════════════════════════════════════════════════

    // ────────────────────────────────────────────────────────────────
    // update-status body shape (Snippet 5 V.33.6)
    //   { ticket_id, status }
    //   `old_st` excluded (DB-derived; would break replay-after-success)
    // ────────────────────────────────────────────────────────────────

    private function update_status_body( array $overrides = array() ): array {
        return array_merge( array(
            'ticket_id' => 12345,
            'status'    => 'awaiting_confirm',
        ), $overrides );
    }

    public function test_update_status_identical_body_same_hash(): void {
        $b1 = $this->update_status_body();
        $b2 = $this->update_status_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Bulk Confirm/Cancel admin loops MUST replay safely on partial drop'
        );
    }

    public function test_update_status_different_status_different_hash(): void {
        // Cancel vs awaiting_confirm = different debt impact → 409
        $b1 = $this->update_status_body( array( 'status' => 'awaiting_confirm' ) );
        $b2 = $this->update_status_body( array( 'status' => 'cancelled' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'status drives debt add (awaiting_payment) or reverse (cancelled) — MUST discriminate'
        );
    }

    public function test_update_status_different_ticket_different_hash(): void {
        $b1 = $this->update_status_body( array( 'ticket_id' => 12345 ) );
        $b2 = $this->update_status_body( array( 'ticket_id' => 99999 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'ticket_id namespacing prevents cross-ticket cache poisoning'
        );
    }

    // ────────────────────────────────────────────────────────────────
    // cancel-request body shape (Snippet 3 V.42.12)
    //   { ticket_id, group_id }
    //   group_id from session (auth-scoped; prevents cross-customer poison)
    // ────────────────────────────────────────────────────────────────

    private function cancel_request_body( array $overrides = array() ): array {
        return array_merge( array(
            'ticket_id' => 12345,
            'group_id'  => 'C1234567890',
        ), $overrides );
    }

    public function test_cancel_request_identical_body_same_hash(): void {
        $b1 = $this->cancel_request_body();
        $b2 = $this->cancel_request_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Customer LIFF double-tap "ยกเลิก" MUST cache replay safely'
        );
    }

    public function test_cancel_request_different_group_different_hash(): void {
        // Two customers with same key (collision via separate clients) → 409
        $b1 = $this->cancel_request_body( array( 'group_id' => 'C111' ) );
        $b2 = $this->cancel_request_body( array( 'group_id' => 'C222' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'group_id in hash prevents cross-customer cache poisoning'
        );
    }

    public function test_cancel_request_different_ticket_different_hash(): void {
        $b1 = $this->cancel_request_body( array( 'ticket_id' => 12345 ) );
        $b2 = $this->cancel_request_body( array( 'ticket_id' => 99999 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    // ────────────────────────────────────────────────────────────────
    // po-cancel body shape (B2F Snippet 2 V.11.13)
    //   { po_id, reason }
    //   reason IN hash — admin re-editing reason = different intent → 409
    // ────────────────────────────────────────────────────────────────

    private function po_cancel_body( array $overrides = array() ): array {
        return array_merge( array(
            'po_id'  => 5555,
            'reason' => 'Maker out of stock',
        ), $overrides );
    }

    public function test_po_cancel_identical_body_same_hash(): void {
        $b1 = $this->po_cancel_body();
        $b2 = $this->po_cancel_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Admin double-click cancel + same reason MUST replay safely'
        );
    }

    public function test_po_cancel_different_reason_different_hash(): void {
        // Admin types more detailed reason on retry → 409 surfaces edit intent
        $b1 = $this->po_cancel_body( array( 'reason' => 'OOS' ) );
        $b2 = $this->po_cancel_body( array( 'reason' => 'Maker bankruptcy — escalate' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'reason editing between retries surfaces as 409 (different audit trail content)'
        );
    }

    public function test_po_cancel_different_po_different_hash(): void {
        $b1 = $this->po_cancel_body( array( 'po_id' => 5555 ) );
        $b2 = $this->po_cancel_body( array( 'po_id' => 7777 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    // ────────────────────────────────────────────────────────────────
    // maker-confirm body shape (B2F Snippet 2 V.11.13)
    //   { po_id, maker_id, expected_date, note }
    //   maker_id from JWT (auth-scoped)
    // ────────────────────────────────────────────────────────────────

    private function maker_confirm_body( array $overrides = array() ): array {
        return array_merge( array(
            'po_id'         => 5555,
            'maker_id'      => 1234,
            'expected_date' => '2026-05-30',
            'note'          => '',
        ), $overrides );
    }

    public function test_maker_confirm_identical_body_same_hash(): void {
        $b1 = $this->maker_confirm_body();
        $b2 = $this->maker_confirm_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Maker LIFF retry on slow LINE response MUST replay safely'
        );
    }

    public function test_maker_confirm_different_eta_different_hash(): void {
        // Maker corrects ETA between retries → 409 (different commitment)
        $b1 = $this->maker_confirm_body( array( 'expected_date' => '2026-05-30' ) );
        $b2 = $this->maker_confirm_body( array( 'expected_date' => '2026-06-15' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'expected_date is the commitment — must surface as 409 if changed'
        );
    }

    public function test_maker_confirm_different_maker_different_hash(): void {
        // Cross-maker key collision (impossible in practice — JWT-scoped — but defense-in-depth)
        $b1 = $this->maker_confirm_body( array( 'maker_id' => 1234 ) );
        $b2 = $this->maker_confirm_body( array( 'maker_id' => 9999 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'maker_id in hash = belt-and-braces over JWT-scoped namespace'
        );
    }

    // ────────────────────────────────────────────────────────────────
    // record-payment body shape (B2F Snippet 2 V.11.13)
    //   { po_id, amount, method, date, reference, note }
    //   slip_image binary EXCLUDED (FormData limitation)
    // ────────────────────────────────────────────────────────────────

    private function record_payment_body( array $overrides = array() ): array {
        return array_merge( array(
            'po_id'     => 5555,
            'amount'    => 12500.0,
            'method'    => 'transfer',
            'date'      => '2026-04-29',
            'reference' => 'TXN-ABC-2026',
            'note'      => '',
        ), $overrides );
    }

    public function test_record_payment_identical_body_same_hash(): void {
        $b1 = $this->record_payment_body();
        $b2 = $this->record_payment_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Identical payment body MUST replay safely (24h, beyond 10s legacy transient)'
        );
    }

    public function test_record_payment_different_amount_different_hash(): void {
        // CRITICAL — DOUBLE-PAY prevention test
        // Admin types wrong amount, fixes it, retries with same key = MUST be 409
        $b1 = $this->record_payment_body( array( 'amount' => 10000.0 ) );
        $b2 = $this->record_payment_body( array( 'amount' => 12500.0 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'amount drives ledger commitment — MUST surface as 409 on edit'
        );
    }

    public function test_record_payment_different_method_different_hash(): void {
        // transfer vs cheque vs cash = different reconciliation flow
        $b1 = $this->record_payment_body( array( 'method' => 'transfer' ) );
        $b2 = $this->record_payment_body( array( 'method' => 'cheque' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_record_payment_different_reference_different_hash(): void {
        // Reference number is the audit lookup key — must be discriminatory
        $b1 = $this->record_payment_body( array( 'reference' => 'TXN-001' ) );
        $b2 = $this->record_payment_body( array( 'reference' => 'TXN-002' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'reference is bank txn ID — MUST differ in hash to prevent cross-txn replay'
        );
    }

    public function test_record_payment_different_po_different_hash(): void {
        $b1 = $this->record_payment_body( array( 'po_id' => 5555 ) );
        $b2 = $this->record_payment_body( array( 'po_id' => 7777 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    // ════════════════════════════════════════════════════════════════
    // ROUND 26 — 5 new endpoints (BO + B2F + LIFF AI)
    //   bo-confirm-full / bo-split / bo-undo-split / maker-deliver / lead-accept
    // ════════════════════════════════════════════════════════════════

    // ── BO-CONFIRM-FULL body shape (Snippet 16 V.3.4) ──
    //   { order_id, dist_id }
    private function bo_confirm_full_body( array $overrides = array() ): array {
        return array_merge( array(
            'order_id' => 5001,
            'dist_id'  => 42,
        ), $overrides );
    }

    public function test_bo_confirm_full_identical_body_same_hash(): void {
        $b1 = $this->bo_confirm_full_body();
        $b2 = $this->bo_confirm_full_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Identical bo-confirm-full bodies MUST produce same hash for replay'
        );
    }

    public function test_bo_confirm_full_different_order_different_hash(): void {
        $b1 = $this->bo_confirm_full_body();
        $b2 = $this->bo_confirm_full_body( array( 'order_id' => 9999 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Different order_id MUST trigger 409 (admin reused key across orders)'
        );
    }

    public function test_bo_confirm_full_different_dist_different_hash(): void {
        // Cross-distributor key reuse: dist_id MUST be in hash to prevent
        // wrong dist's cached response from being replayed
        $b1 = $this->bo_confirm_full_body();
        $b2 = $this->bo_confirm_full_body( array( 'dist_id' => 99 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    // ── BO-SPLIT body shape (Snippet 16 V.3.4) ──
    //   { order_id, dist_id, splits[normalized: sort by sku] }
    private function bo_split_body( array $overrides = array() ): array {
        $defaults = array(
            'order_id' => 5001,
            'dist_id'  => 42,
            'splits'   => array(
                array( 'sku' => 'DNCS500A', 'qty_fulfill' => 5, 'qty_bo' => 3, 'eta_days' => 7 ),
                array( 'sku' => 'DNCS500B', 'qty_fulfill' => 2, 'qty_bo' => 0, 'eta_days' => 0 ),
            ),
        );
        $merged = array_merge( $defaults, $overrides );
        // Normalize splits sort by SKU (mirrors integration logic)
        if ( isset( $merged['splits'] ) && is_array( $merged['splits'] ) ) {
            usort( $merged['splits'], function( $a, $b ) {
                return strcmp( (string) ( $a['sku'] ?? '' ), (string) ( $b['sku'] ?? '' ) );
            } );
        }
        return $merged;
    }

    public function test_bo_split_identical_body_same_hash(): void {
        $b1 = $this->bo_split_body();
        $b2 = $this->bo_split_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Identical bo-split bodies MUST produce same hash for replay'
        );
    }

    public function test_bo_split_admin_edits_qty_different_hash(): void {
        // CRITICAL: admin types value, hangs, edits qty, retries — wrapper MUST 409
        // (different intent — should not silently replay first attempt)
        $b1 = $this->bo_split_body();
        $b2 = $this->bo_split_body( array(
            'splits' => array(
                array( 'sku' => 'DNCS500A', 'qty_fulfill' => 8, 'qty_bo' => 0, 'eta_days' => 0 ),  // changed
                array( 'sku' => 'DNCS500B', 'qty_fulfill' => 2, 'qty_bo' => 0, 'eta_days' => 0 ),
            ),
        ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Edited qty_fulfill MUST surface 409 (different admin intent)'
        );
    }

    public function test_bo_split_row_reorder_same_hash(): void {
        // Admin drags split rows around → same intent, same hash
        $b1 = $this->bo_split_body();
        $b2 = $this->bo_split_body( array(
            'splits' => array(
                // reversed order from default
                array( 'sku' => 'DNCS500B', 'qty_fulfill' => 2, 'qty_bo' => 0, 'eta_days' => 0 ),
                array( 'sku' => 'DNCS500A', 'qty_fulfill' => 5, 'qty_bo' => 3, 'eta_days' => 7 ),
            ),
        ) );
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Row reorder (same intent) MUST hash identically — sort by sku canonicalizes'
        );
    }

    // ── BO-UNDO-SPLIT body shape (Snippet 16 V.3.4) ──
    //   { order_id, dist_id }
    private function bo_undo_split_body( array $overrides = array() ): array {
        return array_merge( array(
            'order_id' => 5001,
            'dist_id'  => 42,
        ), $overrides );
    }

    public function test_bo_undo_split_identical_body_same_hash(): void {
        $b1 = $this->bo_undo_split_body();
        $b2 = $this->bo_undo_split_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_bo_undo_split_different_order_different_hash(): void {
        $b1 = $this->bo_undo_split_body();
        $b2 = $this->bo_undo_split_body( array( 'order_id' => 9999 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_bo_undo_split_distinct_from_bo_confirm_full(): void {
        // Same {order_id, dist_id} shape — namespace discriminates at storage,
        // but body hash is also distinct (ensure no accidental overlap)
        // NOTE: identical body shape → identical hash (this is OK because namespace
        // separates them at storage layer). This test documents the contract.
        $b1 = $this->bo_undo_split_body();
        $b2 = $this->bo_confirm_full_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'BO endpoints with identical {order_id, dist_id} share hash — namespace MUST differ at storage layer'
        );
    }

    // ── MAKER-DELIVER body shape (B2F Snippet 2 V.11.14) ──
    //   { po_id, maker_id (JWT), delivery_items[normalized], note }
    private function maker_deliver_body( array $overrides = array() ): array {
        $defaults = array(
            'po_id'          => 8200,
            'maker_id'       => 17,
            'delivery_items' => array(
                array( 'sku' => 'DNCBOX500', 'qty' => 10 ),
                array( 'sku' => 'DNCRACK500', 'qty' => 5 ),
            ),
            'note'           => '',
        );
        $merged = array_merge( $defaults, $overrides );
        if ( isset( $merged['delivery_items'] ) && is_array( $merged['delivery_items'] ) ) {
            usort( $merged['delivery_items'], function( $a, $b ) {
                return strcmp( (string) ( $a['sku'] ?? '' ), (string) ( $b['sku'] ?? '' ) );
            } );
        }
        return $merged;
    }

    public function test_maker_deliver_identical_body_same_hash(): void {
        $b1 = $this->maker_deliver_body();
        $b2 = $this->maker_deliver_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_maker_deliver_different_qty_different_hash(): void {
        $b1 = $this->maker_deliver_body();
        $b2 = $this->maker_deliver_body( array(
            'delivery_items' => array(
                array( 'sku' => 'DNCBOX500', 'qty' => 99 ),  // changed
                array( 'sku' => 'DNCRACK500', 'qty' => 5 ),
            ),
        ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Maker editing qty MUST surface 409 (different shipment intent)'
        );
    }

    public function test_maker_deliver_cross_maker_distinct(): void {
        // CRITICAL: JWT-scoped maker_id MUST be in hash — prevents one maker's
        // cached response from being replayed for another maker (cross-tenant poison)
        $b1 = $this->maker_deliver_body();
        $b2 = $this->maker_deliver_body( array( 'maker_id' => 99 ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Cross-maker key reuse MUST be impossible (auth-scoped hash)'
        );
    }

    // ── LIFF AI LEAD-ACCEPT body shape (LIFF AI Snippet 1 V.1.11) ──
    //   { lead_id, dealer_id (auth), uid (auth) }
    private function lead_accept_body( array $overrides = array() ): array {
        return array_merge( array(
            'lead_id'   => '6722abcd1234',
            'dealer_id' => '88',
            'uid'       => 'U1234567890abcdef',
        ), $overrides );
    }

    public function test_lead_accept_identical_body_same_hash(): void {
        $b1 = $this->lead_accept_body();
        $b2 = $this->lead_accept_body();
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_lead_accept_different_lead_different_hash(): void {
        $b1 = $this->lead_accept_body();
        $b2 = $this->lead_accept_body( array( 'lead_id' => 'ffffaaaa9999' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 )
        );
    }

    public function test_lead_accept_cross_dealer_distinct(): void {
        // Cross-tenant safety: 2 dealers cannot share idempotency key
        $b1 = $this->lead_accept_body();
        $b2 = $this->lead_accept_body( array( 'dealer_id' => '999', 'uid' => 'Uotherdealer' ) );
        $this->assertNotSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'Cross-dealer key reuse MUST be impossible (auth-scoped dealer_id + uid in hash)'
        );
    }

    // ────────────────────────────────────────────────────────────────
    // ROUND 26 cross-endpoint collision sanity (5 new shapes)
    // ────────────────────────────────────────────────────────────────

    public function test_round26_endpoint_body_shapes_dont_collide(): void {
        // Body shapes are distinct (different field sets). bo-confirm-full + bo-undo-split
        // intentionally share {order_id, dist_id} — namespace discriminates at storage.
        $bo_split        = $this->bo_split_body();
        $maker_deliver   = $this->maker_deliver_body();
        $lead_accept     = $this->lead_accept_body();

        $hashes = array(
            'bo_split'      => dinoco_idempotency_hash( $bo_split ),
            'maker_deliver' => dinoco_idempotency_hash( $maker_deliver ),
            'lead_accept'   => dinoco_idempotency_hash( $lead_accept ),
        );
        $this->assertSame( 3, count( array_unique( $hashes ) ),
            'Distinct-shape endpoints MUST hash differently. Got: ' . print_r( $hashes, true )
        );
    }

    // ────────────────────────────────────────────────────────────────
    // ROUND 25 cross-endpoint collision sanity (5 new shapes)
    // ────────────────────────────────────────────────────────────────

    public function test_round25_endpoint_body_shapes_dont_collide(): void {
        $update_status   = $this->update_status_body();
        $cancel_request  = $this->cancel_request_body();
        $po_cancel       = $this->po_cancel_body();
        $maker_confirm   = $this->maker_confirm_body();
        $record_payment  = $this->record_payment_body();

        $hashes = array(
            'update_status'   => dinoco_idempotency_hash( $update_status ),
            'cancel_request'  => dinoco_idempotency_hash( $cancel_request ),
            'po_cancel'       => dinoco_idempotency_hash( $po_cancel ),
            'maker_confirm'   => dinoco_idempotency_hash( $maker_confirm ),
            'record_payment'  => dinoco_idempotency_hash( $record_payment ),
        );

        // All 5 hashes MUST be unique — defense-in-depth (namespace also discriminates at storage)
        $this->assertSame( 5, count( array_unique( $hashes ) ),
            'Round 25 endpoint body shapes MUST all hash differently. Got: ' . print_r( $hashes, true )
        );
    }

    // ────────────────────────────────────────────────────────────────
    // Cumulative collision check across ALL 18 endpoints
    //   (Round 19: 3 + Round 23: 5 + Round 25: 5 + Round 26: 5 = 18)
    //
    // NOTE: BO endpoints bo-confirm-full + bo-undo-split intentionally share
    // body shape {order_id, dist_id} — they are discriminated by namespace at
    // the storage layer. This test EXCLUDES bo-undo-split from uniqueness check
    // to document that contract; namespace-level isolation is verified by the
    // dinoco_idempotency_check / store path.
    // ────────────────────────────────────────────────────────────────

    public function test_all_distinct_shape_endpoints_cumulative_no_collision(): void {
        $hashes = array(
            'place_order'         => dinoco_idempotency_hash( $this->place_order_body() ),
            'manual_flash'        => dinoco_idempotency_hash( $this->manual_flash_body() ),
            'create_po'           => dinoco_idempotency_hash( $this->create_po_body() ),
            'confirm_order'       => dinoco_idempotency_hash( $this->confirm_order_body() ),
            'flash_create'        => dinoco_idempotency_hash( $this->flash_create_body() ),
            'manual_flash_cancel' => dinoco_idempotency_hash( $this->manual_flash_cancel_body() ),
            'po_update'           => dinoco_idempotency_hash( $this->po_update_body() ),
            'receive_goods'       => dinoco_idempotency_hash( $this->receive_goods_body() ),
            'update_status'       => dinoco_idempotency_hash( $this->update_status_body() ),
            'cancel_request'      => dinoco_idempotency_hash( $this->cancel_request_body() ),
            'po_cancel'           => dinoco_idempotency_hash( $this->po_cancel_body() ),
            'maker_confirm'       => dinoco_idempotency_hash( $this->maker_confirm_body() ),
            'record_payment'      => dinoco_idempotency_hash( $this->record_payment_body() ),
            // Round 26 — distinct body shapes only (excluding bo-undo-split which shares
            // shape with bo-confirm-full; documented in test_bo_undo_split_distinct_from_bo_confirm_full)
            'bo_confirm_full'     => dinoco_idempotency_hash( $this->bo_confirm_full_body() ),
            'bo_split'            => dinoco_idempotency_hash( $this->bo_split_body() ),
            'maker_deliver'       => dinoco_idempotency_hash( $this->maker_deliver_body() ),
            'lead_accept'         => dinoco_idempotency_hash( $this->lead_accept_body() ),
        );
        $this->assertSame( 17, count( array_unique( $hashes ) ),
            'All 17 distinct-shape endpoint bodies MUST hash uniquely (bo-undo-split intentionally shares shape with bo-confirm-full → namespace-discriminated at storage). Total cumulative endpoint count = 18.'
        );
    }
}
