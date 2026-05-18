/**
 * claim-flow.js — Manual claim flow, AI-powered claim detection + KB-aware questions
 * V.4.2 — P0.4 from Dead-Workflow Remediation Spec V.1.0 (2026-05-18).
 *         + composeOcrMisreadCustomerMessage(): friendly Thai message when
 *           validatePhotoSerial flags ocr_misread_suspect (excluded chars I/L/O/U).
 *           Previously customer got NO feedback when OCR misread their photo
 *           → claim flow appeared stuck. Now: reset status=photo_rejected +
 *           ask customer to retry photo OR type S/N manually (2-option message).
 *         + Wired into photo_requested case after runPhotoOcrValidation.
 *         + Sensitive flags (fake_sn / sensitive_state / fraud) STAY admin-only
 *           per §15.14.5 — only misread_suspect surfaces to customer.
 * V.4.1 — Phase 4 W14.5 Round 3 (chatbot-rules.md §15.14): OCR_SN_REGEX strict Crockford
 *         alphabet (excludes I/L/O/U) — prevents OCR misread false positives
 *         (DNCO0123 → "O" ambiguous, DNCL1234 → "L" ambiguous). Validation chain now
 *         calls validateSnFormat() from dinoco-tools — if format invalid (excluded chars
 *         detected) flag separately as 'ocr_misread_suspect' for less aggressive escalation.
 *         R3 Gap 3 fix.
 * V.4.0 — Phase 4 W14.4 Round 2 (chatbot-rules.md §15.8 / §15.14.5):
 *         + extractSerialFromAnalysis() — regex extraction of S/N from Gemini Vision text
 *         + validatePhotoSerial() — sn_pool lookup with 4-eyes fraud detection
 *         + analyzeClaimPhoto() now validates extracted SNs in background (non-blocking)
 *         + new claim doc fields: ocrExtractedSerials[], ocrValidationFlags[]
 *         All telegram alerts use try/catch — claim flow NEVER breaks on OCR validation.
 *         Backward compat: existing claim states + signatures unchanged.
 * V.3.0 — Fix: isClaimIntent strict mode + ห้าม hijack "สอบถามสินค้า" + claim timeout 24h
 */
const { getDB, getTemplate, getDynamicKeySync } = require("./shared");
const { callDinocoAPI, getCachedSnLookup, cacheSnLookup } = require("./dinoco-cache");

// V.4.0 — lazy-load to avoid circular dep (dinoco-tools.js doesn't import claim-flow,
// but importing tools at top would still pay startup cost on every module load)
let _snHelpers = null;
function _getSnHelpers() {
  if (!_snHelpers) {
    try { _snHelpers = require("./dinoco-tools"); }
    catch (e) { _snHelpers = {}; }
  }
  return _snHelpers;
}
let _telegramAlertFn = null;
function _getTelegramAlert() {
  if (!_telegramAlertFn) {
    try { _telegramAlertFn = require("./telegram-alert").sendTelegramAlert; }
    catch (e) { _telegramAlertFn = async () => ({ ok: false }); }
  }
  return _telegramAlertFn;
}

// V.4.1 (R3 Gap 3) — chatbot-rules.md §15.14 Photo OCR strict Crockford alphabet.
// Excludes I, L, O, U to prevent OCR misread false positives (1↔I↔L, 0↔O, U↔V).
// Backend /sn-lookup is authoritative — this regex only captures candidate strings
// from Gemini Vision output. validateSnFormat() (dinoco-tools) classifies the result.
//
// Pattern explanation:
//   DNC          — DINOCO prefix
//   (SS)?        — optional SS (legacy) or part of canonical 12-char
//   [0-9A-HJ-KMNP-TV-Z]{3,11}  — Crockford base32 alphabet (excludes I/L/O/U)
//
// Width: 6-14 chars total — accommodates legacy DNCSS\d{7} (12 chars) + canonical
// DNCSS<6alphanum><1checksum> (12 chars) + future variants.
const OCR_SN_REGEX = /DNC(?:SS)?[0-9A-HJ-KMNP-TV-Z]{3,11}/gi;

/**
 * Extract candidate S/N strings from Gemini Vision analysis text.
 * Returns deduped uppercase array. Empty array if none detected.
 * Pure-logic — no I/O.
 *
 * V.4.1 (R3 Gap 3) — uses strict Crockford alphabet regex. Note: legacy 7-digit format
 * (DNCSS + 7 numeric digits) ALSO matches because [0-9...] superset includes digits.
 * Strings with excluded chars (I/L/O/U) silently skipped — common OCR misreads
 * (1→I, 0→O, etc.) are NOT promoted to suspicious flags here. Customer-facing AI
 * should ask "ลองตรวจ S/N อีกครั้ง" (cf. §15.14.7 scenario 4).
 */
function extractSerialFromAnalysis(analysisText) {
  if (!analysisText || typeof analysisText !== "string") return [];
  const matches = analysisText.match(OCR_SN_REGEX) || [];
  const seen = new Set();
  for (const m of matches) {
    const norm = m.toUpperCase().replace(/[\s-]+/g, "");
    if (norm.length >= 6) seen.add(norm); // skip noise like "DNCAB"
  }
  return Array.from(seen);
}

