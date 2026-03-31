import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const db = await getDB();
    const status = request.nextUrl.searchParams.get("status");

    const filter: Record<string, unknown> = {};
    if (status && status !== "all") filter.status = status;

    const leads = await db.collection("leads")
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();

    return NextResponse.json({ count: leads.length, leads });
  } catch (e) {
    console.error("[API/leads]", e);
    return NextResponse.json({ leads: [] }, { status: 500 });
  }
}
