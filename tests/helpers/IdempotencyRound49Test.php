<?php
/**
 * IdempotencyRound49Test — DRY contract tests for Round 49 batch 27 (5 endpoints).
 *
 * Source: Round 49 (2026-04-30) — push toward 70% milestone after 🎯🎯 60% MAJOR
 * MILESTONE achieved at Round 46. 134/196 = 68.4% against Round 30 authoritative
 * census denominator. **31-round sustained Idempotency-Key campaign Rounds 18-49.**
 *
 *   Batch 27 NEW (5 endpoints — admin-tooling cluster across 3 files):
 *     - POST /dinoco/v1/health/run-check                 — admin manual probe trigger
 *                                                          (16 health checks). Slow
 *                                                          probes (line_api_health
 *                                                          ~2s, flash_v42_health ~1s)
 *                                                          → admin double-click → 2×
 *                                                          remote network call + 2×
 *                                                          dinoco_audit_log row +
 *                                                          LINE/Flash quota burn.
 *                                                          Body hash = single
 *                                                          {key, user_id} — same key
 *                                                          retry = cached 200; diff
 *                                                          key mid-retry → 409.
 *     - POST /dinoco/v1/smoke-test                       — admin "Run Full System
 *                                                          Test" trigger. 16 health
 *                                                          probes + 5 integration
 *                                                          tests + 1 audit_log row
 *                                                          proof-of-write +
 *                                                          cumulative_pass counter
 *                                                          bump. Double-click = 2×
 *                                                          audit row + 2× counter.
 *                                                          Body hash = constant-
 *                                                          marker {action, user_id}
 *                                                          — 7th constant-marker
 *                                                          instance after R30/R32/
 *                                                          R39/R40/R43/R47.
 *     - POST /dinoco/v1/flag-audit/retention/run         — admin manual prune (90+
 *                                                          days = up to ~10K rows
 *                                                          DELETE + index rebuild).
 *                                                          Double-click → 2× DELETE
 *                                                          storm + 2× last_run
 *                                                          option overwrite. Body
 *                                                          hash = constant-marker
 *                                                          {action, user_id} — 8th
 *                                                          constant-marker instance.
 *     - POST /dinoco-slip/v1/clear-locks                 — admin force-unlock for
 *                                                          slip race recovery. Body
 *                                                          hash = single {group_id,
 *                                                          reason} — different
 *                                                          reason mid-retry → 409
 *                                                          forces correct audit
 *                                                          message.
 *     - POST /dinoco-slip/v1/manual-process              — CRITICAL retry-prone
 *                                                          admin debt subtract for
 *                                                          Slip2Go quota deadlock
 *                                                          rescue. Double-click on
 *                                                          slow b2b_debt_subtract +
 *                                                          LINE push + audit log →
 *                                                          2× debt subtract (FOR
 *                                                          UPDATE prevents physical
 *                                                          race BUT cached
 *                                                          idempotency replay
 *                                                          extends protection
 *                                                          across full TTL beyond
 *                                                          GET_LOCK window). Body
 *                                                          hash = single {dist_id,
 *                                                          amount, trans_ref,
 *                                                          sender_name} core —
 *                                                          image_b64 EXCLUDED
 *                                                          (binary blob).
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3-4 cases per
 * endpoint (first_call_success / replay_matches / different_field_409) +
 * cumulative no-collision. Total: 17 tests.
 *
 * After Round 49 the breakdown:
 *   - B2F namespace: 22 endpoints (unchanged)
 *   - B2B namespace: 60 endpoints (unchanged)
 *   - Inventory namespace: 23 endpoints (unchanged)
 *   - MCP namespace: 13 endpoints (unchanged)
 *   - LIFF AI namespace: 5 endpoints (unchanged)
 *   - Brand Voice namespace: 4 endpoints (unchanged)
 *   - Onboarding namespace: 2 endpoints (unchanged)
 *   - dinoco/v1 (Health + Flag Audit cluster): +3 endpoints (R49: health/run-check
 *     + smoke-test + flag-audit/retention/run)
 *   - dinoco-slip/v1: +2 endpoints (R49: clear-locks + manual-process — NEW
 *     namespace integration)
 *
 * 134/196 = 68.4% — push past 🎯🎯 60% MAJOR MILESTONE toward 70% target. 31-round
 * sustained campaign. Pattern maturity at Round 49 unchanged: **7 patterns** (single
 * / bulk / bulk-of-targets / state-machine / boolean+enum-discriminator /
 * constant-marker / binary-fingerprint). Pattern mix R49: 3× single (health/run-
 * check + clear-locks + manual-process) + 2× constant-marker (smoke-test + flag-
 * audit/retention/run — 7th + 8th constant-marker instances proving pattern
 * maturity across 8 endpoints in 8 rounds).
 *
 * Round 50 candidate batch 28 — 🎯 70% MAJOR MILESTONE (need +4 → 138/196 = 70.4%):
 *   - POST /dinoco/v1/audit/retention/run (Audit Log retention manual trigger)
 *   - POST /dinoco-slip/v1/replay-slip (slip replay action)
 *   - POST /dinoco-slip/v1/review-decision (admin review verdict)
 *   - POST /dinoco-slip/v1/issue-credit-note (credit-note workflow)
 *   - Strategic note: 🎯 70% milestone within reach in 1 batch — recommend Round 50
 *     execution then 1-2 weeks production canary observation matching Round 42 50%
 *     pause pattern.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound49Test extends IdempotencyTestFixture {

    // ── BATCH 27: HEALTH/RUN-CHECK (single — admin probe trigger) ──

    public function test_health_run_check_first_call_success(): void {
        // Body shape: {key, user_id}. key = registered health check identifier
        // (e.g. 'line_api_health', 'flash_v42_health', 'audit_log_writable').
        $body = array(
            'key'     => 'line_api_health',
            'user_id' => 1,
        );
        $this->assertFirstCallSuccess( 'health-run-check', $body );
    }

    public function test_health_run_check_replay_matches(): void {
        // Replay safety: admin "Run Check" double-click on slow probe (LINE API ~2s,
        // Flash routes ~1s) → cached 200 instant + skip remote call + skip duplicate
        // dinoco_audit_log row. Crucial for rate-limited remote APIs.
        $body = array(
            'key'     => 'line_api_health',
            'user_id' => 1,
        );
        $this->assertReplayMatches( 'health-run-check', $body );
    }

    public function test_health_run_check_different_key_409(): void {
        // CRITICAL: admin clicked DIFFERENT probe button mid-retry → 409 catches
        // wrong-cache replay risk (each probe writes audit_log target_id = key —
        // wrong target_id would corrupt forensic trail).
        $b1 = array( 'key' => 'line_api_health',     'user_id' => 1 );
        $b2 = array( 'key' => 'flash_v42_health',    'user_id' => 1 );
        $this->assertDifferentBody(
            'health-run-check',
            $b1, $b2,
            'key (admin clicked different probe button mid-retry — wrong cache replay risk)'
        );
    }

    // ── BATCH 27: SMOKE-TEST (constant-marker — full system test trigger) ──

    public function test_smoke_test_first_call_success(): void {
        // Body shape: constant-marker {action: 'smoke-test', user_id}.
        // Handler takes no params + 16 health probes + 5 integration probes + 1
        // intentional audit_log row "smoke_test" (proof-of-write) + counter bump.
        $body = array(
            'action'  => 'smoke-test',
            'user_id' => 1,
        );
        $this->assertFirstCallSuccess( 'smoke-test', $body );
    }

    public function test_smoke_test_replay_matches(): void {
        // Replay safety: admin double-click "Run Full System Test" on 2-5s probe
        // chain → cached 200 instant + skip 2× audit row + skip counter bump (would
        // inflate _dinoco_smoke_cumulative_pass twice).
        $body = array(
            'action'  => 'smoke-test',
            'user_id' => 1,
        );
        $this->assertReplayMatches( 'smoke-test', $body );
    }

    public function test_smoke_test_different_user_409(): void {
        // CROSS-ADMIN guard: same idem-key with different user_id → 409 surfaces
        // fleet key reuse. user_id scopes per-admin (different admin = independent
        // test scope, must NOT alias).
        $b1 = array( 'action' => 'smoke-test', 'user_id' => 1 );
        $b2 = array( 'action' => 'smoke-test', 'user_id' => 7 );
        $this->assertDifferentBody(
            'smoke-test',
            $b1, $b2,
            'user_id (cross-admin idem-key reuse — fleet key collision)'
        );
    }

    // ── BATCH 27: FLAG-AUDIT/RETENTION/RUN (constant-marker — manual prune) ──

    public function test_flag_audit_retention_run_first_call_success(): void {
        // Body shape: constant-marker {action: 'retention-run', user_id}.
        // Handler takes no params + DELETE all rows older than retention_days (90
        // default) + last_run option overwrite.
        $body = array(
            'action'  => 'retention-run',
            'user_id' => 1,
        );
        $this->assertFirstCallSuccess( 'flag-audit-retention-run', $body );
    }

    public function test_flag_audit_retention_run_replay_matches(): void {
        // Replay safety: admin double-click on slow DELETE (90+ days = ~10K rows +
        // index rebuild ~2-5s) → cached 200 instant + skip 2× DELETE storm + skip
        // last_run overwrite.
        $body = array(
            'action'  => 'retention-run',
            'user_id' => 1,
        );
        $this->assertReplayMatches( 'flag-audit-retention-run', $body );
    }

    public function test_flag_audit_retention_run_different_user_409(): void {
        // CROSS-ADMIN guard: idem-key reuse across admins → 409.
        $b1 = array( 'action' => 'retention-run', 'user_id' => 1 );
        $b2 = array( 'action' => 'retention-run', 'user_id' => 99 );
        $this->assertDifferentBody(
            'flag-audit-retention-run',
            $b1, $b2,
            'user_id (cross-admin retention trigger — different admin reusing key)'
        );
    }

    // ── BATCH 27: SLIP/CLEAR-LOCKS (single — slip race recovery) ──

    public function test_clear_locks_first_call_success(): void {
        // Body shape: single {group_id, reason}.
        $body = array(
            'group_id' => 'C1234567890abcdef1234567890abcdef',
            'reason'   => 'Slip2Go quota deadlock recovery',
        );
        $this->assertFirstCallSuccess( 'slip-clear-locks', $body );
    }

    public function test_clear_locks_replay_matches(): void {
        // Replay safety: admin "Clear Locks" double-click → cached 200 instant +
        // skip 2× DELETE LIKE pattern + skip duplicate audit row.
        $body = array(
            'group_id' => 'C1234567890abcdef1234567890abcdef',
            'reason'   => 'Slip2Go quota deadlock recovery',
        );
        $this->assertReplayMatches( 'slip-clear-locks', $body );
    }

    public function test_clear_locks_different_reason_409(): void {
        // CRITICAL: admin re-typed reason mid-retry to clarify audit message → 409
        // forces admin to use the corrected reason on the actual write (audit
        // trail integrity — must not store stale reason from cached replay).
        $b1 = array(
            'group_id' => 'C1234567890abcdef1234567890abcdef',
            'reason'   => 'Slip2Go quota deadlock recovery',
        );
        $b2 = array(
            'group_id' => 'C1234567890abcdef1234567890abcdef',
            'reason'   => 'Slip2Go quota deadlock — ticket #6312 escalation',  // CLARIFIED
        );
        $this->assertDifferentBody(
            'slip-clear-locks',
            $b1, $b2,
            'reason (admin clarified audit message mid-retry — audit trail integrity)'
        );
    }

    // ── BATCH 27: SLIP/MANUAL-PROCESS (single — CRITICAL debt subtract) ──

    public function test_manual_process_first_call_success(): void {
        // Body shape: single {dist_id, amount, trans_ref, sender_name}.
        // image_b64 EXCLUDED (binary blob too large for idempotency_keys row;
        // image_hash + trans_ref + GET_LOCK provide layered defense already).
        // reason EXCLUDED (admin may correct text without 409 — audit annotation).
        $body = array(
            'dist_id'     => 1234,
            'amount'      => 5000.0,
            'trans_ref'   => 'TX20260430120000',
            'sender_name' => 'นายสมชาย ใจดี',
        );
        $this->assertFirstCallSuccess( 'slip-manual-process', $body );
    }

    public function test_manual_process_replay_matches(): void {
        // Replay safety: admin "บันทึก Manual" double-click on slow b2b_debt_
        // subtract + LINE push + audit log → cached 200 instant + skip 2× debt
        // subtract (FOR UPDATE prevents physical race within window BUT cached
        // idempotency replay extends protection across full TTL beyond GET_LOCK).
        $body = array(
            'dist_id'     => 1234,
            'amount'      => 5000.0,
            'trans_ref'   => 'TX20260430120000',
            'sender_name' => 'นายสมชาย ใจดี',
        );
        $this->assertReplayMatches( 'slip-manual-process', $body );
    }

    public function test_manual_process_different_amount_409(): void {
        // CRITICAL: admin typed wrong amount then corrected mid-retry → 409
        // catches business decision change. Wrong amount via cached replay would
        // double-subtract debt + show wrong amount in distributor LINE Flex.
        $b1 = array(
            'dist_id'     => 1234,
            'amount'      => 5000.0,
            'trans_ref'   => 'TX20260430120000',
            'sender_name' => 'นายสมชาย ใจดี',
        );
        $b2 = array(
            'dist_id'     => 1234,
            'amount'      => 5500.0,  // ADMIN CORRECTED amount (typo 5000→5500)
            'trans_ref'   => 'TX20260430120000',
            'sender_name' => 'นายสมชาย ใจดี',
        );
        $this->assertDifferentBody(
            'slip-manual-process',
            $b1, $b2,
            'amount (admin typo correction 5000→5500 mid-retry — wrong amount stuck via cached replay)'
        );
    }

    public function test_manual_process_different_dist_409(): void {
        // CRITICAL: admin clicked DIFFERENT distributor mid-retry → 409 catches
        // wrong-shop debt subtract risk (debt subtract on wrong dist_id would
        // cascade to wrong LINE notify + wrong audit row).
        $b1 = array(
            'dist_id'     => 1234,
            'amount'      => 5000.0,
            'trans_ref'   => 'TX20260430120000',
            'sender_name' => 'นายสมชาย ใจดี',
        );
        $b2 = array(
            'dist_id'     => 5678,  // ADMIN CLICKED WRONG DIST (UI form drift)
            'amount'      => 5000.0,
            'trans_ref'   => 'TX20260430120000',
            'sender_name' => 'นายสมชาย ใจดี',
        );
        $this->assertDifferentBody(
            'slip-manual-process',
            $b1, $b2,
            'dist_id (admin clicked wrong distributor mid-retry — wrong-shop debt subtract risk)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_49_no_collision_via_fixture(): void {
        $body_map = array(
            'health_run_check'           => array(
                'key'     => 'line_api_health',
                'user_id' => 1,
            ),
            'smoke_test'                 => array(
                'action'  => 'smoke-test',
                'user_id' => 1,
            ),
            'flag_audit_retention_run'   => array(
                'action'  => 'retention-run',
                'user_id' => 1,
            ),
            'slip_clear_locks'           => array(
                'group_id' => 'C1234567890abcdef1234567890abcdef',
                'reason'   => 'Slip2Go quota deadlock recovery',
            ),
            'slip_manual_process'        => array(
                'dist_id'     => 1234,
                'amount'      => 5000.0,
                'trans_ref'   => 'TX20260430120000',
                'sender_name' => 'นายสมชาย ใจดี',
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 49 — push toward 70% milestone (134/196 = 68.4%)', $body_map );
    }
}
