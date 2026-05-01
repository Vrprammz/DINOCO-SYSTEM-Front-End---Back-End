/**
 * B2F Maker LIFF — PO List page renderer (V.0.3 Round 2)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *   - lines 1138-1227: renderListPage + listFilter state + filter tab events
 *
 * Behavioral parity:
 *   - 6 filter tabs (all / submitted / confirmed / delivering / received /
 *     completed) with per-status counts.
 *   - Each PO card shows: number / status / item count / created date /
 *     ETA (optional) / total / V.4.6 mode-summary pill / status-info badges /
 *     timeline bars.
 *   - Tap card → goToPageWithPO('detail', id).
 *   - Tap filter tab → re-render same poList with new filter (state held
 *     in module-level `listFilter` mirroring inline `var listFilter`).
 *
 * V.4.6 mode-summary pill is flag-gated. Caller passes
 * `{ orderIntentEnabled: bool }` via the page's render call.
 */

import { L, statusLabel } from "../utils/lang.js";
import { formatNumber, curSym, formatDate, escHtml } from "../utils/format.js";
import { $, $$ } from "../utils/dom.js";
import {
    modeSummaryHtml,
    buildStatusInfoBadges,
} from "../utils/badges.js";
import { buildTimelineBars } from "../utils/timeline.js";

/**
 * Module-private filter state — mirrors inline `var listFilter = "all"`.
 * Persists across re-renders within the same SPA session.
 */
let listFilter = "all";

/**
 * Test-only state reset.
 */
export function _resetListFilter() {
    listFilter = "all";
}

/**
 * @returns {string} current filter key ("all" | status name)
 */
export function getListFilter() {
    return listFilter;
}

/**
 * Render the PO List page into `#b2f-app`.
 *
 * Mirrors inline `renderListPage(poList)` V.4.7 line 1154-1227 verbatim.
 *
 * @param {Array<Object>} poList — full list (filtered by tab in render)
 * @param {{ orderIntentEnabled?: boolean }} [opts]
 * @returns {void}
 */
export function renderListPage(poList, opts = {}) {
    const app = $("#b2f-app");
    if (!app) return;
    const list = Array.isArray(poList) ? poList : [];

    const filters = [
        { key: "all", label: L("ทั้งหมด", "All", "全部") },
        { key: "submitted", label: L("รอยืนยัน", "Pending", "待确认") },
        { key: "confirmed", label: L("ยืนยันแล้ว", "Confirmed", "已确认") },
        { key: "delivering", label: L("กำลังจัดส่ง", "Shipping", "发货中") },
        { key: "received", label: L("รับของแล้ว", "Received", "已收货") },
        { key: "completed", label: L("เสร็จสิ้น", "Completed", "已完成") },
    ];

    let filtersHtml = "";
    filters.forEach(function (f) {
        const count =
            f.key === "all"
                ? list.length
                : list.filter(function (p) {
                      return p.po_status === f.key;
                  }).length;
        filtersHtml +=
            '<button class="b2f-filter-tab ' +
            (listFilter === f.key ? "active" : "") +
            '" data-filter="' +
            f.key +
            '">' +
            f.label +
            " (" +
            count +
            ")</button>";
    });

    const filtered =
        listFilter === "all"
            ? list
            : list.filter(function (p) {
                  return p.po_status === listFilter;
              });

    let cardsHtml = "";
    if (filtered.length === 0) {
        cardsHtml =
            '<div class="b2f-empty"><div class="icon">📦</div><p>' +
            L("ไม่มีรายการ PO", "No purchase orders", "暂无采购订单") +
            "</p></div>";
    } else {
        filtered.forEach(function (po) {
            cardsHtml +=
                '<div class="b2f-po-card" data-po-id="' +
                escHtml(String(po.ID || po.id)) +
                '">' +
                '<div class="po-header">' +
                '<span class="po-number">' +
                escHtml(po.po_number) +
                "</span>" +
                '<span class="b2f-status b2f-status-' +
                escHtml(po.po_status) +
                '">' +
                statusLabel(po.po_status) +
                "</span>" +
                "</div>" +
                '<div class="po-meta">' +
                Number(po.po_item_count || (po.po_items || []).length) +
                " " +
                L("รายการ", "items", "项") +
                " · " +
                L("สร้าง", "Created", "创建") +
                ": " +
                formatDate(po.post_date || po.created_date) +
                (po.po_expected_date
                    ? " · ETA: " + formatDate(po.po_expected_date)
                    : "") +
                "</div>" +
                '<div class="po-total">' +
                curSym(po) +
                formatNumber(po.po_total_amount) +
                "</div>" +
                /* V.4.6: Compact 3-mode breakdown badge (flag-gated) */
                modeSummaryHtml(po, opts) +
                buildStatusInfoBadges(po) +
                buildTimelineBars(po) +
                "</div>";
        });
    }

    app.innerHTML =
        '<div class="b2f-liff-header">' +
        '<div class="b2f-header-content">' +
        "<h1>📋 " +
        L("รายการ PO ทั้งหมด", "Purchase Orders", "采购订单") +
        "</h1>" +
        '<div class="b2f-sub">' +
        L(
            "จำนวน " + list.length + " รายการ",
            list.length + " orders",
            list.length + " 个订单"
        ) +
        "</div>" +
        "</div>" +
        '<img src="https://www.dinoco.in.th/wp-content/uploads/2026/01/sss.png" class="b2f-logo" alt="DINOCO">' +
        "</div>" +
        '<div class="b2f-filter-tabs">' +
        filtersHtml +
        "</div>" +
        '<div id="b2f-po-list">' +
        cardsHtml +
        "</div>";

    // Filter tab click → switch + re-render
    $$(".b2f-filter-tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
            listFilter = this.dataset.filter;
            renderListPage(list, opts);
        });
    });

    // Card click → goToPageWithPO/detail. Inline V.4.7 uses globals
    // `goToPageWithPO` + `goToPage` — preserved here verbatim. Round 4
    // will swap to a shared router helper.
    $$(".b2f-po-card").forEach(function (card) {
        card.addEventListener("click", function () {
            const poId =
                this.dataset.poId || this.getAttribute("data-po-id");
            const w = typeof window !== "undefined" ? window : null;
            if (poId && w && typeof w.goToPageWithPO === "function") {
                w.goToPageWithPO("detail", poId);
            } else if (w && typeof w.goToPage === "function") {
                w.goToPage("detail");
            }
        });
    });
}
