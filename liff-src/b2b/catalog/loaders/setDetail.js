/**
 * B2B LIFF E-Catalog — SET Detail loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   - line 1159-1188 : openSetDetail (header populate + history.pushState)
 *   - line 1191-1219 : renderSetDetailMainStepper (V.32.2 typable input)
 *   - line 1226-1234 : closeSetDetail
 *   - line 1237-1294 : main stepper click handler (delegated)
 *   - line 1303-1463 : renderSetDetailItems (sub-items + grandchildren)
 *
 * Behavioral parity:
 *   - "+ ชุดเต็ม" button delegates through handleAddSet which respects
 *     V.32.1 H-10 duplicate detection (cannot add SET when child is in cart).
 *   - Sub-items "+ สั่งแยก" → reveal stepper + add as standalone child.
 *   - Stepper input clamped to 1-999 (V.32.2 P3).
 *   - history.pushState called by router.openSetDetail() upstream — this
 *     loader assumes the URL is already on `#detail-<sku>`.
 */

import { showToast, showAuthError } from "../utils/dom.js";
import {
    setCartQty,
    incrCartQty,
    saveCart,
    detectCartDuplicates,
} from "../utils/cart.js";
import {
    renderSetDetailMainStepper,
    renderSetDetailItems,
} from "../pages/setDetail.js";
import { updateCartBar } from "../pages/cart.js";

let _state = null;
let _onClose = null;
let _onCartChanged = null;
let _currentProduct = null;

/**
 * @param {{
 *   state: object,
 *   onClose?: () => void,
 *   onCartChanged?: () => void,
 * }} deps
 */
export function setupSetDetail(deps) {
    if (!deps || !deps.state) {
        throw new Error("setupSetDetail: deps.state required");
    }
    _state = deps.state;
    _onClose = deps.onClose || null;
    _onCartChanged = deps.onCartChanged || null;
}

/**
 * Open the SET Detail overlay for a SKU. The product object can be
 * passed by the router (cached from product list) — if absent, we look
 * it up from `_state.products`.
 *
 * @param {string} sku
 * @param {object} [productHint]
 * @returns {Promise<void>}
 */
export async function loadSetDetail(sku, productHint) {
    if (!_state || !sku) return;
    const products = _state.products || [];
    const product =
        productHint ||
        products.find((p) => p && p.sku === sku);
    if (!product) {
        showAuthError(
            "ไม่พบสินค้า",
            "กรุณาปิดแล้วเปิดลิงก์ใหม่",
            false
        );
        return;
    }
    _currentProduct = product;
    _renderInto(product);
}

/**
 * Re-render the overlay (after cart mutations).
 *
 * @returns {void}
 */
export function rerender() {
    if (_currentProduct) _renderInto(_currentProduct);
}

/**
 * Close hook — clears cached product. Router fires the URL change.
 *
 * @returns {void}
 */
export function handleClose() {
    _currentProduct = null;
    if (typeof _onClose === "function") _onClose();
}

/**
 * Stepper handler — main "+ ชุดเต็ม" button. Reads the typed input,
 * clamps 1-999, validates duplicate, writes cart + persists.
 *
 * @param {string} sku
 * @param {number} qty - clamped 1-999 by caller (event handler)
 * @returns {boolean}
 */
export function handleAddSet(sku, qty) {
    if (!_state || !sku) return false;
    const n = Math.max(1, Math.min(999, parseInt(String(qty), 10) || 1));
    const cart = _state.cart || {};
    const probe = setCartQty(cart, sku, (cart[sku] || 0) + n);
    const dupes = detectCartDuplicates(probe, _state.products || []);
    if (dupes.length > 0) {
        showToast("ลบลูก แล้วเพิ่มชุดเต็ม?");
        return false;
    }
    _state.cart = setCartQty(cart, sku, (cart[sku] || 0) + n);
    saveCart(_state.cart);
    if (typeof navigator !== "undefined" && navigator.vibrate) {
        try { navigator.vibrate(20); } catch { /* swallow */ }
    }
    rerender();
    _refreshCartBar();
    if (typeof _onCartChanged === "function") _onCartChanged();
    return true;
}

/**
 * Stepper handler — sub-item "+ สั่งแยก" / `+` / `-` buttons.
 *
 * @param {string} sku
 * @param {number} delta
 * @returns {void}
 */
export function handleSubItemStep(sku, delta) {
    if (!_state || !sku) return;
    const d = parseInt(String(delta), 10) || 0;
    if (!d) return;
    _state.cart = incrCartQty(_state.cart || {}, sku, d);
    saveCart(_state.cart);
    rerender();
    _refreshCartBar();
    if (typeof _onCartChanged === "function") _onCartChanged();
}

function _renderInto(product) {
    if (typeof document === "undefined" || !_state) return;
    const root = document.getElementById("b2b-catalog-app");
    if (!root) return;
    const cart = _state.cart || {};
    const qtyInCart = cart[product.sku] || 0;
    const main = renderSetDetailMainStepper(product, {
        qtyInCart,
        preserveTyped: 1,
    });
    const items = renderSetDetailItems(product, { cart });
    root.innerHTML =
        '<div class="b2b-cat-set-detail" data-sku="' +
        encodeURIComponent(product.sku) + '">' +
        '<div id="setDetailAddWrap">' + main + '</div>' +
        '<div id="setDetailItems">' + items + '</div>' +
        '</div>';
}

function _refreshCartBar() {
    if (typeof document === "undefined" || !_state) return;
    const projected = updateCartBar({
        cart: _state.cart || {},
        products: _state.products || [],
        activeTab: "catalog",
    });
    const cnt = document.getElementById("cartCount");
    if (cnt) cnt.textContent = String(projected.count);
    const tot = document.getElementById("cartTotal");
    if (tot) tot.textContent = "฿" + projected.total.toLocaleString();
    const bar = document.getElementById("cartBar");
    if (bar) bar.style.display = projected.visible ? "" : "none";
}

/**
 * Test-only — reset module state.
 */
export function _resetSetDetailLoader() {
    _state = null;
    _onClose = null;
    _onCartChanged = null;
    _currentProduct = null;
}
