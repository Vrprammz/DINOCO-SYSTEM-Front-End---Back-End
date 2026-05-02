/**
 * Phase 6 Jest tests for liff-src/liff-ai/frontend/utils/* (V.0.2 Round 1).
 *
 * Covers 5 utility modules:
 *   - lang.js         (L, getLang, setLang — Thai-only with EN fallback)
 *   - format.js       (formatNumber, formatDate, formatRelativeTime, timeAgo, escHtml)
 *   - dom.js          (showToast, showError, showLoading, lockBtn, unlockBtn)
 *   - auth.js         (setSessionToken/getSessionToken/clearSessionToken + role + line_uid)
 *   - lead-status.js  (17 lead statuses + 13 claim statuses + 9-step timeline)
 *
 * Production behavior anchors:
 *   - Inline V.3.8 b2b_inline_js block — every helper here mirrors a specific
 *     function in that source. Drift = visual regression in LIFF AI.
 *   - Thai-only locale (LIFF AI doesn't multi-currency).
 *   - statusBadgeClass / claimBadgeClass logic must match inline EXACTLY —
 *     they drive `.liff-ai-badge-{class}` styling.
 */

/**
 * @jest-environment jsdom
 */

import { L, getLang, setLang, _resetLangForTests } from "../../liff-src/liff-ai/frontend/utils/lang.js";

import {
    formatNumber,
    formatDate,
    formatRelativeTime,
    timeAgo,
    escHtml,
} from "../../liff-src/liff-ai/frontend/utils/format.js";

import {
    $,
    $$,
    showToast,
    showError,
    showLoading,
    lockBtn,
    unlockBtn,
    isLocked,
    _resetLockForTests,
    setupOfflineDetection,
} from "../../liff-src/liff-ai/frontend/utils/dom.js";

import {
    setSessionToken,
    getSessionToken,
    clearSessionToken,
    setRole,
    getRole,
    setLineUid,
    getLineUid,
} from "../../liff-src/liff-ai/frontend/utils/auth.js";

import {
    LEAD_STATUSES,
    LEAD_STATUS_TH,
    CLAIM_STATUS_TH,
    STATUS_COLORS,
    TIMELINE_STEPS,
    statusBadgeClass,
    claimBadgeClass,
    getStatusLabel,
    getClaimStatusLabel,
    getStatusColor,
    getClaimStatusColor,
    getTimelineIndex,
} from "../../liff-src/liff-ai/frontend/utils/lead-status.js";

beforeEach(() => {
    _resetLangForTests();
    _resetLockForTests();
    if (typeof sessionStorage !== "undefined") sessionStorage.clear();
    document.body.innerHTML = "";
});

// ────────────────────────────────────────────────────────────────
describe("lang.js", () => {
    test("L() returns Thai by default", () => {
        expect(L("สวัสดี", "Hello")).toBe("สวัสดี");
        expect(getLang()).toBe("th");
    });

    test("L() returns English when setLang('en')", () => {
        setLang("en");
        expect(L("สวัสดี", "Hello")).toBe("Hello");
    });

    test("L() falls back to Thai when English missing", () => {
        setLang("en");
        expect(L("สวัสดี")).toBe("สวัสดี");
    });

    test("L() ignores 3rd arg (zh) — cross-surface signature parity", () => {
        // Should not throw; should still work as 2-arg.
        expect(L("ก", "a", "ignored")).toBe("ก");
    });

    test("setLang() defaults to 'th' for unknown values", () => {
        setLang("xyz");
        expect(getLang()).toBe("th");
    });
});

