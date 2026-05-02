/**
 * B2B LIFF E-Catalog — Order History page (V.0.3 Round 2)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   - line 1727-1739 : historyFilters constant
 *   - line 1741-1750 : renderHistoryFilter
 *   - line 1779-1850 : renderHistory + status colors + action buttons
 *
 * Round 2 contract:
 *   Pure HTML-string builders. Status color/label maps are exposed
 *   so tests can verify them without re-reading inline V.32.9.
 *
 * REG-029 byte-identical preservation:
 *   - sc + sl maps (15 statuses + 15 fallbacks)
 *   - Action button order: ดู → ยกเลิก → สั่งซ้ำ → เคลม
 *   - "Load More" button only when historyPage < historyTotalPages
 *   - claim button visible only for shipped/completed
 *   - cancel button hidden when status already cancelled/cancel_requested
 */

import { escHtml, formatNumber } from "../utils/format.js";

/**
 * Status filter chips. Inline V.32.9 line 1727-1739 — 11 entries.
 * Order matters; "ทั้งหมด" must lead.
 */
export const HISTORY_FILTERS = [
    { key: "", label: "ทั้งหมด" },
    { key: "pending", label: "รอดำเนินการ" },
    { key: "awaiting_payment", label: "รอชำระ" },
    { key: "paid", label: "จ่ายแล้ว" },
    { key: "packed", label: "แพ็คแล้ว" },
    { key: "shipped", label: "จัดส่งแล้ว" },
    { key: "backorder", label: "Backorder" },
    { key: "completed", label: "เสร็จสิ้น" },
    { key: "change_requested", label: "ขอแก้ไข" },
    { key: "claim_opened", label: "เคลม" },
    { key: "cancelled", label: "ยกเลิก" },
];

/**
 * Status color map. Mirrors inline `sc` at V.32.9 line 1781.
 */
export const STATUS_COLORS = {
    draft: { bg: "#f1f5f9", c: "#475569" },
    pending: { bg: "#f1f5f9", c: "#9e9e9e" },
    checking_stock: { bg: "#dbeafe", c: "#1d4ed8" },
    awaiting_confirm: { bg: "#fef3c7", c: "#92400e" },
    awaiting_payment: { bg: "#fed7aa", c: "#9a3412" },
    paid: { bg: "#dcfce7", c: "#166534" },
    packed: { bg: "#f3e5f5", c: "#7b1fa2" },
    shipped: { bg: "#fef9c3", c: "#854d0e" },
    completed: { bg: "#dcfce7", c: "#166534" },
    backorder: { bg: "#fee2e2", c: "#991b1b" },
    cancel_requested: { bg: "#fef2f2", c: "#dc2626" },
    cancelled: { bg: "#f1f5f9", c: "#64748b" },
    change_requested: { bg: "#f5f3ff", c: "#6d28d9" },
    claim_opened: { bg: "#fce7f3", c: "#9d174d" },
    claim_resolved: { bg: "#dcfce7", c: "#166534" },
};

/**
 * Status label map (Thai). Mirrors inline `sl` at V.32.9 line 1782.
 */
export const STATUS_LABELS = {
    draft: "Draft",
    pending: "รอดำเนินการ",
    checking_stock: "เช็คสต็อก",
    awaiting_confirm: "รอยืนยัน",
    awaiting_payment: "รอชำระ",
    paid: "ชำระแล้ว",
    packed: "แพ็คแล้ว",
    shipped: "จัดส่งแล้ว",
    completed: "เสร็จสิ้น",
    backorder: "Backorder",
    cancel_requested: "ขอยกเลิก",
    cancelled: "ยกเลิก",
    change_requested: "ขอแก้ไข",
    claim_opened: "เคลม",
    claim_resolved: "เคลมเสร็จ",
};

/**
 * Get color pair for a status with fallback (inline default at line 1785).
 *
 * @param {string} status
 * @returns {{ bg: string, c: string }}
 */
export function getStatusColor(status) {
    return STATUS_COLORS[status] || { bg: "#f1f5f9", c: "#475569" };
}

/**
 * Get Thai label for a status with raw fallback (inline default at line 1788).
 *
 * @param {string} status
 * @returns {string}
 */
export function getStatusLabel(status) {
    return STATUS_LABELS[status] || status || "";
}

/**
 * Render the filter chips row HTML.
 *
 * Mirrors inline `renderHistoryFilter()` V.32.9 line 1741-1750.
 *
 * @param {{ historyFilter?: string }} state
 * @returns {string}
 */
