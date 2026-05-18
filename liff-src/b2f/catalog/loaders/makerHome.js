/**
 * B2F Admin LIFF E-Catalog — Maker Home loader (V.0.6 — Dead-Workflow Spec V.1.0 P0.9)
 *
 * V.0.6 (2026-05-18) P0.9 — Error state now uses renderRetryableError() with
 * 🔄 retry + ← back navigation. Previously a plain `<div class="b2f-error">` with
 * the API message had no actions — user trapped on error screen.
 *
 * V.0.5 Round 4 contract: maker cards now emit `data-action="pick-maker"`
 * + `data-maker-id` and rely on the central event-delegation listener
 * wired in entry.js.
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.15
 *   - line 1601: loadMakers() — fetch + render maker dropdown
 */

import { showLoading, hideLoading, showToast } from "../utils/dom.js";
import { escHtml } from "../utils/format.js";
import { renderRetryableError } from "../../../shared/error-state.js";

/** @type {{ getMakers: Function }|null} */
let _api = null;
/** @type {object|null} */
let _state = null;
/** @type {((makerId: string) => void)|null} */
let _onPick = null;

/**
 * Public picker — called from event-delegation when a card with
 * `data-action="pick-maker"` is clicked. Updates state + invokes
 * the bootstrap-supplied onPick (typically `goToView('catalog')`).
 *
 * @param {string} makerId
 * @returns {void}
 */
export function handlePickMaker(makerId) {
    if (!makerId) return;
    if (_state) {
        /** @type {any} */ (_state).makerId = String(makerId);
    }
    if (_onPick) _onPick(String(makerId));
}

/**
 * @param {{
 *   api: { getMakers: Function },
 *   state: object,
 *   onPick?: (makerId: string) => void
 * }} deps
 * @returns {void}
 */
export function setupMakerHome(deps) {
    if (!deps || !deps.api || !deps.state) {
        throw new Error("setupMakerHome: api + state required");
    }
    _api = deps.api;
    _state = deps.state;
    _onPick = typeof deps.onPick === "function" ? deps.onPick : null;
}

/**
 * Fetch makers + render the picker. Mount-tolerant: falls back to inline
 * V.7.15 node when Vite container is absent.
 *
 * @returns {Promise<void>}
 */
export async function loadMakerHome() {
    if (!_api || !_state) return;
    const mountVite = (typeof document !== "undefined")
        ? document.getElementById("b2f-catalog-app")
        : null;
    showLoading();
    try {
        const res = await _api.getMakers();
        hideLoading();
        const makers = (res && (res.data || res.makers)) || [];
        if (!Array.isArray(makers) || !makers.length) {
            if (mountVite) {
                mountVite.innerHTML =
                    '<div class="b2f-empty">ไม่พบรายชื่อโรงงาน</div>';
            }
            return;
        }
        // Cache for downstream loaders.
        if (_state) {
            /** @type {any} */ (_state).makers = makers;
        }
        if (mountVite) {
            mountVite.innerHTML = _buildMakerHomeHtml(makers);
            // Round 4 — no imperative listener; event-delegation in
            // entry.js dispatches `data-action="pick-maker"` →
            // handlePickMaker via the bootstrap deps bag.
        }
        // Inline V.7.15 already manages #b2fMakerSelect — Round 3 doesn't
        // touch it. Round 4 will add the cut-over guard.
    } catch (err) {
        hideLoading();
        const e = /** @type {{ message?: string }} */ (err || {});
        const msg = e.message ? String(e.message) : "";
        if (mountVite) {
            // V.0.6 P0.9 — render full ErrorState with retry + back navigation
            // instead of dead-end "<div class='b2f-error'>" with no actions.
            renderRetryableError(mountVite, {
                title: "โหลดรายชื่อโรงงานไม่สำเร็จ",
                message: "ไม่สามารถโหลดรายชื่อโรงงานได้ในขณะนี้ — ตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองอีกครั้ง",
                reason: msg,
                code: "MAKER_LIST_LOAD_FAIL",
                onRetry: () => loadMakerHome(),
                onBack: () => {
                    // Best-effort back navigation — close LIFF if in-app, else history.back
                    try {
                        const w = /** @type {any} */ (window);
                        if (w.liff && typeof w.liff.isInClient === "function" && w.liff.isInClient()) {
                            w.liff.closeWindow();
                        } else if (typeof window !== "undefined" && window.history) {
                            window.history.back();
                        }
                    } catch (_e) { /* swallow */ }
                },
            });
        } else {
            // Fallback toast if no mount available
            showToast("โหลดรายชื่อโรงงานไม่สำเร็จ" + (msg ? ": " + msg : ""), "error");
        }
    }
}

/**
 * @param {Array<any>} makers
 * @returns {string}
 */
function _buildMakerHomeHtml(makers) {
    const cards = makers
        .map(function (m) {
            const id = String(m.id || m.maker_id || "");
            const name = escHtml(String(m.name || m.maker_name || ""));
            const cur = escHtml(String(m.currency || m.maker_currency || "THB"));
            return (
                '<button type="button" class="b2f-maker-card" data-action="pick-maker" data-maker-id="' +
                escHtml(id) +
                '">' +
                '<div class="b2f-maker-name">' + name + "</div>" +
                '<div class="b2f-maker-currency">' + cur + "</div>" +
                "</button>"
            );
        })
        .join("");
    return (
        '<div class="b2f-maker-home">' +
        '<h2 class="b2f-maker-home-title">เลือกโรงงาน</h2>' +
        '<div class="b2f-maker-list">' + cards + "</div>" +
        "</div>"
    );
}

/**
 * Test-only — reset module state.
 */
export function _resetMakerHome() {
    _api = null;
    _state = null;
    _onPick = null;
}
