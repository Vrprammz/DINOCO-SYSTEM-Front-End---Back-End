<?php
/**
 * SnDealerResolverTest — pure-logic test for F#6 Click-to-Call dealer resolver.
 *
 * Source: [System] DINOCO SN REST API V.0.20
 *   function dinoco_sn_mask_phone( $phone )
 *   function dinoco_sn_resolve_dealer_for_plate( $sn ) [tested via mirror]
 *   function dinoco_sn_get_hotline_fallback() [tested via mirror]
 *
 * Plan reference: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13
 * Phase: 3 W9.2 (F#6 Click-to-Call Dealer)
 *
 * Pure logic only — no WP / no DB. Mirror functions are pinned copies
 * of snippet implementation. Drift detector
 * tests/jest/sn-system-drift.test.js asserts snippet still defines
 * the canonical helpers + constants.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/**
 * Mirror of dinoco_sn_mask_phone() — V.0.20 byte-for-byte aligned.
 *
 * Strategy: digits-only extraction, keep first 2 + last 4, mask middle.
 */
if ( ! function_exists( __NAMESPACE__ . '\\mask_phone' ) ) {
    function mask_phone( $phone ): string {
        if ( $phone === null || $phone === '' ) return '';
        $digits = preg_replace( '/[^0-9]/', '', (string) $phone );
        if ( $digits === '' ) return '';
        if ( strlen( $digits ) < 4 ) return '***';
        $first2 = substr( $digits, 0, 2 );
        $last4  = substr( $digits, -4 );
        return sprintf( '%sx-xxx-%s', $first2, $last4 );
    }
}

/**
 * Pure-logic resolver mirror — accepts arrays/objects (no DB).
 *
 * Mirrors dinoco_sn_resolve_dealer_for_plate() decision graph:
 *   - missing meta / empty purchase_dealer_id → null
 *   - dealer post deleted (post_type !== 'distributor') → null
 *   - dealer post unpublished → null
 *   - else → dealer info array (shop_name resolves with fallback chain)
 */
if ( ! function_exists( __NAMESPACE__ . '\\resolve_dealer_for_plate_pure' ) ) {
    function resolve_dealer_for_plate_pure( ?array $meta, ?array $dealer_post, ?array $dealer_acf = null ): ?array {
        if ( ! $meta || empty( $meta['purchase_dealer_id'] ) ) return null;
        $dealer_id = (int) $meta['purchase_dealer_id'];
        if ( $dealer_id <= 0 ) return null;

        if ( ! $dealer_post ) return null;
        if ( ( $dealer_post['post_type'] ?? '' ) !== 'distributor' ) return null;
        if ( ( $dealer_post['post_status'] ?? '' ) !== 'publish' ) return null;

        // Shop name fallback chain: ACF shop_name → post_title
        $shop_name = '';
        if ( $dealer_acf && ! empty( $dealer_acf['shop_name'] ) ) {
            $shop_name = (string) $dealer_acf['shop_name'];
        }
        if ( $shop_name === '' ) {
            $shop_name = (string) ( $dealer_post['post_title'] ?? '' );
        }

        // Phone fallback chain: phone_number → shop_phone → dist_phone
        $phone_raw = (string) ( $dealer_post['phone_number'] ?? '' );
        if ( $phone_raw === '' ) {
            $phone_raw = (string) ( $dealer_post['shop_phone'] ?? '' );
        }
        if ( $phone_raw === '' && $dealer_acf ) {
            $phone_raw = (string) ( $dealer_acf['dist_phone'] ?? '' );
        }

        $address = $dealer_acf ? (string) ( $dealer_acf['dist_address'] ?? '' ) : '';
        if ( $address === '' ) {
            $address = (string) ( $dealer_post['shop_address'] ?? '' );
        }

        $line_oa = $dealer_acf ? (string) ( $dealer_acf['line_oa'] ?? '' ) : '';
        if ( $line_oa === '' ) {
            $line_oa = (string) ( $dealer_post['line_oa'] ?? '' );
        }

        return array(
            'dealer_id'     => $dealer_id,
            'shop_name'     => $shop_name,
            'phone_raw'     => $phone_raw,
            'line_oa'       => $line_oa,
            'address'       => $address,
            'purchase_date' => $meta['purchase_date'] ?? null,
        );
    }
}

