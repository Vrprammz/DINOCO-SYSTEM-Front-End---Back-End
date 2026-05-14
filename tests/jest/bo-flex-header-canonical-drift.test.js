/**
 * Drift detector — BO Snippet 16 Flex header canonical migration (Sprint 3 #5)
 *
 * Source: docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md §9 Sprint 3 #5
 *   "Force Flex header default — migrate BO Snippet 16 × 8 hardcoded overrides"
 *
 * BO Snippet 16 V.4.3 (2026-05-15) finalized migration. All 8 Flex builders now
 * call `dinoco_flex_header($title, $sub, $severity)` instead of legacy
 * `b2b_flex_logo_header($title, $sub, '#hex', '#fff')` (which bypassed
 * canonical Token registry by passing raw hex colors).
 *
 * Severity mapping enforced by `dinoco_flex_header()` in [B2B] Snippet 1 V.34.33:
 *   - 'info'     → #1A3A5C (brand-navy-flex)
 *   - 'success'  → #16a34a (brand-green)
 *   - 'warning'  → #b45309 (warning-amber UX-H3 contrast)
 *   - 'critical' → #dc2626 (danger-red)
 *
 * This detector pins:
 *   1. Zero `b2b_flex_logo_header(` callers in BO Snippet 16 active code path
 *   2. `dinoco_flex_header(` is the helper used in every Flex builder
 *   3. function_exists guard checks 'dinoco_flex_header' (not legacy name)
 *   4. No raw hex passed as 3rd arg to dinoco_flex_header (severity only)
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const BO_FILE = path.join(REPO, '[B2B] Snippet 16: Backorder System');

describe('Sprint 3 #5 — BO Snippet 16 Flex header canonical migration', () => {
    const content = fs.readFileSync(BO_FILE, 'utf8');

    // Strip PHP block comments + JS-style + legacy ` * ` doc lines
    const stripped = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\*.*$/gm, '')
        .replace(/\/\/.*$/gm, '');

    test('Zero b2b_flex_logo_header( callers in active code', () => {
        const legacyCount = (stripped.match(/b2b_flex_logo_header\s*\(/g) || []).length;
        expect(legacyCount).toBe(0);
    });

    test('dinoco_flex_header( present as canonical Flex header helper', () => {
        const canonicalCount = (stripped.match(/dinoco_flex_header\s*\(/g) || []).length;
        expect(canonicalCount).toBeGreaterThanOrEqual(8);
    });

    test('function_exists guard checks dinoco_flex_header (not legacy)', () => {
        // No remaining function_exists check on legacy name in active code
        expect(stripped).not.toMatch(/function_exists\(\s*['"]b2b_flex_logo_header['"]/);
        // New canonical name guard present
        expect(stripped).toMatch(/function_exists\(\s*['"]dinoco_flex_header['"]/);
    });

    test('No raw hex passed as 3rd arg to dinoco_flex_header (severity only)', () => {
        // Match dinoco_flex_header( ... , ... , 'severity' ) — 3rd arg must be quoted severity name,
        // not '#hex'. Scan all callers.
        const calls = stripped.match(/dinoco_flex_header\s*\([^)]+\)/g) || [];
        const allowedSeverities = new Set(['brand', 'info', 'success', 'warning', 'critical']);
        const offenders = [];
        for (const call of calls) {
            // Match the 3rd quoted arg if present
            const args = call.match(/'[^']*'/g) || [];
            if (args.length >= 3) {
                const severity = args[2].replace(/'/g, '');
                if (severity.startsWith('#')) {
                    offenders.push(`Raw hex 3rd arg: ${call.substring(0, 100)}`);
                } else if (!allowedSeverities.has(severity)) {
                    offenders.push(`Unknown severity "${severity}": ${call.substring(0, 100)}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    test('All 4 severity values represented (info/success/warning/critical)', () => {
        // BO Flex builders cover all 4 severity tiers across the 8 callers.
        expect(stripped).toMatch(/dinoco_flex_header\([^)]+,\s*'info'\s*\)/);
        expect(stripped).toMatch(/dinoco_flex_header\([^)]+,\s*'success'\s*\)/);
        expect(stripped).toMatch(/dinoco_flex_header\([^)]+,\s*'warning'\s*\)/);
        expect(stripped).toMatch(/dinoco_flex_header\([^)]+,\s*'critical'\s*\)/);
    });

    test('Version header documents the V.4.3 migration', () => {
        expect(content).toMatch(/V\.4\.3[\s\S]{0,400}Sprint 3 #5[\s\S]{0,400}dinoco_flex_header/);
    });
});
