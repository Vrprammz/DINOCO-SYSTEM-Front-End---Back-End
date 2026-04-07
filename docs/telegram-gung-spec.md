# Feature Spec: "น้องกุ้ง" Telegram Bot Command Center

Version: 1.0 | Date: 2026-04-07 | Author: Feature Architect

---

## 1. Problem & Goal

### ปัญหา
บอส (Pavorn) ต้องเข้า Dashboard (ai.dinoco.in.th) ทุกครั้งเพื่อ:
- เช็คสถานะเคลม/อนุมัติ/ปฏิเสธ
- ตอบลูกค้าที่ AI ตอบไม่ได้
- ดู Lead / ตัวแทน / สถิติ
- จัดการ Knowledge Base
- สั่ง AI (boss command)

ปัจจุบัน Telegram Bot "น้องกุ้ง" แจ้งเตือนทางเดียว (push-only) ไม่สามารถสั่งงานกลับได้

### เป้าหมาย
เปลี่ยน "น้องกุ้ง" จาก alert bot เป็น **Command Center** — บอสสั่งงานทุกอย่างผ่าน Telegram โดยไม่ต้องเปิด Dashboard

### Success Metrics
- บอสใช้เวลาเปิด Dashboard ลดลง 70%+
- Response time ตอบลูกค้าที่ AI งง < 2 นาที (จากเดิม 5-30 นาที)
- เคลมที่รอ review ไม่เกิน 24 ชม.
- KB ถูกเพิ่มจาก Telegram อย่างน้อย 5 entries/สัปดาห์

### ถ้าไม่ทำ Feature นี้
- บอสต้องเปิด browser + login Dashboard ทุกครั้ง
- ลูกค้าที่ AI ตอบไม่ได้ต้องรอนาน
- เคลม backlog สะสม
- KB ไม่ได้อัพเดทเพราะ friction สูง

---

## 2. User Flows

### 2.1 Overall Architecture

```
Telegram (บอส)
  | text/reply/photo
  v
Nginx (ai.dinoco.in.th)
  |
  v
Agent (:3000) POST /webhook/telegram
  |
  +--> CommandParser.parse(text)
  |      |
  |      +--> intent: claim_view | claim_approve | reply_customer | ...
  |      +--> params: { ticketNumber, sourceId, text, ... }
  |
  +--> CommandRouter.execute(intent, params)
  |      |
  |      +--> Internal API calls (MongoDB + WordPress MCP)
  |      +--> sendTelegramReply(chatId, response)
  |
  +--> AlertReplyHandler (reply_to_message_id)
         |
         +--> ค้นหา alert ต้นทาง → หา sourceId + platform
         +--> ส่งข้อความกลับลูกค้า (LINE/FB/IG)
         +--> บันทึก KB (ถ้าเป็น ai_confused alert)
```

### 2.2 Happy Path: Reply-to-Alert

```
1. AI ตอบลูกค้าไม่ได้ → น้องกุ้งส่ง alert (ai_confused)
2. บอสเห็น alert → reply ข้อความนั้นพิมพ์คำตอบ
3. น้องกุ้งรับ reply → หา sourceId/platform จาก alert record
4. ส่งข้อความกลับลูกค้า (FB/LINE/IG) + บันทึก messages collection
5. บันทึก KB อัตโนมัติ (question + boss answer)
6. ตอบยืนยันบอส: "ส่งแล้ว + บันทึก KB แล้ว"
```

### 2.3 Happy Path: Claim Management

```
1. บอสพิมพ์: "เคลม MC-05901"
2. น้องกุ้งดึงข้อมูลจาก MongoDB manual_claims + WordPress MCP
3. แสดง: เลขเคลม, ลูกค้า, อาการ, สินค้า, สถานะ, รูป (ถ้ามี)
4. บอสพิมพ์: "อนุมัติ MC-05901"
5. น้องกุ้งอัพเดทสถานะ → แจ้งลูกค้าผ่าน LINE/FB
6. ยืนยัน: "อนุมัติแล้ว แจ้งลูกค้าเรียบร้อย"
```

### 2.4 Happy Path: KB Management

```
1. บอสพิมพ์: "KB เพิ่ม: กล่องข้าง ADV350 ไม่มี | DINOCO ยังไม่มีกล่องข้างสำหรับ ADV350 เนื่องจากตัวรถไม่เหมาะกับกล่องอลูมิเนียม"
2. น้องกุ้ง parse title | content
3. บันทึกลง MongoDB knowledge_base + Qdrant (ถ้ามี)
4. ยืนยัน: "บันทึก KB แล้ว: กล่องข้าง ADV350 ไม่มี"
```

### 2.5 Error Paths

```
Error: chat_id ไม่ใช่บอส
├── Log attempt + ไม่ตอบ (silent drop)

Error: Command ไม่รู้จัก
├── ตอบ: "ไม่เข้าใจคำสั่ง พิมพ์ /help ดูคำสั่งทั้งหมด"

Error: เคลมไม่พบ
├── ตอบ: "ไม่พบเคลม MC-XXXXX ในระบบ"

Error: ส่งข้อความกลับลูกค้าไม่สำเร็จ
├── ตอบ: "ส่งไม่สำเร็จ (platform error) ลองเข้า Dashboard ส่งเอง"

Error: MongoDB ล่ม
├── ตอบ: "ระบบฐานข้อมูลมีปัญหา รอสักครู่"

Error: WordPress MCP ไม่ตอบ
├── แสดงข้อมูลจาก MongoDB (ถ้ามี) + แจ้ง "ข้อมูล WordPress ไม่พร้อม"
```

### 2.6 Edge Cases

```
- บอสส่งรูป (ไม่ใช่ text) → น้องกุ้งวิเคราะห์ด้วย Vision AI + ถามว่าจะทำอะไรต่อ
- บอส reply alert เก่า (> 24 ชม.) → แจ้ง "alert นี้เก่าเกิน 24 ชม. ยังต้องการส่งหรือเปล่า? ตอบ ใช่ เพื่อส่ง"
- บอส reply alert ที่ sourceId ไม่มีใน Meta window → ใช้ LINE push หรือ แจ้งว่า "ช่วง 24 ชม. หมดแล้ว ส่งผ่าน FB ไม่ได้"
- ข้อความยาวมาก (> 2000 chars) → ตัด + ส่งหลายข้อความ
- บอสส่งหลายข้อความรัวๆ → debounce 1 วินาที ป้องกัน rate limit
- Telegram API rate limit (30 msg/sec) → queue + retry
```

