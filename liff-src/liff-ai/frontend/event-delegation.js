/**
 * LIFF AI Frontend — Event Delegation (V.0.5 Round 4)
 *
 * Single click + change + submit listener on the root mount that resolves
 * events bubbling up through `[data-action]` elements and dispatches to the
 * right handler in the dependency-injected bag.
 *
 * Replaces the V.0.4 legacy `window.goToTab` / `window.openLeadDetail` /
 * `window.openClaimDetail` / `window.handleAskAgent` / `window.handleAcceptLead` /
 * `window.handleNoteAdd` / `window.handleStatusChange` /
 * `window.handleClaimStatusUpdate` / `window.showStatusChangeModal` /
 * `window.showClaimStatusModal` / `window.openLightbox` / `window.closeLightbox` /
 * `window.navigate` bridge globals (13 total).
 *
 * Action taxonomy (mirror of [LIFF AI] Snippet 2 V.3.10 inline emit sites):
 *
 *   Navigation
 *     - data-action="go-tab"            + data-tab                 → goTab(tab)
 *     - data-action="navigate"          + data-page (+ data-id)    → navigate(page, {id})
 *     - data-action="back"                                         → back()
 *     - data-action="refresh"                                      → refresh()
 *
 *   Lead
 *     - data-action="open-lead-detail"  + data-lead-id             → openLeadDetail(id)
 *     - data-action="accept-lead"       + data-lead-id             → acceptLead(id)
 *     - data-action="add-lead-note"     + data-lead-id             → addLeadNote(id)
 *     - data-action="show-lead-status-modal" + data-lead-id        → showLeadStatusModal(id)
 *     - data-action="change-lead-status"+ data-lead-id + data-status → changeLeadStatus(id, status)
 *
 *   Claim
 *     - data-action="open-claim-detail" + data-claim-id            → openClaimDetail(id)
 *     - data-action="show-claim-status-modal" + data-claim-id      → showClaimStatusModal(id)
 *     - data-action="change-claim-status"+ data-claim-id + data-status → changeClaimStatus(id, status)
 *
 *   Photo lightbox
 *     - data-action="open-photo-lightbox" + data-photo-url         → openPhotoLightbox(url)
 *     - data-action="close-photo-lightbox"                         → closePhotoLightbox()
 *
 *   Agent chat
 *     - data-action="ask-agent"         (+ data-question optional) → askAgent(question)
 *     - data-action="quick-question"    + data-quick               → askAgent(quick)
 *     - data-action="submit-agent-question" (form submit)          → askAgent(input.value)
 *
 * Pure module — accepts dependency-injected handler bag so tests can mock
 * router + loaders without importing the full Vite entry (CSS imports
 * break Jest). entry.js wires the real bag.
 *
 * Returns a cleanup function that removes all listeners (idempotent).
 */

/**
 * @typedef {Object} LiffAiEventDelegationDeps
 * @property {(tab: string, params?: Record<string, any>) => void}   [goTab]
 * @property {(page: string, params?: Record<string, any>) => void}  [navigate]
 * @property {(id: string|number) => void}                           [openLeadDetail]
 * @property {(id: string|number) => void}                           [openClaimDetail]
 * @property {(id: string|number) => void|Promise<void>}             [acceptLead]
 * @property {(id: string|number) => void|Promise<void>}             [addLeadNote]
 * @property {(id: string|number) => void}                           [showLeadStatusModal]
 * @property {(id: string|number, status: string) => void|Promise<void>} [changeLeadStatus]
 * @property {(id: string|number) => void}                           [showClaimStatusModal]
 * @property {(id: string|number, status: string) => void|Promise<void>} [changeClaimStatus]
 * @property {(url: string) => void}                                 [openPhotoLightbox]
 * @property {() => void}                                            [closePhotoLightbox]
 * @property {(question?: string) => void|Promise<void>}             [askAgent]
 * @property {() => void}                                            [back]
 * @property {() => void|Promise<void>}                              [refresh]
 */

