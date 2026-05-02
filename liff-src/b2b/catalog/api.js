/**
 * B2B LIFF E-Catalog — REST API wrapper (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   - line 690-707  : `authFetch(url, opts, retries)` — retry-on-network-fail
 *   - line 744-746  : `auth-group` POST handshake
 *   - line 767      : `catalog` GET (post-auth)
 *
 * Endpoints used by the customer LIFF (verified against
 * `[B2B] Snippet 3: LIFF E-Catalog REST API` V.41.x):
 *   - GET  /b2b/v1/catalog            — product list with tier pricing
 *   - GET  /b2b/v1/order-history      — paginated history
 *   - GET  /b2b/v1/order-detail?ticket_id=X — single ticket
 *   - POST /b2b/v1/place-order        — new order OR edit re-issue
 *                                        (when body.edit_ticket > 0,
 *                                        Snippet 3 V.41.x line 1002-1018
 *                                        re-uses the existing post_id)
 *   - POST /b2b/v1/cancel-request     — cancel pending order
 *
 * NOTE: There is NO separate `/modify-order` endpoint in production.
 * Distributor self-edit (V.32.x editMode) flows through place-order
 * with `edit_ticket` body field — Snippet 3 line 1004 detects > 0 and
 * routes to update path. The `modifyOrder()` method below is a thin
 * wrapper that adds `edit_ticket` and calls placeOrder.
 *
 * Round 3 ALSO adds:
 *   - Idempotency-Key auto-attach on mutating endpoints (place-order,
 *     cancel-request). [B2B] Snippet 3 V.42.10 + helper
 *     V.1.0 wrap these — replays return cached response. Safe to send
 *     always; ignored when wrapper not active.
 *   - X-WP-Nonce auto-attach when caller provides `nonce` (admin LIFF
 *     entry path). LINE-bot / customer LIFF uses session token only.
 *   - Customer-specific HTTP error mapping:
 *       401 → re-init LIFF (token expired / signature mismatch)
 *       409 → "idempotency_conflict" / "order_modified" Thai toast
 *       429 → rate-limit Thai toast (Snippet 1 V.33.7 atomic limiter)
 *       503 → maintenance mode Thai toast (auth-group returns 503)
 *
 * Returns named methods so loaders write `api.placeOrder(payload)`
 * instead of stringly-typed paths. Reuses shared `createB2BApi` for
 * the core endpoints; layers Round 3 specifics on top.
 */

import { createApi, createB2BApi, wpRestUrl } from "../../shared/api-client.js";

/**
 * @typedef {Object} CatalogApiOptions
 * @property {string}  [base]              REST base (default `/wp-json/b2b/v1`)
 * @property {string}  [sessionToken]      X-B2B-Token (JWT issued via auth-group)
 * @property {string}  [nonce]             X-WP-Nonce (optional, admin path)
 * @property {() => Promise<void>|void} [onAuthExpired] callback for 401
 * @property {(msg: string) => void}    [onRateLimit]   callback for 429
 * @property {(msg: string) => void}    [onConflict]    callback for 409
 * @property {(msg: string) => void}    [onMaintenance] callback for 503
 * @property {number}  [timeoutMs]    request timeout (default 30s)
 */

/**
 * @typedef {Object} CatalogApi
 * @property {() => Promise<any>}                                      getCatalog
 * @property {(params?: object) => Promise<any>}                       getOrderHistory
 * @property {(orderId: string|number) => Promise<any>}                getOrderDetail
 * @property {(payload: object) => Promise<any>}                       placeOrder
 * @property {(orderId: string|number, reason?: string) => Promise<any>} cancelOrder
 * @property {(orderId: string|number, payload: object) => Promise<any>} modifyOrder
 * @property {(method: string, endpoint: string, body?: any) => Promise<any>} call
 */

/**
 * Generate an idempotency key. Falls back to timestamp+random when
 * crypto.randomUUID is unavailable (older LINE in-app browsers).
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
 * Endpoints that should carry an idempotency key. Mirrors Round 19+
 * Snippet 3 V.42.10 + Snippet 16 wrappers list.
 *
 * @param {string} endpoint
 * @returns {boolean}
 */
