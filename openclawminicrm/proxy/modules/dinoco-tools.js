/**
 * dinoco-tools.js — AGENT_TOOLS definition, executeTool, KB suggestions
 * V.1.0 — Extracted from index.js monolith
 */
const { getDB, DEFAULT_BOT_NAME, mcpTools, mcpToolHandlers } = require("./shared");
const { callDinocoAPI } = require("./dinoco-cache");

// Forward declarations — set by init()
let searchMessages = null;
let getRecentMessages = null;
let callMCPTool = null;

function init(deps) {
  searchMessages = deps.searchMessages;
  getRecentMessages = deps.getRecentMessages;
  callMCPTool = deps.callMCPTool;
}

const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_history",
      description: "ค้นหาประวัติสนทนาที่เกี่ยวข้องจากฐานข้อมูล ใช้เมื่อต้องการหาว่าเคยคุยเรื่องอะไร",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "คำค้นหา เช่น 'ราคา' 'นัดหมาย' 'สินค้า'" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics",
      description: "ดูคะแนนวิเคราะห์ความรู้สึกและแนวโน้มซื้อของลูกค้า",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "dinoco_product_lookup",
      description: "ค้นหาสินค้า DINOCO (กล่องอลูมิเนียม, แคชบาร์/กันล้ม, แร็ค, ถาดรอง) พร้อมราคาจริงและสต็อก ใช้เมื่อลูกค้าถามเกี่ยวกับสินค้า ราคา หรือรุ่นรถ",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "ชื่อสินค้า + รุ่นรถ เช่น 'แคชบาร์ ADV 350' หรือ 'กล่องข้าง Forza'" },
          category: { type: "string", description: "หมวดหมู่: กล่องข้าง, กล่องหลัง, กันล้ม, แร็ค, ถาดรอง, การ์ดแฮนด์, กระเป๋า" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dinoco_dealer_lookup",
      description: "ค้นหาตัวแทนจำหน่าย DINOCO ตามจังหวัดหรือพื้นที่ ใช้เมื่อลูกค้าถามว่าซื้อได้ที่ไหน หรือมีร้านแถวไหน",
      parameters: {
        type: "object",
        properties: { location: { type: "string", description: "จังหวัดหรือพื้นที่ เช่น 'เชียงใหม่' 'บางนา' 'กทม'" } },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dinoco_warranty_check",
      description: "เช็คสถานะการรับประกันสินค้า DINOCO จากเลข Serial หรือเบอร์โทร ใช้เมื่อลูกค้าถามเรื่องประกัน เคลม หรือส่งเลข serial มา",
      parameters: {
        type: "object",
        properties: {
          serial: { type: "string", description: "เลข serial number เช่น 'DN-12345'" },
          phone: { type: "string", description: "เบอร์โทรที่ลงทะเบียน" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dinoco_kb_search",
      description: "ค้นหาข้อมูลจากคลังความรู้ DINOCO เช่น นโยบายประกัน วัสดุสินค้า วิธีติดตั้ง ค่าจัดส่ง คำถามทั่วไป ใช้เมื่อไม่ใช่เรื่องสินค้า/ตัวแทน/ประกันโดยตรง",
      parameters: {
        type: "object",
        properties: { question: { type: "string", description: "คำถาม เช่น 'ส่งฟรีไหม' 'วัสดุอะไร' 'ติดตั้งยังไง'" } },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dinoco_escalate",
      description: "ส่งเรื่องให้แอดมิน DINOCO (คนจริง) มาตอบแทน ใช้เมื่อ: ลูกค้าขอคุยกับคน, ปัญหาซับซ้อน, ไม่มีข้อมูลในระบบ, ลูกค้าไม่พอใจมาก",
      parameters: {
        type: "object",
        properties: { reason: { type: "string", description: "เหตุผลที่ส่งต่อ เช่น 'ลูกค้าต้องการคุยกับคน' 'ปัญหาสินค้าที่ไม่มีในระบบ'" } },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dinoco_create_lead",
      description: "สร้าง lead อัตโนมัติเมื่อแนะนำตัวแทนจำหน่ายให้ลูกค้าแล้ว + แจ้งตัวแทนผ่าน LINE push ใช้ทุกครั้งที่ลูกค้าสนใจสินค้าและต้องการให้ตัวแทนติดต่อกลับ",
      parameters: {
        type: "object",
        properties: {
          product_interest: { type: "string", description: "สินค้าที่สนใจ เช่น 'แคชบาร์ ADV 350 PRO'" },
          province: { type: "string", description: "จังหวัดของลูกค้า เช่น 'เชียงใหม่'" },
          dealer_name: { type: "string", description: "ชื่อร้านตัวแทนที่แนะนำ" },
          dealer_id: { type: "string", description: "ID ตัวแทน (จาก dealer-lookup)" },
          customer_name: { type: "string", description: "ชื่อลูกค้า (ถ้ารู้)" },
          phone: { type: "string", description: "เบอร์โทรลูกค้า (ถ้าให้มา)" },
        },
        required: ["product_interest", "dealer_name"],
      },
    },
  },
];

// === Execute Tool ===
async function executeTool(toolName, args, sourceId) {
  if (toolName === "search_history") {
    const docs = await searchMessages(sourceId, args.query || "", 5);
    if (docs.length === 0) {
      const recent = await getRecentMessages(sourceId, 5);
      return recent.map((d) => `[${d.role === "assistant" ? "Bot" : d.userName || "User"}] ${d.content}`).join("\n") || "ไม่มีประวัติ";
    }
    return docs.map((d) => `[${d.role === "assistant" ? "Bot" : d.userName || "User"}] ${d.content}`).join("\n");
  }
  if (toolName === "get_analytics") {
    const database = await getDB();
    if (!database) return "ไม่มีข้อมูล";
    const data = await database.collection("chat_analytics").findOne({ sourceId });
    if (!data) return "ยังไม่มีการวิเคราะห์";
    return `Sentiment: ${data.sentiment?.score}/100 (${data.sentiment?.level}) — ${data.sentiment?.reason}\nPurchase: ${data.purchaseIntent?.score}/100 (${data.purchaseIntent?.level}) — ${data.purchaseIntent?.reason}`;
  }
  if (toolName === "dinoco_product_lookup") {
    const result = await callDinocoAPI("/product-lookup", { query: args.query || "", category: args.category || "" });
    if (typeof result === "string") return result;
    if (!result.found) return result.message || "ไม่พบสินค้า";
    return result.products.map((p) =>
      `${p.name} — ราคา ${p.price ? p.price.toLocaleString() + " บาท" : "สอบถาม"} | SKU: ${p.sku}${p.img_url ? " | รูป: " + p.img_url : ""}${p.warranty_years ? " | ประกัน " + p.warranty_years + " ปี" : ""}`
    ).join("\n");
  }
  if (toolName === "dinoco_dealer_lookup") {
    const result = await callDinocoAPI("/dealer-lookup", { location: args.location || "" });
    if (typeof result === "string") return result;
    if (!result.found) return result.message || "ไม่พบตัวแทนในพื้นที่นี้";
    return `ตัวแทนจำหน่ายในพื้นที่ ${result.location}:\n${result.dealers}\n\nวิธีตอบ: ${result.how_to_respond || ""}`;
  }
  if (toolName === "dinoco_warranty_check") {
    const result = await callDinocoAPI("/warranty-check", { serial: args.serial || "", phone: args.phone || "" });
    if (typeof result === "string") return result;
    if (!result.found) return result.message || "ไม่พบข้อมูลประกัน";
    return result.warranties.map((w) =>
      `Serial: ${w.serial} | สินค้า: ${w.product} | สถานะ: ${w.status} | หมดประกัน: ${w.expiry_date || "-"}${w.is_expired ? " (หมดแล้ว)" : " (ยังประกันอยู่)"}`
    ).join("\n");
  }
  if (toolName === "dinoco_kb_search") {
    const result = await callDinocoAPI("/kb-search", { query: args.question || "" });
    if (typeof result === "string") return result;
    if (!result.found) {
      trackUnansweredQuestion(args.question, sourceId).catch(() => {});
      return result.message || "ไม่พบข้อมูลในคลังความรู้ — ขอเช็คข้อมูลกับทีมงานก่อนนะคะ";
    }
    return result.entries.map((e) => `Q: ${e.question}\nA: ${e.facts}\nวิธีตอบ: ${e.action}`).join("\n---\n");
  }
  if (toolName === "dinoco_escalate") {
    const reason = args.reason || "ลูกค้าต้องการความช่วยเหลือ";
    const database = await getDB();
    if (database) {
      await database.collection("alerts").insertOne({
        type: "human_handoff", sourceId, customerName: "", message: reason,
        level: "red", read: false, createdAt: new Date(),
      });
    }
    return `ส่งเรื่องให้แอดมินแล้ว เหตุผล: ${reason} — ตอบลูกค้าว่า "ขอส่งเรื่องให้ทีมงาน DINOCO ช่วยตอบให้ละเอียดนะคะ รอสักครู่ค่ะ"`;
  }
  if (toolName === "dinoco_create_lead") {
    const database = await getDB();
    if (!database) return "ไม่สามารถสร้าง lead ได้ (DB ไม่พร้อม)";
    const meta = await database.collection("groups_meta").findOne({ sourceId });
    const platform = sourceId.startsWith("fb_") ? "facebook" : sourceId.startsWith("ig_") ? "instagram" : "line";
    const customerName = args.customer_name || meta?.groupName || meta?.displayName || "ลูกค้า";
    const leadData = {
      sourceId, platform, customerName,
      productInterest: args.product_interest || "",
      province: args.province || "",
      phone: args.phone || null,
      lineId: null,
      dealerId: args.dealer_id || null,
      dealerName: args.dealer_name || "",
      status: "lead_created",
      nextFollowUpAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      nextFollowUpType: "first_check",
      windowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      otnToken: null, otnTokenUsed: false, closedAt: null,
      history: [{ status: "lead_created", at: new Date(), by: "ai" }],
      createdAt: new Date(), updatedAt: new Date(),
    };
    const result = await database.collection("leads").insertOne(leadData);
    console.log(`[Lead] AI auto-created: ${customerName} → ${args.dealer_name} (${args.product_interest})`);
    if (args.dealer_id || args.dealer_name) {
      await callDinocoAPI("/distributor-notify", {
        distributor_id: args.dealer_id, customer_name: customerName,
        product_interest: args.product_interest, province: args.province || "",
        lead_id: String(result.insertedId),
        message: `ลูกค้าสนใจ: ${args.product_interest} จ.${args.province || "ไม่ระบุ"}`,
        type: "new_lead",
      }).catch(() => {});
      await database.collection("leads").updateOne(
        { _id: result.insertedId },
        { $set: { status: "dealer_notified", updatedAt: new Date() }, $push: { history: { status: "dealer_notified", at: new Date(), by: "ai" } } }
      );
    }
    return `สร้าง lead สำเร็จ แจ้งตัวแทน ${args.dealer_name} แล้ว — ตอบลูกค้าว่า "แจ้งตัวแทน ${args.dealer_name} แล้วค่ะ จะติดต่อพี่กลับเร็วที่สุดนะคะ ${DEFAULT_BOT_NAME} จะติดตามให้จนจบค่ะ"`;
  }
  // MCP tools
  if (mcpToolHandlers[toolName]) {
    return await callMCPTool(toolName, args);
  }
  return "Unknown tool";
}

// === KB Self-Improvement — track unanswered questions ===
async function trackUnansweredQuestion(question, sourceId) {
  const db = await getDB();
  if (!db || !question) return;
  const normalized = question.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.length < 3) return;
  const result = await db.collection("kb_suggestions").updateOne(
    { normalizedQuestion: normalized },
    {
      $set: { lastAskedAt: new Date(), updatedAt: new Date() },
      $inc: { frequency: 1 },
      $setOnInsert: { question, normalizedQuestion: normalized, status: "pending", createdAt: new Date() },
      $addToSet: { sourceIds: sourceId },
    },
    { upsert: true }
  );
  if (result.modifiedCount > 0) {
    const entry = await db.collection("kb_suggestions").findOne({ normalizedQuestion: normalized });
    if (entry && entry.frequency >= 3 && entry.status === "pending") {
      await callDinocoAPI("/kb-suggest", {
        question: entry.question, frequency: entry.frequency,
        source: "fb_ig_chat", source_ids: (entry.sourceIds || []).slice(0, 5),
      }).catch(() => {});
      await db.collection("kb_suggestions").updateOne(
        { _id: entry._id },
        { $set: { status: "submitted", submittedAt: new Date() } }
      );
      console.log(`[KB] Auto-submitted to WP: "${entry.question}" (asked ${entry.frequency}x)`);
    }
  }
}

module.exports = {
  AGENT_TOOLS,
  executeTool,
  trackUnansweredQuestion,
  init,
};
