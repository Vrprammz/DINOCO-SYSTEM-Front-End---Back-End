<?php
/**
 * SnPhotoOcrDecideTest — pure-logic test of Photo OCR validation
 * decision matrix per chatbot-rules.md §15.8.
 *
 * Source: [System] DINOCO SN REST API V.0.15+
 *         dinoco_sn_photo_ocr_decide($plate, $line_uid)
 *
 * The helper is the heart of the photo OCR chatbot flow:
 *   Customer sends photo → Gemini Vision extracts S/N → claim-flow.js
 *   POST /dinoco-sn/v1/photo-ocr/validate → this decide() runs.
 *
 * 7 decision codes:
 *   proceed           — registered + owner match (or no LINE check possible)
 *   not_yet_active    — pre-activate states (reserved/in_pool/legacy)
 *   block_voided      — plate manually voided (NEVER reveal reason)
 *   block_recalled    — plate in defect recall
 *   block_stolen      — owner reported stolen (REG-082 — ห้ามใช้ "ถูกแจ้งหาย")
 *   block_other_owner — different LINE UID claims plate (counterfeit signal)
 *   not_found         — S/N not in sn_pool (fake S/N attempt — REG-084)
 *
 * Tests use the namespaced mirror function from SnFlexBuilderRealTest's
 * eval-load pattern when REST API snippet present, else fall back to a
 * pure-logic mirror defined here.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/**
 * Pure-logic mirror of dinoco_sn_photo_ocr_decide() — kept in sync via
 * Jest drift detector tests/jest/sn-system-drift.test.js which asserts
 * 7 decision codes + REG-082/084 alignment in the snippet.
 */
if ( ! function_exists( __NAMESPACE__ . '\\sn_photo_ocr_decide' ) ) {
    function sn_photo_ocr_decide( ?array $plate, string $line_uid = '', int $caller_uid = 0 ): array {
        // S/N not in system
        if ( ! $plate || empty( $plate['sn'] ) ) {
            return array(
                'decision_code' => 'not_found',
                'status'        => 'unknown',
                'escalate'      => true,
            );
        }

        $status = (string) ( $plate['status'] ?? 'unknown' );

        // Voided / recalled / stolen — block + escalate
        if ( $status === 'voided' ) {
            return array( 'decision_code' => 'block_voided', 'status' => $status, 'escalate' => true );
        }
        if ( $status === 'recalled' ) {
            return array( 'decision_code' => 'block_recalled', 'status' => $status, 'escalate' => true );
        }
        if ( ! empty( $plate['is_stolen'] ) ) {
            return array( 'decision_code' => 'block_stolen', 'status' => $status, 'escalate' => true );
        }

        // Pre-activate states
        if ( in_array( $status, array( 'reserved', 'in_pool', 'reserved_for_legacy', 'shipped_legacy' ), true ) ) {
            return array( 'decision_code' => 'not_yet_active', 'status' => $status, 'escalate' => false );
        }

        // Registered — owner check
        if ( in_array( $status, array( 'registered', 'claimed' ), true ) ) {
            $plate_owner = (int) ( $plate['registered_user_id'] ?? 0 );
            if ( $plate_owner > 0 && $caller_uid > 0 && $caller_uid !== $plate_owner ) {
                return array( 'decision_code' => 'block_other_owner', 'status' => $status, 'escalate' => true );
            }
            return array( 'decision_code' => 'proceed', 'status' => $status, 'escalate' => false );
        }

        // Other states (replaced / transferred / cancelled_batch)
        return array( 'decision_code' => 'not_yet_active', 'status' => $status, 'escalate' => false );
    }
}

class SnPhotoOcrDecideTest extends TestCase {

    /* ─── not_found (S/N not in system — counterfeit signal) ─── */

    public function test_null_plate_returns_not_found(): void {
        $r = sn_photo_ocr_decide( null );
        $this->assertSame( 'not_found', $r['decision_code'] );
        $this->assertTrue( $r['escalate'] );
    }

    public function test_empty_plate_returns_not_found(): void {
        $r = sn_photo_ocr_decide( array() );
        $this->assertSame( 'not_found', $r['decision_code'] );
    }

    public function test_plate_without_sn_returns_not_found(): void {
        $r = sn_photo_ocr_decide( array( 'status' => 'registered' ) );
        $this->assertSame( 'not_found', $r['decision_code'] );
    }

    /* ─── voided — REG-081 anti reason-leak ─── */

