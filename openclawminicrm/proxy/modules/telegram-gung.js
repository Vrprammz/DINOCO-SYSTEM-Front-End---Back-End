/**
 * telegram-gung.js — น้องกุ้ง: Telegram Bot Command Center
 * V.1.0 — Phase 1+2: Core Commands + Reply Flow + Claims + KB + Analytics
 *
 * Dependencies:
 *   - telegram-alert.js (sendTelegramReply, sendTelegramPhoto)
 *   - platform-response.js (sendLinePush, sendMetaMessage)
 *   - dinoco-cache.js (callDinocoAPI)
 *   - shared.js (getDB, KB_COLL)
 */

const { ObjectId } = require("mongodb");

const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Forward declarations (set by init())
let _sendLinePush, _sendMetaMessage, _sendTelegramReply, _sendTelegramPhoto;
let _callDinocoAPI, _searchKB, _saveMsg, _getDB;

function init(deps) {
  _sendLinePush = deps.sendLinePush;
  _sendMetaMessage = deps.sendMetaMessage;
  _sendTelegramReply = deps.sendTelegramReply;
  _sendTelegramPhoto = deps.sendTelegramPhoto;
  _callDinocoAPI = deps.callDinocoAPI;
  _searchKB = deps.searchKB;
  _saveMsg = deps.saveMsg;
  _getDB = deps.getDB;
}

// === Claim Status Labels ===
const STATUS_TH = {
  photo_requested: "รอรูปจากลูกค้า",
  photo_rejected: "รูปไม่ชัด รอถ่ายใหม่",
  photo_received: "ได้รูปแล้ว รอข้อมูลเพิ่ม",
  info_collecting: "กำลังเก็บข้อมูล",
  info_collected: "ข้อมูลครบ รอทีมตรวจสอบ",
  admin_reviewed: "ทีมตรวจแล้ว",
  pending: "รอตรวจสอบ",
  reviewing: "กำลังตรวจสอบ",
  approved: "อนุมัติแล้ว",
  in_progress: "กำลังดำเนินการ",
  waiting_parts: "รออะไหล่",
  repairing: "กำลังซ่อม",
  quality_check: "ตรวจสอบคุณภาพ",
  completed: "เสร็จสิ้น",
  rejected: "ปฏิเสธ",
  waiting_return_shipment: "รอลูกค้าส่งสินค้ากลับ",
  return_shipped: "ลูกค้าส่งกลับแล้ว",
  received_at_factory: "โรงงานรับสินค้าแล้ว",
  parts_shipping: "กำลังส่งอะไหล่ทดแทน",
  return_to_customer: "ส่งสินค้ากลับลูกค้าแล้ว",
  closed_resolved: "เสร็จสิ้น แก้ไขแล้ว",
  closed_rejected: "ปฏิเสธ ไม่อยู่ในเงื่อนไข",
  cancelled: "ยกเลิก",
};

// === Command Patterns ===
const COMMAND_PATTERNS = [
  // /commands (Telegram-style)
  { pattern: /^\/help$/i, intent: "help" },
  { pattern: /^\/start$/i, intent: "help" },
  { pattern: /^\/status$/i, intent: "system_health" },

  // เคลม (Claims)
  { pattern: /^เคลม\s+(MC-?\d+)/i, intent: "claim_view", extract: ["ticketNumber"] },
  { pattern: /^อนุมัติ\s+(MC-?\d+)(?:\s+(.+))?/i, intent: "claim_approve", extract: ["ticketNumber", "note"] },
  { pattern: /^ปฏิเสธ\s+(MC-?\d+)\s+(.+)/i, intent: "claim_reject", extract: ["ticketNumber", "reason"] },
  { pattern: /^เคลมรอ(?:ตรวจ|review)?$/i, intent: "claim_pending_list" },
  { pattern: /^เคลมวันนี้$/i, intent: "claim_today" },

  // ตอบลูกค้า (Reply)
  { pattern: /^ตอบ\s+(.+?):\s*(.+)/is, intent: "reply_by_name", extract: ["customerName", "message"] },
  { pattern: /^ตอบล่าสุด:\s*(.+)/is, intent: "reply_latest", extract: ["message"] },

  // ตัวแทน/Lead
  { pattern: /^ตัวแทน\s+(.+)/i, intent: "dealer_search", extract: ["query"] },
  { pattern: /^lead\s*วันนี้$/i, intent: "lead_today" },
  { pattern: /^lead\s*รอ(?:ติดต่อ)?$/i, intent: "lead_pending" },

  // Knowledge Base
  { pattern: /^kb\s*เพิ่ม:\s*(.+?)\s*\|\s*(.+)/is, intent: "kb_add", extract: ["title", "content"] },
  { pattern: /^kb\s*ค้น(?:หา)?:\s*(.+)/i, intent: "kb_search", extract: ["query"] },
  { pattern: /^kb\s*(?:ทั้งหมด|สรุป)$/i, intent: "kb_stats" },

  // Dashboard / Analytics
  { pattern: /^แชท\s*วันนี้$/i, intent: "chat_today" },
  { pattern: /^สถิติ\s*(?:ai|เอไอ)$/i, intent: "ai_stats" },
  { pattern: /^เทรน\s*(\d+)$/i, intent: "train_auto", extract: ["count"] },

  // ระบบ
  { pattern: /^สถานะ$/i, intent: "system_health" },
  { pattern: /^ล้างแชท\s+(.+)/i, intent: "clear_chat", extract: ["target"] },
];

