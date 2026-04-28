<?php
/**
 * DinocoIntegrationTestCase — base class for Phase 5 integration tests.
 *
 * Extends Yoast WPIntegration\TestCase (which extends WP_UnitTestCase from
 * wordpress-develop) so each test gets:
 *   - Real WordPress runtime with database
 *   - Per-test transaction rollback (no manual cleanup needed for core tables)
 *   - WP factory helpers ($this->factory->user, $this->factory->post, etc.)
 *
 * Adds DINOCO-specific helpers:
 *   - seed_snippet()        — INSERT a snippet body into wp_snippets
 *   - eval_snippet_inline() — load + eval() a snippet file from project root
 *   - fire_init_hooks()     — explicit init/rest_api_init hook firing
 *   - mock_acf_field()      — write to wp_postmeta directly (no ACF Pro license)
 *   - load_fixture()        — execute a .sql fixture against the test DB
 */

declare( strict_types=1 );

namespace DinocoTests\Integration;

use Yoast\WPTestUtils\WPIntegration\TestCase;

abstract class DinocoIntegrationTestCase extends TestCase {

    /**
     * Tables truncated in tear_down(). Matches DINOCO custom tables defined in
     * fixtures/schema-dinoco.sql.
     *
     * @var string[]
     */
    protected array $dinoco_tables = array(
        'dinoco_products',
        'dinoco_audit_log',
        'dinoco_slip_log',
        'dinoco_warehouses',
        'dinoco_warehouse_stock',
        'dinoco_stock_transactions',
        'dinoco_order_attempt_log',
        'dinoco_bo_queue',
        'dinoco_product_makers',
        'dinoco_maker_product_observations',
    );

    /**
     * Snippet wp_snippets ID range reserved for tests. Production snippets are < 1000;
     * tests use 9000-9999 to avoid collisions.
     */
    protected const TEST_SNIPPET_ID_MIN = 9000;
    protected const TEST_SNIPPET_ID_MAX = 9999;

    /**
     * Insert a code snippet body into wp_snippets so DB-driven loaders find it.
     */
    protected function seed_snippet( int $db_id, string $code, string $name = 'test-snippet' ): void {
        $this->assertGreaterThanOrEqual(
            self::TEST_SNIPPET_ID_MIN,
            $db_id,
            'Test snippet IDs must be >= ' . self::TEST_SNIPPET_ID_MIN . ' to avoid prod collision'
        );
        $this->assertLessThanOrEqual(
            self::TEST_SNIPPET_ID_MAX,
            $db_id,
            'Test snippet IDs must be <= ' . self::TEST_SNIPPET_ID_MAX
        );

        global $wpdb;
        $wpdb->replace(
            $wpdb->prefix . 'snippets',
            array(
                'id'          => $db_id,
                'name'        => $name,
                'code'        => $code,
                'active'      => 1,
                'scope'       => 'global',
                'priority'    => 10,
                'description' => 'integration test',
                'tags'        => '',
            )
        );
    }

    /**
     * Load + eval a DINOCO snippet file (one-shot per process).
     */
    protected function eval_snippet_inline( string $relative_path ): void {
        SnippetLoader::load( $relative_path );
    }

    /**
     * Fire init + rest_api_init so snippets that registered handlers via
     * those hooks become active. Tests opt-in explicitly so eval_snippet_inline
     * itself is side-effect-light.
     */
    protected function fire_init_hooks(): void {
        if ( ! did_action( 'init' ) ) {
            do_action( 'init' );
        }
        if ( ! did_action( 'rest_api_init' ) ) {
            do_action( 'rest_api_init' );
        }
    }

    /**
     * Stub an ACF field by writing directly to wp_postmeta. This mirrors how
     * ACF Pro stores values internally — `get_field($key, $post_id)` will
     * return what we wrote without needing an active ACF Pro license.
     *
     * @param int    $post_id
     * @param string $key
     * @param mixed  $value
     */
    protected function mock_acf_field( int $post_id, string $key, $value ): void {
        update_post_meta( $post_id, $key, $value );
        update_post_meta( $post_id, '_' . $key, 'field_' . md5( $key ) );
    }

    /**
     * Load a .sql fixture from tests/integration/fixtures/.
     *
     * @param string $filename e.g. 'seed-distributors.sql'
     */
    protected function load_fixture( string $filename ): void {
        global $wpdb;
        $path = __DIR__ . '/fixtures/' . $filename;
        if ( ! file_exists( $path ) ) {
            $this->fail( "Fixture not found: {$path}" );
        }

        $sql = (string) file_get_contents( $path );
        $sql = str_replace( '{PREFIX}', $wpdb->prefix, $sql );
        $sql = (string) preg_replace( '/^--.*$/m', '', $sql );

        foreach ( array_filter( array_map( 'trim', explode( ';', $sql ) ) ) as $stmt ) {
            $wpdb->query( $stmt );
        }
    }

    /**
     * Convenience: assert that a value is a WP_Error with optional code match.
     */
    protected function assertWPError( $thing, ?string $expected_code = null, string $message = '' ): void {
        $this->assertInstanceOf( \WP_Error::class, $thing, $message ?: 'Expected WP_Error' );
        if ( $expected_code !== null ) {
            $this->assertSame(
                $expected_code,
                $thing->get_error_code(),
                $message ?: "Expected WP_Error code '{$expected_code}'"
            );
        }
    }

    /**
     * tear_down — TRUNCATE DINOCO custom tables + clean test snippets.
     * WordPress core tables are rolled back automatically by Yoast TestCase.
     */
    protected function tear_down(): void {
        global $wpdb;

        foreach ( $this->dinoco_tables as $t ) {
            $tbl = $wpdb->prefix . $t;
            // Best-effort — TRUNCATE will fail silently if the table doesn't exist
            // in this test's universe. Custom-table tests opt-in via setUp().
            $wpdb->query( "TRUNCATE TABLE {$tbl}" );
        }

        // Clean test-range snippets only (preserve any prod snippets if seeded).
        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$wpdb->prefix}snippets WHERE id BETWEEN %d AND %d",
                self::TEST_SNIPPET_ID_MIN,
                self::TEST_SNIPPET_ID_MAX
            )
        );

        parent::tear_down();
    }
}
