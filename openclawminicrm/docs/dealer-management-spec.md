# Feature Spec: Dealer Management in AI Dashboard

Version: 1.0 | Date: 2026-04-07 | Author: Feature Architect

---

## 1. Problem & Goal

### Problem
ปัจจุบันเมื่อ AI Chatbot สร้าง Lead จากลูกค้าที่สนใจสินค้า ระบบต้อง roundtrip ไป WordPress MCP Bridge ทุกครั้ง:

1. **`resolveDealer()`** ใน `ai-chat.js` เรียก `/dealer-lookup` เพื่อหา dealerId จาก province/name
2. **`notifyDealerForAutoLead()`** เรียก `/distributor-notify` เพื่อส่ง LINE Flex card ไปกลุ่มตัวแทน
3. **`dinoco_create_lead` tool** เรียก `/distributor-notify` อีกครั้ง
4. **`dinoco_dealer_lookup` tool** เรียก `/dealer-lookup` เพื่อตอบลูกค้าว่าร้านอยู่ไหน

ปัญหา:
- **Latency**: roundtrip WP API (10s timeout + 2s retry) ทำให้ lead notification ช้า
- **Single point of failure**: WP API ล่ม = ไม่สามารถ notify ตัวแทนได้ (circuit breaker ช่วยแต่ไม่มี fallback notify)
- **Stale data**: WP distributor-list ไม่ถูก cache (ไม่เหมือน catalog/kb ที่มี preload cache)
- **Admin blind spot**: ข้อมูลตัวแทนอยู่แต่ใน WP Admin ดูยากจาก AI Dashboard
- **Fragmented management**: Lead pipeline อยู่ MongoDB แต่ dealer data อยู่ WP ต้องกระโดดไปมา

### Goal
ย้ายข้อมูลตัวแทนจำหน่ายมาเก็บใน MongoDB ให้ AI Dashboard เป็นศูนย์กลาง:
- Agent ส่ง LINE Flex card ตรง (ไม่ผ่าน WP)
- Admin จัดการตัวแทนจาก AI Dashboard
- AI lookup ตัวแทนจาก MongoDB (sub-ms vs 2-10s WP API)

### Success Metrics
| Metric | Before | Target |
|--------|--------|--------|
| Lead notification latency | 2-10s (WP roundtrip) | <500ms (direct LINE push) |
| Dealer lookup latency | 2-10s (WP API) | <50ms (MongoDB) |
| WP API dependency for lead | 3 calls/lead | 0 calls/lead |
| Admin visibility | WP Admin only | AI Dashboard + SLA + Lead history |

### What Happens If We Don't Build This
- Lead notification ยังช้า 2-10s → ตัวแทนตอบลูกค้าช้า → lead lost
- WP downtime = lead notification dead → ไม่มี fallback
- Admin ต้อง login WP ดูข้อมูลตัวแทน → workflow fragmented
- AI Dashboard ไม่สามารถ auto-assign lead ตามพื้นที่ได้เร็ว

### Existing Workaround
- `dinoco_dealer_lookup` tool ค้น MongoDB KB ก่อน (`knowledge_base` collection) แล้ว fallback WP API
- `wpCache.dealers` มี slot แต่ไม่ถูก preload (ไม่มีใน `preloadWPCache()`)

---

## 2. User Flows

### Flow A: Import Dealers from WP (One-time Setup)

```
Admin เปิด /dashboard/dealers
  |
  +--> หน้าว่าง (empty state) → แสดงปุ่ม "Import จาก WordPress"
  |
  +--> Admin กด Import
  |      |
  |      +--> Dashboard API POST /api/dealers/import
  |      |      |
  |      |      +--> Agent GET WP MCP /distributor-list
  |      |      |      |
  |      |      |      +--> Return distributors array
  |      |      |
  |      |      +--> Upsert ทีละรายใน MongoDB (match by wp_id)
  |      |      |
  |      |      +--> Return { imported: N, updated: M, skipped: S }
  |      |
  |      +--> แสดงผล import summary
  |
  +--> หน้า dealers list แสดงข้อมูล
```

Error Paths:
- WP API ไม่ตอบ → แสดง "ไม่สามารถเชื่อมต่อ WordPress ได้ — ลองใหม่หรือเพิ่มตัวแทนด้วยมือ"
- WP ตอบ 0 distributors → "ไม่พบข้อมูลตัวแทนใน WordPress"
- บาง record ซ้ำ (wp_id เดิม) → upsert update ไม่ duplicate

### Flow B: Admin จัดการตัวแทน (CRUD)

```
Happy Path — เพิ่มตัวแทนใหม่:
  Admin เปิด /dashboard/dealers
  +--> กดปุ่ม "+ เพิ่มตัวแทน"
  +--> Modal เปิดขึ้น
  |      Fields: ชื่อร้าน*, จังหวัด*, เบอร์โทร, LINE Group ID, rank
  |      (* = required)
  +--> กด "บันทึก"
  |      |
  |      +--> POST /api/dealers → validate → insert MongoDB
  |      +--> ปิด Modal → แสดง row ใหม่ในตาราง + toast "เพิ่มตัวแทนสำเร็จ"
  |
  +--> Error: ขาด required fields → highlight fields สีแดง + ข้อความ

Happy Path — แก้ไข:
  Admin กดชื่อร้าน / กดปุ่ม "แก้ไข"
  +--> เปิดหน้า /dashboard/dealers/[id]
  +--> แก้ไข fields → กด "บันทึก"
  +--> PATCH /api/dealers/:id → update MongoDB → toast "บันทึกแล้ว"

Happy Path — ลบ:
  Admin กดปุ่ม "ลบ" → confirm dialog "ยืนยันลบตัวแทน XXX?"
  +--> DELETE /api/dealers/:id → soft delete (active: false)
  +--> row หายจาก list → toast "ลบแล้ว"
```

