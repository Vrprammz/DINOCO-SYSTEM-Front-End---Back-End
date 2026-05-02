/**
 * B2B LIFF E-Catalog — Catalog page loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   - line 744-820   : authAndLoad() — auth-group + catalog fetch on bootstrap
 *   - line 999-1153  : renderProducts (delegated to pages/catalog.js Round 2)
 *   - line 1135-1148 : add-to-cart click handler (data-action="add"/"plus"/"minus")
 *
 * Behavioral parity:
 *   - Calls api.getCatalog() once on initial load + caches the result
 *     in `_state.products`. Inline V.32.9 caches the same way.
 *   - On add-to-cart: validates SET parent ↔ child duplicate (V.32.1
 *     H-10) before writing to cart, fires haptic vibrate (V.32.6 P16),
 *     persists to localStorage, and re-renders.
 *   - SET cards open SET Detail overlay via router.openSetDetail().
 *
 * Round 3 contract:
 *   `setupCatalog({ api, state })` once at bootstrap; `loadCatalog()`
 *   triggers fetch + render; `handleAddToCart(sku, qty)` mutates cart.
 *   Loader writes to `#b2b-catalog-app` if present (Round 4 cut-over),
 *   else delegates to inline V.32.9 DOM nodes (#productGrid).
 */

import {
    showToast,
    showAuthError,
    showLoading,
    hideLoading,
} from "../utils/dom.js";
import {
    saveCart,
    setCartQty,
    incrCartQty,
    detectCartDuplicates,
} from "../utils/cart.js";
import { renderProducts } from "../pages/catalog.js";
import { updateCartBar } from "../pages/cart.js";

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

/**
 * @typedef {Object} CatalogLoaderState
 * @property {Array<object>} products
 * @property {Record<string, number>} cart
 * @property {string} viewMode
 * @property {string} [searchQuery]
 * @property {string} [filterModel]
 * @property {string} [filterCategory]
 * @property {string} [crossFilter]
 * @property {string} [homeSearchQuery]
 */

/**
 * @typedef {Object} CatalogLoaderDeps
 * @property {{ getCatalog: () => Promise<any> }} api
 * @property {CatalogLoaderState} state
 * @property {(sku: string, product?: object) => void} [onOpenSetDetail]
 * @property {() => void} [onCartChanged]
 */

/** @type {CatalogLoaderDeps['api']|null} */
let _api = null;
/** @type {CatalogLoaderState|null} */
let _state = null;
/** @type {((sku: string, product?: object) => void)|null} */
let _onOpenSetDetail = null;
/** @type {(() => void)|null} */
let _onCartChanged = null;

/**
 * Wire the catalog loader. Idempotent.
 *
 * @param {CatalogLoaderDeps} deps
 * @returns {void}
 */
export function setupCatalog(deps) {
    if (!deps || !deps.api || !deps.state) {
        throw new Error("setupCatalog: deps.api + deps.state required");
    }
    _api = deps.api;
    _state = deps.state;
    _onOpenSetDetail = deps.onOpenSetDetail || null;
    _onCartChanged = deps.onCartChanged || null;
}

/**
 * Load + render the catalog grid into #b2b-catalog-app.
 *
 * @returns {Promise<void>}
 */
export async function loadCatalog() {
    if (!_api || !_state) return;
    showLoading();
    try {
        const res = await _api.getCatalog();
        const products = (res && (res.products || res.data)) || [];
        _state.products = Array.isArray(products) ? products : [];
        _renderInto(_state);
    } catch (err) {
        showAuthError(
            "โหลดสินค้าไม่สำเร็จ",
            _msg(err) || "กรุณาปิดแล้วเปิดลิงก์ใหม่",
            true
        );
    } finally {
        hideLoading();
    }
}

/**
 * Re-render the grid using current cached products + state. Called
 * after cart mutations or filter changes (no API hit).
 *
 * @returns {void}
 */
export function renderCatalog() {
    if (!_state) return;
    _renderInto(_state);
}

