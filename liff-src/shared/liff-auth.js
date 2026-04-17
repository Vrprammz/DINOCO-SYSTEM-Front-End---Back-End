/**
 * LIFF authentication helper — thin wrapper around `initLiff` + backend
 * auth endpoint exchange.
 *
 * Pattern: LIFF returns an ID Token → frontend POSTs it to a namespaced
 * auth endpoint → backend verifies via LINE's `/oauth2/v2.1/verify` →
 * backend returns a short-lived session token (JWT or HMAC).
 *
 * Endpoints by surface:
 *   - B2B      → POST /wp-json/b2b/v1/auth             (X-B2B-Session)
 *   - B2F      → POST /wp-json/b2f/v1/auth-admin       (X-B2F-Token)
 *   - LIFF AI  → POST /wp-json/liff-ai/v1/auth         (X-LIFF-AI-Token)
 *
 * Usage:
 *   import { liffAuth } from "../../shared/liff-auth.js";
 *
 *   const session = await liffAuth({
 *       liffId: window.B2B_LIFF_ID,
 *       authEndpoint: "/wp-json/b2b/v1/auth",
 *   });
 *   if (!session?.authorized) {
 *       showAuthError();
 *       return;
 *   }
 *   // pass session.token to subsequent API calls
 */

import { initLiff } from "./liff-init.js";

/**
 * Run full auth flow: init LIFF SDK → call backend auth endpoint → return
 * session payload.
 *
 * Returns `null` if LIFF redirected to login (caller code should not
 * continue past this). Throws on network / verification failures.
 *
 * @param {Object}  options
 * @param {string}  options.liffId        LIFF application ID
 * @param {string}  options.authEndpoint  Full or absolute auth URL
 * @param {Object}  [options.extra]       Extra body fields (distributor_id, etc.)
 * @param {boolean} [options.withContext] Pass liff.getContext() to backend (default true)
 * @param {number}  [options.timeoutMs]   Fetch timeout (default 20s)
 */
export async function liffAuth({
    liffId,
    authEndpoint,
    extra = {},
    withContext = true,
    timeoutMs = 20000,
} = {}) {
    if (!liffId) {
        throw new Error("liffAuth: `liffId` is required");
    }
    if (!authEndpoint) {
        throw new Error("liffAuth: `authEndpoint` is required");
    }

    const ctx = await initLiff(liffId);
    if (!ctx) return null; // redirected to LINE login

    const payload = {
        id_token: ctx.idToken,
        line_user_id: ctx.profile?.userId || "",
        display_name: ctx.profile?.displayName || "",
        picture_url: ctx.profile?.pictureUrl || "",
        ...extra,
    };

    if (withContext && ctx.context) {
        payload.group_id = ctx.context.groupId || "";
        payload.context_type = ctx.context.type || "";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(authEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            credentials: "same-origin",
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            const err = new Error(
                (data && (data.message || data.code)) ||
                    `Auth failed (HTTP ${res.status})`
            );
            err.status = res.status;
            err.body = data;
            throw err;
        }
        return {
            ...data,
            _liffContext: ctx, // attach profile + isInClient for caller
        };
    } finally {
        clearTimeout(timer);
    }
}
