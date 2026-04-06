"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

/* ─── Types ─── */
interface KBItem {
  _id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  active: boolean;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

interface TrainingLog {
  _id: string;
  message: string;
  reply: string;
  verdict: "pass" | "fail";
  correct_answer?: string;
  notes?: string;
  timestamp: string;
}

interface Stats {
  total: number;
  pass: number;
  fail: number;
  passRate: number;
  kbCount: number;
  topFails: TrainingLog[];
  dailyTrend: { _id: string; total: number; pass: number; fail: number }[];
}

interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
  result?: string;
}

interface KBRef {
  id: string;
  title: string;
  category: string;
}

/* ─── Constants ─── */
const TABS = [
  { id: "test", label: "ทดสอบ AI", icon: "🧪" },
  { id: "kb", label: "ถังข้อมูล", icon: "📚" },
  { id: "auto", label: "Auto-Train", icon: "🤖" },
  { id: "stats", label: "สถิติ", icon: "📊" },
  { id: "logs", label: "ประวัติ", icon: "📝" },
];

const CATEGORIES = [
  { value: "product", label: "สินค้า" },
  { value: "promotion", label: "โปรโมชั่น" },
  { value: "policy", label: "นโยบาย" },
  { value: "faq", label: "คำถามบ่อย" },
  { value: "shipping", label: "จัดส่ง" },
  { value: "payment", label: "ชำระเงิน" },
  { value: "warranty", label: "ประกัน" },
  { value: "claim", label: "เคลม" },
  { value: "general", label: "ทั่วไป" },
];

const CAT_COLORS: Record<string, string> = {
  product: "bg-blue-900/40 text-blue-400",
  promotion: "bg-pink-900/40 text-pink-400",
  policy: "bg-amber-900/40 text-amber-400",
  faq: "bg-purple-900/40 text-purple-400",
  shipping: "bg-green-900/40 text-green-400",
  payment: "bg-cyan-900/40 text-cyan-400",
  warranty: "bg-yellow-900/40 text-yellow-400",
  claim: "bg-red-900/40 text-red-400",
  general: "bg-gray-700/40 text-gray-400",
};

