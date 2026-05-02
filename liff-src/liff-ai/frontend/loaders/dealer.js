/**
 * LIFF AI — Dealer Dashboard loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.10
 *   - lines 799-856: renderDealerDashboard()
 */

import { showLoading, showError } from "../utils/dom.js";
import { renderDealer } from "../pages/dealer.js";

let _api = null;
let _state = null;

/**
 * @param {{ api: any }} deps
 * @param {object} [state]
 */
export function setupDealer(deps, state) {
    if (!deps || !deps.api) {
        throw new Error("setupDealer: deps.api required");
    }
    _api = deps.api;
    _state = state || {};
}

/**
 * @returns {Promise<void>}
 */
export async function loadDealerDashboard() {
    if (!_api) return;
    showLoading("กำลังโหลดข้อมูล...");
    try {
        const res = await _api.getDealerDashboard();
        if (!res || res.success === false) {
            showError("โหลดไม่สำเร็จ", (res && res.message) || "");
            return;
        }
        const data = res.data || res;
        if (_state) _state.dealerDashboard = data;

        const html = renderDealer({ data, logoUrl: (_state && _state.logoUrl) || "" });
        const app = document.getElementById("liffAiApp");
        if (app) app.innerHTML = html;
    } catch (err) {
        showError(
            "โหลดข้อมูลไม่สำเร็จ",
            _errMsg(err) || "ลองใหม่อีกครั้ง"
        );
    }
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function _errMsg(err) {
    if (err && typeof err === "object" && "message" in err) {
        const m = /** @type {{message?: unknown}} */ (err).message;
        if (typeof m === "string") return m;
    }
    return "";
}
