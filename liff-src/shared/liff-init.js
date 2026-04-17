/**
 * LIFF SDK init + auth context extraction.
 *
 * Usage:
 *   import { initLiff } from "../../shared/liff-init.js";
 *
 *   const ctx = await initLiff(LIFF_ID);
 *   if (ctx.idToken) {
 *     // pass to backend for verify + session token issuance
 *   }
 *
 * Preserves query params via liff.state when redirecting for login
 * (LINE strips query string from deep-links otherwise — see
 * B2B Snippet 4 V.30.4 for original fix).
 */
export async function initLiff(liffId, { withLoginState = true } = {}) {
    if (typeof window === "undefined") {
        throw new Error("LIFF init called in non-browser context");
    }
    if (!window.liff) {
        throw new Error(
            "LIFF SDK not loaded — ensure <script src='https://static.line-scdn.net/liff/edge/2/sdk.js'> is present"
        );
    }

    await window.liff.init({ liffId });

    if (!window.liff.isLoggedIn()) {
        const params = new URLSearchParams(window.location.search);
        const state = withLoginState ? params.toString() : "";
        window.liff.login({ redirectUri: window.location.href });
        // login() redirects — caller code beyond here does not execute
        return null;
    }

    const idToken = window.liff.getIDToken();
    const context = window.liff.getContext();
    let profile = null;
    try {
        profile = await window.liff.getProfile();
    } catch (err) {
        // Profile fetch is non-critical (auth still works via idToken)
        console.warn("[liff-init] getProfile failed:", err);
    }

    return {
        idToken,
        context,
        profile,
        isInClient: window.liff.isInClient(),
        os: window.liff.getOS(),
    };
}

/**
 * Close LIFF window safely (fallback to history.back if outside LINE).
 */
export function closeLiff() {
    if (window.liff && window.liff.isInClient && window.liff.isInClient()) {
        window.liff.closeWindow();
    } else {
        window.history.length > 1 ? window.history.back() : window.close();
    }
}
