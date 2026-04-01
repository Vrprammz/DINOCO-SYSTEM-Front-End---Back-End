#!/usr/bin/env node
/**
 * test-ai.js — ทดสอบ AI chatbot อัตโนมัติ (V.2 — อ่าน test cases จาก CSV)
 *
 * Usage:
 *   docker cp scripts/test-ai.js smltrack-agent:/tmp/test-ai.js
 *   docker cp scripts/test-cases.csv smltrack-agent:/tmp/test-cases.csv
 *   docker exec smltrack-agent node /tmp/test-ai.js
 *
 *   Options:
 *     --critical-only    รันเฉพาะ critical tests
 *     --quick            รันแค่ 20 ข้อแรก (quick smoke test)
 *     --delay=5000       เปลี่ยน delay ระหว่าง test (ms)
 */

const fs = require("fs");
const path = require("path");

const API = "http://localhost:3000";
const KEY = process.env.API_SECRET_KEY || "dnc-api-2026-supersecret-changethis";
const SOURCE_ID = "test-bot-" + Date.now();

// === Parse args ===
const args = process.argv.slice(2);
const criticalOnly = args.includes("--critical-only");
const quickMode = args.includes("--quick");
const delayArg = args.find(a => a.startsWith("--delay="));
const DELAY = delayArg ? parseInt(delayArg.split("=")[1]) : 2000;

// === Load test cases from CSV ===
// CSV format: mustContain ใช้ ";" เป็น AND, "|" เป็น OR ภายในแต่ละ group
// เช่น "กันล้ม|แคชบาร์;ADV" = (กันล้ม OR แคชบาร์) AND (ADV)
function loadTestCases() {
  const csvPaths = [
    "/tmp/test-cases.csv",
    path.resolve(__dirname, "test-cases.csv"),
  ];
  let csvText = null;
  for (const p of csvPaths) {
    if (fs.existsSync(p)) { csvText = fs.readFileSync(p, "utf-8"); break; }
  }
  if (!csvText) { console.error("ไม่พบ test-cases.csv"); process.exit(1); }

  const lines = csvText.split("\n").filter(l => l.trim());
  const tests = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const fields = [];
    let cur = "", inQ = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"' && (j === 0 || line[j-1] !== '\\')) { inQ = !inQ; }
      else if (ch === "," && !inQ) { fields.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    fields.push(cur.trim());

    if (fields.length >= 5) {
      // mustContain: ";" = AND groups, "|" = OR within group
      // mustNotContain: "|" = each is checked independently
      tests.push({
        message: fields[0],
        mustContain: fields[1] ? fields[1].split(";").filter(Boolean) : [],
        mustNotContain: fields[2] ? fields[2].split(";").filter(Boolean) : [],
        critical: fields[3] === "true",
        name: fields[4],
      });
    }
  }
  return tests;
}

// === API call ===
async function sendMessage(text) {
  try {
    const res = await fetch(`${API}/api/test-ai`, {
      method: "POST",
      headers: { "x-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sourceId: SOURCE_ID }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return `[ERROR ${res.status}]`;
    const data = await res.json();
    return data.reply || "";
  } catch (e) {
    return `[ERROR: ${e.message}]`;
  }
}

// === Check response ===
// mustContain: ";" = AND groups, "|" = OR within group
// เช่น "กันล้ม|แคชบาร์;ADV" = (กันล้ม OR แคชบาร์) AND (ADV)
// mustNotContain: ";" = separate checks, "|" = regex OR
function checkResponse(reply, test) {
  const errors = [];
  for (const group of test.mustContain) {
    const orPatterns = group.split("|").filter(Boolean);
    const anyMatch = orPatterns.some(sp => {
      try { return new RegExp(sp, "i").test(reply); } catch { return reply.toLowerCase().includes(sp.toLowerCase()); }
    });
    if (!anyMatch) {
      errors.push(`MISSING: "${group}" ไม่อยู่ในคำตอบ`);
    }
  }
  for (const pattern of test.mustNotContain) {
    try {
      const regex = new RegExp(pattern, "i");
      if (regex.test(reply)) {
        const match = reply.match(regex)?.[0] || pattern;
        errors.push(`FOUND: "${match}" ห้ามอยู่ในคำตอบ`);
      }
    } catch {}
  }
  return errors;
}

// === Main ===
async function main() {
  let allTests = loadTestCases();
  if (criticalOnly) allTests = allTests.filter(t => t.critical);
  if (quickMode) allTests = allTests.slice(0, 20);

  console.log("=== DINOCO AI Chatbot Auto-Test V.2 ===\n");
  console.log(`API: ${API}`);
  console.log(`Tests: ${allTests.length}${criticalOnly ? " (critical only)" : ""}${quickMode ? " (quick mode)" : ""}`);
  console.log(`Delay: ${DELAY}ms between tests\n`);

  let passed = 0, failed = 0, errors_list = [];
  const startTime = Date.now();

  for (let i = 0; i < allTests.length; i++) {
    const test = allTests[i];
    const tag = test.critical ? "[CRITICAL]" : "[CHECK]";
    const num = `${String(i+1).padStart(3)}/${allTests.length}`;
    process.stdout.write(`${num} ${tag} ${test.name}... `);

    const reply = await sendMessage(test.message);

    if (reply.startsWith("[ERROR")) {
      console.log(`ERROR: ${reply}`);
      failed++;
      errors_list.push({ ...test, status: "error", reply, errors: [reply] });
    } else {
      const errs = checkResponse(reply, test);
      if (errs.length === 0) {
        console.log("PASS");
        passed++;
      } else {
        console.log("FAIL");
        errs.forEach(e => console.log(`     ${e}`));
        console.log(`     Reply: ${reply.substring(0, 120)}...`);
        failed++;
        errors_list.push({ ...test, status: "fail", reply: reply.substring(0, 200), errors: errs });
      }
    }

    if (i < allTests.length - 1) await new Promise(r => setTimeout(r, DELAY));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // === Summary ===
  console.log("\n" + "=".repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed / ${allTests.length} total (${elapsed}s)`);

  const criticalFails = errors_list.filter(r => r.critical);
  const checkFails = errors_list.filter(r => !r.critical);

  if (criticalFails.length > 0) {
    console.log(`\n CRITICAL FAILURES (${criticalFails.length}):`);
    criticalFails.forEach(r => {
      console.log(`   ${r.name}`);
      r.errors.forEach(e => console.log(`     ${e}`));
    });
  }

  if (checkFails.length > 0) {
    console.log(`\n MINOR FAILURES (${checkFails.length}):`);
    checkFails.forEach(r => {
      console.log(`   ${r.name}`);
    });
  }

  if (failed === 0) console.log("\n ALL TESTS PASSED!");
  else if (criticalFails.length === 0) console.log(`\n No critical failures — ${checkFails.length} minor issues`);
  else console.log(`\n ${criticalFails.length} CRITICAL + ${checkFails.length} minor issues`);

  // === Score ===
  const score = Math.round((passed / allTests.length) * 100);
  const bar = "#".repeat(Math.round(score / 2)) + "-".repeat(50 - Math.round(score / 2));
  console.log(`\n Score: ${score}% [${bar}]`);

  process.exit(criticalFails.length > 0 ? 1 : 0);
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
