"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Dealer {
  _id: string;
  wp_id: number | null;
  name: string;
  ownerName: string;
  phone: string;
  province: string;
  address: string;
  lineGroupId: string | null;
  ownerLineUid: string | null;
  rank: string;
  isWalkin: boolean;
  active: boolean;
  coverageAreas: string[];
  notes: string;
  createdAt: string;
}

interface Lead {
  _id: string;
  customerName: string;
  productInterest: string;
  status: string;
  platform: string;
  phone: string | null;
  createdAt: string;
}

interface SLA {
  totalLeads: number;
  contacted: number;
  noResponse: number;
  closed: number;
  satisfied: number;
  contactRate: number;
  satisfactionRate: number;
  grade: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  lead_created: { label: "สร้างใหม่", color: "bg-blue-500/20 text-blue-400", icon: "+" },
  dealer_notified: { label: "แจ้งตัวแทนแล้ว", color: "bg-yellow-500/20 text-yellow-400", icon: ">" },
  checking_contact: { label: "รอติดต่อ", color: "bg-orange-500/20 text-orange-400", icon: "?" },
  dealer_contacted: { label: "ติดต่อแล้ว", color: "bg-green-500/20 text-green-400", icon: "V" },
  dealer_no_response: { label: "ไม่ตอบ", color: "bg-red-500/20 text-red-400", icon: "!" },
  waiting_order: { label: "รอสั่ง", color: "bg-purple-500/20 text-purple-400", icon: "#" },
  waiting_decision: { label: "ลูกค้าคิด", color: "bg-amber-500/20 text-amber-400", icon: "~" },
  waiting_stock: { label: "รอสต็อก", color: "bg-orange-600/20 text-orange-300", icon: "=" },
  order_placed: { label: "สั่งแล้ว", color: "bg-emerald-500/20 text-emerald-400", icon: "P" },
  waiting_delivery: { label: "รอจัดส่ง", color: "bg-cyan-500/20 text-cyan-400", icon: "T" },
  delivered: { label: "ส่งแล้ว", color: "bg-teal-500/20 text-teal-400", icon: "D" },
  waiting_install: { label: "รอติดตั้ง", color: "bg-indigo-500/20 text-indigo-400", icon: "W" },
  installed: { label: "ติดตั้งแล้ว", color: "bg-lime-500/20 text-lime-400", icon: "*" },
  satisfaction_checked: { label: "ถามพอใจแล้ว", color: "bg-pink-500/20 text-pink-400", icon: "Q" },
  closed_satisfied: { label: "ปิด (พอใจ)", color: "bg-green-600/20 text-green-300", icon: "S" },
  closed_won: { label: "ปิด (สั่งแล้ว)", color: "bg-green-600/20 text-green-300", icon: "W" },
  closed_lost: { label: "ปิด (หาย)", color: "bg-gray-500/20 text-gray-400", icon: "L" },
  closed_cancelled: { label: "ยกเลิก", color: "bg-gray-600/20 text-gray-500", icon: "X" },
  admin_escalated: { label: "ส่ง Admin", color: "bg-red-600/20 text-red-300", icon: "!" },
  dormant: { label: "หยุดติดตาม", color: "bg-gray-700/20 text-gray-500", icon: "Z" },
};

const RANKS = ["Standard", "Silver", "Gold", "Platinum", "Diamond"];
const RANK_COLORS: Record<string, string> = {
  Standard: "bg-gray-500/20 text-gray-400",
  Silver: "bg-slate-400/20 text-slate-300",
  Gold: "bg-yellow-500/20 text-yellow-400",
  Platinum: "bg-cyan-500/20 text-cyan-300",
  Diamond: "bg-purple-500/20 text-purple-300",
};
const GRADE_COLORS: Record<string, string> = { A: "text-green-400", B: "text-blue-400", C: "text-yellow-400", D: "text-red-400" };

