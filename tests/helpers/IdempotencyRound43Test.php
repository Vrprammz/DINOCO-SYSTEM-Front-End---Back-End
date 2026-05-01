<?php
/**
 * IdempotencyRound43Test — DRY contract tests for Round 43 batch 21 (5 endpoints).
 *
 * Source: Round 43 (2026-04-30) — Push past 50% milestone toward 60% target. 104/196 =
 * 53.1% against Round 30 authoritative census denominator. **25-round sustained campaign
 * Rounds 18-43.**
 *
 *   Batch 21 NEW (5 endpoints — all Manual Invoice retry-prone):
 *     - POST /b2b/v1/invoice/init           — Admin "เริ่มออกบิล" double-click on slow
 *                                              wp_insert_post → 2× draft created + 2×
 *                                              invoice number consumed (gap in sequence)
 *                                              + 2× audit log entries. Body shape =
 *                                              **constant-marker** {action: 'init',
 *                                              user_id} — no params + user_id from current
 *                                              admin scopes draft creation per-admin.
 *                                              5th constant-marker after stock/initialize
 *                                              R30 + manual-flash-test R32 + daily-summary
 *                                              R39 + dip-stock/start R40.
 *     - POST /b2b/v1/invoice/issue          — Admin "ออกบิล/ส่ง LINE" double-click on slow
 *                                              LINE push → 2× Flex card + 2× invoice image
 *                                              push to distributor LINE group + 2× FSM
 *                                              transition draft→awaiting_payment + 2× debt
 *                                              add via dinoco_inv_apply_debt. Body hash =
 *                                              {id} — invoice id discriminator. FSM gate
 *                                              prevents 2nd write but LINE push fires
 *                                              before status check completes.
 *     - POST /b2b/v1/invoice/record-payment — CRITICAL retry-prone. Admin "บันทึกชำระ"
 *                                              double-click on slow ACF/SQL → 2×
 *                                              _inv_paid_amount add + 2× partial_payments
 *                                              json append + 2× debt subtract via
 *                                              b2b_recalculate_debt → debt double-cleared.
 *                                              FOR UPDATE lock prevents physical race but
 *                                              2nd retry AFTER 1st commit still re-adds
 *                                              payment. Body hash = {id, amount, note} —
 *                                              same payment on retry replays cached
 *                                              response; different amount → 409.
 *     - POST /b2b/v1/invoice/record-refund  — CRITICAL retry-prone mirrors record-payment.
 *                                              Admin "บันทึกคืนเงิน" double-click → 2×
 *                                              refund entry + 2× _inv_refunded_amount add
 *                                              + 2× FSM paid→awaiting_payment + 2× debt
 *                                              re-add → debt double-credited. Body hash =
 *                                              {id, amount, reason, method} — method enum
 *                                              (manual|bank_transfer|cash|credit_note)
 *                                              discriminates accounting category.
 *     - POST /b2b/v1/invoice/cancel         — Admin "ยกเลิก" double-click on slow LINE
 *                                              push → 2× cancel Flex card to distributor
 *                                              + 2× FSM transition + 2×
 *                                              dinoco_inv_reverse_debt (BO race possible).
 *                                              Body hash = {id, force, force_reason} —
 *                                              force boolean discriminator + force_reason
 *                                              text catches admin re-issuing different
 *                                              excuse mid-retry.
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per endpoint
 * (first_call_success / replay_matches / different_field_409) + cumulative no-collision.
 *
 * After Round 43 the breakdown:
 *   - B2F namespace: 21 endpoints (unchanged)
 *   - B2B namespace: 50 endpoints (+5 since Round 42 = 45 → 50 — all 5 invoice/* endpoints)
 *   - Inventory namespace: 17 endpoints (unchanged)
 *   - MCP namespace: 13 endpoints (unchanged)
 *   - LIFF AI namespace: 3 endpoints (unchanged)
 *
 * 104/196 = 53.1% — push past 50% MAJOR MILESTONE (Round 42) toward 60% target. 25-round
 * sustained campaign Rounds 18-43. Pattern maturity at Round 43: **7 patterns** (single /
 * bulk / bulk-of-targets / state-machine / boolean+enum-discriminator / constant-marker /
 * binary-fingerprint).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound43Test extends IdempotencyTestFixture {

    // ── BATCH 21: INVOICE/INIT (constant-marker — admin draft creation) ──

    public function test_invoice_init_first_call_success(): void {
        // Body shape: {action: 'init', user_id} — constant-marker pattern.
        // user_id from current admin scopes draft creation per-admin (different admin
        // = different draft scope, not cross-shared replay).
        $body = array( 'action' => 'init', 'user_id' => 42 );
        $this->assertFirstCallSuccess( 'invoice/init', $body );
    }

    public function test_invoice_init_replay_matches(): void {
        // Replay safety: admin "เริ่มออกบิล" double-click on slow wp_insert_post →
        // 2× draft created + 2× invoice number consumed (gap in sequence).
        $body = array( 'action' => 'init', 'user_id' => 42 );
        $this->assertReplayMatches( 'invoice/init', $body );
    }

    public function test_invoice_init_different_user_id_different_hash(): void {
        // Different admin = different draft scope. Cross-admin key reuse impossible —
        // each admin gets own draft per init click.
        $b1 = array( 'action' => 'init', 'user_id' => 42 );
        $b2 = array( 'action' => 'init', 'user_id' => 99 );  // DIFFERENT ADMIN
        $this->assertDifferentBody(
            'invoice/init',
            $b1, $b2,
            'user_id (42 vs 99 — different admin scope)'
        );
    }

    // ── BATCH 21: INVOICE/ISSUE (single {id} — admin send-to-LINE) ──

    public function test_invoice_issue_first_call_success(): void {
        // Body shape: {id}.
        $body = array( 'id' => 12345 );
        $this->assertFirstCallSuccess( 'invoice/issue', $body );
    }

    public function test_invoice_issue_replay_matches(): void {
        // Replay safety: admin "ออกบิล" double-click on slow LINE push → 2× Flex card
        // + 2× invoice image push + 2× FSM + 2× debt add.
        $body = array( 'id' => 12345 );
        $this->assertReplayMatches( 'invoice/issue', $body );
    }

    public function test_invoice_issue_different_id_different_hash(): void {
        // CRITICAL: admin opened wrong tab — invoice 12345 vs 12346 are different
        // invoices. Different id → 409 prevents wrong invoice issued via cached replay.
        $b1 = array( 'id' => 12345 );
        $b2 = array( 'id' => 12346 );  // DIFFERENT INVOICE
        $this->assertDifferentBody(
            'invoice/issue',
            $b1, $b2,
            'id (12345 vs 12346 — different invoice, stale tab guard)'
        );
    }

    // ── BATCH 21: INVOICE/RECORD-PAYMENT (single — CRITICAL debt double-clear guard) ──

    public function test_invoice_record_payment_first_call_success(): void {
        // Body shape: {id, amount, note}. amount round(2) for float-precision normalize.
        $body = array(
            'id'     => 12345,
            'amount' => 5000.00,
            'note'   => 'รับโอนเข้าธนาคารกสิกร',
        );
        $this->assertFirstCallSuccess( 'invoice/record-payment', $body );
    }

    public function test_invoice_record_payment_replay_matches(): void {
        // CRITICAL replay safety: admin double-click on slow ACF/SQL → 2× paid_amount
        // add + 2× debt subtract → debt double-cleared. Wrapper preempts FSM gate.
        $body = array(
            'id'     => 12345,
            'amount' => 5000.00,
            'note'   => 'รับโอนเข้าธนาคารกสิกร',
        );
        $this->assertReplayMatches( 'invoice/record-payment', $body );
    }

    public function test_invoice_record_payment_different_amount_409(): void {
        // CRITICAL: different amount mid-retry → 409. Admin re-issued retry with
        // different amount must use new idempotency key (e.g. partial 2000 vs full 5000).
        $b1 = array(
            'id'     => 12345,
            'amount' => 5000.00,  // FULL PAYMENT
            'note'   => 'รับโอนเข้าธนาคารกสิกร',
        );
        $b2 = array(
            'id'     => 12345,
            'amount' => 2000.00,  // PARTIAL PAYMENT — different amount
            'note'   => 'รับโอนเข้าธนาคารกสิกร',
        );
        $this->assertDifferentBody(
            'invoice/record-payment',
            $b1, $b2,
            'amount (5000 vs 2000 — full vs partial payment, debt double-clear guard)'
        );
    }

    // ── BATCH 21: INVOICE/RECORD-REFUND (single — CRITICAL debt double-credit guard) ──

    public function test_invoice_record_refund_first_call_success(): void {
        // Body shape: {id, amount, reason, method}. method = enum discriminator.
        $body = array(
            'id'     => 12345,
            'amount' => 1500.00,
            'reason' => 'สินค้าเสียหายจัดส่ง',
            'method' => 'bank_transfer',
        );
        $this->assertFirstCallSuccess( 'invoice/record-refund', $body );
    }

    public function test_invoice_record_refund_replay_matches(): void {
        // CRITICAL replay safety: admin double-click → 2× refund entry + 2× FSM
        // paid→awaiting_payment + 2× debt re-add → debt double-credited.
        $body = array(
            'id'     => 12345,
            'amount' => 1500.00,
            'reason' => 'สินค้าเสียหายจัดส่ง',
            'method' => 'bank_transfer',
        );
        $this->assertReplayMatches( 'invoice/record-refund', $body );
    }

    public function test_invoice_record_refund_different_method_409(): void {
        // method enum discriminator: bank_transfer vs credit_note are different
        // accounting categories — admin must use new key for distinct refund type.
        $b1 = array(
            'id'     => 12345,
            'amount' => 1500.00,
            'reason' => 'สินค้าเสียหายจัดส่ง',
            'method' => 'bank_transfer',
        );
        $b2 = array(
            'id'     => 12345,
            'amount' => 1500.00,
            'reason' => 'สินค้าเสียหายจัดส่ง',
            'method' => 'credit_note',  // DIFFERENT ACCOUNTING CATEGORY
        );
        $this->assertDifferentBody(
            'invoice/record-refund',
            $b1, $b2,
            'method (bank_transfer vs credit_note — accounting category enum discriminator)'
        );
    }

    public function test_invoice_record_refund_different_reason_409(): void {
        // reason text discriminator: admin re-issuing refund with different excuse
        // mid-retry → 409 prevents accidental override of audit log entry.
        $b1 = array(
            'id'     => 12345,
            'amount' => 1500.00,
            'reason' => 'สินค้าเสียหายจัดส่ง',
            'method' => 'bank_transfer',
        );
        $b2 = array(
            'id'     => 12345,
            'amount' => 1500.00,
            'reason' => 'ลูกค้าขอคืนสินค้าตามนโยบาย',  // DIFFERENT REASON
            'method' => 'bank_transfer',
        );
        $this->assertDifferentBody(
            'invoice/record-refund',
            $b1, $b2,
            'reason (different excuse — audit log integrity guard)'
        );
    }

    // ── BATCH 21: INVOICE/CANCEL (single — boolean+text discriminator) ──

    public function test_invoice_cancel_first_call_success(): void {
        // Body shape: {id, force, force_reason}.
        $body = array(
            'id'           => 12345,
            'force'        => 0,
            'force_reason' => '',
        );
        $this->assertFirstCallSuccess( 'invoice/cancel', $body );
    }

    public function test_invoice_cancel_replay_matches(): void {
        // Replay safety: admin "ยกเลิก" double-click on slow LINE push → 2× cancel
        // Flex card + 2× FSM transition + 2× debt reverse.
        $body = array(
            'id'           => 12345,
            'force'        => 0,
            'force_reason' => '',
        );
        $this->assertReplayMatches( 'invoice/cancel', $body );
    }

    public function test_invoice_cancel_force_boolean_discriminator(): void {
        // force=0 (normal cancel) vs force=1 (override after refund) — different
        // audit log paths. Boolean discriminator catches admin re-issuing with
        // force flag toggled.
        $b1 = array( 'id' => 12345, 'force' => 0, 'force_reason' => '' );
        $b2 = array( 'id' => 12345, 'force' => 1, 'force_reason' => 'Admin override after partial payment' );
        $this->assertDifferentBody(
            'invoice/cancel',
            $b1, $b2,
            'force (0 vs 1 — boolean discriminator different audit path)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_43_no_collision_via_fixture(): void {
        $body_map = array(
            'invoice_init' => array(
                'action'  => 'init',
                'user_id' => 42,
            ),
            'invoice_issue' => array( 'id' => 12345 ),
            'invoice_record_payment' => array(
                'id'     => 12345,
                'amount' => 5000.00,
                'note'   => 'รับโอนเข้าธนาคารกสิกร',
            ),
            'invoice_record_refund' => array(
                'id'     => 12345,
                'amount' => 1500.00,
                'reason' => 'สินค้าเสียหายจัดส่ง',
                'method' => 'bank_transfer',
            ),
            'invoice_cancel' => array(
                'id'           => 12345,
                'force'        => 0,
                'force_reason' => '',
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 43 — push past 50% milestone toward 60%', $body_map );
    }
}
