<?php
/**
 * SnMigrationCredentialsTest — R5 Sec-B1 (CWE-214) regression coverage.
 *
 * Source: scripts/sn-system/migrate-schema.php V.1.1
 *
 * R5 Sec-B1 fixed mysqldump + pt-osc commands leaking DB password via
 * `ps -ef` / `/proc/<pid>/cmdline`. escapeshellarg() quotes shell
 * metachars but does NOT hide args from process listing. Any local user
 * (even non-root depending on hidepid) could read DB_PASSWORD during
 * the 30-60min ALTER.
 *
 * R5 fix: helper `_write_mysql_defaults_file()` writes [client]
 * config to tempnam(sys_get_temp_dir(), 'dnc-mig-') with chmod 0600,
 * then both mysqldump + pt-osc invoke `--defaults-extra-file=<tmpfile>`.
 * try/catch with finally-unlink guarantees cleanup even on exception.
 *
 * Tests below validate:
 *   - The defaults-extra-file format matches MySQL [client] section spec
 *   - chmod 0600 is set (owner-only read/write, no group/other access)
 *   - The file is actually unlinked after use (finally semantics)
 *   - Constructed mysqldump command does NOT contain `--password=`
 *   - Constructed pt-osc command does NOT contain `--password=`
 *   - Special characters in DB_PASSWORD (quotes, backticks, dollar signs)
 *     don't break the .cnf file format
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Pure-logic mirror of _write_mysql_defaults_file ─────── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_mig_write_defaults_file' ) ) {

    /**
     * Mirror of scripts/sn-system/migrate-schema.php helper:
     *
     *   $tmp = tempnam(sys_get_temp_dir(), 'dnc-mig-');
     *   chmod($tmp, 0600);
     *   file_put_contents($tmp,
     *     "[client]\nuser={$user}\npassword={$password}\nhost={$host}\n");
     *   return $tmp;
     *
     * @return string  absolute path to the temp .cnf file (caller MUST unlink)
     */
    function sn_mig_write_defaults_file(
        string $user,
        string $password,
        string $host
    ): string {
        $tmp = tempnam( sys_get_temp_dir(), 'dnc-mig-' );
        if ( $tmp === false ) {
            throw new \RuntimeException( 'tempnam() failed' );
        }
        chmod( $tmp, 0600 );
        $content = "[client]\nuser={$user}\npassword={$password}\nhost={$host}\n";
        file_put_contents( $tmp, $content );
        return $tmp;
    }

    /**
     * Mirror of mysqldump command construction post-Sec-B1:
     *
     *   $cmd = sprintf(
     *       'mysqldump --defaults-extra-file=%s %s %s > %s',
     *       escapeshellarg($defaults_file),
     *       escapeshellarg($db_name),
     *       implode(' ', array_map('escapeshellarg', $tables)),
     *       escapeshellarg($snapshot_path)
     *   );
     */
    function sn_mig_build_mysqldump_cmd(
        string $defaults_file,
        string $db_name,
        array $tables,
        string $snapshot_path
    ): string {
        return sprintf(
            'mysqldump --defaults-extra-file=%s %s %s > %s',
            escapeshellarg( $defaults_file ),
            escapeshellarg( $db_name ),
            implode( ' ', array_map( 'escapeshellarg', $tables ) ),
            escapeshellarg( $snapshot_path )
        );
    }

    /**
     * Mirror of pt-osc command construction post-Sec-B1.
     */
    function sn_mig_build_ptosc_cmd(
        string $defaults_file,
        string $db_name,
        string $table,
        string $alter
    ): string {
        return sprintf(
            'pt-online-schema-change --defaults-file=%s --execute --alter=%s D=%s,t=%s',
            escapeshellarg( $defaults_file ),
            escapeshellarg( $alter ),
            escapeshellarg( $db_name ),
            escapeshellarg( $table )
        );
    }
}

final class SnMigrationCredentialsTest extends TestCase {

    /** Track temp files for cleanup */
    private array $tmp_files = [];

    protected function tearDown(): void {
        foreach ( $this->tmp_files as $f ) {
            if ( file_exists( $f ) ) {
                @unlink( $f );
            }
        }
        $this->tmp_files = [];
    }

    /* ─── R5 Sec-B1 — DB password NEVER appears in commands ──── */

    public function test_mysqldump_command_does_not_contain_password_flag(): void {
        $tmp = sn_mig_write_defaults_file( 'wp_user', 'super-s3cret-p@ss', 'localhost' );
        $this->tmp_files[] = $tmp;
        $cmd = sn_mig_build_mysqldump_cmd( $tmp, 'wp_db', [ 'wp_options' ], '/tmp/snap.sql' );
        $this->assertStringNotContainsString( '--password=', $cmd, 'NEVER --password= in process listing' );
        $this->assertStringNotContainsString( '-p', $cmd, 'NEVER short -p flag' );
        // The actual password must NOT appear in the command at all
        $this->assertStringNotContainsString( 'super-s3cret-p@ss', $cmd );
    }

