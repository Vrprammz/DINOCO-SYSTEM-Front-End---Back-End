"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/* ── Types ── */
interface BossAction {
  type: string;
  ruleType?: string;
  title?: string;
  instruction?: string;
  priority?: number;
  templateId?: string;
  newMessage?: string;
}

interface AnalysisResult {
  commandId: string;
  understanding: string;
  actions: BossAction[];
  warnings: string[];
  confirmMessage: string;
}

interface AIRule {
  _id: string;
  ruleId: string;
  type: string;
  title: string;
  instruction: string;
  priority: number;
  active: boolean;
  createdAt: string;
}

interface MessageTemplate {
  _id: string;
  templateId: string;
  message: string;
  defaultMessage?: string;
  active: boolean;
  updatedAt?: string;
}

interface BossCommand {
  _id: string;
  commandId: string;
  input: string;
  hasImage: boolean;
  status: string;
  analysis?: { understanding?: string; actions?: BossAction[] };
  executedActions?: { action: string; result?: string; error?: string }[];
  createdAt: string;
  executedAt?: string;
}

type TabKey = "command" | "rules" | "templates" | "history";

/* ── Helpers ── */
function formatTime(iso?: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const RULE_TYPE_MAP: Record<string, { label: string; color: string }> = {
  speech_rule: { label: "การพูด", color: "#60a5fa" },
  content_rule: { label: "เนื้อหา", color: "#4ade80" },
  workflow_rule: { label: "Workflow", color: "#fbbf24" },
  tone_rule: { label: "น้ำเสียง", color: "#c084fc" },
};

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "command", label: "คำสั่ง", icon: "command" },
  { key: "rules", label: "กฎ AI", icon: "rules" },
  { key: "templates", label: "Templates", icon: "templates" },
  { key: "history", label: "ประวัติ", icon: "history" },
];

const QUICK_SUGGESTIONS = [
  "ห้ามบอกว่าเป็น AI",
  "ลดการใช้ emoji",
  "ตอบสั้นลงอีก",
  "เพิ่มความเป็นมิตร",
  "แก้ KB เรื่องกล่องอลูมิเนียม",
  "แก้ข้อความเคลมให้สุภาพขึ้น",
];

const RULE_FILTERS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "speech_rule", label: "การพูด" },
  { key: "content_rule", label: "เนื้อหา" },
  { key: "workflow_rule", label: "Workflow" },
  { key: "tone_rule", label: "น้ำเสียง" },
];

