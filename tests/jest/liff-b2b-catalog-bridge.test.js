/**
 * Round 4 Jest tests — bridge cleanup + event delegation (B2B Catalog).
 *
 * Covers `liff-src/b2b/catalog/event-delegation.js` (V.0.5):
 *   - setupEventDelegation(root, deps) wires one click + change listener
 *   - Dispatches via [data-action] / [data-stepact] / [data-rmsku] /
 *     [data-cancel] / [data-reorder] / [data-claim] attributes
 *   - Click bubbling — inner children resolve via closest()
 *   - Cleanup function removes both listeners (idempotent)
 *   - Handler errors swallowed (console.error) — listener stays alive
 *   - Unknown / missing data-action attributes are ignored
 *   - Stepper input/min/max clamping (1-999)
 *
 * Plus `liff-src/b2b/catalog/entry.js` V.0.5 contract assertions:
 *   - Source code MUST NOT assign window.B2B_CATALOG_* globals (12 keys)
 *     (drift detector — fails CI when legacy bridge reappears)
 *   - Source code MUST NOT expose `helpers` / `renderers` / `loaders`
 *     surfaces on `window.DINOCO_B2B_CATALOG`
 *   - Pages MUST NOT contain inline `onclick=` (event delegation only)
 *
 * Test strategy:
 *   - Import event-delegation.js directly (no CSS dep, no auto-bootstrap)
 *   - Use plain jest.fn() for deps — verify dispatch reaches the right one
 *   - Source-level scan via fs.readFileSync to verify no legacy globals
 *     remain in entry.js / pages/* (bypasses CSS import limitation)
 *
 * Production anchor: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 * (inline JS being replaced via flag-gated cutover).
 */

import { setupEventDelegation } from "../../liff-src/b2b/catalog/event-delegation.js";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "../..");
const ENTRY_PATH = path.join(REPO, "liff-src/b2b/catalog/entry.js");
const PAGES_DIR = path.join(REPO, "liff-src/b2b/catalog/pages");
const LOADERS_DIR = path.join(REPO, "liff-src/b2b/catalog/loaders");

/**
 * Mount fresh `#b2b-catalog-app` div for each test.
 */
function mountApp() {
    document.body.innerHTML = '<div id="b2b-catalog-app"></div>';
}

/**
 * Build a deps bag with jest.fn() for every supported action.
 */
function makeDeps() {
    return {
        goTab: jest.fn(),
        openSetDetail: jest.fn(),
        addToCart: jest.fn(),
        increment: jest.fn(),
        decrement: jest.fn(),
        removeFromCart: jest.fn(),
        setHistoryFilter: jest.fn(),
        loadMore: jest.fn(),
        setModelView: jest.fn(),
        setCategoryView: jest.fn(),
        setCrossFilter: jest.fn(),
        cancelOrder: jest.fn(),
        reorder: jest.fn(),
        openClaim: jest.fn(),
        openTicket: jest.fn(),
        addSet: jest.fn(),
        subItemStep: jest.fn(),
        subItemReveal: jest.fn(),
        stepperInput: jest.fn(),
        back: jest.fn(),
    };
}

/**
 * Inject HTML into #b2b-catalog-app and return the root element.
 * @param {string} html
 * @returns {HTMLElement}
 */
function inject(html) {
    const root = /** @type {HTMLElement} */ (
        document.getElementById("b2b-catalog-app")
    );
    root.innerHTML = html;
    return root;
}

/**
 * Click an element by selector. Uses bubbling click event.
 * @param {string} selector
 */
function click(selector) {
    const el = /** @type {HTMLElement|null} */ (
        document.querySelector(selector)
    );
    if (!el) throw new Error(`click(): no element matched "${selector}"`);
    el.click();
}

/**
 * Dispatch a change event on an element.
 * @param {string} selector
 */
