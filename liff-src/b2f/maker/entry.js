/**
 * B2F Maker LIFF — entry stub (V.0.1 foundation)
 *
 * MIGRATION TARGET: `[B2F] Snippet 4: Maker LIFF Pages`
 * Current status: NOT YET MIGRATED.
 *
 * Surface area (per V.4.3):
 *   - PO confirm / reject / reschedule
 *   - Deliver confirmation
 *   - PO list
 *   - 3-language support (TH / EN / ZH — auto-switch by maker_currency)
 *   - V.7.0 mode badges (ชุดเต็ม / แยกชุด / ชิ้นเดี่ยว) per item
 */

import { initLiff } from "../../shared/liff-init.js";
import { createApi, wpRestUrl } from "../../shared/api-client.js";

console.info("[b2f-maker] foundation stub V.0.1");

export async function bootstrap({ liffId, makerToken } = {}) {
    if (!liffId) return null;
    const ctx = await initLiff(liffId);
    if (!ctx) return null;

    const api = createApi({
        base: wpRestUrl("b2f/v1"),
        token: makerToken,
        tokenHeader: "X-B2F-Maker-Token",
    });

    return { ctx, api };
}

if (typeof window !== "undefined" && window.DINOCO_B2F_MAKER_CONFIG) {
    bootstrap(window.DINOCO_B2F_MAKER_CONFIG).catch((err) =>
        console.error("[b2f-maker] bootstrap failed", err)
    );
}
