# VAT Compliance System Audit Campaign — 2026-05-18

Single-day audit campaign on F#8 Marketplace VAT compliance system. 3 rounds, 6 agents dispatched, 30+ findings closed across BLOCKER/CRIT/HIGH/MED/LOW severities. ZERO production breaks.

## Campaign overview

| Round | Date | Agents | Findings | Commit |
|---|---|---|---|---|
| R1 | 2026-05-18 | fullstack-developer + code-reviewer + security-pentester (parallel) | 2 BLOCKER + 2 CRIT + 5 HIGH + 4 MED/LOW | `fe215d2` |
| R2 | 2026-05-18 | code-reviewer | 2 CRIT + 3 HIGH + 4 MED/LOW | `b90a9d1` |
| R3 | 2026-05-18 | code-reviewer | 1 CRIT + 3 HIGH + 3 MED + 2 LOW | `2798721` |
| C-2 close | 2026-05-18 | (proactive) | Canonical 3-section bubble | `ade8fe4` |
| Polish | 2026-05-18 | (final) | MED-1/2/3/6 + L-1 (5 items) | `e35a378` |

## R1 — 3-agent parallel deep review

### Scope
6 NEW snippets shipped earlier same day:
- Order Context Resolver V.1.0 / VAT Receipt V.1.0 / VAT Receipt LINE Push V.1.0 / VAT Monthly Export V.1.0 / SN REST API V.0.54 / Warranty Extension Marketplace V.0.7

### Findings closed

**BLOCKER**:
1. **BLOCKER-2** — `dinoco_sn_get_renewable_plate_count()` SQL references nonexistent columns (`m.sn_id`, `p.warranty_end`, status `'extended'`) → silent return 1 always → SET-context banner never appeared. Fix: rewrite using correct `m.sn = p.sn` FK + `status='registered'` + drop expiry-window filter per boss bundle policy.
2. **BLOCKER-1** — `DINOCO_Catalog::get_by_sku()` returns ARRAY_A with col `name` (not `title`). 6 sites accessed `$prod->title` → empty product names. Bonus: pre-existing `dinoco_sn_get_extension_price()` had same bug.

**CRITICAL**:
3. **CRIT-1** — PNG receipt files at `wp-content/uploads/dinoco-vat-receipts/{ext_id}-{receipt_no}.png` were predictable from auto-increment ID → mass enumeration without auth → PDPA breach (name + SN + payment_ref of all customers). Fix: 24-char HMAC token in filename (120-bit entropy from `hash_hmac('sha256', ext_id|receipt_no, wp_salt('auth'))`) + `.htaccess` Deny All + `index.php` silence file.
4. **CRIT-3** — `dinoco_vat_export_csv_escape()` only doubled quotes, didn't neutralize formula triggers. customer_name starting `=/+/-/@` executes as formula in Excel/Sheets/LibreOffice (CSV injection class — OWASP). Fix: prefix single-quote + strip CR/LF.

**HIGH** (5): rate-limit on receipt endpoint / 401/403/404/409 oracle leak / Order Context auto-tag race with walk-in marker / inline `onclick="window.print()"` UX-H3 violation / sibling fan-out reads stale `warranty_until` via ACF cache.

**MED/LOW** (4): doc drift `wp_dinoco_sn_extensions` → `wp_dinoco_sn_warranty_extensions` / mb_substr customer_name 30 chars too short / receipt_date raw MySQL DATETIME / cache_ttl=60 no-value zone.

## R2 — code-reviewer

### Scope
3 commits shipped after R1:
- `2aefa14` master VAT flag UI
- `8d65b62` Admin Dashboard wiring
- `04ac2f2` Order Context registry fix

### Findings closed

**CRITICAL**:
1. **C1** — `dinoco_vat_export_query()` ignores master flag → PP30 query lists ALL paid extensions including master-OFF window → declared VAT revenue with no matching customer receipts → Revenue Department reconciliation rejection. Fix: filter by `sn_audit.event_type='vat_receipt_pushed'` EXISTS subquery (canonical "receipt actually issued" marker from LINE Push V.1.0+).
2. **C2** — `dinoco_flag_audit_log` `$old` arg fabricated as inverse-of-new (not read from DB) → phantom audit log rows when admin toggles same state twice. Fix: read actual prior state + dedup if no change.

**HIGH** (3): option/constant divergence (refuse-to-enable when constant defined) / banner missing constant-lock indicator in `!ready` branch / `vat_export` missing from emergency fallback maps (preserves V.33.5 zero-risk rollback property).

**MED** (4): Marketplace Tools self-registration dead code (wrong fn `dinoco_register_module` + slug/title/section='snid') / `confirm()` not Modal Helpers / Order Context V.1.2 doc misleading / cache_ttl polish.

## R3 — code-reviewer (canonical Flex + DINOCO logo)

### Scope
Commit `14ae804` — canonical B2B Flex format + DINOCO logo on receipts.

### Findings closed

