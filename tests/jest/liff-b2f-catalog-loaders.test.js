/**
 * Round 3 Jest tests for liff-src/b2f/catalog/loaders/* (V.0.4).
 *
 * Covers (mounted on jsdom):
 *   - makerHome: setupMakerHome() + loadMakerHome() renders cards + click
 *     mutates state.makerId + fires onPick
 *   - catalog: loadCatalog() fetches + caches products + injects HTML +
 *     handleAddToCart() mutates cart + saves to localStorage
 *   - setDetail: loadSetDetail() injects header + items, handleStepperChange
 *     deltas qty correctly
 *   - cart: loadCartView() renders cart sheet + foreign currency fields,
 *     handleSubmitOrder() POSTs /create-po + clears cart on success
 *   - success: loadSuccess() renders + schedules autoclose
 */

import {
    setupMakerHome,
    loadMakerHome,
    handlePickMaker,
    _resetMakerHome,
} from "../../liff-src/b2f/catalog/loaders/makerHome.js";
import {
    setupCatalog,
    loadCatalog,
    handleAddToCart,
    setQty,
    _resetCatalogLoader,
} from "../../liff-src/b2f/catalog/loaders/catalog.js";
import {
    setupSetDetail,
    loadSetDetail,
    handleStepperChange,
    _resetSetDetailLoader,
} from "../../liff-src/b2f/catalog/loaders/setDetail.js";
import {
    setupCart,
    loadCartView,
    handleSubmitOrder,
    handleReviewGate,
    _resetCartLoader,
} from "../../liff-src/b2f/catalog/loaders/cart.js";
import {
    setupSuccess,
    loadSuccess,
    renderSuccess,
    _cancelAutoClose,
    _resetSuccessLoader,
} from "../../liff-src/b2f/catalog/loaders/success.js";

function mountVite() {
    document.body.innerHTML = '<div id="b2f-catalog-app"></div>';
    return document.getElementById("b2f-catalog-app");
}

beforeEach(() => {
    _resetMakerHome();
    _resetCatalogLoader();
    _resetSetDetailLoader();
    _resetCartLoader();
    _resetSuccessLoader();
    document.body.innerHTML = "";
    try {
        localStorage.clear();
    } catch (_e) {
        /* ignore */
    }
});

afterEach(() => {
    _cancelAutoClose();
});

describe("makerHome loader", () => {
    test("setupMakerHome throws when api missing", () => {
        expect(() => setupMakerHome({})).toThrow();
        expect(() => setupMakerHome({ api: {}, state: null })).toThrow();
    });

    test("loadMakerHome renders cards with data-action=pick-maker (delegation taxonomy)", async () => {
        const mount = mountVite();
        const state = { makerId: null };
        const onPick = jest.fn();
        const api = {
            getMakers: jest.fn().mockResolvedValue({
                data: [
                    { id: 1, name: "Maker A", currency: "THB" },
                    { id: 2, name: "Maker B", currency: "USD" },
                ],
            }),
        };
        setupMakerHome({ api, state, onPick });
        await loadMakerHome();
        expect(api.getMakers).toHaveBeenCalled();
        expect(mount.querySelectorAll(".b2f-maker-card").length).toBe(2);
        const firstBtn = /** @type {HTMLElement} */ (mount.querySelector(".b2f-maker-card[data-maker-id='1']"));
        // Round 4 — loader no longer wires per-card listener; emits
        // `data-action="pick-maker"` consumed by central event-delegation.
        expect(firstBtn.getAttribute("data-action")).toBe("pick-maker");
        // The exported `handlePickMaker` is the public action handler that
        // event-delegation invokes — exercise it directly.
        handlePickMaker("1");
        expect(state.makerId).toBe("1");
        expect(onPick).toHaveBeenCalledWith("1");
    });

    test("handlePickMaker is no-op when makerId blank", () => {
        const state = { makerId: null };
        const onPick = jest.fn();
        setupMakerHome({
            api: { getMakers: jest.fn() },
            state,
            onPick,
        });
        handlePickMaker("");
        expect(state.makerId).toBe(null);
        expect(onPick).not.toHaveBeenCalled();
    });

    test("loadMakerHome empty list shows empty marker", async () => {
        const mount = mountVite();
        const api = { getMakers: jest.fn().mockResolvedValue({ data: [] }) };
        setupMakerHome({ api, state: {}, onPick: () => {} });
        await loadMakerHome();
        expect(mount.innerHTML).toMatch(/ไม่พบรายชื่อ/);
    });

    test("loadMakerHome on API error shows error toast", async () => {
        const mount = mountVite();
        const api = { getMakers: jest.fn().mockRejectedValue(new Error("network")) };
        setupMakerHome({ api, state: {} });
        await loadMakerHome();
        expect(mount.innerHTML).toMatch(/โหลดรายชื่อโรงงานไม่สำเร็จ/);
    });
});

