/**
 * B2F Admin LIFF E-Catalog — Maker Home loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.15
 *   - line 1601: loadMakers() — fetch + render maker dropdown
 *
 * Round 3 contract:
 *   `setupMakerHome({ api, state })` once at bootstrap; `loadMakerHome()`
 *   triggers fetch + render. Loader is mount-tolerant — when the inline
 *   V.7.15 DOM (#b2fMakerSelect) is present it delegates to that node;
 *   when the Round 4+ Vite container `#b2f-catalog-app` exists it injects
 *   markup. Either way, `state.makerId` is updated when the user picks.
 */

import { showLoading, hideLoading, showToast } from "../utils/dom.js";
import { escHtml } from "../utils/format.js";

/** @type {{ getMakers: Function }|null} */
let _api = null;
/** @type {object|null} */
let _state = null;
/** @type {((makerId: string) => void)|null} */
let _onPick = null;

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
            _wireMakerPickerClicks(mountVite);
        }
        // Inline V.7.15 already manages #b2fMakerSelect — Round 3 doesn't
        // touch it. Round 4 will add the cut-over guard.
    } catch (err) {
        hideLoading();
        showToast("โหลดรายชื่อโรงงานไม่สำเร็จ", "error");
        const e = /** @type {{ message?: string }} */ (err || {});
        const msg = e.message ? String(e.message) : "";
        if (mountVite) {
            mountVite.innerHTML =
                '<div class="b2f-error">โหลดรายชื่อโรงงานไม่สำเร็จ' +
                (msg ? ": " + escHtml(msg) : "") +
                "</div>";
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
                '<button type="button" class="b2f-maker-card" data-maker-id="' +
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
 * @param {HTMLElement} root
 */
function _wireMakerPickerClicks(root) {
    const buttons = root.querySelectorAll(".b2f-maker-card[data-maker-id]");
    buttons.forEach(function (btn) {
        btn.addEventListener("click", function () {
            const id = btn.getAttribute("data-maker-id") || "";
            if (!id) return;
            if (_state) {
                /** @type {any} */ (_state).makerId = id;
            }
            if (_onPick) _onPick(id);
        });
    });
}

/**
 * Test-only — reset module state.
 */
export function _resetMakerHome() {
    _api = null;
    _state = null;
    _onPick = null;
}
