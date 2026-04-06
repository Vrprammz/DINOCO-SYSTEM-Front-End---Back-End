import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const agentUrl = () => process.env.AGENT_URL || "http://agent:3000";

// Proxy all /api/train/* requests to Agent
async function proxyToAgent(
  request: NextRequest,
  method: string,
  action: string[]
) {
  const path = action.join("/");
  const url = `${agentUrl()}/api/train/${path}`;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const opts: RequestInit = { method, headers };

    if (method !== "GET" && method !== "DELETE") {
      const body = await request.json().catch(() => ({}));
      opts.body = JSON.stringify(body);
    }

    // Forward query params for GET
    if (method === "GET") {
      const searchParams = request.nextUrl.searchParams.toString();
      const fullUrl = searchParams ? `${url}?${searchParams}` : url;
      const res = await fetch(fullUrl, opts);
      return NextResponse.json(await res.json(), { status: res.status });
    }

    const res = await fetch(url, opts);
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
