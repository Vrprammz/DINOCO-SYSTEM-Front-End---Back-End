/**
 * B2F LIFF Admin E-Catalog — Filter renderers (V.0.3 Round 2)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.14
 *   Source location: inline <script>
 *     - line 1901 renderModelFilter()  — horizontal moto card row
 *     - line 1957 renderTypeChips()    — production_mode taxonomy chips
 *
 * Pure HTML builders. Round 5 cutover wires them into Snippet 8 — until
 * then the inline render is preserved (REG-029 byte-identical).
 *
 * Round 2 contract:
 *   - Builders return strings (no DOM mutation, no event binding).
 *     The router/event-delegation modules (Round 3+) attach handlers via
 *     `data-*` attributes (`data-filter-model`, `data-filter-type`).
 *   - Inline V.7.14 used `onclick=` + `<button>` elements; we replace with
 *     `data-*` attributes so callers can use event delegation.
 *   - Counts respect the same visibility rules as inline (search +
 *     virtual + model filter applied first).
 */

import { escHtml } from "../utils/format.js";
import { collectModelsWithDescendants, productMatchesModel } from "../utils/hierarchy.js";

/**
 * Render the horizontal model-filter row — first card "ทั้งหมด", then
 * one card per unique model collected across all products (recursing
 * through children).
 *
 * Mirrors `renderModelFilter()` (Snippet 8 V.7.14 line 1901).
 *
 * @param {Object[]} products
 * @param {Object} hier
 *   Output of `buildHierarchyLookup()` (utils/hierarchy.js).
 * @param {{
 *   filterModel?: string,
 *   modelImageMap?: Record<string,string>,
 *   allLabel?: string
 * }} [opts]
 * @returns {{ html: string, models: string[], visible: boolean }}
 */
export function renderModelFilter(products, hier, opts = {}) {
    const filterModel = opts.filterModel || "";
    const modelImageMap = opts.modelImageMap || {};
    const allLabel = opts.allLabel || "ทั้งหมด";

    const seen = Object.create(null);
    (products || []).forEach((p) => {
        collectModelsWithDescendants(p, hier).forEach((m) => {
            if (m && typeof m === "string") seen[m] = true;
        });
    });
    const modelList = Object.keys(seen).sort();
    if (!modelList.length) {
        return { html: "", models: [], visible: false };
    }

    const motoIcon = "🏍️"; // 🏍️
    const buildCard = (m, isAll) => {
        const active = isAll
            ? !filterModel
                ? " active"
                : ""
            : filterModel === m
              ? " active"
              : "";
        const imgUrl = !isAll ? modelImageMap[m] || "" : "";
        const dataAttr = isAll
            ? ' data-filter-model=""'
            : ' data-filter-model="' + escHtml(m) + '"';
        const inner = imgUrl
            ? '<img class="b2f-cat-model-card-img" src="' +
              escHtml(imgUrl) +
              '" alt="' +
              escHtml(m) +
              '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
              '<div class="b2f-cat-model-card-placeholder" style="display:none;">' +
              motoIcon +
              "</div>"
            : '<div class="b2f-cat-model-card-placeholder">' + motoIcon + "</div>";
        return (
            '<div class="b2f-cat-model-card' +
            active +
            '"' +
            dataAttr +
            ">" +
            inner +
            '<div class="b2f-cat-model-card-name">' +
            escHtml(isAll ? allLabel : m) +
            "</div></div>"
        );
    };

    let html = buildCard(allLabel, true);
    modelList.forEach((m) => {
        html += buildCard(m, false);
    });
    return { html, models: modelList, visible: true };
}

/**
 * Render the type-filter chips row.
 *
 * When ORDER_INTENT_ENABLED → 3 chips (full_set / sub_unit / single_leaf)
 * keyed off `production_mode`. Otherwise → 5 legacy chips (set / single /
 * child / grandchild / `''` for all).
 *
 * Mirrors `renderTypeChips()` (Snippet 8 V.7.14 line 1957).
 *
 * @param {Object[]} visibleProducts
 *   Already filtered for: search + isHiddenVirtual + filterModel. Counts
 *   reflect what the user sees in the grid (V.7.2 contract).
 * @param {{
 *   orderIntentEnabled?: boolean,
 *   filterType?: string
 * }} [opts]
 * @returns {{ html: string, counts: Record<string, number>, visible: boolean }}
 */
