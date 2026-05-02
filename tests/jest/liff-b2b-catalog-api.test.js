/**
 * Phase 6 Jest tests for liff-src/b2b/catalog/api.js (V.0.4 Round 3).
 *
 * Covers createB2BCatalogApi() — B2B-scoped REST client wrapper:
 *   - Header injection: X-B2B-Token + (optional) X-WP-Nonce + auto
 *     X-Idempotency-Key on the 2 mutating endpoints (place-order +
 *     cancel-request).
 *   - Named methods: getCatalog / getOrderHistory / getOrderDetail /
 *     placeOrder / cancelOrder / modifyOrder (alias for place-order
 *     with edit_ticket).
 *   - HTTP error mapping:
 *       401 → onAuthExpired callback fires.
 *       409 → onConflict callback + per-code Thai message rewrite.
 *       429 → onRateLimit callback fires.
 *       503 → onMaintenance callback fires.
 *
 * Test strategy:
 *   - Stub global.fetch with jest.fn().
 *   - Inspect mock.calls[i][1].headers to assert injected headers.
 *   - Configure response status/body to drive error branches.
 *
 * Production anchor: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *   line 690-707 (authFetch) + `[B2B] Snippet 3: LIFF E-Catalog REST API`
 *   line 1002-1018 (place-order edit_ticket path).
 */

import {
    createB2BCatalogApi,
    _newIdempotencyKeyForTests,
} from "../../liff-src/b2b/catalog/api.js";

