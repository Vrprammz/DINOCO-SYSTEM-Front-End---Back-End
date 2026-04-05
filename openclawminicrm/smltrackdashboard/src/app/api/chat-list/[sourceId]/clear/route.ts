import { NextResponse } from "next/server";
import { getDB } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

const AGENT_URL = process.env.AGENT_URL || "http://agent:3000";
const AGENT_AUTH = process.env.API_SECRET_KEY || process.env.AGENT_API_KEY || "";

export async function POST(_req: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  try {
    const { sourceId } = await params;
    if (!sourceId) return NextResponse.json({ error: "sourceId required" }, { status: 400 });

    const db = await getDB();
    const results: Record<string, number | boolean> = {};

    // 1. ลบ messages (conversation history)
    results.messages = (await db.collection("messages").deleteMany({ sourceId })).deletedCount;

    // 2. ลบ AI memory (compactSummary, personality, interests)
    results.ai_memory = (await db.collection("ai_memory").deleteMany({ sourceId })).deletedCount;

    // 3. ลบ chat analytics
    results.chat_analytics = (await db.collection("chat_analytics").deleteMany({ sourceId })).deletedCount;

    // 4. ลบ skill lessons ของ sourceId
    results.skill_lessons = (await db.collection("ai_skill_lessons").deleteMany({ sourceId })).deletedCount;

    // 5. ลบ active claim sessions — ไม่งั้น AI จะ resume claim flow เก่า
    results.manual_claims = (await db.collection("manual_claims").deleteMany({ sourceId })).deletedCount;

    // 6. ลบ leads ของ sourceId
    results.leads = (await db.collection("leads").deleteMany({ sourceId })).deletedCount;

    // 7. เรียก Agent API เพื่อ clear in-memory state (pendingAutoReply etc.)
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (AGENT_AUTH) headers["Authorization"] = `Bearer ${AGENT_AUTH}`;
      const agentRes = await fetch(`${AGENT_URL}/api/clear-memory/${encodeURIComponent(sourceId)}`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (agentRes.ok) {
        results.agent_cleared = true;
      }
    } catch {
      // Agent อาจไม่ available (dev mode) — ลบจาก MongoDB ก็พอ
      results.agent_cleared = false;
    }

    return NextResponse.json({ ok: true, deleted: results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
