/**
 * B2F Admin LIFF E-Catalog — REST API wrapper (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.15
 *   - inline api(method, endpoint, body) helper line ~600 uses X-B2F-Token
 *   - the maker products endpoint and create-po (line 3153 inline)
 *
 * Endpoints used by the Admin Catalog LIFF (verified against
 * `[B2F] Snippet 2: REST API` V.11.x):
 *   - GET /b2f/v1/makers — maker dropdown
 *   - GET /b2f/v1/maker-products — products list per maker (URL appends
 *     numeric `maker_id`; production route registers `(?P<maker_id>\d+)`)
 *   - POST /b2f/v1/create-po — submit PO
 *   - GET /b2f/v1/po-history — recent POs (Round 4+)
 *
 * NOTE: V.9.11 catalog_map is returned inline as part of the maker-products
 * response payload (key `catalog_map`), not via a separate endpoint. The
 * `getCatalogMap()` helper below is a convenience wrapper that calls the
 * same /maker-products endpoint and extracts the `catalog_map` field.
 *
 * Round 3 layered on top:
 *   - Auto-attach `X-B2F-Token` (admin JWT) via shared createApi.
 *   - Auto-attach `X-Idempotency-Key` on POST /create-po (Snippet 2 V.11.11
 *     wraps via Round 19+ idempotency helper — replays return cached
 *     response. Safe to send always; ignored when wrapper not active).
 *   - Admin-specific HTTP error mapping:
 *       401 → "ไม่มีสิทธิ์ — กรุณา login ใหม่"
 *       409 → "idempotency_conflict" / "DUPLICATE_PO" Thai toast
 *       410 → "PO ถูกยกเลิก" toast (rare; race vs admin cancel)
 *       429 → rate-limit Thai toast (B2F Phase 1 audit BUG-H8)
 *
 * Returns named methods so loaders write `api.createPO(payload)` instead
 * of stringly-typed paths. Reuses shared `createApi` for header/timeout
 * boilerplate; layers Round 3 specifics on top.
 */

import { createApi, wpRestUrl } from "../../shared/api-client.js";

/**
 * @typedef {Object} CatalogApiOptions
 * @property {string}  [base]              REST base (default `/wp-json/b2f/v1`)
 * @property {string}  [token]             Admin JWT (X-B2F-Token)
 * @property {string}  [nonce]             X-WP-Nonce (admin path)
 * @property {() => Promise<void>|void} [onAuthExpired]
 * @property {(msg: string) => void}    [onRateLimit]
 * @property {(msg: string) => void}    [onConflict]
 * @property {(msg: string) => void}    [onCancelledPO]
 * @property {number}  [timeoutMs]    request timeout (default 30s)
 */

/**
 * @typedef {Object} CatalogApi
 * @property {() => Promise<any>}                                          getMakers
 * @property {(makerId: string|number, opts?: { includeVirtual?: boolean }) => Promise<any>} getMakerProducts
 * @property {(makerId: string|number) => Promise<any>}                    getCatalogMap
 * @property {(payload: object) => Promise<any>}                           createPO
 * @property {(makerId: string|number, params?: object) => Promise<any>}   getPOHistory
 * @property {(method: string, endpoint: string, body?: any) => Promise<any>} call
 */

/**
 * Generate an idempotency key (UUID v4 if available, else timestamp+random).
 * Older LINE in-app browsers (Android < 11) lack `crypto.randomUUID`.
 *
 * @returns {string}
 */
function newIdempotencyKey() {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID();
    }
    const ts = Date.now().toString(36);
    const rnd = Math.random().toString(36).slice(2, 10);
    return ts + "-" + rnd + "-" + ts.slice(-4);
}

/**
 * Endpoints that should carry an idempotency key.
 *
 * @param {string} endpoint
 * @returns {boolean}
 */
