/**
 * shared.js — Shared state, constants, and DB connection
 * V.1.8 — เพิ่มกฎ: สีเงิน/ดำ ซ่อมต่างกัน, Versys การ์ดแฮนด์, dealer app, strengthen rules
 */
const { MongoClient } = require("mongodb");
const crypto = require("crypto");

// === MongoDB ===
let db = null;
async function getDB() {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    db = client.db(process.env.MONGODB_DB || "smltrack");
    console.log("[DB] MongoDB connected");
    return db;
  } catch (e) {
    console.error("[DB] Failed:", e.message);
    return null;
  }
}

// === Collection names ===
const MESSAGES_COLL = "messages";
const AUDIT_LOG_COLL = "audit_logs";
const KB_COLL = "knowledge_base";
const MEMORY_COLL = "ai_memory";
const SKILL_LESSONS_COLL = "ai_skill_lessons";

// === Bot Config ===
const DEFAULT_BOT_NAME = process.env.BOT_NAME || "DINOCO Assistant";

const DEFAULT_PROMPT = `คุณคือ AI ผู้ช่วยของ DINOCO THAILAND — แบรนด์อะไหล่มอเตอร์ไซค์พรีเมียม (ผู้ผลิต ไม่ขายปลีก)
สินค้าหลัก: กล่องอลูมิเนียม IP67, แคชบาร์ (กันล้ม), แร็ค, ถาดรอง, การ์ดแฮนด์, กระเป๋า
ประกัน: กล่อง/กันล้ม/แร็ค 5 ปี, กระเป๋า ไม่มีประกัน, การ์ดแฮนด์ ไม่มีประกัน

รุ่นรถที่ DINOCO ผลิตสินค้าให้: Honda ADV350, Forza350, NX500, CB500X, XL750 (Transalp)
รุ่นพิเศษ: Kawasaki Versys 650 — DINOCO มีเฉพาะการ์ดแฮนด์ (Hand Guard) เท่านั้น ไม่มีแร็ค/กล่อง/กันล้มสำหรับ Versys
รุ่นที่ไม่ผลิต: ADV160, PCX, NMAX, Click, Wave, Rebel, MT-07, BMW GS และรถรุ่นอื่นที่ไม่อยู่ในรายการข้างบน
ถ้าลูกค้าถามรุ่นที่ไม่ผลิต → ตอบว่า "ขออภัยค่ะ ตอนนี้ DINOCO ยังไม่มีสินค้าสำหรับรุ่นนี้ค่ะ"
ถ้าลูกค้าพิมพ์แค่ "ADV" ไม่บอกรุ่น → ถามว่า "พี่ใช้ ADV รุ่นไหนคะ ADV350 หรือ ADV160 คะ" (เพราะ DINOCO มีเฉพาะ ADV350)

บทบาท:
- ให้ข้อมูลสินค้า ราคา อย่างถูกต้อง (ดึงจากระบบจริงเท่านั้น ห้ามเดา)
- ถามรุ่นรถลูกค้าก่อนแนะนำสินค้า (เพื่อแนะนำ fitment ที่ถูกต้อง)
- เมื่อลูกค้าสนใจสินค้า → ถามจังหวัด → หาตัวแทนใกล้บ้าน → เสนอประสานให้ทันที
- ห้ามรอลูกค้าบอก — ต้องเสนอเอง: "ให้ทางร้านติดต่อพี่กลับเลยนะคะ ขอเบอร์โทรหน่อยได้ไหมคะ"
- เมื่อได้เบอร์/จังหวัด → ใช้ tool dinoco_create_lead สร้าง lead + แจ้งตัวแทนอัตโนมัติ
- ถ้าลูกค้าอยากเป็นดีลเลอร์/ตัวแทนจำหน่าย → ขอข้อมูล 3 อย่าง: (1) ชื่อร้าน (2) จังหวัด (3) เบอร์โทร → แจ้งว่าจะส่งข้อมูลให้ฝ่ายขายติดต่อกลับ ห้ามบอกราคาต้นทุน/ส่วนลดดีลเลอร์
- ช่วยเรื่องการรับประกัน/เคลม
- จดจำบทสนทนาเก่าเพื่อให้บริการต่อเนื่อง
- ห้ามทักทาย "สวัสดี" ซ้ำถ้าเคยคุยกันแล้วในวันเดียวกัน ดูจากประวัติสนทนา ถ้ามีแล้วให้ตอบเนื้อหาเลย
- ★ ห้ามตอบว่า "ขอเช็คข้อมูลกับทีมงาน" โดยไม่เรียก tool ก่อน — ต้องเรียก dinoco_kb_search หรือ dinoco_product_lookup ก่อนเสมอ ถ้า tool ไม่มีข้อมูลจริงๆ ค่อยบอก "ขอเช็คข้อมูลเพิ่มเติมให้นะคะ"
- ห้ามกุรายละเอียดสินค้าเด็ดขาด ข้อมูลสินค้าต้องมาจาก tool เท่านั้น
- ถ้า tool คืนผลลัพธ์มา → ตอบจากผลลัพธ์นั้น ห้ามตอบว่า "ขอเช็คข้อมูล" ถ้ามีข้อมูลอยู่แล้ว
- เมื่อตอบรายการสินค้า → list ชื่อ+ราคาก่อน ไม่ต้องส่ง URL รูปทุกตัว
- เมื่อลูกค้าเลือกตัวไหนหรือขอดูรูป → ค่อยตอบ URL รูปเฉพาะตัวนั้น 1 ตัว
- ห้ามส่งรูปหลายรูปพร้อมกัน ส่งทีละ 1 ตามที่ลูกค้าถาม
- ถ้าสินค้าไม่มี img_url (ว่างเปล่า) → บอกลูกค้าว่า "รุ่นนี้ยังไม่มีรูปในระบบค่ะ" ห้ามกุ [Image] หรือ placeholder
- ห้ามตอบจากความจำของบทสนทนาเก่า ถ้าเกี่ยวกับข้อมูลสินค้า/ราคา/สต็อก ต้องเรียก tool ใหม่ทุกครั้ง

กฎบังคับเรียก tool (สำคัญมาก — ห้ามตอบจากความจำ):
- ลูกค้าถามเรื่อง สินค้า/ราคา/สต็อก → เรียก dinoco_product_lookup
- ลูกค้าถามเรื่อง ตัวแทน/ร้าน/จังหวัด/ซื้อที่ไหน → เรียก dinoco_dealer_lookup
- ลูกค้าถามเรื่อง ประกัน/เคลม/ซ่อม/ล้ม/ชนหนัก/มือสอง/ระยะเวลาเคลม → เรียก dinoco_kb_search
- ลูกค้าถามเรื่อง วัสดุ/อลูมิเนียม/สแตนเลส/สนิม/บุบ/กันน้ำ/น้ำเข้า/สีกล่อง → เรียก dinoco_kb_search
- ลูกค้าถามเรื่อง กุญแจหาย/กุญแจฝืด/ล้างกล่อง/ขัดแร็ค/มุมแตก/สติกเกอร์ → เรียก dinoco_kb_search
- ลูกค้าถามเรื่อง ค่าติดตั้ง/คู่มือ/วิธีติดตั้ง/เครื่องมือ/เสียงดัง/สั่น → เรียก dinoco_kb_search
- ลูกค้าถามเรื่อง PRO vs STD/Edition/Standard/แร็คศูนย์/ลำดับติดตั้ง → เรียก dinoco_kb_search
- ลูกค้าถามเรื่อง ที่อยู่/ออฟฟิศ/โรงงาน/ส่งเคลมที่ไหน → เรียก dinoco_kb_search
- ลูกค้าถามเรื่อง แบรนด์/ผลิตที่ไหน/ของจีนไหม/แบรนด์อะไร → เรียก dinoco_kb_search
- ลูกค้าถามเรื่อง ขนาดกล่อง/น้ำหนัก/ใส่หมวก/ความจุ/เบาะพิง → เรียก dinoco_kb_search
- ลูกค้าถามเรื่อง คืนสินค้า/เปลี่ยน/ผ่อน/COD/วิธีจ่ายเงิน → เรียก dinoco_kb_search
- ลูกค้าถามเรื่อง ด่า/ร้องเรียน/ไม่พอใจ/ห่วย/แย่มาก → เรียก dinoco_kb_search
- ลูกค้าถามเรื่อง เวลาทำการ/ติดต่อ/เบอร์โทร → เรียก dinoco_kb_search
- ลูกค้าถามเรื่อง อะไหล่แยก/การ์ดแฮนด์/กระเป๋า/ถาดรอง → เรียก dinoco_kb_search
สำคัญ: ถ้าไม่แน่ใจว่าคำถามอยู่ในหมวดไหน → เรียก dinoco_kb_search ก่อนเสมอ ห้ามตอบว่า "ขอเช็คข้อมูล" โดยไม่เรียก tool

ขั้นตอนแนะนำสินค้า (ทำตามลำดับ):
1. ลูกค้าถามสินค้า → ถามรุ่นรถ+ปีผลิต
2. ได้รุ่นรถ → ค้นสินค้าที่เข้ากัน (dinoco_product_lookup)
3. แนะนำสินค้า + ราคา + ประกัน
4. ลูกค้าสนใจ → ถามจังหวัด
5. ได้จังหวัด → หาตัวแทน (dinoco_dealer_lookup)
6. บอกชื่อร้าน + เสนอประสาน: "ให้ทางร้านติดต่อพี่กลับเลยนะคะ"
7. ได้เบอร์ → สร้าง lead (dinoco_create_lead) + แจ้งตัวแทน
8. ตอบลูกค้า: "แจ้งร้าน XXX แล้วค่ะ จะติดต่อพี่กลับเร็วที่สุดนะคะ"

แนะนำสินค้าเสริม (cross-sell):
- แนะนำได้เฉพาะสินค้าที่ได้จาก tool dinoco_product_lookup เท่านั้น ห้ามกุสินค้าที่ไม่มีในระบบ
- ถ้าอยากแนะนำสินค้าเสริม ต้องเรียก tool ค้นหาก่อนว่ามีจริงสำหรับรุ่นรถนั้น ถ้า tool ไม่คืนสินค้านั้น = ไม่มี = ห้ามพูดถึง
- ห้ามยัดเยียด ให้แนะนำเป็นธรรมชาติ 1 ประโยค ท้ายข้อความ ถ้ามีในระบบ
- ห้ามพูดว่า "มี...ด้วยนะคะ" "แอบกระซิบว่า..." "แนะนำเพิ่ม..." ถ้าสินค้านั้นไม่ได้อยู่ใน tool result ที่เพิ่งได้มา
- ADV350/Forza350/Scooter ไม่มีกล่องข้าง/แร็คข้าง — ห้ามแนะนำกล่องข้างให้รุ่นเหล่านี้เด็ดขาด

น้ำเสียง:
- สุภาพ เป็นกันเอง ใจบริการ ลงท้ายด้วย "ค่ะ/นะคะ"
- เรียกลูกค้าว่า "พี่" หรือ "คุณลูกค้า"
- ตอบกระชับ 2-3 ประโยค ไม่ยาวเยิ่นเย้อ
- ใช้ emoji น้อย (1-2 ตัวต่อข้อความ)
- ห้ามใช้ markdown เช่น **bold** *italic* # header — ลูกค้าอ่านใน Facebook/Instagram ที่ไม่รองรับ markdown ให้พิมพ์ plain text เท่านั้น
- ใช้ • (bullet) แทน * สำหรับ list

ข้อห้ามเด็ดขาด:
- ห้ามกุข้อมูลสินค้า/ราคา/ตัวแทนจำหน่าย — ใช้เฉพาะข้อมูลจากระบบ ถ้าสินค้าไม่อยู่ใน tool result = ไม่มีจริง = ห้ามพูดถึง
- ห้ามบอกราคาต้นทุน/ราคา dealer/ส่วนลด/จำนวนสต็อก
- DINOCO เป็น One Price ไม่มีโปรโมชั่น ถ้าลูกค้าถามลด ตอบ "DINOCO เป็นนโยบาย One Price ค่ะ ซื้อไปมั่นใจได้ว่าจะไม่มีโปรโมชั่นค่ะ"
- ห้ามพูดถึงแบรนด์คู่แข่ง ห้ามเอ่ยชื่อยี่ห้ออื่นเด็ดขาด ถ้าลูกค้าถามเปรียบเทียบ ตอบแค่จุดเด่นของ DINOCO
- ★ ห้ามบอกลูกค้าว่าเป็น AI หรือบอท เด็ดขาด — ถ้าลูกค้าถามว่า "เป็น AI ไหม" "เป็นบอทไหม" "เป็นคนจริงไหม" ให้ตอบว่า "ดิฉันเป็นทีมงาน DINOCO ค่ะ ยินดีให้บริการนะคะ" ห้ามตอบว่า "ฉันเป็น AI" เด็ดขาด
- ห้ามแสดงผล AI วิเคราะห์รูปให้ลูกค้าเห็น — เก็บไว้ภายในส่งให้แอดมินเท่านั้น
- ห้ามใช้คำว่า "AI", "ระบบอัตโนมัติ", "บอท", "ฉันเป็น AI", "เป็นผู้ช่วย AI" กับลูกค้า
- ห้ามใช้เครื่องหมาย ? เด็ดขาดไม่ว่ากรณีใด ภาษาไทยใช้ "คะ" "นะคะ" "ไหมคะ" แทน เช่น "สินค้ารุ่นอะไรคะ" ไม่ใช่ "สินค้ารุ่นอะไร?" หรือ "ไหมคะ?" ← ผิด ต้องเป็น "ไหมคะ"
- ถ้าลูกค้าพิมพ์ตัวเลข (เช่น "4400" "6900") → หมายถึงราคาตัวที่สนใจ ตอบเฉพาะตัวนั้น 1 ตัว + ส่งรูป (ถ้ามี) ห้าม list ซ้ำ
- ถ้าเพิ่งส่ง list สินค้าไปแล้ว + ลูกค้าตอบสั้นๆ → หมายถึงเลือกจาก list ที่ส่งไป ไม่ต้อง list ใหม่
- ดูประวัติสนทนาก่อนตอบทุกครั้ง ถ้าเพิ่งตอบเรื่องเดียวกัน ห้ามตอบซ้ำ
- ถ้าลูกค้าต้องการคุยกับคนจริง ให้ส่งเรื่องให้แอดมินทันที

กฎ ZERO-HALLUCINATION (ร้ายแรงที่สุด):
- ห้ามพูดชื่อสินค้าที่ไม่เคยเห็นใน tool result เด็ดขาด ถ้า tool ไม่คืนมา = ไม่มีจริง
- ห้ามกระซิบ/แนะนำ/เสริมว่า "มีสินค้าอื่นด้วยนะ" ถ้าไม่ได้เรียก tool ยืนยันก่อน
- ห้ามใช้คำว่า "นอกจากนี้ยังมี" "เรายังมี" "แถมยังมี" "แนะนำเพิ่ม" ถ้าสินค้านั้นไม่ได้อยู่ใน tool result
- ตัวอย่างที่ผิด: ลูกค้าถามแคชบาร์ ADV350 → tool คืนแคชบาร์ → ❌ กระซิบว่า "มีกล่องข้างอลูมิเนียมด้วยนะคะ" (ADV350 ไม่มีกล่องข้าง! นี่คือโกหก)
- ตัวอย่างที่ผิด: ลูกค้าถามแคชบาร์ ADV350 → tool คืนแคชบาร์ → ❌ "นอกจากนี้ DINOCO ยังมีกล่องข้างอลูมิเนียมสำหรับ ADV350 ด้วยค่ะ" (กุสินค้าที่ไม่มี!)
- ตัวอย่างที่ถูก: ลูกค้าถามแคชบาร์ ADV350 → tool คืนแคชบาร์ → ✅ ตอบเฉพาะแคชบาร์ที่ tool คืนมา
- ถ้าฝ่าฝืน = โกหกลูกค้า = ผิดร้ายแรงที่สุด

สินค้าแยกตามรุ่นรถ (ข้อมูลจาก KB — AI ต้องจำ):
- ADV350: มีเฉพาะ แร็คหลัง + กันล้ม (★ Full Set เท่านั้น แยกบน/ล่างไม่ได้) + กล่องหลัง → ไม่มีกล่องข้าง/แร็คข้าง เด็ดขาด → ทุกปีทุกโฉม
- Forza350: มีเฉพาะ แร็คหลัง + กันล้ม (Full Set สแตนเลสเท่านั้น) + กล่องหลัง → ★ เฉพาะโฉม 2024 ขึ้นไปเท่านั้น ปี 2023 หรือเก่ากว่าไม่รองรับ → ไม่มีกล่องข้าง/แร็คข้าง
- NX500: มีครบ (กล่อง/แร็ค/กันล้ม/การ์ดแฮนด์) → ★ ถามก่อนว่า Edition หรือ Standard (ชุดต่างกันมาก) → NX500 H2C Edition ใช้ร่วมกับ DINOCO ไม่ได้
- CB500X: มีครบเหมือน NX500 Standard (ปี 2015-2022) → ไม่ต้องถาม Edition → ปีก่อน 2015 ไม่รองรับ
- ★ XL750 (Transalp): สินค้า Exclusive Honda BigWing เท่านั้น — ถ้าลูกค้าถาม XL750 ต้องตอบว่า "เป็น Exclusive BigWing ค่ะ แนะนำติดต่อศูนย์ BigWing โดยตรง" ห้ามตอบว่า "ไม่มีสินค้า" เฉยๆ
- การ์ดแฮนด์: ไม่มีประกัน ★ ไม่มีอะไหล่แยก จำหน่ายเป็นชุดเท่านั้น ห้ามบอกว่าซื้อแยกได้
- กระเป๋า: ไม่มีประกัน — EXPAND SIDE BOX ★ ไม่กันน้ำ 100% กันละอองน้ำเบาๆ เท่านั้น
- ★ กล่องหลัง DINOCO ต้องมีแร็คท้าย (Top Rack) เป็นฐานรองรับเสมอ ห้ามบอกว่า "ซื้อกล่องเฉยๆ ไม่ต้องมีแร็คก็ได้"
- กล่องหลัง DINOCO ทุกใบแถมเบาะพิงหลัง 2 ชิ้น (บนและล่าง)
- กล่อง DINOCO มี 2 สี: ดำ (Black) และ เงิน (Silver Anodize) สีเหมือนกันทั้งกล่องหลังและกล่องข้าง
- ★ ซ่อมดัดสีต่างกัน: สีเงิน (Silver Anodize) ซ่อมดัดฟรีค่าแรง ไม่มีค่าทำสี / สีดำ (Black) ค่าดัดฟรีแต่มีค่าทำสี → ค่าใช้จ่ายไม่เท่ากัน ต้องบอกลูกค้าชัดเจน
- กล่อง 45L: 44x37x36 ซม. 6.5 กก. / 55L: 45x40x38 ซม. 7.9 กก. / 37L ข้าง: 24x50x40 ซม. 9.9 กก. (2ใบรวม)
- กล่องข้าง 37L ใส่หมวกกันน็อคไม่ได้ (เล็กเกินไป)
- ที่อยู่ส่งเคลม: บริษัท พีพีที กรุ๊ป คอร์ปอเรชั่น จำกัด 21/106 ซ.ลาดพร้าว 15 แขวงจอมพล เขตจตุจักร กทม 10900 โทร 061-639-9994
- ระยะเวลาเคลม: ข้อบกพร่องจากผลิต 15-30 วัน (บริษัทออกค่าส่ง) / อุบัติเหตุ 30-45 วัน (ลูกค้าออกค่าส่ง)
- น้ำเข้ากล่อง: ให้ตรวจสอบซีลยาง+การปิดฝา ถ้ายังรั่วส่งเคลมได้
- ชุด STD ใช้กับแร็คศูนย์ NX500 Edition ไม่ได้ ต้องใช้ชุด PRO เท่านั้น
- ห้ามพูดว่า "ประกันตลอดอายุ" หรือ "ประกันตลอดชีพ" เด็ดขาด — ยาวสุดคือ 5 ปี
- ห้ามอ้างว่า "กำลังพัฒนา" หรือ "เร็วๆ นี้จะมี" สำหรับสินค้าที่ไม่มี
- ชนหนักเกิน 50%: ไม่รับซ่อม (อันตราย) → แนะนำซื้ออะไหล่แยกชิ้นแทน ทีมช่างตัดสินเส้นแบ่ง
- กุญแจหมดประกัน: เปลี่ยนเบ้ากุญแจ 400 บาท ลูกค้าออกค่าส่ง
- มุมพลาสติกแตก: เปลี่ยนฟรีไม่จำกัดครั้ง แต่แนะนำขับชินก่อนค่อยส่งมา (ใช้เวลา 30-50 วัน)
- คืน/เปลี่ยนสินค้า: พูดคุยกันได้ แต่ปกติไม่เกิดเพราะซื้อผ่านตัวแทน
- ชำระเงิน: ตัวแทนรับโอน/PromptPay ผ่อน/รูดบัตร ขึ้นกับแต่ละร้าน
- ส่งของให้ตัวแทน: 3-15 วัน แล้วแต่สต็อก
- มือสอง: ประกันโอนไม่ได้ (ขาดสิทธิ์) แต่ยังส่งซ่อมได้ (เสียค่าใช้จ่าย)
- NX500 H2C Edition (แต่งออกศูนย์): ไม่มีอะไรใช้ร่วมกับ DINOCO เลย
- เวลาทำการ DINOCO: จันทร์-ศุกร์ 9.00-17.00 น. ติดต่อผ่าน Facebook Page หรือ LINE เท่านั้น (ไม่มี Call Center)`;

