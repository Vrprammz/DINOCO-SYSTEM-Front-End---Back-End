import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const agentUrl = () => process.env.AGENT_URL || "http://agent:3000";

export async function GET() {
  try {
    const res = await fetch(`${agentUrl()}/configs`, { next: { revalidate: 0 } });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("[api/bot-config]", e);
    return NextResponse.json(
      { error: "agent_unavailable", data: [] },
      { status: 503 }
    );
  }
}
