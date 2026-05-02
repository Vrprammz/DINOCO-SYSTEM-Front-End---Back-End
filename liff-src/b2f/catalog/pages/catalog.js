/**
 * B2F LIFF Admin E-Catalog — Catalog grid renderer (V.0.3 Round 2)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.14
 *   - line 2129 renderProducts(list, hier)  — main grid loop
 *   - line 2140 product card rendering (3 V.7.0 variants + V.6.6 fallback)
 *   - virtual badge (line 2160) + production-mode badge + breadcrumb +
 *     stepper / "ดูชุด" button + LCP `fetchpriority="high"` for first 6 imgs
 *
 * V.7.0 Card variants (when ORDER_INTENT_ENABLED):
 *   🟣 set_assembled            → "ดูชุด" button (purple)
 *   🟠 sub_unit                  → qty stepper + sub-info "สั่ง 1 ชุด = ผลิต N ชิ้น"
 *   🟠 cross_factory_assembly    → DINOCO ประกอบ (hidden when admin_display_mode='as_parts')
 *   ⚪ single_leaf               → qty stepper
 *
 * Pure HTML builder — no DOM mutation, no event binding. Caller injects
 * the result into `$productArea.innerHTML` and binds via event delegation
 * (Round 3 module).
 *
 * REG-029: byte-identical with inline V.7.14 (DOM/classes/data-attrs).
 */

import { escHtml, formatNumber, currencySymbol } from "../utils/format.js";

/**
 * Render the entire catalog grid for a filtered product list.
 *
 * @param {Object[]} list
 * @param {Object} hier — buildHierarchyLookup() output
 * @param {{
 *   cart?: Record<string, { qty: number }>,
 *   currency?: string,
 *   orderIntentEnabled?: boolean,
 *   skuRelations?: Record<string, string[]>,
 *   hierarchyMeta?: Record<string, any>,
 *   products?: Object[]            // full list — used for sub_unit preview
 * }} [opts]
 * @returns {string}
 */
export function renderProducts(list, hier, opts = {}) {
    if (!list || !list.length) {
        return (
            '<div class="b2f-cat-empty">' +
            '<div class="b2f-cat-empty-icon">&#128270;</div>' +
            "<div>ไม่พบสินค้าที่ค้นหา</div></div>"
        );
    }

    const cart = opts.cart || {};
    const currency = opts.currency || "THB";
    const orderIntentEnabled = !!opts.orderIntentEnabled;
    const skuRelations = opts.skuRelations || {};
    const hierarchyMeta = opts.hierarchyMeta || {};
    const products = Array.isArray(opts.products) ? opts.products : [];
    const csym = currencySymbol(currency);

    let html = '<div class="b2f-cat-grid">';
    let priorityRendered = 0; // V.7.7 P18 LCP boost — first 6 images get fetchpriority

    list.forEach((p) => {
        const admDisplay = String(p.admin_display_mode || "auto");

        // V.7.0 ungroup: skip rendering when admin marked as_parts + has children
        if (orderIntentEnabled && admDisplay === "as_parts" && p.has_children) {
            return;
        }

        html += renderProductCard(p, {
            cart,
            currency,
            orderIntentEnabled,
            skuRelations,
            hierarchyMeta,
            products,
            isPriorityImg: priorityRendered < 6 && !!p.image_url,
            csym,
        });
        if (p.image_url) priorityRendered++;
    });

    html += "</div>";
    return html;
}

/**
 * Render a single product card. Exposed for narrow tests + future
 * partial-render scenarios.
 *
 * @param {Object} p
 * @param {Object} ctx
 * @returns {string}
 */
