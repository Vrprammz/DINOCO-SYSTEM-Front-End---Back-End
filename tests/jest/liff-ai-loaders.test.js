/**
 * Phase 6 Jest tests for liff-src/liff-ai/frontend/loaders/* (V.0.4 Round 3).
 *
 * Covers per-loader:
 *   - setupX() registers api + state.
 *   - loadX() calls api method + injects HTML into #liffAiApp.
 *   - Error path triggers showError (via DOM inspection).
 *   - Handler functions (handleAcceptLead / handleNoteAdd / handleAskAgent /
 *     handleClaimStatusUpdate / openLightbox / closeLightbox) work.
 *
 * Production anchor: `[LIFF AI] Snippet 2: Frontend` V.3.10
 *   - lines 799-958: dashboard/dealer fetchers
 *   - lines 1052-1205: renderLeadDetail (loader fork)
 *   - lines 1284-1342: renderClaimList
 *   - lines 1365-1485: renderClaimDetail + lightbox
 *   - lines 1598-1806: renderAgentChat + send loop
 */

import { setupDashboard, loadDashboard } from "../../liff-src/liff-ai/frontend/loaders/dashboard.js";
import { setupDealer, loadDealerDashboard } from "../../liff-src/liff-ai/frontend/loaders/dealer.js";
import {
    setupLeadDetail,
    loadLeadDetail,
    handleAcceptLead,
    handleNoteAdd,
    handleStatusChange,
    showStatusChangeModal,
} from "../../liff-src/liff-ai/frontend/loaders/leadDetail.js";
import { setupClaimList, loadClaimList } from "../../liff-src/liff-ai/frontend/loaders/claimList.js";
import {
    setupClaimDetail,
    loadClaimDetail,
    openLightbox,
    closeLightbox,
    handleClaimStatusUpdate,
    showClaimStatusModal,
} from "../../liff-src/liff-ai/frontend/loaders/claimDetail.js";
import {
    setupAgentChat,
    loadAgentChat,
    handleAskAgent,
    _resetAgentChatLock,
} from "../../liff-src/liff-ai/frontend/loaders/agentChat.js";

function setupApp() {
    document.body.innerHTML =
        '<div id="liffAiApp"></div><div id="liffAiToast"></div>';
}

function makeApi(overrides = {}) {
    return {
        getDashboard: jest.fn().mockResolvedValue({ success: true, data: { active_conversations: 5 } }),
        getDealerDashboard: jest.fn().mockResolvedValue({ success: true, data: { name: "ดีลเลอร์" } }),
        getLeads: jest.fn().mockResolvedValue({ success: true, data: { leads: [] } }),
        getLeadDetail: jest.fn().mockResolvedValue({
            success: true,
            data: {
                customerName: "Test",
                productInterest: "Box",
                platform: "line",
                status: "lead_created",
            },
        }),
        acceptLead: jest.fn().mockResolvedValue({ success: true }),
        addNote: jest.fn().mockResolvedValue({ success: true }),
        updateLeadStatus: jest.fn().mockResolvedValue({ success: true }),
        getClaims: jest.fn().mockResolvedValue({ success: true, data: { claims: [] } }),
        getClaimDetail: jest.fn().mockResolvedValue({
            success: true,
            data: {
                ticket_id: "MC-1",
                ticket_status: "pending",
                product: "Box",
                ai_analysis: "",
                photos: [],
                status_history: [],
            },
        }),
        updateClaimStatus: jest.fn().mockResolvedValue({ success: true }),
        askAgent: jest.fn().mockResolvedValue({ success: true, data: { text: "answer" } }),
        ...overrides,
    };
}

describe("loaders/dashboard", () => {
    beforeEach(() => setupApp());

    test("loadDashboard fetches + renders into #liffAiApp", async () => {
        const api = makeApi();
        setupDashboard({ api }, {});
        await loadDashboard();
        expect(api.getDashboard).toHaveBeenCalled();
        expect(document.getElementById("liffAiApp").innerHTML.length).toBeGreaterThan(0);
    });

    test("loadDashboard error shows error state", async () => {
        const api = makeApi({
            getDashboard: jest.fn().mockRejectedValue(new Error("network")),
        });
        setupDashboard({ api }, {});
        await loadDashboard();
        expect(document.getElementById("liffAiApp").innerHTML).toContain("liff-ai-error");
    });

    test("loadDashboard handles success:false response", async () => {
        const api = makeApi({
            getDashboard: jest.fn().mockResolvedValue({ success: false, message: "denied" }),
        });
        setupDashboard({ api }, {});
        await loadDashboard();
        expect(document.getElementById("liffAiApp").innerHTML).toContain("liff-ai-error");
    });

    test("setupDashboard throws when api missing", () => {
        expect(() => setupDashboard({}, {})).toThrow();
    });
});

