<?php
/**
 * ModuleRegistryTest — pure logic test of [Admin System] DINOCO Module Registry.
 *
 * Covers the core semantics of `dinoco_register_admin_module()`:
 *   - Validation rules (required fields, key/shortcode regex, section allowlist)
 *   - Duplicate guard (first-wins for different source, idempotent for same source — V.1.1 fix)
 *   - Sort + section grouping in `dinoco_get_registered_modules()`
 *
 * The V.1.1 same-source idempotency was a real production bug: WP Code Snippets
 * with a duplicate row caused snippet body to execute twice per request, and
 * the first-wins guard fired a false-positive admin notice ("Module 'X'
 * already registered by '[Owner V.Y]' — skipping duplicate from '[Owner V.Y]'"
 * with same source on both sides). Test prevents regression.
 *
 * We re-declare the registry helpers INLINE (mirroring CurrencyTest pattern)
 * because the snippet is WP-bootstrap-dependent. Inline copy is the isolation
 * boundary until snippets split into composer packages.
 */

declare( strict_types=1 );

// ─── Stub WP_Error in GLOBAL namespace (PHP requires separate namespace block) ───
namespace {
    if ( ! class_exists( 'WP_Error' ) ) {
        class WP_Error {
            public string $code;
            public string $message;
            /** @var mixed */
            public $data;
            public function __construct( string $code = '', string $message = '', $data = null ) {
                $this->code    = $code;
                $this->message = $message;
                $this->data    = $data;
            }
            public function get_error_code(): string { return $this->code; }
            public function get_error_message(): string { return $this->message; }
        }
    }
}

namespace DinocoTests\Helpers {

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\is_wp_error' ) ) {
    function is_wp_error( $thing ): bool { return $thing instanceof \WP_Error; }
}

if ( ! function_exists( __NAMESPACE__ . '\\current_time' ) ) {
    function current_time( string $type = 'mysql' ): string {
        return date( 'Y-m-d H:i:s' );
    }
}