/**
 * Validate extracted S/N against sn_pool — 4 outcomes per §15.14.5:
 *   - not_found      → flag fake_sn_attempt + telegram ocr_unknown_serial
 *   - voided/recalled/stolen → flag sensitive_state + telegram voided_inquiry
 *   - registered + owner mismatch → flag requires_4eyes_review + telegram ocr_mismatch_fraud_suspect
 *   - registered + owner match → ✓ (no flag)
 *
 * Returns { sn, status, flag, alertCategory } — never throws.
 * AI rule: NEVER tell customer the validation result directly — admin's call.
 */
async function validatePhotoSerial(sn, claim, sourceId) {
  const result = { sn, status: "unknown", flag: null, alertCategory: null };
  try {
    // V.4.1 (R3 Gap 3) — pre-check format. If invalid (e.g. contains I/L/O/U),
    // log as 'ocr_misread_suspect' and DON'T treat as fake_sn_attempt — it's
    // probably an OCR misread of a valid plate. Skip backend call to save quota.
    const helpers = _getSnHelpers();
    if (typeof helpers.validateSnFormat === "function") {
      const fmt = helpers.validateSnFormat(sn);
      if (!fmt.valid && fmt.reason === "contains_excluded_char_ILOU") {
        result.status = "format_invalid";
        result.flag = "ocr_misread_suspect";
        // No telegram escalate — common OCR noise. Caller decides whether to log.
        console.log(`[ClaimOCR] format invalid (likely OCR misread) sn=${sn} reason=${fmt.reason}`);
        return result;
      }
    }

    // Cache hit shortcut (60s TTL) — avoid spamming /sn-lookup during multi-photo upload
    let snData = getCachedSnLookup(sn);
    if (!snData) {
      const apiResult = await callDinocoAPI("/sn-lookup", { sn });
      if (typeof apiResult === "string") {
        // upstream error string — treat as not_found for safety
        result.status = "not_found";
        result.flag = "fake_sn_attempt";
        result.alertCategory = "ocr_unknown_serial";
        return result;
      }
      snData = apiResult;
      if (snData && snData.found) cacheSnLookup(sn, snData);
    }

    if (!snData || !snData.found) {
      result.status = "not_found";
      result.flag = "fake_sn_attempt";
      result.alertCategory = "ocr_unknown_serial";
      // Telegram escalate — F#12 anti-fraud counterfeit suspect
      const sendAlert = _getTelegramAlert();
      sendAlert("ocr_unknown_serial", {
        sourceId, customerName: claim.customerName,
        platform: claim.platform || "unknown",
        customerText: `OCR extracted SN ${sn} from claim photo — not in sn_pool`,
        sn,
      }).catch(() => {});
      return result;
    }

    const status = String(snData.status || "").toLowerCase();
    result.status = status;

    if (["voided", "recalled", "stolen"].includes(status)) {
      result.flag = "sensitive_state";
      result.alertCategory = "voided_inquiry";
      const sendAlert = _getTelegramAlert();
      sendAlert("voided_inquiry", {
        sourceId, customerName: claim.customerName,
        platform: claim.platform || "unknown",
        customerText: `OCR extracted SN ${sn} — sn_pool status=${status} during claim flow`,
        sn,
      }).catch(() => {});
      return result;
    }

    // Owner mismatch detection — only when backend provides registered_user_id field
    const ownerUid = snData.registered_user_id || snData.registered_line_uid || null;
    if (status === "registered" && ownerUid && claim.sourceId && ownerUid !== claim.sourceId) {
      result.flag = "requires_4eyes_review";
      result.alertCategory = "ocr_mismatch_fraud_suspect";
      const sendAlert = _getTelegramAlert();
      sendAlert("ocr_mismatch_fraud_suspect", {
        sourceId, customerName: claim.customerName,
        platform: claim.platform || "unknown",
        customerText: `OCR SN ${sn} owned by ${ownerUid}, claim from ${claim.sourceId}`,
        sn,
      }).catch(() => {});
      return result;
    }

    // ✓ pass — registered + owner matches (or no owner check available)
    return result;
  } catch (e) {
    console.error("[ClaimOCR] validatePhotoSerial error:", e.message);
    return result; // never throw — claim flow continues
  }
}

/**
 * Run the full OCR validation chain on a single photo's analysis text.
 * Returns { extractedSerials[], validationFlags[] } — both arrays may be empty.
 * Side effects: telegram alerts (best-effort), claim doc update via caller.
 */
async function runPhotoOcrValidation(analysisText, claim, sourceId) {
  const extracted = extractSerialFromAnalysis(analysisText);
  if (extracted.length === 0) return { extractedSerials: [], validationFlags: [] };
  const flags = [];
  for (const sn of extracted) {
    const v = await validatePhotoSerial(sn, claim, sourceId);
    if (v.flag) flags.push({ sn: v.sn, status: v.status, flag: v.flag, at: new Date() });
  }
  return { extractedSerials: extracted, validationFlags: flags };
}

