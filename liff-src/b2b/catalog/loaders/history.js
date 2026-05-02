/**
 * B2B LIFF E-Catalog — Order History page loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   - line 1727-1850 : history filter chips + render + load-more pagination
 *
 * Behavioral parity:
 *   - GET /b2b/v1/order-history?page=N&per_page=10&status=X
 *   - Filter chip changes RESET pagination to page 1 (matches inline).
 *   - Load More appends to the rendered list + increments _state.historyPage.
 *   - Tab switch persists the current filter (state is module-private but
 *     mirrored on _state.historyFilter for cross-loader read).
 */

import { showToast, showLoading, hideLoading } from "../utils/dom.js";
import {
    renderHistory,
    renderHistoryFilter,
    renderLoadMoreButton,
    HISTORY_FILTERS,
} from "../pages/history.js";

/**
 * @param {unknown} err
 * @returns {string}
 */
function _msg(err) {
    if (err && typeof err === "object" && "message" in err) {
        const m = /** @type {{message?: unknown}} */ (err).message;
        if (typeof m === "string") return m;
    }
    return "";
}

let _api = null;
let _state = null;

/**
 * @param {{
 *   api: { getOrderHistory: Function, cancelOrder?: Function },
 *   state: object,
 * }} deps
 */
export function setupHistory(deps) {
    if (!deps || !deps.api || !deps.state) {
        throw new Error("setupHistory: deps.api + deps.state required");
    }
    _api = deps.api;
    _state = deps.state;
    if (!_state.historyFilter) _state.historyFilter = "";
    if (!_state.historyPage) _state.historyPage = 1;
    if (!_state.historyTotalPages) _state.historyTotalPages = 1;
    if (!Array.isArray(_state.historyItems)) _state.historyItems = [];
}

/**
 * Load + render history list. Resets pagination unless `opts.append`.
 *
 * @param {{ append?: boolean, perPage?: number }} [opts]
 * @returns {Promise<void>}
 */
export async function loadHistory(opts) {
    if (!_api || !_state) return;
    const append = !!(opts && opts.append);
    const perPage = (opts && opts.perPage) || 10;
    const page = append ? (_state.historyPage || 1) : 1;
    const status = _state.historyFilter || "";

    showLoading();
    try {
        const params = { page, per_page: perPage };
        if (status) params.status = status;
        const res = await _api.getOrderHistory(params);
        const items =
            (res && (res.orders || res.data || res.items)) || [];
        const totalPages =
            (res && (res.total_pages || res.totalPages)) || 1;
        if (append) {
            _state.historyItems = (_state.historyItems || []).concat(items);
        } else {
            _state.historyItems = items;
        }
        _state.historyPage = page;
        _state.historyTotalPages = totalPages;
        _render();
    } catch (err) {
        showToast(_msg(err) || "โหลดประวัติไม่สำเร็จ");
    } finally {
        hideLoading();
    }
}

/**
 * Filter chip click handler. Resets pagination + reloads.
 *
 * @param {string} status
 * @returns {Promise<void>}
 */
export async function handleHistoryFilter(status) {
    if (!_state) return;
    _state.historyFilter = status || "";
    _state.historyPage = 1;
    await loadHistory({ append: false });
}

/**
 * Load More click handler. Appends next page.
 *
 * @returns {Promise<void>}
 */
export async function handleLoadMore() {
    if (!_state) return;
    if ((_state.historyPage || 1) >= (_state.historyTotalPages || 1)) {
        return; // No more pages
    }
    _state.historyPage = (_state.historyPage || 1) + 1;
    await loadHistory({ append: true });
}

/**
 * Cancel an order from history list. Confirms via Thai toast then calls
 * api.cancelOrder. Reloads the list on success.
 *
 * @param {string|number} orderId
 * @param {string} [reason]
 * @returns {Promise<void>}
 */
export async function handleCancelOrder(orderId, reason) {
    if (!_api || !_state || !orderId) return;
    if (typeof _api.cancelOrder !== "function") return;
    showLoading();
    try {
        await _api.cancelOrder(orderId, reason || "");
        showToast("ส่งคำขอยกเลิกแล้ว");
        await loadHistory({ append: false });
    } catch (err) {
        showToast(_msg(err) || "ยกเลิกไม่สำเร็จ");
    } finally {
        hideLoading();
    }
}

function _render() {
    if (typeof document === "undefined" || !_state) return;
    const root = document.getElementById("b2b-catalog-app");
    if (!root) return;
    const filterHtml = renderHistoryFilter(_state.historyFilter || "");
    const listHtml = renderHistory(_state.historyItems || [], {
        page: _state.historyPage || 1,
        totalPages: _state.historyTotalPages || 1,
    });
    const loadMore = renderLoadMoreButton({
        page: _state.historyPage || 1,
        totalPages: _state.historyTotalPages || 1,
    });
    root.innerHTML = filterHtml + listHtml + loadMore;
}

export const _internal = { HISTORY_FILTERS };

/**
 * Test-only — reset module state.
 */
export function _resetHistoryLoader() {
    _api = null;
    _state = null;
}
