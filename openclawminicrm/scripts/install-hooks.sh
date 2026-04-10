#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# install-hooks.sh — one-time setup for git hooks
# Usage: ./openclawminicrm/scripts/install-hooks.sh
# ═══════════════════════════════════════════════════════════
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || cd "$SCRIPT_DIR/../.." && pwd)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "ERROR: $HOOKS_DIR does not exist — is this a git repo?"
  exit 1
fi

echo "[install-hooks] Installing pre-push hook..."
cp "$SCRIPT_DIR/git-hooks/pre-push" "$HOOKS_DIR/pre-push"
chmod +x "$HOOKS_DIR/pre-push"
echo "[install-hooks] Done — $HOOKS_DIR/pre-push"
echo ""
echo "The regression guard will now run before every push."
echo "To bypass in emergency: git push --no-verify"