export function renderProductCard(p, ctx = {}) {
    const cart = ctx.cart || {};
    const orderIntentEnabled = !!ctx.orderIntentEnabled;
    const skuRelations = ctx.skuRelations || {};
    const hierarchyMeta = ctx.hierarchyMeta || {};
    const products = Array.isArray(ctx.products) ? ctx.products : [];
    const csym = ctx.csym || currencySymbol(ctx.currency || "THB");

    const jsType = p._jsType || "single";
    const jsDisplay = p._jsDisplayType || jsType;
    const isSet = jsType === "set";
    const inCart = !!cart[p.sku];
    const qty = cart[p.sku] ? cart[p.sku].qty : 0;
    const pm = String(p.production_mode || "");
    const confStatus = String(p.confirmation_status || "");
    const skuU = String(p.sku || "").toUpperCase();

    // Virtual SET badge (V.6.5+)
    let virtualBadge = "";
    if (p.is_virtual && p.virtual_reason === "shared_parts_assembled") {
        virtualBadge =
            '<span class="b2f-cat-virtual-badge" title="SET นี้ประกอบจากชิ้นส่วนที่ใช้ร่วมกับ SET อื่น">&#128279; ประกอบจากชิ้นส่วน</span>';
    }

    // Image (LCP boost: first 6 imgs eager)
    const isPriorityImg = !!ctx.isPriorityImg;
    const imgLoadAttrs = isPriorityImg
        ? ' fetchpriority="high" loading="eager"'
        : ' loading="lazy"';
    const imgInner = p.image_url
        ? '<img src="' +
          escHtml(p.image_url) +
          '" alt="' +
          escHtml(p.product_name) +
          '"' +
          imgLoadAttrs +
          " onerror=\"this.parentElement.innerHTML='&#128230;'\">"
        : "&#128230;";
    const imgStyle = p.image_url
        ? ""
        : "font-size:32px;display:flex;align-items:center;justify-content:center;";
    const imgHtml =
        '<div class="b2f-cat-card-img"' +
        (imgStyle ? ' style="' + imgStyle + '"' : "") +
        ">" +
        virtualBadge +
        imgInner +
        "</div>";

    // Shipping line
    let shipLine = "";
    if (
        (p.shipping_land && p.shipping_land > 0) ||
        (p.shipping_sea && p.shipping_sea > 0)
    ) {
        shipLine =
            '<div style="font-size:9px;color:var(--b2f-text-muted);margin-bottom:2px;">ค่าส่ง: รถ ฿' +
            formatNumber(p.shipping_land || 0) +
            " | เรือ ฿" +
            formatNumber(p.shipping_sea || 0) +
            "</div>";
    }

    // Type badge — V.7.0 production_mode OR V.6.6 fallback
    let typeBadge = "";
    if (orderIntentEnabled && pm) {
        if (pm === "set_assembled") {
            let lc = "";
            if (hierarchyMeta[skuU] && hierarchyMeta[skuU].total_leaves) {
                lc = hierarchyMeta[skuU].total_leaves;
            } else if (p._jsChildrenCount) {
                lc = p._jsChildrenCount;
            }
            typeBadge =
                '<span class="b2f-cat-badge b2f-cat-badge-set-assembled">🟣 ชุดเต็ม' +
                (lc ? " " + lc + " ชิ้น" : "") +
                "</span>";
            if (confStatus === "auto_synced") {
                typeBadge += '<span class="b2f-cat-badge-unconfirmed">⚠️</span>';
            }
        } else if (pm === "sub_unit") {
            typeBadge = '<span class="b2f-cat-badge b2f-cat-badge-sub-unit">🟠 แยกชุด</span>';
        } else if (pm === "cross_factory_assembly") {
            typeBadge =
                '<span class="b2f-cat-badge b2f-cat-badge-cross-factory">🟠 DINOCO ประกอบ</span>';
        } else {
            typeBadge = '<span class="b2f-cat-badge b2f-cat-badge-single">⚪ ชิ้นเดี่ยว</span>';
        }
    } else {
        // V.6.6 fallback
        if (jsDisplay === "set") {
            let lc = "";
            if (hierarchyMeta[skuU] && hierarchyMeta[skuU].total_leaves)
                lc = hierarchyMeta[skuU].total_leaves;
            else if (p._jsChildrenCount) lc = p._jsChildrenCount;
            typeBadge =
                '<span class="b2f-cat-badge b2f-cat-badge-set">ชุด ' +
                (lc ? lc + " ชิ้น" : "") +
                "</span>";
        } else if (jsDisplay === "child") {
            typeBadge = '<span class="b2f-cat-badge b2f-cat-badge-child">ชิ้นส่วน</span>';
        } else if (jsDisplay === "grandchild") {
            typeBadge = '<span class="b2f-cat-badge b2f-cat-badge-grandchild">ชิ้นส่วนย่อย</span>';
        } else if (jsDisplay === "single") {
            typeBadge = '<span class="b2f-cat-badge b2f-cat-badge-single">เดี่ยว</span>';
        }
    }

    if (p._jsIsOverride) {
        typeBadge +=
            '<span class="b2f-cat-badge-override" title="Admin override: auto=' +
            escHtml(jsType) +
            '">&#9995;</span>';
    }

    // Breadcrumb for orphan child / grandchild
    let breadcrumb = "";
    if ((jsDisplay === "child" || jsDisplay === "grandchild") && p.top_parent_name) {
        breadcrumb =
            '<div class="b2f-cat-breadcrumb">' + escHtml(p.top_parent_name) + "</div>";
    }

    // Card classes
    let cardClass = "b2f-cat-card";
    if (isSet) cardClass += " is-set";
    if (inCart) cardClass += " in-cart";
    if (orderIntentEnabled && pm === "cross_factory_assembly")
        cardClass += " is-cross-factory";

    let html =
        '<div class="' +
        cardClass +
        '" data-sku="' +
        escHtml(p.sku) +
        '">' +
        imgHtml +
        '<div class="b2f-cat-card-body">' +
        typeBadge +
        breadcrumb +
        '<div class="b2f-cat-card-sku">' +
        escHtml(p.sku) +
        "</div>" +
        '<div class="b2f-cat-card-name">' +
        escHtml(p.product_name) +
        "</div>" +
        '<div class="b2f-cat-card-cost">' +
        csym +
        formatNumber(p.unit_cost) +
        "</div>" +
        shipLine;

    // V.7.0 sub_unit info strip
    if (orderIntentEnabled && pm === "sub_unit" && p._jsChildrenCount > 0) {
        const childSkus = skuRelations[skuU] || [];
        html +=
            '<div class="b2f-cat-sub-info">⚡ สั่ง 1 ชุด = ผลิต ' +
            childSkus.length +
            " ชิ้น";
        if (qty > 0 && childSkus.length) {
            const preview = childSkus
                .map((cs) => {
                    const cp = products.find(
                        (x) => String(x.sku || "").toUpperCase() === cs
                    );
                    const label = cp ? (cp.product_name || cs).substring(0, 12) : cs;
                    return label + " x" + qty;
                })
                .join(" + ");
            html +=
                '<div class="b2f-cat-sub-preview">จะขยายเป็น: ' +
                escHtml(preview) +
                "</div>";
        }
        html += "</div>";
    }

    html +=
        '<div class="b2f-cat-card-meta"><span>MOQ: ' +
        (p.moq || 1) +
        "</span><span>Lead: " +
        (p.lead_time_days || 0) +
        " วัน</span></div>";

    if (isSet) {
        const setBtnClass = "b2f-cat-set-btn" + (inCart ? " in-cart-btn" : "");
        const setBtnText = inCart ? qty + " ชุดในตะกร้า" : "ดูชุด";
        html +=
            '<button class="' +
            setBtnClass +
            '" data-action="detail" data-setsku="' +
            escHtml(p.sku) +
            '" data-sku="' +
            escHtml(p.sku) +
            '">' +
            escHtml(setBtnText) +
            "</button>";
    } else {
        html +=
            '<div class="b2f-cat-qty-wrap">' +
            '<button class="b2f-cat-qty-btn minus" data-sku="' +
            escHtml(p.sku) +
            '" data-action="minus">-</button>' +
            '<input type="number" class="b2f-cat-qty-val" data-sku="' +
            escHtml(p.sku) +
            '" value="' +
            qty +
            '" min="0" inputmode="numeric">' +
            '<button class="b2f-cat-qty-btn plus" data-sku="' +
            escHtml(p.sku) +
            '" data-action="plus">+</button>' +
            "</div>";
    }

    html += "</div></div>";
    return html;
}
