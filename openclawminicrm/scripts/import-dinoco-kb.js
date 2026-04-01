/**
 * Import DINOCO AI Logic CSV → MongoDB knowledge_base collection
 *
 * Usage: node scripts/import-dinoco-kb.js
 * Requires: MONGODB_URI in .env or as argument
 */

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

// CSV path
const CSV_PATH = path.resolve(__dirname, "../../dinoco_ai_logic_backup (2).csv");

// MongoDB
const MONGO_URI = process.env.MONGODB_URI || "mongodb://dinoco:Dnc2026Secure@localhost:27017/dinoco?authSource=admin";
const DB_NAME = process.env.MONGODB_DB || "dinoco";
const KB_COLL = "knowledge_base";

// Parse CSV (handle quoted fields with commas/newlines)
function parseCSV(text) {
  const rows = [];
  let current = "";
  let inQuotes = false;
  let row = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if (ch === "\n" && !inQuotes) {
      row.push(current.trim());
      if (row.length >= 3) rows.push(row);
      row = [];
      current = "";
    } else {
      current += ch;
    }
  }
  if (current || row.length) {
    row.push(current.trim());
    if (row.length >= 3) rows.push(row);
  }
  return rows;
}

// Categorize from content
function detectCategory(phrases, facts) {
  const text = (phrases + " " + facts).toLowerCase();
  if (/เคลม|ประกัน|warranty|claim|ซ่อม|ชำรุด|ลอก|แตก|พัง/.test(text)) return "warranty";
  if (/ราคา|ซื้อ|สั่ง|จ่าย|โอน|ผ่อน|price|ส่วนลด/.test(text)) return "pricing";
  if (/ตัวแทน|ร้าน|dealer|ตัวแทนจำหน่าย|ติดตั้ง/.test(text)) return "dealer";
  if (/กล่อง|แคชบาร์|แร็ค|ถาดรอง|การ์ดแฮนด์|สินค้า|รุ่น|ขนาด/.test(text)) return "product";
  if (/จัดส่ง|ขนส่ง|Flash|shipping|tracking|พัสดุ/.test(text)) return "shipping";
  if (/นโยบาย|บริษัท|DINOCO|โรงงาน|one price/.test(text)) return "policy";
  return "general";
}

// Extract tags from training_phrases
function extractTags(phrases) {
  const keywords = phrases.split(/\s+/).filter(w => w.length > 2);
  // Dedupe + limit 10
  return [...new Set(keywords)].slice(0, 10);
}

async function main() {
  console.log("Reading CSV...");
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parseCSV(raw);

  // Skip header
  const header = rows[0];
  console.log("Header:", header);
  const data = rows.slice(1);
  console.log(`Found ${data.length} KB entries`);

  console.log("Connecting to MongoDB...");
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(DB_NAME);
  const coll = db.collection(KB_COLL);

  // Check existing count
  const existingCount = await coll.countDocuments();
  console.log(`Existing KB entries: ${existingCount}`);

  let imported = 0;
  let skipped = 0;

  for (const [phrases, facts, action] of data) {
    if (!phrases || !facts) { skipped++; continue; }

    // Create title from first phrase
    const firstPhrase = phrases.split(/[,\s]+/).slice(0, 3).join(" ").substring(0, 80);
    const title = firstPhrase || "ความรู้ DINOCO";

    // Combine facts + action as content
    const content = `${facts}\n\n---\nวิธีตอบลูกค้า:\n${action}`;

    const category = detectCategory(phrases, facts);
    const tags = extractTags(phrases);

    // Check duplicate by title similarity
    const existing = await coll.findOne({ title: { $regex: firstPhrase.substring(0, 20), $options: "i" } });
    if (existing) { skipped++; continue; }

    await coll.insertOne({
      title,
      content,
      category,
      tags,
      trainingPhrases: phrases, // เก็บ original phrases สำหรับ search
      active: true,
      source: "csv_import",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    imported++;
  }

  console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped} (duplicate/empty)`);
  console.log(`Total KB entries now: ${await coll.countDocuments()}`);

  await client.close();
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
