import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/collections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1. Initialize DB inside try block to catch init errors
    const adminDb = getAdminDb();
    if (!adminDb) {
      throw new Error("Firebase Admin SDK failed to initialize. Check environment variables.");
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
    // We use a static import now to help the compiler resolve dependencies during build
    if (!COLLECTIONS?.LEADS || !COLLECTIONS?.AGENTS) {
      throw new Error("Required collection constants (LEADS/AGENTS) are missing from @/lib/collections");
    }

    // 4. Fetch leads
    // Note: In a production dialer, you would filter by status (e.g., status == 'NEW')
    // to prevent multiple agents from getting the same lead.
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
    // Marking the agent as BUSY so they don't receive multiple leads
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
    // Comprehensive logging for Vercel Dashboard
    console.error("[/api/leads/next] Internal Error:", {
      message: err.message,
      stack: err.stack,
    });
    
    return NextResponse.json(
      { 
        error: "Internal Server Error", 
        message: err.message,
        // Only include details in dev or for debugging
        debug: process.env.NODE_ENV === 'development' ? err.stack : undefined
      },
      { status: 500 }
    );
  }
}
