/**
 * B2F Admin LIFF E-Catalog — Cart + Submit-PO loader (V.0.5 — Dead-Workflow Spec V.1.0 P0.6)
 *
 * V.0.5 (2026-05-18) P0.6 — Replaced toast-only error on cart submit (409 DUPLICATE_PO,
 * generic API error, network failure) with renderErrorState() showing 🔄 retry button
 * + ← back + reason inline. Previously toast disappeared after 5s leaving cart sheet
 * unresponsive with no next action.
 *
 * V.0.4 Round 3 contract:
 *   `setupCart({ api, state })` once at bootstrap;
 *   `loadCartView()` renders cart sheet + manufacturing summary;
 *   `loadReviewGate()` renders the V.7.11 a11y review gate;
 *   `handleSubmitOrder({ force })` POSTs /create-po with idempotency key
 *   + clears cart on success + transitions to success screen.
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.15
 *   - line 3115-3170: submitOrder(force) — POST /create-po
 *   - line 1322:      loadCartFromStorage()
 *   - line 2798:      cart total computation
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
import { renderRetryableError } from "../../../shared/error-state.js";

/** @type {any} */
let _api = null;
/** @type {any} */
let _state = null;
/** @type {((poNumber: string, poId: string|number, warnings?: string[]) => void)|null} */
let _onSuccess = null;
/** @type {(() => void)|null} V.0.5 P0.6 — back navigation hook for error-state */
let _onBackToCart = null;

/**
 * @param {{
 *   api: object,
 *   state: object,
 *   onSuccess?: (poNumber: string, poId: string|number, warnings?: string[]) => void,
 *   onBackToCart?: () => void
 * }} deps
 */
export function setupCart(deps) {
    if (!deps || !deps.api || !deps.state) {
        throw new Error("setupCart: api + state required");
    }
    _api = deps.api;
    _state = /** @type {any} */ (deps.state);
    _onSuccess = typeof deps.onSuccess === "function" ? deps.onSuccess : null;
    _onBackToCart = typeof deps.onBackToCart === "function" ? deps.onBackToCart : null;
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
            // V.0.7 P0.15 — highlight field + scroll-to + toast (was toast-only).
            _highlightFieldError(rateEl, "กรุณากรอกอัตราแลกเปลี่ยน");
            showToast("กรุณากรอกอัตราแลกเปลี่ยน", "error");
            return;
        }
        if (!shipMethod) {
            _highlightFieldError(shipMethodEl, "กรุณาเลือกวิธีส่ง");
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
            // V.0.5 P0.6 — render full ErrorState with retry instead of toast
            _renderCartErrorState({
                title: "PO ซ้ำในระบบ",
                message:
                    (res.error || "พบ PO นี้อยู่ในระบบแล้ว") +
                    (res.existing_po ? "\n\nเลขที่ PO: " + res.existing_po : ""),
                code: "DUPLICATE_PO",
                onRetry: () => handleSubmitOrder({ force: true }),
                onBack: _onBackToCart,
            });
        } else {
            _renderCartErrorState({
                title: "สร้าง PO ไม่สำเร็จ",
                message: (res && res.error) || "ระบบไม่สามารถสร้าง PO ได้ในขณะนี้",
                reason: res && res.detail ? String(res.detail) : "",
                code: res && res.code ? String(res.code) : "API_ERROR",
                onRetry: () => handleSubmitOrder({ force }),
                onBack: _onBackToCart,
            });
        }
    } catch (err) {
        hideLoading();
        const e = /** @type {{ message?: string }} */ (err || {});
        const msg = e.message ? String(e.message) : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้";
        // V.0.5 P0.6 — Network/exception failures get retry button too
        _renderCartErrorState({
            title: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้",
            message: "ไม่สามารถส่งคำสั่งซื้อให้เซิร์ฟเวอร์ได้ — ตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองอีกครั้ง",
            reason: msg,
            code: "NETWORK_ERROR",
            onRetry: () => handleSubmitOrder({ force }),
            onBack: _onBackToCart,
        });
    } finally {
        if (submitBtn) unlockBtn(submitBtn);
    }
}

