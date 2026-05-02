/**
 * Round 2 Jest tests for liff-src/b2b/catalog/pages/* (V.0.3).
 *
 * Covers 5 page modules — pure HTML-string builders:
 *   - home.js      (renderHome, renderModelRow, renderCategoryRow,
 *                    renderCrossFilterPills, renderViewState,
 *                    productMatchesModel, collectCategoriesForModel,
 *                    collectModelsForCategory)
 *   - catalog.js   (filterProducts, renderProductCard, renderProducts,
 *                    formatEtaDate)
 *   - setDetail.js (buildB2bStepper, renderSetDetailMainStepper,
 *                    updateSetDetailAddBtn, renderSetDetailItems)
 *   - history.js   (renderHistoryFilter, renderHistory, renderHistoryCard,
 *                    renderLoadMoreButton, getStatusColor, getStatusLabel,
 *                    HISTORY_FILTERS, STATUS_COLORS, STATUS_LABELS)
 *   - cart.js      (updateCartBar, renderCartModalItem, renderCartItems,
 *                    renderCartEmptyState, renderRecommendedChips)
 *
 * Production behavior anchors:
 *   - Inline V.32.9 `b2b_liff_page_js()` — every helper here mirrors a
 *     specific function in that source. Drift = visual / pricing
 *     regression in B2B catalog.
 *   - V.32.0 SET overlay / V.32.2 typable stepper / V.32.3 thumbnails /
 *     V.32.4 collapsed sub-items + remove btn / V.32.6 P3 empty +
 *     P18 LCP boost.
 *   - DD-3 hierarchy contract — shared leaf SKUs preserved across
 *     parent groups (verified via SET Detail items render).
 */

import {
    productMatchesModel,
    renderModelCard,
    renderModelRow,
    shouldShowModelLabel,
    renderCategoryCard,
    renderCategoryRow,
    shouldShowCategoryLabel,
    renderHome,
    renderViewState,
    collectCategoriesForModel,
    collectModelsForCategory,
    renderCrossFilterPills,
} from "../../liff-src/b2b/catalog/pages/home.js";

import {
    filterProducts,
    formatEtaDate,
    renderProductCard,
    renderProducts,
} from "../../liff-src/b2b/catalog/pages/catalog.js";

import {
    buildB2bStepper,
    renderSetDetailMainStepper,
    updateSetDetailAddBtn,
    renderSetDetailItems,
} from "../../liff-src/b2b/catalog/pages/setDetail.js";

import {
    HISTORY_FILTERS,
    STATUS_COLORS,
    STATUS_LABELS,
    getStatusColor,
    getStatusLabel,
    renderHistoryFilter,
    renderHistoryCard,
    renderLoadMoreButton,
    renderHistory,
} from "../../liff-src/b2b/catalog/pages/history.js";

import {
    updateCartBar,
    renderCartModalItem,
    renderCartEmptyState,
    renderCartNoteSection,
    renderCartItems,
    renderRecommendedChips,
} from "../../liff-src/b2b/catalog/pages/cart.js";

// ──────────────────────────────────────────────────────────────────────
// home.js
// ──────────────────────────────────────────────────────────────────────
describe("pages/home.js — productMatchesModel()", () => {
    test("returns true when modelName empty", () => {
        expect(productMatchesModel({ _models: [] }, "")).toBe(true);
    });
    test("matches string-shape models[]", () => {
        expect(
            productMatchesModel({ _models: ["NX500", "PCX160"] }, "NX500")
        ).toBe(true);
    });
    test("matches object-shape models[]", () => {
        expect(
            productMatchesModel(
                { _models: [{ name: "NX500" }, { name: "PCX160" }] },
                "PCX160"
            )
        ).toBe(true);
    });
    test("returns false when no match", () => {
        expect(
            productMatchesModel({ _models: ["NX500"] }, "PCX160")
        ).toBe(false);
    });
    test("handles missing _models field", () => {
        expect(productMatchesModel({}, "NX500")).toBe(false);
    });
});

describe("pages/home.js — renderModelCard()", () => {
    test("with image_url renders <img>", () => {
        const html = renderModelCard({
            name: "NX500",
            image_url: "/img/nx500.jpg",
        });
        expect(html).toContain('class="b2b-cat-model-card"');
        expect(html).toContain('src="/img/nx500.jpg"');
        expect(html).toContain("NX500");
        expect(html).not.toContain("🏍️");
    });
    test("without image_url renders 🏍️ emoji", () => {
        const html = renderModelCard({ name: "PCX160" });
        expect(html).toContain("🏍️");
        expect(html).toContain("PCX160");
    });
    test("escapes XSS in name", () => {
        const html = renderModelCard({ name: "<script>x</script>" });
        expect(html).not.toContain("<script>x");
        expect(html).toContain("&lt;script&gt;");
    });
    test("emits data-action + data-model-name for delegation", () => {
        const html = renderModelCard({ name: "NX500" });
        expect(html).toContain('data-action="set-model-view"');
        expect(html).toContain('data-model-name="NX500"');
    });
});

