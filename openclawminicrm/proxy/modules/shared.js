/**
 * shared.js — Shared state, constants, and DB connection
 * V.1.1 — Boss Command: Dynamic AI Rules + Message Templates
 */
const { MongoClient } = require("mongodb");
const crypto = require("crypto");

// === MongoDB ===
let db = null;
async function getDB() {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    db = client.db(process.env.MONGODB_DB || "smltrack");
    console.log("[DB] MongoDB connected");
    return db;
  } catch (e) {
    console.error("[DB] Failed:", e.message);
    return null;
  }
}

// === Collection names ===
const MESSAGES_COLL = "messages";
const AUDIT_LOG_COLL = "audit_logs";
const KB_COLL = "knowledge_base";
const MEMORY_COLL = "ai_memory";
const SKILL_LESSONS_COLL = "ai_skill_lessons";

// === Bot Config ===
const DEFAULT_BOT_NAME = process.env.BOT_NAME || "DINOCO Assistant";

const DEFAULT_PROMPT = `คุณคือ AI ผู้ช่วยของ DINOCO THAILAND — แบรนด์อะไหล่มอเตอร์ไซค์พรีเมียม (ผู้ผลิต ไม่ขายปลีก)
สินค้าหลัก: กล่องอลูมิเนียม IP67, แคชบาร์ (กันล้ม), แร็ค, ถาดรอง, การ์ดแฮนด์, กระเป๋า
ทุกสินค้ารับประกัน 3 ปี วัสดุอลูมิเนียมแท้ 100%

บทบาท:
- ให้ข้อมูลสินค้า ราคา อย่างถูกต้อง (ดึงจากระบบจริงเท่านั้น ห้ามเดา)
- ถามรุ่นรถลูกค้าก่อนแนะนำสินค้า (เพื่อแนะนำ fitment ที่ถูกต้อง)
- เมื่อลูกค้าสนใจสินค้า → ถามจังหวัด → หาตัวแทนใกล้บ้าน → เสนอประสานให้ทันที
- ห้ามรอลูกค้าบอก — ต้องเสนอเอง: "ให้ทางร้านติดต่อพี่กลับเลยนะคะ ขอเบอร์โทรหน่อยได้ไหมคะ"
- เมื่อได้เบอร์/จังหวัด → ใช้ tool dinoco_create_lead สร้าง lead + แจ้งตัวแทนอัตโนมัติ
- ช่วยเรื่องการรับประกัน/เคลม
- จดจำบทสนทนาเก่าเพื่อให้บริการต่อเนื่อง
- ห้ามทักทาย "สวัสดี" ซ้ำถ้าเคยคุยกันแล้วในวันเดียวกัน ดูจากประวัติสนทนา ถ้ามีแล้วให้ตอบเนื้อหาเลย
- ถ้าไม่แน่ใจข้อมูลใดๆ ให้บอก "ขอเช็คข้อมูลกับทีมงานก่อนนะคะ รอสักครู่ค่ะ"
- ห้ามกุรายละเอียดสินค้าเด็ดขาด (เช่น "มีหูสำหรับติดไฟ") ข้อมูลสินค้าต้องมาจาก tool dinoco_product_lookup เท่านั้น
- ถ้าลูกค้าถามรายละเอียดที่ไม่มีในผลลัพธ์ tool → ตอบว่า "ขอเช็คข้อมูลเพิ่มเติมให้นะคะ" ไม่ใช่กุเอง
- เมื่อลูกค้าขอดูรูปสินค้า → ต้องเรียก tool ค้นหาอีกครั้ง ดู img_url ในผลลัพธ์ แล้วตอบ URL รูปนั้น
- ห้ามตอบจากความจำของบทสนทนาเก่า ถ้าเกี่ยวกับข้อมูลสินค้า/ราคา/สต็อก ต้องเรียก tool ใหม่ทุกครั้ง

ขั้นตอนแนะนำสินค้า (ทำตามลำดับ):
1. ลูกค้าถามสินค้า → ถามรุ่นรถ+ปีผลิต
2. ได้รุ่นรถ → ค้นสินค้าที่เข้ากัน (dinoco_product_lookup)
3. แนะนำสินค้า + ราคา + ประกัน
4. ลูกค้าสนใจ → ถามจังหวัด
5. ได้จังหวัด → หาตัวแทน (dinoco_dealer_lookup)
6. บอกชื่อร้าน + เสนอประสาน: "ให้ทางร้านติดต่อพี่กลับเลยนะคะ"
7. ได้เบอร์ → สร้าง lead (dinoco_create_lead) + แจ้งตัวแทน
8. ตอบลูกค้า: "แจ้งร้าน XXX แล้วค่ะ จะติดต่อพี่กลับเร็วที่สุดนะคะ"

แนะนำสินค้าเสริม (cross-sell):
- แนะนำได้เฉพาะสินค้าที่ได้จาก tool dinoco_product_lookup เท่านั้น ห้ามกุสินค้าที่ไม่มีในระบบ
- ถ้าอยากแนะนำสินค้าเสริม ต้องเรียก tool ค้นหาก่อนว่ามีจริงสำหรับรุ่นรถนั้น
- ห้ามยัดเยียด ให้แนะนำเป็นธรรมชาติ 1 ประโยค ท้ายข้อความ ถ้ามีในระบบ

น้ำเสียง:
- สุภาพ เป็นกันเอง ใจบริการ ลงท้ายด้วย "ค่ะ/นะคะ"
- เรียกลูกค้าว่า "พี่" หรือ "คุณลูกค้า"
- ตอบกระชับ 2-3 ประโยค ไม่ยาวเยิ่นเย้อ
- ใช้ emoji น้อย (1-2 ตัวต่อข้อความ)

ข้อห้ามเด็ดขาด:
- ห้ามกุข้อมูลสินค้า/ราคา/ตัวแทนจำหน่าย — ใช้เฉพาะข้อมูลจากระบบ
- ห้ามบอกราคาต้นทุน/ราคา dealer/ส่วนลด/จำนวนสต็อก
- DINOCO เป็น One Price ไม่มีโปรโมชั่น ถ้าลูกค้าถามลด ตอบ "DINOCO เป็นนโยบาย One Price ค่ะ ซื้อไปมั่นใจได้ว่าจะไม่มีโปรโมชั่นค่ะ"
- ห้ามพูดถึงแบรนด์คู่แข่ง ห้ามเอ่ยชื่อยี่ห้ออื่นเด็ดขาด ถ้าลูกค้าถามเปรียบเทียบ ตอบแค่จุดเด่นของ DINOCO
- ห้ามบอกลูกค้าว่าเป็น AI หรือบอท — ตอบเสมือนเป็นทีมงาน DINOCO
- ห้ามแสดงผล AI วิเคราะห์รูปให้ลูกค้าเห็น — เก็บไว้ภายในส่งให้แอดมินเท่านั้น
- ห้ามใช้คำว่า "AI", "ระบบอัตโนมัติ", "บอท" กับลูกค้า
- ห้ามใช้เครื่องหมาย ? (ภาษาไทยใช้ "คะ" แทน เช่น "สินค้ารุ่นอะไรคะ" ไม่ใช่ "สินค้ารุ่นอะไร?")
- ถ้าลูกค้าต้องการคุยกับคนจริง ให้ส่งเรื่องให้แอดมินทันที`;

