# DINOCO LIFF Frontend — Build Pipeline (V.0.1 Foundation)

## Status

**Foundation scaffold + pilot extraction** — no LIFF code migrated yet.

Entry stubs and shared helpers exist; WP snippets still serve inline JS/CSS
embedded in PHP until migration Phase 2 begins.

B2B catalog tokens + base reset CSS have been **extracted as parallel
artifacts** — the inline `<style>` in `[B2B] Snippet 4` remains authoritative
(source of truth) while the Vite build emits a duplicate bundle at
`dist/liff/b2b-catalog.*.js` + `dist/liff/assets/b2b-catalog.*.css`.
This proves the build pipeline end-to-end without touching production
rendering.

## Goal

Address **PERF-H6** (155 KB inline HTML per LIFF request) by:

1. Moving inline JS/CSS from
   - `[B2B] Snippet 4: LIFF E-Catalog Frontend`
   - `[B2F] Snippet 8: Admin LIFF E-Catalog`
   - `[LIFF AI] Snippet 2: Frontend`
   - `[B2F] Snippet 4: Maker LIFF Pages`

   into modular ES modules under `liff-src/*`.

2. Building via `npm run build:liff` → `dist/liff/*.[hash].js` + CSS.

3. Updating WP snippets to call `wp_enqueue_script` + `wp_enqueue_style`
   with `Cache-Control: public, max-age=31536000, immutable` (hash-based).

4. HTML shell in PHP stays minimal (<10 KB of markup + shortcode).

## Directory Layout

```text
liff-src/
├── README.md                — this file
├── b2b/
│   └── catalog/
│       ├── entry.js         — Vite entry (V.0.1 pilot — smoke-test imports)
│       ├── tokens.css       — :root CSS variables (extracted from Snippet 4)
│       └── base.css         — reset + typography + keyframes (subset of Snippet 4)
├── b2f/
│   ├── catalog/
│   │   └── entry.js         — placeholder
│   └── maker/
│       └── entry.js         — placeholder
├── liff-ai/
│   └── frontend/
│       └── entry.js         — placeholder
└── shared/                  — real impl (minimal helpers)
    ├── liff-init.js         — LIFF SDK init + idToken extraction
    ├── liff-auth.js         — backend auth exchange (B2B/B2F/LIFF AI)
    ├── api-client.js        — REST client wrapper + createB2BApi helper
    ├── cart.js              — pure cart state machine (testable, surface-agnostic)
    └── modal.js             — ES bridge for window.dinocoModal
```

## Migration Plan (future sprints)

| Phase | Scope | Target |
|---|---|---|
| 1 (this PR) | scaffold + shared helpers — no behavior change | done |
| 2 | migrate B2B catalog entry (1 file pilot) | after BO stabilization |
| 3 | migrate B2F catalog | +1 sprint |
| 4 | migrate LIFF AI (most complex) | +2 sprints |
| 5 | migrate B2F Maker LIFF | +3 sprints |
| 6 | deprecate inline HTML paths — remove PHP-embedded JS | +4 sprints |

## Development

```bash
# Install dependencies (vite is already in package.json)
npm install

# Dev server (HMR) — serves liff-src/* with live reload
npm run dev:liff
# → http://localhost:5173

# Production build
npm run build:liff
# → dist/liff/b2b-catalog.[hash].js
# → dist/liff/b2f-catalog.[hash].js
# → dist/liff/b2f-maker.[hash].js
# → dist/liff/liff-ai.[hash].js
```

## Expected Benefit (post-migration)

- **LCP**: -1-2s on LIFF first load (inline parse cost eliminated)
- **Bundle size**: -60-70% after esbuild minification vs inline PHP echo
- **Caching**: build hash → browser cache max-age=31536000 immutable
- **Debuggability**: sourcemaps on staging, real ES modules, proper lint scope
- **Code reuse**: shared helpers (liff-init, api-client, modal) eliminate
  ~15 KB of duplicated glue across 4 snippets

## How WP Snippets Will Load Built Assets

