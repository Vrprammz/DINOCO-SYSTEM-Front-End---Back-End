/**
 * Round 2 Jest tests for liff-src/b2f/catalog/pages/* (V.0.3).
 *
 * Covers 5 page-renderer modules:
 *   - catalog.js     — renderProducts + renderProductCard
 *   - setDetail.js   — renderSetDetailItems + renderSetDetailMainStepper +
 *                      buildQtyStepperHtml
 *   - cart.js        — renderCartItems + renderCartManufacturingSummary +
 *                      computeCartManufacturingSummary + buildCartItemThumbHtml
 *   - reviewGate.js  — renderReviewGate (V.7.0 3-bucket accordion)
 *   - filters.js     — renderModelFilter + renderTypeChips +
 *                      applyVisibilityFilters
 *
 * Production behavior anchors:
 *   - Inline `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.14 — every
 *     builder mirrors a specific function in that source. Drift = visual
 *     regression in B2F catalog post-Round-5 cutover.
 *   - V.7.0 Order Intent contract (3 buckets — full_set / sub_unit /
 *     single_leaf).
 *   - V.6.6 fallback — when ORDER_INTENT_ENABLED is false the legacy
 *     hierarchy-based 5 chips fire instead.
 *   - DD-3 shared-leaf: cart manufacturing summary surfaces multi-parent
 *     attribution.
 */

import {
    renderProducts,
    renderProductCard,
} from "../../liff-src/b2f/catalog/pages/catalog.js";

import {
    renderSetDetailItems,
    renderSetDetailMainStepper,
    buildQtyStepperHtml,
} from "../../liff-src/b2f/catalog/pages/setDetail.js";

import {
    renderCartItems,
    renderCartManufacturingSummary,
    computeCartManufacturingSummary,
    buildCartItemThumbHtml,
} from "../../liff-src/b2f/catalog/pages/cart.js";

import {
    renderReviewGate,
    BUCKET_CONFIGS,
} from "../../liff-src/b2f/catalog/pages/reviewGate.js";

import {
    renderModelFilter,
    renderTypeChips,
    applyVisibilityFilters,
} from "../../liff-src/b2f/catalog/pages/filters.js";

// ─────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────────────────

// MAKER_ID reserved for future Round 3 router fixtures.

function mkSet(over = {}) {
    return {
        sku: "DNCSETNX500X001",
        product_name: "ชุด NX500 X001",
        unit_cost: 5000,
        moq: 1,
        lead_time_days: 14,
        shipping_land: 0,
        shipping_sea: 0,
        product_type: "set",
        _jsType: "set",
        _jsDisplayType: "set",
        _jsChildrenCount: 4,
        compatible_models: '["NX500"]',
        production_mode: "set_assembled",
        confirmation_status: "confirmed",
        admin_display_mode: "auto",
        image_url: "https://cdn.example/set.jpg",
        ...over,
    };
}

function mkSingle(over = {}) {
    return {
        sku: "DNCBOLT01",
        product_name: "น็อต M5",
        unit_cost: 10,
        moq: 1,
        lead_time_days: 3,
        product_type: "single",
        _jsType: "single",
        _jsDisplayType: "single",
        production_mode: "single",
        confirmation_status: "confirmed",
        admin_display_mode: "auto",
        ...over,
    };
}

function mkSubUnit(over = {}) {
    return {
        sku: "DNCSUBPAIR",
        product_name: "Pair L+R",
        unit_cost: 1500,
        moq: 1,
        lead_time_days: 7,
        product_type: "child",
        _jsType: "child",
        _jsDisplayType: "child",
        _jsChildrenCount: 2,
        production_mode: "sub_unit",
        confirmation_status: "confirmed",
        admin_display_mode: "auto",
        ...over,
    };
}

function mkVirtualSet(over = {}) {
    return mkSet({
        sku: "DNCVIRTUAL_SET",
        is_virtual: true,
        virtual_reason: "shared_parts_assembled",
        ...over,
    });
}

const SKU_RELATIONS = {
    DNCSETNX500X001: ["DNCSUBPAIR", "DNCMOUNT"],
    DNCSUBPAIR: ["DNCSUBL", "DNCSUBR"],
    DNCSETNX500X002: ["DNCSUBPAIR"], // shared-leaf scenario
};

// ─────────────────────────────────────────────────────────────────────────
// catalog.js — renderProducts + renderProductCard
// ─────────────────────────────────────────────────────────────────────────

