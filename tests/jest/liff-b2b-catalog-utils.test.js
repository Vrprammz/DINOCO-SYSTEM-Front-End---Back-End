/**
 * Phase 6 Jest tests for liff-src/b2b/catalog/utils/* (V.0.2 Round 1).
 *
 * Covers 6 utility modules:
 *   - lang.js      (L, setupLanguage, getLang — Thai-only stubs)
 *   - format.js    (formatNumber, formatCurrency, formatDate, escHtml)
 *   - dom.js       (showToast, showAuthError, showLinkExpired,
 *                   showLoading, hideLoading, lockBtn, unlockBtn,
 *                   setupOfflineDetection)
 *   - pricing.js   (computeDealerPrice, validateMOQ, computeBoxes)
 *   - hierarchy.js (getLeafSkus, isLeafSku, isTopLevelSet,
 *                   computeHierarchyStock, getAncestorSkus)
 *   - cart.js      (loadCart, saveCart, setCartQty, incrCartQty,
 *                   computeItemCount, computeTotal, toOrderItems,
 *                   detectCartDuplicates, clearCart)
 *
 * Production behavior anchors:
 *   - Inline V.32.9 b2b_liff_page_js() — every helper here mirrors a
 *     specific function in that source. Drift = visual / pricing
 *     regression in B2B catalog.
 *   - DD-2 / DD-3 / DD-4 / DD-7 hierarchy contract (CLAUDE.md).
 *   - Manual Invoice picker double-discount lesson (V.34.4-V.34.6) —
 *     `computeDealerPrice` is preview-only; server is authoritative.
 */

import {
    L,
    setupLanguage,
    getLang,
} from "../../liff-src/b2b/catalog/utils/lang.js";

import {
    formatNumber,
    formatCurrency,
    formatDate,
    escHtml,
} from "../../liff-src/b2b/catalog/utils/format.js";

import {
    showToast,
    showAuthError,
    showLinkExpired,
    showLoading,
    hideLoading,
    lockBtn,
    unlockBtn,
    isLocked,
    setupOfflineDetection,
    _resetLockForTests,
} from "../../liff-src/b2b/catalog/utils/dom.js";

import {
    computeDealerPrice,
    validateMOQ,
    computeBoxes,
} from "../../liff-src/b2b/catalog/utils/pricing.js";

import {
    getLeafSkus,
    isLeafSku,
    isTopLevelSet,
    computeHierarchyStock,
    getAncestorSkus,
} from "../../liff-src/b2b/catalog/utils/hierarchy.js";

import {
    loadCart,
    saveCart,
    setCartQty,
    incrCartQty,
    computeItemCount,
    computeTotal,
    toOrderItems,
    detectCartDuplicates,
    clearCart,
    CART_STORAGE_KEY,
} from "../../liff-src/b2b/catalog/utils/cart.js";

// ──────────────────────────────────────────────────────────────────────
// lang.js — Thai-only stubs
// ──────────────────────────────────────────────────────────────────────
describe("b2b/catalog/utils/lang.js", () => {
    test("L() always returns the Thai string", () => {
        expect(L("ไทย", "EN", "ZH")).toBe("ไทย");
    });
    test("L() ignores en + zh args (Thai-only catalog)", () => {
        expect(L("สั่งสินค้า", "Order", "订单")).toBe("สั่งสินค้า");
    });
    test("L() handles empty Thai string", () => {
        expect(L("", "fallback")).toBe("");
    });
    test("setupLanguage() returns 'th'", () => {
        expect(setupLanguage()).toBe("th");
    });
    test("getLang() returns 'th'", () => {
        expect(getLang()).toBe("th");
    });
});

