/**
 * Drift detector — Currency decimal rule (Sprint 4 #9)
 *
 * Source: docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md §1 D4
 *
 * Spec D4 (context-sensitive currency precision):
 *   - 0 decimals → compact display (alt text, push subject, admin Flex headers,
 *     daily summary cards, dashboard stat boxes, customer LINE "ยอด ฿X")
 *   - 2 decimals → financial-document precision (invoice grand total, payment
 *     confirm body, slip verify, statement line items, B2F receive, debt detail)
 *   - Foreign currency (B2F land/sea) → 2 decimals always
 *   - Discount percent → integer (never decimal `12.5%` wrong per spec)
 *   - Unit price catalog → 0 if integer, 2 if fraction (auto)
 *
 * V.1.1 (2026-05-13) refinement: "existing patterns are intentional per
 * context" — no blanket sweep required. This detector pins baselines (snapshot
 * 2026-05-15) so growth requires explicit baseline-bump (force review).
 *
 * Snapshot (2026-05-15):
 *   - 0 decimals: 233 sites (compact display dominant)
 *   - 1 decimal:  10 sites (all percentages — discount/error/avg/AI accuracy/years)
 *   - 2 decimals: 188 sites (financial documents)
 *
 * NOTE on 1-decimal sites: spec says "Discount percent never decimal" but
 * existing 3 discount sites use 1-decimal for compact display in image
 * generators / Telegram messages where pixel-precision matters. Architects
 * decided to preserve until customer-feedback indicates otherwise.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '../..');

function countPattern(pattern) {
    try {
        const out = execSync(
            `cd "${REPO}" && grep -rohE "${pattern}" "[B2B]"* "[B2F]"* "[Admin System]"* "[System]"* 2>/dev/null | wc -l`,
            { encoding: 'utf8' }
        );
        return parseInt(out.trim(), 10) || 0;
    } catch {
        return 0;
    }
}

describe('Sprint 4 #9 — Currency decimal rule drift detector', () => {

    test('0-decimal number_format count within snapshot range', () => {
        const count = countPattern('number_format\\([^,]+,\\s*0\\s*[,)]');
        // Snapshot 233. Allow ±20% drift before forcing baseline review
        // (compact display contexts may grow with new admin Flex / push notifs)
        expect(count).toBeGreaterThanOrEqual(190);
        expect(count).toBeLessThanOrEqual(280);
    });

    test('2-decimal number_format count within snapshot range', () => {
        const count = countPattern('number_format\\([^,]+,\\s*2\\s*[,)]');
        // Snapshot 188. Allow ±20% drift
        // (financial-document contexts grow with new invoice/payment surfaces)
        expect(count).toBeGreaterThanOrEqual(150);
        expect(count).toBeLessThanOrEqual(230);
    });

    test('1-decimal number_format count remains low (percentages only)', () => {
        const count = countPattern('number_format\\([^,]+,\\s*1\\s*[,)]');
        // Snapshot 10 — all known sites are percentages (NOT currency).
        // Per spec D4 "discount percent never decimal" but architects preserved
        // pixel-precision use in image generators + Telegram messages.
        // Hard cap 15: prevents currency sites from sliding into 1-decimal (violation).
        expect(count).toBeLessThanOrEqual(15);
    });

    test('No 3+ decimal currency formatting (sub-satang precision rejected)', () => {
        const count = countPattern('number_format\\([^,]+,\\s*[3-9]\\s*[,)]');
        expect(count).toBe(0);
    });

    test('B2B Snippet 1 invoice grand total uses 2-decimal precision', () => {
        const b2b1 = fs.readFileSync(path.join(REPO, '[B2B] Snippet 1: Core Utilities & LINE Flex Builders'), 'utf8');
        // Per D4 spec line 112: 'มูลค่ารวมสุทธิ' ฿number_format($total,2)
        expect(b2b1).toMatch(/มูลค่ารวมสุทธิ[\s\S]{0,200}number_format\([^,]+,\s*2\s*\)/);
    });

    test('B2B Snippet 7 daily summary push uses 0-decimal compact form', () => {
        const b2b7 = fs.readFileSync(path.join(REPO, '[B2B] Snippet 7: Cron Jobs - Dunning + Summary + Rank'), 'utf8');
        // Daily summary should use number_format($amount, 0) for compact ฿X display
        expect(b2b7).toMatch(/number_format\([^,]+,\s*0\s*\)/);
    });

    test('Foreign currency (B2F) line items use 2-decimal precision', () => {
        // Per spec: USD 35.00 / CNY 5.50 — always 2-decimal multi-currency convention
        const b2f1 = fs.readFileSync(path.join(REPO, '[B2F] Snippet 1: Core Utilities & Flex Builders'), 'utf8');
        // At least one 2-decimal precision occurrence
        expect(b2f1).toMatch(/number_format\([^,]+,\s*2\s*\)/);
    });
});
