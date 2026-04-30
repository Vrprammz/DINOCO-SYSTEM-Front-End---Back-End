<?php
/**
 * ValidateSourceSkuTest — pure-logic test of `b2f_validate_source_sku_in_ancestors()`.
 *
 * Source: [B2F] Snippet 1: Core Utilities & Flex Builders V.7.0 line 3761.
 *
 * Function is the ANTI-MALICIOUS guard for V.7.0 Order Intent System.
 * Admin LIFF B2F E-Catalog can claim "I clicked SET_A" while expanded leaf is
 * actually a child of SET_B (cross-set source spoof). create-po validator runs
 * this check to ensure source_sku is either equal to leaf OR appears in the
 * leaf's ancestor chain.
 *
 * Decision flow:
 *   1. Trim + uppercase both inputs
 *   2. Empty either → WP_Error 400 (B2F_ERR_SOURCE_SKU_NOT_ANCESTOR)
 *   3. source_sku === leaf_sku → true (admin clicked leaf directly)
 *   4. dinoco_get_ancestor_skus() not loaded → true (defensive legacy fallback)
 *   5. source_sku in ancestor list → true
 *   6. Otherwise → WP_Error 400
 *
 * Critical invariants this test locks in:
 *   - Empty leaf or empty source → WP_Error (NOT silent pass)
 *   - Self-loop (source === leaf) → true (common case for single leaf order)
 *   - Case-insensitive match (DB/JSON sometimes lowercase)
 *   - Whitespace tolerated via trim()
 *   - Unrelated SKU → WP_Error with leaf_sku + source_sku in data array
 *   - Snippet 15 not loaded → graceful pass (legacy PO compat)
 */

declare( strict_types=1 );

// ─── Stub WP_Error in GLOBAL namespace ────────────────────────────────
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
            public function get_error_data() { return $this->data; }
        }
    }
    if ( ! defined( 'B2F_ERR_SOURCE_SKU_NOT_ANCESTOR' ) ) {
        define( 'B2F_ERR_SOURCE_SKU_NOT_ANCESTOR', 'source_sku_not_ancestor' );
    }
}