describe("loaders/dealer", () => {
    beforeEach(() => setupApp());

    test("loadDealerDashboard fetches + renders", async () => {
        const api = makeApi();
        setupDealer({ api }, {});
        await loadDealerDashboard();
        expect(api.getDealerDashboard).toHaveBeenCalled();
        expect(document.getElementById("liffAiApp").innerHTML.length).toBeGreaterThan(0);
    });

    test("loadDealerDashboard error shows error state", async () => {
        const api = makeApi({
            getDealerDashboard: jest.fn().mockRejectedValue(new Error("offline")),
        });
        setupDealer({ api }, {});
        await loadDealerDashboard();
        expect(document.getElementById("liffAiApp").innerHTML).toContain("liff-ai-error");
    });
});

describe("loaders/leadDetail", () => {
    beforeEach(() => setupApp());

    test("loadLeadDetail without id shows error", async () => {
        const api = makeApi();
        setupLeadDetail({ api }, {});
        await loadLeadDetail("");
        expect(document.getElementById("liffAiApp").innerHTML).toContain("liff-ai-error");
        expect(api.getLeadDetail).not.toHaveBeenCalled();
    });

    test("loadLeadDetail fetches and renders", async () => {
        const api = makeApi();
        const state = { role: "admin" };
        setupLeadDetail({ api }, state);
        await loadLeadDetail("L42");
        expect(api.getLeadDetail).toHaveBeenCalledWith("L42");
        expect(state.currentLeadId).toBe("L42");
    });

    test("handleAcceptLead success path", async () => {
        const api = makeApi();
        setupLeadDetail({ api }, { role: "dealer" });
        const btn = document.createElement("button");
        document.body.appendChild(btn);
        await handleAcceptLead("L42", btn);
        expect(api.acceptLead).toHaveBeenCalledWith("L42");
    });

    test("handleAcceptLead network error re-enables button", async () => {
        const api = makeApi({
            acceptLead: jest.fn().mockRejectedValue(new Error("offline")),
        });
        setupLeadDetail({ api }, { role: "dealer" });
        const btn = document.createElement("button");
        document.body.appendChild(btn);
        await handleAcceptLead("L42", btn);
        expect(btn.disabled).toBe(false);
    });

    test("handleNoteAdd reads from #noteInput + calls api.addNote", async () => {
        const api = makeApi();
        setupLeadDetail({ api }, {});
        const ta = document.createElement("textarea");
        ta.id = "noteInput";
        ta.value = "  note text  ";
        document.body.appendChild(ta);
        await handleNoteAdd("L42");
        expect(api.addNote).toHaveBeenCalledWith("L42", "note text");
    });

    test("handleNoteAdd skips when empty", async () => {
        const api = makeApi();
        setupLeadDetail({ api }, {});
        const ta = document.createElement("textarea");
        ta.id = "noteInput";
        ta.value = "";
        document.body.appendChild(ta);
        await handleNoteAdd("L42");
        expect(api.addNote).not.toHaveBeenCalled();
    });

    test("handleStatusChange invokes api.updateLeadStatus", async () => {
        const api = makeApi();
        setupLeadDetail({ api }, {});
        await handleStatusChange("L42", "qualified");
        expect(api.updateLeadStatus).toHaveBeenCalledWith("L42", "qualified");
    });

    test("showStatusChangeModal appends overlay to body", () => {
        setupLeadDetail({ api: makeApi() }, {});
        showStatusChangeModal("L42", ["qualified", "lost"]);
        const overlay = document.querySelector(".liff-ai-modal-overlay");
        expect(overlay).toBeTruthy();
        expect(overlay.dataset.leadId).toBe("L42");
    });
});

describe("loaders/claimList", () => {
    beforeEach(() => setupApp());

    test("loadClaimList fetches + renders", async () => {
        const api = makeApi();
        const state = {};
        setupClaimList({ api }, state);
        await loadClaimList();
        expect(api.getClaims).toHaveBeenCalled();
        expect(state.claimFilter).toBe("all");
    });

    test("loadClaimList passes filter to api", async () => {
        const api = makeApi();
        setupClaimList({ api }, {});
        await loadClaimList("approved");
        expect(api.getClaims).toHaveBeenCalledWith({ status: "approved" });
    });

    test("loadClaimList error shows error state", async () => {
        const api = makeApi({
            getClaims: jest.fn().mockRejectedValue(new Error("net")),
        });
        setupClaimList({ api }, {});
        await loadClaimList();
        expect(document.getElementById("liffAiApp").innerHTML).toContain("liff-ai-error");
    });
});

