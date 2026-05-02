/**
 * B2B LIFF E-Catalog — Home page loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   - line 884-901 : renderViewState (sub-header + cross-pills visibility)
 *   - line 950-985 : renderHome (model row + category row composite)
 *
 * Round 2 already provides pure HTML-string builders in pages/home.js.
 * This loader wires them to a state object + DOM injection. Inline V.32.9
 * still owns the production DOM until Round 5 cut-over — this module
 * runs side-by-side as the cut-over target.
 */

import { showAuthError, showLoading, hideLoading } from "../utils/dom.js";
import {
    renderHome,
    renderViewState,
    renderCrossFilterPills,
    collectCategoriesForModel,
    collectModelsForCategory,
} from "../pages/home.js";

let _api = null;
let _state = null;
let _renderCatalogCb = null;

/**
 * @param {{
 *   api: { getCatalog?: Function },
 *   state: object,
 *   onCatalogRender?: () => void,
 * }} deps
 */
export function setupHome(deps) {
    if (!deps || !deps.state) {
        throw new Error("setupHome: deps.state required");
    }
    _api = deps.api || null;
    _state = deps.state;
    _renderCatalogCb = deps.onCatalogRender || null;
}

/**
 * Render the home view (model row + category row + sub-header) into
 * #b2b-catalog-app. Reads `_state.products` (cached by catalog loader)
 * — does NOT hit the API again.
 *
 * @returns {Promise<void>}
 */
export async function loadHome() {
    if (!_state) return;
    const products = _state.products || [];
    if (!products.length && _api && typeof _api.getCatalog === "function") {
        // Fall back to a lazy fetch when called before catalog loader
        // ran (defensive — shouldn't happen on the happy path).
        showLoading();
        try {
            const res = await _api.getCatalog();
            _state.products = (res && (res.products || res.data)) || [];
        } catch (err) {
            const msg = (err && err.message) || "";
            showAuthError("โหลดสินค้าไม่สำเร็จ", msg, true);
        } finally {
            hideLoading();
        }
    }
    _render();
}

function _render() {
    if (typeof document === "undefined" || !_state) return;
    const root = document.getElementById("b2b-catalog-app");
    if (!root) return;
    root.innerHTML = renderHome(_state.products || [], {
        modelImageMap: _state.modelImageMap || {},
        modelOrder: _state.modelOrder || [],
        categoryOrder: _state.categoryOrder || [],
    });
}

/**
 * Apply a model filter — switches to "model" view + caches selection on
 * state. Caller is expected to re-render the catalog grid after this
 * runs (we fire `onCatalogRender` callback for that).
 *
 * @param {string} modelName
 * @returns {void}
 */
export function applyModelFilter(modelName) {
    if (!_state) return;
    _state.filterModel = modelName || "";
    _state.viewMode = modelName ? "model" : "home";
    _state.crossFilter = "";
    _state.filterCategory = "";
    _renderHeaderState();
    if (typeof _renderCatalogCb === "function") _renderCatalogCb();
}

/**
 * Apply a category drilldown filter.
 *
 * @param {string} category
 * @returns {void}
 */
export function applyCategoryFilter(category) {
    if (!_state) return;
    _state.filterCategory = category || "";
    _state.viewMode = category ? "category" : "home";
    _state.crossFilter = "";
    _state.filterModel = "";
    _renderHeaderState();
    if (typeof _renderCatalogCb === "function") _renderCatalogCb();
}

/**
 * Apply a cross-filter pill (model+category intersection).
 *
 * @param {string} crossKey  — format "model|category"
 * @returns {void}
 */
export function applyCrossFilter(crossKey) {
    if (!_state) return;
    _state.crossFilter = crossKey || "";
    if (typeof _renderCatalogCb === "function") _renderCatalogCb();
}

/**
 * Clear all filters + return to home view.
 *
 * @returns {void}
 */
export function resetFilters() {
    if (!_state) return;
    _state.viewMode = "home";
    _state.filterModel = "";
    _state.filterCategory = "";
    _state.crossFilter = "";
    _state.searchQuery = "";
    _renderHeaderState();
    _render();
}

function _renderHeaderState() {
    if (typeof document === "undefined" || !_state) return;
    // renderViewState returns an HTML chunk for the sub-header; injection
    // point inline V.32.9 = #subHeader. Defensive when missing.
    const subHeader = document.getElementById("subHeader");
    if (subHeader) {
        subHeader.innerHTML = renderViewState(_state);
    }
    const crossPills = document.getElementById("crossPills");
    if (crossPills) {
        const pillState = _computeCrossPillState();
        crossPills.innerHTML = renderCrossFilterPills(
            _state.products || [],
            pillState
        );
    }
}

function _computeCrossPillState() {
    if (!_state) return { viewMode: "home" };
    const viewMode = _state.viewMode;
    const products = _state.products || [];
    if (viewMode === "model" && _state.filterModel) {
        return {
            viewMode,
            filterModel: _state.filterModel,
            categories: collectCategoriesForModel(products, _state.filterModel),
            crossFilter: _state.crossFilter || "",
        };
    }
    if (viewMode === "category" && _state.filterCategory) {
        return {
            viewMode,
            filterCategory: _state.filterCategory,
            models: collectModelsForCategory(products, _state.filterCategory),
            crossFilter: _state.crossFilter || "",
        };
    }
    return { viewMode };
}

/**
 * Test-only — reset module state.
 */
export function _resetHomeLoader() {
    _api = null;
    _state = null;
    _renderCatalogCb = null;
}
