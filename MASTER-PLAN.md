# DINOCO x OpenClaw — Master Integration Plan (FINAL)

> Created: 2026-03-29
> Updated: 2026-03-30 — Added Phase 0, Timeline v3, Fullstack Review Findings, Cost Estimation
> Status: FINAL — Single source of truth for the entire integration project
> Supersedes: INTEGRATION-ARCHITECTURE.md (detailed specs), shimmering-floating-crane.md (initial plan)

---

## 0. Phase 0 — ทำก่อนเขียนโค้ดแม้แต่บรรทัดเดียว

> ⚠️ **Meta App Review เป็น Hard Blocker ที่ใช้เวลา 1-4 สัปดาห์**
> ถ้าไม่ submit ก่อน → Phase 1A ทั้งหมดถูก block

### ทำทันที (วันที่ 1)

| # | งาน | รายละเอียด | เวลา |
|---|-----|-----------|------|
| 0.1 | **Submit Meta App Review** | ขอ permissions: `pages_messaging`, `pages_manage_metadata`, `instagram_manage_messages` + อธิบาย use case + screencast | 0.5 วัน |
| 0.2 | **IG Business Account** | ตรวจว่า DINOCO Instagram เป็น Business Account ที่ link กับ Facebook Page แล้ว ถ้ายัง → แปลงก่อน | 0.5 วัน |
| 0.3 | **Setup Hetzner VPS** | สั่ง VPS 4GB RAM ขั้นต่ำ (CX31 ~7 EUR/เดือน) + Docker + basic networking | 0.5 วัน |
| 0.4 | **Setup domain + SSL** | ชี้ subdomain (ai.dinoco.co.th) → Hetzner IP + initial SSL cert (manual ครั้งแรก) | 0.5 วัน |
| 0.5 | **API key exchange** | สร้าง MCP Bridge API key ใน WordPress + ตั้ง API_SECRET_KEY สำหรับ OpenClaw | 0.5 วัน |
| 0.6 | **Create Telegram Bot** | สำหรับ admin alerts + daily summary | 0.5 วัน |

**ระหว่างรอ Meta App Review (1-4 สัปดาห์):**
- ใช้ test user (admin/developer ของ FB App ไม่เกิน 25 คน) ทดสอบ flow ได้
- เขียนโค้ด AI + tools + cache ทั้งหมดได้เลย ทดสอบผ่าน test user

### Hard Blockers ที่ต้องรู้

| Blocker | ผลกระทบ | วิธีรับมือ |
|---------|---------|-----------|
| **Meta App Review 1-4 สัปดาห์** | FB/IG webhook ใช้ไม่ได้จนกว่า approve | Submit วันแรก ระหว่างรอเขียนโค้ด+ทดสอบผ่าน test user |
| **IG DM ส่ง template/card ไม่ได้** | Instagram รองรับแค่ text + image + quick reply | ออกแบบ 2 แบบ: FB = Generic Template, IG = text+image fallback |
| **Meta 24hr Messaging Window** | ส่งข้อความหลัง 24 ชม. ไม่ได้ ถ้าลูกค้าไม่ตอบ | Message Tags ใช้กับ lead follow-up **ไม่ได้** (Meta จะแบน) → **ต้องเก็บเบอร์โทร/LINE ลูกค้าตั้งแต่ต้น** |
| **OTN ต้อง App Review อีกรอบ** | One-Time Notification ต้องขอ permission `one_time_notification_tokens` | Submit พร้อม App Review แรก |
| **LINE Push API เสียเงิน** | Workflow 4 (AI ตอบ LINE group) replyToken หมดอายุ 30 วิ → ต้องใช้ Push | เช็ค LINE OA plan ปัจจุบัน ถ้า free plan = Push มี quota จำกัด |

---

## 0.5 Platform Limitations (ข้อจำกัดที่ต้องออกแบบรอบ)

### Facebook Messenger vs Instagram DM

| ฟีเจอร์ | Facebook Messenger | Instagram DM |
|---------|-------------------|-------------|
| Text message | ✅ | ✅ |
| Image message | ✅ | ✅ |
| Generic Template (card+image+button) | ✅ | ❌ **ไม่รองรับ** |
| Quick Reply buttons | ✅ | ✅ (จำกัด 13 ปุ่ม) |
| Persistent Menu | ✅ | ❌ |
| Webview | ✅ | ❌ |
| File attachment | ✅ | ❌ |
| 24hr messaging window | ✅ ต้องปฏิบัติ | ✅ ต้องปฏิบัติ |
| Message Tags | ✅ (จำกัด use case) | ❌ **ไม่รองรับ** |
| One-Time Notification | ✅ (ต้อง App Review) | ❌ **ไม่รองรับ** |

**ผลกระทบต่อ Workflow + ต้องออกแบบ Fallback:**

| Workflow | Facebook Messenger | Instagram DM | Fallback Design |
|----------|-------------------|-------------|-----------------|
| **WF1 แนะนำสินค้า** | Generic Template (รูป+ปุ่ม+ราคา) | ❌ template ไม่ได้ → ส่งรูป 1 รูป + text ราคา + Quick Reply "สนใจรุ่นไหน?" | AI ต้องเช็ค platform → เลือก format |
| **WF2 มะยม follow-up** | OTN ได้ (ถ้า approve) | ❌ OTN ไม่รองรับ IG | **ต้องเก็บเบอร์โทร/LINE ตั้งแต่ WF1** → follow-up ผ่าน SMS/LINE แทน |
| **WF3 เคลมแมนนวล** | Quick Reply เลือกอาการ | Quick Reply ได้ (13 ปุ่ม max) | ใช้ได้ทั้ง 2 platform |
| **WF7 Auto-reply** | Generic Template + text | Text + image แยก | AI ต้องเช็ค platform |
| **WF8 Sentiment alert** | Text only | Text only | เหมือนกัน |

**Design Rule สำหรับ AI:**
```
ก่อนส่งข้อความ → เช็ค platform:
  if (platform === "facebook") → ส่ง Generic Template (card + image + button)
  if (platform === "instagram") → ส่งรูปก่อน → text ตามหลัง → Quick Reply ถ้าจำเป็น
```

**WF2 Follow-up Strategy (24hr window) — COMPLETE DESIGN:**

### หลักการหลัก: ใช้ FB/IG เป็น "ประตูรับ" แล้วดึงลูกค้าไปช่องทางที่ควบคุมได้ (LINE/เบอร์โทร) ให้เร็วที่สุด

### A. จังหวะเก็บข้อมูลติดต่อ (ต้อง Natural)
```
จังหวะทอง = ตอนที่ AI กำลังจะส่งต่อตัวแทน

AI: "มีค่ะ! แคชบาร์ ADV 350 รุ่น PRO ราคา 5,200 บาท
     ตัวแทนใกล้บ้านพี่อยู่ที่ ร้าน ABC จ.เชียงใหม่

     กุ้งมะยมขอเบอร์โทรพี่ได้ไหมคะ?
     จะให้ตัวแทนโทรนัดติดตั้งให้เลย
     + ส่งรูปสินค้าจริงและใบเสนอราคาทาง LINE ด้วยค่ะ 🙏"

→ ลูกค้าให้เบอร์ = WIN (follow-up ได้ตลอด)
→ ลูกค้าไม่ให้ = ไม่ดัน ตอบว่า "ได้ค่ะ ทักมาได้ตลอดนะคะ"
```

### B. Follow-Up Method Selection (อัตโนมัติ)
```
function selectFollowUpMethod(lead):

  1. Window ยังเปิด (< 24 ชม.) → ใช้ FB/IG messaging ปกติ
  2. Window ปิดแล้ว:
     ├── มี LINE ID     → LINE (ดีสุด ไม่มี 24hr restriction)
     ├── มี OTN token   → OTN ส่ง 1 ครั้ง (FB only, IG ไม่มี)
     ├── มีเบอร์โทร    → SMS
     └── ไม่มีอะไรเลย  → admin_manual (โทรตัวแทนถาม)
```

### C. Follow-Up Timeline
```
D+0   แนะนำตัวแทน + ขอเบอร์/LINE         | FB/IG (ใน window)
D+0   แจ้งตัวแทน (LINE Flex + ปุ่ม action) | LINE B2B
D+1   ถามตัวแทน: ติดต่อลูกค้าหรือยัง?     | LINE B2B
D+3   ถามลูกค้า: ได้เรื่องไหม?             | LINE → SMS → OTN → admin
D+7   ถ้าสั่งแล้ว: ของมาถึงหรือยัง?        | LINE → SMS
D+10  ถามเรื่องติดตั้ง                     | LINE → SMS
D+30  After-sale satisfaction               | LINE → SMS

สำคัญ: D+3 ขึ้นไป ห้ามส่งผ่าน FB/IG เด็ดขาด (window หมดแน่นอน)
```

### D. Window Management — "Keep Window Open" (ถูกกฎ Meta)
```
เมื่อ window เหลือ < 2 ชม. (CLOSING_SOON) → ส่ง 1 ข้อความสุดท้ายที่มี VALUE:

✅ ส่งรูปสินค้าจริง + ถามความเห็น:
   "นี่คือรูป DN-CB500 ที่ติดตั้งกับ CB500X ค่ะ [รูป]
    สีนี้เข้ากับรถพี่ไหมคะ? มีสีดำด้านกับโครเมียมค่ะ"
   → ลูกค้าตอบเรื่องสี = window reset 24 ชม. ✅

✅ ส่งข้อมูลตัวแทนละเอียด + ถามวันที่สะดวก:
   "ร้าน ABC เปิด 9:00-18:00 ค่ะ [แผนที่]
    พี่สะดวกไปวันไหนดีคะ?"
   → ลูกค้าบอกวัน = window reset ✅

❌ ห้าม: "ตอบ 1 เพื่อยืนยัน" (spam)
❌ ห้าม: ส่งทุก 23 ชม. เพื่อ keep window (Meta detect ได้)
❌ ห้าม: "ตอบกลับรับโปรโมชั่น" (incentivized reply ผิดกฎ)
❌ ห้าม: ส่งมากกว่า 2 ข้อความถ้าลูกค้าไม่ตอบ
```

### E. OTN Strategy (Facebook เท่านั้น)
```
เงื่อนไข: ต้องผ่าน Meta App Review (permission: one_time_notification_tokens)

Flow:
1. ลูกค้าทัก FB → AI ตอบ → ขอเบอร์/LINE
2. ถ้าลูกค้าไม่ให้ → ก่อน window หมดส่ง:
   "พี่คะ กุ้งมะยมขออนุญาตส่งอัพเดทเรื่องสินค้าให้พี่อีก 1 ครั้งนะคะ"
   [ปุ่ม: "อนุญาต" ← OTN opt-in]
3. ลูกค้ากด → ได้ OTN token
4. ใช้ OTN ที่ D+3:
   "ตัวแทนติดต่อพี่แล้วหรือยังคะ? ตอบกลับมาได้เลยนะคะ"
   → ถ้าลูกค้าตอบ = window reset → เก็บเบอร์ได้อีกรอบ
```

### F. IG ไม่มี OTN — Plan B
```
Instagram ข้อจำกัดมากกว่า FB:
- ไม่มี OTN, ไม่มี Message Tags, ไม่มี Template

Plan B สำหรับ IG:
1. เน้นเก็บเบอร์/LINE ตั้งแต่แรก (หนักกว่า FB)
2. ก่อน window หมด → ส่ง "สรุป" พร้อมเบอร์ตัวแทน
3. หลัง window หมด:
   a. รอลูกค้าทักกลับเอง
   b. Post IG Story/Reels ดึงลูกค้ากลับ (indirect)
   c. Mark "lost_contact" หลัง 14 วัน
```

### G. Admin Fallback Dashboard
```
┌──────────────────────────────────────────────────────┐
│ 🔴 Leads ที่ต้องจัดการด่วน (3)                        │
├──────────────────────────────────────────────────────┤
│ สมชาย (IG) — แคชบาร์ ADV — ไม่มีข้อมูลติดต่อ       │
│   Window: หมด | [โทรตัวแทนถาม] [ปิด lead]            │
│                                                       │
│ สมหญิง (FB) — กล่องข้าง NX500 — มีเบอร์             │
│   Window: หมด | OTN: ใช้แล้ว | SMS ส่ง D+3 ไม่ตอบ  │
│   [โทรลูกค้า] [โทรตัวแทน] [ปิด lead]                │
└──────────────────────────────────────────────────────┘
```

### H. Lead Contact State Machine
```
lead_state = {
  messaging_channel: "fb" | "ig",
  window_status: "open" | "closing_soon" | "closed",
  contact_info: {
    phone: "08x-xxx-xxxx" | null,
    line_id: "@xxxxx" | null,
    has_otn_token: true | false (FB only),
    otn_token_used: true | false
  },
  follow_up_method: "fb_ig" | "otn" | "line" | "sms" | "admin_manual"
}
```

### I. Safety Rules (ห้ามฝ่าฝืนเด็ดขาด)
```
1. ห้ามส่งข้อความ FB/IG หลัง window หมด (ยกเว้น OTN)
2. ห้ามใช้ Message Tags กับ lead follow-up
3. ห้ามส่ง > 2 ข้อความติดกันถ้าลูกค้าไม่ตอบ
4. ห้าม incentivize reply ("ตอบรับโปรโมชั่น")
5. ห้ามส่ง OTN opt-in ซ้ำ (ขอได้ 1 ครั้ง/session)
6. ทุก follow-up ต้องมี value จริง (ไม่ใช่ข้อความกลางๆ)
```

### LINE API Limitations

| ฟีเจอร์ | Reply API (ฟรี) | Push API (มี quota) |
|---------|----------------|-------------------|
| ตอบข้อความ | ✅ ภายใน 30 วินาที | ✅ ตอนไหนก็ได้ |
| Flex Message | ✅ | ✅ |
| ค่าใช้จ่าย | ฟรี | ตาม plan (free plan ~500 ข้อความ/เดือน) |

**ผลกระทบต่อ Workflow 4 (AI ตอบ LINE group):**
- WordPress รับ webhook → forward ไป OpenClaw → AI คิด 15-30 วินาที → **replyToken หมดอายุ 30 วินาที**
- **ต้องใช้ Push API** → มี cost
- หรือ WordPress ตอบ "กำลังเช็คค่ะ" ทันที (Reply API ฟรี) แล้ว OpenClaw ส่ง Push ตามมา

---

## 0.6 Cost Estimation

| รายการ | ต่อเดือน | หมายเหตุ |
|--------|---------|---------|
| **Hetzner VPS** (CX31 4GB RAM) | ~250 บาท (~7 EUR) | Agent + Dashboard + OpenClaw + MongoDB + Nginx |
| **Gemini Flash** (chat primary) | 0 - 500 บาท | Free tier: 15 RPM, 1M tokens/day ถ้าลูกค้า 50+ คน/วัน ต้อง paid plan |
| **Claude Sonnet** (chat fallback) | 0 - 1,000 บาท | ใช้เมื่อ Gemini fail เท่านั้น ~$3/1M input + $15/1M output |
| **Free AI** (background analytics) | 0 บาท | OpenRouter + SambaNova + Gemini free tier |
| **MongoDB Atlas M0** | 0 บาท | 512MB storage **จะเต็มใน 3-6 เดือน** ถ้าเก็บทุกข้อความ |
| **MongoDB Atlas M2** (ถ้า upgrade) | ~350 บาท (~$9) | 2GB storage เพียงพอ 1-2 ปี |
| **Qdrant Cloud** | 0 บาท | Free tier 1GB เพียงพอสำหรับ KB |
| **LINE Push API** | ตาม plan | Free plan ~500 push/เดือน ถ้าเกิน ต้อง upgrade |
| **Domain SSL** | 0 บาท | Let's Encrypt |
| **Uptime Robot** | 0 บาท | Free tier 50 monitors |
| **รวมขั้นต่ำ** | **~250 บาท/เดือน** | VPS เท่านั้น ถ้า AI ใช้ free tier หมด |
| **รวมถ้า scale** | **~2,000-3,000 บาท/เดือน** | VPS + paid Gemini + MongoDB M2 |

