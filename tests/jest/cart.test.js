/**
 * Phase 6 Jest tests for liff-src/shared/cart.js
 *
 * Covers all 13 exports:
 *   createCart, addToCart, setCartQty, removeFromCart, clearCart,
 *   computeTotal, computeItemCount, getMissingPriceSkus, toOrderItems,
 *   normalizeSku, saveCartToStorage, loadCartFromStorage, clearCartStorage
 *
 * Production behavior anchors:
 *   - SKU normalization mirrors backend utf8mb4_bin UPPER pattern
 *     (wp_dinoco_product_makers + dinoco_sku_relations)
 *   - addToCart with qty<=0 returns same state (no-op)
 *   - setCartQty with qty<=0 removes the entry
 *   - meta merges shallow (matches B2B/B2F catalog behavior)
 */

import {
    createCart,
    addToCart,
    setCartQty,
    removeFromCart,
    clearCart,
    computeTotal,
    computeItemCount,
    getMissingPriceSkus,
    toOrderItems,
    normalizeSku,
    saveCartToStorage,
    loadCartFromStorage,
    clearCartStorage,
} from "../../liff-src/shared/cart.js";

describe("normalizeSku", () => {
    test("uppercases input", () => {
        expect(normalizeSku("dncgnd37lspros")).toBe("DNCGND37LSPROS");
    });

    test("trims whitespace", () => {
        expect(normalizeSku("  abc  ")).toBe("ABC");
    });

    test("handles null/undefined as empty string", () => {
        expect(normalizeSku(null)).toBe("");
        expect(normalizeSku(undefined)).toBe("");
    });

    test("coerces numeric SKU to string", () => {
        expect(normalizeSku(12345)).toBe("12345");
    });
});

describe("createCart", () => {
    test("returns empty items map", () => {
        const c = createCart();
        expect(c.items).toEqual({});
        expect(typeof c.updatedAt).toBe("number");
    });
});

describe("addToCart", () => {
    test("adds new SKU with qty", () => {
        const c1 = createCart();
        const c2 = addToCart(c1, "ABC", 3);
        expect(c2.items.ABC.qty).toBe(3);
        expect(c2.items.ABC.sku).toBe("ABC");
    });

    test("normalizes lowercase SKU to uppercase key", () => {
        const c1 = createCart();
        const c2 = addToCart(c1, "abc", 1);
        expect(c2.items.ABC).toBeDefined();
        expect(c2.items.abc).toBeUndefined();
    });

    test("accumulates qty on repeated add", () => {
        let c = createCart();
        c = addToCart(c, "X", 2);
        c = addToCart(c, "X", 3);
        expect(c.items.X.qty).toBe(5);
    });

    test("merges meta shallowly", () => {
        let c = createCart();
        c = addToCart(c, "X", 1, { color: "red" });
        c = addToCart(c, "X", 1, { size: "L" });
        expect(c.items.X.meta).toEqual({ color: "red", size: "L" });
    });

    test("default qty is 1", () => {
        const c = addToCart(createCart(), "X");
        expect(c.items.X.qty).toBe(1);
    });

    test("ignores qty <= 0 (no-op)", () => {
        const c1 = createCart();
        const c2 = addToCart(c1, "X", 0);
        const c3 = addToCart(c1, "X", -5);
        expect(c2).toBe(c1);
        expect(c3).toBe(c1);
    });

    test("ignores empty SKU", () => {
        const c1 = createCart();
        expect(addToCart(c1, "", 1)).toBe(c1);
        expect(addToCart(c1, null, 1)).toBe(c1);
    });

    test("immutability: original state unchanged", () => {
        const c1 = createCart();
        const c2 = addToCart(c1, "X", 1);
        expect(c1.items).toEqual({});
        expect(c2).not.toBe(c1);
    });

    test("updates updatedAt", () => {
        const c1 = createCart();
        const before = c1.updatedAt;
        // Small delay to ensure Date.now() ticks
        const later = Date.now() + 1;
        jest.spyOn(Date, "now").mockReturnValue(later);
        const c2 = addToCart(c1, "X", 1);
        expect(c2.updatedAt).toBeGreaterThanOrEqual(before);
        Date.now.mockRestore();
    });
});

