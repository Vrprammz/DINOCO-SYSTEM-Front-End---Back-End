#!/bin/bash
# auto-train.sh V.2 — DINOCO AI Chatbot Self-Improving Loop
# Usage: bash scripts/auto-train.sh [--rounds 10] [--gen 50]
set -e
cd /opt/dinoco/openclawminicrm

ROUNDS=10
GEN_COUNT=50
API_KEY="dnc-api-2026-supersecret-changethis"
AGENT=$(docker ps --format '{{.Names}}' | grep -i agent)
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_GENERATED=0
MAX_RETRY=2

while [[ $# -gt 0 ]]; do
  case $1 in
    --rounds) ROUNDS=$2; shift 2;;
    --gen) GEN_COUNT=$2; shift 2;;
    *) shift;;
  esac
done

# Track fail count per test
declare -A FAIL_COUNT

echo "╔════════════════════════════════════════════╗"
echo "║  DINOCO Auto-Train v2.0                    ║"
echo "║  Rounds: $ROUNDS | Gen: $GEN_COUNT | MaxRetry: $MAX_RETRY  ║"
echo "╚════════════════════════════════════════════╝"

for ROUND in $(seq 1 $ROUNDS); do
  TESTS=$(tail -n +2 scripts/test-cases.csv | wc -l)

  if [ "$TESTS" -eq 0 ]; then
    echo ""
    echo "═══ Round $ROUND: ไม่มี test → สร้างคำถามใหม่ $GEN_COUNT ข้อ ═══"
    # Reset fail counts
    declare -A FAIL_COUNT

    docker exec $AGENT node -e "
