/**
 * Phase 6 Jest tests for liff-src/b2f/maker/utils/* (V.0.2 Round 1 foundation).
 *
 * Covers 6 utility modules:
 *   - lang.js       (L, setupLanguage, statusLabel, STATUS_*)
 *   - format.js     (formatNumber, curSym, formatDate, fmtDateShort, escHtml)
 *   - dom.js        (showToast, showError, showLoading, lockBtn, unlockBtn)
 *   - jwt.js        (jwtPayload — no signature verify)
 *   - badges.js     (modeBadgeHtml, modeSummaryHtml, buildStatusInfoBadges)
 *   - timeline.js   (getMinDate, buildTimelineBars)
 *
 * Production behavior anchors:
 *   - Inline V.4.6 b2f_liff_page_js() — every helper here mirrors a
 *     specific function in that source. Drift = visual regression in Maker LIFF.
 *   - 3-language switch: TH (default) / EN (USD) / ZH (CNY).
 *   - Mode badges (V.4.3 / V.4.6) are read-only — Maker never sees intent_notes.
 */

import {
    L,
    setupLanguage,
    setLang,
    getLang,
    statusLabel,
    STATUS_TH,
    STATUS_EN,
    STATUS_ZH,
} from "../../liff-src/b2f/maker/utils/lang.js";

import {
    formatNumber,
    curSym,
    formatDate,
    fmtDateShort,
    escHtml,
} from "../../liff-src/b2f/maker/utils/format.js";

import {
    showToast,
    showError,
    showLoading,
    lockBtn,
    unlockBtn,
    isLocked,
    _resetLockForTests,
} from "../../liff-src/b2f/maker/utils/dom.js";

import { jwtPayload } from "../../liff-src/b2f/maker/utils/jwt.js";

import {
    modeBadgeHtml,
    modeSummaryHtml,
    buildStatusInfoBadges,
} from "../../liff-src/b2f/maker/utils/badges.js";

import {
    getMinDate,
    buildTimelineBars,
} from "../../liff-src/b2f/maker/utils/timeline.js";

// ──────────────────────────────────────────────────────────────────────
// lang.js
// ──────────────────────────────────────────────────────────────────────
describe("lang.js", () => {
    beforeEach(() => setLang("th"));

    test("L() returns Thai when lang=th (default)", () => {
        expect(L("ไทย", "EN", "ZH")).toBe("ไทย");
    });

    test("L() returns English when currency=USD", () => {
        setupLanguage("USD");
        expect(L("ไทย", "EN", "ZH")).toBe("EN");
    });

    test("L() returns Chinese when currency=CNY", () => {
        setupLanguage("CNY");
        expect(L("ไทย", "EN", "ZH")).toBe("ZH");
    });

    test("L() falls back to English when Chinese label missing", () => {
        setupLanguage("CNY");
        expect(L("ไทย", "EN")).toBe("EN");
    });

    test("setupLanguage(THB) → th", () => {
        setupLanguage("THB");
        expect(getLang()).toBe("th");
    });

    test("setupLanguage(case-insensitive) → uppercases input", () => {
        setupLanguage("usd");
        expect(getLang()).toBe("en");
    });

    test("setupLanguage(empty) → th default", () => {
        setupLanguage("");
        expect(getLang()).toBe("th");
    });

    test("setupLanguage(unknown) → th default", () => {
        setupLanguage("EUR");
        expect(getLang()).toBe("th");
    });

    test("statusLabel(confirmed) returns localized label", () => {
        expect(statusLabel("confirmed")).toBe(STATUS_TH.confirmed);
        setupLanguage("USD");
        expect(statusLabel("confirmed")).toBe(STATUS_EN.confirmed);
        setupLanguage("CNY");
        expect(statusLabel("confirmed")).toBe(STATUS_ZH.confirmed);
    });

    test("statusLabel(unknown) returns raw key", () => {
        expect(statusLabel("foo_bar")).toBe("foo_bar");
    });

    test("STATUS_* maps cover all 12 expected statuses", () => {
        const keys = [
            "draft",
            "submitted",
            "confirmed",
            "amended",
            "rejected",
            "delivering",
            "received",
            "partial_received",
            "paid",
            "partial_paid",
            "completed",
            "cancelled",
        ];
        for (const k of keys) {
            expect(STATUS_TH).toHaveProperty(k);
            expect(STATUS_EN).toHaveProperty(k);
            expect(STATUS_ZH).toHaveProperty(k);
        }
    });
});

