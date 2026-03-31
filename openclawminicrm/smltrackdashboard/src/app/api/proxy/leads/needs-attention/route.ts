import { NextResponse } from "next/server";
import { getDB } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDB();
    const now = new Date();

    const leads = await db.collection("leads").find({
      closedAt: null,
      status: { $in: ["dealer_no_response", "admin_escalated", "checking_contact"] },
      updatedAt: { $lt: new Date(now.getTime() - 4 * 60 * 60 * 1000) }, // > 4hr old
    }).sort({ updatedAt: 1 }).limit(20).toArray();

    return NextResponse.json({ count: leads.length, leads });
  } catch (e) {
    console.error("[API/leads/needs-attention]", e);
    return NextResponse.json({ leads: [] }, { status: 500 });
  }
}