describe("pages/home.js — renderModelRow()", () => {
    test("returns empty string when no models", () => {
        expect(renderModelRow({ availableModels: [] })).toBe("");
    });
    test("concatenates multiple cards", () => {
        const html = renderModelRow({
            availableModels: [{ name: "A" }, { name: "B" }],
        });
        expect(html.match(/b2b-cat-model-card/g)).toHaveLength(2);
    });
    test("handles missing state gracefully", () => {
        expect(renderModelRow(null)).toBe("");
        expect(renderModelRow({})).toBe("");
    });
    test("shouldShowModelLabel mirrors data presence", () => {
        expect(shouldShowModelLabel({ availableModels: [{ name: "A" }] }))
            .toBe(true);
        expect(shouldShowModelLabel({ availableModels: [] })).toBe(false);
        expect(shouldShowModelLabel({})).toBe(false);
    });
});

describe("pages/home.js — renderCategoryCard()", () => {
    test("emits emoji icon as raw (not escaped)", () => {
        const html = renderCategoryCard({ name: "กันล้ม", icon: "🛡️" });
        // Inline V.32.9 trusts the icon (server-controlled); keep parity.
        expect(html).toContain("🛡️");
        expect(html).toContain("กันล้ม");
    });
    test("escapes name only", () => {
        const html = renderCategoryCard({
            name: "<x>",
            icon: "🛡️",
        });
        expect(html).toContain("&lt;x&gt;");
    });
    test("emits data-action + data-cat-name", () => {
        const html = renderCategoryCard({
            name: "Box",
            icon: "📦",
        });
        expect(html).toContain('data-action="set-category-view"');
        expect(html).toContain('data-cat-name="Box"');
    });
});

describe("pages/home.js — renderCategoryRow()", () => {
    test("returns empty for no categories", () => {
        expect(renderCategoryRow({ availableCategories: [] })).toBe("");
    });
    test("emits N cards", () => {
        const html = renderCategoryRow({
            availableCategories: [
                { name: "A", icon: "🛡️" },
                { name: "B", icon: "📦" },
                { name: "C", icon: "⚙️" },
            ],
        });
        expect(html.match(/b2b-cat-cat-card/g)).toHaveLength(3);
    });
    test("shouldShowCategoryLabel reflects presence", () => {
        expect(
            shouldShowCategoryLabel({
                availableCategories: [{ name: "A", icon: "🛡️" }],
            })
        ).toBe(true);
        expect(shouldShowCategoryLabel({ availableCategories: [] })).toBe(
            false
        );
    });
});

describe("pages/home.js — renderHome() composite", () => {
    test("returns 4 fields", () => {
        const out = renderHome({
            availableModels: [{ name: "NX" }],
            availableCategories: [{ name: "Box", icon: "📦" }],
        });
        expect(out).toEqual({
            modelRowHtml: expect.any(String),
            categoryRowHtml: expect.any(String),
            showModelLabel: true,
            showCategoryLabel: true,
        });
        expect(out.modelRowHtml).toContain("NX");
        expect(out.categoryRowHtml).toContain("Box");
    });
});

describe("pages/home.js — renderViewState()", () => {
    test("home mode: rows visible, sub-header hidden", () => {
        const s = renderViewState({ viewMode: "home", recommendedSkus: [] });
        expect(s.showHomeRows).toBe(true);
        expect(s.showSearchWrap).toBe(true);
        expect(s.showSubHeader).toBe(false);
        expect(s.showFreqSection).toBe(false);
    });
    test("model mode: sub-header with model name", () => {
        const s = renderViewState({
            viewMode: "model",
            filterModel: "NX500",
        });
        expect(s.showHomeRows).toBe(false);
        expect(s.showSubHeader).toBe(true);
        expect(s.subTitle).toBe("NX500");
    });
    test("category mode: sub-header with category name", () => {
        const s = renderViewState({
            viewMode: "category",
            filterCategory: "Crash",
        });
        expect(s.subTitle).toBe("Crash");
    });
    test("search mode: searchWrap visible, no home rows", () => {
        const s = renderViewState({ viewMode: "search" });
        expect(s.showHomeRows).toBe(false);
        expect(s.showSearchWrap).toBe(true);
    });
    test("freqSection visible only when home + recommended present", () => {
        expect(
            renderViewState({
                viewMode: "home",
                recommendedSkus: ["A", "B"],
            }).showFreqSection
        ).toBe(true);
        expect(
            renderViewState({
                viewMode: "model",
                recommendedSkus: ["A"],
            }).showFreqSection
        ).toBe(false);
    });
});

describe("pages/home.js — collect filters", () => {
    const products = [
        {
            category: "Crash",
            _models: [{ name: "NX500" }, { name: "PCX160" }],
        },
        { category: "Box", _models: ["NX500"] },
        { category: "Box", _models: ["PCX160"] },
    ];
    test("collectCategoriesForModel finds unique cats", () => {
        const out = collectCategoriesForModel(products, "NX500");
        expect(out).toEqual(["Box", "Crash"]);
    });
    test("collectCategoriesForModel empty when no match", () => {
        expect(collectCategoriesForModel(products, "ZZZ")).toEqual([]);
    });
    test("collectModelsForCategory returns sorted unique models", () => {
        const out = collectModelsForCategory(products, "Box");
        expect(out).toEqual(["NX500", "PCX160"]);
    });
});

