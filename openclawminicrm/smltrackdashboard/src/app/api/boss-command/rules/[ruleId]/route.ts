import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const AGENT_URL = process.env.AGENT_URL || "http://localhost:3000";
const AGENT_AUTH = process.env.API_SECRET_KEY || process.env.AGENT_API_KEY || process.env.OPENCLAW_GATEWAY_TOKEN || "";

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (AGENT_AUTH) headers["Authorization"] = `Bearer ${AGENT_AUTH}`;
  return headers;
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  try {
    const { ruleId } = await params;
    const res = await fetch(`${AGENT_URL}/api/boss-command/rules/${ruleId}`, {
      method: "DELETE",
      headers: getHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  try {
    const { ruleId } = await params;
    const body = await request.json();
    const res = await fetch(`${AGENT_URL}/api/boss-command/rules/${ruleId}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
