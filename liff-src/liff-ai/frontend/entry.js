/**
 * LIFF AI Command Center — Vite entry (V.0.5 Round 4 inline-bridge cleanup)
 *
 * MIGRATION TARGET: `[LIFF AI] Snippet 2: Frontend` V.3.10 (header bump only)
 *
 * Round 1 (V.0.2): foundation utilities (CSS + 5 utility modules).
 * Round 2 (V.0.3): 6 page renderers in `./pages/` — pure HTML output.
 * Round 3 (V.0.4): router + API wrapper + auth-flow + 6 loaders.
 * Round 4 (V.0.5 — this commit) — FINAL R4 of all 4 LIFF surfaces:
 *   ✅ NEW `./event-delegation.js` — single click + change + submit listener
 *      on the root mount that dispatches via `[data-action]` taxonomy.
 *   ✅ DROPPED 13 legacy `window.*` bridge globals:
 *        navigate / goToTab / openLeadDetail / openClaimDetail /
 *        handleAskAgent / handleAcceptLead / handleNoteAdd /
 *        handleStatusChange / handleClaimStatusUpdate /
 *        showStatusChangeModal / showClaimStatusModal /
 *        openLightbox / closeLightbox.
 *   ✅ DROPPED `window.DINOCO_LIFF_AI_RENDERERS` — no longer needed once
 *      pages emit declarative attributes.
 *   ✅ Migrated inline `onclick="navigate('dashboard')"` in
 *      pages/agentChat.js → `data-action="go-tab" data-tab="dashboard"`.
 *   ✅ Quick-question chips now emit `data-action="quick-question"` alongside
 *      legacy `data-quick` (delegation supports both for backward-compat).
 *   ✅ Single frozen debug surface `window.DINOCO_LIFF_AI` retains version /
 *      api / state / router / loaders for tests + console debugging.
 *
 * All 4 LIFF surfaces now R1-4 complete (b2b-catalog / b2f-maker /
 * b2f-catalog / liff-ai). Ready for Round 5 destructive cut-over (drop
 * inline JS blocks from Snippet 4 / Snippet 8 / Maker LIFF / Snippet 2)
 * pending user confirmation + 1-week canary observation.
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

// Round 4 — single click/submit/change listener on the root mount.
import { setupEventDelegation } from "./event-delegation.js";

console.info("[liff-ai] V.0.5 — Round 4 inline-bridge cleanup complete");

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

    // ── Round 4 event delegation ───────────────────────────────────────
    // Single click + change + submit listener on the root mount. Replaces
    // the V.0.4 legacy `window.navigate` / `window.goToTab` / etc. bridge
    // (13 globals dropped). Pages now emit declarative `data-action="..."`
    // attributes; the delegation module dispatches to the right handler.
    if (typeof document !== "undefined") {
        const root =
            document.getElementById("liff-ai-app") ||
            document.querySelector("[data-liff-ai-root]") ||
            document.body;
        if (root) {
            setupEventDelegation(/** @type {HTMLElement} */ (root), {
                goTab: (tab, params) => goToTab(tab, params || {}),
                navigate: (page, params) => goToTab(page, params || {}),
                openLeadDetail,
                openClaimDetail,
                // handleAcceptLead / handleNoteAdd accept (id, btn?) — wrap to
                // ignore the optional btn arg from delegation (no btn ref).
                acceptLead: (id) => handleAcceptLead(id),
                addLeadNote: (id) => handleNoteAdd(id),
                // showStatusChangeModal expects (id, allowed[]) — pass empty
                // allowed[] when triggered via delegation (modal will fetch
                // FSM list itself; allowed[] is an optional override).
                showLeadStatusModal: (id) => showStatusChangeModal(id),
                changeLeadStatus: handleStatusChange,
                // showClaimStatusModal expects (id, currentStatus) — current
                // status is unknown from delegation site, pass empty string;
                // modal fetches the latest from claim detail itself.
                showClaimStatusModal: (id) => showClaimStatusModal(id, ""),
                changeClaimStatus: handleClaimStatusUpdate,
                // openLightbox expects (photos[], idx) — adapt single-url
                // bridge contract to wrap into a 1-element array, idx=0.
                openPhotoLightbox: (url) => openLightbox([url], 0),
                closePhotoLightbox: closeLightbox,
                askAgent: handleAskAgent,
                back,
                refresh: () => {
                    const tab = getCurrentTab();
                    const id = getCurrentId();
                    switch (tab) {
                        case "dealer":
                            return loadDealerDashboard();
                        case "lead":
                            return loadLeadDetail(id);
                        case "claim":
                            return loadClaimDetail(id);
                        case "claims":
                            return loadClaimList();
                        case "agent":
                            return loadAgentChat();
                        default:
                            return loadDashboard();
                    }
                },
            });
        }
    }

    // Single frozen debug surface — version + api + state + router + loaders
    // for tests + console debugging. The 13 legacy `window.*` bridge globals
    // and `window.DINOCO_LIFF_AI_RENDERERS` were dropped in Round 4. Renderers
    // are still exported via the module's `export {}` block at the bottom of
    // this file for test consumption (no need for a window mirror).
    if (typeof window !== "undefined") {
        /** @type {any} */ (window).DINOCO_LIFF_AI = Object.freeze({
            version: "V.0.5",
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
    // Round 4 — event delegation
    setupEventDelegation,
};
