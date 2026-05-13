<?php
/**
 * IdempotencyRound53Test — DRY contract tests for Round 53 batch 31 (4 endpoints).
 *
 * Source: Round 53 (2026-05-13) — push toward 80% milestone (149 → 153 / 196 = 78.1%).
 * 35-round sustained Idempotency-Key campaign Rounds 18-53.
 *
 * Single-snippet batch — all 4 endpoints in `[Admin System] DINOCO Manual Invoice System`
 * V.35.1 → V.35.2. Focus: retry-prone LINE notification endpoints (admin double-click on
 * slow Flex render + LINE push = quota burn + dunning audit row spam).
 *
 *   POST /b2b/v1/invoice/send-reminder
 *       Single shape {id, actor_user_id}. Admin "ส่งเตือนชำระ" double-click on slow
 *       b2b_build_flex_dunning_summary + LINE push → 2× Flex + 2× audit row +
 *       2× delete_post_meta. Different invoice mid-retry (admin clicked wrong row)
 *       → 409 catches the slip.
 *
 *   POST /b2b/v1/invoice/send-overdue-notice
 *       Single shape {id, actor_user_id}. Same risk profile but escalated dunning
 *       (red Flex header + days_overdue calculation). Admin double-click → 2× Flex
 *       push + 2× audit row + 2× delete_post_meta on multiple flag keys.
 *
 *   POST /b2b/v1/invoice/resend-line
 *       Single shape {id, actor_user_id}. Admin "ส่งใหม่" on stuck/failed LINE delivery
 *       is HIGH retry. Without wrapper: 2× Flex card + 2× GD-rendered invoice image
 *       (heavy CPU) + 2× LINE quota burn. **Stores cache ONLY on success** — failed
 *       pushes should be retryable. Different invoice mid-retry → 409.
 *
 *   POST /b2b/v1/invoice/send-summary
 *       Single shape {dist_id, actor_user_id}. Admin "ส่งสรุปบิลค้าง". Layered defense
 *       over existing 60s transient rate-limit: rate-limit returns 429 (failure UX);
 *       cached idempotency replay returns 200 with cached message (smooth UX). Different
 *       distributor mid-retry (admin clicked wrong row) → 409.
 *
 * Namespace coverage shift Round 53:
 *   - B2B namespace: 60 → 64 (+4) — Manual Invoice cluster expansion (10 wrapped → 14)
 *   - All other clusters unchanged (R52 → R53 single-file batch)
 *
 * 153/196 = 78.1%. Pattern maturity Round 53 unchanged: **7 patterns**. Pattern mix R53:
 * **4× single** (all single-id LINE notification endpoints — purest pattern instance
 * since R50 Slip Monitor closure batch).
 *
 * Round 54 candidates — Manual Invoice has 6 more POST routes unwrapped (create / update
 * / verify-slip / verify-slip-combined / upload-slip / delete). 80% milestone +4 needed
 * (157/196). Realistic R54 completes Manual Invoice cluster.
 *
 * Strategic note: R53 closes 4 of the most "user-rage" prone endpoints (admin sees no
 * feedback after click → reflexively clicks again → quota burn). Maximum production
 * value per LOC.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound53Test extends IdempotencyTestFixture {

    // ── BATCH 31 (1/4): INVOICE/SEND-REMINDER (single shape) ──

    public function test_invoice_send_reminder_first_call_success(): void {
        $body = array( 'id' => 12345, 'actor_user_id' => 1 );
        $this->assertFirstCallSuccess( 'b2b/v1::invoice/send-reminder', $body );
    }

    public function test_invoice_send_reminder_replay_matches(): void {
        // Replay safety: admin "ส่งเตือนชำระ" double-click on slow Flex + LINE push.
        // Without wrapper: 2× b2b_build_flex_dunning_summary + 2× LINE push + 2×
        // delete_post_meta('_dunning_reminder_3day_sent') + 2× b2b_add_audit_log.
        // Cached replay = single Flex + single audit row.
        $body = array( 'id' => 12345, 'actor_user_id' => 1 );
        $this->assertReplayMatches( 'b2b/v1::invoice/send-reminder', $body );
    }

    public function test_invoice_send_reminder_different_invoice_409(): void {
        // Admin clicked wrong invoice row mid-retry (UI race during table reorder).
        $b1 = array( 'id' => 12345, 'actor_user_id' => 1 );
        $b2 = array( 'id' => 12346, 'actor_user_id' => 1 );
        $this->assertDifferentBody(
            'b2b/v1::invoice/send-reminder',
            $b1, $b2,
            'id (admin clicked wrong invoice row mid-retry — wrong customer notified if cached returns)'
        );
    }

    public function test_invoice_send_reminder_different_actor_409(): void {
        // Same invoice but different admin pressed button mid-retry — audit trail
        // integrity (must record actual admin who triggered each push).
        $b1 = array( 'id' => 12345, 'actor_user_id' => 1 );
        $b2 = array( 'id' => 12345, 'actor_user_id' => 2 );
        $this->assertDifferentBody(
            'b2b/v1::invoice/send-reminder',
            $b1, $b2,
            'actor_user_id (audit trail integrity — different admin = different audit row)'
        );
    }

    // ── BATCH 31 (2/4): INVOICE/SEND-OVERDUE-NOTICE (single shape) ──

    public function test_invoice_send_overdue_notice_first_call_success(): void {
        $body = array( 'id' => 12345, 'actor_user_id' => 1 );
        $this->assertFirstCallSuccess( 'b2b/v1::invoice/send-overdue-notice', $body );
    }

    public function test_invoice_send_overdue_notice_replay_matches(): void {
        // Same risk profile as send-reminder but escalated dunning (red Flex header).
        // 2× delete_post_meta on 2 different flag keys (day1 + escalated).
        $body = array( 'id' => 12345, 'actor_user_id' => 1 );
        $this->assertReplayMatches( 'b2b/v1::invoice/send-overdue-notice', $body );
    }

    public function test_invoice_send_overdue_notice_different_invoice_409(): void {
        // Admin clicked wrong overdue invoice mid-retry.
        $b1 = array( 'id' => 12345, 'actor_user_id' => 1 );
        $b2 = array( 'id' => 12346, 'actor_user_id' => 1 );
        $this->assertDifferentBody(
            'b2b/v1::invoice/send-overdue-notice',
            $b1, $b2,
            'id (escalated dunning — wrong overdue notice would damage customer relationship)'
        );
    }

    public function test_invoice_send_overdue_notice_different_actor_409(): void {
        // Audit trail integrity for escalated dunning — different admin pressed
        // button mid-retry. Each escalation must record actual triggering admin.
        $b1 = array( 'id' => 12345, 'actor_user_id' => 1 );
        $b2 = array( 'id' => 12345, 'actor_user_id' => 2 );
        $this->assertDifferentBody(
            'b2b/v1::invoice/send-overdue-notice',
            $b1, $b2,
            'actor_user_id (audit trail integrity for escalated dunning)'
        );
    }

    // ── BATCH 31 (3/4): INVOICE/RESEND-LINE (single shape — cache on success only) ──

    public function test_invoice_resend_line_first_call_success(): void {
        $body = array( 'id' => 12345, 'actor_user_id' => 1 );
        $this->assertFirstCallSuccess( 'b2b/v1::invoice/resend-line', $body );
    }

    public function test_invoice_resend_line_replay_matches(): void {
        // Admin "ส่งใหม่" on stuck delivery is HIGH retry. Without wrapper:
        // 2× Flex card + 2× GD-rendered invoice image (heavy CPU ~500ms-2s) + 2× LINE quota.
        // V.34.8 already added observability — V.35.2 adds idempotency dedup.
        $body = array( 'id' => 12345, 'actor_user_id' => 1 );
        $this->assertReplayMatches( 'b2b/v1::invoice/resend-line', $body );
    }

    public function test_invoice_resend_line_different_invoice_409(): void {
        $b1 = array( 'id' => 12345, 'actor_user_id' => 1 );
        $b2 = array( 'id' => 12346, 'actor_user_id' => 1 );
        $this->assertDifferentBody(
            'b2b/v1::invoice/resend-line',
            $b1, $b2,
            'id (wrong invoice resend — image + Flex sent to wrong distributor LINE group)'
        );
    }

    // ── BATCH 31 (4/4): INVOICE/SEND-SUMMARY (single shape — layered over rate limit) ──

    public function test_invoice_send_summary_first_call_success(): void {
        $body = array( 'dist_id' => 999, 'actor_user_id' => 1 );
        $this->assertFirstCallSuccess( 'b2b/v1::invoice/send-summary', $body );
    }

    public function test_invoice_send_summary_replay_matches(): void {
        // Admin "ส่งสรุปบิลค้าง" double-click. Layered defense over 60s transient rate
        // limit: rate-limit blocks 2nd call with 429 (failure UX); cached idempotency
        // replay returns 200 with same message (smooth UX). Both can coexist — rate
        // limit catches malicious abuse, idempotency catches accidental retry.
        $body = array( 'dist_id' => 999, 'actor_user_id' => 1 );
        $this->assertReplayMatches( 'b2b/v1::invoice/send-summary', $body );
    }

    public function test_invoice_send_summary_different_distributor_409(): void {
        // Admin clicked "ส่งสรุปบิลค้าง" on wrong distributor row mid-retry.
        $b1 = array( 'dist_id' => 999, 'actor_user_id' => 1 );
        $b2 = array( 'dist_id' => 888, 'actor_user_id' => 1 );
        $this->assertDifferentBody(
            'b2b/v1::invoice/send-summary',
            $b1, $b2,
            'dist_id (wrong distributor summary — customer audit trail incorrect)'
        );
    }

    public function test_invoice_send_summary_different_actor_409(): void {
        $b1 = array( 'dist_id' => 999, 'actor_user_id' => 1 );
        $b2 = array( 'dist_id' => 999, 'actor_user_id' => 2 );
        $this->assertDifferentBody(
            'b2b/v1::invoice/send-summary',
            $b1, $b2,
            'actor_user_id (audit trail: which admin sent the summary?)'
        );
    }
}
