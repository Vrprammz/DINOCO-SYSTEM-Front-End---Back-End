/**
 * Claim Customer LIFF History drift detector — Sprint 30 Phase 4 Batch C Item 5.
 *
 * Pins the surface shipped in:
 *   • [System] DINOCO Claim Payment LIFF (V.0.10) — NEW shortcode
 *     [dinoco_claim_history] + NEW REST GET /my-charges (owner-scoped)
 *   • [Admin System] DINOCO Claim Flash Dispatcher (V.0.7) — NEW REST
 *     GET /my-flash (owner-scoped, excludes inbound_pickup)
 *
 * Verifies future edits do not regress:
 *   - Shortcode + REST endpoints registered
 *   - 3-tier ownership resolver helper extracted and reused
 *   - Anti-enumeration 404 on ownership mismatch
 *   - inbound_pickup direction filtered from owner view (admin-only)
 *   - PII strip in Flash response (no recipient_/sender_ keys)
 *   - Slip URL only for verified/refunded charges (owner tier rule)
 *   - Tracking URL uses Flash portal convention (?se= + rawurlencode)
 *   - Rate limit 30/min/user on both owner endpoints
 *   - UX-H3 strict — no inline onclick handlers in LIFF JS
 *   - Buddhist year date formatter
 *   - Mobile-first scoped CSS prefix `.dnc-claim-hist-`
 *   - Skeleton, empty state, error state with retry button
 *   - Flag-gated by `dinoco_claim_payment_enabled`
 *
 * Spec source: FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md Phase 4 Batch C Item 5.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const LIFF_PATH = path.join(REPO, '[System] DINOCO Claim Payment LIFF');
const FLASH_PATH = path.join(REPO, '[Admin System] DINOCO Claim Flash Dispatcher');

const LIFF_SRC = fs.readFileSync(LIFF_PATH, 'utf8');
const FLASH_SRC = fs.readFileSync(FLASH_PATH, 'utf8');

function stripPhpBlockComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '');
}
const LIFF_CODE = stripPhpBlockComments(LIFF_SRC);
const FLASH_CODE = stripPhpBlockComments(FLASH_SRC);

// Isolate the shortcode render function body for UX-H3 + style checks.
// The render function spans from `function dinoco_claim_history_render`
// down to the closing `// Register customer history shortcode` marker.
// Extract a generous slice between these two anchors (uses raw source so
// CSS keyframe @ syntax + Thai text inside ob_start() heredoc survive).
function sliceBetween(src, startRe, endRe) {
    const startMatch = src.match(startRe);
    if (!startMatch) return '';
    const startIdx = startMatch.index;
    const endMatch = src.slice(startIdx).match(endRe);
    if (!endMatch) return src.slice(startIdx);
    return src.slice(startIdx, startIdx + endMatch.index);
}
const HIST_RENDER_BODY = sliceBetween(
    LIFF_SRC, // use raw SRC, not block-stripped — keep HTML/CSS intact
    /function\s+dinoco_claim_history_render\s*\(/,
    /\/\/\s*Register customer history shortcode/
);

describe('Claim Customer LIFF History — Phase 4 Batch C Item 5 drift detector', () => {

    // ─── Version pins ──────────────────────────────────────────────────
    test('Claim Payment LIFF version stamped V.0.10', () => {
        expect(LIFF_SRC).toMatch(/Version:\s*V\.0\.10\s*\(2026-05-14\)/);
    });

    test('Claim Flash Dispatcher version stamped V.0.7', () => {
        expect(FLASH_SRC).toMatch(/Version:\s*V\.0\.7\s*\(2026-05-14\)/);
    });

    // ─── Shortcode registration ─────────────────────────────────────────
    test('NEW shortcode [dinoco_claim_history] registered', () => {
        expect(LIFF_CODE).toMatch(/add_shortcode\(\s*['"]dinoco_claim_history['"]\s*,\s*['"]dinoco_claim_history_render['"]/);
    });

    test('Shortcode registration is flag-gated by dinoco_claim_payment_enabled', () => {
        // The shortcode add_shortcode call sits inside if ( $dinoco_claim_payment_enabled )
        expect(LIFF_CODE).toMatch(/if\s*\(\s*\$dinoco_claim_payment_enabled\s*\)\s*\{[^}]*add_shortcode\(\s*['"]dinoco_claim_history['"]/);
    });

    test('Render function dinoco_claim_history_render defined', () => {
        expect(LIFF_CODE).toMatch(/function\s+dinoco_claim_history_render\s*\(/);
    });

    // ─── REST endpoint registrations ─────────────────────────────────
    test('NEW REST route GET /my-charges registered', () => {
        expect(LIFF_CODE).toMatch(/register_rest_route\(\s*\$base\s*,\s*['"]\/my-charges['"]/);
    });

    test('/my-charges callback wires dinoco_claim_payment_rest_my_charges', () => {
        expect(LIFF_CODE).toMatch(/['"]callback['"]\s*=>\s*['"]dinoco_claim_payment_rest_my_charges['"]/);
    });

    test('/my-charges permission_callback only requires is_user_logged_in', () => {
        // Reject if it uses dinoco_claim_payment_perm_admin (would block owners).
        const block = LIFF_CODE.match(/register_rest_route\(\s*\$base\s*,\s*['"]\/my-charges['"][\s\S]+?\)\s*\)\s*;/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/is_user_logged_in/);
        expect(block[0]).not.toMatch(/dinoco_claim_payment_perm_admin/);
    });

    test('NEW REST route GET /my-flash registered in Flash Dispatcher', () => {
        expect(FLASH_CODE).toMatch(/register_rest_route\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/my-flash['"]/);
    });

    test('/my-flash callback wires dinoco_claim_flash_rest_my_flash', () => {
        expect(FLASH_CODE).toMatch(/['"]callback['"]\s*=>\s*['"]dinoco_claim_flash_rest_my_flash['"]/);
    });

    test('/my-flash permission_callback only requires is_user_logged_in (not admin)', () => {
        const block = FLASH_CODE.match(/register_rest_route\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/my-flash['"][\s\S]+?\)\s*\)\s*;/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/is_user_logged_in/);
        // Should NOT use admin_perm callback
        expect(block[0]).not.toMatch(/dinoco_claim_flash_admin_perm/);
    });

    // ─── Ownership resolver ────────────────────────────────────────────
    test('Extracted helper dinoco_claim_payment_resolve_claim_owner defined', () => {
        expect(LIFF_CODE).toMatch(/function\s+dinoco_claim_payment_resolve_claim_owner\s*\(/);
    });

    test('Resolver implements 3-tier fallback chain (customer_id → post_author → warranty owner_user_id)', () => {
        const body = LIFF_CODE.match(/function\s+dinoco_claim_payment_resolve_claim_owner[\s\S]+?\n\s*\}\s*\n\}/);
        expect(body).not.toBeNull();
        expect(body[0]).toMatch(/get_field\(\s*['"]customer_id['"]/);
        expect(body[0]).toMatch(/post_author/);
        expect(body[0]).toMatch(/linked_warranty_id/);
        expect(body[0]).toMatch(/owner_user_id/);
    });

    test('/my-charges handler resolves owner and 404s on mismatch (anti-enumeration)', () => {
        const handler = LIFF_CODE.match(/function\s+dinoco_claim_payment_rest_my_charges[\s\S]+?\n\s*\}\s*\n\}/);
        expect(handler).not.toBeNull();
        expect(handler[0]).toMatch(/dinoco_claim_payment_resolve_claim_owner/);
        expect(handler[0]).toMatch(/claim_not_found/);
        expect(handler[0]).toMatch(/['"]status['"]\s*=>\s*404/);
    });

    test('/my-flash handler resolves owner with fallback to inline chain if helper missing', () => {
        const handler = FLASH_CODE.match(/function\s+dinoco_claim_flash_rest_my_flash[\s\S]+?\n\s*\}\s*\n\}/);
        expect(handler).not.toBeNull();
        expect(handler[0]).toMatch(/function_exists\(\s*['"]dinoco_claim_payment_resolve_claim_owner['"]/);
        expect(handler[0]).toMatch(/customer_id/);
        expect(handler[0]).toMatch(/post_author/);
        expect(handler[0]).toMatch(/linked_warranty_id/);
    });

    test('/my-flash 404s on ownership mismatch (anti-enumeration)', () => {
        const handler = FLASH_CODE.match(/function\s+dinoco_claim_flash_rest_my_flash[\s\S]+?\n\s*\}\s*\n\}/);
        expect(handler).not.toBeNull();
        expect(handler[0]).toMatch(/claim_not_found/);
        expect(handler[0]).toMatch(/\b404\b/);
    });

    // ─── PII / direction filtering ────────────────────────────────────
    test('/my-flash EXCLUDES inbound_pickup direction', () => {
        const handler = FLASH_CODE.match(/function\s+dinoco_claim_flash_rest_my_flash[\s\S]+?\n\s*\}\s*\n\}/);
        expect(handler).not.toBeNull();
        // Must have explicit skip for inbound_pickup
        expect(handler[0]).toMatch(/['"]inbound_pickup['"][\s\S]{0,80}continue/);
    });

    test('/my-flash strips PII — no recipient/sender keys in response items', () => {
        const handler = FLASH_CODE.match(/function\s+dinoco_claim_flash_rest_my_flash[\s\S]+?\n\s*\}\s*\n\}/);
        expect(handler).not.toBeNull();
        // Response array build must NOT include dst/src or recipient/sender keys
        expect(handler[0]).not.toMatch(/['"]recipient_/);
        expect(handler[0]).not.toMatch(/['"]sender_/);
        expect(handler[0]).not.toMatch(/['"]dst_phone/);
        expect(handler[0]).not.toMatch(/['"]src_phone/);
    });

    test('/my-flash response includes tracking_url built from Flash portal convention', () => {
        const handler = FLASH_CODE.match(/function\s+dinoco_claim_flash_rest_my_flash[\s\S]+?\n\s*\}\s*\n\}/);
        expect(handler).not.toBeNull();
        expect(handler[0]).toMatch(/flashexpress\.co\.th\/tracking\/\?se=/);
        expect(handler[0]).toMatch(/rawurlencode/);
    });

    // ─── Charges slip URL exposure rule ──────────────────────────────
    test('/my-charges only exposes slip_image_url for verified/refunded statuses', () => {
        const handler = LIFF_CODE.match(/function\s+dinoco_claim_payment_rest_my_charges[\s\S]+?\n\s*\}\s*\n\}/);
        expect(handler).not.toBeNull();
        // Conditional gate on verified/refunded before assigning slip_url
        expect(handler[0]).toMatch(/in_array\(\s*\$st\s*,\s*array\(\s*['"]verified['"]\s*,\s*['"]refunded['"]/);
    });

    test('/my-charges slip_url is the auth-gated proxy path (never raw uploads)', () => {
        const handler = LIFF_CODE.match(/function\s+dinoco_claim_payment_rest_my_charges[\s\S]+?\n\s*\}\s*\n\}/);
        expect(handler).not.toBeNull();
        // PHP concat: '/wp-json/dinoco-claim/v1/charges/' . (int) $r['id'] . '/slip-image';
        // Verify both halves present (quoted/concat-safe).
        expect(handler[0]).toMatch(/\/wp-json\/dinoco-claim\/v1\/charges\//);
        expect(handler[0]).toMatch(/\/slip-image/);
        // Also assert the slip_image_url field is what carries the path
        // (i.e. the proxy path is assigned via $slip_url variable).
        expect(handler[0]).toMatch(/\$slip_url\s*=\s*['"]\/wp-json\/dinoco-claim\/v1\/charges\//);
    });

    // ─── Rate limits ───────────────────────────────────────────────────
    test('/my-charges enforces 30/min/user rate limit', () => {
        const handler = LIFF_CODE.match(/function\s+dinoco_claim_payment_rest_my_charges[\s\S]+?\n\s*\}\s*\n\}/);
        expect(handler).not.toBeNull();
        expect(handler[0]).toMatch(/b2b_rate_limit\(\s*['"]claim_my_charges_['"]?\s*\.\s*\$uid\s*,\s*30\s*,\s*60/);
    });

    test('/my-flash enforces 30/min/user rate limit', () => {
        const handler = FLASH_CODE.match(/function\s+dinoco_claim_flash_rest_my_flash[\s\S]+?\n\s*\}\s*\n\}/);
        expect(handler).not.toBeNull();
        expect(handler[0]).toMatch(/b2b_rate_limit\(\s*['"]claim_my_flash_['"]?\s*\.\s*\$uid\s*,\s*30\s*,\s*60/);
    });

    // ─── LIFF UI markup & UX-H3 strict ─────────────────────────────────
    test('LIFF history render emits scoped .dnc-claim-hist-app root', () => {
        expect(HIST_RENDER_BODY).toMatch(/dnc-claim-hist-app/);
    });

    test('LIFF history declares scoped CSS prefix `.dnc-claim-hist-`', () => {
        expect(HIST_RENDER_BODY).toMatch(/\.dnc-claim-hist-header/);
        expect(HIST_RENDER_BODY).toMatch(/\.dnc-claim-hist-row/);
        expect(HIST_RENDER_BODY).toMatch(/\.dnc-claim-hist-section/);
    });

    test('LIFF history uses data-action delegation (UX-H3) — NO inline onclick in head/back/close', () => {
        // Header buttons must use data-action= not onclick=
        expect(HIST_RENDER_BODY).toMatch(/data-action="back"/);
        expect(HIST_RENDER_BODY).toMatch(/data-action="close"/);
        // The row toggle button is the inline expansion handle
        expect(HIST_RENDER_BODY).toMatch(/data-action="toggle-row"/);
        // No inline onclick anywhere in the rendered output (strict UX-H3).
        // Search the PHP HTML emission portion only, not surrounding code.
        const inlineOnclickMatches = HIST_RENDER_BODY.match(/\bonclick\s*=/gi);
        expect(inlineOnclickMatches).toBeNull();
    });

    test('LIFF history retry buttons use data-action delegation', () => {
        // renderError emits `data-action="' + escHtml(retryAction)` where
        // retryAction is 'retry-charges' or 'retry-flash' (JS string args).
        // Verify both action handlers + the renderError pattern.
        expect(HIST_RENDER_BODY).toMatch(/'retry-charges'/);
        expect(HIST_RENDER_BODY).toMatch(/'retry-flash'/);
        // The action handler in event delegation
        expect(HIST_RENDER_BODY).toMatch(/action\s*===\s*'retry-charges'/);
        expect(HIST_RENDER_BODY).toMatch(/action\s*===\s*'retry-flash'/);
        // The renderError markup emits data-action="' + escHtml(retryAction)
        expect(HIST_RENDER_BODY).toMatch(/data-action="'\s*\+\s*escHtml\(\s*retryAction/);
    });

    test('LIFF history sections wired (charges + flash) with role=region', () => {
        expect(HIST_RENDER_BODY).toMatch(/id="dnc-claim-hist-charges-section"[\s\S]*?role="region"/);
        expect(HIST_RENDER_BODY).toMatch(/id="dnc-claim-hist-flash-section"[\s\S]*?role="region"/);
    });

    test('LIFF history has Buddhist year date formatter', () => {
        // Body must have +543 BE calculation
        expect(HIST_RENDER_BODY).toMatch(/getFullYear\(\)\s*\+\s*543/);
        expect(HIST_RENDER_BODY).toMatch(/function\s+fmtThaiDate/);
    });

    test('LIFF history has skeleton loader markup .dnc-claim-hist-skel', () => {
        expect(HIST_RENDER_BODY).toMatch(/dnc-claim-hist-skel/);
        // CSS keyframes for shimmer
        expect(HIST_RENDER_BODY).toMatch(/dncHistShimmer/);
    });

    test('LIFF history has empty state .dnc-claim-hist-empty + Thai message', () => {
        expect(HIST_RENDER_BODY).toMatch(/dnc-claim-hist-empty/);
        expect(HIST_RENDER_BODY).toMatch(/ยังไม่มีรายการ/);
    });

    test('LIFF history has error state with retry button', () => {
        expect(HIST_RENDER_BODY).toMatch(/dnc-claim-hist-error/);
        expect(HIST_RENDER_BODY).toMatch(/dnc-claim-hist-error-retry/);
        // 🔄 ลองอีกครั้ง button label
        expect(HIST_RENDER_BODY).toMatch(/ลองอีกครั้ง/);
    });

    test('LIFF history JS calls both REST endpoints', () => {
        expect(HIST_RENDER_BODY).toMatch(/\/wp-json\/dinoco-claim\/v1\/my-charges/);
        expect(HIST_RENDER_BODY).toMatch(/\/wp-json\/dinoco-claim\/v1\/my-flash/);
    });

    test('LIFF history JS sends X-WP-Nonce header on both fetches', () => {
        // Count X-WP-Nonce occurrences — must be at least 2 (one per fetch).
        const matches = HIST_RENDER_BODY.match(/X-WP-Nonce/g) || [];
        expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    test('LIFF history Flash row builds Flash portal tracking URL', () => {
        expect(HIST_RENDER_BODY).toMatch(/flashexpress\.co\.th\/tracking\/\?se=/);
    });

    test('LIFF history Flash card tracking link opens in new tab with rel=noopener', () => {
        // Track button row uses JS concat:
        //   '<a class="dnc-claim-hist-track-btn" href="' + escHtml(trackUrl)
        //   + '" target="_blank" rel="noopener">📦 ติดตามที่ Flash</a>'
        // Verify all 3 pieces present in same vicinity.
        expect(HIST_RENDER_BODY).toMatch(/dnc-claim-hist-track-btn/);
        // The Flash track button block specifically (with the icon emoji)
        const blk = HIST_RENDER_BODY.match(/dnc-claim-hist-track-btn[\s\S]{0,400}ติดตามที่ Flash/);
        expect(blk).not.toBeNull();
        expect(blk[0]).toMatch(/target="_blank"/);
        expect(blk[0]).toMatch(/rel="noopener"/);
    });

    test('LIFF history minimum touch target ≥ 44px (mobile-first)', () => {
        // .dnc-claim-hist-back / -close / -row-head min-height >= 44
        expect(HIST_RENDER_BODY).toMatch(/\.dnc-claim-hist-back[^{]*\{[^}]*(width:\s*44px|height:\s*44px)/);
        expect(HIST_RENDER_BODY).toMatch(/\.dnc-claim-hist-row-head[^{]*\{[^}]*min-height:\s*\d+px/);
    });

    test('LIFF history bails when claim_id missing', () => {
        // JS guard claimId <= 0 → render error and return.
        expect(HIST_RENDER_BODY).toMatch(/if\s*\(\s*claimId\s*<=\s*0\s*\)/);
    });

    test('LIFF history respects prefers-reduced-motion for skeleton + chevron', () => {
        expect(HIST_RENDER_BODY).toMatch(/prefers-reduced-motion/);
    });

    test('LIFF history toggle handler flips data-expanded + aria-expanded', () => {
        expect(HIST_RENDER_BODY).toMatch(/data-expanded/);
        expect(HIST_RENDER_BODY).toMatch(/aria-expanded/);
        // Toggle logic uses setAttribute on both
        expect(HIST_RENDER_BODY).toMatch(/setAttribute\(\s*['"]data-expanded['"]/);
    });

    test('Logged-out card shown when !is_user_logged_in()', () => {
        // PHP-side logged_out warn card emission
        expect(HIST_RENDER_BODY).toMatch(/dnc-claim-hist-warn/);
        expect(HIST_RENDER_BODY).toMatch(/login\/\?redirect=/);
    });

    test('Charge row builder labels reason with Thai map', () => {
        // map shape: { 'return_shipping':'ค่าส่งคืน', ... }
        // Match key + value separated by short colon-quote-separator.
        expect(HIST_RENDER_BODY).toMatch(/'return_shipping'\s*:\s*'ค่าส่งคืน'/);
        expect(HIST_RENDER_BODY).toMatch(/'repair_oow'\s*:\s*'ค่าซ่อมนอกประกัน'/);
    });

    test('Flash direction label map omits inbound_pickup (admin-only)', () => {
        // Customer-side map must include only replacement + repaired_return.
        const mapMatch = HIST_RENDER_BODY.match(/function\s+flashDirectionLabel[\s\S]+?return\s+map\[/);
        expect(mapMatch).not.toBeNull();
        expect(mapMatch[0]).toMatch(/replacement/);
        expect(mapMatch[0]).toMatch(/repaired_return/);
        // inbound_pickup must NOT appear as a key in the customer map
        expect(mapMatch[0]).not.toMatch(/'inbound_pickup'\s*:/);
        expect(mapMatch[0]).not.toMatch(/"inbound_pickup"\s*:/);
    });

    test('LIFF history footer LINE Admin contact link present', () => {
        expect(HIST_RENDER_BODY).toMatch(/lin\.ee\/dinoco/);
    });
});
