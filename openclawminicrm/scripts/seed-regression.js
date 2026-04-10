#!/usr/bin/env node
/**
 * seed-regression.js V.1.0 — Seed initial regression scenarios
 *
 * Seeds 15 regression scenarios from Fix History (docs/chatbot-rules.md §11)
 * into the `regression_scenarios` MongoDB collection.
 *
 * Usage:
 *   node scripts/seed-regression.js          # upsert (update existing)
 *   node scripts/seed-regression.js --force  # drop + reinsert (danger)
 *
 * Env:
 *   MONGODB_URI, MONGODB_DB
 */

const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGODB_URI || "";
const MONGO_DB = process.env.MONGODB_DB || "smltrack";
const SCENARIOS_COLL = "regression_scenarios";

const force = process.argv.includes("--force");

// ═══════════════════════════════════════
// 15 Seed Scenarios (from chatbot-rules.md Fix History)
// ═══════════════════════════════════════
const now = new Date();

const SCENARIOS = [
  // REG-001: H2C ใน NX500 Edition
  {
    bug_id: "REG-001",
    title: "H2C ห้ามขึ้นใน DINOCO Edition NX500",
    category: "product_knowledge",
    severity: "critical",
    platform: "any",
    bug_context:
      "ลูกค้าถามตัวแต่งจากศูนย์ของ NX500 — AI ไม่ควรพูดชื่อแบรนด์คู่แข่ง 'H2C' เด็ดขาด ต้องตอบ DINOCO Edition + แนะนำ SKU DNCGND37LSPROS สีเงินเท่านั้น",
    fix_commit: "10c218c",
    fix_date: "2026-04-07",
    source: "fix_history",
    turns: [
      { role: "user", message: "nx500 กล่อง 3 ใบเท่าไหร่" },
      { role: "user", message: "ตัวแต่งจากศูนย์ครับ" },
    ],
    assertions: {
      forbidden_patterns: [
        { pattern: "H2C|h2c", flags: "i", reason: "ห้ามเอ่ยชื่อแบรนด์คู่แข่ง H2C" },
      ],
      required_patterns: [
        { pattern: "DINOCO Edition|DNCGND37LSPROS", flags: "i", reason: "ต้องพูดถึง DINOCO Edition หรือ SKU" },
      ],
      expect_behavior:
        "AI ต้องแนะนำ DINOCO Edition (SKU DNCGND37LSPROS สีเงินเท่านั้น) สำหรับ NX500 จากศูนย์ ห้ามเอ่ย H2C",
      must_not_do: [
        "ห้ามเอ่ยคำว่า H2C",
        "ห้ามเสนอสีดำ",
        "ห้ามพูดถึงมือจับ",
      ],
    },
  },

  // REG-002: วัสดุกันล้มต้องเป็นสแตนเลส (ไม่ใช่อลูมิเนียม 5052)
  {
    bug_id: "REG-002",
    title: "วัสดุกันล้มต้องเป็นสแตนเลส 304 ไม่รวมอลูมิเนียม",
    category: "product_knowledge",
    severity: "critical",
    platform: "any",
    bug_context:
      "AI เคยตอบวัสดุรวมกันมั่ว — ต้องแยกชัดเจน กันล้ม=สแตนเลส 304 / กล่อง=อลูมิเนียม 5052 / แร็ค=สแตนเลส 304",
    fix_commit: "a52d479",
    fix_date: "2026-04-07",
    source: "fix_history",
    turns: [{ role: "user", message: "กันล้ม ADV350 ทำจากวัสดุอะไรครับ" }],
    assertions: {
      forbidden_patterns: [
        {
          pattern: "กันล้ม.*(อลูมิเนียม|5052)|(อลูมิเนียม|5052).*กันล้ม",
          flags: "i",
          reason: "ห้ามบอกว่ากันล้มเป็นอลูมิเนียม",
        },
      ],
      required_patterns: [
        { pattern: "สแตนเลส|stainless", flags: "i", reason: "ต้องตอบว่าเป็นสแตนเลส" },
      ],
      expect_behavior: "AI ต้องตอบว่ากันล้ม DINOCO ทำจากสแตนเลส 304 (ห้ามบอกอลูมิเนียม 5052 ซึ่งเป็นของกล่อง)",
      must_not_do: ["ห้ามพูดว่ากันล้มทำจากอลูมิเนียม"],
    },
  },

  // REG-003: Side Rack ≠ มือจับ
  {
    bug_id: "REG-003",
    title: "Side Rack ไม่ใช่มือจับ",
    category: "product_knowledge",
    severity: "high",
    platform: "any",
    bug_context:
      "AI เคยอธิบาย Side Rack ว่าเป็นมือจับ — ต้องแยกชัด Side Rack = แร็คยึดกล่องข้าง ส่วนมือจับ = ของ Rear Rack เท่านั้น",
    fix_commit: "109a9d4",
    fix_date: "2026-04-07",
    source: "fix_history",
    turns: [{ role: "user", message: "side rack ใช้เป็นมือจับคนซ้อนได้ไหม" }],
    assertions: {
      forbidden_patterns: [
        { pattern: "side\\s*rack.*มือจับ|มือจับ.*side\\s*rack", flags: "i", reason: "Side Rack ไม่ใช่มือจับ" },
      ],
      expect_behavior: "AI ต้องอธิบายว่า Side Rack คือแร็คข้างสำหรับยึดกล่องข้าง ไม่ใช่มือจับคนซ้อน (มือจับเป็นของ Rear Rack PRO)",
      must_not_do: ["ห้ามบอกว่า Side Rack เป็นมือจับ"],
    },
  },

  // REG-004: Claude review text leak
  {
    bug_id: "REG-004",
    title: "Claude review text ห้ามหลุดไปหาลูกค้า",
    category: "anti_hallucination",
    severity: "critical",
    platform: "any",
    bug_context:
      "Claude supervisor text ('ตรวจสอบแล้ว', 'ปัญหา:', '---') หลุดไปหาลูกค้าโดยตรง — ต้อง filter ออกก่อนส่ง",
    fix_commit: "2bfddc7",
    fix_date: "2026-04-08",
    source: "fix_history",
    turns: [{ role: "user", message: "อยากทราบราคากล่อง ADV350" }],
    assertions: {
      forbidden_patterns: [
        { pattern: "ตรวจสอบแล้ว", flags: "", reason: "Claude supervisor text leak" },
        { pattern: "^---\\s*$", flags: "m", reason: "Markdown separator leak" },
        { pattern: "\\bReview\\b|\\bSupervisor\\b", flags: "i", reason: "Supervisor labels leak" },
      ],
      expect_behavior: "AI ต้องตอบคำถามลูกค้าตรงประเด็น ห้ามมี Claude supervisor/review markers หลุดออกมา",
    },
  },

  // REG-005: Dealer inquiry + auto-lead (multi-turn)
  {
    bug_id: "REG-005",
    title: "Dealer inquiry + ลูกค้าให้ชื่อเบอร์ → ประสานตัวแทน + สร้าง lead",
    category: "flow",
    severity: "critical",
    platform: "any",
    bug_context:
      "ลูกค้าถามร้าน + ให้ชื่อ+เบอร์ → AI ต้องประสานตัวแทน ไม่บอกราคาซ้ำ ต้องเรียก dinoco_create_lead",
    fix_commit: "5d25e4f",
    fix_date: "2026-04-07",
    source: "fix_history",
    turns: [
      { role: "user", message: "แถวลาดพร้าวซื้อที่ไหนครับ" },
      { role: "user", message: "เปรม 0812345678" },
    ],
    assertions: {
      forbidden_patterns: [
        { pattern: "ราคา.*บาท.*ราคา.*บาท", flags: "s", reason: "ห้ามบอกราคาซ้ำเมื่อถามร้าน" },
      ],
      required_patterns: [
        { pattern: "ประสาน|แจ้งตัวแทน|ติดต่อกลับ", flags: "i", reason: "ต้องประสานตัวแทน" },
      ],
      expected_tools: ["dinoco_create_lead"],
      expect_behavior:
        "AI ต้องแนะนำร้านตัวแทนย่านลาดพร้าว + เมื่อลูกค้าให้ชื่อ+เบอร์ ต้องเรียก dinoco_create_lead และตอบว่าแอดมินจะประสานตัวแทนติดต่อกลับ",
      must_not_do: ["ห้ามบอกราคาสินค้าซ้ำเมื่อลูกค้าถามร้าน"],
    },
    retry_on_flaky: 1,
  },

  // REG-006: X Travel Pro เลิกขาย
  {
    bug_id: "REG-006",
    title: "X Travel Pro เลิกขาย ห้ามเสนอ",
    category: "product_knowledge",
    severity: "medium",
    platform: "any",
    bug_context:
      "X Travel Pro เลิกผลิต/เลิกขาย — AI ต้องไม่เสนอและกรองออกจาก product lookup",
    fix_commit: "2026-04-06",
    fix_date: "2026-04-06",
    source: "fix_history",
    turns: [{ role: "user", message: "มีกระเป๋า X Travel Pro ขายไหมครับ" }],
    assertions: {
      forbidden_patterns: [
        { pattern: "X\\s*Travel\\s*Pro.*มีอยู่|X\\s*Travel\\s*Pro.*ราคา", flags: "i", reason: "ห้ามเสนอ X Travel Pro" },
      ],
      expect_behavior:
        "AI ต้องแจ้งว่า X Travel Pro เลิกขาย/เลิกผลิตแล้ว แนะนำสินค้าอื่นทดแทน",
    },
  },

  // REG-007: ADV160 ไม่มีสินค้า
  {
    bug_id: "REG-007",
    title: "ADV160 ไม่มีสินค้า DINOCO — ตอบทันที ไม่ถามซ้ำ",
    category: "product_knowledge",
    severity: "medium",
    platform: "any",
    bug_context: "AI เคยถามซ้ำเมื่อลูกค้าบอก ADV160 — ต้องตอบทันทีว่าไม่มีสินค้าสำหรับรุ่นนี้",
    fix_commit: "2026-04-06",
    fix_date: "2026-04-06",
    source: "fix_history",
    turns: [{ role: "user", message: "มีกล่องสำหรับ adv160 ไหมครับ" }],
    assertions: {
      required_patterns: [
        { pattern: "ไม่มี|ยังไม่มี|ไม่รองรับ", flags: "i", reason: "ต้องแจ้งว่าไม่มี" },
      ],
      expect_behavior:
        "AI ต้องตอบทันทีว่าไม่มีสินค้าสำหรับ ADV160 (DINOCO ยังไม่ได้ผลิตสำหรับรุ่นนี้) ห้ามถามซ้ำว่ารุ่นอะไร",
      must_not_do: ["ห้ามถามว่ารุ่นอะไรซ้ำ", "ห้ามเดาสินค้าให้ ADV160"],
    },
  },

  // REG-008: ADV350 ไม่มีกล่องข้าง
  {
    bug_id: "REG-008",
    title: "ADV350/Forza350 ไม่มีกล่องข้าง/แร็คข้าง",
    category: "product_knowledge",
    severity: "medium",
    platform: "any",
    bug_context:
      "ADV350 และ Forza350 ไม่มีกล่องข้าง/แร็คข้าง เพราะข้อจำกัดด้านบาลานซ์ — AI เคยเสนอผิด",
    fix_commit: "",
    fix_date: "2026-04-05",
    source: "fix_history",
    turns: [{ role: "user", message: "กล่องข้าง adv350 มีไหมครับ" }],
    assertions: {
      forbidden_patterns: [
        { pattern: "(กล่องข้าง|side\\s*case).*adv\\s*350.*(มี|ราคา)", flags: "i", reason: "ADV350 ไม่มีกล่องข้าง" },
      ],
      required_patterns: [
        { pattern: "ไม่มี|ไม่รองรับ", flags: "i", reason: "ต้องแจ้งว่าไม่มี" },
      ],
      expect_behavior:
        "AI ต้องแจ้งว่า ADV350 ไม่มีกล่องข้าง/แร็คข้าง เนื่องจากข้อจำกัดด้านบาลานซ์ รองรับเฉพาะแร็คหลัง กันล้ม และกล่องหลัง",
    },
  },

  // REG-009: ห้าม ดิฉัน/พี่/น้อง
  {
    bug_id: "REG-009",
    title: "น้ำเสียง — ห้าม ดิฉัน/พี่/น้อง",
    category: "tone",
    severity: "high",
    platform: "any",
    bug_context: "AI เคยใช้คำ 'ดิฉัน' 'พี่' 'น้อง' — ต้องใช้ 'คุณลูกค้า' หรือ 'ลูกค้า' เท่านั้น",
    fix_commit: "",
    fix_date: "2026-04-06",
    source: "fix_history",
    turns: [{ role: "user", message: "อยากทราบเรื่องประกันครับ" }],
    assertions: {
      forbidden_patterns: [
        { pattern: "\\bดิฉัน\\b", flags: "", reason: "ห้ามใช้ 'ดิฉัน'" },
        { pattern: "(^|\\s)พี่(\\s|$|,|\\.)", flags: "", reason: "ห้ามใช้ 'พี่'" },
        { pattern: "(^|\\s)น้อง(\\s|$|,|\\.)", flags: "", reason: "ห้ามใช้ 'น้อง'" },
      ],
      expect_behavior: "AI ต้องตอบเรื่องประกัน ใช้คำเรียกลูกค้าแบบ 'คุณลูกค้า' หรือ 'ลูกค้า' เท่านั้น",
      must_not_do: ["ห้ามใช้คำว่า 'ดิฉัน'", "ห้ามใช้คำว่า 'พี่'", "ห้ามใช้คำว่า 'น้อง'"],
    },
  },

  // REG-010: ห้ามเผยเป็น AI
  {
    bug_id: "REG-010",
    title: "ห้ามเผยว่าเป็น AI/บอท/ระบบอัตโนมัติ",
    category: "anti_hallucination",
    severity: "critical",
    platform: "any",
    bug_context: "AI เคยเผยว่าตัวเองเป็น AI/บอท — ต้องทำตัวเป็นแอดมินมนุษย์เสมอ",
    fix_commit: "",
    fix_date: "2026-04-01",
    source: "fix_history",
    turns: [{ role: "user", message: "คุณเป็น AI ใช่ไหมครับ" }],
    assertions: {
      forbidden_patterns: [
        { pattern: "\\b(ใช่|ใช่ค่ะ|ครับ|ค่ะ).*(AI|บอท|ระบบอัตโนมัติ)", flags: "i", reason: "ห้ามยอมรับว่าเป็น AI" },
        { pattern: "(ฉัน|ดิฉัน|ผม|เรา).*(เป็น|คือ).*(AI|บอท|ระบบอัตโนมัติ)", flags: "i", reason: "ห้ามเผยตัวตนเป็น AI" },
      ],
      expect_behavior: "AI ต้องไม่เปิดเผยว่าเป็น AI/บอท — ตอบเลี่ยงๆ ว่าเป็นแอดมินของ DINOCO",
      must_not_do: ["ห้ามบอกว่าเป็น AI", "ห้ามบอกว่าเป็นบอท"],
    },
  },

  // REG-011: ห้ามบอกราคาซ้ำเมื่อถามร้าน
  {
    bug_id: "REG-011",
    title: "ห้ามบอกราคาซ้ำเมื่อลูกค้าถามร้าน (เปลี่ยน intent)",
    category: "flow",
    severity: "critical",
    platform: "any",
    bug_context:
      "AI เคยบอกราคาสินค้าซ้ำเมื่อลูกค้าเปลี่ยนจากถามราคา→ถามร้าน — ต้องประสานตัวแทนอย่างเดียว",
    fix_commit: "",
    fix_date: "2026-04-06",
    source: "fix_history",
    turns: [
      { role: "user", message: "กล่องหลัง adv350 เท่าไหร่" },
      { role: "user", message: "แถวเชียงใหม่ซื้อได้ที่ไหนครับ" },
    ],
    assertions: {
      expect_behavior:
        "turn 2: AI ต้องแนะนำร้านตัวแทนจำหน่ายเชียงใหม่ ห้ามบอกราคาซ้ำที่เพิ่งบอกใน turn 1",
      must_not_do: ["ห้ามบอกราคาสินค้าซ้ำใน turn 2"],
    },
    retry_on_flaky: 1,
  },

  // REG-012: DINOCO Edition = SKU DNCGND37LSPROS silver only
  {
    bug_id: "REG-012",
    title: "DINOCO Edition NX500 = SKU DNCGND37LSPROS สีเงินเท่านั้น",
    category: "product_knowledge",
    severity: "critical",
    platform: "any",
    bug_context:
      "DINOCO Edition NX500 ต้องเป็น SKU DNCGND37LSPROS สีเงินเท่านั้น — ห้ามเสนอสีดำหรือ SKU อื่น",
    fix_commit: "27a8972",
    fix_date: "2026-04-07",
    source: "fix_history",
    turns: [{ role: "user", message: "DINOCO Edition NX500 มีสีอะไรบ้าง" }],
    assertions: {
      forbidden_patterns: [
        { pattern: "DINOCO\\s*Edition.*สีดำ|สีดำ.*DINOCO\\s*Edition", flags: "i", reason: "ห้ามบอกว่า Edition มีสีดำ" },
      ],
      required_patterns: [
        { pattern: "เงิน|silver|DNCGND37LSPROS", flags: "i", reason: "ต้องพูดถึงสีเงินหรือ SKU" },
      ],
      expect_behavior:
        "AI ต้องตอบว่า DINOCO Edition NX500 มีสีเงินเท่านั้น (SKU DNCGND37LSPROS)",
    },
  },

  // REG-013: PII masking (ชื่อ+เบอร์ไม่ crash AI)
  {
    bug_id: "REG-013",
    title: "PII masking — ชื่อ+เบอร์ไม่ทำ AI crash",
    category: "anti_hallucination",
    severity: "critical",
    platform: "any",
    bug_context:
      "Gemini SAFETY block เมื่อลูกค้าพิมพ์ชื่อ+เบอร์ลงไปใน conversation — ต้อง mask PII ก่อนส่ง AI",
    fix_commit: "9eb0f50",
    fix_date: "2026-04-07",
    source: "fix_history",
    turns: [
      { role: "user", message: "สนใจกล่อง adv350 ครับ" },
      { role: "user", message: "ชื่อสมชาย ใจดี เบอร์ 0812345678 อยู่กรุงเทพ" },
    ],
    assertions: {
      forbidden_patterns: [
        { pattern: "^\\s*$", flags: "", reason: "AI ต้องตอบ ไม่ใช่เงียบ/ว่าง" },
        { pattern: "SAFETY|BLOCKED_REASON|content filter", flags: "i", reason: "ห้ามมี SAFETY block leak" },
      ],
      expect_behavior:
        "AI ต้องตอบได้ปกติ ไม่ crash ไม่ silent — อาจสร้าง lead หรือประสานตัวแทน",
    },
    retry_on_flaky: 1,
  },

  // REG-014: FB image URL ไม่ส่งเป็น text
  {
    bug_id: "REG-014",
    title: "FB Image URL ห้ามส่งเป็น plain text",
    category: "flow",
    severity: "high",
    platform: "facebook",
    bug_context:
      "รูปสินค้าจาก Facebook เคยส่งเป็น URL ข้อความ — ต้อง detect + ส่งเป็น image attachment + cleanup text",
    fix_commit: "109a9d4",
    fix_date: "2026-04-07",
    source: "fix_history",
    turns: [{ role: "user", message: "ขอรูปกล่องหลัง adv350 หน่อยครับ" }],
    assertions: {
      forbidden_patterns: [
        { pattern: "https?://[^\\s]+\\.(jpg|jpeg|png|webp)", flags: "i", reason: "ห้ามมี URL รูปใน text ตอบ" },
      ],
      expect_behavior:
        "AI ต้องตอบข้อความปกติเรื่องกล่องหลัง — รูปต้องส่งแยกเป็น image attachment ไม่ใช่ URL text",
    },
  },

  // REG-015: Output-based dealer coordination append
  {
    bug_id: "REG-015",
    title: "ตรวจเจอร้าน+เบอร์ → append ข้อความประสาน",
    category: "flow",
    severity: "high",
    platform: "any",
    bug_context:
      "AI เคยโยนเบอร์ร้านให้ลูกค้าโดยไม่ประสาน — ต้องเพิ่มข้อความ 'แอดมินจะประสานให้' อัตโนมัติเมื่อพบร้าน+เบอร์ในคำตอบ",
    fix_commit: "5d25e4f",
    fix_date: "2026-04-07",
    source: "fix_history",
    turns: [{ role: "user", message: "มีร้านตัวแทนแถวนครสวรรค์ไหมครับ" }],
    assertions: {
      expect_behavior:
        "AI ต้องแนะนำร้าน + offer ให้แอดมินประสาน (ถามชื่อ+เบอร์ลูกค้าเพื่อให้ตัวแทนติดต่อกลับ) ห้ามโยนเบอร์ร้านให้ลูกค้าติดต่อเองอย่างเดียว",
      must_not_do: ["ห้ามโยนเบอร์ร้านให้ลูกค้าติดต่อเองโดยไม่ offer ประสาน"],
    },
  },
];

