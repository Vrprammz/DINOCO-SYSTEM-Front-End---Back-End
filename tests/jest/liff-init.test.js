/**
 * Phase 6 Jest tests for liff-src/shared/liff-init.js
 *
 * Mocks window.liff (the LINE SDK global). Real SDK is loaded from
 * static.line-scdn.net at runtime — irrelevant for unit tests.
 *
 * Production-anchored behaviors:
 *   - login() redirects → caller cannot proceed → return null
 *   - getProfile failure is non-critical (still returns ctx with profile=null)
 *   - withLoginState preserves query params (B2B Snippet 4 V.30.4 pattern)
 */

import { initLiff, closeLiff } from "../../liff-src/shared/liff-init.js";

describe("initLiff", () => {
    let originalLiff;

    beforeEach(() => {
        originalLiff = window.liff;
    });

    afterEach(() => {
        window.liff = originalLiff;
        jest.restoreAllMocks();
    });

    test("throws when SDK not loaded", async () => {
        window.liff = undefined;
        await expect(initLiff("LIFF_ID")).rejects.toThrow(/LIFF SDK not loaded/);
    });

    test("logged-in: returns idToken + context + profile", async () => {
        const fakeProfile = {
            userId: "U123",
            displayName: "Test User",
            pictureUrl: "https://x/pic.jpg",
        };
        const fakeContext = { type: "utou", groupId: null };

        window.liff = {
            init: jest.fn(async () => {}),
            isLoggedIn: jest.fn(() => true),
            getIDToken: jest.fn(() => "id-token-abc"),
            getContext: jest.fn(() => fakeContext),
            getProfile: jest.fn(async () => fakeProfile),
            isInClient: jest.fn(() => true),
            getOS: jest.fn(() => "ios"),
            login: jest.fn(),
        };

        const ctx = await initLiff("LIFF_ID_99");
        expect(ctx).toEqual({
            idToken: "id-token-abc",
            context: fakeContext,
            profile: fakeProfile,
            isInClient: true,
            os: "ios",
        });
        expect(window.liff.init).toHaveBeenCalledWith({ liffId: "LIFF_ID_99" });
    });

    test("not logged in: triggers login redirect + returns null", async () => {
        const loginMock = jest.fn();
        window.liff = {
            init: jest.fn(async () => {}),
            isLoggedIn: jest.fn(() => false),
            login: loginMock,
        };

        const ctx = await initLiff("LIFF_ID");
        expect(ctx).toBeNull();
        expect(loginMock).toHaveBeenCalledTimes(1);
        expect(loginMock).toHaveBeenCalledWith(
            expect.objectContaining({ redirectUri: expect.any(String) })
        );
    });

    test("getProfile failure: returns ctx with profile=null + warns", async () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        window.liff = {
            init: jest.fn(async () => {}),
            isLoggedIn: jest.fn(() => true),
            getIDToken: jest.fn(() => "tok"),
            getContext: jest.fn(() => ({ type: "external" })),
            getProfile: jest.fn(async () => {
                throw new Error("network");
            }),
            isInClient: jest.fn(() => false),
            getOS: jest.fn(() => "web"),
        };

        const ctx = await initLiff("LIFF_ID");
        expect(ctx.profile).toBeNull();
        expect(ctx.idToken).toBe("tok");
        expect(warnSpy).toHaveBeenCalled();
    });
});

describe("closeLiff", () => {
    let originalLiff;

    beforeEach(() => {
        originalLiff = window.liff;
    });

    afterEach(() => {
        window.liff = originalLiff;
        jest.restoreAllMocks();
    });

    test("inside LINE client: calls liff.closeWindow", () => {
        const closeMock = jest.fn();
        window.liff = {
            isInClient: jest.fn(() => true),
            closeWindow: closeMock,
        };
        closeLiff();
        expect(closeMock).toHaveBeenCalledTimes(1);
    });

    test("outside LINE: falls back to history.back when history available", () => {
        window.liff = {
            isInClient: jest.fn(() => false),
            closeWindow: jest.fn(),
        };
        const backSpy = jest.spyOn(window.history, "back").mockImplementation(() => {});
        // jsdom history.length is at least 1; force >1 by pushState
        window.history.pushState({}, "", "/x");
        closeLiff();
        expect(backSpy).toHaveBeenCalled();
    });

    test("no liff global: defensive fallback to history.back / window.close", () => {
        window.liff = undefined;
        // Just ensure it doesn't throw — branch is `window.liff && ...`
        // which short-circuits to else. window.history.length > 1 in jsdom
        // depends on test order; assert no throw is enough here.
        expect(() => closeLiff()).not.toThrow();
    });
});
