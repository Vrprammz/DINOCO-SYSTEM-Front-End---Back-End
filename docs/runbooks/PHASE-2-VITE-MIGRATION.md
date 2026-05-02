# Phase 2 — LIFF Vite Migration Runbook

**Status (2026-04-30)**: Steps 1 + 2 complete. CI deploy template ready (workflow_dispatch only). Production canary (Step 3 live run) pending SSH/secrets provisioning.

จุดประสงค์: ย้าย inline JS/CSS ออกจาก WP snippets (B2B Snippet 4, B2F Snippet 8, LIFF AI Snippet 2) ไปเป็น Vite-built bundles ที่ enqueue ผ่าน WP. แก้ PERF-H6 (155KB inline JS).

---

## Architecture

```
liff-src/<surface>/<page>/entry.js   ←  ES module source
            │
            ▼ npm run build:liff
dist/liff/.vite/manifest.json        ←  hashed-name lookup
dist/liff/<entry>.<hash>.js          ←  built bundle
dist/liff/assets/<entry>.<hash>.css  ←  built CSS sibling
            │
            ▼ deploy copies to:
WP_CONTENT/uploads/dinoco-liff/manifest.json
WP_CONTENT/uploads/dinoco-liff/<entry>.<hash>.js
WP_CONTENT/uploads/dinoco-liff/assets/<entry>.<hash>.css
            │
            ▼ at request time:
[System] DINOCO LIFF Asset Loader
  └─ dinoco_liff_enqueue('<entry>')
      ├─ reads manifest.json
      ├─ wp_enqueue_script(<entry>, hashed URL, deps, null, footer=true)
      ├─ filter script_loader_tag → <script type="module">
      ├─ wp_enqueue_style(<entry>-css-N, hashed CSS URL)
      └─ SRI integrity sha384 (best-effort, when file local-readable)
```

---

## Step 1 — Pipeline ready ✅ (2026-04-29)

- `vite.liff.config.js` emits `manifest: true`
- `[System] DINOCO LIFF Asset Loader V.1.1` reads manifest, validates path traversal, computes SRI
- Jest `tests/jest/vite-manifest.test.js` (6 assertions) verifies build output
- 4 entries present: `b2b/catalog/entry.js`, `b2f/catalog/entry.js`, `b2f/maker/entry.js`, `liff-ai/frontend/entry.js`

Build command:

```bash
npm run build:liff
ls dist/liff/.vite/manifest.json   # confirms emit
```

**Production deployment** of bundles to `WP_CONTENT/uploads/dinoco-liff/` is NOT yet wired into CI. Until that lands, `dinoco_liff_enqueue()` returns false (no manifest at expected path) → all callers fall back to inline rendering.

---

## Step 2 — Wire snippets ✅ (2026-04-30)

3 LIFF snippets wired with flag-gated bundle path. **All flags default OFF** — production behavior byte-identical until per-surface flip:

| Snippet | Version (after) | Flag | Vite entry | Mount root |
| --- | --- | --- | --- | --- |
| `[B2B] Snippet 4: LIFF E-Catalog Frontend` | V.32.8 | `dinoco_liff_use_vite_b2b_catalog` | `b2b-catalog` | `<div id="b2b-catalog-app">` |
| `[B2F] Snippet 8: Admin LIFF E-Catalog` | V.7.13 | `dinoco_liff_use_vite_b2f_catalog` | `b2f-catalog` | `<div id="b2f-catalog-app">` |
| `[LIFF AI] Snippet 2: Frontend` | V.3.8 | `dinoco_liff_use_vite_liff_ai` | `liff-ai` | `<div id="liff-ai-app">` |

Each gate sits at the top of the shortcode/template_redirect handler (after config vars resolve, before inline `?>` HTML emission). Pattern:

```php
$use_vite = (bool) get_option( 'dinoco_liff_use_vite_<surface>', false );
if ( $use_vite && function_exists( 'dinoco_liff_enqueue' )
     && dinoco_liff_enqueue( '<entry>' ) ) {
    // Emit minimal shell — wp_head/wp_footer print enqueued tags
    echo '<!DOCTYPE html><html lang="th"><head>...';
    echo '<script src="line-scdn liff sdk"></script>';
    wp_head();
    echo '</head><body>';
    echo '<div id="<surface>-app" data-config="' . esc_attr( wp_json_encode( $config ) ) . '"></div>';
    wp_footer();
    echo '</body></html>';
    exit; // or return ob_get_clean() for shortcode path
}
// Else fall through to inline rendering (REG-029 byte-identical preserved)
```

### Drift detector

`tests/jest/vite-snippet-wiring.test.js` (30 assertions) verifies on every push:

- Each snippet reads its flag via `(bool) get_option( '<flag>', false )` exact pattern
- `function_exists('dinoco_liff_enqueue')` guard before helper call
- Root mount div `<div id="<surface>-app" data-config=...>` present
- Shell calls `wp_head()` + `wp_footer()`
- Inline fallback path preserved (legacy `<body>` or shortcode tail still emits)
- Version header bumped + config payload includes `liff_id` + `rest_url`
- CI workflow exists + disabled by default (workflow_dispatch only)

If a future refactor accidentally deletes the gate or breaks the contract, this fails fast.

### To activate per-surface (post-Step 3 production canary)

```bash
# Via WP-CLI (recommended):
wp option update dinoco_liff_use_vite_b2f_maker 1
wp option update dinoco_liff_use_vite_b2b_catalog 1   # last (highest traffic)

# Or via WP admin → Tools → Options screen
# Or directly via SQL (less safe, no audit log):
# UPDATE wp_options SET option_value='1' WHERE option_name='dinoco_liff_use_vite_b2b_catalog';
```

Activate **smallest-blast-radius first** (b2f-maker → liff-ai → b2f-catalog → b2b-catalog). Each flag flip is independent — never flip multiple at once.

### Rollback (zero-redeploy)

```bash
wp option update dinoco_liff_use_vite_b2b_catalog 0
```

Inline path resumes immediately on next request. No redeploy, no cache flush, no risk to data.

### Pre-Step-3 prerequisites

- [x] Snippet wiring complete (V.32.8 / V.7.13 / V.3.8)
- [x] CI workflow template ready (`.github/workflows/liff-deploy.yml`)
- [ ] CI workflow secrets provisioned (`LIFF_DEPLOY_*`) — see Step 3 below
- [ ] First manual `workflow_dispatch` `dry_run: true` succeeds
- [ ] First live run lands bundles at `WP_CONTENT/uploads/dinoco-liff/`
- [ ] `curl -I https://<host>/wp-content/uploads/dinoco-liff/manifest.json` → 200
- [ ] Feature flag flipped to true on staging FIRST → smoke-test before production canary

### Pre-flight checklist (legacy reference)

- [x] Feature flag wp_option created: `dinoco_liff_use_vite_<surface>` default `false` (in code)
- [x] Rollback plan: flip flag → `false` reverts to inline (no redeploy)
- [ ] CI deploy step copies `dist/liff/` → `WP_CONTENT/uploads/dinoco-liff/` (template ready, secrets pending)
- [ ] Manual verification: SSH to staging, confirm manifest.json + bundles present
- [ ] Monitoring: Sentry / observability snippet captures any post-flip errors

### Migration pattern (per surface)

Inside the snippet's shortcode handler, replace the inline `<style>` + `<script>` emission with conditional:

```php
function b2b_catalog_render_shortcode( $atts ) {
    ob_start();

    // Always emit the root container (Vite mounts into this)
    echo '<div id="b2b-catalog-app" data-config="' .
         esc_attr( wp_json_encode( $config ) ) . '"></div>';

    // V.0.1 Vite path — gated by per-surface flag
    $use_vite = (bool) get_option( 'dinoco_liff_use_vite_b2b_catalog', false );
    if ( $use_vite
         && function_exists( 'dinoco_liff_enqueue' )
         && dinoco_liff_enqueue( 'b2b-catalog' ) ) {
        // Built bundle enqueued by Asset Loader → skip inline emission
        return ob_get_clean();
    }

    // Legacy inline path (current production — unchanged)
    echo '<style>...inline CSS...</style>';
    echo '<script>...inline JS...</script>';

    return ob_get_clean();
}
```

