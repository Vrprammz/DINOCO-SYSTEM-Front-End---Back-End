/**
 * B2F Maker LIFF — Reschedule pages renderer (V.0.5 Round 4)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *   - lines 1043-1072: renderRescheduleList (PO list when no po_id)
 *   - lines 1074-1112: renderReschedulePage (form when po_id present)
 *
 * Behavioral parity:
 *   - List view: confirmed POs → tap → navigate to reschedule with po_id
 *   - Form view: current ETA + items count + total → new date input
 *     (min = tomorrow) + reason textarea → "ขอเลื่อนวันส่ง" submit.
 *   - Round 4: inline `onclick="goToPageWithPO('reschedule', id)"` migrated to
 *     `data-action="navigate-with-po" data-view="reschedule" data-po-id="..."`.
 *   - Round 4: inline `onclick="goToPage('detail')"` (back button) migrated to
 *     `data-action="navigate" data-view="detail"`.
 *   - Visual + behavior identical (REG-029 byte-equivalent).
 */

import { L, statusLabel } from "../utils/lang.js";
import { formatNumber, curSym, formatDate, escHtml } from "../utils/format.js";
import { $ } from "../utils/dom.js";
import { getMinDate } from "../utils/timeline.js";

/**
 * Render the reschedulable PO list page into `#b2f-app`.
 *
 * Mirrors inline `renderRescheduleList(poList)` V.4.7 line 1043-1072.
 *
 * @param {Array<Object>} poList — already filtered to status=confirmed
 * @returns {void}
 */
export function renderRescheduleList(poList) {
    const app = $("#b2f-app");
    if (!app) return;
    let cardsHtml = "";
    if (!poList || poList.length === 0) {
        cardsHtml =
            '<div class="b2f-empty"><div class="icon">📅</div><p>' +
            L(
                "ไม่มี PO ที่ขอเลื่อนได้ตอนนี้",
                "No POs available for rescheduling",
                "暂无可延期的订单"
            ) +
            "</p></div>";
    } else {
        poList.forEach(function (po) {
            const poIdRaw = String(po.ID || po.id);
            cardsHtml +=
                '<div class="b2f-po-card" style="cursor:pointer" data-action="navigate-with-po" data-view="reschedule" data-po-id="' +
                escHtml(poIdRaw) +
                '">' +
                '<div class="po-header">' +
                '<span class="po-number">' +
                escHtml(po.po_number) +
                "</span>" +
                '<span class="b2f-status b2f-status-confirmed">' +
                statusLabel(po.po_status) +
                "</span>" +
                "</div>" +
                '<div class="po-meta">' +
                (po.po_expected_date
                    ? "ETA: " + formatDate(po.po_expected_date)
                    : "") +
                "</div>" +
                '<div class="po-total">' +
                curSym(po) +
                formatNumber(po.po_total_amount) +
                "</div>" +
                "</div>";
        });
    }
    app.innerHTML =
        '<div class="b2f-liff-header">' +
        '<div class="b2f-header-content">' +
        "<h1>📅 " +
        L("ขอเลื่อนกำหนดส่ง", "Reschedule Delivery", "延期交货") +
        "</h1>" +
        '<div class="b2f-sub">' +
        L(
            "PO ที่ขอเลื่อนได้ " + poList.length + " รายการ",
            poList.length + " POs available",
            poList.length + " 个订单可延期"
        ) +
        "</div>" +
        "</div>" +
        '<img src="https://www.dinoco.in.th/wp-content/uploads/2026/01/sss.png" class="b2f-logo" alt="DINOCO">' +
        "</div>" +
        '<div style="padding:0">' +
        cardsHtml +
        "</div>";
}

/**
 * Render the reschedule form page for a single PO into `#b2f-app`.
 *
 * Mirrors inline `renderReschedulePage(po)` V.4.7 line 1074-1112.
 * Caller MUST attach handler via `attachRescheduleHandler()` after innerHTML.
 *
 * @param {Object} po — PO with po_status in ('confirmed', 'delivering')
 * @returns {void}
 */
