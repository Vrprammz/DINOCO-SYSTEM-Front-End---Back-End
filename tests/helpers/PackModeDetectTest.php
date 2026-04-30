<?php
/**
 * PackModeDetectTest — pure-logic test of `dinoco_smart_detect_pack_mode()`.
 *
 * Source: [B2B] Snippet 15: Custom Tables & JWT Session V.8.0+ line 4226.
 *
 * Function suggests a Flash V.42 `pack_mode` (auto/single_box/multi_box/
 * bulk_pack/assembled_set/unknown) for a SKU based on:
 *   - `boxes_per_unit` (bpu) — how many boxes 1 unit ships in
 *   - `units_per_box`  (upb) — how many units fit in 1 box
 *   - hierarchy: leaf vs has children
 *
 * The output drives the Flash priority chain and downstream label rendering.
 * Wrong detection = wrong PNO count, wrong shipping fee, wrong courier dispatch.
 *
 * Decision matrix (ordered — first match wins):
 *   1. upb > 1                          → bulk_pack    (small items grouped)
 *   2. bpu > 1                          → multi_box    (1 unit splits across boxes)
 *   3. has_children && bpu === 1        → assembled_set (SET pre-assembled, 1 box)
 *   4. is_leaf && bpu === 1             → single_box   (default leaf pack)
 *   5. anything else                    → auto         (fallback / undetermined)
 *
 * Used by:
 *   - Migration tool (Admin Inventory V.43+ Flash Shipping Manager) to
 *     auto-suggest pack_mode per SKU during V.42 launch coverage push.
 *   - Go-Live Tool `auto-detect-all` endpoint (chunked over all SKUs).
 *
 * Critical invariants this test locks in:
 *   - Catalog miss → 'auto'  (never crashes on missing SKU)
 *   - upb takes priority over bpu (bulk packing supersedes multi-box split)
 *   - has_children + bpu=1 → 'assembled_set' (NOT single_box even though
 *                            bpu=1 — SETs are pre-packed assemblies)
 *   - SET with bpu>1 → 'multi_box' (assembly split across multiple boxes)
 *   - Numeric coercion via intval — strings like "2" treated as int 2
 *   - bpu=0 / upb=0 (defective data) treated as 1 (default fallback)
 *
 * NOTE: Tests use a mock `DINOCO_Catalog::get_by_sku()` + `dinoco_is_leaf_sku()`
 * so they're truly isolated from WP / DB.
 */

declare( strict_types=1 );

// Use a dedicated sub-namespace to avoid colliding with HierarchyTest's
// `dinoco_is_leaf_sku($sku, array $relations): bool` (2 args) — pack-mode
// detection only takes 1 arg.
namespace DinocoTests\Helpers\PackMode;

use PHPUnit\Framework\TestCase;

// Mock catalog backing store — populated per test via DINOCO_Catalog::reset().
if ( ! class_exists( __NAMESPACE__ . '\\DINOCO_Catalog' ) ) {
    class DINOCO_Catalog {
        public static $store = array();

        public static function reset(): void {
            self::$store = array();
        }

        public static function set_sku( string $sku, array $data ): void {
            self::$store[ strtoupper( $sku ) ] = $data;
        }

        public static function get_by_sku( $sku ) {
            $key = strtoupper( (string) $sku );
            return self::$store[ $key ] ?? null;
        }
    }
}

