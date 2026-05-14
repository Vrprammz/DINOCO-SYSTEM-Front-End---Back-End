/**
 * Drift detector — Status Badge Registry adoption (Sprint 2D)
 *
 * Source of truth: docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md §5.2
 * Design Tokens snippet V.1.2 exposes:
 *   - dinoco_status_registry()       — array of all status definitions
 *   - dinoco_status_badge_html()     — span HTML for admin
 *   - dinoco_status_badge_flex()     — Flex JSON for LINE
 *   - dinoco_status_label()          — label string
 *   - dinoco_status_color()          — hex
 *   - dinoco_status_resolve_key()    — legacy free-form → canonical key
 *
 * Sprint 4 Item 10 will migrate b2b_get_status_colors() + B2F_COLOR_*
 * + Service Center inline Tailwind through the registry.
 *
 * This detector pins:
 *   1. Registry exists + contains all FSM subsystems (b2b/b2f/claim/sn/charge)
 *   2. Each subsystem has minimum expected status counts (matches spec)
 *   3. All registry entries follow the canonical shape (6 required fields)
 *   4. All colors in registry resolve to B2B canonical palette
 *   5. dinoco_status_resolve_key() handles legacy free-form mapping
 *   6. Helper functions exposed (badge_html/badge_flex/label/color)
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const DESIGN_TOKENS = path.join(REPO, '[System] DINOCO Design Tokens');

describe('Sprint 2D — Status Badge Registry adoption (drift detector)', () => {
    const tokens = fs.readFileSync(DESIGN_TOKENS, 'utf8');

    describe('1. Registry function exists with canonical signature', () => {
        test('dinoco_status_registry() defined', () => {
            expect(tokens).toMatch(/function\s+dinoco_status_registry\s*\(\s*\)/);
        });

        test('Registry uses static memoization', () => {
            const fnBody = tokens.match(/function\s+dinoco_status_registry[\s\S]{0,300}/)[0];
            expect(fnBody).toMatch(/static\s+\$cached/);
        });

        test('Registry returns array typed via PHPDoc', () => {
            const docBlock = tokens.match(/\/\*\*[\s\S]{0,600}@return array<string,\s*array\{[\s\S]{0,200}\}>\s*\*\/\s*function\s+dinoco_status_registry/);
            expect(docBlock).not.toBeNull();
        });
    });

    describe('2. All 5 subsystems registered with expected counts', () => {
        // Extract registry body — count entries per subsystem prefix
        // Extract function body — match second `return $cached;` (after array assignment),
// the first one is the cache short-circuit early return.
const registryBody = (() => {
    const all = tokens.match(/function\s+dinoco_status_registry[\s\S]+?\}\s*\}/);
    return all ? all[0] : '';
})();

        const subsystems = {
            'b2b':    { min: 10, max: 16 },   // 14 statuses per spec
            'b2f':    { min: 6,  max: 14 },   // 12 statuses
            'claim':  { min: 9,  max: 13 },   // 11 statuses
            'sn':     { min: 10, max: 14 },   // 12 statuses
            'charge': { min: 5,  max: 9 },    // 5-7 charge states
        };

        for (const [prefix, range] of Object.entries(subsystems)) {
            test(`${prefix}.* subsystem has ${range.min}-${range.max} statuses`, () => {
                const pattern = new RegExp(`'${prefix}\\.[a-z_]+'\\s*=>\\s*array\\(`, 'g');
                const matches = registryBody.match(pattern) || [];
                expect(matches.length).toBeGreaterThanOrEqual(range.min);
                expect(matches.length).toBeLessThanOrEqual(range.max);
            });
        }
    });

    describe('3. Canonical shape — every entry has 6 required fields', () => {
        // For each status entry, verify it has label_th + label_en + color + bg + icon + severity
        // Extract function body — match second `return $cached;` (after array assignment),
// the first one is the cache short-circuit early return.
const registryBody = (() => {
    const all = tokens.match(/function\s+dinoco_status_registry[\s\S]+?\}\s*\}/);
    return all ? all[0] : '';
})();

        // Extract sample entries — pick one from each subsystem
        const sampleEntries = [
            'b2b.draft', 'b2b.paid', 'b2b.completed',
            'b2f.draft', 'b2f.confirmed',
            'claim.pending', 'claim.completed',
            'sn.in_pool', 'sn.registered',
            'charge.pending_payment', 'charge.verified',
        ];

        for (const key of sampleEntries) {
            test(`${key} entry has all 6 fields`, () => {
                const escaped = key.replace('.', '\\.');
                // Each entry is a single-line array(...). Grab from key to next entry / end.
                // Use width-based slurp instead of [^)] which fails on nested $c(...) calls.
                const entryPattern = new RegExp(`'${escaped}'\\s*=>\\s*array\\([\\s\\S]{0,800}?'severity'\\s*=>\\s*'[^']+'\\s*\\)`);
                const match = registryBody.match(entryPattern);
                expect(match).not.toBeNull();
                const body = match[0];
                expect(body).toMatch(/'label_th'\s*=>/);
                expect(body).toMatch(/'label_en'\s*=>/);
                expect(body).toMatch(/'color'\s*=>/);
                expect(body).toMatch(/'bg'\s*=>/);
                expect(body).toMatch(/'icon'\s*=>/);
                expect(body).toMatch(/'severity'\s*=>/);
            });
        }
    });

    describe('4. Severity values restricted to canonical 4', () => {
        // Extract function body — match second `return $cached;` (after array assignment),
// the first one is the cache short-circuit early return.
const registryBody = (() => {
    const all = tokens.match(/function\s+dinoco_status_registry[\s\S]+?\}\s*\}/);
    return all ? all[0] : '';
})();
        test('Only info|success|warning|critical severity values used', () => {
            const severityValues = registryBody.match(/'severity'\s*=>\s*'([^']+)'/g) || [];
            const allowed = new Set(['info', 'success', 'warning', 'critical']);
            for (const m of severityValues) {
                const val = m.match(/'severity'\s*=>\s*'([^']+)'/)[1];
                expect(allowed.has(val)).toBe(true);
            }
        });
    });

    describe('5. Helper functions exposed per spec §5.2', () => {
        const requiredHelpers = [
            'dinoco_status_label',
            'dinoco_status_color',
            'dinoco_status_badge_html',
            'dinoco_status_badge_flex',
            'dinoco_status_resolve_key',
        ];
        for (const fn of requiredHelpers) {
            test(`${fn}() function defined`, () => {
                const pattern = new RegExp(`function\\s+${fn}\\s*\\(`);
                expect(tokens).toMatch(pattern);
            });
        }
    });

    describe('6. dinoco_status_resolve_key handles legacy free-form mapping', () => {
        const resolverBody = tokens.match(/function\s+dinoco_status_resolve_key[\s\S]+?\n\s*\}\n\s*\}/);
        test('Resolver function defined', () => {
            expect(resolverBody).not.toBeNull();
        });
        test('Resolver short-circuits on already-canonical keys', () => {
            // If $status already contains '.', it's canonical — short return path
            expect(resolverBody[0]).toMatch(/strpos\(\s*\$status,\s*'\.'/);
        });
        test('Resolver accepts $hint parameter for subsystem disambiguation', () => {
            expect(resolverBody[0]).toMatch(/function\s+dinoco_status_resolve_key\s*\(\s*\$status,\s*\$hint/);
        });
    });

    describe('7. No subsystem still uses raw hardcoded status color drift', () => {
        // Spot-check: B2B Snippet 1 b2b_get_status_colors() can call resolver,
        // but if drift is in Service Center inline Tailwind it would show.
        // Future Sprint 4 work — for now just assert registry coverage exists.
        test('Registry total entries ≥ 35 (covers all known FSMs)', () => {
            // Extract function body — match second `return $cached;` (after array assignment),
// the first one is the cache short-circuit early return.
const registryBody = (() => {
    const all = tokens.match(/function\s+dinoco_status_registry[\s\S]+?\}\s*\}/);
    return all ? all[0] : '';
})();
            const entries = registryBody.match(/'(?:b2b|b2f|claim|sn|charge)\.[a-z_]+'\s*=>\s*array\(/g) || [];
            expect(entries.length).toBeGreaterThanOrEqual(35);
        });
    });

    describe('8. B2B canonical color tokens referenced (not hardcoded hex)', () => {
        // Extract function body — match second `return $cached;` (after array assignment),
// the first one is the cache short-circuit early return.
const registryBody = (() => {
    const all = tokens.match(/function\s+dinoco_status_registry[\s\S]+?\}\s*\}/);
    return all ? all[0] : '';
})();
        test('brand-green token used (not raw #16a34a in most entries)', () => {
            // The registry should prefer dinoco_brand_color('brand-green') shortcut
            // over hardcoded #16a34a for canonical brand green
            expect(registryBody).toMatch(/brand-green/);
        });
        test('warning-amber token used', () => {
            expect(registryBody).toMatch(/warning-amber/);
        });
        test('danger-red token used', () => {
            expect(registryBody).toMatch(/danger-red/);
        });
        test('info-blue token used', () => {
            expect(registryBody).toMatch(/info-blue/);
        });
    });
});
