/**
 * Phase 6 Jest tests for liff-src/b2f/maker/loaders/* (V.0.4 Round 3).
 *
 * Covers 5 page loaders that orchestrate api → render pipeline:
 *   - confirm.js     setupConfirm + loadConfirmPage + handleConfirmSubmit + handleRejectSubmit
 *   - detail.js      setupDetail + loadDetailPage
 *   - list.js        setupList + loadListPage
 *   - reschedule.js  setupReschedule + loadReschedulePage + handleRescheduleSubmit
 *   - deliver.js     setupDeliver + loadDeliverPage + b2fOpenDeliverForm + handleDeliverSubmit
 *
 * Test strategy:
 *   - Mount `#b2f-app` div in jsdom.
 *   - Pass mock api with jest.fn() methods returning fixture POs.
 *   - Verify api method called + #b2f-app HTML populated by render.
 *   - Verify cancelled / already-confirmed POs branch to showError instead
 *     of renderConfirmPage.
 *   - Verify ETA validation rejects past dates.
 *
 * Production anchor: `[B2F] Snippet 4: Maker LIFF Pages` V.4.7
 *   - lines 670-855 (confirm) + 862-876 (detail) + 1013-1132 (reschedule)
 *   - lines 1140-1152 (list) + 1233-1546 (deliver form)
 */

import {
    setupConfirm,
    loadConfirmPage,
    handleConfirmSubmit,
    handleRejectSubmit,
} from "../../liff-src/b2f/maker/loaders/confirm.js";
import {
    setupDetail,
    loadDetailPage,
} from "../../liff-src/b2f/maker/loaders/detail.js";
import {
    setupList,
    loadListPage,
} from "../../liff-src/b2f/maker/loaders/list.js";
import {
    setupReschedule,
    loadReschedulePage,
    handleRescheduleSubmit,
} from "../../liff-src/b2f/maker/loaders/reschedule.js";
import {
    setupDeliver,
    loadDeliverPage,
    b2fOpenDeliverForm,
    b2fStepQty,
    b2fFillAllRemaining,
    handleDeliverSubmit,
    _resetDeliverState,
} from "../../liff-src/b2f/maker/loaders/deliver.js";
import { setLang } from "../../liff-src/b2f/maker/utils/lang.js";
import { _resetLockForTests } from "../../liff-src/b2f/maker/utils/dom.js";

/**
 * Mount fresh `#b2f-app` (some renderers expect this).
 */
function mountApp() {
    document.body.innerHTML = '<div id="b2f-app"></div>';
}

/**
 * Tomorrow's YYYY-MM-DD (for ETA validation tests).
 */
function tomorrow() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
}

/**
 * Fixture: a typical confirmed-able PO (status=submitted).
 */
const PO_FIXTURE = {
    id: 100,
    ID: 100,
    po_status: "submitted",
    currency: "THB",
    maker_name: "Test Maker",
    po_total: 1000,
    items: [
        {
            poi_sku: "TEST001",
            poi_name: "Test Item",
            poi_qty_ordered: 5,
            poi_unit_price: 100,
        },
    ],
};

beforeEach(() => {
    setLang("th");
    mountApp();
    // dom.js holds a module-level LOCKED singleton (lockBtn/unlockBtn).
    // Reset between tests so prior locks don't leak into the next case.
    _resetLockForTests();
});

describe("loaders/list — loadListPage", () => {
    test("calls api.getMakerPOList and renders #b2f-app", async () => {
        const api = {
            getMakerPOList: jest.fn().mockResolvedValue({
                data: [{ ...PO_FIXTURE, currency: "THB" }],
                maker_currency: "THB",
            }),
        };
        setupList({ api });
        await loadListPage();
        expect(api.getMakerPOList).toHaveBeenCalledTimes(1);
        const app = document.getElementById("b2f-app");
        expect(app).toBeTruthy();
        expect(app.innerHTML.length).toBeGreaterThan(0);
    });

    test("shows error when api throws", async () => {
        const api = {
            getMakerPOList: jest.fn().mockRejectedValue(
                Object.assign(new Error("Network down"), { status: 500 })
            ),
        };
        setupList({ api });
        await loadListPage();
        const app = document.getElementById("b2f-app");
        // showError renders into #b2f-app
        expect(app.innerHTML).toContain("ไม่สามารถโหลด");
    });

    test("setupList throws when api missing", () => {
        expect(() => setupList({})).toThrow(/api required/);
    });
});

