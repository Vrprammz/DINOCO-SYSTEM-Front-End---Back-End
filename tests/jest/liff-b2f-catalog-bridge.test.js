/**
 * Round 4 Jest tests — B2F catalog bridge cleanup + event delegation.
 *
 * Covers `liff-src/b2f/catalog/event-delegation.js` (V.0.5):
 *   - setupEventDelegation(root, deps) wires one click + change listener
 *   - Dispatches via [data-action] / [data-stepact] / [data-subaddsku] /
 *     [data-bucket-tab] taxonomy → matching dep function
 *   - Click bubbling — inner children resolve via closest()
 *   - Cleanup function removes both listeners (idempotent)
 *   - Handler errors swallowed (console.error) — listener stays alive
 *   - Unknown / missing data-action attributes are ignored
 *
 * Plus `liff-src/b2f/catalog/entry.js` V.0.5 contract assertions:
 *   - Source code MUST NOT assign `window.DINOCO_B2F_CATALOG_NAV` or
 *     `window.DINOCO_B2F_CATALOG_RENDERERS` (drift detector — fails CI
 *     when the legacy bridge globals reappear)
 *   - All page renderers MUST emit data-action attributes (no `onclick=`)
 *   - loaders/makerHome.js MUST NOT call addEventListener (delegated)
 *
 * Test strategy:
 *   - Import event-delegation.js directly (no CSS dep, no auto-bootstrap).
 *   - Use plain jest.fn() for deps — verify dispatch reaches the right one.
 *   - Source-level scan via fs.readFileSync to verify no legacy globals
 *     remain in entry.js / pages/* / loaders/makerHome.js (bypasses CSS
 *     import limitation).
 *
 * Production anchor: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.15
 * (inline JS being replaced).
 */

import { setupEventDelegation } from "../../liff-src/b2f/catalog/event-delegation.js";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "../..");
const ENTRY_PATH = path.join(REPO, "liff-src/b2f/catalog/entry.js");
const PAGES_DIR = path.join(REPO, "liff-src/b2f/catalog/pages");
const LOADERS_DIR = path.join(REPO, "liff-src/b2f/catalog/loaders");

/**
 * Mount fresh `#b2f-catalog-app` div for each test.
 */
function mountApp() {
    document.body.innerHTML = '<div id="b2f-catalog-app"></div>';
}

/**
 * Build a deps bag with jest.fn() for every action in the taxonomy.
 */
function makeDeps() {
    return {
        pickMaker: jest.fn(),
        openSetDetail: jest.fn(),
        addToCart: jest.fn(),
        increment: jest.fn(),
        decrement: jest.fn(),
        removeFromCart: jest.fn(),
        addSet: jest.fn(),
        subItemStep: jest.fn(),
        subItemReveal: jest.fn(),
        stepperInput: jest.fn(),
        toggleBucket: jest.fn(),
        back: jest.fn(),
        openReviewGate: jest.fn(),
        submitOrder: jest.fn(),
    };
}

/**
 * Inject HTML into #b2f-catalog-app and return the root element.
 * @param {string} html
 * @returns {HTMLElement}
 */
function inject(html) {
    const root = /** @type {HTMLElement} */ (
        document.getElementById("b2f-catalog-app")
    );
    root.innerHTML = html;
    return root;
}

beforeEach(() => {
    mountApp();
});

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

    test("noop when root has no addEventListener (non-Element)", () => {
        const cleanup = setupEventDelegation(
            /** @type {any} */ ({}),
            makeDeps()
        );
        expect(typeof cleanup).toBe("function");
        expect(() => cleanup()).not.toThrow();
    });

    test("noop when deps missing", () => {
        const root = inject("");
        const cleanup = setupEventDelegation(root, /** @type {any} */ (null));
        expect(typeof cleanup).toBe("function");
        cleanup();
    });

    test("cleanup removes the listener (no double-fire after second wire)", () => {
        const root = inject(
            '<button data-action="back">x</button>'
        );
        const deps = makeDeps();
        const cleanup1 = setupEventDelegation(root, deps);
        const btn = /** @type {HTMLButtonElement} */ (root.querySelector("button"));
        btn.click();
        expect(deps.back).toHaveBeenCalledTimes(1);
        cleanup1();
        btn.click();
        expect(deps.back).toHaveBeenCalledTimes(1);
        const cleanup2 = setupEventDelegation(root, deps);
        btn.click();
        expect(deps.back).toHaveBeenCalledTimes(2);
        cleanup2();
    });

    test("idempotent cleanup — calling twice is safe", () => {
        const root = inject("");
        const cleanup = setupEventDelegation(root, makeDeps());
        cleanup();
        expect(() => cleanup()).not.toThrow();
    });
});

