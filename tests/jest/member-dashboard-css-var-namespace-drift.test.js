/**
 * Drift detector — Member Dashboard CSS var namespace rename (Sprint 3 #4)
 *
 * Source: docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md §9 Sprint 3 #4
 *   "Rename Member Dashboard local CSS vars --dnc-space-* → --mdash-space-*"
 *
 * Rationale: `--dnc-space-*` was Member Dashboard local namespace but was never
 * actually defined globally. All 57 occurrences in Assets List used fallback
 * values only (e.g., `var(--dnc-space-3, 12px)` always rendered as `12px`).
 *
 * Rename to `--mdash-space-*` makes Member Dashboard local scope explicit and
 * is defensive against future Design Tokens `--dnc-space-*` definition colliding
 * (Design Tokens currently uses `--dnc-s1..s12` compact form, not `--dnc-space-*`).
 *
 * This detector pins the rename so future edits don't accidentally re-introduce
 * the `--dnc-space-*` name.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const ASSETS_LIST = path.join(REPO, '[System] Dashboard - Assets List');

describe('Sprint 3 #4 — Member Dashboard CSS var namespace rename', () => {
    const content = fs.readFileSync(ASSETS_LIST, 'utf8');

    test('Assets List uses --mdash-space-* (renamed from --dnc-space-*)', () => {
        const mdashCount = (content.match(/--mdash-space-/g) || []).length;
        expect(mdashCount).toBeGreaterThanOrEqual(50);
    });

    test('No remaining --dnc-space-* references in active CSS', () => {
        // Strip PHP block comments + JS-style line comments + legacy ` * ` doc lines
        const stripped = content
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\*.*$/gm, '')
            .replace(/\/\/.*$/gm, '');
        const dncSpaceCount = (stripped.match(/--dnc-space-/g) || []).length;
        expect(dncSpaceCount).toBe(0);
    });

    test('Design Tokens still uses canonical --dnc-s1..s12 spacing (not --dnc-space-*)', () => {
        const tokens = fs.readFileSync(path.join(REPO, '[System] DINOCO Design Tokens'), 'utf8');
        expect(tokens).toMatch(/--dnc-s1:\s*4px/);
        expect(tokens).toMatch(/--dnc-s4:\s*16px/);
        // Confirm --dnc-space-* is NOT defined in Design Tokens (would collide)
        expect(tokens).not.toMatch(/--dnc-space-[0-9]\s*:/);
    });

    test('Member Dashboard Main + Header & Forms use canonical short form (not --dnc-space-*)', () => {
        const main = fs.readFileSync(path.join(REPO, '[System] Member Dashboard Main'), 'utf8');
        const header = fs.readFileSync(path.join(REPO, '[System] Dashboard - Header & Forms'), 'utf8');
        // These files already use --dnc-s2/s3/s4 (canonical short form)
        // — should NOT introduce --dnc-space-* drift
        const mainStripped = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\*.*$/gm, '');
        const headerStripped = header.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\*.*$/gm, '');
        expect((mainStripped.match(/--dnc-space-/g) || []).length).toBe(0);
        expect((headerStripped.match(/--dnc-space-/g) || []).length).toBe(0);
    });

    test('Assets List version header documents the rename', () => {
        expect(content).toMatch(/Sprint 3 #4.*CSS var namespace rename|--mdash-space-\*/);
    });
});
