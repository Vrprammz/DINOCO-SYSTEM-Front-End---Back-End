/**
 * LIFF AI — REST API wrapper (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.10
 *   - lines 595-606: inline `api(method, path, body)` helper
 *
 * Behavioral parity (V.3.10):
 *   - `X-LIFF-AI-Token` header attached to every request when token present.
 *   - GET requests serialize body as URL params (V.3.10 line 601-604).
 *   - POST/PUT/DELETE send JSON body.
 *   - Inline V.3.10 returns `r.json()` directly without status check —
 *     the wrapper here adds error mapping (401/409/5xx) on top while
 *     preserving the same successful-response shape `{ success, data, message }`.
 *
 * Round 3 ALSO adds:
 *   - Idempotency-Key auto-attach on mutating endpoints integrated by
 *     Rounds 26/40/42/46/47:
 *       - lead/{id}/accept    (Round 26)
 *       - claim/{id}/status   (Round 40)
 *       - lead/{id}/note      (Round 42)
 *       - lead/{id}/status    (Round 46)
 *       - agent-ask           (Round 47)
 *   - HTTP error mapping:
 *       - 401 → onAuthExpired() callback (caller clears token + re-inits LIFF)
 *       - 409 → preserves `code: 'idempotency_conflict'` so caller can toast
 *       - 5xx → single retry (network blip recovery)
 *
 * Named methods mirror REST endpoints in `[LIFF AI] Snippet 1: REST API` V.1.x.
 */

import { createApi, wpRestUrl } from "../../shared/api-client.js";

/**
 * @typedef {Object} LiffAiApiOptions
 * @property {string}  [base]          REST base URL (default `/wp-json/liff-ai/v1`)
 * @property {string}  [token]         Session JWT (X-LIFF-AI-Token)
 * @property {() => Promise<void>|void} [onAuthExpired] callback for 401
 * @property {(msg: string) => void} [onConflict] callback for 409 idempotency
 * @property {number}  [timeoutMs]     request timeout (default 30s)
 * @property {boolean} [retryOn5xx]    retry once on 5xx (default true)
 */

/**
 * @typedef {Object} LiffAiApi
 * @property {(method: string, endpoint: string, body?: any) => Promise<any>} call
 * @property {(payload: object) => Promise<any>} auth
 * @property {() => Promise<any>} getDashboard
 * @property {() => Promise<any>} getDealerDashboard
 * @property {(filters?: object) => Promise<any>} getLeads
 * @property {(id: string|number) => Promise<any>} getLeadDetail
 * @property {(id: string|number) => Promise<any>} acceptLead
 * @property {(id: string|number, note: string) => Promise<any>} addNote
 * @property {(id: string|number, status: string) => Promise<any>} updateLeadStatus
 * @property {(filters?: object) => Promise<any>} getClaims
 * @property {(id: string|number) => Promise<any>} getClaimDetail
 * @property {(id: string|number, status: string) => Promise<any>} updateClaimStatus
 * @property {(question: string) => Promise<any>} askAgent
 */

/**
 * Generate idempotency key. crypto.randomUUID() preferred; timestamp+random
 * fallback for older LINE in-app browsers (Android 8 / iOS < 14).
 *
 * @returns {string}
 */
function newIdempotencyKey() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    const ts = Date.now().toString(36);
    const rnd = Math.random().toString(36).slice(2, 10);
    return ts + "-" + rnd + "-" + ts.slice(-4);
}

/**
 * Endpoints that are server-side wrapped by Idempotency Helper. Send key
 * always — server ignores when wrapper inactive.
 *
 * @param {string} endpoint
 * @returns {boolean}
 */
