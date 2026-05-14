/**
 * B2F Maker LIFF — Deliver pages renderer (V.0.5 Round 4)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *   - lines 1247-1368: renderDeliverPage (PO list ready to ship)
 *   - lines 1385-1484: renderDeliverForm (per-SKU qty input form)
 *
 * Behavioral parity:
 *   - Deliver list: confirmed / delivering / partial_received POs.
 *     Each card shows shipped/remaining table, V.3.16 inspect+reject
 *     summary, and "Ship more" button (disabled when fully shipped).
 *   - Deliver form: per-SKU qty stepper (- / number / +) with max =
 *     remaining, "Fill all (auto)" button, note textarea, submit.
 *   - DD-3 hierarchy: SET header rows (purple) flatten into form.
 *   - Round 4: inline `onclick` handlers migrated to data-action attrs:
 *       - `b2fOpenDeliverForm(id)` → `data-action="deliver-open" data-po-id`
 *       - `loadDeliverPage()`     → `data-action="deliver-back"`
 *       - `b2fStepQty(this, ±1)`  → `data-action="deliver-step" data-delta`
 *       - `b2fFillAllRemaining()` → `data-action="deliver-fill-all"`
 *       - `b2fSubmitDeliver()`    → `data-action="deliver-submit"`
 *       - `goToPage('list')`      → `data-action="navigate" data-view="list"`
 *   - Visual + behavior identical (REG-029 byte-equivalent).
 */

import { L, statusLabel } from "../utils/lang.js";
import { formatNumber, curSym, formatDate, escHtml } from "../utils/format.js";
import { $ } from "../utils/dom.js";
import { modeBadgeHtml } from "../utils/badges.js";

/**
 * Render the Deliver List page into `#b2f-app`.
 *
 * Mirrors inline `renderDeliverPage(poList)` V.4.7 line 1247-1368 verbatim.
 *
 * @param {Array<Object>} poList — POs in confirmed/delivering/partial_received
 * @returns {void}
 */
