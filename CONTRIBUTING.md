# Contributing to DINOCO

Workflow guide for contributors. Read this before your first PR.

---

## TL;DR

```bash
npm install                              # one-time
bash scripts/install-hooks.sh            # one-time, installs pre-push gate
npm run test:all -- --skip-php           # before every push (3s)
git push                                 # pre-push hook runs gates again
```

---

## Architecture in 60 seconds

DINOCO is a **WordPress + ACF** monorepo with no traditional build step. Code ships in three flavors:

1. **WP Code Snippets** (root-level files like `[B2B] Snippet 3: …`) — PHP without `<?php` tag, deployed via GitHub Webhook Sync engine on push to `main`. Each file has a `DB_ID: NNN` header that maps to the `wp_snippets` table row.
2. **Frontend modules** (`liff-src/`) — ES modules built with Vite into `dist/liff/*` for future LIFF migration. Currently a parallel scaffold; inline JS in WP snippets still does the actual work.
3. **OpenClaw Mini CRM** (`openclawminicrm/`) — separate Node.js + Next.js app with its own deploy pipeline. See [openclawminicrm/CLAUDE.md](openclawminicrm/CLAUDE.md).

See [CLAUDE.md](CLAUDE.md) for the comprehensive architecture overview.

---

## Local setup

### Frontend tooling

```bash
npm install
```

Installs Jest, ESLint, TypeScript, Vite, Tailwind, swagger-parser, etc.

### Backend (PHP) tooling — optional, only for PHPUnit

```bash
composer install
mysql -uroot -e "CREATE DATABASE wordpress_test;"
bash bin/install-wp-tests.sh wordpress_test root '' 127.0.0.1 latest
export WP_TESTS_DIR=/tmp/wordpress-tests-lib
```

See [docs/runbooks/TESTING-PHASE-5.md](docs/runbooks/TESTING-PHASE-5.md) for the full setup.

### Git hooks

```bash
bash scripts/install-hooks.sh
```

Installs the pre-push hook that runs ESLint + TypeScript + Jest when frontend files change. The hook is path-filtered so backend-only pushes don't pay the cost.

---

## Writing code

### File placement

| Change type | Goes in |
|---|---|
| New REST endpoint | Existing `[B2B|B2F|Admin System|System|LIFF AI] Snippet N: …` file (look up the right namespace) |
| New shared frontend logic | `liff-src/shared/*.js` with JSDoc + Jest test |
| New LIFF page | `liff-src/<surface>/<page>/entry.js` (Phase 2 migration target) |
| Helper function used by snippets | Add to nearest snippet, expose via `function_exists` guards |

### WP Snippet conventions

- **No `<?php` tag at line 1** — Code Snippets plugin injects it at runtime. CI lints PHP via PHPUnit; do not add the tag.
- **DB_ID header** — every snippet has `DB_ID: NNN` in its first comment block. Sync engine matches by DB_ID, falling back to filename.
- **Version bump** — bump the snippet's version (`V.X.Y`) on any code change. Sync engine uses hash to detect changes; identical hash → no sync even if forced.
- **Brackets-prefix files** — `[B2B] Snippet 3: …`, `[Admin System] DINOCO Audit Log`. Prefix groups related files in directory listings.

### Style

- Indentation: see [.editorconfig](.editorconfig). 4 spaces for JS/PHP, 2 for YAML/MD.
- Thai comments are fine — most of the codebase uses Thai for business logic.
- No emoji in PRs unless the user explicitly asks.

---

## Testing

### Quality gates (all run on every push)

