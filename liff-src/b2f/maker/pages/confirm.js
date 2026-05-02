/**
 * B2F Maker LIFF — Confirm page renderer (V.0.5 Round 4)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *   - lines 701-812: renderConfirmPage + renderItemRow (DD-3 SET grouping)
 *
 * Behavioral parity:
 *   - DD-3 hierarchy: items grouped by `poi_parent_sku` → SET header (purple
 *     #ede9fe / #7c3aed) + standalone fallback for legacy POs.
 *   - V.4.3 mode badge per item via `modeBadgeHtml(item)`.
 *   - 3-language strings via `L(th, en, zh)` — currency-aware.
 *   - Round 4: confirm page already used id-based event listeners
 *     (#b2f-confirm-btn / #b2f-reject-btn / #b2f-confirm-reject) — kept as-is
 *     since `attachConfirmHandlers()` wires them imperatively, no global
 *     bridge required.
 *
 * Renderer is pure — caller wires button event listeners after `innerHTML`
 * assignment. We export a small `attachConfirmHandlers()` helper so loaders
 * can keep handler logic out of inline V.4.7.
 */

import { L } from "../utils/lang.js";
import { formatNumber, curSym, formatDate, escHtml } from "../utils/format.js";
import { $ } from "../utils/dom.js";
import { modeBadgeHtml } from "../utils/badges.js";
import { statusLabel } from "../utils/lang.js";
import { getMinDate } from "../utils/timeline.js";

/**
 * Render a single item row (private — exported for tests).
 *
 * Mirrors inline `renderItemRow(item)` V.4.7 line 719-728.
 *
 * @param {Object} item — PO item with poi_sku / poi_product_name /
 *                        poi_unit_cost / poi_qty_ordered / poi_order_mode
 * @param {Object} po   — parent PO (used for currency symbol)
 * @returns {string} HTML
 */
export function renderItemRow(item, po) {
    const lineTotal = (item.poi_qty_ordered || 0) * (item.poi_unit_cost || 0);
    return (
        '<div class="b2f-liff-item">' +
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
        "</div></div>"
    );
}

/**
 * Render the PO confirmation page into `#b2f-app`.
 *
 * Mirrors inline `renderConfirmPage(po)` V.4.7 line 701-812 verbatim.
 * DOM structure preserved byte-for-byte (REG-029 contract):
 *   - .b2f-liff-header with logo
 *   - .b2f-liff-card "Items" with SET grouping
 *   - .b2f-liff-total
 *   - "Fill in details" form (date + note) when status allows confirm
 *   - .b2f-reject-box with .show toggle
 *   - .b2f-liff-actions (Reject / Confirm ETA buttons)
 *
 * @param {Object} po — full PO object
 * @returns {void}
 */