// === [DINOCO] Dynamic Keys — อ่านจาก Dashboard settings (MongoDB) ก่อน fallback .env ===
let _cachedAccountKeys = null;
let _cachedAccountKeysAt = 0;
const ACCOUNT_KEYS_TTL = 60 * 1000; // refresh ทุก 60 วินาที

async function loadAccountKeys() {
  if (_cachedAccountKeys && Date.now() - _cachedAccountKeysAt < ACCOUNT_KEYS_TTL) return _cachedAccountKeys;
  try {
    const database = await getDB();
    if (!database) return null;
    const account = await database.collection("accounts").findOne({}, { sort: { updatedAt: -1 } });
    if (account) {
      _cachedAccountKeys = account;
      _cachedAccountKeysAt = Date.now();
    }
    return account;
  } catch { return null; }
}

// === Seed .env keys → MongoDB ทุกครั้งที่ Agent start ===
// ถ้า .env มีค่า + MongoDB ยังว่าง → ใส่ให้ | ถ้า Dashboard ตั้งเอง → ไม่ overwrite
async function seedEnvKeysToMongoDB() {
  const database = await getDB();
  if (!database) return;

  const envKeys = {
    "aiKeys.googleKey": process.env.GOOGLE_API_KEY,
    "aiKeys.anthropicKey": process.env.ANTHROPIC_API_KEY,
    "aiKeys.openrouterKey": process.env.OPENROUTER_API_KEY,
    "aiKeys.groqKey": process.env.GROQ_API_KEY,
    "aiKeys.sambaNovaKey": process.env.SAMBANOVA_API_KEY,
    "aiKeys.cerebrasKey": process.env.CEREBRAS_API_KEY,
    "lineConfig.channelAccessToken": process.env.LINE_CHANNEL_ACCESS_TOKEN,
    "lineConfig.channelSecret": process.env.LINE_CHANNEL_SECRET,
    "fbConfig.pageAccessToken": process.env.FB_PAGE_ACCESS_TOKEN,
    "fbConfig.appSecret": process.env.FB_APP_SECRET,
    "fbConfig.verifyToken": process.env.FB_VERIFY_TOKEN,
  };

  // Sync ลงทุก account document ที่มี
  const accounts = await database.collection("accounts").find({}).toArray();
  const targets = accounts.length > 0 ? accounts : [null]; // null = สร้างใหม่

  for (const existing of targets) {
    const setFields = {};
    let count = 0;
    for (const [path, envVal] of Object.entries(envKeys)) {
      if (!envVal) continue;
      const parts = path.split(".");
      const existingVal = existing ? parts.reduce((o, k) => o?.[k], existing) : null;
      if (!existingVal) { setFields[path] = envVal; count++; }
    }

    // setupComplete ต้อง true เสมอ (Agent ทำงานได้ = setup เสร็จ)
    setFields["setupComplete"] = true;
    setFields["updatedAt"] = new Date();

    if (existing) {
      if (count > 0) {
        await database.collection("accounts").updateOne({ _id: existing._id }, { $set: setFields });
        console.log(`[Keys] Synced ${count} keys from .env → account ${existing.email || existing._id}`);
      } else {
        // ไม่มี key ใหม่ แต่ต้องมั่นใจว่า setupComplete = true
        await database.collection("accounts").updateOne({ _id: existing._id }, { $set: { setupComplete: true } });
      }
    } else {
      // ไม่มี account เลย → สร้างใหม่
      await database.collection("accounts").insertOne({
        email: "admin@dinoco.in.th", name: "DINOCO Admin",
        ...Object.fromEntries(Object.entries(setFields).map(([k, v]) => {
          const parts = k.split(".");
          return parts.length === 1 ? [k, v] : [parts[0], { ...(setFields[parts[0]] || {}), [parts[1]]: v }];
        }).filter(([, v]) => typeof v !== "object")),
        aiKeys: {
          googleKey: envKeys["aiKeys.googleKey"] || "",
          anthropicKey: envKeys["aiKeys.anthropicKey"] || "",
          openrouterKey: envKeys["aiKeys.openrouterKey"] || "",
          groqKey: envKeys["aiKeys.groqKey"] || "",
          sambaNovaKey: envKeys["aiKeys.sambaNovaKey"] || "",
          cerebrasKey: envKeys["aiKeys.cerebrasKey"] || "",
        },
        lineConfig: {
          channelAccessToken: envKeys["lineConfig.channelAccessToken"] || "",
          channelSecret: envKeys["lineConfig.channelSecret"] || "",
        },
        fbConfig: {
          pageAccessToken: envKeys["fbConfig.pageAccessToken"] || "",
          appSecret: envKeys["fbConfig.appSecret"] || "",
          verifyToken: envKeys["fbConfig.verifyToken"] || "",
        },
        setupComplete: true, createdAt: new Date(), updatedAt: new Date(),
      });
      console.log(`[Keys] Created new account with ${count} keys from .env`);
    }
  }
}

