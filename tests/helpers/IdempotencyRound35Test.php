<?php
/**
 * IdempotencyRound35Test — DRY contract tests for Round 35 batch 13 (5 endpoints).
 *
 * Source: Round 35 (2026-04-30) — 32.7% milestone (64/196).
 *
 *   Batch 13 NEW (5 endpoints — OpenClaw retry-prone MCP cluster, all `/dinoco-mcp/v1/*`):
 *     - POST /dinoco-mcp/v1/dashboard-inject-metrics — FB/IG metrics inject. Retry → inflated
 *                                                     KPI counts on dashboard timeline.
 *     - POST /dinoco-mcp/v1/lead-attribution         — lead conversion event. Retry → double-counted
 *                                                     revenue + duplicate attribution row.
 *     - POST /dinoco-mcp/v1/inventory-changed        — stock change webhook. Retry → 2x event log
 *                                                     + Qdrant re-sync wasted compute.
 *     - POST /dinoco-mcp/v1/kb-updated               — KB write hook. Retry → wasted Qdrant rebuild
 *                                                     (~30-60s embedding compute).
 *     - POST /dinoco-mcp/v1/product-compatibility    — chatbot product-bike query. Retry →
 *                                                     redundant ~500-SKU catalog walk.
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per endpoint
 * (first_call_success / replay_matches / different_field_409) + cumulative no-collision +
 * 2 cross-namespace pair guards (mcp cluster — webhook signals share OpenClaw agent process).
 *
 * After Round 35 the MCP namespace coverage = 13/17 = ~76% (high cluster coverage).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound35Test extends IdempotencyTestFixture {

    // ── BATCH 13: DASHBOARD-INJECT-METRICS (MCP FB/IG metrics) ──

    public function test_dashboard_inject_metrics_first_call_success(): void {
        $body = array(
            'platform'          => 'facebook',
            'date'              => '2026-04-30',
            'metrics_signature' => sha1( 'engagement=120|reach=4500|comments=23' ),
        );
        $this->assertFirstCallSuccess( 'dashboard-inject-metrics', $body );
    }

    public function test_dashboard_inject_metrics_replay_matches(): void {
        // Wrapper builds metrics_signature from sorted name=>value pairs → stable hash regardless
        // of array order. Replay with same logical payload MUST hash identically.
        $body = array(
            'platform'          => 'facebook',
            'date'              => '2026-04-30',
            'metrics_signature' => sha1( 'engagement=120|reach=4500|comments=23' ),
        );
        $this->assertReplayMatches( 'dashboard-inject-metrics', $body );
    }

    public function test_dashboard_inject_metrics_different_metrics_409(): void {
        // Same platform + date but metrics edited → different snapshot. Wrapper MUST 409 —
        // silent replay would store wrong metrics version (analytics integrity risk).
        $b1 = array(
            'platform'          => 'facebook',
            'date'              => '2026-04-30',
            'metrics_signature' => sha1( 'engagement=120|reach=4500' ),
        );
        $b2 = array(
            'platform'          => 'facebook',
            'date'              => '2026-04-30',
            'metrics_signature' => sha1( 'engagement=200|reach=5000' ),  // updated values
        );
        $this->assertDifferentBody(
            'dashboard-inject-metrics',
            $b1, $b2,
            'metrics_signature (snapshot v1 vs v2)'
        );
    }

    // ── BATCH 13: LEAD-ATTRIBUTION (MCP lead conversion) ──

    public function test_lead_attribution_first_call_success(): void {
        $body = array(
            'lead_id'  => 'LEAD-1234567890-abc',
            'event'    => 'converted',
            'order_id' => 'B2B-7892',
            'revenue'  => 4500.00,
            'source'   => 'facebook',
        );
        $this->assertFirstCallSuccess( 'lead-attribution', $body );
    }

    public function test_lead_attribution_replay_matches(): void {
        $body = array(
            'lead_id'  => 'LEAD-1234567890-abc',
            'event'    => 'converted',
            'order_id' => 'B2B-7892',
            'revenue'  => 4500.00,
            'source'   => 'facebook',
        );
        $this->assertReplayMatches( 'lead-attribution', $body );
    }

    public function test_lead_attribution_different_event_409(): void {
        // CRITICAL: event enum (converted/purchased/registered) = distinct conversion path.
        // Admin retry with different event = different intent. Wrapper MUST 409 — silent replay
        // would mark lead converted with wrong event type (revenue analytics distorted).
        $b1 = array(
            'lead_id'  => 'LEAD-1234567890-abc',
            'event'    => 'converted',  // soft conversion (chatbot identified intent)
            'order_id' => '',
            'revenue'  => 0,
            'source'   => 'facebook',
        );
        $b2 = array(
            'lead_id'  => 'LEAD-1234567890-abc',
            'event'    => 'purchased',  // hard conversion (actual order placed)
            'order_id' => 'B2B-7892',
            'revenue'  => 4500.00,
            'source'   => 'facebook',
        );
        $this->assertDifferentBody(
            'lead-attribution',
            $b1, $b2,
            'event (converted vs purchased)'
        );
    }

    // ── BATCH 13: INVENTORY-CHANGED (MCP stock webhook) ──

    public function test_inventory_changed_first_call_success(): void {
        $body = array(
            'sku'      => 'DNCGND37LSPROS',
            'action'   => 'out',
            'quantity' => 5,
        );
        $this->assertFirstCallSuccess( 'inventory-changed', $body );
    }

    public function test_inventory_changed_replay_matches(): void {
        // Wrapper uppercases SKU before hashing → matches catalog uppercase convention.
        $body = array(
            'sku'      => 'DNCGND37LSPROS',
            'action'   => 'out',
            'quantity' => 5,
        );
        $this->assertReplayMatches( 'inventory-changed', $body );
    }

    public function test_inventory_changed_different_action_409(): void {
        // CRITICAL: action enum (in/out/hold/release) = different stock semantics.
        // Admin reusing key with 'release' after 'hold' = different intent → 409.
        $b1 = array(
            'sku'      => 'DNCGND37LSPROS',
            'action'   => 'hold',
            'quantity' => 5,
        );
        $b2 = array(
            'sku'      => 'DNCGND37LSPROS',
            'action'   => 'release',  // opposite operation
            'quantity' => 5,
        );
        $this->assertDifferentBody(
            'inventory-changed',
            $b1, $b2,
            'action (hold vs release)'
        );
    }

    // ── BATCH 13: KB-UPDATED (MCP KB rebuild webhook) ──

    public function test_kb_updated_first_call_success(): void {
        $body = array(
            'kb_count'       => 2300,
            'trigger_source' => 'admin_save',
        );
        $this->assertFirstCallSuccess( 'kb-updated', $body );
    }

    public function test_kb_updated_replay_matches(): void {
        $body = array(
            'kb_count'       => 2300,
            'trigger_source' => 'admin_save',
        );
        $this->assertReplayMatches( 'kb-updated', $body );
    }

    public function test_kb_updated_different_trigger_source_409(): void {
        // CRITICAL: trigger_source distinguishes 'admin_save' (single-row update) vs
        // 'bulk_import' (mass rebuild scope). Same kb_count + different trigger = different
        // rebuild intent → 409. Silent replay would skip the bulk-rebuild path.
        $b1 = array(
            'kb_count'       => 2300,
            'trigger_source' => 'admin_save',
        );
        $b2 = array(
            'kb_count'       => 2300,
            'trigger_source' => 'bulk_import',  // different scope
        );
        $this->assertDifferentBody(
            'kb-updated',
            $b1, $b2,
            'trigger_source (admin_save vs bulk_import)'
        );
    }

    // ── BATCH 13: PRODUCT-COMPATIBILITY (MCP catalog query) ──

    public function test_product_compatibility_first_call_success(): void {
        // Wrapper normalizes brand+model via mb_strtolower + trim — body hash uses normalized form.
        $body = array(
            'brand' => 'honda',
            'model' => 'nx500',
        );
        $this->assertFirstCallSuccess( 'product-compatibility', $body );
    }

    public function test_product_compatibility_replay_matches(): void {
        $body = array(
            'brand' => 'honda',
            'model' => 'nx500',
        );
        $this->assertReplayMatches( 'product-compatibility', $body );
    }

    public function test_product_compatibility_different_model_409(): void {
        // Same brand + different model = distinct query intent. Silent replay would return
        // catalog matches for wrong bike model → confused customer.
        $b1 = array(
            'brand' => 'honda',
            'model' => 'nx500',
        );
        $b2 = array(
            'brand' => 'honda',
            'model' => 'cb650r',  // different model
        );
        $this->assertDifferentBody(
            'product-compatibility',
            $b1, $b2,
            'model (nx500 vs cb650r)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_35_no_collision_via_fixture(): void {
        $body_map = array(
            'dashboard_inject_metrics' => array(
                'platform'          => 'facebook',
                'date'              => '2026-04-30',
                'metrics_signature' => sha1( 'engagement=1' ),
            ),
            'lead_attribution' => array(
                'lead_id'  => 'LEAD-1',
                'event'    => 'converted',
                'order_id' => '',
                'revenue'  => 0.0,
                'source'   => 'facebook',
            ),
            'inventory_changed' => array(
                'sku'      => 'SKU1',
                'action'   => 'in',
                'quantity' => 1,
            ),
            'kb_updated' => array(
                'kb_count'       => 1,
                'trigger_source' => 'admin_save',
            ),
            'product_compatibility' => array(
                'brand' => 'honda',
                'model' => 'nx500',
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 35', $body_map );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (1) ──
    // dashboard-inject-metrics vs lead-attribution — both come from OpenClaw analytics-side
    // pipeline so theoretical key collision possible if upstream uses platform-specific
    // namespacing. Verify body shapes are clearly distinct.

    public function test_dashboard_inject_metrics_vs_lead_attribution_no_collision(): void {
        $metrics_body = array(
            'platform'          => 'facebook',
            'date'              => '2026-04-30',
            'metrics_signature' => sha1( 'engagement=1' ),
        );
        $attrib_body = array(
            'lead_id'  => 'LEAD-1',
            'event'    => 'converted',
            'order_id' => '',
            'revenue'  => 0.0,
            'source'   => 'facebook',
        );
        $this->assertDifferentBody(
            'dashboard-inject-metrics vs lead-attribution',
            $metrics_body,
            $attrib_body,
            'schema shape (platform/date/metrics_signature vs lead_id/event/order_id/revenue/source)'
        );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (2) ──
    // inventory-changed + kb-updated are both webhook acknowledgement endpoints with similar
    // "trigger event" intent. Both fire from WP-side hooks broadcasting state changes to
    // OpenClaw. Verify body shapes are clearly distinct so a buggy multiplexer can't collide.

    public function test_inventory_changed_vs_kb_updated_no_collision(): void {
        $inv_body = array(
            'sku'      => 'SKU1',
            'action'   => 'in',
            'quantity' => 1,
        );
        $kb_body = array(
            'kb_count'       => 1,
            'trigger_source' => 'admin_save',
        );
        $this->assertDifferentBody(
            'inventory-changed vs kb-updated',
            $inv_body,
            $kb_body,
            'schema shape (sku/action/quantity vs kb_count/trigger_source)'
        );
    }
}
