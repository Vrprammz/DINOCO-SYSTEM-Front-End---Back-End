<?php
/**
 * WpBootSmokeTest — Phase 5 M1 smoke test.
 *
 * Verifies that the integration test bootstrap works end-to-end:
 *   1. WordPress core is loaded (is_multisite + ABSPATH defined)
 *   2. The DINOCO custom tables were created in the test database
 *   3. WP factory helpers work (create a user)
 *   4. wp_snippets table accepts our test ID range (9000-9999)
 *
 * If this test fails, none of the other integration tests will run reliably.
 * Keep it lightweight — it's the canary, not a feature test.
 */

declare( strict_types=1 );

namespace DinocoTests\Integration;

final class WpBootSmokeTest extends DinocoIntegrationTestCase {

    public function test_wordpress_core_loaded(): void {
        $this->assertTrue( defined( 'ABSPATH' ), 'ABSPATH must be defined when WP boots' );
        $this->assertTrue( function_exists( 'is_multisite' ), 'is_multisite() should be available' );
        $this->assertTrue( function_exists( 'wp_create_nonce' ), 'wp_create_nonce() should be available' );
    }

    public function test_dinoco_custom_tables_exist(): void {
        global $wpdb;

        foreach ( $this->dinoco_tables as $t ) {
            $tbl = $wpdb->prefix . $t;
            $exists = (bool) $wpdb->get_var(
                $wpdb->prepare( 'SHOW TABLES LIKE %s', $tbl )
            );
            $this->assertTrue(
                $exists,
                "Custom table {$tbl} should be created by tests/integration/fixtures/schema-dinoco.sql"
            );
        }
    }

    public function test_wp_factory_creates_user(): void {
        $user_id = $this->factory->user->create( array( 'role' => 'subscriber' ) );
        $this->assertIsInt( $user_id );
        $this->assertGreaterThan( 0, $user_id );

        $user = get_user_by( 'id', $user_id );
        $this->assertNotFalse( $user );
        $this->assertSame( 'subscriber', $user->roles[0] );
    }

    public function test_seed_snippet_helper_works(): void {
        global $wpdb;

        $snip_table = $wpdb->prefix . 'snippets';

        // Skip if Code Snippets table absent (plugin not installed in CI core WP).
        $exists = (bool) $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $snip_table ) );
        if ( ! $exists ) {
            $this->markTestSkipped( 'wp_snippets table not present (Code Snippets plugin not loaded — expected in minimal WP boot)' );
        }

        $this->seed_snippet( 9000, '<?php echo "smoke";', 'smoke-test' );

        $row = $wpdb->get_row(
            $wpdb->prepare( "SELECT id, name FROM {$snip_table} WHERE id = %d", 9000 )
        );

        $this->assertNotNull( $row );
        $this->assertSame( 'smoke-test', $row->name );
    }

    public function test_load_fixture_distributors(): void {
        global $wpdb;

        $this->load_fixture( 'seed-distributors.sql' );

        $count = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->users} WHERE ID BETWEEN 9001 AND 9007"
        );
        $this->assertSame( 7, $count, 'All 7 test distributors should be seeded' );

        $rank = get_user_meta( 9002, 'b2b_rank', true );
        $this->assertSame( 'silver', $rank );
    }
}
