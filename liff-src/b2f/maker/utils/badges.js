/**
 * B2F Maker LIFF — Badge HTML builders (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.6
 *   Source location: inline `b2f_liff_page_js()`
 *     - lines 274-287: modeBadgeHtml (V.4.3)
 *     - lines 289-345: modeSummaryHtml (V.4.6)
 *     - lines 519-519: statusLabel (re-exported from lang.js)
 *     - lines 521-564: buildStatusInfoBadges (V.3.16)
 *
 * V.4.3 Order Intent (read-only for Maker):
 *   - 🟣 full_set     → "ชุดเต็ม" / "Full Set" / "整套"
 *   - 🟠 sub_unit     → "แยกชุด" / "Sub-unit" / "分组"
 *   - ⚪ single_leaf  → "ชิ้นเดี่ยว" / "Single" / "单件"
 *
 * Maker NEVER sees `intent_notes` (admin-only — REST API strips this field
 * for non-admin JWT). These helpers defensively ignore the field.
 */

import { L } from "./lang.js";
import { escHtml } from "./format.js";

/**
 * Render an inline order-mode badge for a single item.
 * Returns "" when item lacks `poi_order_mode` / `order_mode`.
 *
 * @param {{ poi_order_mode?: string, order_mode?: string }} item
 * @returns {string} HTML span or empty string
 */
export function modeBadgeHtml(item) {
    const mode = (item && (item.poi_order_mode || item.order_mode)) || "";
    if (!mode) return "";
    let label = "";
    let cls = "";
    switch (mode) {
        case "full_set":
            label = L("ชุดเต็ม", "Full Set", "整套");
            cls = "mode-full-set";
            break;
        case "sub_unit":
            label = L("แยกชุด", "Sub-unit", "分组");
            cls = "mode-sub-unit";
            break;
        case "single_leaf":
            label = L("ชิ้นเดี่ยว", "Single", "单件");
            cls = "mode-single-leaf";
            break;
        default:
            return "";
    }
    return '<span class="item-mode-badge ' + cls + '">' + escHtml(label) + "</span>";
}

/**
 * Render the compact 3-mode breakdown for a PO list card.
 * Returns "" when ORDER_INTENT_ENABLED is false, no items, or no items
 * carry `poi_order_mode` (legacy POs).
 *
 * Output examples:
 *   - all full_set  → "🟣 ทั้งหมด ชุดเต็ม (10)"
 *   - mixed         → "🟣 5  🟠 3  ⚪ 2"
 *
 * Defensively ignores `intent_notes`.
 *
 * @param {{ po_items?: any[], items?: any[] }} po
 * @param {{ orderIntentEnabled?: boolean }} [opts]
 * @returns {string} HTML div or empty string
 */
export function modeSummaryHtml(po, opts = {}) {
    if (!opts.orderIntentEnabled) return "";
    const items = (po && (po.po_items || po.items)) || [];
    if (!items.length) return "";

    const counts = { full_set: 0, sub_unit: 0, single_leaf: 0 };
    let anyMode = false;
    for (let i = 0; i < items.length; i++) {
        const it = items[i] || {};
        const mode = it.poi_order_mode || it.order_mode || "";
        const qty = parseInt(it.poi_qty_ordered || it.qty_ordered || 0, 10) || 0;
        if (qty <= 0) continue;
        if (mode === "full_set" || mode === "sub_unit" || mode === "single_leaf") {
            counts[mode] += qty;
            anyMode = true;
        }
    }
    if (!anyMode) return "";

    const modesPresent = [];
    if (counts.full_set > 0) modesPresent.push("full_set");
    if (counts.sub_unit > 0) modesPresent.push("sub_unit");
    if (counts.single_leaf > 0) modesPresent.push("single_leaf");

    const labelMap = {
        full_set: { icon: "🟣", th: "ชุดเต็ม", en: "Full Set", zh: "整套", cls: "full-set" },
        sub_unit: { icon: "🟠", th: "แยกชุด", en: "Sub-unit", zh: "分组", cls: "sub-unit" },
        single_leaf: {
            icon: "⚪",
            th: "ชิ้นเดี่ยว",
            en: "Single",
            zh: "单件",
            cls: "single-leaf",
        },
    };

    let html = '<div class="po-mode-summary">';
    if (modesPresent.length === 1) {
        const only = modesPresent[0];
        const m = labelMap[only];
        const allLabel = L("ทั้งหมด " + m.th, "All " + m.en, "全部 " + m.zh);
        html +=
            '<span class="po-mode-pill all-mode">' +
            m.icon + " " + escHtml(allLabel) +
            " (" + counts[only] + ")</span>";
    } else {
        for (let k = 0; k < modesPresent.length; k++) {
            const key = modesPresent[k];
            const info = labelMap[key];
            html +=
                '<span class="po-mode-pill ' + info.cls + '">' +
                info.icon + " " + counts[key] + "</span>";
        }
    }
    html += "</div>";
    return html;
}