export function renderTypeChips(visibleProducts, opts = {}) {
    const filterType = opts.filterType || "";
    const orderIntentEnabled = !!opts.orderIntentEnabled;

    const list = visibleProducts || [];
    let counts;
    let chipDefs;

    if (orderIntentEnabled) {
        counts = { "": list.length, full_set: 0, sub_unit: 0, single_leaf: 0 };
        list.forEach((p) => {
            const pm = String(p && p.production_mode ? p.production_mode : "").toLowerCase();
            if (pm === "set_assembled" || pm === "cross_factory_assembly") counts.full_set++;
            else if (pm === "sub_unit") counts.sub_unit++;
            else if (pm === "single" || !pm) counts.single_leaf++;
        });
        if (!counts.full_set && !counts.sub_unit && !counts.single_leaf) {
            return { html: "", counts, visible: false };
        }
        chipDefs = [
            { key: "", label: "ทั้งหมด" },
            { key: "full_set", label: "🟣 ชุดเต็ม" },
            { key: "sub_unit", label: "🟠 แยกชุด" },
            { key: "single_leaf", label: "⚪ ชิ้นเดี่ยว" },
        ];
    } else {
        counts = { "": list.length, set: 0, child: 0, grandchild: 0, single: 0 };
        list.forEach((p) => {
            const t = (p && (p._jsDisplayType || p._jsType)) || "single";
            if (counts[t] !== undefined) counts[t]++;
        });
        if (!counts.set && !counts.child && !counts.grandchild && !counts.single) {
            return { html: "", counts, visible: false };
        }
        chipDefs = [
            { key: "", label: "ทั้งหมด" },
            { key: "set", label: "ชุด SET" },
            { key: "single", label: "เดี่ยว" },
            { key: "child", label: "ลูกชิ้นส่วน" },
            { key: "grandchild", label: "ชิ้นส่วนย่อย" },
        ];
    }

    let html = "";
    chipDefs.forEach((c) => {
        const n = counts[c.key] || 0;
        if (c.key !== "" && n === 0) return; // hide empty (V.5.1)
        const active = filterType === c.key ? " active" : "";
        html +=
            '<button type="button" class="b2f-cat-type-chip' +
            active +
            '" data-filter-type="' +
            escHtml(c.key) +
            '" data-type="' +
            escHtml(c.key) +
            '">' +
            escHtml(c.label + " (" + n + ")") +
            "</button>";
    });
    return { html, counts, visible: true };
}

/**
 * Pure helper used by both filters + the catalog page renderer.
 * Filters a product list by search query (case-insensitive against sku /
 * product_name / compatible_models string) and optional model + type.
 *
 * Returns a NEW array — does not mutate input.
 *
 * @param {Object[]} products
 * @param {Object} hier
 * @param {{
 *   query?: string,
 *   filterModel?: string,
 *   filterType?: string,
 *   orderIntentEnabled?: boolean,
 *   isHiddenVirtual?: (p: object) => boolean
 * }} [opts]
 * @returns {Object[]}
 */
export function applyVisibilityFilters(products, hier, opts = {}) {
    const q = String(opts.query || "")
        .trim()
        .toLowerCase();
    const filterModel = opts.filterModel || "";
    const filterType = opts.filterType || "";
    const orderIntentEnabled = !!opts.orderIntentEnabled;
    const isHiddenVirtual = typeof opts.isHiddenVirtual === "function" ? opts.isHiddenVirtual : null;

    return (products || []).filter((p) => {
        if (isHiddenVirtual && isHiddenVirtual(p)) return false;
        if (q) {
            const matches =
                String(p.sku || "")
                    .toLowerCase()
                    .indexOf(q) >= 0 ||
                String(p.product_name || "")
                    .toLowerCase()
                    .indexOf(q) >= 0 ||
                String(p.compatible_models || "")
                    .toLowerCase()
                    .indexOf(q) >= 0;
            if (!matches) return false;
        }
        if (filterModel && !productMatchesModel(p, filterModel, hier)) return false;
        if (filterType) {
            if (orderIntentEnabled) {
                const pm = String(p.production_mode || "").toLowerCase();
                if (filterType === "full_set") {
                    if (pm !== "set_assembled" && pm !== "cross_factory_assembly") return false;
                } else if (filterType === "sub_unit") {
                    if (pm !== "sub_unit") return false;
                } else if (filterType === "single_leaf") {
                    if (pm !== "single" && pm !== "") return false;
                }
            } else {
                const dt = p._jsDisplayType || p._jsType || "single";
                if (filterType === "set" && dt !== "set") return false;
                if (filterType === "single" && dt !== "single") return false;
                if (filterType === "child" && dt !== "child") return false;
                if (filterType === "grandchild" && dt !== "grandchild") return false;
            }
        }
        return true;
    });
}
