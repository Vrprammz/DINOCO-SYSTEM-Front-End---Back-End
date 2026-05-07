# 🧪 Phase 4 W14.5 — Acceptance Smoke Test (Pre-Phase 5 Gate)

**Date**: 2026-05-07 (template ready, boss runs after Phase 4 deploy + 7d traffic)
**Plan**: v2.13 §Phase 4 W14.5
**Phase 4 effective duration**: 2 wk (W12 deferred per Q22)

---

## 🎯 Purpose

Final smoke test before Phase 5 (Extension Marketplace).
Validates that all Phase 4 W13+W14 features work end-to-end on production data.

**Acceptance gate (informational, NOT blocking)** per v2.13 boss decision
"ทำต่อเนื่อง ไม่มี gate review หยุด". Bugs surface in Phase 5 alongside new feature work.

---

## ✅ Test Matrix (4 sections, ~25 min run-through)

### Section 1 — F#16 Demand Forecast End-to-End

1. ✅ Trigger forecast cron manually:
   ```bash
   wp cron event run dinoco_sn_demand_forecast_cron
   ```
2. ✅ DB check: `wp_dinoco_sn_demand_forecast` populated for SKUs with ≥3 months activation history
3. ✅ Heartbeat: `wp option get dinoco_cron_sn_demand_forecast_last_run` < 24hr ago
4. ✅ Open Tab 3 Pool Status → forecast section visible per SKU
5. ✅ Suggested Action card appears for SKUs with `days_until_empty < 60`
6. ✅ Click "📨 ส่งให้บอส LINE" → confirm modal → REST POST `/forecast/notify-boss` → Flex card received in admin LINE group
7. ✅ Flex card shows: severity tint (red/amber/green), top 3 urgent SKUs, total cost estimate
8. ✅ POST `/forecast/run` returns 200, second call within 1hr returns 429 (rate limit)

**Pass**: ทุกข้อ ✅

### Section 2 — Chatbot Tools Refactor

Test on staging Mini CRM agent:

1. ✅ Send message "DNCSS0001234" → AI calls `dinoco_warranty_check` or `dinoco_serial_lookup` → `/dinoco-mcp/v1/sn-lookup` route
2. ✅ Send "dncss-0001234" (lowercase + dash) → normalizeSerial uppercases + strips → same result
3. ✅ Send "DN-12345" → falls through to legacy `/warranty-check` (backward compat)
4. ✅ Send fake "DNCSS9999999" → reply "ไม่พบ S/N..." (no claim created)
5. ✅ Customer asks "ของฉันซื้อเมื่อไหร่" + S/N → AI calls `dinoco_serial_lookup` proactively
6. ✅ Open claim with valid registered S/N → success + `serial_status_at_create` populated in MongoDB
7. ✅ Open claim with not-found S/N → error string, NO MongoDB write, NO `/claim-manual-create` call
8. ✅ Open claim with voided/recalled/stolen S/N → "S/N ... อยู่ในสถานะ X — กรุณาติดต่อทีมงาน" — no insert, no leak of reason
9. ✅ Open claim with legacy DN-XXXXX → skips S/N gate, proceeds with insert (V.5.x behavior preserved)
10. ✅ Run regression guard:
    ```bash
    cd openclawminicrm && node scripts/regression.js --mode=gate --severity=critical
    ```
    Expected exit code 0 (zero CRITICAL fails). REG-001..025+ scenarios all pass.

**Pass**: ทุกข้อ ✅

### Section 3 — manual_claims Migration

Run migration script on staging FIRST (dry-run):

```bash
cd openclawminicrm
node scripts/migrate-manual-claims-to-snpool.js --dry-run --limit=50 --verbose
```

1. ✅ Script connects to MongoDB without errors
2. ✅ Reports counts: `total_scanned`, `linked`, `flagged_review`, `empty_serial`, `errors`
3. ✅ Sample outcomes printed for canonical_not_found / format_mismatch (≤5 each)
4. ✅ Exit code 0
5. ✅ Telegram report received (if `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` set)

Then LIVE run on production:

```bash
node scripts/migrate-manual-claims-to-snpool.js
```

