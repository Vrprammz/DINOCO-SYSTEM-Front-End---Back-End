/**
 * B2F LIFF Admin E-Catalog — Cart modal renderer (V.0.3 Round 2)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.14
 *   - line 2862 buildCartItemThumbHtml() — 56×56 thumbnails
 *   - line 2880 renderCartModal()        — V.7.0 dual-section + V.6.6 fallback
 *   - line 2544 renderCartManufacturingSummary() — DD-3 shared-leaf warn
 *
 * V.7.0 dual-section layout (when ORDER_INTENT_ENABLED):
 *   Section 1 (purple): order_mode === "full_set"
 *   Section 2 (amber):  order_mode in ("sub_unit", "single_leaf")
 *
 * V.6.6 fallback layout: SET items grouped + duplicate detection.
 *
 * Pure builder. Does not perform DOM mutation, exchange-rate validation,
 * or submit. Round 3+ wires submit + currency selectors.
 */

import { escHtml, formatNumber, currencySymbol } from "../utils/format.js";
import { orderModeLabel, orderModeBadgeClass } from "../utils/cart.js";

/**
 * Build the 56×56 cart-row thumbnail HTML.
 *
 * Mirrors `buildCartItemThumbHtml()` (Snippet 8 V.7.14 line 2862).
 *
 * @param {{ sku: string, image_url?: string, product_name?: string }} cartEntry
 * @param {{
 *   products?: Object[],
 *   catalogMap?: Record<string, { image_url?: string }>
 * }} [opts]
 * @returns {string}
 */
export function buildCartItemThumbHtml(cartEntry, opts = {}) {
    let imgUrl = (cartEntry && cartEntry.image_url) || "";
    if (!imgUrl) {
        const products = Array.isArray(opts.products) ? opts.products : [];
        const p = products.find((x) => x.sku === cartEntry.sku);
        if (p && p.image_url) imgUrl = p.image_url;
    }
    if (!imgUrl) {
        const catalogMap = opts.catalogMap || {};
        const cm = catalogMap[String(cartEntry.sku || "").toUpperCase()];
        if (cm && cm.image_url) imgUrl = cm.image_url;
    }
    if (imgUrl) {
        return (
            '<img class="b2f-cat-item-thumb" src="' +
            escHtml(imgUrl) +
            '" alt="' +
            escHtml(cartEntry.product_name || "") +
            '" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;b2f-cat-item-thumb placeholder&quot;>&#128230;</div>\'">'
        );
    }
    return '<div class="b2f-cat-item-thumb placeholder">&#128230;</div>';
}

/**
 * Render a single cart item row.
 *
 * @param {Object} cartEntry
 * @param {string} cartSku
 * @param {Object} ctx
 * @returns {string}
 */
function _renderCartItemRow(cartEntry, cartSku, ctx) {
    const c = cartEntry;
    const csym = ctx.csym;
    const sub = c.unit_cost * c.qty;
    const orderIntentEnabled = !!ctx.orderIntentEnabled;
    let modeBadge = "";
    if (orderIntentEnabled) {
        if (c.order_mode === "full_set") {
            modeBadge = '<span class="b2f-cat-cart-mode-badge purple">🟣 ชุดเต็ม</span>';
        } else {
            const modeClass = orderModeBadgeClass(c.order_mode);
            const label = orderModeLabel(c.order_mode);
            modeBadge = label
                ? '<span class="b2f-cat-cart-mode-badge ' +
                  modeClass +
                  '">' +
                  escHtml(label) +
                  "</span>"
                : "";
        }
    }
    let html =
        '<div class="b2f-cat-item">' +
        buildCartItemThumbHtml(c, ctx) +
        '<div class="b2f-cat-item-info"><div class="b2f-cat-item-name">' +
        escHtml(c.product_name) +
        "</div>" +
        '<div class="b2f-cat-item-detail">' +
        escHtml(c.sku) +
        " | " +
        c.qty +
        " x " +
        csym +
        formatNumber(c.unit_cost) +
        "</div>" +
        modeBadge +
        "</div>" +
        '<div class="b2f-cat-item-total">' +
        csym +
        formatNumber(sub) +
        "</div>" +
        '<button class="b2f-cat-item-remove" data-action="remove" data-sku="' +
        escHtml(cartSku) +
        '">&#10005;</button></div>';
    if (orderIntentEnabled && c.intent_notes) {
        html +=
            '<div class="b2f-cat-intent-note-display">📝 ' +
            escHtml(c.intent_notes) +
            "</div>";
    }
    return html;
}

/**
 * Render the cart-modal body content (HTML string only — caller injects
 * into `$cartBody.innerHTML`).
 *
 * Returns empty-state HTML when cart is empty.
 *
 * Mirrors `renderCartModal()` (Snippet 8 V.7.14 line 2880) for the items
 * portion — currency/shipping selector blocks are still rendered inline
 * here for parity, but their event wiring lives in Round 3.
 *
 * @param {Record<string, Object>} cart
 * @param {{
 *   currency?: string,
 *   orderIntentEnabled?: boolean,
 *   products?: Object[],
 *   catalogMap?: Record<string, any>,
 *   skuRelations?: Record<string, string[]>,
 *   hierarchyMeta?: Record<string, any>,
 * }} [opts]
 * @returns {{ html: string, empty: boolean, total: number }}
 */
