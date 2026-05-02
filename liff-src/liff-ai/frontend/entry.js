/**
 * LIFF AI Command Center — Vite entry (V.0.4 Round 3 router + API + loaders)
 *
 * MIGRATION TARGET: `[LIFF AI] Snippet 2: Frontend` V.3.10 (header bump only)
 *
 * Round 1 (V.0.2): foundation utilities (CSS + 5 utility modules).
 * Round 2 (V.0.3): 6 page renderers in `./pages/` — pure HTML output.
 * Round 3 (V.0.4 — this commit):
 *   ✅ Router (`./router.js`) — pushState navigation + popstate listener +
 *      role-based default-page resolver.
 *   ✅ LIFF AI API wrapper (`./api.js`) — X-LIFF-AI-Token + idempotency-key
 *      auto-attach for accept/note/status/agent-ask + 401/409/5xx handling.
 *   ✅ Auth flow (`./auth-flow.js`) — id_token → JWT exchange + 401 retry +
 *      role resolution.
 *   ✅ 6 page loaders in `./loaders/` — fetch + render + handler binding:
 *        dashboard / dealer / leadDetail / claimList / claimDetail / agentChat.
 *   ✅ Legacy bridge — exposes `window.goToTab` / `window.openLeadDetail` /
 *      `window.openClaimDetail` / `window.handleAskAgent` so existing inline
 *      JS in Snippet 2 V.3.10 keeps working until Round 4.
 *
 * Round 4 will drop the window.* legacy globals once event delegation +
 * cut-over flag flip have soaked in production.
 *
 * Default flag: `dinoco_liff_use_vite_liff_ai = false` → inline preserved.
 * REG-029 byte-identical guarantee until cut-over.
 */

import "./styles.css";
import { initLiff } from "../../shared/liff-init.js";
import { wpRestUrl } from "../../shared/api-client.js";

import {
    $,
    $$,
    showToast,
    showError,
    showLoading,
    setupOfflineDetection,
} from "./utils/dom.js";
import {
    formatNumber,
    formatDate,
    formatRelativeTime,
    timeAgo,
    escHtml,
} from "./utils/format.js";
import { L, getLang, setLang } from "./utils/lang.js";
import {
    setSessionToken,
    getSessionToken,
    clearSessionToken,
    setRole,
    getRole,
    setLineUid,
    getLineUid,
} from "./utils/auth.js";
import {
    LEAD_STATUSES,
    LEAD_STATUS_TH,
    CLAIM_STATUS_TH,
    STATUS_COLORS,
    TIMELINE_STEPS,
    statusBadgeClass,
    claimBadgeClass,
    getStatusLabel,
    getClaimStatusLabel,
    getStatusColor,
    getClaimStatusColor,
    getTimelineIndex,
} from "./utils/lead-status.js";

// Round 2 page renderers — pure HTML output, no DOM mutation.
import {
    renderDashboard,
    renderUrgentSection,
} from "./pages/dashboard.js";
import { renderDealer } from "./pages/dealer.js";
import { renderLeadCard } from "./pages/leadCard.js";
import {
    renderLeadDetail,
    renderLeadHistory,
    renderLeadStatusChange,
} from "./pages/leadDetail.js";
import {
    renderClaimList,
    renderClaimFilter,
    renderClaimCard,
    renderLeadList,
    renderLeadFilter,
} from "./pages/claimList.js";
import {
    renderClaimDetail,
    renderStatusHistory,
    renderPhotoLightbox,
    renderClaimStatusChange,
} from "./pages/claimDetail.js";
import {
    renderAgentChat,
    renderChatBubble,
    formatBotText,
    AGENT_LABELS,
    QUICK_QUESTIONS,
} from "./pages/agentChat.js";

// Round 3 — router + API + auth-flow + loaders
import {
    setupHashRouter,
    goToTab,
    openLeadDetail,
    openClaimDetail,
    back,
    getCurrentTab,
    getCurrentId,
    dispatchInitial,
    _resetRouter,
} from "./router.js";
import { createLiffAiApi } from "./api.js";
import { initAuth } from "./auth-flow.js";
import { setupDashboard, loadDashboard } from "./loaders/dashboard.js";
import { setupDealer, loadDealerDashboard } from "./loaders/dealer.js";
import {
    setupLeadDetail,
    loadLeadDetail,
    handleAcceptLead,
    handleNoteAdd,
    handleStatusChange,
    showStatusChangeModal,
} from "./loaders/leadDetail.js";
import { setupClaimList, loadClaimList } from "./loaders/claimList.js";
import {
    setupClaimDetail,
    loadClaimDetail,
    openLightbox,
    closeLightbox,
    handleClaimStatusUpdate,
    showClaimStatusModal,
} from "./loaders/claimDetail.js";
import {
    setupAgentChat,
    loadAgentChat,
    handleAskAgent,
} from "./loaders/agentChat.js";

