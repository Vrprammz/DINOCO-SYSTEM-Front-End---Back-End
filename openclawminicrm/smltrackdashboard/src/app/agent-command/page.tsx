"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AGENT_REGISTRY, AGENT_CATEGORIES, type AgentCategory, type AgentInfo } from "@/lib/agent-registry";

/* ── Types ── */
interface AgentStatus {
  lastRunAt?: string;
  status?: string;
  processed?: number;
  error?: string | null;
  nextRunAt?: string | null;
  schedule?: string | null;
}

interface CostInfo {
  calls: number;
  tokens: number;
  lastCall: string;
}

interface StatusResponse {
  agents: Record<string, AgentStatus>;
  costs: Record<string, CostInfo>;
  cronJobs: any[];
  fetchedAt: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  agentId?: string;
  stats?: { totalLeads: number; totalClaims: number; needsAttention: number };
  createdAt: Date;
}

interface KBModalState {
  open: boolean;
  prefillTitle: string;
  prefillContent: string;
}

/* ── Helpers ── */
function formatTime(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(iso?: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "เมื่อกี้";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชม.ที่แล้ว`;
  const days = Math.floor(hrs / 24);
  return `${days} วันที่แล้ว`;
}

function getStatusColor(status?: string) {
  switch (status) {
    case "success":
      return { bg: "rgba(74,222,128,0.12)", text: "#4ade80", label: "ปกติ" };
    case "error":
      return { bg: "rgba(248,113,113,0.12)", text: "#f87171", label: "ผิดพลาด" };
    case "triggered":
      return { bg: "rgba(96,165,250,0.12)", text: "#60a5fa", label: "กำลังทำงาน" };
    case "disabled":
      return { bg: "rgba(113,113,122,0.12)", text: "#71717a", label: "ปิดอยู่" };
    default:
      return { bg: "rgba(113,113,122,0.12)", text: "#71717a", label: "ยังไม่เคยรัน" };
  }
}

function getAgentEmoji(agentId?: string): string {
  if (!agentId) return "\u{1F916}";
  return AGENT_REGISTRY[agentId]?.emoji || "\u{1F916}";
}

function getAgentName(agentId?: string): string {
  if (!agentId) return "AI Assistant";
  return AGENT_REGISTRY[agentId]?.name || agentId;
}

let _msgId = 0;
function nextId() {
  return `msg-${Date.now()}-${++_msgId}`;
}

/* ── Stat Card ── */
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="stat-card flex flex-col items-center gap-1">
      <span className="text-2xl font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-[11px] theme-text-secondary">{label}</span>
    </div>
  );
}

/* ── Agent Card ── */
function AgentCard({
  id,
  info,
  status,
  cost,
  onTrigger,
  triggering,
}: {
  id: string;
  info: AgentInfo;
  status?: AgentStatus;
  cost?: CostInfo;
  onTrigger: (id: string, cronType?: string) => void;
  triggering: boolean;
}) {
  const sc = getStatusColor(status?.status);
  const ago = timeAgo(status?.lastRunAt);

  return (
    <div className="glass-card rounded-xl p-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
            style={{ background: `${info.color}20` }}
          >
            {info.emoji}
          </span>
          <div>
            <h3 className="text-sm font-semibold theme-text">{info.name}</h3>
            <p className="text-[10px] theme-text-muted">{info.role}</p>
          </div>
        </div>
        {/* Status badge */}
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{ background: sc.bg, color: sc.text }}
        >
          {sc.label}
        </span>
      </div>

      {/* Description */}
      <p className="text-[11px] theme-text-secondary mb-3">{info.description}</p>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[10px] theme-text-muted mb-3">
        {ago && (
          <span>
            รันล่าสุด: <span className="theme-text-secondary">{ago}</span>
          </span>
        )}
        {status?.processed !== undefined && status.processed > 0 && (
          <span>
            ประมวลผล: <span className="theme-text-secondary">{status.processed}</span>
          </span>
        )}
        {cost && (
          <span>
            วันนี้: <span className="theme-text-secondary">{cost.calls} ครั้ง</span>
          </span>
        )}
      </div>

      {/* Error message */}
      {status?.error && (
        <div
          className="text-[10px] px-2.5 py-1.5 rounded-lg mb-3"
          style={{ background: "rgba(248,113,113,0.08)", color: "#f87171" }}
        >
          {status.error}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => onTrigger(id, info.cronType)}
        disabled={triggering}
        className="w-full py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
        style={{
          background: `${info.color}15`,
          color: info.color,
          border: `1px solid ${info.color}25`,
        }}
      >
        {triggering ? (
          <span className="flex items-center justify-center gap-2">
            <span
              className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: `${info.color} transparent transparent transparent` }}
            />
            กำลังสั่งงาน...
          </span>
        ) : (
          "สั่งงานทันที"
        )}
      </button>
    </div>
  );
}

/* ── KB Correction Modal ── */
const KB_CATEGORIES = [
  { value: "general", label: "ทั่วไป" },
  { value: "product", label: "สินค้า" },
  { value: "warranty", label: "ประกัน/เคลม" },
  { value: "pricing", label: "ราคา" },
  { value: "shipping", label: "จัดส่ง" },
  { value: "dealer", label: "ตัวแทนจำหน่าย" },
  { value: "payment", label: "ชำระเงิน" },
  { value: "troubleshooting", label: "แก้ปัญหา" },
];

function KBModal({
  state,
  onClose,
  onSaved,
}: {
  state: KBModalState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(state.prefillTitle);
  const [content, setContent] = useState(state.prefillContent);
  const [category, setCategory] = useState("general");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(state.prefillTitle);
    setContent(state.prefillContent);
  }, [state.prefillTitle, state.prefillContent]);

  if (!state.open) return null;

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/dashboard/api/agent-command/kb-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim(), category, source: "admin_correction" }),
      });
      const data = await res.json();
      if (data.ok || data.id) {
        onSaved();
        onClose();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="glass-card rounded-2xl w-full max-w-md p-5 animate-fade-in"
        style={{ border: "1px solid rgba(255,107,0,0.15)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold theme-text">แก้ไข / เพิ่มความรู้ KB</h3>
          <button onClick={onClose} className="text-lg theme-text-muted hover:theme-text">x</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] theme-text-secondary mb-1 block">หัวข้อ</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น วิธีเคลมสินค้า"
              className="w-full px-3 py-2 rounded-lg text-xs theme-text"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            />
          </div>
          <div>
            <label className="text-[11px] theme-text-secondary mb-1 block">คำตอบที่ถูกต้อง</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="พิมพ์คำตอบที่ถูกต้องที่ AI ควรตอบ..."
              className="w-full px-3 py-2 rounded-lg text-xs theme-text resize-none"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            />
          </div>
          <div>
            <label className="text-[11px] theme-text-secondary mb-1 block">หมวดหมู่</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="หมวดหมู่ความรู้"
              className="w-full px-3 py-2 rounded-lg text-xs theme-text"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              {KB_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-xs font-medium"
            style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || !content.trim()}
            className="flex-1 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
            style={{ background: "var(--primary-bg)", color: "var(--primary)", border: "1px solid rgba(255,107,0,0.2)" }}
          >
            {saving ? "กำลังบันทึก..." : "บันทึกความรู้"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Chat Panel ── */
const QUICK_QUESTIONS = [
  { label: "สรุปวันนี้", q: "สรุปภาพรวมวันนี้" },
  { label: "Lead ด่วน", q: "มี Lead ไหนต้องติดตามด่วน?" },
  { label: "ใครตอบช้า?", q: "ตัวแทนจำหน่ายคนไหนตอบลูกค้าช้าที่สุด?" },
  { label: "สินค้ายอดนิยม", q: "สินค้าอะไรขายดีที่สุดตอนนี้?" },
];

function ChatPanel({
  messages,
  sending,
  onSend,
  onCorrectKB,
  expanded,
  onToggle,
}: {
  messages: ChatMessage[];
  sending: boolean;
  onSend: (q: string) => void;
  onCorrectKB: (question: string, answer: string) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = () => {
    const q = input.trim();
    if (!q || sending) return;
    setInput("");
    onSend(q);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[150] md:left-auto md:right-4 md:bottom-4 md:w-[420px]"
      style={{
        maxHeight: expanded ? "70vh" : "56px",
        transition: "max-height 0.3s ease",
      }}
    >
      <div
        className="glass-card rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col"
        style={{
          height: expanded ? "70vh" : "56px",
          border: "1px solid rgba(255,107,0,0.15)",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.3)",
          transition: "height 0.3s ease",
        }}
      >
        {/* Header bar — always visible */}
        <button
          onClick={onToggle}
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: expanded ? "1px solid var(--border)" : "none" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
              style={{ background: "var(--primary-bg)" }}
            >
              {"\u{1F916}"}
            </span>
            <div className="text-left">
              <span className="text-xs font-semibold theme-text block">ถามน้องกุ้ง</span>
              <span className="text-[10px] theme-text-muted">AI Advisor | ตอบจากข้อมูลจริง</span>
            </div>
          </div>
          <span className="text-xs theme-text-muted">{expanded ? "\u25BC" : "\u25B2"}</span>
        </button>

        {/* Chat area */}
        {expanded && (
          <>
            {/* Quick questions */}
            {messages.length === 0 && (
              <div className="px-3 py-2 flex gap-1.5 flex-wrap flex-shrink-0">
                {QUICK_QUESTIONS.map((qq) => (
                  <button
                    key={qq.label}
                    onClick={() => onSend(qq.q)}
                    disabled={sending}
                    className="px-2.5 py-1 rounded-full text-[10px] font-medium transition-all"
                    style={{
                      background: "var(--primary-bg)",
                      color: "var(--primary)",
                      border: "1px solid rgba(255,107,0,0.15)",
                    }}
                  >
                    {qq.label}
                  </button>
                ))}
              </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 mr-2 mt-1">
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                        style={{ background: `${AGENT_REGISTRY[msg.agentId || ""]?.color || "#FF6B00"}15` }}
                      >
                        {getAgentEmoji(msg.agentId)}
                      </span>
                    </div>
                  )}
                  <div
                    className="max-w-[80%] rounded-xl px-3 py-2"
                    style={{
                      background: msg.role === "user" ? "var(--primary-bg)" : "var(--bg-card)",
                      border: `1px solid ${msg.role === "user" ? "rgba(255,107,0,0.2)" : "var(--border)"}`,
                    }}
                  >
                    {msg.role === "assistant" && (
                      <div className="text-[9px] font-medium mb-1" style={{ color: AGENT_REGISTRY[msg.agentId || ""]?.color || "#FF6B00" }}>
                        {getAgentName(msg.agentId)}
                      </div>
                    )}
                    <p className="text-xs theme-text whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    {msg.role === "assistant" && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <button
                          onClick={() => onCorrectKB(
                            messages.find((m) => m.role === "user" && new Date(m.createdAt) < new Date(msg.createdAt))?.text || "",
                            msg.text
                          )}
                          className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(248,113,113,0.1)", color: "#f87171" }}
                        >
                          แก้ KB
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="flex-shrink-0 mr-2 mt-1">
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                      style={{ background: "var(--primary-bg)" }}
                    >
                      {"\u{1F916}"}
                    </span>
                  </div>
                  <div
                    className="rounded-xl px-3 py-2"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                  >
                    <div className="flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--primary)" }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--primary)", animationDelay: "0.2s" }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--primary)", animationDelay: "0.4s" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="flex-shrink-0 px-3 py-2" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                  placeholder="ถามน้องกุ้ง..."
                  disabled={sending}
                  className="flex-1 px-3 py-2 rounded-lg text-xs theme-text"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                />
                <button
                  onClick={handleSubmit}
                  disabled={sending || !input.trim()}
                  className="px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
                  style={{ background: "var(--primary-bg)", color: "var(--primary)", border: "1px solid rgba(255,107,0,0.2)" }}
                >
                  ส่ง
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function AgentCommandPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AgentCategory>("all");
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);

  // KB Modal state
  const [kbModal, setKBModal] = useState<KBModalState>({ open: false, prefillTitle: "", prefillContent: "" });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/dashboard/api/agent-command/status");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleTrigger = useCallback(
    async (agentId: string, cronType?: string) => {
      setTriggeringId(agentId);
      try {
        const res = await fetch("/dashboard/api/agent-command/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, cronType }),
        });
        const json = await res.json();
        if (json.ok) {
          setToast({ msg: `สั่งงาน ${AGENT_REGISTRY[agentId]?.name || agentId} สำเร็จ`, type: "success" });
          setTimeout(fetchStatus, 1500);
        } else {
          setToast({ msg: json.error || "เกิดข้อผิดพลาด", type: "error" });
        }
      } catch {
        setToast({ msg: "ไม่สามารถเชื่อมต่อ Agent ได้", type: "error" });
      } finally {
        setTriggeringId(null);
      }
    },
    [fetchStatus]
  );

  // Chat send
  const handleChatSend = useCallback(async (question: string) => {
    const userMsg: ChatMessage = { id: nextId(), role: "user", text: question, createdAt: new Date() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatSending(true);
    setChatExpanded(true);

    try {
      const res = await fetch("/dashboard/api/agent-command/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      const botMsg: ChatMessage = {
        id: nextId(),
        role: "assistant",
        text: data.answer || "ไม่สามารถตอบได้",
        agentId: data.agentId,
        stats: data.stats,
        createdAt: new Date(),
      };
      setChatMessages((prev) => [...prev, botMsg]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", text: "ไม่สามารถเชื่อมต่อ Agent ได้", createdAt: new Date() },
      ]);
    } finally {
      setChatSending(false);
    }
  }, []);

  // KB correction
  const handleCorrectKB = useCallback((question: string, answer: string) => {
    setKBModal({
      open: true,
      prefillTitle: question || "",
      prefillContent: "",
    });
  }, []);

  const handleKBSaved = useCallback(() => {
    setToast({ msg: "เพิ่มความรู้ใน KB แล้ว", type: "success" });
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Filter agents
  const allEntries = Object.entries(AGENT_REGISTRY);
  const filtered =
    filter === "all"
      ? allEntries
      : filter === "error"
        ? allEntries.filter(([id]) => data?.agents[id]?.status === "error")
        : allEntries.filter(([, info]) => info.category === filter);

  // Stats
  const totalAgents = allEntries.length;
  const okCount = allEntries.filter(([id]) => data?.agents[id]?.status === "success").length;
  const errorCount = allEntries.filter(([id]) => data?.agents[id]?.status === "error").length;
  const neverRun = allEntries.filter(([id]) => !data?.agents[id]?.status).length;
  const disabledCount = allEntries.filter(([id]) => data?.agents[id]?.status === "disabled").length;

  return (
    <div className="page-container" style={{ paddingBottom: chatExpanded ? "56px" : "72px" }}>
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold gradient-text">ศูนย์บัญชาการ AI</h1>
            <p className="text-[11px] theme-text-muted mt-0.5">
              {totalAgents} Agents | อัพเดทล่าสุด{" "}
              {data?.fetchedAt ? formatTime(data.fetchedAt) : "-"}
            </p>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              fetchStatus();
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition"
            style={{
              background: "var(--primary-bg)",
              color: "var(--primary)",
              border: "1px solid rgba(255,107,0,0.15)",
            }}
          >
            {loading ? "กำลังโหลด..." : "รีเฟรช"}
          </button>
        </div>
      </div>

      <div className="page-content space-y-4">
        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-2">
          <StatCard label="ปกติ" value={okCount} color="#4ade80" />
          <StatCard label="ผิดพลาด" value={errorCount} color="#f87171" />
          <StatCard label="ไม่เคยรัน" value={neverRun} color="#71717a" />
          <StatCard label="ปิดอยู่" value={disabledCount} color="#525252" />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {AGENT_CATEGORIES.map((cat) => {
            const active = filter === cat.key;
            const count =
              cat.key === "all"
                ? totalAgents
                : cat.key === "error"
                  ? errorCount
                  : allEntries.filter(([, info]) => info.category === cat.key).length;
            return (
              <button
                key={cat.key}
                onClick={() => setFilter(cat.key)}
                className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all"
                style={{
                  background: active ? "var(--primary-bg)" : "var(--bg-card)",
                  color: active ? "var(--primary)" : "var(--text-secondary)",
                  border: `1px solid ${active ? "rgba(255,107,0,0.2)" : "var(--border)"}`,
                }}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Agent grid */}
        {loading && !data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="glass-card rounded-xl p-4 animate-pulse"
                style={{ height: "180px" }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 theme-text-muted text-sm">
            ไม่มี Agent ในหมวดนี้
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map(([id, info]) => (
              <AgentCard
                key={id}
                id={id}
                info={info}
                status={data?.agents[id]}
                cost={data?.costs[id]}
                onTrigger={handleTrigger}
                triggering={triggeringId === id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Chat Panel */}
      <ChatPanel
        messages={chatMessages}
        sending={chatSending}
        onSend={handleChatSend}
        onCorrectKB={handleCorrectKB}
        expanded={chatExpanded}
        onToggle={() => setChatExpanded((v) => !v)}
      />

      {/* KB Correction Modal */}
      <KBModal
        state={kbModal}
        onClose={() => setKBModal((s) => ({ ...s, open: false }))}
        onSaved={handleKBSaved}
      />

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[250] px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg animate-slide-up"
          style={{
            background: toast.type === "success" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
            color: toast.type === "success" ? "#4ade80" : "#f87171",
            border: `1px solid ${toast.type === "success" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
            backdropFilter: "blur(12px)",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