// === [DINOCO] Dynamic Keys — อ่านจาก Dashboard settings (MongoDB) ก่อน fallback .env ===
let _cachedAccountKeys = null;
let _cachedAccountKeysAt = 0;
const ACCOUNT_KEYS_TTL = 60 * 1000; // refresh ทุก 60 วินาที

async function loadAccountKeys() {
  if (_cachedAccountKeys && Date.now() - _cachedAccountKeysAt < ACCOUNT_KEYS_TTL) return _cachedAccountKeys;
  try {
    const database = await getDB();
    if (!database) return null;
    const account = await database.collection("accounts").findOne({}, { sort: { updatedAt: -1 } });
    if (account) {
      _cachedAccountKeys = account;
      _cachedAccountKeysAt = Date.now();
    }
    return account;
  } catch { return null; }
}

// === Seed .env keys → MongoDB ทุกครั้งที่ Agent start ===
// ถ้า .env มีค่า + MongoDB ยังว่าง → ใส่ให้ | ถ้า Dashboard ตั้งเอง → ไม่ overwrite
async function seedEnvKeysToMongoDB() {
  const database = await getDB();
  if (!database) return;

  const envKeys = {
    "aiKeys.googleKey": process.env.GOOGLE_API_KEY,
    "aiKeys.anthropicKey": process.env.ANTHROPIC_API_KEY,
    "aiKeys.openrouterKey": process.env.OPENROUTER_API_KEY,
    "aiKeys.groqKey": process.env.GROQ_API_KEY,
    "aiKeys.sambaNovaKey": process.env.SAMBANOVA_API_KEY,
    "aiKeys.cerebrasKey": process.env.CEREBRAS_API_KEY,
    "lineConfig.channelAccessToken": process.env.LINE_CHANNEL_ACCESS_TOKEN,
    "lineConfig.channelSecret": process.env.LINE_CHANNEL_SECRET,
    "fbConfig.pageAccessToken": process.env.FB_PAGE_ACCESS_TOKEN,
    "fbConfig.appSecret": process.env.FB_APP_SECRET,
    "fbConfig.verifyToken": process.env.FB_VERIFY_TOKEN,
  };

  // Sync ลงทุก account document ที่มี
  const accounts = await database.collection("accounts").find({}).toArray();
  const targets = accounts.length > 0 ? accounts : [null]; // null = สร้างใหม่

  for (const existing of targets) {
    const setFields = {};
    let count = 0;
    for (const [path, envVal] of Object.entries(envKeys)) {
      if (!envVal) continue;
      const parts = path.split(".");
      const existingVal = existing ? parts.reduce((o, k) => o?.[k], existing) : null;
      if (!existingVal) { setFields[path] = envVal; count++; }
    }

    // setupComplete ต้อง true เสมอ (Agent ทำงานได้ = setup เสร็จ)
    setFields["setupComplete"] = true;
    setFields["updatedAt"] = new Date();

    if (existing) {
      if (count > 0) {
        await database.collection("accounts").updateOne({ _id: existing._id }, { $set: setFields });
        console.log(`[Keys] Synced ${count} keys from .env → account ${existing.email || existing._id}`);
      } else {
        // ไม่มี key ใหม่ แต่ต้องมั่นใจว่า setupComplete = true
        await database.collection("accounts").updateOne({ _id: existing._id }, { $set: { setupComplete: true } });
      }
    } else {
      // ไม่มี account เลย → สร้างใหม่
      await database.collection("accounts").insertOne({
        email: "admin@dinoco.in.th", name: "DINOCO Admin",
        ...Object.fromEntries(Object.entries(setFields).map(([k, v]) => {
          const parts = k.split(".");
          return parts.length === 1 ? [k, v] : [parts[0], { ...(setFields[parts[0]] || {}), [parts[1]]: v }];
        }).filter(([, v]) => typeof v !== "object")),
        aiKeys: {
          googleKey: envKeys["aiKeys.googleKey"] || "",
          anthropicKey: envKeys["aiKeys.anthropicKey"] || "",
          openrouterKey: envKeys["aiKeys.openrouterKey"] || "",
          groqKey: envKeys["aiKeys.groqKey"] || "",
          sambaNovaKey: envKeys["aiKeys.sambaNovaKey"] || "",
          cerebrasKey: envKeys["aiKeys.cerebrasKey"] || "",
        },
        lineConfig: {
          channelAccessToken: envKeys["lineConfig.channelAccessToken"] || "",
          channelSecret: envKeys["lineConfig.channelSecret"] || "",
        },
        fbConfig: {
          pageAccessToken: envKeys["fbConfig.pageAccessToken"] || "",
          appSecret: envKeys["fbConfig.appSecret"] || "",
          verifyToken: envKeys["fbConfig.verifyToken"] || "",
        },
        setupComplete: true, createdAt: new Date(), updatedAt: new Date(),
      });
      console.log(`[Keys] Created new account with ${count} keys from .env`);
    }
  }
}

