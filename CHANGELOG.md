# Changelog

ประวัติ test infrastructure + quality gate ของ DINOCO System.
ไม่ใช่ user-facing changelog — เน้น dev/QA history.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) (loosely).
Snippet versioning ของ feature changes ดูใน individual snippet headers (`Version: V.X.Y`).

---

## [Unreleased]

### Refactor + Docs — Round 8 UX-H3 Phase 5 (dynamic compound delegation) + B2B/B2F lifecycle Mermaid (2026-04-30)

2 commits closing 1 UX-H3 batch + 1 docs gap. Risk: LOW-MEDIUM (UX-H3 dynamic) + NONE (docs).

**ITEM A — UX-H3 Phase 5: dynamic compound onclick delegation (B2F Snippet 5 V.8.4 → V.8.5, commit `d55810c`)**

~30 onclick sites migrated across 3 modules — leverages existing card root `data-*` attributes for arg passing, eliminates inline-encoded args + `esc()/replace(/'/g,...)` escapes for Thai PO numbers + maker names.

**Orders module (~22 sites)**:

- 7 static buttons: `orders-open-create-modal`, `orders-bulk-select-all`, `orders-open-bulk-cancel-modal`, `orders-submit-create-po`, `orders-submit-receive`, `orders-submit-payment`, `orders-execute-bulk-cancel`
- Outer card click: `orders-go-to-ticket` (reads `data-po-id` from card root)
- 2 stopProp+fn: `orders-card-checkbox` + `orders-card-cancel`
- 8 PO action buttons: `orders-card-detail/edit/resubmit/receive/reject-lot/pay/complete/reorder` (read PO id+number from `.b2f-po-card[data-po-id]` ancestor via `_readPoFromCard` helper)
- 1 stopProp wrapper: `orders-stop-prop-noop` on `.b2f-po-actions` (no-op handler catches gap clicks — defense-in-depth)
- Pagination: 3 sites (`orders-page` + `data-page`)
- Qty stepper: 2 sites (`orders-adjust-qty` + `data-delta`)

**Makers module (~9 sites)**:

- 3 maker card buttons: `makers-card-edit/products/delete` (read m.id/m.name/m.currency from `.b2f-maker-card[data-mid]` via `_readMakerFromCard`)
- Confirm-all banner: `makers-confirm-all` + `data-mid`
- Confirm-pill: `makers-confirm-sku` + `data-mid+data-sku`
- Jump-to-primary span: `makers-jump-to-primary` + `data-jump-id+data-sku`
- Delete-product button: `makers-delete-product` + `data-pid+data-sku`
- Add-missing-leaves: `makers-add-missing-leaves` + `data-top-sku`
- Remove-price-item: `makers-remove-price-item` + `data-sku`
- Remove-blacklist: reads from existing `.bl-item[data-mid][data-sku]` ancestor (already had data attrs from V.6.5)

**Credit module (~4 sites)**:

- 4 credit card buttons: `credit-card-history/payment/unlock/hold` (read m.id/m.name/debt from `.b2f-credit-card[data-mid]` via `_readCreditFromCard`)

**Pattern**: `closest('[data-action]')` walks UP from event target — child action buttons match BEFORE outer card, so card's go-to-ticket fires only when click hits non-action area (PO number, badges, meta). Defense-in-depth: `orders-stop-prop-noop` wrapper on `.b2f-po-actions` catches gap/padding clicks.

**Behavior preservation**: identical function calls + arg semantics. Async functions (cancelPO/resubmitPO/rejectLot/completePO) work fire-and-forget. PHP lint clean.

**Cumulative tally**: 19 (P1) + 24 (P2) + 20 (P3) + 19 (P4) + ~30 (P5) = **~112 of 124** UX-H3 sites migrated (~90%). Remaining ~12 sites: deferred dynamic stopProp on SET header structure (lines 3790/3816/3824) + onchange/oninput patterns (separate event class, not in UX-H3 scope).

**ITEM B — Lifecycle Mermaid diagrams (WORKFLOW-REFERENCE.md, commit `8fbbb61`)**

1 NEW + 1 EXPANDED stateDiagram-v2 — both verified 1:1 against actual code FSM `$transitions` arrays.

**Section 2.5 NEW — B2B Order Lifecycle (Full FSM)**:

- 16 states + 38 transitions covering legacy stock-check + walk-in + BO opaque-accept (`pending_stock_review` → `partial_fulfilled`) + cancel_request + change_request + claim flow
- Includes "completed → cancelled" walk-in only edge
- Atomic Guards section (V.1.8 Phase 4d Transaction Wrapper GET_LOCK + correlation_id chain)
- Transition Rules Table mapped 1:1 with `B2B_Order_FSM::$transitions` (Snippet 14 V.1.8)
- Multi-actor labels (`customer/admin/system/any`) per actual code

**Section 4 UPDATED — B2F PO Lifecycle (renamed from "FSM Diagram (State Machine)")**:

- Added 6 missing transitions per actual V.1.7 code:
  - `delivering → delivering` (Maker ส่งของเพิ่ม self-loop)
  - `partial_received → confirmed` (reject reship)
  - `received → confirmed` (QC reject reship)
  - `partial_paid → completed` (write-off)
  - `partial_paid → cancelled` (rollback debt)
  - `paid → cancelled` (admin cancel after payment)
- Added Atomic Guards section (V.1.7 Phase 4d wrapper)
- Multi-currency immutability note + cancel rollback semantics (stock_add per-leaf + payable_subtract THB × snapshot rate)

**TOC updated** for renamed/new sections. Pure docs — no code touched.

**Files touched (2)**:

- `[B2F] Snippet 5: Admin Dashboard Tabs` V.8.4 → V.8.5 (210+ insertions / 40 deletions — UX-H3 Phase 5 + 3 helper functions)
- `WORKFLOW-REFERENCE.md` (273 insertions / 55 deletions — section 2.5 NEW + section 4 expanded + TOC update)

