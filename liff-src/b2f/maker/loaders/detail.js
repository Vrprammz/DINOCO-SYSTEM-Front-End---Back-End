/**
 * B2F Maker LIFF — Detail page loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *   - lines 862-876: loadDetailPage()
 *
 * Behavioral parity:
 *   - Reads `?po_id=` from URL when JWT lacks po_id (V.3.5).
 *   - Calls `po-detail/jwt` then renders.
 *   - Detail page action buttons (Confirm / Reschedule / Deliver) navigate
 *     via legacy inline `goToPage()` globals — entry.js Round 4 wires those
 *     to point at our router exports.
 */

import { L, setupLanguage } from "../utils/lang.js";
import { showLoading, showError } from "../utils/dom.js";
import { renderDetailPage } from "../pages/detail.js";

/**
 * @param {unknown} err
 * @returns {string}
 */
function _msg(err) {
    if (err && typeof err === "object" && "message" in err) {
        const m = /** @type {{message?: unknown}} */ (err).message;
        if (typeof m === "string") return m;
    }
    return "";
}

let _api = null;
let _poDataRef = { current: null };

/**
 * @param {{ api: { getPODetail: Function }, poDataRef?: { current: any } }} deps
 */
export function setupDetail(deps) {
    if (!deps || !deps.api) {
        throw new Error("setupDetail: deps.api required");
    }
    _api = deps.api;
    if (deps.poDataRef) _poDataRef = deps.poDataRef;
}

/**
 * @param {string|number} [poId]
 * @returns {Promise<void>}
 */
export async function loadDetailPage(poId) {
    if (!_api) return;
    showLoading();
    try {
        const urlPoId =
            poId ||
            (typeof window !== "undefined"
                ? new URLSearchParams(window.location.search).get("po_id")
                : "");
        const res = await _api.getPODetail(urlPoId);
        const po = (res && res.data) || res || {};
        _poDataRef.current = po;
        if (po.currency) setupLanguage(po.currency);
        renderDetailPage(po);
    } catch (err) {
        showError(
            L("ไม่สามารถโหลดข้อมูลได้", "Failed to load", "加载失败"),
            _msg(err)
        );
    }
}