// ============================
// Main Handler
// ============================
async function handleTelegramMessage(message) {
  const chatId = message.chat?.id;
  if (String(chatId) !== String(TELEGRAM_CHAT_ID)) {
    console.log(`[Telegram] Unauthorized chat_id: ${chatId}`);
    return;
  }

  const startMs = Date.now();

  try {
    // 1. Reply-to-Alert check
    if (message.reply_to_message) {
      const result = await handleAlertReply(message);
      await reply(chatId, result);
      await logCommand(message.text || "(reply)", "alert_reply", {}, result, Date.now() - startMs);
      return;
    }

    // 2. Photo handling
    if (message.photo && message.photo.length > 0) {
      await reply(chatId, "รับรูปแล้ว แต่ตอนนี้ยังไม่รองรับส่งรูปผ่าน Telegram ค่ะ\nใช้คำสั่ง text ได้เลยนะคะ พิมพ์ /help ดูคำสั่ง");
      return;
    }

    // 3. Command parsing
    const text = (message.text || "").trim();
    if (!text) return;

    const { intent, params } = parseCommand(text);

    // 4. Execute
    const result = await executeCommand(intent, params, message);
    await reply(chatId, result);

    // 5. Log
    await logCommand(text, intent, params, result, Date.now() - startMs);
  } catch (err) {
    console.error(`[Telegram] Handler error:`, err.message);
    await reply(chatId, `เกิดข้อผิดพลาด: ${err.message}`).catch(() => {});
  }
}

// ============================
// Command Parser
// ============================
function parseCommand(text) {
  for (const cmd of COMMAND_PATTERNS) {
    const match = text.match(cmd.pattern);
    if (match) {
      const params = {};
      if (cmd.extract) {
        cmd.extract.forEach((name, i) => {
          params[name] = (match[i + 1] || "").trim();
        });
      }
      return { intent: cmd.intent, params };
    }
  }
  return { intent: "unknown", params: { text } };
}

// ============================
// Command Router
// ============================
async function executeCommand(intent, params) {
  switch (intent) {
    case "help": return buildHelpText();
    case "claim_view": return await handleClaimView(params);
    case "claim_approve": return await handleClaimApprove(params);
    case "claim_reject": return await handleClaimReject(params);
    case "claim_pending_list": return await handleClaimPendingList();
    case "claim_today": return await handleClaimToday();
    case "reply_by_name": return await handleReplyByName(params);
    case "reply_latest": return await handleReplyLatest(params);
    case "dealer_search": return await handleDealerSearch(params);
    case "lead_today": return await handleLeadToday();
    case "lead_pending": return await handleLeadPending();
    case "kb_add": return await handleKBAdd(params);
    case "kb_search": return await handleKBSearch(params);
    case "kb_stats": return await handleKBStats();
    case "chat_today": return await handleChatToday();
    case "ai_stats": return await handleAIStats();
    case "train_auto": return await handleTrainAuto(params);
    case "system_health": return await handleSystemHealth();
    case "clear_chat": return await handleClearChat(params);
    default: return `ไม่เข้าใจคำสั่ง พิมพ์ /help ดูคำสั่งทั้งหมด`;
  }
}

