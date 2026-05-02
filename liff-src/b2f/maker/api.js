/**
 * B2F Maker LIFF — REST API wrapper (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *   - lines 641-664: inline `apiCall(method, endpoint, body)` helper
 *
 * Behavioral parity:
 *   - `X-B2F-Token` (JWT) + `X-B2F-Line-Uid` (LINE userId) headers attached
 *     to every request, matching V.4.7 inline `apiCall`.
 *   - GET requests serialize body as URL params (V.4.7 line 653-655).
 *   - POST/PUT/DELETE send JSON body via shared createApi.
 *   - Error message format includes `[METHOD URL]` suffix for parity with
 *     V.4.7 line 661 (used by debug overlays).
 *
 * Round 3 ALSO adds:
 *   - Idempotency-Key auto-attach on mutating endpoints (maker-confirm,
 *     maker-reject, maker-reschedule, maker-deliver). Snippet 2 V.11.x
 *     wraps these via Round 26+ idempotency helper integration. Replays
 *     return the cached response — safe for offline/retry scenarios.
 *   - Maker-specific HTTP error mapping:
 *       401 → re-init LIFF (token expired) — caller-supplied callback
 *       410 → "PO ถูกยกเลิก" user-facing toast
 *       409 → "idempotency_conflict" toast (rare; same key + different body)
 *
 * The wrapper returns named methods (confirmPO, rejectPO, etc.) so loaders
 * can write `api.confirmPO(po_id, payload)` instead of stringly-typed
 * endpoint paths. Keeps the call surface tight + lets us rename endpoints
 * in one place if Snippet 2 ever changes URL shapes.
 */

import { createApi, wpRestUrl } from "../../shared/api-client.js";
import { L } from "./utils/lang.js";

/**
 * @typedef {Object} MakerApiOptions
 * @property {string}  [base]         REST base URL (default `/wp-json/b2f/v1`)
 * @property {string}  [token]        Maker JWT (X-B2F-Token)
 * @property {string}  [lineUid]      LINE userId (X-B2F-Line-Uid)
 * @property {() => Promise<void>|void} [onAuthExpired] callback for 401
 * @property {(msg: string) => void} [onCancelledPO] callback for 410
 * @property {number}  [timeoutMs]    request timeout (default 30s)
 */

/**
 * @typedef {Object} MakerApi
 * @property {(method: string, endpoint: string, body?: any) => Promise<any>} call low-level
 * @property {(po_id: string|number, payload: object) => Promise<any>} confirmPO
 * @property {(po_id: string|number, payload: object) => Promise<any>} rejectPO
 * @property {(po_id: string|number, payload: object) => Promise<any>} reschedulePO
 * @property {(po_id: string|number, payload: object) => Promise<any>} deliverLot
 * @property {(po_id?: string|number) => Promise<any>}                getPODetail
 * @property {(maker_id?: string|number, params?: object) => Promise<any>} getMakerPOList
 */

/**
 * Generate an idempotency key for a request. Falls back to timestamp-based
 * pseudo-UUID when crypto.randomUUID is unavailable (older LINE in-app
 * browsers on Android). Production iOS/modern Android have it.
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
    // Fallback: timestamp + random (sufficient — server treats as opaque).
    const ts = Date.now().toString(36);
    const rnd = Math.random().toString(36).slice(2, 10);
    return ts + "-" + rnd + "-" + ts.slice(-4);
}

/**
 * Create a Maker-scoped REST client.
 *
 * @param {MakerApiOptions} [options]
 * @returns {MakerApi}
 */