export function renderHistoryFilter(state) {
    const active = (state && state.historyFilter) || "";
    return HISTORY_FILTERS.map((f) => {
        const isActive = f.key === active ? " active" : "";
        return (
            '<button class="b2b-cat-filter-chip' + isActive + '" ' +
            'data-action="set-history-filter" data-filter="' + escHtml(f.key) +
            '">' + escHtml(f.label) + "</button>"
        );
    }).join("");
}

/**
 * Render a single history card.
 *
 * @param {object} order
 * @returns {string}
 */
export function renderHistoryCard(order) {
    const o = order || {};
    const c = getStatusColor(o.status);
    const label = getStatusLabel(o.status);

    let h = '<div class="b2b-cat-history-card" data-order-id="' +
        escHtml(String(o.id || "")) + '">';
    h += '<div class="b2b-cat-history-top"><div>' +
        '<span class="b2b-cat-history-id">' +
        escHtml(o.sub_label || ("Ticket #" + o.id)) +
        "</span>" +
        '<span class="b2b-cat-history-date">' + escHtml(o.date || "") +
        "</span></div>" +
        '<span class="b2b-cat-history-status" style="background:' + c.bg +
        ";color:" + c.c + ';">' + escHtml(label) + "</span></div>";

    if (o.items && o.items.length > 0) {
        h += '<div class="b2b-cat-hi-items">';
        o.items.forEach((it, i) => {
            h += '<div class="b2b-cat-hi-row">' +
                '<span class="b2b-cat-hi-no">' + (i + 1) + ".</span>" +
                '<span class="b2b-cat-hi-name">' +
                escHtml(it.name || it.sku) + "</span>" +
                '<span class="b2b-cat-hi-qty">x' + it.qty + "</span>";
            if (it.price) {
                h += '<span class="b2b-cat-hi-price">฿' +
                    formatNumber(it.price) + "</span>";
            }
            h += "</div>";
        });
        h += "</div>";
    } else {
        h += '<div style="font-size:12px;color:#888;margin-bottom:6px;">' +
            escHtml(o.items_preview || "-") + "</div>";
    }

    let meta = "";
    if (o.due_date && (o.status === "awaiting_payment" || o.status === "paid")) {
        meta += '<span class="due">กำหนดชำระ: ' +
            escHtml(o.due_date) + "</span>";
    }
    if (o.tracking) {
        meta += "<span>" + escHtml(o.tracking) +
            (o.carrier ? " (" + escHtml(o.carrier) + ")" : "") + "</span>";
    }
    if (meta) {
        h += '<div class="b2b-cat-history-meta">' + meta + "</div>";
    }

    h += '<div class="b2b-cat-history-bottom">' +
        '<span class="b2b-cat-history-total">฿' + formatNumber(o.total) +
        "</span>" +
        '<div class="b2b-cat-history-actions">';

    if (o.ticket_url) {
        h += '<button class="b2b-cat-hbtn detail" data-view="' +
            escHtml(o.ticket_url) + '">ดู</button>';
    }
    if (o.can_cancel && o.status !== "cancelled" &&
        o.status !== "cancel_requested") {
        h += '<button class="b2b-cat-hbtn danger" data-cancel="' +
            escHtml(String(o.id)) + '">ยกเลิก</button>';
    }
    h += '<button class="b2b-cat-hbtn primary" data-reorder="' +
        escHtml(String(o.id)) + '">สั่งซ้ำ</button>';
    if (o.status === "shipped" || o.status === "completed") {
        h += '<button class="b2b-cat-hbtn warn" data-claim="' +
            escHtml(String(o.id)) + '">เคลม</button>';
    }

    h += "</div></div>"; // /actions /bottom
    h += "</div>"; // /card
    return h;
}

/**
 * Render the "Load More" button when there are more pages.
 *
 * Mirrors inline V.32.9 line 1816-1820.
 *
 * @param {{ historyPage: number, historyTotalPages: number }} state
 * @returns {string}
 */
export function renderLoadMoreButton(state) {
    /** @type {{ historyPage?: number, historyTotalPages?: number }} */
    const s = state || {};
    const page = parseInt(String(s.historyPage || 0), 10) || 0;
    const total = parseInt(String(s.historyTotalPages || 0), 10) || 0;
    if (page >= total) return "";
    return '<button class="b2b-cat-load-more" data-action="load-more">' +
        "โหลดเพิ่ม (หน้า " + (page + 1) + "/" + total + ")</button>";
}

/**
 * Render the full history list HTML.
 *
 * Mirrors inline `renderHistory()` V.32.9 line 1779-1850.
 *
 * @param {Array<object>} orders
 * @param {{ historyPage: number, historyTotalPages: number }} state
 * @returns {string}
 */
export function renderHistory(orders, state) {
    const list = (orders || []).map(renderHistoryCard).join("");
    const more = renderLoadMoreButton(state || /** @type {any} */ ({}));
    return list + more;
}