**Critical invariants**:
1. Default `false` flag ⇒ no behavior change on deploy
2. `dinoco_liff_enqueue()` returns `false` if manifest absent ⇒ falls back to inline
3. Inline rendering remains in code as canonical fallback until migration verified

### Per-surface entry.js bootstrap

The entry.js needs to:
1. Read `data-config` from the root element
2. Initialize LIFF (via `liff-init.js`)
3. Auth via backend (via `liff-auth.js` with HMAC params from URL — see [B2B] Snippet 4 V.30.4 pattern)
4. Mount UI

Current `liff-src/b2b/catalog/entry.js` is a 3.5KB pilot stub — needs the actual rendering logic ported from inline JS.

### Smallest-blast-radius first migration order

**Recommended sequence** (smallest LIFF first):

1. **B2F Maker LIFF** (`b2f-maker`) — used by makers only, 3-5 active makers, lowest traffic. Lower-risk pilot.
2. **LIFF AI** (`liff-ai`) — admin + dealer scope, mid traffic
3. **B2F Admin Catalog** (`b2f-catalog`) — admin scope
4. **B2B Customer Catalog** (`b2b-catalog`) — high-traffic customer LIFF, **last**

Each migration is an independent commit + flag flip. Don't migrate multiple at once.

---

## Step 2.5 — B2F Maker LIFF code port (Round 1 — foundation + utilities) ✅ (2026-04-30)

First **actual UI code port** (not scaffold). Smallest scope chosen first: B2F Maker LIFF (1,745 LOC inline). Round 1 covers CSS + utilities + bootstrap; Round 2-5 will port page renderers + cut over.

### What landed in Round 1

| Path | LOC | Status |
| --- | --- | --- |
| `liff-src/b2f/maker/styles.css` | ~600 | Verbatim port of `b2f_liff_page_css()` lines 48-238 |
| `liff-src/b2f/maker/utils/lang.js` | 145 | `L()` + `setupLanguage()` + `STATUS_TH/EN/ZH` + `statusLabel` |
| `liff-src/b2f/maker/utils/format.js` | 130 | `formatNumber`, `curSym`, `formatDate`, `fmtDateShort`, `escHtml` |
| `liff-src/b2f/maker/utils/dom.js` | 175 | `$`, `$$`, toast/error/loading, `lockBtn`/`unlockBtn`, offline detect |
| `liff-src/b2f/maker/utils/jwt.js` | 50 | `jwtPayload` (display-only, no verify) |
| `liff-src/b2f/maker/utils/badges.js` | 230 | `modeBadgeHtml` (V.4.3), `modeSummaryHtml` (V.4.6), `buildStatusInfoBadges` |
| `liff-src/b2f/maker/utils/timeline.js` | 200 | `getMinDate`, `buildTimelineBars`; `buildTimeline` scaffold (Round 2) |
| `liff-src/b2f/maker/entry.js` | 175 | Foundation bootstrap (`initLiff` + `setupLanguage` + offline detect) |
| `tests/jest/liff-b2f-maker-utils.test.js` | 480 | **59 unit tests** covering all 6 utility modules |

### Snippet wiring change

`[B2F] Snippet 4: Maker LIFF Pages` V.4.6 → **V.4.7** — header comment update only. Vite-or-inline conditional rendering (`b2f_maker_liff_render_vite_or_inline`) was already in place since V.4.5. No PHP runtime change.

### Bundle size delta

| Entry | Before (V.0.1 stub) | After (V.0.2 Round 1) | Notes |
| --- | --- | --- | --- |
| `b2f-maker.<hash>.js` | 1.2 KB | **12.0 KB** (gzip 4.79 KB) | +CSS import + 6 utility modules + bootstrap |
| `b2f-maker.<hash>.css` | n/a | 10.5 KB (gzip 2.71 KB) | New CSS chunk extracted from inline |

Bundle-size guard threshold bumped from 10 KB → 16 KB per entry (`tests/jest/bundle-size.test.js`) to allow Round 1 growth. Rationale logged in test header — Round 2-5 will hoist shared code into `chunks/` so we can ratchet the threshold back.

### Round 2-5 roadmap (next sprints)

| Round | Scope | Touch points |
| --- | --- | --- |
| **2** ✅ | Page renderers (5 pages) + full `buildTimeline` | `liff-src/b2f/maker/pages/{confirm,detail,reschedule,list,deliver}.js` |
| **3** | Router + apiCall wrapper | `liff-src/b2f/maker/router.js` + `liff-src/b2f/maker/api.js` (extends shared `createApi`) |
| **4** | Inline-bridge cleanup | Remove duplicated globals; entry.js owns full bootstrap |
| **5** | Cut over | Drop inline `b2f_liff_page_js()` from Snippet 4 once flag flipped + soaked 1 week |

---

## Step 2.5 — B2F Maker LIFF code port (Round 2 — page renderers) ✅ (2026-04-30)

Continues from Round 1 foundation. Round 2 ports the 5 page renderers from inline `b2f_liff_page_js()` (V.4.7 lines 686-1700+) into ES modules under `liff-src/b2f/maker/pages/`. Inline V.4.7 stays UNCHANGED — renderers exposed via `window.DINOCO_B2F_MAKER_RENDERERS` for inline-bridge fallback during Round 3-4 cutover.

### What landed in Round 2

| File | LOC | Notes |
| --- | --- | --- |
| `liff-src/b2f/maker/pages/confirm.js` | ~280 | `renderConfirmPage` + `renderItemRow` + `attachConfirmHandlers`; DD-3 SET grouping + V.4.3 mode badges + reject-box toggle |
| `liff-src/b2f/maker/pages/detail.js` | ~190 | `renderDetailPage` + `renderDetailItem`; image thumbnails + receivedPct progress + status-aware action button |
| `liff-src/b2f/maker/pages/reschedule.js` | ~180 | `renderRescheduleList` + `renderReschedulePage` + `attachRescheduleHandler`; min-date validation |
| `liff-src/b2f/maker/pages/list.js` | ~180 | `renderListPage` + 6 filter tabs with module-private `listFilter` state mirroring inline `var listFilter`; V.4.6 mode-summary pill flag-gated |
| `liff-src/b2f/maker/pages/deliver.js` | ~390 | `renderDeliverPage` (PO list with shipped/remaining table) + `renderDeliverForm` (per-SKU qty stepper + DD-3 SET groupings + V.3.16 inspect/reject summary) |
| `liff-src/b2f/maker/utils/timeline.js` | (extended) | Replaced Round 1 stub: full `buildTimeline(po)` body — 6-step happy path + rejected/cancelled short-circuit |
| `liff-src/b2f/maker/entry.js` | V.0.2 → V.0.3 | Imports all renderers + exposes via `renderers` facade on bootstrap return + `window.DINOCO_B2F_MAKER_RENDERERS` global |

### Bundle deltas (Round 1 → Round 2)

| Entry | Before (V.0.2 R1) | After (V.0.3 R2) | Notes |
| --- | --- | --- | --- |
| `b2f-maker.<hash>.js` | 12.21 KB | **39.52 KB** (gzip 11.03 KB) | +5 page renderers + full timeline body |
| `b2f-maker.<hash>.css` | 10.5 KB | 10.5 KB (unchanged) | CSS already complete in Round 1 |

Bundle-size guard threshold bumped from 16 KB → 48 KB per entry (`tests/jest/bundle-size.test.js`). Rationale: page renderers are the bulk of inline V.4.7 — Round 3+ router will not increase entry size significantly; Round 4-5 cleanup will hoist shared utilities into `chunks/` and ratchet back down.

### Production safety preserved

- `dinoco_liff_use_vite_b2f_maker` flag still default OFF — **production unchanged**
- Inline `b2f_liff_page_css()` + `b2f_liff_page_js()` UNCHANGED in Snippet 4 V.4.7 — Round 5 cutover is the only point where inline gets dropped
- 68 new unit tests for page renderers + DD-3 hierarchy + V.7.0 mode badges + buildTimeline full impl
- Test count: 250 → 318 (Round 2 adds 68 tests)

