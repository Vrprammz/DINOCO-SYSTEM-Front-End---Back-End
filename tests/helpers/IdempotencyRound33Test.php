<?php
/**
 * IdempotencyRound33Test — DRY contract tests for Round 33 batch 11 (5 endpoints).
 *
 * Source: Round 33 (2026-04-30) — push past 28% coverage milestone (54/196 = 27.6% with the
 * fresh Round 33 census denominator update from 193 → 196 POST endpoints).
 *
 *   Batch 11 NEW (5 endpoints — CRUD/notification retry-prone admin/maker hot paths):
 *     - POST /b2f/v1/maker-product       — admin "บันทึกสินค้า" double-click = duplicate junction
 *                                          row attempt + observation log noise
 *     - POST /b2f/v1/maker               — admin "บันทึกโรงงาน" double-click = duplicate group_id
 *                                          collision risk + duplicate name CPT
 *     - POST /b2f/v1/po-undo-submit      — 30s undo window — admin retry within window = 2x
 *                                          cancel + 2x stock restore (idempotent at FSM but
 *                                          lossy already_cancelled response on slow client)
 *     - POST /dinoco-mcp/v1/distributor-notify — OpenClaw lead notification → 2x LINE Flex to
 *                                          dealer + double-mark accept postback
 *     - POST /dinoco-mcp/v1/customer-link — FB/IG → WP 2x update_user_meta + mcp_linked_at
 *                                          timestamp overwrite (loses 1st audit timestamp)
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per endpoint
 * (first_call_success / replay_matches / different_field_409) + cumulative no-collision +
 * cross-namespace pair guard (maker-product vs maker share `id` field shape but different
 * namespaces and different supporting fields).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound33Test extends IdempotencyTestFixture {

    // ── BATCH 11: MAKER-PRODUCT (B2F CRUD upsert) ──

    public function test_maker_product_first_call_success(): void {
        $body = array(
            'id'                => 0,
            'mp_maker_id'       => 12,
            'mp_product_sku'    => 'DNCSETNX500EX001',
            'mp_product_name'   => 'NX500 Crash Bar Set',
            'mp_unit_cost'      => 1850.00,
            'mp_moq'            => 10,
            'mp_lead_time_days' => 14,
            'mp_lead_land'      => 7,
            'mp_lead_sea'       => 14,
            'mp_shipping_land'  => 50.00,
            'mp_shipping_sea'   => 30.00,
            'mp_status'         => 'active',
            'mp_notes'          => 'ผลิตเดือนละ 1 รอบ',
        );
        $this->assertFirstCallSuccess( 'maker-product', $body );
    }

    public function test_maker_product_replay_matches(): void {
        $body = array(
            'id'                => 0,
            'mp_maker_id'       => 12,
            'mp_product_sku'    => 'DNCSETNX500EX001',
            'mp_product_name'   => 'NX500 Crash Bar Set',
            'mp_unit_cost'      => 1850.00,
            'mp_moq'            => 10,
            'mp_lead_time_days' => 14,
            'mp_lead_land'      => 7,
            'mp_lead_sea'       => 14,
            'mp_shipping_land'  => 50.00,
            'mp_shipping_sea'   => 30.00,
            'mp_status'         => 'active',
            'mp_notes'          => 'ผลิตเดือนละ 1 รอบ',
        );
        $this->assertReplayMatches( 'maker-product', $body );
    }

    public function test_maker_product_different_cost_409(): void {
        // CRITICAL: admin editing unit cost between retries = different financial intent.
        // Wrapper MUST surface 409 not silent replay (would let admin "save" old cost thinking
        // they saved new cost — costing miscalculation downstream in PO totals).
        $b1 = array(
            'id'             => 0,
            'mp_maker_id'    => 12,
            'mp_product_sku' => 'DNCSETNX500EX001',
            'mp_unit_cost'   => 1850.00,
        );
        $b2 = array(
            'id'             => 0,
            'mp_maker_id'    => 12,
            'mp_product_sku' => 'DNCSETNX500EX001',
            'mp_unit_cost'   => 2100.00,  // edited — admin realized cost was wrong
        );
        $this->assertDifferentBody( 'maker-product', $b1, $b2, 'mp_unit_cost (1850 → 2100)' );
    }

    // ── BATCH 11: MAKER (B2F CRUD upsert) ──

    public function test_maker_first_call_success(): void {
        $body = array(
            'id'                     => 0,
            'maker_name'             => 'Happy Tech Pro',
            'maker_line_group_id'    => 'C1234abcdef',
            'maker_contact'          => 'คุณสมชาย',
            'maker_phone'            => '0812345678',
            'maker_email'            => 'contact@happytech.co.th',
            'maker_address'          => 'ระยอง',
            'maker_tax_id'           => '0105561234567',
            'maker_bank_name'        => 'กสิกรไทย',
            'maker_bank_account'     => '1234567890',
            'maker_bank_holder'      => 'บริษัท แฮปปี้เทค โปร จำกัด',
            'maker_bank_code'        => 'KBANK',
            'maker_currency'         => 'THB',
            'maker_status'           => 'active',
            'maker_notes'            => 'โรงงานหลักผลิต crash bar',
            'maker_credit_limit'     => 500000.00,
            'maker_credit_term_days' => 30,
        );
        $this->assertFirstCallSuccess( 'maker', $body );
    }

    public function test_maker_replay_matches(): void {
        $body = array(
            'id'                     => 0,
            'maker_name'             => 'Happy Tech Pro',
            'maker_line_group_id'    => 'C1234abcdef',
            'maker_currency'         => 'THB',
            'maker_credit_limit'     => 500000.00,
            'maker_credit_term_days' => 30,
        );
        $this->assertReplayMatches( 'maker', $body );
    }

    public function test_maker_different_credit_limit_409(): void {
        // CRITICAL: credit_limit edit between retries = different financial intent. Wrapper
        // MUST 409 — admin must consciously confirm new limit (not get silent stale write).
        $b1 = array(
            'id'                 => 7,
            'maker_name'         => 'Happy Tech Pro',
            'maker_credit_limit' => 500000.00,
        );
        $b2 = array(
            'id'                 => 7,
            'maker_name'         => 'Happy Tech Pro',
            'maker_credit_limit' => 750000.00,  // raised limit — different financial commitment
        );
        $this->assertDifferentBody( 'maker', $b1, $b2, 'maker_credit_limit (500k → 750k)' );
    }

    // ── BATCH 11: PO-UNDO-SUBMIT (B2F admin 30s window) ──

    public function test_po_undo_submit_first_call_success(): void {
        $body = array(
            'po_id'   => 4521,
            'user_id' => 3,
        );
        $this->assertFirstCallSuccess( 'po-undo-submit', $body );
    }

    public function test_po_undo_submit_replay_matches(): void {
        $body = array(
            'po_id'   => 4521,
            'user_id' => 3,
        );
        $this->assertReplayMatches( 'po-undo-submit', $body );
    }

    public function test_po_undo_submit_different_user_409(): void {
        // user_id from get_current_user_id() = auth-scoped. Same Idempotency-Key from 2 different
        // admins = different intent (cross-tenant cache poison). Wrapper MUST 409 — different user
        // means different audit trail attribution; retry caching across users is a security hole.
        $b1 = array(
            'po_id'   => 4521,
            'user_id' => 3,  // admin A
        );
        $b2 = array(
            'po_id'   => 4521,
            'user_id' => 7,  // admin B (different)
        );
        $this->assertDifferentBody( 'po-undo-submit', $b1, $b2, 'user_id (3 vs 7) — auth-scope guard' );
    }

    // ── BATCH 11: DISTRIBUTOR-NOTIFY (MCP OpenClaw → LINE) ──

    public function test_distributor_notify_first_call_success(): void {
        $body = array(
            'distributor_id' => '4521',
            'lead_id'        => 'LEAD-1714568400-a3f7',
            'type'           => 'new_lead',
            'customer_name'  => 'คุณสมศักดิ์',
            'product'        => 'NX500 กันล้ม',
            'province'       => 'เชียงใหม่',
            'phone'          => '0812345678',
            'message'        => '',
        );
        $this->assertFirstCallSuccess( 'distributor-notify', $body );
    }

    public function test_distributor_notify_replay_matches(): void {
        $body = array(
            'distributor_id' => '4521',
            'lead_id'        => 'LEAD-1714568400-a3f7',
            'type'           => 'new_lead',
            'customer_name'  => 'คุณสมศักดิ์',
            'product'        => 'NX500 กันล้ม',
            'province'       => 'เชียงใหม่',
            'phone'          => '0812345678',
            'message'        => '',
        );
        $this->assertReplayMatches( 'distributor-notify', $body );
    }

    public function test_distributor_notify_different_type_409(): void {
        // CRITICAL: type discriminates between Flex Lead notification vs plain text follow-up.
        // Same key + different type would replay wrong message format. Wrapper MUST 409.
        $b1 = array(
            'distributor_id' => '4521',
            'lead_id'        => 'LEAD-1714568400-a3f7',
            'type'           => 'new_lead',
            'customer_name'  => 'คุณสมศักดิ์',
            'message'        => '',
        );
        $b2 = array(
            'distributor_id' => '4521',
            'lead_id'        => 'LEAD-1714568400-a3f7',
            'type'           => 'follow_up',  // different message type
            'customer_name'  => 'คุณสมศักดิ์',
            'message'        => 'ลูกค้ายังไม่ได้รับโทร',
        );
        $this->assertDifferentBody( 'distributor-notify', $b1, $b2, 'type (new_lead vs follow_up)' );
    }

    // ── BATCH 11: CUSTOMER-LINK (MCP FB/IG → WP user) ──

    public function test_customer_link_first_call_success(): void {
        $body = array(
            'source_id'           => 'fb_user_4567890123',
            'platform'            => 'facebook',
            'wp_user_id_or_phone' => '0812345678',
        );
        $this->assertFirstCallSuccess( 'customer-link', $body );
    }

    public function test_customer_link_replay_matches(): void {
        $body = array(
            'source_id'           => 'fb_user_4567890123',
            'platform'            => 'facebook',
            'wp_user_id_or_phone' => '0812345678',
        );
        $this->assertReplayMatches( 'customer-link', $body );
    }

    public function test_customer_link_different_platform_409(): void {
        // CRITICAL: platform discriminates same source_id across FB vs IG namespaces (Meta uses
        // separate user spaces — fb_user_X and ig_user_X may have same suffix). Wrapper MUST 409
        // when platform changes — meta_key differs (mcp_facebook_id vs mcp_instagram_id).
        $b1 = array(
            'source_id'           => 'fb_user_4567890123',
            'platform'            => 'facebook',
            'wp_user_id_or_phone' => '0812345678',
        );
        $b2 = array(
            'source_id'           => 'fb_user_4567890123',
            'platform'            => 'instagram',  // different platform → different meta_key
            'wp_user_id_or_phone' => '0812345678',
        );
        $this->assertDifferentBody( 'customer-link', $b1, $b2, 'platform (facebook vs instagram)' );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──
    // Verify all 5 Round 33 endpoint shapes hash uniquely + don't collide

    public function test_round_33_no_collision_via_fixture(): void {
        $body_map = array(
            'maker_product' => array(
                'id'             => 0,
                'mp_maker_id'    => 1,
                'mp_product_sku' => 'X',
                'mp_unit_cost'   => 100.00,
            ),
            'maker' => array(
                'id'         => 0,
                'maker_name' => 'X',
            ),
            'po_undo_submit' => array(
                'po_id'   => 1,
                'user_id' => 1,
            ),
            'distributor_notify' => array(
                'distributor_id' => '1',
                'lead_id'        => 'L1',
                'type'           => 'new_lead',
            ),
            'customer_link' => array(
                'source_id'           => 'fb_1',
                'platform'            => 'facebook',
                'wp_user_id_or_phone' => '0812345678',
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 33', $body_map );
    }

    // ── CROSS-NAMESPACE PAIR GUARD ──
    // maker-product + maker both have `id` field shape. Defense-in-depth: even when admin
    // accidentally reuses the same idempotency key across these 2 endpoints, the schemas differ —
    // maker-product has `mp_maker_id` int + `mp_product_sku` string, maker has `maker_name`
    // string + bank fields. Hash MUST differ.

    public function test_maker_product_vs_maker_no_collision(): void {
        $maker_product_body = array(
            'id'             => 0,
            'mp_maker_id'    => 12,
            'mp_product_sku' => 'DNCSETNX500EX001',
            'mp_unit_cost'   => 1850.00,
        );
        $maker_body = array(
            'id'                 => 0,
            'maker_name'         => 'Happy Tech Pro',
            'maker_credit_limit' => 500000.00,
        );
        $this->assertDifferentBody(
            'maker-product vs maker',
            $maker_product_body,
            $maker_body,
            'schema shape (mp_maker_id+mp_product_sku in maker-product only)'
        );
    }

    // ── CROSS-NAMESPACE MCP PAIR GUARD ──
    // distributor-notify + customer-link both come from OpenClaw chatbot retry flows. Verify
    // their hashes differ even with the same idempotency key (defense-in-depth — MCP sends from
    // single agent process, key collisions theoretically possible).

    public function test_distributor_notify_vs_customer_link_no_collision(): void {
        $notify_body = array(
            'distributor_id' => '4521',
            'lead_id'        => 'LEAD-1',
            'type'           => 'new_lead',
            'phone'          => '0812345678',
        );
        $link_body = array(
            'source_id'           => 'fb_user_1',
            'platform'            => 'facebook',
            'wp_user_id_or_phone' => '0812345678',
        );
        $this->assertDifferentBody(
            'distributor-notify vs customer-link',
            $notify_body,
            $link_body,
            'schema shape (distributor_id/lead_id/type vs source_id/platform/wp_user_id_or_phone)'
        );
    }
}