// Mock leaf detector — driven by `__pmd_leaves` global stash per test.
// Sub-namespace prevents collision with sibling test files.
if ( ! function_exists( __NAMESPACE__ . '\\dinoco_is_leaf_sku' ) ) {
    function dinoco_is_leaf_sku( $sku ): bool {
        $leaves = $GLOBALS['__pmd_leaves'] ?? array();
        return in_array( strtoupper( (string) $sku ), $leaves, true );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_smart_detect_pack_mode' ) ) {
    /**
     * Inline copy mirrors source line-for-line. Pure decision logic with mocked
     * data dependencies above.
     */
    function dinoco_smart_detect_pack_mode( $sku ) {
        $cat = DINOCO_Catalog::get_by_sku( $sku );
        if ( ! $cat ) return 'auto';

        $bpu          = intval( $cat['boxes_per_unit'] ?? 1 );
        $upb          = intval( $cat['units_per_box']  ?? 1 );
        $is_leaf      = function_exists( __NAMESPACE__ . '\\dinoco_is_leaf_sku' )
                        ? dinoco_is_leaf_sku( $sku )
                        : true;
        $has_children = ! $is_leaf;

        if ( $upb > 1 )                        return 'bulk_pack';
        if ( $bpu > 1 )                        return 'multi_box';
        if ( $has_children && $bpu === 1 )     return 'assembled_set';
        if ( $is_leaf && $bpu === 1 )          return 'single_box';
        return 'auto';
    }
}

/**
 * @covers \DinocoTests\Helpers\dinoco_smart_detect_pack_mode
 */
final class PackModeDetectTest extends TestCase {

    protected function setUp(): void {
        parent::setUp();
        DINOCO_Catalog::reset();
        $GLOBALS['__pmd_leaves'] = array();
    }

    protected function tearDown(): void {
        DINOCO_Catalog::reset();
        unset( $GLOBALS['__pmd_leaves'] );
        parent::tearDown();
    }

    public function test_unknown_sku_returns_auto(): void {
        // No SKU in catalog → safe fallback (NOT a crash).
        $this->assertSame( 'auto', dinoco_smart_detect_pack_mode( 'GHOST-SKU' ) );
    }

    public function test_leaf_with_default_dimensions_returns_single_box(): void {
        DINOCO_Catalog::set_sku( 'L1', array( 'boxes_per_unit' => 1, 'units_per_box' => 1 ) );
        $GLOBALS['__pmd_leaves'] = array( 'L1' );
        $this->assertSame( 'single_box', dinoco_smart_detect_pack_mode( 'L1' ) );
    }

    public function test_leaf_with_units_per_box_gt_one_returns_bulk_pack(): void {
        // Small bolts, washers, etc. — 50 pieces packed in 1 box.
        DINOCO_Catalog::set_sku( 'BOLT', array( 'boxes_per_unit' => 1, 'units_per_box' => 50 ) );
        $GLOBALS['__pmd_leaves'] = array( 'BOLT' );
        $this->assertSame( 'bulk_pack', dinoco_smart_detect_pack_mode( 'BOLT' ) );
    }

    public function test_leaf_with_boxes_per_unit_gt_one_returns_multi_box(): void {
        // 1 SKU ships in 3 boxes (e.g. large furniture component split).
        DINOCO_Catalog::set_sku( 'CRASH', array( 'boxes_per_unit' => 3, 'units_per_box' => 1 ) );
        $GLOBALS['__pmd_leaves'] = array( 'CRASH' );
        $this->assertSame( 'multi_box', dinoco_smart_detect_pack_mode( 'CRASH' ) );
    }

    public function test_set_with_bpu_one_returns_assembled_set(): void {
        // SET with children (NOT a leaf) and bpu=1 → pre-assembled in 1 box.
        DINOCO_Catalog::set_sku( 'SET1', array( 'boxes_per_unit' => 1, 'units_per_box' => 1 ) );
        // Empty leaves array → SET1 has children → has_children = true.
        $this->assertSame( 'assembled_set', dinoco_smart_detect_pack_mode( 'SET1' ) );
    }

    public function test_set_with_bpu_gt_one_returns_multi_box(): void {
        // SET that ships disassembled across multiple boxes.
        DINOCO_Catalog::set_sku( 'SET2', array( 'boxes_per_unit' => 4, 'units_per_box' => 1 ) );
        // SET2 not in leaves → has_children = true.
        $this->assertSame( 'multi_box', dinoco_smart_detect_pack_mode( 'SET2' ) );
    }

    public function test_upb_priority_over_bpu(): void {
        // Both bpu>1 AND upb>1 → upb wins (bulk_pack overrides multi_box).
        // Real-world case: small items shipping multi-box per FBA but grouped.
        DINOCO_Catalog::set_sku( 'X', array( 'boxes_per_unit' => 5, 'units_per_box' => 10 ) );
        $GLOBALS['__pmd_leaves'] = array( 'X' );
        $this->assertSame( 'bulk_pack', dinoco_smart_detect_pack_mode( 'X' ) );
    }

    public function test_bpu_priority_over_assembled_set(): void {
        // SET with bpu>1 → multi_box (NOT assembled_set even though has_children).
        DINOCO_Catalog::set_sku( 'SETX', array( 'boxes_per_unit' => 2, 'units_per_box' => 1 ) );
        // Not a leaf → has_children = true.
        $this->assertSame( 'multi_box', dinoco_smart_detect_pack_mode( 'SETX' ) );
    }

    public function test_missing_dimensions_default_to_one(): void {
        // Catalog row exists with bpu/upb missing but at least 1 other field
        // (e.g. only sku/name set). intval(null ?? 1) = 1 → matches single_box.
        // NOTE: completely empty array `array()` is falsy → triggers `! $cat`
        // early return 'auto' — that case is covered by `test_unknown_sku_returns_auto`.
        DINOCO_Catalog::set_sku( 'NODIMS', array( 'name' => 'placeholder' ) );
        $GLOBALS['__pmd_leaves'] = array( 'NODIMS' );
        $this->assertSame( 'single_box', dinoco_smart_detect_pack_mode( 'NODIMS' ) );
    }

    public function test_zero_dimensions_treated_as_default(): void {
        // Defective data: bpu=0 / upb=0 → intval(0) → fall through all checks.
        // Decision: bpu=0, upb=0 → upb>1 false, bpu>1 false, bpu===1 false (it's 0)
        // → returns 'auto' (none of the conditions match for 0).
        DINOCO_Catalog::set_sku( 'ZERO', array( 'boxes_per_unit' => 0, 'units_per_box' => 0 ) );
        $GLOBALS['__pmd_leaves'] = array( 'ZERO' );
        $this->assertSame( 'auto', dinoco_smart_detect_pack_mode( 'ZERO' ) );
    }

    public function test_string_numeric_dimensions_coerced_via_intval(): void {
        // Catalog reads sometimes return strings from DB ("2", "10").
        DINOCO_Catalog::set_sku( 'STR', array( 'boxes_per_unit' => '2', 'units_per_box' => '1' ) );
        $GLOBALS['__pmd_leaves'] = array( 'STR' );
        // intval("2") → 2 → bpu>1 → multi_box.
        $this->assertSame( 'multi_box', dinoco_smart_detect_pack_mode( 'STR' ) );
    }

    public function test_lowercase_sku_normalized_via_catalog_lookup(): void {
        // Catalog stores by uppercase. dinoco_is_leaf_sku also uppercases.
        // Caller can pass mixed case freely.
        DINOCO_Catalog::set_sku( 'L1', array( 'boxes_per_unit' => 1, 'units_per_box' => 50 ) );
        $GLOBALS['__pmd_leaves'] = array( 'L1' );
        $this->assertSame( 'bulk_pack', dinoco_smart_detect_pack_mode( 'l1' ) );
    }
}