// อ่าน key จาก MongoDB (Dashboard settings) ก่อน → fallback process.env
async function getDynamicKey(keyName) {
  const account = await loadAccountKeys();
  const mapping = {
    GOOGLE_API_KEY: account?.aiKeys?.googleKey,
    OPENROUTER_API_KEY: account?.aiKeys?.openrouterKey,
    GROQ_API_KEY: account?.aiKeys?.groqKey,
    SAMBANOVA_API_KEY: account?.aiKeys?.sambaNovaKey,
    CEREBRAS_API_KEY: account?.aiKeys?.cerebrasKey,
    ANTHROPIC_API_KEY: account?.aiKeys?.anthropicKey,
    LINE_CHANNEL_ACCESS_TOKEN: account?.lineConfig?.channelAccessToken,
    LINE_CHANNEL_SECRET: account?.lineConfig?.channelSecret,
    FB_PAGE_ACCESS_TOKEN: account?.fbConfig?.pageAccessToken,
    FB_APP_SECRET: account?.fbConfig?.appSecret,
    FB_VERIFY_TOKEN: account?.fbConfig?.verifyToken,
  };
  return mapping[keyName] || process.env[keyName] || "";
}

// Sync: อ่านทันที (ใช้ cached ถ้ามี fallback env)
function getDynamicKeySync(keyName) {
  const account = _cachedAccountKeys;
  if (account) {
    const mapping = {
      GOOGLE_API_KEY: account?.aiKeys?.googleKey,
      OPENROUTER_API_KEY: account?.aiKeys?.openrouterKey,
      GROQ_API_KEY: account?.aiKeys?.groqKey,
      SAMBANOVA_API_KEY: account?.aiKeys?.sambaNovaKey,
      CEREBRAS_API_KEY: account?.aiKeys?.cerebrasKey,
      ANTHROPIC_API_KEY: account?.aiKeys?.anthropicKey,
      LINE_CHANNEL_ACCESS_TOKEN: account?.lineConfig?.channelAccessToken,
      LINE_CHANNEL_SECRET: account?.lineConfig?.channelSecret,
      FB_PAGE_ACCESS_TOKEN: account?.fbConfig?.pageAccessToken,
      FB_APP_SECRET: account?.fbConfig?.appSecret,
      FB_VERIFY_TOKEN: account?.fbConfig?.verifyToken,
    };
    if (mapping[keyName]) return mapping[keyName];
  }
  return process.env[keyName] || "";
}

