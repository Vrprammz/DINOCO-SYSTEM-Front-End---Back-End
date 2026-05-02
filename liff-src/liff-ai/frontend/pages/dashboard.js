/**
 * LIFF AI Frontend — Admin Dashboard page renderer (V.0.3 Round 2).
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.9
 *   Source location: inline `<script>` block
 *     - lines 847-897: renderAdminDashboard
 *     - lines 899-943: loadUrgentSection
 *
 * Pure render — returns HTML string. Caller is responsible for:
 *   - Mounting via `app.innerHTML = html`
 *   - Calling `renderBottomNav("dashboard")` after mount
 *   - Wiring `[data-nav-lead]`, `[data-nav-claim]`, `#btnLeads`, `#btnClaims`
 *
 * The `state` shape mirrors the `dashboard` REST response from
 * `/wp-json/liff-ai/v1/dashboard`:
 *   {
 *     updated_at, active_conversations, pending_claims,
 *     lead_stats: { total, closed }
 *   }
 * Plus optional:
 *   needsAttention[]   — leads with status=dealer_no_response
 *   pendingClaims[]    — claims with status=pending
 * (Inline V.3.9 fetches these via separate API calls in `loadUrgentSection`;
 * Round 2 keeps that boundary so the renderer stays pure.)
 */

import { escHtml, timeAgo } from "../utils/format.js";

/**
 * Render Admin dashboard top-level shell.
 * @param {{
 *   data: {
 *     updated_at?: string,
 *     active_conversations?: number,
 *     pending_claims?: number,
 *     lead_stats?: { total?: number, closed?: number },
 *   },
 *   logoUrl?: string,
 * }} state
 * @returns {string} HTML
 */
export function renderDashboard(state) {
    /** @type {any} */
    const d = (state && state.data) || {};
    /** @type {any} */
    const stats = d.lead_stats || {};
    const logo = (state && state.logoUrl) || "";

    let html = "";
    html += '<div class="liff-ai-header">';
    html += '<div class="liff-ai-header-top">';
    html +=
        '<img src="' +
        escHtml(logo) +
        '" class="liff-ai-logo" alt="DINOCO">';
    html +=
        '<div class="liff-ai-header-info"><div class="liff-ai-header-title">AI Command Center</div><div class="liff-ai-header-sub">Admin</div></div>';
    html += "</div>";
    html +=
        '<div class="liff-ai-greeting"><h1>สวัสดี Admin</h1><p>ข้อมูลอัพเดท ' +
        timeAgo(d.updated_at) +
        "</p></div>";
    html += "</div>";

    html += '<div class="liff-ai-stats">';
    html +=
        '<div class="liff-ai-stat-card orange"><div class="liff-ai-stat-label">สนทนาวันนี้</div><div class="liff-ai-stat-value orange">' +
        (d.active_conversations || 0) +
        "</div></div>";
    html +=
        '<div class="liff-ai-stat-card red"><div class="liff-ai-stat-label">เคลมรอดำเนินการ</div><div class="liff-ai-stat-value red">' +
        (d.pending_claims || 0) +
        "</div></div>";
    html +=
        '<div class="liff-ai-stat-card blue"><div class="liff-ai-stat-label">Lead ทั้งหมด</div><div class="liff-ai-stat-value blue">' +
        (stats.total || 0) +
        "</div></div>";
    html +=
        '<div class="liff-ai-stat-card green"><div class="liff-ai-stat-label">Lead ปิดงาน</div><div class="liff-ai-stat-value green">' +
        (stats.closed || 0) +
        "</div></div>";
    html += "</div>";

    html +=
        '<div class="liff-ai-section"><div class="liff-ai-section-title">ต้องดูแลด่วน</div></div>';
    html +=
        '<div id="urgentSection" style="min-height:40px;"><div class="liff-ai-loading" style="min-height:40px;padding:12px;"><div class="liff-ai-spinner" style="width:20px;height:20px;"></div></div></div>';

    html +=
        '<div class="liff-ai-section"><div class="liff-ai-section-title">เมนูด่วน</div></div>';
    html +=
        '<div style="padding: 0 16px; display: flex; gap: 10px; flex-wrap: wrap;">';
    html +=
        '<button class="liff-ai-btn liff-ai-btn-primary" style="flex:1;min-width:120px;" id="btnLeads">ดู Lead ทั้งหมด</button>';
    html +=
        '<button class="liff-ai-btn liff-ai-btn-outline" style="flex:1;min-width:120px;" id="btnClaims">ดูเคลมทั้งหมด</button>';
    html += "</div>";

    return html;
}

/**
 * Render the "ต้องดูแลด่วน" inner section.
 * Mirrors `loadUrgentSection()` body in V.3.9 lines 899-934 (without API calls).
 *
 * @param {{
 *   needsAttention?: Array<{
 *     _id?: string, id?: string,
 *     customerName?: string, productInterest?: string, createdAt?: string,
 *   }>,
 *   pendingClaims?: Array<{
 *     id?: string, ticket?: string, customer?: string,
 *     product?: string, created_at?: string,
 *   }>,
 * }} state
 * @returns {string} HTML
 */
export function renderUrgentSection(state) {
    const s = state || {};
    const needs = s.needsAttention || [];
    const pending = s.pendingClaims || [];

    let html = "";
    needs.forEach(function (lead) {
        html +=
            '<div class="liff-ai-urgent-card" data-nav-lead="' +
            escHtml(lead._id || lead.id) +
            '">';
        html += '<div class="liff-ai-urgent-label">Lead ไม่ตอบ</div>';
        html +=
            '<div class="liff-ai-urgent-text">' +
            escHtml(lead.customerName || "ลูกค้า") +
            " - " +
            escHtml(lead.productInterest || "") +
            "</div>";
        html +=
            '<div class="liff-ai-urgent-sub">' +
            timeAgo(lead.createdAt) +
            "</div>";
        html += "</div>";
    });

    pending.forEach(function (claim) {
        html +=
            '<div class="liff-ai-urgent-card" data-nav-claim="' +
            escHtml(String(claim.id)) +
            '">';
        html += '<div class="liff-ai-urgent-label">เคลมรอตรวจ</div>';
        html +=
            '<div class="liff-ai-urgent-text">#' +
            escHtml(claim.ticket || claim.id) +
            " - " +
            escHtml(claim.customer || "") +
            "</div>";
        html +=
            '<div class="liff-ai-urgent-sub">' +
            escHtml(claim.product || "") +
            " | " +
            timeAgo(claim.created_at) +
            "</div>";
        html += "</div>";
    });

    if (!html) {
        html =
            '<div class="liff-ai-empty" style="padding:16px;"><p>ไม่มีรายการเร่งด่วน</p></div>';
    }
    return html;
}
