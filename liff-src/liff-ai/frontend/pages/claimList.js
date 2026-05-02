/**
 * LIFF AI Frontend — Claim List page + filter (V.0.3 Round 2).
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.9
 *   Source location: lines 1273-1347 (renderClaimList + renderClaimCard)
 *
 * 5 filter chips: ทั้งหมด / รอตรวจ / กำลังดำเนินการ / เสร็จ / ปฏิเสธ.
 * Pure render. Caller wires `#backBtn`, `[data-claim-id]`, `[data-claim-filter]`.
 */

import { escHtml, timeAgo } from "../utils/format.js";
import {
    claimBadgeClass,
    CLAIM_STATUS_TH,
} from "../utils/lead-status.js";
import { renderLeadCard } from "./leadCard.js";

/**
 * Render Claim list page.
 * @param {{
 *   claims: Array<object>,
 *   total?: number,
 *   filter?: string|null,
 * }} state
 * @returns {string} HTML
 */
export function renderClaimList(state) {
    const claims = (state && state.claims) || [];
    const total = (state && state.total) || claims.length;
    const filter = (state && state.filter) || null;

    let html = "";
    html += '<div class="liff-ai-header">';
    html += '<div class="liff-ai-header-top">';
    html +=
        '<button class="liff-ai-detail-back" id="backBtn">&#8592; กลับ</button>';
    html +=
        '<div class="liff-ai-header-info"><div class="liff-ai-header-title">เคลมทั้งหมด</div><div class="liff-ai-header-sub">' +
        total +
        " รายการ</div></div>";
    html += "</div></div>";

    html += renderClaimFilter(filter);

    if (claims.length === 0) {
        html +=
            '<div class="liff-ai-empty"><div class="icon">&#128269;</div><p>ไม่พบใบเคลม</p></div>';
    } else {
        claims.forEach(function (claim) {
            html += renderClaimCard(claim);
        });
    }

    return html;
}

/**
 * Render the 5 filter chips for the claim list.
 * @param {string|null} filter currently-active filter key (null = "all")
 * @returns {string} HTML
 */
export function renderClaimFilter(filter) {
    const filters = [
        { key: "all", label: "ทั้งหมด" },
        { key: "pending", label: "รอตรวจ" },
        { key: "reviewing", label: "กำลังดำเนินการ" },
        { key: "completed", label: "เสร็จ" },
        { key: "rejected", label: "ปฏิเสธ" },
    ];

    let html = '<div class="liff-ai-filters" style="padding-top:12px;">';
    filters.forEach(function (f) {
        const active =
            (!filter && f.key === "all") || filter === f.key
                ? " active"
                : "";
        html +=
            '<button class="liff-ai-filter-btn' +
            active +
            '" data-claim-filter="' +
            escHtml(f.key) +
            '">' +
            escHtml(f.label) +
            "</button>";
    });
    html += "</div>";
    return html;
}

/**
 * Render one claim card.
 * @param {{
 *   id?: string|number,
 *   ticket?: string,
 *   customer?: string,
 *   product?: string,
 *   status?: string,
 *   created_at?: string,
 * }} claim
 * @returns {string} HTML
 */
export function renderClaimCard(claim) {
    const status = claim.status || "pending";
    const badgeCls = claimBadgeClass(status);

    let html =
        '<div class="liff-ai-claim-card" data-claim-id="' +
        escHtml(String(claim.id)) +
        '">';
    html +=
        '<div class="liff-ai-claim-ticket">#' +
        escHtml(String(claim.ticket || claim.id || "")) +
        "</div>";
    html +=
        '<div class="liff-ai-claim-customer">' +
        escHtml(claim.customer || "ลูกค้า") +
        "</div>";
    html +=
        '<div class="liff-ai-claim-product">' +
        escHtml(claim.product || "-") +
        "</div>";
    html += '<div class="liff-ai-claim-bottom">';
    html +=
        '<span class="liff-ai-badge liff-ai-badge-' +
        badgeCls +
        '">' +
        escHtml(CLAIM_STATUS_TH[status] || status) +
        "</span>";
    html +=
        '<span style="font-size:11px;color:var(--ai-text-muted);">' +
        timeAgo(claim.created_at) +
        "</span>";
    html += "</div>";
    html += "</div>";
    return html;
}

/**
 * Lead list page renderer — V.3.9 lines 950-1012.
 * (Co-located here so we don't add yet another file. Round 4 router-rewrite
 * may split.)
 *
 * @param {{
 *   leads: Array<object>,
 *   total?: number,
 *   filter?: string|null,
 * }} state
 * @returns {string} HTML
 */
export function renderLeadList(state) {
    const leads = (state && state.leads) || [];
    const total = (state && state.total) || leads.length;
    const filter = (state && state.filter) || null;

    let html = "";
    html += '<div class="liff-ai-header">';
    html += '<div class="liff-ai-header-top">';
    html +=
        '<button class="liff-ai-detail-back" id="backBtn">&#8592; กลับ</button>';
    html +=
        '<div class="liff-ai-header-info"><div class="liff-ai-header-title">Lead ทั้งหมด</div><div class="liff-ai-header-sub">' +
        total +
        " รายการ</div></div>";
    html += "</div></div>";

    html += renderLeadFilter(filter);

    if (leads.length === 0) {
        html +=
            '<div class="liff-ai-empty"><div class="icon">&#128269;</div><p>ไม่พบ Lead</p></div>';
    } else {
        leads.forEach(function (lead) {
            html += renderLeadCard(lead);
        });
    }

    return html;
}

/**
 * Lead list 5 filter chips (V.3.9 lines 968-979).
 * @param {string|null} filter
 * @returns {string} HTML
 */
export function renderLeadFilter(filter) {
    const filters = [
        { key: "all", label: "ทั้งหมด" },
        { key: "dealer_notified", label: "รอรับ" },
        { key: "checking_contact", label: "กำลังติดต่อ" },
        { key: "waiting_order", label: "รอสั่ง" },
        { key: "closed_satisfied", label: "ปิดงาน" },
    ];

    let html = '<div class="liff-ai-filters" style="padding-top:12px;">';
    filters.forEach(function (f) {
        const active =
            (!filter && f.key === "all") || filter === f.key
                ? " active"
                : "";
        html +=
            '<button class="liff-ai-filter-btn' +
            active +
            '" data-filter="' +
            escHtml(f.key) +
            '">' +
            escHtml(f.label) +
            "</button>";
    });
    html += "</div>";
    return html;
}
