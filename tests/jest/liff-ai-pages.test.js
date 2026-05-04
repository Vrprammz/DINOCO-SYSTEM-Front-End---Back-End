/**
 * Phase 6 Jest tests for liff-src/liff-ai/frontend/pages/* (V.0.3 Round 2).
 *
 * Covers 6 page renderer modules:
 *   - dashboard.js        (renderDashboard + renderUrgentSection)
 *   - dealer.js           (renderDealer — 2-tab dealer landing)
 *   - leadCard.js         (renderLeadCard — shared lead row)
 *   - leadDetail.js       (renderLeadDetail + renderLeadHistory + renderLeadStatusChange)
 *   - claimList.js        (renderClaimList + renderClaimFilter + renderClaimCard
 *                           + renderLeadList + renderLeadFilter)
 *   - claimDetail.js      (renderClaimDetail + renderStatusHistory + renderPhotoLightbox
 *                           + renderClaimStatusChange)
 *   - agentChat.js        (renderAgentChat + renderChatBubble + formatBotText)
 *
 * All renderers are PURE (return HTML strings). No DOM mutation, no API calls.
 * Tests assert the HTML contains the expected fragments + that user-supplied
 * inputs are escaped (defense-in-depth for XSS — even though server validates).
 */

/**
 * @jest-environment jsdom
 */

import {
    renderDashboard,
    renderUrgentSection,
} from "../../liff-src/liff-ai/frontend/pages/dashboard.js";

import { renderDealer } from "../../liff-src/liff-ai/frontend/pages/dealer.js";

import { renderLeadCard } from "../../liff-src/liff-ai/frontend/pages/leadCard.js";

import {
    renderLeadDetail,
    renderLeadHistory,
    renderLeadStatusChange,
} from "../../liff-src/liff-ai/frontend/pages/leadDetail.js";

import {
    renderClaimList,
    renderClaimFilter,
    renderClaimCard,
    renderLeadList,
    renderLeadFilter,
} from "../../liff-src/liff-ai/frontend/pages/claimList.js";

import {
    renderClaimDetail,
    renderStatusHistory,
    renderPhotoLightbox,
    renderClaimStatusChange,
} from "../../liff-src/liff-ai/frontend/pages/claimDetail.js";

import {
    renderAgentChat,
    renderChatBubble,
    formatBotText,
    AGENT_LABELS,
    QUICK_QUESTIONS,
} from "../../liff-src/liff-ai/frontend/pages/agentChat.js";

// ─────────────────────────────────────────────────────────────
// dashboard.js
// ─────────────────────────────────────────────────────────────
describe("renderDashboard", () => {
    test("returns a string with the admin shell", () => {
        const html = renderDashboard({ data: { active_conversations: 5 } });
        expect(typeof html).toBe("string");
        expect(html).toContain("AI Command Center");
        expect(html).toContain("สวัสดี Admin");
    });

    test("renders 4 stat cards with stat values", () => {
        const html = renderDashboard({
            data: {
                active_conversations: 12,
                pending_claims: 3,
                lead_stats: { total: 200, closed: 80 },
            },
        });
        expect(html).toContain(">12<");
        expect(html).toContain(">3<");
        expect(html).toContain(">200<");
        expect(html).toContain(">80<");
    });

    test("falls back to 0 when stats missing", () => {
        const html = renderDashboard({ data: {} });
        expect(html).toContain('class="liff-ai-stat-value orange">0<');
    });

    test("escapes logo URL", () => {
        const html = renderDashboard({
            data: {},
            logoUrl: '"><script>alert(1)</script>',
        });
        expect(html).not.toContain("<script>alert(1)</script>");
    });

    test("includes #btnLeads + #btnClaims action buttons", () => {
        const html = renderDashboard({ data: {} });
        expect(html).toContain('id="btnLeads"');
        expect(html).toContain('id="btnClaims"');
    });
});

