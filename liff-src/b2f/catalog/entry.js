/**
 * B2F LIFF Admin E-Catalog — entry stub (V.0.1 foundation)
 *
 * MIGRATION TARGET: `[B2F] Snippet 8: Admin LIFF E-Catalog`
 * Current status: NOT YET MIGRATED.
 *
 * Migration adds:
 *   - Order Intent UI (V.7.0) — 3 card variants (full_set / sub_unit / single)
 *   - Multi-currency display (THB / CNY / USD — 3-lang via b2f_t helper)
 *   - SET Detail overlay + mode toggle
 *   - Cart persistence localStorage `b2f_cart_v7_{maker_id}`
 */

import { initLiff } from "../../shared/liff-init.js";
import { createApi, wpRestUrl } from "../../shared/api-client.js";
import { modal } from "../../shared/modal.js";

console.info("[b2f-catalog] foundation stub V.0.1");

export async function bootstrap({ liffId, adminToken, makerId } = {}) {
    if (!liffId) {
        console.warn("[b2f-catalog] liffId not provided — skipping");
        return null;
    }
    const ctx = await initLiff(liffId);
    if (!ctx) return null;

    const api = createApi({
        base: wpRestUrl("b2f/v1"),
        token: adminToken,
        tokenHeader: "X-B2F-Token",
    });

    return { ctx, api, modal, makerId };
}

if (typeof window !== "undefined" && window.DINOCO_B2F_CATALOG_CONFIG) {
    bootstrap(window.DINOCO_B2F_CATALOG_CONFIG).catch((err) =>
        console.error("[b2f-catalog] bootstrap failed", err)
    );
}
