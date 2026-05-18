/**
 * B2B LIFF E-Catalog — Cart modal + submit-order loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   - line 1577-1593 : updateCartBar (count + total + visibility)
 *   - line 1594-1658 : showCartModal body construction
 *   - line 1668-1700 : submitOrder — POST /place-order + Flex confirm
 *
 * Behavioral parity:
 *   - submitOrder builds an items array via toOrderItems() then POSTs
 *     to /b2b/v1/place-order. Response carries the new ticket_id which
 *     is sent to LINE (closeWindow) on success.
 *   - editMode (V.32.5 — distributor self-edit) routes through
 *     api.modifyOrder instead of placeOrder.
 *   - On 409 conflict, shows the per-code Thai message (api wrapper
 *     decorates the error code already).
 *   - localStorage cart is cleared on success (matches inline V.32.9).
 */

import {
    showToast,
    showLoading,
    hideLoading,
    lockBtn,
    unlockBtn,
    $,
} from "../utils/dom.js";
import {
    saveCart,
    clearCart,
    toOrderItems,
    computeItemCount,
    computeTotal,
} from "../utils/cart.js";
import {
    renderCartItems,
    updateCartBar,
} from "../pages/cart.js";

/**
 * @param {unknown} err
 * @returns {string}
 */
function _msg(err) {
    if (err && typeof err === "object" && "message" in err) {
        const m = /** @type {{message?: unknown}} */ (err).message;
        if (typeof m === "string") return m;
    }
    return "";
}

let _api = null;
let _state = null;
let _liff = null;
let _onSuccess = null;

/**
 * @param {{
 *   api: { placeOrder: Function, modifyOrder?: Function },
 *   state: object,
 *   liff?: { closeWindow?: () => void },
 *   onSuccess?: (orderId: string|number) => void,
 * }} deps
 */
export function setupCart(deps) {
    if (!deps || !deps.api || !deps.state) {
        throw new Error("setupCart: deps.api + deps.state required");
    }
    _api = deps.api;
    _state = deps.state;
    _liff = deps.liff || null;
    _onSuccess = deps.onSuccess || null;
}

/**
 * Open the cart modal — populates items list + bottom submit button.
 *
 * @returns {void}
 */
export function loadCartModal() {
    if (!_state) return;
    if (typeof document === "undefined") return;
    const products = _state.products || [];
    const items = toOrderItems(_state.cart || {}, products);
    const result = renderCartItems(items, {
        products,
        editMode: !!_state.editMode,
    });
    const root =
        document.getElementById("cartModalBody") ||
        document.getElementById("b2b-catalog-app");
    if (!root) return;
    root.innerHTML = result.html;

    const totalEl = document.getElementById("cartModalTotal");
    if (totalEl) {
        totalEl.textContent = "฿" + result.total.toLocaleString();
    }
    const submitBtn = /** @type {HTMLButtonElement|null} */ (
        document.getElementById("cartConfirmBtn")
    );
    if (submitBtn) {
        submitBtn.textContent = result.confirmLabel;
        submitBtn.disabled = !!result.confirmDisabled;
        // V.0.6 P0.8 — surface disabled reason via aria-label + title tooltip.
        // Previously disabled button had no explanation → user confused.
        if (result.confirmDisabled && result.confirmDisabledReason) {
            submitBtn.setAttribute("aria-label", result.confirmDisabledReason);
            submitBtn.setAttribute("title", result.confirmDisabledReason);
        } else {
            submitBtn.removeAttribute("aria-label");
            submitBtn.removeAttribute("title");
        }
    }

    // V.0.6 P0.8 — edit-mode badge: visually indicate user is modifying an
    // existing order vs creating new. Previously silent → users didn't realize.
    if (result.editMode) {
        const cartHeader = document.querySelector(".cart-modal-header, #cartModalHeader");
        if (cartHeader && !cartHeader.querySelector("[data-role=edit-mode-badge]")) {
            const badge = document.createElement("span");
            badge.setAttribute("data-role", "edit-mode-badge");
            badge.textContent = "✏️ กำลังแก้ไข";
            badge.style.cssText =
                "display:inline-block;margin-left:8px;padding:2px 8px;background:#fef3c7;color:#b45309;border-radius:10px;font-size:11px;font-weight:600;vertical-align:middle";
            cartHeader.appendChild(badge);
        }
    } else {
        // Remove badge if exists (cart re-opened without editMode)
        const existingBadge = document.querySelector("[data-role=edit-mode-badge]");
        if (existingBadge && existingBadge.parentNode) {
            existingBadge.parentNode.removeChild(existingBadge);
        }
    }
}