// ────────────────────────────────────────────────────────────────
describe("format.js", () => {
    test("formatNumber(1234) renders thousands separator", () => {
        expect(formatNumber(1234)).toMatch(/1,234/);
    });

    test("formatNumber(0) → 0", () => {
        expect(formatNumber(0)).toMatch(/^0$/);
    });

    test("formatNumber(null) → 0", () => {
        expect(formatNumber(null)).toMatch(/^0$/);
    });

    test("formatNumber(string) coerces", () => {
        expect(formatNumber("42")).toMatch(/42/);
    });

    test("formatDate(falsy) → '-'", () => {
        expect(formatDate(null)).toBe("-");
        expect(formatDate("")).toBe("-");
        expect(formatDate(undefined)).toBe("-");
    });

    test("formatDate returns a non-empty Thai-locale string", () => {
        const out = formatDate("2026-04-30T10:00:00Z");
        expect(out).toBeTruthy();
        expect(out).not.toBe("-");
    });

    test("formatRelativeTime(null) → '-'", () => {
        expect(formatRelativeTime(null)).toBe("-");
    });

    test("formatRelativeTime returns 'เมื่อสักครู่' for < 60s", () => {
        const recent = new Date(Date.now() - 30 * 1000).toISOString();
        expect(formatRelativeTime(recent)).toBe("เมื่อสักครู่");
    });

    test("formatRelativeTime returns 'นาทีที่แล้ว' for < 60m", () => {
        const t = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        expect(formatRelativeTime(t)).toBe("5 นาทีที่แล้ว");
    });

    test("formatRelativeTime returns 'ชั่วโมงที่แล้ว' for < 24h", () => {
        const t = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
        expect(formatRelativeTime(t)).toBe("3 ชั่วโมงที่แล้ว");
    });

    test("formatRelativeTime returns 'วันที่แล้ว' for >= 24h", () => {
        const t = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
        expect(formatRelativeTime(t)).toBe("2 วันที่แล้ว");
    });

    test("timeAgo is alias for formatRelativeTime", () => {
        const t = new Date(Date.now() - 30 * 1000).toISOString();
        expect(timeAgo(t)).toBe(formatRelativeTime(t));
    });

    test("escHtml(<script>) escapes brackets", () => {
        expect(escHtml("<script>alert(1)</script>")).toBe(
            "&lt;script&gt;alert(1)&lt;/script&gt;"
        );
    });

    test("escHtml(null) → empty string", () => {
        expect(escHtml(null)).toBe("");
        expect(escHtml(undefined)).toBe("");
    });

    test("escHtml does NOT escape quotes (matches inline V.3.8 textContent)", () => {
        expect(escHtml('"hello"')).toBe('"hello"');
    });
});

// ────────────────────────────────────────────────────────────────
describe("dom.js", () => {
    test("$ returns null when not found", () => {
        expect($("#nope-xyz")).toBeNull();
    });

    test("$ finds element when present", () => {
        document.body.innerHTML = '<div id="hit"></div>';
        expect($("#hit")).not.toBeNull();
    });

    test("$$ returns NodeList (length 0 ok)", () => {
        const list = $$(".liff-ai-foo-bar-baz-none");
        expect(list.length).toBe(0);
    });

    test("showToast creates element if missing and adds .show", () => {
        showToast("hello", "success");
        const el = document.getElementById("liffAiToast");
        expect(el).not.toBeNull();
        expect(el.textContent).toBe("hello");
        expect(el.className).toContain("show");
        expect(el.className).toContain("success");
    });

    test("showToast reuses existing #liffAiToast element", () => {
        const pre = document.createElement("div");
        pre.id = "liffAiToast";
        pre.className = "liff-ai-toast";
        document.body.appendChild(pre);
        showToast("hi", "error");
        expect(document.querySelectorAll("#liffAiToast").length).toBe(1);
        expect(pre.textContent).toBe("hi");
    });

    test("showError renders into #liffAiApp", () => {
        document.body.innerHTML = '<div id="liffAiApp"></div>';
        showError("Oops", "Something broke");
        const root = document.getElementById("liffAiApp");
        expect(root.innerHTML).toContain("liff-ai-error");
        expect(root.innerHTML).toContain("Oops");
        expect(root.innerHTML).toContain("Something broke");
    });

    test("showError no-ops when root missing (no throw)", () => {
        // No #liffAiApp element exists yet
        expect(() => showError("a", "b")).not.toThrow();
    });

    test("showLoading renders spinner", () => {
        document.body.innerHTML = '<div id="liffAiApp"></div>';
        showLoading();
        const root = document.getElementById("liffAiApp");
        expect(root.innerHTML).toContain("liff-ai-spinner");
        expect(root.innerHTML).toContain("กำลังโหลด...");
    });

    test("showLoading uses custom msg when provided", () => {
        document.body.innerHTML = '<div id="liffAiApp"></div>';
        showLoading("รอแป๊บ");
        expect(document.getElementById("liffAiApp").innerHTML).toContain("รอแป๊บ");
    });

    test("lockBtn returns true on first call, false on re-entry", () => {
        const btn = document.createElement("button");
        btn.innerHTML = "Save";
        document.body.appendChild(btn);
        expect(lockBtn(btn)).toBe(true);
        expect(isLocked()).toBe(true);
        expect(btn.disabled).toBe(true);
        // re-entry while locked
        const btn2 = document.createElement("button");
        expect(lockBtn(btn2)).toBe(false);
    });

    test("unlockBtn restores original innerHTML and clears LOCKED", () => {
        const btn = document.createElement("button");
        btn.innerHTML = "Original";
        lockBtn(btn);
        expect(btn.innerHTML).not.toBe("Original");
        unlockBtn(btn);
        expect(btn.innerHTML).toBe("Original");
        expect(isLocked()).toBe(false);
        expect(btn.disabled).toBe(false);
    });

    test("setupOfflineDetection is idempotent", () => {
        setupOfflineDetection();
        setupOfflineDetection();
        expect(document.querySelectorAll(".liff-ai-offline-banner").length).toBe(1);
    });
});

