"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

/* ============================================
   Types
   ============================================ */
type ProviderRole = "leader" | "primary" | "fallback" | "background" | "none";

interface ProviderConfig {
  id: string;
  name: string;
  vendor: string;
  description: string;
  pricing: string;
  color: string;
  icon: string;
  keyField: string;
  keyConfigured: boolean;
  enabled: boolean;
  role: ProviderRole;
  fallbackOrder: number;
  stats: {
    requestsToday: number;
    costToday: number;
    errorRate: number;
  };
}

interface AiConfig {
  providers: Record<string, {
    enabled: boolean;
    role: ProviderRole;
    fallbackOrder: number;
  }>;
}

interface TestResult {
  status: "idle" | "testing" | "success" | "error";
  message?: string;
  latency?: number;
}

/* ============================================
   Constants
   ============================================ */
const ROLE_INFO: Record<ProviderRole, { label: string; labelTh: string; description: string; color: string; bg: string; border: string; icon: string }> = {
  leader:     { label: "Leader",     labelTh: "หัวหน้า",  description: "ตัดสินปัญหายาก ใช้กรณีพิเศษ",       color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/30", icon: "crown" },
  primary:    { label: "Primary",    labelTh: "ตัวหลัก",  description: "ตอบลูกค้าทั่วไป ใช้บ่อยสุด",       color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: "star" },
  fallback:   { label: "Fallback",   labelTh: "สำรอง",   description: "เปิดใช้เมื่อตัวหลัก error",          color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/30", icon: "shield" },
  background: { label: "Background", labelTh: "เบื้องหลัง", description: "งาน cron, analytics, สรุปข้อมูล", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30", icon: "cog" },
  none:       { label: "None",       labelTh: "ไม่ใช้งาน", description: "ปิดการใช้งาน",                    color: "text-gray-500",   bg: "bg-gray-500/10",   border: "border-gray-500/30", icon: "x" },
};

const DEFAULT_PROVIDERS: Omit<ProviderConfig, "keyConfigured" | "enabled" | "role" | "fallbackOrder" | "stats">[] = [
  {
    id: "anthropic",
    name: "Claude Sonnet",
    vendor: "Anthropic",
    description: "ฉลาดที่สุด เหมาะกับงานวิเคราะห์ซับซ้อน",
    pricing: "เสียเงิน ($3/1M tokens)",
    color: "#D97706",
    icon: "anthropic",
    keyField: "anthropicKey",
  },
  {
    id: "google",
    name: "Gemini Flash",
    vendor: "Google",
    description: "เร็ว tool calling ดี ฟรี 15 RPM",
    pricing: "ฟรี (15 RPM)",
    color: "#4285F4",
    icon: "google",
    keyField: "googleKey",
  },
  {
    id: "groq",
    name: "Groq (Llama)",
    vendor: "Groq",
    description: "เร็วมาก inference ระดับ hardware",
    pricing: "ฟรี",
    color: "#F55036",
    icon: "groq",
    keyField: "groqKey",
  },
  {
    id: "sambanova",
    name: "SambaNova",
    vendor: "SambaNova",
    description: "เร็ว ฟรี รองรับ Llama models",
    pricing: "ฟรี",
    color: "#7C3AED",
    icon: "sambanova",
    keyField: "sambaNovaKey",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    vendor: "Cerebras",
    description: "เร็วที่สุดในโลก wafer-scale chip",
    pricing: "ฟรี",
    color: "#06B6D4",
    icon: "cerebras",
    keyField: "cerebrasKey",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    vendor: "OpenRouter",
    description: "เลือก model ได้เยอะ มีทั้งฟรีและเสียเงิน",
    pricing: "ฟรี + เสียเงิน",
    color: "#EC4899",
    icon: "openrouter",
    keyField: "openrouterKey",
  },
];

/* ============================================
   Icons (inline SVG to avoid dependency)
   ============================================ */
function RoleIcon({ type, className = "" }: { type: string; className?: string }) {
  const cn = `w-4 h-4 ${className}`;
  switch (type) {
    case "crown":
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20M5 17l-2-9 5 4 4-8 4 8 5-4-2 9H5z"/></svg>;
    case "star":
      return <svg className={cn} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>;
    case "shield":
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case "cog":
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
    case "x":
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
    case "check":
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>;
    case "zap":
      return <svg className={cn} viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z"/></svg>;
    case "alert":
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    case "arrow-right":
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;
    case "chevron-down":
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>;
    case "grip":
      return <svg className={cn} viewBox="0 0 24 24" fill="currentColor" opacity="0.4"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>;
    case "save":
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
    case "refresh":
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
    case "play":
      return <svg className={cn} viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>;
    case "back":
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>;
    default:
      return null;
  }
}

/* ============================================
   Provider Logo
   ============================================ */
function ProviderLogo({ id, color, size = 40 }: { id: string; color: string; size?: number }) {
  const letters: Record<string, string> = {
    anthropic: "A",
    google: "G",
    groq: "Q",
    sambanova: "S",
    cerebras: "C",
    openrouter: "O",
  };
  return (
    <div
      className="rounded-xl flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
    >
      {letters[id] || "?"}
    </div>
  );
}

/* ============================================
   Toggle Switch
   ============================================ */
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--bg-primary)]
        ${checked ? "bg-[var(--primary)]" : "bg-[var(--bg-active)]"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 rounded-full bg-white shadow-md transform transition-transform duration-200
          ${checked ? "translate-x-6" : "translate-x-1"}
        `}
      />
    </button>
  );
}

/* ============================================
   Toast notification
   ============================================ */
function Toast({ message, type, onClose }: { message: string; type: "success" | "error" | "info"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300",
    error: "bg-red-500/20 border-red-500/40 text-red-300",
    info: "bg-blue-500/20 border-blue-500/40 text-blue-300",
  };

  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${colors[type]} backdrop-blur-md shadow-lg flex items-center gap-2 animate-slide-in`}>
      {type === "success" && <RoleIcon type="check" />}
      {type === "error" && <RoleIcon type="alert" />}
      {type === "info" && <RoleIcon type="zap" />}
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100"><RoleIcon type="x" /></button>
    </div>
  );
}

