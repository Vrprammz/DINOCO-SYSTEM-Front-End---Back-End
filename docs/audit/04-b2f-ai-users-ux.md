# Round 2 Deep Audit — B2F + AI + Users + UX

**Date**: 2026-04-24 · **Scope**: B2F cluster (4 pages) + AI/Users/Brand Voice/LIFF AI/Dashboard root + cross-cutting UX (10 surfaces) · **Files reviewed**: ~25,000 LOC across 10 snippets.

## Executive Summary

The B2F cluster is **architecturally sound** — atomic credit ops (`b2f_payable_add/subtract`) use proper `START TRANSACTION` + `FOR UPDATE` + `GET_LOCK`, the 12-state FSM (`B2F_Order_FSM`) is centrally enforced via `b2f_transition_order()`, and Migration Audit destructive endpoints are uniformly rate-limited (5/hr) with confirm gates. Modal adoption is **mostly complete** in B2F Snippet 5 (15 sites converted with try/catch fallback) and Migration Audit (9 sites), matching the Phase 6 bulk migration claim. However, three issues warrant attention: (1) 14 direct `update_field('po_status')` calls in B2F REST API are gated as FSM fallbacks but bypass `b2f_order_status_changed` action hooks; (2) the root Admin Dashboard (5042 LOC) has only **1 `@media` breakpoint** — mobile is broken; (3) the `dinoco_admin_ai_control` shortcode is **orphaned** — registered but missing from sidebar nav and `module_map`. LIFF AI claim regex `[a-f0-9]+` is technically permissive enough but semantically misleading.

## Per-Page Findings

### 1. B2F Orders (`[b2f_admin_orders_tab]`) — Snippet 5 lines 450-2180

Bulk Cancel PO + Multi-Currency UI use `b2f_transition_order()` consistently. Modal adoption: 13 sites migrated (lines 1715, 1729, 1789, 1813, 1858, 1872, 2879) using try/catch + `confirm()` fallback. Empty/loading states present. **Finding O-1 (LOW)**: line 1832 — when `prompt()` reason is empty, `alert('⚠️ ต้องระบุเหตุผล')` is native (line 1832); should migrate to `dinocoModal.alert({type:'warning'})` for consistency.

### 2. B2F Makers (`[b2f_admin_makers_tab]`) — Snippet 5 lines 2183-4419

Source-badge UI (CPT vs Auto) + bulk-delete + blacklist + per-SET delete handlers correctly use rate-limited endpoints. Modal adoption: 8 sites at lines 4039, 4102, 4173, 4222, 4296. **Finding M-1 (MEDIUM)**: Confirmation handler `confirmAllUnconfirmed()` (V.7.1) uses bulk PATCH but lacks idempotency_key — re-clicking under network lag could double-classify. Suggest including `idempotency_key: crypto.randomUUID()` in payload (mirroring `junction-bulk-update-display`).

### 3. B2F Credit (`[b2f_admin_credit_tab]`) — Snippet 5 lines 4421-4820

Atomic credit ops via `b2f_payable_add/subtract` (Snippet 7) verified clean — `START TRANSACTION` + `FOR UPDATE` + commit/rollback per V.1.5. **Finding C-1 (LOW)**: `b2f_check_credit()` (Snippet 7:347) uses cached `get_field()` which may be stale post-payment. Recommend reading `meta_value` directly via `wpdb->get_var()` — same pattern as `b2f_payable_subtract` HIGH-02 fix at line 154.

### 4. B2F Migration Audit (`[b2f_migration_audit]`) — 5005 LOC

Phase 4 LIVE migration is **safety-conscious**: lock auto-expire (V.3.11), dry-run CSV preview, mysqldump backup before ALTER, idempotent ALTER via INFORMATION_SCHEMA, rate limit 5/hr. **Finding A-1 (HIGH)**: line 912-921 — `mysqldump` shell command passes password via `-p<value>` argument, exposing it in `ps`/`auditd`/shell history of any system user. Fix: use `MYSQL_PWD` env var or `--defaults-extra-file=` with a mode-0600 temp credentials file. Snippet:
```php
// Better:
$cred_file = wp_tempnam('b2f-mysqldump-cred');
@file_put_contents($cred_file, "[client]\nuser={$user}\npassword={$pass}\n");
@chmod($cred_file, 0600);
$cmd = sprintf('mysqldump --defaults-extra-file=%s --single-transaction ...',
               escapeshellarg($cred_file));
@shell_exec($cmd);
@unlink($cred_file);
```