// ──────────────────────────────────────────────────────────────────────
// format.js
// ──────────────────────────────────────────────────────────────────────
describe("format.js", () => {
    beforeEach(() => setLang("th"));

    test("formatNumber(1234.5) → 1,234.50", () => {
        expect(formatNumber(1234.5)).toBe("1,234.50");
    });

    test("formatNumber(0) → 0.00", () => {
        expect(formatNumber(0)).toBe("0.00");
    });

    test("formatNumber(null) → 0.00", () => {
        expect(formatNumber(null)).toBe("0.00");
    });

    test("formatNumber(string) coerces", () => {
        expect(formatNumber("999.999")).toBe("1,000.00");
    });

    test("curSym() returns ฿ when currency_symbol missing", () => {
        expect(curSym({})).toBe("฿");
        expect(curSym(null)).toBe("฿");
    });

    test("curSym({currency_symbol:'$'}) → $", () => {
        expect(curSym({ currency_symbol: "$" })).toBe("$");
    });

    test("formatDate(falsy) → -", () => {
        expect(formatDate(null)).toBe("-");
        expect(formatDate("")).toBe("-");
    });

    test("formatDate returns DD/MM/YYYY pattern (Thai)", () => {
        const out = formatDate("2026-04-30");
        // th-TH locale renders as "30/4/2569" (Buddhist Era, no zero pad on month — varies by Node ICU build)
        expect(out).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    });

    test("fmtDateShort(falsy) → -", () => {
        expect(fmtDateShort(null)).toBe("-");
    });

    test("fmtDateShort Thai uses Buddhist Era last 2 digits", () => {
        const out = fmtDateShort("2026-04-30");
        // 2026 + 543 = 2569 → last 2 = "69"
        expect(out).toBe("30/04/69");
    });

    test("fmtDateShort English uses CE last 2 digits", () => {
        setupLanguage("USD");
        expect(fmtDateShort("2026-04-30")).toBe("30/04/26");
    });

    test("escHtml(<script>) escapes brackets", () => {
        const out = escHtml("<script>alert(1)</script>");
        expect(out).toContain("&lt;script&gt;");
        expect(out).toContain("&lt;/script&gt;");
    });

    test("escHtml(null) → empty string", () => {
        expect(escHtml(null)).toBe("");
        expect(escHtml(undefined)).toBe("");
    });

    test("escHtml does NOT escape quotes (matches inline V.4.6 textContent behavior)", () => {
        const out = escHtml('"hello"');
        // textContent → innerHTML round-trip preserves double quotes
        expect(out).toContain('"');
    });
});

// ──────────────────────────────────────────────────────────────────────
// dom.js
// ──────────────────────────────────────────────────────────────────────
describe("dom.js", () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="b2f-app"></div>';
        _resetLockForTests();
    });

    test("showToast appends .b2f-toast and adds .show", () => {
        jest.useFakeTimers();
        showToast("hello", "success");
        const toast = document.querySelector(".b2f-toast");
        expect(toast).not.toBeNull();
        expect(toast.textContent).toBe("hello");
        expect(toast.classList.contains("success")).toBe(true);
        jest.useRealTimers();
    });

    test("showLoading injects spinner into #b2f-app", () => {
        showLoading();
        expect(document.querySelector("#b2f-app .b2f-loading")).not.toBeNull();
        expect(document.querySelector(".b2f-spinner-lg")).not.toBeNull();
    });

    test("showError renders title + message", () => {
        showError("Oops", "Bad thing happened");
        const root = document.querySelector("#b2f-app");
        expect(root.innerHTML).toContain("Oops");
        expect(root.innerHTML).toContain("Bad thing happened");
        expect(root.querySelector(".b2f-btn-outline")).not.toBeNull();
    });

    test("showError escapes HTML in title/msg", () => {
        showError("<x>", "<y>");
        const root = document.querySelector("#b2f-app");
        // textContent will reveal the rendered (un-HTML'd) text
        expect(root.textContent).toContain("<x>");
        expect(root.textContent).toContain("<y>");
        // Source HTML must contain the escape sequences (no raw <x> tags)
        expect(root.innerHTML).toContain("&lt;x&gt;");
    });

    test("showError onGoToList callback fires when button clicked", () => {
        const onGo = jest.fn();
        showError("t", "m", { onGoToList: onGo });
        document.querySelector(".b2f-btn-outline").click();
        expect(onGo).toHaveBeenCalledTimes(1);
    });

    test("lockBtn locks single-flight + spins button", () => {
        const btn = document.createElement("button");
        btn.innerHTML = "Save";
        const ok = lockBtn(btn);
        expect(ok).toBe(true);
        expect(btn.disabled).toBe(true);
        expect(btn.dataset.origText).toBe("Save");
        expect(btn.innerHTML).toContain("b2f-spinner");
        expect(isLocked()).toBe(true);
    });

    test("lockBtn returns false when LOCKED already true", () => {
        const a = document.createElement("button");
        const b = document.createElement("button");
        a.innerHTML = "A";
        b.innerHTML = "B";
        expect(lockBtn(a)).toBe(true);
        expect(lockBtn(b)).toBe(false);
        expect(b.disabled).toBe(false); // not locked
    });

    test("unlockBtn restores innerHTML + clears lock", () => {
        const btn = document.createElement("button");
        btn.innerHTML = "Save";
        lockBtn(btn);
        unlockBtn(btn);
        expect(btn.disabled).toBe(false);
        expect(btn.innerHTML).toBe("Save");
        expect(isLocked()).toBe(false);
    });
});

