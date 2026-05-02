/**
 * B2F LIFF Admin E-Catalog — SET Detail page renderers (V.0.3 Round 2)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.14
 *   - line 2431 updateSetDetailAddBtn() + buildSetFullStepperHtml()
 *   - line 2567 buildQtyStepperHtml(sku, qty, collapsedDefault)
 *   - line 2623 renderSetDetailItems()  — children + grandchildren
 *
 * Pure HTML builders. No DOM mutation, no event binding. Round 3+ binds
 * `data-stepsku` / `data-stepact` / `data-subaddsku` via event delegation.
 *
 * V.6.4 collapsed-default sub-items: `+ สั่งแยก` button replaces stepper
 *   when `qty=0` to avoid the "is `1` in cart?" UX confusion.
 *
 * V.6.3: 56×56 thumbnails added to cart rows (inline V.7.14 line 2862).
 *   The `buildQtyStepperHtml` here is reused by both SET Detail children
 *   AND the main SET stepper at the top of SET Detail.
 */

import { escHtml, formatNumber, currencySymbol } from "../utils/format.js";

/**
 * Build the main SET stepper HTML — the "+ ชุดเต็ม" button at the top
 * of SET Detail overlay. Allows admin to type N (1-999) and add full SET
 * in one tap.
 *
 * Mirrors `buildSetFullStepperHtml()` (Snippet 8 V.7.14 line 2449).
 *
 * @param {string} sku
 * @param {number} qtyInCart
 * @param {number} [typedQty] - preserved typed value across re-render (default 1)
 * @param {{ moq?: number }} [opts]
 * @returns {string}
 */
export function renderSetDetailMainStepper(sku, qtyInCart, typedQty, opts = {}) {
    const safeSku = escHtml(sku);
    const q =
        typeof typedQty === "number" && typedQty > 0
            ? Math.max(1, Math.min(999, typedQty))
            : 1;
    const inCart = qtyInCart > 0;
    let html =
        '<div class="b2f-qty-stepper" data-stepsku="' +
        safeSku +
        '" data-setmain="1">' +
        '<div class="b2f-qty-stepper-group">' +
        '<button type="button" class="b2f-qty-stepper-btn" data-stepact="minus" aria-label="ลด">−</button>' +
        '<input type="number" class="b2f-qty-stepper-input" value="' +
        q +
        '" min="1" max="999" inputmode="numeric" data-stepact="input">' +
        '<button type="button" class="b2f-qty-stepper-btn" data-stepact="plus" aria-label="เพิ่ม">+</button>' +
        "</div>" +
        '<button type="button" class="b2f-qty-stepper-add' +
        (inCart ? " in-cart" : "") +
        '" data-stepact="add">' +
        (inCart ? "+ ชุดเต็ม (ในตะกร้า " + qtyInCart + ")" : "+ ชุดเต็ม") +
        "</button>" +
        "</div>";

    // V.7.5 UX-H14: MOQ hint
    const moq = parseInt(String(opts.moq || 1), 10) || 1;
    if (moq > 1) {
        html +=
            '<span class="b2f-moq-hint" style="display:block;margin-top:4px;font-size:11px;color:#6b7280;text-align:right;">ขั้นต่ำ ' +
            moq +
            " ชุด</span>";
    }
    return html;
}

/**
 * Generic qty stepper HTML — reused by SET Detail children/grandchildren.
 *
 * Mirrors `buildQtyStepperHtml()` (Snippet 8 V.7.14 line 2567).
 *
 * @param {string} sku
 * @param {number} currentQty
 * @param {boolean} [collapsedDefault]
 *   When true and qty=0 returns a "+ สั่งแยก" button instead of stepper.
 * @returns {string}
 */
export function buildQtyStepperHtml(sku, currentQty, collapsedDefault) {
    const safeSku = escHtml(sku);
    const qtyNum = Number(currentQty) || 0;
    const q = qtyNum > 0 ? Math.max(1, Math.min(999, qtyNum)) : 1;
    const inCart = qtyNum > 0;
    if (collapsedDefault && !inCart) {
        return (
            '<button type="button" class="b2f-cat-sub-add-btn" data-subaddsku="' +
            safeSku +
            '">+ สั่งแยก</button>'
        );
    }
    return (
        '<div class="b2f-qty-stepper" data-stepsku="' +
        safeSku +
        '">' +
        '<div class="b2f-qty-stepper-group">' +
        '<button type="button" class="b2f-qty-stepper-btn" data-stepact="minus" aria-label="ลด">−</button>' +
        '<input type="number" class="b2f-qty-stepper-input" value="' +
        q +
        '" min="1" max="999" inputmode="numeric" data-stepact="input">' +
        '<button type="button" class="b2f-qty-stepper-btn" data-stepact="plus" aria-label="เพิ่ม">+</button>' +
        "</div>" +
        '<button type="button" class="b2f-qty-stepper-add' +
        (inCart ? " in-cart" : "") +
        '" data-stepact="add">' +
        (inCart ? "ในตะกร้า " + qtyNum : "+ เพิ่ม") +
        "</button>" +
        "</div>"
    );
}

/**
 * Render SET Detail items list — children with optional grandchildren
 * (V.4.3 forward-lookup via skuRelations, DD-3 shared-child safe).
 *
 * Mirrors `renderSetDetailItems()` (Snippet 8 V.7.14 line 2623).
 *
 * @param {Object} setProduct - the SET row (parent)
 * @param {{
 *   products: Object[],
 *   skuRelations: Record<string, string[]>,
 *   hierarchyMeta?: Record<string, any>,
 *   cart?: Record<string, { qty: number }>,
 *   currency?: string,
 *   countTopSetsForProduct?: (sku: string) => number
 * }} ctx
 * @returns {string}
 */