**Deferred to Round 9+**: 5 dynamic stopProp on SET header structure (lines 3790 toggleSet onclick + 3816 _stopInput template + 3824 set-inputs container) + onchange/oninput patterns (~10-15 sites, separate event class).

---

### Refactor — Round 7 UX-H3 Phase 4 (stopProp + compound delegation) + PERF cache priming round 3 (2026-04-29)

2 commits closing 2 audit items. Risk: LOW (additive same-behavior refactor + pure cache priming).

**ITEM A — UX-H3 Phase 4: stopProp + compound close-and-call delegation (B2F Snippet 5 V.8.3 → V.8.4, commit `7912225`)**

19 onclick sites migrated (11 static stopProp + 8 compound close-and-call):

(1) **Static stopPropagation containers — 11 sites**:

- Orders module 5 (modal-create-po, modal-receive, modal-payment, modal-detail, modal-bulk-cancel)
- Makers module 4 (modal-maker, modal-products, modal-bulk-audit-delete, modal-blacklist-viewer)
- Credit module 2 (modal-credit-history, modal-credit-pay)

Replaces inline `onclick="event.stopPropagation()"` with `data-stop-prop="1"` attribute.
Single page-level initializer (`_b2fStopPropBound` guard) attaches element-level click
handler to each match. **Element-level (not document-delegated)** because document capture
would prevent ALL nested click handlers. Backdrop close still works via existing
`e.target === bd` check.

(2) **Compound close-and-call (PO Detail action buttons) — 8 sites**:
Migrates `onclick="closeModal('b2f-modal-detail');B2F_Orders.fn(args)"` to
`data-action="orders-close-and-call"` + `data-modal-target` + `data-fn` + `data-args`.
Functions: `editPO, resubmitPO, openReceive, openPayment, rejectLot, completePO, cancelPO,
reorderPO`. Args passed as `JSON.stringify`-encoded array, `esc()`-escaped for HTML
attribute (Thai PO numbers safe). Delegation handler in `B2F_Orders` IIFE parses with
`JSON.parse` + dispatches via `window.B2F_Orders[fnName].apply(args)`. **Function whitelist**
`_ORDERS_CLOSE_AND_CALL_FNS` (8 keys) prevents arbitrary fn dispatch — security guard.
Behavior preservation: closeModal runs FIRST then fn — same execution order as legacy
compound onclick semicolon chain.

Total `onclick=` sites migrated: 19 + 24 + 20 + 19 = **82 of 124**. Remaining ~42:

- Dynamic stopProp+function compounds (5 sites: 1110/1115 PO checkbox+cancel, 3612 confirm
  pill, 3722/3730 set-inputs container) — defer to Round 8
- Misc inline onclick on form steppers + dynamic PO card row handlers

Risk: LOW for stopProp (defense-in-depth, backdrop close path unchanged) + LOW-MEDIUM
for compound (whitelist gate + JSON.parse fail-safe abort). PHP lint clean. JS syntax
clean (3 script blocks parse OK after stripping PHP).

**ITEM B — PERF cache priming sweep round 3 (B2B Snippet 5 V.33.2 → V.33.3 + Snippet 12 V.31.5 → V.31.6, commit `2882e10`)**

Investigated 4 list endpoints — Slip Monitor (V.1.1 M-4 already optimized via
`dinoco_slip_monitor_get_dist_names_batch`), Manual Invoice (`_dinoco_inv_get_pending_invoices`
already calls `update_postmeta_cache`), B2F po-history (V.11.9 already primes maker postmeta) —
all 3 candidates from Round 7 brief skipped because already optimized.

Real opportunities found in B2B admin dashboard renderers — distributor postmeta NOT primed
when accessed via `b2b_get_dist_by_group($gid)` inside per-order loops:

(1) **B2B Snippet 5 main admin dashboard render** — `foreach($orders as $o)` reads
`get_field('shop_name', $dist->ID)` per order. WP_Query primes `b2b_order` metas but NOT
distributor metas. Per-page render: 50 orders × ~10-15 unique distributors. Fix: pre-resolve
$dist objects via static cache hit, collect IDs, batch `update_meta_cache('post', $od_dist_ids)`
before render loop. Saves ~10-30 cold meta reads per page render.

(2) **B2B Snippet 12 Admin LIFF (3 sites)**:

- `[b2b_tracking_entry]` shortcode: 50 awaiting-shipping orders × 6 metas/dist (shop_name,
  dist_address, dist_district, dist_province, dist_postcode, dist_phone) = ~60-90 cold reads
- BO ticket map: 20-50 BO tickets × 1 meta / ~10 unique dists = ~30 cold reads
- Recently shipped today: 20 shipped × 1 meta / ~6 dists = ~6 cold reads

Pattern: pre-resolve via `b2b_get_dist_by_group()` (static cache), collect `$d->ID` values,
`array_unique` + `array_filter`, single `update_meta_cache` call. Mirrors B2F V.11.9 / Round 5
sweep / Round 2 priming pattern. Idempotent — `b2b_get_dist_by_group` caches resolved $dist
objects; pre-warm doesn't double-fetch. No business logic change — pure cache priming.

PHP lint clean (both files).

### Refactor — Round 6 UX-H3 Phase 3 (closeModal delegation) + Workflow Diagrams (2026-04-29)

2 commits closing 2 audit items. Risk: LOW (additive same-behavior refactor + pure docs work).

**ITEM A — UX-H3 Phase 3: closeModal delegation (B2F Snippet 5 V.8.2 → V.8.3, commit `1d1ba6d`)**

20 inline `onclick="B2F_*.closeModal('id')"` sites migrated to
`data-action="modal-close"` + `data-modal-target="<id>"` pattern. Per-module
delegation handlers extended (Orders 9 + Makers 8 + Credit 3 = 20 sites total).

