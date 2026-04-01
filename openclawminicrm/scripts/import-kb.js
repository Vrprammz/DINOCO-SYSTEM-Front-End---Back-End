#!/usr/bin/env node
/**
 * import-kb.js — Import KB CSV เข้า MongoDB ผ่าน OpenClaw API
 *
 * Usage:
 *   node import-kb.js                          # dry-run (แสดงจำนวน แต่ไม่ import)
 *   node import-kb.js --run                    # ลบ KB เก่า + import ใหม่ทั้งหมด
 *   node import-kb.js --run --keep-old         # เพิ่มเข้าไป ไม่ลบเก่า
 *   node import-kb.js --run --api-url=https://ai.dinoco.in.th  # ใช้ production
 *
 * ต้องตั้ง API_SECRET_KEY ให้ตรงกับ .env ของ server
 */

const fs = require("fs");
const path = require("path");

// === Config ===
const CSV_PATH = path.resolve(__dirname, "../../dinoco_ai_logic_backup (2).csv");
const DEFAULT_API_URL = "https://ai.dinoco.in.th"; // production
const API_SECRET = process.env.API_SECRET_KEY || process.env.OPENCLAW_API_KEY || "";

// === Parse args ===
const args = process.argv.slice(2);
const isDryRun = !args.includes("--run");
const keepOld = args.includes("--keep-old");
const apiUrlArg = args.find(a => a.startsWith("--api-url="));
const API_URL = apiUrlArg ? apiUrlArg.split("=")[1] : DEFAULT_API_URL;

// === Parse CSV (simple — no external deps) ===
function parseCSV(csvText) {
  const lines = csvText.split("\n").filter(l => l.trim());
  const entries = [];

  for (let i = 1; i < lines.length; i++) { // skip header
    const line = lines[i];
    // Parse CSV with quoted fields
    const fields = [];
    let current = "";
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"' && (j === 0 || line[j-1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    if (fields.length >= 3) {
      const [training_phrases, core_facts, ai_action] = fields;
      if (training_phrases && core_facts) {
        // สร้าง question จาก training phrases (เอาคำแรกๆ)
        const phrases = training_phrases.split(/[,\s]+/).filter(Boolean);
        const question = phrases.slice(0, 5).join(" ").substring(0, 100);

        // แยก tags จาก training phrases
        const tags = training_phrases
          .split(/[\s,]+/)
          .filter(t => t.length >= 3 && t.length <= 30)
          .slice(0, 15)
          .map(t => `#${t}`);

        // กำหนด category
        let category = "ทั่วไป";
        if (/ราคา|one price|ลด|โปร/i.test(training_phrases)) category = "สินค้า";
        else if (/เคลม|ซ่อม|ประกัน|warranty/i.test(training_phrases)) category = "สินค้า";
        else if (/ตัวแทน|ร้าน|จังหวัด|dealer/i.test(training_phrases)) category = "ทั่วไป";
        else if (/กล่อง|กันล้ม|แร็ค|crash|rack|case|bag/i.test(training_phrases)) category = "สินค้า";
        else if (/adv|forza|nx|cb500|xl750|transalp/i.test(training_phrases)) category = "สินค้า";

        // API ต้องการ: { title, content, category, tags }
        const factsClean = core_facts.replace(/\s*\/\s*/g, "\n").trim();
        const actionClean = ai_action.replace(/\s*\/\s*/g, "\n").trim();
        const fullContent = `${factsClean}\n\n---\nวิธีตอบ:\n${actionClean}`;

        entries.push({
          title: question,
          content: fullContent,
          category,
          tags: tags.join(","),
        });
      }
    }
  }
  return entries;
}

