/**
 * Sprint 32 — Dashboard Claim Inline Integration drift detector.
 *
 * Boss UX refactor 2026-05-14: standalone customer LIFF pages
 *   /claim-pay/   ([dinoco_claim_pay])
 *   /claim-history/ ([dinoco_claim_history])
 * are DEPRECATED. Customer claim payment + history now render INLINE
 * inside Member Dashboard `[dinoco_dashboard_assets]` claimed-state
 * cards. This suite pins:
 *
 *   • Assets List V.32.0  — charge fetch + payment modal + CSS scope
 *   • Member Dashboard V.32.0 — charge_pending banner + URL action handler
 *   • Claim Lifecycle Notifier V.0.9 — deep-link `/dashboard/?action=pay`
 *   • Claim Payment LIFF V.0.11 — shortcode redirects (no add_shortcode
 *                                  for legacy render functions)
 *
 * Constraints:
 *   • All version-header documentation is stripped before negative
 *     assertions (S/N R11 lesson — comments do not count).
 */

const fs   = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');

const PATHS = {
    assets:   path.join(REPO, '[System] Dashboard - Assets List'),
    member:   path.join(REPO, '[System] Member Dashboard Main'),
    notifier: path.join(REPO, '[Admin System] DINOCO Claim Lifecycle Notifier'),
    liff:     path.join(REPO, '[System] DINOCO Claim Payment LIFF'),
};

const SRC = Object.fromEntries(
    Object.entries(PATHS).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')])
);

function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map(line => line.replace(/\s*\/\/.*$/, ''))
        .join('\n');
}
const CODE = Object.fromEntries(
    Object.entries(SRC).map(([k, v]) => [k, stripComments(v)])
);

