# [Admin System] DINOCO Admin Finance Dashboard

**Shortcode:** `[dinoco_admin_finance]`
**DB_ID:** 1158
**Version:** V.3.6
**วันที่สร้าง:** 2026-03-28

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
| V.3.0 | `31abbf9` | Rewrite UI — ลดขนาด KPI, เรียงลำดับหนี้ก่อนรายได้, แผนที่ SVG ใหม่, AI return JSON, Honda BigWing context |
| V.3.2 | `42f879a` | เปลี่ยนเป็น Leaflet map จริง + AI tips กระจายทั่วหน้า |
| V.3.3 | `f6fa1a1` | AI prompt rewrite เป็น "ที่ปรึกษาบริหารธุรกิจอาวุโส", BigWing 22 สาขา 18 จังหวัดจริง, เพิ่ม quick_wins/score/key_metrics |
| V.3.4 | `7607259` | แก้ bug 4 ตัว (B4/B8/B10/B11) + Quick Wins 5 ตัว (Collection Rate, MoM%, AOV, Churn Warning, BigWing Coverage) |
| V.3.5 | `81f8a9d` | เปลี่ยนจาก Leaflet เป็น SVG map ไทย 77 จังหวัดจริง (จาก GeoJSON) + interactive tooltip + markers |
| V.3.6 | `0239487` | เพิ่ม region tabs zoom ดูแยกภาค + stats panel ข้างแผนที่ |

---

## โครงสร้างหน้า (เรียงตามลำดับ)

### 1. KPI Cards (10 กล่อง)

**Row 1 — หนี้ (แอดมินบัญชีเห็นก่อน):**
| KPI | ข้อมูล | สี |
|-----|--------|-----|
| ยอดหนี้ค้างชำระรวม | SUM(current_debt) ทุก distributor | แดง |
| ยอดเกินกำหนด (Overdue) | บิลที่เลย due_date + จำนวนบิล | ส้ม |
| รอชำระ (ยังไม่เกินกำหนด) | บิลที่ยังไม่ถึงกำหนด | น้ำเงิน |
| ระงับเครดิต (Credit Hold) | จำนวนร้านที่ถูก hold | แดง |
| อัตราเก็บหนี้ % | paid / (paid + overdue + awaiting) | เขียว |

**Row 2 — รายได้:**
| KPI | ข้อมูล | สี |
|-----|--------|-----|
| รายได้วันนี้ | ยอด order paid/shipped/completed วันนี้ | เขียว |
| รายได้เดือนนี้ + MoM% | ยอดเดือน + badge % เปลี่ยนแปลง | น้ำเงิน |
| รายได้รวมทั้งปี | ยอดสะสม YTD | ม่วง |
| เก็บเงินได้เดือนนี้ | actual collected (_inv_paid_amount) | ฟ้า |
| ยอดสั่งเฉลี่ย (AOV) | revenue_month / orders_month | น้ำเงิน |

### 2. Debt Aging + ตัวแทนหนี้สูงสุด
- **Debt Aging Bar Chart** — 4 buckets: 1-7, 8-30, 31-60, 60+ วัน
- **Top 15 Debt Table** — ชื่อร้าน, Rank, ยอดหนี้, วงเงิน (%), สถานะ HOLD/ปกติ

### 3. Revenue Trend + การชำระล่าสุด
- **Revenue Trend Area Chart** — 6 เดือนย้อนหลัง
- **Recent Payments Table** — เลขบิล, ร้าน, จำนวน, วันที่ (10 รายการ)

### 4. ตัวแทนเงียบ (Churn Warning)
- ตาราง distributor ที่ไม่สั่งเกิน 30 วัน
- แสดงวันที่สั่งล่าสุด + จำนวนวันห่าง
- ซ่อนถ้าไม่มี

### 5. Order Pipeline + Rank Revenue
- **Pipeline** — 12 สถานะครบ (draft, checking_stock, awaiting_confirm, awaiting_payment, paid, packed, shipped, completed, cancelled, backorder, claim_opened, claim_resolved)
- **Rank Revenue Donut** — ยอดขาย MTD แยก Standard/Silver/Gold/Platinum/Diamond

### 6. รายได้ตัวแทนจำหน่าย (Full Width Table)
- ร้าน, จังหวัด, Rank, ยอดเดือนนี้, ยอดสะสมปี, หนี้ค้าง, สถานะ
- มี search filter