describe("loaders/detail — loadDetailPage", () => {
    test("calls api.getPODetail with explicit po_id", async () => {
        const api = {
            getPODetail: jest.fn().mockResolvedValue({ data: PO_FIXTURE }),
        };
        const poDataRef = { current: null };
        setupDetail({ api, poDataRef });
        await loadDetailPage(100);
        expect(api.getPODetail).toHaveBeenCalledWith(100);
        expect(poDataRef.current).toBeTruthy();
    });

    test("falls back to ?po_id= URL when arg omitted", async () => {
        window.history.replaceState({}, "", "/test?po_id=999");
        const api = {
            getPODetail: jest.fn().mockResolvedValue({ data: PO_FIXTURE }),
        };
        setupDetail({ api });
        await loadDetailPage();
        expect(api.getPODetail).toHaveBeenCalled();
        // arg can be string or number — V.4.7 reads URL as string
        const arg = api.getPODetail.mock.calls[0][0];
        expect(String(arg)).toBe("999");
    });
});

describe("loaders/confirm — loadConfirmPage", () => {
    test("renders confirm form for submitted PO", async () => {
        const api = {
            getPODetail: jest.fn().mockResolvedValue({ data: PO_FIXTURE }),
            confirmPO: jest.fn(),
            rejectPO: jest.fn(),
        };
        setupConfirm({ api });
        await loadConfirmPage(100);
        const app = document.getElementById("b2f-app");
        expect(app.innerHTML).toBeTruthy();
        // confirm page renders the b2f-confirm-btn id
        expect(app.querySelector("#b2f-confirm-btn")).toBeTruthy();
    });

    test("shows 'cancelled' error for cancelled PO (no render)", async () => {
        const api = {
            getPODetail: jest.fn().mockResolvedValue({
                data: { ...PO_FIXTURE, po_status: "cancelled" },
            }),
            confirmPO: jest.fn(),
            rejectPO: jest.fn(),
        };
        setupConfirm({ api });
        await loadConfirmPage(100);
        const app = document.getElementById("b2f-app");
        expect(app.innerHTML).toContain("ยกเลิก");
        expect(app.querySelector("#b2f-confirm-btn")).toBeFalsy();
    });

    test("shows 'already confirmed' for confirmed/delivering POs", async () => {
        const api = {
            getPODetail: jest.fn().mockResolvedValue({
                data: { ...PO_FIXTURE, po_status: "confirmed" },
            }),
            confirmPO: jest.fn(),
            rejectPO: jest.fn(),
        };
        setupConfirm({ api });
        await loadConfirmPage(100);
        const app = document.getElementById("b2f-app");
        expect(app.innerHTML).toContain("ยืนยันไปแล้ว");
    });

    test("shows 'already rejected' for rejected POs", async () => {
        const api = {
            getPODetail: jest.fn().mockResolvedValue({
                data: { ...PO_FIXTURE, po_status: "rejected" },
            }),
            confirmPO: jest.fn(),
            rejectPO: jest.fn(),
        };
        setupConfirm({ api });
        await loadConfirmPage(100);
        const app = document.getElementById("b2f-app");
        expect(app.innerHTML).toContain("ปฏิเสธไปแล้ว");
    });

    test("setupConfirm throws when api missing", () => {
        expect(() => setupConfirm({})).toThrow(/api required/);
    });
});

