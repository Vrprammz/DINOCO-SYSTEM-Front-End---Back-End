/**
 * claim-flow.js — Manual claim flow, claim detection, Vision AI analysis
 * V.1.1 — Boss Command: dynamic message templates
 */
const { getDB, getTemplate } = require("./shared");
const { callDinocoAPI } = require("./dinoco-cache");

// Forward declarations
let analyzeImage = null;

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

async function startClaimFlow(sourceId, platform, customerName) {
  const db = await getDB();
  if (!db) return null;
  const existing = await getClaimSession(sourceId);
  if (existing) return existing;
  const claim = {
    sourceId, platform, customerName,
    status: "photo_requested", photos: [], aiAnalysis: null,
    serial: null, product: null, purchaseFrom: null, purchaseDate: null,
    symptoms: null, phone: null, address: null,
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
    claim = await startClaimFlow(sourceId, platform, customerName);
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
          return await getTemplate("claim_photo_received") || "ได้รูปแล้วค่ะ ขอบคุณนะคะ\nสินค้ารุ่นอะไรคะ";
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
        return await getTemplate("claim_ask_shop") || "ซื้อจากร้านไหนคะ";
      }
      return "สินค้ารุ่นอะไรคะ";
    }

    case "info_collecting": {
      if (!claim.purchaseFrom && text) {
        await db.collection("manual_claims").updateOne({ _id: claim._id }, {
          $set: { purchaseFrom: text, updatedAt: new Date() },
        });
        return await getTemplate("claim_ask_date") || "ประมาณซื้อเมื่อไหร่คะ";
      }
      if (claim.purchaseFrom && !claim.purchaseDate && text) {
        await db.collection("manual_claims").updateOne({ _id: claim._id }, {
          $set: { purchaseDate: text, updatedAt: new Date() },
        });
        return await getTemplate("claim_ask_symptoms") || "อาการเป็นยังไงคะ";
      }
      if (claim.purchaseFrom && claim.purchaseDate && !claim.symptoms && text) {
        await db.collection("manual_claims").updateOne({ _id: claim._id }, {
          $set: { symptoms: text, updatedAt: new Date() },
        });
        return await getTemplate("claim_ask_phone") || "ขอเบอร์โทรติดต่อกลับหน่อยนะคะ";
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
