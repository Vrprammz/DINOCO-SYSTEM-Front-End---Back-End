import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const AGENT_URL = process.env.AGENT_URL || "http://agent:3000";

export async function GET(req: NextRequest) {
  const isStory = req.nextUrl.searchParams.get("story") === "1";

  if (isStory) {
    // ดึงนิทานสั้น
    try {
      const res = await fetch(`${AGENT_URL}/api/ceo-stories`, { signal: AbortSignal.timeout(20000) });
      if (res.ok) return NextResponse.json(await res.json());
      console.error("[api/ceo-review] stories agent returned non-ok:", res.status);
    } catch (e) {
      console.error("[api/ceo-review] stories", e);
    }
    return NextResponse.json(
      { error: "agent_unavailable", stories: [] },
      { status: 503 }
    );
  }

  // ดึง plan ปกติ
  try {
    const res = await fetch(`${AGENT_URL}/api/ceo-plan`, { signal: AbortSignal.timeout(25000) });
    if (res.ok) return NextResponse.json(await res.json());
    console.error("[api/ceo-review] plan agent returned non-ok:", res.status);
  } catch (e) {
    console.error("[api/ceo-review] plan", e);
  }
  return NextResponse.json(
    { error: "agent_unavailable" },
    { status: 503 }
  );
}
