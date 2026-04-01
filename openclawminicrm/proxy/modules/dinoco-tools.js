/**
 * dinoco-tools.js — AGENT_TOOLS definition, executeTool, KB suggestions
 * V.1.1 — Added claim tracking + Admin LINE alert
 */
const { getDB, DEFAULT_BOT_NAME, mcpTools, mcpToolHandlers, getDynamicKeySync } = require("./shared");
const { callDinocoAPI } = require("./dinoco-cache");

// === Send Claim Alert to Admin LINE Group ===
async function sendClaimAlertToAdmin(claim, statusTh, sourceId) {
  const token = getDynamicKeySync("LINE_CHANNEL_ACCESS_TOKEN");
  const adminGroup = process.env.B2B_ADMIN_GROUP_ID;
  if (!token || !adminGroup) return;

  const ticketNum = claim.wpTicketNumber || "N/A";
  const claimId = claim._id ? String(claim._id) : "";
  const liffId = process.env.B2B_LIFF_ID || process.env.B2F_LIFF_ID || "";
  const wpDomain = process.env.DINOCO_WP_DOMAIN || "dinoco.in.th";
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?page=claim&id=${claimId}` : `https://${wpDomain}/ai-center/?page=claim&id=${claimId}`;

  const flex = {
    type: "flex",
    altText: `ลูกค้าตามเคลม ${ticketNum}`,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical",
        contents: [
          { type: "text", text: "ลูกค้าตามงานเคลม", weight: "bold", size: "lg", color: "#FF6B00" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "md",
        contents: [
          { type: "text", text: `ใบเคลม: ${ticketNum}`, size: "md", weight: "bold" },
          { type: "text", text: `ลูกค้า: ${claim.customerName || "-"}`, size: "sm" },
          { type: "text", text: `สินค้า: ${claim.product || "-"}`, size: "sm" },
          { type: "text", text: `อาการ: ${claim.symptoms || "-"}`, size: "sm", wrap: true },
          { type: "separator" },
          { type: "text", text: `สถานะ: ${statusTh}`, size: "md", weight: "bold", color: "#1A3A5C" },
          { type: "text", text: `เบอร์โทร: ${claim.phone || "-"}`, size: "sm" },
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "button", action: { type: "uri", label: "ดูใบเคลม + อัพเดท", uri: liffUrl }, style: "primary", color: "#FF6B00", height: "sm" },
          ...(claim.phone ? [{ type: "button", action: { type: "uri", label: `โทรลูกค้า ${claim.phone}`, uri: `tel:${claim.phone}` }, style: "secondary", height: "sm" }] : []),
        ],
      },
    },
  };

  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: adminGroup, messages: [flex] }),
  }).catch(e => console.error("[ClaimAlert] LINE push error:", e.message));

  console.log(`[ClaimAlert] Sent to Admin LINE: ${ticketNum} (${statusTh})`);
}

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
      description: "ค้นหาสินค้า DINOCO พร้อมราคา+รูป ต้องเรียกทุกครั้งที่ลูกค้าถามเรื่องสินค้า ราคา รุ่นรถ หรือขอดูรูป ห้ามตอบจากความจำ ต้องเรียก tool นี้เสมอ ผลลัพธ์จะมี img_url ให้ส่งรูปกลับลูกค้า",
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
  {
    type: "function",
    function: {
      name: "dinoco_claim_status",
      description: "เช็คสถานะเคลม/ใบเคลม ใช้เมื่อลูกค้าถามเรื่องเคลม ตามงานเคลม หรือพูดถึงเลขใบเคลม MC-XXXXX",
      parameters: {
        type: "object",
        properties: {
          ticket_number: { type: "string", description: "เลขใบเคลม เช่น MC-05901" },
          phone: { type: "string", description: "เบอร์โทรลูกค้า (ถ้าไม่มีเลขเคลม)" },
        },
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
    // ค้นจาก cached catalog ก่อน (เร็ว + ไม่ timeout)
    const { wpCache } = require("./dinoco-cache");
    const catalog = wpCache.catalog?.data || wpCache.catalog?.stale;
    if (catalog?.products && catalog.products.length > 0) {
      const query = (args.query || "").toLowerCase();
      const cat = (args.category || "").toLowerCase();
      const matched = catalog.products.filter(p => {
        const name = (p.name || "").toLowerCase();
        const sku = (p.sku || "").toLowerCase();
        return name.includes(query) || sku.includes(query) || (cat && name.includes(cat));
      });
      if (matched.length > 0) {
        return matched.slice(0, 10).map((p) =>
          `${p.name} — ราคา ${p.price ? p.price.toLocaleString() + " บาท" : "สอบถาม"} | SKU: ${p.sku}${p.img_url ? " | รูป: " + p.img_url : ""}${p.warranty_years ? " | ประกัน " + p.warranty_years + " ปี" : ""}`
        ).join("\n");
      }
    }
    // Fallback: เรียก WordPress API (ถ้า cache ไม่มี)
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
  if (toolName === "dinoco_claim_status") {
    const database = await getDB();
    if (!database) return "ไม่สามารถเช็คสถานะได้";

    const ticket = args.ticket_number || "";
    const phone = args.phone || "";

    // 1. หาเคลมจาก MongoDB (manual_claims)
    let claim = null;
    if (ticket) {
      claim = await database.collection("manual_claims").findOne({
        $or: [
          { wpTicketNumber: ticket },
          { wpTicketNumber: { $regex: ticket.replace(/[^0-9]/g, ""), $options: "i" } },
        ],
      });
    }
    if (!claim && phone) {
      claim = await database.collection("manual_claims").findOne({ phone: { $regex: phone.replace(/[^0-9]/g, "") } });
    }

    // 2. ถ้าไม่มีใน MongoDB → ถาม WordPress
    if (!claim && ticket) {
      const wpResult = await callDinocoAPI("/claim-manual-status", { ticket_number: ticket });
      if (typeof wpResult !== "string" && wpResult?.found) {
        claim = wpResult.claim;
      }
    }

    if (!claim) {
      return `ไม่พบใบเคลม ${ticket || phone} — ตอบลูกค้าว่า "ขอเช็คเลขใบเคลมอีกครั้งนะคะ หรือแจ้งเบอร์โทรที่ลงทะเบียนค่ะ"`;
    }

    // 3. แปลสถานะเป็นภาษาไทย
    const STATUS_TH = {
      photo_requested: "รอรูปจากลูกค้า", photo_rejected: "รูปไม่ชัด รอถ่ายใหม่",
      photo_received: "ได้รูปแล้ว รอข้อมูลเพิ่ม", info_collecting: "กำลังเก็บข้อมูล",
      info_collected: "ข้อมูลครบ รอทีมตรวจสอบ", admin_reviewed: "ทีมตรวจแล้ว",
      waiting_return_shipment: "รอลูกค้าส่งสินค้ากลับ", return_shipped: "ลูกค้าส่งกลับแล้ว",
      received_at_factory: "โรงงานรับสินค้าแล้ว", parts_shipping: "กำลังส่งอะไหล่ทดแทน",
      return_to_customer: "ส่งสินค้ากลับลูกค้าแล้ว",
      closed_resolved: "เสร็จสิ้น แก้ไขแล้ว", closed_rejected: "ปฏิเสธ ไม่อยู่ในเงื่อนไข",
    };
    const statusTh = STATUS_TH[claim.status] || claim.status;
    const ticketNum = claim.wpTicketNumber || ticket;

    // 4. ส่ง Flex Message ไปกลุ่ม Admin LINE
    sendClaimAlertToAdmin(claim, statusTh, sourceId).catch(() => {});

    return `ใบเคลม: ${ticketNum}\nสถานะ: ${statusTh}\nสินค้า: ${claim.product || "-"}\nอาการ: ${claim.symptoms || "-"}\n\nตอบลูกค้าว่า "ใบเคลม ${ticketNum} สถานะ: ${statusTh} ค่ะ ทีมงานกำลังดูแลอยู่นะคะ"`;
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
