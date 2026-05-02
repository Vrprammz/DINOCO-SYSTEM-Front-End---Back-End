/**
 * LIFF AI — Admin Dashboard loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.10
 *   - lines 858-908: renderAdminDashboard() — fetch + render
 *   - lines 910-958: loadUrgentSection() — secondary fetch for urgent items
 *
 * Behavioral parity:
 *   - GET /dashboard for top-level stats.
 *   - Optional secondary GET /leads?status=dealer_no_response (best-effort).
 *   - Renders into `#liffAiApp` via pages/dashboard.js renderer.
 */

import { showLoading, showError, showToast } from "../utils/dom.js";
import {
    renderDashboard,
    renderUrgentSection,
} from "../pages/dashboard.js";

let _api = null;
let _state = null;

/**
 * @param {{ api: any }} deps
 * @param {object} [state] shared state ref
 */
export function setupDashboard(deps, state) {
    if (!deps || !deps.api) {
        throw new Error("setupDashboard: deps.api required");
    }
    _api = deps.api;
    _state = state || {};
}

/**
 * @returns {Promise<void>}
 */
export async function loadDashboard() {
    if (!_api) return;
    showLoading("กำลังโหลดข้อมูล...");
    try {
        const res = await _api.getDashboard();
        if (!res || res.success === false) {
            showError("โหลดไม่สำเร็จ", (res && res.message) || "");
            return;
        }
        const data = res.data || res;
        if (_state) _state.dashboard = data;

        const html = renderDashboard({ data, logoUrl: (_state && _state.logoUrl) || "" });
        const app = document.getElementById("liffAiApp");
        if (app) app.innerHTML = html;

        // Best-effort load urgent section (parity with V.3.10 pattern).
        loadUrgentSection().catch(() => {
            /* swallow — secondary fetch failure shouldn't block dashboard */
        });
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

/**
 * Secondary fetch — leads needing attention.
 *
 * @returns {Promise<void>}
 */
async function loadUrgentSection() {
    if (!_api) return;
    try {
        const res = await _api.getLeads({ status: "dealer_no_response", limit: 5 });
        if (!res || res.success === false) return;
        const leads = (res.data && res.data.leads) || res.leads || [];
        if (_state) _state.urgentLeads = leads;
        const slot = document.getElementById("liffAiUrgent");
        if (slot) {
            slot.innerHTML = renderUrgentSection({ needsAttention: leads });
        }
    } catch {
        showToast("โหลดรายการเร่งด่วนไม่สำเร็จ", "error");
    }
}