function change(selector) {
    const el = /** @type {HTMLElement|null} */ (
        document.querySelector(selector)
    );
    if (!el) throw new Error(`change(): no element matched "${selector}"`);
    el.dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(() => {
    mountApp();
});

// ─────────────────────────────────────────────────────────────────────
// 1. Basic contract
// ─────────────────────────────────────────────────────────────────────
describe("setupEventDelegation — basic contract", () => {
    test("returns a cleanup function", () => {
        const root = inject("");
        const cleanup = setupEventDelegation(root, makeDeps());
        expect(typeof cleanup).toBe("function");
        cleanup();
    });

    test("noop when root null", () => {
        const cleanup = setupEventDelegation(null, makeDeps());
        expect(typeof cleanup).toBe("function");
        expect(() => cleanup()).not.toThrow();
    });

    test("noop when root undefined", () => {
        const cleanup = setupEventDelegation(undefined, makeDeps());
        expect(typeof cleanup).toBe("function");
        expect(() => cleanup()).not.toThrow();
    });

    test("noop when root lacks addEventListener", () => {
        const cleanup = setupEventDelegation(
            /** @type {any} */ ({}),
            makeDeps()
        );
        expect(typeof cleanup).toBe("function");
        expect(() => cleanup()).not.toThrow();
    });

    test("noop when deps null", () => {
        const root = inject("");
        const cleanup = setupEventDelegation(root, /** @type {any} */ (null));
        expect(typeof cleanup).toBe("function");
        expect(() => cleanup()).not.toThrow();
    });

    test("cleanup removes click + change listeners", () => {
        const root = inject(
            '<button data-action="add" data-sku="X">+</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        click('[data-action="add"]');
        expect(deps.addToCart).toHaveBeenCalledTimes(1);
        cleanup();
        click('[data-action="add"]');
        expect(deps.addToCart).toHaveBeenCalledTimes(1); // not invoked again
    });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Catalog grid — data-action="add"/"plus"/"minus"/"detail"
// ─────────────────────────────────────────────────────────────────────
describe("setupEventDelegation — catalog grid actions", () => {
    test("data-action=add dispatches addToCart(sku, 1)", () => {
        inject('<button data-action="add" data-sku="ABC123">+</button>');
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-action="add"]');
        expect(deps.addToCart).toHaveBeenCalledWith("ABC123", 1);
    });

    test("data-action=plus dispatches increment(sku)", () => {
        inject('<button data-action="plus" data-sku="X">+</button>');
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-action="plus"]');
        expect(deps.increment).toHaveBeenCalledWith("X");
    });

    test("data-action=minus dispatches decrement(sku)", () => {
        inject('<button data-action="minus" data-sku="Y">−</button>');
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-action="minus"]');
        expect(deps.decrement).toHaveBeenCalledWith("Y");
    });

    test("data-action=detail dispatches openSetDetail(sku)", () => {
        inject(
            '<button data-action="detail" data-sku="DNCSET001">ดูชุด</button>'
        );
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-action="detail"]');
        expect(deps.openSetDetail).toHaveBeenCalledWith("DNCSET001");
    });

    test("missing data-sku → no dispatch", () => {
        inject('<button data-action="add">+</button>');
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-action="add"]');
        expect(deps.addToCart).not.toHaveBeenCalled();
    });

    test("click bubbles up from inner span", () => {
        inject(
            '<button data-action="add" data-sku="X"><span class="inner">+</span></button>'
        );
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click("span.inner");
        expect(deps.addToCart).toHaveBeenCalledWith("X", 1);
    });
});

// ─────────────────────────────────────────────────────────────────────
// 3. Home page — set-model-view / set-category-view / set-cross-filter
// ─────────────────────────────────────────────────────────────────────
describe("setupEventDelegation — home page actions", () => {
    test("set-model-view dispatches setModelView(name)", () => {
        inject(
            '<div data-action="set-model-view" data-model-name="NX500"></div>'
        );
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-action="set-model-view"]');
        expect(deps.setModelView).toHaveBeenCalledWith("NX500");
    });

    test("set-category-view dispatches setCategoryView(name)", () => {
        inject(
            '<div data-action="set-category-view" data-cat-name="กันล้ม"></div>'
        );
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-action="set-category-view"]');
        expect(deps.setCategoryView).toHaveBeenCalledWith("กันล้ม");
    });

    test("set-cross-filter dispatches setCrossFilter(value)", () => {
        inject(
            '<button data-action="set-cross-filter" data-cross="CRF300L">L</button>'
        );
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-action="set-cross-filter"]');
        expect(deps.setCrossFilter).toHaveBeenCalledWith("CRF300L");
    });

    test('cross-filter "ทั้งหมด" with empty value clears the filter', () => {
        inject(
            '<button data-action="set-cross-filter" data-cross="">ทั้งหมด</button>'
        );
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-action="set-cross-filter"]');
        expect(deps.setCrossFilter).toHaveBeenCalledWith("");
    });
});

