<?php
/**
 * SnStateMachineTest — pure-logic test of v2.2 simplified state machine.
 *
 * Source: [System] DINOCO SN REST API V.0.4+ (void/swap/recall/reissue handlers)
 * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §2.2 + §2.7 + App K
 * Phase: 3 W8 (recall + reissue introduced)
 *
 * State machine v2.2 simplified (12 states):
 *   reserved → in_pool ──┬→ allocated_to_order → shipped → registered → claimed → replaced
 *                        │                                       └→ transferred (~5s) → registered
 *                        ├→ voided   (any → terminal)
 *                        └→ recalled (registered+ → terminal)
 *
 * Approval tier matrix (v2.0 §2.7):
 *   - in_pool / reserved      → auto (single-admin)
 *   - allocated / shipped     → auto for swap, single-admin for void
 *   - registered / claimed    → 4-eyes for void/swap/recall (Phase 4 W11+)
 *
 * Recall categories:
 *   defect / safety / stolen / fraud / misship
 *
 * Tests verify:
 *   - Allowed transitions (positive cases)
 *   - Blocked transitions (negative cases)
 *   - Recall blocks in_pool (must use /void instead)
 *   - Reissue requires same SKU (linked_sku match)
 *   - Tier classification (auto vs 4-eyes)
 *   - Recall category whitelist
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Mirror logic from REST handlers ─── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_void_tier' ) ) {
    /**
     * Mirror of dinoco_sn_rest_void tier check.
     * Returns 'auto' | 'requires_approval' | 'already_terminal'.
     */
    function sn_void_tier( string $current_status ): string {
        if ( in_array( $current_status, array( 'voided', 'recalled' ), true ) ) {
            return 'already_terminal';
        }
        if ( in_array( $current_status, array( 'in_pool', 'reserved' ), true ) ) {
            return 'auto';
        }
        return 'requires_approval';
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_swap_tier' ) ) {
    /**
     * Mirror of dinoco_sn_rest_swap tier check on sn_old.status.
     */
    function sn_swap_tier( string $sn_old_status, string $sn_new_status ): string {
        if ( $sn_new_status !== 'in_pool' ) {
            return 'sn_new_not_available';
        }
        $auto_tier = array( 'in_pool', 'allocated_to_order', 'shipped' );
        if ( in_array( $sn_old_status, $auto_tier, true ) ) {
            return 'auto';
        }
        if ( in_array( $sn_old_status, array( 'voided', 'recalled' ), true ) ) {
            return 'sn_old_terminal';
        }
        return 'requires_approval'; // registered/claimed → 4-eyes
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_recall_validate' ) ) {
    /**
     * Mirror of dinoco_sn_rest_recall validation.
     * Returns 'ok' | error code.
     */
    function sn_recall_validate( string $current_status, string $category ): string {
        $allowed_categories = array( 'defect', 'safety', 'stolen', 'fraud', 'misship' );
        if ( ! in_array( $category, $allowed_categories, true ) ) {
            return 'invalid_category';
        }
        if ( in_array( $current_status, array( 'voided', 'recalled' ), true ) ) {
            return 'already_terminal';
        }
        if ( in_array( $current_status, array( 'reserved', 'in_pool' ), true ) ) {
            return 'use_void_instead';
        }
        return 'ok'; // active states (allocated, shipped, registered, claimed) → recall allowed
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_reissue_validate' ) ) {
    /**
     * Mirror of dinoco_sn_rest_reissue validation.
     */
    function sn_reissue_validate( string $sn_old_status, string $sn_new_status, string $sn_old_sku, string $sn_new_sku ): string {
        if ( ! in_array( $sn_old_status, array( 'registered', 'claimed' ), true ) ) {
            return 'sn_old_not_active';
        }
        if ( $sn_new_status !== 'in_pool' ) {
            return 'sn_new_not_available';
        }
        if ( $sn_old_sku !== $sn_new_sku ) {
            return 'sku_mismatch';
        }
        return 'ok';
    }
}

class SnStateMachineTest extends TestCase {

    /* ───── /void tier matrix ───── */

    public function test_void_in_pool_is_auto_tier() {
        $this->assertSame( 'auto', sn_void_tier( 'in_pool' ) );
        $this->assertSame( 'auto', sn_void_tier( 'reserved' ) );
    }

    public function test_void_registered_requires_approval() {
        $this->assertSame( 'requires_approval', sn_void_tier( 'registered' ) );
        $this->assertSame( 'requires_approval', sn_void_tier( 'claimed' ) );
        $this->assertSame( 'requires_approval', sn_void_tier( 'shipped' ) );
        $this->assertSame( 'requires_approval', sn_void_tier( 'allocated_to_order' ) );
    }

    public function test_void_already_voided_returns_terminal() {
        $this->assertSame( 'already_terminal', sn_void_tier( 'voided' ) );
        $this->assertSame( 'already_terminal', sn_void_tier( 'recalled' ) );
    }

    /* ───── /swap tier matrix ───── */

    public function test_swap_in_pool_to_in_pool_is_auto() {
        $this->assertSame( 'auto', sn_swap_tier( 'in_pool', 'in_pool' ) );
        $this->assertSame( 'auto', sn_swap_tier( 'allocated_to_order', 'in_pool' ) );
        $this->assertSame( 'auto', sn_swap_tier( 'shipped', 'in_pool' ) );
    }

    public function test_swap_registered_requires_4eyes() {
        $this->assertSame( 'requires_approval', sn_swap_tier( 'registered', 'in_pool' ) );
        $this->assertSame( 'requires_approval', sn_swap_tier( 'claimed', 'in_pool' ) );
    }

    public function test_swap_sn_new_must_be_in_pool() {
        $this->assertSame( 'sn_new_not_available', sn_swap_tier( 'in_pool', 'shipped' ) );
        $this->assertSame( 'sn_new_not_available', sn_swap_tier( 'shipped', 'voided' ) );
    }

    public function test_swap_sn_old_terminal_blocked() {
        $this->assertSame( 'sn_old_terminal', sn_swap_tier( 'voided', 'in_pool' ) );
        $this->assertSame( 'sn_old_terminal', sn_swap_tier( 'recalled', 'in_pool' ) );
    }

    /* ───── /recall validation ───── */

    public function test_recall_categories_whitelist() {
        foreach ( array( 'defect', 'safety', 'stolen', 'fraud', 'misship' ) as $cat ) {
            $this->assertSame( 'ok', sn_recall_validate( 'registered', $cat ),
                "category $cat should be allowed" );
        }
    }

    public function test_recall_invalid_category_rejected() {
        $this->assertSame( 'invalid_category', sn_recall_validate( 'registered', 'random_word' ) );
        $this->assertSame( 'invalid_category', sn_recall_validate( 'registered', '' ) );
    }

    public function test_recall_in_pool_redirects_to_void() {
        // Plates not yet at customer side should /void, not /recall
        $this->assertSame( 'use_void_instead', sn_recall_validate( 'in_pool', 'defect' ) );
        $this->assertSame( 'use_void_instead', sn_recall_validate( 'reserved', 'defect' ) );
    }

    public function test_recall_active_customer_states_allowed() {
        // Customer-side states can be recalled
        $this->assertSame( 'ok', sn_recall_validate( 'registered', 'defect' ) );
        $this->assertSame( 'ok', sn_recall_validate( 'claimed', 'safety' ) );
        $this->assertSame( 'ok', sn_recall_validate( 'allocated_to_order', 'misship' ) );
        $this->assertSame( 'ok', sn_recall_validate( 'shipped', 'stolen' ) );
    }

    public function test_recall_already_terminal_blocked() {
        $this->assertSame( 'already_terminal', sn_recall_validate( 'voided', 'defect' ) );
        $this->assertSame( 'already_terminal', sn_recall_validate( 'recalled', 'defect' ) );
    }

    /* ───── /reissue validation (M2 plate fell off) ───── */

    public function test_reissue_happy_path() {
        $this->assertSame( 'ok', sn_reissue_validate( 'registered', 'in_pool', 'DNCGND45L002', 'DNCGND45L002' ) );
        $this->assertSame( 'ok', sn_reissue_validate( 'claimed', 'in_pool', 'DNCSETNX500', 'DNCSETNX500' ) );
    }

    public function test_reissue_sn_old_must_be_active() {
        $this->assertSame( 'sn_old_not_active', sn_reissue_validate( 'in_pool', 'in_pool', 'X', 'X' ) );
        $this->assertSame( 'sn_old_not_active', sn_reissue_validate( 'shipped', 'in_pool', 'X', 'X' ) );
        $this->assertSame( 'sn_old_not_active', sn_reissue_validate( 'voided', 'in_pool', 'X', 'X' ) );
    }

    public function test_reissue_sn_new_must_be_in_pool() {
        $this->assertSame( 'sn_new_not_available', sn_reissue_validate( 'registered', 'shipped', 'X', 'X' ) );
        $this->assertSame( 'sn_new_not_available', sn_reissue_validate( 'registered', 'voided', 'X', 'X' ) );
    }

    public function test_reissue_blocks_sku_mismatch() {
        // Critical: customer's warranty must use replacement plate of same SKU
        $this->assertSame(
            'sku_mismatch',
            sn_reissue_validate( 'registered', 'in_pool', 'DNCGND45L002', 'DNCGND45R002' )
        );
        $this->assertSame(
            'sku_mismatch',
            sn_reissue_validate( 'registered', 'in_pool', 'DNCSETNX500', 'DNCSETXL750' )
        );
    }

    /* ───── End-to-end state transition coverage ───── */

    public function test_v22_state_machine_terminal_states() {
        // After v2.2 simplification, terminal states are: voided, recalled, replaced
        $terminal = array( 'voided', 'recalled' );
        foreach ( $terminal as $state ) {
            $this->assertSame( 'already_terminal', sn_void_tier( $state ) );
            $this->assertSame( 'already_terminal', sn_recall_validate( $state, 'defect' ) );
        }
    }

    public function test_v22_state_machine_active_states() {
        // States where customer/admin operations are valid
        $active = array( 'in_pool', 'allocated_to_order', 'shipped', 'registered', 'claimed' );
        foreach ( $active as $state ) {
            // None should be classified as terminal
            $this->assertNotSame( 'already_terminal', sn_void_tier( $state ) );
        }
    }
}
