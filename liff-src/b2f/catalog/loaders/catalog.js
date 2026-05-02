/**
 * B2F Admin LIFF E-Catalog — Catalog page loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.15
 *   - line 1814: loadProducts(makerId) — fetch + render products
 *   - line 2752: cart mutation (delete on qty<=0; merge on qty>0)
 *   - line 2153-2160: V.7.0 add-to-cart — inCart toggle + qty stepper
 *
 * Round 3 contract:
 *   `setupCatalog({ api, state })` once at bootstrap; `loadCatalog()`
 *   fetches + renders + caches. `handleAddToCart(sku, qty, mode, src)`
 *   mutates cart + persists. Mount-tolerant — Round 4+ Vite container
 *   `#b2f-catalog-app`; inline V.7.15 keeps owning #productGrid.
 */

import { showLoading, hideLoading, showToast } from "../utils/dom.js";
import { escHtml } from "../utils/format.js";
import { saveCart, setCartQty } from "../utils/cart.js";
import { renderProducts } from "../pages/catalog.js";

/** @type {{
 *   getMakerProducts: Function,
 *   getCatalogMap?: Function
 * }|null} */
let _api = null;
/** @type {any} */
let _state = null;
/** @type {(() => void)|null} */
let _onCartChanged = null;

/**
 * @param {{
 *   api: { getMakerProducts: Function, getCatalogMap?: Function },
 *   state: object,
 *   onCartChanged?: () => void
 * }} deps
 */
export function setupCatalog(deps) {
    if (!deps || !deps.api || !deps.state) {
        throw new Error("setupCatalog: api + state required");
    }
    _api = deps.api;
    _state = /** @type {any} */ (deps.state);
    _onCartChanged = typeof deps.onCartChanged === "function" ? deps.onCartChanged : null;
}

/**
 * Fetch products + render grid.
 *
 * @returns {Promise<void>}
 */
export async function loadCatalog() {
    if (!_api || !_state) return;
    const makerId = _state.makerId;
    if (!makerId) return;
    const mount = (typeof document !== "undefined")
        ? document.getElementById("b2f-catalog-app")
        : null;
    showLoading();
    try {
        const res = await _api.getMakerProducts(makerId, {
            includeVirtual: !!_state.showVirtual,
        });
        hideLoading();
        const products = (res && (res.data || res.products)) || [];
        _state.products = Array.isArray(products) ? products : [];
        if (res && res.sku_relations) _state.skuRelations = res.sku_relations;
        if (res && res.catalog_map) _state.catalogMap = res.catalog_map;
        if (mount) {
            mount.innerHTML = renderProducts(_state.products, _state.skuRelations || {}, {
                cart: _state.cart || {},
                currency: _state.currency || "THB",
                orderIntentEnabled: !!_state.orderIntentEnabled,
                skuRelations: _state.skuRelations || {},
                hierarchyMeta: _state.hierarchyMeta || {},
                products: _state.products,
            });
        }
    } catch (err) {
        hideLoading();
        const e = /** @type {{ message?: string }} */ (err || {});
        const msg = e.message ? String(e.message) : "";
        showToast("โหลดสินค้าไม่สำเร็จ" + (msg ? ": " + msg : ""), "error");
        if (mount) {
            mount.innerHTML =
                '<div class="b2f-error">โหลดสินค้าไม่สำเร็จ' +
                (msg ? ": " + escHtml(msg) : "") +
                "</div>";
        }
    }
}

/**
 * Toggle V.6.5 virtual SET visibility.
 *
 * @param {boolean} show
 */
export async function setShowVirtual(show) {
    if (!_state) return;
    _state.showVirtual = !!show;
    await loadCatalog();
}

/**
 * Add (or update) a cart entry. mode = full_set | sub_unit | single_leaf.
 *
 * @param {string} sku
 * @param {number} qty
 * @param {string} [mode="single_leaf"]
 * @param {string} [sourceSku]
 * @returns {boolean} true on success
 */
export function handleAddToCart(sku, qty, mode, sourceSku) {
    if (!_state || !sku) return false;
    const q = Math.max(0, parseInt(String(qty), 10) || 0);
    const cart = _state.cart || (_state.cart = {});
    const products = _state.products || [];
    // Look up product by sku (case-insensitive) — inline V.7.15 uses
    // exact match but skuRelations storage is upper. Prefer exact first.
    const upper = String(sku).toUpperCase();
    let product = products.find(function (p) { return String(p.sku) === sku; });
    if (!product) {
        product = products.find(function (p) {
            return String(p.sku).toUpperCase() === upper;
        });
    }
    if (q <= 0) {
        delete cart[sku];
    } else {
        const existing = cart[sku] || {};
        cart[sku] = {
            sku: sku,
            qty: q,
            unit_cost: existing.unit_cost != null
                ? existing.unit_cost
                : (product && product.unit_cost) || 0,
            product_name: existing.product_name || (product && product.name) || sku,
            order_mode: mode || existing.order_mode || "single_leaf",
            source_sku: sourceSku || existing.source_sku || sku,
        };
    }
    if (_state.makerId) {
        try {
            saveCart(_state.makerId, cart);
        } catch (_e) { /* localStorage quota — ignore */ }
    }
    if (_onCartChanged) _onCartChanged();
    return true;
}

/**
 * Direct delegate to setCartQty utility — exposed for stepper UI.
 *
 * @param {string} sku
 * @param {number} qty
 */
export function setQty(sku, qty) {
    if (!_state) return;
    const cart = _state.cart || (_state.cart = {});
    setCartQty(cart, sku, qty);
    if (_state.makerId) {
        try { saveCart(_state.makerId, cart); } catch (_e) { /* ignore */ }
    }
    if (_onCartChanged) _onCartChanged();
}

/**
 * Test-only — reset module state.
 */
export function _resetCatalogLoader() {
    _api = null;
    _state = null;
    _onCartChanged = null;
}
