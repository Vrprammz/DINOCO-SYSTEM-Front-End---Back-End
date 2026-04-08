"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface LeadStats {
  total: number;
  active: number;
  noResponse: number;
  contactRate: number;
}

interface Dealer {
  _id: string;
  wp_id: number | null;
  name: string;
  ownerName: string;
  phone: string;
  province: string;
  address: string;
  lineGroupId: string | null;
  rank: string;
  isWalkin: boolean;
  active: boolean;
  notes: string;
  leadStats: LeadStats;
  createdAt: string;
}

const RANKS = ["Standard", "Silver", "Gold", "Platinum", "Diamond"];
const RANK_COLORS: Record<string, string> = {
  Standard: "bg-gray-500/20 text-gray-400",
  Silver: "bg-slate-400/20 text-slate-300",
  Gold: "bg-yellow-500/20 text-yellow-400",
  Platinum: "bg-cyan-500/20 text-cyan-300",
  Diamond: "bg-purple-500/20 text-purple-300",
};

function gradeFromRate(rate: number) {
  if (rate >= 0.85) return { grade: "A", color: "text-green-400" };
  if (rate >= 0.7) return { grade: "B", color: "text-blue-400" };
  if (rate >= 0.5) return { grade: "C", color: "text-yellow-400" };
  return { grade: "D", color: "text-red-400" };
}

