/**
 * Phase 6 Jest tests for liff-src/shared/api-client.js
 *
 * Covers createApi factory + B2B wrapper. fetch is mocked globally so
 * tests are network-free. AbortController behavior is exercised via
 * the timeoutMs path.
 */

import { createApi, createB2BApi, wpRestUrl } from "../../liff-src/shared/api-client.js";

describe("wpRestUrl", () => {
    test("strips leading slash from namespace", () => {
        // jsdom default origin is http://localhost
        expect(wpRestUrl("/b2b/v1")).toBe("http://localhost/wp-json/b2b/v1");
        expect(wpRestUrl("b2b/v1")).toBe("http://localhost/wp-json/b2b/v1");
    });
});

describe("createApi", () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    test("throws when base is missing", () => {
        expect(() => createApi({})).toThrow(/base/);
    });

    test("GET request: builds URL + sends token + nonce headers", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ data: [1, 2, 3] }),
        }));
        global.fetch = fetchMock;

        const api = createApi({
            base: "/wp-json/liff-ai/v1",
            token: "tok123",
            nonce: "nonce456",
        });

        const result = await api("GET", "/leads");

        expect(result).toEqual({ data: [1, 2, 3] });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/wp-json/liff-ai/v1/leads");
        expect(init.method).toBe("GET");
        expect(init.headers.Accept).toBe("application/json");
        expect(init.headers["X-LIFF-AI-Token"]).toBe("tok123");
        expect(init.headers["X-WP-Nonce"]).toBe("nonce456");
        expect(init.credentials).toBe("same-origin");
    });

    test("POST request: serializes JSON body + sets content-type", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ id: 99 }),
        }));
        global.fetch = fetchMock;

        const api = createApi({ base: "/wp-json/b2b/v1" });
        await api("POST", "/place-order", { items: [{ sku: "X", qty: 1 }] });

        const init = fetchMock.mock.calls[0][1];
        expect(init.method).toBe("POST");
        expect(init.headers["Content-Type"]).toBe("application/json");
        expect(JSON.parse(init.body)).toEqual({
            items: [{ sku: "X", qty: 1 }],
        });
    });

    test("FormData body: does NOT set Content-Type (browser handles boundary)", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => "{}",
        }));
        global.fetch = fetchMock;

        const fd = new FormData();
        fd.append("file", "x");

        const api = createApi({ base: "/x" });
        await api("POST", "/upload", fd);

        const init = fetchMock.mock.calls[0][1];
        expect(init.body).toBe(fd);
        expect(init.headers["Content-Type"]).toBeUndefined();
    });

    test("non-2xx throws Error with status + body attached", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: false,
            status: 403,
            text: async () =>
                JSON.stringify({ code: "rest_forbidden", message: "Cookie check failed" }),
        }));
        global.fetch = fetchMock;

        const api = createApi({ base: "/x" });
        await expect(api("GET", "/secret")).rejects.toMatchObject({
            status: 403,
            message: "Cookie check failed",
            body: { code: "rest_forbidden", message: "Cookie check failed" },
        });
    });

    test("non-2xx without body falls back to HTTP <status>", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: false,
            status: 500,
            text: async () => "",
        }));
        global.fetch = fetchMock;

        const api = createApi({ base: "/x" });
        await expect(api("GET", "/boom")).rejects.toMatchObject({
            status: 500,
            message: "HTTP 500",
        });
    });

    test("non-JSON response is wrapped as { raw }", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => "<html>oops</html>",
        }));
        global.fetch = fetchMock;

        const api = createApi({ base: "/x" });
        const result = await api("GET", "/anything");
        expect(result).toEqual({ raw: "<html>oops</html>" });
    });

    test("empty response body returns null", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 204,
            text: async () => "",
        }));
        global.fetch = fetchMock;

        const api = createApi({ base: "/x" });
        const result = await api("DELETE", "/thing/1");
        expect(result).toBeNull();
    });

    test("custom tokenHeader is honored", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => "{}",
        }));
        global.fetch = fetchMock;

        const api = createApi({
            base: "/x",
            token: "abc",
            tokenHeader: "X-B2F-Token",
        });
        await api("GET", "/y");

        const init = fetchMock.mock.calls[0][1];
        expect(init.headers["X-B2F-Token"]).toBe("abc");
        expect(init.headers["X-LIFF-AI-Token"]).toBeUndefined();
    });

    test("base URL trailing slash is normalized", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => "{}",
        }));
        global.fetch = fetchMock;

        const api = createApi({ base: "/wp-json/b2b/v1/" });
        await api("GET", "/catalog");

        expect(fetchMock.mock.calls[0][0]).toBe("/wp-json/b2b/v1/catalog");
    });

    test("extraHeaders merge with defaults", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => "{}",
        }));
        global.fetch = fetchMock;

        const api = createApi({ base: "/x" });
        await api("GET", "/y", null, { "X-Custom": "1" });

        const init = fetchMock.mock.calls[0][1];
        expect(init.headers["X-Custom"]).toBe("1");
        expect(init.headers.Accept).toBe("application/json");
    });
});

