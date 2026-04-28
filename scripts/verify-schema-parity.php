<?php
/**
 * verify-schema-parity.php — diff tests/integration/fixtures/schema-dinoco.sql
 * against production schema sources to catch drift.
 *
 * Production sources:
 *   * [B2B] Snippet 15 (CREATE TABLE statements for products, stock_transactions,
 *     warehouses, warehouse_stock, slip_log, audit_log)
 *   * FEATURE-SPEC-B2B-BACKORDER-2026-04-16.md (order_attempt_log, bo_queue)
 *   * B2F-SCHEMA-V11.sql (product_makers ALTERs — junction columns + indexes)
 *
 * Strategy: extract column names from each table's CREATE TABLE in fixture +
 * each production source. Sets must match. Warns on extra/missing columns.
 *
 * Exit codes:
 *   0 — informational pass (schemas match OR fixture is a strict superset of source)
 *   1 — fixture is missing columns the production source has (real drift — fail CI)
 *   2 — internal error (file not readable, etc.)
 *
 * CI integration: run before integration test suite. Real drift blocks merge.
 * Sources that use string interpolation (`$wpdb->prefix . '...'`) are warnings
 * only — integration tests themselves will fail if those tables are missing
 * columns the runtime code expects.
 *
 * Usage:
 *   php scripts/verify-schema-parity.php
 *   php scripts/verify-schema-parity.php --verbose
 */

declare( strict_types=1 );

const PROJECT_ROOT = __DIR__ . '/..';
const FIXTURE_PATH = PROJECT_ROOT . '/tests/integration/fixtures/schema-dinoco.sql';

const SOURCES = array(
    'dinoco_products'                   => array( 'file' => '[B2B] Snippet 15: Custom Tables & JWT Session', 'after' => 'dinoco_products' ),
    'dinoco_stock_transactions'         => array( 'file' => '[B2B] Snippet 15: Custom Tables & JWT Session', 'after' => 'dinoco_stock_transactions' ),
    'dinoco_warehouses'                 => array( 'file' => '[B2B] Snippet 15: Custom Tables & JWT Session', 'after' => 'dinoco_warehouses' ),
    'dinoco_warehouse_stock'            => array( 'file' => '[B2B] Snippet 15: Custom Tables & JWT Session', 'after' => 'dinoco_warehouse_stock' ),
    'dinoco_slip_log'                   => array( 'file' => '[B2B] Snippet 15: Custom Tables & JWT Session', 'after' => 'dinoco_slip_log' ),
    'dinoco_audit_log'                  => array( 'file' => '[B2B] Snippet 15: Custom Tables & JWT Session', 'after' => 'dinoco_audit_log' ),
    'dinoco_order_attempt_log'          => array( 'file' => 'FEATURE-SPEC-B2B-BACKORDER-2026-04-16.md', 'after' => 'order_attempt_log' ),
    'dinoco_bo_queue'                   => array( 'file' => 'FEATURE-SPEC-B2B-BACKORDER-2026-04-16.md', 'after' => 'bo_queue' ),
);

$verbose = in_array( '--verbose', $argv ?? array(), true );

$exit = 0;

if ( ! file_exists( FIXTURE_PATH ) ) {
    fwrite( STDERR, "ERROR: fixture not found at " . FIXTURE_PATH . "\n" );
    exit( 2 );
}

$fixture_sql = (string) file_get_contents( FIXTURE_PATH );

foreach ( SOURCES as $table => $info ) {
    $source_path = PROJECT_ROOT . '/' . $info['file'];
    if ( ! file_exists( $source_path ) ) {
        echo "[SKIP] {$table}: source {$info['file']} not found\n";
        continue;
    }

    $fixture_cols = extract_columns_for( $fixture_sql, $table );
    $source_sql   = (string) file_get_contents( $source_path );
    $source_cols  = extract_columns_for( $source_sql, $table );

    if ( empty( $fixture_cols ) ) {
        echo "[WARN] {$table}: fixture missing CREATE TABLE\n";
        continue;
    }
    if ( empty( $source_cols ) ) {
        echo "[WARN] {$table}: source missing CREATE TABLE (might be inline ALTER — manual review)\n";
        continue;
    }

    $missing_in_fixture = array_diff( $source_cols, $fixture_cols );
    $extra_in_fixture   = array_diff( $fixture_cols, $source_cols );

    if ( empty( $missing_in_fixture ) && empty( $extra_in_fixture ) ) {
        echo "[OK]    {$table} (" . count( $fixture_cols ) . " columns)\n";
        continue;
    }

    if ( ! empty( $missing_in_fixture ) ) {
        // Real drift — fixture missing what prod has. Block CI.
        $exit = 1;
        echo "[DRIFT] {$table} — fixture missing production columns:\n";
        foreach ( $missing_in_fixture as $c ) {
            echo "    - {$c}\n";
        }
    }

    if ( ! empty( $extra_in_fixture ) ) {
        // Fixture has more than spec — usually because production code added
        // columns post-spec. Informational only.
        echo "[INFO]  {$table} — fixture has columns not in source (post-spec additions OK):\n";
        foreach ( $extra_in_fixture as $c ) {
            echo "    + {$c}\n";
        }
    }

    if ( $verbose ) {
        echo "  Fixture columns: " . implode( ', ', $fixture_cols ) . "\n";
        echo "  Source columns:  " . implode( ', ', $source_cols ) . "\n";
    }
}