/**
 * Submit the cart → /place-order (or /modify-order in editMode).
 *
 * @returns {Promise<void>}
 */
export async function handleSubmitOrder() {
    if (!_api || !_state) return;
    const products = _state.products || [];
    const cart = _state.cart || {};
    if (computeItemCount(cart) <= 0) {
        showToast("ยังไม่มีสินค้าในตะกร้า");
        return;
    }
    const items = toOrderItems(cart, products);
    if (!items.length) {
        showToast("ไม่สามารถสร้างคำสั่งซื้อได้");
        return;
    }

    const note = _readCartNote();
    const btn = /** @type {HTMLButtonElement|null} */ (
        $("#cartConfirmBtn")
    );
    if (!btn || !lockBtn(btn, "กำลังส่ง...")) {
        // Already locked — bail silently to avoid double-submit (matches
        // inline V.32.9 lock-fail UX).
        return;
    }
    showLoading();

    try {
        const editMode = !!_state.editMode;
        const editTicket = parseInt(String(_state.editTicket || 0), 10) || 0;
        let res;
        if (editMode && editTicket && typeof _api.modifyOrder === "function") {
            res = await _api.modifyOrder(editTicket, {
                items,
                note,
                source: "liff",
            });
        } else {
            const payload = {
                gid: _state.gid || "",
                items,
                note,
                source: "liff",
            };
            if (editTicket) payload.edit_ticket = editTicket;
            res = await _api.placeOrder(payload);
        }
        const orderId = (res && (res.order_id || res.ticket_id || res.id)) || "";
        // Clear cart on success
        _state.cart = clearCart();
        saveCart(_state.cart);
        showToast(
            _state.editMode ? "ส่งคำขอแก้ไขเรียบร้อย" : "สั่งซื้อเรียบร้อย"
        );
        if (typeof _onSuccess === "function") _onSuccess(orderId);
        // Close LIFF window like inline V.32.9 (so user lands back in
        // chat with the Flex confirmation card pushed by Snippet 1).
        if (_liff && typeof _liff.closeWindow === "function") {
            try { _liff.closeWindow(); } catch { /* swallow */ }
        }
    } catch (err) {
        showToast(_msg(err) || "สั่งซื้อไม่สำเร็จ");
        unlockBtn(btn);
    } finally {
        hideLoading();
        // unlockBtn already called above on error path — defensive on
        // success too in case LIFF didn't close (web preview).
        if (btn && btn.disabled) unlockBtn(btn);
    }
}

/**
 * Remove an item from the cart (🗑️ icon click).
 *
 * @param {string} sku
 * @returns {void}
 */
export function handleCartItemRemove(sku) {
    if (!_state || !sku) return;
    const next = Object.assign({}, _state.cart || {});
    delete next[sku];
    _state.cart = next;
    saveCart(_state.cart);
    loadCartModal();
    _refreshCartBar();
}

function _readCartNote() {
    if (typeof document === "undefined") return "";
    const el = /** @type {HTMLTextAreaElement|null} */ (
        document.getElementById("cartNoteInput")
    );
    if (!el) return "";
    const v = (el.value || "").trim();
    return v.slice(0, 300);
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
 * Compute & expose totals for unit tests + external bridges.
 *
 * @returns {{ count: number, total: number }}
 */
export function getCartTotals() {
    if (!_state) return { count: 0, total: 0 };
    return {
        count: computeItemCount(_state.cart || {}),
        total: computeTotal(_state.cart || {}, _state.products || []),
    };
}

/**
 * Test-only — reset module state.
 */
export function _resetCartLoader() {
    _api = null;
    _state = null;
    _liff = null;
    _onSuccess = null;
}
