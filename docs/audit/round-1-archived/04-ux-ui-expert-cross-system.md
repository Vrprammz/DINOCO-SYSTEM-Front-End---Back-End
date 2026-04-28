# DINOCO Admin UX Audit — Cross-System Findings (Agent 4/4)

**Date**: 2026-04-26 | **Agent**: ux-ui-expert
**Scope**: 25+ admin shortcodes, ~50K LOC of inline UI surveyed via Grep/Read
**Method**: code-grounded — every gap below cites a real file + pattern

## Executive Summary

DINOCO admin is a **desktop-first, sidebar-driven, single-page-style WP shell** with strong feature density but inconsistent UX hygiene. Three structural patterns dominate:

1. **Mobile-blocker** that *intentionally* refuses sub-1024px screens (one `@media` query in 5,042-line dashboard at line 3164)
2. **Partial migration** to `dinocoModal` — Backorder + 9 files migrated in Phase 6, but core dashboard still mixes native `confirm()/alert()` (1 call site found)
3. **Tab-based deep-linking** via `data-tab` + URL hash, used inconsistently (Backorders has it, Slip Monitor doesn't)

Critical UX debt is concentrated in **cross-page workflows**: a single Slip-Monitor overpayment requires admin to context-switch between Slip Monitor → Manual Invoice → Finance Dashboard → LINE bot manually — there is no in-context refund/credit-note tool (verified: 9 `paid_overpayment` mentions but zero refund UI). The Backorder admin shortcode has **endpoints for bulk fulfill/cancel but no checkboxes in the UI** (Snippet 16 V.1.6 explicitly defers — confirmed: 0 `selectAll/bulk-action` matches in 4,282 lines).

## UX Score Per Page (1-5)

| Page | Score | Note |
|------|-------|------|
| Admin Dashboard root | 3.5 | Solid sidebar/breadcrumb (9 hits), no skeletons, no error retry |
| Backorders | 3.0 | Split modal good, no bulk UI, undo window only client-rendered countdown |
| Slip Monitor | 2.5 | No refund tool, status colors clear, manual-process only |
| Service Center | 3.5 | 11 statuses + history, helpers `_scCfm` migrated |
| Finance Dashboard | 3.0 | 3 `@media` (better), but separate from Slip/Invoice |
| B2F Admin Tabs | 3.0 | Maker switcher resets state correctly, accordion good |
| Migration Audit | 2.5 | 5K LOC, dense controls, weak grouping |
| Flash V.42 Go-Live | 4.0 | 5-step wizard with `data-step` indicators, role="tab" |
| Manual Invoice | 3.5 | `_miCfm` migrated (V.33.8) |
| LIFF AI | 3.5 | Bottom nav 4 tabs admin / 2 dealer |

## Workflow Audit (4 user journeys)

### Journey A — Customer slip → debt cleared (4 hops)
LINE bot receives slip → Slip Monitor (auto-verify) → Order auto-paid via FSM → Print invoice (RPi) → Flash ship.

**Friction**: when status = `paid_overpayment` admin must manually open Manual Invoice in another tab to record credit; **no contextual "Issue credit note" button** in Slip Monitor row actions. When verify fails, admin's Manual Process tool requires re-entering distributor/order — no auto-suggest from slip's bank ref.

### Journey B — B2F PO arrival → stock in (5 hops)
Maker LIFF confirm delivery → Admin B2F Orders tab `receive-goods` → `dinoco_stock_add()` (auto via FSM) → `record-payment` → `po-complete`.

**Friction**: receive form remaining-qty fix exists (V.4.x) but admin must scroll between Orders tab → Credit tab to verify payable balance; **no payable summary inside PO ticket view**. `loadMakerProducts` on switch correctly resets state (line 1140).

### Journey C — Customer warranty claim (≥6 hops)
Service Center receive → photo upload → AI analysis → Admin status change (modal) → notify member → Member dashboard reflects.

**Friction**: 11 statuses (pending → closed) but **no Kanban view** — admin reads list + opens detail modal per ticket. Status timeline exists (5 hits for `status_history`) but isn't shown on list page (only inside detail). Service Center has `_scCfm/_scAlert/_scPrompt` helpers (V.30.6) — solid migration.

### Journey D — Onboard new distributor (≥4 hops cross-page)
Admin Dashboard → CPT add → wire `line_group_id` → toggle `bot_enabled` → first test order.

**No onboarding wizard exists**; admin navigates to 4 unrelated screens. CLAUDE.md mentions `import-distributors` REST endpoint — UI exists in B2B Snippet 9 but not first-class.

## Top 15 UX Gaps

| # | Sev | Page | Gap | Fix |
|---|-----|------|-----|-----|
| 1 | C | Slip Monitor | No in-context refund / credit-note action for `paid_overpayment` rows; admin must leave page | Add row action "ออก credit note" → opens Manual Invoice modal pre-filled with distributor + overpay amount |
| 2 | C | Backorders (Snippet 16) | Bulk-fulfill/cancel endpoints live but **zero checkbox UI** (confirmed: no `selectAll` in 4,282 LOC) | Phase 6 work-item: add `<input type=checkbox>` per row + sticky bulk action bar |
| 3 | C | Admin Dashboard | Zero error-retry strings ("ลองใหม่" / retry button) — silent fetch failures | Wrap `dnc_lazy_load_module` AJAX with retry button + toast |
| 4 | C | Admin Dashboard | Mixed `confirm()/alert()` (1 native call site) vs Phase 6 dinocoModal — inconsistent feel | Migrate remaining native calls to `dinocoModal.confirm/alert` (modal helpers V.1.0 ready) |
| 5 | H | All admin pages | No skeleton/shimmer loaders (0 `skeleton/shimmer` matches in dashboard) — long lazy-loads = blank screen | Add skeleton rows in lazy-loaded tabs (200-500ms placeholder) |
| 6 | H | Slip Monitor | No `@media` queries (0 found) — table overflows on narrow desktop | Add `@media (max-width: 1280px)` table compact mode + horizontal scroll affordance |
| 7 | H | Backorders | Split-undo 10-min window has no live countdown timer in admin row | Add `<span data-undo-deadline>` + JS `setInterval` with auto-disable when expired |
| 8 | H | Service Center | List view doesn't show status badge color or aging (status timeline only inside detail) | Add status badge column + `data-age-days` color (≥7d red) |
| 9 | H | Migration Audit | 5,005 LOC, no breadcrumbs/grouped sections within page (Phase 1-4 controls flat) | Group into collapsible sections per phase + sticky phase indicator |
| 10 | H | Finance Dashboard | Separate from Slip Monitor + Manual Invoice — admin context-switches to reconcile | Add cross-link cards "ค้างชำระ N รายการ → เปิด Slip Monitor" |
| 11 | M | All forms | No keyboard shortcuts hint on destructive ops (only `keyboard-hint` widget on dashboard) | Document Cmd+Enter / Esc per modal in helper text |
| 12 | M | B2F Migration Audit | Destructive ops use `confirm()` chain (3 native vs `dinocoModal` per V.3.14) — partial migration | Complete migration (Phase 6 left some) |
| 13 | M | Backorders | "Pending review" badge polls every 60s but visibility-gated only — no pull-to-refresh button | Add manual "🔄 ตรวจใหม่" button beside badge |
| 14 | M | Service Center | No bulk close / bulk reject for completed claims | Add bulk actions parity with Backorder spec |
| 15 | L | Admin Dashboard | Empty-state strings only 9 across 5K LOC — most lists fall to `<tbody></tbody>` blank | Standardise `<EmptyState icon msg suggested-action>` component |

## Cross-Cutting UX Patterns

### State machines (FSM)
B2B + B2F + Claims all have explicit FSM (V.1.6, V.6, 11 claim statuses). UI does **not** consistently visualize allowed transitions — admin sees all status options in dropdown then gets backend rejection.

**Fix**: filter status select by `B2B_Order_FSM::allowed_transitions($current)`.

### Navigation
Sidebar groups (8) → tabs → sub-tabs (Inventory has 8 sub-tabs). Deep-link via `#hash` works in Backorders, Inventory; **broken** in Slip Monitor (no hash sync). Add `window.location.hash` listener pattern from Backorder code.

### Permissions
0 hits for "permission denied" / "ไม่มีสิทธิ์" / 403 strings in dashboard. When `manage_options` fails, REST returns 403 → fetch rejects silently.

**Fix**: global `fetch` wrapper that maps 403 → `dinocoModal.alert('ต้องเป็นแอดมินสูงสุด')`.

### Modals
Phase 6 migrated 75 sites across 9 files. Remaining native calls in Migration Audit (V.3.14 added 7 sites — fine), B2F Snippet 5 (V.7.8 — done), but **Admin Dashboard root + Slip Monitor still mixed**.

### Loading feedback
Long ops (forensic sweep, dip-stock approve, Phase 4 migration, backfill) lack progress UI — only spinner + final toast. No SSE / polling progress indicator. **High pain** for 30s+ ops.

## Top 10 Action Items (Prioritized)

1. **Build Slip Monitor refund/credit-note row action** → cuts Journey A from 4 hops to 1. (`[Admin System] DINOCO Slip Monitor` line ~877 row renderer)
2. **Add bulk checkboxes to Backorders tab** → endpoints already deployed. (`[B2B] Snippet 16` — list render section, before Phase 7)
3. **Global fetch error wrapper** → standardise 403/500 + retry. (`[Admin System] DINOCO Admin Dashboard` — top of `<script>` block)
4. **Split-undo live countdown** → reduces accidental abandonment. (`[B2B] Snippet 16` row template)
5. **Service Center status column + aging color** → list scannability. (`[Admin System] DINOCO Service Center & Claims` list render)
6. **Skeleton loaders for lazy-loaded modules** → removes blank-screen flash. (`dnc_lazy_load_module` AJAX path)
7. **Cross-link cards Finance ↔ Slip ↔ Manual Invoice** → reduces tab juggling. (`[Admin System] DINOCO Admin Finance Dashboard` header)
8. **FSM-aware status dropdowns** → filter only valid transitions. (Order detail modals, B2B + B2F + Claims)
9. **Distributor onboarding wizard** → 4 hops → single 5-step page. New shortcode `[dinoco_admin_onboard_distributor]`.
10. **Complete dinocoModal migration in Admin Dashboard root + Slip Monitor** → consistent destructive-op UX.

## Cross-Agent Flags

- **`feature-architect`**: Refund/credit-note workflow + onboarding wizard need feature spec.
- **`frontend-design`**: Skeleton loader component + EmptyState component + status-badge component should land in `liff-src/shared/` and back-port to admin via dist build.
- **`browser-tester`**: Confirm 403 paths + Backorder undo countdown + Slip Monitor `paid_overpayment` row interactivity.
- **`data-research`**: Bilingual error microcopy review — current Thai-only error strings could confuse during 401/403 (where backend returns English).
- **`diagram-generator`**: Visualize FSMs (B2B order, B2F PO, Claim) as admin-facing reference card embedded in detail modals.

## Files Referenced (absolute paths)

- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Admin Dashboard` (5,042 LOC; 1 `@media`, 9 empty-states, 0 retries)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Slip Monitor` (1,473 LOC; 0 `@media`, no refund UI; `paid_overpayment` row at L877)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[B2B] Snippet 16: Backorder System` (4,282 LOC; 0 bulk checkboxes; `dinocoModal` migration at L2961-2986)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] Flash Shipping V.42 Go-Live Tool` (1,713 LOC; 5-step wizard at L998-1002 — gold standard)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Service Center & Claims` (3,479 LOC; 4 `@media`; status_history hooked but list bare)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Admin Finance Dashboard` (3,573 LOC; 3 `@media`; isolated from Slip/Invoice)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[B2F] Snippet 5: Admin Dashboard Tabs` (4,820 LOC; `loadMakerProducts` reset L1140 — correct)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] B2F Migration Audit` (5,005 LOC; flat sections — needs grouping)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Modal Helpers` (605 LOC; V.1.0 — adoption ~70% across admin)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Manual Invoice System` (5,136 LOC; `_miCfm` V.33.8 migrated)