### Flow C: AI Auto-Lead → Notify Dealer (Core Flow)

```
ลูกค้าคุยกับ AI Chatbot
  |
  +--> AI detect สนใจสินค้า + จังหวัด/ร้านที่อยากซื้อ
  |
  +--> AI เรียก dinoco_create_lead tool
  |      |
  |      +--> [NEW] executeTool() ค้น MongoDB `dealers` collection
  |      |      |--> match by province + name (fuzzy)
  |      |      |--> return dealer._id, name, lineGroupId
  |      |
  |      +--> Insert lead ใน `leads` collection (dealerId = dealer._id)
  |      |
  |      +--> [NEW] ส่ง LINE Flex card ตรงไปกลุ่มตัวแทน
  |      |      |--> ใช้ sendLinePush(dealer.lineGroupId, [flexMessage])
  |      |      |--> ไม่ผ่าน WP API อีกต่อไป
  |      |
  |      +--> Update lead status → "dealer_notified"
  |
  +--> AI ตอบลูกค้า "แจ้งร้าน XXX แล้วค่ะ จะติดต่อกลับเร็วที่สุด"

Error Paths:
  +--> ไม่พบตัวแทนในจังหวัด → ส่ง admin group แทน (fallback เหมือนเดิม)
  +--> dealer ไม่มี lineGroupId → ส่ง admin group + สร้าง alert
  +--> LINE push fail → log error + สร้าง alert ใน alerts collection
```

### Flow D: Admin ดูรายละเอียดตัวแทน

```
Admin เปิด /dashboard/dealers/[id]
  |
  +--> แสดง 4 sections:
  |      1. ข้อมูลร้าน (ชื่อ, จังหวัด, เบอร์, rank, walkin, active)
  |      2. Lead History (leads ทั้งหมดที่ assign ให้ร้านนี้)
  |      3. SLA Scorecard (contact rate, satisfaction rate, grade)
  |      4. Quick Actions (ส่งข้อความ LINE, ทดสอบ notification)
  |
  +--> Lead History table:
  |      |--> fetch leads WHERE dealerId = this dealer._id
  |      |--> sort by createdAt DESC
  |      |--> show: ลูกค้า, สินค้า, สถานะ, วันที่
  |
  +--> SLA card:
         |--> aggregate จาก leads collection (7 วันล่าสุด)
         |--> contact rate, no response count, grade (A/B/C/D)
```

### Edge Cases

| Case | Handling |
|------|----------|
| ตัวแทนไม่มี LINE Group ID | badge "ยังไม่ผูก LINE" + ส่ง admin group แทน |
| ตัวแทนถูก deactivate | ไม่แสดงใน AI lookup + ไม่ assign lead ใหม่ |
| wp_id ซ้ำตอน import | upsert by wp_id → update ไม่สร้างซ้ำ |
| Admin แก้จังหวัดหลัง lead ถูก assign | lead เดิมไม่เปลี่ยน → เฉพาะ lead ใหม่ที่ match ใหม่ |
| หลายตัวแทนในจังหวัดเดียว | return ทั้งหมด → AI เลือกตัวที่เหมาะสม (proximity/rank) |
| ตัวแทนถูกลบแต่มี lead อ้างอิง | soft delete (active: false) — lead history ยังดูได้ |
| Dashboard เปิดหลาย tab | CRUD operations idempotent + ไม่มี optimistic update conflict |

---

## 3. Data Model

### 3.1 MongoDB Collection: `dealers`

```javascript
{
  _id: ObjectId,                          // MongoDB auto-generated
  wp_id: Number | null,                   // WordPress post ID (for import tracking)

  // --- Core Info ---
  name: String,                           // ชื่อร้าน (shop_name from WP)
  ownerName: String,                      // ชื่อเจ้าของ (owner_name from WP)
  phone: String,                          // เบอร์โทร (owner_phone from WP)

  // --- Location ---
  province: String,                       // จังหวัด (dist_province from WP)
  district: String,                       // อำเภอ (dist_district from WP)
  address: String,                        // ที่อยู่เต็ม (dist_address from WP)
  postcode: String,                       // รหัสไปรษณีย์ (dist_postcode from WP)
  coverageAreas: [String],               // พื้นที่ครอบคลุมเพิ่มเติม เช่น ["บางนา", "สุขุมวิท"]

  // --- LINE Integration ---
  lineGroupId: String | null,             // LINE Group ID สำหรับส่ง notification
  ownerLineUid: String | null,            // LINE User ID เจ้าของร้าน

  // --- Business ---
  rank: String,                           // "Standard" | "Silver" | "Gold" | "Platinum" | "Diamond"
  isWalkin: Boolean,                      // เป็นร้านหน้าโกดัง
  active: Boolean,                        // สถานะใช้งาน (soft delete = false)

  // --- Metadata ---
  notes: String,                          // หมายเหตุจาก admin
  importedAt: Date | null,                // วันที่ import จาก WP (null = สร้างใน dashboard)
  createdAt: Date,
  updatedAt: Date,
}
```

### 3.2 Indexes

```javascript
// dealers collection
{ province: 1, active: 1 }                // AI lookup by province
{ name: "text", province: "text", coverageAreas: "text" }  // text search
{ wp_id: 1 }                               // import dedup (sparse)
{ lineGroupId: 1 }                         // lookup by LINE group
{ active: 1, rank: 1 }                     // filter + sort
{ ownerLineUid: 1 }                        // LIFF AI auth lookup (future)
```

### 3.3 Mapping: WP distributor ACF -> MongoDB dealers

