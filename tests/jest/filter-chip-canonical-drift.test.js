/**
 * Drift detector — Filter chip canonical migration (Sprint 4 #12)
 *
 * Source: docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md §5.1 + §9 Sprint 4 #12
 *
 * Canonical class: `.dnc-filter-chip` (defined in [System] DINOCO Design Tokens)
 *   - Composition: legacy class + canonical class side-by-side
 *   - State class: `is-active` (canonical) + `.active` (legacy back-compat)
 *
 * Migrated files (composition pattern `class="dnc-filter-chip <legacy>"`):
 *   - [B2B] Snippet 4 LIFF E-Catalog Frontend V.32.7+ — `.b2b-cat-filter-chip`
 *   - [B2F] Snippet 4 Maker LIFF Pages V.4.9+ — `.b2f-filter-tab`
 *
 * Pending migration (future Sprint):
 *   - [Admin] Inventory `.stock-filter-pill`
 *   - [B2F] Snippet 5 admin filter pills (different pattern — KPI cards)
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');

describe('Sprint 4 #12 — Filter chip canonical migration', () => {

    test('Design Tokens defines .dnc-filter-chip base class', () => {
        const tokens = fs.readFileSync(path.join(REPO, '[System] DINOCO Design Tokens'), 'utf8');
        expect(tokens).toMatch(/\.dnc-filter-chip\s*\{/);
        // Per spec §5.1: 36px min-height + 16px-equivalent radius + 7px 12px padding
        expect(tokens).toMatch(/\.dnc-filter-chip[\s\S]{0,500}min-height:\s*36px/);
        // Border-radius uses canonical token (--dnc-r-lg = 16px) OR raw 16px
        expect(tokens).toMatch(/\.dnc-filter-chip[\s\S]{0,500}border-radius:\s*(?:var\(--dnc-r-lg\)|16px)/);
    });

    test('Design Tokens defines .dnc-filter-chip.is-active state', () => {
        const tokens = fs.readFileSync(path.join(REPO, '[System] DINOCO Design Tokens'), 'utf8');
        expect(tokens).toMatch(/\.dnc-filter-chip\.is-active\s*\{/);
    });

    test('B2B Snippet 4 composes .dnc-filter-chip with legacy .b2b-cat-filter-chip', () => {
        const b2b4 = fs.readFileSync(path.join(REPO, '[B2B] Snippet 4: LIFF E-Catalog Frontend'), 'utf8');
        expect(b2b4).toMatch(/dnc-filter-chip/);
        expect(b2b4).toMatch(/b2b-cat-filter-chip/);
    });

    test('B2F Snippet 4 composes .dnc-filter-chip with legacy .b2f-filter-tab', () => {
        const b2f4 = fs.readFileSync(path.join(REPO, '[B2F] Snippet 4: Maker LIFF Pages'), 'utf8');
        // Migrated in V.4.9 (Sprint 4 #12)
        expect(b2f4).toMatch(/class=\\"dnc-filter-chip b2f-filter-tab/);
        // is-active state class added alongside legacy .active
        expect(b2f4).toMatch(/active is-active/);
    });

    test('B2F Snippet 4 V.4.9+ documents the migration', () => {
        const b2f4 = fs.readFileSync(path.join(REPO, '[B2F] Snippet 4: Maker LIFF Pages'), 'utf8');
        expect(b2f4).toMatch(/V\.4\.9[\s\S]{0,300}Sprint 4 #12[\s\S]{0,300}dnc-filter-chip/);
    });
});
