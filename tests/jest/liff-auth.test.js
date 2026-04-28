/**
 * Phase 6 Jest tests for liff-src/shared/liff-auth.js
 *
 * Mocks `./liff-init.js` (so we don't need a real LIFF SDK) + global
 * fetch. Validates the backend auth handshake contract:
 *   - id_token + line_user_id + display_name + picture_url in body
 *   - group_id + context_type added when withContext=true (default)
 *   - Auth failures throw Error with status + body attached
 *   - LIFF redirect path returns null (caller halts)
 */

jest.mock("../../liff-src/shared/liff-init.js", () => ({
    initLiff: jest.fn(),
}));

import { liffAuth } from "../../liff-src/shared/liff-auth.js";
import { initLiff } from "../../liff-src/shared/liff-init.js";

describe("liffAuth", () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        initLiff.mockReset();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    test("throws when liffId missing", async () => {
        await expect(
            liffAuth({ authEndpoint: "/x" })
        ).rejects.toThrow(/liffId/);
    });

    test("throws when authEndpoint missing", async () => {
        await expect(
            liffAuth({ liffId: "L1" })
        ).rejects.toThrow(/authEndpoint/);
    });

    test("returns null when LIFF redirected to login", async () => {
        initLiff.mockResolvedValue(null);
        const result = await liffAuth({
            liffId: "L1",
            authEndpoint: "/auth",
        });
        expect(result).toBeNull();
    });

    test("posts full payload with profile + context", async () => {
        initLiff.mockResolvedValue({
            idToken: "tok-99",
            profile: {
                userId: "U123",
                displayName: "Test",
                pictureUrl: "https://x/pic.jpg",
            },
            context: { type: "group", groupId: "Gabc" },
        });

        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({ authorized: true, token: "session-xyz" }),
        }));
        global.fetch = fetchMock;

        const result = await liffAuth({
            liffId: "L1",
            authEndpoint: "/wp-json/b2b/v1/auth",
            extra: { distributor_id: 42 },
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/wp-json/b2b/v1/auth");
        expect(init.method).toBe("POST");
        expect(init.headers["Content-Type"]).toBe("application/json");

        const body = JSON.parse(init.body);
        expect(body).toEqual({
            id_token: "tok-99",
            line_user_id: "U123",
            display_name: "Test",
            picture_url: "https://x/pic.jpg",
            distributor_id: 42,
            group_id: "Gabc",
            context_type: "group",
        });

        expect(result.authorized).toBe(true);
        expect(result.token).toBe("session-xyz");
        expect(result._liffContext).toBeDefined();
    });

    test("withContext=false omits group_id + context_type", async () => {
        initLiff.mockResolvedValue({
            idToken: "tok",
            profile: { userId: "U1", displayName: "X", pictureUrl: "" },
            context: { type: "utou", groupId: null },
        });

        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({}),
        }));
        global.fetch = fetchMock;

        await liffAuth({
            liffId: "L1",
            authEndpoint: "/auth",
            withContext: false,
        });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.group_id).toBeUndefined();
        expect(body.context_type).toBeUndefined();
        expect(body.id_token).toBe("tok");
    });

    test("missing profile fields fall back to empty strings", async () => {
        initLiff.mockResolvedValue({
            idToken: "tok",
            profile: null, // getProfile failed
            context: { type: "external" },
        });

        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({}),
        }));
        global.fetch = fetchMock;

        await liffAuth({ liffId: "L1", authEndpoint: "/auth" });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.line_user_id).toBe("");
        expect(body.display_name).toBe("");
        expect(body.picture_url).toBe("");
    });

    test("auth failure throws Error with status + body", async () => {
        initLiff.mockResolvedValue({
            idToken: "tok",
            profile: { userId: "U1", displayName: "X", pictureUrl: "" },
            context: { type: "utou" },
        });

        const fetchMock = jest.fn(async () => ({
            ok: false,
            status: 401,
            json: async () => ({
                code: "invalid_id_token",
                message: "ID Token verification failed",
            }),
        }));
        global.fetch = fetchMock;

        await expect(
            liffAuth({ liffId: "L1", authEndpoint: "/auth" })
        ).rejects.toMatchObject({
            status: 401,
            message: "ID Token verification failed",
            body: { code: "invalid_id_token", message: "ID Token verification failed" },
        });
    });

    test("auth failure with non-JSON response uses HTTP fallback message", async () => {
        initLiff.mockResolvedValue({
            idToken: "tok",
            profile: { userId: "U1", displayName: "X", pictureUrl: "" },
            context: { type: "utou" },
        });

        const fetchMock = jest.fn(async () => ({
            ok: false,
            status: 502,
            json: async () => {
                throw new Error("Invalid JSON");
            },
        }));
        global.fetch = fetchMock;

        await expect(
            liffAuth({ liffId: "L1", authEndpoint: "/auth" })
        ).rejects.toMatchObject({
            status: 502,
            message: "Auth failed (HTTP 502)",
        });
    });

    test("attaches _liffContext for caller convenience", async () => {
        const fakeCtx = {
            idToken: "tok",
            profile: { userId: "U1", displayName: "X", pictureUrl: "" },
            context: { type: "utou" },
            isInClient: true,
            os: "ios",
        };
        initLiff.mockResolvedValue(fakeCtx);

        global.fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({ authorized: true }),
        }));

        const result = await liffAuth({
            liffId: "L1",
            authEndpoint: "/auth",
        });
        expect(result._liffContext).toBe(fakeCtx);
    });
});
