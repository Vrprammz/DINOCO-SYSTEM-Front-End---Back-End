/**
 * claim-flow.js — Manual claim flow, AI-powered claim detection + KB-aware questions
 * V.2.0 — AI ถามฉลาด ดึง KB + วิเคราะห์รูป ไม่ใช้ hardcode steps
 */
const { getDB, getTemplate, getDynamicKeySync } = require("./shared");
const { callDinocoAPI } = require("./dinoco-cache");

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
- เรียกลูกค้าว่า "พี่"
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
5. เรียกลูกค้าว่า "พี่" หรือ "คุณลูกค้า"
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

const CLAIM_KEYWORDS = /มีปัญหา|แตก|ลอก|เสีย|หลุด|หาย|ชำรุด|พัง|ร้าว|บิ่น|สติ๊กเกอร์|กุญแจ|ซ่อม|เคลม|เปลี่ยน|คืน/;

function isClaimIntent(text) {
  return CLAIM_KEYWORDS.test(text);
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

    const geminiKey = process.env.GOOGLE_API_KEY;
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
  return db.collection("manual_claims").findOne({
    sourceId,
    status: { $nin: ["closed_resolved", "closed_rejected", "customer_no_response"] },
  });
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
      // AI เก็บข้อมูลฉลาด — ดูว่าลูกค้าตอบอะไรมา แล้วเก็บให้ถูก field
      if (text) {
        // AI ตรวจว่าข้อมูลใหม่เป็น field ไหน
        const lower = text.toLowerCase();
        if (!claim.purchaseFrom && !claim.purchaseDate && !claim.symptoms) {
          // ยังไม่มีอะไรเลย → เก็บเป็น purchaseFrom (ร้านที่ซื้อ)
          await db.collection("manual_claims").updateOne({ _id: claim._id }, {
            $set: { purchaseFrom: text, updatedAt: new Date() },
          });
          const smartQ = await aiClaimQuestion({ ...claim, purchaseFrom: text }, text);
          return smartQ || await getTemplate("claim_ask_date") || "ประมาณซื้อเมื่อไหร่คะ";
        }
        if (claim.purchaseFrom && !claim.purchaseDate) {
          await db.collection("manual_claims").updateOne({ _id: claim._id }, {
            $set: { purchaseDate: text, updatedAt: new Date() },
          });
          const smartQ = await aiClaimQuestion({ ...claim, purchaseDate: text }, text);
          return smartQ || await getTemplate("claim_ask_symptoms") || "อาการเป็นยังไงคะ";
        }
        if (claim.purchaseFrom && claim.purchaseDate && !claim.symptoms) {
          await db.collection("manual_claims").updateOne({ _id: claim._id }, {
            $set: { symptoms: text, updatedAt: new Date() },
          });
          const smartQ = await aiClaimQuestion({ ...claim, symptoms: text }, text);
          return smartQ || await getTemplate("claim_ask_phone") || "ขอเบอร์โทรติดต่อกลับหน่อยนะคะ";
        }
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
      return `เรื่องเคลมของพี่อยู่ระหว่างตรวจสอบค่ะ${claim.wpTicketNumber ? " (ใบเคลม: " + claim.wpTicketNumber + ")" : ""}\nทีมงานจะติดต่อกลับเร็วที่สุดค่ะ\n\nมีอะไรเพิ่มเติมทักมาได้เลยนะคะ`;

    default:
      return `เรื่องเคลมของพี่สถานะ: ${claim.status} ค่ะ${claim.wpTicketNumber ? "\nใบเคลม: " + claim.wpTicketNumber : ""}\nสอบถามเพิ่มเติมได้ค่ะ`;
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
};
