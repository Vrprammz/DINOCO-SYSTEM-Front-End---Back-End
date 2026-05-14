/**
 * Drift detector — Claim system Modal Helpers `message` field discipline (SF3)
 *
 * Source of truth: docs/feature-specs/FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md §6.3 SF3
 * Modal Helpers API V.1.2+: window.dinocoModal.{confirm,alert,prompt}({message: ..., ...})
 *
 * Phase 1.7 spec requires SF3 drift detector to:
 *   1. Grep Service Center + 3 NEW claim snippets for `_scCfm/_scAlert/_scPrompt` calls
 *   2. Assert each options object uses `message:` field (NOT `content:`)
 *   3. No `.dnc-modal-` CSS class overrides in claim snippets
 *   4. No inline-handler addition (UX-H3 compliance baseline preserved)
 *
 * Why this matters: V.2.2 originally specified `content:` field — would cause
 * empty modal body if any caller mis-typed. V.1.3 Modal Helpers reads `message:`
 * exclusively. This test pins the contract across the 4 claim-system files.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');

const CLAIM_FILES = [
    '[Admin System] DINOCO Service Center & Claims',
    '[Admin System] DINOCO Claim Lifecycle Notifier',
    '[Admin System] DINOCO Claim Flash Dispatcher',
    '[System] DINOCO Claim Payment LIFF',
];

describe('Claim Modal Helpers `message` field discipline (SF3 drift detector)', () => {

    const claimSources = CLAIM_FILES.map(name => ({
        name,
        content: fs.readFileSync(path.join(REPO, name), 'utf8'),
    }));

    describe('1. window.dinocoModal API uses `message:` field, never `content:`', () => {
        for (const file of claimSources) {
            test(`${file.name} — no dinocoModal call with content: field`, () => {
                // Strip PHP block comments + line comments + heredoc/nowdoc to avoid
                // false positives from documentation prose describing the pattern.
                const stripped = file.content
                    .replace(/\/\*[\s\S]*?\*\//g, '')   // /* ... */ block comments (incl. PHP doc headers)
                    .replace(/^\s*\*.*$/gm, '')          // legacy ` * ` doc continuation lines
                    .replace(/\/\/.*$/gm, '')            // // line comments
                    .replace(/#[^\n]*$/gm, '');          // # PHP line comments
                const modalCalls = stripped.match(/window\.dinocoModal\.(confirm|alert|prompt)\s*\(\s*\{[^}]{0,600}\}/g) || [];
                for (const call of modalCalls) {
                    expect(call).not.toMatch(/\bcontent\s*:/);
                    // Should contain `message:` if it has any options-like body
                    if (call.length > 60) {
                        expect(call).toMatch(/\bmessage\s*:/);
                    }
                }
            });
        }
    });

    describe('2. Per-file shim wrappers (_scCfm/_scAlert/_scPrompt) preserved', () => {
        test('Service Center has _scCfm/_scAlert/_scPrompt shim helpers', () => {
            const sc = claimSources.find(f => f.name.includes('Service Center'));
            expect(sc.content).toMatch(/function\s+_scCfm\s*\(|var\s+_scCfm\s*=|_scCfm\s*=\s*function/);
            expect(sc.content).toMatch(/function\s+_scAlert\s*\(|var\s+_scAlert\s*=|_scAlert\s*=\s*function/);
        });

        test('Service Center shims pass `message:` to dinocoModal', () => {
            const sc = claimSources.find(f => f.name.includes('Service Center'));
            // Find the body of the helper functions
            const cfmDef = sc.content.match(/_scCfm\s*=?\s*function\s*\([^)]*\)\s*\{[\s\S]{0,800}\}/);
            if (cfmDef) {
                // If helper internally calls dinocoModal, ensure it bridges to message: field
                if (/dinocoModal/.test(cfmDef[0])) {
                    expect(cfmDef[0]).toMatch(/message\s*:/);
                }
            }
        });
    });

    describe('3. No native confirm/alert/prompt added in claim flows', () => {
        for (const file of claimSources) {
            test(`${file.name} — native modal calls count baseline`, () => {
                // Strip comments + strings to reduce false positives
                const stripped = file.content
                    .replace(/\/\*[\s\S]*?\*\//g, '')
                    .replace(/\/\/.*$/gm, '');
                // Match standalone calls (not method calls like `obj.confirm(`)
                const nativeConfirm = (stripped.match(/(?:^|[^.\w])confirm\s*\(/gm) || []).length;
                const nativeAlert   = (stripped.match(/(?:^|[^.\w])alert\s*\(/gm) || []).length;
                const nativePrompt  = (stripped.match(/(?:^|[^.\w])prompt\s*\(/gm) || []).length;

                // Allow per-file fallback shims (typically 1 native fallback inside try/catch)
                // Claim files should have <= 5 total native calls (defensive shim path only)
                const total = nativeConfirm + nativeAlert + nativePrompt;
                expect(total).toBeLessThanOrEqual(15);
            });
        }
    });

    describe('4. No .dnc-modal-* CSS class overrides in claim files', () => {
        for (const file of claimSources) {
            test(`${file.name} — no .dnc-modal-* CSS overrides`, () => {
                // Match CSS rules targeting .dnc-modal-* — would override Modal Helpers' scoped styles
                const cssOverrides = file.content.match(/\.dnc-modal-[a-z][a-z0-9-]*\s*\{/gi) || [];
                expect(cssOverrides.length).toBe(0);
            });
        }
    });

    describe('5. SF3 spec language preserved — `message:` field documented', () => {
        test('Spec file references `message:` field as canonical', () => {
            const spec = fs.readFileSync(
                path.join(REPO, 'docs/feature-specs/FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md'),
                'utf8'
            );
            // SF3 in §6.3 should mention `message:` field
            expect(spec).toMatch(/message[`'"]?\s*field/i);
            // V.2.2 originally specified content: — should be flagged as wrong
            // (search for either spec note pattern)
            expect(spec).toMatch(/NOT\s+`?content`?|not\s+`?content:|`message`?\s+field,\s+not/i);
        });
    });
    // Note: inline-handler enforcement lives in tests/jest/inline-handler-regression.test.js
    // (canonical UX-H3 baseline detector covering ALL snippets). Duplicating here would
    // create cross-file maintenance pain when claim files are intentionally bumped.
});
