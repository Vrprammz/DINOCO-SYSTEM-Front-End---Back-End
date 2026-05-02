/**
 * LIFF AI Frontend — Claim Detail + Photo lightbox + Status modal (V.0.3 R2).
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.9
 *   Source location: lines 1354-1474 (renderClaimDetail), 1476-1501 (showLightbox),
 *                    1503-1559 (showClaimStatusModal)
 *
 * Pure render. Caller wires:
 *   - `#backBtn` (navigate back to claims list)
 *   - `[data-photo-idx]` (open lightbox)
 *   - `#btnClaimStatus` (open status modal — admin only)
 */

import { escHtml, formatDate } from "../utils/format.js";
import {
    claimBadgeClass,
    CLAIM_STATUS_TH,
} from "../utils/lead-status.js";

/**
 * Render Claim detail page.
 * @param {{
 *   claim: {
 *     id: string|number,
 *     ticket?: string,
 *     status?: string,
 *     customer?: string,
 *     product?: string,
 *     model?: string,
 *     symptoms?: string,
 *     phone?: string,
 *     created_at?: string,
 *     photos?: string[],
 *     ai_analysis?: string,
 *     status_history?: Array<{to?:string,note?:string,at?:string}>,
 *     admin_note?: string,
 *     resolution?: string,
 *   },
 *   role: "admin"|"dealer",
 * }} state
 * @returns {string} HTML
 */
export function renderClaimDetail(state) {
    /** @type {any} */
    const claim = (state && state.claim) || {};
    const role = (state && state.role) || "dealer";
    const status = claim.status || "pending";
    const badgeCls = claimBadgeClass(status);

    let html = "";
    html += '<div class="liff-ai-header">';
    html +=
        '<button class="liff-ai-detail-back" id="backBtn">&#8592; กลับ</button>';
    html +=
        '<div class="liff-ai-greeting"><h1>ใบเคลม #' +
        escHtml(claim.ticket || claim.id) +
        "</h1></div>";
    html += "</div>";

    html += '<div style="padding: 12px 16px;">';
    html +=
        '<span class="liff-ai-badge liff-ai-badge-' +
        badgeCls +
        '" style="font-size:12px;padding:5px 12px;">' +
        escHtml(CLAIM_STATUS_TH[status] || status) +
        "</span>";
    html += "</div>";

    const photos = claim.photos || [];
    if (photos.length > 0) {
        html +=
            '<div class="liff-ai-detail-card" style="margin: 0 16px 12px;">';
        html += "<h3>รูปภาพ (" + photos.length + ")</h3>";
        html += '<div class="liff-ai-photos">';
        photos.forEach(function (url, idx) {
            html +=
                '<img src="' +
                escHtml(url) +
                '" class="liff-ai-photo-thumb" data-photo-idx="' +
                idx +
                '" alt="รูป ' +
                (idx + 1) +
                '">';
        });
        html += "</div></div>";
    }

    if (claim.ai_analysis) {
        html +=
            '<div class="liff-ai-detail-card" style="margin: 0 16px 12px;">';
        html += '<div class="liff-ai-analysis-box">';
        html += "<h4>&#129302; AI วิเคราะห์</h4>";
        html += "<p>" + escHtml(claim.ai_analysis) + "</p>";
        html += "</div></div>";
    }

    html +=
        '<div class="liff-ai-detail-card" style="margin: 0 16px 12px;">';
    html += "<h3>ข้อมูลเคลม</h3>";
    html +=
        '<div class="liff-ai-detail-row"><div class="liff-ai-detail-label">ลูกค้า</div><div class="liff-ai-detail-value">' +
        escHtml(claim.customer || "-") +
        "</div></div>";
    html +=
        '<div class="liff-ai-detail-row"><div class="liff-ai-detail-label">สินค้า</div><div class="liff-ai-detail-value">' +
        escHtml(claim.product || "-") +
        "</div></div>";
    if (claim.model) {
        html +=
            '<div class="liff-ai-detail-row"><div class="liff-ai-detail-label">รุ่นรถ</div><div class="liff-ai-detail-value">' +
            escHtml(claim.model) +
            "</div></div>";
    }
    html +=
        '<div class="liff-ai-detail-row"><div class="liff-ai-detail-label">อาการ</div><div class="liff-ai-detail-value">' +
        escHtml(claim.symptoms || "-") +
        "</div></div>";
    html +=
        '<div class="liff-ai-detail-row"><div class="liff-ai-detail-label">เบอร์โทร</div><div class="liff-ai-detail-value">' +
        escHtml(claim.phone || "-") +
        "</div></div>";
    html +=
        '<div class="liff-ai-detail-row"><div class="liff-ai-detail-label">วันที่สร้าง</div><div class="liff-ai-detail-value">' +
        formatDate(claim.created_at) +
        "</div></div>";
    html += "</div>";

    const history = claim.status_history || [];
    if (history.length > 0) {
        html +=
            '<div class="liff-ai-detail-card" style="margin: 0 16px 12px;">';
        html += "<h3>ประวัติสถานะ</h3>";
        html += renderStatusHistory(history);
        html += "</div>";
    }

    if (claim.admin_note) {
        html +=
            '<div class="liff-ai-detail-card" style="margin: 0 16px 12px;">';
        html += "<h3>หมายเหตุแอดมิน</h3>";
        html +=
            '<div style="font-size:13px;color:var(--ai-text-secondary);white-space:pre-line;">' +
            escHtml(claim.admin_note) +
            "</div>";
        html += "</div>";
    }

    if (claim.resolution) {
        html +=
            '<div class="liff-ai-detail-card" style="margin: 0 16px 12px;">';
        html += "<h3>ผลการแก้ไข</h3>";
        html +=
            '<div style="font-size:13px;color:var(--ai-success);white-space:pre-line;">' +
            escHtml(claim.resolution) +
            "</div>";
        html += "</div>";
    }

    html +=
        '<div style="padding: 12px 16px 20px; display: flex; gap: 10px;">';
    if (claim.phone) {
        html +=
            '<a href="tel:' +
            escHtml(claim.phone) +
            '" class="liff-ai-btn liff-ai-btn-call" style="flex:1;">โทรลูกค้า</a>';
    }
    if (role === "admin") {
        html +=
            '<button class="liff-ai-btn liff-ai-btn-primary" style="flex:1;" id="btnClaimStatus">เปลี่ยนสถานะ</button>';
    }
    html += "</div>";

    return html;
}