describe("catalog loader", () => {
    test("loadCatalog fetches + caches products in state", async () => {
        mountVite();
        const state = { makerId: 5, currency: "THB", showVirtual: false };
        const api = {
            getMakerProducts: jest.fn().mockResolvedValue({
                data: [{ sku: "A", name: "Item A", unit_cost: 100 }],
                sku_relations: { A: ["L", "R"] },
                catalog_map: { L: { name: "Left" } },
            }),
        };
        setupCatalog({ api, state });
        await loadCatalog();
        expect(api.getMakerProducts).toHaveBeenCalledWith(5, { includeVirtual: false });
        expect(state.products).toHaveLength(1);
        expect(state.skuRelations).toEqual({ A: ["L", "R"] });
        expect(state.catalogMap.L.name).toBe("Left");
    });

    test("handleAddToCart mutates state.cart + persists to localStorage", () => {
        const state = {
            makerId: 9,
            cart: {},
            products: [{ sku: "DNCSET500", name: "Crash Bar", unit_cost: 5000 }],
        };
        setupCatalog({ api: { getMakerProducts: jest.fn() }, state });
        const ok = handleAddToCart("DNCSET500", 3, "full_set");
        expect(ok).toBe(true);
        expect(state.cart["DNCSET500"]).toMatchObject({
            sku: "DNCSET500",
            qty: 3,
            unit_cost: 5000,
            order_mode: "full_set",
        });
    });

    test("handleAddToCart with qty=0 deletes the entry", () => {
        const state = {
            makerId: 9,
            cart: { ABC: { sku: "ABC", qty: 5, unit_cost: 100 } },
            products: [],
        };
        setupCatalog({ api: { getMakerProducts: jest.fn() }, state });
        handleAddToCart("ABC", 0);
        expect(state.cart.ABC).toBeUndefined();
    });

    test("setQty calls cart helper + onCartChanged", () => {
        const onCartChanged = jest.fn();
        const state = {
            makerId: 1,
            cart: {},
            products: [{ sku: "X", name: "X", unit_cost: 10 }],
        };
        setupCatalog({ api: {}, state, onCartChanged });
        setQty("X", 2);
        // setCartQty is internal — ensure callback fires
        expect(onCartChanged).toHaveBeenCalled();
    });

    test("loadCatalog error path renders error markup", async () => {
        const mount = mountVite();
        const state = { makerId: 5 };
        const api = { getMakerProducts: jest.fn().mockRejectedValue(new Error("boom")) };
        setupCatalog({ api, state });
        await loadCatalog();
        expect(mount.innerHTML).toMatch(/โหลดสินค้าไม่สำเร็จ/);
    });
});

