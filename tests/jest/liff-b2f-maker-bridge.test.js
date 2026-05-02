/**
 * Phase 6 Jest tests for Round 4 — bridge cleanup + event delegation.
 *
 * Covers `liff-src/b2f/maker/event-delegation.js` (V.0.5):
 *   - setupEventDelegation(root, deps) wires one click listener
 *   - Dispatches via [data-action] attribute → matching dep function
 *   - Click bubbling — inner children resolve via closest()
 *   - Cleanup function removes the listener (idempotent)
 *   - Handler errors swallowed (console.error) — listener stays alive
 *   - Unknown / missing data-action attributes are ignored
 *
 * Plus `liff-src/b2f/maker/entry.js` V.0.5 contract assertions:
 *   - Source code MUST NOT assign window.goToPage / window.b2fStepQty / etc.
 *     (drift detector — fails CI when legacy globals reappear)
 *   - All page renderers MUST emit data-action attributes (no `onclick=`)
 *
 * Test strategy:
 *   - Import event-delegation.js directly (no CSS dep, no auto-bootstrap).
 *   - Use plain jest.fn() for deps — verify dispatch reaches the right one.
 *   - Source-level scan via fs.readFileSync to verify no legacy globals
 *     remain in entry.js / pages/* (bypasses CSS import limitation).
 *
 * Production anchor: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7 (inline JS
 * being replaced).
 */

import { setupEventDelegation } from "../../liff-src/b2f/maker/event-delegation.js";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "../..");
const ENTRY_PATH = path.join(REPO, "liff-src/b2f/maker/entry.js");
const PAGES_DIR = path.join(REPO, "liff-src/b2f/maker/pages");

/**
 * Mount fresh `#b2f-app` div for each test.
 */
function mountApp() {
    document.body.innerHTML = '<div id="b2f-app"></div>';
}

/**
 * Build a deps bag with jest.fn() for all 7 actions.
 */
function makeDeps() {
    return {
        goToPage: jest.fn(),
        goToPageWithPO: jest.fn(),
        b2fOpenDeliverForm: jest.fn(),
        loadDeliverPage: jest.fn(),
        b2fStepQty: jest.fn(),
        b2fFillAllRemaining: jest.fn(),
        handleDeliverSubmit: jest.fn(),
    };
}

/**
 * Inject HTML into #b2f-app and return the root element.
 * @param {string} html
 * @returns {HTMLElement}
 */
function inject(html) {
    const root = /** @type {HTMLElement} */ (
        document.getElementById("b2f-app")
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
            '<button data-action="navigate" data-view="list">x</button>'
        );
        const deps = makeDeps();
        const cleanup1 = setupEventDelegation(root, deps);
        const btn = /** @type {HTMLButtonElement} */ (root.querySelector("button"));
        btn.click();
        expect(deps.goToPage).toHaveBeenCalledTimes(1);
        cleanup1();
        // After cleanup, click should NOT increment dispatch count
        btn.click();
        expect(deps.goToPage).toHaveBeenCalledTimes(1);
        // Re-wiring works too
        const cleanup2 = setupEventDelegation(root, deps);
        btn.click();
        expect(deps.goToPage).toHaveBeenCalledTimes(2);
        cleanup2();
    });

    test("idempotent cleanup — calling twice is safe", () => {
        const root = inject("");
        const cleanup = setupEventDelegation(root, makeDeps());
        cleanup();
        expect(() => cleanup()).not.toThrow();
    });
});

describe("setupEventDelegation — navigate action", () => {
    test("click on data-action='navigate' calls goToPage(data-view)", () => {
        const root = inject(
            '<button data-action="navigate" data-view="detail">go</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.goToPage).toHaveBeenCalledTimes(1);
            expect(deps.goToPage).toHaveBeenCalledWith("detail");
        } finally {
            cleanup();
        }
    });

    test("click bubbles from inner child to data-action ancestor", () => {
        const root = inject(
            '<button data-action="navigate" data-view="list"><span class="inner">x</span></button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector(".inner").click();
            expect(deps.goToPage).toHaveBeenCalledWith("list");
        } finally {
            cleanup();
        }
    });

    test("missing data-view is a no-op (no router call)", () => {
        const root = inject('<button data-action="navigate">no view</button>');
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.goToPage).not.toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });

    test("unknown data-action is silently ignored", () => {
        const root = inject(
            '<button data-action="open-fridge">huh</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            expect(() => root.querySelector("button").click()).not.toThrow();
            expect(deps.goToPage).not.toHaveBeenCalled();
            expect(deps.goToPageWithPO).not.toHaveBeenCalled();
            expect(deps.b2fOpenDeliverForm).not.toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });

    test("clicks on elements without data-action ancestor are ignored", () => {
        const root = inject('<div class="plain">no action</div>');
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector(".plain").click();
            expect(deps.goToPage).not.toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });
});

