#!/usr/bin/env bash
# Install root-level git hooks (Jest gate).
# Idempotent — safe to re-run.
#
# Usage: bash scripts/install-hooks.sh

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SOURCE_DIR="$REPO_ROOT/scripts/git-hooks"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "ERROR: $HOOKS_DIR does not exist. Are you in a git repo?"
  exit 1
fi

# pre-push: Jest gate when frontend files change
cp "$SOURCE_DIR/pre-push" "$HOOKS_DIR/pre-push"
chmod +x "$HOOKS_DIR/pre-push"

echo "Installed pre-push hook → $HOOKS_DIR/pre-push"
echo "  Triggers Jest when liff-src/ or tests/jest/ change."
echo "  Override: git push --no-verify   (emergency)"
echo "  Skip:     SKIP_JEST=1 git push   (no node_modules)"
echo ""
echo "Note: openclawminicrm/scripts/git-hooks/pre-push is for the chatbot"
echo "regression guard (different concern — runs Docker agent). Both can"
echo "coexist via this hook chain only if you rename one — current install"
echo "covers the Jest gate only."