### Verifying Round 2 locally

```bash
npm run build:liff           # → dist/liff/b2f-maker.<hash>.js (39.5 KB)
npm run test:jest            # → 318 tests pass (was 250 before Round 2)
npx jest liff-b2f-maker-pages.test.js   # → 68 unit tests for page renderers only
npm run lint && npm run typecheck       # both clean
php -l "[B2F] Snippet 4: Maker LIFF Pages"   # syntax clean (untouched)
```

---

## Step 2.6 — B2F Maker LIFF code port (Round 3 — router + Maker API + 5 loaders) ✅ (2026-05-01)

Continues from Round 2. Round 3 ports the **navigation + REST orchestration** layer from inline `b2f_liff_page_js()` (V.4.7) into ES modules under `liff-src/b2f/maker/`. Inline V.4.7 stays UNCHANGED — Round 3 exposes globals (`window.goToPage`, `window.b2fOpenDeliverForm`, etc.) so existing inline onclick handlers keep working during the parallel-rendering window. Round 4 will drop the bridge.

### What landed in Round 3

| File | LOC | Notes |
| --- | --- | --- |
| `liff-src/b2f/maker/router.js` | ~226 | `getCurrentView` + `getCurrentPoId` + `goToPage` + `goToPageWithPO` + `setupRouter` + `dispatchInitial`. Dual mode: V.4.7 full-reload (production default) + SPA `pushState` (Round 5 cut-over + tests). Idempotent setup, popstate handler, swallows handler exceptions. |
| `liff-src/b2f/maker/api.js` | ~230 | `createMakerApi({ base, token, lineUid, onAuthExpired, onCancelledPO })`. Named methods (`confirmPO`/`rejectPO`/`reschedulePO`/`deliverLot`/`getPODetail`/`getMakerPOList`). Auto-attaches `X-B2F-Token` + `X-B2F-Line-Uid` + `X-Idempotency-Key` (mutating endpoints only). 401/410/409 error mapping. `[METHOD URL]` suffix decoration mirrors V.4.7 line 661 for parity. |
| `liff-src/b2f/maker/loaders/confirm.js` | ~255 | `setupConfirm` + `loadConfirmPage` + `handleConfirmSubmit` + `handleRejectSubmit`. Mirrors V.4.7 lines 670-855 — guards cancelled / already-confirmed / rejected POs, validates ETA in future, locks button via shared `lockBtn`. |
| `liff-src/b2f/maker/loaders/detail.js` | ~69 | `setupDetail` + `loadDetailPage` (V.4.7 lines 862-876). URL fallback for `?po_id=`. |
| `liff-src/b2f/maker/loaders/reschedule.js` | ~199 | `setupReschedule` + `loadReschedulePage` + `handleRescheduleSubmit`. Dual mode: list picker (no `?po_id=`) vs detail form (with). Status guard (only `confirmed`/`delivering` allowed). |
| `liff-src/b2f/maker/loaders/list.js` | ~66 | `setupList` + `loadListPage` (V.4.7 lines 1140-1152). Forwards `orderIntentEnabled` flag for V.4.6 mode-summary pill. |
| `liff-src/b2f/maker/loaders/deliver.js` | ~246 | `setupDeliver` + `loadDeliverPage` + `b2fOpenDeliverForm` + `b2fStepQty` + `b2fFillAllRemaining` + `handleDeliverSubmit`. Mirrors V.4.7 lines 1233-1557 — qty validation against `max`, in-flight guard, post-success refresh. |
| `liff-src/b2f/maker/entry.js` | V.0.3 → V.0.4 | Wires all loaders + router on bootstrap. Re-exposes 6 legacy globals (`goToPage`, `goToPageWithPO`, `b2fOpenDeliverForm`, `b2fFillAllRemaining`, `b2fStepQty`, `b2fSubmitDeliver`, `loadDeliverPage`) for inline-bridge during cutover. Initial dispatch matches V.4.7 init() switch (lines 413-419). |
| `liff-src/types.d.ts` | (extended) | Added `Window.b2fOpenDeliverForm/b2fFillAllRemaining/b2fStepQty/b2fSubmitDeliver/loadDeliverPage` declarations + `Error.code` field for 409 idempotency_conflict surface. |

### Bundle deltas (Round 2 → Round 3)

| Entry | Before (V.0.3 R2) | After (V.0.4 R3) | Notes |
| --- | --- | --- | --- |
| `b2f-maker.<hash>.js` | 39.52 KB | **54.85 KB** (gzip 15.26 KB) | +router (7.7 KB) + Maker API (9.5 KB) + 5 loaders (24.7 KB) — but all wired so cutover is one flag flip |
| `b2f-maker.<hash>.css` | 10.5 KB | 10.5 KB (unchanged) | CSS untouched |

Bundle-size guard threshold bumped from 48 KB → 64 KB per entry (`tests/jest/bundle-size.test.js`). Round 5 cutover will drop inline JS from Snippet 4 entirely (no double load), and shared utilities can hoist into `chunks/` to ratchet back down.

### Production safety preserved (Round 3)

- `dinoco_liff_use_vite_b2f_maker` flag still default OFF — **production unchanged**
- Inline `b2f_liff_page_css()` + `b2f_liff_page_js()` UNCHANGED in Snippet 4 V.4.7
- 66 new unit tests cover router (28 cases — view detection, popstate, handler dispatch), Maker API (21 cases — header injection, idempotency key, 401/410/409 mapping, endpoint routing), and 5 loaders (17 cases — load + render branches, validation guards, submit flow)
- Test count: 318 → 384 (Round 3 adds 66 tests)
- ETA validation byte-identical to V.4.7 (rejects today + past dates)
- DOM contract preserved — same input ids (`#b2f-eta`, `#b2f-note`, `#b2f-confirm-btn`, `#b2f-reschedule-btn`, `.b2f-dlv-qty`, etc.) so renderer output stays interoperable

### Verifying Round 3 locally

```bash
npm run build:liff           # → dist/liff/b2f-maker.<hash>.js (54.85 KB)
npm run test:jest            # → 384 tests pass (was 318 before Round 3)
npx jest liff-b2f-maker-router liff-b2f-maker-api liff-b2f-maker-loaders   # → 66 Round 3 cases
npm run lint && npm run typecheck       # both clean
php -l "[B2F] Snippet 4: Maker LIFF Pages"   # syntax clean (untouched)
```

### Round 4 scope (next)

- Inline-bridge cleanup — drop `window.goToPage` / `window.b2fOpenDeliverForm` legacy globals + remove parallel-rendering exposure once Snippet 4 V.4.8 cutover lands
- Begin retiring inline `b2f_liff_page_js()` block in Snippet 4 (Round 5 deletes it entirely once flag is flipped on for canary)

---

## Step 2.7 — B2F Maker LIFF code port (Round 4 — inline-bridge cleanup) ✅ (2026-05-01)

Continues from Round 3. Round 4 is the **inline-bridge cleanup pass**: replace all inline `onclick="..."` attributes in `pages/*.js` with declarative `data-action="..."` attributes, wire a single click listener on `#b2f-app` via event delegation, and drop the 7 legacy `window.*` globals exposed in V.0.4.

After Round 4, when the flag is flipped ON, the Vite bundle owns 100% of UI interaction without any global bridge to inline JS. Inline JS in `[B2F] Snippet 4 V.4.7` stays intact (Round 5 will remove it as a destructive cutover after 1+ week canary).

### What landed in Round 4

