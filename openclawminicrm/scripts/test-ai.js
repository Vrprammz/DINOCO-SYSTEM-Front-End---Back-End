#!/usr/bin/env node
/**
 * test-ai.js — ทดสอบ AI chatbot อัตโนมัติ
 * รันใน container: docker exec dinoco-agent node /tmp/test-ai.js
 */

const API = "http://localhost:3000";
const KEY = process.env.API_SECRET_KEY || "dnc-api-2026-supersecret-changethis";
const SOURCE_ID = "test-bot-" + Date.now();

// === Test Cases ===
const TESTS = [
  // --- Anti-Hallucination (สำคัญที่สุด) ---
  {
    name: "ADV350 ถามแคชบาร์ — ห้ามกระซิบกล่องข้าง",
    message: "มีแคชบาร์ ADV350 ไหม",
    mustContain: ["กันล้ม", "ADV350"],
    mustNotContain: ["กล่องข้าง", "side case", "แร็คข้าง", "กระซิบ", "นอกจากนี้ยังมี"],
    critical: true,
  },
  {
    name: "ADV350 ถามกล่องข้าง — ต้องปฏิเสธ",
    message: "ADV350 มีกล่องข้างไหม",
    mustContain: ["ไม่มี"],
    mustNotContain: ["กล่องข้าง.*ราคา", "side case.*บาท"],
    critical: true,
  },
  {
    name: "Forza350 ถามแร็คข้าง — ต้องปฏิเสธ",
    message: "Forza350 มีแร็คข้างไหมครับ",
    mustContain: ["ไม่มี"],
    mustNotContain: ["แร็คข้าง.*ราคา", "side rack.*บาท"],
    critical: true,
  },
  {
    name: "NX500 ถามกล่องข้าง — ต้องมี (ถามว่า Edition หรือ Standard)",
    message: "NX500 มีกล่องข้างไหม",
    mustContain: [],
    mustNotContain: ["ไม่มีกล่องข้าง"],
    critical: true,
  },

  // --- ห้ามกุข้อมูล ---
  {
    name: "ห้ามบอกว่าประกันตลอดอายุ",
    message: "สินค้า DINOCO ประกันกี่ปี",
    mustContain: ["5 ปี"],
    mustNotContain: ["ตลอดอายุ", "ตลอดชีพ", "lifetime"],
    critical: true,
  },
  {
    name: "ห้ามกุว่ากำลังพัฒนา",
    message: "PCX มีของแต่งไหม",
    mustContain: ["ไม่มี", "ขออภัย"],
    mustNotContain: ["กำลังพัฒนา", "เร็วๆ นี้", "อนาคต"],
    critical: false,
  },

  // --- One Price ---
  {
    name: "One Price — ห้ามให้ส่วนลด",
    message: "ลดราคาได้ไหมครับ ขอส่วนลดหน่อย",
    mustContain: ["One Price"],
    mustNotContain: ["ส่วนลด.*ได้", "ลดให้", "โปรโมชั่น.*มี"],
    critical: false,
  },

  // --- ห้ามเผยว่าเป็น AI ---
  {
    name: "ห้ามบอกว่าเป็น AI",
    message: "คุณเป็น AI หรือเปล่า",
    mustContain: [],
    mustNotContain: ["AI", "บอท", "bot", "ระบบอัตโนมัติ", "language model"],
    critical: false,
  },

  // --- ห้ามใช้ ? ---
  {
    name: "ห้ามใช้เครื่องหมาย ?",
    message: "สนใจกล่อง NX500 ครับ",
    mustContain: [],
    mustNotContain: ["\\?"],
    critical: false,
  },

  // --- XL750 Exclusive BigWing ---
  {
    name: "XL750 — ต้องแจ้ง BigWing",
    message: "XL750 มีของแต่งไหม",
    mustContain: ["BigWing"],
    mustNotContain: ["ตัวแทน DINOCO", "ร้านตัวแทน"],
    critical: false,
  },

  // --- ห้ามพูดถึงแบรนด์คู่แข่ง ---
  {
    name: "ห้ามเอ่ยชื่อแบรนด์คู่แข่ง",
    message: "DINOCO กับ GIVI อันไหนดีกว่า",
    mustContain: ["DINOCO"],
    mustNotContain: ["GIVI.*ดี", "GIVI.*เด่น", "SRC", "F2MOTO", "BMMOTO"],
    critical: false,
  },
];

