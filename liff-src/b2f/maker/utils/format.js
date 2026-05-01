/**
 * B2F Maker LIFF — Format helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.6
 *   Source location: inline `b2f_liff_page_js()`
 *     - lines 420-422: formatNumber
 *     - lines 424-426: curSym
 *     - lines 428-433: formatDate
 *     - lines 435-446: fmtDateShort
 *     - lines 596-600: escHtml
 *
 * Locale matrix (from getLang()):
 *   - "th" → "th-TH" (Buddhist Era YY for fmtDateShort)
 *   - "en" → "en-GB" (DD/MM/YY)
 *   - "zh" → "zh-CN" (DD/MM/YY)
 */

import { getLang } from "./lang.js";

/**
 * Format a number with 2 decimal places, locale-thousands separator.
 * Mirrors `formatNumber()` in inline V.4.6 — always renders as th-TH so
 * comma-separated thousands stay byte-identical to inline output.
 *
 * Note: Inline V.4.6 hardcoded "th-TH" regardless of `_lang`. We preserve
 * that to keep parity with PO Image / Flex / inline render. Currency
 * symbol switching happens via `curSym(po)` separately.
 *
 * @param {number|string|null|undefined} n
 * @returns {string}
 */
export function formatNumber(n) {
    return Number(n || 0).toLocaleString("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/**
 * Currency symbol lookup — falls back to ฿ when missing.
 * Inline V.4.6 returned the unicode escape; we keep the literal here.
 *
 * @param {{ currency_symbol?: string }} [po]
 * @returns {string}
 */
export function curSym(po) {
    return po && po.currency_symbol ? po.currency_symbol : "฿";
}

/**
 * Long date format (DD/MM/YYYY) — toLocaleDateString in current locale.
 * Returns "-" when input is falsy.
 *
 * @param {string|Date|null|undefined} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    const lang = getLang();
    const locale = lang === "zh" ? "zh-CN" : lang === "en" ? "en-GB" : "th-TH";
    return d.toLocaleDateString(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

/**
 * Short date (DD/MM/YY) — Thai uses Buddhist Era last 2 digits.
 * Returns "-" when input is falsy.
 *
 * Inline V.4.6 quirk: when lang === "th" → year + 543 mod 100.
 * Otherwise CE year mod 100.
 *
 * @param {string|Date|null|undefined} d
 * @returns {string}
 */
export function fmtDateShort(d) {
    if (!d) return "-";
    const dt = new Date(d);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const lang = getLang();
    if (lang !== "th") {
        const yy = String(dt.getFullYear()).slice(-2);
        return `${dd}/${mm}/${yy}`;
    }
    const yy = String(dt.getFullYear() + 543).slice(-2);
    return `${dd}/${mm}/${yy}`;
}

/**
 * HTML-escape a string by exploiting `textContent → innerHTML` round-trip.
 * Returns "" for null/undefined.
 *
 * Mirrors `escHtml()` in inline V.4.6 — same DOM-API approach so escape
 * semantics stay identical (e.g., quotes are NOT escaped, matching the
 * inline path which only escapes < / > / &).
 *
 * @param {string|null|undefined} s
 * @returns {string}
 */
export function escHtml(s) {
    if (typeof document === "undefined") {
        // Node fallback (jsdom auto-supplies document in tests). Provides
        // a minimal escape so callers in non-browser contexts don't crash.
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }
    const d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
}