function _renderInto(state) {
    if (typeof document === "undefined") return;
    const root = document.getElementById("b2b-catalog-app");
    if (!root) return; // Inline V.32.9 owns DOM until Round 5.
    // renderProducts internally calls filterProducts via state — pass
    // the full state in. Returns { html, count, isEmpty }.
    const result = renderProducts(state.products || [], {
        cart: state.cart || {},
        viewMode: state.viewMode || "home",
        searchQuery: state.searchQuery || "",
        filterModel: state.filterModel || "",
        filterCategory: state.filterCategory || "",
        crossFilter: state.crossFilter || "",
        homeSearchQuery: state.homeSearchQuery || "",
    });
    root.innerHTML = result && result.html ? result.html : "";
}

/**
 * Add to cart with V.32.1 H-10 duplicate guard. Returns true on success.
 *
 * @param {string} sku
 * @param {number} [qty=1]    qty to add (default 1 — matches `+` button)
 * @returns {boolean}
 */
export function handleAddToCart(sku, qty) {
    if (!_state || !sku) return false;
    const products = _state.products || [];
    const cart = _state.cart || {};

    // Duplicate check — block adding child when parent SET is in cart
    // (or vice versa). V.32.1 H-10.
    const probe = setCartQty(cart, sku, (cart[sku] || 0) + (qty || 1));
    const dupes = detectCartDuplicates(probe, products);
    if (dupes.length > 0) {
        showToast("ลบลูก แล้วเพิ่มชุดเต็ม?");
        return false;
    }

    _state.cart = setCartQty(cart, sku, (cart[sku] || 0) + (qty || 1));
    saveCart(_state.cart);
    if (typeof navigator !== "undefined" && navigator.vibrate) {
        try { navigator.vibrate(20); } catch { /* swallow */ }
    }
    _renderInto(_state);
    _refreshCartBar();
    if (typeof _onCartChanged === "function") _onCartChanged();
    return true;
}

/**
 * Increment a SKU qty (used by `+` stepper). Same duplicate guard.
 *
 * @param {string} sku
 * @param {number} [delta=1]
 * @returns {void}
 */
export function handleIncrement(sku, delta) {
    if (!_state || !sku) return;
    _state.cart = incrCartQty(_state.cart || {}, sku, delta || 1);
    saveCart(_state.cart);
    if (typeof navigator !== "undefined" && navigator.vibrate) {
        try { navigator.vibrate(15); } catch { /* swallow */ }
    }
    _renderInto(_state);
    _refreshCartBar();
    if (typeof _onCartChanged === "function") _onCartChanged();
}

/**
 * Decrement a SKU qty (used by `−` stepper). Removes when qty → 0.
 *
 * @param {string} sku
 * @returns {void}
 */
export function handleDecrement(sku) {
    if (!_state || !sku) return;
    const cur = (_state.cart && _state.cart[sku]) || 0;
    if (cur <= 1) {
        const next = Object.assign({}, _state.cart || {});
        delete next[sku];
        _state.cart = next;
    } else {
        _state.cart = setCartQty(_state.cart || {}, sku, cur - 1);
    }
    saveCart(_state.cart);
    _renderInto(_state);
    _refreshCartBar();
    if (typeof _onCartChanged === "function") _onCartChanged();
}

/**
 * Click handler for SET cards — delegates to router via the wired
 * `onOpenSetDetail` callback (entry.js wires it to router.openSetDetail).
 *
 * @param {string} sku
 * @returns {void}
 */
export function handleOpenSetDetail(sku) {
    if (!_state || !sku) return;
    const product = (_state.products || []).find(
        (p) => p && p.sku === sku
    );
    if (typeof _onOpenSetDetail === "function") {
        _onOpenSetDetail(sku, product);
    }
}

/**
 * Refresh the bottom cart bar after any cart mutation. The Round 2
 * `updateCartBar()` returns a state object — we project it onto the
 * three known DOM ids (#cartCount, #cartTotal, #cartBar) when present.
 */
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
export function _resetCatalogLoader() {
    _api = null;
    _state = null;
    _onOpenSetDetail = null;
    _onCartChanged = null;
}