/**
 * Build a fetch mock that returns a configured response.
 *
 * @param {{ status?: number, body?: object|string, ok?: boolean }} [cfg]
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

describe("createB2BCatalogApi — header injection", () => {
    test("attaches X-B2B-Token from sessionToken", async () => {
        global.fetch = mockFetch({ body: { success: true } });
        const api = createB2BCatalogApi({
            base: "http://example.com/wp-json/b2b/v1",
            sessionToken: "jwt-abc-123",
        });
        await api.getCatalog();
        const init = global.fetch.mock.calls[0][1];
        expect(init.headers["X-B2B-Token"]).toBe("jwt-abc-123");
    });

    test("attaches X-WP-Nonce when nonce supplied", async () => {
        global.fetch = mockFetch({ body: { success: true } });
        const api = createB2BCatalogApi({
            base: "http://example.com/wp-json/b2b/v1",
            sessionToken: "jwt",
            nonce: "abc123nonce",
        });
        await api.getCatalog();
        const init = global.fetch.mock.calls[0][1];
        expect(init.headers["X-WP-Nonce"]).toBe("abc123nonce");
    });

    test("auto-attaches X-Idempotency-Key on placeOrder", async () => {
        global.fetch = mockFetch({ body: { ticket_id: 999 } });
        const api = createB2BCatalogApi({
            base: "http://example.com/wp-json/b2b/v1",
            sessionToken: "jwt",
        });
        await api.placeOrder({ items: [], note: "" });
        const init = global.fetch.mock.calls[0][1];
        expect(init.headers["X-Idempotency-Key"]).toBeDefined();
        expect(init.headers["X-Idempotency-Key"].length).toBeGreaterThan(8);
    });

    test("auto-attaches X-Idempotency-Key on cancelOrder", async () => {
        global.fetch = mockFetch({ body: { success: true } });
        const api = createB2BCatalogApi({
            base: "http://example.com/wp-json/b2b/v1",
            sessionToken: "jwt",
        });
        await api.cancelOrder(123, "ลูกค้าขอยกเลิก");
        const init = global.fetch.mock.calls[0][1];
        expect(init.headers["X-Idempotency-Key"]).toBeDefined();
    });

    test("modifyOrder uses /place-order endpoint with edit_ticket body", async () => {
        global.fetch = mockFetch({ body: { ticket_id: 999 } });
        const api = createB2BCatalogApi({
            base: "http://example.com/wp-json/b2b/v1",
            sessionToken: "jwt",
        });
        await api.modifyOrder(999, { items: [], note: "edit" });
        const url = global.fetch.mock.calls[0][0];
        const init = global.fetch.mock.calls[0][1];
        expect(url).toContain("/place-order");
        const sentBody = JSON.parse(init.body);
        expect(sentBody.edit_ticket).toBe(999);
    });

    test("does NOT attach X-Idempotency-Key on GET endpoints", async () => {
        global.fetch = mockFetch({ body: { products: [] } });
        const api = createB2BCatalogApi({
            base: "http://example.com/wp-json/b2b/v1",
            sessionToken: "jwt",
        });
        await api.getCatalog();
        const init = global.fetch.mock.calls[0][1];
        expect(init.headers["X-Idempotency-Key"]).toBeUndefined();
    });
});

describe("createB2BCatalogApi — named methods URL parity", () => {
    test("getCatalog hits /catalog", async () => {
        global.fetch = mockFetch({ body: { products: [] } });
        const api = createB2BCatalogApi({ base: "http://x/wp-json/b2b/v1" });
        await api.getCatalog();
        const url = global.fetch.mock.calls[0][0];
        expect(url).toBe("http://x/wp-json/b2b/v1/catalog");
    });

    test("getOrderHistory serializes params as query string", async () => {
        global.fetch = mockFetch({ body: { orders: [] } });
        const api = createB2BCatalogApi({ base: "http://x/wp-json/b2b/v1" });
        await api.getOrderHistory({ page: 2, per_page: 10, status: "paid" });
        const url = global.fetch.mock.calls[0][0];
        expect(url).toContain("/order-history?");
        expect(url).toContain("page=2");
        expect(url).toContain("per_page=10");
        expect(url).toContain("status=paid");
    });

    test("getOrderDetail uses ticket_id query param", async () => {
        global.fetch = mockFetch({ body: { ticket: {} } });
        const api = createB2BCatalogApi({ base: "http://x/wp-json/b2b/v1" });
        await api.getOrderDetail(456);
        const url = global.fetch.mock.calls[0][0];
        expect(url).toContain("/order-detail?ticket_id=456");
    });

    test("placeOrder POSTs to /place-order with JSON body", async () => {
        global.fetch = mockFetch({ body: { ticket_id: 999 } });
        const api = createB2BCatalogApi({ base: "http://x/wp-json/b2b/v1" });
        await api.placeOrder({ items: [{ sku: "FOO", qty: 1 }], note: "" });
        const url = global.fetch.mock.calls[0][0];
        const init = global.fetch.mock.calls[0][1];
        expect(url).toContain("/place-order");
        expect(init.method).toBe("POST");
        expect(init.headers["Content-Type"]).toBe("application/json");
        const sentBody = JSON.parse(init.body);
        expect(sentBody.items[0].sku).toBe("FOO");
    });

    test("cancelOrder POSTs body { order_id, reason }", async () => {
        global.fetch = mockFetch({ body: { success: true } });
        const api = createB2BCatalogApi({ base: "http://x/wp-json/b2b/v1" });
        await api.cancelOrder(123, "เปลี่ยนใจ");
        const init = global.fetch.mock.calls[0][1];
        const sentBody = JSON.parse(init.body);
        expect(sentBody.order_id).toBe(123);
        expect(sentBody.reason).toBe("เปลี่ยนใจ");
    });

    test("cancelOrder defaults reason to empty string", async () => {
        global.fetch = mockFetch({ body: { success: true } });
        const api = createB2BCatalogApi({ base: "http://x/wp-json/b2b/v1" });
        await api.cancelOrder(123);
        const init = global.fetch.mock.calls[0][1];
        const sentBody = JSON.parse(init.body);
        expect(sentBody.reason).toBe("");
    });
});

describe("createB2BCatalogApi — HTTP error mapping", () => {
    test("401 fires onAuthExpired callback", async () => {
        global.fetch = mockFetch({
            status: 401,
            body: { code: "rest_invalid_token", message: "Token expired" },
        });
        const onAuthExpired = jest.fn();
        const api = createB2BCatalogApi({
            base: "http://x/wp-json/b2b/v1",
            sessionToken: "expired",
            onAuthExpired,
        });
        await expect(api.getCatalog()).rejects.toThrow();
        expect(onAuthExpired).toHaveBeenCalledTimes(1);
    });

    test("429 fires onRateLimit callback with Thai message", async () => {
        global.fetch = mockFetch({
            status: 429,
            body: { code: "rate_limited", message: "Too many requests" },
        });
        const onRateLimit = jest.fn();
        const api = createB2BCatalogApi({
            base: "http://x/wp-json/b2b/v1",
            onRateLimit,
        });
        await expect(api.placeOrder({ items: [] })).rejects.toThrow();
        expect(onRateLimit).toHaveBeenCalledTimes(1);
        const arg = onRateLimit.mock.calls[0][0];
        expect(arg).toContain("ถี่เกินไป");
    });

    test("503 fires onMaintenance callback", async () => {
        global.fetch = mockFetch({
            status: 503,
            body: { code: "maintenance" },
        });
        const onMaintenance = jest.fn();
        const api = createB2BCatalogApi({
            base: "http://x/wp-json/b2b/v1",
            onMaintenance,
        });
        await expect(api.getCatalog()).rejects.toThrow();
        expect(onMaintenance).toHaveBeenCalledTimes(1);
    });

    test("409 idempotency_conflict fires onConflict + Thai message", async () => {
        global.fetch = mockFetch({
            status: 409,
            body: { code: "idempotency_conflict", message: "Conflict" },
        });
        const onConflict = jest.fn();
        const api = createB2BCatalogApi({
            base: "http://x/wp-json/b2b/v1",
            onConflict,
        });
        let caught;
        try {
            await api.placeOrder({ items: [] });
        } catch (err) {
            caught = err;
        }
        expect(onConflict).toHaveBeenCalledTimes(1);
        expect(caught.code).toBe("idempotency_conflict");
        expect(caught.message).toContain("คำสั่งซ้ำ");
    });

    test("409 order_modified emits Thai message", async () => {
        global.fetch = mockFetch({
            status: 409,
            body: { code: "order_modified" },
        });
        const onConflict = jest.fn();
        const api = createB2BCatalogApi({
            base: "http://x/wp-json/b2b/v1",
            onConflict,
        });
        let caught;
        try {
            await api.placeOrder({ items: [] });
        } catch (err) {
            caught = err;
        }
        expect(onConflict.mock.calls[0][0]).toContain("ถูกแก้ไข");
        expect(caught.code).toBe("order_modified");
    });

    test("409 stock_changed emits Thai message", async () => {
        global.fetch = mockFetch({
            status: 409,
            body: { code: "stock_changed" },
        });
        const onConflict = jest.fn();
        const api = createB2BCatalogApi({
            base: "http://x/wp-json/b2b/v1",
            onConflict,
        });
        let caught;
        try {
            await api.placeOrder({ items: [] });
        } catch (err) {
            caught = err;
        }
        expect(onConflict.mock.calls[0][0]).toContain("สต็อกเปลี่ยน");
        expect(caught.code).toBe("stock_changed");
    });

    test("503 sets default Thai message when callback receives empty msg", async () => {
        global.fetch = mockFetch({
            status: 503,
            body: { code: "maintenance" },
        });
        const onMaintenance = jest.fn();
        const api = createB2BCatalogApi({
            base: "http://x/wp-json/b2b/v1",
            onMaintenance,
        });
        await expect(api.getCatalog()).rejects.toThrow();
        const arg = onMaintenance.mock.calls[0][0];
        expect(arg).toContain("ปรับปรุง");
    });

    test("non-mapped errors propagate with status preserved", async () => {
        global.fetch = mockFetch({
            status: 500,
            body: { message: "Internal Server Error" },
        });
        const api = createB2BCatalogApi({ base: "http://x/wp-json/b2b/v1" });
        let caught;
        try {
            await api.getCatalog();
        } catch (err) {
            caught = err;
        }
        expect(caught).toBeDefined();
        expect(caught.status).toBe(500);
    });
});

describe("createB2BCatalogApi — newIdempotencyKey", () => {
    test("returns a non-empty string", () => {
        const k = _newIdempotencyKeyForTests();
        expect(typeof k).toBe("string");
        expect(k.length).toBeGreaterThan(8);
    });

    test("two consecutive calls return different keys", () => {
        const k1 = _newIdempotencyKeyForTests();
        const k2 = _newIdempotencyKeyForTests();
        expect(k1).not.toBe(k2);
    });
});