describe("renderProducts (catalog grid)", () => {
    test("renders empty state when list is empty", () => {
        const html = renderProducts([], {});
        expect(html).toContain("ไม่พบสินค้าที่ค้นหา");
        expect(html).toContain("b2f-cat-empty");
    });

    test("renders empty state when list is null/undefined", () => {
        expect(renderProducts(null, {})).toContain("ไม่พบสินค้า");
        expect(renderProducts(undefined, {})).toContain("ไม่พบสินค้า");
    });

    test("renders grid wrapper with first 6 images marked priority", () => {
        const list = [];
        for (let i = 0; i < 8; i++) {
            list.push(
                mkSingle({
                    sku: "P" + i,
                    product_name: "P" + i,
                    image_url: "https://cdn.example/p" + i + ".jpg",
                })
            );
        }
        const html = renderProducts(list, {}, { orderIntentEnabled: false });
        expect(html).toContain('class="b2f-cat-grid"');
        // First 6 → fetchpriority="high", remaining → loading="lazy"
        const priorityMatches = html.match(/fetchpriority="high"/g) || [];
        expect(priorityMatches.length).toBe(6);
    });

    test("skips card when admin_display_mode='as_parts' + has_children + flag ON", () => {
        const list = [
            mkSet({
                sku: "DNCSETHIDE",
                admin_display_mode: "as_parts",
                has_children: true,
            }),
            mkSingle({ sku: "VISIBLE" }),
        ];
        const html = renderProducts(list, {}, { orderIntentEnabled: true });
        expect(html).not.toContain('data-sku="DNCSETHIDE"');
        expect(html).toContain('data-sku="VISIBLE"');
    });

    test("does NOT skip when admin_display_mode='as_parts' + flag OFF", () => {
        const list = [
            mkSet({
                sku: "DNCSETHIDE",
                admin_display_mode: "as_parts",
                has_children: true,
            }),
        ];
        const html = renderProducts(list, {}, { orderIntentEnabled: false });
        expect(html).toContain('data-sku="DNCSETHIDE"');
    });
});

