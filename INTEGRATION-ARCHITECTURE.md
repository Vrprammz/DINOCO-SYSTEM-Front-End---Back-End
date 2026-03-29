# DINOCO x OpenClaw Mini CRM — Full Integration Architecture (V.2)

> Generated: 2026-03-29 | Revised: 2026-03-29 | Revision reason: Rethink จาก business reality
> DINOCO = **ผู้ผลิต** (Manufacturer) ไม่ใช่ร้านค้าปลีก (Retailer)
> ไม่มี bank info, ไม่ขายตรง, ไม่ออก invoice ให้ลูกค้าปลีก

---

## CRITICAL BUSINESS CONTEXT

```
DINOCO เป็นผู้ผลิตอุปกรณ์เสริมมอเตอร์ไซค์ (OEM/Manufacturer)
├── ไม่ขายตรงให้ลูกค้า → ไม่มี payment gateway / bank info สำหรับ end user
├── ขายผ่านตัวแทนจำหน่ายเท่านั้น → Lead → Dealer → Sale
├── ระบบเคลม 2 แบบ:
│   ├── Manual Claim: ผ่านแชท FB/IG → ส่งรูป → admin ตรวจ → ส่งสินค้ากลับ
│   └── Auto Claim: ผ่าน [System] DINOCO Claim System (ยังไม่เปิด)
├── น้องกุ้ง (AI) ต้องทำมากกว่าตอบแชท:
│   ├── แนะนำสินค้า + หาตัวแทน
│   ├── ส่ง lead ให้ตัวแทน + ติดตามทุกขั้นตอน (Lead Follow-up)
│   ├── guide ลูกค้าผ่านขั้นตอนเคลม (Manual Claim Flow)
│   └── วัด SLA ตัวแทน + satisfaction ลูกค้า
└── Flow ที่ขาดหายในแผนเดิม: Lead Follow-up Pipeline
```

---

## Part 1: DINOCO Feature Map (ทุก Module ที่มีอยู่)

### 1.1 B2C Member System (ลูกค้าสมาชิก)

| # | Module | File(s) | หน้าที่ | OpenClaw มี? |
|---|--------|---------|---------|-------------|
| 1 | LINE Login (OAuth2) | `[System] DINOCO Gateway`, `[System] LINE Callback` | สมัครสมาชิก/ล็อกอินผ่าน LINE | ไม่มี (Google OAuth only) |
| 2 | Member Dashboard | `[System] Member Dashboard Main`, `[System] Dashboard - Header & Forms`, `[System] Dashboard - Assets List` | แดชบอร์ดสมาชิก: member card, QR scan, ลงทะเบียน, ดูสินค้า | ไม่มี |
| 3 | Warranty Registration | `[System] Dashboard - Header & Forms` | ลงทะเบียนประกันสินค้าผ่าน QR/Serial | ไม่มี |
| 4 | Warranty Claim | `[System] DINOCO Claim System` | แจ้งเคลมสินค้า อัพโหลดรูป สร้าง PDF (**ยังไม่เปิดใช้**) | ไม่มี |
| 5 | Transfer Warranty | `[System] Transfer Warranty Page` | โอนสิทธิ์ประกันให้คนอื่น | ไม่มี |
| 6 | Edit Profile | `[System] DINOCO Edit Profile` | แก้ไขโปรไฟล์ cover/avatar, Mileage Rank System 6 tier | ไม่มี |
| 7 | Legacy Migration | `[System] Legacy Migration Logic` | ย้ายข้อมูลจากระบบเก่า | ไม่มี |
| 8 | Global App Menu | `[System] DINOCO Global App Menu` | Bottom nav: QR scanner, toast/confirm system, design tokens | ไม่มี |
| 9 | PDPA Consent | `[System] Dashboard - Header & Forms` | จัดเก็บ consent analytics/marketing | มีบางส่วน (PII Masking) |
| 10 | MCP Bridge | `[System] DINOCO MCP Bridge` | REST API สำหรับ OpenClaw ดึงข้อมูล (product/dealer/warranty/KB) | **ใช่ — สร้างไว้เชื่อมแล้ว** |

### 1.2 B2B Distributor System (ตัวแทนจำหน่าย)

| # | Module | File(s) | หน้าที่ | OpenClaw มี? |
|---|--------|---------|---------|-------------|
| 11 | Core Utilities & LINE Flex | `[B2B] Snippet 1` | LINE API, Flex Builders, Utility functions | ไม่มี (LINE ใช้ต่างวิธี) |
| 12 | LINE Webhook Gateway | `[B2B] Snippet 2` | รับ webhook LINE: สั่งของ, สลิป, bot toggle | ไม่มี (LINE webhook แยก) |
| 13 | LIFF E-Catalog REST API | `[B2B] Snippet 3` | 36+ endpoints สำหรับ LIFF apps | ไม่มี |
| 14 | LIFF E-Catalog Frontend | `[B2B] Snippet 4` | หน้าสั่งสินค้า LIFF | ไม่มี |
| 15 | B2B Admin Dashboard | `[B2B] Snippet 5` | จัดการออเดอร์ B2B | ไม่มี |
| 16 | Discount Mapping | `[B2B] Snippet 6` | ตั้งราคาตาม Rank | ไม่มี |
| 17 | Cron Jobs (13 ตัว) | `[B2B] Snippet 7` | Dunning, summary, rank, delivery check, retry | ไม่มี |
| 18 | Distributor Ticket View | `[B2B] Snippet 8` | หน้ารายละเอียดออเดอร์ LIFF | ไม่มี |
| 19 | Admin Control Panel | `[B2B] Snippet 9` | CRUD ตัวแทน/สินค้า, bot toggle, settings | ไม่มี |
| 20 | Invoice Image Generator | `[B2B] Snippet 10` | สร้างรูปใบแจ้งหนี้ GD | ไม่มี |
| 21 | Customer LIFF Pages | `[B2B] Snippet 11` | Orders, account, commands LIFF | ไม่มี |
| 22 | Admin LIFF | `[B2B] Snippet 12` | Stock manager, tracking LIFF | ไม่มี |
| 23 | Debt Transaction Manager | `[B2B] Snippet 13` | Atomic debt mutations (FOR UPDATE lock) | ไม่มี |
| 24 | Order State Machine | `[B2B] Snippet 14` | FSM validates transitions + actor permissions | ไม่มี |
| 25 | Custom Tables & JWT | `[B2B] Snippet 15` | Moto DB, HMAC JWT session, custom tables | ไม่มี |

### 1.3 Admin System (แอดมิน)

| # | Module | File(s) | หน้าที่ | OpenClaw มี? |
|---|--------|---------|---------|-------------|
| 26 | Admin Dashboard (Command Center) | `[Admin System] DINOCO Admin Dashboard` | KPIs, pipeline, AI inbox, alerts | มี analytics แต่คนละแบบ |
| 27 | AI Control Module (Gemini v22) | `[Admin System] AI Control Module` | AI chatbot + function calling (product/dealer/KB lookup) | มี AI (OpenRouter free models) |
| 28 | Finance Dashboard | `[Admin System] DINOCO Admin Finance Dashboard` | KPI 10 กล่อง, Debt Aging, SVG Map 77 จว., AI วิเคราะห์ (Claude) | ไม่มีระดับนี้ |
| 29 | Brand Voice Pool | `[Admin System] DINOCO Brand Voice Pool` | เก็บเสียงลูกค้า 6 แบรนด์, AI Collect, sentiment | ไม่มี (แต่มี AI chat analysis) |
| 30 | Global Inventory | `[Admin System] DINOCO Global Inventory Database` | Product catalog + SKU management | มี Catalog สินค้าใน OpenClaw |
| 31 | Manual Invoice System | `[Admin System] DINOCO Manual Invoice System` | ออกบิล, รับเงิน, dunning, distributor detail | มี "เงินเข้า" |
| 32 | Service Center & Claims | `[Admin System] DINOCO Service Center & Claims` | จัดการเคลมทั้งหมด | ไม่มี |
| 33 | User Management/CRM | `[Admin System] DINOCO User Management` | User CRM + analytics | มี CRM + Pipeline |
| 34 | KB Trainer Bot | `[Admin System] KB Trainer Bot v2.0` | สร้าง Q&A สำหรับ AI | มี Knowledge Base + RAG |
| 35 | Legacy Migration Admin | `[Admin System] DINOCO Legacy Migration Requests` | จัดการคำร้องย้ายระบบ | ไม่มี |
| 36 | Manual Transfer | `[Admin System] DINOCO Manual Transfer Tool` | Admin force transfer warranty | ไม่มี |
| 37 | Moto Manager | `[Admin System] DINOCO Moto Manager` | CRUD brands/models/images/aliases | ไม่มี |
| 38 | AI Provider Abstraction | `[Admin System] AI Provider Abstraction` | Swap Claude/Gemini/OpenAI | มี (OpenRouter multi-provider) |
| 39 | GitHub Webhook Sync | `[AdminSystem-System] GitHub Webhook Sync` | Auto-deploy code from GitHub | ไม่มี (Docker-based) |

### 1.4 Infrastructure

| # | Module | หน้าที่ | OpenClaw มี? |
|---|--------|---------|-------------|
| 40 | RPi Print Server | Invoice/label/picking list printing | ไม่มี |
| 41 | Flash Express Integration | Shipping API | ไม่มี |
| 42 | Slip2Go Integration | Bank slip verification OCR | ไม่มี (มี slip ตรวจแต่คนละระบบ) |

---

## Part 2: OpenClaw Feature Map (ทุก Feature)

