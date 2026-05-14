/**
 * Claim Charges Schema drift detector — Phase 2.1 (database-expert task 2.1).
 *
 * Pins the foundation shipped in NEW snippet
 *   [Admin System] DINOCO Claim Charges Schema (V.0.1)
 *
 * Verifies that future edits do not accidentally:
 *   - Drop a column from the wp_dinoco_claim_charges DDL
 *   - Drift schema version without bumping the constant
 *   - Forget the autoload=false flag on schema version + cron heartbeat
 *   - Forget the CHECK constraint MySQL 8.0.16+ gate
 *   - Lose the dbDelta double-space PRIMARY KEY pattern
 *   - Lose the lazy admin_init install hook
 *   - Drift the retention cron from daily/03:30/heartbeat-in-finally
 *
 * Spec source: FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md §3.1 + §6.4
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const SNIPPET_PATH = path.join(REPO, '[Admin System] DINOCO Claim Charges Schema');
const SRC = fs.readFileSync(SNIPPET_PATH, 'utf8');

// Code-only view of the snippet — strips PHP comments so "NOT" assertions
// don't false-positive on header documentation that mentions deferred work.
// (Pattern lifted from S/N R11 audit memory — comment-stripped scan.)
//
//   - block /* ... */ comments (greedy non-greedy across lines)
//   - // ... EOL line comments
//   - # ... EOL line comments (less common but allowed in PHP)
const SRC_CODE_ONLY = SRC
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => line.replace(/\s*(\/\/|#).*$/, ''))
    .join('\n');

describe('Claim Charges Schema — Phase 2.1 drift detector', () => {

    // ─── Snippet existence + header integrity ─────────────────────────

    test('snippet exists at expected path', () => {
        expect(fs.existsSync(SNIPPET_PATH)).toBe(true);
    });

    test('version stamped V.0.4 (Sprint 15)', () => {
        expect(SRC).toMatch(/Version:\s*V\.0\.4\s*\(2026-05-14\)/);
    });

    test('DB_ID placeholder present until boss creates WP admin entry', () => {
        // Per feedback_create_wp_snippet_first memory — boss must create WP
        // entry first. Until then, header carries an explicit placeholder so
        // sync engine + audit can detect.
        expect(SRC).toMatch(/DB_ID:\s*\(pending/);
    });

    test('header documents the boss-must-create-first deploy gate', () => {
        expect(SRC).toMatch(/Create snippet titled/);
        expect(SRC).toMatch(/WILL NOT SYNC/);
    });

    test('cross-snippet refs use [#NNNN] format (avoids snippet-db-id detector false-positive)', () => {
        // Idempotency Helper + Flag Audit Log + Service Center referenced in header
        expect(SRC).toMatch(/\[#1194\]/);  // Idempotency Helper
        expect(SRC).toMatch(/\[#1193\]/);  // Flag Audit Log
        expect(SRC).toMatch(/\[#27\]/);    // Service Center
    });

    test('ABSPATH guard at top of snippet', () => {
        expect(SRC).toMatch(/if\s*\(\s*!\s*defined\(\s*'ABSPATH'\s*\)\s*\)\s*exit;/);
    });

    // ─── Constants — whitelist + schema version ───────────────────────

    test('Sprint 16 — DINOCO_CLAIM_CHARGES_SCHEMA_VERSION bumped to 1.3 (CHECK constraint fix)', () => {
        expect(SRC).toMatch(/define\(\s*'DINOCO_CLAIM_CHARGES_SCHEMA_VERSION'\s*,\s*'1\.3'\s*\)/);
    });

    test('Sprint 16 C1 — chk_amount_snapshot enforces equality (was wrongly > 0)', () => {
        expect(SRC).toMatch(/'chk_amount_snapshot'\s*=>\s*"\(amount_thb\s*=\s*amount_thb_at_create\)"/);
    });

    test('Sprint 16 H1 — refund_approvals cleanup purges consumed tokens too', () => {
        expect(SRC).toMatch(/expires_at\s*<\s*DATE_SUB\(NOW\(\),\s*INTERVAL 7 DAY\)[\s\S]*?OR consumed_at\s*<\s*DATE_SUB\(NOW\(\),\s*INTERVAL 7 DAY\)/);
    });

    test('Sprint 12 DB-C1 — NEW idx_status_created covering index for retention cron', () => {
        expect(SRC).toMatch(/KEY idx_status_created \(status, created_at\)/);
    });

    test('Sprint 12 SEC-M3 — retention DELETE adds ORDER BY created_at ASC', () => {
        expect(SRC).toMatch(/AND created_at < DATE_SUB\(NOW\(\), INTERVAL %d DAY\)[\s\S]*?ORDER BY created_at ASC[\s\S]*?LIMIT 1000/);
    });

    test('DINOCO_CLAIM_CHARGES_REASON_WHITELIST contains 4 canonical reasons', () => {
        const m = SRC.match(/define\(\s*'DINOCO_CLAIM_CHARGES_REASON_WHITELIST'\s*,\s*'([^']+)'\s*\)/);
        expect(m).not.toBeNull();
        const values = m[1].split(',');
        expect(values).toHaveLength(4);
        expect(values).toContain('return_shipping');
        expect(values).toContain('repair_oow');
        expect(values).toContain('extra_parts');
        expect(values).toContain('other');
    });

    test('DINOCO_CLAIM_CHARGES_STATUS_WHITELIST contains 7 canonical states', () => {
        const m = SRC.match(/define\(\s*'DINOCO_CLAIM_CHARGES_STATUS_WHITELIST'\s*,\s*'([^']+)'\s*\)/);
        expect(m).not.toBeNull();
        const values = m[1].split(',');
        expect(values).toHaveLength(7);
        ['pending_payment', 'pending_review', 'verified', 'rejected', 'refunded', 'expired', 'cancelled']
            .forEach(v => expect(values).toContain(v));
    });

    test('DINOCO_CLAIM_CHARGES_BANK_CONTEXT_WHITELIST has 2 values', () => {
        const m = SRC.match(/define\(\s*'DINOCO_CLAIM_CHARGES_BANK_CONTEXT_WHITELIST'\s*,\s*'([^']+)'\s*\)/);
        expect(m).not.toBeNull();
        const values = m[1].split(',');
        expect(values).toEqual(expect.arrayContaining(['claim', 'claim_walkin']));
        expect(values).toHaveLength(2);
    });

    test('status whitelist does NOT leak B2B FSM states', () => {
        const m = SRC.match(/define\(\s*'DINOCO_CLAIM_CHARGES_STATUS_WHITELIST'\s*,\s*'([^']+)'\s*\)/);
        const values = m[1].split(',');
        ['paid', 'fulfilled', 'awaiting_confirm', 'partial_fulfilled', 'all_backorder']
            .forEach(b => expect(values).not.toContain(b));
    });

    // ─── Table name helper ────────────────────────────────────────────

    test('dinoco_claim_charges_table_name() defined and returns prefix + dinoco_claim_charges', () => {
        expect(SRC).toMatch(/function\s+dinoco_claim_charges_table_name\s*\(\s*\)/);
        expect(SRC).toMatch(/return\s+\$wpdb->prefix\s*\.\s*'dinoco_claim_charges'/);
    });

    test('table name literal appears in exactly ONE place (the helper body)', () => {
        // Anti-drift: every other call site MUST use the helper, not hardcode
        const matches = SRC.match(/'dinoco_claim_charges'/g) || [];
        expect(matches.length).toBe(1);
    });

    // ─── dbDelta DDL — 26 column definitions ──────────────────────────
    // (Sprint 11 MED-4 fix — V.0.1 comment said 24, expectedColumns has 26)

    test('CREATE TABLE block exists in snippet', () => {
        expect(SRC).toMatch(/\$sql\s*=\s*"CREATE TABLE\s+\{?\$?table\}?/);
    });

    // Sprint 12 schema-audit fixes:
    //   DB-H1: utf8mb4_bin overrides on slip_ref_hash/payment_ref/bank_code/bank_account
    //   DB-H2: amount_thb DECIMAL(12,2) → DECIMAL(14,2) (B2B parity)
    //   DB-M1: slip_verify_data LONGTEXT → MEDIUMTEXT
    const expectedColumns = [
        'id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT',
        'claim_id BIGINT(20) UNSIGNED NOT NULL',
        'user_id BIGINT(20) UNSIGNED NOT NULL',
        'amount_thb DECIMAL(14,2) NOT NULL',
        'amount_thb_at_create DECIMAL(14,2) NOT NULL',
        'reason VARCHAR(32) NOT NULL',
        'reason_note VARCHAR(500) DEFAULT NULL',
        "status VARCHAR(24) NOT NULL DEFAULT 'pending_payment'",
        'bank_code VARCHAR(16) COLLATE utf8mb4_bin DEFAULT NULL',
        'bank_account VARCHAR(32) COLLATE utf8mb4_bin DEFAULT NULL',
        'bank_holder VARCHAR(128) DEFAULT NULL',
        'bank_name VARCHAR(64) DEFAULT NULL',
        'bank_branch VARCHAR(64) DEFAULT NULL',
        "bank_context VARCHAR(16) DEFAULT 'claim'",
        'slip_image_url VARCHAR(500) DEFAULT NULL',
        'slip_ref_hash CHAR(64) COLLATE utf8mb4_bin DEFAULT NULL',
        'slip_verify_data MEDIUMTEXT DEFAULT NULL',
        'payment_ref VARCHAR(64) COLLATE utf8mb4_bin NOT NULL',
        'verified_at DATETIME DEFAULT NULL',
        'verified_by BIGINT(20) UNSIGNED DEFAULT NULL',
        'refund_reason VARCHAR(500) DEFAULT NULL',
        'refund_approver_id BIGINT(20) UNSIGNED DEFAULT NULL',
        'refunded_at DATETIME DEFAULT NULL',
        'refunded_by BIGINT(20) UNSIGNED DEFAULT NULL',
        'expires_at DATETIME NOT NULL',
        'created_at DATETIME NOT NULL',
        'created_by BIGINT(20) UNSIGNED NOT NULL',
    ];

    test.each(expectedColumns)(
        'DDL contains column: %s',
        (col) => {
            expect(SRC).toContain(col);
        }
    );

    // ─── DDL — indexes + constraints ──────────────────────────────────

    test('DDL declares PRIMARY KEY with dbDelta double-space', () => {
        expect(SRC).toMatch(/PRIMARY KEY {2}\(id\)/);
    });

    test('DDL declares KEY idx_claim (claim_id)', () => {
        expect(SRC).toMatch(/KEY idx_claim \(claim_id\)/);
    });

    test('DDL declares KEY idx_user_status (user_id, status)', () => {
        expect(SRC).toMatch(/KEY idx_user_status \(user_id, status\)/);
    });

    test('DDL declares KEY idx_status_expires (status, expires_at)', () => {
        expect(SRC).toMatch(/KEY idx_status_expires \(status, expires_at\)/);
    });

    test('DDL declares KEY idx_created (created_at)', () => {
        expect(SRC).toMatch(/KEY idx_created \(created_at\)/);
    });

    test('DDL declares UNIQUE KEY uq_slip_replay_claim on slip_ref_hash', () => {
        expect(SRC).toMatch(/UNIQUE KEY uq_slip_replay_claim \(slip_ref_hash\)/);
    });

    // ─── Lazy install ─────────────────────────────────────────────────

    test('lazy install hooked on admin_init', () => {
        expect(SRC).toMatch(/add_action\(\s*'admin_init',\s*function\(\)\s*\{[\s\S]*?dinoco_claim_charges_schema_install/);
    });

    test('schema install short-circuits when version matches target', () => {
        expect(SRC).toMatch(/if\s*\(\s*\$current\s*===\s*\$target\s*\)\s*return;/);
    });

    test('schema version flag uses autoload=false (R9 P4 hygiene)', () => {
        expect(SRC).toMatch(/update_option\(\s*'dinoco_claim_charges_schema_version'\s*,\s*\$target\s*,\s*false\s*\)/);
    });

    test('dbDelta load_path wired correctly', () => {
        expect(SRC).toMatch(/require_once ABSPATH \. 'wp-admin\/includes\/upgrade\.php'/);
    });

    test('dbDelta call wrapped in try/catch (non-throwing)', () => {
        expect(SRC).toMatch(/try\s*\{\s*dbDelta\(\s*\$sql\s*\);[\s\S]+?\}\s*catch\s*\(\s*\\Throwable/);
    });

    // ─── CHECK constraints — MySQL 8.0.16+ / MariaDB 10.2.1+ gating ───

    test('CHECK constraint helper probes MySQL 8.0.16', () => {
        expect(SRC).toMatch(/8\.0\.16/);
    });

    test('CHECK constraint helper probes MariaDB 10.2.1', () => {
        expect(SRC).toMatch(/10\.2\.1/);
    });

    test('CHECK constraint ADDs gated by INFORMATION_SCHEMA precheck', () => {
        expect(SRC).toMatch(/INFORMATION_SCHEMA\.TABLE_CONSTRAINTS/);
        expect(SRC).toMatch(/CONSTRAINT_TYPE = 'CHECK'/);
    });

    test('CHECK constraint names match spec', () => {
        expect(SRC).toMatch(/chk_amount_positive/);
        expect(SRC).toMatch(/chk_reason_whitelist/);
        expect(SRC).toMatch(/chk_status_whitelist/);
    });

    test('amount_positive CHECK clause asserts amount_thb > 0', () => {
        expect(SRC).toMatch(/'chk_amount_positive'\s*=>\s*"\(amount_thb\s*>\s*0\)"/);
    });

    test('CHECK constraint ALTER each wrapped in try/catch (defense in depth)', () => {
        expect(SRC).toMatch(/ALTER TABLE[\s\S]+?ADD CONSTRAINT[\s\S]+?catch\s*\(\s*\\Throwable/);
    });

    // ─── Retention cron ───────────────────────────────────────────────

    test('cleanup_run purges only cancelled + expired (preserves finance audit)', () => {
        expect(SRC).toMatch(/status IN \(\s*'cancelled'\s*,\s*'expired'\s*\)/);
    });

    test('cleanup_run uses 90-day default retention with 30/365 clamps', () => {
        expect(SRC).toMatch(/get_option\(\s*'dinoco_claim_charges_retention_days'\s*,\s*90\s*\)/);
        expect(SRC).toMatch(/\$days\s*<\s*30/);
        expect(SRC).toMatch(/\$days\s*>\s*365/);
    });

    test('cleanup_run uses chunked DELETE 1000/iter × 20 max with 50ms gap', () => {
        expect(SRC).toMatch(/LIMIT 1000/);
        expect(SRC).toMatch(/\$max_iters\s*=\s*20/);
        expect(SRC).toMatch(/usleep\(\s*50000\s*\)/);
    });

    test('cron heartbeat in `finally` block (R12 pattern)', () => {
        // After try { ... } catch { ... }, finally writes heartbeat
        expect(SRC).toMatch(/\}\s*finally\s*\{[\s\S]*?dinoco_cron_claim_charges_cleanup_last_run/);
    });

    test('cron heartbeat uses update_option autoload=false', () => {
        expect(SRC).toMatch(/update_option\(\s*'dinoco_cron_claim_charges_cleanup_last_run'\s*,\s*current_time\(\s*'mysql'\s*\)\s*,\s*false\s*\)/);
    });

    test('Sprint 11 HIGH-1 — retention cron moved to 03:45 (avoid 03:30 contention)', () => {
        expect(SRC).toMatch(/strtotime\(\s*'tomorrow 03:45'\s*\)/);
        expect(SRC).toMatch(/wp_schedule_event\(\s*\$first_run\s*,\s*'daily'\s*,\s*'dinoco_claim_charges_cleanup_cron'\s*\)/);
    });

    test('cron registered via dinoco_register_cron when Health Monitor loaded', () => {
        expect(SRC).toMatch(/function_exists\(\s*'dinoco_register_cron'\s*\)/);
        expect(SRC).toMatch(/dinoco_register_cron\(\s*'dinoco_claim_charges_cleanup_cron'\s*,\s*'daily'\s*,\s*'dinoco_claim_charges_cleanup_run'\s*\)/);
    });

    test('cron falls back to add_action when register_cron missing', () => {
        expect(SRC).toMatch(/add_action\(\s*'dinoco_claim_charges_cleanup_cron'\s*,\s*'dinoco_claim_charges_cleanup_run'\s*\)/);
    });

    // ─── Defensive invariants ─────────────────────────────────────────

    test('all public helpers wrapped in function_exists guards', () => {
        const requiredHelpers = [
            'dinoco_claim_charges_table_name',
            'dinoco_claim_charges_schema_install',
            'dinoco_claim_charges_supports_check_constraints',
            'dinoco_claim_charges_maybe_add_check_constraints',
            'dinoco_claim_charges_cleanup_run',
        ];
        requiredHelpers.forEach(fn => {
            expect(SRC).toMatch(new RegExp(
                String.raw`if\s*\(\s*!\s*function_exists\(\s*'${fn}'\s*\)\s*\)`
            ));
        });
    });

    test('cleanup_run defensively probes for table existence', () => {
        expect(SRC).toMatch(/SHOW TABLES LIKE %s/);
    });

    // ─── Scope discipline — does NOT include Phase 2.2+ work ──────────

    // Scope-discipline checks use comment-stripped SRC_CODE_ONLY so they
    // do not false-positive on the snippet header's "NOT included" notes
    // listing the deferred Phase 2.2+ helpers as documentation.

    test('snippet does NOT register any REST routes (Phase 2.2 owns those)', () => {
        expect(SRC_CODE_ONLY).not.toMatch(/register_rest_route/);
    });

    test('snippet does NOT register any shortcodes (Phase 2.4 owns admin UI)', () => {
        expect(SRC_CODE_ONLY).not.toMatch(/add_shortcode/);
    });

    test('snippet does NOT call Slip2Go verify (Phase 2.2 B1 owns verify wrapper)', () => {
        expect(SRC_CODE_ONLY).not.toMatch(/slip2go|dinoco_verify_slip_for_claim/i);
    });

    test('snippet does NOT install charge expire cron (Phase 2.6 owns it)', () => {
        // claim_charges_cleanup_cron (retention) is OK — but the spec-reserved
        // Phase 2.6 state-machine cron dinoco_claim_charge_expire_cron must
        // not yet exist in this file.
        expect(SRC_CODE_ONLY).not.toMatch(/dinoco_claim_charge_expire_cron/);
    });
});
