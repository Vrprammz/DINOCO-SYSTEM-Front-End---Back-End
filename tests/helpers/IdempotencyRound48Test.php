<?php
/**
 * IdempotencyRound48Test — DRY contract tests for Round 48 batch 26 (5 endpoints).
 *
 * Source: Round 48 (2026-04-30) — push toward 70% milestone after 🎯🎯 60% MAJOR
 * MILESTONE achieved at Round 46. 129/196 = 65.8% against Round 30 authoritative
 * census denominator. **30-round sustained Idempotency-Key campaign Rounds 18-48.**
 *
 *   Batch 26 NEW (5 endpoints — cross-snippet 3-file: B2F + Brand Voice + Onboard):
 *     - POST /b2f/v1/auth-admin                          — LIFF Admin auth init —
 *                                                          slow LINE verify (id_token
 *                                                          POST to api.line.me/oauth2/
 *                                                          v2.1/verify ~500ms-1s) →
 *                                                          admin LIFF retries on flaky
 *                                                          → 2× session_token issuance
 *                                                          + 2× rate-limit consumption
 *                                                          + 2× audit log spam.
 *                                                          Body hash = single
 *                                                          {line_user_id} ONLY (NOT
 *                                                          _ts/_sig/id_token — those
 *                                                          rotate per request).
 *                                                          Cross-namespace pair with
 *                                                          R42 /b2b/v1/auth-group.
 *     - POST /brand-voice/v1/entries                     — Chrome extension single
 *                                                          entry create — slow
 *                                                          wp_insert_post + 5-10×
 *                                                          update_post_meta + cache
 *                                                          flush → ext retries on
 *                                                          flaky → 2× CPT row + 2×
 *                                                          sentiment counter +
 *                                                          duplicate analytics signal
 *                                                          corruption. Body hash =
 *                                                          single {source_url,
 *                                                          content_hash: md5(author
 *                                                          |content[:100]|brands_csv),
 *                                                          platform} — mirrors
 *                                                          handler dedup_key logic.
 *     - POST /brand-voice/v1/entries/batch               — Chrome extension bulk
 *                                                          import (max 50) — sysadmin
 *                                                          double-click → 2× full loop
 *                                                          = up to 100 wp_insert_post
 *                                                          + 250-500 update_post_meta
 *                                                          + 50× cache invalidation →
 *                                                          analytics signal storm.
 *                                                          Body hash = bulk-shape
 *                                                          {entries[]: rows sorted by
 *                                                          content_hash} — order-stable
 *                                                          deterministic dataset.
 *     - POST /dinoco/v1/onboard/check-group-id           — admin "ตรวจสอบ" double-
 *                                                          click on slow get_posts
 *                                                          meta_query → 2× DB scan
 *                                                          ~5K distributor rows × 2
 *                                                          = 10K row scans + UI
 *                                                          flicker. Body hash = single
 *                                                          {group_id, exclude_id} —
 *                                                          read-only but reduces DB
 *                                                          load on retry; admin
 *                                                          pasted wrong then corrected
 *                                                          → 409.
 *     - POST /dinoco/v1/onboard/save                     — CRITICAL retry-prone:
 *                                                          admin "Save" double-click
 *                                                          on slow wp_insert_post +
 *                                                          10× ACF update_field →
 *                                                          race window allows 2×
 *                                                          distributor CPT creation
 *                                                          with same line_group_id
 *                                                          (uniqueness check passes
 *                                                          for 1st request,
 *                                                          microsecond gap before
 *                                                          commit, 2nd request sees
 *                                                          no dup yet, both succeed).
 *                                                          Body hash = single
 *                                                          {shop_name, line_group_id,
 *                                                          rank_system, credit_limit,
 *                                                          credit_term_days} core —
 *                                                          admin renamed shop /
 *                                                          changed credit mid-retry
 *                                                          → 409 catches business
 *                                                          decision change.
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3-4 cases per
 * endpoint (first_call_success / replay_matches / different_field_409) +
 * cumulative no-collision. Total: 16 tests.
 *
 * After Round 48 the breakdown:
 *   - B2F namespace: 22 endpoints (+1 since Round 47 = 21 → 22 — auth-admin)
 *   - B2B namespace: 60 endpoints (unchanged)
 *   - Inventory namespace: 23 endpoints (unchanged)
 *   - MCP namespace: 13 endpoints (unchanged)
 *   - LIFF AI namespace: 5 endpoints (unchanged)
 *   - Brand Voice namespace: 4 endpoints (+2 since Round 47 = 2 → 4 — entries +
 *     entries/batch)
 *   - Onboarding namespace: 2 endpoints (NEW — check-group-id + save; +2 net)
 *
 * 129/196 = 65.8% — push past 🎯🎯 60% MAJOR MILESTONE toward 70% target. 30-round
 * sustained campaign. Pattern maturity at Round 48: **7 patterns** (single / bulk /
 * bulk-of-targets / state-machine / boolean+enum-discriminator / constant-marker /
 * binary-fingerprint). Pattern mix: 4× single (auth-admin + entries + check-group-id
 * + save) + 1× bulk-shape (entries/batch with content_hash sort).
 *
 * Round 49 candidate batch 27 (5 endpoints → 134/196 = 68.4%):
 *   - POST /dinoco/v1/onboard/test-bot (already rate-limited, may skip)
 *   - POST /dinoco/v1/health/run-check (admin manual health probe)
 *   - POST /dinoco/v1/smoke-test (admin smoke trigger)
 *   - POST /dinoco/v1/audit/retention/run (audit retention cron manual trigger)
 *   - POST /dinoco-slip/v1/clear-locks + /manual-process + /replay-slip
 *   - Strategic note: After 30 rounds of sustained instrumentation, recommend
 *     slow-down + 1-2 weeks production canary observation matching Round 42 50%
 *     pause pattern. Future endpoints span admin-trigger / health / slip / audit
 *     namespaces — natural pivot from B2B/B2F/Inventory hot-path saturation.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound48Test extends IdempotencyTestFixture {

    // ── BATCH 26: B2F AUTH-ADMIN (single — LIFF admin auth init) ──

    public function test_auth_admin_first_call_success(): void {
        // Body shape: {line_user_id} ONLY (NOT _ts/_sig/id_token — rotate per request).
        $body = array( 'line_user_id' => 'U1234567890abcdef' );
        $this->assertFirstCallSuccess( 'auth-admin', $body );
    }

    public function test_auth_admin_replay_matches(): void {
        // Replay safety: admin LIFF retry on flaky network → 2× session_token + 2×
        // rate-limit + 2× audit log. Same uid retry = cached 200 instant + skip LINE
        // verify (saves 500ms-1s network call to api.line.me/oauth2/v2.1/verify).
        $body = array( 'line_user_id' => 'U1234567890abcdef' );
        $this->assertReplayMatches( 'auth-admin', $body );
    }

    public function test_auth_admin_different_uid_409(): void {
        // CROSS-ADMIN guard: same key + DIFFERENT line_user_id → 409. Idem-key
        // collision across admin sessions surfaces fleet key-reuse error (rare but
        // possible if client incorrectly persists key across admin logout/login).
        $b1 = array( 'line_user_id' => 'U1234567890abcdef' );  // admin A
        $b2 = array( 'line_user_id' => 'Ufedcba0987654321' );  // admin B
        $this->assertDifferentBody(
            'auth-admin',
            $b1, $b2,
            'line_user_id (different admin uid — fleet key reuse error surfaced)'
        );
    }

    // ── BATCH 26: BRAND-VOICE/ENTRIES (single — extension entry create) ──

    public function test_brand_voice_entries_first_call_success(): void {
        // Body shape: {source_url, content_hash, platform}.
        // content_hash mirrors handler dedup_key logic: md5(author|content[:100]|brands_csv).
        $body = array(
            'source_url'   => 'https://www.facebook.com/groups/123/posts/456',
            'content_hash' => md5( 'นาย ก|DINOCO ดีมากครับ ใช้แล้วชอบ|DINOCO' ),
            'platform'     => 'facebook',
        );
        $this->assertFirstCallSuccess( 'brand-voice-entries', $body );
    }

    public function test_brand_voice_entries_replay_matches(): void {
        // Replay safety: extension retry on flaky → same {url, content, brands} =
        // cached 200 instant. Existing 24h transient dedup PASSES through but ALSO
        // protects against 2× DB writes when extension generates fresh idem-key.
        $body = array(
            'source_url'   => 'https://www.facebook.com/groups/123/posts/456',
            'content_hash' => md5( 'นาย ก|DINOCO ดีมากครับ ใช้แล้วชอบ|DINOCO' ),
            'platform'     => 'facebook',
        );
        $this->assertReplayMatches( 'brand-voice-entries', $body );
    }

    public function test_brand_voice_entries_different_content_409(): void {
        // CRITICAL: admin/extension edited content mid-retry → 409 catches sentiment
        // edit accident (different text = different analytical signal — must not
        // alias to first cached entry).
        $b1 = array(
            'source_url'   => 'https://www.facebook.com/groups/123/posts/456',
            'content_hash' => md5( 'นาย ก|DINOCO ดีมากครับ ใช้แล้วชอบ|DINOCO' ),
            'platform'     => 'facebook',
        );
        $b2 = array(
            'source_url'   => 'https://www.facebook.com/groups/123/posts/456',
            'content_hash' => md5( 'นาย ก|DINOCO แย่มาก ของเสียบ่อย|DINOCO' ),  // SENTIMENT FLIP
            'platform'     => 'facebook',
        );
        $this->assertDifferentBody(
            'brand-voice-entries',
            $b1, $b2,
            'content_hash (sentiment flip positive→negative — admin/extension edited mid-retry)'
        );
    }

    // ── BATCH 26: BRAND-VOICE/ENTRIES/BATCH (bulk-shape — sorted by content_hash) ──

    public function test_brand_voice_entries_batch_first_call_success(): void {
        // Body shape: {count, rows[]: sorted by 'h' (content_hash) ASC}.
        $rows = array(
            array(
                'h'   => md5( 'A|content alpha|DINOCO' ),
                'url' => 'https://example.com/1',
                'plt' => 'facebook',
            ),
            array(
                'h'   => md5( 'B|content beta|SRC' ),
                'url' => 'https://example.com/2',
                'plt' => 'instagram',
            ),
        );
        usort( $rows, function( $a, $b ) { return strcmp( $a['h'], $b['h'] ); } );
        $body = array( 'count' => 2, 'rows' => $rows );
        $this->assertFirstCallSuccess( 'brand-voice-entries-batch', $body );
    }

    public function test_brand_voice_entries_batch_replay_matches(): void {
        // Replay safety: sysadmin double-click bulk import on slow → up to 100×
        // wp_insert_post + 250-500 update_post_meta + 50× cache invalidation. Same
        // dataset retry = cached 200 instant.
        $rows = array(
            array(
                'h'   => md5( 'A|content alpha|DINOCO' ),
                'url' => 'https://example.com/1',
                'plt' => 'facebook',
            ),
        );
        usort( $rows, function( $a, $b ) { return strcmp( $a['h'], $b['h'] ); } );
        $body = array( 'count' => 1, 'rows' => $rows );
        $this->assertReplayMatches( 'brand-voice-entries-batch', $body );
    }

    public function test_brand_voice_entries_batch_different_rows_409(): void {
        // CRITICAL: admin re-uploaded partial batch mid-retry → 409 catches dataset
        // change. Different rows = different analytical signal aggregate.
        $rows1 = array(
            array(
                'h'   => md5( 'A|content alpha|DINOCO' ),
                'url' => 'https://example.com/1',
                'plt' => 'facebook',
            ),
            array(
                'h'   => md5( 'B|content beta|SRC' ),
                'url' => 'https://example.com/2',
                'plt' => 'instagram',
            ),
        );
        $rows2 = array(
            array(
                'h'   => md5( 'A|content alpha|DINOCO' ),
                'url' => 'https://example.com/1',
                'plt' => 'facebook',
            ),
            // DIFFERENT 2nd row — admin removed B + added C
            array(
                'h'   => md5( 'C|content gamma|MOTOSkill' ),
                'url' => 'https://example.com/3',
                'plt' => 'tiktok',
            ),
        );
        usort( $rows1, function( $a, $b ) { return strcmp( $a['h'], $b['h'] ); } );
        usort( $rows2, function( $a, $b ) { return strcmp( $a['h'], $b['h'] ); } );
        $b1 = array( 'count' => 2, 'rows' => $rows1 );
        $b2 = array( 'count' => 2, 'rows' => $rows2 );
        $this->assertDifferentBody(
            'brand-voice-entries-batch',
            $b1, $b2,
            'rows[] (admin re-uploaded partial batch with B replaced by C mid-retry)'
        );
    }

    public function test_brand_voice_entries_batch_sort_stability(): void {
        // SORT STABILITY: same dataset uploaded in different row order = same hash
        // (bulk-shape pattern — order-stable via usort by content_hash 'h' ASC).
        $rows_order_a = array(
            array(
                'h'   => md5( 'A|content alpha|DINOCO' ),
                'url' => 'https://example.com/1',
                'plt' => 'facebook',
            ),
            array(
                'h'   => md5( 'B|content beta|SRC' ),
                'url' => 'https://example.com/2',
                'plt' => 'instagram',
            ),
        );
        $rows_order_b = array(
            // REVERSED order
            array(
                'h'   => md5( 'B|content beta|SRC' ),
                'url' => 'https://example.com/2',
                'plt' => 'instagram',
            ),
            array(
                'h'   => md5( 'A|content alpha|DINOCO' ),
                'url' => 'https://example.com/1',
                'plt' => 'facebook',
            ),
        );
        usort( $rows_order_a, function( $a, $b ) { return strcmp( $a['h'], $b['h'] ); } );
        usort( $rows_order_b, function( $a, $b ) { return strcmp( $a['h'], $b['h'] ); } );
        $b1 = array( 'count' => 2, 'rows' => $rows_order_a );
        $b2 = array( 'count' => 2, 'rows' => $rows_order_b );
        // Both should hash IDENTICALLY after usort normalization.
        $h1 = dinoco_idempotency_hash( $b1 );
        $h2 = dinoco_idempotency_hash( $b2 );
        $this->assertSame(
            $h1, $h2,
            '[brand-voice-entries-batch] Sorted bulk-shape MUST hash identically regardless of input row order'
        );
    }

    // ── BATCH 26: ONBOARD/CHECK-GROUP-ID (single — admin uniqueness check) ──

    public function test_onboard_check_group_id_first_call_success(): void {
        // Body shape: {group_id, exclude_id}. exclude_id=0 means new (no exclusion).
        $body = array(
            'group_id'   => 'C1234567890abcdef1234567890abcdef',
            'exclude_id' => 0,
        );
        $this->assertFirstCallSuccess( 'onboard-check-group-id', $body );
    }

    public function test_onboard_check_group_id_replay_matches(): void {
        // Replay safety: admin "ตรวจสอบ" double-click on slow get_posts meta_query
        // → 2× DB scan ~5K rows. Same group_id retry = cached 200 instant + skip
        // ~10ms DB lookup × N retries.
        $body = array(
            'group_id'   => 'C1234567890abcdef1234567890abcdef',
            'exclude_id' => 0,
        );
        $this->assertReplayMatches( 'onboard-check-group-id', $body );
    }

    public function test_onboard_check_group_id_different_group_409(): void {
        // CRITICAL: admin pasted wrong group_id then corrected mid-retry → 409
        // catches paste error. Same idem-key with different group_id reveals
        // accidental UI form drift.
        $b1 = array(
            'group_id'   => 'C1234567890abcdef1234567890abcdef',
            'exclude_id' => 0,
        );
        $b2 = array(
            'group_id'   => 'CfedcbaABCDEF1234567890abcdef1234',  // DIFFERENT group
            'exclude_id' => 0,
        );
        $this->assertDifferentBody(
            'onboard-check-group-id',
            $b1, $b2,
            'group_id (admin pasted wrong then corrected mid-retry)'
        );
    }

    // ── BATCH 26: ONBOARD/SAVE (single — CRITICAL distributor creation race) ──

    public function test_onboard_save_first_call_success(): void {
        // Body shape: {shop_name, line_group_id, rank_system, credit_limit,
        // credit_term_days} core. Other fields (phone/address/walkin/bot_enabled)
        // intentionally EXCLUDED — admin may correct minor metadata mid-retry without
        // triggering 409 (only core identity + commercial terms are hash-discriminators).
        $body = array(
            'shop_name'        => 'ร้านอ๊อฟมอเตอร์ พระโขนง',
            'line_group_id'    => 'C1234567890abcdef1234567890abcdef',
            'rank_system'      => 'silver',
            'credit_limit'     => 50000.0,
            'credit_term_days' => 30,
        );
        $this->assertFirstCallSuccess( 'onboard-save', $body );
    }

    public function test_onboard_save_replay_matches(): void {
        // Replay safety: admin "Save" double-click on slow wp_insert_post + 10× ACF
        // → race window allows 2× distributor CPT creation with same line_group_id
        // (uniqueness check passes for 1st, microsecond gap before commit, 2nd sees
        // no dup yet, both succeed). Same body retry = cached 200 returns first
        // dist_id (admin's intent).
        $body = array(
            'shop_name'        => 'ร้านอ๊อฟมอเตอร์ พระโขนง',
            'line_group_id'    => 'C1234567890abcdef1234567890abcdef',
            'rank_system'      => 'silver',
            'credit_limit'     => 50000.0,
            'credit_term_days' => 30,
        );
        $this->assertReplayMatches( 'onboard-save', $body );
    }

    public function test_onboard_save_different_credit_409(): void {
        // CRITICAL: admin changed credit_limit mid-retry → 409 catches commercial
        // terms change (high-impact business decision must NOT alias to cached first
        // attempt — admin may have realized 50K too low, raised to 100K, retried).
        $b1 = array(
            'shop_name'        => 'ร้านอ๊อฟมอเตอร์ พระโขนง',
            'line_group_id'    => 'C1234567890abcdef1234567890abcdef',
            'rank_system'      => 'silver',
            'credit_limit'     => 50000.0,
            'credit_term_days' => 30,
        );
        $b2 = array(
            'shop_name'        => 'ร้านอ๊อฟมอเตอร์ พระโขนง',
            'line_group_id'    => 'C1234567890abcdef1234567890abcdef',
            'rank_system'      => 'silver',
            'credit_limit'     => 100000.0,  // RAISED
            'credit_term_days' => 30,
        );
        $this->assertDifferentBody(
            'onboard-save',
            $b1, $b2,
            'credit_limit (admin raised 50K→100K mid-retry — commercial terms change)'
        );
    }

    public function test_onboard_save_different_shop_name_409(): void {
        // CRITICAL: admin renamed shop mid-retry → 409 catches identity correction
        // (e.g. typo fix: "ร้านอ๊อฟ" → "ร้านออฟ"). Branding accuracy is high-impact —
        // wrong shop name on Flex cards / receipts.
        $b1 = array(
            'shop_name'        => 'ร้านอ๊อฟมอเตอร์ พระโขนง',
            'line_group_id'    => 'C1234567890abcdef1234567890abcdef',
            'rank_system'      => 'silver',
            'credit_limit'     => 50000.0,
            'credit_term_days' => 30,
        );
        $b2 = array(
            'shop_name'        => 'ร้านออฟมอเตอร์ พระโขนง',  // FIXED typo อ๊อฟ → ออฟ
            'line_group_id'    => 'C1234567890abcdef1234567890abcdef',
            'rank_system'      => 'silver',
            'credit_limit'     => 50000.0,
            'credit_term_days' => 30,
        );
        $this->assertDifferentBody(
            'onboard-save',
            $b1, $b2,
            'shop_name (admin fixed typo อ๊อฟ→ออฟ mid-retry — identity correction)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_48_no_collision_via_fixture(): void {
        $rows_bv_batch = array(
            array(
                'h'   => md5( 'A|content alpha|DINOCO' ),
                'url' => 'https://example.com/1',
                'plt' => 'facebook',
            ),
        );
        $body_map = array(
            'auth_admin'                 => array(
                'line_user_id' => 'U1234567890abcdef',
            ),
            'brand_voice_entries'        => array(
                'source_url'   => 'https://www.facebook.com/groups/123/posts/456',
                'content_hash' => md5( 'นาย ก|DINOCO ดีมากครับ|DINOCO' ),
                'platform'     => 'facebook',
            ),
            'brand_voice_entries_batch'  => array(
                'count' => 1,
                'rows'  => $rows_bv_batch,
            ),
            'onboard_check_group_id'     => array(
                'group_id'   => 'C1234567890abcdef1234567890abcdef',
                'exclude_id' => 0,
            ),
            'onboard_save'               => array(
                'shop_name'        => 'ร้านอ๊อฟมอเตอร์ พระโขนง',
                'line_group_id'    => 'C1234567890abcdef1234567890abcdef',
                'rank_system'      => 'silver',
                'credit_limit'     => 50000.0,
                'credit_term_days' => 30,
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 48 — push toward 70% milestone (129/196 = 65.8%)', $body_map );
    }
}
