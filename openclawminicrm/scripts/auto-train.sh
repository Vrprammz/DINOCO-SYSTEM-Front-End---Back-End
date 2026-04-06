#!/bin/bash
# auto-train.sh V6.0 — DINOCO AI Self-Improving Loop (Conversation Mining + Gemini-as-Judge + Flow Test)
#
# V6 changes:
# - เพิ่ม --mine mode เรียก conversation-miner.js ดึงข้อมูลจากแชทจริง
# - เพิ่ม Phase 0: mine จาก chat จริงก่อน generate (ถ้าไม่ได้ --no-mine)
# - 6 phases: mine → generate → judge → flow-test → analyze → fix → repeat
#
# V5 changes:
# - เพิ่ม --flow-test mode ทดสอบ multi-turn conversation (context, tone, accuracy)
# - 10 flow scenarios ครอบคลุม: สินค้า, เคลม, น้ำเสียง, prompt injection, สแลง
# - 5 phases: generate → judge → flow-test → analyze → fix → repeat
#
# Usage: bash scripts/auto-train.sh [--rounds 5] [--gen 30] [--no-fix] [--v3] [--flow-only] [--mine] [--no-mine] [--mine-days 7]
set -euo pipefail
cd /opt/dinoco/openclawminicrm

# ═══ Config ═══
ROUNDS=5
GEN_COUNT=30
AUTO_FIX=true
LEGACY_MODE=false
FLOW_ONLY=false
MINE_ONLY=false
DO_MINE=true
MINE_DAYS=7
AGENT=$(docker ps --format '{{.Names}}' | grep -i agent || echo "dinoco-agent")
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_KB_ADDED=0
FLOW_SCORE=0
MINE_FAILURES=0
MINE_KB=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --rounds) ROUNDS=$2; shift 2;;
    --gen) GEN_COUNT=$2; shift 2;;
    --no-fix) AUTO_FIX=false; shift;;
    --v3) LEGACY_MODE=true; shift;;
    --flow-only) FLOW_ONLY=true; shift;;
    --mine) MINE_ONLY=true; shift;;
    --no-mine) DO_MINE=false; shift;;
    --mine-days) MINE_DAYS=$2; shift 2;;
    *) shift;;
  esac
done

echo "=================================================="
echo "  DINOCO Auto-Train V6.0 — Conversation Mining + Gemini-as-Judge + Flow Test"
echo "  Rounds: $ROUNDS | Gen: $GEN_COUNT | AutoFix: $AUTO_FIX | FlowOnly: $FLOW_ONLY"
echo "  Mine: $DO_MINE | MineDays: $MINE_DAYS"
echo "=================================================="

# ═══ Copy scripts เข้า Docker ═══
copy_judge() {
  docker exec $AGENT mkdir -p /app/scripts 2>/dev/null || true
  docker cp scripts/smart-judge.js $AGENT:/app/scripts/smart-judge.js 2>/dev/null || true
}

copy_miner() {
  docker exec $AGENT mkdir -p /app/scripts 2>/dev/null || true
  docker cp scripts/conversation-miner.js $AGENT:/app/scripts/conversation-miner.js 2>/dev/null || true
}

