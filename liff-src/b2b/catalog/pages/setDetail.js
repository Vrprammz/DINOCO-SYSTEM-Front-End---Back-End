/**
 * B2B LIFF E-Catalog — SET Detail overlay (V.0.3 Round 2)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   - line 1191-1219 : renderSetDetailMainStepper (V.32.2 typable input)
 *   - line 1221-1224 : updateSetDetailAddBtn (compat shim)
 *   - line 1303-1463 : renderSetDetailItems (sub-items + grandchildren)
 *   - line 1467-1485 : buildB2bStepper (V.32.4 collapsed default)
 *
 * V.32.0 — SET Detail full-page overlay
 * V.32.2 — typable qty stepper (1-999, min/max clamp, Enter to add)
 * V.32.4 — sub-item collapsed default ("+ สั่งแยก" button reveals stepper)
 * V.32.6 — MOQ hint "ขั้นต่ำ N ชุด" when min_order_qty > 1
 *
 * Round 2 contract:
 *   Pure HTML-string builders. Caller installs event delegation in
 *   bootstrap (or via the inline bridge until Round 5 cut-over).
 */

import { escHtml, formatNumber } from "../utils/format.js";

/**
 * Build a quantity stepper widget.
 *
 * Mirrors inline `buildB2bStepper(sku, currentQty, collapsedDefault)`
 * V.32.9 line 1467-1485 verbatim.
 *
 * Behavior:
 *   - `collapsedDefault=true` + `currentQty===0` → returns a single
 *     "+ สั่งแยก" button. Tap reveals the full stepper (handled by
 *     event delegation in caller).
 *   - Otherwise returns the full `[− N + ] [+ เพิ่ม (in cart count)]`
 *     stepper. The "in-cart" CSS class is added to the add button when
 *     the SKU already has cart qty > 0.
 *
 * Always emits `data-stepsku="..."` + `data-stepact="minus|input|plus|add"`
 * so a single delegated listener on the parent container handles all
 * interactions.
 *
 * @param {string} sku
 * @param {number} currentQty - current cart qty for this SKU
 * @param {boolean} [collapsedDefault=false]
 * @returns {string}
 */
export function buildB2bStepper(sku, currentQty, collapsedDefault) {
    const safeSku = escHtml(sku);
    const inCart = typeof currentQty === "number" && currentQty > 0;
    if (collapsedDefault && !inCart) {
        return '<button type="button" class="b2b-cat-sub-add-btn" ' +
            'data-subaddsku="' + safeSku + '">+ สั่งแยก</button>';
    }
    const q = inCart ? currentQty : 1;
    return (
        '<div class="b2b-qty-stepper" data-stepsku="' + safeSku + '">' +
        '<div class="b2b-qty-stepper-group">' +
        '<button type="button" class="b2b-qty-stepper-btn" ' +
        'data-stepact="minus" aria-label="ลด">−</button>' +
        '<input type="number" class="b2b-qty-stepper-input" value="' + q +
        '" min="1" max="999" inputmode="numeric" data-stepact="input">' +
        '<button type="button" class="b2b-qty-stepper-btn" ' +
        'data-stepact="plus" aria-label="เพิ่ม">+</button>' +
        "</div>" +
        '<button type="button" class="b2b-qty-stepper-add' +
        (inCart ? " in-cart" : "") + '" data-stepact="add">' +
        (inCart ? "+เพิ่ม (" + currentQty + ")" : "+ เพิ่ม") +
        "</button>" +
        "</div>"
    );
}

/**
 * Render the main "+ ชุดเต็ม" stepper at the top of the SET Detail.
 *
 * Mirrors inline `renderSetDetailMainStepper(product)` V.32.9
 * line 1191-1219. Differs from `buildB2bStepper` in 3 ways:
 *   - When `stock_display === 'out_of_stock'` → returns a single
 *     disabled "สินค้าหมด" button (no stepper at all).
 *   - The add button label includes the cart qty: "+ ชุดเต็ม
 *     (ในตะกร้า N)" when in-cart.
 *   - Below the stepper, when min_order_qty/moq > 1, an MOQ hint
 *     "ขั้นต่ำ N ชุด" is appended (V.32.6 P1).
 *
 * V.32.2 preserve typed qty: caller passes the current input value as
 * `preserveTyped` so we keep the user's typed number across re-renders.
 *
 * @param {{
 *   sku: string,
 *   stock_display?: string,
 *   stock_status?: string,
 *   min_order_qty?: number,
 *   moq?: number,
 * }} product
 * @param {{ qtyInCart?: number, preserveTyped?: number }} [opts]
 * @returns {string}
 */
