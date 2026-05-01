/**
 * B2F Maker LIFF — DOM helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 4: Maker LIFF Pages` V.4.6
 *   Source location: inline `b2f_liff_page_js()`
 *     - lines 417-418: $, $$
 *     - lines 566-577: showToast
 *     - lines 579-587: showError
 *     - lines 589-594: showLoading
 *     - lines 602-615: lockBtn / unlockBtn
 *     - lines 617-624: setupOfflineDetection
 *
 * State: module-private LOCKED flag mirrors inline `var LOCKED = false`.
 * Callers should always pair `lockBtn()` with `unlockBtn()` in finally
 * blocks (existing inline pattern preserved).
 */

import { L } from "./lang.js";
import { escHtml } from "./format.js";

let LOCKED = false;

/**
 * Reset the global LOCKED flag — testing only (production toggles via
 * lockBtn/unlockBtn in pairs).
 */
export function _resetLockForTests() {
    LOCKED = false;
}

/**
 * @returns {boolean} current lock state (true = action in flight)
 */
export function isLocked() {
    return LOCKED;
}

/**
 * Single-element selector. Returns null when not found (matches
 * `document.querySelector` contract).
 *
 * @param {string} sel
 * @returns {Element|null}
 */
export function $(sel) {
    return document.querySelector(sel);
}

/**
 * Multi-element selector. Returns NodeList (possibly empty).
 *
 * @param {string} sel
 * @returns {NodeListOf<Element>}
 */
export function $$(sel) {
    return document.querySelectorAll(sel);
}

/**
 * Show a transient toast at the top-center.
 * Variants: "success" (green), "error" (red), or empty (default dark).
 *
 * Mirrors `showToast(msg, type)` in inline V.4.6.
 *
 * @param {string} msg
 * @param {"success"|"error"|""} [type]
 */
export function showToast(msg, type) {
    let toast = $(".b2f-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.className = "b2f-toast";
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = "b2f-toast " + (type || "");
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => toast.classList.remove("show"), 3000);
}

/**
 * Render a full-screen error state into `#b2f-app`. Includes a
 * "View all POs" outline button that navigates to ?view=list.
 *
 * Inline V.4.6 used `goToPage('list')` (a global function); the
 * extracted helper passes a navigation callback so callers can wire
 * it to their router during Round 2 page port.
 *
 * @param {string} title
 * @param {string} msg
 * @param {{ rootSelector?: string, onGoToList?: () => void }} [opts]
 */
export function showError(title, msg, opts = {}) {
    const root = $(opts.rootSelector || "#b2f-app");
    if (!root) return;
    const btnId = "b2f-err-go-list-" + Math.random().toString(36).slice(2, 8);
    root.innerHTML =
        '<div class="b2f-error">' +
        '<div class="icon">⚠️</div>' +
        "<h2>" + escHtml(title) + "</h2>" +
        "<p>" + escHtml(msg) + "</p>" +
        '<div style="margin-top:16px;">' +
        '<button id="' + btnId + '" class="b2f-btn b2f-btn-outline">' +
        escHtml(L("ดูรายการทั้งหมด", "View all POs", "查看所有订单")) +
        "</button></div></div>";
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.addEventListener("click", () => {
            if (typeof opts.onGoToList === "function") {
                opts.onGoToList();
                return;
            }
            // Fallback: legacy inline path (window.goToPage). Lazy-bind so
            // existing inline renderer continues to work during parallel
            // rendering window.
            if (typeof window !== "undefined" && typeof window.goToPage === "function") {
                window.goToPage("list");
            }
        });
    }
}

/**
 * Render a loading spinner into `#b2f-app`.
 *
 * @param {{ rootSelector?: string }} [opts]
 */
export function showLoading(opts = {}) {
    const root = $(opts.rootSelector || "#b2f-app");
    if (!root) return;
    root.innerHTML =
        '<div class="b2f-loading">' +
        '<div class="b2f-spinner b2f-spinner-lg"></div>' +
        "<p>" + escHtml(L("กำลังโหลด...", "Loading...", "加载中...")) + "</p></div>";
}

/**
 * Disable + spinner-icon a button while an action is in flight.
 * Returns false when LOCKED already true (single-flight contract).
 *
 * @param {HTMLButtonElement} btn
 * @returns {boolean} true when lock acquired (caller proceeds), false when
 *                   another action is already in flight (caller bails)
 */
export function lockBtn(btn) {
    if (LOCKED) return false;
    LOCKED = true;
    btn.disabled = true;
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML =
        '<span class="b2f-spinner"></span> ' +
        escHtml(L("กำลังดำเนินการ...", "Processing...", "处理中..."));
    return true;
}

/**
 * Re-enable + restore original innerHTML of a button after action completes
 * or errors. Resets the global LOCKED flag.
 *
 * @param {HTMLButtonElement} btn
 */
export function unlockBtn(btn) {
    LOCKED = false;
    btn.disabled = false;
    if (btn.dataset.origText) btn.innerHTML = btn.dataset.origText;
}

/**
 * Inject a sticky "no internet" banner at the top of `<body>` and wire
 * online/offline events to toggle its `.show` class.
 *
 * Mirrors inline V.4.6 lines 617-624. Idempotent — calling twice creates
 * two banners; bootstrap should call once.
 */
export function setupOfflineDetection() {
    const banner = document.createElement("div");
    banner.className = "b2f-offline-banner";
    banner.textContent = L(
        "ไม่มีอินเทอร์เน็ต กรุณาตรวจสอบการเชื่อมต่อ",
        "No internet connection. Please check your connection.",
        "无网络连接,请检查网络"
    );
    document.body.prepend(banner);
    window.addEventListener("offline", () => banner.classList.add("show"));
    window.addEventListener("online", () => banner.classList.remove("show"));
}
