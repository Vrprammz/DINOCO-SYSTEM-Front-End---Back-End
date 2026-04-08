import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDB();

    const leads = await db.collection("leads")
      .find({ dealerId: id })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return NextResponse.json({ ok: true, count: leads.length, leads });
  } catch (e) {
    console.error("[API/dealers/:id/leads]", e);
    return NextResponse.json({ ok: false, leads: [] }, { status: 500 });
  }
}
