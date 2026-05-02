/**
 * LIFF AI — Claim Detail loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.10
 *   - lines 1365-1485: renderClaimDetail(id) — fetch + render + photo lightbox
 *   - lines 1487-1512: showLightbox(photos, idx) — photo lightbox
 *   - lines 1514-1585: showClaimStatusModal(claimId, currentStatus)
 */

import { showLoading, showError, showToast } from "../utils/dom.js";
import {
    renderClaimDetail,
    renderPhotoLightbox,
    renderClaimStatusChange,
} from "../pages/claimDetail.js";

let _api = null;
let _state = null;

/**
 * @param {{ api: any }} deps
 * @param {object} [state]
 */
export function setupClaimDetail(deps, state) {
    if (!deps || !deps.api) {
        throw new Error("setupClaimDetail: deps.api required");
    }
    _api = deps.api;
    _state = state || {};
}

/**
 * @param {string|number} id
 * @returns {Promise<void>}
 */
export async function loadClaimDetail(id) {
    if (!_api) return;
    if (!id) {
        showError("ไม่พบเคลม", "ไม่มี Claim ID");
        return;
    }
    showLoading("กำลังโหลดข้อมูลเคลม...");
    try {
        const res = await _api.getClaimDetail(id);
        if (!res || res.success === false) {
            showError("ไม่พบเคลม", (res && res.message) || "");
            return;
        }
        const claim = res.data || res;
        if (_state) {
            _state.currentClaim = claim;
            _state.currentClaimId = id;
        }
        const html = renderClaimDetail({
            claim,
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
 * Extract error message safely.
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
 * Open photo lightbox at index.
 *
 * @param {Array<string>} photos
 * @param {number} [idx]
 */
export function openLightbox(photos, idx) {
    const html = renderPhotoLightbox({
        photos: photos || [],
        index: typeof idx === "number" ? idx : 0,
    });
    const overlay = document.createElement("div");
    overlay.className = "liff-ai-lightbox-overlay";
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
}

/**
 * Close photo lightbox (removes any `.liff-ai-lightbox-overlay` from body).
 */
export function closeLightbox() {
    const overlays = document.querySelectorAll(".liff-ai-lightbox-overlay");
    for (const el of overlays) {
        if (el.parentNode) el.parentNode.removeChild(el);
    }
}

/**
 * Update claim status — admin only.
 *
 * @param {string|number} id
 * @param {string} newStatus
 * @returns {Promise<void>}
 */
export async function handleClaimStatusUpdate(id, newStatus) {
    if (!_api || !id || !newStatus) return;
    try {
        const r = await _api.updateClaimStatus(id, newStatus);
        if (r && r.success) {
            showToast("เปลี่ยนสถานะสำเร็จ", "success");
            setTimeout(() => loadClaimDetail(id), 800);
        } else {
            showToast((r && r.message) || "ไม่สำเร็จ", "error");
        }
    } catch (_err) {
        showToast("⚠️ เครือข่ายขัดข้อง — ลองใหม่", "error");
    }
}

/**
 * Show claim status change modal — admin only.
 *
 * @param {string|number} id
 * @param {string} currentStatus
 */
export function showClaimStatusModal(id, currentStatus) {
    // claimId is consumed by the loader/modal click handler via dataset, not
    // by the renderer. Pass currentStatus only to satisfy renderer typedef.
    const html = renderClaimStatusChange({ currentStatus });
    const overlay = document.createElement("div");
    overlay.className = "liff-ai-modal-overlay";
    overlay.dataset.claimId = String(id);
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
}