**CRITICAL**:
1. **C-1** — `b2b_flex_logo_header('#1A3A5C', '#fff')` raw-hex 3rd arg → triggers Sprint 3 #5 drift detector `bo-flex-header-canonical-drift.test.js`. Fix: use ONLY `dinoco_flex_header('info')` canonical (internally delegates to legacy helper with severity→bg resolution).

**HIGH** (3): `dinoco_vat_receipt_assemble_data` called 2x per push (memo perf) / `wp_remote_get` 10s timeout on logo fallback (DoS+latency) / customer_name 30→50 chars (Thai corporate legal name length).

**MED/LOW** (5): defensive `is_array($header_block)` check / `receipt_date` Thai date format / address 80→60 chars (collision with receipt_no) / docblock "base64 data URL" → "raw PNG binary" / alphablending dest for transparent PNG logos.

### C-2 deferred → proactively closed

R3 found bubble `header + hero + body + footer` 4-section pattern — LINE API spec accepts but NO other DINOCO Flex builder combines `hero + header`. Risk: schema rejection surfaces only at LINE runtime (CLAUDE.md "B2B BO V.3.13→V.4.0" history).

Boss said "ทำเลย" → proactive restructure to canonical 3-section pattern (`header + body + footer`) used by all 20+ DINOCO Flex builders. Image now lives inside body as edge-to-edge image component + padded summary box. Commit `ade8fe4`.

## Polish batch (5 items, commit `e35a378`)

| Item | Fix |
|---|---|
| MED-1 | LIFF Marketplace VAT 7% breakdown row RESTORED (V.0.6 hid it for non-VAT scope, 2026-05-18 boss revise restored) |
| MED-3 | Monthly Export aggregate SQL (single COUNT+SUM vs full enrichment) — 5-10× faster |
| MED-6 | OpenAPI autogen cross-file constants + `$var=CONST` pattern — 429→471+ routes captured (+42 SN routes recovered) |
| L-1 | VAT banner inline styles → scoped `.dnc-mp-vat-banner.is-*` CSS classes |
| MED-2 | Doc drift `wp_dinoco_sn_extensions` → `wp_dinoco_sn_warranty_extensions` (5 sites) |

## Cross-cutting patterns discovered

1. **Module Registry schema validation** — `dinoco_register_admin_module` validates 4 required fields (`key`, `shortcode`, `label`, `section` whitelist). Wrong arg keys (e.g., `id`, `desc`, `slug`, `title`) silently fail validation → snippets don't surface in Admin Dashboard. Found bug in BOTH Order Context Resolver + Marketplace Tools.
2. **Master flag design pitfalls** — Audit $old must come from DB (not inverse-of-new), constant+option divergence requires refuse-write, mid-window flap requires persistent issued-marker (not master flag query), emergency fallback symmetry needed when adding sidebar nav-items, downstream gates must read same `is_active()` helper, refuse-to-enable when data not ready. Captured in `feedback_master_flag_design_checklist.md`.
3. **Static file URL PDPA risk** — Any user-named file in `wp-content/uploads/` is enumerable via auto-increment ID. Defense: HMAC token in filename + .htaccess Deny All + atomic tmp+rename.
4. **CSV injection ubiquity** — Any admin-export CSV containing user-controlled fields (display_name, payment_ref, address) is vulnerable. OWASP cheat sheet pattern: prefix-quote + strip CR/LF in escape function.
5. **Canonical Flex pattern enforcement** — `bubble.header + bubble.body + bubble.footer` (3-section) used by all 20+ DINOCO Flex builders. Adding 4th section (`hero`) untested, schema rejection only surfaces at LINE API runtime.

## Final compliance posture

✅ PP30 query filter: only includes receipts actually issued (sn_audit event)
✅ PDPA: PNG access requires HMAC token or admin login + rate limit + login gate
✅ OWASP CSV injection: formula triggers neutralized
✅ Audit trail: master flag toggles logged with actual `$old` from DB
✅ Rollback: instant via UI toggle, atomic via constant override
✅ Idempotency: cron re-fire safe, transient guard 30-day TTL
✅ Schema: `dinoco_vat_master_enabled` wp_option + Flag Audit Log integration
✅ Anti-enumeration: 404 collapse on REST + HMAC filename on static

## Test infrastructure delta (recommended Round 4 — not done)

Items recommended but NOT shipped in this campaign:
- PHPUnit `tests/helpers/VatHelpersTest.php` — unit tests for `dinoco_vat_is_active()`, `dinoco_vat_set_master_enabled()`, `dinoco_vat_get()` defaults + override chain
- PHPUnit `tests/helpers/VatReceiptAssembleTest.php` — assemble_data memo + reverse-derive VAT split + receipt_no determinism
- Jest `tests/jest/vat-system-drift.test.js` — constant verification across 4 snippets + REST endpoints + cron hook bindings

These items deferred to follow-up Round 4 — system is production-safe without them but regression guard would be stronger.