describe("renderUrgentSection", () => {
    test("returns empty placeholder when no urgent items", () => {
        const html = renderUrgentSection({});
        expect(html).toContain("ไม่มีรายการเร่งด่วน");
    });

    test("renders needsAttention leads with data-nav-lead", () => {
        const html = renderUrgentSection({
            needsAttention: [
                {
                    _id: "abc123",
                    customerName: "สมชาย",
                    productInterest: "กันล้ม",
                    createdAt: new Date().toISOString(),
                },
            ],
        });
        expect(html).toContain('data-nav-lead="abc123"');
        expect(html).toContain("Lead ไม่ตอบ");
        expect(html).toContain("สมชาย");
    });

    test("renders pending claims with data-nav-claim", () => {
        const html = renderUrgentSection({
            pendingClaims: [
                {
                    id: 42,
                    ticket: "MC-42",
                    customer: "นภา",
                    product: "Top Box",
                    created_at: new Date().toISOString(),
                },
            ],
        });
        expect(html).toContain('data-nav-claim="42"');
        expect(html).toContain("MC-42");
        expect(html).toContain("เคลมรอตรวจ");
    });

    test("escapes customer name (XSS guard)", () => {
        const html = renderUrgentSection({
            needsAttention: [{ _id: "x", customerName: "<img src=x>" }],
        });
        expect(html).not.toContain("<img src=x>");
        expect(html).toContain("&lt;img src=x&gt;");
    });
});

// ─────────────────────────────────────────────────────────────
// dealer.js
// ─────────────────────────────────────────────────────────────
describe("renderDealer", () => {
    test("renders dealer name + 2 stat cards", () => {
        const html = renderDealer({
            data: { dealer_name: "ร้านสมชาย", new_leads: 4, active_leads: 7 },
        });
        expect(html).toContain("ร้านสมชาย");
        expect(html).toContain("Lead ใหม่");
        expect(html).toContain("กำลังดูแล");
        expect(html).toContain(">4<");
        expect(html).toContain(">7<");
    });

    test("shows pending leads section + lead cards", () => {
        const html = renderDealer({
            data: {
                dealer_name: "ร้าน",
                pending_leads: [
                    { _id: "p1", customerName: "ลูกค้า1", status: "lead_created" },
                ],
                recent_leads: [],
            },
        });
        expect(html).toContain("Lead ที่ต้องกดรับ");
        expect(html).toContain('data-lead-id="p1"');
    });

    test("shows empty state when no leads at all", () => {
        const html = renderDealer({
            data: { dealer_name: "ร้าน", pending_leads: [], recent_leads: [] },
        });
        expect(html).toContain("ยังไม่มี Lead");
    });

    test("escapes dealer_name", () => {
        const html = renderDealer({ data: { dealer_name: "<b>x</b>" } });
        expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    });
});

// ─────────────────────────────────────────────────────────────
// leadCard.js
// ─────────────────────────────────────────────────────────────
describe("renderLeadCard", () => {
    test("renders id, name, product, badge", () => {
        const html = renderLeadCard({
            _id: "L1",
            customerName: "ทดสอบ",
            productInterest: "Top Box",
            status: "dealer_notified",
            platform: "line",
            province: "กรุงเทพ",
            createdAt: new Date().toISOString(),
        });
        expect(html).toContain('data-lead-id="L1"');
        expect(html).toContain("ทดสอบ");
        expect(html).toContain("Top Box");
        expect(html).toContain("LINE"); // uppercase platform
        expect(html).toContain("กรุงเทพ");
        expect(html).toContain("liff-ai-badge-new"); // dealer_notified → new
        expect(html).toContain("แจ้งตัวแทนแล้ว");
    });

    test("uses fallback strings when fields missing", () => {
        const html = renderLeadCard({});
        expect(html).toContain("ลูกค้า");
        expect(html).toContain("-");
    });

    test("uses id when _id missing", () => {
        const html = renderLeadCard({ id: "L2" });
        expect(html).toContain('data-lead-id="L2"');
    });

    test("renders danger badge for closed_lost", () => {
        const html = renderLeadCard({ _id: "x", status: "closed_lost" });
        expect(html).toContain("liff-ai-badge-danger");
    });
});

