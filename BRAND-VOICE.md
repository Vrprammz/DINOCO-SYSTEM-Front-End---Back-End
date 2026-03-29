# [Admin System] DINOCO Brand Voice Pool

**Shortcode:** `[dinoco_brand_voice]`
**DB_ID:** 1159
**Version:** V.2.1
**วันที่สร้าง:** 2026-03-29

---

## สรุปภาพรวม

ระบบเก็บเสียงลูกค้าจากโซเชียลมีเดีย เปรียบเทียบแบรนด์ DINOCO กับคู่แข่ง 5 ราย

เพิ่มเป็น tab "Brand Voice" ใน Admin Dashboard (sidebar section Marketing)

---

## Version History

| Version | Commit | สิ่งที่ทำ |
|---------|--------|----------|
| V.1.0 | `1efde3f` | สร้าง CPT + form + list + stats + เพิ่ม tab ใน Dashboard |
| V.1.1 | `8b5c00b` | AI รวบรวมเสียงลูกค้าอัตโนมัติ — กดปุ่มเดียว |
| V.1.2 | `329827d` | ระบุกลุ่ม Facebook/YouTube/TikTok ที่ติดตาม |
| V.1.3 | `26627c6` | แก้ PHP syntax error + ลด entries 25→10 + max_tokens fix |
| V.1.4 | `6d8b0fd` | UI ภาษาไทย + highlight DINOCO + เพิ่ม % เชิงลบ |
| V.1.5 | `f731d3e` | บังคับ categories จาก list + กราฟ top 8 |
| V.1.6 | `1030351` | Bookmarklet เก็บเสียงลูกค้าจากโซเชียลได้ทันที |
| V.1.7 | `3ee7e0f` | แก้ Bookmarklet hash ให้เปิด Brand Voice tab ถูกต้อง |
| V.2.0 | `52152c2` | REST API + Chrome Extension สำหรับเก็บข้อมูลจากโซเชียล |
| V.2.1 | - | One-click: AI วิเคราะห์ Post+Comments แยก entry อัตโนมัติ |

---

## แบรนด์ที่ติดตาม (6 ราย)

| แบรนด์ | คำอธิบาย |
|--------|---------|
| **DINOCO** | อะไหล่แต่ง Honda BigBike จำหน่ายผ่านตัวแทน+BigWing |
| **SRC** | Sriracha (Snowface Co.) — ผู้นำตลาด |
| **F2MOTO** | กำลังโต เน้น online |
| **BMMOTO** | เน้น Honda CB/Rebel ราคากลาง |
| **MOTOSkill** | Premium เน้น touring |
| **H2C** | Honda 2 wheelers Customization — ของ Honda เอง ขายใน BigWing |

---

## REST API (V.2.0)

