/**
 * Agent Registry — Static mapping of all 28 AI Agents
 * V.1.0
 */

export interface AgentInfo {
  name: string;
  emoji: string;
  color: string;
  role: string;
  category: "advisor" | "mayom";
  description: string;
  cronType?: string; // maps to /api/leads/cron/:type
}

export const AGENT_REGISTRY: Record<string, AgentInfo> = {
  "problem-solver": {
    name: "แก้ปัญหาลูกค้า",
    emoji: "\u{1F50D}",
    color: "#f87171",
    role: "Problem Solver",
    category: "advisor",
    description: "วิเคราะห์ปัญหาลูกค้า แนะนำวิธีแก้ไข",
  },
  "sales-hunter": {
    name: "ประสานตัวแทน",
    emoji: "\u{1F91D}",
    color: "#fbbf24",
    role: "Dealer Connector",
    category: "advisor",
    description: "จับสัญญาณลูกค้าสนใจ → สร้าง Lead → แจ้งตัวแทนจำหน่าย",
  },
  "team-coach": {
    name: "วิเคราะห์ทีม",
    emoji: "\u{1F468}\u200D\u{1F3EB}",
    color: "#a78bfa",
    role: "Team Coach",
    category: "advisor",
    description: "วิเคราะห์ response time ทีมงาน + แนะนำปรับปรุง",
  },
  "weekly-strategist": {
    name: "วางกลยุทธ์",
    emoji: "\u{1F4CB}",
    color: "#60a5fa",
    role: "Weekly Strategist",
    category: "advisor",
    description: "สรุปกลยุทธ์ประจำสัปดาห์",
  },
  "health-monitor": {
    name: "สุขภาพลูกค้า",
    emoji: "\u2764\uFE0F",
    color: "#f472b6",
    role: "Health Monitor",
    category: "advisor",
    description: "ติดตามสุขภาพความสัมพันธ์ลูกค้า",
  },
  "payment-guardian": {
    name: "ตรวจชำระเงิน",
    emoji: "\u{1F4B3}",
    color: "#34d399",
    role: "Payment Guardian",
    category: "advisor",
    description: "ตรวจจับคำขอชำระเงิน + ยืนยันสลิป",
  },
  "order-tracker": {
    name: "ติดตามจัดส่ง",
    emoji: "\u{1F4E6}",
    color: "#fb923c",
    role: "Order Tracker",
    category: "advisor",
    description: "ติดตามสถานะจัดส่งสินค้า",
  },
  "re-engagement-bot": {
    name: "ดึงลูกค้ากลับ",
    emoji: "\u{1F504}",
    color: "#38bdf8",
    role: "Re-engagement",
    category: "advisor",
    description: "ส่งข้อความดึงลูกค้าที่หายไปกลับมา",
  },
  "upsell-crosssell": {
    name: "แนะนำสินค้าเสริม",
    emoji: "\u{1F3AF}",
    color: "#c084fc",
    role: "Product Advisor",
    category: "advisor",
    description: "วิเคราะห์ลูกค้าที่ซื้อแล้ว → แนะนำสินค้าเสริมให้ตัวแทน",
  },
  "daily-report": {
    name: "สรุปรายวัน",
    emoji: "\u{1F4CA}",
    color: "#2dd4bf",
    role: "Daily Report",
    category: "advisor",
    description: "สรุป leads + claims + sentiment + ตัวแทนรายวัน",
  },
  "lead-scorer": {
    name: "ให้คะแนน Lead",
    emoji: "\u{1F3C6}",
    color: "#facc15",
    role: "Lead Scorer",
    category: "advisor",
    description: "ให้คะแนน Lead ตามพฤติกรรม",
  },
  "appointment-reminder": {
    name: "เตือนนัดหมาย",
    emoji: "\u{1F4C5}",
    color: "#fb7185",
    role: "Reminder",
    category: "advisor",
    description: "เตือนนัดหมาย + follow-up",
  },
  "price-watcher": {
    name: "ตรวจราคา",
    emoji: "\u{1F4B5}",
    color: "#a3e635",
    role: "Price Watcher",
    category: "advisor",
    description: "ตรวจสอบราคา + เปรียบเทียบตลาด",
  },
  "sentiment-analyzer": {
    name: "วิเคราะห์ Sentiment",
    emoji: "\u{1F60A}",
    color: "#f59e0b",
    role: "Sentiment",
    category: "advisor",
    description: "วิเคราะห์อารมณ์ลูกค้าจากแชท",
  },
  "qa-extractor": {
    name: "ดึง Q&A",
    emoji: "\u{1F4DD}",
    color: "#8b5cf6",
    role: "QA Extractor",
    category: "advisor",
    description: "ดึงคำถาม-คำตอบจากแชทเข้า KB",
  },
  "tag-manager": {
    name: "แท็กอัตโนมัติ",
    emoji: "\u{1F3F7}\uFE0F",
    color: "#06b6d4",
    role: "Tag Manager",
    category: "advisor",
    description: "แท็กลูกค้าอัตโนมัติจากพฤติกรรม",
  },
  "sla-monitor": {
    name: "SLA ตัวแทน",
    emoji: "\u23F1\uFE0F",
    color: "#ef4444",
    role: "SLA Monitor",
    category: "advisor",
    description: "ตรวจสอบ SLA ตัวแทนจำหน่าย",
  },
  "knowledge-updater": {
    name: "อัพเดทความรู้",
    emoji: "\u{1F4DA}",
    color: "#10b981",
    role: "KB Updater",
    category: "advisor",
    description: "อัพเดท Knowledge Base อัตโนมัติ",
  },
  "demand-forecaster": {
    name: "พยากรณ์ Demand",
    emoji: "\u{1F4C8}",
    color: "#6366f1",
    role: "Demand Forecast",
    category: "advisor",
    description: "พยากรณ์ความต้องการสินค้า",
  },
  "compatibility-mapper": {
    name: "รุ่นรถ Fitment",
    emoji: "\u{1F3CD}\uFE0F",
    color: "#ec4899",
    role: "Compatibility",
    category: "advisor",
    description: "จับคู่สินค้ากับรุ่นรถ",
  },
  "warranty-intelligence": {
    name: "วิเคราะห์เคลม",
    emoji: "\u{1F6E1}\uFE0F",
    color: "#14b8a6",
    role: "Warranty Intel",
    category: "advisor",
    description: "วิเคราะห์ pattern การเคลม",
  },
  // --- Mayom Agents ---
  "mayom-first-check": {
    name: "เช็คแรก T+4hr",
    emoji: "\u{1F34B}",
    color: "#a3e635",
    role: "First Check",
    category: "mayom",
    description: "เช็คลูกค้าใหม่ภายใน 4 ชม.",
    cronType: "first-check",
  },
  "mayom-contact-recheck": {
    name: "เช็คซ้ำ T+24hr",
    emoji: "\u{1F34B}",
    color: "#a3e635",
    role: "Contact Recheck",
    category: "mayom",
    description: "เช็คซ้ำลูกค้าที่ยังไม่ตอบ 24 ชม.",
    cronType: "contact-recheck",
  },
  "mayom-delivery-check": {
    name: "เช็คจัดส่ง",
    emoji: "\u{1F34B}",
    color: "#a3e635",
    role: "Delivery Check",
    category: "mayom",
    description: "ตรวจสอบสถานะจัดส่งสินค้า",
    cronType: "delivery-check",
  },
  "mayom-install-check": {
    name: "เช็คติดตั้ง",
    emoji: "\u{1F34B}",
    color: "#a3e635",
    role: "Install Check",
    category: "mayom",
    description: "เช็คว่าลูกค้าติดตั้งแล้วหรือยัง",
    cronType: "install-check",
  },
  "mayom-30day-check": {
    name: "เช็ค 30 วัน",
    emoji: "\u{1F34B}",
    color: "#a3e635",
    role: "30-Day Check",
    category: "mayom",
    description: "ติดตามหลังขาย 30 วัน",
    cronType: "30day-check",
  },
  "mayom-dormant-cleanup": {
    name: "ล้าง Dormant",
    emoji: "\u{1F9F9}",
    color: "#78716c",
    role: "Cleanup",
    category: "mayom",
    description: "ปิด Lead ที่ไม่มีการตอบสนอง",
    cronType: "dormant-cleanup",
  },
  "mayom-dealer-sla-weekly": {
    name: "SLA สัปดาห์",
    emoji: "\u{1F4CA}",
    color: "#0ea5e9",
    role: "Dealer SLA",
    category: "mayom",
    description: "สรุป SLA ตัวแทนรายสัปดาห์",
    cronType: "dealer-sla-weekly",
  },
  "mayom-closing-soon": {
    name: "Window ใกล้หมด",
    emoji: "\u23F0",
    color: "#f97316",
    role: "Closing Soon",
    category: "mayom",
    description: "แจ้ง Lead ที่ window กำลังจะหมด",
    cronType: "closing-soon",
  },
};

export const AGENT_CATEGORIES = [
  { key: "all", label: "ทั้งหมด" },
  { key: "advisor", label: "Advisor" },
  { key: "mayom", label: "มะยม" },
  { key: "error", label: "ผิดพลาด" },
] as const;

export type AgentCategory = (typeof AGENT_CATEGORIES)[number]["key"];

export function getAgentsByCategory(category: AgentCategory): [string, AgentInfo][] {
  const entries = Object.entries(AGENT_REGISTRY);
  if (category === "all") return entries;
  if (category === "error") return []; // filtered by runtime status
  return entries.filter(([, info]) => info.category === category);
}