### 7. แผนที่เครือข่ายตัวแทน (SVG Map)
- **SVG map ไทย 77 จังหวัด** (สร้างจาก GeoJSON จริง — `thailand-provinces.svg`)
- สีตามภาค: เหนือ=เขียว, อีสาน=เหลือง, กลาง=แดง, ตะวันออก=น้ำเงิน, ตะวันตก=ม่วง, ใต้=เขียวมิ้นท์
- **Region Tabs** — กด zoom ดูแยกภาค + กลับดูทั้งประเทศ
- **Markers** — วงกลมเขียว = DINOCO, สี่เหลี่ยมน้ำเงิน = BigWing
- **Tooltip hover** — ชื่อจังหวัด, ภาค, ตัวแทน DINOCO (ชื่อ+rank), Honda BigWing
- **Stats Panel ขวา** — สรุปภาค (ตัวแทน, coverage, รายได้) + รายชื่อตัวแทน/BigWing
- จังหวัดที่ไม่มีตัวแทน → opacity จางลง

### 8. Province Coverage Grid
- Region tabs filter (ทั้งหมด + 6 ภาค)
- Grid แสดง 77 จังหวัด — สีเขียว = มีตัวแทน, สีแดง = ไม่มี

### 9. AI วิเคราะห์ความเสี่ยง & โอกาส
- ใช้ **Claude Sonnet 4** ผ่าน `DINOCO_AI::chat()`
- Cache 1 ชั่วโมง (transient)
- ปุ่ม "วิเคราะห์ใหม่" bypass cache
- **AI Tips** กระจายไป 4 จุด: debt, revenue, distributor, map

#### AI Output (JSON format):
| Section | แสดงอะไร |
|---------|----------|
| **Overview** | Score 0-100 + สถานะ (ดี/ปานกลาง/ต้องปรับปรุง) + Key Metrics 3 ช่อง |
| **Quick Wins** | สิ่งที่ทำได้ทันที + ผลที่คาด |
| **Expansion** | จังหวัดควรขยาย + BigWing note + priority + estimated potential |
| **Risks** | ตัวแทนเสี่ยง + severity + action + timeline |
| **Strategy** | กลยุทธ์ short/long-term + impact + estimated ROI |

---

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|------|--------|
| `[Admin System] DINOCO Admin Finance Dashboard` (DB_ID: 1158) | Snippet หลัก — PHP backend + HTML/CSS/JS |
| `[Admin System] DINOCO Admin Dashboard` (DB_ID: 21) | Parent dashboard — เพิ่ม tab "การเงิน" |
| `[Admin System] AI Provider Abstraction` (DB_ID: 1040) | Claude API wrapper (DINOCO_AI class) |
| `thailand-provinces.svg` | SVG แผนที่ไทย 77 จังหวัด (ต้องอัพโหลดไปที่ server) |

---

## ข้อมูลที่ต้องมีใน WordPress

### Constants (wp-config.php)
```
DINOCO_CLAUDE_KEY — Anthropic API key สำหรับ AI analysis
DINOCO_AI_PROVIDER — 'claude' (หรือ 'gemini')
```

### SVG Map File
ไฟล์ `thailand-provinces.svg` ต้องอัพโหลดไปที่ server ตำแหน่งใดตำแหน่งหนึ่ง:
1. `{ABSPATH}/thailand-provinces.svg` (root WordPress)
2. `wp-content/uploads/dinoco/thailand-provinces.svg`
3. `wp-content/thailand-provinces.svg`
4. Theme directory

### Snippets ที่ต้อง Active
- `[Admin System] AI Provider Abstraction` (DB_ID: 1040) — สำหรับ AI analysis
- `[Admin System] DINOCO Admin Finance Dashboard` (DB_ID: 1158) — ตัวนี้

---

## Honda BigWing Data

22 สาขา ใน 18 จังหวัด (อ้างอิง: thaihonda.co.th/hondabigbike/distributors)

| ภาค | สาขา |
|-----|------|
| กรุงเทพฯ | พระราม 3, ธนบุรี, รามอินทรา, ราชพฤกษ์ (4 สาขา) |
| เหนือ | เชียงใหม่, เชียงราย, นครสวรรค์, พิษณุโลก |
| อีสาน | ขอนแก่น, โคราช, อุดรธานี, อุบลราชธานี, บุรีรัมย์ |
| กลาง | ลพบุรี, อยุธยา |
| ตะวันออก | พัทยา (ชลบุรี), ระยอง |
| ตะวันตก | กาญจนบุรี, หัวหิน (เพชรบุรี) |
| ใต้ | ภูเก็ต, หาดใหญ่ (สงขลา), สุราษฎร์ธานี |

