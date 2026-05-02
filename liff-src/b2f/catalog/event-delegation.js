/**
 * B2F LIFF Admin E-Catalog — Event Delegation (V.0.5 Round 4)
 *
 * Single click + change listener on the root mount that resolves events
 * bubbling up through `[data-action]` elements (and the small set of
 * legacy `data-stepact` / `data-subaddsku` / `data-bucket-tab` / `data-sku`
 * attributes for compatibility with V.7.15 inline emit patterns) and
 * dispatches to the right handler.
 *
 * Replaces the V.0.4 legacy `window.DINOCO_B2F_CATALOG_NAV` +
 * `window.DINOCO_B2F_CATALOG_RENDERERS` bridge globals — pages already
 * emit declarative attributes from Round 2 onward; Round 4 wires the
 * listener that consumes them.
 *
 * Action taxonomy (mirror of [B2F] Snippet 8 V.7.15 inline emit sites):
 *
 *   Maker home (loaders/makerHome.js)
 *     - data-action="pick-maker"   + data-maker-id            → pickMaker(id)
 *
 *   Catalog grid (pages/catalog.js)
 *     - data-action="plus"   + data-sku                       → increment(sku)
 *     - data-action="minus"  + data-sku                       → decrement(sku)
 *     - data-action="detail" + data-sku (or data-setsku)      → openSetDetail(sku)
 *
 *   Cart modal (pages/cart.js + loaders/cart.js)
 *     - data-action="remove" + data-sku                       → removeFromCart(sku)
 *     - data-action="back"                                    → back()
 *     - data-action="review"                                  → openReviewGate()
 *     - data-action="submit"                                  → submitOrder()
 *
 *   SET Detail overlay (pages/setDetail.js)
 *     - data-stepact="minus" + data-stepsku                   → stepperMinus(sku)
 *     - data-stepact="plus"  + data-stepsku                   → stepperPlus(sku)
 *     - data-stepact="add"   + data-stepsku + data-setmain="1"→ addSet(sku, qty)
 *     - data-stepact="add"   + data-stepsku (sub)             → subItemAdd(sku, qty)
 *     - data-stepact="input" + data-stepsku (change event)    → stepperInput(sku, val)
 *     - data-subaddsku="<sku>"  ("+ สั่งแยก" reveal btn)      → subItemReveal(sku)
 *
 *   Review Gate (pages/reviewGate.js)
 *     - data-bucket-tab="<key>"                               → toggleBucket(key)
 *
 * Pure module — accepts dependency-injected handler bag so tests can mock
 * router + loaders without importing the full Vite entry (CSS imports
 * break Jest). entry.js wires the real bag.
 *
 * Returns a cleanup function that removes both listeners (idempotent).
 */

/**
 * @typedef {Object} EventDelegationDeps
 * @property {(makerId: string) => void}                       [pickMaker]
 * @property {(sku: string) => void}                           [openSetDetail]
 * @property {(sku: string, qty?: number, mode?: string, src?: string) => boolean} [addToCart]
 * @property {(sku: string) => void}                           [increment]
 * @property {(sku: string) => void}                           [decrement]
 * @property {(sku: string) => void}                           [removeFromCart]
 * @property {(sku: string, qty: number, mode?: string, src?: string) => boolean} [addSet]
 * @property {(sku: string, dir: 'plus'|'minus') => void}      [subItemStep]
 * @property {(sku: string) => void}                           [subItemReveal]
 * @property {(sku: string, val: number) => void}              [stepperInput]
 * @property {(key: string) => void}                           [toggleBucket]
 * @property {() => void}                                      [back]
 * @property {() => void}                                      [openReviewGate]
 * @property {() => Promise<void>|void}                        [submitOrder]
 */

/**
 * Parse a positive integer from a string; clamp to [1, 999]. Falls back
 * to 1 when input is missing or non-numeric. Mirrors V.7.15 inline
 * stepper input handling.
 *
 * @param {string} raw
 * @returns {number}
 */
