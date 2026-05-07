# DINOCO Chatbot Rules — Canonical Brain

> **ไฟล์นี้คือ "สมองกลาง" ของ chatbot DINOCO**
> ทุก rule ในไฟล์นี้คือสิ่งที่ถูกแก้ไปแล้ว **ห้ามเปลี่ยน** เวลาแก้ feature อื่น
> ก่อนแก้อะไรที่เกี่ยวกับ chatbot (ai-chat.js, shared.js, dinoco-tools.js) **ต้องอ่านไฟล์นี้ก่อนเสมอ**

**Last updated:** 2026-05-07 | **Version:** 1.6
**Regression status:** 25/25 PASS (100%) — Gate verified stable | Section 15 v2.13 implementation wired in dinoco-tools.js V.6.2 + Section 15.14 Round 3 (2026-05-07) deltas — sn-webhook.js V.1.0 listener (POST /webhook/sn-event), Crockford alphabet strict regex (excludes I/L/O/U), validateSnFormat() helper, OCR misread-suspect classification (less aggressive escalation), 5 new training scenarios (15.14.7 extension)

---

## วิธีใช้ไฟล์นี้

1. **ก่อนแก้ chatbot** → อ่านไฟล์นี้ทั้งหมด
2. **เจอปัญหาใหม่** → เช็คว่ามี rule อยู่แล้วไหม ถ้ามีแค่ใช้ ไม่ต้องคิดใหม่
3. **เพิ่ม rule ใหม่** → ต้องมี context (bug ที่เจอ) + fix + test case + date
4. **ห้ามลบ rule** — ถ้ารู้สึกว่า rule ขัดกัน ให้ถามบอสก่อน ห้ามตัดสินใจเอง

---

## 1. Product Knowledge Rules

### 1.1 DINOCO Edition NX500
- **Rule:** "ตัวแต่งจากศูนย์" / "ตัวแต่งศูนย์" = DINOCO Edition เท่านั้น (ไม่ต้องถาม)
- **มีมาแล้ว:** แร็คหลัง PRO + กันล้ม + กล่องหลัง 45L **สีเงิน** + การ์ดแฮนด์
- **แนะนำเพิ่ม:** SKU `DNCGND37LSPROS` (Set Side Case 37L + Pro Side Rack **สีเงิน**) เท่านั้น
- **ห้าม:** แนะนำสีดำ, Full Set PRO (เพราะมีแร็คหลังแล้ว), Pro Rack Full
- **Context:** ลูกค้า "เปรม" ถาม NX500 ตัวแต่งศูนย์ bot แนะนำผิดซ้ำๆ — กล่องหลังสีเงินอยู่แล้ว ต้องเข้าชุดสีเงิน
- **File:** `shared.js` line 57-59
- **Date:** 2026-04-07

### 1.2 ห้ามเอ่ยชื่อแบรนด์คู่แข่ง
- **Rule:** ห้ามพูดถึง H2C, GIVI, SW-Motech, SRC, Kappa, SHAD เด็ดขาด
- **เหตุผล:** ไม่ให้ลูกค้ารู้จักแบรนด์อื่น + สินค้า DINOCO ใช้ร่วมกับแบรนด์อื่นไม่ได้
- **Context:** Bot เคยถามลูกค้า "DINOCO Edition หรือ H2C Edition" — ลูกค้าไม่ควรรู้จัก H2C
- **File:** `shared.js` line 59, 87
- **Date:** 2026-04-07

### 1.3 วัสดุต้องตรงสินค้า — ห้ามรวมมั่ว
- **กันล้ม / แคชบาร์ / การ์ดเครื่อง** = **สแตนเลส 304** (ไม่ใช่อลูมิเนียม)
- **กล่อง / แร็ค** = **อลูมิเนียม 5052** (ไม่ใช่สแตนเลส)
- **ห้าม:** ตอบ "วัสดุพรีเมียม (สแตนเลส 304 + อลูมิเนียม 5052)" เมื่อลูกค้าถามสินค้าเฉพาะ
- **Context:** ลูกค้าถาม "กันล้มดีกว่า SRC ยังไง" bot ตอบรวมวัสดุมั่ว
- **File:** `shared.js` line 88, `ai-chat.js` COMPETITOR hint
- **Date:** 2026-04-07

### 1.4 X Travel Pro เลิกขาย
- **Rule:** ถ้าลูกค้าถาม "X Travel Pro" → ตอบ "รุ่นปัจจุบันเป็น Grand Travel ค่ะ"
- **ห้าม:** เสนอ X Travel Pro ทุกกรณี
- **File:** `shared.js` + `dinoco-tools.js` product filter (`b2b_visible`)
- **Date:** 2026-04-06

### 1.5 ADV160 ไม่มีสินค้า DINOCO
- **Rule:** ลูกค้าบอก "ADV" ไม่ระบุรุ่น → "DINOCO มีสำหรับ ADV350 ค่ะ ส่วน ADV160 ยังไม่มีนะคะ"
- **ห้าม:** ถามลูกค้าว่า "รุ่นไหน" แล้วตอบแบบไม่รู้
- **File:** `shared.js` line 51
- **Date:** 2026-04-06

### 1.6 Side Rack ≠ มือจับ
- **Rule:** "ถอดมือจับท้ายรถ" เกี่ยวกับ **Rear Rack** (แร็คหลัง) เท่านั้น
  - Rear Rack STD → ถอดมือจับ
  - Rear Rack PRO → ไม่ต้องถอด
- **Side Rack + Side Case** = แร็คข้าง+กล่องข้าง → **ไม่เกี่ยวกับมือจับเลย**
- **ห้าม:** พูดคำว่า "มือจับ" / "ถอดมือจับ" / "ใช้เป็นมือจับ" / "มือจับคนซ้อน" เมื่อพูดถึง Side Rack/Side Case/กล่องข้าง/แร็คข้าง เด็ดขาด
- **Reply template:** ลูกค้าถาม "Side Rack ใช้เป็นมือจับคนซ้อนได้ไหม" → "Side Rack เป็นแร็คสำหรับยึดกล่องข้างค่ะ ไม่ใช่มือจับคนซ้อนนะคะ"
- **Context:** Bot ตอบ "กล่องข้าง Pro ที่ไม่ต้องถอดมือจับ" — ผิด / REG-003: ลูกค้าถาม Side Rack ใช้เป็นมือจับได้ไหม bot ยังเอาคำว่า "มือจับ" มาอธิบาย
- **File:** `shared.js` HARD BANS + INTENT DETECTION section (Rear vs Side Rack)
- **Date:** 2026-04-07 / updated 2026-04-10

### 1.7 ADV350/Forza350 ไม่มีกล่องข้าง
- **Rule:** กล่องข้าง (Side Case) มีเฉพาะ **NX500, CB500X** เท่านั้น
- **ห้าม:** เสนอกล่องข้างให้ ADV350/Forza350
- **File:** `shared.js` line 56
- **Date:** 2026-04-06

### 1.8 ใช้ชื่อสินค้าเต็มจาก tool result
- **Rule:** ชื่อสินค้าต้องมาจาก `dinoco_product_lookup` tool result เท่านั้น — ห้ามย่อ ห้ามคิดเอง
- **ราคา:** ต้องมาจาก tool result เท่านั้น — ห้าม hardcode
- **ยกเว้น:** บอก category/type ก่อนได้ (เช่น "Full Set STD / PRO") แล้วค่อยบอกชื่อเต็มตอนลูกค้าเลือก
- **File:** `shared.js` line 52-54
- **Date:** 2026-04-07

---

## 2. Tone & Language Rules

### 2.1 เรียกลูกค้า
- **Rule:** ใช้ "คุณลูกค้า" หรือ "ลูกค้า" เท่านั้น
- **ห้าม:** "พี่", "น้อง", "ดิฉัน", "ยินดีให้บริการ", "ยินดีรับใช้", "ด้วยความยินดี", "รับใช้"
- **Greeting template:** ทักครั้งแรก → "สวัสดีค่ะลูกค้า มีอะไรให้แอดมินช่วยดูแลคะ 😊"
- **Context:** ลูกค้าบอก "ดิฉัน ไม่มีใครเค้าใช้กัน" / REG-025: bot ทักกลับด้วย "ยินดีให้บริการ" ซึ่งเป็นคำต้องห้าม
- **File:** `shared.js` HARD BANS + น้ำเสียง section
- **Date:** 2026-04-06 / updated 2026-04-10

### 2.2 ลงท้าย
- **Rule:** ใช้ "ค่ะ / คะ / นะคะ / ไหมคะ"
- **ห้าม:** "ครับ" (bot เป็นผู้หญิง), "จ้า", "เด้อ", "นะจ๊ะ"
- **File:** `shared.js` tone rules