export function renderDeliverPage(poList) {
    const app = $("#b2f-app");
    if (!app) return;
    const list = Array.isArray(poList) ? poList : [];
    let cardsHtml = "";
    if (list.length === 0) {
        cardsHtml =
            '<div class="b2f-empty"><div class="icon">📦</div><p>' +
            L(
                "ไม่มี PO ที่รอส่งของตอนนี้",
                "No POs pending shipment",
                "暂无待发货的PO"
            ) +
            "</p></div>";
    } else {
        list.forEach(function (po) {
            const isPartial = po.po_status === "partial_received";
            const isDelivering = po.po_status === "delivering";
            const statusCls = isDelivering
                ? "b2f-status-delivering"
                : isPartial
                ? "b2f-status-partial_received"
                : "b2f-status-confirmed";
            let hasRemaining = false;
            (po.items || po.po_items || []).forEach(function (it) {
                const ord = Number(it.poi_qty_ordered || it.qty_ordered || 0);
                const shp = Number(it.poi_qty_shipped || it.qty_shipped || 0);
                const rej = Number(
                    it.poi_qty_rejected || it.qty_rejected || 0
                );
                if (ord - shp + rej > 0) hasRemaining = true;
            });
            const btnLabel =
                isDelivering || isPartial
                    ? "📦 " +
                      L("ส่งสินค้าเพิ่ม", "Ship more items", "继续发货")
                    : "🚚 " + L("แจ้งส่งของ", "Ship items", "发货通知");
            const btnColor =
                isDelivering || isPartial
                    ? "background:#ca8a04;border-color:#ca8a04;"
                    : "";
            const btnDisabled = !hasRemaining;

            // shipped/remaining summary (partial_received + delivering)
            let remainInfo = "";
            const poItems = po.items || po.po_items || [];
            if ((isPartial || isDelivering) && poItems.length) {
                // Note: inline V.4.7 line 1272-1276 computes
                // totalOrdered/totalShipped but never references them
                // (dead code). Skipped here; per-row table below is the
                // sole consumer of qty math.
                const bgColor = isDelivering ? "#eff6ff" : "#fef9c3";
                const txColor = isDelivering ? "#1e40af" : "#854d0e";
                remainInfo =
                    '<div style="margin-top:6px;padding:8px 10px;background:' +
                    bgColor +
                    ";border-radius:8px;font-size:12px;color:" +
                    txColor +
                    ';">';
                remainInfo +=
                    '<div style="font-weight:600;margin-bottom:4px;">' +
                    (isDelivering
                        ? "📦 " +
                          L(
                              "ส่งแล้วบางส่วน",
                              "Partially shipped",
                              "部分发货"
                          )
                        : "📦 " +
                          L(
                              "รับแล้วบางส่วน",
                              "Partially received",
                              "部分收货"
                          )) +
                    "</div>";
                // table header + rows
                remainInfo += '<div style="margin-top:6px;font-size:11px;">';
                remainInfo +=
                    '<div style="display:flex;gap:4px;padding:2px 0;font-weight:700;color:#475569;border-bottom:1px solid ' +
                    (isDelivering ? "#bfdbfe" : "#fde68a") +
                    ';">' +
                    '<span style="flex:3;">' +
                    L("สินค้า", "Product", "产品") +
                    "</span>" +
                    '<span style="flex:1;text-align:center;">' +
                    L("สั่ง", "Ord", "订") +
                    "</span>" +
                    '<span style="flex:1;text-align:center;">' +
                    L("ส่ง", "Ship", "发") +
                    "</span>" +
                    '<span style="flex:1;text-align:center;">' +
                    L("เหลือ", "Left", "剩") +
                    "</span>" +
                    "</div>";
                poItems.forEach(function (it) {
                    const ord = Number(
                        it.poi_qty_ordered || it.qty_ordered || 0
                    );
                    const shp = Number(
                        it.poi_qty_shipped || it.qty_shipped || 0
                    );
                    const left = Math.max(0, ord - shp);
                    const name = escHtml(
                        it.poi_product_name ||
                            it.product_name ||
                            it.poi_sku ||
                            it.sku ||
                            ""
                    );
                    const sku = escHtml(it.poi_sku || it.sku || "");
                    const leftColor =
                        left > 0
                            ? "color:#dc2626;font-weight:700;"
                            : "color:#16a34a;";
                    const dlvModeBadge = modeBadgeHtml(it);
                    remainInfo +=
                        '<div style="display:flex;gap:4px;padding:4px 0;border-bottom:1px solid #f1f5f9;align-items:center;">' +
                        '<div style="flex:3;overflow:hidden;min-width:0;">' +
                        '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
                        name +
                        dlvModeBadge +
                        "</div>" +
                        '<div style="font-size:10px;color:#94a3b8;">' +
                        sku +
                        "</div>" +
                        "</div>" +
                        '<span style="flex:1;text-align:center;">' +
                        ord +
                        "</span>" +
                        '<span style="flex:1;text-align:center;">' +
                        shp +
                        "</span>" +
                        '<span style="flex:1;text-align:center;' +
                        leftColor +
                        '">' +
                        left +
                        "</span>" +
                        "</div>";
                });
                remainInfo += "</div>";
                // V.3.16 inspect + reject summary
                let dlvPendingInspect = 0;
                let dlvTotalRejected = 0;
                poItems.forEach(function (it) {
                    const shp2 = Number(
                        it.poi_qty_shipped || it.qty_shipped || 0
                    );
                    const rcv2 = Number(
                        it.poi_qty_received || it.qty_received || 0
                    );
                    const rej2 = Number(
                        it.poi_qty_rejected || it.qty_rejected || 0
                    );
                    if (shp2 - rcv2 > 0) dlvPendingInspect += shp2 - rcv2;
                    if (rej2 > 0) dlvTotalRejected += rej2;
                });
                if (dlvPendingInspect > 0) {
                    remainInfo +=
                        '<div style="margin-top:6px;font-size:11px;color:#1e40af;font-weight:600;">🔍 ' +
                        L(
                            "รอตรวจรับ " + dlvPendingInspect + " ชิ้น",
                            "Pending inspection: " +
                                dlvPendingInspect +
                                " items",
                            "待验收: " + dlvPendingInspect + " 件"
                        ) +
                        "</div>";
                }
                if (dlvTotalRejected > 0) {
                    remainInfo +=
                        '<div style="margin-top:4px;font-size:11px;color:#991b1b;font-weight:600;">⚠️ ' +
                        L(
                            "reject " +
                                dlvTotalRejected +
                                " ชิ้น ส่งทดแทนได้",
                            dlvTotalRejected +
                                " items rejected — replacement available",
                            dlvTotalRejected + " 件不合格 — 可补发"
                        ) +
                        "</div>";
                }
                if (hasRemaining) {
                    remainInfo +=
                        '<div style="margin-top:6px;font-size:11px;color:#1e40af;">📦 ' +
                        L(
                            "กดปุ่มด้านล่างเพื่อส่งสินค้าเพิ่ม",
                            "Tap button below to ship more",
                            "点击下方按钮继续发货"
                        ) +
                        "</div>";
                } else {
                    remainInfo +=
                        '<div style="margin-top:4px;font-size:11px;color:#16a34a;">✅ ' +
                        L(
                            "ส่งครบแล้ว รอ DINOCO ตรวจรับ",
                            "Fully shipped — pending inspection",
                            "已全部发货 — 收货后请检验"
                        ) +
                        "</div>";
                }
                remainInfo += "</div>";
            }

            cardsHtml +=
                '<div class="b2f-po-card" style="cursor:pointer" data-po-id="' +
                escHtml(String(po.ID || po.id)) +
                '">' +
                '<div class="po-header">' +
                '<span class="po-number">' +
                escHtml(po.po_number) +
                "</span>" +
                '<span class="b2f-status ' +
                statusCls +
                '">' +
                statusLabel(po.po_status) +
                "</span>" +
                "</div>" +
                '<div class="po-meta">' +
                Number(po.po_item_count || (po.po_items || []).length) +
                " " +
                L("รายการ", "items", "项") +
                (po.po_expected_date
                    ? " · ETA: " + formatDate(po.po_expected_date)
                    : "") +
                "</div>" +
                '<div class="po-total">' +
                curSym(po) +
                formatNumber(po.po_total_amount) +
                "</div>" +
                remainInfo +
                '<div style="margin-top:10px">' +
                '<button class="b2f-btn b2f-btn-primary" style="width:100%;font-size:13px;padding:10px;' +
                (btnDisabled
                    ? "background:#94a3b8;border-color:#94a3b8;"
                    : btnColor) +
                '"' +
                (btnDisabled
                    ? " disabled"
                    : ' data-action="deliver-open" data-po-id="' +
                      escHtml(String(po.ID || po.id)) +
                      '"') +
                ">" +
                (btnDisabled
                    ? "✅ " +
                      L("ส่งครบแล้ว", "Fully shipped", "已全部发货")
                    : btnLabel) +
                "</button>" +
                "</div>" +
                "</div>";
        });
    }

    app.innerHTML =
        '<div class="b2f-liff-header">' +
        '<div class="b2f-header-content">' +
        "<h1>🚚 " +
        L("แจ้งจัดส่งสินค้า", "Shipment", "发货通知") +
        "</h1>" +
        '<div class="b2f-sub">' +
        L(
            "PO ที่รอจัดส่ง " + list.length + " รายการ",
            list.length + " POs pending shipment",
            list.length + " 个PO待发货"
        ) +
        "</div>" +
        "</div>" +
        '<img src="https://www.dinoco.in.th/wp-content/uploads/2026/01/sss.png" class="b2f-logo" alt="DINOCO">' +
        "</div>" +
        '<div style="padding:0">' +
        cardsHtml +
        "</div>" +
        '<div style="padding:12px;text-align:center;">' +
        '<button class="b2f-btn b2f-btn-outline" data-action="navigate" data-view="list">← ' +
        L("กลับรายการ", "Back to list", "返回列表") +
        "</button>" +
        "</div>";
}