Base: `/wp-json/brand-voice/v1/`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/entries` | API Key | สร้าง entry เดียว |
| POST | `/entries/batch` | API Key | สร้าง entries หลายอัน (max 50) |
| POST | `/entries/ai-bulk` | API Key | รับ post+comments → AI วิเคราะห์แยก entry |
| GET | `/meta` | API Key | ดึง brands/categories/models/platforms |
| POST | `/api-keys/generate` | WP Admin | สร้าง API Key ใหม่ |

Auth header: `X-BV-API-Key: bvk_...`
Rate limit: 60 req/min per key

## Chrome Extension (`brand-voice-extension/`)

| File | Description |
|------|-------------|
| `manifest.json` | Manifest V3, permissions: activeTab + storage |
| `content.js` | ดึงข้อมูลจาก Facebook/YouTube/TikTok/Pantip/IG |
| `popup.html` | UI เลือก brand/sentiment/category |
| `popup.js` | Logic ส่งข้อมูลผ่าน REST API |

---

## โครงสร้าง 4 Tabs

### Tab 1: Dashboard (default)
- **แหล่งที่ติดตาม** — แอดมินระบุ Facebook/YouTube/TikTok groups
- **AI รวบรวมเสียงลูกค้า** — กดปุ่ม → Claude สร้าง 10 entries
- **KPI 4 กล่อง** — เสียงทั้งหมด, เชิงบวก%, เชิงลบ%, แบรนด์ที่ติดตาม
- **เปรียบเทียบแบรนด์** — ตาราง 6 แบรนด์ + sentiment bar (DINOCO highlight)
- **แหล่งที่มา** — Donut chart (Facebook/YouTube/TikTok)
- **หมวดที่พูดถึง** — Bar chart top 8

### Tab 2: เสียงลูกค้า
- ตาราง entries — วันที่, แบรนด์, สรุป, ความรู้สึก, แหล่งที่มา
- Filter: แบรนด์, sentiment, platform, search
- Click expand → ข้อความเต็ม + tags + source
- Row เชิงลบ highlight สีแดง + คำเตือน

### Tab 3: เพิ่ม Manual
- Form สำหรับกรอกข้อมูลเอง (เสียงลูกค้าจริง)
- Auto-detect platform จาก URL
- Batch mode (ค้าง brand/model/platform)

### Tab 4: Bookmarklet
- ปุ่ม **"+ Brand Voice"** — ลากไปวาง Bookmark Bar
- วิธีใช้ 4 ขั้นตอน (ลาก → เลือกข้อความ → กด → บันทึก)
- Auto-detect platform: Facebook, YouTube, TikTok, Instagram, Pantip, LINE
- เปิด Brand Voice ใน popup พร้อม prefill: content, URL, source name, platform

---

## Data Model (CPT: `brand_voice`)

| Field | Type | คำอธิบาย |
|-------|------|---------|
| `bv_brands` | Array | แบรนด์ที่พูดถึง (เลือกได้หลายอัน) |
| `bv_content` | Text | ข้อความเต็ม |
| `bv_summary` | Text | สรุป 1 บรรทัด |
| `bv_sentiment` | Select | positive / neutral / negative / mixed |
| `bv_intensity` | Number 1-5 | ความรุนแรง |
| `bv_categories` | Array | หมวด (9 รายการ) |
| `bv_platform` | Select | facebook_group / youtube / tiktok / อื่นๆ |
| `bv_source_url` | URL | ลิงก์ต้นทาง |
| `bv_source_name` | Text | ชื่อกลุ่ม/ช่อง |
| `bv_post_date` | Date | วันที่โพสต์ |
| `bv_models` | Array | รุ่นรถ (CB650R, Rebel 500, Forza 350...) |
| `bv_entry_method` | Select | manual / ai_generated |

### Categories (9 รายการ)
quality, price, design, fitment, service, shipping, warranty, availability, comparison

---

## AI Collect

- กดปุ่ม "AI รวบรวมเสียงลูกค้า" → Claude สร้าง 10 entries
- Cache 6 ชม. — กด "รวบรวมใหม่" bypass cache
- entries มี `bv_entry_method = 'ai_generated'`
- ใช้กลุ่มที่แอดมินระบุ + AI หาเพิ่มเอง

### ข้อจำกัด
- ข้อมูลจาก AI = **ประมาณการจาก knowledge** ไม่ใช่ scrape จริง
- ไม่มี URL ต้นทาง
- ข้อมูล manual ที่กรอกเอง = **ข้อมูลจริง 100%**

---

## แหล่งที่ติดตาม

เก็บใน `wp_options` key `bv_tracked_sources` — แอดมินระบุเอง เช่น:
```
Facebook: Honda CB650R Thailand
Facebook: Rebel 500 Club TH
YouTube: MotoReview TH
TikTok: #HondaBigBike
```

---

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|------|--------|
| `[Admin System] DINOCO Brand Voice Pool` (DB_ID: 1159) | Snippet หลัก |
| `[Admin System] DINOCO Admin Dashboard` (DB_ID: 21) | Parent — tab "Brand Voice" |
| `[Admin System] AI Provider Abstraction` (DB_ID: 1040) | Claude API wrapper |
| `brand-voice-extension/` | Chrome Extension (Manifest V3) |

---

## Backlog

### Phase 2 (ต่อยอด)
1. ~~**Bookmarklet**~~ — ✅ ทำแล้ว V.1.6
2. ~~**Browser Extension**~~ — ✅ ทำแล้ว V.2.0 (Chrome Extension + REST API)
3. **เชื่อม Finance AI** — ใช้ Brand Voice data จริงแทน knowledge
4. **Sentiment trend chart** — แนวโน้มรายสัปดาห์/เดือน
5. **Word cloud** — คำที่พูดถึงบ่อย
6. **LINE alert** — แจ้งเมื่อ negative spike
7. **Response tracking** — DINOCO ตอบกลับหรือยัง
8. **Influencer tagging** — คน influence สูง weight มากกว่า
