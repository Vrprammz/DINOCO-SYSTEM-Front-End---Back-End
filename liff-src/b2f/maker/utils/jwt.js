/**
 * B2F Maker LIFF — JWT payload reader (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.6
 *   Source location: inline `b2f_liff_page_js()` lines 351-359
 *
 * Reads the payload section of a JWT WITHOUT verifying the signature.
 * The token is verified server-side by `[B2F] Snippet 2` REST handlers
 * before any sensitive action (confirm / reject / deliver). Frontend uses
 * payload only for UX hints (page fallback, maker_currency for L10N).
 *
 * Security: never trust payload fields for authorization decisions —
 * only for display/routing. The server re-validates every claim.
 */

/**
 * Parse the payload section of a JWT.
 * Returns `{}` on any error (malformed token, missing parts, bad base64).
 *
 * @param {string} token
 * @returns {Record<string, any>}
 */
export function jwtPayload(token) {
    if (!token || typeof token !== "string") return {};
    try {
        const parts = token.split(".");
        if (parts.length < 2) return {};
        // base64url → base64
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        // Pad to multiple of 4
        const padded = b64 + "===".slice((b64.length + 3) % 4);
        // atob is browser-only; jsdom supplies it for tests, and in
        // Node-only contexts (build-time tooling) globalThis.Buffer is the
        // fallback. `globalThis` access avoids ESLint no-undef on browser
        // contexts that don't expose Buffer at all.
        let raw;
        if (typeof atob === "function") {
            raw = atob(padded);
        } else if (typeof globalThis !== "undefined" && globalThis.Buffer) {
            raw = globalThis.Buffer.from(padded, "base64").toString("binary");
        } else {
            return {};
        }
        return JSON.parse(raw);
    } catch (_e) {
        return {};
    }
}
