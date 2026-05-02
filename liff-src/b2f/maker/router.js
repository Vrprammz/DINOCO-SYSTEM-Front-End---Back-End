/**
 * B2F Maker LIFF — Router (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *   - lines 1559-1576: window.goToPage / window.goToPageWithPO + URL state
 *   - lines 413-419:   page switch dispatch (init() body)
 *
 * Behavioral parity:
 *   - URL is the source of truth for current page (matches inline V.4.7 which
 *     used `window.location.search = params.toString()` to *navigate* by full
 *     reload). Round 3 keeps the reload-style API (`window.location.search`)
 *     to avoid disturbing hash/history semantics that LIFF + LINE in-app
 *     browser depend on. Inline calls (`goToPage('list')`) re-route via the
 *     same global functions exposed by `entry.js` Round 4.
 *
 * V.4.7 quirks we preserve:
 *   - `?page=` cleanup — old query name removed when navigating.
 *   - `?view=` is the canonical key (default `list` if absent or unknown).
 *   - `?po_id=` survives navigation (for confirm/detail/reschedule/deliver
 *     entry from PO list cards).
 *
 * Round 3 ALSO supports a SPA-style mode for tests + future cut-over:
 *   - When `setupRouter({ handlers, useHistoryApi: true })`, `goToPage()`
 *     calls `history.pushState` instead of mutating `location.search`. This
 *     lets Jest verify navigation without page reloads.
 *   - Production stays on full-reload (V.4.7 byte-identical) until Round 5.
 */

const KNOWN_VIEWS = ["confirm", "detail", "reschedule", "list", "deliver"];
const DEFAULT_VIEW = "list";

/**
 * @typedef {Object} RouterHandlers
 * @property {(po_id?: string) => Promise<void>|void} [confirm]
 * @property {(po_id?: string) => Promise<void>|void} [detail]
 * @property {(po_id?: string) => Promise<void>|void} [reschedule]
 * @property {() => Promise<void>|void}               [list]
 * @property {(po_id?: string) => Promise<void>|void} [deliver]
 */

/**
 * @typedef {Object} RouterOptions
 * @property {RouterHandlers} handlers
 * @property {boolean}       [useHistoryApi]   true = pushState (SPA), false =
 *                                              full reload via location.search
 *                                              (V.4.7 default).
 * @property {(view: string) => string} [resolveView] override default view
 *                                              resolver (testing).
 */

/** @type {RouterHandlers|null} */
let _handlers = null;
let _useHistoryApi = false;

/**
 * Read the current `?view=` from the URL.
 * Falls back to DEFAULT_VIEW when the value is missing or unrecognized.
 *
 * @returns {string}
 */
export function getCurrentView() {
    if (typeof window === "undefined" || !window.location) {
        return DEFAULT_VIEW;
    }
    const params = new URLSearchParams(window.location.search);
    const v = (params.get("view") || params.get("page") || "").trim();
    if (KNOWN_VIEWS.indexOf(v) === -1) return DEFAULT_VIEW;
    return v;
}

/**
 * Read the current `?po_id=` from the URL (string, never null).
 *
 * @returns {string}
 */
export function getCurrentPoId() {
    if (typeof window === "undefined" || !window.location) return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("po_id") || "";
}

/**
 * Build a URL search string for a navigation target.
 * Returns the new `search` (with leading `?`) — caller decides how to apply.
 *
 * @param {string} view
 * @param {{ po_id?: string|number }} [opts]
 * @returns {string}
 */
function buildSearch(view, opts = {}) {
    if (typeof window === "undefined" || !window.location) return "";
    const params = new URLSearchParams(window.location.search);
    params.set("view", view);
    params.delete("page"); // V.4.7 cleanup
    if (opts.po_id !== undefined && opts.po_id !== null && opts.po_id !== "") {
        params.set("po_id", String(opts.po_id));
    }
    return "?" + params.toString();
}

