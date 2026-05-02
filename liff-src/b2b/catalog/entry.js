/**
 * B2B LIFF E-Catalog — Vite entry (V.0.2 Round 1 — foundation port)
 *
 * MIGRATION TARGET: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *
 * Round 1 (V.0.2 — this commit):
 *   ✅ Wiring (Snippet 4 V.32.8 added flag-gated render shell)
 *   ✅ CSS port (`./styles.css` — 335 LOC verbatim from inline)
 *   ✅ 6 utility modules (`./utils/{lang,format,dom,pricing,hierarchy,cart}.js`)
 *   ✅ Foundation bootstrap — wires LIFF auth + offline detection +
 *      exposes a debug surface on `window.DINOCO_B2B_CATALOG`.
 *
 * Round 2+ scope (NOT in this file yet):
 *   ⏳ Page renderers (catalog grid + SET Detail + cart UI + history) —
 *      currently still emitted inline by Snippet 4 V.32.9.
 *   ⏳ Router (tab-switch + URL hash sync).
 *   ⏳ Event delegation — replace inline onclick=".." with data-action="..".
 *
 * Round 5 scope (final cut-over):
 *   ⏳ Drop inline `<script>` block from Snippet 4 once flag has been ON
 *      1 week with no regressions (REG-029 byte-identical preserved
 *      throughout earlier rounds).
 *
 * Production safety: this bundle only loads when wp_option
 * `dinoco_liff_use_vite_b2b_catalog = '1'`. Default OFF — Snippet 4
 * falls back to inline render. Triple safety chain (flag + manifest +
 * `dinoco_liff_enqueue` presence) preserved per V.32.8 wiring.
 */

import "./styles.css";

import { initLiff } from "../../shared/liff-init.js";
import { createB2BApi, wpRestUrl } from "../../shared/api-client.js";
import { liffAuth } from "../../shared/liff-auth.js";

import {
    L,
    setupLanguage,
    getLang,
} from "./utils/lang.js";
import {
    formatNumber,
    formatCurrency,
    formatDate,
    escHtml,
} from "./utils/format.js";
import {
    $,
    $$,
    showToast,
    showAuthError,
    showLinkExpired,
    showLoading,
    hideLoading,
    lockBtn,
    unlockBtn,
    setupOfflineDetection,
} from "./utils/dom.js";
import {
    computeDealerPrice,
    validateMOQ,
    computeBoxes,
} from "./utils/pricing.js";
import {
    getLeafSkus,
    isLeafSku,
    isTopLevelSet,
    computeHierarchyStock,
    getAncestorSkus,
} from "./utils/hierarchy.js";
import {
    loadCart,
    saveCart,
    setCartQty,
    incrCartQty,
    computeItemCount,
    computeTotal,
    toOrderItems,
    detectCartDuplicates,
    clearCart,
    CART_STORAGE_KEY,
} from "./utils/cart.js";

const VERSION = "V.0.2";
const BOOT_MARKER = `[b2b-catalog] Vite bundle loaded (${VERSION} Round 1 — foundation, parallel)`;
console.info(BOOT_MARKER);

/**
 * Bootstrap the B2B catalog Vite bundle.
 *
 * @param {{
 *   liffId?: string,
 *   restUrl?: string,
 *   logoUrl?: string,
 *   nonce?: string,
 *   sessionToken?: string,
 *   authEndpoint?: string,
 * }} [opts]
 */
