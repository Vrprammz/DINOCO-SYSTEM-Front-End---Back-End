/**
 * LT-1 REPLAN Flex Scan เช็คประกัน drift detector — Phase 6 (2026-05-13)
 *
 * Boss decision 2026-05-13 cut original LT-1 Public Dealer Portal API (~40h)
 * and replaced with Flex menu item + minimal LIFF page (~6h).
 *
 * Locks:
 *   - B2B Snippet 1 V.34.32+ command_menu_customer adds "🛡 ระบบประกัน" section
 *     and "🔍 เช็คประกัน" item pointing to b2b-warranty-check LIFF.
 *   - NEW [B2B] Snippet 17: Warranty Check LIFF — shortcode + scanner + REST call
 *     + auto-create WP page + LIFF SDK enqueue.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const SNIPPET_1 = path.join(REPO_ROOT, "[B2B] Snippet 1: Core Utilities & LINE Flex Builders");
const SNIPPET_17 = path.join(REPO_ROOT, "[B2B] Snippet 17: Warranty Check LIFF");

function stripComments(src) {
    return src.split("\n").filter((l) => {
        const t = l.trim();
        if (t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/")) return false;
        if (t.startsWith("//")) return false;
        return true;
    }).join("\n"); // do NOT strip trailing // — clobbers URLs (https://...) inside JS strings
}

describe("LT-1 REPLAN — Flex menu item (B2B Snippet 1 V.34.32+)", () => {
    let code;

    beforeAll(() => {
        code = stripComments(fs.readFileSync(SNIPPET_1, "utf8"));
    });

    test("command_menu_customer builds b2b-warranty-check LIFF URL", () => {
        expect(code).toMatch(/b2b_liff_url\(\s*['"]b2b-warranty-check\/['"]/);
    });

    test("Menu section header '🛡 ระบบประกัน' present", () => {
        expect(code).toMatch(/b2b_menu_section\(\s*['"]🛡 ระบบประกัน['"]/);
    });

    test("Menu row '🔍 เช็คประกัน' wired to url_warranty_check", () => {
        expect(code).toMatch(/b2b_cmd_row_liff\(\s*['"]🔍['"]\s*,\s*['"]เช็คประกัน['"]\s*,\s*\$url_warranty_check/);
    });

    test("URL helper variable defined inside customer menu builder", () => {
        const idx = code.indexOf("b2b_build_flex_command_menu_customer");
        expect(idx).toBeGreaterThan(-1);
        const body = code.slice(idx, idx + 2000);
        expect(body).toMatch(/\$url_warranty_check\s*=\s*b2b_liff_url\(/);
    });
});

describe("LT-1 REPLAN — Warranty Check LIFF Snippet (B2B Snippet 17 V.0.1)", () => {
    let code;

    beforeAll(() => {
        code = stripComments(fs.readFileSync(SNIPPET_17, "utf8"));
    });

    test("Shortcode [b2b_warranty_check] registered", () => {
        expect(code).toMatch(/add_shortcode\(\s*['"]b2b_warranty_check['"]\s*,\s*['"]b2b_warr_render_page['"]/);
    });

    test("LIFF router on template_redirect for b2b-warranty-check page", () => {
        expect(code).toMatch(/is_page\(\s*['"]b2b-warranty-check['"]\s*\)/);
        expect(code).toMatch(/add_action\(\s*['"]template_redirect['"]\s*,\s*['"]b2b_warr_liff_router['"]/);
    });

    test("Auto-create WP page on admin_init (idempotent)", () => {
        expect(code).toMatch(/add_action\(\s*['"]admin_init['"]\s*,\s*['"]b2b_warr_ensure_page['"]/);
        expect(code).toMatch(/get_page_by_path\(\s*['"]b2b-warranty-check['"]\s*\)/);
        expect(code).toMatch(/wp_insert_post\(/);
    });

    test("LIFF SDK enqueued on warranty check page", () => {
        expect(code).toMatch(/wp_enqueue_script\(\s*['"]liff-sdk['"]/);
        expect(code).toMatch(/static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js/);
    });

    test("Frontend calls existing /dinoco-sn/v1/lookup/{sn} endpoint", () => {
        expect(code).toMatch(/config\.rest_url\s*\+\s*['"]lookup\/['"]/);
        expect(code).toMatch(/rest_url\(\s*['"]dinoco-sn\/v1\/['"]\s*\)/);
    });

    test("html5-qrcode lazy-loaded on scan click (not on page load)", () => {
        expect(code).toMatch(/unpkg\.com\/html5-qrcode/);
        expect(code).toMatch(/btnScan\.addEventListener\(\s*['"]click['"]\s*,\s*startScanner\s*\)/);
        const scanIdx = code.indexOf("function startScanner");
        expect(scanIdx).toBeGreaterThan(-1);
        const body = code.slice(scanIdx, scanIdx + 1200);
        expect(body).toMatch(/document\.createElement\(\s*['"]script['"]\s*\)/);
        // UX-H3 compliant: must use addEventListener('load') NOT script.onload =
        expect(body).toMatch(/addEventListener\(\s*['"]load['"]/);
    });

    test("Back button uses data-action delegation (UX-H3 compliant, no onclick=)", () => {
        // Refactored to event delegation per inline-handler-regression baseline
        expect(code).toMatch(/data-action=['"]back['"]/);
        expect(code).toMatch(/t\.dataset\.action\s*===\s*['"]back['"]/);
    });

    test("Status badge mapping covers all sn_pool states", () => {
        const states = ["registered", "claimed", "replaced", "stolen", "voided", "recalled", "in_pool", "shipped"];
        states.forEach((s) => {
            expect(code).toContain(`case '${s}':`);
        });
    });

    test("Buddhist year date formatter present", () => {
        expect(code).toMatch(/function fmtBuddhistDate/);
        expect(code).toMatch(/\.getFullYear\(\)\s*\+\s*543/);
    });

    test("Touch targets ≥ 44px for WCAG AA", () => {
        expect(code).toMatch(/--warr-touch:\s*44px/);
    });

    test("Scoped CSS prefix .b2b-warr-* (no namespace bleed)", () => {
        expect(code).toMatch(/\.b2b-warr-root/);
        expect(code).toMatch(/\.b2b-warr-header/);
        expect(code).toMatch(/\.b2b-warr-btn-scan/);
    });

    test("LIFF init follows D11 (no new JWT — reuse WP session)", () => {
        expect(code).toMatch(/liff\.init\(\s*\{\s*liffId:\s*config\.liff_id\s*\}/);
        expect(code).toMatch(/liff\.login\(\)/);
    });

    test("normalizeSn handles URL form ?sn=DNCSS... + plain text", () => {
        expect(code).toMatch(/function normalizeSn/);
        expect(code).toMatch(/searchParams\.get\(\s*['"]sn['"]\s*\)/);
        expect(code).toMatch(/DNC\[A-Z0-9\]\{4,16\}/);
    });
});
