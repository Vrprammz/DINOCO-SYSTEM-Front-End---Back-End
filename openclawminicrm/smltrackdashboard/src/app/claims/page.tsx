"use client";

import { useState, useEffect, useCallback } from "react";

interface Claim {
  _id: string;
  customerName: string;
  product: string;
  symptoms: string;
  status: string;
  platform: string;
  phone: string | null;
  photos: string[];
  aiAnalysis: string | null;
  purchaseFrom: string | null;
  purchaseDate: string | null;
  wpTicketNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

const CLAIM_STATUSES: Record<string, { label: string; color: string; icon: string }> = {
  photo_requested: { label: "รอรูป", color: "bg-yellow-500/20 text-yellow-400", icon: "📸" },
  photo_rejected: { label: "รูปไม่ชัด", color: "bg-orange-500/20 text-orange-400", icon: "🔄" },
  photo_received: { label: "ได้รูปแล้ว", color: "bg-blue-500/20 text-blue-400", icon: "📷" },
  info_collecting: { label: "กำลังเก็บข้อมูล", color: "bg-purple-500/20 text-purple-400", icon: "📝" },
  info_collected: { label: "รอตรวจสอบ", color: "bg-[var(--color-primary)]/20 text-[var(--color-primary)]", icon: "🔍" },
  admin_reviewed: { label: "ตรวจแล้ว", color: "bg-cyan-500/20 text-cyan-400", icon: "✅" },
  waiting_return_shipment: { label: "รอส่งคืน", color: "bg-indigo-500/20 text-indigo-400", icon: "📦" },
  parts_shipping: { label: "ส่งอะไหล่", color: "bg-teal-500/20 text-teal-400", icon: "🚚" },
  closed_resolved: { label: "แก้ไขแล้ว", color: "bg-green-500/20 text-green-400", icon: "😊" },
  closed_rejected: { label: "ปฏิเสธ", color: "bg-red-500/20 text-red-400", icon: "❌" },
  customer_no_response: { label: "ลูกค้าหาย", color: "bg-gray-500/20 text-gray-400", icon: "💤" },
};

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