### Gemini Free Tier Limits (ต้องรู้!)

| Plan | RPM (requests/min) | TPM (tokens/min) | RPD (requests/day) |
|------|-------|------|------|
| **Free** | 15 | 1,000,000 | 1,500 |
| **Pay-as-you-go** | 2,000 | 4,000,000 | ไม่จำกัด |

**15 RPM = ลูกค้าพร้อมกัน ~15 คน** ถ้ามากกว่า → queue/fallback to Claude

---

## 0.7 สิ่งที่แผนยังขาด (จาก Fullstack Review)

### 1. Error Handling Strategy

```
ทุก external call ต้องมี circuit breaker:
  MCP Bridge fail 3 ครั้งใน 5 นาที → หยุดเรียก + alert admin + fallback
  Gemini fail → fallback Claude Sonnet
  Claude fail → fallback "ขอเช็คข้อมูลกับทีมงานก่อนนะคะ" + alert
  MongoDB down → queue ข้อความ + retry 3 ครั้ง
```

### 2. Logging Strategy

```
Production ต้อง structured logging:
  { timestamp, level, requestId, sourceId, platform, action, duration, error }
  ใช้ winston หรือ pino แทน console.log
  Docker logs → rotate + backup daily
```

### 3. Monitoring

```
External uptime check:
  Uptime Robot (free) ping /health ทุก 5 นาที → Telegram alert ถ้า down

Internal health check:
  docker-compose healthcheck มีอยู่แล้ว ✅
  เพิ่ม: MCP Bridge health + MongoDB health + Qdrant health
```

### 4. Testing Strategy (ขั้นต่ำ)

```
Unit tests (ต้องมี):
  - AI format adapter (Gemini ↔ OpenAI ↔ Claude format conversion)
  - Lead Pipeline state machine transitions (18 states × valid/invalid transitions)
  - Manual Claim state machine (16 states)
  - MCP Bridge response parsing
  - PII masking + prompt injection filter

Integration tests (ควรมี):
  - MCP Bridge → WordPress → response ถูกต้อง
  - AI + tool calling → product lookup → format response

E2E tests (Phase 3):
  - ลูกค้าทัก FB → AI ตอบ → แนะนำตัวแทน → lead created
```

### 5. CI/CD

```
GitHub Actions:
  on push to main:
    - SSH to Hetzner
    - docker compose pull && docker compose up -d --build
    - health check wait 30s
    - Telegram notify: "Deployed successfully"
```

### 6. Development Environment

```
Local development:
  - docker-compose.dev.yml (MongoDB + Qdrant local)
  - Mock MCP Bridge (static JSON responses สำหรับ product/dealer/warranty)
  - Meta Graph API Explorer สำหรับทดสอบ webhook
  - .env.development กับ test API keys
```

### 7. Database Migration Strategy

```
MongoDB (schemaless):
  - ทุก query ต้อง handle missing fields: field?.value || default
  - Migration script folder: openclawminicrm/migrations/
  - Version tracking: db.meta.findOne({ key: "schema_version" })

WordPress:
  - ACF field groups export/import สำหรับ new CPT fields
```

### 8. Graceful Degradation (ถ้าเวลาไม่พอ ตัดอะไรออกก่อน)

```
Priority 1 (MVP - ต้องมี):
  ✅ FB/IG chat + AI ตอบสินค้า/ตัวแทน
  ✅ Lead creation + LINE push ถึงตัวแทน

Priority 2 (สัปดาห์ถัดไป):
  ⬜ Manual Claim flow
  ⬜ Auto-reply 5 นาที

Priority 3 (ตัดได้ถ้าเวลาไม่พอ):
  ⬜ น้องกุ้งมะยม follow-up (admin follow up manual แทน)
  ⬜ 14 AI agents customization (ใช้ default ไปก่อน)
  ⬜ Dashboard branding (ใช้ theme เดิม)
  ⬜ 3D Office (สวยแต่ไม่ช่วยขาย)
```

---

## 1. Vision