// ─────────────────────────────────────────────────────────────────────
// 4. History page — filter chips + load more + card actions
// ─────────────────────────────────────────────────────────────────────
describe("setupEventDelegation — history actions", () => {
    test("set-history-filter dispatches setHistoryFilter(key)", () => {
        inject(
            '<button data-action="set-history-filter" data-filter="paid">จ่ายแล้ว</button>'
        );
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-action="set-history-filter"]');
        expect(deps.setHistoryFilter).toHaveBeenCalledWith("paid");
    });

    test("load-more dispatches loadMore()", () => {
        inject(
            '<button data-action="load-more">โหลดเพิ่ม</button>'
        );
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-action="load-more"]');
        expect(deps.loadMore).toHaveBeenCalled();
    });

    test("data-cancel dispatches cancelOrder(id)", () => {
        inject('<button data-cancel="1234">ยกเลิก</button>');
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-cancel]');
        expect(deps.cancelOrder).toHaveBeenCalledWith("1234");
    });

    test("data-reorder dispatches reorder(id)", () => {
        inject('<button data-reorder="5678">สั่งซ้ำ</button>');
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-reorder]');
        expect(deps.reorder).toHaveBeenCalledWith("5678");
    });

    test("data-claim dispatches openClaim(id)", () => {
        inject('<button data-claim="9999">เคลม</button>');
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-claim]');
        expect(deps.openClaim).toHaveBeenCalledWith("9999");
    });

    test(".b2b-cat-hbtn.detail with data-view dispatches openTicket(url)", () => {
        inject(
            '<button class="b2b-cat-hbtn detail" data-view="/ticket/abc">ดู</button>'
        );
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click(".b2b-cat-hbtn.detail");
        expect(deps.openTicket).toHaveBeenCalledWith("/ticket/abc");
    });
});

// ─────────────────────────────────────────────────────────────────────
// 5. Cart modal — remove + recommended chips
// ─────────────────────────────────────────────────────────────────────
describe("setupEventDelegation — cart modal actions", () => {
    test("data-rmsku dispatches removeFromCart(sku)", () => {
        inject(
            '<button class="b2b-cart-remove-btn" data-rmsku="ABC">🗑️</button>'
        );
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-rmsku]');
        expect(deps.removeFromCart).toHaveBeenCalledWith("ABC");
    });

    test("data-action=add-recommended dispatches addToCart(sku, 1)", () => {
        inject(
            '<div class="b2b-cat-freq-chip" data-action="add-recommended" data-sku="ABC"></div>'
        );
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-action="add-recommended"]');
        expect(deps.addToCart).toHaveBeenCalledWith("ABC", 1);
    });

    test("click on inner emoji bubbles up to remove button", () => {
        inject(
            '<button class="b2b-cart-remove-btn" data-rmsku="X">' +
                '<span aria-hidden="true">🗑️</span></button>'
        );
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click("span[aria-hidden]");
        expect(deps.removeFromCart).toHaveBeenCalledWith("X");
    });
});

