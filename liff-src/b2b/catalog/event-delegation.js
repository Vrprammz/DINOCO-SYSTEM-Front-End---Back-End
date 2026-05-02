/**
 * B2B LIFF E-Catalog — Event Delegation (V.0.5 Round 4)
 *
 * Single click + change listener on the root mount that resolves events
 * bubbling up through `[data-action]` elements (and a small set of legacy
 * `data-stepact` / `data-rmsku` / `data-cancel` / `data-reorder` /
 * `data-claim` attributes for compatibility with V.32.9 inline emit
 * patterns) and dispatches to the right handler.
 *
 * Replaces the V.0.4 legacy `window.B2B_CATALOG_*` bridge globals — pages
 * already emit declarative attributes from Round 2 onward; Round 4 wires
 * the listener that consumes them.
 *
 * Action taxonomy (mirror of [B2B] Snippet 4 V.32.9 inline emit sites):
 *
 *   Catalog grid (pages/catalog.js)
 *     - data-action="add"    + data-sku="..."             → addToCart(sku, 1)
 *     - data-action="plus"   + data-sku="..."             → increment(sku)
 *     - data-action="minus"  + data-sku="..."             → decrement(sku)
 *     - data-action="detail" + data-sku="..."             → openSetDetail(sku)
 *
 *   Home page (pages/home.js)
 *     - data-action="set-model-view"     + data-model-name → setModelView(name)
 *     - data-action="set-category-view"  + data-cat-name   → setCategoryView(name)
 *     - data-action="set-cross-filter"   + data-cross      → setCrossFilter(value)
 *
 *   History page (pages/history.js)
 *     - data-action="set-history-filter" + data-filter     → setHistoryFilter(key)
 *     - data-action="load-more"                            → loadMore()
 *     - data-cancel="<id>"   (button inside history card)  → cancelOrder(id)
 *     - data-reorder="<id>"                                → reorder(id)
 *     - data-claim="<id>"                                  → openClaim(id)
 *     - data-view="<url>"   on .b2b-cat-hbtn.detail        → openTicket(url)
 *
 *   Cart modal (pages/cart.js)
 *     - data-action="add-recommended" + data-sku           → addToCart(sku, 1)
 *     - data-rmsku="<sku>"  on .b2b-cart-remove-btn        → removeFromCart(sku)
 *
 *   SET Detail overlay (pages/setDetail.js)
 *     - data-stepact="minus" + data-stepsku                → stepperMinus(sku)
 *     - data-stepact="plus"  + data-stepsku                → stepperPlus(sku)
 *     - data-stepact="add"   + data-stepsku + setmain      → addSet(sku, qty)
 *     - data-stepact="add"   + data-stepsku (sub)          → subItemAdd(sku, qty)
 *     - data-stepact="input" + data-stepsku (change event) → stepperInput(sku, val)
 *     - data-subaddsku="<sku>"  ("+ สั่งแยก" reveal btn)   → subItemReveal(sku)
 *
 * Pure module — accepts dependency-injected handler bag so tests can mock
 * router + loaders without importing the full Vite entry (CSS imports
 * break Jest). entry.js wires the real bag.
 *
 * Returns a cleanup function that removes both listeners (idempotent).
 */

/**
 * @typedef {Object} EventDelegationDeps
 * @property {(tab: string) => void}                       goTab
 * @property {(sku: string) => void}                       openSetDetail
 * @property {(sku: string, qty?: number) => void}         addToCart
 * @property {(sku: string) => void}                       increment
 * @property {(sku: string) => void}                       decrement
 * @property {(sku: string) => void}                       removeFromCart
 * @property {(filter: string) => void}                    setHistoryFilter
 * @property {() => void}                                  loadMore
 * @property {(name: string) => void}                      setModelView
 * @property {(name: string) => void}                      setCategoryView
 * @property {(value: string) => void}                     setCrossFilter
 * @property {(id: string) => void}                        cancelOrder
 * @property {(id: string) => void}                        reorder
 * @property {(id: string) => void}                        openClaim
 * @property {(url: string) => void}                       openTicket
 * @property {(sku: string, qty?: number) => void}         addSet
 * @property {(sku: string, dir: 'plus'|'minus') => void}  subItemStep
 * @property {(sku: string) => void}                       [subItemReveal]
 * @property {(sku: string, val: number) => void}          [stepperInput]
 * @property {() => void}                                  [back]
 */

