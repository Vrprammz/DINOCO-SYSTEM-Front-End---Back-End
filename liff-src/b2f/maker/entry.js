/**
 * B2F Maker LIFF — Vite entry (V.0.2 Round 1 foundation)
 *
 * MIGRATION TARGET: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *
 * Round 1 scope (this file):
 *   ✅ Wiring (Snippet 4 V.4.5 already added flag-gated render)
 *   ✅ CSS port (`./styles.css`)
 *   ✅ 6 utility modules (`./utils/{lang,format,dom,jwt,badges,timeline}.js`)
 *   ✅ Foundation bootstrap — initLiff + setupLanguage + setupOfflineDetection
 *
 * Round 2+ scope (NOT in this file yet):
 *   ⏳ Page renderers (renderConfirmPage / renderDetailPage / renderListPage /
 *      renderReschedulePage / renderDeliverPage / renderDeliverForm)
 *   ⏳ Router (?view= / JWT page fallback) + apiCall wrapper
 *   ⏳ Cut-over (drop inline JS from Snippet 4)
 *
 * Surface area (per V.4.6):
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

const BOOT_MARKER = "[b2f-maker] Vite bundle loaded (V.0.2 Round 1 — foundation)";
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

    return {
        ctx,
        api,
        currency,
        lang: getLang(),
        // Expose helpers so Round 2 page renderers can import via the
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
        version: "V.0.2",
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
        constants: { STATUS_TH, STATUS_EN, STATUS_ZH },
    });
}