// ──────────────────────────────────────────────────────────────────────
// format.js
// ──────────────────────────────────────────────────────────────────────
describe("b2b/catalog/utils/format.js", () => {
    describe("formatNumber()", () => {
        test("rounds to whole baht (matches inline fmt())", () => {
            expect(formatNumber(7040)).toBe("7,040");
        });
        test("rounds 0.5 up (Math.round semantics)", () => {
            expect(formatNumber(7039.5)).toBe("7,040");
        });
        test("handles 0", () => {
            expect(formatNumber(0)).toBe("0");
        });
        test("handles null → 0", () => {
            expect(formatNumber(null)).toBe("0");
        });
        test("handles undefined → 0", () => {
            expect(formatNumber(undefined)).toBe("0");
        });
        test("handles NaN → 0 (defensive)", () => {
            expect(formatNumber(NaN)).toBe("0");
        });
        test("handles negative", () => {
            expect(formatNumber(-1234)).toBe("-1,234");
        });
        test("handles string number", () => {
            expect(formatNumber("8800")).toBe("8,800");
        });
        test("rounds 1234.4 → 1,234", () => {
            expect(formatNumber(1234.4)).toBe("1,234");
        });
        test("large number formatted with thousands sep", () => {
            expect(formatNumber(1000000)).toBe("1,000,000");
        });
    });

    describe("formatCurrency()", () => {
        test("THB (default) prepends ฿", () => {
            expect(formatCurrency(7040)).toBe("฿7,040");
        });
        test("THB explicit prepends ฿", () => {
            expect(formatCurrency(7040, "THB")).toBe("฿7,040");
        });
        test("USD prepends 'USD '", () => {
            expect(formatCurrency(100, "USD")).toBe("USD 100");
        });
        test("CNY prepends 'CNY '", () => {
            expect(formatCurrency(500, "CNY")).toBe("CNY 500");
        });
    });

    describe("formatDate()", () => {
        test("falsy returns dash", () => {
            expect(formatDate(null)).toBe("-");
            expect(formatDate("")).toBe("-");
            expect(formatDate(undefined)).toBe("-");
        });
        test("invalid date returns dash", () => {
            expect(formatDate("not-a-date")).toBe("-");
        });
        test("valid ISO date returns dd/mm/yyyy", () => {
            const out = formatDate("2026-04-30T10:00:00Z");
            // Locale-dependent — just check format shape
            expect(out).toMatch(/\d{2}\/\d{2}\/\d{4}/);
        });
        test("Date object input", () => {
            const d = new Date("2026-01-15");
            expect(formatDate(d)).toMatch(/\d{2}\/\d{2}\/\d{4}/);
        });
    });

    describe("escHtml()", () => {
        test("escapes <script>", () => {
            expect(escHtml("<script>alert(1)</script>")).toBe(
                "&lt;script&gt;alert(1)&lt;/script&gt;"
            );
        });
        test("escapes & + quotes (textContent never escapes ' or \")", () => {
            // Browser textContent → innerHTML escapes <>& but not "'.
            // We document behavior — caller must not insert into attrs without esc_attr equivalent.
            expect(escHtml("a & b")).toBe("a &amp; b");
        });
        test("returns empty string for null", () => {
            expect(escHtml(null)).toBe("");
        });
        test("returns empty string for undefined", () => {
            expect(escHtml(undefined)).toBe("");
        });
        test("returns empty string for empty string", () => {
            expect(escHtml("")).toBe("");
        });
        test("preserves Thai text", () => {
            expect(escHtml("กันล้ม")).toBe("กันล้ม");
        });
        test("coerces non-string", () => {
            expect(escHtml(123)).toBe("123");
        });
        test("preserves zero (truthiness edge case)", () => {
            // Inline `if(!str) return ''` would skip 0. We restore 0.
            expect(escHtml(0)).toBe("0");
        });
    });
});

