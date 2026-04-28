<?php
/**
 * SnippetLoader — load DINOCO PHP snippets in test runtime without the
 * WP Code Snippets plugin.
 *
 * The DINOCO project stores ~80 snippets in the `wp_snippets` table at
 * runtime; in tests we load them by reading the file from disk and
 * `eval()`ing the body. This avoids dependence on the Code Snippets plugin
 * (license-gated, race-prone init order).
 *
 * Snippet file convention: NO leading `<?php` tag (the Code Snippets plugin
 * adds it). The loader strips a defensive leading `<?php` if present.
 *
 * Side-effect guard: defines `DINOCO_TEST_LOADING_SNIPPET` while evaluating
 * so snippets that schedule cron / register HTTP routes can opt out via:
 *
 *     if ( defined( 'DINOCO_TEST_LOADING_SNIPPET' ) ) return;
 *
 * Tests opt back in via `DinocoIntegrationTestCase::fire_init_hooks()`.
 */

declare( strict_types=1 );

namespace DinocoTests\Integration;

final class SnippetLoader {

    /** @var array<string, true> per-process cache of already-loaded snippets */
    private static array $loaded = array();

    /**
     * Project root absolute path.
     */
    public static function project_root(): string {
        return dirname( __DIR__, 2 );
    }

    /**
     * Load a snippet file from project root and eval its body once per process.
     *
     * @param string $relative_path e.g. '[B2B] Snippet 15: Custom Tables & JWT Session'
     * @throws \RuntimeException when the file is unreadable
     */
    public static function load( string $relative_path ): void {
        if ( isset( self::$loaded[ $relative_path ] ) ) {
            return;
        }

        $abs = self::project_root() . '/' . ltrim( $relative_path, '/' );
        $body = @file_get_contents( $abs );
        if ( $body === false ) {
            throw new \RuntimeException( "SnippetLoader: cannot read {$abs}" );
        }

        // Strip leading <?php (defensive — DINOCO files don't have it but Composer files might).
        $body = (string) preg_replace( '/^\s*<\?php\s+/', '', $body );
        // Strip trailing closing tag.
        $body = (string) preg_replace( '/\?>\s*$/', '', $body );

        if ( ! defined( 'DINOCO_TEST_LOADING_SNIPPET' ) ) {
            define( 'DINOCO_TEST_LOADING_SNIPPET', true );
        }

        // phpcs:disable Squiz.PHP.Eval.Discouraged
        eval( $body ); // @codingStandardsIgnoreLine — required to test snippet bodies in isolation
        // phpcs:enable

        self::$loaded[ $relative_path ] = true;
    }

    /**
     * Load only the CPT registration portions (used in muplugins_loaded
     * filter to keep the post-type registry available before tests run).
     * For now this is a no-op placeholder; if a future test needs CPTs at
     * boot time, wire specific snippets here.
     */
    public static function load_cpt_only(): void {
        // Intentionally empty — opt-in per-test via load() instead.
    }

    /**
     * Force-clear the loaded cache. Used between test classes if needed.
     */
    public static function reset(): void {
        self::$loaded = array();
    }
}
