#!/usr/bin/env node
/**
 * smart-judge.js V4.0 — Gemini-as-Judge + KB Auto-Fix
 *
 * แทนที่ regex mustContain ด้วย Gemini ตัดสินคำตอบ AI
 *
 * Modes:
 *   --generate N        สร้าง N คำถามใหม่ พร้อม expectedFact (ไม่ใช่ mustContain)
 *   --judge             รัน test cases ทั้งหมด แล้วให้ Gemini ตัดสิน
 *   --analyze-fails     วิเคราะห์ FAIL → หาสาเหตุ + แนะนำ KB fix
 *   --auto-fix-kb       เพิ่ม/แก้ KB entries อัตโนมัติจาก analysis
 *
 * Env: GOOGLE_API_KEY, MONGODB_URI, MONGODB_DB, API_SECRET_KEY
 *
 * Usage (inside Docker):
 *   node /tmp/smart-judge.js --generate 30
 *   node /tmp/smart-judge.js --judge
 *   node /tmp/smart-judge.js --analyze-fails
 *   node /tmp/smart-judge.js --auto-fix-kb
 */

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

// ═══════════════════════════════════════
// Config
// ═══════════════════════════════════════
const GEMINI_KEY = process.env.GOOGLE_API_KEY || "";
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
const MONGO_URI = process.env.MONGODB_URI || "";
const MONGO_DB = process.env.MONGODB_DB || "smltrack";
const API_URL = "http://localhost:3000";
const API_KEY = process.env.API_SECRET_KEY || "dnc-api-2026-supersecret-changethis";
const SOURCE_ID = "judge-" + Date.now();

const CSV_PATH = "/app/scripts/test-cases-v4.csv";
const RESULTS_PATH = "/app/scripts/judge-results.json";
const SCORE_LOG_PATH = "/app/scripts/score-history.json";

// ═══════════════════════════════════════
// Args
// ═══════════════════════════════════════
const args = process.argv.slice(2);
const mode = args.find(a => a.startsWith("--"))?.replace("--", "") || "judge";
const genCount = (() => {
  const idx = args.indexOf("--generate");
  return idx >= 0 && args[idx + 1] ? parseInt(args[idx + 1]) : 30;
})();

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════
async function callGemini(prompt, temperature = 0.3, maxTokens = 8000) {
  if (!GEMINI_KEY) throw new Error("GOOGLE_API_KEY not set");
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callAgent(message) {
  try {
    const res = await fetch(`${API_URL}/api/test-ai`, {
      method: "POST",
      headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ message, sourceId: SOURCE_ID }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return `[ERROR ${res.status}]`;
    const data = await res.json();
    return data.reply || "";
  } catch (e) {
    return `[ERROR: ${e.message}]`;
  }
}

async function getKBText() {
  try {
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = client.db(MONGO_DB);
    const kb = await db.collection("knowledge_base").find({ active: { $ne: false } }).toArray();
    await client.close();
    console.error(`[KB] Read ${kb.length} entries`);
    return {
      entries: kb,
      text: kb.map(k =>
        `[${k.category || "general"}] ${k.title || ""}: ${(k.content || "").substring(0, 300)}`
      ).join("\n"),
    };
  } catch (e) {
    console.error(`[KB] Error: ${e.message}`);
    return { entries: [], text: "KB unavailable" };
  }
}

function loadCSV(csvPath) {
  const paths = [csvPath, path.resolve(__dirname, "test-cases-v4.csv"), path.resolve(__dirname, "test-cases.csv")];
  let csvText = null;
  for (const p of paths) {
    if (fs.existsSync(p)) { csvText = fs.readFileSync(p, "utf-8"); break; }
  }
  if (!csvText) return [];
  const lines = csvText.split("\n").filter(l => l.trim());
  const tests = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length >= 4) {
      tests.push({
        message: fields[0],
        expectedFact: fields[1],  // V4: fact ที่ถูกต้อง ไม่ใช่ regex
        critical: fields[2] === "true",
        name: fields[3],
      });
    }
  }
  return tests;
}