---

## 3. Data Model

### 3.1 MongoDB Collection: `telegram_alerts` (ใหม่)

เก็บ mapping ระหว่าง Telegram message_id กับ sourceId/platform เพื่อ reply flow

```javascript
{
  _id: ObjectId,
  telegramMessageId: Number,      // message_id ที่น้องกุ้งส่งไปหาบอส
  alertType: String,               // "ai_confused" | "new_claim" | "hallucination" | ...
  sourceId: String,                // LINE/FB/IG sourceId ของลูกค้า
  platform: String,                // "line" | "facebook" | "instagram"
  customerName: String,
  customerText: String,            // ข้อความลูกค้าที่ trigger alert
  aiReply: String,                 // AI ตอบอะไรไป (ถ้ามี)
  status: String,                  // "pending" | "replied" | "expired" | "ignored"
  bossReply: String,               // บอสตอบอะไร (หลัง reply)
  repliedAt: Date,
  kbEntryId: ObjectId,             // KB entry ที่สร้างจาก reply (ถ้ามี)
  createdAt: Date,
  expiresAt: Date,                 // createdAt + 24 ชม.
}
```

**Indexes:**
- `{ telegramMessageId: 1 }` (unique) -- lookup เมื่อบอส reply
- `{ status: 1, createdAt: -1 }` -- ดู pending alerts
- `{ expiresAt: 1 }` -- TTL index auto-delete หลัง 7 วัน

### 3.2 MongoDB Collection: `telegram_command_log` (ใหม่)

Audit trail ทุกคำสั่งจาก Telegram

```javascript
{
  _id: ObjectId,
  command: String,                  // raw text จากบอส
  intent: String,                   // parsed intent
  params: Object,                   // parsed params
  result: String,                   // "success" | "error" | "not_found"
  responseText: String,             // ข้อความที่ตอบบอส (truncated 500 chars)
  executionMs: Number,              // เวลาที่ใช้ process
  createdAt: Date,
}
```

**Indexes:**
- `{ createdAt: -1 }` -- ดูประวัติล่าสุด
- `{ intent: 1, createdAt: -1 }` -- สถิติ intent

### 3.3 Existing Collections ที่ใช้ (ไม่แก้ schema)

| Collection | การใช้งาน |
|---|---|
| `manual_claims` | อ่าน/อัพเดทสถานะเคลม |
| `messages` | อ่านประวัติแชท + เขียน reply ของบอส |
| `knowledge_base` | CRUD KB entries |
| `leads` | อ่านสถานะ leads |
| `ai_costs` | อ่านสถิติ AI |
| `training_logs` | อ่านสถิติเทรน |
| `customers` | ค้นหาลูกค้า |
| `groups_meta` | ค้นหา group/page info |

---

## 4. API Design

### 4.1 Telegram Webhook Endpoint

```
POST /webhook/telegram
Content-Type: application/json
```

**Request (from Telegram):**
```json
{
  "update_id": 123456789,
  "message": {
    "message_id": 42,
    "from": { "id": 8772428801, "first_name": "Pavorn" },
    "chat": { "id": 8772428801, "type": "private" },
    "date": 1712500000,
    "text": "เคลม MC-05901",
    "reply_to_message": {
      "message_id": 38,
      "text": "... (alert text) ..."
    }
  }
}
```

**Response:** `200 OK` (Telegram expects 200 always)

**Security:**
- เช็ค `message.chat.id === TELEGRAM_CHAT_ID` (บอสเท่านั้น)
- ไม่ต้อง requireAuth (Telegram webhook ไม่ส่ง auth header)
- ใช้ `TELEGRAM_WEBHOOK_SECRET` ใน URL path เพื่อความปลอดภัย: `/webhook/telegram/<secret>`

