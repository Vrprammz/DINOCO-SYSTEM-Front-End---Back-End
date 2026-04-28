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

        // ── ACF Pro function stubs ────────────────────────────────────
        // ACF Pro is license-gated and not installed in CI. Stub the
        // handful of ACF functions that DINOCO snippets call, mirroring
        // how ACF Pro stores values internally (postmeta key=name with
        // a `_field` companion key for field group reference).

        if ( ! function_exists( 'get_field' ) ) {
            /**
             * Read an ACF field value via direct postmeta read.
             * Returns null for empty/missing (matches ACF Pro behavior closer than '').
             */
            function get_field( $selector, $post_id = false, $format_value = true ) {
                if ( $post_id === false ) {
                    $post_id = get_the_ID();
                }
                if ( $post_id === false || $post_id === 0 ) {
                    // option pages: ACF stores at options key — DINOCO doesn't use option pages in tested paths
                    return null;
                }
                $val = get_post_meta( $post_id, $selector, true );
                return $val === '' ? null : $val;
            }
        }

        if ( ! function_exists( 'update_field' ) ) {
            function update_field( $selector, $value, $post_id = false ) {
                if ( $post_id === false ) {
                    $post_id = get_the_ID();
                }
                return update_post_meta( $post_id, $selector, $value );
            }
        }

        if ( ! function_exists( 'have_rows' ) ) {
            // Minimal stub — DINOCO test paths don't exercise nested ACF repeaters.
            // Returning false short-circuits any have_rows() loops cleanly.
            function have_rows( $selector, $post_id = false ) {
                return false;
            }
        }

        if ( ! function_exists( 'the_row' ) ) {
            function the_row() {
                return array();
            }
        }

        if ( ! function_exists( 'get_sub_field' ) ) {
            function get_sub_field( $selector, $format_value = true ) {
                return null;
            }
        }

        if ( ! function_exists( 'acf_add_local_field_group' ) ) {
            // Snippets that register field groups expect this to exist.
            // No-op in tests — we don't validate field group definitions.
            function acf_add_local_field_group( $field_group ) {
                return true;
            }
        }

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
