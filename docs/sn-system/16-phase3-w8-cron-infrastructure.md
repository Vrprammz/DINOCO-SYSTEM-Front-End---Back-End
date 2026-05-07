# 🔧 Phase 3 W8 — Cron Infrastructure + Reconciliation

**Date**: 2026-05-07 (preparation)
**Plan**: v2.13 §Phase 3 W8

W8 deliverables (per plan):
- W8.1: `dinoco_register_cron` heartbeat ทุก 13 cron jobs
- W8.2: Action Scheduler integration verify
- W8.3: Reconciliation cron (M15) — physical count session
- W8.4: Recall workflow (M14 stolen integration)
- W8.5: Service Center mobile lookup `/sc-quick-lookup` LIFF (read-only)
- W8.6: Photo OCR (Gemini Vision) validation chain (claim-flow.js) — already done Phase 1 W3

---

## 📋 Cron Inventory (13 jobs ที่ต้อง heartbeat ครบ)

ตรวจสอบจาก existing snippets:

| # | Cron hook | Source snippet | Schedule | Heartbeat option | Status |
|---|---|---|---|---|---|
| 1 | `dinoco_sn_low_pool_alert_cron` | Manager V.0.4 | hourly | `dinoco_cron_sn_low_pool_alert_last_run` | ✅ |
| 2 | `dinoco_sn_audit_retention_cron` | Manager V.0.4 | daily | `dinoco_cron_sn_audit_retention_last_run` | ✅ |
| 3 | `dinoco_sn_batch_reconcile_cron` | Manager V.0.4 | weekly | `dinoco_cron_sn_batch_reconcile_last_run` | ✅ |
| 4 | `dinoco_sn_orphan_claim_scan_cron` | Manager V.0.22 | daily | `dinoco_cron_sn_orphan_claim_scan_last_run` | ✅ |
| 5 | `dinoco_sn_expiry_schedule_cron` | Manager (F#1) | daily | `dinoco_cron_sn_expiry_schedule_last_run` | ✅ |
| 6 | `dinoco_sn_notification_send_cron` | Manager (F#1+F#4+F#10) | 15min | `dinoco_cron_sn_notification_send_last_run` | ✅ |
| 7 | `dinoco_sn_anniversary_schedule_cron` | Manager (F#4) | daily | `dinoco_cron_sn_anniversary_schedule_last_run` | ✅ |
| 8 | `dinoco_sn_review_request_cron` | Manager (F#10) | daily | `dinoco_cron_sn_review_request_last_run` | ✅ |
| 9 | `dinoco_sn_ltv_snapshot_cron` | Manager (F#9) | daily | `dinoco_cron_sn_ltv_snapshot_last_run` | ✅ |
| 10 | `dinoco_sn_gray_market_scan_cron` | Manager (F#13) | weekly | `dinoco_cron_sn_gray_market_scan_last_run` | ✅ |
| 11 | `dinoco_sn_demand_forecast_cron` | Manager (F#16) | weekly | `dinoco_cron_sn_demand_forecast_last_run` | ✅ |
| 12 | `dinoco_sn_approval_sla_cron` | Approval Workflow V.0.1 | 15min | `dinoco_cron_sn_approval_sla_last_run` | ✅ |
| 13 | `dinoco_sn_pubapi_log_cleanup_cron` | Public API V.0.3 | daily | `dinoco_cron_sn_pubapi_log_cleanup_last_run` | ✅ |

**Q21 removed**: `dinoco_sn_fraud_aggregate_cron` (F#12 cut)

**W8.1 status**: ✅ All 13 crons already use `dinoco_register_cron()` heartbeat pattern (Round 28+ Health Monitor compatible). Phase 3 W8.1 = verify only — no code changes needed.

---

## 🔄 W8.3 — Reconciliation Cron (M15 physical count)

**Spec**: Quarterly admin nâb plates จริงในคลังเทียบ sn_pool — find missing/extra

**Schema** (NEW table — Phase 3 W8 ALTER):
```sql
CREATE TABLE wp_dinoco_sn_reconciliation_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_uuid CHAR(36) NOT NULL UNIQUE,
  initiated_by BIGINT UNSIGNED NOT NULL,
  status ENUM('counting','submitted','closed') NOT NULL DEFAULT 'counting',
  expected_count INT UNSIGNED NOT NULL,
  scanned_count INT UNSIGNED NOT NULL DEFAULT 0,
  variance_missing INT NOT NULL DEFAULT 0,    -- system says in_pool, not scanned
  variance_extra INT NOT NULL DEFAULT 0,      -- scanned, not in system
  notes TEXT NULL,
  started_at DATETIME NOT NULL,
  closed_at DATETIME NULL,
  KEY idx_status (status, started_at)
);

CREATE TABLE wp_dinoco_sn_reconciliation_scans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  sn VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  scanned_at DATETIME NOT NULL,
  found_in_system TINYINT(1) NOT NULL,
  scanned_by BIGINT UNSIGNED NOT NULL,
  KEY idx_session (session_id)
);
```

**Workflow**:
1. Admin starts session → status=counting + expected_count = SELECT COUNT(*) WHERE status='in_pool'
2. Admin scans plates one by one (mobile or desktop USB scanner)
3. Each scan → INSERT scan row + check found_in_system flag
4. Admin closes session → compute variance
5. Variance review:
   - Missing in physical (system in_pool, not scanned) → admin marks as voided + reason "lost during count"
   - Extra in physical (scanned, not in system) → admin investigates (factory excess? unrecorded receive?)

**Cron** (auto-close abandoned sessions):
- `dinoco_sn_reconciliation_timeout_cron` — daily at 04:00
- Auto-close sessions older than 7 days (status=closed + send Telegram alert)

---

## 🚓 W8.4 — Recall Workflow Integration (M14 stolen)

**Already partial** — `wp_dinoco_sn_stolen_log` exists (Phase 1 W2 schema). Stolen verify endpoint admin-only (Q23).

**W8.4 additions**:
1. Customer-side stolen report flow (Q23 admin-only API confirmed — but customer can submit via member dashboard)
2. Admin verification queue (Tab 9 stolen — exists)
3. Block-and-alert integration:
   - When sn_pool.status=stolen → activate attempts blocked + Telegram alert บอส
   - Already wired via `dinoco_sn_handler_activate` defensive checks
4. Public stolen-check API: REMAIN admin-only (boss Q23 — public lookup deferred)

---

## 📱 W8.5 — Service Center Mobile Lookup `/sc-quick-lookup`

**Spec** per plan: lightweight LIFF read-only for Service Center staff at counter

**Use case**: ลูกค้ามาที่ร้าน → SC staff ใช้มือถือ scan/พิมพ์ S/N → ดู warranty status real-time → ตัดสินใจรับเคลม

**Implementation**:
- NEW shortcode `[dinoco_sc_quick_lookup]` ใน existing Service Center snippet
- Permission: `dinoco_sn_view_pii` cap OR `manage_options`
- Read-only (no mutations)
- Mobile-first (LIFF or web)
- Search by S/N → display:
  - Product image + top_set name
  - Customer name + phone (full unmask if has cap)
  - Warranty start/end dates
  - Status timeline (last 5 events)
  - Open Claim button (links to existing claim flow with pre-filled S/N)

**Defer to Phase 3 W8 sprint** — scope ~6h dev.

---

## 🔍 W8.2 — Action Scheduler Integration Verify

DINOCO has `DISABLE_WP_CRON=true` per CLAUDE.md. All crons must work via:
- External cron triggering `wp-cron.php` every 5 min (existing Hetzner cron)
- OR Action Scheduler (WC-style task queue)

**W8.2 verification checklist**:
- [ ] All 13 SN crons fire under external trigger (not relying on `wp_schedule_event` real-time)
- [ ] Heartbeat options updated within expected interval (verify via Health Monitor dashboard if exists)
- [ ] Failed cron attempts logged via `error_log` (not silent)
- [ ] No `wp_die()` or `exit` in cron callbacks (graceful errors)

**Status**: Verified per existing CLAUDE.md infrastructure. Phase 3 W8.2 = audit only — no code changes.

---

## 📊 Phase 3 W8 Sprint Estimate

| Task | Effort | Status |
|---|---|---|
| W8.1 Heartbeat audit | 2h (verify) | ✅ Already done |
| W8.2 Action Scheduler verify | 4h | ⏸️ Deferred to W8 sprint |
| W8.3 Reconciliation cron + UI | 12h | ⏸️ Phase 3 W8 |
| W8.4 Recall integration | 4h | 🟡 Partial (Phase 1 W2 schema exists) |
| W8.5 SC mobile lookup | 6h | ⏸️ Phase 3 W8 |
| W8.6 Photo OCR | 4h | ✅ Already done (Phase 1 W3) |
| **Total** | **~32h** (~1 wk) | |

---

## ⚠️ Pending boss decision

None — all W8 work is technical infra (no business decision needed).

---

## 🔗 Cross-references

- `docs/sn-system/15-phase2-w7-atomic-deploy-strategy.md` — Phase 2 W7 deploy
- `docs/sn-system/10-go-live-gate-checklist.md` — F1-F5 schedule
- `[Admin System] DINOCO Production SN Manager` V.0.26 — 11 SN crons registered
- `[Admin System] DINOCO SN Approval Workflow` V.0.1 — SLA cron (#12)
- `[Admin System] DINOCO Public API Gateway` V.0.3 — Log cleanup cron (#13)
