/**
 * B2F Maker LIFF — Deliver page loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *   - lines 1233-1245: loadDeliverPage()
 *   - lines 1373-1383: window.b2fOpenDeliverForm() (form mode)
 *   - lines 1486-1546: b2fFillAllRemaining + b2fSubmitDeliver
 *   - lines 1549-1557: b2fStepQty
 *
 * Behavioral parity:
 *   - List mode: GET /maker-po-list with status=confirmed,partial_received,
 *     delivering. Render deliver list cards.
 *   - Form mode: GET /po-detail/jwt with po_id → render per-SKU qty form.
 *   - Submit: collect non-zero qty inputs → POST /maker-deliver → on success
 *     refresh list view.
 *   - Stepper +/- buttons + Fill-all helper preserve inline V.4.7 behavior.
 */

import { L, setupLanguage } from "../utils/lang.js";
import { showLoading, showError, showToast } from "../utils/dom.js";
import { renderDeliverPage, renderDeliverForm } from "../pages/deliver.js";

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
let _deliverPoData = { current: null };
let _submitInFlight = false;

/**
 * @param {{
 *   api: { getPODetail: Function, getMakerPOList: Function, deliverLot: Function },
 *   lineUid?: string,
 *   poDataRef?: { current: any }
 * }} deps
 */
export function setupDeliver(deps) {
    if (!deps || !deps.api) {
        throw new Error("setupDeliver: deps.api required");
    }
    _api = deps.api;
    _lineUid = deps.lineUid || "";
    if (deps.poDataRef) _deliverPoData = deps.poDataRef;
}

/**
 * Load + render the Deliver List page (PO selector).
 *
 * @returns {Promise<void>}
 */
export async function loadDeliverPage() {
    if (!_api) return;
    showLoading();
    try {
        const res = await _api.getMakerPOList(undefined, {
            status: "confirmed,partial_received,delivering",
        });
        const list = (res && (res.data || res.orders)) || [];
        const arr = Array.isArray(list) ? list : [];
        if (res && res.maker_currency) setupLanguage(res.maker_currency);
        else if (arr.length > 0 && arr[0].currency) setupLanguage(arr[0].currency);
        renderDeliverPage(arr);
    } catch (err) {
        showError(
            L("ไม่สามารถโหลดข้อมูลได้", "Failed to load", "加载失败"),
            _msg(err)
        );
    }
}

/**
 * Open the per-SKU qty form for a single PO.
 * Mirrors inline `window.b2fOpenDeliverForm(poId)`.
 *
 * @param {string|number} poId
 * @returns {Promise<void>}
 */
export async function b2fOpenDeliverForm(poId) {
    if (!_api) return;
    showLoading();
    try {
        const res = await _api.getPODetail(poId);
        const po = (res && res.data) || res || {};
        _deliverPoData.current = po;
        if (po.currency) setupLanguage(po.currency);
        renderDeliverForm(po);
    } catch (err) {
        showError(
            L("โหลดข้อมูล PO ไม่สำเร็จ", "Failed to load PO", "加载PO失败"),
            _msg(err)
        );
    }
}

/**
 * Auto-fill all qty inputs to their `max` (remaining) value.
 * Mirrors inline `window.b2fFillAllRemaining()`.
 */
export function b2fFillAllRemaining() {
    if (typeof document === "undefined") return;
    document.querySelectorAll(".b2f-dlv-qty").forEach(function (el) {
        const inp = /** @type {HTMLInputElement} */ (el);
        inp.value = inp.max;
    });
    showToast(
        L(
            "เติมจำนวนครบทุกรายการแล้ว",
            "All quantities filled",
            "已填满所有数量"
        )
    );
}

/**
 * Per-row +/- stepper helper. Mirrors inline `window.b2fStepQty(btn, delta)`.
 *
 * @param {HTMLElement} btn
 * @param {number} delta
 */
export function b2fStepQty(btn, delta) {
    if (!btn || !btn.parentElement) return;
    const inp = /** @type {HTMLInputElement|null} */ (
        btn.parentElement.querySelector("input[type=number]")
    );
    if (!inp) return;
    const val = parseInt(inp.value, 10) || 0;
    const min = parseInt(inp.min, 10) || 0;
    const max = parseInt(inp.max, 10) || 9999;
    inp.value = String(Math.max(min, Math.min(max, val + delta)));
}

/**
 * Submit handler — collects qty inputs, validates against max, POSTs deliver.
 * Mirrors inline `window.b2fSubmitDeliver()`.
 *
 * @returns {Promise<void>}
 */
export async function handleDeliverSubmit() {
    if (!_api) return;
    if (_submitInFlight) return;
    const po = _deliverPoData.current;
    if (!po) return;

    if (typeof document === "undefined") return;
    const inputs = /** @type {HTMLInputElement[]} */ (
        Array.from(document.querySelectorAll(".b2f-dlv-qty"))
    );
    /** @type {Array<{sku: string, qty: number}>} */
    const deliveryItems = [];
    inputs.forEach(function (inp) {
        const qty = parseInt(inp.value, 10) || 0;
        if (qty > 0) {
            deliveryItems.push({
                sku: (inp.dataset && inp.dataset.sku) || "",
                qty: qty,
            });
        }
    });

    if (deliveryItems.length === 0) {
        showToast(
            L(
                "กรุณากรอกจำนวนอย่างน้อย 1 รายการ",
                "Please enter at least 1 item",
                "请至少填入1项"
            ),
            "error"
        );
        return;
    }

    let invalid = false;
    inputs.forEach(function (inp) {
        const qty = parseInt(inp.value, 10) || 0;
        const max = parseInt(inp.max, 10) || 0;
        if (qty > max) {
            inp.style.borderColor = "#dc2626";
            invalid = true;
        } else {
            inp.style.borderColor = "#d1d5db";
        }
    });
    if (invalid) {
        showToast(
            L(
                "จำนวนเกินที่คงเหลือ",
                "Quantity exceeds remaining",
                "数量超过剩余"
            ),
            "error"
        );
        return;
    }

    _submitInFlight = true;
    showToast(L("กำลังดำเนินการ...", "Processing...", "处理中..."));
    try {
        const note =
            (document.getElementById("b2f-dlv-note") || /** @type {any} */ ({}))
                .value || "";
        const poId = po.id || po.ID;
        const res = await _api.deliverLot(poId, {
            po_id: poId,
            delivery_items: deliveryItems,
            note: note,
        });
        const msg =
            res && res.is_complete
                ? L(
                      "✅ แจ้งส่งของครบเรียบร้อย",
                      "✅ Shipment completed",
                      "✅ 发货完成"
                  )
                : L(
                      "📦 แจ้งส่งของบางส่วนเรียบร้อย",
                      "📦 Partial shipment recorded",
                      "📦 部分发货已记录"
                  );
        showToast(msg, "success");
        setTimeout(function () {
            loadDeliverPage();
        }, 1500);
    } catch (err) {
        showToast("❌ " + (_msg(err) || "Error"), "error");
    } finally {
        _submitInFlight = false;
    }
}

/**
 * Test-only — reset module state.
 */
export function _resetDeliverState() {
    _submitInFlight = false;
    _deliverPoData.current = null;
}
