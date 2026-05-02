/**
 * Phase 6 Jest tests for liff-src/b2b/catalog/router.js (V.0.4 Round 3).
 *
 * Covers the hash-based router that owns SET Detail overlay + tab
 * navigation for the B2B LIFF E-Catalog:
 *   - getCurrentTab() — reads tab name from URL hash, defaults "catalog"
 *   - getCurrentSetSku() — extracts sku from "#detail-<sku>" hash
 *   - isSetDetailOpen() — true when overlay hash present
 *   - goToTab(tab, opts) — pushState + dispatch (silent flag respected)
 *   - openSetDetail(sku, product) — pushes "#detail-<sku>" + dispatches
 *   - closeSetDetail() — history.back() + dispatch close handler
 *   - back() — close overlay first, else history.back()
 *   - setupHashRouter({handlers, useHashApi}) — idempotent listener wire
 *   - dispatchInitial() — fires handler matching landing URL
 *   - hashchange/popstate — re-dispatches handlers on browser nav
 *
 * Production anchor: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   - line 1187 : history.pushState({view:'detail',sku},'','#detail-<sku>')
 *   - line 1297 : popstate listener — closes SET Detail when active
 */

import {
    getCurrentTab,
    getCurrentSetSku,
    isSetDetailOpen,
    goToTab,
    openSetDetail,
    closeSetDetail,
    back,
    setupHashRouter,
    dispatchInitial,
    _resetRouter,
} from "../../liff-src/b2b/catalog/router.js";

/**
 * Helper — replace window.location hash + path via history API
 * (jsdom-safe; direct .hash assignment fires hashchange we want to
 * control deterministically).
 *
 * @param {string} hash — without leading #
 */
function setHash(hash) {
    const url = "/test" + (hash ? "#" + hash : "");
    window.history.replaceState({}, "", url);
}

describe("router — getCurrentTab", () => {
    beforeEach(() => {
        _resetRouter();
        setHash("");
    });

    test("returns 'catalog' when hash is empty", () => {
        expect(getCurrentTab()).toBe("catalog");
    });

    test("reads tab name from #catalog hash", () => {
        setHash("catalog");
        expect(getCurrentTab()).toBe("catalog");
    });

    test("reads tab name from #history hash", () => {
        setHash("history");
        expect(getCurrentTab()).toBe("history");
    });

    test("falls back to 'catalog' for unknown tab name", () => {
        setHash("garbage");
        expect(getCurrentTab()).toBe("catalog");
    });

    test("returns 'catalog' when hash is detail-<sku> (overlay open)", () => {
        // Overlay-open is reported via getCurrentSetSku; getCurrentTab
        // says what the underlying tab is — defaults to catalog.
        setHash("detail-DNCSETXL7500X001");
        expect(getCurrentTab()).toBe("catalog");
    });

    test("recognizes all 3 known tabs", () => {
        for (const t of ["catalog", "home", "history"]) {
            setHash(t);
            expect(getCurrentTab()).toBe(t);
        }
    });
});

describe("router — getCurrentSetSku + isSetDetailOpen", () => {
    beforeEach(() => {
        _resetRouter();
        setHash("");
    });

    test("returns empty string when hash absent", () => {
        expect(getCurrentSetSku()).toBe("");
        expect(isSetDetailOpen()).toBe(false);
    });

    test("returns empty string for tab hashes", () => {
        setHash("history");
        expect(getCurrentSetSku()).toBe("");
        expect(isSetDetailOpen()).toBe(false);
    });

    test("extracts sku from #detail-<sku>", () => {
        setHash("detail-DNCSETXL7500X001");
        expect(getCurrentSetSku()).toBe("DNCSETXL7500X001");
        expect(isSetDetailOpen()).toBe(true);
    });

    test("preserves SKU casing + special chars", () => {
        setHash("detail-DNC-SET_xl7500.X.001");
        expect(getCurrentSetSku()).toBe("DNC-SET_xl7500.X.001");
    });
});

