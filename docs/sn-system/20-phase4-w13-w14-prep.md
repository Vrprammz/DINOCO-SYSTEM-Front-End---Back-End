# 📊 Phase 4 W13 + W14 — Demand Forecast + OpenClaw Refactor + GDPR

**Date**: 2026-05-07 (preparation)
**Plan**: v2.13 §Phase 4 W13 + W14
**W12 status**: deferred per Q22 (see `19-phase4-w12-pubapi-deferred.md`)

---

## 🌟 W13 — F#16 Demand Forecasting (~25h)

### Status check (existing infrastructure)

**ALREADY DONE** (Phase 1 W2 schema):
- ✅ Schema `wp_dinoco_sn_demand_forecast` (12 cols)
- ✅ Cron `dinoco_sn_demand_forecast_cron` registered (weekly Sunday 02:00)
- ✅ Tab 3 Pool Status partial UI

**REMAINING W13 TASKS**:

### W13.1 — Forecast Computation Cron Worker

**Logic** (pure PHP, no ML lib):

```php
function dinoco_sn_run_demand_forecast() {
    // For each leaf SKU with sn_required=1:
    //   Get historical activations (sn_pool.registered_at) last 6 months grouped by month
    //   Compute moving average (3-month window)
    //   Compute exponential smoothing (alpha=0.3)
    //   Forecast next 6 months
    //   Compute confidence:
    //     - >=12 months data: 90-95%
    //     - 6-12 months: 75-85%
    //     - 3-6 months: 60-70%
    //     - <3 months: insufficient_data flag
    //   Compute days_until_empty = current_pool_qty / avg_monthly_consumption
    //   Compute suggested_order_qty = (avg_monthly × 6 months) + safety_stock(20%)
    //
    // INSERT ON DUPLICATE KEY UPDATE on wp_dinoco_sn_demand_forecast
    // Heartbeat: dinoco_cron_sn_demand_forecast_last_run
}
```

**Effort**: ~6h

### W13.2 — Tab 3 Pool Status Forecast Integration

**Existing partial in V.0.20 manager** — needs:
- ✅ Forecast table per SKU (6-month grid)
- ⏸️ Line chart visualization (Chart.js lazy-load)
- ⏸️ "Suggested Action" card with:
  - 🔔 ต้องสั่ง batch ใหม่
  - Quantity + lead time + cost estimate
  - [📨 ส่งให้บอส LINE] button (calls `b2b_send_flex_message`)
  - [📋 สร้าง batch ทันที] deep-link to Tab 1

**Effort**: ~10h

### W13.3 — Weekly Forecast Report (LINE Flex to บอส)

**Cron** `dinoco_sn_run_demand_forecast` end → build summary Flex card:
- ⚠️ SKUs ที่ต้องสั่งเร่งด่วน (top 3)
- 📊 Total recommended order qty
- 💰 Estimated cost
- 📅 Suggested order date

**Effort**: ~4h

### W13.4 — Edge Cases

- New SKU < 3 months data → "insufficient data" + manual estimate UI
- Discontinued SKU → exclude from forecast loop
- Anomaly (campaign launch spike) → admin can flag manually + adjust

**Effort**: ~3h tests + 2h edge handling

---

## 🤖 W14 — OpenClaw Chatbot Refactor + GDPR + Phase 4 Acceptance (~25h)

### W14.1 — 3 Existing Chatbot Tools Refactor + 1 New

**Existing in `openclawminicrm/proxy/modules/dinoco-tools.js`**:

1. `dinoco_warranty_check(serial, phone)` — currently legacy free-text serial
   - **Refactor**: redirect to `/dinoco-sn/v1/lookup/{sn}` (canonical S/N source of truth)
   - Add `top_set_sku`, `plate_status` to response
2. `dinoco_create_claim(serial, ...)` — currently `manual_claims.serial` free text
   - **Refactor**: validate serial vs sn_pool BEFORE insert
   - If S/N not found → return error "S/N ไม่ใช่ของแท้ DINOCO" + auto-flag
3. `dinoco_claim_status(ticket_id)` — keep as-is (uses ticket_id not serial)

**NEW tool** `dinoco_serial_lookup(serial)`:
- Canonical S/N → full warranty info (product + customer + warranty period + claim history)
- Used by chatbot when customer asks "ของฉันซื้อตอนไหน" / "ประกันถึงเมื่อไหร่"

