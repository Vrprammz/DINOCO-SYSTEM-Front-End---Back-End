import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const db = await getDB();
    const status = request.nextUrl.searchParams.get("status");

    const filter: Record<string, unknown> = {};
    if (status && status !== "all") filter.status = status;

    const claims = await db.collection("manual_claims")
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({ count: claims.length, claims });
  } catch (e) {
    console.error("[API/claims]", e);
    return NextResponse.json(
      { error: "database_unavailable", claims: [] },
      { status: 503 }
    );
  }
}