export function renderSetDetailItems(
    setProduct,
    ctx = /** @type {any} */ ({})
) {
    if (!setProduct) return "";
    const products = Array.isArray(ctx.products) ? ctx.products : [];
    const skuRelations = ctx.skuRelations || {};
    const hierarchyMeta = ctx.hierarchyMeta || {};
    const cart = ctx.cart || {};
    const csym = currencySymbol(ctx.currency || "THB");
    const countTop = typeof ctx.countTopSetsForProduct === "function" ? ctx.countTopSetsForProduct : null;

    const parentSkuU = String(setProduct.sku || "").toUpperCase();
    const setChildSkus = skuRelations[parentSkuU] || [];
    const productBySku = {};
    products.forEach((p) => {
        productBySku[String(p.sku || "").toUpperCase()] = p;
    });

    const children = [];
    setChildSkus.forEach((childSku) => {
        const cp = productBySku[childSku];
        if (cp) children.push(cp);
    });

    // Forward lookup for grandchildren (intermediate child → grandchild)
    const grandchildrenByParent = {};
    setChildSkus.forEach((midSku) => {
        const gcSkus = skuRelations[midSku] || [];
        gcSkus.forEach((gcSku) => {
            const gp = productBySku[gcSku];
            if (gp) {
                if (!grandchildrenByParent[midSku]) grandchildrenByParent[midSku] = [];
                grandchildrenByParent[midSku].push(gp);
            }
        });
    });

    if (!children.length && !Object.keys(grandchildrenByParent).length) {
        const meta = hierarchyMeta[parentSkuU];
        if (meta && meta.all_leaves && meta.all_leaves.length) {
            return (
                '<div style="text-align:center;padding:20px;color:#999;font-size:13px;">มี ' +
                meta.all_leaves.length +
                " ชิ้นส่วนในชุด (Maker ยังไม่ได้ลงทะเบียนทั้งหมด)</div>"
            );
        }
        return '<div style="text-align:center;padding:20px;color:#999;font-size:13px;">ไม่มีรายการสินค้าย่อย</div>';
    }

    let html = "";
    children.forEach((child) => {
        const chQty = cart[child.sku] ? cart[child.sku].qty : 0;
        const gcs = grandchildrenByParent[String(child.sku || "").toUpperCase()] || [];

        let row = '<div class="b2f-cat-set-child"><div class="b2f-cat-set-child-row">';
        const imgH = child.image_url
            ? '<img class="b2f-cat-set-child-img" src="' +
              escHtml(child.image_url) +
              '" alt="' +
              escHtml(child.product_name || child.sku) +
              '" loading="lazy" onerror="this.style.display=\'none\'">'
            : '<div class="b2f-cat-set-child-img" style="display:flex;align-items:center;justify-content:center;font-size:20px;color:#ccc;">&#128230;</div>';
        let infoH =
            '<div class="b2f-cat-set-child-info">' +
            '<div class="b2f-cat-set-child-name">' +
            escHtml(child.product_name) +
            "</div>" +
            '<div class="b2f-cat-set-child-sku">' +
            escHtml(child.sku) +
            "</div>" +
            '<div class="b2f-cat-set-child-price">' +
            csym +
            formatNumber(child.unit_cost) +
            "</div>";
        const sharedSetCount = countTop ? countTop(child.sku) : 0;
        if (sharedSetCount > 1) {
            infoH +=
                '<div style="margin-top:4px;font-size:10px;color:#d97706;font-weight:600;">🔗 ใช้ใน ' +
                sharedSetCount +
                " ชุด</div>";
        }
        infoH += "</div>";
        row += imgH + infoH + buildQtyStepperHtml(child.sku, chQty, true);
        row += "</div>";

        // Grandchildren section
        if (gcs.length) {
            let gcH = '<div class="b2f-cat-set-gc"><div class="b2f-cat-set-gc-label">ซื้อแยกชิ้น</div>';
            gcs.forEach((gc) => {
                const gcQty = cart[gc.sku] ? cart[gc.sku].qty : 0;
                gcH += '<div class="b2f-cat-set-gc-item">';
                if (gc.image_url) {
                    gcH +=
                        '<img class="b2f-cat-set-gc-img" src="' +
                        escHtml(gc.image_url) +
                        '" alt="' +
                        escHtml(gc.product_name || gc.sku) +
                        '" loading="lazy" onerror="this.style.display=\'none\'">';
                } else {
                    gcH +=
                        '<div class="b2f-cat-set-gc-img" style="display:flex;align-items:center;justify-content:center;font-size:14px;color:#ccc;">&#128230;</div>';
                }
                gcH +=
                    '<div class="b2f-cat-set-gc-info">' +
                    '<div class="b2f-cat-set-gc-name">' +
                    escHtml(gc.product_name) +
                    "</div>" +
                    '<div class="b2f-cat-set-gc-sku">' +
                    escHtml(gc.sku) +
                    "</div>" +
                    '<div class="b2f-cat-set-gc-price">' +
                    csym +
                    formatNumber(gc.unit_cost) +
                    "</div></div>";
                gcH += buildQtyStepperHtml(gc.sku, gcQty, true);
                gcH += "</div>";
            });
            gcH += "</div>";
            row += gcH;
        }

        row += "</div>";
        html += row;
    });
    return html;
}