| # | Feature | หน้าที่ | DINOCO มี? | Decision |
|---|---------|---------|-----------|----------|
| A1 | **Multi-Platform Chat (LINE+FB+IG)** | รวม 3 แพลตฟอร์มจอเดียว เปิด 4 แชทพร้อม | LINE มี (B2B webhook) / **FB+IG ไม่มี** | **NEW — OpenClaw adds** FB/IG channel |
| A2 | **AI วิเคราะห์แชทอัตโนมัติ** | ความพอใจ / โอกาสซื้อ / tags / pipeline | ไม่มี (DINOCO AI เป็น chatbot ไม่ใช่ analytics) | **NEW — OpenClaw adds** |
| A3 | **AI แนะนำคำตอบ (ปุ่ม AI)** | แนะนำคำตอบ + ตอบอัตโนมัติ 5 นาที | ไม่มี | **NEW — OpenClaw adds** |
| A4 | **4 โหมด Bot** | ปิด / อัตโนมัติ / เรียกชื่อ / Keyword | DINOCO มี bot toggle B2B (เปิด/ปิด) | **NEW — OpenClaw adds** (ละเอียดกว่า) |
| A5 | **Knowledge Base + RAG** | Vector search ด้วย Qdrant + Gemini Embedding | DINOCO มี KB Trainer (flat Q&A) | **BOTH (INTEGRATED)** — sync KB |
| A6 | **CRM + Pipeline** | ลูกค้า auto-create + pipeline 5 stage + Lead Scoring | DINOCO มี User Management แต่ไม่มี pipeline/scoring | **BOTH (INTEGRATED)** — OpenClaw CRM for FB/IG, sync with WP users |
| A7 | **น้องกุ้ง 14 ตัว (AI Agents)** | 13 agents + CEO ทำงาน 24/7 | ไม่มี | **NEW — OpenClaw adds** |
| A8 | **ห้องน้องกุ้ง 3D** | Three.js virtual office | ไม่มี | **NEW — OpenClaw adds** (nice-to-have) |
| A9 | **PDPA + PII Masking** | Prompt Injection Protection, Audit Log | DINOCO มี PDPA consent + nonce/rate limit | **BOTH** — ต่างคนต่างทำแต่ไม่ซ้ำ |
| A10 | **Churn Prediction** | เตือนลูกค้าเสี่ยงหาย 3/7/30 วัน | ไม่มี | **NEW — OpenClaw adds** |
| A11 | **Broadcast** | ส่งข้อความหลายคน แยก segment | ไม่มี (DINOCO ส่ง LINE push แต่ไม่มี broadcast UI) | **NEW — OpenClaw adds** |
| A12 | **Catalog สินค้า** | ราคา สต็อก รูปภาพ หมวดหมู่ | DINOCO มี Global Inventory + B2B Catalog ครบ | **SKIP — DINOCO handles** (sync ผ่าน MCP) |
| A13 | **เงินเข้า (Slip Detection)** | ตรวจสลิป ยืนยัน/ปฏิเสธ | DINOCO มี Slip2Go + Manual Invoice ครบ | **SKIP — DINOCO handles** |
| A14 | **เอกสาร (Document AI)** | AI จำแนกเอกสาร/ภาพ | ไม่มี | **REPURPOSE → Claim Photo Analysis** |
| A15 | **นัดหมาย** | ปฏิทิน 7 ประเภท 6 สถานะ | ไม่มี | **NEW — OpenClaw adds** |
| A16 | **Analytics Dashboard** | 6 tabs กราฟ Recharts | DINOCO มี Admin Dashboard + Finance Dashboard | **BOTH** — OpenClaw analytics สำหรับ FB/IG, DINOCO สำหรับ warranty/B2B |
| A17 | **Revenue Dashboard** | ยอดขาย/เดือน กราฟเทรนด์ | DINOCO มี Finance Dashboard ดีกว่ามาก | **SKIP — DINOCO handles** |
| A18 | **Telegram Bot** | ถาม AI ได้ตลอด | ไม่มี | **NEW — OpenClaw adds** (optional) |
| A19 | **A/B Testing AI** | ทดสอบสไตล์ AI | ไม่มี | **NEW — OpenClaw adds** |
| A20 | **Smart Routing** | แยก topic อัตโนมัติ (sales/shipping/support) | ไม่มี | **NEW — OpenClaw adds** |
| A21 | **Auto-Discover Free AI Models** | ค้นหา model ฟรีจาก OpenRouter ทุก 1 ชม. | DINOCO ใช้ Claude/Gemini (เสียเงิน) | **NEW — OpenClaw adds** (ลดต้นทุน) |
| A22 | **AI Cost Tracking** | ค่า AI เป็นบาท + score board | ไม่มี | **NEW — OpenClaw adds** |
| A23 | **Multi-Tenant (Teams)** | แยก team/role/member | DINOCO ใช้ WP user roles | OpenClaw manages its own auth |
| A24 | **Customer Memory** | AI จำลูกค้ารายคน | DINOCO AI มี conversation history (12 msg cap) | **NEW — OpenClaw adds** (persistent memory) |
| A25 | **Lead Scoring** | คะแนน 0-100, Hot/Warm/Cold | ไม่มี | **NEW — OpenClaw adds** |
| A26 | **Human Handoff** | ลูกค้าบอก "ขอคุยกับพนักงาน" AI หยุด | ไม่มี (DINOCO AI มี escalate_to_admin function แต่เป็นคนละช่องทาง) | **NEW — OpenClaw adds** |
| A27 | **รวมลูกค้าข้ามแพลตฟอร์ม** | Merge LINE/FB/IG profiles | ไม่มี | **NEW — OpenClaw adds** |
| A28 | **Landing Page + Visitor Counter** | Fingerprint dedup + flag counter | ไม่มี | Optional |

---

## Part 3: Integration Architecture