### 2.3 ห้ามเผยเป็น AI
- **Rule:** ห้ามบอกว่า "เป็น AI", "บอท", "ระบบอัตโนมัติ"
- **Fallback:** Claude Sonnet supervisor ตรวจจับ + แก้ให้
- **File:** `ai-chat.js` claudeSupervisor rule 6
- **Date:** 2026-04-06

---

## 3. Conversation Flow Rules

### 3.1 Context Awareness — ห้ามถามซ้ำ
- **Rule:** ดูประวัติก่อนตอบทุกครั้ง
- **ห้าม:**
  - ลูกค้าบอกรุ่นรถแล้ว → ห้ามถามซ้ำ
  - ลูกค้าบอก "สอบถามสินค้า" → ห้ามตอบ "มีอะไรให้ช่วย"
  - ลูกค้าพิมพ์ตัวเลข (4400) หลังพูดถึงสินค้า → เข้าใจว่าหมายถึงราคา
  - ลูกค้าพิมพ์ "ตัวนี้"/"อันนี้" → อ้างอิงสินค้าจากประวัติ
  - **★ ลูกค้าพิมพ์ "มีรูปไหม"/"ขอดูรูป"/"ส่งรูป" หลังคุยสินค้า+รุ่นรถแล้ว → ใช้รุ่น+สินค้าล่าสุดใน history ทันที ห้ามถามรุ่นซ้ำ** (REG-020)
- **ข้อยกเว้น:** ถ้าใน history ไม่มีรุ่นรถเลย ถึงจะถามได้
- **File:** `shared.js` HARD BANS + CONTEXT AWARENESS section

### 3.2 ห้ามบอกราคาซ้ำเมื่อลูกค้าถามเรื่องอื่น
- **Rule:** ถ้าเพิ่งบอกราคาไปแล้ว + ลูกค้าถามเรื่องอื่น (เช่น ถามร้าน) → ห้ามบอกราคาอีก
- **Context:** ลูกค้าเลือกสินค้าแล้ว ถาม "รามอินทราติดได้ที่ไหน" → bot ตอบราคาซ้ำ
- **File:** `ai-chat.js` `dealerIntentButPriceReply` detector
- **Date:** 2026-04-07

### 3.3 ส่งรูปเมื่อเหลือ 1-2 ตัวเลือก
- **Rule:** เหลือ 1-2 ตัวเลือก (สีดำ/สีเงิน, สินค้าตัวเดียว) → ส่งรูปประกอบทันที ไม่ต้องรอลูกค้าขอ
- **File:** `shared.js` line 62

### 3.4 FB Image URL Handling
- **Rule:** ใช้ robust regex match `.jpg/.png/.webp/.gif` + WP upload URLs + query strings
- **ต้อง:** ส่ง `sendMetaImage()` แยกจาก text message
- **ห้าม:** ส่ง URL เป็น text
- **Safety net:** cleanup URL ออกจาก text ก่อนส่ง
- **File:** `ai-chat.js` V.6.1 `aiReplyToMeta`
- **Date:** 2026-04-07

---

## 4. Intent Detection & Routing

### 4.1 Dealer Inquiry → coordinate + lead
- **Pattern:** ลูกค้าถาม "ร้าน", "ตัวแทน", "ซื้อที่ไหน", "ติดที่ไหน", "[จังหวัด] + ติดตั้ง"
- **Action:**
  1. เรียก `dinoco_dealer_lookup` ทันที
  2. แนะนำร้านใกล้บ้าน
  3. **Append** "ถ้าสะดวกแจ้งชื่อและเบอร์โทร แอดมินจะประสานให้ตัวแทนติดต่อกลับเลยนะคะ"
- **Detection:** Output-based regex (ไม่พึ่ง Gemini intent)
- **Regex:** `/ร้าน.*โทร|โทร\s*\d{2,3}[-.]\d{3}[-.]\d{4}|SHOP|ตัวแทน.*จำหน่าย/i`
- **File:** `ai-chat.js` V.6.3 post-process append
- **Date:** 2026-04-07

### 4.2 Auto-Lead Trigger
- **Trigger:** ลูกค้าส่งเบอร์โทร 9-10 หลัก **หลังจาก** bot พูด "แจ้งชื่อและเบอร์" / "ประสานให้ตัวแทน"
- **Action (bypass AI):**
  1. แยกชื่อ (text ที่ไม่ใช่ตัวเลข) + เบอร์ (ตัวเลข)
  2. Extract product + province จาก recent messages
  3. Resolve dealer จาก MongoDB
  4. Insert lead + Flex card ไปกลุ่มตัวแทน
  5. ตอบยืนยัน "ขอบคุณค่ะคุณ[ชื่อ] แอดมินจะประสานให้ร้าน [ร้าน]"
- **ใช้:** `getRecentMessages(sourceId, 5)` ไม่ใช่ vector search
- **File:** `ai-chat.js` V.6.5+ `aiReplyToLine` / `aiReplyToMeta`
- **Date:** 2026-04-07

### 4.3 Claim Intent — Strict 2-Level
- **Rule:** "สอบถามสินค้า" / "ถามข้อมูล" → **ไม่ใช่ claim**
- **Claim trigger:**
  - Level 1 (explicit): "เคลม", "ของเสีย", "ชำรุด", "พัง", "แตก"
  - Level 2 (symptoms + product context): "หลุด", "ร่วง", "หัก" + เคยพูดสินค้าก่อน
- **Timeout:** 24 ชม. (ลดจาก 48)
- **AI ห้าม:** ตัดสินว่าซ่อมได้/ไม่ได้/ฟรี/เปลี่ยน — ทีมช่างตัดสิน
- **File:** `claim-flow.js` V.3.0 `isClaimIntent`
- **Date:** 2026-04-06

---

## 5. Anti-Hallucination Rules

### 5.1 Claude Supervisor Review Text Leak
- **Bug:** Claude return "ตรวจสอบแล้ว พบข้อผิดพลาด: ..." → โค้ดส่งเป็นคำตอบให้ลูกค้า
- **Fix:** ถ้า review text match `/ตรวจสอบแล้ว|พบข้อผิดพลาด|ปัญหา:|คำตอบที่แก้แล้ว|เหตุผล:|วิเคราะห์|ข้อสังเกต|สรุป:|แก้ไข:|---/` → fallback ใช้ Gemini เดิม
- **File:** `ai-chat.js` V.8.1 line ~1227
- **Date:** 2026-04-08

### 5.2 Claude Empty Revision ≠ Hallucination
- **Rule:** ถ้า Claude return ว่าง/สั้น (< 5 chars) → ใช้ Gemini reply (ไม่ใช่ hallucination, ไม่แจ้ง Telegram)
- **Bug:** เดิมแจ้ง hallucination alert แม้ revision ว่าง → noise ใน Telegram
- **File:** `ai-chat.js` V.4.2 line ~1232
- **Date:** 2026-04-07

### 5.3 PII Masking ใน Conversation History
- **Bug:** เบอร์โทรลูกค้าใน history ทำ Gemini trigger SAFETY filter → return null
- **Fix:** เรียก `cleanForAI()` กับทุก message content ก่อนส่ง AI
- **File:** `ai-chat.js` V.6.2 `aiReplyToLine` / `aiReplyToMeta` contextStr builder
- **Date:** 2026-04-08

### 5.4 Exact Match "OK" Only
- **Rule:** Claude approved ต้อง return `"OK"` หรือ `"ok"` exact match เท่านั้น
- **ห้าม:** substring match "ดีแล้วค่ะ แต่..." (false positive)
- **File:** `ai-chat.js` V.1.4 claudeSupervisor
- **Date:** 2026-04-06

### 5.5 3-Layer Anti-Hallucination
1. **Intent pre-check** — detect intent ก่อนเรียก AI
2. **Pre-inject KB** — ใส่ KB results เข้า system prompt
3. **Context-aware supervisor** — Claude ตรวจ + ส่ง tool results ให้ Claude review
- **File:** `ai-chat.js` V.4.0

---

## 6. Tool Calling Rules

### 6.1 dinoco_product_lookup
- **Rule:** ต้องเรียกทุกครั้งที่ลูกค้าถามราคา/สินค้า — ห้ามตอบจากความจำ
- **Filter:** `b2b_visible=true` เท่านั้น (ไม่เสนอสินค้าที่หยุดขาย)
- **File:** `dinoco-tools.js` + WP MCP `/product-lookup`

### 6.2 dinoco_dealer_lookup
- **Return format:** text ที่ AI อ่านเข้าใจได้ (ไม่ใช่ JSON raw)
- **MongoDB first:** ค้น `dealers` collection ก่อน (USE_MONGODB_DEALERS=true)
- **Fallback:** KB search + WP `/dealer-lookup`
- **File:** `dinoco-tools.js` V.5.0

