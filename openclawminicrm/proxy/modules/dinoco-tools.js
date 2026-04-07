/**
 * dinoco-tools.js — AGENT_TOOLS definition, executeTool, KB suggestions
 * V.3.1 — Fix: ลบคำว่า "พี่" ออกจาก lead response template
 */
const { getDB, DEFAULT_BOT_NAME, mcpTools, mcpToolHandlers, getDynamicKeySync } = require("./shared");
const { callDinocoAPI } = require("./dinoco-cache");

// === Send Claim Alert to Admin LINE Group ===
async function sendClaimAlertToAdmin(claim, statusTh, sourceId) {
  const token = getDynamicKeySync("LINE_CHANNEL_ACCESS_TOKEN");
  const adminGroup = process.env.B2B_ADMIN_GROUP_ID;
  if (!token || !adminGroup) return;

  const ticketNum = claim.wpTicketNumber || "N/A";
  const claimId = claim._id ? String(claim._id) : "";
  const liffId = process.env.B2B_LIFF_ID || process.env.B2F_LIFF_ID || "";
  const wpDomain = process.env.DINOCO_WP_DOMAIN || "dinoco.in.th";
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?page=claim&id=${claimId}` : `https://${wpDomain}/ai-center/?page=claim&id=${claimId}`;

  const flex = {
    type: "flex",
    altText: `ลูกค้าตามเคลม ${ticketNum}`,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical",
        contents: [
          { type: "text", text: "ลูกค้าตามงานเคลม", weight: "bold", size: "lg", color: "#FF6B00" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "md",
        contents: [
          { type: "text", text: `ใบเคลม: ${ticketNum}`, size: "md", weight: "bold" },
          { type: "text", text: `ลูกค้า: ${claim.customerName || "-"}`, size: "sm" },
          { type: "text", text: `สินค้า: ${claim.product || "-"}`, size: "sm" },
          { type: "text", text: `อาการ: ${claim.symptoms || "-"}`, size: "sm", wrap: true },
          { type: "separator" },
          { type: "text", text: `สถานะ: ${statusTh}`, size: "md", weight: "bold", color: "#1A3A5C" },
          { type: "text", text: `เบอร์โทร: ${claim.phone || "-"}`, size: "sm" },
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "button", action: { type: "uri", label: "ดูใบเคลม + อัพเดท", uri: liffUrl }, style: "primary", color: "#FF6B00", height: "sm" },
          ...(claim.phone ? [{ type: "button", action: { type: "uri", label: `โทรลูกค้า ${claim.phone}`, uri: `tel:${claim.phone}` }, style: "secondary", height: "sm" }] : []),
        ],
      },
    },
  };

  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: adminGroup, messages: [flex] }),
  }).catch(e => console.error("[ClaimAlert] LINE push error:", e.message));

  console.log(`[ClaimAlert] Sent to Admin LINE: ${ticketNum} (${statusTh})`);
}

// Forward declarations — set by init()
let searchMessages = null;
let getRecentMessages = null;
let callMCPTool = null;

function init(deps) {
  searchMessages = deps.searchMessages;
  getRecentMessages = deps.getRecentMessages;
  callMCPTool = deps.callMCPTool;
}

