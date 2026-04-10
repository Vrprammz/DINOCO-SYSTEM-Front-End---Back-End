import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDB } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

// V.1.0 — Claims status update endpoint
// Uses MongoDB direct (matches existing claims/route.ts pattern)
// Supports Service Center 11 statuses + Case A/B + legacy closed_* statuses

const VALID_STATUSES = new Set([
  // Service Center 11 statuses (per CLAUDE.md)
  "pending",
  "reviewing",
  "approved",
  "in_progress",
  "waiting_parts",
  "repairing",
  "quality_check",
  "completed",
  "rejected",
  "cancelled",
  "closed",
  // DINOCO Case A/B extras
  "case_a",
  "case_b",
  // Legacy / existing manual_claims statuses
  "photo_requested",
  "photo_rejected",
  "photo_received",
  "info_collecting",
  "info_collected",
  "admin_reviewed",
  "waiting_return_shipment",
  "parts_shipping",
  "closed_resolved",
  "closed_rejected",
  "customer_no_response",
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { status, note } = body as { status?: string; note?: string };

    if (!status) {
      return NextResponse.json({ error: "status required" }, { status: 400 });
    }

    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { error: `Invalid status: ${status}` },
        { status: 400 }
      );
    }

    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid claim id" }, { status: 400 });
    }

    const db = await getDB();
    const claim = await db
      .collection("manual_claims")
      .findOne({ _id: objectId });

    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    const now = new Date();
    await db.collection("manual_claims").updateOne(
      { _id: objectId },
      {
        $set: { status, updatedAt: now },
        $push: {
          status_history: {
            from: claim.status,
            to: status,
            at: now,
            by: "admin_dashboard",
            note: note || null,
          },
        },
      } as never
    );

    console.log(
      `[claims/status] ${id}: ${claim.status} -> ${status}${note ? ` (${note})` : ""}`
    );

    return NextResponse.json({ ok: true, status });
  } catch (e) {
    console.error("[api/proxy/claims/status]", e);
    return NextResponse.json(
      { error: "Failed to update claim status" },
      { status: 500 }
    );
  }
}
