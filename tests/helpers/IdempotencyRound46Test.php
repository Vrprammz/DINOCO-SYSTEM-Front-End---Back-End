<?php
/**
 * IdempotencyRound46Test — DRY contract tests for Round 46 batch 24 (5 endpoints).
 *
 * Source: 🎯🎯 Round 46 (2026-04-30) — 60% MAJOR MILESTONE REACHED. 119/196 = 60.7%
 * against Round 30 authoritative census denominator. **28-round sustained Idempotency-
 * Key campaign Rounds 18-46.**
 *
 *   Batch 24 NEW (5 endpoints — cross-snippet 3-file: Snippet 3 + Snippet 9 + LIFF AI):
 *     - POST /b2b/v1/manual-flash-status        — admin/RPi "เช็คสถานะ Manual Flash"
 *                                                   double-click on slow Flash network →
 *                                                   2× b2b_flash_get_routes(pno) Flash
 *                                                   Routes API quota burn + if state>0
 *                                                   → 2× b2b_flash_manual_shipment_
 *                                                   webhook(pno) status mutation +
 *                                                   2× notify spam. Body hash = single
 *                                                   {pno} — pno globally unique.
 *     - POST /b2b/v1/distributor                — admin "บันทึกตัวแทน" double-click race
 *                                                   → 2× wp_insert_post (NEW) + 2× ACF
 *                                                   update_field × 15 fields + 2× recalc_
 *                                                   debt potential. Body hash = single
 *                                                   {id, shop_name, line_group_id} core
 *                                                   — id discriminates create (id=0) vs
 *                                                   update (id>0); full body too noisy.
 *     - POST /b2b/v1/settings                   — admin "บันทึกตั้งค่า" double-click →
 *                                                   2× update_option(b2b_settings) array
 *                                                   overwrite race. Bulk-shape selective
 *                                                   hash {bank_name, bank_account,
 *                                                   bank_holder, company_name, promptpay
 *                                                   _id} — fields PRESENT only sorted by
 *                                                   ksort. Different bank_account mid-
 *                                                   retry → 409.
 *     - POST /b2b/v1/print-settings             — admin "บันทึกตั้งค่า Print" double-
 *                                                   click → 2× update_option × 4 (auto_
 *                                                   print + shipping_mode + warehouse +
 *                                                   registered) + if regen=1 → 2×
 *                                                   wp_generate_password creates 2 keys
 *                                                   last one wins SECURITY-CRITICAL key
 *                                                   rotation race. Bulk-shape selective
 *                                                   hash with regen boolean discriminator.
 *     - POST /liff-ai/v1/lead/{id}/status       — admin LIFF "เปลี่ยนสถานะ Lead" double-
 *                                                   tap on slow MongoDB → 2× POST agent
 *                                                   proxy → 2× lead status + 2× history
 *                                                   insert + 2× downstream notify hooks.
 *                                                   Body hash = single {lead_id, status,
 *                                                   actor_uid from JWT} — actor scoped
 *                                                   cross-admin key reuse impossible;
 *                                                   status enum (17 statuses) catches
 *                                                   different button mid-retry → 409.
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per
 * endpoint (first_call_success / replay_matches / different_field_409) +
 * cumulative no-collision. Total: 16 tests.
 *
 * After Round 46 the breakdown:
 *   - B2F namespace: 21 endpoints (unchanged)
 *   - B2B namespace: 60 endpoints (+4 since Round 45 = 56 → 60 — manual-flash-status +
 *     distributor + settings + print-settings)
 *   - Inventory namespace: 19 endpoints (unchanged)
 *   - MCP namespace: 13 endpoints (unchanged)
 *   - LIFF AI namespace: 4 endpoints (+1 since Round 45 = 3 → 4 — lead/{id}/status)
 *   - Brand Voice namespace: 2 endpoints (unchanged)
 *
 * 🎯🎯 119/196 = 60.7% — **60% MAJOR MILESTONE REACHED**. 28-round sustained campaign.
 * Pattern maturity at Round 46 unchanged: **7 patterns** (single / bulk / bulk-of-
 * targets / state-machine / boolean+enum-discriminator / constant-marker / binary-
 * fingerprint). 3× single + 2× bulk-shape (settings + print-settings selective).
 *
 * Round 47 candidate batch 25 (5 endpoints → 124/196 = 63.3%):
 *   - POST /b2b/v1/flash-webhook (verify Flash sig — public callback may not need wrap)
 *   - LIFF AI /auth (lead-init token; cross-namespace verify)
 *   - LIFF AI /agent-ask (admin Q&A retry burn — agent proxy quota guard)
 *   - Inventory category CRUD if exposed
 *   - Strategic note: After 🎯 60%, recommend slow-down to 1-2 weeks production
 *     canary observation matching Round 42 50% pause.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound46Test extends IdempotencyTestFixture {

    // ── BATCH 24: MANUAL-FLASH-STATUS (single — Flash Routes API + webhook trigger) ──

    public function test_manual_flash_status_first_call_success(): void {
        $body = array( 'pno' => 'TH40012345678' );
        $this->assertFirstCallSuccess( 'manual-flash-status', $body );
    }

    public function test_manual_flash_status_replay_matches(): void {
        // Replay safety: admin/RPi double-click "เช็คสถานะ" on slow Flash network → 2×
        // Flash Routes API quota burn + if state>0 → 2× webhook helper status mutation
        // + 2× notify spam. Same PNO retry = replay (instant, no quota burn).
        $body = array( 'pno' => 'TH40012345678' );
        $this->assertReplayMatches( 'manual-flash-status', $body );
    }

    public function test_manual_flash_status_different_pno_409(): void {
        // CRITICAL: admin checked wrong PNO mid-retry — 409 catches typo/UI form drift.
        $b1 = array( 'pno' => 'TH40012345678' );
        $b2 = array( 'pno' => 'TH40098765432' );  // DIFFERENT shipment
        $this->assertDifferentBody(
            'manual-flash-status',
            $b1, $b2,
            'pno (TH40012345678 vs TH40098765432 — different shipment)'
        );
    }

    // ── BATCH 24: DISTRIBUTOR (single — admin upsert distributor profile) ──

    public function test_distributor_first_call_success(): void {
        // Body shape: {id, shop_name, line_group_id} core — id=0 = create, id>0 = update.
        $body = array( 'id' => 0, 'shop_name' => 'ร้าน Test', 'line_group_id' => 'Cabc123' );
        $this->assertFirstCallSuccess( 'distributor', $body );
    }

    public function test_distributor_replay_matches(): void {
        // Replay safety: admin "บันทึก" double-click on slow wp_insert_post → 2× post
        // creation + 2× ACF update_field × 15 fields + 2× recalc_debt. Same body =
        // replay safe (existing distributor returned).
        $body = array( 'id' => 1234, 'shop_name' => 'ร้าน Test', 'line_group_id' => 'Cabc123' );
        $this->assertReplayMatches( 'distributor', $body );
    }

    public function test_distributor_different_shop_name_409(): void {
        // CRITICAL: admin renamed shop mid-retry — 409 catches business decision change.
        $b1 = array( 'id' => 1234, 'shop_name' => 'ร้าน Test',     'line_group_id' => 'Cabc123' );
        $b2 = array( 'id' => 1234, 'shop_name' => 'ร้าน Test 2', 'line_group_id' => 'Cabc123' );
        $this->assertDifferentBody(
            'distributor',
            $b1, $b2,
            'shop_name (renamed mid-retry — admin business decision change)'
        );
    }

    // ── BATCH 24: SETTINGS (bulk-shape selective — admin global b2b_settings) ──

    public function test_settings_first_call_success(): void {
        // Bulk-shape selective: only fields PRESENT in request hashed (admin may save
        // single field without overwriting others).
        $body = array(
            'bank_name'    => 'KBank',
            'bank_account' => '123-4-56789-0',
            'bank_holder'  => 'บริษัท DINOCO',
            'company_name' => 'DINOCO Co.,Ltd.',
            'promptpay_id' => '0812345678',
        );
        $this->assertFirstCallSuccess( 'settings', $body );
    }

    public function test_settings_replay_matches(): void {
        // Replay safety: admin "บันทึก" double-click → 2× update_option(b2b_settings)
        // array overwrite race. Same field-set retry = replay safe.
        $body = array(
            'bank_name'    => 'KBank',
            'bank_account' => '123-4-56789-0',
            'bank_holder'  => 'บริษัท DINOCO',
            'company_name' => 'DINOCO Co.,Ltd.',
            'promptpay_id' => '0812345678',
        );
        $this->assertReplayMatches( 'settings', $body );
    }

    public function test_settings_different_bank_account_409(): void {
        // CRITICAL: admin corrected typo in bank_account mid-retry → 409 surfaces
        // business decision change (avoid silent overwrite).
        $b1 = array(
            'bank_name'    => 'KBank',
            'bank_account' => '123-4-56789-0',  // typo
            'bank_holder'  => 'บริษัท DINOCO',
        );
        $b2 = array(
            'bank_name'    => 'KBank',
            'bank_account' => '123-4-56789-1',  // CORRECTED
            'bank_holder'  => 'บริษัท DINOCO',
        );
        $this->assertDifferentBody(
            'settings',
            $b1, $b2,
            'bank_account (typo correction mid-retry — different field)'
        );
    }

    // ── BATCH 24: PRINT-SETTINGS (bulk-shape selective + regen boolean discriminator) ──

    public function test_print_settings_first_call_success(): void {
        $body = array(
            'auto_print'     => true,
            'shipping_mode'  => 'flash',
            'regenerate_key' => false,
            'wh_name'        => 'โกดังหลัก',
            'wh_phone'       => '0812345678',
            'reg_name'       => 'บริษัท DINOCO',
        );
        $this->assertFirstCallSuccess( 'print-settings', $body );
    }

    public function test_print_settings_replay_matches(): void {
        // Replay safety: admin "บันทึก" double-click → 2× update_option × 4 + potential
        // 2× wp_generate_password if regen=true (SECURITY-CRITICAL key rotation race).
        // Same body = replay safe.
        $body = array(
            'auto_print'     => true,
            'shipping_mode'  => 'flash',
            'regenerate_key' => false,
            'wh_name'        => 'โกดังหลัก',
        );
        $this->assertReplayMatches( 'print-settings', $body );
    }

    public function test_print_settings_different_regen_flag_409(): void {
        // CRITICAL: regen boolean discriminator. Toggling regen=true between retries
        // = different key rotation event → 409 prevents silent dual-rotation.
        $b1 = array(
            'auto_print'     => true,
            'shipping_mode'  => 'flash',
            'regenerate_key' => false,  // no rotation
        );
        $b2 = array(
            'auto_print'     => true,
            'shipping_mode'  => 'flash',
            'regenerate_key' => true,   // ROTATE key (security event)
        );
        $this->assertDifferentBody(
            'print-settings',
            $b1, $b2,
            'regenerate_key (false vs true — security-critical key rotation event)'
        );
    }

    // ── BATCH 24: LEAD-STATUS (single — LIFF AI admin status change) ──

    public function test_lead_status_first_call_success(): void {
        // Body shape: {lead_id, status, actor_uid from JWT}.
        $body = array(
            'lead_id'   => '550e8400e29b41d4a716446655440000',
            'status'    => 'dealer_contacted',
            'actor_uid' => 'U1234567890abcdef',
        );
        $this->assertFirstCallSuccess( 'lead-status', $body );
    }

    public function test_lead_status_replay_matches(): void {
        // Replay safety: admin LIFF double-tap "เปลี่ยนสถานะ" on slow MongoDB → 2×
        // POST agent proxy + 2× lead status update + 2× history insert. Same body =
        // replay safe.
        $body = array(
            'lead_id'   => '550e8400e29b41d4a716446655440000',
            'status'    => 'dealer_contacted',
            'actor_uid' => 'U1234567890abcdef',
        );
        $this->assertReplayMatches( 'lead-status', $body );
    }

    public function test_lead_status_different_status_409(): void {
        // CRITICAL: status enum discriminator (17 statuses). Admin clicked
        // 'dealer_contacted' then 'order_placed' on retry → different state machine
        // transition → 409 catches admin business intent change mid-retry.
        $b1 = array(
            'lead_id'   => '550e8400e29b41d4a716446655440000',
            'status'    => 'dealer_contacted',
            'actor_uid' => 'U1234567890abcdef',
        );
        $b2 = array(
            'lead_id'   => '550e8400e29b41d4a716446655440000',
            'status'    => 'order_placed',  // DIFFERENT state
            'actor_uid' => 'U1234567890abcdef',
        );
        $this->assertDifferentBody(
            'lead-status',
            $b1, $b2,
            'status (dealer_contacted vs order_placed — different state machine transition)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_46_no_collision_via_fixture(): void {
        $body_map = array(
            'manual_flash_status' => array( 'pno' => 'TH40012345678' ),
            'distributor'         => array( 'id' => 1234, 'shop_name' => 'ร้าน Test', 'line_group_id' => 'Cabc123' ),
            'settings'            => array(
                'bank_name'    => 'KBank',
                'bank_account' => '123-4-56789-0',
                'bank_holder'  => 'บริษัท DINOCO',
            ),
            'print_settings'      => array(
                'auto_print'     => true,
                'shipping_mode'  => 'flash',
                'regenerate_key' => false,
            ),
            'lead_status'         => array(
                'lead_id'   => '550e8400e29b41d4a716446655440000',
                'status'    => 'dealer_contacted',
                'actor_uid' => 'U1234567890abcdef',
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 46 — 🎯🎯 60% MAJOR MILESTONE REACHED', $body_map );
    }
}