describe("setDetail loader", () => {
    test("loadSetDetail injects header + back button + items", async () => {
        const mount = mountVite();
        const state = {
            products: [
                { sku: "DNCSET500", name: "Crash Bar SET", unit_cost: 5000 },
            ],
            cart: {},
            skuRelations: { DNCSET500: [] },
            currency: "THB",
        };
        const onAddToCart = jest.fn().mockReturnValue(true);
        setupSetDetail({ api: {}, state, onAddToCart });
        await loadSetDetail("DNCSET500");
        expect(mount.innerHTML).toMatch(/← กลับ/);
        expect(mount.innerHTML).toMatch(/Crash Bar SET/);
    });

    test("loadSetDetail unknown sku renders ErrorState with retry/back (V.0.5 P0.10)", async () => {
        // P0.10 — previously this test expected "no mount mutation" (toast-only).
        // Now: render full ErrorState IN the mount so user gets retry + back actions
        // instead of silent toast that disappears + leaves stale screen below.
        const mount = mountVite();
        const state = { products: [], cart: {}, currency: "THB" };
        setupSetDetail({ api: {}, state, onAddToCart: () => true });
        await loadSetDetail("NONEXISTENT");
        // ErrorState renders role=alert + the not-found Thai message
        expect(mount.innerHTML).toMatch(/role=["']alert["']/);
        expect(mount.innerHTML).toMatch(/ไม่พบรายการนี้|ไม่พบ SET/);
        // Retry + back buttons present
        expect(mount.innerHTML).toMatch(/ลองอีกครั้ง/);
        expect(mount.innerHTML).toMatch(/กลับ/);
        // SKU embedded in error code for support
        expect(mount.innerHTML).toMatch(/NONEXISTENT/);
    });

    test("handleStepperChange increments qty via onAddToCart", () => {
        const state = { cart: { X: { qty: 2 } } };
        const onAddToCart = jest.fn().mockReturnValue(true);
        setupSetDetail({ api: {}, state, onAddToCart });
        handleStepperChange("X", 1);
        expect(onAddToCart).toHaveBeenCalledWith("X", 3, undefined, undefined);
    });

    test("handleStepperChange clamps to 0 minimum", () => {
        const state = { cart: { X: { qty: 1 } } };
        const onAddToCart = jest.fn().mockReturnValue(true);
        setupSetDetail({ api: {}, state, onAddToCart });
        handleStepperChange("X", -5);
        expect(onAddToCart).toHaveBeenCalledWith("X", 0, undefined, undefined);
    });
});

describe("cart loader", () => {
    test("loadCartView renders empty cart marker", () => {
        const mount = mountVite();
        const state = { cart: {}, products: [], currency: "THB", currentView: "cart" };
        setupCart({ api: {}, state });
        loadCartView();
        expect(mount.innerHTML).toMatch(/ตะกร้าว่าง/);
        expect(mount.innerHTML).toMatch(/ตรวจสอบรายการ/);
    });

    test("loadCartView with foreign currency renders exchange rate field", () => {
        const mount = mountVite();
        const state = { cart: {}, products: [], currency: "USD", currentView: "cart" };
        setupCart({ api: {}, state });
        loadCartView();
        expect(mount.innerHTML).toMatch(/อัตราแลกเปลี่ยน/);
        expect(mount.innerHTML).toMatch(/วิธีส่ง/);
    });

    test("handleReviewGate sets state.currentView = review", () => {
        const mount = mountVite();
        const state = { cart: {}, products: [], currency: "THB" };
        setupCart({ api: {}, state });
        handleReviewGate();
        expect(state.currentView).toBe("review");
        expect(mount.innerHTML).toMatch(/ยืนยันสั่ง PO/);
    });

    test("handleSubmitOrder POSTs createPO + clears cart on success", async () => {
        mountVite();
        const onSuccess = jest.fn();
        const state = {
            makerId: 7,
            cart: { ABC: { sku: "ABC", qty: 2, unit_cost: 100, order_mode: "single_leaf", source_sku: "ABC" } },
            currency: "THB",
            orderIntentEnabled: true,
            currentView: "review",
        };
        const api = {
            createPO: jest.fn().mockResolvedValue({
                success: true,
                po_number: "PO-X-1",
                po_id: 42,
                warnings: [],
            }),
        };
        setupCart({ api, state, onSuccess });
        loadCartView(); // ensure DOM has note + shipping fields
        await handleSubmitOrder();
        expect(api.createPO).toHaveBeenCalled();
        const body = api.createPO.mock.calls[0][0];
        expect(body.maker_id).toBe(7);
        expect(body.items).toHaveLength(1);
        expect(body.items[0].order_mode).toBe("single_leaf");
        expect(state.cart).toEqual({});
        expect(onSuccess).toHaveBeenCalledWith("PO-X-1", 42, []);
    });

    test("handleSubmitOrder empty cart bails out without API call", async () => {
        const state = { makerId: 1, cart: {}, currency: "THB" };
        const api = { createPO: jest.fn() };
        setupCart({ api, state });
        await handleSubmitOrder();
        expect(api.createPO).not.toHaveBeenCalled();
    });

    test("handleSubmitOrder no makerId bails out", async () => {
        const state = { makerId: null, cart: { A: { sku: "A", qty: 1 } }, currency: "THB" };
        const api = { createPO: jest.fn() };
        setupCart({ api, state });
        await handleSubmitOrder();
        expect(api.createPO).not.toHaveBeenCalled();
    });

    test("handleSubmitOrder DUPLICATE_PO surfaces error message", async () => {
        mountVite();
        const state = {
            makerId: 1,
            cart: { A: { sku: "A", qty: 1, unit_cost: 100 } },
            currency: "THB",
        };
        const api = {
            createPO: jest.fn().mockResolvedValue({ code: "DUPLICATE_PO", error: "ซ้ำ" }),
        };
        setupCart({ api, state });
        loadCartView();
        await handleSubmitOrder();
        expect(state.cart.A).toBeDefined(); // not cleared on dup
    });

    test("handleSubmitOrder USD without exchange_rate refuses submit", async () => {
        mountVite();
        const state = {
            makerId: 1,
            cart: { A: { sku: "A", qty: 1, unit_cost: 100 } },
            currency: "USD",
        };
        const api = { createPO: jest.fn() };
        setupCart({ api, state });
        loadCartView();
        // exchange rate input is empty
        await handleSubmitOrder();
        expect(api.createPO).not.toHaveBeenCalled();
    });
});

describe("success loader", () => {
    test("renderSuccess injects po number + warnings", () => {
        const html = renderSuccess({
            number: "PO-2026-001",
            id: 99,
            warnings: ["ครบกำหนดเร็วกว่าปกติ"],
        });
        expect(html).toMatch(/PO-2026-001/);
        expect(html).toMatch(/ครบกำหนดเร็วกว่าปกติ/);
    });

    test("loadSuccess injects markup + schedules autoclose", () => {
        const mount = mountVite();
        const state = { lastPO: { number: "PO-X", id: 1, warnings: [] } };
        setupSuccess({ state });
        jest.useFakeTimers();
        loadSuccess();
        expect(mount.innerHTML).toMatch(/PO-X/);
        // Cancel before fake timers run to avoid jsdom liff window error
        _cancelAutoClose();
        jest.useRealTimers();
    });

    test("setupSuccess without state throws", () => {
        expect(() => setupSuccess({})).toThrow();
    });
});
