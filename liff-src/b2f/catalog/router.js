/**
 * B2F Admin LIFF E-Catalog — Router (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.15
 *   - openSetDetail(sku) opens a full-page overlay (line 2283 inline).
 *   - SET Detail close = back button → resetCatalog() (line 3194 inline).
 *   - Inline V.7.15 mutates DOM directly; URL state was not used. Round 3
 *     adds hash-based routing for SPA-style navigation parity with B2B
 *     Catalog R3 + B2F Maker R3.
 *
 * URL → state mapping (Round 3 canonical):
 *   - ``                  → view=catalog (default landing)
 *   - `#home`             → maker home (entry landing — pick maker)
 *   - `#catalog`          → catalog grid
 *   - `#detail-<sku>`     → SET Detail overlay
 *   - `#cart`             → cart sheet (was modal in inline V.7.15)
 *   - `#review`           → review gate (V.7.11 a11y tabs)
 *   - `#success`          → success screen (post-submit)
 *
 * REG-029 byte-identical: When the V.0.4 bundle is OFF
 * (`dinoco_liff_use_vite_b2f_catalog=0`), inline V.7.15 owns navigation
 * and this router is never instantiated. Triple safety chain (flag +
 * manifest + dinoco_liff_enqueue presence) preserved by entry.js.
 */

const KNOWN_VIEWS = ["home", "catalog", "cart", "review", "success"];
const DEFAULT_VIEW = "catalog";
const SET_DETAIL_PREFIX = "detail-";

/**
 * @typedef {Object} RouterView
 * @property {string} name  one of KNOWN_VIEWS or detail
 * @property {string} [sku] SET sku when name is detail
 */

/**
 * @typedef {Object} RouterHandlers
 * @property {() => Promise<void>|void}                  [home]
 * @property {() => Promise<void>|void}                  [catalog]
 * @property {(sku: string) => Promise<void>|void}       [detail]
 * @property {() => Promise<void>|void}                  [cart]
 * @property {() => Promise<void>|void}                  [review]
 * @property {() => Promise<void>|void}                  [success]
 */

/**
 * @typedef {Object} RouterOptions
 * @property {RouterHandlers} handlers
 * @property {boolean}        [useHashApi]   default true. false = no
 *                                            listener (legacy inline owns
 *                                            navigation).
 */

/** @type {RouterHandlers|null} */
let _handlers = null;
let _useHashApi = false;

/**
 * Read the current view from `window.location.hash`. Returns the
 * canonical default ("catalog") when the hash is empty / unrecognized.
 *
 * @returns {RouterView}
 */
export function getCurrentView() {
    if (typeof window === "undefined" || !window.location) {
        return { name: DEFAULT_VIEW };
    }
    const hash = (window.location.hash || "").replace(/^#/, "");
    if (!hash) return { name: DEFAULT_VIEW };
    if (hash.indexOf(SET_DETAIL_PREFIX) === 0) {
        return { name: "detail", sku: hash.slice(SET_DETAIL_PREFIX.length) };
    }
    if (KNOWN_VIEWS.indexOf(hash) === -1) return { name: DEFAULT_VIEW };
    return { name: hash };
}

/**
 * Internal — fire registered handler.
 *
 * @param {string} key
 * @param {string} [arg=""]
 */
function _dispatch(key, arg = "") {
    if (!_handlers) return;
    /** @type {any} */
    const fn = _handlers[key];
    if (typeof fn !== "function") return;
    try {
        if (key === "detail") fn(arg || "");
        else fn();
    } catch (err) {
        if (typeof console !== "undefined" && console.error) {
            console.error("[b2f-catalog router] handler threw:", err);
        }
    }
}

/**
 * Navigate to a named view. Updates URL hash + dispatches handler when
 * SPA mode is active. SET Detail uses `goToView('detail', { sku })`.
 *
 * @param {string} name
 * @param {{ sku?: string, silent?: boolean }} [opts]
 * @returns {void}
 */
export function goToView(name, opts) {
    if (typeof window === "undefined") return;
    const o = opts || {};
    const silent = !!o.silent;
    let hash;
    if (name === "detail") {
        if (!o.sku || typeof o.sku !== "string") return;
        hash = SET_DETAIL_PREFIX + o.sku;
    } else if (KNOWN_VIEWS.indexOf(name) === -1) {
        hash = DEFAULT_VIEW;
    } else {
        hash = name;
    }
    const url = window.location.pathname + window.location.search + "#" + hash;
    if (_useHashApi && window.history && window.history.pushState) {
        window.history.pushState({ view: name, sku: o.sku || null }, "", url);
        if (!silent) _dispatch(name, o.sku || "");
    } else if (window.location) {
        window.location.hash = hash;
    }
}

/**
 * Convenience — open a SET Detail overlay (mirrors inline V.7.15 line 2283
 * `openSetDetail(sku)`).
 *
 * @param {string} sku
 * @returns {void}
 */
export function openSetDetail(sku) {
    goToView("detail", { sku });
}

/**
 * Generic back button — pops history if available, else falls back to
 * the catalog view.
 *
 * @returns {void}
 */
export function back() {
    if (typeof window === "undefined") return;
    if (window.history && typeof window.history.back === "function" &&
        window.history.length > 1) {
        window.history.back();
        return;
    }
    goToView("catalog");
}

/**
 * Wire `hashchange` + `popstate` listeners. Idempotent.
 *
 * @param {RouterOptions} options
 * @returns {void}
 */
export function setupHashRouter(options) {
    if (!options || typeof options !== "object") {
        throw new Error("setupHashRouter: options.handlers required");
    }
    _handlers = options.handlers || null;
    _useHashApi = options.useHashApi !== false; // default true

    if (typeof window === "undefined" || !window.addEventListener) return;

    window.removeEventListener("hashchange", _onHashChange);
    window.removeEventListener("popstate", _onPopstate);
    if (_useHashApi) {
        window.addEventListener("hashchange", _onHashChange);
        window.addEventListener("popstate", _onPopstate);
    }
}

function _onHashChange() {
    const view = getCurrentView();
    if (view.name === "detail") {
        _dispatch("detail", view.sku || "");
        return;
    }
    _dispatch(view.name);
}

function _onPopstate() {
    _onHashChange();
}

/**
 * Fire the handler matching current URL state.
 *
 * @returns {RouterView}
 */
export function dispatchInitial() {
    const view = getCurrentView();
    if (view.name === "detail") {
        _dispatch("detail", view.sku || "");
    } else {
        _dispatch(view.name);
    }
    return view;
}

/**
 * Test-only — reset module state between Jest cases.
 */
export function _resetRouter() {
    _handlers = null;
    _useHashApi = false;
    if (typeof window !== "undefined" && window.removeEventListener) {
        window.removeEventListener("hashchange", _onHashChange);
        window.removeEventListener("popstate", _onPopstate);
    }
}

export const _internal = {
    KNOWN_VIEWS,
    DEFAULT_VIEW,
    SET_DETAIL_PREFIX,
};