describe("setupEventDelegation — navigate-with-po action", () => {
    test("calls goToPageWithPO when data-view + data-po-id present", () => {
        const root = inject(
            '<div data-action="navigate-with-po" data-view="detail" data-po-id="42">card</div>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("[data-action]").click();
            expect(deps.goToPageWithPO).toHaveBeenCalledWith("detail", "42");
            expect(deps.goToPage).not.toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });

    test("falls back to goToPage when data-po-id missing", () => {
        const root = inject(
            '<div data-action="navigate-with-po" data-view="reschedule">card</div>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("[data-action]").click();
            expect(deps.goToPageWithPO).not.toHaveBeenCalled();
            expect(deps.goToPage).toHaveBeenCalledWith("reschedule");
        } finally {
            cleanup();
        }
    });

    test("po-id passed as string (preserves leading zeros)", () => {
        const root = inject(
            '<div data-action="navigate-with-po" data-view="detail" data-po-id="00099">x</div>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("[data-action]").click();
            expect(deps.goToPageWithPO).toHaveBeenCalledWith("detail", "00099");
        } finally {
            cleanup();
        }
    });
});

describe("setupEventDelegation — deliver-open action", () => {
    test("calls b2fOpenDeliverForm with data-po-id", () => {
        const root = inject(
            '<button data-action="deliver-open" data-po-id="123">Open</button>'
        );
        const deps = makeDeps();
        deps.b2fOpenDeliverForm.mockResolvedValue();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.b2fOpenDeliverForm).toHaveBeenCalledWith("123");
        } finally {
            cleanup();
        }
    });

    test("missing data-po-id → no call (defensive)", () => {
        const root = inject(
            '<button data-action="deliver-open">no id</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.b2fOpenDeliverForm).not.toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });

    test("rejection from b2fOpenDeliverForm does not throw upstream", () => {
        const root = inject(
            '<button data-action="deliver-open" data-po-id="9">x</button>'
        );
        const deps = makeDeps();
        deps.b2fOpenDeliverForm.mockRejectedValue(new Error("boom"));
        const cleanup = setupEventDelegation(root, deps);
        const orig = console.error;
        console.error = jest.fn();
        try {
            expect(() => root.querySelector("button").click()).not.toThrow();
        } finally {
            console.error = orig;
            cleanup();
        }
    });
});

describe("setupEventDelegation — deliver-back action", () => {
    test("calls loadDeliverPage()", () => {
        const root = inject(
            '<button data-action="deliver-back">←</button>'
        );
        const deps = makeDeps();
        deps.loadDeliverPage.mockResolvedValue();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.loadDeliverPage).toHaveBeenCalledTimes(1);
        } finally {
            cleanup();
        }
    });

    test("rejection from loadDeliverPage does not throw upstream", () => {
        const root = inject(
            '<button data-action="deliver-back">x</button>'
        );
        const deps = makeDeps();
        deps.loadDeliverPage.mockRejectedValue(new Error("boom"));
        const cleanup = setupEventDelegation(root, deps);
        const orig = console.error;
        console.error = jest.fn();
        try {
            expect(() => root.querySelector("button").click()).not.toThrow();
        } finally {
            console.error = orig;
            cleanup();
        }
    });
});

