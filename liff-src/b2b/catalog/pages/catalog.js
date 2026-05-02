/**
 * B2B LIFF E-Catalog — Catalog grid renderer (V.0.3 Round 2)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   - line 999-1153 : renderProducts (2-col grid + lazy load + qty stepper)
 *
 * Round 2 contract:
 *   Pure function — takes (products, opts) and returns HTML string.
 *   Caller owns DOM injection + event delegation (`data-action="..."`
 *   already emitted on every interactive node).
 *
 * REG-029 byte-identical preservation:
 *   - Card class names: `b2b-cat-product` / `oos`
 *   - Badge order: SET (left) + stock (right) — V.32.0 SET overlay
 *   - V.32.6 P18 LCP boost: first 6 images get fetchpriority="high"
 *     loading="eager"; the rest get loading="lazy"
 *   - SET → "ดูชุด" purple button when not in cart, qty stepper when
 *     already added (see V.32.0)
 *   - Low stock yellow chip "สั่งก่อนหมด"
 *   - OOS price hidden, replaces add btn with "สินค้าหมด" disabled chip
 *   - Discount "-N%" red badge appears only when discount > 0
 */

import { escHtml, formatNumber } from "../utils/format.js";
import { productMatchesModel } from "./home.js";

/**
 * Filter the product list for the current view.
 *
 * Mirrors inline filter at line 1003-1028 verbatim.
 *
 * @param {Array<object>} products
 * @param {{
 *   viewMode: string,
 *   searchQuery?: string,
 *   filterModel?: string,
 *   filterCategory?: string,
 *   crossFilter?: string,
 *   homeSearchQuery?: string,
 * }} state
 * @returns {Array<object>}
 */
export function filterProducts(products, state) {
    const viewMode = (state && state.viewMode) || "home";
    const search = ((state && state.searchQuery) || "").toLowerCase();
    const filterModel = (state && state.filterModel) || "";
    const filterCategory = (state && state.filterCategory) || "";
    const crossFilter = (state && state.crossFilter) || "";
    const homeSearch = ((state && state.homeSearchQuery) || "").toLowerCase();

    return (products || []).filter((p) => {
        if (viewMode === "search" && search) {
            const haystack = (
                (p.name || "") + " " +
                (p.sku || "") + " " +
                (p.category || "") + " " +
                (p.compatible_models || "")
            ).toLowerCase();
            return haystack.indexOf(search) >= 0;
        }
        if (viewMode === "model") {
            if (!productMatchesModel(p, filterModel)) return false;
            if (crossFilter && (p.category || "") !== crossFilter) return false;
            return true;
        }
        if (viewMode === "category") {
            if ((p.category || "") !== filterCategory) return false;
            if (crossFilter && !productMatchesModel(p, crossFilter)) return false;
            return true;
        }
        // home — apply search box if provided
        if (homeSearch) {
            const haystack = (
                (p.name || "") + " " +
                (p.sku || "") + " " +
                (p.category || "") + " " +
                (p.compatible_models || "")
            ).toLowerCase();
            return haystack.indexOf(homeSearch) >= 0;
        }
        return true;
    });
}

/**
 * Build the model-tags row inside a product card.
 *
 * Inline V.32.9 truncates to 3 visible tags + "+N" suffix.
 *
 * @param {Array<string|{name:string}>} models
 * @returns {string}
 */
function renderModelTags(models) {
    if (!models || !models.length) return "";
    let html = '<div class="b2b-cat-model-tags">';
    let shown = 0;
    for (let i = 0; i < models.length && shown < 3; i++) {
        const m = models[i];
        const n = typeof m === "string" ? m : (m && m.name) || "";
        if (!n) continue;
        shown++;
        html += '<span class="b2b-cat-model-tag">' + escHtml(n) + "</span>";
    }
    if (models.length > 3) {
        html += '<span class="b2b-cat-model-tag">+' +
            (models.length - 3) + "</span>";
    }
    html += "</div>";
    return html;
}

/**
 * Format an ISO date "YYYY-MM-DD" to "DD/MM/YYYY". Used for ETA display.
 * Returns "" when input is malformed.
 *
 * Mirrors inline string-split logic at line 1081-1083 + 1338-1339.
 *
 * @param {string} eta
 * @returns {string}
 */
export function formatEtaDate(eta) {
    if (!eta) return "";
    const parts = String(eta).split("-");
    if (parts.length !== 3) return "";
    return parts[2] + "/" + parts[1] + "/" + parts[0];
}

/**
 * Build HTML for a single product card.
 *
 * @param {object} product - normalized catalog row
 * @param {{ index: number, qty: number }} ctx
 * @returns {string}
 */
