/**
 * Phase 6 Jest tests for liff-src/b2f/catalog/utils/* (V.0.2 Round 1).
 *
 * Covers 6 utility modules:
 *   - lang.js      — re-exports B2F Maker lang (TH/EN/ZH per maker currency)
 *   - format.js    — currencySymbol, formatNumber, formatCurrency,
 *                    formatDate, escHtml, currencyNameEn
 *   - dom.js       — showToast, showAuthError, showLoading/hideLoading,
 *                    lockBtn/unlockBtn, isLocked, setupOfflineDetection
 *   - cart.js      — V.7.0 schema cart `b2f_cart_v7_<maker>` + 30-day TTL
 *                    + setCartQty + computeItemCount + computeTotal +
 *                    deriveOrderMode + orderModeLabel + orderModeBadgeClass
 *   - hierarchy.js — re-exports B2B leaf/SET/stock + parseModels +
 *                    productMatchesModel + collectModelsWithDescendants +
 *                    buildHierarchyLookup + countTopSetsForProduct +
 *                    isVirtualSet
 *   - badges.js    — modeBadgeHtml + productionModeCardBadgeHtml +
 *                    hierarchyBadgeHtml + virtualSetBadgeHtml +
 *                    unconfirmedBadgeHtml
 *
 * Production behavior anchors:
 *   - Inline V.7.13 b2f_liff_page_js() — every helper here mirrors a
 *     specific function in that source. Drift = visual / cart-persistence
 *     regression in B2F catalog.
 *   - V.7.0 Order Intent contract (3 modes — purple/amber/gray badges).
 *   - V.7.8 L5 schema gate (`_schema === 7` strict).
 *   - DD-2 / DD-3 / DD-7 hierarchy contract via re-exported B2B helpers.
 */

import {
    setupLanguage,
    getLang,
    setLang,
    L,
    statusLabel,
    STATUS_TH,
    STATUS_EN,
    STATUS_ZH,
} from "../../liff-src/b2f/catalog/utils/lang.js";

import {
    currencySymbol,
    formatNumber,
    formatCurrency,
    formatDate,
    escHtml,
    currencyNameEn,
} from "../../liff-src/b2f/catalog/utils/format.js";

import {
    $,
    $$,
    showToast,
    showAuthError,
    showLoading,
    hideLoading,
    lockBtn,
    unlockBtn,
    isLocked,
    setupOfflineDetection,
    _resetLockForTests,
} from "../../liff-src/b2f/catalog/utils/dom.js";

import {
    getCartStorageKey,
    loadCart,
    saveCart,
    clearCart,
    setCartQty,
    deriveOrderMode,
    orderModeLabel,
    orderModeBadgeClass,
    computeItemCount,
    computeTotal,
    CART_STORAGE_KEY_PREFIX,
    CART_SCHEMA_VERSION,
    CART_STALE_TTL_MS,
} from "../../liff-src/b2f/catalog/utils/cart.js";

import {
    getLeafSkus,
    isLeafSku,
    isTopLevelSet,
    computeHierarchyStock,
    getAncestorSkus,
    parseModels,
    productMatchesModel,
    collectModelsWithDescendants,
    buildHierarchyLookup,
    countTopSetsForProduct,
    isVirtualSet,
} from "../../liff-src/b2f/catalog/utils/hierarchy.js";

import {
    modeBadgeHtml,
    productionModeCardBadgeHtml,
    hierarchyBadgeHtml,
    virtualSetBadgeHtml,
    unconfirmedBadgeHtml,
} from "../../liff-src/b2f/catalog/utils/badges.js";

