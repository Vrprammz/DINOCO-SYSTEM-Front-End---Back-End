# DINOCO Chatbot Rules — Canonical Brain

> **ไฟล์นี้คือ "สมองกลาง" ของ chatbot DINOCO**
> ทุก rule ในไฟล์นี้คือสิ่งที่ถูกแก้ไปแล้ว **ห้ามเปลี่ยน** เวลาแก้ feature อื่น
> ก่อนแก้อะไรที่เกี่ยวกับ chatbot (ai-chat.js, shared.js, dinoco-tools.js) **ต้องอ่านไฟล์นี้ก่อนเสมอ**

**Last updated:** 2026-04-11 | **Version:** 1.3
**Regression status:** 25/25 PASS (100%) — Gate verified stable

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

**END OF CANONICAL BRAIN**