/**
 * V.0.5 P0.6 — Render error state in dedicated mount point above cart actions.
 * Mount point auto-created (or reused) below cart items.
 * @param {Object} opts — { title, message, reason, code, onRetry, onBack }
 */
function _renderCartErrorState(opts) {
    if (typeof document === "undefined") {
        // Server-side or test env — fall back to toast
        showToast(opts.message || "เกิดข้อผิดพลาด", "error");
        return;
    }
    let mountEl = document.querySelector("#b2f-cart-error-mount");
    if (!mountEl) {
        // Inject mount point above cart submit button (preserves layout)
        const submitBtn = document.querySelector(".b2f-cart-submit");
        const parent =
            (submitBtn && submitBtn.parentNode) ||
            document.querySelector(".b2f-cart-actions") ||
            document.body;
        mountEl = document.createElement("div");
        mountEl.id = "b2f-cart-error-mount";
        if (parent && submitBtn) {
            parent.insertBefore(mountEl, submitBtn);
        } else if (parent) {
            parent.appendChild(mountEl);
        }
    }
    renderRetryableError(/** @type {HTMLElement} */ (mountEl), opts);
}

/* V.0.5 P0.6 — _onBackToCart declared at module top with other state vars. */

/**
 * V.0.7 P0.15 — visually highlight a form field that failed validation +
 * scroll it into view + announce the error via aria-live for screen readers.
 * Auto-clears after 4s or on next input/change. Idempotent across re-renders.
 *
 * @param {Element|null} el
 * @param {string} errorMessage  Thai message to associate via aria-describedby
 */
function _highlightFieldError(el, errorMessage) {
    if (!el || typeof document === "undefined") return;
    const target = /** @type {HTMLElement} */ (el);
    // Apply red border + outline (works on both <input> and <select>)
    const prevBorder = target.style.borderColor;
    const prevOutline = target.style.outline;
    const prevShadow = target.style.boxShadow;
    target.style.borderColor = "#dc2626";
    target.style.outline = "2px solid #fecaca";
    target.style.outlineOffset = "1px";
    target.style.boxShadow = "0 0 0 3px rgba(220, 38, 38, 0.15)";
    target.setAttribute("aria-invalid", "true");

    // Inline error message via aria-describedby + small red text below field
    const errId = (target.id || "b2f-field") + "-error";
    let errEl = document.getElementById(errId);
    if (!errEl) {
        errEl = document.createElement("div");
        errEl.id = errId;
        errEl.setAttribute("role", "alert");
        errEl.style.cssText =
            "margin-top:4px;font-size:12px;color:#dc2626;font-weight:500";
        if (target.parentNode) {
            target.parentNode.insertBefore(errEl, target.nextSibling);
        }
    }
    errEl.textContent = errorMessage;
    target.setAttribute("aria-describedby", errId);

    // Scroll target into view (mobile-friendly — center the field).
    // jsdom + older browsers may not have scrollIntoView at all; guard fully.
    if (typeof target.scrollIntoView === "function") {
        try {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (_e) {
            try { target.scrollIntoView(); } catch (_e2) { /* swallow */ }
        }
    }
    // Focus for keyboard users
    try { target.focus({ preventScroll: true }); }
    catch (_e) {
        try { target.focus(); } catch (_e2) { /* focus unavailable */ }
    }

    // Auto-clear on next user interaction OR after 4s
    const clear = () => {
        target.style.borderColor = prevBorder;
        target.style.outline = prevOutline;
        target.style.boxShadow = prevShadow;
        target.removeAttribute("aria-invalid");
        target.removeAttribute("aria-describedby");
        if (errEl && errEl.parentNode) {
            errEl.parentNode.removeChild(errEl);
        }
        target.removeEventListener("input", clear);
        target.removeEventListener("change", clear);
    };
    target.addEventListener("input", clear, { once: true });
    target.addEventListener("change", clear, { once: true });
    setTimeout(clear, 4000);
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
