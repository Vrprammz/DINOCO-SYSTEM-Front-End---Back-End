#!/usr/bin/env bash
# Install root-level git hooks (frontend gate: ESLint + tsc + Jest).
#
# Idempotent — safe to re-run. Wired into npm `prepare` lifecycle so
# `npm install` auto-installs for contributors.
#
# Usage:
#   bash scripts/install-hooks.sh           # explicit local install
#   npm install                             # implicit via `prepare`
#
# Env opt-outs (for CI / Docker / non-dev environments):
#   SKIP_HOOKS_INSTALL=1   # bypass entirely (CI sets this)
#   CI=true                # auto-detected, bypasses
set -e

# ─── Skip in CI / when explicitly opted out ───────────────────────
if [ "${SKIP_HOOKS_INSTALL:-0}" = "1" ] || [ "${CI:-}" = "true" ]; then
  exit 0
fi

# ─── Skip if not in a git repo (e.g., npm pack, vendored install) ─
if ! git rev-parse --show-toplevel > /dev/null 2>&1; then
  exit 0
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SOURCE_DIR="$REPO_ROOT/scripts/git-hooks"

# .git could be a file (worktree / submodule) — skip if not standard layout
if [ ! -d "$HOOKS_DIR" ]; then
  exit 0
fi

if [ ! -d "$SOURCE_DIR" ]; then
  exit 0
fi

# ─── pre-push: ESLint + tsc + Jest gate when frontend files change ──
EXISTING_HOOK="$HOOKS_DIR/pre-push"
NEW_HOOK="$SOURCE_DIR/pre-push"

# Skip silently if already up to date (avoids `npm install` noise on
# every install)
if [ -f "$EXISTING_HOOK" ] && cmp -s "$NEW_HOOK" "$EXISTING_HOOK"; then
  exit 0
fi

# If user has a customized pre-push hook (different from any version
# we've shipped), warn instead of overwriting
if [ -f "$EXISTING_HOOK" ]; then
  if ! grep -q "frontend-gate" "$EXISTING_HOOK" 2>/dev/null; then
    echo "[install-hooks] Existing pre-push hook detected — not overwriting." >&2
    echo "  To install DINOCO hook:  rm $EXISTING_HOOK && bash scripts/install-hooks.sh" >&2
    exit 0
  fi
fi

cp "$NEW_HOOK" "$EXISTING_HOOK"
chmod +x "$EXISTING_HOOK"

echo "[install-hooks] Installed pre-push hook → $EXISTING_HOOK"
echo "  Triggers ESLint + tsc + Jest when liff-src/ or tests/jest/ change."
echo "  Emergency bypass: git push --no-verify"
echo "  Skip when no Node:  SKIP_JEST=1 git push"
