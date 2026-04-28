# DINOCO Test Suite (V.1.0 — scaffold)

Pure PHP unit test scaffold. No WordPress boot required — tests cover
logic-only helpers that can be isolated from WP internals.

## Running

```bash
composer install
./vendor/bin/phpunit
```

PHP version: 8.1+ (see `composer.json` `config.platform`).

## Scope (current)

- `tests/helpers/CurrencyTest.php` — B2F currency formatting (15 cases)
- `tests/helpers/FSMValidationTest.php` — B2B + B2F state transitions (13 cases + parametric)

Total: ~28 assertions across ~20 test methods.

## Conventions

- Test files end in `Test.php` (PHPUnit discovery)
- Pure-logic helpers copied inline into tests (source of truth is still
  the snippet file — inline copy is an isolation boundary until snippets
  are extracted to composer packages)
- Tests MUST pass without a real database, without WordPress bootstrap,
  without network calls

## Phase 5 (Applied — M1 Foundation, 2026-04-28)

Integration layer added at `tests/integration/`. Boots wordpress-develop +
real MySQL via `yoast/wp-test-utils`. Runbook: `docs/runbooks/TESTING-PHASE-5.md`.

- M1 (DONE): bootstrap, base test case, snippet-loader, schema/seed fixtures,
  PHPUnit config split, smoke test, CI installer script, schema parity checker
- M2 (NEXT): first 5 integration tests (stock atomic, FSM rollback, REST nonce,
  DD-3 hierarchy, audit dual-write)
- M3: GitHub Actions workflow + green CI build
- M4: top-10 + concurrent-worker harness
- M5: coverage report + badge

Run integration tests via:

```bash
composer test:integration
```

(Requires `WP_TESTS_DIR` env var + MySQL — see runbook.)

## Future Phases

- **Phase 6**: Frontend JS tests (Jest) for LIFF pages
- **Phase 7**: End-to-end (Playwright) covering LIFF flows

## Guardrails

- NEVER touch production tables from tests
- NEVER require `ABSPATH` symlinked to real WP install
- Keep tests fast (< 5s full suite) — if a test needs a DB, move it to
  Phase 5 integration layer

## CI Integration (future)

Will run via GitHub Actions on every PR:

```yaml
# .github/workflows/phpunit.yml (TODO)
- uses: shivammathur/setup-php@v2
  with: { php-version: '8.1' }
- run: composer install --prefer-dist --no-progress
- run: ./vendor/bin/phpunit
```