/* ─── Helpers ─── */
function catLabel(val: string) {
  return CATEGORIES.find((c) => c.value === val)?.label || val;
}
function catColor(val: string) {
  return CAT_COLORS[val] || CAT_COLORS.general;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ═══════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════ */
export default function TrainPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState("test");

  useEffect(() => {
    if (authStatus === "unauthenticated") router.replace("/login");
  }, [authStatus, router]);

  if (authStatus === "loading") {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1
          className="text-xl md:text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Training Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          ทดสอบ AI / จัดการ KB / ดูสถิติ
        </p>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 p-1 rounded-xl"
        style={{ background: "var(--bg-secondary)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "hover:bg-[var(--bg-hover)]"
            }`}
            style={tab !== t.id ? { color: "var(--text-secondary)" } : undefined}
          >
            <span>{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "test" && <TestTab />}
      {tab === "kb" && <KBTab />}
      {tab === "auto" && <AutoTrainTab />}
      {tab === "stats" && <StatsTab />}
      {tab === "logs" && <LogsTab />}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Tab 1: ทดสอบ AI
   ═══════════════════════════════════════════ */
function TestTab() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [toolsCalled, setToolsCalled] = useState<ToolCall[]>([]);
  const [kbUsed, setKbUsed] = useState<KBRef[]>([]);
  const [showJudge, setShowJudge] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [notes, setNotes] = useState("");
  const [judging, setJudging] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genQuestions, setGenQuestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleTest = useCallback(async () => {
    if (!message.trim() || loading) return;
    setLoading(true);
    setReply("");
    setToolsCalled([]);
    setKbUsed([]);
    setShowJudge(false);
    setCorrectAnswer("");
    setNotes("");
    try {
      const res = await fetch("/dashboard/api/train/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      const data = await res.json();
      setReply(data.reply || "ไม่มีคำตอบ");
      setToolsCalled(data.tools_called || []);
      setKbUsed(data.kb_used || []);
      setShowJudge(true);
    } catch (e: any) {
      setReply(`Error: ${e.message}`);
    }
    setLoading(false);
  }, [message, loading]);

  const handleJudge = useCallback(
    async (verdict: "pass" | "fail") => {
      setJudging(true);
      try {
        await fetch("/dashboard/api/train/judge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            reply,
            verdict,
            correct_answer: verdict === "fail" ? correctAnswer : undefined,
            notes: notes || undefined,
          }),
        });
        // Reset
        setShowJudge(false);
        setMessage("");
        setReply("");
        setToolsCalled([]);
        setKbUsed([]);
        setCorrectAnswer("");
        setNotes("");
        inputRef.current?.focus();
      } catch {}
      setJudging(false);
    },
    [message, reply, correctAnswer, notes]
  );

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch("/dashboard/api/train/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setGenQuestions(data.questions || []);
    } catch {}
    setGenerating(false);
  }, []);

  return (
    <div className="space-y-4">
      {/* Input */}
      <Card>
        <div className="space-y-3">
          <label
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            คำถามที่ต้องการทดสอบ
          </label>
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="พิมพ์คำถามเหมือนลูกค้าจริง เช่น 'กล่องข้างราคาเท่าไหร่'"
            rows={3}
            className="w-full rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleTest();
              }
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={loading || !message.trim()}
              className="flex-1 py-2.5 rounded-lg font-medium text-sm transition disabled:opacity-50 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  กำลังทดสอบ...
                </span>
              ) : (
                "ส่งทดสอบ"
              )}
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="py-2.5 px-4 rounded-lg text-sm font-medium transition disabled:opacity-50"
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              {generating ? "กำลังสร้าง..." : "สุ่มคำถาม"}
            </button>
          </div>
        </div>
      </Card>

      {/* Generated questions */}
      {genQuestions.length > 0 && (
        <Card>
          <h3
            className="text-sm font-medium mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            คำถามที่สร้างโดย AI ({genQuestions.length} ข้อ)
          </h3>
          <div className="flex flex-wrap gap-2">
            {genQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => {
                  setMessage(q);
                  inputRef.current?.focus();
                }}
                className="text-xs py-1.5 px-3 rounded-full transition hover:scale-105"
                style={{
                  background: "var(--bg-primary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Reply */}
      {reply && (
        <Card>
          <h3
            className="text-sm font-medium mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            คำตอบ AI
          </h3>
          <div
            className="p-4 rounded-lg text-sm whitespace-pre-wrap leading-relaxed"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            {reply}
          </div>

          {/* Tools + KB info */}
          {(toolsCalled.length > 0 || kbUsed.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {toolsCalled.map((t, i) => (
                <span
                  key={i}
                  className="text-[11px] px-2 py-1 rounded-full bg-emerald-900/30 text-emerald-400"
                >
                  Tool: {t.name}
                </span>
              ))}
              {kbUsed.map((k, i) => (
                <span
                  key={i}
                  className="text-[11px] px-2 py-1 rounded-full bg-blue-900/30 text-blue-400"
                >
                  KB: {k.title}
                </span>
              ))}
            </div>
          )}

          {/* Judge */}
          {showJudge && (
            <div className="mt-4 space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => handleJudge("pass")}
                  disabled={judging}
                  className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
                >
                  ถูกต้อง
                </button>
                <button
                  onClick={() => {
                    if (correctAnswer) handleJudge("fail");
                    else
                      document
                        .getElementById("correct-answer-input")
                        ?.focus();
                  }}
                  disabled={judging}
                  className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50"
                >
                  ผิด
                </button>
              </div>

              <div className="space-y-2">
                <textarea
                  id="correct-answer-input"
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  placeholder="(ถ้าผิด) คำตอบที่ถูกต้อง — จะบันทึกเข้า KB อัตโนมัติ"
                  rows={2}
                  className="w-full rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="หมายเหตุ (ไม่บังคับ)"
                  className="w-full rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Tab 2: ถังข้อมูล (KB)
   ═══════════════════════════════════════════ */
function KBTab() {
  const [items, setItems] = useState<KBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<KBItem | null>(null);

  // Form state
  const [fTitle, setFTitle] = useState("");
  const [fContent, setFContent] = useState("");
  const [fCategory, setFCategory] = useState("general");
  const [fTags, setFTags] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchKB = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterCat !== "all") params.set("category", filterCat);
      const res = await fetch(`/dashboard/api/train/kb?${params}`);
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch {}
    setLoading(false);
  }, [search, filterCat]);

  useEffect(() => {
    fetchKB();
  }, [fetchKB]);

  const openForm = (item?: KBItem) => {
    if (item) {
      setEditItem(item);
      setFTitle(item.title);
      setFContent(item.content);
      setFCategory(item.category);
      setFTags(item.tags?.join(", ") || "");
    } else {
      setEditItem(null);
      setFTitle("");
      setFContent("");
      setFCategory("general");
      setFTags("");
    }
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!fTitle.trim() || !fContent.trim()) return;
    setSaving(true);
    try {
      if (editItem) {
        await fetch(`/dashboard/api/train/kb/${editItem._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: fTitle,
            content: fContent,
            category: fCategory,
            tags: fTags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          }),
        });
      } else {
        await fetch("/dashboard/api/train/kb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: fTitle,
            content: fContent,
            category: fCategory,
            tags: fTags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          }),
        });
      }
      setShowForm(false);
      fetchKB();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("ลบข้อมูลนี้?")) return;
    await fetch(`/dashboard/api/train/kb/${id}`, { method: "DELETE" });
    fetchKB();
  };

  const handleExport = () => {
    const csv = [
      "title,content,category,tags",
      ...items.map(
        (i) =>
          `"${i.title.replace(/"/g, '""')}","${i.content.replace(/"/g, '""')}","${i.category}","${(i.tags || []).join(";")}"`
      ),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kb_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split("\n").slice(1); // skip header
    let imported = 0;
    for (const line of lines) {
      const match = line.match(/"([^"]*(?:""[^"]*)*)","([^"]*(?:""[^"]*)*)","([^"]*)","([^"]*)"/);
      if (match) {
        const [, title, content, category, tags] = match;
        await fetch("/dashboard/api/train/kb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.replace(/""/g, '"'),
            content: content.replace(/""/g, '"'),
            category: category || "general",
            tags: tags ? tags.split(";") : [],
          }),
        });
        imported++;
      }
    }
    alert(`นำเข้า ${imported} รายการสำเร็จ`);
    fetchKB();
    e.target.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา KB..."
            className="flex-1 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="rounded-lg p-2.5 text-sm focus:outline-none"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            <option value="all">ทุกหมวด</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => openForm()}
              className="py-2 px-4 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition"
            >
              + เพิ่ม KB
            </button>
            <button
              onClick={handleExport}
              className="py-2 px-3 rounded-lg text-sm transition"
              style={{
                background: "var(--bg-primary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              Export
            </button>
            <label className="py-2 px-3 rounded-lg text-sm cursor-pointer transition hover:bg-[var(--bg-hover)]"
              style={{
                background: "var(--bg-primary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              Import
              <input
                type="file"
                accept=".csv"
                onChange={handleImport}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </Card>

      {/* KB Form modal */}
      {showForm && (
        <Card>
          <h3
            className="text-sm font-semibold mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            {editItem ? "แก้ไข KB" : "เพิ่ม KB ใหม่"}
          </h3>
          <div className="space-y-3">
            <input
              value={fTitle}
              onChange={(e) => setFTitle(e.target.value)}
              placeholder="หัวข้อ"
              className="w-full rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
            <textarea
              value={fContent}
              onChange={(e) => setFContent(e.target.value)}
              placeholder="เนื้อหา (เขียนให้ AI อ่านแล้วเข้าใจ)"
              rows={4}
              className="w-full rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
            <div className="flex gap-3">
              <select
                value={fCategory}
                onChange={(e) => setFCategory(e.target.value)}
                className="rounded-lg p-2.5 text-sm focus:outline-none"
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
              <input
                value={fTags}
                onChange={(e) => setFTags(e.target.value)}
                placeholder="แท็ก (คั่นด้วย ,)"
                className="flex-1 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowForm(false)}
                className="py-2 px-4 rounded-lg text-sm transition"
                style={{ color: "var(--text-secondary)" }}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !fTitle.trim() || !fContent.trim()}
                className="py-2 px-4 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* KB List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <p
            className="text-center text-sm py-8"
            style={{ color: "var(--text-muted)" }}
          >
            ไม่พบข้อมูล KB
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            ทั้งหมด {items.length} รายการ
          </p>
          {items.map((item) => (
            <Card key={item._id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${catColor(item.category)}`}
                    >
                      {catLabel(item.category)}
                    </span>
                    {item.source === "training_dashboard" && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-900/30 text-indigo-400">
                        training
                      </span>
                    )}
                  </div>
                  <h4
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {item.title}
                  </h4>
                  <p
                    className="text-xs mt-1 line-clamp-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {item.content}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {item.tags?.map((t, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{
                          background: "var(--bg-primary)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                    <span
                      className="text-[10px] ml-auto"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {fmtDate(item.updatedAt)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => openForm(item)}
                    className="text-xs px-2 py-1 rounded transition hover:bg-[var(--bg-hover)]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    แก้ไข
                  </button>
                  <button
                    onClick={() => handleDelete(item._id)}
                    className="text-xs px-2 py-1 rounded transition hover:bg-red-900/20 text-red-400"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Tab: Auto-Train (Gemini สร้าง+ทดสอบ+fix KB อัตโนมัติ)
   ═══════════════════════════════════════════ */
function AutoTrainTab() {
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(10);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const runAutoTrain = async () => {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/dashboard/api/train/auto-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
          Auto-Train — Gemini สร้างคำถาม + ทดสอบ + แก้ KB อัตโนมัติ
        </h3>
        <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
          Gemini อ่าน KB จริง → สร้างคำถามจำลองลูกค้า → AI ตอบ → Gemini Judge ตัดสิน → ข้อที่ผิดเพิ่ม KB อัตโนมัติ (ฟรี)
        </p>

        <div className="flex items-center gap-3 mb-4">
          <label className="text-xs" style={{ color: "var(--text-secondary)" }}>จำนวนคำถาม:</label>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="rounded px-2 py-1 text-sm"
            style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
          >
            <option value={5}>5 ข้อ (~1 นาที)</option>
            <option value={10}>10 ข้อ (~2 นาที)</option>
            <option value={20}>20 ข้อ (~4 นาที)</option>
            <option value={30}>30 ข้อ (~6 นาที)</option>
          </select>

          <button
            onClick={runAutoTrain}
            disabled={running}
            className="px-4 py-2 rounded text-sm font-semibold text-white"
            style={{ background: running ? "var(--border-primary)" : "#8b5cf6" }}
          >
            {running ? "กำลังเทรน..." : "เริ่ม Auto-Train"}
          </button>
        </div>

        {running && (
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            <div className="animate-spin w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full" />
            Gemini กำลังสร้างคำถาม + ทดสอบ AI + แก้ KB... รอสักครู่
          </div>
        )}

        {error && (
          <div className="p-3 rounded text-sm" style={{ background: "#450a0a", color: "#f87171" }}>
            {error}
          </div>
        )}
      </Card>

      {result && (
        <>
          {/* Score Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "สร้าง", value: result.generated, color: "#60a5fa" },
              { label: "ทดสอบ", value: result.tested, color: "#a78bfa" },
              { label: "ผ่าน", value: result.passed, color: "#34d399" },
              { label: "ไม่ผ่าน", value: result.failed, color: "#f87171" },
              { label: "KB เพิ่ม", value: result.kb_added, color: "#fbbf24" },
            ].map((s) => (
              <Card key={s.label}>
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{s.label}</div>
                </div>
              </Card>
            ))}
          </div>

          {/* Score Bar */}
          <Card>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Score: {result.score}%
              </span>
              <div className="flex-1 h-3 rounded-full" style={{ background: "var(--bg-primary)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${result.score || 0}%`,
                    background: (result.score || 0) >= 90 ? "#34d399" : (result.score || 0) >= 70 ? "#fbbf24" : "#f87171",
                  }}
                />
              </div>
            </div>
          </Card>

          {/* Details */}
          {result.details && result.details.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                รายละเอียด ({result.details.length} ข้อ)
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {result.details.map((d: any, i: number) => (
                  <div
                    key={i}
                    className="p-2 rounded text-xs"
                    style={{
                      background: d.verdict === "pass" ? "#064e3b22" : "#450a0a22",
                      border: `1px solid ${d.verdict === "pass" ? "#10b981" : "#dc2626"}33`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{d.verdict === "pass" ? "✅" : "❌"}</span>
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {d.question}
                      </span>
                    </div>
                    {d.reply && (
                      <div style={{ color: "var(--text-secondary)" }}>
                        AI: {d.reply.substring(0, 150)}...
                      </div>
                    )}
                    {d.reason && (
                      <div className="mt-1" style={{ color: d.verdict === "pass" ? "#34d399" : "#f87171" }}>
                        {d.reason}
                      </div>
                    )}
                    {d.verdict === "fail" && (
                      <div className="mt-2">
                        <FixAnswerButton question={d.question} currentAnswer={d.expected} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Tab 3: สถิติ
   ═══════════════════════════════════════════ */
function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/dashboard/api/train/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  const maxDailyTotal = Math.max(...(stats.dailyTrend?.map((d) => d.total) || [1]), 1);

  return (
    <div className="space-y-4">
      {/* Score Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ScoreCard
          label="ทดสอบทั้งหมด"
          value={stats.total}
          color="text-indigo-400"
        />
        <ScoreCard
          label="ผ่าน"
          value={`${stats.passRate}%`}
          sub={`${stats.pass} ข้อ`}
          color="text-emerald-400"
        />
        <ScoreCard
          label="ไม่ผ่าน"
          value={stats.fail}
          color="text-red-400"
        />
        <ScoreCard
          label="KB ทั้งหมด"
          value={stats.kbCount}
          color="text-blue-400"
        />
      </div>

      {/* Daily Trend Chart */}
      {stats.dailyTrend && stats.dailyTrend.length > 0 && (
        <Card>
          <h3
            className="text-sm font-semibold mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            แนวโน้มรายวัน (14 วัน)
          </h3>
          <div className="flex items-end gap-1 h-32">
            {stats.dailyTrend.map((d) => {
              const passH = (d.pass / maxDailyTotal) * 100;
              const failH = (d.fail / maxDailyTotal) * 100;
              return (
                <div
                  key={d._id}
                  className="flex-1 flex flex-col items-center gap-0.5"
                >
                  <div className="w-full flex flex-col items-center">
                    <div
                      className="w-full rounded-t bg-red-500/60"
                      style={{ height: `${failH}%`, minHeight: d.fail > 0 ? 4 : 0 }}
                    />
                    <div
                      className="w-full rounded-b bg-emerald-500/60"
                      style={{ height: `${passH}%`, minHeight: d.pass > 0 ? 4 : 0 }}
                    />
                  </div>
                  <span
                    className="text-[8px] mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {d._id.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-4 mt-3">
            <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span className="w-2 h-2 rounded-full bg-emerald-500/60" /> ผ่าน
            </span>
            <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span className="w-2 h-2 rounded-full bg-red-500/60" /> ไม่ผ่าน
            </span>
          </div>
        </Card>
      )}

      {/* Top Fails */}
      {stats.topFails && stats.topFails.length > 0 && (
        <Card>
          <h3
            className="text-sm font-semibold mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            คำถามที่ AI ตอบผิดล่าสุด
          </h3>
          <div className="space-y-2">
            {stats.topFails.map((f, i) => (
              <div
                key={f._id || i}
                className="p-3 rounded-lg"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {f.message}
                </p>
                <p className="text-xs mt-1 text-red-400">
                  AI: {(f.reply || "").substring(0, 100)}
                </p>
                {f.correct_answer && (
                  <p className="text-xs mt-1 text-emerald-400">
                    ถูก: {f.correct_answer.substring(0, 100)}
                  </p>
                )}
                <p
                  className="text-[10px] mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {fmtDate(f.timestamp)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Shared: FixAnswerButton — แก้คำตอบที่ผิด + บันทึก KB
   ═══════════════════════════════════════════ */
function FixAnswerButton({ logId, question, currentAnswer }: { logId?: string; question: string; currentAnswer?: string }) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState(currentAnswer || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (saved) {
    return <span className="text-xs text-emerald-400 font-medium">KB updated</span>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 rounded hover:bg-amber-900/30 transition-colors"
        style={{ color: "#fbbf24", border: "1px solid #fbbf2444" }}
      >
        แก้คำตอบ
      </button>
    );
  }

  const handleSave = async () => {
    if (!answer.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/dashboard/api/train/fix-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_id: logId, correct_answer: answer.trim(), question }),
      });
      const data = await res.json();
      if (data.success || data.kb_id) {
        setSaved(true);
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="พิมพ์คำตอบที่ถูกต้อง..."
        rows={3}
        className="w-full rounded-lg p-2 text-xs resize-none"
        style={{
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-primary)",
        }}
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !answer.trim()}
          className="px-3 py-1 rounded text-xs font-semibold text-white"
          style={{ background: saving ? "var(--border-primary)" : "#10b981" }}
        >
          {saving ? "กำลังบันทึก..." : "บันทึก KB"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-1 rounded text-xs"
          style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Tab 4: ประวัติ Training Logs
   ═══════════════════════════════════════════ */
function LogsTab() {
  const [logs, setLogs] = useState<TrainingLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/dashboard/api/train/logs?limit=100")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setLogs(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <p
          className="text-center text-sm py-8"
          style={{ color: "var(--text-muted)" }}
        >
          ยังไม่มีประวัติ — ลองทดสอบ AI แล้วตัดสินผลก่อน
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        ทั้งหมด {logs.length} รายการ
      </p>
      {logs.map((log) => (
        <Card key={log._id}>
          <div className="flex items-start gap-3">
            <span
              className={`text-lg mt-0.5 ${
                log.verdict === "pass" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {log.verdict === "pass" ? "O" : "X"}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {log.message}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                AI: {(log.reply || "").substring(0, 120)}
              </p>
              {log.correct_answer && (
                <p className="text-xs mt-1 text-emerald-400">
                  คำตอบที่ถูก: {log.correct_answer.substring(0, 120)}
                </p>
              )}
              {log.notes && (
                <p
                  className="text-xs mt-1 italic"
                  style={{ color: "var(--text-muted)" }}
                >
                  หมายเหตุ: {log.notes}
                </p>
              )}
              <div className="flex items-center gap-3 mt-1">
                <p
                  className="text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {fmtDate(log.timestamp)}
                </p>
                {log.verdict === "fail" && (
                  <FixAnswerButton logId={log._id} question={log.message} currentAnswer={log.correct_answer} />
                )}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Shared Components
   ═══════════════════════════════════════════ */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      {children}
    </div>
  );
}

function ScoreCard({
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
    <Card>
      <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && (
        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          {sub}
        </p>
      )}
    </Card>
  );
}