/**
 * Navigate to a view (without po_id).
 *
 * V.4.7 inline form: `window.goToPage(pg)`.
 *
 * @param {string} view
 * @returns {void}
 */
export function goToPage(view) {
    if (typeof window === "undefined") return;
    if (KNOWN_VIEWS.indexOf(view) === -1) view = DEFAULT_VIEW;
    const search = buildSearch(view);
    if (_useHistoryApi && window.history && window.history.pushState) {
        window.history.pushState({ view }, "", search);
        _dispatchHandler(view);
    } else {
        window.location.search = search.replace(/^\?/, "");
    }
}

/**
 * Navigate to a view with po_id pre-set in URL.
 *
 * V.4.7 inline form: `window.goToPageWithPO(pg, poId)`.
 *
 * @param {string} view
 * @param {string|number|null|undefined} poId
 * @returns {void}
 */
export function goToPageWithPO(view, poId) {
    if (typeof window === "undefined") return;
    if (KNOWN_VIEWS.indexOf(view) === -1) view = DEFAULT_VIEW;
    const search = buildSearch(view, { po_id: poId });
    if (_useHistoryApi && window.history && window.history.pushState) {
        window.history.pushState({ view, po_id: poId }, "", search);
        _dispatchHandler(view, poId == null ? "" : String(poId));
    } else {
        window.location.search = search.replace(/^\?/, "");
    }
}

/**
 * Internal — fire registered handler for a view.
 *
 * @param {string} view
 * @param {string} [poId]
 */
function _dispatchHandler(view, poId) {
    if (!_handlers) return;
    const fn = _handlers[/** @type {keyof RouterHandlers} */ (view)];
    if (typeof fn !== "function") return;
    try {
        // list handler takes no args; others take optional po_id
        if (view === "list") {
            fn();
        } else {
            fn(poId);
        }
    } catch (err) {
        // Swallow — handlers own their own error display via showError().
        // We never want a router dispatch to throw uncaught.
        if (typeof console !== "undefined" && console.error) {
            console.error("[b2f-maker router] handler threw:", err);
        }
    }
}

/**
 * Wire popstate listener + register page handlers. Idempotent — calling
 * twice is safe (replaces handlers, re-attaches popstate).
 *
 * Caller passes a handler map keyed by view name. Round 3 loaders
 * (`loaders/{confirm,detail,...}.js`) supply these.
 *
 * @param {RouterOptions} options
 * @returns {void}
 */
export function setupRouter(options) {
    if (!options || typeof options !== "object") {
        throw new Error("setupRouter: options.handlers required");
    }
    _handlers = options.handlers || null;
    _useHistoryApi = !!options.useHistoryApi;

    if (typeof window !== "undefined" && window.addEventListener) {
        // Idempotent — remove any prior listener first via a named function.
        window.removeEventListener("popstate", _onPopstate);
        if (_useHistoryApi) {
            window.addEventListener("popstate", _onPopstate);
        }
    }
}

/**
 * Internal popstate handler — re-dispatches based on current URL.
 */
function _onPopstate() {
    const view = getCurrentView();
    const poId = getCurrentPoId();
    _dispatchHandler(view, poId);
}

/**
 * Test-only — reset module state between Jest cases.
 */
export function _resetRouter() {
    _handlers = null;
    _useHistoryApi = false;
    if (typeof window !== "undefined" && window.removeEventListener) {
        window.removeEventListener("popstate", _onPopstate);
    }
}

/**
 * Dispatch the initial page based on URL `?view=`. Loaders use this on
 * bootstrap to render the page user landed on. Returns the resolved
 * view name + po_id for the caller's logging.
 *
 * @returns {{ view: string, po_id: string }}
 */
export function dispatchInitial() {
    const view = getCurrentView();
    const poId = getCurrentPoId();
    _dispatchHandler(view, poId);
    return { view, po_id: poId };
}
