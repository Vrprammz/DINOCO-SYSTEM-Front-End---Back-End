#!/usr/bin/env node
/**
 * conversation-miner.js V.1.0 — Mining real customer chats for AI training
 *
 * อ่าน messages collection จาก MongoDB แล้วสกัดข้อมูลสำหรับเทรน AI
 * แทน Gemini สร้างคำถามเอง — ใช้แชทจริงจากลูกค้า
 *
 * Modes:
 *   --find-failures      หาข้อความที่ AI ตอบแย่ (ถามซ้ำ, ตอบผิด, handoff, supervisor แก้)
 *   --extract-kb         สกัด Q&A pairs จาก conversation ที่ดี → KB draft
 *   --tone-check         ตรวจน้ำเสียงจาก chat จริง (ดิฉัน, พี่, น้อง ฯลฯ)
 *   --stats              สรุปสถิติรวม (resolution rate, top intents, drop-off)
 *
 * Env: MONGODB_URI, MONGODB_DB (default: dinoco), GOOGLE_API_KEY
 *
 * Usage:
 *   node scripts/conversation-miner.js --find-failures [--days 7] [--limit 500]
 *   node scripts/conversation-miner.js --extract-kb [--days 30] [--limit 100]
 *   node scripts/conversation-miner.js --tone-check [--days 7]
 *   node scripts/conversation-miner.js --stats [--days 30]
 */

const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════
// Config
// ═══════════════════════════════════════
const MONGO_URI = process.env.MONGODB_URI || "";
const MONGO_DB = process.env.MONGODB_DB || "dinoco";
const GEMINI_KEY = process.env.GOOGLE_API_KEY || "";
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

const OUTPUT_DIR = path.resolve(__dirname);
const FAILURES_PATH = path.join(OUTPUT_DIR, "mined-failures.json");
const KB_DRAFT_PATH = path.join(OUTPUT_DIR, "mined-kb-draft.json");
const TONE_PATH = path.join(OUTPUT_DIR, "mined-tone-report.json");
const STATS_PATH = path.join(OUTPUT_DIR, "mined-stats.json");

// ═══════════════════════════════════════
// Args
// ═══════════════════════════════════════
const args = process.argv.slice(2);
const mode = args.find(a => a.startsWith("--") && !a.includes("="))?.replace("--", "") || "stats";
const days = (() => {
  const idx = args.indexOf("--days");
  return idx >= 0 && args[idx + 1] ? parseInt(args[idx + 1]) : 7;
})();
const limit = (() => {
  const idx = args.indexOf("--limit");
  return idx >= 0 && args[idx + 1] ? parseInt(args[idx + 1]) : 500;
})();

// ═══════════════════════════════════════
// MongoDB helpers
// ═══════════════════════════════════════
let client = null;
let db = null;

async function connectDB() {
  if (!MONGO_URI) {
    console.error("[ERROR] MONGODB_URI not set");
    process.exit(1);
  }
  client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db(MONGO_DB);
  console.log(`[DB] Connected to ${MONGO_DB}`);
}

async function closeDB() {
  if (client) await client.close();
}

function sinceDate() {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * ดึง messages ทั้งหมดแล้ว group by sourceId → conversations
 */
async function getConversations(extraFilter = {}) {
  const coll = db.collection("messages");
  const since = sinceDate();

  const filter = {
    createdAt: { $gte: since },
    // ข้าม judge/test sourceIds
    sourceId: { $not: /^judge-/ },
    ...extraFilter,
  };

  const msgs = await coll.find(filter)
    .sort({ createdAt: 1 })
    .project({ sourceId: 1, role: 1, content: 1, userName: 1, createdAt: 1,
               isAiReply: 1, messageType: 1, platform: 1 })
    .toArray();

  // Group by sourceId
  const convMap = new Map();
  for (const m of msgs) {
    if (!convMap.has(m.sourceId)) convMap.set(m.sourceId, []);
    convMap.get(m.sourceId).push(m);
  }

  return convMap;
}

/**
 * ดึง alerts (human handoff) จาก alerts collection
 */
async function getHandoffAlerts() {
  const coll = db.collection("alerts");
  const since = sinceDate();
  return coll.find({
    type: "human_handoff",
    createdAt: { $gte: since },
  }).project({ sourceId: 1, message: 1, level: 1, createdAt: 1 }).toArray();
}

// ═══════════════════════════════════════
// Gemini helper
// ═══════════════════════════════════════
async function callGemini(prompt, temperature = 0.3) {
  if (!GEMINI_KEY) return null;
  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    console.error("[Gemini] Error:", e.message);
    return null;
  }
}

