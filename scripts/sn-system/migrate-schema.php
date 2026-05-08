<?php
/**
 * =============================================================================
 * DINOCO SN System — Schema Migration WP-CLI Command V.1.0 (2026-05-07)
 * =============================================================================
 *
 * Closes R4 BLOCKER #2 (database-expert P0-3):
 *   "Schema 1.1→1.2 ALTER on 1M rows w/o online migration → Production lock
 *    30-60min — admin page hang. Pre-deploy WP-CLI + maintenance window
 *    02:00-04:00 ICT OR pt-online-schema-change MANDATORY"
 *
 * Manager V.0.40 introduced the > 100K threshold + "skip + admin notice"
 * pattern. This CLI completes the loop — it's the ONLY supported path for
 * production-scale migration. Web-context auto-installer refuses + emits
 * notice with the CLI command text for admins to copy/paste.
 *
 * Capability matrix (which path runs which migration):
 *   • Web admin_init  → small dataset (< 100K rows) auto-execute via dbDelta
 *   • CLI --execute   → ANY size, in-place ALTER (maintenance window)
 *   • CLI --online    → ANY size, pt-online-schema-change (zero downtime)
 *   • CLI --dry-run   → no DB writes, prints plan + collisions + stats
 *
 * Usage:
 *   wp dinoco-sn migrate-schema --version=1.2 --dry-run
 *   wp dinoco-sn migrate-schema --version=1.2 --execute
 *   wp dinoco-sn migrate-schema --version=1.3 --execute --online
 *   wp dinoco-sn migrate-schema --version=1.2 --execute --skip-snapshot   (UAT only)
 *
 * Reference: docs/sn-system/25-schema-migration-runbook.md
 *
 * Pairs with:
 *   - Manager V.0.43 (this update — registers CLI command)
 *   - Rollback SQL: scripts/sn-system/rollback-schema.sql
 * =============================================================================
 */

// --- Load WordPress (mirror b2f-phase2-backfill.php pattern) ----------------
if ( ! defined( 'ABSPATH' ) ) {
    $wp_load_candidates = array(
        __DIR__ . '/../../../../wp-load.php',
        __DIR__ . '/../../../wp-load.php',
        __DIR__ . '/../../wp-load.php',
        __DIR__ . '/../wp-load.php',
    );
    $loaded = false;
    foreach ( $wp_load_candidates as $candidate ) {
        if ( file_exists( $candidate ) ) {
            require_once $candidate;
            $loaded = true;
            break;
        }
    }
    if ( ! $loaded ) {
        fwrite( STDERR, "ERROR: Cannot locate wp-load.php\n" );
        exit( 1 );
    }
}

// --- Resource limits --------------------------------------------------------
@set_time_limit( 0 );             // no timeout — long ALTERs
@ini_set( 'memory_limit', '1G' );

// --- IDE intelephense stub (runtime no-op) ---------------------------------
// WP_CLI is provided by Phar at CLI runtime — IDE static analysis can't see it.
// Stub class only declared if WP_CLI not loaded (e.g. during intelephense
// indexing). At actual CLI runtime, class_exists('WP_CLI') is true and stub
// is skipped. Method signatures match wp-cli/wp-cli/php/class-wp-cli.php.
if ( ! class_exists( 'WP_CLI', false ) ) {
    /**
     * @method static void log(string $message)
     * @method static void success(string $message)
     * @method static void warning(string $message)
     * @method static void error(string $message, bool|int $exit = true)
     * @method static void confirm(string $question, array $assoc_args = array())
     * @method static void add_command(string $name, string|callable $callable, array $args = array())
     */
    class WP_CLI {
        public static function log( $message ) {}
        public static function success( $message ) {}
        public static function warning( $message ) {}
        public static function error( $message, $exit = true ) {}
        public static function confirm( $question, $assoc_args = array() ) {}
        public static function add_command( $name, $callable, $args = array() ) {}
    }
}

