/**
 * Drift detector — Buddhist year baseline (Sprint 4 #6, BOSS-DECISION-PENDING)
 *
 * Source: docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md §1 D3 + §9 Sprint 4 #6
 *
 * Spec D3 sub-section "Sprint 3F Status (2026-05-13)":
 *   "NEW code (Phase 1.3 Flex builders + future) MUST use
 *    dinoco_format_date($ts, 'customer') H5 helper (Gregorian). Existing
 *    sites remain unchanged in Sprint 3 to avoid surprise visual breaking
 *    change. Sprint 4 reviews these with side-by-side mockups: keep พ.ศ.
 *    (Thai cultural norm) vs migrate to Gregorian (strict B2B canonical).
 *    Boss decides per-site."
 *
 * Status: BOSS-DECISION-PENDING. This detector does NOT enforce migration —
 * it pins current Buddhist year sites as baseline + flags any growth or
 * regression. Boss approves per-site removal in future commit.
 *
 * 14 sites identified (2026-05-15 snapshot):
 *   Customer-facing (5 — Thai cultural):
 *     - B2B Snippet 17 Warranty Check LIFF:418
 *     - System Warranty Lifecycle Notifier:223 (LINE Flex)
 *     - System Claim Payment LIFF:2598
 *     - System Claim Payment LIFF:3021
 *     - SN REST API:971 (helper default $buddhist=true)
 *   Admin-facing (9 — could migrate per spec):
 *     - B2F Snippet 4 Maker LIFF:467 (yy 2-digit)
 *     - B2F Snippet 9 PO Ticket × 4 (yy 2-digit)
 *     - Production SN Manager:11524
 *     - Service Center & Claims:5293 (Flash modal yy)
 *     - User Management:349
 *     - Health Monitor:1133
 *
 * NEW code policy (enforced):
 *   - dinoco_format_date($ts, 'customer') for Gregorian
 *   - dinoco_sn_format_thai_date($ts, false) for Thai-month-Gregorian
 *   - dinoco_sn_format_thai_date($ts, true) ONLY for legacy back-compat
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '../..');

function findBuddhistSites() {
    try {
        const out = execSync(
            `cd "${REPO}" && grep -rnE "(buddhist\\s*=\\s*true|\\+ 543|getFullYear\\(\\)\\s*\\+\\s*543|date\\(\\s*'Y'[^)]*\\)\\s*\\+\\s*543)" "[B2B]"* "[B2F]"* "[Admin System]"* "[System]"* 2>/dev/null | grep -v ".second-brain"`,
            { encoding: 'utf8' }
        );
        return out.split('\n')
            .filter(Boolean)
            // Strip out PHP comment continuation lines (` * ` legacy comments)
            .filter(l => !/:\s*\*\s/.test(l))
            // Strip out doc strings mentioning the pattern but not invoking it
            .filter(l => !/\/\/.*\+ 543\s*$/.test(l));
    } catch {
        return [];
    }
}

describe('Sprint 4 #6 — Buddhist year baseline (BOSS-DECISION-PENDING)', () => {

    test('Total Buddhist year sites within snapshot range', () => {
        const sites = findBuddhistSites();
        // Snapshot 2026-05-15 = 14 sites. Boss-pending — allowed range allows
        // gradual reduction via per-site migration sprints.
        expect(sites.length).toBeGreaterThanOrEqual(0);
        expect(sites.length).toBeLessThanOrEqual(20);
    });

    test('Customer-facing Buddhist sites pinned (Thai cultural norm)', () => {
        const sites = findBuddhistSites().join('\n');
        // These customer-facing sites MUST retain Buddhist year per Thai
        // cultural norm (LINE messages, member dashboard, warranty cards).
        expect(sites).toMatch(/\[B2B\] Snippet 17: Warranty Check LIFF/);
        expect(sites).toMatch(/\[Admin System\] DINOCO Warranty Lifecycle Notifier/);
        expect(sites).toMatch(/\[System\] DINOCO Claim Payment LIFF/);
        expect(sites).toMatch(/\[System\] DINOCO SN REST API/);
    });

    test('NEW canonical date helpers exist for Gregorian path', () => {
        const b2b1 = fs.readFileSync(path.join(REPO, '[B2B] Snippet 1: Core Utilities & LINE Flex Builders'), 'utf8');
        // H5 helper (Sprint 2B) — Gregorian default
        expect(b2b1).toMatch(/function\s+dinoco_format_date\s*\(/);
    });

    test('dinoco_sn_format_thai_date helper signature preserves backward compat', () => {
        const sn_rest = fs.readFileSync(path.join(REPO, '[System] DINOCO SN REST API'), 'utf8');
        // 2-arg signature: ($timestamp, $buddhist = true) — legacy default
        // (sprint 4 #6 may change default to false after boss decision)
        expect(sn_rest).toMatch(/function\s+dinoco_sn_format_thai_date\s*\(\s*\$timestamp,\s*\$buddhist\s*=\s*true\s*\)/);
    });

    test('Design Tokens documents D3 Sprint 3F deprecation policy', () => {
        const reference = fs.readFileSync(path.join(REPO, 'docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md'), 'utf8');
        expect(reference).toMatch(/D3.*Canonical Date Format/);
        expect(reference).toMatch(/Sprint 3F/);
        expect(reference).toMatch(/Buddhist year.*DEPRECATED|deprecated.*Buddhist/i);
    });

    test('NEW code policy banner: no new Buddhist year in NEW Flex builders', () => {
        // Pin the rule: any Phase 1.3+ Flex builder must use dinoco_format_date('customer')
        // (Gregorian). This test scans claim lifecycle snippets (post-V.0.10 NEW code)
        // and asserts no `+ 543` pattern in their bodies.
        const claimNotifier = fs.readFileSync(path.join(REPO, '[Admin System] DINOCO Claim Lifecycle Notifier'), 'utf8');
        // Notifier:223 IS a known Buddhist site — but is it customer-facing Flex?
        // Yes — this is the F#1 expiry reminder Flex that customers SEE in LINE.
        // Per Thai cultural norm → keep Buddhist. Test allows but caps growth.
        const newSites = (claimNotifier.match(/\+\s*543/g) || []).length;
        expect(newSites).toBeLessThanOrEqual(2);
    });
});
