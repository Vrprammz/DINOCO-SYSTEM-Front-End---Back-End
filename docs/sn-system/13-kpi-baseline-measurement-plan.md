# 📊 KPI Baseline Measurement Plan — Pre-Flip-ON Snapshot

**Version**: 1.0 (2026-05-07)
**Plan**: v2.13 Phase 2 W7 prerequisite
**Owner**: Tech Lead + บอส (boss) — defines success metrics for S/N rollout

---

## 🎯 Goal

ก่อน flip F1 master flag (`dinoco_sn_system_enabled=1`) เราต้อง snapshot KPIs **5 ตัว** เพื่อ:

1. มี baseline สำหรับเทียบ T+30/60/180 days post-flip
2. ตรวจสอบว่า S/N system ส่งผลบวก (positive lift) หรือไม่
3. ตัดสินใจ rollback / iterate / scale ตาม data

---

## 📐 5 KPIs

### KPI 1 — Repurchase Rate
**Definition**: % of customers who place 2nd+ order within 90 days of first order.
**Why**: F#1 Expiry Reminder + F#4 Anniversary CTA หวังว่าจะดันตัวเลขนี้ขึ้น
**Target lift**: +10% absolute by T+180

**Measurement**:
```sql
-- T-0 baseline (run in SQL Workbench)
SELECT
  ROUND(100 * SUM(CASE WHEN second_order_within_90d THEN 1 ELSE 0 END) / COUNT(*), 2) AS repurchase_rate_pct
FROM (
  SELECT
    p1.user_id,
    EXISTS(
      SELECT 1 FROM wp_b2b_orders p2
      WHERE p2.user_id = p1.user_id
      AND p2.created_at > p1.created_at
      AND p2.created_at <= DATE_ADD(p1.created_at, INTERVAL 90 DAY)
    ) AS second_order_within_90d
  FROM (
    SELECT user_id, MIN(created_at) AS created_at
    FROM wp_b2b_orders
    WHERE created_at < CURDATE() - INTERVAL 90 DAY
    GROUP BY user_id
  ) p1
) sub;
```

### KPI 2 — Claim Rate
**Definition**: # claims opened / # active warranties × 100, measured per quarter.
**Why**: Anti-fraud + plate verification should reduce false claims; F#3 auto-fill should increase legitimate claim ease.
**Target lift**: -5% false-claim share, +15% legitimate-claim ease (NPS proxy)

**Measurement**:
```sql
SELECT
  ROUND(100 * COUNT(DISTINCT ct.ID) / NULLIF((SELECT COUNT(*) FROM wp_posts WHERE post_type='warranty_registration'), 0), 2) AS claim_rate_pct
FROM wp_posts ct
WHERE ct.post_type = 'claim_ticket'
AND ct.post_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY);
```

### KPI 3 — Activation Rate
**Definition**: % of plates received at warehouse that get activated by customer within 30 days.
**Why**: Post-S/N system, this is THE adoption metric. Direct proxy for "customer onboarding works".
**Target**: ≥ 75% activation within 30 days post-shipment

**Measurement**:
```sql
SELECT
  ROUND(100 * SUM(CASE WHEN sp.status='registered' THEN 1 ELSE 0 END) / COUNT(*), 2) AS activation_rate_30d_pct
FROM wp_dinoco_sn_pool sp
WHERE sp.status IN ('in_pool', 'registered')
AND sp.created_at <= DATE_SUB(CURDATE(), INTERVAL 30 DAY);
```

### KPI 4 — Cross-sell Conversion
**Definition**: # warranty extensions purchased / # eligible plates × 100.
**Why**: F#8 Marketplace Phase 4 W12 — direct revenue lever.
**Target**: ≥ 8% conversion in first 90 days post Phase 5 launch

**Measurement** (Phase 5+):
```sql
SELECT
  ROUND(100 * COUNT(DISTINCT we.sn) / NULLIF(COUNT(DISTINCT sp.sn), 0), 2) AS extension_conv_pct
FROM wp_dinoco_sn_pool sp
LEFT JOIN wp_dinoco_warranty_extensions we ON we.sn = sp.sn
WHERE sp.status = 'registered'
AND sp.warranty_until > CURDATE();
```

### KPI 5 — NPS (Net Promoter Score)
**Definition**: Standard NPS via F#10 Review Request post-claim resolution.
**Why**: ultimate "is the system loved?" metric.
**Target**: ≥ 40 (industry benchmark: 30 = good, 50 = excellent)

**Measurement**:
- T-0 = NPS averaged over manual surveys conducted last 6 months
- T+30/60/180 = via F#10 automated review request flow
```sql
SELECT
  AVG(score) AS avg_score,
  ROUND(100 * SUM(CASE WHEN score >= 9 THEN 1 ELSE 0 END) / COUNT(*) -
        100 * SUM(CASE WHEN score <= 6 THEN 1 ELSE 0 END) / COUNT(*), 1) AS nps
FROM wp_dinoco_review_requests
WHERE submitted_at IS NOT NULL
AND submitted_at >= DATE_SUB(CURDATE(), INTERVAL 90 DAY);
```

---

## 📅 Cadence

| Time | Action |
|---|---|
| **T-7d** (1 wk before flip) | Run baseline SQL on production read-replica → save snapshot to `docs/sn-system/kpi-snapshots/2026-05-baseline.csv` |
| **T-0** (flip day) | Re-run baseline 1 hr before flip → confirm no major drift since T-7d |
| **T+30d** | Snapshot 1 — early adopter signal |
| **T+60d** | Snapshot 2 — broader cohort |
| **T+180d** | Snapshot 3 — full adoption assessment |

---

## ⚠️ Confounders (out of scope but document)

- Seasonal lift (holidays, motorcycle season Mar-Oct)
- Marketing campaigns running in parallel (controlled by F#4 Anniversary cron)
- Competitor pricing changes
- Major news events / accidents in moto community

ใช้ `month_of_year` dummy variables ใน regression analysis เพื่อ control.

---

## ✅ Success Criteria for "Continue Investment"

ที่ T+180d:
- [ ] **Repurchase rate** ≥ baseline + 5%
- [ ] **Claim rate** within ± 10% of baseline (no spike from S/N adoption friction)
- [ ] **Activation rate** ≥ 65% (target 75%, 65% acceptable for Year 1)
- [ ] **Cross-sell** ≥ 5% (Phase 5 dependent)
- [ ] **NPS** ≥ 35

ถ้าหนึ่งใน 5 ไม่ผ่าน → trigger root-cause review + พิจารณา iterate vs rollback flag-by-flag.

---

## 📚 Related

- `docs/sn-system/10-go-live-gate-checklist.md` — F1-F5 flag flip criteria
- `docs/sn-system/12-phase2-w7-deploy-runbook.md` — atomic deploy
- `.second-brain/log.md` — should reference T-0 snapshot ID

---

**Sign-off**:
- [ ] Tech Lead — KPI definitions reviewed
- [ ] บอส — target thresholds approved
- [ ] Data team / Telegram bot operator — snapshot automation prepared