export function renderProductCard(product, ctx) {
    const p = product || {};
    const idx = (ctx && ctx.index) || 0;
    const qty = (ctx && ctx.qty) || 0;
    const sd = p.stock_display || p.stock_status || "in_stock";
    const isOOS = sd === "out_of_stock";
    const isLow = sd === "low_stock";
    const isSet = p.is_set === true;
    const safeSku = escHtml(p.sku);

    const cardCls = "b2b-cat-product" + (isOOS ? " oos" : "");
    let h = '<div class="' + cardCls + '" data-sku="' + safeSku + '">';

    // Badges — SET (left) + stock (right)
    if (isSet) {
        h += '<div class="b2b-cat-badge set">SET</div>';
    }
    if (isOOS) {
        h += '<div class="b2b-cat-badge oos">สินค้าหมด</div>';
    } else if (isLow) {
        h += '<div class="b2b-cat-badge low">ใกล้หมด</div>';
    }

    // Image (LCP boost — first 6 eager + high priority)
    const imgPriority = idx < 6
        ? ' fetchpriority="high" loading="eager"'
        : ' loading="lazy"';
    h += '<div class="b2b-cat-img">';
    if (p.img) {
        h += '<img src="' + escHtml(p.img) +
            '" alt="' + escHtml(p.name || p.sku) + '"' + imgPriority + ">";
    } else {
        h +=
            '<div class="b2b-cat-img-placeholder" aria-hidden="true">📦</div>';
    }
    h += "</div>";

    // Info
    h += '<div class="b2b-cat-info">';
    h += '<div class="b2b-cat-name">' + escHtml(p.name) + "</div>";

    h += renderModelTags(p._models || []);

    // ETA / low-stock chip
    if (isOOS) {
        if (p.stock_eta) {
            const etaFmt = formatEtaDate(p.stock_eta);
            h += '<div class="b2b-cat-eta">คาดว่ามีของ ' + escHtml(etaFmt) +
                "</div>";
        } else {
            h += '<div class="b2b-cat-eta">ยังไม่ทราบกำหนด</div>';
        }
    }
    if (isLow) {
        h +=
            '<div class="b2b-cat-eta" style="display:inline-block;' +
            'background:#fff3e0;color:#e65100;font-size:10px;font-weight:700;' +
            'padding:2px 8px;border-radius:4px;">สั่งก่อนหมด</div>';
    }

    // Price row
    h += '<div class="b2b-cat-price-row">';
    if (p.discount > 0) {
        h += '<div class="b2b-cat-retail">฿' + formatNumber(p.price) +
            "</div>";
        h += '<span class="b2b-cat-dealer">฿' +
            formatNumber(p.dealer_price) + "</span>";
        h += '<span class="b2b-cat-discount">-' +
            Math.round(p.discount) + "%</span>";
    } else {
        h += '<span class="b2b-cat-dealer">฿' +
            formatNumber(p.dealer_price) + "</span>";
    }
    h += "</div>";
    h += "</div>"; // /info

    // Cart row — SET shows "ดูชุด" overlay btn unless already in cart
    h += '<div class="b2b-cat-cart-row">';
    if (isSet && !isOOS) {
        if (qty > 0) {
            h +=
                '<div class="b2b-cat-qty-row">' +
                '<button class="b2b-cat-qty-btn" data-sku="' + safeSku +
                '" data-action="minus">−</button>' +
                '<div class="b2b-cat-qty-val" id="qty-' + safeSku +
                '">' + qty + "</div>" +
                '<button class="b2b-cat-qty-btn" data-sku="' + safeSku +
                '" data-action="plus">+</button>' +
                "</div>";
        } else {
            h +=
                '<button class="b2b-cat-add-btn" data-sku="' + safeSku +
                '" data-action="detail" ' +
                'style="background:#7c3aed;border-color:#7c3aed;">' +
                "ดูชุด</button>";
        }
    } else if (isOOS) {
        h += '<div class="b2b-cat-add-btn" ' +
            'style="opacity:0.3;pointer-events:none;">สินค้าหมด</div>';
    } else if (qty > 0) {
        h +=
            '<div class="b2b-cat-qty-row">' +
            '<button class="b2b-cat-qty-btn" data-sku="' + safeSku +
            '" data-action="minus">−</button>' +
            '<div class="b2b-cat-qty-val" id="qty-' + safeSku +
            '">' + qty + "</div>" +
            '<button class="b2b-cat-qty-btn" data-sku="' + safeSku +
            '" data-action="plus">+</button>' +
            "</div>";
    } else {
        h +=
            '<button class="b2b-cat-add-btn" data-sku="' + safeSku +
            '" data-action="add">+ เพิ่ม</button>';
    }
    h += "</div>"; // /cart-row

    h += "</div>"; // /card
    return h;
}

/**
 * Render the full product grid HTML for the current state.
 *
 * Returns `{ html, count }`. The `count` is exposed so callers can
 * update the sub-page count badge (line 1031-1033 inline) without
 * filtering twice.
 *
 * @param {Array<object>} products
 * @param {object} state - viewMode, filters, cart
 * @returns {{ html: string, count: number, isEmpty: boolean }}
 */
export function renderProducts(products, state) {
    const cart = (state && state.cart) || {};
    const filtered = filterProducts(products, state);
    if (!filtered.length) {
        return { html: "", count: 0, isEmpty: true };
    }
    const html = filtered
        .map((p, idx) =>
            renderProductCard(p, { index: idx, qty: cart[p.sku] || 0 })
        )
        .join("");
    return { html, count: filtered.length, isEmpty: false };
}
