/**
 * Phase 6 Jest tests for liff-src/liff-ai/frontend/api.js (V.0.4 Round 3).
 *
 * Covers createLiffAiApi() — LIFF AI scoped REST client wrapper:
 *   - X-LIFF-AI-Token header attached when token present.
 *   - X-Idempotency-Key auto-attached on mutating endpoints
 *     (lead/{id}/accept, lead/{id}/note, lead/{id}/status,
 *      claim/{id}/status, agent-ask).
 *   - GET serializes body as query string.
 *   - 401 → onAuthExpired callback fires.
 *   - 409 → onConflict callback fires + decorates code.
 *   - 5xx → single retry.
 *   - Named methods hit correct endpoints.
 *
 * Production anchor: `[LIFF AI] Snippet 2: Frontend` V.3.10
 *   - lines 595-606: inline api(method, path, body) helper.
 */

import { createLiffAiApi } from "../../liff-src/liff-ai/frontend/api.js";

/** @param {{status?:number, body?:object}} cfg */
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

describe("createLiffAiApi — header injection", () => {
    test("attaches X-LIFF-AI-Token on every request", async () => {
        global.fetch = mockFetch();
        const api = createLiffAiApi({ base: "http://x/wp-json/liff-ai/v1", token: "jwt-1" });
        await api.getDashboard();
        const init = global.fetch.mock.calls[0][1];
        expect(init.headers["X-LIFF-AI-Token"]).toBe("jwt-1");
    });

    test("does not attach X-LIFF-AI-Token when token absent", async () => {
        global.fetch = mockFetch();
        const api = createLiffAiApi({ base: "http://x/wp-json/liff-ai/v1" });
        await api.getDashboard();
        const init = global.fetch.mock.calls[0][1];
        expect(init.headers["X-LIFF-AI-Token"]).toBeUndefined();
    });
});

describe("createLiffAiApi — idempotency-key auto-attach", () => {
    let api;
    beforeEach(() => {
        api = createLiffAiApi({ base: "http://x/wp-json/liff-ai/v1", token: "jwt" });
    });

    test("acceptLead emits X-Idempotency-Key", async () => {
        global.fetch = mockFetch();
        await api.acceptLead("L42");
        const init = global.fetch.mock.calls[0][1];
        expect(init.headers["X-Idempotency-Key"]).toBeDefined();
        expect(init.headers["X-Idempotency-Key"].length).toBeGreaterThan(8);
    });

    test("addNote / updateLeadStatus / updateClaimStatus / askAgent all emit key", async () => {
        const calls = [
            () => api.addNote("L42", "hello"),
            () => api.updateLeadStatus("L42", "qualified"),
            () => api.updateClaimStatus("C42", "approved"),
            () => api.askAgent("test question"),
        ];
        for (const fn of calls) {
            global.fetch = mockFetch();
            await fn();
            const init = global.fetch.mock.calls[0][1];
            expect(init.headers["X-Idempotency-Key"]).toBeDefined();
        }
    });

    test("does NOT attach key on GET endpoints (getDashboard / getLeads)", async () => {
        for (const fn of [() => api.getDashboard(), () => api.getLeads()]) {
            global.fetch = mockFetch();
            await fn();
            const init = global.fetch.mock.calls[0][1];
            expect(init.headers["X-Idempotency-Key"]).toBeUndefined();
        }
    });

    test("idempotency keys are unique across calls", async () => {
        global.fetch = mockFetch();
        await api.acceptLead("L1");
        const k1 = global.fetch.mock.calls[0][1].headers["X-Idempotency-Key"];
        global.fetch = mockFetch();
        await api.acceptLead("L1");
        const k2 = global.fetch.mock.calls[0][1].headers["X-Idempotency-Key"];
        expect(k1).not.toBe(k2);
    });
});

describe("createLiffAiApi — GET serialization", () => {
    test("getLeads serializes filter object as query string", async () => {
        global.fetch = mockFetch();
        const api = createLiffAiApi({ base: "http://x/wp-json/liff-ai/v1", token: "jwt" });
        await api.getLeads({ status: "qualified", limit: 10 });
        const url = global.fetch.mock.calls[0][0];
        expect(url).toContain("status=qualified");
        expect(url).toContain("limit=10");
    });

    test("getClaims with no filter does not append query string", async () => {
        global.fetch = mockFetch();
        const api = createLiffAiApi({ base: "http://x/wp-json/liff-ai/v1" });
        await api.getClaims();
        const url = global.fetch.mock.calls[0][0];
        expect(url).not.toContain("?");
    });
});

