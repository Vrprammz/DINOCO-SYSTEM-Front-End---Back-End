/**
 * LIFF AI Frontend — DOM helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.8
 *   Source location: inline `<script>` block
 *     - lines 572-573: $, $$
 *     - lines 589-599: toast (uses pre-rendered #liffAiToast element)
 *     - lines 765-769: showError (renders into #liffAiApp)
 *     - lines 770-774: showLoading (renders into #liffAiApp)
 *
 * Pattern note: LIFF AI keeps a single pre-rendered #liffAiToast in the
 * shell HTML (Snippet 2 lines ~547). `showToast` only mutates that element
 * rather than creating a new DOM node like B2F maker does. The Vite
 * implementation can fall back to creating one if missing (defensive).
 *
 * State: module-private LOCKED flag mirrors inline `var LOCKED = false`
 * (no inline equivalent — LIFF AI doesn't have a global LOCKED flag, but
 * Round 2 page renderers will need one for accept/cancel buttons).
 */

import { escHtml } from "./format.js";

let LOCKED = false;

/**
 * Reset the global LOCKED flag — testing only.
 */
export function _resetLockForTests() {
    LOCKED = false;
}

/**
 * @returns {boolean} current lock state
 */
export function isLocked() {
    return LOCKED;
}

/**
 * Single-element selector. Returns null when not found.
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
 * Variants: "success" (green border), "error" (red border), "" (default).
 *
 * Mirrors `toast(msg, type)` in inline V.3.8 lines 589-599.
 * Includes haptic feedback on supporting devices (P16 from inline V.3.8).
 *
 * @param {string} msg
 * @param {"success"|"error"|""} [type]
 */
export function showToast(msg, type) {
    let el = $("#liffAiToast");
    if (!el) {
        // Defensive — inline path always pre-renders this element, but if
        // the shell HTML didn't (test contexts, Vite-only), create on demand.
        el = document.createElement("div");
        el.id = "liffAiToast";
        el.className = "liff-ai-toast";
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = "liff-ai-toast " + (type || "") + " show";
    setTimeout(() => el.classList.remove("show"), 3000);
    // Haptic feedback (inline V.3.8 line 595-598)
    if (typeof navigator !== "undefined" && navigator.vibrate) {
        if (type === "success") navigator.vibrate(20);
        else if (type === "error") navigator.vibrate([30, 60, 30]);
    }
}

/**
 * Render a full-screen error state into `#liffAiApp`.
 *
 * @param {string} title
 * @param {string} msg
 * @param {{ rootSelector?: string }} [opts]
 */
export function showError(title, msg, opts = {}) {
    const root = $(opts.rootSelector || "#liffAiApp");
    if (!root) return;
    root.innerHTML =
        '<div class="liff-ai-error">' +
        '<div class="icon">⚠️</div>' +
        "<h2>" + escHtml(title) + "</h2>" +
        "<p>" + escHtml(msg) + "</p>" +
        "</div>";
}

/**
 * Render a loading spinner into `#liffAiApp`.
 *
 * @param {string} [msg]
 * @param {{ rootSelector?: string }} [opts]
 */
export function showLoading(msg, opts = {}) {
    const root = $((opts && opts.rootSelector) || "#liffAiApp");
    if (!root) return;
    root.innerHTML =
        '<div class="liff-ai-loading">' +
        '<div class="liff-ai-spinner"></div>' +
        "<p>" + escHtml(msg || "กำลังโหลด...") + "</p>" +
        "</div>";
}

/**
 * Disable + spinner-icon a button while an action is in flight.
 * Returns false when LOCKED already true (single-flight contract).
 *
 * @param {HTMLButtonElement} btn
 * @returns {boolean}
 */
export function lockBtn(btn) {
    if (LOCKED) return false;
    LOCKED = true;
    btn.disabled = true;
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = '<span class="liff-ai-spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle"></span> กำลังดำเนินการ...';
    return true;
}

/**
 * Re-enable + restore original innerHTML of a button. Resets LOCKED.
 *
 * @param {HTMLButtonElement} btn
 */
export function unlockBtn(btn) {
    LOCKED = false;
    btn.disabled = false;
    if (btn.dataset.origText) btn.innerHTML = btn.dataset.origText;
}

/**
 * Inject a sticky "no internet" banner at top of `<body>` and wire
 * online/offline events. Idempotent — early-returns if banner exists.
 *
 * Inline V.3.8 doesn't currently have offline detection — added here
 * for parity with the other LIFF surfaces; the renderer is free to
 * call this from bootstrap() when ready.
 */
export function setupOfflineDetection() {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    if (document.querySelector(".liff-ai-offline-banner")) return;
    const banner = document.createElement("div");
    banner.className = "liff-ai-offline-banner";
    banner.textContent = "ไม่มีอินเทอร์เน็ต กรุณาตรวจสอบการเชื่อมต่อ";
    banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;text-align:center;padding:8px 12px;font-size:12px;font-weight:600;transform:translateY(-100%);transition:transform 0.3s;";
    document.body.prepend(banner);
    const show = () => { banner.style.transform = "translateY(0)"; };
    const hide = () => { banner.style.transform = "translateY(-100%)"; };
    window.addEventListener("offline", show);
    window.addEventListener("online", hide);
}
