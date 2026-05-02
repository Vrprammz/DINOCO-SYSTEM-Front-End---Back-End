/**
 * B2F LIFF Admin E-Catalog — Format helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.13
 *   Source location: inline <script>
 *     - line 1288: fmt(n) — Number toLocaleString('th-TH', 2-2 decimals)
 *     - line 1290: esc(s) — DOM textNode escape
 *     - line 1614-1621: getMakerCurrency / getMakerSymbol
 *
 * B2F catalog is multi-currency (THB ฿ / USD $ / CNY ¥) driven by the
 * selected maker's `currency`. Inline V.7.13 reads the symbol from a
 * cached `selectedMakerData.currency` global; we expose it as a pure
 * helper so callers pass the currency code explicitly. The locale used
 * for thousands separators stays "th-TH" regardless of currency, matching
 * inline render parity (the Maker LIFF format helpers do the same).
 *
 * Decimal places: B2F uses 2-decimal display (`฿7,040.00`) — different
 * from B2B catalog (whole-baht `฿7,040`). Inline pattern preserved here.
 */

/**
 * Currency-symbol lookup. Defaults to ฿ when missing or unknown.
 *
 * Mirrors `getMakerSymbol()` at line 1618 of inline V.7.13:
 *   `c === 'CNY' ? '¥' : (c === 'USD' ? '$' : '฿')`
 *
 * @param {string} [currency] - "THB" | "USD" | "CNY" (case-insensitive)
 * @returns {string}
 */
export function currencySymbol(currency) {
    const c = String(currency || "").toUpperCase();
    if (c === "CNY") return "¥"; // ¥
    if (c === "USD") return "$";
    return "฿"; // ฿
}

/**
 * Format a number with locale-aware thousands separators + 2 decimals.
 *
 * Mirrors `fmt()` at line 1288 of inline V.7.13:
 *   `Number(n).toLocaleString('th-TH', { minimumFractionDigits: 0,
 *                                          maximumFractionDigits: 2 })`
 *
 * Note inline uses `min: 0` not `min: 2` — so whole-currency renders as
 * "฿7,040" (no trailing ".00") and fractional as "฿7,040.50". We preserve
 * this exactly to keep render parity with inline output during Round 5
 * cutover.
 *
 * @param {number|string|null|undefined} n
 * @returns {string}
 */
export function formatNumber(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "0";
    return num.toLocaleString("th-TH", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}

/**
 * Format an amount with the maker's currency symbol prefix.
 *
 * Mirrors the inline pattern `getMakerSymbol() + fmt(n)` used throughout
 * V.7.13 product card / cart / SET Detail renderers.
 *
 * @param {number|string|null|undefined} n
 * @param {string} [currency] - currency code (defaults to "THB")
 * @returns {string}
 */
export function formatCurrency(n, currency) {
    return currencySymbol(currency) + formatNumber(n);
}

/**
 * Format an ISO date / Date object → "DD/MM/YYYY" (th-TH locale).
 * Returns "-" on falsy / invalid input.
 *
 * @param {string|Date|null|undefined} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

/**
 * HTML-escape a string by round-tripping through a textNode.
 *
 * Mirrors `esc(s)` at line 1290 of inline V.7.13:
 *   `var d = document.createElement('div');
 *    d.appendChild(document.createTextNode(s || ''));
 *    return d.innerHTML;`
 *
 * Defensive on falsy input (returns "").
 *
 * @param {string|number|null|undefined} str
 * @returns {string}
 */
export function escHtml(str) {
    if (str === null || str === undefined || str === "") return "";
    if (typeof document === "undefined") {
        // SSR / pre-render fallback — basic regex pass.
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
    const d = document.createElement("div");
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
}

/**
 * Currency English-name lookup — used by some Maker-facing copy
 * ("Foreign currency PO — exchange rate snapshot").
 *
 * @param {string} currency
 * @returns {string}
 */
export function currencyNameEn(currency) {
    const c = String(currency || "").toUpperCase();
    if (c === "CNY") return "Chinese Yuan";
    if (c === "USD") return "US Dollar";
    return "Thai Baht";
}
