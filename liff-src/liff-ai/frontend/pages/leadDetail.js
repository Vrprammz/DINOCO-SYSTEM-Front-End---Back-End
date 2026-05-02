/**
 * LIFF AI Frontend — Lead Detail + Status Change page renderers (V.0.3 R2).
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.9
 *   Source location: inline `<script>` block
 *     - lines 1041-1194: renderLeadDetail (full page)
 *     - lines 1217-1266: showStatusModal (modal box body)
 *
 * Pure HTML. Caller wires:
 *   - `#backBtn` (navigate back)
 *   - `#btnAccept` (POST /lead/{id}/accept)
 *   - `#btnAddNote` (POST /lead/{id}/note)
 *   - `#btnUpdateStatus` (open status modal)
 *
 * Note: status modal in V.3.9 is built via `document.createElement` not
 * `innerHTML` — but the body content can still be templated (Round 4 will
 * migrate to template). Round 2 returns HTML for the modal box body only.
 */

import { escHtml, formatDate } from "../utils/format.js";
import {
    statusBadgeClass,
    LEAD_STATUS_TH,
    TIMELINE_STEPS,
    getTimelineIndex,
} from "../utils/lead-status.js";

/**
 * Render Lead detail page.
 * @param {{
 *   lead: {
 *     _id?: string, id?: string,
 *     customerName?: string,
 *     productInterest?: string,
 *     status?: string,
 *     platform?: string,
 *     province?: string,
 *     phone?: string,
 *     createdAt?: string,
 *     followUpHistory?: Array<{from?:string,to?:string,note?:string,at?:string}>,
 *   },
 *   role: "admin"|"dealer",
 * }} state
 * @returns {string} HTML
 */
export function renderLeadDetail(state) {
    /** @type {any} */
    const lead = (state && state.lead) || {};
    const role = (state && state.role) || "dealer";
    const status = lead.status || "lead_created";
    const badgeCls = statusBadgeClass(status);

    let html = "";
    html += '<div class="liff-ai-header">';
    html +=
        '<button class="liff-ai-detail-back" id="backBtn">&#8592; กลับ</button>';
    html +=
        '<div class="liff-ai-greeting"><h1>' +
        escHtml(lead.customerName || "ลูกค้า") +
        "</h1>";
    html +=
        "<p>" +
        escHtml(lead.productInterest || "") +
        "</p></div>";
    html += "</div>";

    html += '<div style="padding: 12px 16px;">';
    html +=
        '<span class="liff-ai-badge liff-ai-badge-' +
        badgeCls +
        '" style="font-size:12px;padding:5px 12px;">' +
        escHtml(LEAD_STATUS_TH[status] || status) +
        "</span>";
    html += "</div>";

    html +=
        '<div class="liff-ai-detail-card" style="margin: 0 16px 12px;">';
    html += "<h3>ข้อมูลลูกค้า</h3>";
    html +=
        '<div class="liff-ai-detail-row"><div class="liff-ai-detail-label">ชื่อ</div><div class="liff-ai-detail-value">' +
        escHtml(lead.customerName || "-") +
        "</div></div>";
    html +=
        '<div class="liff-ai-detail-row"><div class="liff-ai-detail-label">สินค้าที่สนใจ</div><div class="liff-ai-detail-value">' +
        escHtml(lead.productInterest || "-") +
        "</div></div>";
    html +=
        '<div class="liff-ai-detail-row"><div class="liff-ai-detail-label">ช่องทาง</div><div class="liff-ai-detail-value">' +
        escHtml((lead.platform || "-").toUpperCase()) +
        "</div></div>";
    html +=
        '<div class="liff-ai-detail-row"><div class="liff-ai-detail-label">จังหวัด</div><div class="liff-ai-detail-value">' +
        escHtml(lead.province || "-") +
        "</div></div>";
    if (lead.phone) {
        html +=
            '<div class="liff-ai-detail-row"><div class="liff-ai-detail-label">เบอร์โทร</div><div class="liff-ai-detail-value">' +
            escHtml(lead.phone) +
            "</div></div>";
    }
    html +=
        '<div class="liff-ai-detail-row"><div class="liff-ai-detail-label">เวลาที่สร้าง</div><div class="liff-ai-detail-value">' +
        formatDate(lead.createdAt) +
        "</div></div>";
    html += "</div>";

    html +=
        '<div class="liff-ai-detail-card" style="margin: 0 16px 12px;">';
    html += "<h3>สถานะ</h3>";
    html += '<div class="liff-ai-timeline">';
    const currentIdx = getTimelineIndex(status);
    TIMELINE_STEPS.forEach(function (step, i) {
        let cls = "";
        if (i < currentIdx) cls = "active";
        else if (i === currentIdx) cls = "current";
        html +=
            '<div class="liff-ai-tl-item ' +
            cls +
            '"><div class="tl-title">' +
            escHtml(step.label) +
            "</div></div>";
    });
    html += "</div></div>";

    const notes = lead.followUpHistory || [];
    if (notes.length > 0) {
        html +=
            '<div class="liff-ai-detail-card" style="margin: 0 16px 12px;">';
        html += "<h3>ประวัติ</h3>";
        html += renderLeadHistory(notes);
        html += "</div>";
    }

    html +=
        '<div class="liff-ai-detail-card" style="margin: 0 16px 12px;">';
    html += "<h3>เพิ่มหมายเหตุ</h3>";
    html +=
        '<div class="liff-ai-field"><textarea id="noteInput" maxlength="500" placeholder="พิมพ์หมายเหตุ..."></textarea></div>';
    html +=
        '<button class="liff-ai-btn liff-ai-btn-outline" id="btnAddNote">บันทึกหมายเหตุ</button>';
    html += "</div>";

    html += '<div class="liff-ai-actions">';
    if (lead.phone) {
        html +=
            '<a href="tel:' +
            escHtml(lead.phone) +
            '" class="liff-ai-btn liff-ai-btn-call">โทรลูกค้า</a>';
    }
    if (
        role === "dealer" &&
        (status === "lead_created" || status === "dealer_notified")
    ) {
        html +=
            '<button class="liff-ai-btn liff-ai-btn-primary" id="btnAccept">รับ Lead</button>';
    }
    if (role === "admin") {
        html +=
            '<button class="liff-ai-btn liff-ai-btn-primary" id="btnUpdateStatus">เปลี่ยนสถานะ</button>';
    }
    html += "</div>";

    return html;
}