export default function DealerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dealerId = params.id as string;

  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sla, setSLA] = useState<SLA | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"info" | "leads" | "sla">("info");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [notifyStatus, setNotifyStatus] = useState<string | null>(null);

  const fetchDealer = useCallback(async () => {
    try {
      const res = await fetch(`/dashboard/api/dealers/${dealerId}`);
      const data = await res.json();
      if (data.ok) {
        setDealer(data.dealer);
        setLeads(data.leads || []);
        setSLA(data.sla || null);
      }
    } catch (e) {
      console.error("Failed to fetch dealer:", e);
    } finally {
      setLoading(false);
    }
  }, [dealerId]);

  useEffect(() => { fetchDealer(); }, [fetchDealer]);

  const handleEdit = () => {
    if (!dealer) return;
    setEditForm({
      name: dealer.name, ownerName: dealer.ownerName, phone: dealer.phone,
      province: dealer.province, address: dealer.address || "",
      postcode: dealer.postcode || "", lineGroupId: dealer.lineGroupId || "",
      ownerLineUid: dealer.ownerLineUid || "", rank: dealer.rank,
      isWalkin: dealer.isWalkin, coverageAreas: (dealer.coverageAreas || []).join(", "),
      notes: dealer.notes || "",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/dashboard/api/dealers/${dealerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.ok) {
        setDealer(data.dealer);
        setEditing(false);
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm(`ยืนยันลบตัวแทน ${dealer?.name}?`)) return;
    try {
      await fetch(`/dashboard/api/dealers/${dealerId}`, { method: "DELETE" });
      router.push("/dealers");
    } catch { /* ignore */ }
  };

  const handleTestNotify = async () => {
    setNotifyStatus("sending");
    try {
      const res = await fetch(`/dashboard/api/dealers/${dealerId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "test" }),
      });
      const data = await res.json();
      setNotifyStatus(data.ok && data.sent ? "sent" : data.error || "failed");
    } catch {
      setNotifyStatus("failed");
    }
    setTimeout(() => setNotifyStatus(null), 3000);
  };

  if (loading) {
    return (
      <div className="page-content p-4 md:p-6">
        <div className="glass-card rounded-xl p-8 animate-pulse" style={{ height: 200 }} />
      </div>
    );
  }

  if (!dealer) {
    return (
      <div className="page-content p-4 md:p-6 text-center">
        <p className="theme-text-secondary text-lg">ไม่พบตัวแทน</p>
        <Link href="/dealers" className="text-sm mt-2 inline-block" style={{ color: "#FF6B00" }}>กลับ</Link>
      </div>
    );
  }

  const statusInfo = (s: string) => STATUS_LABELS[s] || { label: s, color: "bg-gray-500/20 text-gray-400", icon: "?" };

  return (
    <div className="page-content p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dealers" className="text-sm theme-text-secondary hover:theme-text">&larr; กลับ</Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold theme-text">{dealer.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full ${RANK_COLORS[dealer.rank] || RANK_COLORS.Standard}`}>{dealer.rank}</span>
              {dealer.isWalkin && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">Walk-in</span>}
              {!dealer.active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">Inactive</span>}
            </div>
            <div className="flex items-center gap-3 text-sm theme-text-secondary mt-0.5">
              <span>{dealer.province}</span>
              {dealer.phone && <span>{dealer.phone}</span>}
              <span>{dealer.lineGroupId ? "LINE: ผูกแล้ว" : "LINE: ยังไม่ผูก"}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {!editing && <button onClick={handleEdit} className="px-3 py-1.5 rounded-lg text-sm border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>แก้ไข</button>}
          <button onClick={handleDelete} className="px-3 py-1.5 rounded-lg text-sm text-red-400 border border-red-500/30 hover:bg-red-500/10">ลบ</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {(["info", "leads", "sla"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === t ? "border-orange-500 theme-text" : "border-transparent theme-text-secondary hover:theme-text"}`}
          >
            {t === "info" ? "ข้อมูลร้าน" : t === "leads" ? `Lead History (${leads.length})` : "SLA"}
          </button>
        ))}
      </div>

      {/* Tab: Info */}
      {tab === "info" && (
        <div className="glass-card rounded-xl p-5 space-y-4">
          {editing ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <EditField label="ชื่อร้าน" value={editForm.name as string} onChange={(v) => setEditForm(f => ({ ...f, name: v }))} />
                <EditField label="เจ้าของ" value={editForm.ownerName as string} onChange={(v) => setEditForm(f => ({ ...f, ownerName: v }))} />
                <EditField label="เบอร์โทร" value={editForm.phone as string} onChange={(v) => setEditForm(f => ({ ...f, phone: v }))} />
                <EditField label="จังหวัด" value={editForm.province as string} onChange={(v) => setEditForm(f => ({ ...f, province: v }))} />
                <EditField label="ที่อยู่" value={editForm.address as string} onChange={(v) => setEditForm(f => ({ ...f, address: v }))} />
                <EditField label="ที่อยู่" value={editForm.address as string} onChange={(v) => setEditForm(f => ({ ...f, address: v }))} />
                <EditField label="รหัสไปรษณีย์" value={editForm.postcode as string} onChange={(v) => setEditForm(f => ({ ...f, postcode: v }))} />
                <EditField label="LINE Group ID" value={editForm.lineGroupId as string} onChange={(v) => setEditForm(f => ({ ...f, lineGroupId: v }))} />
                <EditField label="Owner LINE UID" value={editForm.ownerLineUid as string} onChange={(v) => setEditForm(f => ({ ...f, ownerLineUid: v }))} />
                <div>
                  <label className="block text-xs theme-text-secondary mb-1">Rank</label>
                  <select value={editForm.rank as string} onChange={(e) => setEditForm(f => ({ ...f, rank: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border bg-transparent" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                    {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <EditField label="พื้นที่ครอบคลุม" value={editForm.coverageAreas as string} onChange={(v) => setEditForm(f => ({ ...f, coverageAreas: v }))} />
                <EditField label="หมายเหตุ" value={editForm.notes as string} onChange={(v) => setEditForm(f => ({ ...f, notes: v }))} />
              </div>
              <label className="flex items-center gap-2 text-sm theme-text-secondary">
                <input type="checkbox" checked={editForm.isWalkin as boolean} onChange={(e) => setEditForm(f => ({ ...f, isWalkin: e.target.checked }))} />
                Walk-in (ร้านหน้าโกดัง)
              </label>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg text-sm theme-text-secondary">ยกเลิก</button>
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50" style={{ background: "#FF6B00" }}>
                  {saving ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-8 text-sm">
                <InfoRow label="ชื่อร้าน" value={dealer.name} />
                <InfoRow label="เจ้าของ" value={dealer.ownerName || "-"} />
                <InfoRow label="เบอร์โทร" value={dealer.phone || "-"} />
                <InfoRow label="จังหวัด" value={dealer.province} />
                <InfoRow label="ที่อยู่" value={dealer.address || "-"} />
                <InfoRow label="ที่อยู่" value={dealer.address || "-"} />
                <InfoRow label="รหัสไปรษณีย์" value={dealer.postcode || "-"} />
                <InfoRow label="LINE Group ID" value={dealer.lineGroupId || "ยังไม่ผูก"} />
                <InfoRow label="Owner LINE UID" value={dealer.ownerLineUid || "-"} />
                <InfoRow label="Rank" value={dealer.rank} />
                <InfoRow label="Walk-in" value={dealer.isWalkin ? "ใช่" : "ไม่ใช่"} />
                <InfoRow label="พื้นที่ครอบคลุม" value={(dealer.coverageAreas || []).join(", ") || "-"} />
                {dealer.notes && <InfoRow label="หมายเหตุ" value={dealer.notes} />}
              </div>
              <div className="flex gap-2 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                <button
                  onClick={handleTestNotify}
                  disabled={!dealer.lineGroupId || notifyStatus === "sending"}
                  className="px-3 py-1.5 rounded-lg text-sm border disabled:opacity-40"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                >
                  {notifyStatus === "sending" ? "กำลังส่ง..." : notifyStatus === "sent" ? "ส่งแล้ว!" : "ทดสอบส่ง LINE"}
                </button>
                {notifyStatus && notifyStatus !== "sending" && notifyStatus !== "sent" && (
                  <span className="text-xs text-red-400 self-center">{notifyStatus}</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Leads */}
      {tab === "leads" && (
        <div className="glass-card rounded-xl overflow-hidden">
          {leads.length === 0 ? (
            <div className="p-8 text-center theme-text-secondary text-sm">ยังไม่มี leads</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <th className="text-left p-3 theme-text-secondary font-medium">ลูกค้า</th>
                    <th className="text-left p-3 theme-text-secondary font-medium hidden md:table-cell">สินค้า</th>
                    <th className="text-left p-3 theme-text-secondary font-medium">สถานะ</th>
                    <th className="text-left p-3 theme-text-secondary font-medium hidden md:table-cell">วันที่</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(l => {
                    const si = statusInfo(l.status);
                    return (
                      <tr key={l._id} className="border-b" style={{ borderColor: "var(--border)" }}>
                        <td className="p-3 theme-text">{l.customerName}</td>
                        <td className="p-3 theme-text-secondary hidden md:table-cell">{l.productInterest || "-"}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${si.color}`}>{si.label}</span>
                        </td>
                        <td className="p-3 theme-text-muted text-xs hidden md:table-cell">
                          {new Date(l.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: SLA */}
      {tab === "sla" && sla && (
        <div className="glass-card rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium theme-text">SLA Scorecard (30 วันล่าสุด)</h3>
            <span className={`text-2xl font-bold ${GRADE_COLORS[sla.grade] || "theme-text"}`}>Grade: {sla.grade}</span>
          </div>
          <div className="space-y-3">
            <SLABar label="Contact Rate" value={sla.contactRate} detail={`${sla.contacted}/${sla.totalLeads}`} />
            <SLABar label="Satisfaction" value={sla.satisfactionRate} detail={`${sla.satisfied}/${sla.closed}`} />
            <div className="flex justify-between text-sm">
              <span className="theme-text-secondary">No Response</span>
              <span className={sla.noResponse > 0 ? "text-red-400 font-bold" : "theme-text-muted"}>{sla.noResponse}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="theme-text-secondary">Total Leads (30d)</span>
              <span className="theme-text">{sla.totalLeads}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="theme-text-secondary">{label}</span>
      <span className="theme-text font-medium text-right">{value}</span>
    </div>
  );
}

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs theme-text-secondary mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm border bg-transparent"
        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
    </div>
  );
}

function SLABar({ label, value, detail }: { label: string; value: number; detail: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? "#4ade80" : pct >= 70 ? "#60a5fa" : pct >= 50 ? "#fbbf24" : "#ef4444";
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="theme-text-secondary">{label}</span>
        <span className="theme-text">{pct}% ({detail})</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-hover)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