describe('Sprint 32 — Dashboard Claim Inline Integration drift', () => {

    // ─── Version headers (untouched, includes comments) ──────────────

    test('Assets List V.32.0 + V.31.6 lineage preserved', () => {
        expect(SRC.assets).toMatch(/Version:\s*V\.32\.0\s*\(2026-05-14\)\s*—\s*Sprint 32/);
        expect(SRC.assets).toMatch(/Version:\s*V\.31\.6\s*\(2026-05-13\)/);
    });

    test('Member Dashboard V.32.0 + V.31.8 lineage preserved', () => {
        expect(SRC.member).toMatch(/Version:\s*V\.32\.0\s*\(2026-05-14\)\s*—\s*Sprint 32/);
        expect(SRC.member).toMatch(/Version:\s*V\.31\.8\s*\(2026-05-13\)/);
    });

    test('Notifier V.0.9 + V.0.8 lineage preserved', () => {
        expect(SRC.notifier).toMatch(/Version:\s*V\.0\.9\s*\(2026-05-14\)\s*—\s*Sprint 32/);
        expect(SRC.notifier).toMatch(/Version:\s*V\.0\.8\s*\(2026-05-14\)\s*—\s*Sprint 29/);
    });

    test('Claim Payment LIFF V.0.11 + V.0.10 lineage preserved', () => {
        expect(SRC.liff).toMatch(/Version:\s*V\.0\.11\s*\(2026-05-14\)\s*—\s*Sprint 32/);
        expect(SRC.liff).toMatch(/Version:\s*V\.0\.10\s*\(2026-05-14\)/);
    });

    // ─── Assets List V.32.0 — inline charge rendering ───────────────

    test('Assets List V.32.0 — dinoco_dashboard_lookup_claim_for_sn helper defined', () => {
        expect(CODE.assets).toMatch(/function\s+dinoco_dashboard_lookup_claim_for_sn\s*\(\s*\$sn\s*,\s*\$pid\s*\)/);
    });

    test('Assets List V.32.0 — claim lookup uses canonical ref_product_id + ref_product_serial meta keys', () => {
        // Mirror of meta_query pattern used 4× elsewhere in this file (Sprint 32 reuse, no duplication).
        const block = CODE.assets.match(/function\s+dinoco_dashboard_lookup_claim_for_sn[\s\S]{0,1500}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/'ref_product_id'/);
        expect(block[0]).toMatch(/'ref_product_serial'/);
        expect(block[0]).toMatch(/'post_type'\s*=>\s*'claim_ticket'/);
    });

    test('Assets List V.32.0 — dinoco_dashboard_render_claim_charges_inline helper defined', () => {
        expect(CODE.assets).toMatch(/function\s+dinoco_dashboard_render_claim_charges_inline\s*\(\s*\$claim_id\s*,\s*\$sn\s*\)/);
    });

    test('Assets List V.32.0 — inline charge query owner-scoped (user_id = uid)', () => {
        // Defense against cross-user enumeration via direct SQL.
        const block = CODE.assets.match(/function\s+dinoco_dashboard_render_claim_charges_inline[\s\S]{0,3500}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/WHERE\s+claim_id\s*=\s*%d\s+AND\s+user_id\s*=\s*%d/);
    });

    test('Assets List V.32.0 — inline charge query status whitelist (pending_payment / pending_review / verified)', () => {
        const block = CODE.assets.match(/function\s+dinoco_dashboard_render_claim_charges_inline[\s\S]{0,3500}/);
        expect(block[0]).toMatch(/status\s+IN\s*\(\s*'pending_payment'\s*,\s*'pending_review'\s*,\s*'verified'\s*\)/);
    });

    test('Assets List V.32.0 — anchor id pattern claim-{cid}-charge-{chid} (deep-link target)', () => {
        // Member Dashboard V.32.0 URL action handler resolves this exact anchor.
        expect(CODE.assets).toMatch(/'claim-'\s*\.\s*\$claim_id\s*\.\s*'-charge-'\s*\.\s*\$chid/);
    });

    test('Assets List V.32.0 — flag-gated by dinoco_claim_payment_enabled (REG-029)', () => {
        const block = CODE.assets.match(/function\s+dinoco_dashboard_render_claim_charges_inline[\s\S]{0,2500}/);
        expect(block[0]).toMatch(/get_option\(\s*'dinoco_claim_payment_enabled'\s*,\s*false\s*\)/);
    });

    test('Assets List V.32.0 — Pay button uses data-action delegation (UX-H3 strict)', () => {
        expect(CODE.assets).toMatch(/data-action="open-charge-modal"/);
        // No inline onclick on Pay button
        const btnBlock = CODE.assets.match(/dnc-sn-asset-card-charge-pay-btn[\s\S]{0,400}/);
        expect(btnBlock).not.toBeNull();
        expect(btnBlock[0]).not.toMatch(/onclick=/);
    });

    test('Assets List V.32.0 — Submit slip button uses data-action delegation', () => {
        expect(CODE.assets).toMatch(/data-action="submit-charge-slip"/);
    });

    test('Assets List V.32.0 — modal uses window.dinocoModal (Modal Helpers V.1.3+ reuse)', () => {
        expect(CODE.assets).toMatch(/window\.dinocoModal\s*&&/);
        expect(CODE.assets).toMatch(/window\.dinocoModal\.alert/);
    });

    test('Assets List V.32.0 — slip upload uses XHR + FormData multipart pattern', () => {
        expect(CODE.assets).toMatch(/new XMLHttpRequest\(\)/);
        expect(CODE.assets).toMatch(/new FormData\(\)/);
        expect(CODE.assets).toMatch(/fd\.append\(\s*'slip_image'/);
    });

    test('Assets List V.32.0 — slip upload uses X-WP-Nonce header', () => {
        expect(CODE.assets).toMatch(/setRequestHeader\(\s*'X-WP-Nonce'/);
    });

    test('Assets List V.32.0 — slip upload posts to existing REST endpoint /charge/{id}/upload-slip', () => {
        // Backward compat — endpoint defined in Claim Payment LIFF V.0.8, unchanged.
        expect(CODE.assets).toMatch(/\/wp-json\/dinoco-claim\/v1\/charge\/'\s*\+\s*chargeId\s*\+\s*'\/upload-slip/);
    });

    test('Assets List V.32.0 — listens for dnc:claim-pay-open CustomEvent', () => {
        expect(CODE.assets).toMatch(/addEventListener\(\s*'dnc:claim-pay-open'/);
    });

    test('Assets List V.32.0 — scoped CSS prefix .dnc-sn-asset-card-charge-*', () => {
        const matches = CODE.assets.match(/\.dnc-sn-asset-card-charge-[a-z-]+/g) || [];
        expect(matches.length).toBeGreaterThan(5);
    });

    test('Assets List V.32.0 — scoped CSS prefix .dnc-dash-pay-* for modal', () => {
        const matches = CODE.assets.match(/\.dnc-dash-pay-[a-z-]+/g) || [];
        expect(matches.length).toBeGreaterThan(5);
    });

    test('Assets List V.32.0 — inline charge hook fires only on claimed-state cards', () => {
        // Both call sites guard on $sn_card_state === 'claimed'
        const occurrences = (CODE.assets.match(/\$sn_card_state\s*===\s*'claimed'/g) || []).length;
        expect(occurrences).toBeGreaterThanOrEqual(2);
    });

    test('Assets List V.32.0 — inline charge hook called from BOTH bundle path AND single product path', () => {
        const occurrences = (CODE.assets.match(/dinoco_dashboard_render_claim_charges_inline\s*\(/g) || []).length;
        // 1 definition + 2 call sites (bundle path + single product path) = 3 total
        expect(occurrences).toBeGreaterThanOrEqual(3);
    });

    // ─── Member Dashboard V.32.0 — banner + URL handler ─────────────

    test('Member Dashboard V.32.0 — banner type charge_pending in banner_data aggregation', () => {
        expect(CODE.member).toMatch(/'type'\s*=>\s*'charge_pending'/);
    });

    test('Member Dashboard V.32.0 — charge_pending banner query owner-scoped (user_id=%d)', () => {
        // Defense against cross-user banner leak.
        const sqlBlock = CODE.member.match(/SELECT[\s\S]{0,200}FROM\s+\{\$ch_table\}[\s\S]{0,300}/);
        expect(sqlBlock).not.toBeNull();
        expect(sqlBlock[0]).toMatch(/user_id\s*=\s*%d/);
    });

    test('Member Dashboard V.32.0 — charge_pending banner gated by dinoco_claim_payment_enabled (REG-029)', () => {
        // Block lookup — flag check appears within ~300 chars above the
        // banner items[] insertion. Pull the surrounding block.
        const m = CODE.member.match(/'type'\s*=>\s*'charge_pending'/);
        expect(m).not.toBeNull();
        const cpIdx = m.index;
        expect(cpIdx).toBeGreaterThan(0);
        const blockBefore = CODE.member.substring(Math.max(0, cpIdx - 1200), cpIdx);
        expect(blockBefore).toMatch(/dinoco_claim_payment_enabled/);
    });

    test('Member Dashboard V.32.0 — rotation array includes charge_pending FIRST', () => {
        // Boss principle: financial urgency outranks expiry/anniversary/review.
        expect(CODE.member).toMatch(/'charge_pending'\s*=>\s*null[\s\S]{0,50}'expiry'\s*=>\s*null/);
        // $ordered array — charge_pending must be FIRST entry
        const orderedBlock = CODE.member.match(/\$ordered\s*=\s*array_filter\(\s*array\([\s\S]{0,300}/);
        expect(orderedBlock).not.toBeNull();
        expect(orderedBlock[0]).toMatch(/\$picked\['charge_pending'\][\s\S]{0,200}\$picked\['expiry'\]/);
    });

    test('Member Dashboard V.32.0 — banner render branch for charge_pending exists', () => {
        expect(CODE.member).toMatch(/\$type\s*===\s*'charge_pending'/);
        // CSS class
        expect(CODE.member).toMatch(/dnc-sn-banner-charge-pending/);
    });

    test('Member Dashboard V.32.0 — banner URL includes ?action=pay&claim_id=X&charge_id=Y', () => {
        expect(CODE.member).toMatch(/\?action=pay&claim_id='/);
        expect(CODE.member).toMatch(/'&charge_id='/);
    });

    test('Member Dashboard V.32.0 — banner URL includes anchor #claim-X-charge-Y', () => {
        expect(CODE.member).toMatch(/'#claim-'\s*\.\s*\$claim_id\s*\.\s*'-charge-'\s*\.\s*\$charge_id/);
    });

    test('Member Dashboard V.32.0 — URL deep-link auto-scroll JS function defined', () => {
        expect(CODE.member).toMatch(/window\.dncDashClaimAutoScroll\s*=\s*function/);
    });

    test('Member Dashboard V.32.0 — auto-scroll reads ?action=pay URL param', () => {
        const block = CODE.member.match(/window\.dncDashClaimAutoScroll[\s\S]{0,2000}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/params\.get\(\s*'action'\s*\)\s*!==\s*'pay'/);
        expect(block[0]).toMatch(/params\.get\(\s*'claim_id'/);
        expect(block[0]).toMatch(/params\.get\(\s*'charge_id'/);
    });

    test('Member Dashboard V.32.0 — auto-scroll dispatches dnc:claim-pay-open CustomEvent', () => {
        expect(CODE.member).toMatch(/CustomEvent\(\s*'dnc:claim-pay-open'/);
    });

    test('Member Dashboard V.32.0 — auto-scroll called on DOMContentLoaded', () => {
        // Multiple DOMContentLoaded blocks exist — the relevant one must call dncDashClaimAutoScroll
        const allBlocks = CODE.member.match(/DOMContentLoaded[\s\S]{0,800}/g) || [];
        const found = allBlocks.some(b => /dncDashClaimAutoScroll/.test(b));
        expect(found).toBe(true);
    });

    test('Member Dashboard V.32.0 — cache invalidation listener on dinoco/claim/charge_state_changed', () => {
        expect(CODE.member).toMatch(/add_action\(\s*'dinoco\/claim\/charge_state_changed'\s*,\s*'dinoco_sn_invalidate_banner_cache_on_charge_state'/);
    });

    // ─── Notifier V.0.9 — deep-link migration ───────────────────────

    test('Notifier V.0.9 — pay_url points to /dashboard/?action=pay (not /claim-pay/)', () => {
        expect(CODE.notifier).toMatch(/'pay_url'\s*=>\s*home_url\(\s*'\/dashboard\/\?action=pay/);
    });

    test('Notifier V.0.9 — pay_url includes claim_id + charge_id + anchor', () => {
        const block = CODE.notifier.match(/'pay_url'[\s\S]{0,400}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/claim_id=/);
        expect(block[0]).toMatch(/charge_id=/);
        expect(block[0]).toMatch(/#claim-/);
    });

    test('Notifier V.0.9 — NO references to legacy /claim-pay/ URL (excl. comments)', () => {
        // Header comment + version log mentions /claim-pay/ for context — those
        // are stripped before this assertion (CODE.notifier comments stripped).
        // Any remaining `/claim-pay/` in actual code is a regression.
        expect(CODE.notifier).not.toMatch(/home_url\(\s*'\/claim-pay\//);
    });

    test('Notifier V.0.9 — NO references to legacy /claim-history/ URL (excl. comments)', () => {
        expect(CODE.notifier).not.toMatch(/home_url\(\s*'\/claim-history\//);
    });

    // ─── Claim Payment LIFF V.0.11 — deprecation redirect ───────────

    test('Claim Payment LIFF V.0.11 — deprecation redirect handler defined', () => {
        expect(CODE.liff).toMatch(/function\s+dinoco_claim_pay_deprecated_redirect\s*\(/);
    });

    test('Claim Payment LIFF V.0.11 — [dinoco_claim_pay] routes to deprecation handler (NOT legacy render)', () => {
        // Sprint 32 — shortcode now registered to deprecated_redirect, not _render.
        expect(CODE.liff).toMatch(/add_shortcode\(\s*'dinoco_claim_pay'\s*,\s*'dinoco_claim_pay_deprecated_redirect'\s*\)/);
        // Negative — no live registration of legacy render fn.
        expect(CODE.liff).not.toMatch(/add_shortcode\(\s*'dinoco_claim_pay'\s*,\s*'dinoco_claim_pay_render'\s*\)/);
    });

    test('Claim Payment LIFF V.0.11 — [dinoco_claim_history] ALSO routes to deprecation handler', () => {
        expect(CODE.liff).toMatch(/add_shortcode\(\s*'dinoco_claim_history'\s*,\s*'dinoco_claim_pay_deprecated_redirect'\s*\)/);
        expect(CODE.liff).not.toMatch(/add_shortcode\(\s*'dinoco_claim_history'\s*,\s*'dinoco_claim_history_render'\s*\)/);
    });

    test('Claim Payment LIFF V.0.11 — deprecation redirect emits <meta refresh> + JS replace + visible CTA', () => {
        const block = CODE.liff.match(/function\s+dinoco_claim_pay_deprecated_redirect[\s\S]{0,2500}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/http-equiv="refresh"/);
        expect(block[0]).toMatch(/window\.location\.replace/);
        expect(block[0]).toMatch(/ไปหน้า Dashboard|กำลังพาคุณ/);
    });

    test('Claim Payment LIFF V.0.11 — deprecation redirect honors REG-029 flag-OFF (returns empty)', () => {
        const block = CODE.liff.match(/function\s+dinoco_claim_pay_deprecated_redirect[\s\S]{0,2500}/);
        expect(block[0]).toMatch(/get_option\(\s*'dinoco_claim_payment_enabled'\s*,\s*false\s*\)/);
        expect(block[0]).toMatch(/return\s+''/);
    });

    test('Claim Payment LIFF V.0.11 — deprecation redirect preserves cid + charge query params', () => {
        const block = CODE.liff.match(/function\s+dinoco_claim_pay_deprecated_redirect[\s\S]{0,2500}/);
        expect(block[0]).toMatch(/\$_GET\['cid'\]/);
        expect(block[0]).toMatch(/\$_GET\['charge'\]/);
    });

    test('Claim Payment LIFF V.0.11 — legacy render functions preserved as dead code (drift baseline)', () => {
        // Will be deleted Sprint 36+ after observation window. Until then,
        // pin presence so accidental deletion is caught.
        expect(CODE.liff).toMatch(/function\s+dinoco_claim_pay_render\s*\(/);
        expect(CODE.liff).toMatch(/function\s+dinoco_claim_history_render\s*\(/);
    });

    test('Claim Payment LIFF V.0.11 — REST endpoints preserved (Assets List inline UI consumes them)', () => {
        // Backward compat — these MUST stay alive for V.32.0 inline rendering.
        expect(CODE.liff).toMatch(/register_rest_route\(\s*\$base\s*,\s*'\/charge\/\(\?P<id>\\\\d\+\)\/upload-slip'/);
        expect(CODE.liff).toMatch(/register_rest_route\(\s*\$base\s*,\s*'\/charges\/\(\?P<id>\\\\d\+\)\/slip-image'/);
        expect(CODE.liff).toMatch(/register_rest_route\(\s*\$base\s*,\s*'\/my-charges'/);
    });
});
