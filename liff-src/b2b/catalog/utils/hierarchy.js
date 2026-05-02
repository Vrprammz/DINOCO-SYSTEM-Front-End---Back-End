/**
 * B2B LIFF E-Catalog — SKU Hierarchy helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE:
 *   - PHP: `[B2B] Snippet 15` V.7.1+ `dinoco_get_leaf_skus()`,
 *     `dinoco_compute_hierarchy_stock()`, `dinoco_is_top_level_set()`
 *   - JS:  `[B2B] Snippet 4` V.32.9 inline reads `p.children_detail` +
 *     `p.is_set` from the API. The catalog API pre-computes the tree
 *     on the server (Snippet 3 `b2b_get_catalog`) — these helpers exist
 *     for future client-side stock previews + DD-3 dedup logic.
 *
 * 3-Level SKU Hierarchy (V.6.0 spec, see CLAUDE.md "3-Level SKU Hierarchy"):
 *   - Source of truth: wp_options `dinoco_sku_relations` flat format
 *     `{ parent: [children], child: [grandchildren] }`
 *   - Max depth = 3 (DD-4)
 *   - Stock cut ONLY on leaves (DD-2)
 *   - Shared child allowed (DD-3 — same SKU appears under multiple parents)
 *   - B2C never sees grandchildren (DD-6) — but B2B catalog DOES (V.32.0
 *     SET Detail "ซื้อแยกชิ้น")
 *   - Walk-in stock can go negative (DD-5)
 *
 * IMPORTANT — Hierarchy Bug Fixes V.7.1 lessons:
 *   The PHP impl had 3 CRITICAL bugs caused by passing `&$visited` by
 *   reference across sibling branches → DD-3 shared-child broke. The
 *   fix was to pass `$visited` by VALUE per branch. We mirror that here:
 *   each recursion creates a fresh `visited` Set per branch, never
 *   mutating an upstream Set.
 */

/**
 * Resolve all leaf SKUs under a given SKU (recursive).
 *
 * Mirrors `dinoco_get_leaf_skus($sku)` in PHP V.7.1.
 *
 * @param {string} sku — the SKU to resolve (case-insensitive)
 * @param {Record<string, string[]>} relations — flat parent → children map
 *   keys + values UPPERCASE (matches `dinoco_sku_relations` shape)
 * @param {Set<string>} [_visited] — internal: branch-scoped cycle guard
 * @returns {string[]} flat list of leaf SKUs (uppercase, deduped via array_unique)
 */
export function getLeafSkus(sku, relations, _visited) {
    if (!sku) return [];
    const upper = String(sku).toUpperCase();
    const rel = relations || {};
    // Per-branch visited Set — copy on entry to avoid sibling pollution
    // (V.7.1 C1/C2 lesson — DO NOT pass by reference).
    const visited = new Set(_visited || []);
    if (visited.has(upper)) return [];
    visited.add(upper);

    const children = rel[upper];
    if (!children || !Array.isArray(children) || children.length === 0) {
        // Leaf node — return self.
        return [upper];
    }
    // Recurse into children with a FRESH branch-scoped Set.
    const out = [];
    for (const child of children) {
        const sub = getLeafSkus(child, rel, visited);
        for (const leaf of sub) out.push(leaf);
    }
    // Dedup leaves (DD-3 shared child can appear via multiple paths).
    return Array.from(new Set(out));
}

/**
 * Check whether a SKU is a leaf (has no children).
 *
 * Mirrors `dinoco_is_leaf_sku($sku)` in PHP V.7.1.
 *
 * @param {string} sku
 * @param {Record<string, string[]>} relations
 * @returns {boolean}
 */
export function isLeafSku(sku, relations) {
    if (!sku) return false;
    const upper = String(sku).toUpperCase();
    const children = (relations || {})[upper];
    return !children || !Array.isArray(children) || children.length === 0;
}

/**
 * Check whether a SKU is a top-level SET (has children but no parent).
 *
 * Mirrors `dinoco_is_top_level_set($sku)` — used by B2C catalog filter
 * (DD-6) and B2B SET grid badge.
 *
 * @param {string} sku
 * @param {Record<string, string[]>} relations
 * @returns {boolean}
 */
export function isTopLevelSet(sku, relations) {
    if (!sku) return false;
    const upper = String(sku).toUpperCase();
    const rel = relations || {};
    const children = rel[upper];
    if (!children || children.length === 0) return false;
    // Check if any other SKU lists `upper` as a child → not top-level.
    for (const parent of Object.keys(rel)) {
        if (parent === upper) continue;
        const kids = rel[parent];
        if (Array.isArray(kids) && kids.includes(upper)) return false;
    }
    return true;
}

/**
 * Compute hierarchy stock recursively.
 *
 * Mirrors `dinoco_compute_hierarchy_stock($sku)` in PHP V.7.1:
 *   - Leaf → return stockMap[sku] || 0
 *   - Non-leaf → MIN of children's computed stock
 *
 * Used for SET stock display in catalog grid (server pre-computes, but
 * we expose for live recompute after a successful order).
 *
 * @param {string} sku
 * @param {Record<string, number>} stockMap — leaf SKU → stock_qty
 * @param {Record<string, string[]>} relations — flat parent → children
 * @param {Set<string>} [_visited] — internal cycle guard (branch-scoped)
 * @returns {number}
 */
export function computeHierarchyStock(sku, stockMap, relations, _visited) {
    if (!sku) return 0;
    const upper = String(sku).toUpperCase();
    const visited = new Set(_visited || []);
    if (visited.has(upper)) return 0;
    visited.add(upper);

    const rel = relations || {};
    const stock = stockMap || {};
    const children = rel[upper];

    if (!children || !Array.isArray(children) || children.length === 0) {
        // Leaf — read from stockMap (case-insensitive lookup helper).
        const direct = stock[upper];
        if (typeof direct === "number") return direct;
        const lower = String(sku).toLowerCase();
        if (typeof stock[lower] === "number") return stock[lower];
        return Number(direct || 0) || 0;
    }
    // Non-leaf — MIN of children (recursion uses fresh visited per branch).
    let min = Infinity;
    for (const child of children) {
        const childStock = computeHierarchyStock(child, stock, rel, visited);
        if (childStock < min) min = childStock;
    }
    return min === Infinity ? 0 : min;
}

/**
 * Get the immediate ancestor (parent) SKUs of a given SKU.
 *
 * DD-3 shared child can have multiple parents — returns array.
 *
 * @param {string} sku
 * @param {Record<string, string[]>} relations
 * @returns {string[]}
 */
export function getAncestorSkus(sku, relations) {
    if (!sku) return [];
    const upper = String(sku).toUpperCase();
    const rel = relations || {};
    const out = [];
    for (const parent of Object.keys(rel)) {
        const kids = rel[parent];
        if (Array.isArray(kids) && kids.includes(upper)) {
            out.push(parent);
        }
    }
    return out;
}
