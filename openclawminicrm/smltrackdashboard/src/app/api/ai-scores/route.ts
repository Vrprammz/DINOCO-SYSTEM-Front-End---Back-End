import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const AGENT_URL = process.env.AGENT_URL || "http://agent:3000";

export async function GET() {
  try {
    const res = await fetch(`${AGENT_URL}/api/ai-scores`, { signal: AbortSignal.timeout(10000) });
    if (res.ok) return NextResponse.json(await res.json());
    console.error("[api/ai-scores] agent returned non-ok:", res.status);
    return NextResponse.json(
      { error: "agent_unavailable", data: [] },
      { status: 503 }
    );
  } catch (e) {
    console.error("[api/ai-scores]", e);
    return NextResponse.json(
      { error: "agent_unavailable", data: [] },
      { status: 503 }
    );
  }
}