describe("pages/home.js — renderCrossFilterPills()", () => {
    test("returns empty in home mode", () => {
        expect(renderCrossFilterPills({ viewMode: "home" })).toBe("");
    });
    test("model mode: leading 'ทั้งหมด' pill + categories", () => {
        const html = renderCrossFilterPills({
            viewMode: "model",
            filterModel: "NX500",
            crossFilter: "",
            products: [
                { category: "Crash", _models: ["NX500"] },
                { category: "Box", _models: ["NX500"] },
            ],
        });
        expect(html).toContain("ทั้งหมด");
        expect(html).toContain("Crash");
        expect(html).toContain("Box");
        expect(html).toContain('class="b2b-cat-pill active"'); // ทั้งหมด active
    });
    test("model mode + crossFilter active pill highlighted", () => {
        const html = renderCrossFilterPills({
            viewMode: "model",
            filterModel: "NX500",
            crossFilter: "Crash",
            products: [{ category: "Crash", _models: ["NX500"] }],
        });
        // The Crash pill should be active, ทั้งหมด should NOT
        expect(html.match(/b2b-cat-pill active/g).length).toBe(1);
        expect(html).toMatch(
            /data-cross="Crash"[^>]*>Crash/
        );
    });
    test("category mode: pills are models", () => {
        const html = renderCrossFilterPills({
            viewMode: "category",
            filterCategory: "Box",
            products: [
                { category: "Box", _models: [{ name: "NX500" }] },
                { category: "Box", _models: [{ name: "PCX160" }] },
            ],
        });
        expect(html).toContain("NX500");
        expect(html).toContain("PCX160");
    });
});

// ──────────────────────────────────────────────────────────────────────
// catalog.js
// ──────────────────────────────────────────────────────────────────────
describe("pages/catalog.js — filterProducts()", () => {
    const products = [
        { sku: "A", name: "Alpha", category: "Box", _models: ["NX500"],
          compatible_models: "NX500" },
        { sku: "B", name: "Beta", category: "Crash", _models: ["PCX160"],
          compatible_models: "PCX160" },
        { sku: "C", name: "Gamma", category: "Box", _models: ["NX500"],
          compatible_models: "NX500" },
    ];
    test("home + no search → all products", () => {
        expect(
            filterProducts(products, { viewMode: "home" }).length
        ).toBe(3);
    });
    test("search mode filters by name", () => {
        const out = filterProducts(products, {
            viewMode: "search",
            searchQuery: "alpha",
        });
        expect(out.length).toBe(1);
        expect(out[0].sku).toBe("A");
    });
    test("search mode filters by SKU", () => {
        const out = filterProducts(products, {
            viewMode: "search",
            searchQuery: "C",
        });
        // Match in SKU + ALSO in compatible_models when "c" lowercase
        // matches no other field — exact behavior is substring on
        // joined haystack. SKU "C" should match.
        expect(out.find((p) => p.sku === "C")).toBeTruthy();
    });
    test("model mode with crossFilter filters by category", () => {
        const out = filterProducts(products, {
            viewMode: "model",
            filterModel: "NX500",
            crossFilter: "Box",
        });
        expect(out.length).toBe(2);
    });
    test("category mode without crossFilter", () => {
        const out = filterProducts(products, {
            viewMode: "category",
            filterCategory: "Crash",
        });
        expect(out.length).toBe(1);
        expect(out[0].sku).toBe("B");
    });
    test("home with homeSearchQuery", () => {
        const out = filterProducts(products, {
            viewMode: "home",
            homeSearchQuery: "beta",
        });
        expect(out.length).toBe(1);
        expect(out[0].sku).toBe("B");
    });
});

describe("pages/catalog.js — formatEtaDate()", () => {
    test("formats YYYY-MM-DD → DD/MM/YYYY", () => {
        expect(formatEtaDate("2026-04-30")).toBe("30/04/2026");
    });
    test("returns '' for empty", () => {
        expect(formatEtaDate("")).toBe("");
        expect(formatEtaDate(null)).toBe("");
    });
    test("returns '' for malformed (wrong delimiter)", () => {
        expect(formatEtaDate("2026/04/30")).toBe("");
    });
    test("formatEtaDate string-splits regardless of validity", () => {
        // Inline V.32.9 does NOT validate digits — it just rearranges
        // parts when split('-') yields exactly 3. Documenting the
        // verbatim port behavior for parity.
        expect(formatEtaDate("not-a-date")).toBe("date/a/not");
    });
});