describe("loaders/confirm — handleConfirmSubmit", () => {
    test("rejects empty ETA with toast", async () => {
        document.body.innerHTML =
            '<div id="b2f-app">' +
            '<input id="b2f-eta" value="" />' +
            '<textarea id="b2f-note"></textarea>' +
            '<button id="b2f-confirm-btn"></button>' +
            "</div>";
        const api = {
            getPODetail: jest.fn(),
            confirmPO: jest.fn(),
            rejectPO: jest.fn(),
        };
        setupConfirm({ api });
        await handleConfirmSubmit({ id: 100 });
        expect(api.confirmPO).not.toHaveBeenCalled();
    });

    test("rejects past ETA date", async () => {
        document.body.innerHTML =
            '<div id="b2f-app">' +
            '<input id="b2f-eta" value="2020-01-01" />' +
            '<textarea id="b2f-note"></textarea>' +
            '<button id="b2f-confirm-btn"></button>' +
            "</div>";
        const api = {
            getPODetail: jest.fn(),
            confirmPO: jest.fn(),
            rejectPO: jest.fn(),
        };
        setupConfirm({ api });
        await handleConfirmSubmit({ id: 100 });
        expect(api.confirmPO).not.toHaveBeenCalled();
    });

    test("calls api.confirmPO when ETA valid + button locks", async () => {
        document.body.innerHTML =
            '<div id="b2f-app">' +
            '<input id="b2f-eta" value="' +
            tomorrow() +
            '" />' +
            '<textarea id="b2f-note">noted</textarea>' +
            '<button id="b2f-confirm-btn"></button>' +
            "</div>";
        const api = {
            getPODetail: jest.fn(),
            confirmPO: jest.fn().mockResolvedValue({ success: true }),
            rejectPO: jest.fn(),
        };
        setupConfirm({ api, lineUid: "U-test" });
        await handleConfirmSubmit({ id: 100, ID: 100 });
        expect(api.confirmPO).toHaveBeenCalledTimes(1);
        const args = api.confirmPO.mock.calls[0];
        expect(args[0]).toBe(100);
        expect(args[1].expected_date).toBe(tomorrow());
        expect(args[1].maker_note).toBe("noted");
        expect(args[1].line_uid).toBe("U-test");
    });
});

describe("loaders/confirm — handleRejectSubmit", () => {
    test("rejects empty reason", async () => {
        document.body.innerHTML =
            '<div id="b2f-app">' +
            '<textarea id="b2f-reject-reason"></textarea>' +
            '<button id="b2f-confirm-reject"></button>' +
            "</div>";
        const api = {
            getPODetail: jest.fn(),
            confirmPO: jest.fn(),
            rejectPO: jest.fn(),
        };
        setupConfirm({ api });
        await handleRejectSubmit({});
        expect(api.rejectPO).not.toHaveBeenCalled();
    });

    test("calls api.rejectPO with reason + line_uid", async () => {
        document.body.innerHTML =
            '<div id="b2f-app">' +
            '<textarea id="b2f-reject-reason">out of stock</textarea>' +
            '<button id="b2f-confirm-reject"></button>' +
            "</div>";
        const api = {
            getPODetail: jest.fn().mockResolvedValue({ data: PO_FIXTURE }),
            confirmPO: jest.fn(),
            rejectPO: jest.fn().mockResolvedValue({ success: true }),
        };
        const poDataRef = { current: { id: 100, ID: 100 } };
        setupConfirm({ api, lineUid: "U-x", poDataRef });
        await handleRejectSubmit({});
        expect(api.rejectPO).toHaveBeenCalledTimes(1);
        const args = api.rejectPO.mock.calls[0];
        expect(args[1].reject_reason).toBe("out of stock");
        expect(args[1].line_uid).toBe("U-x");
    });
});

