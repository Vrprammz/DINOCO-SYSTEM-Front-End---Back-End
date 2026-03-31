/**
 * platform-response.js — Send messages to LINE / Facebook / Instagram
 * V.1.0 — Extracted from index.js monolith
 */
const { getDB, MESSAGES_COLL, DEFAULT_BOT_NAME } = require("./shared");

// === Reply Token Cache (LINE Reply API) ===
const replyTokenCache = new Map();
const REPLY_TOKEN_TTL_MS = 25000;

function cacheReplyToken(sourceId, replyToken) {
  if (!replyToken || !sourceId) return;
  replyTokenCache.set(sourceId, {
    token: replyToken,
    expiresAt: Date.now() + REPLY_TOKEN_TTL_MS,
  });
}

function getReplyToken(sourceId) {
  const entry = replyTokenCache.get(sourceId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    replyTokenCache.delete(sourceId);
    return null;
  }
  replyTokenCache.delete(sourceId);
  return entry.token;
}

// Cleanup expired tokens every 60s
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of replyTokenCache) {
    if (now > v.expiresAt) replyTokenCache.delete(k);
  }
}, 60000);

// === LINE: Reply to message (free API) ===
async function replyToLine(replyToken, text, quickReplies) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken) return false;
  try {
    const message = { type: "text", text };
    if (quickReplies && quickReplies.length > 0) {
      message.quickReply = {
        items: quickReplies.map((label) => ({
          type: "action",
          action: { type: "message", label: label.substring(0, 20), text: label },
        })),
      };
    }
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken, messages: [message] }),
    });
    return res.ok;
  } catch (e) {
    console.error("[LINE] Reply error:", e.message);
    return false;
  }
}

// === LINE: Push message (paid, with quick reply support) ===
async function pushToLine(to, text, quickReplies) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !to) return;
  try {
    const message = { type: "text", text };
    if (quickReplies && quickReplies.length > 0) {
      message.quickReply = {
        items: quickReplies.map((label) => ({
          type: "action",
          action: { type: "message", label: label.substring(0, 20), text: label },
        })),
      };
    }
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [message] }),
    });
  } catch (e) {
    console.error("[LINE] Push error:", e.message);
  }
}

// === LINE: Send Push (array of message objects) ===
async function sendLinePush(to, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) { console.warn("[Inbox] LINE_CHANNEL_ACCESS_TOKEN not set"); return false; }
  if (messages.length === 0) return false;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[Inbox] LINE push error:", res.status, errText);
      return false;
    }
    console.log("[Inbox] Push API OK");
    return true;
  } catch (e) {
    console.error("[Inbox] sendLinePush error:", e.message);
    return false;
  }
}

// === LINE: Send Reply (array of message objects) ===
async function sendLineReply(replyToken, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken) return false;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken, messages }),
    });
    if (res.ok) {
      console.log("[Inbox] Reply API OK (free!)");
      return true;
    }
    console.log(`[Inbox] Reply API failed (${res.status}) — fallback to Push`);
    return false;
  } catch (e) {
    console.log("[Inbox] Reply API error:", e.message, "— fallback to Push");
    return false;
  }
}

// === Build LINE message objects ===
function buildLineMessages({ text, imageUrl, videoUrl, audioUrl, audioDuration, location, sticker, template, flex, quickReply }) {
  const messages = [];
  if (text) messages.push({ type: "text", text });
  if (imageUrl) messages.push({ type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl });
  if (videoUrl) messages.push({ type: "video", originalContentUrl: videoUrl, previewImageUrl: imageUrl || videoUrl });
  if (audioUrl) messages.push({ type: "audio", originalContentUrl: audioUrl, duration: audioDuration || 60000 });
  if (location && location.latitude && location.longitude) {
    messages.push({ type: "location", title: location.title || "ตำแหน่งที่ตั้ง", address: location.address || "", latitude: location.latitude, longitude: location.longitude });
  }
  if (sticker && sticker.packageId && sticker.stickerId) {
    messages.push({ type: "sticker", packageId: String(sticker.packageId), stickerId: String(sticker.stickerId) });
  }
  if (template) messages.push({ type: "template", altText: template.altText || "ข้อความ template", template: template.content || template });
  if (flex) messages.push({ type: "flex", altText: flex.altText || "ข้อความ Flex", contents: flex.contents || flex });
  if (quickReply && quickReply.items && messages.length > 0) {
    messages[messages.length - 1].quickReply = { items: quickReply.items };
  }
  return messages;
}

