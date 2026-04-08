# Feature Spec: Dealer Management in AI Dashboard

Version: 1.1 | Date: 2026-04-07 | Author: Feature Architect | Reviewed by: Tech Lead

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
  |      +--> Dashboard POST /dashboard/api/dealers/import
  |      |      |
  |      |      +--> proxy to Agent POST /api/dealers/import
  |      |      |      |
  |      |      |      +--> Agent GET WP MCP /distributor-list
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
  |      +--> POST /dashboard/api/dealers → validate → insert MongoDB
  |      +--> ปิด Modal → แสดง row ใหม่ในตาราง + toast "เพิ่มตัวแทนสำเร็จ"
  |
  +--> Error: ขาด required fields → highlight fields สีแดง + ข้อความ

Happy Path — แก้ไข:
  Admin กดชื่อร้าน / กดปุ่ม "แก้ไข"
  +--> เปิดหน้า /dashboard/dealers/[id]
  +--> แก้ไข fields → กด "บันทึก"
  +--> PATCH /dashboard/api/dealers/:id → update MongoDB → toast "บันทึกแล้ว"

Happy Path — ลบ:
  Admin กดปุ่ม "ลบ" → confirm dialog "ยืนยันลบตัวแทน XXX?"
  +--> DELETE /dashboard/api/dealers/:id → soft delete (active: false)
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
{ wp_id: 1 }, { unique: true, sparse: true }  // import dedup — unique+sparse: null wp_id ไม่ conflict, ป้องกัน duplicate import
{ lineGroupId: 1 }                         // lookup by LINE group
{ active: 1, rank: 1 }                     // filter + sort
{ ownerLineUid: 1 }                        // LIFF AI auth lookup (future)
```

### 3.3 Mapping: WP distributor ACF -> MongoDB dealers

**IMPORTANT: WP `/distributor-list` endpoint returns only 6 fields:**
`id`, `name` (shop_name || post_title), `province`, `phone`, `line_group_id`, `active`

Fields ที่ **import ได้ทันที** (จาก `/distributor-list` response):

| WP Response Field | MongoDB Field | Transform |
|-------------------|---------------|-----------|
| `id` | `wp_id` | direct (Number) |
| `name` | `name` | direct |
| `province` | `province` | direct |
| `phone` | `phone` | direct |
| `line_group_id` | `lineGroupId` | direct |
| `active` | `active` | direct (boolean) |

Fields ที่ **ต้อง Admin กรอกเพิ่ม** (ไม่มีใน `/distributor-list`):

| MongoDB Field | วิธีได้ข้อมูล | Priority |
|---------------|-------------|----------|
| `ownerName` | Admin กรอกใน Dashboard | Nice-to-have |
| `district` | Admin กรอกใน Dashboard | Nice-to-have |
| `address` | Admin กรอกใน Dashboard | Nice-to-have |
| `postcode` | Admin กรอกใน Dashboard | Nice-to-have |
| `ownerLineUid` | Admin กรอกหรือดึงจาก LIFF AI auth | Phase 3 |
| `rank` | default "Standard" ตอน import, Admin แก้ทีหลัง | Import with default |
| `isWalkin` | default `false` ตอน import, Admin แก้ทีหลัง | Import with default |
| `coverageAreas` | Admin กรอกใน Dashboard | Nice-to-have |
| `notes` | Admin กรอกใน Dashboard | Nice-to-have |

**Phase 2 Enhancement:** ถ้าต้องการ fields เพิ่ม ให้เพิ่ม ACF fields ใน WP `/distributor-list` callback (file: `[System] DINOCO MCP Bridge`, function `dinoco_mcp_distributor_list`). เพิ่ม `owner_name`, `rank`, `is_walkin`, `dist_district`, `dist_address`, `dist_postcode`, `owner_line_uid` ใน response array.

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

Dashboard API routes at `/dashboard/api/dealers/*` — proxy to MongoDB directly (same pattern as existing `/dashboard/api/proxy/leads`):

| Route | File | Method | Purpose |
|-------|------|--------|---------|
| `/dashboard/api/dealers` | `src/app/api/dealers/route.ts` | GET, POST | List + Create |
| `/dashboard/api/dealers/import` | `src/app/api/dealers/import/route.ts` | POST | Import from WP (proxy via Agent) |
| `/dashboard/api/dealers/[id]` | `src/app/api/dealers/[id]/route.ts` | GET, PATCH, DELETE | Detail + Update + Delete |
| `/dashboard/api/dealers/[id]/notify` | `src/app/api/dealers/[id]/notify/route.ts` | POST | Send LINE notification (proxy via Agent) |
| `/dashboard/api/dealers/[id]/leads` | `src/app/api/dealers/[id]/leads/route.ts` | GET | Lead history for dealer |

Note: Dashboard routes hit MongoDB directly via `getDB()` (same pattern as `/dashboard/api/proxy/leads`, `/dashboard/api/proxy/dealer-sla`).

**IMPORTANT: Import + LINE notify ต้อง proxy ผ่าน Agent:**
- Dashboard ไม่มี `MCP_ERP_API_KEY` (WP API key) → import ต้อง proxy ผ่าน Agent `POST /api/dealers/import`
- Dashboard ไม่มี `LINE_CHANNEL_ACCESS_TOKEN` → notify ต้อง proxy ผ่าน Agent `POST /api/dealers/:id/notify`
- CRUD operations (list, create, update, delete, lead history) hit MongoDB ตรงได้ (Dashboard มี `MONGODB_URI`)

```
Import flow:
  Dashboard POST /dashboard/api/dealers/import
    → proxy to Agent POST /api/dealers/import  (Agent มี MCP_ERP_API_KEY)
      → Agent GET WP /distributor-list
      → Agent upsert MongoDB
      → return summary

Notify flow:
  Dashboard POST /dashboard/api/dealers/:id/notify
    → proxy to Agent POST /api/dealers/:id/notify  (Agent มี LINE token)
      → Agent sendLinePush()
      → return result
```

The Agent `/api/dealers/*` endpoints serve both Dashboard proxy requests AND internal AI tool usage.

### 4.3 Permission Model

| Endpoint | Who | Auth | Notes |
|----------|-----|------|-------|
| Dashboard `/dashboard/api/dealers` | Admin only | NextAuth Google Login | MongoDB direct |
| Dashboard `/dashboard/api/dealers/import` | Admin only | NextAuth + proxy to Agent | Agent has WP API key |
| Dashboard `/dashboard/api/dealers/:id/notify` | Admin only | NextAuth + proxy to Agent | Agent has LINE token |
| Agent `/api/dealers/*` | Internal / Admin | `requireAuth` middleware | |
| Agent `/api/dealers/lookup` | AI tools (internal) | No auth (internal call only) | ไม่ expose ออก Nginx |

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

### Critical Code Changes (ต้องทำก่อน feature ใหม่)

#### 6.1 New Statuses: `closed_won`, `waiting_decision`, `waiting_stock`

ต้องเพิ่มใน `lead-pipeline.js` ให้ตรงกับ workflow จริง (Appendix D):

```javascript
// lead-pipeline.js — เพิ่ม 3 statuses ใหม่
const LEAD_STATUSES = [
  "lead_created", "dealer_notified", "checking_contact",
  "dealer_contacted", "dealer_no_response",
  "waiting_order", "order_placed",
  "waiting_delivery", "delivered",
  "waiting_install", "installed",
  "satisfaction_checked",
  "waiting_decision",                    // NEW: ลูกค้ากำลังคิด
  "waiting_stock",                       // NEW: รอสต็อกกลับมา (เก็บ waitingSKU)
  "closed_satisfied", "closed_lost", "closed_cancelled",
  "closed_won",                          // NEW: ลูกค้าสั่งแล้ว ปิดสำเร็จ
  "admin_escalated", "dormant",
];

// เพิ่ม transitions ใหม่ (merge กับ existing transitions)
const LEAD_TRANSITIONS = {
  // ... existing transitions ...
  dealer_contacted: ["waiting_order", "waiting_decision", "waiting_stock", "closed_won", "closed_lost"],
  // เพิ่ม: waiting_decision, waiting_stock, closed_won
  waiting_decision: ["closed_won", "closed_lost", "closed_cancelled", "admin_escalated"],
  waiting_stock: ["dealer_notified", "closed_lost", "closed_cancelled"],
  // waiting_stock → dealer_notified = สต็อกกลับมา loop ใหม่
  // ... terminal states ไม่เปลี่ยน ...
};
```

**Note:** `closed_won` vs `closed_satisfied`: ใช้ `closed_won` สำหรับ short-track (ลูกค้าสั่งแล้ว ปิดเคส) ก่อน delivery/install. `closed_satisfied` สำหรับ full-track (ผ่าน deliver → install → satisfaction_checked แล้ว). ทั้งคู่เป็น terminal state.

#### 6.2 Postback Handler Must Use FSM

ปัจจุบัน `index.js` line ~943 bypass FSM:
```javascript
// BUG: direct updateOne bypasses canTransitionLead() validation
await db.collection("leads").updateOne(leadQuery, {
  $set: { status: "dealer_contacted", updatedAt: new Date() }
});
```

**FIX:** ต้องเปลี่ยนเป็น:
```javascript
// FIXED: ใช้ updateLeadStatus() ผ่าน FSM validation
const { ObjectId } = require("mongodb");
const { updateLeadStatus } = require("./modules/lead-pipeline");
let leadId;
try { leadId = new ObjectId(data.replace("lead_accepted:", "")); }
catch { leadId = data.replace("lead_accepted:", ""); }
const success = await updateLeadStatus(leadId, "dealer_contacted", { by: "dealer_postback" });
if (success) {
  await replyToLine(event.replyToken, "รับทราบค่ะ! กรุณาติดต่อลูกค้าภายใน 4 ชม. นะคะ");
} else {
  await replyToLine(event.replyToken, "สถานะ lead อัพเดทแล้ว ขอบคุณค่ะ");
}
```

#### 6.3 `dealerId` Type Mismatch — Migration Plan

**Problem:** WP returns `post.ID` (Number, e.g. `123`). Code stores as `String(result.dealer_id)` via `resolveDealer()`. After migration, new leads use MongoDB `ObjectId`. Legacy leads have string WP IDs.

**Decision (Tech Lead):** Use **string type everywhere** during transition period.

```
Phase 1 (Import): dealers.wp_id = Number (WP post ID)
Phase 2 (Switch): new leads store dealerId = String(dealer._id)  // MongoDB ObjectId as string
Phase 3 (Migration): script re-maps legacy leads:
  for each lead where dealerId is numeric string:
    find dealer where wp_id == Number(lead.dealerId)
    if found: update lead.dealerId = String(dealer._id)
```

**Dual-type support during transition:**
```javascript
// dealer detail page + API ต้อง accept both:
async function findDealerFlexible(dealerId) {
  const db = await getDB();
  // Try MongoDB ObjectId first
  try {
    const dealer = await db.collection("dealers").findOne({ _id: new ObjectId(dealerId) });
    if (dealer) return dealer;
  } catch {}
  // Fallback: try wp_id (numeric string from legacy leads)
  const wpId = parseInt(dealerId, 10);
  if (!isNaN(wpId)) {
    return await db.collection("dealers").findOne({ wp_id: wpId });
  }
  return null;
}
```

#### 6.4 Centralize Notification — Fix Dual-Notify Bug

**Problem:** Notification ถูกส่ง 2 รอบ:
1. `dinoco_create_lead` tool (dinoco-tools.js:660) เรียก `callDinocoAPI("/distributor-notify")`
2. `notifyDealerForAutoLead()` (ai-chat.js:962) เรียก `callDinocoAPI("/distributor-notify")` อีกครั้ง

Path A: `dinoco_create_lead` tool → notify (1 ครั้ง) ✓ ไม่ซ้ำ
Path B: auto-lead (`aiReplyToLine`/`aiReplyToMeta`) → `insertOne` → `notifyDealerForAutoLead()` → notify (1 ครั้ง) ✓ ไม่ซ้ำ

**แต่ปัญหาอาจเกิดเมื่อ:** AI tool สร้าง lead แล้ว auto-lead detect อีกรอบ (race condition น้อย แต่ possible)

**FIX:** Centralize notify ที่ `notifyDealerDirect()` เพียงจุดเดียว:
```javascript
// lead-pipeline.js — single notification function
async function notifyDealerDirect(lead, dealer) {
  if (!dealer?.lineGroupId) {
    // fallback: ส่ง admin group
    const adminGroupId = process.env.B2B_ADMIN_GROUP_ID;
    if (adminGroupId) {
      const flex = buildLeadNotifyFlex({ ...lead, fallbackAdmin: true });
      await sendLinePush(adminGroupId, [flex]);
    }
    await createAlertForMissingLineGroup(lead, dealer);
    return false;
  }
  const flex = buildLeadNotifyFlex(lead);
  const sent = await sendLinePush(dealer.lineGroupId, [flex]);
  if (sent) {
    await updateLeadStatus(lead._id, "dealer_notified", { by: "system" });
  } else {
    // LINE push fail → fallback admin + alert
    const adminGroupId = process.env.B2B_ADMIN_GROUP_ID;
    if (adminGroupId) await sendLinePush(adminGroupId, [buildLeadNotifyFlex({ ...lead, fallbackAdmin: true })]);
    await createAlertForLinePushFail(lead, dealer);
  }
  return sent;
}
```

ทุกจุดที่ notify ตัวแทน ต้องเรียก `notifyDealerDirect()` แทน `callDinocoAPI("/distributor-notify")`:
- `dinoco_create_lead` tool (dinoco-tools.js)
- `notifyDealerForAutoLead()` (ai-chat.js)
- `notifyDealer()` (lead-pipeline.js)

#### 6.5 Normalize Field Name: `history` (ไม่ใช่ `followUpHistory`)

**Problem:** `lead-pipeline.js` ใช้ `followUpHistory` (line 68, 88) แต่ `ai-chat.js` + `dinoco-tools.js` ใช้ `history`

**Decision (Tech Lead):** ใช้ `history` ทุกที่ เพราะ:
1. `ai-chat.js` (auto-lead) ใช้ `history` อยู่แล้ว (ถูกเขียนใหม่กว่า)
2. `dinoco-tools.js` (tool lead) ใช้ `history`
3. Appendix D lead document ใช้ `history`
4. `followUpHistory` ใน `lead-pipeline.js` เป็น code เก่า (V.1.0)

**Migration:**
```javascript
// lead-pipeline.js — createLead()
// BEFORE: followUpHistory: [],
// AFTER:  history: [{ status: "lead_created", at: new Date(), by: "system" }],

// lead-pipeline.js — updateLeadStatus()
// BEFORE: $push: { followUpHistory: { from: lead.status, to: newStatus, ... } }
// AFTER:  $push: { history: { from: lead.status, to: newStatus, status: newStatus, at: new Date(), ...metadata } }
```

**One-time migration script** (Phase 3):
```javascript
// Merge followUpHistory → history for legacy leads
db.collection("leads").updateMany(
  { followUpHistory: { $exists: true, $ne: [] } },
  [{ $set: { history: { $concatArrays: [{ $ifNull: ["$history", []] }, "$followUpHistory"] } } }]
);
db.collection("leads").updateMany({}, { $unset: { followUpHistory: "" } });
```

#### 6.6 LINE Token Environment Variable

**Problem:** Agent กับ WP อาจใช้คนละ LINE Channel Access Token

**Clarification:** Agent ใช้ `getDynamicKeySync("LINE_CHANNEL_ACCESS_TOKEN")` ซึ่งดึงจาก `.env` var `LINE_CHANNEL_ACCESS_TOKEN`. WP ใช้ `B2B_LINE_ACCESS_TOKEN` (PHP constant). ถ้าทั้งสองเป็น **Bot เดียวกัน** (ซึ่ง DINOCO ใช้ Bot เดียว) ค่าจะตรงกัน.

**Spec requirement:**
- Agent `.env`: `LINE_CHANNEL_ACCESS_TOKEN` = Bot token สำหรับส่ง push messages
- ต้องเป็นค่าเดียวกับ WP `B2B_LINE_ACCESS_TOKEN` (ใช้ Bot เดียวกัน)
- ถ้า token expired/rotated ต้อง update ทั้ง 2 ที่ (Agent .env + WP wp-config.php)
- ใน Dashboard `.env` ไม่ต้องมี LINE token (proxy ผ่าน Agent)

### Files ที่ต้องแก้ไข

```
Agent (proxy/):
├── modules/dinoco-tools.js
│   ├── executeTool: dinoco_dealer_lookup → ค้น MongoDB dealers แทน WP API
│   ├── executeTool: dinoco_create_lead → ใช้ notifyDealerDirect() แทน callDinocoAPI
│   │   (ลบ callDinocoAPI("/distributor-notify") + ลบ direct updateOne สำหรับ dealer_notified)
│   └── import { lookupDealerByProvince, notifyDealerDirect } from lead-pipeline
│
├── modules/ai-chat.js
│   ├── resolveDealer() → ค้น MongoDB dealers แทน callDinocoAPI("/dealer-lookup")
│   ├── notifyDealerForAutoLead() → ใช้ notifyDealerDirect() แทน callDinocoAPI
│   └── auto-lead insert: ใช้ `history` field (ไม่ใช่ `followUpHistory`) — already correct
│
├── modules/lead-pipeline.js
│   ├── LEAD_STATUSES: เพิ่ม closed_won, waiting_decision, waiting_stock (6.1)
│   ├── LEAD_TRANSITIONS: เพิ่ม transitions สำหรับ new statuses (6.1)
│   ├── createLead(): เปลี่ยน followUpHistory → history (6.5)
│   ├── updateLeadStatus(): เปลี่ยน $push followUpHistory → $push history (6.5)
│   ├── notifyDealer() → ใช้ notifyDealerDirect() (6.4)
│   ├── เพิ่ม: lookupDealerByProvince() — MongoDB query helper
│   ├── เพิ่ม: notifyDealerDirect() — centralized notification (6.4)
│   ├── เพิ่ม: buildLeadNotifyFlex() — Flex แจ้งตัวแทน (Lead ใหม่)
│   ├── เพิ่ม: buildFollowUpFlex() — Flex ถามลูกค้า (ติดต่อหรือยัง/สั่งหรือยัง)
│   ├── เพิ่ม: buildStockBackFlex() — Flex แจ้งตัวแทน (สต็อกกลับมา)
│   ├── เพิ่ม: buildClosedFlex() — Flex สรุปปิดเคส
│   ├── เพิ่ม: buildDealerReminderFlex() — Flex เตือนตัวแทนที่ยังไม่ติดต่อ
│   └── ensureLeadIndexes() → เพิ่ม dealers collection indexes
│
├── modules/dinoco-cache.js
│   └── ลบ wpCache.dealers slot (ไม่ต้อง cache WP dealers อีกต่อไป)
│
├── index.js
│   ├── แก้: handleLinePostback() lead_accepted → ใช้ updateLeadStatus() (6.2)
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
├── src/app/api/dealers/route.ts          ← NEW: List + Create (MongoDB direct)
├── src/app/api/dealers/import/route.ts   ← NEW: Import (proxy to Agent)
├── src/app/api/dealers/[id]/route.ts     ← NEW: Detail + Update + Delete (MongoDB direct)
├── src/app/api/dealers/[id]/notify/route.ts ← NEW: LINE notify (proxy to Agent)
├── src/app/api/dealers/[id]/leads/route.ts  ← NEW: Lead history (MongoDB direct)
├── src/components/Sidebar.tsx            ← ADD: "ตัวแทน" nav item
└── src/lib/mongodb.ts                    ← ADD: dealers collection indexes
│
Scripts (one-time):
├── proxy/scripts/migrate-lead-dealer-ids.js   ← Phase 3: re-map dealerId WP→MongoDB
└── proxy/scripts/migrate-followup-history.js  ← Phase 1: merge followUpHistory → history
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
| `dinoco_dealer_lookup` tool เปลี่ยน data source | AI อาจได้ข้อมูลต่างจากเดิม | Import WP data ก่อน + validate ก่อนเปิด feature flag |
| `dealerId` type mismatch (6.3) | Legacy leads มี dealerId เป็น WP post ID (string "123") | Phase 3 migration script + findDealerFlexible() dual-type lookup |
| `followUpHistory` → `history` rename (6.5) | เก่า leads มี followUpHistory, ใหม่มี history | Phase 0 migration script merge + unset followUpHistory |
| Postback handler bypass FSM (6.2) | lead_accepted postback skip validation | Phase 0 fix: ใช้ updateLeadStatus() |
| Dual notification (6.4) | ตัวแทนได้ notification 2 ครั้ง (rare race condition) | Phase 2 centralize notify ที่ notifyDealerDirect() จุดเดียว |
| `wpCache.dealers` ถูกลบ | ไม่มี code ที่ใช้ dealers cache (ไม่ถูก preload) | Safe to remove |
| Dashboard CSS | ใช้ theme-* classes + glass-card pattern เดิม | ไม่มี conflict |
| LINE token mismatch | Agent กับ WP ใช้คนละ token = notify fail | ตรวจสอบ Agent .env = WP wp-config.php (Bot เดียวกัน) |
| Stock check cron (Phase 3) | waiting_stock leads ไม่ถูก notify เมื่อสต็อกกลับ | Phase 3 Task 3.6 เพิ่ม stock check cron |

---

## 7. Implementation Roadmap

### Phase 0: Critical Pre-requisites (ต้องทำก่อน)
**Target: 1 วัน**

```
Task 0.1: Normalize history field name (6.5)
  File: proxy/modules/lead-pipeline.js
  Work: createLead() → history แทน followUpHistory, updateLeadStatus() → $push history
  Script: proxy/scripts/migrate-followup-history.js (one-time merge)
  Est: 1 hr

Task 0.2: Fix postback handler bypass FSM (6.2)
  File: proxy/index.js (handleLinePostback)
  Work: เปลี่ยน direct updateOne → updateLeadStatus()
  Est: 30 min

Task 0.3: Add new LEAD_STATUSES + LEAD_TRANSITIONS (6.1)
  File: proxy/modules/lead-pipeline.js
  Work: เพิ่ม closed_won, waiting_decision, waiting_stock + transition rules
  Est: 30 min

→ Deploy Phase 0 → ทดสอบ lead pipeline ไม่พัง (regression test)
```

### Phase 1: MVP (ข้อมูลตัวแทนใน MongoDB + Dashboard CRUD)
**Target: 2-3 วัน**

```
Task 1.1: MongoDB Schema + Indexes
  File: proxy/modules/lead-pipeline.js (ensureLeadIndexes)
  File: smltrackdashboard/src/lib/mongodb.ts
  Work: เพิ่ม dealers indexes (wp_id unique+sparse) ใน both Agent + Dashboard
  Est: 30 min

Task 1.2: Agent API Endpoints (CRUD + Import)
  File: proxy/index.js
  Work: เพิ่ม 8 endpoints (GET/POST/PATCH/DELETE dealers, import, lookup, notify)
  Note: import endpoint เรียก WP /distributor-list ด้วย MCP_ERP_API_KEY
  Est: 3 hr

Task 1.3: Dashboard API Routes
  Files: 5 route.ts files ใน src/app/api/dealers/
  Work: CRUD → MongoDB direct, Import+Notify → proxy to Agent
  Note: import/notify proxy ผ่าน Agent เพราะ Dashboard ไม่มี WP API key / LINE token
  Est: 2 hr

Task 1.4: Dashboard UI — Dealers List
  File: src/app/dealers/page.tsx
  Work: table + search + filter + summary cards + import button
  Fetch: /dashboard/api/dealers (NOT /api/dealers)
  Est: 3 hr

Task 1.5: Dashboard UI — Add/Edit Modal
  File: src/app/dealers/page.tsx (inline)
  Work: modal form + validation + CRUD actions
  Est: 2 hr

Task 1.6: Sidebar Navigation
  File: src/components/Sidebar.tsx
  Work: เพิ่ม { href: "/dashboard/dealers", icon: "store", label: "ตัวแทน" } ใน "Lead Pipeline" group
  Est: 10 min

Task 1.7: Import from WordPress
  File: src/app/api/dealers/import/route.ts → proxy to Agent POST /api/dealers/import
  Work: Agent เรียก WP /distributor-list → upsert MongoDB
  Note: WP returns 6 fields only (id, name, province, phone, line_group_id, active)
        ที่เหลือ (ownerName, district, rank, isWalkin) ใช้ default + admin กรอกเพิ่ม
  Est: 1 hr

→ Deploy Phase 1 → ทดสอบ import + CRUD
```

### Phase 2: Direct LINE Notification (ตัดพึ่ง WP)
**Target: 2 วัน**

```
Task 2.1: Build Flex Card Builders (6 ตัว)
  File: proxy/modules/lead-pipeline.js
  Work: 
    - buildLeadNotifyFlex() — Flex แจ้งตัวแทน (Lead ใหม่) มีปุ่มโทร+รับงาน
    - buildFollowUpFlex() — Flex ถามลูกค้า (ติดต่อหรือยัง/สั่งหรือยัง)
    - buildStockBackFlex() — Flex แจ้งตัวแทน (สต็อก SKU กลับมาแล้ว)
    - buildClosedFlex() — Flex สรุปปิดเคส (won/lost)
    - buildDealerReminderFlex() — Flex เตือนตัวแทนที่ยังไม่ติดต่อลูกค้า
    - (buildLeadNotifyFlex มี variant fallbackAdmin: true สำหรับส่ง admin group)
  Est: 2 hr

Task 2.2: notifyDealerDirect() — Centralized Notification (6.4)
  File: proxy/modules/lead-pipeline.js
  Work: single function สำหรับทุกจุดที่ notify ตัวแทน
    - lookup dealer MongoDB → sendLinePush(dealer.lineGroupId, [flex])
    - fallback: ส่ง admin group + สร้าง alert
    - retry 1 ครั้ง ถ้า LINE push fail
    - update lead status → dealer_notified
  Est: 1 hr

Task 2.3: Update dinoco_create_lead Tool (fix dual-notify)
  File: proxy/modules/dinoco-tools.js
  Work: ลบ callDinocoAPI("/distributor-notify") + ลบ direct updateOne
        ใช้ notifyDealerDirect() แทน (centralized, 6.4)
  Est: 1 hr

Task 2.4: Update resolveDealer()
  File: proxy/modules/ai-chat.js
  Work: ค้น MongoDB dealers แทน callDinocoAPI("/dealer-lookup")
        return dealer._id as String (not ObjectId) + dealer.lineGroupId
  Est: 1 hr

Task 2.5: Update notifyDealerForAutoLead() (fix dual-notify)
  File: proxy/modules/ai-chat.js
  Work: ใช้ notifyDealerDirect() แทน callDinocoAPI("/distributor-notify")
        ไม่ต้อง direct updateOne สำหรับ dealer_notified (notifyDealerDirect จัดการ)
  Est: 1 hr

Task 2.6: Update dinoco_dealer_lookup Tool
  File: proxy/modules/dinoco-tools.js
  Work: ค้น MongoDB dealers collection แทน WP API
        keep KB fallback สำหรับ rich content (ที่อยู่, คำอธิบาย)
  Est: 1 hr

Task 2.7: Update notifyDealer() in lead-pipeline
  File: proxy/modules/lead-pipeline.js
  Work: ใช้ notifyDealerDirect() แทน callDinocoAPI("/distributor-notify")
  Est: 30 min

→ Deploy Phase 2 → ทดสอบ lead flow end-to-end
  ★ ใช้ USE_MONGODB_DEALERS=true feature flag (Appendix C)
```

### Phase 3: Detail Page + SLA + Migrations (ข้อมูลเชิงลึก)
**Target: 1-2 วัน**

```
Task 3.1: Dealer Detail Page
  File: src/app/dealers/[id]/page.tsx
  Work: 3 tabs (info, lead history, SLA) + edit + quick actions
  Note: ใช้ findDealerFlexible() accept both MongoDB _id + WP wp_id (6.3)
  Est: 3 hr

Task 3.2: Lead History API
  File: src/app/api/dealers/[id]/leads/route.ts → /dashboard/api/dealers/[id]/leads
  Work: query leads WHERE dealerId = dealer._id OR dealerId = String(dealer.wp_id)
        (dual-type support ระหว่าง transition, 6.3)
  Est: 30 min

Task 3.3: SLA Aggregation
  File: src/app/api/dealers/[id]/route.ts → /dashboard/api/dealers/[id]
  Work: aggregate leads → contact rate, satisfaction, grade
  Est: 1 hr

Task 3.4: Test Notification Button
  File: src/app/api/dealers/[id]/notify/route.ts → proxy to Agent POST /api/dealers/:id/notify
  Work: "ทดสอบส่ง LINE" button on detail page
  Est: 1 hr

Task 3.5: Legacy Lead Migration — dealerId re-map (6.3)
  File: proxy/scripts/migrate-lead-dealer-ids.js (one-time script)
  Work: leads ที่มี dealerId เป็น WP post ID (numeric string)
        → match dealer by wp_id → update dealerId เป็น String(dealer._id)
  Guard: dry-run mode (LOG only) ก่อน, ต้อง confirm ถึง apply
  Est: 1 hr

Task 3.6: Stock Check Cron (waiting_stock → dealer_notified)
  File: proxy/modules/lead-pipeline.js
  Work: เพิ่ม cron job ใน Mayom: ทุก 1 วัน (09:00)
    - query leads WHERE status = "waiting_stock" AND waitingSKU != null
    - เรียก WP /product-lookup per SKU → check stock_display
    - ถ้า stock_display = "in_stock" → buildStockBackFlex() → sendLinePush ตัวแทน
    - update lead status → dealer_notified (loop ใหม่)
  Note: ต้อง rate limit ไม่เกิน 20 SKU/cron run (WP API timeout)
  Est: 2 hr

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
Task 4.6: Enhance WP /distributor-list to return more fields
  File: [System] DINOCO MCP Bridge (function dinoco_mcp_distributor_list)
  Work: เพิ่ม owner_name, rank, is_walkin, dist_district, dist_address, 
        dist_postcode, owner_line_uid, group_id ใน response array
  Benefit: re-import จะได้ข้อมูลครบ ไม่ต้อง admin กรอกเพิ่ม
Task 4.7: waiting_decision_followup cron (Mayom)
  File: proxy/modules/lead-pipeline.js
  Work: leads ที่ waiting_decision > 7 วัน → ถามลูกค้าอีกรอบ → ถ้าไม่ตอบ → closed_lost
```

---

## 8. Risk & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| WP import ดึงข้อมูลไม่ครบ (only 6 fields) | **High** | Low | Dashboard UI แสดง "ข้อมูลไม่ครบ" badge + admin กรอกเพิ่ม. Phase 2: เพิ่ม fields ใน WP `/distributor-list` callback |
| Lead notification ส่งไม่ถึงตัวแทน (LINE push fail) | Low | High | Fallback: ส่ง admin group + สร้าง alert + retry 1 ครั้ง |
| MongoDB dealers out of sync กับ WP | Medium | Low | One-way import design (WP is source, MongoDB is copy). Admin สามารถ re-import ได้ตลอด |
| Legacy leads มี dealerId เป็น WP ID | **High** | Medium | Phase 3 migration script + findDealerFlexible() dual-type lookup (6.3) |
| `followUpHistory` vs `history` field conflict | **High** | Medium | Phase 0 migration script merge + unset (6.5) |
| Postback handler bypass FSM | **High** | Low | Phase 0 fix (6.2) — ปัจจุบันทำงานได้แต่ไม่ validate transition |
| Dual notification (race condition) | Low | Medium | Phase 2 centralize notify at notifyDealerDirect() (6.4) |
| LINE Group ID เปลี่ยน (ตัวแทนสร้าง group ใหม่) | Low | Medium | Admin update ผ่าน Dashboard UI + test notification button |
| Import ซ้ำสร้าง duplicate | Low | Medium | Upsert by wp_id (`unique: true, sparse: true` index) |
| Stock check cron miss | Medium | Low | Phase 3 Task 3.6 — rate limit 20 SKU/run + daily 09:00 |
| LINE token mismatch Agent vs WP | Low | High | Document ใน deploy checklist: ตรวจ .env LINE_CHANNEL_ACCESS_TOKEN = wp-config B2B_LINE_ACCESS_TOKEN |

---

## 9. Testing Checklist

### Phase 0: Critical Pre-requisites
- [ ] `followUpHistory` → `history` migration script works (dry-run + apply)
- [ ] Existing leads still have complete history after merge
- [ ] Postback "lead_accepted" uses `updateLeadStatus()` (not direct updateOne)
- [ ] Postback from invalid status → graceful failure (reply "สถานะอัพเดทแล้ว")
- [ ] New statuses exist: `closed_won`, `waiting_decision`, `waiting_stock`
- [ ] Transitions work: `dealer_contacted → waiting_decision → closed_won`
- [ ] Transitions work: `dealer_contacted → waiting_stock`
- [ ] Transitions work: `waiting_stock → dealer_notified` (stock back loop)
- [ ] Existing lead pipeline (Mayom cron) ไม่พัง (regression test)

### Phase 1: CRUD + Import
- [ ] Import จาก WP สำเร็จ — 6 fields ตรงกับ WP Admin (id, name, province, phone, line_group_id, active)
- [ ] Import ซ้ำไม่สร้าง duplicate (upsert by wp_id, unique sparse index)
- [ ] Import → fields ที่ไม่มี (ownerName, rank, isWalkin) ใช้ default ถูกต้อง
- [ ] เพิ่มตัวแทนใหม่ (ไม่มี wp_id) สำเร็จ
- [ ] แก้ไขข้อมูลตัวแทน → ข้อมูลอัพเดท
- [ ] ลบตัวแทน → soft delete (active: false) → ไม่แสดงใน list
- [ ] Search by name → ผลลัพธ์ถูกต้อง
- [ ] Filter by province → ผลลัพธ์ถูกต้อง
- [ ] Filter by rank → ผลลัพธ์ถูกต้อง
- [ ] Empty state แสดงถูกต้อง (ก่อน import)
- [ ] Sidebar มี link "ตัวแทน" ที่ `/dashboard/dealers`
- [ ] Mobile responsive (table scroll horizontal)
- [ ] Dashboard import proxies ผ่าน Agent สำเร็จ (Dashboard ไม่เรียก WP ตรง)

### Phase 2: LINE Notification
- [ ] AI สร้าง lead → Flex card ถูกส่งไปกลุ่มตัวแทน (ไม่ผ่าน WP)
- [ ] ตัวแทนไม่มี lineGroupId → fallback ส่ง admin group + alert created
- [ ] Flex card มีปุ่มโทร (ถ้ามีเบอร์)
- [ ] Flex card มีปุ่มรับงาน (postback lead_accepted:xxx)
- [ ] LINE push fail → alert ถูกสร้างใน alerts collection
- [ ] dinoco_dealer_lookup tool ใช้ MongoDB → ผลลัพธ์ถูกต้อง
- [ ] resolveDealer() ใช้ MongoDB → return String(dealer._id)
- [ ] ตัวแทนที่ active=false ไม่ถูก match ใน lookup
- [ ] **No dual notification**: dinoco_create_lead tool ส่ง notify 1 ครั้งเท่านั้น
- [ ] **No dual notification**: auto-lead ส่ง notify 1 ครั้งเท่านั้น
- [ ] Feature flag USE_MONGODB_DEALERS=false → fallback WP API ทำงาน

### Phase 3: Detail + SLA + Migration
- [ ] หน้า detail แสดงข้อมูลถูกต้อง
- [ ] Lead history แสดง leads ทั้งหมดของตัวแทน (รวม legacy WP dealerId)
- [ ] SLA aggregation ถูกต้อง (contact rate, satisfaction rate)
- [ ] Grade calculation: A >= 90%+80%, B >= 70%+60%, C >= 50%, D < 50%
- [ ] Test notification ส่งสำเร็จ (proxy ผ่าน Agent)
- [ ] Legacy lead migration → dealerId re-mapped ถูกต้อง (dry-run ก่อน)
- [ ] Stock check cron → waiting_stock leads ที่ SKU กลับมา → notify ตัวแทน
- [ ] Stock check cron → rate limit ไม่เกิน 20 SKU/run

---

## 10. Rollback Plan

### Phase 0 (Critical Pre-requisites)
- Revert `lead-pipeline.js` + `index.js` กลับ version ก่อน
- `followUpHistory` merge เป็น `history` แล้ว — ไม่สามารถ rollback ได้ (one-way migration)
- New statuses + transitions เป็น additive → ไม่กระทบ existing leads

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
  +--> Dashboard POST /dashboard/api/dealers/import
  |      |
  |      +--> proxy to Agent POST /api/dealers/import
  |      |      |
  |      |      +--> Agent call WP MCP /distributor-list
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
    { href: "/dashboard/leads", icon: "target", label: "ติดตาม Leads" },
    { href: "/dashboard/dealers", icon: "store", label: "ตัวแทน" },        // NEW
    { href: "/dashboard/dealer-sla", icon: "chart", label: "SLA ตัวแทน" },
    { href: "/dashboard/crm", icon: "users", label: "CRM ลูกค้า" },
    { href: "/dashboard/scorecard", icon: "trophy", label: "คะแนนลูกค้า" },
    { href: "/dashboard/auto-closer", icon: "handshake", label: "ติดตามปิดการขาย" },
  ],
},
```

Note: Dashboard pages อยู่ที่ `/dashboard/*` (Nginx reverse proxy route). API fetch path ใช้ `/dashboard/api/dealers` (ไม่ใช่ `/api/dealers`).

---

## Appendix C: Feature Flag Environment Variable

```bash
# .env (Agent)
USE_MONGODB_DEALERS=true    # false = fallback to WP API (safe rollback)
```

ค่า default = `false` (backward compatible). เปิด `true` หลัง import + validate data ครบ.

---

## Appendix D: Lead Workflow (Simple 5-Step)

### Flow Overview

```
ลูกค้าถามร้าน → AI แนะนำ + "แจ้งชื่อเบอร์ แอดมินจะประสาน"
        ↓
[1] Lead Created → ส่ง Flex ไปกลุ่ม LINE ตัวแทน
        ↓
[2] 24 ชม. → ถามลูกค้า "ตัวแทนติดต่อหรือยังคะ"
        ↓
[3] ตัวแทนกด "ติดต่อแล้ว" + พิมพ์ว่าลูกค้าว่ายังไง
        ↓
[4] ถามลูกค้า "นัดคิว/สั่งของตัวแทนหรือยังคะ"
        ↓
[5] สั่งแล้ว → ปิดเคส จบ ✅
```

### Statuses (4 ตัวหลัก)

| Status | ความหมาย | ใครเปลี่ยน |
|--------|---------|-----------|
| `lead_created` | สร้างจาก AI | ระบบ |
| `dealer_notified` | ส่ง Flex ไปตัวแทนแล้ว | ระบบ |
| `dealer_contacted` | ตัวแทนกด "ติดต่อแล้ว" | ตัวแทน (Flex postback) |
| `closed_won` | ลูกค้าสั่งแล้ว ปิดเคส | ตัวแทน/Admin |

Status เพิ่มเติม (ถ้าจำเป็น):
- `closed_lost` — ลูกค้าไม่ซื้อ
- `dealer_no_response` — ตัวแทนไม่ตอบ 48 ชม.

### Step-by-Step Detail

#### Step 1: สร้าง Lead + แจ้งตัวแทน
**Trigger:** ลูกค้าส่งชื่อ+เบอร์หลังถามร้าน

**ทำอะไร:**
1. สร้าง lead ใน MongoDB (ชื่อ, เบอร์, สินค้า, จังหวัด, ร้านที่แนะนำ)
2. ส่ง LINE Flex card ไปกลุ่มตัวแทน:
   - ชื่อลูกค้า + เบอร์ + สินค้าที่สนใจ
   - ปุ่ม "โทรลูกค้า" (tel:xxx)
   - ปุ่ม "ติดต่อแล้ว" (postback → update status)
3. ตอบลูกค้า: "แอดมินจะประสานให้ร้าน XXX ติดต่อกลับเลยนะคะ"
4. อัพเดท status → `dealer_notified`

#### Step 2: 24 ชม. ถามลูกค้า
**Trigger:** Mayom cron (ทุก 30 นาที เช็ค lead ที่ status = `dealer_notified` + อายุ > 24 ชม.)

**ทำอะไร:**
1. ส่งข้อความถามลูกค้า (FB/LINE): "สวัสดีค่ะ ตัวแทนร้าน XXX ติดต่อคุณ YYY แล้วหรือยังคะ"
2. ถ้าลูกค้าตอบ "ยัง" → แจ้ง admin ผ่าน Telegram น้องกุ้ง
3. ถ้าลูกค้าตอบ "แล้ว" → อัพเดท status → `dealer_contacted`

#### Step 3: ตัวแทนรายงาน
**Trigger:** ตัวแทนกดปุ่ม "ติดต่อแล้ว" ใน Flex card (หรือ admin อัพเดทจาก Dashboard)

**ทำอะไร:**
1. อัพเดท status → `dealer_contacted`
2. ถามตัวแทน (Flex card ใหม่): "ลูกค้าว่ายังไงบ้างคะ" + ช่อง text ให้พิมพ์
3. บันทึก note จากตัวแทน (เก็บใน lead.notes)

#### Step 4: Follow-up ลูกค้า
**Trigger:** Mayom cron (lead status = `dealer_contacted` + อายุ > 3 วัน ไม่มี update)

**ทำอะไร:**
1. ส่งข้อความถามลูกค้า: "เป็นยังไงบ้างคะ นัดคิวติดตั้ง/สั่งของตัวแทนหรือยังคะ"
2. ถ้าลูกค้าตอบ "สั่งแล้ว" → อัพเดท status → `closed_won`
3. ถ้าลูกค้าตอบ "ยังไม่สั่ง" → เก็บ note รอ follow-up อีกรอบ

#### Step 5: ปิดเคส
**Trigger:** ตัวแทนกด "ปิดเคส" / admin ปิดจาก Dashboard / ลูกค้ายืนยัน

**ทำอะไร:**
1. อัพเดท status → `closed_won` หรือ `closed_lost`
2. แจ้ง admin ผ่าน Telegram: "Lead เปรม (FOX RIDER) ปิดสำเร็จ"
3. จบ — ไม่ follow-up อีก

### Notifications Summary

| เวลา | ส่งถึงใคร | ข้อความ | ช่องทาง |
|------|----------|--------|--------|
| T+0 | ตัวแทน | Flex: "Lead ใหม่ [ชื่อ] [เบอร์] [สินค้า]" | LINE Group |
| T+0 | ลูกค้า | "แอดมินจะประสานให้ร้าน XXX ติดต่อกลับ" | FB/LINE |
| T+24h | ลูกค้า | "ตัวแทนติดต่อหรือยังคะ" | FB/LINE |
| T+24h (ไม่ตอบ) | Admin | "ตัวแทน XXX ไม่ตอบ lead YYY" | Telegram |
| ตัวแทนรับ | ตัวแทน | Flex: "ลูกค้าว่ายังไงบ้าง" | LINE Group |
| T+3d | ลูกค้า | "นัดคิว/สั่งของหรือยังคะ" | FB/LINE |
| ปิดเคส | Admin | "Lead XXX ปิดสำเร็จ/ไม่สำเร็จ" | Telegram |

### Cron Jobs (Mayom)

| Job | Interval | เงื่อนไข | Action |
|-----|----------|---------|--------|
| first_check | ทุก 30 นาที | `dealer_notified` + > 24 ชม. | ถามลูกค้า |
| follow_up | ทุก 30 นาที | `dealer_contacted` + > 3 วัน | ถามลูกค้าสั่งหรือยัง |
| no_response | ทุก 30 นาที | `dealer_notified` + > 48 ชม. | แจ้ง admin |
| stock_back | ทุก 1 วัน (09:00) | lead ที่ `waiting_stock` + สต็อก SKU กลับมา | buildStockBackFlex() → sendLinePush ตัวแทน → status: dealer_notified |
| waiting_decision_followup | ทุก 30 นาที | `waiting_decision` + > 7 วัน | ถามลูกค้าอีกรอบ ถ้ายังไม่ตอบ → closed_lost |

**stock_back cron implementation:**
```javascript
// ใน runLeadCronByType("stock-back")
async function stockBackCron() {
  const db = await getDB();
  const waitingLeads = await db.collection("leads").find({
    status: "waiting_stock", waitingSKU: { $ne: null }, closedAt: null,
  }).limit(20).toArray();  // rate limit: 20 SKU/run

  for (const lead of waitingLeads) {
    // เช็คสต็อกผ่าน WP MCP (ยังต้องพึ่ง WP สำหรับ stock data)
    const result = await callDinocoAPI("/product-lookup", { query: lead.waitingSKU });
    if (result?.products?.[0]?.stock_display === "in_stock") {
      // หา dealer จาก MongoDB
      const dealer = await findDealerFlexible(lead.dealerId);
      if (dealer?.lineGroupId) {
        const flex = buildStockBackFlex({ lead, dealer, productName: result.products[0].name });
        await sendLinePush(dealer.lineGroupId, [flex]);
      }
      await updateLeadStatus(lead._id, "dealer_notified", { by: "stock_back_cron" });
    }
  }
}
```

### Use Cases เพิ่มเติม

#### UC1: ตัวแทนยังไม่ได้ติดต่อลูกค้า
```
T+24h: ถามลูกค้า "ตัวแทนติดต่อหรือยังคะ"
  ↓ ลูกค้าตอบ "ยัง"
  ↓ แจ้ง admin (Telegram): "ตัวแทน FOX RIDER ยังไม่ติดต่อลูกค้า เปรม"
  ↓ แจ้งตัวแทน (LINE Flex): "ลูกค้า เปรม แจ้งว่ายังไม่ได้รับการติดต่อ" + ปุ่ม [โทรลูกค้า]
T+48h: ถ้ายังไม่ติดต่อ → status: dealer_no_response → admin จัดการ
```

#### UC2: ลูกค้ายังไม่สั่งของ — ติดปัญหา
```
T+3d: ถามลูกค้า "เป็นยังไงบ้างคะ นัดคิว/สั่งของหรือยังคะ"
  ↓ ลูกค้าตอบ "ยังครับ กำลังคิดอยู่" / "แพงไป" / "ยังไม่พร้อม"
  ↓ เก็บ note: { reason: "ยังไม่พร้อม", note: "กำลังคิดอยู่" }
  ↓ status: waiting_decision
T+7d: follow-up อีกรอบ "มีอะไรให้ช่วยเพิ่มเติมไหมคะ"
  ↓ ถ้ายังไม่ซื้อ → status: closed_lost + เก็บเหตุผล
```

#### UC3: ตัวแทนบอกของหมด → สต็อกกลับมาแล้วแจ้ง
```
ตัวแทนรายงาน: "ลูกค้าอยากได้ XXX แต่ของหมด"
  ↓ เก็บ: { status: "waiting_stock", waitingSKU: "DNCGND37LSPROS" }
  ↓ Mayom cron ทุก 1 วัน (09:00) เช็คสต็อก (เรียก Global Inventory DB)
  ↓ พอสต็อก SKU กลับมา (stock > 0):
    → แจ้งตัวแทน (LINE Flex card):
      "สินค้า Set Side Case 37L Silver กลับมาแล้ว"
      "ลูกค้า เปรม ที่เคยสนใจ"
      ปุ่ม: [โทรลูกค้า] [รับงาน]
    → status: dealer_notified (กลับมา loop ใหม่)
```

#### UC4: ลูกค้าเปลี่ยนใจ / ยกเลิก
```
ลูกค้าบอก "ไม่เอาแล้ว" / "ขอยกเลิก"
  ↓ status: closed_lost
  ↓ note: "ลูกค้ายกเลิกเอง"
  ↓ ไม่ follow-up อีก
```

### Statuses (อัพเดท)

| Status | ความหมาย |
|--------|---------|
| `lead_created` | สร้างจาก AI |
| `dealer_notified` | ส่ง Flex ไปตัวแทนแล้ว |
| `dealer_contacted` | ตัวแทนติดต่อลูกค้าแล้ว |
| `dealer_no_response` | ตัวแทนไม่ตอบ 48 ชม. |
| `waiting_decision` | ลูกค้ากำลังคิด |
| `waiting_stock` | รอสต็อกกลับมา (เก็บ SKU) |
| `closed_won` | ลูกค้าสั่งแล้ว ปิดสำเร็จ |
| `closed_lost` | ไม่ซื้อ (เก็บเหตุผล) |

### LINE Messaging Rule

**ใช้ Flex card ทั้งหมด** — ประหยัด token + สวยงาม + มีปุ่ม action

| Message | Format | เหตุผล |
|---------|--------|-------|
| Lead ใหม่ แจ้งตัวแทน | **Flex** | มีปุ่มโทร + ปุ่มรับงาน |
| เตือนตัวแทนยังไม่ติดต่อ | **Flex** | มีปุ่มโทร + ข้อมูลลูกค้า |
| ถามลูกค้าว่ายังไง | **Flex** | มีปุ่ม "ติดต่อแล้ว" / "ยังไม่ได้" |
| ของกลับมาแจ้งตัวแทน | **Flex** | มีปุ่มโทร + SKU + ชื่อลูกค้า |
| ปิดเคสสำเร็จ | **Flex** | สรุปข้อมูล lead |
| Postback reply (กด "รับงาน") | text | ฟรี ไม่เสีย token (callback action) |

> **หลักการ: ทุกข้อความ push = Flex card เสมอ, text ใช้ได้เฉพาะ postback reply (ฟรี)**

### Lead Document (MongoDB) -- Updated V.1.1

```javascript
{
  _id: ObjectId,
  sourceId: String,           // fb_xxx / Cxxx / Uxxx
  platform: String,           // facebook / line / instagram
  customerName: String,
  phone: String,
  lineId: String | null,      // LINE userId (สำหรับ LINE push)
  productInterest: String,    // "Set Side Case 37L Silver NX500"
  province: String,           // "กรุงเทพ"
  dealerId: String,           // ★ String เสมอ: String(dealer._id) หรือ String(wp_id) legacy (6.3)
  dealerName: String,
  status: String,             // one of LEAD_STATUSES (20 statuses)
  waitingSKU: String | null,  // SKU ที่รอสต็อก (UC3, status=waiting_stock)
  notes: [                    // ประวัติ/เหตุผล
    { text: String, by: String, at: Date }
  ],
  closedReason: String | null, // เหตุผลปิด (closed_lost/closed_cancelled)

  // ★ ใช้ `history` ทุกที่ (ไม่ใช่ followUpHistory) — see 6.5
  history: [
    { status: String, from: String, to: String, at: Date, by: String, ...metadata }
  ],

  // Follow-up tracking
  nextFollowUpAt: Date | null,
  nextFollowUpType: String | null,  // first_check / contact_recheck / delivery_check / etc.
  windowExpiresAt: Date | null,     // FB/IG 24h messaging window
  otnToken: String | null,          // One-Time Notification token (FB)
  otnTokenUsed: Boolean,
  closingSoonSent: Boolean,         // ส่ง closing-soon message แล้ว

  closedAt: Date | null,
  createdAt: Date,
  updatedAt: Date,
}
```

Note: `followUpHistory` field เป็น legacy (V.1.0) — Phase 0 migration จะ merge เข้า `history` แล้ว `$unset` ออก.