/**
 * Permission gate mirror — owner OR view_pii cap OR admin.
 *
 * Returns the response shape (phone_full nullable based on caller).
 */
if ( ! function_exists( __NAMESPACE__ . '\\compute_phone_visibility' ) ) {
    function compute_phone_visibility( int $current_uid, int $owner_uid, bool $is_admin, bool $can_pii ): bool {
        if ( $is_admin ) return true;
        if ( $can_pii ) return true;
        if ( $current_uid > 0 && $current_uid === $owner_uid ) return true;
        return false;
    }
}

final class SnDealerResolverTest extends TestCase {

    // ─── Phone masking ────────────────────────────────────────────

    public function test_mask_phone_standard_thai_format(): void {
        $this->assertSame( '08x-xxx-5678', mask_phone( '0812345678' ) );
    }

    public function test_mask_phone_with_dashes(): void {
        $this->assertSame( '08x-xxx-5678', mask_phone( '081-234-5678' ) );
    }

    public function test_mask_phone_with_spaces(): void {
        $this->assertSame( '08x-xxx-5678', mask_phone( '081 234 5678' ) );
    }

    public function test_mask_phone_international_plus_66(): void {
        // +66812345678 → digits only → 66812345678 → first2=66, last4=5678
        $this->assertSame( '66x-xxx-5678', mask_phone( '+66812345678' ) );
    }

    public function test_mask_phone_short_number_returns_three_stars(): void {
        $this->assertSame( '***', mask_phone( '123' ) );
    }

    public function test_mask_phone_empty_string(): void {
        $this->assertSame( '', mask_phone( '' ) );
    }

    public function test_mask_phone_null(): void {
        $this->assertSame( '', mask_phone( null ) );
    }

    public function test_mask_phone_letters_only_returns_empty(): void {
        // No digits at all → empty after preg_replace → return ''
        $this->assertSame( '', mask_phone( 'abc' ) );
    }

    public function test_mask_phone_exactly_4_digits(): void {
        // 1234 → first2=12, last4=1234 → "12x-xxx-1234"
        $this->assertSame( '12x-xxx-1234', mask_phone( '1234' ) );
    }

    public function test_mask_phone_office_number_landline(): void {
        // 02-xxx-xxxx style → 0212345678 → first2=02, last4=5678
        $this->assertSame( '02x-xxx-5678', mask_phone( '02-1234-5678' ) );
    }

    // ─── Resolver decision graph ─────────────────────────────────

    public function test_resolver_returns_null_when_meta_empty(): void {
        $this->assertNull( resolve_dealer_for_plate_pure( null, null ) );
        $this->assertNull( resolve_dealer_for_plate_pure( array(), null ) );
    }

    public function test_resolver_returns_null_when_purchase_dealer_id_zero(): void {
        $meta = array( 'purchase_dealer_id' => 0 );
        $this->assertNull( resolve_dealer_for_plate_pure( $meta, null ) );
    }

    public function test_resolver_returns_null_when_dealer_post_deleted(): void {
        $meta = array( 'purchase_dealer_id' => 1234 );
        // post deleted → null post
        $this->assertNull( resolve_dealer_for_plate_pure( $meta, null ) );
    }

    public function test_resolver_returns_null_when_dealer_post_wrong_type(): void {
        $meta = array( 'purchase_dealer_id' => 1234 );
        $post = array(
            'post_type'   => 'attachment',
            'post_status' => 'publish',
            'post_title'  => 'Garbage',
        );
        $this->assertNull( resolve_dealer_for_plate_pure( $meta, $post ) );
    }

    public function test_resolver_returns_null_when_dealer_unpublished(): void {
        $meta = array( 'purchase_dealer_id' => 1234 );
        $post = array(
            'post_type'   => 'distributor',
            'post_status' => 'trash',
            'post_title'  => 'ABC Shop',
        );
        $this->assertNull( resolve_dealer_for_plate_pure( $meta, $post ) );
    }

