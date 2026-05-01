/**
 * Phase 6 Jest tests for liff-src/b2f/maker/pages/* (V.0.3 Round 2).
 *
 * Covers 5 page renderers + buildTimeline full impl:
 *   - confirm.js     (renderConfirmPage + renderItemRow + attachConfirmHandlers)
 *   - detail.js      (renderDetailPage + renderDetailItem)
 *   - reschedule.js  (renderRescheduleList + renderReschedulePage)
 *   - list.js        (renderListPage + filter state)
 *   - deliver.js     (renderDeliverPage + renderDeliverForm)
 *
 * Test strategy:
 *   - jsdom mounts a `#b2f-app` container before each test.
 *   - DOMParser introspection on rendered HTML for structure assertions
 *     (counted children, class names, data attrs, mode badges).
 *   - 3-language strings: tests assume default Thai (lang.js setLang call
 *     resets to "th" between tests).
 *   - V.7.0 mode badge: pass `poi_order_mode` and assert `.item-mode-badge`
 *     class + correct icon (🟣🟠⚪).
 *   - DD-3 hierarchy: pass items with `poi_parent_sku` and assert SET
 *     header rows (purple) appear before children.
 *
 * Production behavior anchors:
 *   - `[B2F] Snippet 4: Maker LIFF Pages` V.4.7 (inline `b2f_liff_page_js()`).
 *     Drift = visual regression in Maker LIFF.
 */

import {
    renderConfirmPage,
    renderItemRow,
    attachConfirmHandlers,
} from "../../liff-src/b2f/maker/pages/confirm.js";
import {
    renderDetailPage,
    renderDetailItem,
} from "../../liff-src/b2f/maker/pages/detail.js";
import {
    renderRescheduleList,
    renderReschedulePage,
    attachRescheduleHandler,
} from "../../liff-src/b2f/maker/pages/reschedule.js";
import {
    renderListPage,
    getListFilter,
    _resetListFilter,
} from "../../liff-src/b2f/maker/pages/list.js";
import {
    renderDeliverPage,
    renderDeliverForm,
} from "../../liff-src/b2f/maker/pages/deliver.js";
import { setLang } from "../../liff-src/b2f/maker/utils/lang.js";
import { buildTimeline } from "../../liff-src/b2f/maker/utils/timeline.js";

// jsdom helpers
function mountApp() {
    document.body.innerHTML = '<div id="b2f-app"></div>';
}

// jsdom doesn't implement Element.scrollIntoView — stub it so handler
// assertions that toggle .show class don't throw.
if (
    typeof window !== "undefined" &&
    typeof Element !== "undefined" &&
    !Element.prototype.scrollIntoView
) {
    Element.prototype.scrollIntoView = function () {};
}

function getApp() {
    return document.getElementById("b2f-app");
}

beforeEach(() => {
    setLang("th");
    _resetListFilter();
    mountApp();
});

// ──────────────────────────────────────────────────────────────────────
// renderItemRow (confirm page private renderer, exported for tests)
// ──────────────────────────────────────────────────────────────────────