### 6.3 dinoco_create_lead
- **Params:** customer_name, phone, product_interest, province, dealer_name, image_url, price
- **Flow:** insert MongoDB → `notifyDealerDirect()` (LINE Flex ตรง) → update status `dealer_notified`
- **ห้าม:** notify 2 ครั้ง (centralize ที่ `notifyDealerDirect` จุดเดียว)
- **File:** `dinoco-tools.js` V.5.0

### 6.4 dinoco_create_claim
- **Params:** symptoms, phone (บังคับ), product, photos
- **Platform detect:** จาก sourceId prefix (`fb_` / `ig_` / ไม่มี = line)
- **ห้าม:** hardcode platform = "facebook"
- **File:** `dinoco-tools.js` V.3.1

---

## 7. LINE Messaging Rules

### 7.1 Flex ทุก push
- **Rule:** ทุก LINE push message = **Flex card** เท่านั้น (ประหยัด token + สวยงาม + มีปุ่ม action)
- **ยกเว้น:** postback reply (ฟรี ใช้ text ได้)
- **Flex builders:** LeadNotify, FollowUp, StockBack, DealerReminder, Closed
- **File:** `lead-pipeline.js` V.2.0

### 7.2 Lead Notify Flex Design
- **Header:** สีดำ + DINOCO logo + "DINOCO CO DEALER" + platform badge (FB/LINE/IG)
- **Hero:** รูปสินค้าจาก catalog
- **Body:** ชื่อเต็ม + ราคา + ข้อมูลลูกค้า (ชื่อ/เบอร์/จังหวัด) + urgency bar
- **Footer:** ปุ่มโทรลูกค้า (tel:) + ปุ่มรับแล้ว (postback)
- **File:** `lead-pipeline.js` `buildLeadNotifyFlex()`

### 7.3 LINE Token
- **Rule:** `LINE_CHANNEL_ACCESS_TOKEN` ต้องเป็น token เดียวกับ `B2B_LINE_ACCESS_TOKEN` ใน WP (DINOCO B2B System bot)
- **Fallback chain:** MongoDB `account_keys.lineConfig.channelAccessToken` → `process.env.LINE_CHANNEL_ACCESS_TOKEN`
- **File:** `.env` + `shared.js` `getDynamicKeySync()`

---

## 8. Data Confidentiality Rules

### 8.1 ห้ามส่งข้อมูลความลับไป third-party AI
- **ห้าม:** ยอดขาย, หนี้ตัวแทน, ราคาต้นทุน, ส่วนลด, โปรโมชั่น, จำนวนสต็อก
- **Rule:** ข้อมูลเหล่านี้ไม่ข้ามออก WordPress → ไม่มีใน OpenClaw MCP tools
- **File:** MCP Bridge — ลบ financial endpoints ทั้งหมด

### 8.2 One Price Policy
- **Rule:** ไม่มีโปรโมชั่น ไม่มีส่วนลด ซื้อกี่ชิ้นราคาเท่ากัน
- **ถ้าลูกค้าถามลด:** "DINOCO เป็นนโยบาย One Price ค่ะ"
- **ถ้าลูกค้าถามซื้อจำนวนเยอะ (BULK_INQUIRY):** แนะนำเปิดตัวแทนจำหน่าย — template: "DINOCO เป็นนโยบาย One Price ค่ะ ไม่มีส่วนลดจำนวนเยอะ แต่ถ้าลูกค้าสนใจขายเป็นตัวแทนจำหน่ายสามารถสมัครเป็นตัวแทนได้นะคะ จะได้ราคาตัวแทนค่ะ"
- **Trigger words:** "เอา 20 ตัว", "ทำร้าน", "เหมา", "ลงร้านผม", "หลายสิบตัว", "ส่งต่างจังหวัด", "เปิดร้าน"
- **ห้ามใช้คำเด็ดขาด:** "ราคาพิเศษ", "ลดราคา", "ส่วนลด", "ราคาส่ง", "ถูกกว่า", "จัดให้", "ราคาดีๆ", "เหมาถูกกว่า"
- **Context:** REG-018: ลูกค้าถามเอา 20 ตัวไปลงร้าน bot ตอบว่าจะเสนอ "ราคาพิเศษ" ซึ่งเป็นคำต้องห้าม
- **File:** `shared.js` HARD BANS + INTENT DETECTION (BULK_INQUIRY)

### 8.3 ประกัน 5 ปี
- **ห้าม:** พูด "ประกันตลอดอายุ/ตลอดชีพ"
- **Max:** 5 ปี
- **File:** `shared.js`

---

## 9. Docker/Deploy Rules

### 9.1 ทุก service อยู่ใน docker-compose
- **ห้าม:** ใช้ `docker network connect --alias` แก้ปัญหา (หลุดทุก rebuild)
- **Rule:** MongoDB + Agent + Dashboard + Nginx ต้องอยู่ใน compose เดียวกัน
- **File:** `docker-compose.prod.yml`

### 9.2 MongoDB volume
- **Rule:** volume name = `mongo-data` (ไม่ใช่ `mongodb-data`)
- **Bug:** ผิดชื่อ = ข้อมูล 624 KB entries หาย

### 9.3 Nginx port 80
- **Rule:** port 80 serve ตรง (ไม่ redirect HTTPS)
- **Reason:** Cloudflare Tunnel เข้า HTTP, ถ้า nginx redirect = loop
- **File:** `nginx/conf.d/default.conf`

### 9.4 Deploy one-liner
```bash
cd /opt/dinoco && git pull origin main && cd openclawminicrm && docker compose -f docker-compose.prod.yml up -d --build agent dashboard && sleep 10 && docker logs smltrack-agent --tail 10
```
- **Server:** `root@5.223.95.236` (Hetzner)
- **Path:** `/opt/dinoco/openclawminicrm/`

---

## 10. ห้ามทำ (Anti-Patterns)

### ❌ ห้ามทำ
1. **ห้าม** hardcode ราคาในโค้ด — ดึงจาก tool result
2. **ห้าม** ย่อชื่อสินค้า — ใช้ชื่อเต็มจาก database
3. **ห้าม** ตอบ "ขอเช็คข้อมูลกับทีมงาน" โดยไม่เรียก tool ก่อน
4. **ห้าม** เผยชื่อแบรนด์คู่แข่ง
5. **ห้าม** รวมวัสดุมั่ว (สแตนเลส + อลูมิเนียม รวมกัน)
6. **ห้าม** ถามลูกค้าซ้ำสิ่งที่เคยบอกแล้ว
7. **ห้าม** บอกราคาซ้ำเมื่อลูกค้าถามเรื่องอื่น
8. **ห้าม** เผยว่าเป็น AI/bot
9. **ห้าม** พูด "ประกันตลอดชีพ"
10. **ห้าม** เสนอสินค้าที่หยุดจำหน่าย (b2b_visible=false)
11. **ห้าม** notify dealer 2 รอบ (centralize ที่ `notifyDealerDirect`)
12. **ห้าม** bypass FSM ใน lead status update (ใช้ `updateLeadStatus()`)
13. **ห้าม** ส่ง review text / debug text ไปหาลูกค้า
14. **ห้าม** ส่งรูป URL เป็น text ใน FB (ใช้ `sendMetaImage()`)

---

## 11. Fix History Log

ทุก bug ที่มี REG-NNN หมายถึงมี regression scenario ครอบคลุมแล้ว
(ดู `regression_scenarios` collection — รัน `node scripts/regression.js --mode=gate --severity=critical`)

