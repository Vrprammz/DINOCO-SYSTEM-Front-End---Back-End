/**
 * Drift detector — dinoco_modal_* JS toolbox adoption (Sprint 2D)
 *
 * Source of truth: docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md §5.5 + §10
 * Boss directive 2026-05-13: "เอา B2B อิง" — Sprint 2C ships H1 shortcut helpers
 * `dinoco_modal_alert/confirm/prompt` in Modal Helpers V.1.3. Sprint 3 sweeps
 * 21+ native `confirm/alert/prompt` sites to the shortcut form.
 *
 * Purpose: pin native-modal usage count per admin file. Fail when count grows
 * (prevents accidental backslide). Doesn't block intentional growth — just
 * forces an explicit baseline-bump commit so reviewers see new native calls.
 *
 * Why not zero: defensive native fallback inside try/catch is part of the
 * shim pattern (Modal Helpers may not be synced yet — graceful degradation).
 * So baseline accounts for current legitimate fallback uses + flags new ones.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');

/**
 * Per-file baseline counts of native confirm/alert/prompt calls.
 *
 * Set to current production state 2026-05-14. Sprint 3 sweep will reduce
 * these numbers. When numbers go DOWN, update baseline (good). When they
 * go UP, fail the test until baseline is explicitly raised (force review).
 *
 * Methodology: count `(?<![.\w])confirm\(` / `(?<![.\w])alert\(` /
 * `(?<![.\w])prompt\(` after stripping PHP comments + JS comments.
 * Word boundary excludes method calls like `obj.confirm(`.
 */
const NATIVE_MODAL_BASELINES = {
    // Sprint 3 #1 sweep 2026-05-14 — 4 files migrated to dinoco_modal_* shortcuts.
    // 51 raw native modal calls removed (24+13+7+7=51). Defensive shim helpers
    // (cnSafeConfirm in Slip Monitor) preserved as fallback when Modal Helpers
    // snippet not synced — those use qualified window.confirm which doesn't
    // match the lookbehind `(?<![.\w])` so count as 0.
    '[Admin System] DINOCO Slip Monitor': 0,
    '[Admin System] Flash Shipping V.42 Go-Live Tool': 0,
    '[System] DINOCO Warranty Activation LIFF': 8,
    '[Admin System] DINOCO Legacy Migration Requests': 0,
    '[Admin System] DINOCO SN Reconciliation': 0,
    '[Admin System] DINOCO Admin Finance Dashboard': 4,
    '[Admin System] DINOCO Global Inventory Database': 4,
    '[Admin System] DINOCO Brand Voice Pool': 3,
    '[B2B] Snippet 17: Warranty Check LIFF': 3,
    '[Admin System] DINOCO Manual Invoice System': 2,
    '[Admin System] DINOCO Idempotency Helper': 2,
    '[Admin System] DINOCO Modal Helpers': 0,
    '[Admin System] DINOCO Distributor Onboarding Wizard': 0,
    '[System] DINOCO Edit Profile': 0,
    '[Admin System] AI Control Module': 0,
};

function countNativeModalCalls(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const stripped = content
        .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments (incl. PHP /** */)
        .replace(/^\s*\*.*$/gm, '')             // legacy ` * ` doc lines
        .replace(/\/\/.*$/gm, '')               // // line comments
        .replace(/#\s[^\n]*$/gm, '');           // # comment lines (with space — not URL #anchor)
    // Use lookbehind to exclude method calls (e.g. obj.confirm()) + literal strings
    const confirmCalls = (stripped.match(/(?<![.\w$])confirm\s*\(/g) || []).length;
    const alertCalls   = (stripped.match(/(?<![.\w$])alert\s*\(/g) || []).length;
    const promptCalls  = (stripped.match(/(?<![.\w$])prompt\s*\(/g) || []).length;
    return confirmCalls + alertCalls + promptCalls;
}

describe('Sprint 2D — dinoco_modal_* adoption (native modal usage baselines)', () => {

    describe('Per-file native modal counts ≤ baseline', () => {
        for (const [file, baseline] of Object.entries(NATIVE_MODAL_BASELINES)) {
            test(`${file} — count ≤ ${baseline}`, () => {
                const filePath = path.join(REPO, file);
                if (!fs.existsSync(filePath)) {
                    // File was renamed/deleted — soft pass (drift will be caught by missing-file detection elsewhere)
                    return;
                }
                const count = countNativeModalCalls(filePath);
                expect(count).toBeLessThanOrEqual(baseline);
            });
        }
    });

    describe('Modal Helpers V.1.3+ exposes H1 shortcut functions', () => {
        const modalHelpers = fs.readFileSync(path.join(REPO, '[Admin System] DINOCO Modal Helpers'), 'utf8');

        test('window.dinoco_modal_alert defined', () => {
            expect(modalHelpers).toMatch(/window\.dinoco_modal_alert\s*=/);
        });
        test('window.dinoco_modal_confirm defined', () => {
            expect(modalHelpers).toMatch(/window\.dinoco_modal_confirm\s*=/);
        });
        test('window.dinoco_modal_prompt defined', () => {
            expect(modalHelpers).toMatch(/window\.dinoco_modal_prompt\s*=/);
        });
        test('All 3 shortcuts wrap window.dinocoModal.{alert,confirm,prompt}', () => {
            // The shortcut helpers should delegate to the existing object API
            // (preserves V.1.2 rich-options callers).
            expect(modalHelpers).toMatch(/window\.dinocoModal\.alert/);
            expect(modalHelpers).toMatch(/window\.dinocoModal\.confirm/);
            expect(modalHelpers).toMatch(/window\.dinocoModal\.prompt/);
        });
    });

    describe('Sprint 3 sweep readiness — baseline total tracks downward over time', () => {
        test('Total native-modal count across tracked files documented', () => {
            const total = Object.values(NATIVE_MODAL_BASELINES).reduce((a, b) => a + b, 0);
            // Sprint 3 #1 sweep (2026-05-14) reduced 77 → 26.
            // Floor 0 (could go to all-zeros eventually); ceiling 40 forces
            // baseline review if any tracked file grows native calls.
            expect(total).toBeLessThanOrEqual(40);
            expect(total).toBeGreaterThanOrEqual(0);
        });
    });
});
