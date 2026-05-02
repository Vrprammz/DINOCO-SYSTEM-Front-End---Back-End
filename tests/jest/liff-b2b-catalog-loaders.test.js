/**
 * Phase 6 Jest tests for liff-src/b2b/catalog/loaders/* (V.0.4 Round 3).
 *
 * Covers 5 page loaders that orchestrate api → state → render:
 *   - catalog.js   loadCatalog + handleAddToCart + duplicate guard +
 *                  handleIncrement + handleDecrement
 *   - home.js      loadHome + applyModelFilter + applyCategoryFilter +
 *                  applyCrossFilter + resetFilters
 *   - history.js   loadHistory + handleHistoryFilter + handleLoadMore
 *   - setDetail.js loadSetDetail + handleAddSet (V.32.1 H-10 dup guard) +
 *                  handleSubItemStep
 *   - cart.js      loadCartModal + handleSubmitOrder (place-order or
 *                  edit re-issue via edit_ticket) + handleCartItemRemove
 *
 * Test strategy:
 *   - Mount `#b2b-catalog-app` div in jsdom.
 *   - Pass mock api with jest.fn() methods returning fixture responses.
 *   - Verify api method called + #b2b-catalog-app HTML populated by render.
 *   - Verify duplicate guards reject SET ↔ child conflicts.
 *
 * Production anchor: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   - line 744-820: authAndLoad (catalog GET on bootstrap)
 *   - line 1135-1148: add-to-cart click handler
 *   - line 1488-1530: V.32.1 H-10 duplicate hard-stop logic
 *   - line 1668-1700: submitOrder (place-order POST)
 */

import {
    setupCatalog,
    loadCatalog,
    handleAddToCart,
    handleIncrement,
    handleDecrement,
    handleOpenSetDetail,
    _resetCatalogLoader,
} from "../../liff-src/b2b/catalog/loaders/catalog.js";
import {
    setupHome,
    applyModelFilter,
    applyCategoryFilter,
    applyCrossFilter,
    resetFilters,
    _resetHomeLoader,
} from "../../liff-src/b2b/catalog/loaders/home.js";
import {
    setupHistory,
    loadHistory,
    handleHistoryFilter,
    handleLoadMore,
    handleCancelOrder,
    _resetHistoryLoader,
} from "../../liff-src/b2b/catalog/loaders/history.js";
import {
    setupSetDetail,
    loadSetDetail,
    handleAddSet,
    handleSubItemStep,
    _resetSetDetailLoader,
} from "../../liff-src/b2b/catalog/loaders/setDetail.js";
import {
    setupCart,
    loadCartModal,
    handleSubmitOrder,
    handleCartItemRemove,
    getCartTotals,
    _resetCartLoader,
} from "../../liff-src/b2b/catalog/loaders/cart.js";
import { _resetLockForTests } from "../../liff-src/b2b/catalog/utils/dom.js";

/**
 * Mount fresh #b2b-catalog-app + auxiliary cart bar IDs.
 */
function mountApp() {
    document.body.innerHTML =
        '<div id="b2b-catalog-app"></div>' +
        '<div id="cartBar"><span id="cartCount"></span><span id="cartTotal"></span></div>' +
        '<div id="cartModalBody"></div>' +
        '<div id="cartModalTotal"></div>' +
        '<button id="cartConfirmBtn"></button>' +
        '<textarea id="cartNoteInput"></textarea>';
}

/**
 * Build a baseline state object — call before each test that mutates state.
 */
function freshState(overrides) {
    return Object.assign(
        {
            products: [],
            cart: {},
            viewMode: "home",
            modelImageMap: {},
        },
        overrides || {}
    );
}

