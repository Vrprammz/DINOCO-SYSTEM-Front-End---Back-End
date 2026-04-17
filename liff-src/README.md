# DINOCO LIFF Frontend — Build Pipeline (V.0.1 Foundation)

## Status

**Foundation scaffold only** — no LIFF code migrated yet.

Entry stubs and shared helpers exist; WP snippets still serve inline JS/CSS
embedded in PHP until migration Phase 2 begins.

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

```
liff-src/
├── README.md                — this file
├── b2b/
│   └── catalog/
│       ├── entry.js         — placeholder (future migration target)
│       └── styles.scss      — placeholder
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
    ├── api-client.js        — REST client wrapper (X-LIFF-AI-Token etc.)
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