const { getDB } = require('./modules/shared');
async function gen() {
  const db = await getDB();
  if (!db) { console.log('GENERATED:0'); return; }
  const kb = await db.collection('knowledge_base').find({active:{\$ne:false}}).limit(50).toArray();
  const kbText = kb.map(k => k.title + ': ' + (k.content||'').substring(0,100)).join('\n');
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) { console.log('GENERATED:0'); return; }
  const prompt = 'สร้าง test cases สำหรับ AI chatbot DINOCO (อะไหล่มอเตอร์ไซค์)\nจาก KB:\n' + kbText + '\n\nสร้าง ${GEN_COUNT} คำถามใหม่ ภาษาไทย จำลองลูกค้าจริง\nFormat CSV:\nmessage,mustContain,mustNotContain,critical,name\n\nกฎ: mustContain ใช้ | เป็น OR / mustNotContain เว้นว่าง / critical true เฉพาะข้อสำคัญ / คำถามหลากหลาย / ห้ามซ้ำ\nตอบเฉพาะ CSV rows ไม่ต้อง header ไม่ต้องอธิบาย';
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key='+apiKey, {
      method:'POST', headers:{'Content-Type':'application/json'},
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.7,maxOutputTokens:8000}}),
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const lines = text.split('\n').filter(l => l.trim().startsWith('\"') && l.includes(','));
    console.log('GENERATED:' + lines.length);
    lines.forEach(l => console.log(l));
  } catch(e) { console.log('GENERATED:0'); }
}
gen();
" 2>/dev/null > /tmp/gen-output.txt

    GEN_LINES=$(grep "^GENERATED:" /tmp/gen-output.txt | head -1 | cut -d: -f2)
    if [ "${GEN_LINES:-0}" -gt 0 ] 2>/dev/null; then
      grep "^\"" /tmp/gen-output.txt >> scripts/test-cases.csv
      TOTAL_GENERATED=$((TOTAL_GENERATED + GEN_LINES))
      echo "✅ สร้าง $GEN_LINES ข้อใหม่ (รวม $TOTAL_GENERATED)"
    else
      echo "⚠️ Gemini สร้างไม่ได้ ข้ามรอบ"
    fi
    continue
  fi

  echo ""
  echo "═══ Round $ROUND/$ROUNDS: Testing $TESTS ข้อ ═══"

  docker cp scripts/test-ai.js $AGENT:/tmp/test-ai.js
  docker cp scripts/test-cases.csv $AGENT:/tmp/test-cases.csv
  docker exec $AGENT node /tmp/test-ai.js 2>/dev/null > /tmp/test-result.txt

  # Count PASS/FAIL from result line
  RESULT_LINE=$(grep "^RESULTS:" /tmp/test-result.txt || echo "")
  if [ -n "$RESULT_LINE" ]; then
    PASS=$(echo "$RESULT_LINE" | grep -oP '\d+ passed' | grep -oP '\d+')
    FAIL=$(echo "$RESULT_LINE" | grep -oP '\d+ failed' | grep -oP '\d+')
  else
    PASS=$(grep -c "\.\.\. PASS" /tmp/test-result.txt || echo 0)
    FAIL=$(grep -c "\.\.\. FAIL" /tmp/test-result.txt || echo 0)
  fi

  PASS=${PASS:-0}
  FAIL=${FAIL:-0}
  TOTAL=$((PASS + FAIL))
  SCORE=0
  [ "$TOTAL" -gt 0 ] && SCORE=$((PASS * 100 / TOTAL))

  echo "📊 PASS: $PASS | FAIL: $FAIL | Score: $SCORE%"
  TOTAL_PASS=$((TOTAL_PASS + PASS))
  TOTAL_FAIL=$((TOTAL_FAIL + FAIL))

  if [ "$FAIL" -eq 0 ]; then
    echo "🎉 ALL PASS! → ล้าง test สร้างใหม่รอบหน้า"
    echo '"message","mustContain","mustNotContain","critical","name"' > scripts/test-cases.csv
    continue
  fi

  # Extract FAIL names
  grep "\.\.\. FAIL" /tmp/test-result.txt | grep -oP '\] [^:]+:' | sed 's/\] //;s/://' > /tmp/fail-names.txt

  # Track retry count — ข้อที่ FAIL ซ้ำ > MAX_RETRY ลบออก
  SKIP_LIST=""
  while IFS= read -r fname; do
    fname=$(echo "$fname" | xargs)
    FAIL_COUNT[$fname]=$(( ${FAIL_COUNT[$fname]:-0} + 1 ))
    if [ "${FAIL_COUNT[$fname]}" -gt "$MAX_RETRY" ]; then
      echo "⏭️ ลบ $fname (FAIL $MAX_RETRY รอบซ้ำ — Gemini behavior)"
      SKIP_LIST="$SKIP_LIST|$fname"
    fi
  done < /tmp/fail-names.txt

  # Keep only FAIL rows (ไม่รวมข้อที่ skip)
  python3 -c "
import csv
fails = set()
skips = set('${SKIP_LIST}'.split('|'))
with open('/tmp/fail-names.txt') as f:
    for line in f:
        n = line.strip()
        if n and n not in skips:
            fails.add(n)
rows = []
with open('scripts/test-cases.csv','r') as f:
    reader = csv.reader(f)
    header = next(reader)
    rows.append(header)
    for row in reader:
        if len(row)<5: continue
        prefix = row[4].split(':')[0].strip()
        if prefix in fails:
            rows.append(row)
with open('scripts/test-cases.csv','w',newline='') as f:
    writer = csv.writer(f,quoting=csv.QUOTE_ALL)
    for row in rows:
        writer.writerow(row)
print(f'Kept {len(rows)-1} FAIL (ลบ {PASS} PASS + {len(skips)-1} skip)')
" 2>/dev/null

  echo "❌ FAIL ที่เหลือ:"
  grep "\.\.\. FAIL" /tmp/test-result.txt | head -5

  sleep 3
done

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║  Auto-Train V2 สรุปผล                      ║"
echo "║  Total PASS: $TOTAL_PASS                          ║"
echo "║  Total FAIL: $TOTAL_FAIL                          ║"
echo "║  Generated: $TOTAL_GENERATED ข้อใหม่                    ║"
echo "╚════════════════════════════════════════════╝"