| WP ACF Field | MongoDB Field | Transform |
|-------------|---------------|-----------|
| `post.ID` | `wp_id` | direct |
| `shop_name` or `post_title` | `name` | fallback chain |
| `owner_name` | `ownerName` | direct |
| `owner_phone` / `phone` | `phone` | direct |
| `dist_province` / `province` | `province` | direct |
| `dist_district` | `district` | direct |
| `dist_address` | `address` | direct |
| `dist_postcode` | `postcode` | direct |
| `group_id` / `line_group_id` | `lineGroupId` | direct |
| `owner_line_uid` | `ownerLineUid` | direct |
| `rank` | `rank` | default "Standard" |
| `is_walkin` | `isWalkin` | boolean coerce |
| `is_active` | `active` | `!== '0'` |

Note: `current_debt`, `credit_limit`, `credit_term_days`, `credit_hold`, `recommended_skus` ไม่ import มา MongoDB เพราะเป็นข้อมูล B2B transaction ที่ต้อง remain ใน WP เป็น single source of truth

---

## 4. API Design

### 4.1 Agent REST Endpoints (proxy/index.js)

ทุก endpoint ต้องผ่าน `requireAuth` middleware

#### GET /api/dealers
รายการตัวแทนทั้งหมด (พร้อม filter + search)

```
Query params:
  ?search=เชียงใหม่            // text search (name, province, coverageAreas)
  ?province=เชียงใหม่          // exact province filter
  ?rank=Gold                   // rank filter
  ?active=true                 // active filter (default: true)
  ?limit=50                    // pagination (default 50, max 200)
  ?skip=0                      // offset

Response 200:
{
  ok: true,
  count: 15,
  total: 42,
  dealers: [
    {
      _id: "...",
      name: "Garaji Moto",
      province: "เชียงใหม่",
      phone: "0812345678",
      rank: "Gold",
      isWalkin: false,
      active: true,
      lineGroupId: "Cxxxxxxxxxx",
      leadStats: {                    // aggregated on-the-fly
        total: 12,
        active: 3,
        noResponse: 1,
        contactRate: 0.83
      },
      createdAt: "2025-06-01T..."
    },
    ...
  ]
}
```

#### GET /api/dealers/:id
รายละเอียดตัวแทน + lead history + SLA

```
Response 200:
{
  ok: true,
  dealer: { ...fullDealerObject },
  leads: [                           // last 50 leads for this dealer
    { _id, customerName, productInterest, status, platform, createdAt, ... }
  ],
  sla: {                             // aggregated from leads (last 30 days)
    totalLeads: 24,
    contacted: 20,
    noResponse: 2,
    closed: 18,
    satisfied: 15,
    contactRate: 0.83,
    satisfactionRate: 0.83,
    grade: "A",
    avgResponseHours: 2.5
  }
}
```

#### POST /api/dealers
สร้างตัวแทนใหม่

```
Body:
{
  name: "ร้าน XXX",                  // required
  province: "เชียงใหม่",             // required
  phone: "0812345678",
  ownerName: "คุณ AAA",
  district: "เมือง",
  address: "123/4 ถ.ห้วยแก้ว",
  postcode: "50000",
  lineGroupId: "Cxxxxxxxxxx",
  ownerLineUid: "Uxxxxxxxxxx",
  rank: "Standard",
  isWalkin: false,
  coverageAreas: ["หางดง", "สันทราย"],
  notes: ""
}

Response 201:
{ ok: true, dealer: { ...insertedDealer } }

Response 400:
{ ok: false, error: "ชื่อร้านและจังหวัดจำเป็น" }
```

#### PATCH /api/dealers/:id
แก้ไขข้อมูลตัวแทน

```
Body: (partial update — only fields that changed)
{
  phone: "0898765432",
  lineGroupId: "Cxxxxxxxxxx",
  rank: "Gold"
}

Response 200:
{ ok: true, dealer: { ...updatedDealer } }

Response 404:
{ ok: false, error: "ไม่พบตัวแทน" }
```

#### DELETE /api/dealers/:id
Soft delete (set active: false)

```
Response 200:
{ ok: true, message: "ปิดใช้งานตัวแทนแล้ว" }

Response 404:
{ ok: false, error: "ไม่พบตัวแทน" }
```

#### POST /api/dealers/:id/notify
ส่งข้อความ LINE ไปกลุ่มตัวแทน (test notification / custom message)

```
Body:
{
  type: "test",                      // "test" | "custom"
  message: "ข้อความทดสอบ"           // required for type=custom
}

Response 200:
{ ok: true, sent: true }

Response 200 (no LINE group):
{ ok: false, error: "ตัวแทนนี้ยังไม่ผูก LINE Group" }
```

#### POST /api/dealers/import
Import จาก WordPress MCP Bridge

```
Body: (none required)

Response 200:
{
  ok: true,
  imported: 5,                        // new dealers
  updated: 10,                        // existing dealers (matched by wp_id)
  skipped: 0,                         // errors
  errors: []                          // [ { wp_id: 123, error: "..." } ]
}

Response 502:
{ ok: false, error: "ไม่สามารถเชื่อมต่อ WordPress ได้" }
```

#### GET /api/dealers/lookup
AI internal lookup (ใช้โดย executeTool)

```
Query params:
  ?province=เชียงใหม่
  ?name=Garaji

Response 200:
{
  ok: true,
  dealers: [
    { _id: "...", name: "Garaji Moto", province: "เชียงใหม่", lineGroupId: "C...", phone: "081..." }
  ]
}
```

### 4.2 Dashboard API Routes (smltrackdashboard/src/app/api/)

Dashboard API routes proxy to MongoDB directly (same pattern as existing `/api/proxy/leads`):