describe("pages/catalog.js — renderProductCard()", () => {
    test("normal product: name + dealer price + add btn", () => {
        const html = renderProductCard(
            {
                sku: "A1",
                name: "Alpha",
                price: 1000,
                dealer_price: 800,
                discount: 20,
            },
            { index: 0, qty: 0 }
        );
        expect(html).toContain("Alpha");
        expect(html).toContain("฿800");
        expect(html).toContain("฿1,000"); // retail strikethrough
        expect(html).toContain("-20%");
        expect(html).toContain("data-action=\"add\"");
    });
    test("first 6 images get fetchpriority=high (V.32.6 P18)", () => {
        for (let i = 0; i < 6; i++) {
            const html = renderProductCard(
                { sku: "S" + i, name: "x", img: "/x.jpg", dealer_price: 1 },
                { index: i, qty: 0 }
            );
            expect(html).toContain('fetchpriority="high"');
            expect(html).toContain('loading="eager"');
        }
        const html7 = renderProductCard(
            { sku: "S7", name: "x", img: "/x.jpg", dealer_price: 1 },
            { index: 6, qty: 0 }
        );
        expect(html7).toContain('loading="lazy"');
        expect(html7).not.toContain("fetchpriority");
    });
    test("OOS product: 'สินค้าหมด' badge + disabled btn + ETA", () => {
        const html = renderProductCard(
            {
                sku: "X",
                name: "Out",
                stock_display: "out_of_stock",
                stock_eta: "2026-04-30",
                dealer_price: 100,
            },
            { index: 0, qty: 0 }
        );
        expect(html).toContain("b2b-cat-badge oos");
        expect(html).toContain("คาดว่ามีของ 30/04/2026");
        expect(html).toContain("pointer-events:none");
    });
    test("OOS without ETA: 'ยังไม่ทราบกำหนด'", () => {
        const html = renderProductCard(
            {
                sku: "X",
                name: "Out",
                stock_display: "out_of_stock",
                dealer_price: 100,
            },
            { index: 0, qty: 0 }
        );
        expect(html).toContain("ยังไม่ทราบกำหนด");
    });
    test("low stock: 'ใกล้หมด' badge + 'สั่งก่อนหมด' chip", () => {
        const html = renderProductCard(
            {
                sku: "L",
                name: "Low",
                stock_display: "low_stock",
                dealer_price: 100,
            },
            { index: 0, qty: 0 }
        );
        expect(html).toContain("b2b-cat-badge low");
        expect(html).toContain("ใกล้หมด");
        expect(html).toContain("สั่งก่อนหมด");
    });
    test("SET product (in stock, no qty) → 'ดูชุด' purple btn", () => {
        const html = renderProductCard(
            {
                sku: "SET_X",
                name: "Set X",
                is_set: true,
                dealer_price: 5000,
            },
            { index: 0, qty: 0 }
        );
        expect(html).toContain("b2b-cat-badge set");
        expect(html).toContain("ดูชุด");
        expect(html).toContain('data-action="detail"');
        expect(html).toContain("#7c3aed"); // purple
    });
    test("SET product with qty in cart → qty stepper", () => {
        const html = renderProductCard(
            {
                sku: "SET_X",
                name: "Set X",
                is_set: true,
                dealer_price: 5000,
            },
            { index: 0, qty: 3 }
        );
        expect(html).toContain("b2b-cat-qty-row");
        expect(html).toContain("data-action=\"plus\"");
        expect(html).toContain("data-action=\"minus\"");
        expect(html).toContain('id="qty-SET_X"');
    });
    test("model tags truncated to 3 + 'N more' badge", () => {
        const html = renderProductCard(
            {
                sku: "M",
                name: "Multi",
                _models: ["A", "B", "C", "D", "E"],
                dealer_price: 100,
            },
            { index: 0, qty: 0 }
        );
        // 3 tags + 1 "+N" badge = 4 individual `b2b-cat-model-tag` spans
        // (the wrapper uses class `b2b-cat-model-tags` with trailing `s`)
        expect(
            (html.match(/class="b2b-cat-model-tag"/g) || []).length
        ).toBe(4);
        expect(html).toContain("+2");
    });
    test("placeholder 📦 when no img", () => {
        const html = renderProductCard(
            { sku: "P", name: "P", dealer_price: 100 },
            { index: 0, qty: 0 }
        );
        expect(html).toContain("b2b-cat-img-placeholder");
        expect(html).toContain("📦");
    });
    test("escapes name + sku for XSS", () => {
        const html = renderProductCard(
            { sku: "<x>", name: "<y>", dealer_price: 100 },
            { index: 0, qty: 0 }
        );
        expect(html).not.toContain("<y>");
        expect(html).toContain("&lt;y&gt;");
    });
});

describe("pages/catalog.js — renderProducts()", () => {
    test("empty result returns isEmpty=true", () => {
        const out = renderProducts([], { viewMode: "home", cart: {} });
        expect(out.isEmpty).toBe(true);
        expect(out.html).toBe("");
        expect(out.count).toBe(0);
    });
    test("count + html + isEmpty=false on hits", () => {
        const out = renderProducts(
            [
                { sku: "A", name: "A", dealer_price: 100 },
                { sku: "B", name: "B", dealer_price: 200 },
            ],
            { viewMode: "home", cart: {} }
        );
        expect(out.count).toBe(2);
        expect(out.isEmpty).toBe(false);
        expect(out.html.match(/b2b-cat-product/g).length).toBe(2);
    });
    test("respects cart qty per SKU", () => {
        const out = renderProducts(
            [{ sku: "A", name: "A", dealer_price: 100 }],
            { viewMode: "home", cart: { A: 5 } }
        );
        expect(out.html).toContain('id="qty-A"');
        expect(out.html).toContain(">5<");
    });
});

