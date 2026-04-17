/**
 * B2B LIFF E-Catalog — entry stub (V.0.1 foundation)
 *
 * MIGRATION TARGET: `[B2B] Snippet 4: LIFF E-Catalog Frontend`
 * Current status: NOT YET MIGRATED — snippet still serves inline JS
 * embedded in PHP. This file exists so Vite can bundle a real entry
 * and validate the build pipeline works end-to-end.
 *
 * When Phase 2 migration runs, this file will be expanded to match
 * the full catalog UI (search, SET detail overlay, cart bar, qty
 * stepper, etc. per V.32.4 UX spec).
 */

import { initLiff } from "../../shared/liff-init.js";
import { createApi, wpRestUrl } from "../../shared/api-client.js";
import { modal } from "../../shared/modal.js";

const BOOT_MARKER = "[b2b-catalog] foundation stub V.0.1";
console.info(BOOT_MARKER);

// Intentional minimal bootstrap — real logic lands in Phase 2.
export async function bootstrap({ liffId, sessionToken } = {}) {
    if (!liffId) {
        console.warn("[b2b-catalog] liffId not provided — skipping init");
        return null;
    }
    const ctx = await initLiff(liffId);
    if (!ctx) return null; // redirected to login

    const api = createApi({
        base: wpRestUrl("b2b/v1"),
        token: sessionToken,
        tokenHeader: "X-B2B-Session",
    });

    return { ctx, api, modal };
}

// Auto-bootstrap if globals are present (set by PHP template during Phase 2+)
if (typeof window !== "undefined" && window.DINOCO_B2B_CONFIG) {
    bootstrap(window.DINOCO_B2B_CONFIG).catch((err) =>
        console.error("[b2b-catalog] bootstrap failed", err)
    );
}
