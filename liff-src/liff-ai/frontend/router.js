/**
 * LIFF AI — Router (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.10
 *   - lines 749-764: route(page, params) — page dispatch switch
 *   - lines 766-775: navigate(page, params) — pushState + dispatch
 *   - lines 778-782: popstate listener
 *
 * Behavioral parity (V.3.10):
 *   - URL is the source of truth (`?page=` query param + optional `id`).
 *   - `navigate()` calls `history.pushState` (NOT full reload like B2F maker).
 *   - popstate re-dispatches based on current URL.
 *   - Default page resolves by role: dealer → dealer; admin → dashboard.
 *
 * Round 3 surface:
 *   - `setupHashRouter({ handlers, defaultPageResolver })` — wires popstate +
 *     stores handler map keyed by page name.
 *   - `goToTab(page, params)` — V.3.10 navigate() wrapper.
 *   - `openLeadDetail(id)` / `openClaimDetail(id)` — sugar for `goToTab('lead', {id})`.
 *   - `back()` — `history.back()` (LIFF in-app browser supports it).
 *   - `getCurrentTab()` — read URL `?page=` (with role-based default).
 *
 * NOTE — naming: V.3.10 calls them "pages" (page=dashboard / lead / claim).
 * Round 3 spec uses "tabs" (goToTab) — these are interchangeable. Internal
 * variable `_handlers` is keyed by page name (lowercase).
 */

const KNOWN_PAGES = [
    "dashboard",
    "dealer",
    "lead",       // lead detail (with id)
    "claim",      // claim detail (with id)
    "leads",      // lead list
    "claims",     // claim list
    "agent",      // agent chat
];

/** @type {Object<string, (params: URLSearchParams) => any>|null} */
let _handlers = null;

/** @type {(() => string)|null} */
let _defaultResolver = null;

/**
 * @typedef {Object} RouterOptions
 * @property {Object<string, (params: URLSearchParams) => any>} handlers
 * @property {() => string} [defaultPageResolver] returns the default page name
 *   when `?page=` is missing. Caller plugs in a role-aware resolver
 *   (e.g. () => role === 'dealer' ? 'dealer' : 'dashboard').
 */

/**
 * Read the current `?page=` query value. Falls back to the default-page
 * resolver (if registered) or "dashboard".
 *
 * @returns {string}
 */
export function getCurrentTab() {
    if (typeof window === "undefined" || !window.location) return _defaultPage();
    const params = new URLSearchParams(window.location.search);
    const p = (params.get("page") || "").trim().toLowerCase();
    if (KNOWN_PAGES.indexOf(p) === -1) return _defaultPage();
    return p;
}

/**
 * Read the current `?id=` query value (used for lead/claim detail).
 *
 * @returns {string}
 */
export function getCurrentId() {
    if (typeof window === "undefined" || !window.location) return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || "";
}

function _defaultPage() {
    if (typeof _defaultResolver === "function") {
        try {
            const v = _defaultResolver();
            if (typeof v === "string" && v) return v;
        } catch {
            /* fall through */
        }
    }
    return "dashboard";
}

/**
 * Build a search string for `pushState`.
 *
 * @param {string} page
 * @param {Object<string,string|number>} [params]
 * @returns {string}
 */
function _buildSearch(page, params) {
    if (typeof window === "undefined" || !window.location) {
        return "?page=" + encodeURIComponent(page);
    }
    const url = new URL(window.location.href);
    url.searchParams.set("page", page);
    // Strip stale id when navigating to a non-detail page; preserve when set.
    if (page !== "lead" && page !== "claim") {
        url.searchParams.delete("id");
    }
    if (params && typeof params === "object") {
        for (const k of Object.keys(params)) {
            const v = params[k];
            if (v === undefined || v === null || v === "") continue;
            url.searchParams.set(k, String(v));
        }
    }
    return url.search; // includes leading "?"
}

/**
 * Navigate to a page. Mirrors V.3.10 `navigate(page, params)`.
 *
 * @param {string} page
 * @param {Object<string,string|number>} [params]
 */
export function goToTab(page, params) {
    if (typeof window === "undefined") return;
    if (KNOWN_PAGES.indexOf(page) === -1) page = _defaultPage();
    const search = _buildSearch(page, params);
    if (window.history && window.history.pushState) {
        window.history.pushState({ page, params: params || null }, "", search);
    }
    _dispatch(page);
}

/**
 * Sugar for `goToTab('lead', { id })`. Mirrors inline V.3.10 calls like
 * `navigate('lead', { id: '...' })` from lead cards / chat bubbles.
 *
 * @param {string|number} id
 */
export function openLeadDetail(id) {
    goToTab("lead", { id });
}

/**
 * Sugar for `goToTab('claim', { id })`.
 *
 * @param {string|number} id
 */
export function openClaimDetail(id) {
    goToTab("claim", { id });
}

/**
 * Browser back. Falls through to dashboard if no history available.
 */
export function back() {
    if (typeof window === "undefined" || !window.history) return;
    if (window.history.length > 1) {
        window.history.back();
    } else {
        goToTab(_defaultPage());
    }
}

/**
 * Internal — fire registered handler for a page.
 *
 * @param {string} page
 */
function _dispatch(page) {
    if (!_handlers) return;
    const fn = _handlers[page];
    if (typeof fn !== "function") return;
    let params;
    try {
        params = new URLSearchParams(
            (typeof window !== "undefined" && window.location && window.location.search) || ""
        );
    } catch {
        params = new URLSearchParams("");
    }
    try {
        fn(params);
    } catch (err) {
        if (typeof console !== "undefined" && console.error) {
            console.error("[liff-ai router] handler threw:", err);
        }
    }
}

/**
 * Wire popstate listener + register page handlers. Idempotent.
 *
 * @param {RouterOptions} options
 */
export function setupHashRouter(options) {
    if (!options || typeof options !== "object") {
        throw new Error("setupHashRouter: options.handlers required");
    }
    _handlers = options.handlers || null;
    _defaultResolver = typeof options.defaultPageResolver === "function"
        ? options.defaultPageResolver
        : null;

    if (typeof window !== "undefined" && window.addEventListener) {
        window.removeEventListener("popstate", _onPopstate);
        window.addEventListener("popstate", _onPopstate);
    }
}

function _onPopstate() {
    const page = getCurrentTab();
    _dispatch(page);
}

/**
 * Test-only — reset module state between Jest cases.
 */
export function _resetRouter() {
    _handlers = null;
    _defaultResolver = null;
    if (typeof window !== "undefined" && window.removeEventListener) {
        window.removeEventListener("popstate", _onPopstate);
    }
}

/**
 * Dispatch initial page on bootstrap. Returns resolved page name.
 *
 * @returns {{ page: string, id: string }}
 */
export function dispatchInitial() {
    const page = getCurrentTab();
    const id = getCurrentId();
    _dispatch(page);
    return { page, id };
}
