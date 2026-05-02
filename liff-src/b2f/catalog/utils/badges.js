/**
 * B2F LIFF Admin E-Catalog — Badge HTML builders (V.0.2 Round 1)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.13
 *   Source location: inline <script>
 *     - line 2123-2268: card render with type badges (purple/blue/green/gray)
 *     - line 1733-1739: virtual SET amber badge
 *     - line 1361-1372: V.7.0 mode label + class helpers
 *
 * V.7.0 Order Intent badges (3 modes — admin sees badge on each item):
 *   🟣 full_set     → "ชุดเต็ม" / "Full Set" / "整套"     (purple)
 *   🟠 sub_unit     → "แยกชุด" / "Sub-unit" / "分组"      (amber, V.7.4 contrast fix)
 *   ⚪ single_leaf  → "ชิ้นเดี่ยว" / "Single" / "单件"    (gray)
 *
 * Hierarchy badges (legacy V.5.x classification, still rendered alongside
 * V.7.0 mode badges):
 *   - SET (top-level)         → purple `b2f-cat-badge-set`
 *   - Child (sub-SET)         → blue   `b2f-cat-badge-child`
 *   - Grandchild (leaf side)  → green  `b2f-cat-badge-grandchild`
 *   - Single (no hierarchy)   → gray   `b2f-cat-badge-single`
 *
 * Virtual SET (DD-3 derived — no maker registration, but ancestor of
 * registered leaves):
 *   - amber `b2f-cat-virtual-badge` "✨ ประกอบจากชิ้นส่วน"
 *
 * Re-exports the V.7.0 cart-side helpers (`orderModeLabel`,
 * `orderModeBadgeClass`) from cart.js for convenience — Round 2 page
 * renderers can import everything from `./utils/badges.js`.
 */

import { L } from "./lang.js";
import { escHtml } from "./format.js";

/**
 * Render the V.7.0 inline order-mode badge on a product card or cart row.
 *
 * Returns "" when:
 *   - mode is empty or unrecognised
 *   - ORDER_INTENT_ENABLED is false (caller passes opts.enabled)
 *
 * @param {string} mode - "full_set" | "sub_unit" | "single_leaf"
 * @param {{ enabled?: boolean, includeIcon?: boolean }} [opts]
 * @returns {string} HTML span (or "")
 */
export function modeBadgeHtml(mode, opts = {}) {
    if (!mode || opts.enabled === false) return "";
    const labelMap = {
        full_set: { icon: "🟣", th: "ชุดเต็ม", en: "Full Set", zh: "整套", cls: "purple" },
        sub_unit: { icon: "🟠", th: "แยกชุด", en: "Sub-unit", zh: "分组", cls: "amber" },
        single_leaf: { icon: "⚪", th: "ชิ้นเดี่ยว", en: "Single", zh: "单件", cls: "gray" },
    };
    const info = labelMap[mode];
    if (!info) return "";
    const showIcon = opts.includeIcon !== false;
    const text = (showIcon ? info.icon + " " : "") + L(info.th, info.en, info.zh);
    return (
        '<span class="b2f-cat-cart-mode-badge ' +
        info.cls +
        '">' +
        escHtml(text) +
        "</span>"
    );
}

/**
 * Render the V.7.0 production-mode card badge on a catalog card (the
 * larger badge shown above the product image).
 *
 * @param {string} productionMode - V.11.0 backend value
 *   ("set_assembled" | "sub_unit" | "single" | "cross_factory_assembly")
 * @returns {string}
 */
export function productionModeCardBadgeHtml(productionMode) {
    if (!productionMode) return "";
    const map = {
        set_assembled: { cls: "set-assembled", icon: "🟣", th: "ชุดเต็ม", en: "Full Set", zh: "整套" },
        sub_unit: { cls: "sub-unit", icon: "🟠", th: "แยกชุด", en: "Sub-unit", zh: "分组" },
        single: { cls: "single", icon: "⚪", th: "ชิ้นเดี่ยว", en: "Single", zh: "单件" },
        cross_factory_assembly: {
            cls: "cross-factory",
            icon: "🟠",
            th: "DINOCO ประกอบ",
            en: "DINOCO Assembled",
            zh: "DINOCO组装",
        },
    };
    const info = map[productionMode];
    if (!info) return "";
    return (
        '<span class="b2f-cat-badge b2f-cat-badge-' +
        info.cls +
        '">' +
        info.icon +
        " " +
        escHtml(L(info.th, info.en, info.zh)) +
        "</span>"
    );
}

/**
 * Render a hierarchy classification badge (legacy V.5.x — still in use).
 *
 * @param {"set"|"child"|"grandchild"|"single"} type
 * @returns {string}
 */
export function hierarchyBadgeHtml(type) {
    const labelMap = {
        set: { cls: "set", th: "ชุด SET", en: "SET", zh: "套装" },
        child: { cls: "child", th: "ลูกชิ้นส่วน", en: "Sub-part", zh: "子件" },
        grandchild: { cls: "grandchild", th: "ชิ้นส่วนย่อย", en: "Leaf", zh: "零件" },
        single: { cls: "single", th: "เดี่ยว", en: "Single", zh: "单件" },
    };
    const info = labelMap[type];
    if (!info) return "";
    return (
        '<span class="b2f-cat-badge b2f-cat-badge-' +
        info.cls +
        '">' +
        escHtml(L(info.th, info.en, info.zh)) +
        "</span>"
    );
}

/**
 * Render the amber "virtual SET" badge — used on cards for SETs derived
 * from descendants (no direct maker registration).
 *
 * Mirrors the inline `.b2f-cat-virtual-badge` render at line 299 styles.
 *
 * @param {string} [reason] - "shared_parts_assembled" | "intermediate_sub_set"
 * @returns {string}
 */
export function virtualSetBadgeHtml(reason) {
    const text = L("ประกอบจากชิ้นส่วน", "Assembled from parts", "组装件");
    return (
        '<span class="b2f-cat-virtual-badge" data-reason="' +
        escHtml(reason || "") +
        '">✨ ' +
        escHtml(text) +
        "</span>"
    );
}

/**
 * Render an "unconfirmed" inline badge — small amber pill shown when a
 * product still has `confirmation_status === "auto_synced"` (admin needs
 * to review).
 *
 * @returns {string}
 */
export function unconfirmedBadgeHtml() {
    return (
        '<span class="b2f-cat-badge-unconfirmed">⚠️ ' +
        escHtml(L("รอยืนยัน", "Unconfirmed", "待确认")) +
        "</span>"
    );
}

// Re-export V.7.0 cart-side helpers so renderers can import everything
// from `./utils/badges.js`.
export { orderModeLabel, orderModeBadgeClass, deriveOrderMode } from "./cart.js";
