/**
 * B2B LIFF E-Catalog — Cart UI renderers (V.0.3 Round 2)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   - line 1577-1584 : updateCartBar (count + total + visibility)
 *   - line 1594-1658 : showCartModal (modal items list — V.32.3 thumbnails
 *                      + V.32.4 remove btn + V.32.6 P3 empty state)
 *   - line 1706-1724 : renderRecommendedChips (frequent SKUs)
 *
 * Round 2 contract:
 *   Pure HTML-string builders. The DOM mutations + event delegation in
 *   inline V.32.9 stay live until Round 5; Round 2 adds parallel testable
 *   helpers that compute the same outputs without touching DOM.
 *
 * REG-029 byte-identical preservation:
 *   - Cart count + total dual-update pattern (inline writes both
 *     #cartCount and #cartTotal — these helpers return both values)
 *   - V.32.3 modal item thumbnails 56×56 with `onerror` fallback to
 *     📦 placeholder (inline-styled — preserved verbatim)
 *   - V.32.4 🗑️ red remove button per modal item
 *   - V.32.6 P3 empty state ("ตะกร้าว่างแล้ว" + back-to-catalog hint)
 *   - "ส่งรายการแก้ไข" vs "สั่งซื้อ" submit label per editMode
 */

import { escHtml, formatNumber } from "../utils/format.js";

/**
 * Compute cart bar state — count, total, visibility, submit label.
 *
 * Mirrors inline `updateCartBar()` V.32.9 line 1577-1584.
 *
 * @param {{ cart?: object, products?: Array<object>, activeTab?: string,
 *           editMode?: boolean }} state
 * @returns {{ count: number, total: number, visible: boolean,
 *             submitLabel: string }}
 */
export function updateCartBar(state) {
    const cart = (state && state.cart) || {};
    const products = (state && state.products) || [];
    const activeTab = (state && state.activeTab) || "catalog";
    const editMode = !!(state && state.editMode);

    let count = 0;
    let total = 0;
    Object.keys(cart).forEach((sku) => {
        const q = cart[sku];
        if (!q) return;
        count += q;
        const p = products.find((x) => x && x.sku === sku);
        if (p) total += (p.dealer_price || 0) * q;
    });

    return {
        count,
        total,
        visible: count > 0 && activeTab === "catalog",
        submitLabel: editMode ? "ส่งรายการแก้ไข" : "สั่งซื้อ",
    };
}

/**
 * Build a single cart-modal item row.
 *
 * Mirrors inline V.32.9 line 1606-1620.
 *
 * @param {{ sku: string, name: string, qty: number, price: number }} item
 * @param {{ products?: Array<object> }} ctx
 * @returns {string}
 */
export function renderCartModalItem(item, ctx) {
    /** @type {{ sku?: string, name?: string, qty?: number, price?: number }} */
    const i = item || {};
    const products = (ctx && ctx.products) || [];
    const lineTotal = (i.price || 0) * (i.qty || 0);
    const prod = products.find((x) => x && x.sku === i.sku);
    const imgUrl = prod && prod.img ? prod.img : "";
    const safeName = escHtml(i.name);
    const safeSku = escHtml(i.sku);
    const thumb = imgUrl
        ? '<img class="b2b-cat-modal-item-thumb" src="' + escHtml(imgUrl) +
          '" alt="' + safeName +
          '" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;' +
          'b2b-cat-modal-item-thumb placeholder&quot;>&#128230;</div>\'">'
        : '<div class="b2b-cat-modal-item-thumb placeholder">' +
          "&#128230;</div>";
    return (
        '<div class="b2b-cat-modal-item">' + thumb +
        '<div class="b2b-cat-modal-item-info">' +
        '<div class="b2b-cat-modal-item-name">' + safeName + "</div>" +
        '<div class="b2b-cat-modal-item-detail">' + safeSku + " x " + i.qty +
        " @ ฿" + formatNumber(i.price) + "</div></div>" +
        '<div class="b2b-cat-modal-item-total">฿' +
        formatNumber(lineTotal) + "</div>" +
        '<button type="button" class="b2b-cart-remove-btn" data-rmsku="' +
        safeSku + '" aria-label="ลบรายการ" title="ลบ">' +
        '<span aria-hidden="true">🗑️</span>' +
        '<span class="sr-only">ลบ</span></button>' +
        "</div>"
    );
}