/**
 * V.4.2 (P0.4 — Dead-Workflow Remediation Spec V.1.0)
 *
 * Compose customer-facing message when OCR validation flagged ocr_misread_suspect.
 * Previously customers got NO feedback when their photo had OCR-ambiguous chars
 * (I/L/O/U Crockford exclusions) → claim flow appeared stuck. Now we surface a
 * friendly message + invite manual S/N input as fallback.
 *
 * Returns null if no misread suspected (caller continues normal flow).
 * Returns string (Thai message) if at least one flag === 'ocr_misread_suspect'.
 *
 * IMPORTANT: Per §15.14.5 AI rule, we NEVER reveal validation result to customer
 * (fraud / voided / mismatch are admin's call). Only ocr_misread_suspect (which
 * is a benign noise classification) gets surfaced — and only as a hint, not a
 * confirmation. Caller should set claim.status='photo_rejected' so further
 * photos retry the flow.
 */
function composeOcrMisreadCustomerMessage(ocr) {
  if (!ocr || !Array.isArray(ocr.validationFlags) || ocr.validationFlags.length === 0) return null;
  const hasMisread = ocr.validationFlags.some(f => f && f.flag === 'ocr_misread_suspect');
  if (!hasMisread) return null;
  return [
    "📸 ระบบอ่านเลข S/N บนภาพไม่ค่อยชัดเจนค่ะ",
    "อาจมีตัวเลขที่อ่านสับสนได้ เช่น 1↔I↔L หรือ 0↔O",
    "",
    "รบกวนเลือกอย่างใดอย่างหนึ่งนะคะ:",
    "1️⃣ ส่งภาพอีกครั้งโดยให้เห็นเลข S/N ชัดๆ (ถ่ายใกล้ + แสงเพียงพอ)",
    "2️⃣ หรือพิมพ์เลข S/N ที่อยู่บนเพลทมาก็ได้ค่ะ (เช่น DNCSS1234567)",
    "",
    "ขอบคุณค่ะ 🙏",
  ].join("\n");
}

// Forward declarations
let analyzeImage = null;

// === AI-Powered Claim Question — ถามฉลาดจาก KB + รูป + context ===
async function aiClaimQuestion(claim, newInfo) {
  const db = await getDB();
  const apiKey = getDynamicKeySync("GOOGLE_API_KEY");
  if (!apiKey || !db) return null;

  // ดึง KB เรื่องเคลมที่เกี่ยวข้อง
  const kbEntries = await db.collection("knowledge_base")
    .find({ $or: [
      { category: "warranty" },
      { tags: { $in: ["เคลม", "ประกัน", "ชำรุด", "สติ๊กเกอร์", "กุญแจ", "แตก", "ลอก", "หลุด"] } },
      { trainingPhrases: { $regex: "เคลม|ประกัน|ชำรุด|สติ๊กเกอร์|แตก|ลอก", $options: "i" } },
    ] })
    .limit(5).toArray();

  const kbContext = kbEntries.map(k => `• ${k.title}: ${(k.content || "").substring(0, 200)}`).join("\n");

  // สร้าง context จากข้อมูลที่เก็บไว้แล้ว
  const collected = [];
  if (claim.initialMessage) collected.push(`ข้อความแรกของลูกค้า: "${claim.initialMessage}"`);
  if (claim.product) collected.push(`สินค้า: ${claim.product}`);
  if (claim.symptoms) collected.push(`อาการ: ${claim.symptoms}`);
  if (claim.purchaseFrom) collected.push(`ร้าน: ${claim.purchaseFrom}`);
  if (claim.purchaseDate) collected.push(`ซื้อเมื่อ: ${claim.purchaseDate}`);
  if (claim.phone) collected.push(`เบอร์: ${claim.phone}`);
  if (claim.aiAnalysis) collected.push(`AI วิเคราะห์รูป (ภายใน): ${claim.aiAnalysis}`);

  // ข้อมูลใหม่ที่เพิ่งได้
  if (newInfo) collected.push(`ข้อมูลล่าสุด: ${newInfo}`);

  // ข้อมูลที่ยังขาด
  const missing = [];
  if (!claim.product) missing.push("สินค้ารุ่นอะไร (เช่น กล่องข้าง, แคชบาร์, แร็ค)");
  if (!claim.symptoms) missing.push("อาการเป็นยังไง (เช่น สติ๊กเกอร์ลอก, แตก, กุญแจหาย)");
  if (!claim.purchaseFrom) missing.push("ซื้อจากร้านไหน");
  if (!claim.purchaseDate) missing.push("ซื้อประมาณเมื่อไหร่");
  if (!claim.phone) missing.push("เบอร์โทรติดต่อกลับ");

  if (missing.length === 0) return null; // ข้อมูลครบแล้ว

  const prompt = `คุณเป็นทีมงาน DINOCO กำลังรับเรื่องเคลมสินค้า (ห้ามบอกว่าเป็น AI เด็ดขาด)
สินค้า DINOCO: กล่องอลูมิเนียม, แคชบาร์ (กันล้ม), แร็ค, ถาดรอง, การ์ดแฮนด์

ความรู้เรื่องเคลมที่คุณมี (ใช้เป็นสมองคิด ไม่ต้อง copy ตาม):
${kbContext || "(ไม่มี)"}

ข้อมูลที่เก็บได้แล้วจากลูกค้า:
${collected.join("\n") || "(ยังไม่มี)"}

ข้อมูลที่ยังขาด ต้องถามเพิ่ม:
${missing.join("\n")}

วิธีถาม:
- ถามทีละข้อ สั้นๆ 1-2 ประโยค
- ถ้าวิเคราะห์รูปได้ว่าเป็นสินค้าอะไร/อาการอะไร → ถามยืนยันแทน เช่น "ดูจากรูปเหมือนแคชบาร์ใช่ไหมคะ" ไม่ใช่ถามใหม่ทั้งหมด
- ใช้ความรู้จาก KB คิดว่าควรถามอะไร เช่น ถ้า KB บอกว่าเคลมสติ๊กเกอร์ต้องดูบัตรรับประกัน → ถามเรื่องบัตรรับประกัน
- ห้ามใช้ ? ใช้ คะ/นะคะ แทน
- เรียกลูกค้าว่า "คุณลูกค้า" หรือ "ลูกค้า" เท่านั้น ห้ามใช้ "พี่" "น้อง" "ดิฉัน"
- พูดเหมือนคนจริงๆ ไม่ใช่สคริปต์`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        system_instruction: { parts: [{ text: prompt }] },
        contents: [{ role: "user", parts: [{ text: `ถามข้อมูลที่ขาดจากลูกค้า (เหลือ ${missing.length} ข้อ)` }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 200 },
      }),
    });
    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (reply && reply.length > 5) return reply.replace(/\?/g, "").trim();
  } catch (e) { console.error("[ClaimAI] Question error:", e.message); }
  return null;
}