/**
 * Render the vertical timeline list of claim status history.
 * @param {Array<{to?:string,note?:string,at?:string}>} history
 * @returns {string} HTML
 */
export function renderStatusHistory(history) {
    let html = '<div class="liff-ai-timeline">';
    (history || []).forEach(function (h, i) {
        const cls = i === history.length - 1 ? "current" : "active";
        html += '<div class="liff-ai-tl-item ' + cls + '">';
        html +=
            '<div class="tl-title">' +
            escHtml(CLAIM_STATUS_TH[h.to] || h.to) +
            "</div>";
        if (h.note)
            html +=
                '<div style="font-size:12px;color:var(--ai-text-secondary);margin-top:2px;">' +
                escHtml(h.note) +
                "</div>";
        html += '<div class="tl-date">' + formatDate(h.at) + "</div>";
        html += "</div>";
    });
    html += "</div>";
    return html;
}

/**
 * Render the photo lightbox (overlay element body).
 * Inline V.3.9 builds via DOM API; Round 2 returns an HTML string the router
 * can `innerHTML` into the overlay <div>. Swipe handlers wire externally.
 *
 * @param {{photos: string[], index?: number}} state
 * @returns {string} HTML
 */
export function renderPhotoLightbox(state) {
    const photos = (state && state.photos) || [];
    const idx = (state && state.index) || 0;
    const url = photos[idx] || "";
    return (
        '<button class="liff-ai-lightbox-close" data-lightbox-close>&#10005;</button>' +
        '<img src="' +
        escHtml(url) +
        '" alt="รูปเต็ม">'
    );
}

/**
 * Render the body of the claim status-change modal.
 * Mirrors V.3.9 lines 1518-1529.
 *
 * @param {{currentStatus?: string}} state
 * @returns {string} HTML
 */
export function renderClaimStatusChange(state) {
    const currentStatus = (state && state.currentStatus) || "";
    const statuses = [
        { key: "admin_reviewed", label: "แอดมินตรวจแล้ว" },
        { key: "waiting_return_shipment", label: "รอส่งคืน" },
        { key: "parts_shipping", label: "กำลังส่งอะไหล่" },
        { key: "closed_resolved", label: "ปิด (แก้ไขแล้ว)" },
        { key: "closed_rejected", label: "ปิด (ปฏิเสธ)" },
    ];

    let html = "";
    html +=
        '<div style="font-size:14px;font-weight:700;margin-bottom:12px;color:#f1f5f9;">เปลี่ยนสถานะเคลม</div>';
    html += '<div class="liff-ai-field"><label>สถานะใหม่</label>';
    html +=
        '<select id="claimNewStatus" class="liff-ai-field" style="width:100%;padding:12px 14px;border:1.5px solid var(--ai-border);border-radius:var(--ai-radius-sm);font-size:14px;font-family:var(--ai-font);background:var(--ai-surface);color:var(--ai-text);min-height:48px;">';
    statuses.forEach(function (s) {
        const sel = s.key === currentStatus ? " selected" : "";
        html +=
            '<option value="' +
            escHtml(s.key) +
            '"' +
            sel +
            ">" +
            escHtml(s.label) +
            "</option>";
    });
    html += "</select></div>";
    html +=
        '<div class="liff-ai-field"><label>หมายเหตุ</label><textarea id="claimStatusNote" maxlength="500" placeholder="หมายเหตุ (ถ้ามี)" style="width:100%;padding:12px 14px;border:1.5px solid var(--ai-border);border-radius:var(--ai-radius-sm);font-size:14px;font-family:var(--ai-font);background:var(--ai-surface);color:var(--ai-text);min-height:80px;resize:vertical;"></textarea></div>';
    html +=
        '<button class="liff-ai-btn liff-ai-btn-primary" id="btnSaveClaimStatus" style="margin-bottom:8px;">บันทึก</button>';
    html +=
        '<button class="liff-ai-btn liff-ai-btn-danger" id="btnCancelClaimStatus">ยกเลิก</button>';

    return html;
}
