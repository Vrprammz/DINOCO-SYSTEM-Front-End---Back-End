<?php
/**
 * DINOCO Test Bootstrap (V.1.0)
 *
 * Minimal bootstrap — pure PHP helpers only (no WordPress boot required).
 * For WP-integrated tests later, swap this out for wordpress-develop setup.
 *
 * Scope:
 *   - Stub WordPress functions that pure helpers may reference defensively
 *   - PSR-4 autoload DinocoTests\ namespace → tests/
 */

declare( strict_types=1 );

// ── Composer autoload (required for PHPUnit) ──────────────────
$autoload = __DIR__ . '/../vendor/autoload.php';
if ( file_exists( $autoload ) ) {
    require_once $autoload;
} else {
    fwrite(
        STDERR,
        "ERROR: composer autoload missing. Run: composer install\n"
    );
    exit( 1 );
}

// ── WordPress function stubs (defensive) ───────────────────────
// Only stub what our pure helpers touch. DO NOT pull real WP here —
// keeps tests fast and deterministic.

if ( ! function_exists( 'esc_html' ) ) {
    function esc_html( $text ) {
        return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
    }
}

if ( ! function_exists( 'sanitize_text_field' ) ) {
    function sanitize_text_field( $str ) {
        return trim( strip_tags( (string) $str ) );
    }
}

if ( ! function_exists( 'absint' ) ) {
    function absint( $n ) {
        return abs( (int) $n );
    }
}

if ( ! function_exists( 'wp_json_encode' ) ) {
    function wp_json_encode( $data, $options = 0, $depth = 512 ) {
        return json_encode( $data, $options, $depth );
    }
}

if ( ! defined( 'ABSPATH' ) ) {
    define( 'ABSPATH', __DIR__ . '/fake-abspath/' );
}