// ──────────────────────────────────────────────────────────────────────
// setDetail.js
// ──────────────────────────────────────────────────────────────────────
describe("pages/setDetail.js — buildB2bStepper()", () => {
    test("collapsedDefault + qty=0 → '+ สั่งแยก' button", () => {
        const html = buildB2bStepper("CHILD_X", 0, true);
        expect(html).toContain("b2b-cat-sub-add-btn");
        expect(html).toContain("+ สั่งแยก");
        expect(html).toContain('data-subaddsku="CHILD_X"');
        expect(html).not.toContain("b2b-qty-stepper-input");
    });
    test("collapsedDefault + qty>0 → full stepper", () => {
        const html = buildB2bStepper("CHILD_X", 3, true);
        expect(html).toContain("b2b-qty-stepper");
        expect(html).toContain('value="3"');
        expect(html).toContain("in-cart");
        expect(html).toContain("+เพิ่ม (3)");
    });
    test("non-collapsed + qty=0 → stepper with default value=1", () => {
        const html = buildB2bStepper("CHILD_X", 0, false);
        expect(html).toContain("b2b-qty-stepper");
        expect(html).toContain('value="1"');
        expect(html).toContain("+ เพิ่ม");
    });
    test("min=1 max=999 inputmode=numeric", () => {
        const html = buildB2bStepper("CHILD_X", 0, false);
        expect(html).toContain('min="1"');
        expect(html).toContain('max="999"');
        expect(html).toContain('inputmode="numeric"');
    });
    test("emits all 4 stepact data-attrs", () => {
        const html = buildB2bStepper("CHILD_X", 0, false);
        expect(html).toContain('data-stepact="minus"');
        expect(html).toContain('data-stepact="plus"');
        expect(html).toContain('data-stepact="input"');
        expect(html).toContain('data-stepact="add"');
    });
});

describe("pages/setDetail.js — renderSetDetailMainStepper()", () => {
    test("OOS → disabled 'สินค้าหมด' button", () => {
        const html = renderSetDetailMainStepper(
            { sku: "S", stock_display: "out_of_stock" },
            { qtyInCart: 0 }
        );
        expect(html).toContain("disabled");
        expect(html).toContain("สินค้าหมด");
        expect(html).not.toContain("b2b-qty-stepper");
    });
    test("in_stock + 0 in cart → '+ ชุดเต็ม' button (navy)", () => {
        const html = renderSetDetailMainStepper(
            { sku: "S", stock_display: "in_stock" },
            { qtyInCart: 0 }
        );
        expect(html).toContain("+ ชุดเต็ม");
        expect(html).toContain("#1e293b"); // navy
        expect(html).not.toContain("in-cart");
    });
    test("in cart → '+ ชุดเต็ม (ในตะกร้า N)' green", () => {
        const html = renderSetDetailMainStepper(
            { sku: "S", stock_display: "in_stock" },
            { qtyInCart: 7 }
        );
        expect(html).toContain("+ ชุดเต็ม (ในตะกร้า 7)");
        expect(html).toContain("#10b981"); // green
        expect(html).toContain("in-cart");
    });
    test("preserveTyped clamps to [1, 999]", () => {
        let html = renderSetDetailMainStepper(
            { sku: "S" },
            { qtyInCart: 0, preserveTyped: 0 }
        );
        expect(html).toContain('value="1"');
        html = renderSetDetailMainStepper(
            { sku: "S" },
            { qtyInCart: 0, preserveTyped: 9999 }
        );
        expect(html).toContain('value="999"');
        html = renderSetDetailMainStepper(
            { sku: "S" },
            { qtyInCart: 0, preserveTyped: 42 }
        );
        expect(html).toContain('value="42"');
    });
    test("MOQ hint when min_order_qty > 1 (V.32.6 P1)", () => {
        const html = renderSetDetailMainStepper(
            { sku: "S", min_order_qty: 5 },
            { qtyInCart: 0 }
        );
        expect(html).toContain("ขั้นต่ำ 5 ชุด");
        expect(html).toContain("b2b-cat-moq-hint");
    });
    test("no MOQ hint when min_order_qty == 1", () => {
        const html = renderSetDetailMainStepper(
            { sku: "S", min_order_qty: 1 },
            { qtyInCart: 0 }
        );
        expect(html).not.toContain("b2b-cat-moq-hint");
    });
    test("setmain=1 attr to discriminate from sub-stepper", () => {
        const html = renderSetDetailMainStepper(
            { sku: "S" },
            { qtyInCart: 0 }
        );
        expect(html).toContain('data-setmain="1"');
    });
});

describe("pages/setDetail.js — updateSetDetailAddBtn()", () => {
    test("returns false on out_of_stock", () => {
        expect(
            updateSetDetailAddBtn({ stock_display: "out_of_stock" })
        ).toBe(false);
    });
    test("returns true on in_stock or low_stock", () => {
        expect(updateSetDetailAddBtn({ stock_display: "in_stock" })).toBe(
            true
        );
        expect(updateSetDetailAddBtn({ stock_display: "low_stock" })).toBe(
            true
        );
    });
    test("defaults to in_stock when missing", () => {
        expect(updateSetDetailAddBtn({})).toBe(true);
    });
});