/**
 * Render the per-SKU delivery form for a single PO into `#b2f-app`.
 *
 * Mirrors inline `renderDeliverForm()` V.4.7 line 1385-1484 verbatim.
 * Caller passes the loaded PO as arg (inline used module-private
 * `_deliverPoData`). Round 3 will replace inline pattern with router
 * state-passed PO.
 *
 * @param {Object} po — full PO with po_items
 * @returns {void}
 */
export function renderDeliverForm(po) {
    if (!po) return;
    const app = $("#b2f-app");
    if (!app) return;
    const items = po.items || po.po_items || [];

    // V.4.2 Hierarchy: Group delivery items by SET parent
    const setGroups = {};
    const standaloneItems = [];
    const orderedItems = [];
    items.forEach(function (it, idx) {
        it._origIdx = idx;
    });
    items.forEach(function (it) {
        const psku = (it.poi_parent_sku || it.parent_sku || "").trim();
        if (psku) {
            if (!setGroups[psku]) {
                setGroups[psku] = {
                    name: it.poi_parent_name || it.parent_name || psku,
                    children: [],
                };
            }
            setGroups[psku].children.push(it);
        } else {
            standaloneItems.push(it);
        }
    });
    // Flatten back: SET groups first, then standalone
    Object.keys(setGroups).forEach(function (psku) {
        orderedItems.push({ _setHeader: true, name: setGroups[psku].name });
        setGroups[psku].children.forEach(function (it) {
            orderedItems.push(it);
        });
    });
    standaloneItems.forEach(function (it) {
        orderedItems.push(it);
    });

    let rows = "";
    orderedItems.forEach(function (it, idx) {
        if (it._setHeader) {
            rows +=
                '<div style="margin:12px 0 6px;padding:6px 10px;background:#ede9fe;border-radius:8px;font-size:13px;font-weight:700;color:#7c3aed;">🟣 ' +
                escHtml(it.name) +
                "</div>";
            return;
        }
        idx = it._origIdx;
        const ordered = Number(it.qty_ordered || it.poi_qty_ordered || 0);
        const shipped = Number(it.qty_shipped || it.poi_qty_shipped || 0);
        const rejected = Number(
            it.qty_rejected || it.poi_qty_rejected || 0
        );
        const remaining = Math.max(0, ordered - shipped + rejected);
        const name =
            it.product_name ||
            it.poi_product_name ||
            it.sku ||
            it.poi_sku ||
            "";
        const sku = it.sku || it.poi_sku || "";
        const isDone = remaining <= 0;

        rows +=
            '<div class="b2f-po-card" style="padding:12px;margin-bottom:8px;' +
            (isDone ? "opacity:0.5;" : "") +
            '">' +
            '<div style="font-weight:600;font-size:13px;">' +
            escHtml(name) +
            modeBadgeHtml(it) +
            "</div>" +
            '<div style="font-size:11px;color:#64748b;">SKU: ' +
            escHtml(sku) +
            "</div>" +
            '<div style="display:flex;gap:12px;margin-top:6px;font-size:12px;color:#475569;">' +
            "<span>" +
            L("สั่ง", "Ordered", "订购") +
            ": <b>" +
            ordered +
            "</b></span>" +
            "<span>" +
            L("ส่งแล้ว", "Shipped", "已发") +
            ": <b>" +
            shipped +
            "</b></span>" +
            "<span>" +
            L("ค้างส่ง", "Remaining", "剩余") +
            ': <b style="color:' +
            (remaining > 0 ? "#b45309" : "#16a34a") +
            '">' +
            remaining +
            "</b></span>" +
            "</div>";

        // V.3.16 per-item pending inspect + reject badges
        const received = Number(it.qty_received || it.poi_qty_received || 0);
        const pendingInspect = shipped - received;
        if (pendingInspect > 0) {
            rows +=
                '<div class="b2f-status-info info-waiting" style="margin-top:6px;padding:6px 10px;font-size:11px;">🔍 ' +
                L(
                    "รอตรวจรับ " + pendingInspect + " ชิ้น",
                    "Pending inspection: " + pendingInspect,
                    "待验收: " + pendingInspect + " 件"
                ) +
                "</div>";
        }
        if (rejected > 0) {
            rows +=
                '<div class="b2f-status-info info-reject" style="margin-top:4px;padding:6px 10px;font-size:11px;">⚠️ ' +
                L(
                    "reject " + rejected + " ชิ้น ส่งทดแทนได้",
                    rejected + " rejected — replacement available",
                    rejected + " 件不合格 — 可补发"
                ) +
                "</div>";
        }

        if (isDone) {
            rows +=
                '<div style="margin-top:6px;font-size:12px;color:#16a34a;font-weight:600;">' +
                L(
                    "✅ ส่งครบแล้ว",
                    "✅ Fully shipped",
                    "✅ 已全部发货"
                ) +
                "</div>";
        } else {
            rows +=
                '<div style="margin-top:10px;">' +
                '<div style="font-size:12px;color:#374151;margin-bottom:6px;font-weight:600;">' +
                L("ส่งรอบนี้:", "This shipment:", "本次发货:") +
                "</div>" +
                '<div style="display:flex;align-items:center;gap:6px;">' +
                '<button type="button" data-action="deliver-step" data-delta="-1" style="width:48px;height:48px;border:1px solid #d1d5db;border-radius:10px;background:#f8fafc;font-size:22px;font-weight:700;cursor:pointer;color:#374151;">-</button>' +
                '<input type="number" inputmode="numeric" pattern="[0-9]*" class="b2f-dlv-qty" data-idx="' +
                idx +
                '" data-sku="' +
                escHtml(sku) +
                '" ' +
                'min="0" max="' +
                remaining +
                '" value="0" ' +
                'style="flex:1;padding:12px;border:2px solid #d1d5db;border-radius:12px;font-size:28px;font-weight:700;text-align:center;max-width:120px;">' +
                '<button type="button" data-action="deliver-step" data-delta="1" style="width:48px;height:48px;border:1px solid #d1d5db;border-radius:10px;background:#f8fafc;font-size:22px;font-weight:700;cursor:pointer;color:#374151;">+</button>' +
                '<span style="font-size:13px;color:#94a3b8;font-weight:600;">/ ' +
                remaining +
                "</span>" +
                "</div>" +
                "</div>";
        }
        rows += "</div>";
    });

    app.innerHTML =
        '<div class="b2f-liff-header">' +
        '<div class="b2f-header-content">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
        '<button data-action="deliver-back" style="background:none;border:none;font-size:20px;cursor:pointer;padding:4px;color:#fff;">←</button>' +
        '<div><h1 style="margin:0;">' +
        L("🚛 กรอกรายการจัดส่ง", "🚛 Shipment Form", "🚛 发货表单") +
        "</h1>" +
        '<div class="b2f-sub">' +
        escHtml(po.po_number) +
        "</div></div>" +
        "</div></div>" +
        '<img src="https://www.dinoco.in.th/wp-content/uploads/2026/01/sss.png" class="b2f-logo" alt="DINOCO">' +
        "</div>" +
        '<div style="padding:0 12px;">' +
        '<button class="b2f-btn b2f-btn-secondary" style="width:100%;margin-bottom:12px;font-size:13px;padding:10px;" data-action="deliver-fill-all">' +
        L("📋 ส่งครบทุกรายการ (auto-fill)", "📋 Fill all (auto)", "📋 全部填满") +
        "</button>" +
        rows +
        '<div style="padding:12px 0;">' +
        '<textarea id="b2f-dlv-note" placeholder="' +
        L("หมายเหตุ (ถ้ามี)", "Notes (optional)", "备注(可选)") +
        '" rows="2" ' +
        'style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;box-sizing:border-box;"></textarea>' +
        "</div>" +
        '<div style="display:flex;gap:8px;padding-bottom:20px;">' +
        '<button class="b2f-btn b2f-btn-secondary" style="flex:1;padding:12px;" data-action="deliver-back">' +
        L("← กลับ", "← Back", "← 返回") +
        "</button>" +
        '<button class="b2f-btn b2f-btn-primary" style="flex:2;padding:12px;font-size:14px;" data-action="deliver-submit">' +
        L("🚛 ยืนยันส่งของ", "🚛 Confirm Shipment", "🚛 确认发货") +
        "</button>" +
        "</div>" +
        "</div>";
}
