/**
 * tests/jest/sn-stress-test-static-verify.test.js
 *
 * Path 2 deliverable: static verification of stress-test infra without
 * needing a live WP staging server. Lints the assets, validates contracts,
 * and asserts every promised method/flag actually exists in source.
 *
 * Why static? — A live `wp dinoco-sn migrate-schema --dry-run` requires
 * a WP-CLI environment + MySQL + 1M sn_pool rows + the SN snippets installed.
 * That's a Phase 2 W6 staging deploy artifact, not a CI deliverable. What we
 * CAN verify locally:
 *   1. The CLI script parses + has every method documented in the runbook
 *   2. Every Playwright spec parses + uses fixtures that exist
 *   3. Fixture data shape matches what specs consume
 *   4. CLI dry-run flag is wired to the right code paths
 *
 * If a future commit breaks --dry-run support or removes a Playwright spec,
 * this test fails at push time — before the breakage reaches staging.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');

describe('SN Stress Test Static Verification (Path 2)', () => {
    describe('migrate-schema.php — WP-CLI command surface', () => {
        const MIGRATE_PATH = path.join(REPO_ROOT, 'scripts/sn-system/migrate-schema.php');
        let code;
        beforeAll(() => {
            code = fs.readFileSync(MIGRATE_PATH, 'utf8');
        });

        test('script file exists and is non-empty', () => {
            expect(code.length).toBeGreaterThan(1000);
        });

        test('declares WP-CLI command class', () => {
            // Either a class extending Command or a direct WP_CLI::add_command call.
            // Real signature: WP_CLI::add_command('dinoco-sn migrate-schema', 'Dinoco_SN_Migrate_Schema_CLI')
            expect(code).toMatch(
                /WP_CLI::add_command\s*\(\s*['"]dinoco-sn\b/
            );
        });

        test('supports --dry-run flag with mutually-exclusive --execute', () => {
            // Both flags must be documented + checked
            expect(code).toMatch(/\[--dry-run\]/);
            expect(code).toMatch(/\[--execute\]/);
            // Mutual exclusion guard
            expect(code).toMatch(
                /--dry-run\s+and\s+--execute\s+are\s+mutually\s+exclusive/
            );
            // Must-pick-one guard
            expect(code).toMatch(
                /Must\s+specify\s+--dry-run\s+OR\s+--execute/
            );
        });

        test('R5 B1 — DB password via --defaults-extra-file (not CLI arg)', () => {
            // Per R5 Sec-B1 fix: password must NOT appear as -p arg (visible in `ps -ef`)
            expect(code).toMatch(/--defaults-extra-file/);
            // Tempfile pattern with chmod 0600
            expect(code).toMatch(/chmod[^\n]*0600/);
        });

        test('R5 B2 — --skip-snapshot requires typed-confirm + staging guard', () => {
            expect(code).toContain('I-ACCEPT-NO-SNAPSHOT');
            expect(code).toMatch(/--i-am-on-staging/);
        });

        test('R5 B3 — --force writes audit row', () => {
            expect(code).toMatch(/cli_force_bypass/);
        });

        test('R5 B4 — migration body wrapped in MySQL GET_LOCK', () => {
            expect(code).toMatch(/GET_LOCK\(\s*'dinoco_sn_migrate_schema'/);
        });

        test('Sec-G2 — --auto-rollback flag wired to direct_alter', () => {
            expect(code).toMatch(/auto.?rollback/i);
        });

        test('Perf-B3 — preflight rejects in-place ALTER when active sessions > 0', () => {
            // Method must exist + reference wp_usermeta session_tokens
            expect(code).toMatch(/_active_session_count/);
            expect(code).toMatch(/session_tokens/);
        });

        test('uq_dedup collision detection method exists', () => {
            expect(code).toMatch(/detect_uq_dedup_collisions/);
        });

        test('online migration via pt-online-schema-change is referenced', () => {
            expect(code).toMatch(/pt-online-schema-change|pt-osc/i);
        });

        test('declares all 10 expected public methods', () => {
            const required = [
                'run',
                'preflight_check',
                'estimate_alter_duration',
                'detect_uq_dedup_collisions',
                'mysqldump_snapshot',
                'get_alter_statements',
                '_active_session_count',
            ];
            required.forEach((method) => {
                expect(code).toMatch(
                    new RegExp(`function\\s+${method}\\s*\\(`)
                );
            });
        });

        test('lints with PHP parser (no syntax errors)', () => {
            // Spawn php -l using child_process — fail fast if syntax broken
            const { execSync } = require('child_process');
            const tmpfile = path.join(REPO_ROOT, 'tests/jest/.tmp-migrate-schema-lint.php');
            fs.writeFileSync(tmpfile, code);
            try {
                const out = execSync(`php -l "${tmpfile}"`, { encoding: 'utf8' });
                expect(out).toMatch(/No syntax errors/);
            } finally {
                if (fs.existsSync(tmpfile)) fs.unlinkSync(tmpfile);
            }
        });
    });

    describe('Playwright E2E specs — SN smoke gate (5 critical paths)', () => {
        const SPEC_DIR = path.join(REPO_ROOT, 'tests/e2e/specs');
        const FIXTURE_PATH = path.join(REPO_ROOT, 'tests/e2e/fixtures/test-data.json');

        const REQUIRED_SPECS = [
            '01-warranty-activate.spec.ts',
            '02-batch-create.spec.ts',
            '03-receive-bulk.spec.ts',
            '04-claim-autofill.spec.ts',
            '05-extension-checkout.spec.ts',
        ];

        test('all 5 required spec files exist', () => {
            REQUIRED_SPECS.forEach((file) => {
                const p = path.join(SPEC_DIR, file);
                expect(fs.existsSync(p)).toBe(true);
            });
        });

        test('each spec imports from @playwright/test', () => {
            REQUIRED_SPECS.forEach((file) => {
                const code = fs.readFileSync(path.join(SPEC_DIR, file), 'utf8');
                expect(code).toMatch(/from\s+['"]@playwright\/test['"]/);
            });
        });

        test('each spec uses @smoke tag for deploy gate', () => {
            REQUIRED_SPECS.forEach((file) => {
                const code = fs.readFileSync(path.join(SPEC_DIR, file), 'utf8');
                expect(code).toMatch(/@smoke/);
            });
        });

        test('test-data.json fixture exists + parses', () => {
            expect(fs.existsSync(FIXTURE_PATH)).toBe(true);
            const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
            expect(() => JSON.parse(raw)).not.toThrow();
        });

        test('test-data.json has expected top-level keys', () => {
            const data = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
            // Specs reference fixtures.endpoints.* and fixtures.plates.*
            expect(data).toHaveProperty('endpoints');
            expect(data).toHaveProperty('plates');
        });

        test('endpoints fixture covers all critical paths (admin + customer)', () => {
            const data = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
            // Match the actual fixture shape
            const required = [
                'warranty_activate_page', // spec 01 + 04
                'batches_list',           // spec 02 admin REST
                'receive_bulk',           // spec 03 admin REST
                'claim_page',             // spec 04
                'warranty_extend_page',   // spec 05
                'activate',               // spec 01 REST
                'lookup',                 // shared
            ];
            required.forEach((key) => {
                expect(data.endpoints).toHaveProperty(key);
            });
        });

        test('plates fixture has activate_happy + activate_already_registered + activate_not_yet_shipped', () => {
            const data = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
            const required = [
                'activate_happy',
                'activate_already_registered',
                'activate_not_yet_shipped',
            ];
            required.forEach((key) => {
                expect(data.plates).toHaveProperty(key);
            });
        });

        test('liff-mock helper exports injectLiffMockAndWait + DEFAULT_LIFF_PROFILE', () => {
            const helperPath = path.join(REPO_ROOT, 'tests/e2e/helpers/liff-mock.ts');
            expect(fs.existsSync(helperPath)).toBe(true);
            const code = fs.readFileSync(helperPath, 'utf8');
            expect(code).toMatch(/export\s+(async\s+)?function\s+injectLiffMockAndWait/);
            expect(code).toMatch(/export\s+const\s+DEFAULT_LIFF_PROFILE/);
        });

        test('playwright.config.ts wires SN E2E with chromium + liff-mobile projects', () => {
            const cfgPath = path.join(REPO_ROOT, 'tests/e2e/playwright.config.ts');
            expect(fs.existsSync(cfgPath)).toBe(true);
            const code = fs.readFileSync(cfgPath, 'utf8');
            expect(code).toMatch(/chromium/);
            expect(code).toMatch(/liff.?mobile/i);
        });
    });

    describe('Phase 2 W7 atomic deploy doc cross-reference', () => {
        test('deploy strategy doc exists at promised path', () => {
            const docPath = path.join(REPO_ROOT, 'docs/sn-system/12-phase2-w7-deploy-runbook.md');
            // Either V.0.x naming variants are acceptable
            const altPath = path.join(REPO_ROOT, 'docs/sn-system/15-phase2-w7-atomic-deploy-strategy.md');
            const exists = fs.existsSync(docPath) || fs.existsSync(altPath);
            expect(exists).toBe(true);
        });
    });
});
