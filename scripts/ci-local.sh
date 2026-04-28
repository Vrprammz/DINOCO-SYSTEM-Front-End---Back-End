#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# DINOCO Local CI — runs all quality gates that GitHub Actions
# runs, in the same order, with the same fail-fast semantics.
#
# Usage:
#   npm run test:all       (alias)
#   npm run ci:local       (alias)
#   bash scripts/ci-local.sh
#
# Optional flags:
#   --skip-php             Skip PHPUnit (no PHP / no MySQL set up)
#   --skip-build           Skip Vite build (faster local iteration)
#   --skip-audit           Skip npm/composer audit
#   --no-color             Disable ANSI codes
#
# Exit codes:
#   0 — all gates pass
#   1+ — first failing gate's exit code (fail-fast)
# ═══════════════════════════════════════════════════════════
set -e

# ─── Flags ───
SKIP_PHP=0
SKIP_BUILD=0
SKIP_AUDIT=0
USE_COLOR=1
for arg in "$@"; do
  case "$arg" in
    --skip-php)   SKIP_PHP=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --skip-audit) SKIP_AUDIT=1 ;;
    --no-color)   USE_COLOR=0 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# ─── Colors ───
if [ "$USE_COLOR" = "1" ] && [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BOLD=''; NC=''
fi

START_EPOCH=$(date +%s)

# ─── Helpers ───
section() {
  echo ""
  echo -e "${BOLD}━━━ $1 ━━━${NC}"
}

run_step() {
  local label="$1"; shift
  local step_start=$(date +%s)
  echo -e "${YELLOW}→${NC} $label"
  if "$@"; then
    local elapsed=$(( $(date +%s) - step_start ))
    echo -e "  ${GREEN}✓${NC} ${label} (${elapsed}s)"
  else
    local code=$?
    echo ""
    echo -e "${RED}✗ FAIL${NC}: ${label}"
    echo -e "${RED}aborting (fail-fast).${NC} Fix above, then retry."
    exit "$code"
  fi
}

# ─── Frontend gates ───
section "Frontend"

if [ -d "node_modules" ]; then
  run_step "ESLint"               npm run --silent lint
  run_step "TypeScript --checkJs" npm run --silent typecheck
  run_step "Jest"                 npx --no-install jest --silent

  if [ "$SKIP_BUILD" = "0" ]; then
    run_step "Vite LIFF build"    npm run --silent build:liff
    run_step "Bundle-size guard"  npx --no-install jest --silent tests/jest/bundle-size.test.js
  else
    echo -e "  ${YELLOW}skipped${NC} Vite build (--skip-build)"
  fi

  if [ "$SKIP_AUDIT" = "0" ]; then
    run_step "npm audit (prod)"   npm run --silent audit:prod
  else
    echo -e "  ${YELLOW}skipped${NC} npm audit (--skip-audit)"
  fi
else
  echo -e "${YELLOW}node_modules/ missing — run 'npm install' first.${NC}"
  echo "Skipping all frontend gates."
fi

# ─── Backend gates ───
if [ "$SKIP_PHP" = "0" ]; then
  section "Backend"

  if [ -x "vendor/bin/phpunit" ]; then
    run_step "PHPUnit Unit"       ./vendor/bin/phpunit -c phpunit.xml.dist

    if [ -n "${WP_TESTS_DIR:-}" ]; then
      run_step "PHPUnit Integration" ./vendor/bin/phpunit -c phpunit.integration.xml
    else
      echo -e "  ${YELLOW}skipped${NC} PHPUnit Integration (WP_TESTS_DIR not set)"
      echo -e "    See docs/runbooks/TESTING-PHASE-5.md for setup."
    fi
  else
    echo -e "${YELLOW}vendor/bin/phpunit missing — run 'composer install' first.${NC}"
    echo "Skipping all backend gates."
  fi
else
  section "Backend (skipped — --skip-php)"
fi

# ─── Done ───
ELAPSED=$(( $(date +%s) - START_EPOCH ))
echo ""
echo -e "${GREEN}${BOLD}━━━ ALL GATES PASS ━━━${NC}  (${ELAPSED}s total)"
echo ""
echo "Next:"
echo "  - git push    → triggers same gates in GitHub Actions"
echo "  - bash scripts/install-hooks.sh  → enable pre-push gate locally"