### 3.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          ช่องทางลูกค้า                              │
│                                                                      │
│  Facebook Page        Instagram DM        LINE OA                    │
│      │                    │                   │                      │
│      ▼                    ▼                   ▼                      │
│  Meta Graph API      Meta Graph API     LINE Messaging API           │
│      │                    │                   │                      │
│      └────────┬───────────┘                   │                      │
│               │                               │                      │
│               ▼                               ▼                      │
│    ┌──────────────────────┐      ┌──────────────────────────┐       │
│    │   OpenClaw Agent     │      │   DINOCO WordPress       │       │
│    │   (Docker: port 3000)│      │   (LINE Webhook)         │       │
│    │                      │      │                          │       │
│    │  ● FB/IG webhook     │      │  ● B2B LINE Bot          │       │
│    │  ● AI Auto-reply     │      │  ● LIFF Catalog          │       │
│    │  ● Chat analytics    │      │  ● Slip Payment          │       │
│    │  ● Lead scoring      │      │  ● Order Management      │       │
│    │  ● Customer memory   │      │  ● Warranty System       │       │
│    │  ● Human handoff     │      │  ● Claims               │       │
│    │  ● LEAD FOLLOW-UP    │      │  ● Manual Claim Flow     │       │
│    │  ● MANUAL CLAIM CHAT │      │                          │       │
│    └──────────┬───────────┘      └──────────┬───────────────┘       │
│               │                              │                       │
│               │     MCP Bridge REST API      │                       │
│               │  ◄──────────────────────────►│                       │
│               │   /dinoco-mcp/v1/*           │                       │
│               │                              │                       │
│    ┌──────────▼───────────┐      ┌──────────▼───────────────┐       │
│    │   MongoDB            │      │   MySQL (WordPress)       │       │
│    │   ● messages         │      │   ● serial_number CPT     │       │
│    │   ● customers        │      │   ● claim_ticket CPT      │       │
│    │   ● analytics        │      │   ● distributor CPT       │       │
│    │   ● leads (NEW)      │      │   ● b2b_order CPT         │       │
│    │   ● claims (NEW)     │      │   ● product_catalog       │       │
│    │   ● follow_ups (NEW) │      │   ● ai_knowledge CPT      │       │
│    └──────────────────────┘      └──────────────────────────┘       │
│                                                                      │
│    ┌──────────────────────┐      ┌──────────────────────────┐       │
│    │   OpenClaw Dashboard │      │   DINOCO Admin Dashboard  │       │
│    │   (Next.js: port 3001)│     │   (WordPress Shortcode)   │       │
│    │                      │      │                          │       │
│    │  ● Chat UI (FB/IG)  │      │  ● B2B Orders            │       │
│    │  ● CRM Pipeline     │      │  ● Finance Dashboard     │       │
│    │  ● Lead Follow-up   │      │  ● Warranty Claims       │       │
│    │  ● Manual Claim UI  │      │  ● Inventory             │       │
│    │  ● น้องกุ้ง Room    │      │  ● Brand Voice           │       │
│    │  ● Dealer SLA View  │      │  ● Service Center        │       │
│    └──────────────────────┘      └──────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Primary Use Case: FB/IG Chat → แนะนำสินค้า → ประสานตัวแทน → FOLLOW-UP

```
Step-by-step Flow:

1. ลูกค้าทัก Facebook Page / Instagram DM
   ├── ระบบ: OpenClaw Agent (webhook receiver)
   ├── เก็บ: MongoDB (messages collection)
   └── action: สร้าง/อัพเดท customer profile อัตโนมัติ

2. AI วิเคราะห์ข้อความทันที
   ├── ระบบ: OpenClaw (AI auto-analysis)
   ├── วิเคราะห์: sentiment, intent, purchase probability
   ├── แท็ก: topic (sales/support/claim)
   └── route: Smart Routing → sales queue / claim queue

3. AI ร่างคำตอบแนะนำสินค้า
   ├── ระบบ: OpenClaw Agent → MCP Bridge → WordPress
   ├── เรียก: POST /dinoco-mcp/v1/product-lookup
   │   └── ส่ง: { query: "กันล้ม NX500" }
   │   └── รับ: { products: [{ name, price, sku, img_url, warranty_years }] }
   ├── เรียก: POST /dinoco-mcp/v1/kb-search
   │   └── ส่ง: { query: "สินค้ารุ่น NX500" }
   │   └── รับ: { entries: [{ question, answer }] }
   ├── AI สร้างคำตอบ: ชื่อสินค้า + ราคา + รูป + ข้อมูลประกัน
   └── แสดง: ปุ่ม AI ในแชท → Admin กดส่ง / แก้ไขก่อนส่ง

4. ลูกค้าสนใจ → ค้นหาตัวแทนใกล้บ้าน
   ├── ระบบ: OpenClaw Agent → MCP Bridge → WordPress
   ├── เรียก: POST /dinoco-mcp/v1/dealer-lookup
   │   └── ส่ง: { location: "เชียงใหม่" }
   │   └── รับ: { dealers: "ร้าน XXX โทร 0XX-XXX-XXXX ที่อยู่..." }
   ├── AI สร้างข้อความ: "ตัวแทนใกล้คุณ: [ร้าน] [เบอร์] [Google Maps]"
   └── action: ส่งข้อมูลตัวแทนให้ลูกค้าใน FB/IG

5. ★ NEW: Lead Follow-up Pipeline เริ่มทำงาน (ดู Part 7 รายละเอียด)
   ├── [Day 0] น้องกุ้งแจ้งตัวแทน (LINE push): "มีลูกค้าสนใจ XXX"
   ├── [Day 0+4hr] น้องกุ้งถามตัวแทน + ลูกค้า
   ├── ติดตามจนซื้อ/ติดตั้ง/พอใจ
   └── วัด SLA ตัวแทนทุกขั้นตอน

6. ถ้าเป็น CLAIM → เข้า Manual Claim Flow (ดู Part 8 รายละเอียด)
   ├── น้องกุ้งขอรูปสินค้า → Vision AI วิเคราะห์
   ├── Admin ตรวจ → เลือก Case A/B
   └── ติดตามจนเคลมเสร็จ
```

### 3.3 Data Flow Between Systems

```
┌───────────────────────────────────────────────────────────────┐
│                    MCP Bridge (สร้างไว้แล้ว)                   │
│                                                                │
│  WordPress → OpenClaw (READ ONLY):                            │
│  ─────────────────────────────────                            │
│  /product-lookup  → สินค้า + ราคา + รูป + stock              │
│  /dealer-lookup   → ตัวแทนจำหน่าย + ที่อยู่ + เบอร์           │
│  /warranty-check  → สถานะประกัน serial number                 │
│  /kb-search       → Knowledge Base entries (Q&A)              │
│  /kb-export       → Export KB ทั้งหมด → Qdrant sync          │
│  /catalog-full    → Export catalog ทั้งหมด                     │
│                                                                │
│  ต้องสร้างเพิ่ม:                                               │
│  ─────────────                                                 │
│  /distributor-list    → รายชื่อตัวแทนทั้งหมด + จังหวัด        │
│  /distributor-notify  → ส่ง LINE push ให้ตัวแทน (lead referral)│
│  /customer-link       → ผูก FB/IG user กับ WP member          │
│  /brand-voice-submit  → ส่ง voice entry จาก FB/IG comment     │
│  /lead-create         → สร้าง lead record ใน WP               │
│  /lead-update         → อัพเดทสถานะ lead                       │
│  /claim-manual-create → สร้าง manual claim ผ่านแชท             │
│  /claim-manual-update → อัพเดทสถานะ claim                      │
│  /dealer-sla-report   → รายงาน SLA ตัวแทน                     │
│                                                                │
│  OpenClaw → WordPress (WRITE):                                │
│  ─────────────────────────────                                │
│  (ผ่าน API endpoints ใหม่)                                    │
│  /lead-referral   → สร้าง lead record ใน WP                   │
│  /chat-summary    → บันทึกสรุปแชทจาก FB/IG เข้า brand_voice  │
│                                                                │
│  ★ REMOVED (ไม่จำเป็นสำหรับผู้ผลิต):                          │
│  ─────────────────────────────────────                         │
│  /invoice-image   → ❌ ตัวแทนมี LINE Flex invoice อยู่แล้ว    │
│  /bank-info       → ❌ DINOCO ไม่ขายตรง ลูกค้าซื้อกับตัวแทน  │
└───────────────────────────────────────────────────────────────┘
```

### 3.4 LINE Channel Integration Decision

```
LINE OA ของ DINOCO มีอยู่แล้ว → ใช้ทั้ง 2 ระบบ:

ตัวเลือก A (แนะนำ): DINOCO WordPress ยังคุม LINE 100%
  ├── B2B orders/slip/bot ยังใช้ WordPress webhook เดิม
  ├── OpenClaw อ่าน LINE analytics จาก MongoDB (ถ้า forward)
  └── เหตุผล: ระบบ B2B ซับซ้อนมาก (debt, FSM, Flash) ย้ายไม่คุ้ม

ตัวเลือก B: OpenClaw รับ LINE webhook แทน → forward ไป WordPress
  ├── ข้อดี: รวมทุก platform ในจอเดียว
  ├── ข้อเสีย: เพิ่ม latency, ต้อง proxy ทุก postback
  └── ไม่แนะนำ ในเฟสแรก

สรุป: ใช้ตัวเลือก A — FB/IG = OpenClaw, LINE = WordPress
```

---

## Part 4: Feature Decision Matrix

### 4.1 Warranty & Product System

| Feature | DINOCO | OpenClaw | Decision | เหตุผล |
|---------|--------|----------|----------|--------|
| Warranty Registration (QR/Serial) | ✅ ครบ | ❌ | **DINOCO ONLY** | Core business logic, WP CPT |
| Warranty Claim Auto (System) | ✅ ครบ (ยังไม่เปิด) | ❌ | **DINOCO ONLY** | เปิดใช้ในอนาคต |
| **Manual Claim via Chat** | ❌ | ❌ | **★ NEW BUILD** | น้องกุ้ง guide ผ่าน FB/IG → admin ตรวจ → ดำเนินการ |
| Warranty Transfer | ✅ ครบ | ❌ | **DINOCO ONLY** | Consent logging, bundle support |
| Warranty Status Check | ✅ ครบ | ❌ (ดึงผ่าน MCP) | **DINOCO ONLY** + MCP read | AI ใน OpenClaw เรียก /warranty-check |
| Product Catalog CRUD | ✅ ครบ (Inventory) | ✅ Basic | **DINOCO ONLY** | Source of truth, multi-tier pricing |
| Product Lookup | ✅ ครบ | ✅ (MCP) | **BOTH (INTEGRATED)** | OpenClaw อ่านผ่าน MCP Bridge |
| Moto Brand/Model DB | ✅ ครบ | ❌ | **DINOCO ONLY** | Custom tables + aliases |

### 4.2 B2B Distributor System

| Feature | DINOCO | OpenClaw | Decision | เหตุผล |
|---------|--------|----------|----------|--------|
| B2B Order Flow (LINE) | ✅ ครบ | ❌ | **DINOCO ONLY** | 14-state FSM, atomic debt |
| LIFF E-Catalog | ✅ ครบ | ❌ | **DINOCO ONLY** | Rank-based pricing |
| Slip Payment (Slip2Go) | ✅ ครบ | ✅ Basic | **DINOCO ONLY** | FIFO matching, dedup, auto-mark |
| Flash Express Shipping | ✅ ครบ | ❌ | **DINOCO ONLY** | Multi-box, courier retry |
| Invoice System | ✅ ครบ | ❌ | **DINOCO ONLY** | GD image gen, print server (B2B only) |
| Debt Management | ✅ ครบ (atomic) | ❌ | **DINOCO ONLY** | FOR UPDATE lock, audit log |
| Distributor Rank (5 tier) | ✅ ครบ | ❌ | **DINOCO ONLY** | Cron-based monthly |
| Dunning / Credit Hold | ✅ ครบ | ❌ | **DINOCO ONLY** | Cron-based daily |
| RPi Print Server | ✅ ครบ | ❌ | **DINOCO ONLY** | Hardware integration |
| Distributor Lookup (for chat) | ✅ ครบ | ❌ (MCP) | **BOTH (INTEGRATED)** | OpenClaw อ่านผ่าน MCP Bridge |
| **Dealer SLA Tracking** | ❌ | ❌ | **★ NEW BUILD** | วัดความเร็วตัวแทนติดต่อลูกค้า |

### 4.3 Chat & Communication

| Feature | DINOCO | OpenClaw | Decision | เหตุผล |
|---------|--------|----------|----------|--------|
| **Facebook Page Chat** | ❌ | ✅ | **OPENCLAW ONLY** | Primary goal |
| **Instagram DM Chat** | ❌ | ✅ | **OPENCLAW ONLY** | Primary goal |
| LINE B2B Chat (Bot) | ✅ ครบ | ✅ | **DINOCO ONLY** | B2B flow ซับซ้อน |
| LINE B2C (Login only) | ✅ ครบ | ✅ | **DINOCO ONLY** | OAuth2 flow |
| Multi-Platform View | ❌ | ✅ | **OPENCLAW ONLY** | FB+IG ในจอเดียว |
| AI Auto-Reply (FB/IG) | ❌ | ✅ | **OPENCLAW ONLY** | 5-minute auto, 4 bot modes |
| AI Suggested Reply | ❌ | ✅ | **OPENCLAW ONLY** | ปุ่ม AI แนะนำคำตอบ |
| Human Handoff | ❌ | ✅ | **OPENCLAW ONLY** | AI หยุดเมื่อลูกค้าขอคุยคน |
| Smart Routing | ❌ | ✅ | **OPENCLAW ONLY** | sales/support/claim |
| Broadcast (FB/IG) | ❌ | ✅ | **OPENCLAW ONLY** | Marketing campaigns |

### 4.4 CRM & Customer Intelligence

| Feature | DINOCO | OpenClaw | Decision | เหตุผล |
|---------|--------|----------|----------|--------|
| User Management | ✅ Basic | ✅ Advanced | **BOTH (INTEGRATED)** | WP users = members, OpenClaw = FB/IG contacts |
| **CRM Pipeline** | ❌ | ✅ | **OPENCLAW + CUSTOM** | ★ Custom pipeline: Lead → Contacted → Waiting → Delivered → Installed → Satisfied/Claim |
| **Lead Scoring (0-100)** | ❌ | ✅ | **OPENCLAW ONLY** | Hot/Warm/Cold |
| **Lead Follow-up Pipeline** | ❌ | ❌ | **★ NEW BUILD** | น้องกุ้งติดตามทุกขั้นตอน + วัด SLA |
| **Customer Memory (persistent)** | ❌ (12 msg cap) | ✅ | **OPENCLAW ONLY** | AI จำลูกค้ารายคน |
| **Churn Prediction** | ❌ | ✅ | **OPENCLAW ONLY** | 3/7/30 วัน re-engage |
| **Cross-Platform Merge** | ❌ | ✅ | **OPENCLAW ONLY** | Merge LINE/FB/IG profiles |
| Member Rank (Mileage) | ✅ ครบ | ❌ | **DINOCO ONLY** | 6-tier loyalty system |
| PDPA Consent | ✅ ครบ | ✅ | **BOTH** | DINOCO = WP consent, OpenClaw = PII masking |
| Appointment/Calendar | ❌ | ✅ | **OPENCLAW ONLY** | นัดหมาย |

### 4.5 AI & Analytics

| Feature | DINOCO | OpenClaw | Decision | เหตุผล |
|---------|--------|----------|----------|--------|
| AI Chatbot (product/dealer) | ✅ Gemini v22 | ✅ OpenRouter free | **BOTH** | DINOCO = LINE chatbot, OpenClaw = FB/IG chat AI |
| AI Chat Analysis | ❌ | ✅ | **OPENCLAW ONLY** | sentiment/intent/purchase probability |
| **AI Claim Photo Analysis** | ❌ | ❌ | **★ NEW BUILD** | Vision AI วิเคราะห์รูปสินค้ามีปัญหา |
| AI Finance Analysis | ✅ Claude | ❌ | **DINOCO ONLY** | Debt/revenue/strategy |
| Brand Voice / Sentiment | ✅ ครบ | ✅ (chat analysis) | **BOTH (INTEGRATED)** | OpenClaw ส่ง FB/IG comments → WP brand_voice |
| Knowledge Base | ✅ KB Trainer (flat) | ✅ RAG + Qdrant | **BOTH (INTEGRATED)** | WP = source of truth, sync → Qdrant |
| น้องกุ้ง 14 AI Agents | ❌ | ✅ | **OPENCLAW + 1 NEW** | +1 น้องกุ้งมะยม (Lead Follow-up Agent) |
| AI Cost Tracking | ❌ | ✅ | **OPENCLAW ONLY** | Track ค่าใช้จ่าย AI |
| Admin Dashboard KPIs | ✅ ครบ | ✅ Analytics | **BOTH** | คนละ domain |
| Finance Dashboard | ✅ ครบ (SVG Map, AI) | ❌ | **DINOCO ONLY** | Deep B2B analytics |

---

## Part 5: What to ADD / REMOVE / MODIFY

### 5.1 OpenClaw Features to ENABLE as-is

| Feature | Priority | เหตุผล |
|---------|----------|--------|
| Facebook Page webhook + chat UI | **P0 CRITICAL** | เป้าหมายหลัก |
| Instagram DM webhook + chat UI | **P0 CRITICAL** | เป้าหมายหลัก |
| Multi-Panel Chat (4 จอพร้อมกัน) | **P0** | UX หลักในการตอบแชท |
| AI Auto-Reply (5 min fallback) | **P1 HIGH** | ลดภาระ admin |
| AI Suggested Reply (ปุ่ม AI) | **P1** | ช่วย admin ตอบเร็ว |
| Smart Routing (sales/support/claim) | **P1** | แยก topic + เข้า claim flow อัตโนมัติ |
| Human Handoff | **P1** | AI หยุดเมื่อลูกค้าขอคน |
| Lead Scoring (0-100) | **P1** | Hot/Warm/Cold leads |
| Customer Memory | **P1** | AI จำลูกค้ารายคน |
| Churn Prediction (3/7/30 วัน) | **P2 MEDIUM** | Follow-up alerts |
| น้องกุ้ง 14 AI Agents | **P2** | 24/7 autonomous analysis |
| AI Cost Tracking | **P2** | Monitor costs |
| Appointment Calendar | **P3 LOW** | นัดหมาย |
| Broadcast (FB/IG) | **P3** | Marketing campaigns |
| ห้องน้องกุ้ง 3D | **P3** | Fun visualization |
| A/B Testing AI | **P3** | Optimization |
| Telegram Bot | **P3** | Admin quick access |

### 5.2 OpenClaw Features to CUSTOMIZE for DINOCO

| Feature | ต้องแก้อะไร | Priority |
|---------|------------|----------|
| **Knowledge Base** | Sync จาก WP `ai_knowledge` CPT → Qdrant ผ่าน `/kb-export` | **P0** |
| **AI Reply Prompt** | เพิ่ม DINOCO brand context: ผู้ผลิตอุปกรณ์เสริมมอเตอร์ไซค์, ไม่ขายตรง, แนะนำตัวแทน | **P0** |
| **Product Lookup (MCP)** | Configure Agent ให้เรียก `/product-lookup` ผ่าน MCP Bridge | **P0** |
| **Dealer Lookup (MCP)** | Configure Agent ให้เรียก `/dealer-lookup` เพื่อแนะนำตัวแทน | **P0** |
| **CRM Pipeline stages** | เปลี่ยนเป็น: ทักมา → สนใจ → ส่งต่อตัวแทน → ตัวแทนติดต่อ → รอของ → ได้รับของ → ติดตั้ง → พอใจ/เคลม | **P0** |
| **Smart Routing** | เพิ่ม route "claim" — ลูกค้าพูดถึงปัญหาสินค้า → เข้า Manual Claim Flow | **P1** |
| **น้องกุ้งทองคำ (Sales Agent)** | Customize: ห้ามบอกราคาแบบ retailer, แนะนำตัวแทนเสมอ | **P1** |
| **น้องกุ้งแก้ว (Support Agent)** | เพิ่ม claim photo request + guide ผ่าน Manual Claim Flow | **P1** |
| **Document AI → Claim Photo AI** | Repurpose: วิเคราะห์รูปสินค้ามีปัญหา (สติ๊กเกอร์ลอก, มุมแตก, กุญแจหาย) | **P1** |
| **Bot Modes** | เพิ่ม mode "Dealer Connect" — AI ตอบ + auto-suggest ตัวแทน | **P2** |

### 5.3 DINOCO Features to KEEP as-is (ไม่แตะ)

| Feature | เหตุผล |
|---------|--------|
| ทั้งหมด B2B System (Snippet 1-15) | ซับซ้อนมาก, atomic debt, FSM, Flash, RPi |
| LINE Login + Member Dashboard | Core B2C flow |
| Warranty Registration/Claim/Transfer | Core business, WP CPT |
| Finance Dashboard | Claude AI analysis, SVG Map 77 จว. |
| Admin Dashboard (Command Center) | KPIs, pipeline |
| Manual Invoice System | B2B billing, debt management |
| Service Center & Claims | Admin claim management |
| Global Inventory Database | Source of truth for products |
| Moto Manager + Custom Tables | Brand/model/alias management |
| GitHub Webhook Sync | Deployment infrastructure |
| RPi Print Server | Hardware-specific |
| Cron Jobs (13 ตัว) | B2B automation |
| AI Provider Abstraction | DINOCO AI infrastructure |
| PDPA Consent System | Legal compliance |
| MCP Bridge | **สร้างไว้แล้ว** — keep + extend |

### 5.4 DINOCO Features to DISABLE

**ไม่มีอะไรต้อง disable** — ทุก module ของ DINOCO ยังจำเป็น

### 5.5 NEW Features to BUILD (ไม่มีในทั้ง 2 ระบบ)

| Feature | Description | ต้องสร้างใน | Priority |
|---------|-------------|------------|----------|
| **★ Lead Follow-up Pipeline** | น้องกุ้งติดตามลูกค้า+ตัวแทนทุกขั้นตอน + วัด SLA | OpenClaw (Agent + Cron + MongoDB) + MCP Bridge | **P0 CRITICAL** |
| **★ Manual Claim via Chat** | เคลมผ่าน FB/IG: ส่งรูป → admin ตรวจ → ดำเนินการ | OpenClaw (Agent + MongoDB) + MCP Bridge | **P1 HIGH** |
| **★ Claim Photo Analysis (Vision AI)** | AI วิเคราะห์รูปสินค้ามีปัญหาเบื้องต้น | OpenClaw Agent (repurpose Document AI) | **P1** |
| **★ Dealer SLA Dashboard** | วัดความเร็ว/คุณภาพตัวแทน จาก Lead Follow-up data | OpenClaw Dashboard | **P1** |
| **Dealer Referral Notification** | LINE push แจ้งตัวแทนเมื่อมี lead | MCP Bridge (WP endpoint ใหม่) | **P0** |
| **FB/IG → Brand Voice Pipeline** | Comment/DM → auto-create brand_voice entry ใน WP | OpenClaw Agent + MCP Bridge | **P1** |
| **Customer Cross-Link** | ผูก FB/IG customer (MongoDB) กับ WP member (user_meta) | MCP Bridge (endpoint ใหม่) | **P2** |
| **Warranty Check via Chat** | ลูกค้าพิมพ์ serial → AI ตอบสถานะ | OpenClaw Agent (MCP tool) | **P1** |
| **Product Recommendation Engine** | ลูกค้าบอกรุ่นรถ → แนะนำสินค้าที่เข้ากัน | OpenClaw Agent + MCP product-lookup | **P2** |
| **Product Demand Signal** | ลูกค้าถามสินค้าที่ไม่มี → log demand | OpenClaw Agent | **P2** |

---

## Part 6: Endpoint Review — ทุก Endpoint (KEEP / REMOVE / MODIFY / ADD)

### 6.1 EXISTING MCP Bridge Endpoints (6 ตัว — สร้างไว้แล้ว)

| # | Endpoint | Verdict | เหตุผล |
|---|----------|---------|--------|
| 1 | `/product-lookup` POST | ✅ **KEEP** | Core — AI ใช้แนะนำสินค้า |
| 2 | `/dealer-lookup` POST | ✅ **KEEP** | Core — หาตัวแทนใกล้บ้าน |
| 3 | `/warranty-check` POST | ✅ **KEEP** | ลูกค้าเช็คประกันผ่านแชท |
| 4 | `/kb-search` POST | ✅ **KEEP** | AI ค้นหาคำตอบจาก KB |
| 5 | `/kb-export` GET | ✅ **KEEP** | Sync KB → Qdrant |
| 6 | `/catalog-full` GET | ✅ **KEEP** | Sync catalog ทั้งหมด |

### 6.2 B2C System Endpoints (แผนเดิม 8 ตัว)

| # | Endpoint | Verdict | เหตุผล |
|---|----------|---------|--------|
| 7 | `/warranty-registered` webhook | ✅ **KEEP** | AI รู้ว่าลูกค้ามีสินค้าอะไร |
| 8 | `/member-motorcycle` GET | ✅ **KEEP** | AI แนะนำสินค้าตรงรุ่น |
| 9 | `/member-assets` GET | ✅ **KEEP** | ลูกค้าถาม "ประกันหมดเมื่อไหร่" |
| 10 | `/claim-create` POST | 🔄 **MODIFY** | เปลี่ยนเป็น `/claim-manual-create` — สร้าง manual claim จากแชท ไม่ใช่ auto claim |
| 11 | `/claim-status` GET | ✅ **KEEP** | เช็คสถานะเคลม |
| 12 | `/claim-status-changed` webhook | ✅ **KEEP** | แจ้งลูกค้าผ่าน FB/IG เมื่อสถานะเปลี่ยน |
| 13 | `/transfer-eligibility` GET | ✅ **KEEP** | AI เช็คว่าโอนได้ไหม |
| 14 | `/profile-updated` webhook | ✅ **KEEP** | Sync profile → CRM |
| 15 | `/member-registered` webhook | ✅ **KEEP** | Cross-link FB/IG → WP |

### 6.3 B2B System Endpoints (แผนเดิม 9 ตัว)

| # | Endpoint | Verdict | เหตุผล |
|---|----------|---------|--------|
| 16 | `/distributor-list` GET | ✅ **KEEP** | AI หาตัวแทนใกล้บ้าน |
| 17 | `/distributor-notify` POST | ✅ **KEEP** | LINE push แจ้งตัวแทนมี lead |
| 18 | `/distributor-debt` GET | ❌ **REMOVE** | ข้อมูลหนี้เป็น internal B2B ไม่ควรเปิดให้ OpenClaw เห็น |
| 19 | `/distributor-pricing` GET | ❌ **REMOVE** | ราคา dealer-tier เป็นความลับ ไม่ส่งผ่าน external API |
| 20 | `/b2b-dashboard-stats` GET | ❌ **REMOVE** | B2B stats เป็น internal, admin ดูใน WP ได้ |
| 21 | `/dunning-smart-message` POST | ❌ **REMOVE** | ทวงหนี้เป็น B2B internal, ไม่เกี่ยวกับ FB/IG chat |
| 22 | `/order-status-changed` webhook | ❌ **REMOVE** | B2B orders อยู่ใน LINE ecosystem ไม่ cross กับ FB/IG |
| 23 | `/b2b-order-created` webhook | ❌ **REMOVE** | B2B internal |
| 24 | `/distributor-payment-history` GET | ❌ **REMOVE** | ข้อมูลการเงินเป็นความลับ (**ตาม project_finance_confidential.md**) |
| ~25~ | ~`/invoice-image` GET~ | ❌ **REMOVE** | ตัวแทนมี LINE Flex invoice อยู่แล้ว + ไม่ควรส่งผ่าน FB Messenger |

### 6.4 Admin System Endpoints (แผนเดิม 11 ตัว)

| # | Endpoint | Verdict | เหตุผล |
|---|----------|---------|--------|
| 25 | `/brand-voice-submit` POST | ✅ **KEEP** | FB/IG comments → brand_voice |
| 26 | `/kb-suggest` POST | ✅ **KEEP** | คำถามที่ AI ตอบไม่ได้ → KB suggestion |
| 27 | `/kb-updated` webhook | ✅ **KEEP** | Trigger Qdrant re-sync |
| 28 | `/inventory-changed` webhook | ✅ **KEEP** | สินค้าหมด → AI ไม่แนะนำ |
| 29 | `/moto-catalog-changed` webhook | ✅ **KEEP** | Brand/model เปลี่ยน → refresh cache |
| 30 | `/moto-catalog` GET | ✅ **KEEP** | AI ดึง brands/models/aliases |
| 31 | `/dashboard-inject-metrics` POST | ✅ **KEEP** | FB/IG metrics เข้า DINOCO Dashboard |
| 32 | `/fb-ig-sales-attribution` POST | 🔄 **MODIFY** | เปลี่ยนชื่อเป็น `/lead-attribution` — วัด lead conversion ไม่ใช่ sales (DINOCO ไม่ขายตรง) |
| 33 | `/finance-summary` GET | ❌ **REMOVE** | ข้อมูลการเงินเป็นความลับ (**ตาม project_finance_confidential.md**) |
| 34 | `/product-demand-signal` POST | ✅ **KEEP** | ลูกค้าถามสินค้าที่ไม่มี → data สำหรับ R&D |
| ~35~ | ~`/bank-info` GET~ | ❌ **REMOVE** | DINOCO ไม่ขายตรง ไม่มี bank info สำหรับลูกค้า |

### 6.5 NEW Endpoints (Lead Follow-up + Manual Claim)

| # | Endpoint | Type | เหตุผล |
|---|----------|------|--------|
| 33 | `/lead-create` POST | MCP Write | สร้าง lead record เมื่อแนะนำตัวแทนแล้ว |
| 34 | `/lead-update` POST | MCP Write | อัพเดทสถานะ lead (contacted, waiting, delivered, etc.) |
| 35 | `/lead-list` GET | MCP Read | ดึงรายการ lead ทั้งหมด + filter by status/dealer |
| 36 | `/lead-followup-schedule` GET | MCP Read | ดึง pending follow-ups ที่ต้องทำ |
| 37 | `/dealer-sla-report` GET | MCP Read | รายงาน SLA ตัวแทน (avg response time, conversion rate) |
| 38 | `/claim-manual-create` POST | MCP Write | สร้าง manual claim จากแชท (พร้อมรูป + อาการ) |
| 39 | `/claim-manual-update` POST | MCP Write | อัพเดทสถานะ claim (admin reviewed, shipping, repaired, etc.) |
| 40 | `/claim-manual-status` GET | MCP Read | เช็คสถานะ manual claim |
| 41 | `/customer-link` POST | MCP Write | ผูก FB/IG user กับ WP member |

### 6.6 Endpoint Summary

```
แผนเดิม: 38 endpoints
  ├── KEEP as-is:      20 endpoints
  ├── MODIFY:           2 endpoints  (/claim-create → /claim-manual-create, /fb-ig-sales → /lead-attribution)
  ├── REMOVE:          10 endpoints  (retailer-specific + confidential finance data)
  └── ADD:              9 endpoints  (Lead Follow-up + Manual Claim + Customer Link)

แผนใหม่: 31 endpoints total
  ├── Existing (สร้างแล้ว):  6
  ├── ต้องสร้างใหม่:         25
```

---

## Part 7: ★ Lead Follow-up Pipeline (NEW — CRITICAL FEATURE)

### 7.1 Complete Flow

```
ลูกค้าทัก FB/IG → AI แนะนำสินค้า → หาตัวแทนใกล้บ้าน → ส่งเบอร์ตัวแทน
    │
    ▼
[Day 0, T+0] LEAD CREATED
├── น้องกุ้งแจ้งตัวแทน (LINE push): "มีลูกค้าสนใจ [สินค้า] พื้นที่ [จังหวัด]"
├── น้องกุ้งแจ้งลูกค้า (FB/IG): "ส่งข้อมูลตัวแทนให้แล้วนะคะ ตัวแทนจะติดต่อกลับค่ะ"
├── Pipeline: lead_created
└── Timer: set T+4hr
    │
    ▼
[Day 0, T+4hr] FIRST CHECK
├── น้องกุ้งถามตัวแทน (LINE push): "ติดต่อลูกค้า [ชื่อ] ไปหรือยังคะ?"
├── น้องกุ้งถามลูกค้า (FB/IG DM): "ตัวแทนติดต่อไปหรือยังคะ?"
├── Pipeline: checking_contact
└── Wait for response (timeout: 24hr)
    │
    ├─── [ตัวแทนตอบ "ติดต่อแล้ว" / ลูกค้าตอบ "ได้เรื่อง"]
    │    ├── Pipeline: dealer_contacted
    │    ├── น้องกุ้งถามลูกค้า: "เป็นยังไงบ้างคะ? สนใจสั่งไหม?"
    │    └── Timer: set T+24hr (follow up อีกที)
    │
    ├─── [ลูกค้าบอก "ยังไม่ติดต่อ"]
    │    ├── Pipeline: dealer_no_contact
    │    ├── น้องกุ้ง re-notify ตัวแทน (LINE push): "⚠️ ลูกค้ายังไม่ได้รับการติดต่อค่ะ"
    │    ├── Timer: set T+4hr (ถามอีกรอบ)
    │    └── ถ้ายังไม่ติดต่ออีก → ESCALATE to admin + SLA flag
    │
    └─── [ไม่มีใครตอบ 24hr]
         ├── Pipeline: no_response
         ├── น้องกุ้ง escalate → alert admin
         └── SLA flag: dealer_slow_response
    │
    ▼
[ลูกค้าบอก "สั่งแล้ว รอของ"]
├── Pipeline: waiting_delivery
├── น้องกุ้งถาม: "รอกี่วันคะ?"
├── ลูกค้าตอบ: "3 วัน"
├── Timer: set T+3days
└── บันทึก: expected_delivery_date
    │
    ▼
[Day X] DELIVERY CHECK
├── น้องกุ้งถามลูกค้า (FB/IG): "ของมาถึงแล้วหรือยังคะ?"
├── Wait for response
│
├─── [ลูกค้าบอก "ได้แล้ว"]
│    ├── Pipeline: delivered
│    ├── Timer: set T+2days (ถามเรื่องติดตั้ง)
│    └── น้องกุ้ง: "ดีใจด้วยค่ะ! ติดตั้งแล้วบอกนะคะ"
│
└─── [ลูกค้าบอก "ยังไม่มา"]
     ├── Pipeline: delivery_delayed
     ├── น้องกุ้งถาม: "ตัวแทนบอกว่ากี่วันคะ?"
     ├── Timer: re-set + SLA flag: delivery_delay
     └── ถ้า delay > 7 วัน → ESCALATE to admin
    │
    ▼
[Day X+2] INSTALLATION CHECK
├── น้องกุ้งถามลูกค้า (FB/IG): "ติดตั้งแล้วเป็นยังไงบ้างคะ?"
├── Wait for response
│
├─── [Positive: "ดีมาก" "สวย" "ชอบ"]
│    ├── Pipeline: satisfied
│    ├── Sentiment: positive (score)
│    ├── น้องกุ้ง: "ดีใจด้วยค่ะ! รบกวนช่วยรีวิวให้หน่อยได้ไหมคะ? 🙏"
│    ├── ส่งลิงก์รีวิว (Facebook review / Google review)
│    └── Timer: set T+30days (30-day check)
│
├─── [Negative: "มีปัญหา" "ไม่ดี" "แตก"]
│    ├── Pipeline: issue_reported
│    ├── Sentiment: negative (score)
│    ├── น้องกุ้ง: "เสียใจด้วยค่ะ ช่วยส่งรูปสินค้าที่มีปัญหาให้ดูหน่อยค่ะ"
│    └── → เข้าสู่ Manual Claim Flow (Part 8)
│
└─── [Neutral: "โอเค" "ก็ได้"]
     ├── Pipeline: installed
     ├── Timer: set T+30days (30-day check)
     └── น้องกุ้ง: "มีอะไรสงสัยทักมาได้ตลอดนะคะ"
    │
    ▼
[Day X+30] 30-DAY SATISFACTION CHECK
├── น้องกุ้งถามลูกค้า (FB/IG): "ใช้งานมาเดือนนึงแล้ว เป็นยังไงบ้างคะ? มีปัญหาอะไรไหม?"
│
├─── [ไม่มีปัญหา]
│    ├── Pipeline: ★ CLOSED_SATISFIED
│    ├── น้องกุ้ง: "ขอบคุณที่ใช้สินค้า DINOCO ค่ะ ❤️"
│    └── Lead pipeline COMPLETE
│
└─── [มีปัญหา]
     ├── → เข้าสู่ Manual Claim Flow (Part 8)
     └── Pipeline: claim_initiated

Pipeline Summary:
lead_created → checking_contact → dealer_contacted → waiting_delivery
→ delivered → installed → satisfied → CLOSED_SATISFIED
                                    → CLOSED_CLAIM (ถ้ามีปัญหา)

Side tracks:
→ dealer_no_contact → escalated
→ delivery_delayed → escalated
→ no_response → dormant (30 วันนับจากนี้ → Churn agent)
```

### 7.2 MongoDB Collection: `leads`

```javascript
{
  _id: ObjectId,

  // Customer info
  customer_id: ObjectId,          // ref: customers collection
  customer_name: "สมชาย",
  customer_platform: "facebook",  // "facebook" | "instagram"
  customer_platform_id: "FB_USER_ID",
  customer_location: "เชียงใหม่",
  customer_phone: "0XX-XXX-XXXX", // ถ้าได้มา

  // Product interest
  product_interest: [
    { sku: "DNC-CB500X-001", name: "กันล้ม CB500X", price: 3500 }
  ],
  motorcycle_model: "Honda CB500X",

  // Dealer assigned
  dealer_id: 1234,                // WP post ID ของตัวแทน
  dealer_name: "ร้าน XXX",
  dealer_phone: "0XX-XXX-XXXX",
  dealer_province: "เชียงใหม่",
  dealer_notified_at: ISODate,    // เวลาที่แจ้งตัวแทน

  // Pipeline state
  status: "waiting_delivery",     // enum: see pipeline states below
  status_history: [
    { status: "lead_created", at: ISODate, by: "system" },
    { status: "checking_contact", at: ISODate, by: "cron" },
    { status: "dealer_contacted", at: ISODate, by: "customer_response" },
    { status: "waiting_delivery", at: ISODate, by: "customer_response" }
  ],

  // Follow-up tracking
  next_followup_at: ISODate,      // เมื่อไหร่ต้อง follow up
  followup_type: "delivery_check", // enum: first_check, contact_recheck, delivery_check, install_check, 30day_check
  followup_count: 3,              // จำนวนครั้งที่ follow up แล้ว
  followup_history: [
    {
      type: "first_check",
      sent_at: ISODate,
      channel: "facebook",        // ส่งถามลูกค้าทาง FB
      message: "ตัวแทนติดต่อไปหรือยังคะ?",
      response: "ได้เรื่องแล้วค่ะ",
      response_at: ISODate,
      response_sentiment: "positive"
    }
  ],

  // Delivery tracking
  expected_delivery_date: ISODate,
  actual_delivery_date: ISODate,

  // SLA metrics
  sla: {
    dealer_first_contact_minutes: 180,  // กี่นาทีตัวแทนติดต่อลูกค้า
    dealer_contacted: true,
    dealer_contact_attempts: 1,         // กี่ครั้งที่ต้อง nudge ตัวแทน
    delivery_delay_days: 0,             // ส่งช้ากี่วัน
    flags: []                           // ["dealer_slow_response", "delivery_delay"]
  },

  // Satisfaction
  satisfaction: {
    installation_feedback: "ดีมากเลยค่ะ",
    sentiment_score: 0.92,
    review_requested: true,
    review_given: true,
    review_platform: "facebook",
    thirty_day_feedback: "ใช้ดีค่ะ ไม่มีปัญหา",
    thirty_day_sentiment: 0.88
  },

  // Claim (if any)
  claim_id: null,                 // ref: claims collection (ถ้าเข้าเคลม)

  // Meta
  source_conversation_id: ObjectId, // ref: messages collection
  created_at: ISODate,
  updated_at: ISODate,
  closed_at: ISODate,
  close_reason: "satisfied",      // "satisfied" | "claim" | "no_response" | "cancelled"

  // WP sync
  wp_lead_id: null,               // WP post ID (ถ้า sync ไป WP)
  wp_synced_at: ISODate
}

// Indexes
db.leads.createIndex({ status: 1, next_followup_at: 1 })  // Cron query
db.leads.createIndex({ dealer_id: 1, status: 1 })          // Dealer SLA report
db.leads.createIndex({ customer_id: 1 })                   // Customer lookup
db.leads.createIndex({ created_at: -1 })                   // Recent leads
db.leads.createIndex({ "sla.flags": 1 })                   // Flagged leads
```

### 7.3 Pipeline States (Enum)

```javascript
const LEAD_STATUSES = {
  // Active states
  lead_created:       "สร้าง lead แล้ว รอแจ้งตัวแทน",
  dealer_notified:    "แจ้งตัวแทนแล้ว รอตัวแทนติดต่อ",
  checking_contact:   "กำลังเช็คว่าตัวแทนติดต่อหรือยัง",
  dealer_contacted:   "ตัวแทนติดต่อลูกค้าแล้ว",
  waiting_delivery:   "ลูกค้าสั่งแล้ว รอรับของ",
  delivered:          "ลูกค้าได้รับของแล้ว",
  installed:          "ติดตั้งแล้ว",
  satisfied:          "ลูกค้าพอใจ",

  // Escalation states
  dealer_no_contact:  "ตัวแทนยังไม่ติดต่อ (escalated)",
  delivery_delayed:   "ส่งของล่าช้า (escalated)",
  issue_reported:     "ลูกค้ารายงานปัญหา → เข้า claim",

  // Closed states
  closed_satisfied:   "★ ปิด: ลูกค้าพอใจ",
  closed_claim:       "ปิด: เข้าเคลม",
  closed_no_response: "ปิด: ไม่มีการตอบกลับ",
  closed_cancelled:   "ปิด: ลูกค้ายกเลิก",
  closed_dormant:     "ปิด: ไม่มีความเคลื่อนไหว 30 วัน"
};
```

### 7.4 Cron / Timer Schedule

```javascript
// Cron jobs สำหรับ Lead Follow-up (ทำงานใน OpenClaw)

// 1. First Check — ทุก 30 นาที สแกนหา leads ที่ครบ 4 ชม.
{
  name: "lead_first_check",
  schedule: "*/30 * * * *",  // ทุก 30 นาที
  query: {
    status: "dealer_notified",
    next_followup_at: { $lte: new Date() }
  },
  action: "send_first_check_messages"
  // → ถามตัวแทน (LINE push) + ถามลูกค้า (FB/IG)
  // → เปลี่ยนสถานะเป็น checking_contact
  // → set next_followup_at = +24hr
}

