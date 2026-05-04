/**
 * Round 4 Jest tests — LIFF AI bridge cleanup + event delegation.
 *
 * Covers `liff-src/liff-ai/frontend/event-delegation.js` (V.0.5):
 *   - setupEventDelegation(root, deps) wires one click + change + submit listener
 *   - Dispatches via [data-action] taxonomy → matching dep function
 *   - Click bubbling — inner children resolve via closest()
 *   - Cleanup function removes all listeners (idempotent)
 *   - Handler errors swallowed (console.error) — listener stays alive
 *   - Unknown / missing data-action attributes are ignored
 *
 * Plus `liff-src/liff-ai/frontend/entry.js` V.0.5 contract assertions:
 *   - Source code MUST NOT assign 13 legacy `window.*` bridge globals
 *     (drift detector — fails CI when the legacy bridge reappears)
 *   - Source code MUST NOT assign window.DINOCO_LIFF_AI_RENDERERS
 *   - Source code MUST keep single namespaced surface DINOCO_LIFF_AI (frozen)
 *   - pages/agentChat.js MUST NOT contain inline `onclick=` HTML attribute
 *
 * Test strategy:
 *   - Import event-delegation.js directly (no CSS dep, no auto-bootstrap).
 *   - Use plain jest.fn() for deps — verify dispatch reaches the right one.
 *   - Source-level scan via fs.readFileSync to verify no legacy globals
 *     remain in entry.js + no inline onclick remains in pages/agentChat.js
 *     (bypasses CSS import limitation).
 *
 * Production anchor: `[LIFF AI] Snippet 2: Frontend` V.3.10 (inline JS being
 * replaced).
 */

import { setupEventDelegation } from "../../liff-src/liff-ai/frontend/event-delegation.js";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "../..");
const ENTRY_PATH = path.join(REPO, "liff-src/liff-ai/frontend/entry.js");
const PAGES_DIR = path.join(REPO, "liff-src/liff-ai/frontend/pages");

/**
 * Mount fresh `#liff-ai-app` div for each test.
 */
function mountApp() {
    document.body.innerHTML = '<div id="liff-ai-app"></div>';
}

/**
 * Build a deps bag with jest.fn() for every action in the taxonomy.
 */
function makeDeps() {
    return {
        goTab: jest.fn(),
        navigate: jest.fn(),
        openLeadDetail: jest.fn(),
        openClaimDetail: jest.fn(),
        acceptLead: jest.fn(),
        addLeadNote: jest.fn(),
        showLeadStatusModal: jest.fn(),
        changeLeadStatus: jest.fn(),
        showClaimStatusModal: jest.fn(),
        changeClaimStatus: jest.fn(),
        openPhotoLightbox: jest.fn(),
        closePhotoLightbox: jest.fn(),
        askAgent: jest.fn(),
        back: jest.fn(),
        refresh: jest.fn(),
    };
}

/**
 * Inject HTML into #liff-ai-app and return the root element.
 * @param {string} html
 * @returns {HTMLElement}
 */
