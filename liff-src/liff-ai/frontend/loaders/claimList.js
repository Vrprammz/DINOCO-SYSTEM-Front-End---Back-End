/**
 * LIFF AI — Claim List loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.10
 *   - lines 1284-1342: renderClaimList(filter)
 */

import { showLoading, showError } from "../utils/dom.js";
import { renderClaimList } from "../pages/claimList.js";

let _api = null;
let _state = null;

/**
 * @param {{ api: any }} deps
 * @param {object} [state]
 */
export function setupClaimList(deps, state) {
    if (!deps || !deps.api) {
        throw new Error("setupClaimList: deps.api required");
    }
    _api = deps.api;
    _state = state || {};
}

/**
 * @param {string} [filter]
 * @returns {Promise<void>}
 */
export async function loadClaimList(filter) {
    if (!_api) return;
    showLoading("กำลังโหลดรายการเคลม...");
    try {
        const params = filter ? { status: filter } : undefined;
        const res = await _api.getClaims(params);
        if (!res || res.success === false) {
            showError("โหลดไม่สำเร็จ", (res && res.message) || "");
            return;
        }
        const claims = (res.data && res.data.claims) || res.claims || [];
        if (_state) {
            _state.claims = claims;
            _state.claimFilter = filter || "all";
        }
        const html = renderClaimList({
            claims,
            filter: filter || "all",
        });
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