// ═══════════════════════════════════════
// Mode 1: --find-failures
// ═══════════════════════════════════════
async function findFailures() {
  console.log(`\n=== Find Failures (last ${days} days) ===\n`);

  const convMap = await getConversations();
  const handoffs = await getHandoffAlerts();
  const handoffSourceIds = new Set(handoffs.map(h => h.sourceId));

  const failures = [];

  for (const [sourceId, msgs] of convMap) {
    // Pattern 1: ลูกค้าถามซ้ำ 2+ ครั้ง (AI ไม่ตอบ/ตอบผิด)
    const userMsgs = msgs.filter(m => m.role === "user");
    for (let i = 1; i < userMsgs.length; i++) {
      const prev = (userMsgs[i - 1].content || "").trim().toLowerCase();
      const curr = (userMsgs[i].content || "").trim().toLowerCase();
      if (prev && curr && prev.length > 5 && similarity(prev, curr) > 0.7) {
        const aiReplyBetween = findAiReplyBetween(msgs, userMsgs[i - 1], userMsgs[i]);
        failures.push({
          type: "repeated_question",
          sourceId,
          platform: msgs[0].platform,
          customerQuestion: userMsgs[i].content,
          aiReply: aiReplyBetween,
          timestamp: userMsgs[i].createdAt,
          context: extractContext(msgs, userMsgs[i]),
        });
      }
    }

    // Pattern 2: AI ตอบ "ขอเช็คข้อมูล" "ไม่มีข้อมูลในระบบ" (KB ขาด)
    const KB_GAP_PATTERNS = [
      /ขอเช็คข้อมูล/,
      /ไม่มีข้อมูลในระบบ/,
      /ขอสอบถามทีมงาน/,
      /รอทีมงาน/,
      /ไม่สามารถ.*ได้ในขณะนี้/,
      /ไม่มีข้อมูล.*ขณะนี้/,
      /ยังไม่มีข้อมูล/,
    ];
    const aiMsgs = msgs.filter(m => m.role === "assistant" && m.isAiReply);
    for (const aiMsg of aiMsgs) {
      const text = aiMsg.content || "";
      const matched = KB_GAP_PATTERNS.find(p => p.test(text));
      if (matched) {
        const userBefore = findUserBefore(msgs, aiMsg);
        if (userBefore) {
          failures.push({
            type: "kb_gap",
            sourceId,
            platform: msgs[0].platform,
            customerQuestion: userBefore.content,
            aiReply: text,
            pattern: matched.source,
            timestamp: aiMsg.createdAt,
            context: extractContext(msgs, aiMsg),
          });
        }
      }
    }

    // Pattern 3: ลูกค้าพิมพ์ "ไม่ใช่" "ผิด" "ไม่ถูก" (AI ตอบผิด)
    const NEGATIVE_PATTERNS = [
      /^ไม่ใช่/,
      /^ผิด/,
      /^ไม่ถูก/,
      /^ไม่ได้ถาม/,
      /ตอบไม่ตรง/,
      /ถามอีกที/,
      /ไม่เข้าใจ.*ถาม/,
      /พูดอะไร/,
      /ไม่ใช่.*ถาม/,
    ];
    for (const userMsg of userMsgs) {
      const text = (userMsg.content || "").trim();
      const matched = NEGATIVE_PATTERNS.find(p => p.test(text));
      if (matched) {
        const aiBefore = findAiBefore(msgs, userMsg);
        const userBefore = findUserBefore(msgs, aiBefore || userMsg);
        if (aiBefore) {
          failures.push({
            type: "wrong_answer",
            sourceId,
            platform: msgs[0].platform,
            customerFeedback: text,
            customerOriginalQuestion: userBefore?.content || "",
            aiReply: aiBefore.content,
            timestamp: userMsg.createdAt,
            context: extractContext(msgs, userMsg),
          });
        }
      }
    }

    // Pattern 4: Human handoff triggered
    if (handoffSourceIds.has(sourceId)) {
      const alert = handoffs.find(h => h.sourceId === sourceId);
      const lastUser = userMsgs[userMsgs.length - 1];
      failures.push({
        type: "handoff",
        sourceId,
        platform: msgs[0].platform,
        alertMessage: alert?.message || "",
        alertLevel: alert?.level || "",
        lastCustomerMessage: lastUser?.content || "",
        timestamp: alert?.createdAt || lastUser?.createdAt,
        context: extractContext(msgs, lastUser || msgs[msgs.length - 1]),
      });
    }
  }

  // Deduplicate by sourceId+type (keep first per sourceId per type)
  const seen = new Set();
  const deduped = failures.filter(f => {
    const key = `${f.sourceId}:${f.type}:${(f.customerQuestion || f.customerFeedback || "").substring(0, 30)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by timestamp desc, limit
  deduped.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const result = deduped.slice(0, limit);

  fs.writeFileSync(FAILURES_PATH, JSON.stringify(result, null, 2));

  // Summary
  const byType = {};
  for (const f of result) {
    byType[f.type] = (byType[f.type] || 0) + 1;
  }

  console.log(`Total failures found: ${result.length}`);
  console.log("By type:");
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log(`\nOutput: ${FAILURES_PATH}`);

  // Print top 10 KB gaps
  const kbGaps = result.filter(f => f.type === "kb_gap");
  if (kbGaps.length > 0) {
    console.log(`\nTop KB Gaps (${Math.min(10, kbGaps.length)}):`);
    for (const g of kbGaps.slice(0, 10)) {
      console.log(`  Q: ${(g.customerQuestion || "").substring(0, 80)}`);
      console.log(`  A: ${(g.aiReply || "").substring(0, 80)}`);
      console.log("");
    }
  }

  return result;
}

// ═══════════════════════════════════════
// Mode 2: --extract-kb
// ═══════════════════════════════════════
async function extractKB() {
  console.log(`\n=== Extract KB from good conversations (last ${days} days) ===\n`);

  const convMap = await getConversations();
  const handoffs = await getHandoffAlerts();
  const handoffSourceIds = new Set(handoffs.map(h => h.sourceId));

  // Filter: conversations ที่ resolved สำเร็จ (ไม่ handoff, มี AI ตอบ, >= 2 turns)
  const goodConvs = [];
  for (const [sourceId, msgs] of convMap) {
    if (handoffSourceIds.has(sourceId)) continue;

    const userMsgs = msgs.filter(m => m.role === "user");
    const aiMsgs = msgs.filter(m => m.role === "assistant" && m.isAiReply);
    if (userMsgs.length < 1 || aiMsgs.length < 1) continue;

    // Skip if any negative feedback
    const hasNegative = userMsgs.some(m =>
      /ไม่ใช่|ผิด|ไม่ถูก|ตอบไม่ตรง/.test(m.content || "")
    );
    if (hasNegative) continue;

    // Skip if AI couldn't answer
    const hasGap = aiMsgs.some(m =>
      /ขอเช็คข้อมูล|ไม่มีข้อมูลในระบบ|รอทีมงาน/.test(m.content || "")
    );
    if (hasGap) continue;

    goodConvs.push({ sourceId, msgs, turns: userMsgs.length });
  }

  console.log(`Good conversations: ${goodConvs.length} / ${convMap.size}`);

  // Extract Q&A pairs
  const qaPairs = [];
  for (const conv of goodConvs.slice(0, limit)) {
    const pairs = extractQAPairs(conv.msgs);
    qaPairs.push(...pairs.map(p => ({
      ...p,
      sourceId: conv.sourceId,
      platform: conv.msgs[0].platform,
    })));
  }

  console.log(`Raw Q&A pairs extracted: ${qaPairs.length}`);

  // Use Gemini to format as KB entries
  const kbDrafts = [];
  const batchSize = 10;
  for (let i = 0; i < qaPairs.length; i += batchSize) {
    const batch = qaPairs.slice(i, i + batchSize);
    const formatted = await formatAsKB(batch);
    if (formatted) kbDrafts.push(...formatted);
    // Rate limit
    if (i + batchSize < qaPairs.length) await sleep(1000);
  }

  fs.writeFileSync(KB_DRAFT_PATH, JSON.stringify(kbDrafts, null, 2));

  console.log(`KB draft entries: ${kbDrafts.length}`);
  console.log(`Output: ${KB_DRAFT_PATH}`);

  // Print samples
  if (kbDrafts.length > 0) {
    console.log(`\nSample KB entries (${Math.min(5, kbDrafts.length)}):`);
    for (const kb of kbDrafts.slice(0, 5)) {
      console.log(`  Category: ${kb.category || "general"}`);
      console.log(`  Q: ${(kb.training_phrases || []).join(" | ").substring(0, 100)}`);
      console.log(`  A: ${(kb.core_facts || "").substring(0, 100)}`);
      console.log("");
    }
  }

  return kbDrafts;
}

/**
 * Gemini format Q&A pairs as KB entries
 */
async function formatAsKB(pairs) {
  if (!GEMINI_KEY || pairs.length === 0) return pairs.map(p => ({
    category: "general",
    training_phrases: [p.question],
    core_facts: p.answer,
    source: "mined",
    sourceId: p.sourceId,
  }));

  const pairsText = pairs.map((p, i) =>
    `${i + 1}. Q: ${p.question}\n   A: ${p.answer}`
  ).join("\n\n");

  const prompt = `จาก Q&A pairs ด้านล่าง (จากแชทจริงของลูกค้า DINOCO อะไหล่มอเตอร์ไซค์):

${pairsText}

สร้าง KB entries สำหรับเทรน AI ในรูปแบบ JSON array:
[
  {
    "category": "product|warranty|claim|dealer|install|general",
    "training_phrases": ["วิธีที่ลูกค้าถามจริงๆ", "วิธีถามอื่นที่เป็นไปได้"],
    "core_facts": "ข้อเท็จจริงที่ AI ควรตอบ (สั้น กระชับ ครบถ้วน)"
  }
]

กฎ:
- training_phrases ต้องเป็นภาษาที่ลูกค้าใช้จริง (สแลง, ตัวย่อ, typo ที่พบบ่อย)
- core_facts ต้องเป็นข้อเท็จจริง ห้ามใส่ความเห็น
- ถ้า Q&A ไม่มีข้อมูลที่เป็นประโยชน์ → ข้าม
- ตอบ JSON เท่านั้น ไม่ต้องอธิบาย`;

  const result = await callGemini(prompt, 0.2);
  if (!result) return [];

  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((kb, i) => ({
      ...kb,
      source: "mined",
      sourceId: pairs[i]?.sourceId || "",
    }));
  } catch (e) {
    console.error("[Gemini] Parse error:", e.message);
    return [];
  }
}

// ═══════════════════════════════════════
// Mode 3: --tone-check
// ═══════════════════════════════════════
async function toneCheck() {
  console.log(`\n=== Tone Check (last ${days} days) ===\n`);

  const convMap = await getConversations();

  const TONE_PATTERNS = {
    "ดิฉัน": /ดิฉัน/g,
    "พี่ (เรียกลูกค้า)": /พี่(?!พี)/g,
    "น้อง (เรียกตัวเอง)": /น้อง(?!ๆ)/g,
    "ยินดีให้บริการ": /ยินดีให้บริการ/g,
    "ยินดีให้บริการด้านสินค้าอะไหล่": /ยินดีให้บริการด้านสินค้า/g,
    "? (เครื่องหมายคำถาม)": /\?(?![a-zA-Z_=&])/g,
    "เป็น AI/บอท": /เป็น AI|เป็นบอท|ระบบอัตโนมัติ|artificial intelligence/gi,
    "สวัสดีซ้ำ": /สวัสดี.*สวัสดี/gs,
    "ภาษาอังกฤษยาว": /[a-zA-Z]{20,}/g,
  };

  const report = {};
  for (const patternName of Object.keys(TONE_PATTERNS)) {
    report[patternName] = { count: 0, examples: [] };
  }

  for (const [sourceId, msgs] of convMap) {
    const aiMsgs = msgs.filter(m => m.role === "assistant" && m.isAiReply);
    for (const aiMsg of aiMsgs) {
      const text = aiMsg.content || "";
      for (const [patternName, regex] of Object.entries(TONE_PATTERNS)) {
        // Reset regex lastIndex
        regex.lastIndex = 0;
        const matches = text.match(regex);
        if (matches) {
          report[patternName].count += matches.length;
          if (report[patternName].examples.length < 5) {
            report[patternName].examples.push({
              sourceId,
              text: text.substring(0, 150),
              timestamp: aiMsg.createdAt,
            });
          }
        }
      }
    }
  }

  fs.writeFileSync(TONE_PATH, JSON.stringify(report, null, 2));

  console.log("Tone Pattern Report:");
  console.log("─".repeat(60));
  for (const [name, data] of Object.entries(report)) {
    const status = data.count === 0 ? "OK" : "FOUND";
    console.log(`  ${status === "OK" ? "[OK]  " : "[!]   "} ${name}: ${data.count} occurrences`);
    if (data.count > 0 && data.examples.length > 0) {
      console.log(`        Example: "${data.examples[0].text.substring(0, 80)}..."`);
    }
  }
  console.log(`\nOutput: ${TONE_PATH}`);

  return report;
}

// ═══════════════════════════════════════
// Mode 4: --stats
// ═══════════════════════════════════════
async function stats() {
  console.log(`\n=== Conversation Stats (last ${days} days) ===\n`);

  const convMap = await getConversations();
  const handoffs = await getHandoffAlerts();
  const handoffSourceIds = new Set(handoffs.map(h => h.sourceId));

  let totalConvs = 0;
  let botOnlyResolved = 0;
  let handoffCount = 0;
  let totalTurns = 0;
  let totalUserMsgs = 0;
  const platformCounts = {};
  const questionFreq = {};

  for (const [sourceId, msgs] of convMap) {
    const userMsgs = msgs.filter(m => m.role === "user");
    const aiMsgs = msgs.filter(m => m.role === "assistant" && m.isAiReply);

    if (userMsgs.length === 0) continue;
    totalConvs++;
    totalUserMsgs += userMsgs.length;
    totalTurns += msgs.length;

    // Platform
    const plat = msgs[0].platform || "unknown";
    platformCounts[plat] = (platformCounts[plat] || 0) + 1;

    // Resolution
    if (handoffSourceIds.has(sourceId)) {
      handoffCount++;
    } else if (aiMsgs.length > 0) {
      botOnlyResolved++;
    }

    // Top questions (first user message per conversation)
    const firstQ = (userMsgs[0].content || "").trim();
    if (firstQ.length > 3 && firstQ.length < 200) {
      // Normalize: lowercase, trim
      const normalized = firstQ.toLowerCase().replace(/[?!。？！]/g, "").trim();
      questionFreq[normalized] = (questionFreq[normalized] || 0) + 1;
    }
  }

  // Top unanswered (from failures if available)
  let topUnanswered = [];
  if (fs.existsSync(FAILURES_PATH)) {
    try {
      const failures = JSON.parse(fs.readFileSync(FAILURES_PATH, "utf-8"));
      const kbGaps = failures.filter(f => f.type === "kb_gap");
      const gapFreq = {};
      for (const g of kbGaps) {
        const q = (g.customerQuestion || "").substring(0, 80);
        if (q) gapFreq[q] = (gapFreq[q] || 0) + 1;
      }
      topUnanswered = Object.entries(gapFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([q, count]) => ({ question: q, count }));
    } catch (e) { /* ignore */ }
  }

  // Sort questions by frequency
  const topQuestions = Object.entries(questionFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([q, count]) => ({ question: q, count }));

  // Intent classification using simple keyword matching
  const INTENT_KEYWORDS = {
    "product_inquiry": [/สินค้า/, /ราคา/, /เท่าไ/, /กล่อง/, /กันล้ม/, /แร็ค/, /แคชบาร์/, /การ์ดแฮนด์/, /ถาดรอง/],
    "claim": [/เคลม/, /ซ่อม/, /พัง/, /งอ/, /แตก/, /ลอก/, /สนิม/, /บุบ/, /เสียหาย/],
    "warranty": [/ประกัน/, /warranty/, /รับประกัน/, /serial/],
    "dealer": [/ตัวแทน/, /ร้าน/, /ซื้อที่ไหน/, /จังหวัด/, /สาขา/, /ดีลเลอร์/],
    "install": [/ติดตั้ง/, /ใส่/, /ประกอบ/, /ช่าง/],
    "greeting": [/สวัสดี/, /หวัดดี/, /ดีค่ะ/, /ดีครับ/, /สอบถาม/],
    "order_status": [/สถานะ/, /ส่งของ/, /tracking/, /พัสดุ/, /จัดส่ง/],
    "become_dealer": [/สมัคร.*ตัวแทน/, /เปิด.*ตัวแทน/, /ราคาทุน/, /ราคาต้นทุน/],
    "model_check": [/รุ่น.*รองรับ/, /ใส่.*ได้ไหม/, /ADV/, /NX500/, /Forza/, /CB500/],
  };

  const intentCounts = {};
  for (const [sourceId, msgs] of convMap) {
    const userMsgs = msgs.filter(m => m.role === "user");
    const allUserText = userMsgs.map(m => m.content || "").join(" ");

    for (const [intent, patterns] of Object.entries(INTENT_KEYWORDS)) {
      if (patterns.some(p => p.test(allUserText))) {
        intentCounts[intent] = (intentCounts[intent] || 0) + 1;
      }
    }
  }

  const topIntents = Object.entries(intentCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([intent, count]) => ({ intent, count, pct: totalConvs ? Math.round(count * 100 / totalConvs) : 0 }));

  // Avg turns
  const avgTurns = totalConvs ? (totalTurns / totalConvs).toFixed(1) : 0;
  const resolutionRate = totalConvs ? Math.round(botOnlyResolved * 100 / totalConvs) : 0;

  const result = {
    period: `${days} days`,
    since: sinceDate().toISOString(),
    totalConversations: totalConvs,
    totalUserMessages: totalUserMsgs,
    botOnlyResolved,
    handoffCount,
    resolutionRate: `${resolutionRate}%`,
    avgTurnsPerConversation: parseFloat(avgTurns),
    platformBreakdown: platformCounts,
    topIntents,
    topQuestions: topQuestions.slice(0, 20),
    topUnanswered,
  };

  fs.writeFileSync(STATS_PATH, JSON.stringify(result, null, 2));

  console.log(`Total conversations:     ${totalConvs}`);
  console.log(`Bot-only resolved:       ${botOnlyResolved} (${resolutionRate}%)`);
  console.log(`Handoff to human:        ${handoffCount}`);
  console.log(`Avg turns/conversation:  ${avgTurns}`);
  console.log(`Total user messages:     ${totalUserMsgs}`);
  console.log("");
  console.log("Platform breakdown:");
  for (const [plat, count] of Object.entries(platformCounts)) {
    console.log(`  ${plat}: ${count}`);
  }
  console.log("");
  console.log("Top intents:");
  for (const { intent, count, pct } of topIntents.slice(0, 10)) {
    console.log(`  ${intent}: ${count} (${pct}%)`);
  }
  console.log("");
  console.log(`Top questions: ${topQuestions.length} unique (see ${STATS_PATH})`);
  if (topUnanswered.length > 0) {
    console.log(`\nTop unanswered questions:`);
    for (const { question, count } of topUnanswered.slice(0, 10)) {
      console.log(`  [${count}x] ${question}`);
    }
  }
  console.log(`\nOutput: ${STATS_PATH}`);

  return result;
}

// ═══════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════

/**
 * Simple string similarity (Jaccard on character bigrams)
 */
function similarity(a, b) {
  if (!a || !b) return 0;
  const bigramsA = new Set();
  const bigramsB = new Set();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.substring(i, i + 2));
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.substring(i, i + 2));
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;
  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  return intersection / (bigramsA.size + bigramsB.size - intersection);
}

/**
 * หา AI reply ระหว่าง 2 user messages
 */
function findAiReplyBetween(msgs, userMsg1, userMsg2) {
  const t1 = new Date(userMsg1.createdAt).getTime();
  const t2 = new Date(userMsg2.createdAt).getTime();
  const between = msgs.filter(m =>
    m.role === "assistant" &&
    new Date(m.createdAt).getTime() > t1 &&
    new Date(m.createdAt).getTime() < t2
  );
  return between.length > 0 ? between[between.length - 1].content : "";
}

/**
 * หา user message ก่อน target message
 */
function findUserBefore(msgs, targetMsg) {
  if (!targetMsg) return null;
  const targetTime = new Date(targetMsg.createdAt).getTime();
  const before = msgs.filter(m =>
    m.role === "user" &&
    new Date(m.createdAt).getTime() < targetTime
  );
  return before.length > 0 ? before[before.length - 1] : null;
}

/**
 * หา AI message ก่อน target message
 */
function findAiBefore(msgs, targetMsg) {
  if (!targetMsg) return null;
  const targetTime = new Date(targetMsg.createdAt).getTime();
  const before = msgs.filter(m =>
    m.role === "assistant" &&
    new Date(m.createdAt).getTime() < targetTime
  );
  return before.length > 0 ? before[before.length - 1] : null;
}

/**
 * Extract conversation context around a message (3 msgs before + 1 after)
 */
function extractContext(msgs, targetMsg) {
  if (!targetMsg) return [];
  const idx = msgs.findIndex(m =>
    m.createdAt === targetMsg.createdAt && m.content === targetMsg.content
  );
  if (idx < 0) return [];
  const start = Math.max(0, idx - 3);
  const end = Math.min(msgs.length, idx + 2);
  return msgs.slice(start, end).map(m => ({
    role: m.role,
    content: (m.content || "").substring(0, 200),
    userName: m.userName,
  }));
}

/**
 * Extract Q&A pairs from a conversation
 */
function extractQAPairs(msgs) {
  const pairs = [];
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role !== "user") continue;
    const question = (msgs[i].content || "").trim();
    if (question.length < 5) continue;
    // Skip greetings/stickers
    if (/^(สวัสดี|หวัดดี|ดีค่ะ|ดีครับ|ขอบคุณ|ok|โอเค)$/i.test(question)) continue;

    // Find next AI reply
    for (let j = i + 1; j < msgs.length; j++) {
      if (msgs[j].role === "assistant" && msgs[j].isAiReply) {
        const answer = (msgs[j].content || "").trim();
        if (answer.length < 10) break;
        // Skip non-informative answers
        if (/ขอเช็คข้อมูล|รอทีมงาน/.test(answer)) break;
        pairs.push({ question, answer });
        break;
      }
      // Stop if another user message comes first
      if (msgs[j].role === "user") break;
    }
  }
  return pairs;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════
// Main
// ═══════════════════════════════════════
async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  Conversation Miner V.1.0");
  console.log(`  Mode: ${mode} | Days: ${days} | Limit: ${limit}`);
  console.log(`  DB: ${MONGO_DB}`);
  console.log("═══════════════════════════════════════");

  await connectDB();

  try {
    switch (mode) {
      case "find-failures":
        await findFailures();
        break;
      case "extract-kb":
        await extractKB();
        break;
      case "tone-check":
        await toneCheck();
        break;
      case "stats":
        await stats();
        break;
      default:
        console.error(`Unknown mode: ${mode}`);
        console.log("Available: --find-failures, --extract-kb, --tone-check, --stats");
        process.exit(1);
    }
  } finally {
    await closeDB();
  }
}

main().catch(e => {
  console.error("[FATAL]", e);
  process.exit(1);
});
