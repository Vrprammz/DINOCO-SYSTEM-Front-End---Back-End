# 🧪 Phase 3 W11.3 — Acceptance Smoke Test (Pre-Phase 4 Gate)

**Date**: 2026-05-07 (template ready, boss runs after F1 flag flip)
**Plan**: v2.13 §Phase 3 W11.3
**Trigger**: Run AFTER `dinoco_sn_system_enabled=1` + 7 days of production traffic

---

## 🎯 Purpose

Final smoke test before Phase 4 (W12-W14: Public API + Demand Forecast + OpenClaw).
Validates that all Phase 1-3 features work end-to-end on production data.

**Acceptance gate (informational, NOT blocking)**: บอส accept/reject — Phase 4 can start
even with known issues (per v2.13 boss decision "ทำต่อเนื่อง ไม่มี gate review หยุด").
But surface bugs documented here get fixed in Phase 4 alongside new feature work.

---

## ✅ Test Matrix (5 sections, ~30 min run-through)

### Section 1 — Cron Heartbeat Audit (13 crons)

Run on production WP server:

```bash
# SSH into prod, run wp-cli
cd /var/www/dinoco-prod
wp option get dinoco_cron_sn_low_pool_alert_last_run        # hourly — should be <60min ago
wp option get dinoco_cron_sn_audit_retention_last_run        # daily — <24hr
wp option get dinoco_cron_sn_batch_reconcile_last_run        # weekly — <7d
wp option get dinoco_cron_sn_orphan_claim_scan_last_run      # daily — <24hr
wp option get dinoco_cron_sn_expiry_schedule_last_run        # daily — <24hr
wp option get dinoco_cron_sn_notification_send_last_run      # 15min — <30min
wp option get dinoco_cron_sn_anniversary_schedule_last_run   # daily — <24hr
wp option get dinoco_cron_sn_review_request_last_run         # daily — <24hr
wp option get dinoco_cron_sn_ltv_snapshot_last_run           # daily — <24hr
wp option get dinoco_cron_sn_gray_market_scan_last_run       # weekly — <7d
wp option get dinoco_cron_sn_demand_forecast_last_run        # weekly — <7d
wp option get dinoco_cron_sn_approval_sla_last_run           # 15min — <30min
wp option get dinoco_cron_sn_pubapi_log_cleanup_last_run     # daily — <24hr (or N/A if Q22 disabled)
```

**Pass**: ทุกตัว heartbeat อยู่ในช่วงที่คาดหวัง
**Fail**: หนึ่งหรือมากกว่าหนึ่งตัว heartbeat เกิน → check `wp cron event list` + `error_log` + Health Monitor dashboard

### Section 2 — Customer LIFF Activate End-to-End

Manual test on real plate from Phase 2 W6 production batch:

1. ✅ Pick 1 plate in `status=in_pool` from Tab 4 search
2. ✅ Generate test QR via `https://dinoco.in.th/warranty/activate?sn=<SN>`
3. ✅ Open in LINE LIFF (mobile, NOT logged in initially)
4. ✅ Verify redirect → LINE OAuth → callback returns to `/warranty/activate/?sn=<SN>&welcome=`
5. ✅ Submit form (Honda XL750, ใบเสร็จ photo upload)
6. ✅ DB check: `wp_dinoco_sn_pool.status` flipped to `registered`, `registered_user_id` set
7. ✅ DB check: warranty_registration CPT created, `serial_code` ACF mirror = `<SN>`
8. ✅ DB check: `wp_dinoco_sn_geo_activations` row inserted (W11.1 — geo capture)
9. ✅ LINE Flex card received: "🎉 ลงทะเบียนสำเร็จ"
10. ✅ Member Dashboard "My Warranties" shows new plate with tier badge

**Pass**: ทุกข้อ ✅
**Fail**: ระบุข้อที่ fail + screenshot/log → fix Phase 4 W14

### Section 3 — Stolen Plate Defensive Block

Reproduce W8.4 + W11.2 scenario:

1. ✅ Pick 1 registered plate, mark stolen via Tab 9 admin UI
2. ✅ DB check: `sn_pool.status='stolen'`, `stolen_at` timestamp set, `stolen_log` row inserted
3. ✅ Try activate same SN as another LIFF user → expect "เพลทรายงานหายแล้ว" error + redirect block
4. ✅ Telegram alert received (admin group): "🚨 STOLEN PLATE ACTIVATE ATTEMPT"
5. ✅ Admin opens Tab 9 → "🎉 Mark Recovered" modal (W11.2)
6. ✅ Submit recovery: date + notes + evidence_attachment_ids
7. ✅ DB check: `stolen_log.status='recovered'`, `sn_pool.status` reverted from `recalled` → `prev_status` (or `registered` fallback)
8. ✅ Owner LINE Flex received: "🎉 เพลทกลับคืนแล้ว"

**Pass**: ทุกข้อ ✅

### Section 4 — LTV Snapshot + CSV Export

1. ✅ Trigger LTV cron manually: `wp cron event run dinoco_sn_ltv_snapshot_cron`
2. ✅ DB check: `wp_dinoco_sn_customer_ltv_snapshot` populated for all users with plates
3. ✅ Open Tab 6 ลูกค้า VIP → verify list renders + tier badges (5-tier: bronze/silver/gold/platinum/diamond)
4. ✅ Click drill-down → modal shows plates + orders + claims + tier breakdown
5. ✅ Click "📥 Export CSV" (W10.3) → file downloads
6. ✅ Open CSV in Excel → UTF-8 BOM honored (Thai chars display correctly)
7. ✅ Verify columns: User ID, Display Name, Email, Phone(masked), Tier, Plates, Active, Claims, Total Spent, First Purchase, Last Purchase, Member Years
8. ✅ Verify rate-limit: 6th export within 1 hour → 429 error (expected)

**Pass**: ทุกข้อ ✅

### Section 5 — Geographic Heatmap + Gray Market

1. ✅ Open Tab 8 Geo Map → heatmap renders (Leaflet/Mapbox)
2. ✅ Filter: time-range = 30d → activations re-fetch
3. ✅ Filter: gray-only toggle = ON → only suspect provinces show
4. ✅ Click province row → drill-down sidebar (top 5 SKUs + sample plates + activation count)
5. ✅ Trigger gray market scan: `wp cron event run dinoco_sn_gray_market_scan_cron`
6. ✅ DB check: provinces with foreign country activations flagged `is_gray_market_suspect=1`
7. ✅ Telegram alert + Flex card received (admin group) — weekly report sample

**Pass**: ทุกข้อ ✅

---

## 📊 6-Month KPI Baseline (capture for Phase 4 reference)

หลัง smoke test ผ่าน → snapshot ค่าต่อไปนี้ลง wp_options เพื่อใช้เป็น Phase 4 baseline:

```bash
wp option update dinoco_sn_phase3_kpi_baseline '{
  "total_plates_in_pool": <N>,
  "total_registered": <N>,
  "total_claimed": <N>,
  "total_voided": <N>,
  "total_stolen": <N>,
  "total_recovered": <N>,
  "total_extensions_sold": <N>,
  "ltv_diamond_count": <N>,
  "ltv_platinum_count": <N>,
  "geo_provinces_active": <N>,
  "geo_gray_market_suspects": <N>,
  "f1_expiry_pushes_30d": <N>,
  "f4_anniversary_pushes_30d": <N>,
  "f10_review_requests_30d": <N>,
  "captured_at": "<ISO8601>"
}' --format=json
```

Phase 4 W14 จะ compare new metrics vs. baseline เพื่อวัด Public API + Forecast accuracy impact.

---

## ✅ Acceptance Decision

หลัง smoke test ผ่าน 5 sections → Phase 3 = **CLOSED** + Phase 4 W12 (F#15 Public API Gateway,
deferred per Q22 — start with code retained but flag-gated) ก็ start ได้.

**ถ้า fail any section** → log issue ใน `docs/sn-system/19-phase3-known-issues.md` (จะสร้างถ้ามี issue) +
ตัดสินใจว่า hotfix Phase 3 ก่อนหรือ defer ไป Phase 4.

---

## 🔗 Cross-references

- `docs/sn-system/16-phase3-w8-cron-infrastructure.md` — W8 cron setup
- `docs/sn-system/17-phase3-w10-w11-prep.md` — W10/W11 implementation status
- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13 §Phase 3 W11.3 + §Phase 4
- `[Admin System] DINOCO Production SN Manager` V.0.29 — Tab 6/8/9 + cron heartbeat
- `[System] DINOCO Warranty Activation LIFF` V.0.5 — geo capture + first-time login
