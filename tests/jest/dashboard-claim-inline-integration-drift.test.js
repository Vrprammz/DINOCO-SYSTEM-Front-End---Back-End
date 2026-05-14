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

    test('Assets List V.32.1 + V.32.0 + V.31.6 lineage preserved', () => {
        // V.32.1 Sprint 33 (UX dual-audit remediation) → V.32.0 Sprint 32 → V.31.6
        expect(SRC.assets).toMatch(/Version:\s*V\.32\.1\s*\(2026-05-14\)\s*—\s*Sprint 33/);
        expect(SRC.assets).toMatch(/Version:\s*V\.32\.0\s*\(2026-05-14\)\s*—\s*Sprint 32/);
        expect(SRC.assets).toMatch(/Version:\s*V\.31\.6\s*\(2026-05-13\)/);
    });

    test('Member Dashboard V.32.1 + V.32.0 + V.31.8 lineage preserved', () => {
        // V.32.1 Sprint 33 (UX dual-audit remediation) → V.32.0 Sprint 32 → V.31.8
        expect(SRC.member).toMatch(/Version:\s*V\.32\.1\s*\(2026-05-14\)\s*—\s*Sprint 33/);
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

    test('Member Dashboard V.32.0 — rotation array includes charge_pending FIRST (default path)', () => {
        // Boss principle: financial urgency outranks expiry/anniversary/review by default.
        // V.32.1 Sprint 33 S4 — Priority becomes dynamic: when expiry has days_left < 7,
        // expiry wins (irreversible warranty lapse). Default branch (non-critical expiry)
        // still places charge_pending first.
        expect(CODE.member).toMatch(/'charge_pending'\s*=>\s*null[\s\S]{0,50}'expiry'\s*=>\s*null/);
        // Find ALL $ordered = array_filter blocks (S4 introduces 2 branches)
        const allOrderedBlocks = CODE.member.match(/\$ordered\s*=\s*array_filter\(\s*array\([\s\S]{0,600}\)\s*\)\s*;/g) || [];
        expect(allOrderedBlocks.length).toBeGreaterThanOrEqual(1);
        // AT LEAST ONE branch must place charge_pending before expiry (default Sprint 32 order).
        const defaultBranch = allOrderedBlocks.find(b => /\$picked\['charge_pending'\][\s\S]{0,400}\$picked\['expiry'\]/.test(b));
        expect(defaultBranch).toBeDefined();
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

    // ─── Sprint 33 — UX dual-audit remediation (5 BLOCKERs + 7 SHOULD-FIX) ───

    // B1 — .dnc-sn-banner-charge-pending CSS variant added (Member Dashboard)
    test('B1 — charge-pending banner CSS variant exists with bg + border + color', () => {
        const rule = CODE.member.match(/\.dnc-sn-banner-charge-pending\s*\{[\s\S]{0,300}\}/);
        expect(rule).not.toBeNull();
        expect(rule[0]).toMatch(/background:\s*var\(\s*--dnc-danger-red-bg/);
        expect(rule[0]).toMatch(/border-color:\s*var\(\s*--dnc-danger-red/);
        expect(rule[0]).toMatch(/color:\s*#7f1d1d/);
    });

    test('B1 — `.dnc-sn-banner-clickable` style supports anchor-wrap banner', () => {
        expect(CODE.member).toMatch(/\.dnc-sn-banner-clickable\s*\{/);
        const block = CODE.member.match(/\.dnc-sn-banner-clickable\s*\{[\s\S]{0,400}\}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/text-decoration:\s*none/);
        expect(block[0]).toMatch(/cursor:\s*pointer/);
    });

    // B2 — Modal renders bank info block + PromptPay QR + copy buttons
    test('B2 — `_dncDashRenderBankBlock` helper renders bank info HTML', () => {
        expect(CODE.assets).toMatch(/function\s+_dncDashRenderBankBlock\s*\(\s*bankCtxRaw\s*,\s*amount\s*\)/);
    });

    test('B2 — modal HTML includes bank account row + copy-text data-action', () => {
        const block = CODE.assets.match(/function\s+_dncDashRenderBankBlock[\s\S]{0,3500}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/dnc-dash-pay-bank-account-row/);
        expect(block[0]).toMatch(/data-action="copy-text"/);
        expect(block[0]).toMatch(/data-copy-value=/);
        // PromptPay QR rendering branch
        expect(block[0]).toMatch(/dnc-dash-pay-qr-wrap/);
        expect(block[0]).toMatch(/promptpay_qr_url/);
    });

    test('B2 — empty bank_context fallback renders LINE deep-link notice', () => {
        // _dncDashRenderBankBlock is large (~5000 chars in CODE.assets after comment strip).
        const block = CODE.assets.match(/function\s+_dncDashRenderBankBlock[\s\S]{0,6000}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/dnc-dash-pay-bank-fallback/);
        expect(block[0]).toMatch(/ติดต่อแอดมินสำหรับข้อมูลการโอน/);
        // NOTE: stripComments() chops `//line.me/...` from `'https://line.me/...'`
        // (it treats `// ...` as a JS line comment regardless of string context).
        // Assert against raw source instead — the literal exists in the live code.
        expect(SRC.assets).toMatch(/line\.me\/R\/oaMessage\/@dinoco/);
        // And confirm the fallback function builds a lineUrl variable
        expect(block[0]).toMatch(/var\s+lineUrl/);
        expect(block[0]).toMatch(/ขอข้อมูลการโอนเงินค่าซ่อม/);
    });

    test('B2 — server-side SELECT pulls resolved bank_name + bank_account columns', () => {
        // Charge_pending render reads resolved columns (not just raw bank_context string).
        const block = CODE.assets.match(/function\s+dinoco_dashboard_render_claim_charges_inline[\s\S]{0,3500}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/bank_name,\s*bank_account,\s*bank_code/);
    });

    test('B2 — bank_context JSON includes promptpay_qr_url field (via b2b_thai_qr_image_url)', () => {
        expect(CODE.assets).toMatch(/b2b_thai_qr_image_url\(\s*\$amount/);
        expect(CODE.assets).toMatch(/'promptpay_qr_url'\s*=>/);
        expect(CODE.assets).toMatch(/'bank_logo_url'\s*=>/);
    });

    test('B2 — copy-to-clipboard helper uses navigator.clipboard + execCommand fallback', () => {
        expect(CODE.assets).toMatch(/function\s+_dncDashCopyText\s*\(/);
        expect(CODE.assets).toMatch(/navigator\.clipboard\.writeText/);
        expect(CODE.assets).toMatch(/document\.execCommand\(\s*'copy'\s*\)/);
    });

    // B3 — Primary CTA swaps to "ชำระ ฿X" when pending charge exists
    test('B3 — dinoco_dashboard_get_pending_charge_for_claim helper defined', () => {
        expect(CODE.assets).toMatch(/function\s+dinoco_dashboard_get_pending_charge_for_claim\s*\(\s*\$claim_id\s*\)/);
    });

    test('B3 — pending charge helper owner-scoped + status=pending_payment', () => {
        const block = CODE.assets.match(/function\s+dinoco_dashboard_get_pending_charge_for_claim[\s\S]{0,2000}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/user_id\s*=\s*%d/);
        expect(block[0]).toMatch(/status\s*=\s*'pending_payment'/);
    });

    test('B3 — primary CTA has conditional branch `$is_claimed && $has_pending_charge`', () => {
        expect(CODE.assets).toMatch(/\$has_pending_charge\s*=\s*false/);
        expect(CODE.assets).toMatch(/\$is_claimed\s*&&\s*\$has_pending_charge/);
    });

    test('B3 — pending charge label uses "💳 ชำระค่าซ่อม ฿X" + green', () => {
        expect(CODE.assets).toMatch(/'💳 ชำระค่าซ่อม ฿'/);
        // Below the "💳 ชำระค่าซ่อม ฿" assignment, the same branch sets the green color.
        const block = CODE.assets.match(/'💳 ชำระค่าซ่อม ฿'[\s\S]{0,500}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/'#16a34a'/);
    });

    test('B3 — "📦 ติดตามเคลม" demoted to overflow when has_pending_charge', () => {
        // Overflow menu has a new conditional branch rendering 📦 ติดตามเคลม when has_pending_charge.
        const overflowBlock = CODE.assets.match(/data-action="claim-track"[\s\S]{0,500}/);
        expect(overflowBlock).not.toBeNull();
        expect(overflowBlock[0]).toMatch(/📦 ติดตามเคลม/);
    });

    // B4 — Triple redundancy eliminated
    test('B4 — banner copy collapsed to single sentence "แตะเพื่อชำระ"', () => {
        expect(CODE.member).toMatch(/แตะเพื่อชำระ/);
    });

    test('B4 — banner is whole-clickable anchor (NOT button + separate CTA)', () => {
        // Anchor wrap pattern — banner-title inside anchor, no separate banner-actions.
        const ch = CODE.member.match(/dnc-sn-banner-charge-pending dnc-sn-banner-clickable[\s\S]{0,800}/);
        expect(ch).not.toBeNull();
        // Should NOT have a "ดูรายละเอียด" CTA block (redundancy eliminated).
        expect(ch[0]).not.toMatch(/dnc-sn-banner-cta/);
        // Should NOT have a "dnc-sn-banner-actions" wrapper.
        expect(ch[0]).not.toMatch(/dnc-sn-banner-actions/);
    });

    test('B4 — inline card section does NOT render "ค่าซ่อม/ส่วนต่างที่รอชำระ" header (redundancy eliminated)', () => {
        // The literal redundant header text from V.32.0 is gone from production code.
        // Header strings in version-comments are stripped — CODE.assets is comment-free.
        expect(CODE.assets).not.toMatch(/ค่าซ่อม\/ส่วนต่างที่รอชำระ/);
    });

    test('B4 — inline card section does NOT render "รอชำระ" status pill', () => {
        // The literal `dnc-sn-asset-card-charge-status` pill class is removed.
        // (CODE.assets strips comments — any remaining ref would be live code drift.)
        expect(CODE.assets).not.toMatch(/dnc-sn-asset-card-charge-status['"]/);
    });

    test('B4 — compact 1-row layout container `.dnc-sn-asset-card-charge-compact` exists', () => {
        expect(CODE.assets).toMatch(/dnc-sn-asset-card-charge-compact/);
        // Pay button is rendered INSIDE compact container (right-aligned).
        const block = CODE.assets.match(/dnc-sn-asset-card-charge-compact[\s\S]{0,800}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/dnc-sn-asset-card-charge-pay-btn/);
    });

    // B5 — Anchor scroll highlight + 600ms modal delay + prefers-reduced-motion
    test('B5 — `@keyframes dnc-pay-arrive` defined (2s glow)', () => {
        expect(CODE.assets).toMatch(/@keyframes\s+dnc-pay-arrive/);
    });

    test('B5 — `.is-target` class applied via JS for 2s then removed', () => {
        expect(CODE.assets).toMatch(/row\.classList\.add\(\s*'is-target'\s*\)/);
        expect(CODE.assets).toMatch(/setTimeout\(\s*function\(\)\s*\{\s*row\.classList\.remove\(\s*'is-target'\s*\)/);
    });

    test('B5 — modal opens AFTER 600ms delay (auto-scroll highlight visible first)', () => {
        // 600ms setTimeout wrapping dncDashOpenChargeModal call
        const block = CODE.assets.match(/dnc:claim-pay-open[\s\S]{0,1500}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/setTimeout\([\s\S]{0,200}dncDashOpenChargeModal[\s\S]{0,200}\}\s*,\s*600\s*\)/);
    });

    test('B5 — prefers-reduced-motion fallback renders solid border (no animation)', () => {
        const block = CODE.assets.match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)[\s\S]{0,500}/);
        expect(block).not.toBeNull();
        // First match must contain is-target fallback rule
        const isTargetMq = CODE.assets.match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{\s*\.dnc-sn-asset-card-charge-row\.is-target\s*\{[\s\S]{0,300}\}/);
        expect(isTargetMq).not.toBeNull();
        expect(isTargetMq[0]).toMatch(/animation:\s*none/);
        expect(isTargetMq[0]).toMatch(/border:/);
    });

    // S1 — Design Tokens migration (>=10 var(--dnc-*) refs in new CSS)
    test('S1 — Assets List new charge/modal CSS migrated to var(--dnc-*) tokens', () => {
        // Count distinct var(--dnc-*) refs across both surfaces
        const assetsMatches = (CODE.assets.match(/var\(\s*--dnc-[a-z0-9-]+/g) || []).length;
        expect(assetsMatches).toBeGreaterThanOrEqual(10);
    });

    test('S1 — danger/warning/info/green Design Tokens referenced (not raw hex)', () => {
        // Specific tokens that must appear in new CSS surface.
        expect(CODE.assets).toMatch(/--dnc-warning-amber-bg/);
        expect(CODE.assets).toMatch(/--dnc-warning-amber/);
        expect(CODE.assets).toMatch(/--dnc-brand-green/);
        expect(CODE.assets).toMatch(/--dnc-info-blue-bg/);
    });

    // S2 — Mobile < 360px stack
    test('S2 — `@media (max-width: 360px)` block stacks charge row vertically', () => {
        const block = CODE.assets.match(/@media\s*\(\s*max-width:\s*360px\s*\)[\s\S]{0,600}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/dnc-sn-asset-card-charge-compact/);
        expect(block[0]).toMatch(/flex-direction:\s*column/);
    });

    // S3 — Slip input min-height 44px (iOS HIG)
    test('S3 — `.dnc-dash-pay-slip-input` has min-height: 44px', () => {
        const block = CODE.assets.match(/\.dnc-dash-pay-slip-input\s*\{[\s\S]{0,500}\}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/min-height:\s*44px/);
    });

    // S4 — Banner priority dynamic (expiry < 7d wins)
    test('S4 — banner priority dynamic: expiry < 7d wins over charge_pending', () => {
        // Helper variable + comment marker
        expect(CODE.member).toMatch(/\$_expiry_critical\s*=\s*false/);
        expect(CODE.member).toMatch(/_expiry_window_days\s*=\s*7/);
        // Two branches of $ordered = array_filter(...) exist
        const branches = (CODE.member.match(/\$ordered\s*=\s*array_filter\(\s*array\(/g) || []).length;
        expect(branches).toBeGreaterThanOrEqual(2);
    });

    // S5 — Card density expander
    test('S5 — expander button "ดูทั้งหมด N รายการ" when charges > 1', () => {
        expect(CODE.assets).toMatch(/dnc-sn-asset-card-charges-expander/);
        expect(CODE.assets).toMatch(/data-action="toggle-charge-expander"/);
        expect(CODE.assets).toMatch(/ดูทั้งหมด/);
    });

    test('S5 — hidden rows class `.dnc-sn-asset-card-charge-row--hidden` toggled by expander', () => {
        expect(CODE.assets).toMatch(/dnc-sn-asset-card-charge-row--hidden/);
        // JS handler toggles hidden class on row + aria-expanded on button
        const handler = CODE.assets.match(/toggle-charge-expander[\s\S]{0,800}/);
        expect(handler).not.toBeNull();
        expect(handler[0]).toMatch(/aria-expanded/);
    });

    // S6 — Banner role=alert + aria-live
    test('S6 — charge_pending banner has role="alert" + aria-live="polite"', () => {
        const ch = CODE.member.match(/dnc-sn-banner-charge-pending[\s\S]{0,500}/);
        expect(ch).not.toBeNull();
        expect(ch[0]).toMatch(/role="alert"/);
        expect(ch[0]).toMatch(/aria-live="polite"/);
    });

    // S7 — Modal double-submit guard + spinner
    test('S7 — submit button references by ID (not ev.target — fragile)', () => {
        expect(CODE.assets).toMatch(/document\.getElementById\(\s*'dnc-dash-pay-submit-'\s*\+\s*chargeId\s*\)/);
    });

    test('S7 — submit button disabled + spinner during upload + re-enabled on error', () => {
        // Disabled toggle in submit handler
        expect(CODE.assets).toMatch(/submitBtn\.disabled\s*=\s*true/);
        expect(CODE.assets).toMatch(/dnc-dash-pay-spinner/);
        // Re-enable in error paths (xhr 4xx + onerror + JSON parse fail)
        const reEnableCount = (CODE.assets.match(/submitBtn\.disabled\s*=\s*false/g) || []).length;
        expect(reEnableCount).toBeGreaterThanOrEqual(2);
    });

    test('S7 — spinner element + @keyframes dnc-dash-spin defined', () => {
        expect(CODE.assets).toMatch(/\.dnc-dash-pay-spinner\s*\{/);
        expect(CODE.assets).toMatch(/@keyframes\s+dnc-dash-spin/);
    });

    // REG-029 — feature flag OFF preserves byte-identical V.32.0 behavior on backend.
    test('REG-029 — both surfaces still gate on `dinoco_claim_payment_enabled` (flag OFF = byte-identical)', () => {
        expect(CODE.assets).toMatch(/get_option\(\s*'dinoco_claim_payment_enabled'/);
        expect(CODE.member).toMatch(/get_option\(\s*'dinoco_claim_payment_enabled'/);
    });
});
