/**
 * Phase 6 Jest tests for liff-src/b2f/maker/api.js (V.0.4 Round 3).
 *
 * Covers createMakerApi() — Maker-scoped REST client wrapper:
 *   - Header injection: X-B2F-Token + X-B2F-Line-Uid + X-Idempotency-Key
 *     (auto-attach on mutating endpoints).
 *   - GET body → query string serialization (V.4.7 line 653-655 parity).
 *   - 401 → onAuthExpired callback fires.
 *   - 410 → onCancelledPO callback fires with localized message.
 *   - 409 + code=idempotency_conflict → user-friendly localized message.
 *   - Named methods: confirmPO, rejectPO, reschedulePO, deliverLot,
 *     getPODetail, getMakerPOList all hit correct endpoints.
 *
 * Test strategy:
 *   - Stub global.fetch with jest.fn().
 *   - Inspect mock.calls to assert URL + headers + body shape.
 *   - For 401/410/409: configure mock to return that status + body.code.
 *
 * Production anchor: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7 line 641-664
 */

import { createMakerApi } from "../../liff-src/b2f/maker/api.js";
import { setLang } from "../../liff-src/b2f/maker/utils/lang.js";

/**
 * Build a fetch mock that returns a configured response.
 * @param {{ status?: number, body?: object, ok?: boolean }} cfg
 */
function mockFetch(cfg = {}) {
    const status = cfg.status === undefined ? 200 : cfg.status;
    const body = cfg.body === undefined ? { success: true } : cfg.body;
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: () => Promise.resolve(text),
    });
}

describe("createMakerApi — header injection", () => {
    beforeEach(() => {
        setLang("th");
    });

    test("attaches X-B2F-Token + X-B2F-Line-Uid on every request", async () => {
        global.fetch = mockFetch({ body: { success: true } });
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "jwt-abc-123",
            lineUid: "U123abc",
        });
        await api.getPODetail(42);
        const callArgs = global.fetch.mock.calls[0];
        const init = callArgs[1];
        expect(init.headers["X-B2F-Token"]).toBe("jwt-abc-123");
        expect(init.headers["X-B2F-Line-Uid"]).toBe("U123abc");
    });

    test("auto-attaches X-Idempotency-Key on confirmPO (mutating)", async () => {
        global.fetch = mockFetch({ body: { success: true } });
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "jwt",
        });
        await api.confirmPO(42, { expected_date: "2026-12-01" });
        const init = global.fetch.mock.calls[0][1];
        expect(init.headers["X-Idempotency-Key"]).toBeDefined();
        expect(init.headers["X-Idempotency-Key"].length).toBeGreaterThan(8);
    });

    test("auto-attaches X-Idempotency-Key on rejectPO + reschedulePO + deliverLot", async () => {
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "jwt",
        });
        for (const fn of ["rejectPO", "reschedulePO", "deliverLot"]) {
            global.fetch = mockFetch({ body: { success: true } });
            await api[fn](42, {});
            const init = global.fetch.mock.calls[0][1];
            expect(init.headers["X-Idempotency-Key"]).toBeDefined();
        }
    });

    test("does NOT attach X-Idempotency-Key on GET endpoints", async () => {
        global.fetch = mockFetch({ body: { data: [] } });
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "jwt",
        });
        await api.getMakerPOList();
        const init = global.fetch.mock.calls[0][1];
        expect(init.headers["X-Idempotency-Key"]).toBeUndefined();
    });

    test("uses crypto.randomUUID when available (or falls back gracefully)", async () => {
        // jsdom typically does NOT expose crypto.randomUUID — the api.js
        // fallback (timestamp+random) takes over. Verify a non-empty key
        // is still produced. When jsdom DOES expose it (Node 19+), prefer
        // spying to assert the canonical path. Either way the contract
        // (header attached, length > 8) holds.
        const hasNative =
            typeof globalThis.crypto !== "undefined" &&
            typeof globalThis.crypto.randomUUID === "function";

        let uuidSpy = null;
        if (hasNative) {
            uuidSpy = jest
                .spyOn(globalThis.crypto, "randomUUID")
                .mockReturnValue("fake-uuid-1234");
        }
        try {
            global.fetch = mockFetch({ body: { success: true } });
            const api = createMakerApi({
                base: "http://example.com/wp-json/b2f/v1",
                token: "jwt",
            });
            await api.confirmPO(1, {});
            const init = global.fetch.mock.calls[0][1];
            const key = init.headers["X-Idempotency-Key"];
            expect(key).toBeDefined();
            expect(typeof key).toBe("string");
            expect(key.length).toBeGreaterThan(8);
            if (uuidSpy) {
                expect(uuidSpy).toHaveBeenCalled();
                expect(key).toBe("fake-uuid-1234");
            }
        } finally {
            if (uuidSpy) uuidSpy.mockRestore();
        }
    });
});