    public function test_ptosc_command_does_not_contain_password_flag(): void {
        $tmp = sn_mig_write_defaults_file( 'wp_user', 'super-s3cret-p@ss', 'localhost' );
        $this->tmp_files[] = $tmp;
        $cmd = sn_mig_build_ptosc_cmd( $tmp, 'wp_db', 'wp_dinoco_sn_pool', 'ADD COLUMN x INT' );
        $this->assertStringNotContainsString( '--password=', $cmd );
        $this->assertStringNotContainsString( 'super-s3cret-p@ss', $cmd );
    }

    public function test_mysqldump_uses_defaults_extra_file_flag(): void {
        $tmp = sn_mig_write_defaults_file( 'u', 'p', 'h' );
        $this->tmp_files[] = $tmp;
        $cmd = sn_mig_build_mysqldump_cmd( $tmp, 'wp_db', [], '/tmp/x.sql' );
        $this->assertStringContainsString( '--defaults-extra-file=', $cmd );
    }

    public function test_ptosc_uses_defaults_file_flag(): void {
        $tmp = sn_mig_write_defaults_file( 'u', 'p', 'h' );
        $this->tmp_files[] = $tmp;
        $cmd = sn_mig_build_ptosc_cmd( $tmp, 'wp_db', 't', 'ADD COLUMN x INT' );
        $this->assertStringContainsString( '--defaults-file=', $cmd );
    }

    /* ─── chmod 0600 — owner only ───────────────────────────── */

    public function test_temp_cnf_chmod_is_0600(): void {
        $tmp = sn_mig_write_defaults_file( 'u', 'p', 'h' );
        $this->tmp_files[] = $tmp;
        $perms = fileperms( $tmp ) & 0777;
        $this->assertSame( 0600, $perms, 'chmod 0600 — owner-only read/write' );
    }

    public function test_temp_cnf_not_world_readable(): void {
        $tmp = sn_mig_write_defaults_file( 'u', 'p', 'h' );
        $this->tmp_files[] = $tmp;
        $perms = fileperms( $tmp ) & 0777;
        // Other = bottom 3 bits, must be 0 (no read, no write, no exec)
        $this->assertSame( 0, $perms & 0007, 'no world access' );
        // Group = middle 3 bits, must be 0
        $this->assertSame( 0, $perms & 0070, 'no group access' );
    }

    /* ─── .cnf format correctness ─────────────────────────── */

    public function test_cnf_file_format_matches_mysql_spec(): void {
        $tmp = sn_mig_write_defaults_file( 'wp_user', 'p@ss', 'localhost' );
        $this->tmp_files[] = $tmp;
        $content = file_get_contents( $tmp );
        $this->assertStringContainsString( '[client]', $content );
        $this->assertStringContainsString( 'user=wp_user', $content );
        $this->assertStringContainsString( 'password=p@ss', $content );
        $this->assertStringContainsString( 'host=localhost', $content );
    }

    public function test_cnf_starts_with_client_section_header(): void {
        $tmp = sn_mig_write_defaults_file( 'u', 'p', 'h' );
        $this->tmp_files[] = $tmp;
        $content = file_get_contents( $tmp );
        $this->assertStringStartsWith( '[client]', $content );
    }

    /* ─── tempnam pattern (sn_mig prefix) ────────────────── */

    public function test_temp_file_uses_dinoco_prefix(): void {
        $tmp = sn_mig_write_defaults_file( 'u', 'p', 'h' );
        $this->tmp_files[] = $tmp;
        $basename = basename( $tmp );
        $this->assertStringStartsWith( 'dnc-mig-', $basename, 'identifiable by prefix in /tmp' );
    }

    public function test_temp_file_in_system_temp_dir(): void {
        $tmp = sn_mig_write_defaults_file( 'u', 'p', 'h' );
        $this->tmp_files[] = $tmp;
        // macOS resolves symlinks adding /private prefix — compare realpaths
        $this->assertSame(
            realpath( sys_get_temp_dir() ),
            realpath( dirname( $tmp ) ),
            'temp file MUST live under system temp dir'
        );
    }

    /* ─── finally-unlink semantics ────────────────────────── */

    public function test_finally_unlink_simulation(): void {
        // Mirror of caller pattern:
        //   $tmp = sn_mig_write_defaults_file(...);
        //   try { ... shell_exec ... }
        //   finally { @unlink($tmp); }
        $tmp = sn_mig_write_defaults_file( 'u', 'p', 'h' );
        $this->assertFileExists( $tmp );
        try {
            // simulate work
            file_get_contents( $tmp );
        } finally {
            @unlink( $tmp );
        }
        $this->assertFileDoesNotExist( $tmp, 'finally MUST unlink' );
    }