function _parseQty(raw) {
    const n = parseInt(String(raw || ""), 10);
    if (!Number.isFinite(n)) return 1;
    if (n < 1) return 1;
    if (n > 999) return 999;
    return n;
}

/**
 * Find the closest stepper container `[data-stepsku]` and return its
 * SKU + the input value (for `add`/`plus`/`minus` resolution).
 *
 * @param {HTMLElement} target
 * @returns {{ sku: string, qty: number, isMain: boolean } | null}
 */
function _resolveStepperContext(target) {
    if (!target || typeof target.closest !== "function") return null;
    const wrap = /** @type {HTMLElement|null} */ (
        target.closest("[data-stepsku]")
    );
    if (!wrap) return null;
    const sku = wrap.getAttribute("data-stepsku") || "";
    if (!sku) return null;
    const isMain = wrap.getAttribute("data-setmain") === "1";
    /** @type {HTMLInputElement|null} */
    const input = wrap.querySelector(".b2f-qty-stepper-input, .b2f-cat-qty-val");
    const raw = input && typeof input.value !== "undefined" ? input.value : "1";
    return { sku, qty: _parseQty(raw), isMain };
}

/**
 * Wire one click + change listener on `root` that dispatches based on
 * `data-action` (or legacy attribute fallbacks for V.7.15 emit parity).
 *
 * Unknown / missing data-* attributes are ignored (no throw).
 * Handler-thrown errors are caught + logged via console.error so a
 * misbehaving sub-handler cannot break the listener.
 *
 * @param {HTMLElement|null|undefined} root
 * @param {EventDelegationDeps} deps
 * @returns {() => void} cleanup fn
 */