// ============================
// Reply-to-Alert Handler
// ============================
async function handleAlertReply(message) {
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา รอสักครู่";

  const replyMsg = message.reply_to_message;
  // เช็คว่า reply ข้อความจาก bot จริง — ดูจาก message_id ใน telegram_alerts
  const alertMsgId = replyMsg.message_id;
  const alert = await db.collection("telegram_alerts").findOne({ telegramMessageId: alertMsgId });

  if (!alert) return "ไม่พบ alert นี้ในระบบ (อาจหมดอายุแล้ว)";
  if (alert.status === "replied") return "alert นี้ตอบไปแล้ว";

  // เช็ค expiry
  if (alert.expiresAt && new Date() > alert.expiresAt) {
    return "alert นี้เก่าเกิน 24 ชม. แล้ว หากยังต้องการตอบ ใช้คำสั่ง: ตอบ [ชื่อลูกค้า]: [ข้อความ]";
  }

  const bossText = (message.text || "").trim();
  if (!bossText) return "กรุณาพิมพ์ข้อความที่ต้องการส่งให้ลูกค้า";

  // ส่งข้อความกลับลูกค้า
  let sent = false;
  try {
    if (alert.platform === "line") {
      sent = await _sendLinePush(alert.sourceId, [{ type: "text", text: bossText }]);
    } else if (alert.platform === "facebook" || alert.platform === "instagram") {
      const recipientId = alert.sourceId.replace(/^(fb_|ig_)/, "");
      sent = await _sendMetaMessage(recipientId, bossText);
    }
  } catch (e) {
    console.error(`[Telegram] Reply to customer failed:`, e.message);
  }

  // บันทึก messages collection
  if (sent && _saveMsg) {
    await _saveMsg(alert.sourceId, {
      role: "assistant", userName: "บอส (Telegram)",
      content: bossText, messageType: "text",
    }, alert.platform).catch(() => {});
  }

  // อัพเดท alert status
  const updateData = { status: "replied", bossReply: bossText, repliedAt: new Date() };

  // Auto KB ถ้าเป็น ai_confused
  let kbSaved = false;
  if (alert.alertType === "ai_confused" && alert.customerText) {
    try {
      const kbResult = await db.collection("knowledge_base").insertOne({
        title: `Q: ${alert.customerText.substring(0, 80)}`,
        content: bossText,
        category: "boss_answer",
        tags: ["from_telegram", "boss_correction"],
        active: true,
        source: "telegram_reply",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      updateData.kbEntryId = kbResult.insertedId;
      kbSaved = true;
    } catch (e) {
      console.error(`[Telegram] KB save failed:`, e.message);
    }
  }

  await db.collection("telegram_alerts").updateOne(
    { _id: alert._id },
    { $set: updateData },
  );

  if (sent) {
    let msg = `ส่งถึงลูกค้าแล้ว (${alert.platform})`;
    if (kbSaved) msg += " + บันทึก KB";
    return msg;
  }
  return "ส่งไม่สำเร็จ ลองเข้า Dashboard ส่งเอง";
}

// ============================
// Claim Handlers
// ============================
async function handleClaimView(params) {
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา";

  const ticket = normalizeTicket(params.ticketNumber);
  const claim = await findClaim(db, ticket);
  if (!claim) return `ไม่พบเคลม ${ticket} ในระบบ`;

  const statusTh = STATUS_TH[claim.status] || claim.status;
  const daysAgo = Math.floor((Date.now() - new Date(claim.createdAt).getTime()) / 86400000);

  let text = `━━━ ใบเคลม ${claim.wpTicketNumber || ticket} ━━━\n`;
  text += `ลูกค้า: ${claim.customerName || "-"}\n`;
  text += `เบอร์: ${claim.phone || "-"}\n`;
  text += `สินค้า: ${claim.product || "-"}\n`;
  text += `อาการ: ${claim.symptoms || "-"}\n`;
  text += `สถานะ: ${statusTh}\n`;
  text += `เปิดมา: ${daysAgo} วัน (${formatDate(claim.createdAt)})\n`;
  text += `แพลตฟอร์ม: ${claim.platform || "-"}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;

  // ถ้ามี photos → ส่งรูปแยก
  if (claim.photos && claim.photos.length > 0) {
    text += `รูป: ${claim.photos.length} รูป (กำลังส่ง...)\n`;
    // ส่งรูปแยก (async, ไม่ block)
    const chatId = TELEGRAM_CHAT_ID;
    for (const photoUrl of claim.photos.slice(0, 3)) {
      _sendTelegramPhoto(chatId, photoUrl, `เคลม ${claim.wpTicketNumber || ticket}`).catch(() => {});
    }
  }

  // แสดง inline commands
  if (["pending", "reviewing", "info_collected", "photo_received"].includes(claim.status)) {
    text += `\nสั่ง: อนุมัติ ${claim.wpTicketNumber || ticket}`;
    text += `\nสั่ง: ปฏิเสธ ${claim.wpTicketNumber || ticket} [เหตุผล]`;
  }

  return text;
}

async function handleClaimApprove(params) {
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา";

  const ticket = normalizeTicket(params.ticketNumber);
  const claim = await findClaim(db, ticket);
  if (!claim) return `ไม่พบเคลม ${ticket}`;

  const allowedStatuses = ["pending", "reviewing", "info_collected", "photo_received", "admin_reviewed"];
  if (!allowedStatuses.includes(claim.status)) {
    return `เคลม ${ticket} สถานะ "${STATUS_TH[claim.status] || claim.status}" อนุมัติไม่ได้`;
  }

  // 1. อัพเดท MongoDB
  await db.collection("manual_claims").updateOne(
    { _id: claim._id },
    { $set: { status: "approved", approvedBy: "boss_telegram", approvedAt: new Date(), updatedAt: new Date() } },
  );

  // 2. อัพเดท WordPress MCP (ถ้ามี wpClaimId)
  if (claim.wpClaimId && _callDinocoAPI) {
    try {
      await _callDinocoAPI("/claim-manual-update", {
        claim_id: claim.wpClaimId,
        status: "approved",
        note: params.note || "อนุมัติผ่าน Telegram",
      });
    } catch (e) {
      console.error(`[Telegram] WP claim update failed:`, e.message);
    }
  }

  // 3. แจ้งลูกค้า
  const customerMsg = `ใบเคลม ${claim.wpTicketNumber || ticket} อนุมัติแล้วค่ะ ทีมช่างจะติดต่อกลับเร็วที่สุดนะคะ`;
  await notifyCustomer(claim, customerMsg);

  return `อนุมัติ ${claim.wpTicketNumber || ticket} แล้ว + แจ้งลูกค้าเรียบร้อย`;
}

async function handleClaimReject(params) {
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา";

  const ticket = normalizeTicket(params.ticketNumber);
  const reason = params.reason || "ไม่อยู่ในเงื่อนไข";
  const claim = await findClaim(db, ticket);
  if (!claim) return `ไม่พบเคลม ${ticket}`;

  // 1. อัพเดท MongoDB
  await db.collection("manual_claims").updateOne(
    { _id: claim._id },
    { $set: { status: "closed_rejected", rejectedBy: "boss_telegram", rejectedReason: reason, rejectedAt: new Date(), updatedAt: new Date() } },
  );

  // 2. อัพเดท WordPress MCP
  if (claim.wpClaimId && _callDinocoAPI) {
    try {
      await _callDinocoAPI("/claim-manual-update", {
        claim_id: claim.wpClaimId,
        status: "rejected",
        note: `ปฏิเสธ: ${reason}`,
      });
    } catch (e) {
      console.error(`[Telegram] WP claim reject failed:`, e.message);
    }
  }

  // 3. แจ้งลูกค้า
  const customerMsg = `ขออภัยค่ะ ใบเคลม ${claim.wpTicketNumber || ticket} ไม่ผ่านเงื่อนไข เนื่องจาก: ${reason}\nหากมีข้อสงสัยติดต่อทีมงานได้เลยนะคะ`;
  await notifyCustomer(claim, customerMsg);

  return `ปฏิเสธ ${claim.wpTicketNumber || ticket} แล้ว เหตุผล: ${reason}`;
}

async function handleClaimPendingList() {
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา";

  const pendingStatuses = ["pending", "reviewing", "info_collected", "photo_received", "admin_reviewed"];
  const claims = await db.collection("manual_claims")
    .find({ status: { $in: pendingStatuses } })
    .sort({ createdAt: 1 })
    .limit(20)
    .toArray();

  if (claims.length === 0) return "ไม่มีเคลมรอตรวจ";

  let text = `รอตรวจ ${claims.length} ใบ:\n`;
  claims.forEach((c, i) => {
    const daysAgo = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 86400000);
    const dayText = daysAgo === 0 ? "วันนี้" : `${daysAgo} วันแล้ว`;
    text += `${i + 1}. ${c.wpTicketNumber || "?"} - ${c.customerName || "?"} (${c.product || "?"}) - ${dayText}\n`;
  });
  text += `\nดูรายละเอียด: เคลม MC-XXXXX`;
  return text;
}

async function handleClaimToday() {
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา";

  const todayStart = getTodayStart();
  const [newClaims, approved, rejected, pending, inProgress] = await Promise.all([
    db.collection("manual_claims").countDocuments({ createdAt: { $gte: todayStart } }),
    db.collection("manual_claims").countDocuments({ status: "approved", approvedAt: { $gte: todayStart } }),
    db.collection("manual_claims").countDocuments({ status: { $in: ["closed_rejected", "rejected"] }, rejectedAt: { $gte: todayStart } }),
    db.collection("manual_claims").countDocuments({ status: { $in: ["pending", "reviewing", "info_collected", "photo_received", "admin_reviewed"] } }),
    db.collection("manual_claims").countDocuments({ status: { $in: ["approved", "in_progress", "waiting_parts", "repairing", "quality_check"] } }),
  ]);

  return `สรุปเคลมวันนี้ (${formatDate(new Date())}):\n` +
    `- เปิดใหม่: ${newClaims} ใบ\n` +
    `- อนุมัติ: ${approved} ใบ\n` +
    `- ปฏิเสธ: ${rejected} ใบ\n` +
    `- รอตรวจ (backlog): ${pending} ใบ\n` +
    `- กำลังดำเนินการ: ${inProgress} ใบ`;
}

// ============================
// Reply Handlers
// ============================
async function handleReplyByName(params) {
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา";

  const name = params.customerName;
  const msg = params.message;

  // ค้นจาก messages collection (ล่าสุดที่มีชื่อตรง)
  const recentMsg = await db.collection("messages")
    .find({ userName: { $regex: name, $options: "i" }, role: "user" })
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();

  if (recentMsg.length === 0) return `ไม่พบลูกค้าชื่อ "${name}" ในระบบ`;

  // ใช้คนแรก (ล่าสุด)
  const customer = recentMsg[0];
  let sent = false;
  try {
    if (customer.platform === "line") {
      sent = await _sendLinePush(customer.sourceId, [{ type: "text", text: msg }]);
    } else {
      const recipientId = customer.sourceId.replace(/^(fb_|ig_)/, "");
      sent = await _sendMetaMessage(recipientId, msg);
    }
  } catch (e) {
    console.error(`[Telegram] Reply by name failed:`, e.message);
  }

  if (sent && _saveMsg) {
    await _saveMsg(customer.sourceId, {
      role: "assistant", userName: "บอส (Telegram)",
      content: msg, messageType: "text",
    }, customer.platform).catch(() => {});
  }

  return sent
    ? `ส่งถึง ${customer.userName} (${customer.platform}) แล้ว`
    : `ส่งไม่สำเร็จ ลองเข้า Dashboard ส่งเอง`;
}

async function handleReplyLatest(params) {
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา";

  const alert = await db.collection("telegram_alerts")
    .findOne({ status: "pending" }, { sort: { createdAt: -1 } });

  if (!alert) return "ไม่มี alert ค้างอยู่";

  const bossText = params.message;
  let sent = false;
  try {
    if (alert.platform === "line") {
      sent = await _sendLinePush(alert.sourceId, [{ type: "text", text: bossText }]);
    } else {
      const recipientId = alert.sourceId.replace(/^(fb_|ig_)/, "");
      sent = await _sendMetaMessage(recipientId, bossText);
    }
  } catch (e) {
    console.error(`[Telegram] Reply latest failed:`, e.message);
  }

  if (sent && _saveMsg) {
    await _saveMsg(alert.sourceId, {
      role: "assistant", userName: "บอส (Telegram)",
      content: bossText, messageType: "text",
    }, alert.platform).catch(() => {});
  }

  await db.collection("telegram_alerts").updateOne(
    { _id: alert._id },
    { $set: { status: "replied", bossReply: bossText, repliedAt: new Date() } },
  );

  return sent
    ? `ส่งถึงลูกค้าแล้ว (${alert.customerName || "?"}, ${alert.platform})`
    : "ส่งไม่สำเร็จ";
}

// ============================
// Dealer / Lead Handlers
// ============================
async function handleDealerSearch(params) {
  if (!_callDinocoAPI) return "WordPress MCP ไม่พร้อม";
  try {
    const result = await _callDinocoAPI("/dealer-lookup", { location: params.query });
    if (typeof result === "string") return result;
    if (!result?.dealers || result.dealers.length === 0) return `ไม่พบตัวแทนใน "${params.query}"`;

    let text = `ตัวแทน "${params.query}" (${result.dealers.length} ร้าน):\n`;
    result.dealers.slice(0, 10).forEach((d, i) => {
      text += `${i + 1}. ${d.name || d.title} - ${d.phone || "-"} (${d.province || d.area || "-"})\n`;
    });
    return text;
  } catch (e) {
    return `เกิดข้อผิดพลาด: ${e.message}`;
  }
}

async function handleLeadToday() {
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา";

  const todayStart = getTodayStart();
  const [newLeads, contacted, pending, noResponse] = await Promise.all([
    db.collection("leads").countDocuments({ createdAt: { $gte: todayStart } }),
    db.collection("leads").countDocuments({ status: "dealer_contacted", updatedAt: { $gte: todayStart } }),
    db.collection("leads").countDocuments({ status: { $in: ["new", "assigned", "dealer_notified"] } }),
    db.collection("leads").countDocuments({ status: "dealer_no_response" }),
  ]);

  return `Lead วันนี้ (${formatDate(new Date())}):\n` +
    `- ใหม่: ${newLeads} คน\n` +
    `- ตัวแทนติดต่อแล้ว: ${contacted} คน\n` +
    `- รอติดต่อ: ${pending} คน\n` +
    `- ตัวแทนไม่ตอบ: ${noResponse} คน`;
}

async function handleLeadPending() {
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา";

  const leads = await db.collection("leads")
    .find({ status: { $in: ["new", "assigned", "dealer_notified"] } })
    .sort({ createdAt: 1 })
    .limit(15)
    .toArray();

  if (leads.length === 0) return "ไม่มี Lead รอติดต่อ";

  let text = `Lead รอติดต่อ (${leads.length} คน):\n`;
  leads.forEach((l, i) => {
    const hoursAgo = Math.floor((Date.now() - new Date(l.createdAt).getTime()) / 3600000);
    const timeText = hoursAgo < 24 ? `${hoursAgo} ชม.` : `${Math.floor(hoursAgo / 24)} วัน`;
    text += `${i + 1}. ${l.customerName || "?"} - ${l.product || "?"} - ${l.dealerName || "?"} - ${timeText}\n`;
  });
  return text;
}

// ============================
// KB Handlers
// ============================
async function handleKBAdd(params) {
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา";

  const result = await db.collection("knowledge_base").insertOne({
    title: params.title,
    content: params.content,
    category: "boss_answer",
    tags: ["from_telegram"],
    active: true,
    source: "telegram_boss",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return `บันทึก KB แล้ว: ${params.title} (ID: ${result.insertedId})`;
}

async function handleKBSearch(params) {
  if (!_searchKB) return "ระบบค้นหา KB ไม่พร้อม";
  const results = await _searchKB(params.query, 5);
  if (results.length === 0) return `ไม่พบ KB ที่ตรงกับ "${params.query}"`;

  let text = `KB ค้นพบ ${results.length} รายการ:\n`;
  results.forEach((r, i) => {
    text += `${i + 1}. [${r.category || "?"}] ${r.title}\n   ${(r.content || "").substring(0, 100)}\n`;
  });
  return text;
}

async function handleKBStats() {
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา";

  const coll = db.collection("knowledge_base");
  const [total, active, fromTelegram, fromTraining, fromBoss] = await Promise.all([
    coll.countDocuments(),
    coll.countDocuments({ active: true }),
    coll.countDocuments({ source: { $in: ["telegram_reply", "telegram_boss"] } }),
    coll.countDocuments({ source: { $in: ["training_dashboard", "auto-train-v4", "auto_train_kb_fix"] } }),
    coll.countDocuments({ source: { $in: ["boss_answer", "telegram_reply", "telegram_boss"] } }),
  ]);

  return `KB Stats:\n` +
    `- ทั้งหมด: ${total} entries\n` +
    `- Active: ${active}\n` +
    `- จาก Telegram: ${fromTelegram}\n` +
    `- จาก Training: ${fromTraining}\n` +
    `- จาก Boss: ${fromBoss}`;
}

// ============================
// Analytics Handlers
// ============================
async function handleChatToday() {
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา";

  const todayStart = getTodayStart();
  const messages = await db.collection("messages")
    .find({ createdAt: { $gte: todayStart } })
    .project({ platform: 1, role: 1, sourceId: 1 })
    .toArray();

  const line = messages.filter(m => m.platform === "line");
  const fb = messages.filter(m => m.platform === "facebook");
  const ig = messages.filter(m => m.platform === "instagram");
  const aiReplies = messages.filter(m => m.role === "assistant");
  const uniqueLineUsers = new Set(line.filter(m => m.role === "user").map(m => m.sourceId)).size;
  const uniqueFbUsers = new Set(fb.filter(m => m.role === "user").map(m => m.sourceId)).size;
  const uniqueIgUsers = new Set(ig.filter(m => m.role === "user").map(m => m.sourceId)).size;

  const handoffs = await db.collection("alerts")
    .countDocuments({ type: "human_handoff", createdAt: { $gte: todayStart } });

  return `แชทวันนี้ (${formatDate(new Date())}):\n` +
    `- LINE: ${line.length} ข้อความ (${uniqueLineUsers} คน)\n` +
    `- Facebook: ${fb.length} ข้อความ (${uniqueFbUsers} คน)\n` +
    `- Instagram: ${ig.length} ข้อความ (${uniqueIgUsers} คน)\n` +
    `- AI ตอบเอง: ${aiReplies.length} ข้อความ\n` +
    `- ส่งต่อทีมงาน: ${handoffs} ข้อความ`;
}

async function handleAIStats() {
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา";

  const todayStart = getTodayStart();
  const [totalMsg, handoffs, hallucinations, costs] = await Promise.all([
    db.collection("messages").countDocuments({ role: "user", createdAt: { $gte: todayStart } }),
    db.collection("alerts").countDocuments({ type: "human_handoff", createdAt: { $gte: todayStart } }),
    db.collection("telegram_alerts").countDocuments({ alertType: "hallucination", createdAt: { $gte: todayStart } }),
    db.collection("ai_costs").find({ createdAt: { $gte: todayStart } }).toArray(),
  ]);

  const totalCost = costs.reduce((sum, c) => sum + (c.costUSD || 0), 0);
  const aiAnswered = totalMsg - handoffs;
  const accuracy = totalMsg > 0 ? Math.round((aiAnswered / totalMsg) * 100) : 0;

  return `AI Stats วันนี้:\n` +
    `- ข้อความทั้งหมด: ${totalMsg}\n` +
    `- AI ตอบสำเร็จ: ${aiAnswered} (${accuracy}%)\n` +
    `- AI งง/ส่งต่อ: ${handoffs}\n` +
    `- Hallucination detected: ${hallucinations}\n` +
    `- ค่าใช้จ่าย: $${totalCost.toFixed(4)}`;
}

async function handleTrainAuto(params) {
  const count = parseInt(params.count) || 30;
  if (count < 5 || count > 100) return "จำนวนต้องอยู่ระหว่าง 5-100";

  try {
    const res = await fetch(`http://localhost:3000/api/train/auto-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.MCP_ERP_API_KEY || "dinoco" },
      body: JSON.stringify({ count }),
      signal: AbortSignal.timeout(180000), // 3 min timeout
    });
    const data = await res.json();
    if (data.error) return `เทรนผิดพลาด: ${data.error}`;
    return `เทรนเสร็จ ${count} ข้อ:\n` +
      `- PASS: ${data.pass || 0}\n` +
      `- FAIL: ${data.fail || 0}\n` +
      `- ERROR: ${data.error_count || 0}\n` +
      `- Score: ${data.score || "?"}%`;
  } catch (e) {
    return `เทรนผิดพลาด: ${e.message}`;
  }
}