Each branch is scoped via `.closest('.b2f-modal-backdrop')` ID match against
per-module whitelist (`ordersIds` / `makersIds` / `creditIds`) — prevents
cross-module fire when 3 delegation handlers see the same `data-action='modal-close'`
signal. Behavior preservation: identical to legacy onclick (DOM `removeClass('open')`
via existing `closeModal()`). `closeModal` functions intact in all 3 module
IIFEs and still exposed via `window.B2F_*.closeModal` for backward compat with
dynamic detail-modal action buttons (line ~1702-1726, deferred to Round 7+
as compound onclick with id+name args).

Total `onclick=` sites migrated: 19 (Phase 1) + 24 (Phase 2) + 20 (Phase 3) =
**63 of 124**. `stopPropagation` containers (11 static + 6 dynamic) deferred —
element-level handler is required for backdrop-click semantics (event must stop
BEFORE bubbling reaches backdrop; document-level delegation fires too late).

PHP lint clean. Modal IDs cross-checked against actual `<div class="b2f-modal-backdrop" id="...">`
elements (11 modals total — all whitelisted correctly).

**ITEM B — Workflow Mermaid diagrams (commit `8a12728`)**

3 NEW Mermaid diagrams added to `WORKFLOW-REFERENCE.md` to fill visual coverage
gaps for text-only flows. Pure docs work — zero code changes, no runtime risk.

1. **§2.3.1 Slip Verification Sequence Diagram** (sequenceDiagram) — 6 participants
   (Customer/LineG/Bot/Slip2Go/DB/AdminG), 2 nested `alt` blocks for B2B customer
   + B2F maker flows, foreign currency PO note (CNY/USD skips Slip2Go),
   implementation refs (Snippet 2/3, `B2B_SLIP2GO_SECRET_KEY`, atomic txns).

2. **§10.5.1 Dip Stock Cycle State Diagram** (stateDiagram-v2) — 5 states
   (`not_started → counting → variance_review → approved/force_closed/expired`),
   cron auto-expire edge (>48h), state transitions table (6×4), V.39.0 leaf-only
   guards (DD-2).

3. **§7.2.1 LIFF AI Lead Pipeline State Diagram** (stateDiagram-v2) — 11 states
   covering `lead-pipeline.js` V.2.0 transitions, auto-followup cron note (4h),
   trigger triggers table (6 source types), FSM authority ref
   (`updateLeadStatus()`), backward compat note (3 V.2.0 statuses additive only).

Mermaid block balance verified (8 starts ↔ 8 closes). Both new tables use
spaced separator format (MD060 lint clean).

**Round 6 Cumulative Status (post-Round 5 backlog drain)**:

- Round 1-5 closed: 12 items (BO V.3.0, PERF sweeps, Flag Audit Log, Wave 3 UI gaps 3+4+5, UX-H3 Phase 1+2)
- Round 6 closes: 2 items (UX-H3 Phase 3 + Workflow Diagrams)
- Total UX-H3 sites closed: 63/124 (51%) — remaining 61 = 11 stopProp static
  (defer — backdrop semantics need element-level), 30 dynamic onclick (PO cards
  / SKU rows with id+name args — needs careful data-attr escaping), 20 misc.

### Refactor — Round 5 UX-H3 onclick → Event Delegation + PERF Sweep Round 2 (2026-04-29)

3 commits closing 2 deferred audit items. Risk: LOW (additive — same behavior,
cleaner code + better CSP-readiness; no business logic touched).

**ITEM A — UX-H3 onclick → delegation refactor (B2F Snippet 5 V.8.0 → V.8.2)**

43 of 124 inline `onclick=` sites in `[B2F] Snippet 5: Admin Dashboard Tabs`
migrated to single-listener event delegation pattern.

Phase 1 (commit `1b915ce` V.8.1) — B2F_Orders module (19 sites):
- 9 status tabs (`data-action="orders-filter-tab"` + `data-status`)
- 5 KPI cards (same data-action, distinguishes via data-status)
- 5 mode filter chips (`data-action="orders-mode-chip"` + `data-mode`)
- Delegated listener inside Orders IIFE with idempotent guard
  `_b2fOrdersDelegationBound` calls existing `filterByTab()` / `setModeFilter()`.

Phase 2 (commit `9d63d30` V.8.2) — B2F_Makers + B2F_Credit (24 sites):
- B2F_Makers (23): 3 source filter chips + 5 picker type chips + 2 view mode
  + 2 quick shipping + 11 standalone action buttons (open create modal, save
  settings, submit maker, open bulk delete, open blacklist, batch save, open
  product picker, close picker, confirm picker, back to picker, submit
  selected, execute bulk delete)
- B2F_Credit (1): submit payment button
- Per-module delegated listeners with `_b2fMakersDelegationBound` /
  `_b2fCreditDelegationBound` guards. No cross-module interference (each
  filters by action prefix).

CSP-friendly: no `unsafe-inline` script-src needed for migrated batch.
Behavior preservation: all chips still toggle `.active`, all buttons call
same internal functions. window.B2F_*.* APIs intact for backward compat.
Dynamic-rendered handlers (PO cards, SKU rows with id/name args) deferred —
covered by future batches. PHP lint clean.

**ITEM B — PERF cache priming sweep round 2 (commit `e879caf`)**

Extends Round 2 sweep (commit `920b3ac`) to admin REST endpoints with
cross-referenced postmeta N+1 patterns:

`[B2F] Snippet 2: REST API` V.11.8 → V.11.9:
- `b2f_rest_po_history()` (admin, per_page up to 100): WP_Query auto-primes
  `b2f_order` postmeta but NOT cross-referenced `b2f_maker` postmeta.
  `b2f_format_po_detail()` reads `maker_name` + `maker_credit_term_days`
  per PO → N×2 cold reads with many distinct makers. Fix: pluck po IDs →
  walk po_maker_id from primed cache → unique maker_ids →
  `update_meta_cache('post', $maker_ids)` once. Expected p95 200-400ms →
  50-100ms on history with 50+ POs spanning 5+ makers.
