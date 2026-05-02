/**
 * LIFF AI Frontend — Format helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.8
 *   Source location: inline `<script>` block
 *     - line 574: esc (renamed escHtml here — collides with shorthand)
 *     - line 601: timeAgo (relative time, Thai-only)
 *     - line 610: formatDate (DD/MM/YYYY HH:mm in th-TH)
 *
 * The inline path is Thai-only — these helpers preserve that exactly.
 * Adding `formatNumber` and `formatRelativeTime` here for parity with the
 * other 3 LIFF surfaces (renderer code copy-pastable across surfaces).
 */

/**
 * HTML-escape a string by exploiting `textContent → innerHTML` round-trip.
 * Returns "" for null/undefined.
 *
 * Mirrors `esc()` in inline V.3.8 — same DOM-API approach so escape semantics
 * stay identical (e.g., quotes are NOT escaped, matching the inline path
 * which only escapes < / > / &).
 *
 * @param {string|null|undefined} s
 * @returns {string}
 */
export function escHtml(s) {
    if (typeof document === "undefined") {
        // Node fallback (jsdom auto-supplies document in tests).
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }
    const d = document.createElement("div");
    d.appendChild(document.createTextNode(s || ""));
    return d.innerHTML;
}

/**
 * Format a number with locale-thousands separator + 0 decimal places (no
 * forced fraction digits — LIFF AI displays counts, not currency).
 * Inline V.3.8 doesn't have an explicit `formatNumber()`; counts are rendered
 * raw. Provided here as a no-surprises helper for renderer code.
 *
 * @param {number|string|null|undefined} n
 * @returns {string}
 */
export function formatNumber(n) {
    return Number(n || 0).toLocaleString("th-TH");
}

/**
 * Long date format (DD MMM YYYY HH:mm) — toLocaleDateString in th-TH.
 * Returns "-" when input is falsy.
 *
 * Mirrors `formatDate(dateStr)` in inline V.3.8 line 610.
 *
 * @param {string|Date|null|undefined} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/**
 * Relative time formatter — Thai labels.
 * Returns "-" when input is falsy.
 *
 * Mirrors `timeAgo(dateStr)` in inline V.3.8 line 601:
 *   < 60s          → "เมื่อสักครู่"
 *   < 60m          → "N นาทีที่แล้ว"
 *   < 24h          → "N ชั่วโมงที่แล้ว"
 *   else           → "N วันที่แล้ว"
 *
 * @param {string|Date|null|undefined} dateStr
 * @returns {string}
 */
export function formatRelativeTime(dateStr) {
    if (!dateStr) return "-";
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return "เมื่อสักครู่";
    if (diff < 3600) return Math.floor(diff / 60) + " นาทีที่แล้ว";
    if (diff < 86400) return Math.floor(diff / 3600) + " ชั่วโมงที่แล้ว";
    return Math.floor(diff / 86400) + " วันที่แล้ว";
}

/**
 * Alias for `formatRelativeTime` — matches inline V.3.8 naming.
 *
 * @param {string|Date|null|undefined} dateStr
 * @returns {string}
 */
export function timeAgo(dateStr) {
    return formatRelativeTime(dateStr);
}
