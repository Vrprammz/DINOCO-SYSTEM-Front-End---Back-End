# 31 — KPI Baseline Tools (Boss-runnable, 30 min/day × 7 days)

**Status**: Boss directive 2026-05-09 = "บอสเอง" → ทีมเตรียมเครื่องมือให้บอสรันเอง.

**Why baseline first**: ก่อน flip flag F1 (เปิดระบบ S/N ทุกดีลเลอร์) ต้อง snapshot ค่าปัจจุบันของ 5 KPIs × 7 วัน เพื่อวัดผลกระทบหลัง launch. ถ้าไม่มี baseline จะไม่รู้ว่าระบบใหม่ดีขึ้น/แย่ลงหรือไม่.

**Time investment**: 30 นาที/วัน × 7 วัน = ~3.5 ชั่วโมงรวม

---

## Daily Workflow (ทำซ้ำ 7 วัน)

### Day 1-7 — เวลา 09:00 ของแต่ละวัน

```bash
# 1. SSH เข้า production (ทุกครั้ง)
ssh dinoco@<production-host>
cd /var/www/dinoco.in.th

# 2. รัน 5 SQL queries (ใช้เวลา ~5 นาที)
# รัน 1 ครั้งต่อวัน — ระบบ output JSON พร้อม copy ไป Google Sheets
wp eval-file scripts/sn-system/kpi-baseline-snapshot.php

# 3. Output ตัวอย่าง:
# {
#   "date": "2026-05-09",
#   "activate_within_30d_pct": 87.3,
#   "claim_within_30d_pct": 2.1,
#   "transfer_within_30d_pct": 1.8,
#   "lookup_p95_ms": 145,
#   "activation_p95_ms": 1420
# }

# 4. Copy output JSON → paste ลง Google Sheets template (link ด้านล่าง)
```

---

## เครื่องมือ #1 — `scripts/sn-system/kpi-baseline-snapshot.php`

**Status**: ทีมจะเขียนให้ในรอบ commit ถัดไป (Q21+ ก็ deferred ตอนนี้). For now, manual SQL queries.

### Manual SQL queries (ในระหว่างที่รอ script — ใช้ wp db cli):

```sql
-- KPI 1: activate_within_30d_pct
-- = (จำนวน plates ที่ activate ภายใน 30 วันจาก register / total registers ในช่วง) × 100
SELECT
  COUNT(CASE WHEN registered_at IS NOT NULL AND registered_at <= DATE_ADD(created_at, INTERVAL 30 DAY) THEN 1 END) * 100.0 /
  NULLIF(COUNT(*), 0) AS activate_within_30d_pct
FROM wp_dinoco_sn_pool
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY);

-- KPI 2: claim_within_30d_pct
SELECT
  COUNT(CASE WHEN status = 'claimed' THEN 1 END) * 100.0 /
  NULLIF(COUNT(*), 0) AS claim_within_30d_pct
FROM wp_dinoco_sn_pool
WHERE registered_at >= DATE_SUB(NOW(), INTERVAL 30 DAY);

-- KPI 3: transfer_within_30d_pct
SELECT
  COUNT(CASE WHEN status = 'transferred' THEN 1 END) * 100.0 /
  NULLIF(COUNT(*), 0) AS transfer_within_30d_pct
FROM wp_dinoco_sn_pool
WHERE registered_at >= DATE_SUB(NOW(), INTERVAL 30 DAY);

-- KPI 4: lookup_p95_ms (ใช้ Sentry หรือ APM dashboard ถ้ามี)
-- ถ้าไม่มี: ใช้ wp_dinoco_sn_audit timing column
SELECT
  AVG(elapsed_ms) AS lookup_avg_ms,
  MAX(elapsed_ms) AS lookup_max_ms
FROM wp_dinoco_sn_audit
WHERE event_type = 'lookup' AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY);

-- KPI 5: activation_p95_ms
SELECT
  AVG(elapsed_ms) AS activation_avg_ms,
  MAX(elapsed_ms) AS activation_max_ms
FROM wp_dinoco_sn_audit
WHERE event_type = 'activate' AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY);
```

