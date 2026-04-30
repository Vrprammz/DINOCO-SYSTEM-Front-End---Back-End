<?php
/**
 * IdempotencyRound34Test — DRY contract tests for Round 34 batch 12 (5 endpoints).
 *
 * Source: Round 34 (2026-04-30) — 30% milestone (59/196 = 30.1%).
 *
 *   Batch 12 NEW (5 endpoints — admin flag/notification/distributor retry-prone hot paths):
 *     - POST /b2b/v1/bo-clear-enum-flag       — admin clears false-positive enumeration flag.
 *                                               Storage idempotent but log/alert spam on retry.
 *     - POST /dinoco-mcp/v1/kb-suggest        — chatbot suggestion submission. Retry → frequency
 *                                               double-incremented (stale "asked Nx").
 *     - POST /dinoco-mcp/v1/brand-voice-submit — sentiment ML signal. Retry → 2x CPT row →
 *                                               training data poisoning.
 *     - POST /b2b/v1/distributor/delete       — admin distributor delete. wp_delete_post is no-op
 *                                               on 2nd call but log/alert spam.
 *     - POST /b2b/v1/distributor/toggle-bot   — toggle bot on/off. 5s transient dedup protects
 *                                               rapid double-click; replay > 5s = silent flip
 *                                               to opposite state without wrapper.
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per endpoint
 * (first_call_success / replay_matches / different_field_409) + cumulative no-collision +
 * cross-namespace pair guard (distributor-delete vs distributor-toggle-bot share `id`/`dist_id`
 * primary scope but different field names + bot_enabled discriminator).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound34Test extends IdempotencyTestFixture {

    // ── BATCH 12: BO-CLEAR-ENUM-FLAG (B2B admin flag reset) ──

    public function test_bo_clear_enum_flag_first_call_success(): void {
        $body = array(
            'distributor_id' => 4521,
        );
        $this->assertFirstCallSuccess( 'bo-clear-enum-flag', $body );
    }

    public function test_bo_clear_enum_flag_replay_matches(): void {
        $body = array(
            'distributor_id' => 4521,
        );
        $this->assertReplayMatches( 'bo-clear-enum-flag', $body );
    }

    public function test_bo_clear_enum_flag_different_distributor_409(): void {
        // Same key reused across distributors = different intent. Wrapper MUST 409 — silent
        // replay would clear flag on wrong distributor (data integrity violation).
        $b1 = array( 'distributor_id' => 4521 );
        $b2 = array( 'distributor_id' => 7892 );
        $this->assertDifferentBody( 'bo-clear-enum-flag', $b1, $b2, 'distributor_id (4521 vs 7892)' );
    }

    // ── BATCH 12: KB-SUGGEST (MCP chatbot signal) ──

    public function test_kb_suggest_first_call_success(): void {
        $body = array(
            'question'  => 'กันล้ม nx500 ทำจากอะไร',
            'source'    => 'fb_chat',
            'frequency' => 1,
        );
        $this->assertFirstCallSuccess( 'kb-suggest', $body );
    }

    public function test_kb_suggest_replay_matches(): void {
        // Handler normalizes via mb_strtolower + trim. Body hash uses same normalization.
        $body = array(
            'question'  => 'กันล้ม nx500 ทำจากอะไร',
            'source'    => 'fb_chat',
            'frequency' => 1,
        );
        $this->assertReplayMatches( 'kb-suggest', $body );
    }

    public function test_kb_suggest_different_source_409(): void {
        // Same question from FB vs IG = legitimately distinct platform signals (admin needs
        // to know which platform asks more). Wrapper MUST 409 if admin reuses key across sources.
        $b1 = array(
            'question'  => 'กันล้ม nx500 ทำจากอะไร',
            'source'    => 'fb_chat',
            'frequency' => 1,
        );
        $b2 = array(
            'question'  => 'กันล้ม nx500 ทำจากอะไร',
            'source'    => 'ig_chat',  // different platform — distinct signal
            'frequency' => 1,
        );
        $this->assertDifferentBody( 'kb-suggest', $b1, $b2, 'source (fb_chat vs ig_chat)' );
    }

    // ── BATCH 12: BRAND-VOICE-SUBMIT (MCP sentiment ML signal) ──

    public function test_brand_voice_submit_first_call_success(): void {
        $body = array(
            'content'    => 'ชอบ DINOCO มาก ใส่กับ NX500 ลงตัว',
            'sentiment'  => 'positive',
            'platform'   => 'facebook_page',
            'source_url' => 'https://facebook.com/dinoco/posts/12345',
            'intensity'  => 4,
        );
        $this->assertFirstCallSuccess( 'brand-voice-submit', $body );
    }

    public function test_brand_voice_submit_replay_matches(): void {
        $body = array(
            'content'    => 'ชอบ DINOCO มาก ใส่กับ NX500 ลงตัว',
            'sentiment'  => 'positive',
            'platform'   => 'facebook_page',
            'source_url' => 'https://facebook.com/dinoco/posts/12345',
            'intensity'  => 4,
        );
        $this->assertReplayMatches( 'brand-voice-submit', $body );
    }

    public function test_brand_voice_submit_different_sentiment_409(): void {
        // CRITICAL: sentiment edits between retries (positive → negative) = admin/AI re-classified
        // signal. Wrapper MUST 409 — silent replay would store wrong sentiment for ML training.
        $b1 = array(
            'content'    => 'ชอบ DINOCO มาก',
            'sentiment'  => 'positive',
            'platform'   => 'facebook_page',
            'source_url' => 'https://facebook.com/dinoco/posts/12345',
            'intensity'  => 4,
        );
        $b2 = array(
            'content'    => 'ชอบ DINOCO มาก',
            'sentiment'  => 'negative',  // re-classified — different ML training signal
            'platform'   => 'facebook_page',
            'source_url' => 'https://facebook.com/dinoco/posts/12345',
            'intensity'  => 4,
        );
        $this->assertDifferentBody( 'brand-voice-submit', $b1, $b2, 'sentiment (positive vs negative)' );
    }

    // ── BATCH 12: DISTRIBUTOR-DELETE (B2B admin destructive) ──

    public function test_distributor_delete_first_call_success(): void {
        $body = array(
            'id' => 4521,
        );
        $this->assertFirstCallSuccess( 'distributor-delete', $body );
    }

    public function test_distributor_delete_replay_matches(): void {
        $body = array(
            'id' => 4521,
        );
        $this->assertReplayMatches( 'distributor-delete', $body );
    }

    public function test_distributor_delete_different_id_409(): void {
        // CRITICAL: different id with same key = different intent. Wrapper MUST 409 —
        // silent replay would NOT delete the new id (cached response says "already deleted"
        // referring to original id — admin loses ability to delete actual target).
        $b1 = array( 'id' => 4521 );
        $b2 = array( 'id' => 7892 );
        $this->assertDifferentBody( 'distributor-delete', $b1, $b2, 'id (4521 vs 7892)' );
    }

    // ── BATCH 12: DISTRIBUTOR-TOGGLE-BOT (B2B admin state flip) ──

    public function test_distributor_toggle_bot_first_call_success(): void {
        $body = array(
            'dist_id'     => 4521,
            'bot_enabled' => 1,
        );
        $this->assertFirstCallSuccess( 'distributor-toggle-bot', $body );
    }

    public function test_distributor_toggle_bot_replay_matches(): void {
        $body = array(
            'dist_id'     => 4521,
            'bot_enabled' => 1,
        );
        $this->assertReplayMatches( 'distributor-toggle-bot', $body );
    }

    public function test_distributor_toggle_bot_different_state_409(): void {
        // CRITICAL: bot_enabled state flip between retries = admin changed mind. Wrapper MUST
        // 409 — silent replay would flip to wrong state. Same key + different bot_enabled =
        // different intent. (Existing 5s transient dedup is secondary defense for rapid clicks
        // but does NOT protect across longer windows.)
        $b1 = array(
            'dist_id'     => 4521,
            'bot_enabled' => 1,  // ON
        );
        $b2 = array(
            'dist_id'     => 4521,
            'bot_enabled' => 0,  // OFF — admin changed mind
        );
        $this->assertDifferentBody( 'distributor-toggle-bot', $b1, $b2, 'bot_enabled (1 → 0)' );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_34_no_collision_via_fixture(): void {
        $body_map = array(
            'bo_clear_enum_flag' => array(
                'distributor_id' => 1,
            ),
            'kb_suggest' => array(
                'question'  => 'q',
                'source'    => 'fb_chat',
                'frequency' => 1,
            ),
            'brand_voice_submit' => array(
                'content'    => 'c',
                'sentiment'  => 'positive',
                'platform'   => 'facebook_page',
                'source_url' => 'https://fb.com/1',
                'intensity'  => 3,
            ),
            'distributor_delete' => array(
                'id' => 1,
            ),
            'distributor_toggle_bot' => array(
                'dist_id'     => 1,
                'bot_enabled' => 1,
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 34', $body_map );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (1) ──
    // distributor-delete + distributor-toggle-bot both target a distributor admin action with
    // different field names (`id` vs `dist_id`). Defense-in-depth: even if a buggy client sent
    // identical {id: 4521} body to both endpoints with same key, the namespace prefix
    // differentiates them in storage. Body hash differentiation here ensures even within same
    // namespace, intent is distinct.

    public function test_distributor_delete_vs_toggle_bot_no_collision(): void {
        $delete_body = array(
            'id' => 4521,
        );
        $toggle_body = array(
            'dist_id'     => 4521,
            'bot_enabled' => 1,
        );
        $this->assertDifferentBody(
            'distributor-delete vs distributor-toggle-bot',
            $delete_body,
            $toggle_body,
            'schema shape (id only vs dist_id+bot_enabled)'
        );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (2) ──
    // kb-suggest + brand-voice-submit are both MCP chatbot signal endpoints. Verify their hashes
    // differ even with same idempotency key (defense-in-depth — both come from OpenClaw agent
    // process so theoretical key collision possible).

    public function test_kb_suggest_vs_brand_voice_submit_no_collision(): void {
        $kb_body = array(
            'question'  => 'กันล้ม nx500',
            'source'    => 'fb_chat',
            'frequency' => 1,
        );
        $bv_body = array(
            'content'    => 'กันล้ม nx500',  // same string, different field name
            'sentiment'  => 'positive',
            'platform'   => 'facebook_page',
            'source_url' => 'https://fb.com/1',
            'intensity'  => 3,
        );
        $this->assertDifferentBody(
            'kb-suggest vs brand-voice-submit',
            $kb_body,
            $bv_body,
            'schema shape (question/source/frequency vs content/sentiment/platform/source_url/intensity)'
        );
    }
}
