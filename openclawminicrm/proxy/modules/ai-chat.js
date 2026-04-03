/**
 * ai-chat.js — AI providers, Gemini/Claude with tools, DINOCO AI wrapper
 * V.2.5 — Lean Prompt V.3.0 support + KB priority tool description
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

// ★ V.1.4: เก็บ tool results ล่าสุดของแต่ละ sourceId สำหรับ claudeSupervisor
const _lastToolResults = new Map();
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
  let result = text
    // ★ V.3.3.2: ลบ stray brackets/JSON artifacts ที่หลุดจาก tool response
    .replace(/^\s*[\[\]{}]\s*$/gm, "")
    .replace(/^\s*[\[\]{}]\s*\n/gm, "")
    .replace(/[^\n]*ราคา\s*(ต้นทุน|dealer|ทุน|wholesale|cost)[^\n]*/gi, "หากสนใจเปิดเป็นตัวแทนจำหน่าย DINOCO รบกวนแจ้ง ชื่อร้าน จังหวัด และเบอร์โทร ให้แอดมินนะคะ จะส่งข้อมูลให้ฝ่ายขายติดต่อกลับค่ะ")
    .replace(/[^\n]*(ส่วนลด|discount|margin|กำไร|profit)[^\n]*/gi, "DINOCO เป็นนโยบาย One Price ค่ะ")
    .replace(/[^\n]*(สต็อก|stock|คงเหลือ|จำนวน\s*\d+\s*ชิ้น|หมดสต็อก)[^\n]*/gi, "สอบถามตัวแทนจำหน่ายค่ะ")
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "[REDACTED]")
    .replace(/https?:\/\/(localhost|127\.0\.0\.1|internal|admin)[^\s]*/gi, "[REDACTED]");
  // ★ V.1.4: Anti-hallucination: ลบ "กระซิบ" + cross-sell patterns ที่ AI มักเติมเอง
  const whisperPattern = /[\n(（]?\s*(?:แอบ)?กระซิบ(?:ว่า)?[^)\n）]*[)\n）]?/gi;
  // จับ cross-sell ที่ไม่ใช้คำว่า "กระซิบ" เช่น "นอกจากนี้ยังมี..." "มี...ด้วยนะ" "แนะนำเพิ่ม..."
  const crossSellPattern = /[\n]?\s*(?:นอกจากนี้(?:ยัง)?มี|แถมยังมี|อีกทั้งยังมี|แนะนำเพิ่มว่า|แอดมินแนะนำเพิ่ม)[^\n]*(?:ด้วย(?:นะ)?(?:คะ|ค่ะ)?|นะคะ)/gi;
  // จับ pattern "มี + สินค้า + ด้วยนะคะ" ที่ AI ชอบเพิ่มเอง
  const sneakySellPattern = /[\n]?\s*(?:เรายังมี|ทาง DINOCO ยังมี|DINOCO ยังมี)[^\n]*(?:ด้วย(?:นะ)?(?:คะ|ค่ะ)?|นะคะ)/gi;
  const patternsToCheck = [whisperPattern, crossSellPattern, sneakySellPattern];
  for (const pat of patternsToCheck) {
    if (pat.test(result)) {
      console.warn(`[AI-Sanitize] Removed cross-sell hallucination: ${pat.source.substring(0, 40)}`);
      pat.lastIndex = 0; // reset regex state
      result = result.replace(pat, "").trim();
    }
  }
  return result;
}