---

## เครื่องมือ #2 — Google Sheets Template

**สร้าง 1 sheet ใหม่ + paste header นี้ใน row 1**:

| Date | activate_within_30d_pct | claim_within_30d_pct | transfer_within_30d_pct | lookup_p95_ms | activation_p95_ms | Notes |
|---|---|---|---|---|---|---|
| 2026-05-09 | (paste) | (paste) | (paste) | (paste) | (paste) | (optional) |

**Day 8** (หลังครบ 7 วัน):
- คำนวณ AVG ของ 7 วัน → ลงใน wp_options:
  ```bash
  wp option update dinoco_sn_kpi_baseline_t0 \
    '{"activate_within_30d_pct":86.5,"claim_within_30d_pct":2.3,"transfer_within_30d_pct":1.9,"lookup_p95_ms":150,"activation_p95_ms":1450,"measured_at":"2026-05-15"}'
  ```

---

## Targets (จาก plan v2.13 — ใช้เปรียบเทียบหลัง launch)

| KPI | Baseline target | After launch target |
|---|---|---|
| activate_within_30d_pct | ≥ 60% (ดีลเลอร์ส่งของถูกที่) | ≥ 85% (Phase 2 จบ) |
| claim_within_30d_pct | ≤ 5% | ≤ 3% (Phase 3 จบ — anti-fraud kicks in) |
| transfer_within_30d_pct | ≤ 3% | ≤ 2% |
| lookup_p95_ms | < 300ms | < 200ms |
| activation_p95_ms | < 2500ms | < 1500ms |

ถ้า baseline ออกมาดีกว่า target → adjust target ขึ้น (ระบบเดิมเก่งกว่าคิด).

---

## Decision matrix หลังครบ 7 วัน

| Scenario | Action |
|---|---|
| ทุก KPI ผ่าน baseline target | ✅ Flip flag F1 ON ได้เลย |
| 1 KPI ต่ำกว่า baseline | 🟡 Investigate root cause — fix ก่อน flip |
| 2+ KPI ต่ำกว่า baseline | 🔴 STOP — re-plan + boss decision |
| ทุก KPI ดีอยู่แล้ว เกิน target | 🟢 Flip + monitor — ปรับ target เพิ่มภายหลัง |

---

## Common issues + workaround

### "ฉันไม่เห็น wp_dinoco_sn_audit table"
ระบบ S/N ยังไม่ deploy → table ยังไม่ถูกสร้าง. ใช้ proxy queries จาก B2B order data + warranty registration CPT แทน:

```sql
-- Proxy KPI 1: B2B order → ลูกค้าลงทะเบียน warranty ภายใน 30 วัน
SELECT
  COUNT(DISTINCT wr.ID) * 100.0 / NULLIF(COUNT(DISTINCT o.ID), 0) AS proxy_activate_pct
FROM wp_posts o
LEFT JOIN wp_posts wr
  ON wr.post_type = 'warranty_registration'
  AND wr.post_date BETWEEN o.post_date AND DATE_ADD(o.post_date, INTERVAL 30 DAY)
WHERE o.post_type = 'b2b_order'
  AND o.post_date >= DATE_SUB(NOW(), INTERVAL 30 DAY);
```

### "SQL ช้ามาก (timeout)"
ขนาด table ใหญ่ → ใส่ index ก่อนรัน:
```sql
ALTER TABLE wp_dinoco_sn_pool ADD INDEX idx_kpi_created_status (created_at, status);
```

---

## Output → boss share with team

หลังครบ 7 วัน:
1. Screenshot Google Sheet → ส่งใน LINE ทีม
2. Update `13-kpi-baseline-measurement-plan.md` — fill in actual values
3. Decision (จาก decision matrix ข้างบน) → boss approves flip flag F1

---

_Drafted 2026-05-09 per boss directive "บอสเอง"._
_File: docs/sn-system/31-kpi-baseline-tools-for-boss.md_