describe("setupEventDelegation — pick-maker action", () => {
    test("click on data-action=pick-maker calls pickMaker(data-maker-id)", () => {
        const root = inject(
            '<button data-action="pick-maker" data-maker-id="42">M</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.pickMaker).toHaveBeenCalledTimes(1);
            expect(deps.pickMaker).toHaveBeenCalledWith("42");
        } finally {
            cleanup();
        }
    });

    test("click bubbles from inner child to data-action ancestor", () => {
        const root = inject(
            '<button data-action="pick-maker" data-maker-id="9"><span class="inner">x</span></button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector(".inner").click();
            expect(deps.pickMaker).toHaveBeenCalledWith("9");
        } finally {
            cleanup();
        }
    });

    test("missing data-maker-id is no-op", () => {
        const root = inject('<button data-action="pick-maker">no id</button>');
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.pickMaker).not.toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });
});

describe("setupEventDelegation — catalog grid actions", () => {
    test("data-action=plus dispatches increment(sku)", () => {
        const root = inject('<button data-action="plus" data-sku="ABC">+</button>');
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.increment).toHaveBeenCalledWith("ABC");
        } finally {
            cleanup();
        }
    });

    test("data-action=minus dispatches decrement(sku)", () => {
        const root = inject('<button data-action="minus" data-sku="XYZ">-</button>');
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.decrement).toHaveBeenCalledWith("XYZ");
        } finally {
            cleanup();
        }
    });

    test("data-action=detail with data-sku dispatches openSetDetail", () => {
        const root = inject('<button data-action="detail" data-sku="SET1">view</button>');
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.openSetDetail).toHaveBeenCalledWith("SET1");
        } finally {
            cleanup();
        }
    });

    test("data-action=detail falls back to data-setsku when data-sku missing", () => {
        const root = inject(
            '<button data-action="detail" data-setsku="SETLEGACY">view</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.openSetDetail).toHaveBeenCalledWith("SETLEGACY");
        } finally {
            cleanup();
        }
    });
});

describe("setupEventDelegation — cart actions", () => {
    test("data-action=remove dispatches removeFromCart(sku)", () => {
        const root = inject(
            '<button data-action="remove" data-sku="CARTSKU">x</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.removeFromCart).toHaveBeenCalledWith("CARTSKU");
        } finally {
            cleanup();
        }
    });

    test("data-action=back dispatches back()", () => {
        const root = inject('<button data-action="back">←</button>');
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.back).toHaveBeenCalledTimes(1);
        } finally {
            cleanup();
        }
    });

    test("data-action=review dispatches openReviewGate()", () => {
        const root = inject('<button data-action="review">review</button>');
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.openReviewGate).toHaveBeenCalledTimes(1);
        } finally {
            cleanup();
        }
    });

    test("data-action=submit dispatches submitOrder()", () => {
        const root = inject('<button data-action="submit">go</button>');
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.submitOrder).toHaveBeenCalledTimes(1);
        } finally {
            cleanup();
        }
    });

    test("submit handler that returns rejected Promise is caught", async () => {
        const root = inject('<button data-action="submit">go</button>');
        const deps = makeDeps();
        deps.submitOrder = jest.fn(() => Promise.reject(new Error("boom")));
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            // microtask flush
            await Promise.resolve();
            await Promise.resolve();
            expect(deps.submitOrder).toHaveBeenCalled();
            expect(errSpy).toHaveBeenCalled();
        } finally {
            errSpy.mockRestore();
            cleanup();
        }
    });
});