// อ่าน key จาก MongoDB (Dashboard settings) ก่อน → fallback process.env
async function getDynamicKey(keyName) {
  const account = await loadAccountKeys();
  const mapping = {
    GOOGLE_API_KEY: account?.aiKeys?.googleKey,
    OPENROUTER_API_KEY: account?.aiKeys?.openrouterKey,
    GROQ_API_KEY: account?.aiKeys?.groqKey,
    SAMBANOVA_API_KEY: account?.aiKeys?.sambaNovaKey,
    CEREBRAS_API_KEY: account?.aiKeys?.cerebrasKey,
    ANTHROPIC_API_KEY: account?.aiKeys?.anthropicKey,
    LINE_CHANNEL_ACCESS_TOKEN: account?.lineConfig?.channelAccessToken,
    LINE_CHANNEL_SECRET: account?.lineConfig?.channelSecret,
    FB_PAGE_ACCESS_TOKEN: account?.fbConfig?.pageAccessToken,
    FB_APP_SECRET: account?.fbConfig?.appSecret,
    FB_VERIFY_TOKEN: account?.fbConfig?.verifyToken,
  };
  return mapping[keyName] || process.env[keyName] || "";
}

// Sync: อ่านทันที (ใช้ cached ถ้ามี fallback env)
function getDynamicKeySync(keyName) {
  const account = _cachedAccountKeys;
  if (account) {
    const mapping = {
      GOOGLE_API_KEY: account?.aiKeys?.googleKey,
      OPENROUTER_API_KEY: account?.aiKeys?.openrouterKey,
      GROQ_API_KEY: account?.aiKeys?.groqKey,
      SAMBANOVA_API_KEY: account?.aiKeys?.sambaNovaKey,
      CEREBRAS_API_KEY: account?.aiKeys?.cerebrasKey,
      ANTHROPIC_API_KEY: account?.aiKeys?.anthropicKey,
      LINE_CHANNEL_ACCESS_TOKEN: account?.lineConfig?.channelAccessToken,
      LINE_CHANNEL_SECRET: account?.lineConfig?.channelSecret,
      FB_PAGE_ACCESS_TOKEN: account?.fbConfig?.pageAccessToken,
      FB_APP_SECRET: account?.fbConfig?.appSecret,
      FB_VERIFY_TOKEN: account?.fbConfig?.verifyToken,
    };
    if (mapping[keyName]) return mapping[keyName];
  }
  return process.env[keyName] || "";
}

