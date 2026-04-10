"use client";

import { useCallback, useEffect, useState } from "react";
import ScenarioDetail from "./ScenarioDetail";
import ScenarioForm from "./ScenarioForm";

/* ─── Types ─── */
export interface Scenario {
  _id?: string;
  bug_id: string;
  title: string;
  category: string;
  severity: "critical" | "high" | "medium";
  platform: string;
  bug_context?: string;
  fix_commit?: string;
  fix_date?: string;
  source?: string;
  turns: { role: string; message: string }[];
  assertions: {
    forbidden_patterns?: { pattern: string; flags?: string; reason?: string }[];
    required_patterns?: { pattern: string; flags?: string; reason?: string }[];
    expected_tools?: string[];
    forbidden_tools?: string[];
    expect_behavior?: string;
    must_not_do?: string[];
  };
  context_setup?: { prior_messages?: { role: string; content: string }[] };
  active?: boolean;
  retry_on_flaky?: number;
  last_run?: {
    status: string;
    timestamp: string;
    violations_count?: number;
  } | null;
  pass_rate_7d?: number | null;
  created_at?: string;
  updated_at?: string;
}

interface Stats {
  total: number;
  critical: number;
  high: number;
  last_run: {
    _id: string;
    triggered_by: string;
    pass: number;
    fail: number;
    error: number;
    pass_rate: number;
    created_at: string;
  } | null;
  pass_rate_7d: number | null;
  runs_7d: number;
  by_category: { _id: string; count: number }[];
}

const CATEGORIES = [
  { value: "all", label: "ทุกหมวด" },
  { value: "product_knowledge", label: "ความรู้สินค้า" },
  { value: "tone", label: "น้ำเสียง" },
  { value: "flow", label: "Flow" },
  { value: "intent", label: "Intent" },
  { value: "anti_hallucination", label: "Anti-Hallucination" },
  { value: "tool_calling", label: "Tool Calling" },
];

const CAT_COLORS: Record<string, string> = {
  product_knowledge: "bg-blue-900/40 text-blue-400 border-blue-800/40",
  tone: "bg-pink-900/40 text-pink-400 border-pink-800/40",
  flow: "bg-cyan-900/40 text-cyan-400 border-cyan-800/40",
  intent: "bg-purple-900/40 text-purple-400 border-purple-800/40",
  anti_hallucination: "bg-red-900/40 text-red-400 border-red-800/40",
  tool_calling: "bg-amber-900/40 text-amber-400 border-amber-800/40",
};

const SEV_COLORS: Record<string, string> = {
  critical: "bg-red-900/60 text-red-300 border-red-700",
  high: "bg-orange-900/50 text-orange-300 border-orange-700",
  medium: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
};

const STATUS_COLORS: Record<string, string> = {
  pass: "bg-green-900/50 text-green-300 border-green-700",
  fail: "bg-red-900/60 text-red-300 border-red-700",
  error: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  idle: "bg-gray-800/50 text-gray-400 border-gray-700",
};

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// M5: unified pass rate formatter
// รองรับทั้ง ratio (0-1) และ percent (0-100) เพราะ backend return ไม่ consistent:
//   - scenario-level pass_rate_7d = ratio (0-1)
//   - stats-level pass_rate_7d = percent (0-100, integer)
// ถ้า value > 1 ถือว่าเป็น percent แล้ว ไม่ต้อง × 100
function formatPct(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "—";
  const pct = val > 1 ? val : val * 100;
  return `${Math.round(pct)}%`;
}