describe("setupEventDelegation — SET detail stepper actions", () => {
    test("data-stepact=plus on sub-stepper dispatches subItemStep(sku, 'plus')", () => {
        const root = inject(
            '<div data-stepsku="LEAF1">' +
            '<input class="b2f-qty-stepper-input" value="3">' +
            '<button data-stepact="plus">+</button>' +
            "</div>"
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.subItemStep).toHaveBeenCalledWith("LEAF1", "plus");
        } finally {
            cleanup();
        }
    });

    test("data-stepact=minus on sub-stepper dispatches subItemStep(sku, 'minus')", () => {
        const root = inject(
            '<div data-stepsku="LEAF2">' +
            '<input class="b2f-qty-stepper-input" value="2">' +
            '<button data-stepact="minus">-</button>' +
            "</div>"
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.subItemStep).toHaveBeenCalledWith("LEAF2", "minus");
        } finally {
            cleanup();
        }
    });

    test("data-stepact=plus on main SET stepper dispatches stepperInput", () => {
        const root = inject(
            '<div data-stepsku="SETMAIN" data-setmain="1">' +
            '<input class="b2f-qty-stepper-input" value="5">' +
            '<button data-stepact="plus">+</button>' +
            "</div>"
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.stepperInput).toHaveBeenCalledWith("SETMAIN", 6);
            expect(deps.subItemStep).not.toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });

    test("data-stepact=minus on main SET stepper clamps at 1", () => {
        const root = inject(
            '<div data-stepsku="SETMIN" data-setmain="1">' +
            '<input class="b2f-qty-stepper-input" value="1">' +
            '<button data-stepact="minus">-</button>' +
            "</div>"
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.stepperInput).toHaveBeenCalledWith("SETMIN", 1);
        } finally {
            cleanup();
        }
    });

    test("data-stepact=add on main SET dispatches addSet(sku, qty)", () => {
        const root = inject(
            '<div data-stepsku="SETADD" data-setmain="1">' +
            '<input class="b2f-qty-stepper-input" value="7">' +
            '<button data-stepact="add">add</button>' +
            "</div>"
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.addSet).toHaveBeenCalledWith("SETADD", 7);
        } finally {
            cleanup();
        }
    });

    test("data-stepact=add on sub-stepper dispatches addToCart(sku, qty)", () => {
        const root = inject(
            '<div data-stepsku="SUB1">' +
            '<input class="b2f-qty-stepper-input" value="4">' +
            '<button data-stepact="add">add</button>' +
            "</div>"
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.addToCart).toHaveBeenCalledWith("SUB1", 4);
        } finally {
            cleanup();
        }
    });

    test("change event on stepper input dispatches stepperInput(sku, val)", () => {
        const root = inject(
            '<div data-stepsku="INP">' +
            '<input class="b2f-qty-stepper-input" data-stepact="input" value="9">' +
            "</div>"
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            const input = /** @type {HTMLInputElement} */ (
                root.querySelector("input")
            );
            input.dispatchEvent(new Event("change", { bubbles: true }));
            expect(deps.stepperInput).toHaveBeenCalledWith("INP", 9);
        } finally {
            cleanup();
        }
    });
});

describe("setupEventDelegation — sub-add reveal + bucket-tab", () => {
    test("data-subaddsku dispatches subItemReveal(sku)", () => {
        const root = inject(
            '<button data-subaddsku="REVEAL">+ สั่งแยก</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.subItemReveal).toHaveBeenCalledWith("REVEAL");
        } finally {
            cleanup();
        }
    });

    test("data-subaddsku falls back to addToCart(sku, 1) when no reveal handler", () => {
        const root = inject(
            '<button data-subaddsku="FALLBACK">+ สั่งแยก</button>'
        );
        const deps = makeDeps();
        deps.subItemReveal = undefined;
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.addToCart).toHaveBeenCalledWith("FALLBACK", 1);
        } finally {
            cleanup();
        }
    });

    test("data-bucket-tab dispatches toggleBucket(key)", () => {
        const root = inject(
            '<div data-bucket-tab="full_set" role="tab">section</div>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("[data-bucket-tab]").click();
            expect(deps.toggleBucket).toHaveBeenCalledWith("full_set");
        } finally {
            cleanup();
        }
    });
});

describe("setupEventDelegation — robustness", () => {
    test("unknown data-action is silently ignored", () => {
        const root = inject('<button data-action="warpdrive">x</button>');
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            expect(() => root.querySelector("button").click()).not.toThrow();
            // None of the handlers should be called
            Object.keys(deps).forEach((k) => {
                expect(deps[k]).not.toHaveBeenCalled();
            });
        } finally {
            cleanup();
        }
    });

    test("handler throws — logged via console.error, listener stays alive", () => {
        const root = inject(
            '<button class="a" data-action="back">a</button>' +
            '<button class="b" data-action="back">b</button>'
        );
        const deps = makeDeps();
        deps.back = jest.fn(() => {
            throw new Error("kaboom");
        });
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector(".a").click();
            expect(deps.back).toHaveBeenCalledTimes(1);
            expect(errSpy).toHaveBeenCalled();
            // listener still alive
            root.querySelector(".b").click();
            expect(deps.back).toHaveBeenCalledTimes(2);
        } finally {
            errSpy.mockRestore();
            cleanup();
        }
    });

    test("clicks on plain elements without data-* are ignored", () => {
        const root = inject('<div class="plain">no action</div>');
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector(".plain").click();
            Object.keys(deps).forEach((k) => {
                expect(deps[k]).not.toHaveBeenCalled();
            });
        } finally {
            cleanup();
        }
    });
});