describe("setupEventDelegation — deliver-step action", () => {
    test("calls b2fStepQty(target, parseInt(data-delta))", () => {
        const root = inject(
            '<button type="button" data-action="deliver-step" data-delta="1">+</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            const btn = root.querySelector("button");
            btn.click();
            expect(deps.b2fStepQty).toHaveBeenCalledTimes(1);
            const args = deps.b2fStepQty.mock.calls[0];
            expect(args[0]).toBe(btn);
            expect(args[1]).toBe(1);
        } finally {
            cleanup();
        }
    });

    test("data-delta='-1' parses to -1", () => {
        const root = inject(
            '<button type="button" data-action="deliver-step" data-delta="-1">-</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.b2fStepQty.mock.calls[0][1]).toBe(-1);
        } finally {
            cleanup();
        }
    });

    test("missing data-delta defaults to 0 (no-op effectively)", () => {
        const root = inject(
            '<button type="button" data-action="deliver-step">no delta</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.b2fStepQty).toHaveBeenCalledWith(
                expect.any(Object),
                0
            );
        } finally {
            cleanup();
        }
    });
});

describe("setupEventDelegation — deliver-fill-all action", () => {
    test("calls b2fFillAllRemaining()", () => {
        const root = inject(
            '<button data-action="deliver-fill-all">Fill all</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.b2fFillAllRemaining).toHaveBeenCalledTimes(1);
            expect(deps.b2fFillAllRemaining).toHaveBeenCalledWith();
        } finally {
            cleanup();
        }
    });
});

describe("setupEventDelegation — deliver-submit action", () => {
    test("calls handleDeliverSubmit()", () => {
        const root = inject(
            '<button data-action="deliver-submit">Submit</button>'
        );
        const deps = makeDeps();
        deps.handleDeliverSubmit.mockResolvedValue();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.handleDeliverSubmit).toHaveBeenCalledTimes(1);
        } finally {
            cleanup();
        }
    });

    test("rejection swallowed (no upstream throw)", () => {
        const root = inject(
            '<button data-action="deliver-submit">x</button>'
        );
        const deps = makeDeps();
        deps.handleDeliverSubmit.mockRejectedValue(new Error("boom"));
        const cleanup = setupEventDelegation(root, deps);
        const orig = console.error;
        console.error = jest.fn();
        try {
            expect(() => root.querySelector("button").click()).not.toThrow();
        } finally {
            console.error = orig;
            cleanup();
        }
    });
});

describe("setupEventDelegation — handler exception handling", () => {
    test("synchronous handler throw is caught (logger called, no upstream throw)", () => {
        const root = inject(
            '<button data-action="navigate" data-view="detail">x</button>'
        );
        const deps = makeDeps();
        deps.goToPage.mockImplementation(() => {
            throw new Error("router crash");
        });
        const cleanup = setupEventDelegation(root, deps);
        const orig = console.error;
        console.error = jest.fn();
        try {
            expect(() => root.querySelector("button").click()).not.toThrow();
            expect(console.error).toHaveBeenCalled();
        } finally {
            console.error = orig;
            cleanup();
        }
    });

    test("listener survives a handler exception (next click still dispatches)", () => {
        const root = inject(
            '<button data-action="navigate" data-view="x" id="b1">crash</button>' +
                '<button data-action="navigate" data-view="list" id="b2">ok</button>'
        );
        const deps = makeDeps();
        deps.goToPage.mockImplementationOnce(() => {
            throw new Error("first crash");
        });
        const cleanup = setupEventDelegation(root, deps);
        const orig = console.error;
        console.error = jest.fn();
        try {
            root.querySelector("#b1").click();
            // After throw, listener still active for the next click
            root.querySelector("#b2").click();
            expect(deps.goToPage).toHaveBeenCalledTimes(2);
            expect(deps.goToPage.mock.calls[1][0]).toBe("list");
        } finally {
            console.error = orig;
            cleanup();
        }
    });
});