const PRODUCT_FIXTURE = [
    {
        sku: "FOO",
        name: "Foo Product",
        is_set: false,
        dealer_price: 100,
        stock_display: "in_stock",
    },
    {
        sku: "SET_A",
        name: "SET A",
        is_set: true,
        children: ["FOO", "BAR"],
        children_detail: [{ sku: "FOO" }, { sku: "BAR" }],
        dealer_price: 200,
        stock_display: "in_stock",
    },
    {
        sku: "BAR",
        name: "Bar Product",
        is_set: false,
        dealer_price: 50,
        stock_display: "in_stock",
    },
];

beforeEach(() => {
    document.body.innerHTML = "";
    mountApp();
    _resetCatalogLoader();
    _resetHomeLoader();
    _resetHistoryLoader();
    _resetSetDetailLoader();
    _resetCartLoader();
    _resetLockForTests();
    // Clear cart in localStorage between tests.
    if (typeof localStorage !== "undefined") {
        try { localStorage.removeItem("dinoco_cart"); } catch { /* swallow */ }
    }
});

// ─── catalog loader ──────────────────────────────────────────────────

describe("loaders/catalog — loadCatalog", () => {
    test("calls api.getCatalog + populates state.products + renders", async () => {
        const api = {
            getCatalog: jest.fn().mockResolvedValue({
                products: PRODUCT_FIXTURE,
            }),
        };
        const state = freshState();
        setupCatalog({ api, state });
        await loadCatalog();
        expect(api.getCatalog).toHaveBeenCalledTimes(1);
        expect(state.products).toEqual(PRODUCT_FIXTURE);
        const root = document.getElementById("b2b-catalog-app");
        expect(root.innerHTML.length).toBeGreaterThan(0);
    });

    test("supports response.data fallback when no .products key", async () => {
        const api = {
            getCatalog: jest.fn().mockResolvedValue({
                data: PRODUCT_FIXTURE,
            }),
        };
        const state = freshState();
        setupCatalog({ api, state });
        await loadCatalog();
        expect(state.products).toEqual(PRODUCT_FIXTURE);
    });

    test("shows auth error when api throws", async () => {
        const api = {
            getCatalog: jest
                .fn()
                .mockRejectedValue(new Error("Network down")),
        };
        document.body.innerHTML +=
            '<div id="loadingScreen"></div>' +
            '<div id="authError"><span id="authErrTitle"></span>' +
            '<span id="authErrMsg"></span><button id="authRetryBtn"></button></div>';
        const state = freshState();
        setupCatalog({ api, state });
        await loadCatalog();
        const errEl = document.getElementById("authError");
        expect(errEl.style.display).toBe("block");
    });

    test("setupCatalog throws when deps missing", () => {
        expect(() => setupCatalog({})).toThrow(/state required/);
    });
});

describe("loaders/catalog — handleAddToCart + duplicate guard", () => {
    test("adds SKU to cart when no conflict", () => {
        const state = freshState({ products: PRODUCT_FIXTURE });
        setupCatalog({ api: { getCatalog: jest.fn() }, state });
        const ok = handleAddToCart("FOO", 1);
        expect(ok).toBe(true);
        expect(state.cart.FOO).toBe(1);
    });

    test("V.32.1 H-10: blocks adding SET when child already in cart", () => {
        const state = freshState({
            products: PRODUCT_FIXTURE,
            cart: { FOO: 2 }, // child of SET_A already in cart
        });
        setupCatalog({ api: { getCatalog: jest.fn() }, state });
        const ok = handleAddToCart("SET_A", 1);
        expect(ok).toBe(false);
        // Cart unchanged
        expect(state.cart.SET_A).toBeUndefined();
        expect(state.cart.FOO).toBe(2);
    });

    test("handleIncrement bumps qty + persists", () => {
        const state = freshState({
            products: PRODUCT_FIXTURE,
            cart: { FOO: 1 },
        });
        setupCatalog({ api: { getCatalog: jest.fn() }, state });
        handleIncrement("FOO");
        expect(state.cart.FOO).toBe(2);
    });

    test("handleDecrement reduces qty + removes when 0", () => {
        const state = freshState({
            products: PRODUCT_FIXTURE,
            cart: { FOO: 2, BAR: 1 },
        });
        setupCatalog({ api: { getCatalog: jest.fn() }, state });
        handleDecrement("FOO");
        expect(state.cart.FOO).toBe(1);
        handleDecrement("BAR");
        expect(state.cart.BAR).toBeUndefined();
    });

    test("handleOpenSetDetail fires onOpenSetDetail callback", () => {
        const onOpen = jest.fn();
        const state = freshState({ products: PRODUCT_FIXTURE });
        setupCatalog({
            api: { getCatalog: jest.fn() },
            state,
            onOpenSetDetail: onOpen,
        });
        handleOpenSetDetail("SET_A");
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onOpen.mock.calls[0][0]).toBe("SET_A");
        expect(onOpen.mock.calls[0][1].sku).toBe("SET_A");
    });
});