// ──────────────────────────────────────────────────────────────────────
// lang.js — 3-language switch driven by maker currency
// ──────────────────────────────────────────────────────────────────────
describe("b2f/catalog/utils/lang.js", () => {
    beforeEach(() => setupLanguage("THB"));
    test("setupLanguage('THB') → th", () => {
        setupLanguage("THB");
        expect(getLang()).toBe("th");
    });
    test("setupLanguage('USD') → en", () => {
        setupLanguage("USD");
        expect(getLang()).toBe("en");
    });
    test("setupLanguage('CNY') → zh", () => {
        setupLanguage("CNY");
        expect(getLang()).toBe("zh");
    });
    test("setupLanguage(unknown) → th", () => {
        setupLanguage("EUR");
        expect(getLang()).toBe("th");
    });
    test("setupLanguage(empty) → th", () => {
        setupLanguage("");
        expect(getLang()).toBe("th");
    });
    test("L() returns Thai by default", () => {
        setupLanguage("THB");
        expect(L("ไทย", "EN", "ZH")).toBe("ไทย");
    });
    test("L() returns English for USD maker", () => {
        setupLanguage("USD");
        expect(L("ไทย", "Thai", "中文")).toBe("Thai");
    });
    test("L() returns Chinese for CNY maker", () => {
        setupLanguage("CNY");
        expect(L("ไทย", "Thai", "中文")).toBe("中文");
    });
    test("L() falls back to English when zh missing", () => {
        setupLanguage("CNY");
        expect(L("ไทย", "fallback")).toBe("fallback");
    });
    test("setLang() force-overrides", () => {
        setupLanguage("THB");
        setLang("zh");
        expect(getLang()).toBe("zh");
    });
    test("STATUS_TH map contains 12 entries", () => {
        expect(Object.keys(STATUS_TH).length).toBe(12);
    });
    test("STATUS_EN/ZH parallel keys", () => {
        for (const k of Object.keys(STATUS_TH)) {
            expect(STATUS_EN[k]).toBeDefined();
            expect(STATUS_ZH[k]).toBeDefined();
        }
    });
    test("statusLabel('confirmed') → Thai default", () => {
        setupLanguage("THB");
        expect(statusLabel("confirmed")).toBe("รอผลิต");
    });
    test("statusLabel(unknown) → raw key", () => {
        setupLanguage("THB");
        expect(statusLabel("__nope__")).toBe("__nope__");
    });
});

