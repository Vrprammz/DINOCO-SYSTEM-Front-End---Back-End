/**
 * B2F Maker LIFF — Event Delegation (V.0.5 Round 4)
 *
 * Single click listener that resolves clicks bubbling up through
 * `[data-action]` elements and dispatches to the appropriate handler.
 *
 * Replaces all inline `onclick="..."` handlers from V.4.7. Pages now emit
 * declarative attributes:
 *   - data-action          — handler key (required)
 *   - data-view            — for navigate / navigate-with-po
 *   - data-po-id           — for navigate-with-po / deliver-open
 *   - data-delta           — for deliver-step (signed integer)
 *
 * Pure module — accepts dependency-injected handler bag so tests can mock
 * router + loaders without importing the full Vite entry (CSS imports break
 * Jest). entry.js wires the real bag.
 *
 * Returns a cleanup function that removes the click listener (idempotent).
 */

/**
 * @typedef {Object} EventDelegationDeps
 * @property {(view: string) => void}                    goToPage
 * @property {(view: string, poId: string|number) => void} goToPageWithPO
 * @property {(poId: string|number) => Promise<void>|void} b2fOpenDeliverForm
 * @property {() => Promise<void>|void}                  loadDeliverPage
 * @property {(btn: HTMLElement, delta: number) => void} b2fStepQty
 * @property {() => void}                                b2fFillAllRemaining
 * @property {() => Promise<void>|void}                  handleDeliverSubmit
 */

/**
 * Wire one click listener on `root` that dispatches based on `data-action`.
 *
 * Handled actions:
 *   - `navigate`           — goToPage(data-view)
 *   - `navigate-with-po`   — goToPageWithPO(data-view, data-po-id) — falls
 *                            back to goToPage(data-view) when po-id missing
 *   - `deliver-open`       — b2fOpenDeliverForm(data-po-id) (stops propagation
 *                            to avoid re-triggering parent card listeners)
 *   - `deliver-back`       — loadDeliverPage()
 *   - `deliver-step`       — b2fStepQty(target, parseInt(data-delta))
 *   - `deliver-fill-all`   — b2fFillAllRemaining()
 *   - `deliver-submit`     — handleDeliverSubmit()
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
    const listener = (e) => {
        const evtTarget =
            e && /** @type {Event} */ (e).target
                ? /** @type {Element} */ (e.target)
                : null;
        const target =
            evtTarget && typeof evtTarget.closest === "function"
                ? /** @type {HTMLElement|null} */ (
                      evtTarget.closest("[data-action]")
                  )
                : null;
        if (!target) return;
        const action = target.getAttribute("data-action") || "";
        try {
            switch (action) {
                case "navigate": {
                    const view = target.getAttribute("data-view") || "";
                    if (view && typeof deps.goToPage === "function") {
                        deps.goToPage(view);
                    }
                    break;
                }
                case "navigate-with-po": {
                    const view = target.getAttribute("data-view") || "";
                    const poId = target.getAttribute("data-po-id") || "";
                    if (
                        view &&
                        poId &&
                        typeof deps.goToPageWithPO === "function"
                    ) {
                        deps.goToPageWithPO(view, poId);
                    } else if (view && typeof deps.goToPage === "function") {
                        deps.goToPage(view);
                    }
                    break;
                }
                case "deliver-open": {
                    if (e && typeof e.stopPropagation === "function") {
                        e.stopPropagation();
                    }
                    const poId = target.getAttribute("data-po-id") || "";
                    if (
                        poId &&
                        typeof deps.b2fOpenDeliverForm === "function"
                    ) {
                        Promise.resolve(deps.b2fOpenDeliverForm(poId)).catch(
                            (err) =>
                                console.error(
                                    "[b2f-maker] deliver-open failed",
                                    err
                                )
                        );
                    }
                    break;
                }
                case "deliver-back": {
                    if (typeof deps.loadDeliverPage === "function") {
                        Promise.resolve(deps.loadDeliverPage()).catch(
                            (err) =>
                                console.error(
                                    "[b2f-maker] deliver-back failed",
                                    err
                                )
                        );
                    }
                    break;
                }
                case "deliver-step": {
                    const deltaRaw =
                        target.getAttribute("data-delta") || "0";
                    const delta = parseInt(deltaRaw, 10) || 0;
                    if (typeof deps.b2fStepQty === "function") {
                        deps.b2fStepQty(
                            /** @type {HTMLElement} */ (target),
                            delta
                        );
                    }
                    break;
                }
                case "deliver-fill-all": {
                    if (typeof deps.b2fFillAllRemaining === "function") {
                        deps.b2fFillAllRemaining();
                    }
                    break;
                }
                case "deliver-submit": {
                    if (typeof deps.handleDeliverSubmit === "function") {
                        Promise.resolve(deps.handleDeliverSubmit()).catch(
                            (err) =>
                                console.error(
                                    "[b2f-maker] deliver-submit failed",
                                    err
                                )
                        );
                    }
                    break;
                }
                default:
                    // Unknown action — silently ignore.
                    break;
            }
        } catch (err) {
            console.error(
                "[b2f-maker] event delegation handler threw:",
                err
            );
        }
    };
    root.addEventListener("click", listener);
    return function cleanup() {
        root.removeEventListener("click", listener);
    };
}