| Route | File | Method | Purpose |
|-------|------|--------|---------|
| `/api/dealers` | `src/app/api/dealers/route.ts` | GET, POST | List + Create |
| `/api/dealers/import` | `src/app/api/dealers/import/route.ts` | POST | Import from WP |
| `/api/dealers/[id]` | `src/app/api/dealers/[id]/route.ts` | GET, PATCH, DELETE | Detail + Update + Delete |
| `/api/dealers/[id]/notify` | `src/app/api/dealers/[id]/notify/route.ts` | POST | Send LINE notification |
| `/api/dealers/[id]/leads` | `src/app/api/dealers/[id]/leads/route.ts` | GET | Lead history for dealer |

Note: Dashboard routes hit MongoDB directly via `getDB()` (same pattern as `/api/proxy/leads`, `/api/proxy/dealer-sla`). The Agent `/api/dealers/*` endpoints are for internal AI tool usage.

### 4.3 Permission Model

| Endpoint | Who | Auth |
|----------|-----|------|
| Dashboard `/api/dealers/*` | Admin only | NextAuth Google Login (proxy.ts) |
| Agent `/api/dealers/*` | Internal / Admin | `requireAuth` middleware |
| Agent `/api/dealers/lookup` | AI tools (internal) | No auth needed (internal call) |

### 4.4 LINE Flex Card: "Lead ใหม่" (Agent-built)

ส่งตรงจาก Agent ผ่าน `sendLinePush()` ไม่ผ่าน WP อีกต่อไป

```javascript
// ไฟล์: proxy/modules/lead-pipeline.js (ย้าย notify logic มาจาก WP)
function buildLeadNotifyFlex({ customerName, productInterest, province, phone, leadId }) {
  return {
    type: "flex",
    altText: `Lead ใหม่: ${customerName} สนใจ ${productInterest}`,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical",
        contents: [
          { type: "text", text: "Lead ใหม่จาก DINOCO", weight: "bold", size: "lg", color: "#FF6B00" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "md",
        contents: [
          { type: "text", text: `ลูกค้า: ${customerName}`, size: "md" },
          { type: "text", text: `สนใจ: ${productInterest}`, size: "md", color: "#1A3A5C" },
          { type: "text", text: `จังหวัด: ${province || "-"}`, size: "sm", color: "#666666" },
          { type: "text", text: "กรุณาติดต่อลูกค้าภายใน 4 ชม.", size: "sm", color: "#FF0000", weight: "bold" },
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          // ปุ่มโทร (ถ้ามีเบอร์)
          ...(phone ? [{
            type: "button",
            action: { type: "uri", label: "โทรลูกค้า", uri: `tel:${phone}` },
            style: "primary", color: "#FF6B00", height: "sm"
          }] : []),
          // ปุ่มรับงาน (postback)
          {
            type: "button",
            action: { type: "postback", label: "รับแล้ว", data: `lead_accepted:${leadId}` },
            style: "secondary", height: "sm"
          },
        ],
      },
    },
  };
}
```

---

## 5. UI Wireframes

### 5.1 Dealers List Page (`/dashboard/dealers`)

```
+------------------------------------------------------------------+
| ตัวแทนจำหน่าย                                    [+ เพิ่มตัวแทน] |
| จัดการตัวแทน DINOCO — ผูก LINE Group + ติดตาม Lead               |
+------------------------------------------------------------------+

+--------+  +--------+  +--------+  +--------+
| 42     |  | 38     |  | 78%    |  | 3      |
| ทั้งหมด  |  | Active |  | SLA    |  | ไม่ตอบ   |
+--------+  +--------+  +--------+  +--------+

[ค้นหา... 🔍]  [จังหวัด ▼]  [Rank ▼]  [สถานะ ▼]  [Import WP ↓]

+------------------------------------------------------------------+
| ร้าน          | จังหวัด    | Rank   | LINE | Leads | SLA  | ...|
|-------------- |-----------|--------|------|-------|------|-----|
| Garaji Moto   | เชียงใหม่  | Gold   | ✅   | 12    | A    | ... |
| FOX Racing    | กรุงเทพ    | Silver | ✅   | 8     | B    | ... |
| ICE Service   | ขอนแก่น   | Std    | ❌   | 3     | C    | ... |
+------------------------------------------------------------------+

Badge meanings:
  ✅ = มี LINE Group ID
  ❌ = ยังไม่ผูก LINE
  Walk-in = badge สีม่วง "Walk-in"
  SLA Grade: A=เขียว B=น้ำเงิน C=เหลือง D=แดง
```

Components:
- Summary stat cards (4 cards, grid 2x2 mobile / 4 col desktop)
- Search input (debounced 300ms)
- Filter dropdowns (province, rank, active status)
- Data table with sortable columns
- Pagination (50 per page)
- Row click -> navigate to detail page
- "Import WP" button (secondary, outline)
- "+ เพิ่มตัวแทน" button (primary, orange)

States:
- **Loading**: Skeleton rows (5 rows)
- **Empty**: Illustration + "ยังไม่มีข้อมูลตัวแทน" + [Import จาก WordPress] + [เพิ่มด้วยมือ]
- **Error**: Red banner "ไม่สามารถโหลดข้อมูลได้ — ลองใหม่"
- **Search no results**: "ไม่พบตัวแทนที่ค้นหา"

### 5.2 Dealer Detail Page (`/dashboard/dealers/[id]`)

