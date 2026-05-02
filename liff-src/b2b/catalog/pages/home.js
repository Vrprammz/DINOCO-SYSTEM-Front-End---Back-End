/**
 * B2B LIFF E-Catalog — Home page renderers (V.0.3 Round 2)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   - line 884-901 : renderViewState (sub-header + cross-pills visibility)
 *   - line 903-944 : renderCrossFilterPills (model+category cross-filter)
 *   - line 950-953 : renderHome (composite: model row + category row)
 *   - line 955-971 : renderModelRow (motorcycle cards horizontal)
 *   - line 973-985 : renderCategoryRow (category drilldown)
 *
 * Round 2 contract:
 *   These are PURE functions that return HTML strings. The caller
 *   (entry.js bootstrap or the inline bridge in Snippet 4 V.32.9) is
 *   responsible for injecting them into the right DOM nodes
 *   (#modelRow / #catRow / #crossPills) and for attaching event
 *   delegation. This keeps renderers testable without jsdom DOM
 *   plumbing in unit tests.
 *
 * REG-029 byte-identical preservation:
 *   - Inline class names ("b2b-cat-model-card", "b2b-cat-pill", ...)
 *   - Thai user-facing strings ("ทั้งหมด")
 *   - Emoji fallback (🏍️) when motorcycle has no image
 *   - DOM data attributes (`data-model-name`, `data-cat-name`, etc.)
 *     are NEW in Round 2 to support event delegation in Round 3+. Inline
 *     V.32.9 still uses `card.onclick=` direct assignment which works
 *     side-by-side until Round 5 cut-over.
 */

import { escHtml } from "../utils/format.js";

/**
 * Test if a product matches a motorcycle model name. Mirrors inline
 * `productMatchesModel(p, modelName)` line 988-996.
 *
 * `_models` may be an array of strings OR objects `{name: "..."}`. Both
 * shapes are produced by the catalog API depending on cache freshness;
 * the renderer must handle both transparently.
 *
 * @param {{ _models?: Array<string|{name:string}> }} product
 * @param {string} modelName
 * @returns {boolean}
 */
export function productMatchesModel(product, modelName) {
    if (!modelName) return true;
    const models = (product && product._models) || [];
    for (let i = 0; i < models.length; i++) {
        const m = models[i];
        const n = typeof m === "string" ? m : (m && m.name) || "";
        if (n === modelName) return true;
    }
    return false;
}

/**
 * Build HTML for a single motorcycle model card.
 *
 * Mirrors inline V.32.9 line 962-969. Two render branches:
 *   - has image_url  → <img> + name
 *   - no image_url   → 🏍️ emoji + name
 *
 * `data-action="set-model-view"` + `data-model-name=...` are added so
 * Round 3 event delegation can replace `card.onclick=` without changing
 * the DOM structure.
 *
 * @param {{ name: string, image_url?: string }} model
 * @returns {string} HTML
 */
export function renderModelCard(model) {
    const name = (model && model.name) || "";
    const safeName = escHtml(name);
    const dataAttrs =
        ' data-action="set-model-view" data-model-name="' + safeName + '"';
    if (model && model.image_url) {
        return (
            '<div class="b2b-cat-model-card"' + dataAttrs + ">" +
            '<img class="b2b-cat-model-img" src="' + escHtml(model.image_url) +
            '" alt="" loading="lazy">' +
            '<div class="b2b-cat-model-name">' + safeName + "</div>" +
            "</div>"
        );
    }
    return (
        '<div class="b2b-cat-model-card"' + dataAttrs + ">" +
        '<div class="b2b-cat-model-emoji">🏍️</div>' +
        '<div class="b2b-cat-model-name">' + safeName + "</div>" +
        "</div>"
    );
}

/**
 * Render the model row HTML.
 *
 * Returns "" when no models — caller should hide the label as well
 * (see `shouldShowModelLabel` below).
 *
 * Mirrors inline `renderModelRow()` V.32.9 line 955-971 exactly except
 * that we return HTML string instead of `appendChild` per node.
 *
 * @param {{ availableModels: Array<{name:string,image_url?:string}> }} state
 * @returns {string} HTML
 */
export function renderModelRow(state) {
    const models = (state && state.availableModels) || [];
    if (!models.length) return "";
    return models.map(renderModelCard).join("");
}

/**
 * Returns whether the model label should be visible.
 *
 * @param {{ availableModels?: Array<unknown> }} state
 * @returns {boolean}
 */
export function shouldShowModelLabel(state) {
    return !!(state && state.availableModels && state.availableModels.length);
}

/**
 * Build HTML for a single category card.
 *
 * Mirrors inline V.32.9 line 980-983. Note inline does NOT escape `c.icon`
 * since the icons are emoji literals owned by server config (trusted).
 * We preserve that behavior to match render output byte-for-byte.
 *
 * @param {{ name: string, icon: string }} category
 * @returns {string} HTML
 */
export function renderCategoryCard(category) {
    const name = (category && category.name) || "";
    const icon = (category && category.icon) || "";
    const safeName = escHtml(name);
    return (
        '<div class="b2b-cat-cat-card" data-action="set-category-view" ' +
        'data-cat-name="' + safeName + '">' +
        '<div class="b2b-cat-cat-icon">' + icon + "</div>" +
        '<div class="b2b-cat-cat-name">' + safeName + "</div>" +
        "</div>"
    );
}

/**
 * Render the category row HTML.
 *
 * @param {{ availableCategories: Array<{name:string,icon:string}> }} state
 * @returns {string} HTML
 */
