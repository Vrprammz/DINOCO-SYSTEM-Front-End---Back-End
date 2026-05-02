/**
 * LIFF AI Frontend — JWT session token storage (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.8
 *   Source location: inline `<script>` block lines 562-566 (var TOKEN/ROLE/AUTH/LINE_UID)
 *
 * Pattern: LIFF AI exchanges LINE id_token → JWT session token via
 *   `POST /liff-ai/v1/auth`, then sends the JWT as `X-LIFF-AI-Token` header
 *   on every subsequent REST call. Inline V.3.8 keeps the JWT in a closure
 *   variable; this module promotes it to `sessionStorage` so:
 *     1. Page reloads inside the LIFF browser don't force re-auth.
 *     2. Renderer code can read it without passing through bootstrap.
 *     3. Tests can inject a fake token via `setSessionToken()`.
 *
 * Security: sessionStorage is per-tab + cleared on close — JWT lifetime is
 *   short-lived (server-side TTL); never persist to localStorage to avoid
 *   stale tokens leaking across LINE app sessions.
 *
 * Thread-safety: single-threaded JS; no locking needed.
 */

const SESSION_KEY = "liff_ai_session";
const ROLE_KEY = "liff_ai_role";
const LINE_UID_KEY = "liff_ai_line_uid";

/**
 * Persist the JWT session token to sessionStorage.
 *
 * @param {string|null|undefined} token
 */
export function setSessionToken(token) {
    if (typeof sessionStorage === "undefined") return;
    if (!token) {
        sessionStorage.removeItem(SESSION_KEY);
        return;
    }
    try {
        sessionStorage.setItem(SESSION_KEY, String(token));
    } catch (_e) {
        // sessionStorage can throw in incognito modes / quota; swallow.
    }
}

/**
 * Read the cached JWT session token (sessionStorage).
 *
 * @returns {string|null}
 */
export function getSessionToken() {
    if (typeof sessionStorage === "undefined") return null;
    try {
        return sessionStorage.getItem(SESSION_KEY);
    } catch (_e) {
        return null;
    }
}

/**
 * Drop all session metadata — call on auth failure / logout.
 */
export function clearSessionToken() {
    if (typeof sessionStorage === "undefined") return;
    try {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(ROLE_KEY);
        sessionStorage.removeItem(LINE_UID_KEY);
    } catch (_e) {
        // ignore
    }
}

/**
 * Persist current role ("admin" | "dealer") for renderer routing.
 *
 * @param {string|null|undefined} role
 */
export function setRole(role) {
    if (typeof sessionStorage === "undefined") return;
    try {
        if (!role) sessionStorage.removeItem(ROLE_KEY);
        else sessionStorage.setItem(ROLE_KEY, String(role));
    } catch (_e) {
        // ignore
    }
}

/**
 * Read cached role.
 *
 * @returns {string|null}
 */
export function getRole() {
    if (typeof sessionStorage === "undefined") return null;
    try {
        return sessionStorage.getItem(ROLE_KEY);
    } catch (_e) {
        return null;
    }
}

/**
 * Persist LINE userId — used by renderer for owner checks (e.g., "my leads").
 *
 * @param {string|null|undefined} uid
 */
export function setLineUid(uid) {
    if (typeof sessionStorage === "undefined") return;
    try {
        if (!uid) sessionStorage.removeItem(LINE_UID_KEY);
        else sessionStorage.setItem(LINE_UID_KEY, String(uid));
    } catch (_e) {
        // ignore
    }
}

/**
 * Read cached LINE userId.
 *
 * @returns {string|null}
 */
export function getLineUid() {
    if (typeof sessionStorage === "undefined") return null;
    try {
        return sessionStorage.getItem(LINE_UID_KEY);
    } catch (_e) {
        return null;
    }
}
