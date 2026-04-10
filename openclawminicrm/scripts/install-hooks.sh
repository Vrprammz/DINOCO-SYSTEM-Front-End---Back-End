#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# install-hooks.sh — one-time setup for git hooks V.2.0
# Usage: ./openclawminicrm/scripts/install-hooks.sh
# ═══════════════════════════════════════════════════════════
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || cd "$SCRIPT_DIR/../.." && pwd)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
HOOK_SRC="$SCRIPT_DIR/git-hooks/pre-push"
HOOK_DST="$HOOKS_DIR/pre-push"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "ERROR: $HOOKS_DIR does not exist — is this a git repo?"
  exit 1
fi

if [ ! -f "$HOOK_SRC" ]; then
  echo "ERROR: hook source not found: $HOOK_SRC"
  exit 1
fi

echo "[install-hooks] Installing pre-push hook..."
cp "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_DST"

# Verify install succeeded
if [ ! -x "$HOOK_DST" ]; then
  echo "ERROR: hook install failed — $HOOK_DST is not executable"
  exit 1
fi

echo "[install-hooks] Installed pre-push hook:"
ls -la "$HOOK_DST"
echo ""
echo "The Regression Guard will now run before every push when"
echo "chatbot files change (proxy/modules/*.js, docs/chatbot-rules.md,"
echo "scripts/regression.js, scripts/seed-regression.js)."
echo ""
echo "Override options:"
echo "  git push --no-verify               # emergency bypass (skip all hooks)"
echo "  REGRESSION_REQUIRE_AGENT=0 git push  # skip gate when agent is down"
