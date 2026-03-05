import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/collections";

// Force Node.js runtime to handle the firebase-admin/fs/net requirements
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1. Initialize DB inside the handler
    const adminDb = getAdminDb();
    if (!adminDb) {
      throw new Error("Firebase Admin SDK failed to initialize.");
    }

    // 2. Parse and validate body
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

    // 3. Verify collections constants exist
    if (!COLLECTIONS || !COLLECTIONS.LEADS || !COLLECTIONS.AGENTS) {
      throw new Error("COLLECTIONS constants are missing or incorrectly exported.");
    }

    // 4. Fetch the next lead
    // Standard Dialer Logic: Limit 1, find the first available lead
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

    // 5. Update Agent record
    // Marking agent as BUSY to maintain dialer state
    await adminDb.collection(COLLECTIONS.AGENTS).doc(agentId).set({
      currentLeadId: leadDoc.id,
      lastAction: 'fetching_lead',
      lastSeen: new Date().toISOString(),
      status: 'BUSY'
    }, { merge: true });

    // 6. Return the lead
    return NextResponse.json({
      success: true,
      lead: {
        id: leadDoc.id,
        ...leadData,
      },
    });

  } catch (err: any) {
    // Log the error for Vercel console
    console.error("[/api/leads/next] Internal Error:", err.message);
    
    return NextResponse.json(
      { 
        error: "Internal Server Error", 
        message: err.message 
      },
      { status: 500 }
    );
  }
}
