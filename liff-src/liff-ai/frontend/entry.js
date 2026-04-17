/**
 * LIFF AI Command Center — entry stub (V.0.1 foundation)
 *
 * MIGRATION TARGET: `[LIFF AI] Snippet 2: Frontend`
 * Current status: NOT YET MIGRATED (most complex of the 4 LIFF surfaces).
 *
 * Surface area:
 *   - Dashboard (admin) / Dealer dashboard
 *   - Lead list + detail + status pipeline
 *   - Claim list + detail with photo lightbox
 *   - Agent chat (Phase 3 AI proxy)
 *   - Dark theme (.liff-ai-* CSS scope)
 */

import { initLiff } from "../../shared/liff-init.js";
import { createApi, wpRestUrl } from "../../shared/api-client.js";
import { modal } from "../../shared/modal.js";

console.info("[liff-ai] foundation stub V.0.1");

export async function bootstrap({ liffId } = {}) {
    if (!liffId) return null;
    const ctx = await initLiff(liffId);
    if (!ctx) return null;

    // Step 1: exchange LINE idToken for JWT session
    const authApi = createApi({ base: wpRestUrl("liff-ai/v1") });
    const auth = await authApi("POST", "/auth", { id_token: ctx.idToken });

    // Step 2: create authenticated API for subsequent calls
    const api = createApi({
        base: wpRestUrl("liff-ai/v1"),
        token: auth.token,
        tokenHeader: "X-LIFF-AI-Token",
    });

    return { ctx, auth, api, modal };
}

if (typeof window !== "undefined" && window.DINOCO_LIFF_AI_CONFIG) {
    bootstrap(window.DINOCO_LIFF_AI_CONFIG).catch((err) =>
        console.error("[liff-ai] bootstrap failed", err)
    );
}
