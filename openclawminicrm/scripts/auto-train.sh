#!/bin/bash
# auto-train.sh — DINOCO AI Chatbot Self-Improving Loop
# Usage: bash scripts/auto-train.sh [--rounds 10] [--gen 50]
#
# วนลูป: test → ลบ PASS → แก้ FAIL → re-import KB → test ซ้ำ
# เมื่อ FAIL หมด → Gemini สร้างคำถามใหม่ → วนต่อ
# ทุกอย่างใช้ Gemini = ฟรี

set -e
cd /opt/dinoco/openclawminicrm

ROUNDS=${1:-10}
GEN_COUNT=${2:-50}
API_KEY="dnc-api-2026-supersecret-changethis"
AGENT=$(docker ps --format '{{.Names}}' | grep -i agent)
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_GENERATED=0

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --rounds) ROUNDS=$2; shift 2;;
    --gen) GEN_COUNT=$2; shift 2;;
    *) shift;;
  esac
done

echo "╔════════════════════════════════════════════╗"
echo "║  DINOCO Auto-Train v1.0                    ║"
echo "║  Rounds: $ROUNDS | Gen per round: $GEN_COUNT       ║"
echo "╚════════════════════════════════════════════╝"

for ROUND in $(seq 1 $ROUNDS); do
  TESTS=$(wc -l < scripts/test-cases.csv)
  TESTS=$((TESTS - 1))

  if [ "$TESTS" -eq 0 ]; then
    echo ""
    echo "═══ Round $ROUND: ไม่มี test เหลือ → สร้างคำถามใหม่ $GEN_COUNT ข้อ ═══"

    # Gemini สร้างคำถามใหม่
    docker exec $AGENT node -e "
const { getDB } = require('./modules/shared');
async function gen() {
  const db = await getDB();
  if (!db) { console.log('DB error'); return; }

  const kb = await db.collection('knowledge_base').find({active:{\$ne:false}}).limit(50).toArray();
  const kbText = kb.map(k => k.title + ': ' + (k.content||'').substring(0,100)).join('\n');

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) { console.log('No API key'); return; }

  const prompt = \`สร้าง test cases สำหรับ AI chatbot ขายอะไหล่มอเตอร์ไซค์ DINOCO
จากข้อมูล KB นี้:
\${kbText}

สร้าง ${GEN_COUNT} คำถามใหม่ จำลองลูกค้าจริง ภาษาไทย
Format CSV (ห้ามมี double quote ภายใน):
message,mustContain,mustNotContain,critical,name

กฎ:
- mustContain ใช้ | เป็น OR
- mustNotContain เว้นว่าง \"\" เกือบทั้งหมด
- critical true เฉพาะข้อสำคัญมาก
- คำถามต้องหลากหลาย: ถามราคา สเปค เคลม ตัวแทน สแลง อารมณ์ หลอก
- ห้ามซ้ำกัน

ตอบเฉพาะ CSV ไม่ต้องอธิบาย ขึ้นต้นด้วย header\`;

  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key='+apiKey, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        contents: [{role:'user', parts:[{text:prompt}]}],
        generationConfig: {temperature:0.7, maxOutputTokens:8000},
      }),
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Extract CSV lines (skip markdown code blocks)
    const lines = text.split('\n').filter(l => l.startsWith('\"') && l.includes(','));
    if (lines.length > 0) {
      console.log('GENERATED:' + lines.length);
      console.log(lines.join('\n'));
    } else {
      console.log('GENERATED:0');
    }
  } catch(e) { console.log('ERROR:' + e.message); }
}
gen();
" > /tmp/gen-output.txt 2>/dev/null

    GEN_LINES=$(grep "^GENERATED:" /tmp/gen-output.txt | head -1 | cut -d: -f2)
    if [ "$GEN_LINES" -gt 0 ] 2>/dev/null; then
      # Append generated questions (skip GENERATED: line)
      grep "^\"" /tmp/gen-output.txt >> scripts/test-cases.csv
      TOTAL_GENERATED=$((TOTAL_GENERATED + GEN_LINES))
      echo "✅ สร้างคำถามใหม่ $GEN_LINES ข้อ (รวม $TOTAL_GENERATED)"
    else
      echo "⚠️ Gemini สร้างคำถามไม่ได้ ข้ามรอบนี้"
    fi

    # Copy test file
    docker cp scripts/test-cases.csv $AGENT:/tmp/test-cases.csv
    continue
  fi

  echo ""
  echo "═══ Round $ROUND/$ROUNDS: Testing $TESTS ข้อ ═══"

  # Copy test files
  docker cp scripts/test-ai.js $AGENT:/tmp/test-ai.js
  docker cp scripts/test-cases.csv $AGENT:/tmp/test-cases.csv

  # Run test
  docker exec $AGENT node /tmp/test-ai.js 2>/dev/null > /tmp/test-result.txt

  # Parse results
  PASS=$(grep -c "PASS" /tmp/test-result.txt || true)
  FAIL=$(grep -c "FAIL" /tmp/test-result.txt || true)
  SCORE=$((PASS * 100 / (PASS + FAIL)))

  echo "📊 PASS: $PASS | FAIL: $FAIL | Score: $SCORE%"
  TOTAL_PASS=$((TOTAL_PASS + PASS))
  TOTAL_FAIL=$((TOTAL_FAIL + FAIL))

  if [ "$FAIL" -eq 0 ]; then
    echo "🎉 ALL PASS! → สร้างคำถามใหม่รอบหน้า"
    # ลบทั้งหมด เหลือ header
    head -1 scripts/test-cases.csv > /tmp/header.csv
    mv /tmp/header.csv scripts/test-cases.csv
    continue
  fi

  # ลบ PASS เก็บ FAIL
  echo "🗑️ ลบ $PASS ข้อ PASS เหลือ $FAIL ข้อ FAIL"

  # Extract FAIL names
  grep "FAIL" /tmp/test-result.txt | grep -oP '\] [A-Z0-9_]+:' | sed 's/\] //;s/://' > /tmp/fail-names.txt

  # Keep only FAIL rows
  python3 -c "
import csv, sys
fails = set()
with open('/tmp/fail-names.txt') as f:
    for line in f:
        fails.add(line.strip())

rows = []
with open('scripts/test-cases.csv', 'r') as f:
    reader = csv.reader(f)
    header = next(reader)
    rows.append(header)
    for row in reader:
        if len(row) < 5: continue
        name = row[4]
        prefix = name.split(':')[0].strip()
        if prefix in fails:
            rows.append(row)

with open('scripts/test-cases.csv', 'w', newline='') as f:
    writer = csv.writer(f, quoting=csv.QUOTE_ALL)
    for row in rows:
        writer.writerow(row)
print(f'Kept {len(rows)-1} FAIL tests')
" 2>/dev/null

  # Show FAIL details
  echo "❌ FAIL:"
  grep "FAIL" /tmp/test-result.txt | head -10

  echo ""
  echo "⏳ รอ 5 วิ ก่อนรอบถัดไป..."
  sleep 5
done

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║  Auto-Train สรุปผล                         ║"
echo "║  Total PASS: $TOTAL_PASS                          ║"
echo "║  Total FAIL: $TOTAL_FAIL                          ║"
echo "║  Generated: $TOTAL_GENERATED ข้อใหม่                    ║"
echo "╚════════════════════════════════════════════╝"