### 4.2 Webhook Registration (one-time setup)

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://ai.dinoco.in.th/webhook/telegram/<SECRET>","allowed_updates":["message"]}'
```

### 4.3 Internal APIs ที่ต้องเรียก

| Action | API / DB Operation | Source |
|---|---|---|
| ดูเคลม | `manual_claims.findOne()` + `callDinocoAPI("/claim-manual-status")` | MongoDB + WP MCP |
| อนุมัติเคลม | `callDinocoAPI("/claim-manual-update")` + `manual_claims.updateOne()` | WP MCP + MongoDB |
| ปฏิเสธเคลม | `callDinocoAPI("/claim-manual-update")` + `manual_claims.updateOne()` | WP MCP + MongoDB |
| รายการเคลมรอ | `manual_claims.find({ status: "pending" })` | MongoDB |
| ตอบลูกค้า LINE | `sendLinePush(sourceId, messages)` | platform-response.js |
| ตอบลูกค้า FB/IG | `sendMetaMessage(recipientId, text)` | platform-response.js |
| เพิ่ม KB | `knowledge_base.insertOne()` + Qdrant upsert | MongoDB + Qdrant |
| ค้น KB | `searchKB(query)` | index.js |
| ดู leads | `leads.find()` | MongoDB |
| สถิติ AI | `ai_costs.aggregate()` + `messages.countDocuments()` | MongoDB |
| Health check | `db.command({ ping: 1 })` + circuit breaker status | MongoDB |
| เทรน AI | `/api/train/auto-run` (internal) | Agent API |
| ล้างแชท | `/api/clear-memory/:sourceId` (internal) | Agent API |

### 4.4 Rate Limiting
- Telegram Webhook: ไม่ rate limit (Telegram จัดการเอง)
- ส่งข้อความกลับ Telegram: max 30 msg/sec (Telegram limit)
- ส่งข้อความ LINE: max 1 msg/sec per user
- ส่งข้อความ Meta: max 250 msg/24hr per user (Meta policy)

---

## 5. Command Parser Design

### 5.1 Command Categories & Patterns

```javascript
const COMMAND_PATTERNS = [
  // === /commands (Telegram-style) ===
  { pattern: /^\/help$/i, intent: "help" },
  { pattern: /^\/start$/i, intent: "help" },
  { pattern: /^\/status$/i, intent: "system_health" },

  // === เคลม (Claims) ===
  { pattern: /^เคลม\s+(MC-?\d+)/i, intent: "claim_view", extract: ["ticketNumber"] },
  { pattern: /^อนุมัติ\s+(MC-?\d+)/i, intent: "claim_approve", extract: ["ticketNumber"] },
  { pattern: /^ปฏิเสธ\s+(MC-?\d+)\s+(.+)/i, intent: "claim_reject", extract: ["ticketNumber", "reason"] },
  { pattern: /^เคลมรอ(?:ตรวจ|review)?$/i, intent: "claim_pending_list" },
  { pattern: /^เคลมวันนี้$/i, intent: "claim_today" },
  { pattern: /^เคลมทั้งหมด$/i, intent: "claim_all" },

  // === ตอบลูกค้า (Reply) ===
  { pattern: /^ตอบ\s+(.+?):\s*(.+)/i, intent: "reply_by_name", extract: ["customerName", "message"] },
  { pattern: /^ตอบล่าสุด:\s*(.+)/i, intent: "reply_latest", extract: ["message"] },

  // === ตัวแทน/Lead ===
  { pattern: /^ตัวแทน\s+(.+)/i, intent: "dealer_search", extract: ["query"] },
  { pattern: /^lead\s*วันนี้$/i, intent: "lead_today" },
  { pattern: /^lead\s*รอ(?:ติดต่อ)?$/i, intent: "lead_pending" },
  { pattern: /^lead\s*#?(\d+)/i, intent: "lead_detail", extract: ["leadId"] },
  { pattern: /^sla\s*ตัวแทน$/i, intent: "dealer_sla" },

  // === Knowledge Base ===
  { pattern: /^kb\s*เพิ่ม:\s*(.+?)\s*\|\s*(.+)/i, intent: "kb_add", extract: ["title", "content"] },
  { pattern: /^kb\s*ค้น(?:หา)?:\s*(.+)/i, intent: "kb_search", extract: ["query"] },
  { pattern: /^kb\s*ลบ:\s*(.+)/i, intent: "kb_delete", extract: ["id"] },
  { pattern: /^kb\s*(?:ทั้งหมด|สรุป)$/i, intent: "kb_stats" },

  // === Dashboard / Analytics ===
  { pattern: /^ยอดขาย$/i, intent: "sales_summary" },
  { pattern: /^แชท\s*วันนี้$/i, intent: "chat_today" },
  { pattern: /^สถิติ\s*(?:ai|เอไอ)$/i, intent: "ai_stats" },
  { pattern: /^เทรน\s*(\d+)$/i, intent: "train_auto", extract: ["count"] },

  // === ระบบ ===
  { pattern: /^สถานะ$/i, intent: "system_health" },
  { pattern: /^ล้างแชท\s+(.+)/i, intent: "clear_chat", extract: ["target"] },
  { pattern: /^รีสตาร์ท$/i, intent: "restart_info" },
];
```

### 5.2 Fuzzy / AI Fallback

ถ้าไม่ match pattern ใดเลย → ส่งเข้า Gemini Flash classify:

```javascript
async function classifyWithAI(text) {
  // ใช้ Gemini Flash classify intent
  // System prompt: "จำแนกคำสั่งนี้เป็น intent ใด? ตอบ JSON"
  // ให้ list ของ intents ที่เป็นไปได้
  // ถ้าไม่ใช่คำสั่ง → intent: "chat" (คุยเล่นกับน้องกุ้ง)
}
```

### 5.3 Reply-to-Message Detection

```javascript
function isReplyToAlert(message) {
  return message.reply_to_message?.from?.is_bot === true;
}

async function handleAlertReply(message) {
  const alertMsgId = message.reply_to_message.message_id;
  const alert = await db.collection("telegram_alerts")
    .findOne({ telegramMessageId: alertMsgId });

  if (!alert) return "ไม่พบ alert นี้ในระบบ";
  if (alert.status === "replied") return "alert นี้ตอบไปแล้ว";

  // ส่งข้อความกลับลูกค้า
  const bossText = message.text;
  let sent = false;
  if (alert.platform === "line") {
    sent = await sendLinePush(alert.sourceId, [{ type: "text", text: bossText }]);
  } else {
    const recipientId = alert.sourceId.replace(/^(fb_|ig_)/, "");
    sent = await sendMetaMessage(recipientId, bossText);
  }

  // บันทึก
  await saveMsg(alert.sourceId, {
    role: "assistant", userName: "บอส (Telegram)",
    content: bossText, messageType: "text",
  }, alert.platform);

  // อัพเดท alert status
  await db.collection("telegram_alerts").updateOne(
    { _id: alert._id },
    { $set: { status: "replied", bossReply: bossText, repliedAt: new Date() } }
  );

  // Auto KB ถ้าเป็น ai_confused
  if (alert.alertType === "ai_confused" && alert.customerText) {
    const kbResult = await db.collection("knowledge_base").insertOne({
      title: `Q: ${alert.customerText.substring(0, 80)}`,
      content: bossText,
      category: "boss_answer",
      tags: ["from_telegram", "boss_correction"],
      active: true,
      source: "telegram_reply",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    alert.kbEntryId = kbResult.insertedId;
  }

  return sent ? "ส่งถึงลูกค้าแล้ว" + (alert.alertType === "ai_confused" ? " + บันทึก KB" : "")
              : "ส่งไม่สำเร็จ ลองเข้า Dashboard ส่งเอง";
}
```

---

## 6. Command Handlers (Detailed)

### 6.1 Claim Commands

#### `claim_view` — "เคลม MC-05901"

```
Input:  เคลม MC-05901
Output:
  ━━━ ใบเคลม MC-05901 ━━━
  ลูกค้า: สมชาย ใจดี
  เบอร์: 081-xxx-xxxx
  สินค้า: แคชบาร์ ADV350 PRO
  อาการ: แตกร้าว ตรงจุดยึด
  สถานะ: pending (รอตรวจสอบ)
  วันที่เปิด: 5 เม.ย. 2026
  ━━━━━━━━━━━━━━━━━━━━━
  สั่ง: อนุมัติ MC-05901
  สั่ง: ปฏิเสธ MC-05901 [เหตุผล]
```

**Flow:**
1. ค้น MongoDB `manual_claims` → `{ $or: [{ wpTicketNumber }, { wpTicketNumber: regex }] }`
2. ถ้าไม่พบ → ค้น WP MCP `/claim-manual-status`
3. ถ้ามีรูป (`photos` array) → ส่งรูปผ่าน `sendPhoto` API ของ Telegram
4. แสดง info + inline commands

#### `claim_approve` — "อนุมัติ MC-05901"

**Flow:**
1. ค้น claim
2. เช็คสถานะ (ต้องเป็น pending หรือ reviewing)
3. อัพเดท MongoDB: `status: "approved", approvedBy: "boss_telegram", approvedAt: new Date()`
4. เรียก WP MCP `/claim-manual-update` → `{ claim_id: wpClaimId (int), status: "approved" }` (ใช้ claim_id ไม่ใช่ ticket_number)
5. แจ้งลูกค้าผ่าน LINE/FB: "ใบเคลม MC-05901 อนุมัติแล้วค่ะ ทีมช่างจะติดต่อกลับเร็วที่สุดนะคะ"
6. แจ้ง Admin LINE group (Flex card)
7. ตอบบอส: "อนุมัติ MC-05901 แล้ว + แจ้งลูกค้าเรียบร้อย"

#### `claim_reject` — "ปฏิเสธ MC-05901 ไม่อยู่ในเงื่อนไข"

**Flow:**
1. ค้น claim
2. เช็คสถานะ
3. อัพเดท MongoDB: `status: "rejected", rejectedBy: "boss_telegram", rejectedReason, rejectedAt`
4. เรียก WP MCP `/claim-manual-update`
5. แจ้งลูกค้า: "ขออภัยค่ะ ใบเคลม MC-05901 ไม่ผ่านเงื่อนไข เนื่องจาก: [เหตุผล] หากมีข้อสงสัยติดต่อทีมงานได้เลยนะคะ"
6. ตอบบอส: "ปฏิเสธ MC-05901 แล้ว เหตุผล: [เหตุผล]"

#### `claim_pending_list` — "เคลมรอตรวจ"

```
Output:
  รอตรวจ 3 ใบ:
  1. MC-05901 - สมชาย (แคชบาร์ ADV350) - 2 วันแล้ว
  2. MC-05902 - สมหญิง (กล่องข้าง Forza) - 1 วัน
  3. MC-05903 - สมศรี (กันล้ม CB150) - วันนี้
  
  ดูรายละเอียด: เคลม MC-XXXXX
```

#### `claim_today` — "เคลมวันนี้"

```
Output:
  สรุปเคลมวันนี้ (7 เม.ย. 2026):
  - เปิดใหม่: 2 ใบ
  - อนุมัติ: 1 ใบ
  - ปฏิเสธ: 0 ใบ
  - รอตรวจ (backlog): 3 ใบ
  - กำลังซ่อม: 5 ใบ
```

### 6.2 Reply Commands

#### `reply_by_name` — "ตอบ Noxnuan: แนะนำ Set Side Case Pro..."

**Flow:**
1. ค้น `customers` collection: `{ name: { $regex: "Noxnuan", $options: "i" } }`
2. ถ้าพบหลายคน → แสดง list ให้เลือก
3. ถ้าพบ 1 คน → ดึง `sourceId` + `platform`
4. ส่งข้อความ + บันทึก messages

#### `reply_latest` — "ตอบล่าสุด: ..."

**Flow:**
1. ดึง alert ล่าสุดที่ status = "pending": `telegram_alerts.findOne({ status: "pending" }, { sort: { createdAt: -1 } })`
2. ส่งข้อความกลับ sourceId นั้น
3. อัพเดท alert status

### 6.3 Dealer/Lead Commands

#### `dealer_search` — "ตัวแทน ชลบุรี"

**Flow:**
1. เรียก WP MCP `/dealer-lookup` + `{ location: "ชลบุรี" }`
2. แสดง list: ชื่อร้าน, เบอร์, พื้นที่
3. แสดงจำนวน lead ที่ active ของแต่ละร้าน

#### `lead_today` — "Lead วันนี้"

```
Output:
  Lead วันนี้ (7 เม.ย. 2026):
  - ใหม่: 5 คน
  - ตัวแทนติดต่อแล้ว: 3 คน
  - รอติดต่อ: 2 คน
  - ตัวแทนไม่ตอบ: 0 คน
```

#### `lead_pending` — "Lead รอติดต่อ"

```
Output:
  Lead รอติดต่อ (5 คน):
  1. สมชาย - แคชบาร์ ADV350 - ร้าน MotoThai (กทม) - 2 ชม.
  2. สมหญิง - กล่องหลัง Forza - ร้าน RidePro (ชลบุรี) - 5 ชม.
  ...
```

#### `dealer_sla` — "SLA ตัวแทน"

**Flow:**
1. Query leads ที่ `status: "dealer_no_response"` group by `dealerName`
2. แสดง list ตัวแทนที่ response ช้า + จำนวน lead ค้าง

### 6.4 KB Commands

#### `kb_add` — "KB เพิ่ม: [title] | [content]"

**Flow:**
1. Parse title + content (split by `|`)
2. Insert ลง `knowledge_base` collection
3. ถ้ามี Qdrant → upsert embedding
4. ยืนยัน + แสดง ID

#### `kb_search` — "KB ค้นหา: กล่อง 3 ใบ"

**Flow:**
1. เรียก `searchKB(query)` (ใช้ function ที่มีอยู่แล้ว)
2. แสดง top 5 results + score

#### `kb_stats` — "KB ทั้งหมด"

```
Output:
  KB Stats:
  - ทั้งหมด: 342 entries
  - Active: 338
  - จาก Telegram: 45
  - จาก Training: 89
  - จาก Boss correction: 108
```

### 6.5 Analytics Commands

#### `chat_today` — "แชทวันนี้"

```
Output:
  แชทวันนี้ (7 เม.ย. 2026):
  - LINE: 45 ข้อความ (12 คน)
  - Facebook: 23 ข้อความ (8 คน)
  - Instagram: 7 ข้อความ (3 คน)
  - AI ตอบเอง: 68 ข้อความ
  - ส่งต่อทีมงาน: 7 ข้อความ
```

#### `ai_stats` — "สถิติ AI"

```
Output:
  AI Stats วันนี้:
  - ข้อความทั้งหมด: 75
  - AI ตอบสำเร็จ: 68 (91%)
  - AI งง/ส่งต่อ: 7 (9%)
  - Hallucination detected: 2
  - Claude แก้ไข: 2
  - ค่าใช้จ่าย: $0.15
```

#### `train_auto` — "เทรน 30"

**Flow:**
1. เรียก internal `/api/train/auto-run` body `{ count: 30 }`
2. รอผล (timeout 120s)
3. แสดงผลรวม: pass/fail/error

### 6.6 System Commands

#### `system_health` — "สถานะ"

```
Output:
  ระบบ DINOCO AI:
  - Agent: OK (uptime 3d 12h)
  - MongoDB: OK
  - WordPress MCP: OK (circuit: closed)
  - KB entries: 342
  - Pending alerts: 2
  - Pending claims: 3
  - Active leads: 15
```

#### `help` — "/help"

```
Output:
  น้องกุ้ง Command Center

  เคลม:
  - เคลม MC-XXXXX → ดูข้อมูล+รูป
  - อนุมัติ MC-XXXXX → อนุมัติเคลม
  - ปฏิเสธ MC-XXXXX [เหตุผล]
  - เคลมรอตรวจ → list รอ review
  - เคลมวันนี้ → สรุปวันนี้

  ตอบลูกค้า:
  - Reply alert → ส่งกลับลูกค้า + บันทึก KB
  - ตอบ [ชื่อ]: [ข้อความ]
  - ตอบล่าสุด: [ข้อความ]

  ตัวแทน / Lead:
  - ตัวแทน [จังหวัด]
  - Lead วันนี้ / Lead รอติดต่อ
  - SLA ตัวแทน

  KB:
  - KB เพิ่ม: [title] | [content]
  - KB ค้นหา: [คำค้น]
  - KB ลบ: [id]
  - KB ทั้งหมด

  สถิติ:
  - แชทวันนี้ / สถิติ AI / ยอดขาย
  - เทรน [จำนวน]

  ระบบ:
  - สถานะ / ล้างแชท [ชื่อ]
```

---

## 7. Auto-Notifications (Enhanced)

### 7.1 ปรับ sendTelegramAlert ให้บันทึก alert record

ทุก alert ที่ส่ง → บันทึก `telegram_alerts` collection เพื่อให้ reply flow ทำงานได้

```javascript
async function sendTelegramAlert(type, data) {
  // ... existing rate limit logic ...

  const result = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { ... });
  const responseData = await result.json();

  // บันทึก alert record (ใหม่)
  if (responseData.ok && responseData.result?.message_id) {
    const db = await getDB();
    if (db) {
      await db.collection("telegram_alerts").insertOne({
        telegramMessageId: responseData.result.message_id,
        alertType: type,
        sourceId: data.sourceId || null,
        platform: data.platform || "unknown",
        customerName: data.customerName || "",
        customerText: data.customerText || "",
        aiReply: data.aiReply || data.revisedReply || "",
        status: "pending",
        bossReply: null,
        repliedAt: null,
        kbEntryId: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }
  }
}
```

### 7.2 Notification Types ใหม่

| Type | Trigger | ข้อความ | Auto-Repeat |
|---|---|---|---|
| `lead_no_contact_3d` | Lead status `dealer_no_response` + created > 3 days | "ตัวแทน XXX ไม่ติดต่อลูกค้า 3 วันแล้ว" | ทุก 24 ชม. จนกว่า resolve |
| `lead_new` | Lead created | "Lead ใหม่: [ชื่อ] สนใจ [สินค้า] → [ตัวแทน]" | ไม่ repeat |
| `claim_aging` | Claim pending > 48 ชม. | "เคลม MC-XXXXX รอตรวจ 2 วันแล้ว" | ทุก 24 ชม. |
| `daily_summary` | Cron 09:00 ทุกวัน | สรุปประจำวัน (เคลม/lead/แชท/AI stats) | ทุกวัน |

### 7.3 Daily Summary (09:00)

```
สรุปประจำวัน DINOCO (7 เม.ย. 2026)
━━━━━━━━━━━━━━━━━━━━━

แชท: 68 ข้อความ / 23 คน
- AI ตอบเอง: 61 (90%)
- ส่งต่อทีมงาน: 7

เคลม:
- เปิดใหม่: 2
- รอตรวจ: 3 (เก่าสุด 2 วัน)
- อนุมัติ: 1

Lead:
- ใหม่: 5
- ตัวแทนติดต่อแล้ว: 3
- ตัวแทนไม่ตอบ: 2

AI Performance:
- Accuracy: 91%
- Hallucination caught: 2
- ค่าใช้จ่าย: $0.15

รอดำเนินการ:
- เคลมรอตรวจ 3 ใบ
- Lead รอติดต่อ 2 คน
━━━━━━━━━━━━━━━━━━━━━
```

---

## 8. File Structure

### ไฟล์ใหม่

```
openclawminicrm/proxy/modules/telegram-gung.js     (หลัก — ~600 lines)
```

### ไฟล์ที่ต้องแก้ไข

```
openclawminicrm/proxy/modules/telegram-alert.js    (เพิ่ม alert record + sendPhoto + exports)
openclawminicrm/proxy/index.js                     (เพิ่ม webhook route + wire up + cron)
```

---

## 9. Implementation Architecture: `telegram-gung.js`

### Module Structure

```javascript
/**
 * telegram-gung.js — น้องกุ้ง: Telegram Bot Command Center
 * V.1.0
 *
 * Dependencies:
 *   - telegram-alert.js (sendTelegramAlert, sendTelegramReply, sendTelegramPhoto)
 *   - platform-response.js (sendLinePush, sendMetaMessage)
 *   - dinoco-cache.js (callDinocoAPI)
 *   - shared.js (getDB, KB_COLL)
 */

// Forward declarations (set by init())
let sendLinePush, sendMetaMessage, sendTelegramReply, sendTelegramPhoto;
let callDinocoAPI, searchKB, saveMsg;

function init(deps) { ... }

// === Command Patterns ===
const COMMAND_PATTERNS = [ ... ]; // ตาม Section 5.1

// === Main Handler ===
async function handleTelegramMessage(message) {
  const chatId = message.chat.id;
  if (String(chatId) !== String(TELEGRAM_CHAT_ID)) return; // security

  const startMs = Date.now();

  // 1. Reply-to-Alert check
  if (message.reply_to_message) {
    const result = await handleAlertReply(message);
    await reply(chatId, result);
    await logCommand(message.text, "alert_reply", {}, result);
    return;
  }

  // 2. Photo/Image handling
  if (message.photo) {
    const result = await handlePhoto(message);
    await reply(chatId, result);
    return;
  }

  // 3. Command parsing
  const text = (message.text || "").trim();
  if (!text) return;

  const { intent, params } = parseCommand(text);

  // 4. Execute
  const result = await executeCommand(intent, params, message);
  await reply(chatId, result);

  // 5. Log
  await logCommand(text, intent, params, result, Date.now() - startMs);
}

// === Command Parser ===
function parseCommand(text) { ... }

// === Command Router ===
async function executeCommand(intent, params, message) {
  switch (intent) {
    case "help": return buildHelpText();
    case "claim_view": return await handleClaimView(params);
    case "claim_approve": return await handleClaimApprove(params);
    case "claim_reject": return await handleClaimReject(params);
    case "claim_pending_list": return await handleClaimPendingList();
    case "claim_today": return await handleClaimToday();
    case "reply_by_name": return await handleReplyByName(params);
    case "reply_latest": return await handleReplyLatest(params);
    case "dealer_search": return await handleDealerSearch(params);
    case "lead_today": return await handleLeadToday();
    case "lead_pending": return await handleLeadPending();
    case "lead_detail": return await handleLeadDetail(params);
    case "dealer_sla": return await handleDealerSLA();
    case "kb_add": return await handleKBAdd(params);
    case "kb_search": return await handleKBSearch(params);
    case "kb_delete": return await handleKBDelete(params);
    case "kb_stats": return await handleKBStats();
    case "chat_today": return await handleChatToday();
    case "ai_stats": return await handleAIStats();
    case "train_auto": return await handleTrainAuto(params);
    case "system_health": return await handleSystemHealth();
    case "clear_chat": return await handleClearChat(params);
    default: return await handleUnknown(params.text);
  }
}

// === Individual Handlers ===
async function handleClaimView(params) { ... }
async function handleClaimApprove(params) { ... }
// ... etc

// === Helper: Reply to Telegram ===
async function reply(chatId, text) { ... }

// === Helper: Log command ===
async function logCommand(raw, intent, params, result, ms) { ... }

// === Cron: Daily Summary ===
async function sendDailySummary() { ... }

// === Cron: Lead No Contact Alert ===
async function checkLeadNoContact() { ... }

// === Cron: Claim Aging Alert ===
async function checkClaimAging() { ... }

module.exports = {
  handleTelegramMessage,
  sendDailySummary,
  checkLeadNoContact,
  checkClaimAging,
  init,
};
```

---

## 10. Changes to Existing Files

### 10.1 `telegram-alert.js` Changes

```diff
+ // Return message_id from Telegram response for alert tracking
+ // sendTelegramAlert now returns { ok, messageId }

+ async function sendTelegramReply(chatId, text, replyToMessageId) { ... }
+ async function sendTelegramPhoto(chatId, photoUrl, caption) { ... }

- module.exports = { sendTelegramAlert };
+ module.exports = { sendTelegramAlert, sendTelegramReply, sendTelegramPhoto };
```

### 10.2 `index.js` Changes

```diff
+ const telegramGung = require("./modules/telegram-gung");
+ const { handleTelegramMessage, sendDailySummary, checkLeadNoContact, checkClaimAging } = telegramGung;

+ // Wire up
+ telegramGung.init({
+   sendLinePush, sendMetaMessage, callDinocoAPI,
+   searchKB, saveMsg, sendTelegramReply, sendTelegramPhoto
+ });

+ // Telegram Webhook
+ const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || crypto.randomBytes(16).toString("hex");
+ app.post(`/webhook/telegram/${TELEGRAM_WEBHOOK_SECRET}`, express.json(), async (req, res) => {
+   res.sendStatus(200); // Telegram expects immediate 200
+   if (req.body.message) {
+     handleTelegramMessage(req.body.message).catch(e => console.error("[Telegram] Handler error:", e.message));
+   }
+ });

+ // Register Telegram webhook on startup
+ async function registerTelegramWebhook() {
+   const token = process.env.TELEGRAM_BOT_TOKEN;
+   const baseUrl = process.env.BASE_URL || "https://ai.dinoco.in.th";
+   if (!token) return;
+   const url = `${baseUrl}/webhook/telegram/${TELEGRAM_WEBHOOK_SECRET}`;
+   await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
+     method: "POST",
+     headers: { "Content-Type": "application/json" },
+     body: JSON.stringify({ url, allowed_updates: ["message"] }),
+   }).then(r => r.json()).then(d => console.log("[Telegram] Webhook registered:", d.ok ? url : d.description))
+   .catch(e => console.error("[Telegram] Webhook registration failed:", e.message));
+ }

  // In startup:
+ registerTelegramWebhook();
+ // Cron: Daily summary at 09:00 Bangkok
+ setInterval(() => {
+   const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
+   if (now.getHours() === 9 && now.getMinutes() === 0) sendDailySummary().catch(() => {});
+ }, 60000);
+ // Cron: Lead no contact + claim aging check every 4 hours
+ setInterval(() => {
+   checkLeadNoContact().catch(() => {});
+   checkClaimAging().catch(() => {});
+ }, 4 * 60 * 60 * 1000);

  // Indexes
+ await database.collection("telegram_alerts").createIndex({ telegramMessageId: 1 }, { unique: true });
+ await database.collection("telegram_alerts").createIndex({ status: 1, createdAt: -1 });
+ await database.collection("telegram_alerts").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 604800 }); // 7 days TTL
+ await database.collection("telegram_command_log").createIndex({ createdAt: -1 });
+ await database.collection("telegram_command_log").createIndex({ intent: 1, createdAt: -1 });
```

---

## 11. Environment Variables

| Variable | Value | Required |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | (ดู .env บน server) | Yes |
| `TELEGRAM_CHAT_ID` | (ดู .env บน server) | Yes |
| `TELEGRAM_WEBHOOK_SECRET` | auto-generated (หรือ set เอง) | Recommended |
| `BASE_URL` | `https://ai.dinoco.in.th` | Yes (for webhook registration) |

