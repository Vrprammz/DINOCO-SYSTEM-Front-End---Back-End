/**
 * LIFF AI Frontend — Lead + Claim status enums (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.8
 *   Source location: inline `<script>` block
 *     - lines 616-625: LEAD_STATUS_TH (17 statuses)
 *     - lines 627-633: statusBadgeClass (Lead → CSS class)
 *     - lines 636-642: CLAIM_STATUS_TH (13 statuses)
 *     - lines 644-650: claimBadgeClass (Claim → CSS class)
 *     - lines 652-663: TIMELINE_STEPS (9-step Lead pipeline for Dealer view)
 *     - lines 665-670: getTimelineIndex
 *
 * Cross-references:
 *   - OpenClaw `lead-pipeline.js` defines the FSM (server-side authoritative)
 *   - WP `claim_ticket` CPT field `ticket_status` (11 statuses align with
 *     `[Admin System] Service Center & Claims`)
 *
 * The frontend NEVER trusts these labels for authorization — every status
 * mutation goes through the REST API which re-validates server-side.
 */

/**
 * 17 Lead statuses (covers full pipeline from creation to terminal).
 * Order is significant only for `TIMELINE_STEPS` below — internal maps are
 * unordered.
 */
export const LEAD_STATUSES = [
    "lead_created",
    "dealer_notified",
    "checking_contact",
    "dealer_contacted",
    "dealer_no_response",
    "waiting_order",
    "order_placed",
    "waiting_delivery",
    "delivered",
    "waiting_install",
    "installed",
    "satisfaction_checked",
    "closed_satisfied",
    "closed_lost",
    "closed_cancelled",
    "admin_escalated",
    "dormant",
];

/**
 * Lead status → Thai label.
 * Mirrors inline V.3.8 lines 616-625 verbatim.
 */
export const LEAD_STATUS_TH = {
    lead_created: "สร้างใหม่",
    dealer_notified: "แจ้งตัวแทนแล้ว",
    checking_contact: "กำลังติดต่อ",
    dealer_contacted: "ติดต่อลูกค้าแล้ว",
    dealer_no_response: "ตัวแทนไม่ตอบ",
    waiting_order: "รอสั่งซื้อ",
    order_placed: "สั่งซื้อแล้ว",
    waiting_delivery: "รอจัดส่ง",
    delivered: "จัดส่งแล้ว",
    waiting_install: "รอติดตั้ง",
    installed: "ติดตั้งแล้ว",
    satisfaction_checked: "สอบถามแล้ว",
    closed_satisfied: "ปิด (พอใจ)",
    closed_lost: "ปิด (สูญเสีย)",
    closed_cancelled: "ยกเลิก",
    admin_escalated: "ส่งต่อแอดมิน",
    dormant: "พักงาน",
};

/**
 * Claim status → Thai label.
 * Mirrors inline V.3.8 lines 636-642 verbatim. Aligns with Service Center.
 */
export const CLAIM_STATUS_TH = {
    pending: "รอตรวจสอบ",
    reviewing: "กำลังตรวจสอบ",
    admin_reviewed: "แอดมินตรวจแล้ว",
    approved: "อนุมัติ",
    rejected: "ปฏิเสธ",
    waiting_return_shipment: "รอส่งคืน",
    parts_shipping: "กำลังส่งอะไหล่",
    processing: "กำลังดำเนินการ",
    shipped: "จัดส่งแล้ว",
    closed_resolved: "ปิด (แก้ไขแล้ว)",
    closed_rejected: "ปิด (ปฏิเสธ)",
    completed: "เสร็จสิ้น",
    cancelled: "ยกเลิก",
};

/**
 * CSS class semantic colors (drives `.liff-ai-badge-*` styling).
 * Inline V.3.8 doesn't expose this map directly — it's the inverse function
 * of `statusBadgeClass()` and `claimBadgeClass()`.
 */
