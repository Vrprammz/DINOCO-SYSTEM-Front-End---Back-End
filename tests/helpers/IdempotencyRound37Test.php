<?php
/**
 * IdempotencyRound37Test — DRY contract tests for Round 37 batch 15 (5 endpoints).
 *
 * Source: Round 37 (2026-04-30) — 37.8% milestone (74/196). Continues B2B long tail per
 * Round 36 recommendation. Closes RPi + customer slip retry-prone POST endpoints in Snippet 3.
 *
 *   Batch 15 NEW (5 endpoints — RPi + customer LIFF retry-prone hot paths):
 *     - POST /b2b/v1/print-test          — Admin "ทดสอบ Print" double-click on slow RPi pickup
 *                                          → 2nd request overwrites transient (timestamp/user
 *                                          churn) + duplicate b2b_log noise. Constant-marker
 *                                          {type} hash — type discriminates label format.
 *     - POST /b2b/v1/print-requeue       — Admin "พิมพ์ใหม่" + RPi auto-retry race → double
 *                                          print of same label (paper waste + courier dual ID).
 *     - POST /b2b/v1/rpi-accept-order    — RPi kiosk "ยอมรับออเดอร์" double-tap → FSM 400
 *                                          "Order not in checking_stock" surfaces confusing
 *                                          error to kiosk after first call already succeeded.
 *     - POST /b2b/v1/rpi-flash-ready     — RPi scan-to-call-courier double-fire → Flash /notify
 *                                          per-pickup quota burn + double admin Flex pickup
 *                                          announcement spam + double WP_Cron retry chain.
 *     - POST /b2b/v1/slip-upload         — CRITICAL: Customer LIFF slip retry → Slip2Go API
 *                                          double-charge (~2 THB/call) + duplicate slip-{tid}-
 *                                          {ts}.jpg saves + double admin LINE notify spam.
 *                                          Body shape {ticket_id, gid} — image_base64 EXCLUDED
 *                                          (5MB binary hash flap pattern from combined-slip-
 *                                          upload Round 29).
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per endpoint
 * (first_call_success / replay_matches / different_field_409) + cumulative no-collision +
 * 1 cross-namespace pair guard (print-requeue vs rpi-accept-order vs rpi-flash-ready share
 * {ticket_id}-only shape → namespace discriminates; print-test has unique {type} marker;
 * slip-upload has unique {ticket_id, gid} bulk-shape).
 *
 * After Round 37 the B2B namespace coverage = 32 integrated POST endpoints (+5 since Round 36).
 * Snippet 3 coverage = 14/26 POST endpoints = ~54% (was 9/26 ~35% after Round 36).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound37Test extends IdempotencyTestFixture {

    // ── BATCH 15: PRINT-TEST (admin RPi test print queue) ──

    public function test_print_test_first_call_success(): void {
        // Constant-marker pattern: {type} is the only semantic field (timestamp + user are
        // response-side artifacts not intent). Same type = same intent (1 test print).
        $body = array( 'type' => 'label' );
        $this->assertFirstCallSuccess( 'print-test', $body );
    }

    public function test_print_test_replay_matches(): void {
        $body = array( 'type' => 'label' );
        $this->assertReplayMatches( 'print-test', $body );
    }

    public function test_print_test_different_type_409(): void {
        // Admin clicks "Test Invoice" then on stale tab clicks "Test Label" with same key →
        // different physical label format → 409 (silent replay would print wrong format paper).
        $b1 = array( 'type' => 'label' );
        $b2 = array( 'type' => 'invoice' );  // different label format
        $this->assertDifferentBody(
            'print-test',
            $b1, $b2,
            'type (label vs invoice — different physical paper format)'
        );
    }

    // ── BATCH 15: PRINT-REQUEUE (admin/RPi reprint shipping label) ──

    public function test_print_requeue_first_call_success(): void {
        $body = array( 'ticket_id' => 7892 );
        $this->assertFirstCallSuccess( 'print-requeue', $body );
    }

    public function test_print_requeue_replay_matches(): void {
        $body = array( 'ticket_id' => 7892 );
        $this->assertReplayMatches( 'print-requeue', $body );
    }

    public function test_print_requeue_different_ticket_409(): void {
        // CRITICAL: admin clicks "พิมพ์ใหม่" on row A then on stale list clicks row B with same
        // key → different physical label → 409 (silent replay would print wrong order's label
        // and confuse warehouse staff at picking station).
        $b1 = array( 'ticket_id' => 7892 );
        $b2 = array( 'ticket_id' => 7893 );  // different ticket
        $this->assertDifferentBody(
            'print-requeue',
            $b1, $b2,
            'ticket_id (7892 vs 7893 — different physical label)'
        );
    }

    // ── BATCH 15: RPI-ACCEPT-ORDER (kiosk acknowledge new order) ──

    public function test_rpi_accept_order_first_call_success(): void {
        $body = array( 'ticket_id' => 7892 );
        $this->assertFirstCallSuccess( 'rpi-accept-order', $body );
    }

    public function test_rpi_accept_order_replay_matches(): void {
        // Replay safety: kiosk Wi-Fi flap → 2nd request would hit "Order not in checking_stock"
        // 400 because first call already transitioned the FSM. Wrapper replays cached "Order
        // accepted" success → smooth UX on kiosk screen.
        $body = array( 'ticket_id' => 7892 );
        $this->assertReplayMatches( 'rpi-accept-order', $body );
    }

    public function test_rpi_accept_order_different_ticket_409(): void {
        $b1 = array( 'ticket_id' => 7892 );
        $b2 = array( 'ticket_id' => 7893 );
        $this->assertDifferentBody(
            'rpi-accept-order',
            $b1, $b2,
            'ticket_id (7892 vs 7893 — different FSM transition target)'
        );
    }

    // ── BATCH 15: RPI-FLASH-READY (kiosk scan-to-call-courier) ──

    public function test_rpi_flash_ready_first_call_success(): void {
        $body = array( 'ticket_id' => 7892 );
        $this->assertFirstCallSuccess( 'rpi-flash-ready', $body );
    }

    public function test_rpi_flash_ready_replay_matches(): void {
        // CRITICAL replay safety: warehouse staff scans QR → Wi-Fi timeout → kiosk auto-retries
        // → 2nd call hits Flash /notify again (per-pickup API quota) + double admin Flex pickup
        // announcement (LINE group spam). Wrapper replays one of 4 cached success responses
        // (already-courier / active-pickup-reuse / new-pickup-success / queued-retry).
        $body = array( 'ticket_id' => 7892 );
        $this->assertReplayMatches( 'rpi-flash-ready', $body );
    }

    public function test_rpi_flash_ready_different_ticket_409(): void {
        // Warehouse staff scans wrong QR on stale screen → different physical pickup intent →
        // 409 prevents calling courier for the wrong ticket.
        $b1 = array( 'ticket_id' => 7892 );
        $b2 = array( 'ticket_id' => 7893 );
        $this->assertDifferentBody(
            'rpi-flash-ready',
            $b1, $b2,
            'ticket_id (7892 vs 7893 — different physical pickup intent)'
        );
    }

    // ── BATCH 15: SLIP-UPLOAD (customer LIFF ticket-view slip upload) ──

    public function test_slip_upload_first_call_success(): void {
        // Body shape: {ticket_id, gid} — image_base64 EXCLUDED (5MB binary hash flap pattern
        // from combined-slip-upload Round 29). gid from session prevents cross-group poisoning.
        $body = array(
            'ticket_id' => 7892,
            'gid'       => 'C1234567890abcdef',
        );
        $this->assertFirstCallSuccess( 'slip-upload', $body );
    }

    public function test_slip_upload_replay_matches(): void {
        // Replay safety: customer's slow LIFF connection retries → without wrapper would
        // (1) save duplicate slip file (2) re-trigger Slip2Go async verify (CRITICAL — ~2 THB
        // API charge × duplicate count) (3) double admin LINE push (4) double slip_status churn.
        // Wrapper replays cached "verifying" success.
        $body = array(
            'ticket_id' => 7892,
            'gid'       => 'C1234567890abcdef',
        );
        $this->assertReplayMatches( 'slip-upload', $body );
    }

    public function test_slip_upload_different_ticket_409(): void {
        // Customer clicked wrong ticket on stale dashboard tab → different payment intent →
        // 409 prevents marking the wrong order as paid.
        $b1 = array(
            'ticket_id' => 7892,
            'gid'       => 'C1234567890abcdef',
        );
        $b2 = array(
            'ticket_id' => 7893,  // different ticket
            'gid'       => 'C1234567890abcdef',
        );
        $this->assertDifferentBody(
            'slip-upload',
            $b1, $b2,
            'ticket_id (7892 vs 7893 — different payment intent)'
        );
    }

    public function test_slip_upload_different_gid_409(): void {
        // Cross-group cache poisoning guard: same ticket_id reused across distributors should
        // never collide. gid (LINE group ID from session) discriminates per-distributor namespace.
        $b1 = array(
            'ticket_id' => 7892,
            'gid'       => 'C1234567890abcdef',
        );
        $b2 = array(
            'ticket_id' => 7892,  // same ticket
            'gid'       => 'C9999999999fedcba',  // different group
        );
        $this->assertDifferentBody(
            'slip-upload',
            $b1, $b2,
            'gid (group A vs group B — cross-tenant cache poison guard)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_37_no_collision_via_fixture(): void {
        $body_map = array(
            'print_test' => array(
                'type' => 'label',
            ),
            'print_requeue' => array(
                'ticket_id' => 7892,
            ),
            'rpi_accept_order' => array(
                'ticket_id' => 7893,  // different ticket — avoid intra-round shape collision
            ),
            'rpi_flash_ready' => array(
                'ticket_id' => 7894,
            ),
            'slip_upload' => array(
                'ticket_id' => 7892,
                'gid'       => 'C1234567890abcdef',
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 37', $body_map );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (1) ──
    // print-requeue vs rpi-accept-order vs rpi-flash-ready all share {ticket_id} body shape.
    // They MUST be discriminated by namespace only (different REST routes). Verify the BODY
    // hashes WITH SAME ticket_id intentionally collide (proving namespace is the sole
    // discriminator at the wrapper level — pattern reused from Round 36 flash-cancel pair).
    public function test_print_requeue_vs_rpi_accept_order_body_shape_matches(): void {
        $requeue_body = array( 'ticket_id' => 7892 );
        $accept_body  = array( 'ticket_id' => 7892 );
        $h1 = dinoco_idempotency_hash( $requeue_body );
        $h2 = dinoco_idempotency_hash( $accept_body );
        $this->assertSame(
            $h1, $h2,
            '[print-requeue vs rpi-accept-order] Same {ticket_id} body MUST hash identically — namespace is the sole discriminator (b2b/v1::print-requeue vs b2b/v1::rpi-accept-order). Wrapper relies on namespace prefix to prevent cross-endpoint replay confusion.'
        );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (2) ──
    // print-test (constant-marker {type}) vs print-requeue (single {ticket_id}) — verify schemas
    // are clearly distinct so a buggy multiplexer can't collide them.
    public function test_print_test_vs_print_requeue_no_collision(): void {
        $test_body = array(
            'type' => 'label',
        );
        $requeue_body = array(
            'ticket_id' => 7892,
        );
        $this->assertDifferentBody(
            'print-test vs print-requeue',
            $test_body,
            $requeue_body,
            'schema shape (type vs ticket_id)'
        );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (3) ──
    // slip-upload {ticket_id, gid} vs print-requeue {ticket_id} — slip-upload has additional gid
    // discriminator from session for cross-tenant safety. Verify shapes don't accidentally
    // collide when ticket_id matches.
    public function test_slip_upload_vs_print_requeue_no_collision(): void {
        $slip_body = array(
            'ticket_id' => 7892,
            'gid'       => 'C1234567890abcdef',
        );
        $requeue_body = array(
            'ticket_id' => 7892,  // same ticket_id
        );
        $this->assertDifferentBody(
            'slip-upload vs print-requeue',
            $slip_body,
            $requeue_body,
            'schema shape (ticket_id+gid vs ticket_id) — gid prevents cross-shape match'
        );
    }
}
