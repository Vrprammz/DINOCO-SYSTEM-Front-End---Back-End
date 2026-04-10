"use client";

import { useState } from "react";
import type { Scenario } from "./RegressionTab";

interface Props {
  initial?: Scenario | null;
  onClose: () => void;
  onSaved: () => void;
}

type Mode = "quick" | "advanced";

export default function ScenarioForm({ initial, onClose, onSaved }: Props) {
  const isEdit = !!initial;
  const [mode, setMode] = useState<Mode>(isEdit ? "advanced" : "quick");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Shared fields
  const [bugId, setBugId] = useState(initial?.bug_id || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || "product_knowledge");
  const [severity, setSeverity] = useState<Scenario["severity"]>(
    initial?.severity || "high"
  );
  const [bugContext, setBugContext] = useState(initial?.bug_context || "");
  const [fixCommit, setFixCommit] = useState(initial?.fix_commit || "");
  const [active, setActive] = useState(initial?.active !== false);

  // Quick mode
  const [quickMessage, setQuickMessage] = useState(
    initial?.turns?.[0]?.message || ""
  );
  const [quickForbidden, setQuickForbidden] = useState(
    initial?.assertions?.forbidden_patterns?.[0]?.pattern || ""
  );
  const [quickRequired, setQuickRequired] = useState(
    initial?.assertions?.required_patterns?.[0]?.pattern || ""
  );
  const [quickExpect, setQuickExpect] = useState(
    initial?.assertions?.expect_behavior || ""
  );

  // Advanced JSON
  const [advancedJson, setAdvancedJson] = useState(
    JSON.stringify(
      initial || {
        bug_id: "",
        title: "",
        category: "product_knowledge",
        severity: "high",
        platform: "any",
        bug_context: "",
        turns: [{ role: "user", message: "" }],
        assertions: {
          forbidden_patterns: [],
          required_patterns: [],
          expected_tools: [],
          forbidden_tools: [],
          expect_behavior: "",
          must_not_do: [],
        },
      },
      null,
      2
    )
  );

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      let body: Record<string, unknown>;
      if (mode === "advanced") {
        try {
          body = JSON.parse(advancedJson);
        } catch (e: unknown) {
          const err = e as { message?: string };
          setErr(`Invalid JSON: ${err.message}`);
          setSaving(false);
          return;
        }
      } else {
        if (!bugId || !title || !quickMessage) {
          setErr("bug_id, title, message required");
          setSaving(false);
          return;
        }
        body = {
          bug_id: bugId,
          title,
          category,
          severity,
          platform: "any",
          bug_context: bugContext,
          fix_commit: fixCommit,
          active,
          turns: [{ role: "user", message: quickMessage }],
          assertions: {
            forbidden_patterns: quickForbidden
              ? [{ pattern: quickForbidden, flags: "i", reason: "user-defined" }]
              : [],
            required_patterns: quickRequired
              ? [{ pattern: quickRequired, flags: "i", reason: "user-defined" }]
              : [],
            expect_behavior: quickExpect || undefined,
          },
        };
      }

      const url = isEdit
        ? `/dashboard/api/regression/scenarios/${initial!.bug_id}`
        : "/dashboard/api/regression/scenarios";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || `HTTP ${res.status}`);
        setSaving(false);
        return;
      }
      onSaved();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setErr(err.message || "unknown error");
    }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 p-4 border-b flex items-center justify-between"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
        >
          <h2 className="text-lg font-bold">
            {isEdit ? `แก้ไข ${initial!.bug_id}` : "เพิ่ม Regression Scenario"}
          </h2>
          <button onClick={onClose} className="text-xl px-2" style={{ color: "var(--text-muted)" }}>
            ✕
          </button>
        </div>

        {/* Mode switcher */}
        {!isEdit && (
          <div className="p-4 pb-0">
            <div
              className="flex gap-1 p-1 rounded-lg"
              style={{ background: "var(--bg-primary)" }}
            >
              <button
                onClick={() => setMode("quick")}
                className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
                  mode === "quick" ? "bg-indigo-600 text-white" : ""
                }`}
                style={mode !== "quick" ? { color: "var(--text-secondary)" } : undefined}
              >
                Quick (Form)
              </button>
              <button
                onClick={() => setMode("advanced")}
                className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
                  mode === "advanced" ? "bg-indigo-600 text-white" : ""
                }`}
                style={mode !== "advanced" ? { color: "var(--text-secondary)" } : undefined}
              >
                Advanced (JSON)
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="p-4 space-y-3">
          {mode === "quick" ? (
            <>
              <Field label="Bug ID">
                <input
                  value={bugId}
                  onChange={(e) => setBugId(e.target.value)}
                  placeholder="REG-100"
                  disabled={isEdit}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </Field>
              <Field label="Title">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="ตั้งชื่อสั้นๆ"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <option value="product_knowledge">product_knowledge</option>
                    <option value="tone">tone</option>
                    <option value="flow">flow</option>
                    <option value="intent">intent</option>
                    <option value="anti_hallucination">anti_hallucination</option>
                    <option value="tool_calling">tool_calling</option>
                  </select>
                </Field>
                <Field label="Severity">
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as Scenario["severity"])}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <option value="critical">critical</option>
                    <option value="high">high</option>
                    <option value="medium">medium</option>
                  </select>
                </Field>
              </div>
              <Field label="Bug context (optional)">
                <textarea
                  value={bugContext}
                  onChange={(e) => setBugContext(e.target.value)}
                  rows={2}
                  placeholder="อธิบาย bug ที่เคยเกิด"
                  className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </Field>
              <Field label="Fix commit (optional)">
                <input
                  value={fixCommit}
                  onChange={(e) => setFixCommit(e.target.value)}
                  placeholder="abc1234"
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </Field>
              <Field label="Test message (user turn)">
                <textarea
                  value={quickMessage}
                  onChange={(e) => setQuickMessage(e.target.value)}
                  rows={2}
                  placeholder="ข้อความที่จะยิงให้ AI ทดสอบ"
                  className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </Field>
              <Field label="Forbidden pattern (regex, optional)">
                <input
                  value={quickForbidden}
                  onChange={(e) => setQuickForbidden(e.target.value)}
                  placeholder="H2C|h2c"
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </Field>
              <Field label="Required pattern (regex, optional)">
                <input
                  value={quickRequired}
                  onChange={(e) => setQuickRequired(e.target.value)}
                  placeholder="DINOCO Edition"
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </Field>
              <Field label="Expect behavior (Gemini semantic judge, optional)">
                <textarea
                  value={quickExpect}
                  onChange={(e) => setQuickExpect(e.target.value)}
                  rows={2}
                  placeholder="อธิบายพฤติกรรมที่คาดหวัง — Gemini จะตัดสินให้"
                  className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Active
              </label>
            </>
          ) : (
            <Field label="Scenario JSON">
              <textarea
                value={advancedJson}
                onChange={(e) => setAdvancedJson(e.target.value)}
                rows={20}
                className="w-full px-3 py-2 rounded-lg text-xs font-mono resize-none"
                style={{
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
                spellCheck={false}
              />
            </Field>
          )}

          {err && (
            <div className="p-3 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="sticky bottom-0 p-4 border-t flex gap-2 justify-end"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
        >
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium"
          >
            ยกเลิก
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : isEdit ? "บันทึกการแก้ไข" : "สร้าง"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
