/**
 * B2F LIFF Admin E-Catalog — SKU Hierarchy helpers (V.0.2 Round 1)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.13
 *   - line 1659-1696: collectModelsWithDescendants (V.5.3 + V.5.4)
 *   - line 1697-1707: productMatchesModel (V.5.3)
 *   - line 1768-1798: buildHierarchyLookup
 *   - line 2475-2499: countTopSetsForProduct (V.5.0 DD-3 walk-up)
 *
 * The hierarchy contract is identical to B2B catalog (DD-2 / DD-3 / DD-7
 * rules in CLAUDE.md). We re-export the B2B catalog primitives so the
 * lifecycle of `dinoco_sku_relations` recurse-walk logic stays in ONE
 * place — drift between B2B and B2F leaf computation has historically
 * caused stock cut bugs (V.7.1 C1/C2/C3 lessons).
 *
 * Catalog-specific helpers (model filtering with descendant inheritance,
 * virtual-SET detection, SET-membership counting) are added below.
 */

export {
    getLeafSkus,
    isLeafSku,
    isTopLevelSet,
    computeHierarchyStock,
    getAncestorSkus,
} from "../../../b2b/catalog/utils/hierarchy.js";

/**
 * Collect all model strings for a product, **including** models declared
 * on its descendants (V.5.3 fix).
 *
 * Why: admins set `compatible_models` at the leaf level (per side L/R) but
 * the SET parent often has none. Without descendant inheritance, filtering
 * `NX500` would hide SETs that have NX500-compatible parts. The PHP API
 * V.10.1 already respects an explicit `compatible_models` on the SET (no
 * walk if non-empty); this client helper keeps the same contract.
 *
 * Recursion uses BRANCH-SCOPED visited Sets (per V.7.1 lesson — passing
 * `visited` by reference across siblings broke DD-3 shared children).
 *
 * @param {{ sku?: string, compatible_models?: any }} product
 * @param {{ relations?: Record<string, string[]>, catalog?: Record<string, {compatible_models?: any}> }} hier
 * @param {Set<string>} [_visited] - internal cycle guard
 * @returns {string[]} flat list of model name strings (may contain dups —
 *   caller dedups for display)
 */
export function collectModelsWithDescendants(product, hier, _visited) {
    if (!product) return [];
    const skuU = String(product.sku || "").toUpperCase();
    const visited = new Set(_visited || []);
    if (skuU && visited.has(skuU)) return [];
    if (skuU) visited.add(skuU);

    const own = parseModels(product.compatible_models);

    // If the product declares its own models AND has children, respect the
    // explicit value (do NOT walk descendants — V.10.1 SET-direct contract).
    if (own.length > 0) return own;

    const rel = (hier && hier.relations) || {};
    const cat = (hier && hier.catalog) || {};
    const children = skuU ? rel[skuU] : null;
    if (!children || !Array.isArray(children) || children.length === 0) {
        return own;
    }
    const out = [];
    for (const childSku of children) {
        const childKey = String(childSku || "").toUpperCase();
        const childData = cat[childKey] || { sku: childKey };
        const sub = collectModelsWithDescendants(childData, hier, visited);
        for (const m of sub) out.push(m);
    }
    return out;
}

/**
 * Parse `compatible_models` into a flat string array.
 *
 * Mirrors V.5.1 parseModels (line 1627 of inline V.7.13). Handles 3
 * shapes: JSON string / array of strings / array of objects with
 * `name`/`brand_name` keys.
 *
 * Defensive: returns [] for null/undefined/malformed input.
 *
 * @param {any} raw
 * @returns {string[]}
 */
export function parseModels(raw) {
    if (raw == null) return [];
    let parsed = raw;
    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(parsed)) return [];
    const out = [];
    for (const m of parsed) {
        if (!m) continue;
        if (typeof m === "string") {
            out.push(m);
        } else if (typeof m === "object") {
            const name = m.name || m.model_name || m.slug || "";
            if (name) out.push(String(name));
        }
    }
    return out;
}