| Date | Bug | Fix | Commit | REG |
|------|-----|-----|--------|-----|
| 2026-04-06 | "ดิฉัน" → ลูกค้าไม่ชอบ | เปลี่ยนเป็น "คุณลูกค้า" | — | REG-009 |
| 2026-04-06 | ADV160 ถามซ้ำ | ตอบโดยตรง "ไม่มีสำหรับ ADV160" | — | REG-007 |
| 2026-04-06 | Full Set ไม่มีชื่อเต็ม | hardcode Grand Travel details | — | — |
| 2026-04-06 | stock_status filter ผิด | ใช้ b2b_visible แทน | — | — |
| 2026-04-06 | X Travel Pro ยังขึ้น | hardcode filter | — | REG-006 |
| 2026-04-06 | Bot ตอบราคาซ้ำเมื่อถามร้าน | dealerIntentButPriceReply | — | REG-011 |
| 2026-04-07 | H2C ขึ้นในคำถาม | "ตัวแต่งศูนย์" = DINOCO Edition ตรง | 10c218c | REG-001 |
| 2026-04-07 | วัสดุรวมมั่ว | แยกชัด กันล้ม=สแตนเลส กล่อง=อลู | a52d479 | REG-002 |
| 2026-04-07 | NX500 Edition ต้องสีเงิน | SKU DNCGND37LSPROS เท่านั้น | 27a8972 | REG-012 |
| 2026-04-07 | Side Rack ≠ มือจับ | แยก Rear vs Side Rack | 109a9d4 | REG-003 |
| 2026-04-07 | เสนอ Pro Rack Full ซ้ำ | มีแร็คหลังแล้ว ไม่ต้องเสนอ | 355b85c | — |
| 2026-04-07 | รูป FB ส่งเป็น text | regex + sendMetaImage + cleanup URL | 109a9d4 | REG-014 |
| 2026-04-07 | โยนเบอร์ไม่ประสาน | output-based append ข้อความประสาน | 5d25e4f | REG-005, REG-015 |
| 2026-04-07 | ชื่อ+เบอร์ → AI crash | PII masking + fallback | 9eb0f50 | REG-013 |
| 2026-04-07 | Auto-lead ไม่ทำงาน | getRecentMessages แทน vector search | 6b12462 | — |
| 2026-04-08 | Lead ไม่มี product | extractLeadContext จาก history | 0ad836d | — |
| 2026-04-08 | Lead ไม่ notify dealer | notifyDealerDirect centralized | 0ad836d | — |
| 2026-04-08 | Lead ไม่มีรูป+ราคา | lookupProductForLead | ea509c5 | — |
| 2026-04-08 | Flex card ไม่มี logo | DINOCO CO DEALER header สีดำ | bda1c65 | — |
| 2026-04-08 | Claude review text หลุด | filter leak patterns → fallback Gemini | 2bfddc7 | REG-004 |
| — | ห้ามเผยเป็น AI | sanitizeAIOutput + 3-layer guard | — | REG-010 |
| — | ADV350/Forza350 ไม่มีกล่องข้าง | SCOOTER_NO_SIDE list | — | REG-008 |
| 2026-04-10 | REG-005 false positive — auto-lead ไม่เรียก tool | ลบ expected_tools ใช้ required_patterns แทน (auto-lead bypass AI) | (this commit) | REG-005 |
| 2026-04-10 | REG-021 false positive — claim-flow state machine ไม่เรียก tool ตรง | ลบ expected_tools ใช้ required_patterns แทน (state machine ถามทีละ turn) | (this commit) | REG-021 |
| 2026-04-10 | REG-003 — Side Rack bot ยังพูด "มือจับ" | เพิ่ม HARD BANS section + ห้ามคำว่า "มือจับ" เด็ดขาดเมื่อพูด Side Rack | (this commit) | REG-003 |
| 2026-04-10 | REG-018 — ซื้อเยอะ bot เสนอ "ราคาพิเศษ" | เพิ่ม BULK_INQUIRY rule + ห้ามคำว่า "ราคาพิเศษ/เหมาถูกกว่า" | (this commit) | REG-018 |
| 2026-04-10 | REG-020 — ขอรูป bot ถามรุ่นซ้ำ | Strengthen context awareness rule "มีรูปไหม" → ใช้รุ่นเดิมทันที | (this commit) | REG-020 |
| 2026-04-10 | REG-025 — ทักทาย bot ใช้ "ยินดีให้บริการ" | เพิ่มใน HARD BANS + greeting template ในน้ำเสียง section | (this commit) | REG-025 |
| 2026-04-11 | Regression test multi-turn ไม่มี context | `/api/test-ai` + `/api/regression/run` ไม่ saveMsg ระหว่าง turns → เพิ่ม `runRegressionTurn()` helper (saveMsg user → auto-lead → callDinocoAI → dealer append → saveMsg assistant) | `49a016a` | REG-005, REG-018, REG-020, REG-021 |
| 2026-04-11 | REG-012 regex false positive `.*` greedy | เปลี่ยนเป็น bounded proximity `[^.]{0,40}` (ReDoS-safe) | `49a016a` | REG-012 |
| 2026-04-11 | **🔥 CRITICAL: History reversal bug** ใน `callGeminiWithTools` + `callClaudeWithTools` — `recentMsgs.reverse()` ซ้ำหลัง `getRecentMessages()` asc → Gemini/Claude เห็น context **ย้อนลำดับ** | ลบ `.reverse()` ที่ line 305 + 441 ใน ai-chat.js | `ca5d995` | REG-012, REG-019, REG-020, REG-021 |
| 2026-04-11 | runRegressionTurn saveMsg duplicate user | Move saveMsg user+assistant **หลัง** callDinocoAI (ไม่ก่อน) | `93eede0` | REG-012, REG-020, REG-021 |
| 2026-04-11 | REG-009 `\b` ไม่ทำงานกับภาษาไทย | Context-based regex: `(สวัสดี\|ช่วย)\s*พี่` แทน `\bพี่\b` | `20188f2` | REG-009 |
| 2026-04-11 | REG-023 CLAIM_STATUS intent router ไม่ match MC กลางประโยค | Pattern `^MC\d{4,}` → `MC[-\s]?\d{3,}` | `20188f2` | REG-023 |
| 2026-04-11 | REG-012 Gemini non-deterministic เสนอสีดำบางรอบ | Hard ban prompt "ตัวแต่งจากศูนย์ NX500 → สีเงินเท่านั้น ห้ามเสนอสีดำ/Pro Rack Full" + deterministic regex `สีดำ\|black` | `4c06b4d` | REG-012 |
| 2026-04-11 | REG-009/023 Gemini judge over-interpret | ลบ expect_behavior/must_not_do ใช้ regex อย่างเดียว (skip semantic judge) | `f6f3806` | REG-009, REG-023 |
| 2026-04-11 | REG-019 `ตัวไหน` จับ false positive "ตัวไหนก็ได้" | Bounded regex `ตัวไหน(คะ\|ครับ\|ดี\|กัน)` | `1889869` | REG-019 |
| 2026-04-11 | **✅ ALL 25/25 PASS** — Gate verified stable | Regression Guard V.1.6 production-ready | `4c06b4d` | — |
| 2026-04-12 | ลูกค้าเลือกสินค้าแล้ว (pro สีเงิน 19,900) bot ไม่ส่งรูปยืนยัน ข้ามไปถามจังหวัดเลย | เพิ่ม **CONFIRM_SELECTION** rule: ลูกค้าระบุ สี/รุ่น/ราคา → ต้องเรียก product_lookup + แนบ URL รูป **ก่อน** ถามจังหวัด | (this commit) | — |
| 2026-04-12 | List สินค้า 3+ ตัว bot dump ทุกตัวไม่ถามเชิงรุก | เพิ่ม **LIST_MANY_OPTIONS** rule: list ≥3 ตัว → ปิดท้ายถาม "ลูกค้าสนใจตัวไหน จะส่งรูปให้ดู" | (this commit) | — |
| 2026-05-07 | AI ตอบ S/N status โดยไม่เรียก tool (cache ในสมอง) | enforce §15.2 + dinoco-cache snLookupCache 60s TTL | (this commit) | REG-090 |
| 2026-05-07 | AI เผย recall reason ตรง ๆ + เผย "ถูกแจ้งหาย" | enforce §15.3 + §15.4 + telegram voided_inquiry/recall_inquiry escalate | (this commit) | REG-091 |
| 2026-05-07 | OCR fraud bypass — รูปบัตรประกันคนอื่น เข้า claim flow ได้ | claim-flow.js V.4.0 Photo OCR validation chain (extract S/N + sn_pool check + 4-eyes flag) | (this commit) | REG-092 |
| 2026-05-07 | "ใบรับประกัน" vs "ใบเสร็จ" ambiguity → AI ตอบ S/N จากใบเสร็จ (ไม่มี) | enforce §15.5 ขอ clarify ก่อน | (this commit) | REG-093 |
| 2026-05-07 | เพลทหายไม่ขอ evidence | enforce §15.6 ขอรูป + ใบเสร็จ + address ก่อน escalate Service Center | (this commit) | REG-094 |
| 2026-05-07 | dinoco_serial_lookup tool ขาด — AI guess product จาก S/N | tool added (V.6.0) — dispatcher routes DNCSS\d{7} | (already wired V.6.0) | REG-095 |
| 2026-05-07 | Cache stale หลัง customer activate plate ทันที | dinoco-cache.js V.1.1 invalidateSnCache + WP webhook hook spec (Phase 4 W14.5 wiring TODO) | (this commit) | REG-096 |
| 2026-05-07 | **R3 Gap 1 BLOCKER**: WP→Agent webhook listener ขาด — 60s TTL fallback only, customer activate plate → AI ตอบสถานะเก่า | NEW `proxy/modules/sn-webhook.js` V.1.0 + register `POST /webhook/sn-event` ใน `proxy/index.js` V.2.3 (bearer auth + rate limit 1000/min + payload validation + MongoDB `sn_event_log` audit) | (this commit) | REG-097 |
| 2026-05-07 | R3 Gap 2: Tool description claim `is_owned_by_caller` แต่ MCP V.3.0 strip PII (`registered_user_id`) — AI confused | dinoco-tools.js V.6.2: trim is_owned_by_caller from `dinoco_warranty_check` description + add explicit "deferred — requires PII gate (Phase 4 W14.5)" note | (this commit) | REG-098 |
| 2026-05-07 | R3 Gap 3: Photo OCR regex `/DNC[A-Z0-9]{3,11}/i` lenient — accepts I/L/O/U → false positive flagged as fake_sn_attempt (actually OCR misread) | claim-flow.js V.4.1: strict Crockford regex `/DNC(?:SS)?[0-9A-HJ-KMNP-TV-Z]{3,11}/gi` + new `ocr_misread_suspect` flag (no Telegram escalate, less aggressive) | (this commit) | REG-099 |
| 2026-05-07 | R3 Gap 4: `isLenientSn()` regex too permissive (no I/L/O/U exclusion) — would accept user typo as valid | dinoco-tools.js V.6.2: `SN_LENIENT_REGEX` Crockford alphabet + new `validateSnFormat()` returns `{valid, format, reason, normalized}` | (this commit) | REG-100 |
| 2026-05-07 | R3 Gap 5: §15.14 implicit relation to Section 15 base unclear — could be read as override | chatbot-rules.md §15.14 header explicit "ขยาย Section 15 — ไม่ override" + cross-ref `(see also §15.X)` per sub-section + priority on conflict rule | (this commit) | — |
| 2026-05-07 | R3 cache: cacheSnLookup signature ไม่รับ ttl_ms — caller ปรับ TTL ไม่ได้ | dinoco-cache.js V.1.2: `cacheSnLookup(sn, data, ttl_ms = 60000)` + bounded 1s..7d validation | (this commit) | — |
| 2026-05-07 | R3 training: 5 new scenarios (lenient regex / OCR partial / cache stale / Crockford education / alert flood) | chatbot-rules.md §15.14.7 R3-1..R3-5 added | (this commit) | — |

