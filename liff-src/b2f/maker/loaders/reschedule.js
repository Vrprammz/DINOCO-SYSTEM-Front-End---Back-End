/**
 * B2F Maker LIFF — Reschedule page loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *   - lines 1013-1041: loadReschedulePage() (list-or-detail dual mode)
 *   - lines 1114-1132: handleReschedule()
 *
 * Behavioral parity:
 *   - When `?po_id=` absent → fetch list of POs in `confirmed` status →
 *     renderRescheduleList() picker.
 *   - When present → fetch po-detail/jwt → guard status (only `confirmed` or
 *     `delivering` can reschedule) → renderReschedulePage().
 *   - Submit validates date in future + reason text + locks button + redirects
 *     to detail after 1.5s.
 */

import { L, setupLanguage, statusLabel } from "../utils/lang.js";
import { showLoading, showError, showToast, lockBtn, unlockBtn, $ } from "../utils/dom.js";
import {
    renderRescheduleList,
    renderReschedulePage,
    attachRescheduleHandler,
} from "../pages/reschedule.js";

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
let _lineUid = "";
let _onSuccess = null;
let _poDataRef = { current: null };

/**
 * @param {{
 *   api: { getPODetail: Function, getMakerPOList: Function, reschedulePO: Function },
 *   lineUid?: string,
 *   onSuccessNavigate?: () => void,
 *   poDataRef?: { current: any }
 * }} deps
 */
export function setupReschedule(deps) {
    if (!deps || !deps.api) {
        throw new Error("setupReschedule: deps.api required");
    }
    _api = deps.api;
    _lineUid = deps.lineUid || "";
    _onSuccess = deps.onSuccessNavigate || null;
    if (deps.poDataRef) _poDataRef = deps.poDataRef;
}

/**
 * @param {string|number} [poId]
 * @returns {Promise<void>}
 */
export async function loadReschedulePage(poId) {
    if (!_api) return;
    showLoading();
    try {
        const urlPoId =
            poId ||
            (typeof window !== "undefined"
                ? new URLSearchParams(window.location.search).get("po_id")
                : "");

        // Phase 1 — no po_id supplied: show picker list
        if (!urlPoId) {
            const res = await _api.getMakerPOList(undefined, { status: "confirmed" });
            const list = (res && (res.data || res.orders)) || [];
            const arr = Array.isArray(list) ? list : [];
            if (res && res.maker_currency) setupLanguage(res.maker_currency);
            else if (arr.length > 0 && arr[0].currency) setupLanguage(arr[0].currency);
            renderRescheduleList(arr);
            return;
        }

        // Phase 2 — po_id supplied: fetch detail
        const res = await _api.getPODetail(urlPoId);
        const po = (res && res.data) || res || {};
        _poDataRef.current = po;
        if (po.currency) setupLanguage(po.currency);

        if (po.po_status !== "confirmed" && po.po_status !== "delivering") {
            showError(
                L("ไม่สามารถขอเลื่อนได้", "Cannot reschedule", "无法延期"),
                L(
                    "สถานะ PO (" + statusLabel(po.po_status) + ") ไม่อนุญาตให้ขอเลื่อน",
                    "PO status (" + statusLabel(po.po_status) + ") does not allow rescheduling",
                    "PO状态(" + statusLabel(po.po_status) + ")不允许延期"
                )
            );
            return;
        }
        renderReschedulePage(po);
        attachRescheduleHandler({
            onSubmit: () => handleRescheduleSubmit(po),
        });
    } catch (err) {
        showError(
            L("ไม่สามารถโหลดข้อมูลได้", "Failed to load", "加载失败"),
            _msg(err)
        );
    }
}

/**
 * @param {Object} po
 * @returns {Promise<void>}
 */
export async function handleRescheduleSubmit(po) {
    const btn = /** @type {HTMLButtonElement|null} */ ($("#b2f-reschedule-btn"));
    const dateEl = /** @type {HTMLInputElement|null} */ ($("#b2f-new-date"));
    const reasonEl = /** @type {HTMLTextAreaElement|null} */ ($("#b2f-reschedule-reason"));
    const newDate = dateEl ? dateEl.value : "";
    const reason = reasonEl ? reasonEl.value.trim() : "";

    if (!newDate) {
        showToast(
            L(
                "กรุณาเลือกวันที่ส่งใหม่",
                "Please select a new delivery date",
                "请选择新交货日期"
            ),
            "error"
        );
        return;
    }
    if (newDate <= new Date().toISOString().split("T")[0]) {
        showToast(
            L(
                "วันส่งต้องเป็นวันในอนาคต",
                "Date must be in the future",
                "日期必须是未来日期"
            ),
            "error"
        );
        return;
    }
    if (!reason) {
        showToast(
            L(
                "กรุณาระบุเหตุผลที่ต้องเลื่อน",
                "Please specify reschedule reason",
                "请说明延期原因"
            ),
            "error"
        );
        return;
    }
    if (!btn || !lockBtn(btn)) return;

    try {
        const poId =
            (po && (po.id || po.ID)) ||
            (typeof window !== "undefined"
                ? new URLSearchParams(window.location.search).get("po_id") || ""
                : "");
        await _api.reschedulePO(poId, {
            po_id: poId,
            new_date: newDate,
            reason: reason,
            line_uid: _lineUid,
        });
        showToast(
            L(
                "ส่งคำขอเลื่อนเรียบร้อย รอ Admin อนุมัติ",
                "Reschedule request sent. Awaiting admin approval.",
                "延期申请已发送,等待Admin审批"
            ),
            "success"
        );
        _redirectToDetail();
    } catch (err) {
        showToast(_msg(err) || "Error", "error");
        unlockBtn(btn);
    }
}

function _redirectToDetail() {
    if (typeof _onSuccess === "function") {
        setTimeout(_onSuccess, 1500);
        return;
    }
    if (typeof window === "undefined") return;
    setTimeout(function () {
        const p = new URLSearchParams(window.location.search);
        p.set("view", "detail");
        p.delete("page");
        window.location.search = p.toString();
    }, 1500);
}