**Effort**: ~4h

### W14.2 — chatbot-rules.md Section 15 (S/N + Plate Rules)

Add to `openclawminicrm/docs/chatbot-rules.md`:

- Rule 15.1: S/N format = `DNCSS\d{7}` (or batch prefix)
- Rule 15.2: ห้าม guess S/N status — ใช้ tool `dinoco_warranty_check` เท่านั้น (anti-hallucination)
- Rule 15.3: ถ้า scan ได้ S/N voided/recalled → ห้ามเผยเหตุผลรายละเอียด ส่งต่อ Telegram บอส
- Rule 15.4: Recall queries → return generic + escalate (anti social engineering)
- Rule 15.5: คำว่า "ใบรับประกัน" = warranty card (มี QR plate) ไม่ใช่ใบเสร็จ
- Rule 15.6: "เพลทหาย" = scenario M2 reissue → ขอ photo evidence ก่อน

**Effort**: ~3h (rules + 5-6 regression scenarios for Regression Guard V.1.5)

### W14.3 — MongoDB manual_claims Migration Script

**One-time backfill** (run via `node scripts/migrate-manual-claims-to-snpool.js`):

```js
// 1. SELECT all manual_claims WHERE serial != null
// 2. For each:
//    - If format matches /^DNCSS\d{7}$/ → lookup sn_pool
//      → if found: link claim_id to sn_pool.claim_id + flag manual_claims.linked_to_pool=true
//      → if not found: flag manual_claims.requires_manual_review=true
//    - If format mismatch → flag manual_review (legacy/typo/fake)
// 3. Generate report → Telegram บอส
// 4. Set field constraint for new claims → enforce sn_pool validation
```

**Effort**: ~6h (script + dry-run + rollback plan)

### W14.4 — GDPR V.4.0 → V.4.1 Extension

**Current scope** (V.4.0): wp_users + wp_usermeta + distributor CPT + warranty_registration + claim_ticket + B2B orders + LINE messages.

**V.4.1 additions**:
- Add `wp_dinoco_sn_pool` rows where `registered_user_id = user_id` to export
- Add `wp_dinoco_sn_audit` rows where `actor_user_id = user_id` OR `approver_user_id = user_id`
- Anonymize on delete: `registered_user_id = 0`, strip `phone` from audit `context_json`
- Right to access: include sn_pool + audit in ZIP export
- Right to erasure: keep S/N data (non-PII) but disconnect ownership

**Effort**: ~4h + tests

### W14.5 — Phase 4 Acceptance Test

Final smoke test before Phase 5 (Extension Marketplace):
- Demand forecast cron runs + Flex report sent to บอส
- Chatbot 3 refactored tools answer correctly with sn_pool data
- chatbot-rules.md Section 15 deployed
- manual_claims migration script ran + report reviewed
- GDPR V.4.1 export includes sn_pool + audit (test with 1 customer account)

**Effort**: ~4h manual QA + 2h test fixtures

---

## 📅 Phase 4 sprint summary

| Sub-task | Status |
|---|---|
| W12 F#15 Public API | 🚫 Deferred (Q22) |
| W13.1 Forecast cron | ⏸️ Pending |
| W13.2 Tab 3 forecast UI | 🟡 Partial done |
| W13.3 Weekly Flex report | ⏸️ Pending |
| W13.4 Edge cases + tests | ⏸️ Pending |
| W14.1 Chatbot tools refactor | ⏸️ Pending |
| W14.2 chatbot-rules.md Section 15 | ⏸️ Pending |
| W14.3 manual_claims migration | ⏸️ Pending |
| W14.4 GDPR V.4.1 extension | ⏸️ Pending |
| W14.5 Phase 4 acceptance | ⏸️ Pending |

**Total Phase 4 effort**: ~50h dev + 2 wk timeline (W12 deferral saves 1 wk)

---

## 🔗 Cross-references

- `docs/sn-system/19-phase4-w12-pubapi-deferred.md` — W12 deferral
- `docs/sn-system/18-phase3-w11.3-acceptance-test.md` — Phase 3 closure
- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13 §Phase 4 W13/W14
- `openclawminicrm/docs/chatbot-rules.md` — canonical chatbot brain
- `[System] DINOCO MCP Bridge` V.2.9 — `/sn-lookup` endpoint already done (W6.3)
- `[System] DINOCO GDPR Data Requests` V.4.0 — current scope to extend
