<?php
/**
 * DINOCO Integration Test Bootstrap (Phase 5 — V.1.0).
 *
 * Boots wordpress-develop test suite, creates DINOCO custom tables, and prepares
 * the integration test runtime. Falls back to a clear error message if the WP
 * test library is not available so devs aren't stuck guessing.
 *
 * Usage:
 *   1. Install wordpress-develop test suite:
 *        bash bin/install-wp-tests.sh wordpress_test root '' 127.0.0.1 latest
 *   2. Set WP_TESTS_DIR (or use the default /tmp/wordpress-tests-lib):
 *        export WP_TESTS_DIR=/tmp/wordpress-tests-lib
 *   3. Run:
 *        composer test:integration
 *
 * See docs/runbooks/TESTING-PHASE-5.md for full setup instructions.
 */

declare( strict_types=1 );

// ── Composer autoload ─────────────────────────────────────────────
$_dinoco_autoload = dirname( __DIR__, 2 ) . '/vendor/autoload.php';
if ( ! file_exists( $_dinoco_autoload ) ) {
    fwrite( STDERR, "ERROR: Composer autoload missing at {$_dinoco_autoload}\nRun: composer install\n" );
    exit( 1 );
}
require_once $_dinoco_autoload;

// ── Locate wordpress-develop test suite ───────────────────────────
$_dinoco_wp_tests_dir = getenv( 'WP_TESTS_DIR' );
if ( ! $_dinoco_wp_tests_dir ) {
    $_dinoco_wp_tests_dir = '/tmp/wordpress-tests-lib';
}
$_dinoco_wp_tests_dir = rtrim( $_dinoco_wp_tests_dir, '/\\' );

if ( ! file_exists( $_dinoco_wp_tests_dir . '/includes/functions.php' ) ) {
    fwrite(
        STDERR,
        "\n=== DINOCO Integration Tests — WP test library not found ===\n"
        . "Looked in: {$_dinoco_wp_tests_dir}/includes/functions.php\n\n"
        . "To install (one-time setup):\n"
        . "    bash bin/install-wp-tests.sh wordpress_test root '' 127.0.0.1 latest\n\n"
        . "Or set WP_TESTS_DIR to your wordpress-develop checkout:\n"
        . "    export WP_TESTS_DIR=/path/to/wordpress-develop/tests/phpunit\n\n"
        . "See docs/runbooks/TESTING-PHASE-5.md for full instructions.\n\n"
    );
    exit( 1 );
}

// ── Hook in BEFORE WP loads ──────────────────────────────────────
require_once $_dinoco_wp_tests_dir . '/includes/functions.php';

// Mark this is a test boot so DINOCO snippets that grep for it can opt-out of side effects.
if ( ! defined( 'DINOCO_INTEGRATION_TESTING' ) ) {
    define( 'DINOCO_INTEGRATION_TESTING', true );
}

tests_add_filter(
    'muplugins_loaded',
    static function (): void {
        // Create DINOCO custom tables (idempotent via CREATE TABLE IF NOT EXISTS).
        global $wpdb;

        $schema_path = __DIR__ . '/fixtures/schema-dinoco.sql';
        if ( ! file_exists( $schema_path ) ) {
            fwrite( STDERR, "WARN: schema-dinoco.sql not found at {$schema_path}\n" );
            return;
        }

        $schema = file_get_contents( $schema_path );
        $schema = str_replace( '{PREFIX}', $wpdb->prefix, $schema );

        // Strip line comments + split on `;` line endings (same line-aware
        // splitter as DinocoIntegrationTestCase::split_sql_statements; we
        // can't reference that class here because muplugins_loaded fires
        // before our base case is autoloaded).
        $schema = preg_replace( '/^--.*$/m', '', $schema );
        $stmts  = preg_split( '/;\s*(?:\R|$)/', $schema );

        foreach ( $stmts as $stmt ) {
            $stmt = trim( $stmt );
            if ( $stmt === '' ) {
                continue;
            }
            $wpdb->query( $stmt );
        }
    }
);

// ── Boot the WordPress test environment ──────────────────────────
require $_dinoco_wp_tests_dir . '/includes/bootstrap.php';

// ── DINOCO base test case (after WP_UnitTestCase exists) ─────────
require_once __DIR__ . '/snippet-loader.php';
require_once __DIR__ . '/DinocoIntegrationTestCase.php';