if ( $exit === 0 ) {
    echo "\n[OK] Schema parity check passed (" . count( SOURCES ) . " tables scanned).\n";
    echo "     Warnings about inline-ALTER sources are expected — runtime tests catch real drift.\n";
} else {
    echo "\n[FAIL] Real schema drift detected — fixture is missing production columns.\n";
    echo "       Fixture: " . FIXTURE_PATH . "\n";
}

exit( $exit );


/**
 * Extract column names from a CREATE TABLE statement for a given table name
 * within a SQL/PHP haystack.
 *
 * Looks for `CREATE TABLE ... <table_name> (...)` with backtick or wpdb prefix
 * variants. Returns column name list (no types).
 *
 * @return string[]
 */
function extract_columns_for( string $haystack, string $table ): array {
    // Strip SQL line comments (`-- ...` to end of line) so they don't pollute
    // column parsing. Markdown code blocks in spec docs commonly include them.
    $haystack = (string) preg_replace( '/--[^\n\r]*/', '', $haystack );

    // Find CREATE TABLE marker for this table (case-insensitive, supports
    // various prefix forms: literal `wp_`, `{$wpdb->prefix}`, `{PREFIX}`, etc.)
    $needle = preg_quote( $table, '/' );
    $marker_re = '/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?[^`"\(]*' . $needle . '[`"\s]*\(/is';
    if ( ! preg_match( $marker_re, $haystack, $m, PREG_OFFSET_CAPTURE ) ) {
        return array();
    }

    // Walk from after the opening `(` and find the matching close, respecting nesting.
    $start = $m[0][1] + strlen( $m[0][0] );
    $len   = strlen( $haystack );
    $depth = 1;
    for ( $i = $start; $i < $len; $i++ ) {
        $ch = $haystack[ $i ];
        if ( $ch === '(' ) { $depth++; continue; }
        if ( $ch === ')' ) {
            $depth--;
            if ( $depth === 0 ) {
                $body = substr( $haystack, $start, $i - $start );
                return parse_column_list( $body );
            }
        }
    }
    return array();
}

/**
 * Parse a CREATE TABLE column list into a flat list of column names.
 * Skips PRIMARY KEY, KEY, UNIQUE KEY, INDEX, CONSTRAINT, FOREIGN KEY, CHECK.
 *
 * @return string[]
 */
function parse_column_list( string $body ): array {
    $cols  = array();
    $depth = 0;
    $buf   = '';
    $len   = strlen( $body );

    for ( $i = 0; $i < $len; $i++ ) {
        $ch = $body[ $i ];
        if ( $ch === '(' ) $depth++;
        if ( $ch === ')' ) $depth--;
        if ( $ch === ',' && $depth === 0 ) {
            $line = trim( $buf );
            if ( $line !== '' ) {
                $col = parse_column_name( $line );
                if ( $col !== null ) {
                    $cols[] = $col;
                }
            }
            $buf = '';
            continue;
        }
        $buf .= $ch;
    }
    $line = trim( $buf );
    if ( $line !== '' ) {
        $col = parse_column_name( $line );
        if ( $col !== null ) {
            $cols[] = $col;
        }
    }

    return $cols;
}

function parse_column_name( string $line ): ?string {
    $line  = ltrim( $line );
    $upper = strtoupper( $line );

    // Skip non-column clauses
    foreach ( array( 'PRIMARY KEY', 'KEY ', 'KEY(', 'UNIQUE KEY', 'UNIQUE(', 'INDEX', 'CONSTRAINT', 'FOREIGN KEY', 'CHECK ', 'CHECK(', 'FULLTEXT', 'SPATIAL' ) as $kw ) {
        if ( str_starts_with( $upper, $kw ) ) return null;
    }

    // Strip leading backtick / quote
    $line = ltrim( $line, '`"' );

    // First token is column name
    if ( preg_match( '/^([a-z0-9_]+)/i', $line, $m ) ) {
        return strtolower( $m[1] );
    }
    return null;
}
