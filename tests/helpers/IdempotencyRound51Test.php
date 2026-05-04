<?php
/**
 * IdempotencyRound51Test — DRY contract tests for Round 51 batch 29 (5 endpoints).
 *
 * Source: Round 51 (2026-04-30) — push toward 80% milestone (139 → 144 / 196 = 73.5%).
 * 33-round sustained Idempotency-Key campaign Rounds 18-51. First batch after
 * 🎯 70% MAJOR MILESTONE (Round 50). Cluster expansion: dinoco-b2f-audit/v1
 * coverage 1 → 6/20 (B2F Migration Audit cluster opened in R50, Round 51
 * accelerates closure with 5 of 19 remaining POSTs).
 *
 *   Batch 29 NEW (5 endpoints — all in `[Admin System] B2F Migration Audit`):
 *
 *     - POST /dinoco-b2f-audit/v1/sync-missing-intermediates
 *         Body hash = constant-marker hybrid {action:'sync-missing-intermediates',
 *         maker_id_filter, dry_run, user_id}. **10th constant-marker instance**
 *         after R30 stock/initialize + R32 manual-flash-test + R39 daily-summary
 *         + R40 dip-stock/start + R43 invoice/init + R47 stock/sync-missing +
 *         R49 smoke-test + R49 flag-audit/retention/run + R50 purge-stale-prices.
 *         dry_run=1 vs commit=0 different hashes (preview vs live INSERT loop
 *         semantics distinct). maker_id_filter scopes which makers are synced —
 *         different scope mid-retry (admin switched from "all" to single maker)
 *         → 409 catches admin re-evaluation. Cached replay skips 2× detect
 *         loop + 2× INSERT storm + 2× junction-updated cache invalidation.
 *
 *     - POST /dinoco-b2f-audit/v1/junction-bulk-delete
 *         CRITICAL bulk soft-delete (max 200 SKUs). Body hash = bulk-of-targets
 *         {maker_id, skus_sorted_dedup, add_to_blacklist, only_auto_synced,
 *         user_id}. SKUs canonicalized via uppercase + dedup + sort to make
 *         hash order-stable (admin re-uploads same set in different order =
 *         cached 200). only_auto_synced boolean discriminator: toggling
 *         protects CPT vs auto-only intent mid-retry → 409 prevents accidental
 *         CPT row deletion via cached replay. Different skus[] mid-retry →
 *         409 catches business decision change (CRITICAL — wrong cached
 *         replay deletes wrong SKUs).
 *
 *     - POST /dinoco-b2f-audit/v1/autosync-blacklist
 *         Single {maker_id, sku, action:'add'|'remove', user_id}. add ↔ remove
 *         enum discriminator catches admin clicking opposite button mid-retry
 *         → 409 prevents wrong final state via cached replay (cached add
 *         returning when admin actually wanted remove would leave SKU
 *         permanently blacklisted). Cached replay skips 2× wp_option array
 *         overwrite.
 *
 *     - POST /dinoco-b2f-audit/v1/junction-update-classification
 *         State-machine optimistic concurrency. Body hash = {maker_id,
 *         sku UPPER, fields ksort-normalized, expected_updated_at, user_id}.
 *         expected_updated_at IN hash = correct semantic — same retry attempt
 *         = same expected ts = same hash; admin tweaked production_mode
 *         single→sub_unit, or admin_display_mode auto→as_set, or
 *         confirmation_status auto_synced→confirmed mid-retry → different
 *         hash → 409 prevents wrong classification stuck via cached replay.
 *         reason EXCLUDED — audit annotation drift OK.
 *
 *     - POST /dinoco-b2f-audit/v1/junction-confirm-classification
 *         Layered defense over V.3.16 ad-hoc transient (which uses request
 *         param `idempotency_key`). Central helper uses standard
 *         X-Idempotency-Key header — both can coexist. Body hash = bulk
 *         {maker_id, skus_sorted_dedup, user_id}. Different skus[] mid-retry
 *         → 409. Cached replay skips 2× transaction + 2× audit observation
 *         INSERT storm.
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3-4 cases
 * per endpoint (first_call_success / replay_matches / different_field_409) +
 * cumulative no-collision. Total: 18 tests.
 *
 * After Round 51 the breakdown:
 *   - B2F namespace: 22 endpoints (unchanged)
 *   - B2B namespace: 60 endpoints (unchanged)
 *   - Inventory namespace: 23 endpoints (unchanged)
 *   - MCP namespace: 13 endpoints (unchanged)
 *   - LIFF AI namespace: 5 endpoints (unchanged)
 *   - Brand Voice namespace: 4 endpoints (unchanged)
 *   - Onboarding namespace: 2 endpoints (unchanged)
 *   - dinoco/v1 admin cluster: 3 endpoints (unchanged from Round 49)
 *   - dinoco-slip/v1: 6 endpoints (saturated since Round 50)
 *   - dinoco-b2f-audit/v1: +5 endpoints (R51 batch 29: cluster 1 → 6/20)
 *
 * 144/196 = 73.5%. **33-round sustained Idempotency-Key campaign Rounds 18-51**.
 * Pattern maturity at Round 51 unchanged: **7 patterns** (single / bulk /
 * bulk-of-targets / state-machine / boolean+enum-discriminator / constant-
 * marker / binary-fingerprint). Pattern mix R51: 1× constant-marker (sync-
 * missing-intermediates — 10th instance, pattern fully mature) + 1× bulk-of-
 * targets (junction-bulk-delete with order-stable sort + boolean discriminator
 * only_auto_synced) + 1× single+enum (autosync-blacklist add↔remove) + 1×
 * state-machine (junction-update-classification with ksort-normalized fields)
 * + 1× bulk (junction-confirm-classification — layered defense over R-param
 * transient).
 *
 * Round 52 candidates — B2F Migration Audit cluster has 14 remaining POSTs
 * unwrapped (excluding destructive phase4-migration / activate-schema / backfill
 * which already have rate limit + confirm dialog and need separate strategy):
 *   - POST /dinoco-b2f-audit/v1/junction-bulk-update-display (already has
 *     V.3.16 ad-hoc transient via idempotency_key param — layered defense)
 *   - POST /dinoco-b2f-audit/v1/feature-flags/toggle (admin flag flip; flag
 *     audit log already wired; central helper protects double-flip race)
 *   - POST /dinoco-b2f-audit/v1/maker-rollup-stats (read-only — skip)
 *   - GET-only endpoints not eligible
 *
 * Strategic note: After 🎯 70% MAJOR MILESTONE Round 50, recommend slow-down
 * to 1-2 weeks production canary observation matching Round 42 50% pause.
 * Round 51 represents continuation of namespace cluster expansion strategy.
 * Path to 80%: 4 batches × 3-5 endpoints = 156-176/196 = 79.6-89.8% by
 * Round 55-56.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound51Test extends IdempotencyTestFixture {

    // ── BATCH 29: SYNC-MISSING-INTERMEDIATES (constant-marker — 10th instance) ──

    public function test_sync_missing_intermediates_first_call_success(): void {
        // Body shape: constant-marker hybrid {action, maker_id_filter, dry_run, user_id}.
        $body = array(
            'action'          => 'sync-missing-intermediates',
            'maker_id_filter' => 0, // 0 = all makers
            'dry_run'         => 1,
            'user_id'         => 1,
        );
        $this->assertFirstCallSuccess( 'b2f-audit-sync-missing-intermediates', $body );
    }

    public function test_sync_missing_intermediates_replay_matches(): void {
        // Replay safety: admin "🔗 Sync Missing Intermediates" double-click on
        // slow detect+insert loop → cached 200 + skip 2× detect + 2× INSERT
        // storm + 2× cache flush per maker.
        $body = array(
            'action'          => 'sync-missing-intermediates',
            'maker_id_filter' => 0,
            'dry_run'         => 1,
            'user_id'         => 1,
        );
        $this->assertReplayMatches( 'b2f-audit-sync-missing-intermediates', $body );
    }

    public function test_sync_missing_intermediates_different_dry_run_409(): void {
        // CRITICAL: admin clicked dry_run=1 preview → reviewed → clicked
        // commit (dry_run=0) → 409 catches preview vs live INSERT loop
        // semantic drift — cached preview replay returning instead of
        // committing live would silently skip the actual sync admin intended.
        $b1 = array(
            'action'          => 'sync-missing-intermediates',
            'maker_id_filter' => 0,
            'dry_run'         => 1,
            'user_id'         => 1,
        );
        $b2 = array(
            'action'          => 'sync-missing-intermediates',
            'maker_id_filter' => 0,
            'dry_run'         => 0, // ADMIN COMMITTED (preview → live)
            'user_id'         => 1,
        );
        $this->assertDifferentBody(
            'b2f-audit-sync-missing-intermediates',
            $b1, $b2,
            'dry_run (admin preview→commit mid-retry — preview vs live INSERT loop semantic drift)'
        );
    }

    public function test_sync_missing_intermediates_different_maker_filter_409(): void {
        // CRITICAL: admin re-evaluated scope (all-makers → single maker) →
        // 409 catches scope drift — cached "all" replay would sync makers
        // admin no longer intended to touch.
        $b1 = array(
            'action'          => 'sync-missing-intermediates',
            'maker_id_filter' => 0, // all makers
            'dry_run'         => 0,
            'user_id'         => 1,
        );
        $b2 = array(
            'action'          => 'sync-missing-intermediates',
            'maker_id_filter' => 99, // ADMIN NARROWED to single maker
            'dry_run'         => 0,
            'user_id'         => 1,
        );
        $this->assertDifferentBody(
            'b2f-audit-sync-missing-intermediates',
            $b1, $b2,
            'maker_id_filter (admin scope re-evaluation all→single mid-retry — wrong-scope sync risk)'
        );
    }

    // ── BATCH 29: JUNCTION-BULK-DELETE (bulk-of-targets — CRITICAL soft-delete) ──

    public function test_junction_bulk_delete_first_call_success(): void {
        // Body shape: bulk-of-targets {maker_id, skus_sorted_dedup,
        // add_to_blacklist, only_auto_synced, user_id}.
        $body = array(
            'maker_id'         => 99,
            'skus'             => array( 'DNCSETPROS500X001H', 'DNCSETPROT500X001H' ),
            'add_to_blacklist' => 1,
            'only_auto_synced' => 1,
            'user_id'          => 1,
        );
        $this->assertFirstCallSuccess( 'b2f-audit-junction-bulk-delete', $body );
    }

    public function test_junction_bulk_delete_replay_matches(): void {
        // Replay safety: admin "🗑️ ลบที่เลือก" double-click on slow UPDATE +
        // blacklist write → cached 200 + skip 2× UPDATE storm + 2× blacklist
        // overwrite.
        $body = array(
            'maker_id'         => 99,
            'skus'             => array( 'DNCSETPROS500X001H', 'DNCSETPROT500X001H' ),
            'add_to_blacklist' => 1,
            'only_auto_synced' => 1,
            'user_id'          => 1,
        );
        $this->assertReplayMatches( 'b2f-audit-junction-bulk-delete', $body );
    }

    public function test_junction_bulk_delete_different_skus_409(): void {
        // CRITICAL: admin selected DIFFERENT SKUs mid-retry (changed mind +
        // selected new rows) → 409 catches business decision change. Wrong
        // cached replay would delete wrong SKUs (CRITICAL — soft-delete
        // recovers via SQL but auto-blacklist add prevents future re-add).
        $b1 = array(
            'maker_id'         => 99,
            'skus'             => array( 'DNCSETPROS500X001H', 'DNCSETPROT500X001H' ),
            'add_to_blacklist' => 1,
            'only_auto_synced' => 1,
            'user_id'          => 1,
        );
        $b2 = array(
            'maker_id'         => 99,
            'skus'             => array( 'DNCGND37FULLSTDS' ), // ADMIN CHANGED SELECTION
            'add_to_blacklist' => 1,
            'only_auto_synced' => 1,
            'user_id'          => 1,
        );
        $this->assertDifferentBody(
            'b2f-audit-junction-bulk-delete',
            $b1, $b2,
            'skus[] (admin changed selection mid-retry — wrong-row delete via cached replay)'
        );
    }

    public function test_junction_bulk_delete_different_only_auto_409(): void {
        // CRITICAL: admin toggled only_auto_synced=true → false (intent
        // shifted from "delete only auto-synced" to "delete CPT rows too") →
        // 409 catches CPT-protection-toggle drift. Cached replay returning
        // when admin flipped intent would protect CPT rows admin wanted to
        // delete (or vice versa).
        $b1 = array(
            'maker_id'         => 99,
            'skus'             => array( 'DNCSETPROS500X001H' ),
            'add_to_blacklist' => 1,
            'only_auto_synced' => 1, // SAFE — protect CPT
            'user_id'          => 1,
        );
        $b2 = array(
            'maker_id'         => 99,
            'skus'             => array( 'DNCSETPROS500X001H' ),
            'add_to_blacklist' => 1,
            'only_auto_synced' => 0, // ADMIN ESCALATED — also delete CPT
            'user_id'          => 1,
        );
        $this->assertDifferentBody(
            'b2f-audit-junction-bulk-delete',
            $b1, $b2,
            'only_auto_synced (admin CPT-protection toggle mid-retry — wrong intent risk)'
        );
    }

    // ── BATCH 29: AUTOSYNC-BLACKLIST (single+enum add↔remove) ──

    public function test_autosync_blacklist_first_call_success(): void {
        // Body shape: single {maker_id, sku, action, user_id}.
        $body = array(
            'maker_id' => 99,
            'sku'      => 'DNCSETPROS500X001H',
            'action'   => 'add',
            'user_id'  => 1,
        );
        $this->assertFirstCallSuccess( 'b2f-audit-autosync-blacklist', $body );
    }

    public function test_autosync_blacklist_replay_matches(): void {
        // Replay safety: admin clicks ⛔ "Add to blacklist" double-click on
        // slow wp_option array overwrite → cached 200 + skip 2× option write.
        $body = array(
            'maker_id' => 99,
            'sku'      => 'DNCSETPROS500X001H',
            'action'   => 'add',
            'user_id'  => 1,
        );
        $this->assertReplayMatches( 'b2f-audit-autosync-blacklist', $body );
    }

    public function test_autosync_blacklist_different_action_409(): void {
        // CRITICAL: admin clicked add → realized mistake → clicked remove →
        // 409 catches add↔remove enum discriminator. Wrong cached replay
        // returning add when admin wanted remove leaves SKU permanently
        // blacklisted (next backfill skips it forever).
        $b1 = array(
            'maker_id' => 99,
            'sku'      => 'DNCSETPROS500X001H',
            'action'   => 'add',
            'user_id'  => 1,
        );
        $b2 = array(
            'maker_id' => 99,
            'sku'      => 'DNCSETPROS500X001H',
            'action'   => 'remove', // ADMIN REVERSED INTENT
            'user_id'  => 1,
        );
        $this->assertDifferentBody(
            'b2f-audit-autosync-blacklist',
            $b1, $b2,
            'action (add↔remove enum mid-retry — wrong final blacklist state via replay)'
        );
    }

    // ── BATCH 29: JUNCTION-UPDATE-CLASSIFICATION (state-machine optimistic concurrency) ──

    public function test_junction_update_classification_first_call_success(): void {
        // Body shape: {maker_id, sku UPPER, fields ksort-normalized,
        // expected_updated_at, user_id}.
        $body = array(
            'maker_id'            => 99,
            'sku'                 => 'DNCSETPROS500X001H',
            'fields'              => array(
                'admin_display_mode'  => 'as_set',
                'confirmation_status' => 'confirmed',
                'production_mode'     => 'set_assembled',
            ),
            'expected_updated_at' => '2026-04-30 10:00:00',
            'user_id'             => 1,
        );
        $this->assertFirstCallSuccess( 'b2f-audit-junction-update-classification', $body );
    }

    public function test_junction_update_classification_replay_matches(): void {
        // Replay safety: admin Wave 3 UI click "บันทึก classification" double-
        // click on slow UPDATE + b2f_junction_update_classification helper +
        // observation INSERT + b2f_junction_updated cache invalidation →
        // cached 200 + skip 2× DB roundtrip.
        $body = array(
            'maker_id'            => 99,
            'sku'                 => 'DNCSETPROS500X001H',
            'fields'              => array(
                'admin_display_mode'  => 'as_set',
                'confirmation_status' => 'confirmed',
                'production_mode'     => 'set_assembled',
            ),
            'expected_updated_at' => '2026-04-30 10:00:00',
            'user_id'             => 1,
        );
        $this->assertReplayMatches( 'b2f-audit-junction-update-classification', $body );
    }

    public function test_junction_update_classification_different_production_mode_409(): void {
        // CRITICAL: admin tweaked production_mode set_assembled → sub_unit
        // mid-retry → 409 catches classification drift. Wrong cached replay
        // would stick wrong production mode (e.g. SET appears as sub-unit
        // in LIFF E-Catalog when admin actually wanted full set).
        $b1 = array(
            'maker_id'            => 99,
            'sku'                 => 'DNCSETPROS500X001H',
            'fields'              => array(
                'admin_display_mode'  => 'as_set',
                'confirmation_status' => 'confirmed',
                'production_mode'     => 'set_assembled',
            ),
            'expected_updated_at' => '2026-04-30 10:00:00',
            'user_id'             => 1,
        );
        $b2 = array(
            'maker_id'            => 99,
            'sku'                 => 'DNCSETPROS500X001H',
            'fields'              => array(
                'admin_display_mode'  => 'as_set',
                'confirmation_status' => 'confirmed',
                'production_mode'     => 'sub_unit', // ADMIN TWEAKED
            ),
            'expected_updated_at' => '2026-04-30 10:00:00',
            'user_id'             => 1,
        );
        $this->assertDifferentBody(
            'b2f-audit-junction-update-classification',
            $b1, $b2,
            'production_mode (set_assembled → sub_unit mid-retry — wrong classification stuck)'
        );
    }

    public function test_junction_update_classification_different_expected_ts_409(): void {
        // CRITICAL: admin re-fetched fresh expected_updated_at after stale-write
        // 409 from 1st attempt + retried with new timestamp → different ts
        // = different hash = treated as new request (correct semantic — the
        // optimistic concurrency check expects fresh ts). Cached old-ts
        // replay returning would return outdated 409 confusingly.
        $b1 = array(
            'maker_id'            => 99,
            'sku'                 => 'DNCSETPROS500X001H',
            'fields'              => array( 'production_mode' => 'set_assembled' ),
            'expected_updated_at' => '2026-04-30 10:00:00',
            'user_id'             => 1,
        );
        $b2 = array(
            'maker_id'            => 99,
            'sku'                 => 'DNCSETPROS500X001H',
            'fields'              => array( 'production_mode' => 'set_assembled' ),
            'expected_updated_at' => '2026-04-30 10:05:30', // ADMIN REFRESHED
            'user_id'             => 1,
        );
        $this->assertDifferentBody(
            'b2f-audit-junction-update-classification',
            $b1, $b2,
            'expected_updated_at (admin refreshed ts after stale-write — separate retry attempt)'
        );
    }

    // ── BATCH 29: JUNCTION-CONFIRM-CLASSIFICATION (bulk — layered defense) ──

    public function test_junction_confirm_classification_first_call_success(): void {
        // Body shape: bulk {maker_id, skus_sorted_dedup, user_id}. Layered
        // defense over V.3.16 request-param `idempotency_key` ad-hoc transient.
        $body = array(
            'maker_id' => 99,
            'skus'     => array( 'DNCSETPROS500X001H', 'DNCSETPROT500X001H' ),
            'user_id'  => 1,
        );
        $this->assertFirstCallSuccess( 'b2f-audit-junction-confirm-classification', $body );
    }

    public function test_junction_confirm_classification_replay_matches(): void {
        // Replay safety: admin "ยืนยันทั้งหมด" double-click on slow START
        // TRANSACTION + per-SKU UPDATE confirmed + observation INSERT loop →
        // cached 200 + skip 2× transaction + 2× audit observation INSERT
        // storm.
        $body = array(
            'maker_id' => 99,
            'skus'     => array( 'DNCSETPROS500X001H', 'DNCSETPROT500X001H' ),
            'user_id'  => 1,
        );
        $this->assertReplayMatches( 'b2f-audit-junction-confirm-classification', $body );
    }

    public function test_junction_confirm_classification_different_skus_409(): void {
        // CRITICAL: admin selected DIFFERENT unconfirmed SKUs mid-retry
        // (filter changed) → 409 catches business decision change. Cached
        // replay returning old set when admin filtered different scope
        // would skip confirm on actual selected SKUs (false-positive
        // success).
        $b1 = array(
            'maker_id' => 99,
            'skus'     => array( 'DNCSETPROS500X001H', 'DNCSETPROT500X001H' ),
            'user_id'  => 1,
        );
        $b2 = array(
            'maker_id' => 99,
            'skus'     => array( 'DNCGND37FULLSTDS' ), // ADMIN CHANGED FILTER SCOPE
            'user_id'  => 1,
        );
        $this->assertDifferentBody(
            'b2f-audit-junction-confirm-classification',
            $b1, $b2,
            'skus[] (admin changed selection mid-retry — false-positive confirm success risk)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_51_no_collision_via_fixture(): void {
        $body_map = array(
            'b2f_audit_sync_missing_intermediates'      => array(
                'action'          => 'sync-missing-intermediates',
                'maker_id_filter' => 0,
                'dry_run'         => 1,
                'user_id'         => 1,
            ),
            'b2f_audit_junction_bulk_delete'            => array(
                'maker_id'         => 99,
                'skus'             => array( 'DNCSETPROS500X001H', 'DNCSETPROT500X001H' ),
                'add_to_blacklist' => 1,
                'only_auto_synced' => 1,
                'user_id'          => 1,
            ),
            'b2f_audit_autosync_blacklist'              => array(
                'maker_id' => 99,
                'sku'      => 'DNCSETPROS500X001H',
                'action'   => 'add',
                'user_id'  => 1,
            ),
            'b2f_audit_junction_update_classification'  => array(
                'maker_id'            => 99,
                'sku'                 => 'DNCSETPROS500X001H',
                'fields'              => array(
                    'admin_display_mode'  => 'as_set',
                    'confirmation_status' => 'confirmed',
                    'production_mode'     => 'set_assembled',
                ),
                'expected_updated_at' => '2026-04-30 10:00:00',
                'user_id'             => 1,
            ),
            'b2f_audit_junction_confirm_classification' => array(
                'maker_id' => 99,
                'skus'     => array( 'DNCSETPROS500X001H', 'DNCSETPROT500X001H' ),
                'user_id'  => 1,
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 51 — push toward 80% (144/196 = 73.5%, B2F Migration Audit cluster 1 → 6/20)', $body_map );
    }
}
