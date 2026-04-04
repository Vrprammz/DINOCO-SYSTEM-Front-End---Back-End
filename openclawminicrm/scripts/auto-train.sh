#!/bin/bash
# auto-train.sh V3 — DINOCO AI Chatbot Self-Improving Loop
# Usage: bash scripts/auto-train.sh [--rounds 10] [--gen 50]
set -euo pipefail
cd /opt/dinoco/openclawminicrm

ROUNDS=10
GEN_COUNT=50
MAX_RETRY=2
AGENT=$(docker ps --format '{{.Names}}' | grep -i agent)
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_GENERATED=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --rounds) ROUNDS=$2; shift 2;;
    --gen) GEN_COUNT=$2; shift 2;;
    *) shift;;
  esac
done

echo "╔════════════════════════════════════════════╗"
echo "║  DINOCO Auto-Train v3.0                    ║"
echo "║  Rounds: $ROUNDS | Gen: $GEN_COUNT | MaxRetry: $MAX_RETRY  ║"
echo "╚════════════════════════════════════════════╝"

for ROUND in $(seq 1 $ROUNDS); do
  TESTS=$(tail -n +2 scripts/test-cases.csv | grep -c "." || echo 0)

  # ═══ ไม่มี test → Gemini สร้างใหม่ ═══
  if [ "$TESTS" -eq 0 ]; then
    echo ""
    echo "═══ Round $ROUND: ไม่มี test → สร้างคำถามใหม่ $GEN_COUNT ข้อ ═══"

    docker exec $AGENT node -e "
async function gen() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) { console.log('GENERATED:0'); return; }
  const prompt = 'คุณคือผู้เชี่ยวชาญทดสอบ AI chatbot DINOCO THAILAND (อะไหล่มอเตอร์ไซค์พรีเมียม)\nสินค้า: กล่องอลูมิเนียม IP67 กันล้ม แร็ค ถาดรอง การ์ดแฮนด์ กระเป๋า\nรุ่นรถ: ADV350 Forza350(2024+) NX500 CB500X XL750(BigWing) Versys650(การ์ดแฮนด์)\n\nสร้าง ${GEN_COUNT} คำถามจำลองลูกค้าจริง ภาษาไทย หลากหลาย:\n- ถามราคา/สเปค/เทียบรุ่น\n- เคลม/ซ่อม/ประกัน\n- ตัวแทน/จังหวัด/สั่งซื้อ\n- สแลง/อารมณ์/หลอก/injection\n- ติดตั้ง/ดูแล/ใช้งานจริง\n\nFormat CSV (ไม่ต้อง header ไม่ต้อง code block):\n\"message\",\"mustContain\",\"mustNotContain\",\"critical\",\"name\"\n\nmustContain ใช้ | เป็น OR / mustNotContain เว้นว่าง \"\" / name ใช้ GEN1-GEN${GEN_COUNT}';
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key='+apiKey, {
      method:'POST', headers:{'Content-Type':'application/json'},
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.7,maxOutputTokens:8000}}),
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const lines = text.split('\n').filter(l => l.trim().startsWith('\"') && l.includes(',') && !l.includes('message,mustContain'));
    console.log('GENERATED:' + lines.length);
    lines.forEach(l => console.log(l));
  } catch(e) { console.log('GENERATED:0 ERR:' + e.message); }
}
gen();
" 2>/dev/null > /tmp/gen-output.txt

    GEN_LINES=$(grep "^GENERATED:" /tmp/gen-output.txt | head -1 | cut -d: -f2 | tr -d ' ')
    if [ "${GEN_LINES:-0}" -gt 0 ] 2>/dev/null; then
      grep "^\"" /tmp/gen-output.txt >> scripts/test-cases.csv
      TOTAL_GENERATED=$((TOTAL_GENERATED + GEN_LINES))
      echo "✅ สร้าง $GEN_LINES ข้อใหม่ (รวม $TOTAL_GENERATED)"
    else
      echo "⚠️ Gemini สร้างไม่ได้ ข้ามรอบ"
      cat /tmp/gen-output.txt 2>/dev/null | head -5
    fi
    continue
  fi

  # ═══ มี test → รัน ═══
  echo ""
  echo "═══ Round $ROUND/$ROUNDS: Testing $TESTS ข้อ ═══"

  docker cp scripts/test-ai.js $AGENT:/tmp/test-ai.js
  docker cp scripts/test-cases.csv $AGENT:/tmp/test-cases.csv
  docker exec $AGENT node /tmp/test-ai.js 2>/dev/null > /tmp/test-result.txt || true

  # Parse results — tr -d ลบ newline/space ที่ติดมา
  PASS=$(grep -c "\.\.\. PASS" /tmp/test-result.txt 2>/dev/null || echo "0")
  FAIL=$(grep -c "\.\.\. FAIL" /tmp/test-result.txt 2>/dev/null || echo "0")
  PASS=$(echo "$PASS" | tr -d '[:space:]')
  FAIL=$(echo "$FAIL" | tr -d '[:space:]')
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

  # ═══ ลบ PASS เก็บ FAIL ═══
  echo "🗑️ ลบ $PASS PASS เก็บ $FAIL FAIL"

  # ดึงชื่อ FAIL จาก test result
  grep "\.\.\. FAIL" /tmp/test-result.txt | sed 's/.*\] //' | cut -d: -f1 | sed 's/ *$//' > /tmp/fail-names.txt

  FAIL_ACTUAL=$(wc -l < /tmp/fail-names.txt | tr -d ' ')
  echo "   FAIL names: $FAIL_ACTUAL"

  # เก็บเฉพาะ FAIL
  python3 << 'PYEOF'
import csv
fails = set()
with open('/tmp/fail-names.txt') as f:
    for line in f:
        n = line.strip()
        if n:
            fails.add(n)

rows = []
with open('scripts/test-cases.csv', 'r') as f:
    reader = csv.reader(f)
    header = next(reader)
    rows.append(header)
    for row in reader:
        if len(row) < 5: continue
        prefix = row[4].split(':')[0].strip()
        if prefix in fails:
            rows.append(row)

with open('scripts/test-cases.csv', 'w', newline='') as f:
    writer = csv.writer(f, quoting=csv.QUOTE_ALL)
    for row in rows:
        writer.writerow(row)
print(f"   เหลือ {len(rows)-1} ข้อ FAIL")
PYEOF

  # แสดง FAIL
  echo "❌ FAIL:"
  grep "\.\.\. FAIL" /tmp/test-result.txt | head -10
  echo ""

  sleep 3
done

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║  Auto-Train V3 สรุปผล                          ║"
echo "║  Total PASS: $TOTAL_PASS                              ║"
echo "║  Total FAIL: $TOTAL_FAIL                              ║"
echo "║  Generated:  $TOTAL_GENERATED ข้อใหม่                       ║"
echo "╚════════════════════════════════════════════════╝"
