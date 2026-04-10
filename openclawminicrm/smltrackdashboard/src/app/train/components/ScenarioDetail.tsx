"use client";

import type { Scenario } from "./RegressionTab";

interface Props {
  scenario: Scenario;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRerun: () => void;
}

const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
};

export default function ScenarioDetail({
  scenario,
  onClose,
  onEdit,
  onDelete,
  onRerun,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 p-4 border-b flex items-start justify-between"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border)",
          }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                {scenario.bug_id}
              </span>
              <span className={`text-xs font-bold ${SEV_COLOR[scenario.severity] || ""}`}>
                {scenario.severity.toUpperCase()}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {scenario.category}
              </span>
            </div>
            <h2 className="text-lg font-bold mt-1" style={{ color: "var(--text-primary)" }}>
              {scenario.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-xl px-2"
            style={{ color: "var(--text-muted)" }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4" style={{ color: "var(--text-primary)" }}>
          {/* Bug context */}
          {scenario.bug_context && (
            <Section label="Bug context">
              <p className="text-sm whitespace-pre-wrap">{scenario.bug_context}</p>
              {scenario.fix_commit && (
                <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                  Fix: <code className="text-cyan-400">{scenario.fix_commit}</code>
                  {scenario.fix_date && ` · ${scenario.fix_date}`}
                </p>
              )}
            </Section>
          )}

          {/* Turns */}
          <Section label="Conversation turns">
            <div className="space-y-2">
              {scenario.turns.map((t, i) => (
                <div
                  key={i}
                  className="text-sm p-2 rounded-lg"
                  style={{ background: "var(--bg-primary)" }}
                >
                  <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    Turn {i + 1} ({t.role})
                  </span>
                  <p className="mt-1 whitespace-pre-wrap">{t.message}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Assertions */}
          <Section label="Assertions">
            {scenario.assertions.expect_behavior && (
              <div className="mb-2">
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Expect behavior (semantic):
                </p>
                <p className="text-sm mt-1 whitespace-pre-wrap">
                  {scenario.assertions.expect_behavior}
                </p>
              </div>
            )}
            {(scenario.assertions.forbidden_patterns || []).length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-red-400 mb-1">Forbidden patterns:</p>
                <ul className="text-xs space-y-1">
                  {scenario.assertions.forbidden_patterns!.map((p, i) => (
                    <li key={i} className="font-mono">
                      <code className="text-red-300">/{p.pattern}/{p.flags || "i"}</code>
                      {p.reason && <span style={{ color: "var(--text-muted)" }}> — {p.reason}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(scenario.assertions.required_patterns || []).length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-green-400 mb-1">Required patterns:</p>
                <ul className="text-xs space-y-1">
                  {scenario.assertions.required_patterns!.map((p, i) => (
                    <li key={i} className="font-mono">
                      <code className="text-green-300">/{p.pattern}/{p.flags || "i"}</code>
                      {p.reason && <span style={{ color: "var(--text-muted)" }}> — {p.reason}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(scenario.assertions.expected_tools || []).length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-cyan-400 mb-1">Expected tools:</p>
                <p className="text-xs font-mono">
                  {scenario.assertions.expected_tools!.join(", ")}
                </p>
              </div>
            )}
            {(scenario.assertions.forbidden_tools || []).length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-red-400 mb-1">Forbidden tools:</p>
                <p className="text-xs font-mono">
                  {scenario.assertions.forbidden_tools!.join(", ")}
                </p>
              </div>
            )}
            {(scenario.assertions.must_not_do || []).length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-red-400 mb-1">Must not do:</p>
                <ul className="text-xs space-y-1">
                  {scenario.assertions.must_not_do!.map((r, i) => (
                    <li key={i}>• {r}</li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          {/* Last run */}
          {scenario.last_run && (
            <Section label="Last run">
              <p className="text-sm">
                Status:{" "}
                <span
                  className={
                    scenario.last_run.status === "pass"
                      ? "text-green-400"
                      : scenario.last_run.status === "fail"
                        ? "text-red-400"
                        : "text-yellow-400"
                  }
                >
                  <b>{scenario.last_run.status}</b>
                </span>
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                {new Date(scenario.last_run.timestamp).toLocaleString("th-TH")}
              </p>
              {(scenario.last_run.violations_count || 0) > 0 && (
                <p className="text-xs mt-1 text-red-400">
                  Violations: {scenario.last_run.violations_count}
                </p>
              )}
            </Section>
          )}
        </div>

        {/* Footer */}
        <div
          className="sticky bottom-0 p-4 border-t flex gap-2"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
        >
          <button
            onClick={onRerun}
            className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium"
          >
            ▶ Re-run
          </button>
          <button
            onClick={onEdit}
            className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium"
          >
            แก้ไข
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium"
          >
            ลบ
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-3 rounded-lg"
      style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
    >
      <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      {children}
    </div>
  );
}