// === A/B Testing Prompts ===
const AB_PROMPTS = {
  A: "ตอบสั้นๆ กระชับ ไม่เกิน 2 ประโยค",
  B: "ตอบอย่างเป็นมิตร ใส่ emoji ให้รู้สึกอบอุ่น ไม่เกิน 3 ประโยค",
};

function getABVariant(sourceId) {
  const hash = sourceId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return hash % 2 === 0 ? "A" : "B";
}

// === AI Cost Tracking Pricing ===
const AI_PRICING = {
  "OR-Nemotron": { input: 0, output: 0 },
  "OR-DeepSeek": { input: 0, output: 0 },
  "OR-Llama": { input: 0, output: 0 },
  "OR-Trinity": { input: 0, output: 0 },
  "OR-StepFlash": { input: 0, output: 0 },
  "SambaNova": { input: 0, output: 0 },
  "Groq": { input: 0.059, output: 0.079 },
  "Cerebras": { input: 0.01, output: 0.01 },
  "Gemini": { input: 0, output: 0 },
  "Gemini-Embed": { input: 0, output: 0 },
  "openrouter": { input: 0.18, output: 0.18 },
  "OR-Vision": { input: 0, output: 0 },
  "Groq-Vision": { input: 0.059, output: 0.079 },
  "Gemini-Vision": { input: 0, output: 0 },
};