// ─────────────────────────────────────────────────────────────────────
// 6. SET Detail stepper — minus / plus / add / input / sub-add reveal
// ─────────────────────────────────────────────────────────────────────
describe("setupEventDelegation — SET Detail stepper", () => {
    function renderMainStepper(sku, qty) {
        return (
            '<div class="b2b-qty-stepper" data-stepsku="' + sku +
            '" data-setmain="1">' +
            '<button data-stepact="minus">−</button>' +
            '<input class="b2b-qty-stepper-input" data-stepact="input" ' +
            'value="' + qty + '">' +
            '<button data-stepact="plus">+</button>' +
            '<button data-stepact="add">+ ชุดเต็ม</button>' +
            "</div>"
        );
    }

    function renderSubStepper(sku, qty) {
        return (
            '<div class="b2b-qty-stepper" data-stepsku="' + sku + '">' +
            '<button data-stepact="minus">−</button>' +
            '<input class="b2b-qty-stepper-input" data-stepact="input" ' +
            'value="' + qty + '">' +
            '<button data-stepact="plus">+</button>' +
            '<button data-stepact="add">+ เพิ่ม</button>' +
            "</div>"
        );
    }

    test("main stepper add dispatches addSet(sku, qty)", () => {
        inject(renderMainStepper("DNCSETXX", 3));
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-stepact="add"]');
        expect(deps.addSet).toHaveBeenCalledWith("DNCSETXX", 3);
    });

    test("main stepper plus dispatches stepperInput(sku, qty+1)", () => {
        inject(renderMainStepper("DNCSETXX", 5));
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-stepact="plus"]');
        expect(deps.stepperInput).toHaveBeenCalledWith("DNCSETXX", 6);
    });

    test("main stepper minus dispatches stepperInput(sku, qty-1)", () => {
        inject(renderMainStepper("DNCSETXX", 5));
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-stepact="minus"]');
        expect(deps.stepperInput).toHaveBeenCalledWith("DNCSETXX", 4);
    });

    test("main stepper minus clamps at 1", () => {
        inject(renderMainStepper("DNCSETXX", 1));
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-stepact="minus"]');
        expect(deps.stepperInput).toHaveBeenCalledWith("DNCSETXX", 1);
    });

    test("main stepper plus clamps at 999", () => {
        inject(renderMainStepper("DNCSETXX", 999));
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-stepact="plus"]');
        expect(deps.stepperInput).toHaveBeenCalledWith("DNCSETXX", 999);
    });

    test("sub-item stepper add dispatches addToCart(sku, qty)", () => {
        inject(renderSubStepper("CHILD1", 2));
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-stepact="add"]');
        expect(deps.addToCart).toHaveBeenCalledWith("CHILD1", 2);
    });

    test("sub-item stepper plus dispatches subItemStep(sku, 'plus')", () => {
        inject(renderSubStepper("CHILD1", 1));
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-stepact="plus"]');
        expect(deps.subItemStep).toHaveBeenCalledWith("CHILD1", "plus");
    });

    test("sub-item stepper minus dispatches subItemStep(sku, 'minus')", () => {
        inject(renderSubStepper("CHILD1", 2));
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-stepact="minus"]');
        expect(deps.subItemStep).toHaveBeenCalledWith("CHILD1", "minus");
    });

    test("data-subaddsku dispatches subItemReveal(sku)", () => {
        inject(
            '<button data-subaddsku="GRANDCHILD1">+ สั่งแยก</button>'
        );
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-subaddsku]');
        expect(deps.subItemReveal).toHaveBeenCalledWith("GRANDCHILD1");
    });

    test("data-subaddsku falls back to addToCart when no reveal handler", () => {
        inject('<button data-subaddsku="GC1">+ สั่งแยก</button>');
        const deps = makeDeps();
        delete deps.subItemReveal;
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click('[data-subaddsku]');
        expect(deps.addToCart).toHaveBeenCalledWith("GC1", 1);
    });

    test("input change dispatches stepperInput(sku, val)", () => {
        inject(renderMainStepper("DNCSETXX", 1));
        const input = /** @type {HTMLInputElement} */ (
            document.querySelector(".b2b-qty-stepper-input")
        );
        input.value = "42";
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        change(".b2b-qty-stepper-input");
        expect(deps.stepperInput).toHaveBeenCalledWith("DNCSETXX", 42);
    });

    test("input change clamps to 999", () => {
        inject(renderMainStepper("DNCSETXX", 1));
        const input = /** @type {HTMLInputElement} */ (
            document.querySelector(".b2b-qty-stepper-input")
        );
        input.value = "9999";
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        change(".b2b-qty-stepper-input");
        expect(deps.stepperInput).toHaveBeenCalledWith("DNCSETXX", 999);
    });

    test("input change clamps to 1 when input empty", () => {
        inject(renderMainStepper("DNCSETXX", 1));
        const input = /** @type {HTMLInputElement} */ (
            document.querySelector(".b2b-qty-stepper-input")
        );
        input.value = "";
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        change(".b2b-qty-stepper-input");
        expect(deps.stepperInput).toHaveBeenCalledWith("DNCSETXX", 1);
    });
});