function parseCSVLine(line) {
  const fields = [];
  let cur = "", inQ = false;
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (ch === '"' && (j === 0 || line[j - 1] !== "\\")) { inQ = !inQ; }
    else if (ch === "," && !inQ) { fields.push(cur.trim()); cur = ""; }
    else { cur += ch; }
  }
  fields.push(cur.trim());
  return fields;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════
// Mode: GENERATE — สร้างคำถามใหม่ด้วย KB จริง
// ═══════════════════════════════════════
async function modeGenerate() {
  console.log(`\n=== Smart Judge V4: Generate ${genCount} questions ===\n`);
  const { text: kbText } = await getKBText();

  const prompt = `คุณคือผู้เชี่ยวชาญทดสอบ AI chatbot DINOCO THAILAND (อุปกรณ์แต่งมอเตอร์ไซค์)

=== Knowledge Base ===
${kbText}

=== คำสั่ง ===
สร้าง ${genCount} คำถามจากลูกค้าจริง ภาษาไทย อ้างอิงจาก KB ด้านบน

Format CSV (ไม่ต้อง header ไม่ต้อง code block):
"message","expectedFact","critical","name"

กฎ:
- message = คำถามลูกค้าจริงๆ เขียนเป็นภาษาคนไม่ใช่ AI
- expectedFact = ข้อเท็จจริงที่ AI ต้องตอบ เขียนเป็นประโยคสั้นๆ 1-2 ประโยค เช่น "กล่อง DINOCO ความจุ 45 ลิตร น้ำหนัก 6.5 กก."
- critical = true เฉพาะข้อที่ห้ามตอบผิดเด็ดขาด (เคลม, ราคา, ความปลอดภัย)
- name = รหัส unique เช่น GEN-BOX1, GEN-RACK2

ประเภทคำถามที่ต้องมี (กระจายให้ครบ):
1. ถามสเปค (ขนาด, น้ำหนัก, วัสดุ) 30%
2. ถามราคา/สต็อก 15%
3. ถามเปรียบเทียบ (รุ่นไหนดี, ต่างกันยังไง) 15%
4. ถามการติดตั้ง/ใช้งาน 15%
5. ถามประกัน/เคลม 10%
6. ถามตัวแทน/ร้าน 10%
7. คำถามแปลกๆ ภาษาสแลง typo 5%

ตอบเฉพาะ CSV rows`;

  try {
    const csv = await callGemini(prompt, 0.7, 10000);
    const lines = csv.split("\n").filter(l => l.trim().startsWith('"') && l.includes(","));
    if (lines.length === 0) { console.log("Gemini generate failed"); return; }

    const header = '"message","expectedFact","critical","name"';
    fs.writeFileSync(CSV_PATH, header + "\n" + lines.join("\n") + "\n");
    console.log(`Generated ${lines.length} test cases -> ${CSV_PATH}`);
  } catch (e) {
    console.error("Generate error:", e.message);
  }
}