// ============================
// System Handlers
// ============================
async function handleSystemHealth() {
  const db = await _getDB();
  const uptime = process.uptime();
  const uptimeText = `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

  let mongoOk = false;
  let kbCount = 0, pendingAlerts = 0, pendingClaims = 0, activeLeads = 0;
  if (db) {
    try {
      await db.command({ ping: 1 });
      mongoOk = true;
      [kbCount, pendingAlerts, pendingClaims, activeLeads] = await Promise.all([
        db.collection("knowledge_base").countDocuments({ active: true }).catch(() => 0),
        db.collection("telegram_alerts").countDocuments({ status: "pending" }).catch(() => 0),
        db.collection("manual_claims").countDocuments({ status: { $in: ["pending", "reviewing", "info_collected", "photo_received"] } }).catch(() => 0),
        db.collection("leads").countDocuments({ status: { $in: ["new", "assigned", "dealer_notified"] } }).catch(() => 0),
      ]);
    } catch (e) { mongoOk = false; }
  }

  let wpOk = "?";
  if (_callDinocoAPI) {
    try {
      const r = await _callDinocoAPI("/kb-search", { query: "test", limit: 1 });
      wpOk = typeof r !== "string" ? "OK" : "Error";
    } catch { wpOk = "Error"; }
  }

  return `ระบบ DINOCO AI:\n` +
    `- Agent: OK (uptime ${uptimeText})\n` +
    `- MongoDB: ${mongoOk ? "OK" : "ERROR"}\n` +
    `- WordPress MCP: ${wpOk}\n` +
    `- KB entries: ${kbCount}\n` +
    `- Pending alerts: ${pendingAlerts}\n` +
    `- Pending claims: ${pendingClaims}\n` +
    `- Active leads: ${activeLeads}`;
}

async function handleClearChat(params) {
  const target = params.target;
  const db = await _getDB();
  if (!db) return "ระบบฐานข้อมูลมีปัญหา";

  // ค้นหา sourceId จากชื่อ
  const recentMsg = await db.collection("messages")
    .findOne({ userName: { $regex: target, $options: "i" }, role: "user" }, { sort: { createdAt: -1 } });

  if (!recentMsg) return `ไม่พบแชทของ "${target}"`;

  const sourceId = recentMsg.sourceId;
  const deleted = await db.collection("messages").deleteMany({ sourceId });
  // ลบ claim session ด้วย
  await db.collection("manual_claims").deleteMany({ sourceId, status: { $in: ["photo_requested", "photo_rejected", "photo_received", "info_collecting"] } });

  return `ล้างแชท ${recentMsg.userName} (${sourceId}) แล้ว — ลบ ${deleted.deletedCount} ข้อความ`;
}

function buildHelpText() {
  return `น้องกุ้ง Command Center

เคลม:
- เคลม MC-XXXXX → ดูข้อมูล+รูป
- อนุมัติ MC-XXXXX → อนุมัติเคลม
- ปฏิเสธ MC-XXXXX [เหตุผล]
- เคลมรอตรวจ → list รอ review
- เคลมวันนี้ → สรุปวันนี้

ตอบลูกค้า:
- Reply alert → ส่งกลับลูกค้า + บันทึก KB
- ตอบ [ชื่อ]: [ข้อความ]
- ตอบล่าสุด: [ข้อความ]

ตัวแทน / Lead:
- ตัวแทน [จังหวัด]
- Lead วันนี้ / Lead รอติดต่อ

KB:
- KB เพิ่ม: [title] | [content]
- KB ค้นหา: [คำค้น]
- KB ทั้งหมด

สถิติ:
- แชทวันนี้ / สถิติ AI
- เทรน [จำนวน]

ระบบ:
- สถานะ / ล้างแชท [ชื่อ]`;
}

// ============================
// Cron Functions
// ============================
async function sendDailySummary() {
  const db = await _getDB();
  if (!db) return;

  const todayStart = getTodayStart();
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  const [
    totalMessages, handoffs, hallucinations,
    newClaims, pendingClaims, approvedToday,
    newLeads, pendingLeads, noResponseLeads,
    costs, pendingAlerts,
  ] = await Promise.all([
    db.collection("messages").countDocuments({ role: "user", createdAt: { $gte: yesterdayStart, $lt: todayStart } }),
    db.collection("alerts").countDocuments({ type: "human_handoff", createdAt: { $gte: yesterdayStart, $lt: todayStart } }),
    db.collection("telegram_alerts").countDocuments({ alertType: "hallucination", createdAt: { $gte: yesterdayStart, $lt: todayStart } }),
    db.collection("manual_claims").countDocuments({ createdAt: { $gte: yesterdayStart, $lt: todayStart } }),
    db.collection("manual_claims").countDocuments({ status: { $in: ["pending", "reviewing", "info_collected", "photo_received"] } }),
    db.collection("manual_claims").countDocuments({ status: "approved", approvedAt: { $gte: yesterdayStart, $lt: todayStart } }),
    db.collection("leads").countDocuments({ createdAt: { $gte: yesterdayStart, $lt: todayStart } }),
    db.collection("leads").countDocuments({ status: { $in: ["new", "assigned", "dealer_notified"] } }),
    db.collection("leads").countDocuments({ status: "dealer_no_response" }),
    db.collection("ai_costs").find({ createdAt: { $gte: yesterdayStart, $lt: todayStart } }).toArray(),
    db.collection("telegram_alerts").countDocuments({ status: "pending" }),
  ]);

  const totalCost = costs.reduce((sum, c) => sum + (c.costUSD || 0), 0);
  const aiAnswered = totalMessages - handoffs;
  const accuracy = totalMessages > 0 ? Math.round((aiAnswered / totalMessages) * 100) : 0;

  // หาเคลมเก่าสุด
  const oldestPending = await db.collection("manual_claims")
    .findOne({ status: { $in: ["pending", "reviewing", "info_collected", "photo_received"] } }, { sort: { createdAt: 1 } });
  const oldestDays = oldestPending ? Math.floor((Date.now() - new Date(oldestPending.createdAt).getTime()) / 86400000) : 0;

  const uniqueUsers = await db.collection("messages").distinct("sourceId", { role: "user", createdAt: { $gte: yesterdayStart, $lt: todayStart } });

  let text = `สรุปประจำวัน DINOCO (${formatDate(yesterdayStart)})\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `แชท: ${totalMessages} ข้อความ / ${uniqueUsers.length} คน\n`;
  text += `- AI ตอบเอง: ${aiAnswered} (${accuracy}%)\n`;
  text += `- ส่งต่อทีมงาน: ${handoffs}\n\n`;
  text += `เคลม:\n`;
  text += `- เปิดใหม่: ${newClaims}\n`;
  text += `- รอตรวจ: ${pendingClaims}${oldestDays > 0 ? ` (เก่าสุด ${oldestDays} วัน)` : ""}\n`;
  text += `- อนุมัติ: ${approvedToday}\n\n`;
  text += `Lead:\n`;
  text += `- ใหม่: ${newLeads}\n`;
  text += `- รอติดต่อ: ${pendingLeads}\n`;
  text += `- ตัวแทนไม่ตอบ: ${noResponseLeads}\n\n`;
  text += `AI Performance:\n`;
  text += `- Accuracy: ${accuracy}%\n`;
  text += `- Hallucination caught: ${hallucinations}\n`;
  text += `- ค่าใช้จ่าย: $${totalCost.toFixed(4)}\n\n`;

  if (pendingClaims > 0 || pendingLeads > 0 || pendingAlerts > 0) {
    text += `รอดำเนินการ:\n`;
    if (pendingClaims > 0) text += `- เคลมรอตรวจ ${pendingClaims} ใบ\n`;
    if (pendingLeads > 0) text += `- Lead รอติดต่อ ${pendingLeads} คน\n`;
    if (pendingAlerts > 0) text += `- Alert ค้าง ${pendingAlerts} รายการ\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━━`;

  await _sendTelegramReply(TELEGRAM_CHAT_ID, text);
  console.log(`[Telegram] Daily summary sent`);
}

async function checkLeadNoContact() {
  const db = await _getDB();
  if (!db) return;

  const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
  const staleLeads = await db.collection("leads")
    .find({ status: "dealer_no_response", createdAt: { $lte: threeDaysAgo } })
    .limit(10)
    .toArray();

  for (const lead of staleLeads) {
    const daysAgo = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86400000);
    const text = `🔴 ตัวแทน ${lead.dealerName || "?"} ไม่ติดต่อลูกค้า ${daysAgo} วันแล้ว\n` +
      `ลูกค้า: ${lead.customerName || "?"}\n` +
      `สนใจ: ${lead.product || "?"}`;
    await _sendTelegramReply(TELEGRAM_CHAT_ID, text);
  }
}

