import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const AGENT_URL = process.env.AGENT_URL || "http://agent:3000";
const AGENT_AUTH = process.env.AGENT_AUTH_TOKEN || process.env.MCP_ERP_API_KEY || "";

export async function POST() {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (AGENT_AUTH) headers["Authorization"] = `Bearer ${AGENT_AUTH}`;

    const res = await fetch(`${AGENT_URL}/api/dealers/import`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[API/dealers/import]", e);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถเชื่อมต่อ Agent ได้" },
      { status: 502 }
    );
  }
}