describe("loaders/claimDetail", () => {
    beforeEach(() => setupApp());

    test("loadClaimDetail fetches + stashes state", async () => {
        const api = makeApi();
        const state = { role: "admin" };
        setupClaimDetail({ api }, state);
        await loadClaimDetail("C42");
        expect(api.getClaimDetail).toHaveBeenCalledWith("C42");
        expect(state.currentClaimId).toBe("C42");
    });

    test("openLightbox + closeLightbox manage overlay", () => {
        setupClaimDetail({ api: makeApi() }, {});
        openLightbox(["http://x/a.jpg", "http://x/b.jpg"], 1);
        expect(document.querySelectorAll(".liff-ai-lightbox-overlay").length).toBe(1);
        closeLightbox();
        expect(document.querySelectorAll(".liff-ai-lightbox-overlay").length).toBe(0);
    });

    test("closeLightbox is no-op when no overlay present", () => {
        setupClaimDetail({ api: makeApi() }, {});
        expect(() => closeLightbox()).not.toThrow();
    });

    test("handleClaimStatusUpdate invokes api.updateClaimStatus", async () => {
        const api = makeApi();
        setupClaimDetail({ api }, {});
        await handleClaimStatusUpdate("C42", "approved");
        expect(api.updateClaimStatus).toHaveBeenCalledWith("C42", "approved");
    });

    test("showClaimStatusModal appends overlay with claimId dataset", () => {
        setupClaimDetail({ api: makeApi() }, {});
        showClaimStatusModal("C42", "pending");
        const overlay = document.querySelector(".liff-ai-modal-overlay");
        expect(overlay).toBeTruthy();
        expect(overlay.dataset.claimId).toBe("C42");
    });
});

describe("loaders/agentChat", () => {
    beforeEach(() => {
        setupApp();
        _resetAgentChatLock();
        if (typeof sessionStorage !== "undefined") sessionStorage.clear();
    });

    test("loadAgentChat renders shell + welcome bubble", async () => {
        const api = makeApi();
        setupAgentChat({ api }, {});
        await loadAgentChat();
        const html = document.getElementById("liffAiApp").innerHTML;
        expect(html).toContain("liff-ai-chat-wrapper");
        const messages = document.getElementById("chatMessages");
        expect(messages).toBeTruthy();
        // Welcome bubble appended
        expect(messages.children.length).toBeGreaterThanOrEqual(1);
    });

    test("handleAskAgent sends question + appends response bubble", async () => {
        const api = makeApi();
        setupAgentChat({ api }, {});
        await loadAgentChat();
        const messagesBefore = document.getElementById("chatMessages").children.length;
        await handleAskAgent("hello?");
        expect(api.askAgent).toHaveBeenCalledWith("hello?");
        const messagesAfter = document.getElementById("chatMessages").children.length;
        // user bubble + bot bubble (typing removed)
        expect(messagesAfter).toBeGreaterThan(messagesBefore);
    });

    test("handleAskAgent skips empty input", async () => {
        const api = makeApi();
        setupAgentChat({ api }, {});
        await loadAgentChat();
        await handleAskAgent("   ");
        expect(api.askAgent).not.toHaveBeenCalled();
    });

    test("handleAskAgent handles network error gracefully", async () => {
        const api = makeApi({
            askAgent: jest.fn().mockRejectedValue(new Error("offline")),
        });
        setupAgentChat({ api }, {});
        await loadAgentChat();
        // Should not throw
        await expect(handleAskAgent("test?")).resolves.toBeUndefined();
    });

    test("handleAskAgent guards against double-send", async () => {
        let resolveFn;
        const api = makeApi({
            askAgent: jest.fn().mockReturnValue(
                new Promise((resolve) => {
                    resolveFn = resolve;
                })
            ),
        });
        setupAgentChat({ api }, {});
        await loadAgentChat();
        const p1 = handleAskAgent("first?");
        const p2 = handleAskAgent("second?");
        // resolve first
        resolveFn({ success: true, data: { text: "answer" } });
        await p1;
        await p2;
        // Second call should have been blocked
        expect(api.askAgent).toHaveBeenCalledTimes(1);
    });
});