function _isMutatingCatalogEndpoint(endpoint) {
    const e = endpoint.replace(/^\//, "");
    return e === "create-po" || e === "po-undo-submit";
}

/**
 * Decorate an error with B2F-specific code mapping + fire wired callbacks.
 *
 * @param {Error & {status?: number, body?: any, code?: string}} err
 * @param {{
 *   onAuthExpired?: Function|null,
 *   onRateLimit?: Function|null,
 *   onConflict?: Function|null,
 *   onCancelledPO?: Function|null,
 * }} cbs
 * @returns {Promise<never>}
 */
async function _decorateAndThrow(err, cbs) {
    const status = err.status;
    const code = err.body && err.body.code ? String(err.body.code) : "";

    if (status === 401 && typeof cbs.onAuthExpired === "function") {
        try { await cbs.onAuthExpired(); } catch { /* swallow */ }
    }
    if (status === 410 && typeof cbs.onCancelledPO === "function") {
        try {
            cbs.onCancelledPO("PO ถูกยกเลิก กรุณารีเฟรช");
        } catch { /* swallow */ }
    }
    if (status === 429 && typeof cbs.onRateLimit === "function") {
        try {
            cbs.onRateLimit("ส่งคำสั่งถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");
        } catch { /* swallow */ }
    }
    if (status === 409) {
        let msg = err.message || "Conflict";
        if (code === "idempotency_conflict") {
            msg = "คำสั่งซ้ำ — กรุณาลองใหม่อีกครั้ง";
        } else if (code === "DUPLICATE_PO") {
            msg = "PO ซ้ำกับรายการที่มีอยู่ — กรุณาตรวจสอบ";
        }
        if (typeof cbs.onConflict === "function") {
            try { cbs.onConflict(msg); } catch { /* swallow */ }
        }
        const e2 = /** @type {any} */ (new Error(msg));
        e2.status = status;
        e2.code = code;
        e2.body = err.body;
        throw e2;
    }
    throw err;
}

/**
 * Create a B2F Admin Catalog REST client.
 *
 * @param {CatalogApiOptions} [options]
 * @returns {CatalogApi}
 */
export function createB2FCatalogApi(options = {}) {
    const base = options.base || wpRestUrl("b2f/v1");
    const token = options.token || null;
    const nonce = options.nonce || null;
    const timeoutMs = options.timeoutMs || 30000;

    const _api = createApi({
        base,
        token,
        tokenHeader: "X-B2F-Token",
        nonce,
        timeoutMs,
    });

    const cbs = {
        onAuthExpired: options.onAuthExpired || null,
        onRateLimit: options.onRateLimit || null,
        onConflict: options.onConflict || null,
        onCancelledPO: options.onCancelledPO || null,
    };

    /**
     * Generic invoker.
     *
     * @param {string} method
     * @param {string} endpoint relative path (with or without leading slash)
     * @param {any} [body]
     * @returns {Promise<any>}
     */
    async function call(method, endpoint, body) {
        const m = (method || "GET").toUpperCase();
        const path = endpoint.startsWith("/") ? endpoint : "/" + endpoint;
        const extraHeaders = {};
        if (m !== "GET" && _isMutatingCatalogEndpoint(endpoint)) {
            extraHeaders["X-Idempotency-Key"] = newIdempotencyKey();
        }
        try {
            return await _api(m, path, body, extraHeaders);
        } catch (rawErr) {
            const err = /** @type {Error & {status?: number, body?: any}} */ (
                rawErr || new Error("Request failed")
            );
            await _decorateAndThrow(err, cbs);
            // Unreachable — _decorateAndThrow always throws.
            throw err;
        }
    }

    return {
        call,
        /** GET /makers — list of all active makers */
        getMakers: () => call("GET", "/makers"),
        /**
         * Fetch products + sku_relations + catalog_map (V.9.11 inline) for
         * a maker. Pass `{ includeVirtual: true }` to opt-in V.9.19 virtual
         * SET injection.
         */
        getMakerProducts: (makerId, opts = {}) => {
            const q = opts && opts.includeVirtual ? "?include_virtual=1" : "";
            return call("GET", "/maker-products/" + encodeURIComponent(String(makerId)) + q);
        },
        /**
         * Convenience wrapper — extracts `catalog_map` from the /maker-products
         * response (V.9.11 returns it inline). Round 4 may add caching to
         * avoid the duplicate fetch when used right after getMakerProducts.
         */
        getCatalogMap: async (makerId) => {
            const res = await call(
                "GET",
                "/maker-products/" + encodeURIComponent(String(makerId))
            );
            return (res && res.catalog_map) || {};
        },
        /** POST /create-po — submit new PO with idempotency key */
        createPO: (payload) => call("POST", "/create-po", payload),
        /** GET /po-history — recent POs (server-side filter via maker_id query param) */
        getPOHistory: (makerId, params = {}) => {
            const merged = Object.assign({}, params || {});
            if (makerId !== undefined && makerId !== null && makerId !== "") {
                merged.maker_id = String(makerId);
            }
            const usp = new URLSearchParams(merged).toString();
            const q = usp ? "?" + usp : "";
            return call("GET", "/po-history" + q);
        },
    };
}

/**
 * @returns {string}
 */
export function _newIdempotencyKeyForTests() {
    return newIdempotencyKey();
}