const AGENT_TOOLS = [
  // ★ V.2.0: kb_search อยู่ตำแหน่งแรกของ DINOCO tools — Gemini มีแนวโน้มเลือก tool แรกที่ match
  {
    type: "function",
    function: {
      name: "dinoco_kb_search",
      description: "★ PRIORITY TOOL — ค้นคลังความรู้ DINOCO ต้องเรียก tool นี้เมื่อลูกค้าถามเรื่อง: สเปค/น้ำหนัก/ขนาด/มิติ, ประกัน/เคลม/ระยะเวลาซ่อม, ที่อยู่ส่งเคลม/ออฟฟิศ, วัสดุ/อลูมิเนียม/สนิม/กันน้ำ, ใบเสร็จ/invoice, การ์ดแฮนด์สเปค, วิธีติดตั้ง, PRO vs STD, คืนสินค้า/ผ่อน, เวลาทำการ, แบรนด์/ผลิตที่ไหน, แปลภาษา — ห้ามตอบจากความจำ ต้องเรียก tool นี้ก่อนเสมอ",
      parameters: {
        type: "object",
        properties: { question: { type: "string", description: "คำถาม เช่น 'การ์ดแฮนด์สเปค น้ำหนัก' 'ระยะเวลาเคลมกี่วัน' 'ที่อยู่ส่งเคลม' 'ใบเสร็จ' 'แปลภาษาอังกฤษ'" } },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_history",
      description: "ค้นหาประวัติสนทนาที่เกี่ยวข้องจากฐานข้อมูล ใช้เมื่อต้องการหาว่าเคยคุยเรื่องอะไร",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "คำค้นหา เช่น 'ราคา' 'นัดหมาย' 'สินค้า'" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics",
      description: "ดูคะแนนวิเคราะห์ความรู้สึกและแนวโน้มซื้อของลูกค้า ใช้เมื่อต้องการดูสถิติหรือข้อมูลลูกค้า",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "dinoco_product_lookup",
      description: "ค้นหาสินค้า DINOCO พร้อมราคา+รูป ใช้เมื่อลูกค้าถามเรื่องราคา ดูรูปสินค้า หรือสต็อก (ถ้าถามเรื่องสเปค/น้ำหนัก/ขนาด ให้ใช้ dinoco_kb_search แทน)",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "ชื่อสินค้า + รุ่นรถ เช่น 'แคชบาร์ ADV 350' หรือ 'กล่องข้าง Forza'" },
          category: { type: "string", description: "หมวดหมู่: กล่องข้าง, กล่องหลัง, กันล้ม, แร็ค, ถาดรอง, การ์ดแฮนด์, กระเป๋า" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dinoco_dealer_lookup",
      description: "ค้นหาตัวแทนจำหน่าย DINOCO ตามจังหวัดหรือพื้นที่ ใช้เมื่อลูกค้าถามว่าซื้อได้ที่ไหน หรือมีร้านแถวไหน",
      parameters: {
        type: "object",
        properties: { location: { type: "string", description: "จังหวัดหรือพื้นที่ เช่น 'เชียงใหม่' 'บางนา' 'กทม'" } },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dinoco_warranty_check",
      description: "เช็คสถานะการรับประกันสินค้า DINOCO จากเลข Serial หรือเบอร์โทร ใช้เมื่อลูกค้าส่งเลข serial DN-XXXXX หรือเบอร์โทรมาเช็คประกัน",
      parameters: {
        type: "object",
        properties: {
          serial: { type: "string", description: "เลข serial number เช่น 'DN-12345'" },
          phone: { type: "string", description: "เบอร์โทรที่ลงทะเบียน" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dinoco_escalate",
      description: "ส่งเรื่องให้แอดมิน DINOCO (คนจริง) มาตอบแทน ใช้เมื่อ: ลูกค้าขอคุยกับคน, ปัญหาซับซ้อน, ไม่มีข้อมูลในระบบ, ลูกค้าไม่พอใจมาก",
      parameters: {
        type: "object",
        properties: { reason: { type: "string", description: "เหตุผลที่ส่งต่อ เช่น 'ลูกค้าต้องการคุยกับคน' 'ปัญหาสินค้าที่ไม่มีในระบบ'" } },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dinoco_create_lead",
      description: "สร้าง lead อัตโนมัติเมื่อแนะนำตัวแทนจำหน่ายให้ลูกค้าแล้ว + แจ้งตัวแทนผ่าน LINE push ใช้ทุกครั้งที่ลูกค้าสนใจสินค้าและต้องการให้ตัวแทนติดต่อกลับ",
      parameters: {
        type: "object",
        properties: {
          product_interest: { type: "string", description: "สินค้าที่สนใจ เช่น 'แคชบาร์ ADV 350 PRO'" },
          province: { type: "string", description: "จังหวัดของลูกค้า เช่น 'เชียงใหม่'" },
          dealer_name: { type: "string", description: "ชื่อร้านตัวแทนที่แนะนำ" },
          dealer_id: { type: "string", description: "ID ตัวแทน (จาก dealer-lookup)" },
          customer_name: { type: "string", description: "ชื่อลูกค้า (ถ้ารู้)" },
          phone: { type: "string", description: "เบอร์โทรลูกค้า (ถ้าให้มา)" },
        },
        required: ["product_interest", "dealer_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dinoco_claim_status",
      description: "เช็คสถานะเคลม/ใบเคลม ใช้เมื่อลูกค้าถามเรื่องเคลม ตามงานเคลม หรือพูดถึงเลขใบเคลม MC-XXXXX",
      parameters: {
        type: "object",
        properties: {
          ticket_number: { type: "string", description: "เลขใบเคลม เช่น MC-05901" },
          phone: { type: "string", description: "เบอร์โทรลูกค้า (ถ้าไม่มีเลขเคลม)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dinoco_create_claim",
      description: "★ เปิดใบเคลมสินค้า DINOCO เข้าระบบ — ใช้เมื่อลูกค้าต้องการเคลม+ได้ข้อมูลครบแล้ว ★ ห้ามเรียกถ้ายังไม่ได้ข้อมูลครบ ต้องถามก่อน: อาการ + ภาพบัตรรับประกัน + ภาพสินค้า + เบอร์โทร + ชื่อ + ที่อยู่จัดส่ง",
      parameters: {
        type: "object",
        properties: {
          symptoms: { type: "string", description: "อาการ/ปัญหา เช่น 'กล่องบุบจากล้มรถ' 'สติกเกอร์ลอก' 'กุญแจหาย'" },
          phone: { type: "string", description: "เบอร์โทรลูกค้า เช่น '0812345678'" },
          customer_name: { type: "string", description: "ชื่อ-นามสกุลลูกค้า" },
          customer_address: { type: "string", description: "ที่อยู่จัดส่งสินค้ากลับ" },
          product: { type: "string", description: "สินค้าที่เคลม เช่น 'กล่อง 45L สีดำ' 'กันล้ม ADV350'" },
          photos: { type: "array", items: { type: "string" }, description: "URL รูปถ่าย (บัตรรับประกัน + สินค้าที่มีปัญหา + รถทั้งคัน)" },
          serial: { type: "string", description: "เลขที่ใบรับประกัน (ถ้ามี)" },
          purchase_from: { type: "string", description: "ร้านที่ซื้อสินค้า (ถ้ารู้)" },
        },
        required: ["symptoms", "phone", "customer_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_stock_status",
      description: "ตรวจสอบสถานะสต็อกสินค้า ว่ามีสินค้าหรือไม่ ใกล้หมดหรือไม่ และ ETA ถ้าหมด ใช้เมื่อลูกค้าถามว่า 'มีของไหม' 'หมดไหม' 'เมื่อไหร่จะมี' 'พร้อมส่งไหม'",
      parameters: {
        type: "object",
        properties: {
          product_name_or_sku: { type: "string", description: "ชื่อสินค้าหร��อ SKU ที่ต้องการเช็ค เช่น 'แคชบาร์ ADV350' หรือ 'DNK-CB-ADV350-PRO'" },
        },
        required: ["product_name_or_sku"],
      },
    },
  },
];

// === Execute Tool ===
async function executeTool(toolName, args, sourceId) {
  if (toolName === "search_history") {
    const docs = await searchMessages(sourceId, args.query || "", 5);
    if (docs.length === 0) {
      const recent = await getRecentMessages(sourceId, 5);
      return recent.map((d) => `[${d.role === "assistant" ? "Bot" : d.userName || "User"}] ${d.content}`).join("\n") || "ไม่มีประวัติ";
    }
    return docs.map((d) => `[${d.role === "assistant" ? "Bot" : d.userName || "User"}] ${d.content}`).join("\n");
  }
  if (toolName === "get_analytics") {
    const database = await getDB();
    if (!database) return "ไม่มีข้อมูล";
    const data = await database.collection("chat_analytics").findOne({ sourceId });
    if (!data) return "ยังไม่มีการวิเคราะห์";
    return `Sentiment: ${data.sentiment?.score}/100 (${data.sentiment?.level}) — ${data.sentiment?.reason}\nPurchase: ${data.purchaseIntent?.score}/100 (${data.purchaseIntent?.level}) — ${data.purchaseIntent?.reason}`;
  }
  if (toolName === "dinoco_product_lookup") {
    // ★ V.2.0: ตรวจว่า query มี spec keywords → auto-append KB search หลัง product result
    const SPEC_KEYWORDS = /สเปค|น้ำหนัก|ขนาด|มิติ|ซม\.|กก\.|กิโล|หนัก|เบา|กว้าง|ยาว|สูง|weight|spec|kg|cm|ลิตร|ความจุ|วัสดุ|อลูมิเนียม|สแตนเลส|ทำจากอะไร/i;
    const queryNeedsSpec = SPEC_KEYWORDS.test(args.query || "");
    // ค้นจาก cached catalog ก่อน (เร็ว + ไม่ timeout)
    const { wpCache } = require("./dinoco-cache");
    const catalog = wpCache.catalog?.data || wpCache.catalog?.stale;
    if (catalog?.products && catalog.products.length > 0) {
      const rawQuery = (args.query || "").toLowerCase();
      const cat = (args.category || "").toLowerCase();

      // Alias mapping จาก KB training_phrases จริง — 85 entries
      const ALIASES = {
        // กันล้ม / แคชบาร์ (KB #29, #67, #79, #80, #82)
        "แคชบาร์": "crash bar", "แค๊ชบาร์": "crash bar", "แครชบาร์": "crash bar", "แคชบา": "crash bar",
        "แคทบาร์": "crash bar", "แคสบาร์": "crash bar", "แค็ชบาร์": "crash bar", "เเคชบาร์": "crash bar",
        "กันล้ม": "crash bar", "เหล็กกันล้ม": "crash bar", "โครงเหล็กกันรถ": "crash bar",
        "เหล็กป้องกัน": "crash bar", "กันกระแทก": "crash bar", "การ์ดเครื่อง": "crash bar",
        "โครงกัน": "crash bar", "crashbar": "crash bar", "crash bar": "crash bar",
        "บาร์กันล้ม": "crash bar", "กันล้มรถ": "crash bar", "ประกับกันล้ม": "crash bar", "ประกับแคชบาร์": "crash bar",
        // กล่องหลัง (KB #28, #76)
        "ปี๊บ": "case", "ปี๊ป": "case", "ปิ้บ": "case", "ปิ๊บ": "case",
        "ปี๊บหลัง": "top case", "ปี๊ปหลัง": "top case", "กะบ๊อกหลัง": "top case",
        "กล่องท้าย": "top case", "กล่องหลัง": "top case", "กล่องท้ายรถ": "top case",
        "กล่องอลูมิเนียมหลัง": "top case", "กล่องอลูหลัง": "top case",
        "กล่อง": "case", "กล่องอลู": "case", "กล่องอลูมิเนียม": "case", "กล่องเหล็ก": "case",
        "topbox": "top case", "ท็อปบ็อก": "top case", "ท็อปเคส": "top case",
        "topcase": "top case", "top case": "top case",
        // กล่องข้าง (KB #34, #47, #64, #81)
        "กล่องข้าง": "side case", "ปี๊บข้าง": "side case", "ปิ้ปข้าง": "side case", "ปี๊ปข้าง": "side case",
        "กล่องข้างอลู": "side case", "กล่องข้างอลูมิเนียม": "side case", "กล่องอลูมิเนียมข้าง": "side case",
        "กล่องอลูข้าง": "side case", "กะบ๊อกข้าง": "side case",
        "sidebox": "side case", "ไซด์บ็อก": "side case", "ไซด์เคส": "side case",
        "ไซด์บอกซ์": "side case", "side case": "side case", "side box": "side case",
        // แร็ค (KB #9, #35, #63, #74, #83)
        "แร็ค": "rack", "แร็ก": "rack", "แร๊ก": "rack", "แร๊ค": "rack",
        "ตะแกรง": "rack", "ตะแกรงท้าย": "rack", "โครงยึดกล่อง": "rack", "เหล็กยึดกล่อง": "rack",
        "แร็คข้าง": "side rack", "ไซด์แร็ค": "side rack", "แร็คหลัง": "rack", "แร็คท้าย": "rack",
        "แร็คโปร": "rack pro", "แร็คสแตนดาร์ด": "rack", "top rack": "rack", "side rack": "side rack",
        // ถาดรอง (KB #44)
        "ถาดรอง": "plate", "เบสเพลท": "plate", "ถาดกล่อง": "plate", "ถาดบนแร็ค": "plate",
        "ตัวล็อคกล่อง": "plate", "baseplate": "plate", "base plate": "plate",
        "ถาดยึดกล่อง": "plate", "quick release": "plate", "ถาดสแตนเลส": "plate", "แผ่นรองกล่อง": "plate",
        // การ์ดแฮนด์ (KB #85)
        "การ์ดแฮนด์": "hand protector", "การ์ด": "hand protector", "handguard": "hand protector",
        // กระเป๋า (KB #70)
        "กระเป๋า": "bag", "กระเป๋ากันน้ำ": "bag", "drybag": "bag", "dry bag": "bag",
        "กระเป๋าเสริม": "bag", "กระเป๋ากันน้ำดิโนโก้": "bag",
        // ยกแฮนด์ / เบาะพิง
        "ยกแฮนด์": "handlebar riser", "riser": "handlebar riser",
        "เบาะพิง": "pad", "เบาะ": "pad", "พนักพิง": "pad",
        // รุ่นรถ (KB #43, #45, #46, #48, #60, #61, #66, #77)
        "adv350": "adv350", "adv 350": "adv350", "เอดีวี350": "adv350",
        "adv": "adv", "เอดีวี": "adv", "แอดวี": "adv",
        "forza350": "forza350", "forza 350": "forza350", "ฟอร์ซ่า350": "forza350",
        "forza": "forza", "ฟอร์ซ่า": "forza",
        "forza750": "forza750", "forza 750": "forza750",
        "nx": "nx500", "nx500": "nx500", "nx 500": "nx500", "เอ็นเอ็ก": "nx500",
        "cb": "cb500x", "cb500": "cb500x", "cb500x": "cb500x", "cb 500": "cb500x", "ซีบี": "cb500x",
        "xl750": "xl750", "transalp": "xl750", "ทรานซัลป์": "xl750", "ทรานซาลป์": "xl750",
        "xadv": "xadv", "x-adv": "xadv", "xadv750": "xadv", "adv750": "xadv", "เอ็กแอดวี": "xadv",
        // วัสดุ / สี
        "iron": "iron", "เหล็ก": "iron",
        "stainless": "stainless", "สแตนเลส": "stainless", "สแตนเลส304": "stainless",
        "triple black": "triple black", "ทริปเปิ้ลแบล็ค": "triple black",
        "pro": "pro", "std": "standard", "สแตนดาร์ด": "standard",
      };

      // แยก query เป็นคำ + แปลง alias
      let searchTerms = rawQuery.split(/[\s,+]+/).filter(Boolean);
      searchTerms = searchTerms.map(t => ALIASES[t] || t);
      // เพิ่ม alias ของ query ทั้ง string
      if (ALIASES[rawQuery]) searchTerms.push(ALIASES[rawQuery]);

      // ★ V.4.3: กรองสินค้าที่หยุดจำหน่ายถาวร ออก (ไม่กรองหมดสต็อกชั่วคราว)
      const activeProducts = catalog.products.filter(p => {
        // b2b_visible = false → Admin ซ่อนจากลูกค้า (หยุดขายถาวร)
        if (p.b2b_visible === false || p.b2b_visible === "0" || p.b2b_visible === 0) return false;
        // mp_status = discontinued → โรงงานหยุดผลิตแล้ว
        if (p.mp_status === "discontinued") return false;
        // X Travel Pro เลิกขาย → ปัจจุบันเป็น Grand Travel
        const name = (p.name || "").toLowerCase();
        if (name.includes("x travel pro")) return false;
        // ★ stock_status = out_of_stock → ยังแสดงได้ แต่บอกว่าหมดชั่วคราว (ไม่ซ่อน)
        return true;
      });

      const matched = activeProducts.filter(p => {
        const name = (p.name || "").toLowerCase();
        const sku = (p.sku || "").toLowerCase();
        const price = (p.price || "").toString();
        // ทุก search term ต้อง match (AND logic)
        return searchTerms.every(term =>
          name.includes(term) || sku.includes(term) || price.includes(term)
        ) || (cat && name.includes(cat));
      });

      // ★ V.1.4: ถ้า AND ไม่เจอ → ลอง OR แต่ต้องมี model match (ป้องกันข้ามรุ่น)
      // ตรวจว่า searchTerms มี model keyword ไหม
      const MODEL_KEYS = ["adv350","adv","forza350","forza","nx500","cb500x","xl750","xadv","forza750"];
      const hasModelTerm = searchTerms.some(t => MODEL_KEYS.includes(t));
      let finalMatched = matched;
      if (matched.length === 0) {
        if (hasModelTerm) {
          // มี model → OR fallback ต้อง match model ด้วย (ห้ามข้ามรุ่น)
          const modelTerms = searchTerms.filter(t => MODEL_KEYS.includes(t));
          finalMatched = catalog.products.filter(p => {
            const name = (p.name || "").toLowerCase();
            return modelTerms.some(mt => name.includes(mt)) &&
                   searchTerms.some(t => !MODEL_KEYS.includes(t) ? (name.includes(t)) : false);
          });
          // ถ้ายังไม่เจอ = สินค้าประเภทนี้ไม่มีสำหรับรุ่นนี้
          if (finalMatched.length === 0) {
            const SCOOTER_NO_SIDE = ["adv350","adv","forza350","forza"];
            const queryCat = searchTerms.join(" ");
            const isSideQuery = /side|ข้าง|sidebox|sidecase/.test(queryCat);
            const isScooter = modelTerms.some(m => SCOOTER_NO_SIDE.includes(m));
            if (isSideQuery && isScooter) {
              return `ไม่มีกล่องข้าง/แร็คข้างสำหรับรุ่นนี้ค่ะ (ADV350/Forza350 ไม่มีกล่องข้าง เนื่องจากข้อจำกัดด้านบาลานซ์และเฟรมรถ) สินค้าที่มี: แร็คหลัง กันล้ม กล่องหลัง\n\n[คำสั่ง: ห้ามแนะนำกล่องข้าง/แร็คข้างให้รุ่นนี้เด็ดขาด ตอบเฉพาะสินค้าที่มีจริง]`;
            }
            return `ไม่พบสินค้าประเภทนี้สำหรับรุ่นนี้ในระบบค่ะ\n\n[คำสั่ง: ถ้าไม่พบ = ไม่มีจริง ห้ามกุสินค้าที่ไม่มีในระบบ]`;
          }
        } else {
          // ไม่มี model → OR fallback ปกติ
          finalMatched = catalog.products.filter(p => {
            const name = (p.name || "").toLowerCase();
            const sku = (p.sku || "").toLowerCase();
            return searchTerms.some(term => name.includes(term) || sku.includes(term));
          });
        }
      }

      if (finalMatched.length > 0) {
        const list = finalMatched.slice(0, 10).map((p) =>
          `${p.name} — ราคา ${p.price ? p.price.toLocaleString() + " บาท" : "สอบถาม"} | SKU: ${p.sku}${p.img_url ? " | รูป: " + p.img_url : ""}${p.warranty_years ? " | ประกัน " + p.warranty_years + " ปี" : ""}`
        ).join("\n");
        let result = `${list}\n\n[คำสั่ง: ตอบเฉพาะสินค้าในรายการนี้เท่านั้น ห้ามแนะนำ/กระซิบ/เสริมสินค้าอื่นที่ไม่อยู่ในรายการนี้เด็ดขาด ถ้าสินค้าไม่อยู่ในรายการ = ไม่มีสำหรับรุ่นนี้]`;
        // ★ V.2.0: auto-append KB specs เมื่อ query มีคำถามสเปค
        if (queryNeedsSpec) {
          try {
            const specResult = await executeTool("dinoco_kb_search", { question: args.query }, sourceId);
            if (specResult && !specResult.includes("ไม่พบข้อมูล")) {
              result += `\n\n=== ข้อมูลสเปคจาก KB ===\n${specResult}`;
            }
          } catch {}
        }
        return result;
      }
    }
    // Fallback: เรียก WordPress API (ถ้า cache ไม่มี)
    const result = await callDinocoAPI("/product-lookup", { query: args.query || "", category: args.category || "" });
    if (typeof result === "string") return result;
    if (!result.found) return result.message || "ไม่พบสินค้า";
    const wpList = result.products.map((p) =>
      `${p.name} — ราคา ${p.price ? p.price.toLocaleString() + " บาท" : "สอบถาม"} | SKU: ${p.sku}${p.img_url ? " | รูป: " + p.img_url : ""}${p.warranty_years ? " | ประกัน " + p.warranty_years + " ปี" : ""}`
    ).join("\n");
    let wpResult = `${wpList}\n\n[คำสั่ง: ตอบเฉพาะสินค้าในรายการนี้เท่านั้น ห้ามแนะนำ/กระซิบ/เสริมสินค้าอื่นที่ไม่อยู่ในรายการนี้เด็ดขาด ถ้าสินค้าไม่อยู่ในรายการ = ไม่มีสำหรับรุ่นนี้]`;
    // ★ V.2.0: auto-append KB specs เมื่อ query มีคำถามสเปค
    if (queryNeedsSpec) {
      try {
        const specResult = await executeTool("dinoco_kb_search", { question: args.query }, sourceId);
        if (specResult && !specResult.includes("ไม่พบข้อมูล")) {
          wpResult += `\n\n=== ข้อมูลสเปคจาก KB ===\n${specResult}`;
        }
      } catch {}
    }
    return wpResult;
  }
  if (toolName === "dinoco_dealer_lookup") {
    const location = args.location || "";
    // ★ V.1.5: ค้น MongoDB KB ก่อน (มีข้อมูลตัวแทนแต่ละจังหวัด) → fallback WP API
    const db = await getDB();
    if (db && location) {
      try {
        const locKeywords = location.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9\s]/g, "").trim();
        const locRegex = locKeywords.split(/\s+/).filter(w => w.length >= 2).join("|");
        if (locRegex) {
          const dealerKB = await db.collection("knowledge_base").find({
            active: { $ne: false },
            $or: [
              { title: { $regex: `ตัวแทน.*${locRegex}|${locRegex}.*ตัวแทน|ร้าน.*${locRegex}`, $options: "i" } },
              { content: { $regex: locRegex, $options: "i" }, title: { $regex: /ตัวแทน|ร้าน|dealer|จังหวัด|ภาค/i } },
            ]
          }).limit(2).toArray();
          if (dealerKB.length > 0) {
            return dealerKB.map(e => `${e.title}\n${e.content}`).join("\n---\n")
              + "\n\n[คำสั่ง: แนะนำร้านตัวแทนตามข้อมูลข้างบน ห้ามกุชื่อร้านที่ไม่มีในข้อมูล]";
          }
        }
      } catch (e) { console.error("[Dealer-Local]", e.message); }
    }
    // Fallback: WordPress API
    const result = await callDinocoAPI("/dealer-lookup", { location });
    if (typeof result === "string") return result;
    if (!result.found) return result.message || "ไม่พบตัวแทนในพื้นที่นี้";
    return `ตัวแทนจำหน่ายในพื้นที่ ${result.location}:\n${result.dealers}\n\nวิธีตอบ: ${result.how_to_respond || ""}`;
  }
  if (toolName === "dinoco_warranty_check") {
    const result = await callDinocoAPI("/warranty-check", { serial: args.serial || "", phone: args.phone || "" });
    if (typeof result === "string") return result;
    if (!result.found) return result.message || "ไม่พบข้อมูลประกัน";
    return result.warranties.map((w) =>
      `Serial: ${w.serial} | สินค้า: ${w.product} | สถานะ: ${w.status} | หมดประกัน: ${w.expiry_date || "-"}${w.is_expired ? " (หมดแล้ว)" : " (ยังประกันอยู่)"}`
    ).join("\n");
  }
  if (toolName === "dinoco_kb_search") {
    const question = args.question || "";
    // ★ V.1.6: ค้น MongoDB KB ก่อน — synonym mapping + multi-strategy search
    const db = await getDB();
    if (db && question) {
      try {
        // Synonym mapping — คำที่ลูกค้าใช้ → คำใน KB
        const SYNONYMS = {
          // วัสดุ/สเปค
          "บุบ": "บุบ|ยุบ|Safety|ซับแรง|อลูมิเนียม 5052|กล่องบุบ|ตกจะยังไง",
          "วัสดุ": "วัสดุ|อลูมิเนียม|5052|ทำจากอะไร|เกรดอะไร|ทำจาก|material",
          "อลูมิเนียม": "อลูมิเนียม|อลู|5052|aluminum|วัสดุ|เกรดอะไร|ทำจากอะไร",
          "สนิม": "สนิม|สแตนเลส|304|Self-healing|ขึ้นสนิม|เป็นสนิม",
          "กันน้ำ": "กันน้ำ|IP67|ซีล|waterproof|น้ำเข้า|ลุยฝน|ฝนตก|รั่ว",
          "น้ำเข้า": "กันน้ำ|น้ำเข้า|รั่ว|ซีล|ลุยฝน|ฝนตก|ซีลยาง|ปิดฝา",
          "สี": "สีกล่อง|สีอะไร|ดำ|เงิน|Black|Silver|Anodize|anodizing|สีไหนดี|มีกี่สี",
          "ขนาด": "ขนาด|มิติ|กว้าง|ยาว|สูง|กี่ลิตร|45L|55L|37L|45|55|ลิตร",
          // กุญแจ/ดูแล
          "กุญแจหาย": "กุญแจหาย|เปลี่ยนกุญแจ|ดอกกุญแจ|กุญแจ",
          "กุญแจฝืด": "กุญแจฝืด|WD-40|สเปรย์|ล็อค|ไขไม่ออก|ฝืด|Sonax",
          "ล้าง": "ล้าง|ทำความสะอาด|แชมพู|เช็ด|ล้างกล่อง|ดูแล",
          "ขัด": "ขัด|Autosol|ครีมขัด|สแตนเลส|ขัดแร็ค|ขัดเงา",
          "มุมแตก": "มุมแตก|มุมพลาสติก|ABS|เปลี่ยนมุม|มุมกล่อง|มุมหัก",
          "สติกเกอร์": "สติกเกอร์|สติ๊กเกอร์|โลโก้|ลอก|เบิก|หลุด|ประกับลอก|ป้ายชื่อ|แผ่นติด",
          "ประกับ": "ประกับ|ชิ้นส่วน|อะไหล่|กันล้ม|กันสไลด์|แคชบาร์|crash bar|slider|สติกเกอร์|เคลม",
          // เคลม/ซ่อม
          "เคลม": "เคลม|claim|ซ่อม|ส่งซ่อม|ระยะเวลา|MC-|กี่วัน|เตรียม",
          "ล้ม": "ล้ม|อุบัติเหตุ|ซ่อมดัด|ฟรีค่าแรง|ล้มแปะ|ล้มรถ",
          "ชนหนัก": "ชนหนัก|เสียรูป|50%|ไม่รับซ่อม|อะไหล่|ชนหนักมาก",
          "ประกัน": "ประกัน|warranty|5 ปี|มือสอง|โอน|ครอบคลุม|จุดเชื่อม|โครงสร้าง",
          "มือสอง": "มือสอง|โอน|สิทธิ์|มือแรก|secondhand",
          "หมดประกัน": "หมดประกัน|หลังประกัน|นอกประกัน|ค่าซ่อม|ค่าแรง",
          // ติดตั้ง/เทคนิค
          "ติดตั้ง": "ติดตั้ง|ค่าแรง|ช่าง|น็อต|ค่าติดตั้ง",
          "คู่มือ": "คู่มือ|manual|วิธีติด|ลิงก์|installation",
          "PRO": "PRO|STD|Standard|แร็คศูนย์|Edition|ลำดับติดตั้ง|ซื้อก่อน|แยก|พร้อมกัน|3 จุด",
          "STD": "STD|Standard|PRO|แร็คศูนย์|ซื้อพร้อมกัน|3 จุด",
          "แร็คข้าง": "แร็คข้าง|side rack|37L|Grand Travel|กล่องยี่ห้ออื่น|GIVI",
          "ลำดับ": "ลำดับ|ติดก่อน|ซื้อก่อน|แร็คหลังก่อน|ข้างก่อน",
          // นโยบาย
          "ผ่อน": "ผ่อน|รูดบัตร|เครดิต|Shopee|Lazada|installment",
          "COD": "COD|เก็บเงินปลายทาง|ปลายทาง|cash on delivery",
          "ออนไลน์": "ออนไลน์|สั่งออนไลน์|สั่งผ่านเน็ต|Shopee|Lazada|Facebook|online",
          "คืน": "คืนสินค้า|เปลี่ยน|refund|คืนได้|ผิดรุ่น",
          "จ่ายเงิน": "จ่ายเงิน|ชำระเงิน|โอน|PromptPay|วิธีจ่าย|payment",
          // ที่อยู่/แบรนด์
          "ออฟฟิศ": "ออฟฟิศ|ลาดพร้าว|จตุจักร|ที่อยู่|โรงงาน|แผนที่|ส่งเคลม",
          "แบรนด์": "แบรนด์|ไทย|PPT|ผลิต|ประเทศอะไร|ของจีน|จีนไหม|ผลิตที่ไหน",
          "จีน": "จีน|ของจีน|งานจีน|china|made in|นำเข้า|ผลิตที่ไหน",
          // สินค้า
          "อะไหล่": "อะไหล่|การ์ดแฮนด์|แยกชิ้น|ขายเป็นชุด|handguard",
          "หมวก": "หมวก|ใส่หมวก|ความจุ|ลิตร|45L|55L|Full Face|กี่ใบ",
          "เบาะ": "เบาะ|พิง|คนซ้อน|backrest|แถม|เบาะพิง|พนักพิง",
          "ถาด": "ถาด|เบสเพลท|baseplate|Quick Release|ล็อค|ถาดรอง",
          "แร็ค": "แร็ค|rack|ตะแกรง|แร็คข้าง|แร็คหลัง|PRO|STD|Top Rack|Side Rack",
          "ส่าย": "ส่าย|Aerodynamic|ลู่ลม|สั่น|หน้าส่าย|ขับเร็ว",
          "กระเป๋า": "กระเป๋า|DRY BAG|EXTREME|กันน้ำ|bag|EXPAND|กระเป๋ากันน้ำ",
          "ตัวแทน": "ตัวแทน|dealer|ร้าน|จำหน่าย|ซื้อที่ไหน",
          "สมัครตัวแทน": "สมัครตัวแทน|เป็นตัวแทน|ดีลเลอร์|ชื่อร้าน|จังหวัด|เบอร์โทร",
          "ด่า": "ร้องเรียน|ไม่พอใจ|แย่|ห่วย|complain|ผิดหวัง",
          "edition": "Edition|ตัวแต่ง|แร็คศูนย์|BigWing",
          "standard": "Standard|สแตนดาร์ด|ตัวธรรมดา|รถเปล่า",
          // สแลง
          "กะบ๊อก": "กล่อง|ปี๊บ|กล่องอลูมิเนียม|กะบ๊อก|box|top case",
          "ปี๊บ": "กล่อง|ปี๊บ|กล่องอลูมิเนียม|กะบ๊อก|box|top case|ปิ๊บ",
          "กะบ๊อกข้าง": "กล่องข้าง|ปี๊บข้าง|side case|side box",
          // เสียง
          "เสียง": "เสียง|ก๊อกแก๊ก|กรอบแกรบ|rattling|ดัง|กระทบ|สั่น",
          "ก๊อกแก๊ก": "เสียง|ก๊อกแก๊ก|กรอบแกรบ|rattling|ดัง|ซับใน|PU",
          // สเปค
          "น้ำหนัก": "น้ำหนัก|กิโล|กก|กรัม|หนัก|เบา|weight|kg",
          "สเปค": "สเปค|ขนาด|มิติ|น้ำหนัก|กว้าง|ยาว|สูง|ซม|cm|spec",
        };
        let searchRegex = question.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9\s]/g, "").trim();
        const words = searchRegex.split(/\s+/).filter(w => w.length >= 2);
        // ★ V.1.8: Strategy 1 — ค้นด้วยคำ original ก่อน (ไม่ expand)
        const originalRegex = words.slice(0, 8).join("|");
        if (originalRegex) {
          const directResults = await db.collection("knowledge_base").find({
            active: { $ne: false },
            $or: [
              { content: { $regex: originalRegex, $options: "i" } },
              { title: { $regex: originalRegex, $options: "i" } },
              { tags: { $regex: originalRegex, $options: "i" } },
            ]
          }).limit(3).toArray();
          if (directResults.length > 0) {
            console.log(`[KB-Local] Direct match: "${originalRegex}" → ${directResults.length} results`);
            return directResults.map(e => `Q: ${e.title}\nA: ${e.content}`).join("\n---\n")
              + "\n\n[คำสั่ง: ตอบจากข้อมูลข้างบนเท่านั้น ห้ามเพิ่มข้อมูลที่ไม่มี]";
          }
        }
        // ★ V.1.8: Strategy 2 — ค้นด้วย synonyms (ถ้า direct ไม่เจอ)
        const expandedTerms = new Set(words);
        for (const word of words) {
          const wLower = word.toLowerCase();
          for (const [key, syns] of Object.entries(SYNONYMS)) {
            // exact match เท่านั้น — ห้าม partial match (ป้องกัน "สี" match "สนิม")
            if (wLower === key || wLower === key.toLowerCase()) {
              syns.split("|").forEach(s => expandedTerms.add(s));
            }
          }
        }
        const regexParts = [...expandedTerms].slice(0, 12).join("|");
        if (regexParts) {
          const localResults = await db.collection("knowledge_base").find({
            active: { $ne: false },
            $or: [
              { content: { $regex: regexParts, $options: "i" } },
              { title: { $regex: regexParts, $options: "i" } },
              { tags: { $regex: regexParts, $options: "i" } },
            ]
          }).limit(3).toArray();
          if (localResults.length > 0) {
            return localResults.map(e => `Q: ${e.title}\nA: ${e.content}`).join("\n---\n")
              + "\n\n[คำสั่ง: ตอบจากข้อมูลข้างบนเท่านั้น ห้ามเพิ่มข้อมูลที่ไม่มี]";
          }
        }
      } catch (e) { console.error("[KB-Local]", e.message); }
    }
    // Fallback: WordPress API
    const result = await callDinocoAPI("/kb-search", { query: question });
    if (typeof result === "string") return result;
    if (!result.found) {
      trackUnansweredQuestion(question, sourceId).catch(() => {});
      return result.message || "ไม่พบข้อมูลในคลังความรู้ — ขอเช็คข้อมูลกับทีมงานก่อนนะคะ";
    }
    return result.entries.map((e) => `Q: ${e.question}\nA: ${e.facts}\nวิธีตอบ: ${e.action}`).join("\n---\n");
  }
  // ★ V.3.0: Stock status query (Phase 4) — ห้าม return stock_qty
  if (toolName === "check_stock_status") {
    const query = args.product_name_or_sku || "";
    if (!query) return "กรุณาระบุชื่อสินค้าหรือ SKU";

    // เรียก MCP Bridge /product-lookup (มี stock_display + stock_eta อยู่แล้ว)
    const result = await callDinocoAPI("/product-lookup", { query, category: "" });
    if (typeof result === "string") return result;
    if (!result.found || !result.products || result.products.length === 0) {
      return `ไม่พบสินค้า "${query}" ในระบบ — ตอบลูกค้าว่า "ขอเช็คชื่อสินค้าอีกครั้งนะคะ"`;
    }

    const p = result.products[0];
    const stockDisplay = p.stock_display || p.stock_status || "in_stock";
    const eta = p.stock_eta || p.oos_eta_date || null;
    const productName = p.name || query;

    const stockMessages = {
      in_stock: `สินค้า ${productName} มีสินค้าพร้อมจัดส่งค่ะ`,
      low_stock: `สินค้า ${productName} ใกล้หมดแล้วค่ะ สั่งก่อนหมดนะคะ`,
      out_of_stock: `สินค้า ${productName} หมดสต็อกชั่วคราวค่ะ`,
    };

    let response = {
      stock_display: stockDisplay,
      stock_message: stockMessages[stockDisplay] || stockMessages.in_stock,
      note: "ไม่สามารถแจ้งจำนวนสต็อกที่แน่นอนได้",
    };

    if (stockDisplay === "out_of_stock" && eta) {
      // Format ETA date
      let etaFormatted = eta;
      try {
        const d = new Date(eta);
        if (!isNaN(d)) etaFormatted = d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
      } catch {}
      response.eta = etaFormatted;
      response.eta_message = `คาดว่าจะมีของ ${etaFormatted}`;
    } else if (stockDisplay === "out_of_stock") {
      response.eta = null;
      response.eta_message = "ยังไม่ทราบกำหนด";
    }

    return JSON.stringify(response);
  }
  if (toolName === "dinoco_escalate") {
    const reason = args.reason || "ลูกค้าต้องการความช่วยเหลือ";
    const database = await getDB();
    if (database) {
      await database.collection("alerts").insertOne({
        type: "human_handoff", sourceId, customerName: "", message: reason,
        level: "red", read: false, createdAt: new Date(),
      });
    }
    return `ส่งเรื่องให้แอดมินแล้ว เหตุผล: ${reason} — ตอบลูกค้าว่า "ขอส่งเรื่องให้ทีมงาน DINOCO ช่วยตอบให้ละเอียดนะคะ รอสักครู่ค่ะ"`;
  }
  if (toolName === "dinoco_create_lead") {
    const database = await getDB();
    if (!database) return "ไม่สามารถสร้าง lead ได้ (DB ไม่พร้อม)";
    const meta = await database.collection("groups_meta").findOne({ sourceId });
    const platform = sourceId.startsWith("fb_") ? "facebook" : sourceId.startsWith("ig_") ? "instagram" : "line";
    const customerName = args.customer_name || meta?.groupName || meta?.displayName || "ลูกค้า";
    const leadData = {
      sourceId, platform, customerName,
      productInterest: args.product_interest || "",
      province: args.province || "",
      phone: args.phone || null,
      lineId: null,
      dealerId: args.dealer_id || null,
      dealerName: args.dealer_name || "",
      status: "lead_created",
      nextFollowUpAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      nextFollowUpType: "first_check",
      windowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      otnToken: null, otnTokenUsed: false, closedAt: null,
      history: [{ status: "lead_created", at: new Date(), by: "ai" }],
      createdAt: new Date(), updatedAt: new Date(),
    };
    const result = await database.collection("leads").insertOne(leadData);
    console.log(`[Lead] AI auto-created: ${customerName} → ${args.dealer_name} (${args.product_interest})`);
    if (args.dealer_id || args.dealer_name) {
      await callDinocoAPI("/distributor-notify", {
        distributor_id: args.dealer_id, customer_name: customerName,
        product_interest: args.product_interest, province: args.province || "",
        lead_id: String(result.insertedId),
        message: `ลูกค้าสนใจ: ${args.product_interest} จ.${args.province || "ไม่ระบุ"}`,
        type: "new_lead",
      }).catch(() => {});
      await database.collection("leads").updateOne(
        { _id: result.insertedId },
        { $set: { status: "dealer_notified", updatedAt: new Date() }, $push: { history: { status: "dealer_notified", at: new Date(), by: "ai" } } }
      );
    }
    return `สร้าง lead สำเร็จ แจ้งตัวแทน ${args.dealer_name} แล้ว — ตอบลูกค้าว่า "แจ้งตัวแทน ${args.dealer_name} แล้วค่ะ จะติดต่อลูกค้ากลับเร็วที่สุดนะคะ แอดมินจะติดตามให้จนจบค่ะ"`;
  }
  if (toolName === "dinoco_claim_status") {
    const database = await getDB();
    if (!database) return "ไม่สามารถเช็คสถานะได้";

    const ticket = args.ticket_number || "";
    const phone = args.phone || "";

    // 1. หาเคลมจาก MongoDB (manual_claims)
    let claim = null;
    if (ticket) {
      claim = await database.collection("manual_claims").findOne({
        $or: [
          { wpTicketNumber: ticket },
          { wpTicketNumber: { $regex: ticket.replace(/[^0-9]/g, ""), $options: "i" } },
        ],
      });
    }
    if (!claim && phone) {
      claim = await database.collection("manual_claims").findOne({ phone: { $regex: phone.replace(/[^0-9]/g, "") } });
    }

    // 2. ถ้าไม่มีใน MongoDB → ถาม WordPress
    if (!claim && ticket) {
      const wpResult = await callDinocoAPI("/claim-manual-status", { ticket_number: ticket });
      if (typeof wpResult !== "string" && wpResult?.found) {
        claim = wpResult.claim;
      }
    }

    if (!claim) {
      return `ไม่พบใบเคลม ${ticket || phone} — ตอบลูกค้าว่า "ขอเช็คเลขใบเคลมอีกครั้งนะคะ หรือแจ้งเบอร์โทรที่ลงทะเบียนค่ะ"`;
    }

    // 3. แปลสถานะเป็นภาษาไทย
    const STATUS_TH = {
      photo_requested: "รอรูปจากลูกค้า", photo_rejected: "รูปไม่ชัด รอถ่ายใหม่",
      photo_received: "ได้รูปแล้ว รอข้อมูลเพิ่ม", info_collecting: "กำลังเก็บข้อมูล",
      info_collected: "ข้อมูลครบ รอทีมตรวจสอบ", admin_reviewed: "ทีมตรวจแล้ว",
      waiting_return_shipment: "รอลูกค้าส่งสินค้ากลับ", return_shipped: "ลูกค้าส่งกลับแล้ว",
      received_at_factory: "โรงงานรับสินค้าแล้ว", parts_shipping: "กำลังส่งอะไหล่ทดแทน",
      return_to_customer: "ส่งสินค้ากลับลูกค้าแล้ว",
      closed_resolved: "เสร็จสิ้น แก้ไขแล้ว", closed_rejected: "ปฏิเสธ ไม่อยู่ในเงื่อนไข",
    };
    const statusTh = STATUS_TH[claim.status] || claim.status;
    const ticketNum = claim.wpTicketNumber || ticket;

    // 4. ส่ง Flex Message ไปกลุ่ม Admin LINE
    sendClaimAlertToAdmin(claim, statusTh, sourceId).catch(() => {});

    return `ใบเคลม: ${ticketNum}\nสถานะ: ${statusTh}\nสินค้า: ${claim.product || "-"}\nอาการ: ${claim.symptoms || "-"}\n\nตอบลูกค้าว่า "ใบเคลม ${ticketNum} สถานะ: ${statusTh} ค่ะ ทีมงานกำลังดูแลอยู่นะคะ"`;
  }

  // ★ V.3.4: เปิดใบเคลม DINOCO เข้าระบบ WP
  if (toolName === "dinoco_create_claim") {
    const symptoms = args.symptoms || "";
    const phone = args.phone || "";
    if (!symptoms || !phone) {
      return "ข้อมูลไม่ครบ — ต้องมีอาการ+เบอร์โทร ก่อนเปิดเคลม ตอบลูกค้าว่า: รบกวนแจ้งอาการปัญหา+เบอร์โทรติดต่อด้วยนะคะ";
    }

    try {
      // 1. สร้างเคลมใน MongoDB (manual_claims)
      const database = await getDB();
      const detectedPlatform = sourceId.startsWith("fb_") ? "facebook" : sourceId.startsWith("ig_") ? "instagram" : "line";
      const claimDoc = {
        symptoms,
        phone,
        customerName: args.customer_name || "",
        customerAddress: args.customer_address || "",
        product: args.product || "",
        photos: args.photos || [],
        serial: args.serial || "",
        purchaseFrom: args.purchase_from || "",
        sourceId,
        platform: detectedPlatform,
        status: "info_collected",
        createdAt: new Date(),
        initiatedBy: "ai_tool",
      };

      if (database) {
        const result = await database.collection("manual_claims").insertOne(claimDoc);
        claimDoc._id = result.insertedId;
      }

      // 2. ส่งไป WordPress MCP
      const wpResult = await callDinocoAPI("/claim-manual-create", {
        symptoms,
        phone,
        customer_name: args.customer_name || "",
        customer_address: args.customer_address || "",
        product: args.product || "",
        photos: args.photos || [],
        serial: args.serial || "",
        purchase_from: args.purchase_from || "",
        source_id: sourceId,
        platform: detectedPlatform,
        initiated_by: "customer",
        ai_analysis: `AI เปิดเคลมอัตโนมัติ — อาการ: ${symptoms}`,
      });

      let ticketNumber = "รอเลขจากระบบ";
      if (typeof wpResult !== "string" && wpResult?.success) {
        ticketNumber = wpResult.ticket_number || `MC-${wpResult.claim_id}`;
        // อัพเดท MongoDB ด้วยเลข WP
        if (database && claimDoc._id) {
          await database.collection("manual_claims").updateOne(
            { _id: claimDoc._id },
            { $set: { wpTicketNumber: ticketNumber, wpClaimId: wpResult.claim_id } }
          );
        }
        console.log(`[Claim] Created: ${ticketNumber} for ${phone}`);
      } else {
        console.warn(`[Claim] WP failed:`, wpResult);
        // ยังมี MongoDB record → ไม่หาย
        ticketNumber = "รอทีมตรวจสอบ";
      }

      // 3. ส่ง alert ไปกลุ่ม Admin LINE
      sendClaimAlertToAdmin({ ...claimDoc, wpTicketNumber: ticketNumber }, "เปิดเคลมใหม่", sourceId).catch(() => {});

      return `เปิดใบเคลมสำเร็จ เลข: ${ticketNumber}\nอาการ: ${symptoms}\nเบอร์โทร: ${phone}\nสินค้า: ${args.product || "-"}\n\nตอบลูกค้าว่า "เปิดใบเคลมให้แล้วค่ะ เลข ${ticketNumber} ทีมช่างจะตรวจสอบและติดต่อกลับเร็วที่สุดนะคะ"`;
    } catch (e) {
      console.error("[Claim] Create error:", e.message);
      return "เกิดข้อผิดพลาดในการเปิดเคลม ตอบลูกค้าว่า: ขออภัยค่ะ ระบบมีปัญหา ให้ทีมงานช่วยเปิดเคลมให้นะคะ";
    }
  }

  // MCP tools
  if (mcpToolHandlers[toolName]) {
    return await callMCPTool(toolName, args);
  }
  return "Unknown tool";
}

// === KB Self-Improvement — track unanswered questions ===
async function trackUnansweredQuestion(question, sourceId) {
  const db = await getDB();
  if (!db || !question) return;
  const normalized = question.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.length < 3) return;
  const result = await db.collection("kb_suggestions").updateOne(
    { normalizedQuestion: normalized },
    {
      $set: { lastAskedAt: new Date(), updatedAt: new Date() },
      $inc: { frequency: 1 },
      $setOnInsert: { question, normalizedQuestion: normalized, status: "pending", createdAt: new Date() },
      $addToSet: { sourceIds: sourceId },
    },
    { upsert: true }
  );
  if (result.modifiedCount > 0) {
    const entry = await db.collection("kb_suggestions").findOne({ normalizedQuestion: normalized });
    if (entry && entry.frequency >= 3 && entry.status === "pending") {
      await callDinocoAPI("/kb-suggest", {
        question: entry.question, frequency: entry.frequency,
        source: "fb_ig_chat", source_ids: (entry.sourceIds || []).slice(0, 5),
      }).catch(() => {});
      await db.collection("kb_suggestions").updateOne(
        { _id: entry._id },
        { $set: { status: "submitted", submittedAt: new Date() } }
      );
      console.log(`[KB] Auto-submitted to WP: "${entry.question}" (asked ${entry.frequency}x)`);
    }
  }
}

module.exports = {
  AGENT_TOOLS,
  executeTool,
  trackUnansweredQuestion,
  init,
};