describe("renderProductCard (single card)", () => {
    test("set card emits 'ดูชุด' button + is-set class", () => {
        const html = renderProductCard(mkSet(), {});
        expect(html).toContain("is-set");
        expect(html).toContain("ดูชุด");
        expect(html).toContain('data-setsku="DNCSETNX500X001"');
        expect(html).not.toContain("b2f-cat-qty-wrap");
    });

    test("set card with qty shows 'N ชุดในตะกร้า' label", () => {
        const cart = { DNCSETNX500X001: { qty: 3 } };
        const html = renderProductCard(mkSet(), { cart });
        expect(html).toContain("3 ชุดในตะกร้า");
        expect(html).toContain("in-cart-btn");
    });

    test("single card emits qty stepper", () => {
        const html = renderProductCard(mkSingle(), {});
        expect(html).toContain("b2f-cat-qty-wrap");
        expect(html).toContain('data-action="minus"');
        expect(html).toContain('data-action="plus"');
        expect(html).toContain('data-sku="DNCBOLT01"');
        expect(html).not.toContain("ดูชุด");
    });

    test("V.7.0 set_assembled badge with leaf count from hierarchyMeta", () => {
        const html = renderProductCard(mkSet(), {
            orderIntentEnabled: true,
            hierarchyMeta: {
                DNCSETNX500X001: { total_leaves: 6 },
            },
        });
        expect(html).toContain("b2f-cat-badge-set-assembled");
        expect(html).toContain("🟣 ชุดเต็ม 6 ชิ้น");
    });

    test("V.7.0 sub_unit badge + sub-info preview when qty > 0", () => {
        const products = [
            mkSubUnit(),
            mkSingle({ sku: "DNCSUBL", product_name: "ซ้าย" }),
            mkSingle({ sku: "DNCSUBR", product_name: "ขวา" }),
        ];
        const cart = { DNCSUBPAIR: { qty: 5 } };
        const html = renderProductCard(mkSubUnit(), {
            orderIntentEnabled: true,
            cart,
            skuRelations: { DNCSUBPAIR: ["DNCSUBL", "DNCSUBR"] },
            products,
        });
        expect(html).toContain("b2f-cat-badge-sub-unit");
        expect(html).toContain("🟠 แยกชุด");
        expect(html).toContain("สั่ง 1 ชุด = ผลิต 2 ชิ้น");
        expect(html).toContain("จะขยายเป็น");
    });

    test("V.7.0 cross_factory_assembly badge + is-cross-factory class", () => {
        const p = mkSet({
            sku: "DNCXFA",
            production_mode: "cross_factory_assembly",
            _jsType: "set",
        });
        const html = renderProductCard(p, { orderIntentEnabled: true });
        expect(html).toContain("DINOCO ประกอบ");
        expect(html).toContain("is-cross-factory");
        expect(html).toContain("b2f-cat-badge-cross-factory");
    });

    test("V.7.0 single_leaf badge fires when production_mode=single", () => {
        const html = renderProductCard(mkSingle(), { orderIntentEnabled: true });
        expect(html).toContain("⚪ ชิ้นเดี่ยว");
        expect(html).toContain("b2f-cat-badge-single");
    });

    test("auto_synced confirmation status renders unconfirmed warning pill", () => {
        const p = mkSet({ confirmation_status: "auto_synced" });
        const html = renderProductCard(p, { orderIntentEnabled: true });
        expect(html).toContain("b2f-cat-badge-unconfirmed");
    });

    test("V.6.6 fallback badge — set type when flag OFF", () => {
        const html = renderProductCard(mkSet(), { orderIntentEnabled: false });
        expect(html).toContain("b2f-cat-badge-set");
        expect(html).not.toContain("b2f-cat-badge-set-assembled");
    });

    test("virtual SET shows amber 'ประกอบจากชิ้นส่วน' badge", () => {
        const html = renderProductCard(mkVirtualSet(), { orderIntentEnabled: true });
        expect(html).toContain("b2f-cat-virtual-badge");
        expect(html).toContain("ประกอบจากชิ้นส่วน");
    });

    test("breadcrumb appears for orphan child / grandchild", () => {
        const p = mkSubUnit({
            _jsType: "child",
            _jsDisplayType: "child",
            top_parent_name: "ชุดบน",
        });
        const html = renderProductCard(p, { orderIntentEnabled: false });
        expect(html).toContain("b2f-cat-breadcrumb");
        expect(html).toContain("ชุดบน");
    });

    test("currency symbol switches to ¥ when CNY", () => {
        const html = renderProductCard(mkSingle(), { currency: "CNY" });
        expect(html).toContain("¥");
        expect(html).not.toContain("฿");
    });

    test("MOQ + lead_time meta line", () => {
        const html = renderProductCard(mkSet({ moq: 5, lead_time_days: 21 }), {});
        expect(html).toContain("MOQ: 5");
        expect(html).toContain("Lead: 21 วัน");
    });

    test("override pill appears when _jsIsOverride", () => {
        const p = mkSingle({ _jsIsOverride: true });
        const html = renderProductCard(p, {});
        expect(html).toContain("b2f-cat-badge-override");
    });
});

// ─────────────────────────────────────────────────────────────────────────
// setDetail.js — renderSetDetailItems + steppers
// ─────────────────────────────────────────────────────────────────────────

describe("buildQtyStepperHtml", () => {
    test("collapsedDefault=true + qty=0 → '+ สั่งแยก' button", () => {
        const html = buildQtyStepperHtml("DNCSUBL", 0, true);
        expect(html).toContain("b2f-cat-sub-add-btn");
        expect(html).toContain("+ สั่งแยก");
        expect(html).toContain('data-subaddsku="DNCSUBL"');
        expect(html).not.toContain("b2f-qty-stepper");
    });

    test("collapsedDefault=true + qty>0 → full stepper with 'ในตะกร้า N'", () => {
        const html = buildQtyStepperHtml("DNCSUBL", 3, true);
        expect(html).toContain("b2f-qty-stepper");
        expect(html).toContain("ในตะกร้า 3");
        expect(html).toContain("in-cart");
    });

    test("default (collapsed=false) + qty=0 → stepper with '+ เพิ่ม'", () => {
        const html = buildQtyStepperHtml("DNCSUBL", 0, false);
        expect(html).toContain("b2f-qty-stepper");
        expect(html).toContain("+ เพิ่ม");
        expect(html).not.toContain("in-cart");
    });

    test("clamps high qty input default to 999", () => {
        const html = buildQtyStepperHtml("X", 0, false);
        expect(html).toContain('max="999"');
        expect(html).toContain('min="1"');
    });
});