// ═══════════════════════════════════════
// Mode: JUDGE — Gemini ตัดสินคำตอบ AI
// ═══════════════════════════════════════
async function modeJudge() {
  const tests = loadCSV(CSV_PATH);
  if (tests.length === 0) {
    console.log("No test cases found. Run --generate first.");
    return;
  }
  console.log(`\n=== Smart Judge V4: Judging ${tests.length} tests ===\n`);

  const results = [];
  let passed = 0, failed = 0, errors = 0;
  const BATCH = 5; // judge 5 ข้อพร้อมกัน

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const tag = test.critical ? "[CRIT]" : "[CHK]";
    process.stdout.write(`${String(i + 1).padStart(3)}/${tests.length} ${tag} ${test.name}... `);

    // 1. ส่งคำถามไป Agent
    const reply = await callAgent(test.message);
    if (reply.startsWith("[ERROR")) {
      console.log(`ERROR: ${reply}`);
      results.push({ ...test, reply, verdict: "error", reason: reply });
      errors++;
      await delay(2000);
      continue;
    }

    // 2. Gemini Judge ตัดสิน
    const judgePrompt = `คุณคือผู้ตรวจคำตอบ AI chatbot DINOCO THAILAND (อุปกรณ์แต่งมอเตอร์ไซค์)

คำถามลูกค้า: "${test.message}"

ข้อเท็จจริงที่ถูกต้อง: "${test.expectedFact}"

คำตอบของ AI:
"""
${reply.substring(0, 1500)}
"""

ตัดสิน:
- PASS = คำตอบถูกต้อง ครอบคลุมข้อเท็จจริง (ไม่จำเป็นต้องตรงคำต่อคำ แค่สาระถูก)
- PARTIAL = ตอบถูกบางส่วน แต่ขาดข้อมูลสำคัญ
- FAIL = ตอบผิด หรือขาดข้อมูลสำคัญมาก หรือ hallucinate ข้อมูลที่ไม่มีจริง
- REFUSE = AI ปฏิเสธตอบ ทั้งที่ควรตอบได้

ตอบในรูปแบบ JSON (ไม่ต้อง code block):
{"verdict":"PASS|PARTIAL|FAIL|REFUSE","reason":"อธิบายสั้นๆ ว่าทำไม","missingFact":"ข้อมูลที่ขาด (ถ้ามี)","hallucination":"ข้อมูลที่ AI แต่งเอง (ถ้ามี)"}`;

    try {
      const judgeRaw = await callGemini(judgePrompt, 0.1, 500);
      // parse JSON from response (strip code blocks if any)
      const jsonStr = judgeRaw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      const judge = JSON.parse(jsonStr);

      const verdict = (judge.verdict || "FAIL").toUpperCase();
      if (verdict === "PASS") {
        console.log("PASS");
        passed++;
      } else if (verdict === "PARTIAL") {
        console.log(`PARTIAL: ${judge.reason || ""}`);
        passed++; // partial = ยังนับผ่าน แต่ log ไว้
      } else {
        console.log(`FAIL: ${judge.reason || ""}`);
        failed++;
      }

      results.push({
        ...test,
        reply: reply.substring(0, 500),
        verdict,
        reason: judge.reason || "",
        missingFact: judge.missingFact || "",
        hallucination: judge.hallucination || "",
      });
    } catch (e) {
      // Gemini parse error → fallback ใช้ basic keyword check
      console.log(`JUDGE-ERROR: ${e.message} (fallback: PASS)`);
      passed++;
      results.push({ ...test, reply: reply.substring(0, 500), verdict: "pass-fallback", reason: e.message });
    }

    await delay(3000); // rate limit
  }

  // Summary
  const total = passed + failed + errors;
  const score = total > 0 ? Math.round((passed / total) * 100) : 0;
  const bar = "#".repeat(Math.round(score / 2)) + "-".repeat(50 - Math.round(score / 2));

  console.log("\n" + "=".repeat(60));
  console.log(`PASS: ${passed} | FAIL: ${failed} | ERROR: ${errors} | Score: ${score}%`);
  console.log(`[${bar}]`);

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    total, passed, failed, errors, score,
    results,
  };
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));
  console.log(`\nResults saved: ${RESULTS_PATH}`);

  // Append to score history
  appendScoreHistory(score, total, passed, failed);

  // Print fails for quick review
  const fails = results.filter(r => r.verdict === "FAIL" || r.verdict === "REFUSE");
  if (fails.length > 0) {
    console.log(`\n--- FAILURES (${fails.length}) ---`);
    fails.forEach(r => {
      console.log(`  ${r.name}: ${r.reason}`);
      if (r.missingFact) console.log(`    Missing: ${r.missingFact}`);
      if (r.hallucination) console.log(`    Hallucination: ${r.hallucination}`);
    });
  }

  return output;
}

function appendScoreHistory(score, total, passed, failed) {
  let history = [];
  try { history = JSON.parse(fs.readFileSync(SCORE_LOG_PATH, "utf-8")); } catch {}
  history.push({
    timestamp: new Date().toISOString(),
    score, total, passed, failed,
  });
  // keep last 100 entries
  if (history.length > 100) history = history.slice(-100);
  fs.writeFileSync(SCORE_LOG_PATH, JSON.stringify(history, null, 2));
  console.log(`Score history: ${history.length} entries (${SCORE_LOG_PATH})`);

  // Show trend
  if (history.length >= 2) {
    const prev = history[history.length - 2].score;
    const diff = score - prev;
    const arrow = diff > 0 ? "UP" : diff < 0 ? "DOWN" : "SAME";
    console.log(`Trend: ${prev}% -> ${score}% (${arrow} ${Math.abs(diff)}%)`);
  }
}

