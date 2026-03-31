"use client";

import { useState, useEffect, useCallback } from "react";

interface Lead {
  _id: string;
  customerName: string;
  productInterest: string;
  province: string;
  dealerName: string;
  status: string;
  platform: string;
  phone: string | null;
  lineId: string | null;
  createdAt: string;
  updatedAt: string;
  nextFollowUpAt: string | null;
  nextFollowUpType: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  lead_created: { label: "สร้างใหม่", color: "bg-blue-500/20 text-blue-400", icon: "🆕" },
  dealer_notified: { label: "แจ้งตัวแทนแล้ว", color: "bg-yellow-500/20 text-yellow-400", icon: "📤" },
  checking_contact: { label: "รอติดต่อ", color: "bg-orange-500/20 text-orange-400", icon: "📞" },
  dealer_contacted: { label: "ติดต่อแล้ว", color: "bg-green-500/20 text-green-400", icon: "✅" },
  dealer_no_response: { label: "ตัวแทนไม่ตอบ", color: "bg-red-500/20 text-red-400", icon: "🚨" },
  waiting_order: { label: "รอสั่งซื้อ", color: "bg-purple-500/20 text-purple-400", icon: "🛒" },
  order_placed: { label: "สั่งแล้ว", color: "bg-emerald-500/20 text-emerald-400", icon: "📦" },
  waiting_delivery: { label: "รอจัดส่ง", color: "bg-cyan-500/20 text-cyan-400", icon: "🚚" },
  delivered: { label: "ส่งแล้ว", color: "bg-teal-500/20 text-teal-400", icon: "📬" },
  waiting_install: { label: "รอติดตั้ง", color: "bg-indigo-500/20 text-indigo-400", icon: "🔧" },
  installed: { label: "ติดตั้งแล้ว", color: "bg-lime-500/20 text-lime-400", icon: "✨" },
  satisfaction_checked: { label: "ถามความพอใจแล้ว", color: "bg-pink-500/20 text-pink-400", icon: "💬" },
  closed_satisfied: { label: "ปิด (พอใจ)", color: "bg-green-600/20 text-green-300", icon: "😊" },
  closed_lost: { label: "ปิด (หาย)", color: "bg-gray-500/20 text-gray-400", icon: "💤" },
  closed_cancelled: { label: "ปิด (ยกเลิก)", color: "bg-gray-600/20 text-gray-500", icon: "❌" },
  admin_escalated: { label: "ส่ง Admin", color: "bg-red-600/20 text-red-300", icon: "🔴" },
  dormant: { label: "หยุดติดตาม", color: "bg-gray-700/20 text-gray-500", icon: "💤" },
};

