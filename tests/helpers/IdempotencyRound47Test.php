<?php
/**
 * IdempotencyRound47Test — DRY contract tests for Round 47 batch 25 (5 endpoints).
 *
 * Source: Round 47 (2026-04-30) — push toward 70% milestone after 🎯🎯 60% MAJOR
 * MILESTONE achieved at Round 46. 124/196 = 63.3% against Round 30 authoritative
 * census denominator. **29-round sustained Idempotency-Key campaign Rounds 18-47.**
 *
 *   Batch 25 NEW (5 endpoints — cross-snippet 2-file: Inventory + LIFF AI):
 *     - POST /dinoco-stock/v1/stock/sync-missing       — admin "🔄 Sync Missing"
 *                                                          double-click on slow drift
 *                                                          sweep → 2× full table scan +
 *                                                          2× INSERT loop on missing
 *                                                          SKUs + 2× cache invalidation.
 *                                                          Body hash = constant-marker
 *                                                          {action:'sync-missing'} —
 *                                                          6th constant-marker instance
 *                                                          after R30 stock/initialize +
 *                                                          R32 manual-flash-test + R39
 *                                                          daily-summary + R40 dip-stock/
 *                                                          start + R43 invoice/init.
 *     - POST /dinoco-stock/v1/shipping/classify/{sku}  — admin classify ad-hoc SKU
 *                                                          "บันทึก pack mode" double-
 *                                                          click on slow UPDATE → 2×
 *                                                          UPDATE wp_dinoco_products +
 *                                                          2× memo flush + 2× shipping
 *                                                          cache flush. Body hash =
 *                                                          single {sku, validated update
 *                                                          fields ksort-normalized} —
 *                                                          different pack_mode mid-retry
 *                                                          (single_box → multi_box) →
 *                                                          409.
 *     - POST /dinoco-stock/v1/product/shipping         — admin Edit Product modal
 *                                                          "บันทึก Shipping" double-
 *                                                          click on slow transaction
 *                                                          (UPDATE products + DELETE+
 *                                                          INSERT pack_slots × N) → 2×
 *                                                          transaction commit + 2× cache
 *                                                          invalidation. Body hash =
 *                                                          bulk-shape selective {sku,
 *                                                          update fields ksort + pack_
 *                                                          slots[] sorted by slot_index}
 *                                                          — different pack_mode/weight
 *                                                          between retries → 409.
 *     - POST /dinoco-stock/v1/image-proxy              — admin Edit Product modal
 *                                                          "อัพโหลดรูป" via canvas → JS
 *                                                          fetches external CDN URL →
 *                                                          base64 data URL (CORS work-
 *                                                          around). Flaky network → 2×
 *                                                          wp_remote_get bandwidth burn
 *                                                          (10MB image × 2 = 20MB).
 *                                                          Body hash = single {url} —
 *                                                          cached data_url returned on
 *                                                          replay (small payload direct
 *                                                          cache vs R42 sha1 fingerprint).
 *     - POST /liff-ai/v1/agent-ask                     — admin LIFF "ถามผู้ช่วย AI"
 *                                                          double-tap on slow OpenClaw
 *                                                          agent proxy (Gemini/Claude API
 *                                                          quota burn) → 2× LLM token
 *                                                          spend + 2× MCP tool call chain
 *                                                          + 2× duplicate answer return
 *                                                          confusing UX. Body hash =
 *                                                          single {question normalized
 *                                                          via mb_strtolower + trim,
 *                                                          actor_uid from JWT} — admin
 *                                                          retyped different question
 *                                                          mid-retry → 409. Question
 *                                                          normalization mirrors kb-
 *                                                          suggest R34 pattern.
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per
 * endpoint (first_call_success / replay_matches / different_field_409) +
 * cumulative no-collision. Total: 16 tests.
 *
 * After Round 47 the breakdown:
 *   - B2F namespace: 21 endpoints (unchanged)
 *   - B2B namespace: 60 endpoints (unchanged)
 *   - Inventory namespace: 23 endpoints (+4 since Round 46 = 19 → 23 — sync-missing +
 *     shipping/classify + product/shipping + image-proxy)
 *   - MCP namespace: 13 endpoints (unchanged)
 *   - LIFF AI namespace: 5 endpoints (+1 since Round 46 = 4 → 5 — agent-ask)
 *   - Brand Voice namespace: 2 endpoints (unchanged)
 *
 * 124/196 = 63.3% — push past 🎯🎯 60% MAJOR MILESTONE toward 70% target. 29-round
 * sustained campaign. Pattern maturity at Round 47: **7 patterns** (single / bulk /
 * bulk-of-targets / state-machine / boolean+enum-discriminator / constant-marker /
 * binary-fingerprint). Pattern mix: 1× constant-marker (sync-missing — 6th instance)
 * + 3× single (shipping/classify + image-proxy + agent-ask) + 1× bulk-shape selective
 * (product/shipping with pack_slots[] sort).
 *
 * Round 48 candidate batch 26 (5 endpoints → 129/196 = 65.8%):
 *   - Remaining inventory POSTs (warehouse update GET vs POST verify)
 *   - More LIFF AI POSTs if exposed
 *   - B2B Snippet 9 flash-webhook (verify Flash sig — public callback may not need wrap)
 *   - Strategic note: After 60% milestone, recommend slow-down to 1-2 weeks production
 *     canary observation matching Round 42 50% pause. Post-Round 47 = 29 rounds of
 *     sustained instrumentation.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound47Test extends IdempotencyTestFixture {

    // ── BATCH 25: STOCK/SYNC-MISSING (constant-marker — admin manual drift sweep) ──

    public function test_stock_sync_missing_first_call_success(): void {
        $body = array( 'action' => 'sync-missing' );
        $this->assertFirstCallSuccess( 'stock-sync-missing', $body );
    }

    public function test_stock_sync_missing_replay_matches(): void {
        // Replay safety: admin "🔄 Sync Missing" double-click on slow drift sweep → 2×
        // full table scan + 2× INSERT loop. Same key reuse = cached 200 (instant, no
        // scan + insert burn).
        $body = array( 'action' => 'sync-missing' );
        $this->assertReplayMatches( 'stock-sync-missing', $body );
    }

    public function test_stock_sync_missing_constant_marker_uniqueness(): void {
        // Constant-marker has no field discriminator — but namespace-level dedup ensures
        // cross-endpoint key reuse with different namespaces produces different cached
        // entries. This test asserts hash differs from sister constant-markers (R30
        // stock/initialize / R39 daily-summary / R40 dip-stock/start / R43 invoice/init).
        $b1 = array( 'action' => 'sync-missing' );
        $b2 = array( 'action' => 'initialize' );  // R30 stock/initialize action
        $this->assertDifferentBody(
            'stock-sync-missing',
            $b1, $b2,
            'action (sync-missing vs initialize — distinct constant-marker)'
        );
    }

    // ── BATCH 25: SHIPPING/CLASSIFY (single — admin classify ad-hoc SKU) ──

    public function test_shipping_classify_first_call_success(): void {
        $body = array(
            'sku'    => 'DNCSETNX500X001H',
            'update' => array(
                'pack_mode'        => 'single_box',
                'box_template_id'  => 12,
                'weight_grams'     => 1500,
                'packaging_source' => 'warehouse_packed',
            ),
        );
        $this->assertFirstCallSuccess( 'shipping-classify', $body );
    }

    public function test_shipping_classify_replay_matches(): void {
        // Replay safety: admin double-click "บันทึก pack mode" on slow UPDATE → 2×
        // UPDATE + 2× memo flush + 2× shipping cache flush. Same body = replay safe.
        $body = array(
            'sku'    => 'DNCSETNX500X001H',
            'update' => array(
                'pack_mode'        => 'single_box',
                'box_template_id'  => 12,
                'weight_grams'     => 1500,
                'packaging_source' => 'warehouse_packed',
            ),
        );
        $this->assertReplayMatches( 'shipping-classify', $body );
    }

    public function test_shipping_classify_different_pack_mode_409(): void {
        // CRITICAL: admin reclassified single_box → multi_box mid-retry → 409 catches
        // shipping intent change (avoid silent override of upstream resolver behavior).
        $b1 = array(
            'sku'    => 'DNCSETNX500X001H',
            'update' => array( 'pack_mode' => 'single_box', 'box_template_id' => 12 ),
        );
        $b2 = array(
            'sku'    => 'DNCSETNX500X001H',
            'update' => array( 'pack_mode' => 'multi_box',  'box_template_id' => 12 ),
        );
        $this->assertDifferentBody(
            'shipping-classify',
            $b1, $b2,
            'pack_mode (single_box vs multi_box — admin reclassified mid-retry)'
        );
    }

    // ── BATCH 25: PRODUCT/SHIPPING (bulk-shape selective with pack_slots[] sort) ──

    public function test_product_shipping_first_call_success(): void {
        $body = array(
            'sku'    => 'DNCSETNX500X001H',
            'update' => array(
                'pack_mode'        => 'multi_box',
                'weight_per_unit_g'=> 800,
                'article_category' => 6,
            ),
            'pack_slots' => array(
                array(
                    'slot_index'      => 0,
                    'slot_label'      => 'L',
                    'box_template_id' => 12,
                    'content_weight_g'=> 400,
                ),
                array(
                    'slot_index'      => 1,
                    'slot_label'      => 'R',
                    'box_template_id' => 12,
                    'content_weight_g'=> 400,
                ),
            ),
        );
        $this->assertFirstCallSuccess( 'product-shipping', $body );
    }

    public function test_product_shipping_replay_matches(): void {
        // Replay safety: admin "บันทึก Shipping" double-click on slow transaction →
        // 2× UPDATE + 2× DELETE+INSERT pack_slots × N + 2× cache invalidation chain.
        // Same body (incl. pack_slots in same order) = replay safe.
        $body = array(
            'sku'    => 'DNCSETNX500X001H',
            'update' => array(
                'pack_mode' => 'multi_box',
                'weight_per_unit_g'=> 800,
            ),
            'pack_slots' => array(
                array( 'slot_index' => 0, 'box_template_id' => 12, 'content_weight_g' => 400 ),
                array( 'slot_index' => 1, 'box_template_id' => 12, 'content_weight_g' => 400 ),
            ),
        );
        $this->assertReplayMatches( 'product-shipping', $body );
    }

    public function test_product_shipping_different_pack_slot_weight_409(): void {
        // CRITICAL: admin adjusted pack_slot[1].content_weight_g 400→500 mid-retry →
        // 409 catches packaging intent change (downstream resolver computes different
        // billing weight per pack_slot — silent overwrite would propagate stale weight
        // through cron forecast).
        $b1 = array(
            'sku'    => 'DNCSETNX500X001H',
            'update' => array( 'pack_mode' => 'multi_box' ),
            'pack_slots' => array(
                array( 'slot_index' => 0, 'box_template_id' => 12, 'content_weight_g' => 400 ),
                array( 'slot_index' => 1, 'box_template_id' => 12, 'content_weight_g' => 400 ),
            ),
        );
        $b2 = array(
            'sku'    => 'DNCSETNX500X001H',
            'update' => array( 'pack_mode' => 'multi_box' ),
            'pack_slots' => array(
                array( 'slot_index' => 0, 'box_template_id' => 12, 'content_weight_g' => 400 ),
                array( 'slot_index' => 1, 'box_template_id' => 12, 'content_weight_g' => 500 ), // ADJUSTED
            ),
        );
        $this->assertDifferentBody(
            'product-shipping',
            $b1, $b2,
            'pack_slots[1].content_weight_g (400 vs 500 — admin adjusted slot weight mid-retry)'
        );
    }

    // ── BATCH 25: IMAGE-PROXY (single — admin Edit Product canvas CDN fetch) ──

    public function test_image_proxy_first_call_success(): void {
        $body = array( 'url' => 'https://cdn.dinoco.in.th/products/DNCSETNX500X001H.jpg' );
        $this->assertFirstCallSuccess( 'image-proxy', $body );
    }

    public function test_image_proxy_replay_matches(): void {
        // Replay safety: admin canvas fetch retry on flaky network → 2× wp_remote_get
        // bandwidth burn (10MB image × 2 = 20MB download). Same URL retry = cached
        // data_url returned (small payload direct cache).
        $body = array( 'url' => 'https://cdn.dinoco.in.th/products/DNCSETNX500X001H.jpg' );
        $this->assertReplayMatches( 'image-proxy', $body );
    }

    public function test_image_proxy_different_url_409(): void {
        // CRITICAL: admin loaded different SKU image mid-retry → 409 surfaces accidental
        // URL change (avoid stale image stuck in canvas).
        $b1 = array( 'url' => 'https://cdn.dinoco.in.th/products/DNCSETNX500X001H.jpg' );
        $b2 = array( 'url' => 'https://cdn.dinoco.in.th/products/DNCGND37LSPROS.jpg' );
        $this->assertDifferentBody(
            'image-proxy',
            $b1, $b2,
            'url (different SKU image URL — admin selected wrong file mid-retry)'
        );
    }

    // ── BATCH 25: AGENT-ASK (single — LIFF AI admin ask AI assistant) ──

    public function test_agent_ask_first_call_success(): void {
        // Body shape: {question normalized + mb_strtolower + trim, actor_uid from JWT}.
        $body = array(
            'question'  => 'วันนี้ยอดขายเป็นยังไงบ้าง',
            'actor_uid' => 'U1234567890abcdef',
        );
        $this->assertFirstCallSuccess( 'agent-ask', $body );
    }

    public function test_agent_ask_replay_matches(): void {
        // Replay safety: admin LIFF double-tap "ถามผู้ช่วย AI" on slow Gemini/Claude
        // API → 2× LLM token spend + 2× MCP tool call chain. Same key + same question
        // retry = cached 200 (returns first answer, prevents quota burn).
        $body = array(
            'question'  => 'วันนี้ยอดขายเป็นยังไงบ้าง',
            'actor_uid' => 'U1234567890abcdef',
        );
        $this->assertReplayMatches( 'agent-ask', $body );
    }

    public function test_agent_ask_different_question_409(): void {
        // CRITICAL: admin retyped different question mid-retry → 409 catches AI intent
        // change. Question normalization (mb_strtolower + trim) mirrors kb-suggest R34
        // pattern — case + trailing whitespace differences DON'T trigger 409.
        $b1 = array(
            'question'  => 'วันนี้ยอดขายเป็นยังไงบ้าง',
            'actor_uid' => 'U1234567890abcdef',
        );
        $b2 = array(
            'question'  => 'แล้วเดือนนี้ล่ะ',  // DIFFERENT semantic question
            'actor_uid' => 'U1234567890abcdef',
        );
        $this->assertDifferentBody(
            'agent-ask',
            $b1, $b2,
            'question (different semantic question — admin retyped mid-retry)'
        );
    }

    public function test_agent_ask_actor_uid_scoping(): void {
        // CROSS-ADMIN guard: same key + same question + DIFFERENT admin uid → 409.
        // Actor scoped from JWT prevents key reuse across admins (one admin's cached
        // answer must not leak to another).
        $b1 = array(
            'question'  => 'ลูกค้าสั่ง 100 ชิ้นได้ไหม',
            'actor_uid' => 'U1234567890abcdef',  // admin A
        );
        $b2 = array(
            'question'  => 'ลูกค้าสั่ง 100 ชิ้นได้ไหม',
            'actor_uid' => 'Ufedcba0987654321',  // admin B
        );
        $this->assertDifferentBody(
            'agent-ask',
            $b1, $b2,
            'actor_uid (cross-admin scoping — JWT-bound prevents cache leak between admins)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_47_no_collision_via_fixture(): void {
        $body_map = array(
            'stock_sync_missing' => array( 'action' => 'sync-missing' ),
            'shipping_classify'  => array(
                'sku'    => 'DNCSETNX500X001H',
                'update' => array( 'pack_mode' => 'single_box', 'box_template_id' => 12 ),
            ),
            'product_shipping'   => array(
                'sku'    => 'DNCSETNX500X001H',
                'update' => array( 'pack_mode' => 'multi_box', 'weight_per_unit_g' => 800 ),
                'pack_slots' => array(
                    array( 'slot_index' => 0, 'box_template_id' => 12, 'content_weight_g' => 400 ),
                ),
            ),
            'image_proxy'        => array(
                'url' => 'https://cdn.dinoco.in.th/products/DNCSETNX500X001H.jpg',
            ),
            'agent_ask'          => array(
                'question'  => 'วันนี้ยอดขายเป็นยังไงบ้าง',
                'actor_uid' => 'U1234567890abcdef',
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 47 — push toward 70% milestone (124/196 = 63.3%)', $body_map );
    }
}
