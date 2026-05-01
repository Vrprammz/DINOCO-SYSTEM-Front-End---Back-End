/**
 * B2F Maker LIFF — Timeline + date helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.6
 *   Source location: inline `b2f_liff_page_js()`
 *     - lines 448-508: buildTimelineBars
 *     - lines 510-514: getMinDate
 *     - lines 954-1027: buildTimeline (status sequence renderer — Round 2)
 *
 * Round 1 ports: buildTimelineBars + getMinDate + scaffolds buildTimeline.
 * Full `buildTimeline()` body migrates in Round 2 alongside renderDetailPage.
 *
 * Color thresholds (delivery bar):
 *   - overdue (remaining < 0)  → #dc2626 (danger)
 *   - >80% elapsed             → #f59e0b (warning)
 *   - >50% elapsed             → #eab308 (caution)
 *   - else                     → #16a34a (success)
 *
 * Credit bar (THB only — foreign currency makers pay upfront, no credit):
 *   - >85% elapsed → #f59e0b
 *   - >60% elapsed → #eab308
 *   - else         → #16a34a
 */

import { L } from "./lang.js";
import { fmtDateShort } from "./format.js";

/**
 * @returns {string} ISO date (YYYY-MM-DD) for tomorrow — used as `min`
 *                   attribute on date-input fields.
 */
export function getMinDate() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
}

/**
 * Build the delivery + payment-due timeline bars for a PO detail card.
 * Returns "" when neither bar is applicable (e.g., draft PO has no ETA).
 *
 * @param {{
 *   expected_date?: string,
 *   po_expected_date?: string,
 *   created_date?: string,
 *   post_date?: string,
 *   status?: string,
 *   po_status?: string,
 *   actual_date?: string,
 *   po_actual_date?: string,
 *   credit_term_days?: number,
 *   payment_due_date?: string,
 *   currency?: string,
 *   po_currency?: string,
 * }} po
 * @returns {string} HTML
 */
export function buildTimelineBars(po) {
    let html = "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Bar 1: กำหนดส่ง (Delivery ETA)
    const eta = po.expected_date || po.po_expected_date;
    const created = po.created_date || po.post_date;
    const status = po.status || po.po_status || "";
    const showDeliveryBar =
        eta &&
        ["submitted", "confirmed", "amended", "delivering", "partial_received"].indexOf(
            status
        ) !== -1;

    if (showDeliveryBar) {
        const etaDate = new Date(eta);
        const createdDate = new Date(created);
        etaDate.setHours(0, 0, 0, 0);
        createdDate.setHours(0, 0, 0, 0);
        const totalDays = Math.max(
            1,
            Math.round((etaDate - createdDate) / 86400000)
        );
        const elapsed = Math.round((today - createdDate) / 86400000);
        const remaining = Math.round((etaDate - today) / 86400000);
        const pct = Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)));
        const overdue = remaining < 0;
        const color = overdue
            ? "#dc2626"
            : pct > 80
            ? "#f59e0b"
            : pct > 50
            ? "#eab308"
            : "#16a34a";
        const daysText = overdue
            ? '<span style="color:#dc2626">' +
              L(
                  "เลย " + Math.abs(remaining) + " วัน",
                  Math.abs(remaining) + " days overdue",
                  "逾期" + Math.abs(remaining) + "天"
              ) +
              "</span>"
            : L(
                  "เหลือ " + remaining + " วัน",
                  remaining + " days left",
                  "还剩" + remaining + "天"
              );

        html += '<div class="b2f-timeline-bar">';
        html +=
            '<div class="b2f-timeline-label"><span class="title">📦 ' +
            L("กำหนดส่ง", "Delivery ETA", "交货期限") +
            '</span><span class="days" style="color:' + color + '">' +
            daysText +
            "</span></div>";
        html +=
            '<div class="b2f-timeline-track"><div class="b2f-timeline-fill" style="width:' +
            (overdue ? 100 : pct) + "%;background:" + color + '"></div></div>';
        html +=
            '<div class="b2f-timeline-dates"><span>' +
            fmtDateShort(created) + "</span><span>" + fmtDateShort(eta) +
            "</span></div>";
        html += "</div>";
    }

    // Bar 2: ครบกำหนดจ่าย (THB only — foreign makers pay upfront)
    const actualDate = po.actual_date || po.po_actual_date;
    const creditDays = po.credit_term_days || 30;
    const dueDate = po.payment_due_date;
    const poCurrency = po.currency || po.po_currency || "THB";
    const showCreditBar =
        poCurrency === "THB" &&
        actualDate &&
        ["received", "partial_paid"].indexOf(status) !== -1;

    if (showCreditBar) {
        const rcvDate = new Date(actualDate);
        rcvDate.setHours(0, 0, 0, 0);
        const payDue = dueDate
            ? new Date(dueDate)
            : new Date(rcvDate.getTime() + creditDays * 86400000);
        payDue.setHours(0, 0, 0, 0);
        const creditTotal = Math.max(1, Math.round((payDue - rcvDate) / 86400000));
        const creditElapsed = Math.round((today - rcvDate) / 86400000);
        const creditRemaining = Math.round((payDue - today) / 86400000);
        const creditPct = Math.min(
            100,
            Math.max(0, Math.round((creditElapsed / creditTotal) * 100))
        );
        const creditOverdue = creditRemaining < 0;
        const creditColor = creditOverdue
            ? "#dc2626"
            : creditPct > 85
            ? "#f59e0b"
            : creditPct > 60
            ? "#eab308"
            : "#16a34a";
        const creditText = creditOverdue
            ? '<span style="color:#dc2626">' +
              L(
                  "เลย " + Math.abs(creditRemaining) + " วัน",
                  Math.abs(creditRemaining) + " days overdue",
                  "逾期" + Math.abs(creditRemaining) + "天"
              ) +
              "</span>"
            : L(
                  "เหลือ " + creditRemaining + " วัน",
                  creditRemaining + " days left",
                  "还剩" + creditRemaining + "天"
              );

        html += '<div class="b2f-timeline-bar">';
        html +=
            '<div class="b2f-timeline-label"><span class="title">💰 ' +
            L("ครบกำหนดจ่าย", "Payment Due", "付款期限") +
            '</span><span class="days" style="color:' + creditColor + '">' +
            creditText +
            "</span></div>";
        html +=
            '<div class="b2f-timeline-track"><div class="b2f-timeline-fill" style="width:' +
            (creditOverdue ? 100 : creditPct) + "%;background:" + creditColor + '"></div></div>';
        html +=
            '<div class="b2f-timeline-dates"><span>' +
            fmtDateShort(actualDate) + " (" +
            L("รับของ", "Received", "收货") + ")</span><span>" +
            fmtDateShort(dueDate || payDue.toISOString().split("T")[0]) +
            " (" + creditDays + " " +
            L("วัน", "days", "天") + ")</span></div>";
        html += "</div>";
    }

    return html;
}

/**
 * Build the per-status timeline (active/current/upcoming dots).
 * SCAFFOLD ONLY in Round 1 — Round 2 will port the full body of
 * `buildTimeline(po)` from inline V.4.6 lines 954-1027 alongside
 * `renderDetailPage`.
 *
 * @param {{ po_status?: string, status_history?: any[] }} _po
 * @returns {string} empty string in Round 1 — caller falls back to inline
 *                   when running on Vite path during Round 2 dev.
 */
export function buildTimeline(_po) {
    // Intentional Round 1 stub: inline renderDetailPage still owns the
    // full status-step list. Will be ported next round to keep diff small.
    return "";
}
