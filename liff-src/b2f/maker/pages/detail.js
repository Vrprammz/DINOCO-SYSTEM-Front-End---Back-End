/**
 * B2F Maker LIFF — Detail page renderer (V.0.5 Round 4)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *   - lines 878-967: renderDetailPage + renderDetailItem
 *
 * Behavioral parity:
 *   - DD-3 hierarchy grouping (mirrors confirm page).
 *   - Image thumbnail when item has `image_url` / `poi_image_url`.
 *   - Per-item received progress (`receivedPct`) + reject count.
 *   - Status-aware action buttons (Confirm / Reschedule / Ship more).
 *   - Round 4: inline `onclick="goToPage('...')"` migrated to
 *     `data-action="navigate"` + `data-view="..."` (event delegation in
 *     entry.js). Visual + behavior identical (REG-029 byte-equivalent).
 *   - Calls `buildTimeline(po)` (now full impl in utils/timeline.js).
 */

import { L, statusLabel } from "../utils/lang.js";
import { formatNumber, curSym, formatDate, escHtml } from "../utils/format.js";
import { $ } from "../utils/dom.js";
import { modeBadgeHtml } from "../utils/badges.js";
import { buildTimeline } from "../utils/timeline.js";

/**
 * Render a single detail item row with image thumbnail + progress.
 *
 * Mirrors inline `renderDetailItem(item)` V.4.7 line 892-910.
 *
 * @param {Object} item — PO item
 * @param {Object} po   — parent PO (currency)
 * @returns {string} HTML
 */
export function renderDetailItem(item, po) {
    const lineTotal = (item.poi_qty_ordered || 0) * (item.poi_unit_cost || 0);
    const receivedPct =
        item.poi_qty_ordered > 0
            ? Math.round(
                  ((item.poi_qty_received || 0) / item.poi_qty_ordered) * 100
              )
            : 0;
    const imgSrc = item.image_url || item.poi_image_url || "";
    const imgHtml = imgSrc
        ? '<img class="item-img" src="' + escHtml(imgSrc) + '" alt="">'
        : "";
    return (
        '<div class="b2f-liff-item">' +
        imgHtml +
        '<div class="item-detail">' +
        '<div class="item-sku">' +
        escHtml(item.poi_sku) +
        modeBadgeHtml(item) +
        "</div>" +
        '<div class="item-name">' +
        escHtml(item.poi_product_name) +
        "</div>" +
        '<div class="item-meta">' +
        "<span>" +
        formatNumber(item.poi_unit_cost) +
        " x " +
        Number(item.poi_qty_ordered).toLocaleString() +
        "</span>" +
        '<span class="item-total">' +
        curSym(po) +
        formatNumber(lineTotal) +
        "</span>" +
        "</div>" +
        '<div class="item-meta" style="margin-top:4px;">' +
        '<span style="font-size:11px;">' +
        L("รับแล้ว", "Received", "已收") +
        ": " +
        Number(item.poi_qty_received || 0).toLocaleString() +
        " / " +
        Number(item.poi_qty_ordered).toLocaleString() +
        " (" +
        receivedPct +
        "%)</span>" +
        (item.poi_qty_rejected > 0
            ? '<span style="font-size:11px;color:var(--b2f-danger);">reject: ' +
              Number(item.poi_qty_rejected).toLocaleString() +
              "</span>"
            : "") +
        "</div></div></div>"
    );
}

/**
 * Render the PO Detail page into `#b2f-app`.
 *
 * Mirrors inline `renderDetailPage(po)` V.4.7 line 878-967 verbatim.
 *
 * @param {Object} po
 * @returns {void}
 */