// ──────────────────────────────────────────────────────────────────────
// format.js — multi-currency aware
// ──────────────────────────────────────────────────────────────────────
describe("b2f/catalog/utils/format.js", () => {
    test("currencySymbol('THB') → ฿", () => {
        expect(currencySymbol("THB")).toBe("฿");
    });
    test("currencySymbol('USD') → $", () => {
        expect(currencySymbol("USD")).toBe("$");
    });
    test("currencySymbol('CNY') → ¥", () => {
        expect(currencySymbol("CNY")).toBe("¥");
    });
    test("currencySymbol(undefined) → ฿", () => {
        expect(currencySymbol()).toBe("฿");
    });
    test("currencySymbol(case-insensitive)", () => {
        expect(currencySymbol("usd")).toBe("$");
    });
    test("formatNumber(7040) → 7,040 (no decimals)", () => {
        expect(formatNumber(7040)).toContain("7,040");
    });
    test("formatNumber(7040.5) → trailing decimal", () => {
        const out = formatNumber(7040.5);
        // th-TH locale uses "." for decimal — should contain ".5"
        expect(out).toContain("7,040");
    });
    test("formatNumber(0) → 0", () => {
        expect(formatNumber(0)).toBe("0");
    });
    test("formatNumber(NaN) → 0", () => {
        expect(formatNumber(NaN)).toBe("0");
    });
    test("formatNumber(null) → 0", () => {
        expect(formatNumber(null)).toBe("0");
    });
    test("formatCurrency(1200, 'THB') → ฿1,200", () => {
        expect(formatCurrency(1200, "THB")).toBe("฿1,200");
    });
    test("formatCurrency(1200, 'USD') → $1,200", () => {
        expect(formatCurrency(1200, "USD")).toBe("$1,200");
    });
    test("formatCurrency(1200, 'CNY') → ¥1,200", () => {
        expect(formatCurrency(1200, "CNY")).toBe("¥1,200");
    });
    test("formatDate(null) → '-'", () => {
        expect(formatDate(null)).toBe("-");
    });
    test("formatDate(invalid) → '-'", () => {
        expect(formatDate("not-a-date")).toBe("-");
    });
    test("formatDate(ISO) → DD/MM/YYYY-ish", () => {
        const out = formatDate("2026-04-30");
        expect(out).toMatch(/\d{2}\/\d{2}\//);
    });
    test("escHtml escapes special chars", () => {
        expect(escHtml("<script>alert('x')</script>")).not.toContain("<script>");
    });
    test("escHtml empty input → ''", () => {
        expect(escHtml("")).toBe("");
        expect(escHtml(null)).toBe("");
        expect(escHtml(undefined)).toBe("");
    });
    test("escHtml number input", () => {
        expect(escHtml(42)).toBe("42");
    });
    test("escHtml ampersand", () => {
        expect(escHtml("A & B")).toBe("A &amp; B");
    });
    test("currencyNameEn('THB')", () => {
        expect(currencyNameEn("THB")).toBe("Thai Baht");
    });
    test("currencyNameEn('USD')", () => {
        expect(currencyNameEn("USD")).toBe("US Dollar");
    });
    test("currencyNameEn('CNY')", () => {
        expect(currencyNameEn("CNY")).toBe("Chinese Yuan");
    });
});

// ──────────────────────────────────────────────────────────────────────
// dom.js — DOM helpers + lock pattern
// ──────────────────────────────────────────────────────────────────────
describe("b2f/catalog/utils/dom.js", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        _resetLockForTests();
    });

    test("$ returns null when not found", () => {
        expect($("#nope")).toBeNull();
    });
    test("$$ returns NodeList", () => {
        document.body.innerHTML = '<div class="x"></div><div class="x"></div>';
        expect($$(".x").length).toBe(2);
    });
    test("showToast auto-creates element + sets text", () => {
        showToast("hello");
        const el = document.getElementById("b2fToast");
        expect(el).not.toBeNull();
        expect(el.textContent).toBe("hello");
        expect(el.classList.contains("show")).toBe(true);
    });
    test("showToast type=error adds .error class", () => {
        showToast("oops", "error");
        const el = document.getElementById("b2fToast");
        expect(el.classList.contains("error")).toBe(true);
    });
    test("showToast type=success adds .success class", () => {
        showToast("ok", "success");
        const el = document.getElementById("b2fToast");
        expect(el.classList.contains("success")).toBe(true);
    });
    test("showAuthError populates b2fAuthError", () => {
        document.body.innerHTML =
            '<div id="b2fLoading"></div><div id="b2fMain"></div><div id="b2fAuthError"></div>';
        showAuthError("session expired");
        const box = document.getElementById("b2fAuthError");
        expect(box.style.display).toBe("flex");
        expect(box.textContent).toContain("session expired");
    });
    test("showAuthError escapes HTML", () => {
        document.body.innerHTML =
            '<div id="b2fLoading"></div><div id="b2fMain"></div><div id="b2fAuthError"></div>';
        showAuthError("<img src=x onerror=alert(1)>");
        const box = document.getElementById("b2fAuthError");
        expect(box.innerHTML).not.toContain("<img");
    });
    test("showLoading sets display:block", () => {
        document.body.innerHTML = '<div id="b2fLoading" style="display:none"></div>';
        showLoading();
        expect(document.getElementById("b2fLoading").style.display).toBe("block");
    });
    test("showLoading with custom message", () => {
        document.body.innerHTML =
            '<div id="b2fLoading"><span class="b2f-cat-loading-text"></span></div>';
        showLoading("กำลังโหลด...");
        expect(
            document.querySelector(".b2f-cat-loading-text").textContent
        ).toBe("กำลังโหลด...");
    });
    test("hideLoading", () => {
        document.body.innerHTML = '<div id="b2fLoading" style="display:block"></div>';
        hideLoading();
        expect(document.getElementById("b2fLoading").style.display).toBe("none");
    });
    test("lockBtn returns true on first call", () => {
        const btn = document.createElement("button");
        btn.textContent = "Save";
        expect(lockBtn(btn, "Saving...")).toBe(true);
        expect(btn.disabled).toBe(true);
        expect(btn.textContent).toBe("Saving...");
        expect(isLocked()).toBe(true);
    });
    test("lockBtn returns false when already locked", () => {
        const btn = document.createElement("button");
        lockBtn(btn);
        expect(lockBtn(btn)).toBe(false);
    });
    test("unlockBtn restores button + clears lock", () => {
        const btn = document.createElement("button");
        btn.textContent = "Save";
        lockBtn(btn, "Saving...");
        unlockBtn(btn);
        expect(btn.disabled).toBe(false);
        expect(btn.textContent).toBe("Save");
        expect(isLocked()).toBe(false);
    });
    test("setupOfflineDetection idempotent", () => {
        delete window.__b2fCatOfflineWired;
        setupOfflineDetection();
        const first = window.__b2fCatOfflineWired;
        setupOfflineDetection();
        expect(window.__b2fCatOfflineWired).toBe(first);
    });
});