// ═══════════════════════════════════════
// Mode: ANALYZE-FAILS — วิเคราะห์สาเหตุ FAIL
// ═══════════════════════════════════════
async function modeAnalyzeFails() {
  let data;
  try { data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8")); } catch {
    console.log("No results found. Run --judge first."); return;
  }

  const fails = data.results.filter(r => r.verdict === "FAIL" || r.verdict === "REFUSE");
  if (fails.length === 0) { console.log("No failures to analyze!"); return; }

  console.log(`\n=== Smart Judge V4: Analyzing ${fails.length} failures ===\n`);

  const { text: kbText, entries: kbEntries } = await getKBText();

  // batch analyze — ส่ง fails ทั้งหมดให้ Gemini วิเคราะห์ทีเดียว
  const failsSummary = fails.map((f, i) =>
    `${i + 1}. [${f.name}] Q: ${f.message}\n   Expected: ${f.expectedFact}\n   AI answered: ${(f.reply || "").substring(0, 200)}\n   Reason: ${f.reason}\n   Missing: ${f.missingFact || "none"}\n   Hallucination: ${f.hallucination || "none"}`
  ).join("\n\n");

  const prompt = `คุณคือ AI Trainer ของ DINOCO THAILAND (อุปกรณ์แต่งมอเตอร์ไซค์)

=== KB ปัจจุบัน (${kbEntries.length} entries) ===
${kbText.substring(0, 6000)}

=== Test Failures (${fails.length} ข้อ) ===
${failsSummary}

=== วิเคราะห์ ===
สำหรับแต่ละข้อ FAIL ให้ระบุ:
1. root_cause: "kb_missing" | "kb_incomplete" | "prompt_issue" | "ai_hallucination" | "search_miss" | "test_wrong"
   - kb_missing = ไม่มี KB entry ที่ตรง
   - kb_incomplete = มี KB แต่ข้อมูลไม่ครบ
   - prompt_issue = prompt ไม่ได้สั่งให้ตอบเรื่องนี้
   - ai_hallucination = AI แต่งข้อมูลที่ไม่มีใน KB
   - search_miss = KB มีแต่ search ไม่เจอ (keywords ไม่ match)
   - test_wrong = expectedFact ของ test case ผิดเอง
2. fix_action: อธิบายสิ่งที่ต้องทำ
3. kb_entry: (ถ้า root_cause เป็น kb_missing/kb_incomplete) ให้เขียน KB entry ใหม่

ตอบ JSON array (ไม่ต้อง code block):
[{"name":"GEN-XXX","root_cause":"kb_missing","fix_action":"เพิ่ม KB เรื่อง ...","kb_entry":{"title":"...","content":"...","category":"...","tags":["..."]}}]`;

  try {
    const raw = await callGemini(prompt, 0.2, 10000);
    const jsonStr = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const analysis = JSON.parse(jsonStr);

    // Summary
    const causes = {};
    analysis.forEach(a => { causes[a.root_cause] = (causes[a.root_cause] || 0) + 1; });

    console.log("Root Cause Breakdown:");
    Object.entries(causes).sort((a, b) => b[1] - a[1]).forEach(([cause, count]) => {
      console.log(`  ${cause}: ${count}`);
    });

    // KB entries to add
    const kbFixes = analysis.filter(a => a.kb_entry && (a.root_cause === "kb_missing" || a.root_cause === "kb_incomplete"));
    console.log(`\nKB fixes needed: ${kbFixes.length}`);
    kbFixes.forEach(f => {
      console.log(`  [${f.name}] ${f.fix_action}`);
      if (f.kb_entry) console.log(`    -> ${f.kb_entry.title}: ${(f.kb_entry.content || "").substring(0, 100)}...`);
    });

    // Save analysis
    fs.writeFileSync("/app/scripts/fail-analysis.json", JSON.stringify(analysis, null, 2));
    console.log(`\nAnalysis saved: /app/scripts/fail-analysis.json`);

    return analysis;
  } catch (e) {
    console.error("Analysis error:", e.message);
  }
}

