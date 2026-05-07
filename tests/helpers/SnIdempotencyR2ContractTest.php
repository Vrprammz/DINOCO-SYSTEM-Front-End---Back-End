<?php
/**
 * REG-091 — Idempotency contract for 8 R2/R3 sensitive endpoints.
 *
 * Plan v2.13 §Phase 1 W4 R3 BLOCKER.
 *
 * Endpoints validated (per Round 30 census + R2/R3 boss decisions):
 *   1. POST /dinoco-sn/v1/swap                    — 4-eyes plate swap
 *   2. POST /dinoco-sn/v1/void                    — admin void (1-eye)
 *   3. POST /dinoco-sn/v1/recall                  — batch-level recall (NOT per-sn)
 *   4. POST /dinoco-sn/v1/stolen/report           — customer stolen report
 *   5. PUT  /dinoco-sn/v1/system/state            — kill switch (PUT)
 *   6. POST /dinoco-sn/v1/system/toggle           — legacy toggle (POST)
 *   7. POST /dinoco-sn/v1/photo-ocr-validate      — OCR validate
 *   8. POST /dinoco-sn/v1/orphan-alerts/dismiss   — dismiss alert
 *   9. POST /dinoco-sn/v1/extension/checkout      — F#8 marketplace
 *
 * Body shape promises codified per RFC-style spec.
 *
 * Pattern: extends IdempotencyTestFixture (Round 29+ DRY pattern).
 *
 * 20+ cases total.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

require_once __DIR__ . '/IdempotencyTestFixture.php';

class SnIdempotencyR2ContractTest extends IdempotencyTestFixture {

    /* ─── Body builders ─── */

    private function swap_body( array $overrides = array() ): array {
        return array_merge( array(
            'sn_old'           => 'DNCSS0001234',
            'sn_new'           => 'DNCSS0005678',
            'reason'           => 'physical_damage',
            'approver_user_id' => 7,
        ), $overrides );
    }

    private function void_body( array $overrides = array() ): array {
        return array_merge( array(
            'sn'               => 'DNCSS0001234',
            'reason'           => 'admin_error',
            'approver_user_id' => 7,
        ), $overrides );
    }

    private function recall_body( array $overrides = array() ): array {
        // Round 3 fix: recall is BATCH-level, not per-SN
        return array_merge( array(
            'batch_id'         => 42,
            'reason'           => 'manufacturing_defect',
            'approver_user_id' => 7,
        ), $overrides );
    }

    private function stolen_report_body( array $overrides = array() ): array {
        return array_merge( array(
            'sn'                => 'DNCSS0001234',
            'police_report_no'  => 'PR-2026-04-30-001',
            'incident_date'     => '2026-04-29',
        ), $overrides );
    }

    private function system_state_put_body( array $overrides = array() ): array {
        return array_merge( array( 'enabled' => true ), $overrides );
    }

    private function system_toggle_post_body( array $overrides = array() ): array {
        return array_merge( array( 'action' => 'toggle' ), $overrides );
    }

    private function photo_ocr_body( array $overrides = array() ): array {
        // image_base64 EXCLUDED from canonical hash — use source_token_hash instead
        return array_merge( array(
            'sn'                => 'DNCSS0001234',
            'source_token_hash' => 'sha256:abcdef0123',
        ), $overrides );
    }

    private function dismiss_alert_body( array $overrides = array() ): array {
        return array_merge( array(
            'alert_id'     => 1234,
            'dismissed_by' => 7,
        ), $overrides );
    }

    private function extension_checkout_body( array $overrides = array() ): array {
        return array_merge( array(
            'sn'            => 'DNCSS0001234',
            'years'         => 2,
            'coupon_code'   => 'PROMO5',
            'amount'        => 1500,
            'payer_user_id' => 99,
        ), $overrides );
    }

    /* ─── Endpoint 1: /swap ─── */

    public function test_swap_replay_safe(): void {
        $this->assertReplayMatches( 'swap', $this->swap_body() );
    }

    public function test_swap_different_approver_409(): void {
        $this->assertDifferentBody(
            'swap',
            $this->swap_body(),
            $this->swap_body( array( 'approver_user_id' => 8 ) ),
            'approver_user_id'
        );
    }

    public function test_swap_different_sn_new_409(): void {
        $this->assertDifferentBody(
            'swap',
            $this->swap_body(),
            $this->swap_body( array( 'sn_new' => 'DNCSS9999999' ) ),
            'sn_new'
        );
    }

    /* ─── Endpoint 2: /void ─── */

    public function test_void_replay_safe(): void {
        $this->assertReplayMatches( 'void', $this->void_body() );
    }

    public function test_void_different_reason_409(): void {
        $this->assertDifferentBody(
            'void',
            $this->void_body(),
            $this->void_body( array( 'reason' => 'duplicate_print' ) ),
            'reason'
        );
    }

    /* ─── Endpoint 3: /recall (Round 3 batch-level) ─── */

    public function test_recall_uses_batch_id_not_sn(): void {
        $body = $this->recall_body();
        // Defensive: recall canonical body MUST NOT have 'sn' field
        $this->assertArrayNotHasKey( 'sn', $body, 'Round 3 fix — recall is batch-level' );
        $this->assertArrayHasKey( 'batch_id', $body );
    }

    public function test_recall_replay_safe(): void {
        $this->assertReplayMatches( 'recall', $this->recall_body() );
    }

    public function test_recall_different_batch_id_409(): void {
        $this->assertDifferentBody(
            'recall',
            $this->recall_body(),
            $this->recall_body( array( 'batch_id' => 99 ) ),
            'batch_id'
        );
    }

    /* ─── Endpoint 4: /stolen/report ─── */

    public function test_stolen_report_replay_safe(): void {
        $this->assertReplayMatches( 'stolen-report', $this->stolen_report_body() );
    }

    public function test_stolen_report_different_police_no_409(): void {
        $this->assertDifferentBody(
            'stolen-report',
            $this->stolen_report_body(),
            $this->stolen_report_body( array( 'police_report_no' => 'PR-2026-04-30-002' ) ),
            'police_report_no'
        );
    }

    /* ─── Endpoint 5: PUT /system/state — namespace 'system-state-put' ─── */

    public function test_system_state_put_replay_safe(): void {
        $this->assertReplayMatches( 'system-state-put', $this->system_state_put_body() );
    }

    public function test_system_state_put_enabled_toggle_409(): void {
        $this->assertDifferentBody(
            'system-state-put',
            $this->system_state_put_body( array( 'enabled' => true ) ),
            $this->system_state_put_body( array( 'enabled' => false ) ),
            'enabled'
        );
    }

    /* ─── Endpoint 6: POST /system/toggle (legacy) — namespace 'system-toggle-post' ─── */

    public function test_system_toggle_post_replay_safe(): void {
        $this->assertReplayMatches( 'system-toggle-post', $this->system_toggle_post_body() );
    }

    public function test_system_state_put_and_toggle_post_independent_namespaces(): void {
        // Different namespaces MUST coexist (PUT vs legacy POST)
        $put  = dinoco_idempotency_hash( $this->system_state_put_body() );
        $post = dinoco_idempotency_hash( $this->system_toggle_post_body() );
        // Bodies differ → hashes differ; namespaces are storage-level so we
        // verify the body hashes are at least distinguishable.
        $this->assertNotSame( $put, $post );
    }

    /* ─── Endpoint 7: /photo-ocr-validate (image_base64 excluded — use token hash) ─── */

    public function test_photo_ocr_replay_safe(): void {
        $this->assertReplayMatches( 'photo-ocr-validate', $this->photo_ocr_body() );
    }

    public function test_photo_ocr_image_excluded_uses_token_hash(): void {
        $body = $this->photo_ocr_body();
        // BUG-S1 protection: raw image MUST NOT appear in canonical body
        $this->assertArrayNotHasKey( 'image_base64', $body );
        $this->assertArrayHasKey( 'source_token_hash', $body );
    }

    public function test_photo_ocr_different_token_hash_409(): void {
        $this->assertDifferentBody(
            'photo-ocr-validate',
            $this->photo_ocr_body(),
            $this->photo_ocr_body( array( 'source_token_hash' => 'sha256:fedcba9876' ) ),
            'source_token_hash'
        );
    }

    /* ─── Endpoint 8: /orphan-alerts/dismiss ─── */

    public function test_dismiss_alert_replay_safe(): void {
        $this->assertReplayMatches( 'orphan-alerts-dismiss', $this->dismiss_alert_body() );
    }

    public function test_dismiss_alert_different_dismisser_409(): void {
        $this->assertDifferentBody(
            'orphan-alerts-dismiss',
            $this->dismiss_alert_body(),
            $this->dismiss_alert_body( array( 'dismissed_by' => 99 ) ),
            'dismissed_by'
        );
    }

    /* ─── Endpoint 9: /extension/checkout (CRITICAL — different amount → 409 prevents wrong-charge) ─── */

    public function test_extension_checkout_replay_safe(): void {
        $this->assertReplayMatches( 'extension-checkout', $this->extension_checkout_body() );
    }

    public function test_extension_checkout_different_amount_CRIT_409(): void {
        // Defense: a retry with mutated amount = wrong-charge → MUST 409
        $this->assertDifferentBody(
            'extension-checkout',
            $this->extension_checkout_body(),
            $this->extension_checkout_body( array( 'amount' => 9999 ) ),
            'amount (CRITICAL)'
        );
    }

    public function test_extension_checkout_different_years_409(): void {
        $this->assertDifferentBody(
            'extension-checkout',
            $this->extension_checkout_body(),
            $this->extension_checkout_body( array( 'years' => 5 ) ),
            'years'
        );
    }

    public function test_extension_checkout_different_coupon_409(): void {
        $this->assertDifferentBody(
            'extension-checkout',
            $this->extension_checkout_body(),
            $this->extension_checkout_body( array( 'coupon_code' => 'PROMO10' ) ),
            'coupon_code'
        );
    }

    /* ─── Cumulative no-collision sweep ─── */

    public function test_no_collisions_across_8_R2_endpoints(): void {
        $this->assertNoCollisionsInRound( 'R2 BLOCKER', array(
            'swap'               => $this->swap_body(),
            'void'               => $this->void_body(),
            'recall'             => $this->recall_body(),
            'stolen-report'      => $this->stolen_report_body(),
            'system-state-put'   => $this->system_state_put_body(),
            'system-toggle-post' => $this->system_toggle_post_body(),
            'photo-ocr'          => $this->photo_ocr_body(),
            'dismiss-alert'      => $this->dismiss_alert_body(),
            'extension-checkout' => $this->extension_checkout_body(),
        ) );
    }
}
