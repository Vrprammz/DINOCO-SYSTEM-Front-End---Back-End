/**
 * B2B LIFF E-Catalog — Vite entry (V.0.4 Round 3 — router + API + loaders)
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
 * Round 3 (V.0.4 — this commit):
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
 * Round 4+ scope (NOT in this file yet):
 *   ⏳ Bridge cleanup — drop legacy `window.goToTab` / `window.openSetDetail`
 *      / `window.handleAddToCart` globals once Snippet 4 V.32.10 cut-over
 *      lands. Replace with event delegation (`data-action="*"`).
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
import { wpRestUrl } from "../../shared/api-client.js";
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

// Round 2 — page renderers (pure HTML-string builders).
import {
    productMatchesModel,
    renderModelCard,
    renderModelRow,
    shouldShowModelLabel,
    renderCategoryCard,
    renderCategoryRow,
    shouldShowCategoryLabel,
    renderHome,
    renderViewState,
    collectCategoriesForModel,
    collectModelsForCategory,
    renderCrossFilterPills,
} from "./pages/home.js";
import {
    filterProducts,
    formatEtaDate,
    renderProductCard,
    renderProducts,
} from "./pages/catalog.js";
import {
    buildB2bStepper,
    renderSetDetailMainStepper,
    updateSetDetailAddBtn,
    renderSetDetailItems,
} from "./pages/setDetail.js";
import {
    HISTORY_FILTERS,
    STATUS_COLORS,
    STATUS_LABELS,
    getStatusColor,
    getStatusLabel,
    renderHistoryFilter,
    renderHistoryCard,
    renderLoadMoreButton,
    renderHistory,
} from "./pages/history.js";
import {
    updateCartBar,
    renderCartModalItem,
    renderCartEmptyState,
    renderCartNoteSection,
    renderCartItems,
    renderRecommendedChips,
} from "./pages/cart.js";

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
    handleOpenSetDetail,
} from "./loaders/catalog.js";
import {
    setupHome,
    loadHome,
    applyModelFilter,
    applyCategoryFilter,
    applyCrossFilter,
    resetFilters,
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
import {
    setupCart,
    loadCartModal,
    handleSubmitOrder,
    handleCartItemRemove,
    getCartTotals,
} from "./loaders/cart.js";

const VERSION = "V.0.4";
const BOOT_MARKER = `[b2b-catalog] Vite bundle loaded (${VERSION} Round 3 — router + API + loaders)`;
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
// Legacy-bridge globals (Round 3 — Round 4 will drop these in favor of
// data-action event delegation). Inline V.32.9 already uses
// `data-action="*"` for the product grid; the globals below let other
// parts of the inline script (cart bar / order history filter chips)
// call into the Vite loaders by name during the parallel phase.
// ─────────────────────────────────────────────────────────────────────
if (typeof window !== "undefined") {
    /** @type {any} */
    const w = window;
    w.B2B_CATALOG_GO_TO_TAB = goToTab;
    w.B2B_CATALOG_OPEN_SET_DETAIL = openSetDetail;
    w.B2B_CATALOG_CLOSE_SET_DETAIL = closeSetDetail;
    w.B2B_CATALOG_ADD_TO_CART = handleAddToCart;
    w.B2B_CATALOG_INCREMENT = handleIncrement;
    w.B2B_CATALOG_DECREMENT = handleDecrement;
    w.B2B_CATALOG_HISTORY_FILTER = handleHistoryFilter;
    w.B2B_CATALOG_LOAD_MORE = handleLoadMore;
    w.B2B_CATALOG_SUBMIT_ORDER = handleSubmitOrder;
    w.B2B_CATALOG_CART_REMOVE = handleCartItemRemove;
    w.B2B_CATALOG_ADD_SET = handleAddSet;
    w.B2B_CATALOG_SUB_STEP = handleSubItemStep;
}

// Stable debug surface — extends Round 1+2 helpers with Round 3 router
// + API + loaders. Frozen so external callers can inspect the version
// + helpers but not mutate the surface.
if (typeof window !== "undefined") {
    window.DINOCO_B2B_CATALOG = Object.freeze({
        version: VERSION,
        bootstrap,
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
        // Round 2 — page renderers.
        renderers: Object.freeze({
            // home
            productMatchesModel, renderModelCard, renderModelRow,
            shouldShowModelLabel, renderCategoryCard, renderCategoryRow,
            shouldShowCategoryLabel, renderHome, renderViewState,
            collectCategoriesForModel, collectModelsForCategory,
            renderCrossFilterPills,
            // catalog
            filterProducts, formatEtaDate, renderProductCard, renderProducts,
            // SET Detail
            buildB2bStepper, renderSetDetailMainStepper,
            updateSetDetailAddBtn, renderSetDetailItems,
            // history
            HISTORY_FILTERS, STATUS_COLORS, STATUS_LABELS,
            getStatusColor, getStatusLabel, renderHistoryFilter,
            renderHistoryCard, renderLoadMoreButton, renderHistory,
            // cart
            updateCartBar, renderCartModalItem, renderCartEmptyState,
            renderCartNoteSection, renderCartItems, renderRecommendedChips,
        }),
        // Round 3 — router + API + loaders.
        router: Object.freeze({
            getCurrentTab, getCurrentSetSku, isSetDetailOpen,
            goToTab, openSetDetail, closeSetDetail,
            back: routerBack, setupHashRouter, dispatchInitial,
        }),
        api: Object.freeze({ createB2BCatalogApi }),
        loaders: Object.freeze({
            // catalog
            setupCatalog, loadCatalog, renderCatalog,
            handleAddToCart, handleIncrement, handleDecrement,
            handleOpenSetDetail,
            // home
            setupHome, loadHome,
            applyModelFilter, applyCategoryFilter,
            applyCrossFilter, resetFilters,
            // history
            setupHistory, loadHistory,
            handleHistoryFilter, handleLoadMore, handleCancelOrder,
            // SET Detail
            setupSetDetail, loadSetDetail,
            handleAddSet, handleSubItemStep,
            // cart
            setupCart, loadCartModal,
            handleSubmitOrder, handleCartItemRemove, getCartTotals,
        }),
    });
}
