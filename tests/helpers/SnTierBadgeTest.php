<?php
/**
 * SnTierBadgeTest — pure-logic test of v2.11 Member Dashboard tier badge.
 *
 * Source: [System] Member Dashboard Main V.31.0 — `dinoco_render_tier_badge()`
 * Plan:   ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §Member Dashboard
 *         (Phase 2 W7.3 — boss Q27 confirmed = B2B distributor rank_system pattern)
 *
 * 5 valid tier slugs + emoji + colored badge:
 *   bronze   🥉  #b45309 bg
 *   silver   🥈  #94a3b8 bg
 *   gold     🥇  #ca8a04 bg
 *   platinum 💜  #4338ca bg
 *   diamond  💎  linear-gradient(135deg, #7c3aed, #a855f7)
 *
 * Defensive contract: invalid/empty/null/non-string input → empty string
 * (caller can safely concat without null check).
 *
 * These tests verify the contract semantics — real WP rendering is verified
 * via the Jest drift detector (sn-system-drift.test.js).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Pure mirror of Member Dashboard Main V.31.0 helper ─── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_render_tier_badge' ) ) {
    /**
     * Mirror of `dinoco_render_tier_badge()`.
     *
     * Same logic — escape via htmlspecialchars (mirrors WP esc_attr/esc_html).
     */
    function sn_render_tier_badge( $tier ): string {
        $valid = array(
            'bronze'   => array( '🥉', 'Bronze' ),
            'silver'   => array( '🥈', 'Silver' ),
            'gold'     => array( '🥇', 'Gold' ),
            'platinum' => array( '💜', 'Platinum' ),
            'diamond'  => array( '💎', 'Diamond' ),
        );
        $tier = is_string( $tier ) ? strtolower( trim( $tier ) ) : '';
        if ( $tier === '' || ! isset( $valid[ $tier ] ) ) {
            return '';
        }
        list( $emoji, $label ) = $valid[ $tier ];
        return sprintf(
            '<span class="dnc-sn-tier-badge dnc-sn-tier-%s">%s %s</span>',
            htmlspecialchars( $tier, ENT_QUOTES, 'UTF-8' ),
            htmlspecialchars( $emoji, ENT_QUOTES, 'UTF-8' ),
            htmlspecialchars( $label, ENT_QUOTES, 'UTF-8' )
        );
    }
}

class SnTierBadgeTest extends TestCase {

    /* ─── 5 valid tier slugs render correctly ─── */

    public function test_bronze_renders_correct_emoji_label_class() {
        $html = sn_render_tier_badge( 'bronze' );
        $this->assertStringContainsString( 'dnc-sn-tier-badge', $html );
        $this->assertStringContainsString( 'dnc-sn-tier-bronze', $html );
        $this->assertStringContainsString( '🥉', $html );
        $this->assertStringContainsString( 'Bronze', $html );
        $this->assertStringStartsWith( '<span class=', $html );
        $this->assertStringEndsWith( '</span>', $html );
    }

    public function test_silver_renders_correct_emoji_label_class() {
        $html = sn_render_tier_badge( 'silver' );
        $this->assertStringContainsString( 'dnc-sn-tier-silver', $html );
        $this->assertStringContainsString( '🥈', $html );
        $this->assertStringContainsString( 'Silver', $html );
    }

    public function test_gold_renders_correct_emoji_label_class() {
        $html = sn_render_tier_badge( 'gold' );
        $this->assertStringContainsString( 'dnc-sn-tier-gold', $html );
        $this->assertStringContainsString( '🥇', $html );
        $this->assertStringContainsString( 'Gold', $html );
    }

    public function test_platinum_renders_correct_emoji_label_class() {
        $html = sn_render_tier_badge( 'platinum' );
        $this->assertStringContainsString( 'dnc-sn-tier-platinum', $html );
        $this->assertStringContainsString( '💜', $html );
        $this->assertStringContainsString( 'Platinum', $html );
    }

    public function test_diamond_renders_correct_emoji_label_class() {
        $html = sn_render_tier_badge( 'diamond' );
        $this->assertStringContainsString( 'dnc-sn-tier-diamond', $html );
        $this->assertStringContainsString( '💎', $html );
        $this->assertStringContainsString( 'Diamond', $html );
    }

