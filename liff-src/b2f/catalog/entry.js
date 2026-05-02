/**
 * B2F LIFF Admin E-Catalog — Vite entry (V.0.5 Round 4 event delegation)
 *
 * MIGRATION TARGET: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.15+
 *
 * Round 4 (V.0.5 — this commit):
 *   ✅ Event delegation via `./event-delegation.js` — single click +
 *      change listener on `#b2f-catalog-app` dispatches via [data-action]
 *      / [data-stepact] / [data-subaddsku] / [data-bucket-tab] taxonomy.
 *   ✅ Legacy bridge globals dropped:
 *      • `window.DINOCO_B2F_CATALOG_NAV` (router + handler bag) — REMOVED
 *      • `window.DINOCO_B2F_CATALOG_RENDERERS` (renderer bag) — REMOVED
 *      Only `window.DINOCO_B2F_CATALOG` remains as a frozen debug surface.
 *   ✅ Maker-card imperative `addEventListener` removed (loaders/makerHome
 *      V.0.5) — picker now emits `data-action="pick-maker"` consumed by
 *      the central listener.
 *   ✅ Drift detector tests — source-level grep verifies pages emit
 *      `data-action` (no inline `onclick=`) + entry.js does not assign
 *      legacy globals.
 *
 * Round 2 (V.0.3 — earlier commit):
 *   ✅ 5 page-renderer modules under `./pages/`:
 *      • ./pages/catalog.js     — renderProducts + renderProductCard
 *                                  (V.7.0 3-card variants + V.6.6 fallback +
 *                                   LCP `fetchpriority="high"` + virtual badge)
 *      • ./pages/setDetail.js   — renderSetDetailItems + renderSetDetailMainStepper
 *                                  + buildQtyStepperHtml (DD-3 shared-leaf safe)
 *      • ./pages/cart.js        — renderCartItems + renderCartManufacturingSummary
 *                                  + buildCartItemThumbHtml (V.7.0 dual-section)
 *      • ./pages/reviewGate.js  — renderReviewGate (V.7.11 a11y tabs pattern)
 *      • ./pages/filters.js     — renderModelFilter + renderTypeChips +
 *                                  applyVisibilityFilters
 *
 *   Pure HTML builders — no DOM mutation, no event binding (Round 3 will
 *   wire event delegation via `data-*` attributes).
 *
 * Round 1 (V.0.2 — previous commit):
 *   ✅ CSS port (`./styles.css` — ~800 LOC verbatim from inline style block)
 *   ✅ 6 utility modules:
 *      • ./utils/lang.js       — re-exports B2F Maker lang (TH/EN/ZH per
 *                                 maker currency) — single source of truth
 *      • ./utils/format.js     — multi-currency formatNumber/formatCurrency
 *                                 + escHtml + currencySymbol/currencyNameEn
 *      • ./utils/dom.js        — $, $$, showToast, showAuthError,
 *                                 showLoading, lockBtn/unlockBtn,
 *                                 setupOfflineDetection
 *      • ./utils/cart.js       — V.7.0 schema cart `b2f_cart_v7_<maker_id>`
 *                                 + 30-day TTL + schema validation +
 *                                 deriveOrderMode/orderModeLabel/badgeClass
 *      • ./utils/hierarchy.js  — re-exports B2B catalog leaf/SET/stock
 *                                 + adds collectModelsWithDescendants,
 *                                 productMatchesModel, buildHierarchyLookup,
 *                                 countTopSetsForProduct, isVirtualSet
 *      • ./utils/badges.js     — V.7.0 mode badges (purple/amber/gray) +
 *                                 hierarchy badges + virtual SET amber +
 *                                 unconfirmed pill
 *   ✅ bootstrap() — wires LIFF auth + offline detection + lang + exposes
 *      a debug surface on `window.DINOCO_B2F_CATALOG`.
 *
 * Round 3+ scope (NOT in this file yet):
 *   ⏳ Hash router (`./router.js`) — `#detail-<sku>` parity with V.7.14.
 *   ⏳ Page loaders (`./loaders/`) — load makers / products / submit PO.
 *   ⏳ Event delegation (`./event-delegation.js`) — wires data-* attrs.
 *   ⏳ Maker home + success screen renderers.
 *
 * Production safety: this bundle only loads when wp_option
 * `dinoco_liff_use_vite_b2f_catalog = '1'`. Default OFF — Snippet 8 V.7.13
 * falls through to the inline render (REG-029 byte-identical preserved).
 * Triple safety chain (flag + manifest + `dinoco_liff_enqueue` presence).
 */