export function createMakerApi(options = {}) {
    const base = options.base || wpRestUrl("b2f/v1");
    const token = options.token || null;
    const lineUid = options.lineUid || "";
    const onAuthExpired = options.onAuthExpired || null;
    const onCancelledPO = options.onCancelledPO || null;
    const timeoutMs = options.timeoutMs || 30000;

    // Shared client handles fetch + JSON + timeout. We layer Maker-specific
    // headers + error mapping on top.
    const _api = createApi({
        base,
        token,
        tokenHeader: "X-B2F-Token",
        timeoutMs,
    });

    /**
     * Low-level invoker. Mirrors V.4.7 `apiCall(method, endpoint, body)`.
     *
     * @param {string} method
     * @param {string} endpoint — relative (no leading slash)
     * @param {any} [body]
     * @returns {Promise<any>}
     */
    async function call(method, endpoint, body) {
        const m = (method || "GET").toUpperCase();
        let path = endpoint.startsWith("/") ? endpoint : "/" + endpoint;
        let payload = body;

        // GET semantics: serialize body as query string (V.4.7 line 653-655)
        if (m === "GET" && body && typeof body === "object") {
            const qs = new URLSearchParams(body).toString();
            if (qs) path += (path.indexOf("?") === -1 ? "?" : "&") + qs;
            payload = undefined;
        }

        const extraHeaders = {};
        if (lineUid) extraHeaders["X-B2F-Line-Uid"] = lineUid;

        // Attach idempotency key on mutating maker endpoints (Round 26+
        // helper wraps these in Snippet 2 — safe to send always; ignored
        // when wrapper not active).
        if (m === "POST" && _isMutatingMakerEndpoint(endpoint)) {
            extraHeaders["X-Idempotency-Key"] = newIdempotencyKey();
        }

        try {
            return await _api(m, path, payload, extraHeaders);
        } catch (rawErr) {
            const err = /** @type {Error & {status?: number, body?: any}} */ (
                rawErr || new Error("Request failed")
            );
            const status = err.status;
            // 401 → token expired / signature mismatch — let caller re-init LIFF
            if (status === 401 && typeof onAuthExpired === "function") {
                try {
                    await onAuthExpired();
                } catch {
                    /* swallow — caller decides what to do */
                }
            }
            // 410 → PO was cancelled while user was on the page
            if (status === 410 && typeof onCancelledPO === "function") {
                onCancelledPO(
                    L("PO ถูกยกเลิก", "PO cancelled", "PO已取消")
                );
            }
            // Decorate message with [METHOD url] suffix for parity with V.4.7
            const url = base.replace(/\/$/, "") + path;
            const baseMsg = typeof err.message === "string" ? err.message : "Request failed";
            const decorated = new Error(baseMsg + " [" + m + " " + url + "]");
            decorated.status = status;
            decorated.body = err.body;
            decorated.code = err.body && err.body.code ? String(err.body.code) : undefined;
            // 409 = idempotency_conflict — surface explicit code for callers
            if (status === 409 && decorated.code === "idempotency_conflict") {
                decorated.message = L(
                    "คำสั่งซ้ำ — กรุณาลองใหม่อีกครั้ง",
                    "Duplicate request — please try again",
                    "重复请求 — 请重试"
                );
            }
            throw decorated;
        }
    }

    return {
        call,
        /** POST /maker-confirm — Maker confirms PO with ETA */
        confirmPO: (po_id, payload) =>
            call("POST", "maker-confirm", _withPoId(po_id, payload)),
        /** POST /maker-reject — Maker rejects PO with reason */
        rejectPO: (po_id, payload) =>
            call("POST", "maker-reject", _withPoId(po_id, payload)),
        /** POST /maker-reschedule — Maker requests new delivery date */
        reschedulePO: (po_id, payload) =>
            call("POST", "maker-reschedule", _withPoId(po_id, payload)),
        /** POST /maker-deliver — Maker submits delivery lot */
        deliverLot: (po_id, payload) =>
            call("POST", "maker-deliver", _withPoId(po_id, payload)),
        /** GET /po-detail/jwt — fetch PO via JWT (token-bound, optional po_id) */
        getPODetail: (po_id) => {
            const body = { token: token || "" };
            if (po_id !== undefined && po_id !== null && po_id !== "") {
                body.po_id = String(po_id);
            }
            return call("GET", "po-detail/jwt", body);
        },
        /** GET /maker-po-list — list of POs for Maker (status filter optional) */
        getMakerPOList: (_maker_id, params) => {
            // V.4.7 uses `token` only — `maker_id` resolved server-side from JWT.
            // We accept maker_id arg for symmetry but never send it.
            const body = Object.assign({ token: token || "" }, params || {});
            return call("GET", "maker-po-list", body);
        },
    };
}

/**
 * Endpoints that should carry an idempotency key.
 * Mirrors Round 26+ Snippet 2 V.11.x integration list.
 *
 * @param {string} endpoint
 * @returns {boolean}
 */
function _isMutatingMakerEndpoint(endpoint) {
    const e = endpoint.replace(/^\//, "");
    return (
        e === "maker-confirm" ||
        e === "maker-reject" ||
        e === "maker-reschedule" ||
        e === "maker-deliver"
    );
}

/**
 * Merge po_id into a payload (caller may already have included it).
 *
 * @param {string|number} po_id
 * @param {object} payload
 * @returns {object}
 */
function _withPoId(po_id, payload) {
    const p = Object.assign({}, payload || {});
    if (po_id !== undefined && po_id !== null && po_id !== "" && p.po_id == null) {
        p.po_id = po_id;
    }
    return p;
}
