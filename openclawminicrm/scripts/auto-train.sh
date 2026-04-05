#!/bin/bash
# auto-train.sh V4.0 — DINOCO AI Self-Improving Loop (Gemini-as-Judge)
#
# V4 changes:
# - ใช้ Gemini ตัดสินแทน regex mustContain (smart-judge.js)
# - ข้อ FAIL → วิเคราะห์สาเหตุ → auto-fix KB
# - Score tracking ทุกรอบ + trend
# - 4 phases: generate → judge → analyze → fix → repeat
#
# Usage: bash scripts/auto-train.sh [--rounds 5] [--gen 30] [--no-fix] [--v3]
set -euo pipefail
cd /opt/dinoco/openclawminicrm

# ═══ Config ═══
ROUNDS=5
GEN_COUNT=30
AUTO_FIX=true
LEGACY_MODE=false
AGENT=$(docker ps --format '{{.Names}}' | grep -i agent || echo "dinoco-agent")
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_KB_ADDED=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --rounds) ROUNDS=$2; shift 2;;
    --gen) GEN_COUNT=$2; shift 2;;
    --no-fix) AUTO_FIX=false; shift;;
    --v3) LEGACY_MODE=true; shift;;
    *) shift;;
  esac
done

echo "=================================================="
echo "  DINOCO Auto-Train V4.0 — Gemini-as-Judge"
echo "  Rounds: $ROUNDS | Gen: $GEN_COUNT | AutoFix: $AUTO_FIX"
echo "=================================================="

# ═══ Copy smart-judge.js เข้า Docker ═══
copy_judge() {
  docker exec $AGENT mkdir -p /app/scripts 2>/dev/null || true
  docker cp scripts/smart-judge.js $AGENT:/app/scripts/smart-judge.js 2>/dev/null || true
}

# ═══ Legacy V3 mode (fallback) ═══
run_legacy_round() {
  local ROUND=$1
  echo ""
  echo "--- Round $ROUND (Legacy V3 mode) ---"
  docker cp scripts/test-ai.js $AGENT:/tmp/test-ai.js
  docker cp scripts/test-cases.csv $AGENT:/tmp/test-cases.csv
  docker exec $AGENT node /tmp/test-ai.js 2>/dev/null || true
}

# ═══ V4 Main Loop ═══
for ROUND in $(seq 1 $ROUNDS); do
  echo ""
  echo "=================================================="
  echo "  Round $ROUND / $ROUNDS"
  echo "=================================================="

  copy_judge

  # --- Phase 1: Generate test cases ---
  echo ""
  echo "[Phase 1] Generating $GEN_COUNT test cases..."
  docker exec $AGENT node /app/scripts/smart-judge.js --generate $GEN_COUNT 2>/dev/null > /tmp/gen-v4-output.txt || true
  GEN_LINES=$(grep -c "Generated" /tmp/gen-v4-output.txt 2>/dev/null || echo "0")
  GEN_LINES=$(echo "$GEN_LINES" | tr -d '[:space:]')
  cat /tmp/gen-v4-output.txt

  if [ "${GEN_LINES:-0}" -eq 0 ]; then
    echo "[WARN] Generate may have failed, check output above"
  fi

  # --- Phase 2: Judge (Gemini ตัดสิน) ---
  echo ""
  echo "[Phase 2] Judging with Gemini..."
  docker exec $AGENT node /app/scripts/smart-judge.js --judge 2>/dev/null > /tmp/judge-output.txt || true
  cat /tmp/judge-output.txt

  # Parse score from output
  SCORE_LINE=$(grep "Score:" /tmp/judge-output.txt 2>/dev/null | tail -1 || echo "")
  PASS_LINE=$(grep "PASS:" /tmp/judge-output.txt 2>/dev/null | tail -1 || echo "")

  # Extract numbers
  PASS=$(echo "$PASS_LINE" | grep -oP 'PASS: \K[0-9]+' 2>/dev/null || echo "0")
  FAIL=$(echo "$PASS_LINE" | grep -oP 'FAIL: \K[0-9]+' 2>/dev/null || echo "0")
  PASS=$(echo "$PASS" | tr -d '[:space:]')
  FAIL=$(echo "$FAIL" | tr -d '[:space:]')
  PASS=${PASS:-0}
  FAIL=${FAIL:-0}
  TOTAL_PASS=$((TOTAL_PASS + PASS))
  TOTAL_FAIL=$((TOTAL_FAIL + FAIL))

  if [ "$FAIL" -eq 0 ] 2>/dev/null; then
    echo ""
    echo "[Round $ROUND] ALL PASS! Score: 100%"
    continue
  fi

  # --- Phase 3: Analyze failures ---
  echo ""
  echo "[Phase 3] Analyzing ${FAIL} failures..."
  docker exec $AGENT node /app/scripts/smart-judge.js --analyze-fails 2>/dev/null > /tmp/analyze-output.txt || true
  cat /tmp/analyze-output.txt

  # --- Phase 4: Auto-fix KB ---
  if [ "$AUTO_FIX" = true ]; then
    echo ""
    echo "[Phase 4] Auto-fixing KB..."
    docker exec $AGENT node /app/scripts/smart-judge.js --auto-fix-kb 2>/dev/null > /tmp/fix-output.txt || true
    cat /tmp/fix-output.txt

    # Count KB additions
    KB_ADDED=$(grep -c "ADDED:" /tmp/fix-output.txt 2>/dev/null || echo "0")
    KB_ADDED=$(echo "$KB_ADDED" | tr -d '[:space:]')
    TOTAL_KB_ADDED=$((TOTAL_KB_ADDED + ${KB_ADDED:-0}))

    if [ "${KB_ADDED:-0}" -gt 0 ]; then
      echo ""
      echo "[Round $ROUND] Added $KB_ADDED KB entries. Next round will re-test."
    fi
  else
    echo "[Phase 4] Skipped (--no-fix)"
  fi

  # Brief pause between rounds
  if [ "$ROUND" -lt "$ROUNDS" ]; then
    echo ""
    echo "--- Waiting 5s before next round ---"
    sleep 5
  fi