describe("createMakerApi — GET body serialization", () => {
    test("getPODetail serializes po_id + token into query string", async () => {
        global.fetch = mockFetch({ body: { data: { id: 42 } } });
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "jwt-xyz",
        });
        await api.getPODetail(42);
        const url = global.fetch.mock.calls[0][0];
        expect(url).toMatch(/po-detail\/jwt\?/);
        expect(url).toContain("token=jwt-xyz");
        expect(url).toContain("po_id=42");
    });

    test("getMakerPOList serializes status filter", async () => {
        global.fetch = mockFetch({ body: { data: [] } });
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "jwt",
        });
        await api.getMakerPOList(undefined, { status: "confirmed,delivering" });
        const url = global.fetch.mock.calls[0][0];
        expect(url).toContain("status=confirmed%2Cdelivering");
    });
});

describe("createMakerApi — error mapping", () => {
    test("401 fires onAuthExpired callback", async () => {
        global.fetch = mockFetch({
            status: 401,
            body: { code: "rest_forbidden", message: "Token expired" },
        });
        const onAuthExpired = jest.fn();
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "stale",
            onAuthExpired,
        });
        await expect(api.getPODetail(1)).rejects.toThrow();
        expect(onAuthExpired).toHaveBeenCalledTimes(1);
    });

    test("410 fires onCancelledPO callback with localized message", async () => {
        setLang("en");
        global.fetch = mockFetch({
            status: 410,
            body: { code: "po_cancelled", message: "PO was cancelled" },
        });
        const onCancelledPO = jest.fn();
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "jwt",
            onCancelledPO,
        });
        await expect(api.confirmPO(1, {})).rejects.toThrow();
        expect(onCancelledPO).toHaveBeenCalledWith("PO cancelled");
    });

    test("409 + idempotency_conflict surfaces user-friendly localized error message", async () => {
        setLang("th");
        global.fetch = mockFetch({
            status: 409,
            body: {
                code: "idempotency_conflict",
                message: "request body mismatch",
            },
        });
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "jwt",
        });
        let caught;
        try {
            await api.confirmPO(1, {});
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeDefined();
        expect(caught.code).toBe("idempotency_conflict");
        // Thai error message is wrapped with [METHOD URL] suffix
        expect(caught.message).toContain("คำสั่งซ้ำ");
        expect(caught.status).toBe(409);
    });

    test("error message decorates with [METHOD URL] suffix for parity with V.4.7", async () => {
        global.fetch = mockFetch({
            status: 500,
            body: { code: "internal_error", message: "DB down" },
        });
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "jwt",
        });
        let caught;
        try {
            await api.confirmPO(1, {});
        } catch (e) {
            caught = e;
        }
        expect(caught.message).toMatch(/\[POST .*\/maker-confirm\]/);
    });
});

describe("createMakerApi — endpoint routing", () => {
    test("confirmPO POSTs to maker-confirm with payload + po_id", async () => {
        global.fetch = mockFetch({ body: { success: true } });
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "jwt",
        });
        await api.confirmPO(42, { expected_date: "2026-12-01", maker_note: "ok" });
        const init = global.fetch.mock.calls[0][1];
        expect(init.method).toBe("POST");
        const body = JSON.parse(init.body);
        expect(body.po_id).toBe(42);
        expect(body.expected_date).toBe("2026-12-01");
    });

    test("rejectPO POSTs to maker-reject", async () => {
        global.fetch = mockFetch({ body: { success: true } });
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "jwt",
        });
        await api.rejectPO(42, { reject_reason: "out of stock" });
        const url = global.fetch.mock.calls[0][0];
        expect(url).toContain("/maker-reject");
    });

    test("reschedulePO POSTs to maker-reschedule", async () => {
        global.fetch = mockFetch({ body: { success: true } });
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "jwt",
        });
        await api.reschedulePO(42, { new_date: "2026-12-15", reason: "weather" });
        const url = global.fetch.mock.calls[0][0];
        expect(url).toContain("/maker-reschedule");
    });

    test("deliverLot POSTs to maker-deliver with delivery_items", async () => {
        global.fetch = mockFetch({ body: { is_complete: true } });
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "jwt",
        });
        await api.deliverLot(42, {
            delivery_items: [{ sku: "A1", qty: 5 }],
        });
        const init = global.fetch.mock.calls[0][1];
        const body = JSON.parse(init.body);
        expect(body.po_id).toBe(42);
        expect(body.delivery_items).toEqual([{ sku: "A1", qty: 5 }]);
    });

    test("low-level call() respects custom method + path", async () => {
        global.fetch = mockFetch({ body: { ok: true } });
        const api = createMakerApi({
            base: "http://example.com/wp-json/b2f/v1",
            token: "jwt",
        });
        await api.call("GET", "custom/path", { a: 1 });
        const url = global.fetch.mock.calls[0][0];
        expect(url).toContain("/custom/path?a=1");
    });
});