---

## 12. Dependencies & Impact Analysis

### Files ที่ต้องแก้ไข

```
openclawminicrm/proxy/modules/telegram-alert.js
├── เพิ่ม sendTelegramReply(), sendTelegramPhoto()
├── แก้ sendTelegramAlert() ให้ return message_id + บันทึก telegram_alerts
└── เพิ่ม exports

openclawminicrm/proxy/index.js
├── import telegram-gung module
├── wire up dependencies via init()
├── เพิ่ม POST /webhook/telegram/<secret> route
├── เพิ่ม registerTelegramWebhook() ใน startup
├── เพิ่ม cron jobs (daily summary, lead check, claim check)
└── เพิ่ม MongoDB indexes

openclawminicrm/.env (production)
├── TELEGRAM_BOT_TOKEN (มีอยู่แล้ว)
├── TELEGRAM_CHAT_ID (มีอยู่แล้ว)
└── TELEGRAM_WEBHOOK_SECRET (เพิ่มใหม่)
```

### Files ที่ต้องสร้างใหม่

```
openclawminicrm/proxy/modules/telegram-gung.js (~600 lines)
└── Command parser + router + handlers + cron functions
```

### Dependencies ที่ต้องมีก่อน
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` ต้อง set ใน .env (มีแล้ว)
- `BASE_URL` ต้อง set เป็น `https://ai.dinoco.in.th` (มีแล้ว)
- Nginx ต้อง proxy `/webhook/telegram/*` ไปยัง agent:3000 (ต้องเช็ค)

