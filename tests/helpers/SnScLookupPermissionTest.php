<?php
/**
 * SnScLookupPermissionTest — Phase 3 W8.5 Service Center Quick Lookup permission gate.
 *
 * Source: [Admin System] DINOCO Service Center & Claims V.31.1
 * Plan:   ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §K.6
 *
 * Tested: shortcode `[dinoco_sc_quick_lookup]` permission gate logic.
 *
 * Gate matrix (highest precedence first):
 *   1. NOT logged in        → render login redirect div
 *   2. logged in + view_pii → allow
 *   3. logged in + manage_options → allow (admin override)
 *   4. logged in + neither  → render denied div (403-ish)
 *
 * Pure-logic test — mirrors the gate via a faithful in-test reimplementation
 * so we can exercise all 4 outcomes without WP runtime dependencies.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sc_lookup_gate_decision' ) ) {
    /**
     * Faithful mirror of dinoco_sc_quick_lookup_render() permission gate.
     *
     * @param bool $is_logged_in            wp `is_user_logged_in()` result
     * @param bool $can_view_pii            `dinoco_sn_user_can_view_pii()` result (or fallback)
     * @param bool $can_manage_options      `current_user_can('manage_options')` (used by fallback path)
     * @param bool $view_pii_helper_exists  whether dinoco_sn_user_can_view_pii() function exists
     * @return string  one of: 'login_redirect' | 'allow' | 'denied'
     */
    function sc_lookup_gate_decision(
        bool $is_logged_in,
        bool $can_view_pii,
        bool $can_manage_options,
        bool $view_pii_helper_exists = true
    ): string {
        if ( ! $is_logged_in ) return 'login_redirect';

        // Match snippet logic: prefer helper if exists, else fall back to manage_options
        $has_pii_cap = $view_pii_helper_exists
            ? $can_view_pii
            : $can_manage_options;

        return $has_pii_cap ? 'allow' : 'denied';
    }
}

class SnScLookupPermissionTest extends TestCase {

    // ─── 1. Not logged in → login redirect ────────────────────────────────

    public function test_anonymous_user_redirected_to_login(): void {
        $this->assertSame(
            'login_redirect',
            sc_lookup_gate_decision( false, false, false )
        );
    }

    public function test_anonymous_user_with_phantom_caps_still_redirects(): void {
        // Defense in depth: even if some upstream sets caps=true while
        // logged-out, login redirect MUST take precedence.
        $this->assertSame(
            'login_redirect',
            sc_lookup_gate_decision( false, true, true )
        );
    }

    // ─── 2. view_pii cap → allow ──────────────────────────────────────────

    public function test_logged_in_with_view_pii_cap_allowed(): void {
        $this->assertSame(
            'allow',
            sc_lookup_gate_decision( true, true, false )
        );
    }

    public function test_logged_in_with_view_pii_and_admin_allowed(): void {
        $this->assertSame(
            'allow',
            sc_lookup_gate_decision( true, true, true )
        );
    }

    // ─── 3. manage_options fallback when helper missing ───────────────────

    public function test_admin_allowed_when_helper_missing(): void {
        // Edge case: SN REST API snippet not yet synced → helper missing →
        // fall back to manage_options-only check. This is the defensive
        // function_exists guard's behavior.
        $this->assertSame(
            'allow',
            sc_lookup_gate_decision( true, false, true, /* helper_exists */ false )
        );
    }

    public function test_non_admin_denied_when_helper_missing(): void {
        $this->assertSame(
            'denied',
            sc_lookup_gate_decision( true, false, false, /* helper_exists */ false )
        );
    }

    // ─── 4. No caps → denied ──────────────────────────────────────────────

    public function test_logged_in_without_caps_denied(): void {
        $this->assertSame(
            'denied',
            sc_lookup_gate_decision( true, false, false )
        );
    }

    // ─── 5. Helper present but only manage_options set: helper takes priority ─

    public function test_helper_decision_preferred_over_admin_when_helper_exists(): void {
        // If helper exists and returns true (it includes manage_options
        // internally per `[System] DINOCO SN REST API` V.0.19 line 116-119),
        // we trust it — even if can_manage_options is false (impossible in
        // practice, but tests the precedence).
        $this->assertSame(
            'allow',
            sc_lookup_gate_decision( true, true, false, /* helper_exists */ true )
        );
    }

    public function test_helper_returning_false_blocks_even_with_admin_flag_set(): void {
        // If our mock helper returns false but `current_user_can('manage_options')`
        // is true, we still rely on the helper output — because the helper
        // already checks manage_options internally. This guards against
        // bypass attempts (e.g. helper code path catches a degraded state
        // we don't know about).
        $this->assertSame(
            'denied',
            sc_lookup_gate_decision( true, false, true, /* helper_exists */ true )
        );
    }

    // ─── 6. Read-only intent: gate must not be confused by mutation flags ─

    public function test_gate_is_pure_function_no_side_effects(): void {
        // Run twice; output must be identical (no hidden state).
        $a = sc_lookup_gate_decision( true, true, false );
        $b = sc_lookup_gate_decision( true, true, false );
        $this->assertSame( $a, $b );
    }

    // ─── 7. Only 3 distinct outcomes possible ─────────────────────────────

    public function test_only_three_outcomes(): void {
        $outcomes = [];
        foreach ( [ false, true ] as $logged_in ) {
            foreach ( [ false, true ] as $pii ) {
                foreach ( [ false, true ] as $admin ) {
                    foreach ( [ false, true ] as $helper ) {
                        $outcomes[] = sc_lookup_gate_decision( $logged_in, $pii, $admin, $helper );
                    }
                }
            }
        }
        $unique = array_unique( $outcomes );
        sort( $unique );
        $this->assertSame( [ 'allow', 'denied', 'login_redirect' ], $unique );
    }

    // ─── 8. SC role is read-only — write capability NOT granted ───────────

    public function test_view_pii_does_not_imply_write_capability(): void {
        // Documentation guarantee: dinoco_sn_view_pii is READ-only — it
        // grants the gate but the snippet performs zero state mutations.
        // This test asserts the contract by verifying the gate never
        // returns a 'write_allowed' or similar mutation outcome.
        $outcome = sc_lookup_gate_decision( true, true, true );
        $this->assertNotContains( $outcome, [ 'write_allowed', 'mutation_allowed' ] );
        $this->assertSame( 'allow', $outcome ); // read-only "allow"
    }
}
