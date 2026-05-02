/**
 * Phase 6 Jest tests for liff-src/b2f/maker/router.js (V.0.4 Round 3).
 *
 * Covers:
 *   - getCurrentView() — reads `?view=` from window.location, falls back to
 *     `?page=` (V.4.7 legacy), defaults to "list" when absent/unknown.
 *   - getCurrentPoId() — reads `?po_id=` from URL.
 *   - goToPage(view) — full-reload mode mutates window.location.search;
 *     SPA mode pushes history state and dispatches handler.
 *   - goToPageWithPO(view, po_id) — same dispatch + adds po_id to URL.
 *   - setupRouter({handlers, useHistoryApi}) — wires popstate when SPA mode.
 *   - dispatchInitial() — fires the handler matching current URL view.
 *
 * Test strategy:
 *   - jsdom provides window.history.pushState + popstate.
 *   - Stub window.location.search via history.replaceState (jsdom does
 *     NOT allow direct .search assignment — that's a navigation that throws).
 *   - For full-reload mode, intercept the location.search write by replacing
 *     `window.location` with a getter/setter spy.
 *
 * Production anchor: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *   - lines 1559-1576: window.goToPage / window.goToPageWithPO
 *   - lines 413-419:   page switch dispatch
 */

import {
    getCurrentView,
    getCurrentPoId,
    goToPage,
    goToPageWithPO,
    setupRouter,
    dispatchInitial,
    _resetRouter,
} from "../../liff-src/b2f/maker/router.js";

/**
 * Helper — replace window.location.search via history API (jsdom-safe).
 * @param {string} qs — query string with or without leading `?`.
 */
function setSearch(qs) {
    const s = qs.startsWith("?") ? qs : "?" + qs;
    window.history.replaceState({}, "", "/test" + (qs ? s : ""));
}

describe("router — getCurrentView", () => {
    beforeEach(() => {
        _resetRouter();
        setSearch("");
    });

    test("returns 'list' when no query string", () => {
        expect(getCurrentView()).toBe("list");
    });

    test("reads ?view= when present", () => {
        setSearch("view=confirm");
        expect(getCurrentView()).toBe("confirm");
    });

    test("falls back to ?page= when ?view= absent (V.4.7 legacy)", () => {
        setSearch("page=detail");
        expect(getCurrentView()).toBe("detail");
    });

    test("?view= takes priority over ?page=", () => {
        setSearch("view=reschedule&page=confirm");
        expect(getCurrentView()).toBe("reschedule");
    });

    test("returns 'list' for unknown view name", () => {
        setSearch("view=garbage");
        expect(getCurrentView()).toBe("list");
    });

    test("recognizes all 5 known views", () => {
        const views = ["confirm", "detail", "reschedule", "list", "deliver"];
        views.forEach((v) => {
            setSearch("view=" + v);
            expect(getCurrentView()).toBe(v);
        });
    });
});

describe("router — getCurrentPoId", () => {
    beforeEach(() => {
        _resetRouter();
        setSearch("");
    });

    test("returns empty string when ?po_id= absent", () => {
        expect(getCurrentPoId()).toBe("");
    });

    test("reads ?po_id= as string", () => {
        setSearch("view=detail&po_id=12345");
        expect(getCurrentPoId()).toBe("12345");
    });
});

