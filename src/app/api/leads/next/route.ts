import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1) Init Admin
    const adminDb = getAdminDb();
    if (!adminDb) {
      throw new Error("Firebase Admin SDK failed to initialize. Check environment variables.");
    }

    // 2) Parse + validate body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const { agentId } = body ?? {};
    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    // 3) Collections (kept)
    const { COLLECTIONS } = await import("@/lib/collections");
    if (!COLLECTIONS?.LEADS || !COLLECTIONS?.AGENTS) {
      throw new Error("Required collection constants (LEADS/AGENTS) are missing from @/lib/collections");
    }

    // 4) Use the real queue engine (THIS is the fix)
    const { getNextLead } = await import("@/lib/queue-engine");
    const result = await getNextLead(agentId); // { lead, queueDepth, message? }

    // 5) Update agent (kept, but only if we actually got a lead)
    if (result?.lead?.id) {
      await adminDb.collection(COLLECTIONS.AGENTS).doc(agentId).set(
        {
          currentLeadId: result.lead.id,
          lastAction: "fetching_lead",
          lastSeen: new Date().toISOString(),
          status: "BUSY",
        },
        { merge: true }
      );
    } else {
      // No lead available → agent can be considered idle/available
      await adminDb.collection(COLLECTIONS.AGENTS).doc(agentId).set(
        {
          currentLeadId: null,
          lastAction: "queue_empty",
          lastSeen: new Date().toISOString(),
          status: "AVAILABLE",
        },
        { merge: true }
      );
    }

    // 6) Return
    return NextResponse.json({
      success: true,
      lead: result.lead ?? null,
      queueDepth: result.queueDepth ?? 0,
      message: result.message ?? (result.lead ? "OK" : "Queue empty"),
    });
  } catch (err: any) {
    console.error("[/api/leads/next] Internal Error:", {
      message: err?.message,
      stack: err?.stack,
      code: err?.code,
    });

    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: err?.message ?? "Unknown error",
        debug: process.env.NODE_ENV === "development" ? err?.stack : undefined,
      },
      { status: 500 }
    );
  }
}