# ═══ Run conversation mining ═══
run_mine() {
  local MINE_MODE=$1
  local EXTRA_ARGS=${2:-""}
  copy_miner
  echo ""
  echo "[Mine] Running conversation-miner.js --${MINE_MODE} --days $MINE_DAYS $EXTRA_ARGS..."
  docker exec $AGENT node /app/scripts/conversation-miner.js --${MINE_MODE} --days $MINE_DAYS $EXTRA_ARGS 2>/dev/null | tee /tmp/mine-${MINE_MODE}-output.txt || true
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

# ═══ Mine-only shortcut ═══
if [ "$MINE_ONLY" = true ]; then
  echo ""
  echo "=== Conversation Mining Only Mode ==="
  run_mine "find-failures"
  run_mine "extract-kb" "--limit 100"
  run_mine "tone-check"
  run_mine "stats"

  # Copy results back
  docker cp $AGENT:/app/scripts/mined-failures.json scripts/mined-failures.json 2>/dev/null || true
  docker cp $AGENT:/app/scripts/mined-kb-draft.json scripts/mined-kb-draft.json 2>/dev/null || true
  docker cp $AGENT:/app/scripts/mined-tone-report.json scripts/mined-tone-report.json 2>/dev/null || true
  docker cp $AGENT:/app/scripts/mined-stats.json scripts/mined-stats.json 2>/dev/null || true

  MINE_FAILURES=$(grep "Total failures" /tmp/mine-find-failures-output.txt 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")
  MINE_KB=$(grep "KB draft" /tmp/mine-extract-kb-output.txt 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")

  echo ""
  echo "=================================================="
  echo "  Mining Summary"
  echo "  Failures found:  $MINE_FAILURES"
  echo "  KB drafts:       $MINE_KB"
  echo "  Reports:"
  echo "    scripts/mined-failures.json"
  echo "    scripts/mined-kb-draft.json"
  echo "    scripts/mined-tone-report.json"
  echo "    scripts/mined-stats.json"
  echo "=================================================="
  exit 0
fi

# ═══ Flow-only shortcut ═══
if [ "$FLOW_ONLY" = true ]; then
  echo ""
  echo "=== Flow Test Only Mode ==="
  copy_judge
  echo ""
  echo "[Flow Test] Running multi-turn conversation tests..."
  docker exec $AGENT node /app/scripts/smart-judge.js --flow-test 2>/dev/null | tee /tmp/flow-output.txt || true
  FLOW_SCORE=$(grep "Score:" /tmp/flow-output.txt 2>/dev/null | tail -1 | grep -oE '[0-9]+%' | head -1 || echo "0%")
  docker cp $AGENT:/app/scripts/flow-results.json scripts/flow-results.json 2>/dev/null || true
  echo ""
  echo "Flow Test Score: $FLOW_SCORE"
  echo "Results: scripts/flow-results.json"
  exit 0
fi

# ═══ V5 Main Loop ═══
for ROUND in $(seq 1 $ROUNDS); do
  echo ""
  echo "=================================================="
  echo "  Round $ROUND / $ROUNDS"
  echo "=================================================="

  copy_judge

  # --- Phase 0: Mine real conversations (Round 1 only) ---
  if [ "$DO_MINE" = true ] && [ "$ROUND" -eq 1 ]; then
    echo ""
    echo "[Phase 0] Mining real customer conversations (last $MINE_DAYS days)..."
    run_mine "find-failures"
    run_mine "stats"

    MINE_FAILURES=$(grep "Total failures" /tmp/mine-find-failures-output.txt 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")
    echo "[Phase 0] Found $MINE_FAILURES failure patterns from real chats"

    # Extract KB from good conversations
    run_mine "extract-kb" "--limit 50"
    MINE_KB=$(grep "KB draft" /tmp/mine-extract-kb-output.txt 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")
    echo "[Phase 0] Extracted $MINE_KB KB draft entries from real chats"

    # Copy results back
    docker cp $AGENT:/app/scripts/mined-failures.json scripts/mined-failures.json 2>/dev/null || true
    docker cp $AGENT:/app/scripts/mined-kb-draft.json scripts/mined-kb-draft.json 2>/dev/null || true
    docker cp $AGENT:/app/scripts/mined-stats.json scripts/mined-stats.json 2>/dev/null || true
  fi

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

  # --- Phase 2: Judge (Gemini ตัดสิน single-turn) ---
  echo ""
  echo "[Phase 2] Judging with Gemini (single-turn)..."
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

  # --- Phase 2.5: Flow Test (multi-turn) ---
  echo ""
  echo "[Phase 2.5] Flow Test (multi-turn conversations)..."
  docker exec $AGENT node /app/scripts/smart-judge.js --flow-test 2>/dev/null > /tmp/flow-output.txt || true
  cat /tmp/flow-output.txt
  FLOW_SCORE=$(grep "Score:" /tmp/flow-output.txt 2>/dev/null | tail -1 | grep -oE '[0-9]+%' | head -1 || echo "0%")

  if [ "$FAIL" -eq 0 ] 2>/dev/null; then
    echo ""
    echo "[Round $ROUND] Single-turn ALL PASS! Flow: $FLOW_SCORE"
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
docker cp $AGENT:/app/scripts/flow-results.json scripts/flow-results.json 2>/dev/null || true
docker cp $AGENT:/app/scripts/mined-failures.json scripts/mined-failures.json 2>/dev/null || true
docker cp $AGENT:/app/scripts/mined-kb-draft.json scripts/mined-kb-draft.json 2>/dev/null || true
docker cp $AGENT:/app/scripts/mined-stats.json scripts/mined-stats.json 2>/dev/null || true
docker cp $AGENT:/app/scripts/mined-tone-report.json scripts/mined-tone-report.json 2>/dev/null || true

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
echo "  Auto-Train V6 Summary"
echo "  Rounds:       $ROUNDS"
echo "  Single-turn:  $GRAND_TOTAL tests ($GRAND_SCORE%)"
echo "  Passed:       $TOTAL_PASS"
echo "  Failed:       $TOTAL_FAIL"
echo "  Flow Test:    $FLOW_SCORE"
echo "  KB Added:     $TOTAL_KB_ADDED entries"
echo "  Mined:        $MINE_FAILURES failures / $MINE_KB KB drafts"
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
echo "Results:  scripts/judge-results.json"
echo "Flows:    scripts/flow-results.json"
echo "Analysis: scripts/fail-analysis.json"
echo "History:  scripts/score-history.json"
echo "Mined:    scripts/mined-failures.json"
echo "KB Draft: scripts/mined-kb-draft.json"
echo "Stats:    scripts/mined-stats.json"