console.info("[liff-ai] V.0.4 — Round 3 router + API + loaders complete");

/**
 * Bootstrap the LIFF AI command center.
 *
 * @param {{
 *   liffId?: string,
 *   restUrl?: string,
 *   logoUrl?: string,
 *   sessionToken?: string,
 * }} [opts]
 * @returns {Promise<{ ctx: any, auth: any, api: any, state: any }|null>}
 */
export async function bootstrap(opts = {}) {
    const liffId = opts.liffId;
    if (!liffId) {
        console.warn("[liff-ai] liffId missing — cannot init LIFF SDK");
        return null;
    }

    const ctx = await initLiff(liffId);
    if (!ctx) return null;

    // Step 1 — create unauthenticated API for /auth call.
    const baseUrl = opts.restUrl || wpRestUrl("liff-ai/v1");
    const authApi = createLiffAiApi({
        base: baseUrl,
        onAuthExpired: async () => {
            clearSessionToken();
        },
    });

    // Step 2 — exchange id_token → JWT (or use cached).
    const auth = await initAuth(ctx, authApi, {
        liffId,
        sessionToken: opts.sessionToken,
    });
    if (!auth) return null;

    // Step 3 — authenticated API client. 401 here triggers session clear.
    const api = createLiffAiApi({
        base: baseUrl,
        token: auth.sessionToken,
        onAuthExpired: async () => {
            clearSessionToken();
            try {
                await initLiff(liffId);
            } catch {
                /* swallow */
            }
        },
        onConflict: (msg) => {
            showToast(msg || "คำสั่งซ้ำ — ลองใหม่อีกครั้ง", "error");
        },
    });

    setupOfflineDetection();

    // Shared state — loaders read role/dist + write current data refs here.
    const state = {
        role: auth.role,
        distId: auth.distId,
        lineUid: auth.lineUid,
        sessionToken: auth.sessionToken,
        logoUrl: opts.logoUrl || "",
    };

    // Wire loaders' deps once at bootstrap.
    setupDashboard({ api }, state);
    setupDealer({ api }, state);
    setupLeadDetail({ api }, state);
    setupClaimList({ api }, state);
    setupClaimDetail({ api }, state);
    setupAgentChat({ api }, state);

    // Wire router — handlers keyed by page name. List/leads → dashboard
    // (admin variant) since lead list is rendered from same data source.
    setupHashRouter({
        defaultPageResolver: () => (state.role === "dealer" ? "dealer" : "dashboard"),
        handlers: {
            dashboard: () => loadDashboard(),
            dealer: () => loadDealerDashboard(),
            lead: (params) => loadLeadDetail(params.get("id")),
            claim: (params) => loadClaimDetail(params.get("id")),
            leads: () => loadDashboard(),
            claims: () => loadClaimList(),
            agent: () => loadAgentChat(),
        },
    });

    // Initial dispatch — render the page user landed on (or default by role).
    const initialPage = getCurrentTab();
    const initialId = getCurrentId();
    try {
        switch (initialPage) {
            case "dealer":
                await loadDealerDashboard();
                break;
            case "lead":
                await loadLeadDetail(initialId);
                break;
            case "claim":
                await loadClaimDetail(initialId);
                break;
            case "leads":
            case "dashboard":
                await loadDashboard();
                break;
            case "claims":
                await loadClaimList();
                break;
            case "agent":
                await loadAgentChat();
                break;
            default:
                if (state.role === "dealer") {
                    await loadDealerDashboard();
                } else {
                    await loadDashboard();
                }
                break;
        }
    } catch (err) {
        console.error("[liff-ai] initial dispatch failed", err);
    }

    // ── Round 3 legacy bridge ──────────────────────────────────────────
    // Inline V.3.10 has plenty of `onclick="navigate('lead', {id: ...})"`
    // and similar globals. Expose minimal bridge surface so existing inline
    // JS keeps working when Vite path is enabled. Round 4 will switch to
    // event delegation + drop these.
    if (typeof window !== "undefined") {
        // navigate(page, params) — V.3.10 inline contract
        /** @type {any} */ (window).navigate = function (page, params) {
            goToTab(page, params || {});
        };
        /** @type {any} */ (window).goToTab = goToTab;
        /** @type {any} */ (window).openLeadDetail = openLeadDetail;
        /** @type {any} */ (window).openClaimDetail = openClaimDetail;
        /** @type {any} */ (window).handleAskAgent = handleAskAgent;
        /** @type {any} */ (window).handleAcceptLead = handleAcceptLead;
        /** @type {any} */ (window).handleNoteAdd = handleNoteAdd;
        /** @type {any} */ (window).handleStatusChange = handleStatusChange;
        /** @type {any} */ (window).handleClaimStatusUpdate = handleClaimStatusUpdate;
        /** @type {any} */ (window).showStatusChangeModal = showStatusChangeModal;
        /** @type {any} */ (window).showClaimStatusModal = showClaimStatusModal;
        /** @type {any} */ (window).openLightbox = openLightbox;
        /** @type {any} */ (window).closeLightbox = closeLightbox;
    }

    // Round 3 namespaced surface for tests + console debugging.
    if (typeof window !== "undefined") {
        /** @type {any} */ (window).DINOCO_LIFF_AI = Object.freeze({
            version: "V.0.4",
            bootstrap,
            api,
            state,
            router: { goToTab, openLeadDetail, openClaimDetail, back, getCurrentTab, getCurrentId, dispatchInitial },
            loaders: {
                loadDashboard,
                loadDealerDashboard,
                loadLeadDetail,
                loadClaimList,
                loadClaimDetail,
                loadAgentChat,
                handleAcceptLead,
                handleNoteAdd,
                handleStatusChange,
                handleAskAgent,
                handleClaimStatusUpdate,
                openLightbox,
                closeLightbox,
                showStatusChangeModal,
                showClaimStatusModal,
            },
        });

        /** @type {any} */ (window).DINOCO_LIFF_AI_RENDERERS = Object.freeze({
            dashboard: renderDashboard,
            urgentSection: renderUrgentSection,
            dealer: renderDealer,
            leadCard: renderLeadCard,
            leadList: renderLeadList,
            leadFilter: renderLeadFilter,
            leadDetail: renderLeadDetail,
            leadHistory: renderLeadHistory,
            leadStatusChange: renderLeadStatusChange,
            claimList: renderClaimList,
            claimFilter: renderClaimFilter,
            claimCard: renderClaimCard,
            claimDetail: renderClaimDetail,
            statusHistory: renderStatusHistory,
            photoLightbox: renderPhotoLightbox,
            claimStatusChange: renderClaimStatusChange,
            agentChat: renderAgentChat,
            chatBubble: renderChatBubble,
            formatBotText: formatBotText,
            AGENT_LABELS: AGENT_LABELS,
            QUICK_QUESTIONS: QUICK_QUESTIONS,
        });
    }

    return { ctx, auth, api, state };
}

