/**
 * Minimal REST client for DINOCO LIFF frontends.
 *
 * Features:
 * - Automatic header injection (X-LIFF-AI-Token / X-B2F-Token / X-WP-Nonce)
 * - JSON request/response handling
 * - Unified error surface (throws on non-2xx)
 * - Request timeout via AbortController (default 30s)
 *
 * Usage:
 *   import { createApi } from "../../shared/api-client.js";
 *
 *   const api = createApi({
 *     base: "/wp-json/liff-ai/v1",
 *     token: jwtToken,
 *     tokenHeader: "X-LIFF-AI-Token",
 *   });
 *
 *   const leads = await api("GET", "/leads");
 *   const created = await api("POST", "/lead/abc123/status", { status: "qualified" });
 */

export function createApi({
    base,
    token,
    tokenHeader = "X-LIFF-AI-Token",
    nonce = null,
    timeoutMs = 30000,
} = {}) {
    if (!base) {
        throw new Error("createApi: `base` URL is required");
    }

    return async function api(method, path, body, extraHeaders = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const headers = {
            Accept: "application/json",
            ...extraHeaders,
        };

        if (token) {
            headers[tokenHeader] = token;
        }
        if (nonce) {
            headers["X-WP-Nonce"] = nonce;
        }

        const init = {
            method: method.toUpperCase(),
            headers,
            signal: controller.signal,
            credentials: "same-origin",
        };

        if (body !== undefined && body !== null) {
            if (body instanceof FormData) {
                // Let browser set multipart boundary
                init.body = body;
            } else {
                headers["Content-Type"] = "application/json";
                init.body = JSON.stringify(body);
            }
        }

        const url = base.replace(/\/$/, "") + path;

        try {
            const res = await fetch(url, init);
            const text = await res.text();
            let data = null;
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch {
                    data = { raw: text };
                }
            }

            if (!res.ok) {
                const err = new Error(
                    (data && (data.message || data.code)) || `HTTP ${res.status}`
                );
                err.status = res.status;
                err.body = data;
                throw err;
            }
            return data;
        } finally {
            clearTimeout(timer);
        }
    };
}

/**
 * Build full WP REST URL for a namespace.
 */
export function wpRestUrl(namespace) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/wp-json/${namespace.replace(/^\//, "")}`;
}

/**
 * ────────────────────────────────────────────────────────────────
 * B2B E-Catalog specific API helper (V.0.1 pilot — Phase 1 target)
 * ────────────────────────────────────────────────────────────────
 *
 * Wraps `createApi` with named methods for the core customer LIFF
 * endpoints exposed by `[B2B] Snippet 3: LIFF E-Catalog REST API`.
 *
 * When Snippet 4 migration lands, the inline JS will import this
 * helper and drop its ad-hoc fetch calls.
 *
 * Usage:
 *   import { createB2BApi } from "../../shared/api-client.js";
 *
 *   const api = createB2BApi({ sessionToken: window.B2B_TOKEN });
 *   const catalog = await api.getCatalog();
 *   await api.placeOrder({ items, note, source: "liff" });
 *
 * All methods return parsed JSON bodies (never Response objects).
 * Errors throw — caller wraps in try/catch for modal surface.
 */
export function createB2BApi({
    base = wpRestUrl("b2b/v1"),
    sessionToken = null,
    nonce = null,
    timeoutMs = 30000,
} = {}) {
    const api = createApi({
        base,
        token: sessionToken,
        tokenHeader: "X-B2B-Session",
        nonce,
        timeoutMs,
    });

    return {
        _api: api,
        /** GET /catalog — product list + pricing tier resolved server-side */
        getCatalog: () => api("GET", "/catalog"),
        /** GET /history — order history for current distributor */
        getHistory: (params = {}) => {
            const qs = new URLSearchParams(params).toString();
            return api("GET", "/history" + (qs ? `?${qs}` : ""));
        },
        /** POST /place-order — create new order (FSM draft state) */
        placeOrder: (payload) => api("POST", "/place-order", payload),
        /** POST /modify-order — admin-only edit of pending order */
        modifyOrder: (orderId, payload) =>
            api("POST", `/modify-order/${encodeURIComponent(orderId)}`, payload),
        /** POST /cancel-request — customer-initiated cancel (FSM transition) */
        cancelRequest: (orderId, reason = "") =>
            api("POST", `/cancel-request/${encodeURIComponent(orderId)}`, {
                reason,
            }),
        /** GET /ticket/{id} — single order detail */
        getTicket: (orderId) =>
            api("GET", `/ticket/${encodeURIComponent(orderId)}`),
    };
}
