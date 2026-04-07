/**
 * telegram-alert.js — น้องกุ้ง: แจ้งเตือนบอสผ่าน Telegram เมื่อ AI งง
 * V.1.0
 */

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Rate limit: ไม่ส่งเกิน 1 ข้อความ/นาที ต่อ sourceId
const _lastAlert = new Map();
const COOLDOWN_MS = 60 * 1000;

async function sendTelegramAlert(type, data) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;

  // Rate limit per sourceId
  const key = `${type}:${data.sourceId || "global"}`;
  const last = _lastAlert.get(key) || 0;
  if (Date.now() - last < COOLDOWN_MS) return;
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
  };

  const icon = icons[type] || "🔔";
  const platform = data.platform || "unknown";
  const customer = data.customerName || "ลูกค้า";

  let message = `${icon} *น้องกุ้งแจ้ง*\n`;
  message += `━━━━━━━━━━━━━━━\n`;

  switch (type) {
    case "ai_confused":
      message += `AI ตอบไม่ได้ ❗\n`;
      message += `👤 ${customer} (${platform})\n`;
      message += `💬 ลูกค้าถาม: "${(data.customerText || "").substring(0, 100)}"\n`;
      message += `🤖 AI ตอบ: "ขอเช็คข้อมูล..."\n`;
      message += `\n💡 ตอบกลับที่นี่ น้องกุ้งจะส่งต่อให้ลูกค้า + บันทึก KB`;
      break;

    case "customer_unhappy":
      message += `ลูกค้าไม่พอใจ ❗\n`;
      message += `👤 ${customer} (${platform})\n`;
      message += `💬 ลูกค้าพิมพ์: "${(data.customerText || "").substring(0, 100)}"\n`;
      message += `🤖 AI ตอบ: "${(data.aiReply || "").substring(0, 100)}"\n`;
      message += `\n💡 ควรเข้าไปดูแลลูกค้ารายนี้`;
      break;

    case "handoff":
      message += `ลูกค้าขอคุยกับคน ❗\n`;
      message += `👤 ${customer} (${platform})\n`;
      message += `💬 "${(data.customerText || "").substring(0, 100)}"\n`;
      message += `\n💡 เข้าไปตอบที่ Dashboard`;
      break;

    case "hallucination":
      message += `AI หลอน/ตอบผิด — Claude แก้แล้ว\n`;
      message += `👤 ${customer} (${platform})\n`;
      message += `💬 ลูกค้าถาม: "${(data.customerText || "").substring(0, 80)}"\n`;
      message += `❌ Gemini: "${(data.geminiReply || "").substring(0, 80)}"\n`;
      message += `✅ Claude แก้: "${(data.revisedReply || "").substring(0, 80)}"`;
      break;

    case "new_claim":
      message += `เคลมใหม่เปิดเข้าระบบ 📋\n`;
      message += `👤 ${customer} (${platform})\n`;
      message += `🔧 อาการ: ${data.symptoms || "-"}\n`;
      message += `📞 เบอร์: ${data.phone || "-"}\n`;
      message += `🎫 เลข: ${data.ticketNumber || "-"}`;
      break;

    case "ai_wrong":
      message += `ลูกค้าบอก AI ตอบผิด ❗\n`;
      message += `👤 ${customer} (${platform})\n`;
      message += `💬 ลูกค้าพิมพ์: "${(data.customerText || "").substring(0, 100)}"\n`;
      message += `🤖 AI ตอบก่อนหน้า: "${(data.aiReply || "").substring(0, 100)}"`;
      break;

    default:
      message += `${type}\n${JSON.stringify(data).substring(0, 200)}`;
  }

  message += `\n━━━━━━━━━━━━━━━`;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      }),
    });
    console.log(`[Telegram] Alert sent: ${type}`);
  } catch (e) {
    console.error(`[Telegram] Alert failed: ${e.message}`);
  }
}

module.exports = { sendTelegramAlert };
