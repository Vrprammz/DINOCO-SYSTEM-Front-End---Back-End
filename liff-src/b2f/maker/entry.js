/**
 * B2F Maker LIFF — Vite entry (V.0.3 Round 2 page renderers)
 *
 * MIGRATION TARGET: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *
 * Round 1 (V.0.2):
 *   ✅ Wiring (Snippet 4 V.4.5 added flag-gated render)
 *   ✅ CSS port (`./styles.css`)
 *   ✅ 6 utility modules (`./utils/{lang,format,dom,jwt,badges,timeline}.js`)
 *   ✅ Foundation bootstrap
 *
 * Round 2 (V.0.3 — this commit):
 *   ✅ Full `buildTimeline()` body (utils/timeline.js — was stub in R1)
 *   ✅ 5 page renderers in `./pages/`:
 *      - confirm.js  (renderConfirmPage + renderItemRow + attachConfirmHandlers)
 *      - detail.js   (renderDetailPage + renderDetailItem)
 *      - reschedule.js (renderRescheduleList + renderReschedulePage +
 *                       attachRescheduleHandler)
 *      - list.js     (renderListPage + filter state)
 *      - deliver.js  (renderDeliverPage + renderDeliverForm)
 *   ✅ Renderers exposed via `window.DINOCO_B2F_MAKER_RENDERERS` for
 *      inline-bridge use during cutover.
 *
 * Round 3+ scope (NOT in this file yet):
 *   ⏳ Router (?view= / JWT page fallback) + apiCall wrapper
 *   ⏳ Page bootstrap functions (loadConfirmPage / loadDetailPage / etc.)
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
import { createApi, wpRestUrl } from "../../shared/api-client.js";

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

const BOOT_MARKER = "[b2f-maker] Vite bundle loaded (V.0.3 Round 2 — page renderers)";
console.info(BOOT_MARKER);

/**
 * Foundation bootstrap (Round 1 — does NOT yet render pages).
 * Round 2 will add page routing + renderers.
 *
 * @param {{
 *   liffId?: string,
 *   restUrl?: string,
 *   makerToken?: string,
 *   currency?: string,
 *   orderIntentEnabled?: boolean,
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

    const api = createApi({
        base: opts.restUrl || wpRestUrl("b2f/v1"),
        token: opts.makerToken,
        tokenHeader: "X-B2F-Token",
    });

    setupOfflineDetection();

    // Round 2: expose page renderers for inline-bridge during cutover.
    // Round 3 will replace inline `renderConfirmPage` / `renderDetailPage` /
    // etc. globals in Snippet 4 V.4.7 with calls into this namespace.
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
    }

    return {
        ctx,
        api,
        currency,
        lang: getLang(),
        renderers,
        // Expose helpers so Round 3 page bootstrap can import via the
        // returned facade rather than re-importing from utils. Keeps the
        // public surface small + gives us a single rename point later.
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
        version: "V.0.3",
        bootstrap,
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