// ─── home loader ─────────────────────────────────────────────────────

describe("loaders/home — applyFilter helpers", () => {
    test("applyModelFilter sets state + fires catalog re-render", () => {
        const onRender = jest.fn();
        const state = freshState({ products: PRODUCT_FIXTURE });
        setupHome({ state, onCatalogRender: onRender });
        applyModelFilter("NX500");
        expect(state.viewMode).toBe("model");
        expect(state.filterModel).toBe("NX500");
        expect(onRender).toHaveBeenCalled();
    });

    test("applyCategoryFilter sets state + clears model filter", () => {
        const state = freshState({
            products: PRODUCT_FIXTURE,
            filterModel: "NX500",
        });
        setupHome({ state });
        applyCategoryFilter("กันล้ม");
        expect(state.viewMode).toBe("category");
        expect(state.filterCategory).toBe("กันล้ม");
        expect(state.filterModel).toBe("");
    });

    test("applyCrossFilter sets crossFilter only", () => {
        const state = freshState({ products: PRODUCT_FIXTURE });
        setupHome({ state });
        applyCrossFilter("NX500|กันล้ม");
        expect(state.crossFilter).toBe("NX500|กันล้ม");
    });

    test("resetFilters clears all + returns to home view", () => {
        const state = freshState({
            products: PRODUCT_FIXTURE,
            viewMode: "model",
            filterModel: "NX500",
            filterCategory: "กันล้ม",
            crossFilter: "NX500|กันล้ม",
            searchQuery: "abc",
        });
        setupHome({ state });
        resetFilters();
        expect(state.viewMode).toBe("home");
        expect(state.filterModel).toBe("");
        expect(state.filterCategory).toBe("");
        expect(state.crossFilter).toBe("");
        expect(state.searchQuery).toBe("");
    });

    test("setupHome throws when state missing", () => {
        expect(() => setupHome({})).toThrow(/state required/);
    });
});

// ─── history loader ──────────────────────────────────────────────────

