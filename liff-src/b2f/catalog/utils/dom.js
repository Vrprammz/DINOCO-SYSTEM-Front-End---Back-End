/**
 * B2F LIFF Admin E-Catalog — DOM helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.13
 *   Source location: inline <script>
 *     - line 1273: showAuthError(msg) — auth error overlay
 *     - line 1281: toast(msg, type) — fade in/out toast (success/error/info)
 *
 * Scope rationale (vs re-exporting B2F Maker dom.js):
 *   The Admin Catalog overlays use a DIFFERENT class name set
 *   (`.b2f-cat-toast` vs Maker's `.b2f-toast`) + different HTML element
 *   IDs (`#b2fAuthError` vs Maker `#authError`). We can NOT re-export
 *   verbatim. We follow the same lock pattern + auto-create-element
 *   defensiveness, but use Catalog-specific class/id names so styles in
 *   `./styles.css` resolve correctly.
 */

import { escHtml } from "./format.js";

let LOCKED = false;

/**
 * Reset the module-private LOCKED flag — testing only.
 */
export function _resetLockForTests() {
    LOCKED = false;
}

/**
 * @returns {boolean} true when an action is in flight (button locked)
 */
export function isLocked() {
    return LOCKED;
}

/**
 * Single-element selector (returns null when not found).
 *
 * @param {string} sel
 * @returns {Element|null}
 */
export function $(sel) {
    return document.querySelector(sel);
}

/**
 * Multi-element selector (returns NodeList — possibly empty).
 *
 * @param {string} sel
 * @returns {NodeListOf<Element>}
 */
export function $$(sel) {
    return document.querySelectorAll(sel);
}

/**
 * Show a transient toast at the top of the screen.
 *
 * Mirrors `toast(msg, type)` at line 1281 of inline V.7.13. Type controls
 * the background colour via the `.error` / `.success` modifier classes
 * defined in `./styles.css`.
 *
 * Auto-creates the toast element if missing (matches Maker LIFF helper
 * pattern) so callers don't have to ensure markup is present.
 *
 * @param {string} msg
 * @param {"success"|"error"|"info"} [type]
 */
export function showToast(msg, type) {
    let el = document.getElementById("b2fToast");
    if (!el) {
        el = document.createElement("div");
        el.id = "b2fToast";
        el.className = "b2f-cat-toast";
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.remove("error", "success");
    if (type === "error") el.classList.add("error");
    else if (type === "success") el.classList.add("success");
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3000);
}

/**
 * Render the persistent auth-error overlay.
 *
 * Mirrors `showAuthError(msg)` at line 1273 of inline V.7.13. The Catalog
 * variant is simpler than B2B (single text block, no retry button — admin
 * either has WP session or LIFF token).
 *
 * @param {string} msg
 */
export function showAuthError(msg) {
    const loading = document.getElementById("b2fLoading");
    if (loading) loading.style.display = "none";

    const main = document.getElementById("b2fMain");
    if (main) main.style.display = "none";

    const errBox = document.getElementById("b2fAuthError");
    if (errBox) {
        errBox.style.display = "flex";
        // Defensive — message may contain HTML special chars (e.g. error
        // codes pasted from server). Escape via textContent equivalent.
        errBox.innerHTML =
            '<div class="b2f-cat-empty">' +
            '<div class="b2f-cat-empty-icon">🔒</div>' +
            "<p>" +
            escHtml(msg || "ไม่สามารถยืนยันตัวตนได้") +
            "</p></div>";
    }
}

/**
 * Show the loading screen (full-screen spinner).
 *
 * @param {string} [msg] - optional message override
 */
export function showLoading(msg) {
    const loading = document.getElementById("b2fLoading");
    if (!loading) return;
    loading.style.display = "block";
    if (msg) {
        const txt = loading.querySelector(".b2f-cat-loading-text");
        if (txt) txt.textContent = msg;
    }
}

/**
 * Hide the loading screen.
 */
export function hideLoading() {
    const loading = document.getElementById("b2fLoading");
    if (loading) loading.style.display = "none";
}

/**
 * Lock a button while an async action is in flight. Pair with `unlockBtn`
 * in a finally block.
 *
 * @param {HTMLButtonElement|null|undefined} btn
 * @param {string} [busyText] - optional replacement label while locked
 * @returns {boolean} true if the lock was acquired (false when already busy)
 */
export function lockBtn(btn, busyText) {
    if (LOCKED) return false;
    LOCKED = true;
    if (btn) {
        btn.disabled = true;
        if (busyText && !btn.dataset.b2fOriginalText) {
            btn.dataset.b2fOriginalText = btn.textContent || "";
            btn.textContent = busyText;
        }
    }
    return true;
}

/**
 * Release the global lock + restore button state.
 *
 * @param {HTMLButtonElement|null|undefined} btn
 */
export function unlockBtn(btn) {
    LOCKED = false;
    if (!btn) return;
    btn.disabled = false;
    if (btn.dataset.b2fOriginalText) {
        btn.textContent = btn.dataset.b2fOriginalText;
        delete btn.dataset.b2fOriginalText;
    }
}

/**
 * Wire offline detection — listens on window.online/offline and toasts.
 *
 * Idempotent: subsequent calls no-op (uses a sentinel on window).
 */
export function setupOfflineDetection() {
    if (typeof window === "undefined") return;
    const w = /** @type {any} */ (window);
    if (w.__b2fCatOfflineWired) return;
    w.__b2fCatOfflineWired = true;
    window.addEventListener("offline", () => {
        showToast("⚠️ ออฟไลน์ — ตรวจสอบสัญญาณ", "error");
    });
    window.addEventListener("online", () => {
        showToast("✓ ออนไลน์อีกครั้ง", "success");
    });
}