### Side Effects ที่ต้องระวัง
- `sendTelegramAlert` เดิม ส่งแล้วลืม (fire-and-forget) → แก้ให้ await response เพื่อเก็บ message_id → อาจช้าขึ้น 50-100ms ต่อ alert
- Telegram webhook ต้อง return 200 ภายใน 60 วินาที → ถ้า command ช้า (เช่น train) ต้อง return 200 ก่อน + process async
- MongoDB write เพิ่ม ~50 docs/day (telegram_alerts + command_log) → ไม่มี impact กับ Atlas M0 free tier
- Cron jobs เพิ่ม 3 ตัว → setInterval ใน Node.js process (ไม่ใช่ OS cron)

---

## 13. Implementation Roadmap

### Phase 1: MVP — Core Commands + Reply Flow (2-3 วัน)

```
Task 1.1: สร้าง telegram-gung.js module skeleton
├── File: openclawminicrm/proxy/modules/telegram-gung.js
├── Command parser + router + init()
└── Est: 2 ชม.

Task 1.2: แก้ telegram-alert.js
├── File: openclawminicrm/proxy/modules/telegram-alert.js
├── เพิ่ม sendTelegramReply, sendTelegramPhoto
├── แก้ sendTelegramAlert ให้บันทึก telegram_alerts
└── Est: 1 ชม.

Task 1.3: เพิ่ม webhook route + startup ใน index.js
├── File: openclawminicrm/proxy/index.js
├── POST /webhook/telegram/<secret>
├── registerTelegramWebhook()
├── MongoDB indexes
└── Est: 1 ชม.

Task 1.4: Implement Reply-to-Alert flow
├── handleAlertReply() + KB auto-save
└── Est: 2 ชม.

Task 1.5: Implement Claim commands
├── claim_view, claim_approve, claim_reject, claim_pending_list, claim_today
└── Est: 3 ชม.

Task 1.6: Implement /help + system_health
└── Est: 30 นาที

Deploy & Test Phase 1
└── ทดสอบ: ส่งคำสั่งจาก Telegram จริง, เช็ค reply flow, เช็คเคลม
```