    public function test_resolver_uses_acf_shop_name_first(): void {
        $meta = array( 'purchase_dealer_id' => 1234, 'purchase_date' => '2026-05-04' );
        $post = array(
            'post_type'   => 'distributor',
            'post_status' => 'publish',
            'post_title'  => 'Fallback Title',
            'phone_number'=> '0812345678',
        );
        $acf = array( 'shop_name' => 'ABC รามอินทรา 14' );
        $result = resolve_dealer_for_plate_pure( $meta, $post, $acf );
        $this->assertNotNull( $result );
        $this->assertSame( 'ABC รามอินทรา 14', $result['shop_name'] );
        $this->assertSame( '0812345678', $result['phone_raw'] );
        $this->assertSame( 1234, $result['dealer_id'] );
        $this->assertSame( '2026-05-04', $result['purchase_date'] );
    }

    public function test_resolver_falls_back_to_post_title_when_acf_empty(): void {
        $meta = array( 'purchase_dealer_id' => 1234 );
        $post = array(
            'post_type'   => 'distributor',
            'post_status' => 'publish',
            'post_title'  => 'Default Shop Name',
        );
        $result = resolve_dealer_for_plate_pure( $meta, $post, array() );
        $this->assertSame( 'Default Shop Name', $result['shop_name'] );
    }

    public function test_resolver_phone_fallback_chain(): void {
        $meta = array( 'purchase_dealer_id' => 1234 );
        $post = array(
            'post_type'    => 'distributor',
            'post_status'  => 'publish',
            'post_title'   => 'Shop',
            'shop_phone'   => '0898765432',  // phone_number empty, fallback to shop_phone
        );
        $result = resolve_dealer_for_plate_pure( $meta, $post );
        $this->assertSame( '0898765432', $result['phone_raw'] );
    }

    public function test_resolver_phone_falls_back_to_acf_dist_phone(): void {
        $meta = array( 'purchase_dealer_id' => 1234 );
        $post = array(
            'post_type'   => 'distributor',
            'post_status' => 'publish',
            'post_title'  => 'Shop',
            // no phone_number, no shop_phone
        );
        $acf = array( 'dist_phone' => '0234567890' );
        $result = resolve_dealer_for_plate_pure( $meta, $post, $acf );
        $this->assertSame( '0234567890', $result['phone_raw'] );
    }

    public function test_resolver_handles_missing_phone_gracefully(): void {
        $meta = array( 'purchase_dealer_id' => 1234 );
        $post = array(
            'post_type'   => 'distributor',
            'post_status' => 'publish',
            'post_title'  => 'No Phone Shop',
        );
        $result = resolve_dealer_for_plate_pure( $meta, $post );
        $this->assertSame( '', $result['phone_raw'] );
        $this->assertSame( 'No Phone Shop', $result['shop_name'] );
    }

    // ─── PII permission gate ─────────────────────────────────────

    public function test_phone_visible_to_admin(): void {
        $this->assertTrue( compute_phone_visibility(
            current_uid: 999, owner_uid: 1234,
            is_admin: true, can_pii: false
        ) );
    }

    public function test_phone_visible_to_pii_cap_holder(): void {
        $this->assertTrue( compute_phone_visibility(
            current_uid: 555, owner_uid: 1234,
            is_admin: false, can_pii: true
        ) );
    }

    public function test_phone_visible_to_owner(): void {
        $this->assertTrue( compute_phone_visibility(
            current_uid: 1234, owner_uid: 1234,
            is_admin: false, can_pii: false
        ) );
    }

    public function test_phone_hidden_from_other_logged_in_user(): void {
        $this->assertFalse( compute_phone_visibility(
            current_uid: 9999, owner_uid: 1234,
            is_admin: false, can_pii: false
        ) );
    }

    public function test_phone_hidden_from_anon_uid_zero(): void {
        $this->assertFalse( compute_phone_visibility(
            current_uid: 0, owner_uid: 1234,
            is_admin: false, can_pii: false
        ) );
    }

    public function test_phone_hidden_when_owner_uid_zero_unregistered_plate(): void {
        // Plate not yet registered (owner_uid=0). Even logged-in user can't claim ownership.
        $this->assertFalse( compute_phone_visibility(
            current_uid: 100, owner_uid: 0,
            is_admin: false, can_pii: false
        ) );
    }

    // ─── 4 last digits visible only ──────────────────────────────

    public function test_masked_phone_keeps_last_4_digits_visible(): void {
        $masked = mask_phone( '0812345678' );
        $this->assertStringEndsWith( '5678', $masked );
        $this->assertStringNotContainsString( '1234', $masked, 'middle digits must be masked' );
    }
}