describe("setCartQty", () => {
    test("sets absolute qty (overwrites existing)", () => {
        let c = addToCart(createCart(), "X", 5);
        c = setCartQty(c, "X", 2);
        expect(c.items.X.qty).toBe(2);
    });

    test("creates entry if missing", () => {
        const c = setCartQty(createCart(), "Y", 7);
        expect(c.items.Y.qty).toBe(7);
    });

    test("removes entry when qty <= 0", () => {
        let c = addToCart(createCart(), "X", 3);
        c = setCartQty(c, "X", 0);
        expect(c.items.X).toBeUndefined();
    });

    test("removes entry when qty negative", () => {
        let c = addToCart(createCart(), "X", 3);
        c = setCartQty(c, "X", -1);
        expect(c.items.X).toBeUndefined();
    });

    test("normalizes SKU on set", () => {
        const c = setCartQty(createCart(), "abc", 4);
        expect(c.items.ABC.qty).toBe(4);
    });

    test("merges meta when setting", () => {
        let c = addToCart(createCart(), "X", 1, { color: "red" });
        c = setCartQty(c, "X", 5, { size: "L" });
        expect(c.items.X.meta).toEqual({ color: "red", size: "L" });
    });

    test("ignores empty SKU", () => {
        const c1 = createCart();
        expect(setCartQty(c1, "", 5)).toBe(c1);
    });
});

describe("removeFromCart", () => {
    test("removes existing SKU", () => {
        let c = addToCart(createCart(), "X", 2);
        c = removeFromCart(c, "X");
        expect(c.items.X).toBeUndefined();
    });

    test("noop on missing SKU", () => {
        const c1 = createCart();
        const c2 = removeFromCart(c1, "MISSING");
        expect(c2).toBe(c1);
    });

    test("normalizes SKU before remove", () => {
        let c = addToCart(createCart(), "X", 2);
        c = removeFromCart(c, "x");
        expect(c.items.X).toBeUndefined();
    });

    test("ignores empty SKU", () => {
        const c1 = createCart();
        expect(removeFromCart(c1, "")).toBe(c1);
    });

    test("immutability: original state unchanged", () => {
        const c1 = addToCart(createCart(), "X", 1);
        const c2 = removeFromCart(c1, "X");
        expect(c1.items.X).toBeDefined();
        expect(c2.items.X).toBeUndefined();
    });
});

describe("clearCart", () => {
    test("returns empty cart regardless of input", () => {
        const c = clearCart();
        expect(c.items).toEqual({});
    });
});

describe("computeTotal", () => {
    test("sums unit price × qty across items", () => {
        let c = createCart();
        c = addToCart(c, "A", 2);
        c = addToCart(c, "B", 3);
        const total = computeTotal(c, { A: 100, B: 50 });
        expect(total).toBe(350);
    });

    test("missing prices count as 0", () => {
        const c = addToCart(createCart(), "X", 5);
        expect(computeTotal(c, {})).toBe(0);
    });

    test("rounds to 2 decimals", () => {
        const c = addToCart(createCart(), "X", 3);
        const total = computeTotal(c, { X: 33.333 });
        // 3 × 33.333 = 99.999 → round → 100.00
        expect(total).toBe(100);
    });

    test("handles decimal precision correctly", () => {
        const c = addToCart(createCart(), "X", 1);
        const total = computeTotal(c, { X: 19.99 });
        expect(total).toBe(19.99);
    });

    test("empty cart returns 0", () => {
        expect(computeTotal(createCart(), { X: 100 })).toBe(0);
    });

    test("falls back to entry.sku key in price map", () => {
        // Edge case: priceMap keyed differently from items map key
        // (defensive — both cart key and entry.sku are normalized today,
        // but the function tries both)
        const state = {
            items: {
                A: { sku: "A", qty: 2, meta: {} },
            },
            updatedAt: 0,
        };
        expect(computeTotal(state, { A: 25 })).toBe(50);
    });

    test("coerces non-numeric prices", () => {
        const c = addToCart(createCart(), "X", 2);
        expect(computeTotal(c, { X: "50" })).toBe(100);
    });
});

describe("computeItemCount", () => {
    test("sums qty across items", () => {
        let c = createCart();
        c = addToCart(c, "A", 2);
        c = addToCart(c, "B", 3);
        expect(computeItemCount(c)).toBe(5);
    });

    test("empty cart returns 0", () => {
        expect(computeItemCount(createCart())).toBe(0);
    });
});

describe("getMissingPriceSkus", () => {
    test("returns SKUs absent from price map", () => {
        let c = createCart();
        c = addToCart(c, "A", 1);
        c = addToCart(c, "B", 1);
        c = addToCart(c, "C", 1);
        expect(getMissingPriceSkus(c, { A: 100 })).toEqual(["B", "C"]);
    });

    test("returns empty array when all present", () => {
        const c = addToCart(createCart(), "X", 1);
        expect(getMissingPriceSkus(c, { X: 50 })).toEqual([]);
    });

    test("empty cart returns empty array", () => {
        expect(getMissingPriceSkus(createCart(), {})).toEqual([]);
    });
});