describe("pages/setDetail.js — renderSetDetailItems()", () => {
    test("empty children_detail → empty placeholder", () => {
        const html = renderSetDetailItems({ children_detail: [] }, {});
        expect(html).toContain("ไม่มีรายการสินค้าย่อย");
    });
    test("renders children with stepper", () => {
        const html = renderSetDetailItems(
            {
                children_detail: [
                    {
                        sku: "L",
                        name: "Left",
                        dealer_price: 1000,
                    },
                    {
                        sku: "R",
                        name: "Right",
                        dealer_price: 1000,
                    },
                ],
            },
            { cart: {} }
        );
        expect(html.match(/b2b-cat-set-child(?!-)/g)).toHaveLength(2);
        expect(html).toContain("Left");
        expect(html).toContain("Right");
        expect(html).toContain("+ สั่งแยก"); // collapsed default
    });
    test("OOS child shows ETA + no stepper", () => {
        const html = renderSetDetailItems(
            {
                children_detail: [
                    {
                        sku: "X",
                        name: "Stuck",
                        stock_display: "out_of_stock",
                        stock_eta: "2026-04-30",
                    },
                ],
            },
            { cart: {} }
        );
        expect(html).toContain("b2b-cat-set-child oos");
        expect(html).toContain("คาดว่ามีของ 30/04/2026");
        expect(html).not.toContain("data-stepact");
    });
    test("renders grandchildren under 'ซื้อแยกชิ้น' label", () => {
        const html = renderSetDetailItems(
            {
                children_detail: [
                    {
                        sku: "PR",
                        name: "Pannier Rack",
                        dealer_price: 2000,
                        grandchildren: [
                            {
                                sku: "PR_L",
                                name: "Left",
                                dealer_price: 1000,
                            },
                            {
                                sku: "PR_R",
                                name: "Right",
                                dealer_price: 1000,
                            },
                        ],
                    },
                ],
            },
            { cart: {} }
        );
        expect(html).toContain("ซื้อแยกชิ้น");
        expect(html).toContain("PR_L");
        expect(html).toContain("PR_R");
    });
    test("DD-3 shared leaf appears under each parent SET", () => {
        // Same leaf SKU shared across two children.
        const html = renderSetDetailItems(
            {
                children_detail: [
                    {
                        sku: "GROUP_A",
                        name: "Group A",
                        dealer_price: 100,
                        grandchildren: [
                            { sku: "SHARED", name: "Shared", dealer_price: 50 },
                        ],
                    },
                    {
                        sku: "GROUP_B",
                        name: "Group B",
                        dealer_price: 100,
                        grandchildren: [
                            { sku: "SHARED", name: "Shared", dealer_price: 50 },
                        ],
                    },
                ],
            },
            { cart: {} }
        );
        // The shared leaf should appear in 2 distinct grandchild rows.
        const sharedMatches = html.match(/data-subaddsku="SHARED"/g) || [];
        expect(sharedMatches.length).toBe(2);
    });
    test("retail strikethrough shown when discounted", () => {
        const html = renderSetDetailItems(
            {
                children_detail: [
                    {
                        sku: "L",
                        name: "Left",
                        price: 1500,
                        dealer_price: 1200,
                    },
                ],
            },
            { cart: {} }
        );
        expect(html).toContain("b2b-cat-set-child-retail");
        expect(html).toContain("฿1,500");
        expect(html).toContain("฿1,200");
    });
});

// ──────────────────────────────────────────────────────────────────────
// history.js
// ──────────────────────────────────────────────────────────────────────
describe("pages/history.js — constants", () => {
    test("HISTORY_FILTERS has 11 entries with 'ทั้งหมด' first", () => {
        expect(HISTORY_FILTERS).toHaveLength(11);
        expect(HISTORY_FILTERS[0].key).toBe("");
        expect(HISTORY_FILTERS[0].label).toBe("ทั้งหมด");
    });
    test("STATUS_COLORS has 15 entries", () => {
        expect(Object.keys(STATUS_COLORS)).toHaveLength(15);
        expect(STATUS_COLORS.paid).toEqual({ bg: "#dcfce7", c: "#166534" });
    });
    test("STATUS_LABELS has 15 entries (Thai)", () => {
        expect(Object.keys(STATUS_LABELS)).toHaveLength(15);
        expect(STATUS_LABELS.shipped).toBe("จัดส่งแล้ว");
    });
});

describe("pages/history.js — getStatusColor / getStatusLabel", () => {
    test("known status returns mapped color + label", () => {
        expect(getStatusColor("paid")).toEqual({
            bg: "#dcfce7",
            c: "#166534",
        });
        expect(getStatusLabel("paid")).toBe("ชำระแล้ว");
    });
    test("unknown status falls back to default gray", () => {
        expect(getStatusColor("zz_unknown")).toEqual({
            bg: "#f1f5f9",
            c: "#475569",
        });
    });
    test("unknown status returns raw key (or empty)", () => {
        expect(getStatusLabel("custom_x")).toBe("custom_x");
        expect(getStatusLabel("")).toBe("");
    });
});