export async function bootstrap(opts = {}) {
    const { liffId, restUrl, sessionToken, authEndpoint } = opts;
    if (!liffId) {
        console.warn("[b2b-catalog] liffId not provided — skipping init");
        return null;
    }

    setupLanguage();
    setupOfflineDetection();

    // If caller provides an authEndpoint, run the full auth exchange
    // through the shared helper. Otherwise assume sessionToken was
    // injected via PHP bootstrap (via data-config on the root element).
    let session = null;
    if (authEndpoint) {
        session = await liffAuth({ liffId, authEndpoint });
        if (!session) return null; // redirected to login
    } else {
        const ctx = await initLiff(liffId);
        if (!ctx) return null;
        session = { token: sessionToken, _liffContext: ctx };
    }

    const apiBase = restUrl ? restUrl.replace(/\/$/, "") : wpRestUrl("b2b/v1");
    const api = createB2BApi({
        base: apiBase,
        sessionToken: session.token,
    });

    // Cart state (shallow dict — matches inline V.32.9 contract).
    // Round 2 page renderers will read/write through these accessors so
    // we can swap to the shared cart state machine later without
    // refactoring callers.
    let cart = loadCart();

    return {
        version: VERSION,
        session,
        api,
        cart: {
            get state() {
                return cart;
            },
            set: (sku, qty) => {
                cart = setCartQty(cart, sku, qty);
                saveCart(cart);
                return cart;
            },
            incr: (sku, delta) => {
                cart = incrCartQty(cart, sku, delta);
                saveCart(cart);
                return cart;
            },
            clear: () => {
                cart = clearCart();
                saveCart(cart);
                return cart;
            },
            count: () => computeItemCount(cart),
            total: (products) => computeTotal(cart, products),
            toOrder: (products) => toOrderItems(cart, products),
            detectDupes: (products) => detectCartDuplicates(cart, products),
        },
        $,
        $$,
    };
}

/**
 * Read JSON config from `data-config` on the root element. PHP shell
 * (Snippet 4 V.32.8 path) writes:
 *   <div id="b2b-catalog-app" data-config='{"liff_id":"...","rest_url":"..."}'></div>
 *
 * @returns {object|null}
 */
function readMountConfig() {
    if (typeof document === "undefined") return null;
    const root = document.getElementById("b2b-catalog-app");
    if (!root) return null;
    const raw = root.getAttribute("data-config") || "";
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return {
            liffId: parsed.liff_id || parsed.liffId,
            restUrl: parsed.rest_url || parsed.restUrl,
            logoUrl: parsed.logo_url || parsed.logoUrl,
            nonce: parsed.nonce,
            sessionToken: parsed.session_token || parsed.sessionToken,
            authEndpoint: parsed.auth_endpoint || parsed.authEndpoint,
        };
    } catch (err) {
        console.error("[b2b-catalog] data-config parse failed", err);
        return null;
    }
}

// Auto-boot when:
//   (a) explicit window.DINOCO_B2B_CATALOG_BOOT === true (legacy / tests), OR
//   (b) the root mount element exists with a data-config payload (Phase 2
//       Vite Step 2 shell path — Snippet 4 V.32.8 emits this when flag ON).
if (typeof window !== "undefined") {
    const explicit = window.DINOCO_B2B_CATALOG_BOOT === true
        ? (window.DINOCO_B2B_CATALOG_CONFIG || {})
        : null;
    const mounted = readMountConfig();
    const config = explicit || mounted;
    if (config) {
        bootstrap(config).catch((err) =>
            console.error("[b2b-catalog] bootstrap failed", err)
        );
    }
}

// Stable debug surface — Round 2 page renderers (when imported from
// the same bundle) will replace this. Frozen so external callers can
// inspect the version + helpers but not mutate the surface.
if (typeof window !== "undefined") {
    window.DINOCO_B2B_CATALOG = Object.freeze({
        version: VERSION,
        bootstrap,
        // Helpers exposed for the inline-bridge during migration. Round 2
        // page renderers will reach through these to the same exports.
        helpers: Object.freeze({
            // lang
            L, setupLanguage, getLang,
            // format
            formatNumber, formatCurrency, formatDate, escHtml,
            // dom
            showToast, showAuthError, showLinkExpired,
            showLoading, hideLoading, lockBtn, unlockBtn,
            // pricing
            computeDealerPrice, validateMOQ, computeBoxes,
            // hierarchy
            getLeafSkus, isLeafSku, isTopLevelSet,
            computeHierarchyStock, getAncestorSkus,
            // cart
            loadCart, saveCart, setCartQty, incrCartQty,
            computeItemCount, computeTotal, toOrderItems,
            detectCartDuplicates, clearCart, CART_STORAGE_KEY,
        }),
    });
}