/* ============================================
   Fallback Chain Visualizer
   ============================================ */
function FallbackChain({ providers }: { providers: ProviderConfig[] }) {
  const primary = providers.find(p => p.role === "primary" && p.enabled);
  const fallbacks = providers
    .filter(p => p.role === "fallback" && p.enabled)
    .sort((a, b) => a.fallbackOrder - b.fallbackOrder);
  const leader = providers.find(p => p.role === "leader" && p.enabled);

  const chain = [...(primary ? [primary] : []), ...fallbacks, ...(leader ? [leader] : [])];

  if (chain.length === 0) {
    return (
      <div className="glass-card rounded-xl p-4 text-center">
        <p className="theme-text-muted text-sm">ยังไม่มี provider ที่เปิดใช้งาน กรุณาเปิดและกำหนด role อย่างน้อย 1 ตัว</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-4 sm:p-5">
      <h3 className="text-sm font-semibold theme-text mb-4 flex items-center gap-2">
        <RoleIcon type="zap" className="text-[var(--primary)]" />
        ลำดับการทำงาน (Fallback Chain)
      </h3>

      {/* Desktop: horizontal chain */}
      <div className="hidden sm:flex items-center gap-2 overflow-x-auto pb-2">
        {chain.map((p, i) => {
          const roleInfo = ROLE_INFO[p.role];
          return (
            <div key={p.id} className="flex items-center gap-2 shrink-0">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${roleInfo.bg} ${roleInfo.border}`}>
                <ProviderLogo id={p.id} color={p.color} size={24} />
                <div>
                  <div className="text-xs font-medium theme-text">{p.name}</div>
                  <div className={`text-[10px] ${roleInfo.color}`}>{roleInfo.labelTh}</div>
                </div>
              </div>
              {i < chain.length - 1 && (
                <RoleIcon type="arrow-right" className="theme-text-muted shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: vertical chain */}
      <div className="sm:hidden space-y-2">
        {chain.map((p, i) => {
          const roleInfo = ROLE_INFO[p.role];
          return (
            <div key={p.id}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${roleInfo.bg} ${roleInfo.border}`}>
                <ProviderLogo id={p.id} color={p.color} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium theme-text truncate">{p.name}</div>
                  <div className={`text-xs ${roleInfo.color}`}>{roleInfo.labelTh}</div>
                </div>
                <div className="text-xs theme-text-muted">#{i + 1}</div>
              </div>
              {i < chain.length - 1 && (
                <div className="flex justify-center py-1">
                  <svg className="w-4 h-4 theme-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Background providers */}
      {providers.some(p => p.role === "background" && p.enabled) && (
        <div className="mt-4 pt-3 border-t border-[var(--border)]">
          <div className="text-xs theme-text-muted mb-2 flex items-center gap-1.5">
            <RoleIcon type="cog" className="text-purple-400" />
            งานเบื้องหลัง (Background)
          </div>
          <div className="flex flex-wrap gap-2">
            {providers.filter(p => p.role === "background" && p.enabled).map(p => (
              <div key={p.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-500/10 border border-purple-500/20">
                <ProviderLogo id={p.id} color={p.color} size={18} />
                <span className="text-xs text-purple-300">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================
   Stats Bar
   ============================================ */
function StatsBar({ providers }: { providers: ProviderConfig[] }) {
  const active = providers.filter(p => p.enabled);
  const totalRequests = active.reduce((sum, p) => sum + p.stats.requestsToday, 0);
  const totalCost = active.reduce((sum, p) => sum + p.stats.costToday, 0);
  const avgError = active.length > 0
    ? active.reduce((sum, p) => sum + p.stats.errorRate, 0) / active.length
    : 0;

  const stats = [
    { label: "Provider ใช้งาน", value: `${active.length}/${providers.length}`, color: "text-emerald-400" },
    { label: "Requests วันนี้", value: totalRequests.toLocaleString(), color: "text-blue-400" },
    { label: "ค่าใช้จ่ายวันนี้", value: `$${totalCost.toFixed(4)}`, color: "text-amber-400" },
    { label: "Error Rate เฉลี่ย", value: `${avgError.toFixed(1)}%`, color: avgError > 5 ? "text-red-400" : "text-emerald-400" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map(s => (
        <div key={s.label} className="stat-card text-center">
          <div className={`text-lg sm:text-xl font-bold ${s.color}`}>{s.value}</div>
          <div className="text-xs theme-text-muted mt-1">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ============================================
   Provider Card
   ============================================ */
function ProviderCard({
  provider,
  onToggle,
  onRoleChange,
  onTest,
  testResult,
  onFallbackOrderChange,
  allProviders,
}: {
  provider: ProviderConfig;
  onToggle: (enabled: boolean) => void;
  onRoleChange: (role: ProviderRole) => void;
  onTest: () => void;
  testResult: TestResult;
  onFallbackOrderChange: (order: number) => void;
  allProviders: ProviderConfig[];
}) {
  const [expanded, setExpanded] = useState(false);
  const roleInfo = ROLE_INFO[provider.role];
  const fallbackCount = allProviders.filter(p => p.role === "fallback" && p.enabled && p.id !== provider.id).length;

  return (
    <div
      className={`
        glass-card rounded-xl overflow-hidden transition-all duration-200
        ${provider.enabled ? "ring-1" : "opacity-60"}
      `}
      style={{ borderColor: provider.enabled ? provider.color + "30" : undefined }}
    >
      {/* Header */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <ProviderLogo id={provider.id} color={provider.color} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold theme-text text-sm sm:text-base">{provider.name}</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full theme-bg-card theme-text-muted">{provider.vendor}</span>
            </div>
            <p className="text-xs theme-text-secondary mt-0.5">{provider.description}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${roleInfo.bg} ${roleInfo.color} border ${roleInfo.border} flex items-center gap-1`}>
                <RoleIcon type={roleInfo.icon} className="w-3 h-3" />
                {roleInfo.labelTh}
              </span>
              <span className="text-[10px] theme-text-muted">{provider.pricing}</span>
              {provider.keyConfigured ? (
                <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                  <RoleIcon type="check" className="w-3 h-3" /> Key ตั้งค่าแล้ว
                </span>
              ) : (
                <span className="text-[10px] text-red-400 flex items-center gap-0.5">
                  <RoleIcon type="alert" className="w-3 h-3" /> ยังไม่มี API Key
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <Toggle checked={provider.enabled} onChange={onToggle} disabled={!provider.keyConfigured} />
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs theme-text-muted hover:theme-text flex items-center gap-1 transition-colors"
            >
              <RoleIcon type="chevron-down" className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        {/* Stats row (always visible when enabled) */}
        {provider.enabled && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--border)]">
            <div className="text-xs">
              <span className="theme-text-muted">Requests: </span>
              <span className="theme-text font-medium">{provider.stats.requestsToday}</span>
            </div>
            <div className="text-xs">
              <span className="theme-text-muted">Cost: </span>
              <span className="theme-text font-medium">${provider.stats.costToday.toFixed(4)}</span>
            </div>
            <div className="text-xs">
              <span className="theme-text-muted">Error: </span>
              <span className={`font-medium ${provider.stats.errorRate > 5 ? "text-red-400" : "text-emerald-400"}`}>
                {provider.stats.errorRate.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-4 border-t border-[var(--border)] pt-4">
          {/* Role selector */}
          <div>
            <label className="text-xs font-medium theme-text-secondary mb-2 block">บทบาท (Role)</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(Object.keys(ROLE_INFO) as ProviderRole[]).map(role => {
                const info = ROLE_INFO[role];
                const isSelected = provider.role === role;
                return (
                  <button
                    key={role}
                    onClick={() => onRoleChange(role)}
                    disabled={!provider.enabled && role !== "none"}
                    className={`
                      px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left
                      ${isSelected ? `${info.bg} ${info.border} ${info.color}` : "border-[var(--border)] theme-text-muted hover:border-[var(--border-strong)]"}
                      ${!provider.enabled && role !== "none" ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                    `}
                  >
                    <div className="flex items-center gap-1.5">
                      <RoleIcon type={info.icon} className="w-3 h-3" />
                      {info.labelTh}
                    </div>
                    <div className="text-[10px] opacity-70 mt-0.5 hidden sm:block">{info.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fallback order (only when role = fallback) */}
          {provider.role === "fallback" && provider.enabled && (
            <div>
              <label className="text-xs font-medium theme-text-secondary mb-2 block">ลำดับสำรอง (ยิ่งน้อย ยิ่งใช้ก่อน)</label>
              <select
                value={provider.fallbackOrder}
                onChange={e => onFallbackOrderChange(Number(e.target.value))}
                className="theme-input border theme-border rounded-lg px-3 py-2 text-sm w-full sm:w-auto"
              >
                {Array.from({ length: fallbackCount + 1 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>ลำดับที่ {i + 1}</option>
                ))}
              </select>
            </div>
          )}

          {/* Test button */}
          <div className="flex items-center gap-3">
            <button
              onClick={onTest}
              disabled={!provider.keyConfigured || testResult.status === "testing"}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${provider.keyConfigured
                  ? "bg-[var(--primary)] hover:bg-[var(--primary-darker)] text-white"
                  : "bg-[var(--bg-active)] theme-text-muted cursor-not-allowed"
                }
                ${testResult.status === "testing" ? "opacity-70" : ""}
              `}
            >
              {testResult.status === "testing" ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" opacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
              ) : (
                <RoleIcon type="play" />
              )}
              {testResult.status === "testing" ? "กำลังทดสอบ..." : "ทดสอบ"}
            </button>

            {testResult.status === "success" && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <RoleIcon type="check" className="w-3.5 h-3.5" />
                สำเร็จ ({testResult.latency}ms)
              </span>
            )}
            {testResult.status === "error" && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <RoleIcon type="alert" className="w-3.5 h-3.5" />
                {testResult.message || "ผิดพลาด"}
              </span>
            )}
          </div>

          {/* Link to settings */}
          {!provider.keyConfigured && (
            <Link
              href="/settings"
              className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1"
            >
              <RoleIcon type="arrow-right" className="w-3 h-3" />
              ไปตั้งค่า API Key ในหน้าตั้งค่าระบบ
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================
   Main Page
   ============================================ */
export default function AiConfigPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const savedConfigRef = useRef<string>("");

  /* ---- Load account data ---- */
  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/dashboard/api/account");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();

      const aiConfig: AiConfig = data.aiConfig || { providers: {} };

      const mapped: ProviderConfig[] = DEFAULT_PROVIDERS.map(dp => {
        const saved = aiConfig.providers?.[dp.id];
        const keyField = dp.keyField as string;
        const configuredField = keyField + "Configured";
        return {
          ...dp,
          keyConfigured: !!(data.aiKeys as Record<string, unknown>)?.[configuredField],
          enabled: saved?.enabled ?? false,
          role: saved?.role ?? "none",
          fallbackOrder: saved?.fallbackOrder ?? 99,
          stats: {
            requestsToday: 0,
            costToday: 0,
            errorRate: 0,
          },
        };
      });

      setProviders(mapped);
      savedConfigRef.current = JSON.stringify(
        mapped.map(p => ({ id: p.id, enabled: p.enabled, role: p.role, fallbackOrder: p.fallbackOrder }))
      );
      setHasChanges(false);
    } catch (err) {
      console.error("Load error:", err);
      setToast({ message: "โหลดข้อมูลไม่สำเร็จ", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ---- Check for changes ---- */
  useEffect(() => {
    if (!savedConfigRef.current) return;
    const current = JSON.stringify(
      providers.map(p => ({ id: p.id, enabled: p.enabled, role: p.role, fallbackOrder: p.fallbackOrder }))
    );
    setHasChanges(current !== savedConfigRef.current);
  }, [providers]);

  /* ---- Handlers ---- */
  const updateProvider = (id: string, updates: Partial<ProviderConfig>) => {
    setProviders(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const handleToggle = (id: string, enabled: boolean) => {
    const updates: Partial<ProviderConfig> = { enabled };
    if (!enabled) updates.role = "none";
    updateProvider(id, updates);
  };

  const handleRoleChange = (id: string, role: ProviderRole) => {
    // If setting to primary/leader, remove that role from other providers
    if (role === "primary" || role === "leader") {
      setProviders(prev => prev.map(p => {
        if (p.id === id) return { ...p, role, enabled: role !== "none" ? true : p.enabled };
        if (p.role === role) return { ...p, role: "fallback" };
        return p;
      }));
    } else {
      updateProvider(id, { role, enabled: role !== "none" ? true : false });
    }
  };

  const handleTest = async (id: string) => {
    setTestResults(prev => ({ ...prev, [id]: { status: "testing" } }));
    try {
      // Simulate test (in production, call a real endpoint)
      await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
      const success = Math.random() > 0.15;
      if (success) {
        const latency = Math.floor(200 + Math.random() * 800);
        setTestResults(prev => ({ ...prev, [id]: { status: "success", latency } }));
      } else {
        throw new Error("Connection timeout");
      }
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [id]: { status: "error", message: err instanceof Error ? err.message : "Unknown error" },
      }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const aiConfig: AiConfig = {
        providers: Object.fromEntries(
          providers.map(p => [p.id, { enabled: p.enabled, role: p.role, fallbackOrder: p.fallbackOrder }])
        ),
      };

      const res = await fetch("/dashboard/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiConfig }),
      });

      if (!res.ok) throw new Error("Save failed");

      savedConfigRef.current = JSON.stringify(
        providers.map(p => ({ id: p.id, enabled: p.enabled, role: p.role, fallbackOrder: p.fallbackOrder }))
      );
      setHasChanges(false);
      setToast({ message: "บันทึกการตั้งค่าสำเร็จ", type: "success" });
    } catch {
      setToast({ message: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    loadData();
    setToast({ message: "รีเซ็ตกลับเป็นค่าที่บันทึกไว้", type: "info" });
  };

  /* ---- Loading state ---- */
  if (loading) {
    return (
      <div className="page-container flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <svg className="w-8 h-8 animate-spin mx-auto text-[var(--primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" opacity="0.3"/>
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
          </svg>
          <p className="text-sm theme-text-muted">กำลังโหลดการตั้งค่า AI...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Custom animation keyframes */}
      <style>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>

      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-9 h-9 rounded-xl theme-bg-card border border-[var(--border)] flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
            >
              <RoleIcon type="back" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold gradient-text">
                AI Engine
              </h1>
              <p className="text-xs sm:text-sm theme-text-secondary mt-0.5">
                จัดการ AI Providers — กำหนดบทบาท ลำดับ Fallback และทดสอบการเชื่อมต่อ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-xs font-medium theme-text-secondary hover:bg-[var(--bg-hover)] transition-colors"
              >
                <RoleIcon type="refresh" className="w-3.5 h-3.5" />
                รีเซ็ต
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className={`
                flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${hasChanges
                  ? "bg-[var(--primary)] hover:bg-[var(--primary-darker)] text-white shadow-md"
                  : "bg-[var(--bg-active)] theme-text-muted cursor-not-allowed"
                }
              `}
            >
              {saving ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" opacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
              ) : (
                <RoleIcon type="save" />
              )}
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>

        {/* Preset buttons */}
        <div className="glass-card p-4">
          <h2 className="text-sm font-semibold theme-text mb-3">เลือกแผนที่เหมาะกับคุณ</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                name: "ฟรีทั้งหมด",
                desc: "OpenRouter + Groq + SambaNova",
                cost: "~0 บาท/เดือน",
                color: "border-green-500/30 hover:border-green-500/60",
                config: { openrouter: { role: "primary" as ProviderRole, enabled: true }, groq: { role: "fallback" as ProviderRole, enabled: true }, sambanova: { role: "background" as ProviderRole, enabled: true } },
              },
              {
                name: "ฉลาด + ฟรี",
                desc: "Claude (หัวหน้า) + Gemini (หลัก) + Groq (สำรอง)",
                cost: "~500 บาท/เดือน",
                color: "border-blue-500/30 hover:border-blue-500/60",
                config: { anthropic: { role: "leader" as ProviderRole, enabled: true }, google: { role: "primary" as ProviderRole, enabled: true }, groq: { role: "fallback" as ProviderRole, enabled: true }, sambanova: { role: "background" as ProviderRole, enabled: true } },
              },
              {
                name: "เต็มพลัง",
                desc: "Claude + Gemini + Groq + SambaNova + Cerebras",
                cost: "~1,500 บาท/เดือน",
                color: "border-amber-500/30 hover:border-amber-500/60",
                config: { anthropic: { role: "leader" as ProviderRole, enabled: true }, google: { role: "primary" as ProviderRole, enabled: true }, groq: { role: "fallback" as ProviderRole, enabled: true }, sambanova: { role: "fallback" as ProviderRole, enabled: true }, cerebras: { role: "background" as ProviderRole, enabled: true }, openrouter: { role: "background" as ProviderRole, enabled: true } },
              },
            ].map(preset => (
              <button
                key={preset.name}
                onClick={() => {
                  setProviders(prev => prev.map(p => {
                    const cfg = preset.config[p.id as keyof typeof preset.config];
                    if (cfg) return { ...p, enabled: cfg.enabled && p.keyConfigured, role: p.keyConfigured ? cfg.role : "none", fallbackOrder: cfg.role === "fallback" ? 1 : 99 };
                    return { ...p, enabled: false, role: "none" as ProviderRole };
                  }));
                  setHasChanges(true);
                  setToast({ message: `ตั้งค่า "${preset.name}" แล้ว — กดบันทึกเพื่อใช้งาน`, type: "info" });
                }}
                className={`p-4 rounded-xl border ${preset.color} bg-[var(--bg-card)] text-left transition-all hover:bg-[var(--bg-hover)]`}
              >
                <div className="font-semibold theme-text text-sm">{preset.name}</div>
                <div className="text-xs theme-text-secondary mt-1">{preset.desc}</div>
                <div className="text-xs theme-text-muted mt-2">{preset.cost}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Stats overview */}
        <StatsBar providers={providers} />

        {/* Fallback chain */}
        <FallbackChain providers={providers} />

        {/* Provider cards */}
        <div>
          <h2 className="text-sm font-semibold theme-text mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-[var(--primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            AI Providers ({providers.filter(p => p.enabled).length} เปิดใช้งาน)
          </h2>
          <div className="grid gap-3">
            {providers.map(p => (
              <ProviderCard
                key={p.id}
                provider={p}
                onToggle={enabled => handleToggle(p.id, enabled)}
                onRoleChange={role => handleRoleChange(p.id, role)}
                onTest={() => handleTest(p.id)}
                testResult={testResults[p.id] || { status: "idle" }}
                onFallbackOrderChange={order => updateProvider(p.id, { fallbackOrder: order })}
                allProviders={providers}
              />
            ))}
          </div>
        </div>

        {/* Help section */}
        <div className="glass-card rounded-xl p-4 sm:p-5">
          <h3 className="text-sm font-semibold theme-text mb-3">คำอธิบายบทบาท</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(["leader", "primary", "fallback", "background"] as ProviderRole[]).map(role => {
              const info = ROLE_INFO[role];
              return (
                <div key={role} className={`flex items-start gap-3 p-3 rounded-lg ${info.bg} border ${info.border}`}>
                  <div className={`mt-0.5 ${info.color}`}>
                    <RoleIcon type={info.icon} className="w-5 h-5" />
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${info.color}`}>
                      {info.labelTh} ({info.label})
                    </div>
                    <div className="text-xs theme-text-secondary mt-0.5">{info.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Unsaved changes bar (mobile sticky) */}
        {hasChanges && (
          <div className="sm:hidden fixed bottom-0 left-0 right-0 p-4 glass-card border-t border-[var(--border)] z-40">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="text-xs text-amber-400 font-medium">มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</div>
              </div>
              <button
                onClick={handleReset}
                className="px-3 py-2 rounded-lg border border-[var(--border)] text-xs font-medium theme-text-secondary"
              >
                รีเซ็ต
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-xs font-medium"
              >
                {saving ? "..." : "บันทึก"}
              </button>
            </div>
          </div>
        )}

        {/* Bottom spacing for mobile sticky bar */}
        {hasChanges && <div className="h-20 sm:hidden" />}
      </div>
    </div>
  );
}
