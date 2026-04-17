/**
 * B2B LIFF E-Catalog — Vite entry point (V.0.1 pilot)
 *
 * ⚠️ PARALLEL RENDERING ACTIVE — do NOT assume this bundle ships to prod yet.
 *
 * Migration target: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.6
 *   The snippet still emits inline <style> + <script> via PHP echo.
 *   This bundle is a **scaffold** for the future wp_enqueue_script path.
 *
 * Pilot smoke test:
 *   - Imports token + base CSS so Vite emits a CSS chunk (verifies
 *     postcss + CSS pipeline end-to-end).
 *   - Imports shared helpers (api-client / cart / liff-auth) to validate
 *     module graph resolution + tree-shaking.
 *   - Does NOT call any network / DOM / LIFF APIs unless
 *     `window.DINOCO_B2B_CATALOG_BOOT === true`.
 *
 * Phase 1 migration plan (see `liff-src/README.md`):
 *   1. Move inline <script> renderer functions from Snippet 4 into this
 *      file, keeping the exact same CSS selectors + DOM structure.
 *   2. Add `wp_enqueue_script('dinoco-b2b-catalog', ...)` call inside
 *      Snippet 4's `template_redirect` handler, guarded by
 *      `dinoco_liff_enqueue('b2b-catalog')` — returns false if manifest
 *      missing → falls back to inline.
 *   3. Soak for 1 week, measure LCP, then drop inline emission.
 */

// ── CSS (extracted tokens + base reset — Snippet 4 V.32.6 subset) ──
import "./tokens.css";
import "./base.css";

// ── Shared helpers (tree-shaken — only used symbols retained) ──
import { initLiff } from "../../shared/liff-init.js";
import { createB2BApi, wpRestUrl } from "../../shared/api-client.js";
import { liffAuth } from "../../shared/liff-auth.js";
import {
    createCart,
    addToCart,
    setCartQty,
    removeFromCart,
    computeTotal,
    computeItemCount,
    toOrderItems,
    saveCartToStorage,
    loadCartFromStorage,
} from "../../shared/cart.js";
import { modal } from "../../shared/modal.js";

const BOOT_MARKER = "[b2b-catalog] Vite bundle loaded (V.0.1 pilot — parallel)";
console.info(BOOT_MARKER);

/**
 * Full bootstrap (Phase 1 target — currently gated behind explicit flag
 * to avoid clashing with inline renderer in Snippet 4).
 */
export async function bootstrap({ liffId, sessionToken, authEndpoint } = {}) {
    if (!liffId) {
        console.warn("[b2b-catalog] liffId not provided — skipping init");
        return null;
    }

    // If caller provides an authEndpoint, run full auth exchange.
    // Otherwise assume sessionToken was injected by PHP bootstrap.
    let session = null;
    if (authEndpoint) {
        session = await liffAuth({ liffId, authEndpoint });
        if (!session) return null; // redirected to login
    } else {
        const ctx = await initLiff(liffId);
        if (!ctx) return null;
        session = { token: sessionToken, _liffContext: ctx };
    }

    const api = createB2BApi({
        base: wpRestUrl("b2b/v1"),
        sessionToken: session.token,
    });

    // Restore persisted cart (localStorage) — safe no-op if empty.
    const cartKey = "b2b_cart_v1";
    let cart = loadCartFromStorage(cartKey);

    return {
        session,
        api,
        modal,
        // Cart facade bound to closure state (immutable state pattern —
        // each mutation returns a new object, then we save + replace ref).
        cart: {
            get state() {
                return cart;
            },
            add: (sku, qty, meta) => {
                cart = addToCart(cart, sku, qty, meta);
                saveCartToStorage(cartKey, cart);
                return cart;
            },
            set: (sku, qty, meta) => {
                cart = setCartQty(cart, sku, qty, meta);
                saveCartToStorage(cartKey, cart);
                return cart;
            },
            remove: (sku) => {
                cart = removeFromCart(cart, sku);
                saveCartToStorage(cartKey, cart);
                return cart;
            },
            clear: () => {
                cart = createCart();
                saveCartToStorage(cartKey, cart);
                return cart;
            },
            total: (priceMap) => computeTotal(cart, priceMap),
            count: () => computeItemCount(cart),
            toOrder: () => toOrderItems(cart),
        },
    };
}

// Opt-in auto-boot: only if PHP explicitly sets the flag (prevents
// accidental double-rendering while inline renderer is still active).
if (typeof window !== "undefined" && window.DINOCO_B2B_CATALOG_BOOT === true) {
    bootstrap(window.DINOCO_B2B_CATALOG_CONFIG || {}).catch((err) =>
        console.error("[b2b-catalog] bootstrap failed", err)
    );
}

// Export surface for future inline-bridge during migration (PHP can
// stash the bundle's exports on `window.DINOCO_B2B_CATALOG` for
// gradual cutover — call helpers from legacy inline code).
if (typeof window !== "undefined") {
    window.DINOCO_B2B_CATALOG = Object.freeze({
        version: "V.0.1",
        bootstrap,
        helpers: {
            createCart,
            addToCart,
            setCartQty,
            removeFromCart,
            computeTotal,
            computeItemCount,
            toOrderItems,
        },
    });
}
