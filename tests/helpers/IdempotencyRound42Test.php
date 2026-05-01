<?php
/**
 * IdempotencyRound42Test — DRY contract tests for Round 42 batch 20 (5 endpoints).
 *
 * Source: Round 42 (2026-04-30) — 🎯🎯🎯 50% MAJOR MILESTONE: 99/196 = 50.5% against
 * Round 30 authoritative census denominator. **First milestone past 50% of POST surface
 * — 24-round sustained Idempotency-Key campaign Rounds 18-42.**
 *
 *   Batch 20 NEW (5 endpoints — invoice + label + auth + lead-note + upload-image):
 *     - POST /b2b/v1/invoice-gen        — Customer/admin LIFF "ดูใบแจ้งหนี้" double-click on
 *                                          slow GD render → 2× expensive PDF generation
 *                                          (b2b_generate_invoice_pages → multi-page PNG ~1-3s)
 *                                          + 2× upload to /wp-content/uploads/b2b-invoices/.
 *                                          Body hash = {ticket_id, gid} — gid from session
 *                                          prevents cross-group cache poisoning. Different
 *                                          ticket_id = 409 (admin opened wrong tab).
 *     - POST /b2b/v1/manual-flash-label — Admin "ดาวน์โหลด Label Manual" double-click on slow
 *                                          Flash API → 2× call to b2b_flash_get_label_pdf →
 *                                          2× Flash /open/v3/orders/printPdf quota burn. Body
 *                                          hash = {pno} globally unique. PDF binary CANNOT
 *                                          replay through cache — wrapper stores lightweight
 *                                          cached_replay marker.
 *     - POST /b2b/v1/auth-group         — LIFF auth init double-fire on slow LINE verify →
 *                                          2× session_token issuance + 2× rate-limit consumption
 *                                          + log spam. Body hash = {group_id, line_uid} — both
 *                                          required for distinct auth identity. Rate-limit
 *                                          increment ALREADY happened so wrapper additionally
 *                                          protects token issuance + downstream side-effects.
 *     - POST /liff-ai/v1/lead/{id}/note — Admin/dealer LIFF "บันทึกหมายเหตุ" double-tap on slow
 *                                          MongoDB → 2× POST to agent proxy /api/leads/{id}/note
 *                                          → 2× note insert into lead.history MongoDB array →
 *                                          duplicate "by" entries UX. Body hash = {lead_id,
 *                                          note, role, actor uid} — actor scoped from JWT.
 *     - POST /dinoco-stock/v1/product/upload-image
 *                                       — Admin "อัพโหลดรูป" double-click on slow upload
 *                                          (5MB image over 4G) → 2× S3/local file write +
 *                                          2× catalog UPDATE + 2× ACF update_field.
 *                                          **Body hash special case** — multipart form upload
 *                                          with binary blob: {sku, filename, size, content_sha1}.
 *                                          **Binary blob EXCLUDED** from hash; content_sha1
 *                                          serves as fingerprint to distinguish "same file vs
 *                                          different file" without storing binary.
 *                                          Pattern-extension: first idempotent endpoint with
 *                                          binary content fingerprint (sha1_file).
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per endpoint
 * (first_call_success / replay_matches / different_field_409) + cumulative no-collision +
 * upload-image binary-fingerprint pattern guard.
 *
 * After Round 42 the breakdown:
 *   - B2F namespace: 21 endpoints (unchanged)
 *   - B2B namespace: 45 endpoints (+3 since Round 41 = 42 → 45 — invoice-gen + manual-flash-label + auth-group)
 *   - Inventory namespace: 17 endpoints (+1 since Round 41 = 16 → 17 — upload-image)
 *   - MCP namespace: 13 endpoints (unchanged)
 *   - LIFF AI namespace: 3 endpoints (+1 since Round 41 = 2 → 3 — lead-note)
 *
 * 🎯🎯🎯 50% MAJOR MILESTONE: 99/196 = 50.5% — past 1/2 of POST surface integrated.
 * 24-round sustained campaign Rounds 18-42. Pattern maturity: 6 patterns observed
 * (single / bulk / bulk-of-targets / state-machine / boolean-discriminator + enum-
 * discriminator + binary-fingerprint NEW R42).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound42Test extends IdempotencyTestFixture {

    // ── BATCH 20: INVOICE-GEN (customer/admin LIFF — single shape) ──

    public function test_invoice_gen_first_call_success(): void {
        // Body shape: {ticket_id, gid}.
        $body = array(
            'ticket_id' => 6266,
            'gid'       => 'Cabc123def456',
        );
        $this->assertFirstCallSuccess( 'invoice-gen', $body );
    }

    public function test_invoice_gen_replay_matches(): void {
        // Replay safety: customer LIFF "ดูใบแจ้งหนี้" double-click on slow GD render →
        // 2× PDF generation + 2× upload to /wp-content/uploads/b2b-invoices/.
        $body = array(
            'ticket_id' => 6266,
            'gid'       => 'Cabc123def456',
        );
        $this->assertReplayMatches( 'invoice-gen', $body );
    }

    public function test_invoice_gen_different_ticket_409(): void {
        // CRITICAL: admin opened wrong tab — ticket_id=6266 vs 6267 are different invoices.
        // Different ticket → 409 prevents wrong invoice URL stuck via cached replay.
        $b1 = array(
            'ticket_id' => 6266,
            'gid'       => 'Cabc123def456',
        );
        $b2 = array(
            'ticket_id' => 6267,  // DIFFERENT INVOICE
            'gid'       => 'Cabc123def456',
        );
        $this->assertDifferentBody(
            'invoice-gen',
            $b1, $b2,
            'ticket_id (6266 vs 6267 — different invoice, stale tab guard)'
        );
    }

    // ── BATCH 20: MANUAL-FLASH-LABEL (admin Flash quota — single shape) ──

    public function test_manual_flash_label_first_call_success(): void {
        // Body shape: {pno}.
        $body = array( 'pno' => 'TH202604300012345' );
        $this->assertFirstCallSuccess( 'manual-flash-label', $body );
    }

    public function test_manual_flash_label_replay_matches(): void {
        // Replay safety: admin "ดาวน์โหลด Label" double-click on slow Flash API → 2× quota burn.
        $body = array( 'pno' => 'TH202604300012345' );
        $this->assertReplayMatches( 'manual-flash-label', $body );
    }

    public function test_manual_flash_label_different_pno_409(): void {
        // CRITICAL: admin retried with stale tab — different PNO. 409 prevents wrong label.
        $b1 = array( 'pno' => 'TH202604300012345' );
        $b2 = array( 'pno' => 'TH202604300012346' );  // DIFFERENT PARCEL
        $this->assertDifferentBody(
            'manual-flash-label',
            $b1, $b2,
            'pno (TH...12345 vs TH...12346 — different parcel, stale tab guard)'
        );
    }

    // ── BATCH 20: AUTH-GROUP (LIFF init — single shape) ──

    public function test_auth_group_first_call_success(): void {
        // Body shape: {group_id, line_uid}.
        $body = array(
            'group_id' => 'Cabc123def456',
            'line_uid' => 'Uxyz789abc012',
        );
        $this->assertFirstCallSuccess( 'auth-group', $body );
    }

    public function test_auth_group_replay_matches(): void {
        // Replay safety: LIFF init double-fire on slow LINE verify → 2× token + log spam.
        $body = array(
            'group_id' => 'Cabc123def456',
            'line_uid' => 'Uxyz789abc012',
        );
        $this->assertReplayMatches( 'auth-group', $body );
    }

    public function test_auth_group_different_uid_409(): void {
        // CRITICAL: different line_uid = different identity. 409 prevents wrong user token cache.
        $b1 = array(
            'group_id' => 'Cabc123def456',
            'line_uid' => 'Uxyz789abc012',
        );
        $b2 = array(
            'group_id' => 'Cabc123def456',
            'line_uid' => 'Uother999fff111',  // DIFFERENT USER
        );
        $this->assertDifferentBody(
            'auth-group',
            $b1, $b2,
            'line_uid (different LINE user — must mint fresh token, no cache reuse)'
        );
    }

    // ── BATCH 20: LIFF AI LEAD-NOTE (admin/dealer note — single shape) ──

    public function test_lead_note_first_call_success(): void {
        // Body shape: {lead_id, note, role, actor uid}.
        $body = array(
            'lead_id' => '6abc123def4567890abcdef0',
            'note'    => 'ลูกค้าโอนเงินแล้ว รอจัดส่ง',
            'role'    => 'admin',
            'uid'     => 'admin_uid_abc',
        );
        $this->assertFirstCallSuccess( 'lead-note', $body );
    }

    public function test_lead_note_replay_matches(): void {
        // Replay safety: admin "บันทึกหมายเหตุ" double-tap on slow MongoDB → 2× note insert
        // → user sees duplicate "by" entries.
        $body = array(
            'lead_id' => '6abc123def4567890abcdef0',
            'note'    => 'ลูกค้าโอนเงินแล้ว รอจัดส่ง',
            'role'    => 'admin',
            'uid'     => 'admin_uid_abc',
        );
        $this->assertReplayMatches( 'lead-note', $body );
    }

    public function test_lead_note_different_text_409(): void {
        // CRITICAL: admin re-typed note mid-retry. Different text → 409 prevents wrong note
        // (admin corrected typo or added detail — should NOT be cached as old version).
        $b1 = array(
            'lead_id' => '6abc123def4567890abcdef0',
            'note'    => 'ลูกค้าโอนเงินแล้ว',
            'role'    => 'admin',
            'uid'     => 'admin_uid_abc',
        );
        $b2 = array(
            'lead_id' => '6abc123def4567890abcdef0',
            'note'    => 'ลูกค้าโอนเงินแล้ว รอจัดส่ง',  // ADMIN ADDED DETAIL
            'role'    => 'admin',
            'uid'     => 'admin_uid_abc',
        );
        $this->assertDifferentBody(
            'lead-note',
            $b1, $b2,
            'note text (admin re-typed/added detail mid-retry, integrity guard)'
        );
    }

    // ── BATCH 20: UPLOAD-IMAGE (Inventory binary — fingerprint pattern NEW) ──

    public function test_upload_image_first_call_success(): void {
        // Body shape: {sku, filename, size, content_sha1}.
        // **Binary blob EXCLUDED** from hash — content_sha1 serves as fingerprint.
        $body = array(
            'sku'          => 'DNCSETNX500',
            'filename'     => 'product-front.jpg',
            'size'         => 524288,  // 512KB
            'content_sha1' => 'a1b2c3d4e5f6789012345678901234567890abcd',
        );
        $this->assertFirstCallSuccess( 'upload-image', $body );
    }

    public function test_upload_image_replay_matches(): void {
        // Replay safety: admin "อัพโหลดรูป" double-click on slow upload (5MB image over 4G) →
        // 2× S3/local file write + 2× catalog UPDATE.
        $body = array(
            'sku'          => 'DNCSETNX500',
            'filename'     => 'product-front.jpg',
            'size'         => 524288,
            'content_sha1' => 'a1b2c3d4e5f6789012345678901234567890abcd',
        );
        $this->assertReplayMatches( 'upload-image', $body );
    }

    public function test_upload_image_different_content_409(): void {
        // CRITICAL: admin selected wrong file mid-retry. Same SKU + same filename + same size
        // BUT different content (admin re-saved/edited image) → content_sha1 DIFFERENT →
        // 409 prevents wrong image stuck on SKU. Pattern-extension: first idempotent endpoint
        // with binary content fingerprint.
        $b1 = array(
            'sku'          => 'DNCSETNX500',
            'filename'     => 'product-front.jpg',
            'size'         => 524288,
            'content_sha1' => 'a1b2c3d4e5f6789012345678901234567890abcd',
        );
        $b2 = array(
            'sku'          => 'DNCSETNX500',
            'filename'     => 'product-front.jpg',
            'size'         => 524288,
            'content_sha1' => 'b2c3d4e5f6789012345678901234567890abcde1',  // DIFFERENT CONTENT
        );
        $this->assertDifferentBody(
            'upload-image',
            $b1, $b2,
            'content_sha1 (admin re-saved/edited image — fingerprint catches binary change without storing 5MB)'
        );
    }

    // ── BINARY-FINGERPRINT PATTERN GUARD (Round 42 NEW) ──
    // upload-image is the FIRST idempotent endpoint with binary content fingerprint.
    // Documents the deliberate pattern: SHA1(file_content) included as field;
    // raw binary EXCLUDED from body hash (5MB raw bytes would explode idempotency_keys table).
    // Same SHA1 = same intent = idempotent replay. Different SHA1 = different file = 409.
    public function test_upload_image_binary_fingerprint_pattern(): void {
        // Same content_sha1 with different filename SHOULD produce different hash —
        // because filename IS in the body (admin renamed file mid-retry — different intent).
        $b_named1 = array(
            'sku'          => 'DNCSETNX500',
            'filename'     => 'product-front.jpg',
            'size'         => 524288,
            'content_sha1' => 'a1b2c3d4e5f6789012345678901234567890abcd',
        );
        $b_named2 = array(
            'sku'          => 'DNCSETNX500',
            'filename'     => 'front-photo-v2.jpg',  // RENAMED — different intent
            'size'         => 524288,
            'content_sha1' => 'a1b2c3d4e5f6789012345678901234567890abcd',  // same content
        );
        $h1 = dinoco_idempotency_hash( $b_named1 );
        $h2 = dinoco_idempotency_hash( $b_named2 );
        $this->assertNotSame(
            $h1, $h2,
            'upload-image binary-fingerprint pattern: filename change mid-retry MUST produce different hash (admin intent differs even when file content matches)'
        );

        // Same everything except sha1 = different file → different hash (content fingerprint works).
        $b_content2 = $b_named1;
        $b_content2['content_sha1'] = '0000000000000000000000000000000000000000';
        $h3 = dinoco_idempotency_hash( $b_content2 );
        $this->assertNotSame(
            $h1, $h3,
            'upload-image binary-fingerprint pattern: SHA1 change MUST produce different hash (content fingerprint catches binary change without storing 5MB)'
        );
    }

    // ── CUMULATIVE NO-COLLISION (round-level) ──

    public function test_round_42_no_collision_via_fixture(): void {
        $body_map = array(
            'invoice_gen' => array(
                'ticket_id' => 6266,
                'gid'       => 'Cabc123def456',
            ),
            'manual_flash_label' => array( 'pno' => 'TH202604300012345' ),
            'auth_group' => array(
                'group_id' => 'Cabc123def456',
                'line_uid' => 'Uxyz789abc012',
            ),
            'lead_note' => array(
                'lead_id' => '6abc123def4567890abcdef0',
                'note'    => 'ลูกค้าโอนเงินแล้ว รอจัดส่ง',
                'role'    => 'admin',
                'uid'     => 'admin_uid_abc',
            ),
            'upload_image' => array(
                'sku'          => 'DNCSETNX500',
                'filename'     => 'product-front.jpg',
                'size'         => 524288,
                'content_sha1' => 'a1b2c3d4e5f6789012345678901234567890abcd',
            ),
        );
        $this->assertNoCollisionsInRound( 'Round 42 — 🎯🎯🎯 50% MAJOR MILESTONE', $body_map );
    }
}