| File | LOC delta | Notes |
| --- | --- | --- |
| `liff-src/b2f/maker/event-delegation.js` | NEW (~165) | Pure DI module — `setupEventDelegation(root, deps)` wires one click listener that dispatches to one of 7 deps (`goToPage` / `goToPageWithPO` / `b2fOpenDeliverForm` / `loadDeliverPage` / `b2fStepQty` / `b2fFillAllRemaining` / `handleDeliverSubmit`) based on `data-action` attribute on the closest ancestor of the click target. Returns idempotent cleanup fn. Handler exceptions caught + logged via `console.error`. |
| `liff-src/b2f/maker/entry.js` | V.0.4 → V.0.5 | Calls `setupEventDelegation(#b2f-app)` after router setup. Wraps `event-delegation.js` core with imported router + loader handlers. Drops 7 legacy `window.*` globals. Drops `window.DINOCO_B2F_MAKER_RENDERERS`. Single namespaced surface kept: `window.DINOCO_B2F_MAKER` (frozen, debug only). |
| `liff-src/b2f/maker/pages/detail.js` | unchanged LOC | 3 status-action buttons migrate from `onclick="goToPage('confirm')"` etc. → `data-action="navigate" data-view="confirm"`. |
| `liff-src/b2f/maker/pages/reschedule.js` | unchanged LOC | List card + back button — `onclick="goToPageWithPO(...)"` → `data-action="navigate-with-po" data-view="reschedule" data-po-id="..."`. Back button → `data-action="navigate" data-view="detail"`. |
| `liff-src/b2f/maker/pages/deliver.js` | unchanged LOC | List "Ship more" button → `data-action="deliver-open" data-po-id="..."`. Form back/header arrow → `data-action="deliver-back"`. Stepper +/- → `data-action="deliver-step" data-delta="±1"`. Fill-all → `data-action="deliver-fill-all"`. Submit → `data-action="deliver-submit"`. List back → `data-action="navigate" data-view="list"`. |
| `liff-src/b2f/maker/pages/list.js` | unchanged LOC | Card click drops `window.goToPageWithPO` fallback — uses `data-action="navigate-with-po" data-view="detail" data-po-id="..."` directly. Filter tab listeners remain inline (no global navigation). |
| `liff-src/b2f/maker/pages/confirm.js` | header doc only | Confirm page already used id-based event listeners via `attachConfirmHandlers()` — no `onclick=` to migrate. |

### Bundle deltas (Round 3 → Round 4)

| Entry | Before (V.0.4 R3) | After (V.0.5 R4) | Notes |
| --- | --- | --- | --- |
| `b2f-maker.<hash>.js` | 54.85 KB | **55.87 KB** (gzip 15.51 KB) | +1.02 KB raw / +0.25 KB gzip — added event-delegation module + handler dispatch. Will shrink in Round 5 once inline JS in Snippet 4 is removed (no double-rendering). |
| `b2f-maker.<hash>.css` | 10.5 KB | 10.5 KB (unchanged) | |

### Production safety preserved (Round 4)

