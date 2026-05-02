/**
 * B2F LIFF Admin E-Catalog — Cart helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.13
 *   Source location: inline <script>
 *     - line 1293-1351: getCartStorageKey / saveCartToStorage /
 *       loadCartFromStorage / clearCartStorage (V.7.0 + V.7.8 L5 schema)
 *     - line 1353-1372: deriveOrderMode / orderModeLabel /
 *       orderModeBadgeClass (V.7.0 Order Intent helpers)
 *
 * V.7.0 schema (per-maker scope, persists across LIFF reloads):
 *   localStorage key:   `b2f_cart_v7_<maker_id>`
 *   payload shape:      {
 *     _schema: 7,                         // strict version gate
 *     _ts: 1714521600000,                 // epoch ms (30-day TTL)
 *     items: {
 *       [sku]: {
 *         qty: 5,
 *         price: 1200.00,                 // unit_cost native currency
 *         name: "Crashbar SET",
 *         image: "https://...",
 *         order_mode: "full_set",         // full_set | sub_unit | single_leaf
 *         source_sku: "DNCSETXL7500X001H",// tracks intermediate parent (DD-3)
 *         intent_notes: ""                // admin-only PII — strip when restoring
 *       }
 *     },
 *     updated_at: "2026-04-30T12:34:56.789Z"
 *   }
 *
 * V.7.8 L5 protections (Sprint Fix C, 2026-04-20):
 *   - `_schema !== 7` → discard the row (forward-compat against V.8+
 *     shape mismatch — better to lose a draft than crash the UI).
 *   - `Date.now() - _ts > 30 days` → discard (don't resurrect abandoned
 *     drafts that the admin forgot about).
 *
 * IMPORTANT — Cart is **per-maker**, not global:
 *   Switching maker invalidates the cart key (`makerId` changes the
 *   storage path). This is intentional — each maker has different SKUs,
 *   prices, and currency, so a cross-maker cart would be incoherent.
 */

const KEY_PREFIX = "b2f_cart_v7_";
const CART_SCHEMA = 7;
const STALE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Build the localStorage key for a maker's cart.
 *
 * @param {string|number} makerId
 * @returns {string}
 */
export function getCartStorageKey(makerId) {
    return KEY_PREFIX + (makerId == null ? "0" : String(makerId));
}

/**
 * Load and validate a cart from localStorage.
 *
 * Returns `{}` on:
 *   - Missing key
 *   - JSON parse error
 *   - Wrong `_schema` (not 7)
 *   - Stale row (older than 30 days)
 *   - Missing `items` object
 *
 * Strict failures (wrong schema / stale) ALSO purge the row — preventing
 * repeat validation cost on every load.
 *
 * @param {string|number} makerId
 * @returns {Record<string, {qty:number, price:number, name:string, image?:string, order_mode?:string, source_sku?:string, intent_notes?:string}>}
 */
export function loadCart(makerId) {
    if (typeof localStorage === "undefined") return {};
    const key = getCartStorageKey(makerId);
    let raw;
    try {
        raw = localStorage.getItem(key);
    } catch {
        return {};
    }
    if (!raw) return {};
    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        // Corrupt — purge so we don't retry every render.
        try { localStorage.removeItem(key); } catch { /* ignore */ }
        return {};
    }
    if (!data || data._schema !== CART_SCHEMA || typeof data.items !== "object") {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
        return {};
    }
    if (data._ts && Date.now() - data._ts > STALE_TTL_MS) {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
        return {};
    }
    return data.items || {};
}

/**
 * Persist a cart dict to localStorage with V.7.0 envelope.
 *
 * Silent on quota / privacy-mode errors (matches inline behavior — losing
 * persistence should not break the UI).
 *
 * @param {string|number} makerId
 * @param {Record<string, any>} cart - keyed by SKU
 */
