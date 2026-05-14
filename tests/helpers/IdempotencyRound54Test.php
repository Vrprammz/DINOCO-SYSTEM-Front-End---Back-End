<?php
/**
 * IdempotencyRound54Test — DRY contract tests for Round 54 batch 32 (4 endpoints).
 *
 * Source: Round 54 (2026-05-14) — 🎯 **80% MAJOR MILESTONE REACHED** (157/196 = 80.1%).
 *
 *   Batch 32 NEW (4 endpoints — Manual Invoice slip + destructive cluster closure):
 *     - POST /b2b/v1/invoice/verify-slip            — CRITICAL Slip2Go quota burn + record_payment
 *                                                     cascade. Body {id, slip_url, actor_user_id}.
 *     - POST /b2b/v1/invoice/verify-slip-combined   — CRITICAL Slip2Go + cross-invoice auto-match.
 *                                                     Body {slip_url, dist_id, invoice_ids[] sorted,
 *                                                     actor_user_id}.
 *     - POST /b2b/v1/invoice/upload-slip            — binary-fingerprint pattern 2nd instance after
 *                                                     R42 upload-image. Body {id, image_sha1,
 *                                                     actor_user_id}.
 *     - POST /b2b/v1/invoice/delete                 — destructive admin op audit-row spam guard.
 *                                                     Body {id, actor_user_id}.
 *
 * Pattern: extends IdempotencyTestFixture (Round 29 DRY base class). 3 cases per endpoint
 * (first_call_success / replay_matches / different_field_409) + invoice_ids[] order-stable
 * sort assertion + image_sha1 EXCLUDE-raw-image bytes assertion.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class IdempotencyRound54Test extends IdempotencyTestFixture {

    // ── BATCH 32: INVOICE/VERIFY-SLIP (CRITICAL Slip2Go quota burn) ──

    public function test_verify_slip_first_call_success(): void {
        $body = array(
            'id'            => 1234,
            'slip_url'      => 'https://line.example/slip-abc.jpg',
            'actor_user_id' => 7,
        );
        $this->assertFirstCallSuccess( 'invoice/verify-slip', $body );
    }

    public function test_verify_slip_replay_matches(): void {
        $body = array(
            'id'            => 1234,
            'slip_url'      => 'https://line.example/slip-abc.jpg',
            'actor_user_id' => 7,
        );
        $this->assertReplayMatches( 'invoice/verify-slip', $body );
    }

    public function test_verify_slip_different_url_409(): void {
        $b1 = array( 'id' => 1234, 'slip_url' => 'https://x/a.jpg', 'actor_user_id' => 7 );
        $b2 = array( 'id' => 1234, 'slip_url' => 'https://x/b.jpg', 'actor_user_id' => 7 );
        $this->assertDifferentBody( 'invoice/verify-slip', $b1, $b2, 'slip_url' );
    }

    // ── BATCH 32: INVOICE/VERIFY-SLIP-COMBINED (Slip2Go + auto-match) ──

    public function test_verify_slip_combined_first_call_success(): void {
        $body = array(
            'slip_url'      => 'https://line.example/slip-xyz.jpg',
            'dist_id'       => 4521,
            'invoice_ids'   => array( 101, 102, 103 ),
            'actor_user_id' => 7,
        );
        $this->assertFirstCallSuccess( 'invoice/verify-slip-combined', $body );
    }

    public function test_verify_slip_combined_replay_matches(): void {
        $body = array(
            'slip_url'      => 'https://line.example/slip-xyz.jpg',
            'dist_id'       => 4521,
            'invoice_ids'   => array( 101, 102, 103 ),
            'actor_user_id' => 7,
        );
        $this->assertReplayMatches( 'invoice/verify-slip-combined', $body );
    }

    public function test_verify_slip_combined_different_dist_409(): void {
        $b1 = array(
            'slip_url'      => 'https://x/a.jpg',
            'dist_id'       => 4521,
            'invoice_ids'   => array( 101 ),
            'actor_user_id' => 7,
        );
        $b2 = array(
            'slip_url'      => 'https://x/a.jpg',
            'dist_id'       => 9999,
            'invoice_ids'   => array( 101 ),
            'actor_user_id' => 7,
        );
        $this->assertDifferentBody( 'invoice/verify-slip-combined', $b1, $b2, 'dist_id' );
    }

    public function test_verify_slip_combined_invoice_ids_order_stable(): void {
        // Critical contract: invoice_ids[] in different order MUST produce same hash after
        // canonical sort (admin reselects with different click order = same intent).
        $invoice_ids_1 = array( 103, 101, 102 );
        $invoice_ids_2 = array( 101, 102, 103 );
        sort( $invoice_ids_1, SORT_NUMERIC );
        sort( $invoice_ids_2, SORT_NUMERIC );
        $b1 = array( 'slip_url' => 'u', 'dist_id' => 1, 'invoice_ids' => $invoice_ids_1, 'actor_user_id' => 7 );
        $b2 = array( 'slip_url' => 'u', 'dist_id' => 1, 'invoice_ids' => $invoice_ids_2, 'actor_user_id' => 7 );
        $this->assertReplayMatches( 'invoice/verify-slip-combined (sorted invoice_ids)', $b1 );
        $this->assertSame(
            dinoco_idempotency_hash( $b1 ),
            dinoco_idempotency_hash( $b2 ),
            'invoice_ids[] sorted produces order-stable hash regardless of admin click order'
        );
    }

    // ── BATCH 32: INVOICE/UPLOAD-SLIP (binary-fingerprint pattern 2nd instance) ──

    public function test_upload_slip_first_call_success(): void {
        $image_base64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
        $body = array(
            'id'            => 1234,
            'image_sha1'    => sha1( $image_base64 ),
            'actor_user_id' => 7,
        );
        $this->assertFirstCallSuccess( 'invoice/upload-slip', $body );
    }

    public function test_upload_slip_replay_matches(): void {
        $image_base64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
        $body = array(
            'id'            => 1234,
            'image_sha1'    => sha1( $image_base64 ),
            'actor_user_id' => 7,
        );
        $this->assertReplayMatches( 'invoice/upload-slip', $body );
    }

    public function test_upload_slip_different_image_409(): void {
        $b1 = array(
            'id'            => 1234,
            'image_sha1'    => sha1( 'data:image/jpeg;base64,/9j/AAAA==' ),
            'actor_user_id' => 7,
        );
        $b2 = array(
            'id'            => 1234,
            'image_sha1'    => sha1( 'data:image/jpeg;base64,/9j/BBBB==' ),
            'actor_user_id' => 7,
        );
        $this->assertDifferentBody( 'invoice/upload-slip', $b1, $b2, 'image_sha1' );
    }

    public function test_upload_slip_excludes_raw_image_bytes(): void {
        // Contract: image_sha1 fingerprint is in hash; raw image_base64 bytes are NOT.
        // Mirrors R29 combined-slip-upload + R42 upload-image — prevents 100KB+ payload
        // bloating idempotency_keys.response_data column on every retry-prone admin upload.
        $body_with_sha = array(
            'id'            => 1234,
            'image_sha1'    => sha1( 'huge_base64_payload' ),
            'actor_user_id' => 7,
        );
        $body_with_raw = array(
            'id'            => 1234,
            'image_base64'  => 'huge_base64_payload',
            'actor_user_id' => 7,
        );
        $this->assertDifferentBody(
            'invoice/upload-slip (sha vs raw)',
            $body_with_sha,
            $body_with_raw,
            'image_sha1 (sha-only) vs image_base64 (raw bytes) — wrapper MUST use sha pattern'
        );
    }

    // ── BATCH 32: INVOICE/DELETE (destructive admin double-click guard) ──

    public function test_delete_first_call_success(): void {
        $body = array(
            'id'            => 1234,
            'actor_user_id' => 7,
        );
        $this->assertFirstCallSuccess( 'invoice/delete', $body );
    }

    public function test_delete_replay_matches(): void {
        $body = array(
            'id'            => 1234,
            'actor_user_id' => 7,
        );
        $this->assertReplayMatches( 'invoice/delete', $body );
    }

    public function test_delete_different_id_409(): void {
        // Same idempotency key reused across invoices = different intent. Wrapper MUST 409 —
        // silent replay would delete wrong invoice (data integrity violation).
        $b1 = array( 'id' => 1234, 'actor_user_id' => 7 );
        $b2 = array( 'id' => 9999, 'actor_user_id' => 7 );
        $this->assertDifferentBody( 'invoice/delete', $b1, $b2, 'id (1234 vs 9999)' );
    }

    // ── CUMULATIVE NO-COLLISION GUARD ──

    public function test_round_54_no_cross_endpoint_collision(): void {
        $h_verify   = dinoco_idempotency_hash( array( 'id' => 1, 'slip_url' => 'u', 'actor_user_id' => 7 ) );
        $h_combined = dinoco_idempotency_hash( array( 'slip_url' => 'u', 'dist_id' => 1, 'invoice_ids' => array( 1 ), 'actor_user_id' => 7 ) );
        $h_upload   = dinoco_idempotency_hash( array( 'id' => 1, 'image_sha1' => sha1( 'x' ), 'actor_user_id' => 7 ) );
        $h_delete   = dinoco_idempotency_hash( array( 'id' => 1, 'actor_user_id' => 7 ) );
        $all = array( $h_verify, $h_combined, $h_upload, $h_delete );
        $this->assertCount(
            count( array_unique( $all ) ), $all,
            'Round 54: 4 endpoint body shapes MUST produce 4 distinct hashes (no collisions)'
        );
    }
}