/**
 * Wire one click + change + submit listener on `root` that dispatches based
 * on `data-action`. Unknown / missing data-action attributes are ignored
 * (no throw). Handler-thrown errors are caught + logged via console.error
 * so a misbehaving sub-handler cannot break the listener.
 *
 * @param {HTMLElement|null|undefined} root
 * @param {LiffAiEventDelegationDeps} deps
 * @returns {() => void} cleanup fn
 */
export function setupEventDelegation(root, deps) {
    if (!root || typeof root.addEventListener !== "function") {
        return function noop() {};
    }
    if (!deps || typeof deps !== "object") {
        return function noop() {};
    }

    const _maybe = (fn) => typeof fn === "function";

    const _runMaybeAsync = (label, result) => {
        if (result && typeof result.then === "function") {
            result.catch(function (err) {
                console.error("[liff-ai] " + label + " rejected:", err);
            });
        }
    };

    const onClick = (e) => {
        const evtTarget =
            e && /** @type {Event} */ (e).target
                ? /** @type {Element} */ (e.target)
                : null;
        if (!evtTarget) return;

        try {
            // ── Quick-question chips (data-quick) ──────────────────────
            const quickBtn =
                evtTarget && typeof evtTarget.closest === "function"
                    ? /** @type {HTMLElement|null} */ (
                          evtTarget.closest("[data-quick]")
                      )
                    : null;
            if (quickBtn && !quickBtn.hasAttribute("data-action")) {
                const q = quickBtn.getAttribute("data-quick") || "";
                if (q && _maybe(deps.askAgent)) {
                    _runMaybeAsync("askAgent(quick)", deps.askAgent(q));
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
                case "go-tab": {
                    const tab = target.getAttribute("data-tab") || "";
                    if (tab && _maybe(deps.goTab)) deps.goTab(tab);
                    return;
                }
                case "navigate": {
                    const page = target.getAttribute("data-page") || "";
                    const id = target.getAttribute("data-id") || "";
                    if (page && _maybe(deps.navigate)) {
                        deps.navigate(page, id ? { id } : {});
                    }
                    return;
                }
                case "open-lead-detail": {
                    const id = target.getAttribute("data-lead-id") || "";
                    if (id && _maybe(deps.openLeadDetail)) {
                        deps.openLeadDetail(id);
                    }
                    return;
                }
                case "open-claim-detail": {
                    const id = target.getAttribute("data-claim-id") || "";
                    if (id && _maybe(deps.openClaimDetail)) {
                        deps.openClaimDetail(id);
                    }
                    return;
                }
                case "accept-lead": {
                    const id = target.getAttribute("data-lead-id") || "";
                    if (id && _maybe(deps.acceptLead)) {
                        _runMaybeAsync("acceptLead", deps.acceptLead(id));
                    }
                    return;
                }
                case "add-lead-note": {
                    const id = target.getAttribute("data-lead-id") || "";
                    if (id && _maybe(deps.addLeadNote)) {
                        _runMaybeAsync("addLeadNote", deps.addLeadNote(id));
                    }
                    return;
                }
                case "show-lead-status-modal": {
                    const id = target.getAttribute("data-lead-id") || "";
                    if (id && _maybe(deps.showLeadStatusModal)) {
                        deps.showLeadStatusModal(id);
                    }
                    return;
                }
                case "change-lead-status": {
                    const id = target.getAttribute("data-lead-id") || "";
                    const status = target.getAttribute("data-status") || "";
                    if (id && status && _maybe(deps.changeLeadStatus)) {
                        _runMaybeAsync(
                            "changeLeadStatus",
                            deps.changeLeadStatus(id, status)
                        );
                    }
                    return;
                }
                case "show-claim-status-modal": {
                    const id = target.getAttribute("data-claim-id") || "";
                    if (id && _maybe(deps.showClaimStatusModal)) {
                        deps.showClaimStatusModal(id);
                    }
                    return;
                }
                case "change-claim-status": {
                    const id = target.getAttribute("data-claim-id") || "";
                    const status = target.getAttribute("data-status") || "";
                    if (id && status && _maybe(deps.changeClaimStatus)) {
                        _runMaybeAsync(
                            "changeClaimStatus",
                            deps.changeClaimStatus(id, status)
                        );
                    }
                    return;
                }
                case "open-photo-lightbox": {
                    const url = target.getAttribute("data-photo-url") || "";
                    if (url && _maybe(deps.openPhotoLightbox)) {
                        deps.openPhotoLightbox(url);
                    }
                    return;
                }
                case "close-photo-lightbox":
                    if (_maybe(deps.closePhotoLightbox)) {
                        deps.closePhotoLightbox();
                    }
                    return;
                case "ask-agent": {
                    const q = target.getAttribute("data-question") || "";
                    if (_maybe(deps.askAgent)) {
                        _runMaybeAsync(
                            "askAgent",
                            deps.askAgent(q || undefined)
                        );
                    }
                    return;
                }
                case "quick-question": {
                    const q = target.getAttribute("data-quick") || "";
                    if (q && _maybe(deps.askAgent)) {
                        _runMaybeAsync(
                            "askAgent(quick-question)",
                            deps.askAgent(q)
                        );
                    }
                    return;
                }
                case "back":
                    if (_maybe(deps.back)) deps.back();
                    return;
                case "refresh":
                    if (_maybe(deps.refresh)) {
                        _runMaybeAsync("refresh", deps.refresh());
                    }
                    return;
                default:
                    // Unknown action — silently ignore.
                    return;
            }
        } catch (err) {
            console.error("[liff-ai] event delegation handler threw:", err);
        }
    };

    const onSubmit = (e) => {
        const evtTarget =
            e && /** @type {Event} */ (e).target
                ? /** @type {Element} */ (e.target)
                : null;
        if (!evtTarget) return;
        try {
            const formEl =
                evtTarget && typeof evtTarget.closest === "function"
                    ? /** @type {HTMLFormElement|null} */ (
                          evtTarget.closest("[data-action]")
                      )
                    : null;
            if (!formEl) return;
            const action = formEl.getAttribute("data-action") || "";
            if (action === "submit-agent-question") {
                if (e && typeof e.preventDefault === "function") {
                    e.preventDefault();
                }
                /** @type {HTMLInputElement|null} */
                const input = formEl.querySelector(
                    'input[name="question"], input[type="text"]'
                );
                const q =
                    input && typeof input.value !== "undefined"
                        ? input.value
                        : "";
                if (_maybe(deps.askAgent)) {
                    _runMaybeAsync(
                        "askAgent(submit)",
                        deps.askAgent(q || undefined)
                    );
                }
            }
        } catch (err) {
            console.error(
                "[liff-ai] event delegation submit handler threw:",
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
            const target =
                evtTarget && typeof evtTarget.closest === "function"
                    ? /** @type {HTMLElement|null} */ (
                          evtTarget.closest("[data-action]")
                      )
                    : null;
            if (!target) return;
            const action = target.getAttribute("data-action") || "";
            if (action === "change-lead-status") {
                const id = target.getAttribute("data-lead-id") || "";
                /** @type {HTMLSelectElement} */
                const sel = /** @type {any} */ (target);
                const status = sel && sel.value ? sel.value : "";
                if (id && status && _maybe(deps.changeLeadStatus)) {
                    _runMaybeAsync(
                        "changeLeadStatus(change)",
                        deps.changeLeadStatus(id, status)
                    );
                }
            } else if (action === "change-claim-status") {
                const id = target.getAttribute("data-claim-id") || "";
                /** @type {HTMLSelectElement} */
                const sel = /** @type {any} */ (target);
                const status = sel && sel.value ? sel.value : "";
                if (id && status && _maybe(deps.changeClaimStatus)) {
                    _runMaybeAsync(
                        "changeClaimStatus(change)",
                        deps.changeClaimStatus(id, status)
                    );
                }
            }
        } catch (err) {
            console.error(
                "[liff-ai] event delegation change handler threw:",
                err
            );
        }
    };

    root.addEventListener("click", onClick);
    root.addEventListener("submit", onSubmit);
    root.addEventListener("change", onChange);
    return function cleanup() {
        root.removeEventListener("click", onClick);
        root.removeEventListener("submit", onSubmit);
        root.removeEventListener("change", onChange);
    };
}
