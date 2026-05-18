/**
 * P0.2 — B2B BO `all_backorder` Customer LIFF Render Drift Detector
 * 2026-05-18 (Dead-Workflow Remediation Spec V.1.0)
 *
 * Pins V.4.0+ all_backorder render in 2 files:
 *   1. Snippet 11 V.30.6 — labels + colors + step_map + embed trigger
 *   2. Snippet 16 V.4.0/V.4.1 — shortcode [b2b_bo_customer_order_detail]
 *      branch for all_backorder (amber bg #fef3c7 / header #b45309 / cancel CTA)
 *
 * Regression risk: if status enum drift adds new state but render code only
 * handles partial_fulfilled → customer sees generic page, no cancel button,
 * may "ยืนยันบิล" wrongly OR get stuck.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const SN11 = path.join(REPO, '[B2B] Snippet 11: Customer LIFF Pages');
const SN16 = path.join(REPO, '[B2B] Snippet 16: Backorder System');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/^\s*\*.*$/gm, '');
}

describe('P0.2 — B2B all_backorder customer LIFF render drift', () => {

    /* ─ Snippet 11 (customer LIFF orders page) ─ */
    test('Snippet 11 labels map includes all_backorder', () => {
        const src = stripComments(read(SN11));
        expect(src).toMatch(/\$labels\[\s*['"]all_backorder['"]\s*\]\s*=\s*['"][^'"]*BO[^'"]*['"]/);
    });

    test('Snippet 11 colors map includes all_backorder (amber #b45309)', () => {
        const src = stripComments(read(SN11));
        // Color map literal — exact #b45309 (Sprint 4 amber canonical)
        expect(src).toMatch(/['"]all_backorder['"]\s*=>\s*['"]#b45309['"]/);
    });

    test('Snippet 11 bg map includes all_backorder amber bg #fef3c7', () => {
        const src = stripComments(read(SN11));
        expect(src).toMatch(/['"]all_backorder['"]\s*=>\s*['"]#fef3c7['"]/);
    });

    test('Snippet 11 step_map includes all_backorder = 0 (no billing step yet)', () => {
        const src = stripComments(read(SN11));
        // step_map entry — step 0 because billing not yet
        expect(src).toMatch(/['"]all_backorder['"]\s*=>\s*0/);
    });

    test('Snippet 11 embeds BO detail shortcode when status is all_backorder', () => {
        const src = stripComments(read(SN11));
        // Embed trigger must check all 3 BO statuses
        expect(src).toMatch(/in_array\s*\(\s*\$s\s*,\s*array\s*\([^)]*['"]all_backorder['"]/);
        expect(src).toMatch(/shortcode_exists\s*\(\s*['"]b2b_bo_customer_order_detail['"]/);
    });

    /* ─ Snippet 16 (BO orchestration + customer render shortcode) ─ */
    test('Snippet 16 defines b2b_build_flex_all_backorder_customer Flex builder', () => {
        const src = stripComments(read(SN16));
        expect(src).toMatch(/function\s+b2b_build_flex_all_backorder_customer\s*\(/);
    });

    test('Snippet 16 shortcode allows all_backorder status (not just partial_fulfilled)', () => {
        const src = stripComments(read(SN16));
        // Shortcode handler guard must include all_backorder
        expect(src).toMatch(/\$status\s*!==\s*['"]partial_fulfilled['"][\s\S]{0,300}\$status\s*!==\s*['"]all_backorder['"]/);
    });

    test('Snippet 16 renders amber header #b45309 for all_backorder branch', () => {
        const src = stripComments(read(SN16));
        // Branch-specific styling
        expect(src).toMatch(/background:#b45309[\s\S]{0,500}ออเดอร์รอสินค้า BO/);
    });

    test('Snippet 16 shows "ยังไม่เรียกเก็บเงิน" disclaimer (no premature billing)', () => {
        const src = read(SN16);
        expect(src).toContain('ยังไม่เรียกเก็บเงิน');
    });

    test('Snippet 16 renders red cancel button (#dc2626) for all_backorder', () => {
        const src = stripComments(read(SN16));
        // Red cancel CTA — at least one button styled red in all_backorder branch
        expect(src).toMatch(/background:#dc2626[\s\S]{0,200}ยกเลิกออเดอร์ BO/);
    });

    test('Snippet 16 cancel button uses 44px min touch target (a11y)', () => {
        const src = stripComments(read(SN16));
        // min-height:44px on cancel button (iOS HIG)
        expect(src).toMatch(/min-height:44px[\s\S]{0,100}ยกเลิกออเดอร์ BO|ยกเลิกออเดอร์ BO[\s\S]{0,500}min-height:44px/);
    });

    test('Snippet 16 cancel modal uses canonical message field (not legacy content:)', () => {
        const src = stripComments(read(SN16));
        // V.1.3 Modal Helpers contract — must use message:, never content:
        expect(src).toMatch(/dinocoModal\.confirm[\s\S]{0,300}message:/);
        // Negative: must not pass `content:` field to dinocoModal in BO area
        const boSection = src.indexOf('b2b_bo_customer_order_detail');
        if (boSection > 0) {
            const slice = src.substring(boSection, boSection + 5000);
            expect(slice).not.toMatch(/dinocoModal\.confirm\s*\(\s*\{[^}]*content:/);
        }
    });
});