// === Gemini Flash with Function Calling ===
// ★ V.2.3: Fix Gemini 2.5 Flash — thinkingConfig + maxOutputTokens 8192 + proper functionResponse
async function callGeminiWithTools(systemPrompt, userMessage, tools, sourceId) {
  const apiKey = getDynamicKeySync("GOOGLE_API_KEY");
  if (!apiKey) return null;

  // ★ V.2.3: Sanitize parameters — Gemini 2.5 Flash เข้มงวดกว่า 2.0
  // ลบ properties ที่เป็น {} (empty) เพราะ 2.5 Flash ปฏิเสธ tool ที่ไม่มี parameter
  const functionDeclarations = tools.map((t) => {
    const decl = {
      name: t.function.name,
      description: t.function.description,
    };
    const params = t.function.parameters;
    if (params && params.properties && Object.keys(params.properties).length > 0) {
      decl.parameters = params;
    }
    // ถ้าไม่มี properties (tool ไม่รับ args) → ไม่ส่ง parameters เลย
    return decl;
  });

  // ★ V.1.4: ส่ง conversation history + dedup consecutive same-role (Gemini ต้อง alternate user/model)
  const contents = [];
  try {
    const recentMsgs = await getRecentMessages(sourceId, 6);
    let lastRole = "";
    for (const m of recentMsgs.reverse()) {
      const role = m.role === "assistant" ? "model" : "user";
      if (m.content && m.content.length > 0 && m.content !== "[รูปภาพ]") {
        if (role === lastRole && contents.length > 0) {
          // merge consecutive same-role → ต่อท้ายข้อความเดิม
          contents[contents.length - 1].parts[0].text += "\n" + m.content;
        } else {
          contents.push({ role, parts: [{ text: m.content }] });
        }
        lastRole = role;
      }
    }
  } catch {}
  // ถ้า last message เป็น user อยู่แล้ว → merge กับ userMessage
  if (contents.length > 0 && contents[contents.length - 1].role === "user") {
    contents[contents.length - 1].parts[0].text += "\n" + userMessage;
  } else {
    contents.push({ role: "user", parts: [{ text: userMessage }] });
  }

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    tools: [{ functionDeclarations }],
    tool_config: { function_calling_config: { mode: "AUTO" } },
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
  };

  // ★ V.2.5: gemini-2.5-flash stable — ลบ thinkingConfig ออก (REST API ไม่รองรับ field นี้)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        // ★ V.2.3: เพิ่ม timeout เป็น 60s เพราะ thinking model ใช้เวลานานกว่า
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        // ★ V.2.3: Log error body เพื่อ debug
        const errBody = await res.text().catch(() => "");
        console.error(`[Gemini] HTTP ${res.status}: ${errBody.substring(0, 300)}`);
        return null;
      }

      const data = await res.json();

      // ★ V.2.3: ตรวจ blocked/error candidates
      if (data.candidates?.[0]?.finishReason === "SAFETY" || data.candidates?.[0]?.finishReason === "RECITATION") {
        console.warn(`[Gemini] Blocked: ${data.candidates[0].finishReason}`);
        return null;
      }

      const parts = data.candidates?.[0]?.content?.parts || [];

      if (data.usageMetadata) {
        trackAICost({ provider: "Gemini-Tools", model: "gemini-2.5-flash", feature: "chat-with-tools",
          inputTokens: data.usageMetadata.promptTokenCount || 0,
          outputTokens: data.usageMetadata.candidatesTokenCount || 0,
          thinkingTokens: data.usageMetadata.thoughtsTokenCount || 0,
          sourceId });
      }

      // ★ V.2.3: Gemini 2.5 Flash อาจส่ง thinking text + functionCall ใน parts เดียวกัน
      // ต้องหา functionCall จาก parts ทั้งหมด ไม่ใช่แค่ตัวแรก
      const funcCall = parts.find((p) => p.functionCall);
      if (funcCall) {
        const { name, args } = funcCall.functionCall;
        console.log(`[Gemini] Tool call: ${name}(${JSON.stringify(args).substring(0, 80)})`);
        const toolResult = await executeTool(name, args || {}, sourceId);
        // ★ V.1.4: เก็บ tool results ล่าสุดสำหรับ claudeSupervisor
        const toolSummary = typeof toolResult === "string" ? toolResult.substring(0, 500) : JSON.stringify(toolResult).substring(0, 500);
        _lastToolResults.set(sourceId, { name, args, result: toolSummary, at: Date.now() });

        // ★ V.2.3: functionResponse ต้องอยู่ใน parts[] ไม่ใช่ top-level
        // Gemini 2.5 Flash ต้องการ role "model" สำหรับ functionCall แล้ว role "user" สำหรับ functionResponse (format ใหม่)
        contents.push({ role: "model", parts: [{ functionCall: { name, args: args || {} } }] });
        contents.push({
          role: "user",
          parts: [{ functionResponse: { name, response: { content: toolResult } } }],
        });
        body.contents = contents;
        continue;
      }

      // ★ V.2.3: กรอง thinking parts ออก — เอาแค่ text จริง (ไม่ใช่ thought)
      const textPart = parts.find((p) => p.text && !p.thought);
      const textReply = textPart?.text;
      // Fallback: ถ้าไม่มี text ที่ไม่ใช่ thought ลองเอา text ตัวแรก
      return textReply || parts.find((p) => p.text)?.text || null;

    } catch (e) {
      console.error("[Gemini] Error:", e.message);
      return null;
    }
  }
  return null;
}