- `dinoco_liff_use_vite_b2f_maker` flag still default OFF — **production unchanged**
- Inline `b2f_liff_page_css()` + `b2f_liff_page_js()` UNCHANGED in Snippet 4 V.4.7
- All inline `onclick` handlers in V.4.7 still work (untouched code path)
- 51 new unit tests (348 → 435):
  - 48 in `tests/jest/liff-b2f-maker-bridge.test.js` covering: setupEventDelegation contract (5), navigate action (5), navigate-with-po action (3), deliver-open (3), deliver-back (2), deliver-step (3), deliver-fill-all (1), deliver-submit (2), exception handling (2), source-level drift (entry.js no legacy globals — 11; pages/* no inline onclick — 9 + 4 page-specific data-action coverage assertions)
  - 3 page-test additions covering deliver form data-action attributes (stepper +/-, back twice, no inline onclick)
- Source-level drift detector: any future commit that re-introduces `window.goToPage =` or `onclick="..."` in pages/* will fail CI immediately
- DOM contract preserved — same input ids (`#b2f-eta`, `#b2f-note`, `.b2f-dlv-qty`, etc.) — renderer output stays interoperable with attached form-handler logic

### Verifying Round 4 locally

```bash
npm run build:liff           # → dist/liff/b2f-maker.<hash>.js (55.87 KB)
npm run test:jest            # → 435 tests pass (was 384 before Round 4)
npx jest liff-b2f-maker-bridge   # → 48 Round 4 cases
npm run lint && npm run typecheck       # both clean
grep -rn "onclick=" liff-src/b2f/maker/pages/      # → 0 matches in code (only doc comments)
grep -n "window\.goToPage\s*=" liff-src/b2f/maker/entry.js   # → 0 matches
php -l "[B2F] Snippet 4: Maker LIFF Pages"   # syntax clean (untouched)
```

### Round 5 scope (next — destructive cutover)

- Drop inline `b2f_liff_page_js()` block from `[B2F] Snippet 4 V.4.7` (~1700 LOC removal — destructive, requires user confirmation + canary observation 1+ week with flag ON)
- Drop inline `b2f_liff_page_css()` block (CSS now lives in Vite bundle)
- Snippet 4 becomes a thin shortcode + LIFF auth + JWT issuance shell — page rendering 100% Vite-driven
- Bundle size will shrink slightly as event-delegation handlers are no longer split-loaded with inline counterparts

---

## Step 2.5 Round 5 — B2B Catalog LIFF code port (Round 1 — foundation + utilities) ✅ (2026-04-30)

Mirrors the B2F Maker port pattern (Steps 2.4 → 2.7 above). B2B Catalog (`[B2B] Snippet 4: LIFF E-Catalog Frontend`) is the largest LIFF surface (~155KB inline, customer-facing distributors). Round 1 = foundation only — inline JS in Snippet 4 V.32.9 remains authoritative; flag `dinoco_liff_use_vite_b2b_catalog` default OFF (REG-029 byte-identical preserved).

### What landed in Round 1

- **Snippet 4 V.32.8 → V.32.9** — header annotation only. NO behavior change. Inline `<style>` + `<script>` blocks intact.
- **CSS port**: `liff-src/b2b/catalog/styles.css` (335 LOC verbatim from inline lines 132-467) layered on existing `tokens.css` + `base.css`. Covers header / tabs / search / sub-page / hscroll cards / pills / product grid / floating cart bar (V.32.2 64px green) / skeleton / empty / recommended / cart modal / cancel modal / history / overlays / loading / toast / edit banner / SET Detail view / qty steppers / sub-add button / cart remove.
- **6 utility modules** under `liff-src/b2b/catalog/utils/`:
  - `lang.js` — Thai-only `L()` / `setupLanguage()` / `getLang()` (parallel API to B2F maker for portability — actual switch is no-op since B2B catalog is single-language)
  - `format.js` — `formatNumber` (Math.round + toLocaleString — matches inline `fmt()`), `formatCurrency`, `formatDate`, `escHtml`
  - `dom.js` — `$`, `$$`, `showToast` (auto-creates `#liffToast`), `showAuthError` (with retry button wiring), `showLinkExpired`, `showLoading` / `hideLoading`, `lockBtn` / `unlockBtn` (LOCKED flag — pair in finally), idempotent `setupOfflineDetection`
  - `pricing.js` — `computeDealerPrice` (client preview only; documents Manual Invoice double-discount contract V.34.4–V.34.6), `validateMOQ`, `computeBoxes` (UPB/BPU rules)
  - `hierarchy.js` — `getLeafSkus` / `isLeafSku` / `isTopLevelSet` / `computeHierarchyStock` / `getAncestorSkus` (V.7.1 lesson: pass `visited` Set BY VALUE per branch — DD-3 shared child requires fresh sibling scope)
  - `cart.js` — `loadCart` / `saveCart` (localStorage `dinoco_cart` — matches inline key), `setCartQty` / `incrCartQty`, `computeItemCount` / `computeTotal` / `toOrderItems`, `detectCartDuplicates` (V.32.1 H-10 SET-vs-child hard-stop logic)
- **`entry.js` V.0.1 → V.0.2** — replaces pilot scaffold with real bootstrap that imports the 6 utility modules + styles.css. Auto-boot reads `data-config` JSON from `<div id="b2b-catalog-app" data-config="...">` mount element OR explicit `window.DINOCO_B2B_CATALOG_BOOT === true`. Frozen debug surface `window.DINOCO_B2B_CATALOG` exposes 24 named helpers for the inline-bridge during Rounds 2-4.
- **112 Jest tests** in `tests/jest/liff-b2b-catalog-utils.test.js` covering all 6 modules incl. DD-3 shared-child regression guard, V.32.1 H-10 hard-stop, Manual Invoice double-discount tier preview.

### Bundle deltas (V.0.1 pilot → V.0.2 Round 1)

| Bundle | V.0.1 | V.0.2 | Delta | Notes |
|---|---|---|---|---|
| `b2b-catalog.<hash>.js` | ~3.5KB | **9.04KB** | +5.5KB | utility modules + bootstrap |
| `assets/b2b-catalog.<hash>.css` | n/a | **27.86KB** (gzip 5.38KB) | new | CSS port |
| Total Jest | 435 | **547** | +112 | new test file |
| PHPUnit | 940 | 940 | 0 | unchanged |

Threshold `64KB` per-entry in `tests/jest/bundle-size.test.js` unaffected (b2b-catalog has 55KB headroom).

### Production safety preserved (Round 1)

- Snippet 4 inline `<style>` + `<script>` blocks intact (REG-029 byte-identical when flag OFF)
- Flag `dinoco_liff_use_vite_b2b_catalog` default `false` — inline path is authoritative
- `dinoco_liff_enqueue('b2b-catalog')` triple-safety chain (flag + manifest + enqueue helper) preserved per V.32.8 wiring
- Rollback = flip flag false (no redeploy) — instant

### Verifying Round 1 locally

```bash
npm run build:liff
# Expect: dist/liff/b2b-catalog.<hash>.js  ~9KB

npm run test:jest -- tests/jest/liff-b2b-catalog-utils.test.js
# Expect: 112 passed

npm run lint && npm run typecheck
# Expect: clean

php -l <(printf '<?php\n'; cat "[B2B] Snippet 4: LIFF E-Catalog Frontend")
# Expect: No syntax errors
```

### Round 2 scope (done — see next section)

---

## Step 2.5 Round 6 — B2B Catalog LIFF code port (Round 2 — page renderers) ✅ (2026-04-30)

Continues from Round 1 foundation. Round 2 ports the page renderers from inline `b2b_liff_page_js()` (V.32.9 lines 884-1850) into ES modules under `liff-src/b2b/catalog/pages/`. Inline V.32.9 stays UNCHANGED — renderers exposed via `window.DINOCO_B2B_CATALOG.renderers.*` for inline-bridge fallback during Round 3-4 cutover.

### What landed in Round 2

- **5 page modules** under `liff-src/b2b/catalog/pages/` (~870 LOC):
  - `home.js` (260 LOC) — `renderHome` composite + `renderModelRow` / `renderCategoryRow` / `renderModelCard` / `renderCategoryCard` (motorcycle 🏍️ emoji fallback when no `image_url`) + `renderViewState` (visibility decision tree home/model/category/search) + `renderCrossFilterPills` (sub-header chips with active-state highlighting) + `productMatchesModel` / `collectCategoriesForModel` / `collectModelsForCategory` helpers
  - `catalog.js` (215 LOC) — `renderProducts` (2-col grid + V.32.6 P18 LCP boost: first 6 imgs `fetchpriority="high" loading="eager"`, remainder `lazy`) + `renderProductCard` (SET purple "ดูชุด" overlay btn / OOS disabled chip / low-stock yellow chip / discount red badge / model tags 3-cap with "+N more") + `filterProducts` (4 modes: home/search/model/category with crossFilter) + `formatEtaDate` (YYYY-MM-DD → DD/MM/YYYY parity with inline string-split)
  - `setDetail.js` (250 LOC) — V.32.0 SET overlay + V.32.2 typable stepper (1-999 clamp, min/max guards, Enter-to-add) + V.32.4 collapsed sub-item default ("+ สั่งแยก" button reveals stepper on tap) + V.32.6 P1 MOQ hint "ขั้นต่ำ N ชุด". Exposes `renderSetDetailMainStepper` / `updateSetDetailAddBtn` (boolean predicate) / `renderSetDetailItems` (children + grandchildren — "ซื้อแยกชิ้น" label) / `buildB2bStepper` (shared stepper widget builder)
  - `history.js` (175 LOC) — `renderHistoryFilter` (11 chips with "ทั้งหมด" leading) + `renderHistory` / `renderHistoryCard` / `renderLoadMoreButton` + 15-entry `STATUS_COLORS` + `STATUS_LABELS` constants + `getStatusColor` / `getStatusLabel` fallback helpers. Action button order preserved: ดู → ยกเลิก → สั่งซ้ำ → เคลม
  - `cart.js` (175 LOC) — `updateCartBar` (count + total + visibility based on `activeTab==='catalog'`) + `renderCartItems` (modal items list + V.32.4 🗑️ remove btn + V.32.6 P3 empty state "ตะกร้าว่างแล้ว") + `renderCartModalItem` (V.32.3 56×56 thumbnails with `onerror` fallback to 📦) + `renderCartNoteSection` (`#cartNoteInput` maxlength=300) + `renderRecommendedChips` (frequent SKUs cap 6, case-insensitive lookup, name truncated 16 chars)
- **`entry.js` V.0.2 → V.0.3** — imports the 5 page modules + extends `window.DINOCO_B2B_CATALOG` debug surface with frozen `renderers` namespace exposing 32 named exports for the inline-bridge during Rounds 3-4. Boot marker updated `Round 2 — page renderers, parallel`.
- **111 Jest tests** in `tests/jest/liff-b2b-catalog-pages.test.js` covering: model/category card emoji+image branches + XSS escape + view-state truth table + 4-mode filter combinations + LCP fetchpriority threshold (idx<6 vs idx≥6) + 3 stepper variants (collapsed/full/OOS-disabled) + MOQ hint conditional + DD-3 shared leaf appears under each parent SET (multi-DOM-row guarantee) + 11 history filter chips + 15 status colors + load-more pagination + V.32.4 remove button + V.32.6 P3 empty state + V.32.3 thumbnails with placeholder fallback + recommended chip cap-6 + case-insensitive SKU match

### Bundle deltas (V.0.2 Round 1 → V.0.3 Round 2)

| Bundle | V.0.2 | V.0.3 | Delta | Notes |
|---|---|---|---|---|
| `b2b-catalog.<hash>.js` | 9.04KB | **27.63KB** (gzip 9.13KB) | +18.6KB raw / +3.7KB gzip | 5 page modules + 32 named exports |
| `assets/b2b-catalog.<hash>.css` | 27.86KB | 27.86KB (unchanged) | 0 | CSS already complete in Round 1 |
| Total Jest | 547 | **658** | +111 | new test file `liff-b2b-catalog-pages.test.js` |
| PHPUnit | 383 | 383 | 0 | unchanged |

Bundle-size guard threshold `64 KB` (Round 3 baseline from B2F Maker) — b2b-catalog at 27.63KB has 36KB headroom for Rounds 3-5.

### Production safety preserved (Round 2)

- Snippet 4 inline `<style>` + `<script>` blocks intact (REG-029 byte-identical when flag OFF)
- Flag `dinoco_liff_use_vite_b2b_catalog` default `false` — inline path is authoritative
- DOM structure preserved across Round 2 — same class names (`b2b-cat-product`, `b2b-cat-set-child`, `b2b-cat-history-card`, `b2b-cat-modal-item`, `b2b-qty-stepper`, etc.), same `data-action` taxonomy, same Thai user-facing strings
- `data-action="set-model-view"` / `set-category-view"` / `set-cross-filter` / `set-history-filter` / `add-recommended` / `load-more` attributes added on Round 2 outputs are NEW — they enable Round 3 event delegation but stay inert when bundle is OFF (inline V.32.9 still uses direct `onclick=` assignment)
- Rollback = flip flag false (no redeploy) — instant

### Verifying Round 2 locally

```bash
npm run build:liff
# Expect: dist/liff/b2b-catalog.<hash>.js  ~27.6KB

npm run test:jest -- tests/jest/liff-b2b-catalog-pages.test.js
# Expect: 111 passed

npm run test:jest
# Expect: 658 passed (was 547 before Round 2)

npm run lint && npm run typecheck
# Expect: clean

php -l <(printf '<?php\n'; cat "[B2B] Snippet 4: LIFF E-Catalog Frontend")
# Expect: No syntax errors
```

### Round 3 scope (next)

- **Router** — port the tab-switch logic from inline V.32.9 + URL hash sync (`#detail-<sku>` for SET Detail / `#history` etc.). Mirrors B2F Maker Round 3 router pattern.
- **B2B API wrapper** — wire the 5 endpoints (`catalog`, `order-history`, `place-order`, `cancel-request`, `modify-order`) through the shared `createB2BApi()` helper. Currently each inline call uses raw `authFetch(REST + '...')`.
- **Page bootstrap loaders** — `loadCatalog()` / `loadHistory()` / `openSetDetail()` ported from inline so the bundle owns DOM injection. Round 4 then drops inline event delegation (replaces `onclick=` with `data-action="..."`).

Round 5 final cut-over (drop inline `<script>` block from Snippet 4) — gated on 1 week of flag-ON canary + zero regression reports.

---

## Step 2.5 Round 7 — B2B Catalog LIFF code port (Round 3 — router + B2B API + 5 loaders) ✅ (2026-05-02)

Continues from Round 2. Round 3 ports the **navigation + REST orchestration** layer from inline `b2b_liff_page_js()` (V.32.9) into ES modules under `liff-src/b2b/catalog/`. Inline V.32.9 stays UNCHANGED — Round 3 exposes 12 globals (`window.B2B_CATALOG_GO_TO_TAB`, `window.B2B_CATALOG_OPEN_SET_DETAIL`, `window.B2B_CATALOG_ADD_TO_CART`, etc.) for the inline-bridge during the parallel-rendering window. Round 4 will drop the bridge in favor of `data-action` event delegation.

### What landed in Round 3

- **`liff-src/b2b/catalog/router.js`** (~340 LOC) — hash-based router:
  - `getCurrentTab()` / `getCurrentSetSku()` / `isSetDetailOpen()` — pure URL-hash readers
  - `goToTab(tab, opts)` — pushState + dispatch handler (silent flag respected)
  - `openSetDetail(sku, product)` — pushes `#detail-<sku>` (byte-identical to inline V.32.9 line 1187 history.pushState format)
  - `closeSetDetail()` — `history.back()` when overlay open, else no-op
  - `back()` — close overlay first, else `history.back()`
  - `setupHashRouter({handlers, useHashApi})` — idempotent hashchange + popstate listener (SPA mode only when `useHashApi=true`, default true)
  - `dispatchInitial()` — fires handler matching landing URL
- **`liff-src/b2b/catalog/api.js`** (~270 LOC) — B2B Catalog REST client:
  - `createB2BCatalogApi({base, sessionToken, nonce, onAuthExpired, onRateLimit, onConflict, onMaintenance})`
  - 6 named methods: `getCatalog` / `getOrderHistory(params)` / `getOrderDetail(orderId)` / `placeOrder(payload)` / `cancelOrder(orderId, reason)` / `modifyOrder(orderId, payload)`
  - **Auto-attach `X-Idempotency-Key`** (crypto.randomUUID + timestamp+random fallback) on `placeOrder` + `cancelOrder` — pairs with [B2B] Snippet 3 V.42.10 + Idempotency Helper V.1.0 wrapper. Replays return cached response.
  - `modifyOrder` is a thin wrapper — routes through `/place-order` with `edit_ticket` body field (production V.41.x line 1002-1018 detects > 0 and re-uses existing post_id; NO separate REST endpoint exists)
  - HTTP error mapping → wired callbacks: 401 → onAuthExpired (re-init LIFF), 409 → onConflict + per-code Thai message rewrite (`idempotency_conflict` / `order_modified` / `stock_changed`), 429 → onRateLimit, 503 → onMaintenance
  - Reuses shared `createB2BApi` (V.0.1 pilot) for the core endpoints + layers Round 3 specifics (idempotency + error decoration) on top
- **5 page loaders** under `liff-src/b2b/catalog/loaders/` (~970 LOC):
  - `catalog.js` (~210 LOC) — `setupCatalog` + `loadCatalog` (api → state → render) + `handleAddToCart` (V.32.1 H-10 SET ↔ child duplicate guard preserved) + `handleIncrement` / `handleDecrement` (qty stepper) + `handleOpenSetDetail` (delegates to router via callback)
  - `home.js` (~200 LOC) — `setupHome` + `loadHome` (lazy fetch fallback if catalog not yet loaded) + `applyModelFilter` / `applyCategoryFilter` / `applyCrossFilter` / `resetFilters` (mutate state + fire onCatalogRender callback)
  - `history.js` (~180 LOC) — `setupHistory` + `loadHistory({append, perPage})` + `handleHistoryFilter` (resets pagination) + `handleLoadMore` (appends next page) + `handleCancelOrder` (calls api.cancelOrder + reloads list)
  - `setDetail.js` (~210 LOC) — `setupSetDetail` + `loadSetDetail(sku, productHint)` (uses hint when supplied, else looks up state.products) + `handleAddSet` (clamps 1-999 + V.32.1 H-10 dup guard) + `handleSubItemStep(sku, delta)` + `handleClose`
  - `cart.js` (~180 LOC) — `setupCart` + `loadCartModal` (renders empty state when cart empty) + `handleSubmitOrder` (routes `placeOrder` vs `modifyOrder` based on `editMode`/`editTicket` — calls `liff.closeWindow()` on success like inline V.32.9 line 1690) + `handleCartItemRemove` + `getCartTotals` (count + total)
- **`entry.js` V.0.3 → V.0.4** — wires the router + API + 5 loaders through `bootstrap()`. Adds 12 `window.B2B_CATALOG_*` legacy-bridge globals so inline V.32.9 callers can fire-and-forget into Vite loaders. Extends the frozen `window.DINOCO_B2B_CATALOG` debug surface with `.router` / `.api` / `.loaders` namespaces. Boot marker updated `Round 3 — router + API + loaders`.
- **88 Jest tests** across 3 new suites:
  - `liff-b2b-catalog-router.test.js` (32 tests) — getCurrentTab / getCurrentSetSku / openSetDetail / closeSetDetail / back / setupHashRouter idempotency / dispatchInitial / hashchange + popstate listener wiring (with useHashApi=false negative case)
  - `liff-b2b-catalog-api.test.js` (22 tests) — header injection (X-B2B-Token + X-WP-Nonce + auto X-Idempotency-Key on mutations) + URL parity all 6 methods + modifyOrder routes through /place-order with edit_ticket + 401/409/429/503 callback dispatch + per-code Thai message rewrite + newIdempotencyKey uniqueness
  - `liff-b2b-catalog-loaders.test.js` (34 tests) — per loader: api method called + state populated + render emitted + V.32.1 H-10 duplicate guard + edit-mode submit routing + cart totals computation

### Bundle deltas (V.0.3 Round 2 → V.0.4 Round 3)

| Bundle | V.0.3 | V.0.4 | Delta | Notes |
|---|---|---|---|---|
| `b2b-catalog.<hash>.js` | 27.63 KB | **45.03 KB** (gzip 13.86 KB) | +17.4 KB raw / +4.7 KB gzip | router + API wrapper + 5 loaders + 12 globals |
| `assets/b2b-catalog.<hash>.css` | 27.86 KB | 27.86 KB (unchanged) | 0 | CSS complete in Round 1 |
| Total Jest | 658 | **746** | +88 | 3 new test files |
| PHPUnit | 383 | 383 | 0 | unchanged |

Bundle-size guard threshold `64 KB` (Round 3 baseline from B2F Maker) — b2b-catalog at 45.03 KB has 19 KB headroom for Round 4 cleanup work. Round 4 will drop ~3-5 KB by removing the legacy-bridge globals once event delegation lands.

### Production safety preserved (B2B Catalog Round 3)

- Snippet 4 inline `<style>` + `<script>` blocks intact (REG-029 byte-identical when flag OFF)
- Flag `dinoco_liff_use_vite_b2b_catalog` default `false` — inline path is authoritative
- Hash format `#detail-<sku>` byte-identical to inline V.32.9 line 1187
- 12 `window.B2B_CATALOG_*` globals are NEW — they enable inline → Vite loader bridges but stay inert when bundle is OFF (inline never references them)
- Rollback = flip flag false (no redeploy) — instant

### Verifying B2B Catalog Round 3 locally

```bash
npm run build:liff
# Expect: dist/liff/b2b-catalog.<hash>.js  ~45 KB

npm run test:jest -- tests/jest/liff-b2b-catalog-router.test.js \
                     tests/jest/liff-b2b-catalog-api.test.js \
                     tests/jest/liff-b2b-catalog-loaders.test.js
# Expect: 88 passed

npm run test:jest
# Expect: 746 passed (was 658 before Round 3)

npm run lint && npm run typecheck
# Expect: clean

php -l <(printf '<?php\n'; cat "[B2B] Snippet 4: LIFF E-Catalog Frontend")
# Expect: No syntax errors
```

### B2B Catalog Round 4 scope (next)

- **Bridge cleanup** — drop the 12 `window.B2B_CATALOG_*` globals + replace inline `onclick="..."` attributes in `pages/*.js` with declarative `data-action="..."`. Single delegated click listener on `#b2b-catalog-app` routes by attribute to the appropriate loader handler.
- **DOM ownership** — V.0.4 loaders write to `#b2b-catalog-app` only when present; Round 4 removes that defensive guard once inline V.32.9 stops mounting its own DOM (gated on flag flip + 1 week canary).
- **Mobile back-button parity** — verify `back()` + `closeSetDetail` work correctly on iOS LIFF in-app browser (V.32.5 Round 23 swipe-back guard already pushes a decoy root state).

Round 5 final cut-over (drop inline `<script>` block from Snippet 4) — gated on 1 week of flag-ON canary + zero regression reports.

---

## Step 2.5 Round 8 — B2B Catalog LIFF code port (Round 4 — inline-bridge cleanup) ✅ (2026-04-30)

Continues from Round 3. Round 4 mirrors the B2F Maker Round 4 pattern (Step 2.7 above): replace the legacy `window.B2B_CATALOG_*` bridge with a **single delegated click + change listener** on `#b2b-catalog-app`. Pages already emit declarative `data-action` / `data-stepact` / `data-rmsku` / `data-cancel` / `data-reorder` / `data-claim` attributes from Round 2 onward — Round 4 wires the dispatcher that consumes them.

### What landed in B2B Catalog Round 4

| Change | LOC | Notes |
| --- | --- | --- |
| `liff-src/b2b/catalog/event-delegation.js` (NEW) | ~330 | `setupEventDelegation(root, deps)` — single `click` + `change` listener. Resolves bubbling events via `closest()` on a small attribute taxonomy (`data-action`, `data-stepact`, `data-rmsku`, `data-subaddsku`, history card buttons). 20-key dependency-injected handler bag — pure module, testable without CSS imports. Returns idempotent cleanup function. Handler-thrown errors caught + logged via `console.error` so a misbehaving sub-handler cannot break the listener. |
| `entry.js` V.0.4 → V.0.5 | ~−95 LOC | Bumps version + boot marker. Wires `setupEventDelegation` after `dispatchInitial()` against the root mount + 20 closure handlers (router back, addToCart, increment, decrement, removeFromCart, history filter, load more, model/category/cross filter, cancel/reorder/claim, openTicket via `window.location`, addSet, subItemStep, subItemReveal, stepperInput). Returns `detachDelegation` cleanup on the bootstrap result. Drops 12 `window.B2B_CATALOG_*` legacy globals + the `helpers` / `renderers` / `loaders` parallel surfaces from `window.DINOCO_B2B_CATALOG` — single namespaced debug surface kept (router + api factory only). |
| `tests/jest/liff-b2b-catalog-bridge.test.js` (NEW) | ~600 | **75 Jest cases** covering: basic contract (6) / catalog grid actions (6) / home page actions (4) / history actions (6) / cart modal (3) / SET Detail stepper incl. clamp 1-999 (12) / resilience + error swallow (5) / drift detector for entry.js V.0.5 (19) / drift detector for `pages/*` + `loaders/*` no-onclick guard (10) / module contract (2) / change-event dispatch on stepper input (3 sub-cases). |

### Bundle deltas — B2B Catalog (V.0.4 Round 3 → V.0.5 Round 4)

| Asset | V.0.4 (Round 3) | V.0.5 (Round 4) | Delta |
| --- | --- | --- | --- |
| `b2b-catalog.<hash>.js` | **45.03 KB** (gzip 13.86) | **42.56 KB** (gzip 12.61) | **−2.47 KB** raw (**−1.25 KB** gzip) |
| `assets/b2b-catalog.<hash>.css` | 27.86 KB | 27.86 KB | unchanged |

Bundle shrunk because Round 4 drops the `helpers` / `renderers` / `loaders` parallel debug surface (which kept page renderers + loader symbols reachable for inline-bridge consumers). The single `event-delegation.js` module is smaller than what it replaces.

### Production safety preserved (B2B Catalog Round 4)

- **REG-029 byte-identical preserved**: Snippet 4 V.32.9 inline `<script>` block still authoritative — Round 4 only ports + tests the replacement layer. Flag `dinoco_liff_use_vite_b2b_catalog` default OFF.
- **Triple-safety chain**: flag + manifest + `dinoco_liff_enqueue('b2b-catalog')` presence (V.32.8 wiring unchanged).
- **Drift detectors**: 19 new test cases in `liff-b2b-catalog-bridge.test.js` fail-fast if any of the 12 `window.B2B_CATALOG_*` globals reappear OR if `helpers` / `renderers` / `loaders` parallel surfaces are re-added OR if `pages/*.js` / `loaders/*.js` accidentally regrow inline `onclick=`.
- Test count: 746 → **821** (Round 4 adds 75 tests).
- Bundle thresholds: 64 KB per-entry guard untouched. b2b-catalog at 42.56 KB has **21 KB headroom**.

### Verifying B2B Catalog Round 4 locally (V.0.5)

```bash
npm run build:liff           # → b2b-catalog.<hash>.js ~42.56 KB (gzip 12.61)
npm run test:jest            # → 821 passed (was 746 before Round 4)
npx jest liff-b2b-catalog-bridge   # → 75 Round 4 cases
npm run lint                 # → 0 errors
npm run typecheck            # → tsc --noEmit clean
```

### B2B Catalog Round 5 scope (final cut-over — DESTRUCTIVE)

- **Drop inline `b2b_liff_js()` block from Snippet 4** once flag has been ON ≥1 week with no regressions reported. Bumps Snippet 4 to V.32.10. **Requires explicit user confirmation** before any destructive change to inline JS — Round 5 is irreversible without webhook re-sync from a previous commit.
- **Canary plan**: enable `dinoco_liff_use_vite_b2b_catalog=1` for one trusted distributor LINE group → monitor 7 days → expand to 10% → 50% → 100% → drop inline.
- **Rollback**: `update_option('dinoco_liff_use_vite_b2b_catalog', '0')` flips back to inline V.32.9 instantly (no re-deploy needed) so long as Round 5 hasn't run.

---

## Step 2.5 Round 9 — B2F Catalog LIFF code port (Round 1 — foundation + utilities) ✅ (2026-04-30)

Foundation port for `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.13 → V.7.14 (annotation only — flag default OFF). Bundle V.0.1 stub → V.0.2 with CSS + 6 utility modules (`lang/format/dom/cart/hierarchy/badges`). 126 Jest tests added.

Bundle: `b2f-catalog.<hash>.js` 10.75 KB (gzip 4.18 KB) + `.css` 31.40 KB (gzip 5.88 KB). REG-029 byte-identical preserved (inline render still active).

Commit `239d5c0`.

---

## Step 2.5 Round 10 — B2F Catalog LIFF code port (Round 2 — page renderers) ✅ (2026-04-30)

Continues from Round 9. Ports the 5 page renderers from inline `b2f_liff_page_js()` (V.7.14 lines 1380-3062+) into ES modules under `liff-src/b2f/catalog/pages/`. Inline V.7.14 stays UNCHANGED — renderers exposed via `window.DINOCO_B2F_CATALOG_RENDERERS` for inline-bridge fallback during Round 11+ cutover.

### What landed in Round 10

| File | LOC | Purpose |
| --- | --- | --- |
| `liff-src/b2f/catalog/pages/catalog.js` | ~290 | `renderProducts` + `renderProductCard` — V.7.0 3-card variants (set_assembled / sub_unit / cross_factory_assembly / single) + V.6.6 fallback + LCP fetchpriority="high" first 6 imgs + virtual SET amber badge + breadcrumb |
| `liff-src/b2f/catalog/pages/setDetail.js` | ~225 | `renderSetDetailItems` + `renderSetDetailMainStepper` + `buildQtyStepperHtml` — DD-3 shared-leaf safe via forward-lookup `skuRelations` + `countTopSetsForProduct` callback. V.6.4 collapsed `+ สั่งแยก` button. V.7.5 UX-H14 MOQ hint |
| `liff-src/b2f/catalog/pages/cart.js` | ~310 | `renderCartItems` (V.7.0 dual-section purple/amber, V.6.6 flat fallback) + `buildCartItemThumbHtml` (3-source priority chain) + `renderCartManufacturingSummary` + `computeCartManufacturingSummary` (DD-3 walk) |
| `liff-src/b2f/catalog/pages/reviewGate.js` | ~165 | `renderReviewGate` (V.7.0 Submit Review Gate, V.7.11 a11y `role=tab`/`tabpanel` + `aria-orientation=vertical`) |
| `liff-src/b2f/catalog/pages/filters.js` | ~205 | `renderModelFilter` + `renderTypeChips` + `applyVisibilityFilters` (V.5.1 hide-zero chips + V.5.3 model inheritance via descendants) |

Bundle size: 10.75 KB → **29.39 KB** (gzip 9.55 KB) — still well under PERF-H6 155 KB inline target.

Tests: 80 new Jest cases in `tests/jest/liff-b2f-catalog-pages.test.js` covering all 5 modules. Total Jest suite **947 → 1027** (+80).

`entry.js` V.0.2 → V.0.3 exposes a frozen `window.DINOCO_B2F_CATALOG_RENDERERS` namespace so Round 11+ cutover can call renderers without re-importing.

Snippet 8 V.7.14 → V.7.15 (annotation only — flag still default OFF, REG-029 byte-identical preserved).

### Round 11+ roadmap (next sprints)

1. **Round 11** — hash router + B2F API client + 5 page loaders (load makers / load products / submit PO / load history / virtual toggle persistence)
2. **Round 12** — event delegation + maker-home + success screen + drop legacy globals after staging QA
3. **Round 13** — final cut-over (inline `b2f_liff_page_js()` deleted from Snippet 8 — destructive, requires confirmation)

Commit `b730551`.

---

## Step 3 — Production deploy of bundles (TEMPLATE READY ⏸ DISABLED)

`.github/workflows/liff-deploy.yml` ready. **Disabled by default** — `workflow_dispatch` only until secrets provisioned + first manual dry-run verified.

### Activation steps (when ready)

1. **Generate SSH keypair** on local machine:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/dinoco-liff-deploy -C "github-actions-liff-deploy"
   ```

2. **Add public key to production server**:

   ```bash
   ssh dinocoth@<host> 'cat >> ~/.ssh/authorized_keys' < ~/.ssh/dinoco-liff-deploy.pub
   ```

3. **Capture host fingerprint**:

   ```bash
   ssh-keyscan -t ed25519,rsa <host>
   ```

4. **Provision GitHub Secrets** (Settings → Secrets and variables → Actions):

   | Secret | Value |
   |---|---|
   | `LIFF_DEPLOY_SSH_KEY` | Contents of `~/.ssh/dinoco-liff-deploy` (private key) |
   | `LIFF_DEPLOY_SSH_HOST` | e.g. `dinoco.in.th` |
   | `LIFF_DEPLOY_SSH_USER` | e.g. `dinocoth` |
   | `LIFF_DEPLOY_SSH_PORT` | `22` (or custom) |
   | `LIFF_DEPLOY_TARGET_PATH` | `/home/dinocoth/public_html/wp-content/uploads/dinoco-liff` |
   | `LIFF_DEPLOY_KNOWN_HOSTS` | Output from step 3 |

5. **Verify target dir exists + writable**:

   ```bash
   ssh dinocoth@<host> 'mkdir -p <TARGET_PATH> && chown www-data:www-data <TARGET_PATH>'
   ```

6. **First run — dry-run mode**:
   - GitHub Actions → LIFF bundle deploy → Run workflow → `dry_run: true`
   - Reviews planned rsync output without writing
   - Verifies SSH connection, target path, file list

7. **Live run** — Run workflow with `dry_run: false`. Watches:
   - Bundles appear in `<TARGET_PATH>/` (`*.js`, `assets/*.css`, `chunks/*`)
   - `manifest.json` at `<TARGET_PATH>/.vite/manifest.json`
   - `curl -I https://<host>/wp-content/uploads/dinoco-liff/manifest.json` → 200

8. **Enable auto-deploy** — uncomment the `push: branches: [main]` block in workflow file. From this point, every LIFF source change triggers deploy.

### What the workflow does

- Builds `dist/liff/` via `npm run build:liff`
- Sanity-gates: refuses deploy if `manifest.json` missing
- rsync `-avz --delete-after` (atomic — old hashed bundles cleared only after new ones land)
- `--chmod=ug+rw,o+r` so www-data can read
- `--exclude="*.map"` to skip sourcemaps (saves bandwidth, avoids leaking source structure)
- Post-deploy verification: HEAD request to public manifest URL → expects 200
- `concurrency.cancel-in-progress: false` — never interrupt mid-deploy

### Why workflow_dispatch only (initial)

Auto-deploy on every push = blast radius. First runs need human verification:
- Wrong target path could overwrite unrelated WP files
- Misconfigured permissions could leave bundles unreadable
- Cache headers from nginx might serve stale manifest

Once one full live run succeeds + `dinoco_liff_enqueue()` returns true in production (verified via test snippet flag), promote to `push:` trigger.

---

## Step 4 — Monitoring + rollback

**Sentry alerts** (when DINOCO_SENTRY_DSN configured):
- JS error rate per surface — alert if >0.1% of LIFF page loads error
- Auth failure rate — alert if X-B2B-Token rejection >1%

**Rollback** (zero-redeploy):

```sql
UPDATE wp_options
SET option_value = '0'
WHERE option_name = 'dinoco_liff_use_vite_b2b_catalog';
```

Or via WP admin → Settings → DINOCO LIFF → toggle flag.

---

## Why this is incremental, not big-bang

WP Code Snippets sync = `git push origin main` → live WP within seconds. Big-bang migration would put all 4 LIFF surfaces at risk simultaneously. Per-surface flags + smallest-first ordering means:

- Worst case (Vite bundle bug): one surface affected, rollback in <1 min via flag flip
- Each migration validated in production before next surface migrated
- Inline fallback path remains canonical — Vite is opt-in, not default

---

## Bundle size tracking

Phase 6 added `tests/jest/bundle-size.test.js` enforcing 10KB per entry. Phase 2 V.0.1 baseline:

| Entry | Size (gzip) |
|---|---|
| b2b-catalog | 3.53KB (1.63KB gzip) |
| b2f-catalog | 0.61KB (0.42KB gzip) |
| b2f-maker | 0.47KB (0.36KB gzip) |
| liff-ai | 0.60KB (0.40KB gzip) |
| api-client chunk (shared) | 2.06KB (1.14KB gzip) |
| modal chunk (shared) | 0.43KB (0.27KB gzip) |

Real migration will grow these — bundle-size test will fail if any entry exceeds 10KB. Bump cap in commit message if growth is justified.

---

## References

- `[System] DINOCO LIFF Asset Loader` snippet — runtime helper
- `vite.liff.config.js` — build config
- `liff-src/README.md` — entry-point migration plan (per-surface)
- `tests/jest/vite-manifest.test.js` — pipeline invariant test
- `tests/jest/bundle-size.test.js` — bundle-size guard
- PERF-H6 audit finding (AUDIT-REPORT-2026-04-17) — original problem statement