describe("Source-level drift checks — no legacy globals in entry.js", () => {
    let entrySource;

    beforeAll(() => {
        entrySource = fs.readFileSync(ENTRY_PATH, "utf8");
    });

    test("entry.js has version V.0.5", () => {
        expect(entrySource).toContain('version: "V.0.5"');
    });

    test("entry.js does NOT assign window.goToPage", () => {
        expect(entrySource).not.toMatch(/window\.goToPage\s*=/);
    });

    test("entry.js does NOT assign window.goToPageWithPO", () => {
        expect(entrySource).not.toMatch(/window\.goToPageWithPO\s*=/);
    });

    test("entry.js does NOT assign window.b2fOpenDeliverForm", () => {
        expect(entrySource).not.toMatch(/window\.b2fOpenDeliverForm\s*=/);
    });

    test("entry.js does NOT assign window.b2fFillAllRemaining", () => {
        expect(entrySource).not.toMatch(/window\.b2fFillAllRemaining\s*=/);
    });

    test("entry.js does NOT assign window.b2fStepQty", () => {
        expect(entrySource).not.toMatch(/window\.b2fStepQty\s*=/);
    });

    test("entry.js does NOT assign window.b2fSubmitDeliver", () => {
        expect(entrySource).not.toMatch(/window\.b2fSubmitDeliver\s*=/);
    });

    test("entry.js does NOT assign window.loadDeliverPage", () => {
        expect(entrySource).not.toMatch(/window\.loadDeliverPage\s*=/);
    });

    test("entry.js does NOT assign window.DINOCO_B2F_MAKER_RENDERERS", () => {
        expect(entrySource).not.toMatch(
            /window\.DINOCO_B2F_MAKER_RENDERERS\s*=/
        );
    });

    test("entry.js KEEPS single namespaced surface window.DINOCO_B2F_MAKER", () => {
        expect(entrySource).toMatch(/window\.DINOCO_B2F_MAKER\s*=\s*Object\.freeze/);
    });

    test("entry.js calls setupEventDelegation in bootstrap", () => {
        expect(entrySource).toContain("setupEventDelegation(appRoot)");
    });
});

describe("Source-level drift checks — pages/* use data-action (no inline onclick)", () => {
    const PAGE_FILES = [
        "confirm.js",
        "deliver.js",
        "detail.js",
        "list.js",
        "reschedule.js",
    ];

    test.each(PAGE_FILES)(
        "pages/%s does NOT contain `onclick=` attribute literal",
        (file) => {
            const src = fs.readFileSync(path.join(PAGES_DIR, file), "utf8");
            // Strip JSDoc + comments — only check string-literal onclick=
            // emissions in HTML strings.
            const stripped = src
                .split("\n")
                .filter(
                    (l) =>
                        !l.trim().startsWith("*") &&
                        !l.trim().startsWith("//") &&
                        !l.trim().startsWith("/*")
                )
                .join("\n");
            // We allow comment lines explaining "Round 4 migrated onclick → ..."
            // Match only HTML attribute pattern `onclick="..."` or `onclick='...'`
            expect(stripped).not.toMatch(/onclick\s*=\s*["']/);
        }
    );

    test("pages/detail.js uses data-action=navigate for status-action buttons", () => {
        const src = fs.readFileSync(path.join(PAGES_DIR, "detail.js"), "utf8");
        expect(src).toContain('data-action="navigate"');
        expect(src).toContain('data-view="confirm"');
        expect(src).toContain('data-view="reschedule"');
        expect(src).toContain('data-view="deliver"');
    });

    test("pages/reschedule.js uses data-action=navigate-with-po for cards", () => {
        const src = fs.readFileSync(
            path.join(PAGES_DIR, "reschedule.js"),
            "utf8"
        );
        expect(src).toContain('data-action="navigate-with-po"');
        expect(src).toContain('data-view="reschedule"');
    });

    test("pages/list.js uses data-action=navigate-with-po for cards", () => {
        const src = fs.readFileSync(path.join(PAGES_DIR, "list.js"), "utf8");
        expect(src).toContain('data-action="navigate-with-po"');
        expect(src).toContain('data-view="detail"');
    });

    test("pages/deliver.js uses data-action for stepper + open + submit + back", () => {
        const src = fs.readFileSync(
            path.join(PAGES_DIR, "deliver.js"),
            "utf8"
        );
        expect(src).toContain('data-action="deliver-step"');
        expect(src).toContain('data-action="deliver-open"');
        expect(src).toContain('data-action="deliver-submit"');
        expect(src).toContain('data-action="deliver-back"');
        expect(src).toContain('data-action="deliver-fill-all"');
    });
});