describe("renderSetDetailMainStepper", () => {
    test("renders stepper with data-setmain=1 marker", () => {
        const html = renderSetDetailMainStepper("DNCSETX", 0, 1);
        expect(html).toContain('data-setmain="1"');
        expect(html).toContain("+ ชุดเต็ม");
    });

    test("appends MOQ hint when moq > 1", () => {
        const html = renderSetDetailMainStepper("DNCSETX", 0, 1, { moq: 10 });
        expect(html).toContain("ขั้นต่ำ 10 ชุด");
        expect(html).toContain("b2f-moq-hint");
    });

    test("no MOQ hint when moq=1", () => {
        const html = renderSetDetailMainStepper("DNCSETX", 0, 1, { moq: 1 });
        expect(html).not.toContain("b2f-moq-hint");
    });

    test("shows in-cart label when qty > 0", () => {
        const html = renderSetDetailMainStepper("DNCSETX", 5, 1);
        expect(html).toContain("ในตะกร้า 5");
    });
});

describe("renderSetDetailItems", () => {
    const setProduct = mkSet({ sku: "DNCSETNX500X001" });
    const products = [
        mkSubUnit({ sku: "DNCSUBPAIR" }),
        mkSingle({ sku: "DNCMOUNT", product_name: "ที่ยึด" }),
        mkSingle({ sku: "DNCSUBL", product_name: "ซ้าย" }),
        mkSingle({ sku: "DNCSUBR", product_name: "ขวา" }),
    ];

    test("returns empty string when setProduct is null", () => {
        expect(renderSetDetailItems(null, {})).toBe("");
    });

    test("renders children + grandchildren grouped under each child", () => {
        const html = renderSetDetailItems(setProduct, {
            products,
            skuRelations: SKU_RELATIONS,
        });
        // Child rows
        expect(html).toContain("b2f-cat-set-child");
        expect(html).toContain("DNCSUBPAIR");
        expect(html).toContain("DNCMOUNT");
        // Grandchildren section appears for DNCSUBPAIR (it has L+R)
        expect(html).toContain("b2f-cat-set-gc");
        expect(html).toContain("ซื้อแยกชิ้น");
        expect(html).toContain("DNCSUBL");
        expect(html).toContain("DNCSUBR");
    });

    test("empty fallback when no children + no meta", () => {
        const html = renderSetDetailItems(mkSet({ sku: "DNCEMPTY" }), {
            products,
            skuRelations: {},
        });
        expect(html).toContain("ไม่มีรายการสินค้าย่อย");
    });

    test("missing-leaves fallback uses hierarchyMeta count", () => {
        const html = renderSetDetailItems(mkSet({ sku: "DNCNOREG" }), {
            products,
            skuRelations: {},
            hierarchyMeta: {
                DNCNOREG: { all_leaves: ["L1", "L2", "L3"] },
            },
        });
        expect(html).toContain("3 ชิ้นส่วนในชุด");
    });

    test("DD-3 shared-leaf badge appears via countTopSetsForProduct callback", () => {
        const html = renderSetDetailItems(setProduct, {
            products,
            skuRelations: SKU_RELATIONS,
            countTopSetsForProduct: () => 3,
        });
        expect(html).toContain("ใช้ใน 3 ชุด");
    });

    test("CNY currency uses ¥ symbol in price rows", () => {
        const html = renderSetDetailItems(setProduct, {
            products,
            skuRelations: SKU_RELATIONS,
            currency: "CNY",
        });
        expect(html).toContain("¥");
    });
});

// ─────────────────────────────────────────────────────────────────────────
// cart.js — renderCartItems + manufacturing summary
// ─────────────────────────────────────────────────────────────────────────

describe("buildCartItemThumbHtml", () => {
    test("uses cart entry image_url first", () => {
        const html = buildCartItemThumbHtml({
            sku: "X",
            image_url: "https://cdn/x.jpg",
            product_name: "X",
        });
        expect(html).toContain("https://cdn/x.jpg");
        expect(html).toContain("b2f-cat-item-thumb");
    });

    test("falls back to products array when no image on cart entry", () => {
        const html = buildCartItemThumbHtml(
            { sku: "X" },
            {
                products: [{ sku: "X", image_url: "https://cdn/from-prod.jpg" }],
            }
        );
        expect(html).toContain("from-prod.jpg");
    });

    test("falls back to catalogMap when products empty", () => {
        const html = buildCartItemThumbHtml(
            { sku: "x" },
            { catalogMap: { X: { image_url: "https://cdn/cat.jpg" } } }
        );
        expect(html).toContain("cat.jpg");
    });

    test("placeholder when no source has an image", () => {
        const html = buildCartItemThumbHtml({ sku: "Z" });
        expect(html).toContain("placeholder");
        expect(html).toContain("&#128230;");
    });
});

