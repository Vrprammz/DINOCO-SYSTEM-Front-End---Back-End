/**
 * Claim Pay LIFF drift detector — Sprint 20 Phase 2.7.
 *
 * Pins:
 *   • [System] DINOCO Claim Payment LIFF V.0.8 — shortcode `[dinoco_claim_pay]`
 *     registered + flag-gated, 3-screen UI structure (landing/upload/success),
 *     scoped `.dnc-claim-pay-*` CSS, multipart slip upload XHR pattern with
 *     progress event, NEW endpoints (slip-image proxy + async verify), owner-
 *     transfer cache invalidation listener, Buddhist year date formatter,
 *     data-action delegation throughout (UX-H3 strict).
 *
 * Constraints:
 *   • All version-header documentation is stripped before negative
 *     assertions (S/N R11 lesson — comments do not count).
 */

const fs   = require('fs');
const path = require('path');

const REPO      = path.resolve(__dirname, '../..');
const LIFF_PATH = path.join(REPO, '[System] DINOCO Claim Payment LIFF');
const LIFF_SRC  = fs.readFileSync(LIFF_PATH, 'utf8');

function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map(line => line.replace(/\s*\/\/.*$/, ''))
        .join('\n');
}
const LIFF_CODE = stripComments(LIFF_SRC);

