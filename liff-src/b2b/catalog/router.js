/**
 * B2B LIFF E-Catalog — Router (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   - line 720-728 : iOS swipe-back guard via `history.replaceState({view:'root'}, ...)`
 *   - line 1187    : `history.pushState({view:'detail',sku},'','#detail-<sku>')`
 *                    when SET Detail overlay opens
 *   - line 1297-1301: `popstate` listener — closes SET Detail when active,
 *                     otherwise no-op
 *
 * B2B catalog has 3 logical "tabs":
 *   - "catalog" / "home" — main grid (default)
 *   - "history"           — order history list (sub-view of catalog tab)
 *   - "set-detail"        — full-page overlay opened from a SET card
 *
 * Inline V.32.9 only uses URL hash for SET Detail (`#detail-<sku>`); tabs
 * switch via direct `display` mutations. Round 3 router preserves that
 * behavior + adds a unified API so Round 4+ loaders can reason about
 * "current view" symbolically.
 *
 * URL → state mapping (production parity):
 *   - `` (empty hash)              → tab=catalog
 *   - `#catalog`                   → tab=catalog (canonical)
 *   - `#history`                   → tab=history (NEW — SPA-style sub-route
 *                                    for the order history pane; inline
 *                                    keeps display-toggle, this is parallel)
 *   - `#detail-<sku>`              → overlay open above current tab
 *
 * Round 3 ALSO supports a hash-based router for SPA-style navigation in
 * tests + future cut-over. Inline V.32.9 owns DOM mutation today; this
 * helper provides:
 *   - getCurrentTab()              — read tab from hash
 *   - getCurrentSetSku()           — read SET sku from `#detail-<sku>` hash
 *   - goToTab(tab, opts)           — push hash + dispatch handler
 *   - openSetDetail(sku, product)  — push `#detail-<sku>` + dispatch
 *   - closeSetDetail()             — clear detail hash + dispatch back
 *   - back()                       — close overlay if open, else history.back()
 *   - setupHashRouter({handlers})  — wire hashchange/popstate
 *   - dispatchInitial()            — fire handler matching current URL
 *
 * REG-029 byte-identical: hash format `#detail-<sku>` matches inline
 * V.32.9 line 1187 verbatim. Default `#catalog` is NEW canonical form
 * but degrades gracefully when hash is empty (treated identical to
 * `#catalog`).
 */

const KNOWN_TABS = ["catalog", "home", "history"];
const DEFAULT_TAB = "catalog";
const SET_DETAIL_PREFIX = "#detail-";

/**
 * @typedef {Object} RouterHandlers
 * @property {() => Promise<void>|void}                  [catalog]
 * @property {() => Promise<void>|void}                  [home]
 * @property {() => Promise<void>|void}                  [history]
 * @property {(sku: string) => Promise<void>|void}       [setDetail]
 * @property {() => Promise<void>|void}                  [closeSetDetail]
 */

/**
 * @typedef {Object} RouterOptions
 * @property {RouterHandlers} handlers
 * @property {boolean}        [useHashApi]   true = pushState + hashchange
 *                                             listener (Round 3 default).
 *                                             false = no listener (legacy
 *                                             inline owns navigation).
 */

/** @type {RouterHandlers|null} */
let _handlers = null;
let _useHashApi = false;

/**
 * Read the current tab from the URL hash. Returns DEFAULT_TAB when the
 * hash is empty, unrecognized, or holds a `#detail-<sku>` overlay marker
 * (because the underlying tab is whatever the user was on before).
 *
 * NOTE: When the hash IS a SET Detail hash, the "tab" is whatever the
 * user was on before opening the overlay — caller can read that from
 * the state object they hold. We return DEFAULT_TAB here to keep the
 * function pure (no module-private "previous tab" memory).
 *
 * @returns {string}
 */
