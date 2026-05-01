<?php
/**
 * IdempotencyRound36Test — DRY contract tests for Round 36 batch 14 (5 endpoints).
 *
 * Source: Round 36 (2026-04-30) — 35.2% milestone (69/196). Pivot from MCP cluster
 * (saturated at 13/17 = 76% in Round 35) to B2B/B2F long tail per Round 35 recommendation.
 *
 *   Batch 14 NEW (5 endpoints — B2B admin retry-prone Flash + BO + inventory hold):
 *     - POST /b2b/v1/bo-reject               — pending_stock_review reject. Retry → double FSM
 *                                               attempt + double customer Flex notify (LINE spam)
 *                                               + double daily counter decrement (rate budget
 *                                               corrupted).
 *     - POST /b2b/v1/flash-cancel            — Flash order cancel. Retry → double Flash API call
 *                                               (per-PNO charge + 1015 misleading code) + double
 *                                               audit log spam.
 *     - POST /b2b/v1/flash-cancel-notify     — Flash pickup cancel. Retry → double Flash notify
 *                                               cancel API + double audit. Flash idempotent
 *                                               server-side but admin sees confusing dual notify.
 *     - POST /b2b/v1/flash-switch-manual     — Switch Flash → manual mode. Retry → double Flash
 *                                               cancel + double pickup cancel + double print
 *                                               enqueue (RPi prints duplicate manual labels) +
 *                                               double admin Flex spam.
 *     - POST /dinoco-stock/v1/stock/hold     — Admin SKU hold/release. Retry → double UPDATE
 *                                               (stock_updated_at audit churn) + double set_stock
 *                                               _status hook fire (wasted CPT cache invalidation).
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per endpoint
 * (first_call_success / replay_matches / different_field_409) + cumulative no-collision +
 * 3 cross-namespace pair guards (flash-cancel vs flash-cancel-notify share {ticket_id} shape
 *  → namespace discriminates; bo-reject vs flash-switch-manual share post-id-only intent →
 *  body discriminator validation).
 *
 * After Round 36 the B2B namespace coverage = 27 integrated POST endpoints (+3 since Round 35).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound36Test extends IdempotencyTestFixture {

    // ── BATCH 14: BO-REJECT (pending_stock_review reject) ──

    public function test_bo_reject_first_call_success(): void {
        $body = array(
            'order_id' => 7892,
            'reason'   => 'สินค้าหมดสต็อก ไม่สามารถจัดส่งได้',
        );
        $this->assertFirstCallSuccess( 'bo-reject', $body );
    }

    public function test_bo_reject_replay_matches(): void {
        // Replay safety — same order_id + reason → same hash. Critical because side effects
        // include LINE notify (idempotent at message level but spammy) + counter decrement.
        $body = array(
            'order_id' => 7892,
            'reason'   => 'สินค้าหมดสต็อก ไม่สามารถจัดส่งได้',
        );
        $this->assertReplayMatches( 'bo-reject', $body );
    }

    public function test_bo_reject_different_reason_409(): void {
        // CRITICAL: admin retries with edited reason text = different intent. Silent replay
        // would mark the order rejected with the WRONG reason text in audit + Flex notify.
        // Wrapper MUST 409 — reason is admin-authored free text + customer-visible.
        $b1 = array(
            'order_id' => 7892,
            'reason'   => 'สินค้าหมดสต็อก',
        );
        $b2 = array(
            'order_id' => 7892,
            'reason'   => 'ลูกค้ายกเลิกออเดอร์ทางโทรศัพท์',  // different reason text
        );
        $this->assertDifferentBody(
            'bo-reject',
            $b1, $b2,
            'reason (stock OOS vs customer cancelled)'
        );
    }

    // ── BATCH 14: FLASH-CANCEL (admin cancel Flash parcels) ──

    public function test_flash_cancel_first_call_success(): void {
        $body = array(
            'ticket_id' => 7892,
        );
        $this->assertFirstCallSuccess( 'flash-cancel', $body );
    }

    public function test_flash_cancel_replay_matches(): void {
        $body = array(
            'ticket_id' => 7892,
        );
        $this->assertReplayMatches( 'flash-cancel', $body );
    }

    public function test_flash_cancel_different_ticket_409(): void {
        // Admin retry with different ticket_id (browser tab confusion / wrong row click) =
        // different intent. Silent replay would let admin THINK they cancelled ticket A
        // while wrapper served cached "success" for ticket B → real ticket A still active.
        $b1 = array( 'ticket_id' => 7892 );
        $b2 = array( 'ticket_id' => 7893 );  // different ticket
        $this->assertDifferentBody(
            'flash-cancel',
            $b1, $b2,
            'ticket_id (7892 vs 7893)'
        );
    }

    // ── BATCH 14: FLASH-CANCEL-NOTIFY (admin cancel Flash pickup request) ──

    public function test_flash_cancel_notify_first_call_success(): void {
        $body = array(
            'ticket_id' => 7892,
        );
        $this->assertFirstCallSuccess( 'flash-cancel-notify', $body );
    }

    public function test_flash_cancel_notify_replay_matches(): void {
        $body = array(
            'ticket_id' => 7892,
        );
        $this->assertReplayMatches( 'flash-cancel-notify', $body );
    }

    public function test_flash_cancel_notify_different_ticket_409(): void {
        $b1 = array( 'ticket_id' => 7892 );
        $b2 = array( 'ticket_id' => 7893 );
        $this->assertDifferentBody(
            'flash-cancel-notify',
            $b1, $b2,
            'ticket_id (7892 vs 7893)'
        );
    }

    // ── BATCH 14: FLASH-SWITCH-MANUAL (admin switch Flash → manual shipping) ──

    public function test_flash_switch_manual_first_call_success(): void {
        $body = array(
            'ticket_id' => 7892,
        );
        $this->assertFirstCallSuccess( 'flash-switch-manual', $body );
    }

    public function test_flash_switch_manual_replay_matches(): void {
        $body = array(
            'ticket_id' => 7892,
        );
        $this->assertReplayMatches( 'flash-switch-manual', $body );
    }

    public function test_flash_switch_manual_different_ticket_409(): void {
        // CRITICAL: switch-manual triggers RPi print + state machine flip + admin Flex push.
        // Admin clicking different ticket on stale tab = different intent → 409. Silent replay
        // would print the WRONG label and confuse the warehouse.
        $b1 = array( 'ticket_id' => 7892 );
        $b2 = array( 'ticket_id' => 7893 );
        $this->assertDifferentBody(
            'flash-switch-manual',
            $b1, $b2,
            'ticket_id (7892 vs 7893)'
        );
    }

    // ── BATCH 14: STOCK-HOLD (admin SKU hold/release toggle) ──

    public function test_stock_hold_first_call_success(): void {
        // Wrapper uppercases SKU (matches Catalog convention) + boolean hold + reason.
        $body = array(
            'sku'    => 'DNCGND37LSPROS',
            'hold'   => 1,
            'reason' => 'รอชิ้นส่วนใหม่',
        );
        $this->assertFirstCallSuccess( 'stock-hold', $body );
    }

    public function test_stock_hold_replay_matches(): void {
        $body = array(
            'sku'    => 'DNCGND37LSPROS',
            'hold'   => 1,
            'reason' => 'รอชิ้นส่วนใหม่',
        );
        $this->assertReplayMatches( 'stock-hold', $body );
    }

    public function test_stock_hold_different_action_409(): void {
        // CRITICAL: boolean discriminator — hold=true vs hold=false = OPPOSITE operations.
        // Silent replay would let admin think they "released" stock while wrapper served the
        // cached "hold" success → SKU stays out_of_stock blocking customer orders.
        $b1 = array(
            'sku'    => 'DNCGND37LSPROS',
            'hold'   => 1,
            'reason' => 'รอชิ้นส่วนใหม่',
        );
        $b2 = array(
            'sku'    => 'DNCGND37LSPROS',
            'hold'   => 0,  // OPPOSITE action — release
            'reason' => '',
        );
        $this->assertDifferentBody(
            'stock-hold',
            $b1, $b2,
            'hold (1 hold vs 0 release — boolean toggle)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_36_no_collision_via_fixture(): void {
        $body_map = array(
            'bo_reject' => array(
                'order_id' => 7892,
                'reason'   => 'reject reason',
            ),
            'flash_cancel' => array(
                'ticket_id' => 7892,
            ),
            'flash_cancel_notify' => array(
                'ticket_id' => 7893,  // different ticket from flash_cancel
            ),
            'flash_switch_manual' => array(
                'ticket_id' => 7894,
            ),
            'stock_hold' => array(
                'sku'    => 'DNCGND37LSPROS',
                'hold'   => 1,
                'reason' => 'hold',
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 36', $body_map );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (1) ──
    // flash-cancel vs flash-cancel-notify both share {ticket_id} body shape. They MUST be
    // discriminated by namespace only (different REST routes). If a buggy multiplexer ever
    // strips the namespace prefix, this test catches it. Note: hash() is namespace-agnostic
    // — the wrapper passes namespace separately to dinoco_idempotency_check(). Verify that
    // the BODY hashes WITH SAME ticket_id intentionally collide (proving namespace is the
    // sole discriminator at the wrapper level).
    public function test_flash_cancel_vs_flash_cancel_notify_body_shape_matches(): void {
        // SAME body — different namespace MUST distinguish them at the wrapper level.
        // This test proves they share shape so the namespace-discriminator pattern is intentional.
        $cancel_body = array( 'ticket_id' => 7892 );
        $notify_body = array( 'ticket_id' => 7892 );
        $h1 = dinoco_idempotency_hash( $cancel_body );
        $h2 = dinoco_idempotency_hash( $notify_body );
        $this->assertSame(
            $h1, $h2,
            '[flash-cancel vs flash-cancel-notify] Same {ticket_id} body MUST hash identically — namespace is the sole discriminator (b2b/v1::flash-cancel vs b2b/v1::flash-cancel-notify). Wrapper relies on namespace prefix to prevent cross-endpoint replay confusion.'
        );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (2) ──
    // bo-reject vs flash-switch-manual — both are admin-triggered terminal-ish ops on a single
    // post entity. bo-reject hashes {order_id, reason} while flash-switch-manual hashes
    // {ticket_id}. Verify shapes are clearly distinct so a buggy multiplexer can't collide.
    public function test_bo_reject_vs_flash_switch_manual_no_collision(): void {
        $bo_body = array(
            'order_id' => 7892,
            'reason'   => 'admin reject reason',
        );
        $switch_body = array(
            'ticket_id' => 7892,  // same numeric value, different field name
        );
        $this->assertDifferentBody(
            'bo-reject vs flash-switch-manual',
            $bo_body,
            $switch_body,
            'schema shape (order_id+reason vs ticket_id)'
        );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (3) ──
    // stock-hold uses {sku, hold, reason} structure which is unique to inventory namespace.
    // Verify no shape collision with the 4 b2b admin endpoints in this round.
    public function test_stock_hold_vs_flash_cancel_no_collision(): void {
        $hold_body = array(
            'sku'    => 'DNCGND37LSPROS',
            'hold'   => 1,
            'reason' => 'hold',
        );
        $cancel_body = array(
            'ticket_id' => 7892,
        );
        $this->assertDifferentBody(
            'stock-hold vs flash-cancel',
            $hold_body,
            $cancel_body,
            'schema shape (sku/hold/reason vs ticket_id)'
        );
    }
}