| Gate | Tool | Catches |
|---|---|---|
| Static analysis | ESLint | Undefined refs, unused vars, eq inconsistency |
| Type check | TypeScript --checkJs | JSDoc type bugs, undeclared globals |
| Unit tests | Jest | Module-level regressions |
| API spec | OpenAPI validator | Spec corruption |
| Doc rot | Markdown link checker | Broken refs |
| Secrets | Pattern scanner | Committed credentials |
| RCE/XSS | Dangerous-API scanner | eval, Function, document.write |
| Bundle bloat | Vite size guard | >10KB per entry |
| Logic regression | PHPUnit Unit | Math/policy bugs |
| DB integration | PHPUnit Integration | FOR UPDATE, GET_LOCK, FSM |
| Dep CVEs | npm + composer audit | Known vulns |
| SAST | CodeQL | Taint flows, prototype pollution |

### Local commands

```bash
npm run test:all                      # everything (frontend + backend)
npm run test:all -- --skip-php        # frontend only (3s)

# Individual gates:
npm run lint                          # ESLint
npm run typecheck                     # tsc --checkJs
npm test                              # Jest
npm run audit:prod                    # npm audit production deps
composer test:unit                    # PHPUnit Unit (fast, no DB)
composer test:integration             # PHPUnit Integration (real WP)
```

### Adding tests

- **Pure-function PHP**: add to `tests/helpers/*Test.php` (extend `PHPUnit\Framework\TestCase`)
- **Integration PHP**: add to `tests/integration/*Test.php` (extend `DinocoIntegrationTestCase`)
- **Frontend JS**: add to `tests/jest/*.test.js` (jsdom environment)
- **OpenAPI changes**: `docs/api/openapi.yaml` is auto-validated by `tests/jest/openapi.test.js`

---

## Submitting changes

### Commit conventions

```
<type>(<scope>): <subject>

<body — optional, include "why" when non-obvious>

Co-Authored-By: <if pair-programmed>
```

Types: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `perf`, `security`

Examples:
- `fix(b2b): debt double-add in BO fulfill (Snippet 16 V.1.7)`
- `test(security): secrets / credential leak scanner`
- `chore(ci): security audit workflow — npm + composer`

### PR checklist

- [ ] `npm run test:all` passes locally
- [ ] Snippet version bumped (if code change)
- [ ] CLAUDE.md updated if architectural change
- [ ] No `<?php` tag added to snippet files
- [ ] No `console.log` in liff-src/ (use `console.warn/error/info`)
- [ ] No hardcoded secrets (scanner catches but easier to avoid in first place)

### Emergency overrides

When you genuinely need to bypass a gate (rare):

```bash
git push --no-verify              # skip pre-push hook
SKIP_JEST=1 git push              # skip Jest specifically
REGRESSION_REQUIRE_AGENT=0 git push   # skip OpenClaw regression gate
```

These are audited via commit history. Don't use casually.

---

## Useful references

- [README.md](README.md) — project overview
- [CLAUDE.md](CLAUDE.md) — architecture deep-dive (~7000 lines of accumulated wisdom)
- [SYSTEM-REFERENCE.md](SYSTEM-REFERENCE.md) — snippet ↔ DB schema mapping
- [WORKFLOW-REFERENCE.md](WORKFLOW-REFERENCE.md) — business workflows
- [docs/runbooks/TESTING-PHASE-5.md](docs/runbooks/TESTING-PHASE-5.md) — PHPUnit setup
- [docs/runbooks/TESTING-PHASE-6.md](docs/runbooks/TESTING-PHASE-6.md) — Jest setup
- [docs/api/openapi.yaml](docs/api/openapi.yaml) — REST API spec

---

## Getting unstuck

- **Pre-push hook fails on a clean checkout** → `npm install` first; hook bails gracefully if `node_modules/` missing
- **PHPUnit Integration won't run locally** → `WP_TESTS_DIR` env var missing; see TESTING-PHASE-5 runbook
- **TypeScript complains about undeclared global** → add to `liff-src/types.d.ts` ambient declarations
- **CodeQL workflow not running** → likely private repo without GHAS; non-fatal, the workflow file is ready when GHAS enables
- **Snippet didn't sync to WP after push** → check the snippet has a `DB_ID: NNN` header and the version was bumped; identical hash skips sync