describe("Source-level drift checks — entry.js V.0.5", () => {
    let entrySource = "";

    beforeAll(() => {
        entrySource = fs.readFileSync(ENTRY_PATH, "utf8");
    });

    test("entry.js does NOT assign window.DINOCO_B2F_CATALOG_NAV", () => {
        expect(entrySource).not.toMatch(/window\.DINOCO_B2F_CATALOG_NAV\s*=/);
        expect(entrySource).not.toMatch(/w\.DINOCO_B2F_CATALOG_NAV\s*=/);
    });

    test("entry.js does NOT assign window.DINOCO_B2F_CATALOG_RENDERERS", () => {
        expect(entrySource).not.toMatch(
            /window\.DINOCO_B2F_CATALOG_RENDERERS\s*=/
        );
        expect(entrySource).not.toMatch(/w\.DINOCO_B2F_CATALOG_RENDERERS\s*=/);
    });

    test("entry.js KEEPS single namespaced surface DINOCO_B2F_CATALOG (frozen)", () => {
        expect(entrySource).toMatch(
            /(?:window|w)\.DINOCO_B2F_CATALOG\s*=\s*Object\.freeze/
        );
    });

    test("entry.js calls setupEventDelegation in bootstrap", () => {
        expect(entrySource).toContain("setupEventDelegation(root,");
    });

    test("entry.js bumps version to V.0.5", () => {
        expect(entrySource).toMatch(/V\.0\.5/);
        expect(entrySource).not.toMatch(/version:\s*"V\.0\.4"/);
    });
});

describe("Source-level drift checks — pages/* use data-action (no inline onclick)", () => {
    const PAGE_FILES = [
        "catalog.js",
        "cart.js",
        "filters.js",
        "reviewGate.js",
        "setDetail.js",
    ];

    test.each(PAGE_FILES)(
        "pages/%s does NOT contain inline `onclick=` attribute literal",
        (file) => {
            const src = fs.readFileSync(path.join(PAGES_DIR, file), "utf8");
            // Strip JSDoc/block/line comments so commentary that mentions
            // `onclick=...` doesn't false-positive.
            const stripped = src
                .split("\n")
                .filter(
                    (l) =>
                        !l.trim().startsWith("*") &&
                        !l.trim().startsWith("//") &&
                        !l.trim().startsWith("/*")
                )
                .join("\n");
            // Allow `onerror=` (image fallback in cart thumb is intentional)
            // — only match the exact `onclick=` HTML attribute.
            expect(stripped).not.toMatch(/onclick\s*=\s*["']/);
        }
    );

    test("pages/catalog.js uses data-action=plus / minus / detail", () => {
        const src = fs.readFileSync(path.join(PAGES_DIR, "catalog.js"), "utf8");
        expect(src).toContain('data-action="plus"');
        expect(src).toContain('data-action="minus"');
        expect(src).toContain('data-action="detail"');
    });

    test("pages/cart.js cart remove button uses data-action=remove", () => {
        const src = fs.readFileSync(path.join(PAGES_DIR, "cart.js"), "utf8");
        expect(src).toContain('data-action="remove"');
    });

    test("pages/setDetail.js uses data-stepact stepper attrs", () => {
        const src = fs.readFileSync(
            path.join(PAGES_DIR, "setDetail.js"),
            "utf8"
        );
        expect(src).toContain('data-stepact="minus"');
        expect(src).toContain('data-stepact="plus"');
        expect(src).toContain('data-stepact="add"');
        expect(src).toContain('data-stepact="input"');
        expect(src).toContain("data-subaddsku=");
    });

    test("pages/reviewGate.js uses data-bucket-tab on accordion headers", () => {
        const src = fs.readFileSync(
            path.join(PAGES_DIR, "reviewGate.js"),
            "utf8"
        );
        expect(src).toContain("data-bucket-tab=");
    });
});

describe("Source-level drift checks — loaders/makerHome.js delegates clicks", () => {
    test("loaders/makerHome.js MUST NOT call addEventListener", () => {
        const src = fs.readFileSync(
            path.join(LOADERS_DIR, "makerHome.js"),
            "utf8"
        );
        const stripped = src
            .split("\n")
            .filter(
                (l) =>
                    !l.trim().startsWith("*") &&
                    !l.trim().startsWith("//") &&
                    !l.trim().startsWith("/*")
            )
            .join("\n");
        expect(stripped).not.toMatch(/\.addEventListener\s*\(/);
    });

    test("loaders/makerHome.js card emits data-action=pick-maker", () => {
        const src = fs.readFileSync(
            path.join(LOADERS_DIR, "makerHome.js"),
            "utf8"
        );
        expect(src).toContain('data-action="pick-maker"');
        expect(src).toContain("handlePickMaker");
    });

    test("loaders/makerHome.js exports handlePickMaker", () => {
        const src = fs.readFileSync(
            path.join(LOADERS_DIR, "makerHome.js"),
            "utf8"
        );
        expect(src).toMatch(/export\s+function\s+handlePickMaker\s*\(/);
    });
});