// 2. Contact Recheck — ทุก 1 ชม. สแกนหา leads ที่ตัวแทนยังไม่ติดต่อ
{
  name: "lead_contact_recheck",
  schedule: "0 */1 * * *",  // ทุก 1 ชม.
  query: {
    status: "checking_contact",
    next_followup_at: { $lte: new Date() }
  },
  action: "recheck_contact_status"
  // → ถ้าเกิน 24hr ไม่มีใครตอบ → escalate
  // → ถ้าตัวแทนยังไม่ติดต่อ → re-notify + set next_followup_at = +4hr
}

// 3. Delivery Check — ทุก 2 ชม. สแกนหา leads ที่ครบกำหนดรับของ
{
  name: "lead_delivery_check",
  schedule: "0 */2 * * *",  // ทุก 2 ชม.
  query: {
    status: "waiting_delivery",
    next_followup_at: { $lte: new Date() }
  },
  action: "send_delivery_check"
  // → ถามลูกค้า "ของมาถึงแล้วหรือยัง?"
  // → ถ้า delay > 7 วัน → escalate
}

// 4. Installation Check — ทุก 4 ชม. สแกนหา leads ที่ได้ของแล้ว 2 วัน
{
  name: "lead_install_check",
  schedule: "0 */4 * * *",  // ทุก 4 ชม.
  query: {
    status: "delivered",
    next_followup_at: { $lte: new Date() }
  },
  action: "send_install_check"
  // → ถามลูกค้า "ติดตั้งเป็นยังไงบ้าง?"
  // → sentiment analysis on response
}