### Phase 2: Full Commands (2 วัน)

```
Task 2.1: Implement KB commands (add, search, delete, stats)
└── Est: 1.5 ชม.

Task 2.2: Implement Dealer/Lead commands
├── dealer_search, lead_today, lead_pending, lead_detail, dealer_sla
└── Est: 2 ชม.

Task 2.3: Implement Analytics commands
├── chat_today, ai_stats, train_auto
└── Est: 1.5 ชม.

Task 2.4: Implement Reply commands (by name, latest)
├── reply_by_name, reply_latest
└── Est: 1.5 ชม.

Task 2.5: Implement System commands (clear_chat, restart_info)
└── Est: 30 นาที

Deploy & Test Phase 2
```

### Phase 3: Auto-Notifications + Polish (1-2 วัน)

```
Task 3.1: Daily Summary cron (09:00)
└── Est: 1.5 ชม.

Task 3.2: Lead No Contact alert (ทุก 4 ชม.)
└── Est: 1 ชม.

Task 3.3: Claim Aging alert (ทุก 4 ชม.)
└── Est: 1 ชม.

Task 3.4: Photo handling (บอสส่งรูป → Vision AI)
└── Est: 1 ชม.

Task 3.5: AI fallback for unrecognized commands
└── Est: 1 ชม.

Task 3.6: Error handling + edge cases
├── Stale alert reply, Meta window expired, message too long
└── Est: 1 ชม.

Deploy & Test Phase 3
```