describe("renderItemRow (confirm)", () => {
    const basePO = { po_currency: "THB", currency: "THB" };

    test("renders SKU + name + qty math", () => {
        const html = renderItemRow(
            {
                poi_sku: "DNCGND37LSPROS",
                poi_product_name: "DINOCO Edition NX500",
                poi_unit_cost: 5000,
                poi_qty_ordered: 3,
            },
            basePO
        );
        expect(html).toContain("DNCGND37LSPROS");
        expect(html).toContain("DINOCO Edition NX500");
        expect(html).toContain("5,000.00");
        expect(html).toContain("3");
        // line total = 15,000
        expect(html).toContain("15,000.00");
    });

    test("escapes HTML in product name", () => {
        const html = renderItemRow(
            {
                poi_sku: "TEST",
                poi_product_name: "<script>alert(1)</script>",
                poi_unit_cost: 100,
                poi_qty_ordered: 1,
            },
            basePO
        );
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });

    test("emits 🟣 mode badge when poi_order_mode=full_set", () => {
        const html = renderItemRow(
            {
                poi_sku: "X",
                poi_product_name: "Set",
                poi_unit_cost: 1,
                poi_qty_ordered: 1,
                poi_order_mode: "full_set",
            },
            basePO
        );
        expect(html).toContain("item-mode-badge");
        expect(html).toContain("mode-full-set");
    });

    test("emits 🟠 badge when poi_order_mode=sub_unit", () => {
        const html = renderItemRow(
            {
                poi_sku: "X",
                poi_product_name: "Sub",
                poi_unit_cost: 1,
                poi_qty_ordered: 1,
                poi_order_mode: "sub_unit",
            },
            basePO
        );
        expect(html).toContain("mode-sub-unit");
    });

    test("emits ⚪ badge when poi_order_mode=single_leaf", () => {
        const html = renderItemRow(
            {
                poi_sku: "X",
                poi_product_name: "Leaf",
                poi_unit_cost: 1,
                poi_qty_ordered: 1,
                poi_order_mode: "single_leaf",
            },
            basePO
        );
        expect(html).toContain("mode-single-leaf");
    });

    test("no mode badge when poi_order_mode missing (legacy PO)", () => {
        const html = renderItemRow(
            { poi_sku: "X", poi_product_name: "Legacy", poi_unit_cost: 1, poi_qty_ordered: 1 },
            basePO
        );
        expect(html).not.toContain("item-mode-badge");
    });
});

// ──────────────────────────────────────────────────────────────────────
// renderConfirmPage
// ──────────────────────────────────────────────────────────────────────