// 5. 30-Day Check — วันละครั้ง สแกนหา leads ที่ติดตั้งแล้ว 30 วัน
{
  name: "lead_30day_check",
  schedule: "0 9 * * *",    // 9:00 AM ทุกวัน
  query: {
    status: { $in: ["installed", "satisfied"] },
    next_followup_at: { $lte: new Date() }
  },
  action: "send_30day_check"
  // → ถามลูกค้า "ใช้งานมาเดือนนึงแล้ว เป็นยังไง?"
  // → ถ้า positive → close as satisfied
  // → ถ้า negative → เข้า claim flow
}

// 6. Dormant Cleanup — วันละครั้ง ปิด leads ที่ไม่มีความเคลื่อนไหว 30 วัน
{
  name: "lead_dormant_cleanup",
  schedule: "0 2 * * *",    // 2:00 AM ทุกวัน
  query: {
    status: { $nin: ["closed_satisfied", "closed_claim", "closed_no_response", "closed_cancelled", "closed_dormant"] },
    updated_at: { $lte: new Date(Date.now() - 30*24*60*60*1000) }
  },
  action: "close_dormant_leads"
}

// 7. Dealer SLA Report — สัปดาห์ละครั้ง สรุป SLA ตัวแทน
{
  name: "dealer_sla_weekly",
  schedule: "0 8 * * 1",    // จันทร์ 8:00 AM
  action: "generate_dealer_sla_report"
  // → aggregate: avg response time, conversion rate per dealer
  // → ส่ง report ให้ admin (LINE push / Dashboard)
}
```

### 7.5 น้องกุ้งมะยม — Lead Follow-up Agent (NEW Agent #15)

```
Agent Name: น้องกุ้งมะยม (Ma-Yom)
Role: Lead Follow-up & Dealer SLA Tracker
Type: Autonomous Agent (cron-triggered + event-triggered)