// ──────────────────────────────────────────────────────────────────────
// dom.js — JSDOM-backed
// ──────────────────────────────────────────────────────────────────────
describe("b2b/catalog/utils/dom.js", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        _resetLockForTests();
    });

    test("showToast() auto-creates #liffToast on first call", () => {
        showToast("hello");
        const el = document.getElementById("liffToast");
        expect(el).not.toBeNull();
        expect(el.textContent).toBe("hello");
        expect(el.classList.contains("show")).toBe(true);
    });

    test("showToast() reuses existing #liffToast on subsequent calls", () => {
        showToast("first");
        showToast("second");
        const all = document.querySelectorAll("#liffToast");
        expect(all.length).toBe(1);
        expect(all[0].textContent).toBe("second");
    });

    test("showAuthError() sets title + message + shows error block", () => {
        document.body.innerHTML = `
            <div id="loadingScreen"></div>
            <div id="authError" style="display:none;">
                <h2 id="authErrTitle"></h2>
                <p id="authErrMsg"></p>
                <button id="authRetryBtn" style="display:none;"></button>
            </div>
        `;
        showAuthError("ไม่สามารถเข้าถึง", "เปิดจากกลุ่ม LINE", false);
        expect(document.getElementById("authErrTitle").textContent).toBe(
            "ไม่สามารถเข้าถึง"
        );
        expect(document.getElementById("authErrMsg").textContent).toBe(
            "เปิดจากกลุ่ม LINE"
        );
        expect(document.getElementById("authError").style.display).toBe("block");
        expect(document.getElementById("authRetryBtn").style.display).toBe("none");
    });

    test("showAuthError() with retryable=true exposes retry button", () => {
        document.body.innerHTML = `
            <div id="loadingScreen"></div>
            <div id="authError">
                <h2 id="authErrTitle"></h2>
                <p id="authErrMsg"></p>
                <button id="authRetryBtn" style="display:none;"></button>
            </div>
        `;
        const onRetry = jest.fn();
        showAuthError("เกิดข้อผิดพลาด", "ลองใหม่", true, onRetry);
        const btn = document.getElementById("authRetryBtn");
        expect(btn.style.display).toBe("inline-block");
        btn.click();
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    test("showLinkExpired() reveals #linkExpired + hides #authError", () => {
        document.body.innerHTML = `
            <div id="loadingScreen"></div>
            <div id="authError" style="display:block;"></div>
            <div id="linkExpired" style="display:none;"></div>
        `;
        showLinkExpired();
        expect(document.getElementById("authError").style.display).toBe("none");
        expect(document.getElementById("linkExpired").style.display).toBe("block");
    });

    test("showLoading() / hideLoading() toggle .show class on #submitOverlay", () => {
        document.body.innerHTML = `
            <div id="submitOverlay">
                <div id="submitMsg">default</div>
            </div>
        `;
        showLoading("กำลังส่ง...");
        expect(
            document.getElementById("submitOverlay").classList.contains("show")
        ).toBe(true);
        expect(document.getElementById("submitMsg").textContent).toBe(
            "กำลังส่ง..."
        );
        hideLoading();
        expect(
            document.getElementById("submitOverlay").classList.contains("show")
        ).toBe(false);
    });

    test("lockBtn() / unlockBtn() round-trip with text restore", () => {
        const btn = document.createElement("button");
        btn.textContent = "ส่ง";
        document.body.appendChild(btn);

        expect(isLocked()).toBe(false);
        const ok = lockBtn(btn, "กำลังส่ง...");
        expect(ok).toBe(true);
        expect(isLocked()).toBe(true);
        expect(btn.disabled).toBe(true);
        expect(btn.textContent).toBe("กำลังส่ง...");

        unlockBtn(btn);
        expect(isLocked()).toBe(false);
        expect(btn.disabled).toBe(false);
        expect(btn.textContent).toBe("ส่ง");
    });

    test("lockBtn() returns false on second call (idempotent)", () => {
        const btn = document.createElement("button");
        document.body.appendChild(btn);
        expect(lockBtn(btn)).toBe(true);
        expect(lockBtn(btn)).toBe(false);
    });

    test("setupOfflineDetection() is idempotent", () => {
        // Reset sentinel
        delete window.__b2bCatOfflineWired;
        const addSpy = jest.spyOn(window, "addEventListener");
        setupOfflineDetection();
        const firstCount = addSpy.mock.calls.length;
        setupOfflineDetection();
        const secondCount = addSpy.mock.calls.length;
        expect(secondCount).toBe(firstCount); // no extra listeners added
        addSpy.mockRestore();
    });
});