describe("router — goToTab (SPA mode)", () => {
    let pushSpy;

    beforeEach(() => {
        _resetRouter();
        setHash("");
        pushSpy = jest.spyOn(window.history, "pushState");
    });

    afterEach(() => {
        pushSpy.mockRestore();
    });

    test("goToTab('history') calls history.pushState with #history", () => {
        setupHashRouter({ handlers: {}, useHashApi: true });
        goToTab("history");
        expect(pushSpy).toHaveBeenCalledTimes(1);
        const args = pushSpy.mock.calls[0];
        expect(args[2]).toContain("#history");
    });

    test("goToTab with unknown tab falls back to 'catalog'", () => {
        setupHashRouter({ handlers: {}, useHashApi: true });
        goToTab("garbage");
        const args = pushSpy.mock.calls[0];
        expect(args[2]).toContain("#catalog");
    });

    test("goToTab fires matching handler (history)", () => {
        const historyH = jest.fn();
        setupHashRouter({
            useHashApi: true,
            handlers: { history: historyH },
        });
        goToTab("history");
        expect(historyH).toHaveBeenCalledTimes(1);
    });

    test("goToTab silent=true skips handler dispatch", () => {
        const catalogH = jest.fn();
        setupHashRouter({
            useHashApi: true,
            handlers: { catalog: catalogH },
        });
        goToTab("catalog", { silent: true });
        expect(catalogH).not.toHaveBeenCalled();
    });

    test("handler exception is swallowed (does not throw)", () => {
        const bad = jest.fn().mockImplementation(() => {
            throw new Error("boom");
        });
        setupHashRouter({
            useHashApi: true,
            handlers: { history: bad },
        });
        const orig = console.error;
        console.error = jest.fn();
        try {
            expect(() => goToTab("history")).not.toThrow();
            expect(bad).toHaveBeenCalled();
        } finally {
            console.error = orig;
        }
    });
});

describe("router — openSetDetail / closeSetDetail (SPA mode)", () => {
    let pushSpy;
    let backSpy;

    beforeEach(() => {
        _resetRouter();
        setHash("");
        pushSpy = jest.spyOn(window.history, "pushState");
        backSpy = jest.spyOn(window.history, "back").mockImplementation(() => {
            // jsdom history.back is a no-op anyway, but stub to avoid
            // any side effects.
        });
    });

    afterEach(() => {
        pushSpy.mockRestore();
        backSpy.mockRestore();
    });

    test("openSetDetail pushes #detail-<sku> hash + dispatches setDetail handler", () => {
        const setDetailH = jest.fn();
        setupHashRouter({
            useHashApi: true,
            handlers: { setDetail: setDetailH },
        });
        openSetDetail("DNCSETXL7500X001");
        expect(pushSpy).toHaveBeenCalledTimes(1);
        const args = pushSpy.mock.calls[0];
        expect(args[2]).toContain("#detail-DNCSETXL7500X001");
        expect(setDetailH).toHaveBeenCalledWith("DNCSETXL7500X001");
    });

    test("openSetDetail with empty/null sku is a no-op", () => {
        setupHashRouter({ useHashApi: true, handlers: {} });
        openSetDetail("");
        openSetDetail(null);
        expect(pushSpy).not.toHaveBeenCalled();
    });

    test("closeSetDetail calls history.back when overlay is open", () => {
        setHash("detail-DNCSETXL7500X001");
        setupHashRouter({ useHashApi: true, handlers: {} });
        closeSetDetail();
        expect(backSpy).toHaveBeenCalledTimes(1);
    });

    test("closeSetDetail is no-op when overlay not open", () => {
        setHash("catalog");
        setupHashRouter({ useHashApi: true, handlers: {} });
        closeSetDetail();
        expect(backSpy).not.toHaveBeenCalled();
    });

    test("openSetDetail forwards product hint to handler via state", () => {
        const setDetailH = jest.fn();
        setupHashRouter({
            useHashApi: true,
            handlers: { setDetail: setDetailH },
        });
        const product = { sku: "FOO", name: "Test" };
        openSetDetail("FOO", product);
        // Product is stashed in history.state[2] for downstream readback;
        // verify the pushState payload carries it.
        const stateArg = pushSpy.mock.calls[0][0];
        expect(stateArg).toEqual({
            view: "detail",
            sku: "FOO",
            product,
        });
    });
});