/**
 * Render the history list (used by detail page + can be re-used standalone).
 * @param {Array<{from?:string,to?:string,note?:string,at?:string}>} notes
 * @returns {string} HTML
 */
export function renderLeadHistory(notes) {
    let html = "";
    (notes || []).forEach(function (n) {
        html += '<div class="liff-ai-note-item">';
        html +=
            '<div class="liff-ai-note-by">' +
            escHtml(n.from || "") +
            " &rarr; " +
            escHtml(n.to || "") +
            "</div>";
        if (n.note)
            html += '<div class="liff-ai-note-text">' + escHtml(n.note) + "</div>";
        html +=
            '<div class="liff-ai-note-date">' +
            formatDate(n.at) +
            "</div>";
        html += "</div>";
    });
    return html;
}

/**
 * Render the body of the status-change modal.
 * Inline V.3.9 builds this via DOM API; Round 2 returns the inner HTML so
 * Round 4 router can render via template.
 *
 * @param {{
 *   leadId: string,
 *   allowed: string[],
 * }} state
 * @returns {string} HTML
 */
export function renderLeadStatusChange(state) {
    const allowed = (state && state.allowed) || [];
    let html =
        '<div style="font-size:14px;font-weight:700;margin-bottom:12px;color:#f1f5f9;">เลือกสถานะใหม่</div>';
    allowed.forEach(function (s) {
        html +=
            '<button class="liff-ai-btn liff-ai-btn-outline" data-status="' +
            escHtml(s) +
            '" style="margin-bottom:8px;">' +
            escHtml(LEAD_STATUS_TH[s] || s) +
            "</button>";
    });
    html +=
        '<button class="liff-ai-btn liff-ai-btn-danger" data-cancel-status>ยกเลิก</button>';
    return html;
}