export function setupEventDelegation(root, deps) {
    if (!root || typeof root.addEventListener !== "function") {
        return function noop() {};
    }
    if (!deps || typeof deps !== "object") {
        return function noop() {};
    }

    const onClick = (e) => {
        const evtTarget =
            e && /** @type {Event} */ (e).target
                ? /** @type {Element} */ (e.target)
                : null;
        if (!evtTarget) return;

        try {
            // ── Stepper actions (data-stepact) ──────────────────────────
            const stepBtn =
                evtTarget && typeof evtTarget.closest === "function"
                    ? /** @type {HTMLElement|null} */ (
                          evtTarget.closest("[data-stepact]")
                      )
                    : null;
            if (stepBtn) {
                const act = stepBtn.getAttribute("data-stepact") || "";
                const ctx = _resolveStepperContext(stepBtn);
                if (!ctx) return;
                switch (act) {
                    case "minus":
                        if (ctx.isMain) {
                            if (typeof deps.stepperInput === "function") {
                                const next = Math.max(1, ctx.qty - 1);
                                deps.stepperInput(ctx.sku, next);
                            }
                        } else if (typeof deps.subItemStep === "function") {
                            deps.subItemStep(ctx.sku, "minus");
                        }
                        return;
                    case "plus":
                        if (ctx.isMain) {
                            if (typeof deps.stepperInput === "function") {
                                const next = Math.min(999, ctx.qty + 1);
                                deps.stepperInput(ctx.sku, next);
                            }
                        } else if (typeof deps.subItemStep === "function") {
                            deps.subItemStep(ctx.sku, "plus");
                        }
                        return;
                    case "add":
                        if (ctx.isMain && typeof deps.addSet === "function") {
                            deps.addSet(ctx.sku, ctx.qty);
                        } else if (typeof deps.addToCart === "function") {
                            deps.addToCart(ctx.sku, ctx.qty);
                        }
                        return;
                    case "input":
                        // Change event — handled in onChange below.
                        return;
                    default:
                        return;
                }
            }

            // ── "+ สั่งแยก" reveal button (data-subaddsku) ──────────────
            const subAddBtn =
                evtTarget && typeof evtTarget.closest === "function"
                    ? /** @type {HTMLElement|null} */ (
                          evtTarget.closest("[data-subaddsku]")
                      )
                    : null;
            if (subAddBtn) {
                const sku = subAddBtn.getAttribute("data-subaddsku") || "";
                if (sku && typeof deps.subItemReveal === "function") {
                    deps.subItemReveal(sku);
                } else if (sku && typeof deps.addToCart === "function") {
                    // Fallback — without reveal handler, add 1 directly.
                    deps.addToCart(sku, 1);
                }
                return;
            }

            // ── Review Gate accordion (data-bucket-tab) ─────────────────
            const bucketHdr =
                evtTarget && typeof evtTarget.closest === "function"
                    ? /** @type {HTMLElement|null} */ (
                          evtTarget.closest("[data-bucket-tab]")
                      )
                    : null;
            if (bucketHdr) {
                const key = bucketHdr.getAttribute("data-bucket-tab") || "";
                if (key && typeof deps.toggleBucket === "function") {
                    deps.toggleBucket(key);
                }
                return;
            }

            // ── data-action dispatch ────────────────────────────────────
            const target =
                evtTarget && typeof evtTarget.closest === "function"
                    ? /** @type {HTMLElement|null} */ (
                          evtTarget.closest("[data-action]")
                      )
                    : null;
            if (!target) return;
            const action = target.getAttribute("data-action") || "";
            switch (action) {
                case "pick-maker": {
                    const id = target.getAttribute("data-maker-id") || "";
                    if (id && typeof deps.pickMaker === "function") {
                        deps.pickMaker(id);
                    }
                    return;
                }
                case "plus": {
                    const sku = target.getAttribute("data-sku") || "";
                    if (sku && typeof deps.increment === "function") {
                        deps.increment(sku);
                    }
                    return;
                }
                case "minus": {
                    const sku = target.getAttribute("data-sku") || "";
                    if (sku && typeof deps.decrement === "function") {
                        deps.decrement(sku);
                    }
                    return;
                }
                case "detail": {
                    const sku =
                        target.getAttribute("data-sku") ||
                        target.getAttribute("data-setsku") ||
                        "";
                    if (sku && typeof deps.openSetDetail === "function") {
                        deps.openSetDetail(sku);
                    }
                    return;
                }
                case "remove": {
                    const sku = target.getAttribute("data-sku") || "";
                    if (sku && typeof deps.removeFromCart === "function") {
                        deps.removeFromCart(sku);
                    }
                    return;
                }
                case "back":
                    if (typeof deps.back === "function") deps.back();
                    return;
                case "review":
                    if (typeof deps.openReviewGate === "function") {
                        deps.openReviewGate();
                    }
                    return;
                case "submit":
                    if (typeof deps.submitOrder === "function") {
                        const r = deps.submitOrder();
                        // Fire-and-forget — Promise rejections handled
                        // inside the loader (showToast on caught err).
                        if (r && typeof r.then === "function") {
                            r.catch(function (err) {
                                console.error(
                                    "[b2f-catalog] submitOrder rejected:",
                                    err
                                );
                            });
                        }
                    }
                    return;
                default:
                    // Unknown action — silently ignore.
                    return;
            }
        } catch (err) {
            console.error(
                "[b2f-catalog] event delegation handler threw:",
                err
            );
        }
    };

    const onChange = (e) => {
        const evtTarget =
            e && /** @type {Event} */ (e).target
                ? /** @type {Element} */ (e.target)
                : null;
        if (!evtTarget) return;
        try {
            const stepInput =
                evtTarget && typeof evtTarget.closest === "function"
                    ? /** @type {HTMLElement|null} */ (
                          evtTarget.closest('[data-stepact="input"]')
                      )
                    : null;
            if (!stepInput) return;
            const ctx = _resolveStepperContext(stepInput);
            if (!ctx) return;
            if (typeof deps.stepperInput === "function") {
                deps.stepperInput(ctx.sku, ctx.qty);
            }
        } catch (err) {
            console.error(
                "[b2f-catalog] event delegation change handler threw:",
                err
            );
        }
    };

    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    return function cleanup() {
        root.removeEventListener("click", onClick);
        root.removeEventListener("change", onChange);
    };
}