/**
 * Match a product against a model name (case-sensitive, exact). Walks
 * descendants via `collectModelsWithDescendants`.
 *
 * Mirrors V.5.3 productMatchesModel (line 1697 of inline V.7.13).
 *
 * @param {object} product
 * @param {string} modelName
 * @param {object} hier
 * @returns {boolean}
 */
export function productMatchesModel(product, modelName, hier) {
    if (!product || !modelName) return false;
    const all = collectModelsWithDescendants(product, hier);
    for (const m of all) {
        if (m === modelName) return true;
    }
    return false;
}

/**
 * Build a fast hierarchy lookup from raw `sku_relations` + `catalog_map`
 * payloads emitted by the `maker-products` endpoint (V.9.11+ payload shape).
 *
 * Returns { relations, catalog, parents } where:
 *   - relations: { [PARENT_SKU_UPPER]: [child_sku_upper, ...] }
 *   - catalog:   { [SKU_UPPER]: { sku, name, image_url, compatible_models, ... } }
 *   - parents:   { [CHILD_SKU_UPPER]: [parent_sku_upper, ...] }  // DD-3 reverse map
 *
 * @param {{ sku_relations?: Record<string, string[]>, catalog_map?: Record<string, any> }} apiResponse
 * @returns {{ relations: Record<string, string[]>, catalog: Record<string, any>, parents: Record<string, string[]> }}
 */
export function buildHierarchyLookup(apiResponse) {
    /** @type {Record<string, string[]>} */
    const rel = {};
    /** @type {Record<string, any>} */
    const cat = {};
    /** @type {Record<string, string[]>} */
    const parents = {};
    if (!apiResponse) return { relations: rel, catalog: cat, parents };

    const rawRel = apiResponse.sku_relations || {};
    for (const k of Object.keys(rawRel)) {
        const ku = String(k || "").toUpperCase();
        const kids = (rawRel[k] || []).map((c) => String(c || "").toUpperCase());
        rel[ku] = kids;
        for (const childU of kids) {
            if (!parents[childU]) parents[childU] = [];
            if (!parents[childU].includes(ku)) parents[childU].push(ku);
        }
    }
    const rawCat = apiResponse.catalog_map || {};
    for (const k of Object.keys(rawCat)) {
        cat[String(k || "").toUpperCase()] = rawCat[k];
    }
    return { relations: rel, catalog: cat, parents };
}

/**
 * Count how many top-level SETs a product is part of (DD-3 shared
 * children can belong to multiple SETs).
 *
 * Mirrors `countTopSetsForProduct(sku)` at line 2475 of inline V.7.13.
 * Walks UP via the `parents` map (built by `buildHierarchyLookup`) until
 * it hits a top-level SET (no parent of its own). Branch-scoped visited
 * Set per V.7.1 lesson.
 *
 * @param {string} sku
 * @param {{ parents?: Record<string, string[]>, relations?: Record<string, string[]> }} hier
 * @returns {number}
 */
export function countTopSetsForProduct(sku, hier) {
    if (!sku) return 0;
    const skuU = String(sku).toUpperCase();
    const parents = (hier && hier.parents) || {};
    const rel = (hier && hier.relations) || {};

    const tops = new Set();

    function walkUp(s, visited) {
        const v = new Set(visited);
        if (v.has(s)) return;
        v.add(s);
        const myParents = parents[s];
        if (!myParents || myParents.length === 0) {
            // No parent → s itself is top-level only if it has children
            // (i.e. it's a SET, not a true single SKU).
            if (rel[s] && rel[s].length > 0) tops.add(s);
            return;
        }
        for (const p of myParents) walkUp(p, v);
    }
    walkUp(skuU, new Set());
    return tops.size;
}

/**
 * Detect a "virtual" SET — present in catalog_map but not registered as
 * a maker product (V.7.0 spec: `is_virtual: true` + `virtual_reason:
 * "shared_parts_assembled" | "intermediate_sub_set"`).
 *
 * @param {{ is_virtual?: boolean, virtual_reason?: string }} product
 * @returns {boolean}
 */
export function isVirtualSet(product) {
    return Boolean(product && product.is_virtual === true);
}