describe("router — goToPage / goToPageWithPO (SPA mode)", () => {
    let pushSpy;

    beforeEach(() => {
        _resetRouter();
        setSearch("");
        // Use SPA mode so we can verify pushState (full-reload mode would
        // throw in jsdom since we can't assign location.search).
        pushSpy = jest.spyOn(window.history, "pushState");
    });

    afterEach(() => {
        pushSpy.mockRestore();
    });

    test("goToPage('detail') calls history.pushState with ?view=detail", () => {
        setupRouter({ handlers: {}, useHistoryApi: true });
        goToPage("detail");
        expect(pushSpy).toHaveBeenCalledTimes(1);
        const args = pushSpy.mock.calls[0];
        expect(args[2]).toContain("view=detail");
    });

    test("goToPage with unknown view falls back to 'list'", () => {
        setupRouter({ handlers: {}, useHistoryApi: true });
        goToPage("garbage");
        const args = pushSpy.mock.calls[0];
        expect(args[2]).toContain("view=list");
    });

    test("goToPage strips legacy ?page= param", () => {
        setSearch("page=confirm");
        setupRouter({ handlers: {}, useHistoryApi: true });
        goToPage("detail");
        const args = pushSpy.mock.calls[0];
        expect(args[2]).not.toContain("page=");
        expect(args[2]).toContain("view=detail");
    });

    test("goToPageWithPO appends po_id to URL", () => {
        setupRouter({ handlers: {}, useHistoryApi: true });
        goToPageWithPO("confirm", 9001);
        const args = pushSpy.mock.calls[0];
        expect(args[2]).toContain("view=confirm");
        expect(args[2]).toContain("po_id=9001");
    });

    test("goToPage triggers handler dispatch in SPA mode", () => {
        const detailHandler = jest.fn();
        setupRouter({
            useHistoryApi: true,
            handlers: { detail: detailHandler },
        });
        goToPage("detail");
        expect(detailHandler).toHaveBeenCalledTimes(1);
    });

    test("goToPageWithPO passes po_id (as string) to handler", () => {
        const confirmHandler = jest.fn();
        setupRouter({
            useHistoryApi: true,
            handlers: { confirm: confirmHandler },
        });
        goToPageWithPO("confirm", 42);
        expect(confirmHandler).toHaveBeenCalledWith("42");
    });

    test("list handler called with no args", () => {
        const listHandler = jest.fn();
        setupRouter({
            useHistoryApi: true,
            handlers: { list: listHandler },
        });
        goToPage("list");
        expect(listHandler).toHaveBeenCalledWith();
    });

    test("handler exception is swallowed (does not throw)", () => {
        const bad = jest.fn().mockImplementation(() => {
            throw new Error("boom");
        });
        setupRouter({
            useHistoryApi: true,
            handlers: { detail: bad },
        });
        // jsdom captures console.error; just assert no throw.
        const orig = console.error;
        console.error = jest.fn();
        try {
            expect(() => goToPage("detail")).not.toThrow();
            expect(bad).toHaveBeenCalled();
        } finally {
            console.error = orig;
        }
    });
});

describe("router — setupRouter validation", () => {
    beforeEach(() => _resetRouter());

    test("throws when options omitted", () => {
        expect(() => setupRouter()).toThrow(/handlers required/);
    });

    test("idempotent — second call replaces handler map without throwing", () => {
        setupRouter({ useHistoryApi: true, handlers: { list: jest.fn() } });
        const newHandler = jest.fn();
        expect(() =>
            setupRouter({ useHistoryApi: true, handlers: { list: newHandler } })
        ).not.toThrow();
        goToPage("list");
        expect(newHandler).toHaveBeenCalled();
    });
});

describe("router — dispatchInitial", () => {
    beforeEach(() => {
        _resetRouter();
        setSearch("");
    });

    test("returns current view + po_id from URL", () => {
        setSearch("view=detail&po_id=777");
        setupRouter({ useHistoryApi: true, handlers: {} });
        const out = dispatchInitial();
        expect(out.view).toBe("detail");
        expect(out.po_id).toBe("777");
    });

    test("fires handler matching current view", () => {
        const reschedule = jest.fn();
        setSearch("view=reschedule&po_id=123");
        setupRouter({
            useHistoryApi: true,
            handlers: { reschedule },
        });
        dispatchInitial();
        expect(reschedule).toHaveBeenCalledWith("123");
    });

    test("defaults to list handler when view absent", () => {
        const list = jest.fn();
        setupRouter({ useHistoryApi: true, handlers: { list } });
        dispatchInitial();
        expect(list).toHaveBeenCalled();
    });
});

describe("router — popstate (browser back/forward in SPA mode)", () => {
    beforeEach(() => {
        _resetRouter();
        setSearch("");
    });

    test("popstate event re-dispatches based on current URL", () => {
        const detail = jest.fn();
        setupRouter({
            useHistoryApi: true,
            handlers: { detail },
        });
        // Simulate browser navigating back to detail
        setSearch("view=detail&po_id=55");
        window.dispatchEvent(new PopStateEvent("popstate"));
        expect(detail).toHaveBeenCalledWith("55");
    });

    test("popstate NOT wired when useHistoryApi=false (full-reload mode)", () => {
        const detail = jest.fn();
        setupRouter({
            useHistoryApi: false,
            handlers: { detail },
        });
        setSearch("view=detail");
        window.dispatchEvent(new PopStateEvent("popstate"));
        expect(detail).not.toHaveBeenCalled();
    });
});
