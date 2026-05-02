/**
 * B2F Admin LIFF E-Catalog — Success screen loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.15
 *   - line 3172-3192: showSuccess(poNumber, poId, warnings) + auto-close 5s
 *
 * Round 3 contract:
 *   `setupSuccess({ state })` once at bootstrap; `loadSuccess()` renders
 *   the post-submit screen reading `state.lastPO`. Auto-close LIFF after
 *   5s when `liff.isInClient()` (matches V.7.15 line 3185-3191).
 */

import { escHtml } from "../utils/format.js";

/** @type {any} */
let _state = null;
/** @type {number|null} */
let _autoCloseTimer = null;

/**
 * @param {{ state: object }} deps
 */
export function setupSuccess(deps) {
    if (!deps || !deps.state) {
        throw new Error("setupSuccess: state required");
    }
    _state = /** @type {any} */ (deps.state);
}

/**
 * Render success screen using `_state.lastPO`. Pure HTML — no DOM mutation
 * outside the mount.
 *
 * @param {{ number: string, id: string|number, warnings?: string[] }} [overridePO]
 * @returns {string}
 */
export function renderSuccess(overridePO) {
    const po = overridePO || (_state && _state.lastPO) || {};
    const num = escHtml(String(po.number || ""));
    const warnings = Array.isArray(po.warnings) ? po.warnings : [];
    const warnHtml = warnings.length
        ? '<div class="b2f-success-warnings">' +
          warnings.map(function (w) {
              return "&#9888;&#65039; " + escHtml(String(w));
          }).join("<br>") +
          "</div>"
        : "";
    return (
        '<div class="b2f-success">' +
        '<div class="b2f-success-icon">&#9989;</div>' +
        '<h2 class="b2f-success-title">สร้าง PO สำเร็จ!</h2>' +
        '<div class="b2f-success-po">' + num + "</div>" +
        warnHtml +
        '<div class="b2f-success-hint">หน้าต่างนี้จะปิดอัตโนมัติใน 5 วินาที</div>' +
        "</div>"
    );
}

/**
 * Render success screen + schedule auto-close.
 *
 * @returns {void}
 */
export function loadSuccess() {
    if (!_state) return;
    const mount = (typeof document !== "undefined")
        ? document.getElementById("b2f-catalog-app")
        : null;
    if (!mount) return;
    mount.innerHTML = renderSuccess();
    _scheduleAutoClose();
}

/**
 * Schedule auto-close of LIFF window after 5 seconds (matches V.7.15
 * line 3185-3191). Cancellable via `_cancelAutoClose()`.
 */
function _scheduleAutoClose() {
    if (typeof window === "undefined") return;
    if (_autoCloseTimer != null) {
        clearTimeout(_autoCloseTimer);
        _autoCloseTimer = null;
    }
    _autoCloseTimer = /** @type {any} */ (setTimeout(function () {
        try {
            const w = /** @type {any} */ (window);
            if (w.liff && typeof w.liff.isInClient === "function" && w.liff.isInClient()) {
                w.liff.closeWindow();
            } else if (typeof window.close === "function") {
                window.close();
            }
        } catch (_e) { /* swallow */ }
        _autoCloseTimer = null;
    }, 5000));
}

/**
 * Cancel pending auto-close (used by tests + when user navigates back).
 */
export function _cancelAutoClose() {
    if (_autoCloseTimer != null) {
        clearTimeout(_autoCloseTimer);
        _autoCloseTimer = null;
    }
}

/**
 * Test-only — reset module state.
 */
export function _resetSuccessLoader() {
    _state = null;
    _cancelAutoClose();
}