// ──────────────────────────────────────────────────────────────────────
// jwt.js
// ──────────────────────────────────────────────────────────────────────
describe("jwt.js", () => {
    function makeJwt(payload) {
        const head = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
            .replace(/=+$/, "")
            .replace(/\+/g, "-")
            .replace(/\//g, "_");
        const body = btoa(JSON.stringify(payload))
            .replace(/=+$/, "")
            .replace(/\+/g, "-")
            .replace(/\//g, "_");
        return `${head}.${body}.fake-sig`;
    }

    test("jwtPayload extracts payload object", () => {
        const tok = makeJwt({ maker_currency: "USD", page: "confirm" });
        expect(jwtPayload(tok)).toEqual({
            maker_currency: "USD",
            page: "confirm",
        });
    });

    test("jwtPayload returns {} on malformed token", () => {
        expect(jwtPayload("not-a-jwt")).toEqual({});
        expect(jwtPayload("")).toEqual({});
        expect(jwtPayload(null)).toEqual({});
        expect(jwtPayload(undefined)).toEqual({});
    });

    test("jwtPayload returns {} on bad base64 body", () => {
        expect(jwtPayload("aaa.@@@invalid@@@.bbb")).toEqual({});
    });
});

// ──────────────────────────────────────────────────────────────────────
// badges.js
// ──────────────────────────────────────────────────────────────────────
describe("badges.js", () => {
    beforeEach(() => setLang("th"));

    test("modeBadgeHtml(full_set) contains item-mode-badge + mode-full-set", () => {
        const html = modeBadgeHtml({ poi_order_mode: "full_set" });
        expect(html).toContain("item-mode-badge");
        expect(html).toContain("mode-full-set");
        expect(html).toContain("ชุดเต็ม");
    });

    test("modeBadgeHtml(sub_unit) Thai", () => {
        expect(modeBadgeHtml({ poi_order_mode: "sub_unit" })).toContain("แยกชุด");
    });

    test("modeBadgeHtml(single_leaf) Thai", () => {
        expect(modeBadgeHtml({ poi_order_mode: "single_leaf" })).toContain(
            "ชิ้นเดี่ยว"
        );
    });

    test("modeBadgeHtml empty when mode missing", () => {
        expect(modeBadgeHtml({})).toBe("");
        expect(modeBadgeHtml(null)).toBe("");
        expect(modeBadgeHtml({ poi_order_mode: "" })).toBe("");
    });

    test("modeBadgeHtml empty when mode unknown", () => {
        expect(modeBadgeHtml({ poi_order_mode: "weird" })).toBe("");
    });

    test("modeBadgeHtml fallback key (order_mode without poi_ prefix)", () => {
        expect(modeBadgeHtml({ order_mode: "full_set" })).toContain("ชุดเต็ม");
    });

    test("modeSummaryHtml empty when ORDER_INTENT_ENABLED off", () => {
        const po = { items: [{ poi_order_mode: "full_set", poi_qty_ordered: 5 }] };
        expect(modeSummaryHtml(po, { orderIntentEnabled: false })).toBe("");
    });

    test("modeSummaryHtml empty when no items", () => {
        expect(modeSummaryHtml({}, { orderIntentEnabled: true })).toBe("");
        expect(modeSummaryHtml({ items: [] }, { orderIntentEnabled: true })).toBe("");
    });

    test("modeSummaryHtml empty for legacy PO (items without order_mode)", () => {
        const po = { items: [{ poi_sku: "X", poi_qty_ordered: 5 }] };
        expect(modeSummaryHtml(po, { orderIntentEnabled: true })).toBe("");
    });

    test("modeSummaryHtml all-mode pill when only one mode present", () => {
        const po = {
            po_items: [
                { poi_order_mode: "full_set", poi_qty_ordered: 7 },
                { poi_order_mode: "full_set", poi_qty_ordered: 3 },
            ],
        };
        const html = modeSummaryHtml(po, { orderIntentEnabled: true });
        expect(html).toContain("po-mode-pill all-mode");
        expect(html).toContain("ทั้งหมด ชุดเต็ม");
        expect(html).toContain("(10)");
    });

    test("modeSummaryHtml mixed pills when multiple modes present", () => {
        const po = {
            items: [
                { poi_order_mode: "full_set", poi_qty_ordered: 5 },
                { poi_order_mode: "sub_unit", poi_qty_ordered: 3 },
                { poi_order_mode: "single_leaf", poi_qty_ordered: 2 },
            ],
        };
        const html = modeSummaryHtml(po, { orderIntentEnabled: true });
        expect(html).toContain("po-mode-pill full-set");
        expect(html).toContain("po-mode-pill sub-unit");
        expect(html).toContain("po-mode-pill single-leaf");
        // No all-mode pill in mixed case
        expect(html).not.toContain("all-mode");
    });

    test("modeSummaryHtml skips zero-qty items", () => {
        const po = {
            items: [
                { poi_order_mode: "full_set", poi_qty_ordered: 0 },
                { poi_order_mode: "sub_unit", poi_qty_ordered: 4 },
            ],
        };
        const html = modeSummaryHtml(po, { orderIntentEnabled: true });
        expect(html).toContain("ทั้งหมด แยกชุด");
        expect(html).not.toContain("ชุดเต็ม");
    });

    test("buildStatusInfoBadges(delivering) shows pending inspection", () => {
        const po = {
            po_status: "delivering",
            items: [{ poi_qty_shipped: 10, poi_qty_received: 3 }],
        };
        const html = buildStatusInfoBadges(po);
        expect(html).toContain("info-waiting");
        expect(html).toContain("7"); // 10-3
    });

    test("buildStatusInfoBadges(partial_received) shows reject info when rejected qty", () => {
        const po = {
            po_status: "partial_received",
            items: [{ poi_qty_shipped: 10, poi_qty_received: 7, poi_qty_rejected: 2 }],
        };
        const html = buildStatusInfoBadges(po);
        expect(html).toContain("info-reject");
        expect(html).toContain("2");
    });

    test("buildStatusInfoBadges(received) → success badge", () => {
        const html = buildStatusInfoBadges({ po_status: "received", items: [] });
        expect(html).toContain("info-success");
        expect(html).toContain("รับของครบแล้ว");
    });

    test("buildStatusInfoBadges(paid|completed) → success badge", () => {
        expect(buildStatusInfoBadges({ po_status: "paid", items: [] })).toContain(
            "info-success"
        );
        expect(buildStatusInfoBadges({ po_status: "completed", items: [] })).toContain(
            "info-success"
        );
    });

    test("buildStatusInfoBadges(partial_paid) → payment badge", () => {
        expect(
            buildStatusInfoBadges({ po_status: "partial_paid", items: [] })
        ).toContain("info-payment");
    });

    test("buildStatusInfoBadges(unknown status) → empty", () => {
        expect(buildStatusInfoBadges({ po_status: "foo", items: [] })).toBe("");
    });
});

// ──────────────────────────────────────────────────────────────────────
// timeline.js
// ──────────────────────────────────────────────────────────────────────
describe("timeline.js", () => {
    beforeEach(() => setLang("th"));

    test("getMinDate returns ISO date string for tomorrow", () => {
        const out = getMinDate();
        expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const d = new Date(out);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        expect(d.toISOString().split("T")[0]).toBe(
            tomorrow.toISOString().split("T")[0]
        );
    });

    test("buildTimelineBars empty when no eta + no actual", () => {
        expect(buildTimelineBars({ po_status: "draft" })).toBe("");
    });

    test("buildTimelineBars renders delivery bar for submitted with eta", () => {
        const future = new Date();
        future.setDate(future.getDate() + 7);
        const past = new Date();
        past.setDate(past.getDate() - 3);
        const html = buildTimelineBars({
            expected_date: future.toISOString().split("T")[0],
            created_date: past.toISOString().split("T")[0],
            po_status: "submitted",
        });
        expect(html).toContain("b2f-timeline-bar");
        // Thai (default) label
        expect(html).toContain("กำหนดส่ง");
    });

    test("buildTimelineBars renders credit bar only for THB received PO", () => {
        const past = new Date();
        past.setDate(past.getDate() - 5);
        const html = buildTimelineBars({
            actual_date: past.toISOString().split("T")[0],
            po_status: "received",
            credit_term_days: 30,
            currency: "THB",
        });
        expect(html).toContain("b2f-timeline-bar");
        expect(html).toContain("ครบกำหนดจ่าย");
    });

    test("buildTimelineBars NO credit bar for foreign currency (USD)", () => {
        const past = new Date();
        past.setDate(past.getDate() - 5);
        const html = buildTimelineBars({
            actual_date: past.toISOString().split("T")[0],
            po_status: "received",
            credit_term_days: 30,
            currency: "USD",
        });
        // No credit bar for non-THB makers
        expect(html).not.toContain("ครบกำหนดจ่าย");
    });
});
