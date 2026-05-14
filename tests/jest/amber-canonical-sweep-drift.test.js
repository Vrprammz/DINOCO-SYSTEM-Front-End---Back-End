/**
 * Drift detector — amber #d97706 canonical sweep (Sprint 4 Item 7, 2026-05-14)
 *
 * Source of truth: docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md §9 Sprint 4 #7
 * Boss directive: amber `#d97706` → `#b45309` (WCAG AA contrast 4.3:1 → 5.9:1)
 *
 * Audit history: BUG UX-C3 (2026-04-17 audit) shipped first canonical amber fix.
 * Sprint 4 Item 7 swept the remaining 23 files (109 occurrences across snippets +
 * LIFF source + RPi templates + brand-voice extension).
 *
 * Purpose: prevent ANY new `#d97706` (lowercase or uppercase) from creeping back
 * into production snippets. Whitelisted exceptions:
 *   - [System] DINOCO Design Tokens — deprecation comments (audit trail)
 *   - tests/jest/a11y/liff-a11y.test.js — regex pattern in drift guard itself
 *   - tests/jest/sn-system-drift.test.js — meta-check of the above guard
 *   - tests/jest/amber-canonical-sweep-drift.test.js — this file
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '../..');

const WHITELIST = new Set([
    '[System] DINOCO Design Tokens',
    'tests/jest/a11y/liff-a11y.test.js',
    'tests/jest/sn-system-drift.test.js',
    'tests/jest/amber-canonical-sweep-drift.test.js',
]);

describe('Sprint 4 #7 — amber canonical sweep (#d97706 → #b45309) drift detector', () => {

    function findAmberSites() {
        try {
            const out = execSync(
                `cd "${REPO}" && grep -rln "#d97706\\|#D97706" --include="*" 2>/dev/null | grep -v "\\.git/" | grep -v "node_modules" | grep -v "\\.md$" | grep -v "\\.map$" || true`,
                { encoding: 'utf8' }
            );
            return out.split('\n')
                .filter(Boolean)
                .map(s => s.replace(/^\.\//, ''));  // strip leading ./
        } catch {
            return [];
        }
    }

    test('No new #d97706 occurrence in production snippets', () => {
        const sites = findAmberSites();
        const offending = sites.filter(site => !WHITELIST.has(site));
        if (offending.length > 0) {
            console.error('Amber drift detected — new #d97706 sites:', offending);
        }
        expect(offending).toEqual([]);
    });

    test('Whitelisted files still contain #d97706 (deprecation audit trail)', () => {
        const sites = findAmberSites();
        // Design Tokens must keep its 2 deprecation comments
        expect(sites).toContain('[System] DINOCO Design Tokens');
        // a11y test must keep its regex pattern guard
        expect(sites).toContain('tests/jest/a11y/liff-a11y.test.js');
    });

    test('Design Tokens still defines canonical --dnc-warning-amber: #b45309', () => {
        const tokens = fs.readFileSync(path.join(REPO, '[System] DINOCO Design Tokens'), 'utf8');
        expect(tokens).toMatch(/--dnc-warning-amber:\s*#b45309/);
        expect(tokens).toMatch(/'warning-amber'\s*=>\s*'#B45309'/);
    });

    test('Design Tokens deprecation comments preserved (audit trail)', () => {
        const tokens = fs.readFileSync(path.join(REPO, '[System] DINOCO Design Tokens'), 'utf8');
        // Lines 114 + 508 contain deprecation history
        expect(tokens).toMatch(/UX-H3 contrast fixed.*#d97706/i);
        expect(tokens).toMatch(/deprecates.*#d97706/i);
    });

    test('Total #d97706 sites (whitelisted + offending) ≤ 4', () => {
        // Hard cap — if this trips, someone added a new whitelist entry
        // without explicit review. Force decision.
        const sites = findAmberSites();
        expect(sites.length).toBeLessThanOrEqual(4);
    });
});