describe("pages/history.js — renderHistoryFilter()", () => {
    test("renders 11 chips, one active per state.historyFilter", () => {
        const html = renderHistoryFilter({ historyFilter: "paid" });
        expect(html.match(/b2b-cat-filter-chip/g).length).toBe(11);
        // Paid chip should have active class
        expect(html).toMatch(
            /class="b2b-cat-filter-chip active"[^>]*data-filter="paid"/
        );
    });
    test("default empty filter → 'ทั้งหมด' active", () => {
        const html = renderHistoryFilter({});
        expect(html).toMatch(
            /class="b2b-cat-filter-chip active"[^>]*data-filter=""/
        );
    });
});

describe("pages/history.js — renderHistoryCard()", () => {
    test("paid order: shows status + total + reorder btn", () => {
        const html = renderHistoryCard({
            id: 123,
            status: "paid",
            total: 5000,
            sub_label: "Ticket #123",
            date: "30/04/2026",
            items: [{ sku: "A", name: "Alpha", qty: 2, price: 2500 }],
        });
        expect(html).toContain("Ticket #123");
        expect(html).toContain("ชำระแล้ว");
        expect(html).toContain("฿5,000");
        expect(html).toContain('data-reorder="123"');
    });
    test("shipped order: claim button visible", () => {
        const html = renderHistoryCard({
            id: 1,
            status: "shipped",
            total: 100,
            items: [],
        });
        expect(html).toContain('data-claim="1"');
    });
    test("cancelled order: no cancel + no claim", () => {
        const html = renderHistoryCard({
            id: 2,
            status: "cancelled",
            total: 100,
            can_cancel: true,
            items: [],
        });
        expect(html).not.toContain('data-cancel="2"');
        expect(html).not.toContain('data-claim="2"');
    });
    test("can_cancel + non-terminal → cancel btn", () => {
        const html = renderHistoryCard({
            id: 5,
            status: "pending",
            total: 100,
            can_cancel: true,
            items: [],
        });
        expect(html).toContain('data-cancel="5"');
    });
    test("ticket_url → 'ดู' button", () => {
        const html = renderHistoryCard({
            id: 9,
            status: "paid",
            total: 100,
            ticket_url: "https://example/x",
            items: [],
        });
        expect(html).toMatch(/data-view="https:\/\/example\/x"/);
    });
    test("due_date shown for awaiting_payment + paid", () => {
        const html = renderHistoryCard({
            id: 1,
            status: "awaiting_payment",
            total: 100,
            due_date: "30/04/2026",
            items: [],
        });
        expect(html).toContain("กำหนดชำระ: 30/04/2026");
    });
    test("tracking + carrier displayed", () => {
        const html = renderHistoryCard({
            id: 1,
            status: "shipped",
            total: 100,
            tracking: "FL123",
            carrier: "Flash",
            items: [],
        });
        expect(html).toContain("FL123");
        expect(html).toContain("(Flash)");
    });
});

describe("pages/history.js — renderLoadMoreButton()", () => {
    test("returns '' when on last page", () => {
        expect(
            renderLoadMoreButton({ historyPage: 3, historyTotalPages: 3 })
        ).toBe("");
    });
    test("renders btn when more pages remain", () => {
        const html = renderLoadMoreButton({
            historyPage: 1,
            historyTotalPages: 5,
        });
        expect(html).toContain("b2b-cat-load-more");
        expect(html).toContain("(หน้า 2/5)");
    });
});

describe("pages/history.js — renderHistory()", () => {
    test("composes cards + load-more", () => {
        const html = renderHistory(
            [
                { id: 1, status: "paid", total: 100, items: [] },
                { id: 2, status: "shipped", total: 200, items: [] },
            ],
            { historyPage: 1, historyTotalPages: 2 }
        );
        expect(html.match(/b2b-cat-history-card/g).length).toBe(2);
        expect(html).toContain("b2b-cat-load-more");
    });
});

// ──────────────────────────────────────────────────────────────────────
// cart.js
// ──────────────────────────────────────────────────────────────────────
describe("pages/cart.js — updateCartBar()", () => {
    test("empty cart → count=0 hidden", () => {
        const out = updateCartBar({ cart: {}, products: [] });
        expect(out.count).toBe(0);
        expect(out.total).toBe(0);
        expect(out.visible).toBe(false);
    });
    test("counts qty + sums dealer_price * qty", () => {
        const out = updateCartBar({
            cart: { A: 2, B: 3 },
            products: [
                { sku: "A", dealer_price: 100 },
                { sku: "B", dealer_price: 200 },
            ],
            activeTab: "catalog",
        });
        expect(out.count).toBe(5);
        expect(out.total).toBe(2 * 100 + 3 * 200);
        expect(out.visible).toBe(true);
    });
    test("hidden on non-catalog tab", () => {
        const out = updateCartBar({
            cart: { A: 1 },
            products: [{ sku: "A", dealer_price: 100 }],
            activeTab: "history",
        });
        expect(out.visible).toBe(false);
    });
    test("editMode label = 'ส่งรายการแก้ไข'", () => {
        const out = updateCartBar({
            cart: { A: 1 },
            products: [{ sku: "A", dealer_price: 100 }],
            editMode: true,
        });
        expect(out.submitLabel).toBe("ส่งรายการแก้ไข");
    });
    test("default label = 'สั่งซื้อ'", () => {
        const out = updateCartBar({});
        expect(out.submitLabel).toBe("สั่งซื้อ");
    });
});