Responsibilities:
1. สร้าง lead เมื่อ AI แนะนำตัวแทนให้ลูกค้า
2. ส่ง LINE push แจ้งตัวแทน
3. ส่ง FB/IG message ถามลูกค้าตามตาราง
4. วิเคราะห์คำตอบลูกค้า (sentiment + intent)
5. อัพเดท pipeline status
6. Escalate เมื่อ SLA เกิน
7. ขอรีวิวเมื่อลูกค้าพอใจ
8. เปลี่ยนเข้า claim flow เมื่อมีปัญหา
9. สร้าง Dealer SLA Report รายสัปดาห์

Triggers:
├── Event: "dealer_recommended" → สร้าง lead + notify dealer
├── Event: "customer_message" → check ว่าเป็น response ของ follow-up ไหม
├── Event: "dealer_line_response" → อัพเดท dealer contact status
├── Cron: ทุก 30 นาที → สแกน pending follow-ups
└── Cron: ทุกจันทร์ → SLA report

Integration Points:
├── MCP Bridge: /distributor-notify (LINE push ตัวแทน)
├── MCP Bridge: /lead-create, /lead-update (sync ไป WP)
├── OpenClaw: FB/IG Messaging API (ส่งข้อความลูกค้า)
├── OpenClaw: Customer Memory (จำ context ของลูกค้า)
├── OpenClaw: Sentiment Analysis (วิเคราะห์ feedback)
└── MongoDB: leads collection (state management)
```

### 7.6 Dashboard UI: Lead Tracking View

```
┌─────────────────────────────────────────────────────────────────────┐
│  📋 Lead Follow-up Dashboard                        [Filter ▼] [Export]
│─────────────────────────────────────────────────────────────────────│
│                                                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │  NEW    │ │CONTACTED│ │ WAITING │ │DELIVERED│ │SATISFIED│      │
│  │   12    │ │    8    │ │    5    │ │    3    │ │   45    │      │
│  │  leads  │ │  leads  │ │  leads  │ │  leads  │ │  leads  │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
│                                                                      │
│  ⚠️ NEEDS ATTENTION (3)                                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 🔴 สมชาย (CB500X กันล้ม) — ร้านABC ไม่ติดต่อ 24hr          │   │
│  │ 🟡 สมหญิง (NX500 แคชบาร์) — รอของ 5 วันแล้ว (เกิน 3 วัน)  │   │
│  │ 🟡 สมศักดิ์ (Ninja400 สไลเดอร์) — ไม่ตอบ 48hr             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  📊 Dealer SLA Scorecard                                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Dealer        │ Avg Response │ Conversion │ Leads │ Rating   │   │
│  │───────────────│──────────────│────────────│───────│──────────│   │
│  │ ร้าน ABC เชียงใหม่│ 2.1 hr    │ 78%       │  18   │ ⭐⭐⭐⭐⭐│   │
│  │ ร้าน DEF กรุงเทพ │ 5.3 hr    │ 62%       │  25   │ ⭐⭐⭐⭐  │   │
│  │ ร้าน GHI ชลบุรี  │ 18.5 hr   │ 35%       │  12   │ ⭐⭐     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Recent Lead Activity                              [View All →]     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 10:30 สมชาย ตอบ: "ตัวแทนโทรมาแล้วค่ะ" → CONTACTED          │   │
│  │ 10:15 น้องกุ้ง → สมหญิง: "ของมาถึงแล้วหรือยังคะ?"           │   │
│  │ 09:45 น้องกุ้ง → ร้าน ABC: "มีลูกค้าสนใจกันล้ม Ninja400"   │   │
│  │ 09:30 Lead ใหม่: สมศรี สนใจ CB500X แคชบาร์ (เชียงราย)        │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Part 8: ★ Manual Claim via Chat (NEW — HIGH PRIORITY)

### 8.1 Complete Flow

