/**
 * LIFF AI Frontend — Agent Chat panel renderer (V.0.3 Round 2).
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.9
 *   Source location: lines 1587-1790 (renderAgentChat) — chat shell only.
 *   Bubble appending + send loop + typing indicator stay in entry.js Round 3
 *   because they require live API + sessionStorage.
 *
 * Pure HTML for the chat shell:
 *   - Header (title + close button)
 *   - Quick-question chips
 *   - Empty `<div id="chatMessages">` for bubbles
 *   - Input bar with `<input id="chatInput">` + `<button id="chatSend">`
 *
 * The inline `onclick="navigate('dashboard')"` close-button attribute is
 * preserved verbatim — Round 4 will migrate to `data-action`.
 */

import { escHtml } from "../utils/format.js";

/**
 * The 5 agent labels (Thai with emoji prefixes). Mirrors V.3.9 AGENT_LABELS.
 */
export const AGENT_LABELS = Object.freeze({
    "lead-coordinator": "🤝 ประสานตัวแทน",
    "claim-specialist": "🔧 ผู้เชี่ยวชาญเคลม",
    "payment-guardian": "💰 ดูแลการเงิน",
    "daily-report": "📊 สรุปรายงาน",
    "problem-solver": "💡 แก้ปัญหา",
});

/**
 * Quick-question presets (4 items).
 */
export const QUICK_QUESTIONS = Object.freeze([
    { text: "สรุป lead วันนี้", icon: "🎯" },
    { text: "เคลมค้างมีกี่ตัว", icon: "🔧" },
    { text: "ตัวแทนไหนไม่ตอบ", icon: "⚠️" },
    { text: "สินค้ายอดนิยม", icon: "📦" },
]);

/**
 * Render the agent-chat shell.
 * @returns {string} HTML
 */
export function renderAgentChat() {
    let html = "";

    html += '<div class="liff-ai-chat-wrapper">';

    // Header
    html += '<div class="liff-ai-chat-header">';
    html += '<div class="liff-ai-chat-header-icon">🤖</div>';
    html += '<div class="liff-ai-chat-header-info">';
    html += '<div class="liff-ai-chat-header-title">AI Agent</div>';
    html +=
        '<div class="liff-ai-chat-header-sub">DINOCO AI — ถามอะไรก็ได้</div>';
    html += "</div>";
    // Inline `onclick=` preserved verbatim — Round 4 will migrate to data-action.
    html +=
        '<button class="liff-ai-chat-close" onclick="navigate(\'dashboard\')" title="ปิด" aria-label="ปิด" data-modal-close><span aria-hidden="true">&times;</span><span class="sr-only">ปิด</span></button>';
    html += "</div>";

    // Quick questions
    html += '<div class="liff-ai-quick-actions">';
    QUICK_QUESTIONS.forEach(function (q) {
        html +=
            '<button class="liff-ai-quick-btn" data-quick="' +
            escHtml(q.text) +
            '">' +
            q.icon +
            " " +
            escHtml(q.text) +
            "</button>";
    });
    html += "</div>";

    // Messages area
    html += '<div class="liff-ai-chat-messages" id="chatMessages"></div>';

    // Input bar
    html += '<div class="liff-ai-chat-input-bar">';
    html +=
        '<input type="text" id="chatInput" placeholder="ถามอะไรก็ได้..." autocomplete="off">';
    html += '<button id="chatSend">&#10148;</button>';
    html += "</div>";

    html += "</div>";

    return html;
}

/**
 * Render a single chat bubble HTML (without DOM mutation). Used by tests.
 * Inline V.3.9 builds via `document.createElement` for action-button cases —
 * this string version handles plain bubbles + agent label only. Action buttons
 * (Lead/Claim deeplinks) are wired by entry.js Round 3.
 *
 * @param {{
 *   role: "user"|"bot",
 *   text: string,
 *   agentId?: string|null,
 * }} msg
 * @returns {string} HTML
 */
export function renderChatBubble(msg) {
    const role = msg.role === "user" ? "user" : "bot";
    const text = msg.text || "";
    const agentLabel =
        role === "bot" && msg.agentId && AGENT_LABELS[msg.agentId]
            ? AGENT_LABELS[msg.agentId]
            : "";

    let html = '<div class="liff-ai-chat-bubble ' + role + '">';
    if (agentLabel) {
        html += '<span class="agent-label">' + escHtml(agentLabel) + "</span>";
    }
    html +=
        '<div class="bubble-text">' +
        formatBotText(text) +
        "</div>";
    html += "</div>";
    return html;
}

/**
 * Format bot text — escape, then upgrade `**bold**` and newlines.
 * Mirrors V.3.9 `formatBotText()` lines 1719-1727.
 *
 * @param {string} text
 * @returns {string} HTML
 */
export function formatBotText(text) {
    if (!text) return "";
    let s = escHtml(text);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\n/g, "<br>");
    return s;
}
