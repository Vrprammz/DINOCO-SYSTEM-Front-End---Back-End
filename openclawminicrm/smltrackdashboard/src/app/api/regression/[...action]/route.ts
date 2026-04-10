import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const agentUrl = () => process.env.AGENT_URL || "http://dinoco-agent:3000";

// Proxy all /api/regression/* requests to Agent
// SEC-C1: session check — ต้อง login ก่อนถึงจะเข้า API ได้
// (เดิม proxy แปะ API_SECRET_KEY ให้ทุก request → ใครก็ยิงได้)
async function proxyToAgent(
  request: NextRequest,
  method: string,
  action: string[]
) {
  // ★ Session check (SEC-C1)
  const authUser = await getAuthUser();
  if (!authUser?.email) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const path = action.join("/");
  const url = `${agentUrl()}/api/regression/${path}`;

  try {
    const apiKey =
      process.env.API_SECRET_KEY ||
      process.env.AGENT_API_KEY ||
      "dnc-api-2026-supersecret-changethis";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    };
    // running scenarios can take minutes → allow longer timeout
    const isLongRunning = path === "run" || path === "auto-mine";
    const opts: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(isLongRunning ? 600000 : 30000),
    };

    if (method !== "GET" && method !== "DELETE") {
      const body = await request.json().catch(() => ({}));
      opts.body = JSON.stringify(body);
    }

    if (method === "GET") {
      const searchParams = request.nextUrl.searchParams.toString();
      const fullUrl = searchParams ? `${url}?${searchParams}` : url;
      const res = await fetch(fullUrl, opts);
      const data = await res.json().catch(() => ({ error: "Invalid response" }));
      const status = res.status === 401 ? 403 : res.status;
      return NextResponse.json(data, { status });
    }

    if (method === "DELETE") {
      const searchParams = request.nextUrl.searchParams.toString();
      const fullUrl = searchParams ? `${url}?${searchParams}` : url;
      const res = await fetch(fullUrl, opts);
      const data = await res.json().catch(() => ({ error: "Invalid response" }));
      const status = res.status === 401 ? 403 : res.status;
      return NextResponse.json(data, { status });
    }

    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({ error: "Invalid response" }));
    const status = res.status === 401 ? 403 : res.status;
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    const msg =
      e.name === "TimeoutError"
        ? "กำลังรันเทสอยู่ รอสักครู่..."
        : e.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string[] }> }
) {
  const { action } = await params;
  return proxyToAgent(request, "GET", action);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string[] }> }
) {
  const { action } = await params;
  return proxyToAgent(request, "POST", action);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ action: string[] }> }
) {
  const { action } = await params;
  return proxyToAgent(request, "PATCH", action);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ action: string[] }> }
) {
  const { action } = await params;
  return proxyToAgent(request, "DELETE", action);
}
