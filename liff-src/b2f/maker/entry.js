/**
 * B2F Maker LIFF — Vite entry (V.0.5 Round 4 — inline-bridge cleanup)
 *
 * MIGRATION TARGET: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *
 * Round 1 (V.0.2):
 *   ✅ Wiring (Snippet 4 V.4.5 added flag-gated render)
 *   ✅ CSS port (`./styles.css`)
 *   ✅ 6 utility modules (`./utils/{lang,format,dom,jwt,badges,timeline}.js`)
 *   ✅ Foundation bootstrap
 *
 * Round 2 (V.0.3):
 *   ✅ Full `buildTimeline()` body (utils/timeline.js — was stub in R1)
 *   ✅ 5 page renderers in `./pages/`
 *   ✅ Renderers exposed via `window.DINOCO_B2F_MAKER_RENDERERS` for
 *      inline-bridge use during cutover.
 *
 * Round 3 (V.0.4):
 *   ✅ Router (`./router.js`) + Maker API wrapper (`./api.js`)
 *   ✅ 5 page loaders in `./loaders/`
 *   ✅ Legacy bridge — exposed `window.goToPage` / `window.goToPageWithPO` /
 *      `window.b2fOpenDeliverForm` / `window.b2fFillAllRemaining` /
 *      `window.b2fStepQty` / `window.b2fSubmitDeliver` / `window.loadDeliverPage`
 *      so existing inline JS in Snippet 4 V.4.7 keeps working.
 *
 * Round 4 (V.0.5 — this commit):
 *   ✅ Event delegation — `setupEventDelegation(rootEl)` listens on
 *      `#b2f-app` for click events bubbling up from `[data-action]`
 *      elements, dispatches to imported handlers.
 *   ✅ Pages migrated to `data-action="..."` attributes (no inline onclick).
 *   ✅ Drop 7 legacy `window.*` globals — entry.js now owns full bootstrap
 *      autonomously when flag flipped ON.
 *   ✅ Drop `window.DINOCO_B2F_MAKER_RENDERERS` parallel-rendering surface.
 *   ✅ Single namespaced surface kept: `window.DINOCO_B2F_MAKER` (debug +
 *      console testing only — not consumed by Snippet 4 V.4.7 inline JS).
 *
 * Round 5+ scope (NOT in this file yet):
 *   ⏳ Production canary cutover — drop inline `b2f_liff_page_js()` from
 *      Snippet 4 once flag has been ON 1 week with no regressions.
 *
 * Surface area (per V.4.7):
 *   - PO confirm / reject / reschedule
 *   - Deliver confirmation
 *   - PO list
 *   - 3-language support (TH / EN / ZH — auto-switch by maker_currency)
 *   - V.7.0 mode badges (ชุดเต็ม / แยกชุด / ชิ้นเดี่ยว) per item
 *   - V.4.6 PO list mode-summary pill (ORDER_INTENT_ENABLED gate)
 *
 * Production safety: this bundle only loads when wp_option
 * `dinoco_liff_use_vite_b2f_maker = '1'`. Default OFF — Snippet 4 falls back
 * to inline render. Triple safety chain (flag + manifest + dinoco_liff_enqueue
 * presence) preserved per V.4.5 wiring.
 */

import "./styles.css";

import { initLiff } from "../../shared/liff-init.js";
import { wpRestUrl } from "../../shared/api-client.js";

import {
    L,
    setupLanguage,
    getLang,
    statusLabel,
    STATUS_TH,
    STATUS_EN,
    STATUS_ZH,
} from "./utils/lang.js";
import {
    formatNumber,
    curSym,
    formatDate,
    fmtDateShort,
    escHtml,
} from "./utils/format.js";
import {
    $,
    $$,
    showToast,
    showError,
    showLoading,
    lockBtn,
    unlockBtn,
    setupOfflineDetection,
} from "./utils/dom.js";
import { jwtPayload } from "./utils/jwt.js";
import {
    modeBadgeHtml,
    modeSummaryHtml,
    buildStatusInfoBadges,
} from "./utils/badges.js";
import {
    buildTimelineBars,
    buildTimeline,
    getMinDate,
} from "./utils/timeline.js";

// Round 2 — page renderers
import {
    renderConfirmPage,
    renderItemRow,
    attachConfirmHandlers,
} from "./pages/confirm.js";
import {
    renderDetailPage,
    renderDetailItem,
} from "./pages/detail.js";
import {
    renderRescheduleList,
    renderReschedulePage,
    attachRescheduleHandler,
} from "./pages/reschedule.js";
import {
    renderListPage,
    getListFilter,
    _resetListFilter,
} from "./pages/list.js";
import {
    renderDeliverPage,
    renderDeliverForm,
} from "./pages/deliver.js";