describe("computeCartManufacturingSummary", () => {
    test("attributes shared-leaf qty to multiple parents", () => {
        const cart = {
            DNCSETNX500X001: { qty: 2, product_name: "SET A" },
            DNCSETNX500X002: { qty: 1, product_name: "SET B" },
        };
        const summary = computeCartManufacturingSummary(cart, SKU_RELATIONS);
        // Both SETs walk down to DNCSUBL/DNCSUBR via DNCSUBPAIR
        expect(summary.DNCSUBL).toBeDefined();
        expect(summary.DNCSUBL.qty).toBe(3); // 2 + 1
        expect(summary.DNCSUBL.breakdown.length).toBe(2);
        expect(summary.DNCSUBL.breakdown.map((b) => b.parent_name).sort()).toEqual(
            ["SET A", "SET B"]
        );
    });

    test("standalone leaf gets __standalone__ marker", () => {
        const cart = { DNCBOLT01: { qty: 5, product_name: "Bolt" } };
        const summary = computeCartManufacturingSummary(cart, {});
        expect(summary.DNCBOLT01).toBeDefined();
        expect(summary.DNCBOLT01.qty).toBe(5);
        expect(summary.DNCBOLT01.breakdown[0].parent_sku).toBe("__standalone__");
    });

    test("ignores qty=0 entries", () => {
        const cart = { DNCBOLT01: { qty: 0 } };
        const summary = computeCartManufacturingSummary(cart, {});
        expect(summary.DNCBOLT01).toBeUndefined();
    });
});

describe("renderCartManufacturingSummary", () => {
    test("returns empty string when no shared leaves", () => {
        const cart = { DNCBOLT01: { qty: 5, product_name: "Bolt" } };
        expect(renderCartManufacturingSummary(cart, {})).toBe("");
    });

    test("renders warning banner when shared leaves exist", () => {
        const cart = {
            DNCSETNX500X001: { qty: 2, product_name: "SET A" },
            DNCSETNX500X002: { qty: 1, product_name: "SET B" },
        };
        const html = renderCartManufacturingSummary(cart, SKU_RELATIONS);
        expect(html).toContain("ข้อมูลการผลิต");
        expect(html).toContain("DNCSUBL");
        expect(html).toContain("ต้องผลิต");
    });
});

describe("renderCartItems", () => {
    test("returns empty cart marker when cart is empty", () => {
        const r = renderCartItems({});
        expect(r.empty).toBe(true);
        expect(r.total).toBe(0);
        expect(r.html).toContain("ตะกร้าว่าง");
    });

    test("V.7.0 dual-section: full_set + sub_unit/single mixed", () => {
        const cart = {
            SETA: {
                sku: "SETA",
                product_name: "Set A",
                unit_cost: 1000,
                qty: 2,
                order_mode: "full_set",
            },
            SUBB: {
                sku: "SUBB",
                product_name: "Sub B",
                unit_cost: 200,
                qty: 1,
                order_mode: "sub_unit",
            },
            SINGLE: {
                sku: "SINGLE",
                product_name: "Single",
                unit_cost: 50,
                qty: 3,
                order_mode: "single_leaf",
            },
        };
        const r = renderCartItems(cart, { orderIntentEnabled: true });
        expect(r.empty).toBe(false);
        expect(r.total).toBe(2350); // 2000 + 200 + 150
        expect(r.html).toContain("🟣 ชุดเต็ม");
        expect(r.html).toContain("🟠 แยกชุด + ⚪ ชิ้นเดี่ยว");
        // Section subtotals should appear
        expect(r.html).toContain("b2f-cat-cart-section-sub");
    });

    test("V.7.0 single section when only one mode present", () => {
        const cart = {
            SETA: {
                sku: "SETA",
                product_name: "Set A",
                unit_cost: 1000,
                qty: 2,
                order_mode: "full_set",
            },
        };
        const r = renderCartItems(cart, { orderIntentEnabled: true });
        expect(r.html).toContain("🟣 ชุดเต็ม");
        expect(r.html).not.toContain("🟠 แยกชุด + ⚪ ชิ้นเดี่ยว");
    });

    test("V.6.6 fallback (flag OFF) renders flat", () => {
        const cart = {
            SETA: {
                sku: "SETA",
                product_name: "Set A",
                unit_cost: 1000,
                qty: 2,
                product_type: "set",
            },
        };
        const r = renderCartItems(cart, { orderIntentEnabled: false });
        expect(r.html).not.toContain("b2f-cat-cart-section-hdr");
        expect(r.html).toContain("Set A");
    });

    test("intent_notes rendered XSS-safe via escHtml", () => {
        const cart = {
            X: {
                sku: "X",
                product_name: "X",
                unit_cost: 100,
                qty: 1,
                order_mode: "sub_unit",
                intent_notes: "<script>alert(1)</script>",
            },
        };
        const r = renderCartItems(cart, { orderIntentEnabled: true });
        expect(r.html).toContain("&lt;script&gt;");
        expect(r.html).not.toMatch(/<script>alert/);
    });

    test("manufacturing summary appended at end of HTML", () => {
        const cart = {
            DNCSETNX500X001: {
                sku: "DNCSETNX500X001",
                product_name: "SET A",
                unit_cost: 5000,
                qty: 2,
                order_mode: "full_set",
            },
            DNCSETNX500X002: {
                sku: "DNCSETNX500X002",
                product_name: "SET B",
                unit_cost: 5000,
                qty: 1,
                order_mode: "full_set",
            },
        };
        const r = renderCartItems(cart, {
            orderIntentEnabled: true,
            skuRelations: SKU_RELATIONS,
        });
        expect(r.html).toContain("ข้อมูลการผลิต");
    });

    test("CNY currency reflected in totals", () => {
        const cart = {
            X: { sku: "X", product_name: "X", unit_cost: 100, qty: 2 },
        };
        const r = renderCartItems(cart, { currency: "CNY" });
        expect(r.html).toContain("¥");
    });
});

