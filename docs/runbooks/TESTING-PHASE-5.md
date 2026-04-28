# Testing — Phase 5 (WordPress Integration)

> Plan reference: `~/.claude/plans/stateless-enchanting-micali.md`
> Applied: M1 foundation only — first 5 integration tests (M2) and CI workflow (M3) coming next.

---

## What Phase 5 adds

Two test suites now live side-by-side:

| Suite | Bootstrap | Speed | What it covers |
|---|---|---|---|
| **DINOCO Unit** (existing) | `tests/bootstrap.php` (pure PHP stubs) | < 5s | 110 logic-only helper tests (math, registry, picker, hierarchy, audit redact) |
| **DINOCO Integration** (NEW Phase 5) | `tests/integration/bootstrap.php` (boots wordpress-develop) | < 30s after first run | Real WP runtime + MySQL, FOR UPDATE locks, REST endpoints, FSM atomicity |

Each has its own PHPUnit config:

- `phpunit.xml.dist` — Unit
- `phpunit.integration.xml` — Integration

---

## One-time setup

### 1. Install dependencies

```bash
composer install
```

This pulls `phpunit/phpunit ^10.0` and `yoast/phpunit-polyfills ^2.0` (dev-only). The base test case extends `WP_UnitTestCase` from wordpress-develop directly — no yoast/wp-test-utils wrapper needed (and that package only supports PHPUnit ≤ 9 anyway).

### 2. Create the test database

Pick whichever MySQL client you have:

```bash
# MySQL 8 / MariaDB
mysql -u root -e "CREATE DATABASE wordpress_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Or via Docker if you don't run MySQL on the host
docker run --rm -p 3306:3306 -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -e MYSQL_DATABASE=wordpress_test mysql:8.0
```

The default credentials assumed by the installer:

- DB host: `127.0.0.1`
- DB user: `root`
- DB password: empty
- DB name: `wordpress_test`

### 3. Install the wordpress-develop test library

```bash
bash bin/install-wp-tests.sh wordpress_test root '' 127.0.0.1 latest
```

This downloads:

- WordPress core to `/tmp/wordpress/`
- Test suite to `/tmp/wordpress-tests-lib/`
- Test config to `/tmp/wordpress-tests-lib/wp-tests-config.php`

The script is idempotent — re-run anytime.

### 4. Export `WP_TESTS_DIR` (per shell session)

```bash
export WP_TESTS_DIR=/tmp/wordpress-tests-lib
```

Optional: add to your `.zshrc` / `.bashrc` for persistence.

---

## Running tests

```bash
# Unit suite (pure logic, no DB)
composer test:unit
# Or: ./vendor/bin/phpunit -c phpunit.xml.dist

# Integration suite (real WP + MySQL)
composer test:integration
# Or: WP_TESTS_DIR=/tmp/wordpress-tests-lib ./vendor/bin/phpunit -c phpunit.integration.xml

# Both back-to-back
composer test:all

# Schema parity check (catches fixture drift vs production)
php scripts/verify-schema-parity.php
```

Expected timings on M1/M3 MacBook (after first run):

- Unit: ~3s, 110 tests
- Integration: ~15s, 5+ tests (will grow in M4)
- Schema parity: ~50ms

---

## Writing a new integration test

1. Create `tests/integration/<TestName>.php`.
2. Extend `DinocoIntegrationTestCase`.
3. In `set_up()`: load fixtures + eval the snippet bodies you need.
4. Use WP factory (`$this->factory->user`, `->post`) for WP-side data; raw `$wpdb` for DINOCO custom tables.
5. Tear-down handles cleanup automatically (TRUNCATEs custom tables, deletes test snippets in 9000-9999 range).

Example skeleton:

```php
<?php
declare( strict_types=1 );

namespace DinocoTests\Integration;

final class MyFeatureTest extends DinocoIntegrationTestCase {

    protected function set_up(): void {
        parent::set_up();
        $this->load_fixture( 'seed-products-hierarchy.sql' );
        $this->eval_snippet_inline( '[B2B] Snippet 15: Custom Tables & JWT Session' );
    }

    public function test_something_atomic(): void {
        global $wpdb;
        $stock = $wpdb->get_var( "SELECT stock_qty FROM {$wpdb->prefix}dinoco_products WHERE sku = 'LEAF-X'" );
        $this->assertSame( '10', $stock );
    }
}
```

---

## Reserved conventions

- Test fixture user IDs: **9001-9007** (distributors), **9101-9103** (makers)
- Test fixture post IDs: **9201-9203** (makers)
- Test snippet IDs in `wp_snippets`: **9000-9999** (production snippets are < 1000)
- Custom-table content is wiped per test in `tear_down()`