/* ── Main Page ── */
export default function BossCommandPage() {
  const [tab, setTab] = useState<TabKey>("command");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Command tab state
  const [commandInput, setCommandInput] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Rules tab state
  const [rules, setRules] = useState<AIRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [ruleFilter, setRuleFilter] = useState("all");

  // Templates tab state
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState("");

  // History tab state
  const [history, setHistory] = useState<BossCommand[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Paste handler for images
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) handleFile(file);
        }
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, []);

  function handleFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setToast({ msg: "ไฟล์ใหญ่เกิน 10MB", type: "error" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      setImageBase64(base64);
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    handleFile(files[0]);
  }

  // === Command Tab ===
  const handleAnalyze = useCallback(async () => {
    if (!commandInput.trim() && !imageBase64) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await fetch("/dashboard/api/boss-command/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: commandInput.trim(), imageBase64 }),
      });
      const data = await res.json();
      if (data.ok || data.commandId) {
        setAnalysis(data as AnalysisResult);
      } else {
        setToast({ msg: data.error || "วิเคราะห์ไม่สำเร็จ", type: "error" });
      }
    } catch {
      setToast({ msg: "ไม่สามารถเชื่อมต่อได้", type: "error" });
    } finally {
      setAnalyzing(false);
    }
  }, [commandInput, imageBase64]);

  const handleExecute = useCallback(async () => {
    if (!analysis?.commandId) return;
    setExecuting(true);
    try {
      const res = await fetch("/dashboard/api/boss-command/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandId: analysis.commandId }),
      });
      const data = await res.json();
      if (data.ok) {
        setToast({ msg: data.message || "ดำเนินการสำเร็จ", type: "success" });
        setAnalysis(null);
        setCommandInput("");
        setImageBase64(null);
        setImagePreview(null);
      } else {
        setToast({ msg: data.error || "เกิดข้อผิดพลาด", type: "error" });
      }
    } catch {
      setToast({ msg: "ไม่สามารถเชื่อมต่อได้", type: "error" });
    } finally {
      setExecuting(false);
    }
  }, [analysis]);

  // === Rules Tab ===
  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const res = await fetch("/dashboard/api/boss-command/rules");
      const data = await res.json();
      setRules(data.rules || []);
    } catch {} finally { setRulesLoading(false); }
  }, []);

  const toggleRule = useCallback(async (ruleId: string, currentActive: boolean) => {
    try {
      await fetch(`/dashboard/api/boss-command/rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !currentActive }),
      });
      setRules(prev => prev.map(r => r.ruleId === ruleId ? { ...r, active: !currentActive } : r));
      setToast({ msg: !currentActive ? "เปิดกฎแล้ว" : "ปิดกฎแล้ว", type: "success" });
    } catch {
      setToast({ msg: "แก้ไขไม่สำเร็จ", type: "error" });
    }
  }, []);

  const deleteRule = useCallback(async (ruleId: string) => {
    if (!confirm("ลบกฎนี้หรือไม่")) return;
    try {
      await fetch(`/dashboard/api/boss-command/rules/${ruleId}`, { method: "DELETE" });
      setRules(prev => prev.filter(r => r.ruleId !== ruleId));
      setToast({ msg: "ลบกฎแล้ว", type: "success" });
    } catch {
      setToast({ msg: "ลบไม่สำเร็จ", type: "error" });
    }
  }, []);

  // === Templates Tab ===
  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch("/dashboard/api/boss-command/templates");
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch {} finally { setTemplatesLoading(false); }
  }, []);

  const saveTemplate = useCallback(async (templateId: string, message: string) => {
    try {
      await fetch(`/dashboard/api/boss-command/templates/${templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      setTemplates(prev => prev.map(t => t.templateId === templateId ? { ...t, message } : t));
      setEditingTemplate(null);
      setToast({ msg: "บันทึกแล้ว", type: "success" });
    } catch {
      setToast({ msg: "บันทึกไม่สำเร็จ", type: "error" });
    }
  }, []);

  const resetTemplate = useCallback(async (templateId: string, defaultMessage?: string) => {
    if (!defaultMessage) return;
    await saveTemplate(templateId, defaultMessage);
  }, [saveTemplate]);

  // === History Tab ===
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/dashboard/api/boss-command/history");
      const data = await res.json();
      setHistory(data.history || []);
    } catch {} finally { setHistoryLoading(false); }
  }, []);

  // Load data when tab changes
  useEffect(() => {
    if (tab === "rules") loadRules();
    if (tab === "templates") loadTemplates();
    if (tab === "history") loadHistory();
  }, [tab, loadRules, loadTemplates, loadHistory]);

  const filteredRules = ruleFilter === "all" ? rules : rules.filter(r => r.type === ruleFilter);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <h1 className="text-lg font-bold gradient-text flex items-center gap-2">
          <span className="text-xl">{"\u{1F451}"}</span>
          AI Boss Command
        </h1>
        <p className="text-[11px] theme-text-muted mt-0.5">
          สั่งหัวหน้า AI จาก Dashboard -- สร้างกฎ แก้ KB แก้ข้อความ
        </p>
      </div>

      <div className="page-content">
        {/* Tabs */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-4">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all"
              style={{
                background: tab === t.key ? "var(--primary-bg)" : "var(--bg-card)",
                color: tab === t.key ? "var(--primary)" : "var(--text-secondary)",
                border: `1px solid ${tab === t.key ? "rgba(255,107,0,0.2)" : "var(--border)"}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Command */}
        {tab === "command" && (
          <div className="space-y-4">
            {/* Quick suggestions */}
            <div className="flex gap-1.5 flex-wrap">
              {QUICK_SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setCommandInput(s)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-medium transition-all"
                  style={{
                    background: "var(--primary-bg)",
                    color: "var(--primary)",
                    border: "1px solid rgba(255,107,0,0.15)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Image drop zone */}
            <div
              className="glass-card rounded-xl p-4 transition-all"
              style={{
                border: dragOver ? "2px dashed var(--primary)" : "1px solid var(--border)",
                background: dragOver ? "rgba(255,107,0,0.05)" : undefined,
              }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            >
              {imagePreview ? (
                <div className="relative inline-block">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="rounded-lg"
                    style={{ maxHeight: "200px", objectFit: "contain" }}
                  />
                  <button
                    onClick={() => { setImageBase64(null); setImagePreview(null); }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: "rgba(248,113,113,0.9)", color: "white" }}
                  >
                    x
                  </button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs theme-text-muted">
                    ลากรูปมาวางที่นี่ หรือ วาง (Ctrl+V) หรือ
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="ml-1 font-medium"
                      style={{ color: "var(--primary)" }}
                    >
                      เลือกไฟล์
                    </button>
                  </p>
                  <p className="text-[10px] theme-text-muted mt-1">รองรับ JPG, PNG ไม่เกิน 10MB</p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                ref={fileRef}
                onChange={e => handleFiles(e.target.files)}
                hidden
              />
            </div>

            {/* Command input */}
            <div className="flex gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="px-3 py-2 rounded-lg text-sm flex-shrink-0"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                title="แนบรูป"
              >
                {"\u{1F4CE}"}
              </button>
              <input
                type="text"
                value={commandInput}
                onChange={e => setCommandInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !analyzing) handleAnalyze(); }}
                placeholder="สั่ง AI หัวหน้า เช่น 'ห้ามใช้ emoji มากกว่า 1 ตัว'"
                disabled={analyzing}
                className="flex-1 px-3 py-2 rounded-lg text-xs theme-text"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              />
              <button
                onClick={handleAnalyze}
                disabled={analyzing || (!commandInput.trim() && !imageBase64)}
                className="px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50 flex-shrink-0"
                style={{ background: "var(--primary-bg)", color: "var(--primary)", border: "1px solid rgba(255,107,0,0.2)" }}
              >
                {analyzing ? "กำลังวิเคราะห์..." : "ส่งคำสั่ง"}
              </button>
            </div>

            {/* Analysis result */}
            {analysis && (
              <div className="glass-card rounded-xl p-4 space-y-3 animate-fade-in" style={{ border: "1px solid rgba(255,107,0,0.15)" }}>
                {/* Confirm message (แสดงก่อน — สำคัญสุด) */}
                {analysis.confirmMessage && (
                  <div className="p-3 rounded-lg" style={{ background: "rgba(255,107,0,0.06)", borderLeft: "3px solid var(--primary)" }}>
                    <p className="text-sm theme-text whitespace-pre-wrap">{analysis.confirmMessage}</p>
                  </div>
                )}

                {/* Understanding */}
                {analysis.understanding && (
                <div>
                  <h3 className="text-[11px] font-semibold theme-text-secondary mb-1">สิ่งที่เข้าใจ</h3>
                  <p className="text-xs theme-text">{analysis.understanding}</p>
                </div>
                )}

                {/* Actions */}
                {analysis.actions && analysis.actions.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-semibold theme-text-secondary mb-1">แผนปฏิบัติ ({analysis.actions.length} รายการ)</h3>
                    <div className="space-y-1.5">
                      {analysis.actions.map((a, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] px-2.5 py-1.5 rounded-lg" style={{ background: "var(--bg-primary)" }}>
                          <span className="font-mono px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0" style={{ background: "rgba(255,107,0,0.1)", color: "var(--primary)" }}>
                            {a.type}
                          </span>
                          <span className="theme-text">{a.title || a.instruction || a.templateId}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {analysis.warnings && analysis.warnings.length > 0 && (
                  <div>
                    {analysis.warnings.map((w, i) => (
                      <p key={i} className="text-[11px] px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24" }}>
                        {w}
                      </p>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleExecute}
                    disabled={executing}
                    className="flex-1 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
                    style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)" }}
                  >
                    {executing ? "กำลังดำเนินการ..." : "ยืนยัน"}
                  </button>
                  <button
                    onClick={() => setAnalysis(null)}
                    className="flex-1 py-2 rounded-lg text-xs font-medium"
                    style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Rules */}
        {tab === "rules" && (
          <div className="space-y-3">
            {/* Filter */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {RULE_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setRuleFilter(f.key)}
                  className="px-3 py-1.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-all"
                  style={{
                    background: ruleFilter === f.key ? "var(--primary-bg)" : "var(--bg-card)",
                    color: ruleFilter === f.key ? "var(--primary)" : "var(--text-secondary)",
                    border: `1px solid ${ruleFilter === f.key ? "rgba(255,107,0,0.2)" : "var(--border)"}`,
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {rulesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="glass-card rounded-xl p-4 animate-pulse" style={{ height: "100px" }} />)}
              </div>
            ) : filteredRules.length === 0 ? (
              <div className="text-center py-12 glass-card rounded-xl">
                <p className="text-sm theme-text-muted">ยังไม่มีกฎเพิ่มเติม</p>
                <p className="text-[11px] theme-text-muted mt-1">ลองสั่ง AI หัวหน้าในแท็บ "คำสั่ง" ค่ะ</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredRules.map(rule => {
                  const typeInfo = RULE_TYPE_MAP[rule.type] || { label: rule.type, color: "#71717a" };
                  return (
                    <div key={rule.ruleId} className="glass-card rounded-xl p-4 animate-fade-in">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span
                            className="text-[9px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: `${typeInfo.color}15`, color: typeInfo.color }}
                          >
                            {typeInfo.label}
                          </span>
                          <h3 className="text-xs font-semibold theme-text truncate">{rule.title}</h3>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-[9px] theme-text-muted">P{rule.priority}</span>
                          {/* Toggle */}
                          <button
                            onClick={() => toggleRule(rule.ruleId, rule.active)}
                            className="w-8 h-4 rounded-full relative transition-all"
                            style={{ background: rule.active ? "rgba(74,222,128,0.3)" : "rgba(113,113,122,0.3)" }}
                          >
                            <span
                              className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                              style={{
                                background: rule.active ? "#4ade80" : "#71717a",
                                left: rule.active ? "calc(100% - 14px)" : "2px",
                              }}
                            />
                          </button>
                          <button
                            onClick={() => deleteRule(rule.ruleId)}
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(248,113,113,0.1)", color: "#f87171" }}
                          >
                            ลบ
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] theme-text-secondary">{rule.instruction}</p>
                      <p className="text-[9px] theme-text-muted mt-1.5">{formatTime(rule.createdAt)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab: Templates */}
        {tab === "templates" && (
          <div className="space-y-3">
            {templatesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="glass-card rounded-xl p-4 animate-pulse" style={{ height: "80px" }} />)}
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12 glass-card rounded-xl">
                <p className="text-sm theme-text-muted">ยังไม่มี Message Template</p>
                <p className="text-[11px] theme-text-muted mt-1">Template จะถูกสร้างเมื่อ AI ใช้ข้อความ hardcoded เป็นครั้งแรก หรือสั่งผ่าน Boss Command</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {templates.map(tpl => (
                  <div key={tpl.templateId} className="glass-card rounded-xl p-4 animate-fade-in">
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ background: "var(--bg-primary)", color: "var(--primary)" }}>
                        {tpl.templateId}
                      </span>
                      <div className="flex gap-1.5">
                        {editingTemplate === tpl.templateId ? (
                          <>
                            <button
                              onClick={() => saveTemplate(tpl.templateId, editingMessage)}
                              className="text-[10px] px-2 py-0.5 rounded font-medium"
                              style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80" }}
                            >
                              บันทึก
                            </button>
                            <button
                              onClick={() => setEditingTemplate(null)}
                              className="text-[10px] px-2 py-0.5 rounded font-medium"
                              style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}
                            >
                              ยกเลิก
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => { setEditingTemplate(tpl.templateId); setEditingMessage(tpl.message); }}
                              className="text-[10px] px-2 py-0.5 rounded font-medium"
                              style={{ background: "var(--primary-bg)", color: "var(--primary)" }}
                            >
                              แก้ไข
                            </button>
                            {tpl.defaultMessage && tpl.message !== tpl.defaultMessage && (
                              <button
                                onClick={() => resetTemplate(tpl.templateId, tpl.defaultMessage)}
                                className="text-[10px] px-2 py-0.5 rounded font-medium"
                                style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}
                              >
                                รีเซ็ต
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {editingTemplate === tpl.templateId ? (
                      <textarea
                        value={editingMessage}
                        onChange={e => setEditingMessage(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg text-xs theme-text resize-none"
                        style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
                      />
                    ) : (
                      <p className="text-[11px] theme-text-secondary whitespace-pre-wrap">{tpl.message}</p>
                    )}
                    {tpl.updatedAt && (
                      <p className="text-[9px] theme-text-muted mt-1.5">อัพเดท: {formatTime(tpl.updatedAt)}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: History */}
        {tab === "history" && (
          <div className="space-y-3">
            {historyLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="glass-card rounded-xl p-4 animate-pulse" style={{ height: "80px" }} />)}
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 glass-card rounded-xl">
                <p className="text-sm theme-text-muted">ยังไม่มีประวัติคำสั่ง</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {history.map(cmd => {
                  const statusColor = cmd.status === "executed" ? "#4ade80" : cmd.status === "pending" ? "#fbbf24" : "#71717a";
                  const statusLabel = cmd.status === "executed" ? "ดำเนินการแล้ว" : cmd.status === "pending" ? "รอยืนยัน" : cmd.status;
                  return (
                    <div key={cmd.commandId} className="glass-card rounded-xl p-4 animate-fade-in">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-xs theme-text flex-1 min-w-0 truncate">{cmd.input || "(วิเคราะห์จากรูป)"}</p>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          {cmd.hasImage && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(96,165,250,0.1)", color: "#60a5fa" }}>
                              มีรูป
                            </span>
                          )}
                          <span
                            className="text-[9px] font-medium px-2 py-0.5 rounded-full"
                            style={{ background: `${statusColor}15`, color: statusColor }}
                          >
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                      {cmd.analysis?.understanding && (
                        <p className="text-[11px] theme-text-secondary mb-1">{cmd.analysis.understanding}</p>
                      )}
                      <div className="flex items-center gap-3 text-[9px] theme-text-muted">
                        <span>{formatTime(cmd.createdAt)}</span>
                        {cmd.executedActions && (
                          <span>{cmd.executedActions.length} actions</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[250] px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg animate-slide-up"
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
