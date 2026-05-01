<?php
/**
 * IdempotencyRound41Test — DRY contract tests for Round 41 batch 19 (5 endpoints).
 *
 * Source: Round 41 (2026-04-30) — push toward 50% milestone: 94/196 = 48.0% against
 * Round 30 authoritative census denominator. Pivots from saturated Inventory shipping
 * cluster + B2F admin write cluster: 3 Inventory (dip-stock count + box-template
 * create + box-template update) + 2 B2F admin delete (maker/delete + maker-product/
 * delete).
 *
 *   Batch 19 NEW (5 endpoints — Inventory dip-stock count + box template CRUD +
 *                  B2F admin delete pair):
 *     - POST /dinoco-stock/v1/dip-stock/count — Admin "บันทึกผลนับ" double-click on slow
 *                                              network → 2x SQL UPDATE per item (idempotent
 *                                              at storage but updated_at + variance/
 *                                              variance_pct re-compute waste + 2x
 *                                              counted_skus recount). bulk-shape body hash
 *                                              = {session_id, items: sorted-by-sku
 *                                              [{sku UPPER, actual_qty, note}]}. Different
 *                                              actual_qty between retries → 409 prevents
 *                                              wrong variance stuck via cached replay.
 *     - POST /dinoco-stock/v1/box-template — Admin "เพิ่มกล่อง" double-click race → 2x
 *                                              INSERT (handler 409 dedup via duplicate code
 *                                              SELECT, but microsecond gap before commit
 *                                              slips through under load) + 2x cache flush
 *                                              + 2x dinoco_invalidate_box_template_cache
 *                                              hook fire. single body hash = {code, name,
 *                                              length_cm, width_cm, height_cm,
 *                                              tare_weight_g, max_weight_g, owner_type,
 *                                              sort_order}.
 *     - POST /dinoco-stock/v1/box-template/{id} — Admin "แก้ไขกล่อง" double-click → 2x
 *                                              UPDATE (idempotent at storage but updated_at
 *                                              re-stamped + cache flush 2x + downstream
 *                                              dinoco_resolve_pno_shipping() static memo
 *                                              flush twice). single body hash = {id, name,
 *                                              owner_type, length_cm, width_cm, height_cm,
 *                                              tare_weight_g, max_weight_g, sort_order} —
 *                                              selective save (only PRESENT fields hashed).
 *                                              Dimension change between retries → 409.
 *     - POST /b2f/v1/maker/delete             — Admin "ลบโรงงาน" double-click on slow ACF
 *                                              write → 2nd request finds maker already
 *                                              inactive (idempotent at storage) but 2x
 *                                              b2f_log entry + audit noise + admin Flex
 *                                              push could double-fire on hook chain. single
 *                                              body hash = {id}. Cross-namespace pair guard
 *                                              with maker-product/delete (same {id}-only
 *                                              shape, namespace-discriminated).
 *     - POST /b2f/v1/maker-product/delete    — Admin "ลบสินค้า" double-click → 1st
 *                                              wp_delete_post(true) succeeds + soft-delete
 *                                              junction + b2f_junction_updated hook +
 *                                              cache invalidation. 2nd request hits
 *                                              NOT_FOUND 404 confusion. Wrapper turns
 *                                              "already deleted" 404 into cached 200 for
 *                                              retry-friendly UX. single body hash = {id}.
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per endpoint
 * (first_call_success / replay_matches / different_field_409) + cumulative no-collision +
 * 2 cross-namespace pair guards.
 *
 * After Round 41 the breakdown:
 *   - B2F namespace: 21 endpoints (+2 since Round 40 = 19 → 21)
 *   - B2B namespace: 42 endpoints (unchanged)
 *   - Inventory namespace: 16 endpoints (+3 since Round 40 = 13 → 16)
 *   - MCP namespace: 13 endpoints (unchanged)
 *   - LIFF AI namespace: 2 endpoints (unchanged)
 *
 * Push toward 50%: 94/196 = 48.0% — past 4.8/10 of POST surface integrated. Only +4
 * more endpoints needed for the 🎯 50% MAJOR MILESTONE (Round 42 candidate batch 20).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound41Test extends IdempotencyTestFixture {

    // ── BATCH 19: DIP-STOCK/COUNT (admin variance entry — bulk shape) ──

    public function test_dip_stock_count_first_call_success(): void {
        // Body shape: {session_id, items: sorted-by-sku [{sku UPPER, actual_qty, note}]}.
        $body = array(
            'session_id' => 42,
            'items' => array(
                array( 'sku' => 'DNCGNDPRO5500', 'actual_qty' => 10, 'note' => '' ),
                array( 'sku' => 'DNCSETNX500', 'actual_qty' => 5, 'note' => 'ขาด 2 ชิ้น' ),
            ),
        );
        $this->assertFirstCallSuccess( 'dip-stock-count', $body );
    }

    public function test_dip_stock_count_replay_matches(): void {
        // Replay safety: admin clicks "บันทึกผลนับ" on slow network → 2x UPDATE per item
        // (variance recomputed identically — idempotent at storage but updated_at noise +
        // 2x counted_skus recount + audit log churn).
        $body = array(
            'session_id' => 42,
            'items' => array(
                array( 'sku' => 'DNCGNDPRO5500', 'actual_qty' => 10, 'note' => '' ),
                array( 'sku' => 'DNCSETNX500', 'actual_qty' => 5, 'note' => 'ขาด 2 ชิ้น' ),
            ),
        );
        $this->assertReplayMatches( 'dip-stock-count', $body );
    }

    public function test_dip_stock_count_different_qty_409(): void {
        // CRITICAL: admin re-counted between retries — 1st said qty=10 then physical recount
        // showed qty=12. Different actual_qty → wrong variance/variance_pct sticks via cached
        // replay if no 409 surface. Wrapper protects against silent variance corruption.
        $b1 = array(
            'session_id' => 42,
            'items' => array(
                array( 'sku' => 'DNCGNDPRO5500', 'actual_qty' => 10, 'note' => '' ),
            ),
        );
        $b2 = array(
            'session_id' => 42,
            'items' => array(
                array( 'sku' => 'DNCGNDPRO5500', 'actual_qty' => 12, 'note' => '' ),
            ),
        );
        $this->assertDifferentBody(
            'dip-stock-count',
            $b1, $b2,
            'actual_qty (10 vs 12 — admin recounted between retries, variance integrity)'
        );
    }

    // ── BATCH 19: BOX-TEMPLATE CREATE (admin upsert race guard) ──

    public function test_box_template_create_first_call_success(): void {
        // Body shape: {code, name, length_cm, width_cm, height_cm, tare_weight_g,
        // max_weight_g, owner_type, sort_order}.
        $body = array(
            'code'          => 'BOX-S',
            'name'          => 'กล่องเล็ก',
            'length_cm'     => 30,
            'width_cm'      => 20,
            'height_cm'     => 10,
            'tare_weight_g' => 200,
            'max_weight_g'  => 5000,
            'owner_type'    => 'warehouse',
            'sort_order'    => 1,
        );
        $this->assertFirstCallSuccess( 'box-template-create', $body );
    }

    public function test_box_template_create_replay_matches(): void {
        // Replay safety: admin double-click "เพิ่มกล่อง" race → 2x INSERT (handler 409 dedup
        // via duplicate code SELECT, but microsecond gap before commit slips through under
        // concurrent load) + 2x cache flush.
        $body = array(
            'code'          => 'BOX-S',
            'name'          => 'กล่องเล็ก',
            'length_cm'     => 30,
            'width_cm'      => 20,
            'height_cm'     => 10,
            'tare_weight_g' => 200,
            'max_weight_g'  => 5000,
            'owner_type'    => 'warehouse',
            'sort_order'    => 1,
        );
        $this->assertReplayMatches( 'box-template-create', $body );
    }

    public function test_box_template_create_different_dim_409(): void {
        // CRITICAL: admin changed mind on box dimensions mid-retry. 1st request 30x20x10cm,
        // 2nd resubmit with 35x25x15cm (admin measured wrong first). Different dim → 409
        // prevents wrong dim sticking via cached replay (would mess up shipping calculations
        // for ALL future SKUs assigned to this template).
        $b1 = array(
            'code'          => 'BOX-S',
            'name'          => 'กล่องเล็ก',
            'length_cm'     => 30,
            'width_cm'      => 20,
            'height_cm'     => 10,
            'tare_weight_g' => 200,
            'max_weight_g'  => 5000,
            'owner_type'    => 'warehouse',
            'sort_order'    => 1,
        );
        $b2 = array(
            'code'          => 'BOX-S',
            'name'          => 'กล่องเล็ก',
            'length_cm'     => 35,  // CHANGED: admin re-measured
            'width_cm'      => 25,  // CHANGED
            'height_cm'     => 15,  // CHANGED
            'tare_weight_g' => 200,
            'max_weight_g'  => 5000,
            'owner_type'    => 'warehouse',
            'sort_order'    => 1,
        );
        $this->assertDifferentBody(
            'box-template-create',
            $b1, $b2,
            'box dimensions (30x20x10 vs 35x25x15 — admin re-measured between retries)'
        );
    }

    // ── BATCH 19: BOX-TEMPLATE UPDATE (admin selective save) ──

    public function test_box_template_update_first_call_success(): void {
        // Body shape: {id, ...selective fields present}. Only fields PRESENT in request
        // hashed — admin may submit partial form.
        $body = array(
            'id'        => 5,
            'name'      => 'กล่องเล็กพิเศษ',
            'length_cm' => 32,
            'width_cm'  => 22,
        );
        $this->assertFirstCallSuccess( 'box-template-update', $body );
    }

    public function test_box_template_update_replay_matches(): void {
        // Replay safety: admin double-click "แก้ไขกล่อง" → 2x UPDATE (idempotent at storage
        // but updated_at re-stamped twice + cache flush 2x + downstream
        // dinoco_resolve_pno_shipping() static memo flush twice).
        $body = array(
            'id'        => 5,
            'name'      => 'กล่องเล็กพิเศษ',
            'length_cm' => 32,
            'width_cm'  => 22,
        );
        $this->assertReplayMatches( 'box-template-update', $body );
    }

    public function test_box_template_update_different_id_409(): void {
        // CRITICAL: admin retried but page state showed wrong id (stale tab) — id=5 vs id=6
        // are different physical records. Different id → 409 prevents accidentally updating
        // wrong template via cached replay.
        $b1 = array(
            'id'        => 5,
            'name'      => 'กล่องเล็ก',
            'length_cm' => 30,
        );
        $b2 = array(
            'id'        => 6,  // DIFFERENT TARGET
            'name'      => 'กล่องเล็ก',
            'length_cm' => 30,
        );
        $this->assertDifferentBody(
            'box-template-update',
            $b1, $b2,
            'box id (5 vs 6 — different physical template, stale tab guard)'
        );
    }

    // ── BATCH 19: B2F MAKER/DELETE (admin soft delete) ──

    public function test_maker_delete_first_call_success(): void {
        // Body shape: {id}.
        $body = array( 'id' => 123 );
        $this->assertFirstCallSuccess( 'maker-delete', $body );
    }

    public function test_maker_delete_replay_matches(): void {
        // Replay safety: admin "ลบโรงงาน" double-click on slow ACF write → 2nd request finds
        // maker already inactive → idempotent at storage but 2x b2f_log entry + audit noise +
        // admin Flex push potentially double-fires on hook chain.
        $body = array( 'id' => 123 );
        $this->assertReplayMatches( 'maker-delete', $body );
    }

    public function test_maker_delete_different_id_409(): void {
        // CRITICAL: admin retried but page state showed wrong maker id (stale tab) — id=123
        // vs id=124 are different makers. Different id → 409 prevents accidentally
        // soft-deleting wrong maker via cached replay (would orphan PO history).
        $b1 = array( 'id' => 123 );
        $b2 = array( 'id' => 124 );  // DIFFERENT MAKER
        $this->assertDifferentBody(
            'maker-delete',
            $b1, $b2,
            'maker id (123 vs 124 — different physical maker, stale tab guard)'
        );
    }

    // ── BATCH 19: B2F MAKER-PRODUCT/DELETE (admin product mapping delete) ──

    public function test_maker_product_delete_first_call_success(): void {
        // Body shape: {id}.
        $body = array( 'id' => 456 );
        $this->assertFirstCallSuccess( 'maker-product-delete', $body );
    }

    public function test_maker_product_delete_replay_matches(): void {
        // Replay safety: admin "ลบสินค้า" double-click → 1st wp_delete_post succeeds +
        // soft-delete junction + b2f_junction_updated hook + cache invalidation. 2nd
        // request hits NOT_FOUND 404 confusion. Wrapper turns "already deleted" 404 into
        // cached 200 replay for retry-friendly UX.
        $body = array( 'id' => 456 );
        $this->assertReplayMatches( 'maker-product-delete', $body );
    }

    public function test_maker_product_delete_different_id_409(): void {
        // CRITICAL: admin retried but page state showed wrong product mapping id (stale tab) —
        // id=456 vs id=457 are different mappings (potentially different SKUs). Different id
        // → 409 prevents accidentally deleting wrong product mapping via cached replay
        // (would break PO history references + maker E-Catalog visibility).
        $b1 = array( 'id' => 456 );
        $b2 = array( 'id' => 457 );  // DIFFERENT MAPPING
        $this->assertDifferentBody(
            'maker-product-delete',
            $b1, $b2,
            'maker_product id (456 vs 457 — different mapping, stale tab guard)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_41_no_collision_via_fixture(): void {
        $body_map = array(
            'dip_stock_count' => array(
                'session_id' => 42,
                'items' => array(
                    array( 'sku' => 'DNCGNDPRO5500', 'actual_qty' => 10, 'note' => '' ),
                ),
            ),
            'box_template_create' => array(
                'code'          => 'BOX-S',
                'name'          => 'กล่องเล็ก',
                'length_cm'     => 30,
                'width_cm'      => 20,
                'height_cm'     => 10,
                'tare_weight_g' => 200,
                'max_weight_g'  => 5000,
                'owner_type'    => 'warehouse',
                'sort_order'    => 1,
            ),
            'box_template_update' => array(
                'id'        => 5,
                'name'      => 'กล่องเล็กพิเศษ',
                'length_cm' => 32,
            ),
            'maker_delete' => array( 'id' => 123 ),
            'maker_product_delete' => array( 'id' => 456 ),
        );
        $this->assertNoCollisionsInRound( 'Round 41', $body_map );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (1) ──
    // maker/delete vs maker-product/delete — both are {id}-only shape. Verify they
    // produce distinct hashes ONLY when namespace gate applies (the body hash itself
    // can collide because `{id: 123}` produces same SHA-256 regardless of intent —
    // namespace discriminator at the helper layer is the SOLE separator). This test
    // documents the deliberate pattern: SHAPE-MATCH at body-hash level + namespace gate
    // at idempotency_check() layer. Same as flash-cancel/flash-cancel-notify pair (R36).
    public function test_maker_delete_vs_maker_product_delete_shape_match_guard(): void {
        $delete_body = array( 'id' => 123 );
        $product_body = array( 'id' => 123 ); // Intentionally same id

        $h_maker = dinoco_idempotency_hash( $delete_body );
        $h_product = dinoco_idempotency_hash( $product_body );

        // SHAPE MATCH — hashes ARE identical because body is identical.
        $this->assertSame(
            $h_maker, $h_product,
            'maker-delete vs maker-product-delete: bodies are SHAPE-IDENTICAL — namespace gate is SOLE discriminator'
        );

        // Per-row protection: namespace differs, so check() at runtime would route to
        // separate buckets — collision is fine because helper layer never compares
        // across namespaces. Body shapes proven identical, demonstrates pattern.
    }

    // ── CROSS-NAMESPACE PAIR GUARD (2) ──
    // box-template-create vs box-template-update — same domain, different intent.
    // Body shapes overlap heavily (length_cm, width_cm, height_cm etc.) but create
    // requires `code` field whereas update requires `id`. Verify create body without
    // id vs update body without code DO produce different hashes (id discriminates).
    public function test_box_template_create_vs_update_id_discriminator(): void {
        $create_body = array(
            'code'          => 'BOX-S',
            'name'          => 'กล่องเล็ก',
            'length_cm'     => 30,
            'width_cm'      => 20,
            'height_cm'     => 10,
            'tare_weight_g' => 200,
            'max_weight_g'  => 5000,
            'owner_type'    => 'warehouse',
            'sort_order'    => 1,
        );
        $update_body = array(
            'id'            => 5,
            'name'          => 'กล่องเล็ก',
            'length_cm'     => 30,
            'width_cm'      => 20,
            'height_cm'     => 10,
            'tare_weight_g' => 200,
            'max_weight_g'  => 5000,
            'owner_type'    => 'warehouse',
            'sort_order'    => 1,
        );

        $h_create = dinoco_idempotency_hash( $create_body );
        $h_update = dinoco_idempotency_hash( $update_body );

        $this->assertNotSame(
            $h_create, $h_update,
            'box-template create (code) vs update (id) MUST hash differently — id field discriminates'
        );
    }
}
