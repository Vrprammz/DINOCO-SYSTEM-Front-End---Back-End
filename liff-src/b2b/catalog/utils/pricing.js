/**
 * B2B LIFF E-Catalog — Pricing helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE:
 *   - PHP: `[B2B] Snippet 1` `b2b_compute_dealer_price()` — server is the
 *     source of truth for tier-discount math. The catalog API already
 *     returns `dealer_price` and `discount_percent` per row.
 *   - JS:  `[B2B] Snippet 4` V.32.9 inline — the inline renderer ONLY
 *     reads `p.dealer_price` (server-computed). It does NOT recompute
 *     tier discounts client-side.
 *
 * Why duplicate the math here when the server already returns dealer_price?
 *   Two reasons specific to LIFF UX:
 *   1. **MOQ + box guards** must run client-side BEFORE submitting an
 *      order — the server REST contract rejects with 400 instead of
 *      auto-rounding (per Snippet 1 V.32.9 + V.33.7 hardening).
 *   2. **Live qty stepper preview** in SET Detail (V.32.2 stepper) needs
 *      to refresh the total without round-tripping to /catalog.
 *
 * IMPORTANT — Manual Invoice picker contract (V.34.4-V.34.6):
 *   The Manual Invoice double-discount bug was caused by sending
 *   `unit_price=dealer_price` PLUS `discount_pct` together (server then
 *   applied the discount AGAIN). For B2B catalog the server returns
 *   `dealer_price` already discounted — DO NOT pass tier_discount through
 *   /place-order. The server recomputes server-side.
 *
 *   `computeDealerPrice()` here is for CLIENT preview only (e.g. when an
 *   admin wants to verify a discount tier in DevTools). Production order
 *   placement reads `p.dealer_price` directly.
 */

/**
 * Compute the dealer price from a base catalog price + tier discount %.
 *
 * Mirrors the server-side formula `base_price * (1 - tier_discount/100)`
 * exactly. Used for client preview only; server is authoritative.
 *
 * Tier semantics (V.32.6):
 *   - `discountPct` is the tier-specific column (price_silver / gold /
 *     platinum / diamond) which stores **% discount** (0-100).
 *   - When the tier-specific column is 0, server falls back to
 *     `b2b_discount_percent` (Standard tier default).
 *   - This helper does NOT do that fallback — pass the resolved % in.
 *
 * @param {number} basePrice — catalog (retail) price in baht
 * @param {number} discountPct — % discount (0-100) for the tier
 * @returns {number} dealer price (rounded to 2 decimals to match PHP)
 */
export function computeDealerPrice(basePrice, discountPct) {
    const base = Number(basePrice);
    const pct = Number(discountPct);
    if (!Number.isFinite(base) || base <= 0) return 0;
    if (!Number.isFinite(pct) || pct <= 0) return base;
    if (pct >= 100) return 0;
    const dealer = base * (1 - pct / 100);
    // Match PHP round($amount, 2) behavior.
    return Math.round(dealer * 100) / 100;
}

/**
 * Validate qty against MOQ + units_per_box / boxes_per_unit constraints.
 *
 * Mirrors server-side validation in `[B2B] Snippet 3` `place-order` and
 * the Box Calculation contract (Snippet 1 V.32.9, see CLAUDE.md).
 *
 * Rules (mutually exclusive — PHP enforces ≤1 of {upb,bpu} > 1):
 *   - units_per_box > 1: qty must be multiple of upb (or rounds up to
 *     full box for shipping). Validation here returns suggested qty.
 *   - boxes_per_unit > 1: qty * bpu = total boxes (always valid).
 *   - both = 1: any qty ≥ moq is valid.
 *
 * @param {{
 *   sku: string,
 *   qty: number,
 *   moq?: number,
 *   units_per_box?: number,
 *   boxes_per_unit?: number,
 * }} input
 * @returns {{ valid: boolean, reason?: string, suggested?: number }}
 */
export function validateMOQ(input) {
    const sku = input.sku || "";
    const qty = Number(input.qty);
    const moq = Math.max(1, Number(input.moq || 1) || 1);
    const upb = Math.max(1, Number(input.units_per_box || 1) || 1);
    const bpu = Math.max(1, Number(input.boxes_per_unit || 1) || 1);

    if (!sku) return { valid: false, reason: "missing_sku" };
    if (!Number.isFinite(qty) || qty <= 0) {
        return { valid: false, reason: "invalid_qty", suggested: moq };
    }
    if (qty < moq) {
        return { valid: false, reason: "below_moq", suggested: moq };
    }
    // Mutual exclusion guard — server already enforces but FE catches early.
    if (upb > 1 && bpu > 1) {
        return { valid: false, reason: "upb_bpu_conflict" };
    }
    if (upb > 1 && qty % upb !== 0) {
        const suggested = Math.ceil(qty / upb) * upb;
        return { valid: false, reason: "not_multiple_of_upb", suggested };
    }
    return { valid: true };
}

/**
 * Compute total boxes for a given qty.
 *
 * Mirrors `b2b_compute_boxes_for_qty()` in Snippet 1 V.32.9:
 *   - units_per_box > 1 → ceil(qty / upb)   (multiple units → 1 box)
 *   - boxes_per_unit > 1 → qty * bpu        (1 unit → multiple boxes)
 *   - both = 1            → qty
 *
 * Used for Flash shipping PNO count + cart total preview.
 *
 * @param {{ qty: number, units_per_box?: number, boxes_per_unit?: number }} input
 * @returns {number}
 */
export function computeBoxes(input) {
    const qty = Number(input.qty);
    const upb = Math.max(1, Number(input.units_per_box || 1) || 1);
    const bpu = Math.max(1, Number(input.boxes_per_unit || 1) || 1);
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    if (upb > 1) return Math.ceil(qty / upb);
    if (bpu > 1) return qty * bpu;
    return qty;
}
