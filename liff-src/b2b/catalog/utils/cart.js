/**
 * B2B LIFF E-Catalog — Cart helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   Source location: inline <script>
 *     - line 681-683: CART_KEY + saveCart() + loadCart()
 *     - line 1567-1593: updateCartBar() — count + total + cart list build
 *     - line 1571: total accumulator using state.products.find + dealer_price
 *     - line 1488-1530: SET vs child duplicate detection
 *
 * The B2B cart is a SHALLOW dict `{ [sku]: qty }` (NOT the rich state
 * object used in `liff-src/shared/cart.js`). We provide adapter helpers
 * here so Round 2+ page renderers can choose between:
 *   (a) the shallow dict (drop-in compat with inline V.32.9 cart shape)
 *   (b) the shared cart state machine (richer metadata, same persistence)
 *
 * Round 1 ships the shallow dict — matches inline localStorage key
 * `dinoco_cart`. Round 2 may upgrade to the shared cart with a v2 key.
 *
 * IMPORTANT — Duplicate detection (V.32.1 H-10 hard-stop):
 *   Customer cannot add a child if the parent SET is already in cart
 *   (and vice versa). `detectCartDuplicates()` exposes that logic for
 *   reuse in Round 2 product detail + add-to-cart handlers.
 */

const CART_KEY = "dinoco_cart";

/**
 * Read the cart dict from localStorage. Returns empty dict on miss/error.
 *
 * Mirrors `loadCart()` at line 683 of inline V.32.9.
 *
 * @returns {Record<string, number>}
 */
export function loadCart() {
    try {
        if (typeof localStorage === "undefined") return {};
        const raw = localStorage.getItem(CART_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
        return {};
    } catch {
        return {};
    }
}

/**
 * Persist the cart dict to localStorage. Silent on failure (matches
 * inline behavior — quota exceeded should not break the UI).
 *
 * Mirrors `saveCart()` at line 682 of inline V.32.9.
 *
 * @param {Record<string, number>} cart
 */
export function saveCart(cart) {
    try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(CART_KEY, JSON.stringify(cart || {}));
    } catch {
        // ignore quota / privacy mode errors
    }
}

/**
 * Add or set qty for a SKU. qty <= 0 removes the SKU (consistent with
 * shared cart contract). Returns NEW dict (immutable).
 *
 * @param {Record<string, number>} cart
 * @param {string} sku
 * @param {number} qty
 * @returns {Record<string, number>}
 */
export function setCartQty(cart, sku, qty) {
    if (!sku) return cart || {};
    const next = { ...(cart || {}) };
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
        delete next[sku];
    } else {
        next[sku] = Math.floor(n);
    }
    return next;
}

/**
 * Increment qty for a SKU by `delta` (default 1). Removes when total <= 0.
 *
 * @param {Record<string, number>} cart
 * @param {string} sku
 * @param {number} [delta]
 * @returns {Record<string, number>}
 */
export function incrCartQty(cart, sku, delta) {
    if (!sku) return cart || {};
    const cur = (cart && cart[sku]) || 0;
    const next = cur + (Number(delta) || 1);
    return setCartQty(cart || {}, sku, next);
}

/**
 * Compute total item count (sum of qtys).
 *
 * Mirrors the count loop in `updateCartBar()` (line 1571).
 *
 * @param {Record<string, number>} cart
 * @returns {number}
 */
export function computeItemCount(cart) {
    if (!cart) return 0;
    let total = 0;
    for (const sku of Object.keys(cart)) {
        total += Number(cart[sku] || 0);
    }
    return total;
}

/**
 * Compute total price (sum of qty * dealer_price per SKU).
 *
 * Mirrors the total accumulator in `updateCartBar()` (line 1571):
 *   keys.forEach(function(sku){var q=state.cart[sku];if(!q)return;
 *     count+=q;var p=state.products.find(function(x){return x.sku===sku;});
 *     if(p)total+=p.dealer_price*q;});
 *
 * SKUs not found in the products list are skipped (silent, matches
 * inline behavior — happens when a SET child cleared from API after
 * cart was persisted).
 *
 * @param {Record<string, number>} cart
 * @param {Array<{sku: string, dealer_price: number}>} products
 * @returns {number}
 */
export function computeTotal(cart, products) {
    if (!cart || !Array.isArray(products)) return 0;
    let total = 0;
    for (const sku of Object.keys(cart)) {
        const qty = Number(cart[sku] || 0);
        if (!qty) continue;
        const p = products.find((x) => x && x.sku === sku);
        if (p && Number.isFinite(p.dealer_price)) {
            total += Number(p.dealer_price) * qty;
        }
    }
    return total;
}

/**
 * Convert cart dict + product list into the order items array shape
 * expected by `POST /b2b/v1/place-order`.
 *
 * Mirrors the items array build in `submitOrder` (line 1581).
 *
 * @param {Record<string, number>} cart
 * @param {Array<{sku: string, name?: string, dealer_price: number}>} products
 * @returns {Array<{ sku: string, name: string, qty: number, price: number }>}
 */
export function toOrderItems(cart, products) {
    if (!cart || !Array.isArray(products)) return [];
    const items = [];
    for (const sku of Object.keys(cart)) {
        const qty = Number(cart[sku] || 0);
        if (!qty) continue;
        const p = products.find((x) => x && x.sku === sku);
        if (!p) continue;
        items.push({
            sku: p.sku,
            name: p.name || "",
            qty,
            price: Number(p.dealer_price || 0),
        });
    }
    return items;
}

/**
 * Detect cart duplicates between SET parents + their child SKUs.
 *
 * Mirrors V.32.1 H-10 hard-stop logic in inline V.32.9 (lines 1488-1530).
 *
 * Returns an array of {parent, conflictingChildren} so the caller can
 * show a confirmation toast like "ลบลูก แล้วเพิ่มชุดเต็ม?".
 *
 * @param {Record<string, number>} cart
 * @param {Array<{sku: string, is_set?: boolean, children_detail?: Array<{sku: string}>}>} products
 * @returns {Array<{ parentSku: string, conflicts: string[] }>}
 */
export function detectCartDuplicates(cart, products) {
    if (!cart || !Array.isArray(products)) return [];
    const cartSkus = new Set(Object.keys(cart || {}).filter((k) => cart[k] > 0));
    const out = [];
    for (const p of products) {
        if (!p || !p.is_set || !Array.isArray(p.children_detail)) continue;
        if (!cartSkus.has(p.sku)) continue;
        const conflicts = p.children_detail
            .map((c) => c && c.sku)
            .filter((s) => s && cartSkus.has(s));
        if (conflicts.length > 0) {
            out.push({ parentSku: p.sku, conflicts });
        }
    }
    return out;
}

/**
 * Clear the cart entirely (returns empty dict; caller persists).
 *
 * @returns {Record<string, number>}
 */
export function clearCart() {
    return {};
}

export const CART_STORAGE_KEY = CART_KEY;