/**
 * Parse a positive integer from a string; clamp to [1, 999]. Falls back
 * to 1 when input is missing or non-numeric. Mirrors V.32.9 inline
 * stepper input handling (line ~1500).
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
    const input = wrap.querySelector(".b2b-qty-stepper-input");
    const raw = input && typeof input.value !== "undefined" ? input.value : "1";
    return { sku, qty: _parseQty(raw), isMain };
}

/**
 * Wire one click + change listener on `root` that dispatches based on
 * `data-action` (or legacy attribute fallbacks for V.32.9 emit parity).
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
                            // Main "+ ชุดเต็ม" minus has no separate cart
                            // semantic — adjusts the typed input only;
                            // V.32.9 line ~1493 handles via stepperInput.
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

            // ── Cart modal remove button (data-rmsku) ───────────────────
            const rmBtn =
                evtTarget && typeof evtTarget.closest === "function"
                    ? /** @type {HTMLElement|null} */ (
                          evtTarget.closest("[data-rmsku]")
                      )
                    : null;
            if (rmBtn) {
                const sku = rmBtn.getAttribute("data-rmsku") || "";
                if (sku && typeof deps.removeFromCart === "function") {
                    deps.removeFromCart(sku);
                }
                return;
            }

            // ── History card action buttons ─────────────────────────────
            const historyBtn =
                evtTarget && typeof evtTarget.closest === "function"
                    ? /** @type {HTMLElement|null} */ (
                          evtTarget.closest(
                              "[data-cancel],[data-reorder]," +
                                  "[data-claim],.b2b-cat-hbtn.detail"
                          )
                      )
                    : null;
            if (historyBtn) {
                const cancelId = historyBtn.getAttribute("data-cancel");
                const reorderId = historyBtn.getAttribute("data-reorder");
                const claimId = historyBtn.getAttribute("data-claim");
                if (cancelId && typeof deps.cancelOrder === "function") {
                    deps.cancelOrder(cancelId);
                    return;
                }
                if (reorderId && typeof deps.reorder === "function") {
                    deps.reorder(reorderId);
                    return;
                }
                if (claimId && typeof deps.openClaim === "function") {
                    deps.openClaim(claimId);
                    return;
                }
                // .b2b-cat-hbtn.detail uses data-view for the URL.
                const url = historyBtn.getAttribute("data-view");
                if (url && typeof deps.openTicket === "function") {
                    deps.openTicket(url);
                    return;
                }
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
                case "add":
                case "add-recommended": {
                    const sku = target.getAttribute("data-sku") || "";
                    if (sku && typeof deps.addToCart === "function") {
                        deps.addToCart(sku, 1);
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
                    const sku = target.getAttribute("data-sku") || "";
                    if (sku && typeof deps.openSetDetail === "function") {
                        deps.openSetDetail(sku);
                    }
                    return;
                }
                case "set-model-view": {
                    const name = target.getAttribute("data-model-name") || "";
                    if (typeof deps.setModelView === "function") {
                        deps.setModelView(name);
                    }
                    return;
                }
                case "set-category-view": {
                    const name = target.getAttribute("data-cat-name") || "";
                    if (typeof deps.setCategoryView === "function") {
                        deps.setCategoryView(name);
                    }
                    return;
                }
                case "set-cross-filter": {
                    const value = target.getAttribute("data-cross") || "";
                    if (typeof deps.setCrossFilter === "function") {
                        deps.setCrossFilter(value);
                    }
                    return;
                }
                case "set-history-filter": {
                    const key = target.getAttribute("data-filter") || "";
                    if (typeof deps.setHistoryFilter === "function") {
                        deps.setHistoryFilter(key);
                    }
                    return;
                }
                case "load-more":
                    if (typeof deps.loadMore === "function") {
                        deps.loadMore();
                    }
                    return;
                case "go-tab": {
                    const tab = target.getAttribute("data-tab") || "";
                    if (tab && typeof deps.goTab === "function") {
                        deps.goTab(tab);
                    }
                    return;
                }
                case "back":
                    if (typeof deps.back === "function") deps.back();
                    return;
                default:
                    // Unknown action — silently ignore.
                    return;
            }
        } catch (err) {
            console.error(
                "[b2b-catalog] event delegation handler threw:",
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
                "[b2b-catalog] event delegation change handler threw:",
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