// ─────────────────────────────────────────────────────────────────────
// 7. Resilience — error swallow + unknown actions
// ─────────────────────────────────────────────────────────────────────
describe("setupEventDelegation — resilience", () => {
    test("handler errors are swallowed via console.error", () => {
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        inject('<button data-action="add" data-sku="X"></button>');
        const deps = makeDeps();
        deps.addToCart = jest.fn(() => {
            throw new Error("boom");
        });
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        expect(() => click('[data-action="add"]')).not.toThrow();
        expect(errSpy).toHaveBeenCalled();
        errSpy.mockRestore();
    });

    test("unknown data-action is ignored", () => {
        inject('<button data-action="blah-unknown">x</button>');
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        expect(() => click('[data-action="blah-unknown"]')).not.toThrow();
        Object.values(deps).forEach((fn) =>
            expect(fn).not.toHaveBeenCalled()
        );
    });

    test("click on element without any data-action does nothing", () => {
        inject('<button class="random">x</button>');
        const deps = makeDeps();
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click(".random");
        Object.values(deps).forEach((fn) =>
            expect(fn).not.toHaveBeenCalled()
        );
    });

    test("missing handler in deps bag is silently skipped", () => {
        inject('<button data-action="load-more">x</button>');
        const deps = makeDeps();
        delete deps.loadMore;
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        expect(() => click('[data-action="load-more"]')).not.toThrow();
    });

    test("listener stays alive after error", () => {
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        inject(
            '<button data-action="add" data-sku="A" id="b1"></button>' +
                '<button data-action="plus" data-sku="B" id="b2"></button>'
        );
        const deps = makeDeps();
        let calls = 0;
        deps.addToCart = jest.fn(() => {
            calls++;
            throw new Error("boom");
        });
        setupEventDelegation(document.getElementById("b2b-catalog-app"), deps);
        click("#b1"); // throws
        click("#b2"); // should still work
        expect(calls).toBe(1);
        expect(deps.increment).toHaveBeenCalledWith("B");
        errSpy.mockRestore();
    });
});

