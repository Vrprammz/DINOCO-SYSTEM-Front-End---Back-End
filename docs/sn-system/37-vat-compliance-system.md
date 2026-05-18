# 37 — VAT Compliance System V.1.0 (2026-05-18)

End-to-end Thai PP30 compliance for F#8 Marketplace warranty extension purchases. Customer flow → receipt issue → LINE Flex push → monthly accountant CSV export.

## 1. Boss decisions (binding)

| Decision | Source | Binding rule |
|---|---|---|
| B2C marketplace = VAT 7% | `project_vat_policy_split.md` 2026-05-18 | Every paid extension generates VAT receipt + PP30 entry |
| B2B / Walk-in = non-VAT | Same memo (บัญชีบุคคล) | Skip VAT receipt entirely |
| Extension renewal-as-bundle | `project_extension_renewal_policy.md` | SN with `top_set_sku` → renew at SET SKU level, fan-out to siblings |
| Tax registration | Boss-provided 2026-05-18 | Tax ID `0105564033573` / บริษัท พีพีที กรุ๊ป คอร์ปอเรชั่น จํากัด / 21/106 ซอยลาดพร้าว 15 / branch_code `00000` (สำนักงานใหญ่) |

## 2. Architecture

### 2.1 Data flow (customer payment → receipt)

```
1. Customer scans SN in LIFF marketplace
   ↓
2. /marketplace/quote → renewable_sku resolution (top_set_sku else linked_sku)
   ↓ Customer picks plan + applies coupon
3. /marketplace/checkout → INSERT wp_dinoco_sn_warranty_extensions
   payment_status='pending_payment' + payment_ref=EXT-{uid}-{sn8}-{ts8}
   ↓ Customer pays via PromptPay/Slip2GO
4. Admin verifies slip → payment_status='paid' + paid_at=NOW
   ↓
5. apply_warranty_extension($ext_id) called
   ├─ Atomic warranty extend (ACF warranty_until update)
   ├─ SET fan-out: find siblings via sn_pool_meta JOIN on top_set_sku
   │    → wpdb->update wp_postmeta with FOR UPDATE lock + cache_delete
   │    → Skip-if-longer guard (protect legacy per-leaf renewals)
   ├─ Audit event 'warranty_extended' (sensitive=true, 5y retention)
   └─ wp_schedule_single_event('dinoco_sn_marketplace_receipt_async', $ext_id) +5s
   ↓
6. Cron fires → dinoco_vat_push_send_receipt($ext_id)
   ├─ Idempotency check (transient dinoco_vat_pushed_{id}, 30-day TTL)
   ├─ Eligibility: payment_status='paid' AND dinoco_vat_is_active()
   ├─ Render PNG (800×1130 A4-portrait)
   │    ├─ DINOCO logo top-right (b2b_inv_get_logo_gd 24hr cache reuse)
   │    ├─ Company info top-left (tax_id + branch_code + address)
   │    ├─ Title box "ใบกำกับภาษี / ใบเสร็จรับเงิน"
   │    ├─ Customer + Payment blocks
   │    ├─ Item table: ต่ออายุประกัน N ปี — {product_name}{(ชุด N ชิ้น)}
   │    ├─ Totals: pre-VAT subtotal + VAT 7% + grand total
   │    └─ Thai baht text + signature line
   ├─ Persist: wp-content/uploads/dinoco-vat-receipts/{ext_id}-{receipt_no}-{24hex_hmac}.png
   │    ├─ Atomic tmp+rename (LOCK_EX)
   │    ├─ .htaccess Deny All + index.php silence (Apache)
   │    ├─ HMAC token = substr(hash_hmac('sha256', ext_id|receipt_no, wp_salt('auth')), 0, 24)
   │    └─ 5MB size cap + PNG magic byte validation
   ├─ Build Flex (canonical 3-section bubble)
   │    ├─ header: dinoco_flex_header('info') — navy bg + DINOCO logo + title + receipt_no
   │    ├─ body: edge-to-edge image + padded summary (customer + item + total + VAT row)
   │    └─ footer: "📄 ดูใบกำกับภาษีฉบับเต็ม" button → HTML version
   ├─ Push via b2b_push_guaranteed($line_uid, $messages, 0, 'vat_receipt_extension')
   ├─ Audit event 'vat_receipt_pushed' (line_uid masked, used as PP30 filter key)
   └─ mark_sent transient (30-day, LINE UID masked)
   ↓
7. End of month: admin opens Admin Dashboard → การเงิน → VAT รายเดือน
   → Picker (year + month, default = previous month)
   → POST /export/csv → CSV download (Thai-Excel UTF-8 BOM + RFC 4180)
   → CSV filters by sn_audit vat_receipt_pushed EXISTS (only receipts issued)
   → Email to nักบัญชี → file PP30 with Revenue Department
```

### 2.2 Critical gates (in order)

