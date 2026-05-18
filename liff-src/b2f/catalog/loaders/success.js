/**
 * B2F Admin LIFF E-Catalog — Success screen loader (V.0.5 — Dead-Workflow Spec V.1.0 P0.7)
 *
 * V.0.5 (2026-05-18) P0.7 — PC browser fallback. Previously `liff.closeWindow()`
 * + `window.close()` failed silently for non-LIFF-in-app users, leaving the
 * success screen frozen indefinitely with no next action. Now:
 *   - LIFF in-app: auto-close 5s (preserved behavior)
 *   - PC browser / LIFF web: render "📱 เปิดในไลน์" deep-link + "✕ ปิดหน้านี้"
 *     button + countdown gracefully reaching 0 without false promises.
 *
 * V.0.4 Round 3 contract: setupSuccess({ state }) once + loadSuccess() renders.
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.15
 *   - line 3172-3192: showSuccess(poNumber, poId, warnings) + auto-close 5s
 */

import { escHtml } from "../utils/format.js";

/** @type {any} */
let _state = null;
/** @type {number|null} */
let _autoCloseTimer = null;
/** @type {number|null} */
let _countdownTimer = null;

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
 * V.0.5 P0.7 — detect LIFF in-app context. Returns true only when LIFF SDK
 * is loaded AND running inside the LINE app (NOT external browser).
 * @returns {boolean}
 */
function _isInLineApp() {
    if (typeof window === "undefined") return false;
    try {
        const w = /** @type {any} */ (window);
        return !!(w.liff && typeof w.liff.isInClient === "function" && w.liff.isInClient());
    } catch (_e) {
        return false;
    }
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
    const inApp = _isInLineApp();
    // V.0.5 P0.7 — branched hint + action area based on environment
    const actionArea = inApp
        ? '<div class="b2f-success-hint" data-role="auto-close-hint">' +
          'หน้าต่างนี้จะปิดอัตโนมัติใน <span data-role="countdown">5</span> วินาที' +
          "</div>"
        : '<div class="b2f-success-hint">บันทึก PO เรียบร้อยแล้ว</div>' +
          '<div class="b2f-success-actions" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:16px">' +
          '<button type="button" class="b2f-success-line-btn" data-action="line-open" ' +
          'style="min-height:44px;padding:10px 20px;background:#06C755;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">' +
          '📱 เปิดในไลน์</button>' +
          '<button type="button" class="b2f-success-close-btn" data-action="close" ' +
          'style="min-height:44px;padding:10px 20px;background:#fff;color:#1A3A5C;border:1px solid #1A3A5C;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">' +
          '✕ ปิดหน้านี้</button>' +
          "</div>";
    return (
        '<div class="b2f-success">' +
        '<div class="b2f-success-icon">&#9989;</div>' +
        '<h2 class="b2f-success-title">สร้าง PO สำเร็จ!</h2>' +
        '<div class="b2f-success-po">' + num + "</div>" +
        warnHtml +
        actionArea +
        "</div>"
    );
}

/**
 * Render success screen + schedule auto-close (LIFF only) OR wire manual
 * fallback buttons (PC).
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
    if (_isInLineApp()) {
        _scheduleAutoClose();
        _startCountdown(mount);
    } else {
        _wirePcFallbackButtons(mount);
    }
}

/**
 * Schedule auto-close of LIFF window after 5 seconds (LIFF in-app only).
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
            if (w.liff && typeof w.liff.closeWindow === "function") {
                w.liff.closeWindow();
            }
        } catch (_e) { /* swallow */ }
        _autoCloseTimer = null;
    }, 5000));
}

/**
 * V.0.5 P0.7 — Visible 5s countdown for LIFF in-app users (reuses existing
 * auto-close timer; countdown is cosmetic). Ticks every 1s, updates DOM.
 * @param {HTMLElement} mount
 */
function _startCountdown(mount) {
    if (typeof window === "undefined" || !mount) return;
    if (_countdownTimer != null) {
        clearInterval(_countdownTimer);
        _countdownTimer = null;
    }
    let remaining = 5;
    _countdownTimer = /** @type {any} */ (setInterval(function () {
        remaining -= 1;
        const span = mount.querySelector('[data-role="countdown"]');
        if (span) span.textContent = String(Math.max(0, remaining));
        if (remaining <= 0) {
            clearInterval(/** @type {any} */ (_countdownTimer));
            _countdownTimer = null;
        }
    }, 1000));
}

/**
 * V.0.5 P0.7 — wire PC fallback buttons. "เปิดในไลน์" navigates to LINE OA
 * deep-link; "ปิดหน้านี้" attempts window.close() with graceful no-op when
 * blocked by browser policy (logged to console for ops diagnostics).
 *
 * @param {HTMLElement} mount
 */
function _wirePcFallbackButtons(mount) {
    if (!mount) return;
    const lineBtn = mount.querySelector('[data-action="line-open"]');
    const closeBtn = mount.querySelector('[data-action="close"]');
    if (lineBtn) {
        lineBtn.addEventListener("click", function () {
            // Best-effort LINE OA add — caller can override LINE OA URL via
            // state.lineOaUrl if needed
            const w = /** @type {any} */ (window);
            const lineUrl =
                (_state && _state.lineOaUrl) ||
                (w.DINOCO_LINE_OA_URL) ||
                "https://lin.ee/dinoco";
            try {
                window.open(lineUrl, "_blank", "noopener");
            } catch (_e) {
                window.location.href = lineUrl;
            }
        });
    }
    if (closeBtn) {
        closeBtn.addEventListener("click", function () {
            try {
                window.close();
                // If we're still here after 100ms, window.close() was blocked
                // (browser policy: only allowed for windows opened by script).
                setTimeout(function () {
                    if (!window.closed) {
                        console.info(
                            "[B2F Success] window.close() blocked by browser policy — user must close tab manually"
                        );
                    }
                }, 100);
            } catch (_e) { /* swallow */ }
        });
    }
}

/**
 * Cancel pending auto-close (used by tests + when user navigates back).
 */
export function _cancelAutoClose() {
    if (_autoCloseTimer != null) {
        clearTimeout(_autoCloseTimer);
        _autoCloseTimer = null;
    }
    if (_countdownTimer != null) {
        clearInterval(_countdownTimer);
        _countdownTimer = null;
    }
}

/**
 * Test-only — reset module state.
 */
export function _resetSuccessLoader() {
    _state = null;
    _cancelAutoClose();
}