export function renderCartItems(cart, opts = {}) {
    const skus = Object.keys(cart || {});
    const currency = opts.currency || "THB";
    const csym = currencySymbol(currency);
    if (!skus.length) {
        return {
            html:
                '<div class="b2f-cat-empty"><div class="b2f-cat-empty-icon">&#128722;</div><div>ตะกร้าว่าง</div></div>',
            empty: true,
            total: 0,
        };
    }

    const orderIntentEnabled = !!opts.orderIntentEnabled;
    const ctx = {
        csym,
        orderIntentEnabled,
        products: opts.products,
        catalogMap: opts.catalogMap,
    };

    let html = "";
    let total = 0;

    if (orderIntentEnabled) {
        const fullSetItems = [];
        const otherItems = [];
        skus.forEach((s) => {
            if (cart[s].order_mode === "full_set") fullSetItems.push(s);
            else otherItems.push(s);
        });

        if (fullSetItems.length) {
            html += '<div class="b2f-cat-cart-section-hdr purple">🟣 ชุดเต็ม</div>';
            let secTotal = 0;
            fullSetItems.forEach((s) => {
                const c = cart[s];
                secTotal += c.unit_cost * c.qty;
                html += _renderCartItemRow(c, s, ctx);
            });
            total += secTotal;
            html +=
                '<div class="b2f-cat-cart-section-sub">รวม: ' +
                csym +
                formatNumber(secTotal) +
                "</div>";
        }

        if (otherItems.length) {
            html +=
                '<div class="b2f-cat-cart-section-hdr amber">🟠 แยกชุด + ⚪ ชิ้นเดี่ยว</div>';
            let secTotal = 0;
            otherItems.forEach((s) => {
                const c = cart[s];
                secTotal += c.unit_cost * c.qty;
                html += _renderCartItemRow(c, s, ctx);
            });
            total += secTotal;
            html +=
                '<div class="b2f-cat-cart-section-sub">รวม: ' +
                csym +
                formatNumber(secTotal) +
                "</div>";
        }
    } else {
        // V.6.6 fallback — items rendered flat (SET grouping logic stays
        // in Round 3 cutover when we wire the full inline layout).
        skus.forEach((s) => {
            const c = cart[s];
            total += c.unit_cost * c.qty;
            html += _renderCartItemRow(c, s, ctx);
        });
    }

    // DD-3 manufacturing summary
    html += renderCartManufacturingSummary(cart, opts.skuRelations || {});

    return { html, empty: false, total };
}

/**
 * Compute + render DD-3 shared-leaf warning banner. Returns "" when no
 * shared leaves exist.
 *
 * Mirrors `computeCartManufacturingSummary()` + `renderCartManufacturingSummary()`
 * (Snippet 8 V.7.14 line 2506 + 2544).
 *
 * @param {Record<string, { qty: number, product_name?: string }>} cart
 * @param {Record<string, string[]>} skuRelations
 * @returns {string}
 */
export function renderCartManufacturingSummary(cart, skuRelations) {
    const summary = computeCartManufacturingSummary(cart || {}, skuRelations || {});
    const sharedLeaves = Object.keys(summary).filter(
        (sku) => summary[sku].breakdown.length > 1
    );
    if (sharedLeaves.length === 0) return "";

    let html =
        '<div style="margin:12px 0;padding:12px;background:#fef3c7;border:1px solid #fde68a;border-radius:10px;font-size:12px;color:#92400e;">';
    html += '<div style="font-weight:700;margin-bottom:6px;">⚠️ ข้อมูลการผลิต</div>';
    sharedLeaves.forEach((sku) => {
        const s = summary[sku];
        const parts = s.breakdown
            .map((b) => {
                const n =
                    b.parent_sku === "__standalone__"
                        ? "เดี่ยว"
                        : b.parent_name || b.parent_sku;
                return n + "×" + b.qty;
            })
            .join(" + ");
        html +=
            '<div style="margin:4px 0;">• <b>' +
            escHtml(sku) +
            "</b> ต้องผลิต <b>" +
            s.qty +
            '</b> ชิ้น <span style="color:#a16207;">(' +
            escHtml(parts) +
            ")</span></div>";
    });
    html += "</div>";
    return html;
}

/**
 * Walk SET → leaves recursively, accumulating qty + breakdown attribution.
 *
 * @param {Record<string, Object>} cart
 * @param {Record<string, string[]>} skuRelations
 * @returns {Record<string, { qty: number, breakdown: Array<{ parent_sku: string, parent_name: string, qty: number }> }>}
 */
export function computeCartManufacturingSummary(cart, skuRelations) {
    /** @type {Record<string, { qty: number, breakdown: Array<{ parent_sku: string, parent_name: string, qty: number }> }>} */
    const summary = {};
    const rels = skuRelations || {};
    Object.keys(cart || {}).forEach((sku) => {
        const item = cart[sku];
        const qty = item.qty || 0;
        if (qty <= 0) return;
        const skuU = sku.toUpperCase();
        const children = rels[skuU] || [];
        if (children.length > 0) {
            // Walk down to leaves
            const walkDown = (parentSku, multiplier, parentName) => {
                const chs = rels[parentSku.toUpperCase()] || [];
                chs.forEach((ch) => {
                    const chU = ch.toUpperCase();
                    const gcs = rels[chU] || [];
                    if (gcs.length === 0) {
                        if (!summary[chU]) summary[chU] = { qty: 0, breakdown: [] };
                        summary[chU].qty += multiplier;
                        summary[chU].breakdown.push({
                            parent_sku: parentSku,
                            parent_name: parentName,
                            qty: multiplier,
                        });
                    } else {
                        walkDown(ch, multiplier, parentName);
                    }
                });
            };
            walkDown(skuU, qty, item.product_name || skuU);
        } else {
            if (!summary[skuU]) summary[skuU] = { qty: 0, breakdown: [] };
            summary[skuU].qty += qty;
            summary[skuU].breakdown.push({
                parent_sku: "__standalone__",
                parent_name: "",
                qty,
            });
        }
    });
    return summary;
}