describe('Sprint 20 Phase 2.7 — Claim Pay customer LIFF drift', () => {

    // ─── Version header + LIFF_LOADED constant ────────────────────

    test('LIFF V.0.9 latest + V.0.8 lineage preserved', () => {
        expect(LIFF_SRC).toMatch(/Version:\s*V\.0\.9\s*\(2026-05-14\)\s*—\s*Sprint 22/);
        expect(LIFF_SRC).toMatch(/Version:\s*V\.0\.8\s*\(2026-05-14\)\s*—\s*Sprint 20/);
    });

    test('Sprint 22 — DINOCO_CLAIM_PAYMENT_LIFF_LOADED bumped to 0.9', () => {
        expect(LIFF_CODE).toMatch(/DINOCO_CLAIM_PAYMENT_LIFF_LOADED['"]\s*,\s*['"]0\.9['"]/);
    });

    // ─── Sprint 22 audit fixes ───────────────────────────────────────

    test('Sprint 22 HIGH-3 — slip-image proxy rate limit split per tier', () => {
        expect(LIFF_CODE).toMatch(/\$cap\s*=\s*\$is_admin\s*\?\s*120\s*:\s*30/);
    });

    test('Sprint 22 CRIT-2 — slip-image proxy emits Content-Security-Policy header', () => {
        expect(LIFF_CODE).toMatch(/Content-Security-Policy/);
        expect(LIFF_CODE).toMatch(/default-src\s*'none'[\s\S]*?img-src\s*'self'[\s\S]*?sandbox/);
        expect(LIFF_CODE).toMatch(/X-Frame-Options['"]?\s*,\s*['"]DENY/);
    });

    // ─── Shortcode registration ───────────────────────────────────

    test('[dinoco_claim_pay] shortcode registered', () => {
        expect(LIFF_CODE).toMatch(/add_shortcode\(\s*'dinoco_claim_pay'\s*,\s*'dinoco_claim_pay_render'\s*\)/);
    });

    test('Shortcode flag-gated by dinoco_claim_payment_enabled', () => {
        // Shortcode registration MUST be inside the flag-gated branch (REG-029
        // byte-identical when off).
        const idx = LIFF_CODE.indexOf("add_shortcode( 'dinoco_claim_pay'");
        const flagIdx = LIFF_CODE.indexOf('$dinoco_claim_payment_enabled', idx - 200);
        // Look upward from the shortcode call — flag check appears within
        // 400 chars above it (the surrounding `if` block).
        expect(flagIdx).toBeGreaterThan(0);
        expect(idx - flagIdx).toBeLessThan(400);
    });

    test('Render function exists with function_exists guard', () => {
        expect(LIFF_CODE).toMatch(/if\s*\(\s*!\s*function_exists\(\s*'dinoco_claim_pay_render'\s*\)\s*\)/);
        expect(LIFF_CODE).toMatch(/function\s+dinoco_claim_pay_render\s*\(/);
    });

    // ─── 3-screen HTML structure ──────────────────────────────────

    test('Landing screen present', () => {
        expect(LIFF_CODE).toMatch(/data-screen="landing"/);
    });

    test('Upload screen present', () => {
        expect(LIFF_CODE).toMatch(/data-screen="upload"/);
    });

    test('Success screen present', () => {
        expect(LIFF_CODE).toMatch(/data-screen="success"/);
    });

    test('Bank account copy button data-action', () => {
        expect(LIFF_CODE).toMatch(/data-action="copy-account"/);
    });

    test('Expiry pill class present (countdown UI)', () => {
        expect(LIFF_CODE).toMatch(/dnc-claim-pay-expiry-pill/);
    });

    test('CTA bottom-sticky button data-action', () => {
        expect(LIFF_CODE).toMatch(/data-action="go-upload"/);
    });

    // ─── Scoped CSS prefix `.dnc-claim-pay-` ──────────────────────

    test('Scoped CSS prefix used', () => {
        // 20+ scoped class declarations
        const matches = LIFF_CODE.match(/\.dnc-claim-pay-[a-z-]+/g) || [];
        expect(matches.length).toBeGreaterThan(20);
    });

    test('No global selector leakage', () => {
        // Verify no rules like `body{...}` or top-level `*{...}` inside our
        // style block. `.dnc-claim-pay-app *{...}` is scoped and allowed.
        const styleBlock = LIFF_CODE.match(/<style>[\s\S]*?<\/style>/);
        expect(styleBlock).not.toBeNull();
        const styleSrc = styleBlock[0];
        // A top-level `*` selector would be `\n*` (line-start) or `}\s*\*`
        // (after a closing brace, no scoped prefix). Our scoped wildcard
        // `.dnc-claim-pay-app *{...}` is preceded by `app `, so safe.
        expect(styleSrc).not.toMatch(/(^|\n|\})\s*\*\s*\{/);
        expect(styleSrc).not.toMatch(/(^|\n|\})\s*body\s*\{/);
    });

    test('Color tokens follow Sprint 4 canonical hex (UPPERCASE)', () => {
        // navy
        expect(LIFF_CODE).toMatch(/#1A3A5C/);
        // brand green
        expect(LIFF_CODE).toMatch(/#16A34A/);
        // warning amber
        expect(LIFF_CODE).toMatch(/#B45309/);
        // danger red
        expect(LIFF_CODE).toMatch(/#DC2626/);
    });

    // ─── Slip upload — multipart + XHR + progress ─────────────────

    test('Slip upload uses XHR + FormData (progress event)', () => {
        expect(LIFF_CODE).toMatch(/new XMLHttpRequest\(\)/);
        expect(LIFF_CODE).toMatch(/new FormData\(\)/);
        expect(LIFF_CODE).toMatch(/fd\.append\(\s*'slip_image'/);
        expect(LIFF_CODE).toMatch(/xhr\.upload\.addEventListener\(\s*'progress'/);
    });

    test('Slip upload uses X-WP-Nonce', () => {
        expect(LIFF_CODE).toMatch(/setRequestHeader\(\s*'X-WP-Nonce'\s*,\s*NONCE\s*\)/);
    });

    test('Upload progress bar role=progressbar', () => {
        expect(LIFF_CODE).toMatch(/role="progressbar"/);
    });

    // ─── ARIA + a11y ──────────────────────────────────────────────

    test('ARIA live region for upload status', () => {
        expect(LIFF_CODE).toMatch(/role="status"\s+aria-live="polite"/);
    });

    test('ARIA region role on screens', () => {
        const occurrences = (LIFF_CODE.match(/role="region"/g) || []).length;
        expect(occurrences).toBeGreaterThanOrEqual(3);
    });

    test('Header buttons have aria-label', () => {
        expect(LIFF_CODE).toMatch(/aria-label="ปิด"/);
        expect(LIFF_CODE).toMatch(/aria-label="ย้อนกลับ"/);
    });

    test('prefers-reduced-motion respected', () => {
        expect(LIFF_CODE).toMatch(/@media\s*\(prefers-reduced-motion/);
    });

    test('44px+ touch targets enforced', () => {
        // Close + back buttons declared at 44×44
        expect(LIFF_CODE).toMatch(/\.dnc-claim-pay-close[\s\S]{0,200}width:44px;height:44px/);
        // CTA min-height 56px
        expect(LIFF_CODE).toMatch(/\.dnc-claim-pay-cta-btn[\s\S]{0,200}min-height:56px/);
    });

    // ─── Buddhist year date formatter ─────────────────────────────

    test('Buddhist year date formatter present', () => {
        expect(LIFF_CODE).toMatch(/fmtThaiDate/);
        // BE conversion (+543)
        expect(LIFF_CODE).toMatch(/getFullYear\(\)\s*\+\s*543/);
    });

    // ─── data-action delegation (UX-H3 strict) ────────────────────

    test('No inline event handlers (UX-H3 baseline preserved)', () => {
        // Look inside the rendered HTML output ONLY (between ob_start; and
        // return ob_get_clean) to avoid false-positive on PHP code paths.
        const obStart = LIFF_CODE.indexOf('ob_start()');
        const obEnd   = LIFF_CODE.indexOf('return ob_get_clean()');
        expect(obStart).toBeGreaterThan(0);
        expect(obEnd).toBeGreaterThan(obStart);
        const html = LIFF_CODE.substring(obStart, obEnd);
        // Match `onclick=` etc. as actual HTML attributes (preceded by space/quote)
        // not as JS string references like 'onclick'.
        const re = /[\s'"]on(?:click|change|input|submit|load|error)\s*=\s*["']/i;
        expect(html).not.toMatch(re);
    });

    test('Event delegation via [data-action] selector', () => {
        expect(LIFF_CODE).toMatch(/data-action="close"/);
        expect(LIFF_CODE).toMatch(/data-action="back"/);
        expect(LIFF_CODE).toMatch(/data-action="pick-file"/);
        expect(LIFF_CODE).toMatch(/data-action="submit-upload"/);
        expect(LIFF_CODE).toMatch(/data-action="refresh-status"/);
    });

    // ─── REST endpoint registrations (V.0.8 additions) ────────────

    test('Slip image proxy endpoint registered', () => {
        expect(LIFF_CODE).toMatch(/register_rest_route\(\s*\$base\s*,\s*'\/charges\/\(\?P<id>\\\\d\+\)\/slip-image'/);
        expect(LIFF_CODE).toMatch(/'callback'\s*=>\s*'dinoco_claim_payment_rest_slip_image'/);
    });

    test('Slip image proxy is GET method', () => {
        // Check the proxy registration is GET
        const proxyBlock = LIFF_CODE.match(/register_rest_route\(\s*\$base\s*,\s*'\/charges\/\(\?P<id>\\\\d\+\)\/slip-image'[\s\S]{0,400}/);
        expect(proxyBlock).not.toBeNull();
        expect(proxyBlock[0]).toMatch(/'methods'\s*=>\s*'GET'/);
    });

    test('Sprint 22 HIGH-3 — slip image proxy rate-limited tiered (120/min admin, 30/min owner)', () => {
        // Sprint 22 HIGH-3 split per-tier cap. $cap=120 if admin, 30 else.
        expect(LIFF_CODE).toMatch(/b2b_rate_limit\(\s*'claim_slip_image_'\s*\.\s*\$uid\s*,\s*\$cap\s*,\s*60\s*\)/);
    });

    test('Slip image proxy sends Cache-Control private', () => {
        expect(LIFF_CODE).toMatch(/Cache-Control[\s\S]{0,20}private/);
    });

    test('Slip image proxy sends X-Content-Type-Options nosniff', () => {
        expect(LIFF_CODE).toMatch(/X-Content-Type-Options[\s\S]{0,30}nosniff/);
    });

    // ─── Async verify hook ────────────────────────────────────────

    test('Async verify hook registered', () => {
        expect(LIFF_CODE).toMatch(/add_action\(\s*'dinoco_claim_payment_slip_verify_async'\s*,\s*'dinoco_claim_payment_verify_slip_async'/);
    });

    test('wp_schedule_single_event fires 5s post-upload', () => {
        expect(LIFF_CODE).toMatch(/wp_schedule_single_event\(\s*time\(\)\s*\+\s*5\s*,\s*'dinoco_claim_payment_slip_verify_async'/);
    });

    // ─── Owner-transfer listener (HIGH-2) ─────────────────────────

    test('Owner-transferred listener registered', () => {
        expect(LIFF_CODE).toMatch(/add_action\(\s*'dinoco\/claim\/owner_transferred'\s*,\s*'dinoco_claim_payment_invalidate_charges_on_owner_transfer'/);
    });

    test('Owner-transferred handler accepts (old_uid, new_uid, ctx)', () => {
        expect(LIFF_CODE).toMatch(/function\s+dinoco_claim_payment_invalidate_charges_on_owner_transfer\(\s*\$old_uid\s*,\s*\$new_uid\s*,\s*\$context\s*=\s*array\(\)\s*\)/);
    });

    test('Owner-transferred handler chunked 100/iter', () => {
        // Chunked invalidation to bound memory on power users with many warranties
        expect(LIFF_CODE).toMatch(/LIMIT\s*%d\s*OFFSET\s*%d/);
    });

    // ─── Protected uploads dir + .htaccess deny ───────────────────

    test('Slip uploaded to dinoco-claim-slips/{YYYY-MM} subpath', () => {
        expect(LIFF_CODE).toMatch(/dinoco-claim-slips\//);
        expect(LIFF_CODE).toMatch(/wp_date\(\s*'Y-m'\s*\)/);
    });

    test('htaccess deny created on uploads root', () => {
        expect(LIFF_CODE).toMatch(/Deny from all/);
        expect(LIFF_CODE).toMatch(/dinoco-claim-slips\/\.htaccess/);
    });

    // ─── Idempotency hash R42 binary-fingerprint ──────────────────

    test('idem_discriminator passed = sha256 of slip', () => {
        // Hash file → discriminator → passed to wrapped_transition context
        expect(LIFF_CODE).toMatch(/'idem_discriminator'\s*=>\s*\$slip_sha256/);
    });

    test('hash_file sha256 used for slip_ref_hash', () => {
        expect(LIFF_CODE).toMatch(/hash_file\(\s*'sha256'/);
    });

    // ─── Replay defense (UNIQUE + pre-check) ──────────────────────

    test('Pre-check duplicate slip before storage (user-friendly fast-fail)', () => {
        expect(LIFF_CODE).toMatch(/slip_replay_detected/);
    });

    test('UNIQUE violation detected via last_error string', () => {
        expect(LIFF_CODE).toMatch(/uq_slip_replay_claim/);
    });

    // ─── File validation ──────────────────────────────────────────

    test('Allowed mimes whitelist jpeg/png only', () => {
        expect(LIFF_CODE).toMatch(/'image\/jpeg'\s*,\s*'image\/png'/);
    });

    test('5MB size cap enforced', () => {
        expect(LIFF_CODE).toMatch(/5\s*\*\s*1024\s*\*\s*1024/);
    });

    test('mime sniffed via finfo (extension is spoofable)', () => {
        expect(LIFF_CODE).toMatch(/finfo_open\(\s*FILEINFO_MIME_TYPE/);
    });

    // ─── Logout fallback ──────────────────────────────────────────

    test('Logged-out hint card rendered server-side', () => {
        expect(LIFF_CODE).toMatch(/dnc-claim-pay-warn/);
        expect(LIFF_CODE).toMatch(/เข้าสู่ระบบด้วย LINE/);
    });
});
