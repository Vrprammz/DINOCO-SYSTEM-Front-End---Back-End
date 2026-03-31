/**
 * auth.js — Security middleware: auth, sanitization, rate limiters
 * V.1.0 — Extracted from index.js monolith
 */
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

// === [Security] API Authentication Middleware ===
function requireAuth(req, res, next) {
  const token = req.headers["authorization"]?.replace("Bearer ", "")
    || req.headers["x-api-key"];
  const secret = process.env.API_SECRET_KEY;
  if (!secret) { return res.status(503).json({ error: "Server misconfigured" }); }
  if (!token) { return res.status(401).json({ error: "Unauthorized" }); }
  try {
    if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret))) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  } catch { return res.status(401).json({ error: "Unauthorized" }); }
  next();
}

// === [Security] Sanitize sourceId to prevent NoSQL injection ===
function sanitizeId(id) {
  if (typeof id !== "string") return "";
  return id.replace(/[^a-zA-Z0-9_\-]/g, "").substring(0, 100);
}

// === [Security] PII Masking ===
function maskPII(text) {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/\b\d{1}[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d{1}\b/g, "[เลขบัตรประชาชน]")
    .replace(/\b0[689]\d[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g, "[เบอร์โทร]")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[อีเมล]")
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[เลขบัตร]")
    .replace(/\b\d{10,15}\b/g, "[เลขบัญชี]");
}

// === [Security] Prompt Injection Protection ===
function sanitizeForAI(text) {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/ignore\s+(all\s+)?previous\s+instructions?/gi, "[filtered]")
    .replace(/forget\s+(all\s+)?previous\s+(instructions?|context)/gi, "[filtered]")
    .replace(/you\s+are\s+now\s+/gi, "[filtered]")
    .replace(/system\s*:\s*/gi, "[filtered]")
    .replace(/\bact\s+as\s+/gi, "[filtered]")
    .replace(/pretend\s+(you\s+are|to\s+be)\s+/gi, "[filtered]")
    .replace(/reveal\s+(your|the)\s+(system|initial)\s+prompt/gi, "[filtered]")
    .replace(/what\s+(is|are)\s+your\s+(system|initial)\s+(prompt|instructions)/gi, "[filtered]")
    .replace(/ลืม(คำสั่ง|instruction|prompt|ทุกอย่าง).*/gi, "[filtered]")
    .replace(/เปลี่ยน(บทบาท|role|persona|ตัวตน).*/gi, "[filtered]")
    .replace(/แสดง.*(system|prompt|คำสั่ง|ภายใน).*/gi, "[filtered]")
    .replace(/บอก.*(api|key|token|รหัส|password|ราคาต้นทุน|dealer).*/gi, "[filtered]")
    .replace(/เป็น(หุ่นยนต์|bot|developer|admin|โปรแกรมเมอร์).*/gi, "[filtered]")
    .replace(/ทำเป็น.*(ไม่รู้กฎ|ไม่มีข้อจำกัด|ไม่มีกฎ).*/gi, "[filtered]");
}

// === [Security] Helper — sanitize + mask ===
function cleanForAI(text) {
  return maskPII(sanitizeForAI(text));
}

// === Rate Limiters ===
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "คำขอมากเกินไป กรุณารอสักครู่" },
  standardHeaders: true,
  legacyHeaders: false,
});

const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "ส่งข้อความเร็วเกินไป กรุณารอสักครู่" },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "อัพโหลดมากเกินไป กรุณารอสักครู่" },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  requireAuth,
  sanitizeId,
  maskPII,
  sanitizeForAI,
  cleanForAI,
  aiLimiter,
  sendLimiter,
  uploadLimiter,
};
