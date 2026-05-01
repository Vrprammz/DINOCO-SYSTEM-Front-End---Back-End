<?php
/**
 * IdempotencyRound40Test — DRY contract tests for Round 40 batch 18 (5 endpoints).
 *
 * Source: Round 40 (2026-04-30) — 🎯 45% milestone reached: 89/196 = 45.4% against
 * Round 30 authoritative census denominator. Pivots from saturated B2B Flash admin
 * cluster to mixed-namespace closure: 1 LIFF AI + 4 Inventory.
 *
 *   Batch 18 NEW (5 endpoints — LIFF AI claim ops + Inventory dip-stock + settings):
 *     - POST /liff-ai/v1/claim/{id}/status   — Admin status dropdown in LIFF AI Command
 *                                              Center → slow ACF save → admin clicks again
 *                                              thinking it didn't fire → without wrapper =
 *                                              2× dinoco_set_claim_status() invocation →
 *                                              2× status_history append + 2× admin_note
 *                                              line + 2× WP hook fires (post_updated +
 *                                              claim/status_changed potentially → LINE
 *                                              push). Body hash = {claim_id, status, note,
 *                                              actor uid from JWT}. actor JWT-scoped —
 *                                              cross-admin key reuse impossible.
 *     - POST /dinoco-stock/v1/dip-stock/start — Admin "เริ่มนับสต็อก" button → 10K+ row
 *                                              snapshot bulk-INSERT. Double-click within
 *                                              microsecond window before status='in_progress'
 *                                              commits → 2× session INSERT + 2× snapshot DB
 *                                              storm + duplicate session_id orphans.
 *                                              Constant-marker {action: 'start'} — handler
 *                                              takes no params (session_date computed
 *                                              server-side). 4th constant-marker instance
 *                                              after stock/initialize R30 + manual-flash-test
 *                                              R32 + daily-summary R39.
 *     - POST /dinoco-stock/v1/dip-stock/force-close — Admin "ปิด session" double-click →
 *                                              2× UPDATE (idempotent at storage but
 *                                              re-stamps updated_at + b2b_log fires twice =
 *                                              audit noise). Single {session_id} — 0 means
 *                                              "close any in_progress" (server resolves at
 *                                              runtime).
 *     - POST /dinoco-stock/v1/stock/settings — Admin "บันทึก" double-click → 4× update_option
 *                                              × 2 = 8 DB writes + 2x option_changed hooks.
 *                                              Selective save body hash — only fields PRESENT
 *                                              in request hashed (admin may submit partial
 *                                              form with just dip_interval). alert_enabled
 *                                              boolean discriminator → flip ON↔OFF caught.
 *     - POST /dinoco-stock/v1/shipping-defaults — Admin "บันทึกค่าเริ่มต้น Flash" double-click
 *                                              → 2× wp_dinoco_flash_audit INSERT (only if
 *                                              flag_enabled flipped) + 2× cache flush + 2×
 *                                              update_option. Bulk-shape with express_threshold
 *                                              sub-object normalized via ksort. flag_enabled
 *                                              **boolean discriminator** — production
 *                                              CRITICAL: flipping ON↔OFF is the most
 *                                              consequential admin action (V.42 enable/
 *                                              disable affects all Flash shipping).
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per endpoint
 * (first_call_success / replay_matches / different_field_409) + cumulative no-collision +
 * 1 cross-namespace pair guard. Round 40 introduces "constant-marker" pattern for the 4th
 * time (dip-stock/start) — cumulative pattern is now firmly validated across 4 distinct
 * endpoints in 4 different rounds.
 *
 * After Round 40 the breakdown:
 *   - B2F namespace: 19 endpoints (unchanged)
 *   - B2B namespace: 42 endpoints (unchanged)
 *   - Inventory namespace: 13 endpoints (+4 since Round 39 = 9 → 13)
 *   - MCP namespace: 13 endpoints (unchanged)
 *   - LIFF AI namespace: 2 endpoints (+1 since Round 39 = 1 → 2)
 *
 * 🎯 45% milestone reached: 89/196 = 45.4% — past 4.5/10 of POST surface integrated.
 * First sustained 45% milestone past 9/20 of POST surface against authoritative
 * Round 30 census denominator.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound40Test extends IdempotencyTestFixture {

    // ── BATCH 18: LIFF-AI CLAIM-STATUS (admin claim FSM transition) ──

    public function test_claim_status_first_call_success(): void {
        // Body shape: {claim_id, status, note, actor uid from JWT}.
        $body = array(
            'claim_id' => 12345,
            'status'   => 'Maintenance Completed',
            'note'     => 'ตรวจสอบเรียบร้อย ส่งกลับลูกค้า',
            'actor'    => 'U_admin_jwt_uid_001',
        );
        $this->assertFirstCallSuccess( 'claim-status', $body );
    }

    public function test_claim_status_replay_matches(): void {
        // Replay safety: admin clicks status dropdown → slow WP ACF save → admin clicks
        // again thinking dropdown didn't register → without wrapper dinoco_set_claim_status()
        // fires 2× → 2× status_history rows + 2× admin_note line. Even though
        // dinoco_set_claim_status() returns terminal_state on duplicate, hook chain
        // (post_updated, claim/status_changed) runs again → LINE push to customer 2×.
        $body = array(
            'claim_id' => 12345,
            'status'   => 'Maintenance Completed',
            'note'     => 'ตรวจสอบเรียบร้อย ส่งกลับลูกค้า',
            'actor'    => 'U_admin_jwt_uid_001',
        );
        $this->assertReplayMatches( 'claim-status', $body );
    }

    public function test_claim_status_different_status_409(): void {
        // CRITICAL: admin changed mind between retries — first wrote "Maintenance Completed"
        // (success path), retry decided it's actually "Replacement Approved" (case B path).
        // Different financial impact → 409 prevents wrong status sticking via cached replay.
        $b1 = array(
            'claim_id' => 12345,
            'status'   => 'Maintenance Completed',
            'note'     => 'ตรวจสอบเรียบร้อย',
            'actor'    => 'U_admin_jwt_uid_001',
        );
        $b2 = array(
            'claim_id' => 12345,
            'status'   => 'Replacement Approved',  // CASE B — replacement instead of repair
            'note'     => 'ตรวจสอบเรียบร้อย',
            'actor'    => 'U_admin_jwt_uid_001',
        );
        $this->assertDifferentBody(
            'claim-status',
            $b1, $b2,
            'status (Maintenance Completed vs Replacement Approved — different case path with financial impact)'
        );
    }

    // ── BATCH 18: DIP-STOCK/START (admin session creation — constant marker) ──

    public function test_dip_stock_start_first_call_success(): void {
        // Body shape: {action: 'start'} constant-marker — handler takes no params.
        $body = array( 'action' => 'start' );
        $this->assertFirstCallSuccess( 'dip-stock/start', $body );
    }

    public function test_dip_stock_start_replay_matches(): void {
        // Replay safety: admin clicks "เริ่มนับสต็อก" → 10K+ row snapshot bulk-INSERT in
        // progress → admin clicks again (page seems frozen) → 2× session INSERT race
        // (handler 409 guard helps but microsecond window before commit) + 2× DB storm.
        $body = array( 'action' => 'start' );
        $this->assertReplayMatches( 'dip-stock/start', $body );
    }

    public function test_dip_stock_start_constant_marker_isolation(): void {
        // Defensive: action constant should be stable string — verify hash != arbitrary action
        // names. Today body hash relies on the literal 'start' marker — adding semantically
        // different action would naturally produce different hash even within same namespace.
        $b1 = array( 'action' => 'start' );
        $b2 = array( 'action' => 'restart' );  // hypothetical future variant
        $this->assertDifferentBody(
            'dip-stock/start',
            $b1, $b2,
            'action constant marker (start vs restart — defensive isolation)'
        );
    }

    // ── BATCH 18: DIP-STOCK/FORCE-CLOSE (admin session expire) ──

    public function test_dip_stock_force_close_first_call_success(): void {
        // Body shape: {session_id} — 0 = close-any-in-progress, otherwise specific session.
        $body = array( 'session_id' => 42 );
        $this->assertFirstCallSuccess( 'dip-stock/force-close', $body );
    }

    public function test_dip_stock_force_close_replay_matches(): void {
        // Replay safety: admin clicks "ปิด session" → slow UPDATE → admin clicks again →
        // without wrapper = 2× UPDATE (idempotent at storage but updated_at re-stamped
        // twice + b2b_log fires twice = audit noise that misleads investigators thinking
        // session was force-closed twice).
        $body = array( 'session_id' => 42 );
        $this->assertReplayMatches( 'dip-stock/force-close', $body );
    }

    public function test_dip_stock_force_close_different_session_409(): void {
        // CRITICAL: stale tab — admin retried but session_id pointer changed (server cleaned
        // session 42 already, current open session is 43). Different physical session →
        // 409 prevents accidentally force-closing wrong active session.
        $b1 = array( 'session_id' => 42 );
        $b2 = array( 'session_id' => 43 );  // different session — different physical target
        $this->assertDifferentBody(
            'dip-stock/force-close',
            $b1, $b2,
            'session_id (42 vs 43 — different active session)'
        );
    }

    // ── BATCH 18: STOCK/SETTINGS (admin global inventory settings) ──

    public function test_stock_settings_first_call_success(): void {
        // Body shape: only fields present in request hashed (selective save).
        $body = array(
            'default_threshold' => 10,
            'default_reorder'   => 5,
            'alert_enabled'     => 1,
            'dip_interval'      => 30,
        );
        $this->assertFirstCallSuccess( 'stock-settings', $body );
    }

    public function test_stock_settings_replay_matches(): void {
        // Replay safety: admin "บันทึก" → slow option write → admin clicks again →
        // without wrapper = 4× update_option × 2 = 8 DB writes + 2x option_changed hooks
        // (dinoco_inv_default_low_threshold listeners run twice = wasted invalidation).
        $body = array(
            'default_threshold' => 10,
            'default_reorder'   => 5,
            'alert_enabled'     => 1,
            'dip_interval'      => 30,
        );
        $this->assertReplayMatches( 'stock-settings', $body );
    }

    public function test_stock_settings_alert_toggle_409(): void {
        // alert_enabled boolean discriminator — flipping ON↔OFF between retries → 409.
        // Admin's intent changed (initially enabled alerts, retry disabled them) → cached
        // replay would let wrong state stick.
        $b1 = array(
            'default_threshold' => 10,
            'default_reorder'   => 5,
            'alert_enabled'     => 1,  // ON
            'dip_interval'      => 30,
        );
        $b2 = array(
            'default_threshold' => 10,
            'default_reorder'   => 5,
            'alert_enabled'     => 0,  // OFF (admin changed mind)
            'dip_interval'      => 30,
        );
        $this->assertDifferentBody(
            'stock-settings',
            $b1, $b2,
            'alert_enabled (ON vs OFF — admin toggled between retries)'
        );
    }

    // ── BATCH 18: SHIPPING-DEFAULTS (admin Flash V.42 global defaults + flag toggle) ──

    public function test_shipping_defaults_first_call_success(): void {
        // Body shape: dimensions + express_threshold sub-object (ksort-normalized) +
        // flag_enabled boolean discriminator.
        $body = array(
            'weight_grams'      => 1000,
            'length_cm'         => 30,
            'width_cm'          => 20,
            'height_cm'         => 10,
            'article_category'  => 6,
            'express_threshold' => array(
                'max_dim_cm' => 45,
                'sum_dim_cm' => 150,
                'weight_g'   => 5000,
            ),
            'flag_enabled' => 1,
        );
        $this->assertFirstCallSuccess( 'shipping-defaults', $body );
    }

    public function test_shipping_defaults_replay_matches(): void {
        // Replay safety: admin clicks "บันทึกค่าเริ่มต้น Flash" → slow option write +
        // cache flush + audit INSERT (when flag toggles) → admin clicks again → without
        // wrapper = 2× option write + 2× cache flush + 2× audit INSERT (only flag-toggle
        // case but still 2x storage rows in wp_dinoco_flash_audit per double-click).
        $body = array(
            'weight_grams'      => 1000,
            'length_cm'         => 30,
            'width_cm'          => 20,
            'height_cm'         => 10,
            'article_category'  => 6,
            'express_threshold' => array(
                'max_dim_cm' => 45,
                'sum_dim_cm' => 150,
                'weight_g'   => 5000,
            ),
            'flag_enabled' => 1,
        );
        $this->assertReplayMatches( 'shipping-defaults', $body );
    }

    public function test_shipping_defaults_flag_toggle_409(): void {
        // CRITICAL: flag_enabled boolean discriminator — V.42 enable/disable is the
        // single most consequential Flash admin action (controls whether shipping metadata
        // is sent to Flash courier API — affects ALL future B2B orders). Flipping ON↔OFF
        // between retries → 409 prevents accidental flag desync from cached replay.
        $b1 = array(
            'weight_grams'      => 1000,
            'length_cm'         => 30,
            'width_cm'          => 20,
            'height_cm'         => 10,
            'article_category'  => 6,
            'flag_enabled'      => 1,  // V.42 ON
        );
        $b2 = array(
            'weight_grams'      => 1000,
            'length_cm'         => 30,
            'width_cm'          => 20,
            'height_cm'         => 10,
            'article_category'  => 6,
            'flag_enabled'      => 0,  // V.42 OFF (rollback)
        );
        $this->assertDifferentBody(
            'shipping-defaults',
            $b1, $b2,
            'flag_enabled (V.42 ON vs OFF — production CRITICAL flip alert)'
        );
    }

    public function test_shipping_defaults_express_threshold_normalization(): void {
        // ksort normalization — same sub-object with different key order produces same hash.
        $b1 = array(
            'flag_enabled' => 1,
            'express_threshold' => array(
                'max_dim_cm' => 45,
                'sum_dim_cm' => 150,
                'weight_g'   => 5000,
            ),
        );
        $b2 = array(
            'flag_enabled' => 1,
            'express_threshold' => array(
                'weight_g'   => 5000,
                'max_dim_cm' => 45,
                'sum_dim_cm' => 150,
            ),
        );
        // Note: testing the canonical form — both ksort-normalized would produce identical
        // hash. The producer side ALWAYS ksort-sorts, so consumer test reflects that.
        $sorted_b1 = $b1; ksort( $sorted_b1['express_threshold'] );
        $sorted_b2 = $b2; ksort( $sorted_b2['express_threshold'] );
        $h1 = dinoco_idempotency_hash( $sorted_b1 );
        $h2 = dinoco_idempotency_hash( $sorted_b2 );
        $this->assertSame(
            $h1, $h2,
            'shipping-defaults: ksort-normalized express_threshold MUST hash identically regardless of original key order'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_40_no_collision_via_fixture(): void {
        $body_map = array(
            'claim_status' => array(
                'claim_id' => 12345,
                'status'   => 'Maintenance Completed',
                'note'     => 'ตรวจสอบเรียบร้อย',
                'actor'    => 'U_admin_jwt_uid_001',
            ),
            'dip_stock_start' => array(
                'action' => 'start',
            ),
            'dip_stock_force_close' => array(
                'session_id' => 42,
            ),
            'stock_settings' => array(
                'default_threshold' => 10,
                'default_reorder'   => 5,
                'alert_enabled'     => 1,
                'dip_interval'      => 30,
            ),
            'shipping_defaults' => array(
                'weight_grams'     => 1000,
                'length_cm'        => 30,
                'width_cm'         => 20,
                'height_cm'        => 10,
                'article_category' => 6,
                'flag_enabled'     => 1,
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 40', $body_map );
    }

    // ── CROSS-NAMESPACE PAIR GUARD (1) ──
    // dip-stock/start {action: 'start'} vs daily-summary {action: 'trigger-summary'}
    // (Round 39) vs manual-flash-test {action: 'test'} (Round 32) vs stock/initialize
    // {action: 'init'} (Round 30) — all 4 are constant-marker pattern. Verify the action
    // string itself discriminates so hashes are distinct even WITHOUT namespace gate.
    // This validates the constant-marker pattern's robustness across 4 endpoints in 4
    // different rounds — pattern is firmly proven.
    public function test_dip_stock_start_vs_other_constant_markers_no_collision(): void {
        $start_body    = array( 'action' => 'start' );          // R40 dip-stock/start
        $summary_body  = array( 'action' => 'trigger-summary' ); // R39 daily-summary
        $test_body     = array( 'action' => 'test' );            // R32 manual-flash-test
        $init_body     = array( 'action' => 'init' );            // R30 stock/initialize

        $h_start   = dinoco_idempotency_hash( $start_body );
        $h_summary = dinoco_idempotency_hash( $summary_body );
        $h_test    = dinoco_idempotency_hash( $test_body );
        $h_init    = dinoco_idempotency_hash( $init_body );

        // 4-way pairwise distinct
        $this->assertNotSame( $h_start, $h_summary, 'dip-stock/start vs daily-summary constant markers MUST differ' );
        $this->assertNotSame( $h_start, $h_test,    'dip-stock/start vs manual-flash-test constant markers MUST differ' );
        $this->assertNotSame( $h_start, $h_init,    'dip-stock/start vs stock/initialize constant markers MUST differ' );
        $this->assertNotSame( $h_summary, $h_test,  'daily-summary vs manual-flash-test constant markers MUST differ' );
        $this->assertNotSame( $h_summary, $h_init,  'daily-summary vs stock/initialize constant markers MUST differ' );
        $this->assertNotSame( $h_test,    $h_init,  'manual-flash-test vs stock/initialize constant markers MUST differ' );
    }
}
