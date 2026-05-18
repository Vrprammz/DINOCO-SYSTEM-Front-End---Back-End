/**
 * P0.4 — SN Photo OCR Customer Feedback Drift Detector
 * 2026-05-18 (Dead-Workflow Remediation Spec V.1.0)
 *
 * Pins claim-flow.js V.4.2 contract for composeOcrMisreadCustomerMessage()
 * + wiring into photo_requested case. Source-level static analysis (no
 * require() — avoids pulling MongoDB dependency for unit test).
 *
 * Why this matters: V.4.1 had silent ocr_misread_suspect rejection →
 * customer stuck. V.4.2 adds 2-option customer feedback (retry photo OR
 * type S/N manually) + resets status=photo_rejected for retry.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const CLAIM_FLOW = path.join(REPO, 'openclawminicrm/proxy/modules/claim-flow.js');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/^\s*\*.*$/gm, '');
}

describe('P0.4 — OCR misread customer feedback drift', () => {
    const src = read(CLAIM_FLOW);
    const stripped = stripComments(src);

    test('V.4.2 helper composeOcrMisreadCustomerMessage exists', () => {
        expect(stripped).toMatch(/function\s+composeOcrMisreadCustomerMessage\s*\(\s*ocr\s*\)/);
    });

    test('Helper returns null for empty/missing flags', () => {
        // Verify null-guard branches present
        expect(stripped).toMatch(/Array\.isArray\s*\(\s*ocr\.validationFlags\s*\)/);
        expect(stripped).toMatch(/ocr\.validationFlags\.length\s*===\s*0[\s\S]{0,50}return null/);
    });

    test('Helper detects ocr_misread_suspect via .some() check', () => {
        expect(stripped).toMatch(/ocr\.validationFlags\.some\s*\([\s\S]{0,100}ocr_misread_suspect/);
    });

    test('Customer message offers 2-option fallback (retry photo OR manual S/N input)', () => {
        // Option 1: retry photo
        expect(stripped).toMatch(/ส่งภาพอีกครั้ง|ถ่ายใกล้|แสงเพียงพอ/);
        // Option 2: manual input
        expect(stripped).toMatch(/พิมพ์เลข S\/N|DNCSS\d{7}/);
    });

    test('Customer message educates about ambiguous chars (1↔I↔L / 0↔O)', () => {
        expect(stripped).toMatch(/1↔I↔L|0↔O|อ่านสับสน/);
    });

    test('Helper does NOT leak sensitive validation states (§15.14.5 rule)', () => {
        // The function body must not mention voided/recalled/stolen/fraud
        // in the customer-facing message text
        const fnMatch = stripped.match(/function\s+composeOcrMisreadCustomerMessage[\s\S]{0,2000}^}/m);
        expect(fnMatch).not.toBeNull();
        const fnBody = fnMatch[0];
        // Customer message must not echo sensitive states
        expect(fnBody).not.toMatch(/voided|recalled|stolen|fraud|fake|impostor/i);
        // Customer message text section (after the array literal opens)
        expect(fnBody).not.toMatch(/ปลอม|ขโมย|ถูกเรียกคืน/);
    });

    test('Helper exported in module.exports', () => {
        expect(stripped).toMatch(/composeOcrMisreadCustomerMessage\s*,?\s*$/m);
    });

    /* ─ Wiring into photo_requested case ─ */
    test('photo_requested case calls composeOcrMisreadCustomerMessage after runPhotoOcrValidation', () => {
        const pwiCase = stripped.match(/case\s+["']photo_requested["'][\s\S]{0,3000}/);
        expect(pwiCase).not.toBeNull();
        const slice = pwiCase[0];
        // Must call runPhotoOcrValidation
        expect(slice).toMatch(/runPhotoOcrValidation/);
        // Must call composeOcrMisreadCustomerMessage
        expect(slice).toMatch(/composeOcrMisreadCustomerMessage/);
    });

    test('photo_requested resets status=photo_rejected when misread detected (retry-safe)', () => {
        // After misread message, status must be reset so next photo retries the flow
        const ocrBranchMatch = stripped.match(/if\s*\(\s*ocrMisreadMessage\s*\)\s*\{[\s\S]{0,500}\}/);
        expect(ocrBranchMatch).not.toBeNull();
        expect(ocrBranchMatch[0]).toMatch(/photo_rejected/);
        expect(ocrBranchMatch[0]).toMatch(/return\s+ocrMisreadMessage/);
    });

    test('V.4.2 header documents P0.4 source + Dead-Workflow Spec', () => {
        // Top docblock must mention V.4.2 + P0.4 + Spec V.1.0
        const headerMatch = src.match(/V\.4\.2[\s\S]{0,500}/);
        expect(headerMatch).not.toBeNull();
        expect(headerMatch[0]).toMatch(/P0\.4|Dead-Workflow/);
    });
});
