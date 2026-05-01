<?php
/**
 * IdempotencyRound45Test — DRY contract tests for Round 45 batch 23 (5 endpoints).
 *
 * Source: Round 45 (2026-04-30) — Push toward 🎯 60% milestone. 114/196 = 58.2%
 * against Round 30 authoritative census denominator. **27-round sustained campaign
 * Rounds 18-45.**
 *
 *   Batch 23 NEW (5 endpoints — Inventory bulk-import + dry-run resolver + 3 RPi
 *   ack/heartbeat POSTs in B2B Snippet 3):
 *     - POST /dinoco-stock/v1/product/shipping/bulk    — UPGRADED ad-hoc transient
 *                                                          idempotency to central
 *                                                          helper. Body hash =
 *                                                          {csv_sha1, csv_size,
 *                                                          line_count} binary-
 *                                                          fingerprint pattern
 *                                                          (Round 42 upload-image
 *                                                          precedent). Same CSV
 *                                                          retry = replay; rows
 *                                                          changed mid-retry → 409.
 *     - POST /dinoco-stock/v1/shipping-compute         — M6 dry-run resolver. Bulk-
 *                                                          shape body hash =
 *                                                          items[] sorted by SKU
 *                                                          UPPER + qty (deterministic
 *                                                          via usort by sku). Same
 *                                                          items + same qtys =
 *                                                          replay; different SKU set
 *                                                          mid-retry → 409.
 *     - POST /b2b/v1/print-ack                         — RPi double-ack race → 2×
 *                                                          update_field +
 *                                                          2× admin LINE Flex spam
 *                                                          on error. Body hash =
 *                                                          {ticket_id, status} —
 *                                                          status enum discriminator
 *                                                          catches RPi state
 *                                                          confusion (done vs
 *                                                          partial) → 409. Diagnostic
 *                                                          drift fields excluded.
 *     - POST /b2b/v1/print-heartbeat                   — RPi 30s heartbeat double-
 *                                                          fire → 2× admin LINE Flex
 *                                                          on printer-status-change
 *                                                          detection. Body hash =
 *                                                          {hostname} only — RPi
 *                                                          auto-generates new key
 *                                                          per beat; same key =
 *                                                          retry of same tick.
 *     - POST /b2b/v1/rpi-command-ack                   — cmd_id naturally unique BUT
 *                                                          array_filter+array_unshift
 *                                                          on pending list non-
 *                                                          idempotent (cmd_info
 *                                                          becomes null mid-retry →
 *                                                          history row labelled
 *                                                          'unknown' = audit
 *                                                          corruption). Body hash =
 *                                                          {cmd_id, status} —
 *                                                          discriminator pattern.
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per
 * endpoint (first_call_success / replay_matches / different_field_409) +
 * cumulative no-collision.
 *
 * After Round 45 the breakdown:
 *   - B2F namespace: 21 endpoints (unchanged)
 *   - B2B namespace: 56 endpoints (+3 since Round 44 = 53 → 56 — print-ack +
 *     print-heartbeat + rpi-command-ack)
 *   - Inventory namespace: 19 endpoints (+2 since Round 44 = 17 → 19 —
 *     product/shipping/bulk + shipping-compute)
 *   - MCP namespace: 13 endpoints (unchanged)
 *   - LIFF AI namespace: 3 endpoints (unchanged)
 *   - Brand Voice namespace: 2 endpoints (unchanged)
 *
 * 114/196 = 58.2% — push toward 🎯 60% milestone. 27-round sustained campaign.
 * Pattern maturity at Round 45 unchanged: **7 patterns** (single / bulk /
 * bulk-of-targets / state-machine / boolean+enum-discriminator / constant-marker /
 * binary-fingerprint).
 *
 * Round 46 candidate batch 24 (4 endpoints → 118/196 = 60.2% reaches 🎯 60% milestone):
 *   - POST /b2b/v1/manual-flash-cancel        — admin "ยกเลิก" on manual shipment
 *   - POST /b2b/v1/manual-flash-ready         — admin "พร้อมส่ง" trigger Flash notify
 *   - POST /b2b/v1/manual-flash-status        — single ticket lookup (or skip if
 *                                                  GET shape only)
 *   - POST /b2b/v1/manual-flash-test          — admin smoke-test Flash API connectivity
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound45Test extends IdempotencyTestFixture {

    // ── BATCH 23: PRODUCT/SHIPPING/BULK (binary-fingerprint — CSV import) ──

    public function test_product_shipping_bulk_first_call_success(): void {
        // Body shape: {csv_sha1, csv_size, line_count} — binary-fingerprint pattern.
        $body = array(
            'csv_sha1'   => sha1( "sku,weight_grams\nDNCSETXL7500X001H,1500\n" ),
            'csv_size'   => 38,
            'line_count' => 2,
        );
        $this->assertFirstCallSuccess( 'product/shipping/bulk', $body );
    }

    public function test_product_shipping_bulk_replay_matches(): void {
        // Replay safety: admin "อัพโหลด CSV" double-click on slow path → 2× UPDATE
        // per row × 500 rows + 2× cache flush + 2× audit churn. Same CSV retry =
        // identical fingerprint → replay 200 instantly.
        $csv = "sku,weight_grams\nDNCSETXL7500X001H,1500\nDNCSETNX500E002,2200\n";
        $body = array(
            'csv_sha1'   => sha1( $csv ),
            'csv_size'   => strlen( $csv ),
            'line_count' => 4,
        );
        $this->assertReplayMatches( 'product/shipping/bulk', $body );
    }

    public function test_product_shipping_bulk_different_csv_409(): void {
        // CRITICAL: admin uploaded different rows mid-retry → 409 (intent change).
        // sha1 fingerprint surfaces accidental admin override of business decision.
        $csv1 = "sku,weight_grams\nDNCSETXL7500X001H,1500\n";
        $csv2 = "sku,weight_grams\nDNCSETXL7500X001H,9999\n";  // CHANGED weight
        $b1 = array(
            'csv_sha1'   => sha1( $csv1 ),
            'csv_size'   => strlen( $csv1 ),
            'line_count' => 2,
        );
        $b2 = array(
            'csv_sha1'   => sha1( $csv2 ),
            'csv_size'   => strlen( $csv2 ),
            'line_count' => 2,
        );
        $this->assertDifferentBody(
            'product/shipping/bulk',
            $b1, $b2,
            'csv_sha1 (1500g vs 9999g — different shipping data mid-retry)'
        );
    }

    // ── BATCH 23: SHIPPING-COMPUTE (bulk — M6 dry-run resolver) ──

    public function test_shipping_compute_first_call_success(): void {
        // Bulk-shape: items[] sorted by SKU UPPER (canonical via usort by sku).
        $body = array(
            'items' => array(
                array( 'sku' => 'DNCSETNX500E002',   'total_qty' => 2 ),
                array( 'sku' => 'DNCSETXL7500X001H', 'total_qty' => 1 ),
            ),
        );
        $this->assertFirstCallSuccess( 'shipping-compute', $body );
    }

    public function test_shipping_compute_replay_matches(): void {
        // Replay safety: admin double-click on M6 "Test Payload" with 500-item form
        // → 2× expensive dinoco_resolve_manifest_shipping() recursion + catalog
        // lookups + box-template joins. Same items + qtys retry = replay (instant).
        $body = array(
            'items' => array(
                array( 'sku' => 'DNCSETNX500E002',   'total_qty' => 2 ),
                array( 'sku' => 'DNCSETXL7500X001H', 'total_qty' => 1 ),
            ),
        );
        $this->assertReplayMatches( 'shipping-compute', $body );
    }

    public function test_shipping_compute_different_qty_409(): void {
        // CRITICAL: admin changed qty mid-retry → 409 (different physical shipment
        // simulation). Catches form-state drift between retries.
        $b1 = array(
            'items' => array(
                array( 'sku' => 'DNCSETXL7500X001H', 'total_qty' => 1 ),
            ),
        );
        $b2 = array(
            'items' => array(
                array( 'sku' => 'DNCSETXL7500X001H', 'total_qty' => 5 ),  // CHANGED
            ),
        );
        $this->assertDifferentBody(
            'shipping-compute',
            $b1, $b2,
            'qty (1 vs 5 — different shipment dimensions to compute)'
        );
    }

    // ── BATCH 23: PRINT-ACK (single — RPi print result) ──

    public function test_print_ack_first_call_success(): void {
        // Body shape: {ticket_id, status} — diagnostic fields excluded.
        $body = array( 'ticket_id' => 6267, 'status' => 'done' );
        $this->assertFirstCallSuccess( 'print-ack', $body );
    }

    public function test_print_ack_replay_matches(): void {
        // Replay safety: RPi network retry double-ack on flaky wifi → 2× LINE admin
        // Flex spam on error/partial during peak ops hours = 50+ dup notifications
        // drown chat. Same ticket + same outcome retry = replay safe.
        $body = array( 'ticket_id' => 6267, 'status' => 'done' );
        $this->assertReplayMatches( 'print-ack', $body );
    }

    public function test_print_ack_different_status_409(): void {
        // CRITICAL: status enum discriminator catches RPi state confusion. Reporting
        // 'done' then 'partial' on retry from misread output = different physical
        // outcome → 409. Forces RPi to fix internal state before re-acking.
        $b1 = array( 'ticket_id' => 6267, 'status' => 'done' );
        $b2 = array( 'ticket_id' => 6267, 'status' => 'partial' );  // DIFFERENT
        $this->assertDifferentBody(
            'print-ack',
            $b1, $b2,
            'status (done vs partial — different physical print outcome)'
        );
    }

    // ── BATCH 23: PRINT-HEARTBEAT (single — RPi 30s heartbeat) ──

    public function test_print_heartbeat_first_call_success(): void {
        // Body shape: {hostname} — heartbeat key minimized to RPi identity only.
        $body = array( 'hostname' => 'rpi-warehouse-1' );
        $this->assertFirstCallSuccess( 'print-heartbeat', $body );
    }

    public function test_print_heartbeat_replay_matches(): void {
        // Replay safety: 30s timer double-fire (network glitch/systemd race) → 2×
        // admin LINE Flex if printer status changed (idle→disabled during peak hours).
        // RPi auto-generates new X-Idempotency-Key per heartbeat tick → distinct keys
        // per legitimate beat; same key = retry of same tick = idempotent.
        $body = array( 'hostname' => 'rpi-warehouse-1' );
        $this->assertReplayMatches( 'print-heartbeat', $body );
    }

    public function test_print_heartbeat_different_hostname_409(): void {
        // CRITICAL: heartbeat from different RPi using same key = misconfiguration
        // (key collision between fleet machines). 409 surfaces deployment error.
        $b1 = array( 'hostname' => 'rpi-warehouse-1' );
        $b2 = array( 'hostname' => 'rpi-warehouse-2' );  // DIFFERENT MACHINE
        $this->assertDifferentBody(
            'print-heartbeat',
            $b1, $b2,
            'hostname (rpi-warehouse-1 vs rpi-warehouse-2 — fleet key collision)'
        );
    }

    // ── BATCH 23: RPI-COMMAND-ACK (single — RPi remote command result) ──

    public function test_rpi_command_ack_first_call_success(): void {
        // Body shape: {cmd_id, status}.
        $body = array(
            'cmd_id' => 'cmd_uuid_550e8400-e29b-41d4-a716',
            'status' => 'done',
        );
        $this->assertFirstCallSuccess( 'rpi-command-ack', $body );
    }

    public function test_rpi_command_ack_replay_matches(): void {
        // Replay safety: RPi network retry double-fire after pending drained →
        // cmd_info null → history row labelled 'unknown' (audit log corruption).
        // Wrapper catches before non-idempotent array_filter+array_unshift run.
        $body = array(
            'cmd_id' => 'cmd_uuid_550e8400-e29b-41d4-a716',
            'status' => 'done',
        );
        $this->assertReplayMatches( 'rpi-command-ack', $body );
    }

    public function test_rpi_command_ack_different_status_409(): void {
        // CRITICAL: status enum discriminator catches RPi confusion (done then error
        // after misread). Same cmd_id should NOT swap from done→error mid-retry —
        // 409 forces RPi to commit to single outcome.
        $b1 = array(
            'cmd_id' => 'cmd_uuid_550e8400-e29b-41d4-a716',
            'status' => 'done',
        );
        $b2 = array(
            'cmd_id' => 'cmd_uuid_550e8400-e29b-41d4-a716',
            'status' => 'error',  // DIFFERENT OUTCOME
        );
        $this->assertDifferentBody(
            'rpi-command-ack',
            $b1, $b2,
            'status (done vs error — RPi state confusion guard)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_45_no_collision_via_fixture(): void {
        $body_map = array(
            'product_shipping_bulk' => array(
                'csv_sha1'   => sha1( "sku,weight_grams\nDNCSETXL7500X001H,1500\n" ),
                'csv_size'   => 38,
                'line_count' => 2,
            ),
            'shipping_compute' => array(
                'items' => array(
                    array( 'sku' => 'DNCSETNX500E002',   'total_qty' => 2 ),
                    array( 'sku' => 'DNCSETXL7500X001H', 'total_qty' => 1 ),
                ),
            ),
            'print_ack'         => array( 'ticket_id' => 6267, 'status' => 'done' ),
            'print_heartbeat'   => array( 'hostname' => 'rpi-warehouse-1' ),
            'rpi_command_ack'   => array(
                'cmd_id' => 'cmd_uuid_550e8400-e29b-41d4-a716',
                'status' => 'done',
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 45 — push toward 60% milestone', $body_map );
    }
}