// ──────────────────────────────────────────────────────────────────────
// cart.js — V.7.0 schema + per-maker scope
// ──────────────────────────────────────────────────────────────────────
describe("b2f/catalog/utils/cart.js", () => {
    beforeEach(() => {
        try {
            localStorage.clear();
        } catch {
            /* ignore */
        }
    });

    test("getCartStorageKey scopes per-maker", () => {
        expect(getCartStorageKey(42)).toBe("b2f_cart_v7_42");
        expect(getCartStorageKey("123")).toBe("b2f_cart_v7_123");
    });
    test("getCartStorageKey null → 0", () => {
        expect(getCartStorageKey(null)).toBe("b2f_cart_v7_0");
    });
    test("CART_STORAGE_KEY_PREFIX exposed", () => {
        expect(CART_STORAGE_KEY_PREFIX).toBe("b2f_cart_v7_");
    });
    test("CART_SCHEMA_VERSION = 7", () => {
        expect(CART_SCHEMA_VERSION).toBe(7);
    });
    test("CART_STALE_TTL_MS = 30 days", () => {
        expect(CART_STALE_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    });
    test("loadCart() empty → {}", () => {
        expect(loadCart(1)).toEqual({});
    });
    test("loadCart() with stored cart returns items", () => {
        const data = {
            _schema: 7,
            _ts: Date.now(),
            items: { SKU1: { qty: 5, price: 100 } },
            updated_at: new Date().toISOString(),
        };
        localStorage.setItem("b2f_cart_v7_1", JSON.stringify(data));
        expect(loadCart(1)).toEqual({ SKU1: { qty: 5, price: 100 } });
    });
    test("loadCart() invalid schema → discard + {}", () => {
        const bad = { _schema: 99, items: { SKU1: { qty: 1 } } };
        localStorage.setItem("b2f_cart_v7_1", JSON.stringify(bad));
        expect(loadCart(1)).toEqual({});
        expect(localStorage.getItem("b2f_cart_v7_1")).toBeNull();
    });
    test("loadCart() stale (31 days old) → discard + {}", () => {
        const stale = {
            _schema: 7,
            _ts: Date.now() - 31 * 24 * 60 * 60 * 1000,
            items: { SKU1: { qty: 1 } },
        };
        localStorage.setItem("b2f_cart_v7_1", JSON.stringify(stale));
        expect(loadCart(1)).toEqual({});
        expect(localStorage.getItem("b2f_cart_v7_1")).toBeNull();
    });
    test("loadCart() corrupt JSON → discard + {}", () => {
        localStorage.setItem("b2f_cart_v7_1", "not-json{{{");
        expect(loadCart(1)).toEqual({});
    });
    test("loadCart() per-maker isolation", () => {
        const data = {
            _schema: 7,
            _ts: Date.now(),
            items: { SKU1: { qty: 1, price: 10 } },
        };
        localStorage.setItem("b2f_cart_v7_42", JSON.stringify(data));
        expect(loadCart(42)).toEqual({ SKU1: { qty: 1, price: 10 } });
        expect(loadCart(99)).toEqual({});
    });
    test("saveCart writes V.7.0 envelope", () => {
        saveCart(1, {
            SKU1: { qty: 5, price: 100, name: "Crashbar", order_mode: "full_set" },
        });
        const raw = localStorage.getItem("b2f_cart_v7_1");
        const data = JSON.parse(raw);
        expect(data._schema).toBe(7);
        expect(typeof data._ts).toBe("number");
        expect(data.items.SKU1.qty).toBe(5);
        expect(data.items.SKU1.order_mode).toBe("full_set");
        expect(typeof data.updated_at).toBe("string");
    });
    test("saveCart skips qty <= 0 entries", () => {
        saveCart(1, {
            SKU1: { qty: 0, price: 100 },
            SKU2: { qty: 5, price: 50 },
        });
        const data = JSON.parse(localStorage.getItem("b2f_cart_v7_1"));
        expect(data.items.SKU1).toBeUndefined();
        expect(data.items.SKU2.qty).toBe(5);
    });
    test("saveCart accepts unit_cost as price fallback", () => {
        saveCart(1, { SKU1: { qty: 3, unit_cost: 250 } });
        const data = JSON.parse(localStorage.getItem("b2f_cart_v7_1"));
        expect(data.items.SKU1.price).toBe(250);
    });
    test("saveCart preserves V.7.0 fields", () => {
        saveCart(1, {
            SKU1: {
                qty: 1,
                price: 100,
                source_sku: "DNCSETXL7500X001H",
                intent_notes: "ขอโลโก้สีดำ",
                order_mode: "sub_unit",
                image: "https://example.com/img.png",
            },
        });
        const data = JSON.parse(localStorage.getItem("b2f_cart_v7_1"));
        expect(data.items.SKU1.source_sku).toBe("DNCSETXL7500X001H");
        expect(data.items.SKU1.intent_notes).toBe("ขอโลโก้สีดำ");
        expect(data.items.SKU1.order_mode).toBe("sub_unit");
        expect(data.items.SKU1.image).toBe("https://example.com/img.png");
    });
    test("clearCart removes the row", () => {
        saveCart(1, { SKU1: { qty: 1, price: 10 } });
        expect(localStorage.getItem("b2f_cart_v7_1")).not.toBeNull();
        clearCart(1);
        expect(localStorage.getItem("b2f_cart_v7_1")).toBeNull();
    });
    test("setCartQty(0) removes SKU", () => {
        const cart = { SKU1: { qty: 5, price: 10 } };
        const next = setCartQty(cart, "SKU1", 0);
        expect(next.SKU1).toBeUndefined();
    });
    test("setCartQty(N, meta) merges meta", () => {
        const next = setCartQty({}, "SKU1", 3, { price: 100, name: "Test" });
        expect(next.SKU1.qty).toBe(3);
        expect(next.SKU1.price).toBe(100);
        expect(next.SKU1.name).toBe("Test");
    });
    test("setCartQty preserves existing meta when not in patch", () => {
        const cart = { SKU1: { qty: 2, price: 50, name: "Old" } };
        const next = setCartQty(cart, "SKU1", 5);
        expect(next.SKU1.qty).toBe(5);
        expect(next.SKU1.price).toBe(50);
        expect(next.SKU1.name).toBe("Old");
    });
    test("setCartQty negative → remove", () => {
        const next = setCartQty({ SKU1: { qty: 1 } }, "SKU1", -1);
        expect(next.SKU1).toBeUndefined();
    });
    test("computeItemCount sums qtys", () => {
        expect(
            computeItemCount({ A: { qty: 3 }, B: { qty: 5 }, C: { qty: 0 } })
        ).toBe(8);
    });
    test("computeItemCount empty cart", () => {
        expect(computeItemCount({})).toBe(0);
        expect(computeItemCount(null)).toBe(0);
    });
    test("computeTotal sums qty*price", () => {
        const cart = {
            A: { qty: 2, price: 100 },
            B: { qty: 3, price: 50 },
        };
        expect(computeTotal(cart)).toBe(350);
    });
    test("computeTotal accepts unit_cost as price fallback", () => {
        expect(computeTotal({ A: { qty: 2, unit_cost: 25 } })).toBe(50);
    });
    test("deriveOrderMode set_assembled → full_set", () => {
        expect(deriveOrderMode({ production_mode: "set_assembled" })).toBe(
            "full_set"
        );
    });
    test("deriveOrderMode cross_factory_assembly → full_set", () => {
        expect(
            deriveOrderMode({ production_mode: "cross_factory_assembly" })
        ).toBe("full_set");
    });
    test("deriveOrderMode sub_unit → sub_unit", () => {
        expect(deriveOrderMode({ production_mode: "sub_unit" })).toBe("sub_unit");
    });
    test("deriveOrderMode single → single_leaf", () => {
        expect(deriveOrderMode({ production_mode: "single" })).toBe("single_leaf");
    });
    test("deriveOrderMode null product → single_leaf", () => {
        expect(deriveOrderMode(null)).toBe("single_leaf");
    });
    test("orderModeLabel mapping", () => {
        expect(orderModeLabel("full_set")).toBe("ชุดเต็ม");
        expect(orderModeLabel("sub_unit")).toBe("แยกชุด");
        expect(orderModeLabel("single_leaf")).toBe("ชิ้นเดี่ยว");
        expect(orderModeLabel("__nope__")).toBe("");
    });
    test("orderModeBadgeClass mapping", () => {
        expect(orderModeBadgeClass("full_set")).toBe("purple");
        expect(orderModeBadgeClass("sub_unit")).toBe("amber");
        expect(orderModeBadgeClass("single_leaf")).toBe("gray");
        expect(orderModeBadgeClass("__nope__")).toBe("gray");
    });
});

// ──────────────────────────────────────────────────────────────────────
// hierarchy.js — DD-2/DD-3/DD-7 + B2F catalog-specific helpers
// ──────────────────────────────────────────────────────────────────────
describe("b2f/catalog/utils/hierarchy.js", () => {
    test("getLeafSkus single SKU → [SKU]", () => {
        expect(getLeafSkus("A", {})).toEqual(["A"]);
    });
    test("getLeafSkus walks 2 levels", () => {
        const rel = { SET: ["L", "R"] };
        expect(getLeafSkus("SET", rel).sort()).toEqual(["L", "R"]);
    });
    test("getLeafSkus dedups DD-3 shared leaf", () => {
        const rel = { SET: ["L", "R"], TOP: ["L", "M"] };
        expect(getLeafSkus("SET", rel).sort()).toEqual(["L", "R"]);
    });
    test("isLeafSku true for unknown SKU", () => {
        expect(isLeafSku("X", {})).toBe(true);
    });
    test("isLeafSku false for parent", () => {
        expect(isLeafSku("SET", { SET: ["L"] })).toBe(false);
    });
    test("isTopLevelSet true (no parent)", () => {
        expect(isTopLevelSet("SET", { SET: ["L"] })).toBe(true);
    });
    test("isTopLevelSet false (has parent)", () => {
        expect(
            isTopLevelSet("CHILD", { TOP: ["CHILD"], CHILD: ["GC"] })
        ).toBe(false);
    });
    test("computeHierarchyStock leaf", () => {
        expect(computeHierarchyStock("L", { L: 10 }, {})).toBe(10);
    });
    test("computeHierarchyStock SET MIN of children", () => {
        const rel = { SET: ["L", "R"] };
        const stock = { L: 5, R: 8 };
        expect(computeHierarchyStock("SET", stock, rel)).toBe(5);
    });
    test("getAncestorSkus multi-parent (DD-3)", () => {
        const rel = { SET_A: ["L"], SET_B: ["L"] };
        expect(getAncestorSkus("L", rel).sort()).toEqual(["SET_A", "SET_B"]);
    });
    test("parseModels JSON string", () => {
        expect(parseModels('["NX500", "CB300"]')).toEqual(["NX500", "CB300"]);
    });
    test("parseModels array of strings", () => {
        expect(parseModels(["A", "B"])).toEqual(["A", "B"]);
    });
    test("parseModels array of objects with name", () => {
        expect(parseModels([{ name: "NX500" }, { name: "CB300" }])).toEqual([
            "NX500",
            "CB300",
        ]);
    });
    test("parseModels array of objects with model_name fallback", () => {
        expect(parseModels([{ model_name: "ER6" }])).toEqual(["ER6"]);
    });
    test("parseModels invalid input → []", () => {
        expect(parseModels(null)).toEqual([]);
        expect(parseModels(undefined)).toEqual([]);
        expect(parseModels("not-json{{")).toEqual([]);
        expect(parseModels({})).toEqual([]);
    });
    test("collectModelsWithDescendants respects own models (V.10.1)", () => {
        const product = { sku: "SET", compatible_models: ["NX500"] };
        const hier = {
            relations: { SET: ["L", "R"] },
            catalog: {
                L: { sku: "L", compatible_models: ["CB300"] },
                R: { sku: "R", compatible_models: ["ER6"] },
            },
        };
        // SET has explicit models → no descendant walk
        expect(collectModelsWithDescendants(product, hier)).toEqual(["NX500"]);
    });
    test("collectModelsWithDescendants walks when own empty", () => {
        const product = { sku: "SET" };
        const hier = {
            relations: { SET: ["L", "R"] },
            catalog: {
                L: { sku: "L", compatible_models: ["NX500"] },
                R: { sku: "R", compatible_models: ["NX500"] },
            },
        };
        const out = collectModelsWithDescendants(product, hier);
        expect(out).toContain("NX500");
    });
    test("productMatchesModel via descendants", () => {
        const product = { sku: "SET" };
        const hier = {
            relations: { SET: ["L"] },
            catalog: { L: { sku: "L", compatible_models: ["NX500"] } },
        };
        expect(productMatchesModel(product, "NX500", hier)).toBe(true);
        expect(productMatchesModel(product, "CB300", hier)).toBe(false);
    });
    test("buildHierarchyLookup produces uppercase keys + parents map", () => {
        const out = buildHierarchyLookup({
            sku_relations: { set: ["a", "b"] },
            catalog_map: { a: { sku: "a" } },
        });
        expect(Object.keys(out.relations)).toContain("SET");
        expect(out.relations.SET).toEqual(["A", "B"]);
        expect(out.catalog.A.sku).toBe("a");
        expect(out.parents.A).toEqual(["SET"]);
        expect(out.parents.B).toEqual(["SET"]);
    });
    test("buildHierarchyLookup DD-3 multi-parent", () => {
        const out = buildHierarchyLookup({
            sku_relations: { SET_A: ["L"], SET_B: ["L"] },
        });
        expect(out.parents.L.sort()).toEqual(["SET_A", "SET_B"]);
    });
    test("buildHierarchyLookup empty input safe", () => {
        const out = buildHierarchyLookup({});
        expect(out.relations).toEqual({});
        expect(out.catalog).toEqual({});
        expect(out.parents).toEqual({});
    });
    test("countTopSetsForProduct DD-3 shared leaf", () => {
        const hier = buildHierarchyLookup({
            sku_relations: { SET_A: ["L"], SET_B: ["L"] },
        });
        expect(countTopSetsForProduct("L", hier)).toBe(2);
    });
    test("countTopSetsForProduct standalone", () => {
        const hier = buildHierarchyLookup({ sku_relations: {} });
        expect(countTopSetsForProduct("X", hier)).toBe(0);
    });
    test("countTopSetsForProduct walks via intermediate", () => {
        const hier = buildHierarchyLookup({
            sku_relations: { TOP: ["CHILD"], CHILD: ["L"] },
        });
        expect(countTopSetsForProduct("L", hier)).toBe(1);
    });
    test("isVirtualSet true", () => {
        expect(isVirtualSet({ is_virtual: true })).toBe(true);
    });
    test("isVirtualSet false / null", () => {
        expect(isVirtualSet(null)).toBe(false);
        expect(isVirtualSet({})).toBe(false);
        expect(isVirtualSet({ is_virtual: false })).toBe(false);
    });
});

// ──────────────────────────────────────────────────────────────────────
// badges.js — V.7.0 mode + hierarchy + virtual badges
// ──────────────────────────────────────────────────────────────────────
describe("b2f/catalog/utils/badges.js", () => {
    beforeEach(() => setupLanguage("THB"));

    test("modeBadgeHtml full_set (Thai)", () => {
        const html = modeBadgeHtml("full_set");
        expect(html).toContain("ชุดเต็ม");
        expect(html).toContain("purple");
        expect(html).toContain("🟣");
    });
    test("modeBadgeHtml sub_unit Thai", () => {
        const html = modeBadgeHtml("sub_unit");
        expect(html).toContain("แยกชุด");
        expect(html).toContain("amber");
    });
    test("modeBadgeHtml single_leaf Thai", () => {
        const html = modeBadgeHtml("single_leaf");
        expect(html).toContain("ชิ้นเดี่ยว");
        expect(html).toContain("gray");
    });
    test("modeBadgeHtml English mode (USD maker)", () => {
        setupLanguage("USD");
        expect(modeBadgeHtml("full_set")).toContain("Full Set");
    });
    test("modeBadgeHtml Chinese (CNY maker)", () => {
        setupLanguage("CNY");
        expect(modeBadgeHtml("full_set")).toContain("整套");
    });
    test("modeBadgeHtml empty when disabled", () => {
        expect(modeBadgeHtml("full_set", { enabled: false })).toBe("");
    });
    test("modeBadgeHtml unknown mode → ''", () => {
        expect(modeBadgeHtml("__nope__")).toBe("");
    });
    test("modeBadgeHtml without icon", () => {
        const html = modeBadgeHtml("full_set", { includeIcon: false });
        expect(html).not.toContain("🟣");
        expect(html).toContain("ชุดเต็ม");
    });
    test("productionModeCardBadgeHtml set_assembled", () => {
        const html = productionModeCardBadgeHtml("set_assembled");
        expect(html).toContain("ชุดเต็ม");
        expect(html).toContain("set-assembled");
    });
    test("productionModeCardBadgeHtml cross_factory_assembly", () => {
        const html = productionModeCardBadgeHtml("cross_factory_assembly");
        expect(html).toContain("DINOCO");
        expect(html).toContain("cross-factory");
    });
    test("productionModeCardBadgeHtml unknown → ''", () => {
        expect(productionModeCardBadgeHtml("__")).toBe("");
    });
    test("hierarchyBadgeHtml set", () => {
        expect(hierarchyBadgeHtml("set")).toContain("ชุด SET");
    });
    test("hierarchyBadgeHtml grandchild", () => {
        expect(hierarchyBadgeHtml("grandchild")).toContain("ชิ้นส่วนย่อย");
    });
    test("hierarchyBadgeHtml unknown → ''", () => {
        expect(hierarchyBadgeHtml("__nope__")).toBe("");
    });
    test("virtualSetBadgeHtml renders amber pill", () => {
        const html = virtualSetBadgeHtml("shared_parts_assembled");
        expect(html).toContain("ประกอบจากชิ้นส่วน");
        expect(html).toContain("b2f-cat-virtual-badge");
        expect(html).toContain("✨");
    });
    test("virtualSetBadgeHtml escapes reason attribute", () => {
        const html = virtualSetBadgeHtml('"><script>x</script>');
        expect(html).not.toContain("<script>");
    });
    test("unconfirmedBadgeHtml renders amber pill", () => {
        const html = unconfirmedBadgeHtml();
        expect(html).toContain("รอยืนยัน");
        expect(html).toContain("b2f-cat-badge-unconfirmed");
        expect(html).toContain("⚠️");
    });
    test("unconfirmedBadgeHtml uses English for USD maker", () => {
        setupLanguage("USD");
        expect(unconfirmedBadgeHtml()).toContain("Unconfirmed");
    });
});
