/**
 * B2B LIFF E-Catalog — Vite entry (V.0.5 Round 4 — inline-bridge cleanup)
 *
 * MIGRATION TARGET: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *
 * Round 1 (V.0.2):
 *   ✅ Wiring (Snippet 4 V.32.8 added flag-gated render shell)
 *   ✅ CSS port (`./styles.css` — 335 LOC verbatim from inline)
 *   ✅ 6 utility modules (`./utils/{lang,format,dom,pricing,hierarchy,cart}.js`)
 *   ✅ Foundation bootstrap — wires LIFF auth + offline detection +
 *      exposes a debug surface on `window.DINOCO_B2B_CATALOG`.
 *
 * Round 2 (V.0.3):
 *   ✅ 5 page modules under `./pages/` — pure HTML-string builders.
 *
 * Round 3 (V.0.4):
 *   ✅ Router (`./router.js`) — hash-based navigation:
 *      • getCurrentTab / getCurrentSetSku / goToTab / openSetDetail /
 *        closeSetDetail / back / setupHashRouter / dispatchInitial
 *      • Hash format `#detail-<sku>` matches inline V.32.9 line 1187.
 *   ✅ B2B API wrapper (`./api.js`) — `createB2BCatalogApi()`:
 *      • Wraps shared createB2BApi + adds X-Idempotency-Key on
 *        place-order / cancel-request / modify-order.
 *      • Maps 401/409/429/503 → wired callbacks for global toasts.
 *   ✅ 5 page loaders under `./loaders/`:
 *      • catalog.js  — loadCatalog + add-to-cart + stepper increments
 *      • home.js     — loadHome + model/category drilldown
 *      • history.js  — loadHistory + filter chips + load more
 *      • setDetail.js— loadSetDetail + handleAddSet (V.32.1 dup guard)
 *      • cart.js     — loadCartModal + handleSubmitOrder (place/modify)
 *
 * Round 4 (V.0.5 — this commit):
 *   ✅ Event delegation — `setupEventDelegation(rootEl)` listens on
 *      `#b2b-catalog-app` for click + change events bubbling up from
 *      `[data-action]` (and legacy `data-stepact` / `data-rmsku` /
 *      `data-cancel` / `data-reorder` / `data-claim` for V.32.9 parity)
 *      and dispatches to imported handlers.
 *   ✅ Pages already emit declarative attributes (Round 2 onward) — no
 *      page-source changes needed for the dispatcher.
 *   ✅ Drop 12 legacy `window.B2B_CATALOG_*` bridge globals — entry.js
 *      now owns full bootstrap autonomously when the flag is flipped ON.
 *   ✅ Drop `helpers` + `renderers` + `loaders` parallel surfaces from
 *      `window.DINOCO_B2B_CATALOG` — single namespaced debug surface
 *      kept (router + api factory only) for console testing parity with
 *      B2F Maker V.0.5.
 *
 * Round 5+ scope (NOT in this file yet):
 *   ⏳ Production canary cutover — drop inline `b2b_liff_js()` from
 *      Snippet 4 once flag has been ON 1 week with no regressions
 *      (REG-029 byte-identical preserved throughout earlier rounds).
 *
 * Production safety: this bundle only loads when wp_option
 * `dinoco_liff_use_vite_b2b_catalog = '1'`. Default OFF — Snippet 4
 * falls back to inline render. Triple safety chain (flag + manifest +
 * `dinoco_liff_enqueue` presence) preserved per V.32.8 wiring.
 */

import "./styles.css";

import { initLiff } from "../../shared/liff-init.js";
import { wpRestUrl } from "../../shared/api-client.js";
import { liffAuth } from "../../shared/liff-auth.js";

import { setupLanguage } from "./utils/lang.js";
import {
    $,
    $$,
    showToast,
    showAuthError,
    setupOfflineDetection,
} from "./utils/dom.js";
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
} from "./utils/cart.js";

// Round 3 — router + API wrapper + 5 page loaders.
import {
    getCurrentTab,
    getCurrentSetSku,
    isSetDetailOpen,
    goToTab,
    openSetDetail,
    closeSetDetail,
    back as routerBack,
    setupHashRouter,
    dispatchInitial,
} from "./router.js";
import { createB2BCatalogApi } from "./api.js";
import {
    setupCatalog,
    loadCatalog,
    renderCatalog,
    handleAddToCart,
    handleIncrement,
    handleDecrement,
} from "./loaders/catalog.js";
import {
    setupHome,
    loadHome,
    applyModelFilter,
    applyCategoryFilter,
    applyCrossFilter,
} from "./loaders/home.js";
import {
    setupHistory,
    loadHistory,
    handleHistoryFilter,
    handleLoadMore,
    handleCancelOrder,
} from "./loaders/history.js";
import {
    setupSetDetail,
    loadSetDetail,
    handleAddSet,
    handleSubItemStep,
    handleClose as handleSetDetailClose,
} from "./loaders/setDetail.js";
import { setupCart, handleCartItemRemove } from "./loaders/cart.js";