// === ดึง KB เรื่องเคลม → ให้ AI ตอบตาม KB (ไม่ hardcode) ===
async function getClaimKBResponse(customerText, claim) {
  const db = await getDB();
  const apiKey = getDynamicKeySync("GOOGLE_API_KEY");
  if (!apiKey || !db) return null;

  // ดึง KB ที่เกี่ยวข้องกับเคลม
  const kbEntries = await db.collection("knowledge_base")
    .find({ $or: [
      { category: "warranty" },
      { tags: { $in: ["เคลม", "ประกัน", "สติ๊กเกอร์", "กุญแจ", "ซ่อม", "กันล้ม", "กล่อง"] } },
      { trainingPhrases: { $regex: "เคลม|ประกัน|สติ๊กเกอร์|ลอก|หลุด|ชน|เบี้ยว|ซ่อม", $options: "i" } },
    ] })
    .limit(10).toArray();

  if (kbEntries.length === 0) return null;

  const kbText = kbEntries.map(k => `[${k.title}]\n${k.content || ""}`).join("\n\n---\n");

  const prompt = `คุณเป็นทีมงาน DINOCO (ห้ามบอกว่าเป็น AI เด็ดขาด)
ลูกค้าต้องการเคลมสินค้า

ความรู้เรื่องเคลมจากคลัง KB (ใช้เป็นสมองคิด ตอบตาม KB แต่แต่งคำให้เป็นธรรมชาติ):
${kbText}

ข้อมูลที่รู้แล้ว:
- สินค้า: ${claim.product || "ยังไม่ทราบ"}
- อาการ: ${claim.symptoms || "ยังไม่ทราบ"}
- ข้อความลูกค้า: "${customerText}"

วิธีตอบ:
1. acknowledge สิ่งที่ลูกค้าบอก (เช่น "เรื่องสติ๊กเกอร์ลอกนะคะ")
2. ตอบตาม KB — ถ้า KB มีวิธีตอบชัดเจน ให้ใช้ตามนั้น (เช่น ขอรูป + ที่อยู่จัดส่ง)
3. ถ้า KB บอกว่าต้องขอรูปอะไรบ้าง → ขอตาม KB
4. ห้ามใช้ ? ใช้ คะ/นะคะ แทน
5. เรียกลูกค้าว่า "คุณลูกค้า" หรือ "ลูกค้า" เท่านั้น ห้ามใช้ "พี่" "น้อง" "ดิฉัน"
6. ห้ามพูดว่าฟรีตลอดอายุการใช้งาน หรือประกันตลอดชีพ`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        system_instruction: { parts: [{ text: prompt }] },
        contents: [{ role: "user", parts: [{ text: customerText }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
      }),
    });
    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (reply && reply.length > 10) {
      console.log("[ClaimKB] AI replied from KB");
      return reply.replace(/\?/g, "").trim();
    }
  } catch (e) { console.error("[ClaimKB] Error:", e.message); }
  return null;
}

function init(deps) {
  analyzeImage = deps.analyzeImage;
}

const CLAIM_STATUSES = [
  "intent_detected", "photo_requested", "photo_received", "photo_rejected",
  "info_collecting", "info_collected",
  "admin_reviewing", "case_a_return", "case_b_parts", "rejected",
  "waiting_return_shipment", "received_at_factory", "repaired",
  "return_to_customer", "closed_resolved", "closed_rejected",
  "customer_no_response", "reopened",
];

