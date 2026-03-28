# [Admin System] DINOCO Admin Finance Dashboard

**Shortcode:** `[dinoco_admin_finance]`
**DB_ID:** 1158
**Version:** V.3.16
**วันที่สร้าง:** 2026-03-28
**อัพเดทล่าสุด:** 2026-03-29

---

## สรุปภาพรวม

หน้า Finance Dashboard สำหรับแอดมินบัญชี/ผู้บริหาร DINOCO แสดงข้อมูลการเงิน หนี้ รายได้ ตัวแทนจำหน่าย แผนที่เครือข่าย และ AI วิเคราะห์ความเสี่ยง

เพิ่มเป็น tab "การเงิน" ใน Admin Dashboard (sidebar section B2B System)

---

## Version History

| Version | Commit | สิ่งที่ทำ |
|---------|--------|----------|
| V.1.0 | `bbf5a29` | สร้างไฟล์ใหม่ — KPI 8 กล่อง, กราฟ 3 ตัว, ตาราง 2 ตัว, Order Pipeline |
| V.2.0 | `ca830b3` | เพิ่มตารางรายได้ตัวแทน, แผนที่ภาค (SVG blob), AI Risk Assessment (Claude) |
| V.3.0 | `31abbf9` | Rewrite UI — ลดขนาด KPI, เรียงลำดับหนี้ก่อนรายได้, AI return JSON, Honda BigWing context |
| V.3.2 | `42f879a` | เปลี่ยนเป็น Leaflet map + AI tips กระจายทั่วหน้า |
| V.3.3 | `f6fa1a1` | AI prompt rewrite — ที่ปรึกษาบริหารธุรกิจอาวุโส, BigWing 22 สาขา 18 จังหวัดจริง |
| V.3.4 | `7607259` | แก้ bug 4 ตัว + Quick Wins 5 ตัว (Collection Rate, MoM%, AOV, Churn Warning, BigWing Coverage) |
| V.3.5 | `81f8a9d` | SVG map ไทย 77 จังหวัดจริง (จาก GeoJSON) + tooltip + markers |
| V.3.6 | `0239487` | Region tabs zoom + stats panel ข้างแผนที่ |
| V.3.7 | `d17d58f` | ปรับขนาด SVG dynamic ตามภาค |
| V.3.8 | `7ad6e1b` | Map stats compact grid + AI API key check + debug info |
| V.3.9 | `659df60` | Province potential data ศักยภาพ BigBike + tooltip คำแนะนำ |
| V.3.10 | `5e9f45e` | Map layout 48:52 + AI timeout 60s + compact data |
| V.3.11 | `c53fe2a` | Province recs list + map fullscreen + AI tip overflow fix |
| V.3.12 | `0f341d5` | ตารางคู่แข่ง + Seasonal + tooltip fixed position |
| V.3.13 | `8d6ed41` | AI ไม่โหลดอัตโนมัติ — ใช้ cache + กดปุ่มวิเคราะห์เอง |
| V.3.14 | `391234a` | ตาราง Brand Sentiment + max_tokens 8192 + cache fix |
| V.3.15 | `4f600e5` | Province recs ใช้ข้อมูลจริง + เกณฑ์ 20K + AI timeout 90s |
| V.3.16 | `4248994` | ลด AI prompt 70% แก้ timeout — JSON schema กระชับ |

---

## โครงสร้างหน้า (เรียงตามลำดับ)

### 1. KPI Cards (10 กล่อง)

**Row 1 — หนี้ (แอดมินบัญชีเห็นก่อน):**

| KPI | ข้อมูล |
|-----|--------|
| ยอดหนี้ค้างชำระรวม | SUM(current_debt) ทุก distributor |
| ยอดเกินกำหนด (Overdue) | บิลที่เลย due_date + จำนวนบิล |
| รอชำระ (ยังไม่เกินกำหนด) | บิลที่ยังไม่ถึงกำหนด |
| ระงับเครดิต (Credit Hold) | จำนวนร้านที่ถูก hold |
| อัตราเก็บหนี้ % | paid / (paid + overdue + awaiting) |

**Row 2 — รายได้:**

| KPI | ข้อมูล |
|-----|--------|
| รายได้วันนี้ | ยอด order paid/shipped/completed วันนี้ |
| รายได้เดือนนี้ + MoM% | ยอดเดือน + badge % เปลี่ยนแปลง |
| รายได้รวมทั้งปี | ยอดสะสม YTD |
| เก็บเงินได้เดือนนี้ | actual collected (_inv_paid_amount) |
| ยอดสั่งเฉลี่ย (AOV) | revenue_month / orders_month |

### 2. Debt Aging + ตัวแทนหนี้สูงสุด
- Debt Aging Bar Chart — 4 buckets: 1-7, 8-30, 31-60, 60+ วัน
- Top 15 Debt Table — ชื่อร้าน, Rank, ยอดหนี้, วงเงิน (%), สถานะ

### 3. Revenue Trend + การชำระล่าสุด
- Revenue Trend Area Chart — 6 เดือนย้อนหลัง
- Recent Payments Table — 10 รายการ