export function renderReschedulePage(po) {
    const app = $("#b2f-app");
    if (!app) return;
    app.innerHTML =
        '<div class="b2f-liff-header">' +
        '<div class="b2f-header-content">' +
        "<h1>📅 " +
        L("ขอเลื่อนวันส่ง", "Reschedule Delivery", "延期交货") +
        "</h1>" +
        '<div class="b2f-po-number">' +
        escHtml(po.po_number) +
        "</div>" +
        '<div class="b2f-sub">' +
        '<span class="b2f-status b2f-status-' +
        escHtml(po.po_status) +
        '">' +
        statusLabel(po.po_status) +
        "</span>" +
        (po.po_expected_date
            ? " · " +
              L("ETA เดิม", "Current ETA", "当前交期") +
              ": " +
              formatDate(po.po_expected_date)
            : "") +
        "</div></div>" +
        '<img src="https://www.dinoco.in.th/wp-content/uploads/2026/01/sss.png" class="b2f-logo" alt="DINOCO">' +
        "</div>" +
        '<div class="b2f-liff-card">' +
        "<h2>📅 " +
        L("ข้อมูลปัจจุบัน", "Current Info", "当前信息") +
        "</h2>" +
        '<div style="font-size:13px;line-height:2;">' +
        "<div><strong>" +
        L("กำหนดส่งเดิม", "Current ETA", "当前交期") +
        ":</strong> " +
        (po.po_expected_date
            ? formatDate(po.po_expected_date)
            : L("ยังไม่ระบุ", "Not set", "未设置")) +
        "</div>" +
        "<div><strong>" +
        L("รายการ", "Items", "项目") +
        ":</strong> " +
        (po.po_items || []).length +
        " " +
        L("รายการ", "items", "项") +
        "</div>" +
        "<div><strong>" +
        L("ยอดรวม", "Total", "合计") +
        ":</strong> " +
        curSym(po) +
        formatNumber(po.po_total_amount) +
        "</div>" +
        "</div>" +
        "</div>" +
        '<div class="b2f-liff-card">' +
        "<h2>📅 " +
        L("กำหนดวันส่งใหม่", "New delivery date", "新交货日期") +
        "</h2>" +
        '<div class="b2f-liff-field">' +
        "<label>" +
        L(
            "วันที่คาดว่าจะส่ง (ใหม่)",
            "New expected delivery date",
            "新的预计交货日期"
        ) +
        ' <span class="required">*</span></label>' +
        '<input type="date" id="b2f-new-date" min="' +
        getMinDate() +
        '" required>' +
        "</div>" +
        '<div class="b2f-liff-field">' +
        "<label>" +
        L("เหตุผลที่ต้องเลื่อน", "Reason for rescheduling", "延期原因") +
        ' <span class="required">*</span></label>' +
        '<textarea id="b2f-reschedule-reason" placeholder="' +
        L(
            "เช่น วัตถุดิบล่าช้า, เครื่องจักรเสีย",
            "e.g. Material delay, machine breakdown",
            "如：材料延迟、设备故障"
        ) +
        '" rows="3"></textarea>' +
        "</div>" +
        "</div>" +
        '<div class="b2f-liff-actions">' +
        '<button class="b2f-btn b2f-btn-outline" data-action="navigate" data-view="detail">← ' +
        L("กลับ", "Back", "返回") +
        "</button>" +
        '<button class="b2f-btn b2f-btn-accent" id="b2f-reschedule-btn">📅 ' +
        L("ขอเลื่อนวันส่ง", "Request Reschedule", "申请延期") +
        "</button>" +
        "</div>";
}

/**
 * Attach reschedule submit handler.
 *
 * @param {{ onSubmit?: () => void }} handlers
 */
export function attachRescheduleHandler(handlers = {}) {
    const btn = $("#b2f-reschedule-btn");
    if (btn && handlers.onSubmit) {
        btn.addEventListener("click", handlers.onSubmit);
    }
}