describe("pages/cart.js — renderCartModalItem()", () => {
    test("with thumbnail img", () => {
        const html = renderCartModalItem(
            { sku: "A", name: "Alpha", qty: 2, price: 100 },
            { products: [{ sku: "A", img: "/a.jpg" }] }
        );
        expect(html).toContain('src="/a.jpg"');
        expect(html).toContain("Alpha");
        expect(html).toContain("฿200"); // line total
    });
    test("placeholder thumbnail when no img", () => {
        const html = renderCartModalItem(
            { sku: "A", name: "Alpha", qty: 1, price: 50 },
            { products: [{ sku: "A" }] }
        );
        expect(html).toContain("b2b-cat-modal-item-thumb placeholder");
    });
    test("V.32.4 remove button with data-rmsku", () => {
        const html = renderCartModalItem(
            { sku: "A", name: "Alpha", qty: 1, price: 50 },
            { products: [] }
        );
        expect(html).toContain("b2b-cart-remove-btn");
        expect(html).toContain('data-rmsku="A"');
        expect(html).toContain("🗑️");
    });
});

describe("pages/cart.js — renderCartEmptyState()", () => {
    test("shows 🛒 + Thai message", () => {
        const html = renderCartEmptyState();
        expect(html).toContain("🛒");
        expect(html).toContain("ตะกร้าว่างแล้ว");
        expect(html).toContain("กลับไปเลือกสินค้าจากแคตตาล็อก");
    });
});

describe("pages/cart.js — renderCartNoteSection()", () => {
    test("emits textarea#cartNoteInput maxlength=300", () => {
        const html = renderCartNoteSection();
        expect(html).toContain('id="cartNoteInput"');
        expect(html).toContain('maxlength="300"');
        expect(html).toContain("หมายเหตุ");
    });
});

describe("pages/cart.js — renderCartItems()", () => {
    test("empty → empty state + disabled confirm + 'กลับไปเลือกสินค้า'", () => {
        const out = renderCartItems([], {});
        expect(out.isEmpty).toBe(true);
        expect(out.total).toBe(0);
        expect(out.confirmDisabled).toBe(true);
        expect(out.confirmLabel).toBe("กลับไปเลือกสินค้า");
        expect(out.html).toContain("ตะกร้าว่างแล้ว");
    });
    test("non-empty → items + total + note section", () => {
        const out = renderCartItems(
            [
                { sku: "A", name: "Alpha", qty: 2, price: 100 },
                { sku: "B", name: "Beta", qty: 1, price: 250 },
            ],
            { products: [{ sku: "A", img: "/a.jpg" }] }
        );
        expect(out.isEmpty).toBe(false);
        expect(out.total).toBe(2 * 100 + 1 * 250);
        expect(out.confirmDisabled).toBe(false);
        expect(out.confirmLabel).toBe("ยืนยันสั่งสินค้า");
        expect(out.html).toContain("Alpha");
        expect(out.html).toContain("Beta");
        expect(out.html).toContain('id="cartNoteInput"');
    });
    test("editMode → 'ยืนยันแก้ไข' label", () => {
        const out = renderCartItems(
            [{ sku: "A", name: "A", qty: 1, price: 1 }],
            { products: [], editMode: true }
        );
        expect(out.confirmLabel).toBe("ยืนยันแก้ไข");
    });
});

describe("pages/cart.js — renderRecommendedChips()", () => {
    test("empty when no recs or no products", () => {
        expect(renderRecommendedChips([], [{ sku: "A" }])).toEqual({
            html: "",
            visible: false,
            count: 0,
        });
        expect(renderRecommendedChips(["A"], [])).toEqual({
            html: "",
            visible: false,
            count: 0,
        });
    });
    test("matches case-insensitively + truncates name", () => {
        const longName = "A very long product name beyond sixteen chars";
        const out = renderRecommendedChips(
            ["abc"],
            [{ sku: "ABC", name: longName }]
        );
        expect(out.count).toBe(1);
        expect(out.visible).toBe(true);
        expect(out.html).toContain("...");
    });
    test("caps at 6 visible chips", () => {
        const recs = Array.from({ length: 10 }, (_, i) => "S" + i);
        const products = recs.map((sku) => ({ sku, name: sku }));
        const out = renderRecommendedChips(recs, products);
        expect(out.count).toBe(6);
        expect(out.html.match(/b2b-cat-freq-chip/g).length).toBe(6);
    });
    test("emits data-action add-recommended + data-sku", () => {
        const out = renderRecommendedChips(
            ["A"],
            [{ sku: "A", name: "Alpha" }]
        );
        expect(out.html).toContain('data-action="add-recommended"');
        expect(out.html).toContain('data-sku="A"');
    });
});