// --- IDE intelephense stubs for WP core functions/constants ----------------
// At runtime wp-load.php has loaded WordPress and these are real. The stubs
// are conditional on `function_exists` / `defined` so they NEVER execute in
// the WP-CLI runtime — they only silence intelephense during static indexing.
if ( ! defined( 'ABSPATH_INTELEPHENSE_STUBS_LOADED' ) ) {
    define( 'ABSPATH_INTELEPHENSE_STUBS_LOADED', true );
    if ( ! defined( 'DB_NAME' ) )         { define( 'DB_NAME', '' ); }
    if ( ! defined( 'DB_USER' ) )         { define( 'DB_USER', '' ); }
    if ( ! defined( 'DB_PASSWORD' ) )     { define( 'DB_PASSWORD', '' ); }
    if ( ! defined( 'DB_HOST' ) )         { define( 'DB_HOST', '' ); }
    if ( ! defined( 'WP_CONTENT_DIR' ) )  { define( 'WP_CONTENT_DIR', '' ); }
    // WP_CLI runtime boolean constant (set true by wp-cli/php/boot-fs.php).
    // Class WP_CLI is declared above; this constant is a separate symbol.
    if ( ! defined( 'WP_CLI' ) )          { define( 'WP_CLI', false ); }
    // DINOCO_SN_TABLES — physical table name map, declared in Manager snippet.
    // Web-context: defined when Manager loads. CLI: also loaded via wp-load.php.
    if ( ! defined( 'DINOCO_SN_TABLES' ) ) { define( 'DINOCO_SN_TABLES', array() ); }
    if ( ! function_exists( 'get_option' ) ) {
        function get_option( $name, $default = false ) { return $default; }
    }
    if ( ! function_exists( 'update_option' ) ) {
        function update_option( $name, $value, $autoload = null ) { return true; }
    }
    if ( ! function_exists( 'delete_option' ) ) {
        function delete_option( $name ) { return true; }
    }
    if ( ! function_exists( 'current_time' ) ) {
        function current_time( $type, $gmt = 0 ) { return ''; }
    }
    if ( ! function_exists( 'wp_mkdir_p' ) ) {
        function wp_mkdir_p( $target ) { return true; }
    }
}

// --- Only meaningful under WP-CLI ------------------------------------------
if ( ! ( defined( 'WP_CLI' ) && WP_CLI ) ) {
    fwrite( STDERR, "ERROR: This script must be run via WP-CLI:\n" );
    fwrite( STDERR, "  wp dinoco-sn migrate-schema --version=1.2 --dry-run\n" );
    exit( 1 );
}

