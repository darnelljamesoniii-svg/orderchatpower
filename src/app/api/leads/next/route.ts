import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Use a localized DB instance to ensure environment variables are loaded
  const adminDb = getAdminDb();
  
  try {
    // 1. Parse and validate body
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const { agentId } = body;
    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    // 2. Resolve collections dynamically
    const { COLLECTIONS } = await import("@/lib/collections");
    if (!COLLECTIONS?.LEADS) {
      throw new Error("COLLECTIONS.LEADS is not defined in @/lib/collections");
    }

    // 3. Fetch leads
    // We limit to 1 to reduce overhead, but you could increase this if 
    // you implement "claimed" logic later.
    const leadsSnapshot = await adminDb
      .collection(COLLECTIONS.LEADS)
      .limit(1)
      .get();

    if (leadsSnapshot.empty) {
      return NextResponse.json({ 
        success: true, 
        lead: null, 
        message: "Queue empty" 
      });
    }

    const leadDoc = leadsSnapshot.docs[0];
    const leadData = leadDoc.data();

    // 4. Update Agent Status
    // We use merge: true so we don't accidentally wipe out other agent fields
    await adminDb.collection(COLLECTIONS.AGENTS).doc(agentId).set({
      currentLeadId: leadDoc.id,
      lastAction: 'fetching_lead',
      lastSeen: new Date().toISOString(),
      status: 'ACTIVE'
    }, { merge: true });

    // 5. Return the lead
    return NextResponse.json({
      success: true,
      lead: {
        id: leadDoc.id,
        ...leadData,
      },
    });

  } catch (err: any) {
    // This will show up in your Vercel logs (Dashboard > Logs)
    console.error("[/api/leads/next] CRITICAL ERROR:", err.message);
    
    return NextResponse.json(
      { 
        error: "Internal Server Error", 
        details: process.env.NODE_ENV === 'development' ? err.message : undefined 
      },
      { status: 500 }
    );
  }
}