export function renderSetDetailMainStepper(product, opts) {
    /** @type {{
     *   sku?: string, stock_display?: string, stock_status?: string,
     *   min_order_qty?: number, moq?: number,
     * }} */
    const p = product || {};
    const sd = p.stock_display || p.stock_status || "in_stock";
    if (sd === "out_of_stock") {
        return (
            '<button disabled style="min-height:48px;padding:0 20px;' +
            "border:none;border-radius:10px;background:#cbd5e1;color:#fff;" +
            'font-size:14px;font-weight:700;cursor:not-allowed;' +
            'opacity:0.6;">สินค้าหมด</button>'
        );
    }
    const o = opts || {};
    const qtyInCart = Math.max(0, parseInt(String(o.qtyInCart || 0), 10) || 0);
    const typedRaw = parseInt(String(o.preserveTyped || ""), 10);
    const preserveTyped = Math.max(
        1,
        Math.min(999, Number.isFinite(typedRaw) ? typedRaw : 1)
    );
    const safeSku = escHtml(p.sku || "");
    const inCart = qtyInCart > 0;
    const moq = Math.max(
        1,
        parseInt(String(p.min_order_qty || p.moq || 1), 10) || 1
    );
    const moqHtml = moq > 1
        ? '<div class="b2b-cat-moq-hint" role="note">ขั้นต่ำ ' + moq +
          " ชุด</div>"
        : "";
    return (
        '<div class="b2b-qty-stepper" data-stepsku="' + safeSku +
        '" data-setmain="1">' +
        '<div class="b2b-qty-stepper-group">' +
        '<button type="button" class="b2b-qty-stepper-btn" ' +
        'data-stepact="minus" aria-label="ลด">−</button>' +
        '<input type="number" class="b2b-qty-stepper-input" value="' +
        preserveTyped +
        '" min="1" max="999" inputmode="numeric" data-stepact="input">' +
        '<button type="button" class="b2b-qty-stepper-btn" ' +
        'data-stepact="plus" aria-label="เพิ่ม">+</button>' +
        "</div>" +
        '<button type="button" class="b2b-qty-stepper-add' +
        (inCart ? " in-cart" : "") + '" data-stepact="add" ' +
        'style="background:' + (inCart ? "#10b981" : "#1e293b") + ';">' +
        (inCart ? "+ ชุดเต็ม (ในตะกร้า " + qtyInCart + ")" : "+ ชุดเต็ม") +
        "</button>" +
        "</div>" +
        moqHtml
    );
}

/**
 * Compute whether the main "+ ชุดเต็ม" add button should be enabled.
 *
 * Mirrors `updateSetDetailAddBtn` V.32.9 line 1221-1224 — currently
 * inline just delegates to renderSetDetailMainStepper, but exposing a
 * pure boolean predicate makes Round 3 + 4 button-state tests trivial.
 *
 * @param {{ stock_display?: string, stock_status?: string }} product
 * @returns {boolean}
 */
export function updateSetDetailAddBtn(product) {
    const sd = (product && (product.stock_display || product.stock_status)) ||
        "in_stock";
    return sd !== "out_of_stock";
}

/**
 * Render a single grandchild row inside a SET Detail child block.
 *
 * Mirrors inline V.32.9 line 1362-1391 verbatim.
 *
 * @param {object} gc - grandchild
 * @param {{ qty: number }} ctx
 * @returns {string}
 */
