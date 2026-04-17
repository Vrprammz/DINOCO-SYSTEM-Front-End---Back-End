/**
 * Pure-function cart state machine for DINOCO LIFF surfaces.
 *
 * Design constraints:
 *   - NO DOM access — all functions operate on plain state objects.
 *   - NO side effects except optional localStorage persistence helpers.
 *   - State is a plain `{ items: { [sku]: { qty, meta } } }` map so that
 *     downstream rendering can diff by SKU cheaply.
 *
 * Why pure?
 *   1. Unit-testable without JSDOM (Phase 2 adds Vitest).
 *   2. Portable between B2B catalog, B2F catalog, and LIFF AI
 *      (each surface renders differently but state shape is identical).
 *   3. Avoids the setTimeout override gotcha (Admin Dashboard captures
 *      timers >= 3s) — no timers here at all.
 *
 * Storage keys should be namespaced per surface:
 *   - B2B:       `b2b_cart_v1`
 *   - B2F:       `b2f_cart_v7_{maker_id}`  (schema v7)
 *   - LIFF AI:   not applicable
 */

/**
 * Create a fresh empty cart state.
 */
export function createCart() {
    return { items: {}, updatedAt: Date.now() };
}

/**
 * Add qty to SKU (creates entry if missing). Returns NEW state
 * (immutable — caller replaces reference).
 *
 * @param {Object} state   cart state
 * @param {string} sku     SKU string (uppercase normalized)
 * @param {number} qty     delta qty (positive) — default 1
 * @param {Object} [meta]  optional metadata merged into existing entry
 */
export function addToCart(state, sku, qty = 1, meta = null) {
    if (!sku || qty <= 0) return state;
    const key = normalizeSku(sku);
    const next = { ...state, items: { ...state.items } };
    const existing = next.items[key];
    next.items[key] = {
        sku: key,
        qty: (existing?.qty || 0) + qty,
        meta: { ...(existing?.meta || {}), ...(meta || {}) },
    };
    next.updatedAt = Date.now();
    return next;
}

/**
 * Set absolute qty for SKU (removes entry if qty <= 0).
 */
export function setCartQty(state, sku, qty, meta = null) {
    if (!sku) return state;
    const key = normalizeSku(sku);
    const next = { ...state, items: { ...state.items } };
    if (qty <= 0) {
        delete next.items[key];
    } else {
        const existing = next.items[key];
        next.items[key] = {
            sku: key,
            qty,
            meta: { ...(existing?.meta || {}), ...(meta || {}) },
        };
    }
    next.updatedAt = Date.now();
    return next;
}

/**
 * Remove SKU entirely.
 */
export function removeFromCart(state, sku) {
    if (!sku) return state;
    const key = normalizeSku(sku);
    if (!(key in state.items)) return state;
    const next = { ...state, items: { ...state.items } };
    delete next.items[key];
    next.updatedAt = Date.now();
    return next;
}

/**
 * Empty cart. Preserves `updatedAt` field for change tracking.
 */
export function clearCart() {
    return createCart();
}

/**
 * Compute grand total given a price map `{ [sku]: unitPriceNumber }`.
 *
 * SKUs missing from the price map count as 0 (caller should detect
 * via `getMissingPriceSkus` if strict behavior is needed).
 */
export function computeTotal(state, priceMap = {}) {
    let total = 0;
    for (const key of Object.keys(state.items)) {
        const entry = state.items[key];
        const unit = Number(priceMap[key] || priceMap[entry.sku] || 0);
        total += unit * entry.qty;
    }
    return Math.round(total * 100) / 100;
}

/**
 * Sum of all qty across items.
 */
export function computeItemCount(state) {
    let n = 0;
    for (const key of Object.keys(state.items)) {
        n += state.items[key].qty || 0;
    }
    return n;
}

/**
 * Return list of SKUs that exist in cart but not in priceMap.
 * Useful for flagging stale catalog / removed SKUs before submit.
 */
export function getMissingPriceSkus(state, priceMap = {}) {
    const missing = [];
    for (const key of Object.keys(state.items)) {
        if (!(key in priceMap)) missing.push(key);
    }
    return missing;
}

/**
 * Convert cart state to flat array suitable for POST /place-order payload.
 *
 * Returns: `[{ sku, qty, ...meta }]`
 */
export function toOrderItems(state) {
    return Object.keys(state.items).map((sku) => {
        const entry = state.items[sku];
        return { sku: entry.sku, qty: entry.qty, ...(entry.meta || {}) };
    });
}

/**
 * ── Persistence helpers ─────────────────────────────────────────
 * Opt-in only. Caller decides whether to persist.
 */

export function saveCartToStorage(key, state) {
    if (typeof window === "undefined" || !window.localStorage) return false;
    try {
        window.localStorage.setItem(
            key,
            JSON.stringify({ ...state, _schema: 1 })
        );
        return true;
    } catch {
        return false;
    }
}

export function loadCartFromStorage(key) {
    if (typeof window === "undefined" || !window.localStorage) {
        return createCart();
    }
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return createCart();
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || !parsed.items) {
            return createCart();
        }
        return {
            items: parsed.items || {},
            updatedAt: parsed.updatedAt || Date.now(),
        };
    } catch {
        return createCart();
    }
}

export function clearCartStorage(key) {
    if (typeof window === "undefined" || !window.localStorage) return false;
    try {
        window.localStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

/**
 * Normalize SKU to uppercase for consistent key matching
 * (matches backend `utf8mb4_bin` UPPER pattern used by
 * `wp_dinoco_product_makers` + `dinoco_sku_relations`).
 */
export function normalizeSku(sku) {
    return String(sku || "")
        .trim()
        .toUpperCase();
}
