<?php
/**
 * DinocoIntegrationTestCase — base class for Phase 5 integration tests.
 *
 * Extends WP_UnitTestCase from wordpress-develop directly so each test gets:
 *   - Real WordPress runtime with database
 *   - Per-test transaction rollback (no manual cleanup needed for core tables)
 *   - WP factory helpers ($this->factory->user, $this->factory->post, etc.)
 *
 * Why not yoast/wp-test-utils: that wrapper requires PHPUnit ^9.0 which
 * conflicts with our PHPUnit ^10.0. WP_UnitTestCase from wordpress-develop
 * is the underlying class anyway and works directly with PHPUnit 10 + the
 * phpunit-polyfills shim that ships with the WP test suite.
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

// WP_UnitTestCase lives in the global namespace and is loaded by
// wordpress-develop's includes/bootstrap.php (required from
// tests/integration/bootstrap.php BEFORE this file is autoloaded).
abstract class DinocoIntegrationTestCase extends \WP_UnitTestCase {

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
     * Splitter is line-aware: only treats `;` as a statement terminator when
     * followed by whitespace + newline (or end of file). This avoids breaking
     * INSERTs whose VALUES contain PHP-serialized data that uses `;` internally
     * (e.g. `'a:1:{i:0;i:9007;}'`).
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

        foreach ( self::split_sql_statements( $sql ) as $stmt ) {
            $wpdb->query( $stmt );
        }
    }

    /**
     * Split a SQL blob into individual statements without breaking on
     * semicolons inside string literals. Heuristic: a `;` followed by
     * optional whitespace and a newline (or end of input) is a separator.
     *
     * @return string[] non-empty statements, trimmed
     */
    public static function split_sql_statements( string $sql ): array {
        // `;\s*\R` = literal ; + spaces + newline. `\R` matches CRLF/LF/CR.
        // Tail-anchor `;\s*$` catches a trailing statement-terminator at EOF.
        $parts = preg_split( '/;\s*(?:\R|$)/', $sql );
        if ( $parts === false ) return array();
        return array_values( array_filter( array_map( 'trim', $parts ), fn( $s ) => $s !== '' ) );
    }

    /**
     * Convenience: assert that a value is a WP_Error with optional code match.
     *
     * NOT named `assertWPError` — that clashes with WP_UnitTestCase_Base's own
     * static helper (different signature: $actual, $message). Use this when
     * you want to match a specific error code; for plain instance checks,
     * call WP's `static::assertWPError($result)` directly.
     */
    protected function assertDinocoWPError( $thing, ?string $expected_code = null, string $message = '' ): void {
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
     * WordPress core tables are rolled back automatically by WP_UnitTestCase_Base.
     *
     * Must be PUBLIC (not protected) — WP_UnitTestCase_Base declares it public
     * via phpunit-polyfills set_up/tear_down camelCase shim and PHP enforces
     * matching visibility on overrides.
     *
     * Suppresses wpdb error reporting around best-effort cleanup queries —
     * a missing table (e.g. wp_snippets when Code Snippets plugin not in CI's
     * minimal WP install) shouldn't pollute test output with red ERROR
     * messages. Real test assertions bring back error reporting via setUp().
     */
    public function tear_down(): void {
        global $wpdb;
        $prev_show     = $wpdb->show_errors;
        $prev_suppress = $wpdb->suppress_errors;
        $wpdb->show_errors     = false;
        $wpdb->suppress_errors = true;

        foreach ( $this->dinoco_tables as $t ) {
            $tbl = $wpdb->prefix . $t;
            // Best-effort — TRUNCATE will fail silently if the table doesn't exist.
            $wpdb->query( "TRUNCATE TABLE {$tbl}" );
        }

        // Clean test-range snippets only (preserve any prod snippets if seeded).
        // Skip if wp_snippets table doesn't exist (Code Snippets plugin not
        // installed in the CI's minimal core WP — expected).
        $snip_table   = $wpdb->prefix . 'snippets';
        $table_exists = (bool) $wpdb->get_var(
            $wpdb->prepare( 'SHOW TABLES LIKE %s', $snip_table )
        );
        if ( $table_exists ) {
            $wpdb->query(
                $wpdb->prepare(
                    "DELETE FROM {$snip_table} WHERE id BETWEEN %d AND %d",
                    self::TEST_SNIPPET_ID_MIN,
                    self::TEST_SNIPPET_ID_MAX
                )
            );
        }

        $wpdb->show_errors     = $prev_show;
        $wpdb->suppress_errors = $prev_suppress;

        parent::tear_down();
    }
}