---

## 14. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Telegram webhook ไม่ register (firewall/SSL) | Medium | High | ใช้ `/webhook/telegram/<secret>` + เช็ค Nginx proxy config + manual `setWebhook` fallback |
| Bot token leak ใน log | Low | Critical | ไม่ log token, ใช้ env var, mask ใน health check |
| Reply ส่งไปผิดคน | Low | High | Double-check sourceId จาก telegram_alerts record, ไม่ guess sourceId |
| Meta 24-hour window expired | Medium | Medium | เช็ค `windowExpiresAt` ก่อนส่ง, แจ้งบอสว่าหมดเวลา, ใช้ OTN ถ้ามี |
| MongoDB Atlas M0 free tier limit (512MB) | Low | Medium | TTL index บน telegram_alerts (7 วัน), truncate command_log (30 วัน) |
| บอสพิมพ์ผิด format | High | Low | Fuzzy match + AI fallback classify |
| Concurrent commands (บอสส่งรัวๆ) | Low | Low | Each command is independent, no shared state issue |
| Telegram rate limit (30 msg/sec) | Very Low | Low | ปกติบอสส่ง 1-5 msg/min, ไม่มีทาง hit limit |

---

## 15. Security Checklist

- [x] เช็ค `chat.id === TELEGRAM_CHAT_ID` ทุก message (บอสเท่านั้น)
- [x] Webhook URL มี secret path segment (ไม่ใช่ `/webhook/telegram` เฉยๆ)
- [x] ไม่ log bot token หรือ chat ID ลง console
- [x] Claim approve/reject ต้อง verify ว่า claim มีจริง + สถานะถูกต้อง
- [x] KB delete ต้อง confirm ด้วย ObjectId valid
- [x] ส่งข้อความกลับลูกค้าผ่าน platform-response.js (ไม่ bypass)
- [x] ไม่ expose internal API endpoints (agent-ask, boss-command) ผ่าน Telegram
- [x] Command log ไม่เก็บ sensitive data (mask เบอร์โทร)

