/**
 * ai-chat.js — AI providers, Gemini/Claude with tools, DINOCO AI wrapper
 * V.1.1 — Boss Command: inject dynamic rules into AI prompt
 */
const { getDB, MESSAGES_COLL, DEFAULT_BOT_NAME, DEFAULT_PROMPT, AB_PROMPTS, getABVariant, AI_PRICING, PAID_AI, trackAICost, getBotConfig, mcpTools, getDynamicKeySync, loadActiveRules, buildRulesPrompt } = require("./shared");
const { cleanForAI } = require("../middleware/auth");

// Forward declarations — set by init()
let searchMessages = null;
let getRecentMessages = null;
let executeTool = null;
let AGENT_TOOLS = null;
let saveMsg = null;
let buildAIContext = null;
let createAiHandoffAlert = null;
let replyToLine = null;
let sendMetaMessage = null;
let sendMetaImage = null;
let sendLinePush = null;

function init(deps) {
  searchMessages = deps.searchMessages;
  getRecentMessages = deps.getRecentMessages;
  executeTool = deps.executeTool;
  AGENT_TOOLS = deps.AGENT_TOOLS;
  saveMsg = deps.saveMsg;
  buildAIContext = deps.buildAIContext;
  createAiHandoffAlert = deps.createAiHandoffAlert;
  replyToLine = deps.replyToLine;
  sendMetaMessage = deps.sendMetaMessage;
  sendMetaImage = deps.sendMetaImage;
  sendLinePush = deps.sendLinePush;
}

// === Lightweight AI Call — fallback chain ===
const lightAICooldown = {};

// === Auto-discover OpenRouter free models ===
let discoveredFreeModels = [];
let lastDiscovery = 0;

async function discoverFreeModels() {
  const key = getDynamicKeySync("OPENROUTER_API_KEY");
  if (!key) return;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await res.json();
    if (!data.data) return;
    const free = data.data.filter((m) => {
      const p = m.pricing || {};
      const isFree = parseFloat(p.prompt || "1") === 0 && parseFloat(p.completion || "1") === 0;
      const bigEnough = (m.context_length || 0) >= 8000;
      const isChat = m.id && !m.id.includes("embed") && !m.id.includes("tts") && !m.id.includes("image");
      return isFree && bigEnough && isChat;
    });
    free.sort((a, b) => (b.context_length || 0) - (a.context_length || 0));
    discoveredFreeModels = free.slice(0, 10).map((m) => ({
      id: m.id, name: m.name || m.id, context_length: m.context_length || 0,
    }));
    lastDiscovery = Date.now();
    console.log(`[FreeAI] Discovered ${discoveredFreeModels.length} free models:`, discoveredFreeModels.map((m) => m.id.split("/").pop()).join(", "));
  } catch (e) {
    console.log("[FreeAI] discover error:", e.message);
  }
}

// Start discovery + repeat hourly
discoverFreeModels();
setInterval(discoverFreeModels, 3600000);

function getOpenRouterFreeProviders() {
  const key = getDynamicKeySync("OPENROUTER_API_KEY");
  if (!key || discoveredFreeModels.length === 0) {
    return [
      { name: "OR-Nemotron", url: "https://openrouter.ai/api/v1/chat/completions", key, model: "nvidia/nemotron-3-super-120b-a12b:free" },
      { name: "OR-DeepSeek", url: "https://openrouter.ai/api/v1/chat/completions", key, model: "deepseek/deepseek-chat-v3-0324:free" },
      { name: "OR-Llama", url: "https://openrouter.ai/api/v1/chat/completions", key, model: "meta-llama/llama-3.3-70b-instruct:free" },
      { name: "OR-StepFlash", url: "https://openrouter.ai/api/v1/chat/completions", key, model: "stepfun/step-3.5-flash:free" },
    ];
  }
  return discoveredFreeModels.map((m) => ({
    name: "OR-" + m.id.split("/").pop().substring(0, 15),
    url: "https://openrouter.ai/api/v1/chat/completions", key, model: m.id,
  }));
}