import { setupEventDelegation } from "./event-delegation.js";

const VERSION = "V.0.5";
const BOOT_MARKER = `[b2b-catalog] Vite bundle loaded (${VERSION} Round 4 — inline-bridge cleanup)`;
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
 *   gid?: string,
 *   editTicket?: number,
 *   useHashApi?: boolean,
 * }} [opts]
 */
export async function bootstrap(opts = {}) {
    const { liffId, restUrl, sessionToken, authEndpoint, nonce } = opts;
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

    // Round 3 — instantiate the catalog API wrapper. Wires global error
    // toasts via showToast/showAuthError so loaders don't have to.
    const api = createB2BCatalogApi({
        base: apiBase,
        sessionToken: session.token,
        nonce: nonce || null,
        onAuthExpired: async () => {
            // Token expired — re-init LIFF (LINE bot pushes fresh URL
            // when user taps the next chat link). Inline V.32.9 line
            // 738-741 takes the same approach.
            showAuthError(
                "เซสชันหมดอายุ",
                "กรุณาปิดแล้วเปิดลิงก์ใหม่",
                false
            );
        },
        onRateLimit: (msg) => showToast(msg),
        onConflict: (msg) => showToast(msg),
        onMaintenance: (msg) =>
            showAuthError(
                "ระบบกำลังปรับปรุง",
                msg || "กรุณาลองใหม่ภายหลัง",
                true
            ),
    });

    // Shared cart dict (matches inline V.32.9 contract — shallow {sku: qty}).
    const initialCart = loadCart();

    /** @type {object} */
    const state = {
        products: [],
        cart: initialCart,
        viewMode: "home",
        searchQuery: "",
        homeSearchQuery: "",
        filterModel: "",
        filterCategory: "",
        crossFilter: "",
        modelImageMap: {},
        modelOrder: [],
        categoryOrder: [],
        historyFilter: "",
        historyPage: 1,
        historyTotalPages: 1,
        historyItems: [],
        editMode: false,
        editTicket: opts.editTicket || 0,
        gid: opts.gid || "",
    };

    // Wire all 5 loaders. Order matters — catalog re-render hook depends
    // on home loader being wired so applyModelFilter can call
    // renderCatalog().
    setupCatalog({
        api,
        state,
        onOpenSetDetail: (sku, product) => openSetDetail(sku, product),
    });
    setupHome({
        api,
        state,
        onCatalogRender: () => renderCatalog(),
    });
    setupHistory({ api, state });
    setupSetDetail({
        state,
        onClose: () => goToTab("catalog", { silent: true }),
    });
    setupCart({
        api,
        state,
        liff:
            typeof window !== "undefined" && window.liff
                ? window.liff
                : null,
        onSuccess: () => {
            // After place-order success, clear edit mode.
            state.editMode = false;
            state.editTicket = 0;
        },
    });

    // Wire the hash-based router. The `useHashApi` flag controls whether
    // we own navigation (Round 3 tests + future Round 5 cut-over) or let
    // inline V.32.9 own it (current production path with flag OFF). When
    // the bundle is loaded behind the flag-gated render shell, the inline
    // path is dormant — useHashApi defaults TRUE here.
    const useHashApi = opts.useHashApi !== false;
    setupHashRouter({
        useHashApi,
        handlers: {
            catalog: () => loadCatalog(),
            home: () => loadHome(),
            history: () => loadHistory(),
            setDetail: (sku) => loadSetDetail(sku),
            closeSetDetail: () => handleSetDetailClose(),
        },
    });

    // Initial dispatch — fire the handler matching the URL the user
    // landed on. Defaults to catalog/home when hash absent.
    if (useHashApi) {
        dispatchInitial();
    }

    // ── Round 4: Event delegation wiring ────────────────────────────────
    // Listen on the mount root for click + change events bubbling up
    // from [data-action] / [data-stepact] / [data-rmsku] etc. — replaces
    // the legacy `window.B2B_CATALOG_*` bridge globals from V.0.4.
    let detachDelegation = null;
    if (typeof document !== "undefined") {
        const root = document.getElementById("b2b-catalog-app");
        if (root) {
            detachDelegation = setupEventDelegation(root, {
                goTab: goToTab,
                openSetDetail: (sku) => openSetDetail(sku),
                addToCart: (sku, qty) => handleAddToCart(sku, qty || 1),
                increment: (sku) => handleIncrement(sku, 1),
                decrement: (sku) => handleDecrement(sku),
                removeFromCart: (sku) => handleCartItemRemove(sku),
                setHistoryFilter: (key) => handleHistoryFilter(key),
                loadMore: () => handleLoadMore(),
                setModelView: (name) => applyModelFilter(name),
                setCategoryView: (name) => applyCategoryFilter(name),
                setCrossFilter: (value) => applyCrossFilter(value),
                cancelOrder: (id) => handleCancelOrder(id),
                reorder: (/** @type {string} */ id) => {
                    // V.32.9 inline reorder = navigate back to catalog
                    // with state.editTicket set. Surface remains owned
                    // by inline JS until Round 5 cut-over — emit a
                    // window event so the caller can handle it.
                    if (typeof window !== "undefined") {
                        window.dispatchEvent(
                            new CustomEvent("b2b-catalog:reorder", {
                                detail: { id },
                            })
                        );
                    }
                },
                openClaim: (/** @type {string} */ id) => {
                    if (typeof window !== "undefined") {
                        window.dispatchEvent(
                            new CustomEvent("b2b-catalog:claim", {
                                detail: { id },
                            })
                        );
                    }
                },
                openTicket: (url) => {
                    if (url && typeof window !== "undefined") {
                        window.location.href = url;
                    }
                },
                addSet: (sku, qty) => handleAddSet(sku, qty || 1),
                subItemStep: (sku, dir) =>
                    handleSubItemStep(sku, dir === "minus" ? -1 : 1),
                subItemReveal: (sku) => {
                    // Parity with V.32.9 line ~1410 — first reveal +
                    // immediate add 1. Loader does both.
                    handleAddToCart(sku, 1);
                },
                stepperInput: (/** @type {string} */ _sku, /** @type {number} */ _val) => {
                    // V.32.9 inline updates the input value in place
                    // (no state mutation needed) — re-rendering happens
                    // on add. We accept the call for telemetry parity
                    // but intentionally leave the DOM untouched here.
                },
                back: () => routerBack(),
            });
        }
    }

    return {
        version: VERSION,
        session,
        api,
        state,
        cart: {
            get state() {
                return state.cart;
            },
            set: (sku, qty) => {
                state.cart = setCartQty(state.cart, sku, qty);
                saveCart(state.cart);
                return state.cart;
            },
            incr: (sku, delta) => {
                state.cart = incrCartQty(state.cart, sku, delta);
                saveCart(state.cart);
                return state.cart;
            },
            clear: () => {
                state.cart = clearCart();
                saveCart(state.cart);
                return state.cart;
            },
            count: () => computeItemCount(state.cart),
            total: () => computeTotal(state.cart, state.products),
            toOrder: () => toOrderItems(state.cart, state.products),
            detectDupes: () => detectCartDuplicates(state.cart, state.products),
        },
        router: {
            goToTab,
            openSetDetail,
            closeSetDetail,
            back: routerBack,
            getCurrentTab,
            getCurrentSetSku,
            isSetDetailOpen,
        },
        $, $$,
        detachDelegation,
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
            gid: parsed.gid || "",
            editTicket: parsed.edit_ticket || parsed.editTicket || 0,
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

// ─────────────────────────────────────────────────────────────────────
// Round 4 (V.0.5): Single namespaced debug surface — frozen, minimal.
//
// Removed (vs V.0.4):
//   - 12 `window.B2B_CATALOG_*` legacy bridge globals
//   - `helpers` / `renderers` / `loaders` parallel surfaces on
//     `window.DINOCO_B2B_CATALOG` — those existed for the parallel-render
//     phase. Round 4 owns rendering autonomously via event delegation;
//     external callers should `import` from the bundle directly.
//
// Kept (for console testing parity with B2F Maker V.0.5):
//   - version
//   - bootstrap (re-bootstrap, e.g. for tests)
//   - router (read-only navigation helpers)
//   - api factory (createB2BCatalogApi)
// ─────────────────────────────────────────────────────────────────────
if (typeof window !== "undefined") {
    window.DINOCO_B2B_CATALOG = Object.freeze({
        version: VERSION,
        bootstrap,
        router: Object.freeze({
            getCurrentTab,
            getCurrentSetSku,
            isSetDetailOpen,
            goToTab,
            openSetDetail,
            closeSetDetail,
            back: routerBack,
            setupHashRouter,
            dispatchInitial,
        }),
        api: Object.freeze({ createB2BCatalogApi }),
    });
}
