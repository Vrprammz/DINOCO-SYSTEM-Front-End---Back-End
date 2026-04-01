"use client";

import { useState, useEffect, useCallback } from "react";
import { AGENT_REGISTRY, AGENT_CATEGORIES, type AgentCategory, type AgentInfo } from "@/lib/agent-registry";

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

/* ── Main Page ── */
export default function AgentCommandPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AgentCategory>("all");
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

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
          // Refresh after short delay
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
    <div className="page-container">
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

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg animate-slide-up"
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