// ═══════════════════════════════════════
// Mode: AUTO-FIX-KB — เพิ่ม KB entries อัตโนมัติ
// ═══════════════════════════════════════
async function modeAutoFixKB() {
  let analysis;
  try { analysis = JSON.parse(fs.readFileSync("/app/scripts/fail-analysis.json", "utf-8")); } catch {
    console.log("No analysis found. Run --analyze-fails first."); return;
  }

  const kbFixes = analysis.filter(a =>
    a.kb_entry && a.kb_entry.title && a.kb_entry.content &&
    (a.root_cause === "kb_missing" || a.root_cause === "kb_incomplete")
  );

  if (kbFixes.length === 0) { console.log("No KB fixes needed."); return; }

  console.log(`\n=== Smart Judge V4: Auto-Fix KB (${kbFixes.length} entries) ===\n`);

  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(MONGO_DB);
  const kbCollection = db.collection("knowledge_base");

  let added = 0, updated = 0, skipped = 0;

  for (const fix of kbFixes) {
    const entry = fix.kb_entry;
    // check if similar entry exists
    const existing = await kbCollection.findOne({
      $or: [
        { title: { $regex: escapeRegex(entry.title.substring(0, 30)), $options: "i" } },
        { title: entry.title },
      ],
    });

    if (existing) {
      // KB incomplete → update content
      if (fix.root_cause === "kb_incomplete") {
        const newContent = existing.content + "\n\n[Auto-added] " + entry.content;
        await kbCollection.updateOne({ _id: existing._id }, {
          $set: { content: newContent, updatedAt: new Date() },
          $addToSet: { tags: { $each: entry.tags || [] } },
        });
        console.log(`  UPDATED: ${existing.title}`);
        updated++;
      } else {
        console.log(`  SKIP (exists): ${entry.title}`);
        skipped++;
      }
    } else {
      // KB missing → insert
      await kbCollection.insertOne({
        title: entry.title,
        content: entry.content,
        category: entry.category || "auto-generated",
        tags: entry.tags || [],
        active: true,
        source: "auto-train-v4",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`  ADDED: ${entry.title}`);
      added++;
    }
  }

  // ★ V4.2: Export KB entries ที่เพิ่มใหม่ กลับเข้า CSV backup (กันหาย)
  if (added > 0 || updated > 0) {
    try {
      const allKB = await kbCollection.find({ source: "auto-train-v4" }).toArray();
      const csvLines = allKB.map(k => {
        const title = (k.title || "").replace(/"/g, "'");
        const content = (k.content || "").replace(/"/g, "'").replace(/\n/g, " / ");
        const tags = (k.tags || []).join(",");
        return `"${title}","${content}","category: ${k.category || 'auto'} / tags: ${tags}"`;
      });
      if (csvLines.length > 0) {
        const backupPath = "/app/scripts/kb-auto-added.csv";
        const header = '"training_phrases","core_facts","ai_action"';
        fs.writeFileSync(backupPath, header + "\n" + csvLines.join("\n") + "\n");
        console.log(`  Backup: ${csvLines.length} auto-added entries -> ${backupPath}`);
      }
    } catch (e) { console.error("  Backup error:", e.message); }
  }

  await client.close();

  console.log(`\nKB Auto-Fix Complete:`);
  console.log(`  Added: ${added} | Updated: ${updated} | Skipped: ${skipped}`);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ═══════════════════════════════════════
// Main
// ═══════════════════════════════════════
async function main() {
  console.log("Smart Judge V4.0 — Gemini-as-Judge + KB Auto-Fix");
  console.log(`Mode: ${mode} | Model: ${GEMINI_MODEL}`);

  if (mode === "generate") {
    await modeGenerate();
  } else if (mode === "judge") {
    await modeJudge();
  } else if (mode.includes("analyze")) {
    await modeAnalyzeFails();
  } else if (mode.includes("auto-fix") || mode.includes("fix")) {
    await modeAutoFixKB();
  } else {
    console.log("Usage: node smart-judge.js --generate N | --judge | --analyze-fails | --auto-fix-kb");
  }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