// ─────────────────────────────────────────────────────────────
// leadDetail.js
// ─────────────────────────────────────────────────────────────
describe("renderLeadDetail", () => {
    const baseLead = {
        _id: "LD1",
        customerName: "นภา",
        productInterest: "กันล้ม",
        status: "checking_contact",
        platform: "facebook",
        province: "เชียงใหม่",
        phone: "0812345678",
        createdAt: new Date().toISOString(),
    };

    test("renders header + status badge + customer card", () => {
        const html = renderLeadDetail({ lead: baseLead, role: "admin" });
        expect(html).toContain("นภา");
        expect(html).toContain("กันล้ม");
        expect(html).toContain("FACEBOOK");
        expect(html).toContain("เชียงใหม่");
        expect(html).toContain("0812345678");
        expect(html).toContain("liff-ai-badge-active");
    });

    test("renders 9-step timeline with current step", () => {
        const html = renderLeadDetail({ lead: baseLead, role: "admin" });
        expect(html).toContain('class="liff-ai-tl-item current"');
        // checking_contact = index 2 → 2 active before it
        expect((html.match(/liff-ai-tl-item active/g) || []).length).toBe(2);
    });

    test("dealer + dealer_notified shows Accept button", () => {
        const html = renderLeadDetail({
            lead: { ...baseLead, status: "dealer_notified" },
            role: "dealer",
        });
        expect(html).toContain('id="btnAccept"');
    });

    test("admin role shows status change button", () => {
        const html = renderLeadDetail({ lead: baseLead, role: "admin" });
        expect(html).toContain('id="btnUpdateStatus"');
    });

    test("dealer + advanced status hides Accept button", () => {
        const html = renderLeadDetail({
            lead: { ...baseLead, status: "waiting_order" },
            role: "dealer",
        });
        expect(html).not.toContain('id="btnAccept"');
    });

    test("phone link renders tel:", () => {
        const html = renderLeadDetail({ lead: baseLead, role: "dealer" });
        expect(html).toContain('href="tel:0812345678"');
    });

    test("history block appears when followUpHistory present", () => {
        const html = renderLeadDetail({
            lead: {
                ...baseLead,
                followUpHistory: [{ from: "A", to: "B", note: "ติดตาม" }],
            },
            role: "admin",
        });
        expect(html).toContain("ประวัติ");
        expect(html).toContain("ติดตาม");
    });
});

describe("renderLeadHistory", () => {
    test("returns empty string for empty array", () => {
        expect(renderLeadHistory([])).toBe("");
    });

    test("renders from→to + note", () => {
        const html = renderLeadHistory([
            { from: "lead_created", to: "dealer_notified", note: "first contact" },
        ]);
        expect(html).toContain("lead_created");
        expect(html).toContain("dealer_notified");
        expect(html).toContain("first contact");
    });

    test("escapes user-supplied note", () => {
        const html = renderLeadHistory([
            { from: "a", to: "b", note: "<script>alert(1)</script>" },
        ]);
        expect(html).not.toContain("<script>alert(1)</script>");
    });
});

