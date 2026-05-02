/**
 * Round 3 Jest tests for liff-src/b2f/catalog/api.js (V.0.4).
 *
 * Covers:
 *   - createB2FCatalogApi: getMakers, getMakerProducts (+include_virtual),
 *     getCatalogMap, createPO (+idempotency-key), getPOHistory
 *   - X-B2F-Token header attached
 *   - X-Idempotency-Key auto-attach on POST /create-po
 *   - Error mapping: 401 → onAuthExpired, 410 → onCancelledPO,
 *     429 → onRateLimit, 409 (idempotency_conflict / DUPLICATE_PO) → onConflict
 *   - _newIdempotencyKeyForTests fallback path
 */

import {
    createB2FCatalogApi,
    _newIdempotencyKeyForTests,
} from "../../liff-src/b2f/catalog/api.js";

/**
 * @param {{ status?: number, body?: any, headers?: Record<string,string> }} resp
 */
function mockFetchOnce(resp) {
    const status = resp.status != null ? resp.status : 200;
    const body = resp.body != null ? resp.body : {};
    const headers = new Map(Object.entries(resp.headers || { "content-type": "application/json" }));
    /** @type {jest.Mock} */
    const fn = jest.fn().mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? "OK" : "Error",
        headers: { get: (k) => headers.get(String(k).toLowerCase()) || null },
        json: async () => body,
        text: async () => JSON.stringify(body),
    });
    /** @type {any} */ (global).fetch = fn;
    return fn;
}

afterEach(() => {
    /** @type {any} */ (global).fetch = undefined;
});

describe("createB2FCatalogApi — endpoints", () => {
    test("getMakers calls GET /makers with X-B2F-Token", async () => {
        const fetchMock = mockFetchOnce({ body: { data: [{ id: 1, name: "Maker A" }] } });
        const api = createB2FCatalogApi({
            base: "https://example.com/wp-json/b2f/v1",
            token: "TOK123",
        });
        const res = await api.getMakers();
        expect(res.data).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toMatch(/\/makers$/);
        expect(init.method).toBe("GET");
        expect(init.headers["X-B2F-Token"]).toBe("TOK123");
    });

    test("getMakerProducts encodes maker id + appends include_virtual", async () => {
        const fetchMock = mockFetchOnce({ body: { data: [] } });
        const api = createB2FCatalogApi({ base: "https://x/b2f/v1", token: "T" });
        await api.getMakerProducts(42, { includeVirtual: true });
        const [url] = fetchMock.mock.calls[0];
        expect(url).toMatch(/\/maker-products\/42\?include_virtual=1$/);
    });

    test("getMakerProducts without virtual omits query param", async () => {
        const fetchMock = mockFetchOnce({ body: { data: [] } });
        const api = createB2FCatalogApi({ base: "https://x/b2f/v1", token: "T" });
        await api.getMakerProducts(7);
        const [url] = fetchMock.mock.calls[0];
        expect(url).toMatch(/\/maker-products\/7$/);
    });

    test("getCatalogMap reuses /maker-products + extracts catalog_map", async () => {
        const fetchMock = mockFetchOnce({
            body: { data: [], catalog_map: { L: { name: "Left" } } },
        });
        const api = createB2FCatalogApi({ base: "https://x/b2f/v1", token: "T" });
        const cm = await api.getCatalogMap("99");
        expect(fetchMock.mock.calls[0][0]).toMatch(/\/maker-products\/99$/);
        expect(cm.L.name).toBe("Left");
    });

    test("createPO POSTs /create-po with X-Idempotency-Key", async () => {
        const fetchMock = mockFetchOnce({
            body: { success: true, po_number: "PO-2026-001", po_id: 123 },
        });
        const api = createB2FCatalogApi({ base: "https://x/b2f/v1", token: "T" });
        const res = await api.createPO({ maker_id: 1, items: [{ sku: "A", qty: 2 }] });
        expect(res.success).toBe(true);
        const [, init] = fetchMock.mock.calls[0];
        expect(init.method).toBe("POST");
        expect(init.headers["X-Idempotency-Key"]).toMatch(/.+/);
        expect(init.headers["X-B2F-Token"]).toBe("T");
        expect(init.headers["Content-Type"]).toMatch(/json/i);
    });

    test("getPOHistory serializes maker_id + params to query string", async () => {
        const fetchMock = mockFetchOnce({ body: { data: [] } });
        const api = createB2FCatalogApi({ base: "https://x/b2f/v1", token: "T" });
        await api.getPOHistory(5, { limit: "10", status: "received" });
        const [url] = fetchMock.mock.calls[0];
        expect(url).toMatch(/\/po-history\?/);
        expect(url).toMatch(/maker_id=5/);
        expect(url).toMatch(/limit=10/);
        expect(url).toMatch(/status=received/);
    });
});

