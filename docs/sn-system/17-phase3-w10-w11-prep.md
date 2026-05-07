# 📊 Phase 3 W10 + W11 — Customer LTV + Geographic + Stolen Registry

**Date**: 2026-05-07 (preparation)
**Plan**: v2.13 §Phase 3 W10 + W11
**Boss override**: Q21 cut F#12 Anti-Fraud — W10 reduces to F#9 LTV only

---

## 🎯 W10 — Customer LTV Dashboard (F#9) ~16h

### Status check (existing infrastructure)

**ALREADY DONE** (Phase 1 W2 + W7):
- ✅ Schema `wp_dinoco_sn_customer_ltv_snapshot` (Phase 1 W2 — 12 cols)
- ✅ Helper `dinoco_sn_get_user_ltv($user_id)` (V.0.18 Manager)
- ✅ Tier badge integration in Member Dashboard Header (W7 V.31.0)
- ✅ Tier color/emoji mapping (boss Q27 = B2B rank_system pattern)

**REMAINING W10 TASKS**:

### W10.1 — LTV Cron Snapshot Computation

**Cron**: `dinoco_sn_ltv_snapshot_cron` (daily 03:00)

**Logic**:
```php
function dinoco_sn_run_ltv_snapshot() {
    // Aggregate per user_id from wp_dinoco_sn_pool + B2B order history + walk-in invoices
    // Compute:
    //   plates_count = COUNT all plates owned (any status)
    //   active_warranties_count = COUNT status='registered'
    //   total_lifetime_spent = SUM B2B orders (paid) + walk-in invoices + extension purchases
    //   first_purchase_date = MIN registered_at
    //   last_purchase_date = MAX recent activity
    //   claim_count = COUNT plates with status='claimed' or 'replaced'
    //   loyalty_tier = bucket from total_spent:
    //     diamond ≥ ฿100,000
    //     platinum ≥ ฿50,000
    //     gold ≥ ฿20,000
    //     silver ≥ ฿5,000
    //     bronze < ฿5,000 (default)
    
    // INSERT ON DUPLICATE KEY UPDATE on wp_dinoco_sn_customer_ltv_snapshot
    // Heartbeat: dinoco_cron_sn_ltv_snapshot_last_run
}
```

**Tier helper** (already exists Phase 1 W3 V.0.4 Manager):
```php
function dinoco_sn_compute_loyalty_tier( $total_spent ) {
    if ( $total_spent >= 100000 ) return 'diamond';
    if ( $total_spent >= 50000 )  return 'platinum';
    if ( $total_spent >= 20000 )  return 'gold';
    if ( $total_spent >= 5000 )   return 'silver';
    return 'bronze';
}
```

### W10.2 — Tab 6 ลูกค้า VIP UI

Already partial done — Tab 6 exists in Manager V.0.20 with LTV drill-down. Need to verify:

- ✅ Tab 6 nav-item + panel
- ✅ List view (top customers + tier badges + stats)
- ✅ Drill-down detail modal (plates owned + order history + claim history + tier breakdown)
- ⏸️ CSV export `/dinoco-sn/v1/ltv/export` (Phase 3 W10 — deferred from current implementation)

### W10.3 — Customer Self-Service LTV View

**Member Dashboard tier badge** (W7 V.31.0): ✅ Done
**Member Dashboard "My Plates" stats card** (W7 V.31.0): ✅ Done

**REMAINING**: Tier benefits explanation modal:
- Tap tier badge → modal "เกี่ยวกับ {Tier} Status"
- Show benefits per tier (e.g. ส่วนลด 5% / ขนส่งฟรี / รางวัลครบรอบ)
- Defer to Phase 5 marketing decisions

### W10 Effort estimate

| Task | Effort | Status |
|---|---|---|
| LTV cron snapshot | 2h | ✅ Helper exists, cron registered |
| Tab 6 LTV UI | 6h | 🟡 Partial done (V.0.20) |
| CSV export endpoint | 2h | ⏸️ Phase 3 W10 |
| Tier benefits modal | 4h | ⏸️ Phase 5 marketing |
| Tests + drift | 2h | ⏸️ Phase 3 W10 |
| **Total remaining** | **~10h** | |

**Phase 3 W10 = mostly already done. Remaining = CSV export + tier benefits doc.**

---

## 🌍 W11 — Geographic Heatmap (F#13) + Stolen Registry (F#14) ~28h

### W11.1 — F#13 Geographic Heatmap

**Schema** (already exists Phase 1 W2):
- `wp_dinoco_sn_geo_activations` (12 cols including lat/lng/province/district/source)

**REMAINING TASKS**:

#### Data collection on activate (V.0.4 LIFF — extend)
```php
// In dinoco_sn_handler_activate
// After successful activation, capture geo data:
$ip = sanitize_text_field( $_SERVER['REMOTE_ADDR'] ?? '' );
$province = dinoco_sn_resolve_province_from_ip( $ip ); // existing IP geolocation
// LINE region from id_token (if available)
// Customer address from warranty_registration meta

INSERT INTO wp_dinoco_sn_geo_activations (
    sn, user_id, province, district, lat, lng, source, ...
);
```

#### Heatmap admin UI (Tab 8 Geo Map)

**Already exists** in Manager V.0.20 (Phase 3 W11 from earlier — `dinoco_sn_render_tab_geo`). Verify integration:
- ✅ Mapbox/Leaflet wrapper rendered
- ✅ Filter by time range + SKU
- ⏸️ Drill-down by province (sidebar with details)
- ⏸️ Gray market alerts (provinces with > N activations + no dealer)

#### Gray Market Detection Cron

```php
function dinoco_sn_run_gray_market_scan() {
    // Weekly Monday 09:00
    // For each province where activation count > 20/month:
    //   IF no DINOCO dealer in that province:
    //     IF foreign country (CN/LA/KH/MY) → flag gray_market_suspect
    //     IF Thai but no dealer → flag underserved_market
    //   Insert flag in wp_dinoco_sn_geo_activations
    // Generate weekly Flex report → boss
    // Heartbeat: dinoco_cron_sn_gray_market_scan_last_run
}
```

### W11.2 — F#14 Stolen Registry (admin-only per Q23)

**Already exists** (Phase 1 W2 + W8.4):
- ✅ Schema `wp_dinoco_sn_stolen_log` + ALTER pool +stolen_at +stolen_police_report
- ✅ Tab 9 Stolen admin UI
- ✅ LIFF Activation V.0.4 blocks stolen plate activate + Telegram alert (W8.4)
- ✅ Customer-side stolen report from Asset Card F#14 modal (W7 V.31.0)
- ✅ Q23 confirmed: admin-only verify endpoint (no public lookup)

**REMAINING**:

#### Public stolen verify (deferred per Q23)
- Boss said "Admin เท่านั้นก่อน — Public ไว้ทีหลัง"
- Code retained but flag-gated (similar to F#15 Q22 pattern)

#### Stolen recovery flow
- When customer's plate found → admin marks "recovered" → status=registered
- LINE Flex notify customer "เพลทกลับคืนแล้ว 🎉"

### W11.3 — Phase 3 acceptance test

Final smoke test before Phase 4:
- All 13 crons running with heartbeat ≤ expected interval
- LTV snapshot computed for all users
- Geo activations recorded on every activate
- Stolen plate blocking + alerts working
- 6-month KPI baseline established

### W11 Effort estimate

| Task | Effort | Status |
|---|---|---|
| W11.1.1 Geo data collection on activate | 4h | ⏸️ |
| W11.1.2 Tab 8 heatmap drill-down | 6h | 🟡 Partial |
| W11.1.3 Gray market scan cron | 6h | ⏸️ |
| W11.2.1 Stolen recovery flow | 4h | ⏸️ |
| W11.3 Acceptance test | 4h | ⏸️ |
| Tests + drift | 4h | ⏸️ |
| **Total remaining** | **~28h** | |

---

## 📅 Phase 3 sprint summary

| Sub-task | Status |
|---|---|
| W8.1 Heartbeat audit | ✅ Done (already compliant) |
| W8.2 Action Scheduler | ✅ Done (already compliant) |
| W8.3 Reconciliation | ✅ Done (commit b824274) |
| W8.4 Recall workflow | ✅ Done (commit b824274) |
| W8.5 SC Quick Lookup | ✅ Done (commit b824274) |
| W8.6 Photo OCR | ✅ Done (Phase 1 W3) |
| W9.1 Lifecycle Notifier | 🟡 Agent running |
| W9.2 F#6 Dealer Resolver | 🟡 Agent running |
| W9.3 Notification settings | ✅ Done (W7 V.31.0) |
| W9.4 Promo code system | 🟡 Pending Phase 3 W9 sprint |
| W10.1 LTV cron | ✅ Helper exists |
| W10.2 Tab 6 LTV UI | 🟡 Partial done |
| W10.3 CSV export | ⏸️ Pending |
| W11.1 Geographic Heatmap | 🟡 Partial done |
| W11.2 Stolen Registry | ✅ Done (W8.4) |
| W11.3 Acceptance test | ⏸️ Pending |

**Total Phase 3 progress**: ~70% done

---

## 🔗 Cross-references

- `docs/sn-system/16-phase3-w8-cron-infrastructure.md` — W8 prep
- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13 §Phase 3 W10/W11
- `docs/sn-system/07-boss-decisions-log.md` — Q21 (F#12 cut) + Q23 (stolen admin-only)
- `[Admin System] DINOCO Production SN Manager` V.0.26 — schema + Tab 6/8/9 + LTV helper