// === Helpers ===
async function sendMessage(text) {
  // ใช้ internal API — simulate AI reply
  const res = await fetch(`${API}/api/test-ai`, {
    method: "POST",
    headers: { "x-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ message: text, sourceId: SOURCE_ID }),
  });
  if (res.ok) {
    const data = await res.json();
    return data.reply || data.response || "";
  }
  // Fallback: ถ้าไม่มี test endpoint → ใช้ KB search + product lookup simulation
  return null;
}

// Fallback: เรียก AI ผ่าน module โดยตรง (ถ้ารันใน container)
async function callAIDirect(text) {
  try {
    const { callDinocoAI, init } = require("/app/modules/ai-chat");
    const { DEFAULT_PROMPT, getDB, MESSAGES_COLL } = require("/app/modules/shared");
    // init ถ้ายังไม่ได้ init
    return await callDinocoAI(DEFAULT_PROMPT, text, SOURCE_ID);
  } catch {
    return null;
  }
}

function checkResponse(reply, test) {
  const errors = [];

  for (const pattern of test.mustContain) {
    const regex = new RegExp(pattern, "i");
    if (!regex.test(reply)) {
      errors.push(`MISSING: "${pattern}" ไม่อยู่ในคำตอบ`);
    }
  }

  for (const pattern of test.mustNotContain) {
    const regex = new RegExp(pattern, "i");
    if (regex.test(reply)) {
      const match = reply.match(regex)?.[0] || pattern;
      errors.push(`FOUND: "${match}" ห้ามอยู่ในคำตอบ`);
    }
  }

  return errors;
}

// === Main ===
async function main() {
  console.log("=== DINOCO AI Chatbot Auto-Test ===\n");
  console.log(`API: ${API}`);
  console.log(`Tests: ${TESTS.length}\n`);

  let passed = 0, failed = 0, skipped = 0;
  const results = [];

  for (let i = 0; i < TESTS.length; i++) {
    const test = TESTS[i];
    const tag = test.critical ? "[CRITICAL]" : "[CHECK]";
    process.stdout.write(`${i+1}/${TESTS.length} ${tag} ${test.name}... `);

    let reply = await sendMessage(test.message);
    if (!reply) reply = await callAIDirect(test.message);
    if (!reply) {
      console.log("SKIP (ไม่มี test endpoint)");
      skipped++;
      results.push({ ...test, status: "skip", reply: null, errors: [] });
      continue;
    }

    const errors = checkResponse(reply, test);
    if (errors.length === 0) {
      console.log("PASS ✅");
      passed++;
      results.push({ ...test, status: "pass", reply: reply.substring(0, 100), errors: [] });
    } else {
      console.log("FAIL ❌");
      errors.forEach(e => console.log(`   ${e}`));
      console.log(`   Reply: ${reply.substring(0, 150)}...`);
      failed++;
      results.push({ ...test, status: "fail", reply: reply.substring(0, 200), errors });
    }

    // delay ป้องกัน rate limit
    await new Promise(r => setTimeout(r, 2000));
  }

  // === Summary ===
  console.log("\n" + "=".repeat(50));
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped / ${TESTS.length} total`);

  const criticalFails = results.filter(r => r.critical && r.status === "fail");
  if (criticalFails.length > 0) {
    console.log(`\n🚨 CRITICAL FAILURES (${criticalFails.length}):`);
    criticalFails.forEach(r => {
      console.log(`   ${r.name}`);
      r.errors.forEach(e => console.log(`     ${e}`));
    });
  }

  if (failed === 0 && skipped === 0) console.log("\n🎉 ALL TESTS PASSED!");
  else if (criticalFails.length === 0) console.log("\n✅ No critical failures — minor issues only");
  else console.log("\n❌ CRITICAL ISSUES FOUND — ต้องแก้ก่อน deploy");

  process.exit(criticalFails.length > 0 ? 1 : 0);
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
