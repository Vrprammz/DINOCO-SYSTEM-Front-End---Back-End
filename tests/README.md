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

## Future Phases

- **Phase 5 (next sprint)**: WP integration via `wp-env` + wordpress-develop
  - REST endpoint smoke tests
  - CPT + ACF field validation
  - FSM execution tests (real `B2B_Order_FSM::transition()` with in-memory DB)
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