After Phase 2, a snippet's shortcode handler will do:

```php
$manifest = json_decode(
    file_get_contents(ABSPATH . 'dist/liff/.vite/manifest.json'),
    true
);
$entry = $manifest['b2b/catalog/entry.js'] ?? null;

if ($entry) {
    wp_enqueue_script(
        'dinoco-b2b-catalog',
        DINOCO_DIST_URL . '/liff/' . $entry['file'],
        ['liff-sdk'],
        null, // version = null because hash is in filename
        true  // in_footer
    );
    foreach (($entry['css'] ?? []) as $css) {
        wp_enqueue_style('dinoco-b2b-catalog-' . md5($css),
            DINOCO_DIST_URL . '/liff/' . $css, [], null);
    }
}
```

The manifest approach avoids hardcoding hashed filenames. `DINOCO_DIST_URL`
will be defined as a constant pointing at WordPress-served `/dist` or a CDN.

## Lint & Test

Not wired up yet. Phase 2 adds:

- ESLint + Prettier (shared config with `openclawminicrm/`)
- Vitest for shared helpers
- Playwright for LIFF e2e (run in LINE-like Chrome profile)

## Progress (updated 2026-04-17)

### Phase 0 — Scaffold — done

Initial Vite pipeline + directory tree + shared helper stubs
(commit `d2cf413`).

### Phase 0.5 — Pilot extraction — done (this commit series)

**Goal**: Prove the build pipeline end-to-end with a real extracted
subset, without touching production rendering.

- [x] `liff-src/b2b/catalog/tokens.css` — CSS variables copied from
  `[B2B] Snippet 4` `:root` block (lines 85-96)
- [x] `liff-src/b2b/catalog/base.css` — reset + body + `.sr-only` +
  `b2bShimmer` / `b2bSpin` keyframes (Snippet 4 V.32.6 subset)
- [x] `liff-src/shared/liff-auth.js` — backend auth exchange helper
  (B2B / B2F / LIFF AI compatible)
- [x] `liff-src/shared/cart.js` — pure-function cart state machine
  (immutable, testable, with opt-in localStorage persistence)
- [x] `liff-src/shared/api-client.js` — extended with `createB2BApi()`
  wrapper for the 6 core customer endpoints
- [x] `liff-src/b2b/catalog/entry.js` — smoke-test bootstrap with
  opt-in `window.DINOCO_B2B_CATALOG_BOOT` flag
- [x] `[System] DINOCO LIFF Asset Loader` — manifest-based
  `dinoco_liff_enqueue($entry)` helper (scaffold only, not
  auto-mounted)
- [x] `npm run build:liff` produces `dist/liff/b2b-catalog.*.js`
  (3.5 KB) + `dist/liff/assets/b2b-catalog.*.css` (0.74 KB)

**NOT touched**: Snippet 4 inline renderer (only 2 comment markers
added above `<style>` and `<script>` blocks pointing at this scaffold).
Production LIFF customers still receive the inline-rendered page.

### Phase 1 — Pilot migration (next sprint)

- [ ] Migrate B2B Snippet 4 inline `<script>` → `liff-src/b2b/catalog/entry.js`
- [ ] `wp_enqueue_script` in Snippet 4 PHP via
  `dinoco_liff_enqueue('b2b-catalog')` — conditional enqueue, inline
  fallback if manifest absent
- [ ] Test on LINE app (iOS + Android in-client browser)
- [ ] Measure LCP before/after on staging
- [ ] Soak 1 week, then drop inline emission from Snippet 4

### Phase 2 — B2F migration

- [ ] Same pattern for `[B2F] Snippet 8: Admin LIFF E-Catalog`

### Phase 3 — LIFF AI migration

- [ ] Same pattern for `[LIFF AI] Snippet 2: Frontend`

### Phase 4 — Cleanup

- [ ] Remove inline CSS/JS from PHP snippets (after 1 month observation)
- [ ] Bundle analysis + further optimization (code-split by route)
- [ ] Wire Vitest + ESLint + Playwright per "Lint & Test" plan above