- `b2f_rest_maker_po_list()` (Maker LIFF, per_page=50): JWT-scoped to one
  maker, prime ensures first iteration cache-warm (eliminates 2 cold reads
  on first PO).

`[LIFF AI] Snippet 1: REST API` V.1.8 → V.1.9:
- `liff_ai_rest_claims()`: 7× `get_field()` per claim_ticket. WP_Query
  auto-primes by default → mostly no-op today. Defense-in-depth prime
  guards against future refactor disabling cache_results.

All changes additive — empty result sets skip the prime. Backward compat
preserved.

**Files Touched (3)**:
- `[B2F] Snippet 5: Admin Dashboard Tabs` V.8.0 → V.8.2
- `[B2F] Snippet 2: REST API` V.11.8 → V.11.9
- `[LIFF AI] Snippet 1: REST API` V.1.8 → V.1.9

**Commits**: `1b915ce`, `9d63d30`, `e879caf`

### UI — Round 4 Wave 3 UI Polish (2026-04-29) — B2F V.7.0 Order Intent UX (Gaps 3+4+5)

3 commits closing Wave 3 UI gaps surveyed in Round 3. All flag-gated by
`b2f_flag_order_intent` (default OFF in V.7.0 spec, ON since 2026-04-17).
Risk: LOW — display + a11y layer only, no API contract change.

**Gap 3 — Maker LIFF PO list mode-summary badge**
(`[B2F] Snippet 4: Maker LIFF Pages` V.4.5 → V.4.6):

- New JS helper `modeSummaryHtml(po)` iterates items[], counts qty per
  `poi_order_mode`, returns compact 3-mode breakdown HTML or `""` for
  legacy POs (no order_mode).
- Output: `🟣 5  🟠 3  ⚪ 2` (mixed) or `🟣 ทั้งหมด ชุดเต็ม (10)` (single mode).
- 3-lang labels (TH/EN/ZH) via L() helper for THB/USD/CNY currency makers.
- Inserted in renderListPage() PO card after po-total, before status badges.
- PHP wires flag via new `$b2f_order_intent_js` variable in `b2f_liff_page_js()`
  using `dinoco_config()` with `get_option` fallback.
- CSS scoped under `.b2f-po-card`: `.po-mode-summary` flex container,
  `.po-mode-pill.{full-set,sub-unit,single-leaf,all-mode}` color variants.
- Defensively ignores intent_notes (admin-only — API strips for Maker JWT).