describe("createB2BApi", () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    test("getCatalog hits /catalog with X-B2B-Session header", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ items: [] }),
        }));
        global.fetch = fetchMock;

        const api = createB2BApi({
            base: "/wp-json/b2b/v1",
            sessionToken: "sess-99",
        });
        await api.getCatalog();

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/wp-json/b2b/v1/catalog");
        expect(init.method).toBe("GET");
        expect(init.headers["X-B2B-Session"]).toBe("sess-99");
    });

    test("getHistory builds query string against /order-history", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => "{}",
        }));
        global.fetch = fetchMock;

        const api = createB2BApi({ base: "/wp-json/b2b/v1" });
        await api.getHistory({ status: "paid", per_page: 20 });

        expect(fetchMock.mock.calls[0][0]).toBe(
            "/wp-json/b2b/v1/order-history?status=paid&per_page=20"
        );
    });

    test("getHistory without params omits ? — hits /order-history", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => "{}",
        }));
        global.fetch = fetchMock;

        const api = createB2BApi({ base: "/wp-json/b2b/v1" });
        await api.getHistory();

        expect(fetchMock.mock.calls[0][0]).toBe(
            "/wp-json/b2b/v1/order-history"
        );
    });

    test("placeOrder POSTs payload", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ order_id: 12345 }),
        }));
        global.fetch = fetchMock;

        const api = createB2BApi({ base: "/wp-json/b2b/v1" });
        const payload = { items: [{ sku: "X", qty: 2 }], note: "test" };
        const result = await api.placeOrder(payload);

        expect(result).toEqual({ order_id: 12345 });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/wp-json/b2b/v1/place-order");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body)).toEqual(payload);
    });

    test("cancelRequest sends order_id + reason in body (no path param)", async () => {
        // Production [B2B] Snippet 3 V.41.3 registers /cancel-request
        // (no {id} path param) and reads order_id from request body.
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => "{}",
        }));
        global.fetch = fetchMock;

        const api = createB2BApi({ base: "/wp-json/b2b/v1" });
        await api.cancelRequest(12345, "ลูกค้าขอยกเลิก");

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/wp-json/b2b/v1/cancel-request");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body)).toEqual({
            order_id: 12345,
            reason: "ลูกค้าขอยกเลิก",
        });
    });

    test("getTicket sends ticket_id as query param to /order-detail", async () => {
        // Production [B2B] Snippet 3 line 103 routes /order-detail and
        // reads ticket_id via $request->get_param('ticket_id') (query
        // string), not as a path param. Verified against b2b_rest_order_detail.
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ id: 1 }),
        }));
        global.fetch = fetchMock;

        const api = createB2BApi({ base: "/wp-json/b2b/v1" });
        await api.getTicket(12345);

        expect(fetchMock.mock.calls[0][0]).toBe(
            "/wp-json/b2b/v1/order-detail?ticket_id=12345"
        );
    });
});