### 4. ตัวแทนเงียบ (Churn Warning)
- ตาราง distributor ที่ไม่สั่งเกิน 30 วัน
- แสดงวันที่สั่งล่าสุด + จำนวนวันห่าง

### 5. Order Pipeline + Rank Revenue
- Pipeline 12 สถานะครบ
- Rank Revenue Donut — Standard/Silver/Gold/Platinum/Diamond

### 6. รายได้ตัวแทนจำหน่าย (Full Width)
- ร้าน, จังหวัด, Rank, ยอดเดือนนี้, ยอดสะสมปี, หนี้ค้าง, สถานะ + search

### 7. แผนที่เครือข่ายตัวแทน (SVG Map)
- SVG map ไทย 77 จังหวัดจริง (`thailand-provinces.svg`)
- Region Tabs — zoom ดูแยกภาค + ทั้งประเทศ
- Markers — วงกลมเขียว = DINOCO, สี่เหลี่ยมน้ำเงิน = BigWing
- Tooltip hover — ชื่อจังหวัด, ตัวแทน, BigWing, ศักยภาพ BigBike
- Stats Panel — สรุปภาค (ตัวแทน, coverage, รายได้)
- Fullscreen — กดปุ่มขยายเต็มจอ

### 8. คำแนะนำ AI + Province Coverage
- Province recs ใช้ข้อมูลจริง (MTD, จำนวนตัวแทน, เกณฑ์ 20K ขั้นต่ำ)
- 7 ระดับ: critical, underperform, warning, expand, opportunity, star, future
- Province grid — 77 จังหวัด สีเขียว/แดง ตาม coverage

### 9. AI วิเคราะห์ความเสี่ยง & โอกาส
- Claude Sonnet 4 ผ่าน DINOCO_AI class
- **ไม่โหลดอัตโนมัติ** — ใช้ cache + กดปุ่มวิเคราะห์เอง (ประหยัด token)
- Cache 1 ชั่วโมง

#### AI Output (6 sections):

| Section | แสดงอะไร |
|---------|----------|
| Overview | Score 0-100 + สถานะ |
| Expansion | จังหวัดควรขยาย + BigWing note |
| Risks | ตัวแทนเสี่ยง + severity + action |
| Strategy | กลยุทธ์ short/long-term + ROI |
| Competitors | เปรียบเทียบ SRC, F2MOTO, BMMOTO, MOTOSkill, H2C |
| Brand Sentiment | อันดับ 6 แบรนด์จากเสียงลูกค้า |

---

## Honda BigWing Data

22 สาขา ใน 18 จังหวัด (อ้างอิง: thaihonda.co.th/hondabigbike/distributors, อัพเดท 2026-03-28)

| ภาค | สาขา |
|-----|------|
| กรุงเทพฯ | พระราม 3, ธนบุรี, รามอินทรา, ราชพฤกษ์ (4 สาขา) |
| เหนือ | เชียงใหม่, เชียงราย, นครสวรรค์, พิษณุโลก |
| อีสาน | ขอนแก่น, โคราช, อุดรธานี, อุบลฯ, บุรีรัมย์ |
| กลาง | ลพบุรี, อยุธยา |
| ตะวันออก | พัทยา (ชลบุรี), ระยอง |
| ตะวันตก | กาญจนบุรี, หัวหิน (เพชรบุรี) |
| ใต้ | ภูเก็ต, หาดใหญ่ (สงขลา), สุราษฎร์ธานี |

---

## เกณฑ์ธุรกิจ

| เกณฑ์ | ค่า | ใช้ที่ไหน |
|-------|-----|----------|
| ยอดสั่งขั้นต่ำ/เดือน | 20,000 ฿ | Province recs — ต่ำกว่า = flag |
| สินค้าเริ่มต้น | กล่องหลัง 5,300 ฿ / กันล้ม 7,900 ฿ | ~3-4 ชิ้น/เดือนขั้นต่ำ |

---

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|------|--------|
| `[Admin System] DINOCO Admin Finance Dashboard` (DB_ID: 1158) | Snippet หลัก |
| `[Admin System] DINOCO Admin Dashboard` (DB_ID: 21) | Parent — tab "การเงิน" |
| `[Admin System] AI Provider Abstraction` (DB_ID: 1040) | Claude/Gemini API wrapper |
| `thailand-provinces.svg` | SVG แผนที่ 77 จังหวัด (ต้องอัพโหลดไป server) |
| `[Admin System] DINOCO Brand Voice Pool` (DB_ID: 1159) | Brand Voice — เสียงลูกค้า |

---

## Backlog

### Priority สูง
- Bookmarklet สำหรับเก็บเสียงลูกค้าจริงจาก Facebook
- เชื่อม Finance AI กับ Brand Voice data จริง
- ลบ test_ai endpoint (debug เสร็จแล้ว)

### Priority กลาง
- Product analytics (SKU/สินค้าขายดี)
- Cash flow forecast
- Export CSV/PDF
- Date range filter

### Priority ต่ำ
- Profit margin (ต้องเพิ่ม cost_price)
- Rank history tracking
- Auto-refresh
- Browser Extension (แทน Bookmarklet ถ้าไม่พอ)