// Round 3 — router + API wrapper + loaders
import {
    setupRouter,
    goToPage,
    goToPageWithPO,
    getCurrentView,
    getCurrentPoId,
    dispatchInitial,
} from "./router.js";
import { createMakerApi } from "./api.js";
import { setupEventDelegation as _setupEventDelegationCore } from "./event-delegation.js";
import {
    setupConfirm,
    loadConfirmPage,
    handleConfirmSubmit,
    handleRejectSubmit,
} from "./loaders/confirm.js";
import { setupDetail, loadDetailPage } from "./loaders/detail.js";
import {
    setupReschedule,
    loadReschedulePage,
    handleRescheduleSubmit,
} from "./loaders/reschedule.js";
import { setupList, loadListPage } from "./loaders/list.js";
import {
    setupDeliver,
    loadDeliverPage,
    b2fOpenDeliverForm,
    b2fFillAllRemaining,
    b2fStepQty,
    handleDeliverSubmit,
} from "./loaders/deliver.js";

const BOOT_MARKER =
    "[b2f-maker] Vite bundle loaded (V.0.5 Round 4 — event delegation)";
console.info(BOOT_MARKER);

/**
 * Round 4 — wire one click listener on `#b2f-app` that dispatches to the
 * proper handler based on `data-action` attribute. Uses bubbling so clicks
 * on inner children of action elements still match (`closest()`).
 *
 * Handled actions:
 *   - `navigate`           — generic page navigation (data-view)
 *   - `navigate-with-po`   — page nav with po_id (data-view, data-po-id)
 *   - `deliver-open`       — open deliver form for a specific PO (data-po-id)
 *   - `deliver-back`       — return from deliver form to deliver list
 *   - `deliver-step`       — qty stepper +/- (data-delta = "1" or "-1")
 *   - `deliver-fill-all`   — auto-fill all qty inputs to max
 *   - `deliver-submit`     — submit deliver form
 *
 * Thin wrapper around `event-delegation.js` core (DI-friendly for tests).
 * Caller passes the live root element; this binds the imported router +
 * loader handlers as deps.
 *
 * @param {HTMLElement|null|undefined} root
 * @returns {() => void} cleanup
 */
export function setupEventDelegation(root) {
    return _setupEventDelegationCore(root, {
        goToPage,
        goToPageWithPO,
        b2fOpenDeliverForm,
        loadDeliverPage,
        b2fStepQty,
        b2fFillAllRemaining,
        handleDeliverSubmit,
    });
}

/**
 * Full-featured bootstrap (Round 4 — autonomous, no window.* legacy bridge).
 *
 * @param {{
 *   liffId?: string,
 *   restUrl?: string,
 *   makerToken?: string,
 *   currency?: string,
 *   orderIntentEnabled?: boolean,
 *   useHistoryApi?: boolean,
 * }} [opts]
 */
export async function bootstrap(opts = {}) {
    const liffId = opts.liffId || (typeof window !== "undefined" && window.B2F_LIFF_ID);
    if (!liffId) {
        console.warn("[b2f-maker] liffId missing — cannot init LIFF SDK");
        return null;
    }

    const ctx = await initLiff(liffId);
    if (!ctx) return null; // redirected to LINE login

    // Set language from explicit currency hint OR JWT payload (maker_currency).
    let currency = opts.currency || "THB";
    if (!opts.currency && opts.makerToken) {
        const payload = jwtPayload(opts.makerToken);
        if (payload.maker_currency) currency = payload.maker_currency;
    }
    setupLanguage(currency);

    // Round 3 — Maker-scoped API wrapper (replaces ad-hoc apiCall)
    const api = createMakerApi({
        base: opts.restUrl || wpRestUrl("b2f/v1"),
        token: opts.makerToken,
        lineUid: (ctx && ctx.profile && ctx.profile.userId) || "",
        onAuthExpired: async () => {
            // Token expired: re-init LIFF (will trigger login redirect when
            // not in client). Caller may swap this for a softer toast.
            try {
                await initLiff(liffId);
            } catch {
                /* swallow */
            }
        },
        onCancelledPO: (msg) => {
            showError(
                L("PO ถูกยกเลิก", "PO Cancelled", "PO已取消"),
                msg
            );
        },
    });

    setupOfflineDetection();

    // Shared PO data ref — confirm/detail/reschedule loaders write current PO
    // here so subsequent navigation can read it without re-fetching.
    const poDataRef = { current: null };

    // Wire each loader's deps once at bootstrap (idempotent).
    setupConfirm({
        api,
        lineUid: (ctx && ctx.profile && ctx.profile.userId) || "",
        poDataRef,
        onSuccessNavigate: () => goToPage("detail"),
    });
    setupDetail({ api, poDataRef });
    setupReschedule({
        api,
        lineUid: (ctx && ctx.profile && ctx.profile.userId) || "",
        poDataRef,
        onSuccessNavigate: () => goToPage("detail"),
    });
    setupList({ api, orderIntentEnabled: !!opts.orderIntentEnabled });
    setupDeliver({
        api,
        lineUid: (ctx && ctx.profile && ctx.profile.userId) || "",
        poDataRef,
    });

    // Wire router + handler map (each handler accepts optional po_id arg).
    setupRouter({
        useHistoryApi: !!opts.useHistoryApi,
        handlers: {
            confirm: loadConfirmPage,
            detail: loadDetailPage,
            reschedule: loadReschedulePage,
            list: loadListPage,
            deliver: loadDeliverPage,
        },
    });

    // Round 4 — event delegation on #b2f-app. Replaces all inline `onclick=`
    // handlers + drops `window.goToPage` / `window.b2fOpenDeliverForm` /
    // etc. legacy globals from Round 3. Cleanup fn is held for tests + future
    // hot-reload.
    let _delegationCleanup = function () {};
    if (typeof document !== "undefined") {
        const appRoot = document.getElementById("b2f-app");
        if (appRoot) {
            _delegationCleanup = setupEventDelegation(appRoot);
        }
    }

    // Initial dispatch — render the page user landed on (or default 'list').
    const initialView = getCurrentView();
    const initialPoId = getCurrentPoId();
    try {
        // For full-reload mode (production), router doesn't dispatch on
        // setupRouter — we trigger it manually here, mirroring V.4.7 init()
        // line 413-419 switch.
        switch (initialView) {
            case "confirm":
                await loadConfirmPage(initialPoId);
                break;
            case "detail":
                await loadDetailPage(initialPoId);
                break;
            case "reschedule":
                await loadReschedulePage(initialPoId);
                break;
            case "deliver":
                await loadDeliverPage();
                break;
            case "list":
            default:
                await loadListPage();
                break;
        }
    } catch (err) {
        console.error("[b2f-maker] initial dispatch failed", err);
    }

    return {
        ctx,
        api,
        currency,
        lang: getLang(),
        router: { goToPage, goToPageWithPO, getCurrentView, dispatchInitial },
        teardown: _delegationCleanup,
        helpers: {
            L,
            formatNumber,
            curSym,
            formatDate,
            fmtDateShort,
            escHtml,
            statusLabel,
            $,
            $$,
            showToast,
            showError,
            showLoading,
            lockBtn,
            unlockBtn,
            modeBadgeHtml,
            modeSummaryHtml,
            buildStatusInfoBadges,
            buildTimelineBars,
            buildTimeline,
            getMinDate,
            jwtPayload,
        },
        constants: {
            STATUS_TH,
            STATUS_EN,
            STATUS_ZH,
        },
    };
}