  const fetchClaims = useCallback(async () => {
    try {
      const url = filter === "all" ? "/api/proxy/claims" : `/api/proxy/claims?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      setClaims(data.claims || []);
    } catch (e) {
      console.error("Failed to fetch claims:", e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchClaims(); const t = setInterval(fetchClaims, 30000); return () => clearInterval(t); }, [fetchClaims]);

  const statusInfo = (status: string) => CLAIM_STATUSES[status] || { label: status, color: "bg-gray-500/20 text-gray-400", icon: "❓" };

  const pendingReview = claims.filter(c => c.status === "info_collected");
  const activeClaims = claims.filter(c => !["closed_resolved", "closed_rejected", "customer_no_response"].includes(c.status));

  return (
    <div className="page-content p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold theme-text">ตรวจสอบเคลม</h1>
        <p className="theme-text-secondary text-sm">เคลมจาก FB/IG แชท — รูป + AI วิเคราะห์ + ข้อมูลลูกค้า</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-[var(--color-primary)]">{pendingReview.length}</div>
          <div className="text-xs theme-text-secondary">รอตรวจ</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{activeClaims.length}</div>
          <div className="text-xs theme-text-secondary">กำลังดำเนินการ</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{claims.filter(c => c.status === "closed_resolved").length}</div>
          <div className="text-xs theme-text-secondary">แก้ไขแล้ว</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{claims.filter(c => c.status === "closed_rejected").length}</div>
          <div className="text-xs theme-text-secondary">ปฏิเสธ</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { value: "all", label: "ทั้งหมด" },
          { value: "info_collected", label: "รอตรวจ" },
          { value: "photo_requested", label: "รอรูป" },
          { value: "closed_resolved", label: "แก้ไขแล้ว" },
        ].map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${filter === f.value ? "bg-[var(--color-primary)] text-white" : "glass-card theme-text-secondary"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 theme-text-secondary">กำลังโหลด...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Claims List */}
          <div className="space-y-3">
            {claims.map((claim) => (
              <div key={claim._id}
                onClick={() => setSelectedClaim(claim)}
                className={`glass-card p-4 cursor-pointer transition-all hover:bg-[var(--bg-hover)] ${selectedClaim?._id === claim._id ? "ring-2 ring-[var(--color-primary)]" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium theme-text">{claim.customerName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo(claim.status).color}`}>
                    {statusInfo(claim.status).icon} {statusInfo(claim.status).label}
                  </span>
                </div>
                <div className="text-sm theme-text-secondary">{claim.product || "ไม่ระบุสินค้า"}</div>
                {claim.symptoms && <div className="text-xs theme-text-muted mt-1">อาการ: {claim.symptoms}</div>}
                <div className="flex items-center gap-2 mt-2">
                  {claim.wpTicketNumber && <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] theme-text-secondary">{claim.wpTicketNumber}</span>}
                  <span className="text-xs theme-text-muted">{claim.photos?.length || 0} รูป</span>
                  <span className="text-xs theme-text-muted">{claim.platform === "facebook" ? "FB" : "IG"}</span>
                  <span className="text-xs theme-text-muted">{new Date(claim.createdAt).toLocaleDateString("th-TH")}</span>
                </div>
              </div>
            ))}
            {claims.length === 0 && (
              <div className="text-center py-12 theme-text-secondary">ไม่มีเคลม</div>
            )}
          </div>

          {/* Claim Detail Panel */}
          {selectedClaim && (
            <div className="glass-card p-5 space-y-4 sticky top-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold theme-text">{selectedClaim.customerName}</h2>
                <button onClick={() => setSelectedClaim(null)} className="theme-text-muted hover:theme-text">✕</button>
              </div>

              <div className={`px-3 py-2 rounded-lg text-sm ${statusInfo(selectedClaim.status).color}`}>
                {statusInfo(selectedClaim.status).icon} {statusInfo(selectedClaim.status).label}
                {selectedClaim.wpTicketNumber && <span className="ml-2 opacity-70">({selectedClaim.wpTicketNumber})</span>}
              </div>

              {/* Info */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="theme-text-secondary">สินค้า</span><span className="theme-text">{selectedClaim.product || "-"}</span></div>
                <div className="flex justify-between"><span className="theme-text-secondary">อาการ</span><span className="theme-text">{selectedClaim.symptoms || "-"}</span></div>
                <div className="flex justify-between"><span className="theme-text-secondary">ร้านที่ซื้อ</span><span className="theme-text">{selectedClaim.purchaseFrom || "-"}</span></div>
                <div className="flex justify-between"><span className="theme-text-secondary">เมื่อไหร่</span><span className="theme-text">{selectedClaim.purchaseDate || "-"}</span></div>
                <div className="flex justify-between"><span className="theme-text-secondary">เบอร์โทร</span><span className="theme-text">{selectedClaim.phone || "-"}</span></div>
                <div className="flex justify-between"><span className="theme-text-secondary">Platform</span><span className="theme-text">{selectedClaim.platform}</span></div>
              </div>

              {/* AI Analysis */}
              {selectedClaim.aiAnalysis && (
                <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <div className="text-xs font-medium text-purple-400 mb-1">AI วิเคราะห์ (Vision)</div>
                  <div className="text-sm theme-text whitespace-pre-wrap">{selectedClaim.aiAnalysis}</div>
                </div>
              )}

              {/* Photos */}
              {selectedClaim.photos && selectedClaim.photos.length > 0 && (
                <div>
                  <div className="text-xs font-medium theme-text-secondary mb-2">รูปภาพ ({selectedClaim.photos.length})</div>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedClaim.photos.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`Claim photo ${i + 1}`} className="w-full h-32 object-cover rounded-lg border border-[var(--border)]" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {selectedClaim.status === "info_collected" && (
                <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                  <div className="text-xs font-medium theme-text-secondary">ตัดสินใจ</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="px-3 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 transition-colors">
                      ส่งกลับเปลี่ยน (Case A)
                    </button>
                    <button className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors">
                      ส่งอะไหล่ (Case B)
                    </button>
                    <button className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 transition-colors col-span-2">
                      ปฏิเสธเคลม
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
