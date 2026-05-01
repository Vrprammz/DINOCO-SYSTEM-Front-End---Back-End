<?php
/**
 * IdempotencyRound44Test — DRY contract tests for Round 44 batch 22 (5 endpoints).
 *
 * Source: Round 44 (2026-04-30) — Push toward 60% milestone. 109/196 = 55.6%
 * against Round 30 authoritative census denominator. **26-round sustained campaign
 * Rounds 18-44.**
 *
 *   Batch 22 NEW (5 endpoints — Flash test sysadmin tools + Brand Voice security
 *   ops + B2B legacy backwards-compat write path):
 *     - POST /b2b/v1/flash-test/run-step       — sysadmin runner double-click → 2×
 *                                                 expensive Flash dispatch / API call
 *                                                 / DB mutation per step. Body hash
 *                                                 = {ticket_id, step} — step enum
 *                                                 discriminator catches admin re-
 *                                                 running different step on same
 *                                                 ticket → 409.
 *     - POST /b2b/v1/flash-test/simulate-webhook — Admin re-fires webhook simulator
 *                                                 double-click → 2× state-mutation
 *                                                 per type (e.g. delivered fires
 *                                                 order auto-complete; returned
 *                                                 generates new returnedPno). Body
 *                                                 hash = {ticket_id, type} — type
 *                                                 enum discriminator.
 *     - POST /brand-voice/v1/api-keys/generate — admin "Generate Key" double-click
 *                                                 on slow update_option → 2× api_key
 *                                                 INSERT into bv_api_keys array →
 *                                                 2 keys exist in wild (security
 *                                                 risk). Body hash = {name} —
 *                                                 different label between retries
 *                                                 → 409.
 *     - POST /brand-voice/v1/api-keys/revoke   — admin "Revoke" double-click during
 *                                                 slow reload race → 2× array_splice
 *                                                 on adjacent indices → wrong key
 *                                                 revoked (audit log scrambled).
 *                                                 Body hash = {index} — index
 *                                                 discriminator catches admin
 *                                                 clicking different row mid-retry
 *                                                 → 409 (security event).
 *     - POST /b2b/v1/discount-mapping          — bulk-shape body hash {items[]}
 *                                                 sorted by SKU UPPER + per-row
 *                                                 normalized. Admin batch upsert
 *                                                 double-click → 2× custom table
 *                                                 writes × N items + 2× ACF
 *                                                 update_field = quota burn.
 *                                                 Different items[] mid-retry →
 *                                                 409 (intent change).
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per
 * endpoint (first_call_success / replay_matches / different_field_409) +
 * cumulative no-collision.
 *
 * After Round 44 the breakdown:
 *   - B2F namespace: 21 endpoints (unchanged)
 *   - B2B namespace: 53 endpoints (+3 since Round 43 = 50 → 53 — flash-test/run-step
 *     + flash-test/simulate-webhook + discount-mapping)
 *   - Inventory namespace: 17 endpoints (unchanged)
 *   - MCP namespace: 13 endpoints (unchanged)
 *   - LIFF AI namespace: 3 endpoints (unchanged)
 *   - Brand Voice namespace: 2 endpoints (NEW — first Brand Voice idempotency wraps)
 *
 * 109/196 = 55.6% — push toward 60% milestone. 26-round sustained campaign.
 * Pattern maturity at Round 44 unchanged: **7 patterns** (single / bulk /
 * bulk-of-targets / state-machine / boolean+enum-discriminator / constant-marker /
 * binary-fingerprint).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound44Test extends IdempotencyTestFixture {

    // ── BATCH 22: FLASH-TEST/RUN-STEP (single — sysadmin Flash dispatch tool) ──

    public function test_flash_test_run_step_first_call_success(): void {
        // Body shape: {ticket_id, step}.
        $body = array( 'ticket_id' => 12345, 'step' => 'flash_create' );
        $this->assertFirstCallSuccess( 'flash-test/run-step', $body );
    }

    public function test_flash_test_run_step_replay_matches(): void {
        // Replay safety: sysadmin double-click → 2× Flash dispatch (quota burn).
        $body = array( 'ticket_id' => 12345, 'step' => 'flash_create' );
        $this->assertReplayMatches( 'flash-test/run-step', $body );
    }

    public function test_flash_test_run_step_different_step_409(): void {
        // step enum discriminator: admin re-running different step on same ticket
        // → 409. flash_create vs scan_qr are different DB mutations.
        $b1 = array( 'ticket_id' => 12345, 'step' => 'flash_create' );
        $b2 = array( 'ticket_id' => 12345, 'step' => 'scan_qr' );  // DIFFERENT STEP
        $this->assertDifferentBody(
            'flash-test/run-step',
            $b1, $b2,
            'step (flash_create vs scan_qr — different sysadmin operation)'
        );
    }

    // ── BATCH 22: FLASH-TEST/SIMULATE-WEBHOOK (single — Flash webhook simulator) ──

    public function test_flash_test_simulate_webhook_first_call_success(): void {
        // Body shape: {ticket_id, type}.
        $body = array( 'ticket_id' => 12345, 'type' => 'delivered' );
        $this->assertFirstCallSuccess( 'flash-test/simulate-webhook', $body );
    }

    public function test_flash_test_simulate_webhook_replay_matches(): void {
        // Replay safety: admin re-fires "delivered" webhook → 2× order auto-complete
        // FSM transitions + 2× LINE notification spam.
        $body = array( 'ticket_id' => 12345, 'type' => 'delivered' );
        $this->assertReplayMatches( 'flash-test/simulate-webhook', $body );
    }

    public function test_flash_test_simulate_webhook_different_type_409(): void {
        // type enum discriminator: admin re-firing different webhook type on same
        // ticket = different state mutation → 409.
        $b1 = array( 'ticket_id' => 12345, 'type' => 'delivered' );
        $b2 = array( 'ticket_id' => 12345, 'type' => 'returned' );  // DIFFERENT WEBHOOK
        $this->assertDifferentBody(
            'flash-test/simulate-webhook',
            $b1, $b2,
            'type (delivered vs returned — different webhook state mutation)'
        );
    }

    // ── BATCH 22: BRAND-VOICE API-KEYS/GENERATE (single — security ops) ──

    public function test_api_keys_generate_first_call_success(): void {
        // Body shape: {name}.
        $body = array( 'name' => 'Chrome Extension Production' );
        $this->assertFirstCallSuccess( 'api-keys/generate', $body );
    }

    public function test_api_keys_generate_replay_matches(): void {
        // CRITICAL replay safety: admin "Generate Key" double-click → 2 api_key
        // entries in bv_api_keys array → 2 keys in wild (security risk).
        $body = array( 'name' => 'Chrome Extension Production' );
        $this->assertReplayMatches( 'api-keys/generate', $body );
    }

    public function test_api_keys_generate_different_name_409(): void {
        // Different label → 409. Admin labeling change mid-retry catches accidental
        // re-keying for different purpose.
        $b1 = array( 'name' => 'Chrome Extension Production' );
        $b2 = array( 'name' => 'Internal Audit Tool' );  // DIFFERENT PURPOSE
        $this->assertDifferentBody(
            'api-keys/generate',
            $b1, $b2,
            'name (Production vs Audit — different security purpose)'
        );
    }

    // ── BATCH 22: BRAND-VOICE API-KEYS/REVOKE (single — security ops) ──

    public function test_api_keys_revoke_first_call_success(): void {
        // Body shape: {index}.
        $body = array( 'index' => 3 );
        $this->assertFirstCallSuccess( 'api-keys/revoke', $body );
    }

    public function test_api_keys_revoke_replay_matches(): void {
        // CRITICAL replay safety: admin "Revoke" double-click → 2× array_splice on
        // adjacent indices → wrong key revoked (audit log scrambled).
        $body = array( 'index' => 3 );
        $this->assertReplayMatches( 'api-keys/revoke', $body );
    }

    public function test_api_keys_revoke_different_index_409(): void {
        // CRITICAL: index discriminator catches admin clicking different row mid-
        // retry. Index 3 vs 5 = different audit log entry. Same key replay must
        // not silently revoke wrong row → 409 surfaces security event.
        $b1 = array( 'index' => 3 );
        $b2 = array( 'index' => 5 );  // DIFFERENT ROW — security event guard
        $this->assertDifferentBody(
            'api-keys/revoke',
            $b1, $b2,
            'index (3 vs 5 — different key row, audit log integrity guard)'
        );
    }

    // ── BATCH 22: DISCOUNT-MAPPING (bulk — legacy backwards-compat write path) ──

    public function test_discount_mapping_first_call_success(): void {
        // Bulk-shape: items[] sorted by SKU UPPER + per-row normalized.
        $body = array(
            'items' => array(
                array( 'sku' => 'DNCSETXL7500X001H', 'discount' => 20.0, 'ps' => 8800.0 ),
                array( 'sku' => 'DNCSETNX500E002',   'discount' => 25.0, 'ps' => 7500.0 ),
            ),
        );
        $this->assertFirstCallSuccess( 'discount-mapping', $body );
    }

    public function test_discount_mapping_replay_matches(): void {
        // Replay safety: admin batch upsert double-click → 2× custom table writes
        // × N items + 2× ACF update_field = quota burn. Same items retry → cached
        // 200 with same updated/new_posts counts.
        $body = array(
            'items' => array(
                array( 'sku' => 'DNCSETXL7500X001H', 'discount' => 20.0, 'ps' => 8800.0 ),
                array( 'sku' => 'DNCSETNX500E002',   'discount' => 25.0, 'ps' => 7500.0 ),
            ),
        );
        $this->assertReplayMatches( 'discount-mapping', $body );
    }

    public function test_discount_mapping_different_discount_409(): void {
        // CRITICAL: admin changed discount values mid-retry → 409 (intent change).
        // Catches accidental override of business decision.
        $b1 = array(
            'items' => array(
                array( 'sku' => 'DNCSETXL7500X001H', 'discount' => 20.0, 'ps' => 8800.0 ),
            ),
        );
        $b2 = array(
            'items' => array(
                array( 'sku' => 'DNCSETXL7500X001H', 'discount' => 30.0, 'ps' => 8800.0 ),  // CHANGED
            ),
        );
        $this->assertDifferentBody(
            'discount-mapping',
            $b1, $b2,
            'discount (20% vs 30% — admin business decision change mid-retry)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_44_no_collision_via_fixture(): void {
        $body_map = array(
            'flash_test_run_step' => array(
                'ticket_id' => 12345,
                'step'      => 'flash_create',
            ),
            'flash_test_simulate_webhook' => array(
                'ticket_id' => 12345,
                'type'      => 'delivered',
            ),
            'api_keys_generate' => array( 'name' => 'Chrome Extension Production' ),
            'api_keys_revoke'   => array( 'index' => 3 ),
            'discount_mapping'  => array(
                'items' => array(
                    array( 'sku' => 'DNCSETXL7500X001H', 'discount' => 20.0, 'ps' => 8800.0 ),
                    array( 'sku' => 'DNCSETNX500E002',   'discount' => 25.0, 'ps' => 7500.0 ),
                ),
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 44 — push toward 60% milestone', $body_map );
    }
}