// === API helpers ===
async function apiCall(method, endpoint, body = null) {
  const headers = { "Content-Type": "application/json" };
  if (API_SECRET) headers["x-api-key"] = API_SECRET;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_URL}${endpoint}`, opts);
  if (!res.ok) throw new Error(`API ${method} ${endpoint} → ${res.status} ${res.statusText}`);
  return res.json();
}

async function getExistingKB() {
  return apiCall("GET", "/api/km");
}

async function deleteKBEntry(id) {
  return apiCall("DELETE", `/api/km/${id}`);
}

async function createKBEntry(entry) {
  return apiCall("POST", "/api/km", entry);
}

// === Main ===
async function main() {
  console.log("=== DINOCO KB Import Tool ===\n");
  console.log(`API URL:    ${API_URL}`);
  console.log(`API Key:    ${API_SECRET ? API_SECRET.substring(0, 8) + "..." : "(ไม่ได้ตั้ง — ใช้ env API_SECRET_KEY)"}`);
  console.log(`CSV:        ${CSV_PATH}`);
  console.log(`Mode:       ${isDryRun ? "🔍 DRY RUN (ไม่ import จริง)" : keepOld ? "📥 IMPORT (เพิ่มเข้าไป ไม่ลบเก่า)" : "🔄 REPLACE (ลบเก่า + import ใหม่)"}`);
  console.log();

  // อ่าน CSV
  if (!fs.existsSync(CSV_PATH)) { console.error(`❌ ไม่พบไฟล์ CSV: ${CSV_PATH}`); process.exit(1); }
  const csvText = fs.readFileSync(CSV_PATH, "utf-8");
  const entries = parseCSV(csvText);
  console.log(`📄 อ่าน CSV ได้ ${entries.length} entries\n`);

  if (isDryRun) {
    console.log("ตัวอย่าง 3 entries แรก:");
    entries.slice(0, 3).forEach((e, i) => {
      console.log(`  ${i+1}. [${e.category}] ${e.question}`);
      console.log(`     Facts: ${e.facts.substring(0, 80)}...`);
      console.log(`     Tags: ${e.tags.slice(0, 5).join(", ")}`);
    });
    console.log(`\n⚠️  เพิ่ม --run เพื่อ import จริง`);
    console.log(`    ตัวอย่าง: API_SECRET_KEY=xxx node import-kb.js --run`);
    return;
  }

  if (!API_SECRET) {
    console.error("❌ ต้องตั้ง API_SECRET_KEY environment variable");
    console.error("   ตัวอย่าง: API_SECRET_KEY=your-secret node import-kb.js --run");
    process.exit(1);
  }

  // ลบ KB เก่า (ถ้าไม่ keep)
  if (!keepOld) {
    console.log("🗑️  กำลังลบ KB เก่า...");
    try {
      const existing = await getExistingKB();
      console.log(`   พบ ${existing.length} entries เดิม`);
      let deleted = 0;
      for (const entry of existing) {
        try {
          await deleteKBEntry(entry._id);
          deleted++;
          if (deleted % 10 === 0) process.stdout.write(`   ลบแล้ว ${deleted}/${existing.length}\r`);
        } catch (e) {
          console.warn(`   ⚠️ ลบ ${entry._id} ไม่ได้: ${e.message}`);
        }
      }
      console.log(`   ✅ ลบแล้ว ${deleted}/${existing.length} entries`);
    } catch (e) {
      console.error(`   ❌ ดึง KB เก่าไม่ได้: ${e.message}`);
      console.error("   ตรวจสอบ API_SECRET_KEY และ API URL");
      process.exit(1);
    }
  }

  // Import ใหม่
  console.log(`\n📥 กำลัง import ${entries.length} entries...`);
  let success = 0, failed = 0;
  for (let i = 0; i < entries.length; i++) {
    try {
      await createKBEntry(entries[i]);
      success++;
      if (success % 10 === 0) process.stdout.write(`   imported ${success}/${entries.length}\r`);
    } catch (e) {
      failed++;
      console.warn(`   ⚠️ Entry ${i+1} ไม่ได้: ${e.message}`);
    }
  }

  console.log(`\n\n✅ สำเร็จ! imported ${success} entries, failed ${failed}`);
  console.log(`🔗 เช็คได้ที่: ${API_URL}/dashboard/km`);
}

main().catch(e => { console.error("❌ Error:", e.message); process.exit(1); });