---

## 12. Verification Checklist

ก่อน commit การแก้ chatbot ให้เช็คทุกข้อ:

- [ ] ไม่ได้ทำให้ rule ใน Section 1-10 ข้างบนเสีย
- [ ] ถ้ามีเปลี่ยน logic → เพิ่ม rule ใหม่ใน section ที่ตรง
- [ ] ถ้าแก้ bug → เพิ่มใน Section 11 Fix History
- [ ] ทดสอบด้วย scenarios ที่เคยเป็น bug (จาก Fix History)
- [ ] Update `Last updated` + `Version` ข้างบน

---

## 13. Reference Scenarios (Regression Tests)

เมื่อแก้ chatbot แล้ว ต้อง manually test scenarios เหล่านี้:

### Scenario A: DINOCO Edition NX500
```
User: nx500 กล่อง 3 ใบเท่าไหร่
Bot: แสดงตัวเลือกทั้งหมด (STD/PRO x Black/Silver)
User: ตัวแต่งจากศูนย์ครับ
Bot: ตอบ DINOCO Edition + แนะนำ SKU DNCGND37LSPROS (Silver) เท่านั้น
     ห้าม: พูด H2C, เสนอ Pro Rack Full, เสนอสีดำ, พูดถึงมือจับ
```

### Scenario B: Dealer Coordination + Auto-Lead
```
User: แถวลาดพร้าวติดตั้งที่ไหน
Bot: แนะนำร้าน + "ถ้าสะดวกแจ้งชื่อและเบอร์โทร แอดมินจะประสาน..."
User: เปรม 0634469404
Bot: "ขอบคุณค่ะคุณเปรม แอดมินจะประสานให้ร้าน FOX RIDER ติดต่อกลับ..."
→ Lead สร้างใน MongoDB
→ Flex card ไปกลุ่ม LINE ตัวแทน
→ Status: dealer_notified
```

### Scenario C: คู่แข่ง
```
User: กันล้มดีกว่า SRC ยังไง
Bot: ตอบจุดเด่น DINOCO (สแตนเลส 304, ประกัน 5 ปี, ผลิตในไทย, ตรงรุ่น)
     ห้าม: พูดชื่อ SRC, พูด "อลูมิเนียม 5052" (นี่คือกล่อง ไม่ใช่กันล้ม)
```

### Scenario D: ถามสินค้าที่เลิกขาย
```
User: มี X Travel Pro ไหม
Bot: "รุ่นปัจจุบันเป็น Grand Travel ค่ะ"
     ห้าม: เสนอ X Travel Pro
```

### Scenario E: ลูกค้าบอกรุ่นรถแล้ว
```
User: nx500 แคชบาร์ราคาเท่าไหร่
Bot: [เรียก tool] ตอบราคาตรง
User: มีรูปไหม
Bot: ส่งรูปของแคชบาร์ NX500 ที่เพิ่งพูดถึง (ห้ามถามรุ่นซ้ำ)
```

---

## 14. Emergency Contact

ถ้าเจอ bug ที่ไม่อยู่ใน rules นี้:

1. **เพิ่ม rule ใหม่** ในไฟล์นี้ก่อนแก้โค้ด
2. **Document context** (conversation ที่เจอ bug)
3. **Test scenarios** ต้อง pass ทั้งหมดก่อน deploy
4. **Commit + Push** พร้อม update `Last updated`

---

## 15. S/N + Plate Rules (v2.13 Production S/N Management)

> Source: plan v2.13 §B/H + audit v2.6 Gap H + Phase 4 W14 OpenClaw refactor.
> Bind across: dinoco-tools.js (`dinoco_warranty_check`, `dinoco_serial_lookup`, `dinoco_create_claim`), claim-flow.js (Photo OCR validation chain), telegram-gung.js (`stuck-claim` / `plate-claimed-no-ticket` alerts).

### 15.1 S/N Format

- Canonical regex: `/^DNCSS\d{7}$/i` (default prefix). Other prefixes valid per `wp_dinoco_sn_batches.prefix` whitelist.
- ลูกค้าเขียน "DNC SS 0001234" / "dncss-0001234" / "DNCSS 0001234" → **normalize ก่อน lookup** (uppercase + strip whitespace + strip dashes).
- ถ้า normalize แล้ว format ผิด → **ห้าม guess** ตอบ "ขอตรวจ S/N อีกครั้ง — ตัวอย่างที่ถูกต้อง: DNCSS0001234 (DNCSS + ตัวเลข 7 หลัก)" + escalate Telegram บอสถ้า user ยืนยัน format ผิดซ้ำ.

### 15.2 Status Lookup — ห้าม cache ในสมอง

- AI **ห้าม** ตอบสถานะเพลทจากความจำ training data หรือ conversation history.
- ทุกคำถามเรื่อง warranty/plate/claim → **บังคับเรียก tool** `dinoco_warranty_check(serial, phone)` หรือ `dinoco_serial_lookup(serial)`.
- Tool result มี TTL ภายในเซสชัน 5 นาที — ถ้าลูกค้ากลับมาถามซ้ำหลังเปลี่ยนสถานะ (เช่น เพิ่ง activate / เปิดเคลม) → **ต้องเรียก tool ใหม่** ห้ามเชื่อ cache เก่า.
- Cache invalidation: ถ้า tool result เก่าเกิน 60 วินาที + ลูกค้าถาม "ตอนนี้สถานะ..." → re-fetch ทันที.

### 15.3 Voided / Recalled / Stolen — ห้ามเผยรายละเอียด

|status|คำตอบที่ถูก|คำตอบที่ห้ามทำ|
|---|---|---|
|`voided`|"เพลทนี้ถูกยกเลิกในระบบ — กรุณาติดต่อทีมงาน DINOCO"|ห้ามบอกเหตุผล (defective / lost / fraud)|
| `recalled` | "เพลทนี้อยู่ในรอบ recall — กรุณาติดต่อร้านที่ซื้อเพื่อตรวจสอบ" | ห้ามบอก batch / SKU / defect type |
| `stolen` | "เพลทนี้มีรายงานในระบบ — โปรดติดต่อ DINOCO Support 02-xxx-xxxx" | **ห้ามบอกว่า "ถูกแจ้งหาย"** (social engineering — โจรอาจเป็นคนถาม) |
| `claimed` | "เพลทนี้อยู่ระหว่างเคลม — สถานะปัจจุบัน: {claim_status_thai}" | ห้ามบอก approver / 4-eyes pending / admin notes |

ทุก voided/recalled/stolen lookup → **escalate Telegram** บอส (`telegram_alert.sendStatus('sensitive_sn_query', { sn, asker_uid, source_platform })`) สำหรับ forensics.

### 15.4 Recall Queries — Generic Reply + Escalate

- ถ้าลูกค้าถาม "DINOCO มี recall ของรุ่น X ไหม" / "เพลทล็อตนี้มีปัญหาไหม":
  - ตอบ generic: "DINOCO ดำเนินการ recall ผ่านดีลเลอร์ที่ลงทะเบียนเท่านั้น — ถ้ามีคำถามเรื่องสินค้า กรุณาติดต่อร้านที่ซื้อ"
  - **ห้าม** ยืนยัน/ปฏิเสธว่ามี recall จริงในระบบ (ป้องกัน competitor mining + customer panic)
  - escalate `telegram_alert.sendStatus('recall_query', { ... })` → ทีม PR/QA ตัดสินใจ

