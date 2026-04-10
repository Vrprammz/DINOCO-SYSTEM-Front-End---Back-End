/**
 * telegram-alert.js — น้องกุ้ง: แจ้งเตือนบอสผ่าน Telegram + reply/photo helpers
 * V.2.0 — เพิ่ม sendTelegramReply, sendTelegramPhoto, alert record บันทึก MongoDB
 */

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Forward declaration (set by init)
let _getDB = null;

function init({ getDB }) {
  _getDB = getDB;
}

// Rate limit: ไม่ส่งเกิน 1 ข้อความ/นาที ต่อ sourceId
const _lastAlert = new Map();
const COOLDOWN_MS = 60 * 1000;

/**
 * Escape special characters for Telegram MarkdownV1
 * Telegram Markdown V1 ต้อง escape: _ * [ ` ในข้อความที่ไม่ใช่ formatting
 */
function escapeMarkdown(text) {
  if (!text) return "";
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/`/g, "\\`");
}

/**
 * ส่ง alert ไปหาบอส + บันทึก alert record ใน MongoDB (เพื่อ reply flow)
 * @returns {{ ok: boolean, messageId?: number }}
 */
async function sendTelegramAlert(type, data) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return { ok: false };

  // Rate limit per sourceId
  const key = `${type}:${data.sourceId || "global"}`;
  const last = _lastAlert.get(key) || 0;
  if (Date.now() - last < COOLDOWN_MS) return { ok: false };
  _lastAlert.set(key, Date.now());

  // Cleanup old entries
  if (_lastAlert.size > 200) {
    const now = Date.now();
    for (const [k, v] of _lastAlert) {
      if (now - v > 300000) _lastAlert.delete(k);
    }
  }

  const icons = {
    ai_confused: "🤔",
    customer_unhappy: "😤",
    handoff: "🆘",
    hallucination: "⚠️",
    new_claim: "📋",
    ai_wrong: "❌",
    regression_drift: "📉",
    regression_fail_gate: "🚫",
  };

  const icon = icons[type] || "🔔";
  const platform = data.platform || "unknown";
  const customer = escapeMarkdown(data.customerName || "ลูกค้า");

  let message = `${icon} *น้องกุ้งแจ้ง*\n`;
  message += `━━━━━━━━━━━━━━━\n`;

  switch (type) {
    case "ai_confused":
      message += `AI ตอบไม่ได้ ❗\n`;
      message += `👤 ${customer} (${platform})\n`;
      message += `💬 ลูกค้าถาม: "${escapeMarkdown((data.customerText || "").substring(0, 100))}"\n`;
      message += `🤖 AI ตอบ: "ขอเช็คข้อมูล..."\n`;
      message += `\n💡 ตอบกลับที่นี่ น้องกุ้งจะส่งต่อให้ลูกค้า + บันทึก KB`;
      break;

    case "customer_unhappy":
      message += `ลูกค้าไม่พอใจ ❗\n`;
      message += `👤 ${customer} (${platform})\n`;
      message += `💬 ลูกค้าพิมพ์: "${escapeMarkdown((data.customerText || "").substring(0, 100))}"\n`;
      message += `🤖 AI ตอบ: "${escapeMarkdown((data.aiReply || "").substring(0, 100))}"\n`;
      message += `\n💡 ควรเข้าไปดูแลลูกค้ารายนี้`;
      break;

    case "handoff":
      message += `ลูกค้าขอคุยกับคน ❗\n`;
      message += `👤 ${customer} (${platform})\n`;
      message += `💬 "${escapeMarkdown((data.customerText || "").substring(0, 100))}"\n`;
      message += `\n💡 เข้าไปตอบที่ Dashboard`;
      break;

    case "hallucination":
      message += `AI หลอน/ตอบผิด — Claude แก้แล้ว\n`;
      message += `👤 ${customer} (${platform})\n`;
      message += `💬 ลูกค้าถาม: "${escapeMarkdown((data.customerText || "").substring(0, 80))}"\n`;
      message += `❌ Gemini: "${escapeMarkdown((data.geminiReply || "").substring(0, 80))}"\n`;
      message += `✅ Claude แก้: "${escapeMarkdown((data.revisedReply || "").substring(0, 80))}"`;
      break;

    case "new_claim":
      message += `เคลมใหม่เปิดเข้าระบบ 📋\n`;
      message += `👤 ${customer} (${platform})\n`;
      message += `🔧 อาการ: ${escapeMarkdown(data.symptoms || "-")}\n`;
      message += `📞 เบอร์: ${escapeMarkdown(data.phone || "-")}\n`;
      message += `🎫 เลข: ${escapeMarkdown(data.ticketNumber || "-")}`;
      break;

    case "ai_wrong":
      message += `ลูกค้าบอก AI ตอบผิด ❗\n`;
      message += `👤 ${customer} (${platform})\n`;
      message += `💬 ลูกค้าพิมพ์: "${escapeMarkdown((data.customerText || "").substring(0, 100))}"\n`;
      message += `🤖 AI ตอบก่อนหน้า: "${escapeMarkdown((data.aiReply || "").substring(0, 100))}"`;
      break;

    case "regression_drift":
      message += `Regression drift ตรวจพบ ❗\n`;
      message += `🏷 ${escapeMarkdown(data.bug_id || "-")}: ${escapeMarkdown(data.title || "-")}\n`;
      message += `⚠️ Severity: ${escapeMarkdown(data.severity || "-")}\n`;
      message += `📊 Pass rate 7d: ${data.pass_rate || 0}% (${data.total_runs || 0} runs)\n`;
      message += `\n💡 scenario นี้เคยผ่าน แต่เริ่ม fail — bug อาจกลับมา`;
      break;

    case "regression_fail_gate":
      message += `Regression Guard ปิด deploy 🚫\n`;
      message += `🏷 ${escapeMarkdown(data.bug_id || "-")}: ${escapeMarkdown(data.title || "-")}\n`;
      message += `⚠️ Severity: ${escapeMarkdown(data.severity || "-")}\n`;
      message += `👤 Triggered by: ${escapeMarkdown(data.triggered_by || "-")}\n`;
      message += `💬 Reason: ${escapeMarkdown((data.reason || "").substring(0, 200))}\n`;
      message += `\n💡 แก้ bug ก่อน push`;
      break;

    default:
      message += `${type}\n${escapeMarkdown(JSON.stringify(data).substring(0, 200))}`;
  }

  message += `\n━━━━━━━━━━━━━━━`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      }),
    });
    const responseData = await res.json();
    console.log(`[Telegram] Alert sent: ${type}`);

    // บันทึก alert record สำหรับ reply flow
    const messageId = responseData.ok ? responseData.result?.message_id : null;
    if (messageId && _getDB) {
      try {
        const db = await _getDB();
        if (db) {
          await db.collection("telegram_alerts").insertOne({
            telegramMessageId: messageId,
            alertType: type,
            sourceId: data.sourceId || null,
            platform: data.platform || "unknown",
            customerName: data.customerName || "",
            customerText: data.customerText || "",
            aiReply: data.aiReply || data.revisedReply || "",
            status: "pending",
            bossReply: null,
            repliedAt: null,
            kbEntryId: null,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          });
        }
      } catch (dbErr) {
        console.error(`[Telegram] Alert record save failed:`, dbErr.message);
      }
    }

    return { ok: responseData.ok, messageId };
  } catch (e) {
    console.error(`[Telegram] Alert failed: ${e.message}`);
    return { ok: false };
  }
}

/**
 * ตอบข้อความกลับใน Telegram (plain text, ไม่ใช้ Markdown เพื่อป้องกัน parse error)
 */
async function sendTelegramReply(chatId, text, replyToMessageId) {
  if (!TELEGRAM_TOKEN) return false;
  try {
    const body = {
      chat_id: chatId,
      text: text.substring(0, 4096), // Telegram limit
    };
    if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify(body),
    });
    return (await res.json()).ok === true;
  } catch (e) {
    console.error(`[Telegram] Reply failed:`, e.message);
    return false;
  }
}

/**
 * ส่งรูปภาพใน Telegram
 */
async function sendTelegramPhoto(chatId, photoUrl, caption) {
  if (!TELEGRAM_TOKEN) return false;
  try {
    const body = {
      chat_id: chatId,
      photo: photoUrl,
    };
    if (caption) body.caption = caption.substring(0, 1024); // Telegram caption limit
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify(body),
    });
    return (await res.json()).ok === true;
  } catch (e) {
    console.error(`[Telegram] Photo failed:`, e.message);
    return false;
  }
}

module.exports = { sendTelegramAlert, sendTelegramReply, sendTelegramPhoto, escapeMarkdown, init };