6. ✅ All scanned docs have `migration_v143_done: true` flag (verify via random sample query)
7. ✅ Re-run is idempotent (second run reports 0 new scans because filter `migration_v143_done: { $ne: true }` excludes already-done)
8. ✅ Sample doc with canonical S/N → has `linked_sn`, `linked_pool_status`, `linked_top_set_sku` populated
9. ✅ Sample doc with format mismatch → has `requires_manual_review: true` + `migration_v143_outcome: 'format_mismatch'`

**Pass**: ทุกข้อ ✅

### Section 4 — GDPR V.4.2 Extension

Test with 1 customer account that has sn_pool plates:

1. ✅ Submit data export request via member dashboard or REST `POST /dinoco-gdpr/v1/my-data-export`
2. ✅ Wait for admin approval + worker run
3. ✅ Download ZIP — verify includes:
   - `sn-plates.csv` (UTF-8 BOM, RFC 4180, header row + data rows)
   - `sn-audit-actions.csv` (if user is admin/approver)
   - Existing V.4.1 JSON files (`sn-plates.json`, `sn-audit-events.json`, etc.) STILL present
4. ✅ Open `sn-plates.csv` in Excel — Thai chars render correctly (BOM honored)
5. ✅ Customer with NO sn_pool plates → ZIP still generates, `sn-plates.csv` has header row only (NOT UNAVAILABLE)
6. ✅ If `wp_dinoco_sn_pool` table missing → ZIP includes `sn-plates-UNAVAILABLE.txt` placeholder

Test erasure flow on disposable test account:

7. ✅ Submit erasure request → admin approves → worker runs `dinoco_gdpr_anonymize_user_data($user_id)`
8. ✅ DB check: `sn_pool.registered_user_id = 0` for that user's plates (S/N rows preserved, ownership disconnected)
9. ✅ DB check: `sn_audit.context_json` no longer contains phone/email for that user's actions
10. ✅ Audit log has 4 new action types (`anonymize_sn_pool`, `anonymize_sn_audit`, `export_sn_pool`, `export_sn_audit`)
11. ✅ Erasure idempotent (second run on same user safe — already 0)

**Pass**: ทุกข้อ ✅

---

## 📊 Phase 4 KPI Capture

```bash
wp option update dinoco_sn_phase4_kpi_baseline '{
  "forecast_skus_tracked": <N>,
  "forecast_urgent_skus_avg": <N>,
  "weekly_flex_pushes_30d": <N>,
  "chatbot_canonical_serial_lookups_30d": <N>,
  "chatbot_canonical_validations_blocked": <N>,
  "manual_claims_migrated": <N>,
  "manual_claims_flagged_review": <N>,
  "gdpr_export_requests_30d": <N>,
  "gdpr_erasure_requests_30d": <N>,
  "captured_at": "<ISO8601>"
}' --format=json
```

Phase 5 (Extension Marketplace) will compare new metrics vs. baseline.

---

## ✅ Acceptance Decision

หลัง smoke test ผ่าน 4 sections → **Phase 4 = CLOSED** + Phase 5 W15 (Extension Marketplace,
boss Q6 binding "B แต่ทำให้ละเอียดที่สุด" + Q8 per-SKU manual pricing) start.

**ถ้า fail any section** → log issue + ตัดสินใจว่า hotfix Phase 4 ก่อน หรือ defer ไป Phase 5 W18 polish.

---

## 🔗 Cross-references

- `docs/sn-system/20-phase4-w13-w14-prep.md` — W13/W14 implementation prep
- `docs/sn-system/19-phase4-w12-pubapi-deferred.md` — W12 deferral
- `docs/sn-system/18-phase3-w11.3-acceptance-test.md` — Phase 3 closure
- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13 §Phase 4 W14.5 + §Phase 5
- `[Admin System] DINOCO Production SN Manager` V.0.30 — Tab 3 forecast UI
- `[System] DINOCO SN REST API` V.0.23 — forecast endpoints
- `[System] DINOCO GDPR Data Requests` V.4.2 — sn_pool + sn_audit scope
- `openclawminicrm/proxy/modules/dinoco-tools.js` V.6.0 — chatbot S/N integration
- `openclawminicrm/scripts/migrate-manual-claims-to-snpool.js` — one-time migration
