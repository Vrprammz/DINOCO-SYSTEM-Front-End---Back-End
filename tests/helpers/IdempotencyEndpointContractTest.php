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
}
