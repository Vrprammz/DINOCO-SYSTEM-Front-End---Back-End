/**
 * Phase 6 Jest tests for liff-src/shared/modal.js
 *
 * The modal module is a thin bridge: it picks `window.dinocoModal` if
 * present, else falls back to native confirm/alert. Since `modal` is
 * resolved at module-import time, we use jest.isolateModules to test
 * both branches.
 */

describe("modal bridge — fallback path (no window.dinocoModal)", () => {
    let originalDinocoModal;

    beforeEach(() => {
        originalDinocoModal = window.dinocoModal;
        delete window.dinocoModal;
    });

    afterEach(() => {
        if (originalDinocoModal) {
            window.dinocoModal = originalDinocoModal;
        }
        jest.restoreAllMocks();
        jest.resetModules();
    });

    test("alert fallback delegates to window.alert", () => {
        const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
        jest.isolateModules(() => {
            const { modal } = require("../../liff-src/shared/modal.js");
            modal.alert({ title: "Hi", message: "World" });
        });
        expect(alertSpy).toHaveBeenCalledWith("Hi\n\nWorld");
    });

    test("alert with no args uses defaults", () => {
        const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
        jest.isolateModules(() => {
            const { modal } = require("../../liff-src/shared/modal.js");
            modal.alert();
        });
        expect(alertSpy).toHaveBeenCalledWith("Alert\n\n");
    });

    test("confirm fallback OK path triggers onConfirm", () => {
        jest.spyOn(window, "confirm").mockReturnValue(true);
        const onConfirm = jest.fn();
        const onCancel = jest.fn();
        jest.isolateModules(() => {
            const { modal } = require("../../liff-src/shared/modal.js");
            modal.confirm({
                title: "Delete?",
                message: "Cannot undo",
                onConfirm,
                onCancel,
            });
        });
        expect(onConfirm).toHaveBeenCalled();
        expect(onCancel).not.toHaveBeenCalled();
    });

    test("confirm fallback Cancel path triggers onCancel", () => {
        jest.spyOn(window, "confirm").mockReturnValue(false);
        const onConfirm = jest.fn();
        const onCancel = jest.fn();
        jest.isolateModules(() => {
            const { modal } = require("../../liff-src/shared/modal.js");
            modal.confirm({ onConfirm, onCancel });
        });
        expect(onConfirm).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalled();
    });

    test("confirm without callbacks is a no-op (no throw)", () => {
        jest.spyOn(window, "confirm").mockReturnValue(true);
        jest.isolateModules(() => {
            const { modal } = require("../../liff-src/shared/modal.js");
            expect(() => modal.confirm({ message: "Y/N" })).not.toThrow();
        });
    });

    test("toast fallback logs to console", () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
        jest.isolateModules(() => {
            const { modal } = require("../../liff-src/shared/modal.js");
            modal.toast({ message: "hello", type: "success" });
        });
        expect(logSpy).toHaveBeenCalledWith("[toast:success]", "hello");
    });
});

describe("modal bridge — production path (window.dinocoModal present)", () => {
    let originalDinocoModal;

    beforeEach(() => {
        originalDinocoModal = window.dinocoModal;
    });

    afterEach(() => {
        window.dinocoModal = originalDinocoModal;
        jest.resetModules();
    });

    test("uses window.dinocoModal directly (no fallback)", () => {
        const fakeModal = {
            alert: jest.fn(),
            confirm: jest.fn(),
            toast: jest.fn(),
            prompt: jest.fn(),
        };
        window.dinocoModal = fakeModal;

        jest.isolateModules(() => {
            const { modal } = require("../../liff-src/shared/modal.js");
            // Identity check: the exported `modal` should be the same
            // object as window.dinocoModal (NOT the fallback shim).
            expect(modal).toBe(fakeModal);

            modal.alert({ title: "X", message: "Y" });
            expect(fakeModal.alert).toHaveBeenCalledWith({ title: "X", message: "Y" });
        });
    });

    test("default export matches named export", () => {
        const fakeModal = { alert: jest.fn() };
        window.dinocoModal = fakeModal;

        jest.isolateModules(() => {
            const mod = require("../../liff-src/shared/modal.js");
            expect(mod.default).toBe(mod.modal);
            expect(mod.default).toBe(fakeModal);
        });
    });
});