เมื่อโปรเจกต์นี้เสร็จสมบูรณ์ DINOCO จะมีระบบ AI-powered customer engagement ครบวงจร: ลูกค้าทักผ่าน Facebook Page หรือ Instagram DM ก็จะได้รับคำตอบจาก AI ที่ดึงข้อมูลสินค้า/ตัวแทนจริงจาก WordPress, ถูกส่งต่อให้ตัวแทนจำหน่ายผ่าน LINE push, มีน้องกุ้งมะยม (AI Agent #15) ติดตามทุกขั้นตอนจนลูกค้าพอใจหรือเข้าสู่ระบบเคลม, ส่วน B2B ทั้งหมด (LINE bot, LIFF, debt, Flash Express) ยังอยู่ใน WordPress เหมือนเดิม 100% โดยข้อมูลการเงิน/หนี้ไม่มีทางหลุดออกนอก WordPress เด็ดขาด ระบบทั้งสองเชื่อมกันผ่าน MCP Bridge REST API (36 endpoints) และ admin มี 2 dashboard: OpenClaw สำหรับ FB/IG chat + CRM + Lead pipeline, DINOCO WordPress สำหรับ B2B + Finance + Warranty + Brand Voice โดยเฟส 3 จะรวมเข้า DINOCO Admin Dashboard เป็นจุดเดียว

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CUSTOMER CHANNELS                               │
│                                                                         │
│  Facebook Page        Instagram DM           LINE OA                    │
│      |                    |                     |                        │
│      v                    v                     v                        │
│  Meta Graph API      Meta Graph API       LINE Messaging API            │
│      |                    |                     |                        │
│      └────────┬───────────┘                     |                        │
│               |                                 |                        │
│               v                                 v                        │
│  ┌────────────────────────────┐   ┌─────────────────────────────────┐   │
│  │  OpenClaw Agent (Docker)   │   │  DINOCO WordPress               │   │
│  │  Hetzner VPS, port 3000    │   │  (Existing production server)   │   │
│  │                            │   │                                 │   │
│  │  * FB/IG webhook receiver  │   │  * B2B LINE Bot (Snippet 1-15) │   │
│  │  * AI Chat (Gemini Flash   │   │  * LIFF E-Catalog              │   │
│  │    primary + Claude Sonnet │   │  * Warranty Registration       │   │
│  │    fallback)               │   │  * Claim System (not active)   │   │
│  │  * Sentiment & Intent      │   │  * Finance Dashboard           │   │
│  │  * Lead Scoring (0-100)    │   │  * Brand Voice Pool            │   │
│  │  * Customer Memory         │   │  * Admin Dashboard             │   │
│  │  * Lead Follow-up Pipeline │   │  * Manual Invoice System       │   │
│  │  * Manual Claim via Chat   │   │  * GitHub Webhook Sync         │   │
│  │  * 15 AI Agents (cron)     │   │  * MCP Bridge (REST API)       │   │
│  │  * Human Handoff           │   │  * KB Trainer Bot              │   │
│  │  * Smart Routing           │   │  * AI Control Module (disable) │   │
│  └────────────┬───────────────┘   └──────────────┬──────────────────┘   │
│               |                                  |                       │
│               |     MCP Bridge REST API          |                       │
│               | <==============================> |                       │
│               |   /wp-json/dinoco-mcp/v1/*       |                       │
│               |   36 endpoints (6 exist + 25 new)|                       │
│               |                                  |                       │
│  ┌────────────v───────────────┐   ┌──────────────v──────────────────┐   │
│  │  MongoDB (Docker)          │   │  MySQL (WordPress)              │   │
│  │  * messages                │   │  * serial_number CPT            │   │
│  │  * customers               │   │  * claim_ticket CPT             │   │
│  │  * leads (NEW)             │   │  * distributor CPT              │   │
│  │  * manual_claims (NEW)     │   │  * b2b_order CPT                │   │
│  │  * follow_ups (NEW)        │   │  * ai_knowledge CPT             │   │
│  │  * analytics               │   │  * brand_voice CPT              │   │
│  │  * user_skills             │   │  * product_catalog              │   │
│  └────────────────────────────┘   │  * dinoco_moto_brands/models    │   │
│                                   └─────────────────────────────────┘   │
│  ┌────────────────────────────┐   ┌─────────────────────────────────┐   │
│  │  OpenClaw Dashboard        │   │  DINOCO Admin Dashboard         │   │
│  │  Next.js, port 3001        │   │  WordPress Shortcode            │   │
│  │                            │   │                                 │   │
│  │  * Chat UI (FB/IG)        │   │  * B2B Orders + Finance         │   │
│  │  * CRM Pipeline (8-stage) │   │  * Warranty Claims              │   │
│  │  * Lead Follow-up View    │   │  * Inventory / Moto Manager     │   │
│  │  * Manual Claim Admin UI  │   │  * Brand Voice Pool             │   │
│  │  * Dealer SLA Scorecard   │   │  * Service Center               │   │
│  │  * AI Agent Room          │   │  * User Management              │   │
│  │  * Analytics (Recharts)   │   │  * GitHub Sync                  │   │
│  └────────────────────────────┘   └─────────────────────────────────┘   │
│                                                                         │
│  ┌────────────────────────────┐   ┌─────────────────────────────────┐   │
│  │  Qdrant Cloud (Free 1GB)  │   │  Telegram Bot (Alerts)          │   │
│  │  * Knowledge Base vectors │   │  * Sentiment red alerts         │   │
│  │  * Synced from WP KB      │   │  * Hot lead notifications       │   │
│  └────────────────────────────┘   │  * Daily summary 20:00 BKK     │   │
│                                   └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘

KEY SEPARATION:
  LINE = WordPress 100% (B2B flow too complex to migrate)
  FB/IG = OpenClaw 100% (Meta Graph API + AI Chat)
  Data bridge = MCP REST API only (no DB merge)
  Finance/Debt data = NEVER leaves WordPress
```

---

## 3. Feature List (Complete)

### 3.1 B2C Member System

| # | Feature | System | Priority | Status |
|---|---------|--------|----------|--------|
| 1 | LINE Login (OAuth2) | WordPress | -- | DONE (existing) |
| 2 | Member Dashboard (card, QR, assets) | WordPress | -- | DONE (existing) |
| 3 | Warranty Registration (QR/Serial) | WordPress | -- | DONE (existing) |
| 4 | Warranty Claim Auto (System) | WordPress | P3 | DONE but NOT ACTIVE |
| 5 | Transfer Warranty | WordPress | -- | DONE (existing) |
| 6 | Edit Profile (cover/avatar, Mileage Rank) | WordPress | -- | DONE (existing) |
| 7 | PDPA Consent | WordPress | -- | DONE (existing) |
| 8 | Global App Menu (bottom nav, QR scanner) | WordPress | -- | DONE (existing) |
| 9 | MCP Bridge REST API | WordPress | P0 | PARTIAL (6/36 endpoints) |
| 10 | Manual Claim via Chat | OpenClaw + MCP | P1 | TODO |
| 11 | Warranty Check via Chat | OpenClaw (MCP tool) | P1 | TODO |

### 3.2 B2B Distributor System

| # | Feature | System | Priority | Status |
|---|---------|--------|----------|--------|
| 12 | Core Utilities & LINE Flex (Snippet 1) | WordPress | -- | DONE (existing) |
| 13 | LINE Webhook Gateway (Snippet 2) | WordPress | -- | DONE (existing) |
| 14 | LIFF E-Catalog REST API (Snippet 3) | WordPress | -- | DONE (existing) |
| 15 | LIFF E-Catalog Frontend (Snippet 4) | WordPress | -- | DONE (existing) |
| 16 | B2B Admin Dashboard (Snippet 5) | WordPress | -- | DONE (existing) |
| 17 | Discount Mapping (Snippet 6) | WordPress | -- | DONE (existing) |
| 18 | 13 Cron Jobs (Snippet 7) | WordPress | -- | DONE (existing) |
| 19 | Distributor Ticket View (Snippet 8) | WordPress | -- | DONE (existing) |
| 20 | Admin Control Panel (Snippet 9) | WordPress | -- | DONE (existing) |
| 21 | Invoice Image Generator (Snippet 10) | WordPress | -- | DONE (existing) |
| 22 | Customer LIFF Pages (Snippet 11) | WordPress | -- | DONE (existing) |
| 23 | Admin LIFF (Snippet 12) | WordPress | -- | DONE (existing) |
| 24 | Debt Transaction Manager (Snippet 13) | WordPress | -- | DONE (existing) |
| 25 | Order State Machine (Snippet 14) | WordPress | -- | DONE (existing) |
| 26 | Custom Tables & JWT (Snippet 15) | WordPress | -- | DONE (existing) |

### 3.3 Chat & Communication

| # | Feature | System | Priority | Status |
|---|---------|--------|----------|--------|
| 27 | Facebook Page Chat (webhook + UI) | OpenClaw | P0 | TODO |
| 28 | Instagram DM Chat (webhook + UI) | OpenClaw | P0 | TODO |
| 29 | Multi-Panel Chat (4 windows) | OpenClaw | P0 | EXISTS in OpenClaw |
| 30 | AI Auto-Reply (5 min fallback) | OpenClaw | P1 | BLOCKED (aiReplyToMeta uses callLightAI, no tool calling) |
| 31 | AI Suggested Reply (button) | OpenClaw | P1 | EXISTS in OpenClaw |
| 32 | Human Handoff | OpenClaw | P1 | EXISTS in OpenClaw |
| 33 | Smart Routing (sales/support/claim) | OpenClaw | P1 | EXISTS, needs CLAIM route added |
| 34 | Broadcast (FB/IG segments) | OpenClaw | P3 | EXISTS in OpenClaw |
| 35 | LINE B2B Chat (bot toggle) | WordPress | -- | DONE (existing) |

### 3.4 CRM & Customer Intelligence

| # | Feature | System | Priority | Status |
|---|---------|--------|----------|--------|
| 36 | CRM Pipeline (8-stage manufacturer) | OpenClaw (custom) | P0 | TODO (must customize stages) |
| 37 | Lead Scoring (0-100) | OpenClaw | P1 | EXISTS in OpenClaw |
| 38 | Lead Follow-up Pipeline | OpenClaw + MongoDB + MCP | P0 | TODO (NEW BUILD) |
| 39 | Customer Memory (persistent) | OpenClaw | P1 | EXISTS in OpenClaw |
| 40 | Churn Prediction (3/7/30 day) | OpenClaw | P2 | EXISTS in OpenClaw |
| 41 | Cross-Platform Merge (LINE/FB/IG) | OpenClaw | P2 | EXISTS in OpenClaw |
| 42 | Customer Cross-Link (FB/IG to WP) | MCP Bridge | P2 | TODO |
| 43 | Member Rank (Mileage, 6 tier) | WordPress | -- | DONE (existing) |
| 44 | Appointment/Calendar | OpenClaw | P3 | EXISTS in OpenClaw |

### 3.5 AI & Analytics

| # | Feature | System | Priority | Status |
|---|---------|--------|----------|--------|
| 45 | AI Chat (product/dealer/KB) for FB/IG | OpenClaw (Gemini Flash + Claude Sonnet) | P0 | BLOCKED (must rewrite aiReplyToMeta) |
| 46 | AI Chat Analysis (sentiment/intent) | OpenClaw | P0 | EXISTS in OpenClaw |
| 47 | Claim Photo Analysis (Vision AI) | OpenClaw (repurpose Document AI) | P1 | TODO |
| 48 | Knowledge Base + RAG (Qdrant) | OpenClaw + WordPress (source) | P0 | TODO (sync script exists, not connected) |
| 49 | 15 AI Agents (14 existing + mayom) | OpenClaw | P1-P2 | PARTIAL (14 exist, need DINOCO customization + #15 new) |
| 50 | AI Cost Tracking | OpenClaw | P2 | EXISTS in OpenClaw |
| 51 | A/B Testing AI | OpenClaw | P3 | EXISTS in OpenClaw |
| 52 | Brand Voice / Sentiment (FB/IG feed) | Both (OpenClaw sends to WP via MCP) | P1 | TODO (endpoint needed) |
| 53 | AI Finance Analysis (Claude) | WordPress | -- | DONE (existing) |
| 54 | Admin Dashboard KPIs | WordPress | -- | DONE (existing) |
| 55 | Finance Dashboard (SVG Map, Claude AI) | WordPress | -- | DONE (existing) |
| 56 | Product Demand Signal | OpenClaw + MCP | P2 | TODO |

### 3.6 Infrastructure

| # | Feature | System | Priority | Status |
|---|---------|--------|----------|--------|
| 57 | Docker Deployment (Hetzner) | OpenClaw | P0 | TODO |
| 58 | SSL + Nginx Reverse Proxy | OpenClaw | P0 | TODO |
| 59 | GitHub Webhook Sync | WordPress | -- | DONE (existing) |
| 60 | RPi Print Server | WordPress | -- | DONE (existing) |
| 61 | Flash Express Integration | WordPress | -- | DONE (existing) |
| 62 | Telegram Bot (admin alerts) | OpenClaw | P2 | EXISTS in OpenClaw |

---

## 4. Integration Points (MCP Bridge Endpoints)

Base: `/wp-json/dinoco-mcp/v1/`
Auth: `X-API-Key` header validated against `wp_options['dinoco_mcp_api_key']`

### 4.1 EXISTS (6 endpoints -- built in `[System] DINOCO MCP Bridge`)

| # | Endpoint | Method | Purpose |
|---|----------|--------|---------|
| 1 | `/product-lookup` | POST | AI searches products by query/category |
| 2 | `/dealer-lookup` | POST | Find dealers near customer location |
| 3 | `/warranty-check` | POST | Check warranty status by serial number |
| 4 | `/kb-search` | POST | AI searches Knowledge Base |
| 5 | `/kb-export` | GET | Export all KB entries for Qdrant sync |
| 6 | `/catalog-full` | GET | Export complete product catalog |

### 4.2 NEW-P1 (11 endpoints -- Phase 1-2 must-haves)

| # | Endpoint | Method | Purpose |
|---|----------|--------|---------|
| 7 | `/distributor-list` | GET | All dealers with province for AI |
| 8 | `/distributor-notify` | POST | LINE push to dealer for lead referral |
| 9 | `/lead-create` | POST | Create lead record when dealer recommended |
| 10 | `/lead-update` | POST | Update lead status (contacted, waiting, etc.) |
| 11 | `/lead-list` | GET | List leads with filter by status/dealer |
| 12 | `/lead-followup-schedule` | GET | Pending follow-ups for cron |
| 13 | `/claim-manual-create` | POST | Create manual claim from chat (photos + symptoms) |
| 14 | `/claim-manual-update` | POST | Update manual claim status |
| 15 | `/claim-manual-status` | GET | Check manual claim status |
| 16 | `/brand-voice-submit` | POST | FB/IG comments to WP brand_voice |
| 17 | `/kb-suggest` | POST | Questions AI could not answer, suggest to KB |

### 4.3 NEW-P2 (8 endpoints -- Phase 2-3)

| # | Endpoint | Method | Purpose |
|---|----------|--------|---------|
| 18 | `/warranty-registered` | webhook | Notify OpenClaw when warranty registered |
| 19 | `/member-motorcycle` | GET | Customer's motorcycle for targeted recs |
| 20 | `/member-assets` | GET | Customer's warranty assets |
| 21 | `/claim-status` | GET | Check claim status |
| 22 | `/claim-status-changed` | webhook | Notify customer on FB/IG |
| 23 | `/transfer-eligibility` | GET | Check if warranty transfer possible |
| 24 | `/customer-link` | POST | Link FB/IG user to WP member |
| 25 | `/dealer-sla-report` | GET | Dealer SLA metrics |

### 4.4 NEW-P3 (6 endpoints -- Phase 3)

| # | Endpoint | Method | Purpose |
|---|----------|--------|---------|
| 26 | `/kb-updated` | webhook | Trigger Qdrant re-sync |
| 27 | `/inventory-changed` | webhook | Out-of-stock, AI stops recommending |
| 28 | `/moto-catalog-changed` | webhook | Refresh model cache |
| 29 | `/moto-catalog` | GET | AI gets brands/models/aliases |
| 30 | `/dashboard-inject-metrics` | POST | FB/IG metrics into DINOCO Dashboard |
| 31 | `/lead-attribution` | POST | Measure lead conversion (not sales) |

### 4.5 REMOVED (10 endpoints -- not needed for manufacturer)

| Endpoint | Reason |
|----------|--------|
| `/distributor-debt` | Financial data is confidential |
| `/distributor-pricing` | Dealer-tier pricing is confidential |
| `/b2b-dashboard-stats` | B2B internal, admin views in WP |
| `/dunning-smart-message` | Debt collection is B2B internal |
| `/order-status-changed` | B2B LINE ecosystem only |
| `/b2b-order-created` | B2B internal |
| `/distributor-payment-history` | Financial data is confidential |
| `/invoice-image` | Dealers have LINE Flex invoices |
| `/finance-summary` | Financial data is confidential |
| `/bank-info` | DINOCO does not sell direct to consumers |

---

## 4.6 Workflow ภาษาไทย (สำหรับรีวิว)

### Workflow 1: ลูกค้าถามสินค้าใน FB/IG

```
ลูกค้าทัก Facebook Page: "มีแคชบาร์สำหรับ ADV 350 ไหมครับ"
    │
    ▼
🤖 OpenClaw รับข้อความ → เก็บ MongoDB → วิเคราะห์ sentiment + intent
    │
    ▼
🤖 AI (Gemini Flash) เรียก tool: dinoco_product_lookup
    │  → POST /dinoco-mcp/v1/product-lookup { query: "แคชบาร์ ADV 350" }
    │  → WordPress ค้นหาใน catalog จริง
    │  → return: ชื่อ, ราคา, รูป, ประกัน, สต็อก
    │
    ▼
🤖 AI ตอบ: "มีค่ะ! แคชบาร์ ADV 350 รุ่น STD ราคา 3,500 บาท
             รุ่น PRO ราคา 5,200 บาท รับประกัน 3 ปี
             ส่งรูปให้ดูนะคะ 📸"
    │  → ส่ง Flex Message พร้อมรูปสินค้า + ราคา
    │
    ▼
ลูกค้า: "สนใจรุ่น PRO ซื้อได้ที่ไหนครับ"
    │
    ▼
🤖 AI เรียก tool: dinoco_dealer_lookup
    │  → POST /dinoco-mcp/v1/dealer-lookup { location: จากจังหวัดลูกค้า }
    │  → WordPress ค้นหาตัวแทนจาก KB
    │  → return: ชื่อร้าน, เบอร์โทร, ที่อยู่
    │
    ▼
🤖 AI ตอบ: "ตัวแทนใกล้คุณ:
             🏪 ร้าน XXX โทร 0XX-XXX-XXXX
             📍 อ.เมือง เชียงใหม่
             สะดวกให้ทางร้านติดต่อกลับไหมคะ?"
    │
    ▼
ลูกค้า: "ได้เลยครับ"
    │
    ▼
🤖 น้องกุ้งมะยม สร้าง Lead:
    │  → POST /dinoco-mcp/v1/lead-create
    │  → POST /dinoco-mcp/v1/distributor-notify
    │     → WordPress ส่ง LINE push ไปกลุ่มตัวแทน:
    │       "🔔 ลูกค้าสนใจ: แคชบาร์ ADV 350 PRO
    │        ชื่อ: สมชาย / เชียงใหม่
    │        กรุณาติดต่อลูกค้าภายใน 4 ชม."
    │
    ▼
>>> เข้า Workflow 2: ติดตาม Lead <<<
```

### Workflow 2: น้องกุ้งมะยมติดตาม Lead (ทั้งลูกค้าและตัวแทน)

```
[T+0] สร้าง lead → สถานะ: DEALER_NOTIFIED
    │
    ▼
[T+4 ชม.] 🤖 มะยมถามตัวแทน (LINE push):
    │  "ติดต่อลูกค้า สมชาย ไปแล้วหรือยังคะ?"
    │
    │  พร้อมกัน
    │
[T+4 ชม.] 🤖 มะยมถามลูกค้า (FB/IG):
    │  "ตัวแทนจากร้าน XXX ติดต่อไปหรือยังคะ?"
    │
    ├── ลูกค้าบอก "ยังเลย ไม่มีใครโทรมา"
    │   ▼
    │   🚨 มะยม escalate → alert admin
    │   🤖 มะยมแจ้งตัวแทนอีกครั้ง: "⚠️ ลูกค้ารอติดต่อ กรุณาโทรหาด่วน"
    │   สถานะ: ESCALATED
    │
    ├── ลูกค้าบอก "โทรมาแล้ว คุยเรียบร้อย รอของ"
    │   ▼
    │   🤖 มะยมจด: รอของ
    │   🤖 มะยมถาม: "รอกี่วันคะ?"
    │   ลูกค้า: "บอกว่า 3-5 วัน"
    │   🤖 มะยมตั้ง timer: 5 วัน
    │   สถานะ: WAITING_DELIVERY
    │
    ▼
[T+5 วัน] 🤖 มะยมถามลูกค้า (FB/IG):
    │  "ของมาถึงแล้วหรือยังคะ?"
    │
    ├── "มาแล้ว!"
    │   ▼
    │   สถานะ: DELIVERED
    │   🤖 มะยม: "เยี่ยมเลยค่ะ! ติดตั้งเรียบร้อยแล้วบอกนะคะ"
    │
    ├── "ยังไม่มาเลย"
    │   ▼
    │   🤖 มะยมถามตัวแทน: "ลูกค้าบอกของยังไม่มา กรุณาเช็คให้หน่อยค่ะ"
    │   สถานะ: DELIVERY_DELAYED → ESCALATED
    │
    ▼
[หลังติดตั้ง] 🤖 มะยมถามลูกค้า (+2 วัน):
    │  "ติดตั้งเป็นยังไงบ้างคะ? พอใจไหม?"
    │
    ├── ลูกค้า: "สวยมาก ชอบเลย!" (sentiment: positive)
    │   ▼
    │   🤖 มะยม: "ดีใจค่ะ! 😊 ช่วยรีวิวใน FB ให้หน่อยได้ไหมคะ?"
    │   → ส่ง FB/IG comment → Brand Voice Pool (positive, quality)
    │   สถานะ: SATISFIED → CLOSED_SATISFIED
    │
    ├── ลูกค้า: "มีปัญหา ตัวล็อคไม่แน่น" (sentiment: negative)
    │   ▼
    │   >>> เข้า Workflow 3: เคลมแมนนวล <<<
    │
    ▼
[T+30 วัน] 🤖 มะยมถามลูกค้า (รอบสุดท้าย):
    "ใช้งานมาได้ 1 เดือนแล้วค่ะ เป็นยังไงบ้าง? มีปัญหาอะไรไหม?"
    │
    ├── ดี → CLOSED_SATISFIED (จบ)
    └── มีปัญหา → เข้า Workflow 3: เคลม
```

### Workflow 3: เคลมแมนนวลผ่านแชท

```
ลูกค้า: "สินค้ามีปัญหา สติ๊กเกอร์มันลอก"
    │
    ▼
🤖 AI ตรวจจับ intent = เคลม (คำว่า: มีปัญหา, แตก, ลอก, เสีย, หลุด, หาย)
🤖 Smart Routing → เข้า Support queue
    │
    ▼
🤖 AI: "เสียใจด้วยค่ะ 😔 ส่งรูปสินค้าที่มีปัญหาให้ดูหน่อยได้ไหมคะ?"
    สถานะ: PHOTO_REQUESTED
    │
    ▼
ลูกค้าส่งรูป 📸
    │
    ▼
🤖 Vision AI วิเคราะห์รูป:
    │  "พบ: สติ๊กเกอร์ลอกบริเวณมุมซ้ายบน ตัวกล่องปกติ"
    สถานะ: PHOTO_RECEIVED
    │
    ▼
🤖 AI ถามข้อมูลเพิ่ม:
    "ขอข้อมูลเพิ่มหน่อยนะคะ:
     1. สินค้ารุ่นอะไรคะ?
     2. ซื้อจากร้านไหน เมื่อไหร่?
     3. มี serial number ไหมคะ? (ดูที่ฉลากใต้กล่อง)"
    │
    ▼
ลูกค้าตอบ: "กล่องข้าง NX500 ซื้อร้าน XXX เมื่อ 3 เดือนก่อน serial DN-0042"
    │
    ▼
🤖 AI เรียก tool: dinoco_warranty_check
    │  → POST /dinoco-mcp/v1/warranty-check { serial: "DN-0042" }
    │  → return: ยังอยู่ในประกัน หมด 15 มี.ค. 2029
    │
    ▼
🤖 AI: "ตรวจสอบแล้วค่ะ สินค้ายังอยู่ในประกัน ✅
         ส่งเรื่องให้ทีมงานตรวจสอบนะคะ จะแจ้งผลภายใน 1-2 วันทำการค่ะ"
    │
    ▼
🤖 สร้างใบเคลม:
    │  → POST /dinoco-mcp/v1/claim-manual-create
    │  { serial, product, photos, symptoms, warranty_status, customer_info }
    สถานะ: INFO_COLLECTED → รอ ADMIN ตรวจ
    │
    ▼
📋 Admin เปิด OpenClaw Dashboard → หน้า "เคลมรอตรวจ"
    │  เห็น: รูป + AI วิเคราะห์ + ข้อมูลประกัน + ประวัติลูกค้า
    │
    ├── Admin กด "Case A: ส่งกลับเปลี่ยน"
    │   ▼
    │   🤖 AI แจ้งลูกค้า: "ทีมงานตรวจแล้วค่ะ เป็นเคสเปลี่ยนสินค้า
    │      กรุณาส่งสินค้ามาที่: [ที่อยู่ DINOCO]
    │      ใบเคลม: #MC-0042"
    │   สถานะ: WAITING_RETURN_SHIPMENT
    │   │
    │   ▼
    │   🤖 [+3 วัน] มะยมถาม: "ส่งสินค้ากลับมาแล้วหรือยังคะ?"
    │   │
    │   ▼
    │   สินค้ามาถึง DINOCO → Admin กดรับ → สถานะ: RECEIVED_AT_FACTORY
    │   │
    │   ▼
    │   ซ่อม/เปลี่ยนเสร็จ → Admin กดส่งกลับ + ใส่ tracking
    │   สถานะ: RETURN_TO_CUSTOMER
    │   │
    │   ▼
    │   🤖 AI แจ้งลูกค้า: "ส่งสินค้ากลับแล้วค่ะ! tracking: XXX"
    │   │
    │   ▼
    │   🤖 [+3 วัน] มะยมถาม: "ได้รับสินค้าคืนแล้วหรือยังคะ? เป็นยังไงบ้าง?"
    │   │
    │   ├── ลูกค้า: "ได้แล้ว สวยเหมือนใหม่ ขอบคุณครับ!"
    │   │   สถานะ: CLOSED_RESOLVED ✅
    │   │
    │   └── ลูกค้า: "ยังมีปัญหาอีก"
    │       สถานะ: REOPENED → กลับไป PHOTO_REQUESTED
    │
    ├── Admin กด "Case B: ส่งอะไหล่"
    │   ▼
    │   🤖 AI แจ้งลูกค้า: "ทีมงานจะส่งอะไหล่ทดแทนไปให้ค่ะ
    │      กรุณายืนยันที่อยู่จัดส่ง: [ที่อยู่จาก profile]"
    │   สถานะ: PARTS_SHIPPING
    │   │
    │   ▼
    │   ส่งอะไหล่ → มะยมติดตามเหมือน Case A
    │   สถานะ: CLOSED_RESOLVED ✅
    │
    └── Admin กด "ปฏิเสธ" (ไม่อยู่ในเงื่อนไขประกัน)
        ▼
        🤖 AI แจ้งลูกค้า: "ขอแจ้งว่าสินค้าไม่อยู่ในเงื่อนไขรับประกันค่ะ
           เหตุผล: [เหตุผลจาก admin]
           หากมีข้อสงสัยเพิ่มเติม สามารถสอบถามได้ค่ะ"
        สถานะ: CLOSED_REJECTED
```

### Workflow 4: AI ตอบคำถามในกลุ่ม LINE ตัวแทน

```
ตัวแทนถามในกลุ่ม LINE: "แคชบาร์ CB500X มีของไหม ราคา dealer เท่าไหร่"
    │
    ▼
WordPress รับ webhook (B2B Snippet 2 เดิม)
    │  → forward ข้อความไป OpenClaw (fire-and-forget)
    │
    ▼
🤖 OpenClaw AI เรียก tool: dinoco_product_lookup
    │  → ดึงราคา + สต็อกจาก catalog
    │
    ▼
🤖 AI ตอบในกลุ่ม (ผ่าน WordPress LINE push):
    "มีค่ะ! แคชบาร์ CB500X
     📦 STD: ราคา dealer X,XXX บาท — มีของพร้อมส่ง
     📦 PRO: ราคา dealer X,XXX บาท — มีของพร้อมส่ง
     สั่งผ่าน LIFF Catalog ได้เลยค่ะ"
```

### Workflow 5: Brand Voice Auto-Collection (แทน Chrome Extension)

```
ลูกค้า comment ใน Facebook Page: "กล่อง DINOCO ดีมาก ใช้มา 2 ปีแล้ว!"
    │
    ▼
🤖 OpenClaw รับ webhook จาก Meta Graph API
    │
    ▼
🤖 AI วิเคราะห์:
    │  sentiment: positive (score: 85)
    │  brand: DINOCO
    │  category: quality
    │  product: กล่อง (ไม่ระบุรุ่น)
    │
    ▼
🤖 ส่งเข้า WordPress:
    │  → POST /dinoco-mcp/v1/brand-voice-submit
    │  { brands: ["DINOCO"], sentiment: "positive", intensity: 4,
    │    categories: ["quality"], platform: "facebook_page",
    │    content: "กล่อง DINOCO ดีมาก ใช้มา 2 ปีแล้ว!",
    │    source_url: "https://fb.com/..." }
    │
    ▼
WordPress สร้าง brand_voice CPT entry อัตโนมัติ
    → เห็นใน Brand Voice Dashboard ทันที
    → ไม่ต้องใช้ Chrome Extension อีกต่อไป (สำหรับ FB/IG)
```

### Workflow 6: KB Self-Improvement Loop

```
ลูกค้าถาม: "กล่อง DINOCO กันน้ำไหม?"
    │
    ▼
🤖 AI เรียก tool: dinoco_kb_search { question: "กล่อง กันน้ำ" }
    │  → WordPress KB search → ไม่เจอคำตอบ
    │
    ▼
🤖 AI ตอบ: "ตรงนี้ขอเช็คข้อมูลกับทีมงานก่อนนะคะ รอสักครู่ค่ะ"
    │
    ▼
🤖 บันทึกคำถามที่ตอบไม่ได้:
    │  → POST /dinoco-mcp/v1/kb-suggest
    │  { question: "กล่อง DINOCO กันน้ำไหม?", frequency: 1, source: "fb_chat" }
    │
    ▼
📋 Admin เปิด KB Trainer Bot → เห็น "คำถามที่ AI ตอบไม่ได้":
    │  1. กล่อง DINOCO กันน้ำไหม? (ถูกถาม 15 ครั้ง)
    │  2. ติดตั้งเองได้ไหม? (ถูกถาม 8 ครั้ง)
    │
    ▼
Admin สร้าง KB entry ใหม่:
    │  Q: "กล่อง DINOCO กันน้ำไหม"
    │  A: "กล่องอลูมิเนียม DINOCO กันน้ำ IP67 ใช้งานกลางฝนได้"
    │
    ▼
WordPress trigger webhook: /kb-updated
    │  → OpenClaw re-sync KB → embed ใหม่ → Qdrant อัพเดท
    │
    ▼
ครั้งต่อไปลูกค้าถามเรื่องเดียวกัน → AI ตอบได้ทันที ✅
```

### Workflow 7: Admin ไม่ตอบ 5 นาที → Auto-Reply

```
ลูกค้าทัก FB/IG: "สนใจกล่องข้าง Forza ครับ"
    │
    ▼
🤖 OpenClaw รับข้อความ → แจ้ง Dashboard → รอ admin ตอบ
    │
    ▼
[5 นาทีผ่านไป — admin ไม่ตอบ]
    │
    ▼
🤖 Auto-Reply (Gemini Flash + tools):
    │  → เรียก dinoco_product_lookup: "กล่องข้าง Forza"
    │  → ได้ข้อมูลจริง: STD 8,900 / PRO 12,500
    │
    ▼
🤖 ตอบลูกค้า:
    "สวัสดีค่ะ! กล่องข้าง Forza 350 มี 2 รุ่นค่ะ:
     📦 STD: 8,900 บาท
     📦 PRO: 12,500 บาท
     รับประกัน 3 ปี อลูมิเนียมแท้ 100%

     💬 ทีมงาน DINOCO จะตอบกลับเร็วๆ นี้ค่ะ
     สนใจรุ่นไหนคะ? จะหาตัวแทนใกล้บ้านให้ค่ะ"
    │
    ▼
⚠️ หมายเหตุ: Auto-Reply ใช้ Gemini + tools ดึงข้อมูลจริง
   ไม่ใช่ข้อความกลางๆ "รอทีมงาน" แบบเดิมอีกต่อไป
```

### Workflow 8: Sentiment Alert → Admin Intervention

```
ลูกค้า: "ผิดหวังมาก ซื้อมาแพง แต่คุณภาพแย่"
    │
    ▼
🤖 Sentiment Analysis: score 15/100 → 🔴 RED
🤖 Purchase Intent: score 5/100 → ไม่สนใจซื้อ
    │
    ▼
🚨 Alert ทันที:
    │  → Telegram: "🔴 ลูกค้า @สมชาย ไม่พอใจมาก! sentiment 15/100"
    │  → Dashboard: badge แดงกะพริบ
    │  → น้องกุ้ง Problem Solver วิเคราะห์:
    │    "ปัญหา: ลูกค้ารู้สึกว่าราคาไม่คุ้ม
    │     ต้นเหตุ: คาดหวังสูงกว่าที่ได้รับ
    │     5 ทางออก: 1) ขอโทษ+ส่วนลดครั้งหน้า 2) ..."
    │
    ▼
🤖 AI ตอบ (ระมัดระวัง):
    "เสียใจด้วยค่ะ 😔 ไม่ทราบว่ามีปัญหาอะไรคะ?
     ทีมงาน DINOCO พร้อมช่วยเหลือค่ะ
     ถ้าสินค้ามีปัญหา เรามีระบบเคลมประกัน 3 ปีค่ะ"
    │
    ▼
🤖 Human Handoff: ถ้าลูกค้ายังไม่พอใจ
    → "ส่งเรื่องให้ทีมงาน DINOCO ดูแลค่ะ รอสักครู่นะคะ"
    → alert admin ทันที
```

### 4.8 จุดเชื่อมเพิ่มเติม (Final Review Round)

> จาก Feature Architect review รอบสุดท้าย + ความเข้าใจ business flow ที่ถูกต้อง
> DINOCO = ผู้ผลิต ไม่มีสต็อกปลีก ไม่ขายตรง ตัวแทนสั่งผ่าน B2B LIFF

#### Business Flow จริงของ DINOCO:
```
ลูกค้าสนใจสินค้า (FB/IG)
    ↓
AI แนะนำสินค้า + หาตัวแทนใกล้บ้าน
    ↓
ลูกค้าตกลง → ตัวแทนสั่งของจาก DINOCO (ผ่าน B2B LIFF)
    ↓
DINOCO ส่งให้ตัวแทน → ตัวแทนนัดลูกค้าติดตั้ง
    ↓
กุ้งมะยมตาม: สั่งหรือยัง? → ของถึงหรือยัง? → ติดตั้งเป็นไง? → 30 วันยังดีไหม?
```

#### stock_status ความหมายจริง:
```
ไม่ใช่: "มีของกี่ชิ้น" (ไม่มีสต็อกปลีก)
แต่คือ: "สินค้ารุ่นนี้ยังมี/หมด/Hold"

available    = ยังผลิต ตัวแทนสั่งได้
out_of_stock = หมดชั่วคราว ตัวแทนสั่งไม่ได้
hold         = กำลังผลิต รอ

ประโยชน์:
- AI ไม่แนะนำสินค้าที่หมด → ลูกค้าไม่ผิดหวัง
- ลูกค้าหลายคนถามสินค้าเดียวกัน → เช็คข้ามตัวแทนว่าใครสั่งไปแล้ว
- Admin เห็นว่าสินค้าไหน demand สูงแต่ stock หมด → วางแผนผลิต
```

#### จุดเชื่อมใหม่ 10 จุด:

| # | จุดเชื่อม | Priority | Endpoint/Action | เหตุผล |
|---|----------|----------|-----------------|--------|
| **E1** | **B2B Order Check** — กุ้งมะยมเช็คว่าตัวแทนสั่งของหรือยัง | **P1** | `/b2b-order-check` GET `{ distributor_id, after_date }` → return มี order ไหม | กุ้งมะยมต้องรู้ว่า lead convert เป็น order จริงหรือยัง |
| **E2** | **B2B Order → Lead Link** — order สร้างแล้ว link กับ lead | **P1** | WordPress trigger: B2B order created → webhook `/lead-order-linked` → OpenClaw update lead = ORDER_PLACED | ปิด loop: lead → order → delivery → install |
| **E3** | **Product Compatibility** — รุ่นรถ → สินค้าที่ใส่ได้ | **P1** | `/product-compatibility` POST `{ brand, model }` → match จาก MotoDB aliases → return catalog items | คำถามบ่อยที่สุด "ADV 350 ใส่อะไรได้บ้าง" |
| **E4** | **Stock Status ใน product-lookup** — สินค้ามี/หมด/Hold | **P1** | เพิ่ม `stock_status` field ใน `/product-lookup` response | AI ไม่แนะนำสินค้าที่หมด |
| **E5** | **Dealer Claim** — ตัวแทนแจ้งเคลมแทนลูกค้า | **P1** | `/claim-manual-create` เพิ่ม `initiated_by: "dealer"` + `dealer_id` | ตัวแทนเห็นปัญหาตอนติดตั้ง |
| **E6** | **Distributor Status Changed** — เลิก/suspend | **P2** | `/distributor-status-changed` webhook → ลบจาก AI cache + reassign leads ค้าง | AI ยังแนะนำร้านที่ปิดแล้ว |
| **E7** | **KB Updated → P1** — เลื่อนจาก P3 | **P1** | `/kb-updated` webhook → Qdrant re-sync ทันที | KB = สมองของ AI ถ้าไม่ sync ทันที AI ตอบผิด |
| **E8** | **Competitor Mention → Brand Voice** | **P2** | Agent #3 detect "SRC", "F2MOTO", "BMMOTO" ในแชท → `/brand-voice-submit` | ข้อมูลมีค่าสำหรับเจ้าของธุรกิจ |
| **E9** | **Province Demand Gap** | **P2** | Lead province data → `/dashboard-inject-metrics` → Admin เห็น heatmap | จังหวัดที่มี demand แต่ไม่มีตัวแทน |
| **E10** | **Distributor Added** | **P2** | `/distributor-added` webhook → AI cache อัพเดท | AI รู้จักตัวแทนใหม่ทันที |
| **E11** | **B2B Order → Lead Link** | **P1** | WordPress fire webhook `/lead-order-linked` เมื่อ B2B order ถูกสร้าง → OpenClaw match กับ lead ที่ค้าง → update status = ORDER_PLACED | กุ้งมะยมรู้ว่า lead convert แล้ว ปิด loop |
| **E12** | **Flash Express → Lead Tracking** | **P2** | WordPress fire webhook `/lead-shipment-update` เมื่อ Flash Express status เปลี่ยน (shipped/delivered) → OpenClaw update lead = DELIVERED | กุ้งมะยมรู้ว่าของถึงแล้ว trigger ถามเรื่องติดตั้ง |

#### Lead Pipeline อัพเดท (ตาม business flow จริง):
```
LEAD_CREATED
    ↓ แจ้งตัวแทน (LINE Flex)
DEALER_NOTIFIED
    ↓ T+4hr กุ้งมะยมถามตัวแทน: "ติดต่อลูกค้าไปหรือยังคะ?"
CHECKING_CONTACT
    ├── ตัวแทนติดต่อแล้ว → DEALER_CONTACTED
    └── ไม่ตอบ → ESCALATED
         ↓
DEALER_CONTACTED
    ↓ T+3 วัน กุ้งมะยมถามลูกค้า: "ได้เรื่องไหมคะ?"
    ├── ลูกค้าตกลงซื้อ → WAITING_ORDER
    └── ไม่ซื้อ → LOST
         ↓
WAITING_ORDER ← จุดใหม่!
    ↓ กุ้งมะยมถามตัวแทน: "สั่งของให้ลูกค้าหรือยังคะ?"
    ↓ เช็ค B2B order (/b2b-order-check)
    ├── ยังไม่สั่ง → กุ้งมะยม nudge ตัวแทน
    └── สั่งแล้ว → ORDER_PLACED
         ↓
ORDER_PLACED ← link กับ B2B order จริง
    ↓ กุ้งมะยมถามตัวแทน: "ของถึงเมื่อไหร่? นัดติดตั้งวันไหน?"
WAITING_DELIVERY
    ↓ timer ตามวันที่ตัวแทนบอก
    ├── ของถึง → DELIVERED
    └── ช้า → กุ้งมะยมตามตัวแทน
         ↓
DELIVERED
    ↓ กุ้งมะยมถามตัวแทน: "นัดติดตั้งลูกค้าวันไหนคะ?"
WAITING_INSTALL
    ↓ timer ตามวันนัด
INSTALLED
    ↓ T+2 วัน กุ้งมะยมถามลูกค้า: "ติดตั้งเป็นไงบ้างคะ?"
    ├── พอใจ → SATISFIED → ขอรีวิว → CLOSED_SATISFIED
    └── มีปัญหา → เข้า Manual Claim Flow
         ↓
[T+30 วัน] กุ้งมะยมถามลูกค้า: "ใช้มา 1 เดือน เป็นไงบ้างคะ?"
    ├── ดี → CLOSED_SATISFIED
    └── มีปัญหา → Claim Flow
```

**สิ่งที่เปลี่ยนจากเดิม:**
- เพิ่ม **WAITING_ORDER** — จุดที่ลูกค้าตกลงแต่ตัวแทนยังไม่สั่ง
- เพิ่ม **ORDER_PLACED link กับ B2B order จริง** ผ่าน `/b2b-order-check`
- เพิ่ม **WAITING_INSTALL** — จุดที่ของถึงแต่ยังไม่ติดตั้ง
- กุ้งมะยม **ตามตัวแทน 3 จุด**: ติดต่อลูกค้าหรือยัง? สั่งของหรือยัง? นัดติดตั้งวันไหน?

#### Workflow ใหม่ที่ควรเพิ่ม:

| # | Workflow | Priority | รายละเอียด |
|---|---------|----------|-----------|
| **W9** | **Compatibility Check** | P1 | ลูกค้า: "ADV 350 ใส่อะไรได้บ้าง" → AI เรียก `/product-compatibility` → แสดงสินค้าทุกตัวที่ compatible กับรุ่นนี้ |
| **W10** | **Value Proposition** | P1 | ลูกค้า: "ทำไมแพงกว่ายี่ห้ออื่น" → AI ตอบจาก KB: อลูมิเนียมแท้ IP67 ประกัน 3 ปี (ห้ามพูดชื่อคู่แข่ง) |
| **W11** | **Dealer Claim via LINE** | P2 | ตัวแทนแจ้งเคลมแทนลูกค้าในกลุ่ม LINE → สร้าง claim ticket |
| **W12** | **UGC Collection** | P2 | ลูกค้าส่งรูปสินค้าที่ติดตั้ง → AI ขอ permission ใช้รูป → เก็บ UGC + ส่ง Brand Voice (positive) |
| **W13** | **Province Gap Report** | P3 | Agent รายงาน: "จ.ลำพูน มี lead 12 ราย แต่ไม่มีตัวแทน" → Admin พิจารณาหาตัวแทนใหม่ |

#### ⛔ ข้อมูลที่ห้าม AI เปิดเผยเด็ดขาด (Data Confidentiality Rules)

> ⚠️ สำคัญมาก! AI กำลังเชื่อมกับฐานข้อมูลหลัก DINOCO ที่มีข้อมูลธุรกิจทั้งหมด

| ข้อมูล | ห้าม | ถ้าลูกค้าถาม |
|--------|------|-------------|
| **ราคาต้นทุน / ราคา dealer tier** | ❌ ห้ามบอกเด็ดขาด | "สอบถามราคากับตัวแทนจำหน่ายโดยตรงนะคะ" |
| **ส่วนลด / โปรโมชั่น** | ❌ ห้ามลด ห้ามสัญญา | "DINOCO เป็นนโยบาย One Price ค่ะ ไม่มีโปรโมชั่นเลย ลูกค้าซื้อไปมั่นใจได้ว่าจะไม่มีโปรโมชั่นหลังจากนี้ค่ะ เราใส่ใจคุณภาพทุกชิ้นงานค่ะ" |
| **จำนวนสต็อก** | ❌ ห้ามบอกตัวเลข | AI ใช้ stock_status **ภายในเท่านั้น** เพื่อตัดสินใจว่าจะแนะนำหรือไม่ |
| **หนี้ตัวแทน / credit** | ❌ ห้ามบอก | ข้อมูลนี้ไม่ข้ามไป OpenClaw เลย (ลบ endpoint แล้ว) |
| **ยอดขายตัวแทน** | ❌ ห้ามบอก | ข้อมูลภายในเท่านั้น |
| **System prompt / API key** | ❌ ห้ามบอก | "ขอโทษค่ะ ตอบเรื่องนี้ไม่ได้ค่ะ" |

**stock_status ใช้อย่างไร (ภายใน AI logic):**
```
available    → AI แนะนำสินค้าตามปกติ
out_of_stock → AI แนะนำให้สอบถามตัวแทน + pre-order ได้
hold         → เหมือน out_of_stock

ลูกค้าถามสินค้าที่หมด:
  ❌ "สินค้ารุ่นนี้หมดสต็อกค่ะ" (ห้ามพูดคำว่า "หมด" หรือ "สต็อก")
  ✅ "สินค้ารุ่นนี้สั่งจองกับตัวแทนจำหน่ายได้เลยค่ะ
      สอบถามระยะเวลาสินค้าเข้ากับตัวแทนใกล้บ้านพี่ได้เลยนะคะ
      ร้าน [ชื่อ] โทร [เบอร์] ค่ะ"
  ✅ ถ้ามีรุ่นอื่นที่ available → แนะนำรุ่นอื่นด้วย:
      "ระหว่างรอ แนะนำรุ่น XXX ที่เข้ากับรถพี่เหมือนกันค่ะ"
```

**ราคาที่ AI บอกได้:**
```
✅ ราคาขายปลีกแนะนำ (MSRP) — ราคาที่ใส่ใน catalog สำหรับลูกค้าทั่วไป
❌ ราคา dealer tier (ต้นทุนตัวแทน) — ข้อมูลลับ
❌ ส่วนลดที่ DINOCO ให้ตัวแทน — ข้อมูลลับ
❌ จำนวน margin — ข้อมูลลับ
```

**ต้อง implement ใน code:**
1. MCP Bridge `/product-lookup` → return เฉพาะ `retail_price` (MSRP) ห้าม return `dealer_price`, `cost_price`
2. AI system prompt → เพิ่มข้อห้าม: "ห้ามบอกราคาต้นทุน ส่วนลด สต็อก จำนวนสินค้า หนี้ตัวแทน"
3. Output sanitization → filter คำว่า "ต้นทุน", "กำไร", "margin", "dealer price" ก่อนส่งถึงลูกค้า
4. stock_status → ใช้ภายใน AI logic เท่านั้น ห้ามปรากฏใน response ถึงลูกค้า

#### สิ่งที่ไม่ต้องเพิ่ม (ยืนยัน):

| ไม่เพิ่ม | เหตุผล |
|---------|--------|
| ~~ราคาต้นทุน/dealer price ใน product-lookup~~ | **ห้ามเด็ดขาด** AI บอกได้แค่ราคา MSRP |
| ~~สต็อกบอกลูกค้า~~ | ห้ามบอกจำนวน ใช้ stock_status ภายในเท่านั้น |
| ~~active-promotions~~ | โปรฯ อยู่ที่ตัวแทนแต่ละร้าน ห้าม AI สัญญา |
| ~~เทียบคู่แข่งโดยตรง~~ | ห้าม AI พูดชื่อคู่แข่ง ตอบแค่จุดแข็ง DINOCO |
| ~~ลูกค้าส่งรูปรถถาม~~ | ถามรุ่นรถเร็วกว่า + แม่นยำกว่า Vision AI |
| ~~Appointment Calendar~~ | ลูกค้านัดกับตัวแทน ไม่ใช่โรงงาน |
| ~~ตัวแทนถาม shipping~~ | LIFF มีอยู่แล้ว |

---

### 4.7 Deep Review Findings — สิ่งที่ต้องแก้ไขในแผน

> จากการ review โดย Tech Lead + 5 Agents (fullstack, code-reviewer, security, ux-ui, database)
> วันที่: 2026-03-30

#### CRITICAL — ต้องแก้ ถ้าไม่แก้จะพัง

**C0a: Meta webhook signature ใช้ `===` → Timing Attack (Security Pentester)**
- ปัญหา: `verifyMetaSignature()` ใช้ `===` เปรียบเทียบ HMAC → brute-force ทีละ byte ได้
- ผลกระทบ: ปลอม FB/IG webhook → inject ข้อความปลอม, สร้าง lead ปลอม
- แก้: เปลี่ยนเป็น `crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))`
- หมายเหตุ: LINE webhook ทำถูกแล้ว (timingSafeEqual) แต่ Meta ยังไม่ทำ

**C0b: requireAuth ใช้ `!==` → Timing Attack บน API Key (Security Pentester)**
- ปัญหา: `token !== secret` ใช้ string comparison ธรรมดา ทุก API request
- ผลกระทบ: brute-force API_SECRET_KEY ได้ → เข้าถึง 40+ endpoints
- แก้: เปลี่ยนเป็น `crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret))`

**C0c: warranty-check ส่ง PII (owner_name) + LIKE match = data enumeration (ยกระดับจาก I1)**
- ปัญหา: ค้น "0" ได้เบอร์ทุกคน, response มี `owner_name` ที่ไม่จำเป็น
- แก้: ลบ `owner_name` จาก response, เปลี่ยน LIKE → `=` exact match, enforce minimum length

**C0d: PDPA consent ต้องมีก่อนเก็บข้อมูล — ย้ายจาก Phase 1B → Phase 1A (ยกระดับจาก I5)**
- ปัญหา: เก็บ PII ลูกค้าไทยบน Hetzner (เยอรมนี) โดยไม่มี consent
- แก้: ข้อความแรกที่ลูกค้าทัก FB/IG → แจ้ง PDPA + ขอ consent ก่อนเก็บข้อมูล
- เพิ่ม: DPA กับ Hetzner, data retention cron (ลบ lead > 90 วัน), right to deletion API

**C1: `dealer-lookup` ใช้ array index แทน post ID**
- ปัญหา: map จังหวัด → KB entry ด้วยตำแหน่ง array (`$idx = $entry_num - 1`) ถ้า KB entry ถูกลบ/สลับ → ส่งตัวแทนผิดจังหวัด
- แก้: เปลี่ยนเป็น query by `post_id` โดยตรง ไม่ใช้ array index
- ไฟล์: `[System] DINOCO MCP Bridge` บรรทัด 239-252

**C2: free models ไม่รองรับ function calling**
- ปัญหา: `callProvider()` ใช้ OpenRouter/SambaNova เป็นหลัก ซึ่งไม่รองรับ tool calling → DINOCO tools ไม่ทำงานจริง
- แก้: customer-facing chat ต้องใช้ Gemini Flash (primary) + Claude Sonnet (fallback) เท่านั้น
- สถานะ: ระบุในแผนแล้ว แต่ยังไม่ได้ implement (BLOCKED)

**C3: Meta 24-Hour Messaging Window Policy ⚠️ จุดตาย!**
- ปัญหา: Facebook/Instagram ไม่อนุญาตให้ business ส่งข้อความถึงลูกค้าหลังจาก 24 ชม. ที่ลูกค้าตอบครั้งสุดท้าย
- ผลกระทบ: **น้องกุ้งมะยม follow-up ไม่ได้เลย** ถ้าลูกค้าไม่ตอบ → Lead Pipeline พังทั้ง flow
- แก้ (3 ทาง):
  1. **One-Time Notification (OTN)**: ขอ permission จากลูกค้าก่อน "อนุญาตให้เราส่งข้อมูลอัพเดทไหมคะ?" → ได้โทเค็นส่งได้ 1 ครั้ง
  2. **Message Tags**: ใช้ tag `CONFIRMED_EVENT_UPDATE` หรือ `POST_PURCHASE_UPDATE` (ใช้ได้เฉพาะกรณีที่ Meta อนุญาต)
  3. **Fallback ผ่าน SMS/Email**: ถ้า 24 ชม. หมด → ส่ง SMS หรือ email แทน (ต้องมีเบอร์/email ลูกค้า)
  4. **LINE fallback**: ถ้าลูกค้ามี LINE → follow-up ผ่าน LINE แทน (ต้อง cross-link ก่อน)
- เพิ่มใน Workflow 2: ทุก follow-up step ต้อง check messaging window ก่อน

**C4: MCP Bridge ไม่มี IP whitelist + rate limiting**
- ปัญหา: ถ้า API key หลุด ใครก็เรียก API ได้จากทุกที่
- แก้: เพิ่มใน `[System] DINOCO MCP Bridge`:
  - IP whitelist: เฉพาะ Hetzner VPS IP
  - Rate limit: 60 req/min ต่อ endpoint (ใช้ WordPress transient)
  - Log ทุก API call สำหรับ audit

**C5: Phase 1 ตึงเกินจริง (19 deliverables / 2 สัปดาห์)**
- แก้: แยกเป็น Phase 1A + 1B
  - **Phase 1A (สัปดาห์ 1)**: Infra + FB/IG chat ตอบได้ + MCP Bridge เชื่อม
  - **Phase 1B (สัปดาห์ 2-3)**: Lead Pipeline + Mayom + Flex Messages

#### IMPORTANT — ควรแก้ ทำให้ระบบดีขึ้นมาก

**I0a: API key รับจาก query string → โผล่ใน nginx/proxy logs (Security Pentester)**
- ปัญหา: `requireAuth` รับ `req.query?.api_key` → key อยู่ใน URL → log ทุกที่
- แก้: ลบ `req.query?.api_key` ออก บังคับใช้ header เท่านั้น

**I0b: Uploaded images ไม่มี access control + ไม่ strip EXIF (Security Pentester)**
- ปัญหา: `/uploads` serve ด้วย `express.static` ไม่มี auth, EXIF อาจมี GPS ลูกค้า
- แก้: เพิ่ม `requireAuth` บน `/uploads`, ใช้ `sharp` strip EXIF, ใช้ UUID filename

**I0c: Docker ไม่มี network isolation (Security Pentester)**
- ปัญหา: ทุก container อยู่ default bridge, edge-tts ไม่มี API key
- แก้: สร้าง frontend/backend networks แยก, nginx เท่านั้นที่อยู่ทั้ง 2 networks

**I0d: Rollback ไม่มี data reconciliation plan (Security Pentester)**
- ปัญหา: leads/claims ใน MongoDB เป็น orphan data หลัง rollback
- แก้: export pending data ก่อน shutdown, มี reconciliation script สำหรับ retry

**I0e: FB_APP_SECRET / FB_VERIFY_TOKEN อาจเป็นค่าว่าง → bypass signature (Security Pentester)**
- แก้: early return 503 ถ้า secret/token ว่าง (เหมือนที่ LINE verification ทำ)

**I1: warranty-check ใช้ LIKE match (ยกระดับเป็น C0c แล้ว)**
- แก้: เปลี่ยนเป็น `=` exact match สำหรับ serial_code

**I2: ขาด 3 endpoints**
- เพิ่ม: `/lead-get/:id` (detail), `/claim-manual-list` (admin list), `/distributor-get/:id` (single)

**I3: Parameters ที่ขาดใน endpoints**
- `/lead-create`: เพิ่ม `customer_platform` (facebook/instagram/line)
- `/lead-update`: เพิ่ม `updated_by` (agent/admin/customer)
- `/distributor-notify`: ระบุ LINE group_id ที่จะส่ง
- `/claim-manual-create`: เพิ่ม `customer_address` (สำหรับ Case B ส่งอะไหล่)
- `/brand-voice-submit`: เพิ่ม `post_context` (เนื้อหาโพสต์หลัก ตาม memory rule)

**I4: proxy/index.js เป็น monolith 5,425 บรรทัด → จะบวมถึง 7,000+**
- แก้: แยก module ก่อนเริ่มเขียนโค้ดใหม่
```
proxy/
  index.js              (50 บรรทัด — app setup + routes)
  modules/
    lead-pipeline.js    (Lead Follow-up state machine + cron)
    claim-flow.js       (Manual Claim state machine)
    dinoco-tools.js     (DINOCO MCP tools + callDinocoAPI)
    dinoco-cache.js     (WordPress data cache layer)
    ai-chat.js          (Gemini + Sonnet chat with tools)
  middleware/
    auth.js             (requireAuth + sanitizeId)
```

**I5: PDPA สำหรับ MongoDB บน Hetzner (เยอรมนี)**
- เพิ่ม: consent message ก่อนเก็บข้อมูล (FB/IG first message)
- เพิ่ม: data retention policy (ลบ lead data หลัง 90 วัน, claim หลัง 1 ปี)
- เพิ่ม: data export/delete API สำหรับ right to be forgotten
- เพิ่ม: strip EXIF metadata จากรูปเคลมก่อนเก็บ

**I6: Prompt Injection defense-in-depth**
- เพิ่ม: system prompt ห้ามเปิดเผย internal prompt
- เพิ่ม: output validation layer — filter ข้อมูล sensitive (ราคา dealer tier, internal notes) ก่อนส่งถึงลูกค้า
- เพิ่ม: prompt injection detection ภาษาไทย ("ลืมคำสั่ง", "เปลี่ยนบทบาท")

**I7: MongoDB index strategy (ต้องมีก่อน production)**
```
leads collection:
  { status: 1, next_followup: 1 }           — cron query ทุก 30 นาที
  { assigned_dealer: 1, status: 1 }          — dealer SLA report
  { customer_id: 1 }                         — customer history

manual_claims collection:
  { status: 1, updated_at: -1 }             — admin review queue
  { customer_id: 1 }                         — customer claims history

follow_ups collection:
  { lead_id: 1, scheduled_at: 1 }           — pending follow-ups
  { status: 1, scheduled_at: 1 }            — cron scan
```

**I8: Manual Claim state machine ขาด states**
- เพิ่ม: `PHOTO_REJECTED` — รูปไม่ชัด/ผิดหมวด → ขอรูปใหม่
- เพิ่ม: `CUSTOMER_NO_RESPONSE` — ลูกค้าหายระหว่าง flow (timeout 7 วัน)
- เพิ่ม: REOPEN path จาก `PARTS_SHIPPING` → ถ้าอะไหล่ผิด/เสีย
- State machine อัพเดท:
```
photo_requested → photo_received → info_collected → admin_reviewed
  ↑ photo_rejected ←┘                    ↓
                                  ├─ Case A: waiting_return → shipped → received → repaired → return → closed
                                  ├─ Case B: parts_shipping → closed (หรือ → reopened)
                                  └─ Reject: closed_rejected
                              customer_no_response (timeout 7 วัน จากทุก state)
                              reopened (จาก return_to_customer หรือ parts_shipping)
```

**I9: callDinocoAPI() ไม่มี retry logic**
- แก้: เพิ่ม retry 1 ครั้ง (wait 2 วินาที) ก่อน return error

**I10: product-lookup hardcode model aliases แทนดึงจาก MotoDB**
- แก้: เพิ่ม endpoint `/moto-catalog` (P3) แล้ว product-lookup ดึง aliases จาก `dinoco_moto_models.aliases`

**I11: LINE push ถึงตัวแทนเป็นข้อความเปล่า ไม่มี action button**
- แก้: ส่ง LINE Flex Message ที่มี:
  - ชื่อลูกค้า + สินค้าที่สนใจ + จังหวัด
  - ปุ่ม "📞 โทรหาลูกค้า" (tel:xxx)
  - ปุ่ม "✅ รับแล้ว" (postback → update lead status)
  - ปุ่ม "📋 ดูรายละเอียด" (link ไป dashboard)

**I12: Cross-system integrity — distributor ถูกลบแต่ lead ยังชี้อยู่**
- แก้: `/lead-create` validate ว่า distributor ยัง active
- แก้: Mayom detect "LINE push failed" → auto-reassign ไป distributor อื่น / escalate admin

#### SUGGESTION — Nice-to-have

**S1: Manual Claim ควรถามทีละคำถาม** (conversational style)
```
แทนที่:
  "ขอข้อมูลเพิ่ม: 1. รุ่นอะไร? 2. ซื้อที่ไหน? 3. Serial?"

ควรเป็น:
  "สินค้ารุ่นอะไรคะ?"
  → "ซื้อจากร้านไหนคะ?"
  → "มี serial number ไหมคะ? (ไม่มีก็ได้ค่ะ)"
```

**S2: ลูกค้าควรเลือกวิธีติดต่อตัวแทนได้**
```
🤖 "สะดวกแบบไหนคะ?"
  1️⃣ ให้ทางร้านติดต่อกลับ (ส่งเบอร์ให้ร้าน)
  2️⃣ ขอเบอร์ร้านไปโทรเอง
  3️⃣ แอดไลน์ร้าน
  4️⃣ ดูแผนที่ร้าน (Google Maps)
```

**S3: ลูกค้าต้อง opt-out จาก follow-up ได้**
- เพิ่มข้อความแรก: "ระบบจะติดตามให้จนซื้อเสร็จนะคะ พิมพ์ 'หยุด' ได้ทุกเมื่อค่ะ"

**S4: Dashboard merge Phase 3 — ทำเป็น Command Center + Deep Links**
```
DINOCO Admin Dashboard:
  ├── [KPI Summary] FB/IG leads วันนี้: 12 | Sentiment เฉลี่ย: 72 | รอ claim: 3
  ├── [Quick Actions] → เปิด OpenClaw Chat | → ดู Lead Pipeline | → ดู Claims
  └── [ส่วนเดิม] B2B Orders | Finance | Warranty | Brand Voice
```

**S5: Cache TTL ควรเป็น 15-30 นาที** (ไม่ใช่ 1 ชม.)
- สินค้าหมดสต็อก → AI ยังแนะนำอยู่ 1 ชม. = ลูกค้าผิดหวัง

**S6: KB search ควรมี relevance threshold**
- ตอนนี้ score > 0 ก็ return → อาจได้ผลไม่ตรง → เพิ่ม minimum score 20+

---

## 5. New Systems to Build

### 5.1 Manual Claim System

**Location:** OpenClaw (MongoDB `manual_claims` collection) + WordPress MCP endpoints

**Purpose:** Customers claim warranty through FB/IG chat before the Auto Claim System is activated.

**Flow:**
1. AI detects claim intent ("มีปัญหา" / "แตก" / "ลอก" / "เสีย")
2. Smart Routing sends to Support queue
3. AI requests photos from customer
4. Vision AI analyzes photos (sticker peel, crack, key lost, part detach)
5. AI collects info: product, symptoms, serial number, purchase date, dealer
6. Creates manual_claim record in MongoDB
7. Admin reviews in OpenClaw Dashboard: sees photos + AI analysis + warranty status
8. Admin selects: Case A (return & replace) / Case B (ship parts) / Reject
9. AI notifies customer of decision + tracks shipment
10. AI follows up until resolved or reopened

**State Machine (16 states):**
```
photo_requested -> photo_received -> info_collected -> admin_reviewed
  -> waiting_return_shipment -> return_shipped -> received_at_factory
  -> repaired/replaced -> return_to_customer -> closed_resolved
  -> closed_rejected (from admin_reviewed)
  -> reopened (from return_to_customer, loops back to photo_requested)
  -> parts_shipping (Case B from admin_reviewed) -> closed_resolved
```

**MongoDB Schema:** See INTEGRATION-ARCHITECTURE.md Part 8.3

**WordPress CPT (future):** When `[System] DINOCO Claim System` activates, manual claims sync to `claim_ticket` CPT via `/claim-manual-sync` endpoint (bidirectional status updates, PDF generation stays in WP).

### 5.2 Lead Follow-up Pipeline

**Location:** OpenClaw (MongoDB `leads` collection) + MCP endpoints + LINE push (via WordPress)

**Purpose:** After AI recommends a dealer, Agent #15 ("Mayom") tracks every step until the customer is satisfied or enters a claim.

**Pipeline (8 stages + 5 side-tracks + 5 closed states):**
```
lead_created -> dealer_notified -> checking_contact -> dealer_contacted
-> waiting_delivery -> delivered -> installed -> satisfied -> CLOSED_SATISFIED

Side tracks:
  dealer_no_contact -> escalated
  delivery_delayed -> escalated
  no_response -> dormant
  issue_reported -> Manual Claim Flow
  closed_cancelled
```

**Timer Schedule:**
- T+0: Create lead, notify dealer (LINE push)
- T+4hr: First check (ask dealer + customer)
- T+24hr: Contact recheck (escalate if no response)
- T+delivery_date: Delivery check
- T+delivery+2d: Installation check
- T+install+30d: 30-day satisfaction check

**Cron Jobs (7 total):**
1. `lead_first_check` -- every 30 min
2. `lead_contact_recheck` -- every 1 hr
3. `lead_delivery_check` -- every 2 hr
4. `lead_install_check` -- every 4 hr
5. `lead_30day_check` -- daily 9:00 AM BKK
6. `lead_dormant_cleanup` -- daily 2:00 AM BKK
7. `dealer_sla_weekly` -- Monday 8:00 AM BKK

**MongoDB Schema:** See INTEGRATION-ARCHITECTURE.md Part 7.2

### 5.3 Agent #15: Mayom (Lead Follow-up Agent)

**Name:** น้องกุ้งมะยม (Ma-Yom)
**Role:** Lead Follow-up & Dealer SLA Tracker
**Type:** Autonomous Agent (cron-triggered + event-triggered)

**Responsibilities:**
1. Create lead when AI recommends a dealer to customer
2. Send LINE push to dealer (via MCP `/distributor-notify`)
3. Send FB/IG messages to customer on schedule
4. Analyze customer responses (sentiment + intent)
5. Update pipeline status in MongoDB
6. Escalate when SLA exceeded
7. Request reviews from satisfied customers
8. Redirect to Manual Claim Flow when issues detected
9. Generate weekly Dealer SLA Report

**Triggers:**
- Event: `dealer_recommended` -- create lead + notify dealer
- Event: `customer_message` -- check if response to follow-up
- Event: `dealer_line_response` -- update dealer contact status
- Cron: every 30 min -- scan pending follow-ups
- Cron: every Monday -- SLA report

**Integration:**
- MCP Bridge: `/distributor-notify`, `/lead-create`, `/lead-update`
- OpenClaw: FB/IG Messaging API, Customer Memory, Sentiment Analysis
- MongoDB: `leads` collection

---

## 6. Code Changes Required

### 6.1 DONE

| File | What was done |
|------|---------------|
| `[System] DINOCO MCP Bridge` | 6 REST API endpoints (product-lookup, dealer-lookup, warranty-check, kb-search, kb-export, catalog-full) |
| `openclawminicrm/proxy/index.js` | LINE signature verification (HMAC-SHA256) |
| `openclawminicrm/proxy/index.js` | Bearer token middleware on all API endpoints |
| `openclawminicrm/proxy/index.js` | Telegram webhook signature check |
| `openclawminicrm/proxy/index.js` | NoSQL injection sanitization (sanitizeId) |
| `openclawminicrm/openclaw/openclaw.json` | Gateway password moved to env var |
| `openclawminicrm/proxy/index.js` | DEFAULT_PROMPT replaced with DINOCO brand voice |
| `openclawminicrm/proxy/index.js` | 5 DINOCO tools added (product, dealer, warranty, KB, escalate) |
| `openclawminicrm/proxy/index.js` | DEFAULT_BOT_NAME configurable via env |
| `openclawminicrm/scripts/sync-kb-to-qdrant.js` | KB migration script (WordPress to Qdrant) |
| `openclawminicrm/proxy/index.js` | LINE webhook forwarding to WordPress for B2B |

### 6.2 BLOCKED (Must fix before production)

| File | Blocker | Fix Required |
|------|---------|-------------|
| `openclawminicrm/proxy/index.js` | `aiReplyToLine` / `aiReplyToMeta` uses `callLightAI` (no tool calling) | REWRITE to use Gemini 2.0 Flash (primary) + Claude Sonnet (fallback) with function calling. Free models for background analytics only. |
| `openclawminicrm/proxy/index.js` | Postback events dropped | HANDLE postback events from LINE/Meta |
| `openclawminicrm/proxy/index.js` | replyToken conflict with B2B | ROUTE properly: B2B postbacks to WordPress, customer messages to OpenClaw |
| `openclawminicrm/proxy/index.js` | Smart Claim Tracker missing | BUILD claim detection + routing |
| `openclawminicrm/proxy/index.js` | Flex Message sending missing | ADD LINE Flex Message support |
| `openclawminicrm/proxy/index.js` | WordPress data cache missing | ADD cache layer for product/dealer/KB data |
| `openclawminicrm/` (30+ files) | "น้องกุ้ง" hardcoded in 30+ places | REPLACE with configurable bot name (DEFAULT_BOT_NAME env) |
| `openclawminicrm/proxy/index.js` | PDPA text still generic | UPDATE with DINOCO-specific PDPA text |

### 6.3 TODO (New code to write)

**WordPress (MCP Bridge extensions):**

| File | What to create |
|------|---------------|
| `[System] DINOCO MCP Bridge` | Add 25 new endpoints (see Section 4.2-4.4) |
| `[System] DINOCO Manual Claim System` | NEW: WordPress CPT for manual claims + admin UI + status management (for future sync with OpenClaw) |

**OpenClaw:**

| File | What to create/modify |
|------|----------------------|
| `proxy/index.js` | Rewrite `aiReplyToMeta` with Gemini Flash + Claude Sonnet |
| `proxy/index.js` | Add Lead Follow-up Pipeline logic (event handlers + state machine) |
| `proxy/index.js` | Add Manual Claim Flow (state machine + Vision AI integration) |
| `proxy/index.js` | Add claim route to Smart Routing |
| `proxy/index.js` | Add WordPress data cache (product/dealer/KB, TTL-based) |
| `proxy/index.js` | Add Flex Message sending capability |
| `proxy/index.js` | Handle postback events properly |
| `proxy/index.js` | Route replyToken correctly (B2B to WP, customer to OpenClaw) |
| `openclaw/cron/jobs.json` | Add 7 Lead Follow-up cron jobs |
| `openclaw/skills/smltrack-advisor/SKILL.md` | Customize all 14 agents for DINOCO context |
| `openclaw/skills/` | NEW: Agent #15 Mayom skill definition |
| `smltrackdashboard/src/` | Lead Follow-up Dashboard view |
| `smltrackdashboard/src/` | Manual Claim Admin Review UI |
| `smltrackdashboard/src/` | Dealer SLA Scorecard view |
| `smltrackdashboard/src/app/globals.css` | DINOCO branding (Orange #FF6B00, Navy #1A3A5C) |
| `smltrackdashboard/src/app/layout.tsx` | Thai font (Sarabun) |
| `docker-compose.prod.yml` | MongoDB auth, localhost-only ports |
| `.env` | All production secrets |
| `nginx/conf.d/dinoco.conf` | SSL + reverse proxy |

---

## 7. Phase Plan (Updated Final)

### Timeline v3 — Realistic (developer 1 คน, ~3 เดือน)

| Phase | สัปดาห์ | งานหลัก |
|-------|---------|--------|
| **Phase 0** | 0 (ทำทันที) | Submit Meta App Review + Setup VPS + API keys |
| **Phase 1A** | 1-2 | Rewrite AI + tools + cache + FB/IG chat ตอบได้ |
| **Phase 1B** | 3-4 | Lead Pipeline + Mayom + Flex + PDPA |
| **Phase 2** | 5-7 | Manual Claim + AI agents ทีละตัว |
| **Phase 3** | 8-12 | Advanced integration + Dashboard + Testing |
| | | *Meta App Review อาจ approve ระหว่าง Phase 1A-1B* |

---

### Phase 1A: Infrastructure + FB/IG Chat Live (สัปดาห์ 1-2)

**Goal:** Admin ตอบแชท FB/IG ได้ + AI แนะนำสินค้า + หาตัวแทน

| # | Deliverable | System | Status |
|---|------------|--------|--------|
| 1.1 | Fix ALL Critical security blockers | OpenClaw | DONE |
| 1.2 | Deploy Docker on Hetzner (Agent + Dashboard + MongoDB) | OpenClaw | TODO |
| 1.3 | SSL + Nginx + domain (`ai.dinoco.co.th`) | OpenClaw | TODO |
| 1.4 | Configure Meta webhooks (FB Page + IG Business) | OpenClaw | TODO |
| 1.5 | REWRITE `aiReplyToMeta` with Gemini Flash + Claude Sonnet | OpenClaw | BLOCKED |
| 1.6 | Fix postback handling + replyToken routing | OpenClaw | BLOCKED |
| 1.7 | Connect MCP Bridge (API key exchange) | Both | TODO |
| 1.8 | Sync KB: WP `/kb-export` to Qdrant | OpenClaw | TODO |
| 1.9 | Sync Catalog: WP `/catalog-full` to product cache | OpenClaw | TODO |
| 1.10 | Add WordPress data cache layer | OpenClaw | TODO |
| 1.11 | Customize CRM Pipeline (8 manufacturer stages) | OpenClaw | TODO |
| 1.12 | Build Lead Follow-up Pipeline (MongoDB + 7 cron jobs) | OpenClaw | TODO |
| 1.13 | Build `/distributor-notify` endpoint (LINE push) | WordPress | TODO |
| 1.14 | Build `/lead-create`, `/lead-update`, `/lead-list`, `/lead-followup-schedule` endpoints | WordPress | TODO |
| 1.15 | Build Agent #15 Mayom (Lead Follow-up Agent) | OpenClaw | TODO |
| 1.16 | Build Lead Follow-up Dashboard view | OpenClaw | TODO |
| 1.17 | Replace "น้องกุ้ง" in 30+ places with configurable name | OpenClaw | TODO |
| 1.18 | Update PDPA text to DINOCO-specific | OpenClaw | TODO |
| 1.19 | Add Flex Message sending capability | OpenClaw | TODO |

**Phase 1A Result:**
- Admin ตอบแชท FB/IG ได้ผ่าน multi-panel dashboard
- AI แนะนำสินค้าจากข้อมูลจริง (MCP Bridge) + หาตัวแทนใกล้บ้าน
- KB vector search ทำงาน (Qdrant synced)
- WordPress data cache ป้องกัน WP down

### Phase 1B: Lead Pipeline + Mayom Agent (สัปดาห์ 2-3)

**Goal:** Lead tracking + น้องกุ้งมะยมติดตามทั้งลูกค้าและตัวแทน

| # | Deliverable | System | Status |
|---|------------|--------|--------|
| 1B.1 | แยก proxy/index.js เป็น modules (lead-pipeline, claim-flow, dinoco-tools) | OpenClaw | TODO |
| 1B.2 | Build Lead Follow-up Pipeline (MongoDB + state machine) | OpenClaw | TODO |
| 1B.3 | Build `/distributor-notify` (LINE Flex + action buttons) | WordPress | TODO |
| 1B.4 | Build `/lead-create`, `/lead-update`, `/lead-list`, `/lead-get/:id` | WordPress | TODO |
| 1B.5 | Build Agent #15 Mayom (cron + event triggers) | OpenClaw | TODO |
| 1B.6 | Implement Meta 24-hour window strategy (OTN + fallback) | OpenClaw | TODO |
| 1B.7 | Build Lead Follow-up Dashboard view | OpenClaw | TODO |
| 1B.8 | Add PDPA consent flow for FB/IG (ก่อนเก็บข้อมูล) | OpenClaw | TODO |
| 1B.9 | Build Flex Message sending (product card + dealer card + images) | OpenClaw | TODO |
| 1B.10 | ลูกค้าเลือกวิธีติดต่อตัวแทน (4 ทางเลือก) | OpenClaw | TODO |

**Phase 1B Result:**
- Lead pipeline ทำงานครบ: สร้าง lead → แจ้งตัวแทน (Flex + ปุ่มกด) → ติดตาม
- น้องกุ้งมะยมติดตามทั้งลูกค้าและตัวแทน
- 24-hour window มี fallback (OTN / LINE / SMS)
- ลูกค้าเลือกวิธีติดต่อตัวแทนได้

### Phase 2: Manual Claim + Intelligence (Week 3-4)

**Goal:** Customers can claim through chat, AI agents analyze everything.

| # | Deliverable | System | Status |
|---|------------|--------|--------|
| 2.1 | Build Manual Claim Flow (state machine, 16 states) | OpenClaw | TODO |
| 2.2 | Repurpose Document AI to Claim Photo Analysis (Vision) | OpenClaw | TODO |
| 2.3 | Build `/claim-manual-create`, `/claim-manual-update`, `/claim-manual-status` | WordPress | TODO |
| 2.4 | Build Admin Claim Review UI (photos + AI analysis + approve/reject) | OpenClaw | TODO |
| 2.5 | Add "claim" route to Smart Routing | OpenClaw | TODO |
| 2.6 | Build `/brand-voice-submit` (FB/IG comments to WP) | WordPress | TODO |
| 2.7 | Build `/kb-suggest` (KB self-improvement) | WordPress | TODO |
| 2.8 | Enable Lead Scoring + Churn Prediction | OpenClaw | TODO |
| 2.9 | Customize 14 AI agents for DINOCO context | OpenClaw | TODO |
| 2.10 | Enable key agents: Sales Hunter, Support, Scoring | OpenClaw | TODO |
| 2.11 | Build warranty-check-via-chat (AI tool) | OpenClaw | TODO |
| 2.12 | Build `/member-motorcycle`, `/member-assets`, `/claim-status` endpoints | WordPress | TODO |
| 2.13 | Build webhooks: `/warranty-registered`, `/claim-status-changed` | WordPress | TODO |
| 2.14 | DINOCO Dashboard branding (Orange/Navy, Sarabun font) | OpenClaw | TODO |

**Phase 2 Result:**
- Customer claims through FB/IG chat (AI guides full process)
- Vision AI analyzes product photos
- Admin reviews + decides Case A/B/Reject in dashboard
- AI tracks claim until resolved
- Lead scoring identifies hot leads
- Churn prediction alerts for at-risk customers
- 14 AI agents run autonomously for DINOCO

### Phase 3: Advanced Integration + SLA + Unification (Week 5-8)

**Goal:** Full cross-platform view, Dealer SLA tracking, dashboard merge.

| # | Deliverable | System | Status |
|---|------------|--------|--------|
| 3.1 | Build Dealer SLA Dashboard + `/dealer-sla-report` | Both | TODO |
| 3.2 | Build `/lead-attribution` (measure lead conversion) | WordPress | TODO |
| 3.3 | Build Customer Cross-Link `/customer-link` (FB/IG to WP user) | WordPress | TODO |
| 3.4 | Enable Broadcast campaigns (FB/IG segments) | OpenClaw | TODO |
| 3.5 | Enable all 15 AI agents | OpenClaw | TODO |
| 3.6 | A/B Testing AI reply styles | OpenClaw | TODO |
| 3.7 | Build `/dashboard-inject-metrics` (FB/IG metrics into DINOCO Admin) | WordPress | TODO |
| 3.8 | Build remaining webhooks: `/kb-updated`, `/inventory-changed`, `/moto-catalog-changed` | WordPress | TODO |
| 3.9 | Build `/moto-catalog`, `/transfer-eligibility`, `/profile-updated`, `/member-registered` | WordPress | TODO |
| 3.10 | Build `/product-demand-signal` endpoint | WordPress | TODO |
| 3.11 | Merge OpenClaw analytics into DINOCO Admin Dashboard (single URL) | Both | TODO |
| 3.12 | Prepare integration with DINOCO Claim System (bidirectional sync) | Both | TODO |
| 3.13 | Telegram Bot setup (alerts channel) | OpenClaw | TODO |

**Phase 3 Result:**
- Dealer SLA scorecard (avg response time, conversion rate, ratings)
- Lead conversion tracking (FB/IG to purchase)
- Full cross-platform customer profiles
- Single admin dashboard with everything
- Ready to activate DINOCO Claim System when needed
- All 15 AI agents running 24/7

---

## 8. AI Agent Configuration (All 15)

All agents run as cron jobs in OpenClaw. Free models (OpenRouter/SambaNova) for background analytics. Gemini 2.0 Flash + Claude Sonnet for customer-facing chat only.

| # | Agent Name | Schedule | DINOCO Role | Customization Needed |
|---|-----------|----------|-------------|---------------------|
| 1 | **Problem Solver** | Every 2 hr | Detect product complaints in FB/IG chat, suggest solutions from KB, escalate to admin if unresolved | Replace generic support context with motorcycle parts issues (sticker peel, crack, key problems) |
| 2 | **Sales Hunter** | Every 1 hr | Detect purchase intent in FB/IG messages, score leads, flag hot leads | Must NOT quote retail prices. Always recommend dealers. Focus on motorcycle parts purchase signals. |
| 3 | **Sentiment Analyzer** | Every 1 hr | Score sentiment (0-100) on every conversation, alert on red (< 30) | Add Thai motorcycle community slang. Context: ลูกค้าไม่ได้ซื้อจาก DINOCO โดยตรง sentiment อาจเกี่ยวกับตัวแทน |
| 4 | **Churn Predictor** | Every 6 hr | Identify customers who haven't engaged in 3/7/30 days, trigger re-engagement | Add post-purchase churn: ลูกค้าซื้อแล้วไม่กลับมาถามเรื่องติดตั้ง/ใช้งาน |
| 5 | **Health Monitor** | Every 4 hr | System health check: API latency, error rates, AI cost, message volume | Add MCP Bridge health check: are WordPress endpoints responding? |
| 6 | **Content Creator** | Every 6 hr | Generate content ideas based on popular questions and trending topics | Focus on motorcycle parts content: installation guides, comparison posts, customer testimonials |
| 7 | **Q&A Extractor** | Every 4 hr | Extract new Q&A pairs from chat conversations for KB improvement | Extract DINOCO-specific Q&A: product compatibility, warranty conditions, installation tips |
| 8 | **Performance Analyzer** | Daily 8 AM | Analyze AI reply quality, response time, customer satisfaction scores | Include Dealer SLA metrics in analysis: dealer response time affects customer satisfaction |
| 9 | **Lead Scorer** | Every 2 hr | Score leads 0-100 based on message content, engagement, product interest | Weight factors: motorcycle model mentioned (+20), price asked (+15), location given (+25), "สนใจ" (+30) |
| 10 | **Tag Manager** | Every 2 hr | Auto-tag conversations: product category, motorcycle model, issue type | DINOCO tags: กล่องอลูมิเนียม, แคชบาร์, แร็ค, ถาดรอง, เคลม, ติดตั้ง, สอบถามราคา |
| 11 | **SLA Monitor** | Every 1 hr | Monitor response times, escalate overdue conversations | Add Dealer SLA: track time from lead creation to dealer first contact |
| 12 | **Report Generator** | Daily 20:00 BKK | Daily summary: messages, leads, claims, sentiment, conversions | Include: new leads today, dealer response stats, claims in progress, top products asked about |
| 13 | **Knowledge Updater** | Every 6 hr | Identify KB gaps from unanswered questions, suggest new entries | Submit suggestions via MCP `/kb-suggest` endpoint to WordPress |
| 14 | **CEO Agent** | Daily 6 AM | Executive summary of all agent findings, strategic recommendations | DINOCO context: manufacturer insights -- which products get most interest, which dealers perform best, claim patterns |
| **15** | **น้องกุ้งมะยม (Mayom)** | Every 30 min + events | **Lead Follow-up & Dealer SLA** -- see Section 5.3 for full spec | **NEW BUILD.** Entirely new agent. Not a customization of existing. |
| **16** | **Demand Forecaster** | Weekly จันทร์ 6 AM | วิเคราะห์ยอดสั่งตัวแทน 40+ ร้าน + trend social + ฤดูกาล → พยากรณ์ demand รายสินค้า 2-4 สัปดาห์ล่วงหน้า ให้โรงงานวางแผนผลิต | เพิ่ม: ดึง B2B order history ผ่าน `/b2b-order-check` + lead demand จาก MongoDB |
| **17** | **Compatibility Mapper** | ทุก 12 ชม. | ดึงรุ่นรถใหม่จาก social mentions + คำถามลูกค้า → flag รุ่นที่ถูกถามบ่อยแต่ไม่มีใน catalog → alert ทีม R&D | เพิ่ม: link กับ `/product-compatibility` + Product Demand Signal |
| **18** | **Warranty Intelligence** | Daily 7 AM | วิเคราะห์ pattern เคลม: สินค้าไหนเคลมบ่อย, ร้านไหนเคลมผิดปกติ, ชิ้นส่วนไหนพังซ้ำ → insight ให้ QC + ตรวจจับเคลมน่าสงสัย | เพิ่ม: ดึง claim data ผ่าน `/claim-manual-list` |
| **19** | **Distributor Scorecard** | Weekly จันทร์ 8 AM | ให้คะแนนตัวแทนแต่ละร้าน: ยอดสั่ง/หนี้ค้าง/ความถี่/อัตราเคลม/ความเร็วชำระ → เกรด A-D → แจ้ง CEO Agent ว่าร้านไหนควร nurture/เสี่ยง | เพิ่ม: ดึง data ผ่าน `/b2b-order-check` + `/dealer-sla-report` |
| **20** | **Price Shield** | ทุก 4 ชม. | scan social + marketplace (Lazada/Shopee) หาร้านที่ขายต่ำ/สูงกว่า One Price Policy → alert ทันที → รักษานโยบายราคาเดียว ป้องกัน channel conflict | NEW BUILD. ต้องมี web scraping หรือ marketplace API |

---

## 9. Dashboard Plan

### Phase 1-2: Two Separate URLs

**OpenClaw Dashboard** (`https://ai.dinoco.co.th/dashboard`)
- Chat UI: Multi-panel FB/IG chat with AI suggested replies
- CRM Pipeline: 8-stage Kanban (manufacturer flow)
- Lead Follow-up: Pipeline status, needs-attention alerts, Dealer SLA scorecard
- Manual Claim: Admin review UI (photos, AI analysis, approve/reject buttons)
- AI Agent Room: Status of all 20 agents, recent advice
- Analytics: Sentiment trends, lead funnel, response time charts (Recharts)
- Branding: Orange #FF6B00 primary, Navy #1A3A5C accent, Sarabun Thai font

**DINOCO Admin Dashboard** (`https://dinoco.co.th/admin-dashboard`)
- B2B Orders: Pipeline, Flash Express tracking
- Finance: 10 KPI boxes, Debt Aging, SVG Map 77 provinces, Claude AI analysis
- Warranty: Registration stats, claim management, Service Center
- Inventory: Product catalog, Moto Manager
- Brand Voice Pool: Social listening, sentiment breakdown
- User Management: Members, CRM (WP-side)
- AI Control Module: DISABLED (replaced by OpenClaw)

### Phase 3: Merged Dashboard

**DINOCO Admin Dashboard** becomes the single entry point:
- Embed OpenClaw metrics via `/dashboard-inject-metrics` endpoint
- New tab/section: "FB/IG Chat & Leads" showing OpenClaw data
- Link to full OpenClaw dashboard for deep-dive
- KPI cards show combined data: total leads (FB/IG), conversion rate, dealer SLA
- Admin sees everything in one place

---

## 10. Risk & Rollback

### 10.1 Risk Matrix

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| **Meta webhook fails** | FB/IG chat goes silent | Medium | Monitor with Health Agent, Telegram alert within 5 min. Fallback: manual reply via Meta Business Suite. |
| **MCP Bridge down** | AI cannot get product/dealer data | Medium | Cache layer with 1-hour TTL. AI says "รอแอดมินยืนยันนะคะ" when data unavailable. |
| **AI hallucination** | Wrong product/price/dealer info | Medium | AI only uses data from MCP Bridge (never generates). Brand voice prompt: "ห้ามกุข้อมูล". Human review before send (Phase 1). |
| **Dealer does not respond** | Lead dies, customer frustrated | High | Mayom agent escalates after 24hr. SLA flag on dealer. Admin re-assigns to different dealer. |
| **MongoDB data loss** | Leads and claims lost | Low | Daily automated backup. Leads also synced to WP via MCP endpoints. |
| **Gemini Flash rate limit** | AI replies stop | Low | Automatic fallback to Claude Sonnet. Free models for non-customer-facing. |
| **WordPress API key leaked** | Unauthorized access to MCP Bridge | Low | IP whitelist (Hetzner VPS only). Rotate key via wp_options. Rate limiting. |
| **Finance data exposure** | Confidential B2B data leaked | Critical | 10 financial endpoints REMOVED. No debt/pricing/payment data crosses MCP Bridge. Ever. |
| **OpenClaw Docker crash** | Everything OpenClaw stops | Medium | Docker restart policy: `always`. Health check every 30s. Telegram alert. |
| **LINE B2B disruption** | Dealers can't order | Critical | LINE stays 100% in WordPress. OpenClaw never touches B2B webhook. Zero risk to B2B. |

### 10.2 Rollback Plan

**Level 1 -- OpenClaw AI only (30 seconds):**
- Change Meta webhook URL back to "off" (or point to a 200-OK stub)
- Customers see no response from FB/IG (same as before integration)
- All WordPress systems continue working normally
- Admin replies manually via Meta Business Suite

**Level 2 -- Revert LINE (if ever switched, 30 seconds):**
- Change LINE webhook URL back to WordPress in LINE Developers Console
- Re-activate old AI Control Module snippet in WP Code Snippets
- All B2B flows restored immediately

**Level 3 -- Full rollback (5 minutes):**
- Stop Docker containers on Hetzner: `docker compose down`
- Remove Meta webhook URLs
- Revert LINE webhook (if changed)
- Re-activate WP AI Control Module
- All data in WordPress is UNTOUCHED throughout (MCP Bridge is read-heavy)
- MongoDB data preserved on Hetzner for future retry

**Key principle:** WordPress is never destructively modified. OpenClaw is additive. Rollback = turn off OpenClaw.

---

## Appendix 0: สิ่งที่ยังไม่มี Code (ต้อง Build ก่อน Go-Live)

| # | สิ่งที่ต้อง build | ระดับ | อยู่ Phase ไหน |
|---|------------------|------|---------------|
| 1 | **aiReplyToMeta rewrite** — เปลี่ยนจาก callLightAI (free models ไม่มี tools) เป็น Gemini Flash + Claude Sonnet พร้อม function calling | CRITICAL | Phase 1A |
| 2 | **PDPA consent flow** — ข้อความแรกที่ลูกค้าทัก FB/IG ต้องแจ้ง PDPA + ขอ consent ก่อนเก็บข้อมูล | CRITICAL | Phase 1A |
| 3 | **24hr window + OTN implementation** — Window tracking + OTN opt-in + fallback LINE/SMS | CRITICAL | Phase 1B |
| 4 | **Meta App Review** — submit ทันที รอ 1-4 สัปดาห์ (ควบคุมไม่ได้) | HIGH | Phase 0 |
| 5 | **Prompt injection filter ภาษาไทย** — detect "ลืมคำสั่ง", "เปลี่ยนบทบาท" + output sanitization (ราคาต้นทุน, dealer price) | MEDIUM | Phase 1A |
| 6 | **MongoDB indexes** — compound indexes สำหรับ leads, claims, follow_ups ตาม plan I7 | MEDIUM | Phase 1B |
| 7 | **Data reconciliation script** — export pending leads/claims จาก MongoDB สำหรับ rollback | MEDIUM | Phase 1B |
| 8 | **B2B Order → Lead Link webhook** — WordPress fire webhook เมื่อตัวแทนสั่งของ → link กับ lead | HIGH | Phase 1B |
| 9 | **Flash Express → Lead webhook** — WordPress fire webhook เมื่อ shipment status เปลี่ยน | MEDIUM | Phase 2 |

---

## Appendix A: Environment Variables (.env)

```env
# MongoDB (Docker internal)
MONGODB_URI=mongodb://dinoco:STRONG_PASSWORD@mongodb:27017/dinoco?authSource=admin
MONGODB_DB=dinoco

# LINE OA (existing DINOCO credentials)
LINE_CHANNEL_ACCESS_TOKEN=<from B2B_LINE_ACCESS_TOKEN>
LINE_CHANNEL_SECRET=<from B2B_LINE_CHANNEL_SECRET>

# AI Providers (customer-facing -- PAID)
GOOGLE_API_KEY=<Gemini 2.0 Flash -- primary>
ANTHROPIC_API_KEY=<Claude Sonnet -- fallback>
PAID_AI_ENABLED=true

# AI Providers (background analytics -- FREE)
OPENROUTER_API_KEY=<from openrouter.ai>
SAMBANOVA_API_KEY=<from sambanova.ai>

# Vector DB
QDRANT_URL=<from cloud.qdrant.io>
QDRANT_API_KEY=<from qdrant>

# MCP Bridge
MCP_ERP_URL=https://WORDPRESS_DOMAIN/wp-json/dinoco-mcp/v1/
MCP_ERP_API_KEY=<generate strong 64-char key>

# Dashboard Auth
GOOGLE_CLIENT_ID=<Google OAuth>
GOOGLE_CLIENT_SECRET=<Google OAuth>
NEXTAUTH_SECRET=<random 32 chars>
NEXTAUTH_URL=https://ai.dinoco.co.th

# Alerts
TELEGRAM_BOT_TOKEN=<create Telegram bot>
TELEGRAM_CHANNEL_ID=<admin channel>

# Security
API_SECRET_KEY=<random 64 chars>

# Branding
DEFAULT_BOT_NAME=DINOCO Assistant
```

## Appendix B: Go-Live Checklist

### B1. Infrastructure
- [ ] Docker containers running on Hetzner with health checks passing
- [ ] Docker network isolation (frontend/backend networks แยก)
- [ ] SSL certificate active on `ai.dinoco.co.th`
- [ ] MongoDB running with authentication + backup cron ทุกวัน
- [ ] Uptime Robot ping `/health` ทุก 5 นาที → Telegram alert

### B2. Meta Platform (Facebook + Instagram)
- [ ] Meta App Review **approved** (permissions: pages_messaging, instagram_manage_messages)
- [ ] IG เป็น Business Account ที่ link กับ FB Page แล้ว
- [ ] Meta webhooks receiving (ทดสอบส่งข้อความจริง)
- [ ] OTN permission approved (one_time_notification_tokens) ← ถ้ายังไม่ผ่านให้ระบุ

### B3. AI Chat Engine
- [ ] `aiReplyToMeta` rewritten → Gemini Flash (primary) + Claude Sonnet (fallback)
- [ ] Function calling ทำงานจริง (ทดสอบถามสินค้า → ได้ราคาจริง)
- [ ] FB: ส่ง Generic Template (card+image+button) ได้
- [ ] IG: fallback ส่ง image + text แยก ได้
- [ ] Auto-reply 5 นาที ทำงาน + ดึงข้อมูลจริง (ไม่ใช่ข้อความกลางๆ)
- [ ] Postback events handled (Rich Menu, Quick Reply)

### B4. MCP Bridge
- [ ] API key exchanged และ `hash_equals` + IP whitelist ทำงาน
- [ ] Rate limiting 60 req/min ทำงาน
- [ ] 6 existing endpoints ทดสอบผ่าน (product, dealer, warranty, KB, export, catalog)
- [ ] `dealer-lookup` แก้แล้ว — ใช้ post_id ไม่ใช่ array index
- [ ] `warranty-check` แก้แล้ว — exact match + ลบ owner_name จาก response
- [ ] kb-export มี pagination (ไม่ใช่ posts_per_page=-1)

### B5. Lead Follow-Up Pipeline
- [ ] Lead creation ทำงาน (ลูกค้าสนใจ → สร้าง lead อัตโนมัติ)
- [ ] ตัวแทนได้ LINE Flex พร้อมปุ่ม (โทรลูกค้า / รับแล้ว / ดูรายละเอียด)
- [ ] Follow-up cron jobs ทำงาน (7 ตัว)
- [ ] Agent #15 Mayom responding to events
- [ ] Lead Dashboard แสดง pipeline status + needs-attention queue

### B6. Meta 24-Hour Window Safety ⚠️
- [ ] Window tracking: คำนวณ window_expires_at ทุกข้อความลูกค้า
- [ ] CLOSING_SOON trigger (เหลือ < 2 ชม.): ส่งข้อความสุดท้ายมี value + ขอเบอร์/LINE
- [ ] Window CLOSED: **ไม่ส่ง FB/IG อีกเลย** (verify ด้วย log)
- [ ] Follow-up method selection: LINE → OTN → SMS → admin (ตามลำดับ)
- [ ] OTN opt-in ส่งได้ 1 ครั้ง/session (ไม่ซ้ำ)
- [ ] OTN token ใช้ได้ 1 ครั้ง (mark used หลังส่ง)
- [ ] IG leads ที่ไม่มี contact info → ย้ายเข้า admin_manual queue
- [ ] **VERIFY**: ไม่มี Message Tags ถูกใช้ในโค้ดทั้งหมด (grep ตรวจ)
- [ ] **VERIFY**: ไม่มี pattern "ส่งทุก 23 ชม." หรือ incentivized reply

### B7. Safety Rules Enforcement (ห้ามฝ่าฝืนเด็ดขาด)
- [ ] Rule 1: ห้ามส่ง FB/IG หลัง window หมด (ยกเว้น OTN ที่ลูกค้ากดอนุญาต)
- [ ] Rule 2: ห้ามใช้ Message Tags กับ lead follow-up
- [ ] Rule 3: ห้ามส่ง > 2 ข้อความติดกันถ้าลูกค้าไม่ตอบ
- [ ] Rule 4: ห้าม incentivize reply ("ตอบรับโปรโมชั่น")
- [ ] Rule 5: ห้ามส่ง OTN opt-in ซ้ำ (1 ครั้ง/session)
- [ ] Rule 6: ทุก follow-up ต้องมี value จริง (ไม่ใช่ข้อความกลางๆ)
- [ ] **TEST**: ส่งข้อความจาก test user → รอ 25 ชม. → verify ว่าระบบไม่ส่งอะไร
- [ ] **TEST**: ลูกค้า IG ไม่ให้เบอร์ → verify ย้ายเข้า admin queue ไม่ส่ง IG

### B8. Data & Privacy
- [ ] PDPA consent message ส่งข้อความแรกที่ลูกค้าทัก (ก่อนเก็บข้อมูล)
- [ ] PDPA text ระบุชื่อ DINOCO + data controller + ช่องทางลบข้อมูล
- [ ] EXIF stripped จากรูปเคลมก่อนเก็บ
- [ ] Upload files มี access control (requireAuth)
- [ ] warranty-check ไม่ส่ง owner_name ข้ามระบบ
- [ ] ข้อมูลการเงิน (debt, pricing, payment) ไม่มีทางข้ามไป OpenClaw
- [ ] Data retention: lead > 90 วัน ถูกลบ, claim > 1 ปี ถูกลบ (cron)

### B9. Security
- [ ] LINE signature: `crypto.timingSafeEqual` ✓
- [ ] Meta signature: `crypto.timingSafeEqual` ← **ต้องแก้ก่อน**
- [ ] requireAuth: `crypto.timingSafeEqual` ← **ต้องแก้ก่อน**
- [ ] API key ไม่รับจาก query string (header only)
- [ ] sanitizeId ใช้จริงทุกจุดที่รับ sourceId
- [ ] API_SECRET_KEY ถ้าไม่ตั้ง → 503 (ไม่ใช่ bypass)
- [ ] FB_APP_SECRET ถ้าไม่ตั้ง → 503 (ไม่ใช่ empty string HMAC)
- [ ] Gateway password ใช้ env variable (ไม่ hardcode)
- [ ] Prompt injection defense: system prompt + output sanitization + tool rate limit
- [ ] Error messages ไม่ leak internal info (generic error only)

### B10. Branding & UX
- [ ] Dashboard สี DINOCO (Orange #FF6B00, Navy #1A3A5C)
- [ ] Thai font Sarabun ทำงาน
- [ ] "น้องกุ้ง" replaced ทุกจุดที่ลูกค้าเห็น
- [ ] DINOCO brand voice prompt active
- [ ] Old AI Control Module deactivated (not deleted)

### B11. Existing Systems (No Regression)
- [ ] LINE webhook URL **NOT** changed (stays in WordPress)
- [ ] B2B order flow tested: สั่งของ → Flex confirm → slip → shipping ทำงานปกติ
- [ ] B2B cron jobs (13 ตัว) ทำงานปกติ
- [ ] Finance Dashboard ทำงานปกติ
- [ ] Warranty registration ทำงานปกติ
- [ ] GitHub Webhook Sync ทำงานปกติ

### B12. Monitoring & Rollback Ready
- [ ] Uptime Robot + Telegram alert configured
- [ ] Structured logging (winston/pino) ไม่ใช่ console.log
- [ ] Health check endpoint: `/health` returns { status, uptime, db, mcp_bridge }
- [ ] Circuit breaker: MCP Bridge fail 3 ครั้ง → หยุดเรียก + alert
- [ ] Rollback documented: เปลี่ยน Meta webhook URL → off = 30 วินาที
- [ ] MongoDB export script ready (สำหรับ data reconciliation ถ้า rollback)
- [ ] Monitor 48 hours before declaring stable

## Appendix C: File Reference

**WordPress files (existing, to modify):**
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[System] DINOCO MCP Bridge` -- add 25 endpoints

**WordPress files (new):**
- `[System] DINOCO Manual Claim System` -- CPT + Admin UI (when needed for WP-side claim management)

**OpenClaw files (to modify):**
- `openclawminicrm/proxy/index.js` -- AI rewrite, lead pipeline, claim flow, cache, routing
- `openclawminicrm/openclaw/openclaw.json` -- config updates
- `openclawminicrm/openclaw/cron/jobs.json` -- add 7 lead follow-up cron jobs
- `openclawminicrm/openclaw/skills/smltrack-advisor/SKILL.md` -- DINOCO context for 14 agents
- `openclawminicrm/smltrackdashboard/src/app/globals.css` -- DINOCO colors
- `openclawminicrm/smltrackdashboard/src/app/layout.tsx` -- Thai font
- `openclawminicrm/docker-compose.prod.yml` -- MongoDB auth, localhost ports
- `openclawminicrm/nginx/conf.d/dinoco.conf` -- SSL reverse proxy

**OpenClaw files (new):**
- `openclawminicrm/openclaw/skills/lead-followup/SKILL.md` -- Agent #15 Mayom
- `openclawminicrm/.env` -- production secrets

**Documentation (this repo):**
- `MASTER-PLAN.md` -- THIS FILE (single source of truth)
- `INTEGRATION-ARCHITECTURE.md` -- detailed specs (MongoDB schemas, state machines, cron definitions)