export default function RegressionTab() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState("all");
  const [filterSev, setFilterSev] = useState("all");
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{
    scenarios_run: number;
    pass: number;
    fail: number;
    error: number;
    pass_rate: number;
  } | null>(null);
  const [selected, setSelected] = useState<Scenario | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Scenario | null>(null);
  // H7: error banner — แสดงเมื่อ auth expired หรือ agent down
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [sRes, stRes] = await Promise.all([
        fetch("/dashboard/api/regression/scenarios"),
        fetch("/dashboard/api/regression/stats"),
      ]);
      if (sRes.status === 401 || stRes.status === 401) {
        setErrorMsg("Session หมดอายุ กรุณา login ใหม่");
        setLoading(false);
        return;
      }
      if (!sRes.ok) {
        setErrorMsg(`โหลด scenarios ไม่สำเร็จ (HTTP ${sRes.status})`);
      } else if (!stRes.ok) {
        setErrorMsg(`โหลด stats ไม่สำเร็จ (HTTP ${stRes.status})`);
      }
      const sData = await sRes.json().catch(() => ({}));
      const stData = await stRes.json().catch(() => ({}));
      setScenarios(sData.scenarios || []);
      setStats(stData || null);
    } catch (err) {
      console.error("[RegressionTab] load error:", err);
      setErrorMsg("ไม่สามารถเชื่อมต่อ server ได้ — ตรวจสอบการเชื่อมต่อ");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = scenarios.filter((s) => {
    if (filterCat !== "all" && s.category !== filterCat) return false;
    if (filterSev !== "all" && s.severity !== filterSev) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !s.title.toLowerCase().includes(q) &&
        !s.bug_id.toLowerCase().includes(q) &&
        !(s.bug_context || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const handleRun = useCallback(
    async (severityFilter?: string[]) => {
      setRunning(true);
      setRunResult(null);
      setErrorMsg(null);
      try {
        const res = await fetch("/dashboard/api/regression/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            severity: severityFilter,
            mode: "report",
          }),
        });
        if (res.status === 401) {
          setErrorMsg("Session หมดอายุ กรุณา login ใหม่");
          setRunning(false);
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setErrorMsg(data.error || `รัน scenarios ไม่สำเร็จ (HTTP ${res.status})`);
          setRunning(false);
          return;
        }
        setRunResult({
          scenarios_run: data.scenarios_run,
          pass: data.pass,
          fail: data.fail,
          error: data.error,
          pass_rate: data.pass_rate,
        });
        await load();
      } catch (err) {
        console.error("[RegressionTab] run error:", err);
        setErrorMsg("ไม่สามารถเชื่อมต่อ server ได้");
      }
      setRunning(false);
    },
    [load]
  );

  const handleExport = useCallback(() => {
    const json = JSON.stringify(scenarios, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `regression-scenarios-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [scenarios]);

  const handleDelete = useCallback(
    async (bugId: string) => {
      if (!confirm(`ลบ scenario ${bugId}? (soft delete — active=false)`)) return;
      setErrorMsg(null);
      try {
        const res = await fetch(`/dashboard/api/regression/scenarios/${bugId}`, {
          method: "DELETE",
        });
        if (res.status === 401) {
          setErrorMsg("Session หมดอายุ กรุณา login ใหม่");
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErrorMsg(data.error || `ลบไม่สำเร็จ (HTTP ${res.status})`);
          return;
        }
        await load();
        setSelected(null);
      } catch (err) {
        console.error("[RegressionTab] delete error:", err);
        setErrorMsg("ไม่สามารถเชื่อมต่อ server ได้");
      }
    },
    [load]
  );

  return (
    <div className="space-y-4">
      {/* H7: Error banner — auth expired / agent down */}
      {errorMsg && (
        <div className="rounded-xl p-3 flex items-center justify-between gap-3 bg-red-900/30 border border-red-700/60 text-red-300">
          <div className="text-sm flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs px-2 py-1 rounded bg-red-900/40 hover:bg-red-900/60"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Scenarios ทั้งหมด"
          value={stats?.total ?? "—"}
          sub={`Active: ${stats?.total ?? 0}`}
          color="text-indigo-400"
        />
        <StatCard
          label="Critical"
          value={stats?.critical ?? "—"}
          sub={`High: ${stats?.high ?? 0}`}
          color="text-red-400"
        />
        <StatCard
          label="Pass rate 7d"
          value={formatPct(stats?.pass_rate_7d)}
          sub={`${stats?.runs_7d || 0} runs`}
          color={
            stats?.pass_rate_7d != null &&
            (stats.pass_rate_7d > 1 ? stats.pass_rate_7d : stats.pass_rate_7d * 100) >= 90
              ? "text-green-400"
              : "text-yellow-400"
          }
        />
        <StatCard
          label="Run ล่าสุด"
          value={
            stats?.last_run
              ? `${stats.last_run.pass}/${stats.last_run.pass + stats.last_run.fail + stats.last_run.error}`
              : "—"
          }
          sub={stats?.last_run ? fmtDate(stats.last_run.created_at) : ""}
          color="text-cyan-400"
        />
      </div>

      {/* Actions */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => {
              setEditTarget(null);
              setShowForm(true);
            }}
            className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium"
          >
            + เพิ่ม Scenario
          </button>
          <button
            onClick={() => handleRun()}
            disabled={running}
            className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {running ? "กำลังรัน..." : "▶ รันทั้งหมด"}
          </button>
          <button
            onClick={() => handleRun(["critical"])}
            disabled={running}
            className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50"
          >
            🚨 Run Critical
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium"
          >
            📥 Export JSON
          </button>
          <button
            onClick={load}
            className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Last run result */}
        {runResult && (
          <div
            className="mt-3 p-3 rounded-lg text-sm"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
          >
            <div className="flex flex-wrap gap-4" style={{ color: "var(--text-primary)" }}>
              <span>Ran: <b>{runResult.scenarios_run}</b></span>
              <span className="text-green-400">Pass: <b>{runResult.pass}</b></span>
              <span className="text-red-400">Fail: <b>{runResult.fail}</b></span>
              <span className="text-yellow-400">Error: <b>{runResult.error}</b></span>
              <span>Pass rate: <b>{runResult.pass_rate}%</b></span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={filterSev}
            onChange={(e) => setFilterSev(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            <option value="all">ทุกระดับ</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
          </select>
          <input
            type="text"
            placeholder="ค้นหา bug_id / title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg text-sm"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        {loading ? (
          <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>
            กำลังโหลด...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>
            ไม่มี scenarios — คลิก &quot;เพิ่ม Scenario&quot; เพื่อสร้างใหม่ หรือรัน{" "}
            <code className="text-indigo-400">node scripts/seed-regression.js</code>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-muted)",
                  }}
                >
                  <th className="text-left p-3 font-medium">Bug ID</th>
                  <th className="text-left p-3 font-medium">Title</th>
                  <th className="text-left p-3 font-medium">Category</th>
                  <th className="text-left p-3 font-medium">Severity</th>
                  <th className="text-left p-3 font-medium">Last run</th>
                  <th className="text-left p-3 font-medium">7d</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.bug_id}
                    onClick={() => setSelected(s)}
                    className="border-t cursor-pointer hover:bg-[var(--bg-hover)]"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  >
                    <td className="p-3 font-mono text-xs">{s.bug_id}</td>
                    <td className="p-3 max-w-[300px] truncate">{s.title}</td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] border ${
                          CAT_COLORS[s.category] || "bg-gray-800 text-gray-400"
                        }`}
                      >
                        {s.category}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] border ${
                          SEV_COLORS[s.severity] || "bg-gray-800 text-gray-400"
                        }`}
                      >
                        {s.severity}
                      </span>
                    </td>
                    <td className="p-3">
                      {s.last_run ? (
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] border ${
                            STATUS_COLORS[s.last_run.status] || STATUS_COLORS.idle
                          }`}
                        >
                          {s.last_run.status}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          ยังไม่รัน
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {formatPct(s.pass_rate_7d)}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditTarget(s);
                          setShowForm(true);
                        }}
                        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                      >
                        แก้
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <ScenarioDetail
          scenario={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditTarget(selected);
            setSelected(null);
            setShowForm(true);
          }}
          onDelete={() => handleDelete(selected.bug_id)}
          onRerun={async () => {
            setRunning(true);
            setErrorMsg(null);
            try {
              const res = await fetch("/dashboard/api/regression/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bug_ids: [selected.bug_id] }),
              });
              if (res.status === 401) {
                setErrorMsg("Session หมดอายุ กรุณา login ใหม่");
              } else if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setErrorMsg(data.error || `รันใหม่ไม่สำเร็จ (HTTP ${res.status})`);
              } else {
                await load();
              }
            } catch (err) {
              console.error("[RegressionTab] rerun error:", err);
              setErrorMsg("ไม่สามารถเชื่อมต่อ server ได้");
            }
            setRunning(false);
          }}
        />
      )}

      {/* Form modal */}
      {showForm && (
        <ScenarioForm
          initial={editTarget}
          onClose={() => {
            setShowForm(false);
            setEditTarget(null);
          }}
          onSaved={async () => {
            setShowForm(false);
            setEditTarget(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && (
        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}