export function renderCategoryRow(state) {
    const cats = (state && state.availableCategories) || [];
    if (!cats.length) return "";
    return cats.map(renderCategoryCard).join("");
}

/**
 * Returns whether the category label should be visible.
 *
 * @param {{ availableCategories?: Array<unknown> }} state
 * @returns {boolean}
 */
export function shouldShowCategoryLabel(state) {
    return !!(
        state && state.availableCategories && state.availableCategories.length
    );
}

/**
 * Composite home renderer — returns both model + category HTML in one
 * call so the bridge can use a single function call.
 *
 * @param {object} state
 * @returns {{ modelRowHtml: string, categoryRowHtml: string,
 *             showModelLabel: boolean, showCategoryLabel: boolean }}
 */
export function renderHome(state) {
    return {
        modelRowHtml: renderModelRow(state),
        categoryRowHtml: renderCategoryRow(state),
        showModelLabel: shouldShowModelLabel(state),
        showCategoryLabel: shouldShowCategoryLabel(state),
    };
}

/**
 * Compute the visibility state for the catalog shell based on the
 * current `viewMode`. Mirrors inline `renderViewState()` V.32.9
 * line 884-901 — encapsulates the show/hide decision tree but does NOT
 * touch DOM. The caller applies the booleans to `style.display`.
 *
 * @param {{
 *   viewMode: 'home'|'model'|'category'|'search',
 *   filterModel?: string,
 *   filterCategory?: string,
 *   recommendedSkus?: Array<unknown>,
 * }} state
 * @returns {{
 *   showHomeRows: boolean,
 *   showSearchWrap: boolean,
 *   showFreqSection: boolean,
 *   showSubHeader: boolean,
 *   subTitle: string,
 * }}
 */
export function renderViewState(state) {
    const viewMode = (state && state.viewMode) || "home";
    const isHome = viewMode === "home";
    const isSub = viewMode === "model" || viewMode === "category";
    const recommended = (state && state.recommendedSkus) || [];
    const filterModel = (state && state.filterModel) || "";
    const filterCategory = (state && state.filterCategory) || "";
    return {
        showHomeRows: isHome,
        showSearchWrap: isHome || viewMode === "search",
        showFreqSection: isHome && recommended.length > 0,
        showSubHeader: isSub,
        subTitle: viewMode === "model" ? filterModel : filterCategory,
    };
}

/**
 * Collect distinct categories visible under a model filter.
 *
 * @param {Array<{category?:string,_models?:Array<string|{name:string}>}>} products
 * @param {string} modelName
 * @returns {Array<string>} sorted ascending
 */
export function collectCategoriesForModel(products, modelName) {
    const cats = {};
    (products || []).forEach((p) => {
        if (!productMatchesModel(p, modelName)) return;
        const c = (p && p.category) || "";
        if (c) cats[c] = true;
    });
    return Object.keys(cats).sort();
}

/**
 * Collect distinct models visible under a category filter.
 *
 * @param {Array<{category?:string,_models?:Array<string|{name:string}>}>} products
 * @param {string} categoryName
 * @returns {Array<string>} sorted ascending
 */
export function collectModelsForCategory(products, categoryName) {
    const models = {};
    (products || []).forEach((p) => {
        if (((p && p.category) || "") !== categoryName) return;
        ((p && p._models) || []).forEach((m) => {
            const n = typeof m === "string" ? m : (m && m.name) || "";
            if (n) models[n] = true;
        });
    });
    return Object.keys(models).sort();
}

/**
 * Render the cross-filter pills HTML for the sub-header.
 *
 * Mirrors inline `renderCrossFilterPills()` V.32.9 line 903-944 — when
 * in `model` mode we show category pills, when in `category` mode we
 * show model pills, plus a leading "ทั้งหมด" pill that clears the
 * cross-filter.
 *
 * Returns "" when not in a sub-view (caller hides the row).
 *
 * @param {{
 *   viewMode: string,
 *   crossFilter?: string,
 *   filterModel?: string,
 *   filterCategory?: string,
 *   products?: Array<unknown>,
 * }} state
 * @returns {string} HTML
 */
export function renderCrossFilterPills(state) {
    const viewMode = (state && state.viewMode) || "home";
    const isSub = viewMode === "model" || viewMode === "category";
    if (!isSub) return "";
    const crossFilter = (state && state.crossFilter) || "";
    const products = (state && state.products) || [];

    const allActive = !crossFilter ? " active" : "";
    let html =
        '<button class="b2b-cat-pill' + allActive + '" ' +
        'data-action="set-cross-filter" data-cross="">ทั้งหมด</button>';

    if (viewMode === "model") {
        const cats = collectCategoriesForModel(products, state.filterModel);
        cats.forEach((c) => {
            const active = crossFilter === c ? " active" : "";
            const safe = escHtml(c);
            html +=
                '<button class="b2b-cat-pill' + active + '" ' +
                'data-action="set-cross-filter" data-cross="' + safe +
                '">' + safe + "</button>";
        });
    } else if (viewMode === "category") {
        const models = collectModelsForCategory(products, state.filterCategory);
        models.forEach((m) => {
            const active = crossFilter === m ? " active" : "";
            const safe = escHtml(m);
            html +=
                '<button class="b2b-cat-pill' + active + '" ' +
                'data-action="set-cross-filter" data-cross="' + safe +
                '">' + safe + "</button>";
        });
    }
    return html;
}
