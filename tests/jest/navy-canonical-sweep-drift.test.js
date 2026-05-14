/**
 * Drift detector — navy hex canonical sweep (Sprint 3 Item 2, 2026-05-14)
 *
 * Source of truth: docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md §1 D1
 * Boss directive 2026-05-13: "เอา B2B อิง" two-tier canonical:
 *   - `#1A3A5C` (--dnc-brand-navy-flex)    — LINE Flex headers (bubble background)
 *   - `#1f2937` (--dnc-brand-charcoal-ui)  — Web/LIFF UI (cart bar, sidebar, modal headers)
 *
 * Deprecated:
 *   - `#1e3a8a` (BO Snippet 16 hardcoded × 20) — Material blue 800
 *   - `#1a237e` (B2F constant B2F_COLOR_NAVY)  — Material indigo 900
 *   - `#111827` (Tailwind gray-900, 1 occurrence) — merged into #1f2937
 *
 * Sprint 3 Item 2 swept ALL production sites. Whitelisted exceptions:
 *   - Comment-only audit trail (B2F Snippet 1/4/8, B2B Snippet 1)
 *   - drift detector regex pattern itself (this file)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '../..');

// Files allowed to retain deprecated hex strings as documentation
// (migration audit trail in version headers / inline comments).
const WHITELIST = new Set([
    '[B2F] Snippet 1: Core Utilities & Flex Builders',
    '[B2F] Snippet 4: Maker LIFF Pages',
    '[B2F] Snippet 8: Admin LIFF E-Catalog',
    '[B2B] Snippet 1: Core Utilities & LINE Flex Builders',
    '[B2B] Snippet 16: Backorder System',  // contains "was #1e3a8a" audit comments
    'tests/jest/navy-canonical-sweep-drift.test.js',
]);

describe('Sprint 3 #2 — navy canonical sweep (#1e3a8a / #1a237e → #1A3A5C or #1f2937)', () => {

    function findNavySites() {
        try {
            const out = execSync(
                `cd "${REPO}" && grep -rln "#1e3a8a\\|#1a237e\\|#1E3A8A\\|#1A237E" --include="*" 2>/dev/null | grep -v "\\.git/" | grep -v "node_modules" | grep -v "\\.md$" | grep -v "\\.map$" || true`,
                { encoding: 'utf8' }
            );
            return out.split('\n')
                .filter(Boolean)
                .map(s => s.replace(/^\.\//, ''));
        } catch {
            return [];
        }
    }

    test('No new #1e3a8a / #1a237e occurrence outside whitelist', () => {
        const sites = findNavySites();
        const offending = sites.filter(s => !WHITELIST.has(s));
        if (offending.length > 0) {
            console.error('Navy drift detected — new sites:', offending);
        }
        expect(offending).toEqual([]);
    });

    test('Total deprecated-navy sites ≤ 6 (hard cap on whitelist growth)', () => {
        const sites = findNavySites();
        expect(sites.length).toBeLessThanOrEqual(6);
    });

    test('Design Tokens defines both canonical navy tiers', () => {
        const tokens = fs.readFileSync(path.join(REPO, '[System] DINOCO Design Tokens'), 'utf8');
        // Flex header tier
        expect(tokens).toMatch(/--dnc-brand-navy-flex:\s*#1A3A5C/i);
        // Web/LIFF UI tier
        expect(tokens).toMatch(/--dnc-brand-charcoal-ui:\s*#1f2937/i);
    });

    test('B2F constant B2F_COLOR_NAVY points to canonical #1A3A5C', () => {
        const b2f1 = fs.readFileSync(path.join(REPO, '[B2F] Snippet 1: Core Utilities & Flex Builders'), 'utf8');
        expect(b2f1).toMatch(/define\(\s*['"]B2F_COLOR_NAVY['"],\s*['"]#1A3A5C['"]/);
    });

    test('LIFF B2F CSS vars --b2f-navy use canonical #1A3A5C', () => {
        const catalog = fs.readFileSync(path.join(REPO, 'liff-src/b2f/catalog/styles.css'), 'utf8');
        const maker   = fs.readFileSync(path.join(REPO, 'liff-src/b2f/maker/styles.css'), 'utf8');
        expect(catalog).toMatch(/--b2f-navy:\s*#1A3A5C/);
        expect(maker).toMatch(/--b2f-navy:\s*#1A3A5C/);
    });

    test('Whitelisted files retain audit-trail references', () => {
        const sites = findNavySites();
        // At minimum these 4 PHP comments stay
        const expected = [
            '[B2F] Snippet 1: Core Utilities & Flex Builders',
            '[B2B] Snippet 1: Core Utilities & LINE Flex Builders',
        ];
        for (const f of expected) {
            expect(sites).toContain(f);
        }
    });
});
