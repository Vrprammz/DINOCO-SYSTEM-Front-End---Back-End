# Phase 2 — LIFF Vite Migration Runbook

**Status (2026-04-29)**: Step 1 complete. Asset pipeline ready. Snippet wiring not yet done.

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

## Step 2 — Wire one snippet (NOT YET DONE)

### Pre-flight checklist

Before modifying ANY production WP snippet:

- [ ] CI deploy step copies `dist/liff/` → `WP_CONTENT/uploads/dinoco-liff/` after every push to main
- [ ] Manual verification: SSH to staging, confirm manifest.json + bundles present
- [ ] Feature flag wp_option created: `dinoco_liff_use_vite_<surface>` default `false`
- [ ] Rollback plan: flip flag → `false` reverts to inline (no redeploy)
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

## Step 3 — Production deploy of bundles (NOT YET DONE)

CI must copy `dist/liff/` to `WP_CONTENT/uploads/dinoco-liff/` on the production WP server.

Options:
1. **Add deploy step to GitHub Actions** — rsync bundles via SSH after build
2. **Snippet auto-fetch from GitHub Releases** — Asset Loader fetches via HTTPS on first call (cache 24h)
3. **Manual upload via WP admin** — SFTP `dist/liff/*` once per release

Option 1 is most automated. Requires SSH key in GitHub Secrets + production server path config.

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
