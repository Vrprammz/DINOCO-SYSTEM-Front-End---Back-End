# 📉 F#16 Demand Forecast Fallback Design (< 3 mo data)

**Version**: 1.0 (2026-05-07)
**Plan**: v2.13 Phase 4 W13
**Boss**: Q22 R2 confirmed F#16 Demand Forecast in scope (NOT deferred unlike F#15)

---

## 🎯 Problem

F#16 Demand Forecast ใช้ moving-average + seasonal decomposition จาก S/N activation history. แต่ Phase 4 W13 deploys ที่ Week 13 — ตอนนั้น S/N system อายุยังแค่ ~3 เดือน (Phase 1 เริ่ม Week 1).

**Forecast accuracy with < 3 mo of data**: poor (no seasonality detected, high variance).

ต้องมี **graceful degradation** — ใช้ proxy data sources จนกว่า S/N data จะพอ.

---

## 🔄 3-Tier Fallback Strategy

### Tier 1 — S/N native (ideal, T+12 mo)
**Source**: `wp_dinoco_sn_pool.created_at` for plate inflow + `wp_dinoco_sn_pool.activated_at` for outflow
**Method**: 12-month moving average + Holt-Winters seasonal decomposition
**Confidence**: HIGH

### Tier 2 — Hybrid (T+3-12 mo)
**Source**: S/N data (if ≥ 3 mo) + B2F PO history (long-running) + Inventory transactions
**Method**: ใช้ B2F PO `po_total` + delivery dates เป็น proxy demand baseline; layer S/N on top เป็น calibration
**Confidence**: MEDIUM

### Tier 3 — Pre-S/N proxy (Phase 4 W13 launch, T+0-3 mo)
**Source**:
- `wp_b2f_orders` PO history (existing 2+ years data)
- `wp_dinoco_stock_transactions` outbound rows (b2b_shipped + manual_subtract)
- B2C `wp_b2b_orders` confirmed_at + items_count

**Method**:
1. Aggregate weekly outbound qty per top-set SKU from `dinoco_stock_transactions`
2. Compute 12-week moving average
3. Apply seasonal multiplier from prior years (Mar-Oct higher in motorcycle season)
4. Project forward 12 weeks

**Confidence**: LOW-MEDIUM (proxy assumes outbound = future demand, ignores stockout effects)

---

## 🧮 Auto-tier selection logic

```php
function dinoco_sn_forecast_select_tier(): string {
    $sn_history_months = (int) get_option('dinoco_sn_data_months_count', 0);
    if ($sn_history_months >= 12) return 'tier_1_native';
    if ($sn_history_months >= 3)  return 'tier_2_hybrid';
    return 'tier_3_proxy';
}
```

UI displays tier + confidence label:
- **Tier 1**: 🟢 "พยากรณ์จากข้อมูลตรง" (high confidence)
- **Tier 2**: 🟡 "พยากรณ์ผสมข้อมูล PO + S/N" (medium)
- **Tier 3**: 🟠 "พยากรณ์จากข้อมูล PO เก่า — เป็นค่าประมาณ" (low — proxy)

---

## 📊 Fallback signals + UX

### When Tier 3 active
- Forecast widget แสดง warning banner: "ข้อมูล S/N ยังไม่พอ — ใช้ข้อมูล PO โรงงานประมาณการ"
- Confidence interval kept WIDE (±50% vs ±15% Tier 1)
- "Trust this forecast?" prompt ให้ user override input หากแม่นยำกว่า

### When Tier 2 active
- Show breakdown: "Based on 4 months S/N + 24 months PO history"
- Confidence interval medium (±25%)

### When Tier 1 active
- Standard forecast UI — no extra warnings
- Backtested MAPE displayed (Mean Absolute Percentage Error from cross-validation)

---

## 🔍 Validation methodology

ทุกเดือนเริ่มต้น Phase 4+:
1. Compute forecast last month using current tier
2. Compare against actual demand observed
3. Compute MAPE
4. Log to `wp_dinoco_sn_forecast_history` (NEW table)

If MAPE > 30% three months in a row → **flag forecast disabled** + alert tech lead.

---

## 🛡️ Manual override

Admin can override per-SKU forecast in Manager UI:
- Field: `manual_forecast_override` (qty/week)
- Set TTL: 30 days then auto-revert to algorithmic
- Audit logged

ใช้สำหรับ:
- Promotional campaigns (จะมี spike)
- New product launches (ไม่มี history)
- Discontinued products (forecast = 0)

---

## 📅 Tier transition timeline

| T (relative to F1 flip) | S/N data months | Tier active |
|---|---|---|
| T+0 to T+3 mo | 0-3 | **Tier 3 — Proxy** |
| T+3 to T+12 mo | 3-12 | **Tier 2 — Hybrid** |
| T+12 mo+ | 12+ | **Tier 1 — Native** |

Transition automatic via `dinoco_sn_forecast_select_tier()` cron daily check.

---

## ✅ Acceptance Criteria

- [ ] Tier selection logic deployed + unit tested
- [ ] UI displays tier badge + confidence interval
- [ ] Tier 3 proxy uses B2F + Inventory data when available
- [ ] MAPE tracking for self-validation
- [ ] Manual override flow + audit
- [ ] Telegram alert if MAPE > 30% × 3 months

---

## 📚 Related

- `docs/sn-system/22-phase5-w15-w18-prep.md` — F#16 base spec
- `tests/helpers/SnForecastTest.php` — existing forecast logic tests
- `tests/helpers/SnDemandForecastTest.php` — demand forecast specifics

---

**Sign-off**:
- [ ] Tech Lead — tier selection algorithm reviewed
- [ ] บอส — accept Tier 3 proxy approach during cold-start
- [ ] Inventory team — manual override permissions confirmed