// Auto-boot when window-config present (parallel-rendering pattern).
if (typeof window !== "undefined" && window.DINOCO_LIFF_AI_CONFIG) {
    bootstrap(window.DINOCO_LIFF_AI_CONFIG).catch((err) =>
        console.error("[liff-ai] bootstrap failed", err)
    );
}

// Re-export utilities so renderer modules and tests can consume.
export {
    // dom
    $,
    $$,
    showToast,
    showError,
    showLoading,
    setupOfflineDetection,
    // format
    formatNumber,
    formatDate,
    formatRelativeTime,
    timeAgo,
    escHtml,
    // lang
    L,
    getLang,
    setLang,
    // auth utils
    setSessionToken,
    getSessionToken,
    clearSessionToken,
    setRole,
    getRole,
    setLineUid,
    getLineUid,
    // lead-status
    LEAD_STATUSES,
    LEAD_STATUS_TH,
    CLAIM_STATUS_TH,
    STATUS_COLORS,
    TIMELINE_STEPS,
    statusBadgeClass,
    claimBadgeClass,
    getStatusLabel,
    getClaimStatusLabel,
    getStatusColor,
    getClaimStatusColor,
    getTimelineIndex,
    // pages (Round 2)
    renderDashboard,
    renderUrgentSection,
    renderDealer,
    renderLeadCard,
    renderLeadList,
    renderLeadFilter,
    renderLeadDetail,
    renderLeadHistory,
    renderLeadStatusChange,
    renderClaimList,
    renderClaimFilter,
    renderClaimCard,
    renderClaimDetail,
    renderStatusHistory,
    renderPhotoLightbox,
    renderClaimStatusChange,
    renderAgentChat,
    renderChatBubble,
    formatBotText,
    AGENT_LABELS,
    QUICK_QUESTIONS,
    // Round 3 — router / api / auth-flow / loaders
    setupHashRouter,
    goToTab,
    openLeadDetail,
    openClaimDetail,
    back,
    getCurrentTab,
    getCurrentId,
    dispatchInitial,
    _resetRouter,
    createLiffAiApi,
    initAuth,
    setupDashboard,
    loadDashboard,
    setupDealer,
    loadDealerDashboard,
    setupLeadDetail,
    loadLeadDetail,
    handleAcceptLead,
    handleNoteAdd,
    handleStatusChange,
    showStatusChangeModal,
    setupClaimList,
    loadClaimList,
    setupClaimDetail,
    loadClaimDetail,
    openLightbox,
    closeLightbox,
    handleClaimStatusUpdate,
    showClaimStatusModal,
    setupAgentChat,
    loadAgentChat,
    handleAskAgent,
};