const PAID_AI = process.env.PAID_AI_ENABLED === "true";

// === Audit Log ===
async function auditLog(action, details = {}) {
  const db = await getDB();
  if (!db) return;
  try {
    await db.collection(AUDIT_LOG_COLL).insertOne({
      action,
      ...details,
      createdAt: new Date(),
    });
  } catch {}
}

// === AI Cost Tracking ===
async function trackAICost({ provider, model, feature, inputTokens = 0, outputTokens = 0, sourceId = null, success = true }) {
  try {
    const database = await getDB();
    if (!database) return;
    const pricing = AI_PRICING[provider] || { input: 0, output: 0 };
    const totalTokens = inputTokens + outputTokens;
    const costUsd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1000000;
    await database.collection("ai_costs").insertOne({
      provider,
      model: model || provider,
      feature,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd: Math.round(costUsd * 1000000) / 1000000,
      sourceId,
      success,
      createdAt: new Date(),
    });
  } catch (e) {
    // silent
  }
}

// === Bot Config Cache ===
const botConfigCache = {};

async function getBotConfig(sourceId, sourceMeta) {
  const cached = botConfigCache[sourceId];
  if (cached && Date.now() - cached._ts < 60000) return cached;
  const database = await getDB();
  if (!database) return { systemPrompt: DEFAULT_PROMPT, botName: DEFAULT_BOT_NAME };
  try {
    let config = await database.collection("bot_config").findOne({ sourceId });
    if (!config) {
      config = {
        sourceId,
        sourceType: sourceMeta?.type || "unknown",
        groupName: sourceMeta?.groupName || null,
        botName: DEFAULT_BOT_NAME,
        systemPrompt: DEFAULT_PROMPT,
        aiAutoReply: false,
        aiReplyMode: "off",
        aiReplyKeywords: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await database.collection("bot_config").insertOne(config);
      console.log(`[Config] Auto-created config for ${sourceId} (${sourceMeta?.groupName || "unknown"})`);
    }
    config._ts = Date.now();
    botConfigCache[sourceId] = config;
    return config;
  } catch (e) {
    return { systemPrompt: DEFAULT_PROMPT, botName: DEFAULT_BOT_NAME };
  }
}

async function setBotConfig(sourceId, updates) {
  const database = await getDB();
  if (!database) return;
  await database.collection("bot_config").updateOne(
    { sourceId },
    { $set: { ...updates, sourceId, updatedAt: new Date() } },
    { upsert: true }
  );
  delete botConfigCache[sourceId];
}

// === Privacy / Opt-out Keywords ===
const OPT_OUT_KEYWORDS = ["หยุด", "stop", "ยกเลิก", "unsubscribe"];
const OPT_IN_KEYWORDS = ["เปิด", "start", "subscribe"];
const DELETE_KEYWORDS = ["ลบข้อมูล", "delete my data", "ลบ"];
const HANDOFF_REGEX = /คุยกับคน|ขอคุยกับพนักงาน|ต้องการคนจริง|ไม่ใช่ bot|talk to human|real person|agent/;

// === PDPA Notice ===
const DINOCO_PRIVACY_TEXT = `🔒 แจ้งเตือนจาก DINOCO THAILAND

ระบบนี้ใช้ AI ในการวิเคราะห์และตอบกลับข้อความ ข้อมูลของคุณจะถูกเก็บรักษาตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)

ผู้ควบคุมข้อมูล: DINOCO THAILAND
ข้อมูลที่เก็บ: ชื่อ, ข้อความสนทนา, จังหวัด
ระยะเวลาเก็บ: 90 วันสำหรับ lead, 1 ปีสำหรับเคลม

พิมพ์ "หยุด" เพื่อไม่รับข้อความอัตโนมัติ
พิมพ์ "ลบข้อมูล" เพื่อขอลบข้อมูลของคุณ`;

const PRIVACY_TEXT = `🔒 แจ้งเตือน: ระบบนี้ใช้ AI ในการวิเคราะห์และตอบกลับข้อความ ข้อมูลของคุณจะถูกเก็บรักษาตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)\n\nพิมพ์ "หยุด" เพื่อหยุดรับข้อความอัตโนมัติ\nพิมพ์ "ลบข้อมูล" เพื่อขอลบข้อมูลของคุณ`;

// === MCP state ===
const mcpTools = [];
const mcpToolHandlers = {};

// === Qdrant Config ===
const QDRANT_URL = process.env.QDRANT_URL || "";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || "";
const QDRANT_COLLECTION = "knowledge_base";

// === Payment Keywords ===
const PAYMENT_KEYWORDS = [
  /โอนแล้ว/, /ส่งสลิป/, /จ่ายแล้ว/, /ชำระแล้ว/, /โอนเงิน/,
  /ยอดโอน/, /โอนให้แล้ว/, /จ่ายเงินแล้ว/, /แนบสลิป/, /โอนเรียบร้อย/,
];

// === CEO Plan / Staff ===
const KUNG_STAFF = [
  { id: "E01", name: "แก้ว", role: "แก้ปัญหาลูกค้า", feature: "crm-analysis" },
  { id: "E02", name: "ทองคำ", role: "หาโอกาสขาย", feature: "sales-hunter" },
  { id: "E03", name: "ครูโค้ช", role: "โค้ชทีมงาน", feature: "team-coaching" },
  { id: "E04", name: "อาร์ม", role: "วางกลยุทธ์", feature: "weekly-strategy" },
  { id: "E05", name: "หมอใจ", role: "ดูแลลูกค้า", feature: "health-monitor" },
  { id: "E06", name: "แบงค์", role: "ตรวจสลิป", feature: "payment-guardian" },
  { id: "E07", name: "เมฆ", role: "ติดตามส่งของ", feature: "order-tracker" },
  { id: "E08", name: "ขนุน", role: "ดึงลูกค้ากลับ", feature: "re-engagement" },
  { id: "E09", name: "แนน", role: "แนะนำสินค้า", feature: "upsell-crosssell" },
  { id: "E10", name: "บุ๋ม", role: "สรุปรายวัน", feature: "daily-report" },
  { id: "E11", name: "แต้ม", role: "ให้คะแนน", feature: "lead-scorer" },
  { id: "E12", name: "นาฬิกา", role: "เตือนนัดหมาย", feature: "appointment-reminder" },
  { id: "E13", name: "เปรียบ", role: "วิเคราะห์ราคา", feature: "price-watcher" },
];
const KUNG_TO_FEATURE = Object.fromEntries(KUNG_STAFF.map(s => [s.name, s.feature]));
const KUNG_NAMES = KUNG_STAFF.map(s => s.name);
const KUNG_ID_TO_NAME = Object.fromEntries(KUNG_STAFF.map(s => [s.id, s.name]));

// === [BOSS] Dynamic AI Rules — อ่านจาก MongoDB inject เข้า prompt ===
let _cachedRules = null;
let _cachedRulesAt = 0;
const RULES_CACHE_TTL = 30000;

async function loadActiveRules() {
  if (_cachedRules && Date.now() - _cachedRulesAt < RULES_CACHE_TTL) return _cachedRules;
  try {
    const database = await getDB();
    if (!database) return [];
    const rules = await database.collection("ai_rules")
      .find({ active: true, deletedAt: null })
      .sort({ priority: -1 }).toArray();
    _cachedRules = rules;
    _cachedRulesAt = Date.now();
    return rules;
  } catch { return []; }
}

function buildRulesPrompt(rules) {
  if (!rules || rules.length === 0) return "";
  let prompt = "\n\n=== กฎเพิ่มเติมจาก Admin (ต้องปฏิบัติตามเคร่งครัด) ===\n";
  rules.forEach((r, i) => { prompt += `${i + 1}. ${r.instruction}\n`; });
  return prompt;
}

function clearRulesCache() { _cachedRules = null; _cachedRulesAt = 0; }

// === [BOSS] Message Templates — แก้ข้อความ hardcoded จาก Dashboard ===
let _cachedTemplates = null;
let _cachedTemplatesAt = 0;

async function getTemplate(templateId) {
  if (!_cachedTemplates || Date.now() - _cachedTemplatesAt > 60000) {
    try {
      const database = await getDB();
      if (database) {
        const templates = await database.collection("message_templates").find({ active: true }).toArray();
        _cachedTemplates = Object.fromEntries(templates.map(t => [t.templateId, t.message]));
        _cachedTemplatesAt = Date.now();
      }
    } catch {}
  }
  return _cachedTemplates?.[templateId] || null;
}

function clearTemplateCache() { _cachedTemplates = null; _cachedTemplatesAt = 0; }

module.exports = {
  getDB,
  MESSAGES_COLL,
  AUDIT_LOG_COLL,
  KB_COLL,
  MEMORY_COLL,
  SKILL_LESSONS_COLL,
  DEFAULT_BOT_NAME,
  DEFAULT_PROMPT,
  AB_PROMPTS,
  getABVariant,
  AI_PRICING,
  PAID_AI,
  auditLog,
  trackAICost,
  botConfigCache,
  getBotConfig,
  setBotConfig,
  OPT_OUT_KEYWORDS,
  OPT_IN_KEYWORDS,
  DELETE_KEYWORDS,
  HANDOFF_REGEX,
  DINOCO_PRIVACY_TEXT,
  PRIVACY_TEXT,
  mcpTools,
  mcpToolHandlers,
  QDRANT_URL,
  QDRANT_API_KEY,
  QDRANT_COLLECTION,
  PAYMENT_KEYWORDS,
  KUNG_STAFF,
  KUNG_TO_FEATURE,
  KUNG_NAMES,
  KUNG_ID_TO_NAME,
  getDynamicKey,
  getDynamicKeySync,
  loadAccountKeys,
  seedEnvKeysToMongoDB,
  get _cachedAccountKeys() { return _cachedAccountKeys; },
  loadActiveRules,
  buildRulesPrompt,
  clearRulesCache,
  getTemplate,
  clearTemplateCache,
};