// ★ V.3.0: Strict claim detection — 2 ระดับ
// ระดับ 1: คำที่ชัดเจนว่าเคลม (trigger เดี่ยวได้)
const CLAIM_EXPLICIT = /เคลม|ส่งซ่อม|ขอเคลม|เคลมสินค้า|เคลมประกัน/;
// ระดับ 2: คำอาการ (ต้อง combine กับ context ว่าพูดถึงสินค้า DINOCO)
const CLAIM_SYMPTOMS = /แตก|ลอก|หลุด|ชำรุด|พัง|ร้าว|บิ่น|น้ำเข้า|เบี้ยว|ขีดข่วน|งอ|บุบ|สนิม/;
const CLAIM_PRODUCT_CONTEXT = /สติ๊กเกอร์|สติกเกอร์|กุญแจ|กล่อง|แคชบาร์|กันล้ม|แร็ค|ถาด|การ์ดแฮนด์|ประกับ|DINOCO|ดิโนโก/i;
// คำที่ห้ามเป็น claim เด็ดขาด — สอบถามสินค้าทั่วไป
const NOT_CLAIM_KEYWORDS = /เปลี่ยนรุ่น|เปลี่ยนสี|เปลี่ยนยี่ห้อ|เปลี่ยนแบบ|เปลี่ยนขนาด|เปลี่ยนรถ|ราคา|สั่ง|ซื้อ|อยากได้|สนใจ|มีไหม|กี่บาท|สอบถามสินค้า|อยากดู|ดูสินค้า|มีอะไรบ้าง|ขอดูรูป|มีรูป|ตัวแทน|ร้าน|จังหวัด/;
// ★ Backward-compatible: keep CLAIM_KEYWORDS for external usage
const CLAIM_KEYWORDS = /เคลม|ส่งซ่อม|สติ๊กเกอร์.*ลอก|กุญแจ.*หาย|แตก|ลอก|หลุด|ชำรุด|พัง|ร้าว|บิ่น|น้ำเข้า|เบี้ยว/;

function isClaimIntent(text) {
  // ★ V.3.0: NOT_CLAIM ตรวจก่อน — ป้องกัน "สอบถามสินค้า" เข้า claim flow
  if (NOT_CLAIM_KEYWORDS.test(text)) return false;
  // ระดับ 1: คำชัดเจน → เข้า claim ทันที
  if (CLAIM_EXPLICIT.test(text)) return true;
  // ระดับ 2: อาการ + ต้องมี context สินค้า DINOCO
  if (CLAIM_SYMPTOMS.test(text) && CLAIM_PRODUCT_CONTEXT.test(text)) return true;
  // ★ ถ้ามีแค่อาการแต่ไม่มี context สินค้า → ไม่ trigger claim (อาจแค่สอบถาม)
  // เช่น "มีปัญหา" โดดๆ ไม่ trigger, ต้อง "กล่องมีปัญหา" หรือ "สติ๊กเกอร์ลอก"
  return false;
}

async function analyzeClaimPhoto(imageUrl) {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const base64 = buffer.toString("base64");
    const claimPrompt = `วิเคราะห์รูปสินค้าที่เคลม (อุปกรณ์เสริมมอเตอร์ไซค์ เช่น กล่องอลูมิเนียม แคชบาร์ แร็ค ถาดรอง):
1. สินค้าคืออะไร? (ถ้าระบุได้)
2. ความเสียหายที่เห็น (เช่น สติ๊กเกอร์ลอก, มุมแตก, รอยร้าว, ชิ้นส่วนหลุด, กุญแจไม่ทำงาน)
3. ความรุนแรง: เล็กน้อย / ปานกลาง / รุนแรง
4. รูปชัดพอสำหรับประเมินไหม? (ชัด / ไม่ชัด-ขอถ่ายใหม่)
ตอบสั้นกระชับ 2-3 บรรทัด ภาษาไทย`;

    const geminiKey = getDynamicKeySync("GOOGLE_API_KEY");
    if (geminiKey) {
      const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          contents: [{ parts: [
            { text: claimPrompt },
            { inlineData: { mimeType: "image/jpeg", data: base64 } },
          ] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
        }),
      });
      const gemData = await gemRes.json();
      const analysis = gemData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (analysis) { console.log("[ClaimVision] Gemini OK"); return analysis; }
    }
    return await analyzeImage(buffer);
  } catch (e) {
    console.error("[ClaimVision] Error:", e.message);
    return null;
  }
}