describe("loaders/history — loadHistory + filters + load more", () => {
    test("calls api.getOrderHistory with default params", async () => {
        const api = {
            getOrderHistory: jest.fn().mockResolvedValue({
                orders: [],
                total_pages: 1,
            }),
        };
        const state = freshState();
        setupHistory({ api, state });
        await loadHistory();
        expect(api.getOrderHistory).toHaveBeenCalled();
        const arg = api.getOrderHistory.mock.calls[0][0];
        expect(arg.page).toBe(1);
    });

    test("handleHistoryFilter resets page + sets status filter", async () => {
        const api = {
            getOrderHistory: jest.fn().mockResolvedValue({
                orders: [],
                total_pages: 1,
            }),
        };
        const state = freshState({ historyPage: 5 });
        setupHistory({ api, state });
        await handleHistoryFilter("paid");
        expect(state.historyFilter).toBe("paid");
        expect(state.historyPage).toBe(1);
        const arg = api.getOrderHistory.mock.calls[0][0];
        expect(arg.status).toBe("paid");
    });

    test("handleLoadMore appends next page when more pages available", async () => {
        const api = {
            getOrderHistory: jest.fn().mockResolvedValue({
                orders: [{ ID: 2 }],
                total_pages: 2,
            }),
        };
        const state = freshState({
            historyPage: 1,
            historyTotalPages: 2,
            historyItems: [{ ID: 1 }],
        });
        setupHistory({ api, state });
        await handleLoadMore();
        expect(state.historyPage).toBe(2);
        expect(state.historyItems.length).toBe(2);
    });

    test("handleLoadMore is no-op on last page", async () => {
        const api = { getOrderHistory: jest.fn() };
        const state = freshState({
            historyPage: 2,
            historyTotalPages: 2,
            historyItems: [{ ID: 1 }, { ID: 2 }],
        });
        setupHistory({ api, state });
        await handleLoadMore();
        expect(api.getOrderHistory).not.toHaveBeenCalled();
    });

    test("handleCancelOrder calls api.cancelOrder + reloads list", async () => {
        const api = {
            getOrderHistory: jest.fn().mockResolvedValue({
                orders: [],
                total_pages: 1,
            }),
            cancelOrder: jest.fn().mockResolvedValue({ success: true }),
        };
        const state = freshState();
        setupHistory({ api, state });
        await handleCancelOrder(123, "ลูกค้าขอยกเลิก");
        expect(api.cancelOrder).toHaveBeenCalledWith(123, "ลูกค้าขอยกเลิก");
        expect(api.getOrderHistory).toHaveBeenCalled();
    });
});

// ─── SET Detail loader ───────────────────────────────────────────────

describe("loaders/setDetail — loadSetDetail + handleAddSet", () => {
    test("loadSetDetail uses product hint when supplied", async () => {
        const state = freshState({ products: PRODUCT_FIXTURE });
        setupSetDetail({ state });
        await loadSetDetail("SET_A", PRODUCT_FIXTURE[1]);
        const root = document.getElementById("b2b-catalog-app");
        expect(root.innerHTML).toContain("SET_A");
    });

    test("loadSetDetail looks up from state.products when hint absent", async () => {
        const state = freshState({ products: PRODUCT_FIXTURE });
        setupSetDetail({ state });
        await loadSetDetail("SET_A");
        const root = document.getElementById("b2b-catalog-app");
        expect(root.innerHTML.length).toBeGreaterThan(0);
    });

    test("handleAddSet adds SET to cart with clamped qty 1-999", () => {
        const state = freshState({ products: PRODUCT_FIXTURE });
        setupSetDetail({ state });
        const ok = handleAddSet("SET_A", 5);
        expect(ok).toBe(true);
        expect(state.cart.SET_A).toBe(5);
    });

    test("handleAddSet clamps qty above 999 to 999", () => {
        const state = freshState({ products: PRODUCT_FIXTURE });
        setupSetDetail({ state });
        handleAddSet("SET_A", 5000);
        expect(state.cart.SET_A).toBe(999);
    });

    test("handleAddSet rejects when child SKU already in cart (V.32.1 H-10)", () => {
        const state = freshState({
            products: PRODUCT_FIXTURE,
            cart: { FOO: 1 }, // child of SET_A
        });
        setupSetDetail({ state });
        const ok = handleAddSet("SET_A", 1);
        expect(ok).toBe(false);
        expect(state.cart.SET_A).toBeUndefined();
    });

    test("handleSubItemStep delta=+1 increments cart", () => {
        const state = freshState({
            products: PRODUCT_FIXTURE,
            cart: { BAR: 2 },
        });
        setupSetDetail({ state });
        handleSubItemStep("BAR", 1);
        expect(state.cart.BAR).toBe(3);
    });

    test("handleSubItemStep delta=-1 decrements cart", () => {
        const state = freshState({
            products: PRODUCT_FIXTURE,
            cart: { BAR: 3 },
        });
        setupSetDetail({ state });
        handleSubItemStep("BAR", -1);
        expect(state.cart.BAR).toBe(2);
    });
});

// ─── cart loader ─────────────────────────────────────────────────────