// === A/B Testing Prompts ===
const AB_PROMPTS = {
  A: "ตอบสั้นๆ กระชับ ไม่เกิน 2 ประโยค",
  B: "ตอบอย่างเป็นมิตร ใส่ emoji ให้รู้สึกอบอุ่น ไม่เกิน 3 ประโยค",
};

function getABVariant(sourceId) {
  const hash = sourceId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return hash % 2 === 0 ? "A" : "B";
}

// === AI Cost Tracking Pricing ===
const AI_PRICING = {
  "OR-Nemotron": { input: 0, output: 0 },
  "OR-DeepSeek": { input: 0, output: 0 },
  "OR-Llama": { input: 0, output: 0 },
  "OR-Trinity": { input: 0, output: 0 },
  "OR-StepFlash": { input: 0, output: 0 },
  "SambaNova": { input: 0, output: 0 },
  "Groq": { input: 0.059, output: 0.079 },
  "Cerebras": { input: 0.01, output: 0.01 },
  "Gemini": { input: 0, output: 0 },
  "Gemini-Embed": { input: 0, output: 0 },
  "openrouter": { input: 0.18, output: 0.18 },
  "OR-Vision": { input: 0, output: 0 },
  "Groq-Vision": { input: 0.059, output: 0.079 },
  "Gemini-Vision": { input: 0, output: 0 },
};

const PAID_AI = process.env.PAID_AI_ENABLED === "true";

// === Audit Log ===
async function auditLog(action, details = {}) {
  const db = await getDB();
  if (!db) return;
  try {
    await db.collection(AUDIT_LOG_COLL).insertOne({
      action,
      ...details,
      createdAt: new Date(),
    });
  } catch {}
}

// === AI Cost Tracking ===
async function trackAICost({ provider, model, feature, inputTokens = 0, outputTokens = 0, sourceId = null, success = true }) {
  try {
    const database = await getDB();
    if (!database) return;
    const pricing = AI_PRICING[provider] || { input: 0, output: 0 };
    const totalTokens = inputTokens + outputTokens;
    const costUsd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1000000;
    await database.collection("ai_costs").insertOne({
      provider,
      model: model || provider,
      feature,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd: Math.round(costUsd * 1000000) / 1000000,
      sourceId,
      success,
      createdAt: new Date(),
    });
  } catch (e) {
    // silent
  }
}

// === Bot Config Cache ===
const botConfigCache = {};