async function checkClaimAging() {
  const db = await _getDB();
  if (!db) return;

  const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
  const agingClaims = await db.collection("manual_claims")
    .find({
      status: { $in: ["pending", "reviewing", "info_collected", "photo_received"] },
      createdAt: { $lte: twoDaysAgo },
    })
    .limit(10)
    .toArray();

  for (const claim of agingClaims) {
    const daysAgo = Math.floor((Date.now() - new Date(claim.createdAt).getTime()) / 86400000);
    const text = `⏰ เคลม ${claim.wpTicketNumber || "?"} รอตรวจ ${daysAgo} วันแล้ว\n` +
      `ลูกค้า: ${claim.customerName || "?"}\n` +
      `อาการ: ${(claim.symptoms || "?").substring(0, 50)}\n` +
      `สั่ง: เคลม ${claim.wpTicketNumber || "?"}`;
    await _sendTelegramReply(TELEGRAM_CHAT_ID, text);
  }
}

// ============================
// Helpers
// ============================
function normalizeTicket(raw) {
  if (!raw) return "";
  const clean = raw.replace(/[\s-]/g, "").toUpperCase();
  const match = clean.match(/MC(\d+)/);
  if (match) return `MC-${match[1].padStart(5, "0")}`;
  return raw.trim().toUpperCase();
}