const PIPELINE_STAGES = [
  "lead_created", "dealer_notified", "checking_contact", "dealer_contacted",
  "waiting_order", "order_placed", "waiting_delivery", "delivered",
  "waiting_install", "installed", "closed_satisfied",
];

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [needsAttention, setNeedsAttention] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"kanban" | "list">("list");

  const fetchLeads = useCallback(async () => {
    try {
      const url = filter === "all" ? "/api/proxy/leads" : `/api/proxy/leads?status=${filter}`;
      const [leadsRes, attentionRes] = await Promise.all([
        fetch(url),
        fetch("/api/proxy/leads/needs-attention"),
      ]);
      const leadsData = await leadsRes.json();
      const attentionData = await attentionRes.json();
      setLeads(leadsData.leads || []);
      setNeedsAttention(attentionData.leads || []);
    } catch (e) {
      console.error("Failed to fetch leads:", e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchLeads(); const t = setInterval(fetchLeads, 30000); return () => clearInterval(t); }, [fetchLeads]);

  const statusInfo = (status: string) => STATUS_LABELS[status] || { label: status, color: "bg-gray-500/20 text-gray-400", icon: "❓" };

  const activeLeads = leads.filter(l => !["closed_satisfied", "closed_lost", "closed_cancelled", "dormant"].includes(l.status));
  const closedLeads = leads.filter(l => ["closed_satisfied", "closed_lost", "closed_cancelled", "dormant"].includes(l.status));

  // Kanban columns
  const kanbanColumns = PIPELINE_STAGES.map(stage => ({
    stage,
    ...statusInfo(stage),
    leads: leads.filter(l => l.status === stage),
  }));

  return (
    <div className="page-content p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold theme-text">Lead Pipeline</h1>
          <p className="theme-text-secondary text-sm">ติดตาม leads ตั้งแต่สนใจจนปิดการขาย</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-lg text-sm ${view === "list" ? "bg-[var(--color-primary)] text-white" : "glass-card theme-text-secondary"}`}>
            รายการ
          </button>
          <button onClick={() => setView("kanban")} className={`px-3 py-1.5 rounded-lg text-sm ${view === "kanban" ? "bg-[var(--color-primary)] text-white" : "glass-card theme-text-secondary"}`}>
            Kanban
          </button>
        </div>
      </div>

      {/* Needs Attention */}
      {needsAttention.length > 0 && (
        <div className="glass-card p-4 border-l-4 border-red-500">
          <h2 className="font-bold text-red-400 mb-2">ต้องจัดการด่วน ({needsAttention.length})</h2>
          <div className="space-y-2">
            {needsAttention.slice(0, 5).map((lead) => (
              <div key={lead._id} className="flex items-center justify-between p-2 rounded-lg bg-red-500/10">
                <div>
                  <span className="font-medium theme-text">{lead.customerName}</span>
                  <span className="text-xs theme-text-secondary ml-2">{lead.productInterest}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo(lead.status).color}`}>
                  {statusInfo(lead.status).icon} {statusInfo(lead.status).label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-[var(--color-primary)]">{activeLeads.length}</div>
          <div className="text-xs theme-text-secondary">Active Leads</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{needsAttention.length}</div>
          <div className="text-xs theme-text-secondary">ต้องจัดการ</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{leads.filter(l => l.status === "closed_satisfied").length}</div>
          <div className="text-xs theme-text-secondary">ปิดสำเร็จ</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold theme-text-secondary">{closedLeads.length}</div>
          <div className="text-xs theme-text-secondary">ปิดทั้งหมด</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { value: "all", label: "ทั้งหมด" },
          { value: "dealer_no_response", label: "ตัวแทนไม่ตอบ" },
          { value: "checking_contact", label: "รอติดต่อ" },
          { value: "waiting_delivery", label: "รอจัดส่ง" },
          { value: "closed_satisfied", label: "สำเร็จ" },
        ].map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${filter === f.value ? "bg-[var(--color-primary)] text-white" : "glass-card theme-text-secondary"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 theme-text-secondary">กำลังโหลด...</div>
      ) : view === "kanban" ? (
        /* Kanban View */
        <div className="flex gap-3 overflow-x-auto pb-4">
          {kanbanColumns.filter(c => c.leads.length > 0).map(col => (
            <div key={col.stage} className="min-w-[260px] flex-shrink-0">
              <div className={`rounded-t-lg px-3 py-2 ${col.color} font-medium text-sm`}>
                {col.icon} {col.label} ({col.leads.length})
              </div>
              <div className="space-y-2 p-2 glass-card rounded-b-lg min-h-[100px]">
                {col.leads.map(lead => (
                  <div key={lead._id} className="p-3 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors">
                    <div className="font-medium theme-text text-sm">{lead.customerName}</div>
                    <div className="text-xs theme-text-secondary">{lead.productInterest}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs theme-text-muted">{lead.platform === "facebook" ? "FB" : lead.platform === "instagram" ? "IG" : "LINE"}</span>
                      <span className="text-xs theme-text-muted">{lead.dealerName}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2">
          {leads.map((lead) => (
            <div key={lead._id} className="glass-card p-4 hover:bg-[var(--bg-hover)] transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium theme-text">{lead.customerName}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] theme-text-secondary">
                      {lead.platform === "facebook" ? "FB" : lead.platform === "instagram" ? "IG" : "LINE"}
                    </span>
                  </div>
                  <div className="text-sm theme-text-secondary mt-0.5">
                    {lead.productInterest} | {lead.dealerName} | {lead.province || "-"}
                  </div>
                  {lead.nextFollowUpAt && (
                    <div className="text-xs theme-text-muted mt-1">
                      Follow-up: {new Date(lead.nextFollowUpAt).toLocaleString("th-TH")} ({lead.nextFollowUpType})
                    </div>
                  )}
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${statusInfo(lead.status).color}`}>
                  {statusInfo(lead.status).icon} {statusInfo(lead.status).label}
                </span>
              </div>
            </div>
          ))}
          {leads.length === 0 && (
            <div className="text-center py-12 theme-text-secondary">ไม่มี leads</div>
          )}
        </div>
      )}
    </div>
  );
}