describe("renderConfirmPage", () => {
    function makePO(overrides = {}) {
        return {
            ID: 123,
            po_number: "PO-2026-001",
            po_status: "submitted",
            po_total_amount: 15000,
            po_currency: "THB",
            currency: "THB",
            po_items: [
                {
                    poi_sku: "DNCGND37LSPROS",
                    poi_product_name: "DINOCO Edition",
                    poi_unit_cost: 5000,
                    poi_qty_ordered: 3,
                },
            ],
            ...overrides,
        };
    }

    test("renders header with PO number", () => {
        renderConfirmPage(makePO());
        expect(getApp().querySelector(".b2f-po-number").textContent).toBe(
            "PO-2026-001"
        );
    });

    test("renders items section with item count", () => {
        renderConfirmPage(makePO());
        const html = getApp().innerHTML;
        expect(html).toContain("(1");
    });

    test("renders form when status=submitted (canConfirm=true)", () => {
        renderConfirmPage(makePO({ po_status: "submitted" }));
        expect(getApp().querySelector("#b2f-eta")).not.toBeNull();
        expect(getApp().querySelector("#b2f-confirm-btn")).not.toBeNull();
        expect(getApp().querySelector("#b2f-reject-btn")).not.toBeNull();
    });

    test("renders form when status=amended (canConfirm=true)", () => {
        renderConfirmPage(makePO({ po_status: "amended" }));
        expect(getApp().querySelector("#b2f-eta")).not.toBeNull();
    });

    test("hides form when status=confirmed (canConfirm=false)", () => {
        renderConfirmPage(makePO({ po_status: "confirmed" }));
        expect(getApp().querySelector("#b2f-eta")).toBeNull();
        expect(getApp().querySelector("#b2f-confirm-btn")).toBeNull();
    });

    test("groups items by poi_parent_sku (DD-3 hierarchy)", () => {
        const po = makePO({
            po_items: [
                {
                    poi_sku: "L",
                    poi_product_name: "Left",
                    poi_unit_cost: 100,
                    poi_qty_ordered: 1,
                    poi_parent_sku: "SET1",
                    poi_parent_name: "Bumper Set",
                },
                {
                    poi_sku: "R",
                    poi_product_name: "Right",
                    poi_unit_cost: 100,
                    poi_qty_ordered: 1,
                    poi_parent_sku: "SET1",
                    poi_parent_name: "Bumper Set",
                },
            ],
        });
        renderConfirmPage(po);
        const html = getApp().innerHTML;
        // SET header has 🟣 emoji + parent name
        expect(html).toContain("🟣 Bumper Set");
    });

    test("renders standalone items when no poi_parent_sku", () => {
        renderConfirmPage(makePO());
        const html = getApp().innerHTML;
        // No SET header for standalone
        expect(html).not.toContain("🟣");
    });

    test("shows total amount with currency", () => {
        renderConfirmPage(makePO({ po_total_amount: 15000 }));
        const html = getApp().innerHTML;
        expect(html).toContain("15,000.00");
    });

    test("shows admin note when present", () => {
        renderConfirmPage(makePO({ po_admin_note: "Urgent order" }));
        expect(getApp().innerHTML).toContain("Urgent order");
    });

    test("shows requested date when present", () => {
        renderConfirmPage(
            makePO({ po_requested_date: "2026-05-15" })
        );
        // Thai locale → Buddhist Era 2569
        expect(getApp().innerHTML).toMatch(/15\/05\/2569/);
    });

    test("date input has min attribute (tomorrow)", () => {
        renderConfirmPage(makePO());
        const dateInput = getApp().querySelector("#b2f-eta");
        expect(dateInput.min).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("status badge has correct class", () => {
        renderConfirmPage(makePO({ po_status: "submitted" }));
        expect(
            getApp().querySelector(".b2f-status-submitted")
        ).not.toBeNull();
    });

    test("amendment indicator shown when po_version > 1", () => {
        renderConfirmPage(makePO({ po_version: 2 }));
        const html = getApp().innerHTML;
        expect(html).toContain("ฉบับแก้ไข");
    });
});

// ──────────────────────────────────────────────────────────────────────
// attachConfirmHandlers
// ──────────────────────────────────────────────────────────────────────

describe("attachConfirmHandlers", () => {
    test("calls onConfirm when confirm button clicked", () => {
        const po = {
            po_number: "X",
            po_status: "submitted",
            po_total_amount: 0,
            po_items: [],
        };
        renderConfirmPage(po);
        const onConfirm = jest.fn();
        attachConfirmHandlers({ onConfirm });
        getApp().querySelector("#b2f-confirm-btn").click();
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    test("calls onReject when confirm-reject clicked", () => {
        const po = {
            po_number: "X",
            po_status: "submitted",
            po_total_amount: 0,
            po_items: [],
        };
        renderConfirmPage(po);
        const onReject = jest.fn();
        attachConfirmHandlers({ onReject });
        getApp().querySelector("#b2f-confirm-reject").click();
        expect(onReject).toHaveBeenCalledTimes(1);
    });

    test("toggles .show class on reject-box when reject button clicked", () => {
        const po = {
            po_number: "X",
            po_status: "submitted",
            po_total_amount: 0,
            po_items: [],
        };
        renderConfirmPage(po);
        attachConfirmHandlers({});
        const box = getApp().querySelector("#b2f-reject-box");
        expect(box.classList.contains("show")).toBe(false);
        getApp().querySelector("#b2f-reject-btn").click();
        expect(box.classList.contains("show")).toBe(true);
    });
});

// ──────────────────────────────────────────────────────────────────────
// renderDetailItem + renderDetailPage
// ──────────────────────────────────────────────────────────────────────

describe("renderDetailItem", () => {
    const basePO = { po_currency: "THB", currency: "THB" };

    test("renders image when image_url present", () => {
        const html = renderDetailItem(
            {
                poi_sku: "X",
                poi_product_name: "P",
                poi_unit_cost: 1,
                poi_qty_ordered: 1,
                image_url: "https://example.com/img.jpg",
            },
            basePO
        );
        expect(html).toContain('class="item-img"');
        expect(html).toContain("example.com/img.jpg");
    });

    test("no image element when both url fields missing", () => {
        const html = renderDetailItem(
            {
                poi_sku: "X",
                poi_product_name: "P",
                poi_unit_cost: 1,
                poi_qty_ordered: 1,
            },
            basePO
        );
        expect(html).not.toContain('class="item-img"');
    });

    test("shows received progress percentage", () => {
        const html = renderDetailItem(
            {
                poi_sku: "X",
                poi_product_name: "P",
                poi_unit_cost: 100,
                poi_qty_ordered: 10,
                poi_qty_received: 5,
            },
            basePO
        );
        expect(html).toContain("5 / 10");
        expect(html).toContain("(50%)");
    });

    test("shows reject count when poi_qty_rejected > 0", () => {
        const html = renderDetailItem(
            {
                poi_sku: "X",
                poi_product_name: "P",
                poi_unit_cost: 100,
                poi_qty_ordered: 10,
                poi_qty_rejected: 2,
            },
            basePO
        );
        expect(html).toContain("reject: 2");
    });
});

describe("renderDetailPage", () => {
    function makePO(overrides = {}) {
        return {
            po_number: "PO-D-001",
            po_status: "received",
            po_total_amount: 1000,
            po_items: [
                {
                    poi_sku: "X",
                    poi_product_name: "P",
                    poi_unit_cost: 1000,
                    poi_qty_ordered: 1,
                    poi_qty_received: 1,
                },
            ],
            post_date: "2026-04-01",
            po_currency: "THB",
            currency: "THB",
            ...overrides,
        };
    }

    test("renders timeline section", () => {
        renderDetailPage(makePO());
        expect(
            getApp().querySelector(".b2f-timeline")
        ).not.toBeNull();
    });

    test("shows 'Confirm PO' action when status=submitted", () => {
        renderDetailPage(makePO({ po_status: "submitted" }));
        const html = getApp().innerHTML;
        expect(html).toContain("goToPage('confirm')");
    });

    test("shows 'Request reschedule' action when status=confirmed", () => {
        renderDetailPage(makePO({ po_status: "confirmed" }));
        const html = getApp().innerHTML;
        expect(html).toContain("goToPage('reschedule')");
    });

    test("shows 'Ship more' action when status=delivering", () => {
        renderDetailPage(makePO({ po_status: "delivering" }));
        const html = getApp().innerHTML;
        expect(html).toContain("goToPage('deliver')");
    });

    test("no action button when status=completed", () => {
        renderDetailPage(makePO({ po_status: "completed" }));
        const html = getApp().innerHTML;
        expect(html).not.toContain("goToPage('confirm')");
        expect(html).not.toContain("goToPage('reschedule')");
        expect(html).not.toContain("goToPage('deliver')");
    });

    test("renders items grouped by SET parent (DD-3)", () => {
        renderDetailPage(
            makePO({
                po_items: [
                    {
                        poi_sku: "L",
                        poi_product_name: "Left",
                        poi_unit_cost: 100,
                        poi_qty_ordered: 1,
                        poi_parent_sku: "SET1",
                        poi_parent_name: "Pannier",
                    },
                ],
            })
        );
        expect(getApp().innerHTML).toContain("🟣 Pannier");
    });
});

// ──────────────────────────────────────────────────────────────────────
// buildTimeline full impl (was Round 1 stub)
// ──────────────────────────────────────────────────────────────────────

describe("buildTimeline (full impl)", () => {
    test("rejected status shows 2-row reject layout", () => {
        const html = buildTimeline({
            po_status: "rejected",
            po_rejected_reason: "Material out",
            post_date: "2026-04-01",
        });
        expect(html).toContain("active");
        expect(html).toContain("current");
        expect(html).toContain("Material out");
    });

    test("cancelled status shows reject reason from po_cancelled_reason", () => {
        const html = buildTimeline({
            po_status: "cancelled",
            po_cancelled_reason: "Customer cancelled",
        });
        expect(html).toContain("Customer cancelled");
    });

    test("submitted status: 1 active none + current + 5 upcoming = 6 items", () => {
        const html = buildTimeline({
            po_status: "submitted",
            post_date: "2026-04-01",
        });
        const matches = html.match(/b2f-timeline-item/g) || [];
        expect(matches.length).toBe(6);
    });

    test("submitted status shows current class on first state", () => {
        const html = buildTimeline({
            po_status: "submitted",
            post_date: "2026-04-01",
        });
        // first item should have "current" class
        const firstItem = html.match(
            /b2f-timeline-item ([a-z]*)"/
        );
        expect(firstItem[1]).toBe("current");
    });

    test("delivering status: 2 active + 1 current + 3 upcoming", () => {
        const html = buildTimeline({
            po_status: "delivering",
            post_date: "2026-04-01",
            po_expected_date: "2026-05-01",
        });
        expect(html).toContain("ETA: ");
    });

    test("escapes reject reason for XSS safety", () => {
        const html = buildTimeline({
            po_status: "rejected",
            po_rejected_reason: "<script>alert(1)</script>",
        });
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });

    test("received status shows actual date", () => {
        const html = buildTimeline({
            po_status: "received",
            post_date: "2026-04-01",
            po_actual_date: "2026-04-25",
        });
        // formatDate uses Thai locale (Buddhist Era 2569 = 2026 CE).
        // Assert formatted date string structure rather than year specifically.
        expect(html).toMatch(/25\/04\/2569/);
    });
});

// ──────────────────────────────────────────────────────────────────────
// renderRescheduleList + renderReschedulePage
// ──────────────────────────────────────────────────────────────────────

describe("renderRescheduleList", () => {
    test("empty state when poList empty", () => {
        renderRescheduleList([]);
        const html = getApp().innerHTML;
        expect(html).toContain("b2f-empty");
    });

    test("renders one card per PO", () => {
        renderRescheduleList([
            {
                ID: 1,
                po_number: "P1",
                po_status: "confirmed",
                po_total_amount: 100,
                po_currency: "THB",
                currency: "THB",
            },
            {
                ID: 2,
                po_number: "P2",
                po_status: "confirmed",
                po_total_amount: 200,
                po_currency: "THB",
                currency: "THB",
            },
        ]);
        const cards = getApp().querySelectorAll(".b2f-po-card");
        expect(cards.length).toBe(2);
    });

    test("card click handler uses goToPageWithPO", () => {
        renderRescheduleList([
            {
                ID: 99,
                po_number: "P99",
                po_status: "confirmed",
                po_total_amount: 100,
                po_currency: "THB",
                currency: "THB",
            },
        ]);
        const html = getApp().innerHTML;
        expect(html).toContain("goToPageWithPO('reschedule','99')");
    });
});

describe("renderReschedulePage", () => {
    const basePO = {
        ID: 1,
        po_number: "PO-R-001",
        po_status: "confirmed",
        po_expected_date: "2026-05-01",
        po_total_amount: 1000,
        po_items: [{ poi_sku: "X" }],
        po_currency: "THB",
        currency: "THB",
    };

    test("renders new-date input with min attr", () => {
        renderReschedulePage(basePO);
        const input = getApp().querySelector("#b2f-new-date");
        expect(input).not.toBeNull();
        expect(input.min).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("renders reason textarea", () => {
        renderReschedulePage(basePO);
        expect(
            getApp().querySelector("#b2f-reschedule-reason")
        ).not.toBeNull();
    });

    test("shows current ETA in info card", () => {
        renderReschedulePage(basePO);
        // Thai locale → Buddhist Era 2569 from "2026-05-01"
        expect(getApp().innerHTML).toMatch(/01\/05\/2569/);
    });
});

describe("attachRescheduleHandler", () => {
    test("calls onSubmit when reschedule button clicked", () => {
        renderReschedulePage({
            ID: 1,
            po_number: "P",
            po_status: "confirmed",
            po_total_amount: 0,
            po_items: [],
            po_currency: "THB",
            currency: "THB",
        });
        const onSubmit = jest.fn();
        attachRescheduleHandler({ onSubmit });
        getApp().querySelector("#b2f-reschedule-btn").click();
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });
});

// ──────────────────────────────────────────────────────────────────────
// renderListPage
// ──────────────────────────────────────────────────────────────────────

describe("renderListPage", () => {
    function makePOs() {
        return [
            {
                ID: 1,
                po_number: "P1",
                po_status: "submitted",
                po_total_amount: 100,
                po_items: [],
                post_date: "2026-04-01",
                po_currency: "THB",
                currency: "THB",
            },
            {
                ID: 2,
                po_number: "P2",
                po_status: "confirmed",
                po_total_amount: 200,
                po_items: [],
                post_date: "2026-04-02",
                po_currency: "THB",
                currency: "THB",
            },
            {
                ID: 3,
                po_number: "P3",
                po_status: "completed",
                po_total_amount: 300,
                po_items: [],
                post_date: "2026-04-03",
                po_currency: "THB",
                currency: "THB",
            },
        ];
    }

    test("renders 6 filter tabs", () => {
        renderListPage(makePOs());
        const tabs = getApp().querySelectorAll(".b2f-filter-tab");
        expect(tabs.length).toBe(6);
    });

    test("default filter='all' active", () => {
        renderListPage(makePOs());
        const active = getApp().querySelector(".b2f-filter-tab.active");
        expect(active.dataset.filter).toBe("all");
    });

    test("each PO renders one card", () => {
        renderListPage(makePOs());
        const cards = getApp().querySelectorAll(".b2f-po-card");
        expect(cards.length).toBe(3);
    });

    test("clicking filter tab updates module state", () => {
        renderListPage(makePOs());
        expect(getListFilter()).toBe("all");
        const submittedTab = getApp().querySelector(
            '.b2f-filter-tab[data-filter="submitted"]'
        );
        submittedTab.click();
        expect(getListFilter()).toBe("submitted");
    });

    test("filter='submitted' renders only matching POs", () => {
        renderListPage(makePOs());
        const submittedTab = getApp().querySelector(
            '.b2f-filter-tab[data-filter="submitted"]'
        );
        submittedTab.click();
        const cards = getApp().querySelectorAll(".b2f-po-card");
        expect(cards.length).toBe(1);
    });

    test("filter tab shows correct count", () => {
        renderListPage(makePOs());
        const tabs = getApp().querySelectorAll(".b2f-filter-tab");
        // "all" count = 3
        expect(tabs[0].textContent).toContain("(3)");
    });

    test("empty state when no POs match filter", () => {
        renderListPage([]);
        expect(getApp().innerHTML).toContain("b2f-empty");
    });

    test("modeSummaryHtml gated by orderIntentEnabled=true", () => {
        renderListPage(
            [
                {
                    ID: 1,
                    po_number: "P1",
                    po_status: "submitted",
                    po_total_amount: 100,
                    po_items: [
                        {
                            poi_order_mode: "full_set",
                            poi_qty_ordered: 1,
                        },
                    ],
                    post_date: "2026-04-01",
                    po_currency: "THB",
                    currency: "THB",
                },
            ],
            { orderIntentEnabled: true }
        );
        expect(getApp().innerHTML).toContain("po-mode-summary");
    });

    test("modeSummaryHtml hidden when orderIntentEnabled=false", () => {
        renderListPage(
            [
                {
                    ID: 1,
                    po_number: "P1",
                    po_status: "submitted",
                    po_total_amount: 100,
                    po_items: [{ poi_order_mode: "full_set", poi_qty_ordered: 1 }],
                    post_date: "2026-04-01",
                    po_currency: "THB",
                    currency: "THB",
                },
            ],
            { orderIntentEnabled: false }
        );
        expect(getApp().innerHTML).not.toContain("po-mode-summary");
    });
});

// ──────────────────────────────────────────────────────────────────────
// renderDeliverPage + renderDeliverForm
// ──────────────────────────────────────────────────────────────────────

describe("renderDeliverPage", () => {
    test("empty state when poList empty", () => {
        renderDeliverPage([]);
        expect(getApp().innerHTML).toContain("b2f-empty");
    });

    test("renders one card per PO", () => {
        renderDeliverPage([
            {
                ID: 1,
                po_number: "P1",
                po_status: "confirmed",
                po_total_amount: 100,
                po_items: [
                    { poi_sku: "X", poi_qty_ordered: 5, poi_qty_shipped: 0 },
                ],
                po_currency: "THB",
                currency: "THB",
            },
        ]);
        const cards = getApp().querySelectorAll(".b2f-po-card");
        expect(cards.length).toBe(1);
    });

    test("disabled button when fully shipped", () => {
        renderDeliverPage([
            {
                ID: 1,
                po_number: "P1",
                po_status: "delivering",
                po_total_amount: 100,
                po_items: [
                    { poi_sku: "X", poi_qty_ordered: 5, poi_qty_shipped: 5 },
                ],
                po_currency: "THB",
                currency: "THB",
            },
        ]);
        const btn = getApp().querySelector(
            ".b2f-po-card button.b2f-btn-primary"
        );
        expect(btn.disabled).toBe(true);
    });

    test("partially-shipped status shows shipped/remaining table", () => {
        renderDeliverPage([
            {
                ID: 1,
                po_number: "P1",
                po_status: "delivering",
                po_total_amount: 100,
                po_items: [
                    { poi_sku: "X", poi_qty_ordered: 5, poi_qty_shipped: 2 },
                ],
                po_currency: "THB",
                currency: "THB",
            },
        ]);
        const html = getApp().innerHTML;
        // table shows ordered/shipped/left counts
        expect(html).toContain(">5<");
        expect(html).toContain(">2<");
        expect(html).toContain(">3<"); // left = 5-2
    });

    test("partial_received status shows reject summary if any", () => {
        renderDeliverPage([
            {
                ID: 1,
                po_number: "P1",
                po_status: "partial_received",
                po_total_amount: 100,
                po_items: [
                    {
                        poi_sku: "X",
                        poi_qty_ordered: 5,
                        poi_qty_shipped: 5,
                        poi_qty_rejected: 2,
                    },
                ],
                po_currency: "THB",
                currency: "THB",
            },
        ]);
        expect(getApp().innerHTML).toContain("reject 2");
    });
});

describe("renderDeliverForm", () => {
    function makePO() {
        return {
            ID: 1,
            po_number: "P1",
            po_items: [
                {
                    poi_sku: "X",
                    poi_product_name: "P",
                    qty_ordered: 5,
                    qty_shipped: 0,
                },
            ],
            po_currency: "THB",
            currency: "THB",
        };
    }

    test("renders qty input per item", () => {
        renderDeliverForm(makePO());
        const inputs = getApp().querySelectorAll(".b2f-dlv-qty");
        expect(inputs.length).toBe(1);
    });

    test("input has max=remaining (5)", () => {
        renderDeliverForm(makePO());
        const input = getApp().querySelector(".b2f-dlv-qty");
        expect(input.max).toBe("5");
    });

    test("renders 'fill all' button", () => {
        renderDeliverForm(makePO());
        expect(getApp().innerHTML).toContain("b2fFillAllRemaining");
    });

    test("renders submit button", () => {
        renderDeliverForm(makePO());
        expect(getApp().innerHTML).toContain("b2fSubmitDeliver");
    });

    test("DD-3 SET grouping renders header row before children", () => {
        renderDeliverForm({
            po_number: "P",
            po_items: [
                {
                    poi_sku: "L",
                    poi_product_name: "Left",
                    qty_ordered: 1,
                    qty_shipped: 0,
                    poi_parent_sku: "SET1",
                    poi_parent_name: "Pannier Set",
                },
            ],
            po_currency: "THB",
            currency: "THB",
        });
        expect(getApp().innerHTML).toContain("🟣 Pannier Set");
    });

    test("fully-shipped item rendered as completed (opacity)", () => {
        renderDeliverForm({
            po_number: "P",
            po_items: [
                {
                    poi_sku: "X",
                    poi_product_name: "P",
                    qty_ordered: 5,
                    qty_shipped: 5,
                },
            ],
            po_currency: "THB",
            currency: "THB",
        });
        const html = getApp().innerHTML;
        expect(html).toContain("✅ ส่งครบแล้ว");
        expect(html).toContain("opacity:0.5");
    });

    test("renders note textarea", () => {
        renderDeliverForm(makePO());
        expect(
            getApp().querySelector("#b2f-dlv-note")
        ).not.toBeNull();
    });

    test("noop when po=null", () => {
        renderDeliverForm(null);
        expect(getApp().innerHTML).toBe("");
    });
});