### 5. AI Control (`[dinoco_admin_ai_control]`) — 3158 LOC

**Finding AI-1 (HIGH — wiring drift)**: Shortcode is registered (line 72) but **NOT in Admin Dashboard sidebar nav nor `module_map`** (Dashboard lines 687-706). Admins must navigate to a separate page hosting this shortcode. Fix: add `'ai_control' => '[dinoco_admin_ai_control]'` to `$module_map` and a sidebar nav-item. Currently CLAUDE.md lists it as a "Key Shortcode" but it's effectively unreachable from the unified dashboard.

### 6. Brand Voice (`[dinoco_brand_voice]`) — 2451 LOC

REST endpoints `brand-voice/v1/*` use sha256-hashed API keys + `b2b_rate_limit()` (60 req/120s sliding window, V.2.9 M13). API-key generation via `random_bytes(24)` is cryptographically sound. Wired into sidebar (`'brand_voice' => '[dinoco_brand_voice]'` line 698). No major findings — V.2.9 represents mature posture.

### 7. Users-CRM (`[dinoco_admin_users]`) — 1473 LOC

Single write action (`update_inventory`) is the only nonced path; all reads are `manage_options`-gated AJAX. **Finding U-1 (LOW)**: line 24 — `error_reporting(0); @ini_set('display_errors', 0)` silences ALL PHP errors during AJAX, hiding bugs in production. Recommend `error_reporting(E_ERROR)` (still off-screen, but logged) so Sentry/error_log captures fatals.

### 8. LIFF AI Frontend (`[liff_ai_page]`) — 1832 LOC

Loading states (`liff-ai-loading` + spinner) consistent across pages. Dark theme scoped via `.liff-ai-*`. Bottom nav 4 tabs admin / 2 tabs dealer. **Finding LA-1 (MEDIUM)**: Snippet 1 line 184/189 — claim route regex `(?P<id>[a-f0-9]+)` is misleading: claim_ticket CPT uses **integer post IDs** (decimal), not hex. While digits are subset of `[a-f0-9]`, alphanumerics like "1abc" would route incorrectly to `get_post(intval('1abc'))=1`. Tighten to `(?P<id>\d+)`.

### 9. Dashboard root (`[dinoco_admin_dashboard]`) — 5042 LOC

Sidebar wiring is comprehensive — 30+ nav-items map to `module_map` covering BO, Slip Monitor, Flash V.42, B2F trio. Lazy-load via `dnc_lazy_load_module` AJAX with transient cache 30s-300s tiered. `setTimeout` override for auto-refresh works correctly. **Finding D-1 (HIGH)**: only 1 `@media` query in 5042 LOC — sidebar is 300px fixed-width, content `.admin-content` has no responsive breakpoint. Phone view (LINE in-app browser at ~390px) shows clipped sidebar overlapping content. Fix: add `@media (max-width: 768px) { .admin-sidebar { transform: translateX(-100%); } .admin-sidebar.mobile-open { transform: translateX(0); } }` + hamburger toggle.

### 10. Sidebar navigation + tab switching — Cross-cutting

`switchMainTab()` + `data-tab`/`data-subtab` pattern is solid (lines 4135-4155). All 17 entries in `$module_map` correctly map to registered shortcodes. **Finding D-2 (LOW)**: AI Chat link (line 3439) opens external dashboard `https://ai.dinoco.in.th` — no SSO, admin must re-login. Consider passing JWT via query param or use postMessage handshake.

## Cross-Cutting UX

### Modal Adoption Matrix