// === LINE: Reply-first then Push-fallback strategy ===
async function sendLineMessage(sourceId, payload) {
  const messages = buildLineMessages(payload);
  if (messages.length === 0) return { sent: false, method: "none" };
  const cachedToken = getReplyToken(sourceId);
  if (cachedToken) {
    const replySent = await sendLineReply(cachedToken, messages);
    if (replySent) return { sent: true, method: "reply" };
  }
  const pushSent = await sendLinePush(sourceId, messages);
  return { sent: pushSent, method: pushSent ? "push" : "failed" };
}

// === Meta (Facebook/Instagram): Send text message ===
async function sendMetaMessage(recipientId, text) {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch("https://graph.facebook.com/v19.0/me/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
    });
    return res.ok;
  } catch (e) {
    console.error("[Meta] sendMetaMessage error:", e.message);
    return false;
  }
}

// === Meta: Send image attachment ===
async function sendMetaImage(recipientId, imageUrl) {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token || !imageUrl) return false;
  try {
    const res = await fetch("https://graph.facebook.com/v19.0/me/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { attachment: { type: "image", payload: { url: imageUrl, is_reusable: true } } },
      }),
    });
    return res.ok;
  } catch (e) {
    console.error("[Meta] sendMetaImage error:", e.message);
    return false;
  }
}

// === LINE: Product recommendation (Flex/Generic Template) ===
async function sendProductRecommendation(recipientId, platform, products) {
  if (!products || products.length === 0) return;
  if (platform === "facebook") {
    const elements = products.slice(0, 3).map((p) => ({
      title: p.name || "สินค้า DINOCO",
      subtitle: `ราคา ${p.price ? p.price.toLocaleString() + " บาท" : "สอบถาม"} | ประกัน ${p.warranty_years || 3} ปี`,
      image_url: p.img_url || undefined,
      buttons: [{ type: "web_url", url: "https://www.dinoco.co.th", title: "ดูรายละเอียด" }],
    }));
    const token = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!token) return;
    await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { attachment: { type: "template", payload: { template_type: "generic", elements } } },
      }),
    }).catch(() => {});
  } else if (platform === "instagram") {
    for (const p of products.slice(0, 2)) {
      if (p.img_url) await sendMetaImage(recipientId, p.img_url).catch(() => {});
      await sendMetaMessage(recipientId, `${p.name}\nราคา ${p.price ? p.price.toLocaleString() + " บาท" : "สอบถาม"}\nประกัน ${p.warranty_years || 3} ปี`);
    }
  } else if (platform === "line") {
    const bubbles = products.slice(0, 3).map((p) => ({
      type: "bubble", size: "micro",
      hero: p.img_url ? { type: "image", url: p.img_url, size: "full", aspectRatio: "4:3", aspectMode: "cover" } : undefined,
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: p.name || "สินค้า DINOCO", weight: "bold", size: "sm", wrap: true },
          { type: "text", text: `${p.price ? p.price.toLocaleString() + " บาท" : "สอบถาม"}`, color: "#FF6B00", size: "lg", weight: "bold" },
          { type: "text", text: `ประกัน ${p.warranty_years || 3} ปี`, size: "xs", color: "#888888" },
        ],
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [{ type: "button", action: { type: "uri", label: "ดูรายละเอียด", uri: "https://www.dinoco.co.th" }, style: "primary", color: "#FF6B00", height: "sm" }],
      },
    }));
    const flexMsg = {
      type: "flex", altText: `สินค้า DINOCO ${products.length} รายการ`,
      contents: bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles },
    };
    await sendLinePush(recipientId, [flexMsg]).catch(() => {});
  }
}

// === Dealer contact quick replies ===
async function sendDealerContactOptions(recipientId, platform, dealerName) {
  const text = `ตัวแทน ${dealerName} พร้อมให้บริการค่ะ\nสะดวกแบบไหนคะ?`;
  const quickReplies = [
    { content_type: "text", title: "ให้ร้านโทรกลับ", payload: "dealer_call_back" },
    { content_type: "text", title: "ขอเบอร์ร้าน", payload: "get_dealer_phone" },
    { content_type: "text", title: "แอดไลน์ร้าน", payload: "get_dealer_line" },
    { content_type: "text", title: "ดูแผนที่ร้าน", payload: "get_dealer_map" },
  ];
  if (platform === "facebook" || platform === "instagram") {
    const token = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!token) return;
    await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text, quick_replies: quickReplies } }),
    }).catch(() => {});
  }
}

module.exports = {
  cacheReplyToken,
  getReplyToken,
  replyToLine,
  pushToLine,
  sendLinePush,
  sendLineReply,
  buildLineMessages,
  sendLineMessage,
  sendMetaMessage,
  sendMetaImage,
  sendProductRecommendation,
  sendDealerContactOptions,
};