```
+------------------------------------------------------------------+
| ← กลับ                                                [แก้ไข] [ลบ] |
+------------------------------------------------------------------+
| Garaji Moto                                    Gold ⭐            |
| เชียงใหม่ | 081-234-5678 | LINE: ✅ ผูกแล้ว                       |
+------------------------------------------------------------------+

Tab: [ข้อมูลร้าน] [Lead History] [SLA]

--- Tab: ข้อมูลร้าน ---
+------------------------------------------------------------------+
| ข้อมูลร้าน                                           [แก้ไข]     |
|                                                                  |
| ชื่อร้าน: Garaji Moto                                            |
| เจ้าของ: คุณ AAA                                                 |
| เบอร์โทร: 081-234-5678                                           |
| จังหวัด: เชียงใหม่                                                |
| อำเภอ: เมือง                                                     |
| ที่อยู่: 123/4 ถ.ห้วยแก้ว                                        |
|                                                                  |
| LINE Group ID: Cxxxxxxxxxx                                       |
| Owner LINE UID: Uxxxxxxxxxx                                      |
| Rank: Gold                                                       |
| Walk-in: ไม่ใช่                                                   |
| พื้นที่ครอบคลุม: หางดง, สันทราย                                    |
|                                                                  |
| [ทดสอบส่ง LINE] [ส่งข้อความ]                                      |
+------------------------------------------------------------------+

--- Tab: Lead History ---
+------------------------------------------------------------------+
| Lead History (12 รายการ)                                          |
|                                                                  |
| คุณสมชาย | แคชบาร์ ADV350 | ✅ ปิด (พอใจ) | 2 เม.ย.             |
| คุณวิชัย  | กล่องข้าง 37L  | 📞 รอติดต่อ   | 5 เม.ย.             |
| คุณพิมพ์  | แร็คหลัง       | 🚨 ไม่ตอบ     | 6 เม.ย.             |
+------------------------------------------------------------------+

--- Tab: SLA ---
+------------------------------------------------------------------+
| SLA Scorecard (30 วันล่าสุด)                     Grade: A        |
|                                                                  |
| Contact Rate: 83%     ████████░░ (10/12)                         |
| Satisfaction: 88%     █████████░ (7/8)                            |
| Avg Response: 2.5 ชม.                                            |
| No Response: 1                                                   |
+------------------------------------------------------------------+
```

Components:
- Back button + action buttons (Edit, Delete)
- Header card with name, rank badge, province, phone, LINE status
- Tab navigation (3 tabs)
- Info cards (view-only by default, edit mode on click)
- Lead history table (reuse STATUS_LABELS from leads page)
- SLA card with progress bars
- Quick action buttons (test LINE, send custom message)

### 5.3 Add/Edit Modal

```
+------------------------------------------+
| เพิ่มตัวแทน                         [x]  |
+------------------------------------------+
|                                          |
| ชื่อร้าน *                               |
| [____________________________]           |
|                                          |
| เจ้าของร้าน                              |
| [____________________________]           |
|                                          |
| จังหวัด *                                |
| [____________________________]           |
|                                          |
| อำเภอ                                   |
| [____________________________]           |
|                                          |
| เบอร์โทร                                |
| [____________________________]           |
|                                          |
| LINE Group ID                            |
| [____________________________]           |
|                                          |
| Rank                                     |
| [Standard ▼]                             |
|                                          |
| ☐ Walk-in (ร้านหน้าโกดัง)                |
|                                          |
| พื้นที่ครอบคลุม (คั่นด้วย comma)           |
| [____________________________]           |
|                                          |
| หมายเหตุ                                 |
| [____________________________]           |
|                                          |
|               [ยกเลิก] [บันทึก]          |
+------------------------------------------+
```

Validation Rules:
| Field | Required | Validation |
|-------|----------|------------|
| name | Yes | min 2 chars |
| province | Yes | min 2 chars |
| phone | No | 9-10 digits |
| lineGroupId | No | starts with "C" or "U" (LINE format) |
| ownerLineUid | No | starts with "U" |
| rank | No | enum: Standard/Silver/Gold/Platinum/Diamond |
| isWalkin | No | boolean |
| coverageAreas | No | comma-separated string → array |

### 5.4 Import Modal

```
+------------------------------------------+
| Import จาก WordPress                [x]  |
+------------------------------------------+
|                                          |
| ดึงข้อมูลตัวแทนจาก WordPress เข้า AI     |
| Dashboard                                |
|                                          |
| • ตัวแทนที่ wp_id ซ้ำจะถูก update        |
| • ตัวแทนใหม่จะถูกเพิ่ม                   |
| • ไม่มีการลบข้อมูลที่มีอยู่               |
|                                          |
| [ยกเลิก]              [เริ่ม Import]     |
+------------------------------------------+

--- During import ---
| กำลัง import... (15/42)                  |
| ████████████░░░░░░░░ 36%                 |

--- After import ---
| Import สำเร็จ                             |
| เพิ่มใหม่: 5 | อัพเดท: 10 | ข้าม: 0      |
| [ปิด]                                    |
```

---

## 6. Dependencies & Impact

### Files ที่ต้องแก้ไข

