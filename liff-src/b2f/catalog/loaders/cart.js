/**
 * B2F Admin LIFF E-Catalog — Cart + Submit-PO loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.15
 *   - line 3115-3170: submitOrder(force) — POST /create-po
 *   - line 1322:      loadCartFromStorage()
 *   - line 2798:      cart total computation
 *
 * Round 3 contract:
 *   `setupCart({ api, state })` once at bootstrap;
 *   `loadCartView()` renders cart sheet + manufacturing summary;
 *   `loadReviewGate()` renders the V.7.11 a11y review gate;
 *   `handleSubmitOrder({ force })` POSTs /create-po with idempotency key
 *   + clears cart on success + transitions to success screen.
 */

import {
    showToast,
    showLoading,
    hideLoading,
    lockBtn,
    unlockBtn,
} from "../utils/dom.js";
import { escHtml } from "../utils/format.js";
import { clearCart } from "../utils/cart.js";
import { renderCartItems, renderCartManufacturingSummary } from "../pages/cart.js";
import { renderReviewGate } from "../pages/reviewGate.js";

/** @type {any} */
let _api = null;
/** @type {any} */
let _state = null;
/** @type {((poNumber: string, poId: string|number, warnings?: string[]) => void)|null} */
let _onSuccess = null;

/**
 * @param {{
 *   api: object,
 *   state: object,
 *   onSuccess?: (poNumber: string, poId: string|number, warnings?: string[]) => void
 * }} deps
 */
export function setupCart(deps) {
    if (!deps || !deps.api || !deps.state) {
        throw new Error("setupCart: api + state required");
    }
    _api = deps.api;
    _state = /** @type {any} */ (deps.state);
    _onSuccess = typeof deps.onSuccess === "function" ? deps.onSuccess : null;
}

/**
 * Render the cart sheet view.
 */
export function loadCartView() {
    if (!_state) return;
    const mount = (typeof document !== "undefined")
        ? document.getElementById("b2f-catalog-app")
        : null;
    if (!mount) return;
    const cart = _state.cart || {};
    const products = _state.products || [];
    const skuRelations = _state.skuRelations || {};
    const catalogMap = _state.catalogMap || {};
    const currency = _state.currency || "THB";
    const isReview = _state.currentView === "review";

    let body;
    if (isReview) {
        const reviewResult = renderReviewGate(cart, {
            currency: currency,
            maker: { id: _state.makerId, name: _state.makerName || "" },
        });
        body = (reviewResult && reviewResult.html) || "";
    } else {
        const cartResult = renderCartItems(cart, {
            currency: currency,
            orderIntentEnabled: !!_state.orderIntentEnabled,
            products: products,
            catalogMap: catalogMap,
            skuRelations: skuRelations,
            hierarchyMeta: _state.hierarchyMeta || {},
        });
        body =
            ((cartResult && cartResult.html) || "") +
            renderCartManufacturingSummary(cart, skuRelations);
    }

    const isForeign = currency !== "THB";
    const foreignFields = isForeign
        ? '<div class="b2f-cart-foreign">' +
          '<label>อัตราแลกเปลี่ยน <input type="number" step="0.0001" id="b2fExchangeRate" data-field="exchange_rate" value="' +
          escHtml(String(_state.exchangeRate || "")) + '"></label>' +
          '<label>วิธีส่ง <select id="b2fShippingMethod" data-field="shipping_method"><option value="">เลือก</option><option value="land">ทางบก</option><option value="sea">ทางทะเล</option></select></label>' +
          "</div>"
        : '<div class="b2f-cart-foreign-thb"><label>วิธีส่ง <select id="b2fShippingMethod" data-field="shipping_method"><option value="">— ในประเทศ —</option><option value="land">ทางบก</option></select></label></div>';

    const noteField =
        '<label class="b2f-cart-note"><span>หมายเหตุ</span>' +
        '<textarea id="b2fCartNote" data-field="note" rows="2" maxlength="500" placeholder="ระบุข้อความถึงโรงงาน (ไม่บังคับ)"></textarea>' +
        "</label>";

    const submitLabel = isReview ? "ยืนยันสั่ง PO" : "ตรวจสอบรายการก่อนส่ง";
    const submitAction = isReview ? "submit" : "review";

    mount.innerHTML =
        '<div class="b2f-cart-sheet">' +
        '<div class="b2f-cart-header"><button type="button" class="b2f-back-btn" data-action="back">← กลับ</button>' +
        '<h2>' + (isReview ? "ตรวจสอบรายการ" : "ตะกร้า") + "</h2></div>" +
        body +
        foreignFields +
        noteField +
        '<div class="b2f-cart-actions">' +
        '<button type="button" class="b2f-cart-submit" data-action="' + submitAction + '">' + submitLabel + "</button>" +
        "</div>" +
        "</div>";
}