// ─── Inline copy of dinoco_register_admin_module() (source: V.1.1) ──
if ( ! function_exists( __NAMESPACE__ . '\\dinoco_register_admin_module' ) ) {
    function dinoco_register_admin_module( $args ) {
        if ( ! is_array( $args ) ) {
            return new \WP_Error( 'dnc_module_invalid_args', 'args must be array' );
        }
        $defaults = array(
            'key'        => '',
            'shortcode'  => '',
            'label'      => '',
            'section'    => 'system',
            'icon'       => 'fa-circle',
            'color'      => '#64748b',
            'cache_ttl'  => 0,
            'subtabs'    => array(),
            'hidden'     => false,
            'capability' => 'manage_options',
            'order'      => 100,
            'source'     => '',
        );
        $args   = array_merge( $defaults, $args );
        $errors = array();

        foreach ( array( 'key', 'shortcode', 'label', 'section' ) as $field ) {
            if ( ! is_string( $args[ $field ] ) || $args[ $field ] === '' ) {
                $errors[] = "missing_required_field:{$field}";
            }
        }
        if ( ! empty( $args['key'] ) && ! preg_match( '/^[a-z0-9_]+$/', $args['key'] ) ) {
            $errors[] = 'invalid_key_format';
        }
        if ( ! empty( $args['shortcode'] ) && ! preg_match( '/^[a-z0-9_]+$/', $args['shortcode'] ) ) {
            $errors[] = 'invalid_shortcode_format';
        }
        $allowed_sections = array( 'b2b', 'b2f', 'inventory', 'finance', 'ai', 'system', 'dashboard' );
        if ( ! empty( $args['section'] ) && ! in_array( $args['section'], $allowed_sections, true ) ) {
            $errors[] = 'invalid_section';
        }
        if ( ! is_int( $args['cache_ttl'] ) && ! ctype_digit( (string) $args['cache_ttl'] ) ) {
            $errors[] = 'cache_ttl_not_int';
        } else {
            $args['cache_ttl'] = max( 0, (int) $args['cache_ttl'] );
        }
        if ( ! is_array( $args['subtabs'] ) ) {
            $errors[] = 'subtabs_not_array';
        }
        if ( ! empty( $errors ) ) {
            return new \WP_Error( 'dnc_module_validation_fail', implode( ',', $errors ), $errors );
        }

        if ( ! isset( $GLOBALS['_dinoco_admin_modules'] ) || ! is_array( $GLOBALS['_dinoco_admin_modules'] ) ) {
            $GLOBALS['_dinoco_admin_modules'] = array();
        }
        $registry =& $GLOBALS['_dinoco_admin_modules'];

        // V.1.1 — same-source idempotent re-registration; different-source = error
        if ( isset( $registry[ $args['key'] ] ) ) {
            $existing_source = isset( $registry[ $args['key'] ]['source'] )
                ? $registry[ $args['key'] ]['source'] : '(unknown)';
            $new_source = isset( $args['source'] ) ? $args['source'] : '';
            if ( $existing_source !== '' && $existing_source === $new_source ) {
                return true;
            }
            return new \WP_Error( 'dnc_module_duplicate', "duplicate from {$new_source}" );
        }

        $args['shortcode_with_brackets'] = '[' . $args['shortcode'] . ']';
        $args['registered_at']           = current_time( 'mysql' );
        $registry[ $args['key'] ]        = $args;
        return true;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_get_registered_modules' ) ) {
    function dinoco_get_registered_modules( $section = '' ) {
        $registry = isset( $GLOBALS['_dinoco_admin_modules'] ) && is_array( $GLOBALS['_dinoco_admin_modules'] )
            ? $GLOBALS['_dinoco_admin_modules'] : array();
        if ( $section !== '' ) {
            $registry = array_filter( $registry, function( $m ) use ( $section ) {
                return isset( $m['section'] ) && $m['section'] === $section;
            } );
        }
        $section_order = array(
            'dashboard' => 0, 'b2b' => 10, 'b2f' => 20, 'inventory' => 30,
            'finance' => 40, 'ai' => 50, 'system' => 90,
        );
        uasort( $registry, function( $a, $b ) use ( $section_order ) {
            $sa = $section_order[ $a['section'] ] ?? 99;
            $sb = $section_order[ $b['section'] ] ?? 99;
            if ( $sa !== $sb ) return $sa - $sb;
            return ( (int) ( $a['order'] ?? 100 ) ) - ( (int) ( $b['order'] ?? 100 ) );
        } );
        return $registry;
    }
}

class ModuleRegistryTest extends TestCase {

    protected function setUp(): void {
        // Reset registry between tests
        $GLOBALS['_dinoco_admin_modules'] = array();
    }

    public function test_valid_registration_succeeds(): void {
        $result = dinoco_register_admin_module( array(
            'key'       => 'slip_monitor',
            'shortcode' => 'dinoco_slip_monitor',
            'label'     => 'Slip Monitor',
            'section'   => 'b2b',
            'source'    => '[Admin System] DINOCO Slip Monitor V.1.0',
        ) );
        $this->assertTrue( $result );
        $this->assertCount( 1, dinoco_get_registered_modules() );
    }

    public function test_missing_required_key_fails(): void {
        $result = dinoco_register_admin_module( array(
            'shortcode' => 'dinoco_slip_monitor',
            'label'     => 'Slip Monitor',
            'section'   => 'b2b',
        ) );
        $this->assertInstanceOf( \WP_Error::class, $result );
        $this->assertSame( 'dnc_module_validation_fail', $result->get_error_code() );
    }

    public function test_invalid_section_rejected(): void {
        $result = dinoco_register_admin_module( array(
            'key'       => 'foo',
            'shortcode' => 'foo_bar',
            'label'     => 'Foo',
            'section'   => 'marketing', // not in allowlist
        ) );
        $this->assertInstanceOf( \WP_Error::class, $result );
    }

    public function test_invalid_key_format_rejected(): void {
        $result = dinoco_register_admin_module( array(
            'key'       => 'Slip-Monitor', // dashes + uppercase forbidden
            'shortcode' => 'dinoco_slip_monitor',
            'label'     => 'X',
            'section'   => 'b2b',
        ) );
        $this->assertInstanceOf( \WP_Error::class, $result );
    }

    public function test_shortcode_with_brackets_rejected(): void {
        $result = dinoco_register_admin_module( array(
            'key'       => 'foo',
            'shortcode' => '[dinoco_foo]', // brackets must NOT be in shortcode
            'label'     => 'Foo',
            'section'   => 'b2b',
        ) );
        $this->assertInstanceOf( \WP_Error::class, $result );
    }

    /**
     * V.1.1 regression: same-source re-registration must be idempotent.
     * WP Code Snippets duplicate row → snippet body executes twice → false-positive notice
     * if registry treats it as a duplicate conflict.
     */
    public function test_same_source_re_registration_idempotent(): void {
        $args = array(
            'key'       => 'config_viewer',
            'shortcode' => 'dinoco_admin_config_viewer',
            'label'     => 'Config Layer',
            'section'   => 'system',
            'source'    => '[Admin System] DINOCO Config Layer V.1.0',
        );
        $first  = dinoco_register_admin_module( $args );
        $second = dinoco_register_admin_module( $args );
        $third  = dinoco_register_admin_module( $args );

        $this->assertTrue( $first );
        $this->assertTrue( $second, 'Second call from same source must succeed silently' );
        $this->assertTrue( $third, 'Third call from same source must succeed silently' );
        $this->assertCount( 1, dinoco_get_registered_modules(), 'Registry must contain exactly one entry' );
    }

    /**
     * Different sources claiming the same key = real conflict (admin should be alerted).
     */
    public function test_different_source_collision_returns_error(): void {
        dinoco_register_admin_module( array(
            'key'       => 'finance',
            'shortcode' => 'dinoco_admin_finance',
            'label'     => 'Finance',
            'section'   => 'finance',
            'source'    => '[Admin System] Finance Dashboard V.1.0',
        ) );
        $second = dinoco_register_admin_module( array(
            'key'       => 'finance',
            'shortcode' => 'rogue_finance', // different shortcode AND source = conflict
            'label'     => 'Rogue',
            'section'   => 'finance',
            'source'    => '[Rogue Plugin] V.0.1',
        ) );
        $this->assertInstanceOf( \WP_Error::class, $second );
        $this->assertSame( 'dnc_module_duplicate', $second->get_error_code() );
        $this->assertCount( 1, dinoco_get_registered_modules(), 'First registration wins; rogue is rejected' );
    }

    public function test_empty_source_first_wins(): void {
        // Empty source on existing entry — even matching new empty source should NOT be silent
        // (otherwise '' === '' would short-circuit and silently merge unrelated registrations).
        dinoco_register_admin_module( array(
            'key' => 'x', 'shortcode' => 'x_one', 'label' => 'X1', 'section' => 'b2b',
            'source' => '',
        ) );
        $second = dinoco_register_admin_module( array(
            'key' => 'x', 'shortcode' => 'x_two', 'label' => 'X2', 'section' => 'b2b',
            'source' => '',
        ) );
        $this->assertInstanceOf( \WP_Error::class, $second, 'Empty source on both must NOT be treated as same-source idempotent' );
    }

    public function test_shortcode_with_brackets_field_added(): void {
        dinoco_register_admin_module( array(
            'key' => 'inventory', 'shortcode' => 'dinoco_admin_inventory',
            'label' => 'Inventory', 'section' => 'inventory',
            'source' => '[Admin System] DINOCO Global Inventory Database V.44.6',
        ) );
        $modules = dinoco_get_registered_modules();
        $this->assertSame( '[dinoco_admin_inventory]', $modules['inventory']['shortcode_with_brackets'] );
    }

    public function test_section_filter(): void {
        dinoco_register_admin_module( array(
            'key' => 'finance', 'shortcode' => 'a', 'label' => 'A', 'section' => 'finance', 'source' => 'X',
        ) );
        dinoco_register_admin_module( array(
            'key' => 'invoice', 'shortcode' => 'b', 'label' => 'B', 'section' => 'finance', 'source' => 'X2',
        ) );
        dinoco_register_admin_module( array(
            'key' => 'b2b_dnc', 'shortcode' => 'c', 'label' => 'C', 'section' => 'b2b', 'source' => 'X3',
        ) );
        $finance_only = dinoco_get_registered_modules( 'finance' );
        $this->assertCount( 2, $finance_only );
        $this->assertArrayHasKey( 'finance', $finance_only );
        $this->assertArrayHasKey( 'invoice', $finance_only );
    }

    public function test_section_ordering(): void {
        // System should sort AFTER b2b regardless of insert order
        dinoco_register_admin_module( array(
            'key' => 'claims', 'shortcode' => 'dinoco_admin_claims',
            'label' => 'Claims', 'section' => 'system', 'order' => 20,
            'source' => 'A',
        ) );
        dinoco_register_admin_module( array(
            'key' => 'b2b_dnc', 'shortcode' => 'b2b_admin_dashboard',
            'label' => 'B2B Orders', 'section' => 'b2b', 'order' => 10,
            'source' => 'B',
        ) );
        $sorted = array_keys( dinoco_get_registered_modules() );
        $b2b_idx    = array_search( 'b2b_dnc', $sorted, true );
        $system_idx = array_search( 'claims', $sorted, true );
        $this->assertLessThan( $system_idx, $b2b_idx, 'b2b section sorts before system' );
    }
}

} // end namespace DinocoTests\Helpers