    /* ─── Invalid input → empty string (defensive) ─── */

    public function test_invalid_tier_slug_returns_empty() {
        $this->assertSame( '', sn_render_tier_badge( 'vip' ) );
        $this->assertSame( '', sn_render_tier_badge( 'random' ) );
        $this->assertSame( '', sn_render_tier_badge( 'ABC' ) );  // not in whitelist after lowercase
        $this->assertSame( '', sn_render_tier_badge( 'br' ) );    // partial slug
    }

    public function test_empty_string_returns_empty() {
        $this->assertSame( '', sn_render_tier_badge( '' ) );
        $this->assertSame( '', sn_render_tier_badge( '   ' ) );
        $this->assertSame( '', sn_render_tier_badge( "\t\n" ) );
    }

    public function test_null_and_non_string_returns_empty() {
        $this->assertSame( '', sn_render_tier_badge( null ) );
        $this->assertSame( '', sn_render_tier_badge( 0 ) );
        $this->assertSame( '', sn_render_tier_badge( 123 ) );
        $this->assertSame( '', sn_render_tier_badge( false ) );
        $this->assertSame( '', sn_render_tier_badge( true ) );
        $this->assertSame( '', sn_render_tier_badge( array() ) );
        $this->assertSame( '', sn_render_tier_badge( array( 'gold' ) ) );
    }

    /* ─── Normalization (case + whitespace) ─── */

    public function test_uppercase_tier_normalizes_to_lowercase() {
        $html = sn_render_tier_badge( 'DIAMOND' );
        $this->assertStringContainsString( 'dnc-sn-tier-diamond', $html );
        $this->assertStringContainsString( 'Diamond', $html );
    }

    public function test_mixed_case_normalizes() {
        $html_a = sn_render_tier_badge( 'GoLd' );
        $html_b = sn_render_tier_badge( 'gold' );
        $this->assertSame( $html_a, $html_b );
    }

    public function test_whitespace_padded_tier_normalizes() {
        $html = sn_render_tier_badge( '  silver  ' );
        $this->assertStringContainsString( 'dnc-sn-tier-silver', $html );
        $this->assertStringContainsString( 'Silver', $html );
    }

    public function test_tab_and_newline_padded_tier_normalizes() {
        $html = sn_render_tier_badge( "\tplatinum\n" );
        $this->assertStringContainsString( 'dnc-sn-tier-platinum', $html );
    }

    /* ─── XSS / HTML safety — slug is escaped before output ─── */

    public function test_html_special_chars_in_invalid_slug_returns_empty() {
        // Whitelist enforcement is the primary XSS defense — these slugs are
        // not in the whitelist so they return empty. Even if someone added
        // raw HTML/script as the slug, the early `isset($valid[$tier])`
        // check rejects it BEFORE the sprintf.
        $this->assertSame( '', sn_render_tier_badge( '<script>alert(1)</script>' ) );
        $this->assertSame( '', sn_render_tier_badge( '" onmouseover="alert(1)' ) );
        $this->assertSame( '', sn_render_tier_badge( 'gold"; DROP TABLE' ) );
    }

    public function test_output_contains_no_script_tags() {
        // Defensive: even valid output should never produce raw <script>
        foreach ( array( 'bronze', 'silver', 'gold', 'platinum', 'diamond' ) as $t ) {
            $html = sn_render_tier_badge( $t );
            $this->assertStringNotContainsString( '<script', $html );
            $this->assertStringNotContainsString( 'onerror=', $html );
            $this->assertStringNotContainsString( 'onload=', $html );
        }
    }

    /* ─── Backward compat — function never throws ─── */

    public function test_helper_is_idempotent_on_repeat_calls() {
        // Calling repeatedly with same input → identical output (no state leak)
        $a = sn_render_tier_badge( 'gold' );
        $b = sn_render_tier_badge( 'gold' );
        $this->assertSame( $a, $b );
    }

    public function test_all_5_tiers_produce_distinct_html() {
        $outputs = array();
        foreach ( array( 'bronze', 'silver', 'gold', 'platinum', 'diamond' ) as $t ) {
            $outputs[ $t ] = sn_render_tier_badge( $t );
        }
        // 5 distinct strings (no duplicate HTML between tiers)
        $this->assertCount( 5, array_unique( $outputs ) );
    }
}