### 15.5 ใบรับประกัน vs ใบเสร็จ

- "ใบรับประกัน" / "warranty card" = QR plate ที่ติดสินค้า (DNCSS...) — ใช้ activate ได้
- "ใบเสร็จ" / "ใบกำกับภาษี" / "invoice" = หลักฐานการซื้อ (PDF จาก B2B/Manual Invoice) — ไม่ใช่ warranty
- ถ้าลูกค้า scan ใบเสร็จมาถาม "นี่ S/N ใช่ไหม" → ตอบ "ใบเสร็จไม่มี S/N — กรุณาดู QR plate (สี่เหลี่ยมโลหะเล็กบนสินค้า)"

### 15.6 เพลทหาย / ร่วง — Reissue Flow (M2)

- Trigger phrases: "เพลทหาย", "เพลทร่วง", "เพลทตก", "QR ลอก/หลุด", "อ่านไม่ออก"
- บอตตอบ: "เสียใจด้วยครับ — เพื่อออกเพลทใหม่ ขอ:
  1. รูปสินค้าที่เห็นชัด (มุมที่เคยติดเพลท)
  2. ใบเสร็จ / หลักฐานการซื้อ
  3. ตำแหน่งที่อยู่จัดส่งเพลทใหม่"
- เก็บข้อมูลใน `manual_claims` collection + flag `intent: 'reissue_plate'` + escalate `telegram_alert.sendStatus('reissue_request', ...)`
- **ห้าม** สัญญาว่าจะออกเพลทใหม่ฟรี — ขึ้นกับ admin review (warranty status + evidence)

### 15.7 Activate ก่อน Ship — Block + Auto-Investigate

- `dinoco_warranty_check` return `status: 'in_pool'` หรือ `'reserved'` แต่ลูกค้าบอกว่าได้รับสินค้าแล้ว:
  - ตอบ: "ระบบยังไม่บันทึกว่าเพลทนี้ส่งออก — ขอตรวจสอบ 24 ชม. (ทีมงานจะติดต่อกลับ)"
  - บันทึก lead `intent: 'plate_in_transit_mismatch'`
  - escalate Telegram บอส
- **ห้าม** บอกว่า "ของปลอม" (อาจเป็น warehouse race condition จาก v2.4 §F4 fix)

### 15.8 Photo OCR Validation Chain (claim-flow.js integration)

ตอนลูกค้าส่งรูปบัตรประกัน/เพลท + Gemini Vision extract S/N:

```
extract S/N → normalize (15.1) → lookup sn_pool:
  status=registered + owner=current_user      → ✓ proceed claim
  status=registered + owner=other LINE UID    → block + investigation ticket (suspicion: stolen/transferred)
  status=in_pool / shipped                    → "ยังไม่ activate — ลงทะเบียนก่อนเคลม" (link [dinoco_warranty_activate])
  status=voided / recalled / stolen           → block + 15.3 reply + escalate
  not in sn_pool                              → "S/N นี้ไม่ตรงกับฐานข้อมูล DINOCO" + Telegram บอส (suspect counterfeit per F#12)
```

### 15.9 dinoco_create_claim Validation

ก่อน insert `manual_claims` row:

1. validate `serial` ด้วย regex 15.1
2. lookup sn_pool — ถ้าไม่เจอ → **return error** + `intent: 'fake_sn_attempt'` flag (ไม่สร้าง claim) + escalate
3. ถ้า status ≠ `registered` → return error "S/N ยังไม่ active" (ไม่สร้าง claim)
4. ถ้า owner ≠ current LINE UID → สร้าง claim + flag `requires_4eyes_review` + alert บอส (อาจเป็น mature transfer ไม่ใช่ fraud)

### 15.10 Cross-system cache invalidation

ตอน plate state change ใน WP (activate / swap / void / recall / transfer / claim status flip):

- WP fires hook `dinoco_sn_state_changed` → emit MCP event → agent listener → bust:
  - `dinoco-cache.js` keys: `warranty:${sn}`, `lookup:${sn}`, `claim:${sn}`
  - conversation thread cache: `thread:${sourceId}` (ลูกค้าที่กำลังคุยอยู่)
- ถ้า MCP event miss → fallback: tool result TTL 60s (15.2)

### 15.11 Anti-Hallucination Hard Bans (S/N specific)

| ห้ามตอบ | เหตุผล |
|---|---|
| "DNCSS0001234" (สุ่มตัวเลข) | AI hallucinate plate ที่ไม่มีจริง — ใช้แค่ทูลที่ลูกค้าให้มา |
| "เพลทนี้ active แล้ว" (โดยไม่มี tool result) | ห้ามคาด — call tool |
| "warranty 1 ปี" / "ตลอดชีพ" / "5 ปี" (ระบุ number) | ใช้ tool ดึง warranty_until field — ห้าม guess |
| "ของปลอม" (ลูกค้าโดยตรง) | ใช้ "ขอตรวจสอบเพิ่ม" + escalate — ป้องกัน defamation lawsuit |
| "พรุ่งนี้/ภายในวันนี้" (timing promise) | ใช้ "ทีมงานจะติดต่อกลับโดยเร็ว" — admin SLA ไม่ผูก AI |

### 15.12 Regression Test Coverage

REG-IDs ที่ map ไป Section 15 (ใส่ใน `regression_scenarios` collection ตอน deploy v2.13 Phase 1):

- REG-080 — S/N format normalization (DNCSS0001234 / dncss 1234 / DNCSS-1234 ทั้งหมดต้อง resolve เดียวกัน)
- REG-081 — voided plate query → generic reply + no reason leak
- REG-082 — stolen plate query → escalate + no "ถูกแจ้งหาย" word
- REG-083 — recall query → generic reply + escalate
- REG-084 — fake S/N (not in pool) → no claim insert + Telegram alert
- REG-085 — cross-owner activate attempt → block + 4-eyes flag
- REG-086 — plate hallucination (AI ตอบ S/N ที่ไม่มี tool result) → fail
- REG-087 — reissue flow asks 3 things (รูป + ใบเสร็จ + address)
- REG-088 — Photo OCR mismatch case (S/N from photo ≠ S/N in conversation) → escalate

---

**Last updated:** 2026-05-07 R3 (Section 15.14 R3 deltas landed — sn-webhook.js V.1.0 + Crockford strict alphabet + 5 new scenarios)

### 15.13 Implementation Status (Phase 4 W14.1 — 2026-05-07)

`dinoco-tools.js` V.6.0 wires §15.1, §15.2, §15.3 (partial — voided/recalled/stolen block at claim creation), §15.9 (full):

- **§15.1** `normalizeSerial()` + `SN_PREFIX_REGEX` helpers exported in `dinoco-tools.js` head — uppercase + strip whitespace + strip dashes
- **§15.2** `dinoco_warranty_check` auto-detects `/^DNCSS\d{7}$/` → routes to `/sn-lookup`; non-canonical serial → legacy `/warranty-check` fallback
- **§15.3** `dinoco_create_claim` blocks insert when sn_pool returns `voided` / `recalled` / `stolen` — generic Thai reply, no leak of reason
- **§15.9** `dinoco_create_claim` validates S/N exists in sn_pool **before** insert (returns error to AI without DB write if not found); on success preserves `serial_status_at_create` snapshot in MongoDB doc + appends `S/N: ... (status)` to `ai_analysis` for WP-side audit
- **NEW** `dinoco_serial_lookup` tool — read-only canonical S/N lookup (described to AI for proactive use when ลูกค้าถาม "ของฉันซื้อเมื่อไหร่")
- **Test mode** (`reg_*` sourceId) — all 3 paths return mocks (`dinoco_serial_lookup` mock added to dispatcher; `dinoco_create_claim` mock unchanged from V.5.x — still returns `REG-TEST-0001` without S/N validation, by design for regression determinism)

Deferred to future rounds:
- §15.4 (recall query escalate) — needs intent classifier wiring (lives in `ai-chat.js`, out of W14.1 scope)
- §15.5 / §15.6 (warranty-vs-receipt + reissue M2) — UX decisions per ai-chat.js prompt rules; not enforced at tool layer
- §15.7 (in_pool / reserved before ship mismatch) — requires `dinoco_warranty_check` extended status branch + Telegram escalate (Phase 4 W14.3)
- §15.8 (Photo OCR validation chain) — claim-flow.js integration (Phase 4 W14.4) — **landed in §15.14 Round 2 (2026-05-07)**
- §15.10 (cross-system cache invalidation) — needs MCP event listener (Phase 4 W14.5) — **partial landing in §15.14 Round 2**

---

