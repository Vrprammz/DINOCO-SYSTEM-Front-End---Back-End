import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const db = await getDB();
    const params = request.nextUrl.searchParams;
    const search = params.get("search") || "";
    const province = params.get("province") || "";
    const rank = params.get("rank") || "";
    const active = params.get("active");
    const limit = Math.min(parseInt(params.get("limit") || "50"), 200);
    const skip = parseInt(params.get("skip") || "0");

    const filter: Record<string, unknown> = {};
    if (active !== null && active !== "all") {
      filter.active = active !== "false";
    } else if (active === null) {
      filter.active = true;
    }
    if (province) {
      filter.province = { $regex: province.replace(/จ\.|จังหวัด/g, "").trim(), $options: "i" };
    }
    if (rank) filter.rank = rank;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { province: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const [dealers, total] = await Promise.all([
      db.collection("dealers").find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      db.collection("dealers").countDocuments(filter),
    ]);

    // Aggregate lead stats per dealer
    const dealerIds = dealers.map(d => String(d._id));
    const leadStats: Record<string, { total: number; active: number; noResponse: number; contactRate: number }> = {};
    if (dealerIds.length > 0) {
      const pipeline = [
        { $match: { dealerId: { $in: dealerIds } } },
        { $group: {
          _id: "$dealerId",
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $not: [{ $in: ["$status", ["closed_satisfied", "closed_lost", "closed_cancelled", "closed_won", "dormant"]] }] }, 1, 0] } },
          noResponse: { $sum: { $cond: [{ $eq: ["$status", "dealer_no_response"] }, 1, 0] } },
          contacted: { $sum: { $cond: [{ $in: ["$status", ["dealer_contacted", "waiting_order", "order_placed", "waiting_delivery", "delivered", "installed", "closed_satisfied", "closed_won"]] }, 1, 0] } },
        }},
      ];
      const stats = await db.collection("leads").aggregate(pipeline).toArray();
      for (const s of stats) {
        leadStats[s._id] = {
          total: s.total, active: s.active, noResponse: s.noResponse,
          contactRate: s.total > 0 ? s.contacted / s.total : 0,
        };
      }
    }

    const enriched = dealers.map(d => ({
      ...d,
      leadStats: leadStats[String(d._id)] || { total: 0, active: 0, noResponse: 0, contactRate: 0 },
    }));

    return NextResponse.json({ ok: true, count: enriched.length, total, dealers: enriched });
  } catch (e) {
    console.error("[API/dealers]", e);
    return NextResponse.json({ ok: false, dealers: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await getDB();
    const body = await request.json();
    const { name, province } = body;

    if (!name || !province || name.trim().length < 2 || province.trim().length < 2) {
      return NextResponse.json({ ok: false, error: "ชื่อร้านและจังหวัดจำเป็น" }, { status: 400 });
    }

    const dealer = {
      wp_id: null,
      name: name.trim(),
      ownerName: (body.ownerName || "").trim(),
      phone: (body.phone || "").trim(),
      province: province.trim(),
      district: (body.district || "").trim(),
      address: (body.address || "").trim(),
      postcode: (body.postcode || "").trim(),
      coverageAreas: Array.isArray(body.coverageAreas)
        ? body.coverageAreas
        : (body.coverageAreas || "").split(",").map((s: string) => s.trim()).filter(Boolean),
      lineGroupId: (body.lineGroupId || "").trim() || null,
      ownerLineUid: (body.ownerLineUid || "").trim() || null,
      rank: body.rank || "Standard",
      isWalkin: !!body.isWalkin,
      active: true,
      notes: (body.notes || "").trim(),
      importedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("dealers").insertOne(dealer);
    return NextResponse.json({ ok: true, dealer: { ...dealer, _id: result.insertedId } }, { status: 201 });
  } catch (e) {
    console.error("[API/dealers POST]", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