If you need an ID outside these ranges, check no other fixture is using it first — collisions corrupt downstream tests.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ERROR: Composer autoload missing` | Forgot `composer install` | Run `composer install` |
| `WP test library not found` | Missing wordpress-develop or `WP_TESTS_DIR` | `bash bin/install-wp-tests.sh ... && export WP_TESTS_DIR=/tmp/wordpress-tests-lib` |
| `Access denied for user 'root'` | DB credentials don't match the install script | Re-run installer with correct creds; or edit `/tmp/wordpress-tests-lib/wp-tests-config.php` |
| `Table 'wordpress_test.wp_dinoco_*' doesn't exist` | First-run schema didn't create — usually because `tests_add_filter('muplugins_loaded', ...)` callback failed silently | Run `php scripts/verify-schema-parity.php` to confirm fixture is intact, then re-run integration suite |
| `Innodb lock wait timeout exceeded` in concurrent tests | MySQL `innodb_lock_wait_timeout` too high (test hangs instead of failing fast) | Set `innodb_lock_wait_timeout=5` in MySQL config (CI does this automatically) |
| Unit suite passes, integration fails immediately | Wrong PHPUnit config used | Use `composer test:integration` (uses `phpunit.integration.xml`) — not `composer test` |
| Snippet eval triggers cron / admin notices | Snippet runs side-effects on load | Snippet should respect `DINOCO_TEST_LOADING_SNIPPET` constant. Add `if ( defined( 'DINOCO_TEST_LOADING_SNIPPET' ) ) return;` to the side-effect block |
| `wp_snippets` table doesn't exist in test DB | Code Snippets plugin not installed in core WP | This is expected — the smoke test marks itself skipped. Real integration tests use `eval_snippet_inline()` instead of activating via plugin |

---

## CI workflow (M3, applied)

`.github/workflows/phpunit.yml` runs both suites on every push to `main` + every PR (excluding pure docs / OpenClaw / RPi changes via `paths-ignore`).

Two parallel jobs:

1. **Unit suite** (~1 min): plain PHPUnit + composer install. No DB needed.
2. **Integration suite** (~3-5 min on cache hit): MySQL 8 service container + cached wordpress-develop checkout + Composer cache.

Caching strategy:

- `~/.cache/composer` keyed by `composer.lock` hash
- `/tmp/wordpress` + `/tmp/wordpress-tests-lib` cached together (both required for bootstrap)

JUnit XML is uploaded as artifact (14d retention) AND surfaced in GitHub Checks UI via `mikepenz/action-junit-report@v4`.

Manual trigger: `workflow_dispatch` is enabled — you can run it from the Actions tab.

## What's NOT covered yet

### M4 — Top-10 + concurrent-worker harness (deferred)

Five more integration tests covering the BO + slip + Flash hook scenarios from the original top-10 list:

- BO Split + debt compound invariant (Snippet 16 `bo-split` REST endpoint)
- Slip apply + dedup multi-invoice (B2F Snippet 7 `b2f_payable_add` + B2B Snippet 13)
- Place-order rate limit `GET_LOCK` atomic (Snippet 1 V.33.7 `b2b_rate_limit`)
- Opaque accept stock snapshot immutability (Snippet 2 V.34.4 confirm_order BO gate)
- BO fulfill → Flash secondary + print queue chain graceful degradation (Snippet 1 + 16 hooks)

For real concurrency tests (#1, #2, #5), implement **2-connection harness**: open a second `mysqli` connection in the same test process, run both transactions in interleaved order — proves FOR UPDATE / GET_LOCK serialization without `pcntl_fork` (CI runners disable it).

Pattern:

```php
final class BoSplitDebtInvariantTest extends DinocoIntegrationTestCase {
    private \mysqli $second_conn;

    public function set_up(): void {
        parent::set_up();
        global $wpdb;
        $this->second_conn = mysqli_connect( DB_HOST, DB_USER, DB_PASSWORD, DB_NAME );
    }

    public function test_concurrent_bo_split_serializes_via_get_lock(): void {
        // Tx1 (default $wpdb): START + lock + first split
        // Tx2 (second_conn):   START + same lock acquire (blocks)
        // Tx1 commits → Tx2 unblocks → second split sees updated state
        // Assert: total fulfilled qty == initial qty (no double-credit)
    }
}
```

### M5 — Coverage report + CI badge (deferred)

Steps:

1. Add `xdebug` extension + `coverage: xdebug` to `setup-php` step in unit job
2. Add `--coverage-clover=clover.xml` to `phpunit -c phpunit.xml.dist` invocation
3. Upload to Codecov via `codecov/codecov-action@v4`
4. Add coverage badge to README.md (after CI green for 3+ runs)

PHP 8.1 + xdebug 3.x adds ~30s overhead — keep coverage on Unit job only (Integration runs against real WP, not useful as a coverage signal for our snippets).

Frontend / E2E tests (Jest, Playwright) are separate phases (Phase 6 / 7) and not in scope here.