describe("loaders/reschedule — loadReschedulePage", () => {
    test("shows picker list when no po_id supplied", async () => {
        window.history.replaceState({}, "", "/test");
        const api = {
            getPODetail: jest.fn(),
            getMakerPOList: jest.fn().mockResolvedValue({
                data: [PO_FIXTURE],
                maker_currency: "THB",
            }),
            reschedulePO: jest.fn(),
        };
        setupReschedule({ api });
        await loadReschedulePage();
        expect(api.getMakerPOList).toHaveBeenCalledWith(undefined, {
            status: "confirmed",
        });
    });

    test("shows reschedule form for confirmed PO", async () => {
        const api = {
            getPODetail: jest.fn().mockResolvedValue({
                data: { ...PO_FIXTURE, po_status: "confirmed" },
            }),
            getMakerPOList: jest.fn(),
            reschedulePO: jest.fn(),
        };
        setupReschedule({ api });
        await loadReschedulePage(100);
        expect(api.getPODetail).toHaveBeenCalledWith(100);
        const app = document.getElementById("b2f-app");
        expect(app.querySelector("#b2f-reschedule-btn")).toBeTruthy();
    });

    test("blocks reschedule for non-confirmed/delivering status", async () => {
        const api = {
            getPODetail: jest.fn().mockResolvedValue({
                data: { ...PO_FIXTURE, po_status: "received" },
            }),
            getMakerPOList: jest.fn(),
            reschedulePO: jest.fn(),
        };
        setupReschedule({ api });
        await loadReschedulePage(100);
        const app = document.getElementById("b2f-app");
        expect(app.innerHTML).toContain("ไม่สามารถขอเลื่อน");
    });

    test("handleRescheduleSubmit rejects empty new_date", async () => {
        document.body.innerHTML =
            '<div id="b2f-app">' +
            '<input id="b2f-new-date" value="" />' +
            '<textarea id="b2f-reschedule-reason"></textarea>' +
            '<button id="b2f-reschedule-btn"></button>' +
            "</div>";
        const api = {
            getPODetail: jest.fn(),
            getMakerPOList: jest.fn(),
            reschedulePO: jest.fn(),
        };
        setupReschedule({ api });
        await handleRescheduleSubmit({ id: 100 });
        expect(api.reschedulePO).not.toHaveBeenCalled();
    });

    test("handleRescheduleSubmit rejects empty reason", async () => {
        document.body.innerHTML =
            '<div id="b2f-app">' +
            '<input id="b2f-new-date" value="' +
            tomorrow() +
            '" />' +
            '<textarea id="b2f-reschedule-reason"></textarea>' +
            '<button id="b2f-reschedule-btn"></button>' +
            "</div>";
        const api = {
            getPODetail: jest.fn(),
            getMakerPOList: jest.fn(),
            reschedulePO: jest.fn(),
        };
        setupReschedule({ api });
        await handleRescheduleSubmit({ id: 100 });
        expect(api.reschedulePO).not.toHaveBeenCalled();
    });
});

