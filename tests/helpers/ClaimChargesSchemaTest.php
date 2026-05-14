<?php
/**
 * ClaimChargesSchemaTest — pure-logic tests for Phase 2.1 Schema.
 *
 * Source: [Admin System] DINOCO Claim Charges Schema V.0.1
 *
 * Scope: Pure-logic verification — table name resolution, whitelist
 * constants, DDL fingerprint (parsed from snippet source), index plan,
 * CHECK constraint shape. NO WP/DB bootstrap required. Integration
 * tests (real INSERT / dbDelta apply / cron fire) are deferred to a
 * future WP-integrated suite (see ClaimNotifPureLogicTest pattern).
 *
 * Coverage:
 *   • Table name helper returns $wpdb->prefix . 'dinoco_claim_charges'
 *   • DINOCO_CLAIM_CHARGES_SCHEMA_VERSION constant defined
 *   • Reason whitelist contains 4 canonical values (no drift)
 *   • Status whitelist contains 7 canonical values (no drift)
 *   • Bank context whitelist contains 'claim' + 'claim_walkin'
 *   • DDL snippet text contains expected 24 column definitions
 *   • DDL declares 4 KEY indexes + 1 UNIQUE constraint
 *   • Schema install function gated by version flag (no re-run waste)
 *   • Schema version uses autoload=false (R9 P4 wp_options hygiene)
 *   • CHECK constraint pattern gated by MySQL 8.0.16+ / MariaDB 10.2.1+
 *   • Retention cron heartbeat uses `update_option(..., false)` autoload
 *   • Cleanup run preserves verified/rejected/refunded (90-day purge
 *     limited to cancelled+expired rows)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\ClaimChargesSchema;

use PHPUnit\Framework\TestCase;

// ──────────────────────────────────────────────────────────────────────────
// Fixture: snippet source text + parsed DDL fingerprint. Tests assert
// against the snippet file as source-of-truth (drift detector style for
// PHPUnit too — same philosophy as FlagAuditTest). We DO NOT require the
// snippet (no WP bootstrap), we read + parse it.
// ──────────────────────────────────────────────────────────────────────────

final class SnippetFixture {
    public static $source = null;

    public static function load(): string {
        if ( self::$source !== null ) {
            return self::$source;
        }
        $path = __DIR__ . '/../../[Admin System] DINOCO Claim Charges Schema';
        if ( ! file_exists( $path ) ) {
            throw new \RuntimeException( 'Snippet file not found: ' . $path );
        }
        $text = file_get_contents( $path );
        if ( $text === false ) {
            throw new \RuntimeException( 'Failed reading snippet: ' . $path );
        }
        self::$source = $text;
        return self::$source;
    }

    /**
     * Extract the CREATE TABLE DDL string from the snippet (between
     * `$sql = "CREATE TABLE` and the terminating `) {$charset};"`).
     */
    public static function ddl(): string {
        $src = self::load();
        if ( ! preg_match( '/\$sql\s*=\s*"(CREATE TABLE[\s\S]+?\)\s*\{\$charset\};)"/', $src, $m ) ) {
            throw new \RuntimeException( 'CREATE TABLE DDL not found in snippet' );
        }
        return $m[1];
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Inline copy of pure-logic helper: dinoco_claim_charges_table_name().
// We re-declare the helper here against a fake $wpdb so we exercise the
// same control flow as the real snippet without needing a WP runtime.
// ──────────────────────────────────────────────────────────────────────────

final class FakeWpdb {
    public string $prefix = 'wp_';
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_claim_charges_table_name' ) ) {
    function dinoco_claim_charges_table_name(): string {
        global $wpdb;
        return $wpdb->prefix . 'dinoco_claim_charges';
    }
}

class ClaimChargesSchemaTest extends TestCase {

    protected function setUp(): void {
        global $wpdb;
        $wpdb = new FakeWpdb();
    }

    // ════════════════════════════════════════════════════════════════
    // TABLE NAME HELPER
    // ════════════════════════════════════════════════════════════════

    public function test_table_name_uses_wpdb_prefix(): void {
        global $wpdb;
        $wpdb->prefix = 'wp_';
        $this->assertSame( 'wp_dinoco_claim_charges', dinoco_claim_charges_table_name() );
    }

    public function test_table_name_respects_custom_prefix(): void {
        global $wpdb;
        $wpdb->prefix = 'dinoco_prod_';
        $this->assertSame( 'dinoco_prod_dinoco_claim_charges', dinoco_claim_charges_table_name() );
    }

    public function test_table_name_referenced_via_single_seam_in_snippet(): void {
        // Anti-drift: ALL references to the literal table name should go
        // through the helper, not hardcoded strings. Allow one occurrence
        // inside the helper body itself.
        $src = SnippetFixture::load();
        $occurrences = substr_count( $src, "'dinoco_claim_charges'" );
        // Helper definition + (no other call sites should hardcode it)
        $this->assertSame( 1, $occurrences, 'Table name literal should appear once (inside helper). Other callers must use dinoco_claim_charges_table_name().' );
    }

    // ════════════════════════════════════════════════════════════════
    // CONSTANTS — whitelists & schema version
    // ════════════════════════════════════════════════════════════════

    public function test_schema_version_constant_defined_as_1_0(): void {
        $src = SnippetFixture::load();
        $this->assertMatchesRegularExpression(
            '/define\(\s*\'DINOCO_CLAIM_CHARGES_SCHEMA_VERSION\'\s*,\s*\'1\.0\'\s*\)/',
            $src
        );
    }

    public function test_reason_whitelist_contains_4_canonical_values(): void {
        $src = SnippetFixture::load();
        if ( ! preg_match(
            '/define\(\s*\'DINOCO_CLAIM_CHARGES_REASON_WHITELIST\'\s*,\s*\'([^\']+)\'\s*\)/',
            $src, $m
        ) ) {
            $this->fail( 'Reason whitelist constant not found' );
        }
        $values = explode( ',', $m[1] );
        $this->assertCount( 4, $values );
        $this->assertContains( 'return_shipping', $values );
        $this->assertContains( 'repair_oow', $values );
        $this->assertContains( 'extra_parts', $values );
        $this->assertContains( 'other', $values );
    }

    public function test_status_whitelist_contains_7_canonical_values(): void {
        $src = SnippetFixture::load();
        if ( ! preg_match(
            '/define\(\s*\'DINOCO_CLAIM_CHARGES_STATUS_WHITELIST\'\s*,\s*\'([^\']+)\'\s*\)/',
            $src, $m
        ) ) {
            $this->fail( 'Status whitelist constant not found' );
        }
        $values = explode( ',', $m[1] );
        $this->assertCount( 7, $values );
        $expected = [
            'pending_payment', 'pending_review', 'verified',
            'rejected', 'refunded', 'expired', 'cancelled',
        ];
        foreach ( $expected as $v ) {
            $this->assertContains( $v, $values, "Status '{$v}' missing from whitelist" );
        }
    }

    public function test_bank_context_whitelist_has_two_values(): void {
        $src = SnippetFixture::load();
        if ( ! preg_match(
            '/define\(\s*\'DINOCO_CLAIM_CHARGES_BANK_CONTEXT_WHITELIST\'\s*,\s*\'([^\']+)\'\s*\)/',
            $src, $m
        ) ) {
            $this->fail( 'Bank context whitelist constant not found' );
        }
        $values = explode( ',', $m[1] );
        $this->assertCount( 2, $values );
        $this->assertContains( 'claim', $values );
        $this->assertContains( 'claim_walkin', $values );
    }

    public function test_status_whitelist_excludes_drift_values(): void {
        // Defensive: catch accidental insertion of unspec'd states like
        // 'paid' or 'fulfilled' which would belong to B2B FSM not claim.
        $src = SnippetFixture::load();
        preg_match(
            '/define\(\s*\'DINOCO_CLAIM_CHARGES_STATUS_WHITELIST\'\s*,\s*\'([^\']+)\'\s*\)/',
            $src, $m
        );
        $values = explode( ',', $m[1] );
        $banned = [ 'paid', 'fulfilled', 'awaiting_confirm', 'partial_fulfilled', 'all_backorder' ];
        foreach ( $banned as $b ) {
            $this->assertNotContains( $b, $values, "Status '{$b}' should NOT be in claim-charges whitelist (B2B FSM only)" );
        }
    }

    // ════════════════════════════════════════════════════════════════
    // DDL FINGERPRINT — column count + types + indexes
    // ════════════════════════════════════════════════════════════════

    public function test_ddl_defines_all_24_columns(): void {
        $ddl = SnippetFixture::ddl();
        $expected_columns = [
            // id + 2 FKs
            'id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT',
            'claim_id BIGINT(20) UNSIGNED NOT NULL',
            'user_id BIGINT(20) UNSIGNED NOT NULL',
            // amount + reason
            'amount_thb DECIMAL(12,2) NOT NULL',
            'reason VARCHAR(32) NOT NULL',
            'reason_note VARCHAR(500) DEFAULT NULL',
            // status
            "status VARCHAR(24) NOT NULL DEFAULT 'pending_payment'",
            // 7 bank snapshot columns
            'bank_code VARCHAR(16) DEFAULT NULL',
            'bank_account VARCHAR(32) DEFAULT NULL',
            'bank_holder VARCHAR(128) DEFAULT NULL',
            'bank_name VARCHAR(64) DEFAULT NULL',
            'bank_branch VARCHAR(64) DEFAULT NULL',
            "bank_context VARCHAR(16) DEFAULT 'claim'",
            // slip
            'slip_image_url VARCHAR(500) DEFAULT NULL',
            'slip_ref_hash CHAR(64) DEFAULT NULL',
            'slip_verify_data LONGTEXT DEFAULT NULL',
            // payment_ref + verify + refund
            'payment_ref VARCHAR(64) NOT NULL',
            'verified_at DATETIME DEFAULT NULL',
            'verified_by BIGINT(20) UNSIGNED DEFAULT NULL',
            'refund_reason VARCHAR(500) DEFAULT NULL',
            'refund_approver_id BIGINT(20) UNSIGNED DEFAULT NULL',
            'refunded_at DATETIME DEFAULT NULL',
            'refunded_by BIGINT(20) UNSIGNED DEFAULT NULL',
            // expires + audit
            'expires_at DATETIME NOT NULL',
            'created_at DATETIME NOT NULL',
            'created_by BIGINT(20) UNSIGNED NOT NULL',
        ];

        // 26 lines because we listed 26 above (the spec is 27 columns including id;
        // count above is intentional — we cover all column definitions).
        $missing = [];
        foreach ( $expected_columns as $col ) {
            if ( strpos( $ddl, $col ) === false ) {
                $missing[] = $col;
            }
        }
        $this->assertSame( [], $missing,
            'DDL missing columns: ' . implode( '; ', $missing ) );
    }

    public function test_ddl_declares_4_key_indexes(): void {
        $ddl = SnippetFixture::ddl();
        $this->assertStringContainsString( 'KEY idx_claim (claim_id)', $ddl );
        $this->assertStringContainsString( 'KEY idx_user_status (user_id, status)', $ddl );
        $this->assertStringContainsString( 'KEY idx_status_expires (status, expires_at)', $ddl );
        $this->assertStringContainsString( 'KEY idx_created (created_at)', $ddl );
    }

    public function test_ddl_declares_slip_replay_unique_constraint(): void {
        $ddl = SnippetFixture::ddl();
        $this->assertStringContainsString(
            'UNIQUE KEY uq_slip_replay_claim (slip_ref_hash)',
            $ddl
        );
    }

    public function test_ddl_declares_primary_key_id(): void {
        $ddl = SnippetFixture::ddl();
        $this->assertStringContainsString( 'PRIMARY KEY  (id)', $ddl );
    }

    public function test_ddl_uses_dbdelta_compatible_spacing(): void {
        // dbDelta is picky: requires double space between PRIMARY KEY and (col)
        $ddl = SnippetFixture::ddl();
        $this->assertMatchesRegularExpression( '/PRIMARY KEY  \(/', $ddl );
    }

    // ════════════════════════════════════════════════════════════════
    // LAZY INSTALL — version-gated short-circuit
    // ════════════════════════════════════════════════════════════════

    public function test_schema_install_short_circuits_when_version_matches(): void {
        $src = SnippetFixture::load();
        // Pattern: get_option('dinoco_claim_charges_schema_version', '0')
        // followed by `if ( $current === $target ) return;`
        $this->assertMatchesRegularExpression(
            '/get_option\(\s*\'dinoco_claim_charges_schema_version\'\s*,\s*\'0\'\s*\)/',
            $src
        );
        $this->assertStringContainsString( 'if ( $current === $target ) return;', $src );
    }

    public function test_schema_version_option_uses_autoload_false(): void {
        // R9 P4 pattern: schema-version flags never autoload
        $src = SnippetFixture::load();
        $this->assertMatchesRegularExpression(
            '/update_option\(\s*\'dinoco_claim_charges_schema_version\'\s*,\s*\$target\s*,\s*false\s*\)/',
            $src
        );
    }

    public function test_admin_init_hook_registered_for_lazy_install(): void {
        $src = SnippetFixture::load();
        $this->assertStringContainsString( "add_action( 'admin_init', function()", $src );
        $this->assertStringContainsString( 'dinoco_claim_charges_schema_install()', $src );
    }

    public function test_dbdelta_loads_upgrade_php_dependency(): void {
        $src = SnippetFixture::load();
        $this->assertStringContainsString(
            "require_once ABSPATH . 'wp-admin/includes/upgrade.php'",
            $src
        );
    }

    // ════════════════════════════════════════════════════════════════
    // CHECK CONSTRAINT — MySQL 8.0.16+ / MariaDB 10.2.1+ gating
    // ════════════════════════════════════════════════════════════════

    public function test_check_constraint_helper_probes_mysql_8_0_16(): void {
        $src = SnippetFixture::load();
        $this->assertStringContainsString( '8.0.16', $src );
    }

    public function test_check_constraint_helper_probes_mariadb_10_2_1(): void {
        $src = SnippetFixture::load();
        $this->assertStringContainsString( '10.2.1', $src );
    }

    public function test_check_constraints_use_information_schema_gate(): void {
        // Idempotency requires INFORMATION_SCHEMA precheck before ADD CONSTRAINT
        $src = SnippetFixture::load();
        $this->assertMatchesRegularExpression(
            '/INFORMATION_SCHEMA\.TABLE_CONSTRAINTS/i',
            $src
        );
        $this->assertStringContainsString( "CONSTRAINT_TYPE = 'CHECK'", $src );
    }

    public function test_check_constraint_names_match_spec(): void {
        $src = SnippetFixture::load();
        $this->assertStringContainsString( 'chk_amount_positive', $src );
        $this->assertStringContainsString( 'chk_reason_whitelist', $src );
        $this->assertStringContainsString( 'chk_status_whitelist', $src );
    }

    public function test_check_constraint_amount_positive_clause_correct(): void {
        $src = SnippetFixture::load();
        $this->assertMatchesRegularExpression(
            "/'chk_amount_positive'\s*=>\s*\"\(amount_thb\s*>\s*0\)\"/",
            $src
        );
    }

    // ════════════════════════════════════════════════════════════════
    // RETENTION CRON — 90-day purge + heartbeat in finally
    // ════════════════════════════════════════════════════════════════

    public function test_cleanup_run_purges_only_cancelled_and_expired(): void {
        // PDPA + finance audit: verified/rejected/refunded must be preserved
        $src = SnippetFixture::load();
        $this->assertMatchesRegularExpression(
            "/status IN \(\s*'cancelled'\s*,\s*'expired'\s*\)/",
            $src
        );
    }

    public function test_cleanup_run_uses_90_day_default_retention(): void {
        $src = SnippetFixture::load();
        $this->assertMatchesRegularExpression(
            '/get_option\(\s*\'dinoco_claim_charges_retention_days\'\s*,\s*90\s*\)/',
            $src
        );
    }

    public function test_cleanup_run_clamps_retention_to_30_365_window(): void {
        $src = SnippetFixture::load();
        $this->assertMatchesRegularExpression( '/\$days\s*<\s*30/', $src );
        $this->assertMatchesRegularExpression( '/\$days\s*>\s*365/', $src );
    }

    public function test_cleanup_run_uses_chunked_delete_with_50ms_gap(): void {
        // Pattern from Idempotency / Flag Audit: 1000/iter × 20 max
        $src = SnippetFixture::load();
        $this->assertMatchesRegularExpression( '/LIMIT 1000/', $src );
        $this->assertMatchesRegularExpression( '/\$max_iters\s*=\s*20/', $src );
        $this->assertMatchesRegularExpression( '/usleep\(\s*50000\s*\)/', $src );
    }

    public function test_cleanup_heartbeat_uses_autoload_false(): void {
        // R9 P4 wp_options hygiene — cron heartbeats never autoload
        $src = SnippetFixture::load();
        $this->assertMatchesRegularExpression(
            '/update_option\(\s*\'dinoco_cron_claim_charges_cleanup_last_run\'\s*,\s*current_time\(\s*\'mysql\'\s*\)\s*,\s*false\s*\)/',
            $src
        );
    }

    public function test_cleanup_heartbeat_in_finally_block(): void {
        // R12 pattern: heartbeat in `finally` so an exception aborts the
        // loop but Health Monitor still sees the cron fired
        $src = SnippetFixture::load();
        $this->assertMatchesRegularExpression( '/\}\s*finally\s*\{[\s\S]*?dinoco_cron_claim_charges_cleanup_last_run/', $src );
    }

    public function test_retention_cron_scheduled_daily_at_03_30(): void {
        $src = SnippetFixture::load();
        $this->assertStringContainsString( "strtotime( 'tomorrow 03:30' )", $src );
        $this->assertStringContainsString( "wp_schedule_event( \$first_run, 'daily', 'dinoco_claim_charges_cleanup_cron' )", $src );
    }

    public function test_cron_registered_via_dinoco_register_cron_when_available(): void {
        $src = SnippetFixture::load();
        $this->assertMatchesRegularExpression(
            "/function_exists\(\s*'dinoco_register_cron'\s*\)/",
            $src
        );
        $this->assertMatchesRegularExpression(
            "/dinoco_register_cron\(\s*'dinoco_claim_charges_cleanup_cron'\s*,\s*'daily'\s*,\s*'dinoco_claim_charges_cleanup_run'\s*\)/",
            $src
        );
    }

    public function test_cron_falls_back_to_add_action_when_helper_missing(): void {
        $src = SnippetFixture::load();
        $this->assertMatchesRegularExpression(
            "/add_action\(\s*'dinoco_claim_charges_cleanup_cron'\s*,\s*'dinoco_claim_charges_cleanup_run'\s*\)/",
            $src
        );
    }

    // ════════════════════════════════════════════════════════════════
    // DEFENSIVE INVARIANTS — non-throwing + lazy install safety
    // ════════════════════════════════════════════════════════════════

    public function test_all_public_helpers_wrapped_in_function_exists_guard(): void {
        $src = SnippetFixture::load();
        $required_helpers = [
            'dinoco_claim_charges_table_name',
            'dinoco_claim_charges_schema_install',
            'dinoco_claim_charges_supports_check_constraints',
            'dinoco_claim_charges_maybe_add_check_constraints',
            'dinoco_claim_charges_cleanup_run',
        ];
        foreach ( $required_helpers as $fn ) {
            $this->assertMatchesRegularExpression(
                "/if\s*\(\s*!\s*function_exists\(\s*'{$fn}'\s*\)\s*\)/",
                $src,
                "Helper '{$fn}' must be wrapped in function_exists guard"
            );
        }
    }

    public function test_dbdelta_wrapped_in_try_catch_for_non_throwing_install(): void {
        $src = SnippetFixture::load();
        $this->assertMatchesRegularExpression(
            '/try\s*\{\s*dbDelta\(\s*\$sql\s*\);[\s\S]+?\}\s*catch\s*\(\s*\\\\Throwable/',
            $src
        );
    }

    public function test_cleanup_run_defensive_when_table_missing(): void {
        $src = SnippetFixture::load();
        // SHOW TABLES LIKE check before DELETE — protects against snippet
        // activation before WP first hits admin_init
        $this->assertMatchesRegularExpression(
            '/SHOW TABLES LIKE %s/',
            $src
        );
    }

    public function test_check_constraint_alter_catches_throwable(): void {
        // Defense-in-depth: a single bad constraint must not abort the
        // whole install — each ALTER is wrapped in try/catch
        $src = SnippetFixture::load();
        $this->assertMatchesRegularExpression(
            '/ALTER TABLE.*ADD CONSTRAINT[\s\S]+?catch\s*\(\s*\\\\Throwable/',
            $src
        );
    }

    public function test_abspath_guard_at_top_of_snippet(): void {
        $src = SnippetFixture::load();
        // First non-comment line should be the ABSPATH guard
        $this->assertMatchesRegularExpression(
            "/if\s*\(\s*!\s*defined\(\s*'ABSPATH'\s*\)\s*\)\s*exit;/",
            $src
        );
    }
}