export const STATUS_COLORS = {
    new: "#FF6B00",      // ai-primary (orange)
    active: "#3b82f6",   // ai-blue
    success: "#16a34a",  // ai-success (green)
    danger: "#dc2626",   // ai-danger (red)
    muted: "#64748b",    // ai-text-muted (gray)
    pending: "#f59e0b",  // ai-warning (amber)
    reviewing: "#3b82f6",
    completed: "#16a34a",
    rejected: "#dc2626",
};

/**
 * Map a Lead status to a badge CSS class suffix (".liff-ai-badge-{class}").
 * Mirrors inline V.3.8 `statusBadgeClass()` lines 627-633 EXACTLY.
 *
 * @param {string|null|undefined} status
 * @returns {"new"|"active"|"success"|"danger"|"muted"}
 */
export function statusBadgeClass(status) {
    if (!status) return "muted";
    if (status.indexOf("closed_satisfied") > -1 || status === "installed" || status === "delivered") return "success";
    if (status.indexOf("closed_") > -1 || status === "dealer_no_response") return "danger";
    if (status === "lead_created" || status === "dealer_notified") return "new";
    return "active";
}

/**
 * Map a Claim status to a badge CSS class suffix.
 * Mirrors inline V.3.8 `claimBadgeClass()` lines 644-650 EXACTLY.
 *
 * @param {string|null|undefined} status
 * @returns {"pending"|"completed"|"rejected"|"reviewing"}
 */
export function claimBadgeClass(status) {
    if (!status) return "pending";
    if (status === "pending") return "pending";
    if (status.indexOf("closed_resolved") > -1 || status === "completed") return "completed";
    if (status.indexOf("closed_rejected") > -1 || status === "rejected" || status === "cancelled") return "rejected";
    return "reviewing";
}

/**
 * Look up the human label for a Lead status. Falls back to raw key.
 *
 * @param {string} status
 * @returns {string}
 */
export function getStatusLabel(status) {
    return LEAD_STATUS_TH[status] || status || "-";
}

/**
 * Look up the human label for a Claim status. Falls back to raw key.
 *
 * @param {string} status
 * @returns {string}
 */
export function getClaimStatusLabel(status) {
    return CLAIM_STATUS_TH[status] || status || "-";
}

/**
 * Look up the hex color for a Lead status.
 *
 * @param {string} status
 * @returns {string} hex color (default: muted gray)
 */
export function getStatusColor(status) {
    const cls = statusBadgeClass(status);
    return STATUS_COLORS[cls] || STATUS_COLORS.muted;
}

/**
 * Look up the hex color for a Claim status.
 *
 * @param {string} status
 * @returns {string} hex color
 */
export function getClaimStatusColor(status) {
    const cls = claimBadgeClass(status);
    return STATUS_COLORS[cls] || STATUS_COLORS.muted;
}

/**
 * 9-step Lead pipeline — used by Dealer-facing detail view to render
 * a vertical timeline. Mirrors inline V.3.8 lines 652-663.
 */
export const TIMELINE_STEPS = [
    { key: "lead_created", label: "สร้าง Lead" },
    { key: "dealer_notified", label: "แจ้งตัวแทน" },
    { key: "checking_contact", label: "กำลังติดต่อ" },
    { key: "dealer_contacted", label: "ติดต่อลูกค้า" },
    { key: "waiting_order", label: "รอสั่งซื้อ" },
    { key: "order_placed", label: "สั่งซื้อแล้ว" },
    { key: "delivered", label: "จัดส่ง" },
    { key: "installed", label: "ติดตั้ง" },
    { key: "closed_satisfied", label: "ปิดงาน" },
];

/**
 * Find the index of a status in the Lead pipeline (-1 if not in timeline).
 * Mirrors inline V.3.8 `getTimelineIndex()` lines 665-670.
 *
 * @param {string} status
 * @returns {number}
 */
export function getTimelineIndex(status) {
    for (let i = 0; i < TIMELINE_STEPS.length; i++) {
        if (TIMELINE_STEPS[i].key === status) return i;
    }
    return -1;
}
