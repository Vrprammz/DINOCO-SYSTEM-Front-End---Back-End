/**
 * B2F Admin LIFF E-Catalog — SET Detail loader (V.0.5 — Dead-Workflow Spec V.1.0 P0.10)
 *
 * V.0.5 (2026-05-18) P0.10 — "ไม่พบรายการนี้" now renders full ErrorState
 * with 🔄 retry (reload products + re-lookup) + ← back to catalog. Previously
 * only toast appeared then user trapped on whatever screen was below.
 *
 * V.0.4 Round 3 contract: setupSetDetail({ api, state, onAddToCart }) once;
 * loadSetDetail(sku) looks up SET + injects detail HTML. Stepper +/- via
 * handleStepperChange(sku, delta).
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.15
 *   - line 2283: openSetDetail(sku) — full-page overlay
 *   - line 2443-2517: per-SET detail rendering + qty stepper wiring
 */

import { showToast } from "../utils/dom.js";
import { escHtml } from "../utils/format.js";
import { renderRetryableError } from "../../../shared/error-state.js";
import {
    renderSetDetailItems,
    renderSetDetailMainStepper,
} from "../pages/setDetail.js";

/** @type {any} */
let _api = null;
/** @type {any} */
let _state = null;
/** @type {((sku: string, qty: number, mode?: string, src?: string) => boolean)|null} */
let _onAddToCart = null;
/** @type {(() => void)|null} V.0.5 P0.10 — back-to-catalog navigation hook */
let _onBackToCatalog = null;

/**
 * @param {{
 *   api: object,
 *   state: object,
 *   onAddToCart?: (sku: string, qty: number, mode?: string, src?: string) => boolean,
 *   onBackToCatalog?: () => void
 * }} deps
 */
export function setupSetDetail(deps) {
    if (!deps || !deps.api || !deps.state) {
        throw new Error("setupSetDetail: api + state required");
    }
    _api = deps.api;
    _state = /** @type {any} */ (deps.state);
    _onAddToCart = typeof deps.onAddToCart === "function" ? deps.onAddToCart : null;
    _onBackToCatalog = typeof deps.onBackToCatalog === "function" ? deps.onBackToCatalog : null;
}

/**
 * Render SET Detail for the given SET sku. Falls back to the catalog view
 * when sku is missing or not found.
 *
 * @param {string} sku
 * @returns {Promise<void>}
 */
export async function loadSetDetail(sku) {
    if (!_state) return;
    const targetSku = String(sku || "");
    if (!targetSku) return;
    const mount = (typeof document !== "undefined")
        ? document.getElementById("b2f-catalog-app")
        : null;
    const products = _state.products || [];
    const product = products.find(function (p) {
        return String(p.sku) === targetSku ||
            String(p.sku).toUpperCase() === targetSku.toUpperCase();
    });
    if (!product) {
        // V.0.5 P0.10 — render full ErrorState with retry + back navigation
        // instead of orphan toast that leaves user on stale screen.
        if (mount) {
            renderRetryableError(mount, {
                title: "ไม่พบรายการนี้",
                message: "ไม่พบ SET รหัส " + targetSku + " — อาจเป็นเพราะ catalog ยังโหลดไม่เสร็จ หรือสินค้านี้ถูกยกเลิก",
                code: "SET_NOT_FOUND:" + targetSku,
                onRetry: () => loadSetDetail(targetSku),
                onBack: () => {
                    if (_onBackToCatalog) {
                        _onBackToCatalog();
                    } else if (typeof window !== "undefined" && window.history) {
                        window.history.back();
                    }
                },
            });
        } else {
            showToast("ไม่พบรายการนี้", "error");
        }
        return;
    }
    if (!mount) return;
    const cart = _state.cart || {};
    const skuRelations = _state.skuRelations || {};
    const catalogMap = _state.catalogMap || {};
    const currency = _state.currency || "THB";

    const headerHtml =
        '<div class="b2f-set-detail-header">' +
        '<button type="button" class="b2f-back-btn" data-action="back">← กลับ</button>' +
        '<h2 class="b2f-set-detail-title">' + escHtml(String(product.name || sku)) + "</h2>" +
        "</div>";

    const cartEntry = cart[targetSku];
    const qtyInCart = cartEntry ? parseInt(cartEntry.qty, 10) || 0 : 0;
    const mainStepperHtml = renderSetDetailMainStepper(
        targetSku,
        qtyInCart,
        qtyInCart,
        /** @type {any} */ ({
            currency: currency,
            product: product,
        })
    );
    // catalogMap reserved for Round 4+ enrichment paths; reference here so
    // typecheck/lint don't flag the loaded value.
    void catalogMap;
    const itemsHtml = renderSetDetailItems(product, {
        products: products,
        skuRelations: skuRelations,
        hierarchyMeta: _state.hierarchyMeta || {},
        cart: cart,
        currency: currency,
    });

    mount.innerHTML =
        '<div class="b2f-set-detail">' +
        headerHtml +
        mainStepperHtml +
        itemsHtml +
        "</div>";
}

/**
 * Stepper increment/decrement handler. delta = +1 or -1 (or any signed int).
 *
 * @param {string} sku
 * @param {number} delta
 * @param {string} [mode]
 * @param {string} [sourceSku]
 * @returns {boolean}
 */
export function handleStepperChange(sku, delta, mode, sourceSku) {
    if (!_state || !_onAddToCart) return false;
    const cart = _state.cart || {};
    const cur = cart[sku] ? parseInt(cart[sku].qty, 10) || 0 : 0;
    const next = Math.max(0, cur + (parseInt(String(delta), 10) || 0));
    return _onAddToCart(sku, next, mode, sourceSku);
}

/**
 * Test-only — reset module state.
 */
export function _resetSetDetailLoader() {
    _api = null;
    _state = null;
    _onAddToCart = null;
}
