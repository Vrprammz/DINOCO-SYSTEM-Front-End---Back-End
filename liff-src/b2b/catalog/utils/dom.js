/**
 * B2B LIFF E-Catalog — DOM helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   Source location: inline <script>
 *     - line 1900: toast(m) — fade-in/out with #liffToast element
 *     - line 1878: showAuthError(t,m,retryable) — auth error overlay
 *     - line 1895: showLinkExpired() — link-expired overlay
 *
 * The B2B catalog has a SIMPLER overlay model than B2F maker:
 *   - One toast (#liffToast) — short-lived bottom-center notification
 *   - One persistent loading screen (#loadingScreen — see styles.css)
 *   - One auth error block (#authError) with retry button
 *   - One link-expired block (#linkExpired) — terminal state
 *   - One submit overlay (#submitOverlay) used during /place-order
 *
 * State: module-private LOCKED flag mirrors inline pattern. `lockBtn` /
 * `unlockBtn` should be paired in try/finally — keeping that contract
 * consistent across LIFF surfaces.
 */

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
 * Show a transient toast at bottom-center (above iOS home indicator).
 *
 * Mirrors `toast(m)` at line 1900 of inline V.32.9:
 *   `function toast(m){var el=document.getElementById('liffToast');
 *     el.textContent=m;el.classList.add('show');
 *     setTimeout(function(){el.classList.remove('show');},3000);}`
 *
 * Auto-creates the toast element if missing (defensive — matches B2F
 * maker pattern). 3-second lifetime preserved from inline.
 *
 * @param {string} msg
 */
export function showToast(msg) {
    let el = document.getElementById("liffToast");
    if (!el) {
        el = document.createElement("div");
        el.id = "liffToast";
        el.className = "b2b-cat-toast";
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3000);
}

/**
 * Render the persistent auth error block.
 *
 * Mirrors `showAuthError(t,m,retryable)` at line 1878 of inline V.32.9.
 * When `retryable` is true, exposes a button — caller wires the retry
 * handler via `onRetry` (inline used a closure to call `authAndLoad`).
 *
 * @param {string} title
 * @param {string} message
 * @param {boolean} [retryable]
 * @param {() => void} [onRetry]
 */
export function showAuthError(title, message, retryable, onRetry) {
    const loading = document.getElementById("loadingScreen");
    if (loading) loading.classList.add("hide");

    const titleEl = document.getElementById("authErrTitle");
    if (titleEl) titleEl.textContent = title;

    const msgEl = document.getElementById("authErrMsg");
    if (msgEl) msgEl.textContent = message;

    const block = document.getElementById("authError");
    if (block) block.style.display = "block";

    const btn = document.getElementById("authRetryBtn");
    if (!btn) return;
    if (retryable) {
        btn.style.display = "inline-block";
        btn.onclick = () => {
            btn.style.display = "none";
            if (block) block.style.display = "none";
            if (loading) {
                loading.classList.remove("hide");
                const txt = document.querySelector(".b2b-cat-loading-text");
                if (txt) txt.textContent = "กำลังเชื่อมต่อใหม่...";
            }
            if (typeof onRetry === "function") onRetry();
        };
    } else {
        btn.style.display = "none";
    }
}

/**
 * Render the terminal "link expired" overlay.
 *
 * Mirrors `showLinkExpired()` at line 1895 of inline V.32.9. Used when
 * the LIFF entry URL has been opened past its `_ts` validity window.
 */
export function showLinkExpired() {
    const loading = document.getElementById("loadingScreen");
    if (loading) loading.classList.add("hide");
    const auth = document.getElementById("authError");
    if (auth) auth.style.display = "none";
    const expired = document.getElementById("linkExpired");
    if (expired) expired.style.display = "block";
}

/**
 * Show the submit overlay (spinner + message) during /place-order.
 *
 * @param {string} [message] — defaults to inline V.32.9 message
 */
export function showLoading(message) {
    const overlay = document.getElementById("submitOverlay");
    if (!overlay) return;
    overlay.classList.add("show");
    const msgEl = document.getElementById("submitMsg");
    if (msgEl && message) msgEl.textContent = message;
}

/**
 * Hide the submit overlay.
 */
export function hideLoading() {
    const overlay = document.getElementById("submitOverlay");
    if (overlay) overlay.classList.remove("show");
}

/**
 * Lock a button while an async action is in flight. Pair with `unlockBtn`
 * in a finally block to guarantee release.
 *
 * @param {HTMLButtonElement|null|undefined} btn
 * @param {string} [busyText] — optional replacement label while locked
 */
export function lockBtn(btn, busyText) {
    if (LOCKED) return false;
    LOCKED = true;
    if (btn) {
        btn.disabled = true;
        if (busyText && !btn.dataset.b2bOriginalText) {
            btn.dataset.b2bOriginalText = btn.textContent || "";
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
    if (btn.dataset.b2bOriginalText) {
        btn.textContent = btn.dataset.b2bOriginalText;
        delete btn.dataset.b2bOriginalText;
    }
}

/**
 * Wire offline detection — listens on window.online/offline and toasts.
 *
 * Idempotent: subsequent calls no-op (uses a sentinel on window).
 */
export function setupOfflineDetection() {
    if (typeof window === "undefined") return;
    if (window.__b2bCatOfflineWired) return;
    window.__b2bCatOfflineWired = true;
    window.addEventListener("offline", () => {
        showToast("⚠️ ออฟไลน์ — ตรวจสอบสัญญาณ");
    });
    window.addEventListener("online", () => {
        showToast("✓ ออนไลน์อีกครั้ง");
    });
}