describe("createB2FCatalogApi — error mapping", () => {
    test("401 fires onAuthExpired callback", async () => {
        mockFetchOnce({ status: 401, body: { code: "rest_forbidden" } });
        const onAuthExpired = jest.fn();
        const api = createB2FCatalogApi({ base: "https://x/b2f/v1", token: "T", onAuthExpired });
        await expect(api.getMakers()).rejects.toThrow();
        expect(onAuthExpired).toHaveBeenCalled();
    });

    test("410 fires onCancelledPO callback", async () => {
        mockFetchOnce({ status: 410, body: { code: "po_cancelled" } });
        const onCancelledPO = jest.fn();
        const api = createB2FCatalogApi({ base: "https://x/b2f/v1", token: "T", onCancelledPO });
        await expect(api.createPO({ maker_id: 1, items: [] })).rejects.toThrow();
        expect(onCancelledPO).toHaveBeenCalled();
    });

    test("429 fires onRateLimit callback", async () => {
        mockFetchOnce({ status: 429, body: { code: "rate_limited" } });
        const onRateLimit = jest.fn();
        const api = createB2FCatalogApi({ base: "https://x/b2f/v1", token: "T", onRateLimit });
        await expect(api.getMakers()).rejects.toThrow();
        expect(onRateLimit).toHaveBeenCalled();
    });

    test("409 idempotency_conflict surfaces Thai message + onConflict", async () => {
        mockFetchOnce({ status: 409, body: { code: "idempotency_conflict", message: "dup" } });
        const onConflict = jest.fn();
        const api = createB2FCatalogApi({ base: "https://x/b2f/v1", token: "T", onConflict });
        await expect(api.createPO({})).rejects.toThrow(/คำสั่งซ้ำ/);
        expect(onConflict).toHaveBeenCalled();
    });

    test("409 DUPLICATE_PO surfaces dedicated message", async () => {
        mockFetchOnce({ status: 409, body: { code: "DUPLICATE_PO" } });
        const onConflict = jest.fn();
        const api = createB2FCatalogApi({ base: "https://x/b2f/v1", token: "T", onConflict });
        await expect(api.createPO({})).rejects.toThrow(/PO ซ้ำ/);
        expect(onConflict).toHaveBeenCalled();
    });
});

describe("idempotency key generator", () => {
    test("returns non-empty string", () => {
        const k = _newIdempotencyKeyForTests();
        expect(typeof k).toBe("string");
        expect(k.length).toBeGreaterThan(0);
    });

    test("two consecutive keys differ", () => {
        const a = _newIdempotencyKeyForTests();
        const b = _newIdempotencyKeyForTests();
        expect(a).not.toBe(b);
    });

    test("falls back when crypto.randomUUID unavailable", () => {
        const orig = global.crypto;
        // @ts-ignore — wipe randomUUID for fallback path
        global.crypto = { ...orig, randomUUID: undefined };
        const k = _newIdempotencyKeyForTests();
        expect(k).toMatch(/[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/);
        global.crypto = orig;
    });
});