done

# ═══ Copy results + KB backup back ═══
echo ""
echo "=================================================="
docker cp $AGENT:/app/scripts/score-history.json scripts/score-history.json 2>/dev/null || true
docker cp $AGENT:/app/scripts/judge-results.json scripts/judge-results.json 2>/dev/null || true
docker cp $AGENT:/app/scripts/fail-analysis.json scripts/fail-analysis.json 2>/dev/null || true
docker cp $AGENT:/app/scripts/kb-auto-added.csv scripts/kb-auto-added.csv 2>/dev/null || true

# ★ V4.2: Merge auto-added KB back to main CSV (กันหาย)
if [ -f scripts/kb-auto-added.csv ]; then
  echo ""
  echo "  Merging auto-added KB back to main CSV..."
  # Append ข้อใหม่ที่ไม่ซ้ำ
  tail -n +2 scripts/kb-auto-added.csv >> "../dinoco_ai_logic_backup (2).csv" 2>/dev/null || true
  KB_NEW=$(tail -n +2 scripts/kb-auto-added.csv 2>/dev/null | wc -l | tr -d ' ')
  echo "  Merged $KB_NEW auto-added KB entries to backup CSV"
fi

# ═══ Final Summary ═══
GRAND_TOTAL=$((TOTAL_PASS + TOTAL_FAIL))
GRAND_SCORE=0
[ "$GRAND_TOTAL" -gt 0 ] && GRAND_SCORE=$((TOTAL_PASS * 100 / GRAND_TOTAL))

echo "=================================================="
echo "  Auto-Train V4 Summary"
echo "  Rounds:    $ROUNDS"
echo "  Total:     $GRAND_TOTAL tests"
echo "  Passed:    $TOTAL_PASS"
echo "  Failed:    $TOTAL_FAIL"
echo "  Score:     $GRAND_SCORE%"
echo "  KB Added:  $TOTAL_KB_ADDED entries"
echo "=================================================="

# Show score trend
if [ -f scripts/score-history.json ]; then
  echo ""
  echo "Score History (last 10):"
  python3 -c "
import json
try:
    h = json.load(open('scripts/score-history.json'))
    for e in h[-10:]:
        ts = e['timestamp'][:16]
        s = e['score']
        bar = '#' * (s // 5) + '-' * (20 - s // 5)
        print(f'  {ts}  {s:3d}% [{bar}]')
except: pass
" 2>/dev/null || true
fi

echo ""
echo "Results: scripts/judge-results.json"
echo "Analysis: scripts/fail-analysis.json"
echo "History: scripts/score-history.json"
