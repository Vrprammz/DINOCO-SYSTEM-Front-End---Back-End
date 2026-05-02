/**
 * LIFF AI Command Center — Vite entry (V.0.2 Round 1 foundation port)
 *
 * MIGRATION TARGET: `[LIFF AI] Snippet 2: Frontend` V.3.9 (header bump only)
 * Round 1 status: foundation utilities ported (CSS + 5 utility modules).
 * Round 2 will port page renderers (dashboard / dealer / lead / claim / agent).
 * Round 5 will flip the cut-over flag.
 *
 * Surface area (full):
 *   - Dashboard (admin) / Dealer dashboard
 *   - Lead list + detail + status pipeline
 *   - Claim list + detail with photo lightbox
 *   - Agent chat (Phase 3 AI proxy)
 *   - Dark theme (.liff-ai-* CSS scope)
 *
 * Default flag: `dinoco_liff_use_vite_liff_ai = false` → inline preserved.
 * REG-029 byte-identical guarantee until cut-over.
 */

import "./styles.css";
import { initLiff } from "../../shared/liff-init.js";
import { createApi, wpRestUrl } from "../../shared/api-client.js";
import { modal } from "../../shared/modal.js";

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

console.info("[liff-ai] foundation V.0.2 — Round 1 utility port complete");

/**
 * Bootstrap the LIFF AI command center.
 *
 * @param {{
 *   liffId?: string,
 *   restUrl?: string,
 *   logoUrl?: string,
 *   sessionToken?: string,
 * }} [opts]
 * @returns {Promise<{ ctx: any, auth: any, api: any, modal: any, $: any, $$: any, L: any }|null>}
 */
export async function bootstrap(opts = {}) {
    const liffId = opts.liffId;
    if (!liffId) return null;
    const ctx = await initLiff(liffId);
    if (!ctx) return null;

    // Step 1: try cached session token first (sessionStorage), else exchange.
    let token = getSessionToken() || opts.sessionToken;
    let auth = null;

    if (!token) {
        const authApi = createApi({ base: wpRestUrl("liff-ai/v1") });
        try {
            auth = await authApi("POST", "/auth", {
                line_user_id: ctx.userId,
                id_token: ctx.idToken,
            });
            if (auth && auth.token) {
                token = auth.token;
                setSessionToken(token);
                if (auth.role) setRole(auth.role);
                if (ctx.userId) setLineUid(ctx.userId);
            }
        } catch (err) {
            console.error("[liff-ai] auth failed", err);
            showError(
                "ไม่สามารถเข้าสู่ระบบได้",
                "กรุณาลองใหม่ หรือติดต่อแอดมิน"
            );
            return null;
        }
    }

    // Step 2: authenticated API client (X-LIFF-AI-Token header).
    const api = createApi({
        base: wpRestUrl("liff-ai/v1"),
        token,
        tokenHeader: "X-LIFF-AI-Token",
    });

    setupOfflineDetection();

    return { ctx, auth, api, modal, $, $$, L };
}

// Auto-boot when window-config present (parallel-rendering pattern: Snippet 2
// inline path always executes; Vite path only auto-boots when wp_option flag
// is ON AND config is exposed via `window.DINOCO_LIFF_AI_CONFIG`).
if (typeof window !== "undefined" && window.DINOCO_LIFF_AI_CONFIG) {
    bootstrap(window.DINOCO_LIFF_AI_CONFIG).catch((err) =>
        console.error("[liff-ai] bootstrap failed", err)
    );
}

// Re-export utilities so renderer modules (Round 2+) and tests can consume.
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
    // auth
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
};