// === Claude with Tool Use (รองรับ Haiku/Sonnet/Opus) ===
async function callClaudeWithTools(systemPrompt, userMessage, tools, sourceId, model = "claude-sonnet-4-20250514") {
  const apiKey = getDynamicKeySync("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  const claudeTools = tools.map((t) => ({
    name: t.function.name, description: t.function.description, input_schema: t.function.parameters,
  }));

  // ★ V.1.4: ส่ง conversation history + dedup consecutive same-role (Claude ต้อง alternate user/assistant)
  const messages = [];
  try {
    const recentMsgs = await getRecentMessages(sourceId, 6);
    let lastRole = "";
    for (const m of recentMsgs.reverse()) {
      const role = m.role === "assistant" ? "assistant" : "user";
      if (m.content && m.content.length > 0 && m.content !== "[รูปภาพ]") {
        if (role === lastRole && messages.length > 0) {
          messages[messages.length - 1].content += "\n" + m.content;
        } else {
          messages.push({ role, content: m.content });
        }
        lastRole = role;
      }
    }
  } catch {}
  if (messages.length > 0 && messages[messages.length - 1].role === "user") {
    messages[messages.length - 1].content += "\n" + userMessage;
  } else {
    messages.push({ role: "user", content: userMessage });
  }
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model, max_tokens: 2048, temperature: 0.2,
          system: systemPrompt, tools: claudeTools, messages,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) { console.warn(`[Claude] ${model} HTTP ${res.status}`); return null; }
      const data = await res.json();
      if (data.usage) {
        trackAICost({ provider: model.includes("haiku") ? "Claude-Haiku" : "Claude-Sonnet", model, feature: "chat-with-tools",
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

// === DINOCO AI V.3.1 — Pre-inject KB + Gemini primary + Haiku/Sonnet fallback ===
async function callDinocoAI(systemPrompt, userMessage, sourceId) {
  // ★ V.3.1: Pre-inject KB — ถ้าคำถามมี keywords ที่ Gemini ไม่เรียก tool ให้ดึง KB มาแปะก่อน
  const KB_KEYWORDS = /สเปค|น้ำหนัก|กี่กิโล|กี่กก|ขนาด|มิติ|ซม\.|กว้าง.*ยาว.*สูง|ที่อยู่.*เคลม|ส่งเคลม.*ที่ไหน|ส่งซ่อม.*ที่ไหน|ระยะเวลา.*ซ่อม|ระยะเวลา.*เคลม|กี่วัน.*เสร็จ|กี่วัน.*ซ่อม|ใบเสร็จ|ใบกำกับ|invoice|บิล|ใบกำกับภาษี|รับน้ำหนัก|max|ถอด.*ง่าย|ถอด.*PRO|PRO.*ถอด|STD.*PRO|PRO.*STD|ติดตั้ง.*กี่|กี่.*ชั่วโมง|ใช้เวลา.*ติด|ค่าทำสี|สีดำ.*ซ่อม|สีดำ.*บุบ|สีดำ.*ล้ม|บุบ.*สีดำ|อุบัติเหตุ.*กี่วัน|ซีล.*อายุ|น้ำ.*กุญแจ|คืน.*สินค้า|เปลี่ยน.*สินค้า|คืนได้|ผ่อน|COD|ส่ง.*กี่วัน|กี่วัน.*ถึง|Promotion.*Set|ด้านใน.*กล่อง|ข้างใน.*กล่อง|เปิด.*กล่อง.*ข้าง|กล่อง.*ข้าง.*เปิด|เปิดฝา.*ข้าง|37L.*เปิด|กิ่งไม้|กัน.*กิ่ง|ใส่.*เสื้อผ้า|ถุงนอน|เปิด.*ด้านไหน|เปิด.*จาก|ด้านใน.*เป็นยังไง|มีอะไร.*ข้างใน|ภายใน.*กล่อง|EXPAND.*กันน้ำ|กระเป๋า.*กันน้ำ|สนิม|ประกัน.*ตลอดชีพ|ตลอดชีพ|STD.*Edition|Edition.*STD|ครอบคลุม.*ประกัน|ประกัน.*ครอบคลุม|สีเงิน.*บุบ|สีเงิน.*ล้ม|เคลม.*เงิน|ลังเล|แพง.*มาก|ไม่คุ้ม|ฝน.*น้ำเข้า|น้ำเข้า.*กล่อง/i;
  let enrichedMessage = userMessage;
  if (KB_KEYWORDS.test(userMessage) && executeTool) {
    try {
      const db = await getDB();
      if (db) {
        // ★ V.3.2: Smart keyword extraction — ลบ stopwords + ใช้ content-words เท่านั้น
        const STOPWORDS = /^(เป็น|ยังไง|อะไร|มั้ย|ไหม|บ้าง|ได้|หรือ|กับ|ที่|จาก|ของ|มี|ไม่|ต้อง|แล้ว|จะ|ก็|ให้|ทำ|ดี|คือ|DINOCO|dinoco|ดิโนโก|กี่|เท่าไหร่|เท่าไร|ครับ|ค่ะ|นะ|คะ|มาก|เยอะ)$/i;
        const words = userMessage.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9\s]/g, "").trim()
          .split(/\s+/).filter(w => w.length >= 2 && !STOPWORDS.test(w)).slice(0, 6);

        // Strategy 1: ค้นด้วย content-words
        let kbResults = [];
        if (words.length > 0) {
          const regex = words.join("|");
          kbResults = await db.collection("knowledge_base").find({
            active: { $ne: false },
            $or: [
              { content: { $regex: regex, $options: "i" } },
              { title: { $regex: regex, $options: "i" } },
            ],
          }).limit(5).toArray();
        }

        // Strategy 2: ถ้าไม่เจอ ลอง exact phrase match
        if (kbResults.length === 0) {
          const shortQuery = userMessage.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9\s]/g, "").trim().substring(0, 80);
          kbResults = await db.collection("knowledge_base").find({
            active: { $ne: false },
            $or: [
              { title: { $regex: shortQuery.split(/\s+/).slice(0, 3).join(".*"), $options: "i" } },
            ],
          }).limit(3).toArray();
        }

        // Strategy 3: ถ้ายังไม่เจอ ลองค้นด้วยคำสำคัญจาก regex match
        if (kbResults.length === 0) {
          const coreMap = {
            "ด้านใน|ข้างใน|ภายใน": "ซับใน|ด้านใน|อินเนอร์|ช่องเก็บ",
            "เปิด.*ฝา|เปิด.*ข้าง|เปิด.*ด้านไหน": "กล่องข้าง.*เปิด|เปิดฝา|ด้านบน",
            "ถอด.*PRO|PRO.*ถอด": "PRO.*ถอด|ถอด.*ง่าย",
            "STD.*PRO|PRO.*STD": "STD.*PRO|น้ำหนัก.*ใกล้เคียง|แข็งแรง",
            "ติดตั้ง.*กี่|ใช้เวลา.*ติด|ชั่วโมง": "ติดตั้ง.*ชั่วโมง|2.*ชม|เวลา.*ติดตั้ง",
            "สีดำ.*บุบ|สีดำ.*ล้ม|บุบ.*สีดำ|ค่าทำสี": "สีดำ.*ค่าทำสี|บุบ.*ซ่อม|กล่อง.*ดำ",
            "ส่ง.*กี่วัน|กี่วัน.*ถึง": "จัดส่ง|3.*15.*วัน|สต็อก",
            "EXPAND.*กันน้ำ|กระเป๋า.*กันน้ำ": "EXPAND|กันน้ำ 100%|ละอองน้ำ",
            "สนิม|เป็นสนิม": "สแตนเลส|สนิม|304|เคลือบ",
            "ตลอดชีพ|ตลอดอายุ": "5 ปี|ประกัน|ตลอดชีพ",
            "STD.*Edition|Edition.*STD": "STD.*Edition|PRO เท่านั้น",
            "ครอบคลุม.*ประกัน|ประกัน.*ครอบคลุม": "ประกัน|ครอบคลุม|โครงสร้าง|จุดเชื่อม",
            "สีเงิน.*บุบ|สีเงิน.*ล้ม|เคลม.*เงิน": "สีเงิน.*ฟรี|ซ่อมดัด|ค่าทำสี",
            "ลังเล|แพง.*มาก|ไม่คุ้ม": "คุณภาพ|ประกัน|5 ปี|อลูมิเนียม|สแตนเลส",
            "ฝน.*น้ำเข้า|น้ำเข้า.*กล่อง": "กันน้ำ|ซีล|IP67|ฝนตก",
          };
          for (const [pattern, fallbackRegex] of Object.entries(coreMap)) {
            if (new RegExp(pattern, "i").test(userMessage)) {
              kbResults = await db.collection("knowledge_base").find({
                active: { $ne: false },
                $or: [
                  { content: { $regex: fallbackRegex, $options: "i" } },
                  { title: { $regex: fallbackRegex, $options: "i" } },
                ],
              }).limit(3).toArray();
              if (kbResults.length > 0) break;
            }
          }
        }

        if (kbResults.length > 0) {
          const kbText = kbResults.map(r => r.content).join("\n---\n").substring(0, 1500);
          enrichedMessage = `${userMessage}\n\n[ข้อมูลจาก KB สำหรับอ้างอิง — ตอบจากข้อมูลนี้ ห้ามตอบว่า ขอเช็คข้อมูล :]:\n${kbText}`;
          console.log(`[KB-Inject] Pre-injected ${kbResults.length} KB results for: ${userMessage.substring(0, 50)}`);
        } else {
          console.log(`[KB-Inject] No KB results found for: ${userMessage.substring(0, 50)}`);
        }
      }
    } catch (e) { console.error("[KB-Inject] Error:", e.message); }
  }
  // ★ Tier 1: Gemini 2.5 Flash (ลูกน้อง — ทุกข้อความ)
  const geminiReply = await callGeminiWithTools(systemPrompt, enrichedMessage, AGENT_TOOLS, sourceId);
  if (geminiReply) return sanitizeAIOutput(geminiReply);
  // ★ Fallback: Claude Haiku 4.5 (ถ้า Gemini พัง)
  console.log("[AI] Gemini 2.5 Flash failed -> trying Claude Haiku 4.5...");
  const haikuReply = await callClaudeWithTools(systemPrompt, userMessage, AGENT_TOOLS, sourceId, "claude-haiku-4-5-20251001");
  if (haikuReply) return sanitizeAIOutput(haikuReply);
  // ★ Last resort: Claude Sonnet 4
  console.log("[AI] Haiku also failed -> trying Claude Sonnet 4...");
  const sonnetReply = await callClaudeWithTools(systemPrompt, userMessage, AGENT_TOOLS, sourceId);
  if (sonnetReply) return sanitizeAIOutput(sonnetReply);
  console.error("[AI] All 3 models failed");
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

  let reply = await callDinocoAI(systemPrompt, cleanForAI(text), sourceId);
  if (/รอทีมงาน|ขอเช็คข้อมูล/.test(reply)) {
    await createAiHandoffAlert(sourceId, userName, text);
  }
  // ★ V.1.4: Claude หัวหน้าตรวจงาน Gemini บน LINE ด้วย (เดิมทำเฉพาะ Meta)
  reply = await claudeSupervisor(reply, text, sourceId, contextStr);
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
// === ★ V.2.0: ระบบ 3 ชั้น — Haiku รองหัวหน้า 20% + Sonnet หัวหน้าใหญ่ 10% ===
async function claudeSupervisor(geminiReply, customerText, sourceId, contextStr) {
  // ★ Tier 2: Haiku รองหัวหน้า (20% — ตรวจเรื่องทั่วไป)
  const needsHaikuReview =
    geminiReply.length > 250 ||                    // ตอบยาวเกิน
    /\?/.test(geminiReply) ||                      // มี ? หลุด
    /ซ้ำ|เหมือนเดิม/i.test(customerText) ||       // ลูกค้าบ่นว่าซ้ำ
    (contextStr && contextStr.includes(geminiReply.substring(0, 50))) || // ตอบซ้ำกับก่อนหน้า
    /แอบกระซิบ|มี.*ด้วยนะ|แนะนำเพิ่ม|นอกจากนี้.*มี/i.test(geminiReply); // cross-sell

  // ★ Tier 3: Sonnet หัวหน้าใหญ่ (10% — เรื่องยากเท่านั้น)
  const needsSonnetReview =
    /ไม่เข้าใจ|ไม่ใช่|ผิด|โกรธ|ห่วย|แย่/i.test(customerText) || // ลูกค้าไม่พอใจ
    /AI|บอท|bot|ระบบอัตโนมัติ/i.test(geminiReply) || // เผยตัวว่าเป็น AI
    /เป็น AI|เป็นบอท/i.test(geminiReply); // เผยตัวชัดเจน

  if (!needsHaikuReview && !needsSonnetReview) return geminiReply;

  const claudeKey = getDynamicKeySync("ANTHROPIC_API_KEY");
  if (!claudeKey) return geminiReply;

  // เลือก model ตาม tier
  const reviewModel = needsSonnetReview ? "claude-sonnet-4-20250514" : "claude-haiku-4-5-20251001";
  const reviewTier = needsSonnetReview ? "Sonnet-Boss" : "Haiku-VP";
  console.log(`[${reviewTier}] Reviewing Gemini reply...`);

  // ★ V.1.4: ส่ง tool results ให้ Claude ตรวจ hallucination ได้แม่นยำขึ้น
  const lastTool = _lastToolResults.get(sourceId);
  const toolInfo = lastTool && (Date.now() - lastTool.at < 60000)
    ? `\nTool ที่ Gemini เรียก: ${lastTool.name}(${JSON.stringify(lastTool.args)})\nผลลัพธ์จาก tool: ${lastTool.result}`
    : "";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": claudeKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: reviewModel, max_tokens: 512, temperature: 0.2,
        system: `คุณเป็น${reviewTier === "Sonnet-Boss" ? "หัวหน้าใหญ่" : "รองหัวหน้า"} AI ของ DINOCO ตรวจงานลูกน้อง (Gemini)
ลูกค้าถาม: "${customerText}"
Gemini ตอบ: "${geminiReply}"
ประวัติสนทนา: ${contextStr || "(ไม่มี)"}${toolInfo}

ตรวจว่า:
1. ตอบซ้ำกับก่อนหน้าไหม (ดูจากประวัติ) → ถ้าซ้ำ ต้องแก้
2. ตอบตรงคำถามไหม → ถ้าลูกค้าเลือกตัว ต้องตอบเฉพาะตัวนั้น
3. มี ? ไหม → แปลงเป็น คะ/นะคะ/ไหมคะ
4. เผยว่าเป็น AI ไหม → ลบออก
5. กุข้อมูลสินค้าที่ไม่มีใน tool result ไหม → ลบออก (สำคัญมาก! ADV350/Forza350 ไม่มีกล่องข้าง)
6. ยาวเกินไปไหม → ย่อ
7. กระซิบ/แนะนำสินค้าที่ไม่ได้อยู่ใน tool result ไหม → ลบออก

ถ้าคำตอบ Gemini ดีแล้ว → ตอบคำเดียว "OK"
ถ้าต้องแก้ → ตอบข้อความที่แก้แล้วเท่านั้น (ส่งให้ลูกค้าโดยตรง ห้ามใส่คำอธิบาย)`,
        messages: [{ role: "user", content: "ตรวจแล้วคำตอบนี้ดีไหม ต้องแก้ไหม" }],
      }),
      signal: AbortSignal.timeout(12000), // ★ V.1.4: เพิ่มจาก 8 → 12 วินาที
    });
    const data = await res.json();
    const review = (data.content?.[0]?.text || "").trim();

    // ★ V.1.4: exact match "OK" เท่านั้น — ป้องกัน "ดีแล้วค่ะ แต่..." false positive
    if (review === "OK" || review === "ok") {
      console.log(`[${reviewTier}] Approved ✅`);
      return geminiReply;
    }

    // Claude แก้ไข → ใช้ข้อความใหม่ (ลบ ? เฉพาะที่ไม่ใช่ URL)
    console.log(`[${reviewTier}] Revised ✏️`);
    if (data.usage) {
      trackAICost({ provider: `Claude-${reviewTier}`, model: reviewModel, feature: "supervisor",
        inputTokens: data.usage.input_tokens || 0, outputTokens: data.usage.output_tokens || 0, sourceId });
    }
    return review.replace(/\?(?![a-zA-Z_=&])/g, "").trim();
  } catch (e) {
    console.log("[Boss] Claude timeout/error — use Gemini reply:", e.message);
    return geminiReply; // fallback ใช้ Gemini เดิม
  }
}

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

  let reply = await callDinocoAI(systemPrompt, cleanForAI(text), sourceId);
  if (/รอทีมงาน|ขอเช็คข้อมูล/.test(reply)) {
    await createAiHandoffAlert(sourceId, senderId, text, platform);
  }

  // === Claude หัวหน้าตรวจงาน Gemini (เฉพาะเรื่องยาก) ===
  reply = await claudeSupervisor(reply, text, sourceId, contextStr);

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
  // ลบ markdown ที่ FB Messenger ไม่รองรับ → plain text
  cleanReply = cleanReply
    .replace(/\[\]\(\)/g, '')                    // empty markdown links
    .replace(/\*\*([^*]+)\*\*/g, '$1')          // **bold** → bold
    .replace(/\*([^*]+)\*/g, '$1')              // *italic* → italic
    .replace(/__([^_]+)__/g, '$1')              // __bold__ → bold
    .replace(/_([^_]+)_/g, '$1')                // _italic_ → italic
    .replace(/~~([^~]+)~~/g, '$1')              // ~~strike~~ → strike
    .replace(/^#{1,6}\s+/gm, '')                // # Header → Header
    .replace(/^[\*\-]\s+/gm, '• ')             // * list → • list
    .replace(/^\d+\.\s+/gm, (m) => m)          // 1. list → keep
    .replace(/```[^`]*```/gs, '')               // code blocks → remove
    .replace(/`([^`]+)`/g, '$1')               // `code` → code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // [text](url) → text
    .replace(/\[Image[^\]]*\]/gi, '')           // [Image of ...] → ลบ (AI กุ image placeholder)
    .replace(/\n{3,}/g, '\n\n')                 // triple newlines → double
    .replace(/\?/g, '')                          // ลบ ? ทุกตัว (ภาษาไทยไม่ใช้)
    .trim();

  // ส่ง text ก่อน
  if (cleanReply) {
    await sendMetaMessage(senderId, cleanReply);
  }
  // ส่งรูปจริง (ถ้ามี — max 1 รูปต่อข้อความ)
  if (imageUrls.length > 0) {
    await sendMetaImage(senderId, imageUrls[0]).catch(() => {});
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