```
ลูกค้าบอก "สินค้ามีปัญหา" (ผ่าน FB/IG chat)
    │
    ▼
[Step 1] AI DETECT CLAIM INTENT
├── Smart Routing ตรวจจับ: "มีปัญหา" / "แตก" / "ลอก" / "เสีย" / "กุญแจหาย"
├── น้องกุ้งแก้ว (Support Agent) เข้ามาดูแล
├── น้องกุ้ง: "เสียใจด้วยค่ะ 🙏 ช่วยส่งรูปสินค้าที่มีปัญหาให้ดูหน่อยค่ะ
│             กรุณาถ่ายให้เห็นจุดที่มีปัญหาชัดๆ นะคะ"
└── Claim status: photo_requested
    │
    ▼
[Step 2] PHOTO RECEIVED + AI ANALYSIS
├── ลูกค้าส่งรูป → เก็บใน MongoDB (GridFS / S3 link)
├── Vision AI วิเคราะห์เบื้องต้น:
│   ├── ตรวจจับ: สติ๊กเกอร์ลอก / มุมแตก / รอยขีดข่วน / ชิ้นส่วนหาย
│   ├── confidence score
│   └── suggested category
├── น้องกุ้ง: "ได้รับรูปแล้วค่ะ"
├── น้องกุ้งถาม: "อาการเป็นยังไงคะ?"
│   ├── "สติ๊กเกอร์ลอก"
│   ├── "มุมแตก / ร้าว"
│   ├── "กุญแจหาย / หัก"
│   ├── "ชิ้นส่วนหลุด"
│   └── "อื่นๆ (โปรดอธิบาย)"
└── Claim status: photo_received
    │
    ▼
[Step 3] CUSTOMER DESCRIBES ISSUE
├── ลูกค้าบอกอาการ
├── น้องกุ้งถาม: "ซื้อมาเมื่อไหร่คะ? มี serial number ไหม?"
│   ├── ถ้ามี serial → เรียก /warranty-check → เช็คว่ายังอยู่ในประกันไหม
│   └── ถ้าไม่มี serial → ถาม "ซื้อจากร้านไหนคะ?"
├── น้องกุ้งสรุป: "ขอสรุปนะคะ: สินค้า [X], อาการ [Y], ซื้อ [Z]"
├── สร้าง Manual Claim record ใน MongoDB
└── Claim status: info_collected
    │
    ▼
[Step 4] ADMIN REVIEW
├── Claim ปรากฏใน Admin Dashboard (OpenClaw)
│   ├── รูปสินค้า
│   ├── อาการที่ลูกค้าบอก
│   ├── AI analysis result
│   ├── Warranty status
│   └── ปุ่ม: [Case A: ส่งกลับเปลี่ยน] [Case B: ส่งอะไหล่] [ปฏิเสธ]
├── Admin เลือก Case → บันทึกใน claim record
└── Claim status: admin_reviewed
    │
    ├─── [Case A: ส่งสินค้ากลับเปลี่ยน]
    │    ├── น้องกุ้งแจ้งลูกค้า:
    │    │   "ทีมงานตรวจแล้วค่ะ ต้องรบกวนส่งสินค้ากลับมาเปลี่ยนนะคะ
    │    │    ที่อยู่จัดส่ง: [DINOCO address]
    │    │    กรุณาแพ็คสินค้าให้มิดชิดค่ะ"
    │    ├── Claim status: waiting_return_shipment
    │    └── Timer: set T+3days ("ส่งสินค้ามาแล้วหรือยังคะ?")
    │
    ├─── [Case B: ซ่อมได้ ส่งอะไหล่]
    │    ├── น้องกุ้งแจ้งลูกค้า:
    │    │   "ทีมงานตรวจแล้วค่ะ สามารถซ่อมได้ จะส่งอะไหล่ไปให้ค่ะ
    │    │    ส่งภายใน 2-3 วันทำการนะคะ"
    │    ├── Claim status: parts_shipping
    │    └── Timer: set T+3days ("ได้รับอะไหล่แล้วหรือยังคะ?")
    │
    └─── [ปฏิเสธ: ไม่อยู่ในเงื่อนไข]
         ├── น้องกุ้งแจ้งลูกค้า:
         │   "ขออภัยค่ะ หลังจากตรวจสอบแล้ว กรณีนี้ไม่อยู่ในเงื่อนไขประกันค่ะ
         │    เนื่องจาก [เหตุผล] ถ้ามีข้อสงสัยทักมาสอบถามได้นะคะ"
         └── Claim status: closed_rejected
    │
    ▼
[Step 5] SHIPMENT TRACKING (Case A)
├── น้องกุ้งถาม (Timer): "ส่งสินค้ามาแล้วหรือยังคะ?"
├── ลูกค้าตอบ: "ส่งแล้วค่ะ เลข tracking [XXX]"
├── บันทึก tracking number
├── Claim status: return_shipped
├── น้องกุ้ง: "ได้รับข้อมูลแล้วค่ะ จะแจ้งเมื่อสินค้ามาถึงนะคะ"
└── Timer: admin checks daily for received packages
    │
    ▼
[Step 6] REPAIR / REPLACE
├── สินค้ามาถึง DINOCO → Admin อัพเดทสถานะ
├── Claim status: received_at_factory
├── ซ่อม / เปลี่ยน
├── Claim status: repaired (หรือ replaced)
├── Admin อัพเดท + ใส่ tracking number ส่งกลับ
├── น้องกุ้งแจ้งลูกค้า:
│   "ซ่อมเสร็จแล้วค่ะ ส่งกลับวันนี้ เลข tracking [XXX]
│    คาดว่าจะได้รับภายใน 2-3 วันค่ะ"
├── Claim status: return_to_customer
└── Timer: set T+3days ("ได้รับสินค้าคืนแล้วหรือยังคะ?")
    │
    ▼
[Step 7] CUSTOMER RECEIVES REPAIRED ITEM
├── น้องกุ้งถาม: "ได้รับสินค้าคืนแล้วหรือยังคะ? เป็นยังไงบ้าง?"
├── ลูกค้าตอบ:
│
├─── [พอใจ]
│    ├── Claim status: ★ closed_resolved
│    └── น้องกุ้ง: "ดีใจที่เรียบร้อยค่ะ ขอบคุณที่ใช้สินค้า DINOCO นะคะ 🙏"
│
└─── [ยังมีปัญหา]
     ├── Claim status: reopened
     └── → กลับไป Step 2 (ส่งรูปใหม่)
```

### 8.2 Claim State Machine

```
States:
─────────────────────────────────────────────────────
photo_requested        → ขอรูปจากลูกค้า
photo_received         → ได้รูปแล้ว รอข้อมูลเพิ่ม
info_collected         → ได้ข้อมูลครบ รอ admin ตรวจ
admin_reviewed         → admin ตรวจแล้ว เลือก case แล้ว
waiting_return_shipment→ [Case A] รอลูกค้าส่งสินค้ากลับ
return_shipped         → [Case A] ลูกค้าส่งแล้ว รอรับ
received_at_factory    → สินค้ามาถึง DINOCO แล้ว
parts_shipping         → [Case B] กำลังส่งอะไหล่
repaired               → ซ่อมเสร็จ
replaced               → เปลี่ยนใหม่
return_to_customer     → ส่งกลับลูกค้าแล้ว
closed_resolved        → ★ ปิด: เคลมสำเร็จ
closed_rejected        → ปิด: ปฏิเสธ (ไม่อยู่ในเงื่อนไข)
reopened               → เปิดใหม่ (ยังมีปัญหา)

Transitions:
─────────────────────────────────────────────────────
photo_requested        → photo_received          (customer sends photo)
photo_received         → info_collected           (customer describes issue)
info_collected         → admin_reviewed           (admin selects case)
admin_reviewed         → waiting_return_shipment  (Case A selected)
admin_reviewed         → parts_shipping           (Case B selected)
admin_reviewed         → closed_rejected          (claim rejected)
waiting_return_shipment→ return_shipped           (customer ships back)
return_shipped         → received_at_factory      (DINOCO receives)
received_at_factory    → repaired                 (repair complete)
received_at_factory    → replaced                 (replacement sent)
parts_shipping         → closed_resolved          (customer confirms OK)
repaired               → return_to_customer       (shipped back)
replaced               → return_to_customer       (shipped back)
return_to_customer     → closed_resolved          (customer confirms OK)
return_to_customer     → reopened                 (still has issue)
reopened               → photo_requested          (restart)
```

### 8.3 MongoDB Collection: `manual_claims`

```javascript
{
  _id: ObjectId,
  claim_number: "CLM-2026-0001",  // Auto-generated

  // Customer
  customer_id: ObjectId,          // ref: customers
  customer_name: "สมชาย",
  customer_platform: "facebook",
  customer_platform_id: "FB_USER_ID",

  // Product
  product_name: "กันล้ม CB500X",
  product_sku: "DNC-CB500X-001",
  serial_number: "SN-12345",      // ถ้ามี
  warranty_status: "active",      // "active" | "expired" | "unknown"
  warranty_expiry: ISODate,
  purchase_date: ISODate,
  purchase_dealer: "ร้าน ABC",

  // Issue
  issue_category: "sticker_peel", // enum: sticker_peel, crack, key_lost, part_detach, other
  issue_description: "สติ๊กเกอร์ลอกออกมาหลังล้างรถ",
  photos: [
    {
      url: "https://s3.../claim-photo-1.jpg",
      uploaded_at: ISODate,
      ai_analysis: {
        detected_issue: "sticker_peeling",
        confidence: 0.87,
        details: "สติ๊กเกอร์ด้านซ้ายลอกประมาณ 30%"
      }
    }
  ],

  // State machine
  status: "waiting_return_shipment",
  case_type: "A",                 // "A" (ส่งกลับเปลี่ยน) | "B" (ส่งอะไหล่) | null
  status_history: [
    { status: "photo_requested", at: ISODate, by: "agent:support" },
    { status: "photo_received", at: ISODate, by: "customer" },
    { status: "info_collected", at: ISODate, by: "agent:support" },
    { status: "admin_reviewed", at: ISODate, by: "admin:somchai", note: "Case A เปลี่ยนใหม่" },
    { status: "waiting_return_shipment", at: ISODate, by: "system" }
  ],

  // Admin decision
  admin_decision: {
    decided_by: "admin:somchai",
    decided_at: ISODate,
    case_type: "A",
    reason: "สติ๊กเกอร์ลอกจากข้อผิดพลาดการผลิต",
    rejection_reason: null
  },

  // Shipping (Case A)
  return_shipping: {
    tracking_number: "TH12345678",
    carrier: "Thailand Post",
    shipped_at: ISODate,
    received_at: ISODate
  },

  // Repair / Replace
  repair: {
    type: "replace",              // "repair" | "replace"
    started_at: ISODate,
    completed_at: ISODate,
    notes: "เปลี่ยนสินค้าใหม่ lot 2026-03"
  },

  // Return to customer
  return_to_customer: {
    tracking_number: "TH87654321",
    carrier: "Flash Express",
    shipped_at: ISODate,
    received_at: ISODate,
    customer_feedback: "ได้รับแล้วค่ะ สวยเหมือนใหม่",
    satisfaction_score: 0.95
  },

  // Follow-up timers
  next_followup_at: ISODate,
  followup_type: "return_shipment_check",

  // Linked lead (ถ้ามาจาก Lead Follow-up)
  lead_id: ObjectId,              // ref: leads (ถ้า claim มาจาก lead pipeline)

  // Source conversation
  source_conversation_id: ObjectId,

  // WP sync (เมื่อ DINOCO Claim System เปิด)
  wp_claim_id: null,              // WP post ID (claim_ticket CPT)
  wp_synced_at: null,

  // Meta
  created_at: ISODate,
  updated_at: ISODate,
  closed_at: ISODate
}

// Indexes
db.manual_claims.createIndex({ status: 1, next_followup_at: 1 })
db.manual_claims.createIndex({ customer_id: 1 })
db.manual_claims.createIndex({ claim_number: 1 }, { unique: true })
db.manual_claims.createIndex({ "admin_decision.decided_by": 1 })
```

### 8.4 Integration with DINOCO Claim System (อนาคต)

```
ปัจจุบัน: [System] DINOCO Claim System ยังไม่เปิดใช้
อนาคต: เมื่อเปิดใช้ → sync Manual Claims → WP claim_ticket CPT

Migration path:
1. Manual Claim สร้างใน MongoDB (OpenClaw)
2. Admin ตรวจ/ดำเนินการใน OpenClaw Dashboard
3. เมื่อ DINOCO Claim System เปิด:
   ├── เพิ่ม /claim-manual-sync endpoint ใน MCP Bridge
   ├── Manual Claims sync → WP claim_ticket CPT (one-way)
   ├── Status updates sync ทั้ง 2 ทาง (bidirectional)
   └── PDF generation ยังอยู่ใน WP (มี infrastructure อยู่แล้ว)

เป้าหมาย: ลูกค้าเริ่มเคลมจากช่องทางไหนก็ได้
  ├── FB/IG chat → Manual Claim (OpenClaw)
  ├── LINE → DINOCO Claim System (WP) [อนาคต]
  └── ทั้ง 2 ช่องทาง sync กันผ่าน MCP Bridge
```

---

## Part 9: Complete Endpoint Review — 38 Endpoints เดิม

### Verdict for ALL 38 original endpoints:

