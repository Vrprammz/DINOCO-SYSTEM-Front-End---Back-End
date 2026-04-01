import { NextResponse } from "next/server";
import { getDB } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent-command/status
 * ดึงสถานะ agent ทั้งหมดจาก MongoDB (agent_runs collection)
 * + อ่าน cron jobs state จาก Agent proxy
 */

const AGENT_URL = process.env.AGENT_URL || "http://localhost:3000";
const AGENT_AUTH = process.env.AGENT_API_KEY || process.env.OPENCLAW_GATEWAY_TOKEN || "";

export async function GET() {
  try {
    const db = await getDB();

    // 1. ดึง agent_runs ล่าสุดจาก MongoDB (last run results)
    const runs = await db
      .collection("agent_runs")
      .find({})
      .sort({ lastRunAt: -1 })
      .limit(100)
      .toArray();

    // 2. ดึง ai_costs สรุปจำนวน calls ต่อ feature (วันนี้)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const costsByFeature = await db
      .collection("ai_costs")
      .aggregate([
        { $match: { createdAt: { $gte: todayStart } } },
        {
          $group: {
            _id: "$feature",
            calls: { $sum: 1 },
            tokens: { $sum: "$totalTokens" },
            lastCall: { $max: "$createdAt" },
          },
        },
      ])
      .toArray();

    // 3. ดึง cron job states จาก Agent proxy
    let cronJobs: any[] = [];
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (AGENT_AUTH) headers["Authorization"] = `Bearer ${AGENT_AUTH}`;
      const cronRes = await fetch(`${AGENT_URL}/api/agent-jobs`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (cronRes.ok) {
        const data = await cronRes.json();
        cronJobs = data.jobs || [];
      }
    } catch {
      // proxy อาจไม่พร้อม — ไม่เป็นไร
    }

    // 4. Build status map
    const runMap: Record<string, any> = {};
    for (const run of runs) {
      if (run.agentId && !runMap[run.agentId]) {
        runMap[run.agentId] = {
          lastRunAt: run.lastRunAt,
          status: run.status || "unknown",
          processed: run.processed || 0,
          error: run.error || null,
          nextRunAt: run.nextRunAt || null,
          schedule: run.schedule || null,
        };
      }
    }

    // 5. Build cost map
    const costMap: Record<string, { calls: number; tokens: number; lastCall: Date }> = {};
    for (const c of costsByFeature) {
      if (c._id) costMap[c._id] = { calls: c.calls, tokens: c.tokens, lastCall: c.lastCall };
    }

    return NextResponse.json({
      agents: runMap,
      costs: costMap,
      cronJobs,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/agent-command/status
 * สั่ง trigger agent ทันที
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agentId, cronType } = body;

    if (!agentId) {
      return NextResponse.json({ error: "agentId required" }, { status: 400 });
    }

    // ถ้าเป็น mayom agent → เรียก /api/leads/cron/:type
    if (cronType) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (AGENT_AUTH) headers["Authorization"] = `Bearer ${AGENT_AUTH}`;

      const res = await fetch(`${AGENT_URL}/api/leads/cron/${cronType}`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();

      // บันทึก run result
      const db = await getDB();
      await db.collection("agent_runs").updateOne(
        { agentId },
        {
          $set: {
            agentId,
            lastRunAt: new Date(),
            status: data.ok ? "success" : "error",
            processed: data.processed || 0,
            error: data.error || null,
            triggeredBy: "manual",
          },
        },
        { upsert: true }
      );

      return NextResponse.json({ ok: true, result: data });
    }

    // Advisor agents — บันทึกว่า trigger แล้ว (ไม่มี cron endpoint จริง)
    const db = await getDB();
    await db.collection("agent_runs").updateOne(
      { agentId },
      {
        $set: {
          agentId,
          lastRunAt: new Date(),
          status: "triggered",
          triggeredBy: "manual",
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ ok: true, message: `Agent ${agentId} triggered` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