```
Agent (proxy/):
├── modules/dinoco-tools.js
│   ├── executeTool: dinoco_dealer_lookup → ค้น MongoDB dealers แทน WP API
│   ├── executeTool: dinoco_create_lead → notify ตรงผ่าน sendLinePush แทน callDinocoAPI
│   └── import { lookupDealerByProvince } from lead-pipeline (new helper)
│
├── modules/ai-chat.js
│   ├── resolveDealer() → ค้น MongoDB dealers แทน callDinocoAPI("/dealer-lookup")
│   └── notifyDealerForAutoLead() → ส่ง LINE Flex ตรง ไม่ผ่าน WP
│
├── modules/lead-pipeline.js
│   ├── notifyDealer() → ส่ง LINE Flex ตรง ไม่ผ่าน callDinocoAPI("/distributor-notify")
│   ├── เพิ่ม: lookupDealerByProvince() — MongoDB query helper
│   ├── เพิ่ม: buildLeadNotifyFlex() — LINE Flex card builder
│   ├── เพิ่ม: notifyDealerDirect() — sendLinePush + update lead status
│   └── ensureLeadIndexes() → เพิ่ม dealers collection indexes
│
├── modules/dinoco-cache.js
│   └── ลบ wpCache.dealers slot (ไม่ต้อง cache WP dealers อีกต่อไป)
│
├── index.js
│   ├── เพิ่ม: GET /api/dealers
│   ├── เพิ่ม: GET /api/dealers/:id
│   ├── เพิ่ม: POST /api/dealers
│   ├── เพิ่ม: PATCH /api/dealers/:id
│   ├── เพิ่ม: DELETE /api/dealers/:id
│   ├── เพิ่ม: POST /api/dealers/:id/notify
│   ├── เพิ่ม: POST /api/dealers/import
│   └── เพิ่ม: GET /api/dealers/lookup
│
Dashboard (smltrackdashboard/):
├── src/app/dealers/page.tsx              ← NEW: Dealers list page
├── src/app/dealers/[id]/page.tsx         ← NEW: Dealer detail page
├── src/app/api/dealers/route.ts          ← NEW: List + Create API
├── src/app/api/dealers/import/route.ts   ← NEW: Import from WP API
├── src/app/api/dealers/[id]/route.ts     ← NEW: Detail + Update + Delete API
├── src/app/api/dealers/[id]/notify/route.ts ← NEW: LINE notify API
├── src/app/api/dealers/[id]/leads/route.ts  ← NEW: Lead history API
├── src/components/Sidebar.tsx            ← ADD: "ตัวแทน" nav item
└── src/lib/mongodb.ts                    ← ADD: dealers collection indexes
```

### Files ที่ต้องสร้างใหม่

| File | Purpose |
|------|---------|
| `smltrackdashboard/src/app/dealers/page.tsx` | Dealers list UI |
| `smltrackdashboard/src/app/dealers/[id]/page.tsx` | Dealer detail UI |
| `smltrackdashboard/src/app/api/dealers/route.ts` | Dashboard API: list + create |
| `smltrackdashboard/src/app/api/dealers/import/route.ts` | Dashboard API: WP import |
| `smltrackdashboard/src/app/api/dealers/[id]/route.ts` | Dashboard API: CRUD |
| `smltrackdashboard/src/app/api/dealers/[id]/notify/route.ts` | Dashboard API: LINE notify |
| `smltrackdashboard/src/app/api/dealers/[id]/leads/route.ts` | Dashboard API: lead history |
| `proxy/scripts/import-dealers.js` | CLI script สำหรับ import (optional) |

### Dependencies ที่ต้องมีก่อน

| Dependency | Status | Note |
|------------|--------|------|
| MongoDB Atlas connection | Ready | ใช้ connection เดิม (`dinoco` database) |
| LINE Channel Access Token | Ready | ใช้ `getDynamicKeySync("LINE_CHANNEL_ACCESS_TOKEN")` เดิม |
| WP MCP Bridge `/distributor-list` | Ready | endpoint มีอยู่แล้ว (V.2.0) |
| `sendLinePush()` function | Ready | อยู่ใน `platform-response.js` |
| `requireAuth` middleware | Ready | อยู่ใน `middleware/auth.js` |
| NextAuth Google Login | Ready | dashboard auth ทำงานอยู่ |

### Side Effects ที่ต้องระวัง

| Risk | Impact | Mitigation |
|------|--------|------------|
| WP `/distributor-notify` ยังถูกเรียกจากที่อื่น | B2B Snippet 2/3 ยังใช้ WP endpoint ปกติ ไม่ conflict | Agent-only change ไม่กระทบ WP side |
| `dinoco_dealer_lookup` tool เปลี่ยน data source | AI อาจได้ข้อมูลต่างจากเดิม | Import WP data ก่อน + validate |
| Lead history อ้าง `dealerId` แบบ ObjectId | เดิมบาง lead มี `dealerId` เป็น WP post ID (string) | Migration: ถ้า `dealerId` เป็น WP ID → re-map เป็น MongoDB `_id` ตอน import |
| `wpCache.dealers` ถูกลบ | ไม่มี code ที่ใช้ dealers cache (ไม่ถูก preload) | Safe to remove |
| Dashboard CSS | ใช้ theme-* classes + glass-card pattern เดิม | ไม่มี conflict |

---

## 7. Implementation Roadmap

### Phase 1: MVP (ข้อมูลตัวแทนใน MongoDB + Dashboard CRUD)
**Target: 2-3 วัน**

```
Task 1.1: MongoDB Schema + Indexes
  File: proxy/modules/lead-pipeline.js (ensureLeadIndexes)
  File: smltrackdashboard/src/lib/mongodb.ts
  Work: เพิ่ม dealers indexes ใน both Agent + Dashboard
  Est: 30 min

Task 1.2: Agent API Endpoints (CRUD + Import)
  File: proxy/index.js
  Work: เพิ่ม 8 endpoints (GET/POST/PATCH/DELETE dealers, import, lookup, notify)
  Est: 3 hr

Task 1.3: Dashboard API Routes
  Files: 5 route.ts files ใน src/app/api/dealers/
  Work: proxy ไป MongoDB (same pattern as /api/proxy/leads)
  Est: 2 hr

Task 1.4: Dashboard UI — Dealers List
  File: src/app/dealers/page.tsx
  Work: table + search + filter + summary cards + import button
  Est: 3 hr

Task 1.5: Dashboard UI — Add/Edit Modal
  File: src/app/dealers/page.tsx (inline)
  Work: modal form + validation + CRUD actions
  Est: 2 hr

Task 1.6: Sidebar Navigation
  File: src/components/Sidebar.tsx
  Work: เพิ่ม { href: "/dealers", icon: "🏪", label: "ตัวแทน" } ใน "Lead Pipeline" group
  Est: 10 min

Task 1.7: Import from WordPress
  File: src/app/api/dealers/import/route.ts
  Work: call WP /distributor-list → upsert MongoDB
  Est: 1 hr

→ Deploy Phase 1 → ทดสอบ import + CRUD
```

