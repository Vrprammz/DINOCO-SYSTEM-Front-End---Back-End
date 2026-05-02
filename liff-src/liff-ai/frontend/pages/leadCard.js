/**
 * LIFF AI Frontend — Lead card row renderer (V.0.3 Round 2).
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.9
 *   Source location: lines 1014-1034 (renderLeadCard)
 *
 * Shared by Dealer dashboard + Lead list. Pure HTML.
 */

import { escHtml, timeAgo } from "../utils/format.js";
import {
    statusBadgeClass,
    LEAD_STATUS_TH,
} from "../utils/lead-status.js";

/**
 * Render one lead card.
 * @param {{
 *   _id?: string, id?: string,
 *   status?: string,
 *   customerName?: string,
 *   productInterest?: string,
 *   platform?: string,
 *   province?: string,
 *   createdAt?: string,
 * }} lead
 * @returns {string} HTML
 */
export function renderLeadCard(lead) {
    const id = lead._id || lead.id || "";
    const status = lead.status || "lead_created";
    const badgeCls = statusBadgeClass(status);

    let html =
        '<div class="liff-ai-lead-card" data-lead-id="' +
        escHtml(id) +
        '" style="margin: 0 16px 8px;">';
    html += '<div class="liff-ai-lead-top">';
    html += "<div>";
    html +=
        '<div class="liff-ai-lead-name">' +
        escHtml(lead.customerName || "ลูกค้า") +
        "</div>";
    html +=
        '<div class="liff-ai-lead-product">' +
        escHtml(lead.productInterest || "-") +
        "</div>";
    html += "</div>";
    html +=
        '<span class="liff-ai-badge liff-ai-badge-' +
        badgeCls +
        '">' +
        escHtml(LEAD_STATUS_TH[status] || status) +
        "</span>";
    html += "</div>";
    html += '<div class="liff-ai-lead-meta">';
    if (lead.platform)
        html += "<span>" + escHtml(lead.platform.toUpperCase()) + "</span>";
    if (lead.province)
        html += "<span>" + escHtml(lead.province) + "</span>";
    html += "<span>" + timeAgo(lead.createdAt) + "</span>";
    html += "</div>";
    html += "</div>";
    return html;
}
