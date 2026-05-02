/**
 * LIFF AI Frontend — Dealer Dashboard page renderer (V.0.3 Round 2).
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.9
 *   Source location: inline `<script>` block lines 788-840 (renderDealerDashboard)
 *
 * Dealer-facing landing — only 2 stat cards + 2 lead sections (pending/recent).
 * Bottom nav has 2 tabs (dealer + leads); admin has 4.
 *
 * Pure render — returns HTML string. Caller mounts via `app.innerHTML = html`
 * and binds `[data-lead-id]` clicks → navigate("lead", {id}).
 */

import { escHtml, timeAgo } from "../utils/format.js";
import { renderLeadCard } from "./leadCard.js";

/**
 * Render Dealer landing dashboard.
 * @param {{
 *   data: {
 *     dealer_name?: string,
 *     updated_at?: string,
 *     new_leads?: number,
 *     active_leads?: number,
 *     pending_leads?: Array<object>,
 *     recent_leads?: Array<object>,
 *   },
 *   logoUrl?: string,
 * }} state
 * @returns {string} HTML
 */
export function renderDealer(state) {
    /** @type {any} */
    const d = (state && state.data) || {};
    const logo = (state && state.logoUrl) || "";

    let html = "";
    html += '<div class="liff-ai-header">';
    html += '<div class="liff-ai-header-top">';
    html +=
        '<img src="' +
        escHtml(logo) +
        '" class="liff-ai-logo" alt="DINOCO">';
    html +=
        '<div class="liff-ai-header-info"><div class="liff-ai-header-title">AI Command Center</div><div class="liff-ai-header-sub">สำหรับตัวแทน</div></div>';
    html += "</div>";
    html +=
        '<div class="liff-ai-greeting"><h1>' +
        escHtml(d.dealer_name || "ร้านค้า") +
        "</h1><p>ข้อมูลอัพเดท " +
        timeAgo(d.updated_at) +
        "</p></div>";
    html += "</div>";

    html += '<div class="liff-ai-stats">';
    html +=
        '<div class="liff-ai-stat-card orange"><div class="liff-ai-stat-label">Lead ใหม่</div><div class="liff-ai-stat-value orange">' +
        (d.new_leads || 0) +
        "</div></div>";
    html +=
        '<div class="liff-ai-stat-card blue"><div class="liff-ai-stat-label">กำลังดูแล</div><div class="liff-ai-stat-value blue">' +
        (d.active_leads || 0) +
        "</div></div>";
    html += "</div>";

    const pending = d.pending_leads || [];
    const recent = d.recent_leads || [];

    if (pending.length > 0) {
        html +=
            '<div class="liff-ai-section"><div class="liff-ai-section-title">Lead ที่ต้องกดรับ</div></div>';
        pending.forEach(function (lead) {
            html += renderLeadCard(lead);
        });
    }

    if (recent.length > 0) {
        html +=
            '<div class="liff-ai-section"><div class="liff-ai-section-title">Lead ล่าสุด</div></div>';
        recent.forEach(function (lead) {
            html += renderLeadCard(lead);
        });
    }

    if (pending.length === 0 && recent.length === 0) {
        html +=
            '<div class="liff-ai-empty"><div class="icon">&#128522;</div><p>ยังไม่มี Lead ในตอนนี้</p></div>';
    }

    return html;
}
