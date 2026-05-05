<?php
/**
 * SnApprovalTierTest — Phase 2 W5 3-tier approval matrix.
 *
 * Source: [System] DINOCO SN REST API V.0.17+
 * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §2.7
 *
 * 3-tier matrix:
 *   auto         — relink in_pool, void in_pool/reserved, single-plate ops
 *   single_admin — swap pre-activate (shipped/allocated), void allocated, bulk relink
 *   4_eyes       — swap/void registered, recall (any), bulk void > 100
 *
 * SLA windows:
 *   4_eyes urgent = 1h, normal = 24h, low = 72h
 *   single_admin  = 24h always
 *   auto          = 0 (no SLA)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_classify_tier' ) ) {
    /**
     * Mirror of dinoco_sn_classify_approval_tier — pure logic.
     */
    function sn_classify_tier( $action, $current_state, $bulk_count = 1 ): string {
        $action = strtolower( trim( (string) $action ) );
        $current_state = strtolower( trim( (string) $current_state ) );
        $bulk_count = max( 1, (int) $bulk_count );

        if ( in_array( $action, array( 'void', 'recall' ), true ) && $bulk_count > 100 ) {
            return '4_eyes';
        }
        if ( $action === 'recall' ) return '4_eyes';
        if ( $action === 'swap' && in_array( $current_state, array( 'registered', 'claimed' ), true ) ) {
            return '4_eyes';
        }
        if ( $action === 'void' && in_array( $current_state, array( 'registered', 'claimed' ), true ) ) {
            return '4_eyes';
        }
        if ( in_array( $action, array( 'swap', 'void' ), true )
             && in_array( $current_state, array( 'shipped', 'allocated_to_order' ), true ) ) {
            return 'single_admin';
        }
        if ( $action === 'relink' && $current_state === 'registered' && $bulk_count > 1 ) {
            return 'single_admin';
        }
        return 'auto';
    }

    function sn_sla_seconds( $tier, $urgency = 'normal' ): int {
        $urgency = in_array( $urgency, array( 'urgent', 'normal', 'low' ), true ) ? $urgency : 'normal';
        if ( $tier === '4_eyes' ) {
            $map = array( 'urgent' => 3600, 'normal' => 86400, 'low' => 259200 );
            return $map[ $urgency ];
        }
        if ( $tier === 'single_admin' ) return 86400;
        return 0;
    }
}

class SnApprovalTierTest extends TestCase {

    // ─── 4-eyes (high-risk customer-impacting) ──────────────────────────

    public function test_swap_registered_requires_4_eyes() {
        $this->assertSame( '4_eyes', sn_classify_tier( 'swap', 'registered' ) );
    }

    public function test_swap_claimed_requires_4_eyes() {
        $this->assertSame( '4_eyes', sn_classify_tier( 'swap', 'claimed' ) );
    }

    public function test_void_registered_requires_4_eyes() {
        $this->assertSame( '4_eyes', sn_classify_tier( 'void', 'registered' ) );
    }

    public function test_void_claimed_requires_4_eyes() {
        $this->assertSame( '4_eyes', sn_classify_tier( 'void', 'claimed' ) );
    }

    public function test_recall_any_state_requires_4_eyes() {
        $this->assertSame( '4_eyes', sn_classify_tier( 'recall', 'in_pool' ) );
        $this->assertSame( '4_eyes', sn_classify_tier( 'recall', 'registered' ) );
        $this->assertSame( '4_eyes', sn_classify_tier( 'recall', 'shipped' ) );
        $this->assertSame( '4_eyes', sn_classify_tier( 'recall', 'allocated_to_order' ) );
    }

    public function test_bulk_void_over_100_requires_4_eyes() {
        $this->assertSame( '4_eyes', sn_classify_tier( 'void', 'in_pool', 101 ) );
        $this->assertSame( '4_eyes', sn_classify_tier( 'void', 'in_pool', 500 ) );
    }

    public function test_bulk_recall_over_100_requires_4_eyes() {
        $this->assertSame( '4_eyes', sn_classify_tier( 'recall', 'shipped', 200 ) );
    }

