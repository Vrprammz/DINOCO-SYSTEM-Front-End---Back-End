/**
 * LIFF AI — Agent Chat loader (V.0.4 Round 3)
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.10
 *   - lines 1587-1596: chat history persistence
 *   - lines 1598-1806: renderAgentChat() — full chat shell + bubble + send
 *
 * Behavioral parity:
 *   - Render chat shell from page renderer.
 *   - Restore history from sessionStorage.
 *   - `handleAskAgent(text)` POST /agent-ask + append response bubble.
 *   - Welcome bubble when history empty.
 */

import { showError, showToast } from "../utils/dom.js";
import { escHtml } from "../utils/format.js";
import {
    renderAgentChat,
    renderChatBubble,
    formatBotText,
    AGENT_LABELS,
} from "../pages/agentChat.js";

const HISTORY_KEY = "liff_ai_chat_history";
const HISTORY_MAX = 30;

let _api = null;
let _state = null;
let _isSending = false;

/**
 * @param {{ api: any }} deps
 * @param {object} [state]
 */
export function setupAgentChat(deps, state) {
    if (!deps || !deps.api) {
        throw new Error("setupAgentChat: deps.api required");
    }
    _api = deps.api;
    _state = state || {};
}

/**
 * Render chat shell + restore history.
 *
 * @returns {Promise<void>}
 */
export async function loadAgentChat() {
    if (!_api) return;
    try {
        const html = renderAgentChat();
        const app = document.getElementById("liffAiApp");
        if (app) app.innerHTML = html;

        const messagesEl = document.getElementById("chatMessages");
        if (!messagesEl) return;

        const history = _loadHistory();
        if (history && history.length > 0) {
            for (const msg of history) {
                _appendBubble(messagesEl, msg, true);
            }
        } else {
            _appendBubble(
                messagesEl,
                {
                    role: "bot",
                    text:
                        "สวัสดีครับ ผม DINOCO AI Agent พร้อมช่วยเหลือคุณ\n" +
                        "เลือกคำถามด้านบน หรือพิมพ์คำถามได้เลยครับ",
                    agentId: "daily-report",
                },
                true
            );
        }
    } catch (err) {
        showError(
            "โหลด Agent Chat ไม่สำเร็จ",
            _errMsg(err)
        );
    }
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function _errMsg(err) {
    if (err && typeof err === "object" && "message" in err) {
        const m = /** @type {{message?: unknown}} */ (err).message;
        if (typeof m === "string") return m;
    }
    return "";
}

/**
 * Send question to AI agent. Appends user bubble immediately, then bot
 * bubble with response.
 *
 * @param {string} question
 * @returns {Promise<void>}
 */
export async function handleAskAgent(question) {
    if (!_api) return;
    const q = (question || "").trim();
    if (!q) return;
    if (_isSending) return;
    _isSending = true;

    const messagesEl = document.getElementById("chatMessages");
    if (!messagesEl) {
        _isSending = false;
        return;
    }

    // Append user bubble
    const userMsg = { role: "user", text: q };
    _appendBubble(messagesEl, userMsg, false);
    _saveHistoryAppend(userMsg);

    // Typing indicator bubble
    const typing = document.createElement("div");
    typing.className = "liff-ai-chat-bubble bot typing";
    typing.innerHTML = '<span class="liff-ai-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block"></span> กำลังคิด...';
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
        const r = await _api.askAgent(q);
        if (typing.parentNode) typing.parentNode.removeChild(typing);

        if (r && r.success !== false) {
            const data = r.data || r;
            const botMsg = {
                role: "bot",
                text: data.text || data.answer || "ไม่ได้รับคำตอบ",
                agentId: data.agent_id || data.agentId || null,
                stats: data.stats || null,
            };
            _appendBubble(messagesEl, botMsg, false);
            _saveHistoryAppend(botMsg);
        } else {
            showToast((r && r.message) || "ไม่สำเร็จ", "error");
        }
    } catch (_err) {
        if (typing.parentNode) typing.parentNode.removeChild(typing);
        showToast("⚠️ เครือข่ายขัดข้อง — ลองใหม่", "error");
    } finally {
        _isSending = false;
    }
}

/**
 * Append a chat bubble to the messages element.
 *
 * @param {HTMLElement} messagesEl
 * @param {{ role: string, text: string, agentId?: string|null, stats?: object|null }} msg
 * @param {boolean} skipScroll
 */
function _appendBubble(messagesEl, msg, skipScroll) {
    const bubble = document.createElement("div");
    bubble.className = "liff-ai-chat-bubble " + (msg.role === "user" ? "user" : "bot");

    if (msg.role === "bot" && msg.agentId && AGENT_LABELS[msg.agentId]) {
        const label = document.createElement("span");
        label.className = "agent-label";
        label.textContent = AGENT_LABELS[msg.agentId];
        bubble.appendChild(label);
    }

    const textEl = document.createElement("div");
    textEl.className = "bubble-text";
    if (msg.role === "bot") {
        textEl.innerHTML = formatBotText(msg.text);
    } else {
        textEl.innerHTML = escHtml(msg.text || "").replace(/\n/g, "<br>");
    }
    bubble.appendChild(textEl);

    messagesEl.appendChild(bubble);
    if (!skipScroll) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
}

function _loadHistory() {
    if (typeof sessionStorage === "undefined") return [];
    try {
        const raw = sessionStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function _saveHistoryAppend(msg) {
    if (typeof sessionStorage === "undefined") return;
    try {
        const list = _loadHistory();
        list.push(msg);
        // Cap history to prevent runaway storage growth.
        const capped = list.length > HISTORY_MAX ? list.slice(-HISTORY_MAX) : list;
        sessionStorage.setItem(HISTORY_KEY, JSON.stringify(capped));
    } catch {
        /* ignore quota */
    }
}

/**
 * Test-only — clear send-lock between cases.
 */
export function _resetAgentChatLock() {
    _isSending = false;
}

// Re-export renderChatBubble for tests / callers needing pure render.
export { renderChatBubble };