---

## 16. Testing Checklist

### Unit Tests (manual — ไม่มี test framework)

```
[ ] parseCommand("เคลม MC-05901") → { intent: "claim_view", params: { ticketNumber: "MC-05901" } }
[ ] parseCommand("อนุมัติ MC-05901") → { intent: "claim_approve", ... }
[ ] parseCommand("ปฏิเสธ MC-05901 ไม่อยู่ในเงื่อนไข") → { intent: "claim_reject", params: { reason: "ไม่อยู่ในเงื่อนไข" } }
[ ] parseCommand("KB เพิ่ม: title | content") → { intent: "kb_add", params: { title, content } }
[ ] parseCommand("ตอบ Noxnuan: ข้อความ") → { intent: "reply_by_name", ... }
[ ] parseCommand("สวัสดี") → { intent: "unknown" } (fallback AI)
[ ] parseCommand("/help") → { intent: "help" }
```

### Integration Tests (Telegram จริง)

```
[ ] ส่ง /help → ได้ menu
[ ] ส่ง "เคลมรอตรวจ" → ได้ list (หรือ "ไม่มีเคลมรอตรวจ")
[ ] ส่ง "เคลม MC-XXXXX" (เลขจริง) → ได้ข้อมูลเคลม + รูป
[ ] ส่ง "เคลม MC-99999" (ไม่มี) → ได้ "ไม่พบเคลม"
[ ] ส่ง "KB เพิ่ม: test | test content" → ได้ยืนยัน, เข้าไปเช็คใน Dashboard KB
[ ] ส่ง "KB ค้นหา: กล่อง" → ได้ผลค้นหา
[ ] ส่ง "สถานะ" → ได้ health check
[ ] ส่ง "แชทวันนี้" → ได้สถิติ
[ ] Reply alert ai_confused → ข้อความถึงลูกค้า FB/LINE + KB ถูกเพิ่ม
[ ] ส่งข้อความจาก chat_id อื่น → ไม่มี response (silent drop)
```

### Load / Stress Tests

```
[ ] ส่ง 10 commands ภายใน 10 วินาที → ทุกคำสั่งทำงาน ไม่มี error
[ ] Daily summary cron fire → ข้อความสรุปถูกต้อง
[ ] Alert + Reply flow end-to-end: AI งง → alert → reply → ลูกค้าได้รับข้อความ
```

---

## 17. Rollback Plan

### ถ้า Phase 1 มีปัญหา:

1. ลบ webhook: `curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"`
2. Comment out route ใน `index.js`: `// app.post('/webhook/telegram/...')`
3. `telegram-alert.js` ยังทำงานเหมือนเดิม (push-only)
4. `telegram-gung.js` ไม่ถูกเรียก → ไม่มี side effect

### ถ้า sendTelegramAlert เสีย:

1. Revert `telegram-alert.js` ไป version เดิม (V.1.0)
2. Alert ยังส่งได้ แต่ไม่บันทึก telegram_alerts (reply flow หยุดทำงาน)

### MongoDB collections ใหม่:

- `telegram_alerts` — drop ได้เลย ไม่กระทบระบบอื่น
- `telegram_command_log` — drop ได้เลย เป็นแค่ audit log

---

## 18. Nginx Configuration Note

ต้องเช็คว่า Nginx proxy `/webhook/telegram/*` ไปยัง agent:

```nginx
# ใน conf.d/default.conf
location /webhook/telegram/ {
    proxy_pass http://agent:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

ถ้า Nginx config ปัจจุบัน proxy ทุก path ไป agent อยู่แล้ว (catch-all) → ไม่ต้องแก้

---

## 19. Implementation Notes (V.1.0 — แก้ Critical Bugs จาก Tech Lead Review)

1. **claim_id vs ticket_number** — WP MCP `/claim-manual-update` ต้องใช้ `claim_id` (int จาก `wpClaimId` ใน MongoDB) ไม่ใช่ `ticket_number` (string). Implementation ใช้ `claim.wpClaimId` ถูกต้อง.
2. **Telegram Markdown parse error** — ชื่อลูกค้าที่มี `_` หรือ `*` ทำให้ Markdown V1 พัง. แก้ด้วย `escapeMarkdown()` ใน `telegram-alert.js`. Reply messages (telegram-gung.js) ส่งเป็น plain text ไม่ใช้ Markdown เพื่อความปลอดภัย.
3. **Real token removed from spec** — ลบ bot token + chat_id จาก spec file. ใช้ .env บน server เท่านั้น.
4. **isReplyToAlert check** — ไม่ใช้ `from.is_bot` (ไม่ reliable) แต่ใช้ `telegramMessageId` lookup จาก `telegram_alerts` collection แทน.
5. **Nginx** — `/webhook/telegram/*` ถูก match โดย existing `location /webhook` prefix rule อยู่แล้ว ไม่ต้องเพิ่ม config.

---

## 20. Future Enhancements (Post-V1)

- **Inline Keyboard:** ปุ่ม "อนุมัติ" / "ปฏิเสธ" ใน alert message (ไม่ต้องพิมพ์)
- **Voice Message:** บอสส่ง voice → Whisper transcribe → execute command
- **Multi-admin:** รองรับหลาย chat_id (delegate ให้ทีมงาน)
- **Dashboard widget:** แสดง Telegram command history ใน Dashboard
- **Scheduled messages:** บอสสั่ง "ส่ง Noxnuan พรุ่งนี้ 9 โมง: ..."
- **Photo reply:** บอสส่งรูปเป็น reply → forward รูปไปหาลูกค้า