async function getBotConfig(sourceId, sourceMeta) {
  const cached = botConfigCache[sourceId];
  if (cached && Date.now() - cached._ts < 60000) return cached;
  const database = await getDB();
  if (!database) return { systemPrompt: DEFAULT_PROMPT, botName: DEFAULT_BOT_NAME };
  try {
    let config = await database.collection("bot_config").findOne({ sourceId });
    if (!config) {
      config = {
        sourceId,
        sourceType: sourceMeta?.type || "unknown",
        groupName: sourceMeta?.groupName || null,
        botName: DEFAULT_BOT_NAME,
        systemPrompt: DEFAULT_PROMPT,
        aiAutoReply: false,
        aiReplyMode: "off",
        aiReplyKeywords: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await database.collection("bot_config").insertOne(config);
      console.log(`[Config] Auto-created config for ${sourceId} (${sourceMeta?.groupName || "unknown"})`);
    }
    config._ts = Date.now();
    botConfigCache[sourceId] = config;
    return config;
  } catch (e) {
    return { systemPrompt: DEFAULT_PROMPT, botName: DEFAULT_BOT_NAME };
  }
}

async function setBotConfig(sourceId, updates) {
  const database = await getDB();
  if (!database) return;
  await database.collection("bot_config").updateOne(
    { sourceId },
    { $set: { ...updates, sourceId, updatedAt: new Date() } },
    { upsert: true }
  );
  delete botConfigCache[sourceId];
}

// === Privacy / Opt-out Keywords ===
const OPT_OUT_KEYWORDS = ["หยุด", "stop", "ยกเลิก", "unsubscribe"];
const OPT_IN_KEYWORDS = ["เปิด", "start", "subscribe"];
const DELETE_KEYWORDS = ["ลบข้อมูล", "delete my data", "ลบ"];
const HANDOFF_REGEX = /คุยกับคน|ขอคุยกับพนักงาน|ต้องการคนจริง|ไม่ใช่ bot|talk to human|real person|agent/;

// === PDPA Notice ===
const DINOCO_PRIVACY_TEXT = `🔒 แจ้งเตือนจาก DINOCO THAILAND

ระบบนี้ใช้ AI ในการวิเคราะห์และตอบกลับข้อความ ข้อมูลของคุณจะถูกเก็บรักษาตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)

ผู้ควบคุมข้อมูล: DINOCO THAILAND
ข้อมูลที่เก็บ: ชื่อ, ข้อความสนทนา, จังหวัด
ระยะเวลาเก็บ: 90 วันสำหรับ lead, 1 ปีสำหรับเคลม

พิมพ์ "หยุด" เพื่อไม่รับข้อความอัตโนมัติ
พิมพ์ "ลบข้อมูล" เพื่อขอลบข้อมูลของคุณ`;

const PRIVACY_TEXT = `🔒 แจ้งเตือน: ระบบนี้ใช้ AI ในการวิเคราะห์และตอบกลับข้อความ ข้อมูลของคุณจะถูกเก็บรักษาตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)\n\nพิมพ์ "หยุด" เพื่อหยุดรับข้อความอัตโนมัติ\nพิมพ์ "ลบข้อมูล" เพื่อขอลบข้อมูลของคุณ`;

// === MCP state ===
const mcpTools = [];
const mcpToolHandlers = {};

// === Qdrant Config ===
const QDRANT_URL = process.env.QDRANT_URL || "";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || "";
const QDRANT_COLLECTION = "knowledge_base";

// === Payment Keywords ===
const PAYMENT_KEYWORDS = [
  /โอนแล้ว/, /ส่งสลิป/, /จ่ายแล้ว/, /ชำระแล้ว/, /โอนเงิน/,
  /ยอดโอน/, /โอนให้แล้ว/, /จ่ายเงินแล้ว/, /แนบสลิป/, /โอนเรียบร้อย/,
];

// === CEO Plan / Staff ===
const KUNG_STAFF = [
  { id: "E01", name: "แก้ว", role: "แก้ปัญหาลูกค้า", feature: "crm-analysis" },
  { id: "E02", name: "ทองคำ", role: "หาโอกาสขาย", feature: "sales-hunter" },
  { id: "E03", name: "ครูโค้ช", role: "โค้ชทีมงาน", feature: "team-coaching" },
  { id: "E04", name: "อาร์ม", role: "วางกลยุทธ์", feature: "weekly-strategy" },
  { id: "E05", name: "หมอใจ", role: "ดูแลลูกค้า", feature: "health-monitor" },
  { id: "E06", name: "แบงค์", role: "ตรวจสลิป", feature: "payment-guardian" },
  { id: "E07", name: "เมฆ", role: "ติดตามส่งของ", feature: "order-tracker" },
  { id: "E08", name: "ขนุน", role: "ดึงลูกค้ากลับ", feature: "re-engagement" },
  { id: "E09", name: "แนน", role: "แนะนำสินค้า", feature: "upsell-crosssell" },
  { id: "E10", name: "บุ๋ม", role: "สรุปรายวัน", feature: "daily-report" },
  { id: "E11", name: "แต้ม", role: "ให้คะแนน", feature: "lead-scorer" },
  { id: "E12", name: "นาฬิกา", role: "เตือนนัดหมาย", feature: "appointment-reminder" },
  { id: "E13", name: "เปรียบ", role: "วิเคราะห์ราคา", feature: "price-watcher" },
];
const KUNG_TO_FEATURE = Object.fromEntries(KUNG_STAFF.map(s => [s.name, s.feature]));
const KUNG_NAMES = KUNG_STAFF.map(s => s.name);
const KUNG_ID_TO_NAME = Object.fromEntries(KUNG_STAFF.map(s => [s.id, s.name]));

// === [BOSS] Dynamic AI Rules — อ่านจาก MongoDB inject เข้า prompt ===
let _cachedRules = null;
let _cachedRulesAt = 0;
const RULES_CACHE_TTL = 30000;

async function loadActiveRules() {
  if (_cachedRules && Date.now() - _cachedRulesAt < RULES_CACHE_TTL) return _cachedRules;
  try {
    const database = await getDB();
    if (!database) return [];
    const rules = await database.collection("ai_rules")
      .find({ active: true, deletedAt: null })
      .sort({ priority: -1 }).toArray();
    _cachedRules = rules;
    _cachedRulesAt = Date.now();
    return rules;
  } catch { return []; }
}

function buildRulesPrompt(rules) {
  if (!rules || rules.length === 0) return "";
  let prompt = "\n\n=== กฎเพิ่มเติมจาก Admin (ต้องปฏิบัติตามเคร่งครัด) ===\n";
  rules.forEach((r, i) => { prompt += `${i + 1}. ${r.instruction}\n`; });
  return prompt;
}

function clearRulesCache() { _cachedRules = null; _cachedRulesAt = 0; }

// === [BOSS] Message Templates — แก้ข้อความ hardcoded จาก Dashboard ===
let _cachedTemplates = null;
let _cachedTemplatesAt = 0;

async function getTemplate(templateId) {
  if (!_cachedTemplates || Date.now() - _cachedTemplatesAt > 60000) {
    try {
      const database = await getDB();
      if (database) {
        const templates = await database.collection("message_templates").find({ active: true }).toArray();
        _cachedTemplates = Object.fromEntries(templates.map(t => [t.templateId, t.message]));
        _cachedTemplatesAt = Date.now();
      }
    } catch {}
  }
  return _cachedTemplates?.[templateId] || null;
}

function clearTemplateCache() { _cachedTemplates = null; _cachedTemplatesAt = 0; }

module.exports = {
  getDB,
  MESSAGES_COLL,
  AUDIT_LOG_COLL,
  KB_COLL,
  MEMORY_COLL,
  SKILL_LESSONS_COLL,
  DEFAULT_BOT_NAME,
  DEFAULT_PROMPT,
  AB_PROMPTS,
  getABVariant,
  AI_PRICING,
  PAID_AI,
  auditLog,
  trackAICost,
  botConfigCache,
  getBotConfig,
  setBotConfig,
  OPT_OUT_KEYWORDS,
  OPT_IN_KEYWORDS,
  DELETE_KEYWORDS,
  HANDOFF_REGEX,
  DINOCO_PRIVACY_TEXT,
  PRIVACY_TEXT,
  mcpTools,
  mcpToolHandlers,
  QDRANT_URL,
  QDRANT_API_KEY,
  QDRANT_COLLECTION,
  PAYMENT_KEYWORDS,
  KUNG_STAFF,
  KUNG_TO_FEATURE,
  KUNG_NAMES,
  KUNG_ID_TO_NAME,
  getDynamicKey,
  getDynamicKeySync,
  loadAccountKeys,
  seedEnvKeysToMongoDB,
  get _cachedAccountKeys() { return _cachedAccountKeys; },
  loadActiveRules,
  buildRulesPrompt,
  clearRulesCache,
  getTemplate,
  clearTemplateCache,
};