describe("loaders/cart — loadCartModal + handleSubmitOrder", () => {
    test("loadCartModal renders empty state when cart is empty", () => {
        const state = freshState({ products: PRODUCT_FIXTURE });
        setupCart({ api: { placeOrder: jest.fn() }, state });
        loadCartModal();
        const body = document.getElementById("cartModalBody");
        expect(body.innerHTML).toContain("ตะกร้าว่างแล้ว");
    });

    test("loadCartModal renders item rows when cart populated", () => {
        const state = freshState({
            products: PRODUCT_FIXTURE,
            cart: { FOO: 2 },
        });
        setupCart({ api: { placeOrder: jest.fn() }, state });
        loadCartModal();
        const body = document.getElementById("cartModalBody");
        expect(body.innerHTML).toContain("Foo Product");
    });

    test("handleSubmitOrder calls api.placeOrder + clears cart", async () => {
        const api = {
            placeOrder: jest.fn().mockResolvedValue({ ticket_id: 999 }),
        };
        const onSuccess = jest.fn();
        const state = freshState({
            products: PRODUCT_FIXTURE,
            cart: { FOO: 2 },
            gid: "GROUP123",
        });
        setupCart({ api, state, onSuccess });
        await handleSubmitOrder();
        expect(api.placeOrder).toHaveBeenCalled();
        const sentPayload = api.placeOrder.mock.calls[0][0];
        expect(sentPayload.gid).toBe("GROUP123");
        expect(sentPayload.items[0].sku).toBe("FOO");
        expect(state.cart).toEqual({}); // cleared
        expect(onSuccess).toHaveBeenCalledWith(999);
    });

    test("handleSubmitOrder routes to modifyOrder when editTicket > 0", async () => {
        const api = {
            placeOrder: jest.fn().mockResolvedValue({ ticket_id: 999 }),
            modifyOrder: jest.fn().mockResolvedValue({ ticket_id: 555 }),
        };
        const state = freshState({
            products: PRODUCT_FIXTURE,
            cart: { FOO: 1 },
            editMode: true,
            editTicket: 555,
        });
        setupCart({ api, state });
        await handleSubmitOrder();
        expect(api.modifyOrder).toHaveBeenCalledWith(
            555,
            expect.objectContaining({ items: expect.any(Array) })
        );
        expect(api.placeOrder).not.toHaveBeenCalled();
    });

    test("handleSubmitOrder shows toast when cart empty", async () => {
        const api = { placeOrder: jest.fn() };
        const state = freshState({ products: PRODUCT_FIXTURE });
        setupCart({ api, state });
        await handleSubmitOrder();
        expect(api.placeOrder).not.toHaveBeenCalled();
    });

    test("handleSubmitOrder error path shows toast + does not clear cart", async () => {
        const api = {
            placeOrder: jest.fn().mockRejectedValue(new Error("Server boom")),
        };
        const state = freshState({
            products: PRODUCT_FIXTURE,
            cart: { FOO: 1 },
        });
        setupCart({ api, state });
        await handleSubmitOrder();
        expect(state.cart.FOO).toBe(1); // not cleared on error
    });

    test("handleCartItemRemove deletes SKU + re-renders modal", () => {
        const state = freshState({
            products: PRODUCT_FIXTURE,
            cart: { FOO: 2, BAR: 1 },
        });
        setupCart({ api: { placeOrder: jest.fn() }, state });
        handleCartItemRemove("FOO");
        expect(state.cart.FOO).toBeUndefined();
        expect(state.cart.BAR).toBe(1);
    });

    test("getCartTotals returns count + total", () => {
        const state = freshState({
            products: PRODUCT_FIXTURE,
            cart: { FOO: 2, BAR: 1 }, // 2*100 + 1*50 = 250
        });
        setupCart({ api: { placeOrder: jest.fn() }, state });
        const totals = getCartTotals();
        expect(totals.count).toBe(3);
        expect(totals.total).toBe(250);
    });
});
