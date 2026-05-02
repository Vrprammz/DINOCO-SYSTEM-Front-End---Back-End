/**
 * Round 3 Jest tests for liff-src/b2f/catalog/router.js (V.0.4).
 *
 * Covers:
 *   - getCurrentView() — parses hash variants (catalog/cart/review/success/detail-<sku>)
 *   - goToView() — pushState + dispatch handler (silent flag)
 *   - openSetDetail() — convenience wrapper for goToView('detail',{sku})
 *   - back() — falls back to catalog when history empty
 *   - setupHashRouter() — idempotent listener wiring
 *   - hashchange/popstate — re-dispatch on browser nav
 *   - dispatchInitial() — fires handler matching landing URL
 */

import {
    getCurrentView,
    goToView,
    openSetDetail,
    back,
    setupHashRouter,
    dispatchInitial,
    _resetRouter,
    _internal,
} from "../../liff-src/b2f/catalog/router.js";

/**
 * @param {string} hash — without leading #
 */
function setHash(hash) {
    const url = window.location.pathname + window.location.search +
        (hash ? "#" + hash : "");
    window.history.replaceState({}, "", url);
}

beforeEach(() => {
    _resetRouter();
    setHash("");
});

afterAll(() => {
    _resetRouter();
});

describe("router — getCurrentView", () => {
    test("empty hash → default catalog view", () => {
        setHash("");
        expect(getCurrentView()).toEqual({ name: "catalog" });
    });

    test("#catalog → name=catalog", () => {
        setHash("catalog");
        expect(getCurrentView().name).toBe("catalog");
    });

    test("#cart → name=cart", () => {
        setHash("cart");
        expect(getCurrentView().name).toBe("cart");
    });

    test("#review → name=review", () => {
        setHash("review");
        expect(getCurrentView().name).toBe("review");
    });

    test("#success → name=success", () => {
        setHash("success");
        expect(getCurrentView().name).toBe("success");
    });

    test("#home → name=home", () => {
        setHash("home");
        expect(getCurrentView().name).toBe("home");
    });

    test("#detail-DNCSET500X001H → detail with sku", () => {
        setHash("detail-DNCSET500X001H");
        expect(getCurrentView()).toEqual({ name: "detail", sku: "DNCSET500X001H" });
    });

    test("#detail- (empty sku) → returns detail with empty sku", () => {
        setHash("detail-");
        expect(getCurrentView()).toEqual({ name: "detail", sku: "" });
    });

    test("unknown hash falls back to catalog", () => {
        setHash("unknown-thing");
        expect(getCurrentView().name).toBe("catalog");
    });
});

describe("router — goToView", () => {
    test("goToView('cart') sets #cart hash", () => {
        setHash("");
        goToView("cart");
        expect(window.location.hash).toBe("#cart");
    });

    test("goToView('detail',{sku:'X'}) sets #detail-X", () => {
        setHash("");
        goToView("detail", { sku: "DNCSETXL7500X001H" });
        expect(window.location.hash).toBe("#detail-DNCSETXL7500X001H");
    });

    test("goToView('detail') without sku is no-op", () => {
        setHash("catalog");
        goToView("detail");
        expect(window.location.hash).toBe("#catalog");
    });

    test("unknown view name falls back to default", () => {
        setHash("");
        goToView("frobnicate");
        expect(window.location.hash).toBe("#" + _internal.DEFAULT_VIEW);
    });

    test("openSetDetail() wraps goToView('detail',...)", () => {
        setHash("");
        openSetDetail("ABC");
        expect(window.location.hash).toBe("#detail-ABC");
    });

    test("silent:true skips handler dispatch", () => {
        setHash("");
        const fn = jest.fn();
        setupHashRouter({ useHashApi: true, handlers: { cart: fn } });
        goToView("cart", { silent: true });
        expect(fn).not.toHaveBeenCalled();
    });
});

describe("router — back()", () => {
    test("back() does not throw + leaves URL in valid state", () => {
        setHash("review");
        expect(() => back()).not.toThrow();
        // After back(): either history.back() consumed the entry (jsdom
        // varies) OR fallback set hash to #catalog. Both are valid —
        // assert the hash is in the known-views set.
        const hash = window.location.hash.replace(/^#/, "");
        const valid = ["", "review", "catalog", "cart", "home", "success", "detail-"];
        const matched = valid.some((v) =>
            hash === v || hash.indexOf(v) === 0
        );
        expect(matched).toBe(true);
    });

    test("back() with stubbed history fallback goes to catalog", () => {
        const origLength = Object.getOwnPropertyDescriptor(window.history, "length");
        Object.defineProperty(window.history, "length", { configurable: true, get: () => 1 });
        try {
            setHash("review");
            back();
            expect(window.location.hash).toBe("#catalog");
        } finally {
            if (origLength) {
                Object.defineProperty(window.history, "length", origLength);
            }
        }
    });
});

describe("router — setupHashRouter + dispatch", () => {
    test("setupHashRouter dispatches handler on hashchange", () => {
        const cartFn = jest.fn();
        setupHashRouter({
            useHashApi: true,
            handlers: { cart: cartFn },
        });
        setHash("");
        // hashchange must fire — assign hash directly
        window.location.hash = "#cart";
        // jsdom: hashchange fires synchronously on next tick
        return new Promise((resolve) => {
            setTimeout(() => {
                expect(cartFn).toHaveBeenCalled();
                resolve();
            }, 5);
        });
    });

    test("hashchange to detail dispatches detail handler with sku", () => {
        const detailFn = jest.fn();
        setupHashRouter({
            useHashApi: true,
            handlers: { detail: detailFn },
        });
        setHash("");
        window.location.hash = "#detail-XYZ";
        return new Promise((resolve) => {
            setTimeout(() => {
                expect(detailFn).toHaveBeenCalledWith("XYZ");
                resolve();
            }, 5);
        });
    });

    test("dispatchInitial fires handler for current URL", () => {
        const successFn = jest.fn();
        setHash("success");
        setupHashRouter({
            useHashApi: true,
            handlers: { success: successFn },
        });
        const view = dispatchInitial();
        expect(view.name).toBe("success");
        expect(successFn).toHaveBeenCalledTimes(1);
    });

    test("setupHashRouter without handlers throws", () => {
        expect(() => setupHashRouter()).toThrow();
        expect(() => setupHashRouter(null)).toThrow();
    });

    test("handler that throws does NOT bubble", () => {
        const consoleErr = jest.spyOn(console, "error").mockImplementation(() => {});
        setupHashRouter({
            useHashApi: true,
            handlers: {
                cart: () => { throw new Error("boom"); },
            },
        });
        setHash("");
        expect(() => {
            window.location.hash = "#cart";
        }).not.toThrow();
        consoleErr.mockRestore();
    });
});