describe("loaders/deliver — loadDeliverPage + b2fOpenDeliverForm", () => {
    beforeEach(() => _resetDeliverState());

    test("loadDeliverPage filters by status=confirmed,partial_received,delivering", async () => {
        const api = {
            getPODetail: jest.fn(),
            getMakerPOList: jest.fn().mockResolvedValue({
                data: [PO_FIXTURE],
                maker_currency: "THB",
            }),
            deliverLot: jest.fn(),
        };
        setupDeliver({ api });
        await loadDeliverPage();
        expect(api.getMakerPOList).toHaveBeenCalledWith(undefined, {
            status: "confirmed,partial_received,delivering",
        });
    });

    test("b2fOpenDeliverForm fetches PO detail + renders form", async () => {
        const api = {
            getPODetail: jest.fn().mockResolvedValue({
                data: { ...PO_FIXTURE, po_status: "confirmed" },
            }),
            getMakerPOList: jest.fn(),
            deliverLot: jest.fn(),
        };
        const poDataRef = { current: null };
        setupDeliver({ api, poDataRef });
        await b2fOpenDeliverForm(100);
        expect(api.getPODetail).toHaveBeenCalledWith(100);
        expect(poDataRef.current).toBeTruthy();
    });

    test("b2fStepQty +/- adjusts input within min/max bounds", () => {
        document.body.innerHTML =
            '<div class="b2f-dlv-row">' +
            '<button class="b2f-dlv-step-minus"></button>' +
            '<input type="number" min="0" max="10" value="5" />' +
            '<button class="b2f-dlv-step-plus"></button>' +
            "</div>";
        const minusBtn = document.querySelector(".b2f-dlv-step-minus");
        const plusBtn = document.querySelector(".b2f-dlv-step-plus");
        const input = document.querySelector("input");

        b2fStepQty(plusBtn, 1);
        expect(input.value).toBe("6");

        b2fStepQty(minusBtn, -3);
        expect(input.value).toBe("3");

        // Clamp to max
        b2fStepQty(plusBtn, 999);
        expect(input.value).toBe("10");

        // Clamp to min
        b2fStepQty(minusBtn, -999);
        expect(input.value).toBe("0");
    });

    test("b2fFillAllRemaining sets every .b2f-dlv-qty to its max", () => {
        document.body.innerHTML =
            '<input class="b2f-dlv-qty" type="number" max="5" value="0" />' +
            '<input class="b2f-dlv-qty" type="number" max="8" value="0" />';
        b2fFillAllRemaining();
        const inputs = document.querySelectorAll(".b2f-dlv-qty");
        expect(inputs[0].value).toBe("5");
        expect(inputs[1].value).toBe("8");
    });

    test("handleDeliverSubmit rejects empty form (no qty inputs)", async () => {
        document.body.innerHTML = '<div id="b2f-app"></div>';
        const api = {
            getPODetail: jest.fn(),
            getMakerPOList: jest.fn(),
            deliverLot: jest.fn(),
        };
        const poDataRef = { current: PO_FIXTURE };
        setupDeliver({ api, poDataRef });
        await handleDeliverSubmit();
        expect(api.deliverLot).not.toHaveBeenCalled();
    });

    test("handleDeliverSubmit POSTs delivery_items when valid", async () => {
        document.body.innerHTML =
            '<div id="b2f-app">' +
            '<input class="b2f-dlv-qty" type="number" max="5" value="3" data-sku="A1" />' +
            '<textarea id="b2f-dlv-note">ok</textarea>' +
            "</div>";
        const api = {
            getPODetail: jest.fn(),
            getMakerPOList: jest.fn().mockResolvedValue({ data: [] }),
            deliverLot: jest.fn().mockResolvedValue({ is_complete: true }),
        };
        const poDataRef = { current: { id: 42, ID: 42, items: [] } };
        setupDeliver({ api, poDataRef });
        await handleDeliverSubmit();
        expect(api.deliverLot).toHaveBeenCalledTimes(1);
        const args = api.deliverLot.mock.calls[0];
        expect(args[0]).toBe(42);
        expect(args[1].delivery_items).toEqual([{ sku: "A1", qty: 3 }]);
        expect(args[1].note).toBe("ok");
    });

    test("handleDeliverSubmit rejects qty exceeding max", async () => {
        document.body.innerHTML =
            '<div id="b2f-app">' +
            '<input class="b2f-dlv-qty" type="number" max="5" value="99" data-sku="A1" />' +
            '<textarea id="b2f-dlv-note"></textarea>' +
            "</div>";
        const api = {
            getPODetail: jest.fn(),
            getMakerPOList: jest.fn(),
            deliverLot: jest.fn(),
        };
        const poDataRef = { current: { id: 42, items: [] } };
        setupDeliver({ api, poDataRef });
        await handleDeliverSubmit();
        expect(api.deliverLot).not.toHaveBeenCalled();
    });
});