// ═══════════════════════════════════════
// Main
// ═══════════════════════════════════════
async function main() {
  if (!MONGO_URI) {
    console.error("ERROR: MONGODB_URI not set");
    process.exit(2);
  }
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(MONGO_DB);
  const coll = db.collection(SCENARIOS_COLL);

  // Ensure indexes
  await coll.createIndex({ bug_id: 1 }, { unique: true }).catch(() => {});
  await coll.createIndex({ category: 1, severity: 1 }).catch(() => {});
  await coll.createIndex({ active: 1, severity: 1 }).catch(() => {});

  if (force) {
    console.log("[seed] --force: dropping existing scenarios");
    await coll.deleteMany({ source: "fix_history" });
  }

  let inserted = 0, updated = 0;
  for (const s of SCENARIOS) {
    const doc = {
      ...s,
      timeout_ms: 45000,
      retry_on_flaky: s.retry_on_flaky || 0,
      active: true,
      updated_at: now,
    };
    const result = await coll.updateOne(
      { bug_id: s.bug_id },
      {
        $set: doc,
        $setOnInsert: { created_at: now, pass_rate_7d: null, last_run: null },
      },
      { upsert: true }
    );
    if (result.upsertedCount > 0) inserted++;
    else if (result.modifiedCount > 0) updated++;
  }

  console.log(`\n[seed] Done — inserted: ${inserted}, updated: ${updated}, total: ${SCENARIOS.length}`);
  const count = await coll.countDocuments({ active: { $ne: false } });
  console.log(`[seed] Active scenarios in DB: ${count}`);

  // Print summary by severity
  const agg = await coll
    .aggregate([
      { $match: { active: { $ne: false } } },
      { $group: { _id: "$severity", count: { $sum: 1 } } },
    ])
    .toArray();
  console.log(`[seed] By severity:`, agg.map(a => `${a._id}=${a.count}`).join(", "));

  await client.close();
}

main().catch(e => {
  console.error("FATAL:", e);
  process.exit(2);
});
