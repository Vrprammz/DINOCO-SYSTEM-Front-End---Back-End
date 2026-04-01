import { NextResponse } from "next/server";
import { getDB } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  try {
    const { sourceId } = await params;
    if (!sourceId) return NextResponse.json({ error: "sourceId required" }, { status: 400 });

    const db = await getDB();

    // ลบ messages ของห้องนี้
    const msgResult = await db.collection("messages").deleteMany({ sourceId });

    // ลบ AI memory
    await db.collection("ai_memory").deleteMany({ sourceId });

    // ลบ chat analytics
    await db.collection("chat_analytics").deleteMany({ sourceId });

    // ลบ skill lessons
    await db.collection("ai_skill_lessons").deleteMany({ sourceId });

    return NextResponse.json({
      ok: true,
      deleted: {
        messages: msgResult.deletedCount,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
