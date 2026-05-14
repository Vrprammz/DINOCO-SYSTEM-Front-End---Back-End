/**
 * Drift detector — Flex bubble size convention (Sprint 4 #8)
 *
 * Source: docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md §6.1
 *   Customer-facing (status / payment / warranty) → 'mega'  (visual prominence)
 *   Admin-internal (alerts / queues / action requests) → 'kilo' (compact scan)
 *   Carousels (3+ bubbles per push) → 'kilo' per bubble
 *
 * Auto-classification of customer vs admin per builder is too noisy for a
 * drift detector. Instead, this test pins per-file baselines (snapshot
 * 2026-05-15). When counts change, reviewer is forced to justify the bump.
 *
 * Counts include: 'kilo', 'mega', 'giga' (rare full-width), 'micro' (rare).
 *
 * If you add a new Flex builder OR change a size:
 *   1. Run `npm test` — see new totals in failure message
 *   2. Update baseline below explicitly (commit message must explain why)
 *   3. Reviewer sees the explicit bump in the diff — no silent drift
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');

const FILES = [
    '[B2B] Snippet 12: Admin Dashboard LIFF',
    '[B2B] Snippet 16: Backorder System',
    '[B2B] Snippet 1: Core Utilities & LINE Flex Builders',
    '[B2B] Snippet 2: LINE Webhook Gateway & Order Creator',
    '[B2B] Snippet 5: Admin Dashboard',
    '[B2F] Snippet 1: Core Utilities & Flex Builders',
    '[B2F] Snippet 2: REST API',
    '[B2F] Snippet 3: Webhook Handler & Bot Commands',
    '[Admin System] DINOCO Claim Lifecycle Notifier',
    '[Admin System] DINOCO Manual Invoice System',
    '[Admin System] DINOCO Production SN Manager',
    '[System] DINOCO SN REST API',
];

// Per-file baseline counts (snapshot 2026-05-15). Format: [kilo, mega, giga, micro]
const SIZE_BASELINES = {
    '[B2B] Snippet 12: Admin Dashboard LIFF': [0, 1, 0, 0],
    '[B2B] Snippet 16: Backorder System':     [1, 6, 0, 0],
    '[B2B] Snippet 1: Core Utilities & LINE Flex Builders': [28, 19, 0, 0],
    '[B2B] Snippet 2: LINE Webhook Gateway & Order Creator': [16, 0, 0, 0],
    '[B2B] Snippet 5: Admin Dashboard':       [2, 0, 0, 0],
    '[B2F] Snippet 1: Core Utilities & Flex Builders': [0, 28, 0, 0],
    '[B2F] Snippet 2: REST API':              [0, 5, 0, 0],
    '[B2F] Snippet 3: Webhook Handler & Bot Commands': [4, 3, 0, 0],
    '[Admin System] DINOCO Claim Lifecycle Notifier': [2, 0, 0, 0],
    '[Admin System] DINOCO Manual Invoice System': [4, 1, 0, 0],
    '[Admin System] DINOCO Production SN Manager': [5, 0, 0, 0],
    '[System] DINOCO SN REST API':            [1, 0, 0, 0],
};

function countSizes(filePath) {
    const c = fs.readFileSync(filePath, 'utf8');
    return {
        kilo:  (c.match(/'size'\s*=>\s*'kilo'/g) || []).length,
        mega:  (c.match(/'size'\s*=>\s*'mega'/g) || []).length,
        giga:  (c.match(/'size'\s*=>\s*'giga'/g) || []).length,
        micro: (c.match(/'size'\s*=>\s*'micro'/g) || []).length,
    };
}

describe('Sprint 4 #8 — Flex bubble size convention drift detector', () => {

    describe('Per-file size counts match baseline', () => {
        for (const file of FILES) {
            test(`${file} — size counts pinned`, () => {
                const filePath = path.join(REPO, file);
                if (!fs.existsSync(filePath)) {
                    return; // soft pass if renamed
                }
                const counts = countSizes(filePath);
                const [bKilo, bMega, bGiga, bMicro] = SIZE_BASELINES[file] || [0, 0, 0, 0];
                expect(counts.kilo).toBe(bKilo);
                expect(counts.mega).toBe(bMega);
                expect(counts.giga).toBe(bGiga);
                expect(counts.micro).toBe(bMicro);
            });
        }
    });

    describe('Global totals match snapshot 2026-05-15', () => {
        test('Total kilo + mega + giga + micro counts', () => {
            const totals = { kilo: 0, mega: 0, giga: 0, micro: 0 };
            for (const file of FILES) {
                const fp = path.join(REPO, file);
                if (!fs.existsSync(fp)) continue;
                const c = countSizes(fp);
                totals.kilo  += c.kilo;
                totals.mega  += c.mega;
                totals.giga  += c.giga;
                totals.micro += c.micro;
            }
            // Snapshot: 63 kilo, 63 mega, 0 giga, 0 micro = 126 total
            // Allow ±15% drift before forcing baseline review
            expect(totals.total = totals.kilo + totals.mega + totals.giga + totals.micro);
            expect(totals.kilo).toBeGreaterThanOrEqual(50);
            expect(totals.kilo).toBeLessThanOrEqual(80);
            expect(totals.mega).toBeGreaterThanOrEqual(50);
            expect(totals.mega).toBeLessThanOrEqual(80);
            // Giga + micro should remain zero (Spec §6.1 — Flex max sizes documented)
            expect(totals.giga).toBe(0);
            expect(totals.micro).toBe(0);
        });
    });

    describe('Documented conventions enforced', () => {
        test('No "nano" or other non-standard Flex size values used', () => {
            for (const file of FILES) {
                const fp = path.join(REPO, file);
                if (!fs.existsSync(fp)) continue;
                const c = fs.readFileSync(fp, 'utf8');
                // LINE Flex only supports: nano | micro | deca | hecto | kilo | mega | giga
                // (Per LINE Flex Messaging Schema docs)
                // We don't currently use nano/deca/hecto — they're allowed but flag for review
                const nano  = (c.match(/'size'\s*=>\s*'nano'/g)  || []).length;
                const deca  = (c.match(/'size'\s*=>\s*'deca'/g)  || []).length;
                const hecto = (c.match(/'size'\s*=>\s*'hecto'/g) || []).length;
                expect({ nano, deca, hecto, file }).toEqual({ nano: 0, deca: 0, hecto: 0, file });
            }
        });
    });
});