function _isMutatingCatalogEndpoint(endpoint) {
    const e = endpoint.replace(/^\//, "");
    return (
        e === "place-order" ||
        e === "cancel-request"
    );
}

/**
 * Decorate an error from `_api(...)` with B2B-specific code mapping +
 * fire any wired callbacks. Always re-throws.
 *
 * @param {Error & {status?: number, body?: any}} err
 * @param {{
 *   onAuthExpired?: Function|null,
 *   onRateLimit?: Function|null,
 *   onConflict?: Function|null,
 *   onMaintenance?: Function|null,
 * }} cbs
 * @returns {Promise<never>}
 */
async function _decorateAndThrow(err, cbs) {
    const status = err.status;
    const code = err.body && err.body.code ? String(err.body.code) : "";

    if (status === 401 && typeof cbs.onAuthExpired === "function") {
        try { await cbs.onAuthExpired(); } catch { /* swallow */ }
    }
    if (status === 429 && typeof cbs.onRateLimit === "function") {
        try {
            cbs.onRateLimit(
                "ส่งคำสั่งถี่เกินไป กรุณารอสักครู่แล้วลองใหม่"
            );
        } catch { /* swallow */ }
    }
    if (status === 503 && typeof cbs.onMaintenance === "function") {
        try {
            cbs.onMaintenance(
                "ระบบกำลังปรับปรุง กรุณาลองใหม่ภายหลัง"
            );
        } catch { /* swallow */ }
    }
    if (status === 409) {
        let msg = err.message || "Conflict";
        if (code === "idempotency_conflict") {
            msg = "คำสั่งซ้ำ — กรุณาลองใหม่อีกครั้ง";
        } else if (code === "order_modified") {
            msg = "ออเดอร์ถูกแก้ไขโดยผู้อื่น กรุณารีเฟรช";
        } else if (code === "stock_changed") {
            msg = "สต็อกเปลี่ยน กรุณาตรวจสอบรายการอีกครั้ง";
        }
        if (typeof cbs.onConflict === "function") {
            try { cbs.onConflict(msg); } catch { /* swallow */ }
        }
        const e2 = new Error(msg);
        e2.status = status;
        e2.code = code;
        e2.body = err.body;
        throw e2;
    }
    throw err;
}

/**
 * Create a B2B Catalog REST client.
 *
 * @param {CatalogApiOptions} [options]
 * @returns {CatalogApi}
 */
export function createB2BCatalogApi(options = {}) {
    const base = options.base || wpRestUrl("b2b/v1");
    const sessionToken = options.sessionToken || null;
    const nonce = options.nonce || null;
    const timeoutMs = options.timeoutMs || 30000;

    // Reuse the shared B2B helper for the 5 core endpoints (it handles
    // the X-B2B-Token + nonce wiring already).
    const _shared = createB2BApi({
        base,
        sessionToken,
        nonce,
        timeoutMs,
    });

    // Low-level invoker for any endpoint not in `_shared` + Round 3
    // header injection (X-Idempotency-Key on mutations).
    const _api = createApi({
        base,
        token: sessionToken,
        tokenHeader: "X-B2B-Token",
        nonce,
        timeoutMs,
    });

    const cbs = {
        onAuthExpired: options.onAuthExpired || null,
        onRateLimit: options.onRateLimit || null,
        onConflict: options.onConflict || null,
        onMaintenance: options.onMaintenance || null,
    };

    /**
     * Generic invoker. Used by the named methods below for endpoints
     * not covered by `createB2BApi` (e.g. modify-order). Caller supplies
     * the relative endpoint path.
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
        }
    }

    /**
     * Wrap a shared method with the same error decoration as `call()`.
     * `_shared.placeOrder()` already attaches token + nonce + JSON, but
     * does NOT add idempotency key (that's Round 3 layered on top), so
     * we re-implement those 3 endpoints below via `call()`.
     *
     * @template T
     * @param {() => Promise<T>} fn
     * @returns {Promise<T>}
     */
    async function _wrap(fn) {
        try {
            return await fn();
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
        /** GET /catalog — product list with tier pricing resolved server-side */
        getCatalog: () => _wrap(() => _shared.getCatalog()),
        /** GET /order-history — paginated history (page, per_page, status) */
        getOrderHistory: (params = {}) => _wrap(() => _shared.getHistory(params)),
        /** GET /order-detail?ticket_id=X — single ticket detail */
        getOrderDetail: (orderId) => _wrap(() => _shared.getTicket(orderId)),
        /**
         * POST /place-order — create new order with idempotency key.
         *
         * Snippet 3 V.42.10 hashes the body for idempotency; replays
         * with the same key + body return the cached response.
         */
        placeOrder: (payload) => call("POST", "/place-order", payload),
        /** POST /cancel-request — customer-initiated cancel */
        cancelOrder: (orderId, reason = "") =>
            call("POST", "/cancel-request", {
                order_id: orderId,
                reason: reason || "",
            }),
        /**
         * Distributor self-edit (V.32.x editMode). Routes through
         * /place-order with `edit_ticket` body field — Snippet 3 V.41.x
         * line 1004 detects > 0 and re-uses existing post_id. NOT a
         * separate REST endpoint despite the method name.
         */
        modifyOrder: (orderId, payload) =>
            call("POST", "/place-order", Object.assign(
                { edit_ticket: orderId },
                payload || {}
            )),
    };
}

/**
 * @returns {string}
 */
export function _newIdempotencyKeyForTests() {
    return newIdempotencyKey();
}
