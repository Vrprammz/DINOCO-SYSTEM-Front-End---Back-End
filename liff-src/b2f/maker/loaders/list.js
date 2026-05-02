/**
 * B2F Maker LIFF — PO List page loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *   - lines 1140-1152: loadListPage()
 *
 * Behavioral parity:
 *   - GET /maker-po-list (no status filter — full list).
 *   - Sets language from response.maker_currency (V.4.1) → fallback to first
 *     PO's currency.
 *   - Renders via pages/list.js with `orderIntentEnabled` opt forwarded.
 */

import { L, setupLanguage } from "../utils/lang.js";
import { showLoading, showError } from "../utils/dom.js";
import { renderListPage } from "../pages/list.js";

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
let _orderIntentEnabled = false;

/**
 * @param {{
 *   api: { getMakerPOList: Function },
 *   orderIntentEnabled?: boolean
 * }} deps
 */
export function setupList(deps) {
    if (!deps || !deps.api) {
        throw new Error("setupList: deps.api required");
    }
    _api = deps.api;
    _orderIntentEnabled = !!deps.orderIntentEnabled;
}

/**
 * @returns {Promise<void>}
 */
export async function loadListPage() {
    if (!_api) return;
    showLoading();
    try {
        const res = await _api.getMakerPOList();
        const list = (res && (res.data || res.orders)) || [];
        const arr = Array.isArray(list) ? list : [];
        if (res && res.maker_currency) setupLanguage(res.maker_currency);
        else if (arr.length > 0 && arr[0].currency) setupLanguage(arr[0].currency);
        renderListPage(arr, { orderIntentEnabled: _orderIntentEnabled });
    } catch (err) {
        showError(
            L("ไม่สามารถโหลดข้อมูลได้", "Failed to load", "加载失败"),
            _msg(err)
        );
    }
}