async function getClaimSession(sourceId) {
  const db = await getDB();
  if (!db) return null;
  const claim = await db.collection("manual_claims").findOne({
    sourceId,
    status: { $nin: ["closed_resolved", "closed_rejected", "customer_no_response"] },
  });

  // ★ V.3.0: Auto-timeout claims inactive for 24 hours (เดิม 48h — ลด claim session ค้าง)
  if (claim && claim.updatedAt) {
    const hoursSinceUpdate = (Date.now() - new Date(claim.updatedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceUpdate > 24 && ["photo_requested", "photo_rejected", "photo_received", "info_collecting"].includes(claim.status)) {
      await db.collection("manual_claims").updateOne(
        { _id: claim._id },
        { $set: { status: "customer_no_response", updatedAt: new Date(), auto_timeout: true } }
      );
      console.log(`[Claim] Auto-timeout: ${claim.customerName || sourceId} (${claim.status}, ${Math.round(hoursSinceUpdate)}h inactive)`);
      return null; // Return null so normal AI chat handles the message
    }
  }

  return claim;
}

async function startClaimFlow(sourceId, platform, customerName, initialMessage) {
  const db = await getDB();
  if (!db) return null;
  const existing = await getClaimSession(sourceId);
  if (existing) return existing;

  // วิเคราะห์ text แรก — ดึงข้อมูลที่ลูกค้าบอกมาแล้ว
  let autoProduct = null;
  let autoSymptoms = null;
  if (initialMessage) {
    const msg = initialMessage.toLowerCase();
    // ดึงสินค้าจาก text
    if (/สติ๊กเกอร์|สติกเกอร์|sticker/.test(msg)) autoProduct = "สติ๊กเกอร์";
    else if (/กล่อง/.test(msg)) autoProduct = "กล่องอลูมิเนียม";
    else if (/แคชบาร์|กันล้ม|crashbar/.test(msg)) autoProduct = "แคชบาร์";
    else if (/แร็ค|rack/.test(msg)) autoProduct = "แร็ค";
    else if (/ถาด/.test(msg)) autoProduct = "ถาดรอง";
    else if (/การ์ดแฮนด์|handguard/.test(msg)) autoProduct = "การ์ดแฮนด์";
    else if (/กุญแจ|ล็อค|lock/.test(msg)) autoProduct = "กุญแจ/ล็อค";

    // ดึงอาการจาก text
    if (/ลอก|หลุด/.test(msg)) autoSymptoms = "ลอก/หลุด";
    else if (/แตก|ร้าว|บิ่น/.test(msg)) autoSymptoms = "แตก/ร้าว";
    else if (/เสีย|พัง|ชำรุด/.test(msg)) autoSymptoms = "ชำรุด";
    else if (/หาย|ไม่ทำงาน/.test(msg)) autoSymptoms = "ไม่ทำงาน/หาย";
    else if (/ชน/.test(msg)) autoSymptoms = "ชนมา/กระแทก";
  }

  const claim = {
    sourceId, platform, customerName,
    status: "photo_requested", photos: [], aiAnalysis: null,
    serial: null,
    product: autoProduct,
    purchaseFrom: null, purchaseDate: null,
    symptoms: autoSymptoms,
    phone: null, address: null,
    initialMessage: initialMessage || null,
    wpClaimId: null, wpTicketNumber: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const result = await db.collection("manual_claims").insertOne(claim);
  claim._id = result.insertedId;
  console.log(`[Claim] Started: ${customerName} (${platform})`);
  return claim;
}

async function processClaimMessage(sourceId, platform, text, imageUrl, customerName) {
  const db = await getDB();
  if (!db) return null;
  let claim = await getClaimSession(sourceId);
  if (!claim) {
    claim = await startClaimFlow(sourceId, platform, customerName, text);

    // ดึง KB เรื่องเคลมที่ตรงกับสิ่งที่ลูกค้าบอก → ให้ AI ตอบตาม KB
    const kbReply = await getClaimKBResponse(text, claim);
    if (kbReply) return kbReply;

    return await getTemplate("claim_start") || "รับทราบค่ะ ทีม DINOCO พร้อมดูแลเรื่องเคลมให้ค่ะ\nรบกวนส่งรูปสินค้าที่มีปัญหาให้ดูหน่อยนะคะ";
  }

  switch (claim.status) {
    case "photo_requested":
    case "photo_rejected": {
      if (imageUrl) {
        await db.collection("manual_claims").updateOne({ _id: claim._id }, {
          $set: { updatedAt: new Date() }, $push: { photos: imageUrl },
        });
        const analysis = await analyzeClaimPhoto(imageUrl);
        if (analysis) {
          // V.4.0 — chatbot-rules.md §15.14.5 Photo OCR fraud validation
          // Best-effort + non-blocking on alerts; never break claim flow on failure.
          let ocrMisreadMessage = null;
          try {
            const ocr = await runPhotoOcrValidation(analysis, claim, sourceId);
            if (ocr.extractedSerials.length > 0 || ocr.validationFlags.length > 0) {
              await db.collection("manual_claims").updateOne(
                { _id: claim._id },
                {
                  $set: { updatedAt: new Date() },
                  $addToSet: { ocrExtractedSerials: { $each: ocr.extractedSerials } },
                  $push: { ocrValidationFlags: { $each: ocr.validationFlags } },
                }
              );
            }
            // V.4.2 P0.4 — surface customer-facing feedback for ocr_misread_suspect.
            // Other flags (fake_sn / sensitive_state / fraud) stay admin-only per §15.14.5.
            ocrMisreadMessage = composeOcrMisreadCustomerMessage(ocr);
          } catch (ocrErr) {
            console.error("[ClaimOCR] photo_requested validation error:", ocrErr.message);
          }
          // V.4.2 P0.4 — if OCR misread suspected, ask customer to retry photo OR
          // type S/N manually. Reset status to photo_rejected so next photo retries.
          if (ocrMisreadMessage) {
            await db.collection("manual_claims").updateOne({ _id: claim._id }, {
              $set: { status: "photo_rejected", aiAnalysis: analysis, updatedAt: new Date() },
            });
            return ocrMisreadMessage;
          }
          const isBlurry = /ไม่ชัด|ขอถ่ายใหม่|มืด|เบลอ/.test(analysis);
          if (isBlurry) {
            await db.collection("manual_claims").updateOne({ _id: claim._id }, {
              $set: { status: "photo_rejected", aiAnalysis: analysis, updatedAt: new Date() },
            });
            // ไม่บอกลูกค้าว่า AI วิเคราะห์ — แค่บอกว่ารูปไม่ชัด
            return await getTemplate("claim_photo_rejected") || "รูปยังไม่ค่อยชัดค่ะ รบกวนถ่ายอีกทีนะคะ ให้เห็นจุดที่ชำรุดชัดๆ ค่ะ";
          }
          // เก็บ AI analysis ภายใน (ส่งให้ Admin ดูเฉยๆ) ไม่แสดงลูกค้า
          await db.collection("manual_claims").updateOne({ _id: claim._id }, {
            $set: { status: "photo_received", aiAnalysis: analysis, updatedAt: new Date() },
          });
          // AI ถามฉลาด — ใช้ KB + รูปวิเคราะห์
          const smartQ = await aiClaimQuestion(claim, null);
          return smartQ || await getTemplate("claim_photo_received") || "ได้รูปแล้วค่ะ ขอบคุณนะคะ\nสินค้ารุ่นอะไรคะ";
        }
        const photoCount = (claim.photos?.length || 0) + 1;
        if (photoCount >= 2) {
          await db.collection("manual_claims").updateOne({ _id: claim._id }, {
            $set: { status: "photo_received", updatedAt: new Date() },
          });
          return await getTemplate("claim_photos_complete") || "ได้รูปครบแล้วค่ะ ขอบคุณนะคะ\nสินค้ารุ่นอะไรคะ";
        }
        return `ได้รูปที่ ${photoCount} แล้วค่ะ ส่งรูปเพิ่มได้อีกนะคะ (ส่งรูปบัตรรับประกันด้วยยิ่งดีค่ะ)\nพอครบแล้วพิมพ์ "ครบแล้ว" ค่ะ`;
      }
      if (text && /ครบ|พอ|เสร็จ|หมด/i.test(text) && claim.photos?.length > 0) {
        await db.collection("manual_claims").updateOne({ _id: claim._id }, {
          $set: { status: "photo_received", updatedAt: new Date() },
        });
        return "ขอบคุณค่ะ 📸\nสินค้ารุ่นอะไรคะ";
      }
      return await getTemplate("claim_need_photo") || "ส่งรูปสินค้าที่ชำรุดให้ดูหน่อยนะคะ";
    }

    case "photo_received": {
      if (imageUrl) {
        await db.collection("manual_claims").updateOne({ _id: claim._id }, {
          $push: { photos: imageUrl }, $set: { updatedAt: new Date() },
        });
        const extraAnalysis = await analyzeClaimPhoto(imageUrl);
        if (extraAnalysis) {
          await db.collection("manual_claims").updateOne({ _id: claim._id }, {
            $set: { aiAnalysis: (claim.aiAnalysis || "") + "\n" + extraAnalysis },
          });
          // V.4.0 — §15.14.5 OCR validation on extra photos too
          try {
            const ocr = await runPhotoOcrValidation(extraAnalysis, claim, sourceId);
            if (ocr.extractedSerials.length > 0 || ocr.validationFlags.length > 0) {
              await db.collection("manual_claims").updateOne(
                { _id: claim._id },
                {
                  $addToSet: { ocrExtractedSerials: { $each: ocr.extractedSerials } },
                  $push: { ocrValidationFlags: { $each: ocr.validationFlags } },
                }
              );
            }
          } catch (ocrErr) {
            console.error("[ClaimOCR] photo_received validation error:", ocrErr.message);
          }
        }
        return "ได้รูปเพิ่มแล้วค่ะ\nสินค้ารุ่นอะไรคะ";
      }
      if (text && text.length > 1) {
        await db.collection("manual_claims").updateOne({ _id: claim._id }, {
          $set: { product: text, status: "info_collecting", updatedAt: new Date() },
        });
        const smartQ = await aiClaimQuestion({ ...claim, product: text }, text);
        return smartQ || await getTemplate("claim_ask_shop") || "ซื้อจากร้านไหนคะ";
      }
      const smartQ = await aiClaimQuestion(claim, null);
      return smartQ || "สินค้ารุ่นอะไรคะ";
    }

    case "info_collecting": {
      // AI extract หลาย field จากข้อความเดียว
      if (text) {
        const updateFields = {};
        const lower = text.toLowerCase();

        // เช็คเบอร์โทรก่อน (ชัดเจนที่สุด)
        const phoneMatch = text.replace(/[^0-9]/g, "");
        if (phoneMatch.length >= 9 && !claim.phone) updateFields.phone = phoneMatch;

        // AI extract: ถ้าข้อความมีหลายข้อมูล เก็บทีเดียว
        if (!claim.purchaseFrom && /ร้าน|shop|ศูนย์|facebook|เพจ|lazada|shopee/i.test(lower)) updateFields.purchaseFrom = text;
        if (!claim.purchaseDate && /เมื่อ|ปีที่แล้ว|เดือน|สัปดาห์|วัน|ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|2024|2025|2026/i.test(lower)) updateFields.purchaseDate = text;
        if (!claim.symptoms && /ลอก|หลุด|แตก|ร้าว|เบี้ยว|พัง|ชำรุด|เสีย|ชน|น้ำเข้า|หาย|ไม่ทำงาน|ขีดข่วน/i.test(lower)) updateFields.symptoms = text;
        if (!claim.address && /ส่ง.*ที่|ที่อยู่|จัดส่ง|แขวง|เขต|ตำบล|อำเภอ|จังหวัด|รหัสไปรษณีย์|\d{5}/i.test(lower)) updateFields.address = text;

        // ถ้าไม่ match pattern → เก็บเป็น field ที่ว่างแรก
        if (Object.keys(updateFields).length === 0) {
          if (!claim.purchaseFrom) updateFields.purchaseFrom = text;
          else if (!claim.purchaseDate) updateFields.purchaseDate = text;
          else if (!claim.symptoms) updateFields.symptoms = text;
        }

        if (Object.keys(updateFields).length > 0) {
          updateFields.updatedAt = new Date();
          await db.collection("manual_claims").updateOne({ _id: claim._id }, { $set: updateFields });
        }

        // เช็คว่าข้อมูลครบหรือยัง
        const updatedClaim = { ...claim, ...updateFields };
        const smartQ = await aiClaimQuestion(updatedClaim, text);
        if (smartQ) return smartQ;

        // Fallback: ถามข้อที่ยังขาด
        if (!updatedClaim.purchaseFrom) return "ซื้อจากร้านไหนคะ";
        if (!updatedClaim.purchaseDate) return "ประมาณซื้อเมื่อไหร่คะ";
        if (!updatedClaim.symptoms) return "อาการเป็นยังไงคะ";
        if (!updatedClaim.phone) return "ขอเบอร์โทรติดต่อกลับหน่อยนะคะ";
      }
      if (claim.symptoms && !claim.phone && text) {
        const phoneMatch = text.replace(/[^0-9]/g, "");
        if (phoneMatch.length >= 9) {
          await db.collection("manual_claims").updateOne({ _id: claim._id }, {
            $set: { phone: phoneMatch, serial: "ดูจากรูปบัตรรับประกัน", status: "info_collected", updatedAt: new Date() },
          });
          const wpResult = await callDinocoAPI("/claim-manual-create", {
            serial: "ดูจากรูปบัตรรับประกัน", product: claim.product,
            symptoms: claim.symptoms, purchase_from: claim.purchaseFrom,
            purchase_date: claim.purchaseDate, customer_name: claim.customerName,
            phone: phoneMatch, photos: claim.photos, platform,
            source_id: sourceId, initiated_by: "customer",
            ai_analysis: claim.aiAnalysis || "",
          });
          if (typeof wpResult !== "string" && wpResult?.success) {
            await db.collection("manual_claims").updateOne({ _id: claim._id }, {
              $set: { wpClaimId: wpResult.claim_id, wpTicketNumber: wpResult.ticket_number, updatedAt: new Date() },
            });
            return `รับเรื่องเคลมแล้วค่ะ ✅\nใบเคลม: ${wpResult.ticket_number}\n\nสรุป:\n• สินค้า: ${claim.product}\n• อาการ: ${claim.symptoms}\n• ร้าน: ${claim.purchaseFrom}\n\nทีมงานจะตรวจสอบและติดต่อกลับภายใน 1-2 วันทำการค่ะ`;
          }
          return await getTemplate("claim_submitted_fallback") || "รับเรื่องเคลมแล้วค่ะ ทีมงานจะตรวจสอบและติดต่อกลับเร็วที่สุดค่ะ";
        }
        await db.collection("manual_claims").updateOne({ _id: claim._id }, {
          $set: { symptoms: (claim.symptoms || "") + " | " + text, updatedAt: new Date() },
        });
        return "ขอเบอร์โทรติดต่อกลับหน่อยนะคะ (ตัวเลข 10 หลัก)";
      }
      return "ขอเบอร์โทรติดต่อกลับหน่อยนะคะ";
    }

    case "info_collected":
      return `เรื่องเคลมของลูกค้าอยู่ระหว่างตรวจสอบค่ะ${claim.wpTicketNumber ? " (ใบเคลม: " + claim.wpTicketNumber + ")" : ""}\nทีมงานจะติดต่อกลับเร็วที่สุดค่ะ\n\nมีอะไรเพิ่มเติมทักมาได้เลยนะคะ`;

    default:
      return `เรื่องเคลมของลูกค้าสถานะ: ${claim.status} ค่ะ${claim.wpTicketNumber ? "\nใบเคลม: " + claim.wpTicketNumber : ""}\nสอบถามเพิ่มเติมได้ค่ะ`;
  }
}

async function ensureClaimIndexes() {
  const db = await getDB();
  if (!db) return;
  try {
    const claims = db.collection("manual_claims");
    await claims.createIndex({ sourceId: 1, status: 1 });
    await claims.createIndex({ status: 1, updatedAt: -1 });
    await claims.createIndex({ wpClaimId: 1 });
    console.log("[DB] Claim indexes created");
  } catch (e) { console.error("[DB] Claim index error:", e.message); }
}

module.exports = {
  CLAIM_STATUSES,
  CLAIM_KEYWORDS,
  isClaimIntent,
  analyzeClaimPhoto,
  getClaimSession,
  startClaimFlow,
  processClaimMessage,
  ensureClaimIndexes,
  init,
  // V.4.0 — Round 2 §15.14.5 Photo OCR helpers (exported for testing + reuse)
  extractSerialFromAnalysis,
  validatePhotoSerial,
  runPhotoOcrValidation,
  OCR_SN_REGEX,
  // V.4.2 P0.4 — Dead-Workflow Remediation Spec V.1.0 customer feedback helper
  composeOcrMisreadCustomerMessage,
};