describe("toOrderItems", () => {
    test("flattens cart to POST payload format", () => {
        let c = createCart();
        c = addToCart(c, "A", 2, { color: "red" });
        c = addToCart(c, "B", 1);
        const items = toOrderItems(c);
        expect(items).toHaveLength(2);
        expect(items).toContainEqual({ sku: "A", qty: 2, color: "red" });
        expect(items).toContainEqual({ sku: "B", qty: 1 });
    });

    test("empty cart returns empty array", () => {
        expect(toOrderItems(createCart())).toEqual([]);
    });

    test("meta fields override sku/qty if present in meta (current behavior)", () => {
        // Documents current behavior: spread order is { sku, qty, ...meta }
        // so meta keys win over sku/qty. Caller should avoid meta keys
        // named 'sku' or 'qty'.
        const state = {
            items: {
                A: { sku: "A", qty: 2, meta: { sku: "OVERRIDE", note: "x" } },
            },
            updatedAt: 0,
        };
        const items = toOrderItems(state);
        expect(items[0].sku).toBe("OVERRIDE");
        expect(items[0].qty).toBe(2);
        expect(items[0].note).toBe("x");
    });
});

describe("persistence helpers (jsdom localStorage)", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test("saveCartToStorage + loadCartFromStorage roundtrip", () => {
        let c = createCart();
        c = addToCart(c, "X", 5);
        const ok = saveCartToStorage("dinoco_test_cart", c);
        expect(ok).toBe(true);

        const loaded = loadCartFromStorage("dinoco_test_cart");
        expect(loaded.items.X.qty).toBe(5);
    });

    test("loadCartFromStorage returns empty cart when key missing", () => {
        const c = loadCartFromStorage("nonexistent_key");
        expect(c.items).toEqual({});
    });

    test("loadCartFromStorage returns empty cart on malformed JSON", () => {
        window.localStorage.setItem("bad_key", "not-json{");
        const c = loadCartFromStorage("bad_key");
        expect(c.items).toEqual({});
    });

    test("loadCartFromStorage returns empty cart when payload missing items", () => {
        window.localStorage.setItem("partial_key", JSON.stringify({ foo: "bar" }));
        const c = loadCartFromStorage("partial_key");
        expect(c.items).toEqual({});
    });

    test("clearCartStorage removes entry", () => {
        saveCartToStorage("k1", addToCart(createCart(), "X", 1));
        expect(window.localStorage.getItem("k1")).not.toBeNull();
        const ok = clearCartStorage("k1");
        expect(ok).toBe(true);
        expect(window.localStorage.getItem("k1")).toBeNull();
    });

    test("saveCartToStorage tags payload with _schema=1", () => {
        saveCartToStorage("schema_key", createCart());
        const raw = window.localStorage.getItem("schema_key");
        const parsed = JSON.parse(raw);
        expect(parsed._schema).toBe(1);
    });

    test("save returns false when localStorage throws", () => {
        const setItemSpy = jest
            .spyOn(window.localStorage.__proto__, "setItem")
            .mockImplementation(() => {
                throw new Error("QuotaExceeded");
            });
        const ok = saveCartToStorage("x", createCart());
        expect(ok).toBe(false);
        setItemSpy.mockRestore();
    });

    test("clear returns false when localStorage throws", () => {
        const removeItemSpy = jest
            .spyOn(window.localStorage.__proto__, "removeItem")
            .mockImplementation(() => {
                throw new Error("Boom");
            });
        const ok = clearCartStorage("x");
        expect(ok).toBe(false);
        removeItemSpy.mockRestore();
    });
});

describe("integration scenarios", () => {
    test("B2B catalog flow: add → adjust qty → compute total → submit", () => {
        let c = createCart();

        // User adds 2 of SET-A and 1 of LEAF-X
        c = addToCart(c, "DNCSETXL7500X001H", 2);
        c = addToCart(c, "DNCGNDPRO5500", 1);

        // User changes SET-A qty to 3 via stepper
        c = setCartQty(c, "DNCSETXL7500X001H", 3);

        const priceMap = {
            DNCSETXL7500X001H: 7500,
            DNCGNDPRO5500: 5500,
        };

        expect(computeItemCount(c)).toBe(4);
        expect(computeTotal(c, priceMap)).toBe(28000); // 7500*3 + 5500*1
        expect(getMissingPriceSkus(c, priceMap)).toEqual([]);

        const payload = toOrderItems(c);
        expect(payload).toHaveLength(2);
    });

    test("missing price flagging works after stale catalog refresh", () => {
        let c = createCart();
        c = addToCart(c, "OLD-SKU", 1);
        c = addToCart(c, "NEW-SKU", 2);

        // Catalog refresh removes OLD-SKU
        const priceMap = { "NEW-SKU": 100 };

        const missing = getMissingPriceSkus(c, priceMap);
        expect(missing).toEqual(["OLD-SKU"]);
    });

    test("clearCart resets to empty state", () => {
        let c = addToCart(createCart(), "X", 5);
        c = clearCart(c);
        expect(c.items).toEqual({});
        expect(computeItemCount(c)).toBe(0);
    });
});
