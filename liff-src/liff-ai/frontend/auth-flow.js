/**
 * LIFF AI — Auth flow (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.10
 *   - lines 695-748: init() — auth exchange + role-based first-page
 *
 * Behavioral parity (V.3.10):
 *   - Exchange LIFF id_token for JWT session via `POST /liff-ai/v1/auth`.
 *   - Cache JWT in sessionStorage (utils/auth.js).
 *   - Resolve role: admin/dealer (response field).
 *   - Surface error via showError when auth fails.
 *
 * Round 3 ALSO adds:
 *   - 401 single-retry pattern: on /auth 401, clear cached token + re-init
 *     LIFF (forces re-login if outside client) + retry once. Second 401 →
 *     showError + return null (caller bails out).
 *
 * Returns the resolved auth state for callers to wire into state.
 */

import { initLiff } from "../../shared/liff-init.js";
import {
    setSessionToken,
    getSessionToken,
    clearSessionToken,
    setRole,
    setLineUid,
} from "./utils/auth.js";
import { showError } from "./utils/dom.js";

/**
 * @typedef {Object} AuthResult
 * @property {string} sessionToken
 * @property {string} role         "admin" | "dealer"
 * @property {string} lineUid
 * @property {string|number|null} distId   distributor id when role=dealer
 * @property {object} raw          full response body
 */

/**
 * Initialize auth — exchange LINE id_token for JWT session token.
 *
 * @param {{ userId?: string, idToken?: string }} ctx — LIFF context (initLiff result)
 * @param {{ auth: (payload: object) => Promise<any> }} api — LIFF AI API
 * @param {{ liffId?: string, sessionToken?: string }} [opts]
 * @returns {Promise<AuthResult|null>}
 */
export async function initAuth(ctx, api, opts = {}) {
    if (!ctx) return null;

    // Step 1 — try cached token first (sessionStorage). When present, skip
    // the /auth round-trip entirely and trust the cached role.
    const cached = opts.sessionToken || getSessionToken();
    if (cached) {
        return {
            sessionToken: cached,
            role: _readCachedRole(),
            lineUid: ctx.userId || "",
            distId: null,
            raw: { cached: true },
        };
    }

    // Step 2 — exchange id_token → JWT.
    const payload = {
        line_user_id: ctx.userId,
        id_token: ctx.idToken,
    };

    let res;
    try {
        res = await api.auth(payload);
    } catch (rawErr) {
        const err = /** @type {Error & {status?: number}} */ (rawErr);
        // 401 retry: clear + re-init LIFF + try once more.
        if (err && err.status === 401 && opts.liffId) {
            try {
                clearSessionToken();
                const newCtx = await initLiff(opts.liffId);
                if (!newCtx) return null;
                res = await api.auth({
                    line_user_id: newCtx.userId,
                    id_token: newCtx.idToken,
                });
                // overwrite ctx for downstream code
                ctx = newCtx;
            } catch (_retryErr) {
                showError(
                    "ไม่สามารถเข้าสู่ระบบได้",
                    "กรุณาลองใหม่ หรือติดต่อแอดมิน"
                );
                return null;
            }
        } else {
            showError(
                "ไม่สามารถเข้าสู่ระบบได้",
                (err && err.message) || "กรุณาลองใหม่ หรือติดต่อแอดมิน"
            );
            return null;
        }
    }

    // Server contract:
    //   200 { success: true, data: { token, role, distributor_id?, ... } }
    //   401/403 throws above
    if (!res || (res.success === false)) {
        showError(
            "ไม่สามารถเข้าสู่ระบบได้",
            (res && res.message) || "ไม่ได้รับ token"
        );
        return null;
    }

    // V.3.10 returns token at top-level OR under data — accept both.
    const data = res.data || res;
    const token = data.token || res.token || "";
    const role = (data.role || res.role || "admin").toString();
    const distId = data.distributor_id || data.dist_id || null;

    if (!token) {
        showError("ไม่สามารถเข้าสู่ระบบได้", "ไม่ได้รับ token");
        return null;
    }

    setSessionToken(token);
    setRole(role);
    if (ctx.userId) setLineUid(ctx.userId);

    return {
        sessionToken: token,
        role,
        lineUid: ctx.userId || "",
        distId,
        raw: res,
    };
}

/**
 * Read cached role from sessionStorage. Defaults to "admin".
 *
 * @returns {string}
 */
function _readCachedRole() {
    if (typeof sessionStorage === "undefined") return "admin";
    try {
        return sessionStorage.getItem("liff_ai_role") || "admin";
    } catch {
        return "admin";
    }
}