**Gap 4 — SET Detail mode toggle compact-on-scroll**
(`[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.9 → V.7.10):

- When user scrolls overlay > 100px, toggle shrinks to maximize content area:
  margin 12→6px, padding 10→4px vertical, font 13→12px, min-height 44→32px.
- Smooth 200ms transition (margin/box-shadow/padding/font-size/min-height).
- rAF-throttled scroll listener on `$setDetail` (overlay scroll container).
- Single-init pattern (`_setDetailScrollListenerAttached` flag) — listener
  bound once per session, persists across SET re-opens.
- `passive: true` (non-blocking scroll for smooth iOS momentum).
- `closeSetDetail()` cancels pending rAF + removes `.scrolled` class
  (clean slate for next overlay open).
- Tap target stays ≥ 32px (Apple HIG min, WCAG AA acceptable).
- Flag-gated `ORDER_INTENT_ENABLED` (no-op when OFF — toggle isn't injected,
  listener init is skipped naturally).

**Gap 5 — Cart Submit Review Gate WAI-ARIA tabs pattern**
(`[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.10 → V.7.11):

- Modal root: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` to
  stable header id.
- Tablist wrapper: `role="tablist"` + `aria-label` + `aria-orientation="vertical"`.
- Bucket headers: `role="tab"` + id + `aria-controls` + `aria-selected` +
  `aria-expanded` + tabindex (roving 0/-1) + `data-bucket-tab`.
- Bucket bodies: `role="tabpanel"` + id + `aria-labelledby` + `tabindex="0"`
  (focusable for screen reader) + `hidden` attribute when closed.
- Total row: `role="status"` + `aria-live="polite"` — screen reader
  announces total when buckets toggle.
- Arrow span: `aria-hidden="true"` (decorative).
- Keyboard nav (new helper `bindReviewTablistA11y(visibleBuckets)`):
  - ArrowDown/ArrowRight → next visible tab (wraps)
  - ArrowUp/ArrowLeft → prev visible tab (wraps)
  - Home → first tab; End → last tab
  - Enter/Space activate native (not intercepted)
- Architectural cleanup: removed inline `onclick="..."` from V.7.0 (XSS
  surface reduced). Replaced with event delegation in tablist handler.
- Buckets independent (not radio) — each opens/closes individually;
  aria-selected reflects "is panel currently visible" (hybrid pattern).

**Files** (3 commits, +266/-19 LOC):

- `[B2F] Snippet 4: Maker LIFF Pages` V.4.5 → V.4.6 (+85/-1)
- `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.9 → V.7.11 (+200/-19 across
  V.7.10 + V.7.11)

**Commits**: `b997598` (Gap 3) + `20d6ed2` (Gap 4) + `69a62f4` (Gap 5)

### Audit — Round 3 Pending Items Sprint (2026-04-29) — Flag Audit Log NEW snippet

NEW snippet **`[Admin System] DINOCO Flag Audit Log` V.1.0** — centralized
audit trail for ALL feature-flag and config-key toggles across DINOCO. Closes
the "ใครเปลี่ยน flag X เมื่อไหร่?" incident-debug pain point.

- **Schema**: `wp_dinoco_flag_audit` (lazy `dbDelta` install, version-gated).
  11 columns including `flag_name` VARCHAR(64), `old_value`/`new_value`
  VARCHAR(255), `user_id`, `source` (admin_ui/rest_api/cron/cli/etc),
  `reason`, `request_ip`, `user_agent`, `request_id` (correlation with
  Observability snippet), `changed_at`. 3 indexes (flag_name, changed_at,
  user_id) optimize common queries.
- **Helper API**: `dinoco_flag_audit_log($flag, $old, $new, $reason, $source)`
  with no-op short-circuit (old===new strict and serialized strict comparison),
  automatic PII context inheritance, and lazy schema install on first call.
  Best-effort non-throwing pattern (mirrors Audit Log V.1.0 design).
- **Convenience wrapper**: `dinoco_flag_set($flag, $val, $reason, $source)`
  — atomic update_option + audit log + bool→'0'/'1' normalization.
- **Passive listener**: `updated_option` action hook auto-captures changes
  to a curated whitelist (16 flags: BO, V.33.5 hotfixes, Flash V.42, B2F
  V.7.0/migration, Observability, GDPR). Filter `dinoco_flag_audit_tracked_flags`
  lets future snippets register flags without modifying this file. Per-request
  dedup guard prevents duplicate rows when explicit + passive both fire.
- **Admin viewer UI**: `[dinoco_flag_audit_viewer]` shortcode — filterable
  table (by flag/source/user/days), pagination 50/page, color-coded delta
  badges (red old → green new), source-tag chips, per-row IP/UA, refresh +
  CSV export.
- **REST API** under `/dinoco/v1/flag-audit*`: list with filters, single by
  ID, manual retention trigger, CSV export (UTF-8 BOM, 5K row cap).
- **Retention cron**: `dinoco_flag_audit_retention_cron` daily 03:00, 90-day
  default (configurable 30-365 via `dinoco_flag_audit_retention_days` option),
  chunked 1000/iter × 20 max iters per run.
- **Wiring** (3 explicit call sites — function_exists() guarded):
  - `[B2B] Snippet 16` V.3.1 — `[b2b_bo_flags]` shortcode wraps existing
    update_option calls (3 flags + beta_distributors array). Existing
    b2b_log() text logging preserved (dual-write).
  - `[Admin System] B2F Migration Audit` V.3.19 — `POST /feature-flags/toggle`
    REST endpoint adds audit_log call. Existing `b2f_log_flag_change()` text
    log preserved (dual-write).
  - `[Admin System] Flash Shipping V.42 Go-Live Tool` V.1.9 — `POST /flip-flag`
    endpoint adds audit_log call. Existing wp_dinoco_flash_audit row preserved.
  - **NOTE**: `[B2B] Snippet 1`'s `dinoco_set_shipping_flag()` helper is NOT
    explicitly wired (sensitive snippet — no edits permitted). The passive
    `updated_option` listener captures it automatically.
- **Tests**: `tests/helpers/FlagAuditTest.php` (21 cases — serializer null/bool/
  int/float/string/array/object/long/unicode, no-op detection strict and serialized,
  and edge cases). All pass; full suite (131 tests, 208 assertions) green.
- **Risk**: LOW — additive snippet (no existing logic change). function_exists()
  guards at every call site. Lazy schema install. Silent fail-soft if table
  missing. Idempotent re-saves (no-op short-circuit).
- **Files**: NEW `[Admin System] DINOCO Flag Audit Log` V.1.0 +
  `tests/helpers/FlagAuditTest.php` + 3 wiring updates (Snippet 16 V.3.1,
  B2F Audit V.3.19, Go-Live V.1.9).

### Performance — PERF cache priming sweep (2026-04-29) — Snippet 3 V.42.8

Round 2 sprint follow-up to Snippet 16 V.2.9 cache priming pattern.

**`[B2B] Snippet 3` V.42.8** (Round 2 sprint):

- `b2b_rest_admin_shipping_queue` — primes order post + meta cache for both
  pending list (paid/awaiting_payment) and recent shipped (today × 20). Pre-resolves
  unique distributors via `b2b_get_dist_by_group` static cache + primes their post
  object + meta cache. Loop body uses `$dist_map` lookup with original-call fallback.
  Eliminates ~5-6 SQL queries per row (~330 queries saved on typical 50-order pending,
  20-order recent payload).
- `b2b_rest_admin_bo_tickets` — same priming pattern for backorder tickets list.
  ~40-80 SQL queries saved on typical 10-20 row response.
- Pattern: `_prime_post_caches` and `update_meta_cache` (mirrors Snippet 16 V.2.9,
  Snippet 3 V.41.5 `/order-history` priming). Both patterns gated with
  `function_exists` guard (defensive — always exists in WP core).
- **Pure additive** — no API contract change, no behavior change. Original
  null-safety chain preserved for empty `$gid` and `Private_Chat` edge cases.

### Audit — Phase 6 Modal Migration (2026-04-29) — comprehensive grep

- Round 2 sprint comprehensive grep of `confirm()`/`alert()`/`prompt()` sites in
  `*.php` + `*.html` (excluding `node_modules`, `.second-brain`, `dist`, `venv`,
  `presentation`, `liff-src`, `tests/e2e`, `rpi-print-server`):
- **0 production sites remaining** — Phase 5 (commits `1404b85..d2cf413`) +
  Phase 6 (commits `7a9e90d..cfc453f`) closed 75 sites already.
- 4 confirm + 2 alert hits = `tests/e2e/fixtures/modal.html` (intentional test
  fixture validating modal API itself).
- 2 confirm hits = `rpi-print-server/templates/manual_ship.html` (out-of-scope:
  RPi flask+jinja runtime, no `dinocoModal` helper, warehouse touchscreen native
  confirm acceptable).
- Earlier estimate "~67 sites remaining" was stale; queue is closed.

### Added — BO Queue UX V.3.0 (2026-04-29) — Bulk ops + Manual ETA + docs

Closes 2 deferred-low-priority items from `FEATURE-SPEC-B2B-BACKORDER-2026-04-16.md`.
Backend endpoints existed since V.1.6 — V.3.0 ships the missing Admin Dashboard UI.

**Snippet 16 V.3.0** (`0542230`):
- Per-row checkbox column + select-all in `<thead>` + sticky bulk-action bar
  (✅ จัดส่ง / ❌ ยกเลิก / ล้างการเลือก) shown only when ≥1 row selected
- `📅 ETA` button per pending/ready row → `dinocoModal.prompt` for days (0-90) +
  optional admin note appended via `|` separator
- Selection state preserved via `Set<bo_queue_id>` across `loadQueue()` refresh,
  cleared on filter change
- Pattern reuse: `dinocoModal.confirm/alert/prompt` with try/catch native fallback
  (V.1.14/V.1.15 modal migration); `esc()` XSS-safe interpolation; scoped CSS
  `.b2b-bo-admin` namespace + mobile `@media (max-width: 768px)` breakpoint
- Per-item error reporting via `results.errors[]` (V.1.11 contract)

**Docs** (`a0b4dc7`):

- `WORKFLOW-REFERENCE.md` § 2.10.6 V.3.0 Bulk Operations + Manual ETA flow
- `WORKFLOW-REFERENCE.md` § 2.10.7 BO FSM State Diagram (Mermaid stateDiagram-v2)
  visualizing 2 new states (pending_stock_review, partial_fulfilled) + 8 new
  transitions + transition guards (invariant, undo deadline, walk-in bypass)
- NEW `B2B-BACKORDER-REGRESSION-MANIFEST.md` — 75 scenarios across 8 sections:
  Core opaque accept (10) + Admin split (10) + Restock cycle (10) + Bulk ops
  V.3.0 (8) + FSM transitions (5) + Security (8) + Performance (5) + Config +
  Modal + DB schema (15)

**Backend**: zero changes — endpoints `/bo-bulk-fulfill`, `/bo-bulk-cancel`,
`/bo-update-eta` validated since V.1.6. cancelled/fulfilled rows omit checkbox
and ETA button (readonly state — backend status guard returns invalid_status).

### Fixed — Flash V.42 deep audit (2026-04-29) — 8 findings closed

api-specialist + feature-architect agents dispatched for full audit of Flash V.42
implementation vs `FEATURE-SPEC-FLASH-SHIPPING-META-2026-04-17.md`.

**P0 (commit `41ddc5d`)**:
- **G1** — admin "Flash Create" REST routed via `b2b_flash_dispatch_create_all()`
  instead of bypassing dispatcher (Snippet 5 V.33.2 + Snippet 9 V.34.0)
- **G2** — 1003 (duplicate outTradeNo) idempotent recovery via `mchPno` query +
  regenerate fallback (Snippet 1 V.34.21)

**P1 follow-ups (commit `0a28359`)**:
- **B5** — audit row trace fields `original_out_trade_no` + `g2_attempts` +
  `g2_outcome` for 1003 post-mortem
- **D3** — REG-069 + REG-070 regression scenarios

**P1 (commit `7f49c0d`)**:
- **G3** — removed broken BO secondary fallback that called
  `b2b_flash_create_order($order_id, array(...))` with array→int(1) coercion
  (Snippet 16 V.2.8)
- **G4** — async snapshot defer via `wp_schedule_single_event` (HIGH-2 closed
  from Round 4-8 audit; Snippet 1 V.34.23)

**Deep audit (commit `ae60b47`, Snippet 1 V.34.24)**:
- **BUG-2 CRITICAL** — `subParcel` JSON encoding (multi-box ticket signature
  mismatch). Pre-fix sent PHP nested array → `b2b_flash_sign()` cast `(string)$v`
  = literal `"Array"` while wp_remote_post serialized actual structure → Flash
  hash mismatch on every multi-box order. Fix: `wp_json_encode($sp_array)` per
  Flash spec line 209
- **BUG-1 CRITICAL** — `insureDeclareValue=''` undefined behavior. Fix: omit
  field when not insured (V.42 + V.41 paths)
- **ISSUE-5 HIGH** — V.41 path missing 7 returnXXX fields (walk-in tickets
  ตีกลับไปโกดังแทนบริษัท). Fix: added `b2b_registered_address` 7 fields
- **ISSUE-6 HIGH** — V.41 articleCategory default 99 → 6 (align V.42 default)

**Tests**: REG-069..079 added (11 new scenarios) in
FLASH-SHIPPING-V42-REGRESSION-MANIFEST.md.

### Documentation — Flag name drift fix (2026-04-29)

Synced `FEATURE-SPEC-FLASH-SHIPPING-META-2026-04-17.md` flag references from
incorrect `dinoco_flag_shipping_meta_enabled` to actual `dinoco_shipping_meta_enabled`
(matches code in CLAUDE.md line 318 + Snippet 1 + dispatcher). 10 occurrences
across spec sections §10/§17.2/§22.

### Fixed — Manual Ship V.44.3 defensive UX patch (2026-04-29, commit `14fc1e1`)

User reported: "ขึ้น 1/1 → ไม่มี PNO → ไม่เกิดอะไรขึ้น" (silent failure).
fullstack-developer diagnosed `if (data.success)` accepted truthy values
without `pno` field → JS pushed undefined to `createdPnos` array → "1/1 สำเร็จ"
banner with empty PNO area + no print fired → button reset silently.

- Strict success check: `data.success === true && data.pno` (was loose truthy)
- Catch-all UI when both `createdPnos` + `errors` arrays empty (3-step
  troubleshoot hint: RPi pull, WP endpoint reachable, dashboard.py log)
- try/catch fall-through writes to result-box (was just toast which can be
  missed/dismissed)

File: `rpi-print-server/templates/manual_ship.html` V.44.2 → V.44.3.
Pure UX hardening — no API contract change.

### Fixed — Snippet 1 V.34.25 — code-reviewer audit (G2 + PII mask dead code)

code-reviewer post-`ae60b47` audit found 1 CRITICAL + 1 HIGH issue. Both
stem from BUG-2 fix changing `$params['subParcel']` from PHP nested array
to JSON string — but 2 downstream sites still checked `is_array()` →
silent dead-code paths.

- **CRITICAL** — G2 1003 retry subParcel sync (line 8682-8702): `is_array()`
  check became false-always after BUG-2 → sub-parcels' outTradeNo never
  synced with regenerated parent suffix on retry → Flash sub-parcel-level
  dedup fail. Fix: `json_decode` → mutate → `wp_json_encode` roundtrip
  preserves BUG-2 contract.
- **HIGH** — `b2b_flash_mask_request_for_dlq()` subParcel branch
  (line 8450-8470): same dead-code pattern → DLQ rows stripped of subParcel
  for V.42 multi-box failures → forensic debugging harder. Fix: same
  decode-if-string pattern.

File: `[B2B] Snippet 1` V.34.24 → V.34.25.
**Insight**: dead-code-after-encoding-change pattern — when modifying field
encoding (array→string/JSON), grep ALL `is_array($field)` checks in same
scope. Today's BUG-2 fix introduced 2 dead-code sites caught by code-reviewer
but missed by feature-architect verify-pass. Future agent dispatch must
cross-check encoding boundaries.

### Added — Days 5 GDPR Phase 6 design + Days 2-4 deploy runbook (commit `86a62e1`)

NEW `docs/compliance/GDPR-PHASE-6-DESIGN.md` (284 lines):
- Full implementation design for Thai PDPA / GDPR data subject rights
- Builds on V.1.3 stubs (V.1.1 90-day retention shipped Phase 5)
- Queue worker + admin review UI + email templates + erasure decision matrix
  (anonymize vs hard-delete per record type)
- 7 open questions for legal/boss review
- Effort estimate: 5.5 days dev + external legal review

NEW `docs/runbooks/WEEK-LONG-SPRINT-2026-04-29.md` (310 lines):
- Day 2 — Sentry activation: composer install + DSN provision + flag flip
- Day 3 — B2F CPT final drop: pre-flight queries + mysqldump backup +
  2-phase trash→delete + smoke test + rollback (wait until 2026-05-02 day 14)
- Day 4 — Vite LIFF production migration: staging-first + 10% canary +
  24h soak + 50% → 100% rollout (REG-029 byte-identical inline preserved)
- Day 5 — GDPR design review (this commit's design doc)
- Verification schedule + emergency rollback quick-reference

### Added — OpenAPI spec coverage expansion (2026-04-28 → 2026-04-29)

ขยาย `docs/api/openapi.yaml` จาก ~50% → ~70% ของ 125+ production endpoints.

- **B2B Backorder family (+6)** — bo-cancel-item, bo-order-detail, bo-update-eta, bo-bulk-fulfill, bo-bulk-cancel, bo-clear-enum-flag
- **B2B Flash family (+5)** — flash-label, flash-ready-to-ship, flash-cancel, flash-ship-packed (RPi auth), flash-dashboard-stats
- **Inventory family (+6)** — stock/transfer, dip-stock/{start,current,count,approve,history}
- **B2F family (+5)** — approve-reschedule, reject-lot, reject-resolve, po-complete, po-history
- **LIFF AI family (+3)** — dealer-dashboard, lead/{id}/accept, lead/{id}/note

แต่ละ endpoint มี handler line ref + verified request/response shapes + error codes.

### Added — Playwright E2E foundation (Phase 7)

| Phase | Commit | Tests |
|---|---|---|
| V.0.1 Foundation | `511cd81` | cart + api-client (8 tests) |
| V.0.2 Module composition | `8187eb2` | full place-order flow auth→cart→submit (4) |
| V.0.3 Modal + liff-init | `785b89d` | window.dinocoModal bridge + redirect paths (10) |
| V.0.4 iOS coverage | `fdb343f` | WebKit + mobile-safari projects |

22 tests × 4 browser projects = **88 runs ใน 17s** (chromium / mobile-chrome / webkit / mobile-safari).

### Added — 6 self-reinforcing drift detectors

ทุกตัว auto-fail CI เมื่อ docs/code drift:

| Detector | Catches | Tests |
|---|---|---|
| api-contract | api-client method ↔ OpenAPI spec | 3 |
| JSDoc endpoint refs | JSDoc claims ↔ register_rest_route | 3 |
| Snippet DB_ID | Sync engine matching key | 4 |
| Shortcode | CLAUDE.md ↔ add_shortcode() | 4 |
| Constants | CLAUDE.md ↔ define()/defined() | 4 |
| Feature flags | CLAUDE.md ↔ get_option() / flag helpers | 4 |

### Added — 4 security scanners

| Scanner | Catches |
|---|---|
| Secrets pattern | LINE/Telegram/GitHub PATs, AWS keys, JWTs in committed code |
| Dangerous APIs (JS) | eval, Function, document.write, setTimeout("string", ...) |
| PHP security | RCE_EVAL, RCE_SHELL (system/exec/passthru/shell_exec/popen) |
| Bundle size | Vite output >10KB per entry |

### Added — CI workflows

| Workflow | Trigger |
|---|---|
| PHPUnit (existing) | Every push, path-filtered PHP |
| Frontend (Jest + ESLint + tsc) | Every push, path-filtered JS/MD |
| Playwright E2E | matrix [chromium, mobile-chrome, webkit, mobile-safari] |
| Security Audit | npm + composer audit, weekly + dep PR |
| CodeQL SAST | JS/TS taint analysis, weekly + push |
| Dependabot | Weekly auto-PRs across 5 ecosystems |

### Added — Developer experience

- **`npm run test:all`** — unified runner, frontend gates ใน 3 วินาที
- **Pre-push hook auto-install** — ผ่าน `npm prepare` lifecycle, opt-out via `SKIP_HOOKS_INSTALL=1`
- **`.editorconfig`** — cross-IDE indent + line-ending consistency
- **`CONTRIBUTING.md`** — onboarding guide, 260 lines (TL;DR + setup + conventions + commit format + emergency overrides)

### Added — Static analysis

- **ESLint 9 flat config** — scope `liff-src/` + `tests/jest/` + `brand-voice-extension/`
- **TypeScript `--checkJs`** — JSDoc type validation, ambient declarations ใน `liff-src/types.d.ts`

### Fixed — Real bugs caught by infrastructure (24 silent bugs)

| # | Bug | Detector |
|---|---|---|
| 1-2 | Stock semantics drift (Phase 5) | PHPUnit retrospective |
| 3-5 | OpenAPI YAML flow syntax × 3 (`bo-confirm-full`, `delta`, `group_id`) | OpenAPI validator |
| 6 | Dead `state` variable in liff-init.js | ESLint |
| 7 | False `[MIT License](LICENSE)` claim in openclawminicrm/README.md (root LICENSE is Proprietary) | Markdown link checker |
| 8 | Dead `pageData` state in popup.js | ESLint (after extension scope add) |
| 9-13 | Unused `catch (e)` × 5 → renamed to `_e` | ESLint |
| 14-18 | Type errors × 5 (`window.liff` undeclared, `RequestCredentials` enum, etc.) | TypeScript --checkJs |
| 19 | `cancelRequest` path drift (POST `/cancel-request/{id}` → real `/cancel-request` body) | api-contract drift |
| 20 | `getHistory` path (`/history` → `/order-history`) | api-contract drift |
| 21 | `getTicket` path/method (`/ticket/{id}` → `/order-detail?ticket_id=X`) | api-contract drift |
| 22 | Ghost `modifyOrder` method (no production endpoint exists) | api-contract drift + grep |
| **23** | **`X-B2B-Session` → `X-B2B-Token`** auth header drift (every call would 401 in prod) | Manual cross-ref |
| 24 | JSDoc `/b2b/v1/auth` → real `/auth-group` (+ HMAC params requirement) | Manual cross-ref |

ก่อนหน้า session นี้ ทุก bug silent ใน prod. หลังจากนี้ทุก class drift auto-fail CI.

---

## Phase 5 — PHPUnit Test Infrastructure (2026-04-28)

Two-tier PHPUnit stack:
- **Tier 1 (Unit)** — 110 tests / pure PHP stubs / <5s
- **Tier 2 (Integration)** — 51 tests / wordpress-develop + MySQL / ~1 min

ครอบ FOR UPDATE / GET_LOCK / FSM transitions / REST routing / audit dual-write.

### CI iteration story

14 fix commits to first GREEN — แต่ละ iteration peel back env-layer assumption (composer lock drift → yoast PHPUnit 10 incompat → svn missing → set_up visibility → assertWPError clash → PHPUnit 10 vs WP test suite → ACF Pro stubs → b2b_log stub → cascade test cache quirk).

### M4 — Concurrent harness

3 concurrent tests via 2nd `mysqli` connection (not pcntl_fork — CI runners disable fork):

| Primitive | Used by | Test |
|---|---|---|
| `SELECT ... FOR UPDATE` | `dinoco_stock_subtract/add` | `ConcurrentStockSubtractTest` |
| `GET_LOCK` (rate limit) | `b2b_rate_limit` | `RateLimitGetLockTest` |
| `GET_LOCK` (per-order FSM) | `B2B_Order_FSM::transition` | `FsmConcurrentLockTest` |

### Production behaviors discovered

1. `dinoco_compute_hierarchy_stock` per-process static cache (Snippet 15:1689) — never invalidates within process. Production OK due to per-request boundary; risk for long-running CLI/workers.
2. `dinoco_stock_subtract` underflow semantics (Snippet 15:1238) — when `allow_negative=false`, clamps to 0 silently rather than returning `WP_Error`. Returns error only for `invalid_qty`/`not_leaf`/`sku_not_found`/`db_error`.

---

## Phase 6 — Jest Frontend Tests

136 tests / 17 files / <1s

| Module | Coverage |
|---|---|
| cart.js | 38 tests / all 13 exports |
| api-client.js | 33 tests / createApi + createB2BApi |
| liff-init.js | 7 tests / login redirect + edge cases |
| liff-auth.js | 9 tests / backend handshake |
| modal.js | 9 tests / fallback + production paths |
| OpenAPI validator | 9 tests / spec structure + $refs |
| Markdown links | 2 tests / 99 .md files scanned |
| Secrets scanner | 2 tests / pattern + context-aware |
| Dangerous APIs | 2 tests / RCE/XSS sinks |
| Bundle size | 2 tests / 10KB/entry guard |
| PHP security | 2 tests / RCE patterns + comment-aware |
| api-contract drift | 3 tests |
| JSDoc endpoint refs | 3 tests |
| Snippet DB_ID | 4 tests |
| Shortcode drift | 4 tests |
| Constants drift | 4 tests |
| Feature flags drift | 4 tests |

**Coverage** `liff-src/shared/`: 95.83% stmts / 84.84% branches / 90.9% funcs.

---

## Test Counts Total

| Suite | Tests | Speed |
|---|---|---|
| PHPUnit Unit + Integration | 161 | ~1 min |
| Jest (17 files) | 136 | <1s |
| Playwright E2E (5 specs × 4 projects) | 88 | ~17s |
| ESLint + tsc | 0 errors | <2s |
| **Total** | **385** | |

---

## Notes

- Snippet `Version: V.X.Y` history lives in each snippet's header comment, not this file.
- Production behavior changes ดู `CLAUDE.md` "Development Notes" section.
- Audit retrospectives ดู `docs/audit/`.
- CI workflow definitions ดู `.github/workflows/`.

Generated from git history at session end (2026-04-29).
