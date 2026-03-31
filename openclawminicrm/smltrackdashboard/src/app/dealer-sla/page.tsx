"use client";

import { useState, useEffect } from "react";

interface DealerSLA {
  _id: string;
  dealerName: string;
  totalLeads: number;
  contacted: number;
  noResponse: number;
  closed: number;
  satisfied: number;
  contactRate: number;
  satisfactionRate: number;
}

interface SLAReport {
  weekOf: string;
  report: DealerSLA[];
}

function gradeDealer(d: DealerSLA): { grade: string; color: string } {
  if (d.contactRate >= 0.9 && d.satisfactionRate >= 0.8) return { grade: "A", color: "text-green-400" };
  if (d.contactRate >= 0.7 && d.satisfactionRate >= 0.6) return { grade: "B", color: "text-blue-400" };
  if (d.contactRate >= 0.5) return { grade: "C", color: "text-yellow-400" };
  return { grade: "D", color: "text-red-400" };
}

export default function DealerSLAPage() {
  const [report, setReport] = useState<DealerSLA[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOf, setWeekOf] = useState<string>("");

  useEffect(() => {
    fetch("/api/proxy/dealer-sla")
      .then(res => res.json())
      .then(data => {
        if (data.report) {
          setReport(data.report);
          setWeekOf(data.weekOf || "");
        } else if (Array.isArray(data)) {
          setReport(data);
        }
      })
      .catch(e => console.error("Failed to fetch SLA:", e))
      .finally(() => setLoading(false));
  }, []);

  const sortedReport = [...report].sort((a, b) => b.totalLeads - a.totalLeads);
  const avgContactRate = report.length > 0 ? report.reduce((sum, d) => sum + d.contactRate, 0) / report.length : 0;
  const totalLeads = report.reduce((sum, d) => sum + d.totalLeads, 0);
  const totalNoResponse = report.reduce((sum, d) => sum + d.noResponse, 0);

  return (
    <div className="page-content p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold theme-text">Dealer SLA Scorecard</h1>
        <p className="theme-text-secondary text-sm">
          คะแนนตัวแทนจำหน่าย — การติดต่อลูกค้า + ความพึงพอใจ
          {weekOf && <span className="ml-2 text-xs">(สัปดาห์ {new Date(weekOf).toLocaleDateString("th-TH")})</span>}
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-[var(--color-primary)]">{report.length}</div>
          <div className="text-xs theme-text-secondary">ตัวแทนทั้งหมด</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold theme-text">{totalLeads}</div>
          <div className="text-xs theme-text-secondary">Leads ทั้งหมด</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{(avgContactRate * 100).toFixed(0)}%</div>
          <div className="text-xs theme-text-secondary">Contact Rate เฉลี่ย</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{totalNoResponse}</div>
          <div className="text-xs theme-text-secondary">ไม่ตอบ</div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 theme-text-secondary">กำลังโหลด...</div>
      ) : report.length === 0 ? (
        <div className="text-center py-12 theme-text-secondary">ยังไม่มี SLA report (จะสร้างอัตโนมัติทุกวันจันทร์)</div>
      ) : (
        /* Dealer Table */
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left p-3 theme-text-secondary font-medium">เกรด</th>
                <th className="text-left p-3 theme-text-secondary font-medium">ตัวแทน</th>
                <th className="text-center p-3 theme-text-secondary font-medium">Leads</th>
                <th className="text-center p-3 theme-text-secondary font-medium">ติดต่อ</th>
                <th className="text-center p-3 theme-text-secondary font-medium">ไม่ตอบ</th>
                <th className="text-center p-3 theme-text-secondary font-medium">Contact %</th>
                <th className="text-center p-3 theme-text-secondary font-medium">พอใจ %</th>
              </tr>
            </thead>
            <tbody>
              {sortedReport.map((dealer) => {
                const { grade, color } = gradeDealer(dealer);
                return (
                  <tr key={dealer._id} className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors">
                    <td className="p-3">
                      <span className={`text-xl font-bold ${color}`}>{grade}</span>
                    </td>
                    <td className="p-3 theme-text font-medium">{dealer.dealerName || dealer._id}</td>
                    <td className="p-3 text-center theme-text">{dealer.totalLeads}</td>
                    <td className="p-3 text-center text-green-400">{dealer.contacted}</td>
                    <td className="p-3 text-center text-red-400">{dealer.noResponse > 0 ? dealer.noResponse : "-"}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <div className="w-16 h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                          <div className="h-full rounded-full bg-green-500" style={{ width: `${dealer.contactRate * 100}%` }} />
                        </div>
                        <span className="text-xs theme-text-secondary">{(dealer.contactRate * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className="text-xs theme-text-secondary">{(dealer.satisfactionRate * 100).toFixed(0)}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
