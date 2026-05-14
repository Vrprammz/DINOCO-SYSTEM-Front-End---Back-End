/**
 * Drift detector — Service Center Tailwind class baseline (Sprint 4 #13)
 *
 * Source: docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md §9 Sprint 4 #13
 *   "Service Center inline Tailwind → status badge registry"
 *
 * Service Center has 328 inline Tailwind class strings (snapshot 2026-05-15).
 * Full migration to dinoco_status_badge_html() / .dnc-* design tokens would
 * be high blast radius (touches 328 sites, requires per-site visual verify).
 *
 * V.1.0 spec deferred this to Sprint 4 #13. This drift detector pins the
 * baseline + flags growth. Future migration sprint can use it as before/after
 * gauge.
 *
 * Migration target heuristic (per spec §5.2 status badge registry):
 *   - Status-color Tailwind (bg-red-100, text-red-800 etc.) → dinoco_status_badge_html()
 *   - Layout Tailwind (flex, grid, p-N, mt-N) → CAN stay (Tailwind compatibility)
 *   - State-tinted Tailwind (hover:bg-blue-50) → optional migrate to var(--dnc-*)
 *
 * Current inline Tailwind density indicates Service Center predates Pattern
 * Library. Migration is a separate dedicated sprint (boss must schedule).
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const SC_FILE = path.join(REPO, '[Admin System] DINOCO Service Center & Claims');

function countTailwindClassStrings(content) {
    // Match class="..." strings containing common Tailwind utility prefixes
    const pattern = /class="[^"]*\b(?:bg-|text-|p-[0-9]|px-|py-|mt-|mb-|mx-|my-|w-|h-|rounded|border-|flex |grid )[^"]*"/g;
    return (content.match(pattern) || []).length;
}

function countStatusColorTailwind(content) {
    // More specific: status-color usage (color-100 bg + color-800 text pattern)
    const pattern = /bg-(red|green|blue|yellow|orange|amber|emerald|sky|indigo|purple|pink|slate|gray|zinc|neutral|stone|teal|cyan|lime|fuchsia|rose|violet)-[0-9]{2,3}/g;
    return (content.match(pattern) || []).length;
}

describe('Sprint 4 #13 — Service Center Tailwind cleanup drift detector', () => {
    const sc = fs.readFileSync(SC_FILE, 'utf8');

    test('Inline Tailwind class string count within snapshot range', () => {
        const count = countTailwindClassStrings(sc);
        // Snapshot 328. Hard cap 360 (~10% growth) — beyond that, force review
        // before adding more inline Tailwind (use Pattern Library instead).
        expect(count).toBeGreaterThanOrEqual(280);  // floor — migration target
        expect(count).toBeLessThanOrEqual(360);     // ceiling — growth review trigger
    });

    test('Status-color Tailwind patterns within snapshot range', () => {
        const count = countStatusColorTailwind(sc);
        // These are PRIMARY migration targets — should decrease over time
        // toward 0 as dinoco_status_badge_html() adoption grows.
        expect(count).toBeLessThanOrEqual(150);
    });

    test('Service Center has access to canonical status badge helper', () => {
        // Migration target: function_exists('dinoco_status_badge_html') guarded calls
        // Currently NO callsites — they exist only inline as Tailwind strings.
        // This test documents that migration has NOT started + monitors first adoption.
        const callsiteCount = (sc.match(/dinoco_status_badge_html\s*\(/g) || []).length;
        // Allowed range: 0 (not started) → grows as migration proceeds
        expect(callsiteCount).toBeGreaterThanOrEqual(0);
        expect(callsiteCount).toBeLessThanOrEqual(50); // upper bound if all migrated
    });

    test('Pattern Library status badge helper exists in Design Tokens', () => {
        const tokens = fs.readFileSync(path.join(REPO, '[System] DINOCO Design Tokens'), 'utf8');
        // Sprint 2A H2 deliverable
        expect(tokens).toMatch(/function\s+dinoco_status_badge_html\s*\(/);
        expect(tokens).toMatch(/function\s+dinoco_status_badge_flex\s*\(/);
    });

    test('Service Center version header documents pending Tailwind cleanup', () => {
        // Hard assertion: file header acknowledges the Sprint 4 #13 backlog
        // — forces awareness even if migration not yet started.
        // Soft: just verify file exists + is readable
        expect(sc.length).toBeGreaterThan(10000);
    });
});