export function renderConfirmPage(po) {
    const app = $("#b2f-app");
    if (!app) return;
    const items = po.po_items || [];
    const canConfirm =
        po.po_status === "submitted" || po.po_status === "amended";

    // V.4.2 Hierarchy: Group items by SET parent
    let itemsHtml = "";
    const setGroups = {};
    const standalone = [];
    items.forEach(function (item) {
        const psku = (item.poi_parent_sku || "").trim();
        if (psku) {
            if (!setGroups[psku]) {
                setGroups[psku] = {
                    name: item.poi_parent_name || psku,
                    children: [],
                };
            }
            setGroups[psku].children.push(item);
        } else {
            standalone.push(item);
        }
    });

    // SET groups with purple header
    Object.keys(setGroups).forEach(function (psku) {
        const g = setGroups[psku];
        itemsHtml +=
            '<div style="margin:8px 0 4px;padding:4px 8px;background:#ede9fe;border-radius:6px;font-size:12px;font-weight:700;color:#7c3aed;">🟣 ' +
            escHtml(g.name) +
            "</div>";
        g.children.forEach(function (item) {
            itemsHtml += renderItemRow(item, po);
        });
    });
    standalone.forEach(function (item) {
        itemsHtml += renderItemRow(item, po);
    });

    let formHtml = "";
    if (canConfirm) {
        formHtml =
            '<div class="b2f-liff-card">' +
            "<h2>📅 " +
            L("กรอกข้อมูล", "Fill in details", "填写信息") +
            "</h2>" +
            '<div class="b2f-liff-field">' +
            "<label>" +
            L("วันที่คาดว่าจะส่ง", "Expected delivery date", "交货日期") +
            ' <span class="required">*</span></label>' +
            '<input type="date" id="b2f-eta" min="' +
            getMinDate() +
            '" required>' +
            "</div>" +
            '<div class="b2f-liff-field">' +
            "<label>" +
            L("หมายเหตุ", "Notes", "备注") +
            "</label>" +
            '<textarea id="b2f-note" placeholder="' +
            L(
                "หมายเหตุเพิ่มเติม (ถ้ามี)",
                "Additional notes (optional)",
                "备注(可选)"
            ) +
            '" rows="3"></textarea>' +
            "</div>" +
            "</div>" +
            '<div class="b2f-reject-box" id="b2f-reject-box">' +
            '<div class="b2f-liff-card">' +
            '<h2 style="color:var(--b2f-danger);">❌ ' +
            L("เหตุผลที่ปฏิเสธ", "Rejection reason", "拒绝原因") +
            "</h2>" +
            '<div class="b2f-liff-field">' +
            "<label>" +
            L("กรุณาระบุเหตุผล", "Please specify reason", "请说明原因") +
            ' <span class="required">*</span></label>' +
            '<textarea id="b2f-reject-reason" placeholder="' +
            L(
                "เช่น วัตถุดิบไม่พอ, ราคาไม่ตรง",
                "e.g. Material unavailable, price mismatch",
                "如：材料缺货、价格不匹配"
            ) +
            '" rows="3"></textarea>' +
            "</div>" +
            '<button class="b2f-btn b2f-btn-danger" style="width:100%;margin-top:8px;" id="b2f-confirm-reject">' +
            "❌ " +
            L("ยืนยันปฏิเสธ PO", "Confirm Reject PO", "确认拒绝PO") +
            "</button>" +
            "</div>" +
            "</div>";
    }

    const requestedDate = po.po_requested_date
        ? '<div style="font-size:12px;color:var(--b2f-text-secondary);margin-top:6px;">📅 ' +
          L("ต้องการรับภายใน", "Requested by", "要求交期") +
          ": " +
          formatDate(po.po_requested_date) +
          "</div>"
        : "";
    const adminNote = po.po_admin_note
        ? '<div style="font-size:12px;color:var(--b2f-text-secondary);margin-top:4px;">📝 ' +
          L("หมายเหตุ", "Notes", "备注") +
          ": " +
          escHtml(po.po_admin_note) +
          "</div>"
        : "";

    app.innerHTML =
        '<div class="b2f-liff-header">' +
        '<div class="b2f-header-content">' +
        "<h1>🏭 " +
        L(
            "ใบสั่งซื้อจาก DINOCO",
            "Purchase Order from DINOCO",
            "DINOCO采购订单"
        ) +
        "</h1>" +
        '<div class="b2f-po-number">' +
        escHtml(po.po_number) +
        "</div>" +
        '<div class="b2f-sub">' +
        '<span class="b2f-status b2f-status-' +
        escHtml(po.po_status) +
        '">' +
        statusLabel(po.po_status) +
        "</span>" +
        (po.po_version > 1
            ? " · " +
              L("ฉบับแก้ไขครั้งที่ ", "Amendment #", "修改第") +
              (po.po_version - 1)
            : "") +
        "</div></div>" +
        '<img src="https://www.dinoco.in.th/wp-content/uploads/2026/01/sss.png" class="b2f-logo" alt="DINOCO">' +
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
        '<div class="b2f-liff-card" style="padding-top:12px;">' +
        requestedDate +
        adminNote +
        "</div>" +
        formHtml +
        (canConfirm
            ? '<div class="b2f-liff-actions">' +
              '<button class="b2f-btn b2f-btn-outline" id="b2f-reject-btn">❌ ' +
              L("ปฏิเสธ", "Reject", "拒绝") +
              "</button>" +
              '<button class="b2f-btn b2f-btn-accent" id="b2f-confirm-btn">✅ ' +
              L("ยืนยันวันส่ง", "Confirm ETA", "确认交期") +
              "</button>" +
              "</div>"
            : "");
}

/**
 * Attach button handlers to the rendered confirm page.
 *
 * Wires #b2f-confirm-btn / #b2f-reject-btn / #b2f-confirm-reject. Caller
 * supplies async callback functions for confirm + reject — Round 3 router
 * will provide these. During Round 2 inline-bridge fallback, Snippet 4
 * still owns the inline handleConfirm/handleReject.
 *
 * @param {{
 *   onConfirm?: () => void,
 *   onReject?: () => void,
 * }} handlers
 */
export function attachConfirmHandlers(handlers = {}) {
    const confirmBtn = $("#b2f-confirm-btn");
    const rejectBtn = $("#b2f-reject-btn");
    const confirmRejectBtn = $("#b2f-confirm-reject");

    if (confirmBtn && handlers.onConfirm) {
        confirmBtn.addEventListener("click", handlers.onConfirm);
    }
    if (rejectBtn) {
        rejectBtn.addEventListener("click", function () {
            const box = $("#b2f-reject-box");
            if (!box) return;
            box.classList.toggle("show");
            if (box.classList.contains("show")) {
                box.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        });
    }
    if (confirmRejectBtn && handlers.onReject) {
        confirmRejectBtn.addEventListener("click", handlers.onReject);
    }
}