namespace DinocoTests\Helpers\ValidateSourceSku {

use PHPUnit\Framework\TestCase;

// Mock ancestor lookup — driven by `__vsa_ancestors` global stash per test.
// Returns uppercase SKUs (matches Snippet 15 V.7.0 contract).
if ( ! function_exists( __NAMESPACE__ . '\\dinoco_get_ancestor_skus' ) ) {
    function dinoco_get_ancestor_skus( $sku ): array {
        $key = strtoupper( (string) $sku );
        $map = $GLOBALS['__vsa_ancestors'] ?? array();
        return $map[ $key ] ?? array();
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\b2f_validate_source_sku_in_ancestors' ) ) {
    /**
     * Inline copy of source — pure decision logic with mocked ancestor lookup.
     */
    function b2f_validate_source_sku_in_ancestors( $leaf_sku, $source_sku ) {
        $leaf_sku   = strtoupper( trim( (string) $leaf_sku ) );
        $source_sku = strtoupper( trim( (string) $source_sku ) );

        if ( $leaf_sku === '' || $source_sku === '' ) {
            return new \WP_Error(
                B2F_ERR_SOURCE_SKU_NOT_ANCESTOR,
                'leaf_sku and source_sku are required',
                array( 'status' => 400 )
            );
        }

        // Short-circuit: admin clicked SKU directly == leaf (common case for single leaf)
        if ( $source_sku === $leaf_sku ) return true;

        if ( ! function_exists( __NAMESPACE__ . '\\dinoco_get_ancestor_skus' ) ) {
            return true;
        }

        $ancestors = dinoco_get_ancestor_skus( $leaf_sku );
        if ( ! is_array( $ancestors ) ) $ancestors = array();

        foreach ( $ancestors as $anc ) {
            if ( strtoupper( (string) $anc ) === $source_sku ) return true;
        }

        return new \WP_Error(
            B2F_ERR_SOURCE_SKU_NOT_ANCESTOR,
            sprintf( 'source_sku "%s" is not an ancestor of leaf "%s"', $source_sku, $leaf_sku ),
            array( 'status' => 400, 'leaf_sku' => $leaf_sku, 'source_sku' => $source_sku )
        );
    }
}

/**
 * @covers ::b2f_validate_source_sku_in_ancestors
 */
final class ValidateSourceSkuTest extends TestCase {

    protected function setUp(): void {
        parent::setUp();
        $GLOBALS['__vsa_ancestors'] = array();
    }

    protected function tearDown(): void {
        unset( $GLOBALS['__vsa_ancestors'] );
        parent::tearDown();
    }

    public function test_empty_leaf_returns_wp_error(): void {
        $result = b2f_validate_source_sku_in_ancestors( '', 'SET_A' );
        $this->assertInstanceOf( \WP_Error::class, $result );
        $this->assertSame( B2F_ERR_SOURCE_SKU_NOT_ANCESTOR, $result->get_error_code() );
        // Access ->data directly (stubbed WP_Error in ModuleRegistryTest doesn't expose getter).
        $this->assertSame( 400, $result->data['status'] );
    }

    public function test_empty_source_returns_wp_error(): void {
        $result = b2f_validate_source_sku_in_ancestors( 'LEAF1', '' );
        $this->assertInstanceOf( \WP_Error::class, $result );
        $this->assertSame( B2F_ERR_SOURCE_SKU_NOT_ANCESTOR, $result->get_error_code() );
    }

    public function test_both_empty_returns_wp_error(): void {
        $result = b2f_validate_source_sku_in_ancestors( '', '' );
        $this->assertInstanceOf( \WP_Error::class, $result );
    }

    public function test_whitespace_only_inputs_return_wp_error(): void {
        // Trim makes "   " → "" → empty path.
        $result = b2f_validate_source_sku_in_ancestors( '   ', '   ' );
        $this->assertInstanceOf( \WP_Error::class, $result );
    }

    public function test_self_loop_when_source_equals_leaf_returns_true(): void {
        // Admin clicked leaf directly (single-leaf order, no SET).
        $this->assertTrue( b2f_validate_source_sku_in_ancestors( 'LEAF1', 'LEAF1' ) );
    }

    public function test_self_loop_case_insensitive(): void {
        $this->assertTrue( b2f_validate_source_sku_in_ancestors( 'leaf1', 'LEAF1' ) );
        $this->assertTrue( b2f_validate_source_sku_in_ancestors( 'LEAF1', 'leaf1' ) );
        $this->assertTrue( b2f_validate_source_sku_in_ancestors( 'Leaf1', 'lEAf1' ) );
    }

    public function test_self_loop_with_whitespace(): void {
        $this->assertTrue( b2f_validate_source_sku_in_ancestors( '  LEAF1  ', "\tLEAF1\n" ) );
    }

    public function test_source_in_ancestor_chain_returns_true(): void {
        // SET_A → SUB → LEAF1; admin clicked SET_A while expanding LEAF1.
        $GLOBALS['__vsa_ancestors'] = array(
            'LEAF1' => array( 'SUB', 'SET_A' ),
        );
        $this->assertTrue( b2f_validate_source_sku_in_ancestors( 'LEAF1', 'SET_A' ) );
        $this->assertTrue( b2f_validate_source_sku_in_ancestors( 'LEAF1', 'SUB' ) );
    }

    public function test_source_not_ancestor_returns_wp_error(): void {
        // Spoof attack: admin claims SET_B but leaf is child of SET_A.
        $GLOBALS['__vsa_ancestors'] = array(
            'LEAF1' => array( 'SET_A' ),
        );
        $result = b2f_validate_source_sku_in_ancestors( 'LEAF1', 'SET_B' );
        $this->assertInstanceOf( \WP_Error::class, $result );
        $this->assertSame( B2F_ERR_SOURCE_SKU_NOT_ANCESTOR, $result->get_error_code() );
        $this->assertSame( 400, $result->data['status'] );
        $this->assertSame( 'LEAF1', $result->data['leaf_sku'] );
        $this->assertSame( 'SET_B', $result->data['source_sku'] );
    }

    public function test_ancestor_check_case_insensitive(): void {
        // dinoco_get_ancestor_skus may return mixed-case in legacy data.
        $GLOBALS['__vsa_ancestors'] = array(
            'LEAF1' => array( 'set_a', 'Sub' ),
        );
        $this->assertTrue( b2f_validate_source_sku_in_ancestors( 'LEAF1', 'SET_A' ) );
        $this->assertTrue( b2f_validate_source_sku_in_ancestors( 'LEAF1', 'sub' ) );
    }

    public function test_empty_ancestor_list_returns_wp_error(): void {
        // Leaf has no ancestors registered + admin claims a SET → reject.
        $GLOBALS['__vsa_ancestors'] = array(
            'LEAF1' => array(),
        );
        $result = b2f_validate_source_sku_in_ancestors( 'LEAF1', 'SET_A' );
        $this->assertInstanceOf( \WP_Error::class, $result );
    }

    public function test_dd3_shared_leaf_in_multiple_sets(): void {
        // Shared leaf in 3 SETs → any of them as source_sku passes.
        $GLOBALS['__vsa_ancestors'] = array(
            'SHARED_LEAF' => array( 'SET_A', 'SET_B', 'SET_C' ),
        );
        $this->assertTrue( b2f_validate_source_sku_in_ancestors( 'SHARED_LEAF', 'SET_A' ) );
        $this->assertTrue( b2f_validate_source_sku_in_ancestors( 'SHARED_LEAF', 'SET_B' ) );
        $this->assertTrue( b2f_validate_source_sku_in_ancestors( 'SHARED_LEAF', 'SET_C' ) );
        $unrelated = b2f_validate_source_sku_in_ancestors( 'SHARED_LEAF', 'SET_D' );
        $this->assertInstanceOf( \WP_Error::class, $unrelated );
    }

    public function test_three_level_chain_intermediate_match(): void {
        // TOP_SET → SUB_SET → LEAF1; admin clicked SUB_SET (intermediate).
        $GLOBALS['__vsa_ancestors'] = array(
            'LEAF1' => array( 'SUB_SET', 'TOP_SET' ),
        );
        $this->assertTrue( b2f_validate_source_sku_in_ancestors( 'LEAF1', 'SUB_SET' ) );
        $this->assertTrue( b2f_validate_source_sku_in_ancestors( 'LEAF1', 'TOP_SET' ) );
    }

    public function test_error_data_includes_normalized_skus(): void {
        // WP_Error data must contain UPPERCASE versions (post-normalization).
        $GLOBALS['__vsa_ancestors'] = array(
            'LEAF1' => array( 'SET_A' ),
        );
        $result = b2f_validate_source_sku_in_ancestors( 'leaf1', 'set_b' );
        $this->assertInstanceOf( \WP_Error::class, $result );
        $this->assertSame( 'LEAF1', $result->data['leaf_sku'] );
        $this->assertSame( 'SET_B', $result->data['source_sku'] );
    }
}

}
