<?php
/**
 * IdempotencyRound39Test — DRY contract tests for Round 39 batch 17 (5 endpoints).
 *
 * Source: Round 39 (2026-04-30) — push toward 🎯 45% milestone (84/196 = 42.9%) against
 * Round 30 authoritative census denominator. Closes Snippet 5 + Snippet 9 Flash admin
 * setup cluster after Round 38 saturated Snippet 3 long-tail.
 *
 *   Batch 17 NEW (5 endpoints — Snippet 5 Flash ops + Snippet 9 Flash admin setup):
 *     - POST /b2b/v1/flash-ready-to-ship — Admin double-click "พร้อมจัดส่ง" → 2× distributor
 *                                          Flex push spam + 2× Flash courier /notify quota
 *                                          burn + 2× admin LINE notification + 2× audit log
 *                                          churn per ticket. Bulk-shape {ticket_ids sorted +
 *                                          deduped} — admin input order shouldn't affect cache
 *                                          key. Single ticket_id param coerced to ticket_ids:[id].
 *     - POST /b2b/v1/daily-summary       — Admin manual-trigger "ส่งสรุป" button → 2× admin
 *                                          Flex summary card + 2× DB storm cron-replica read.
 *                                          Constant-marker {action: 'trigger-summary'} — no
 *                                          params at all.
 *     - POST /b2b/v1/flash-webhook-setup — Admin "ตั้งค่า Webhook" → 2× POST /notify/setting
 *                                          × 5 codes (10 Flash API calls instead of 5; quota
 *                                          burn). Bulk-shape {webhook_url, codes:[0..4]}.
 *                                          Different webhook_url (site URL change between
 *                                          retries) → 409 alerts admin to env mismatch.
 *     - POST /b2b/v1/flash-api-test      — Admin "ทดสอบ Flash API" → 2× GET /warehouses
 *                                          (read-only but counts toward rate limit). Bulk-shape
 *                                          {action, mch_id, is_production}. is_production
 *                                          discriminator (training vs prod env switch) → 409.
 *                                          Errors NOT cached (admin can retry after config fix
 *                                          without TTL wait — implementation detail).
 *     - POST /b2b/v1/test-push           — Admin "ทดสอบ Push" → 2× LINE push to admin group
 *                                          (notification spam). Single-shape {target, message}.
 *                                          Different message text → 409 (admin changed mind).
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per endpoint
 * (first_call_success / replay_matches / different_field_409) + cumulative no-collision +
 * 1 cross-namespace pair guard. Round 39 introduces "constant-marker" pattern again
 * (last seen Round 32 manual-flash-test + Round 30 stock/initialize) — daily-summary takes
 * no params so cache key relies solely on namespace + the literal action string.
 *
 * After Round 39 the B2B namespace coverage = 39 integrated POST endpoints (+5 since Round 38
 * — 2 in Snippet 5 + 3 in Snippet 9). Snippet 5 coverage = 11 endpoints integrated. Snippet 9
 * coverage = 6 endpoints integrated (was 3 after Round 34).
 *
 * 🎯 Push toward 45% milestone: 84/196 = 42.9% — past 4.2/10 of POST surface integrated.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound39Test extends IdempotencyTestFixture {

    // ── BATCH 17: FLASH-READY-TO-SHIP (admin batch ready signal) ──

    public function test_flash_ready_to_ship_first_call_success(): void {
        // Body shape: {ticket_ids sorted+deduped} — handler accepts single ticket_id OR array.
        // Sort + dedup means admin input order shouldn't matter for cache lookup.
        $body = array(
            'ticket_ids' => array( 7892, 7893, 7894 ),
        );
        $this->assertFirstCallSuccess( 'flash-ready-to-ship', $body );
    }

    public function test_flash_ready_to_ship_replay_matches(): void {
        // Replay safety: admin clicks "พร้อมจัดส่ง" on bulk action → slow Flash courier API →
        // admin clicks again → without wrapper would (1) push customer Flex 2× per ticket
        // (LINE group spam) + (2) call b2b_flash_notify_courier_from_warehouse 2× (Flash quota
        // burn — every call charges) + (3) admin LINE notification 2× + (4) audit log 2×.
        $body = array(
            'ticket_ids' => array( 7892, 7893, 7894 ),
        );
        $this->assertReplayMatches( 'flash-ready-to-ship', $body );
    }

    public function test_flash_ready_to_ship_different_tickets_409(): void {
        // Stale tab → admin selects different ticket batch on retry → different physical
        // shipments → 409 prevents calling courier for wrong order set.
        $b1 = array(
            'ticket_ids' => array( 7892, 7893, 7894 ),
        );
        $b2 = array(
            'ticket_ids' => array( 7895, 7896, 7897 ),
        );
        $this->assertDifferentBody(
            'flash-ready-to-ship',
            $b1, $b2,
            'ticket_ids[] (different batch — 7892..7894 vs 7895..7897)'
        );
    }

    // ── BATCH 17: DAILY-SUMMARY (admin manual trigger) ──

    public function test_daily_summary_first_call_success(): void {
        // Body shape: {action: 'trigger-summary'} — constant marker pattern. No params at all.
        $body = array( 'action' => 'trigger-summary' );
        $this->assertFirstCallSuccess( 'daily-summary', $body );
    }

    public function test_daily_summary_replay_matches(): void {
        // Replay safety: admin clicks "ส่งสรุป" → slow b2b_run_daily_summary execution → admin
        // clicks again thinking it didn't fire → without wrapper = 2× admin Flex summary card
        // (admin group LINE spam — confusing duplicate stats) + 2× DB storm (cron-replica read
        // of all orders for past 24h × all distributors). Wrapper returns cached 200 → single
        // summary push.
        $body = array( 'action' => 'trigger-summary' );
        $this->assertReplayMatches( 'daily-summary', $body );
    }

    public function test_daily_summary_namespace_isolation_via_action_constant(): void {
        // Defensive: action constant should be stable string — verify hash != arbitrary action
        // names. Future migrations may add per-day or per-distributor params; today body
        // hash relies on the literal 'trigger-summary' marker.
        $b1 = array( 'action' => 'trigger-summary' );
        $b2 = array( 'action' => 'something-else' );
        $this->assertDifferentBody(
            'daily-summary',
            $b1, $b2,
            'action constant marker (trigger-summary vs other — defensive isolation)'
        );
    }

    // ── BATCH 17: FLASH-WEBHOOK-SETUP (admin one-time setup) ──

    public function test_flash_webhook_setup_first_call_success(): void {
        // Body shape: {webhook_url, codes:[0..4]} — webhook_url drives semantic; codes constant.
        $body = array(
            'webhook_url' => 'https://dinoco.in.th/wp-json/b2b/v1/flash-webhook',
            'codes'       => array( 0, 1, 2, 3, 4 ),
        );
        $this->assertFirstCallSuccess( 'flash-webhook-setup', $body );
    }

    public function test_flash_webhook_setup_replay_matches(): void {
        // Replay safety: admin clicks "ตั้งค่า Webhook" → slow Flash response → admin clicks
        // again → without wrapper = 2× POST /open/v3/notify/setting × 5 codes (10 calls instead
        // of 5). Flash returns OK on duplicate setup but wastes quota + admin sees confusing
        // dual completion banners.
        $body = array(
            'webhook_url' => 'https://dinoco.in.th/wp-json/b2b/v1/flash-webhook',
            'codes'       => array( 0, 1, 2, 3, 4 ),
        );
        $this->assertReplayMatches( 'flash-webhook-setup', $body );
    }

    public function test_flash_webhook_setup_different_url_409(): void {
        // CRITICAL: site URL changed between retries (e.g. dev → staging mistake) → very
        // different physical webhook target → 409 prevents accidentally registering wrong URL
        // with Flash (would cause Flash callbacks to vanish until next setup).
        $b1 = array(
            'webhook_url' => 'https://dinoco.in.th/wp-json/b2b/v1/flash-webhook',
            'codes'       => array( 0, 1, 2, 3, 4 ),
        );
        $b2 = array(
            'webhook_url' => 'https://staging.dinoco.in.th/wp-json/b2b/v1/flash-webhook',
            'codes'       => array( 0, 1, 2, 3, 4 ),
        );
        $this->assertDifferentBody(
            'flash-webhook-setup',
            $b1, $b2,
            'webhook_url (production vs staging — env mismatch alert)'
        );
    }

    // ── BATCH 17: FLASH-API-TEST (admin connectivity probe) ──

    public function test_flash_api_test_first_call_success(): void {
        // Body shape: {action, mch_id, is_production} — discriminates env (training vs prod).
        $body = array(
            'action'        => 'flash-api-test',
            'mch_id'        => 'TH50145',
            'is_production' => true,
        );
        $this->assertFirstCallSuccess( 'flash-api-test', $body );
    }

    public function test_flash_api_test_replay_matches(): void {
        // Replay safety: admin clicks "ทดสอบ Flash API" twice (network flap) → 2× GET
        // /open/v3/warehouses (read-only but counts toward Flash rate limit). Wrapper returns
        // cached diag info → single API call. Admin can retry after TTL if env changes.
        $body = array(
            'action'        => 'flash-api-test',
            'mch_id'        => 'TH50145',
            'is_production' => true,
        );
        $this->assertReplayMatches( 'flash-api-test', $body );
    }

    public function test_flash_api_test_different_env_409(): void {
        // CRITICAL: admin changed B2B_FLASH_API_URL constant between retries (training → prod)
        // → very different test target → 409 alerts admin not to confuse training results
        // with production health check.
        $b1 = array(
            'action'        => 'flash-api-test',
            'mch_id'        => 'TH50145',
            'is_production' => true,
        );
        $b2 = array(
            'action'        => 'flash-api-test',
            'mch_id'        => 'TH50145',
            'is_production' => false,  // training env now
        );
        $this->assertDifferentBody(
            'flash-api-test',
            $b1, $b2,
            'is_production (production vs training env switch)'
        );
    }

    // ── BATCH 17: TEST-PUSH (admin LINE push test) ──

    public function test_test_push_first_call_success(): void {
        // Body shape: {target, message}.
        $body = array(
            'target'  => 'admin',
            'message' => '🧪 Test Push — 30/04/2026 14:25:30',
        );
        $this->assertFirstCallSuccess( 'test-push', $body );
    }

    public function test_test_push_replay_matches(): void {
        // Replay safety: admin double-clicks "Test Push" within Idempotency-Key TTL → without
        // wrapper = 2× LINE push to admin group (notification spam, confusing "did the test
        // work twice?" UX). Note: in real usage admin probably wants UNIQUE key per click to
        // see distinct test runs — wrapper only kicks in if admin reuses same key.
        $body = array(
            'target'  => 'admin',
            'message' => '🧪 Test Push — 30/04/2026 14:25:30',
        );
        $this->assertReplayMatches( 'test-push', $body );
    }

    public function test_test_push_different_message_409(): void {
        // Admin retry with different message text → 409 (admin changed mind between clicks).
        $b1 = array(
            'target'  => 'admin',
            'message' => '🧪 Test Push v1',
        );
        $b2 = array(
            'target'  => 'admin',
            'message' => '🧪 Test Push v2 — เปลี่ยนข้อความใหม่',
        );
        $this->assertDifferentBody(
            'test-push',
            $b1, $b2,
            'message (admin changed test wording between retries)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_39_no_collision_via_fixture(): void {
        $body_map = array(
            'flash_ready_to_ship' => array(
                'ticket_ids' => array( 7892, 7893, 7894 ),
            ),
            'daily_summary' => array(
                'action' => 'trigger-summary',
            ),
            'flash_webhook_setup' => array(
                'webhook_url' => 'https://dinoco.in.th/wp-json/b2b/v1/flash-webhook',
                'codes'       => array( 0, 1, 2, 3, 4 ),
            ),
            'flash_api_test' => array(
                'action'        => 'flash-api-test',
                'mch_id'        => 'TH50145',
                'is_production' => true,
            ),
            'test_push' => array(
                'target'  => 'admin',
                'message' => '🧪 Test Push — 30/04/2026',
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 39', $body_map );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (1) ──
    // daily-summary {action: 'trigger-summary'} vs manual-flash-test {action: 'test'}
    // (Round 32) — both constant-marker pattern but the action string itself discriminates,
    // so even WITHOUT namespace gate the bodies hash differently. Verify intentional
    // separation across constant-marker endpoints.
    public function test_daily_summary_vs_manual_flash_test_no_collision(): void {
        $summary_body = array( 'action' => 'trigger-summary' );
        $test_body    = array( 'action' => 'test' );  // manual-flash-test marker (Round 32)
        $this->assertDifferentBody(
            'daily-summary vs manual-flash-test',
            $summary_body,
            $test_body,
            'action constant marker (trigger-summary vs test — distinct strings prevent collision even without namespace)'
        );
    }
}