describe("router — back()", () => {
    let backSpy;

    beforeEach(() => {
        _resetRouter();
        setHash("");
        backSpy = jest.spyOn(window.history, "back").mockImplementation(() => {});
    });

    afterEach(() => {
        backSpy.mockRestore();
    });

    test("back() closes overlay when one is open", () => {
        setHash("detail-FOO");
        setupHashRouter({ useHashApi: true, handlers: {} });
        back();
        expect(backSpy).toHaveBeenCalledTimes(1);
    });

    test("back() falls through to history.back() when no overlay", () => {
        setHash("history");
        setupHashRouter({ useHashApi: true, handlers: {} });
        back();
        expect(backSpy).toHaveBeenCalledTimes(1);
    });
});

describe("router — setupHashRouter validation", () => {
    beforeEach(() => _resetRouter());

    test("throws when options omitted", () => {
        expect(() => setupHashRouter()).toThrow(/handlers required/);
    });

    test("idempotent — second call replaces handler map", () => {
        setupHashRouter({ useHashApi: true, handlers: { catalog: jest.fn() } });
        const newHandler = jest.fn();
        const pushSpy = jest.spyOn(window.history, "pushState");
        try {
            expect(() =>
                setupHashRouter({
                    useHashApi: true,
                    handlers: { catalog: newHandler },
                })
            ).not.toThrow();
            goToTab("catalog");
            expect(newHandler).toHaveBeenCalled();
        } finally {
            pushSpy.mockRestore();
        }
    });
});

describe("router — dispatchInitial", () => {
    beforeEach(() => {
        _resetRouter();
        setHash("");
    });

    test("returns tab name + empty set_sku when on tab hash", () => {
        setHash("history");
        setupHashRouter({ useHashApi: true, handlers: {} });
        const out = dispatchInitial();
        expect(out.tab).toBe("history");
        expect(out.set_sku).toBe("");
    });

    test("returns set_sku when overlay hash present", () => {
        setHash("detail-DNCSETFOO");
        setupHashRouter({ useHashApi: true, handlers: {} });
        const out = dispatchInitial();
        expect(out.set_sku).toBe("DNCSETFOO");
    });

    test("fires setDetail handler with sku when on overlay hash", () => {
        const setDetailH = jest.fn();
        setHash("detail-XYZ");
        setupHashRouter({
            useHashApi: true,
            handlers: { setDetail: setDetailH },
        });
        dispatchInitial();
        expect(setDetailH).toHaveBeenCalledWith("XYZ");
    });

    test("fires catalog handler by default", () => {
        const catalogH = jest.fn();
        setupHashRouter({
            useHashApi: true,
            handlers: { catalog: catalogH },
        });
        dispatchInitial();
        expect(catalogH).toHaveBeenCalled();
    });
});

describe("router — hashchange / popstate (SPA mode)", () => {
    beforeEach(() => {
        _resetRouter();
        setHash("");
    });

    test("hashchange to detail-<sku> dispatches setDetail handler", () => {
        const setDetailH = jest.fn();
        setupHashRouter({
            useHashApi: true,
            handlers: { setDetail: setDetailH },
        });
        setHash("detail-FOO");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        expect(setDetailH).toHaveBeenCalledWith("FOO");
    });

    test("hashchange to plain tab dispatches both close + tab handlers", () => {
        const closeH = jest.fn();
        const historyH = jest.fn();
        setupHashRouter({
            useHashApi: true,
            handlers: { closeSetDetail: closeH, history: historyH },
        });
        setHash("history");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        expect(closeH).toHaveBeenCalled();
        expect(historyH).toHaveBeenCalled();
    });

    test("listeners NOT wired when useHashApi=false", () => {
        const setDetailH = jest.fn();
        setupHashRouter({
            useHashApi: false,
            handlers: { setDetail: setDetailH },
        });
        setHash("detail-FOO");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        expect(setDetailH).not.toHaveBeenCalled();
    });

    test("popstate listener also re-dispatches", () => {
        const setDetailH = jest.fn();
        setupHashRouter({
            useHashApi: true,
            handlers: { setDetail: setDetailH },
        });
        setHash("detail-BAR");
        window.dispatchEvent(new PopStateEvent("popstate"));
        expect(setDetailH).toHaveBeenCalledWith("BAR");
    });
});