export default function DealersPage() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterProvince, setFilterProvince] = useState("");
  const [filterRank, setFilterRank] = useState("");
  const [filterActive, setFilterActive] = useState("true");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResult, setImportResult] = useState<{ importing: boolean; done: boolean; data?: { imported: number; updated: number; skipped: number } | null; error?: string }>({ importing: false, done: false });

  const fetchDealers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterProvince) params.set("province", filterProvince);
      if (filterRank) params.set("rank", filterRank);
      if (filterActive !== "all") params.set("active", filterActive);
      const res = await fetch(`/dashboard/api/dealers?${params}`);
      const data = await res.json();
      setDealers(data.dealers || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to fetch dealers:", e);
    } finally {
      setLoading(false);
    }
  }, [search, filterProvince, filterRank, filterActive]);

  useEffect(() => {
    const t = setTimeout(fetchDealers, 300);
    return () => clearTimeout(t);
  }, [fetchDealers]);

  const handleImport = async () => {
    setImportResult({ importing: true, done: false });
    try {
      const res = await fetch("/dashboard/api/dealers/import", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setImportResult({ importing: false, done: true, data: { imported: data.imported, updated: data.updated, skipped: data.skipped } });
        fetchDealers();
      } else {
        setImportResult({ importing: false, done: true, error: data.error || "Import failed" });
      }
    } catch {
      setImportResult({ importing: false, done: true, error: "ไม่สามารถเชื่อมต่อได้" });
    }
  };

  // Summary stats
  const activeDealers = dealers.filter(d => d.active).length;
  const totalNoResponse = dealers.reduce((sum, d) => sum + (d.leadStats?.noResponse || 0), 0);
  const avgSLA = dealers.length > 0
    ? dealers.reduce((sum, d) => sum + (d.leadStats?.contactRate || 0), 0) / dealers.length
    : 0;

  // Get unique provinces for filter
  const provinces = [...new Set(dealers.map(d => d.province).filter(Boolean))].sort();

  return (
    <div className="page-content p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold theme-text">ตัวแทนจำหน่าย</h1>
          <p className="theme-text-secondary text-sm">จัดการตัวแทน DINOCO -- ผูก LINE Group + ติดตาม Lead</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 rounded-lg text-sm border transition hover:bg-[var(--bg-hover)]"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            Import WP
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition"
            style={{ background: "#FF6B00" }}
          >
            + เพิ่มตัวแทน
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "ทั้งหมด", value: total, color: "var(--text-primary)" },
          { label: "Active", value: activeDealers, color: "#4ade80" },
          { label: "SLA", value: `${Math.round(avgSLA * 100)}%`, color: avgSLA >= 0.7 ? "#4ade80" : "#fbbf24" },
          { label: "ไม่ตอบ", value: totalNoResponse, color: totalNoResponse > 0 ? "#ef4444" : "var(--text-muted)" },
        ].map((card) => (
          <div key={card.label} className="glass-card rounded-xl p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
            <div className="text-xs theme-text-muted mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="ค้นหา..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border bg-transparent flex-1 min-w-[200px]"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
        />
        <select
          value={filterProvince}
          onChange={(e) => setFilterProvince(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border bg-transparent"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
        >
          <option value="">ทุกจังหวัด</option>
          {provinces.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filterRank}
          onChange={(e) => setFilterRank(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border bg-transparent"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
        >
          <option value="">ทุก Rank</option>
          {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border bg-transparent"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="all">ทั้งหมด</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-4 animate-pulse" style={{ height: 60 }} />
          ))}
        </div>
      ) : dealers.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <p className="text-lg theme-text-secondary">ยังไม่มีข้อมูลตัวแทน</p>
          <div className="flex justify-center gap-3 mt-4">
            <button onClick={() => setShowImportModal(true)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              Import จาก WordPress
            </button>
            <button onClick={() => setShowAddModal(true)} className="px-4 py-2 rounded-lg text-sm text-white" style={{ background: "#FF6B00" }}>
              เพิ่มด้วยมือ
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="text-left p-3 theme-text-secondary font-medium">ร้าน</th>
                  <th className="text-left p-3 theme-text-secondary font-medium hidden md:table-cell">จังหวัด</th>
                  <th className="text-left p-3 theme-text-secondary font-medium hidden md:table-cell">Rank</th>
                  <th className="text-center p-3 theme-text-secondary font-medium">LINE</th>
                  <th className="text-center p-3 theme-text-secondary font-medium">Leads</th>
                  <th className="text-center p-3 theme-text-secondary font-medium hidden md:table-cell">SLA</th>
                </tr>
              </thead>
              <tbody>
                {dealers.map((d) => {
                  const sla = gradeFromRate(d.leadStats?.contactRate || 0);
                  return (
                    <tr
                      key={d._id}
                      className="border-b transition hover:bg-[var(--bg-hover)] cursor-pointer"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="p-3">
                        <Link href={`/dealers/${d._id}`} className="block">
                          <div className="font-medium theme-text">{d.name}</div>
                          <div className="text-xs theme-text-muted md:hidden">{d.province}</div>
                          {d.isWalkin && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">Walk-in</span>}
                        </Link>
                      </td>
                      <td className="p-3 theme-text-secondary hidden md:table-cell">{d.province}</td>
                      <td className="p-3 hidden md:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${RANK_COLORS[d.rank] || RANK_COLORS.Standard}`}>{d.rank}</span>
                      </td>
                      <td className="p-3 text-center">
                        {d.lineGroupId ? (
                          <span className="text-green-400" title={d.lineGroupId}>&#10003;</span>
                        ) : (
                          <span className="text-red-400" title="ยังไม่ผูก LINE">&#10007;</span>
                        )}
                      </td>
                      <td className="p-3 text-center theme-text">{d.leadStats?.total || 0}</td>
                      <td className={`p-3 text-center font-bold hidden md:table-cell ${sla.color}`}>
                        {d.leadStats?.total > 0 ? sla.grade : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddDealerModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); fetchDealers(); }}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal
          onClose={() => { setShowImportModal(false); setImportResult({ importing: false, done: false }); }}
          onImport={handleImport}
          result={importResult}
        />
      )}
    </div>
  );
}

// === Add Dealer Modal ===
function AddDealerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "", ownerName: "", province: "", address: "", phone: "",
    lineGroupId: "", rank: "Standard", isWalkin: false, coverageAreas: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!form.name.trim() || !form.province.trim()) {
      setError("ชื่อร้านและจังหวัดจำเป็น");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/dashboard/api/dealers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, coverageAreas: form.coverageAreas }),
      });
      const data = await res.json();
      if (data.ok) {
        onSaved();
      } else {
        setError(data.error || "เกิดข้อผิดพลาด");
      }
    } catch {
      setError("ไม่สามารถบันทึกได้");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-lg font-bold theme-text">เพิ่มตัวแทน</h2>
            <button onClick={onClose} className="text-xl theme-text-muted hover:theme-text">&#10005;</button>
          </div>
          <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
            {error && <div className="text-sm text-red-400 bg-red-500/10 rounded-lg p-2">{error}</div>}
            <ModalField label="ชื่อร้าน *" value={form.name} onChange={(v) => setForm(f => ({ ...f, name: v }))} />
            <ModalField label="เจ้าของร้าน" value={form.ownerName} onChange={(v) => setForm(f => ({ ...f, ownerName: v }))} />
            <ModalField label="จังหวัด *" value={form.province} onChange={(v) => setForm(f => ({ ...f, province: v }))} />
            <ModalField label="ที่อยู่ (เช่น 78 ถ.รามอินทรา แขวงท่าแร้ง เขตบางเขน กรุงเทพ 10220)" value={form.address} onChange={(v) => setForm(f => ({ ...f, address: v }))} />
            <ModalField label="เบอร์โทร" value={form.phone} onChange={(v) => setForm(f => ({ ...f, phone: v }))} />
            <ModalField label="LINE Group ID" value={form.lineGroupId} onChange={(v) => setForm(f => ({ ...f, lineGroupId: v }))} />
            <div>
              <label className="block text-xs theme-text-secondary mb-1">Rank</label>
              <select
                value={form.rank}
                onChange={(e) => setForm(f => ({ ...f, rank: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm border bg-transparent"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm theme-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={form.isWalkin}
                onChange={(e) => setForm(f => ({ ...f, isWalkin: e.target.checked }))}
                className="rounded"
              />
              Walk-in (ร้านหน้าโกดัง)
            </label>
            <ModalField label="พื้นที่ครอบคลุม (คั่นด้วย comma)" value={form.coverageAreas} onChange={(v) => setForm(f => ({ ...f, coverageAreas: v }))} />
            <ModalField label="หมายเหตุ" value={form.notes} onChange={(v) => setForm(f => ({ ...f, notes: v }))} />
          </div>
          <div className="flex justify-end gap-2 p-4 border-t" style={{ borderColor: "var(--border)" }}>
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm theme-text-secondary">ยกเลิก</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "#FF6B00" }}
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ModalField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs theme-text-secondary mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm border bg-transparent"
        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
      />
    </div>
  );
}

// === Import Modal ===
function ImportModal({ onClose, onImport, result }: {
  onClose: () => void;
  onImport: () => void;
  result: { importing: boolean; done: boolean; data?: { imported: number; updated: number; skipped: number } | null; error?: string };
}) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-lg font-bold theme-text">Import จาก WordPress</h2>
            <button onClick={onClose} className="text-xl theme-text-muted hover:theme-text">&#10005;</button>
          </div>
          <div className="p-4 space-y-3">
            {!result.done && !result.importing && (
              <>
                <p className="text-sm theme-text-secondary">ดึงข้อมูลตัวแทนจาก WordPress เข้า AI Dashboard</p>
                <ul className="text-xs theme-text-muted space-y-1">
                  <li>ตัวแทนที่ wp_id ซ้ำจะถูก update</li>
                  <li>ตัวแทนใหม่จะถูกเพิ่ม</li>
                  <li>ไม่มีการลบข้อมูลที่มีอยู่</li>
                </ul>
              </>
            )}
            {result.importing && (
              <div className="text-center py-4">
                <div className="w-8 h-8 border-3 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm theme-text-secondary mt-3">กำลัง import...</p>
              </div>
            )}
            {result.done && !result.error && result.data && (
              <div className="text-center py-2">
                <p className="text-lg font-bold text-green-400">Import สำเร็จ</p>
                <div className="flex justify-center gap-4 mt-2 text-sm">
                  <div><span className="font-bold theme-text">{result.data.imported}</span> <span className="theme-text-muted">เพิ่มใหม่</span></div>
                  <div><span className="font-bold theme-text">{result.data.updated}</span> <span className="theme-text-muted">อัพเดท</span></div>
                  <div><span className="font-bold theme-text">{result.data.skipped}</span> <span className="theme-text-muted">ข้าม</span></div>
                </div>
              </div>
            )}
            {result.done && result.error && (
              <div className="text-center py-2">
                <p className="text-sm text-red-400">{result.error}</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 p-4 border-t" style={{ borderColor: "var(--border)" }}>
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm theme-text-secondary">
              {result.done ? "ปิด" : "ยกเลิก"}
            </button>
            {!result.done && !result.importing && (
              <button
                onClick={onImport}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: "#FF6B00" }}
              >
                เริ่ม Import
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