### 15.14 Round 2 Implementation Deltas (Phase 4 W14.4 + W14.5 — 2026-05-07)

> **Section 15.14 ขยาย Section 15 G1 sub-rules (15.1-15.6) — ไม่ override**
> 7 findings G1..G7 wired across `dinoco-tools.js`, `claim-flow.js`, `telegram-gung.js`, `dinoco-cache.js`.
> Backward-compatible: every change is additive; signatures of existing tools preserved.
> **Priority on conflict**: Section 15 base rules (15.1-15.13) take precedence over 15.14 extensions.
> เช่น ถ้า §15.1 บอก format `^DNCSS\d{7}$` (canonical) แต่ §15.14.1 ขยายเป็น lenient — backend ยึด canonical (Crockford 12-char + Luhn checksum), AI ใช้ lenient เฉพาะ OCR extraction.

#### 15.14.1 S/N format scope expansion (G1) (see also §15.1)

§15.1 used `^DNCSS\d{7}$` (legacy 7-digit). Round 2 widens validation to **lenient regex** for AI safety. Round 3 (R3 Gap 4) tightens lenient to **Crockford alphabet** (excludes I, L, O, U):

- **Lenient** (AI-side guard, never authoritative): `/^DNC(SS)?[0-9A-HJ-KMNP-TV-Z]{3,9}$/` — Crockford base32, no I/L/O/U
- **Strict canonical** (backend authoritative — Luhn-mod-32 checksum from plan v2.13): `/^DNCSS[0-9A-HJ-KMNP-TV-Z]{6}[0-9A-HJ-KMNP-TV-Z]$/` — 12 chars total
- **Legacy**: `/^DNCSS\d{7}$/` — backward-compat with pre-v2.13 batches
- Future canonical (per Round 1 G1 finding): `DNCSS<RAND6><CHK1>` 12-char. Backward-compat with legacy `DNCSS\d{7}`.
- **AI rule**: never reject a serial purely on regex — let backend respond `not_found`. AI's job = normalize (uppercase + strip whitespace + dashes), pass through, surface backend reply verbatim.
- **Crockford rationale**: I/L look like 1, O looks like 0, U looks like V — excluding them prevents human error AND OCR misreads. If customer types "DNCSS-OOL-123" → AI says "S/N format DINOCO ไม่มีตัวอักษร O และ L" (see §15.14.7 scenario 4).
- **Helper**: `validateSnFormat(input)` (dinoco-tools.js V.6.2) returns `{ valid, format: 'crockford'|'legacy'|'invalid', reason, normalized }` — used by claim-flow Photo OCR to classify candidates.

#### 15.14.2 Owner verification (G2 partial — backward-compat shim) (see also §15.2)

`dinoco_warranty_check` description updated to advertise `top_set_sku` + `plate_status` (PII-safe). **R3 Gap 2**: removed `is_owned_by_caller` from advertised fields — that field requires PII gate (Phase 4 W14.5 MCP V.3.1) which strips `registered_user_id` from the response. Until MCP V.3.1 emits the derived ownership boolean server-side, AI continues to use `phone` matching + backend `status` only. Tool code does not require the field today (graceful nullable). The description note "is_owned_by_caller deferred — requires PII gate (Phase 4 W14.5)" makes this explicit to the AI.

#### 15.14.3 NEW dinoco_serial_lookup vs dinoco_warranty_check (G2)

Both tools coexist:

- `dinoco_warranty_check(serial?, phone?)` — search by serial **OR** phone (legacy compat — phone-only lookup keeps DN-XXXXX flow alive).
- `dinoco_serial_lookup(serial)` — canonical S/N read-only, requires `serial` (no phone fallback). Use when ลูกค้าถาม "ของฉันซื้อเมื่อไหร่ / นี่ของแท้ DINOCO ไหม / ประกันถึงเมื่อไหร่".

AI rule: prefer `dinoco_serial_lookup` for read-only queries. Use `dinoco_warranty_check` only when caller has phone but no S/N, or when migrating legacy DN- format.

#### 15.14.4 Cache invalidation hook (G3 — Round 3 FULL landing) (see also §15.2 + §15.10)

`dinoco-cache.js` V.1.2 + `sn-webhook.js` V.1.0 wired in `proxy/index.js` V.2.3:

- `snLookupCache` Map (key = `DNCSSnnnnnnn`, value = `{ data, expires }`, TTL **60s default**, configurable via `cacheSnLookup(sn, data, ttl_ms)`) — replaces ad-hoc WP-side caching, makes invalidation atomic
- `invalidateSnCache(sn)` — single-SN bust + invalidates `kb` cache (entries may reference SN status indirectly)
- `invalidateAllSnCache()` — full bust (used by `dinoco_sn_state_changed` MCP event)
- **R3 NEW: `POST /webhook/sn-event`** — receives WP fire of `dinoco_sn_pool_status_changed`:
  - Auth: bearer token `LIFF_AI_AGENT_KEY` (env)
  - Rate limit: 1000/min (cache invalidation = high-volume read-side mutation)
  - Payload: `{ sn, old_status, new_status, ts, source: 'wp' }`
  - Action: `invalidateSnCache(sn)` + log MongoDB `sn_event_log`
  - Response: `{ success: true, invalidated: ['warranty_check', 'sn_lookup'], cache_existed: bool }`
  - Defensive: try/catch every step, never throws, never breaks agent
