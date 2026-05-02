/**
 * B2F Maker LIFF — Vite entry (V.0.4 Round 3 router + API + page bootstrap)
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
 * Round 3 (V.0.4 — this commit):
 *   ✅ Router (`./router.js`) — getCurrentView / goToPage / goToPageWithPO /
 *      setupRouter / dispatchInitial. Supports both V.4.7 reload-style and
 *      SPA-style (history.pushState) navigation. Production stays on reload.
 *   ✅ Maker API wrapper (`./api.js`) — createMakerApi() with named methods
 *      (confirmPO / rejectPO / reschedulePO / deliverLot / getPODetail /
 *      getMakerPOList) + auto X-Idempotency-Key on mutations + 401/410/409
 *      error mapping.
 *   ✅ 5 page loaders in `./loaders/` — confirm / detail / reschedule / list /
 *      deliver. Each owns its load + render + handler-attach pipeline. Pure
 *      port of inline V.4.7 `loadConfirmPage` / `handleConfirm` / etc.
 *   ✅ Legacy bridge — `window.goToPage` / `window.goToPageWithPO` /
 *      `window.b2fOpenDeliverForm` / `window.b2fFillAllRemaining` /
 *      `window.b2fStepQty` / `window.b2fSubmitDeliver` re-exposed so existing
 *      inline JS in Snippet 4 V.4.7 (still rendering pages when flag OFF)
 *      keeps working. Round 4 will drop these.
 *
 * Round 4+ scope (NOT in this file yet):
 *   ⏳ Inline-bridge cleanup (entry.js owns full bootstrap, drop window.* legacy bridge)
 *   ⏳ Cut-over (drop inline JS from Snippet 4)
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
    "[b2f-maker] Vite bundle loaded (V.0.4 Round 3 — router + API + loaders)";
console.info(BOOT_MARKER);

/**
 * Full-featured bootstrap (Round 3 — wires router + loaders).
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

    // Round 2: expose page renderers for inline-bridge during cutover.
    const renderers = {
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
    };

    if (typeof window !== "undefined") {
        window.DINOCO_B2F_MAKER_RENDERERS = renderers;

        // Round 3 — legacy global bridge so existing Snippet 4 V.4.7 inline
        // JS keeps working when bundle co-exists with inline render. Round 4
        // will drop this bridge once inline JS is removed.
        if (typeof window.goToPage !== "function") {
            window.goToPage = goToPage;
        }
        if (typeof window.goToPageWithPO !== "function") {
            window.goToPageWithPO = goToPageWithPO;
        }
        if (typeof window.b2fOpenDeliverForm !== "function") {
            window.b2fOpenDeliverForm = b2fOpenDeliverForm;
        }
        if (typeof window.b2fFillAllRemaining !== "function") {
            window.b2fFillAllRemaining = b2fFillAllRemaining;
        }
        if (typeof window.b2fStepQty !== "function") {
            window.b2fStepQty = b2fStepQty;
        }
        if (typeof window.b2fSubmitDeliver !== "function") {
            window.b2fSubmitDeliver = handleDeliverSubmit;
        }
        // V.4.7 line 1464 deliver form ←Back button uses inline `loadDeliverPage()`.
        if (typeof window.loadDeliverPage !== "function") {
            window.loadDeliverPage = loadDeliverPage;
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
        renderers,
        router: { goToPage, goToPageWithPO, getCurrentView, dispatchInitial },
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

// Surface utilities for inline-bridge during parallel rendering window.
// This lets Round 2-3 incrementally migrate inline JS by gradually
// replacing globals with calls to `window.DINOCO_B2F_MAKER.helpers.*`.
if (typeof window !== "undefined") {
    window.DINOCO_B2F_MAKER = Object.freeze({
        version: "V.0.4",
        bootstrap,
        // Round 3 — router + API factories for any Snippet 4 caller that
        // wants to migrate piecemeal.
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