1. **Master flag**: `dinoco_vat_master_enabled` wp_option (default '0') — refuse-to-enable if data not ready
2. **Constant override**: `WP_DINOCO_VAT_ENABLED` in wp-config locks state immutable
3. **Data readiness**: `dinoco_vat_is_ready()` checks tax_id + company_name + address all populated
4. **Active gate**: `dinoco_vat_is_active()` = master ON AND data ready (single source of truth for all VAT-emitting code)
5. **Eligibility per extension**: paid + active (receipt won't generate on master-OFF window)
6. **Idempotency per push**: transient guard prevents duplicate Flex push on cron re-fire
7. **PP30 inclusion gate**: only extensions with `vat_receipt_pushed` audit event appear in monthly CSV

## 3. Snippet inventory (6 components)

| DB_ID | Snippet | Version | Role |
|---|---|---|---|
| 1222 | Order Context Resolver | V.1.2 | `_dinoco_order_context` postmeta (5-value taxonomy) + register_post_meta hardening + deferred auto-tag |
| 1223 | VAT Receipt | V.1.4 | HTML + PNG renderer + REST `/dinoco-vat/v1/receipt/{id}` + receipt_no generator |
| 1224 | VAT Receipt LINE Push | V.1.4 | Cron handler + Flex builder + PNG persist + idempotency |
| 1225 | VAT Monthly Export | V.1.4 | Admin CSV + Admin Dashboard sidebar nav-item |
| - | Marketplace Tools | V.1.4 | Master flag UI + 5 REST endpoints |
| - | Warranty Extension Marketplace | V.0.8 | LIFF UI VAT row + SET-context banner |

## 4. REST API surface

| Endpoint | Method | Permission | Purpose |
|---|---|---|---|
| `/dinoco-vat/v1/receipt/{id}` | GET | owner OR admin | Stream HTML/PNG receipt (anti-enumeration via 404 collapse) |
| `/dinoco-vat/v1/check/{id}` | GET | admin | Diagnostic eligibility check |
| `/dinoco-vat/v1/resend/{id}` | POST | admin | Force-resend (clears transient) |
| `/dinoco-vat/v1/push-dry-run/{id}` | GET | admin | Test without push |
| `/dinoco-vat/v1/export/summary` | GET | admin | Monthly totals (count + subtotal + VAT + grand) |
| `/dinoco-vat/v1/export/rows` | GET | admin | Detailed rows (max 500 preview) |
| `/dinoco-vat/v1/export/csv` | GET\|POST | admin | CSV stream download |
| `/dinoco-marketplace-tools/v1/vat-toggle` | POST | admin | Master flag flip |
| `/dinoco-marketplace-tools/v1/vat-set` | POST | admin | Set single VAT field |
| `/dinoco-marketplace-tools/v1/vat-set-bulk` | POST | admin | Set all VAT fields |
| `/dinoco-marketplace-tools/v1/diagnose` | GET | admin | Full system state |

## 5. Rollback procedures

| Trigger | Action | Time |
|---|---|---|
| Compliance complaint | Master toggle OFF via Marketplace Tools UI | Instant |
| Critical bug discovered | `update_option('dinoco_vat_master_enabled', '0')` | Instant |
| Legal hold | `define('WP_DINOCO_VAT_ENABLED', false)` in wp-config | Permanent until removed |
| Wrong tax data | Edit fields in Marketplace Tools Section 2 (VAT Info) | Instant — next receipt picks up new values |
| Specific receipt mistake | Manual `wp_delete_post` on extension row + admin issues correction note | Manual SOP |

## 6. Audit campaign summary (3 rounds, same day)

| Round | Findings closed | Commit |
|---|---|---|
| R1 (3-agent: fullstack + code-reviewer + security-pentester) | 2 BLOCKER + 2 CRIT + 5 HIGH + 4 MED/LOW | `fe215d2` |
| R2 code-reviewer | 2 CRIT + 3 HIGH + 4 MED/LOW | `b90a9d1` |
| R3 code-reviewer | 1 CRIT + 3 HIGH + 3 MED + 2 LOW | `2798721` |
| Proactive C-2 | Canonical 3-section Flex bubble | `ade8fe4` |
| Polish (MED-1/2/3/6 + L-1) | 5 deferred items | `e35a378` |

**Total findings closed in single day**: 30+ across all severity levels.

## 7. Lessons captured

- **Master flag design checklist** — `feedback_master_flag_design_checklist.md` (6 axes: audit $old / constant divergence / mid-window flap / emergency fallback / refuse-to-enable / downstream uniformity)
- **Canonical Flex pattern** — Always use 3-section (header + body + footer), avoid header+hero combo (no production confirmation of LINE acceptance)
- **PDPA defense for static file URLs** — HMAC-token filenames + .htaccess + atomic write tmp+rename
- **CSV injection** — OWASP cheat sheet prefix-quote `=/+/-/@/tab/CR`
- **Audit-event filter for financial reports** — Use canonical "actually issued" marker (not just paid_at), enables flag-flap mid-month without breaking reconciliation

## 8. Cross-references

- `project_vat_policy_split.md` (memory) — boss decision
- `project_extension_renewal_policy.md` (memory) — renewal-as-bundle binding
- `project_vat_system_live.md` (memory) — production state
- `feedback_master_flag_design_checklist.md` (memory) — anti-regression
- `docs/runbooks/VAT-ACTIVATION-BOSS-GUIDE.md` — boss UI steps
- `[Admin System] DINOCO Marketplace Tools` V.1.4 — master flag UI source
- `CLAUDE.md` "VAT Compliance System V.1.0" — code archaeology