describe("renderLeadStatusChange", () => {
    test("renders one button per allowed status", () => {
        const html = renderLeadStatusChange({
            leadId: "L1",
            allowed: ["dealer_notified", "checking_contact", "closed_lost"],
        });
        expect(html.match(/data-status="/g).length).toBe(3);
        expect(html).toContain("แจ้งตัวแทนแล้ว");
        expect(html).toContain("กำลังติดต่อ");
        expect(html).toContain("ปิด (สูญเสีย)");
    });

    test("includes a cancel button", () => {
        const html = renderLeadStatusChange({ leadId: "L1", allowed: [] });
        expect(html).toContain("data-cancel-status");
        expect(html).toContain("ยกเลิก");
    });
});

// ─────────────────────────────────────────────────────────────
// claimList.js
// ─────────────────────────────────────────────────────────────
describe("renderClaimList", () => {
    test("renders header + filter chips + list", () => {
        const html = renderClaimList({
            claims: [
                {
                    id: 1,
                    ticket: "MC-1",
                    customer: "A",
                    product: "X",
                    status: "pending",
                },
            ],
            total: 1,
        });
        expect(html).toContain("เคลมทั้งหมด");
        expect(html).toContain("MC-1");
        expect(html).toContain("data-claim-filter");
    });

    test("empty state when no claims", () => {
        const html = renderClaimList({ claims: [], total: 0 });
        expect(html).toContain("ไม่พบใบเคลม");
    });
});

describe("renderClaimFilter", () => {
    test("returns 5 filter buttons", () => {
        const html = renderClaimFilter(null);
        expect(html.match(/data-claim-filter=/g).length).toBe(5);
        expect(html).toContain('data-claim-filter="all"');
    });

    test("marks the active filter", () => {
        const html = renderClaimFilter("pending");
        expect(html).toContain('liff-ai-filter-btn active" data-claim-filter="pending"');
    });

    test("default (null) marks 'all' as active", () => {
        const html = renderClaimFilter(null);
        expect(html).toContain('liff-ai-filter-btn active" data-claim-filter="all"');
    });
});

describe("renderClaimCard", () => {
    test("renders ticket + customer + product + badge", () => {
        const html = renderClaimCard({
            id: 99,
            ticket: "MC-99",
            customer: "Bob",
            product: "Box",
            status: "completed",
        });
        expect(html).toContain('data-claim-id="99"');
        expect(html).toContain("MC-99");
        expect(html).toContain("Bob");
        expect(html).toContain("liff-ai-badge-completed");
        expect(html).toContain("เสร็จสิ้น");
    });

    test("falls back to 'pending' status", () => {
        const html = renderClaimCard({ id: 1 });
        expect(html).toContain("liff-ai-badge-pending");
    });
});

describe("renderLeadList", () => {
    test("renders header + lead cards", () => {
        const html = renderLeadList({
            leads: [{ _id: "L1", customerName: "A", status: "lead_created" }],
            total: 1,
        });
        expect(html).toContain("Lead ทั้งหมด");
        expect(html).toContain('data-lead-id="L1"');
    });

    test("empty state shown when leads is empty", () => {
        const html = renderLeadList({ leads: [], total: 0 });
        expect(html).toContain("ไม่พบ Lead");
    });
});

describe("renderLeadFilter", () => {
    test("renders 5 filter buttons", () => {
        const html = renderLeadFilter(null);
        expect(html.match(/data-filter=/g).length).toBe(5);
    });

    test("marks active filter", () => {
        const html = renderLeadFilter("waiting_order");
        expect(html).toContain('liff-ai-filter-btn active" data-filter="waiting_order"');
    });
});

// ─────────────────────────────────────────────────────────────
// claimDetail.js
// ─────────────────────────────────────────────────────────────
describe("renderClaimDetail", () => {
    const baseClaim = {
        id: 5,
        ticket: "MC-5",
        status: "pending",
        customer: "นาย ก",
        product: "กันล้ม",
        symptoms: "หัก",
        phone: "0900000000",
        created_at: new Date().toISOString(),
        photos: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
        ai_analysis: "วิเคราะห์ตัวอย่าง",
    };

    test("renders ticket + status badge + photos block", () => {
        const html = renderClaimDetail({ claim: baseClaim, role: "admin" });
        expect(html).toContain("ใบเคลม #MC-5");
        expect(html).toContain("liff-ai-badge-pending");
        expect(html).toContain("รูปภาพ (2)");
        expect(html).toContain('data-photo-idx="0"');
        expect(html).toContain('data-photo-idx="1"');
    });

    test("renders AI analysis card when present", () => {
        const html = renderClaimDetail({ claim: baseClaim, role: "admin" });
        expect(html).toContain("AI วิเคราะห์");
        expect(html).toContain("วิเคราะห์ตัวอย่าง");
    });

    test("admin sees status change button", () => {
        const html = renderClaimDetail({ claim: baseClaim, role: "admin" });
        expect(html).toContain('id="btnClaimStatus"');
    });

    test("dealer does NOT see status change button", () => {
        const html = renderClaimDetail({ claim: baseClaim, role: "dealer" });
        expect(html).not.toContain('id="btnClaimStatus"');
    });

    test("renders status_history timeline", () => {
        const html = renderClaimDetail({
            claim: {
                ...baseClaim,
                status_history: [
                    { to: "pending", at: new Date().toISOString() },
                    { to: "reviewing", at: new Date().toISOString() },
                ],
            },
            role: "admin",
        });
        expect(html).toContain("ประวัติสถานะ");
        expect(html).toContain("รอตรวจสอบ");
        expect(html).toContain("กำลังตรวจสอบ");
    });

    test("renders admin_note + resolution when present", () => {
        const html = renderClaimDetail({
            claim: { ...baseClaim, admin_note: "หมายเหตุA", resolution: "แก้ไขB" },
            role: "admin",
        });
        expect(html).toContain("หมายเหตุA");
        expect(html).toContain("แก้ไขB");
    });

    test("escapes ai_analysis (XSS guard)", () => {
        const html = renderClaimDetail({
            claim: { ...baseClaim, ai_analysis: "<script>x</script>" },
            role: "admin",
        });
        expect(html).not.toContain("<script>x</script>");
    });
});

describe("renderStatusHistory", () => {
    test("returns wrapper with timeline class even if empty", () => {
        const html = renderStatusHistory([]);
        expect(html).toContain("liff-ai-timeline");
    });

    test("last entry tagged 'current'", () => {
        const html = renderStatusHistory([
            { to: "pending", at: new Date().toISOString() },
            { to: "completed", at: new Date().toISOString() },
        ]);
        // 1 current + 1 active
        expect((html.match(/liff-ai-tl-item current/g) || []).length).toBe(1);
        expect((html.match(/liff-ai-tl-item active/g) || []).length).toBe(1);
    });
});

describe("renderPhotoLightbox", () => {
    test("renders close button + image src", () => {
        const html = renderPhotoLightbox({
            photos: ["https://example.com/x.jpg"],
            index: 0,
        });
        expect(html).toContain("data-lightbox-close");
        expect(html).toContain('src="https://example.com/x.jpg"');
    });

    test("escapes < > & in URL (inline V.3.9 esc semantics — quotes NOT escaped)", () => {
        // Inline V.3.9 `esc()` uses textNode round-trip → only escapes < > &
        // (matches `escHtml` here). Photo URLs are server-provided, never raw user
        // text, so quote-injection isn't a realistic vector.
        const html = renderPhotoLightbox({
            photos: ["<script>x</script>"],
            index: 0,
        });
        expect(html).not.toContain("<script>x</script>");
        expect(html).toContain("&lt;script&gt;");
    });
});

describe("renderClaimStatusChange", () => {
    test("renders 5 status options", () => {
        const html = renderClaimStatusChange({});
        expect(html.match(/<option value=/g).length).toBe(5);
        expect(html).toContain('value="admin_reviewed"');
        expect(html).toContain('value="closed_resolved"');
    });

    test("marks current status as selected", () => {
        const html = renderClaimStatusChange({ currentStatus: "parts_shipping" });
        expect(html).toContain('value="parts_shipping" selected');
    });

    test("includes save + cancel buttons", () => {
        const html = renderClaimStatusChange({});
        expect(html).toContain('id="btnSaveClaimStatus"');
        expect(html).toContain('id="btnCancelClaimStatus"');
    });
});

// ─────────────────────────────────────────────────────────────
// agentChat.js
// ─────────────────────────────────────────────────────────────
describe("renderAgentChat", () => {
    test("renders chat shell", () => {
        const html = renderAgentChat();
        expect(html).toContain("liff-ai-chat-wrapper");
        expect(html).toContain("AI Agent");
        expect(html).toContain('id="chatMessages"');
        expect(html).toContain('id="chatInput"');
        expect(html).toContain('id="chatSend"');
    });

    test("renders 4 quick-question chips", () => {
        const html = renderAgentChat();
        expect(html.match(/data-quick=/g).length).toBe(4);
    });

    test("close button uses data-action=go-tab (Round 4 — no inline onclick)", () => {
        const html = renderAgentChat();
        expect(html).toContain('data-action="go-tab"');
        expect(html).toContain('data-tab="dashboard"');
        expect(html).not.toContain("onclick=");
    });
});

describe("renderChatBubble", () => {
    test("renders user bubble without agent label", () => {
        const html = renderChatBubble({ role: "user", text: "สวัสดี" });
        expect(html).toContain("liff-ai-chat-bubble user");
        expect(html).not.toContain("agent-label");
    });

    test("renders bot bubble with agent label", () => {
        const html = renderChatBubble({
            role: "bot",
            text: "ตอบ",
            agentId: "lead-coordinator",
        });
        expect(html).toContain("liff-ai-chat-bubble bot");
        expect(html).toContain("agent-label");
        expect(html).toContain("ประสานตัวแทน");
    });

    test("formats **bold** + newlines", () => {
        const html = renderChatBubble({ role: "bot", text: "**ตัวหนา**\nบรรทัด2" });
        expect(html).toContain("<strong>ตัวหนา</strong>");
        expect(html).toContain("<br>");
    });

    test("escapes raw HTML in user message", () => {
        const html = renderChatBubble({ role: "user", text: "<script>1</script>" });
        expect(html).not.toContain("<script>1</script>");
    });
});

describe("formatBotText", () => {
    test("returns empty string for empty input", () => {
        expect(formatBotText("")).toBe("");
        expect(formatBotText(null)).toBe("");
    });

    test("converts **x** to <strong>", () => {
        expect(formatBotText("**hi**")).toBe("<strong>hi</strong>");
    });

    test("converts \\n to <br>", () => {
        expect(formatBotText("a\nb")).toBe("a<br>b");
    });

    test("escapes < before formatting", () => {
        expect(formatBotText("<a>")).toContain("&lt;a&gt;");
    });
});

describe("AGENT_LABELS", () => {
    test("has 5 labels", () => {
        expect(Object.keys(AGENT_LABELS).length).toBe(5);
        expect(AGENT_LABELS["lead-coordinator"]).toBeTruthy();
    });

    test("is frozen", () => {
        expect(Object.isFrozen(AGENT_LABELS)).toBe(true);
    });
});

describe("QUICK_QUESTIONS", () => {
    test("has 4 questions", () => {
        expect(QUICK_QUESTIONS.length).toBe(4);
    });

    test("is frozen", () => {
        expect(Object.isFrozen(QUICK_QUESTIONS)).toBe(true);
    });
});