async function callLightAI(messages, { json = false, maxTokens = 500, timeout = 15000 } = {}) {
  const providers = [
    ...getOpenRouterFreeProviders(),
    { name: "SambaNova", url: "https://api.sambanova.ai/v1/chat/completions", key: process.env.SAMBANOVA_API_KEY, model: "Qwen3-235B" },
    ...(PAID_AI ? [
      { name: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY, model: "llama-3.3-70b-versatile" },
      { name: "Cerebras", url: "https://api.cerebras.ai/v1/chat/completions", key: process.env.CEREBRAS_API_KEY, model: "qwen-3-235b-a22b-instruct-2507" },
    ] : []),
  ].filter((p) => p.key);

  for (const p of providers) {
    if (lightAICooldown[p.name] && Date.now() < lightAICooldown[p.name]) continue;
    try {
      const body = { model: p.model, messages, max_tokens: maxTokens };
      if (json) body.response_format = { type: "json_object" };
      const res = await fetch(p.url, {
        method: "POST", signal: AbortSignal.timeout(timeout),
        headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.choices?.[0]?.message?.content) {
        trackAICost({ provider: p.name, model: p.model, feature: json ? "light-ai-json" : "light-ai",
          inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0 });
        const pricing = AI_PRICING[p.name];
        if (pricing && (pricing.input > 0 || pricing.output > 0)) {
          lightAICooldown[p.name] = Date.now() + 300000;
        }
        return data.choices[0].message.content;
      }
      if (data.error) {
        const errMsg = data.error.message || JSON.stringify(data.error).substring(0, 100);
        if (errMsg.includes("rate") || errMsg.includes("limit") || errMsg.includes("429") || data.error.code === 429) {
          lightAICooldown[p.name] = Date.now() + 1800000;
        } else if (errMsg.includes("not found") || errMsg.includes("not available") || errMsg.includes("invalid model")) {
          lightAICooldown[p.name] = Date.now() + 3600000;
        } else {
          lightAICooldown[p.name] = Date.now() + 300000;
        }
      }
    } catch (e) {
      lightAICooldown[p.name] = Date.now() + 600000;
    }
  }

  // Last resort: Gemini
  const googleKey = getDynamicKeySync("GOOGLE_API_KEY");
  if (googleKey && (!lightAICooldown["Gemini"] || Date.now() >= lightAICooldown["Gemini"])) {
    try {
      const systemMsg = messages.find((m) => m.role === "system");
      const userMsg = messages.find((m) => m.role === "user");
      const text = (systemMsg ? systemMsg.content + "\n\n" : "") + (userMsg?.content || "");
      const genConfig = json ? { responseMimeType: "application/json" } : {};
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${googleKey}`,
        {
          method: "POST", signal: AbortSignal.timeout(timeout),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: genConfig }),
        }
      );
      const data = await res.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        trackAICost({ provider: "Gemini", model: "gemini-2.0-flash", feature: json ? "light-ai-json" : "light-ai",
          inputTokens: data.usageMetadata?.promptTokenCount || 0, outputTokens: data.usageMetadata?.candidatesTokenCount || 0 });
        return data.candidates[0].content.parts[0].text;
      }
      if (data.error) lightAICooldown["Gemini"] = Date.now() + 1800000;
    } catch (e) {
      lightAICooldown["Gemini"] = Date.now() + 600000;
    }
  }

  console.log("[LightAI] All providers unavailable");
  return null;
}

// === AI Provider — callProvider (fallback chain for agentic loop) ===
const providerCooldown = {};

async function callProvider(messages, tools) {
  const providers = [
    ...getOpenRouterFreeProviders(),
    { name: "SambaNova", url: "https://api.sambanova.ai/v1/chat/completions", key: process.env.SAMBANOVA_API_KEY, model: "Qwen3-235B" },
    ...(PAID_AI ? [
      { name: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY, model: "llama-3.3-70b-versatile" },
      { name: "Cerebras", url: "https://api.cerebras.ai/v1/chat/completions", key: process.env.CEREBRAS_API_KEY, model: "qwen-3-235b-a22b-instruct-2507" },
    ] : []),
  ].filter((p) => p.key);

  for (const provider of providers) {
    const cooldownUntil = providerCooldown[provider.name] || 0;
    if (Date.now() < cooldownUntil) continue;
    try {
      const body = { model: provider.model, messages, max_tokens: 800 };
      if (tools && tools.length > 0) body.tools = tools;
      const res = await fetch(provider.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        const errMsg = JSON.stringify(data.error).substring(0, 100);
        if (errMsg.includes("rate") || errMsg.includes("limit") || errMsg.includes("429")) {
          providerCooldown[provider.name] = Date.now() + 1800000;
        }
        continue;
      }
      const choice = data.choices?.[0];
      if (choice) {
        const usage = data.usage || {};
        trackAICost({ provider: provider.name, model: provider.model, feature: tools?.length ? "chat-tools" : "chat-reply",
          inputTokens: usage.prompt_tokens || 0, outputTokens: usage.completion_tokens || 0 });
        const pricing = AI_PRICING[provider.name];
        if (pricing && (pricing.input > 0 || pricing.output > 0)) {
          providerCooldown[provider.name] = Date.now() + 300000;
        }
        return { provider: provider.name, model: provider.model, message: choice.message, finishReason: choice.finish_reason,
          usage: { prompt: usage.prompt_tokens || 0, completion: usage.completion_tokens || 0, total: usage.total_tokens || 0 } };
      }
    } catch (e) {
      console.error(`[AI] ${provider.name} error:`, e.message);
    }
  }
  return null;
}

// === [DINOCO] Output Sanitization ===
function sanitizeAIOutput(text) {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/ราคา\s*(ต้นทุน|dealer|ตัวแทน|ทุน|wholesale)[^\n]*/gi, "[สอบถามตัวแทนจำหน่ายค่ะ]")
    .replace(/(ส่วนลด|discount|margin|กำไร|profit)[^\n]*/gi, "[DINOCO เป็นนโยบาย One Price ค่ะ]")
    .replace(/(สต็อก|stock|คงเหลือ|จำนวน\s*\d+\s*ชิ้น|หมดสต็อก)[^\n]*/gi, "[สอบถามตัวแทนจำหน่ายค่ะ]")
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "[REDACTED]")
    .replace(/https?:\/\/(localhost|127\.0\.0\.1|internal|admin)[^\s]*/gi, "[REDACTED]");
}

// === Gemini Flash with Function Calling ===
async function callGeminiWithTools(systemPrompt, userMessage, tools, sourceId) {
  const apiKey = getDynamicKeySync("GOOGLE_API_KEY");
  if (!apiKey) return null;
  const functionDeclarations = tools.map((t) => ({
    name: t.function.name, description: t.function.description, parameters: t.function.parameters,
  }));

  // ส่ง conversation history ให้ Gemini จำ context ได้
  const contents = [];
  try {
    const recentMsgs = await getRecentMessages(sourceId, 6);
    for (const m of recentMsgs.reverse()) {
      const role = m.role === "assistant" ? "model" : "user";
      if (m.content && m.content.length > 0 && m.content !== "[รูปภาพ]") {
        contents.push({ role, parts: [{ text: m.content }] });
      }
    }
  } catch {}
  contents.push({ role: "user", parts: [{ text: userMessage }] });
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    tools: [{ functionDeclarations }],
    generationConfig: { temperature: 0.35, maxOutputTokens: 2048 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      if (data.usageMetadata) {
        trackAICost({ provider: "Gemini-Tools", model: "gemini-2.0-flash", feature: "chat-with-tools",
          inputTokens: data.usageMetadata.promptTokenCount || 0, outputTokens: data.usageMetadata.candidatesTokenCount || 0, sourceId });
      }
      const funcCall = parts.find((p) => p.functionCall);
      if (funcCall) {
        const { name, args } = funcCall.functionCall;
        console.log(`[Gemini] Tool call: ${name}(${JSON.stringify(args).substring(0, 80)})`);
        const toolResult = await executeTool(name, args || {}, sourceId);
        contents.push({ role: "model", parts: [{ functionCall: { name, args: args || {} } }] });
        contents.push({ role: "user", parts: [{ functionResponse: { name, response: { result: toolResult } } }] });
        body.contents = contents;
        continue;
      }
      const textReply = parts.find((p) => p.text)?.text;
      return textReply || null;
    } catch (e) {
      console.error("[Gemini] Error:", e.message);
      return null;
    }
  }
  return null;
}

// === Claude Sonnet with Tool Use ===
async function callClaudeWithTools(systemPrompt, userMessage, tools, sourceId) {
  const apiKey = getDynamicKeySync("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  const claudeTools = tools.map((t) => ({
    name: t.function.name, description: t.function.description, input_schema: t.function.parameters,
  }));

  // ส่ง conversation history ให้ Claude จำ context ได้
  const messages = [];
  try {
    const recentMsgs = await getRecentMessages(sourceId, 6);
    for (const m of recentMsgs.reverse()) {
      const role = m.role === "assistant" ? "assistant" : "user";
      if (m.content && m.content.length > 0 && m.content !== "[รูปภาพ]") {
        messages.push({ role, content: m.content });
      }
    }
  } catch {}
  messages.push({ role: "user", content: userMessage });
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 2048, temperature: 0.35,
          system: systemPrompt, tools: claudeTools, messages,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.usage) {
        trackAICost({ provider: "Claude-Sonnet", model: "claude-sonnet-4-20250514", feature: "chat-with-tools",
          inputTokens: data.usage.input_tokens || 0, outputTokens: data.usage.output_tokens || 0, sourceId });
      }
      const toolUse = data.content?.find((c) => c.type === "tool_use");
      if (toolUse) {
        const toolResult = await executeTool(toolUse.name, toolUse.input || {}, sourceId);
        messages.push({ role: "assistant", content: data.content });
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: toolResult }] });
        continue;
      }
      return data.content?.find((c) => c.type === "text")?.text || null;
    } catch (e) {
      console.error("[Claude] Error:", e.message);
      return null;
    }
  }
  return null;
}

// === DINOCO AI — Gemini primary, Claude fallback ===
async function callDinocoAI(systemPrompt, userMessage, sourceId) {
  const geminiReply = await callGeminiWithTools(systemPrompt, userMessage, AGENT_TOOLS, sourceId);
  if (geminiReply) return sanitizeAIOutput(geminiReply);
  console.log("[AI] Gemini failed -> trying Claude Sonnet...");
  const claudeReply = await callClaudeWithTools(systemPrompt, userMessage, AGENT_TOOLS, sourceId);
  if (claudeReply) return sanitizeAIOutput(claudeReply);
  console.error("[AI] Both Gemini + Claude failed");
  return "ขอเช็คข้อมูลกับทีมงานก่อนนะคะ รอสักครู่ค่ะ 🙏";
}

// === AI Reply to LINE ===
async function aiReplyToLine(event, sourceId, userName, text, config) {
  const startTime = Date.now();
  const contextDocs = await searchMessages(sourceId, text).catch(() => []);
  const contextStr = contextDocs.slice(0, 5)
    .map((d) => `[${d.role === "assistant" ? config.botName || DEFAULT_BOT_NAME : d.userName || "User"}] ${d.content}`)
    .join("\n");
  const variant = getABVariant(sourceId);
  const abInstruction = AB_PROMPTS[variant];
  const rules = await loadActiveRules();
  const rulesPrompt = buildRulesPrompt(rules);
  const systemPrompt = `${config.systemPrompt || DEFAULT_PROMPT}

ข้อห้ามเด็ดขาด: ห้ามบอกราคาต้นทุน/ราคา dealer/ส่วนลด/จำนวนสต็อก ถ้าถูกถามให้ตอบ "สอบถามตัวแทนจำหน่ายค่ะ"
DINOCO เป็น One Price ไม่มีโปรโมชั่น
สไตล์: ${abInstruction}
ประวัติสนทนา:\n${contextStr || "(ไม่มี)"}${rulesPrompt}`;

  const reply = await callDinocoAI(systemPrompt, cleanForAI(text), sourceId);
  if (/รอทีมงาน|ขอเช็คข้อมูล/.test(reply)) {
    await createAiHandoffAlert(sourceId, userName, text);
  }
  const sent = await replyToLine(event.replyToken, reply);
  if (sent) {
    await saveMsg(sourceId, {
      role: "assistant", userName: config.botName || DEFAULT_BOT_NAME,
      content: reply, messageType: "text", isAiReply: true, abVariant: variant,
    }, "line");
    console.log(`[AI-Reply] LINE replied in ${Date.now() - startTime}ms: ${reply.substring(0, 50)}`);
  }
}

// === AI Reply to Facebook/Instagram ===
async function aiReplyToMeta(senderId, text, sourceId, platform) {
  const startTime = Date.now();
  const contextDocs = await searchMessages(sourceId, text).catch(() => []);
  const contextStr = contextDocs.slice(0, 5)
    .map((d) => `[${d.role === "assistant" ? DEFAULT_BOT_NAME : d.userName || "User"}] ${d.content}`)
    .join("\n");
  const variant = getABVariant(sourceId);
  const abInstruction = AB_PROMPTS[variant];
  const platformNote = platform === "instagram"
    ? "ตอบเป็น text เท่านั้น (IG ไม่รองรับ card/template) ถ้าจะส่งรูปให้แยกข้อความ"
    : "สามารถแนะนำสินค้าพร้อมรูปได้";
  const metaRules = await loadActiveRules();
  const metaRulesPrompt = buildRulesPrompt(metaRules);
  const systemPrompt = `${DEFAULT_PROMPT}

ข้อห้ามเด็ดขาด: ห้ามบอกราคาต้นทุน/ราคา dealer/ส่วนลด/จำนวนสต็อก ถ้าถูกถามให้ตอบ "สอบถามตัวแทนจำหน่ายค่ะ"
DINOCO เป็น One Price ไม่มีโปรโมชั่น ถ้าลูกค้าถามลด ตอบ "DINOCO เป็นนโยบาย One Price ค่ะ ไม่มีโปรโมชั่น ซื้อไปมั่นใจได้ค่ะ"
Platform: ${platform} — ${platformNote}
สไตล์: ${abInstruction}
ประวัติสนทนา:\n${contextStr || "(ไม่มี)"}${metaRulesPrompt}`;

  const reply = await callDinocoAI(systemPrompt, cleanForAI(text), sourceId);
  if (/รอทีมงาน|ขอเช็คข้อมูล/.test(reply)) {
    await createAiHandoffAlert(sourceId, senderId, text, platform);
  }

  // ตรวจหา image URL ใน reply → ส่งเป็นรูปจริง แยกจาก text
  console.log(`[AI-Debug] reply length=${reply.length} hasImageUrl=${/https?:\/\/.*\.(png|jpg|jpeg)/i.test(reply)}`);
  const imgUrlRegex = /(https?:\/\/[^\s\]\)]+\.(?:png|jpg|jpeg|gif|webp))/gi;
  const imageUrls = reply.match(imgUrlRegex) || [];
  let cleanReply = reply;
  for (const url of imageUrls) {
    // ลบ URL + markdown link syntax ออกจาก text
    cleanReply = cleanReply.replace(new RegExp(`\\[?[^\\]]*\\]?\\(?${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)?`, 'g'), '').trim();
    cleanReply = cleanReply.replace(url, '').trim();
  }
  // ลบ markdown artifacts ที่เหลือ
  cleanReply = cleanReply.replace(/\[\]\(\)/g, '').replace(/\n{3,}/g, '\n\n').trim();

  // ส่ง text ก่อน
  if (cleanReply) {
    await sendMetaMessage(senderId, cleanReply);
  }
  // ส่งรูปจริง (ถ้ามี)
  for (const imgUrl of imageUrls.slice(0, 3)) {
    await sendMetaImage(senderId, imgUrl).catch(() => {});
  }

  const sent = cleanReply || imageUrls.length > 0;
  if (sent) {
    await saveMsg(sourceId, {
      role: "assistant", userName: DEFAULT_BOT_NAME,
      content: reply, messageType: imageUrls.length > 0 ? "mixed" : "text", isAiReply: true, abVariant: variant,
    }, platform);
    console.log(`[AI-Reply] ${platform} replied in ${Date.now() - startTime}ms (${imageUrls.length} images): ${cleanReply.substring(0, 50)}`);
  }
}

// === shouldAiReply ===
async function shouldAiReply(config, text, userName, source) {
  const mode = config.aiReplyMode || "off";
  if (mode === "off") return false;
  if (userName && userName.startsWith("SML")) return false;
  if (mode === "auto") return true;
  if (mode === "mention") {
    const botName = (config.botName || DEFAULT_BOT_NAME).toLowerCase();
    const lower = text.toLowerCase();
    return lower.includes(botName) || lower.includes("dinoco") || lower.includes("น้องกุ้ง");
  }
  if (mode === "keyword") {
    const keywords = config.aiReplyKeywords || [];
    if (keywords.length === 0) return false;
    const lower = text.toLowerCase();
    return keywords.some((kw) => lower.includes(kw.toLowerCase()));
  }
  return false;
}

module.exports = {
  init,
  callLightAI,
  callProvider,
  callGeminiWithTools,
  callClaudeWithTools,
  callDinocoAI,
  sanitizeAIOutput,
  aiReplyToLine,
  aiReplyToMeta,
  shouldAiReply,
  // Expose for API routes
  discoveredFreeModels: () => discoveredFreeModels,
  lastDiscovery: () => lastDiscovery,
  lightAICooldown,
  providerCooldown,
  getOpenRouterFreeProviders,
};
