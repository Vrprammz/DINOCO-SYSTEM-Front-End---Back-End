<?php
/**
 * IdempotencyRound38Test — DRY contract tests for Round 38 batch 16 (5 endpoints).
 *
 * Source: Round 38 (2026-04-30) — 🎯 40% TRUE milestone (79/196 = 40.3%) against
 * Round 30 authoritative census denominator. Continues B2B retry-prone long tail.
 *
 *   Batch 16 NEW (5 endpoints — admin BO + RPi pack/ship + Flash label):
 *     - POST /b2b/v1/bo-notify           — Admin "ส่ง Flex แจ้งลูกค้า" double-click → 2× LINE
 *                                          Flex push to customer group spam + 2× update_field
 *                                          bo_available_qty churn. Body shape {ticket_id, items
 *                                          sorted by sku} — items array sort makes hash
 *                                          deterministic regardless of input order.
 *     - POST /b2b/v1/rpi-command         — Admin spam-click "รีบูท RPi" / "รีสตาร์ท service" →
 *                                          2× cmd queue entries + 2× option write churn. cmd_id
 *                                          internally unique (time+rand) but admin spam-click
 *                                          enqueues distinct cmd_ids = same intent. Body shape
 *                                          {command, params normalized via ksort}.
 *     - POST /b2b/v1/rpi-flash-box-packed — RPi scanner double-trigger / network retry → when
 *                                          last box completes manifest = 2× Flash /notify call
 *                                          (quota burn) + 2× admin Flex pickup_added/courier_pickup
 *                                          duplicate spam. Body shape {pno} globally unique.
 *                                          4 success store sites: reused_pickup / called /
 *                                          pending / partial-status.
 *     - POST /b2b/v1/flash-ship-packed   — Timeout dialog double-confirm on warehouse → 2×
 *                                          courier /notify + 2× admin LINE notification + 2×
 *                                          hold_pending Flex push to dealer + 2× audit log
 *                                          churn. Body shape {ticket_id}.
 *     - POST /b2b/v1/flash-label         — Admin double-click "ดาวน์โหลด Label" → 2× Flash
 *                                          /open/v3/orders/printPdf API call (quota burn).
 *                                          Body shape {pno} globally unique. Replay returns
 *                                          JSON marker (binary PDF cannot replay through cache).
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per endpoint
 * (first_call_success / replay_matches / different_field_409) + cumulative no-collision +
 * 3 cross-namespace pair guards. flash-ship-packed vs rpi-flash-ready (Round 37) share
 * {ticket_id}-only shape → namespace is sole discriminator. flash-label vs rpi-flash-box-packed
 * share {pno}-only shape → namespace is sole discriminator. bo-notify has unique {ticket_id, items}
 * bulk-shape vs all other {ticket_id}-only endpoints.
 *
 * After Round 38 the B2B namespace coverage = 36 integrated POST endpoints (+4 since Round 37
 * — 4 new in Snippet 3 + 1 in Snippet 5). Snippet 3 coverage = 18/26 POST endpoints = ~69%
 * (was 14/26 ~54% after Round 37).
 *
 * 🎯 40% TRUE MILESTONE: 79/196 = 40.3% — first sustained 40% pass against authoritative
 * Round 30 census. Past 4/10 of POST surface integrated.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound38Test extends IdempotencyTestFixture {

    // ── BATCH 16: BO-NOTIFY (admin BO Flex notification to customer) ──

    public function test_bo_notify_first_call_success(): void {
        // Body shape: {ticket_id, items} where items is sorted by sku for deterministic hash
        // regardless of admin input order from BO modal UI.
        $body = array(
            'ticket_id' => 7892,
            'items'     => array(
                array( 'sku' => 'DNCSETNX500X001', 'name' => 'SET NX500', 'ordered' => 5, 'available' => 3, 'unit_price' => 8800.00 ),
                array( 'sku' => 'DNCTOPRACK500',   'name' => 'Top Rack',  'ordered' => 2, 'available' => 2, 'unit_price' => 1500.00 ),
            ),
        );
        $this->assertFirstCallSuccess( 'bo-notify', $body );
    }

    public function test_bo_notify_replay_matches(): void {
        // Replay safety: admin clicks "ส่ง Flex แจ้งลูกค้า" → slow LINE API → admin clicks again
        // → without wrapper would (1) push Flex twice to customer (LINE group spam) +
        // (2) update_field bo_available_qty 2× churn + (3) confuse customer with duplicate offer.
        $body = array(
            'ticket_id' => 7892,
            'items'     => array(
                array( 'sku' => 'DNCSETNX500X001', 'name' => 'SET NX500', 'ordered' => 5, 'available' => 3, 'unit_price' => 8800.00 ),
                array( 'sku' => 'DNCTOPRACK500',   'name' => 'Top Rack',  'ordered' => 2, 'available' => 2, 'unit_price' => 1500.00 ),
            ),
        );
        $this->assertReplayMatches( 'bo-notify', $body );
    }

    public function test_bo_notify_different_items_409(): void {
        // CRITICAL: admin changed BO selection between clicks (e.g. now offering 4/5 instead of
        // 3/5) → different partial_total → 409 prevents customer receiving stale offer.
        $b1 = array(
            'ticket_id' => 7892,
            'items'     => array(
                array( 'sku' => 'DNCSETNX500X001', 'name' => 'SET NX500', 'ordered' => 5, 'available' => 3, 'unit_price' => 8800.00 ),
            ),
        );
        $b2 = array(
            'ticket_id' => 7892,
            'items'     => array(
                array( 'sku' => 'DNCSETNX500X001', 'name' => 'SET NX500', 'ordered' => 5, 'available' => 4, 'unit_price' => 8800.00 ),  // available 3→4
            ),
        );
        $this->assertDifferentBody(
            'bo-notify',
            $b1, $b2,
            'items[].available (3 vs 4 — different BO offer to customer)'
        );
    }

    // ── BATCH 16: RPI-COMMAND (admin remote RPi command queue) ──

    public function test_rpi_command_first_call_success(): void {
        // Body shape: {command, params normalized via ksort}.
        $body = array(
            'command' => 'restart_service',
            'params'  => array(),
        );
        $this->assertFirstCallSuccess( 'rpi-command', $body );
    }

    public function test_rpi_command_replay_matches(): void {
        // Replay safety: admin clicks "รีสตาร์ท service" → slow option write → admin clicks
        // again → without wrapper enqueues 2 cmd_ids → 2× option write + admin sees confusing
        // dual command history. Wrapper replays cached cmd_id (RPi already polled & executed).
        $body = array(
            'command' => 'restart_service',
            'params'  => array(),
        );
        $this->assertReplayMatches( 'rpi-command', $body );
    }

    public function test_rpi_command_different_command_409(): void {
        // CRITICAL: admin clicked "restart" then on stale tab clicks "reboot" with same key →
        // very different physical effect → 409 prevents wrong command (reboot is destructive).
        $b1 = array(
            'command' => 'restart_service',
            'params'  => array(),
        );
        $b2 = array(
            'command' => 'reboot',
            'params'  => array(),
        );
        $this->assertDifferentBody(
            'rpi-command',
            $b1, $b2,
            'command (restart_service vs reboot — destructively different)'
        );
    }

    // ── BATCH 16: RPI-FLASH-BOX-PACKED (per-box scan completion) ──

    public function test_rpi_flash_box_packed_first_call_success(): void {
        // Body shape: {pno} — pno globally unique per Flash dispatch.
        $body = array( 'pno' => 'TH50145XXXXXXXX' );
        $this->assertFirstCallSuccess( 'rpi-flash-box-packed', $body );
    }

    public function test_rpi_flash_box_packed_replay_matches(): void {
        // CRITICAL replay safety: warehouse staff scans last box → manifest completes → triggers
        // courier /notify call. Network flap → scanner retries → without wrapper = 2× /notify
        // (Flash quota burn) + 2× admin Flex pickup_added spam. Wrapper replays cached success
        // (4 possible variants: reused_pickup / called / pending / partial-status).
        $body = array( 'pno' => 'TH50145XXXXXXXX' );
        $this->assertReplayMatches( 'rpi-flash-box-packed', $body );
    }

    public function test_rpi_flash_box_packed_different_pno_409(): void {
        // Scanner read wrong barcode on subsequent scan → different physical box → 409 prevents
        // marking the wrong box as packed (which would trigger wrong manifest completion check).
        $b1 = array( 'pno' => 'TH50145AAAAAAAA' );
        $b2 = array( 'pno' => 'TH50145BBBBBBBB' );
        $this->assertDifferentBody(
            'rpi-flash-box-packed',
            $b1, $b2,
            'pno (different physical Flash dispatch parcel)'
        );
    }

    // ── BATCH 16: FLASH-SHIP-PACKED (partial ship after timeout) ──

    public function test_flash_ship_packed_first_call_success(): void {
        $body = array( 'ticket_id' => 7892 );
        $this->assertFirstCallSuccess( 'flash-ship-packed', $body );
    }

    public function test_flash_ship_packed_replay_matches(): void {
        // Replay safety: timeout dialog "Ship N packed boxes? Hold M unpacked?" double-confirm
        // → without wrapper = 2× courier /notify + 2× admin LINE notification + 2× hold_pending
        // Flex push to dealer + 2× audit log. Wrapper replays cached partial-ship summary.
        $body = array( 'ticket_id' => 7892 );
        $this->assertReplayMatches( 'flash-ship-packed', $body );
    }

    public function test_flash_ship_packed_different_ticket_409(): void {
        // Stale tab shipping queue → admin clicked wrong row → different ticket_id → 409
        // prevents calling courier for wrong order's partial manifest.
        $b1 = array( 'ticket_id' => 7892 );
        $b2 = array( 'ticket_id' => 7893 );
        $this->assertDifferentBody(
            'flash-ship-packed',
            $b1, $b2,
            'ticket_id (7892 vs 7893 — different partial-ship manifest)'
        );
    }

    // ── BATCH 16: FLASH-LABEL (admin Flash label PDF download) ──

    public function test_flash_label_first_call_success(): void {
        // Body shape: {pno} — pno globally unique per Flash dispatch.
        $body = array( 'pno' => 'TH50145XXXXXXXX' );
        $this->assertFirstCallSuccess( 'flash-label', $body );
    }

    public function test_flash_label_replay_matches(): void {
        // Replay safety: admin double-click "ดาวน์โหลด Label" button → 2× Flash /open/v3/orders
        // /printPdf API call (quota burn). Wrapper replays cached JSON marker (binary PDF cannot
        // replay through JSON cache — admin can re-download via fresh request after TTL).
        $body = array( 'pno' => 'TH50145XXXXXXXX' );
        $this->assertReplayMatches( 'flash-label', $body );
    }

    public function test_flash_label_different_pno_409(): void {
        // Admin clicked wrong row on stale shipping list → different pno → 409 prevents
        // downloading wrong label (would confuse warehouse staff at picking station).
        $b1 = array( 'pno' => 'TH50145AAAAAAAA' );
        $b2 = array( 'pno' => 'TH50145BBBBBBBB' );
        $this->assertDifferentBody(
            'flash-label',
            $b1, $b2,
            'pno (different physical Flash dispatch label)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_38_no_collision_via_fixture(): void {
        $body_map = array(
            'bo_notify' => array(
                'ticket_id' => 7892,
                'items'     => array(
                    array( 'sku' => 'DNCSETNX500X001', 'name' => 'SET NX500', 'ordered' => 5, 'available' => 3, 'unit_price' => 8800.00 ),
                ),
            ),
            'rpi_command' => array(
                'command' => 'restart_service',
                'params'  => array(),
            ),
            'rpi_flash_box_packed' => array(
                'pno' => 'TH50145AAAAAAAA',
            ),
            'flash_ship_packed' => array(
                'ticket_id' => 7893,  // different ticket — avoid intra-round shape collision with bo-notify
            ),
            'flash_label' => array(
                'pno' => 'TH50145BBBBBBBB',  // different pno — avoid intra-round shape collision with rpi-flash-box-packed
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 38', $body_map );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (1) ──
    // flash-ship-packed vs rpi-flash-ready (Round 37) share {ticket_id}-only shape.
    // They MUST be discriminated by namespace only. Verify the BODY hashes WITH SAME ticket_id
    // intentionally collide (proving namespace is the sole discriminator at the wrapper level —
    // pattern reused from Round 36 flash-cancel pair).
    public function test_flash_ship_packed_vs_rpi_flash_ready_body_shape_matches(): void {
        $ship_body  = array( 'ticket_id' => 7892 );
        $ready_body = array( 'ticket_id' => 7892 );
        $h1 = dinoco_idempotency_hash( $ship_body );
        $h2 = dinoco_idempotency_hash( $ready_body );
        $this->assertSame(
            $h1, $h2,
            '[flash-ship-packed vs rpi-flash-ready] Same {ticket_id} body MUST hash identically — namespace is the sole discriminator (b2b/v1::flash-ship-packed vs b2b/v1::rpi-flash-ready). Wrapper relies on namespace prefix to prevent cross-endpoint replay confusion.'
        );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (2) ──
    // flash-label vs rpi-flash-box-packed share {pno}-only shape — namespace is sole
    // discriminator. Verify intentional body-hash collision proves namespace gate.
    public function test_flash_label_vs_rpi_flash_box_packed_body_shape_matches(): void {
        $label_body  = array( 'pno' => 'TH50145XXXXXXXX' );
        $packed_body = array( 'pno' => 'TH50145XXXXXXXX' );
        $h1 = dinoco_idempotency_hash( $label_body );
        $h2 = dinoco_idempotency_hash( $packed_body );
        $this->assertSame(
            $h1, $h2,
            '[flash-label vs rpi-flash-box-packed] Same {pno} body MUST hash identically — namespace is the sole discriminator (b2b/v1::flash-label vs b2b/v1::rpi-flash-box-packed). Wrapper relies on namespace prefix to prevent download-PDF replay being mistaken for box-packed replay.'
        );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (3) ──
    // bo-notify {ticket_id, items} vs flash-ship-packed {ticket_id} — bulk-shape vs single-shape.
    // Verify schemas don't accidentally collide when ticket_id matches (items array makes
    // bo-notify hash distinct from same-ticket flash-ship-packed).
    public function test_bo_notify_vs_flash_ship_packed_no_collision(): void {
        $bo_body = array(
            'ticket_id' => 7892,
            'items'     => array(
                array( 'sku' => 'DNCSETNX500X001', 'name' => 'SET NX500', 'ordered' => 5, 'available' => 3, 'unit_price' => 8800.00 ),
            ),
        );
        $ship_body = array(
            'ticket_id' => 7892,  // same ticket_id
        );
        $this->assertDifferentBody(
            'bo-notify vs flash-ship-packed',
            $bo_body,
            $ship_body,
            'schema shape (ticket_id+items vs ticket_id) — items array prevents cross-shape match'
        );
    }
}