    public function test_voided_blocks_with_escalate(): void {
        $r = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'voided' ) );
        $this->assertSame( 'block_voided', $r['decision_code'] );
        $this->assertTrue( $r['escalate'] );
    }

    /* ─── recalled — REG-083 anti recall-confirm ─── */

    public function test_recalled_blocks_with_escalate(): void {
        $r = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'recalled' ) );
        $this->assertSame( 'block_recalled', $r['decision_code'] );
        $this->assertTrue( $r['escalate'] );
    }

    /* ─── stolen — REG-082 anti social-engineering ─── */

    public function test_stolen_flag_blocks_with_escalate(): void {
        $r = sn_photo_ocr_decide( array(
            'sn' => 'X', 'status' => 'registered', 'is_stolen' => true,
        ) );
        $this->assertSame( 'block_stolen', $r['decision_code'] );
        $this->assertTrue( $r['escalate'] );
    }

    /* ─── not_yet_active — pre-registration states ─── */

    public function test_in_pool_status_returns_not_yet_active(): void {
        $r = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'in_pool' ) );
        $this->assertSame( 'not_yet_active', $r['decision_code'] );
        $this->assertFalse( $r['escalate'] );
    }

    public function test_reserved_status_returns_not_yet_active(): void {
        $r = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'reserved' ) );
        $this->assertSame( 'not_yet_active', $r['decision_code'] );
    }

    public function test_legacy_states_return_not_yet_active(): void {
        $r1 = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'reserved_for_legacy' ) );
        $r2 = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'shipped_legacy' ) );
        $this->assertSame( 'not_yet_active', $r1['decision_code'] );
        $this->assertSame( 'not_yet_active', $r2['decision_code'] );
    }

    /* ─── proceed — happy path ─── */

    public function test_registered_no_owner_check_proceeds(): void {
        $r = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'registered' ) );
        $this->assertSame( 'proceed', $r['decision_code'] );
        $this->assertFalse( $r['escalate'] );
    }

    public function test_claimed_status_also_proceeds(): void {
        // Customer already has open claim — flow can continue (read existing)
        $r = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'claimed' ) );
        $this->assertSame( 'proceed', $r['decision_code'] );
    }

    public function test_owner_match_proceeds(): void {
        $plate = array(
            'sn' => 'X', 'status' => 'registered', 'registered_user_id' => 42,
        );
        $r = sn_photo_ocr_decide( $plate, 'Uxxxx', 42 );
        $this->assertSame( 'proceed', $r['decision_code'] );
    }

    public function test_owner_check_skipped_when_no_caller_uid(): void {
        // Defensive: if caller can't resolve LINE UID → skip cross-check,
        // assume valid (no false positive)
        $plate = array(
            'sn' => 'X', 'status' => 'registered', 'registered_user_id' => 42,
        );
        $r = sn_photo_ocr_decide( $plate, 'Uxxxx', 0 );
        $this->assertSame( 'proceed', $r['decision_code'] );
    }

    /* ─── block_other_owner — counterfeit/stolen suspicion ─── */

    public function test_owner_mismatch_blocks_with_escalate(): void {
        $plate = array(
            'sn' => 'X', 'status' => 'registered', 'registered_user_id' => 42,
        );
        $r = sn_photo_ocr_decide( $plate, 'Uxxxx', 99 );
        $this->assertSame( 'block_other_owner', $r['decision_code'] );
        $this->assertTrue( $r['escalate'] );
    }

    public function test_owner_match_with_claimed_also_proceeds(): void {
        // Edge: claimed plate with matching owner — caller is opening
        // additional photos for existing claim
        $plate = array(
            'sn' => 'X', 'status' => 'claimed', 'registered_user_id' => 42,
        );
        $r = sn_photo_ocr_decide( $plate, 'Uxxxx', 42 );
        $this->assertSame( 'proceed', $r['decision_code'] );
    }

    /* ─── Other terminal states ─── */

    public function test_replaced_status_returns_not_yet_active(): void {
        // Replaced plate — old plate doesn't accept claim, customer should
        // use new replacement plate
        $r = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'replaced' ) );
        $this->assertSame( 'not_yet_active', $r['decision_code'] );
        $this->assertFalse( $r['escalate'] );
    }

    public function test_transferred_status_returns_not_yet_active(): void {
        $r = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'transferred' ) );
        $this->assertSame( 'not_yet_active', $r['decision_code'] );
    }

    public function test_cancelled_batch_returns_not_yet_active(): void {
        $r = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'cancelled_batch' ) );
        $this->assertSame( 'not_yet_active', $r['decision_code'] );
    }

    /* ─── Status whitelist completeness ─── */

    public function test_unknown_status_falls_to_not_yet_active(): void {
        // Defensive — unrecognized status (future state) shouldn't proceed
        $r = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'future_state_foo' ) );
        $this->assertSame( 'not_yet_active', $r['decision_code'] );
        $this->assertFalse( $r['escalate'] );
    }

    /* ─── Stolen takes precedence over registered ─── */

    public function test_stolen_overrides_registered_status(): void {
        // is_stolen flag MUST be checked BEFORE registered/claimed routing
        // (REG-082 — never proceed claim flow on stolen plate)
        $plate = array(
            'sn' => 'X', 'status' => 'registered',
            'registered_user_id' => 42, 'is_stolen' => true,
        );
        $r = sn_photo_ocr_decide( $plate, 'Uxxxx', 42 );
        $this->assertSame( 'block_stolen', $r['decision_code'] );
    }

    /* ─── Escalation flags audit ─── */

    public function test_escalation_flags_match_spec(): void {
        // Per chatbot-rules.md §15.8 — these decisions MUST escalate
        $must_escalate = array( 'not_found', 'block_voided', 'block_recalled',
                                'block_stolen', 'block_other_owner' );
        $must_not_escalate = array( 'proceed', 'not_yet_active' );

        // Verify a sample of each
        $r1 = sn_photo_ocr_decide( null );
        $r2 = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'voided' ) );
        $r3 = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'in_pool' ) );
        $r4 = sn_photo_ocr_decide( array( 'sn' => 'X', 'status' => 'registered' ) );

        $this->assertContains( $r1['decision_code'], $must_escalate );
        $this->assertTrue( $r1['escalate'] );

        $this->assertContains( $r2['decision_code'], $must_escalate );
        $this->assertTrue( $r2['escalate'] );

        $this->assertContains( $r3['decision_code'], $must_not_escalate );
        $this->assertFalse( $r3['escalate'] );

        $this->assertContains( $r4['decision_code'], $must_not_escalate );
        $this->assertFalse( $r4['escalate'] );
    }
}