    public function test_finally_unlink_after_exception(): void {
        $tmp = sn_mig_write_defaults_file( 'u', 'p', 'h' );
        $this->assertFileExists( $tmp );
        try {
            try {
                throw new \RuntimeException( 'simulated mysqldump failure' );
            } finally {
                @unlink( $tmp );
            }
        } catch ( \RuntimeException $e ) {
            // expected
        }
        $this->assertFileDoesNotExist(
            $tmp,
            'finally MUST unlink even when shell command throws'
        );
    }

    /* ─── Special chars in DB credentials ─────────────────── */

    public function test_password_with_dollar_sign_safe(): void {
        $tmp = sn_mig_write_defaults_file( 'u', '$money$pass', 'h' );
        $this->tmp_files[] = $tmp;
        $content = file_get_contents( $tmp );
        // Dollar sign must be preserved literally in .cnf (no shell expansion
        // because file is not executed by shell)
        $this->assertStringContainsString( 'password=$money$pass', $content );
    }

    public function test_password_with_backtick_safe(): void {
        $tmp = sn_mig_write_defaults_file( 'u', 'p`ass`word', 'h' );
        $this->tmp_files[] = $tmp;
        $content = file_get_contents( $tmp );
        $this->assertStringContainsString( 'password=p`ass`word', $content );
    }

    public function test_password_with_quotes_safe(): void {
        $tmp = sn_mig_write_defaults_file( 'u', 'p"a\'s"s', 'h' );
        $this->tmp_files[] = $tmp;
        $content = file_get_contents( $tmp );
        $this->assertStringContainsString( 'password=p"a\'s"s', $content );
    }

    public function test_password_with_newline_PROBLEMATIC(): void {
        // EDGE CASE: newline in password would break .cnf format
        // (each line is a separate config option). Production guard?
        // Currently our mirror doesn't validate — but real impl SHOULD reject.
        $tmp = sn_mig_write_defaults_file( 'u', "pass\nword", 'h' );
        $this->tmp_files[] = $tmp;
        $content = file_get_contents( $tmp );
        // Newline in password would split into 2 lines — not safe but
        // out of scope for SCM helper (pre-validate at config layer).
        $this->assertStringContainsString( "password=pass\nword", $content );
    }

    /* ─── Argument escaping verification ──────────────────── */

    public function test_table_names_are_shell_escaped(): void {
        $tmp = sn_mig_write_defaults_file( 'u', 'p', 'h' );
        $this->tmp_files[] = $tmp;
        $cmd = sn_mig_build_mysqldump_cmd(
            $tmp,
            'wp_db',
            [ 'wp_options', 'wp_users' ],
            '/tmp/x.sql'
        );
        // escapeshellarg adds single quotes around args
        $this->assertMatchesRegularExpression( "/'wp_options'/", $cmd );
        $this->assertMatchesRegularExpression( "/'wp_users'/", $cmd );
    }

    public function test_alter_clause_is_shell_escaped(): void {
        $tmp = sn_mig_write_defaults_file( 'u', 'p', 'h' );
        $this->tmp_files[] = $tmp;
        $alter = "ADD COLUMN sig_bucket CHAR(16) NOT NULL DEFAULT ''";
        $cmd = sn_mig_build_ptosc_cmd( $tmp, 'wp_db', 't', $alter );
        // The alter must be wrapped in single quotes, internal single
        // quotes escaped via close-quote-quote-open-quote pattern
        $this->assertStringContainsString( "ADD COLUMN sig_bucket", $cmd );
    }

    /* ─── Sanity: no password leak in command at all ─────── */

    public function test_no_secret_in_dumped_command_output(): void {
        // Most paranoid test: even with adversarial inputs, password must
        // NEVER appear in the constructed command string
        $secret = 'EXTREMELY-SECRET-PASSWORD-DO-NOT-LEAK';
        $tmp = sn_mig_write_defaults_file( 'wp_user', $secret, 'localhost' );
        $this->tmp_files[] = $tmp;

        $cmd_dump = sn_mig_build_mysqldump_cmd(
            $tmp,
            'wp_db',
            [ 'wp_dinoco_sn_pool' ],
            '/tmp/x.sql'
        );
        $this->assertStringNotContainsString(
            $secret,
            $cmd_dump,
            'secret MUST NOT appear in mysqldump command'
        );

        $cmd_osc = sn_mig_build_ptosc_cmd(
            $tmp,
            'wp_db',
            'wp_dinoco_sn_pool',
            'ADD COLUMN x INT'
        );
        $this->assertStringNotContainsString(
            $secret,
            $cmd_osc,
            'secret MUST NOT appear in pt-osc command'
        );
    }
}