async function findClaim(db, ticket) {
  const ticketNum = ticket.replace(/[^0-9MC-]/gi, "");
  return await db.collection("manual_claims").findOne({
    $or: [
      { wpTicketNumber: ticket },
      { wpTicketNumber: ticketNum },
      { wpTicketNumber: { $regex: ticket.replace(/MC-?0*/i, ""), $options: "i" } },
    ],
  });
}

async function notifyCustomer(claim, message) {
  if (!claim.sourceId) return false;
  try {
    if (claim.platform === "line") {
      return await _sendLinePush(claim.sourceId, [{ type: "text", text: message }]);
    } else if (claim.platform === "facebook" || claim.platform === "instagram") {
      const recipientId = claim.sourceId.replace(/^(fb_|ig_)/, "");
      return await _sendMetaMessage(recipientId, message);
    }
  } catch (e) {
    console.error(`[Telegram] Notify customer failed:`, e.message);
  }
  return false;
}

function getTodayStart() {
  const now = new Date();
  const bangkokOffset = 7 * 60 * 60 * 1000;
  const bangkokNow = new Date(now.getTime() + bangkokOffset);
  const bangkokDate = new Date(bangkokNow.getFullYear(), bangkokNow.getMonth(), bangkokNow.getDate());
  return new Date(bangkokDate.getTime() - bangkokOffset);
}

function formatDate(date) {
  if (!date) return "-";
  const d = new Date(date);
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const bangkokOffset = 7 * 60 * 60 * 1000;
  const bkk = new Date(d.getTime() + bangkokOffset);
  return `${bkk.getUTCDate()} ${months[bkk.getUTCMonth()]} ${bkk.getUTCFullYear() + 543}`;
}

async function reply(chatId, text) {
  if (!text) return;
  // ส่ง plain text (ไม่ใช้ Markdown เพื่อป้องกัน parse error)
  return await _sendTelegramReply(chatId, text);
}

async function logCommand(raw, intent, params, result, ms = 0) {
  try {
    const db = await _getDB();
    if (!db) return;
    await db.collection("telegram_command_log").insertOne({
      command: (raw || "").substring(0, 500),
      intent,
      params,
      result: typeof result === "string" ? result.substring(0, 500) : "ok",
      executionMs: ms,
      createdAt: new Date(),
    });
  } catch (e) {
    console.error(`[Telegram] Log failed:`, e.message);
  }
}

module.exports = {
  handleTelegramMessage,
  sendDailySummary,
  checkLeadNoContact,
  checkClaimAging,
  init,
};