// ─────────────────────────────────────────────────────────────────────────
// reviewGate.js — V.7.0 3-bucket accordion
// ─────────────────────────────────────────────────────────────────────────

describe("renderReviewGate", () => {
    function mkReviewCart() {
        return {
            FULL1: {
                sku: "FULL1",
                product_name: "Full Set 1",
                unit_cost: 1000,
                qty: 2,
                order_mode: "full_set",
            },
            SUB1: {
                sku: "SUB1",
                product_name: "Sub 1",
                unit_cost: 500,
                qty: 1,
                order_mode: "sub_unit",
            },
            SINGLE1: {
                sku: "SINGLE1",
                product_name: "Single 1",
                unit_cost: 50,
                qty: 4,
                order_mode: "single_leaf",
            },
        };
    }

    test("returns empty when cart is empty", () => {
        const r = renderReviewGate({});
        expect(r.empty).toBe(true);
        expect(r.visibleBuckets).toEqual([]);
    });

    test("renders all 3 buckets when all modes present", () => {
        const r = renderReviewGate(mkReviewCart());
        expect(r.empty).toBe(false);
        expect(r.visibleBuckets).toEqual(["full_set", "sub_unit", "single_leaf"]);
        expect(r.grandTotal).toBe(2700); // 2000 + 500 + 200
    });

    test("emits role=tab + role=tabpanel for a11y", () => {
        const r = renderReviewGate(mkReviewCart());
        expect(r.html).toContain('role="tablist"');
        expect(r.html).toContain('role="tab"');
        expect(r.html).toContain('role="tabpanel"');
        expect(r.html).toContain('aria-orientation="vertical"');
    });

    test("aria-selected/expanded mirrors defaultOpen flag", () => {
        const r = renderReviewGate(mkReviewCart());
        // full_set + sub_unit defaultOpen=true → aria-expanded="true"
        expect(r.html).toMatch(
            /id="b2fReviewTab_full_set"[^>]*aria-expanded="true"/
        );
        // single_leaf defaultOpen=false → aria-expanded="false"
        expect(r.html).toMatch(
            /id="b2fReviewTab_single_leaf"[^>]*aria-expanded="false"/
        );
    });

    test("hidden attribute on collapsed bucket panel", () => {
        const r = renderReviewGate(mkReviewCart());
        expect(r.html).toMatch(/id="b2fReviewPanel_single_leaf"[^>]*hidden/);
    });

    test("omits empty buckets entirely", () => {
        const cart = {
            FULL1: {
                sku: "FULL1",
                product_name: "Full",
                unit_cost: 100,
                qty: 1,
                order_mode: "full_set",
            },
        };
        const r = renderReviewGate(cart);
        expect(r.visibleBuckets).toEqual(["full_set"]);
        expect(r.html).not.toContain("b2fReviewTab_sub_unit");
        expect(r.html).not.toContain("b2fReviewTab_single_leaf");
    });

    test("intent_notes rendered XSS-safe", () => {
        const cart = {
            X: {
                sku: "X",
                product_name: "X",
                unit_cost: 100,
                qty: 1,
                order_mode: "full_set",
                intent_notes: "<img src=x onerror=alert(1)>",
            },
        };
        const r = renderReviewGate(cart);
        expect(r.html).toContain("&lt;img");
        expect(r.html).not.toMatch(/<img src=x/);
    });

    test("maker name renders in header when provided", () => {
        const r = renderReviewGate(mkReviewCart(), {
            maker: { id: 1, name: "Happy Tech" },
        });
        expect(r.html).toContain("Happy Tech");
    });

    test("status total has aria-live=polite", () => {
        const r = renderReviewGate(mkReviewCart());
        expect(r.html).toContain('role="status"');
        expect(r.html).toContain('aria-live="polite"');
    });

    test("BUCKET_CONFIGS exported", () => {
        expect(BUCKET_CONFIGS.length).toBe(3);
        expect(BUCKET_CONFIGS[0].key).toBe("full_set");
    });

    test("CNY currency renders ¥ in totals", () => {
        const r = renderReviewGate(mkReviewCart(), { currency: "CNY" });
        expect(r.html).toContain("¥");
    });
});

