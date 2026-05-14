/**
 * Claim Slip Viewer drift detector — Sprint 20 Phase 2.7.
 *
 * Pins:
 *   • [Admin System] DINOCO Service Center & Claims V.34.2 — Sprint 17 "ดูสลิป"
 *     toast pointer replaced with full slip viewer modal. Action buttons per
 *     status. Sprint 19 CRIT-1 onConfirm capture pattern preserved. Scoped
 *     `.dnc-cc-slip-viewer-*` CSS.
 */

const fs   = require('fs');
const path = require('path');

const REPO    = path.resolve(__dirname, '../..');
const SC_PATH = path.join(REPO, '[Admin System] DINOCO Service Center & Claims');
const SC_SRC  = fs.readFileSync(SC_PATH, 'utf8');

function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map(line => line.replace(/\s*\/\/.*$/, ''))
        .join('\n');
}
const SC_CODE = stripComments(SC_SRC);

describe('Sprint 20 Phase 2.7 — Slip Viewer modal drift', () => {

    // ─── Version header ───────────────────────────────────────────

    test('Service Center bumped to V.34.2', () => {
        expect(SC_SRC).toMatch(/Version:\s*V\.34\.2\s*\(2026-05-14\)\s*—\s*Sprint 20/);
    });

    // ─── Sprint 17 toast pointer replaced ─────────────────────────

    test('Sprint 17 toast placeholder removed', () => {
        // The old V.34.0 placeholder text must NOT appear in code (was the
        // string "การดูสลิปแบบเต็ม ... จะถูกเพิ่มในเฟสถัดไป").
        expect(SC_CODE).not.toMatch(/จะถูกเพิ่มในเฟสถัดไป/);
    });

    test('scOpenSlipViewer function defined', () => {
        expect(SC_CODE).toMatch(/async\s+function\s+scOpenSlipViewer\s*\(\s*cid\s*\)/);
    });

    test('View slip click handler routes to scOpenSlipViewer', () => {
        // Pattern: $(document).on('click', '[data-action="dnc-cc-view-slip"]', ...)
        const m = SC_CODE.match(/data-action="dnc-cc-view-slip"[^]*?scOpenSlipViewer/);
        expect(m).not.toBeNull();
    });

    // ─── Slip image loaded via auth-gated proxy ───────────────────

    test('Slip image loaded via REST proxy (not raw URL)', () => {
        expect(SC_CODE).toMatch(/\/wp-json\/dinoco-claim\/v1\/charges\/['"]\s*\+\s*parseInt\(\s*c\.id\s*,\s*10\s*\)\s*\+\s*['"]\/slip-image/);
    });

    test('Slip image alt attribute present (a11y)', () => {
        expect(SC_CODE).toMatch(/alt="Slip"/);
    });

    // ─── Action buttons per status ────────────────────────────────

    test('Verify button gated to pending_review only', () => {
        // The conditional branch must mention pending_review before slip-verify
        const idx = SC_CODE.indexOf("c.status === 'pending_review'");
        expect(idx).toBeGreaterThan(0);
        const branchSnippet = SC_CODE.substring(idx, idx + 800);
        expect(branchSnippet).toMatch(/data-action="dnc-cc-slip-verify"/);
        expect(branchSnippet).toMatch(/data-action="dnc-cc-slip-reject"/);
    });

    test('Refund button gated to verified only', () => {
        const idx = SC_CODE.indexOf("c.status === 'verified'");
        expect(idx).toBeGreaterThan(0);
        const branchSnippet = SC_CODE.substring(idx, idx + 400);
        expect(branchSnippet).toMatch(/data-action="dnc-cc-slip-refund"/);
    });

    test('Read-only state for terminal statuses', () => {
        expect(SC_CODE).toMatch(/dnc-cc-slip-viewer-readonly/);
    });

    // ─── Sprint 19 CRIT-1 onConfirm pattern (reject prompt) ───────

    test('Reject uses dinocoModal.prompt with native fallback', () => {
        const idx = SC_CODE.indexOf("[data-action=\"dnc-cc-slip-reject\"]");
        expect(idx).toBeGreaterThan(0);
        const block = SC_CODE.substring(idx, idx + 1200);
        expect(block).toMatch(/window\.dinocoModal\.prompt/);
        expect(block).toMatch(/catch\s*\(\s*e\s*\)/);
        expect(block).toMatch(/prompt\(\s*['"]/); // native fallback
    });

    test('Verify uses dinocoModal.confirm', () => {
        const idx = SC_CODE.indexOf("[data-action=\"dnc-cc-slip-verify\"]");
        expect(idx).toBeGreaterThan(0);
        const block = SC_CODE.substring(idx, idx + 800);
        expect(block).toMatch(/window\.dinocoModal\.confirm/);
        expect(block).toMatch(/catch\s*\(\s*e\s*\)/);
    });

    // ─── REST contract — verify/reject endpoints ──────────────────

    test('Verify POST /charge/{id}/verify with admin_override', () => {
        expect(SC_CODE).toMatch(/\/wp-json\/dinoco-claim\/v1\/charge\/['"]\s*\+\s*cid\s*\+\s*['"]\/verify/);
        expect(SC_CODE).toMatch(/verify_method:\s*['"]admin_override['"]/);
    });

    test('Reject POST /charge/{id}/reject with reason', () => {
        expect(SC_CODE).toMatch(/\/wp-json\/dinoco-claim\/v1\/charge\/['"]\s*\+\s*cid\s*\+\s*['"]\/reject/);
    });

    test('X-WP-Nonce header on verify + reject requests', () => {
        const verifyIdx = SC_CODE.indexOf('/verify');
        const rejectIdx = SC_CODE.indexOf('/reject');
        // Locate nonce headers near these endpoints
        const verifyBlock = SC_CODE.substring(verifyIdx, verifyIdx + 600);
        const rejectBlock = SC_CODE.substring(rejectIdx, rejectIdx + 600);
        expect(verifyBlock).toMatch(/X-WP-Nonce/);
        expect(rejectBlock).toMatch(/X-WP-Nonce/);
    });

    // ─── Slip2Go JSON collapsible ─────────────────────────────────

    test('Slip2Go response collapsible via <details>/<summary>', () => {
        expect(SC_CODE).toMatch(/dnc-cc-slip-viewer-details/);
        expect(SC_CODE).toMatch(/<summary>/);
        expect(SC_CODE).toMatch(/dnc-cc-slip-viewer-json/);
    });

    // ─── Scoped CSS `.dnc-cc-slip-viewer-*` ───────────────────────

    test('Scoped CSS prefix present', () => {
        const matches = SC_CODE.match(/\.dnc-cc-slip-viewer-[a-z-]+/g) || [];
        // ~10+ classes (.dnc-cc-slip-viewer + meta/image/details/json/actions/
        // btn/btn-ok/btn-bad/btn-warn/readonly)
        expect(matches.length).toBeGreaterThan(10);
    });

    test('Status-tinted action button colors follow Sprint 4 canon', () => {
        // brand-green ok / danger-red bad / amber warn
        expect(SC_CODE).toMatch(/dnc-cc-slip-viewer-btn-ok[\s\S]{0,200}#16A34A/);
        expect(SC_CODE).toMatch(/dnc-cc-slip-viewer-btn-bad[\s\S]{0,200}#DC2626/);
        expect(SC_CODE).toMatch(/dnc-cc-slip-viewer-btn-warn[\s\S]{0,200}#B45309/);
    });

    test('44px+ touch target on slip viewer buttons', () => {
        expect(SC_CODE).toMatch(/\.dnc-cc-slip-viewer-btn\s*\{[\s\S]{0,200}min-height:44px/);
    });
});