export function getCurrentTab() {
    if (typeof window === "undefined" || !window.location) return DEFAULT_TAB;
    const hash = (window.location.hash || "").replace(/^#/, "");
    if (!hash) return DEFAULT_TAB;
    if (hash.indexOf("detail-") === 0) return DEFAULT_TAB;
    if (KNOWN_TABS.indexOf(hash) === -1) return DEFAULT_TAB;
    return hash;
}

/**
 * Read the SET sku from `#detail-<sku>` hash. Returns empty string when
 * the hash is not a SET Detail hash.
 *
 * @returns {string}
 */
export function getCurrentSetSku() {
    if (typeof window === "undefined" || !window.location) return "";
    const hash = window.location.hash || "";
    if (hash.indexOf(SET_DETAIL_PREFIX) !== 0) return "";
    return hash.slice(SET_DETAIL_PREFIX.length);
}

/**
 * True when the current URL has a SET Detail overlay open.
 *
 * @returns {boolean}
 */
export function isSetDetailOpen() {
    return getCurrentSetSku() !== "";
}

/**
 * Internal — fire registered handler.
 *
 * @param {keyof RouterHandlers} key
 * @param {string} [arg=""]
 */
function _dispatch(key, arg = "") {
    if (!_handlers) return;
    /** @type {any} */
    const fn = _handlers[key];
    if (typeof fn !== "function") return;
    try {
        if (key === "setDetail") {
            fn(arg || "");
        } else {
            fn();
        }
    } catch (err) {
        // Match B2F router pattern: never let a handler throw uncaught.
        if (typeof console !== "undefined" && console.error) {
            console.error("[b2b-catalog router] handler threw:", err);
        }
    }
}

/**
 * Navigate to a tab. Updates the URL hash (`#<tab>`) and fires the
 * matching handler when SPA mode is active.
 *
 * @param {string} tab
 * @param {{ silent?: boolean }} [opts] silent=true skips handler dispatch
 *                                       (used during programmatic state
 *                                       sync, e.g. closeSetDetail)
 * @returns {void}
 */
export function goToTab(tab, opts) {
    if (typeof window === "undefined") return;
    const next = KNOWN_TABS.indexOf(tab) === -1 ? DEFAULT_TAB : tab;
    const silent = !!(opts && opts.silent);
    const url = window.location.pathname + window.location.search + "#" + next;
    if (_useHashApi && window.history && window.history.pushState) {
        window.history.pushState({ view: "tab", tab: next }, "", url);
        if (!silent) _dispatch(/** @type {keyof RouterHandlers} */ (next));
    } else if (window.location) {
        // Fallback path: assign hash directly. Doesn't trigger our
        // hashchange listener if useHashApi=false (correct — caller owns
        // navigation in legacy mode).
        window.location.hash = next;
    }
}

/**
 * Open a SET Detail overlay. Pushes `#detail-<sku>` onto the history
 * stack so the back button closes the overlay (mirrors inline V.32.9
 * line 1187 verbatim).
 *
 * The optional `product` argument is forwarded to the setDetail handler
 * — loaders use it as a hint to avoid re-fetching when the product list
 * is already in memory.
 *
 * @param {string} sku
 * @param {object} [product]   optional product object passed to handler
 * @returns {void}
 */
export function openSetDetail(sku, product) {
    if (typeof window === "undefined") return;
    if (!sku || typeof sku !== "string") return;
    const url =
        window.location.pathname +
        window.location.search +
        SET_DETAIL_PREFIX +
        sku;
    if (_useHashApi && window.history && window.history.pushState) {
        window.history.pushState({ view: "detail", sku, product }, "", url);
        _dispatch("setDetail", sku);
    } else if (window.location) {
        window.location.hash = "detail-" + sku;
    }
}

/**
 * Close the SET Detail overlay. Pops the `#detail-<sku>` state via
 * `history.back()` so the browser-native back button still works.
 *
 * Caller must have opened the overlay via `openSetDetail()` — this is
 * a no-op when no overlay is open (matches inline V.32.9 line 1290-1293
 * where the back button checks `style.display !== 'none'` first).
 *
 * @returns {void}
 */
export function closeSetDetail() {
    if (typeof window === "undefined") return;
    if (!isSetDetailOpen()) return;
    if (
        _useHashApi &&
        window.history &&
        typeof window.history.back === "function"
    ) {
        window.history.back();
        return;
    }
    // Fallback: clear the hash directly. The hashchange listener (if
    // wired) will pick it up and dispatch closeSetDetail handler.
    if (window.location) {
        const url = window.location.pathname + window.location.search;
        if (
            window.history &&
            typeof window.history.replaceState === "function"
        ) {
            window.history.replaceState({ view: "tab" }, "", url);
            // Manually fire — replaceState does NOT emit hashchange.
            _dispatch("closeSetDetail");
        } else {
            window.location.hash = "";
        }
    }
}

/**
 * Generic back button — closes overlay if one is open, else triggers
 * `history.back()` (matching V.32.9 line 1290-1293 behavior).
 *
 * @returns {void}
 */
export function back() {
    if (typeof window === "undefined") return;
    if (isSetDetailOpen()) {
        closeSetDetail();
        return;
    }
    if (window.history && typeof window.history.back === "function") {
        window.history.back();
    }
}

/**
 * Wire `hashchange` + `popstate` listeners. Idempotent — calling twice
 * is safe (replaces handlers + re-attaches listeners).
 *
 * Loaders supply the handler map. Default mode (`useHashApi: true`)
 * activates the SPA listener path. Pass `useHashApi: false` to register
 * handlers without listening — useful for unit tests or for letting
 * inline V.32.9 own navigation while we observe.
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

    // Idempotent attach via named function.
    window.removeEventListener("hashchange", _onHashChange);
    window.removeEventListener("popstate", _onPopstate);
    if (_useHashApi) {
        window.addEventListener("hashchange", _onHashChange);
        window.addEventListener("popstate", _onPopstate);
    }
}

/**
 * Hashchange listener — re-dispatches based on new URL hash.
 */
function _onHashChange() {
    const sku = getCurrentSetSku();
    if (sku) {
        _dispatch("setDetail", sku);
        return;
    }
    // Hash changed and we're NOT on a detail hash. If we WERE on detail
    // before, this is the close-overlay case.
    _dispatch("closeSetDetail");
    const tab = getCurrentTab();
    _dispatch(/** @type {keyof RouterHandlers} */ (tab));
}

/**
 * Popstate listener — same as hashchange in this router (we use hash
 * navigation, but `history.back()` from a `pushState` does NOT emit
 * hashchange, so we listen to both).
 */
function _onPopstate() {
    _onHashChange();
}

/**
 * Fire the handler matching current URL state. Loaders call this on
 * bootstrap so the user lands on the right view.
 *
 * @returns {{ tab: string, set_sku: string }}
 */
export function dispatchInitial() {
    const sku = getCurrentSetSku();
    if (sku) {
        _dispatch("setDetail", sku);
        return { tab: DEFAULT_TAB, set_sku: sku };
    }
    const tab = getCurrentTab();
    _dispatch(/** @type {keyof RouterHandlers} */ (tab));
    return { tab, set_sku: "" };
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
    KNOWN_TABS,
    DEFAULT_TAB,
    SET_DETAIL_PREFIX,
};