| # | Endpoint (เดิม) | Category | Verdict | เหตุผล |
|---|-----------------|----------|---------|--------|
| 1 | `/product-lookup` | B2C | ✅ KEEP | Core — AI แนะนำสินค้า |
| 2 | `/dealer-lookup` | B2C | ✅ KEEP | Core — หาตัวแทนใกล้บ้าน |
| 3 | `/warranty-check` | B2C | ✅ KEEP | ลูกค้าเช็คประกัน |
| 4 | `/kb-search` | Admin | ✅ KEEP | AI ค้น KB |
| 5 | `/kb-export` | Admin | ✅ KEEP | Sync KB → Qdrant |
| 6 | `/catalog-full` | Admin | ✅ KEEP | Sync catalog |
| 7 | `/warranty-registered` webhook | B2C | ✅ KEEP | AI รู้สินค้าลูกค้า |
| 8 | `/member-motorcycle` | B2C | ✅ KEEP | AI แนะนำตรงรุ่น |
| 9 | `/member-assets` | B2C | ✅ KEEP | ลูกค้าถามประกัน |
| 10 | `/claim-create` | B2C | 🔄 MODIFY → `/claim-manual-create` | เปลี่ยนเป็น manual claim จากแชท |
| 11 | `/claim-status` | B2C | ✅ KEEP | เช็คสถานะเคลม |
| 12 | `/claim-status-changed` webhook | B2C | ✅ KEEP | แจ้งลูกค้า FB/IG |
| 13 | `/transfer-eligibility` | B2C | ✅ KEEP | AI เช็คสิทธิ์โอน |
| 14 | `/profile-updated` webhook | B2C | ✅ KEEP | Sync profile |
| 15 | `/member-registered` webhook | B2C | ✅ KEEP | Cross-link |
| 16 | `/distributor-list` | B2B | ✅ KEEP | AI หาตัวแทน |
| 17 | `/distributor-notify` | B2B | ✅ KEEP | LINE push แจ้ง lead |
| 18 | `/distributor-debt` | B2B | ❌ REMOVE | ข้อมูลหนี้เป็นความลับ (finance_confidential) |
| 19 | `/distributor-pricing` | B2B | ❌ REMOVE | ราคา dealer-tier เป็นความลับ |
| 20 | `/b2b-dashboard-stats` | B2B | ❌ REMOVE | B2B internal, admin ดูใน WP |
| 21 | `/dunning-smart-message` | B2B | ❌ REMOVE | ทวงหนี้ B2B internal |
| 22 | `/order-status-changed` webhook | B2B | ❌ REMOVE | B2B LINE ecosystem |
| 23 | `/b2b-order-created` webhook | B2B | ❌ REMOVE | B2B internal |
| 24 | `/distributor-payment-history` | B2B | ❌ REMOVE | ข้อมูลการเงินเป็นความลับ |
| 25 | `/invoice-image` | B2B | ❌ REMOVE | ตัวแทนมี LINE Flex invoice อยู่แล้ว |
| 26 | `/brand-voice-submit` | Admin | ✅ KEEP | FB/IG → brand_voice |
| 27 | `/kb-suggest` | Admin | ✅ KEEP | KB suggestion loop |
| 28 | `/kb-updated` webhook | Admin | ✅ KEEP | Trigger Qdrant sync |
| 29 | `/inventory-changed` webhook | Admin | ✅ KEEP | สินค้าหมด AI ไม่แนะนำ |
| 30 | `/moto-catalog-changed` webhook | Admin | ✅ KEEP | Refresh moto cache |
| 31 | `/moto-catalog` | Admin | ✅ KEEP | AI ดึง brands/models |
| 32 | `/dashboard-inject-metrics` | Admin | ✅ KEEP | FB/IG metrics → DINOCO |
| 33 | `/fb-ig-sales-attribution` | Admin | 🔄 MODIFY → `/lead-attribution` | DINOCO ไม่ขายตรง วัด lead conversion แทน |
| 34 | `/finance-summary` | Admin | ❌ REMOVE | ข้อมูลการเงินเป็นความลับ |
| 35 | `/bank-info` | Admin | ❌ REMOVE | DINOCO ไม่ขายตรง ไม่มี bank info สำหรับลูกค้า |
| 36 | `/product-demand-signal` | Admin | ✅ KEEP | R&D data |
| 37 | `/lead-referral` | New | 🔄 MODIFY → merged into `/lead-create` | รวมเข้า lead pipeline |
| 38 | `/chat-summary` | New | 🔄 MODIFY → merged into `/brand-voice-submit` | ใช้ brand-voice-submit แทน |

### Summary:

```
Original 38 endpoints:
  ✅ KEEP:    22 endpoints
  🔄 MODIFY:   4 endpoints (claim-create, fb-ig-sales, lead-referral, chat-summary)
  ❌ REMOVE:  10 endpoints (retailer-specific + confidential)
  + ➕ ADD:    9 new endpoints (Lead Follow-up + Manual Claim)

After cleanup: 31 endpoints (22 kept + 4 modified/merged + 9 new - 4 merged = 31)
```

---

## Part 10: Updated Phase Plan

### Phase 1 (Week 1-2): Core Chat + Lead Pipeline Foundation

```
สิ่งที่ต้องทำ:
1. Deploy OpenClaw Docker (Agent + Dashboard + MongoDB)
2. ตั้งค่า Meta webhook (FB Page + IG Business)
3. Configure MCP Bridge connection (API key exchange)
4. Sync KB: WP /kb-export → Qdrant
5. Sync Catalog: WP /catalog-full → OpenClaw product cache
6. Customize AI prompt: "DINOCO เป็นผู้ผลิต ไม่ขายตรง แนะนำตัวแทนเสมอ"
7. Configure MCP tools: product-lookup, dealer-lookup, kb-search
8. ★ สร้าง Lead Follow-up Pipeline (MongoDB collection + cron jobs)
9. ★ สร้าง /lead-create, /lead-update endpoints
10. ★ สร้าง /distributor-notify endpoint (LINE push)
11. ★ สร้างน้องกุ้งมะยม (Lead Follow-up Agent #15)
12. Customize CRM Pipeline stages (manufacturer flow)

ผลลัพธ์:
  ✅ Admin ตอบแชท FB/IG ได้
  ✅ AI แนะนำสินค้า + หาตัวแทน
  ✅ น้องกุ้งแจ้งตัวแทนอัตโนมัติ (LINE push)
  ✅ น้องกุ้งติดตาม lead ทุกขั้นตอน
  ✅ Lead Follow-up Dashboard
```

### Phase 2 (Week 3-4): Manual Claim + Intelligence

```
สิ่งที่ต้องทำ:
1. ★ สร้าง Manual Claim Flow (MongoDB collection + state machine)
2. ★ สร้าง /claim-manual-create, /claim-manual-update, /claim-manual-status endpoints
3. ★ Repurpose Document AI → Claim Photo Analysis (Vision AI)
4. ★ สร้าง Admin Claim Review UI ใน OpenClaw Dashboard
5. เปิด Lead Scoring + Churn Prediction
6. เปิดน้องกุ้ง agents (Sales, Support, Scoring)
7. สร้าง warranty-check via chat (AI tool)
8. สร้าง /brand-voice-submit (FB/IG → WP brand_voice)
9. สร้าง /kb-suggest (KB self-improvement loop)

ผลลัพธ์:
  ✅ ลูกค้าเคลมผ่าน FB/IG ได้
  ✅ AI วิเคราะห์รูปสินค้ามีปัญหา
  ✅ Admin ตรวจ + เลือก Case A/B ใน Dashboard
  ✅ น้องกุ้งติดตามเคลมทุกขั้นตอน
  ✅ Lead scoring + churn alerts
```

### Phase 3 (Week 5-8): Advanced Integration + SLA

```
สิ่งที่ต้องทำ:
1. ★ สร้าง Dealer SLA Dashboard + /dealer-sla-report
2. ★ สร้าง /lead-attribution (วัด lead conversion)
3. สร้าง Customer Cross-Link (FB/IG → WP user)
4. Broadcast campaigns (FB/IG segments)
5. เปิดน้องกุ้งทั้ง 15 ตัว (14 เดิม + มะยม)
6. A/B Testing AI reply styles
7. OpenClaw metrics → WP Admin Dashboard integration
8. เตรียม integration กับ DINOCO Claim System (เมื่อเปิดใช้)

ผลลัพธ์:
  ✅ Dealer SLA scorecard
  ✅ Lead conversion tracking
  ✅ Full cross-platform customer view
  ✅ พร้อมเชื่อม DINOCO Claim System เมื่อเปิด
```

---

## Part 11: Summary

### Endpoints

| Category | Count |
|----------|-------|
| Existing (สร้างแล้ว) | 6 |
| Kept from original plan | 16 |
| Modified from original plan | 2 |
| New (Lead Follow-up) | 5 |
| New (Manual Claim) | 3 |
| New (Other) | 1 (customer-link) |
| **Removed** | **10** |
| **Total** | **31 endpoints** |

### Removed Endpoints (10 ตัว) — เหตุผล

| Endpoint | เหตุผลที่ลบ |
|----------|------------|
| `/distributor-debt` | ข้อมูลหนี้เป็นความลับ |
| `/distributor-pricing` | ราคา dealer-tier เป็นความลับ |
| `/b2b-dashboard-stats` | B2B internal |
| `/dunning-smart-message` | ทวงหนี้ B2B internal |
| `/order-status-changed` | B2B LINE ecosystem |
| `/b2b-order-created` | B2B internal |
| `/distributor-payment-history` | ข้อมูลการเงินเป็นความลับ |
| `/invoice-image` | ตัวแทนมี LINE Flex อยู่แล้ว |
| `/finance-summary` | ข้อมูลการเงินเป็นความลับ |
| `/bank-info` | DINOCO ไม่ขายตรง |

### New Features (DINOCO-specific, ไม่มีใน OpenClaw template)

| Feature | ทำไมสำคัญ |
|---------|----------|
| **★ Lead Follow-up Pipeline** | Core differentiator — น้องกุ้งติดตามทุกขั้นตอน ไม่ใช่แค่ส่ง lead แล้วจบ |
| **★ Manual Claim via Chat** | ลูกค้าเคลมผ่าน FB/IG ได้ ก่อนระบบ Auto Claim เปิด |
| **★ Claim Photo Analysis** | Vision AI ช่วย admin วิเคราะห์ปัญหาเบื้องต้น |
| **★ Dealer SLA Tracking** | วัดคุณภาพตัวแทน — ใครเร็ว ใครช้า ใคร convert ดี |
| **★ น้องกุ้งมะยม (Agent #15)** | AI agent ใหม่ เฉพาะ follow-up + SLA tracking |
| **★ Manufacturer CRM Pipeline** | 8-stage pipeline เฉพาะผู้ผลิต (ไม่ใช่ retail pipeline) |
| **★ Lead Attribution** | วัด ROI: FB/IG → lead → dealer → conversion (แทน sales attribution) |

### Key Architectural Decisions (Updated)

| Decision | Rationale |
|----------|-----------|
| **LINE ยังอยู่ใน WordPress 100%** | B2B flow ซับซ้อนเกิน |
| **FB/IG 100% ใน OpenClaw** | Meta Graph API |
| **MCP Bridge เป็นตัวเชื่อม** | 6 endpoints เดิม + 25 ใหม่ = 31 ทั้งหมด |
| **MongoDB ≠ MySQL** | ไม่ merge DB — API sync เท่านั้น |
| **ข้อมูลการเงิน/หนี้ ห้ามส่งออกนอก WP** | ★ NEW — ตาม finance_confidential policy |
| **DINOCO = ผู้ผลิต ไม่ใช่ร้านค้า** | ★ NEW — ไม่มี bank info, ไม่มี retail invoice, แนะนำตัวแทนเสมอ |
| **Lead Follow-up = core flow** | ★ NEW — ไม่ใช่แค่ส่ง lead แล้วจบ ต้องติดตามจนปิด |
| **Manual Claim ก่อน Auto Claim** | ★ NEW — ระบบเคลมผ่านแชทใช้ได้ทันที ก่อน Claim System เปิด |
| **น้องกุ้งสั่งงานเคลมได้** | ★ NEW — AI guide ลูกค้าผ่านทุกขั้นตอนเคลม |