    // ─── Single-admin (medium-risk pre-activation) ──────────────────────

    public function test_swap_shipped_requires_single_admin() {
        $this->assertSame( 'single_admin', sn_classify_tier( 'swap', 'shipped' ) );
    }

    public function test_void_shipped_requires_single_admin() {
        $this->assertSame( 'single_admin', sn_classify_tier( 'void', 'shipped' ) );
    }

    public function test_swap_allocated_requires_single_admin() {
        $this->assertSame( 'single_admin', sn_classify_tier( 'swap', 'allocated_to_order' ) );
    }

    public function test_bulk_relink_registered_requires_single_admin() {
        $this->assertSame( 'single_admin', sn_classify_tier( 'relink', 'registered', 50 ) );
    }

    // ─── Auto (low-risk) ────────────────────────────────────────────────

    public function test_relink_in_pool_auto() {
        $this->assertSame( 'auto', sn_classify_tier( 'relink', 'in_pool' ) );
    }

    public function test_void_in_pool_auto() {
        $this->assertSame( 'auto', sn_classify_tier( 'void', 'in_pool' ) );
    }

    public function test_void_reserved_auto() {
        $this->assertSame( 'auto', sn_classify_tier( 'void', 'reserved' ) );
    }

    public function test_single_relink_registered_auto() {
        // Relink registered single plate = auto (1 plate)
        $this->assertSame( 'auto', sn_classify_tier( 'relink', 'registered', 1 ) );
    }

    // ─── Edge cases ─────────────────────────────────────────────────────

    public function test_uppercase_normalize() {
        $this->assertSame( '4_eyes', sn_classify_tier( 'SWAP', 'REGISTERED' ) );
        $this->assertSame( '4_eyes', sn_classify_tier( 'Swap', 'Claimed' ) );
    }

    public function test_unknown_action_defaults_auto() {
        $this->assertSame( 'auto', sn_classify_tier( 'reissue', 'in_pool' ) );
        $this->assertSame( 'auto', sn_classify_tier( 'unknown', 'registered' ) );
    }

    public function test_bulk_count_clamp_minimum_1() {
        $this->assertSame( 'auto', sn_classify_tier( 'void', 'in_pool', 0 ) );
        $this->assertSame( 'auto', sn_classify_tier( 'void', 'in_pool', -10 ) );
    }

    public function test_void_at_100_threshold_not_4_eyes() {
        // Boundary: bulk_count > 100 (not >=)
        $this->assertSame( 'auto', sn_classify_tier( 'void', 'in_pool', 100 ) );
        $this->assertSame( '4_eyes', sn_classify_tier( 'void', 'in_pool', 101 ) );
    }

    // ─── SLA windows ────────────────────────────────────────────────────

    public function test_sla_4eyes_urgent_1_hour() {
        $this->assertSame( 3600, sn_sla_seconds( '4_eyes', 'urgent' ) );
    }

    public function test_sla_4eyes_normal_24_hours() {
        $this->assertSame( 86400, sn_sla_seconds( '4_eyes', 'normal' ) );
    }

    public function test_sla_4eyes_low_72_hours() {
        $this->assertSame( 259200, sn_sla_seconds( '4_eyes', 'low' ) );
    }

    public function test_sla_single_admin_always_24_hours() {
        $this->assertSame( 86400, sn_sla_seconds( 'single_admin', 'urgent' ) );
        $this->assertSame( 86400, sn_sla_seconds( 'single_admin', 'low' ) );
    }

    public function test_sla_auto_zero_no_window() {
        $this->assertSame( 0, sn_sla_seconds( 'auto' ) );
        $this->assertSame( 0, sn_sla_seconds( 'auto', 'urgent' ) );
    }

    public function test_sla_invalid_urgency_defaults_normal() {
        // Invalid urgency for 4_eyes → normal (24h)
        $this->assertSame( 86400, sn_sla_seconds( '4_eyes', 'bogus' ) );
    }
}
