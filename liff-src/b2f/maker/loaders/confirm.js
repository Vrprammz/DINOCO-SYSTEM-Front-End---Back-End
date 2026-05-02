/**
 * B2F Maker LIFF — Confirm page loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *   - lines 670-699:  loadConfirmPage()
 *   - lines 814-835:  handleConfirm()
 *   - lines 837-855:  handleReject()
 *
 * Behavioral parity:
 *   - Reads `?po_id=` from URL as fallback when JWT lacks po_id (V.3.5).
 *   - Guards against rendering for cancelled / already-confirmed / rejected
 *     POs — shows showError() with status-specific copy (V.4.7 line 681-693).
 *   - On confirm: validates ETA in future + locks button + redirects to
 *     `?view=detail` after 1.5s success toast.
 *   - On reject: validates reason text + locks button + redirects to detail.
 *
 * Round 3 contract: `setupConfirm(api, deps)` once at bootstrap, then
 * `loadConfirmPage(po_id?)` triggers a load + render + handler-attach pass.
 */

import { L, setupLanguage } from "../utils/lang.js";
import { showLoading, showError, showToast, lockBtn, unlockBtn, $ } from "../utils/dom.js";
import { renderConfirmPage, attachConfirmHandlers } from "../pages/confirm.js";
import { statusLabel } from "../utils/lang.js";

/**
 * Coerce an unknown thrown value into a printable string. Used to keep
 * TS strict mode happy when catching from REST helpers that throw `Error`
 * but TS sees as `unknown`.
 *
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
 * Wire the confirm loader. Idempotent.
 *
 * @param {{
 *   api: { getPODetail: Function, confirmPO: Function, rejectPO: Function },
 *   lineUid?: string,
 *   onSuccessNavigate?: () => void,
 *   poDataRef?: { current: any }
 * }} deps
 */
export function setupConfirm(deps) {
    if (!deps || !deps.api) {
        throw new Error("setupConfirm: deps.api required");
    }
    _api = deps.api;
    _lineUid = deps.lineUid || "";
    _onSuccess = deps.onSuccessNavigate || null;
    if (deps.poDataRef) _poDataRef = deps.poDataRef;
}

/**
 * Load + render the confirm page.
 *
 * @param {string|number} [poId] optional PO id (URL fallback if absent)
 * @returns {Promise<void>}
 */
export async function loadConfirmPage(poId) {
    if (!_api) {
        // No-op when deps not wired — defensive (tests may import without setup).
        return;
    }
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
        if (po.currency) {
            setupLanguage(po.currency);
        }

        if (po.po_status === "cancelled") {
            showError(
                L("ใบสั่งซื้อถูกยกเลิก", "PO Cancelled", "PO已取消"),
                L(
                    "ใบสั่งซื้อนี้ถูกยกเลิกแล้ว ไม่สามารถดำเนินการได้",
                    "This PO has been cancelled.",
                    "该PO已取消,无法操作"
                )
            );
            return;
        }
        if (
            ["confirmed", "delivering", "received", "partial_received", "paid", "completed"].indexOf(
                po.po_status
            ) !== -1
        ) {
            showError(
                L("✅ ยืนยันไปแล้ว", "✅ Already confirmed", "✅ 已确认"),
                L(
                    "PO นี้ได้รับการยืนยันเรียบร้อยแล้ว\nสถานะ: ",
                    "This PO has already been confirmed.\nStatus: ",
                    "该PO已确认\n状态: "
                ) + statusLabel(po.po_status)
            );
            return;
        }
        if (po.po_status === "rejected") {
            showError(
                L("❌ ปฏิเสธไปแล้ว", "❌ Already rejected", "❌ 已拒绝"),
                L(
                    "PO นี้ถูกปฏิเสธไปแล้ว รอ Admin ส่งใหม่",
                    "This PO has been rejected. Waiting for Admin to resubmit.",
                    "该PO已被拒绝,等待Admin重新提交"
                )
            );
            return;
        }

        renderConfirmPage(po);
        attachConfirmHandlers({
            onConfirm: () => handleConfirmSubmit(po),
            onReject: () => handleRejectSubmit(po),
        });
    } catch (err) {
        showError(
            L("ไม่สามารถโหลดข้อมูลได้", "Failed to load", "加载失败"),
            _msg(err)
        );
    }
}

/**
 * Submit handler for the green ✅ Confirm ETA button.
 *
 * @param {Object} po
 * @returns {Promise<void>}
 */
export async function handleConfirmSubmit(po) {
    const btn = /** @type {HTMLButtonElement|null} */ ($("#b2f-confirm-btn"));
    const etaEl = /** @type {HTMLInputElement|null} */ ($("#b2f-eta"));
    const noteEl = /** @type {HTMLTextAreaElement|null} */ ($("#b2f-note"));
    const eta = etaEl ? etaEl.value : "";
    const note = noteEl ? noteEl.value : "";

    if (!eta) {
        showToast(
            L(
                "กรุณาเลือกวันที่คาดว่าจะส่ง",
                "Please select delivery date",
                "请选择交货日期"
            ),
            "error"
        );
        return;
    }
    if (eta <= new Date().toISOString().split("T")[0]) {
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
    if (!btn || !lockBtn(btn)) return;

    try {
        await _api.confirmPO(po.id || po.ID, {
            expected_date: eta,
            maker_note: note,
            line_uid: _lineUid,
        });
        showToast(
            L("ยืนยันวันส่งเรียบร้อย", "Confirmed successfully", "确认成功"),
            "success"
        );
        _redirectToDetail();
    } catch (err) {
        showToast(_msg(err) || "Error", "error");
        unlockBtn(btn);
    }
}

/**
 * Submit handler for the red ❌ Confirm Reject button.
 *
 * @param {Object} _po
 * @returns {Promise<void>}
 */
export async function handleRejectSubmit(_po) {
    const btn = /** @type {HTMLButtonElement|null} */ ($("#b2f-confirm-reject"));
    const reasonEl = /** @type {HTMLTextAreaElement|null} */ ($("#b2f-reject-reason"));
    const reason = reasonEl ? reasonEl.value.trim() : "";

    if (!reason) {
        showToast(
            L(
                "กรุณาระบุเหตุผลที่ปฏิเสธ",
                "Please specify rejection reason",
                "请说明拒绝原因"
            ),
            "error"
        );
        return;
    }
    if (!btn || !lockBtn(btn)) return;

    try {
        const po = _poDataRef.current || {};
        await _api.rejectPO(po.id || po.ID, {
            reject_reason: reason,
            line_uid: _lineUid,
        });
        showToast(
            L("ปฏิเสธ PO เรียบร้อย", "PO rejected successfully", "PO已拒绝"),
            "success"
        );
        _redirectToDetail();
    } catch (err) {
        showToast(_msg(err) || "Error", "error");
        unlockBtn(btn);
    }
}

/**
 * Redirect helper — V.4.7 mutates `window.location.search`. Round 3
 * defers to the supplied navigate callback when available (router uses
 * pushState in tests).
 */
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