/**
 * Render the empty cart placeholder (V.32.6 P3).
 *
 * Mirrors inline V.32.9 line 1597-1599.
 *
 * @returns {string}
 */
export function renderCartEmptyState() {
    return (
        '<div class="b2b-cart-empty">' +
        '<div class="icon" aria-hidden="true">🛒</div>' +
        '<div class="msg">ตะกร้าว่างแล้ว</div>' +
        '<div class="sub">กลับไปเลือกสินค้าจากแคตตาล็อก</div>' +
        "</div>"
    );
}

/**
 * Render the note input section appended at the bottom of the modal.
 *
 * Mirrors inline V.32.9 line 1621-1622.
 *
 * @returns {string}
 */
export function renderCartNoteSection() {
    return (
        '<div class="b2b-cat-note-section">' +
        '<div class="b2b-cat-note-label">หมายเหตุ (ถ้ามี)</div>' +
        '<textarea class="b2b-cat-note-input" id="cartNoteInput" ' +
        'maxlength="300" placeholder="เช่น ส่งด่วน, แพ็คแยก..."></textarea>' +
        "</div>"
    );
}

/**
 * Render the full cart modal body — items list + note section, OR
 * empty state when items is empty.
 *
 * Mirrors inline `showCartModal()` body construction V.32.9 line 1594-1623.
 *
 * @param {Array<object>} items - cart items
 * @param {{ products?: Array<object>, editMode?: boolean }} [ctx]
 * @returns {{ html: string, total: number, isEmpty: boolean,
 *             confirmLabel: string, confirmDisabled: boolean,
 *             confirmDisabledReason: string, editMode: boolean }}
 *
 * V.0.6 (2026-05-18) P0.8 — return `confirmDisabledReason` for tooltip
 * accessibility + `editMode` so caller can render edit-mode badge. Previously
 * disabled submit button had no aria-label explaining why → users guessed.
 */
export function renderCartItems(items, ctx) {
    const list = items || [];
    const editMode = !!(ctx && ctx.editMode);
    if (!list.length) {
        return {
            html: renderCartEmptyState(),
            total: 0,
            isEmpty: true,
            confirmLabel: "กลับไปเลือกสินค้า",
            confirmDisabled: true,
            confirmDisabledReason: "ตะกร้าว่าง — เพิ่มสินค้าเพื่อสั่งซื้อ",
            editMode,
        };
    }
    let total = 0;
    let html = "";
    list.forEach((it) => {
        total += (it.price || 0) * (it.qty || 0);
        html += renderCartModalItem(it, ctx || {});
    });
    html += renderCartNoteSection();
    return {
        html,
        total,
        isEmpty: false,
        confirmLabel: editMode ? "ยืนยันแก้ไข" : "ยืนยันสั่งสินค้า",
        confirmDisabled: false,
        confirmDisabledReason: "",
        editMode,
    };
}

/**
 * Render frequent / recommended SKU chips on the home page.
 *
 * Mirrors inline `renderRecommendedChips()` V.32.9 line 1706-1724.
 * Caps at 6 visible chips.
 *
 * @param {Array<string>} recommendedSkus
 * @param {Array<object>} products
 * @returns {{ html: string, visible: boolean, count: number }}
 */
export function renderRecommendedChips(recommendedSkus, products) {
    const recs = recommendedSkus || [];
    const prods = products || [];
    if (!recs.length || !prods.length) {
        return { html: "", visible: false, count: 0 };
    }
    let html = "";
    let shown = 0;
    for (let i = 0; i < recs.length && shown < 6; i++) {
        const sku = recs[i];
        const upper = String(sku || "").toUpperCase();
        const p = prods.find(
            (x) => x && String(x.sku).toUpperCase() === upper
        );
        if (!p) continue;
        shown++;
        const display = p.name && p.name.length > 16
            ? p.name.substr(0, 16) + "..."
            : (p.name || "");
        html +=
            '<div class="b2b-cat-freq-chip" data-action="add-recommended" ' +
            'data-sku="' + escHtml(p.sku) + '">' +
            '<span class="b2b-cat-freq-name">' + escHtml(display) + "</span>" +
            '<span class="b2b-cat-freq-add">+</span>' +
            "</div>";
    }
    return { html, visible: shown > 0, count: shown };
}
