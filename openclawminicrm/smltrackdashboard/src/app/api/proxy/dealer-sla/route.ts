import { NextResponse } from "next/server";
import { getDB } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDB();

    // ดึง SLA report ล่าสุด
    const latestReport = await db.collection("dealer_sla_reports")
      .findOne({}, { sort: { weekOf: -1 } });

    if (latestReport) {
      return NextResponse.json({
        weekOf: latestReport.weekOf,
        report: latestReport.report || [],
      });
    }

    // ถ้ายังไม่มี report → aggregate จาก leads สดๆ (7 วันล่าสุด)
    const now = new Date();
    const pipeline = [
      { $match: { createdAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } } },
      { $group: {
        _id: "$dealerId",
        dealerName: { $first: "$dealerName" },
        totalLeads: { $sum: 1 },
        contacted: { $sum: { $cond: [{ $in: ["$status", ["dealer_contacted", "waiting_order", "order_placed", "waiting_delivery", "delivered", "installed", "closed_satisfied"]] }, 1, 0] } },
        noResponse: { $sum: { $cond: [{ $eq: ["$status", "dealer_no_response"] }, 1, 0] } },
        closed: { $sum: { $cond: [{ $in: ["$status", ["closed_satisfied", "closed_lost", "closed_cancelled"]] }, 1, 0] } },
        satisfied: { $sum: { $cond: [{ $eq: ["$status", "closed_satisfied"] }, 1, 0] } },
      }},
      { $addFields: {
        contactRate: { $cond: [{ $gt: ["$totalLeads", 0] }, { $divide: ["$contacted", "$totalLeads"] }, 0] },
        satisfactionRate: { $cond: [{ $gt: ["$closed", 0] }, { $divide: ["$satisfied", "$closed"] }, 0] },
      }},
      { $sort: { totalLeads: -1 } },
    ];

    const report = await db.collection("leads").aggregate(pipeline).toArray();
    return NextResponse.json({ weekOf: now.toISOString(), report });
  } catch (e) {
    console.error("[API/dealer-sla]", e);
    return NextResponse.json(
      { error: "database_unavailable", report: [] },
      { status: 503 }
    );
  }
}