export function saveCart(makerId, cart) {
    if (typeof localStorage === "undefined") return;
    const key = getCartStorageKey(makerId);
    const items = {};
    for (const sku of Object.keys(cart || {})) {
        const c = cart[sku];
        if (!c || !c.qty || c.qty <= 0) continue;
        items[sku] = {
            qty: Number(c.qty) || 0,
            price: Number(c.price ?? c.unit_cost ?? 0) || 0,
            name: c.name || c.product_name || "",
            image: c.image || c.image_url || "",
            order_mode: c.order_mode || "single_leaf",
            source_sku: c.source_sku || "",
            intent_notes: c.intent_notes || "",
        };
    }
    const payload = {
        _schema: CART_SCHEMA,
        _ts: Date.now(),
        items,
        updated_at: new Date().toISOString(),
    };
    try {
        localStorage.setItem(key, JSON.stringify(payload));
    } catch {
        // ignore quota / privacy errors
    }
}

/**
 * Purge the cart for a specific maker.
 *
 * @param {string|number} makerId
 */
export function clearCart(makerId) {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.removeItem(getCartStorageKey(makerId));
    } catch { /* ignore */ }
}

/**
 * Derive an order_mode from a product's `production_mode` (V.7.0).
 *
 * Mirrors `deriveOrderMode(p)` at line 1353 of inline V.7.13:
 *   - set_assembled / cross_factory_assembly → "full_set"
 *   - sub_unit                                → "sub_unit"
 *   - single (or anything else)               → "single_leaf"
 *
 * @param {{ production_mode?: string }} product
 * @returns {"full_set"|"sub_unit"|"single_leaf"}
 */
export function deriveOrderMode(product) {
    if (!product) return "single_leaf";
    const pm = product.production_mode || "";
    if (pm === "set_assembled" || pm === "cross_factory_assembly") return "full_set";
    if (pm === "sub_unit") return "sub_unit";
    return "single_leaf";
}

/**
 * 3-mode label lookup (Thai-only here — multi-language labels live in
 * `badges.js` via `L()` helper).
 *
 * Mirrors `orderModeLabel(mode)` at line 1362 of inline V.7.13.
 *
 * @param {string} mode
 * @returns {string}
 */
export function orderModeLabel(mode) {
    if (mode === "full_set") return "ชุดเต็ม";
    if (mode === "sub_unit") return "แยกชุด";
    if (mode === "single_leaf") return "ชิ้นเดี่ยว";
    return "";
}

/**
 * Map an order_mode → CSS modifier class for cart badge colour.
 *
 * Mirrors `orderModeBadgeClass(mode)` at line 1368 of inline V.7.13.
 *
 * @param {string} mode
 * @returns {"purple"|"amber"|"gray"}
 */
export function orderModeBadgeClass(mode) {
    if (mode === "full_set") return "purple";
    if (mode === "sub_unit") return "amber";
    return "gray";
}

/**
 * Set / overwrite qty for a SKU. qty <= 0 removes the entry.
 *
 * Returns NEW dict (immutable) — match B2B catalog cart contract.
 *
 * @param {Record<string, any>} cart
 * @param {string} sku
 * @param {number} qty
 * @param {object} [meta] - optional fields to merge (price, name, etc.)
 * @returns {Record<string, any>}
 */
export function setCartQty(cart, sku, qty, meta) {
    if (!sku) return cart || {};
    const next = { ...(cart || {}) };
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
        delete next[sku];
        return next;
    }
    next[sku] = { ...(cart && cart[sku] ? cart[sku] : {}), ...(meta || {}), qty: Math.floor(n) };
    return next;
}

/**
 * Total item count (sum of qty across all SKUs).
 *
 * @param {Record<string, {qty?: number}>} cart
 * @returns {number}
 */
export function computeItemCount(cart) {
    if (!cart) return 0;
    let total = 0;
    for (const sku of Object.keys(cart)) {
        total += Number((cart[sku] && cart[sku].qty) || 0);
    }
    return total;
}

/**
 * Total amount in maker native currency = sum(qty * price).
 *
 * @param {Record<string, {qty?: number, price?: number, unit_cost?: number}>} cart
 * @returns {number}
 */
export function computeTotal(cart) {
    if (!cart) return 0;
    let total = 0;
    for (const sku of Object.keys(cart)) {
        const c = cart[sku];
        if (!c) continue;
        const qty = Number(c.qty) || 0;
        const price = Number(c.price ?? c.unit_cost ?? 0) || 0;
        total += qty * price;
    }
    return total;
}

export const CART_STORAGE_KEY_PREFIX = KEY_PREFIX;
export const CART_SCHEMA_VERSION = CART_SCHEMA;
export const CART_STALE_TTL_MS = STALE_TTL_MS;
