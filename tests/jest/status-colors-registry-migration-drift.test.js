/**
 * Drift detector — status_colors registry migration (Sprint 4 #10)
 *
 * Source: docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md §9 Sprint 4 #10
 *   "Migrate b2b_get_status_colors() + B2F_COLOR_* → dinoco_status_registry()"
 *
 * Migration status (already done in V.34.34 Sprint 4B 2026-05-13):
 *   - b2b_get_status_colors() (Snippet 1 V.34.34) consults dinoco_status_color()
 *     FIRST for b2b.* keys, falls back to local array for unmapped legacy.
 *   - b2b_get_status_color($status) same delegation pattern.
 *   - B2F_COLOR_* constants in [B2F] Snippet 1 V.7.6 (Sprint 3E) already point
 *     to canonical hex values matching Design Tokens registry (#1A3A5C / #b45309
 *     / #16a34a / #dc2626 / #6b7280 / #ca8a04 / #ffffff).
 *
 * This detector pins the delegation pattern so future edits don't strip the
 * dinoco_status_color() lookup OR drift B2F_COLOR_* hex away from canonical.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');

describe('Sprint 4 #10 — status_colors registry migration drift detector', () => {

    describe('B2B b2b_get_status_colors() delegates to dinoco_status_color()', () => {
        const b2b1 = fs.readFileSync(path.join(REPO, '[B2B] Snippet 1: Core Utilities & LINE Flex Builders'), 'utf8');

        test('b2b_get_status_colors() body calls dinoco_status_color()', () => {
            const fn = b2b1.match(/function\s+b2b_get_status_colors\s*\(\s*\)\s*\{[\s\S]{0,2500}?\n\s*\}/);
            expect(fn).not.toBeNull();
            expect(fn[0]).toMatch(/function_exists\(\s*['"]dinoco_status_color['"]/);
            expect(fn[0]).toMatch(/dinoco_status_color\(/);
        });

        test('b2b_get_status_color($status) delegates to registry first', () => {
            // Slurp the full function body by line range (regex non-greedy stops on
            // intermediate `}` inside if-block). Lines 3487-3496 in V.34.X.
            const fnStart = b2b1.indexOf('function b2b_get_status_color( $status )');
            expect(fnStart).toBeGreaterThan(0);
            const fn = b2b1.substring(fnStart, fnStart + 800);
            expect(fn).toMatch(/dinoco_status_color\(/);
            expect(fn).toMatch(/b2b_get_status_colors\(/);
        });

        test('Local fallback array preserved for legacy statuses (claim_opened etc.)', () => {
            const fn = b2b1.match(/function\s+b2b_get_status_colors\s*\(\s*\)\s*\{[\s\S]{0,2500}?\n\s*\}/);
            // Legacy statuses NOT in H2 registry must remain in local array
            expect(fn[0]).toMatch(/'claim_opened'\s*=>\s*'#[0-9a-fA-F]{6}'/);
            expect(fn[0]).toMatch(/'claim_resolved'\s*=>\s*'#[0-9a-fA-F]{6}'/);
        });
    });

    describe('B2F_COLOR_* constants point to canonical hex', () => {
        const b2f1 = fs.readFileSync(path.join(REPO, '[B2F] Snippet 1: Core Utilities & Flex Builders'), 'utf8');

        // Each B2F_COLOR_* MUST match canonical Design Tokens value
        test('B2F_COLOR_NAVY = #1A3A5C (brand-navy-flex canonical)', () => {
            expect(b2f1).toMatch(/define\(\s*['"]B2F_COLOR_NAVY['"],\s*['"]#1A3A5C['"]/);
        });
        test('B2F_COLOR_AMBER = #b45309 (warning-amber UX-H3 contrast)', () => {
            expect(b2f1).toMatch(/define\(\s*['"]B2F_COLOR_AMBER['"],\s*['"]#b45309['"]/);
        });
        test('B2F_COLOR_GREEN = #16a34a (brand-green)', () => {
            expect(b2f1).toMatch(/define\(\s*['"]B2F_COLOR_GREEN['"],\s*['"]#16a34a['"]/);
        });
        test('B2F_COLOR_RED = #dc2626 (danger-red)', () => {
            expect(b2f1).toMatch(/define\(\s*['"]B2F_COLOR_RED['"],\s*['"]#dc2626['"]/);
        });
        test('B2F_COLOR_GRAY = #6b7280 (text-secondary)', () => {
            expect(b2f1).toMatch(/define\(\s*['"]B2F_COLOR_GRAY['"],\s*['"]#6b7280['"]/);
        });
    });

    describe('Cross-system status registry agreement', () => {
        test('Design Tokens dinoco_status_color() exists', () => {
            const tokens = fs.readFileSync(path.join(REPO, '[System] DINOCO Design Tokens'), 'utf8');
            expect(tokens).toMatch(/function\s+dinoco_status_color\s*\(/);
        });

        test('Design Tokens dinoco_status_registry() exposes b2b.* / b2f.* / claim.* / sn.* / charge.* keys', () => {
            const tokens = fs.readFileSync(path.join(REPO, '[System] DINOCO Design Tokens'), 'utf8');
            expect(tokens).toMatch(/'b2b\.paid'\s*=>/);
            expect(tokens).toMatch(/'b2f\.confirmed'\s*=>/);
            expect(tokens).toMatch(/'claim\.completed'\s*=>/);
            expect(tokens).toMatch(/'sn\.registered'\s*=>/);
            expect(tokens).toMatch(/'charge\.verified'\s*=>/);
        });

        test('B2B Snippet 1 V.34.34+ documents Sprint 4B registry consult', () => {
            const b2b1 = fs.readFileSync(path.join(REPO, '[B2B] Snippet 1: Core Utilities & LINE Flex Builders'), 'utf8');
            expect(b2b1).toMatch(/V\.34\.34[\s\S]{0,400}Sprint 4B[\s\S]{0,400}dinoco_status_registry/);
        });
    });
});