// ─────────────────────────────────────────────────────────────────────────
// filters.js — model + type + visibility filter
// ─────────────────────────────────────────────────────────────────────────

describe("renderModelFilter", () => {
    test("hidden when no models found", () => {
        const r = renderModelFilter(
            [mkSingle({ compatible_models: "" })],
            { bysku: {} }
        );
        expect(r.visible).toBe(false);
        expect(r.html).toBe("");
    });

    test("emits 'ทั้งหมด' card + one card per model with data attribute", () => {
        const products = [
            mkSet({ compatible_models: '["NX500"]' }),
            mkSet({ sku: "X2", compatible_models: '["CB650R"]' }),
        ];
        const r = renderModelFilter(products, { bysku: {} });
        expect(r.visible).toBe(true);
        expect(r.html).toContain('data-filter-model=""'); // all card
        expect(r.html).toContain('data-filter-model="NX500"');
        expect(r.html).toContain('data-filter-model="CB650R"');
        expect(r.html).toContain("ทั้งหมด");
    });

    test("active class on currently selected model", () => {
        const products = [mkSet({ compatible_models: '["NX500"]' })];
        const r = renderModelFilter(products, { bysku: {} }, { filterModel: "NX500" });
        // active class precedes data-attr in DOM string
        expect(r.html).toMatch(/active"\s+data-filter-model="NX500"/);
    });

    test("uses motorcycle emoji fallback when no image", () => {
        const products = [mkSet({ compatible_models: '["NX500"]' })];
        const r = renderModelFilter(products, { bysku: {} });
        expect(r.html).toContain("🏍️");
    });

    test("renders model image when modelImageMap provides URL", () => {
        const products = [mkSet({ compatible_models: '["NX500"]' })];
        const r = renderModelFilter(
            products,
            { bysku: {} },
            { modelImageMap: { NX500: "https://cdn/nx500.jpg" } }
        );
        expect(r.html).toContain("https://cdn/nx500.jpg");
    });

    test("models sorted alphabetically", () => {
        const products = [
            mkSet({ sku: "A", compatible_models: '["Z-Bike"]' }),
            mkSet({ sku: "B", compatible_models: '["Alpha"]' }),
        ];
        const r = renderModelFilter(products, { bysku: {} });
        expect(r.models).toEqual(["Alpha", "Z-Bike"]);
    });
});

describe("renderTypeChips", () => {
    test("V.7.0 — 3 chips when ORDER_INTENT_ENABLED", () => {
        const visible = [
            mkSet({ production_mode: "set_assembled" }),
            mkSubUnit({ production_mode: "sub_unit" }),
            mkSingle({ production_mode: "single" }),
        ];
        const r = renderTypeChips(visible, { orderIntentEnabled: true });
        expect(r.visible).toBe(true);
        expect(r.html).toContain("🟣 ชุดเต็ม");
        expect(r.html).toContain("🟠 แยกชุด");
        expect(r.html).toContain("⚪ ชิ้นเดี่ยว");
        expect(r.counts.full_set).toBe(1);
        expect(r.counts.sub_unit).toBe(1);
        expect(r.counts.single_leaf).toBe(1);
    });

    test("V.7.0 — counts respect already-filtered visibleProducts", () => {
        // Caller passes a filtered list — chip should reflect 2 NX500 SETs only
        const visible = [
            mkSet({ sku: "S1", production_mode: "set_assembled" }),
            mkSet({ sku: "S2", production_mode: "set_assembled" }),
        ];
        const r = renderTypeChips(visible, { orderIntentEnabled: true });
        expect(r.counts[""]).toBe(2);
        expect(r.counts.full_set).toBe(2);
    });

    test("V.7.0 — cross_factory_assembly counts under full_set", () => {
        const visible = [
            mkSet({ production_mode: "cross_factory_assembly" }),
        ];
        const r = renderTypeChips(visible, { orderIntentEnabled: true });
        expect(r.counts.full_set).toBe(1);
    });

    test("V.6.6 fallback — 5 chips with hierarchy keys", () => {
        const visible = [
            mkSet({ _jsType: "set", _jsDisplayType: "set" }),
            mkSubUnit({ _jsType: "child", _jsDisplayType: "child" }),
            mkSingle({ _jsType: "single", _jsDisplayType: "single" }),
        ];
        const r = renderTypeChips(visible, { orderIntentEnabled: false });
        expect(r.html).toContain("ชุด SET");
        expect(r.html).toContain("เดี่ยว");
        expect(r.html).toContain("ลูกชิ้นส่วน");
        expect(r.counts.set).toBe(1);
        expect(r.counts.child).toBe(1);
        expect(r.counts.single).toBe(1);
    });

    test("hidden when all category counts are 0", () => {
        const r = renderTypeChips([], { orderIntentEnabled: true });
        expect(r.visible).toBe(false);
        expect(r.html).toBe("");
    });

    test("active class on selected filterType", () => {
        const visible = [mkSet({ production_mode: "set_assembled" })];
        const r = renderTypeChips(visible, {
            orderIntentEnabled: true,
            filterType: "full_set",
        });
        // active class precedes data-attr in DOM string
        expect(r.html).toMatch(/active"\s+data-filter-type="full_set"/);
    });

    test("zero-count chips hidden (V.5.1)", () => {
        const visible = [mkSet({ production_mode: "set_assembled" })];
        const r = renderTypeChips(visible, { orderIntentEnabled: true });
        // Only full_set has count > 0; sub_unit + single_leaf hidden
        expect(r.html).toContain("🟣 ชุดเต็ม");
        expect(r.html).not.toContain("🟠 แยกชุด");
        expect(r.html).not.toContain("⚪ ชิ้นเดี่ยว");
    });
});

describe("applyVisibilityFilters", () => {
    const products = [
        mkSet({
            sku: "DNCSETNX500",
            product_name: "ชุด NX500",
            compatible_models: '["NX500"]',
            production_mode: "set_assembled",
            _jsType: "set",
            _jsDisplayType: "set",
        }),
        mkSet({
            sku: "DNCSETCB650",
            product_name: "ชุด CB650R",
            compatible_models: '["CB650R"]',
            production_mode: "set_assembled",
            _jsType: "set",
            _jsDisplayType: "set",
        }),
        mkSingle({
            sku: "DNCBOLT01",
            product_name: "น็อต",
            production_mode: "single",
        }),
    ];

    test("returns full list when no filters", () => {
        const r = applyVisibilityFilters(products, {});
        expect(r.length).toBe(3);
    });

    test("search filters by sku", () => {
        const r = applyVisibilityFilters(products, {}, { query: "BOLT" });
        expect(r.length).toBe(1);
        expect(r[0].sku).toBe("DNCBOLT01");
    });

    test("search filters by product_name (case-insensitive)", () => {
        const r = applyVisibilityFilters(products, {}, { query: "cb650" });
        expect(r.length).toBe(1);
        expect(r[0].sku).toBe("DNCSETCB650");
    });

    test("isHiddenVirtual callback excludes virtual SETs", () => {
        const list = [...products, mkVirtualSet()];
        const r = applyVisibilityFilters(list, {}, {
            isHiddenVirtual: (p) => !!p.is_virtual,
        });
        expect(r.find((p) => p.is_virtual)).toBeUndefined();
    });

    test("filterType=full_set + flag ON matches set_assembled", () => {
        const r = applyVisibilityFilters(products, {}, {
            orderIntentEnabled: true,
            filterType: "full_set",
        });
        expect(r.length).toBe(2);
        expect(r.every((p) => p.production_mode === "set_assembled")).toBe(true);
    });

    test("filterType=set + flag OFF matches _jsDisplayType=set", () => {
        const r = applyVisibilityFilters(products, {}, {
            orderIntentEnabled: false,
            filterType: "set",
        });
        expect(r.length).toBe(2);
    });

    test("does not mutate input array", () => {
        const original = [...products];
        applyVisibilityFilters(products, {}, { query: "BOLT" });
        expect(products).toEqual(original);
    });
});