describe("createLiffAiApi — error mapping", () => {
    test("401 fires onAuthExpired", async () => {
        global.fetch = mockFetch({ status: 401, body: { code: "rest_forbidden" } });
        const onAuthExpired = jest.fn();
        const api = createLiffAiApi({
            base: "http://x/wp-json/liff-ai/v1",
            token: "expired",
            onAuthExpired,
            retryOn5xx: false,
        });
        await expect(api.getDashboard()).rejects.toThrow();
        expect(onAuthExpired).toHaveBeenCalled();
    });

    test("409 fires onConflict + decorates code", async () => {
        global.fetch = mockFetch({
            status: 409,
            body: { code: "idempotency_conflict", message: "dup" },
        });
        const onConflict = jest.fn();
        const api = createLiffAiApi({
            base: "http://x/wp-json/liff-ai/v1",
            token: "jwt",
            onConflict,
            retryOn5xx: false,
        });
        try {
            await api.acceptLead("L1");
            throw new Error("expected throw");
        } catch (err) {
            expect(err.code).toBe("idempotency_conflict");
        }
        expect(onConflict).toHaveBeenCalled();
    });

    test("5xx triggers single retry", async () => {
        let calls = 0;
        global.fetch = jest.fn().mockImplementation(() => {
            calls++;
            if (calls === 1) {
                return Promise.resolve({
                    ok: false,
                    status: 503,
                    text: () => Promise.resolve('{"message":"server"}'),
                });
            }
            return Promise.resolve({
                ok: true,
                status: 200,
                text: () => Promise.resolve('{"success":true}'),
            });
        });
        const api = createLiffAiApi({
            base: "http://x/wp-json/liff-ai/v1",
            token: "jwt",
        });
        const r = await api.getDashboard();
        expect(r).toEqual({ success: true });
        expect(calls).toBe(2);
    });

    test("5xx retry can be disabled", async () => {
        global.fetch = mockFetch({ status: 502, body: { message: "bad gateway" } });
        const api = createLiffAiApi({
            base: "http://x/wp-json/liff-ai/v1",
            token: "jwt",
            retryOn5xx: false,
        });
        await expect(api.getDashboard()).rejects.toThrow();
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});

describe("createLiffAiApi — named methods", () => {
    let api;
    beforeEach(() => {
        api = createLiffAiApi({ base: "http://x/wp-json/liff-ai/v1", token: "jwt" });
    });

    test("auth POST /auth", async () => {
        global.fetch = mockFetch();
        await api.auth({ line_user_id: "U1", id_token: "tok" });
        const url = global.fetch.mock.calls[0][0];
        expect(url).toBe("http://x/wp-json/liff-ai/v1/auth");
    });

    test("getDashboard GET /dashboard", async () => {
        global.fetch = mockFetch();
        await api.getDashboard();
        const url = global.fetch.mock.calls[0][0];
        expect(url).toBe("http://x/wp-json/liff-ai/v1/dashboard");
    });

    test("getLeadDetail encodes id", async () => {
        global.fetch = mockFetch();
        await api.getLeadDetail("L 42/path");
        const url = global.fetch.mock.calls[0][0];
        expect(url).toContain("/lead/");
        expect(url).toContain("L%20");
    });

    test("acceptLead POST /lead/{id}/accept", async () => {
        global.fetch = mockFetch();
        await api.acceptLead("L42");
        const url = global.fetch.mock.calls[0][0];
        const init = global.fetch.mock.calls[0][1];
        expect(url).toBe("http://x/wp-json/liff-ai/v1/lead/L42/accept");
        expect(init.method).toBe("POST");
    });

    test("addNote sends note in body", async () => {
        global.fetch = mockFetch();
        await api.addNote("L42", "hello world");
        const init = global.fetch.mock.calls[0][1];
        expect(JSON.parse(init.body)).toEqual({ note: "hello world" });
    });

    test("updateLeadStatus sends status in body", async () => {
        global.fetch = mockFetch();
        await api.updateLeadStatus("L42", "qualified");
        const init = global.fetch.mock.calls[0][1];
        expect(JSON.parse(init.body)).toEqual({ status: "qualified" });
    });

    test("updateClaimStatus POST /claim/{id}/status", async () => {
        global.fetch = mockFetch();
        await api.updateClaimStatus("C99", "approved");
        const url = global.fetch.mock.calls[0][0];
        expect(url).toBe("http://x/wp-json/liff-ai/v1/claim/C99/status");
    });

    test("askAgent POST /agent-ask with question body", async () => {
        global.fetch = mockFetch();
        await api.askAgent("hello?");
        const url = global.fetch.mock.calls[0][0];
        const init = global.fetch.mock.calls[0][1];
        expect(url).toBe("http://x/wp-json/liff-ai/v1/agent-ask");
        expect(JSON.parse(init.body)).toEqual({ question: "hello?" });
    });
});
