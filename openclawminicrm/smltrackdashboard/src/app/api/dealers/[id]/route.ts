import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findDealer(db: any, id: string) {
  const dealersCol = db.collection("dealers");
  try {
    return await dealersCol.findOne({ _id: new ObjectId(id) });
  } catch {
    // Fallback: try wp_id
    const wpId = parseInt(id, 10);
    if (!isNaN(wpId)) return await dealersCol.findOne({ wp_id: wpId });
    return null;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDB();
    const dealer = await findDealer(db, id);
    if (!dealer) return NextResponse.json({ ok: false, error: "ไม่พบตัวแทน" }, { status: 404 });

    // Get leads for this dealer
    const leads = await db.collection("leads")
      .find({ dealerId: String(dealer._id) })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    // SLA calculation (30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const slaLeads = leads.filter(l => new Date(l.createdAt) >= thirtyDaysAgo);
    const totalLeads = slaLeads.length;
    const contacted = slaLeads.filter(l =>
      ["dealer_contacted", "waiting_order", "order_placed", "waiting_delivery", "delivered", "installed", "closed_satisfied", "closed_won"].includes(l.status)
    ).length;
    const noResponse = slaLeads.filter(l => l.status === "dealer_no_response").length;
    const closed = slaLeads.filter(l => ["closed_satisfied", "closed_lost", "closed_cancelled", "closed_won"].includes(l.status)).length;
    const satisfied = slaLeads.filter(l => l.status === "closed_satisfied" || l.status === "closed_won").length;
    const contactRate = totalLeads > 0 ? contacted / totalLeads : 0;
    const satisfactionRate = closed > 0 ? satisfied / closed : 0;
    let grade = "A";
    if (contactRate < 0.5) grade = "D";
    else if (contactRate < 0.7) grade = "C";
    else if (contactRate < 0.85) grade = "B";

    return NextResponse.json({
      ok: true, dealer, leads,
      sla: { totalLeads, contacted, noResponse, closed, satisfied, contactRate, satisfactionRate, grade },
    });
  } catch (e) {
    console.error("[API/dealers/:id]", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDB();
    let dealerId: ObjectId;
    try { dealerId = new ObjectId(id); } catch { return NextResponse.json({ ok: false, error: "Invalid ID" }, { status: 400 }); }

    const body = await request.json();
    const allowedFields = ["name", "ownerName", "phone", "province", "district", "address", "postcode", "coverageAreas", "lineGroupId", "ownerLineUid", "rank", "isWalkin", "active", "notes"];
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        if (key === "coverageAreas" && typeof body[key] === "string") {
          update[key] = body[key].split(",").map((s: string) => s.trim()).filter(Boolean);
        } else {
          update[key] = body[key];
        }
      }
    }

    const result = await db.collection("dealers").findOneAndUpdate(
      { _id: dealerId },
      { $set: update },
      { returnDocument: "after" }
    );
    if (!result) return NextResponse.json({ ok: false, error: "ไม่พบตัวแทน" }, { status: 404 });
    return NextResponse.json({ ok: true, dealer: result });
  } catch (e) {
    console.error("[API/dealers PATCH]", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDB();
    let dealerId: ObjectId;
    try { dealerId = new ObjectId(id); } catch { return NextResponse.json({ ok: false, error: "Invalid ID" }, { status: 400 }); }

    const result = await db.collection("dealers").findOneAndUpdate(
      { _id: dealerId },
      { $set: { active: false, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    if (!result) return NextResponse.json({ ok: false, error: "ไม่พบตัวแทน" }, { status: 404 });
    return NextResponse.json({ ok: true, message: "ปิดใช้งานตัวแทนแล้ว" });
  } catch (e) {
    console.error("[API/dealers DELETE]", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