function inject(html) {
    const root = /** @type {HTMLElement} */ (
        document.getElementById("liff-ai-app")
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

    test("noop when root has no addEventListener", () => {
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
        const root = inject('<button data-action="back">x</button>');
        const deps = makeDeps();
        const cleanup1 = setupEventDelegation(root, deps);
        const btn = /** @type {HTMLButtonElement} */ (
            root.querySelector("button")
        );
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

describe("setupEventDelegation — navigation actions", () => {
    test("data-action=go-tab dispatches goTab(tab)", () => {
        const root = inject(
            '<button data-action="go-tab" data-tab="dashboard">Home</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.goTab).toHaveBeenCalledWith("dashboard");
        } finally {
            cleanup();
        }
    });

    test("data-action=navigate with data-page+data-id dispatches navigate", () => {
        const root = inject(
            '<button data-action="navigate" data-page="lead" data-id="42">L</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.navigate).toHaveBeenCalledWith("lead", { id: "42" });
        } finally {
            cleanup();
        }
    });

    test("data-action=navigate without id passes empty params object", () => {
        const root = inject(
            '<button data-action="navigate" data-page="claims">C</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.navigate).toHaveBeenCalledWith("claims", {});
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

    test("data-action=refresh dispatches refresh()", () => {
        const root = inject('<button data-action="refresh">↻</button>');
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.refresh).toHaveBeenCalledTimes(1);
        } finally {
            cleanup();
        }
    });

    test("click bubbles from inner span to data-action ancestor", () => {
        const root = inject(
            '<button data-action="go-tab" data-tab="agent"><span class="inner">x</span></button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector(".inner").click();
            expect(deps.goTab).toHaveBeenCalledWith("agent");
        } finally {
            cleanup();
        }
    });

    test("missing data-tab on go-tab is no-op", () => {
        const root = inject('<button data-action="go-tab">no tab</button>');
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.goTab).not.toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });
});

describe("setupEventDelegation — lead actions", () => {
    test("data-action=open-lead-detail dispatches openLeadDetail(id)", () => {
        const root = inject(
            '<a data-action="open-lead-detail" data-lead-id="L123">view</a>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("a").click();
            expect(deps.openLeadDetail).toHaveBeenCalledWith("L123");
        } finally {
            cleanup();
        }
    });

    test("data-action=accept-lead dispatches acceptLead(id)", () => {
        const root = inject(
            '<button data-action="accept-lead" data-lead-id="42">accept</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.acceptLead).toHaveBeenCalledWith("42");
        } finally {
            cleanup();
        }
    });

    test("data-action=add-lead-note dispatches addLeadNote(id)", () => {
        const root = inject(
            '<button data-action="add-lead-note" data-lead-id="9">+note</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.addLeadNote).toHaveBeenCalledWith("9");
        } finally {
            cleanup();
        }
    });

    test("data-action=show-lead-status-modal dispatches showLeadStatusModal(id)", () => {
        const root = inject(
            '<button data-action="show-lead-status-modal" data-lead-id="7">change</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.showLeadStatusModal).toHaveBeenCalledWith("7");
        } finally {
            cleanup();
        }
    });

    test("data-action=change-lead-status (click) dispatches changeLeadStatus(id, status)", () => {
        const root = inject(
            '<button data-action="change-lead-status" data-lead-id="11" data-status="closed_won">go</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.changeLeadStatus).toHaveBeenCalledWith(
                "11",
                "closed_won"
            );
        } finally {
            cleanup();
        }
    });

    test("data-action=change-lead-status (select change) reads value from element", () => {
        const root = inject(
            '<select data-action="change-lead-status" data-lead-id="22">' +
                '<option value="">-</option>' +
                '<option value="waiting_decision">waiting</option>' +
                "</select>"
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            const sel = /** @type {HTMLSelectElement} */ (
                root.querySelector("select")
            );
            sel.value = "waiting_decision";
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            expect(deps.changeLeadStatus).toHaveBeenCalledWith(
                "22",
                "waiting_decision"
            );
        } finally {
            cleanup();
        }
    });
});

describe("setupEventDelegation — claim actions", () => {
    test("data-action=open-claim-detail dispatches openClaimDetail(id)", () => {
        const root = inject(
            '<a data-action="open-claim-detail" data-claim-id="C99">view</a>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("a").click();
            expect(deps.openClaimDetail).toHaveBeenCalledWith("C99");
        } finally {
            cleanup();
        }
    });

    test("data-action=show-claim-status-modal dispatches showClaimStatusModal(id)", () => {
        const root = inject(
            '<button data-action="show-claim-status-modal" data-claim-id="33">change</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.showClaimStatusModal).toHaveBeenCalledWith("33");
        } finally {
            cleanup();
        }
    });

    test("data-action=change-claim-status dispatches changeClaimStatus(id, status)", () => {
        const root = inject(
            '<button data-action="change-claim-status" data-claim-id="55" data-status="approved">ok</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.changeClaimStatus).toHaveBeenCalledWith(
                "55",
                "approved"
            );
        } finally {
            cleanup();
        }
    });

    test("data-action=change-claim-status select-change works", () => {
        const root = inject(
            '<select data-action="change-claim-status" data-claim-id="77">' +
                '<option value="">-</option>' +
                '<option value="completed">done</option>' +
                "</select>"
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            const sel = /** @type {HTMLSelectElement} */ (
                root.querySelector("select")
            );
            sel.value = "completed";
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            expect(deps.changeClaimStatus).toHaveBeenCalledWith(
                "77",
                "completed"
            );
        } finally {
            cleanup();
        }
    });
});

describe("setupEventDelegation — photo lightbox actions", () => {
    test("data-action=open-photo-lightbox dispatches openPhotoLightbox(url)", () => {
        const root = inject(
            '<img data-action="open-photo-lightbox" data-photo-url="https://example.com/p.jpg" alt="x">'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("img").click();
            expect(deps.openPhotoLightbox).toHaveBeenCalledWith(
                "https://example.com/p.jpg"
            );
        } finally {
            cleanup();
        }
    });

    test("data-action=close-photo-lightbox dispatches closePhotoLightbox()", () => {
        const root = inject(
            '<button data-action="close-photo-lightbox">×</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.closePhotoLightbox).toHaveBeenCalledTimes(1);
        } finally {
            cleanup();
        }
    });

    test("missing data-photo-url on open-photo-lightbox is no-op", () => {
        const root = inject(
            '<button data-action="open-photo-lightbox">go</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.openPhotoLightbox).not.toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });
});

describe("setupEventDelegation — agent chat actions", () => {
    test("data-action=ask-agent without data-question dispatches askAgent(undefined)", () => {
        const root = inject('<button data-action="ask-agent">ask</button>');
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.askAgent).toHaveBeenCalledWith(undefined);
        } finally {
            cleanup();
        }
    });

    test("data-action=ask-agent with data-question dispatches askAgent(q)", () => {
        const root = inject(
            '<button data-action="ask-agent" data-question="hello">ask</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.askAgent).toHaveBeenCalledWith("hello");
        } finally {
            cleanup();
        }
    });

    test("data-action=quick-question dispatches askAgent(quick)", () => {
        const root = inject(
            '<button data-action="quick-question" data-quick="สรุป lead วันนี้">q</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.askAgent).toHaveBeenCalledWith("สรุป lead วันนี้");
        } finally {
            cleanup();
        }
    });

    test("legacy [data-quick] without data-action also dispatches askAgent", () => {
        // Backward-compat for V.0.3 emit pattern.
        const root = inject(
            '<button class="liff-ai-quick-btn" data-quick="ask me">go</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            expect(deps.askAgent).toHaveBeenCalledWith("ask me");
        } finally {
            cleanup();
        }
    });

    test("form submit data-action=submit-agent-question reads input value", () => {
        const root = inject(
            '<form data-action="submit-agent-question">' +
                '<input type="text" name="question" value="how to claim?">' +
                '<button type="submit">go</button>' +
                "</form>"
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            const form = /** @type {HTMLFormElement} */ (
                root.querySelector("form")
            );
            // jsdom: dispatch submit event manually with bubbles+cancelable.
            const ev = new Event("submit", {
                bubbles: true,
                cancelable: true,
            });
            form.dispatchEvent(ev);
            expect(deps.askAgent).toHaveBeenCalledWith("how to claim?");
            expect(ev.defaultPrevented).toBe(true);
        } finally {
            cleanup();
        }
    });

    test("askAgent that returns rejected Promise is caught (no unhandled rejection)", async () => {
        const root = inject('<button data-action="ask-agent">go</button>');
        const deps = makeDeps();
        deps.askAgent = jest.fn(() => Promise.reject(new Error("boom")));
        const errSpy = jest
            .spyOn(console, "error")
            .mockImplementation(() => {});
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
            await Promise.resolve();
            await Promise.resolve();
            expect(deps.askAgent).toHaveBeenCalled();
            expect(errSpy).toHaveBeenCalled();
        } finally {
            errSpy.mockRestore();
            cleanup();
        }
    });
});

describe("setupEventDelegation — error / unknown action handling", () => {
    test("handler throws — logged via console.error, listener stays alive", () => {
        const root = inject(
            '<button class="a" data-action="back">a</button>' +
                '<button class="b" data-action="back">b</button>'
        );
        const deps = makeDeps();
        deps.back = jest.fn(() => {
            throw new Error("kaboom");
        });
        const errSpy = jest
            .spyOn(console, "error")
            .mockImplementation(() => {});
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

    test("unknown data-action value is silently ignored", () => {
        const root = inject(
            '<button data-action="totally-bogus-action">x</button>'
        );
        const deps = makeDeps();
        const cleanup = setupEventDelegation(root, deps);
        try {
            root.querySelector("button").click();
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

    /**
     * Strip JSDoc/block/line comments so commentary that mentions
     * legacy globals doesn't false-positive the drift detector.
     */
    function stripComments(src) {
        return src
            .split("\n")
            .filter(
                (l) =>
                    !l.trim().startsWith("*") &&
                    !l.trim().startsWith("//") &&
                    !l.trim().startsWith("/*")
            )
            .join("\n");
    }

    const LEGACY_GLOBALS = [
        "navigate",
        "goToTab",
        "openLeadDetail",
        "openClaimDetail",
        "handleAskAgent",
        "handleAcceptLead",
        "handleNoteAdd",
        "handleStatusChange",
        "handleClaimStatusUpdate",
        "showStatusChangeModal",
        "showClaimStatusModal",
        "openLightbox",
        "closeLightbox",
    ];

    test.each(LEGACY_GLOBALS)(
        "entry.js does NOT assign window.%s as a legacy bridge global",
        (name) => {
            const stripped = stripComments(entrySource);
            // Pattern: `(window).<name> = ` or `window.<name> = ` — anything
            // that writes to that property at module scope.
            const re = new RegExp(
                "\\(window\\)\\s*\\.\\s*" +
                    name +
                    "\\s*=|window\\s*\\.\\s*" +
                    name +
                    "\\s*=",
                "m"
            );
            expect(stripped).not.toMatch(re);
        }
    );

    test("entry.js does NOT assign window.DINOCO_LIFF_AI_RENDERERS", () => {
        const stripped = stripComments(entrySource);
        expect(stripped).not.toMatch(
            /window\s*\.\s*DINOCO_LIFF_AI_RENDERERS\s*=/
        );
        expect(stripped).not.toMatch(
            /\(window\)\s*\.\s*DINOCO_LIFF_AI_RENDERERS\s*=/
        );
    });

    test("entry.js KEEPS single namespaced surface DINOCO_LIFF_AI (frozen)", () => {
        expect(entrySource).toMatch(
            /\(?window\)?\s*\.\s*DINOCO_LIFF_AI\s*=\s*Object\.freeze/
        );
    });

    test("entry.js calls setupEventDelegation in bootstrap", () => {
        expect(entrySource).toContain("setupEventDelegation(");
    });

    test("entry.js imports event-delegation module", () => {
        expect(entrySource).toMatch(
            /from\s+["']\.\/event-delegation\.js["']/
        );
    });

    test("entry.js bumps version to V.0.5", () => {
        expect(entrySource).toMatch(/V\.0\.5/);
        expect(entrySource).not.toMatch(/version:\s*"V\.0\.4"/);
    });
});

describe("Source-level drift checks — pages/agentChat.js (no inline onclick)", () => {
    test("pages/agentChat.js does NOT contain inline `onclick=` HTML attribute", () => {
        const src = fs.readFileSync(
            path.join(PAGES_DIR, "agentChat.js"),
            "utf8"
        );
        // Strip JSDoc / line / block comments so commentary that mentions
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
        // Match the exact `onclick=` HTML attribute literal (quoted).
        expect(stripped).not.toMatch(/onclick\s*=\s*["']/);
    });

    test("pages/agentChat.js close button uses data-action=go-tab", () => {
        const src = fs.readFileSync(
            path.join(PAGES_DIR, "agentChat.js"),
            "utf8"
        );
        expect(src).toContain('data-action="go-tab"');
        expect(src).toContain('data-tab="dashboard"');
    });

    test("pages/agentChat.js quick-question chips emit data-action=quick-question", () => {
        const src = fs.readFileSync(
            path.join(PAGES_DIR, "agentChat.js"),
            "utf8"
        );
        expect(src).toContain('data-action="quick-question"');
    });
});