// ─────────────────────────────────────────────────────────────────────
// 8. Drift detector — entry.js V.0.5 contract assertions
// ─────────────────────────────────────────────────────────────────────
describe("entry.js V.0.5 — bridge cleanup drift detector", () => {
    /** @type {string} */
    let entrySrc;

    beforeAll(() => {
        entrySrc = fs.readFileSync(ENTRY_PATH, "utf8");
    });

    test("VERSION bumped to V.0.5", () => {
        expect(entrySrc).toMatch(/const VERSION\s*=\s*["']V\.0\.5["']/);
    });

    test("legacy w.B2B_CATALOG_GO_TO_TAB removed", () => {
        expect(entrySrc).not.toMatch(/B2B_CATALOG_GO_TO_TAB\s*=/);
    });

    test("legacy w.B2B_CATALOG_OPEN_SET_DETAIL removed", () => {
        expect(entrySrc).not.toMatch(/B2B_CATALOG_OPEN_SET_DETAIL\s*=/);
    });

    test("legacy w.B2B_CATALOG_CLOSE_SET_DETAIL removed", () => {
        expect(entrySrc).not.toMatch(/B2B_CATALOG_CLOSE_SET_DETAIL\s*=/);
    });

    test("legacy w.B2B_CATALOG_ADD_TO_CART removed", () => {
        expect(entrySrc).not.toMatch(/B2B_CATALOG_ADD_TO_CART\s*=/);
    });

    test("legacy w.B2B_CATALOG_INCREMENT removed", () => {
        expect(entrySrc).not.toMatch(/B2B_CATALOG_INCREMENT\s*=/);
    });

    test("legacy w.B2B_CATALOG_DECREMENT removed", () => {
        expect(entrySrc).not.toMatch(/B2B_CATALOG_DECREMENT\s*=/);
    });

    test("legacy w.B2B_CATALOG_HISTORY_FILTER removed", () => {
        expect(entrySrc).not.toMatch(/B2B_CATALOG_HISTORY_FILTER\s*=/);
    });

    test("legacy w.B2B_CATALOG_LOAD_MORE removed", () => {
        expect(entrySrc).not.toMatch(/B2B_CATALOG_LOAD_MORE\s*=/);
    });

    test("legacy w.B2B_CATALOG_SUBMIT_ORDER removed", () => {
        expect(entrySrc).not.toMatch(/B2B_CATALOG_SUBMIT_ORDER\s*=/);
    });

    test("legacy w.B2B_CATALOG_CART_REMOVE removed", () => {
        expect(entrySrc).not.toMatch(/B2B_CATALOG_CART_REMOVE\s*=/);
    });

    test("legacy w.B2B_CATALOG_ADD_SET removed", () => {
        expect(entrySrc).not.toMatch(/B2B_CATALOG_ADD_SET\s*=/);
    });

    test("legacy w.B2B_CATALOG_SUB_STEP removed", () => {
        expect(entrySrc).not.toMatch(/B2B_CATALOG_SUB_STEP\s*=/);
    });

    test("`helpers` parallel surface removed from DINOCO_B2B_CATALOG", () => {
        // Allow `helpers` in JSDoc / comments, but reject `helpers:`
        // assignments (object literal key) in code.
        const codeOnly = entrySrc.replace(/\/\*[\s\S]*?\*\//g, "");
        expect(codeOnly).not.toMatch(/\bhelpers:\s*Object\.freeze/);
    });

    test("`renderers` parallel surface removed from DINOCO_B2B_CATALOG", () => {
        const codeOnly = entrySrc.replace(/\/\*[\s\S]*?\*\//g, "");
        expect(codeOnly).not.toMatch(/\brenderers:\s*Object\.freeze/);
    });

    test("`loaders` parallel surface removed from DINOCO_B2B_CATALOG", () => {
        const codeOnly = entrySrc.replace(/\/\*[\s\S]*?\*\//g, "");
        expect(codeOnly).not.toMatch(/\bloaders:\s*Object\.freeze/);
    });

    test("DINOCO_B2B_CATALOG namespace still exposed", () => {
        expect(entrySrc).toMatch(/window\.DINOCO_B2B_CATALOG\s*=/);
    });

    test("DINOCO_B2B_CATALOG namespace is frozen", () => {
        expect(entrySrc).toMatch(
            /window\.DINOCO_B2B_CATALOG\s*=\s*Object\.freeze/
        );
    });

    test("setupEventDelegation imported", () => {
        expect(entrySrc).toMatch(
            /import\s*\{\s*setupEventDelegation\s*\}\s*from\s*["']\.\/event-delegation\.js["']/
        );
    });

    test("setupEventDelegation invoked in bootstrap", () => {
        expect(entrySrc).toMatch(/setupEventDelegation\(\s*root/);
    });
});

// ─────────────────────────────────────────────────────────────────────
// 9. Drift detector — pages MUST NOT contain inline onclick="..."
// ─────────────────────────────────────────────────────────────────────
describe("pages/* drift — no inline onclick=", () => {
    /** @returns {Array<string>} */
    function listPages() {
        return fs
            .readdirSync(PAGES_DIR)
            .filter((f) => f.endsWith(".js"))
            .map((f) => path.join(PAGES_DIR, f));
    }

    listPages().forEach((file) => {
        const name = path.basename(file);
        test(`pages/${name} has no inline onclick=`, () => {
            const src = fs.readFileSync(file, "utf8");
            // Strip JSDoc + line comments before scanning so doc references
            // to inline V.32.9 onclick patterns don't trigger false positives.
            const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, "");
            const noLineComments = noBlockComments.replace(
                /^\s*\/\/.*$/gm,
                ""
            );
            // Also strip lines that obviously document inline behavior
            // (e.g. " *     V.32.9 still uses `card.onclick=`...").
            expect(noLineComments).not.toMatch(/\bonclick\s*=/i);
        });
    });

    /** @returns {Array<string>} */
    function listLoaders() {
        return fs
            .readdirSync(LOADERS_DIR)
            .filter((f) => f.endsWith(".js"))
            .map((f) => path.join(LOADERS_DIR, f));
    }

    listLoaders().forEach((file) => {
        const name = path.basename(file);
        test(`loaders/${name} has no inline onclick=`, () => {
            const src = fs.readFileSync(file, "utf8");
            const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, "");
            const noLineComments = noBlockComments.replace(
                /^\s*\/\/.*$/gm,
                ""
            );
            expect(noLineComments).not.toMatch(/\bonclick\s*=/i);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────
// 10. Drift detector — event-delegation.js exports setupEventDelegation
// ─────────────────────────────────────────────────────────────────────
describe("event-delegation.js — module contract", () => {
    test("exports setupEventDelegation", () => {
        expect(typeof setupEventDelegation).toBe("function");
    });

    test("setupEventDelegation arity is 2", () => {
        expect(setupEventDelegation.length).toBe(2);
    });
});