// ────────────────────────────────────────────────────────────────
describe("auth.js", () => {
    test("setSessionToken + getSessionToken roundtrip", () => {
        setSessionToken("abc.def.ghi");
        expect(getSessionToken()).toBe("abc.def.ghi");
    });

    test("setSessionToken(null) clears the key", () => {
        setSessionToken("xyz");
        setSessionToken(null);
        expect(getSessionToken()).toBeNull();
    });

    test("clearSessionToken wipes token + role + line_uid", () => {
        setSessionToken("t");
        setRole("admin");
        setLineUid("U123");
        clearSessionToken();
        expect(getSessionToken()).toBeNull();
        expect(getRole()).toBeNull();
        expect(getLineUid()).toBeNull();
    });

    test("setRole + getRole roundtrip", () => {
        setRole("dealer");
        expect(getRole()).toBe("dealer");
    });

    test("setLineUid + getLineUid roundtrip", () => {
        setLineUid("U1234567890abcdef");
        expect(getLineUid()).toBe("U1234567890abcdef");
    });

    test("get* functions return null when nothing stored", () => {
        expect(getSessionToken()).toBeNull();
        expect(getRole()).toBeNull();
        expect(getLineUid()).toBeNull();
    });
});

// ────────────────────────────────────────────────────────────────
describe("lead-status.js — enums", () => {
    test("LEAD_STATUSES contains 17 statuses", () => {
        expect(LEAD_STATUSES).toHaveLength(17);
    });

    test("LEAD_STATUS_TH covers every key in LEAD_STATUSES", () => {
        for (const s of LEAD_STATUSES) {
            expect(LEAD_STATUS_TH[s]).toBeTruthy();
        }
    });

    test("CLAIM_STATUS_TH has 13 entries (Service Center alignment)", () => {
        expect(Object.keys(CLAIM_STATUS_TH)).toHaveLength(13);
    });

    test("CLAIM_STATUS_TH includes core lifecycle keys", () => {
        for (const k of ["pending", "approved", "completed", "cancelled"]) {
            expect(CLAIM_STATUS_TH[k]).toBeTruthy();
        }
    });

    test("STATUS_COLORS includes all classifier output keys", () => {
        for (const cls of ["new", "active", "success", "danger", "muted",
                           "pending", "reviewing", "completed", "rejected"]) {
            expect(STATUS_COLORS[cls]).toMatch(/^#[0-9a-fA-F]+$/);
        }
    });

    test("TIMELINE_STEPS has 9 ordered steps starting at lead_created", () => {
        expect(TIMELINE_STEPS).toHaveLength(9);
        expect(TIMELINE_STEPS[0].key).toBe("lead_created");
        expect(TIMELINE_STEPS[8].key).toBe("closed_satisfied");
    });
});

// ────────────────────────────────────────────────────────────────
describe("lead-status.js — classifiers (mirrors inline V.3.8 EXACTLY)", () => {
    test("statusBadgeClass(falsy) → 'muted'", () => {
        expect(statusBadgeClass(null)).toBe("muted");
        expect(statusBadgeClass("")).toBe("muted");
    });

    test("statusBadgeClass('closed_satisfied') → 'success'", () => {
        expect(statusBadgeClass("closed_satisfied")).toBe("success");
    });

    test("statusBadgeClass('installed') → 'success'", () => {
        expect(statusBadgeClass("installed")).toBe("success");
    });

    test("statusBadgeClass('delivered') → 'success'", () => {
        expect(statusBadgeClass("delivered")).toBe("success");
    });

    test("statusBadgeClass('closed_lost') → 'danger'", () => {
        expect(statusBadgeClass("closed_lost")).toBe("danger");
    });

    test("statusBadgeClass('dealer_no_response') → 'danger'", () => {
        expect(statusBadgeClass("dealer_no_response")).toBe("danger");
    });

    test("statusBadgeClass('lead_created') → 'new'", () => {
        expect(statusBadgeClass("lead_created")).toBe("new");
    });

    test("statusBadgeClass('dealer_notified') → 'new'", () => {
        expect(statusBadgeClass("dealer_notified")).toBe("new");
    });

    test("statusBadgeClass(other) → 'active'", () => {
        expect(statusBadgeClass("waiting_order")).toBe("active");
        expect(statusBadgeClass("dealer_contacted")).toBe("active");
    });

    test("claimBadgeClass(falsy) → 'pending'", () => {
        expect(claimBadgeClass(null)).toBe("pending");
        expect(claimBadgeClass("")).toBe("pending");
    });

    test("claimBadgeClass('pending') → 'pending'", () => {
        expect(claimBadgeClass("pending")).toBe("pending");
    });

    test("claimBadgeClass('completed') → 'completed'", () => {
        expect(claimBadgeClass("completed")).toBe("completed");
        expect(claimBadgeClass("closed_resolved")).toBe("completed");
    });

    test("claimBadgeClass('rejected'/'cancelled') → 'rejected'", () => {
        expect(claimBadgeClass("rejected")).toBe("rejected");
        expect(claimBadgeClass("cancelled")).toBe("rejected");
        expect(claimBadgeClass("closed_rejected")).toBe("rejected");
    });

    test("claimBadgeClass('reviewing') → 'reviewing'", () => {
        expect(claimBadgeClass("reviewing")).toBe("reviewing");
        expect(claimBadgeClass("processing")).toBe("reviewing");
    });
});

// ────────────────────────────────────────────────────────────────
describe("lead-status.js — labels + colors + timeline", () => {
    test("getStatusLabel returns Thai for known status", () => {
        expect(getStatusLabel("lead_created")).toBe("สร้างใหม่");
        expect(getStatusLabel("closed_satisfied")).toBe("ปิด (พอใจ)");
    });

    test("getStatusLabel falls back to raw key", () => {
        expect(getStatusLabel("nonexistent_key")).toBe("nonexistent_key");
    });

    test("getStatusLabel(falsy) → '-'", () => {
        expect(getStatusLabel("")).toBe("-");
        expect(getStatusLabel(null)).toBe("-");
    });

    test("getClaimStatusLabel returns Thai for known status", () => {
        expect(getClaimStatusLabel("pending")).toBe("รอตรวจสอบ");
        expect(getClaimStatusLabel("approved")).toBe("อนุมัติ");
    });

    test("getStatusColor returns hex string", () => {
        expect(getStatusColor("lead_created")).toMatch(/^#[0-9a-fA-F]+$/);
        expect(getStatusColor("closed_lost")).toBe(STATUS_COLORS.danger);
        expect(getStatusColor("installed")).toBe(STATUS_COLORS.success);
    });

    test("getClaimStatusColor returns hex string", () => {
        expect(getClaimStatusColor("pending")).toBe(STATUS_COLORS.pending);
        expect(getClaimStatusColor("completed")).toBe(STATUS_COLORS.completed);
        expect(getClaimStatusColor("rejected")).toBe(STATUS_COLORS.rejected);
    });

    test("getTimelineIndex finds step by key", () => {
        expect(getTimelineIndex("lead_created")).toBe(0);
        expect(getTimelineIndex("delivered")).toBe(6);
        expect(getTimelineIndex("closed_satisfied")).toBe(8);
    });

    test("getTimelineIndex returns -1 when not in timeline", () => {
        expect(getTimelineIndex("dormant")).toBe(-1);
        expect(getTimelineIndex("nonexistent")).toBe(-1);
    });
});
