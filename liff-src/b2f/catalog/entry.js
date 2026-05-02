/**
 * B2F LIFF Admin E-Catalog — Vite entry (V.0.2 Round 1 foundation)
 *
 * MIGRATION TARGET: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.13+
 *
 * Round 1 (V.0.2 — this commit):
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
 * Round 2+ scope (NOT in this file yet):
 *   ⏳ Page renderers (`./pages/`) — catalog grid, SET Detail, cart modal,
 *      review gate, success screen.
 *   ⏳ Hash router (`./router.js`) — `#detail-<sku>` parity with V.7.13.
 *   ⏳ Page loaders (`./loaders/`) — load makers / products / submit PO.
 *   ⏳ Event delegation (`./event-delegation.js`).
 *
 * Production safety: this bundle only loads when wp_option
 * `dinoco_liff_use_vite_b2f_catalog = '1'`. Default OFF — Snippet 8 V.7.13
 * falls through to the inline render (REG-029 byte-identical preserved).
 * Triple safety chain (flag + manifest + `dinoco_liff_enqueue` presence).
 */

import "./styles.css";

import { initLiff } from "../../shared/liff-init.js";
import { createApi, wpRestUrl } from "../../shared/api-client.js";
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

console.info("[b2f-catalog] foundation V.0.2 — utils + styles ready");

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

    // 4) Build the API client — Round 2+ page loaders will call this.
    const baseUrl = opts.restUrl
        ? opts.restUrl.replace(/\/+$/, "")
        : wpRestUrl("b2f/v1");
    const api = createApi({
        base: baseUrl,
        token: opts.adminToken,
        tokenHeader: "X-B2F-Token",
        nonce: opts.nonce || undefined,
    });

    // 5) Pre-warm cart from localStorage (per-maker scope).
    const initialCart = opts.makerId ? loadCart(opts.makerId) : {};

    // 6) Expose a debug surface (mirrors B2B catalog + B2F maker pattern).
    if (typeof window !== "undefined") {
        const w = /** @type {any} */ (window);
        w.DINOCO_B2F_CATALOG = {
            version: "V.0.2",
            ctx,
            api,
            modal,
            makerId: opts.makerId || null,
            orderIntentEnabled: !!opts.orderIntentEnabled,
            utils: {
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
            },
            constants: {
                CART_SCHEMA_VERSION,
            },
            initialCart,
        };
    }

    return {
        version: "V.0.2",
        ctx,
        api,
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