// ──────────────────────────────────────────────────────────────────────
// pricing.js
// ──────────────────────────────────────────────────────────────────────
describe("b2b/catalog/utils/pricing.js", () => {
    describe("computeDealerPrice()", () => {
        test("Silver 20% off ฿8,800 → ฿7,040", () => {
            expect(computeDealerPrice(8800, 20)).toBe(7040);
        });
        test("Gold 25% off ฿8,800 → ฿6,600", () => {
            expect(computeDealerPrice(8800, 25)).toBe(6600);
        });
        test("Platinum 30% off ฿10,000 → ฿7,000", () => {
            expect(computeDealerPrice(10000, 30)).toBe(7000);
        });
        test("Diamond 35% off ฿1,000 → ฿650", () => {
            expect(computeDealerPrice(1000, 35)).toBe(650);
        });
        test("0% discount returns base price", () => {
            expect(computeDealerPrice(8800, 0)).toBe(8800);
        });
        test("100% discount returns 0", () => {
            expect(computeDealerPrice(8800, 100)).toBe(0);
        });
        test(">=100% discount clamps to 0 (defensive)", () => {
            expect(computeDealerPrice(8800, 150)).toBe(0);
        });
        test("base 0 returns 0", () => {
            expect(computeDealerPrice(0, 20)).toBe(0);
        });
        test("negative base returns 0", () => {
            expect(computeDealerPrice(-100, 20)).toBe(0);
        });
        test("rounds to 2 decimals (matches PHP round)", () => {
            // 99.99 * 0.999 = 99.89001 → 99.89
            expect(computeDealerPrice(99.99, 0.1)).toBe(99.89);
        });
        test("string base + pct coerced to number", () => {
            expect(computeDealerPrice("8800", "20")).toBe(7040);
        });
    });

    describe("validateMOQ()", () => {
        test("valid: qty equals moq", () => {
            const r = validateMOQ({ sku: "X", qty: 5, moq: 5 });
            expect(r.valid).toBe(true);
        });
        test("invalid: missing sku", () => {
            const r = validateMOQ({ sku: "", qty: 1, moq: 1 });
            expect(r.valid).toBe(false);
            expect(r.reason).toBe("missing_sku");
        });
        test("invalid: qty 0", () => {
            const r = validateMOQ({ sku: "X", qty: 0, moq: 1 });
            expect(r.valid).toBe(false);
            expect(r.reason).toBe("invalid_qty");
            expect(r.suggested).toBe(1);
        });
        test("invalid: qty below moq → suggests moq", () => {
            const r = validateMOQ({ sku: "X", qty: 3, moq: 10 });
            expect(r.valid).toBe(false);
            expect(r.reason).toBe("below_moq");
            expect(r.suggested).toBe(10);
        });
        test("invalid: upb + bpu both > 1 (mutual exclusion)", () => {
            const r = validateMOQ({
                sku: "X", qty: 12, units_per_box: 4, boxes_per_unit: 2,
            });
            expect(r.valid).toBe(false);
            expect(r.reason).toBe("upb_bpu_conflict");
        });
        test("invalid: qty not multiple of upb → suggests next box", () => {
            const r = validateMOQ({ sku: "X", qty: 13, units_per_box: 4 });
            expect(r.valid).toBe(false);
            expect(r.reason).toBe("not_multiple_of_upb");
            expect(r.suggested).toBe(16); // ceil(13/4)*4
        });
        test("valid: qty exact multiple of upb", () => {
            const r = validateMOQ({ sku: "X", qty: 12, units_per_box: 4 });
            expect(r.valid).toBe(true);
        });
        test("valid: any qty when bpu > 1 (all valid — multiplier)", () => {
            const r = validateMOQ({ sku: "X", qty: 5, boxes_per_unit: 2 });
            expect(r.valid).toBe(true);
        });
    });

    describe("computeBoxes()", () => {
        test("upb=4, qty=12 → 3 boxes", () => {
            expect(computeBoxes({ qty: 12, units_per_box: 4 })).toBe(3);
        });
        test("upb=4, qty=13 → 4 boxes (ceil)", () => {
            expect(computeBoxes({ qty: 13, units_per_box: 4 })).toBe(4);
        });
        test("bpu=2, qty=5 → 10 boxes (multiplier)", () => {
            expect(computeBoxes({ qty: 5, boxes_per_unit: 2 })).toBe(10);
        });
        test("both = 1, qty=7 → 7 boxes (1:1)", () => {
            expect(computeBoxes({ qty: 7 })).toBe(7);
        });
        test("qty 0 → 0 boxes", () => {
            expect(computeBoxes({ qty: 0, units_per_box: 4 })).toBe(0);
        });
        test("qty negative → 0 boxes", () => {
            expect(computeBoxes({ qty: -1 })).toBe(0);
        });
    });
});