if ( ! class_exists( 'Dinoco_SN_Migrate_Schema_CLI' ) ) {
    /**
     * Schema migration CLI — pre-flight checks, snapshot, ALTER (in-place
     * or pt-osc), verify, version flag flip.
     *
     * Defensive — handles missing tables gracefully (e.g. fresh install
     * with no rows yet → bypass row count guard but still run ALTERs).
     */
    class Dinoco_SN_Migrate_Schema_CLI {

        /** Row threshold for "online migration recommended" warning. */
        const LARGE_ROWCOUNT_WARN = 100000;

        /** Row threshold for "online migration MANDATORY" hard block. */
        const HUGE_ROWCOUNT_BLOCK = 500000;

        /** UNIQUE collision sample cap (avoid logging 1M+ duplicates). */
        const COLLISION_SAMPLE_CAP = 50;

        /** Supported target versions. */
        const SUPPORTED_VERSIONS = array( '1.2', '1.3' );

        /** Snapshot retention dir (relative to wp-content/). */
        const SNAPSHOT_DIR = 'dinoco-sn-snapshots';

        /**
         * `wp dinoco-sn migrate-schema` command entry point.
         *
         * ## OPTIONS
         *
         * --version=<version>
         * : Target schema version (1.2 or 1.3).
         *
         * [--dry-run]
         * : Print migration plan + pre-flight only — no DB writes.
         *
         * [--execute]
         * : Actually perform the migration. Mutually exclusive with --dry-run.
         *
         * [--online]
         * : Use pt-online-schema-change (Percona toolkit) for zero-downtime
         *   migration. Requires `pt-online-schema-change` in PATH.
         *
         * [--skip-snapshot]
         * : Skip mysqldump snapshot before ALTERs. NOT RECOMMENDED for
         *   production — only for UAT/staging where DB is disposable.
         *
         * [--force]
         * : Bypass HUGE_ROWCOUNT_BLOCK guard (> 500K rows). DBA approval required.
         *
         * @param array $args
         * @param array $assoc_args
         */
        public function run( $args, $assoc_args ) {
            $version       = isset( $assoc_args['version'] ) ? (string) $assoc_args['version'] : '';
            $dry_run       = isset( $assoc_args['dry-run'] );
            $execute       = isset( $assoc_args['execute'] );
            $online        = isset( $assoc_args['online'] );
            $skip_snapshot = isset( $assoc_args['skip-snapshot'] );
            $force         = isset( $assoc_args['force'] );

            // --- Argument validation ---------------------------------------
            if ( $version === '' ) {
                \WP_CLI::error( 'Missing --version. Use --version=1.2 or --version=1.3' );
            }
            if ( ! in_array( $version, self::SUPPORTED_VERSIONS, true ) ) {
                \WP_CLI::error( sprintf(
                    'Unsupported --version=%s. Allowed: %s',
                    $version, implode( ', ', self::SUPPORTED_VERSIONS )
                ) );
            }
            if ( $dry_run && $execute ) {
                \WP_CLI::error( '--dry-run and --execute are mutually exclusive.' );
            }
            if ( ! $dry_run && ! $execute ) {
                \WP_CLI::error( 'Must specify --dry-run OR --execute.' );
            }

            \WP_CLI::log( str_repeat( '=', 70 ) );
            \WP_CLI::log( sprintf(
                'DINOCO SN Schema Migration → v%s (%s mode)',
                $version, $dry_run ? 'DRY-RUN' : 'EXECUTE'
            ) );
            \WP_CLI::log( str_repeat( '=', 70 ) );

            // --- STEP 1: Pre-flight ----------------------------------------
            \WP_CLI::log( '' );
            \WP_CLI::log( '[1/6] Pre-flight checks…' );
            $preflight = $this->preflight_check( $version );
            $this->print_preflight_summary( $preflight );

            if ( $preflight['pool_rows'] > self::HUGE_ROWCOUNT_BLOCK && ! $force ) {
                \WP_CLI::error( sprintf(
                    'Pool > %s rows (%s). In-place ALTER unsafe — use --online OR --force (DBA approval required).',
                    number_format( self::HUGE_ROWCOUNT_BLOCK ),
                    number_format( $preflight['pool_rows'] )
                ) );
            }

            if ( ! $online && $preflight['pool_rows'] > self::LARGE_ROWCOUNT_WARN ) {
                \WP_CLI::warning( sprintf(
                    'Pool > %s rows. In-place ALTER will block writes ~%s. Recommend --online (pt-online-schema-change).',
                    number_format( self::LARGE_ROWCOUNT_WARN ),
                    $this->estimate_alter_duration( $preflight['pool_rows'] )
                ) );
            }

            // --- STEP 2: Pre-validate UNIQUE collisions --------------------
            \WP_CLI::log( '' );
            \WP_CLI::log( '[2/6] Detecting UNIQUE collision risks…' );
            $collisions = $this->detect_uq_dedup_collisions();
            if ( ! empty( $collisions ) ) {
                \WP_CLI::warning( sprintf(
                    'Found %d duplicate notification rows that would block uq_dedup migration:',
                    count( $collisions )
                ) );
                foreach ( array_slice( $collisions, 0, 10 ) as $row ) {
                    \WP_CLI::log( sprintf(
                        '  notification_type=%s user_id=%s sn=%s scheduled_at=%s count=%d',
                        $row->notification_type,
                        $row->user_id,
                        $row->sn,
                        $row->scheduled_at ?? '(NULL)',
                        $row->cnt
                    ) );
                }
                if ( count( $collisions ) > 10 ) {
                    \WP_CLI::log( sprintf( '  … and %d more (cap %d displayed)', count( $collisions ) - 10, 10 ) );
                }
                \WP_CLI::warning( 'Resolve duplicates before --execute (delete older rows or merge). Aborting if --execute.' );
                if ( $execute ) {
                    \WP_CLI::error( 'Refusing to migrate with collisions. Run cleanup first.' );
                }
            } else {
                \WP_CLI::success( 'No UNIQUE collision risks detected.' );
            }

            // --- STEP 3: Snapshot (skipped on --dry-run) -------------------
            \WP_CLI::log( '' );
            \WP_CLI::log( '[3/6] Snapshot…' );
            if ( $dry_run ) {
                \WP_CLI::log( '  (skipped — dry-run)' );
            } elseif ( $skip_snapshot ) {
                \WP_CLI::warning( '  Snapshot SKIPPED (--skip-snapshot). UAT/staging only.' );
            } else {
                $snapshot_path = $this->mysqldump_snapshot( "pre-{$version}-" . date( 'YmdHis' ) );
                if ( $snapshot_path === '' ) {
                    \WP_CLI::error( 'Snapshot failed. Aborting.' );
                }
                \WP_CLI::success( "  Snapshot: {$snapshot_path}" );
            }

            // --- STEP 4: Get ALTER plan ------------------------------------
            \WP_CLI::log( '' );
            \WP_CLI::log( '[4/6] ALTER plan:' );
            $statements = $this->get_alter_statements( $version );
            if ( empty( $statements ) ) {
                \WP_CLI::warning( "No ALTERs needed for version {$version}." );
                return;
            }
            foreach ( $statements as $i => $sql ) {
                \WP_CLI::log( sprintf( '  %d) %s', $i + 1, $this->truncate_sql( $sql ) ) );
            }

            if ( $dry_run ) {
                \WP_CLI::log( '' );
                \WP_CLI::success( 'Dry-run complete. No DB writes performed.' );
                return;
            }

            // --- STEP 5: Execute ALTERs ------------------------------------
            \WP_CLI::log( '' );
            \WP_CLI::log( '[5/6] Executing migration…' );
            if ( $online ) {
                if ( ! $this->pt_osc_available() ) {
                    \WP_CLI::error( '--online specified but pt-online-schema-change not in PATH. Install Percona Toolkit or omit --online.' );
                }
                $this->pt_online_schema_change( $version, $statements );
            } else {
                $this->direct_alter( $statements );
            }

            // --- STEP 6: Post-migration verify -----------------------------
            \WP_CLI::log( '' );
            \WP_CLI::log( '[6/6] Verifying schema…' );
            $verify = $this->post_migration_verify( $version );
            if ( ! $verify['ok'] ) {
                \WP_CLI::error( 'Verification FAILED. Check ' . implode( ', ', $verify['failures'] ) . '. Roll back via scripts/sn-system/rollback-schema.sql.' );
            }
            \WP_CLI::success( 'Schema verification passed.' );

            // Flip version flag
            update_option( 'dinoco_sn_schema_version', $version, 'no' );
            update_option( 'dinoco_sn_schema_activated_at', current_time( 'mysql' ), 'no' );
            // Clear admin notice from V.0.40 skip path
            delete_option( 'dinoco_sn_schema_alter_blocked_at' );
            delete_option( 'dinoco_sn_schema_alter_blocked_rowcount' );

            \WP_CLI::log( '' );
            \WP_CLI::success( "Migration to v{$version} complete." );
        }

        // ─────────────────────────────────────────────────────────────────
        // Pre-flight
        // ─────────────────────────────────────────────────────────────────

        /**
         * Gather row counts, MySQL/MariaDB version, buffer pool size,
         * INSTANT ALTER capability flag.
         *
         * @param string $target_version
         * @return array
         */
        public function preflight_check( $target_version ) {
            global $wpdb;
            $current = (string) get_option( 'dinoco_sn_schema_version', '0.0' );

            $pool_tbl  = $wpdb->prefix . 'dinoco_sn_pool';
            $audit_tbl = $wpdb->prefix . 'dinoco_sn_audit';
            $notif_tbl = $wpdb->prefix . 'dinoco_sn_notifications';

            $pool_rows  = (int) $this->safe_count( $pool_tbl );
            $audit_rows = (int) $this->safe_count( $audit_tbl );
            $notif_rows = (int) $this->safe_count( $notif_tbl );

            $db_version = (string) $wpdb->get_var( 'SELECT VERSION()' );
            $is_mysql_8 = (bool) preg_match( '/^8\./', $db_version );
            $is_mariadb = (bool) stripos( $db_version, 'mariadb' );

            $buffer_size_bytes = (int) $wpdb->get_var(
                "SELECT VARIABLE_VALUE FROM information_schema.global_variables
                 WHERE VARIABLE_NAME = 'innodb_buffer_pool_size'"
            );

            // INSTANT ALTER capability — MySQL 8.0.16+ for ADD COLUMN,
            // 8.0.29+ for MODIFY COLUMN. MariaDB 10.4+ has partial support.
            $instant_alter_capable = $is_mysql_8 && version_compare( $db_version, '8.0.16', '>=' );

            return array(
                'current_version'       => $current,
                'target_version'        => $target_version,
                'pool_rows'             => $pool_rows,
                'audit_rows'            => $audit_rows,
                'notif_rows'            => $notif_rows,
                'db_version'            => $db_version,
                'is_mysql_8'            => $is_mysql_8,
                'is_mariadb'            => $is_mariadb,
                'buffer_size_bytes'     => $buffer_size_bytes,
                'instant_alter_capable' => $instant_alter_capable,
            );
        }

        /** Defensive COUNT(*) — returns 0 if table missing. */
        private function safe_count( $table ) {
            global $wpdb;
            $exists = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT COUNT(*) FROM information_schema.tables
                 WHERE table_schema = %s AND table_name = %s",
                DB_NAME, $table
            ) );
            if ( $exists === 0 ) return 0;
            return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
        }

        private function print_preflight_summary( $p ) {
            \WP_CLI::log( sprintf(
                '  Current: v%s → Target: v%s',
                $p['current_version'], $p['target_version']
            ) );
            \WP_CLI::log( sprintf(
                '  Pool: %s rows · Audit: %s · Notifications: %s',
                number_format( $p['pool_rows'] ),
                number_format( $p['audit_rows'] ),
                number_format( $p['notif_rows'] )
            ) );
            \WP_CLI::log( sprintf(
                '  DB: %s · INSTANT ALTER: %s · Buffer pool: %s MB',
                $p['db_version'],
                $p['instant_alter_capable'] ? 'YES (MySQL 8.0.16+)' : 'NO (rebuild required)',
                number_format( intdiv( $p['buffer_size_bytes'], 1024 * 1024 ) )
            ) );
        }

        /**
         * Rough estimate of in-place ALTER duration based on row count.
         * Heuristic: ~10K rows/sec on commodity SSD. Pure logic — exposed
         * for tests.
         *
         * @param int $row_count
         * @return string e.g. "~5 min"
         */
        public function estimate_alter_duration( $row_count ) {
            $row_count = max( 0, (int) $row_count );
            $sec = intdiv( $row_count, 10000 );
            if ( $sec < 60 )    return "~{$sec} sec";
            if ( $sec < 3600 )  return '~' . intdiv( $sec, 60 ) . ' min';
            return '~' . round( $sec / 3600, 1 ) . ' hr';
        }

        // ─────────────────────────────────────────────────────────────────
        // UNIQUE collision detection (uniq_dedup → uq_dedup 4-col)
        // ─────────────────────────────────────────────────────────────────

        /**
         * Find rows that would violate the new uq_dedup (4-col) but pass
         * old uniq_dedup (3-col). Rare in practice — only if scheduled_at
         * was added with NULL values that would deduplicate against newer
         * non-NULL versions.
         *
         * @return array Up to COLLISION_SAMPLE_CAP duplicate groups.
         */
        public function detect_uq_dedup_collisions() {
            global $wpdb;
            $tbl = $wpdb->prefix . 'dinoco_sn_notifications';
            $exists = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT COUNT(*) FROM information_schema.tables
                 WHERE table_schema = %s AND table_name = %s",
                DB_NAME, $tbl
            ) );
            if ( $exists === 0 ) return array(); // table missing → no collisions
            return $wpdb->get_results( $wpdb->prepare(
                "SELECT notification_type, user_id, sn, scheduled_at, COUNT(*) AS cnt
                 FROM {$tbl}
                 GROUP BY notification_type, user_id, sn, scheduled_at
                 HAVING cnt > 1
                 LIMIT %d",
                self::COLLISION_SAMPLE_CAP
            ) );
        }

        // ─────────────────────────────────────────────────────────────────
        // Snapshot (mysqldump)
        // ─────────────────────────────────────────────────────────────────

        /**
         * Run mysqldump on all 15 SN tables. Persists under
         * wp-content/dinoco-sn-snapshots/ — outside web-accessible
         * paths via .htaccess deny (created on first call).
         *
         * @param string $tag e.g. "pre-1.2-20260507143000"
         * @return string Absolute path to .sql file, or '' on failure.
         */
        public function mysqldump_snapshot( $tag ) {
            global $wpdb;
            $dir = WP_CONTENT_DIR . '/' . self::SNAPSHOT_DIR;
            if ( ! is_dir( $dir ) ) {
                if ( ! wp_mkdir_p( $dir ) ) {
                    \WP_CLI::warning( "Cannot create snapshot dir: {$dir}" );
                    return '';
                }
                // Deny web access
                @file_put_contents( $dir . '/.htaccess', "Require all denied\n" );
                @file_put_contents( $dir . '/index.php', "<?php // Silence is golden.\n" );
            }

            $tag    = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) $tag );
            $path   = $dir . '/' . $tag . '.sql';
            $tables = array();
            foreach ( DINOCO_SN_TABLES as $logical => $physical ) {
                $tables[] = $wpdb->prefix . $physical;
            }
            $tables[] = $wpdb->prefix . 'options'; // capture flag values too

            // Build mysqldump command
            $host = DB_HOST;
            $port = '';
            if ( strpos( $host, ':' ) !== false ) {
                list( $host, $port ) = explode( ':', $host, 2 );
                $port = ' --port=' . escapeshellarg( $port );
            }

            $cmd = sprintf(
                'mysqldump --host=%s%s --user=%s --password=%s --single-transaction --quick --skip-lock-tables %s %s > %s 2>&1',
                escapeshellarg( $host ),
                $port,
                escapeshellarg( DB_USER ),
                escapeshellarg( DB_PASSWORD ),
                escapeshellarg( DB_NAME ),
                implode( ' ', array_map( 'escapeshellarg', $tables ) ),
                escapeshellarg( $path )
            );

            $output = array();
            $rc     = 0;
            exec( $cmd, $output, $rc );
            if ( $rc !== 0 ) {
                \WP_CLI::warning( 'mysqldump exit ' . $rc . ': ' . implode( ' / ', $output ) );
                return '';
            }
            if ( ! file_exists( $path ) || filesize( $path ) === 0 ) {
                \WP_CLI::warning( 'mysqldump produced empty file: ' . $path );
                return '';
            }
            return $path;
        }

        // ─────────────────────────────────────────────────────────────────
        // ALTER plan
        // ─────────────────────────────────────────────────────────────────

        /**
         * Returns ordered list of ALTER statements for target version.
         *
         * Pure logic — no DB writes. Exposed for unit tests + dry-run.
         *
         * @param string $version
         * @return array<int,string>
         */
        public function get_alter_statements( $version ) {
            global $wpdb;
            $prefix = $wpdb->prefix;
            $stmts  = array();

            if ( $version === '1.2' ) {
                // Drop legacy 3-col uniq_dedup so dbDelta can clean-add
                // the new 4-col uq_dedup with scheduled_at.
                $stmts[] = "ALTER TABLE {$prefix}dinoco_sn_notifications DROP INDEX uniq_dedup";
                $stmts[] = "ALTER TABLE {$prefix}dinoco_sn_notifications ADD UNIQUE KEY uq_dedup (notification_type, user_id, sn, scheduled_at)";

                // PERF covering indexes (V.0.39)
                $stmts[] = "ALTER TABLE {$prefix}dinoco_sn_pool ADD INDEX idx_lookup (linked_sku, status, registered_at)";
                $stmts[] = "ALTER TABLE {$prefix}dinoco_sn_pool ADD INDEX idx_status_created (status, created_at)";
                $stmts[] = "ALTER TABLE {$prefix}dinoco_sn_audit ADD INDEX idx_audit_sn_time (sn, created_at)";
            }

            if ( $version === '1.3' ) {
                // B1 HMAC fix scaffold — sig_bucket column for batch-scoped
                // signature verification (separate agent ships this).
                $stmts[] = "ALTER TABLE {$prefix}dinoco_sn_pool ADD COLUMN sig_bucket SMALLINT UNSIGNED NULL AFTER batch_id";
                $stmts[] = "ALTER TABLE {$prefix}dinoco_sn_pool ADD INDEX idx_sig_bucket (batch_id, sig_bucket)";
            }

            return $stmts;
        }

        private function truncate_sql( $sql ) {
            $sql = preg_replace( '/\s+/', ' ', trim( (string) $sql ) );
            return strlen( $sql ) > 100 ? substr( $sql, 0, 97 ) . '...' : $sql;
        }

        // ─────────────────────────────────────────────────────────────────
        // Direct ALTER (in-place)
        // ─────────────────────────────────────────────────────────────────

        private function direct_alter( $statements ) {
            global $wpdb;
            foreach ( $statements as $sql ) {
                \WP_CLI::log( '  → ' . $this->truncate_sql( $sql ) );
                $start = microtime( true );
                $result = $wpdb->query( $sql );
                $elapsed = microtime( true ) - $start;
                if ( $result === false ) {
                    \WP_CLI::warning( "    SQL error: " . $wpdb->last_error );
                    // Best-effort idempotency — duplicate index, missing index,
                    // already-exists column → continue. Hard fails halt.
                    if ( ! $this->is_idempotent_skippable_error( $wpdb->last_error ) ) {
                        \WP_CLI::error( "ALTER failed (non-recoverable). Run rollback-schema.sql." );
                    }
                    \WP_CLI::log( "    (idempotent skip — already applied)" );
                    continue;
                }
                \WP_CLI::log( sprintf( '    OK (%.2fs)', $elapsed ) );
            }
        }

        /**
         * Pure logic — exposed for tests. Errors safe to swallow when
         * re-running after partial failure.
         *
         * @param string $error
         * @return bool
         */
        public function is_idempotent_skippable_error( $error ) {
            $error = strtolower( (string) $error );
            $skippable_patterns = array(
                'duplicate key name',         // index already exists
                "can't drop",                 // index doesn't exist
                'check that column/key exists',
                'duplicate column name',
                'already exists',
            );
            foreach ( $skippable_patterns as $pat ) {
                if ( strpos( $error, $pat ) !== false ) return true;
            }
            return false;
        }

        // ─────────────────────────────────────────────────────────────────
        // pt-online-schema-change wrapper
        // ─────────────────────────────────────────────────────────────────

        public function pt_osc_available() {
            $output = @shell_exec( 'which pt-online-schema-change 2>/dev/null' );
            return ! empty( trim( (string) $output ) );
        }

        private function pt_online_schema_change( $version, $statements ) {
            // pt-osc operates on per-table ALTER strings. Group statements
            // by table → single pt-osc invocation per table with combined
            // ALTER clauses.
            $by_table = $this->group_alters_by_table( $statements );
            foreach ( $by_table as $table => $alter_clauses ) {
                $alter_combined = implode( ', ', $alter_clauses );
                \WP_CLI::log( "  → pt-osc on {$table}: {$alter_combined}" );

                $cmd = sprintf(
                    'pt-online-schema-change --alter=%s --execute --no-drop-old-table D=%s,t=%s,h=%s,u=%s,p=%s 2>&1',
                    escapeshellarg( $alter_combined ),
                    escapeshellarg( DB_NAME ),
                    escapeshellarg( $table ),
                    escapeshellarg( DB_HOST ),
                    escapeshellarg( DB_USER ),
                    escapeshellarg( DB_PASSWORD )
                );

                $output = array();
                $rc     = 0;
                $start  = microtime( true );
                exec( $cmd, $output, $rc );
                $elapsed = microtime( true ) - $start;

                if ( $rc !== 0 ) {
                    \WP_CLI::warning( "pt-osc exit {$rc}:" );
                    foreach ( array_slice( $output, -10 ) as $line ) {
                        \WP_CLI::log( '    ' . $line );
                    }
                    \WP_CLI::error( "pt-osc on {$table} failed. Run rollback-schema.sql + clean leftover _table_new." );
                }
                \WP_CLI::log( sprintf( '    pt-osc OK (%.1fs)', $elapsed ) );
            }
        }

        /**
         * Pure-logic helper exposed for tests — group ALTER statements by
         * table name so pt-osc can run a single per-table invocation with
         * combined ALTER clauses (avoids triple-rebuild on same table).
         *
         * @param array<int,string> $statements Full SQL like "ALTER TABLE x ADD INDEX..."
         * @return array<string,array<int,string>> [ table => [ clause1, clause2, ... ] ]
         */
        public function group_alters_by_table( array $statements ) {
            $out = array();
            foreach ( $statements as $sql ) {
                if ( ! preg_match( '/^\s*ALTER\s+TABLE\s+(\S+)\s+(.+)$/is', $sql, $m ) ) {
                    continue;
                }
                $table  = trim( $m[1] );
                $clause = trim( $m[2] );
                $clause = rtrim( $clause, ';' );
                $out[ $table ][] = $clause;
            }
            return $out;
        }

        // ─────────────────────────────────────────────────────────────────
        // Post-migration verification
        // ─────────────────────────────────────────────────────────────────

        /**
         * Verify expected indexes/columns exist after migration.
         *
         * @param string $version
         * @return array { ok: bool, failures: array<string> }
         */
        public function post_migration_verify( $version ) {
            global $wpdb;
            $prefix = $wpdb->prefix;
            $failures = array();

            $expected_indexes = array();
            if ( $version === '1.2' ) {
                $expected_indexes = array(
                    array( 'tbl' => "{$prefix}dinoco_sn_notifications", 'idx' => 'uq_dedup' ),
                    array( 'tbl' => "{$prefix}dinoco_sn_pool",          'idx' => 'idx_lookup' ),
                    array( 'tbl' => "{$prefix}dinoco_sn_pool",          'idx' => 'idx_status_created' ),
                    array( 'tbl' => "{$prefix}dinoco_sn_audit",         'idx' => 'idx_audit_sn_time' ),
                );
            }
            if ( $version === '1.3' ) {
                $expected_indexes = array(
                    array( 'tbl' => "{$prefix}dinoco_sn_pool", 'idx' => 'idx_sig_bucket' ),
                );
                // Also verify column
                $col_exists = (int) $wpdb->get_var( $wpdb->prepare(
                    "SELECT COUNT(*) FROM information_schema.columns
                     WHERE table_schema = %s AND table_name = %s AND column_name = %s",
                    DB_NAME, "{$prefix}dinoco_sn_pool", 'sig_bucket'
                ) );
                if ( $col_exists === 0 ) {
                    $failures[] = 'sn_pool.sig_bucket column missing';
                }
            }

            foreach ( $expected_indexes as $check ) {
                $found = (int) $wpdb->get_var( $wpdb->prepare(
                    "SELECT COUNT(*) FROM information_schema.statistics
                     WHERE table_schema = %s AND table_name = %s AND index_name = %s",
                    DB_NAME, $check['tbl'], $check['idx']
                ) );
                if ( $found === 0 ) {
                    $failures[] = "{$check['tbl']}.{$check['idx']} missing";
                }
            }

            // Legacy index should be gone for v1.2
            if ( $version === '1.2' ) {
                $legacy = (int) $wpdb->get_var( $wpdb->prepare(
                    "SELECT COUNT(*) FROM information_schema.statistics
                     WHERE table_schema = %s AND table_name = %s AND index_name = %s",
                    DB_NAME, "{$prefix}dinoco_sn_notifications", 'uniq_dedup'
                ) );
                if ( $legacy > 0 ) {
                    $failures[] = 'legacy uniq_dedup still present (drop incomplete)';
                }
            }

            return array(
                'ok'       => empty( $failures ),
                'failures' => $failures,
            );
        }
    }

    // Register CLI command — pass the class name string, WP-CLI will
    // instantiate + dispatch to ::run() for the default subcommand.
    \WP_CLI::add_command( 'dinoco-sn migrate-schema', 'Dinoco_SN_Migrate_Schema_CLI' );
}