- **WP integration spec** (Agent A — separate task): NEW WP listener (in MCP Bridge V.3.1 or dedicated `[System] DINOCO SN Webhook Forwarder` snippet):
  - Hook into `dinoco_sn_pool_status_changed` action
  - Build payload + POST to `OPENCLAW_AGENT_URL/webhook/sn-event` with `Authorization: Bearer LIFF_AI_AGENT_KEY`
  - Async / fire-and-forget (don't block sn_pool transaction); 5s timeout; failure → log + 1 retry; never throw
- **Backward compat**: cache invalidation falls back to 60s TTL (§15.14.4) if webhook missed.
- **AI rule**: if `dinoco_serial_lookup` returns `expires_at` field, agent layer respects it. AI never caches SN status itself (only the cache Map does — for the configured TTL, default 60s).

#### 15.14.5 Photo OCR fraud validation chain (G4) (see also §15.8)

`claim-flow.js` V.4.1 adds `extractSerialFromAnalysis(analysis)` + `validatePhotoSerial(extractedSn, claim, sourceId)`:

- **Trigger**: photo uploaded during claim flow → Gemini Vision returns `analysis` text → strict Crockford regex `/DNC(?:SS)?[0-9A-HJ-KMNP-TV-Z]{3,11}/gi` extracts candidate serials (R3 Gap 3 — excludes I/L/O/U OCR-ambiguous chars)
- **Validation**: each extracted SN → `validateSnFormat()` pre-check → if `contains_excluded_char_ILOU` → flag `ocr_misread_suspect` + skip backend call (saves quota, less aggressive escalation). Otherwise → `callDinocoAPI('/sn-lookup', { sn })` → 4 outcomes:
  - `not_found` → flag `intent: 'fake_sn_attempt'` + telegram `ocr_unknown_serial` alert (claim continues — admin reviews)
  - `voided / recalled / stolen` → block claim continuation + telegram `voided_inquiry` (or appropriate category) + generic reply per §15.3
  - `registered` + `registered_user_id` ≠ claim submitter → flag `requires_4eyes_review` + telegram `ocr_mismatch_fraud_suspect` (claim continues — admin reviews owner mismatch)
  - `registered` + owner matches → ✓ proceed (no flag)
- **R3 NEW: ocr_misread_suspect classification** — when extracted SN contains I/L/O/U, it's most likely OCR error (1↔I↔L, 0↔O), not counterfeit. Flag separately, no telegram alert by default. Customer-facing: AI should ask "ลองตรวจ S/N อีกครั้ง — DINOCO ไม่มีตัวอักษร I, L, O, U" (see §15.14.7 scenario 4).
- **AI rule**: never tell customer "S/N นี้ไม่ใช่ของคุณ" — that's an admin call. Claim continues, internal flag handles routing.
- **Defensive**: extraction skips Gemini (no fetch loop), all telegram calls `.catch(() => {})` — claim flow never breaks on OCR validation failure.

#### 15.14.6 Telegram น้องกุ้ง 3 new aging categories (G5) (see also §1-§14 alert hygiene)

**R3 — Alert flood suppression spec** (deferred to `telegram-alert.js` V.2.2 — file outside R3 ownership scope):

- Per-sourceId, per-category sliding window: > 5 alerts/min → suppress individual sends + add to MongoDB `telegram_alert_digest` queue
- Daily 09:00 cron consolidates queue → single digest message to บอส per sourceId per category
- Rationale: high-volume OCR fraud probes (e.g. attacker iterates DNCSS00001..99999) currently spam Telegram. Digest preserves visibility without flooding.
- Owner: telegram-alert.js V.2.2 sprint (separate task — touches `sendTelegramAlert` rate-limit branch + cron addition).
- AI rule: alert categories `voided_inquiry / recall_inquiry / ocr_unknown_serial / ocr_mismatch_fraud_suspect` are subject to suppression. Claim-flow continues regardless (alert is best-effort).


`telegram-gung.js` V.2.0 `checkClaimAging` extended:

| Category | Trigger | Threshold | Owner |
|---|---|---|---|
| `plate_claimed_no_ticket` | sn_pool.status='claimed' but no `manual_claims` doc | > 7 days | service center |
| `stuck_claim` | manual_claims.status='waiting_parts' AND sn_pool.status='claimed' | > 14 days | parts team |
| `ready_replacement` | sn_pool.status='replaced' AND no customer pickup confirm | > 5 days | logistics |

Plus 4 alert categories surfaced to `formatAlert` (via `telegram-alert.js`, additive — preserves backward compat with existing `ai_confused / customer_unhappy / handoff / hallucination / new_claim / ai_wrong / regression_drift / regression_fail_gate`):

- `voided_inquiry` — customer asked about voided/stolen/recalled plate
- `recall_inquiry` — customer asked about recall (per §15.4)
- `ocr_mismatch_fraud_suspect` — photo SN belongs to different owner
- `ocr_unknown_serial` — photo SN not in sn_pool (counterfeit suspect per F#12)

#### 15.14.7 Seven Reference Training Scenarios (G7)

Manual QA after deploying Round 2:

1. **"S/N DNCSS0001234 นี่ของอะไร"** → call `dinoco_serial_lookup` → return product (top_set_name) + warranty + status. ห้าม guess.
2. **"เพลทหาย ขอใหม่"** → §15.6 reply asking for 3 things (รูป + ใบเสร็จ + ที่อยู่จัดส่ง) → escalate Telegram `reissue_request`. ห้ามสัญญาฟรี.
3. **"ทำไม S/N โดน void"** → generic "อยู่ระหว่างตรวจสอบ — กรุณาติดต่อทีมงาน" (§15.3) + telegram `voided_inquiry`. ห้ามเผยเหตุผล.
4. **"ลงทะเบียนแล้วยัง"** → call `dinoco_warranty_check` (cache 60s if in `snLookupCache`) + ตอบตามผล. Re-fetch ถ้าถามซ้ำหลัง > 60s.
5. **Fraud probe: "S/N นี้ลงทะเบียนยัง?" (non-owner)** → return generic "ติดต่อ Admin" — ห้ามยืนยัน registered status เผย user_id. Telegram `voided_inquiry` (use generic SN inquiry category).
6. **"ขอโอนประกันให้เพื่อน"** → call `dinoco_warranty_check` ก่อน → warn ถ้า status ∈ {stolen, recalled, claimed} → block transfer flow. Active+registered → ส่งไป LIFF transfer.
7. **Manual claims backfill: legacy serial ไม่มีใน sn_pool** → "ระบบใหม่อัพเดทอยู่ — ทีมงานจะตรวจสอบให้นะคะ" + flag `requires_manual_review` (no fake_sn_attempt — known migration gap). Telegram `ocr_unknown_serial` with note `legacy_pre_v213`.

**R3 (2026-05-07) — 5 new scenarios (extends §15.14.7):**

**R3-1. Lenient regex false positive recovery (Crockford)**

- User: "S/N ของผม DNC001 ยังประกันอยู่ไหม"
- AI: "S/N นี้ format ไม่ถูกต้อง — DINOCO S/N เริ่มด้วย DNCSS ตามด้วย 6-7 ตัวอักษร/ตัวเลข (ไม่มี I, L, O, U) ลองตรวจ S/N บนเพลทอีกครั้งครับ"
- **ห้าม** call `dinoco_serial_lookup` (frontend regex reject — saves backend quota). **ห้าม** escalate Telegram (ไม่ใช่ fraud — แค่ user error).

**R3-2. OCR partial match (length too short)**

- System: photo upload, Gemini Vision extract `"DNCSS123"` (8 chars, length too short for canonical 12-char)
- AI: "ระบบอ่าน S/N จากรูปได้บางส่วน (DNCSS123) — กรุณาส่งรูปชัดขึ้น หรือพิมพ์ S/N เต็มให้หน่อยครับ"
- claim-flow: extract regex matches but length < 12 → flag `ocr_partial_match` (no backend call).

**R3-3. Cache staleness within 60s (webhook-driven invalidation)**

- User asks "ลงทะเบียนแล้วยัง" 2 ครั้งภายใน 60 วินาที — first call cache miss → backend lookup → cache. Customer activates plate at second 30 → WP fires `dinoco_sn_pool_status_changed` → POST `/webhook/sn-event` → `invalidateSnCache(sn)` → next agent call (second 45s) refetches fresh data.
- **Without webhook**: 60s TTL safety net — second call (after second 60) auto-refetches.
- AI rule: AI never assumes cache is fresh beyond TTL — `dinoco_serial_lookup` always returns latest.

**R3-4. Crockford alphabet education (preemptive)**

- User: "S/N DNCSS-OOL-123 ใช่ของจริงไหม"
- AI: "S/N format DINOCO ไม่มีตัวอักษร O และ L (เพราะดูคล้าย 0 และ 1) ลองตรวจอีกครั้ง — อาจเป็นเลข 0 หรือ 1 ครับ"
- `validateSnFormat` returns `{ valid: false, format: 'invalid', reason: 'contains_excluded_char_ILOU' }` → AI uses reason to craft helpful reply.

**R3-5. Telegram alert flood suppression**

- System detects: same `sourceId` triggers `ocr_unknown_serial` > 5 ครั้ง/นาที (e.g. attacker iterates SNs)
- Action: rate limit at agent layer — suppress individual sends + add to daily digest queue (`telegram_alert_digest`).
- **Note**: implementation deferred to `telegram-alert.js` V.2.2 (separate sprint, see §15.14.6 R3 spec).
- AI behavior unchanged — claim continues regardless.

#### 15.14.8 Files touched (Round 2 — 2026-05-07)

| File | Version | Change |
|---|---|---|
| `openclawminicrm/docs/chatbot-rules.md` | V.1.5 | This section (15.14) + 7 new REG rows |
| `openclawminicrm/proxy/modules/dinoco-tools.js` | V.6.1 | Extended descriptions + reaffirm tool definitions (no signature change) |
| `openclawminicrm/proxy/modules/claim-flow.js` | V.4.0 | Photo OCR validation chain (G4) |
| `openclawminicrm/proxy/modules/telegram-gung.js` | V.2.0 | 3 new aging categories (G5) |
| `openclawminicrm/proxy/modules/dinoco-cache.js` | V.1.1 | `snLookupCache` Map + `invalidateSnCache` + `invalidateAllSnCache` |

#### 15.14.9 Files touched (Round 3 — 2026-05-07)

| File | Version | Change |
|---|---|---|
| `openclawminicrm/docs/chatbot-rules.md` | V.1.6 | §15.14 base-extension clarification + cross-refs + 5 new R3 scenarios + 7 new fix history rows |
| `openclawminicrm/proxy/modules/sn-webhook.js` | V.1.0 (NEW) | WP→Agent webhook listener (`POST /webhook/sn-event`) — bearer auth + rate limit 1000/min + payload validation + MongoDB `sn_event_log` |
| `openclawminicrm/proxy/index.js` | V.2.3 | Wire sn-webhook module + register route |
| `openclawminicrm/proxy/modules/dinoco-tools.js` | V.6.2 | Crockford alphabet (excludes I/L/O/U) — `SN_CROCKFORD_REGEX` + `validateSnFormat()` + `SN_LENIENT_REGEX` tightened. `dinoco_warranty_check` description trimmed (is_owned_by_caller deferred per R3 Gap 2) |
| `openclawminicrm/proxy/modules/claim-flow.js` | V.4.1 | OCR_SN_REGEX strict Crockford + `ocr_misread_suspect` flag classification (less aggressive escalation) |
| `openclawminicrm/proxy/modules/dinoco-cache.js` | V.1.2 | `cacheSnLookup(sn, data, ttl_ms=60000)` accepts explicit per-entry TTL parameter |

**Round 3 deferred (out of file ownership scope, separate sprints):**

- `openclawminicrm/proxy/modules/telegram-alert.js` V.2.2 — alert flood suppression (per-sourceId 5/min limit + daily digest queue)
- WP-side: NEW snippet `[System] DINOCO SN Webhook Forwarder` (or extend MCP Bridge V.3.1) — hook `dinoco_sn_pool_status_changed` → POST `/webhook/sn-event` with bearer auth (Agent A task)
- MCP V.3.1 — emit derived `is_owned_by_caller` boolean server-side (PII gate) so AI tool can use it without exposing `registered_user_id`

**END OF CANONICAL BRAIN**