// ──────────────────────────────────────────────────────────────────────
// hierarchy.js — DD-2/DD-3/DD-4/DD-7 contract
// ──────────────────────────────────────────────────────────────────────
describe("b2b/catalog/utils/hierarchy.js", () => {
    /**
     * Test fixture (DD-3 + 3-level deep):
     *
     *   SET_A → CHILD_X, CHILD_Y
     *   SET_B → CHILD_X, CHILD_Z         ← shared CHILD_X (DD-3)
     *   CHILD_X → LEAF_L, LEAF_R
     *   CHILD_Y → LEAF_L                 ← shared LEAF_L (DD-3 deep)
     *   CHILD_Z (leaf — no children)
     *   LEAF_L, LEAF_R (leaves)
     *   STANDALONE (single — not in any tree)
     */
    const relations = {
        SET_A: ["CHILD_X", "CHILD_Y"],
        SET_B: ["CHILD_X", "CHILD_Z"],
        CHILD_X: ["LEAF_L", "LEAF_R"],
        CHILD_Y: ["LEAF_L"],
    };

    describe("getLeafSkus()", () => {
        test("leaf returns self", () => {
            expect(getLeafSkus("LEAF_L", relations)).toEqual(["LEAF_L"]);
        });
        test("CHILD_X expands to [LEAF_L, LEAF_R]", () => {
            expect(getLeafSkus("CHILD_X", relations).sort()).toEqual([
                "LEAF_L", "LEAF_R",
            ]);
        });
        test("SET_A expands to deduped leaves (DD-3)", () => {
            // SET_A → CHILD_X (LEAF_L, LEAF_R) + CHILD_Y (LEAF_L)
            // Dedup via array_unique → [LEAF_L, LEAF_R]
            const out = getLeafSkus("SET_A", relations).sort();
            expect(out).toEqual(["LEAF_L", "LEAF_R"]);
        });
        test("SET_B (DD-3 shared) returns [LEAF_L, LEAF_R, CHILD_Z]", () => {
            const out = getLeafSkus("SET_B", relations).sort();
            expect(out).toEqual(["CHILD_Z", "LEAF_L", "LEAF_R"]);
        });
        test("case-insensitive: lowercase input → uppercase output", () => {
            expect(getLeafSkus("set_a", relations).sort()).toEqual([
                "LEAF_L", "LEAF_R",
            ]);
        });
        test("unknown SKU returns [SELF] (treated as leaf)", () => {
            expect(getLeafSkus("STANDALONE", relations)).toEqual(["STANDALONE"]);
        });
        test("empty SKU returns []", () => {
            expect(getLeafSkus("", relations)).toEqual([]);
        });
        test("DD-3 sibling pollution guard — repeated call yields same result", () => {
            // V.7.1 C1/C2 lesson: pass `visited` BY VALUE per branch.
            // If we accidentally shared visited Set across siblings,
            // SET_A would lose CHILD_Y's leaves on the 2nd branch.
            const first = getLeafSkus("SET_A", relations).sort();
            const second = getLeafSkus("SET_A", relations).sort();
            expect(first).toEqual(second);
            expect(first.length).toBeGreaterThan(0);
        });
    });

    describe("isLeafSku()", () => {
        test("LEAF_L is leaf", () => {
            expect(isLeafSku("LEAF_L", relations)).toBe(true);
        });
        test("CHILD_X is NOT leaf", () => {
            expect(isLeafSku("CHILD_X", relations)).toBe(false);
        });
        test("SET_A is NOT leaf", () => {
            expect(isLeafSku("SET_A", relations)).toBe(false);
        });
        test("unknown SKU treated as leaf", () => {
            expect(isLeafSku("STANDALONE", relations)).toBe(true);
        });
    });

    describe("isTopLevelSet()", () => {
        test("SET_A is top-level (no parent)", () => {
            expect(isTopLevelSet("SET_A", relations)).toBe(true);
        });
        test("CHILD_X NOT top-level (SET_A + SET_B both parent it — DD-3)", () => {
            expect(isTopLevelSet("CHILD_X", relations)).toBe(false);
        });
        test("LEAF_L NOT top-level (no children)", () => {
            expect(isTopLevelSet("LEAF_L", relations)).toBe(false);
        });
    });

    describe("computeHierarchyStock()", () => {
        const stock = { LEAF_L: 10, LEAF_R: 5, CHILD_Z: 3 };

        test("leaf returns direct stock", () => {
            expect(computeHierarchyStock("LEAF_L", stock, relations)).toBe(10);
        });
        test("CHILD_X = MIN(LEAF_L=10, LEAF_R=5) = 5", () => {
            expect(computeHierarchyStock("CHILD_X", stock, relations)).toBe(5);
        });
        test("SET_A = MIN(CHILD_X=5, CHILD_Y=MIN(LEAF_L=10)=10) = 5", () => {
            expect(computeHierarchyStock("SET_A", stock, relations)).toBe(5);
        });
        test("SET_B = MIN(CHILD_X=5, CHILD_Z=3) = 3", () => {
            expect(computeHierarchyStock("SET_B", stock, relations)).toBe(3);
        });
        test("missing leaf stock defaults to 0", () => {
            expect(computeHierarchyStock("UNKNOWN", {}, relations)).toBe(0);
        });
    });

    describe("getAncestorSkus()", () => {
        test("LEAF_L has parents CHILD_X + CHILD_Y (DD-3 deep)", () => {
            const out = getAncestorSkus("LEAF_L", relations).sort();
            expect(out).toEqual(["CHILD_X", "CHILD_Y"]);
        });
        test("CHILD_X has parents SET_A + SET_B (DD-3 shared)", () => {
            const out = getAncestorSkus("CHILD_X", relations).sort();
            expect(out).toEqual(["SET_A", "SET_B"]);
        });
        test("SET_A has no ancestors (top-level)", () => {
            expect(getAncestorSkus("SET_A", relations)).toEqual([]);
        });
    });
});

