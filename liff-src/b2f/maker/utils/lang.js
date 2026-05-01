/**
 * B2F Maker LIFF — Language helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.6
 *   Source location: inline `b2f_liff_page_js()` lines 271-272 (`L()` helper)
 *                    + lines 516-519 (STATUS_TH/EN/ZH maps + statusLabel)
 *
 * Pattern: 3-language switch driven by maker currency
 *   - THB → "th" (Thai, default)
 *   - USD → "en"
 *   - CNY → "zh"
 *
 * The `_lang` state is module-private; callers go through `setupLanguage()`
 * (called once from bootstrap when JWT or PO_DATA reveals maker_currency)
 * and `getLang()` (read-only). Inline V.4.6 used a global `var _lang`; this
 * module preserves the same string keys so `STATUS_TH/EN/ZH` lookups stay
 * byte-identical to inline output during the parallel rendering window.
 */

/** @type {"th"|"en"|"zh"} */
let _lang = "th";

/**
 * Set language by maker currency.
 *
 * @param {string} currency — "THB" | "USD" | "CNY" (case-insensitive)
 */
export function setupLanguage(currency) {
    if (!currency) {
        _lang = "th";
        return;
    }
    const c = String(currency).toUpperCase();
    if (c === "CNY") {
        _lang = "zh";
    } else if (c === "USD") {
        _lang = "en";
    } else {
        _lang = "th";
    }
}

/**
 * Read current language code.
 *
 * @returns {"th"|"en"|"zh"}
 */
export function getLang() {
    return _lang;
}

/**
 * Force language explicitly (testing only — production always derives from
 * maker currency).
 *
 * @param {"th"|"en"|"zh"} lang
 */
export function setLang(lang) {
    if (lang === "th") _lang = "th";
    else if (lang === "en") _lang = "en";
    else if (lang === "zh") _lang = "zh";
}

/**
 * 3-language picker — falls back to English when Chinese label missing.
 *
 * Mirrors the inline `function L(th, en, zh)` shape exactly.
 *
 * @param {string} th
 * @param {string} en
 * @param {string} [zh]
 * @returns {string}
 */
export function L(th, en, zh) {
    if (_lang === "zh") return zh || en;
    if (_lang === "en") return en;
    return th;
}

/* ── PO Status maps (12 statuses) ──
 * Inline keys preserved verbatim — JSON-safe, no surprises in toLocaleDateString
 * locale. Thai keys use Unicode escapes in source (matches inline V.4.6) but
 * literal Thai in this module since Vite handles UTF-8 cleanly.
 */
export const STATUS_TH = {
    draft: "แบบร่าง",
    submitted: "รอโรงงานยืนยัน",
    confirmed: "รอผลิต",
    amended: "แก้ไขใบสั่งซื้อ",
    rejected: "โรงงานปฏิเสธ",
    delivering: "โรงงานจัดส่ง",
    received: "รับของครบ",
    partial_received: "รับบางส่วน",
    paid: "ชำระครบ",
    partial_paid: "ชำระบางส่วน",
    completed: "ปิดใบสั่งซื้อ",
    cancelled: "ยกเลิก",
};

export const STATUS_EN = {
    draft: "Draft",
    submitted: "Pending",
    confirmed: "Confirmed",
    amended: "Amended",
    rejected: "Rejected",
    delivering: "Shipping",
    received: "Received",
    partial_received: "Partial Received",
    paid: "Paid",
    partial_paid: "Partial Paid",
    completed: "Completed",
    cancelled: "Cancelled",
};

export const STATUS_ZH = {
    draft: "草稿",
    submitted: "待确认",
    confirmed: "已确认",
    amended: "已修改",
    rejected: "已拒绝",
    delivering: "发货中",
    received: "已收货",
    partial_received: "部分收货",
    paid: "已付款",
    partial_paid: "部分付款",
    completed: "已完成",
    cancelled: "已取消",
};

/**
 * Look up the human label for a PO status in the current language.
 * Falls back to the raw status key when not in the map.
 *
 * @param {string} status
 * @returns {string}
 */
export function statusLabel(status) {
    const map = _lang === "zh" ? STATUS_ZH : _lang === "en" ? STATUS_EN : STATUS_TH;
    return map[status] || status;
}