| File | Native confirm/alert | dinocoModal | Migration % |
|------|---------------------|-------------|-------------|
| B2F Snippet 5 | 15 (with try/catch fallback) | 15 | 100% (paired) |
| Migration Audit | 18 (paired with modal) | 9 | 50% paired |
| Admin Dashboard | 0 | 0 | N/A (no destructive ops) |
| AI Control | 0 | 0 | N/A |
| Brand Voice | 3 | 0 | 0% — needs migration |
| User Management | 0 | 0 | N/A |
| LIFF AI | 0 native | 0 — uses custom liff-ai-* modals | OK |
| Modal Helpers self | 13 (in fallback paths) | 13 | 100% (defensive) |

**Brand Voice 3 native calls** (lines TBD) should be migrated for parity; not destructive but UX inconsistency.

### FSM Visualization Gaps

B2F Snippet 6's 12-state FSM has no admin-visible state diagram. PO Ticket View (Snippet 9) shows linear timeline but doesn't surface "what transitions are available now from current state". Recommend exposing `B2F_Order_FSM::available_transitions($po_id, 'admin')` as buttons on PO detail page, replacing static "Cancel/Receive/Reject" hardcoded buttons.

### Empty/Loading/Error States

| Surface | Empty | Loading | Error |
|---------|-------|---------|-------|
| B2F Orders | ✅ | ✅ | ⚠️ silent retry only |
| B2F Makers | ✅ | ✅ | ✅ |
| B2F Credit | ✅ | ⚠️ no spinner | ✅ |
| Migration Audit | ✅ | ✅ | ✅ (toast) |
| LIFF AI | ✅ | ✅ | ⚠️ generic "เกิดข้อผิดพลาด" |
| Users-CRM | ⚠️ no empty state copy | ✅ | ✅ |

### Mobile Responsiveness

- Admin Dashboard root: **1 @media rule** (broken on mobile)
- B2F Snippet 5: 17 @media rules (good)
- Migration Audit: 67 @media rules (excellent — V.3.12 added)
- LIFF AI: scoped `.liff-ai-*` is mobile-first

## Top 5 Priority Action Items

1. **[HIGH] D-1 — Admin Dashboard mobile breakpoint missing**
   File: `[Admin System] DINOCO Admin Dashboard:1054+` — add `@media (max-width: 768px)` block to collapse sidebar + hamburger toggle. Affects all 30+ admin sub-pages since they all render inside this shell.

2. **[HIGH] AI-1 — `dinoco_admin_ai_control` orphaned**
   File: `[Admin System] DINOCO Admin Dashboard:687-706` — register in `$module_map` + add sidebar nav-item under "AI" section. Currently the panel exists but is unreachable from unified dashboard navigation.

3. **[HIGH] A-1 — mysqldump password leak via `-p<value>`**
   File: `[Admin System] B2F Migration Audit:912-921` — switch to `--defaults-extra-file=` + tempfile + `chmod 0600` to prevent `ps`/auditd password exposure during Phase 4 LIVE migrations.

4. **[MEDIUM] LA-1 — LIFF AI claim regex misleading**
   File: `[LIFF AI] Snippet 1: REST API:184,189` — change `(?P<id>[a-f0-9]+)` → `(?P<id>\d+)` since `claim_ticket` CPT uses integer post IDs. Eliminates ambiguity with MongoDB-style IDs.

5. **[MEDIUM] M-1 — Bulk classification idempotency**
   File: `[B2F] Snippet 5: Admin Dashboard Tabs:~4296` (`confirmAllUnconfirmed`) — include `idempotency_key: crypto.randomUUID()` in payload to prevent double-write under network lag, mirroring existing pattern in `junction-bulk-update-display` endpoint.

## Notes

- B2F Snippet 7 (Credit Manager, 360 LOC) is exemplary — atomic ops, proper FOR UPDATE, audit logging, GET_LOCK. No findings.
- FSM `B2F_Order_FSM` (Snippet 6, 245 LOC) is well-structured. 14 direct `update_field('po_status')` calls in Snippet 2 are all gated `function_exists('b2f_transition_order')` fallback paths — defensible defense-in-depth, but these miss `b2f_order_status_changed` hooks (push notifications, status history).
- Migration Audit V.3.13 phase4 dry-run + LIVE flows correctly use the migrated `dinocoModal.confirm({danger:true})` for the destructive 2-step gate.
- Modal Helpers V.1.1 itself contains intentional native fallback in catch blocks — correct defensive pattern, not a bug.