// ──────────────────────────────────────────────────────────────────────
// cart.js — shallow dict (matches inline V.32.9 contract)
// ──────────────────────────────────────────────────────────────────────
describe("b2b/catalog/utils/cart.js", () => {
    beforeEach(() => {
        if (typeof localStorage !== "undefined") {
            try { localStorage.clear(); } catch { /* ignore */ }
        }
    });

    test("CART_STORAGE_KEY matches inline 'dinoco_cart'", () => {
        expect(CART_STORAGE_KEY).toBe("dinoco_cart");
    });

    test("loadCart() returns {} when storage empty", () => {
        expect(loadCart()).toEqual({});
    });

    test("saveCart() + loadCart() round-trip", () => {
        saveCart({ DNCSETA: 2, LEAF_L: 1 });
        expect(loadCart()).toEqual({ DNCSETA: 2, LEAF_L: 1 });
    });

    test("loadCart() returns {} when storage corrupt", () => {
        localStorage.setItem(CART_STORAGE_KEY, "not-json");
        expect(loadCart()).toEqual({});
    });

    test("loadCart() returns {} when storage holds non-object", () => {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(["a", "b"]));
        expect(loadCart()).toEqual({});
    });

    test("setCartQty() adds new SKU", () => {
        const next = setCartQty({}, "X", 3);
        expect(next).toEqual({ X: 3 });
    });

    test("setCartQty() qty <= 0 removes SKU", () => {
        const next = setCartQty({ X: 5 }, "X", 0);
        expect(next).toEqual({});
    });

    test("setCartQty() floors fractional qty", () => {
        expect(setCartQty({}, "X", 2.7)).toEqual({ X: 2 });
    });

    test("setCartQty() empty SKU is no-op", () => {
        const start = { X: 1 };
        expect(setCartQty(start, "", 5)).toBe(start);
    });

    test("incrCartQty() adds delta", () => {
        const next = incrCartQty({ X: 3 }, "X", 2);
        expect(next).toEqual({ X: 5 });
    });

    test("incrCartQty() default delta=1", () => {
        const next = incrCartQty({ X: 3 }, "X");
        expect(next).toEqual({ X: 4 });
    });

    test("incrCartQty() new SKU starts at delta", () => {
        const next = incrCartQty({}, "Y", 3);
        expect(next).toEqual({ Y: 3 });
    });

    test("incrCartQty() removes when total <= 0", () => {
        const next = incrCartQty({ X: 1 }, "X", -5);
        expect(next).toEqual({});
    });

    test("computeItemCount() sums qtys", () => {
        expect(computeItemCount({ A: 2, B: 3, C: 1 })).toBe(6);
    });

    test("computeItemCount() empty cart → 0", () => {
        expect(computeItemCount({})).toBe(0);
    });

    test("computeItemCount() handles null", () => {
        expect(computeItemCount(null)).toBe(0);
    });

    test("computeTotal() = sum(qty * dealer_price)", () => {
        const cart = { A: 2, B: 3 };
        const products = [
            { sku: "A", dealer_price: 100 },
            { sku: "B", dealer_price: 50 },
        ];
        expect(computeTotal(cart, products)).toBe(2 * 100 + 3 * 50);
    });

    test("computeTotal() skips SKUs not in product list", () => {
        const cart = { A: 2, GHOST: 5 };
        const products = [{ sku: "A", dealer_price: 100 }];
        expect(computeTotal(cart, products)).toBe(200);
    });

    test("computeTotal() skips invalid dealer_price", () => {
        const cart = { A: 2, B: 3 };
        const products = [
            { sku: "A", dealer_price: 100 },
            { sku: "B", dealer_price: NaN },
        ];
        expect(computeTotal(cart, products)).toBe(200);
    });

    test("toOrderItems() builds REST payload shape", () => {
        const cart = { A: 2 };
        const products = [{ sku: "A", name: "Item A", dealer_price: 100 }];
        const items = toOrderItems(cart, products);
        expect(items).toEqual([{ sku: "A", name: "Item A", qty: 2, price: 100 }]);
    });

    test("toOrderItems() omits SKUs with qty 0 / unknown", () => {
        const cart = { A: 0, B: 1, GHOST: 3 };
        const products = [
            { sku: "A", name: "A", dealer_price: 100 },
            { sku: "B", name: "B", dealer_price: 50 },
        ];
        const items = toOrderItems(cart, products);
        expect(items.length).toBe(1);
        expect(items[0].sku).toBe("B");
    });

    test("detectCartDuplicates() flags SET + child both in cart", () => {
        const cart = { SET_A: 1, CHILD_X: 2 };
        const products = [
            {
                sku: "SET_A",
                is_set: true,
                children_detail: [
                    { sku: "CHILD_X" },
                    { sku: "CHILD_Y" },
                ],
            },
        ];
        const out = detectCartDuplicates(cart, products);
        expect(out.length).toBe(1);
        expect(out[0].parentSku).toBe("SET_A");
        expect(out[0].conflicts).toEqual(["CHILD_X"]);
    });

    test("detectCartDuplicates() empty when no overlap", () => {
        const cart = { SET_A: 1 };
        const products = [
            {
                sku: "SET_A",
                is_set: true,
                children_detail: [{ sku: "CHILD_X" }],
            },
        ];
        expect(detectCartDuplicates(cart, products)).toEqual([]);
    });

    test("clearCart() returns empty dict", () => {
        expect(clearCart()).toEqual({});
    });
});