export function renderDetailPage(po) {
    const app = $("#b2f-app");
    if (!app) return;
    const items = po.po_items || [];

    // V.4.2 Hierarchy: Group items by SET parent
    const setGroups = {};
    const standalone = [];
    items.forEach(function (item) {
        const psku = (item.poi_parent_sku || item.parent_sku || "").trim();
        if (psku) {
            if (!setGroups[psku]) {
                setGroups[psku] = {
                    name: item.poi_parent_name || item.parent_name || psku,
                    children: [],
                };
            }
            setGroups[psku].children.push(item);
        } else {
            standalone.push(item);
        }
    });

    let itemsHtml = "";
    Object.keys(setGroups).forEach(function (psku) {
        const g = setGroups[psku];
        itemsHtml +=
            '<div style="margin:8px 0 4px;padding:4px 8px;background:#ede9fe;border-radius:6px;font-size:12px;font-weight:700;color:#7c3aed;">🟣 ' +
            escHtml(g.name) +
            "</div>";
        g.children.forEach(function (item) {
            itemsHtml += renderDetailItem(item, po);
        });
    });
    standalone.forEach(function (item) {
        itemsHtml += renderDetailItem(item, po);
    });

    const timeline = buildTimeline(po);

    let actionsHtml = "";
    if (po.po_status === "submitted" || po.po_status === "amended") {
        actionsHtml =
            '<div class="b2f-liff-actions">' +
            '<button class="b2f-btn b2f-btn-accent" data-action="navigate" data-view="confirm" style="width:100%;">✅ ' +
            L("ไปยืนยัน PO", "Confirm PO", "确认订单") +
            "</button></div>";
    } else if (po.po_status === "confirmed") {
        actionsHtml =
            '<div class="b2f-liff-actions">' +
            '<button class="b2f-btn b2f-btn-outline" data-action="navigate" data-view="reschedule">📅 ' +
            L("ขอเลื่อนวันส่ง", "Request reschedule", "申请延期") +
            "</button></div>";
    } else if (
        po.po_status === "delivering" ||
        po.po_status === "partial_received"
    ) {
        actionsHtml =
            '<div class="b2f-liff-actions">' +
            '<button class="b2f-btn b2f-btn-accent" data-action="navigate" data-view="deliver" style="width:100%;">📦 ' +
            L("แจ้งส่งของเพิ่ม", "Ship more items", "继续发货") +
            "</button></div>";
    }

    app.innerHTML =
        '<div class="b2f-liff-header">' +
        '<div class="b2f-header-content">' +
        "<h1>📄 " +
        L("รายละเอียด PO", "PO Detail", "PO详情") +
        "</h1>" +
        '<div class="b2f-po-number">' +
        escHtml(po.po_number) +
        "</div>" +
        '<div class="b2f-sub"><span class="b2f-status b2f-status-' +
        escHtml(po.po_status) +
        '">' +
        statusLabel(po.po_status) +
        "</span></div>" +
        "</div>" +
        '<img src="https://www.dinoco.in.th/wp-content/uploads/2026/01/sss.png" class="b2f-logo" alt="DINOCO">' +
        "</div>" +
        '<div class="b2f-liff-card">' +
        "<h2>📅 " +
        L("ข้อมูล PO", "PO Info", "PO信息") +
        "</h2>" +
        '<div style="font-size:13px;line-height:2;">' +
        "<div><strong>" +
        L("วันที่สร้าง", "Created", "创建日期") +
        ":</strong> " +
        formatDate(po.post_date || po.created_date) +
        "</div>" +
        (po.po_requested_date
            ? "<div><strong>" +
              L("ต้องการรับภายใน", "Requested by", "要求交期") +
              ":</strong> " +
              formatDate(po.po_requested_date) +
              "</div>"
            : "") +
        (po.po_expected_date
            ? "<div><strong>" +
              L("คาดว่าจะส่ง", "Expected delivery", "预计交货") +
              ":</strong> " +
              formatDate(po.po_expected_date) +
              "</div>"
            : "") +
        (po.po_actual_date
            ? "<div><strong>" +
              L("ส่งจริง", "Actual delivery", "实际交货") +
              ":</strong> " +
              formatDate(po.po_actual_date) +
              "</div>"
            : "") +
        (po.po_admin_note
            ? "<div><strong>" +
              L("หมายเหตุ Admin", "Admin note", "Admin备注") +
              ":</strong> " +
              escHtml(po.po_admin_note) +
              "</div>"
            : "") +
        (po.po_maker_note
            ? "<div><strong>" +
              L("หมายเหตุ Maker", "Maker note", "供应商备注") +
              ":</strong> " +
              escHtml(po.po_maker_note) +
              "</div>"
            : "") +
        "</div>" +
        "</div>" +
        '<div class="b2f-liff-card">' +
        "<h2>📦 " +
        L("รายการสินค้า", "Items", "项目") +
        " (" +
        items.length +
        " " +
        L("รายการ", "items", "项") +
        ")</h2>" +
        itemsHtml +
        "</div>" +
        '<div class="b2f-liff-total">' +
        '<span class="total-label">' +
        L("ยอดรวมราคาทุน", "Total Cost", "合计") +
        "</span>" +
        '<span class="total-amount">' +
        curSym(po) +
        formatNumber(po.po_total_amount) +
        "</span>" +
        "</div>" +
        '<div class="b2f-liff-card">' +
        "<h2>🕔 " +
        L("สถานะ", "Status", "状态") +
        "</h2>" +
        '<div class="b2f-timeline">' +
        timeline +
        "</div>" +
        "</div>" +
        actionsHtml;
}
