/**
 * LIFF authentication helper — thin wrapper around `initLiff` + backend
 * auth endpoint exchange.
 *
 * Pattern: LIFF returns an ID Token → frontend POSTs it to a namespaced
 * auth endpoint → backend verifies via LINE's `/oauth2/v2.1/verify` →
 * backend returns a short-lived session token (JWT or HMAC).
 *
 * Endpoints by surface (verified against production register_rest_route):
 *   - B2B      → POST /wp-json/b2b/v1/auth-group       (X-B2B-Token header)
 *                Requires HMAC params (_sig, _ts, group_id) from LIFF URL.
 *                Caller must pull these from window.location.search and
 *                pass via `extra`. See [B2B] Snippet 3 line 460+ for the
 *                full param list. Without _sig+_ts the endpoint returns
 *                `authorized:false`.
 *   - B2F      → POST /wp-json/b2f/v1/auth-admin       (X-B2F-Token header)
 *                Requires HMAC params (_sig, _ts, optionally _uid) from
 *                LIFF URL. Same pattern as B2B — pass via `extra`.
 *                See [B2F] Snippet 2 line 455+ for handler.
 *   - LIFF AI  → POST /wp-json/liff-ai/v1/auth         (X-LIFF-AI-Token header)
 *                NO HMAC required. id_token + line_user_id is enough.
 *                LIFF AI relies on LINE id_token verify as primary auth.
 *                See [LIFF AI] Snippet 1 line 255+.
 *
 * Default payload (always sent):
 *   id_token, line_user_id, display_name, picture_url
 *   + group_id, context_type when withContext=true (default)
 *
 * Usage (LIFF AI — simple case):
 *   const session = await liffAuth({
 *       liffId: window.LIFF_AI_ID,
 *       authEndpoint: "/wp-json/liff-ai/v1/auth",
 *   });
 *
 * Usage (B2B / B2F — HMAC case, caller forwards URL params):
 *   const url = new URL(window.location.href);
 *   const session = await liffAuth({
 *       liffId: window.B2B_LIFF_ID,
 *       authEndpoint: "/wp-json/b2b/v1/auth-group",
 *       extra: {
 *           _sig: url.searchParams.get("_sig"),
 *           _ts:  url.searchParams.get("_ts"),
 *           group_id: url.searchParams.get("group_id"),
 *       },
 *   });
 *
 * Then pass `session.token` to createB2BApi / createApi as `sessionToken`.
 */

import { initLiff } from "./liff-init.js";

/**
 * Run full auth flow: init LIFF SDK → call backend auth endpoint → return
 * session payload.
 *
 * Returns `null` if LIFF redirected to login (caller code should not
 * continue past this). Throws on network / verification failures.
 *
 * @param {{
 *   liffId?: string,
 *   authEndpoint?: string,
 *   extra?: Record<string, any>,
 *   withContext?: boolean,
 *   timeoutMs?: number,
 * }} [options]
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

    /** @type {Record<string, any>} */
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
