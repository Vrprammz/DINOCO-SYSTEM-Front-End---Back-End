<?php
/**
 * IdempotencyRound50Test — DRY contract tests for Round 50 batch 28 (5 endpoints).
 *
 * Source: Round 50 (2026-04-30) — 🎯 70% MAJOR MILESTONE attempt + sprint round 50
 * anniversary milestone (32-round sustained Idempotency-Key campaign Rounds 18-50).
 * 139/196 = 70.9% against Round 30 authoritative census denominator.
 *
 *   Batch 28 NEW (5 endpoints — Slip Monitor cluster closure + B2F audit purge):
 *     - POST /dinoco-slip/v1/replay-slip          — admin replay re-invokes
 *                                                   b2b_handle_slip_image cascade
 *                                                   (LINE Content download ~1-2s +
 *                                                   Slip2Go API ~1-3s). Double-click
 *                                                   on slow chain → 2× LINE quota
 *                                                   burn + 2× Slip2Go quota burn +
 *                                                   possible 2× debt subtract path
 *                                                   (d). Body hash = single {log_id}
 *                                                   only. Different log_id mid-retry
 *                                                   → 409 (admin clicked wrong row).
 *     - POST /dinoco-slip/v1/review-decision      — admin "บันทึก decision" pool
 *                                                   sweep. Body hash = single
 *                                                   {log_id, decision,
 *                                                   delete_image}. DB has audit
 *                                                   lock (review_decision NOT NULL
 *                                                   → 409) but cached idempotency
 *                                                   replay extends across full TTL
 *                                                   beyond DB lock so duplicate
 *                                                   audit_log row never even
 *                                                   attempts INSERT. Different
 *                                                   decision (is_slip vs not_slip
 *                                                   vs manual_process) → 409
 *                                                   catches admin re-evaluation.
 *     - POST /dinoco-slip/v1/ai-toggle            — admin "🔄 Toggle AI Classifier"
 *                                                   double-click → 2× update_option
 *                                                   flicker + 2× audit_log
 *                                                   "config_change". Body hash =
 *                                                   boolean+constant-marker
 *                                                   {action:'ai-toggle', explicit:
 *                                                   'on'|'off'|'toggle', user_id}.
 *                                                   Different explicit mode mid-
 *                                                   retry → 409 (admin re-
 *                                                   evaluation toggle vs explicit
 *                                                   ON).
 *     - POST /dinoco-slip/v1/issue-credit-note    — CRITICAL retry-prone admin
 *                                                   credit-note debt subtract chain
 *                                                   (b2b_debt_subtract FOR UPDATE +
 *                                                   dinoco_audit_log + slip_log
 *                                                   UPDATE + LINE push + admin Flex
 *                                                   ~1-3s). DB has GET_LOCK
 *                                                   dnc_cn_{log_id} 3s timeout +
 *                                                   credit_note_issued_at NOT NULL
 *                                                   → 409 inside lock, BUT cached
 *                                                   replay extends across full TTL
 *                                                   beyond GET_LOCK so retry 5s+
 *                                                   later (lock released) skips DB
 *                                                   round-trip entirely. Body hash =
 *                                                   single {log_id, amount round(2),
 *                                                   notify_dist}. reason EXCLUDED
 *                                                   (audit annotation — admin may
 *                                                   correct text mid-retry; >=10
 *                                                   chars validation enforces
 *                                                   meaningful audit). Different
 *                                                   amount mid-retry → 409 catches
 *                                                   admin typo (CRITICAL: prevents
 *                                                   wrong debt subtract via cached
 *                                                   replay = wrong distributor LINE
 *                                                   notify amount + accounting
 *                                                   reconciliation drift).
 *     - POST /dinoco-b2f-audit/v1/purge-stale-prices — admin "🧹 Purge Stale Prices"
 *                                                   trigger. Body hash = constant-
 *                                                   marker {action:'purge-stale-
 *                                                   prices', sentinel, dry_run,
 *                                                   user_id}. **9th constant-marker
 *                                                   instance** after R30 stock/
 *                                                   initialize + R32 manual-flash-
 *                                                   test + R39 daily-summary + R40
 *                                                   dip-stock/start + R43 invoice/
 *                                                   init + R47 stock/sync-missing +
 *                                                   R49 smoke-test + R49 flag-audit/
 *                                                   retention/run — pattern fully
 *                                                   mature across **9 endpoints in
 *                                                   9 rounds**. Double-click on slow
 *                                                   UPDATE batch + N× cache flush →
 *                                                   2× UPDATE storm + 2× flush.
 *                                                   Different sentinel mid-retry
 *                                                   (admin typed 999 instead of
 *                                                   666) → 409. dry_run=1 → live=0
 *                                                   different hashes (preview vs
 *                                                   commit semantics distinct).
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3-4 cases per
 * endpoint (first_call_success / replay_matches / different_field_409) +
 * cumulative no-collision. Total: 18 tests.
 *
 * After Round 50 the breakdown:
 *   - B2F namespace: 22 endpoints (unchanged)
 *   - B2B namespace: 60 endpoints (unchanged)
 *   - Inventory namespace: 23 endpoints (unchanged)
 *   - MCP namespace: 13 endpoints (unchanged)
 *   - LIFF AI namespace: 5 endpoints (unchanged)
 *   - Brand Voice namespace: 4 endpoints (unchanged)
 *   - Onboarding namespace: 2 endpoints (unchanged)
 *   - dinoco/v1 cluster: 3 endpoints (unchanged from Round 49)
 *   - dinoco-slip/v1: +4 endpoints (R50: replay-slip + review-decision + ai-toggle +
 *     issue-credit-note — closes Slip Monitor 6/6 POST endpoints — first cluster
 *     fully saturated since MCP R35)
 *   - dinoco-b2f-audit/v1: +1 endpoint (R50: purge-stale-prices — NEW namespace
 *     integration; first b2f-audit endpoint wrapped after 19 sibling POSTs, marks
 *     b2f-audit cluster opening for Round 51+)
 *
 * 139/196 = 70.9% — **🎯 70% MAJOR MILESTONE REACHED**. 32-round sustained campaign
 * Rounds 18-50 (sprint round 50 anniversary). Pattern maturity at Round 50
 * unchanged: **7 patterns** (single / bulk / bulk-of-targets / state-machine /
 * boolean+enum-discriminator / constant-marker / binary-fingerprint). Pattern mix
 * R50: 3× single (replay-slip + review-decision + issue-credit-note) + 1× boolean+
 * constant-marker hybrid (ai-toggle) + 1× constant-marker (purge-stale-prices —
 * 9th instance). Constant-marker pattern fully mature across 9 endpoints in 9
 * rounds — pattern proven for "no semantic params, audit-row only" admin trigger
 * endpoints.
 *
 * Round 51 candidate batch 29 — post-70% slowdown OR continue toward 80% (157/196):
 *   - POST /dinoco-b2f-audit/v1/sync-missing-intermediates (constant-marker +
 *     dry_run boolean — coverage rule cleanup tool, similar to purge-stale-prices)
 *   - POST /dinoco-b2f-audit/v1/junction-bulk-delete (CRITICAL bulk — soft-delete
 *     SKUs from junction table; bulk-of-targets pattern with skus[] + add_to_
 *     blacklist boolean + only_auto_synced boolean discriminators)
 *   - POST /dinoco-b2f-audit/v1/autosync-blacklist (single {maker_id, sku, action:
 *     'add'|'remove'} — admin manual blacklist tweak)
 *   - POST /dinoco-b2f-audit/v1/junction-update-classification (state-machine
 *     optimistic concurrency on classification field)
 *   - POST /dinoco-b2f-audit/v1/junction-confirm-classification (idempotent re-
 *     confirm; native idempotent semantics + cached replay layered defense)
 *   - Strategic recommendation: 1-2 weeks production canary observation matching
 *     R42 50% pause pattern after 70% milestone reached. Round 51 should be
 *     first-week light batch (1-2 endpoints) or pivot to OpenAPI bulk doc sweep.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound50Test extends IdempotencyTestFixture {

    // ── BATCH 28: REPLAY-SLIP (single — slow LINE+Slip2Go cascade) ──

    public function test_replay_slip_first_call_success(): void {
        // Body shape: single {log_id} only.
        $body = array(
            'log_id' => 12345,
        );
        $this->assertFirstCallSuccess( 'slip-replay-slip', $body );
    }

    public function test_replay_slip_replay_matches(): void {
        // Replay safety: admin "Replay" double-click on slow b2b_handle_slip_image
        // cascade (LINE Content download ~1-2s + Slip2Go API ~1-3s) → cached 200
        // instant + skip entire cascade — saves ~5s + 2× LINE quota + 2× Slip2Go
        // quota.
        $body = array(
            'log_id' => 12345,
        );
        $this->assertReplayMatches( 'slip-replay-slip', $body );
    }

    public function test_replay_slip_different_log_id_409(): void {
        // CRITICAL: admin clicked DIFFERENT log row mid-retry → 409 catches wrong-
        // record replay risk (wrong log_id via cached replay would re-trigger
        // wrong slip cascade + wrong audit row).
        $b1 = array( 'log_id' => 12345 );
        $b2 = array( 'log_id' => 67890 );
        $this->assertDifferentBody(
            'slip-replay-slip',
            $b1, $b2,
            'log_id (admin clicked wrong slip row mid-retry — wrong-record cascade replay)'
        );
    }

    // ── BATCH 28: REVIEW-DECISION (single — pool sweep audit ) ──

    public function test_review_decision_first_call_success(): void {
        // Body shape: single {log_id, decision, delete_image}.
        $body = array(
            'log_id'       => 12345,
            'decision'     => 'is_slip',
            'delete_image' => 0,
        );
        $this->assertFirstCallSuccess( 'slip-review-decision', $body );
    }

    public function test_review_decision_replay_matches(): void {
        // Replay safety: pool sweep "บันทึก" double-click → cached 200 + skip 2×
        // UPDATE row + 2× audit_log "slip_review_decision".
        $body = array(
            'log_id'       => 12345,
            'decision'     => 'is_slip',
            'delete_image' => 0,
        );
        $this->assertReplayMatches( 'slip-review-decision', $body );
    }

    public function test_review_decision_different_decision_409(): void {
        // CRITICAL: admin re-evaluated mid-retry (is_slip → not_slip) → 409 catches
        // — wrong cached decision via replay corrupts audit trail (e.g. is_slip
        // cached but admin wanted not_slip → image stays on disk despite intent).
        $b1 = array(
            'log_id'       => 12345,
            'decision'     => 'is_slip',
            'delete_image' => 0,
        );
        $b2 = array(
            'log_id'       => 12345,
            'decision'     => 'not_slip',  // ADMIN RE-EVALUATED
            'delete_image' => 1,           // not_slip → also deletes image
        );
        $this->assertDifferentBody(
            'slip-review-decision',
            $b1, $b2,
            'decision (admin re-evaluation is_slip→not_slip mid-retry — audit trail integrity)'
        );
    }

    // ── BATCH 28: AI-TOGGLE (boolean+constant-marker — config flip) ──

    public function test_ai_toggle_first_call_success(): void {
        // Body shape: boolean+constant-marker {action:'ai-toggle', explicit, user_id}.
        // explicit = 'toggle' when admin posts no enabled body (current value flips).
        $body = array(
            'action'   => 'ai-toggle',
            'explicit' => 'toggle',
            'user_id'  => 1,
        );
        $this->assertFirstCallSuccess( 'slip-ai-toggle', $body );
    }

    public function test_ai_toggle_replay_matches(): void {
        // Replay safety: admin "🔄 Toggle" double-click within rate window →
        // cached 200 + skip 2× update_option flicker + 2× audit row.
        $body = array(
            'action'   => 'ai-toggle',
            'explicit' => 'toggle',
            'user_id'  => 1,
        );
        $this->assertReplayMatches( 'slip-ai-toggle', $body );
    }

    public function test_ai_toggle_different_explicit_409(): void {
        // CRITICAL: admin re-evaluated mid-retry (clicked toggle then decided
        // explicit ON) → 409 catches re-evaluation — wrong cached toggle vs
        // explicit semantic via replay would set wrong final state.
        $b1 = array(
            'action'   => 'ai-toggle',
            'explicit' => 'toggle',
            'user_id'  => 1,
        );
        $b2 = array(
            'action'   => 'ai-toggle',
            'explicit' => 'on',  // ADMIN RE-EVALUATED — explicit ON
            'user_id'  => 1,
        );
        $this->assertDifferentBody(
            'slip-ai-toggle',
            $b1, $b2,
            'explicit (admin re-evaluation toggle vs explicit ON mid-retry — final state drift)'
        );
    }

    // ── BATCH 28: ISSUE-CREDIT-NOTE (single CRITICAL financial) ──

    public function test_issue_credit_note_first_call_success(): void {
        // Body shape: single {log_id, amount round(2), notify_dist}.
        // reason EXCLUDED (audit annotation — admin may correct text mid-retry).
        $body = array(
            'log_id'      => 12345,
            'amount'      => 1500.00,
            'notify_dist' => 1,
        );
        $this->assertFirstCallSuccess( 'slip-issue-credit-note', $body );
    }

    public function test_issue_credit_note_replay_matches(): void {
        // Replay safety: admin "💰 ออก Credit Note" double-click on slow chain
        // (b2b_debt_subtract FOR UPDATE + audit_log + slip_log UPDATE + LINE
        // push + admin Flex ~1-3s). DB has GET_LOCK 3s timeout but cached
        // idempotency replay extends across full TTL beyond GET_LOCK so retry
        // 5s+ later (lock released) skips DB round-trip entirely.
        $body = array(
            'log_id'      => 12345,
            'amount'      => 1500.00,
            'notify_dist' => 1,
        );
        $this->assertReplayMatches( 'slip-issue-credit-note', $body );
    }

    public function test_issue_credit_note_different_amount_409(): void {
        // CRITICAL: admin typed wrong amount then corrected mid-retry → 409
        // catches business decision change. Wrong amount via cached replay would
        // double-subtract debt + show wrong amount in distributor LINE Flex +
        // accounting reconciliation drift on next finance close.
        $b1 = array(
            'log_id'      => 12345,
            'amount'      => 1500.00,
            'notify_dist' => 1,
        );
        $b2 = array(
            'log_id'      => 12345,
            'amount'      => 2000.00,  // ADMIN CORRECTED (typo 1500→2000)
            'notify_dist' => 1,
        );
        $this->assertDifferentBody(
            'slip-issue-credit-note',
            $b1, $b2,
            'amount (admin typo correction 1500→2000 mid-retry — wrong debt subtract via replay)'
        );
    }

    public function test_issue_credit_note_different_log_id_409(): void {
        // CRITICAL: admin clicked DIFFERENT overpayment row mid-retry → 409
        // catches wrong-record credit-note risk (would credit wrong distributor
        // + wrong slip_log forensic chain).
        $b1 = array(
            'log_id'      => 12345,
            'amount'      => 1500.00,
            'notify_dist' => 1,
        );
        $b2 = array(
            'log_id'      => 67890,  // ADMIN CLICKED WRONG OVERPAYMENT ROW
            'amount'      => 1500.00,
            'notify_dist' => 1,
        );
        $this->assertDifferentBody(
            'slip-issue-credit-note',
            $b1, $b2,
            'log_id (admin clicked wrong overpayment row mid-retry — wrong-distributor credit risk)'
        );
    }

    // ── BATCH 28: PURGE-STALE-PRICES (constant-marker — 9th instance) ──

    public function test_purge_stale_prices_first_call_success(): void {
        // Body shape: constant-marker {action:'purge-stale-prices', sentinel,
        // dry_run, user_id}. **9th constant-marker instance** after R30/R32/R39/
        // R40/R43/R47/R49(×2). dry_run=1 (default safe — preview).
        $body = array(
            'action'   => 'purge-stale-prices',
            'sentinel' => 666.00,
            'dry_run'  => 1,
            'user_id'  => 1,
        );
        $this->assertFirstCallSuccess( 'b2f-audit-purge-stale-prices', $body );
    }

    public function test_purge_stale_prices_replay_matches(): void {
        // Replay safety: admin "🧹 Purge Stale Prices" double-click on slow
        // UPDATE batch (sentinel hits 100+ rows + N× do_action 'b2f_junction_
        // updated' cache invalidation ~500ms total) → cached 200 + skip 2×
        // UPDATE storm + 2× cache flush.
        $body = array(
            'action'   => 'purge-stale-prices',
            'sentinel' => 666.00,
            'dry_run'  => 1,
            'user_id'  => 1,
        );
        $this->assertReplayMatches( 'b2f-audit-purge-stale-prices', $body );
    }

    public function test_purge_stale_prices_different_dry_run_409(): void {
        // CRITICAL: admin clicked dry_run=1 preview → reviewed → switched to
        // commit (dry_run=0) → 409 catches preview vs commit semantic drift —
        // cached preview replay returning instead of committing live UPDATE
        // would silently skip the actual purge admin intended.
        $b1 = array(
            'action'   => 'purge-stale-prices',
            'sentinel' => 666.00,
            'dry_run'  => 1,
            'user_id'  => 1,
        );
        $b2 = array(
            'action'   => 'purge-stale-prices',
            'sentinel' => 666.00,
            'dry_run'  => 0,  // ADMIN COMMITTED (preview → live)
            'user_id'  => 1,
        );
        $this->assertDifferentBody(
            'b2f-audit-purge-stale-prices',
            $b1, $b2,
            'dry_run (admin preview→commit mid-retry — preview vs commit semantic drift)'
        );
    }

    public function test_purge_stale_prices_different_sentinel_409(): void {
        // CRITICAL: admin typo on sentinel value (666→999) → 409 catches admin
        // re-evaluation — wrong cached sentinel via replay would purge wrong
        // pseudo-NULL marker rows.
        $b1 = array(
            'action'   => 'purge-stale-prices',
            'sentinel' => 666.00,
            'dry_run'  => 0,
            'user_id'  => 1,
        );
        $b2 = array(
            'action'   => 'purge-stale-prices',
            'sentinel' => 999.00,  // ADMIN TYPO CORRECTION 666→999
            'dry_run'  => 0,
            'user_id'  => 1,
        );
        $this->assertDifferentBody(
            'b2f-audit-purge-stale-prices',
            $b1, $b2,
            'sentinel (admin typo correction 666→999 mid-retry — wrong-marker purge risk)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_50_no_collision_via_fixture(): void {
        $body_map = array(
            'slip_replay_slip'             => array(
                'log_id' => 12345,
            ),
            'slip_review_decision'         => array(
                'log_id'       => 12345,
                'decision'     => 'is_slip',
                'delete_image' => 0,
            ),
            'slip_ai_toggle'               => array(
                'action'   => 'ai-toggle',
                'explicit' => 'toggle',
                'user_id'  => 1,
            ),
            'slip_issue_credit_note'       => array(
                'log_id'      => 12345,
                'amount'      => 1500.00,
                'notify_dist' => 1,
            ),
            'b2f_audit_purge_stale_prices' => array(
                'action'   => 'purge-stale-prices',
                'sentinel' => 666.00,
                'dry_run'  => 1,
                'user_id'  => 1,
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 50 — 🎯 70% MAJOR MILESTONE (139/196 = 70.9%, sprint anniversary)', $body_map );
    }
}