/**
 * Submit /create-po with idempotency. On success → success screen + clear cart.
 *
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<void>}
 */
export async function handleSubmitOrder(opts) {
    if (!_api || !_state) return;
    const force = !!(opts && opts.force);
    const cart = _state.cart || {};
    const items = Object.keys(cart).map(function (sku) {
        const c = cart[sku];
        const entry = { sku: c.sku, qty: c.qty };
        if (_state.orderIntentEnabled) {
            /** @type {any} */ (entry).order_mode = c.order_mode || "single_leaf";
            /** @type {any} */ (entry).source_sku = c.source_sku || c.sku;
            if (c.intent_notes) {
                /** @type {any} */ (entry).intent_notes = String(c.intent_notes).substring(0, 200);
            }
        }
        return entry;
    });
    if (!items.length) {
        showToast("ตะกร้าว่าง", "error");
        return;
    }
    if (!_state.makerId) {
        showToast("กรุณาเลือกโรงงาน", "error");
        return;
    }

    const isForeign = (_state.currency || "THB") !== "THB";
    const noteEl = (typeof document !== "undefined") ? document.getElementById("b2fCartNote") : null;
    const note = (noteEl && /** @type {HTMLTextAreaElement} */ (noteEl).value || "").trim();
    const shipMethodEl = (typeof document !== "undefined") ? document.getElementById("b2fShippingMethod") : null;
    const shipMethod = (shipMethodEl && /** @type {HTMLSelectElement} */ (shipMethodEl).value) || "";
    let exchangeRate = 0;
    if (isForeign) {
        const rateEl = (typeof document !== "undefined") ? document.getElementById("b2fExchangeRate") : null;
        exchangeRate = parseFloat((rateEl && /** @type {HTMLInputElement} */ (rateEl).value) || "0");
        if (!exchangeRate || exchangeRate <= 0) {
            showToast("กรุณากรอกอัตราแลกเปลี่ยน", "error");
            return;
        }
        if (!shipMethod) {
            showToast("กรุณาเลือกวิธีส่ง", "error");
            return;
        }
    }

    /** @type {any} */
    const body = {
        maker_id: parseInt(String(_state.makerId), 10),
        items: items,
        note: note,
    };
    if (force) body.force = true;
    if (isForeign) {
        body.exchange_rate = exchangeRate;
        body.shipping_method = shipMethod;
    } else if (shipMethod) {
        body.shipping_method = shipMethod;
    }

    const submitBtn = (typeof document !== "undefined")
        ? /** @type {HTMLButtonElement|null} */ (document.querySelector(".b2f-cart-submit"))
        : null;
    if (submitBtn) lockBtn(submitBtn, "กำลังสร้าง PO...");
    showLoading();
    try {
        const res = await _api.createPO(body);
        hideLoading();
        if (res && res.success) {
            try { clearCart(_state.makerId); } catch (_e) { /* ignore */ }
            _state.cart = {};
            _state.lastPO = {
                number: res.po_number || "",
                id: res.po_id || "",
                warnings: res.warnings || [],
            };
            if (_onSuccess) _onSuccess(res.po_number || "", res.po_id || "", res.warnings || []);
            showToast("สร้าง PO สำเร็จ!", "success");
        } else if (res && res.code === "DUPLICATE_PO") {
            showToast(
                (res.error || "PO ซ้ำ") +
                (res.existing_po ? " (" + res.existing_po + ")" : ""),
                "error"
            );
        } else {
            showToast((res && res.error) || "เกิดข้อผิดพลาด", "error");
        }
    } catch (err) {
        hideLoading();
        const e = /** @type {{ message?: string }} */ (err || {});
        const msg = e.message ? String(e.message) : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้";
        showToast(msg, "error");
    } finally {
        if (submitBtn) unlockBtn(submitBtn);
    }
}

/**
 * Open the V.7.11 review gate (alias for loadCartView with state.currentView=review).
 */
export function handleReviewGate() {
    if (!_state) return;
    _state.currentView = "review";
    loadCartView();
}

/**
 * Test-only — reset module state.
 */
export function _resetCartLoader() {
    _api = null;
    _state = null;
    _onSuccess = null;
}