// Auto-boot when PHP injects the config global. Mirrors B2B catalog +
// LIFF AI patterns for consistency. Snippet 4 V.4.5 emits this when
// `dinoco_liff_use_vite_b2f_maker = '1'` AND manifest is present.
if (typeof window !== "undefined" && window.DINOCO_B2F_MAKER_CONFIG) {
    bootstrap(window.DINOCO_B2F_MAKER_CONFIG).catch((err) =>
        console.error("[b2f-maker] bootstrap failed", err)
    );
}

// Round 4 — single namespaced debug surface. Kept for console testing +
// hot-reload diagnostics. NOT consumed by Snippet 4 V.4.7 inline JS — that
// inline path is gated by the flag and never co-runs with this bundle.
//
// Removed in this round:
//   - window.goToPage             (use DINOCO_B2F_MAKER.router.goToPage)
//   - window.goToPageWithPO       (use DINOCO_B2F_MAKER.router.goToPageWithPO)
//   - window.b2fOpenDeliverForm
//   - window.b2fFillAllRemaining
//   - window.b2fStepQty
//   - window.b2fSubmitDeliver
//   - window.loadDeliverPage
//   - window.DINOCO_B2F_MAKER_RENDERERS
//
// All UI interaction now flows through `data-action="..."` event delegation
// wired by `setupEventDelegation()` above.
if (typeof window !== "undefined") {
    window.DINOCO_B2F_MAKER = Object.freeze({
        version: "V.0.5",
        bootstrap,
        setupEventDelegation,
        router: {
            goToPage,
            goToPageWithPO,
            getCurrentView,
            getCurrentPoId,
            setupRouter,
            dispatchInitial,
        },
        createMakerApi,
        loaders: {
            loadConfirmPage,
            loadDetailPage,
            loadReschedulePage,
            loadListPage,
            loadDeliverPage,
            b2fOpenDeliverForm,
            b2fFillAllRemaining,
            b2fStepQty,
            handleConfirmSubmit,
            handleRejectSubmit,
            handleRescheduleSubmit,
            handleDeliverSubmit,
        },
        helpers: {
            L,
            getLang,
            setupLanguage,
            statusLabel,
            formatNumber,
            curSym,
            formatDate,
            fmtDateShort,
            escHtml,
            jwtPayload,
            modeBadgeHtml,
            modeSummaryHtml,
            buildStatusInfoBadges,
            buildTimelineBars,
            buildTimeline,
            getMinDate,
        },
        renderers: {
            confirm: renderConfirmPage,
            confirmItem: renderItemRow,
            attachConfirmHandlers,
            detail: renderDetailPage,
            detailItem: renderDetailItem,
            rescheduleList: renderRescheduleList,
            reschedule: renderReschedulePage,
            attachRescheduleHandler,
            list: renderListPage,
            deliver: renderDeliverPage,
            deliverForm: renderDeliverForm,
            getListFilter,
            _resetListFilter,
        },
        constants: { STATUS_TH, STATUS_EN, STATUS_ZH },
    });
}
