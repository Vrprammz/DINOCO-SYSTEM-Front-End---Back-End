/**
 * LIFF AI — Lead Detail loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.10
 *   - lines 1052-1205: renderLeadDetail(id) — fetch + render + bind handlers
 *
 * Behavioral parity:
 *   - GET /lead/{id} → renderLeadDetail() page renderer.
 *   - Wire accept / add note / status change handlers.
 *   - V.3.5 UX-H12: try/catch around api() — robust offline recovery.
 */

import { showLoading, showError, showToast } from "../utils/dom.js";
import {
    renderLeadDetail,
    renderLeadStatusChange,
} from "../pages/leadDetail.js";

let _api = null;
let _state = null;

/**
 * @param {{ api: any }} deps
 * @param {object} [state]
 */
export function setupLeadDetail(deps, state) {
    if (!deps || !deps.api) {
        throw new Error("setupLeadDetail: deps.api required");
    }
    _api = deps.api;
    _state = state || {};
}

/**
 * @param {string|number} id
 * @returns {Promise<void>}
 */
export async function loadLeadDetail(id) {
    if (!_api) return;
    if (!id) {
        showError("ไม่พบ Lead", "ไม่มี Lead ID");
        return;
    }
    showLoading("กำลังโหลดข้อมูล Lead...");
    try {
        const res = await _api.getLeadDetail(id);
        if (!res || res.success === false) {
            showError("ไม่พบ Lead", (res && res.message) || "");
            return;
        }
        const lead = res.data || res;
        if (_state) {
            _state.currentLead = lead;
            _state.currentLeadId = id;
        }

        const html = renderLeadDetail({
            lead,
            role: (_state && _state.role) || "admin",
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

/**
 * Accept lead handler. Used by event delegation (R4) or inline onclick (R3).
 *
 * @param {string|number} id
 * @param {HTMLButtonElement} [btn]
 * @returns {Promise<void>}
 */
export async function handleAcceptLead(id, btn) {
    if (!_api || !id) return;
    if (btn) {
        btn.disabled = true;
        btn.textContent = "กำลังรับ...";
    }
    try {
        const r = await _api.acceptLead(id);
        if (r && r.success) {
            showToast("รับ Lead สำเร็จ", "success");
            setTimeout(() => loadLeadDetail(id), 1000);
        } else {
            showToast((r && r.message) || "ไม่สำเร็จ", "error");
            if (btn) {
                btn.disabled = false;
                btn.textContent = "รับ Lead";
            }
        }
    } catch (_err) {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "รับ Lead";
        }
        showToast("⚠️ เครือข่ายขัดข้อง — ลองใหม่", "error");
    }
}

/**
 * Add note handler. Reads from `#noteInput`.
 *
 * @param {string|number} id
 * @param {HTMLButtonElement} [btn]
 * @returns {Promise<void>}
 */
export async function handleNoteAdd(id, btn) {
    if (!_api || !id) return;
    const input = /** @type {HTMLTextAreaElement|null} */ (
        document.getElementById("noteInput")
    );
    const noteVal = (input && input.value) || "";
    if (!noteVal.trim()) {
        showToast("กรุณากรอกหมายเหตุ", "error");
        return;
    }
    if (btn) btn.disabled = true;
    try {
        const r = await _api.addNote(id, noteVal.trim());
        if (r && r.success) {
            showToast("บันทึกสำเร็จ", "success");
            setTimeout(() => loadLeadDetail(id), 800);
        } else {
            showToast((r && r.message) || "ไม่สำเร็จ", "error");
            if (btn) btn.disabled = false;
        }
    } catch (_err) {
        if (btn) btn.disabled = false;
        showToast("⚠️ เครือข่ายขัดข้อง — ลองใหม่", "error");
    }
}

/**
 * Status change handler — admin only.
 *
 * @param {string|number} id
 * @param {string} newStatus
 * @returns {Promise<void>}
 */
export async function handleStatusChange(id, newStatus) {
    if (!_api || !id || !newStatus) return;
    try {
        const r = await _api.updateLeadStatus(id, newStatus);
        if (r && r.success) {
            showToast("เปลี่ยนสถานะสำเร็จ", "success");
            setTimeout(() => loadLeadDetail(id), 800);
        } else {
            showToast((r && r.message) || "ไม่สำเร็จ", "error");
        }
    } catch (_err) {
        showToast("⚠️ เครือข่ายขัดข้อง — ลองใหม่", "error");
    }
}

/**
 * Show status change modal — admin only.
 *
 * @param {string|number} id
 * @param {string[]} [allowed] allowed transitions (admin loads from FSM)
 */
export function showStatusChangeModal(id, allowed) {
    const html = renderLeadStatusChange({
        leadId: String(id),
        allowed: allowed || [],
    });
    const overlay = document.createElement("div");
    overlay.className = "liff-ai-modal-overlay";
    overlay.dataset.leadId = String(id);
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
}