Hardcoded ใน `dinoco_get_bigwing_data()` — อัพเดทเมื่อ BigWing เปิดสาขาใหม่

---

## AJAX Endpoints

ทั้ง 2 endpoints ใช้ POST to `admin-post.php` ผ่าน parameter `dinoco_finance_action`

### get_finance_summary
ข้อมูลการเงินทั้งหมด — KPI, กราฟ, ตาราง, แผนที่

| Field | ประเภท | ข้อมูล |
|-------|--------|--------|
| total_debt | float | SUM current_debt ทุก distributor |
| overdue_amount | float | ยอดเกินกำหนด |
| overdue_count | int | จำนวนบิลเกินกำหนด |
| awaiting_amount | float | ยอดรอชำระ |
| credit_hold_count | int | จำนวนร้าน credit hold |
| collection_rate | float | อัตราเก็บหนี้ % |
| revenue_today | float | รายได้วันนี้ |
| revenue_month | float | รายได้เดือนนี้ |
| revenue_year | float | รายได้ปีนี้ |
| orders_month | int | จำนวนออเดอร์เดือนนี้ |
| paid_month | float | เก็บเงินจริงเดือนนี้ |
| mom_growth | float | % เปลี่ยนแปลง MoM |
| avg_order_value | float | ยอดสั่งเฉลี่ย |
| overdue_aging | object | Debt aging 4 buckets |
| monthly_trend | array | Revenue 6 เดือน |
| pipeline | object | Order status counts (12 statuses) |
| dist_debts | array | Top 15 หนี้สูงสุด |
| dist_revenue | array | รายได้ตัวแทนทั้งหมด |
| recent_payments | array | 10 การชำระล่าสุด |
| rank_revenue | object | ยอดขาย MTD ต่อ rank |
| churn_warning | array | ตัวแทนไม่สั่งเกิน 30 วัน |
| province_map | object | จังหวัด -> จำนวนตัวแทน |
| region_summary | object | สรุป 6 ภาค |
| svg_map | string | SVG content ของแผนที่ไทย |
| dist_locations | array | ตัวแทน + จังหวัด (สำหรับ map) |
| bigwing_locations | array | BigWing + จังหวัด (สำหรับ map) |
| bigwing_total | int | จำนวนจังหวัดที่มี BigWing (18) |
| bigwing_covered | int | จังหวัด BigWing ที่มี DINOCO |

### get_ai_analysis
AI วิเคราะห์ — ใช้ DINOCO_AI class เรียก Claude Sonnet 4

| Parameter | ค่า |
|-----------|-----|
| force | '1' = bypass cache, '0' = ใช้ cache |
| Response | `ai_json` (parsed JSON) หรือ `ai_raw` (fallback text) |
| Cache | transient 1 ชั่วโมง |

---

## Bug Fixes ที่ทำแล้ว (V.3.4)

| Bug | ปัญหา | แก้ไข |
|-----|-------|-------|
| B4 | Pipeline 12 WP_Query แยก | เปลี่ยนเป็น 1 SQL query (GROUP BY) |
| B8 | Province coords ขาด ~25 จังหวัด | เพิ่มครบ 77 จังหวัด (ลบออกแล้วเมื่อเปลี่ยนเป็น SVG) |
| B10 | Strategy card เลขซ้ำ 2 ชุด | ลบ strat-num div ซ้ำ |
| B11 | Pipeline ขาด 4 สถานะ | เพิ่ม checking_stock, backorder, claim_opened, claim_resolved |

---

## สิ่งที่ยังไม่ได้ทำ (Backlog)

### Priority สูง
- Nonce verification (CSRF protection) — ทั้ง 2 endpoints
- Revenue timing fix — ใช้ post_date ไม่ใช่วันชำระจริง

### Priority กลาง
- Product analytics (SKU/สินค้าขายดี)
- Cash flow forecast
- Export CSV/PDF
- Date range filter

### Priority ต่ำ
- Profit margin (ต้องเพิ่ม cost_price)
- Rank history tracking
- Auto-refresh
- Seasonal trend (YoY comparison)