/**
 * Build status info badges (waiting / reject / success / payment) based
 * on PO status + items aggregate (shipped vs received vs rejected).
 *
 * Mirrors inline `buildStatusInfoBadges(po)` V.3.16 verbatim — same status
 * branches and same Thai/English/Chinese label set. Aggregate math is
 * defensive (Number() coercion, 0 fallback).
 *
 * @param {{
 *   items?: any[],
 *   po_items?: any[],
 *   po_status?: string,
 * }} po
 * @returns {string} concatenated badge HTML
 */
export function buildStatusInfoBadges(po) {
    const items = (po && (po.items || po.po_items)) || [];
    const status = (po && po.po_status) || "";
    let html = "";

    let totalPendingInspect = 0;
    let totalRejected = 0;
    items.forEach(function (it) {
        const shipped = Number(it.poi_qty_shipped || it.qty_shipped || 0);
        const received = Number(it.poi_qty_received || it.qty_received || 0);
        const rejected = Number(it.poi_qty_rejected || it.qty_rejected || 0);
        const pending = shipped - received;
        if (pending > 0) totalPendingInspect += pending;
        if (rejected > 0) totalRejected += rejected;
    });

    if (status === "delivering") {
        if (totalPendingInspect > 0) {
            html +=
                '<div class="b2f-status-info info-waiting">🔍 ' +
                L(
                    "รอ DINOCO ตรวจรับสินค้า " + totalPendingInspect + " ชิ้น",
                    "Pending inspection: " + totalPendingInspect + " items",
                    "等待DINOCO验收 " + totalPendingInspect + " 件"
                ) +
                "</div>";
        } else if (items.length === 0) {
            html +=
                '<div class="b2f-status-info info-waiting">🔍 ' +
                L("รอ DINOCO ตรวจรับสินค้า", "Pending inspection", "等待DINOCO验收") +
                "</div>";
        }
    } else if (status === "partial_received") {
        if (totalRejected > 0) {
            html +=
                '<div class="b2f-status-info info-reject">⚠️ ' +
                L(
                    "ถูก reject " + totalRejected + " ชิ้น กรุณาส่งทดแทน",
                    totalRejected + " items rejected — replacement required",
                    "质检不合格 " + totalRejected + " 件 — 需补发"
                ) +
                "</div>";
        }
        if (totalPendingInspect > 0) {
            html +=
                '<div class="b2f-status-info info-waiting">🔍 ' +
                L(
                    "รอตรวจรับ " + totalPendingInspect + " ชิ้น",
                    "Pending inspection: " + totalPendingInspect + " items",
                    "待验收: " + totalPendingInspect + " 件"
                ) +
                "</div>";
        }
        if (totalRejected === 0 && totalPendingInspect === 0 && items.length === 0) {
            html +=
                '<div class="b2f-status-info info-reject">⚠️ ' +
                L(
                    "รับบางส่วน — ดูรายละเอียดใน PO",
                    "Partial received — see PO details",
                    "部分收货 — 请查看PO详情"
                ) +
                "</div>";
        }
    } else if (status === "received") {
        html +=
            '<div class="b2f-status-info info-success">✅ ' +
            L(
                "DINOCO รับของครบแล้ว รอชำระเงิน",
                "Received — pending payment",
                "已收货 — 等待付款"
            ) +
            "</div>";
    } else if (status === "partial_paid") {
        html +=
            '<div class="b2f-status-info info-payment">💰 ' +
            L("จ่ายแล้วบางส่วน", "Partial paid", "部分付款") +
            "</div>";
    } else if (status === "paid" || status === "completed") {
        html +=
            '<div class="b2f-status-info info-success">✅ ' +
            L("จ่ายครบ — PO สำเร็จ", "Paid — PO completed", "已付款 — PO已完成") +
            "</div>";
    }

    return html;
}

// Re-export statusLabel from lang.js for convenience — Round 2 page
// renderers will import everything from `./utils/badges.js`.
export { statusLabel } from "./lang.js";
