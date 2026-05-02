/**
 * B2B LIFF E-Catalog — Format helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   Source location: inline <script> block
 *     - line 1901: fmt(n) — Math.round + toLocaleString
 *     - line 678 : escapeHtml(str) — DOM textNode escape
 *
 * B2B is Thai-only and prices are always THB (no multi-currency unlike
 * B2F Maker). Existing inline V.32.9 uses `Math.round(n).toLocaleString()`
 * with default locale; we preserve that exactly to keep render parity.
 *
 * NOTE on rounding:
 *   The inline `fmt()` uses Math.round (not toFixed(2)) — B2B catalog
 *   shows whole-baht prices (e.g. ฿7,040 not ฿7,040.00). DO NOT change
 *   this without coordinating with Snippet 10 invoice generator (must
 *   stay consistent across LINE Flex / catalog / invoice).
 */

/**
 * Format a price in whole baht with thousands separators.
 *
 * Mirrors `fmt()` at line 1901 of inline V.32.9:
 *   `function fmt(n){return Math.round(n).toLocaleString();}`
 *
 * Behaviour:
 *   - Coerces null / undefined / NaN to 0
 *   - Rounds to whole baht (no decimals — matches inline render)
 *   - Uses default locale grouping (browser th-TH on LIFF → comma)
 *
 * @param {number|string|null|undefined} n
 * @returns {string}
 */
export function formatNumber(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "0";
    return Math.round(num).toLocaleString();
}

/**
 * Format a price with the Thai baht symbol prefix.
 *
 * Mirrors the inline pattern `'฿'+fmt(p.dealer_price)`. Provided as a
 * single helper so callers don't have to remember the glyph.
 *
 * @param {number|string|null|undefined} n
 * @param {string} [currency] — currency code (defaults to "THB"/"฿")
 * @returns {string}
 */
export function formatCurrency(n, currency) {
    const sym = currency && currency !== "THB" ? currency + " " : "฿";
    return sym + formatNumber(n);
}

/**
 * Format an ISO date string (or Date) to dd/mm/yyyy.
 *
 * Used by history cards (`b2b-cat-history-date`). Returns "-" on falsy
 * input.
 *
 * @param {string|Date|null|undefined} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

/**
 * HTML-escape a string by round-tripping through a textNode.
 *
 * Mirrors `escapeHtml(str)` at line 678 of inline V.32.9. Returns empty
 * string on falsy input (matches inline truthiness check).
 *
 * Why textNode and not regex? Browser does correct char-class handling
 * for `<>&"'` plus extended Unicode without a custom map. SSR fallback
 * (jsdom) handles this identically.
 *
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function escHtml(str) {
    if (!str && str !== 0) return "";
    const d = document.createElement("div");
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
}