import "./styles.css";

import { initLiff } from "../../shared/liff-init.js";
import { wpRestUrl } from "../../shared/api-client.js";
import { modal } from "../../shared/modal.js";

import { setupLanguage, L, getLang } from "./utils/lang.js";
import {
    $,
    $$,
    showToast,
    showAuthError,
    showLoading,
    hideLoading,
    lockBtn,
    unlockBtn,
    setupOfflineDetection,
    isLocked,
} from "./utils/dom.js";
import {
    formatNumber,
    formatCurrency,
    formatDate,
    escHtml,
    currencySymbol,
    currencyNameEn,
} from "./utils/format.js";
import {
    loadCart,
    saveCart,
    clearCart,
    setCartQty,
    deriveOrderMode,
    orderModeLabel,
    orderModeBadgeClass,
    computeItemCount,
    computeTotal,
    getCartStorageKey,
    CART_SCHEMA_VERSION,
} from "./utils/cart.js";
import {
    getLeafSkus,
    isLeafSku,
    isTopLevelSet,
    computeHierarchyStock,
    getAncestorSkus,
    parseModels,
    productMatchesModel,
    collectModelsWithDescendants,
    buildHierarchyLookup,
    countTopSetsForProduct,
    isVirtualSet,
} from "./utils/hierarchy.js";
import {
    modeBadgeHtml,
    productionModeCardBadgeHtml,
    hierarchyBadgeHtml,
    virtualSetBadgeHtml,
    unconfirmedBadgeHtml,
} from "./utils/badges.js";

// Round 3 (V.0.4) — router + api + loaders. Page renderers are imported
// directly by their loaders — not re-imported here (Round 4 dropped the
// `window.DINOCO_B2F_CATALOG_RENDERERS` bridge bag).
import {
    setupHashRouter,
    goToView,
    openSetDetail,
    back as routerBack,
    dispatchInitial,
} from "./router.js";
import { createB2FCatalogApi } from "./api.js";
import { setupMakerHome, loadMakerHome, handlePickMaker } from "./loaders/makerHome.js";
import {
    setupCatalog,
    loadCatalog,
    handleAddToCart,
    setQty,
} from "./loaders/catalog.js";
import { setupSetDetail, loadSetDetail, handleStepperChange } from "./loaders/setDetail.js";
import {
    setupCart,
    loadCartView,
    handleSubmitOrder,
    handleReviewGate,
} from "./loaders/cart.js";
import { setupSuccess, loadSuccess } from "./loaders/success.js";

// Round 4 (V.0.5) — event delegation
import { setupEventDelegation } from "./event-delegation.js";

console.info("[b2f-catalog] V.0.5 — Round 4 event delegation ready");

/**
 * Bootstrap the B2F Admin E-Catalog LIFF surface.
 *
 * Round 1 ships only the foundation — auth + lang + offline detection.
 * Round 2+ will add page rendering + hash routing + cart submit.
 *
 * @param {{
 *   liffId?: string,
 *   adminToken?: string,
 *   makerId?: number|string,
 *   makerCurrency?: "THB"|"USD"|"CNY",
 *   restUrl?: string,
 *   nonce?: string,
 *   orderIntentEnabled?: boolean
 * }} [opts]
 * @returns {Promise<null|object>}
 */