### Phase 2: Direct LINE Notification (ตัดพึ่ง WP)
**Target: 2 วัน**

```
Task 2.1: Build Lead Notify Flex Card
  File: proxy/modules/lead-pipeline.js
  Work: buildLeadNotifyFlex() — LINE Flex message builder
  Est: 1 hr

Task 2.2: notifyDealerDirect() Function
  File: proxy/modules/lead-pipeline.js
  Work: lookup dealer MongoDB → sendLinePush → update lead status
  Est: 1 hr

Task 2.3: Update dinoco_create_lead Tool
  File: proxy/modules/dinoco-tools.js
  Work: แทน callDinocoAPI("/distributor-notify") ด้วย notifyDealerDirect()
  Est: 1 hr

Task 2.4: Update resolveDealer()
  File: proxy/modules/ai-chat.js
  Work: ค้น MongoDB dealers แทน callDinocoAPI("/dealer-lookup")
  Est: 1 hr

Task 2.5: Update notifyDealerForAutoLead()
  File: proxy/modules/ai-chat.js
  Work: ส่ง LINE Flex ตรง ไม่ผ่าน WP
  Est: 1 hr

Task 2.6: Update dinoco_dealer_lookup Tool
  File: proxy/modules/dinoco-tools.js
  Work: ค้น MongoDB dealers แทน WP API (keep KB fallback)
  Est: 1 hr

Task 2.7: Update notifyDealer() in lead-pipeline
  File: proxy/modules/lead-pipeline.js
  Work: ใช้ notifyDealerDirect() แทน callDinocoAPI
  Est: 30 min

→ Deploy Phase 2 → ทดสอบ lead flow end-to-end
```

### Phase 3: Detail Page + SLA (ข้อมูลเชิงลึก)
**Target: 1-2 วัน**

```
Task 3.1: Dealer Detail Page
  File: src/app/dealers/[id]/page.tsx
  Work: 3 tabs (info, lead history, SLA) + edit + quick actions
  Est: 3 hr

Task 3.2: Lead History API
  File: src/app/api/dealers/[id]/leads/route.ts
  Work: query leads WHERE dealerId = dealer._id, sort createdAt DESC
  Est: 30 min

Task 3.3: SLA Aggregation
  File: src/app/api/dealers/[id]/route.ts
  Work: aggregate leads → contact rate, satisfaction, grade
  Est: 1 hr

Task 3.4: Test Notification Button
  File: src/app/api/dealers/[id]/notify/route.ts + UI
  Work: "ทดสอบส่ง LINE" button on detail page
  Est: 1 hr

Task 3.5: Legacy Lead Migration (re-map dealerId)
  File: proxy/scripts/migrate-lead-dealer-ids.js (one-time script)
  Work: leads ที่มี dealerId เป็น WP post ID → re-map เป็น MongoDB _id
  Est: 1 hr

→ Deploy Phase 3 → QA ทั้งระบบ
```

### Phase 4: Polish (Optional Enhancements)
**Target: 1 วัน**

```
Task 4.1: Auto-refresh dealers list (30s interval)
Task 4.2: CSV export dealers list
Task 4.3: Bulk import validation UI (preview before confirm)
Task 4.4: Dealer map view (Google Maps embed by province)
Task 4.5: Remove wpCache.dealers from dinoco-cache.js (cleanup)
```

---

## 8. Risk & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| WP import ดึงข้อมูลไม่ครบ (missing ACF fields) | Medium | Low | Import script log warnings per field + UI แสดง incomplete badge |
| Lead notification ส่งไม่ถึงตัวแทน (LINE push fail) | Low | High | Fallback: ส่ง admin group + สร้าง alert + retry 1 ครั้ง |
| MongoDB dealers out of sync กับ WP | Medium | Low | One-way import design (WP is source, MongoDB is copy). Admin สามารถ re-import ได้ตลอด |
| Legacy leads มี dealerId เป็น WP ID | High | Medium | Phase 3 migration script re-map IDs + backward compat: dealer detail page accept both MongoDB _id and WP wp_id |
| LINE Group ID เปลี่ยน (ตัวแทนสร้าง group ใหม่) | Low | Medium | Admin update ผ่าน Dashboard UI + test notification button |
| Import ซ้ำสร้าง duplicate | Low | Medium | Upsert by wp_id (unique sparse index) |

---

## 9. Testing Checklist

### Phase 1: CRUD + Import
- [ ] Import จาก WP สำเร็จ — ข้อมูลตรงกับ WP Admin
- [ ] Import ซ้ำไม่สร้าง duplicate (upsert by wp_id)
- [ ] เพิ่มตัวแทนใหม่ (ไม่มี wp_id) สำเร็จ
- [ ] แก้ไขข้อมูลตัวแทน → ข้อมูลอัพเดท
- [ ] ลบตัวแทน → soft delete (active: false) → ไม่แสดงใน list
- [ ] Search by name → ผลลัพธ์ถูกต้อง
- [ ] Filter by province → ผลลัพธ์ถูกต้อง
- [ ] Filter by rank → ผลลัพธ์ถูกต้อง
- [ ] Empty state แสดงถูกต้อง (ก่อน import)
- [ ] Sidebar มี link "ตัวแทน"
- [ ] Mobile responsive (table scroll horizontal)

