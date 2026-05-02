/**
 * Phase 6 Jest tests for liff-src/liff-ai/frontend/router.js (V.0.4 Round 3).
 *
 * Covers:
 *   - getCurrentTab() — reads `?page=` from window.location, defaults to
 *     "dashboard" via defaultPageResolver.
 *   - getCurrentId() — reads `?id=` from URL.
 *   - goToTab(page, params) — pushState + dispatch handler.
 *   - openLeadDetail(id) / openClaimDetail(id) — sugar setters.
 *   - back() — uses history.back().
 *   - setupHashRouter({handlers, defaultPageResolver}) — wires popstate.
 *   - dispatchInitial() — fires handler matching current URL page.
 *
 * Production anchor: `[LIFF AI] Snippet 2: Frontend` V.3.10
 *   - lines 749-764: route(page, params) — page dispatch
 *   - lines 766-775: navigate(page, params) — pushState + dispatch
 */

import {
    getCurrentTab,
    getCurrentId,
    goToTab,
    openLeadDetail,
    openClaimDetail,
    back,
    setupHashRouter,
    dispatchInitial,
    _resetRouter,
} from "../../liff-src/liff-ai/frontend/router.js";

/** @param {string} qs */
function setSearch(qs) {
    const s = qs && !qs.startsWith("?") ? "?" + qs : qs || "";
    window.history.replaceState({}, "", "/test" + s);
}

describe("router — getCurrentTab", () => {
    beforeEach(() => {
        _resetRouter();
        setSearch("");
    });

    test("returns 'dashboard' when no query string + no resolver", () => {
        expect(getCurrentTab()).toBe("dashboard");
    });

    test("reads ?page= when present", () => {
        setSearch("page=lead");
        expect(getCurrentTab()).toBe("lead");
    });

    test("returns default for unknown page name", () => {
        setSearch("page=garbage");
        expect(getCurrentTab()).toBe("dashboard");
    });

    test("recognizes all 7 known pages", () => {
        const pages = ["dashboard", "dealer", "lead", "claim", "leads", "claims", "agent"];
        for (const p of pages) {
            setSearch("page=" + p);
            expect(getCurrentTab()).toBe(p);
        }
    });

    test("respects defaultPageResolver when ?page= absent", () => {
        setupHashRouter({
            handlers: {},
            defaultPageResolver: () => "dealer",
        });
        setSearch("");
        expect(getCurrentTab()).toBe("dealer");
    });

    test("falls back to dashboard when resolver throws", () => {
        setupHashRouter({
            handlers: {},
            defaultPageResolver: () => {
                throw new Error("boom");
            },
        });
        setSearch("");
        expect(getCurrentTab()).toBe("dashboard");
    });
});

describe("router — getCurrentId", () => {
    beforeEach(() => {
        _resetRouter();
        setSearch("");
    });

    test("returns '' when ?id= absent", () => {
        expect(getCurrentId()).toBe("");
    });

    test("returns the value of ?id=", () => {
        setSearch("page=lead&id=abc123");
        expect(getCurrentId()).toBe("abc123");
    });
});

describe("router — goToTab", () => {
    beforeEach(() => {
        _resetRouter();
        setSearch("");
    });

    test("pushState updates URL ?page=", () => {
        setupHashRouter({ handlers: {} });
        goToTab("claims");
        expect(window.location.search).toContain("page=claims");
    });

    test("dispatches handler for the page", () => {
        const fn = jest.fn();
        setupHashRouter({ handlers: { claims: fn } });
        goToTab("claims");
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test("falls back to default for unknown page", () => {
        setupHashRouter({
            handlers: {},
            defaultPageResolver: () => "dealer",
        });
        goToTab("garbage");
        expect(window.location.search).toContain("page=dealer");
    });

    test("merges params into URL", () => {
        setupHashRouter({ handlers: {} });
        goToTab("lead", { id: "lead-42" });
        expect(window.location.search).toContain("page=lead");
        expect(window.location.search).toContain("id=lead-42");
    });

    test("strips stale ?id= when navigating away from detail page", () => {
        setSearch("page=lead&id=42");
        setupHashRouter({ handlers: {} });
        goToTab("dashboard");
        expect(window.location.search).not.toContain("id=42");
        expect(window.location.search).toContain("page=dashboard");
    });

    test("preserves ?id= when navigating to lead/claim detail", () => {
        setupHashRouter({ handlers: {} });
        goToTab("lead", { id: "abc" });
        expect(window.location.search).toContain("id=abc");
        goToTab("claim", { id: "xyz" });
        expect(window.location.search).toContain("id=xyz");
    });
});

describe("router — openLeadDetail / openClaimDetail / back", () => {
    beforeEach(() => {
        _resetRouter();
        setSearch("");
    });

    test("openLeadDetail sets page=lead + id", () => {
        setupHashRouter({ handlers: {} });
        openLeadDetail("L42");
        expect(window.location.search).toContain("page=lead");
        expect(window.location.search).toContain("id=L42");
    });

    test("openClaimDetail sets page=claim + id", () => {
        setupHashRouter({ handlers: {} });
        openClaimDetail(99);
        expect(window.location.search).toContain("page=claim");
        expect(window.location.search).toContain("id=99");
    });

    test("back falls through without throwing when no history", () => {
        setupHashRouter({ handlers: {} });
        // jsdom's history is non-empty (test runner navigations); back() just calls history.back
        expect(() => back()).not.toThrow();
    });
});

describe("router — popstate", () => {
    beforeEach(() => {
        _resetRouter();
        setSearch("");
    });

    test("popstate re-dispatches based on URL", () => {
        const fn = jest.fn();
        setupHashRouter({ handlers: { agent: fn } });
        // Simulate popstate to a new URL
        window.history.replaceState({}, "", "/test?page=agent");
        window.dispatchEvent(new PopStateEvent("popstate"));
        expect(fn).toHaveBeenCalled();
    });

    test("setupHashRouter is idempotent — re-wiring does not double-fire", () => {
        const fn = jest.fn();
        setupHashRouter({ handlers: { dashboard: fn } });
        setupHashRouter({ handlers: { dashboard: fn } });
        setSearch("page=dashboard");
        window.dispatchEvent(new PopStateEvent("popstate"));
        expect(fn).toHaveBeenCalledTimes(1);
    });
});

describe("router — dispatchInitial", () => {
    beforeEach(() => {
        _resetRouter();
        setSearch("");
    });

    test("returns resolved page + id", () => {
        setupHashRouter({ handlers: {} });
        setSearch("page=lead&id=L7");
        const r = dispatchInitial();
        expect(r.page).toBe("lead");
        expect(r.id).toBe("L7");
    });

    test("dispatches handler for current page", () => {
        const fn = jest.fn();
        setupHashRouter({ handlers: { claims: fn } });
        setSearch("page=claims");
        dispatchInitial();
        expect(fn).toHaveBeenCalled();
    });

    test("handler errors are swallowed", () => {
        const fn = jest.fn(() => {
            throw new Error("boom");
        });
        setupHashRouter({ handlers: { claims: fn } });
        setSearch("page=claims");
        const consoleErr = jest.spyOn(console, "error").mockImplementation(() => {});
        expect(() => dispatchInitial()).not.toThrow();
        consoleErr.mockRestore();
    });
});