function renderGrandchild(gc, ctx) {
    const gcOOS = (gc && (gc.stock_display || "in_stock")) === "out_of_stock";
    const gcQty = (ctx && ctx.qty) || 0;

    let h = '<div class="b2b-cat-set-gc-item' + (gcOOS ? " oos" : "") + '"' +
        (gcOOS ? ' style="opacity:0.55;filter:grayscale(0.4);"' : "") + ">";

    if (gc.img) {
        h += '<img class="b2b-cat-set-gc-img" src="' + escHtml(gc.img) +
            '" alt="" loading="lazy">';
    } else {
        h += '<div class="b2b-cat-set-gc-img" ' +
            'style="display:flex;align-items:center;justify-content:center;' +
            'font-size:14px;color:#ccc;">📦</div>';
    }

    h += '<div class="b2b-cat-set-gc-info">' +
        '<div class="b2b-cat-set-gc-name">' + escHtml(gc.name) + "</div>";

    if (gcOOS) {
        h += '<div class="b2b-cat-set-gc-oos">สินค้าหมด</div>';
        if (gc.stock_eta) {
            const ep = String(gc.stock_eta).split("-");
            const ef = ep.length === 3
                ? ep[2] + "/" + ep[1] + "/" + ep[0]
                : "";
            h += '<div class="b2b-cat-set-gc-eta">คาดว่ามีของ ' +
                escHtml(ef) + "</div>";
        }
    } else {
        h += '<div class="b2b-cat-set-gc-price">฿' +
            formatNumber(gc.dealer_price) + "</div>";
    }
    h += "</div>"; // /info

    if (!gcOOS) {
        h += buildB2bStepper(gc.sku, gcQty, true);
    }

    h += "</div>";
    return h;
}

/**
 * Render a single child row + its grandchildren.
 *
 * Mirrors inline V.32.9 line 1312-1396.
 *
 * @param {object} child
 * @param {{ cart: object }} ctx
 * @returns {string}
 */
function renderChildRow(child, ctx) {
    const cart = (ctx && ctx.cart) || {};
    const chOOS = (child.stock_display || "in_stock") === "out_of_stock";
    const chQty = cart[child.sku] || 0;

    let row = '<div class="b2b-cat-set-child' + (chOOS ? " oos" : "") + '">';
    row += '<div class="b2b-cat-set-child-row">';

    // Image
    if (child.img) {
        row += '<img class="b2b-cat-set-child-img" src="' + escHtml(child.img) +
            '" alt="" loading="lazy">';
    } else {
        row += '<div class="b2b-cat-set-child-img" ' +
            'style="display:flex;align-items:center;justify-content:center;' +
            'font-size:20px;color:#ccc;">📦</div>';
    }

    // Info
    row += '<div class="b2b-cat-set-child-info">' +
        '<div class="b2b-cat-set-child-name">' + escHtml(child.name) + "</div>" +
        '<div class="b2b-cat-set-child-sku">' + escHtml(child.sku) + "</div>";
    if (chOOS) {
        row += '<div class="b2b-cat-set-child-oos">สินค้าหมด</div>';
        if (child.stock_eta) {
            const ep = String(child.stock_eta).split("-");
            const ef = ep.length === 3
                ? ep[2] + "/" + ep[1] + "/" + ep[0]
                : "";
            row += '<div class="b2b-cat-set-child-eta">คาดว่ามีของ ' +
                escHtml(ef) + "</div>";
        }
    } else {
        if (child.price > child.dealer_price) {
            row += '<span class="b2b-cat-set-child-retail">฿' +
                formatNumber(child.price) + "</span>";
        }
        row += '<span class="b2b-cat-set-child-price">฿' +
            formatNumber(child.dealer_price) + "</span>";
    }
    row += "</div>"; // /info

    // Stepper (V.32.4 collapsed-default)
    if (!chOOS) {
        row += buildB2bStepper(child.sku, chQty, true);
    }

    row += "</div>"; // /child-row

    // Grandchildren section
    const gcs = child.grandchildren || [];
    if (gcs.length) {
        row += '<div class="b2b-cat-set-gc">';
        row += '<div class="b2b-cat-set-gc-label">ซื้อแยกชิ้น</div>';
        gcs.forEach((gc) => {
            row += renderGrandchild(gc, { qty: cart[gc.sku] || 0 });
        });
        row += "</div>";
    }

    row += "</div>"; // /child
    return row;
}

/**
 * Render the full SET Detail items list (children + grandchildren).
 *
 * Mirrors inline `renderSetDetailItems(product)` V.32.9 line 1303-1463.
 *
 * @param {{ children_detail?: Array<object> }} product
 * @param {{ cart: object }} [opts]
 * @returns {string}
 */
export function renderSetDetailItems(product, opts) {
    const p = product || {};
    const cart = (opts && opts.cart) || {};
    const details = p.children_detail || [];
    if (!details.length) {
        return '<div style="text-align:center;padding:20px;color:#999;' +
            'font-size:13px;">ไม่มีรายการสินค้าย่อย</div>';
    }
    return details.map((c) => renderChildRow(c, { cart })).join("");
}