### Phase 2: LINE Notification
- [ ] AI สร้าง lead → Flex card ถูกส่งไปกลุ่มตัวแทน (ไม่ผ่าน WP)
- [ ] ตัวแทนไม่มี lineGroupId → fallback ส่ง admin group
- [ ] Flex card มีปุ่มโทร (ถ้ามีเบอร์)
- [ ] Flex card มีปุ่มรับงาน
- [ ] LINE push fail → alert ถูกสร้างใน alerts collection
- [ ] dinoco_dealer_lookup tool ใช้ MongoDB → ผลลัพธ์ถูกต้อง
- [ ] resolveDealer() ใช้ MongoDB → return dealer._id
- [ ] ตัวแทนที่ active=false ไม่ถูก match ใน lookup

### Phase 3: Detail + SLA
- [ ] หน้า detail แสดงข้อมูลถูกต้อง
- [ ] Lead history แสดง leads ทั้งหมดของตัวแทน
- [ ] SLA aggregation ถูกต้อง (contact rate, satisfaction rate)
- [ ] Grade calculation: A >= 90%+80%, B >= 70%+60%, C >= 50%, D < 50%
- [ ] Test notification ส่งสำเร็จ
- [ ] Legacy lead migration → dealerId re-mapped ถูกต้อง

---

## 10. Rollback Plan

### Phase 1 (CRUD + Import)
- ลบ dashboard pages + API routes + sidebar entry
- Drop dealers collection indexes
- ไม่กระทบ existing functionality (additive only)

### Phase 2 (LINE Notification) — Critical
ถ้ามีปัญหาหลัง deploy Phase 2:

1. **Immediate rollback**: Revert `dinoco-tools.js`, `ai-chat.js`, `lead-pipeline.js` กลับ version ก่อน
2. **เปลี่ยนกลับ**: `resolveDealer()` ใช้ `callDinocoAPI("/dealer-lookup")` เหมือนเดิม
3. **เปลี่ยนกลับ**: `notifyDealerForAutoLead()` ใช้ `callDinocoAPI("/distributor-notify")` เหมือนเดิม
4. **Feature flag** (recommended): เพิ่ม env var `USE_MONGODB_DEALERS=true` — ถ้า false ใช้ WP API เหมือนเดิม

```javascript
// Feature flag pattern
const USE_MONGODB_DEALERS = process.env.USE_MONGODB_DEALERS === "true";

async function resolveDealer(dealerName, province) {
  if (USE_MONGODB_DEALERS) {
    return resolveDealerFromMongo(dealerName, province);
  }
  return resolveDealerFromWP(dealerName, province); // existing code
}
```

### Phase 3 (Detail + SLA)
- ลบ detail page — ไม่กระทบ core functionality
- Migration script idempotent — run ซ้ำไม่พัง

---

## Appendix A: Data Flow Diagram

### Current Flow (WP-dependent)

```
Customer → AI Chatbot → dinoco_create_lead tool
                            |
                            +--> [MongoDB] insert lead
                            |
                            +--> [WP API] /dealer-lookup → resolve dealerId
                            |
                            +--> [WP API] /distributor-notify
                                    |
                                    +--> [WP PHP] get LINE group_id
                                    |
                                    +--> [WP PHP] LINE Push API
                                    |
                                    +--> Flex card → LINE Group (ตัวแทน)
```

### New Flow (MongoDB + Direct LINE)

```
Customer → AI Chatbot → dinoco_create_lead tool
                            |
                            +--> [MongoDB] query dealers (by province/name)
                            |       → return dealer._id + lineGroupId
                            |
                            +--> [MongoDB] insert lead (dealerId = dealer._id)
                            |
                            +--> [Agent] buildLeadNotifyFlex()
                            |
                            +--> [Agent] sendLinePush(dealer.lineGroupId, [flex])
                            |       → LINE Push API direct
                            |
                            +--> Flex card → LINE Group (ตัวแทน)
                            
                            WP API calls: 0 (was 2)
                            Latency: <500ms (was 2-10s)
```

### Import Flow

```
Admin clicks "Import" in Dashboard
  |
  +--> Dashboard POST /api/dealers/import
  |      |
  |      +--> Agent proxy: call WP MCP /distributor-list
  |      |      → GET https://dinoco.in.th/wp-json/dinoco-mcp/v1/distributor-list
  |      |      → Response: { count: N, distributors: [...] }
  |      |
  |      +--> For each distributor:
  |      |      +--> Map WP fields → MongoDB schema
  |      |      +--> db.collection("dealers").updateOne(
  |      |      |      { wp_id: dist.id },
  |      |      |      { $set: mappedFields, $setOnInsert: { createdAt: now } },
  |      |      |      { upsert: true }
  |      |      +--> )
  |      |
  |      +--> Return summary { imported, updated, skipped }
  |
  +--> Dashboard shows result
```

---

## Appendix B: Sidebar Navigation Update

เพิ่มใน `NAV_GROUPS` ของ `Sidebar.tsx` ภายใต้ group "Lead Pipeline":

```typescript
{
  groupLabel: "Lead Pipeline",
  items: [
    { href: "/leads", icon: "🎯", label: "ติดตาม Leads" },
    { href: "/dealers", icon: "🏪", label: "ตัวแทน" },        // NEW
    { href: "/dealer-sla", icon: "📊", label: "SLA ตัวแทน" },  // renamed icon
    { href: "/crm", icon: "👥", label: "CRM ลูกค้า" },
    { href: "/scorecard", icon: "🏆", label: "คะแนนลูกค้า" },
    { href: "/auto-closer", icon: "🤝", label: "ติดตามปิดการขาย" },
  ],
},
```

---

## Appendix C: Feature Flag Environment Variable

```bash
# .env (Agent)
USE_MONGODB_DEALERS=true    # false = fallback to WP API (safe rollback)
```

ค่า default = `false` (backward compatible). เปิด `true` หลัง import + validate data ครบ.
