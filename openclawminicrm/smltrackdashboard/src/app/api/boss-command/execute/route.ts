import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const AGENT_URL = process.env.AGENT_URL || "http://localhost:3000";
const AGENT_AUTH = process.env.API_SECRET_KEY || process.env.AGENT_API_KEY || process.env.OPENCLAW_GATEWAY_TOKEN || "";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (AGENT_AUTH) headers["Authorization"] = `Bearer ${AGENT_AUTH}`;

    const res = await fetch(`${AGENT_URL}/api/boss-command/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