export async function bootstrap(opts = {}) {
    if (!opts.liffId) {
        console.warn("[b2f-catalog] liffId not provided — skipping");
        return null;
    }

    // 1) Init LIFF — best-effort (resolves null on init failure to allow
    //    PC-browser fallback via WP nonce).
    const ctx = await initLiff(opts.liffId);

    // 2) Setup language from maker currency. Defaults to "th" when no
    //    currency provided yet — Round 2 reloads after maker pick.
    setupLanguage(opts.makerCurrency || "THB");

    // 3) Wire offline toast (idempotent).
    setupOfflineDetection();

    // 4) Build the API client — Round 3 typed wrapper around shared createApi.
    const baseUrl = opts.restUrl
        ? opts.restUrl.replace(/\/+$/, "")
        : wpRestUrl("b2f/v1");
    const api = createB2FCatalogApi({
        base: baseUrl,
        token: opts.adminToken,
        nonce: opts.nonce || undefined,
        onAuthExpired: () => showAuthError("ไม่มีสิทธิ์ — กรุณา login ใหม่"),
        onRateLimit: (msg) => showToast(msg, "error"),
        onConflict: (msg) => showToast(msg, "error"),
        onCancelledPO: (msg) => showToast(msg, "error"),
    });

    // 5) Pre-warm cart from localStorage (per-maker scope).
    const initialCart = opts.makerId ? loadCart(opts.makerId) : {};

    // 6) Build shared mutable state (loaders read + write).
    /** @type {any} */
    const state = {
        makerId: opts.makerId || null,
        currency: opts.makerCurrency || "THB",
        orderIntentEnabled: !!opts.orderIntentEnabled,
        products: [],
        cart: initialCart,
        skuRelations: {},
        catalogMap: {},
        hierarchyMeta: {},
        showVirtual: false,
        currentView: "catalog",
        lastPO: null,
    };

    // 7) Wire loaders.
    setupMakerHome({
        api,
        state,
        onPick: (id) => {
            state.makerId = id;
            goToView("catalog");
        },
    });
    setupCatalog({ api, state });
    setupSetDetail({ api, state, onAddToCart: handleAddToCart });
    setupCart({
        api,
        state,
        onSuccess: (poNumber, poId, warnings) => {
            state.lastPO = { number: poNumber, id: poId, warnings: warnings || [] };
            goToView("success");
        },
    });
    setupSuccess({ state });

    // 8) Wire hash router (popstate-aware SPA navigation).
    setupHashRouter({
        useHashApi: true,
        handlers: {
            home: loadMakerHome,
            catalog: () => { state.currentView = "catalog"; loadCatalog(); },
            detail: (sku) => { state.currentView = "detail"; loadSetDetail(sku); },
            cart: () => { state.currentView = "cart"; loadCartView(); },
            review: () => { state.currentView = "review"; loadCartView(); },
            success: () => { state.currentView = "success"; loadSuccess(); },
        },
    });

    // 9) Wire central event-delegation listener on the Vite root mount.
    //    Round 4 — replaces the V.0.4 legacy `window.DINOCO_B2F_CATALOG_NAV`
    //    bridge. All [data-action] / [data-stepact] / [data-subaddsku] /
    //    [data-bucket-tab] dispatches resolve through this single listener.
    if (typeof document !== "undefined") {
        const root = document.getElementById("b2f-catalog-app");
        if (root) {
            setupEventDelegation(root, {
                pickMaker: handlePickMaker,
                openSetDetail,
                addToCart: (sku, qty, mode, src) => handleAddToCart(sku, qty, mode, src),
                increment: (sku) => {
                    const cur = (state.cart && state.cart[sku] && state.cart[sku].qty) || 0;
                    handleAddToCart(sku, cur + 1);
                },
                decrement: (sku) => {
                    const cur = (state.cart && state.cart[sku] && state.cart[sku].qty) || 0;
                    handleAddToCart(sku, Math.max(0, cur - 1));
                },
                removeFromCart: (sku) => {
                    handleAddToCart(sku, 0);
                    if (state.currentView === "cart" || state.currentView === "review") {
                        loadCartView();
                    }
                },
                addSet: (sku, qty) => handleAddToCart(sku, qty, "full_set", sku),
                subItemStep: (sku, dir) => {
                    handleStepperChange(sku, dir === "plus" ? 1 : -1);
                },
                subItemReveal: (sku) => handleAddToCart(sku, 1),
                stepperInput: (sku, val) => setQty(sku, val),
                toggleBucket: (key) => {
                    // V.7.11 a11y accordion — toggle aria-expanded on the
                    // matching tab + hide/show its panel.
                    const root2 = document.getElementById("b2f-catalog-app");
                    if (!root2) return;
                    const tab = /** @type {HTMLElement|null} */ (
                        root2.querySelector('[data-bucket-tab="' + key + '"]')
                    );
                    if (!tab) return;
                    const expanded = tab.getAttribute("aria-expanded") === "true";
                    tab.setAttribute("aria-expanded", expanded ? "false" : "true");
                    tab.setAttribute("aria-selected", expanded ? "false" : "true");
                    const panelId = tab.getAttribute("aria-controls") || "";
                    if (panelId) {
                        const panel = document.getElementById(panelId);
                        if (panel) {
                            if (expanded) panel.setAttribute("hidden", "");
                            else panel.removeAttribute("hidden");
                        }
                    }
                },
                back: () => routerBack(),
                openReviewGate: () => handleReviewGate(),
                submitOrder: () => handleSubmitOrder(),
            });
        }
    }

    // 10) Expose a single frozen debug surface (mirrors B2B catalog +
    //     B2F maker V.0.5 pattern). Legacy `_NAV` + `_RENDERERS` bag
    //     globals from Round 3 are dropped — event delegation owns the
    //     dispatch surface now.
    if (typeof window !== "undefined") {
        const w = /** @type {any} */ (window);
        w.DINOCO_B2F_CATALOG = Object.freeze({
            version: "V.0.5",
            ctx,
            api,
            state,
            modal,
            makerId: opts.makerId || null,
            orderIntentEnabled: !!opts.orderIntentEnabled,
            // Public navigation entry points (read-only) — kept on the
            // single debug surface for the inline V.7.15 fallback during
            // canary; Round 5 cutover removes the inline path entirely.
            goToView,
            openSetDetail,
            back: routerBack,
            utils: Object.freeze({
                $, $$, L, getLang,
                escHtml, formatNumber, formatCurrency, formatDate,
                currencySymbol, currencyNameEn,
                showToast, showAuthError, showLoading, hideLoading,
                lockBtn, unlockBtn, isLocked,
                loadCart, saveCart, clearCart, setCartQty,
                computeItemCount, computeTotal,
                deriveOrderMode, orderModeLabel, orderModeBadgeClass,
                getCartStorageKey,
                getLeafSkus, isLeafSku, isTopLevelSet,
                computeHierarchyStock, getAncestorSkus,
                parseModels, productMatchesModel,
                collectModelsWithDescendants, buildHierarchyLookup,
                countTopSetsForProduct, isVirtualSet,
                modeBadgeHtml, productionModeCardBadgeHtml,
                hierarchyBadgeHtml, virtualSetBadgeHtml,
                unconfirmedBadgeHtml,
            }),
            constants: Object.freeze({
                CART_SCHEMA_VERSION,
            }),
            initialCart,
        });
    }

    // 11) Dispatch initial view based on current URL hash.
    dispatchInitial();

    return {
        version: "V.0.5",
        ctx,
        api,
        state,
        modal,
        makerId: opts.makerId || null,
        initialCart,
    };
}

if (typeof window !== "undefined" && window.DINOCO_B2F_CATALOG_CONFIG) {
    bootstrap(window.DINOCO_B2F_CATALOG_CONFIG).catch((err) =>
        console.error("[b2f-catalog] bootstrap failed", err)
    );
}