function _isMutatingEndpoint(endpoint) {
    const e = endpoint.replace(/^\//, "");
    if (e.indexOf("lead/") === 0) {
        return /^lead\/[^/]+\/(accept|note|status)$/.test(e);
    }
    if (e.indexOf("claim/") === 0) {
        return /^claim\/[^/]+\/status$/.test(e);
    }
    return e === "agent-ask";
}

/**
 * Create a LIFF AI scoped REST client.
 *
 * @param {LiffAiApiOptions} [options]
 * @returns {LiffAiApi}
 */
export function createLiffAiApi(options = {}) {
    const base = options.base || wpRestUrl("liff-ai/v1");
    const token = options.token || null;
    const onAuthExpired = options.onAuthExpired || null;
    const onConflict = options.onConflict || null;
    const timeoutMs = options.timeoutMs || 30000;
    const retryOn5xx = options.retryOn5xx !== false;

    const _api = createApi({
        base,
        token,
        tokenHeader: "X-LIFF-AI-Token",
        timeoutMs,
    });

    /**
     * Low-level invoker. Returns parsed JSON body on success.
     * On auth/conflict/server failures, decorates the error and rethrows.
     *
     * @param {string} method
     * @param {string} endpoint
     * @param {any} [body]
     * @returns {Promise<any>}
     */
    async function call(method, endpoint, body) {
        const m = (method || "GET").toUpperCase();
        let path = endpoint.startsWith("/") ? endpoint : "/" + endpoint;
        let payload = body;

        // GET: serialize body as query string (V.3.10 line 601-604).
        if (m === "GET" && body && typeof body === "object") {
            const qs = new URLSearchParams(body).toString();
            if (qs) path += (path.indexOf("?") === -1 ? "?" : "&") + qs;
            payload = undefined;
        }

        const extraHeaders = {};
        if (m === "POST" && _isMutatingEndpoint(endpoint)) {
            extraHeaders["X-Idempotency-Key"] = newIdempotencyKey();
        }

        const exec = async () => _api(m, path, payload, extraHeaders);

        try {
            return await exec();
        } catch (rawErr) {
            const err = /** @type {Error & {status?: number, body?: any, code?: string, _retried?: boolean}} */ (
                rawErr || new Error("Request failed")
            );
            const status = err.status;

            // 401 → auth expired (token cleared by callback)
            if (status === 401 && typeof onAuthExpired === "function") {
                try {
                    await onAuthExpired();
                } catch {
                    /* swallow */
                }
            }
            // 409 → idempotency conflict surface
            if (status === 409) {
                err.code = (err.body && err.body.code) ? String(err.body.code) : "idempotency_conflict";
                if (typeof onConflict === "function") {
                    onConflict("คำสั่งซ้ำ — กรุณาลองใหม่อีกครั้ง");
                }
            }
            // 5xx → single retry (network blip recovery)
            if (retryOn5xx && status >= 500 && status < 600 && !err._retried) {
                err._retried = true;
                return await exec();
            }
            throw err;
        }
    }

    return {
        call,
        /** POST /auth — exchange LINE id_token for session JWT */
        auth: (payload) => call("POST", "auth", payload),
        /** GET /dashboard — admin dashboard stats */
        getDashboard: () => call("GET", "dashboard"),
        /** GET /dealer-dashboard — dealer dashboard stats */
        getDealerDashboard: () => call("GET", "dealer-dashboard"),
        /** GET /leads — lead list (filter by status etc.) */
        getLeads: (filters) => call("GET", "leads", filters),
        /** GET /lead/{id} — lead detail */
        getLeadDetail: (id) => call("GET", "lead/" + encodeURIComponent(id)),
        /** POST /lead/{id}/accept — dealer accepts lead */
        acceptLead: (id) => call("POST", "lead/" + encodeURIComponent(id) + "/accept"),
        /** POST /lead/{id}/note — add note to lead */
        addNote: (id, note) =>
            call("POST", "lead/" + encodeURIComponent(id) + "/note", { note }),
        /** POST /lead/{id}/status — change lead status (admin) */
        updateLeadStatus: (id, status) =>
            call("POST", "lead/" + encodeURIComponent(id) + "/status", { status }),
        /** GET /claims — claim list */
        getClaims: (filters) => call("GET", "claims", filters),
        /** GET /claim/{id} — claim detail with photos + ai_analysis */
        getClaimDetail: (id) => call("GET", "claim/" + encodeURIComponent(id)),
        /** POST /claim/{id}/status — change claim status */
        updateClaimStatus: (id, status) =>
            call("POST", "claim/" + encodeURIComponent(id) + "/status", { status }),
        /** POST /agent-ask — Phase 3 AI agent question */
        askAgent: (question) => call("POST", "agent-ask", { question }),
    };
}
