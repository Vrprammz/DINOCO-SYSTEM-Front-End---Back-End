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
| **2** | Page renderers (5 pages) | `liff-src/b2f/maker/pages/{confirm,detail,reschedule,list,deliver}.js` + `buildTimeline` full body |
| **3** | Router + apiCall wrapper | `liff-src/b2f/maker/router.js` + `liff-src/b2f/maker/api.js` (extends shared `createApi`) |
| **4** | Inline-bridge cleanup | Remove duplicated globals; entry.js owns full bootstrap |
| **5** | Cut over | Drop inline `b2f_liff_page_js()` from Snippet 4 once flag flipped + soaked 1 week |

### Production safety preserved

- `dinoco_liff_use_vite_b2f_maker` flag still default OFF — **production unchanged**
- Manifest absent in production (Step 3 disabled) → triple safety chain holds: flag + manifest + `dinoco_liff_enqueue` presence all required
- Inline `b2f_liff_page_css()` + `b2f_liff_page_js()` UNCHANGED in Snippet 4 — Round 5 cutover is the only point where inline gets dropped
- 59 new unit tests + drift detectors enforce that Round 1 utilities stay byte-identical to inline behavior

### Verifying Round 1 locally

```bash
npm run build:liff           # → dist/liff/b2f-maker.<hash>.js (12 KB)
npm run test:jest            # → 250 tests pass (was 191 before Round 1)
npx jest liff-b2f-maker-utils.test.js   # → 59 unit tests for utilities only
php -l "[B2F] Snippet 4: Maker LIFF Pages"   # syntax clean
```

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
